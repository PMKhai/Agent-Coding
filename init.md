# init.md — Bootstrap a fresh machine for this workspace

> **You are Claude.** The user has just cloned this repo and asked you to set up their machine. Walk them through the steps below **in order**. After each step, run the verify command and report the result. **Do not skip the verify steps.**
>
> If a step writes to a global file (`~/.claude/settings.json`, `~/.claude/CLAUDE.md`, `~/.claude.json`), **show the user the planned change first** and ask for confirmation before applying — the user may already have their own customizations you must preserve.
>
> Steps marked **[OPTIONAL]** can be skipped without breaking the rest. Steps marked **[MANUAL]** require the user to act (you can't do them).

---

## Step 0 — Detect OS _(do this first)_

Run:

```bash
uname -s
```

| `uname -s` output              | OS                     | Supported?                               |
| ------------------------------ | ---------------------- | ---------------------------------------- |
| `Darwin`                       | macOS                  | ✅ native                                |
| `Linux`                        | Linux / WSL            | ✅ native (WSL is treated as Linux)      |
| `MINGW*` / `MSYS*` / `CYGWIN*` | Windows (Git Bash)     | ⚠️ partial — RTK requires WSL, see below |
| (command not found)            | Windows cmd/PowerShell | ❌ STOP — tell user to install WSL first |

**Windows native is NOT supported by RTK** (per upstream docs). If `uname` is missing or reports `MINGW*`/`MSYS*`/`CYGWIN*`, instruct the user to install WSL2 (`wsl --install` in PowerShell as admin) and re-run this script inside the WSL shell. Do not continue.

Remember the detected OS — every install step below branches on it.

---

## Prerequisites (verify only — do not auto-install)

```bash
claude --version          # Claude Code installed
node --version            # Node.js ≥ 20
git --version             # git
```

Plus, per OS:

- **macOS:** `brew --version`
- **Linux/WSL:** `curl --version` (almost always present; if not, install via the OS package manager — `sudo apt install curl` / `sudo dnf install curl` / etc.)

If any of these are missing, **stop** and tell the user to install them before continuing. Do not install Homebrew, Claude Code, or Node yourself.

---

## Step 1 — Install RTK (Rust Token Killer)

RTK is a local Bash hook that compresses Claude's shell-tool output 60–90%. Cuts token cost on every session.

**Install — branch by OS:**

- **macOS:**
  ```bash
  brew install rtk
  ```
- **Linux / WSL:**

  ```bash
  curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh
  ```

  Fallback if curl fails or user prefers building from source:

  ```bash
  cargo install --git https://github.com/rtk-ai/rtk
  ```

  (requires Rust toolchain — `curl https://sh.rustup.rs -sSf | sh`)

- **Windows native:** unsupported. Stop and route to WSL (see Step 0).

**Initialize globally** (registers an RTK.md and the hook) — same on every OS:

```bash
rtk init -g
```

If `rtk init -g` runs non-interactively, it will print a "MANUAL STEP" with the hook JSON instead of patching `~/.claude/settings.json` itself. In that case, **read the user's `~/.claude/settings.json` first**, merge the hook into it (preserving everything else), and write it back. The merge target is:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [{ "type": "command", "command": "rtk hook claude" }]
      }
    ]
  }
}
```

Idempotency: if a `PreToolUse` group with `matcher: "Bash"` already exists, append the `rtk hook claude` entry to its `hooks` array only if it's not already there. Do **not** create a duplicate.

**Verify** (cross-platform):

```bash
rtk --version             # → rtk 0.42.0 or newer
grep -c "rtk hook claude" "$HOME/.claude/settings.json"   # → 1
```

---

## Step 2 — Install Claude in Chrome extension **[MANUAL]**

Primary browser-automation MCP. Tell the user to:

1. Open Chrome → Chrome Web Store → search for "Claude in Chrome" → install.
2. Click the extension icon → run through the onboarding (sign in to Claude).
3. Restart Claude Code.

This step is the same on macOS, Linux, and Windows (the extension installs into Chrome itself — host OS doesn't matter, as long as the user has Chrome).

**Verify (you can run this):**

```bash
python3 -c "import json,os; c=json.load(open(os.path.expanduser('~/.claude.json'))); print('enabled:', c.get('claudeInChromeDefaultEnabled'), 'onboarded:', c.get('hasCompletedClaudeInChromeOnboarding'))"
```

Expect both `True`. (If the user is in WSL but launched Chrome from Windows, the extension still works — Claude Code on WSL talks to Chrome via the extension's bridge.)

---

## Step 3 — Install Playwright MCP (fallback browser)

Used when Claude in Chrome disconnects. No extension dependency — spawns its own Chromium.

Same command on every OS:

```bash
claude mcp add -s user playwright npx @playwright/mcp@latest
```

The `-s user` flag is **required** — it registers Playwright at user scope (works in every project), not just this repo.

On **Linux/WSL**, Playwright will download its own Chromium on first use (~150MB). If the download fails behind a corporate proxy, set `HTTPS_PROXY` before the first invocation.

**Verify:**

```bash
claude mcp list 2>&1 | grep playwright
# → playwright: npx @playwright/mcp@latest - ✓ Connected
```

---

## Step 4 — Write the browser-automation fallback policy

Append the policy below to `~/.claude/CLAUDE.md` (create the file if missing). This tells future Claude sessions to default to Claude in Chrome and fall back to Playwright when the extension breaks.

**Before writing, read the existing `~/.claude/CLAUDE.md` and show the diff to the user.** If a section titled "Browser automation policy" already exists, skip this step.

Same content on every OS — only the file path is conceptually different (`~` resolves to the user's home on macOS / Linux / WSL; on Windows native we don't get here because we stopped at Step 0).

Policy block to append:

```markdown
## Browser automation policy

Two browser MCPs are available. **Primary** is "Claude in Chrome" (tool prefix `mcp__claude-in-chrome__*`) — it drives the user's real logged-in Chrome via the extension. **Fallback** is `@playwright/mcp` (tool prefix `mcp__playwright__*`) — spawns its own headless Chromium, no extension.

**Rules:**

1. Default to `mcp__claude-in-chrome__*` for any browser task — it preserves the user's session, cookies, and tabs.
2. If a claude-in-chrome tool returns a connection / extension / timeout error (e.g. "extension not connected", "no response from the browser extension", repeated tool failures after 2 retries), **stop retrying** and switch to the equivalent `mcp__playwright__*` tool for the rest of the session. Tell the user once that the fallback kicked in.
3. Do NOT mix the two for the same flow — once fell back to Playwright, finish the task there. The two browsers don't share state.
4. If the task explicitly needs the user's logged-in session (e.g. "post in my Gmail", "navigate to my Linear"), and Claude in Chrome is broken, **stop and ask the user** to fix the Chrome extension instead of silently using Playwright with no auth.
5. Playwright tools must still be loaded via `ToolSearch` (`select:mcp__playwright__*`) before first call — same as claude-in-chrome.
```

**Verify:**

```bash
grep -c "Browser automation policy" "$HOME/.claude/CLAUDE.md"   # → 1
```

---

## Step 5 — Register the Open Design MCP (Designer agent) **[OPTIONAL]**

The `designer` agent prefers the Open Design MCP for prototypes, landing pages, dashboards and
slides. Without it Designer still works — it degrades to the `diagram-design` skill plus
hand-written HTML and records the degradation in `design-summary.md`. Skip this step if the user
does not want the desktop app.

**Prerequisite [MANUAL]:** the user installs the OpenDesign desktop app from
[open-design.ai](https://open-design.ai) or [GitHub Releases](https://github.com/nexu-io/open-design/releases),
then launches it once so the daemon and its IPC socket exist.

### Do NOT enable the `open-design` Claude Code plugin

The marketplace plugin ships nothing but a `.mcp.json`, and that file is wrong in two ways:

1. It runs the bare command `od`, which on macOS and most Linux distros resolves to the POSIX
   **octal-dump** utility at `/usr/bin/od` — not OpenDesign.
2. It hardcodes `--daemon-url http://127.0.0.1:7456`, while the desktop app binds an **ephemeral**
   port. That flag also outranks the built-in IPC discovery, so passing it guarantees failure.

Both failures are silent — the `mcp__open-design__*` tools simply never appear and Designer falls
back forever. If the plugin is already enabled, set it to `false` in `~/.claude/settings.json`
**and** in the workspace `.claude/settings.json` (it can be enabled in either):

```json
"enabledPlugins": { "open-design@open-design": false }
```

### Register with the app's own installer instead

It writes the exact launch spec shown in the app's **Settings → MCP server** panel.

```bash
# macOS — Linux AppImage: <extract-dir>/resources/app/prebundled/daemon/daemon-cli.mjs
OD_CLI="/Applications/Open Design.app/Contents/Resources/app/prebundled/daemon/daemon-cli.mjs"

# the daemon logs its own URL, ephemeral port included
OD_PORT=$(python3 - <<'PY'
import os, re
log = os.path.expanduser("~/Library/Application Support/Open Design/namespaces/release-stable/logs/daemon/latest.log")
m = re.findall(r'"url":\s*"http://127\.0\.0\.1:(\d+)"', open(log).read())
print(m[-1] if m else "")
PY
)
curl -s "http://127.0.0.1:$OD_PORT/api/health"   # → {"ok":true,"version":"..."}

node "$OD_CLI" mcp install claude --daemon-url "http://127.0.0.1:$OD_PORT"
node "$OD_CLI" mcp install codex  --daemon-url "http://127.0.0.1:$OD_PORT"   # only if Codex CLI is in use
```

`--daemon-url` here is read-only setup input — the installer calls `/api/mcp/install-info` with it
and **does not** write it into the resulting config. The registered entry finds the daemon through
`OD_SIDECAR_IPC_PATH` and relaunches the app headlessly through `OD_MCP_BOOTSTRAP_COMMAND` when it
is down, so nobody has to open the app first and the ephemeral port never matters again.

**Scope matters.** The Claude entry lands in `~/.claude.json` at **user scope**, which is required:
workspace agents spawn with `cwd: targetRepo`, so a project-scoped `.mcp.json` living in this
workspace would not be loaded when Designer works on some other repo. User scope also means a new
target repo needs **no MCP setup at all** — its agents already resolve through the `.claude/agents`
symlink farm (`node scripts/migrate-repo-links.js`), and its MCP servers come from user scope.

**Verify:**

```bash
claude mcp list 2>&1 | grep open-design
# → open-design: /Applications/Open Design.app/.../daemon-cli.mjs mcp - ✔ Connected
```

Exactly one line. A second `plugin:open-design:open-design` line marked ✘ means the plugin is still
enabled somewhere — go back and disable it.

---

## Step 6 — Install UI dependencies

The workspace ships a local web UI under `ui/`. End-users who only use the CLI can skip this step.

Same on every OS:

```bash
cd ui && npm install
```

**Verify:**

```bash
test -d ui/node_modules && echo "ok"
```

---

## Step 7 — Start the UI server **[OPTIONAL]**

```bash
cd ui && npm run dev
# or for production:
# npm run build && node server.js
```

Then open http://localhost:3001 (or whatever PORT is logged).

**Verify:**

```bash
curl -s http://localhost:3001/api/rtk/detect | python3 -m json.tool
# → { "installed": true, "version": "rtk 0.42.0", "path": "..." }
```

If RTK shows as `installed: false` here, Step 1 didn't take — go back and fix.

---

## Final verification

Run all of these — every line should pass:

```bash
rtk --version
claude mcp list | grep -E "playwright.*Connected"
grep "rtk hook claude" "$HOME/.claude/settings.json"
grep "Browser automation policy" "$HOME/.claude/CLAUDE.md"
test -f "$HOME/.claude/RTK.md" && echo "RTK.md ok"

# only if Step 5 ran
claude mcp list 2>&1 | grep -E "^open-design:.*Connected"
```

If all five pass, the setup matches the source machine. Tell the user **"Restart Claude Code now"** — hooks and MCP servers are only loaded at session start.

---

## What this script does NOT do

- Does not install Claude Code itself (user must already have it on host OS or inside WSL).
- Does not install Homebrew / Node / git / curl (user must already have them — different package managers per OS).
- Does not install WSL on Windows — user runs `wsl --install` in PowerShell themselves.
- Does not install the Claude in Chrome extension (manual — Chrome Web Store).
- Does not install the OpenDesign desktop app (manual — DMG / AppImage from the vendor). Step 5
  only registers the MCP server against an app that is already installed.
- Does not configure user-specific settings (model preference, permission mode, additional directories, API keys, MCP secrets, Gmail/Drive/Calendar OAuth tokens). These are personal and must not be copied between machines.
- Does not touch project-level `.claude/settings.json` in this repo — that's already version-controlled.

## OS-specific gotchas

- **Linux without `python3` on PATH:** the verify commands use `python3`; on minimal containers install `python3` or rewrite the check in `jq`. `python3 -m json.tool` is functionally equivalent to `jq .`.
- **WSL + Chrome on Windows host:** Claude in Chrome works because the extension lives in the Windows-side Chrome and the Claude Code CLI in WSL talks to it via the host's localhost. No special config needed, but **the user must launch Chrome on Windows, not inside WSL**.
- **Linux behind a corporate proxy:** set `HTTPS_PROXY` / `HTTP_PROXY` env vars before Step 1 (curl install) and Step 3 (Playwright Chromium download).
- **Cargo install path:** `cargo install` puts the binary in `~/.cargo/bin/`. If that's not on `PATH`, RTK won't be found by Claude. Add `export PATH="$HOME/.cargo/bin:$PATH"` to the user's shell rc.

## Rollback

If anything broke, undo per-step:

- RTK (macOS): `brew uninstall rtk` + remove the `rtk hook claude` entry from `~/.claude/settings.json`.
- RTK (Linux/WSL): `rm $(which rtk)` (typically `~/.cargo/bin/rtk` or `~/.local/bin/rtk`) + remove the hook entry.
- Playwright MCP: `claude mcp remove -s user playwright`.
- Policy text: open `~/.claude/CLAUDE.md` and delete the "Browser automation policy" section.
- Open Design MCP: `node "$OD_CLI" mcp install claude --uninstall` (add `codex` likewise), or
  `claude mcp remove -s user open-design`.
