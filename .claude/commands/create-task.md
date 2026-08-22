---
name: create-task
description: Initialize a task directory for the multi-agent workflow, optionally bound to a target repo.
argument-hint: "<description> [--target <repo>]"
---

# /create-task Command

## Purpose

Initialize a new task directory for the multi-agent workflow.

## Usage

```
/create-task "Task description" --target /path/to/repo
/create-task "Task description" --target /path/to/repo --ticket PROJ-123
/create-task "Task description"
```

## Implementation

### 1. Parse input

Extract from command args:
- **description** — the task description text
- **--target / -t** — optional path to target repository
- **--ticket** — optional ticket ID (e.g. `PROJ-123`, `#456`, `sprint-1-auth`)

### 2. Derive identifiers

- **project name**: if `--target` provided, slugify the repo folder name (lowercase, replace spaces/special chars with `-`). If no target, use `"workspace"`.
- **task ID**: if `--ticket` provided, use `YYYYMMDD-HHMMSS-[ticket]` (slugified). Otherwise, use `YYYYMMDD-HHMMSS-slugified-description` (slug max 50 chars).
- **task dir**: `tasks/[project]/[task-id]/`

### 3. Create directories

Using Bash `mkdir -p`:

```
tasks/[project]/[task-id]/code/
tasks/[project]/[task-id]/review/
tasks/[project]/[task-id]/research/
```

### 4. Create project context (if new project)

If `projects/[project]/context.md` does NOT exist, create it:

```markdown
# Project Context: [project-name]

**Repo path:** [target path or N/A]

## Tech Stack

<!-- Describe the tech stack, frameworks, languages used -->

## Coding Conventions

<!-- Naming conventions, file structure rules, patterns to follow -->

## Forbidden Patterns

<!-- Things agents must NOT do in this project -->

## Notes

<!-- Any other context agents should know before working on this project -->
```

### 5. Write input.md

Write to `tasks/[project]/[task-id]/input.md`:

```markdown
# Task Input

**Task ID:** [task-id]
**Project:** [project-name]
**Created:** [ISO datetime]
**Description:** [description]

## Target Repository

**Path:** [target path]
**Name:** [repo folder name]

## Project Context

See: projects/[project]/context.md

## User's Request

[description]
```

### 6. Write target-info.md (if --target)

Write to `tasks/[project]/[task-id]/target-info.md`:

```markdown
# Target Repository Info

**Path:** [target path]
**Name:** [repo folder name]
**Project:** [project-name]
**Project context:** projects/[project]/context.md
```

### 7. Report to user

- Task ID created
- Project name
- Task directory path
- Target repo (if any)
- Suggest next step: `/workflow tasks/[project]/[task-id]`

## Examples

```
/create-task "Build login page" --target ~/projects/my-app
/create-task "Build login page" --target ~/projects/my-app --ticket PROJ-123
/create-task "Fix payment bug" -t /Users/me/projects/payments
/create-task "Refactor auth module"
```

With `--ticket PROJ-123`, the task folder becomes:
`tasks/my-app/20260428-143000-PROJ-123/` instead of `tasks/my-app/20260428-143000-build-login-page/`
