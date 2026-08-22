---
name: investigate
description: Trace the root cause of a bug the user is hitting. Interactive and on-demand, not part of the automated workflow.
argument-hint: "<bug description> [--target <repo>] [--fix] [--run [cmd]] [--team]"
---

# /investigate Command

## Purpose

Spawn an Investigator agent to trace the root cause of a bug the user is experiencing.
This is an **interactive, on-demand** command — not part of the automated workflow.

## When to Use

When the user says:

- "/investigate [bug description]"
- "investigate this bug: ..."
- "tìm root cause của bug này..."
- "tôi đang gặp bug X, tìm nguyên nhân"

## Usage

```
/investigate "bug description"
/investigate "bug description" --target /path/to/repo
/investigate --target /path/to/repo   (then describe bug interactively)
```

## Implementation

### Step 1 — Collect bug info

If the user provided a description inline, use it.
If not, ask the user: _"Describe the bug — what happens vs what you expect, and how to trigger it?"_

### Step 2 — Resolve target repo

- If `--target` is provided, use that path
- If not, check if the current working directory is a git repo
- If still unclear, ask the user

### Step 3 — Spawn Investigator agent

```python
investigator = Agent(
    subagent_type="investigator",
    name="Investigator",
    run_in_background=False,
    prompt=f"""
## Your Task
Investigate this bug and identify the root cause.

## Bug Description
{bug_description}

## Target Repo
{target_path}

## Instructions
1. Read the relevant files in the target repo
2. Trace the execution path from trigger to failure
3. Identify the ROOT CAUSE with file:line evidence
4. Write your findings as a Root Cause Report (see format below)

## Output Format
Return a Root Cause Report directly in your response:

### Bug: [one-line summary]

#### Observed vs Expected
- Observed: [what happens]
- Expected: [what should happen]
- Trigger: [what causes it]

#### Causal Chain
1. `path/file:line` — [trigger point]
2. `path/file:line` — [intermediate]
3. `path/file:line` — **ROOT CAUSE**: [why it breaks]

#### Evidence
[Relevant code snippets with explanation]

#### Fix Direction
[Brief suggestion, optional]

## Key Rules
- Follow the bug trail — don't audit the whole codebase
- Back every claim with file:line
- If you need info that's not in the description, note what's missing at the top
- Do NOT fix the code unless explicitly asked
"""
)
```

### Step 4 — Present findings

Return the Investigator's Root Cause Report to the user.
Ask: _"Want me to fix this?"_ — if yes, spawn the Debugger agent with the report
as context. The Investigator cannot apply the fix itself: its frontmatter `tools`
allowlist has no `Edit` or `Write`, and `sync-codex.js` puts it in
`READ_ONLY_AGENTS`, so it is read-only under both runtimes by design.

### Step 5 — Run code (if `--run` provided)

After presenting the Root Cause Report, execute code to verify the bug or validate a fix:

1. **Detect run command** — check for `package.json` (scripts), `Makefile`, `pyproject.toml`, `go.mod`, etc. in the target repo to determine how to run tests or the app.
2. **Ask if ambiguous** — if multiple run targets exist, ask the user: _"Which command should I run? e.g. `npm test`, `make test`, `pytest`"_
3. **Run and report** — execute the command with `Bash`, capture output, and present:
   - Pass/fail result
   - Relevant stdout/stderr lines (filter noise)
   - Whether output confirms the root cause or suggests a different path

```python
# Example: run tests in target repo
bash_result = Bash(command=f"cd {target_path} && {run_command}", timeout=60000)
```

4. **After `--fix`** — if `--fix` was also passed, re-run after applying the fix to confirm the bug is resolved.

## Options

| Option                  | Description                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--target <path>`       | Path to the repo to investigate (default: cwd)                                                                                                                                                                                                                                                                                                                                 |
| `--fix`                 | After the Root Cause Report, hand the fix to the Debugger agent. The Investigator is read-only and never patches the code itself.                                                                                                                                                                                                                                               |
| `--run [cmd]`           | After investigation (and optional fix), run code to verify. If `cmd` is omitted, auto-detect from project files.                                                                                                                                                                                                                                                               |
| `--team`                | When combined with `--fix`, hand the fix off to `/team-workflow` (parallel FE + BE + DevOps teammates) instead of to a single Debugger. Use for cross-layer bugs.                                                                                                                                                                                                              |
| `--context-file <path>` | Read the bug description (and optionally a prior investigation transcript) from a markdown file instead of relying on the inline quoted argument. Used by the queue worker to forward the packaged context of a UI-driven investigation. When present, treat the file's contents as the **primary** bug description, and use the inline quoted argument only as a short title. |

## Example

```
/investigate "login button does nothing on mobile Safari" --target ~/projects/myapp
/investigate "payment webhook fails with 500 on retry" --target ~/projects/backend
/investigate "useEffect runs infinitely when user object updates"

# Run tests after investigation to confirm root cause
/investigate "cart total wrong after discount" --target ~/projects/shop --run
/investigate "auth token expired too early" --target ~/projects/api --run "npm test"

# Find root cause, fix it, then run tests to verify
/investigate "null pointer on checkout" --target ~/projects/shop --fix --run
```
