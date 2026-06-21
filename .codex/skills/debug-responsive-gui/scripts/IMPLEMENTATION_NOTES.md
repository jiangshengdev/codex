# Debug Responsive GUI Scripts Implementation Notes

## Skipped Or Adjusted Items

- Task 13 commit was initially skipped because the design document lists commit creation as a non-goal, while the plan includes a commit task. It is only performed after the user's later explicit `提交` request.
- `curl` usage from Task 7 is treated as a plan conflict unless replaced by a Node built-in check. Reason: the design and plan tech stack constrain the scripts to Node.js built-ins, `playwright-cli`, `osascript`, AppleScript, and Git.
- Window layout must be adjusted from the literal plan snippet if possible. Reason: the design requires selecting a screen outside the Codex app screen and allowing fallback coordinates, while the plan snippet only chooses the leftmost screen.
- `state.mjs` uses the fixed design path `/tmp/codex-debug-responsive-gui/current.json` instead of `os.tmpdir()`. Reason: macOS `os.tmpdir()` resolves under `/var/folders/...`, which conflicts with the explicit design path.
- `playwright-cli` eval parsing accepts both object JSON and JSON-stringified object output. Reason: `playwright-cli --raw eval "JSON.stringify(...)"` prints a JSON string literal.
- Initial Task 8 runtime verification failed because JXA returned `visibleFrame` as `{origin, size}` rather than the plan's flat `{x, y, width, height}` shape. The layout step now normalizes both shapes before computing geometry.
- Task 8 and Task 9 responsive runtime verification were temporarily blocked by macOS AX visibility for the active CFT instance: `System Events` reported the `Google Chrome for Testing` process as visible, but `count of windows` was `0`, while `playwright-cli` could still interact with the page. The scripts fail with explicit diagnostics in this state instead of throwing stack traces.
- Task 8 layout retries the AppleScript layout command when first verification fails. Reason: DevTools can remain at `640x640` after the first geometry update even when the browser window moves correctly.

## Verification Results

- Passed: all `.mjs` files pass `node --check`.
- Passed: `00-check-tools.mjs` reports `node`, `playwright-cli`, and `osascript` as available without installing anything.
- Passed: `05-discover-current-state.mjs` runs and writes `/tmp/codex-debug-responsive-gui/current.json`.
- Passed after retry: `10-start-cft-if-needed.mjs` detects existing headed CFT state and restarts with `--auto-open-devtools-for-tabs` when no DevTools AX window is visible; it also verifies post-start browser and DevTools window state.
- Passed: `20-open-gui-if-needed.mjs` rejects missing `--gui-url`, rejects flag-shaped URL values, restricts GUI URLs to local HTTP(S), verifies HTTP status with Node `fetch`, opens the GUI URL, and verifies `codex-gui` metrics.
- Passed: `50-reload-page.mjs` reloads the current page and records reload state.
- Passed: `60-verify-responsive-metrics.mjs` verifies the page is still `codex-gui` and prints diagnostic metrics without asserting a device model.
- Passed after retry: `30-layout-windows-if-needed.mjs` lays out browser and DevTools windows, including a retry for DevTools staying at `640x640`.
- Passed after retry: `40-enter-responsive-if-needed.mjs` sends `Command+Shift+M` only when metrics are not responsive-like, then verifies responsive-like metrics.
- Adjusted after review: `00-check-tools.mjs`, `10-start-cft-if-needed.mjs`, and `20-open-gui-if-needed.mjs` now write failure details to `/tmp/codex-debug-responsive-gui/current.json` where applicable.
- Adjusted after review: `40-enter-responsive-if-needed.mjs` now exits non-zero if metrics still do not look responsive after sending `Command+Shift+M`.
- Completed: `SKILL.md` update after representative script verification passed.
