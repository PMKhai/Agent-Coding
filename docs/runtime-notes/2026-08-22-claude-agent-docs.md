# Claude Code agent docs — capability audit — 2026-08-22

Scout run against the Claude Code agent documentation, topic-driven rather than
diff-driven: the user named `agents.md` instead of asking "what's new".

**The diff step found nothing.** Both `llms.txt` indexes were fetched live this
run and are byte-identical to the snapshots in `.index/`. Nothing shipped
upstream since the last baseline, so **every finding below is pre-existing debt —
a capability that already existed and this kit never adopted**, not a changelog.
The snapshots therefore need no advancing; `*.new.txt` and the committed copies
are the same bytes.

Task: `tasks/agent-coding/20260822-144418-check-claude-agent-docs-improve-kit`.

---

## Adopted

> **How SPEC §3.2's six-ADOPT cap was read here:** the cap was applied to the
> five *capability* adoptions, with the two defect fixes (D1, D2) counted
> separately as repairs of things already broken. Read literally, the research
> report gives D1 and D2 an explicit `Verdict. ADOPT`, which would make seven
> and put the task one over. Nothing was deferred on budget grounds either way —
> every downgrade below has a substantive reason. Flagged so the user can
> overrule the interpretation.

### Two defects, fixed first

| # | Defect | Files changed |
| --- | --- | --- |
| **D1** | **`/workflow` never loaded any agent soul.** Every spawn site passed `subagent_type="general-purpose"` with a two-line paraphrase of the soul inlined into `prompt`, plus a `model="sonnet"` (`"haiku"` for the Learner) override that contradicted `model: opus` in all 17 agent files. The real bodies — SPEC templates, task-type labelling rules, `effort: xhigh`, `tools` allowlists — never loaded. All 17 souls were dead weight on the primary command. | `.claude/skills/orchestrator/SKILL.md` (9 spawn sites), `.claude/commands/workflow.md` (4), `.claude/commands/investigate.md` (1), `CLAUDE.md` §"Spawning Agents" and §"Agent Souls" |
| **D2** | **`sync-codex.js` shipped `description = ">-"` to Codex for 4 agents.** `parseFrontmatter()` was a flat line matcher; `brainstorm`, `finance`, `investigator` and `qc` use YAML folded scalars (`description: >-`), so the regex captured the indicator as the value. Non-empty, so the `!data.description` guard never fired. Codex picks agents by description, so those four were effectively invisible there — and the sync exited 0 the whole time. | `scripts/sync-codex.js` (`parseFrontmatter`, new `joinBlockScalar`, new degenerate-description guard) |

D1's source: `sub-agents.md` §"Write subagent files" — *"Subagents receive only
this system prompt plus basic environment details like the working directory,
not the full Claude Code system prompt."* The fix is to name the agent in
`subagent_type` and let its file body be the system prompt.
`.claude/skills/team-workflow/SKILL.md` already did this correctly, so the kit
contained both the right and the wrong pattern and the wrong one was on
`/workflow`.

D2's guard: a `description` that parses as a bare block-scalar indicator is now
refused rather than written out, so the bug cannot return silently. The comment
claiming the frontmatter here is "flat `key: value` only" — the claim that
caused the bug — is corrected.

### Capability adoptions

| # | Capability | Source | Files changed | Why |
| --- | --- | --- | --- | --- |
| 1 | **`attribution` in `settings.json`** | `settings-reference.md` §`attribution` | `.claude/settings.json` | The no-`Co-Authored-By: Claude` rule lived only as prose in `projects/agent-coding/context.md`. Every agent that commits had to remember it. `{"commit": "", "pr": "", "sessionUrl": false}` makes the harness enforce it. Claude-only; `includeCoAuthoredBy` is deprecated since v2.0.62. |
| 2 | **`/investigate --fix` documented a flag that cannot work** | `sub-agents.md` §"Available tools" | `.claude/commands/investigate.md`, `CLAUDE.md` §`/investigate` | `investigator.md`'s `tools` allowlist has no `Edit`/`Write`, and `sync-codex.js` puts it in `READ_ONLY_AGENTS`. It is read-only by design under both runtimes, but the command promised an inline fix. Corrected to a Debugger hand-off rather than granting it write access. |
| 3 | **`skills:` preload** | `sub-agents.md` §"Preload skills into subagents" | 9 agent files: `architect`, `reviewer`, `debugger`, `researcher`, `learner`, `qc`, `devops`, `documenter`, `prompt-enhancer` | Injects the paired skill's **full content** at startup instead of hoping the model invokes it. 9 of 16 skills are `user-invocable: false` — model-invoked only, exactly the case preloading is for. Makes the agent↔skill pairing the kit already assumes deterministic. |
| 4 | **Resume a subagent with `SendMessage`** | `sub-agents.md` §"Resume subagents" | `.claude/skills/orchestrator/SKILL.md` Steps 3–5, `.claude/commands/workflow.md`, `CLAUDE.md` §"Agent Souls" | Stage 4 re-spawned a **fresh** Reviewer after every Debugger pass, re-reading SPEC.md, the diff and the whole repo from zero. Naming the Reviewer and resuming it keeps its transcript. `SendMessage` does not require Agent Teams to be enabled. **Codex cost:** it has no `SendMessage`, and `orchestrator/SKILL.md` is symlinked into `.agents/skills/`, so the Codex orchestrator reads the same lines. Both call sites now condition the fallback on the runtime, not only on Reviewer liveness, and `docs/dual-runtime.md` §"What you lose on Codex" carries the row. |
| 5 | **`argument-hint` on slash commands** | `skills.md` §"Frontmatter reference" | all 8 `.claude/commands/*.md` | Every command parsed its flags in prose with no machine-readable shape. One quoted line each surfaces the shape in `/` autocomplete — the user is terminal-only, so `/` autocomplete *is* the primary surface. |

Note on where command frontmatter is documented: it is on the **skills** page,
not `commands.md` — that page is the built-in command list.

### Corrections to `docs/dual-runtime.md`

The §"What you lose on Claude" table carried two **false** rows, both verified
wrong against `hooks.md` fetched this run. Both were written by the orchestrator
earlier in this same session rather than inherited from an older revision, so
this is a same-day correction, not accumulated drift:

- **`PermissionRequest` hook** — claimed Claude can't route approvals to a hook.
  Claude has it, with `tool_name`, `tool_input`, `permission_suggestions` and
  full allow/deny decision control.
- **`SubagentStart` hook** — claimed only Codex can inject context as a subagent
  boots. Claude has it, with `agent_id`/`agent_type` matchers and
  `hookSpecificOutput.additionalContext`.

Both deleted, with a dated correction note. Only `sandbox_mode` per agent
survives in that table. Added to the parity table: a **Lifecycle hooks** row
recording both events as present on both runtimes, and a **Dynamic workflows**
row (Claude `.claude/workflows/*.js`, Codex none). Added to §"What you lose on
Codex": `skills:`, `attribution`, `argument-hint` — all Claude-only, all
degrading silently, none costing capability. A fourth row, **`SendMessage`
subagent resume**, was added during review: unlike the other three it does cost
Codex a capability, because `orchestrator/SKILL.md` is symlinked into
`.agents/skills/` and both runtimes read that one file.

`docs/runtime-notes/README.md` claimed the `.index/` snapshots are committed.
They are not — `git ls-files docs/runtime-notes/` returns nothing. Corrected.

---

## Watching

| Capability | Source | Why not adopted | What would flip it |
| --- | --- | --- | --- |
| **`disallowedTools` on read-only agents** | `sub-agents.md` §"Available tools" | **Downgraded after implementing and reverting it.** The proposed `disallowedTools: Write, Edit, NotebookEdit` on `reviewer`, `researcher`, `brainstorm`, `room-designer`, `prompt-enhancer` would block the Reviewer from writing `approval.md`/`issues.md` and the Researcher from writing `research/*.md` — their defined Stage 1 and Stage 3 outputs. `disallowedTools` is tool-name based, not path-scoped, so "read-only on the target repo, writable under `tasks/`" is not expressible with it. | A path-scoped permission, or a narrower `disallowedTools: Edit, NotebookEdit` that blocks in-place edits of existing source while still allowing the verdict file to be created. Needs the user's call — it changes the workflow's critical path. **See the escalation below: the Codex side already has this bug.** |
| **`SubagentStart` hook + `additionalContext`** | `hooks.md` §`SubagentStart` | The stated payoff is deleting the repeated `{task_dir}`/`{repo_path}`/`{mcp_instruction}` boilerplate from ~7 spawn prompts. But that boilerplate is *task-specific*, and a static hook script has no way to know the current task dir. The mechanism does not deliver the benefit claimed for it. | A verified way for the hook to learn the active task — an env var the orchestrator sets, or a pointer file. Then it is worth doing. |
| **`memory:` frontmatter** | `sub-agents.md` §"Enable persistent memory" | Gated on auto memory being enabled — a precondition not verified on this machine. Overlaps but does not duplicate `projects/*/context.md` (per-project, every agent reads it) versus per-agent memory. | Confirm auto memory is on, then try it on `learner` and `reviewer` only. Adding it to all 17 agents would create 17 silos nobody reads. |
| **Team quality gates: `TeammateIdle` / `TaskCompleted` / `TaskCreated`** | `hooks.md` §`TeammateIdle`; `agent-teams.md` §"Enforce quality gates with hooks" | `/team-workflow` is still an untested path — `companies.json` does not exist on this machine, so roster lookup falls back to defaults. Building a gate for a lane that has never run is speculative. | Run `/team-workflow` for real once. The docs warn teammates sometimes fail to mark tasks completed, which is exactly what the gate would catch. |
| **Dynamic workflows (`.claude/workflows/`)** | `workflows.md`; comparison table in `agents.md` | The most interesting item in these docs and the most expensive. Three hard blockers: no direct filesystem or shell access from the workflow script, while this workspace is file-system-as-shared-state; no mid-run user input, while `/queue` is explicitly designed to be live-editable mid-run; and Codex has no equivalent at all, which would make `.claude/` stop being one source of truth for orchestration. | `/queue start` context cost becoming the actual complaint. It is a genuinely better fit for that loop than a turn-by-turn orchestrator. |
| **`paths:` on skills** | `skills.md` §"Frontmatter reference" | Skills here are invoked by agent role, not by which file is open. `devops` scoping to `**/*.yaml` is the obvious candidate but solves no current problem. | Skill-list budget pressure. Today it is ~4.5K chars against an 8000-char floor. |
| **`context: fork` + `agent:` on skills** | `skills.md` §"Run skills in a subagent" | The docs warn it only makes sense for skills with explicit instructions, not guideline-shaped ones — and most skills here are guideline-shaped. The best candidate, `runtime-scout`, writes notes back into `docs/runtime-notes/`, and a forked skill running in the background applies edits outside session checkpoints, so `/rewind` will not undo them. | Try it on exactly one skill (`runtime-scout`, `background: false`) and judge whether isolation is worth losing `/rewind`. |
| **Cross-session messaging** | `agents.md` §intro; `settings-reference.md` §`crossSessionInbound` | `queue.json` already does a file-based version of the same thing and is runtime-neutral. Background subagents do not inherit `ListAgents`, which limits this inside `/workflow` anyway. | A real need to drive one session from another beyond queueing. |

---

## Skipped

Checked and deliberately dismissed. Do not re-investigate.

- **Agent view (`claude agents`)** — a dispatch/monitor UI for background sessions; everything here is driven from `/workflow` and `/queue`. Research preview.
- **`/batch`** — splits a change into 5–30 worktree subagents each opening a PR; this kit commits once at Stage 5.
- **`/deep-research`** — overlaps the `researcher` agent + `research` skill and would fork the research output path.
- **Routines / scheduled cloud agents** — the user is terminal-only and starts the queue by hand.
- **`/subtask`, `/fork`, fork mode** — inheriting conversation history is the opposite of the design; the orchestrator spawns fresh-context agents on purpose.
- **Checkpointing / `/rewind`** — rollback already exists via `tasks/*/commit.md` + git, and survives across sessions.
- **`sandbox.*` settings tree** — ~40 keys; the user runs bypass-permissions locally on their own machine.
- **`mcpServers:` per-agent frontmatter** — genuinely useful, but `.mcp.json` is gitignored and machine-local, so agent files would name servers that do not exist elsewhere. Revisit if `.mcp.json` is ever committed.
- **`permissionMode:` frontmatter** — the session already runs in bypass mode; a per-agent mode below that changes nothing.
- **`maxTurns:`** — no agent here has ever run away; a cap risks truncating a legitimate long Coder run.
- **`color:` frontmatter** — cosmetic task-panel row colour.
- **`initialPrompt:`** — only applies to `claude --agent` main-session agents; nothing here does that.
- **`subagentStatusLine`** — cosmetic; the `notify.js` `SubagentStop` hook already reports completion where the user looks.
- **`worktree.*` settings** — tuning for large monorepos; the default `bgIsolation: "worktree"` is what Stage 2 wants. Worth remembering `.worktreeinclude` if a target repo ever needs `.env` inside a coder's worktree.
- **`WorktreeCreate` / `WorktreeRemove` hooks** — for non-git VCS. Everything here is git.
- **`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` / `MAX_CONCURRENT_SUBAGENTS`** — defaults are 3 layers and 20 concurrent; the workflow spawns at most 2 in parallel at depth 1.
- **Plugin marketplaces, `strictPluginOnlyCustomization`, plugin dependencies** — org-distribution machinery; two plugins via `extraKnownMarketplaces` is the extent of the need.
- **Channels** — pushes webhook/CI events into a running session; no CI feeds this workspace.
- **`skillListingBudgetFraction` / `skillListingMaxDescChars`** — Claude reserves 1% of the context window for the skill listing, tighter than the 2% Codex figure in `projects/agent-coding/context.md`. Worth knowing the numbers differ; neither runtime is close to its cap.
- **Agent SDK pages** — for embedding Claude Code as a library; `ui/**` is out of scope.

---

## Escalations

1. **The Codex side already has the bug that made ADOPT #3 impossible.**
   `sync-codex.js` maps `READ_ONLY_AGENTS` — which includes `reviewer` and
   `researcher` — to `sandbox_mode = "read-only"`. If that sandbox behaves as
   named, the Codex Reviewer cannot write `approval.md` and the Codex Researcher
   cannot write `research/*.md`, so `/workflow` under Codex would stall at Stage 1
   or Stage 3. This is pre-existing, was not introduced by this task, and was not
   verified against the binary. **Worth a `codex exec` test before trusting the
   Codex workflow path.**

2. **`docs/runtime-notes/` and the whole dual-runtime layer are untracked.**
   `scripts/sync-codex.js`, `docs/dual-runtime.md`, `AGENTS.md`, `.codex/`,
   `.agents/` and this note's own directory are all `??` and not gitignored. A
   `git clean -fd` destroys all of it.

3. **Command-description anomaly, unexplained.** Four of eight commands
   (`check-status`, `create-task`, `queue`, `workflow`) surface their H1 as the
   description in the session skill listing while `fix-bugs` and `sub-task`
   surface their frontmatter `description:` correctly. All eight files carry a
   well-formed `description:`. Working hypothesis: the session's listing is
   cached from session start and the frontmatter was added mid-session — not a
   defect in the files. Nothing changed. **Repro:** start a session with cwd =
   workspace and compare the listing against `head -4 .claude/commands/<name>.md`.

---

## Sources

Every URL fetched this run:

- `https://code.claude.com/docs/llms.txt`
- `https://learn.chatgpt.com/llms.txt`
- `https://code.claude.com/docs/en/agents.md`
- `https://code.claude.com/docs/en/sub-agents.md`
- `https://code.claude.com/docs/en/agent-teams.md`
- `https://code.claude.com/docs/en/workflows.md`
- `https://code.claude.com/docs/en/worktrees.md`
- `https://code.claude.com/docs/en/skills.md`
- `https://code.claude.com/docs/en/hooks.md`
- `https://code.claude.com/docs/en/settings-reference.md`
- `https://code.claude.com/docs/en/commands.md`
- `https://code.claude.com/docs/en/claude-directory.md`
- `https://code.claude.com/docs/en/cross-session-messaging.md`
- `https://code.claude.com/docs/en/agent-view.md`
- `https://code.claude.com/docs/en/checkpointing.md`
- `https://code.claude.com/docs/en/tools-reference.md`
