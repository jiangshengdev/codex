import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { composerCapture } from "@/features/composerInputQueue/__tests__/composerInputQueueTestFixtures";
import { exportComposerDraft } from "@/features/composerEditor/composerDraft";
import { renderComposerTurnControl } from "./composerTurnControlBrowserTestSupport";
import {
  createQueueControllerHarness,
  pendingInputItem,
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
  await expect.element(screen.getByRole("alert")).not.toHaveTextContent("write failed");
  await screen.user.keyboard("{Enter}");
  expect(harness.submit).not.toHaveBeenCalled();
  const retry = screen.getByRole("button", { name: "Retry saving", exact: true });
  await expect.element(retry).toHaveClass("button--primary");
  await screen.getByRole("button", { name: "View diagnostic information", exact: true }).click();
  const diagnostics = screen.getByRole("dialog", { name: "Diagnostic information", exact: true });
  await expect.element(diagnostics).toHaveTextContent("write failed");
  expect(harness.controller.retryPersistence).not.toHaveBeenCalled();
  expect(harness.submit).not.toHaveBeenCalled();
  await diagnostics.getByRole("button", { name: "Close diagnostics", exact: true }).click();
  await expect.element(diagnostics).not.toBeInTheDocument();
  await retry.click();
  expect(harness.controller.retryPersistence).toHaveBeenCalledOnce();
});

test("continues without requiring the drawer and keeps unknown-send records independently visible", async () => {
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
  await screen.getByRole("button", { name: "Continue sending", exact: true }).click();
  expect(harness.controller.resumeRestored).toHaveBeenCalledExactlyOnceWith(7);
  expect(harness.controller.discardUnknown).not.toHaveBeenCalled();
  expect(harness.submit).not.toHaveBeenCalled();
  harness.publish(queueSnapshot({ persistence: { ...persistence, restoredPaused: false } }));
  await expect.element(screen.getByText("Sending result unknown", { exact: true })).toBeVisible();
  await screen.getByRole("button", { name: "Remove local record", exact: true }).click();
  expect(harness.controller.discardUnknown).toHaveBeenCalledExactlyOnceWith("unknown-message", 7);
});

test("uses the existing Pending drawer independently from continuing the restored queue", async () => {
  const harness = createQueueControllerHarness(
    queueSnapshot({
      ordinaryQueuedCount: 1,
      detailRevision: 1,
      persistence: { error: null, restoredPaused: true, revision: 7, unknownMessages: [] },
    }),
    {
      ordinary: [
        pendingInputItem("restored-pending", "ordinary", {
          type: "text",
          text: "Restored queued message",
          truncated: false,
        }),
      ],
      steer: [],
    },
  );
  const screen = await renderComposerTurnControl({
    queue: { type: "provided", controller: harness.controller },
  });

  await screen.getByRole("button", { name: "Pending: Queued 1", exact: true }).click();
  const drawer = screen.getByRole("dialog", { name: "Pending details", exact: true });
  await expect.element(drawer.getByText("Restored queued message", { exact: true })).toBeVisible();
  expect(harness.controller.resumeRestored).not.toHaveBeenCalled();
  expect(harness.submit).not.toHaveBeenCalled();
  await drawer.getByRole("button", { name: "Close", exact: true }).click();
  await expect.element(drawer).not.toBeInTheDocument();
  expect(harness.controller.resumeRestored).not.toHaveBeenCalled();
  expect(harness.submit).not.toHaveBeenCalled();
  await screen.getByRole("button", { name: "Continue sending", exact: true }).click();
  expect(harness.controller.resumeRestored).toHaveBeenCalledExactlyOnceWith(7);
  await expect.element(drawer).not.toBeInTheDocument();
});

test("keeps continuing and removing unknown records disabled until saving succeeds", async () => {
  const persistence = {
    error: "storage write failed",
    restoredPaused: true,
    revision: 7,
    unknownMessages: [{ id: "unknown-message", text: "May already be delivered" }],
  };
  const harness = createQueueControllerHarness(queueSnapshot({ persistence }));
  const screen = await renderComposerTurnControl({
    queue: { type: "provided", controller: harness.controller },
  });

  await expect
    .element(screen.getByRole("button", { name: "Continue sending", exact: true }))
    .toBeDisabled();
  await expect
    .element(screen.getByRole("button", { name: "Remove local record", exact: true }))
    .toBeDisabled();
  expect(harness.controller.resumeRestored).not.toHaveBeenCalled();
  expect(harness.controller.discardUnknown).not.toHaveBeenCalled();
  harness.publish(queueSnapshot({ persistence: { ...persistence, error: null } }));
  await expect
    .element(screen.getByRole("button", { name: "Continue sending", exact: true }))
    .toBeEnabled();
  await expect
    .element(screen.getByRole("button", { name: "Remove local record", exact: true }))
    .toBeEnabled();
  await expect
    .element(screen.getByRole("button", { name: "View diagnostic information", exact: true }))
    .not.toBeInTheDocument();
  expect(harness.submit).not.toHaveBeenCalled();
});

test("keeps empty persistence errors blocking without offering empty diagnostics", async () => {
  const harness = createQueueControllerHarness(
    queueSnapshot({
      persistence: { error: "", restoredPaused: true, revision: 7, unknownMessages: [] },
    }),
  );
  const screen = await renderComposerTurnControl({
    queue: { type: "provided", controller: harness.controller },
  });

  await screen.composer().fill("Keep unsaved input");
  await expect.element(screen.getByRole("alert")).toHaveTextContent("Changes could not be saved");
  await expect.element(screen.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
  await expect
    .element(screen.getByRole("button", { name: "Continue sending", exact: true }))
    .toBeDisabled();
  await expect
    .element(screen.getByRole("button", { name: "View diagnostic information", exact: true }))
    .not.toBeInTheDocument();
  await screen.user.keyboard("{Enter}");
  expect(harness.submit).not.toHaveBeenCalled();
  expect(harness.controller.resumeRestored).not.toHaveBeenCalled();
  await screen.getByRole("button", { name: "Retry saving", exact: true }).click();
  expect(harness.controller.retryPersistence).toHaveBeenCalledOnce();
});

test("aligns the saving retry and diagnostics actions in the wide layout", async () => {
  const originalViewport = { width: window.innerWidth, height: window.innerHeight };
  try {
    await page.viewport(1280, 720);
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
    const retry = screen.getByRole("button", { name: "Retry saving", exact: true });
    const diagnostics = screen.getByRole("button", {
      name: "View diagnostic information",
      exact: true,
    });
    await expect.element(retry).toBeVisible();
    await expect.element(diagnostics).toBeVisible();
    await expect
      .poll(() => {
        const retryRect = retry.element().getBoundingClientRect();
        const diagnosticRect = diagnostics.element().getBoundingClientRect();
        return Math.abs(retryRect.top - diagnosticRect.top);
      })
      .toBeLessThanOrEqual(1);
    expect(diagnostics.element().getBoundingClientRect().left).toBeGreaterThan(
      retry.element().getBoundingClientRect().right,
    );
  } finally {
    await page.viewport(originalViewport.width, originalViewport.height);
  }
});
