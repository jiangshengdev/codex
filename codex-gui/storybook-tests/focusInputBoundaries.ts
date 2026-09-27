import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { activateProductControl, focusProductControl } from "./focusKeyboardActions";
import { observeCurrentFocus, observeScrollBoundaryFocus } from "./focusObservation";

type ResetStory = () => Promise<void>;
type SharedBoundary = Awaited<ReturnType<typeof observeScrollBoundaryFocus>>[number];
type EditorEndpoint = Pick<
  SharedBoundary,
  "axis" | "endpoint" | "status" | "reason" | "observations" | "expectedPosition"
> & {
  key: string;
  beforeCapture?: Awaited<ReturnType<typeof readEditorPosition>>;
  afterCapture?: Awaited<ReturnType<typeof readEditorPosition>>;
};

/**
 * Run after the original overlay/reading routes have captured attachment details.
 * resetStory must reload this same fixture, await play/product readiness, and
 * reapply the current narrow-container width. Each destructive branch starts fresh.
 */
export async function observeInputBoundaries(
  page: Page,
  testInfo: TestInfo,
  storyId: string,
  resetStory: ResetStory,
): Promise<void> {
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  const prefix = `${storyId}-input-boundaries`;
  if (storyId === "composer-input-and-send-input--long-content") {
    await resetStory();
    await expect(editor).toContainText("Review section 20:");
    await observeEditorTextEndpoints(page, testInfo, editor, prefix);
    return;
  }

  if (
    storyId === "composer-attachments-failures--upload" ||
    storyId === "composer-attachments-mixed--mixed-results"
  ) {
    await resetAttachmentPreset(page, editor, storyId, resetStory);
    await observeRetryPending(page, testInfo, editor, prefix, "upload", "review-notes.txt");
  } else if (storyId === "composer-attachments-images--read-failure") {
    await resetAttachmentPreset(page, editor, storyId, resetStory);
    await observeRetryPending(page, testInfo, editor, prefix, "preview", "sample.png");
  }

  // These existing presets cover a single file/image, mixed first/last tokens,
  // and the same restored editor in the New session shell. No new files are added.
  const removalNames: readonly string[] = (() => {
    switch (storyId) {
      case "composer-attachments-files--ready":
      case "new-session-inputs--file":
        return ["review-notes.txt"];
      case "composer-attachments-images--ready":
      case "new-session-inputs--image":
        return ["sample.png"];
      case "composer-attachments-mixed--mixed-results":
        return ["review-notes.txt", "checklist.txt"];
      case "new-session-inputs--mixed":
      case "new-session-inputs--mixed-uploading":
        return ["review-notes.txt", "sample.png"];
      default:
        return [];
    }
  })();
  for (const [index, name] of removalNames.entries()) {
    await resetAttachmentPreset(page, editor, storyId, resetStory);
    const remove = editor.getByRole("button", { name: `Remove ${name}`, exact: true });
    await activateProductControl(page, remove);
    await expect(remove).toHaveCount(0);
    await expect(editor.getByRole("group", { name, exact: true })).toHaveCount(0);
    await expect(editor).toBeFocused();
    const observations = await observeCurrentFocus(
      page,
      testInfo,
      `${prefix}-remove-${String(index)}-restored-editor`,
    );
    expect(
      observations.length,
      "Removed attachment must restore observable editor focus",
    ).toBeGreaterThan(0);
    await expect(editor).toBeFocused();
  }
}

async function resetAttachmentPreset(
  page: Page,
  editor: Locator,
  storyId: string,
  resetStory: ResetStory,
): Promise<void> {
  await resetStory();
  await expect(editor).toHaveAttribute("contenteditable", "true");
  // Await the original preset before Retry or Remove can change its setup route.
  switch (storyId) {
    case "composer-attachments-mixed--mixed-results":
      await expect(editor).toContainText("File upload failed.");
      await expect(
        editor.getByRole("button", { name: "Preview sample.png", exact: true }),
      ).toBeVisible();
      await expect(editor.getByRole("group", { name: "checklist.txt", exact: true })).toContainText(
        "Uploading",
      );
      return;
    case "new-session-inputs--mixed-uploading":
      for (const attachment of ["review-notes.txt", "sample.png"]) {
        await expect(editor.getByRole("group", { name: attachment, exact: true })).toContainText(
          "Uploading",
        );
      }
      return;
    case "composer-attachments-failures--upload":
    case "composer-attachments-images--read-failure":
      // observeRetryPending waits for the matching initial failure below.
      return;
    default:
      await expect(
        editor
          .getByRole("status")
          .filter({ hasText: /^Uploaded$/ })
          .first(),
      ).toBeVisible();
      await expect(page.getByRole("button", { name: "Send", exact: true })).toBeEnabled();
      if (
        storyId === "composer-attachments-images--ready" ||
        storyId === "new-session-inputs--image" ||
        storyId === "new-session-inputs--mixed"
      ) {
        await expect(
          editor.getByRole("button", { name: "Preview sample.png", exact: true }),
        ).toBeVisible();
      }
  }
}

async function observeRetryPending(
  page: Page,
  testInfo: TestInfo,
  editor: Locator,
  prefix: string,
  kind: "upload" | "preview",
  name: string,
): Promise<void> {
  const token = editor.getByRole("group", { name, exact: true });
  const retry = token.getByRole("button", { name: `Retry ${kind} ${name}`, exact: true });
  await expect(token).toContainText(
    kind === "upload" ? "File upload failed." : "Preview read failed",
  );
  await activateProductControl(page, retry);
  const assertPending = async () => {
    await expect(retry).toHaveAttribute("data-pending", "true");
    await expect(retry).toBeDisabled();
    await expect(token).toContainText(kind === "upload" ? "Uploading" : "Preview read failed");
    if (kind === "preview") await expect(token).toContainText("Uploaded");
  };
  await assertPending();
  const state = `${prefix}-retry-${kind}-pending`;
  // Capture the actual post-action focus before navigating elsewhere. An empty
  // observation remains visible in coverage; do not manufacture restored focus.
  await observeCurrentFocus(page, testInfo, `${state}-current`);
  await assertPending();
  const remove = token.getByRole("button", { name: `Remove ${name}`, exact: true });
  await focusProductControl(page, remove);
  await assertPending();
  await observeCurrentFocus(page, testInfo, `${state}-remove-available`);
  await assertPending();
  // Unlike the text-only editor, this scrollport contains product controls.
  await observeScrollBoundaryFocus(page, testInfo, `${state}-attachments`, editor, {
    mode: "keyboard-then-wheel",
    assertRetainedState: assertPending,
  });
  await assertPending();
}

async function readEditorPosition(editor: Locator) {
  return editor.evaluate((element) => {
    const selection = getSelection();
    const inside = selection?.focusNode != null && element.contains(selection.focusNode);
    let beforeCaret: number | null = null;
    let afterCaret: number | null = null;
    if (inside) {
      const before = document.createRange();
      before.selectNodeContents(element);
      before.setEnd(selection.focusNode, selection.focusOffset);
      const after = document.createRange();
      after.selectNodeContents(element);
      after.setStart(selection.focusNode, selection.focusOffset);
      beforeCaret = before.toString().length;
      afterCaret = after.toString().length;
    }
    return {
      scrollTop: element.scrollTop,
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
      overflowY: getComputedStyle(element).overflowY,
      focused: document.hasFocus() && document.activeElement === element,
      collapsed: selection?.isCollapsed === true,
      beforeCaret,
      afterCaret,
    };
  });
}

async function observeEditorTextEndpoints(
  page: Page,
  testInfo: TestInfo,
  editor: Locator,
  prefix: string,
): Promise<void> {
  const boundaries: EditorEndpoint[] = [];
  const text = await editor.textContent();
  const mac = await page.evaluate(() => navigator.platform.startsWith("Mac"));
  try {
    await expect(editor).toHaveAttribute("contenteditable", "true");
    await focusProductControl(page, editor);
    for (const endpoint of ["start", "end"] as const) {
      // macOS uses Command+Up/Down for the same document edges as Ctrl+Home/End.
      // No selection API, programmatic focus, or scrollTo changes the observed state.
      const key = mac
        ? endpoint === "start"
          ? "Meta+ArrowUp"
          : "Meta+ArrowDown"
        : endpoint === "start"
          ? "Control+Home"
          : "Control+End";
      const result: EditorEndpoint = { axis: "y", endpoint, key, status: "blocked" };
      boundaries.push(result);
      try {
        await page.keyboard.press(key);
        if (mac) {
          // Command+arrows move the caret; Home/End also expose scroll padding.
          const scrollKey = endpoint === "start" ? "Home" : "End";
          result.key = `${key}, ${scrollKey}`;
          await page.keyboard.press(scrollKey);
        }
        const assertEndpoint = async () => {
          await expect
            .poll(
              async () => {
                const current = await readEditorPosition(editor);
                const maximum = current.scrollHeight - current.clientHeight;
                return (
                  current.focused &&
                  current.collapsed &&
                  maximum > 0.5 &&
                  ["auto", "scroll"].includes(current.overflowY) &&
                  (endpoint === "start" ? current.beforeCaret : current.afterCaret) === 0 &&
                  Math.abs(current.scrollTop - (endpoint === "start" ? 0 : maximum)) <= 0.5
                );
              },
              { message: `Keyboard ${key} must reach the editor's ${endpoint} scroll limit` },
            )
            .toBe(true);
          expect(await editor.textContent(), "Endpoint navigation must preserve the draft").toBe(
            text,
          );
        };
        await assertEndpoint();
        result.beforeCapture = await readEditorPosition(editor);
        result.expectedPosition =
          endpoint === "start"
            ? 0
            : result.beforeCapture.scrollHeight - result.beforeCapture.clientHeight;
        const observations = await observeCurrentFocus(
          page,
          testInfo,
          `${prefix}-editor-y-${endpoint}`,
        );
        await assertEndpoint();
        result.afterCapture = await readEditorPosition(editor);
        expect(
          observations.length,
          "Editor endpoint has no product focus observation",
        ).toBeGreaterThan(0);
        result.observations = observations.length;
        result.status = "observed-awaiting-visual-review";
      } catch (error) {
        result.reason = String(error);
        result.afterCapture = await readEditorPosition(editor);
      }
    }
  } finally {
    // Use the existing collector's boundary artifact contract; no geometry copy.
    const artifact = testInfo.outputPath(`${prefix}-editor-scroll-boundaries.json`);
    await writeFile(artifact, JSON.stringify(boundaries, null, 2));
    await testInfo.attach(`${prefix}-editor-scroll-boundaries`, {
      path: artifact,
      contentType: "application/json",
    });
  }
  expect(
    boundaries.filter((boundary) => boundary.status === "blocked"),
    "Editor scroll endpoint observation was blocked",
  ).toEqual([]);
}
