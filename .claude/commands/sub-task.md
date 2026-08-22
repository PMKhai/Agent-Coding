---
name: sub-task
description: Run a follow-up task on top of a completed one, inheriting its SPEC, implementation, and conventions.
argument-hint: "<task-dir> <subtask-dir>"
---

# /sub-task Command

## Purpose

Run a **related task** on top of a completed task. Inherits the full context of the parent task (SPEC, implementation, approval, commit, project conventions) so all agents understand what was already built before starting new work.

## Difference from `/workflow`

| | `/workflow` | `/sub-task` |
|---|---|---|
| Context | Fresh | Inherits parent task (SPEC, code, approval, commit) |
| Use case | New independent task | Extension/addition on completed work |
| Agents | Full pipeline | Full pipeline + parent context |

## Difference from `/fix-bugs`

| | `/fix-bugs` | `/sub-task` |
|---|---|---|
| Goal | Fix a bug in delivered code | Add new related functionality |
| Pipeline | Investigator → Debugger → Reviewer | Architect → Coder → Reviewer |
| Scope | Surgical, no new features | New feature/enhancement |

## Pipeline

```
Sub-task description + parent task context
          |
    ┌─────┴─────┐  (parallel)
    v           v
ARCHITECT    RESEARCHER     ← both receive parent SPEC + implementation context
(SPEC.md)   (research/)
    └─────┬─────┘
          |
    ┌─────┴──────────────┐  (route by task type from SPEC)
    v                    v
CODER-BE            CODER-FE              ← receive parent context + new SPEC
(backend-only or full-stack)
    └─────┬──────────────┘
          |
          v
      REVIEWER              ← checks new code against BOTH parent SPEC + new SPEC
    (approval/issues)
          |
    ┌─────┴─────┐
  ISSUES      APPROVED
    │              │
    v              v
  DEBUGGER     GIT COMMIT
  (re-fix)     + saves subtasks/[id]/commit.md
  (max 2x)
```

## Usage

```
/sub-task tasks/[project]/[task-id] tasks/[project]/[task-id]/subtasks/[subtask-id]
```

Both paths are passed by the UI when launching a sub-task run.

---

## Implementation

### Step 1 — Load parent context

```
parentTaskPath = args[0]   (e.g. tasks/league-of-legend/20260428-133034-lol-001)
subtaskPath    = args[1]   (e.g. tasks/league-of-legend/20260428-133034-lol-001/subtasks/20260501-140000-add-auth)
```

Read from parent task:
- `[parentTaskPath]/input.md`                    — original description + target repo
- `[parentTaskPath]/SPEC.md`                     — architecture designed by Architect
- `[parentTaskPath]/review/approval.md`          — what was approved
- `[parentTaskPath]/review/backend-summary.md`   — what was implemented (backend)
- `[parentTaskPath]/review/frontend-summary.md`  — what was implemented (frontend)
- `[parentTaskPath]/commit.md`                   — what was committed
- `[subtaskPath]/input.md`                       — sub-task description (written by server)
- `projects/[project]/context.md`                — project conventions

Extract `targetPath` from parent `input.md` (line matching `**Path:**`).

**Check for MCP tools**: Read `projects/[project]/mcp.json` — if it exists, agents have MCP tools available (e.g. GitNexus for querying code graph, checking blast radius). Include in all agent prompts: "You have MCP tools available. Use `mcp__gitnexus__query` to search the code graph, `mcp__gitnexus__impact` to check blast radius before making changes, and `mcp__gitnexus__context` to understand how components relate."

**Also scan for all prior fixes and subtasks** (excludes the current subtaskPath):
- List all dirs in `[parentTaskPath]/fixes/` that have a `commit.md` (completed)
- List all dirs in `[parentTaskPath]/subtasks/` that are NOT the current subtask and have a `commit.md`
- For each completed prior fix: read `bug.md`, `root-cause.md` (summary), `fix-log.md` (summary), `commit.md`
- For each completed prior subtask: read `input.md`, `SPEC.md` (summary), `review/backend-summary.md`, `review/frontend-summary.md`, `commit.md`

Build a `PARENT_CONTEXT` block to inject into all agent prompts:

```
## Parent Task Context (already completed)

### What Was Built (Original)
[contents of parent SPEC.md]

### Backend Implementation (Original)
[contents of backend-summary.md if exists]

### Frontend Implementation (Original)
[contents of frontend-summary.md if exists]

### Reviewer Approval
[contents of approval.md]

### Original Commit
[contents of commit.md]

### Project Conventions
[contents of projects/[project]/context.md if exists]

---

## Accumulated Change History
> All bug fixes and sub-tasks applied AFTER the original task — the current codebase
> reflects ALL of these on top of the original. New sub-tasks must build on top of this
> cumulative state, not just the original implementation.

### Bug Fixes Applied

[For each completed fix (sorted oldest first):]
#### Fix: [fix-id]
- **Bug:** [contents of bug.md — one line]
- **Root Cause:** [key finding from root-cause.md]
- **Fix Applied:** [summary from fix-log.md — files changed + what changed]
- **Commit:** [contents of commit.md]

(none if no prior fixes)

### Sub-tasks Applied

[For each completed prior subtask (sorted oldest first, excluding current):]
#### Sub-task: [subtask-id]
- **Description:** [contents of input.md — one line]
- **What Was Added:** [summary from SPEC.md — new features/changes]
- **Backend Changes:** [summary from backend-summary.md if exists]
- **Frontend Changes:** [summary from frontend-summary.md if exists]
- **Commit:** [contents of commit.md]

(none if no prior subtasks)

---
IMPORTANT: The sub-task must build on top of ALL existing work above (original + all fixes + all prior sub-tasks).
Do NOT redo, conflict with, or regress anything already implemented.
Read actual current file contents — the code reflects all accumulated changes, not just the original SPEC.
```

### Step 2 — Spawn Architect + Researcher in parallel

```python
architect = Agent(
    subagent_type="architect",
    run_in_background=True,
    prompt=f"""
You are the Architect agent. Design the implementation plan for a SUB-TASK on top of a completed task.

## Sub-task Description
{subtask_description}

## Target Repository
{targetPath}

## {PARENT_CONTEXT}

## Instructions
1. Read the sub-task description carefully
2. Use the parent task context to understand what is ALREADY BUILT — do not re-design it
3. Design ONLY what is new or changed for this sub-task
4. Label the task type: backend-only | frontend-only | full-stack
5. Write your spec to: {subtaskPath}/SPEC.md

Your SPEC.md must contain:
- **Task Type:** backend-only | frontend-only | full-stack
- What already exists (from parent task) — brief summary
- What is NEW in this sub-task — detailed spec
- Integration points — how new code connects to existing code
- Files to create/modify (specific, not vague)
"""
)

researcher = Agent(
    subagent_type="researcher",
    run_in_background=True,
    prompt=f"""
You are the Researcher agent. Research what is needed for a SUB-TASK on top of a completed task.

## Sub-task Description
{subtask_description}

## Target Repository
{targetPath}

## {PARENT_CONTEXT}

## Instructions
Research any additional libraries, APIs, or patterns needed for THIS sub-task specifically.
The parent task context above shows what is already implemented — focus on gaps for the new work.
Write findings to: {subtaskPath}/research/
"""
)
```

Wait for both. Read `{subtaskPath}/SPEC.md`.

### Step 3 — Route by task type, spawn Coder(s)

Read the `**Task Type:**` line from SPEC.md.

**backend-only:**
```python
coder = Agent(subagent_type="coder-backend", run_in_background=False, prompt=f"""
You are the Coder (Backend) agent implementing a sub-task.

## SPEC for this Sub-task
{spec_content}

## Target Repository
{targetPath}

## {PARENT_CONTEXT}

## Instructions
Implement ONLY what is specified in the sub-task SPEC above.
The parent context shows what already exists — do NOT rewrite or duplicate it.
Write backend-summary to: {subtaskPath}/review/backend-summary.md
""")
```

**frontend-only:** same pattern with `coder-frontend`.

**full-stack:** spawn both in parallel with worktree isolation, merge after.

### Step 4 — Spawn Reviewer

```python
reviewer = Agent(
    subagent_type="reviewer",
    run_in_background=False,
    prompt=f"""
You are the Reviewer agent reviewing a sub-task implementation.

## Sub-task SPEC
{spec_content}

## Implementation Summary
{backend_summary}
{frontend_summary}

## Target Repository
{targetPath}

## {PARENT_CONTEXT}

## Review Checklist
1. Does the sub-task implementation match the sub-task SPEC?
2. Does it integrate correctly with ALL existing code (original task + all prior fixes + all prior sub-tasks)?
3. Does it introduce regressions to ANY previously delivered feature (original or accumulated)?
4. Is code consistent with project conventions?
5. No duplication of what was already implemented (in original task OR any prior sub-task)?
6. Does it conflict with any bug fix that was previously applied?

If APPROVED: write {subtaskPath}/review/approval.md with "# Review: APPROVED"
If ISSUES:   write {subtaskPath}/review/issues.md with issues list
"""
)
```

### Step 5 — Handle result

**If APPROVED:**
1. Git commit the sub-task work:
   ```bash
   cd {targetPath}
   git add -A
   git commit -m "feat: [sub-task description from input.md]"
   ```
2. Save commit hash to `{subtaskPath}/commit.md`
3. Report to user

**If ISSUES:**
- Spawn Debugger with issues + parent context
- Re-spawn Reviewer
- Max 2 retry loops

### Step 6 — Report

Tell the user:
- What was implemented (summary from backend/frontend-summary)
- Commit hash (from commit.md)
- How it relates to the parent task
- If failed: what issues remain

---

## Sub-task Directory Structure

```
tasks/[project]/[task-id]/
└── subtasks/
    └── [subtask-id]/         ← e.g. 20260501-140000-add-auth-flow
        ├── input.md           ← sub-task description (created by server)
        ├── SPEC.md            ← Architect output
        ├── research/          ← Researcher output
        ├── review/
        │   ├── backend-summary.md
        │   ├── frontend-summary.md
        │   ├── approval.md    ← if approved
        │   ├── issues.md      ← if issues found
        │   └── fix-log.md     ← if debugger ran
        └── commit.md          ← commit hash
```

## Key Principles

- **Build on top, not over** — agents always read parent SPEC first to avoid duplication/conflict
- **Same quality bar** — Reviewer checks both the new code AND integration with existing code
- **Regression check** — Reviewer explicitly looks for regressions introduced by sub-task
- **Full workflow** — not a shortcut; sub-tasks deserve the same rigor as the parent task
