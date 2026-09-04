import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import {
  attachReplacement,
  eventTokenUsageUpdated,
} from "@/features/projection/__tests__/projectionFixtures";
import { tokenUsageUpdated } from "@/features/projection/__tests__/projectionTestBuilders";
import { createComposerPendingInputSession } from "../composerPendingInputSession";
import { createComposerTurnApplication } from "../composerTurnApplication";
import {
  renderComposerTurnControl,
  type RenderedComposerTurnControl,
} from "./composerTurnControlBrowserTestSupport";

vi.mock(import("../composerPendingInputSession"), { spy: true });

vi.mock(import("../composerTurnApplication"), { spy: true });

beforeEach(async () => {
  await userEvent.unhover(document.body);
});

const expectComposerDisabled = async (screen: RenderedComposerTurnControl): Promise<void> => {
  await expect.element(screen.composer()).toHaveAttribute("contenteditable", "false");
  await expect.element(screen.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
  await expect.element(screen.getByRole("button", { name: "Stop" })).toBeDisabled();
};

const getComposerPanel = (screen: RenderedComposerTurnControl): HTMLElement => {
  const composerPanel = screen.container.querySelector(".composer-panel");
  if (!(composerPanel instanceof HTMLElement)) {
    throw new Error("composer panel must render");
  }
  return composerPanel;
};

afterEach(() => {
  vi.restoreAllMocks();
});

test("disables controls while the projection is unavailable", async () => {
  expect.hasAssertions();
  const screen = await renderComposerTurnControl();
  const activeSnapshot = screen.sessionHarness.session.getSnapshot();
  if (activeSnapshot.phase !== "active") throw new Error("expected an active session");
  screen.sessionHarness.publish(
    screen.sessionHarness.projectionUnavailableSnapshot({
      ...activeSnapshot,
      revision: activeSnapshot.revision + 1,
      reason: "backpressure",
    }),
  );

  const composerPanel = getComposerPanel(screen);

  await expect.element(composerPanel).toHaveAttribute("aria-disabled", "true");
  await expect.element(composerPanel).toHaveAttribute("data-disabled", "true");
  await expectComposerDisabled(screen);
  await expect
    .element(
      screen.getByRole("button", { name: "Context usage details, 0% used, 120 of 258k tokens" }),
    )
    .toBeVisible();

  screen.sessionHarness.publish(
    screen.sessionHarness.activeSnapshot({
      ...activeSnapshot,
      revision: activeSnapshot.revision + 2,
    }),
  );

  await expect.element(composerPanel).toHaveAttribute("aria-disabled", "false");
  await expect.element(composerPanel).toHaveAttribute("data-disabled", "false");
  await expect.element(screen.composer()).toHaveAttribute("contenteditable", "true");
});

test("presents thread status from the active session snapshot", async () => {
  const screen = await renderComposerTurnControl();
  const activeSnapshot = screen.sessionHarness.session.getSnapshot();
  if (activeSnapshot.phase !== "active") throw new Error("expected an active session");
  const composer = screen.composer();
  composer.element().focus();
  await expect.element(composer).toHaveFocus();

  screen.sessionHarness.publish(
    screen.sessionHarness.activeSnapshot({
      ...activeSnapshot,
      revision: activeSnapshot.revision + 1,
      threadStatus: { type: "active", activeFlags: ["waitingOnApproval"] },
    }),
  );

  await expect
    .element(screen.getByRole("status", { name: "Current task is waiting for approval" }))
    .toHaveTextContent("Waiting for approval");
  await expect.element(composer).toHaveFocus();
});

test("shows attached context usage and opens its details", async () => {
  const screen = await renderComposerTurnControl();
  const contextUsageButton = screen.getByRole("button", {
    name: "Context usage details, 0% used, 120 of 258k tokens",
    exact: true,
  });

  await expect.element(contextUsageButton).toBeVisible();
  expect(contextUsageButton.element().textContent).toBe("");
  expect(contextUsageButton.element().textContent).not.toMatch(/120|0%/);
  await contextUsageButton.click();

  const dialog = screen.getByRole("dialog", { name: "Context usage", exact: true });
  await expect.element(dialog).toBeVisible();
  await expect.element(dialog.getByText("0% used", { exact: true })).toBeVisible();
  await expect.element(dialog.getByText("120 tokens used of 258k", { exact: true })).toBeVisible();
});

test("updates context usage from live runtime events", async () => {
  if (eventTokenUsageUpdated.event.type !== "tokenUsageUpdated") {
    throw new Error("fixture must contain a tokenUsageUpdated projection event");
  }
  const screen = await renderComposerTurnControl();
  const nextTokenUsage = {
    ...eventTokenUsageUpdated.event.notification.tokenUsage,
    last: {
      ...eventTokenUsageUpdated.event.notification.tokenUsage.last,
      totalTokens: 149_000,
    },
    modelContextWindow: 258_000,
  };

  screen.dispatchProjectionFacts([
    {
      type: "eventAccepted",
      payload: {
        notification: tokenUsageUpdated(eventTokenUsageUpdated, nextTokenUsage),
        replay: "live",
      },
    },
  ]);

  const contextUsageButton = screen.getByRole("button", {
    name: "Context usage details, 58% used, 149k of 258k tokens",
    exact: true,
  });
  await expect.element(contextUsageButton).toBeVisible();
  expect(contextUsageButton.element().textContent).toBe("");
  expect(contextUsageButton.element().textContent).not.toMatch(/149k|58%/);
  await contextUsageButton.click();

  const dialog = screen.getByRole("dialog", { name: "Context usage", exact: true });
  await expect.element(dialog.getByText("58% used", { exact: true })).toBeVisible();
  await expect.element(dialog.getByText("149k tokens used of 258k", { exact: true })).toBeVisible();
});

test("hides context controls when a replacement attach has no percentage data", async () => {
  const screen = await renderComposerTurnControl();
  const contextUsageButton = screen.getByRole("button", {
    name: "Context usage details, 0% used, 120 of 258k tokens",
    exact: true,
  });
  await expect.element(contextUsageButton).toBeVisible();

  screen.dispatchProjectionFacts([{ type: "baselineAttached", response: attachReplacement }]);

  await expect.element(contextUsageButton).not.toBeInTheDocument();
  await expect
    .element(screen.getByRole("button", { name: /Context usage details/ }))
    .not.toBeInTheDocument();
});

test("disposes active Composer applications once after a real StrictMode unmount", async () => {
  const pendingFactory = vi.mocked(createComposerPendingInputSession);
  const turnFactory = vi.mocked(createComposerTurnApplication);
  const pendingFactoryStart = pendingFactory.mock.results.length;
  const turnFactoryStart = turnFactory.mock.results.length;
  const view = await renderComposerTurnControl({
    scenario: { type: "activeFixture", captureEditReservations: true },
    strictMode: true,
  });
  const { reservations } = view;
  const screen = view;
  const composer = view.composer();
  const pendingInstances = pendingFactory.mock.results.slice(pendingFactoryStart).map((result) => {
    if (result.type !== "return")
      throw new Error("pending session factory must return an instance");
    return result.value;
  });
  const turnInstances = turnFactory.mock.results.slice(turnFactoryStart).map((result) => {
    if (result.type !== "return")
      throw new Error("turn application factory must return an instance");
    return result.value;
  });
  const pendingDisposeSpies = pendingInstances.map((instance) => vi.spyOn(instance, "dispose"));
  const turnDisposeSpies = turnInstances.map((instance) => vi.spyOn(instance, "dispose"));

  await composer.fill("Unmount active pending edit");
  await screen.getByRole("button", { name: "Send", exact: true }).click();
  await screen.getByRole("button", { name: "Pending: Queued 1", exact: true }).click();
  await screen.getByRole("button", { name: "Edit", exact: true }).click();
  await expect
    .element(screen.getByRole("combobox", { name: "Edit pending message", exact: true }))
    .toBeVisible();

  const reservation = reservations.at(0);
  if (reservation == null) throw new Error("real unmount test must begin a pending edit");
  const save = vi.spyOn(reservation, "save");
  const cancel = vi.spyOn(reservation, "cancel");
  const pendingSnapshotsBeforeUnmount = pendingInstances.map((instance) => instance.getSnapshot());
  const activePendingIndex = pendingSnapshotsBeforeUnmount.findIndex(
    (snapshot) => snapshot.view?.edit?.phase === "active",
  );
  if (activePendingIndex < 0) throw new Error("one pending session must own the active edit");
  const activePendingSnapshot = pendingSnapshotsBeforeUnmount[activePendingIndex];
  if (activePendingSnapshot == null) throw new Error("active pending snapshot must exist");
  const activeEdit = activePendingSnapshot.view?.edit;
  if (activeEdit?.phase !== "active") throw new Error("pending edit must be active");
  const turnVersionsBeforeUnmount = turnInstances.map((instance) => instance.getVersion());
  const activeSessionSnapshot = screen.sessionHarness.session.getSnapshot();
  if (activeSessionSnapshot.phase !== "active") throw new Error("expected an active session");
  const pendingFacts = {
    composerRole: activeSessionSnapshot.composerRole,
    sessionRevision: activeSessionSnapshot.revision,
    mutationsEnabled: true,
    snapshot: activeSessionSnapshot.composer,
  } as const;
  const turnFacts = {
    activeTurnId: activeSessionSnapshot.activeTurnId,
    composer: activeSessionSnapshot.composer,
    composerRole: activeSessionSnapshot.composerRole,
    phase: activeSessionSnapshot.phase,
    revision: activeSessionSnapshot.revision,
    skills: activeSessionSnapshot.skills,
  } as const;

  await screen.unmount();

  await expect
    .poll(() => pendingDisposeSpies.reduce((count, spy) => count + spy.mock.calls.length, 0))
    .toBe(1);
  await expect
    .poll(() => turnDisposeSpies.reduce((count, spy) => count + spy.mock.calls.length, 0))
    .toBe(1);
  expect(pendingDisposeSpies[activePendingIndex]).toHaveBeenCalledOnce();
  expect(save).not.toHaveBeenCalled();
  expect(cancel).not.toHaveBeenCalled();

  const disposedPending = pendingInstances[activePendingIndex];
  if (disposedPending == null) throw new Error("disposed pending session must exist");
  const disposedPendingSnapshot = disposedPending.getSnapshot();
  expect(disposedPendingSnapshot).toMatchObject({
    phase: "closed",
    ownerGeneration: activePendingSnapshot.ownerGeneration + 1,
    view: null,
    actionsEnabled: false,
    alert: null,
    announcement: null,
    effects: [],
  });
  disposedPending.detachEditor(pendingFacts, activeEdit.preparationToken);
  disposedPending.consumeEffect(Number.MAX_SAFE_INTEGER);
  expect(disposedPending.getSnapshot()).toEqual(disposedPendingSnapshot);

  const disposedTurnIndex = turnDisposeSpies.findIndex((spy) => spy.mock.calls.length === 1);
  if (disposedTurnIndex < 0) throw new Error("one turn application must be disposed");
  const disposedTurn = turnInstances[disposedTurnIndex];
  if (disposedTurn == null) throw new Error("disposed turn application must exist");
  const disposedTurnVersionBeforeUnmount = turnVersionsBeforeUnmount[disposedTurnIndex];
  if (disposedTurnVersionBeforeUnmount == null) {
    throw new Error("turn application version before unmount must exist");
  }
  expect(disposedTurn.getVersion()).toBe(disposedTurnVersionBeforeUnmount + 1);
  expect(disposedTurn.project({ session: turnFacts, editor: null }).operationsEnabled).toBe(false);
  const disposedTurnVersion = disposedTurn.getVersion();
  expect(disposedTurn.recover({ session: turnFacts })).toEqual({ type: "ignored" });
  expect(disposedTurn.getVersion()).toBe(disposedTurnVersion);
});

test("manual reconnect disables composer operations", async () => {
  expect.hasAssertions();

  const screen = await renderComposerTurnControl();
  const activeSnapshot = screen.sessionHarness.session.getSnapshot();
  if (activeSnapshot.phase !== "active") throw new Error("expected an active session");
  screen.sessionHarness.publish(
    screen.sessionHarness.projectionUnavailableSnapshot({
      ...activeSnapshot,
      revision: activeSnapshot.revision + 1,
      reason: "backpressure",
    }),
  );

  await expectComposerDisabled(screen);
});
