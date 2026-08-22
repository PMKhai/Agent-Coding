---
name: code-review
description: Code quality review against SPEC.md. Use when acting as the Reviewer agent — checking correctness, security, and standards, then writing approval.md or issues.md.
user-invocable: false
---

# Code-Review Skill

## Purpose

Review code quality — check correctness, security, and standards against SPEC.md.

## Steps

### Step 1: Read Context

```
1. Read tasks/[task-id]/SPEC.md — the review standard
2. Read tasks/[task-id]/review/code-summary.md — know which files were created
3. Read actual code from target repo or tasks/[task-id]/code/
```

When running interactively in Codex, native `/review` may be used as an
additional diff-aware pass for branch, commit, or uncommitted changes. Treat it
as evidence, not as the final artifact: this skill must still write
`approval.md` or `issues.md`.

### Step 2: Review Checklist

```
CORRECTNESS
- [ ] Code matches SPEC.md requirements
- [ ] All endpoints/features are implemented
- [ ] Business logic is correct
- [ ] Edge cases handled

SECURITY
- [ ] No hardcoded secrets/credentials
- [ ] Input validation present
- [ ] No SQL injection / XSS risk

CODE QUALITY
- [ ] Naming conventions reasonable
- [ ] No obvious code smells
- [ ] Not overly complex

COMPILE/RUN
- [ ] No syntax errors
- [ ] Dependencies fully declared
```

### Step 3: Decision

**APPROVED** — write `tasks/[task-id]/review/approval.md`:

```markdown
# Review: APPROVED

## Files Reviewed
- [list]

## Summary
[Brief summary]

## Notes
[Optional]
```

**ISSUES FOUND** — write `tasks/[task-id]/review/issues.md`:

```markdown
# Review: ISSUES FOUND

## Issues

### Issue 1: [Title]
- **File:** path/to/file
- **Problem:** [Specific description]
- **Fix:** [Suggested fix]
```

## Key Behavior

- **Check against SPEC** — the standard is SPEC.md, not personal preference
- **Be specific** — issues.md must be detailed enough for Debugger to fix immediately
- **Don't nitpick style** — focus on correctness and security
