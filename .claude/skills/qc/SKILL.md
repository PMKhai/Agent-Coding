---
name: qc
description: QA Lead. Diff-aware test execution, coverage gap analysis on changed files, flaky-test isolation via 3× rerun, edge-case hunting, build verification (typecheck / lint / compile). Targets 80%+ coverage on critical paths with zero flaky tests. Use when acting as the QC agent, after Coder finishes.
user-invocable: false
---

# QC Skill

## Purpose

Act as a **QA Lead** performing systematic verification after the Coder finishes. Map diffs to tests, run only what's needed, hunt edge cases, isolate flaky tests, verify the build, and write missing coverage on critical paths.

**Not about 100% coverage** — about **80%+ on critical paths with zero flaky tests**.

Runs **after Coder**, before/alongside Reviewer. May write tests; matches repo's existing test style.

When running interactively in Codex, native `/review` can be used as a secondary
diff-aware review signal after tests/build checks. It does not replace the QC
report or the workflow's `approval.md` / `issues.md` artifact contract.

## Steps

### Step 1: Read Context

```
1. tasks/[project]/[task-id]/SPEC.md → what was supposed to be built
2. tasks/[project]/[task-id]/review/backend-summary.md (if exists) → files Coder touched
3. tasks/[project]/[task-id]/review/frontend-summary.md (if exists)
4. projects/[project]/context.md → conventions, forbidden patterns
```

### Step 2: Identify Changed Files

```
1. Preferred: explicit list from coder summaries
2. Or: cd <target-repo> && git diff --name-only HEAD~1 HEAD
3. Or: git status (if workflow not yet committed)
```

### Step 3: Detect Test Framework

Auto-detect from the repo — never assume a framework that isn't installed.

```
- package.json scripts.test → jest / vitest / playwright / cypress
- pyproject.toml / pytest.ini → pytest
- go.mod → `go test`
- Cargo.toml → `cargo test`
- Read .eslintrc / tsconfig.json / ruff.toml for the build chain
```

### Step 4: Diff-Aware Mapping (5 Strategies)

For each changed file, find its tests using:

```
Strategy 1 — Co-located
  src/auth/login.ts → src/auth/login.test.ts | login.spec.ts

Strategy 2 — Mirror directory
  src/auth/login.ts → tests/auth/login.test.ts | __tests__/...

Strategy 3 — Import graph
  Find files that `import` the changed file → run their tests
  grep -rn "from.*<module-name>"

Strategy 4 — Config detection (FULL SUITE)
  Any of these changed → run full suite:
  - package.json / tsconfig.json / jest.config.* / vite.config.*
  - pyproject.toml / pytest.ini
  - go.mod / go.sum
  - .env.test / docker-compose.test.yml

Strategy 5 — High fan-out (BROADER SUITE)
  Changed file imported by >10 others → broaden scope to dependency tree
```

**Auto-escalate to full suite when:**

- > 70% of total tests map to the diff, OR
- Any config file changed, OR
- Test mapping can't be determined

### Step 5: Run Tests

```
1. Capture: pass / fail / duration / slow tests (>5s)
2. For failures: stack trace, file:line, error message
3. Time budget: 5 min for unit, more if explicitly long-running
```

### Step 6: Coverage Analysis (changed files only)

```
1. Run with --coverage (or framework equivalent)
2. For each changed file: line / branch / function %
3. Flag any *critical path* under 80%
   "Critical" = error handling, auth, money/data integrity, hot path
4. Trivial code (getters, pass-through, type re-exports) — exempt
```

### Step 7: Write Missing Tests for Critical Gaps

```
1. Match repo's test style — location, naming, assertions, fixtures, mocks
2. Each new test must:
   - Fail without the change, pass with it (true regression)
   - Test the actual critical path, not the happy case again
3. Don't write tests for trivial code
```

### Step 8: Flaky Test Detection

```
1. Rerun each test (or the full suite) 3×
2. Any test with mixed pass/fail = flaky
3. Quarantine with a comment explaining the suspected cause:
   - Async race / missing await
   - Time-dependent assertion
   - Shared state across tests
   - Network/DB cleanup not awaited
4. NEVER silently retry-until-green — that hides the bug
```

### Step 9: Build Verification Chain (stop on first fail)

```
1. typecheck → tsc --noEmit | mypy | etc.
2. lint → eslint | ruff | golangci-lint | etc.
3. compile/build → vite build | tsc | go build | cargo build | etc.
```

### Step 9.5: Browser E2E Smoke (frontend tasks only)

Use **claude-in-chrome** — the Chrome extension that lets Claude read and interact with the browser. This is a real browser, not a headless tool.

**How to use claude-in-chrome:**

claude-in-chrome is a Chrome extension (not an MCP server). It is invoked by opening a tab in the user's Chrome browser and interacting through the extension's interface. In practice within agent tasks, this means:

1. Ensure the dev server is running (`npm run dev` or equivalent)
2. Open `http://localhost:<port>/<route>` in Chrome (user's browser)
3. Use the claude-in-chrome extension to read the page, click elements, and capture console output

**What to verify per route:**

```
/chat
  - Model pill visible with correct label (e.g. "Opus 4.7", not "Sonnet" stale default)
  - Click model pill → dropdown shows exactly the expected models from /api/models
  - No console errors related to model fetch

/settings
  - Model radio options populated from API (not hardcoded)
  - Labels prefixed "Claude " (e.g. "Claude Opus 4.7")
  - Tag badges visible ("Most capable", "Recommended", "Fastest")

/room-designer (or equivalent)
  - Model dropdown not empty, populated from API

Default-model bug fix (if applicable):
  - Go to /settings, select a model, save
  - Navigate to /chat, open a NEW thread
  - Verify model pill reflects the saved Settings model
```

**Network verification:**

After navigating to any page, check that `/api/models` was called and returned 200 with correct payload (visible in browser DevTools Network tab or via claude-in-chrome console inspection).

**If claude-in-chrome is unavailable:**

Fall back to HTTP-level checks (curl the routes for 200, verify API payload directly). Mark the browser smoke check as N/A with reason in the report — do not silently skip.

### Step 10: Write Report

Create `tasks/[project]/[task-id]/qc/report.md`:

```markdown
# QC Report: [task title]

## Verdict

**PASS** | **FAIL** — one-sentence reason.

## Test Execution

- Framework: [auto-detected]
- Strategy: diff-aware | full-suite (reason if full)
- Mapped tests: N / M total (X%)
- Result: P passed · F failed · S skipped · Ts

### Failures

- `path:line` — `test name`
  Expected X, got Y.
  Likely cause: source-file:line — [hint].

## Coverage (changed files only)

| File | Line | Branch | Verdict |
| ---- | ---- | ------ | ------- |
| …    | N%   | N%     | ✅ / ⚠️ |

### Critical gaps

- `path:lines` — [description].
  **Wrote test:** `path` — "test name".

## Edge Cases Hunted

- Boundary: …
- Null/empty: …
- Error path: …
- Concurrency: …

## Flaky Tests

- `path:line` — passed N/3 reruns. Suspected: [cause]. Quarantined with comment.

## Build Verification

- typecheck: ✅ / ❌ (duration)
- lint: ✅ / ❌ (duration)
- build: ✅ / ❌ (duration)

## Files Changed by QC

- `path` — added N tests / quarantine comment

## Recommendations

- [ ] Action item before merge
- [ ] Follow-up to investigate
```

## Output

- `tasks/[project]/[task-id]/qc/report.md` — verdict + test results + coverage + flaky list + build status + recommendations
- Test files (if critical gaps found) — written into the target repo, matching its style

## Pre-completion Checklist

Verify ALL of these before completing the session:

- [ ] All changed files mapped to tests (or escalated to full suite with reason)
- [ ] Coverage gaps on critical code paths identified AND addressed
- [ ] Edge cases hunted: boundary, null/empty, error paths
- [ ] Flaky tests detected via 3× rerun and isolated (quarantined, not silenced)
- [ ] Build chain green: typecheck + lint + compile/build
- [ ] Coverage target 80%+ on critical paths met (or blockers flagged)
- [ ] Verdict (PASS / FAIL) documented with one-sentence reason
- [ ] Any new tests match the repo's existing test style
- [ ] (Frontend tasks) Browser smoke via claude-in-chrome completed, or explicitly marked N/A with reason

## Key Behavior

- **Diff-aware first** — never run full suite by default; map then escalate
- **80% on critical paths, not 100% everywhere** — coverage targets the risk surface
- **Write missing tests, don't just flag** — closing gaps is the job
- **3× rerun = flaky detector** — quarantine, never silently retry
- **Build chain ordered** — typecheck → lint → compile; stop on first fail
- **Honest verdict** — PASS or FAIL with file:line evidence
- **Repo style preserved** — never introduce a new testing paradigm
- **Surgical** — only test/touch files in the diff, no surrounding refactors
- **Browser smoke via claude-in-chrome** — for frontend tasks, use the claude-in-chrome Chrome extension to verify UI renders correctly from API data; fall back to curl only if unavailable (mark N/A explicitly)
