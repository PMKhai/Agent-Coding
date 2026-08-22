# CLAUDE.md — FreeBird Platform Workspace

## What This Is

This is a **FreeBird Platform Workspace** — an automated multi-agent system where each agent has its own "soul", orchestrated by the main session, working until the task is complete.

**This file is the source of truth** — loaded at the start of every session.

---

## How It Works

### Multi-Agent System

```
USER INPUT
/workflow [task-id]
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
       |               |           (parallel on Claude worktrees)
  CODER-BE        CODER-FE      CODER-BE + CODER-FE
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

> **Spawn cwd note.** Claude CLI now spawns with `cwd: targetRepo` (when the task has a target repo) instead of `cwd: WORKSPACE`. The CLI loads the **target repo's** `CLAUDE.md` natively and resolves `.claude/agents`, `.claude/skills`, and `.claude/commands` filename-by-filename — every entry is either a per-file (or per-dir for skills) symlink back to this workspace's source-of-truth, or a real repo-local file that overrides it. Trading and `run-command` spawns have no target repo and keep `cwd: WORKSPACE`. See [Per-Repo Overrides](#per-repo-overrides).

> **Codex parity note.** The Codex view of this workflow runs write-heavy FE/BE
> lanes sequentially in a shared checkout unless the user creates manual Git
> worktrees and launches separate Codex sessions. Keep this distinction in
> `AGENTS.md` and `docs/dual-runtime.md` whenever workflow docs change.

### Agent Souls

| Agent              | Soul                                                     | Model | Role                                             |
| ------------------ | -------------------------------------------------------- | ----- | ------------------------------------------------ |
| **Architect**      | "Designing systems is my passion"                        | opus  | Analyze requirements, write SPEC.md              |
| **Researcher**     | "Knowledge is power"                                     | opus  | Research docs, libraries, best practices         |
| **Coder Backend**  | "Clean, efficient code is art"                           | opus  | Implement backend — API, DB, services            |
| **Designer**       | "A design that cannot be opened in a browser is just an opinion" | opus | Design artifacts via Open Design MCP + diagram-design |
| **Coder Frontend** | "Beautiful UI is a conversation between design and code" | opus  | Implement UI, verify with browser MCP            |
| **Reviewer**       | "Code quality is non-negotiable"                         | opus  | Review code, approve or reject                   |
| **Debugger**       | "Bugs fear me"                                           | opus  | Fix issues found by Reviewer                     |
| **Investigator**   | "Every bug has a birth certificate — I find it"          | opus  | Interactive root cause investigation (on-demand) |
| **Documenter**     | "Clarity comes from showing, not just telling"           | opus  | Write docs + Mermaid diagrams from SPEC/code     |
| **Learner**        | "Every task is a lesson"                                 | opus  | Extract learnings, update context.md             |

Model comes from each agent file's `model: opus` frontmatter. A `model=` argument on `Agent()` outranks it, so the orchestrator does not pass one — the spawn sites stay silent on model and the agent files remain the single place a tier is decided.

Agents **do not communicate with each other** — the orchestrator reads each agent's output and injects it into the next agent's prompt. The orchestrator may resume an agent it already spawned via `SendMessage(to="Reviewer", …)`, which is still orchestrator→agent.

---

## Commands

### `/create-task "description" [--target /path/to/repo]`

Initialize a task directory:

```
/create-task "Write API for user service" --target /path/to/repo
/create-task "Fix payment bug" -t ~/projects/payment
/create-task "Refactor auth module"
```

### `/check-status [task-id]`

Check task completion status:

```
/check-status 20260422-143000-build-login-api
/check-status --list
/check-status --list my-project
```

### `/workflow [task-id]`

Spawn agents in **sequence** — **this actually runs agents**:

```
/workflow 20260421-143300-write-api-user-service
/workflow --new "Task description" --target /path/to/repo
```

If the task input or SPEC says no commit, skip the commit/commit.md step and
leave the working tree for review.

### `/team-workflow [task-id]`

Same intent as `/workflow` but uses **Agent Teams** — Frontend, Backend,
DevOps run as parallel teammates that `SendMessage` each other directly.
Architect plans + writes lane assignments, Reviewer gates at the end.

Best when a task naturally crosses team boundaries (FE+BE contract,
service+k8s manifest). Reuses the engineer room composition from
`companies.json`.

```
/team-workflow 20260508-...
/team-workflow --new "..." --target /path/to/repo
/team-workflow [task-id] --teams frontend,backend  # subset
```

Spawn shape (lead session, single tool-use turn for Stage B):

```python
Agent(name="Architect", subagent_type="architect", run_in_background=false)
# wait, read team-board.md, then in parallel:
Agent(name="Frontend", subagent_type="coder-frontend", run_in_background=true, isolation="worktree")
Agent(name="Backend",  subagent_type="coder-backend",  run_in_background=true, isolation="worktree")
Agent(name="DevOps",   subagent_type="devops",         run_in_background=true, isolation="worktree")
# wait for all
Agent(name="Reviewer", subagent_type="reviewer", run_in_background=false)
```

There is no team object to create or tear down — the session has a single
implicit team. **`name` is the address**: a named agent can be reached with
`SendMessage(to="Frontend", message="…")`, and `ListAgents()` shows who is
live. Agents left unnamed cannot be messaged.

See `.claude/skills/team-workflow/SKILL.md` for the full protocol and
`team-board.md` template.

### `/investigate "bug description" [--target /path/to/repo]`

Interactive bug root cause investigation — **not part of the automated workflow**, runs on-demand:

```
/investigate "login button does nothing on mobile Safari" --target ~/projects/myapp
/investigate "payment webhook 500 on retry" --target ~/projects/backend
/investigate "useEffect runs infinitely when user updates"
```

**Flow:**

1. User describes the bug (description, error, reproduction steps)
2. Investigator searches the codebase and traces the call chain
3. Returns a Root Cause Report with file:line causal chain
4. Optionally hands the fix to the Debugger if user asks (`--fix` or follow-up message) — the Investigator itself is read-only

**Difference from Debugger:**

- `Investigator` — on-demand, conversational, finds root cause of bugs the user describes
- `Debugger` — automated workflow agent, fixes issues listed in `review/issues.md`

---

### `/queue [command]`

Manage a task queue — add multiple tasks, process them sequentially:

```bash
# Add tasks to queue
/queue add "Build login API" --target /path/to/repo
/queue add "Fix payment bug" --target /path/to/repo
/queue add "Add notifications" --target /path/to/repo

# View queue
/queue list

# Start processing (sequential, auto-continues)
/queue start

# Clean up
/queue clear              # remove done tasks
/queue clear --failed     # remove failed tasks
/queue clear --all        # remove all tasks
```

**Behavior:**

- Sequential — one task at a time
- On fail — marks task as failed, continues to next
- All fail — stops the queue
- Live add — can add tasks while queue is running (re-reads `queue.json` each iteration)
- State stored in `queue.json` at workspace root

---

## Sub-agents vs Agent Teams

This workspace supports **two parallelization patterns**:

### Sub-agents (default, used by `/workflow`)

Spawned via the `Agent()` / `Task` tool. Each sub-agent runs in its own context window and **reports results back** to the main session. They do NOT talk to each other — the orchestrator routes between them.

Best for: focused tasks where only the result matters (architect → spec, coder → code, reviewer → verdict).

### Agent Teams (experimental, on-demand)

Multiple Claude Code **sessions** running in parallel that share a task list and a mailbox — teammates can message each other directly. The lead session coordinates, teammates work independently, you can talk to any teammate.

Enabled via `.claude/settings.json`:

```json
{ "env": { "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1" } }
```

Best for:

- **Parallel code review** — security / performance / test-coverage reviewers debating a PR
- **Competing-hypothesis debugging** — 3-5 teammates each take a different theory and challenge each other
- **Cross-layer features** — BE / FE / DB owned by different teammates simultaneously

To start a team, in an interactive `claude` session inside this workspace:

```
Create an agent team to review PR #142. Spawn three reviewers:
- one focused on security implications
- one checking performance impact
- one validating test coverage
Have them each review and report findings.
```

Reuse existing sub-agent definitions as teammate types (architect, reviewer, debugger, finance, investigator…) — the frontmatter `model`, `effort`, `tools` allowlist all carry over.

Display modes:

- **in-process** (default): teammates run in the lead's terminal, Shift+Down cycles between them
- **split-pane**: each teammate gets a tmux/iTerm2 pane (`claude --teammate-mode tmux`)

Cleanup: ask the lead "clean up the team" when done. Team config lives at `~/.claude/teams/{team-name}/config.json`.

Note: Agent Teams require **interactive** Claude Code sessions (terminal). The web UI's `/chat`, `/investigate`, `/trading` use single-shot `claude -p` and continue to use sub-agents via `--agent` + `Task` tool.

---

## Spawning Agents

Main session uses the `Agent()` tool to spawn each agent. **`subagent_type` is the `name` of a file in `.claude/agents/`** — that file's body becomes the subagent's system prompt. Spawning as `general-purpose` and pasting a summary of the soul into `prompt` loads none of it, so always name the agent. `prompt` carries only task-specific context: paths, the SPEC, the previous stage's output.

```python
# Stage 1 - Parallel
architect = Agent(subagent_type="architect", name="Architect", run_in_background=True, prompt="...")
researcher = Agent(subagent_type="researcher", name="Researcher", run_in_background=True, prompt="...")
# wait for both to finish

# Stage 2 - Route by task type (read from SPEC.md)
# backend-only:
coder_be = Agent(subagent_type="coder-backend", name="Backend", run_in_background=False, prompt="...")

# frontend-only:
coder_fe = Agent(subagent_type="coder-frontend", name="Frontend", run_in_background=False, prompt="...")

# full-stack (parallel + worktree isolation):
coder_be = Agent(subagent_type="coder-backend", name="Backend", isolation="worktree", run_in_background=True, prompt="...")
coder_fe = Agent(subagent_type="coder-frontend", name="Frontend", isolation="worktree", run_in_background=True, prompt="...")
# wait for both, then merge branches back

# Stage 3 - Review
reviewer = Agent(subagent_type="reviewer", name="Reviewer", run_in_background=False, prompt="...")

# Stage 4 - If issues found
debugger = Agent(subagent_type="debugger", name="Debugger", run_in_background=False, prompt="...")
# -> resume the same Reviewer: SendMessage(to="Reviewer", message="...")
```

No spawn site passes `model=` — the agent files own that (see § Agent Souls).

---

## Workspace Structure

```
agent-coding/
├── CLAUDE.md
├── queue.json                # Task queue state (pending/running/done/failed)
├── .claude/
│   ├── agents/               # Agent soul definitions
│   │   ├── architect.md
│   │   ├── coder-backend.md
│   │   ├── coder-frontend.md
│   │   ├── reviewer.md
│   │   ├── debugger.md
│   │   ├── investigator.md
│   │   ├── researcher.md
│   │   └── learner.md
│   ├── commands/
│   │   ├── create-task.md    # /create-task command
│   │   ├── check-status.md   # /check-status command
│   │   ├── workflow.md       # /workflow command
│   │   ├── queue.md          # /queue command
│   │   └── investigate.md    # /investigate command
│   └── skills/
│       ├── orchestrator.md   # How to spawn agents
│       ├── architect.md
│       ├── code-write.md
│       ├── code-review.md
│       ├── debug.md
│       ├── investigate.md
│       └── research.md
├── projects/                 # Per-project context and conventions
│   └── [project-name]/
│       └── context.md        # Tech stack, conventions, forbidden patterns
├── tasks/                    # Task workspaces organized by project
│   └── [project-name]/
│       └── [task-id]/
│           ├── input.md          # Task description + project context
│           ├── target-info.md    # Target repo info (if any)
│           ├── SPEC.md           # Architect output
│           ├── research/         # Researcher output
│           │   └── [topic].md
│           ├── code/             # Code output (if no target repo)
│           ├── commit.md         # Git commit hash (for rollback)
│           └── review/
│               ├── backend-summary.md    # Coder Backend output
│               ├── frontend-summary.md   # Coder Frontend output
│               ├── approval.md           # Reviewer output (if APPROVED)
│               ├── issues.md             # Reviewer output (if ISSUES)
│               └── fix-log.md            # Debugger output
```

---

## Quick Start

### Single task

```
# 1. Create task
/create-task "Write login API" --target /path/to/repo

# 2. Run workflow
/workflow tasks/[project-name]/[task-id]

# 3. Check result
/check-status [task-id]
```

### Queue (multiple tasks)

```bash
# 1. Add tasks to queue
/queue add "Write login API" --target /path/to/repo
/queue add "Add email service" --target /path/to/repo
/queue add "Fix payment bug" --target /path/to/repo

# 2. Start processing (sequential, auto-continues)
/queue start

# 3. Add more tasks while running (from another session)
/queue add "Refactor auth" --target /path/to/repo

# 4. Check queue status
/queue list

# 5. Clean up
/queue clear
```

---

## Workflow Stages

| Stage | Agents                        | Parallel?                           | Output                                   |
| ----- | ----------------------------- | ----------------------------------- | ---------------------------------------- |
| 1     | Architect, Researcher         | Yes                                 | SPEC.md (with task type) + research/     |
| 2     | Coder Backend and/or Frontend | Yes (full-stack, worktree isolated) | backend-summary.md + frontend-summary.md |
| 3     | Reviewer                      | No                                  | approval.md or issues.md                 |
| 4     | Debugger (if needed)          | No                                  | Fixed code + fix-log.md                  |
| 5     | Orchestrator                  | No                                  | Git commit + commit.md                   |
| 6     | Learner                       | No                                  | Updated projects/[name]/context.md       |

---

## Agent Behavior Guidelines

Applies to all agents when executing tasks.

### 1. Think Before Acting

- **State assumptions explicitly** — if requirements are ambiguous, document assumptions before implementing
- **Surface tradeoffs** — if multiple approaches exist, list them and choose with reasoning
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

Define success criteria before implementing:

```
Architect       : SPEC.md is complete when Coders can implement without asking questions
                  Must label task type: backend-only | frontend-only | full-stack
Coder Backend   : Code is complete when it compiles/runs and matches SPEC backend section 100%
Coder Frontend  : Code is complete when UI renders, matches SPEC frontend section, verified via browser MCP
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

Each registered target repo gets per-file symlinks under `.claude/agents/`, `.claude/commands/`, and per-directory symlinks under `.claude/skills/` — all pointing back to this workspace's source-of-truth. When Claude spawns with `cwd: targetRepo`, it sees the workspace's agents/skills/commands transparently via those symlinks. To override one specific entry for one repo, drop a real file (or directory, for skills) at the same path: the real entry shadows the symlink, every other entry continues to resolve to the workspace. `.gitignore` catches the whole symlink farm, so committing an override requires `git add -f .claude/agents/coder-frontend.md` (or wherever the override lives). Use the **Repair links** button in Repo Health — or re-run `node scripts/migrate-repo-links.js` — to restore a missing/broken symlink. Full reference: [`docs/workspace-control.md` §8–§10](docs/workspace-control.md#8-per-repo-agent-override-workflow).

---

## Notes

- **Orchestrator = Main session** — spawns and coordinates all agents
- **File system = shared state** — agents communicate via `tasks/[project]/[task-id]/`
- **Project context** — `projects/[project]/context.md` loaded by all agents for conventions
- **Stage 1 is parallel** — Architect and Researcher run simultaneously
- **Stage 2 is routed** — Architect labels task type in SPEC.md; orchestrator spawns backend-only, frontend-only, or both in parallel
- **Worktree isolation** — full-stack parallel coders each get their own git worktree to avoid conflicts; orchestrator merges branches after both finish
- **Sequential after Stage 2** — Reviewer -> Debugger (if needed) -> Re-review
- **Symlink architecture for agents/skills/commands** — workspace is source-of-truth; each target repo holds per-file (or per-dir for skills) symlinks back to it. Spawn cwd flips to `targetRepo`, so the CLI loads target's `CLAUDE.md` natively while still resolving every workspace agent transparently. Per-repo overrides live as real files committed with `git add -f`. See [Per-Repo Overrides](#per-repo-overrides).
- **`--add-dir WORKSPACE` is mandatory** — every spawn site that flips `cwd: targetRepo` also pushes `--add-dir <WORKSPACE>` so the spawned CLI retains read access to `projects/`, `tasks/`, and other workspace-owned paths.
- **This workspace also runs on Codex** — `AGENTS.md` is the Codex-side counterpart of this file, and `.claude/*` stays the single source of truth for both. After editing any agent, skill, or command, run `node scripts/sync-codex.js` to regenerate `.codex/agents/*.toml` and `.agents/skills/`. Parity table and known gaps (no Agent Teams, no worktree isolation on Codex): [`docs/dual-runtime.md`](docs/dual-runtime.md). The `runtime-scout` agent keeps that table current — `/runtime-scout`.
