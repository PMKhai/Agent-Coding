# Dual runtime: Claude Code + Codex

This workspace runs on two agent runtimes off one config. `.claude/*` is the
source of truth; everything Codex reads is generated from it by
`scripts/sync-codex.js`.

Verified against **Claude Code 2.1.239** and **Codex CLI 0.137.0**.

> The published Codex manual runs ahead of the shipped binary in places — the
> `[agents]` settings keys it documents do not parse on 0.137. Trust the binary,
> and re-check with `$runtime-scout` after a Codex upgrade.

---

## Parity table

| Concern            | Claude Code                          | Codex                                        | How it's shared                                          |
| ------------------ | ------------------------------------ | -------------------------------------------- | -------------------------------------------------------- |
| Instructions       | `CLAUDE.md`                          | `AGENTS.md` (root + nested, + `AGENTS.override.md`) | Two hand-written files. Change one, change the other. `sync-codex.js` reports root doc size against Codex's 32 KiB project-doc floor. |
| Agent definitions  | `.claude/agents/*.md` + frontmatter  | `.codex/agents/*.toml`                        | Generated. `name`/`description`/`developer_instructions` required. |
| Skills             | `.claude/skills/<n>/SKILL.md`        | `<repo_root>/.agents/skills/<n>/SKILL.md`     | **Symlinked** — identical format, one copy on disk.      |
| Commands           | `.claude/commands/*.md` (`/name`)    | a skill (`$name`) — custom prompts deprecated | Generated stub pointing back at the command file.        |
| Hooks              | `.claude/settings.json` → `hooks`    | `.codex/hooks.json`                           | Same 3-level shape; scripts detect the runtime at runtime.|
| MCP servers        | `.mcp.json`                          | `[mcp_servers.*]` in `.codex/config.toml`     | Generated into a fenced block. Codex ignores `.mcp.json` at the repo root. |
| Subagents          | `Agent()` tool                       | ask by name, `[agents]` in config             | Same roster, different invocation.                       |
| Model selection    | `model:` frontmatter (`opus`)        | `model` in the `.toml` (`gpt-5.6-sol`)        | Generated.                                               |
| Reasoning effort   | `effort:` frontmatter                | `model_reasoning_effort`                      | Generated, 1:1 (`low\|medium\|high\|xhigh\|max`).        |
| Tool permissions   | `tools:` allowlist                   | `sandbox_mode` (`read-only` / `workspace-write`) | Generated from a per-agent list in the sync script.   |
| Agent Teams        | teammates + `SendMessage`            | **none**                                       | Degrades — see below.                                    |
| Worktree isolation | `isolation: "worktree"`              | Desktop-managed worktrees, not same-checkout CLI subagent isolation | Degrades here — see below.                    |
| Design hand-off    | Designer writes `tasks/[id]/design/`; the orchestrator inlines `design-summary.md` and lists artifacts by absolute path, because a lane worktree is branched from the remote default branch and has no `tasks/` directory | Same inlining. One shared checkout, so lanes can also open the files directly, and subagent results return to the main thread | Same skill text — no runtime branch needed. |
| Lifecycle hooks    | `PermissionRequest`, `SubagentStart`, `SubagentStop`, `PreToolUse`, `PostToolUse` | same events in `.codex/hooks.json` | **Both runtimes.** Neither `PermissionRequest` nor `SubagentStart` is wired here yet. |
| Dynamic workflows  | `.claude/workflows/*.js` (JS orchestration outside the context window) | **none**                     | Not adopted — see the WATCH entry in `docs/runtime-notes/2026-08-22-claude-agent-docs.md`. |
| Exec policy rules  | Hook/tool allowlists                 | `.rules` prefix policies with inline tests     | Codex-only approval layer; document before enabling project defaults. |
| Native review      | Reviewer agent                       | `/review` for branch/commit/uncommitted diff   | Optional extra signal; workflow artifacts still rule.     |
| Non-interactive    | `claude -p --output-format stream-json` | `codex exec --json --sandbox <mode>`        | Different event schemas; Codex defaults read-only in exec. |

---

## What you lose on Codex

| Missing                | Impact                                                                 | Workaround                                                                              |
| ---------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **Agent Teams**        | Teammates can't message each other; no `SendMessage`, no `ListAgents`. | `$team-workflow` coordinates lanes through `team-board.md`, relayed by the orchestrator. |
| **Worktree isolation in this CLI workflow** | Two coders writing at once will collide.                              | Stage 2 runs sequentially. Create manual Git worktrees and separate Codex sessions to parallelize. |
| **The web UI**         | `ui/server` spawns `claude` only.                                     | Run Codex from a terminal. Wiring the UI to `codex exec --json` is a separate project.   |
| **`--chrome`**         | No Claude-in-Chrome browser integration for Coder Frontend.           | Use a Playwright MCP server, or verify the UI by hand.                                   |
| **Artifacts**          | No `Artifact` publishing tool.                                        | Write files; publish some other way.                                                     |
| **`skills:` preload**  | An agent's paired skill is not injected at startup; Codex agents keep discovering skills at runtime. | None needed. `sync-codex.js` drops the key, so this costs latency, not capability. |
| **`attribution` settings** | Codex has no equivalent key for suppressing commit trailers.      | The no-`Co-Authored-By` rule stays prose for Codex — `projects/agent-coding/context.md`. |
| **`argument-hint`**    | No `/` autocomplete to hint into; the generated skill stub drops the key. | None needed. Cosmetic on the Claude side only.                                       |
| **`SendMessage` subagent resume** | Stage 4 cannot resume the Reviewer from its transcript, so every re-review after a Debugger pass, and every Designer re-run after a `@Designer` issue, re-reads its inputs from zero. | Spawn a fresh `reviewer` for each re-review pass, handing it `fix-log.md` and the previous `issues.md`. Costs tokens, not correctness. |

## What you lose on Claude

| Missing                     | Impact                                                                     |
| --------------------------- | -------------------------------------------------------------------------- |
| **`sandbox_mode` per agent**| Claude scopes agents by tool allowlist, which is coarser than a sandbox.    |
| **`skills:` / `mcpServers:` frontmatter under Agent Teams** | Both fields are dropped when a subagent definition runs as a teammate; the body is appended to the system prompt and skills/MCP come from project + user settings. Nine agent files here declare `skills:`. Costs latency, not capability — the skill is still discoverable at runtime. |

The first row is softer than it reads: `tools` / `disallowedTools` plus the
`sandbox.*` settings tree cover most of what a per-agent `sandbox_mode` buys.
The second is narrower than it reads — it applies only under Agent Teams, so
`/workflow` and every ordinary subagent spawn keep their `skills:` preload.

> **Corrected 2026-08-22**, the same day the rows were added — this is not
> accumulated drift. This table used to claim Claude lacked the
> `PermissionRequest` and `SubagentStart` hooks. Both claims were false — Claude
> has both, `PermissionRequest` with full allow/deny decision control and
> `SubagentStart` with `agent_id`/`agent_type` matchers and
> `hookSpecificOutput.additionalContext`. Source:
> `https://code.claude.com/docs/en/hooks.md`, fetched 2026-08-22. Neither is
> wired up here yet — absent from this kit is not the same as absent from the
> runtime. See `docs/runtime-notes/2026-08-22-claude-agent-docs.md`.

---

## Running Codex here

```bash
# 1. Project the Claude config onto Codex — after ANY .claude/ edit
node scripts/sync-codex.js

# 2. Interactive, inside a target repo
codex --cd /path/to/repo --add-dir /Users/khaipham/Documents/Agent-Coding

# 3. Trust the hooks (once per hook definition)
/hooks

# 4. Non-interactive
codex exec --json -C /path/to/repo \
  --sandbox workspace-write \
  --add-dir /Users/khaipham/Documents/Agent-Coding \
  --dangerously-bypass-hook-trust \
  "$workflow tasks/acme/20260422-login-api"
```

Use `--ephemeral` for disposable audits. `--json` is a JSONL event stream, not
just the final answer; add `-o` / `--output-last-message` when a script needs a
stable final-message file. Avoid deprecated `--full-auto`.

### Hooks need one interactive trust pass — RESOLVED 2026-08-23

**Status: verified firing on both runtimes.** The three hooks in
`.codex/hooks.json` run under Codex once the project is trusted and the hooks
reviewed. Confirmed end to end by asking Codex to loosen a scratch file's mode
to world-writable:

```
Command blocked by PreToolUse hook:
[guard-bash] BLOCKED: 777 permissions are insecure — use a tighter mode.
```

One `.claude/hooks/guard-bash.js`, one `permissionDecision: "deny"` JSON on
stdout, blocking on both runtimes.

**What was actually required**, and why every earlier `codex exec` run saw
nothing:

1. Trust the project, so the `.codex/` layer loads at all.
2. Run `/hooks` **interactively, once**, to review and trust each hook
   definition. Codex stores a `trusted_hash` per hook and silently skips any
   hook without one.

`--dangerously-bypass-hook-trust` did **not** substitute for step 2 on 0.137.
Every non-interactive attempt — in both the `hooks.json` and the inline
`[[hooks]]` form — ran with the hooks skipped and no error, which is why this
looked for a while like a discovery failure rather than a trust failure.

Editing a hook definition invalidates its hash, so any change to
`.codex/hooks.json` needs another `/hooks` pass.

Check the wiring any time with `/hooks`: the three events this workspace uses —
`PreToolUse`, `PostToolUse`, `SubagentStop` — each read one more installed and
active than the user-level hooks alone provide.

### Trust is keyed by file path and index — moving a hook silently breaks it

The entries under `[hooks.state]` in `~/.codex/config.toml` are keyed
`<absolute file path>:<event>:<group index>:<hook index>`:

```toml
[hooks.state."/Users/khaipham/.codex/hooks.json:pre_tool_use:0:0"]
[hooks.state."/Users/khaipham/.codex/config.toml:session_start:0:0"]
[hooks.state."/Users/khaipham/Documents/Agent-Coding/.codex/hooks.json:pre_tool_use:0:0"]
```

So trust does not follow a hook around. **Moving one between files, or inserting
a matcher group ahead of it and shifting its index, produces a new key with no
stored hash — and Codex skips unhashed hooks silently.** Same for editing a hook
in place: the hash changes, the entry no longer matches, and it stops firing
with no error. Only `/hooks` tells you.

Consequences worth planning around:

- Reordering the groups in a `hooks.json` invalidates every hook after the
  insertion point, not just the new one. Append rather than insert.
- Consolidating a layer's hooks into one representation costs a re-trust of
  everything that moved.
- A hook that "stopped working after a refactor" is almost always this, not a
  logic bug.

> **On the "hooks load from both" warning.** If `/hooks` reports hooks coming
> from both `~/.codex/hooks.json` and `~/.codex/config.toml`, that is the
> **user-level** layer carrying both representations, not this workspace. Codex
> loads both and warns; nothing is broken. On this machine the two sides are
> written by different installers — Orca owns `hooks.json`, codebase-memory-mcp
> owns a fenced block in `config.toml` — so consolidating means re-trusting what
> moves *and* losing to whichever installer runs next. Left as is deliberately.

Everything in this document — agents, skills, commands, MCP, subagent spawning,
hooks — is now verified working.

### Project trust

Codex ignores the `.codex/` layer of an untrusted project. Grant trust by
launching `codex` interactively in the workspace once and accepting the prompt,
or by adding it to `~/.codex/config.toml`:

```toml
[projects."/Users/khaipham/Documents/Agent-Coding"]
trust_level = "trusted"
```

A `-c projects."...".trust_level=trusted` override on the command line is **not**
enough — trust has to be persisted. `codex doctor` lists the config layers
actually in play.

### Dual-runtime hook scripts

The three scripts in `.claude/hooks/` run under both runtimes:

| Script           | Claude payload                     | Codex payload                                   |
| ---------------- | ---------------------------------- | ----------------------------------------------- |
| `guard-bash.js`  | blocks via exit 2 + stderr         | blocks via `permissionDecision: "deny"` on stdout |
| `auto-format.js` | `tool_input.file_path`             | `tool_input.command`, parsed from the `apply_patch` envelope |
| `notify.js`      | `tool_input.subagent_type`, `CLAUDE_HOOK_EVENT` | `agent_type`, `hook_event_name`, `turn_id` |

A block emits the deny JSON, the stderr line, **and** exit 2 — Claude honours the
JSON shape too, so one code path covers both.

---

## Running both runtimes on one checkout — they cannot see each other

**Neither runtime knows the other exists.** There is no lock, no advisory
warning, and no shared process registry. `ListAgents` enumerates Claude sessions
and subagents only; it is structurally blind to Codex. Codex has no equivalent
view of Claude. Two agents editing the same file in the same checkout will
happily interleave.

This is not theoretical. On 2026-08-22 a Claude subagent reported that
`CLAUDE.md` and `AGENTS.md` were being rewritten under it and asked whether
another agent was active. The orchestrator answered "no" on the strength of
matching mtimes, content that matched the subagent's own findings, and an empty
`ListAgents`. Four Codex sessions were in fact running in this same directory
across that window (`~/.codex/sessions/2026/08/22/`, 14:51–14:59). The first two
signals were real but proved only that the subagent *had* written — not that it
was the *only* writer. `ListAgents` proved nothing at all, because it cannot see
Codex.

Nothing was lost that time: the subagent used anchored edits, which fail loudly
rather than clobber, and three independent review passes followed. That was the
safety margin doing its job, not evidence that the arrangement is safe.

**Rules that follow:**

- Decide up front which runtime owns a working session, and do not run the other
  against the same checkout at the same time.
- To genuinely parallelize, give each runtime **its own git worktree**. That is
  the only isolation available here — Claude's `isolation: "worktree"` covers
  its own subagents and knows nothing about a Codex process.
- Instruct agents to use anchored edits that fail on mismatch, never
  whole-file rewrites, whenever concurrent work is even possible.
- **Never conclude "nobody else is editing" from `ListAgents` alone.** To check
  for Codex activity, look at session rollouts directly:

  ```bash
  find ~/.codex/sessions -type f -newermt "-30 minutes"
  ```

  and confirm the `cwd` recorded in the first few lines of the rollout.

---

## Gotchas

- **A colon in a description kills the skill.** An unquoted `": "` in SKILL.md
  frontmatter is invalid YAML; Codex drops the entire skill and reports it only
  on stderr, so it looks like the skill just does not exist.
  `scripts/sync-codex.js` lints for it and always quotes generated values.
- **Skill list budget.** Codex spends at most 2% of the context window on the
  skill list — 8000 characters when the window is unknown — and shortens
  descriptions once that fills. The sync script prints the running total
  (~4100 chars across 22 skills today, about half the floor) and fails if it
  crosses.
- **Project instruction budget.** Codex stops loading project instruction files
  once the combined docs reach its project-doc byte limit. Keep root
  `AGENTS.md` compact and move module-specific rules to nested `AGENTS.md` or
  `AGENTS.override.md` files. `sync-codex.js` reports root `AGENTS.md` and
  `CLAUDE.md` sizes.
- **`gpt-5.6-terra` is gated on 0.137.** It returns `The 'gpt-5.6-terra' model
  requires a newer version of Codex`. `gpt-5.6-sol` and `gpt-5.5` both work, so
  the all-`sol` mapping is safe — a tiered sol/terra split is not, yet.
- **`[agents]` is not a settings table on 0.137.** It parses as a map of role
  name → agent config, so `agents.enabled` / `agents.default_subagent_model`
  from the manual are rejected with `expected struct AgentRoleToml`. The
  template omits the table entirely.
- **Name collisions.** A command and a skill can share a name on Claude
  (`/investigate` → the `investigate` skill). Codex has one namespace, so the
  skill wins and the command stub is skipped.
- **Never hand-edit the generated side.** `.codex/agents/*.toml` and
  `.agents/skills/` are outputs. Edit `.claude/*` and re-run the sync. Real files
  dropped into those paths are treated as deliberate per-repo overrides and left
  alone.
- **`.codex/config.toml` is gitignored.** It is generated from `.mcp.json`, which
  carries machine-local commands and env values. `.codex/config.toml.template`
  is the committed base; only the fenced MCP block gets rewritten, so hand edits
  outside the fence survive.
- **Codex reads target-repo `AGENTS.md` natively.** `--link-repos` never links or
  overwrites it, exactly as Claude Code reads a target's own `CLAUDE.md`.

---

## Keeping this current

Both CLIs ship features weekly. The `runtime-scout` agent diffs the official doc
indexes against committed snapshots, reads only what changed, and writes a note
with an ADOPT / WATCH / SKIP verdict:

```
/runtime-scout          # Claude Code
$runtime-scout          # Codex
```

Findings land in [`runtime-notes/`](runtime-notes/). When a finding changes a row
above, the scout updates this table in the same pass — **this table, not the
notes, is the current state of the world.**
