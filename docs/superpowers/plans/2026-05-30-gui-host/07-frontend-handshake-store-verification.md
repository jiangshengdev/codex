# Codex GUI Host Frontend Handshake/Store Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 核对当前 `codex-gui` 的 GUI host handshake、projection attach/event 分发和 Redux boundary 是否符合已锁定设计，并补齐缺失的最小测试覆盖。

**Architecture:** 本计划执行 `00-roadmap.md` 中的 `07 frontend handshake/store verification`。它是 frontend verification plan，不重做 `04/05/06`，不进入 `08` packaging/e2e；`guiHostClient.ts` 必须保持 store-free，Redux dispatch 只能留在 `App.tsx` 或 React boundary。若当前代码已满足设计，本计划主要产出 audit 结论和验证记录；只有发现测试覆盖缺口时，才允许在现有 frontend test 文件中补最小测试。

**Tech Stack:** React 19, Redux Toolkit, TypeScript, Vite, Vitest, Vitest Browser Mode, `@codex-protocol/v2`.

---

## Scope

本计划只核对和必要时补齐 `codex-gui` 的 frontend handshake/store verification。

允许修改：

- `codex-gui/src/features/guiHost/guiHostClient.test.ts`
- `codex-gui/src/__tests__/App.browser.test.tsx`
- `codex-gui/src/features/projection/__tests__/projectionSlice.test.ts`
- `docs/superpowers/plans/2026-05-30-gui-host/07-frontend-handshake-store-verification.md`

只允许在明确发现设计覆盖缺口时修改：

- `codex-gui/src/features/guiHost/guiHostClient.ts`
- `codex-gui/src/App.tsx`
- `codex-gui/src/features/projection/projectionSlice.ts`

不允许修改：

- `codex-rs/**`
- `codex-gui/package.json`
- `codex-gui/pnpm-lock.yaml`
- `codex-gui/pnpm-workspace.yaml`
- `codex-gui/vite.config.ts`
- `codex-gui/vitest*.config.ts`
- `codex-gui/src/features/**` except the files explicitly listed above
- `docs/superpowers/specs/**`
- `docs/superpowers/plans/2026-05-30-gui-host/08-*`

停止条件：

- 如果需要修改 Rust bridge、TUI `/gui`、app-server-client facade 或 `codex-gui-host`，停止；那说明 `04/05/06` 的结果需要先审计。
- 如果需要新增 app-server protocol v2 API 或改变 projection payload shape，停止；`07` 只能消费现有 `@codex-protocol/v2` 类型。
- 如果需要实现 projection viewer、user turn、approval、interrupt、tool 调用、subagent switching、browser control、LAN/mobile/public relay，停止；这些不属于 frontend transport MVP。
- 如果 `guiHostClient.ts` 需要 import Redux store、`useAppDispatch`、`useSelector`、React hooks 或 slice action，停止；dispatch 必须留在 React boundary。
- 如果 `App.tsx` 需要持有 WebSocket framing/parsing/JSON-RPC handshake 细节，停止；这些必须留在 `guiHostClient.ts`。
- 如果 focused browser verification requires prod asset/package root behavior, stop and leave it for `08-packaging-e2e-verification.md`.

## Source Of Truth

解释冲突时按以下顺序：

1. `docs/superpowers/plans/2026-05-30-gui-host/00-roadmap.md`
2. `docs/superpowers/specs/2026-05-11-codex-gui-host-redesign.md`
3. `docs/superpowers/specs/2026-05-30-codex-gui-host-dev-adaptation-design.md`
4. `docs/superpowers/specs/2026-05-02-codex-gui-projection-design.md`
5. `docs/superpowers/specs/2026-05-08-codex-gui-server-projection-redesign.md`
6. current source under `codex-gui/**`

Fixed `07` boundaries from `00-roadmap.md`:

- `guiHostClient.ts` stays store-free.
- Redux dispatch stays in `App.tsx` or React boundary.
- Only handshake / attach / event MVP is in scope.
- Projection viewer is out of scope.
- `08` owns prod asset, npm package root, and end-to-end verification.

## File Responsibilities

- `codex-gui/src/features/guiHost/guiHostClient.ts`: store-free browser transport client; owns launch param parsing, token fragment cleanup, same-origin `/ws`, `gui/authenticate`, `initialize`, `thread/projection/attach`, `thread/projection/event`, malformed payload handling, terminal error handling, and cleanup.
- `codex-gui/src/features/guiHost/guiHostClient.test.ts`: unit tests for token handling, handshake order, projection attach/event callbacks, malformed payload rejection, JSON-RPC error behavior, socket cleanup, and policy close status.
- `codex-gui/src/App.tsx`: React boundary; creates GUI host connection, stores status for the page, dispatches projection attach/event payloads into Redux, and cleans up on unmount.
- `codex-gui/src/__tests__/App.browser.test.tsx`: browser-mode tests for status rendering, React-boundary dispatch into Redux, and cleanup.
- `codex-gui/src/features/projection/projectionSlice.ts`: Redux projection state updates for attach and projection event notifications.
- `codex-gui/src/features/projection/__tests__/projectionSlice.test.ts`: reducer coverage for attach, event application, subscription mismatch, duplicate commit, chain mismatch, and missing turn behavior.

## Task 1: Confirm Roadmap And Source Design Inputs

**Files:**
- Verify: `docs/superpowers/plans/2026-05-30-gui-host/00-roadmap.md`
- Verify: `docs/superpowers/specs/2026-05-11-codex-gui-host-redesign.md`
- Verify: `docs/superpowers/specs/2026-05-30-codex-gui-host-dev-adaptation-design.md`
- Verify: `docs/superpowers/plans/2026-05-30-gui-host/06-tui-gui-command.md`
- Modify only if recording execution: `docs/superpowers/plans/2026-05-30-gui-host/07-frontend-handshake-store-verification.md`

- [ ] **Step 1: Confirm `07` is after TUI and before packaging**

Run from repo root:

```bash
rg -n '06 TUI /gui command|07 frontend handshake/store verification|08 packaging and end-to-end verification|guiHostClient.ts` 保持 store-free|Redux dispatch 留在 `App.tsx`|不做 projection viewer' \
  docs/superpowers/plans/2026-05-30-gui-host/00-roadmap.md
```

Expected: output shows `06 -> 07 -> 08`, confirms `guiHostClient.ts` is store-free, dispatch stays in `App.tsx`, and projection viewer is out of scope.

- [ ] **Step 2: Confirm main design still defines transport MVP only**

Run from repo root:

```bash
rg -n '不自动打开浏览器|gui/authenticate|thread/projection/attach|thread/projection/event|首版 projection 目标是 transport MVP|不是完整 projection viewer|验收以 WebSocket frames 和最小页面状态为准|at least one thread/projection/event is visible' \
  docs/superpowers/specs/2026-05-11-codex-gui-host-redesign.md
```

Expected: output confirms the frontend must prove `gui/authenticate -> initialize -> thread/projection/attach -> thread/projection/event`, and must not become a full projection viewer.

- [ ] **Step 3: Confirm adaptation design keeps frontend work after backend/TUI**

Run from repo root:

```bash
rg -n '方案 A|薄 hook \\+ 旁路模块|app-server-client/src/gui.rs|/gui` 首版只返回本机 GUI host URL|GUI host 迁移不应把这些文件改成 GUI 专用实现|计划防漂移锁|停止条件' \
  docs/superpowers/specs/2026-05-30-codex-gui-host-dev-adaptation-design.md
```

Expected: output confirms `07` must execute the locked design and must not reopen backend bridge shape.

- [ ] **Step 4: Confirm `06` stopped before frontend**

Run from repo root:

```bash
rg -n 'codex-gui/\\*\\*|frontend|projection store|browser handshake|属于 `07-frontend-handshake-store-verification.md`|Stop before frontend work' \
  docs/superpowers/plans/2026-05-30-gui-host/06-tui-gui-command.md
```

Expected: output confirms `06` did not own frontend handshake/store changes and explicitly deferred them to `07`.

- [ ] **Step 5: Record design input result**

Append this exact result shape under `Execution Notes` in this file:

```markdown
### Task 1 Result: Design Inputs

- PASS: `00-roadmap.md` places `07` between TUI `/gui` and packaging/e2e.
- PASS: `2026-05-11` design defines frontend scope as projection transport MVP, not projection viewer.
- PASS: `2026-05-30` adaptation design keeps bridge shape locked and leaves frontend verification as a separate step.
- PASS: `06-tui-gui-command.md` stopped before frontend handshake/store verification.
```

If any expected line is missing, stop and replace the relevant `PASS` with `BLOCKED`, including the exact missing pattern and file path.

## Task 2: Audit `guiHostClient.ts` Store-Free Transport Boundary

**Files:**
- Verify: `codex-gui/src/features/guiHost/guiHostClient.ts`
- Verify: `codex-gui/src/features/guiHost/guiHostClient.test.ts`
- Modify only if coverage is missing: `codex-gui/src/features/guiHost/guiHostClient.test.ts`

- [ ] **Step 1: Confirm transport client has no store or React dependency**

Run from repo root:

```bash
rg -n "useAppDispatch|useDispatch|useSelector|configureStore|createAppSlice|projectionAttached|projectionEventReceived|react-redux|@reduxjs/toolkit|from ['\"]react['\"]" \
  codex-gui/src/features/guiHost/guiHostClient.ts
```

Expected: no output. Any match means the transport client is no longer store-free; stop and move that dependency back to `App.tsx` or a React boundary before continuing.

- [ ] **Step 2: Confirm launch params and token fragment behavior**

Run from repo root:

```bash
rg -n 'readLaunchParams|clearLaunchTokenFragment|launchTokenStorageKey|Missing threadId query parameter|Missing launch token fragment|setItem|getItem|replaceState' \
  codex-gui/src/features/guiHost/guiHostClient.ts \
  codex-gui/src/features/guiHost/guiHostClient.test.ts
```

Expected: output confirms token is read from URL fragment, fragment is cleared through `replaceState`, token can be restored from storage, missing `threadId` and missing token are explicit errors, and tests cover storage failure.

- [ ] **Step 3: Confirm handshake order and same-origin WebSocket**

Run from repo root:

```bash
rg -n 'createWebSocket|webSocketProtocol|/ws|gui/authenticate|initialize|thread/projection/attach|thread/projection/event|sendRequest\\(socket, 1|sendRequest\\(socket, 2|sendRequest\\(socket, 3|socket.sent.map\\(readRpcMethod\\)' \
  codex-gui/src/features/guiHost/guiHostClient.ts \
  codex-gui/src/features/guiHost/guiHostClient.test.ts
```

Expected: output confirms the client connects to same-origin `/ws`, sends `gui/authenticate` first, sends `initialize` second only after auth succeeds, sends `thread/projection/attach` third only after initialize succeeds, and test expectations assert exactly those three outgoing methods.

- [ ] **Step 4: Confirm projection payload forwarding and validation**

Run from repo root:

```bash
rg -n 'onProjectionAttached|onProjectionEvent|isThreadProjectionAttachResponse|isThreadProjectionEventNotification|thread/projection/attach returned malformed result payload|thread/projection/event returned malformed params payload|attached.push|projectionEvents.push' \
  codex-gui/src/features/guiHost/guiHostClient.ts \
  codex-gui/src/features/guiHost/guiHostClient.test.ts
```

Expected: output confirms attach and event payloads are validated before callbacks fire, and malformed attach/event payload tests assert callbacks are not invoked.

- [ ] **Step 5: Confirm terminal error and cleanup behavior**

Run from repo root:

```bash
rg -n 'terminalError|Malformed JSON-RPC message|JSON-RPC error|socket.close\\(1000, \"handshake error\"\\)|socket.close\\(1000, \"invalid message\"\\)|socket.close\\(1000, \"cleanup\"\\)|reports policy-close as error|suppresses later status updates during cleanup|keeps terminal error state' \
  codex-gui/src/features/guiHost/guiHostClient.ts \
  codex-gui/src/features/guiHost/guiHostClient.test.ts
```

Expected: output confirms malformed JSON-RPC, JSON-RPC errors, non-1000 close, cleanup, and terminal error ordering are covered.

- [ ] **Step 6: Add missing unit coverage only if one of Steps 2-5 is incomplete**

If Steps 2-5 all pass, skip this step and record `SKIPPED: existing guiHostClient tests cover transport MVP`.

If a missing branch is found, edit `codex-gui/src/features/guiHost/guiHostClient.test.ts` by adding the smallest test for the missing branch. For example, if missing token coverage is absent, add this test inside `describe("guiHostClient", () => { ... })`:

```ts
  it("throws when launch URL has no fragment token and storage has no token", () => {
    expect(() =>
      readLaunchParams(
        new URL("http://127.0.0.1:4567/?threadId=thread-abc"),
        new MemoryStorage(),
      ),
    ).toThrow("Missing launch token fragment");
  });
```

If a different branch is missing, write the same style of single-branch test in this file using the existing `RecordingWebSocket`, `MemoryStorage`, fixtures, and `readRpcMethod` helpers. Do not add production code to satisfy a test that only restates existing behavior.

## Task 3: Audit React/Redux Boundary In `App.tsx`

**Files:**
- Verify: `codex-gui/src/App.tsx`
- Verify: `codex-gui/src/__tests__/App.browser.test.tsx`
- Verify: `codex-gui/src/features/projection/projectionSlice.ts`
- Verify: `codex-gui/src/features/projection/__tests__/projectionSlice.test.ts`
- Modify only if coverage is missing: `codex-gui/src/__tests__/App.browser.test.tsx`
- Modify only if coverage is missing: `codex-gui/src/features/projection/__tests__/projectionSlice.test.ts`

- [ ] **Step 1: Confirm App owns Redux dispatch and not JSON-RPC parsing**

Run from repo root:

```bash
rg -n 'useAppDispatch|startGuiHostConnection|onProjectionAttached|onProjectionEvent|projectionAttached|projectionEventReceived|dispatch\\(' \
  codex-gui/src/App.tsx

rg -n 'JSON\\.parse|sendRequest|gui/authenticate|thread/projection/attach|thread/projection/event|new WebSocket|socket\\.send' \
  codex-gui/src/App.tsx
```

Expected: first command shows `App.tsx` dispatches attach/event payloads from callbacks. Second command produces no output; JSON-RPC parsing, request sending, and socket creation must remain in `guiHostClient.ts`.

- [ ] **Step 2: Confirm App browser tests cover status, dispatch, and cleanup**

Run from repo root:

```bash
rg -n 'renders the GUI host status panel|reflects GUI host status callback updates|dispatches GUI host projection payloads into Redux|closes the GUI host connection when unmounted|selectProjectionByThreadId|cleanupConnectionCallCount' \
  codex-gui/src/__tests__/App.browser.test.tsx
```

Expected: output confirms browser tests verify the visible status panel, status callbacks, Redux projection dispatch, and cleanup on unmount.

- [ ] **Step 3: Confirm projection reducer handles attach/event MVP**

Run from repo root:

```bash
rg -n 'projectionAttached|projectionEventReceived|commitChainMismatch|missingTurn|subscriptionId|headCommitId|turnStarted|itemStarted|itemCompleted|turnCompleted' \
  codex-gui/src/features/projection/projectionSlice.ts \
  codex-gui/src/features/projection/__tests__/projectionSlice.test.ts
```

Expected: output confirms attach replaces the projection snapshot, event application advances `headCommitId`, mismatched subscription is ignored, duplicate commit is ignored, chain mismatch marks `commitChainMismatch`, and missing turn marks `missingTurn`.

- [ ] **Step 4: Add missing React-boundary coverage only if Steps 1-3 are incomplete**

If Steps 1-3 all pass, skip this step and record `SKIPPED: existing App/projection tests cover React boundary`.

If App dispatch coverage is missing, add this test to `codex-gui/src/__tests__/App.browser.test.tsx`:

```tsx
test("App dispatches GUI host projection payloads into Redux", async () => {
  const { store } = await renderWithProviders(<App />);
  const attachResponse = attachBaselineJson as ThreadProjectionAttachResponse;
  const projectionEvent = eventTurnStartedJson as ThreadProjectionEventNotification;
  const threadId = attachResponse.snapshot.thread.id;
  if (projectionEvent.event.type !== "turnStarted") {
    throw new Error("fixture must contain a turnStarted projection event");
  }

  const options = startGuiHostConnectionMock.mock.calls[0]?.[0];
  options?.onProjectionAttached?.(attachResponse);
  options?.onProjectionEvent?.(projectionEvent);

  const projection = selectProjectionByThreadId(store.getState(), threadId);
  expect(projection?.subscriptionId).toBe(attachResponse.subscriptionId);
  expect(projection?.headCommitId).toBe(projectionEvent.commitId);
  expect(projection?.thread.turns).toEqual([
    ...attachResponse.snapshot.thread.turns,
    projectionEvent.event.notification.turn,
  ]);
});
```

Do not move dispatch into `guiHostClient.ts`.

## Task 4: Run Focused Frontend Verification

**Files:**
- Verify: `codex-gui/package.json`
- Verify: `codex-gui/src/features/guiHost/guiHostClient.test.ts`
- Verify: `codex-gui/src/features/projection/__tests__/projectionSlice.test.ts`
- Verify: `codex-gui/src/__tests__/App.browser.test.tsx`
- Modify only if recording execution: `docs/superpowers/plans/2026-05-30-gui-host/07-frontend-handshake-store-verification.md`

- [ ] **Step 1: Confirm frontend test scripts**

Run from repo root:

```bash
rg -n '\"test\": \"vitest --run\"|\"test:browser\": \"vitest --config=vitest.browser.config.ts\"|\"type-check\": \"tsc -b --noEmit\"|\"lint\": \"pnpm eslint .\"|\"format\": \"prettier --check .\"' \
  codex-gui/package.json
```

Expected: output confirms the repo has unit, browser, type-check, lint, and format scripts.

- [ ] **Step 2: Run focused unit tests**

Run from `codex-gui`:

```bash
pnpm exec vitest --run \
  src/features/guiHost/guiHostClient.test.ts \
  src/features/projection/__tests__/projectionSlice.test.ts
```

Expected: PASS. If this fails, inspect the first failing assertion and fix only the relevant test or frontend MVP code inside the allowed files.

- [ ] **Step 3: Run focused browser-mode App test**

Run from `codex-gui`:

```bash
pnpm exec vitest --config=vitest.browser.config.ts --run src/__tests__/App.browser.test.tsx
```

Expected: PASS. If this fails because the browser provider cannot start in the local environment, record the exact environment error and do not replace it with a non-browser test unless the failure is a code assertion failure.

- [ ] **Step 4: Run type-check for changed frontend files**

Run from `codex-gui`:

```bash
pnpm run type-check
```

Expected: PASS. If this fails, fix only type errors in allowed frontend files.

- [ ] **Step 5: Run format check**

Run from `codex-gui`:

```bash
pnpm run format
```

Expected: PASS. If this fails only for files changed in this plan, run `pnpm run format:fix` from `codex-gui`, then continue. If it fails for unrelated files, record the paths and do not reformat unrelated files.

- [ ] **Step 6: Do not run packaging/e2e in this plan**

Do not run:

```bash
pnpm run build
pnpm run test:e2e
```

Those commands belong to `08-packaging-e2e-verification.md`, because they verify prod assets, package root, and browser-to-host end-to-end behavior.

## Task 5: Final Scope Hygiene And Handoff To `08`

**Files:**
- Verify: git diff scope
- Modify only if recording execution: `docs/superpowers/plans/2026-05-30-gui-host/07-frontend-handshake-store-verification.md`

- [ ] **Step 1: Confirm changed files stay in `07` scope**

Run from repo root:

```bash
git diff --name-only
```

Expected: output is empty if this was verification-only, or limited to:

```text
codex-gui/src/features/guiHost/guiHostClient.test.ts
codex-gui/src/__tests__/App.browser.test.tsx
codex-gui/src/features/projection/__tests__/projectionSlice.test.ts
docs/superpowers/plans/2026-05-30-gui-host/07-frontend-handshake-store-verification.md
```

If any `codex-rs/**`, `codex-gui/package.json`, lockfile, config, spec, or `08-*` path appears, stop and remove or explicitly justify the out-of-scope change before proceeding.

- [ ] **Step 2: Confirm forbidden frontend imports are absent**

Run from repo root:

```bash
rg -n "useAppDispatch|useDispatch|useSelector|configureStore|projectionAttached|projectionEventReceived|react-redux|@reduxjs/toolkit|from ['\"]react['\"]" \
  codex-gui/src/features/guiHost/guiHostClient.ts

rg -n 'codex-app-server|codex-gui-host|codex_app_server|codex_gui_host|GuiHostManager|Origin|allowlist' \
  codex-gui/src/App.tsx \
  codex-gui/src/features/guiHost/guiHostClient.ts
```

Expected: first command has no output. Second command has no output for backend-only crate/type names; frontend may mention launch-token behavior only through URL fragment and local storage variable names already audited in Task 2.

- [ ] **Step 3: Record final frontend verification result**

Append this exact result shape under `Execution Notes` in this file:

```markdown
### Final Result

- PASS: `guiHostClient.ts` remains store-free and owns browser JSON-RPC handshake details.
- PASS: `App.tsx` remains the React/Redux boundary for projection attach/event dispatch.
- PASS: focused guiHost/projection unit tests passed or environment failures are recorded above.
- PASS: focused App browser-mode test passed or environment failures are recorded above.
- PASS: `07` did not enter packaging/e2e scope.

Ready next plan: `08-packaging-e2e-verification.md`.
```

If any verification failed, replace the relevant `PASS` with `BLOCKED` and include the exact failing command plus first failing assertion or environment error.

- [ ] **Step 4: Commit only if tests or this plan file changed**

If executing this plan changed test files or this plan file, commit only the allowed files:

```bash
git add \
  docs/superpowers/plans/2026-05-30-gui-host/07-frontend-handshake-store-verification.md \
  codex-gui/src/features/guiHost/guiHostClient.test.ts \
  codex-gui/src/__tests__/App.browser.test.tsx \
  codex-gui/src/features/projection/__tests__/projectionSlice.test.ts
git diff --cached --name-only
git commit -m "test(gui): verify GUI host frontend handshake"
```

Expected staged paths are limited to the files above. If only the plan file changed, use:

```bash
git commit -m "docs(gui): add frontend handshake verification plan"
```

Do not commit unrelated local changes.

## Execution Notes

Append execution results here when this plan is run. Keep this section append-only.

## Self-Review Checklist

- [x] This plan executes `07` and stops before `08`.
- [x] This plan treats existing `codex-gui` code as the first source to verify, not as code to rewrite.
- [x] `guiHostClient.ts` is required to stay store-free.
- [x] Redux dispatch is required to stay in `App.tsx` or React boundary.
- [x] The plan verifies `gui/authenticate -> initialize -> thread/projection/attach -> thread/projection/event`.
- [x] The plan does not add projection viewer, browser control, user turn, approval, interrupt, or e2e packaging behavior.
- [x] Verification commands use existing `codex-gui` scripts and focused Vitest targets.
