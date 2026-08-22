---
name: fix-bugs
description: Fix a bug in an already-completed task, reusing that task's SPEC, approval, and commit as context.
argument-hint: "<task-dir> <fix-dir>"
---

# /fix-bugs Command

## Purpose

Fix a bug found in a **completed task**. Uses the original task's full context (SPEC, approval, implementation summaries, commit) to give all agents accurate knowledge of what was built — so bug fixing is precise rather than guesswork.

## Pipeline

```
Bug description + task context
          |
          v
    INVESTIGATOR      ← reads task SPEC + code summaries + bug.md
    (root cause)      → writes fixes/[fix-id]/root-cause.md
          |
          v
     DEBUGGER         ← reads root-cause.md + task context
    (apply fix)       → modifies code in target repo
                      → writes fixes/[fix-id]/fix-log.md
          |
          v
     REVIEWER         ← checks fix against original SPEC
    (approve/reject)  → writes fixes/[fix-id]/review.md
          |
    ┌─────┴─────┐
  ISSUES      APPROVED
    │              │
    v              v
  DEBUGGER     GIT COMMIT
  (re-fix)     + saves fixes/[fix-id]/commit.md
  (max 2x)
```

## Usage

```
/fix-bugs tasks/[project]/[task-id] tasks/[project]/[task-id]/fixes/[fix-id]
```

Both paths are passed by the UI when launching a fix run.

## When to Use

- Task status is `done` (committed)
- User reports a bug in the delivered code
- Invoked via the "Fix Bug" button in the task detail UI

---

## Implementation

### Step 1 — Load context

Read all available artifacts from the original task:

```
taskPath = args[0]   (e.g. tasks/league-of-legend/20260428-133034-lol-001)
fixPath  = args[1]   (e.g. tasks/league-of-legend/20260428-133034-lol-001/fixes/20260501-120000-login-broken)
```

Load:
- `[taskPath]/input.md`              — original description + target repo path
- `[taskPath]/SPEC.md`               — architecture designed by Architect
- `[taskPath]/review/approval.md`    — what Reviewer approved
- `[taskPath]/review/backend-summary.md`   — what was implemented (backend)
- `[taskPath]/review/frontend-summary.md`  — what was implemented (frontend)
- `[taskPath]/commit.md`             — commit hash + message
- `[fixPath]/bug.md`                 — user's bug description

Extract `targetPath` from `input.md` (line matching `**Path:**`).
Load `projects/[project]/context.md` if it exists.

**Check for MCP tools**: Read `projects/[project]/mcp.json` — if it exists, agents have MCP tools available (e.g. GitNexus for querying code graph). Include in all agent prompts: "You have MCP tools available. Use `mcp__gitnexus__query` to search the code graph, `mcp__gitnexus__impact` to check blast radius, and `mcp__gitnexus__context` to understand how components relate — this helps trace the bug through the dependency chain."

**Also scan for all prior fixes and subtasks** (excludes the current fixPath):
- List all dirs in `[taskPath]/fixes/` that are NOT the current fix and have a `commit.md` (meaning they completed)
- List all dirs in `[taskPath]/subtasks/` that have a `commit.md`
- For each completed prior fix: read `bug.md`, `root-cause.md` (summary), `fix-log.md` (summary), `commit.md`
- For each completed prior subtask: read `input.md`, `SPEC.md` (summary), `review/backend-summary.md`, `review/frontend-summary.md`, `commit.md`

Build a `TASK_CONTEXT` block:

```
## Original Task Context

### What Was Built (SPEC)
[contents of SPEC.md]

### Implementation (Backend)
[contents of backend-summary.md if exists]

### Implementation (Frontend)
[contents of frontend-summary.md if exists]

### Reviewer Approval
[contents of approval.md]

### Original Commit
[contents of commit.md]

### Project Conventions
[contents of projects/[project]/context.md if exists]

---

## Accumulated Change History
> All bug fixes and sub-tasks that have been applied AFTER the original task.
> The current codebase reflects ALL of these changes on top of the original commit.

### Bug Fixes Applied

[For each completed fix (sorted by fix-id/date, oldest first):]
#### Fix: [fix-id]
- **Bug:** [contents of bug.md — one line]
- **Root Cause:** [key finding from root-cause.md]
- **Fix Applied:** [summary from fix-log.md — files changed + what changed]
- **Commit:** [contents of commit.md]

(none if no prior fixes)

### Sub-tasks Applied

[For each completed subtask (sorted by subtask-id/date, oldest first):]
#### Sub-task: [subtask-id]
- **Description:** [contents of input.md — one line]
- **What Was Added:** [summary from SPEC.md — new features/changes]
- **Backend Changes:** [summary from backend-summary.md if exists]
- **Frontend Changes:** [summary from frontend-summary.md if exists]
- **Commit:** [contents of commit.md]

(none if no prior subtasks)

---
IMPORTANT: The code in the target repository reflects ALL of the above changes.
When investigating or fixing bugs, consider that prior fixes and sub-tasks may have
modified files from the original implementation. Read the actual current file contents —
do not assume the code matches only the original SPEC.
```

### Step 2 — Spawn Investigator

```python
investigator = Agent(
    subagent_type="investigator",
    run_in_background=False,
    prompt=f"""
You are the Investigator agent. A bug has been found in a completed task.
Your job: trace the root cause using the code + the original task context below.

## Bug Report
{bug_description}

## Target Repository
{targetPath}

## {TASK_CONTEXT}

## Instructions
1. Read the relevant code files in the target repo
2. Use the SPEC and implementation summaries above to understand what was *intended*
3. Compare intended vs actual behavior to locate the bug
4. Trace the causal chain: trigger → intermediate → ROOT CAUSE (file:line)
5. Write your findings to: {fixPath}/root-cause.md

## Output File Format
Write {fixPath}/root-cause.md:

```markdown
# Root Cause Report

## Bug Summary
[one-line description]

## Observed vs Expected
- **Observed:** [what happens]
- **Expected:** [what should happen]
- **Trigger:** [how to reproduce]

## Causal Chain
1. `file:line` — [trigger point]
2. `file:line` — [intermediate]
3. `file:line` — **ROOT CAUSE**: [why it breaks]

## Evidence
[relevant code snippets with explanation]

## Fix Direction
[what needs to change — do NOT implement the fix]
```
"""
)
```

Wait for Investigator. Read `{fixPath}/root-cause.md`.

### Step 3 — Spawn Debugger

```python
debugger = Agent(
    subagent_type="debugger",
    run_in_background=False,
    prompt=f"""
You are the Debugger agent. A bug has been found in a completed task.
Your job: apply the fix based on the root cause report and task context.

## Root Cause Report
{root_cause_content}

## Bug Description (from user)
{bug_description}

## Target Repository
{targetPath}

## {TASK_CONTEXT}

## Instructions
1. Read the root cause report carefully — understand exactly what is broken and why
2. Apply a surgical fix to the code in {targetPath}
3. Do NOT refactor or change anything beyond what is needed to fix this specific bug
4. Verify the fix addresses the root cause, not just the symptom
5. Write fix-log to: {fixPath}/fix-log.md

## Output File Format
Write {fixPath}/fix-log.md:

```markdown
# Fix Log

## Bug Fixed
[one-line]

## Root Cause (confirmed)
[from root-cause.md]

## Fix Applied
- **File:** `path/to/file`
- **Change:** [what changed and why]

## Files Modified
- `path/to/file1` — [description]
- `path/to/file2` — [description]

## Verification
[how the fix addresses the root cause, not just the symptom]
```
"""
)
```

Wait for Debugger. Read `{fixPath}/fix-log.md`.

### Step 4 — Spawn Reviewer

```python
reviewer = Agent(
    subagent_type="reviewer",
    run_in_background=False,
    prompt=f"""
You are the Reviewer agent. A bug fix has been applied to a completed task.
Your job: review the fix for correctness, regressions, and spec compliance.

## Fix Log
{fix_log_content}

## Root Cause Report
{root_cause_content}

## Target Repository
{targetPath}

## {TASK_CONTEXT}

## Review Checklist
1. Does the fix actually address the root cause (not just the symptom)?
2. Does the fix introduce any new bugs or regressions?
3. Is the fix consistent with the original SPEC and project conventions?
4. Is the fix surgical — no unrelated changes?

## Output
If APPROVED: write {fixPath}/review.md with "# Review: APPROVED" as first line
If ISSUES:   write {fixPath}/review.md with "# Review: ISSUES FOUND" and list each issue

Write {fixPath}/review.md.
"""
)
```

Wait for Reviewer. Read `{fixPath}/review.md`.

### Step 5 — Handle result

**If APPROVED:**
1. Read `targetPath` and extract project name from `input.md`
2. Git commit the fix:
   ```bash
   cd {targetPath}
   git add -A
   git commit -m "fix: [bug summary from root-cause.md]"
   ```
3. Save commit hash to `{fixPath}/commit.md`
4. Report success to user: "Bug fixed and committed. Fix log: `{fixPath}/fix-log.md`"

**If ISSUES FOUND:**
- Re-spawn Debugger with the review issues
- Re-spawn Reviewer
- Max 2 retry loops — if still failing after 2, report to user and stop

### Step 6 — Report

Tell the user:
- What the root cause was (summary from root-cause.md)
- What was fixed (summary from fix-log.md)
- Commit hash (from commit.md)
- If failed: what issues remain

---

## Fix Directory Structure

```
tasks/[project]/[task-id]/
└── fixes/
    └── [fix-id]/         ← e.g. 20260501-120000-login-broken
        ├── bug.md         ← user's bug description (created by server before run)
        ├── root-cause.md  ← Investigator output
        ├── fix-log.md     ← Debugger output
        ├── review.md      ← Reviewer output
        └── commit.md      ← commit hash (if approved)
```

## Key Principles

- **Context-first** — agents always read SPEC + summaries before touching code. They know what was *intended*, not just what's *there*.
- **Surgical fixes** — no refactoring, no scope creep. Fix only the reported bug.
- **Blame the spec** — if the bug reveals a spec ambiguity, note it in the root-cause report.
- **Max 2 retries** — avoid infinite loops; escalate to user if fix can't pass review.
