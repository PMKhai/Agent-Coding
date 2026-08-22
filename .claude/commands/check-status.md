---
name: check-status
description: Check how far a task has progressed through the workflow, or list every task in the workspace.
argument-hint: "[project/]<task-id> | --list [project]"
---

# /check-status Command

## Purpose

Check task completion status — which stage a task is at, or list all tasks.

## Usage

```
/check-status [project/task-id]
/check-status [task-id]
/check-status --list
/check-status --list [project-name]
```

## Implementation

### Single task: `/check-status [task-id]`

1. Find the task directory under `tasks/`. If `task-id` contains `/`, use as-is. Otherwise search across all project folders.
2. Check which files exist to determine stage:

| File exists | Stage |
|---|---|
| `review/approval.md` | APPROVED — task complete |
| `review/issues.md` (no approval) | ISSUES FOUND — awaiting Debugger |
| `review/backend-summary.md` or `review/frontend-summary.md` (no review result) | Code written — awaiting Reviewer |
| `SPEC.md` (no summaries) | SPEC ready — awaiting Coder |
| Only `input.md` | Awaiting Architect |

3. Report: task ID, status (complete/pending), current stage.

### List tasks: `/check-status --list [project]`

1. List all directories under `tasks/` (or `tasks/[project]/` if project specified)
2. For each task, check completion stage (same logic as above)
3. Display grouped by project:

```
[project-name]
  [x] task-id-1 — APPROVED
  [ ] task-id-2 — SPEC ready, awaiting Coder
  [!] task-id-3 — ISSUES FOUND, awaiting Debugger
```

## Examples

```
/check-status 20260422-143000-build-login-api
/check-status my-app/20260422-143000-build-login-api
/check-status --list
/check-status --list my-app
```
