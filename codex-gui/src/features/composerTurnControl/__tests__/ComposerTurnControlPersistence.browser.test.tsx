import { expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { composerCapture } from "@/features/composerInputQueue/__tests__/composerInputQueueTestFixtures";
import { exportComposerDraft } from "@/features/composerEditor/composerDraft";
import { BrowserPersistenceStore } from "@/features/browserPersistence/browserPersistenceStore";
import {
  decodeComposerCoordinatorRecord,
  type ComposerCoordinatorRecord,
} from "@/features/composerInputQueue/composerCoordinatorPersistence";
import {
  createCoordinator,
  createPersistenceTestContext,
  type StartTurn,
  type SteerTurn,
} from "@/features/composerInputQueue/__tests__/composerInputQueueCoordinatorTestFixtures";
import {
  attachBaseline,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
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

test("removes a restored unknown start and continues the saved queue using the refreshed revision", async () => {
  const persistence = createPersistenceTestContext();
  const threadId = attachBaseline.snapshot.thread.id;
  const initial = createCoordinator({
    threadId,
    activeTurnId: null,
    persistence,
    startTurn: vi.fn<StartTurn>(() => new Promise(() => undefined)),
    steerTurn: vi.fn<SteerTurn>(),
  });
  initial.submit(composerCapture("Possibly delivered start"));
  initial.submit(composerCapture("Send after local removal"));
  initial.dispose();
  const startTurn = vi.fn<StartTurn>(() => new Promise(() => undefined));
  const controller = createCoordinator({
    threadId,
    activeTurnId: null,
    persistence,
    startTurn,
    steerTurn: vi.fn<SteerTurn>(),
  });
  controller.completeRestoreReconciliation();
  const beforeRevision = controller.getSnapshot().persistence.revision;
  const screen = await renderComposerTurnControl({ queue: { type: "provided", controller } });

  await expect.element(screen.getByText("Possibly delivered start", { exact: true })).toBeVisible();
  await screen.getByRole("button", { name: "Remove local record", exact: true }).click();
  await expect
    .element(screen.getByText("Possibly delivered start", { exact: true }))
    .not.toBeInTheDocument();
  expect(controller.getSnapshot().persistence).toMatchObject({
    error: null,
    unknownMessages: [],
    restoredPaused: true,
  });
  expect(controller.getSnapshot().persistence.revision).toBeGreaterThan(beforeRevision ?? 0);
  expect(startTurn).not.toHaveBeenCalled();
  await screen.getByRole("button", { name: "Continue sending", exact: true }).click();
  await expect
    .element(screen.getByRole("button", { name: "Continue sending", exact: true }))
    .not.toBeInTheDocument();
  expect(startTurn).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ input: composerCapture("Send after local removal").input }),
  );
});

test("removes successive unknown steers through real coordinator subscriptions", async () => {
  if (eventTurnStarted.event.type !== "turnStarted")
    throw new Error("Expected turnStarted fixture");
  const activeTurnId = eventTurnStarted.event.notification.turn.id;
  const threadId = attachBaseline.snapshot.thread.id;
  const persistence = createPersistenceTestContext();
  const initial = createCoordinator({
    threadId,
    activeTurnId,
    persistence,
    startTurn: vi.fn<StartTurn>(),
    steerTurn: vi.fn<SteerTurn>().mockResolvedValue({ turnId: activeTurnId }),
  });
  initial.submitSteer(composerCapture("First unknown guide"));
  initial.submitSteer(composerCapture("Second unknown guide"));
  await Promise.resolve();
  await Promise.resolve();
  initial.dispose();
  const store = new BrowserPersistenceStore<ComposerCoordinatorRecord>({
    ...persistence,
    threadId,
    codec: {
      encode: (value) => value,
      decode: (value) => decodeComposerCoordinatorRecord(value, threadId),
    },
  });
  const saved = store.read();
  if (saved == null) throw new Error("Expected saved guides");
  // Seed valid unresolved owners through the production persistence validator.
  store.commit(
    {
      ...saved.value,
      queue: {
        ...saved.value.queue,
        steer: {
          ...saved.value.queue.steer,
          pending: saved.value.queue.steer.pending.map((pending) => ({
            ...pending,
            phase: "deliveryUnknown",
          })),
        },
      },
    },
    saved.revision,
  );
  const startTurn = vi.fn<StartTurn>();
  const steerTurn = vi.fn<SteerTurn>();
  const controller = createCoordinator({
    threadId,
    activeTurnId,
    persistence,
    startTurn,
    steerTurn,
  });
  controller.completeRestoreReconciliation();
  const screen = await renderComposerTurnControl({
    scenario: { type: "activeFixture" },
    queue: { type: "provided", controller },
  });

  await expect.element(screen.getByText("First unknown guide", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("Second unknown guide", { exact: true })).toBeVisible();
  await screen.getByRole("button", { name: "Remove local record", exact: true }).first().click();
  await expect
    .element(screen.getByText("First unknown guide", { exact: true }))
    .not.toBeInTheDocument();
  await expect.element(screen.getByText("Second unknown guide", { exact: true })).toBeVisible();
  await screen.getByRole("button", { name: "Remove local record", exact: true }).click();
  await expect
    .element(screen.getByText("Second unknown guide", { exact: true }))
    .not.toBeInTheDocument();
  expect(controller.getSnapshot().persistence).toMatchObject({
    error: null,
    unknownMessages: [],
    restoredPaused: true,
  });
  expect(startTurn).not.toHaveBeenCalled();
  expect(steerTurn).not.toHaveBeenCalled();
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

test.each([1280, 375])(
  "keeps saving diagnostics in content and retry responsive at %i pixels",
  async (width) => {
    const originalViewport = { width: window.innerWidth, height: window.innerHeight };
    try {
      await page.viewport(width, 720);
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
      const description = screen.getByText(
        "Your input is still here. Sending is blocked until saving succeeds.",
        { exact: true },
      );
      const title = screen.getByText("Changes could not be saved", { exact: true });
      await expect
        .poll(() => {
          const retryRect = retry.element().getBoundingClientRect();
          const diagnosticRect = diagnostics.element().getBoundingClientRect();
          const descriptionRect = description.element().getBoundingClientRect();
          const titleRect = title.element().getBoundingClientRect();
          return {
            diagnosticBelowDescription: diagnosticRect.top >= descriptionRect.bottom - 1,
            diagnosticAlignedWithContent: Math.abs(diagnosticRect.left - descriptionRect.left) <= 1,
            retryInOperationArea:
              width === 1280
                ? retryRect.left > descriptionRect.right &&
                  Math.abs(retryRect.top - titleRect.top) <= 1
                : retryRect.top >= diagnosticRect.bottom &&
                  Math.abs(retryRect.left - descriptionRect.left) <= 1,
          };
        })
        .toEqual({
          diagnosticBelowDescription: true,
          diagnosticAlignedWithContent: true,
          retryInOperationArea: true,
        });
      expect(
        diagnostics.element().compareDocumentPosition(retry.element()) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).not.toBe(0);
      const alert = screen.getByRole("alert").element();
      expect(alert.scrollWidth).toBeLessThanOrEqual(alert.clientWidth);
    } finally {
      await page.viewport(originalViewport.width, originalViewport.height);
    }
  },
);
