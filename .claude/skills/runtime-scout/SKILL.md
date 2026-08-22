---
name: runtime-scout
description: Detect new Claude Code and Codex CLI features from official docs and report what this workspace should adopt. Use when asked what is new in Claude Code or Codex, or to refresh the dual-runtime parity table.
user-invocable: true
---

# Runtime Scout skill

Find what changed in the Claude Code and Codex docs since the last run, and say
what it means for this workspace. Diff first, read second — never read the whole
doc set.

## Why the diff comes first

Both doc sites publish an `llms.txt` index listing every page. Snapshots of
those two indexes live in `docs/runtime-notes/.index/`. The delta between the
live index and the snapshot is the read list. Without that step this skill turns
into "re-read 400 pages", which burns context and finds nothing.

## Procedure

### 1. Fetch the indexes

```bash
mkdir -p docs/runtime-notes/.index
cd docs/runtime-notes/.index
curl -sL --max-time 30 https://code.claude.com/docs/llms.txt -o claude-llms.new.txt
curl -sL --max-time 30 https://learn.chatgpt.com/llms.txt   -o codex-llms.new.txt
curl -sL --max-time 30 https://learn.chatgpt.com/docs/whats-new.md -o codex-whats-new.new.md
```

Both must come back non-empty. A zero-byte file means the fetch failed — stop
and say so rather than reporting "no changes".

### 2. Diff against the snapshots

```bash
diff claude-llms.txt claude-llms.new.txt
diff codex-llms.txt  codex-llms.new.txt
diff codex-whats-new.md codex-whats-new.new.md
```

First run: no snapshot exists yet. Seed it (`mv *.new.txt` over the base names),
write a note recording the baseline, and stop. There is nothing to diff against.

Later runs: lines added (`>`) are new or renamed pages. That is the read list.
For `codex-whats-new`, treat new dated release entries as a read list even if
`llms.txt` did not change; release digests often announce product behavior
before lower-level config pages move.

### 3. Read what the diff surfaced

Fetch each new page as markdown — never HTML:

| Runtime     | Page URL pattern                            |
| ----------- | ------------------------------------------- |
| Claude Code | `https://code.claude.com/docs/en/<slug>.md` |
| Codex       | `https://learn.chatgpt.com/docs/<slug>.md`  |

If the user named a specific topic instead of asking "what's new", skip the
diff-driven list and go straight to that topic's pages.

For Codex internals not covered by a docs page, grep the full manual — it is
~2 MB, so never read it whole:

```bash
curl -sL --max-time 60 https://developers.openai.com/codex/codex-manual.md \
  -o /tmp/codex-manual.md
grep -nE "^#{2,4} .*<topic>" /tmp/codex-manual.md
sed -n '<start>,<end>p' /tmp/codex-manual.md
```

### 4. Assess each feature against this workspace

Three questions, in order:

1. **Which runtime has it?** Claude only, Codex only, or both.
2. **Do we already have it?** Check the real files before claiming a gap —
   `.claude/agents/`, `.claude/skills/`, `.claude/settings.json`, `AGENTS.md`,
   `.codex/`, `scripts/sync-codex.js`.
3. **What would change here?** Name actual paths. "Might affect the workflow"
   is not an answer.

Then a verdict:

- **ADOPT** — clear win, and the work is bounded. Say what to change.
- **WATCH** — useful but experimental, or blocked on the other runtime catching up.
- **SKIP** — does not fit how this workspace works. One sentence, move on.

A feature only one runtime has needs an explicit note on how the other degrades.
That gap is what `docs/dual-runtime.md` exists to record.

### 5. Write the note

`docs/runtime-notes/[YYYY-MM-DD]-[topic].md`:

```md
# [Topic] — [YYYY-MM-DD]

## What it is
[Feature, and which runtime(s) have it]

## Do we already have this
[Existing mechanism here, or "no equivalent"]

## Impact
[Concrete files that would change]

## Verdict
**ADOPT** / **WATCH** / **SKIP** — [one sentence]

## Sources
- [URL fetched this run]
```

### 6. Commit the snapshots and update parity

```bash
mv claude-llms.new.txt claude-llms.txt
mv codex-llms.new.txt  codex-llms.txt
mv codex-whats-new.new.md codex-whats-new.md
```

Only after the note is written — a failed run must not advance the baseline, or
the change is lost forever.

If the feature changes a Claude↔Codex mapping, add or edit the matching row in
the parity table in `docs/dual-runtime.md` in the same pass.

## Rules

- **Cite or drop it.** Every claim carries a URL fetched this run. Model memory
  is older than these docs and is not a source.
- **No changes is a valid result.** Say "no changes since [date]", refresh the
  snapshots, stop.
- **Impact over description.** Nobody needs a doc summary; they need to know
  which file to open.
- **Grep the manual, don't read it.** 2 MB will eat the context window.
