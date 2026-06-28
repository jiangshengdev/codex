# codex-gui Event/Composer Hot Path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove per-projection-event React top-level status updates and keep composer subscribed only to runtime fields that affect composer behavior.

**Architecture:** `GuiHostStatus` becomes a lifecycle-only render contract, while projection events continue through the existing `onProjectionEvent` -> `ProjectionIngressAdapter` -> Redux path. `ComposerTurnControl` switches from full runtime record subscription to primitive selectors for `threadId`, `activeTurnId`, and `subscriptionState`.

**Tech Stack:** React 19, Redux Toolkit, TypeScript, Vitest unit tests, Vitest Browser Mode, Playwright e2e.

---

## Setup

Before any `pnpm` command in `codex-gui`, initialize the user's fnm environment and verify the resolved `pnpm` is not from the Codex runtime cache:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
pnpm --version
which pnpm
```

Expected:

- `pnpm --version` succeeds.
- `which pnpm` does not print a path under `/Users/jiangsheng/.cache/codex-runtimes/`.

Do not install dependencies. Do not run git remote commands.

## File Structure

- Modify `codex-gui/src/features/guiHost/guiHostClient.ts`
  - Own the lifecycle-only `GuiHostStatus` type.
  - Stop emitting status for projection events.
- Modify `codex-gui/src/features/guiHost/__tests__/guiHostClient.test.ts`
  - Lock lifecycle status behavior and projection callback forwarding.
- Modify `codex-gui/src/__tests__/appBrowserTestSupport.ts`
  - Remove `eventCount` / `lastEventType` from status helpers.
- Modify `codex-gui/src/__tests__/App.browser.test.tsx`
  - Remove the stale `"received event"` DOM hook assertion.
  - Preserve coverage through runtime/transcript/composer behavior.
- Modify `codex-gui/e2e/app.spec.ts`
  - Replace `"received event"` status assertion with real attach/request/UI behavior.
- Modify `codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts`
  - Add primitive selectors for `threadId` and `subscriptionState`.
- Modify `codex-gui/src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts`
  - Cover the new selectors and unchanged event buffer behavior.
- Modify `codex-gui/src/features/composerTurnControl/composerTurnControlModel.ts`
  - Change availability input from full runtime/subscription objects to primitive fields.
- Modify `codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx`
  - Subscribe to primitive runtime selectors and use `threadId` for commands.
- Modify `codex-gui/src/features/composerTurnControl/__tests__/composerTurnControlModel.test.ts`
  - Update model tests to the new input shape.
- Modify `codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx`
  - Update status fixtures and preserve command payload coverage.

## Task 1: Make GUI Host Status Lifecycle-Only

**Files:**
- Modify: `codex-gui/src/features/guiHost/guiHostClient.ts`
- Modify: `codex-gui/src/features/guiHost/__tests__/guiHostClient.test.ts`

- [ ] **Step 1: Update the failing guiHostClient test expectation**

In `codex-gui/src/features/guiHost/__tests__/guiHostClient.test.ts`, change the status assertions in `sends authenticate, initialize, attach, and forwards projection payloads` from:

```ts
expect(statuses).toContain("authenticated");
expect(statuses).toContain("initialized");
expect(statuses).toContain("attached");
expect(statuses).toContain("received event");
```

to:

```ts
expect(statuses).toEqual(["connecting", "authenticated", "initialized", "attached"]);
```

Keep these assertions unchanged, because they are the real event behavior:

```ts
expect(attached).toEqual([attachResponse]);
expect(projectionEvents).toEqual([projectionEvent]);
expect(projectionClosedNotifications).toEqual([projectionClosed]);
```

- [ ] **Step 2: Run the focused unit test and verify it fails**

Run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
pnpm run test:unit -- src/features/guiHost/__tests__/guiHostClient.test.ts
```

Expected: FAIL because `guiHostClient` still emits `"received event"` after projection event / closed notifications.

- [ ] **Step 3: Change `GuiHostStatus` to lifecycle-only**

In `codex-gui/src/features/guiHost/guiHostClient.ts`, replace the current `GuiHostStatus` type with:

```ts
export type GuiHostStatus =
  | { label: "connecting" }
  | { label: "authenticated" }
  | { label: "initialized" }
  | { label: "attached" }
  | { label: "closed" }
  | { label: "error"; message: string };
```

Remove `let eventCount = 0;`.

Update lifecycle emits to remove `eventCount` and `lastEventType`:

```ts
emit({ label: "connecting" });
emit({ label: "authenticated" });
emit({ label: "initialized" });
emit({ label: "attached" });
emit({ label: "closed" });
emit({ label: "error", message });
```

In the `thread/projection/event` branch, keep callback forwarding and remove status emission:

```ts
const notification = message.params;
onProjectionEvent?.(notification);
```

In the `thread/projection/closed` branch, keep callback forwarding and remove status emission:

```ts
const notification = message.params;
onProjectionClosed?.(notification);
```

- [ ] **Step 4: Run the focused unit test and verify it passes**

Run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
pnpm run test:unit -- src/features/guiHost/__tests__/guiHostClient.test.ts
```

Expected: PASS.

## Task 2: Add Primitive Runtime Selectors

**Files:**
- Modify: `codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts`
- Modify: `codex-gui/src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts`

- [ ] **Step 1: Write failing selector coverage**

In `codex-gui/src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts`, add `selectThreadRuntimeThreadId` and `selectThreadRuntimeSubscriptionState` to the import list:

```ts
import {
  selectThreadRuntimeActiveTurnId,
  selectThreadRuntimeEventBuffer,
  selectThreadRuntimeRecord,
  selectThreadRuntimeSubscription,
  selectThreadRuntimeSubscriptionState,
  selectThreadRuntimeThreadId,
  threadRuntimeAttached,
  threadRuntimeEventBuffered,
  threadRuntimeManualReconnectRequired,
  threadRuntimeSlice,
  type ThreadRuntimeState,
} from "../threadRuntimeSlice";
```

In `registers thread runtime state in the app store`, add:

```ts
expect(selectThreadRuntimeThreadId(store.getState())).toBeNull();
expect(selectThreadRuntimeSubscriptionState(store.getState())).toBeNull();
```

In `creates a runtime baseline from an accepted attach`, add:

```ts
expect(selectThreadRuntimeThreadId(runtimeRoot(state))).toBe(attachBaseline.snapshot.thread.id);
expect(selectThreadRuntimeSubscriptionState(runtimeRoot(state))).toBe("active");
```

In `records manual reconnect state and blocks later events`, add:

```ts
expect(selectThreadRuntimeSubscriptionState(runtimeRoot(interrupted))).toBe(
  "manualReconnectRequired",
);
```

- [ ] **Step 2: Run the focused unit test and verify it fails**

Run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
pnpm run test:unit -- src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts
```

Expected: FAIL because the new selectors are not exported yet.

- [ ] **Step 3: Add selectors in `threadRuntimeSlice.ts`**

In `codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts`, add selectors next to the existing runtime selectors:

```ts
selectThreadRuntimeThreadId: (threadRuntime) => threadRuntime.current?.threadId ?? null,
selectThreadRuntimeSubscriptionState: (threadRuntime) =>
  threadRuntime.current?.subscription.state ?? null,
```

Export them from `threadRuntimeSlice.selectors`:

```ts
export const {
  selectThreadRuntimeActiveTurnId,
  selectThreadRuntimeEventBuffer,
  selectThreadRuntimeRecord,
  selectThreadRuntimeSubscription,
  selectThreadRuntimeSubscriptionState,
  selectThreadRuntimeThreadId,
} = threadRuntimeSlice.selectors;
```

- [ ] **Step 4: Run the focused unit test and verify it passes**

Run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
pnpm run test:unit -- src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts
```

Expected: PASS.

## Task 3: Narrow Composer Model and Component Subscriptions

**Files:**
- Modify: `codex-gui/src/features/composerTurnControl/composerTurnControlModel.ts`
- Modify: `codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx`
- Modify: `codex-gui/src/features/composerTurnControl/__tests__/composerTurnControlModel.test.ts`
- Modify: `codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx`

- [ ] **Step 1: Update model tests to the primitive input shape**

In `codex-gui/src/features/composerTurnControl/__tests__/composerTurnControlModel.test.ts`, remove these imports:

```ts
import { attachBaseline } from "@/features/projection/__tests__/projectionFixtures";
import { runtimeFromAttach } from "@/features/projection/__tests__/projectionTestBuilders";
```

Replace the status fixture:

```ts
const attachedStatus: GuiHostStatus = {
  label: "attached",
};
```

Remove:

```ts
const runtime = runtimeFromAttach(attachBaseline);
```

Rename the availability test to:

```ts
it("requires attached identity, active subscription, thread id, and usable host status", () => {
```

Use this body:

```ts
expect(
  isConnectionUsable({
    canAdvanceThreadIdentity: true,
    guiHostStatus: attachedStatus,
    threadId: "thread-1",
    subscriptionState: "active",
  }),
).toBe(true);

expect(
  isConnectionUsable({
    canAdvanceThreadIdentity: false,
    guiHostStatus: attachedStatus,
    threadId: "thread-1",
    subscriptionState: "active",
  }),
).toBe(false);

expect(
  isConnectionUsable({
    canAdvanceThreadIdentity: true,
    guiHostStatus: attachedStatus,
    threadId: null,
    subscriptionState: "active",
  }),
).toBe(false);

expect(
  isConnectionUsable({
    canAdvanceThreadIdentity: true,
    guiHostStatus: attachedStatus,
    threadId: "thread-1",
    subscriptionState: "manualReconnectRequired",
  }),
).toBe(false);

expect(
  isConnectionUsable({
    canAdvanceThreadIdentity: true,
    guiHostStatus: { label: "error", message: "boom" },
    threadId: "thread-1",
    subscriptionState: "active",
  }),
).toBe(false);
```

- [ ] **Step 2: Run the model test and verify it fails**

Run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
pnpm run test:unit -- src/features/composerTurnControl/__tests__/composerTurnControlModel.test.ts
```

Expected: FAIL because `isConnectionUsable` still expects `runtime` and `subscription`.

- [ ] **Step 3: Update `composerTurnControlModel.ts`**

In `codex-gui/src/features/composerTurnControl/composerTurnControlModel.ts`, replace the runtime imports:

```ts
import type { ThreadRuntimeSubscription } from "@/features/threadRuntime/threadRuntimeSlice";
```

Update `ComposerAvailabilityInput`:

```ts
export type ComposerAvailabilityInput = {
  canAdvanceThreadIdentity: boolean;
  guiHostStatus: GuiHostStatus;
  threadId: string | null;
  subscriptionState: ThreadRuntimeSubscription["state"] | null;
};
```

Update `isConnectionUsable`:

```ts
export function isConnectionUsable(input: ComposerAvailabilityInput): boolean {
  return (
    input.canAdvanceThreadIdentity &&
    input.threadId != null &&
    input.subscriptionState === "active" &&
    input.guiHostStatus.label !== "error" &&
    input.guiHostStatus.label !== "closed"
  );
}
```

- [ ] **Step 4: Update browser test status fixtures**

In `codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx`, change:

```ts
const attachedStatus: GuiHostStatus = { label: "attached", eventCount: 0, lastEventType: null };
```

to:

```ts
const attachedStatus: GuiHostStatus = { label: "attached" };
```

Change the connecting status fixture from:

```tsx
guiHostStatus={{ label: "connecting", eventCount: 0, lastEventType: null }}
```

to:

```tsx
guiHostStatus={{ label: "connecting" }}
```

- [ ] **Step 5: Update `ComposerTurnControl.tsx` to use primitive selectors**

In `codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx`, replace the runtime selector imports:

```ts
import {
  selectThreadRuntimeActiveTurnId,
  selectThreadRuntimeSubscriptionState,
  selectThreadRuntimeThreadId,
} from "@/features/threadRuntime/threadRuntimeSlice";
```

Replace runtime subscriptions:

```ts
const threadId = useAppSelector(selectThreadRuntimeThreadId);
const activeTurnId = useAppSelector(selectThreadRuntimeActiveTurnId);
const subscriptionState = useAppSelector(selectThreadRuntimeSubscriptionState);
```

Update `isConnectionUsable` call:

```ts
const connectionUsable =
  commands != null &&
  isConnectionUsable({
    canAdvanceThreadIdentity,
    guiHostStatus,
    threadId,
    subscriptionState,
  });
```

Update `submit` guard and payload:

```ts
if (!sendEnabled || threadId == null || commands == null) {
  return;
}
```

```ts
await commands.startTurn({
  threadId,
  clientUserMessageId: null,
  input: [buildPlainTextInput(submittedDraft)],
});
```

Update `stop` guard and payload:

```ts
if (!stopEnabled || threadId == null || activeTurnId == null || commands == null) {
  return;
}
```

```ts
await commands.interruptTurn({
  threadId,
  turnId: activeTurnId,
});
```

- [ ] **Step 6: Run focused composer tests and verify they pass**

Run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
pnpm run test:unit -- src/features/composerTurnControl/__tests__/composerTurnControlModel.test.ts
pnpm run test:browser -- src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx
```

Expected: PASS.

## Task 4: Update App and E2E Test Contracts

**Files:**
- Modify: `codex-gui/src/__tests__/appBrowserTestSupport.ts`
- Modify: `codex-gui/src/__tests__/App.browser.test.tsx`
- Modify: `codex-gui/e2e/app.spec.ts`

- [ ] **Step 1: Update App browser test support status helpers**

In `codex-gui/src/__tests__/appBrowserTestSupport.ts`, change `markHostAttached` from:

```ts
export const markHostAttached = (options: StartGuiHostConnectionOptions): void => {
  options.onStatus?.({ label: "attached", eventCount: 0, lastEventType: null });
};
```

to:

```ts
export const markHostAttached = (options: StartGuiHostConnectionOptions): void => {
  options.onStatus?.({ label: "attached" });
};
```

If `emitGuiHostStatus` becomes unused after updating tests, remove it and remove the `emitStatus` variable. Keep `markHostAttached` because tests still need to model lifecycle status.

- [ ] **Step 2: Replace the stale App browser status-hook test**

In `codex-gui/src/__tests__/App.browser.test.tsx`, remove `emitGuiHostStatus` from the import list.

Replace the test named `App keeps host status as a test hook instead of visible shell content` with:

```ts
test("App keeps host lifecycle status stable while projection events update runtime", async () => {
  const screen = await renderWithProviders(<App />);
  const { store } = screen;
  const options = getHostOptions(startGuiHostConnectionMock);

  attachProjection(options);
  markHostAttached(options);
  emitProjectionEvent(options, eventTurnStarted);

  await expect
    .element(screen.getByRole("main"))
    .toHaveAttribute("data-gui-host-status", "attached");
  expect(selectThreadRuntimeEventBuffer(store.getState())).toStrictEqual([
    { type: "projectionEvent", notification: eventTurnStarted },
  ]);
});
```

This locks the intended behavior: projection events update runtime, not top-level host status.

- [ ] **Step 3: Update remaining App browser status fixtures**

Search:

```sh
rg -n -e 'eventCount|lastEventType|received event|emitGuiHostStatus' src/__tests__ src/features
```

Within `codex-gui`, expected remaining matches after this task:

- No `eventCount` / `lastEventType` in App/browser support or composer tests.
- No `"received event"` DOM assertion.
- `received event` may remain only if an unrelated historical string still exists; if it exists in status assertions, remove it.

- [ ] **Step 4: Update the e2e attach test**

In `codex-gui/e2e/app.spec.ts`, rename:

```ts
test("authenticates, attaches, records projection status, and clears token", async ({ page }) => {
```

to:

```ts
test("authenticates, attaches, records attach state, and clears token", async ({ page }) => {
```

Replace:

```ts
await expect(page.locator("main")).toHaveAttribute("data-gui-host-status", "received event");
await expect(page.getByRole("region", { name: "Committed transcript" })).toBeVisible();
await expect(page.getByText("No committed messages yet.")).toBeVisible();
```

with:

```ts
await expect(page.locator("main")).toHaveAttribute("data-gui-host-status", "attached");
await expect(page.getByRole("region", { name: "Committed transcript" })).toBeVisible();
await expect(page.getByText("No committed messages yet.")).toBeVisible();
```

Keep the request assertion:

```ts
await expect
  .poll(() => sentRequests.map((request) => request.method))
  .toEqual(["gui/authenticate", "initialize", "thread/projection/attach"]);
```

This test no longer treats projection event telemetry as a render contract.

- [ ] **Step 5: Run focused App browser and e2e tests**

Run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
pnpm run test:browser -- src/__tests__/App.browser.test.tsx
pnpm run test:e2e -- e2e/app.spec.ts
```

Expected: PASS.

If e2e is slow or environment-sensitive, record the exact failure and continue with `test:browser`, `test:unit`, and `type-check`; do not replace e2e assertions with another DOM debug hook.

## Task 5: Typecheck and Full Focused Verification

**Files:**
- No additional source files expected.

- [ ] **Step 1: Run typecheck**

Run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
pnpm run type-check
```

Expected: PASS.

- [ ] **Step 2: Run the focused unit tests together**

Run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
pnpm run test:unit -- src/features/guiHost/__tests__/guiHostClient.test.ts src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts src/features/composerTurnControl/__tests__/composerTurnControlModel.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run the focused browser tests together**

Run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
pnpm run test:browser -- src/__tests__/App.browser.test.tsx src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx
```

Expected: PASS.

- [ ] **Step 4: Run formatting/lint if implementation changed source**

Run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
pnpm run format:prettier
pnpm run lint
```

Expected: PASS.

- [ ] **Step 5: Optional local commit checkpoint**

Only if the user explicitly asks to commit, stage the files touched by this plan and commit them together:

```sh
git add codex-gui/src/features/guiHost/guiHostClient.ts \
  codex-gui/src/features/guiHost/__tests__/guiHostClient.test.ts \
  codex-gui/src/__tests__/appBrowserTestSupport.ts \
  codex-gui/src/__tests__/App.browser.test.tsx \
  codex-gui/e2e/app.spec.ts \
  codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts \
  codex-gui/src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts \
  codex-gui/src/features/composerTurnControl/composerTurnControlModel.ts \
  codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx \
  codex-gui/src/features/composerTurnControl/__tests__/composerTurnControlModel.test.ts \
  codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx
git commit -m "perf(gui): remove event status from composer hot path"
```

Expected: one local commit. Do not push.
