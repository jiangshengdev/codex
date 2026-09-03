import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";

import { createGuiHostCommands } from "@/__tests__/appBrowserTestSupport";

import {
  createQueueControllerHarness,
  pendingInputItem,
  queueSnapshot,
  renderAttached,
} from "./composerTurnControlPendingInputBrowserTestSupport";

beforeEach(async () => {
  await userEvent.unhover(document.body);
});
const staleSessionOperation = (revision: number) =>
  ({
    type: "unavailable",
    scope: "activeThreadSession",
    reason: "staleRevision",
    revision,
  }) as const;
afterEach(() => {
  vi.restoreAllMocks();
});
test("moves pending messages through the authoritative owner and preserves menu and item focus", async () => {
  const ordinary = ["A", "B", "C", "D"].map((label) =>
    pendingInputItem(`ordinary-${label.toLowerCase()}`, "ordinary", {
      type: "text",
      text: `Queued ${label}`,
      truncated: false,
    }),
  );
  const steer = ["A", "B"].map((label) =>
    pendingInputItem(`steer-${label.toLowerCase()}`, "steer", {
      type: "text",
      text: `Guiding ${label}`,
      truncated: false,
    }),
  );
  const harness = createQueueControllerHarness(
    queueSnapshot({
      ordinaryQueuedCount: ordinary.length,
      guidingCount: steer.length,
      detailRevision: 10,
      canStop: true,
    }),
    { ordinary, steer },
  );
  const screen = await renderAttached(createGuiHostCommands(), false, "en", harness.controller);

  await screen.getByRole("button", { name: "Pending: Guide 2, Queued 4", exact: true }).click();
  const dialog = screen.getByRole("dialog", { name: "Pending details", exact: true });
  const queuedA = dialog.getByRole("group", { name: "Queued A", exact: true });
  const queuedD = dialog.getByRole("group", { name: "Queued D", exact: true });
  await expect
    .element(
      queuedA.getByRole("button", {
        name: "Move up pending message: Queued A",
        exact: true,
      }),
    )
    .toBeDisabled();
  await expect
    .element(
      queuedD.getByRole("button", {
        name: "Move down pending message: Queued D",
        exact: true,
      }),
    )
    .toBeDisabled();

  const aMenuTrigger = queuedA.getByRole("button", {
    name: "More move options for pending message: Queued A",
    exact: true,
  });
  await aMenuTrigger.click();
  const menu = screen.getByRole("menu");
  await expect.element(menu).toBeVisible();
  expect(screen.getByRole("menu").all().length).toBe(1);
  await expect
    .element(menu.getByRole("menuitem", { name: "Move to first", exact: true }))
    .toBeDisabled();
  await expect
    .element(menu.getByRole("menuitem", { name: "Move to last", exact: true }))
    .toBeEnabled();
  await screen.user.keyboard("{Escape}");
  await expect.element(menu).not.toBeInTheDocument();
  await expect.element(aMenuTrigger).toHaveFocus();

  const queuedB = dialog.getByRole("group", { name: "Queued B", exact: true });
  await queuedB
    .getByRole("button", {
      name: "Move up pending message: Queued B",
      exact: true,
    })
    .click();
  expect(harness.movePendingInput).toHaveBeenLastCalledWith({
    key: ordinary[1]?.key,
    revision: 10,
    destination: "earlier",
  });
  await expect
    .poll(() => {
      const text = dialog.element().textContent;
      return text.indexOf("Queued B") < text.indexOf("Queued A");
    })
    .toBe(true);
  await expect.element(dialog.getByRole("group", { name: "Queued B", exact: true })).toHaveFocus();
  await expect
    .element(screen.getByRole("status"))
    .toHaveTextContent("Queued message moved to position 1 of 4.");
  expect(screen.getByRole("status").all().length).toBe(1);

  await dialog
    .getByRole("group", { name: "Queued B", exact: true })
    .getByRole("button", {
      name: "Move down pending message: Queued B",
      exact: true,
    })
    .click();
  expect(harness.movePendingInput).toHaveBeenLastCalledWith({
    key: ordinary[1]?.key,
    revision: 11,
    destination: "later",
  });

  const cMenuTrigger = dialog
    .getByRole("group", { name: "Queued C", exact: true })
    .getByRole("button", {
      name: "More move options for pending message: Queued C",
      exact: true,
    });
  cMenuTrigger.element().focus();
  await screen.user.keyboard("{Enter}");
  await expect.element(screen.getByRole("menu")).toBeVisible();
  await screen.user.keyboard("{Escape}");
  await expect.element(cMenuTrigger).toHaveFocus();
  await cMenuTrigger.click();
  await screen
    .getByRole("menu")
    .getByRole("menuitem", { name: "Move to first", exact: true })
    .click();
  expect(harness.movePendingInput).toHaveBeenLastCalledWith({
    key: ordinary[2]?.key,
    revision: 12,
    destination: "first",
  });
  await expect
    .poll(() => {
      const text = dialog.element().textContent;
      return text.indexOf("Queued C") < text.indexOf("Queued A");
    })
    .toBe(true);

  const movedAMenuTrigger = dialog
    .getByRole("group", { name: "Queued A", exact: true })
    .getByRole("button", {
      name: "More move options for pending message: Queued A",
      exact: true,
    });
  await movedAMenuTrigger.click();
  await screen
    .getByRole("menu")
    .getByRole("menuitem", { name: "Move to last", exact: true })
    .click();
  expect(harness.movePendingInput).toHaveBeenLastCalledWith({
    key: ordinary[0]?.key,
    revision: 13,
    destination: "last",
  });
  await expect
    .poll(() => {
      const text = dialog.element().textContent;
      return text.indexOf("Queued D") < text.indexOf("Queued A");
    })
    .toBe(true);

  await dialog
    .getByRole("group", { name: "Guiding B", exact: true })
    .getByRole("button", {
      name: "Move up pending message: Guiding B",
      exact: true,
    })
    .click();
  expect(harness.movePendingInput).toHaveBeenLastCalledWith({
    key: steer[1]?.key,
    revision: 14,
    destination: "earlier",
  });
  await expect
    .element(screen.getByRole("status"))
    .toHaveTextContent("Guiding message moved to position 1 of 2.");
});

test("re-reads independent lane budgets after a move and does not locate an item beyond the prefix", async () => {
  const ordinary = Array.from({ length: 41 }, (_, index) =>
    pendingInputItem(`ordinary-budget-${String(index)}`, "ordinary", {
      type: "text",
      text: `Ordinary budget ${String(index)}`,
      truncated: false,
    }),
  );
  const steer = Array.from({ length: 21 }, (_, index) =>
    pendingInputItem(`steer-budget-${String(index)}`, "steer", {
      type: "text",
      text: `Steer budget ${String(index)}`,
      truncated: false,
    }),
  );
  const harness = createQueueControllerHarness(
    queueSnapshot({
      ordinaryQueuedCount: ordinary.length,
      guidingCount: steer.length,
      detailRevision: 20,
      canStop: true,
    }),
    { ordinary, steer },
  );
  const screen = await renderAttached(createGuiHostCommands(), false, "en", harness.controller);

  await screen.getByRole("button", { name: "Pending: Guide 21, Queued 41", exact: true }).click();
  const dialog = screen.getByRole("dialog", { name: "Pending details", exact: true });
  await dialog.getByRole("button", { name: "Show more queued messages", exact: true }).click();
  await expect.element(dialog.getByText("Ordinary budget 39", { exact: true })).toBeVisible();
  await expect
    .element(dialog.getByText("Ordinary budget 40", { exact: true }))
    .not.toBeInTheDocument();
  await expect
    .element(dialog.getByText("Steer budget 20", { exact: true }))
    .not.toBeInTheDocument();

  await dialog
    .getByRole("group", { name: "Ordinary budget 0", exact: true })
    .getByRole("button", {
      name: "More move options for pending message: Ordinary budget 0",
      exact: true,
    })
    .click();
  await screen
    .getByRole("menu")
    .getByRole("menuitem", { name: "Move to last", exact: true })
    .click();

  expect(harness.readPendingInputPage).toHaveBeenNthCalledWith(4, {
    lane: "steer",
    revision: 21,
    cursor: null,
    limit: 20,
  });
  expect(harness.readPendingInputPage).toHaveBeenNthCalledWith(5, {
    lane: "ordinary",
    revision: 21,
    cursor: null,
    limit: 20,
  });
  const sixthPageRead = harness.readPendingInputPage.mock.calls.at(5);
  if (sixthPageRead == null) throw new Error("expected a second ordinary page read");
  const [{ cursor, ...sixthPageRequest }] = sixthPageRead;
  expect(cursor).not.toBeNull();
  expect(sixthPageRequest).toEqual({
    lane: "ordinary",
    revision: 21,
    limit: 20,
  });
  await expect
    .element(dialog.getByText("Ordinary budget 0", { exact: true }))
    .not.toBeInTheDocument();
  await expect.element(dialog.getByRole("heading", { name: "Queued", exact: true })).toHaveFocus();
  await expect
    .element(screen.getByRole("status"))
    .toHaveTextContent("Queued message moved to position 41 of 41.");
  await expect.element(dialog.getByText("Ordinary budget 40", { exact: true })).toBeVisible();
  await expect
    .element(dialog.getByText("Steer budget 20", { exact: true }))
    .not.toBeInTheDocument();
});

test("does not announce or refresh when an accepted move action is a no-op", async () => {
  const ordinary = ["A", "B"].map((label) =>
    pendingInputItem(`ordinary-no-op-${label.toLowerCase()}`, "ordinary", {
      type: "text",
      text: `No-op queued ${label}`,
      truncated: false,
    }),
  );
  const harness = createQueueControllerHarness(
    queueSnapshot({ ordinaryQueuedCount: 2, detailRevision: 25, canStop: true }),
    { ordinary, steer: [] },
  );
  const screen = await renderAttached(createGuiHostCommands(), false, "en", harness.controller);
  await screen.getByRole("button", { name: "Pending: Queued 2", exact: true }).click();
  const dialog = screen.getByRole("dialog", { name: "Pending details", exact: true });
  const pageReadCount = harness.readPendingInputPage.mock.calls.length;
  harness.movePendingInput.mockReturnValueOnce({
    type: "noOp",
    reason: "alreadyAtDestination",
    revision: 25,
  });

  await dialog
    .getByRole("group", { name: "No-op queued B", exact: true })
    .getByRole("button", {
      name: "Move up pending message: No-op queued B",
      exact: true,
    })
    .click();

  expect(harness.movePendingInput).toHaveBeenCalledExactlyOnceWith({
    key: ordinary[1]?.key,
    revision: 25,
    destination: "earlier",
  });
  const dialogText = dialog.element().textContent;
  expect(dialogText.indexOf("No-op queued A")).toBeLessThan(dialogText.indexOf("No-op queued B"));
  expect(dialog.getByRole("status").query()).toBeNull();
  expect(dialog.getByRole("alert").query()).toBeNull();
  expect(harness.readPendingInputPage).toHaveBeenCalledTimes(pageReadCount);
  expect(harness.controller.getSnapshot().detailRevision).toBe(25);
});

test("restarts an atomic two-lane refresh once and falls back with an alert after a second stale read", async () => {
  const ordinary = [
    pendingInputItem("ordinary-stale-a", "ordinary", {
      type: "text",
      text: "Ordinary stale A",
      truncated: false,
    }),
    pendingInputItem("ordinary-stale-b", "ordinary", {
      type: "text",
      text: "Ordinary stale B",
      truncated: false,
    }),
  ];
  const steer = [
    pendingInputItem("steer-stale-a", "steer", {
      type: "text",
      text: "Steer stale A",
      truncated: false,
    }),
    pendingInputItem("steer-stale-b", "steer", {
      type: "text",
      text: "Steer stale B",
      truncated: false,
    }),
  ];
  const harness = createQueueControllerHarness(
    queueSnapshot({ ordinaryQueuedCount: 2, guidingCount: 2, detailRevision: 30, canStop: true }),
    { ordinary, steer },
  );
  const screen = await renderAttached(createGuiHostCommands(), false, "en", harness.controller);
  await screen.getByRole("button", { name: "Pending: Guide 2, Queued 2", exact: true }).click();
  const dialog = screen.getByRole("dialog", { name: "Pending details", exact: true });

  harness.queuePageReadOverride(() => {
    harness.publish({ ...harness.controller.getSnapshot(), detailRevision: 32 });
    return { type: "stale", revision: 32 };
  });
  await dialog
    .getByRole("group", { name: "Ordinary stale B", exact: true })
    .getByRole("button", {
      name: "Move up pending message: Ordinary stale B",
      exact: true,
    })
    .click();
  await expect.poll(() => harness.readPendingInputPage.mock.calls.length).toBe(5);
  expect(harness.readPendingInputPage).toHaveBeenNthCalledWith(4, {
    lane: "steer",
    revision: 32,
    cursor: null,
    limit: 20,
  });
  expect(harness.readPendingInputPage).toHaveBeenNthCalledWith(5, {
    lane: "ordinary",
    revision: 32,
    cursor: null,
    limit: 20,
  });
  expect(dialog.getByRole("alert").query()).toBeNull();

  harness.queuePageReadOverride(() => {
    harness.publish({ ...harness.controller.getSnapshot(), detailRevision: 34 });
    return { type: "stale", revision: 34 };
  });
  harness.queuePageReadOverride(() => {
    harness.publish({ ...harness.controller.getSnapshot(), detailRevision: 35 });
    return { type: "stale", revision: 35 };
  });
  await dialog
    .getByRole("group", { name: "Ordinary stale B", exact: true })
    .getByRole("button", {
      name: "Move down pending message: Ordinary stale B",
      exact: true,
    })
    .click();

  await expect.element(dialog.getByRole("alert")).toBeVisible();
  await expect
    .element(dialog.getByText("Updated pending order could not be loaded", { exact: true }))
    .toBeVisible();
  await expect
    .element(
      dialog.getByText(
        "The message was moved, but repeated queue changes prevented the updated order from loading.",
        { exact: true },
      ),
    )
    .toBeVisible();
  expect(dialog.getByRole("status").query()).toBeNull();
  expect(harness.movePendingInput).toHaveBeenLastCalledWith({
    key: ordinary[1]?.key,
    revision: 32,
    destination: "later",
  });
  await expect.element(dialog.getByRole("heading", { name: "Pending details" })).toHaveFocus();
  const refreshCalls = harness.readPendingInputPage.mock.calls.slice(-4).map(([request]) => ({
    lane: request.lane,
    revision: request.revision,
  }));
  expect(refreshCalls).toEqual([
    { lane: "steer", revision: 33 },
    { lane: "steer", revision: 34 },
    { lane: "steer", revision: 35 },
    { lane: "ordinary", revision: 35 },
  ]);
});

test("stops chasing continuous stale pages and resumes after a newer revision", async () => {
  const ordinary = ["A", "B"].map((label) =>
    pendingInputItem(`ordinary-fallback-null-${label.toLowerCase()}`, "ordinary", {
      type: "text",
      text: `Fallback-null queued ${label}`,
      truncated: false,
    }),
  );
  const harness = createQueueControllerHarness(
    queueSnapshot({ ordinaryQueuedCount: 2, detailRevision: 60, canStop: true }),
    { ordinary, steer: [] },
  );
  const screen = await renderAttached(createGuiHostCommands(), false, "en", harness.controller);
  await screen.getByRole("button", { name: "Pending: Queued 2", exact: true }).click();
  const dialog = screen.getByRole("dialog", { name: "Pending details", exact: true });
  harness.setPageReadFallbackOverride((request) => {
    const revision = request.revision + 1;
    harness.publish({ ...harness.controller.getSnapshot(), detailRevision: revision });
    return { type: "stale", revision };
  });

  await dialog
    .getByRole("group", { name: "Fallback-null queued B", exact: true })
    .getByRole("button", {
      name: "Move up pending message: Fallback-null queued B",
      exact: true,
    })
    .click();

  await expect.element(dialog).toBeVisible();
  await expect
    .element(dialog.getByText("Updated pending order could not be loaded", { exact: true }))
    .toBeVisible();
  expect(dialog.getByText("Fallback-null queued A", { exact: true }).query()).toBeNull();
  expect(dialog.getByText("Fallback-null queued B", { exact: true }).query()).toBeNull();
  expect(harness.readPendingInputPage).toHaveBeenCalledTimes(5);
  expect(harness.controller.getSnapshot().detailRevision).toBe(64);

  harness.publish({ ...harness.controller.getSnapshot(), detailRevision: 64 });
  await expect.element(dialog).toBeVisible();
  expect(harness.readPendingInputPage).toHaveBeenCalledTimes(5);
  expect(dialog.getByText("Fallback-null queued A", { exact: true }).query()).toBeNull();

  harness.clearPageReadFallbackOverride();
  harness.replaceDetails({
    ordinary: [
      pendingInputItem("ordinary-recovered-b", "ordinary", {
        type: "text",
        text: "Recovered queued B",
        truncated: false,
      }),
      pendingInputItem("ordinary-recovered-a", "ordinary", {
        type: "text",
        text: "Recovered queued A",
        truncated: false,
      }),
    ],
    steer: [],
  });
  harness.publish({ ...harness.controller.getSnapshot(), detailRevision: 65 });

  await expect.element(dialog.getByText("Recovered queued B", { exact: true })).toBeVisible();
  await expect.element(dialog.getByText("Recovered queued A", { exact: true })).toBeVisible();
  expect(harness.readPendingInputPage).toHaveBeenCalledTimes(7);
});

test("hides move actions for owner-projected blockers and while delete confirmation owns the item", async () => {
  const harness = createQueueControllerHarness(
    queueSnapshot({ ordinaryQueuedCount: 3, guidingCount: 3, detailRevision: 40, canStop: true }),
    {
      ordinary: [
        pendingInputItem("ordinary-manageable-a", "ordinary", {
          type: "text",
          text: "Manageable item A",
          truncated: false,
        }),
        pendingInputItem("ordinary-manageable-b", "ordinary", {
          type: "text",
          text: "Manageable item B",
          truncated: false,
        }),
        pendingInputItem(
          "ordinary-read-only",
          "ordinary",
          { type: "text", text: "Read only item", truncated: false },
          undefined,
          { type: "readOnly", reason: "deliveryInProgress" },
        ),
      ],
      steer: [
        pendingInputItem("steer-manageable-a", "steer", {
          type: "text",
          text: "Manageable steer A",
          truncated: false,
        }),
        pendingInputItem("steer-manageable-b", "steer", {
          type: "text",
          text: "Manageable steer B",
          truncated: false,
        }),
        pendingInputItem(
          "steer-pending",
          "steer",
          { type: "text", text: "Pending steer", truncated: false },
          undefined,
          { type: "readOnly", reason: "deliveryInProgress" },
        ),
      ],
    },
  );
  const screen = await renderAttached(createGuiHostCommands(), false, "en", harness.controller);
  await screen.getByRole("button", { name: "Pending: Guide 3, Queued 3", exact: true }).click();
  const dialog = screen.getByRole("dialog", { name: "Pending details", exact: true });
  await expect
    .element(
      dialog
        .getByRole("group", { name: "Manageable item A", exact: true })
        .getByRole("button", { name: "Move down pending message: Manageable item A", exact: true }),
    )
    .toBeVisible();
  const readOnlyGroup = dialog.getByRole("group", { name: "Read only item", exact: true });
  expect(
    readOnlyGroup.getByRole("button", { name: /Move (up|down) pending message:/ }).all().length,
  ).toBe(0);
  expect(readOnlyGroup.getByRole("button", { name: /More move options/ }).query()).toBeNull();
  const pendingSteerGroup = dialog.getByRole("group", { name: "Pending steer", exact: true });
  expect(
    pendingSteerGroup.getByRole("button", { name: /Move (up|down) pending message:/ }).all().length,
  ).toBe(0);
  expect(pendingSteerGroup.getByRole("button", { name: /More move options/ }).query()).toBeNull();
  const readOnlyStatusText = dialog
    .getByText("This message has entered the sending process.", { exact: true })
    .first();
  await expect.element(readOnlyStatusText).toBeVisible();

  await dialog
    .getByRole("group", { name: "Manageable steer B", exact: true })
    .getByRole("button", {
      name: "Move up pending message: Manageable steer B",
      exact: true,
    })
    .click();
  await expect
    .element(screen.getByRole("status"))
    .toHaveTextContent("Guiding message moved to position 1 of 2.");
  expect(screen.getByRole("status").all().length).toBe(1);
  await expect.element(readOnlyStatusText).toBeVisible();
  expect(readOnlyStatusText.element().closest('[role="status"]')).toBeNull();

  harness.replaceDetails({
    ordinary: [
      pendingInputItem(
        "ordinary-editing",
        "ordinary",
        { type: "text", text: "Editing item", truncated: false },
        undefined,
        { type: "editing" },
      ),
      pendingInputItem("ordinary-editing-neighbor", "ordinary", {
        type: "text",
        text: "Editing neighbor",
        truncated: false,
      }),
    ],
    steer: [],
  });
  harness.publish(queueSnapshot({ ordinaryQueuedCount: 2, detailRevision: 42, canStop: true }));
  await expect
    .poll(
      () => dialog.getByRole("button", { name: /Move (up|down) pending message:/ }).all().length,
    )
    .toBe(0);
  await expect
    .element(dialog.getByText("This message is being edited.", { exact: true }))
    .toBeVisible();

  harness.replaceDetails({
    ordinary: [
      pendingInputItem("ordinary-confirm", "ordinary", {
        type: "text",
        text: "Confirm deletion item",
        truncated: false,
      }),
      pendingInputItem("ordinary-neighbor", "ordinary", {
        type: "text",
        text: "Neighbor item",
        truncated: false,
      }),
    ],
    steer: [],
  });
  harness.setMovementBlocked(true);
  harness.publish(queueSnapshot({ ordinaryQueuedCount: 2, detailRevision: 43, canStop: true }));
  expect(dialog.getByRole("button", { name: /Move (up|down) pending message:/ }).all().length).toBe(
    0,
  );
  harness.setMovementBlocked(false);
  harness.publish(queueSnapshot({ ordinaryQueuedCount: 2, detailRevision: 44, canStop: true }));
  const confirmGroup = dialog.getByRole("group", { name: "Confirm deletion item", exact: true });
  await expect
    .element(confirmGroup.getByRole("button", { name: /Move down pending message:/ }))
    .toBeVisible();
  await confirmGroup.getByRole("button", { name: "Delete", exact: true }).click();
  expect(
    confirmGroup.getByRole("button", { name: /Move (up|down) pending message:/ }).all().length,
  ).toBe(0);
  expect(confirmGroup.getByRole("button", { name: /More move options/ }).query()).toBeNull();
  await confirmGroup.getByRole("button", { name: "Keep", exact: true }).click();

  let preparationExcludedMoveActions = false;
  harness.beginPendingInputEdit.mockImplementationOnce(() => {
    preparationExcludedMoveActions =
      confirmGroup.getByRole("button", { name: /Move (up|down) pending message:/ }).all().length ===
      0;
    return {
      type: "notManageable",
      scope: "liveOwner",
      revision: harness.controller.getSnapshot().detailRevision,
    };
  });
  await confirmGroup.getByRole("button", { name: "Edit", exact: true }).click();
  expect(preparationExcludedMoveActions).toBe(true);
});

test("keeps move failures in the Drawer and rejects a stale session callback", async () => {
  const items = ["A", "B"].map((label) =>
    pendingInputItem(`move-failure-${label}`, "ordinary", {
      type: "text",
      text: `Move failure ${label}`,
      truncated: false,
    }),
  );
  const harness = createQueueControllerHarness(
    queueSnapshot({ ordinaryQueuedCount: 2, detailRevision: 50, canStop: true }),
    { ordinary: items, steer: [] },
  );
  const screen = await renderAttached(createGuiHostCommands(), false, "en", harness.controller);
  await screen.getByRole("button", { name: "Pending: Queued 2", exact: true }).click();
  const dialog = screen.getByRole("dialog", { name: "Pending details", exact: true });
  harness.movePendingInput.mockReturnValueOnce({
    type: "notManageable",
    scope: "liveOwner",
    revision: 51,
  });
  await dialog
    .getByRole("group", { name: "Move failure B", exact: true })
    .getByRole("button", { name: "Move up pending message: Move failure B", exact: true })
    .click();
  await expect
    .element(dialog.getByText("Pending message was not reordered", { exact: true }))
    .toBeVisible();
  await expect
    .element(
      dialog.getByText("The pending-message order did not change. Refresh complete; try again.", {
        exact: true,
      }),
    )
    .toBeVisible();

  vi.spyOn(screen.sessionHarness.composerRole, "movePendingInput").mockReturnValueOnce(
    staleSessionOperation(52),
  );
  await dialog
    .getByRole("group", { name: "Move failure A", exact: true })
    .getByRole("button", { name: "Move down pending message: Move failure A", exact: true })
    .click();
  await expect.element(dialog).toBeVisible();
  await expect
    .element(dialog.getByText("Pending message was not reordered", { exact: true }))
    .toBeVisible();
});

test("keeps a terminal stale non-move failure in the Drawer when counts reach zero", async () => {
  const items = ["A", "B"].map((label) =>
    pendingInputItem(`terminal-stale-${label}`, "ordinary", {
      type: "text",
      text: `Terminal stale ${label}`,
      truncated: false,
    }),
  );
  const harness = createQueueControllerHarness(
    queueSnapshot({ ordinaryQueuedCount: 2, detailRevision: 70, canStop: true }),
    { ordinary: items, steer: [] },
  );
  const screen = await renderAttached(createGuiHostCommands(), false, "en", harness.controller);
  await screen.getByRole("button", { name: "Pending: Queued 2", exact: true }).click();
  const dialog = screen.getByRole("dialog", { name: "Pending details", exact: true });
  harness.movePendingInput.mockImplementationOnce(() => {
    harness.publish(queueSnapshot({ detailRevision: 71, canStop: true }));
    return {
      type: "notManageable",
      scope: "liveOwner",
      revision: 71,
    };
  });
  harness.setPageReadFallbackOverride(() => ({ type: "stale", revision: 71 }));

  await dialog
    .getByRole("group", { name: "Terminal stale B", exact: true })
    .getByRole("button", { name: "Move up pending message: Terminal stale B", exact: true })
    .click();

  await expect.element(dialog).toBeVisible();
  await expect.element(dialog.getByRole("alert")).toBeVisible();
  await expect
    .element(dialog.getByText("Pending message was not reordered", { exact: true }))
    .toBeVisible();
  await expect
    .element(
      dialog.getByText(
        "The pending-message order did not change, and the refreshed order could not be loaded because the queue kept changing.",
        { exact: true },
      ),
    )
    .toBeVisible();
  expect(dialog.getByRole("status").query()).toBeNull();
  expect(harness.controller.getSnapshot()).toMatchObject({
    ordinaryQueuedCount: 0,
    guidingCount: 0,
    detailRevision: 71,
  });
  expect(harness.readPendingInputPage).toHaveBeenCalledTimes(5);
});
