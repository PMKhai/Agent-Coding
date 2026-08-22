#!/usr/bin/env node
// PreToolUse hook for Bash — blocks dangerous commands.
// stdin: JSON with { tool_name, tool_input: { command, ... }, cwd, ... }
//
// Runs under both Claude Code and Codex. Claude blocks on exit 2 with stderr;
// Codex blocks on a permissionDecision JSON on stdout and ignores the exit
// code. Both understand the JSON shape, so a block emits all three.

const fs = require('fs')

let payload
try {
  payload = JSON.parse(fs.readFileSync(0, 'utf8'))
} catch {
  process.exit(0) // can't parse → don't block
}

const rawCmd = payload.tool_input?.command || ''
if (!rawCmd) process.exit(0)

// Strip string literals so dangerous-looking text inside `echo "..."` or
// `grep '...'` doesn't trigger false-positive blocks.
const cmd = rawCmd
  .replace(/"(?:[^"\\]|\\.)*"/g, '""')
  .replace(/'(?:[^'\\]|\\.)*'/g, "''")

const RULES = [
  { re: /\bgit\s+push\b.*--force(-with-lease)?\b.*\b(main|master)\b/, why: 'Force-pushing to main/master is destructive — open a PR instead.' },
  { re: /\bgit\s+push\b.*\bmain\b.*--force/, why: 'Force-pushing to main/master is destructive.' },
  { re: /\brm\s+(-[rRf]+\s+)+\/(?:\s|$)/, why: '`rm -rf /` is catastrophic.' },
  { re: /\brm\s+(-[rRf]+\s+)+~(?:\s|$)/, why: '`rm -rf ~` would wipe the home directory.' },
  { re: /\b(?:DROP|TRUNCATE)\s+(TABLE|DATABASE|SCHEMA)\b/i, why: 'Destructive SQL — confirm with user first.' },
  { re: /\bgit\s+reset\s+--hard\b.*\bHEAD~?\d*$/, why: '`git reset --hard` discards uncommitted work — confirm with user.' },
  { re: /:\(\)\s*\{[^}]*\|\s*:\s*&[^}]*\}\s*;\s*:/, why: 'Fork-bomb pattern detected.' },
  { re: /\bsudo\s+rm\b/, why: 'sudo + rm is rarely correct in an automated context.' },
  { re: /\bcurl\b.*\|\s*(sudo\s+)?(bash|sh|zsh|fish)\b/, why: 'Piping curl into a shell is unsafe — download, inspect, then execute.' },
  { re: /\bchmod\s+777\b/, why: '777 permissions are insecure — use a tighter mode.' },
]

for (const { re, why } of RULES) {
  if (re.test(cmd)) {
    const reason = `[guard-bash] BLOCKED: ${why}\nCommand: ${cmd}`
    // stdout JSON — how Codex denies, and a second signal Claude also honours.
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: reason,
        },
        // Legacy shape, accepted by both as a fallback.
        decision: 'block',
        reason,
      }) + '\n'
    )
    console.error(reason)
    process.exit(2)
  }
}
process.exit(0)
