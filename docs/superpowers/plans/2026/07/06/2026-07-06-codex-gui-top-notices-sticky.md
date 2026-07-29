# Codex GUI Top Notices Sticky Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a page-level sticky top notices container so GUI host startup errors remain visible while preserving future support for multiple persistent top notices.

**Architecture:** `AppShell` owns the page-level sticky notice stack. `AppShellTopNotices` provides sticky positioning, width, background, divider, z-index, and vertical stacking; `GuiHostErrorAlert` remains a content-only HeroUI `Alert` for `GuiHostStatus.error`. Tests verify the structure contract instead of relying on fragile scroll-position behavior.

**Tech Stack:** React 19, HeroUI v3 `Alert`, Tailwind CSS v4 utility classes from `@heroui/styles`, Vitest Browser Mode.

---

## File Structure

- Modify: `codex-gui/src/features/appShell/AppShell.tsx`
  - Add `AppShellTopNotices`.
  - Move sticky/top/z-index/layout responsibility into `AppShellTopNotices`.
  - Keep `GuiHostErrorAlert` responsible only for rendering the danger alert content.
- Modify: `codex-gui/src/__tests__/App.browser.test.tsx`
  - Extend the existing startup error browser test to assert the top notices container contract and the alert containment relationship.
- No changes:
  - `codex-gui/src/features/guiHost/guiHostClient.ts`
  - `codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx`
  - `codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx`
  - `codex-gui/src/index.css`
  - `codex-rs/**`

## Preflight

- [ ] **Step 1: Confirm the fnm-backed pnpm command works**

Run from `codex-gui`:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm --version
```

Expected: prints a pnpm version and does not resolve pnpm under `/Users/jiangsheng/.cache/codex-runtimes/`.

- [ ] **Step 2: Confirm the target scripts still exist**

Run from the repo root:

```bash
sed -n '1,120p' codex-gui/package.json
```

Expected: `scripts` still include `type-check`, `format:oxfmt`, and `test:browser`. If script names changed, adjust only the command names in this plan before executing the implementation steps.

## Task 1: Add Sticky Top Notices Container

**Files:**

- Modify: `codex-gui/src/__tests__/App.browser.test.tsx`
- Modify: `codex-gui/src/features/appShell/AppShell.tsx`

- [ ] **Step 1: Write the failing browser test**

In `codex-gui/src/__tests__/App.browser.test.tsx`, replace the current `App displays GUI host startup errors` test with:

```tsx
test("App displays GUI host startup errors in the sticky top notices region", async () => {
  startGuiHostConnectionMock.mockImplementation(() => {
    throw new Error("Missing launch token fragment");
  });

  const screen = await renderWithProviders(<App />);
  const topNotices = screen.container.querySelector("[data-app-shell-top-notices]");
  const errorTitle = screen.getByText("Unable to start Codex GUI").element();
  const errorMessage = screen.getByText("Missing launch token fragment").element();

  if (!(topNotices instanceof HTMLElement)) {
    throw new Error("top notices region must render");
  }

  await expect.element(screen.getByRole("main")).toHaveAttribute("data-gui-host-status", "error");
  expect(topNotices.classList.contains("sticky")).toBe(true);
  expect(topNotices.classList.contains("top-0")).toBe(true);
  expect(topNotices.classList.contains("z-20")).toBe(true);
  expect(topNotices.contains(errorTitle)).toBe(true);
  expect(topNotices.contains(errorMessage)).toBe(true);
  await expect.element(screen.getByPlaceholder("Message Codex")).toBeDisabled();
});
```

- [ ] **Step 2: Run the focused browser test and confirm the expected failure**

Run from `codex-gui`:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --config=vitest.browser.config.ts src/__tests__/App.browser.test.tsx
```

Expected: the startup error test fails because `[data-app-shell-top-notices]` does not exist yet. Other unrelated assertions should not be treated as the target failure for this step.

- [ ] **Step 3: Implement `AppShellTopNotices` and move layout responsibility out of `GuiHostErrorAlert`**

In `codex-gui/src/features/appShell/AppShell.tsx`, add the React type import:

```tsx
import type { ReactNode } from "react";
```

Keep the HeroUI import:

```tsx
import { Alert, Surface, Toast } from "@heroui/react";
```

Change `GuiHostErrorAlert` so the `Alert` does not own max width or bottom margin:

```tsx
function GuiHostErrorAlert({ status }: { status: GuiHostStatus }) {
  if (status.label !== "error") {
    return null;
  }

  return (
    <Alert className="w-full" status="danger">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>Unable to start Codex GUI</Alert.Title>
        <Alert.Description>{status.message}</Alert.Description>
      </Alert.Content>
    </Alert>
  );
}
```

Add `AppShellTopNotices` below `GuiHostErrorAlert`:

```tsx
function AppShellTopNotices({ children }: { children: ReactNode }) {
  return (
    <div
      className="sticky top-0 z-20 border-b border-border bg-background px-4 py-3 sm:px-6 lg:px-8"
      data-app-shell-top-notices=""
    >
      <div className="mx-auto grid w-full max-w-3xl gap-2">{children}</div>
    </div>
  );
}
```

In `AppShell`, replace the direct alert render:

```tsx
      <GuiHostErrorAlert status={status} />
```

with:

```tsx
      <AppShellTopNotices>
        <GuiHostErrorAlert status={status} />
      </AppShellTopNotices>
```

The resulting `AppShell` body should keep this order:

```tsx
      <Toast.Provider placement="top" />
      <AppShellTopNotices>
        <GuiHostErrorAlert status={status} />
      </AppShellTopNotices>
      <Surface
        className="mx-auto grid min-w-0 w-full max-w-3xl flex-1 content-start"
        variant="transparent"
      >
        <CommittedTranscriptSurface />
      </Surface>
```

- [ ] **Step 4: Run the focused browser test and confirm it passes**

Run from `codex-gui`:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --config=vitest.browser.config.ts src/__tests__/App.browser.test.tsx
```

Expected: the updated startup error test passes. Existing App browser tests in this file should also pass unless they expose a real layout regression caused by this task.

- [ ] **Step 5: Run scoped static checks**

Run from `codex-gui`:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec eslint src/features/appShell/AppShell.tsx src/__tests__/App.browser.test.tsx --cache
```

Expected: exits 0 with no ESLint errors.

Run from `codex-gui`:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

Expected: exits 0.

Run from `codex-gui`:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
```

Expected: exits 0.

Run from the repo root:

```bash
git diff --check
```

Expected: exits 0 with no output.

- [ ] **Step 6: Review and commit only this task**

Run from the repo root:

```bash
git diff -- codex-gui/src/features/appShell/AppShell.tsx codex-gui/src/__tests__/App.browser.test.tsx
```

Expected: diff only adds `AppShellTopNotices`, moves top notice layout responsibility out of `GuiHostErrorAlert`, and updates the startup error browser test.

Stage only the implementation files:

```bash
git add codex-gui/src/features/appShell/AppShell.tsx codex-gui/src/__tests__/App.browser.test.tsx
```

Inspect the staged diff:

```bash
git diff --cached
```

Expected: staged diff excludes docs unless the user explicitly asks to commit docs together.

Commit locally:

```bash
git commit -m "fix(gui): keep host errors in sticky top notices"
```

Expected: one local commit. Do not run git remote commands.

## Manual Visual Check

- [ ] **Step 1: Launch or use the existing `codex-gui` browser session**

Use the existing GUI session if it is already running. If starting a new session is necessary, use the repo's normal GUI launch path rather than installing new browser dependencies.

- [ ] **Step 2: Confirm the rendered behavior**

In a narrow responsive viewport, reproduce a `GuiHostStatus.error` state such as the existing WebSocket closed state.

Expected:

- The top error is rendered in the sticky top notices region.
- Scrolling transcript content does not cause the error banner to leave the viewport.
- The banner width aligns with the transcript and composer column.
- Multiple future notices would stack vertically inside the same sticky region rather than competing for `top-0`.
- The bottom composer remains sticky at the bottom and disabled during the error state.

## Self-Review Checklist

- Spec coverage:
  - `AppShellTopNotices` covers the unified sticky container requirement.
  - `GuiHostErrorAlert` remains content-only and HeroUI-based.
  - Test coverage uses the selected structure contract and avoids fragile scroll assertions.
  - No GUI host protocol, WebSocket, transcript, composer, or Rust changes are included.
- Placeholder scan:
  - The plan contains no deferred implementation placeholders.
- Type consistency:
  - `ReactNode` is imported from `react`.
  - `GuiHostStatus` remains the status prop type for `GuiHostErrorAlert`.
  - `data-app-shell-top-notices` is the test selector and implementation attribute.
