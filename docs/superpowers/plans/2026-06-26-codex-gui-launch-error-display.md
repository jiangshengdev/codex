# codex-gui Launch Error Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `codex-gui` visibly display GUI host startup errors, including the missing launch-token case in frontend development.

**Architecture:** Keep the existing `GuiHostStatus.error` data flow unchanged. `GuiHostConnectionBridge` continues converting startup exceptions into `GuiHostStatus.error`; `AppShell` becomes responsible for rendering that error as a persistent HeroUI `Alert` above the transcript surface. Composer availability remains controlled by the existing `guiHostStatus.label === "error"` logic.

**Tech Stack:** React 19, HeroUI React v3 `Alert`, Vitest Browser Mode, `vitest-browser-react`, existing App browser test support.

---

## File Structure

- Modify: `codex-gui/src/__tests__/App.browser.test.tsx`
  - Add App-level browser coverage for startup errors surfaced from `startGuiHostConnection`.
- Modify: `codex-gui/src/features/appShell/AppShell.tsx`
  - Import HeroUI `Alert`.
  - Render `GuiHostStatus.error.message` as a persistent danger alert above the transcript `Surface`.
- Do not modify:
  - `codex-gui/src/features/guiHost/guiHostClient.ts`
  - `codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx`
  - `codex-rs/gui-host/*`
  - app-server protocol schemas or generated files

## Task 1: Add Failing App Browser Coverage

**Files:**
- Modify: `codex-gui/src/__tests__/App.browser.test.tsx`

- [ ] **Step 1: Add the startup-error browser test**

Add this test after `App keeps host status as a test hook instead of visible shell content`:

```tsx
test("App displays GUI host startup errors", async () => {
  startGuiHostConnectionMock.mockImplementation(() => {
    throw new Error("Missing launch token fragment");
  });

  const screen = await renderWithProviders(<App />);

  await expect
    .element(screen.getByRole("main"))
    .toHaveAttribute("data-gui-host-status", "error");
  await expect.element(screen.getByText("Unable to start Codex GUI")).toBeVisible();
  await expect.element(screen.getByText("Missing launch token fragment")).toBeVisible();
  await expect.element(screen.getByPlaceholder("Message Codex")).toBeDisabled();
});
```

- [ ] **Step 2: Run the focused browser test to verify RED**

Run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run test:browser -- src/__tests__/App.browser.test.tsx -t "App displays GUI host startup errors"
```

Expected: FAIL because `data-gui-host-status="error"` is set, but `Unable to start Codex GUI` and `Missing launch token fragment` are not visible yet.

## Task 2: Render The Persistent HeroUI Error Alert

**Files:**
- Modify: `codex-gui/src/features/appShell/AppShell.tsx`

- [ ] **Step 1: Import HeroUI `Alert`**

Change the HeroUI import at the top of `codex-gui/src/features/appShell/AppShell.tsx` from:

```tsx
import { Surface, Toast } from "@heroui/react";
```

to:

```tsx
import { Alert, Surface, Toast } from "@heroui/react";
```

- [ ] **Step 2: Add the private alert component**

Add this private component after `AppShellProps`:

```tsx
function GuiHostErrorAlert({ status }: { status: GuiHostStatus }) {
  if (status.label !== "error") {
    return null;
  }

  return (
    <Alert className="mx-auto mb-4 w-full max-w-6xl" status="danger">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>Unable to start Codex GUI</Alert.Title>
        <Alert.Description>{status.message}</Alert.Description>
      </Alert.Content>
    </Alert>
  );
}
```

- [ ] **Step 3: Render the alert before the transcript surface**

Update the `AppShell` return so the top of `<main>` contains:

```tsx
<Toast.Provider placement="top" />
<GuiHostErrorAlert status={status} />
<Surface className="mx-auto grid min-w-0 w-full max-w-6xl content-start" variant="default">
  <CommittedTranscriptSurface />
</Surface>
```

Expected: the alert appears only for `GuiHostStatus.error`; all non-error states keep the existing visible layout.

- [ ] **Step 4: Run the focused browser test to verify GREEN**

Run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run test:browser -- src/__tests__/App.browser.test.tsx -t "App displays GUI host startup errors"
```

Expected: PASS.

## Task 3: Verify The App Test File And Type/Lint Checks

**Files:**
- Verify: `codex-gui/src/__tests__/App.browser.test.tsx`
- Verify: `codex-gui/src/features/appShell/AppShell.tsx`

- [ ] **Step 1: Run the full App browser test file**

Run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run test:browser -- src/__tests__/App.browser.test.tsx
```

Expected: PASS for the whole file.

- [ ] **Step 2: Run TypeScript checking**

Run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run type-check
```

Expected: PASS.

- [ ] **Step 3: Run lint**

Run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run lint
```

Expected: PASS.

- [ ] **Step 4: Inspect the final diff**

Run:

```sh
cd /Users/jiangsheng/cnb/codex
git diff -- codex-gui/src/__tests__/App.browser.test.tsx codex-gui/src/features/appShell/AppShell.tsx
```

Expected: the diff only adds the startup-error browser test and the persistent HeroUI alert. It does not modify `guiHostClient`, `GuiHostConnectionBridge`, Rust `gui-host`, schemas, or generated files.

## Commit Boundary

Do not stage or commit while executing this plan unless the user explicitly asks for it. If the user asks for a commit after verification passes, stage only:

```text
codex-gui/src/__tests__/App.browser.test.tsx
codex-gui/src/features/appShell/AppShell.tsx
```

Use a focused commit message such as:

```text
gui: show launch errors in app shell
```

## Self-Review Notes

- Spec coverage: the plan displays all `GuiHostStatus.error.message` values through one AppShell alert, including the missing-token message.
- Scope: the plan avoids Rust host changes because URL fragments are not sent to the server.
- Component choice: the plan uses HeroUI React v3 `Alert` compound API, not toast, modal, card, or alert dialog.
- Test coverage: the plan verifies the existing bridge catch path through an App browser test and checks the composer remains disabled.

