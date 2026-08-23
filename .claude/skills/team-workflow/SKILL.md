---
name: team-workflow
description: Run a task across parallel lanes — Architect and Researcher plan, Designer hands the UI lanes a design, Frontend/Mobile/Backend/DevOps execute, Reviewer gates. Lanes coordinate through a shared board. Use when a task crosses team boundaries.
user-invocable: true
---

# Team-workflow skill

Run a task with **multiple teammates running concurrently and messaging each
other directly** instead of a single sequential agent chain. This is the
right pattern when a task naturally touches more than one engineering team.

## Decide whether to use this skill

Use `/team-workflow` (this skill) when:

- The task description names ≥2 teams ("FE + BE", "API + dashboard",
  "service + k8s manifest").
- There's a contract to negotiate (API signature, env var, message schema).
- The user explicitly asked for "team" or "parallel".

Otherwise prefer `/workflow` — it's cheaper and simpler.

## Inputs

- `task-id` — a directory under `tasks/[project]/[task-id]/` with `input.md`
  and optionally `target-info.md`.
- Reads `companies.json` at workspace root to discover team rosters. **The file
  is optional.** When it is absent, or has no company matching the target repo,
  use the default roster in Step 1 — do not stop and do not ask for the file.

## Step 1 — Plan the team

1. `Read tasks/[task-id]/input.md` and any `target-info.md`.
2. Resolve `WORKSPACE` — the absolute path of this workspace. Every task path
   handed to a teammate is built from it. Never hand a teammate a relative
   `tasks/...` path: with `isolation: "worktree"` it resolves inside the
   worktree, where `tasks/` is gitignored and therefore absent.
3. Resolve the roster:
   - If `companies.json` exists, pick `companies[].rooms[]` where
     `kind === "engineer"` for the company that owns the target repo.
     Default company = `qualgo`.
   - **If it does not exist, or no company matches, use the default roster
     below.** This is the normal path on a fresh machine, not an error.
   - If the user passed `--teams a,b`, filter to that set. Architect and
     Reviewer are never filtered out.

   Default roster:

   | Teammate   | `subagent_type`  | `name`       | Writes to                       |
   | ---------- | ---------------- | ------------ | ------------------------------- |
   | Architect  | `architect`      | `Architect`  | `tasks/[id]/` + the target repo |
   | Researcher | `researcher`     | `Researcher` | `tasks/[id]/research/`          |
   | Designer   | `designer`       | `Designer`   | `tasks/[id]/design/`            |
   | Frontend   | `coder-frontend` | `Frontend`   | the target repo                 |
   | Mobile     | `coder-mobile`   | `Mobile`     | the target repo                 |
   | Backend    | `coder-backend`  | `Backend`    | the target repo                 |
   | DevOps     | `devops`         | `DevOps`     | the target repo                 |
   | Reviewer   | `reviewer`       | `Reviewer`   | `tasks/[id]/review/` only       |

   With no target repo, "the target repo" means `tasks/[id]/code/`.

4. Derive the Researcher's topics from `input.md`: unfamiliar libraries, APIs,
   protocols, or anything the user asked to be researched. No topic → skip
   Researcher and mark its row `n/a`.
5. Write the `team-board.md` skeleton (template below). The **orchestrator**
   owns the skeleton and the Researcher row; the Architect fills every other
   Deliverable cell.
6. There is no team object to create — the session has a single implicit team.
   Each teammate's `name` is its address; keep names stable per task so a
   resumed run can message the same teammates.

`team-board.md` skeleton:

```markdown
# Team board — [task-id]

## Task
<one paragraph from input.md>

## Lanes
| Team       | Deliverable          | Status |
| ---------- | -------------------- | ------ |
| Architect  | SPEC.md + this board | [ ]    |
| Researcher | <topics, or n/a>     | [ ]    |
| Designer   |                      | [ ]    |
| Frontend   |                      | [ ]    |
| Mobile     |                      | [ ]    |
| Backend    |                      | [ ]    |
| DevOps     |                      | [ ]    |
| Reviewer   | gate                 | [ ]    |

## Contracts (lock here once teams agree)

## Open questions (anyone appends)
```

Status values: `[ ]`, `done`, `blocked`, `n/a`.

## Step 2 — Plan lane (Architect + Researcher)

Spawn both in **one tool-use turn**, mirroring `/workflow` Stage 1. The lead
waits on their **artifacts** — `SPEC.md` written and the Architect's board row
flipped to `done` — never on a returned result. `run_in_background: false` is
deliberately absent: in an interactive session fork mode is on by default,
Claude Code runs subagents in the background regardless, and cannot be asked for
the foreground. Writing the flag would invite the reader to believe the lead
blocks.

```
Agent({
  subagent_type: "architect",
  name: "Architect",
  prompt: `
You are the Architect for ${WORKSPACE}/tasks/${taskId}.
Read ${WORKSPACE}/tasks/${taskId}/input.md and the target repo.
Output two artefacts:
  1. ${WORKSPACE}/tasks/${taskId}/SPEC.md  — the full spec
  2. ${WORKSPACE}/tasks/${taskId}/team-board.md — the orchestrator has written
     the skeleton. Fill the Deliverable cell for every lane you need. Leave a
     cell empty for a lane you do not need; an empty cell means we will not
     spawn that teammate. Do NOT touch the Researcher row — the orchestrator
     owns it. Flip your own row to done when both files are written.

Teammates available: ${rosterListing}

Fill the **Designer** row only if the task has a design surface — at least one of:
  - a new user-visible screen, page, or component
  - a change to an existing UI's layout, visual system, or interaction states
  - a deliverable that is itself a design artifact (diagram, deck, doc figure)
None of those → leave it empty. A task with no UI surface must not pay for a
Designer pass. When you fill it, name the screens and states Designer must
produce, and add a [DESIGN] section to SPEC.md stating those screens, their
states, and their constraints.

Fill the **Mobile** row only when the task touches a React Native / Expo surface.

Make deliverables narrow and verifiable. No "wire up X" — say "create
POST /api/x with payload schema {...} and return 201 {id}".
`
});

Agent({
  subagent_type: "researcher",
  name: "Researcher",
  prompt: `
Research the following for ${WORKSPACE}/tasks/${taskId}: ${researchTopics}

Write findings to ${WORKSPACE}/tasks/${taskId}/research/[topic].md — one file
per topic, each with Summary, Key findings, Recommendations.
When done, edit ${WORKSPACE}/tasks/${taskId}/team-board.md and flip the
Researcher row to done.
`
});
```

Skip the Researcher spawn entirely when Step 1 derived no topic.

Wait for both artifacts, then `Read` the board. Parse the Deliverable cells: a
non-empty Designer cell selects Step 3; the non-empty coder/DevOps cells select
Step 4.

> A teammate does not get its definition's `skills:` preload — see the note in
> Step 4. `researcher.md` declares `skills: [research]`, so a Researcher running
> as a teammate discovers that skill at runtime instead of loading it at
> startup. Costs latency, not capability.

## Step 3 — Design lane (conditional)

Run this step **only if the Designer row's Deliverable cell is non-empty.**
Otherwise skip straight to Step 4.

Designer runs **without `isolation`** — it must write into the real workspace
`tasks/` directory that the lanes read from. Do not pass `isolation: "worktree"`
here: its artifacts would land in a throwaway worktree, and the retention sweep
would remove them.

```
Agent({
  subagent_type: "designer",
  name: "Designer",
  // NO isolation — see "Where your output goes" below
  prompt: `
You are Designer for ${WORKSPACE}/tasks/${taskId}.

## Your lane
${designerLaneRow}

## Inputs — read them, you are not isolated
- ${WORKSPACE}/tasks/${taskId}/SPEC.md — the [DESIGN] and frontend sections
- ${WORKSPACE}/tasks/${taskId}/research/ — every file, if the directory exists
- ${WORKSPACE}/projects/${project}/context.md — the existing design system. Reuse it.

## Where your output goes
Write every artifact under ${WORKSPACE}/tasks/${taskId}/design/.
Do NOT write into ${repoPath}/design/. The coder lanes run in git worktrees
branched from the remote default branch, so they see neither uncommitted files
nor unpushed commits in that repo.

design-summary.md must:
- list every artifact by its ABSOLUTE path (a relative path does not resolve
  from inside a lane's worktree, where tasks/ does not exist at all)
- end with a "## Handoff" section carrying a "### Backend" and/or "### DevOps"
  subsection ONLY when the design imposes a concrete requirement on that lane —
  an endpoint shape, a payload field, an asset/CDN/build requirement.
  No requirement → no subsection. Frontend and Mobile receive the whole file
  regardless, so they need no subsection.

When done, edit ${WORKSPACE}/tasks/${taskId}/team-board.md and flip the Designer
row to done.
`
});
```

**Do not gate this stage on the spawn's return value.** With Agent Teams
enabled a named spawn becomes a teammate, and a teammate's idle notification
does not carry its output — an orchestration flow that waits on the result can
stall. The stage is complete when **both**:

1. `${WORKSPACE}/tasks/${taskId}/design/design-summary.md` exists and is non-empty;
2. the Designer row on the board reads `done`.

Then `Read` `design-summary.md` — its text is what Step 4 inlines.

If only (1) holds, accept the artifact, flip the row yourself, and note it under
"Open questions"; teammates are documented to sometimes miss marking a task
complete. If (1) never holds within your wait budget, do **not** start the lanes
on a half-written design: mark the Designer row `blocked`, write the stall into
"Open questions", and either resume Designer once or continue with no design
block in any brief — and say which you did.

Designer has exited by the time the lanes run. A lane that needs a design
decision **appends it to "Open questions" on the board** — that is the
mechanism, and it works in every runtime and every spawn mode. The orchestrator
reads the board at the next checkpoint and resolves the question by re-spawning
a fresh `designer` with the question and the existing `design-summary.md` as
context.

**Claude Code only** — where the previous Designer is still live and you are in
an interactive Claude session, `SendMessage(to: "Designer", …)` resumes it from
its own transcript instead, which is cheaper; on Codex, and under `claude -p`
where no teammate exists, re-spawn a fresh `designer` with the board question
inlined, which is the path described in the paragraph above. That resume is an
**optimisation, not the contract**, and it is also unavailable once the agent
has exited. Never let a design decision reach a lane only through a message — it
must land on the board or in `design-summary.md`, or the next runtime to run
this workflow loses it.

**Codex.** Run Designer as an ordinary subagent, then the coder lanes one at a
time in the same checkout. Say in the prompt how the work divides, that Codex
should wait before continuing, and what summary to return. `tasks/` is plainly
visible there — no worktree, no boundary — so the file gate above is redundant
but still correct.

## Step 4 — Execute in parallel

For each filled lane (NOT Architect, NOT Researcher, NOT Designer, NOT
Reviewer — those ran in Steps 2 and 3), spawn in one tool-use turn (all
`run_in_background: true`):

```
Agent({
  subagent_type: <team.agent>,        // coder-frontend / coder-mobile / coder-backend / devops
  name: <PascalCase team name>,        // "Frontend" — this is the SendMessage address
  run_in_background: true,
  isolation: "worktree",               // each team works on an isolated copy
  prompt: teammateBrief({
    teamName,
    spec: <full SPEC.md content>,
    design: <see the design-routing rule below — omit entirely when it yields nothing>,
    designArtifacts: <absolute-path artifact list from design-summary.md, or omit>,
    researchDir: `${WORKSPACE}/tasks/${taskId}/research/`,   // omit if absent
    lane: <row from team-board>,
    roster: <listing of other teammates with their names + agent + repos>,
    boardPath: `${WORKSPACE}/tasks/${taskId}/team-board.md`, // ABSOLUTE
    summaryPath: `${WORKSPACE}/tasks/${taskId}/review/<team>-summary.md`, // ABSOLUTE
    repoAllowlist: team.repos,
  })
});
```

Every task path in a brief is **absolute**. A lane resolves a relative
`tasks/...` inside its own worktree, where the directory does not exist at all —
`tasks/` is gitignored and there is no `.worktreeinclude` — so the board edit and
the status flip this workflow depends on would never land.

**Design routing — decide `design` per lane, do not send it to everyone:**

| Lane             | Gets                                                                  |
| ---------------- | --------------------------------------------------------------------- |
| Frontend, Mobile | `design-summary.md` verbatim + the artifact list                      |
| Backend, DevOps  | ONLY the `### Backend` / `### DevOps` subsection under `## Handoff`, if present, + the artifact list. Absent → omit both fields entirely. |
| Reviewer         | `design-summary.md` verbatim (Step 5)                                 |

Designer did not run → omit `design` and `designArtifacts` from every brief.
Never inline prototype HTML — the summary carries the tokens and decisions, and
the artifact paths carry the rest.

**A teammate does not get its definition's `skills:` or `mcpServers:`.** Those
frontmatter fields are dropped when a subagent definition runs as a teammate;
the definition body is appended to the system prompt, and skills/MCP come from
project and user settings instead. Nine agent files here declare `skills:`. Do
not compensate by pasting skill content into the brief — the skill is still
discoverable at runtime. This costs latency, not capability.

`teammateBrief` template:

```
You are ${teamName}, working on ${WORKSPACE}/tasks/${taskId} alongside the
teammates below.

## Your lane
${lane}

## Your repos
You can edit files inside these directories ONLY:
${repos.join("\n")}

## The spec (don't re-read, here it is)
${spec}

## The design (don't re-read, here it is)
${design}

## Design artifacts
These are ABSOLUTE paths in the workspace, outside your worktree. Open them —
they are the design; the summary above is only its description.
${designArtifacts}

## Research
Findings for this task are on disk at ${researchDir}. Read what your lane needs.

## Your teammates
${roster}

## How to coordinate — the board is the contract

${boardPath} is the coordination channel that works everywhere. Direct
messaging does not: `SendMessage` exists only for Claude Code teammates, and is
absent under Codex and under `claude -p`. Never let a contract live only in a
message.

- Need something from another lane? Append the question to "Open questions",
  tagged `@TeamName`, and keep working on what does not depend on it.
- Reached an agreement with another lane? Append it to "Contracts". That entry
  is the agreement — a message that is not written down did not happen.
- A design decision you need after Designer has exited goes to "Open questions"
  too. The orchestrator resolves it at the next checkpoint.
- When your lane is done, write ${summaryPath}, then edit ${boardPath} and flip
  your row's Status from [ ] to done. Both paths are absolute — use them as
  given; your worktree has no tasks/ directory.

**Claude Code only, and optional:** if `SendMessage` is in your tool list you may
also ask a teammate directly — `SendMessage(to: "Backend", message: "will POST
/webhooks/x return 201 or 202?")` — to get an answer sooner. Write the outcome to
"Contracts" regardless. If the tool is absent, the board alone is sufficient;
do not stall looking for it.

Stop conditions:
- Your lane checkbox is done AND no open questions tagged @${teamName}.
- A blocker you cannot resolve from the board and the spec → append it to Open
  questions, tag it, and exit. Do not spin.

Do NOT touch other teams' repos. Do NOT edit Reviewer's lane.
```

The `design`, `designArtifacts` and `researchDir` blocks are omitted **heading
included** when their value is empty.

**Do not gate this stage on the spawns' return values**, for the same reason as
Steps 2, 3 and 5: a named spawn is a teammate, and a teammate's idle
notification does not carry its output. A lane is complete when **both**:

1. `${WORKSPACE}/tasks/${taskId}/review/<team>-summary.md` exists and is
   non-empty;
2. that lane's row on the board reads `done`.

Wait until every spawned lane satisfies both, or your wait budget runs out.

If only (1) holds for a lane, accept the artifact, flip the row yourself, and
note it under "Open questions" — teammates are documented to sometimes miss
marking a task complete. If (1) never holds for a lane within the budget, mark
that row `blocked`, write the stall into "Open questions", and carry on to
Step 5 with the lanes that did land. Do **not** hold the whole task on one
silent lane, and do **not** report a blocked lane as done — the Reviewer gates
on what is actually on disk.

## Step 5 — Review lane

Spawn Reviewer with `name: "Reviewer"`. On Claude Code that name also lets it
SendMessage a teammate for clarification; on Codex it reads the board instead. Gate this stage on `approval.md` or `issues.md`
existing, not on a returned verdict — a named spawn is a teammate and a
teammate's output does not come back. `run_in_background: false` is absent here
for the same reason it is absent in Step 2.

```
Agent({
  subagent_type: "reviewer",
  name: "Reviewer",
  prompt: `
Review the work done on ${WORKSPACE}/tasks/${taskId} by ${teamCount} teammates.
Inputs: SPEC.md, team-board.md, and each teammate's worktree diff.
If ${WORKSPACE}/tasks/${taskId}/design/design-summary.md exists, read it and
check the Frontend and Mobile work against it, not only against SPEC.md.
Write either ${WORKSPACE}/tasks/${taskId}/review/approval.md (status APPROVED)
or ${WORKSPACE}/tasks/${taskId}/review/issues.md (list issues per team, each
tagged with @Frontend / @Mobile / @Backend / @DevOps / @Designer so the next
iteration knows who to re-spawn — the tag must match the spawn name exactly).
If `SendMessage` is available to you, you may ask a teammate to clarify intent
before deciding. If it is not, read their `<team>-summary.md` and the board's
"Contracts" and "Open questions" — that is the record either way.
`
});
```

## Step 6 — Iterate if issues

Read `${WORKSPACE}/tasks/${taskId}/review/issues.md`. For each `@TeamName`
mentioned:

1. Spawn Architect again briefly to update team-board (mark affected rows
   back to `[ ]` with a "see issues.md" note).
2. A `@Designer` issue re-runs **Step 3 first**, before the affected lanes
   re-run — the lanes consume Designer's output, so re-running them against a
   stale `design-summary.md` fixes nothing.
3. Re-spawn ONLY the affected teammates with the same brief plus
   `issues.md` content appended.
4. Re-spawn Reviewer.

Loop max 3 times. After 3, abort with a summary for the user.

> Resuming a subagent that already finished takes a fresh concurrency slot
> **without checking** the 20-subagent limit, so a long iteration loop can push
> past 20 where a fresh spawn could not.

## Step 7 — Cleanup + commit

When Reviewer is APPROVED:

1. Nothing to tear down — teammates end on their own once their lane is done.
2. Merge each teammate's worktree branch back into the user's branch.
   Capture per-repo commit hashes in `tasks/${taskId}/commits.md`.
3. Spawn Learner (sequential, no team) to update
   `projects/[project]/context.md` with the conventions surfaced.
4. Design artifacts stay under `tasks/[id]/design/` — they are task artifacts,
   not repo deliverables. If the repo is meant to keep a permanent design
   folder, the Architect says so in the Frontend lane's Deliverable cell and
   Frontend copies them in; the orchestrator does not move files on its own.

## File outputs

| Path                                           | Author                       |
| ---------------------------------------------- | ---------------------------- |
| `tasks/[id]/SPEC.md`                           | Architect                    |
| `tasks/[id]/team-board.md`                     | Architect + teammates        |
| `tasks/[id]/research/[topic].md`               | Researcher                   |
| `tasks/[id]/design/` + `design-summary.md`     | Designer                     |
| `tasks/[id]/review/<team>-summary.md`          | each teammate at end-of-lane |
| `tasks/[id]/review/mobile-summary.md`          | Mobile                       |
| `tasks/[id]/review/approval.md` or `issues.md` | Reviewer                     |
| `tasks/[id]/commits.md`                        | Orchestrator                 |

## Common mistakes to avoid

- Spawning teammates without `name` — an unnamed agent has no address, so
  nobody can SendMessage it and the whole point is lost. Respawn with a name.
- Passing `team_name` — deprecated and ignored. Harmless, but it does not
  create or join anything; the name alone makes a teammate reachable.
- Spawning all 4 teammates regardless of architect's plan — empty lane
  means **don't spawn**.
- Letting Frontend edit `ops-platform/cmd/...` (a backend path). Pass
  `--add-dir` only for the team's repo allowlist.
- Merging worktrees before Reviewer approves. Hold all merges until Step 7.
- Letting Designer write into the target repo's `design/`. Lane worktrees are
  branched from the remote default branch, so they see neither uncommitted
  files nor unpushed commits. Team runs write to `tasks/[id]/design/`, always.
- Handing a lane any relative `tasks/...` path. It resolves inside the lane's
  worktree, where `tasks/` is gitignored and absent. Absolute paths only —
  board, summary, research, design artifacts.
- "Commit the design first so the worktree sees it." The worktree is branched
  from `origin`, so an unpushed commit is just as invisible as an uncommitted
  file.
- Reaching for `.worktreeinclude`. It copies a snapshot at creation time; the
  lane would read a frozen board and write its summary into a directory the
  sweep discards.
- Sending the full design summary to Backend or DevOps. They get the
  `## Handoff` subsection addressed to them, or nothing.
- Spawning Designer in the same turn as the coder lanes, or gating the stage on
  its return value. Under Agent Teams a named spawn is a teammate and its output
  does not return — gate on `design-summary.md` plus the board row.

## Tool reference

- `Agent({ subagent_type, name, run_in_background, isolation, prompt })` —
  spawn a teammate. **`name` is the address** — without it the agent cannot be
  messaged. There is no team to create or delete.
- `SendMessage({ to, message, summary? })` — teammate-to-teammate message;
  `to` is the teammate's `name`. Available to the orchestrator and to every
  teammate. Note the field is `message`, not `body`. A background teammate can
  also send to `"main"` to reach the orchestrator.
- `ListAgents()` — list the agents you can message, with their names.

Plain text output is NOT visible to other agents. On Claude Code a teammate that
wants to reach another directly must call `SendMessage`; on Codex, and under
`claude -p`, that tool does not exist and `${boardPath}` is the only channel.
Write every contract to the board on both runtimes — the message is an
accelerant, the board is the record.
