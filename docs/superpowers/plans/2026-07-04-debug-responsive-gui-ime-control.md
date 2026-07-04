# debug-responsive-gui IME Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a single-step IME control script to `debug-responsive-gui` so an agent can drive real macOS Simplified Pinyin input in visible `Google Chrome for Testing`, capture the current IME candidate window, read candidate structure through AX, and collect DOM event logs across a session.

**Design:** `docs/superpowers/specs/2026-07-04-debug-responsive-gui-ime-control-design.md`

**Architecture:** Keep the feature inside the existing skill. Add one CLI entrypoint plus a small pure helper module for argument parsing, session paths, key mapping, and candidate sorting. Use `playwright-cli` only for page focus/logger/textarea state. Use AppleScript for real keyboard events. Use macOS Accessibility/CoreGraphics through Swift for candidate-window discovery and AX candidate extraction. Use `screencapture -x -o -l <windowId>` for candidate PNGs.

**Tech Stack:** Node.js ESM, existing `playwright-cli` wrapper, AppleScript via `osascript`, Swift via `/usr/bin/swift`, `screencapture`, Node built-in `node:test`.

---

## File Structure

- Create: `.codex/skills/debug-responsive-gui/scripts/ime-control.mjs`
  - CLI entrypoint.
  - Implements `start`, `type`, `key`, and `capture`.
  - Writes session artifacts under `/tmp/codex-ime-control/<session-id>/`.
- Create: `.codex/skills/debug-responsive-gui/scripts/lib/ime-control-core.mjs`
  - Pure helper module.
  - Parses args, validates pinyin and key names, maps keys to AppleScript key codes, builds session/capture paths, sorts AX candidates, and shapes JSON output.
- Create: `.codex/skills/debug-responsive-gui/scripts/ime-control.test.mjs`
  - Unit tests for pure helpers.
  - Does not launch a browser or touch macOS UI.
- Modify: `.codex/skills/debug-responsive-gui/SKILL.md`
  - Add a short IME control section.
  - Keep the main skill lean and point to the CLI examples.

## CLI Contract

```bash
node .codex/skills/debug-responsive-gui/scripts/ime-control.mjs start
node .codex/skills/debug-responsive-gui/scripts/ime-control.mjs start --preserve
node .codex/skills/debug-responsive-gui/scripts/ime-control.mjs type nihao --session <session-id>
node .codex/skills/debug-responsive-gui/scripts/ime-control.mjs key arrow-down --session <session-id>
node .codex/skills/debug-responsive-gui/scripts/ime-control.mjs key digit-3 --session <session-id>
node .codex/skills/debug-responsive-gui/scripts/ime-control.mjs key enter --session <session-id>
node .codex/skills/debug-responsive-gui/scripts/ime-control.mjs capture --session <session-id>
```

All action commands default to capture. `--no-capture` skips post-action candidate capture.

Allowed keys:

```text
arrow-up
arrow-down
arrow-left
arrow-right
digit-1
digit-2
digit-3
digit-4
digit-5
digit-6
digit-7
digit-8
digit-9
space
enter
escape
```

`type <pinyin>` accepts only `[a-z]+`.

## Session Artifacts

```text
/tmp/codex-ime-control/<session-id>/
  metadata.json
  events.jsonl
  actions.jsonl
  latest-candidate.json
  captures/
    0001-candidate.json
    0001-candidate.png
    0002-candidate.json
    0002-candidate.png
```

`candidate.json` is the primary machine-readable evidence. `candidate.png` is backup visual evidence and should not be opened unless AX output is suspicious.

## Verification Commands

From repo root:

```bash
node --check .codex/skills/debug-responsive-gui/scripts/ime-control.mjs
node --check .codex/skills/debug-responsive-gui/scripts/lib/ime-control-core.mjs
node --test .codex/skills/debug-responsive-gui/scripts/ime-control.test.mjs
find .codex/skills/debug-responsive-gui/scripts -name '*.mjs' -print0 | xargs -0 -n1 node --check
/usr/bin/python3 /Users/jiangsheng/.codex/skills/.system/skill-creator/scripts/quick_validate.py .codex/skills/debug-responsive-gui
```

Manual live verification, only after implementation is complete and a visible `Google Chrome for Testing` Codex GUI page is already open:

```bash
node .codex/skills/debug-responsive-gui/scripts/ime-control.mjs start
node .codex/skills/debug-responsive-gui/scripts/ime-control.mjs type nihao --session <session-id>
node .codex/skills/debug-responsive-gui/scripts/ime-control.mjs key arrow-down --session <session-id>
```

Expected live result:

- `type nihao` leaves the IME candidate window visible.
- `latest-candidate.json` has `present: true`.
- `candidates` includes entries such as `你好`, `👋`, or `你好吗`, depending on current IME state.
- `key arrow-down` expands the candidate list and a later capture contains multiple visible rows.
- `events.jsonl` records DOM key/composition/input events.

---

## Task 1: Add Pure Helpers And Unit Tests

**Files:**
- Create: `.codex/skills/debug-responsive-gui/scripts/lib/ime-control-core.mjs`
- Create: `.codex/skills/debug-responsive-gui/scripts/ime-control.test.mjs`
- Create: `.codex/skills/debug-responsive-gui/scripts/ime-control.mjs`

- [ ] **Step 1: Add a CLI stub**

Create `ime-control.mjs` with a shebang, imports, command dispatch skeleton, and structured JSON output for `--help` / invalid arguments. The stub may exit non-zero for unimplemented commands.

- [ ] **Step 2: Implement argument parsing helpers**

In `ime-control-core.mjs`, export pure helpers:

```javascript
parseArgs(argv)
validatePinyin(text)
normalizeKeyName(key)
keyCodeForKey(key)
sessionDirForId(sessionId)
nextCapturePaths(sessionDir)
```

Rules:

- `start` accepts optional `--preserve`.
- `type <pinyin>` requires `--session <id>` unless rejected before execution.
- `key <name>` requires `--session <id>`.
- `capture` requires `--session <id>`.
- All action commands accept `--no-capture`.
- Pinyin must match `/^[a-z]+$/`.
- Unknown keys fail with a clear error listing allowed keys.

- [ ] **Step 3: Implement candidate sorting helpers**

Export:

```javascript
isVisibleCandidate(candidate)
sortCandidatesForIndex(candidates)
assignCandidateIndexes(candidates)
inferCandidateMode(windowFrame, candidates)
```

Rules:

- Visible candidates require text plus positive width/height.
- Sort by `frame.y`, then `frame.x`.
- `index` is inferred from current visible order, not exposed by AX.
- Mode may be `none`, `compact`, or `expanded`.

- [ ] **Step 4: Add unit tests**

Cover:

- Valid and invalid commands.
- Valid and invalid pinyin.
- Key mapping for all first-version keys.
- `--no-capture` parsing.
- Session path shaping under `/tmp/codex-ime-control`.
- Candidate filtering and row-major sorting.
- Expanded mode inference when candidates occupy multiple rows.

- [ ] **Step 5: Run pure verification**

Run:

```bash
node --check .codex/skills/debug-responsive-gui/scripts/ime-control.mjs
node --check .codex/skills/debug-responsive-gui/scripts/lib/ime-control-core.mjs
node --test .codex/skills/debug-responsive-gui/scripts/ime-control.test.mjs
```

Expected result: syntax and helper tests pass.

## Task 2: Implement Session Start And DOM Event Logger

**Files:**
- Modify: `.codex/skills/debug-responsive-gui/scripts/ime-control.mjs`
- Modify: `.codex/skills/debug-responsive-gui/scripts/lib/ime-control-core.mjs`
- Modify: `.codex/skills/debug-responsive-gui/scripts/ime-control.test.mjs`

- [ ] **Step 1: Create session directories**

Implement `start`:

- Generate a session id that is unique and filesystem-safe.
- Create the session root and `captures/`.
- Write `metadata.json` with session id, created time, command version, and page metadata.
- Create empty `events.jsonl` and `actions.jsonl`.
- Print JSON containing `sessionId` and `sessionDir`.

- [ ] **Step 2: Focus and optionally clear the textarea**

Use `playwright-cli --raw eval` through existing `evalJson()` to:

- Find `textarea[placeholder="Message Codex"]`, falling back to the only textarea if needed.
- Focus it.
- For normal `start`, clear it through the native textarea setter and dispatch an input event.
- For `start --preserve`, leave its value unchanged.
- Return textarea state.

- [ ] **Step 3: Inject the page logger**

Install `window.__codexImeControl` on the page:

- Store an incrementing event id.
- Listen on the target textarea for `compositionstart`, `compositionupdate`, `compositionend`, `keydown`, `keyup`, `beforeinput`, `input`, and `change`.
- Record `type`, `key`, `code`, `isComposing`, `inputType`, `data`, `value`, `selectionStart`, `selectionEnd`, `timeStamp`, `performanceNow`, and `defaultPrevented`.
- Expose a method to drain events after a given id.

- [ ] **Step 4: Fail if logger is missing after start**

For non-`start` commands, check that `window.__codexImeControl` exists and matches the current session id. If missing, fail with a clear message requiring a new `start`.

- [ ] **Step 5: Append drained events**

At the end of each command, drain events since the last recorded id and append them to `events.jsonl`.

## Task 3: Implement Real Keyboard Actions

**Files:**
- Modify: `.codex/skills/debug-responsive-gui/scripts/ime-control.mjs`
- Modify: `.codex/skills/debug-responsive-gui/scripts/lib/ime-control-core.mjs`
- Modify: `.codex/skills/debug-responsive-gui/scripts/ime-control.test.mjs`

- [ ] **Step 1: Implement `type <pinyin>`**

Use AppleScript through `osascript`:

- Activate `Google Chrome for Testing`.
- Send one key code per pinyin letter.
- Keep delays short but explicit enough for IME state to settle.
- Do not press space, enter, or any confirmation key.

- [ ] **Step 2: Implement `key <name>`**

Map first-version keys to AppleScript key codes:

- `arrow-up`, `arrow-down`, `arrow-left`, `arrow-right`
- `digit-1` through `digit-9`
- `space`
- `enter`
- `escape`

The script sends the key to the frontmost `Google Chrome for Testing` process.

- [ ] **Step 3: Record action boundaries**

Append a structured record to `actions.jsonl` before and after each action:

```json
{"type":"ime-control-action","phase":"before","action":"key","key":"enter","at":12345.7}
{"type":"ime-control-action","phase":"after","action":"key","key":"enter","at":12346.1}
```

- [ ] **Step 4: Respect `--no-capture`**

After `type` or `key`, run capture unless `--no-capture` was provided. Always drain DOM events even when capture is skipped.

## Task 4: Implement AX Candidate Capture And PNG Screenshot

**Files:**
- Modify: `.codex/skills/debug-responsive-gui/scripts/ime-control.mjs`
- Modify: `.codex/skills/debug-responsive-gui/scripts/lib/ime-control-core.mjs`
- Modify: `.codex/skills/debug-responsive-gui/scripts/ime-control.test.mjs`

- [ ] **Step 1: Read textarea state**

Capture textarea state with `playwright-cli --raw eval`:

```json
{
  "value": "...",
  "focused": true,
  "selectionStart": 0,
  "selectionEnd": 0
}
```

- [ ] **Step 2: Discover the candidate AX window**

Use Swift to query the `Google Chrome for Testing` AX application:

- Read `kAXWindowsAttribute`.
- Prefer an empty-title `AXWindow` with child `AXList` and candidate `AXButton` children.
- Record window frame.
- Extract button titles/descriptions and frames.

Do not rely only on a fixed owner/layer pattern, because the design notes that owner/layer may vary by macOS/browser version.

- [ ] **Step 3: Fall back to CGWindow metadata for screenshot id**

Use `CGWindowListCopyWindowInfo` to map the AX candidate window frame to a `kCGWindowNumber`:

- Match `owner=Google Chrome for Testing`.
- Prefer `layer > 0`.
- Match bounds close to the AX window frame.
- Return `windowId` for screenshot.

- [ ] **Step 4: Write `candidate.json`**

Shape output as:

```json
{
  "present": true,
  "window": {
    "id": 4332,
    "frame": {"x": -1636, "y": 763, "width": 397, "height": 182}
  },
  "mode": "expanded",
  "candidates": [],
  "textarea": {},
  "screenshot": "captures/0001-candidate.png",
  "notes": []
}
```

When no candidate window is present, write `present: false`, `window: null`, `mode: "none"`, `candidates: []`, and still include textarea state.

- [ ] **Step 5: Write `candidate.png` when a candidate window exists**

Run:

```bash
screencapture -x -o -l <windowId> <candidate.png>
```

If no candidate window exists, do not create a PNG and set `screenshot: null`.

- [ ] **Step 6: Update `latest-candidate.json`**

Copy or write the latest candidate object to the session root after every capture.

## Task 5: Update Skill Instructions And Validate

**Files:**
- Modify: `.codex/skills/debug-responsive-gui/SKILL.md`

- [ ] **Step 1: Add a concise IME control section**

Add a short section that says to use `ime-control.mjs` when testing macOS Simplified Pinyin input, IME candidate windows, or IME Enter behavior in visible `Google Chrome for Testing`.

Include only stable examples:

```bash
node .codex/skills/debug-responsive-gui/scripts/ime-control.mjs start
node .codex/skills/debug-responsive-gui/scripts/ime-control.mjs type nihao --session <session-id>
node .codex/skills/debug-responsive-gui/scripts/ime-control.mjs key arrow-down --session <session-id>
node .codex/skills/debug-responsive-gui/scripts/ime-control.mjs key digit-3 --session <session-id>
```

Mention that agents should read `latest-candidate.json` first and only open `candidate.png` when AX output needs visual verification.

- [ ] **Step 2: Run script and skill validation**

Run:

```bash
find .codex/skills/debug-responsive-gui/scripts -name '*.mjs' -print0 | xargs -0 -n1 node --check
node --test .codex/skills/debug-responsive-gui/scripts/ime-control.test.mjs
/usr/bin/python3 /Users/jiangsheng/.codex/skills/.system/skill-creator/scripts/quick_validate.py .codex/skills/debug-responsive-gui
```

- [ ] **Step 3: Run one live smoke test**

Only when a visible `Google Chrome for Testing` Codex GUI page is available and the macOS input source is Simplified Pinyin:

```bash
node .codex/skills/debug-responsive-gui/scripts/ime-control.mjs start
node .codex/skills/debug-responsive-gui/scripts/ime-control.mjs type nihao --session <session-id>
```

Verify:

- `latest-candidate.json` reports `present: true`.
- `candidates` contains non-empty AX candidate text.
- `candidate.png` exists but does not need to be opened by default.
- `events.jsonl` has key/composition/input records.

## Commit Guidance

After the user confirms implementation and each task is completed:

- Verify the task.
- Stage only files touched by that task.
- Inspect the staged diff.
- Create one local commit for that task.

Do not stage temporary `/tmp/codex-ime-control/**` artifacts. Do not use git remote commands.
