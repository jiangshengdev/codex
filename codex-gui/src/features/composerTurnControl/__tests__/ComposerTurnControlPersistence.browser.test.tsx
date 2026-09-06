import { expect, test } from "vitest";
import { composerCapture } from "@/features/composerInputQueue/__tests__/composerInputQueueTestFixtures";
import { exportComposerDraft } from "@/features/composerEditor/composerDraft";
import { renderComposerTurnControl } from "./composerTurnControlBrowserTestSupport";
import {
  createQueueControllerHarness,
  queueSnapshot,
} from "./composerTurnControlPendingInputBrowserTestSupport";

test("restores the ordinary draft in StrictMode and persists subsequent content changes", async () => {
  const harness = createQueueControllerHarness(queueSnapshot());
  harness.controller.getDraft.mockReturnValue(composerCapture("Restored ordinary draft").draft);
  const screen = await renderComposerTurnControl({
    queue: { type: "provided", controller: harness.controller },
    strictMode: true,
  });

  await expect.element(screen.composer()).toHaveTextContent("Restored ordinary draft");
  // Exercise actual editing: Firefox fill can return without input events after restoration.
  await screen.composer().click();
  await screen.user.keyboard(
    /Mac/i.test(navigator.platform) ? "{Meta>}a{/Meta}" : "{Control>}a{/Control}",
  );
  await screen.user.keyboard("Latest ordinary draft");
  await expect.element(screen.composer()).toHaveTextContent("Latest ordinary draft");
  await expect
    .poll(() => {
      const draft = harness.controller.saveDraft.mock.lastCall?.[0];
      return draft == null ? null : exportComposerDraft(draft).editorStateJson;
    })
    .toContain("Latest ordinary draft");
});

test("keeps the editor usable while a saving error blocks sending and offers a retry", async () => {
  const harness = createQueueControllerHarness(
    queueSnapshot({
      persistence: {
        error: "write failed",
        restoredPaused: false,
        revision: 3,
        unknownMessages: [],
      },
    }),
  );
  const screen = await renderComposerTurnControl({
    queue: { type: "provided", controller: harness.controller },
  });

  await screen.composer().fill("Keep editing");
  await expect.element(screen.composer()).toHaveAttribute("contenteditable", "true");
  await expect.element(screen.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
  await expect.element(screen.getByRole("alert")).toHaveTextContent("Changes could not be saved");
  await screen.user.keyboard("{Enter}");
  expect(harness.submit).not.toHaveBeenCalled();
  await screen.getByRole("button", { name: "Retry saving", exact: true }).click();
  expect(harness.controller.retryPersistence).toHaveBeenCalledOnce();
});

test("requires review and keeps unknown-send records independently visible", async () => {
  const persistence = {
    error: null,
    restoredPaused: true,
    revision: 7,
    unknownMessages: [{ id: "unknown-message", text: "May already be delivered" }],
  };
  const harness = createQueueControllerHarness(queueSnapshot({ persistence }));
  const screen = await renderComposerTurnControl({
    queue: { type: "provided", controller: harness.controller },
  });

  await expect.element(screen.getByText("May already be delivered", { exact: true })).toBeVisible();
  await screen.getByRole("button", { name: "Review and continue", exact: true }).click();
  expect(harness.controller.resumeRestored).toHaveBeenCalledExactlyOnceWith(7);
  expect(harness.controller.discardUnknown).not.toHaveBeenCalled();
  harness.publish(queueSnapshot({ persistence: { ...persistence, restoredPaused: false } }));
  await expect.element(screen.getByText("Sending result unknown", { exact: true })).toBeVisible();
  await screen.getByRole("button", { name: "Remove local record", exact: true }).click();
  expect(harness.controller.discardUnknown).toHaveBeenCalledExactlyOnceWith("unknown-message", 7);
});
