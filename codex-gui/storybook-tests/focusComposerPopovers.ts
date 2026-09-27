import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { isProductElement, observeCurrentFocus } from "./focusObservation";
import { activateProductControl, focusProductControl } from "./focusKeyboardActions";
import type { observeRecoveryStates } from "./focusRecoveryStates";

type PopoverObservation = {
  state: string;
  trigger: string;
  status: "observed-awaiting-visual-review" | "not-applicable" | "blocked";
  observations?: number;
  reason?: string;
};

export type ComposerSkillState = "skill-0" | "skill-1" | "skill-2" | "skill-restored";

/** Own the existing finite skill journey and its keyboard-only draft cleanup. */
export async function visitComposerSkillStates(
  page: Page,
  testInfo: TestInfo,
  editor: Locator,
  visit: (state: ComposerSkillState, trigger: string, optionId?: string) => Promise<void>,
  stopAfter: ComposerSkillState = "skill-restored",
) {
  await focusProductControl(page, editor);
  const originalText = await editor.textContent();
  if (originalText == null) throw new Error("Message Codex editor has no text content");
  const documentEnd = (await page.evaluate(() => navigator.platform.startsWith("Mac")))
    ? "Meta+ArrowDown"
    : "Control+End";
  const suffix = " $preview";
  let suffixInserted = false;
  let failed = false;
  let cleanupFailure: { error: unknown } | undefined;
  try {
    await page.keyboard.press(documentEnd);
    await page.keyboard.type(suffix);
    suffixInserted = true;
    await expect(editor).toHaveAttribute("aria-expanded", "true");
    const option = page.getByRole("option", { name: /preview-review/ });
    await expect(option).toHaveCount(1);
    await expect(option).toBeVisible();
    const optionId = await option.getAttribute("id");
    if (optionId == null) throw new Error("Skill option has no active-descendant ID");
    for (const [state, key] of [
      ["skill-0", null],
      ["skill-1", "ArrowDown"],
      ["skill-2", "ArrowUp"],
    ] as const) {
      if (key != null) await page.keyboard.press(key);
      await expect(editor).toBeFocused();
      await expect(option).toHaveAttribute("aria-selected", "true");
      await expect(editor).toHaveAttribute("aria-activedescendant", optionId);
      await visit(state, key ?? "Message Codex → $preview", optionId);
      if (state === stopAfter) break;
    }
    if (stopAfter === "skill-restored") {
      await page.keyboard.press("Escape");
      await expect(option).toBeHidden();
      await expect(editor).toHaveAttribute("aria-expanded", "false");
      await expect(editor).toBeFocused();
      await visit("skill-restored", "Skill suggestions → Escape");
    }
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    try {
      if (suffixInserted) {
        await page.keyboard.press("Escape");
        await expect(editor).toBeFocused();
        await page.keyboard.press(documentEnd);
        for (let remaining = suffix.length - 1; remaining >= 0; remaining -= 1) {
          await page.keyboard.press("Backspace");
          await expect
            .poll(() => editor.textContent())
            .toBe(originalText + suffix.slice(0, remaining));
        }
        await expect.poll(() => editor.textContent()).toBe(originalText);
        await expect(editor).toBeFocused();
      }
    } catch (error) {
      cleanupFailure = { error };
      if (failed)
        testInfo.annotations.push({ type: "focus-cleanup-error", description: String(error) });
    }
  }
  if (cleanupFailure != null) throw cleanupFailure.error;
}

/** Existing product popovers only; never invokes compression or submits a draft. */
export async function observeComposerPopovers(
  page: Page,
  testInfo: TestInfo,
  storyId: string,
  exactCapture?: Parameters<typeof observeRecoveryStates>[4],
  supplementSelection?: Parameters<typeof observeRecoveryStates>[5],
) {
  const states: PopoverObservation[] = [];
  const contextOnly = exactCapture != null || supplementSelection != null;
  const record = async (suffix: string, trigger: string, expectedOptionId?: string) => {
    const state = `${storyId}-composer-popover-${suffix}`;
    const observations = await observeCurrentFocus(page, testInfo, state);
    expect(observations.length, `No focus evidence for ${state}`).toBeGreaterThan(0);
    if (expectedOptionId != null) {
      expect(
        observations.some(
          (row) => row.ringOwner.id === expectedOptionId && !row.ringOwner.isActiveElement,
        ),
        "The actual aria-activedescendant option must have its own geometry evidence",
      ).toBe(true);
    }
    states.push({
      state,
      trigger,
      status: "observed-awaiting-visual-review",
      observations: observations.length,
    });
  };
  const notApplicable = (state: string, reason: string) => {
    states.push({
      state: `${storyId}-composer-popover-${state}`,
      trigger: state,
      status: "not-applicable",
      reason,
    });
  };
  try {
    if (supplementSelection != null) {
      expect(supplementSelection.kind).toBe("history-missing-states");
      if (
        supplementSelection.kind !== "history-missing-states" ||
        !supplementSelection.collectContext
      ) {
        throw new Error("Context-only capture requires a History supplements selection");
      }
    }
    if (exactCapture != null) {
      expect(storyId).toBe("history-detail--long-content-continuation-failure");
    }
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const contextTriggers = page.getByRole("button", {
      name: /^(Context usage details,|Context compression in progress$|Compression request result unknown$)/,
    });
    if (contextOnly) {
      await expect(contextTriggers).toHaveCount(1);
      expect(await contextTriggers.nth(0).evaluate(isProductElement)).toBe(true);
    }
    if ((await contextTriggers.count()) === 0) {
      notApplicable("context-usage", "The current fixture renders no context usage trigger");
    }
    for (let index = 0; index < (contextOnly ? 1 : await contextTriggers.count()); index += 1) {
      const trigger = contextTriggers.nth(index);
      if (!(await trigger.evaluate(isProductElement))) continue;
      await expect(trigger).toBeVisible();
      await expect(trigger).toBeEnabled();
      await activateProductControl(page, trigger);
      const dialog = page.getByRole("dialog", { name: "Context usage", exact: true });
      await expect(dialog).toBeVisible();
      await record(`context-${String(index)}-opened`, "Context usage details → Enter");
      const compress = dialog.getByRole("button", { name: /^(Compress context|Compressing)$/ });
      await expect(compress).toHaveCount(1);
      if (await compress.isEnabled()) {
        await focusProductControl(page, compress);
        await record(`context-${String(index)}-action`, "Tab → Compress context (focus only)");
      } else if (contextOnly) {
        notApplicable(
          `context-${String(index)}-action`,
          "The existing Compress control is disabled",
        );
      }
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await expect(trigger).toBeFocused();
      await record(`context-${String(index)}-restored`, "Context usage → Escape");
    }
    if (contextOnly) return states;
    const hasPreviewSkillFixture =
      (/^(composer-input-and-send-(input|draft|send|stop|guide|queue)|composer-attachments-(files|images|failures|mixed))--/.test(
        storyId,
      ) &&
        storyId !== "composer-input-and-send-draft--invalid-skill") ||
      /^new-session-flow--(interactive|initial-input|blank-input)$/.test(storyId) ||
      /^new-session-inputs--(skill|file|image|mixed|mixed-uploading)$/.test(storyId);
    if (!hasPreviewSkillFixture) {
      notApplicable(
        "skill-menu",
        "This story does not declare ComposerSimulation's preview-review candidate",
      );
      return states;
    }
    const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
    if ((await editor.count()) === 0) {
      notApplicable("skill-menu", "The current preset has no Message Codex editor");
      return states;
    }
    await expect(editor).toHaveCount(1);
    expect(await editor.evaluate(isProductElement)).toBe(true);
    if ((await editor.getAttribute("contenteditable")) !== "true") {
      notApplicable(
        "skill-menu",
        "The existing Message Codex editor is not editable in this preset",
      );
      return states;
    }
    await visitComposerSkillStates(page, testInfo, editor, record);
    return states;
  } catch (error) {
    states.push({
      state: `${storyId}-composer-popover-blocked`,
      trigger: "existing Composer popovers",
      status: "blocked",
      reason: String(error),
    });
    throw error;
  } finally {
    const artifact = testInfo.outputPath(`${storyId}-composer-popovers.json`);
    await writeFile(artifact, JSON.stringify(states, null, 2));
    await testInfo.attach(`${storyId}-composer-popovers`, {
      path: artifact,
      contentType: "application/json",
    });
  }
}
