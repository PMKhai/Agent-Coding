---
name: workflow
description: "Run the multi-agent workflow for a task: Architect and Researcher, then Coders, then Reviewer, then commit."
argument-hint: "<task-id> | --new <description> [--target <repo>]"
---

# /workflow Command

## Purpose

Run the real multi-agent workflow by spawning agents in sequence using the `Agent()` tool in Claude Code.

## When to Use

When the user says:

- "run workflow"
- "spawn agents for this task"
- "/workflow [task-id]"

## Workflow Chain

```
User -> Orchestrator (main session)
           |
           v
      Architect Agent (spawned)
           |
           v (writes SPEC.md)
      Coder Agent (spawned)
           |
           v (writes code)
      Reviewer Agent (spawned)
           |
           v (approval / issues)
      Debugger (if needed) -> Re-review loop
           |
           v (APPROVED)
      Git Commit (orchestrator, unless task says no commit)
           |
           v (saves commit.md)
      Learner Agent (spawned)
           |
           v (updates projects/[project]/context.md)
         DONE
```

## Usage

```
/workflow [task-id]
/workflow --new "Task description" --target /path/to/repo
```

## Implementation

### When receiving `/workflow [task-id]`:

1. **Read task context** from `tasks/[task-id]/`
2. **Check for MCP tools** in `input.md` → if "Available MCP Tools" section exists, inform all agents that they have these tools and SHOULD use them (e.g. GitNexus for querying code graph, checking blast radius before changes)
3. **Spawn Architect + Researcher** in parallel with Agent() tool
4. **Wait for both** to finish -> read SPEC.md and research notes
5. **Spawn Coder** with Agent() tool — include MCP tools instruction in the prompt: "You have access to MCP tools: [list]. Use them to explore the codebase structure before writing code."
   - On Codex, run write-heavy frontend/backend coder lanes sequentially unless the user explicitly prepared separate Git worktrees and separate Codex sessions.
   - If `input.md` or `SPEC.md` says no commit, preserve that constraint and skip the commit/commit.md step.
6. **Wait for Coder** -> read code summary
7. **Spawn Reviewer** with Agent() tool — include: "You have access to MCP tools: [list]. Use them to check impact and verify code relationships."
8. **Wait for Reviewer** -> read approval/issues
9. **If issues** -> spawn Debugger -> re-spawn Reviewer (loop max 3x)
10. **Report result** to user

### Spawning Pattern:

`subagent_type` is the `name` of a file in `.claude/agents/`, and that file's
body is the subagent's system prompt. Never spawn a stage as `general-purpose` —
the soul, `effort` and `tools` allowlist would all be left unloaded. Pass no
`model=`; the agent file already declares it.

```python
# Stage 1 - Parallel
architect = Agent(
    subagent_type="architect",
    name="Architect",
    prompt=architect_prompt,
    run_in_background=True
)
researcher = Agent(
    subagent_type="researcher",
    name="Researcher",
    prompt=researcher_prompt,
    run_in_background=True
)
# wait for both

# Stage 2 - Sequential (coder-backend / coder-frontend per SPEC task type)
coder = Agent(
    subagent_type="coder-backend",
    name="Backend",
    prompt=coder_prompt,
    run_in_background=False
)

# Stage 3
reviewer = Agent(
    subagent_type="reviewer",
    name="Reviewer",
    prompt=reviewer_prompt,
    run_in_background=False
)
```

## Task Complete When:

1. Architect writes SPEC.md
2. Coder implements code
3. Reviewer writes approval.md with APPROVED status
4. Code compiles without errors
5. Git commit made, hash saved to tasks/[project]/[task-id]/commit.md, unless the task explicitly says no commit
6. Learner updates projects/[project]/context.md

## Error Handling

- Architect fails -> notify user, abort
- Coder fails -> notify user, can re-run with fixes
- Debugger fails after 3 retries -> manual intervention

## Debug Loop

If Reviewer found issues:

1. Spawn Debugger -> fix issues
2. Resume the same Reviewer with `SendMessage(to="Reviewer", ...)` -> re-review
   only the delta. **Claude Code only** — Codex has no `SendMessage`. On Codex,
   or when that Reviewer is no longer live, spawn a fresh one and hand it
   `fix-log.md` plus the previous `issues.md`.
3. Loop until approved or user intervenes

## Status Commands

```bash
# Check task progress
ls -la tasks/[task-id]/

# Check completion
cat tasks/[task-id]/review/approval.md
```

## Long-Running Goal Template

For queue or long-running workflow sessions, the orchestrator may wrap the run
in a durable goal:

```text
/goal Complete tasks/[project]/[task-id] without committing unless explicitly allowed.
Outcome: SPEC, research, implementation summaries, approval/issues, verification results.
Constraints: preserve task scope, use source-of-truth files, no generated hand edits.
Verification: run the commands listed in SPEC.md and record any blocker.
```
