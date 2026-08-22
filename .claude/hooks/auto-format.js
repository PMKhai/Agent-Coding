#!/usr/bin/env node
// PostToolUse hook for Edit / Write — runs a formatter on the touched file(s).
// Best-effort: silently skips if the formatter isn't installed.
//
// Runs under both Claude Code and Codex. Claude sends tool_input.file_path;
// Codex edits go through apply_patch, which sends the patch text as
// tool_input.command instead, so the paths get parsed out of the envelope.

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

let payload;
try {
  payload = JSON.parse(fs.readFileSync(0, "utf8"));
} catch {
  process.exit(0);
}

const TS_JS_EXTS = [
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "json",
  "jsonc",
  "css",
  "scss",
  "md",
  "mdx",
  "html",
  "yaml",
  "yml",
];

function has(cmd) {
  try {
    execSync(`command -v ${cmd}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function tryRun(cmd) {
  try {
    execSync(cmd, { stdio: "ignore", timeout: 5000 });
  } catch {
    /* swallow — never fail the hook */
  }
}

function findPrettier(startDir) {
  let dir = startDir;
  while (dir && dir !== "/") {
    const p = path.join(dir, "node_modules", ".bin", "prettier");
    if (fs.existsSync(p)) return p;
    dir = path.dirname(dir);
  }
  return null;
}

// apply_patch envelope lines: "*** Add File: a/b.ts", "*** Update File: ...",
// "*** Delete File: ...", "*** Move to: ...". A deleted file has nothing to
// format; a moved file gets formatted at its destination.
function pathsFromPatch(patch, cwd) {
  const out = [];
  for (const line of String(patch).split("\n")) {
    const m = line.match(/^\*\*\* (?:Add File|Update File|Move to):\s*(.+?)\s*$/);
    if (m) out.push(path.resolve(cwd || process.cwd(), m[1]));
  }
  return [...new Set(out)];
}

function formatFile(file) {
  const ext = path.extname(file).slice(1).toLowerCase();
  if (TS_JS_EXTS.includes(ext)) {
    const local = findPrettier(path.dirname(file));
    if (local) tryRun(`"${local}" --write "${file}"`);
    else if (has("prettier")) tryRun(`prettier --write "${file}"`);
    else tryRun(`npx --no-install prettier --write "${file}"`);
  } else if (ext === "go") {
    if (has("gofmt")) tryRun(`gofmt -w "${file}"`);
  } else if (ext === "py") {
    if (has("ruff")) tryRun(`ruff format "${file}"`);
    else if (has("black")) tryRun(`black -q "${file}"`);
  } else if (ext === "rs") {
    if (has("rustfmt")) tryRun(`rustfmt --quiet "${file}"`);
  }
}

const files = payload.tool_input?.file_path
  ? [payload.tool_input.file_path]
  : pathsFromPatch(payload.tool_input?.command || "", payload.cwd);

for (const file of files) {
  if (file && fs.existsSync(file)) formatFile(file);
}
process.exit(0);
