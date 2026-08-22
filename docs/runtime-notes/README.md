# Runtime notes

Findings from the `runtime-scout` agent — what changed in Claude Code and Codex,
and what this workspace should do about it.

## Layout

```
docs/runtime-notes/
├── README.md                      # this file
├── .index/
│   ├── claude-llms.txt            # snapshot of code.claude.com/docs/llms.txt
│   └── codex-llms.txt             # snapshot of learn.chatgpt.com/llms.txt
└── YYYY-MM-DD-topic.md            # one note per scout run
```

The two `.index/` snapshots are the baseline. Each run diffs the live index
against them to decide which pages to read, then advances the baseline only
after the note is written — a failed run must not lose a change.

Both files are **meant to be committed, and currently are not** — as of
2026-08-22 `git ls-files docs/runtime-notes/` returns nothing, so this whole
directory is untracked and not gitignored either. A `git clean -fd` would delete
the snapshots silently and reset the scout to a cold baseline, where the next run
reports "seeded baseline" instead of real findings. Commit them.

## Running it

```
/runtime-scout                       # Claude Code — what's new since last run
/runtime-scout hooks                 # only the hooks docs, both runtimes
$runtime-scout                       # Codex CLI — same skill, same output
```

## Reading a note

Each note ends in a verdict:

| Verdict   | Meaning                                                              |
| --------- | -------------------------------------------------------------------- |
| **ADOPT** | Clear win, bounded work. The note names the files to change.         |
| **WATCH** | Useful but experimental, or waiting on the other runtime.            |
| **SKIP**  | Does not fit how this workspace works.                               |

When a note changes a Claude↔Codex mapping, the parity table in
[`../dual-runtime.md`](../dual-runtime.md) gets updated in the same pass — that
table, not these notes, is the current state of the world.
