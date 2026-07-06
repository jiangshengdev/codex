# Codex GUI Safari Keyboard Focus Scroll Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reveal the Codex GUI composer after iOS Safari focus-triggered keyboard resize when Safari fails to scroll the sticky composer into the visual viewport.

**Architecture:** Add a small composer-local hook that arms on textarea focus, waits for the next `visualViewport.resize`, measures one animation frame later, and calls `window.scrollBy` only when the composer still overlaps the visual viewport bottom. `ComposerTurnControl` owns only the DOM ref and hook wiring; viewport geometry and one-shot scroll behavior stay inside the hook.

**Tech Stack:** React 19, TypeScript, HeroUI `TextArea`, browser `VisualViewport`, Vitest Browser Mode, fnm-managed pnpm.

---

## Source Design

- Design: `docs/superpowers/specs/2026-07-06-codex-gui-safari-keyboard-focus-scroll-design.md`

## Files

- Create: `codex-gui/src/features/composerTurnControl/useRevealComposerOnViewportResize.ts`
  - Own the one-shot focus -> `visualViewport.resize` -> `requestAnimationFrame` -> overlap check -> `window.scrollBy` behavior.
  - Export `useRevealComposerOnViewportResize`.
  - Keep `COMPOSER_KEYBOARD_CLEARANCE_PX = 8` local to this file.
- Modify: `codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx`
  - Import `useRevealComposerOnViewportResize`.
  - Add a `composerShellRef`.
  - Pass the ref to the hook.
  - Attach the ref to the composer shell `section`.
  - Do not change sending, stopping, QR, IME Enter guard, or layout classes.
- Modify: `codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx`
  - Add focused browser coverage for the hook through the real composer component.
  - Stub `window.visualViewport`, `document.documentElement.clientHeight`, composer geometry, and `window.scrollBy`.
  - Keep existing interaction tests intact.

## Verification Commands

Run commands from `codex-gui` with the user's fnm-managed Node:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --config=vitest.browser.config.ts src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
/opt/homebrew/bin/fnm exec --using-file pnpm exec eslint src/features/composerTurnControl/ComposerTurnControl.tsx src/features/composerTurnControl/useRevealComposerOnViewportResize.ts src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
```

If Vitest Browser reports `WebSocket closed without opened` after all targeted tests pass, capture that output and stop for review instead of broadening the implementation.

## Task 1: Add focused failing browser tests

**Files:**
- Modify: `codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx`

- [ ] **Step 1: Extend the Vitest import**

Change:

```tsx
import { expect, test, vi } from "vitest";
```

to:

```tsx
import { afterEach, expect, test, vi } from "vitest";
```

- [ ] **Step 2: Add test helpers after `composerSelectors`**

Insert this helper block after the existing `composerSelectors` function:

```tsx
const nextAnimationFrame = (): Promise<void> =>
  new Promise((resolve) => {
    requestAnimationFrame(() => {
      resolve();
    });
  });

type MutableVisualViewport = VisualViewport & {
  height: number;
  offsetTop: number;
  pageTop: number;
};

function installVisualViewport({
  height,
  offsetTop = 0,
  pageTop = 0,
}: {
  height: number;
  offsetTop?: number;
  pageTop?: number;
}) {
  const target = new EventTarget();
  const originalVisualViewport = window.visualViewport;
  const viewport = {
    addEventListener: target.addEventListener.bind(target),
    dispatchEvent: target.dispatchEvent.bind(target),
    height,
    offsetTop,
    pageTop,
    removeEventListener: target.removeEventListener.bind(target),
  } as MutableVisualViewport;

  Object.defineProperty(window, "visualViewport", {
    configurable: true,
    value: viewport,
  });

  return {
    dispatchResize() {
      return target.dispatchEvent(new Event("resize"));
    },
    restore() {
      Object.defineProperty(window, "visualViewport", {
        configurable: true,
        value: originalVisualViewport,
      });
    },
    viewport,
  };
}
```

- [ ] **Step 3: Add cleanup after helpers**

Insert this cleanup after `installVisualViewport`:

```tsx
afterEach(() => {
  vi.restoreAllMocks();
});
```

- [ ] **Step 4: Add the successful-path no-scroll test after `limits virtual-keyboard focus styles to textarea focus`**

Insert:

```tsx
test("does not scroll after visual viewport resize when composer is already visible", async () => {
  const visualViewport = installVisualViewport({ height: 699 });
  try {
    vi.spyOn(document.documentElement, "clientHeight", "get").mockReturnValue(699);
    const scrollBy = vi.spyOn(window, "scrollBy").mockImplementation(() => {});
    const screen = await renderAttached();
    const composerShell = screen.container.querySelector('[aria-label="Message composer"]');
    if (!(composerShell instanceof HTMLElement)) {
      throw new Error("composer shell must render");
    }
    vi.spyOn(composerShell, "getBoundingClientRect").mockReturnValue({
      bottom: 361,
      height: 152,
      left: 0,
      right: 390,
      top: 209,
      width: 390,
      x: 0,
      y: 209,
      toJSON: () => ({}),
    });

    await screen.getByPlaceholder("Message Codex").click();
    visualViewport.viewport.height = 361;
    expect(visualViewport.dispatchResize()).toBe(true);
    await nextAnimationFrame();

    expect(scrollBy).not.toHaveBeenCalled();
  } finally {
    visualViewport.restore();
  }
});
```

- [ ] **Step 5: Add the failed Safari auto-scroll compensation test**

Insert immediately after the no-scroll test:

```tsx
test("scrolls once after visual viewport resize when composer remains covered", async () => {
  const visualViewport = installVisualViewport({ height: 699 });
  try {
    vi.spyOn(document.documentElement, "clientHeight", "get").mockReturnValue(699);
    const scrollBy = vi.spyOn(window, "scrollBy").mockImplementation(() => {});
    const screen = await renderAttached();
    const composerShell = screen.container.querySelector('[aria-label="Message composer"]');
    if (!(composerShell instanceof HTMLElement)) {
      throw new Error("composer shell must render");
    }
    vi.spyOn(composerShell, "getBoundingClientRect").mockReturnValue({
      bottom: 699,
      height: 152,
      left: 0,
      right: 390,
      top: 547,
      width: 390,
      x: 0,
      y: 547,
      toJSON: () => ({}),
    });

    await screen.getByPlaceholder("Message Codex").click();
    visualViewport.viewport.height = 361;
    expect(visualViewport.dispatchResize()).toBe(true);
    await nextAnimationFrame();

    expect(scrollBy).toHaveBeenCalledTimes(1);
    expect(scrollBy).toHaveBeenCalledWith({ top: 346 });

    expect(visualViewport.dispatchResize()).toBe(true);
    await nextAnimationFrame();
    expect(scrollBy).toHaveBeenCalledTimes(1);
  } finally {
    visualViewport.restore();
  }
});
```

- [ ] **Step 6: Add the blur guard test**

Insert immediately after the covered-composer test:

```tsx
test("does not scroll for visual viewport resize after composer blur", async () => {
  const visualViewport = installVisualViewport({ height: 699 });
  try {
    vi.spyOn(document.documentElement, "clientHeight", "get").mockReturnValue(699);
    const scrollBy = vi.spyOn(window, "scrollBy").mockImplementation(() => {});
    const screen = await renderAttached();
    const composerShell = screen.container.querySelector('[aria-label="Message composer"]');
    if (!(composerShell instanceof HTMLElement)) {
      throw new Error("composer shell must render");
    }
    vi.spyOn(composerShell, "getBoundingClientRect").mockReturnValue({
      bottom: 699,
      height: 152,
      left: 0,
      right: 390,
      top: 547,
      width: 390,
      x: 0,
      y: 547,
      toJSON: () => ({}),
    });

    const composer = screen.getByPlaceholder("Message Codex");
    await composer.click();
    composer.element().blur();
    visualViewport.viewport.height = 361;
    expect(visualViewport.dispatchResize()).toBe(true);
    await nextAnimationFrame();

    expect(scrollBy).not.toHaveBeenCalled();
  } finally {
    visualViewport.restore();
  }
});
```

- [ ] **Step 7: Run the focused browser test and confirm the new tests fail**

Run:

```bash
cd codex-gui
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --config=vitest.browser.config.ts src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx
```

Expected result before implementation: at least the covered-composer test fails because `window.scrollBy` is not called.

## Task 2: Implement the one-shot visual viewport hook

**Files:**
- Create: `codex-gui/src/features/composerTurnControl/useRevealComposerOnViewportResize.ts`

- [ ] **Step 1: Create the hook file**

Create `codex-gui/src/features/composerTurnControl/useRevealComposerOnViewportResize.ts` with this content:

```ts
import { useEffect, type RefObject } from "react";

const COMPOSER_KEYBOARD_CLEARANCE_PX = 8;

export function useRevealComposerOnViewportResize(
  composerShellRef: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    const composerShell = composerShellRef.current;
    const visualViewport = window.visualViewport;
    const textarea = composerShell?.querySelector("textarea") ?? null;

    if (
      composerShell == null ||
      visualViewport == null ||
      !(textarea instanceof HTMLTextAreaElement)
    ) {
      return;
    }

    let armed = false;
    let animationFrameId: number | null = null;

    const cancelPendingFrame = (): void => {
      if (animationFrameId == null) {
        return;
      }
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    };

    const disarm = (): void => {
      armed = false;
      cancelPendingFrame();
    };

    const revealIfCovered = (): void => {
      animationFrameId = null;

      if (!armed) {
        return;
      }
      armed = false;

      if (document.activeElement !== textarea) {
        return;
      }

      if (visualViewport.height >= document.documentElement.clientHeight) {
        return;
      }

      const visualBottom = visualViewport.offsetTop + visualViewport.height;
      const overlap = composerShell.getBoundingClientRect().bottom - visualBottom;

      if (overlap <= 0) {
        return;
      }

      window.scrollBy({ top: overlap + COMPOSER_KEYBOARD_CLEARANCE_PX });
    };

    const onFocus = (): void => {
      cancelPendingFrame();
      armed = true;
    };

    const onBlur = (): void => {
      disarm();
    };

    const onVisualViewportResize = (): void => {
      if (!armed) {
        return;
      }
      cancelPendingFrame();
      animationFrameId = requestAnimationFrame(revealIfCovered);
    };

    textarea.addEventListener("focus", onFocus);
    textarea.addEventListener("blur", onBlur);
    visualViewport.addEventListener("resize", onVisualViewportResize);

    return () => {
      textarea.removeEventListener("focus", onFocus);
      textarea.removeEventListener("blur", onBlur);
      visualViewport.removeEventListener("resize", onVisualViewportResize);
      cancelPendingFrame();
    };
  }, [composerShellRef]);
}
```

- [ ] **Step 2: Run the focused browser test**

Run:

```bash
cd codex-gui
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --config=vitest.browser.config.ts src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx
```

Expected result: tests still fail because `ComposerTurnControl` has not wired the hook yet.

## Task 3: Wire the hook into ComposerTurnControl

**Files:**
- Modify: `codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx`

- [ ] **Step 1: Import the hook**

Add this import below the existing model import:

```tsx
import { useRevealComposerOnViewportResize } from "./useRevealComposerOnViewportResize";
```

- [ ] **Step 2: Add the composer shell ref**

Inside `ComposerTurnControl`, immediately after `isSending` state:

```tsx
const [draft, setDraft] = useState("");
const [isSending, setIsSending] = useState(false);
const composerShellRef = useRef<HTMLElement | null>(null);
```

Keep the existing `isComposingRef` and `suppressNextEnterRef` after this new ref:

```tsx
const isComposingRef = useRef(false);
const suppressNextEnterRef = useRef(false);
```

- [ ] **Step 3: Call the hook after derived button state**

After `stopEnabled` is computed, add:

```tsx
useRevealComposerOnViewportResize(composerShellRef);
```

- [ ] **Step 4: Attach the ref to the composer shell**

Change the composer shell opening tag from:

```tsx
<section
  aria-label="Message composer"
  className="composer-shell sticky bottom-0 z-10 pt-3 pb-0"
>
```

to:

```tsx
<section
  aria-label="Message composer"
  className="composer-shell sticky bottom-0 z-10 pt-3 pb-0"
  ref={composerShellRef}
>
```

- [ ] **Step 5: Run the focused browser test**

Run:

```bash
cd codex-gui
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --config=vitest.browser.config.ts src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx
```

Expected result: the new reveal tests pass and existing composer behavior remains green.

## Task 4: Verify and inspect the implementation

**Files:**
- Verify: `codex-gui/src/features/composerTurnControl/useRevealComposerOnViewportResize.ts`
- Verify: `codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx`
- Verify: `codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx`

- [ ] **Step 1: Run TypeScript**

Run:

```bash
cd codex-gui
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

Expected result: command exits successfully.

- [ ] **Step 2: Run scoped ESLint**

Run:

```bash
cd codex-gui
/opt/homebrew/bin/fnm exec --using-file pnpm exec eslint src/features/composerTurnControl/ComposerTurnControl.tsx src/features/composerTurnControl/useRevealComposerOnViewportResize.ts src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx
```

Expected result: command exits successfully.

- [ ] **Step 3: Run formatting check**

Run:

```bash
cd codex-gui
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
```

Expected result: command exits successfully. If it fails only on touched files, run:

```bash
cd codex-gui
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt src/features/composerTurnControl/ComposerTurnControl.tsx src/features/composerTurnControl/useRevealComposerOnViewportResize.ts src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx --write
```

Then rerun the focused browser test and `format:oxfmt`.

- [ ] **Step 4: Inspect the final diff**

Run:

```bash
git diff -- codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx codex-gui/src/features/composerTurnControl/useRevealComposerOnViewportResize.ts codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx
```

Expected result:

- No diagnostic keyboard logging remains.
- `ComposerTurnControl` only adds the ref and hook call.
- The hook uses `visualViewport.resize`, `requestAnimationFrame`, geometry checks, and one `window.scrollBy` path.
- No device, UA, iPad, or iPhone branch is introduced.
- No app-server, projection, transcript state, IME guard, QR, Stop, or Send behavior is changed.

## Task 5: Manual Safari verification

**Files:**
- No file changes.

- [ ] **Step 1: Open Codex GUI on iPhone/iPad Safari**

Use the existing LAN/dev setup that exposes the Codex GUI to the device.

- [ ] **Step 2: Reproduce the previously failing path**

On the device:

1. Tap outside the composer so textarea is not focused.
2. Tap the composer textarea.
3. Let the soft keyboard open.

Expected result: the textarea is visible above the keyboard.

- [ ] **Step 3: Reproduce the already-focused path**

On the device:

1. Keep textarea focused.
2. Tap inside the textarea again or continue typing.

Expected result: no extra jump or upward drift occurs.

- [ ] **Step 4: Smoke-test composer interactions**

Verify:

- Enter sends a normal draft.
- Shift+Enter inserts a newline.
- IME candidate confirmation does not send unexpectedly.
- Stop, Send, and QR controls remain usable.

## Task 6: Local commit after implementation is accepted

**Files:**
- Stage: `codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx`
- Stage: `codex-gui/src/features/composerTurnControl/useRevealComposerOnViewportResize.ts`
- Stage: `codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx`

- [ ] **Step 1: Stage only implementation files**

Run:

```bash
git add codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx codex-gui/src/features/composerTurnControl/useRevealComposerOnViewportResize.ts codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx
```

- [ ] **Step 2: Inspect staged diff**

Run:

```bash
git diff --cached -- codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx codex-gui/src/features/composerTurnControl/useRevealComposerOnViewportResize.ts codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx
```

Expected result: staged diff contains only the focused Safari keyboard focus-scroll fix and tests.

- [ ] **Step 3: Create a local commit**

Run:

```bash
git commit -m "fix(gui): reveal composer after Safari keyboard resize"
```
