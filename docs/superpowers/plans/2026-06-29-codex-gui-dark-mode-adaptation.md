# Codex GUI Dark Mode Adaptation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `codex-gui` app shell and bottom composer follow HeroUI v3 light/dark theme tokens so dark mode no longer shows a white composer break.

**Architecture:** Keep the existing `ThemeProvider` as the single theme controller. Add HeroUI semantic canvas classes to `AppShell`, convert `ComposerTurnControl` from a hard-coded white panel to a HeroUI `Surface`, and use the lower-emphasis `TextArea` variant inside that surface. Update browser tests so the contract is theme-aware surface semantics rather than a white panel.

**Tech Stack:** React 19, TypeScript, HeroUI React v3, Tailwind CSS v4, Vitest Browser Mode, `debug-responsive-gui` for visual verification.

---

## File Structure

- Modify: `codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx`
  - Owns the focused browser test for composer structure, textarea variant, QR / Stop / Send ordering, and the new dark-theme surface contract.
- Modify: `codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx`
  - Owns the fixed bottom composer UI, message draft state, send/stop actions, QR access entry, and the panel/input HeroUI variants.
- Modify: `codex-gui/src/features/appShell/AppShell.tsx`
  - Owns the page-level canvas that hosts transcript content and composer.
- Reference only: `codex-gui/.heroui-docs/react/getting-started/(handbook)/dark-mode.mdx`
  - Confirms `bg-background text-foreground` on the app shell and root-driven `.dark` / `data-theme="dark"` behavior.
- Reference only: `codex-gui/.heroui-docs/react/components/(layout)/surface.mdx`
  - Confirms `Surface` variants and form-on-surface guidance.
- Reference only: `codex-gui/.heroui-docs/react/components/(forms)/text-area.mdx`
  - Confirms `TextArea variant="secondary"` is the lower-emphasis variant for surface contexts.

## Environment Setup

Before running any `pnpm` command in `codex-gui`, initialize the user's fnm environment and verify `pnpm` does not come from the Codex runtime cache.

- [ ] **Step 1: Initialize fnm in the shell used for verification**

```bash
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
```

Expected: command exits 0 and updates `PATH` for the current shell.

- [ ] **Step 2: Verify `pnpm`**

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
which pnpm
pnpm --version
```

Expected: `which pnpm` is not under `/Users/jiangsheng/.cache/codex-runtimes/`; `pnpm --version` reports the user project pnpm, previously observed as `10.33.0`.

## Task 1: Update Composer Browser Test First

**Files:**
- Modify: `codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx`
- Test: `codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx`

- [ ] **Step 1: Replace the white-panel test with a theme-aware surface test**

Replace the current test named `renders a white composer panel with a primary textarea and actions` with this test:

```tsx
test("renders a theme-aware composer surface with secondary textarea and actions", async () => {
  const originalClassName = document.documentElement.className;
  const originalTheme = document.documentElement.dataset.theme;
  document.documentElement.classList.add("dark");
  document.documentElement.dataset.theme = "dark";

  try {
    const screen = await renderAttached();
    const composerShell = screen.container.querySelector('[aria-label="Message composer"]');
    if (!(composerShell instanceof HTMLElement)) {
      throw new Error("composer shell must render");
    }
    const composerPanel = composerShell.firstElementChild;
    if (!(composerPanel instanceof HTMLElement)) {
      throw new Error("composer panel must render");
    }
    const textarea = composerPanel.querySelector('textarea[placeholder="Message Codex"]');
    if (!(textarea instanceof HTMLTextAreaElement)) {
      throw new Error("composer textarea must render");
    }
    const actions = Array.from(composerPanel.querySelectorAll("button"))
      .map((button) => button.textContent.trim())
      .filter((label) => label.length > 0);

    expect(composerPanel.classList.contains("bg-white")).toBe(false);
    expect(composerPanel.classList.contains("surface")).toBe(true);
    expect(composerPanel.classList.contains("surface--default")).toBe(true);
    expect(composerPanel.classList.contains("p-2")).toBe(true);
    expect(composerPanel.classList.contains("p-3")).toBe(false);
    expect(composerShell.classList.contains("px-4")).toBe(false);
    expect(composerShell.classList.contains("pb-0")).toBe(true);
    expect(composerShell.classList.contains("py-3")).toBe(false);
    expect(textarea.classList.contains("textarea--secondary")).toBe(true);
    expect(textarea.classList.contains("textarea--primary")).toBe(false);
    const qrButton = screen.getByRole("button", { name: "Scan with phone" });
    await expect.element(qrButton).toBeDisabled();
    await expect.element(qrButton).toHaveClass("button--icon-only");
    expect(actions).toEqual(["Stop", "Send"]);
  } finally {
    document.documentElement.className = originalClassName;
    if (originalTheme == null) {
      delete document.documentElement.dataset.theme;
    } else {
      document.documentElement.dataset.theme = originalTheme;
    }
  }
});
```

- [ ] **Step 2: Run the focused test and verify it fails for the current implementation**

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run test:unit -- src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx
```

Expected: FAIL. The failure should point at one or more of these new assertions:

```text
expected true to be false
expected false to be true
```

The expected failing facts are that the current panel still contains `bg-white`, does not have `surface` / `surface--default`, and the textarea still has `textarea--primary`.

## Task 2: Implement HeroUI Semantic Styling

**Files:**
- Modify: `codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx`
- Modify: `codex-gui/src/features/appShell/AppShell.tsx`
- Test: `codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx`

- [ ] **Step 1: Import `Surface` in `ComposerTurnControl.tsx`**

Change the import at the top of `codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx` from:

```tsx
import { Button, TextArea, toast } from "@heroui/react";
```

to:

```tsx
import { Button, Surface, TextArea, toast } from "@heroui/react";
```

- [ ] **Step 2: Convert the composer panel to `Surface` and make textarea secondary**

In `ComposerTurnControl.tsx`, replace the returned composer panel block with this structure. Keep the send/stop logic and event handlers unchanged.

```tsx
  return (
    <section aria-label="Message composer" className="fixed inset-x-0 bottom-0 z-10 pt-3 pb-0">
      <Surface className="mx-auto grid w-full max-w-6xl gap-2 p-2" variant="default">
        <TextArea
          disabled={!connectionUsable}
          fullWidth
          onChange={(event) => {
            setDraft(event.target.value);
          }}
          onKeyDown={onKeyDown}
          placeholder="Message Codex"
          value={draft}
          variant="secondary"
        />
        <div className="flex items-center justify-between gap-2">
          <QrAccessPopover launchParams={launchParams} />
          <div className="flex items-center gap-2">
            <Button
              isDisabled={!stopEnabled}
              onPress={() => {
                void stop();
              }}
              variant="danger-soft"
            >
              Stop
            </Button>
            <Button
              isDisabled={!sendEnabled}
              onPress={() => {
                void submit();
              }}
              variant="outline"
            >
              Send
            </Button>
          </div>
        </div>
      </Surface>
    </section>
  );
```

- [ ] **Step 3: Add app shell theme canvas classes**

In `codex-gui/src/features/appShell/AppShell.tsx`, change the `<main>` class from:

```tsx
      className="min-h-svh w-full px-4 py-6 pb-44 sm:px-6 lg:px-8"
```

to:

```tsx
      className="min-h-svh w-full bg-background px-4 py-6 pb-44 text-foreground sm:px-6 lg:px-8"
```

- [ ] **Step 4: Run the focused test and verify it passes**

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run test:unit -- src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx
```

Expected: PASS for `ComposerTurnControl.browser.test.tsx`.

## Task 3: Run Static Verification

**Files:**
- Verify only.

- [ ] **Step 1: Run lint**

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run lint
```

Expected: PASS. This command exists in `codex-gui/package.json` and runs `pnpm run lint:oxlint && pnpm run lint:eslint`.

- [ ] **Step 2: Run type-check**

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run type-check
```

Expected: PASS. This command exists in `codex-gui/package.json` and runs `tsc -b --noEmit`.

## Task 4: Visual Verification in the Live GUI

**Files:**
- Verify only.

- [ ] **Step 1: Confirm or start the Vite dev server**

If the existing GUI already loads through the current `launch_gui` URL, keep that server running and do not start another. If the page shows `Codex GUI dev server unavailable` or the `launch_gui` URL returns HTTP 502, confirm port 5173 is not listening and start Vite from `codex-gui`:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run dev
```

Expected when starting: Vite reports a local URL on port `5173` and remains running in the foreground.

- [ ] **Step 2: Reopen the GUI through the debug-responsive flow**

Call the Codex app `launch_gui` tool to get a fresh URL list. Pick the returned URL according to `debug-responsive-gui` rules: VPN first, then LAN, then Local. Preserve the returned `threadId` query parameter and `#token` fragment exactly. Do not paste an old token from this plan or from an earlier run.

After the fresh URL is available, run `.codex/skills/debug-responsive-gui/scripts/debug-responsive-gui.mjs` from `/Users/jiangsheng/cnb/codex` with `--gui-url` set to that exact returned URL. The URL is a short-lived secret-bearing value, so it must be supplied from the live `launch_gui` tool result at execution time and must not be saved into this plan.

Expected: PASS. The script should report `codexGui: true` and `responsiveLike: true`.

- [ ] **Step 3: Capture dark-mode screenshot**

With the page in dark mode, capture the responsive viewport:

```bash
cd /Users/jiangsheng/cnb/codex
playwright-cli screenshot --filename /tmp/codex-gui-dark-responsive-after-theme-surface.png
```

Expected: screenshot file exists. The bottom composer panel should visually match the dark surface instead of showing a white strip.

- [ ] **Step 4: Capture light-mode screenshot**

Switch the page to light mode, then capture the responsive viewport:

```bash
cd /Users/jiangsheng/cnb/codex
playwright-cli screenshot --filename /tmp/codex-gui-light-responsive-after-theme-surface.png
```

Expected: screenshot file exists. The composer should still look natural in light mode and keep the same layout.

## Task 5: Final Diff Review

**Files:**
- Review: `codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx`
- Review: `codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx`
- Review: `codex-gui/src/features/appShell/AppShell.tsx`
- Review: `docs/superpowers/specs/2026-06-29-codex-gui-dark-mode-adaptation-design.md`
- Review: `docs/superpowers/plans/2026-06-29-codex-gui-dark-mode-adaptation.md`

- [ ] **Step 1: Inspect changed files**

```bash
cd /Users/jiangsheng/cnb/codex
git status --short
git diff -- codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx codex-gui/src/features/appShell/AppShell.tsx docs/superpowers/specs/2026-06-29-codex-gui-dark-mode-adaptation-design.md docs/superpowers/plans/2026-06-29-codex-gui-dark-mode-adaptation.md
```

Expected: source diff is limited to the test contract, `Surface` / `TextArea` variant change, and `AppShell` canvas classes. Docs diff should include the design doc and this plan only.

- [ ] **Step 2: Confirm there are no accidental remote operations**

Do not run `git fetch`, `git pull`, `git push`, or any `git remote` command. This plan requires only local source edits and local verification.

- [ ] **Step 3: Commit only after explicit user approval**

If the user explicitly asks for a commit after reviewing the implementation, use a local commit:

```bash
cd /Users/jiangsheng/cnb/codex
git add codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx codex-gui/src/features/appShell/AppShell.tsx docs/superpowers/specs/2026-06-29-codex-gui-dark-mode-adaptation-design.md docs/superpowers/plans/2026-06-29-codex-gui-dark-mode-adaptation.md
git commit -m "fix: adapt codex gui composer to dark mode"
```

Expected: one local commit. Do not push.
