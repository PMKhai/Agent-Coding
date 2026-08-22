# AGENTS.md — FreeBird Platform Workspace (Codex)

## Parity contract

This workspace runs on **two agent runtimes**. `CLAUDE.md` is the Claude Code
view; this file is the Codex view. They describe the same workflow, the same
agent souls, and the same task directory layout — only the mechanics differ.

**Change one, change the other.** The full mapping table, and what degrades on
each side, lives in [`docs/dual-runtime.md`](docs/dual-runtime.md).

`.claude/*` is the source of truth. Everything Codex reads is generated from it:

```bash
node scripts/sync-codex.js          # after editing any agent, skill, or command
node scripts/sync-codex.js --link-repos   # also push links into target repos
```

---

## What This Is

A **FreeBird Platform Workspace** — an automated multi-agent system where each agent
has its own "soul", orchestrated by the main session, working until the task is
complete.

---

## How It Works

### Multi-Agent System

```
USER INPUT
$workflow [task-id]
       |
       v
ORCHESTRATOR (Main Session)
       |
       |--[Stage 1 - Parallel]------------|
       v                                  v
  ARCHITECT                          RESEARCHER
  -> SPEC.md (labels task type)       -> research/[topic].md
       |                                  |
       |---------------|------------------|
                       |
            [Stage 2 - Route by task type]
                       |
       |---------------|---------------|
       v               v               v
  backend-only    frontend-only    full-stack
       |               |            (sequential)
  CODER-BE        CODER-FE      CODER-BE then CODER-FE
       |               |               |
       |---------------|---------------|
                       |
                       v
                  REVIEWER
                       |
             |---------|---------|
             v                   v
        ISSUES FOUND          APPROVED
             |                   |
             v                   v
          DEBUGGER           GIT COMMIT
          -> fix code        (orchestrator)
          -> fix-log.md          |
             |                   v
             +--> REVIEWER    LEARNER
                  (re-review)    |
                                 v
                                DONE
```

> **Stage 2 is sequential here, not parallel.** Claude Code isolates the two
> coders in separate git worktrees; Codex has no worktree isolation, so two
> agents writing at once would collide. Run Backend to completion, then
> Frontend. To parallelize anyway, create the worktrees yourself first and run
> a separate `codex` session in each.

> **Working directory.** Start Codex inside the target repo so it loads that
> repo's own `AGENTS.md` natively, and pass the workspace as a writable extra
> root so `projects/` and `tasks/` stay reachable:
>
> ```bash
> codex --cd /path/to/target-repo --add-dir /Users/khaipham/Documents/Agent-Coding
> ```
>
> Target repos registered with `--link-repos` carry symlinked copies of every
> workspace agent and skill, so the full roster resolves from inside the repo.
> See [Per-Repo Overrides](#per-repo-overrides).

> **Instruction budget.** Codex loads root and nested `AGENTS.md` /
> `AGENTS.override.md` files up to its project-doc byte budget. Keep the root
> file for workspace-wide rules; put module-specific FE/BE/infra guidance in a
> closer nested file. `node scripts/sync-codex.js` reports root instruction size
> so the workspace does not drift past the conservative 32 KiB floor.

### Agent Souls

| Agent              | Soul                                                             | Effort | Sandbox         | Role                                             |
| ------------------ | ---------------------------------------------------------------- | ------ | --------------- | ------------------------------------------------ |
| **Architect**      | "Designing systems is my passion"                                | xhigh  | workspace-write | Analyze requirements, write SPEC.md              |
| **Researcher**     | "Knowledge is power"                                             | medium | read-only       | Research docs, libraries, best practices         |
| **Brainstorm**     | "Brutal honesty before the first line of code"                     | medium | read-only       | Challenge assumptions before the SPEC is fixed   |
| **Coder Backend**  | "Clean, efficient code is art"                                   | medium | workspace-write | Implement backend — API, DB, services            |
| **Designer**       | "A design that cannot be opened in a browser is just an opinion" | medium | workspace-write | Design artifacts via Open Design + diagram tools |
| **Coder Frontend** | "Beautiful UI is a conversation between design and code"         | medium | workspace-write | Implement UI                                     |
| **DevOps**         | "If it's not in code, it doesn't exist"                          | medium | workspace-write | k8s manifests, Helm, ArgoCD, CI pipelines        |
| **QC**             | "Coverage gaps and flaky tests don't survive my pass"             | medium | workspace-write | Diff-aware tests, coverage gaps, build checks    |
| **Reviewer**       | "Code quality is non-negotiable"                                 | high   | read-only       | Review code, approve or reject                   |
| **Debugger**       | "Bugs fear me"                                                   | medium | workspace-write | Fix issues found by Reviewer                     |
| **Investigator**   | "Every bug has a birth certificate — I find it"                  | medium | read-only       | Interactive root cause investigation             |
| **Documenter**     | "Clarity comes from showing, not just telling"                   | medium | workspace-write | Write docs + Mermaid diagrams                    |
| **Learner**        | "Every task is a lesson"                                         | medium | workspace-write | Extract learnings, update context.md             |
| **Prompt Enhancer**| "Vague words become precise instructions"                 | medium | read-only       | Rewrite a vague task into an actionable prompt   |
| **Finance**        | "The market is a puzzle — I read the signals"                      | medium | workspace-write | Market analysis via TradingView MCP              |
| **Room Designer**  | "Every team is a personality; I find the right cast"                             | medium | read-only       | Draft a Room of teams as strict JSON             |
| **Runtime Scout**  | "Both runtimes are moving — I know which one just changed"       | high   | workspace-write | Track new Claude Code / Codex features           |

Model, reasoning effort, and sandbox mode come from `.codex/agents/<name>.toml`,
generated from the frontmatter of `.claude/agents/<name>.md`. Every agent runs
on `gpt-5.6-sol`, mirroring the all-opus Claude setup. To change one, edit the
Claude-side frontmatter and re-run the sync — never edit the `.toml` directly.

Agents **do not communicate directly** — the orchestrator reads each agent's
result and injects it into the next agent's prompt.

---

## Skills and Commands

Codex has a single namespace for both. Everything lives under `.agents/skills/`:

- **Skills** — symlinks straight to `.claude/skills/<name>`. Same `SKILL.md`
  format on both runtimes, so there is exactly one copy on disk.
- **Commands** — a Claude `/command` becomes a Codex skill of the same name. The
  generated `SKILL.md` is a stub that points at `.claude/commands/<name>.md`, so
  the command file stays the single source of truth.

Invoke a skill explicitly with `$name`, or browse them with `/skills`. Codex will
also pick one implicitly when the task matches its `description`.

| Command             | Invoke as         | Purpose                                                  |
| ------------------- | ----------------- | -------------------------------------------------------- |
| `/create-task`      | `$create-task`    | Initialize a task directory, optionally bound to a repo  |
| `/check-status`     | `$check-status`   | Check a task's stage, or list every task                 |
| `/workflow`         | `$workflow`       | Run the full multi-agent workflow for a task             |
| `/team-workflow`    | `$team-workflow`  | Cross-team task — see the degradation note below         |
| `/investigate`      | `$investigate`    | Trace the root cause of a bug, interactively             |
| `/queue`            | `$queue`          | Manage the sequential task queue in `queue.json`         |
| `/sub-task`         | `$sub-task`       | Follow-up task inheriting a completed task's context     |
| `/fix-bugs`         | `$fix-bugs`       | Fix a bug in a completed task using its original context |
| —                   | `$runtime-scout`  | What changed in the Claude Code / Codex docs             |

> **Watch the skill-list budget.** Codex spends at most 2% of the context
> window on the skill list — 8000 characters when the window is unknown — and
> shortens descriptions once that fills. `scripts/sync-codex.js` prints the
> running total and fails if it crosses the 8000-character floor. It also fails
> when a `description` contains an unquoted `": "`, which is invalid YAML and
> makes Codex drop the whole skill with only a stderr line.
>
> Skill and command descriptions are routing metadata. Front-load the trigger
> and scope, then put procedure details in the body. If a skill should not be
> chosen implicitly, say that clearly or add future `agents/openai.yaml`
> metadata once both runtimes have been tested with it.

---

## Spawning Agents

Codex has no `Agent()` tool. Subagents are spawned by **asking for them
directly**, naming the custom agent, and saying whether to wait:

```text
Spawn the architect agent to write SPEC.md for tasks/acme/20260422-login-api,
and in parallel spawn the researcher agent to research the auth libraries that
task needs. Wait for both, then summarize what each produced.
```

Rules that matter:

- **Name the agent.** `.codex/agents/*.toml` defines the roster; the `name` field
  is what Codex matches, not the filename.
- **Say whether to wait.** Codex waits for all requested results before
  returning a consolidated response, but only if you asked it to.
- **Parallel for read-heavy work.** Exploration, research, review, triage.
- **Sequential for write-heavy work.** Two agents editing the same tree conflict.
- **Subagents inherit the live session's sandbox and approval mode**, which
  override whatever the agent's `.toml` declares. Pick the permission mode for
  the parent turn before delegating.
- `/agent` (or `/subagents`) switches between active agent threads to inspect one.

There is deliberately **no `[agents]` table** in `.codex/config.toml`. Codex
0.137 parses `[agents]` as a map of role name → agent config, so the
settings-style keys the manual documents (`agents.enabled`,
`agents.default_subagent_model`, `agents.max_concurrent_threads_per_session`)
are rejected by this build with `expected struct AgentRoleToml`. Subagents are
on by default and every agent declares its own model, so nothing is lost.

---

## Agent Teams — not available here

Claude Code can run teammates as **parallel sessions that message each other**
via `SendMessage`. Codex has no equivalent: subagents report to the orchestrator
and never to one another.

`$team-workflow` therefore degrades to:

1. Architect writes the lane assignments into `team-board.md`, as usual.
2. The orchestrator spawns Frontend / Backend / DevOps as ordinary subagents.
3. They coordinate by **reading and writing `team-board.md`**, not by messaging.
4. The orchestrator relays anything one lane needs from another.

The skill already uses that file-based board on both runtimes, so the workflow
survives — what is lost is direct teammate-to-teammate negotiation, and the
worktree isolation that let lanes write concurrently. Run the lanes sequentially
unless you set up worktrees yourself.

Manual parallelization recipe:

```bash
git worktree add ../repo-backend -b codex/backend HEAD
git worktree add ../repo-frontend -b codex/frontend HEAD
codex --cd ../repo-backend --add-dir /Users/khaipham/Documents/Agent-Coding
codex --cd ../repo-frontend --add-dir /Users/khaipham/Documents/Agent-Coding
```

Give each session a disjoint lane and merge only after both summaries and tests
are reviewed.

---

## Hooks

`.codex/hooks.json` mirrors the `hooks` block in `.claude/settings.json` and runs
the same three scripts, which detect the runtime from their stdin payload:

| Event          | Matcher      | Script                          | Does                                    |
| -------------- | ------------ | ------------------------------- | --------------------------------------- |
| `PreToolUse`   | `Bash`       | `.claude/hooks/guard-bash.js`   | Denies destructive shell commands       |
| `PostToolUse`  | `Edit\|Write` | `.claude/hooks/auto-format.js`  | Formats files touched by `apply_patch`  |
| `SubagentStop` | —            | `.claude/hooks/notify.js`       | Desktop notification + audit log line   |

> **These are not firing yet.** On Codex 0.137 none of the three ran in
> `codex exec` testing, with or without `--dangerously-bypass-hook-trust`, and
> in both the `hooks.json` and the inline `[[hooks]]` form. The rest of the
> `.codex/` layer does load, so this is specific to hooks. It takes one
> interactive pass to activate:
>
> ```bash
> cd /Users/khaipham/Documents/Agent-Coding
> codex          # accept the project trust prompt if offered
> /hooks         # review and trust all three
> ```
>
> Codex records a per-hook `trusted_hash` in `~/.codex/config.toml` and runs only
> hooks that have one; editing a hook entry invalidates its trust. Full writeup
> and the user-level fallback: [`docs/dual-runtime.md`](docs/dual-runtime.md).

Also note: Codex ignores the `.codex/` layer entirely in an **untrusted**
project. Grant trust with the prompt above, or by hand:

```toml
[projects."/Users/khaipham/Documents/Agent-Coding"]
trust_level = "trusted"
```

`codex doctor` lists the config layers actually in play.

---

## MCP

Codex does **not** read `.mcp.json` at the repo root — that path only applies
inside a packaged plugin. `scripts/sync-codex.js` translates it into
`[mcp_servers.*]` tables inside `.codex/config.toml`, in a fenced block:

```toml
# >>> generated: mcp servers >>>
...
# <<< generated: mcp servers <<<
```

Only the fence is rewritten, so hand edits elsewhere in the file survive
re-runs. `.codex/config.toml` is gitignored — it carries machine-local commands
and env values. Check what loaded with `/mcp`.

---

## Workspace Structure

```
agent-coding/
├── CLAUDE.md                 # Claude Code view of this workspace
├── AGENTS.md                 # this file — Codex view
├── queue.json                # Task queue state
├── scripts/
│   └── sync-codex.js         # .claude/* → Codex config projection
├── .claude/                  # SOURCE OF TRUTH
│   ├── agents/*.md           # agent souls
│   ├── skills/*/SKILL.md     # skills
│   ├── commands/*.md         # commands
│   ├── hooks/*.js            # hook scripts, dual-runtime
│   └── settings.json         # Claude hooks + plugins
├── .codex/                   # GENERATED
│   ├── agents/*.toml         # from .claude/agents/*.md
│   ├── hooks.json            # mirrors .claude/settings.json hooks
│   ├── config.toml.template  # committed base
│   └── config.toml           # generated, gitignored
├── .agents/skills/           # GENERATED
│   ├── <skill>  -> ../../.claude/skills/<skill>
│   └── <command>/SKILL.md    # stub pointing at .claude/commands/
├── docs/
│   ├── dual-runtime.md       # the parity table
│   └── runtime-notes/        # runtime-scout findings
├── projects/[name]/context.md
└── tasks/[project]/[task-id]/
    ├── input.md              # Task description + project context
    ├── target-info.md        # Target repo info (if any)
    ├── SPEC.md               # Architect output
    ├── research/[topic].md   # Researcher output
    ├── code/                 # Code output (if no target repo)
    ├── commit.md             # Git commit hash (for rollback)
    └── review/
        ├── backend-summary.md
        ├── frontend-summary.md
        ├── approval.md       # Reviewer output (if APPROVED)
        ├── issues.md         # Reviewer output (if ISSUES)
        └── fix-log.md        # Debugger output
```

---

## Quick Start

```bash
# 0. Project the Claude config onto Codex (after any .claude/ edit)
node scripts/sync-codex.js

# 1. Start Codex in the target repo, workspace as an extra writable root
codex --cd /path/to/repo --add-dir /Users/khaipham/Documents/Agent-Coding

# 2. Accept the project trust prompt, then trust the hooks — once each
/hooks

# 3. Create and run a task
$create-task "Write login API" --target /path/to/repo
$workflow tasks/[project-name]/[task-id]
$check-status [task-id]
```

Non-interactive:

```bash
codex exec --json -C /path/to/repo \
  --sandbox workspace-write \
  --add-dir /Users/khaipham/Documents/Agent-Coding \
  --dangerously-bypass-hook-trust \
  "$workflow tasks/acme/20260422-login-api"
```

Use `--ephemeral` for disposable audits where rollout/session files are not
needed. `--json` emits a JSONL event stream; use `-o` / `--output-last-message`
when automation only needs the final message. Avoid deprecated `--full-auto`;
choose the sandbox explicitly.

For long workflow or queue runs, start with a durable goal:

```text
/goal Complete tasks/[project]/[task-id] without committing unless explicitly allowed.
Outcome: SPEC, research, implementation summaries, approval/issues, verification results.
Constraints: preserve task scope, use source-of-truth files, no generated hand edits.
Verification: run SPEC.md commands and record blockers.
```

---

## Workflow Stages

| Stage | Agents                        | Parallel?               | Output                                   |
| ----- | ----------------------------- | ----------------------- | ---------------------------------------- |
| 1     | Architect, Researcher         | Yes                     | SPEC.md (with task type) + research/     |
| 2     | Coder Backend and/or Frontend | No — sequential on Codex | backend-summary.md + frontend-summary.md |
| 3     | Reviewer                      | No                      | approval.md or issues.md                 |
| 4     | Debugger (if needed)          | No                      | Fixed code + fix-log.md                  |
| 5     | Orchestrator                  | No                      | Git commit + commit.md                   |
| 6     | Learner                       | No                      | Updated projects/[name]/context.md       |

---

## Agent Behavior Guidelines

Applies to all agents when executing tasks.

### 1. Think Before Acting

- **State assumptions explicitly** — if requirements are ambiguous, document
  assumptions before implementing
- **Surface tradeoffs** — if multiple approaches exist, list them and choose
  with reasoning
- **Stop when confused** — don't guess; write what is unclear into the output file

### 2. Simplicity First

- **Minimum code** that solves the problem — nothing beyond the SPEC
- **No abstractions** for single-use code
- **No flexibility/configurability** unless requested
- **No error handling** for impossible scenarios
- Ask: _"Would a senior engineer say this is overcomplicated?"_ If yes, simplify

### 3. Surgical Changes

- **Only touch files that need changing** — don't improve surrounding code
- **Don't refactor** things that aren't broken
- **Match existing style** of the target repo
- If unrelated dead code is noticed → note it in output, don't delete it

### 4. Goal-Driven Execution

```
Architect       : SPEC.md is complete when Coders can implement without asking questions
                  Must label task type: backend-only | frontend-only | full-stack
Coder Backend   : Code is complete when it compiles/runs and matches SPEC backend section 100%
Coder Frontend  : Code is complete when UI renders and matches SPEC frontend section
Reviewer        : Review is complete when approval.md or issues.md is actionable
Debugger        : Fix is complete when every issue in issues.md is addressed
```

---

## Task Completion Criteria

1. `review/approval.md` exists with status APPROVED
2. Code written to target repo
3. Code compiles/runs without errors

---

## Per-Repo Overrides

`node scripts/sync-codex.js --link-repos` gives each registered target repo a
symlink farm pointing back at this workspace:

- `<repo>/.agents/skills/<name>` → workspace skill or command stub
- `<repo>/.codex/agents/<name>.toml` → workspace agent

To override one entry for one repo, drop a **real** file at the same path — it
shadows the symlink while everything else keeps resolving to the workspace. The
script appends `/.agents/skills/` and `/.codex/agents/` to the repo's
`.gitignore`, so committing an override needs
`git add -f .codex/agents/coder-frontend.toml`.

Target repo `AGENTS.md` files are **never** linked or overwritten — Codex reads
the repo's own instructions natively, exactly as Claude Code reads its
`CLAUDE.md`.

---

## Notes

- **Orchestrator = main session** — spawns and coordinates all agents
- **File system = shared state** — agents communicate via `tasks/[project]/[task-id]/`
- **Project context** — `projects/[project]/context.md` carries conventions
- **`.claude/` is authoritative** — never hand-edit `.codex/agents/*.toml` or
  `.agents/skills/`; edit the source and re-run `scripts/sync-codex.js`
- **Two runtimes, one workflow** — parity table and known gaps in
  [`docs/dual-runtime.md`](docs/dual-runtime.md); `$runtime-scout` keeps it current
