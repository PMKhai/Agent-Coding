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

## Engineer team — composition

Loaded from `companies.json` (company=`qualgo`, room=`engineer`) when that file
exists. **It does not exist on this machine**, so the default roster in the
skill's Step 1 is the live path. Both lists resolve to:

| Teammate   | Agent            | Owns repos                                |
| ---------- | ---------------- | ----------------------------------------- |
| Architect  | `architect`      | full allowlist (cross-cutting)            |
| Researcher | `researcher`     | (no repo writes — `tasks/[id]/research/`) |
| Designer   | `designer`       | (no repo writes — `tasks/[id]/design/`)   |
| Frontend   | `coder-frontend` | FE dashboards + branding sites            |
| Mobile     | `coder-mobile`   | the mobile app repo                       |
| Backend    | `coder-backend`  | `ops-platform`, `ops-platform-package`    |
| DevOps     | `devops`         | `ops-k8s-assets`                          |
| Reviewer   | `reviewer`       | (no repo writes — review only)            |

Pull the live list at runtime with `Read tasks/.../target-info.md` plus
`Read companies.json` **if it exists**, so the workflow adapts when teams are
added and still runs when the file is absent.

## Flow

```
USER
  | /team-workflow [task-id]
  v
ORCHESTRATOR (main session)
  | 1. read tasks/[id]/input.md
  | 2. resolve WORKSPACE (absolute) + roster — companies.json if present,
  |    else the skill's default
  | 3. write tasks/[id]/team-board.md skeleton (shared task list)
  v
  +--[Stage A: Plan — Architect + Researcher]
  |    Agent(name="Architect",  subagent_type="architect")
  |    Agent(name="Researcher", subagent_type="researcher")
  |    Architect writes SPEC.md and fills the board's lane deliverables
  |    Researcher writes tasks/[id]/research/[topic].md
  |    Lead waits on the ARTIFACTS, not on a returned result
  |
  +--[Stage B: Design — only if the Architect filled the Designer row]
  |    Agent(name="Designer", subagent_type="designer")   # NO isolation
  |    -> design/design-summary.md (artifacts listed by ABSOLUTE path)
  |    Gate: design-summary.md exists AND the Designer board row is done
  |
  +--[Stage C: Execute — parallel teammates]
  |    Agent(name="Frontend", subagent_type="coder-frontend", isolation="worktree", ...)
  |    Agent(name="Mobile",   subagent_type="coder-mobile",   isolation="worktree", ...)
  |    Agent(name="Backend",  subagent_type="coder-backend",  isolation="worktree", ...)
  |    Agent(name="DevOps",   subagent_type="devops",         isolation="worktree", ...)
  |    Every task path in a brief is ABSOLUTE — a worktree has no tasks/ dir
  |    Design context routing:
  |       Frontend, Mobile -> design-summary.md verbatim + artifact paths
  |       Backend, DevOps  -> only their "## Handoff" subsection + artifact paths, if any
  |    Teammates message each other directly by name:
  |       SendMessage(to="Backend",  message="what's the contract for POST /webhooks/x?")
  |       SendMessage(to="Frontend", message="expects { id, status, payload }")
  |    Each teammate updates team-board.md when their lane is done.
  |
  +--[Stage D: Review]
  |    Agent(name="Reviewer", subagent_type="reviewer", prompt="…")
  |    -> review/approval.md or review/issues.md
  |
  +--[If issues] Architect rebalances board -> back to Stage B (if @Designer)
  |              or Stage C for affected lanes only
  v
ORCHESTRATOR: merge lane branches, commit, commits.md, Learner
```

## Usage

```
/team-workflow [task-id]                          # run on existing task dir
/team-workflow --new "task description" --target /path/to/repo
/team-workflow [task-id] --teams frontend,backend  # subset (skip devops if not needed)
```

## Implementation contract

1. **Read** `tasks/[task-id]/input.md`, and `companies.json` if it exists.
2. **Resolve** the absolute `WORKSPACE` path and the teams: engineer room from
   Qualgo when `companies.json` is present; otherwise the default roster in the
   `team-workflow` skill, Step 1. Allow a `--teams` filter. Reject if any
   requested team isn't defined.
3. **Write** `tasks/[task-id]/team-board.md` — the skeleton in the skill's
   Step 1. The orchestrator owns the skeleton and the Researcher row; the
   Architect fills every other Deliverable cell.

4. **Stage A — plan**: spawn Architect and Researcher in one turn. Wait on their
   **artifacts** — `SPEC.md` written, board rows flipped — not on returned
   results: a named spawn becomes a teammate whose output does not return. Skip
   the Researcher when input.md yields no research topic and mark its row `n/a`.

5. **Stage B — design**: read the board. If the Designer Deliverable cell is
   empty, skip this stage. If it is filled, spawn Designer **without
   `isolation`** and wait for `design/design-summary.md` plus a `done` row.
   Designer writes to `tasks/[id]/design/`, never to the target repo — lane
   worktrees are branched from the remote default branch and see neither
   uncommitted files nor unpushed commits.

6. **Stage C — execute**: spawn one teammate per non-empty lane in parallel
   (`isolation="worktree"`, `name=<TitleCase>` — the name is the SendMessage
   address). Each prompt must include:
   - the full SPEC.md content (don't make them re-read)
   - the design block, routed per the rule below
   - their lane row from team-board
   - the team roster (so they know who to SendMessage)
   - the **absolute** path to team-board.md and to their summary file
   - their repo allowlist

   Design routing: Frontend and Mobile get `design-summary.md` verbatim plus the
   absolute artifact paths. Backend and DevOps get only the `### Backend` /
   `### DevOps` subsection under `## Handoff`, plus the absolute artifact paths;
   no subsection → neither field is sent.

   Under Codex, replace parallel same-checkout writers with sequential lane
   execution, and state in each prompt how the work divides, that Codex should
   wait before continuing, and what summary to return. Read `team-board.md`
   after every lane and inject open questions or decisions into the next prompt.

7. **Wait** for every lane's artifacts. If any fail, capture the failure in
   `team-board.md` under "Open questions".

8. **Stage D — review**: spawn Reviewer with `name="Reviewer"` so it can
   SendMessage back to teammates for clarification. Gate on `approval.md` or
   `issues.md` existing.

9. **Loop**: if Reviewer issues, spawn Architect again _(rebalance)_. A
   `@Designer` issue re-runs Stage B before the affected lanes re-run in
   Stage C. Max 3 loops.

10. **Cleanup**: nothing to tear down — teammates end on their own. Merge,
    commit, record hashes in `commits.md`. Spawn Learner. (How the orchestrator
    finds each lane's worktree branch is a pre-existing gap — out of scope here,
    see SPEC §7 open question 3.)

## Spawning pattern (Claude Code)

```js
// Stage A — plan. The lead waits on ARTIFACTS: a named spawn becomes a
// teammate under Agent Teams and its result does not return.
Agent({ subagent_type: "architect",  name: "Architect",  prompt: archBrief });
Agent({ subagent_type: "researcher", name: "Researcher", prompt: resBrief });
// wait for SPEC.md + board rows, then read team-board.md

// Stage B — design, only if the Designer row is filled.
// Deliberately NOT isolated: it writes into the workspace tasks/ tree that the
// worktree-isolated Stage C lanes read from.
Agent({ subagent_type: "designer", name: "Designer", prompt: designerBrief });
// wait for design/design-summary.md AND a "done" Designer row, then read it

// Stage C — parallel. Every task path inside these briefs is ABSOLUTE.
Agent({ subagent_type: "coder-frontend", name: "Frontend", isolation: "worktree", prompt: feBrief });
Agent({ subagent_type: "coder-mobile",   name: "Mobile",   isolation: "worktree", prompt: mbBrief });
Agent({ subagent_type: "coder-backend",  name: "Backend",  isolation: "worktree", prompt: beBrief });
Agent({ subagent_type: "devops",         name: "DevOps",   isolation: "worktree", prompt: dxBrief });
// wait for all — ListAgents() shows who is still live

// Stage D
Agent({ subagent_type: "reviewer", name: "Reviewer", prompt: rvBrief });
```

> `run_in_background: false` is intentionally absent throughout. In an
> interactive session fork mode is on by default, Claude Code runs subagents in
> the background regardless, and cannot be asked for the foreground. The flag is
> honoured only under `-p` and in the Agent SDK.

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
cat tasks/[task-id]/review/{frontend,mobile,backend,devops,architect}-summary.md

# The design handed to the UI lanes
cat tasks/[task-id]/design/design-summary.md
```

## Differences from `/workflow`

| Aspect            | `/workflow`                      | `/team-workflow`                               |
| ----------------- | -------------------------------- | ---------------------------------------------- |
| Spawn shape       | Sequential                       | Plan (Architect + Researcher) → Design → parallel lanes → Reviewer |
| Inter-agent comms | Via orchestrator file IO         | Direct `SendMessage` between teammates         |
| Best for          | Single-repo, single-domain tasks | Cross-team / cross-repo tasks                  |
| Shared state      | `tasks/[id]/*.md` files          | `team-board.md` + mailbox                      |
| Failure mode      | Halts at failing agent           | Other lanes keep going; failed lane rebalances |
| Cost shape        | Lower (one agent at a time)      | Higher (concurrent) but faster wall-clock      |
| Design stage      | Not present                      | Designer runs between plan and lanes when the board says so |
| Stage gate        | Agent result returns to the orchestrator | Artifact on disk — a named teammate's result does not return |

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
- ❌ Spawning Designer with `isolation: "worktree"` — its artifacts would land
  in a throwaway worktree and the retention sweep would remove them.
- ❌ Running Designer on a task with no UI surface. Empty Designer row → skip
  Stage B entirely.
- ❌ Handing a teammate a relative `tasks/...` path, or waiting on its return
  value. The first resolves inside a worktree that has no `tasks/`; the second
  stalls, because a named spawn is a teammate and teammates report through
  files and messages, not results.
