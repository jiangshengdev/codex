import { expect, type Page, type TestInfo } from "@playwright/test";
import { observeComposerDocumentBoundaries } from "./focusComposerDocumentBoundaries";
import { observeComposerPopovers } from "./focusComposerPopovers";
import { observeHistoryDocumentBoundaries } from "./focusHistoryBoundary";
import { observeInputBoundaries } from "./focusInputBoundaries";
import { observeNewSessionRetry } from "./focusNewSessionRetry";
import { observePendingConfirmation } from "./focusPendingConfirmation";
import { observePendingReturn } from "./focusPendingReturn";
import { observeUnknownDetails, unknownDetailStoryIds } from "./focusUnknownDetails";
import { activateProductControl } from "./focusKeyboardActions";
import { observeCurrentFocus } from "./focusObservation";
import type { observeRecoveryStates } from "./focusRecoveryStates";

/** Additional focus surfaces; the caller has already reached the recovery outcome. */
export async function observeFocusSupplements(
  page: Page,
  testInfo: TestInfo,
  storyId: string,
  resetStory: () => Promise<void>,
  browserName: Parameters<typeof observeComposerDocumentBoundaries>[3],
  layout: Parameters<typeof observeComposerDocumentBoundaries>[4],
  exactCapture?: Parameters<typeof observeRecoveryStates>[4],
  supplementSelection?: Parameters<typeof observeRecoveryStates>[5],
  composerSkillScrollCapture?: Parameters<typeof observeComposerDocumentBoundaries>[6],
) {
  if (composerSkillScrollCapture != null) {
    if (exactCapture != null || supplementSelection != null) {
      throw new Error("Composer skill scroll cannot combine with another supplement selection");
    }
    await observeComposerDocumentBoundaries(
      page,
      testInfo,
      storyId,
      browserName,
      layout,
      resetStory,
      composerSkillScrollCapture,
    );
    return;
  }
  if (supplementSelection != null) {
    if (
      exactCapture != null ||
      supplementSelection.kind !== "history-missing-states" ||
      !supplementSelection.collectContext
    ) {
      throw new Error("History supplements require the context selection without another request");
    }
    await observeComposerPopovers(page, testInfo, storyId, undefined, supplementSelection);
    if (storyId === "history-detail--long-content") {
      await observeHistoryDocumentBoundaries(page, testInfo, storyId, resetStory);
    }
    return;
  }
  if (exactCapture != null) {
    expect(storyId).toBe("history-detail--long-content-continuation-failure");
    await observeComposerPopovers(page, testInfo, storyId, exactCapture);
    if (exactCapture.documentEndpoints) {
      await observeHistoryDocumentBoundaries(page, testInfo, storyId, resetStory);
    }
    return;
  }
  // Long-list Composer fixtures initially open the product drawer. Close it
  // through the keyboard before reaching their underlying Composer popovers.
  const closePendingDrawer = async (captureRestoration: boolean) => {
    const drawer = page.getByRole("dialog", { name: "Pending details", exact: true });
    if (
      storyId.startsWith("composer-input-and-send-") &&
      (await page.getByRole("dialog").count()) === 1 &&
      (await drawer.count()) === 1
    ) {
      await activateProductControl(
        page,
        drawer.getByRole("button", { name: "Close", exact: true }),
      );
      await expect(drawer).toHaveCount(0);
      if (captureRestoration) {
        await observeCurrentFocus(page, testInfo, `${storyId}-supplement-drawer-restored`);
      }
    }
  };
  await closePendingDrawer(true);
  // Context usage is available after History recovery, so capture before resets.
  if ((await page.getByRole("dialog").count()) === 0) {
    await observeComposerPopovers(page, testInfo, storyId);
  }
  await observeComposerDocumentBoundaries(
    page,
    testInfo,
    storyId,
    browserName,
    layout,
    async () => {
      await resetStory();
      await closePendingDrawer(false);
    },
  );
  if (unknownDetailStoryIds.some((id) => id === storyId)) {
    await resetStory();
    await observeUnknownDetails(page, testInfo, storyId);
  }
  if (
    [
      "composer-pending-input-browsing--mixed-text",
      "composer-pending-input-reordering--refresh-failed",
    ].includes(storyId)
  ) {
    await resetStory();
    await observePendingReturn(page, testInfo, storyId);
  }
  if (
    [
      "composer-input-and-send-guide--guide-queued-long-list",
      "composer-input-and-send-queue--running-queue-long-list",
    ].includes(storyId)
  ) {
    await resetStory();
    await observePendingConfirmation(page, testInfo, storyId);
  }
  await observeInputBoundaries(page, testInfo, storyId, resetStory);
  await observeHistoryDocumentBoundaries(page, testInfo, storyId, resetStory);
  if (
    /^new-session-(flow|mixed-recovery)--(creation-failed|creation-unknown|activation-failed)$/.test(
      storyId,
    )
  ) {
    await resetStory();
    await observeNewSessionRetry(page, testInfo, storyId);
  }
}
