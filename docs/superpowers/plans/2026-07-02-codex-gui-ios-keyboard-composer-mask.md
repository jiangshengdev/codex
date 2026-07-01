# Codex GUI iOS Keyboard Composer Mask Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a visual mask below the fixed composer so iOS Safari keyboard accessory UI no longer reveals transcript content under the composer.

**Architecture:** Keep the current fixed composer positioning and page scroll architecture. Add a `::after` Tailwind pseudo-element to the composer shell that starts at the shell bottom, extends `100vh`, uses `var(--surface)`, and ignores pointer events.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4 utilities, HeroUI Surface, Vitest Browser, pnpm, fnm.

---

## File Structure

- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx`
  - Extend the existing composer shell style contract test with the mask class assertions.
- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx`
  - Add the minimal Tailwind pseudo-element classes to the composer shell.

## Execution Constraints

- Do not modify app shell scrolling, `viewport` meta tags, safe-area handling, or visual viewport logic.
- Do not add DOM nodes for the mask; use the composer shell pseudo-element.
- Do not install dependencies.
- Do not stage or commit unless the user explicitly asks.
- Before editing under `/Users/jiangsheng/cnb/codex/codex-gui`, read `/Users/jiangsheng/cnb/codex/codex-gui/AGENTS.md`.

## Tooling Setup

Before any `pnpm` command in `/Users/jiangsheng/cnb/codex/codex-gui`, initialize the user's fnm environment and verify `pnpm` is not coming from `/Users/jiangsheng/.cache/codex-runtimes/`.

- [ ] **Step 1: Print fnm environment**

Run from `/Users/jiangsheng/cnb/codex/codex-gui`:

```sh
/opt/homebrew/bin/fnm env --shell zsh
```

Expected: output contains shell environment exports for fnm.

- [ ] **Step 2: Initialize the current shell from that output**

Apply the printed fnm environment in the current shell before running `pnpm`.

- [ ] **Step 3: Verify pnpm**

Run:

```sh
which pnpm
pnpm --version
```

Expected: `which pnpm` must not point under `/Users/jiangsheng/.cache/codex-runtimes/`.

---

### Task 1: Add the Composer Mask Style Contract

**Files:**

- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx`

- [ ] **Step 1: Read frontend instructions**

Run:

```sh
sed -n '1,220p' /Users/jiangsheng/cnb/codex/codex-gui/AGENTS.md
```

Expected: note that this change does not touch transcript rendering or projection fixtures.

- [ ] **Step 2: Add failing assertions to the existing style test**

In `/Users/jiangsheng/cnb/codex/codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx`, inside `renders a white composer panel with a primary textarea and actions`, add the new shell class assertions after the existing shell padding assertions:

```ts
  expect(composerShell.classList.contains("relative")).toBe(true);
  expect(composerShell.classList.contains("after:absolute")).toBe(true);
  expect(composerShell.classList.contains("after:inset-x-0")).toBe(true);
  expect(composerShell.classList.contains("after:top-full")).toBe(true);
  expect(composerShell.classList.contains("after:h-screen")).toBe(true);
  expect(composerShell.classList.contains("after:bg-[var(--surface)]")).toBe(true);
  expect(composerShell.classList.contains("after:pointer-events-none")).toBe(true);
  expect(composerShell.classList.contains("after:content-['']")).toBe(true);
```

The surrounding block should keep the existing assertions:

```ts
  expect(composerPanel.classList.contains("p-2")).toBe(true);
  expect(composerPanel.classList.contains("p-3")).toBe(false);
  expect(composerShell.classList.contains("px-4")).toBe(false);
  expect(composerShell.classList.contains("pb-0")).toBe(true);
  expect(composerShell.classList.contains("py-3")).toBe(false);
  expect(composerShell.classList.contains("relative")).toBe(true);
  expect(composerShell.classList.contains("after:absolute")).toBe(true);
  expect(composerShell.classList.contains("after:inset-x-0")).toBe(true);
  expect(composerShell.classList.contains("after:top-full")).toBe(true);
  expect(composerShell.classList.contains("after:h-screen")).toBe(true);
  expect(composerShell.classList.contains("after:bg-[var(--surface)]")).toBe(true);
  expect(composerShell.classList.contains("after:pointer-events-none")).toBe(true);
  expect(composerShell.classList.contains("after:content-['']")).toBe(true);
  expect(textarea.classList.contains("textarea--primary")).toBe(true);
```

- [ ] **Step 3: Run the focused browser test and verify it fails**

Run from `/Users/jiangsheng/cnb/codex/codex-gui` after fnm setup:

```sh
pnpm run test:browser -- src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx
```

Expected: the test fails because `composerShell.classList.contains("relative")` or another new mask class assertion is false.

---

### Task 2: Add the Composer Shell Mask

**Files:**

- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx`
- Test: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx`

- [ ] **Step 1: Update the composer shell class**

In `/Users/jiangsheng/cnb/codex/codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx`, replace the shell class:

```tsx
<section aria-label="Message composer" className="fixed inset-x-0 bottom-0 z-10 pt-3 pb-0">
```

with:

```tsx
<section
  aria-label="Message composer"
  className="fixed inset-x-0 bottom-0 z-10 pt-3 pb-0 relative after:absolute after:inset-x-0 after:top-full after:h-screen after:bg-[var(--surface)] after:pointer-events-none after:content-['']"
>
```

This keeps the existing fixed bottom behavior and adds only the visual mask.

- [ ] **Step 2: Run the focused browser test and verify it passes**

Run from `/Users/jiangsheng/cnb/codex/codex-gui` after fnm setup:

```sh
pnpm run test:browser -- src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx
```

Expected: the test file passes.

- [ ] **Step 3: Run type checking**

Run from `/Users/jiangsheng/cnb/codex/codex-gui` after fnm setup:

```sh
pnpm run type-check
```

Expected: TypeScript build check passes.

- [ ] **Step 4: Run formatting check if class ordering changed**

Run from `/Users/jiangsheng/cnb/codex/codex-gui` after fnm setup:

```sh
pnpm run format:oxfmt
```

Expected: formatter check passes. If it fails only because formatting is needed, run:

```sh
pnpm run format:oxfmt:fix
```

Then re-run:

```sh
pnpm run format:oxfmt
```

Expected: formatter check passes after the fix.

---

### Task 3: Manual iOS Safari Verification

**Files:**

- No required file changes.

- [ ] **Step 1: Launch Codex GUI on the iOS Simulator**

Use the existing local GUI launch flow for the current thread and open the LAN URL in iOS Safari. If a URL is already available, open it with:

```sh
xcrun simctl openurl booted '<LAN_URL_WITH_THREAD_AND_TOKEN>'
```

Expected: Codex GUI opens in the booted iPhone Simulator.

- [ ] **Step 2: Focus the composer**

Tap the composer textarea so the iOS soft keyboard appears.

Expected: the composer remains above the keyboard.

- [ ] **Step 3: Check the visual result**

Expected:

- composer下方不再露出 transcript 文本或消息内容。
- composer下方如有可见区域，应显示与 composer Surface 一致的 `var(--surface)` 背景。
- textarea 可以继续输入。
- Stop、Send、QR 控件不受遮罩影响。

- [ ] **Step 4: Optional Web Inspector geometry check**

If Safari Web Inspector is open, run:

```js
JSON.stringify((() => {
  const c = document.querySelector('[aria-label="Message composer"]');
  const cr = c ? c.getBoundingClientRect() : null;
  const vv = window.visualViewport;
  return {
    visualViewport: vv ? { height: vv.height, offsetTop: vv.offsetTop, pageTop: vv.pageTop } : null,
    composer: cr ? { top: cr.top, bottom: cr.bottom, height: cr.height } : null,
  };
})(), null, 2)
```

Expected: composer `bottom` remains approximately equal to `visualViewport.height`; the fix should not move the composer.

---

## Final Verification

Before reporting completion, run from `/Users/jiangsheng/cnb/codex`:

```sh
git diff --check
git status --short
```

Expected:

- `git diff --check` prints no errors.
- `git status --short` shows only the intended files:
  - `/Users/jiangsheng/cnb/codex/docs/superpowers/specs/2026-07-02-codex-gui-ios-keyboard-composer-mask-design.md`
  - `/Users/jiangsheng/cnb/codex/docs/superpowers/plans/2026-07-02-codex-gui-ios-keyboard-composer-mask.md`
  - `/Users/jiangsheng/cnb/codex/codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx`
  - `/Users/jiangsheng/cnb/codex/codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx`

Do not stage or commit unless the user explicitly asks.
