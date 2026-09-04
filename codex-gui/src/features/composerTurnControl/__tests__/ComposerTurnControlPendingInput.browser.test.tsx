import { Toast } from "@heroui/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";

import { createGuiHostCommands } from "@/__tests__/appBrowserTestSupport";
import { createDeferred as deferred } from "@/__tests__/testDeferred";
import { createActiveThreadSessionHarness } from "@/features/activeThreadSession/__tests__/activeThreadSessionHarness";
import type {
  ActiveThreadComposerRole,
  ActiveThreadSkillsRole,
} from "@/features/activeThreadSession/activeThreadSession";
import { composerDraftCapture } from "@/features/composerInputQueue/__tests__/composerInputQueueTestFixtures";
import { type ComposerInputQueueCoordinator } from "@/features/composerInputQueue/composerInputQueueCoordinator";
import type { GuiHostCommands } from "@/features/guiHost/guiHostClient";
import {
  attachBaseline,
  eventTurnCompleted,
} from "@/features/projection/__tests__/projectionFixtures";
import type { SkillCatalogCandidate } from "@/features/skillCatalog/skillCatalogOwner";
import { disableMotionForTest, renderWithProviders } from "@/utils/test-utils";

import { ComposerTurnControl } from "../ComposerTurnControl";
import {
  createComposerSkillCatalogHarness,
  renderComposerTurnControl,
} from "./composerTurnControlBrowserTestSupport";
import {
  createQueueControllerHarness,
  pendingInputItem,
  queueSnapshot,
} from "./composerTurnControlPendingInputBrowserTestSupport";

const attachResponse = attachBaseline;

const threadId = attachResponse.snapshot.thread.id;
let restoreMotion: (() => void) | undefined;

beforeEach(async () => {
  await userEvent.unhover(document.body);
});
const composerRoleFor = (
  controller: ComposerInputQueueCoordinator,
  getRevision: () => number,
): Partial<ActiveThreadComposerRole> => ({
  beginPendingInputEdit: (revision, request, restore) =>
    revision === getRevision()
      ? controller.beginPendingInputEdit(request, restore)
      : staleSessionOperation(getRevision()),
  deletePendingInput: (revision, request) =>
    revision === getRevision()
      ? controller.deletePendingInput(request)
      : staleSessionOperation(getRevision()),
  interruptActiveTurn: (revision) =>
    revision === getRevision()
      ? controller.interruptActiveTurn()
      : staleSessionOperation(getRevision()),
  movePendingInput: (revision, request) =>
    revision === getRevision()
      ? controller.movePendingInput(request)
      : staleSessionOperation(getRevision()),
  promoteOrdinaryFrontToSteer: (revision) =>
    revision === getRevision()
      ? controller.promoteOrdinaryFrontToSteer()
      : staleSessionOperation(getRevision()),
  readPendingInputDetail: (request) => controller.readPendingInputDetail(request),
  readPendingInputPage: (request) => controller.readPendingInputPage(request),
  recover: (revision) =>
    revision === getRevision() ? controller.recover() : staleSessionOperation(getRevision()),
  submit: (revision, capture) =>
    revision === getRevision() ? controller.submit(capture) : staleSessionOperation(getRevision()),
  submitSteer: (revision, capture) =>
    revision === getRevision()
      ? controller.submitSteer(capture)
      : staleSessionOperation(getRevision()),
});

const staleSessionOperation = (revision: number) =>
  ({
    type: "unavailable",
    scope: "activeThreadSession",
    reason: "staleRevision",
    revision,
  }) as const;

const skillsRoleFor = (
  controller: ReturnType<typeof createComposerSkillCatalogHarness>["controller"],
): Partial<ActiveThreadSkillsRole> => ({
  invalidateSkills: () => controller.invalidate(),
  refreshSkills: () => controller.invalidate(),
  retrySkills: () => controller.retry(),
});
const composerTextWithoutTrailingBrowserPlaceholders = (
  element: Readonly<Pick<Node, "textContent">>,
): string => (element.textContent ?? "").replace(/[ \n\r\u00a0\u200b]+$/u, "");

const dispatchGuideShortcut = (element: Element): void => {
  const isMac = navigator.platform.startsWith("Mac");
  element.dispatchEvent(
    new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      ctrlKey: !isMac,
      key: "Enter",
      metaKey: isMac,
    }),
  );
};

afterEach(() => {
  restoreMotion?.();
  restoreMotion = undefined;
  vi.restoreAllMocks();
});

test("keeps submit and pending-input open available after StrictMode effect replay", async () => {
  const harness = createQueueControllerHarness(
    queueSnapshot({ ordinaryQueuedCount: 1, detailRevision: 1 }),
    {
      ordinary: [
        pendingInputItem("strict-pending", "ordinary", {
          type: "text",
          text: "Strict pending message",
          truncated: false,
        }),
      ],
      steer: [],
    },
  );
  const screen = await renderComposerTurnControl({
    queue: { type: "provided", controller: harness.controller },
    strictMode: true,
  });
  const composer = screen.composer();

  await composer.fill("Submit after replay");
  await screen.getByRole("button", { name: "Send", exact: true }).click();

  expect(harness.submit).toHaveBeenCalledOnce();
  await expect
    .poll(() => composerTextWithoutTrailingBrowserPlaceholders(composer.element()))
    .toBe("");

  await screen.getByRole("button", { name: "Pending: Queued 1", exact: true }).click();
  const dialog = screen.getByRole("dialog", { name: "Pending details", exact: true });
  await expect.element(dialog.getByText("Strict pending message", { exact: true })).toBeVisible();
});

test("gates operations by the active session phase", async () => {
  const harness = createQueueControllerHarness(queueSnapshot({ canStop: true }));
  const screen = await renderComposerTurnControl({
    scenario: { type: "activeFixture" },
    queue: { type: "provided", controller: harness.controller },
  });
  const composer = screen.composer();
  const send = screen.getByRole("button", { name: "Send", exact: true });
  const stop = screen.getByRole("button", { name: "Stop" });

  const activeSnapshot = screen.sessionHarness.session.getSnapshot();
  if (activeSnapshot.phase !== "active") throw new Error("expected an active session");
  await composer.fill("Identity-gated draft");
  screen.sessionHarness.publish(
    screen.sessionHarness.projectionUnavailableSnapshot({
      ...activeSnapshot,
      revision: activeSnapshot.revision + 1,
      reason: "backpressure",
    }),
  );
  await expect.element(send).toBeDisabled();
  await expect.element(stop).toBeDisabled();
  await screen.user.keyboard("{Enter}");
  const stopElement = stop.element();
  if (!(stopElement instanceof HTMLButtonElement)) throw new Error("Stop must be a button");
  stopElement.click();
  expect(harness.submit).not.toHaveBeenCalled();
  expect(harness.interruptActiveTurn).not.toHaveBeenCalled();

  screen.sessionHarness.publish(
    screen.sessionHarness.activeSnapshot({
      ...activeSnapshot,
      revision: activeSnapshot.revision + 2,
    }),
  );
  await expect.element(send).toBeEnabled();
  await expect.element(stop).toBeEnabled();
  await stop.click();
  await send.click();

  expect(harness.interruptActiveTurn).toHaveBeenCalledExactlyOnceWith();
  expect(harness.submit).toHaveBeenCalledOnce();
  const submittedCapture = harness.submit.mock.calls.at(0)?.at(0);
  if (submittedCapture == null) throw new Error("ordinary submit must receive a composer capture");
  expect(harness.submit).toHaveBeenCalledExactlyOnceWith(submittedCapture);
  expect(submittedCapture.draft).toBeDefined();
  expect(submittedCapture).toMatchObject({
    input: [{ type: "text", text: "Identity-gated draft", text_elements: [] }],
    textContent: "Identity-gated draft",
    selectedSkillPaths: [],
  });
});

test("uses the same skill chip and catalog tooltip while editing a pending message", async () => {
  restoreMotion = disableMotionForTest();
  const selectedSkill: SkillCatalogCandidate = {
    name: "pending-skill",
    path: "/repo/skills/hidden-pending-location/SKILL.md",
    description: "Pending skill fallback description",
    shortDescription: "Pending skill catalog summary",
    scope: "repo",
    interface: {
      displayName: "Pending Skill",
      iconSmallUrl: null,
      iconLargeUrl: null,
      shortDescription: "Pending skill preferred summary",
    },
  };
  const catalogHarness = createComposerSkillCatalogHarness({
    type: "ready",
    candidates: [selectedSkill],
    partialErrorCount: 0,
  });
  const view = await renderComposerTurnControl({
    scenario: { type: "activeFixture", captureEditReservations: true },
    skills: catalogHarness.controller,
  });
  const { reservations } = view;
  const screen = view;
  const composer = view.composer();

  await composer.fill("$Pending");
  await screen.user.keyboard("{Enter}");
  await screen.getByRole("button", { name: "Send", exact: true }).click();
  await screen.getByRole("button", { name: "Pending: Queued 1", exact: true }).click();
  await screen.getByRole("button", { name: "Edit", exact: true }).click();

  const pendingEditor = screen.getByRole("combobox", {
    name: "Edit pending message",
    exact: true,
  });
  const trigger = screen.getByRole("group", { name: /Pending Skill/i });
  await expect.element(trigger).toHaveAccessibleName(/^(?=.*Pending Skill)(?=.*details?).*$/i);
  const triggerElement = trigger.element();
  const chip = triggerElement.querySelector('[data-slot="chip"]');
  if (!(chip instanceof HTMLSpanElement))
    throw new Error("pending editor must render a HeroUI Chip");
  const tooltipTrigger = triggerElement.querySelector('[data-slot="tooltip-trigger"]');
  if (!(tooltipTrigger instanceof HTMLElement))
    throw new Error("pending skill chip must render inside a Tooltip trigger");
  expect(chip.classList).toContain("chip--sm");
  expect(chip.classList).toContain("chip--secondary");
  expect(chip.textContent).toBe("$Pending Skill");
  await expect.element(pendingEditor).toHaveTextContent("$Pending Skill");

  await userEvent.unhover(document.body);
  await userEvent.hover(tooltipTrigger);
  const tooltip = screen.getByRole("tooltip");
  await expect
    .element(tooltip, { timeout: 2_500 })
    .toHaveTextContent("Pending skill preferred summary");
  await expect.element(tooltip).toHaveTextContent("Repository");
  expect(tooltip.element().textContent).not.toContain("hidden-pending-location");
  expect(tooltip.element().textContent).not.toContain(selectedSkill.path);

  await trigger.click();
  await expect.element(pendingEditor).toHaveFocus();
  const reservation = reservations.at(0);
  if (reservation == null) throw new Error("pending skill edit must begin");
  const save = vi.spyOn(reservation, "save");
  await screen.getByRole("button", { name: "Save", exact: true }).click();
  expect(save).toHaveBeenCalledOnce();
  const savedCapture = save.mock.calls.at(0)?.at(0);
  if (savedCapture == null) throw new Error("pending skill edit must save a composer capture");
  expect(savedCapture.input).toEqual([
    { type: "text", text: "$pending-skill", text_elements: [] },
    { type: "skill", name: selectedSkill.name, path: selectedSkill.path },
  ]);
  await expect.element(tooltip).not.toBeInTheDocument();
});

test("shows Guide only for an active turn and submits an accepted draft as steer", async () => {
  restoreMotion = disableMotionForTest();
  const idleScreen = await renderComposerTurnControl();
  await expect
    .element(idleScreen.getByRole("button", { name: "Guide", exact: true }))
    .not.toBeInTheDocument();
  await idleScreen.unmount();

  const harness = createQueueControllerHarness(queueSnapshot({ canStop: true }));
  const screen = await renderComposerTurnControl({
    scenario: { type: "activeFixture" },
    queue: { type: "provided", controller: harness.controller },
  });
  const composer = screen.composer();
  const guide = screen.getByRole("button", { name: "Guide", exact: true });

  await expect.element(guide).toBeDisabled();
  await composer.fill("Guide this turn");
  await expect.element(guide).toBeEnabled();
  await userEvent.unhover(document.body);
  await userEvent.hover(guide);
  await expect
    .element(screen.getByRole("tooltip"))
    .toHaveTextContent(navigator.platform.startsWith("Mac") ? "⌘ Enter" : "Ctrl+Enter");
  await userEvent.unhover(guide);
  await guide.click();

  expect(harness.submitSteer).toHaveBeenCalledOnce();
  const submittedCapture = harness.submitSteer.mock.calls.at(0)?.at(0);
  if (submittedCapture == null) throw new Error("guide submit must receive a composer capture");
  expect(harness.submitSteer).toHaveBeenCalledExactlyOnceWith(submittedCapture);
  expect(submittedCapture.draft).toBeDefined();
  expect(submittedCapture).toMatchObject({
    input: [{ type: "text", text: "Guide this turn", text_elements: [] }],
    textContent: "Guide this turn",
    selectedSkillPaths: [],
  });
  expect(harness.submit).not.toHaveBeenCalled();
  await expect
    .poll(() => composerTextWithoutTrailingBrowserPlaceholders(composer.element()))
    .toBe("");

  harness.submitSteer.mockReturnValueOnce({ type: "rejected", reason: "recoveryPending" });
  await composer.fill("Keep the newer draft");
  await guide.click();
  await expect
    .poll(() => composerTextWithoutTrailingBrowserPlaceholders(composer.element()))
    .toBe("Keep the newer draft");
});

test("routes guide shortcuts by draft presence while ordinary Enter stays ordinary", async () => {
  const harness = createQueueControllerHarness(
    queueSnapshot({ ordinaryQueuedCount: 1, detailRevision: 1, canStop: true }),
    {
      ordinary: [
        pendingInputItem("ordinary-shortcut", "ordinary", {
          type: "text",
          text: "Ordinary queued",
          truncated: false,
        }),
      ],
      steer: [],
    },
  );
  harness.promoteOrdinaryFrontToSteer.mockReturnValue(true);
  const screen = await renderComposerTurnControl({
    scenario: { type: "activeFixture" },
    queue: { type: "provided", controller: harness.controller },
  });
  const composer = screen.composer();

  await composer.fill("Explicit guide");
  dispatchGuideShortcut(composer.element());
  expect(harness.submitSteer).toHaveBeenCalledOnce();
  const guideCapture = harness.submitSteer.mock.calls.at(0)?.at(0);
  if (guideCapture == null) throw new Error("guide shortcut must submit a composer capture");
  expect(harness.submitSteer).toHaveBeenCalledExactlyOnceWith(guideCapture);
  expect(guideCapture.draft).toBeDefined();
  expect(guideCapture).toMatchObject({
    input: [{ type: "text", text: "Explicit guide", text_elements: [] }],
    textContent: "Explicit guide",
    selectedSkillPaths: [],
  });
  expect(harness.promoteOrdinaryFrontToSteer).not.toHaveBeenCalled();
  expect(harness.submit).not.toHaveBeenCalled();
  await expect
    .poll(() => composerTextWithoutTrailingBrowserPlaceholders(composer.element()))
    .toBe("");

  dispatchGuideShortcut(composer.element());
  expect(harness.promoteOrdinaryFrontToSteer).toHaveBeenCalledExactlyOnceWith();
  expect(harness.submitSteer).toHaveBeenCalledTimes(1);

  await composer.fill("Ordinary next turn");
  await composer.click();
  await screen.user.keyboard("{Enter}");
  expect(harness.submit).toHaveBeenCalledOnce();
  const ordinaryCapture = harness.submit.mock.calls.at(0)?.at(0);
  if (ordinaryCapture == null) throw new Error("ordinary Enter must submit a composer capture");
  expect(harness.submit).toHaveBeenCalledExactlyOnceWith(ordinaryCapture);
  expect(ordinaryCapture.draft).toBeDefined();
  expect(ordinaryCapture).toMatchObject({
    input: [{ type: "text", text: "Ordinary next turn", text_elements: [] }],
    textContent: "Ordinary next turn",
    selectedSkillPaths: [],
  });
  expect(harness.submitSteer).toHaveBeenCalledTimes(1);
});

test("renders one bounded pending-input Drawer while keeping exceptional states inline", async () => {
  const longPreview = `${"Guide detail ".repeat(13)}...`;
  const longDetail = "Guide detail ".repeat(20).trim();
  const steerItems = Array.from({ length: 21 }, (_, index) =>
    index === 0
      ? pendingInputItem(
          "steer-long",
          "steer",
          { type: "text", text: longPreview, truncated: true },
          longDetail,
          { type: "readOnly", reason: "deliveryInProgress" },
        )
      : index === 1
        ? pendingInputItem("steer-structured", "steer", {
            type: "nonText",
            imageCount: 2,
            audioCount: 1,
            skillCount: 1,
            mentionCount: 1,
          })
        : pendingInputItem(`steer-${String(index)}`, "steer", {
            type: "text",
            text: `Steer ${String(index)}`,
            truncated: false,
          }),
  );
  const ordinaryItems = [
    pendingInputItem("ordinary-a", "ordinary", {
      type: "text",
      text: "Ordinary A",
      truncated: false,
    }),
    pendingInputItem("ordinary-b", "ordinary", {
      type: "text",
      text: "Ordinary B",
      truncated: false,
    }),
    ...Array.from({ length: 19 }, (_, index) =>
      pendingInputItem(`ordinary-${String(index + 2)}`, "ordinary", {
        type: "text",
        text: `Ordinary ${String(index + 2)}`,
        truncated: false,
      }),
    ),
  ];
  const harness = createQueueControllerHarness(
    queueSnapshot({
      ordinaryQueuedCount: 21,
      guidingCount: 21,
      detailRevision: 4,
      rejectedSteers: [
        {
          key: "rejected-private-id",
          preview: { type: "text", text: "Rejected first", truncated: false },
          reason: "activeTurnNotSteerable",
        },
      ],
      hasUnknownSteer: true,
      canStop: true,
    }),
    { ordinary: ordinaryItems, steer: steerItems },
  );
  const screen = await renderComposerTurnControl({
    scenario: { type: "activeFixture" },
    queue: { type: "provided", controller: harness.controller },
  });
  const region = screen.getByRole("region", { name: "Pending messages", exact: true });
  const trigger = region.getByRole("button", {
    name: "Pending: Guide 21, Queued 21",
    exact: true,
  });

  await expect.element(trigger).toBeVisible();
  await expect.element(region.getByText("Will send first", { exact: true })).toBeVisible();
  await expect
    .element(region.getByText("Currently unable to guide; added to queue", { exact: true }))
    .toBeVisible();
  await expect.element(region.getByText("Guide status unknown", { exact: true })).toBeVisible();
  await expect.element(region.getByText("Ordinary A", { exact: true })).not.toBeInTheDocument();
  expect(region.getByRole("button", { name: /retry/i }).query()).toBeNull();

  await trigger.click();
  const dialog = screen.getByRole("dialog", { name: "Pending details", exact: true });
  await expect.element(dialog).toBeVisible();
  expect(harness.readPendingInputPage).toHaveBeenCalledTimes(2);
  expect(harness.readPendingInputPage).toHaveBeenNthCalledWith(1, {
    lane: "steer",
    revision: 4,
    cursor: null,
    limit: 20,
  });
  expect(harness.readPendingInputPage).toHaveBeenNthCalledWith(2, {
    lane: "ordinary",
    revision: 4,
    cursor: null,
    limit: 20,
  });
  expect(screen.baseElement.contains(dialog.element())).toBe(true);
  await expect.element(dialog.getByRole("heading", { name: "Guiding" })).toBeVisible();
  await expect.element(dialog.getByRole("heading", { name: "Queued" })).toBeVisible();
  await expect.element(dialog).not.toHaveTextContent("steer-long");
  await expect.element(dialog).not.toHaveTextContent("ordinary-a");
  await expect.element(dialog).toHaveTextContent(/2 images.*1 audio item.*1 skill.*1 mention/);
  await expect
    .element(dialog.getByText("This message has entered the sending process.", { exact: true }))
    .toBeVisible();
  const dialogText = dialog.element().textContent;
  expect(dialogText.indexOf(longPreview)).toBeLessThan(dialogText.indexOf("Steer 2"));
  expect(dialogText.indexOf("Ordinary A")).toBeLessThan(dialogText.indexOf("Ordinary B"));
  await expect.element(dialog.getByText("Steer 20", { exact: true })).not.toBeInTheDocument();

  const expand = dialog.getByRole("button", { name: /Expand pending message:/ });
  await expand.click();
  await expect.element(dialog.getByText(longDetail, { exact: true })).toBeVisible();
  const collapse = dialog.getByRole("button", { name: /Collapse pending message:/ });
  await collapse.click();
  await expect.element(dialog.getByText(longDetail, { exact: true })).not.toBeInTheDocument();

  const showMoreGuiding = dialog.getByRole("button", {
    name: "Show more guiding messages",
    exact: true,
  });
  const showMoreQueued = dialog.getByRole("button", {
    name: "Show more queued messages",
    exact: true,
  });
  await expect.element(showMoreGuiding).toHaveTextContent("Show more");
  await expect.element(showMoreQueued).toHaveTextContent("Show more");
  await showMoreGuiding.click();
  await showMoreQueued.click();
  await expect.element(dialog.getByText("Steer 20", { exact: true })).toBeVisible();
  await expect.element(dialog.getByText("Ordinary 20", { exact: true })).toBeVisible();

  harness.replaceDetails({
    ordinary: [
      pendingInputItem("ordinary-revision", "ordinary", {
        type: "text",
        text: "Ordinary after revision",
        truncated: false,
      }),
    ],
    steer: [
      pendingInputItem("steer-revision", "steer", {
        type: "text",
        text: "Steer after revision",
        truncated: false,
      }),
    ],
  });
  harness.publish(
    queueSnapshot({
      ordinaryQueuedCount: 1,
      guidingCount: 1,
      detailRevision: 5,
      hasUnknownSteer: true,
      rejectedSteers: harness.controller.getSnapshot().rejectedSteers,
      canStop: true,
    }),
  );
  await expect.element(dialog.getByText("Steer after revision", { exact: true })).toBeVisible();
  await expect.element(dialog.getByText("Steer 20", { exact: true })).not.toBeInTheDocument();
  expect(harness.readPendingInputPage).toHaveBeenCalledTimes(6);
  expect(harness.readPendingInputPage).toHaveBeenNthCalledWith(5, {
    lane: "steer",
    revision: 5,
    cursor: null,
    limit: 20,
  });
  expect(harness.readPendingInputPage).toHaveBeenNthCalledWith(6, {
    lane: "ordinary",
    revision: 5,
    cursor: null,
    limit: 20,
  });
  const currentTrigger = region.getByRole("button", {
    name: "Pending: Guide 1, Queued 1",
    exact: true,
  });
  const closeTrigger = dialog.getByRole("button", { name: "Close", exact: true });

  closeTrigger.element().focus();
  await expect.element(closeTrigger).toHaveFocus();
  await screen.user.keyboard("{Escape}");
  await expect.element(dialog).not.toBeInTheDocument();
  await expect.element(currentTrigger).toHaveFocus();
});

test("edits and deletes an ordinary pending message in one Drawer without changing the main draft", async () => {
  const view = await renderComposerTurnControl({
    scenario: { type: "activeFixture", captureEditReservations: true },
  });
  const { reservations } = view;
  const screen = view;
  const composer = view.composer();

  await composer.fill("Original queued message");
  await screen.getByRole("button", { name: "Send", exact: true }).click();
  await composer.fill("Keep this main draft");
  await screen.getByRole("button", { name: "Pending: Queued 1", exact: true }).click();
  const dialog = screen.getByRole("dialog", { name: "Pending details", exact: true });
  expect(screen.getByRole("dialog").all().length).toBe(1);

  await dialog.getByRole("button", { name: "Edit", exact: true }).click();
  const pendingEditor = screen.getByRole("combobox", {
    name: "Edit pending message",
    exact: true,
  });
  await expect.element(pendingEditor).toHaveTextContent("Original queued message");
  const firstReservation = reservations.at(0);
  if (firstReservation == null) throw new Error("first edit must begin");
  const firstCancel = vi.spyOn(firstReservation, "cancel");
  await pendingEditor.fill("Discard this edit");
  await screen.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(firstCancel).toHaveBeenCalledOnce();
  const cancelledListDialog = screen.getByRole("dialog", {
    name: "Pending details",
    exact: true,
  });
  await expect
    .element(cancelledListDialog.getByText("Original queued message", { exact: true }))
    .toBeVisible();

  await cancelledListDialog.getByRole("button", { name: "Edit", exact: true }).click();
  const escapeEditor = screen.getByRole("combobox", {
    name: "Edit pending message",
    exact: true,
  });
  const secondReservation = reservations.at(1);
  if (secondReservation == null) throw new Error("second edit must begin");
  const secondCancel = vi.spyOn(secondReservation, "cancel");
  await escapeEditor.fill("Discard this edit with Escape");
  await screen.user.keyboard("{Escape}");
  expect(secondCancel).toHaveBeenCalledOnce();
  await expect
    .element(screen.getByRole("dialog", { name: "Edit pending message", exact: true }))
    .not.toBeInTheDocument();
  const trigger = screen.getByRole("button", { name: "Pending: Queued 1", exact: true });
  await expect.element(trigger).toHaveFocus();
  await trigger.click();
  const reopenedListDialog = screen.getByRole("dialog", {
    name: "Pending details",
    exact: true,
  });
  await expect
    .element(reopenedListDialog.getByText("Original queued message", { exact: true }))
    .toBeVisible();

  await reopenedListDialog.getByRole("button", { name: "Edit", exact: true }).click();
  const restoredEditor = screen.getByRole("combobox", {
    name: "Edit pending message",
    exact: true,
  });
  await expect.element(restoredEditor).toHaveTextContent("Original queued message");
  await restoredEditor.fill("Edited queued message");
  await restoredEditor.click();
  await screen.user.keyboard("{Enter}");

  const listDialog = screen.getByRole("dialog", { name: "Pending details", exact: true });
  await expect
    .element(listDialog.getByText("Edited queued message", { exact: true }))
    .toBeVisible();
  await expect
    .poll(() => composerTextWithoutTrailingBrowserPlaceholders(composer.element()))
    .toBe("Keep this main draft");
  expect(listDialog.getByRole("alert").query()).toBeNull();

  await listDialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect
    .element(listDialog.getByText("Delete this pending message?", { exact: true }))
    .toBeVisible();
  expect(screen.getByRole("dialog").all().length).toBe(1);
  await listDialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect.element(listDialog.getByText("No pending messages", { exact: true })).toBeVisible();
  await expect.element(listDialog.getByRole("heading", { name: "Pending details" })).toHaveFocus();
  expect(listDialog.getByRole("alert").query()).toBeNull();
});

test("returns focus to the Composer when cancelling an edit synchronously drains the last pending message", async () => {
  const view = await renderComposerTurnControl({
    scenario: { type: "activeFixture", captureEditReservations: true },
  });
  const { controller, reservations } = view;
  const screen = view;
  const composer = view.composer();

  await composer.fill("Drain after cancelling edit");
  await screen.getByRole("button", { name: "Send", exact: true }).click();
  await screen.getByRole("button", { name: "Pending: Queued 1", exact: true }).click();
  await screen.getByRole("button", { name: "Edit", exact: true }).click();
  await expect
    .element(screen.getByRole("combobox", { name: "Edit pending message", exact: true }))
    .toBeVisible();
  const reservation = reservations.at(0);
  if (reservation == null) throw new Error("draining edit must begin");
  const cancel = vi.spyOn(reservation, "cancel");

  controller.observeAcceptedEvent({ notification: eventTurnCompleted, replay: "live" });
  await expect.poll(() => controller.getSnapshot().ordinaryQueuedCount).toBe(1);

  await screen.getByRole("button", { name: "Close", exact: true }).click();

  expect(cancel).toHaveBeenCalledOnce();
  await expect.poll(() => controller.getSnapshot().ordinaryQueuedCount).toBe(0);
  await expect
    .element(screen.getByRole("dialog", { name: "Edit pending message", exact: true }))
    .not.toBeInTheDocument();
  await expect.element(composer).toHaveFocus();
});

test("keeps live-owner management failures in the Drawer as an alert", async () => {
  const harness = createQueueControllerHarness(
    queueSnapshot({ ordinaryQueuedCount: 1, detailRevision: 7, canStop: true }),
    {
      ordinary: [
        pendingInputItem("ordinary-race", "ordinary", {
          type: "text",
          text: "Racing queued message",
          truncated: false,
        }),
      ],
      steer: [],
    },
  );
  const screen = await renderComposerTurnControl({
    scenario: { type: "activeFixture" },
    queue: { type: "provided", controller: harness.controller },
  });

  await screen.getByRole("button", { name: "Pending: Queued 1", exact: true }).click();
  const dialog = screen.getByRole("dialog", { name: "Pending details", exact: true });
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();

  await expect.element(dialog.getByText("Pending message changed", { exact: true })).toBeVisible();
  await expect
    .element(
      dialog.getByText(
        "This message has entered the sending process and can no longer be managed.",
        { exact: true },
      ),
    )
    .toBeVisible();
  await expect.element(dialog).toBeVisible();
  expect(harness.controller.getSnapshot().ordinaryQueuedCount).toBe(1);
});

test("keeps a last unsent steer target invalidation in the Drawer without settling its reservation", async () => {
  const commandHandle = createGuiHostCommands();
  const steerRequest = deferred<Awaited<ReturnType<GuiHostCommands["steerTurn"]>>>();
  vi.mocked(commandHandle.steerTurn).mockReturnValue(steerRequest.promise);
  const view = await renderComposerTurnControl({
    scenario: { type: "activeFixture", captureEditReservations: true },
    queue: { type: "created", commands: commandHandle },
  });
  const { controller, reservations } = view;
  const screen = view;
  const composer = view.composer();

  await composer.fill("Already issued steer");
  await screen.getByRole("button", { name: "Guide", exact: true }).click();
  await composer.fill("Still unsent steer");
  await screen.getByRole("button", { name: "Guide", exact: true }).click();
  await screen.getByRole("button", { name: "Pending: Guide 2", exact: true }).click();
  const dialog = screen.getByRole("dialog", { name: "Pending details", exact: true });

  await expect
    .element(dialog.getByText("This message has entered the sending process.", { exact: true }))
    .toBeVisible();
  expect(dialog.getByRole("button", { name: "Edit", exact: true }).all().length).toBe(1);
  expect(dialog.getByRole("button", { name: "Delete", exact: true }).all().length).toBe(1);

  await dialog.getByRole("button", { name: "Edit", exact: true }).click();
  await expect
    .element(screen.getByRole("combobox", { name: "Edit pending message", exact: true }))
    .toHaveTextContent("Still unsent steer");
  const reservation = reservations.at(0);
  if (reservation == null) throw new Error("unsent steer edit must begin");
  const save = vi.spyOn(reservation, "save");
  const cancel = vi.spyOn(reservation, "cancel");

  controller.observeAcceptedEvent({ notification: eventTurnCompleted, replay: "live" });

  await expect.poll(() => controller.getSnapshot().guidingCount).toBe(0);
  const heldDialog = screen.getByRole("dialog", { name: "Pending details", exact: true });
  await expect
    .element(heldDialog.getByText("Pending message changed", { exact: true }))
    .toBeVisible();
  await expect
    .element(
      heldDialog.getByText("The target turn closed before the edit was saved.", { exact: true }),
    )
    .toBeVisible();
  expect(save).not.toHaveBeenCalled();
  expect(cancel).not.toHaveBeenCalled();
  await expect.element(heldDialog.getByRole("heading", { name: "Pending details" })).toHaveFocus();
  await heldDialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect.element(heldDialog).not.toBeInTheDocument();
  await expect.element(composer).toHaveFocus();
  expect(save).not.toHaveBeenCalled();
  expect(cancel).not.toHaveBeenCalled();
});

test("tears down an active edit without settling its reservation when projection is unavailable", async () => {
  const commandHandle = createGuiHostCommands();
  const skillCatalog = createComposerSkillCatalogHarness();
  const view = await renderComposerTurnControl({
    scenario: { type: "activeFixture", captureEditReservations: true },
    queue: { type: "created", commands: commandHandle },
    skills: skillCatalog.controller,
  });
  const { reservations } = view;
  const screen = view;
  const composer = view.composer();

  await composer.fill("Owner-bound queued message");
  await screen.getByRole("button", { name: "Send", exact: true }).click();
  await screen.getByRole("button", { name: "Pending: Queued 1", exact: true }).click();
  await screen.getByRole("button", { name: "Edit", exact: true }).click();
  await expect
    .element(screen.getByRole("combobox", { name: "Edit pending message", exact: true }))
    .toBeVisible();
  const reservation = reservations.at(0);
  if (reservation == null) throw new Error("owner-bound edit must begin");
  const save = vi.spyOn(reservation, "save");
  const cancel = vi.spyOn(reservation, "cancel");

  const activeSnapshot = screen.sessionHarness.session.getSnapshot();
  if (activeSnapshot.phase !== "active") throw new Error("expected an active session");
  screen.sessionHarness.publish(
    screen.sessionHarness.projectionUnavailableSnapshot({
      ...activeSnapshot,
      revision: activeSnapshot.revision + 1,
      reason: "backpressure",
    }),
  );

  await expect
    .element(screen.getByRole("dialog", { name: "Edit pending message", exact: true }))
    .not.toBeInTheDocument();
  expect(save).not.toHaveBeenCalled();
  expect(cancel).not.toHaveBeenCalled();
  await expect.element(screen.composer()).toHaveFocus();
});

test("restores delete focus only to a neighbor in the same lane", async () => {
  const view = await renderComposerTurnControl({
    scenario: { type: "activeFixture" },
  });
  const screen = view;
  const composer = view.composer();

  await composer.fill("First ordinary neighbor");
  await screen.getByRole("button", { name: "Send", exact: true }).click();
  await composer.fill("Second ordinary neighbor");
  await screen.getByRole("button", { name: "Send", exact: true }).click();
  await screen.getByRole("button", { name: "Pending: Queued 2", exact: true }).click();
  const dialog = screen.getByRole("dialog", { name: "Pending details", exact: true });
  const firstItem = dialog.getByRole("group", { name: "First ordinary neighbor", exact: true });
  await firstItem.getByRole("button", { name: "Delete", exact: true }).click();
  await firstItem.getByRole("button", { name: "Delete", exact: true }).click();

  const secondItem = dialog.getByRole("group", { name: "Second ordinary neighbor", exact: true });
  await expect.element(secondItem).toHaveFocus();
  await expect
    .element(dialog.getByText("First ordinary neighbor", { exact: true }))
    .not.toBeInTheDocument();
});

test("keeps the Drawer open when a pending-input detail is missing", async () => {
  const previewText = "Missing detail preview...";
  const item = pendingInputItem("missing-detail", "steer", {
    type: "text",
    text: previewText,
    truncated: true,
  });
  const harness = createQueueControllerHarness(
    queueSnapshot({ guidingCount: 1, detailRevision: 1, canStop: true }),
    { ordinary: [], steer: [item] },
  );
  const screen = await renderComposerTurnControl({
    scenario: { type: "activeFixture" },
    queue: { type: "provided", controller: harness.controller },
  });

  await screen.getByRole("button", { name: "Pending: Guide 1", exact: true }).click();
  const dialog = screen.getByRole("dialog", { name: "Pending details", exact: true });
  const expand = dialog.getByRole("button", {
    name: `Expand pending message: ${previewText}`,
    exact: true,
  });
  await expand.click();

  await expect.element(dialog).toBeVisible();
  await expect.element(expand).toBeVisible();
  expect(harness.readPendingInputDetail).toHaveBeenCalledExactlyOnceWith({
    key: item.key,
    revision: 1,
  });
});

test("uses one pending trigger for either lane and hides it when both lanes are empty", async () => {
  const harness = createQueueControllerHarness(
    queueSnapshot({ guidingCount: 1, detailRevision: 1, canStop: true }),
    {
      ordinary: [
        pendingInputItem("ordinary-only", "ordinary", {
          type: "text",
          text: "Ordinary only",
          truncated: false,
        }),
      ],
      steer: [
        pendingInputItem("steer-only", "steer", {
          type: "text",
          text: "Guide only",
          truncated: false,
        }),
      ],
    },
  );
  const screen = await renderComposerTurnControl({
    scenario: { type: "activeFixture" },
    queue: { type: "provided", controller: harness.controller },
  });
  const region = screen.getByRole("region", { name: "Pending messages", exact: true });

  const guideTrigger = region.getByRole("button", {
    name: "Pending: Guide 1",
    exact: true,
  });
  await expect.element(guideTrigger).toBeVisible();
  await expect.element(guideTrigger).toHaveTextContent("Guide 1");
  await expect.element(guideTrigger).not.toHaveTextContent("Queued");

  harness.publish(queueSnapshot({ ordinaryQueuedCount: 1, detailRevision: 2, canStop: true }));
  const queuedTrigger = region.getByRole("button", {
    name: "Pending: Queued 1",
    exact: true,
  });
  await expect.element(queuedTrigger).toBeVisible();
  await expect.element(queuedTrigger).toHaveTextContent("Queued 1");
  await expect.element(queuedTrigger).not.toHaveTextContent("Guide");

  harness.publish(queueSnapshot({ detailRevision: 3, canStop: true }));
  await expect.element(region).not.toBeInTheDocument();
});

test("closes and clears pending details when counts become empty", async () => {
  const harness = createQueueControllerHarness(
    queueSnapshot({ ordinaryQueuedCount: 1, detailRevision: 1, canStop: true }),
    {
      ordinary: [
        pendingInputItem("ordinary-to-clear", "ordinary", {
          type: "text",
          text: "Clear this pending detail",
          truncated: false,
        }),
      ],
      steer: [],
    },
  );
  const screen = await renderComposerTurnControl({
    scenario: { type: "activeFixture" },
    queue: { type: "provided", controller: harness.controller },
  });

  await screen.getByRole("button", { name: "Pending: Queued 1", exact: true }).click();
  const dialog = screen.getByRole("dialog", { name: "Pending details", exact: true });
  await expect
    .element(dialog.getByText("Clear this pending detail", { exact: true }))
    .toBeVisible();

  harness.publish(queueSnapshot({ detailRevision: 2, canStop: true }));

  await expect.element(dialog).not.toBeInTheDocument();
  await expect
    .element(screen.getByText("Clear this pending detail", { exact: true }))
    .not.toBeInTheDocument();
  await expect.element(screen.composer()).toHaveFocus();
  await expect
    .element(screen.getByRole("region", { name: "Pending messages", exact: true }))
    .not.toBeInTheDocument();
});

test("does not reopen a closing Drawer when new pending input arrives before presence ends", async () => {
  const harness = createQueueControllerHarness(
    queueSnapshot({ ordinaryQueuedCount: 1, detailRevision: 1, canStop: true }),
    {
      ordinary: [
        pendingInputItem("ordinary-closing", "ordinary", {
          type: "text",
          text: "Closing pending detail",
          truncated: false,
        }),
      ],
      steer: [],
    },
  );
  const screen = await renderComposerTurnControl({
    scenario: { type: "activeFixture" },
    queue: { type: "provided", controller: harness.controller },
  });

  const trigger = screen.getByRole("button", { name: "Pending: Queued 1", exact: true });
  await trigger.click();
  const closingDialog = screen.getByRole("dialog", { name: "Pending details", exact: true });
  await expect
    .element(closingDialog.getByText("Closing pending detail", { exact: true }))
    .toBeVisible();

  harness.publish(queueSnapshot({ detailRevision: 2, canStop: true }));
  await expect.element(closingDialog).not.toBeInTheDocument();
  harness.replaceDetails({
    ordinary: [
      pendingInputItem("ordinary-new", "ordinary", {
        type: "text",
        text: "New pending detail",
        truncated: false,
      }),
    ],
    steer: [],
  });
  harness.publish(queueSnapshot({ ordinaryQueuedCount: 1, detailRevision: 3, canStop: true }));

  const nextTrigger = screen.getByRole("button", { name: "Pending: Queued 1", exact: true });
  await expect.element(nextTrigger).toBeVisible();
  expect(screen.getByText("New pending detail", { exact: true }).query()).toBeNull();

  await nextTrigger.click();
  const nextDialog = screen.getByRole("dialog", { name: "Pending details", exact: true });
  await expect.element(nextDialog.getByText("New pending detail", { exact: true })).toBeVisible();
});

test("replaces an open pending-input owner without leaking its cached view into the new owner", async () => {
  const queueHarness = createQueueControllerHarness(
    queueSnapshot({ ordinaryQueuedCount: 1, detailRevision: 1 }),
    {
      ordinary: [
        pendingInputItem("owner-old", "ordinary", {
          type: "text",
          text: "Old owner pending message",
          truncated: false,
        }),
      ],
      steer: [],
    },
  );
  const skillHarness = createComposerSkillCatalogHarness();
  const firstRevision = 1;
  const firstOwner = createActiveThreadSessionHarness({
    composerRole: composerRoleFor(queueHarness.controller, () => firstRevision),
    skillsRole: skillsRoleFor(skillHarness.controller),
  });
  const replacementRevision = 2;
  const replacementOwner = createActiveThreadSessionHarness({
    composerRole: composerRoleFor(queueHarness.controller, () => replacementRevision),
    skillsRole: skillsRoleFor(skillHarness.controller),
  });
  const firstSnapshot = firstOwner.activeSnapshot({
    revision: firstRevision,
    threadId,
    subscriptionId: attachResponse.subscriptionId,
    composer: queueHarness.controller.getSnapshot(),
    skills: skillHarness.controller.getSnapshot(),
  });
  const replacementSnapshot = replacementOwner.activeSnapshot({
    revision: replacementRevision,
    threadId,
    subscriptionId: attachResponse.subscriptionId,
    composer: queueHarness.controller.getSnapshot(),
    skills: skillHarness.controller.getSnapshot(),
  });
  const renderSnapshot = (snapshot: typeof firstSnapshot) => (
    <>
      <Toast.Provider placement="top" />
      <ComposerTurnControl
        authorizationToken={null}
        guardCompositionEndEnter={false}
        routeTarget={{ type: "currentTask", threadId }}
        sessionSnapshot={snapshot}
      />
    </>
  );
  const screen = await renderWithProviders(renderSnapshot(firstSnapshot));

  await screen.getByRole("button", { name: "Pending: Queued 1", exact: true }).click();
  const oldDialog = screen.getByRole("dialog", { name: "Pending details", exact: true });
  await expect
    .element(oldDialog.getByText("Old owner pending message", { exact: true }))
    .toBeVisible();

  queueHarness.replaceDetails({
    ordinary: [
      pendingInputItem("owner-new", "ordinary", {
        type: "text",
        text: "Replacement owner pending message",
        truncated: false,
      }),
    ],
    steer: [],
  });
  await screen.rerender(renderSnapshot(replacementSnapshot));

  await expect.element(oldDialog).not.toBeInTheDocument();
  const replacementTrigger = screen.getByRole("button", {
    name: "Pending: Queued 1",
    exact: true,
  });
  await expect.element(replacementTrigger).toBeVisible();
  await replacementTrigger.click();
  const replacementDialog = screen.getByRole("dialog", {
    name: "Pending details",
    exact: true,
  });
  await expect
    .element(replacementDialog.getByText("Replacement owner pending message", { exact: true }))
    .toBeVisible();
  await expect
    .element(screen.getByText("Old owner pending message", { exact: true }))
    .not.toBeInTheDocument();
});

test("keeps pending details readable while projection mutations are unavailable", async () => {
  const harness = createQueueControllerHarness(
    queueSnapshot({ guidingCount: 1, detailRevision: 1, canStop: true }),
    {
      ordinary: [],
      steer: [
        pendingInputItem("steer-owner", "steer", {
          type: "text",
          text: "Unavailable projection detail",
          truncated: false,
        }),
      ],
    },
  );
  const screen = await renderComposerTurnControl({
    scenario: { type: "activeFixture" },
    queue: { type: "provided", controller: harness.controller },
  });

  await screen.getByRole("button", { name: "Pending: Guide 1", exact: true }).click();
  const dialog = screen.getByRole("dialog", { name: "Pending details", exact: true });
  await expect
    .element(dialog.getByText("Unavailable projection detail", { exact: true }))
    .toBeVisible();
  const activeSnapshot = screen.sessionHarness.session.getSnapshot();
  if (activeSnapshot.phase !== "active") throw new Error("expected an active session");
  screen.sessionHarness.publish(
    screen.sessionHarness.projectionUnavailableSnapshot({
      ...activeSnapshot,
      revision: activeSnapshot.revision + 1,
      reason: "backpressure",
    }),
  );

  await expect.element(dialog).toBeVisible();
  await expect
    .element(dialog.getByText("Unavailable projection detail", { exact: true }))
    .toBeVisible();
  await expect.element(dialog.getByRole("button", { name: "Edit", exact: true })).toBeDisabled();
});

test("rejects a mutation callback captured from an older session revision", async () => {
  const queueHarness = createQueueControllerHarness(queueSnapshot());
  const screen = await renderComposerTurnControl({
    queue: { type: "provided", controller: queueHarness.controller },
  });
  const capturedSnapshot = screen.sessionHarness.session.getSnapshot();
  if (capturedSnapshot.phase !== "active") throw new Error("expected an active session");

  queueHarness.publish({ ...queueHarness.controller.getSnapshot() });
  const currentSnapshot = screen.sessionHarness.session.getSnapshot();
  if (currentSnapshot.phase !== "active") throw new Error("expected an active session");

  expect(
    capturedSnapshot.composerRole.submit(
      capturedSnapshot.revision,
      composerDraftCapture("stale callback"),
    ),
  ).toEqual({
    type: "unavailable",
    scope: "activeThreadSession",
    reason: "staleRevision",
    revision: currentSnapshot.revision,
  });
  expect(queueHarness.submit).not.toHaveBeenCalled();
});

test("renders Simplified Chinese guide and pending-input copy", async () => {
  const harness = createQueueControllerHarness(
    queueSnapshot({
      ordinaryQueuedCount: 2,
      guidingCount: 1,
      detailRevision: 1,
      rejectedSteers: [
        {
          key: "rejected-zh",
          preview: { type: "text", text: "然后优先发送这条", truncated: false },
          reason: "activeTurnNotSteerable",
        },
      ],
      hasUnknownSteer: true,
      canStop: true,
    }),
    {
      ordinary: [
        pendingInputItem("ordinary-zh-a", "ordinary", {
          type: "text",
          text: "普通消息一",
          truncated: false,
        }),
        pendingInputItem("ordinary-zh-b", "ordinary", {
          type: "text",
          text: "普通消息二",
          truncated: false,
        }),
      ],
      steer: [
        pendingInputItem("pending-zh", "steer", {
          type: "text",
          text: "先引导这条",
          truncated: false,
        }),
      ],
    },
  );
  const screen = await renderComposerTurnControl({
    scenario: { type: "activeFixture" },
    queue: { type: "provided", controller: harness.controller },
    locale: "zh-CN",
  });

  await expect.element(screen.getByRole("button", { name: "引导", exact: true })).toBeDisabled();
  const region = screen.getByRole("region", { name: "待处理消息", exact: true });
  const trigger = region.getByRole("button", {
    name: "待处理：引导 1，排队 2",
    exact: true,
  });
  await expect.element(trigger).toBeVisible();
  await expect.element(region.getByText("将优先发送", { exact: true })).toBeVisible();
  await expect.element(region.getByText("当前无法引导，已加入队列", { exact: true })).toBeVisible();
  await expect.element(region.getByText("引导状态未知", { exact: true })).toBeVisible();
  await trigger.click();
  const dialog = screen.getByRole("dialog", { name: "待处理详情", exact: true });
  await expect.element(dialog.getByRole("heading", { name: "引导中" })).toBeVisible();
  await expect.element(dialog.getByRole("heading", { name: "已排队" })).toBeVisible();
  const secondQueuedGroup = dialog.getByRole("group", { name: "普通消息二", exact: true });
  await expect
    .element(
      secondQueuedGroup.getByRole("button", {
        name: "上移待处理消息：普通消息二",
        exact: true,
      }),
    )
    .toBeVisible();
  await secondQueuedGroup
    .getByRole("button", {
      name: "待处理消息的更多移动选项：普通消息二",
      exact: true,
    })
    .click();
  const moveMenu = screen.getByRole("menu");
  await expect
    .element(moveMenu.getByRole("menuitem", { name: "移至队首", exact: true }))
    .toBeVisible();
  await moveMenu.getByRole("menuitem", { name: "移至队首", exact: true }).click();
  await expect
    .element(dialog.getByRole("status"))
    .toHaveTextContent("已将已排队消息移到第 1 项，共 2 项。");
});

test("recovery disables send, keeps the editor editable, and prevents duplicate recovery", async () => {
  const initialSnapshot = queueSnapshot({
    recoveryCount: 2,
    recovery: { reason: "startDefinitelyNotAccepted", count: 2 },
  });
  const harness = createQueueControllerHarness(initialSnapshot);
  harness.recover.mockImplementation(() => {
    harness.publish({ ...initialSnapshot, isRecovering: true });
    return true;
  });
  const screen = await renderComposerTurnControl({
    queue: { type: "provided", controller: harness.controller },
  });
  const composer = screen.composer();
  const recoverButton = screen.getByRole("button", { name: "Continue sending" });

  await composer.fill("Draft while recovering");
  await expect.element(composer).toHaveAttribute("contenteditable", "true");
  await expect.element(screen.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
  await expect.element(recoverButton).toHaveAccessibleDescription("2 messages have not been sent");
  await userEvent.click(recoverButton);
  await expect.element(recoverButton).toBeDisabled();

  expect(harness.recover).toHaveBeenCalledExactlyOnceWith();
  await expect
    .poll(() => composerTextWithoutTrailingBrowserPlaceholders(composer.element()))
    .toBe("Draft while recovering");
});

test("guards recovery while manual reconnect is required", async () => {
  const harness = createQueueControllerHarness(
    queueSnapshot({
      recoveryCount: 2,
      recovery: { reason: "startDefinitelyNotAccepted", count: 2 },
    }),
  );
  const screen = await renderComposerTurnControl({
    queue: { type: "provided", controller: harness.controller },
  });
  const activeSnapshot = screen.sessionHarness.session.getSnapshot();
  if (activeSnapshot.phase !== "active") throw new Error("expected an active session");
  screen.sessionHarness.publish(
    screen.sessionHarness.projectionUnavailableSnapshot({
      ...activeSnapshot,
      revision: activeSnapshot.revision + 1,
      reason: "backpressure",
    }),
  );
  const composer = screen.composer();
  const recoverButton = screen.getByRole("button", { name: "Continue sending" });

  await expect.element(composer).toHaveAttribute("contenteditable", "false");
  await expect.element(recoverButton).toBeDisabled();
});
