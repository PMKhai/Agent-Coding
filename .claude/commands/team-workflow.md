---
name: team-workflow
description: Run a task as a coordinated Agent Team — teammates work concurrently and message each other. Use when a task crosses team boundaries (FE + BE, impl + infra).
argument-hint: "<task-id> | --new <description> [--target <repo>] [--teams <a,b>]"
---

# /team-workflow Command

## Purpose

Run a task through a **coordinating team** of Claude teammates instead of the
sequential `Agent()` chain that `/workflow` uses. Each teammate:

- has their own session and context window
- runs in parallel with the others
- can `SendMessage` to teammates directly (no orchestrator round-trip)
- shares a task list and mailbox

Codex fallback: Codex has subagents but no Agent Teams or `SendMessage` in this
workspace. When this command is invoked from Codex, keep the `team-board.md`
contract, have the orchestrator relay messages through the board, and run
write-heavy lanes sequentially unless the user has prepared separate Git
worktrees and separate Codex sessions.

This is the right shape when:

- the work crosses team boundaries (a feature needs FE + BE + DevOps)
- teammates need to negotiate contracts (Frontend asks Backend "what's the API
  signature?" mid-run)
- you want competing-hypothesis debugging (3 teammates pursue 3 theories)

`/workflow` is still the right tool when the chain is strictly sequential —
spec → code → review — and you want the orchestrator to gatekeep each step.

## When to Use

The user says:

- `/team-workflow [task-id]`
- "spawn the engineer team for this", "team workflow", "team it up"
- "this needs FE and BE talking"
- "rerun with the team"

## Engineer team — the default Qualgo composition

Loaded from `companies.json` (company=`qualgo`, room=`engineer`). Today:

| Teammate  | Agent            | Owns repos                             |
| --------- | ---------------- | -------------------------------------- |
| Architect | `architect`      | full allowlist (cross-cutting)         |
| Frontend  | `coder-frontend` | FE dashboards + branding sites         |
| Backend   | `coder-backend`  | `ops-platform`, `ops-platform-package` |
| DevOps    | `devops`         | `ops-k8s-assets`                       |
| Reviewer  | `reviewer`       | (no repo writes — review only)         |

Pull the live list at runtime with `Read tasks/.../target-info.md` plus
`Read companies.json` so the workflow adapts when teams are added.

## Flow

```
USER
  | /team-workflow [task-id]
  v
ORCHESTRATOR (main session)
  | 1. read tasks/[id]/input.md
  | 2. read companies.json -> resolve company.room.teams
  | 3. write tasks/[id]/team-board.md (shared task list)
  v
  +--[Stage A: Plan — Architect alone]
  |    Agent(name="Architect", subagent_type="architect", prompt="…")
  |    writes SPEC.md and tasks/[id]/team-board.md with assignments
  |
  +--[Stage B: Execute — parallel teammates]
  |    Agent(name="Frontend", subagent_type="coder-frontend", run_in_background=true, ...)
  |    Agent(name="Backend",  subagent_type="coder-backend",  run_in_background=true, ...)
  |    Agent(name="DevOps",   subagent_type="devops",         run_in_background=true, ...)
  |    Teammates message each other directly by name:
  |       SendMessage(to="Backend",  message="what's the contract for POST /webhooks/x?")
  |       SendMessage(to="Frontend", message="expects { id, status, payload }")
  |       SendMessage(to="DevOps",   message="new env var WEBHOOK_SECRET must land in dev kustomize")
  |    Each teammate updates team-board.md when their lane is done.
  |
  +--[Stage C: Review]
  |    Agent(name="Reviewer", subagent_type="reviewer", prompt="…")
  |    -> review/approval.md or review/issues.md
  |
  +--[If issues] Architect rebalances board -> back to Stage B for affected lanes only
  v
ORCHESTRATOR: commit + tasks/[id]/commit.md + Learner
```

## Usage

```
/team-workflow [task-id]                          # run on existing task dir
/team-workflow --new "task description" --target /path/to/repo
/team-workflow [task-id] --teams frontend,backend  # subset (skip devops if not needed)
```

## Implementation contract

1. **Read** `tasks/[task-id]/input.md` and `companies.json`.
2. **Resolve teams**: pick the engineer room from Qualgo by default, allow
   `--teams` filter. Reject if any requested team isn't defined.
3. **Write** `tasks/[task-id]/team-board.md` template:

   ```markdown
   # Team board — [task-id]

   ## Task

   <copy from input.md>

   ## Lanes (filled by Architect)

   - [ ] Architect — design spec
   - [ ] Frontend — <empty>
   - [ ] Backend — <empty>
   - [ ] DevOps — <empty>
   - [ ] Reviewer — gate

   ## Open questions (teammates append as they arise)

   ## Decisions (Architect locks here)
   ```

4. **Stage A — plan**: spawn Architect _foreground_, prompt it to write SPEC.md
   **and** fill the lanes table with concrete deliverables per team.

5. **Stage B — execute**: read updated team-board, spawn one teammate per
   non-empty lane _in parallel_ (`run_in_background=true`, `name=<TitleCase>` —
   the name is the SendMessage address). Each prompt must include:
   - the full SPEC.md content (don't make them re-read)
   - their lane row from team-board
   - the team roster (so they know who to SendMessage)
   - the path to team-board.md (so they tick their checkbox + log decisions)
   - their repo allowlist (from companies.json)

   Under Codex, replace parallel same-checkout writers with sequential lane
   execution. Read `team-board.md` after every lane and inject any open
   questions or decisions into the next lane prompt.

6. **Wait** for all teammates to finish. If any fail, capture stderr in
   `tasks/[task-id]/team-board.md` under "Open questions".

7. **Stage C — review**: spawn Reviewer foreground with `name="Reviewer"` so it
   can SendMessage back to teammates for clarification.

8. **Loop**: if Reviewer issues, spawn Architect again _(rebalance)_, then
   re-spawn only the affected teammates. Max 3 loops.

9. **Cleanup**: nothing to tear down — teammates end on their own. Commit the
   result. Spawn Learner.

## Spawning pattern (Claude Code)

```js
// Stage A
const arch = Agent({
  subagent_type: "architect",
  name: "Architect",
  run_in_background: false,
  prompt: `… write SPEC.md AND fill tasks/${taskId}/team-board.md lanes …`,
});

// Stage B — parallel
const fe = Agent({
  subagent_type: "coder-frontend",
  name: "Frontend",
  run_in_background: true,
  isolation: "worktree",
  prompt: feBrief,
});
const be = Agent({
  subagent_type: "coder-backend",
  name: "Backend",
  run_in_background: true,
  isolation: "worktree",
  prompt: beBrief,
});
const dx = Agent({
  subagent_type: "devops",
  name: "DevOps",
  run_in_background: true,
  isolation: "worktree",
  prompt: dxBrief,
});
// wait for all — ListAgents() shows who is still live

// Stage C
const rv = Agent({
  subagent_type: "reviewer",
  name: "Reviewer",
  run_in_background: false,
  prompt: rvBrief,
});
```

## Task complete when

1. `SPEC.md` written + `team-board.md` fully checked
2. Every assigned teammate reported back via `team-board.md` row check
3. `review/approval.md` status APPROVED
4. Code compiles in each touched repo
5. Git commit per repo, hashes saved in `tasks/[task-id]/commits.md`
6. Learner ran

## Status commands

```bash
# Live board for a running team-workflow
cat tasks/[task-id]/team-board.md

# Per-team summary
cat tasks/[task-id]/review/{frontend,backend,devops,architect}-summary.md
```

## Differences from `/workflow`

| Aspect            | `/workflow`                      | `/team-workflow`                               |
| ----------------- | -------------------------------- | ---------------------------------------------- |
| Spawn shape       | Sequential                       | Parallel with Architect + Reviewer as bookends |
| Inter-agent comms | Via orchestrator file IO         | Direct `SendMessage` between teammates         |
| Best for          | Single-repo, single-domain tasks | Cross-team / cross-repo tasks                  |
| Shared state      | `tasks/[id]/*.md` files          | `team-board.md` + mailbox                      |
| Failure mode      | Halts at failing agent           | Other lanes keep going; failed lane rebalances |
| Cost shape        | Lower (one agent at a time)      | Higher (concurrent) but faster wall-clock      |

Codex degrades `/team-workflow` to file-based coordination through
`team-board.md`; this preserves the artifact contract but loses direct
teammate-to-teammate messaging.

## Common mistakes

- ❌ Spawning all teammates without Architect's lane assignments — they don't
  know where to draw the line. Always run Stage A first.
- ❌ Spawning a teammate without `name` — an unnamed agent has no address, so
  nobody can SendMessage it. Always pass `name`.
- ❌ Passing `team_name` — deprecated and ignored. The session has one implicit
  team; the name alone makes an agent reachable.
- ❌ Pushing too many teammates — start with the lanes the Architect filled in,
  not "all 4 just in case". Empty lane → no teammate.
- ❌ Letting teammates touch repos outside their allowlist — pass each
  teammate's repo list via `--add-dir` only for those paths.
