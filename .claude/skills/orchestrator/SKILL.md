---
name: orchestrator
description: Multi-agent workflow orchestration. Use when spawning agents, running /workflow, or coordinating Architect, Researcher, Coder, Reviewer, Debugger agents in sequence.
user-invocable: false
---

# Orchestrator Workflow

## Purpose

Coordinate the multi-agent workflow by spawning agents in sequence using the `Agent()` tool. The main session is the orchestrator — there is no separate central agent.

**Spawn each stage by its agent name.** `subagent_type` takes the `name` from a
file in `.claude/agents/`, and that file's body becomes the subagent's system
prompt. Passing `subagent_type="general-purpose"` and pasting a one-line
paraphrase of the soul into `prompt` loads none of it — not the soul, not the
`effort`, not the `tools` allowlist. Do not re-state the soul in `prompt`; it is
already loaded. `prompt` carries only what is specific to this task: paths, the
SPEC, the previous stage's output.

For the same reason, do not pass `model=`. Every agent file already declares
`model: opus`, and a spawn-site override outranks the frontmatter.

## Workflow Chain

```
User --> Orchestrator (Main Session)
              |
              |--[Stage 1 - Parallel]------------|
              v                                  v
         ARCHITECT                          RESEARCHER
         Agent()                            Agent()
              |                                  |
              |---------------|------------------|
                              |
                  [Stage 2 - Route by task type]
                              |
              |---------------|---------------|
              v               v               v
        backend-only     frontend-only    full-stack
              |               |         (Claude parallel; Codex sequential)
         CODER-BE        CODER-FE     CODER-BE + CODER-FE
              |               |               |
              |---------------|---------------|
                              |
                              v
                         REVIEWER
                         Agent()
                              |
                    |---------|---------|
                    v                   v
               ISSUES FOUND          APPROVED
                    |                   |
                    v                   v
                DEBUGGER           GIT COMMIT
                Agent()            (orchestrator)
                    |                   |
                    +--> REVIEWER       v
                         (re-review)  LEARNER
                                      Agent()
                                        |
                                        v
                                       DONE
```

## Implementation

### Step 1: Read task + detect MCP tools

```python
task_dir = f"tasks/{project}/{task_id}"
input_md = read(f"{task_dir}/input.md")
target_info = read(f"{task_dir}/target-info.md")  # if exists

# Extract MCP tools section from input.md
# If "Available MCP Tools" section exists, build an instruction block
# to inject into EVERY agent prompt
mcp_instruction = ""
if "## Available MCP Tools" in input_md:
    # Extract the section content
    mcp_instruction = """
## MCP Tools Available

You have access to MCP tools for exploring the codebase. USE THEM before making changes:
- Use `query` to search for symbols, execution flows, and code patterns
- Use `context` to get a 360° view of any symbol (callers, callees, imports)
- Use `impact` to check blast radius before modifying a symbol
- Use `detect_changes` to understand what your changes will affect

These tools give you deep codebase understanding. Always explore before coding.
"""
```

### Step 2: Spawn Architect + Researcher in parallel

```python
architect = Agent(
    subagent_type="architect",
    name="Architect",
    run_in_background=True,
    prompt=f"""
Task: {task_description}
Target repo: {repo_path}
{mcp_instruction}
Read the target repo to understand tech stack. Use MCP tools (if available) to explore
the existing code graph — query symbols, understand relationships, check clusters.
Then write SPEC.md to: {task_dir}/SPEC.md

SPEC.md must include:
- Task type: backend-only | frontend-only | full-stack
- Architecture, data models, API endpoints, file structure, dependencies
- If full-stack or frontend: label sections clearly as [BACKEND] and [FRONTEND]
- Acceptance criteria
"""
)

researcher = Agent(
    subagent_type="researcher",
    name="Researcher",
    run_in_background=True,
    prompt=f"""
{mcp_instruction}
Research: {research_topics}

Write findings to: {task_dir}/research/[topic].md
Include: summary, key findings, code examples, recommendations.
"""
)

# Wait for both to finish
```

### Step 3: Route Coder by task type

Read SPEC.md and check the `Task type:` field, then route accordingly:

#### backend-only

```python
spec = read(f"{task_dir}/SPEC.md")

coder_be = Agent(
    subagent_type="coder-backend",
    name="Backend",
    run_in_background=False,
    prompt=f"""
{mcp_instruction}
SPEC.md:
{spec}

Target repo: {repo_path}

Use MCP tools (if available) to understand existing code structure before writing.
Implement the backend section of SPEC. Write code directly to target repo.
When done, write summary to: {task_dir}/review/backend-summary.md
"""
)
```

#### frontend-only

```python
coder_fe = Agent(
    subagent_type="coder-frontend",
    name="Frontend",
    run_in_background=False,
    prompt=f"""
{mcp_instruction}
SPEC.md:
{spec}

Target repo: {repo_path}

Use MCP tools (if available) to understand existing code structure before writing.
Implement the frontend section of SPEC. Write code directly to target repo.
Use browser MCP if available to verify the UI renders correctly.
When done, write summary to: {task_dir}/review/frontend-summary.md
"""
)
```

#### full-stack — runtime-specific execution

On Claude Code, run frontend and backend in parallel with `isolation="worktree"`.
On Codex in this workspace, run write-heavy lanes sequentially unless the user
has explicitly prepared separate Git worktrees and launched one Codex session in
each. Codex subagents share the same working tree here, so parallel writers can
collide.

Document the chosen mode in the coder summaries.

##### Claude Code: parallel with worktree isolation

Each coder gets its own git worktree so they don't conflict. After both finish,
the orchestrator merges their branches back into the working branch.

```python
coder_be = Agent(
    subagent_type="coder-backend",
    name="Backend",
    isolation="worktree",         # isolated git worktree
    run_in_background=True,       # parallel
    prompt=f"""
SPEC.md:
{spec}

Target repo: {repo_path}

Implement the [BACKEND] section of SPEC only. Write code directly to target repo.
When done, write summary to: {task_dir}/review/backend-summary.md
"""
)

coder_fe = Agent(
    subagent_type="coder-frontend",
    name="Frontend",
    isolation="worktree",         # isolated git worktree
    run_in_background=True,       # parallel
    prompt=f"""
SPEC.md:
{spec}

Target repo: {repo_path}

Implement the [FRONTEND] section of SPEC only. Write code directly to target repo.
Use browser MCP if available to verify the UI renders correctly.
When done, write summary to: {task_dir}/review/frontend-summary.md
"""
)

# Wait for both to finish
# Each agent returns a result with worktree path and branch name if it made changes.
# The orchestrator merges both branches:
#
#   be_result = <result from coder_be>  # contains branch name if changes made
#   fe_result = <result from coder_fe>  # contains branch name if changes made
#
#   cd {repo_path}
#   git merge <be_branch> --no-edit
#   git merge <fe_branch> --no-edit
#
# If merge conflict occurs, spawn Debugger to resolve it.
# Worktrees are auto-cleaned if the agent made no changes.
```

##### Codex: sequential in the shared checkout

```python
coder_be = Agent(
    subagent_type="coder-backend",
    name="Backend",
    run_in_background=False,
    prompt="Implement the [BACKEND] section only, then write backend-summary.md",
)

# Wait, read backend-summary.md, then start frontend with the backend result
# injected as context.
coder_fe = Agent(
    subagent_type="coder-frontend",
    name="Frontend",
    run_in_background=False,
    prompt="Implement the [FRONTEND] section only, using backend-summary.md as contract context",
)
```

Advanced parallel Codex path: create manual Git worktrees first, launch one
Codex session per worktree, and coordinate through `team-board.md`. Do not ask
two Codex subagents in the same checkout to edit overlapping files.

### Step 4: Spawn Reviewer

Collect all summaries that exist:

```python
summaries = []
if exists(f"{task_dir}/review/backend-summary.md"):
    summaries.append(read(f"{task_dir}/review/backend-summary.md"))
if exists(f"{task_dir}/review/frontend-summary.md"):
    summaries.append(read(f"{task_dir}/review/frontend-summary.md"))

reviewer = Agent(
    subagent_type="reviewer",
    name="Reviewer",          # named so Step 5 can resume it instead of respawning
    run_in_background=False,
    prompt=f"""
{mcp_instruction}
SPEC.md: {task_dir}/SPEC.md
Code location: {repo_path}
Code summaries:
{summaries}

Use MCP tools (if available) to check impact of changes and verify code relationships.
Review the code against SPEC (both backend and frontend if full-stack).

If APPROVED: write {task_dir}/review/approval.md
If ISSUES FOUND: write {task_dir}/review/issues.md (label each issue as [BE] or [FE])
"""
)
```

### Step 5: Check result + Debug loop if needed

```python
if exists(f"{task_dir}/review/approval.md"):
    # Move to Step 6
    pass
else:
    issues = read(f"{task_dir}/review/issues.md")
    debugger = Agent(
        subagent_type="debugger",
        name="Debugger",
        run_in_background=False,
        prompt=f"""
{mcp_instruction}
Issues to fix:
{issues}

Code location: {repo_path}

Use MCP tools (if available) to trace the root cause and check impact before fixing.
Fix all issues. Write fix log to: {task_dir}/review/fix-log.md
"""
    )

    # Resume the same Reviewer instead of spawning a fresh one. It already holds
    # SPEC.md, the diff and the repo in its transcript, so the re-review only
    # needs the delta. Repeat until approved or max 3 retries.
    SendMessage(
        to="Reviewer",
        message=f"""
The Debugger addressed the issues you raised. Fix log: {task_dir}/review/fix-log.md

Re-review only what changed since your last pass. If the issues are resolved,
write {task_dir}/review/approval.md. If any remain, rewrite
{task_dir}/review/issues.md with just the outstanding ones.
""",
    )
```

`SendMessage` does not require Agent Teams to be enabled — it resumes a named
subagent from its own transcript. **Claude Code only.** Codex has no
`SendMessage`; this file is symlinked into `.agents/skills/`, so a Codex
orchestrator reads these same lines.

On Codex — and on Claude when that Reviewer is no longer live — spawn a fresh
`Agent(subagent_type="reviewer", name="Reviewer", ...)` instead, and pass it
`fix-log.md` plus the previous `issues.md` so it can re-review without
re-deriving the whole task. That costs tokens, not correctness.

### Step 6: Git Commit (after APPROVED)

```python
# Run in target repo (or task dir if no target)
commit_dir = repo_path if repo_path else task_dir

# Stage and commit all changes
result = bash(f"""
cd {commit_dir}
git add -A
git commit -m "feat: {task_description}

Task: {task_id}
Approved: {task_dir}/review/approval.md"
""")

# Save commit info
commit_hash = bash(f"cd {commit_dir} && git rev-parse HEAD").strip()
commit_md = f"""# Commit Info

**Task ID:** {task_id}
**Commit Hash:** {commit_hash}
**Repo:** {commit_dir}
**Branch:** {bash(f"cd {commit_dir} && git branch --show-current").strip()}
**Date:** {datetime.now().isoformat()}

## Rollback

```bash
cd {commit_dir}
git revert {commit_hash}
# or hard rollback:
git reset --hard {commit_hash}
```
"""
write(f"{task_dir}/commit.md", commit_md)
```

### Step 7: Spawn Learner (after APPROVED)

```python
learner = Agent(
    subagent_type="learner",
    name="Learner",
    run_in_background=False,
    prompt=f"""
Task artifacts to read:
- SPEC: {task_dir}/SPEC.md
- Backend summary (if exists): {task_dir}/review/backend-summary.md
- Frontend summary (if exists): {task_dir}/review/frontend-summary.md
- Approval: {task_dir}/review/approval.md
- Issues (if exists): {task_dir}/review/issues.md
- Fix log (if exists): {task_dir}/review/fix-log.md

Current project context: {project_context_path}

Extract learnings from this task and update the project context file.
Merge into existing content — never overwrite. Max 10 bullet points added.
"""
)
# Learner failure is non-blocking — task is still done
```

## Agent Communication

Agents do NOT communicate with each other. Everything goes through the orchestrator:

1. Orchestrator reads output of previous agent
2. Injects into the next agent's prompt
3. File system is shared state: `tasks/[project]/[task-id]/`

The one exception is the orchestrator resuming an agent it already spawned:
`SendMessage(to="Reviewer", ...)` in Step 5 continues that Reviewer from its own
transcript rather than paying to rebuild its context. That is still
orchestrator→agent, not agent→agent.

## Key Principles

1. **Main session is orchestrator** — spawns and coordinates all agents
2. **Sequential with gate** — each stage only runs after previous stage output is valid
3. **Stage 1 parallel** — Architect and Researcher run simultaneously
4. **Stage 2 routing** — read SPEC.md task type, then spawn backend-only, frontend-only, or both in parallel
5. **Full-stack = parallel coders** — Coder Backend and Coder Frontend run simultaneously
6. **File system is source of truth** — all state stored in `tasks/[project]/[task-id]/`
7. **Learner is non-blocking** — if it fails, task is still considered done
