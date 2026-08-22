#!/usr/bin/env node
// Project the Claude Code config layer onto Codex CLI.
//
// .claude/* stays the source of truth. This script produces the Codex-side
// view of it:
//   .codex/agents/*.toml      generated from .claude/agents/*.md
//   .agents/skills/<n>        symlink to .claude/skills/<n>   (same SKILL.md format)
//   .agents/skills/<cmd>      stub pointing at .claude/commands/<cmd>.md
//   .codex/config.toml        template + [mcp_servers.*] generated from .mcp.json
//
// Idempotent — safe to re-run. Real files are never overwritten by a symlink;
// they are reported as overrides and left alone.
//
// Helpers are INLINED (NOT imported from ui/server) so this script has no side
// effects from the live backend — same rule as scripts/migrate-repo-links.js.
//
// Usage:
//   node scripts/sync-codex.js
//   node scripts/sync-codex.js --link-repos   # also link into registered target repos

import {
  readdir,
  readFile,
  writeFile,
  mkdir,
  lstat,
  readlink,
  symlink,
  unlink,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE = path.resolve(__dirname, "..");

// ─── Config ─────────────────────────────────────────────────────────────────

// Every agent runs on the flagship, mirroring the all-opus Claude setup.
const CODEX_MODEL = "gpt-5.6-sol";

// Claude effort levels map 1:1 onto Codex reasoning effort.
const VALID_EFFORTS = ["low", "medium", "high", "xhigh", "max"];
const DEFAULT_EFFORT = "medium";

// Agents that only read. Everything else needs to write into the target repo.
const READ_ONLY_AGENTS = new Set([
  "reviewer",
  "researcher",
  "brainstorm",
  "investigator",
  "room-designer",
  "prompt-enhancer",
]);

const MCP_FENCE_START = "# >>> generated: mcp servers >>>";
const MCP_FENCE_END = "# <<< generated: mcp servers <<<";

const CODEX_PREAMBLE = `> Runtime note — you are running under Codex, not Claude Code.
> Where these instructions mention the \`Agent()\` tool, spawn a subagent by
> asking for it directly by name and waiting for its result. Where they mention
> \`.claude/agents\` read \`.codex/agents\`, and for \`.claude/skills\` read
> \`.agents/skills\`. There are no Agent Teams and no \`SendMessage\` here —
> coordinate through files under \`tasks/\`. See AGENTS.md for the full mapping.`;

// Codex spends at most 2% of the context window on the skill list, falling
// back to 8000 characters when the window is unknown, and shortens
// descriptions once that fills. 8000 is the conservative floor to stay under.
const SKILL_LIST_BUDGET = 8000;

// Codex project instruction discovery defaults to 32 KiB of combined project
// docs. Keep the root docs below that floor so critical workflow guidance does
// not disappear as the file grows.
const PROJECT_DOC_BUDGET = 32 * 1024;
const PROJECT_DOC_WARN_RATIO = 0.85;

// ─── Small helpers ──────────────────────────────────────────────────────────

async function lstatSafe(p) {
  try {
    return await lstat(p);
  } catch {
    return null;
  }
}

async function readJsonSafe(absPath) {
  try {
    return JSON.parse(await readFile(absPath, "utf8"));
  } catch {
    return null;
  }
}

// Joins the lines of a YAML block scalar. Folded (`>`) collapses the wrapped
// lines back onto one line and turns a blank line into a break; literal (`|`)
// keeps every break as written. The result is trimmed rather than chomped —
// every consumer here wants a metadata string, not a document, so a trailing
// newline would only leak into the generated TOML.
function joinBlockScalar(lines, style) {
  const first = lines.find((l) => l.trim() !== "");
  const indent = first ? first.match(/^[ \t]*/)[0].length : 0;
  const text = lines.map((l) => l.slice(indent));
  if (style === "|") return text.join("\n").trim();
  let out = "";
  for (const line of text) {
    if (line.trim() === "") out += "\n";
    else out += out === "" || out.endsWith("\n") ? line.trim() : ` ${line.trim()}`;
  }
  return out.trim();
}

// Minimal frontmatter reader. Values are either a flat `key: value` scalar or a
// YAML block scalar (`>`, `>-`, `|`, `|-`, and the `+` variants) — the long
// agent descriptions use the folded form to wrap across lines, and reading the
// indicator as the value is how they used to reach Codex as a literal ">-".
// Anything richer, such as a nested map or a flow collection, is still skipped.
function parseFrontmatter(raw) {
  if (!raw.startsWith("---\n")) return { data: {}, body: raw };
  const end = raw.indexOf("\n---", 3);
  if (end === -1) return { data: {}, body: raw };
  const block = raw.slice(4, end);
  const body = raw.slice(end + 4).replace(/^\n+/, "");
  const data = {};
  const lines = block.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!m) continue;
    let value = m[2].trim();
    const indicator = value.match(/^([|>])[0-9+-]*$/);
    if (indicator) {
      // Consume the indented continuation lines, plus any blank line inside.
      const chunk = [];
      while (i + 1 < lines.length) {
        const next = lines[i + 1];
        if (next.trim() !== "" && !/^[ \t]/.test(next)) break;
        chunk.push(next);
        i++;
      }
      value = joinBlockScalar(chunk, indicator[1]);
    } else if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    data[m[1]] = value;
  }
  return { data, body };
}

// A double-quoted YAML scalar. Unquoted values break on ": ", "#", leading
// "-", and more — quoting unconditionally sidesteps the whole class.
function yamlQuote(value) {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function tomlBasicString(value) {
  return `"${String(value)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t")}"`;
}

// Prefer a literal multi-line string so markdown bodies (backslashes, quotes,
// code fences) survive verbatim. Fall back to a basic multi-line string when
// the body would break the literal form.
function tomlMultiline(value) {
  const text = String(value);
  if (!text.includes("'''") && !text.endsWith("'")) {
    return `'''\n${text}\n'''`;
  }
  const escaped = text
    .replace(/\\/g, "\\\\")
    .replace(/"""/g, '\\"\\"\\"')
    .replace(/"$/, '\\"');
  return `"""\n${escaped}\n"""`;
}

// ─── (a) .claude/agents/*.md → .codex/agents/*.toml ─────────────────────────

async function generateAgents() {
  const srcDir = path.join(WORKSPACE, ".claude", "agents");
  const outDir = path.join(WORKSPACE, ".codex", "agents");
  await mkdir(outDir, { recursive: true });

  const result = { written: 0, unchanged: 0, skipped: [], removed: 0 };
  let entries = [];
  try {
    entries = await readdir(srcDir, { withFileTypes: true });
  } catch {
    return result;
  }

  const generated = new Set();

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const srcPath = path.join(srcDir, entry.name);
    const raw = await readFile(srcPath, "utf8");
    const { data, body } = parseFrontmatter(raw);

    const name = data.name || entry.name.replace(/\.md$/, "");
    if (!data.description) {
      result.skipped.push(`${entry.name} (no description in frontmatter)`);
      continue;
    }
    // A bare block-scalar indicator means the reader failed to follow the
    // continuation lines. Codex picks agents by description, so shipping ">-"
    // makes the agent invisible there — refuse instead of writing it out.
    if (/^[|>][0-9+-]*$/.test(data.description)) {
      result.skipped.push(
        `${entry.name} (description parsed as the block-scalar indicator "${data.description}")`,
      );
      continue;
    }

    const effort = VALID_EFFORTS.includes(data.effort)
      ? data.effort
      : DEFAULT_EFFORT;
    const sandbox = READ_ONLY_AGENTS.has(name) ? "read-only" : "workspace-write";
    const instructions = `${CODEX_PREAMBLE}\n\n${body.trim()}`;

    const toml =
      `# GENERATED by scripts/sync-codex.js from .claude/agents/${entry.name} — do not edit.\n` +
      `# Edit the source file, then re-run: node scripts/sync-codex.js\n\n` +
      `name = ${tomlBasicString(name)}\n` +
      `description = ${tomlBasicString(data.description)}\n` +
      `model = ${tomlBasicString(CODEX_MODEL)}\n` +
      `model_reasoning_effort = ${tomlBasicString(effort)}\n` +
      `sandbox_mode = ${tomlBasicString(sandbox)}\n\n` +
      `developer_instructions = ${tomlMultiline(instructions)}\n`;

    const outPath = path.join(outDir, `${name}.toml`);
    generated.add(`${name}.toml`);
    const existing = await readFile(outPath, "utf8").catch(() => null);
    if (existing === toml) {
      result.unchanged++;
    } else {
      await writeFile(outPath, toml, "utf8");
      result.written++;
    }
  }

  // Drop generated files whose source agent is gone. Hand-written .toml files
  // (no generated header) are left alone.
  for (const name of await readdir(outDir).catch(() => [])) {
    if (!name.endsWith(".toml") || generated.has(name)) continue;
    const content = await readFile(path.join(outDir, name), "utf8").catch(
      () => "",
    );
    if (content.startsWith("# GENERATED by scripts/sync-codex.js")) {
      await unlink(path.join(outDir, name));
      result.removed++;
    }
  }

  return result;
}

// ─── (b) .claude/skills/<n> → .agents/skills/<n> symlinks ───────────────────

async function reconcileSymlink(linkPath, targetAbs, result) {
  const relTarget = path.relative(path.dirname(linkPath), targetAbs);
  const st = await lstatSafe(linkPath);

  if (!st) {
    await symlink(relTarget, linkPath);
    result.created++;
    return;
  }
  if (st.isSymbolicLink()) {
    const current = await readlink(linkPath);
    if (current === relTarget) {
      result.skipped++;
    } else {
      await unlink(linkPath);
      await symlink(relTarget, linkPath);
      result.created++;
    }
    return;
  }
  result.overrides.push(path.relative(WORKSPACE, linkPath));
}

// Codex parses SKILL.md frontmatter as strict YAML and drops the entire skill
// on a parse error, logging to stderr where it is easy to miss. The common
// break is an unquoted value containing ": ". Catch it here instead.
function lintSkillFrontmatter(name, raw) {
  const problems = [];
  const { data } = parseFrontmatter(raw);
  if (!data.name) problems.push(`${name}: SKILL.md frontmatter has no 'name'`);
  if (!data.description)
    problems.push(`${name}: SKILL.md frontmatter has no 'description'`);

  const head = raw.startsWith("---\n") ? raw.slice(4, raw.indexOf("\n---", 3)) : "";
  for (const line of head.split("\n")) {
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!m) continue;
    const v = m[2].trim();
    const quoted =
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"));
    if (v.includes(": ") && !quoted) {
      problems.push(
        `${name}: '${m[1]}' contains ": " unquoted — Codex will fail to load this skill`,
      );
    }
  }
  return problems;
}

async function linkSkills() {
  const srcDir = path.join(WORKSPACE, ".claude", "skills");
  const outDir = path.join(WORKSPACE, ".agents", "skills");
  await mkdir(outDir, { recursive: true });

  const result = {
    created: 0,
    skipped: 0,
    overrides: [],
    errors: [],
    warnings: [],
    descriptionChars: 0,
  };
  let entries = [];
  try {
    entries = await readdir(srcDir, { withFileTypes: true });
  } catch {
    return result;
  }

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    const linkPath = path.join(outDir, entry.name);
    try {
      const skillMd = await readFile(
        path.join(srcDir, entry.name, "SKILL.md"),
        "utf8",
      ).catch(() => null);
      if (skillMd === null) {
        result.warnings.push(`${entry.name}: no SKILL.md — Codex will ignore it`);
      } else {
        result.warnings.push(...lintSkillFrontmatter(entry.name, skillMd));
        const { data } = parseFrontmatter(skillMd);
        result.descriptionChars +=
          entry.name.length + (data.description || "").length;
      }
      await reconcileSymlink(linkPath, path.join(srcDir, entry.name), result);
    } catch (err) {
      result.errors.push(`${entry.name}: ${err.message}`);
    }
  }
  return result;
}

// ─── (c) .claude/commands/*.md → .agents/skills/<cmd>/SKILL.md stubs ────────

async function generateCommandSkills() {
  const srcDir = path.join(WORKSPACE, ".claude", "commands");
  const outDir = path.join(WORKSPACE, ".agents", "skills");
  await mkdir(outDir, { recursive: true });

  const result = {
    written: 0,
    unchanged: 0,
    skipped: [],
    coveredBySkill: [],
    errors: [],
    descriptionChars: 0,
  };
  let entries = [];
  try {
    entries = await readdir(srcDir, { withFileTypes: true });
  } catch {
    return result;
  }

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const slug = entry.name.replace(/\.md$/, "");
    const raw = await readFile(path.join(srcDir, entry.name), "utf8");
    const { data } = parseFrontmatter(raw);

    if (!data.description) {
      result.skipped.push(`${entry.name} (no description in frontmatter)`);
      continue;
    }

    // A stub, not a copy — the command file stays the single source of truth.
    // Both values are always quoted: an unquoted ": " in a description is
    // invalid YAML and Codex drops the whole skill with a load error.
    const stub =
      `---\n` +
      `name: ${yamlQuote(data.name || slug)}\n` +
      `description: ${yamlQuote(data.description)}\n` +
      `---\n\n` +
      `<!-- GENERATED by scripts/sync-codex.js from .claude/commands/${entry.name} — do not edit. -->\n\n` +
      `Read \`.claude/commands/${entry.name}\` in full, then carry out those\n` +
      `instructions using the Codex conventions in \`AGENTS.md\`.\n`;

    result.descriptionChars += slug.length + data.description.length;

    const skillDir = path.join(outDir, slug);
    const outPath = path.join(skillDir, "SKILL.md");

    // Some commands are the entry point to a skill of the same name
    // (/investigate → investigate). Codex has one namespace for both, so the
    // skill wins — it already holds the procedure the command documents.
    const dirStat = await lstatSafe(skillDir);
    if (dirStat && dirStat.isSymbolicLink()) {
      result.coveredBySkill.push(slug);
      continue;
    }

    await mkdir(skillDir, { recursive: true });
    const existing = await readFile(outPath, "utf8").catch(() => null);
    if (existing === stub) result.unchanged++;
    else {
      await writeFile(outPath, stub, "utf8");
      result.written++;
    }
  }
  return result;
}

// ─── (d) .mcp.json → [mcp_servers.*] in .codex/config.toml ──────────────────

function renderMcpServers(mcpServers) {
  const lines = [];
  for (const [name, cfg] of Object.entries(mcpServers || {})) {
    if (!cfg || typeof cfg !== "object") continue;
    const key = /^[A-Za-z0-9_-]+$/.test(name) ? name : tomlBasicString(name);
    lines.push(`[mcp_servers.${key}]`);

    if (cfg.url) {
      lines.push(`url = ${tomlBasicString(cfg.url)}`);
      if (cfg.bearer_token_env_var) {
        lines.push(
          `bearer_token_env_var = ${tomlBasicString(cfg.bearer_token_env_var)}`,
        );
      }
    } else if (cfg.command) {
      lines.push(`command = ${tomlBasicString(cfg.command)}`);
      const args = Array.isArray(cfg.args) ? cfg.args : [];
      if (args.length) {
        lines.push(`args = [${args.map(tomlBasicString).join(", ")}]`);
      }
    } else {
      continue; // neither stdio nor http — nothing Codex can launch
    }

    if (cfg.enabled === false) lines.push("enabled = false");

    const env = cfg.env && typeof cfg.env === "object" ? cfg.env : null;
    if (env && Object.keys(env).length) {
      lines.push("");
      lines.push(`[mcp_servers.${key}.env]`);
      for (const [k, v] of Object.entries(env)) {
        lines.push(`${k} = ${tomlBasicString(v)}`);
      }
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

async function generateConfig() {
  const templatePath = path.join(WORKSPACE, ".codex", "config.toml.template");
  const configPath = path.join(WORKSPACE, ".codex", "config.toml");

  if (!existsSync(templatePath)) {
    return { status: "skipped", reason: ".codex/config.toml.template missing" };
  }

  // Start from the existing config so hand edits outside the fence survive.
  const base = existsSync(configPath)
    ? await readFile(configPath, "utf8")
    : await readFile(templatePath, "utf8");

  const mcp = await readJsonSafe(path.join(WORKSPACE, ".mcp.json"));
  const servers = mcp?.mcpServers || {};
  const count = Object.keys(servers).length;

  const block = [
    MCP_FENCE_START,
    "# Generated from .mcp.json by scripts/sync-codex.js — edits inside this",
    "# fence are overwritten. Codex does not read .mcp.json at the repo root.",
    "",
    count ? renderMcpServers(servers) : "# (no MCP servers configured)",
    MCP_FENCE_END,
  ].join("\n");

  const fenceRe = new RegExp(
    `${MCP_FENCE_START.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?${MCP_FENCE_END.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
  );

  let next;
  if (fenceRe.test(base)) {
    next = base.replace(fenceRe, block);
  } else {
    next = `${base.trimEnd()}\n\n${block}\n`;
  }

  const existing = existsSync(configPath)
    ? await readFile(configPath, "utf8")
    : null;
  if (existing === next) return { status: "unchanged", servers: count };
  await writeFile(configPath, next, "utf8");
  return { status: existing ? "updated" : "created", servers: count };
}

// ─── (e) project instruction budget ────────────────────────────────────────

async function checkProjectInstructionBudget() {
  const files = ["AGENTS.md", "CLAUDE.md"];
  const result = { warnings: [], errors: [] };

  for (const file of files) {
    const absPath = path.join(WORKSPACE, file);
    const raw = await readFile(absPath, "utf8").catch(() => null);
    if (raw === null) continue;

    const bytes = Buffer.byteLength(raw, "utf8");
    const pct = Math.round((bytes / PROJECT_DOC_BUDGET) * 100);
    const label = `${file} ${bytes} bytes, ${pct}% of Codex's ${PROJECT_DOC_BUDGET}-byte project-doc floor`;

    if (bytes > PROJECT_DOC_BUDGET) {
      result.errors.push(
        `${label} — split durable guidance into nested AGENTS.md/AGENTS.override.md files`,
      );
    } else if (bytes >= PROJECT_DOC_BUDGET * PROJECT_DOC_WARN_RATIO) {
      result.warnings.push(
        `${label} — getting large; prefer nested guidance for module-specific rules`,
      );
    } else {
      result.warnings.push(label);
    }
  }

  return result;
}

// ─── (f) --link-repos ───────────────────────────────────────────────────────

const REPO_GITIGNORE_LINES = ["/.agents/skills/", "/.codex/agents/"];

async function collectRepoPaths() {
  const paths = new Set();

  const mcp = await readJsonSafe(path.join(WORKSPACE, "mcp_server.json"));
  for (const r of (mcp && mcp.repositories) || []) {
    if (r && typeof r.path === "string" && r.path.trim()) paths.add(r.path.trim());
  }

  const companies = await readJsonSafe(path.join(WORKSPACE, "companies.json"));
  for (const co of (companies && companies.companies) || []) {
    for (const room of co.rooms || []) {
      for (const team of room.teams || []) {
        for (const repo of team.repos || []) {
          if (typeof repo === "string" && repo.trim()) paths.add(repo.trim());
        }
      }
    }
  }

  paths.delete(WORKSPACE); // never link the workspace into itself
  return [...paths];
}

async function ensureGitignore(repoPath, lines) {
  const gitignorePath = path.join(repoPath, ".gitignore");
  let existing = "";
  try {
    existing = await readFile(gitignorePath, "utf8");
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
  const have = new Set(
    existing.split("\n").map((l) => l.trim()).filter(Boolean),
  );
  const toAppend = lines.filter((l) => !have.has(l));
  if (!toAppend.length) return false;

  const prefix = existing.length
    ? existing.endsWith("\n\n")
      ? ""
      : existing.endsWith("\n")
        ? "\n"
        : "\n\n"
    : "";
  await writeFile(gitignorePath, existing + prefix + toAppend.join("\n") + "\n", "utf8");
  return true;
}

// Each entry links straight to its true source — one hop, no symlink chains.
async function linkRepo(repoPath) {
  const result = { created: 0, skipped: 0, overrides: [], errors: [] };

  const groups = [
    {
      dir: path.join(repoPath, ".agents", "skills"),
      sourceDir: path.join(WORKSPACE, ".claude", "skills"),
      kind: "directory",
    },
    {
      dir: path.join(repoPath, ".agents", "skills"),
      sourceDir: path.join(WORKSPACE, ".agents", "skills"),
      kind: "command-stub",
    },
    {
      dir: path.join(repoPath, ".codex", "agents"),
      sourceDir: path.join(WORKSPACE, ".codex", "agents"),
      kind: "file",
    },
  ];

  for (const group of groups) {
    await mkdir(group.dir, { recursive: true });
    let entries = [];
    try {
      entries = await readdir(group.sourceDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (group.kind === "file" && !entry.name.endsWith(".toml")) continue;
      // The workspace .agents/skills dir holds both symlinked skills and real
      // stub dirs; only the real dirs are command stubs worth relinking.
      if (group.kind === "command-stub" && !entry.isDirectory()) continue;
      if (group.kind === "command-stub" && entry.isSymbolicLink()) continue;
      if (group.kind === "directory" && !entry.isDirectory()) continue;

      const linkPath = path.join(group.dir, entry.name);
      try {
        await reconcileSymlink(
          linkPath,
          path.join(group.sourceDir, entry.name),
          result,
        );
      } catch (err) {
        result.errors.push(`${entry.name}: ${err.message}`);
      }
    }
  }
  return result;
}

// ─── main ───────────────────────────────────────────────────────────────────

async function main() {
  const linkRepos = process.argv.includes("--link-repos");
  let failed = false;

  console.log("Syncing Claude config → Codex\n");

  const agents = await generateAgents();
  console.log(
    `  agents   .codex/agents/*.toml     ${agents.written} written, ${agents.unchanged} unchanged` +
      (agents.removed ? `, ${agents.removed} removed` : ""),
  );
  for (const s of agents.skipped) console.log(`             ! skipped ${s}`);
  if (agents.skipped.length) failed = true;

  const skills = await linkSkills();
  console.log(
    `  skills   .agents/skills/<name>    ${skills.created} linked, ${skills.skipped} unchanged`,
  );
  for (const o of skills.overrides) console.log(`             · override kept ${o}`);
  for (const w of skills.warnings || []) console.log(`             ! ${w}`);
  for (const e of skills.errors) console.log(`             ! ${e}`);
  if (skills.errors.length || (skills.warnings || []).length) failed = true;

  const commands = await generateCommandSkills();
  console.log(
    `  commands .agents/skills/<cmd>     ${commands.written} written, ${commands.unchanged} unchanged`,
  );
  for (const s of commands.coveredBySkill)
    console.log(`             · ${s} already covered by the skill of the same name`);
  for (const s of commands.skipped) console.log(`             ! skipped ${s}`);
  for (const e of commands.errors) console.log(`             ! ${e}`);
  if (commands.skipped.length || commands.errors.length) failed = true;

  const config = await generateConfig();
  console.log(
    `  mcp      .codex/config.toml       ${config.status}` +
      (config.servers !== undefined ? ` (${config.servers} server(s))` : "") +
      (config.reason ? ` — ${config.reason}` : ""),
  );

  const listChars =
    (skills.descriptionChars || 0) + (commands.descriptionChars || 0);
  const pct = Math.round((listChars / SKILL_LIST_BUDGET) * 100);
  console.log(
    `  budget   skill list               ~${listChars} chars, ${pct}% of the ` +
      `${SKILL_LIST_BUDGET}-char floor`,
  );
  if (listChars > SKILL_LIST_BUDGET) {
    console.log(
      "             ! over the conservative floor — Codex may shorten or drop " +
        "descriptions; trim the longest ones",
    );
    failed = true;
  }

  const projectDocs = await checkProjectInstructionBudget();
  console.log("\n  budget   project docs");
  for (const w of projectDocs.warnings) console.log(`             · ${w}`);
  for (const e of projectDocs.errors) console.log(`             ! ${e}`);
  if (projectDocs.errors.length) failed = true;

  if (linkRepos) {
    const repos = await collectRepoPaths();
    console.log(`\nLinking into ${repos.length} registered repo(s):`);
    for (const repoPath of repos) {
      if (!existsSync(repoPath)) {
        console.log(`  - SKIP (missing): ${repoPath}`);
        continue;
      }
      try {
        const r = await linkRepo(repoPath);
        const ignored = await ensureGitignore(repoPath, REPO_GITIGNORE_LINES);
        console.log(
          `  - OK   ${repoPath}: +${r.created} linked, ${r.skipped} unchanged, ` +
            `${r.overrides.length} overrides; gitignore appended=${ignored}`,
        );
        for (const e of r.errors) console.log(`           ! ${e}`);
        if (r.errors.length) failed = true;
      } catch (err) {
        console.log(`  - FAIL ${repoPath}: ${err.message}`);
        failed = true;
      }
    }
  } else {
    console.log("\n  (pass --link-repos to also link into registered target repos)");
  }

  if (failed) process.exitCode = 1;
}

main().catch((err) => {
  console.error(`sync-codex failed: ${err.message}`);
  process.exit(1);
});
