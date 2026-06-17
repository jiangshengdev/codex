# Chat Shell Style Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `App` into a production single-column committed transcript shell by removing the visible `GUI host` debug panel and keeping host status as an internal/test signal.

**Architecture:** Keep `App` responsible for GUI host connection, projection ingress, and Redux dispatch, but make `CommittedTranscriptSurface` the only visible main UI. Preserve `data-gui-host-status` for browser/e2e tests, update tests that currently assert the old debug panel, make the committed empty state depend on committed chunks rather than raw turn ids, and style the committed transcript surface with component-local Tailwind while retaining stable semantic class hooks.

**Tech Stack:** TypeScript, React 19, Redux Toolkit, React Redux typed hooks, Tailwind CSS v4, existing HeroUI v3 styles, Vitest Browser Mode, Playwright e2e, pnpm.

---

## Source Design

Implement exactly the confirmed design:

- `docs/superpowers/specs/2026-06-17-yolo-single-session-chat-performance-v2/04-chat-shell-style-design.md`

This plan depends on, but does not modify:

- `docs/superpowers/specs/2026-06-17-yolo-single-session-chat-performance-v2/03-committed-transcript-surface-design.md`

Do not modify any design document while executing this plan. If the design proves insufficient, stop implementation and report the mismatch before editing design or plan content.

## Scope

This plan modifies:

- `codex-gui/src/App.tsx`
- `codex-gui/src/__tests__/App.browser.test.tsx`
- `codex-gui/e2e/app.spec.ts`
- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx`

This plan does not modify:

- `docs/superpowers/specs/**`
- `docs/superpowers/plans/2026-06-17-yolo-single-session-chat-performance-v2/03-committed-transcript-surface/plan-03-committed-transcript-surface.md`
- `codex-gui/src/features/transcriptState/**`
- `codex-gui/src/features/guiHost/**`
- `codex-gui/src/features/projectionIngress/**`
- `codex-gui/src/features/threadRuntime/**`
- `codex-gui/src/index.css`
- `codex-gui/package.json`
- `codex-gui/pnpm-lock.yaml`
- Any lockfile

## File Structure

- Modify: `codex-gui/src/App.tsx`
  - Remove the visible host status `<section>`.
  - Remove the derived `isAttached` value because it only served the debug panel.
  - Keep `status` state and `data-gui-host-status={status.label}`.
  - Render `CommittedTranscriptSurface` as the only visible child of `main`.
- Modify: `codex-gui/src/__tests__/App.browser.test.tsx`
  - Replace debug-panel visibility assertions with production shell assertions.
  - Keep status callback coverage by checking `data-gui-host-status`, not visible text.
  - Keep app-level projection attach coverage for committed transcript content.
- Modify: `codex-gui/e2e/app.spec.ts`
  - Stop expecting visible launch-param error text, `yes`, event count, and event type.
  - Continue asserting `main[data-gui-host-status]` for internal/test status.
  - Assert the committed transcript region remains the visible shell.
- Modify: `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx`
  - Treat "empty committed transcript" as "no committed chunks", not "no turns".
  - Add Tailwind classes directly to the committed transcript components.
  - Preserve `committed-transcript-*` classes as stable hooks and component boundaries.
  - Do not add HeroUI components unless a real interaction/control is introduced; this plan introduces none.

## Implementation Contracts

Do not render these strings as visible UI from `App`:

```text
GUI host
status
attached
events
last event
```

Do not make normal host states visible:

```text
connecting
attached
received event
eventCount
lastEventType
```

Keep this internal/test signal:

```tsx
<main data-gui-host-status={status.label}>
```

Do not add:

```text
loading UI
connection error UI
debug console
host inspector
new component library
new CSS dependency
lockfile changes
```

Do not change `transcriptState` selectors, `chatTextModel` deletion behavior, active tail behavior, or windowing behavior in this plan.

The committed empty state means "there are no committed transcript chunks to render". A live
`turnStarted` event can create a turn before any committed message exists; that state must still
render `No committed messages yet.`.

---

### Task 1: Update App Shell Tests

**Files:**
- Modify: `codex-gui/src/__tests__/App.browser.test.tsx`
- Modify: `codex-gui/e2e/app.spec.ts`

- [ ] **Step 1: Replace the browser test for the old status panel**

In `codex-gui/src/__tests__/App.browser.test.tsx`, replace:

```ts
test("App renders the GUI host status panel without opening a real WebSocket", async () => {
  const screen = await renderWithProviders(<App />);

  await expect.element(screen.getByRole("heading", { name: "GUI host" })).toBeVisible();
  await expect.element(screen.getByText("connecting")).toBeVisible();
  await expect.element(screen.getByText(/^no$/)).toBeVisible();
  await expect.element(screen.getByText(/^0$/)).toBeVisible();
  await expect.element(screen.getByText(/^none$/)).toBeVisible();
  expect(guiHostClientMock.startGuiHostConnection).toHaveBeenCalledTimes(1);
});
```

with:

```ts
test("App renders the committed transcript shell without visible GUI host debug details", async () => {
  const screen = await renderWithProviders(<App />);

  await expect.element(screen.getByRole("main")).toHaveAttribute(
    "data-gui-host-status",
    "connecting",
  );
  await expect.element(screen.getByRole("region", { name: "Committed transcript" })).toBeVisible();
  await expect.element(screen.getByText("No committed messages yet.")).toBeVisible();
  await expect.element(screen.getByRole("heading", { name: "GUI host" })).not.toBeInTheDocument();
  await expect.element(screen.getByText(/^status$/)).not.toBeInTheDocument();
  await expect.element(screen.getByText(/^attached$/)).not.toBeInTheDocument();
  await expect.element(screen.getByText(/^events$/)).not.toBeInTheDocument();
  await expect.element(screen.getByText(/^last event$/)).not.toBeInTheDocument();
  expect(guiHostClientMock.startGuiHostConnection).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Replace visible status callback assertions**

In `codex-gui/src/__tests__/App.browser.test.tsx`, replace:

```ts
test("App reflects GUI host status callback updates", async () => {
  const screen = await renderWithProviders(<App />);

  emitStatus?.({
    label: "received event",
    eventCount: 2,
    lastEventType: "turnStarted",
  });

  await expect.element(screen.getByText("received event")).toBeVisible();
  await expect.element(screen.getByText(/^yes$/)).toBeVisible();
  await expect.element(screen.getByText(/^2$/)).toBeVisible();
  await expect.element(screen.getByText("turnStarted")).toBeVisible();
});
```

with:

```ts
test("App keeps GUI host status as a test hook instead of visible shell content", async () => {
  const screen = await renderWithProviders(<App />);

  emitStatus?.({
    label: "received event",
    eventCount: 2,
    lastEventType: "turnStarted",
  });

  await expect.element(screen.getByRole("main")).toHaveAttribute(
    "data-gui-host-status",
    "received event",
  );
  await expect.element(screen.getByText("received event")).not.toBeInTheDocument();
  await expect.element(screen.getByText(/^yes$/)).not.toBeInTheDocument();
  await expect.element(screen.getByText(/^2$/)).not.toBeInTheDocument();
  await expect.element(screen.getByText("turnStarted")).not.toBeInTheDocument();
});
```

- [ ] **Step 3: Update the launch-param e2e assertion**

In `codex-gui/e2e/app.spec.ts`, replace:

```ts
test("renders a launch-param error when opened outside GUI host", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator("main")).toHaveAttribute("data-gui-host-status", "error");
  await expect(page.getByText("error: Missing threadId query parameter")).toBeVisible();
});
```

with:

```ts
test("records a launch-param error without rendering GUI host debug UI", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator("main")).toHaveAttribute("data-gui-host-status", "error");
  await expect(page.getByRole("region", { name: "Committed transcript" })).toBeVisible();
  await expect(page.getByText("No committed messages yet.")).toBeVisible();
  await expect(page.getByText("error: Missing threadId query parameter")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "GUI host" })).toHaveCount(0);
});
```

- [ ] **Step 4: Update the host event e2e assertion**

In `codex-gui/e2e/app.spec.ts`, replace:

```ts
  await expect(page.locator("main")).toHaveAttribute("data-gui-host-status", "received event");
  await expect(page.getByText(/^yes$/)).toBeVisible();
  await expect(page.getByText(/^1$/)).toBeVisible();
  await expect(page.getByText("turnStarted")).toBeVisible();
```

with:

```ts
  await expect(page.locator("main")).toHaveAttribute("data-gui-host-status", "received event");
  await expect(page.getByRole("region", { name: "Committed transcript" })).toBeVisible();
  await expect(page.getByText("No committed messages yet.")).toBeVisible();
  await expect(page.getByText(/^yes$/)).toHaveCount(0);
  await expect(page.getByText(/^1$/)).toHaveCount(0);
  await expect(page.getByText("turnStarted")).toHaveCount(0);
```

- [ ] **Step 5: Run focused tests and verify they fail for the expected reason**

Run:

```bash
pnpm --dir codex-gui run test:browser -- src/__tests__/App.browser.test.tsx
```

Expected: FAIL because `App` still renders the `GUI host` panel and visible host status fields.

Run:

```bash
pnpm --dir codex-gui run test:e2e -- e2e/app.spec.ts
```

Expected: FAIL because `App` still renders the old visible debug/error content. If Playwright browser assets are missing, stop and report the missing local dependency instead of installing anything.

### Task 2: Remove the Visible App Debug Panel

**Files:**
- Modify: `codex-gui/src/App.tsx`

- [ ] **Step 1: Remove the unused attached display derivation**

In `codex-gui/src/App.tsx`, delete:

```ts
  const isAttached = status.label === "attached" || status.label === "received event";
```

Do not remove `status` or `setStatus`; `status.label` still drives `data-gui-host-status`.

- [ ] **Step 2: Replace the returned shell markup**

In `codex-gui/src/App.tsx`, replace the full `return` block:

```tsx
  return (
    <main
      className="grid min-h-svh gap-6 bg-background px-6 py-10 text-foreground lg:grid-cols-[minmax(16rem,24rem)_minmax(0,1fr)] lg:items-start"
      data-gui-host-status={status.label}
    >
      <section className="grid w-full max-w-sm gap-3 text-sm">
        <h1 className="text-base font-semibold">GUI host</h1>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
          <dt className="text-foreground/60">status</dt>
          <dd aria-live="polite">
            {status.label === "error" ? `error: ${status.message}` : status.label}
          </dd>
          <dt className="text-foreground/60">attached</dt>
          <dd>{isAttached ? "yes" : "no"}</dd>
          <dt className="text-foreground/60">events</dt>
          <dd>{status.eventCount}</dd>
          <dt className="text-foreground/60">last event</dt>
          <dd>{status.lastEventType ?? "none"}</dd>
        </dl>
      </section>
      <CommittedTranscriptSurface />
    </main>
  );
```

with:

```tsx
  return (
    <main
      className="min-h-svh bg-background px-4 py-6 text-foreground sm:px-6 lg:px-8"
      data-gui-host-status={status.label}
    >
      <CommittedTranscriptSurface />
    </main>
  );
```

- [ ] **Step 3: Run focused browser and e2e tests**

Run:

```bash
pnpm --dir codex-gui run test:browser -- src/__tests__/App.browser.test.tsx
```

Expected: PASS.

Run:

```bash
pnpm --dir codex-gui run test:e2e -- e2e/app.spec.ts
```

Expected: PASS. If Playwright browser assets are missing, stop and report the missing local dependency instead of installing anything.

- [ ] **Step 4: Commit the App shell removal**

Run:

```bash
git add codex-gui/src/App.tsx codex-gui/src/__tests__/App.browser.test.tsx codex-gui/e2e/app.spec.ts
git commit -m "refactor(gui): remove visible host debug shell"
```

### Task 3: Repair Empty Committed Transcript Semantics

**Files:**
- Modify: `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx`
- Modify: `codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx`
- Modify: `codex-gui/e2e/app.spec.ts`

This task fixes a plan gap discovered after Task 2: a `turnStarted` projection can create
`turnIds` without committed chunks. The empty state must be based on committed chunks, not raw turn
ids. If commit `2a8c712f1 refactor(gui): remove visible host debug shell` already exists, keep it
and apply this task as a follow-up commit; do not revert it just to repair the missing assertion.

- [ ] **Step 1: Add a browser assertion for turn-without-committed-chunks**

In `codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx`, find the test named:

```ts
test("renders live completed items without rendering started items", async () => {
```

After this existing assertion:

```ts
  await expect.element(screen.getByText("Draft answer")).not.toBeInTheDocument();
```

add:

```ts
  await expect.element(screen.getByText("No committed messages yet.")).toBeVisible();
```

This proves a live turn with only started/transient content still renders the committed empty state.

- [ ] **Step 2: Restore the e2e empty-state assertion after the host event**

In `codex-gui/e2e/app.spec.ts`, find the test named:

```ts
test("authenticates, attaches, records projection status, and clears token", async ({ page }) => {
```

After:

```ts
  await expect(page.locator("main")).toHaveAttribute("data-gui-host-status", "received event");
```

ensure these assertions are present:

```ts
  await expect(page.getByRole("region", { name: "Committed transcript" })).toBeVisible();
  await expect(page.getByText("No committed messages yet.")).toBeVisible();
```

Keep the existing assertion that only one direct `main > section` exists:

```ts
  await expect(page.locator("main > section")).toHaveCount(1);
```

- [ ] **Step 3: Run focused checks and verify they fail for the expected reason**

Run:

```bash
pnpm --dir codex-gui run test:browser -- src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx
```

Expected: FAIL because `CommittedTranscriptSurface` still uses `turnIds.length === 0` for the empty state.

Run:

```bash
pnpm --dir codex-gui run test:e2e -- e2e/app.spec.ts
```

Expected: FAIL because the host event scenario creates a turn without committed chunks, so the current implementation hides the empty state. If Playwright browser assets are missing, stop and report the missing local dependency instead of installing anything.

- [ ] **Step 4: Change the empty-state predicate to committed chunk presence**

In `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx`, add this selector result after the existing selector reads:

```tsx
  const hasCommittedChunks = useAppSelector((state) =>
    selectTranscriptTurnIds(state).some(
      (turnId) => selectTranscriptChunkIdsForTurn(state, turnId).length > 0,
    ),
  );
```

Then replace:

```tsx
      {turnIds.length === 0 ? (
```

with:

```tsx
      {!hasCommittedChunks ? (
```

This boolean reads only turn ids and chunk ids. It must not call `selectTranscriptChunk`, must not
materialize entries, and must not introduce a complete transcript tree.

- [ ] **Step 5: Run focused tests**

Run:

```bash
pnpm --dir codex-gui run test:browser -- src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx
```

Expected: PASS.

Run:

```bash
pnpm --dir codex-gui run test:e2e -- e2e/app.spec.ts
```

Expected: PASS. If Playwright browser assets are missing, stop and report the missing local dependency instead of installing anything.

- [ ] **Step 6: Commit the empty-state repair**

Run:

```bash
git add codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx codex-gui/e2e/app.spec.ts
git commit -m "fix(gui): preserve empty transcript after live turn"
```

### Task 4: Apply Component-Local Tailwind Styling

**Files:**
- Modify: `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx`

- [ ] **Step 1: Style the entry component while preserving semantic classes**

In `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx`, replace `CommittedTranscriptEntry` with:

```tsx
const CommittedTranscriptEntry = ({ entry }: { entry: TranscriptEntry }) => (
  <article
    className={`committed-transcript-entry committed-transcript-entry-${entry.type} rounded-md border border-foreground/10 bg-background px-4 py-3 text-sm shadow-sm`}
  >
    {entry.type === "message" ? (
      <div className="committed-transcript-entry-role mb-2 text-xs font-medium uppercase tracking-normal text-muted">
        {entry.role}
      </div>
    ) : null}
    <div className="committed-transcript-entry-source whitespace-pre-wrap leading-6 text-foreground">
      {entryText(entry)}
    </div>
  </article>
);
```

- [ ] **Step 2: Style chunk and turn boundaries while preserving semantic classes**

In the `CommittedTranscriptChunk` return block, replace:

```tsx
    <div className="committed-transcript-chunk">
```

with:

```tsx
    <div className="committed-transcript-chunk grid gap-3">
```

In the `CommittedTranscriptTurn` return block, replace:

```tsx
    <article aria-label={`Turn ${turn.id}`} className="committed-transcript-turn">
      <div className="committed-transcript-turn-metadata">
        <span className="committed-transcript-turn-id">{turn.id}</span>
        <span className="committed-transcript-turn-status">{turn.status}</span>
      </div>
```

with:

```tsx
    <article
      aria-label={`Turn ${turn.id}`}
      className="committed-transcript-turn grid gap-3"
    >
      <div className="committed-transcript-turn-metadata flex flex-wrap items-center gap-2 text-xs text-muted">
        <span className="committed-transcript-turn-id font-medium">{turn.id}</span>
        <span className="committed-transcript-turn-status rounded-sm bg-foreground/5 px-2 py-0.5">
          {turn.status}
        </span>
      </div>
```

- [ ] **Step 3: Style the root, status list, empty state, and turn list**

In `CommittedTranscriptSurface`, replace the full return block with:

```tsx
  return (
    <section
      aria-label="Committed transcript"
      className="committed-transcript-surface mx-auto grid w-full max-w-5xl gap-4"
    >
      {globalStatus.length > 0 ? (
        <div className="committed-transcript-status-list grid gap-2">
          {globalStatus.map((status) => (
            <div
              className="committed-transcript-status rounded-md border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger"
              key={status.id}
              role="status"
            >
              {subscriptionInterruptedStatusText}
            </div>
          ))}
        </div>
      ) : null}
      {!hasCommittedChunks ? (
        <p className="committed-transcript-empty rounded-md border border-dashed border-foreground/20 px-4 py-6 text-sm text-muted">
          No committed messages yet.
        </p>
      ) : (
        <div className="committed-transcript-turn-list grid gap-6">
          {turnIds.map((turnId) => (
            <CommittedTranscriptTurn key={turnId} turnId={turnId} />
          ))}
        </div>
      )}
    </section>
  );
```

- [ ] **Step 4: Run focused committed transcript browser tests**

Run:

```bash
pnpm --dir codex-gui run test:browser -- src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit the surface styling**

Run:

```bash
git add codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx
git commit -m "style(gui): tighten committed transcript shell"
```

### Task 5: Final Focused Verification

**Files:**
- Verify only; do not modify files in this task unless a focused check reports a real issue from Tasks 1-4.

- [ ] **Step 1: Run focused lint on touched files**

Run:

```bash
pnpm --dir codex-gui exec eslint src/App.tsx src/__tests__/App.browser.test.tsx e2e/app.spec.ts src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx
```

Expected: PASS.

- [ ] **Step 2: Run TypeScript project check**

Run:

```bash
pnpm --dir codex-gui run type-check
```

Expected: PASS.

- [ ] **Step 3: Run focused browser tests**

Run:

```bash
pnpm --dir codex-gui run test:browser -- src/__tests__/App.browser.test.tsx src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx
```

Expected: PASS.

- [ ] **Step 4: Run focused e2e test file**

Run:

```bash
pnpm --dir codex-gui run test:e2e -- e2e/app.spec.ts
```

Expected: PASS. If Playwright browser assets are missing, stop and report the missing local dependency instead of installing anything.

- [ ] **Step 5: Confirm no forbidden files changed**

Run:

```bash
git status --short
```

Expected: only the intended source/test files are changed before commits, and no lockfile appears. If `codex-gui/pnpm-lock.yaml` or any other lockfile is modified, stop and report it; do not restore, stage, or commit it without explicit user instruction.

- [ ] **Step 6: Confirm old debug UI is gone from App**

Run:

```bash
rg -n "GUI host|last event|isAttached" codex-gui/src/App.tsx codex-gui/src/__tests__/App.browser.test.tsx codex-gui/e2e/app.spec.ts
```

Expected: no matches.

Run:

```bash
rg -n "eventCount|lastEventType" codex-gui/src/App.tsx codex-gui/src/__tests__/App.browser.test.tsx codex-gui/e2e/app.spec.ts
```

Expected: `eventCount` and `lastEventType` may appear only in status objects passed to `emitStatus` or in `GuiHostStatus` plumbing; they must not be asserted as visible UI.

- [ ] **Step 7: Commit any verification-only fixes**

Only if Steps 1-6 required small fixes, commit them:

```bash
git add codex-gui/src/App.tsx codex-gui/src/__tests__/App.browser.test.tsx codex-gui/e2e/app.spec.ts codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx
git commit -m "test(gui): verify chat shell surface"
```
