# Codex GUI IME Enter Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent IME candidate-confirmation Enter from submitting Codex GUI composer drafts while preserving normal Enter send and Shift+Enter newline behavior.

**Architecture:** Keep the guard local to `ComposerTurnControl.tsx`. Track composition lifecycle with component refs and suppress only the next non-Shift Enter after `compositionend`, then send only on a later stable Enter.

**Tech Stack:** React 19, TypeScript, HeroUI `TextArea`, Vitest Browser Mode, fnm-managed pnpm.

---

## Files

- Modify: `codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx`
  - Add `useRef`.
  - Add composition lifecycle refs and handlers.
  - Extend `onKeyDown` to suppress IME confirmation Enter.
- Modify: `codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx`
  - Add a browser regression for `compositionend` followed by Enter.
  - Keep existing Enter, Shift+Enter, and composing keydown coverage.

## Verification Commands

Run commands from `codex-gui` with the user's fnm-managed Node:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser -- src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
```

If the browser test runner reports unrelated project-wide failures, capture the specific failing output and stop for review instead of broadening the fix.

## Task 1: Add the failing IME Enter browser test

**Files:**
- Modify: `codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx`

- [ ] **Step 1: Insert the regression test after `keeps composing Enter from sending draft`**

Add this test after the existing composing Enter test:

```tsx
test("keeps the Enter that confirms a completed composition from sending draft", async () => {
  const commandHandle = createGuiHostCommands();
  const screen = await renderAttached(commandHandle);
  const composer = screen.getByPlaceholder("Message Codex");
  const textarea = composer.element();
  if (!(textarea instanceof HTMLTextAreaElement)) {
    throw new Error("composer textarea must render");
  }

  await composer.fill("nihao y");
  await composer.click();
  textarea.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
  textarea.value = "你好呀";
  textarea.dispatchEvent(
    new CompositionEvent("compositionend", {
      bubbles: true,
      data: "呀",
    }),
  );
  await expect.element(composer).toHaveValue("你好呀");

  await screen.user.keyboard("{Enter}");
  expect(commandHandle.startTurn).not.toHaveBeenCalled();
  await expect.element(composer).toHaveValue("你好呀");

  await screen.user.keyboard("{Enter}");
  expect(commandHandle.startTurn).toHaveBeenCalledTimes(1);
  expect(commandHandle.startTurn).toHaveBeenCalledWith({
    threadId,
    clientUserMessageId: null,
    input: [{ type: "text", text: "你好呀", text_elements: [] }],
  });
});
```

- [ ] **Step 2: Run the browser test and confirm it fails on current code**

Run:

```bash
cd codex-gui
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser -- src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx
```

Expected result before implementation: the new test fails because the first Enter after `compositionend` calls `startTurn`.

## Task 2: Implement the local IME Enter guard

**Files:**
- Modify: `codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx`

- [ ] **Step 1: Extend React imports**

Change the import at the top of `ComposerTurnControl.tsx` from:

```tsx
import { useState, type KeyboardEvent } from "react";
```

to:

```tsx
import { useRef, useState, type CompositionEvent, type KeyboardEvent } from "react";
```

- [ ] **Step 2: Add composition refs after state declarations**

Inside `ComposerTurnControl`, immediately after `isSending` state:

```tsx
const [draft, setDraft] = useState("");
const [isSending, setIsSending] = useState(false);
const isComposingRef = useRef(false);
const suppressNextEnterRef = useRef(false);
```

- [ ] **Step 3: Add composition event handlers before `onKeyDown`**

Add these handlers above `onKeyDown`:

```tsx
const onCompositionStart = (): void => {
  isComposingRef.current = true;
  suppressNextEnterRef.current = false;
};

const onCompositionEnd = (event: CompositionEvent<HTMLTextAreaElement>): void => {
  isComposingRef.current = false;
  suppressNextEnterRef.current = true;
  setDraft(event.currentTarget.value);
};
```

- [ ] **Step 4: Replace `onKeyDown` with the guarded flow**

Replace the existing `onKeyDown` function with:

```tsx
const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
  if (event.key !== "Enter" || event.shiftKey) {
    return;
  }
  if (event.nativeEvent.isComposing || isComposingRef.current) {
    return;
  }
  if (suppressNextEnterRef.current) {
    suppressNextEnterRef.current = false;
    event.preventDefault();
    return;
  }

  event.preventDefault();
  void submit();
};
```

- [ ] **Step 5: Wire composition handlers onto `TextArea`**

Update the `TextArea` props to include:

```tsx
onCompositionEnd={onCompositionEnd}
onCompositionStart={onCompositionStart}
```

The relevant `TextArea` block should include all three handlers:

```tsx
<TextArea
  disabled={!connectionUsable}
  fullWidth
  onChange={(event) => {
    setDraft(event.target.value);
  }}
  onCompositionEnd={onCompositionEnd}
  onCompositionStart={onCompositionStart}
  onKeyDown={onKeyDown}
  placeholder="Message Codex"
  value={draft}
  variant="primary"
/>
```

## Task 3: Verify behavior

**Files:**
- Verify: `codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx`
- Verify: `codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx`

- [ ] **Step 1: Run the focused browser test**

Run:

```bash
cd codex-gui
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser -- src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx
```

Expected result: all tests in `ComposerTurnControl.browser.test.tsx` pass.

- [ ] **Step 2: Run formatting check**

Run:

```bash
cd codex-gui
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
```

Expected result: command exits successfully.

- [ ] **Step 3: Inspect the final diff**

Run:

```bash
git diff -- codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx
```

Expected result:

- Only `ComposerTurnControl.tsx` and `ComposerTurnControl.browser.test.tsx` contain implementation changes.
- No protocol, app-server, projection, or host command files are touched.
- The new guard suppresses only the next non-Shift Enter after `compositionend`.

## Task 4: Local commit after implementation is accepted

**Files:**
- Stage: `codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx`
- Stage: `codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx`

- [ ] **Step 1: Stage only implementation files**

Run:

```bash
git add codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx
```

- [ ] **Step 2: Inspect staged diff**

Run:

```bash
git diff --cached -- codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx
```

Expected result: staged diff contains only the focused IME Enter guard and browser regression.

- [ ] **Step 3: Create a local commit**

Run:

```bash
git commit -m "fix(gui): guard IME Enter in composer"
```

Do not run `git push`, `git pull`, `git fetch`, or any other git remote command.
