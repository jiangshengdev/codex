import { Toast } from "@heroui/react";
import { createPersistenceTestContext } from "@/features/composerInputQueue/__tests__/composerInputQueueCoordinatorTestFixtures";
import type { Turn } from "@codex-protocol/v2";
import { StrictMode, useSyncExternalStore } from "react";
import { vi } from "vitest";

import { createGuiHostCommands } from "@/__tests__/appBrowserTestSupport";
import {
  createActiveThreadSessionHarness,
  type ActiveThreadSessionHarness,
} from "@/features/activeThreadSession/__tests__/activeThreadSessionHarness";
import type { ActiveThreadProjectionReadModelFact } from "@/features/activeThreadSession/activeThreadProjectionFacts";
import {
  activeThreadReadModelSlotCreated,
  activeThreadReadModelTransitionApplied,
} from "@/features/activeThreadSession/activeThreadSessionReadModel";
import { createActiveThreadSessionIdentity } from "@/features/activeThreadSession/activeThreadSessionIdentity";
import type {
  ActiveThreadComposerRole,
  ActiveThreadSession,
  ActiveThreadSkillsRole,
} from "@/features/activeThreadSession/activeThreadSession";
import {
  createComposerInputQueueCoordinator,
  type ComposerInputQueueCoordinator,
  type ComposerPendingInputCoordinatorEditReservation,
} from "@/features/composerInputQueue/composerInputQueueCoordinator";
import type { GuiHostCommands } from "@/features/guiHost/guiHostClient";
import {
  attachBaseline,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
import type { SkillCatalogState } from "@/features/skillCatalog/skillCatalogOwner";
import type { AppLocale } from "@/i18n";
import { renderWithProviders } from "@/utils/test-utils";

import { ComposerTurnControl } from "../ComposerTurnControl";
import { ComposerPendingInputProvider } from "../ComposerPendingInputProvider";

const attachResponse = attachBaseline;
const threadId = attachResponse.snapshot.thread.id;

const readyEmptySkillCatalog: SkillCatalogState = {
  type: "ready",
  candidates: [],
  partialErrorCount: 0,
};

export type ComposerSkillCatalogHarnessController = Readonly<{
  getSnapshot(): SkillCatalogState;
  subscribe(listener: () => void): () => void;
  invalidate(): boolean;
  retry(): boolean;
}>;

export type ComposerSkillCatalogHarness = Readonly<{
  controller: ComposerSkillCatalogHarnessController;
  publish(next: SkillCatalogState): void;
}>;

export const createComposerSkillCatalogHarness = (
  initial: SkillCatalogState = readyEmptySkillCatalog,
): ComposerSkillCatalogHarness => {
  let snapshot = initial;
  const listeners = new Set<() => void>();
  const controller = {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    invalidate: vi.fn<ComposerSkillCatalogHarnessController["invalidate"]>().mockReturnValue(true),
    retry: vi.fn<ComposerSkillCatalogHarnessController["retry"]>().mockReturnValue(true),
  } satisfies ComposerSkillCatalogHarnessController;

  return {
    controller,
    publish(next: SkillCatalogState): void {
      snapshot = next;
      for (const listener of listeners) listener();
    },
  };
};

const staleSessionOperation = (revision: number) =>
  ({
    type: "unavailable",
    scope: "activeThreadSession",
    reason: "staleRevision",
    revision,
  }) as const;

const composerRoleFor = (
  controller: ComposerInputQueueCoordinator,
  getRevision: () => number,
): Partial<ActiveThreadComposerRole> => ({
  getDraft: controller.getDraft,
  saveDraft: (revision, draft) =>
    revision === getRevision() ? controller.saveDraft(draft) : staleSessionOperation(getRevision()),
  retryPersistence: (revision) =>
    revision === getRevision()
      ? controller.retryPersistence()
      : staleSessionOperation(getRevision()),
  resumeRestored: (revision, persistenceRevision) =>
    revision === getRevision()
      ? controller.resumeRestored(persistenceRevision)
      : staleSessionOperation(getRevision()),
  discardUnknown: (revision, id, persistenceRevision) =>
    revision === getRevision()
      ? controller.discardUnknown(id, persistenceRevision)
      : staleSessionOperation(getRevision()),
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

const skillsRoleFor = (
  controller: ComposerSkillCatalogHarnessController,
): Partial<ActiveThreadSkillsRole> => ({
  invalidateSkills: () => controller.invalidate(),
  refreshSkills: () => controller.invalidate(),
  retrySkills: () => controller.retry(),
});

const capturePendingInputEditReservations = (
  controller: ComposerInputQueueCoordinator,
): ComposerPendingInputCoordinatorEditReservation[] => {
  const reservations: ComposerPendingInputCoordinatorEditReservation[] = [];
  const beginPendingInputEdit = controller.beginPendingInputEdit;
  vi.spyOn(controller, "beginPendingInputEdit").mockImplementation((request, restore) => {
    const result = beginPendingInputEdit(request, restore);
    if (result.type === "begun") reservations.push(result.reservation);
    return result;
  });
  return reservations;
};

type RenderComposerTurnControlScenario =
  | Readonly<{ type: "idle" }>
  | Readonly<{ type: "activeFixture"; captureEditReservations?: boolean }>;

type RenderComposerTurnControlQueue =
  | Readonly<{ type: "created"; commands?: GuiHostCommands }>
  | Readonly<{ type: "provided"; controller: ComposerInputQueueCoordinator }>;

export type RenderComposerTurnControlOptions = Readonly<{
  scenario?: RenderComposerTurnControlScenario;
  queue?: RenderComposerTurnControlQueue;
  skills?: ComposerSkillCatalogHarnessController;
  locale?: AppLocale;
  guardCompositionEndEnter?: boolean;
  strictMode?: boolean;
}>;

type BrowserRenderResult = Awaited<ReturnType<typeof renderWithProviders>>;

export type RenderedComposerTurnControl = BrowserRenderResult &
  Readonly<{
    composer(name?: string): ReturnType<BrowserRenderResult["getByRole"]>;
    controller: ComposerInputQueueCoordinator;
    dispatchProjectionFacts(facts: readonly ActiveThreadProjectionReadModelFact[]): void;
    reservations: readonly ComposerPendingInputCoordinatorEditReservation[];
    sessionHarness: ActiveThreadSessionHarness;
    skillCatalogController: ComposerSkillCatalogHarnessController;
    turn: Turn;
  }>;

export async function renderComposerTurnControl({
  scenario = { type: "idle" },
  queue = { type: "created" },
  skills = createComposerSkillCatalogHarness().controller,
  locale = "en",
  guardCompositionEndEnter = false,
  strictMode = false,
}: RenderComposerTurnControlOptions = {}): Promise<RenderedComposerTurnControl> {
  function SessionComposerTurnControl({
    guardCompositionEndEnter,
    session,
  }: Readonly<{
    guardCompositionEndEnter: boolean;
    session: ActiveThreadSession;
  }>) {
    const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot);
    if (snapshot.phase !== "active" && snapshot.phase !== "projectionUnavailable") return null;
    return (
      <ComposerTurnControl
        authorizationToken={null}
        guardCompositionEndEnter={guardCompositionEndEnter}
        routeTarget={{ type: "currentTask", threadId }}
        sessionSnapshot={snapshot}
      />
    );
  }

  if (eventTurnStarted.event.type !== "turnStarted") {
    throw new Error("fixture must be turnStarted");
  }
  const turn = eventTurnStarted.event.notification.turn;
  const activeTurn = scenario.type === "activeFixture" ? turn : null;
  let controller: ComposerInputQueueCoordinator;
  if (queue.type === "provided") {
    controller = queue.controller;
  } else {
    const commands = queue.commands ?? createGuiHostCommands();
    controller = createComposerInputQueueCoordinator({
      persistence: createPersistenceTestContext(),
      threadId,
      activeTurnId: activeTurn?.id ?? null,
      startTurn: commands.startTurn,
      steerTurn: commands.steerTurn,
      interruptTurn: commands.interruptTurn,
    });
  }
  if (controller.ownerThreadId !== threadId) {
    throw new Error("queue controller must belong to the attached thread");
  }
  if (controller.getSnapshot().canStop !== (activeTurn != null)) {
    throw new Error("queue controller and scenario must agree on the active turn");
  }
  const reservations =
    scenario.type === "activeFixture" && scenario.captureEditReservations === true
      ? capturePendingInputEditReservations(controller)
      : [];
  let revision = 1;
  const identity = createActiveThreadSessionIdentity(threadId);
  const sessionHarness = createActiveThreadSessionHarness({
    composerRole: composerRoleFor(controller, () => revision),
    skillsRole: skillsRoleFor(skills),
  });
  sessionHarness.session.subscribe(() => {
    revision = sessionHarness.session.getSnapshot().revision;
  });
  const publishActiveSnapshot = (): void => {
    revision += 1;
    sessionHarness.publish(
      sessionHarness.activeSnapshot({
        identity,
        revision,
        threadId,
        subscriptionId: attachResponse.subscriptionId,
        activeTurnId: activeTurn?.id ?? null,
        composer: controller.getSnapshot(),
        skills: skills.getSnapshot(),
      }),
    );
  };
  sessionHarness.publish(
    sessionHarness.activeSnapshot({
      identity,
      revision,
      threadId,
      subscriptionId: attachResponse.subscriptionId,
      activeTurnId: activeTurn?.id ?? null,
      composer: controller.getSnapshot(),
      skills: skills.getSnapshot(),
    }),
  );
  controller.subscribe(publishActiveSnapshot);
  skills.subscribe(publishActiveSnapshot);
  const app = (
    <ComposerPendingInputProvider>
      <Toast.Provider placement="top" />
      <SessionComposerTurnControl
        guardCompositionEndEnter={guardCompositionEndEnter}
        session={sessionHarness.session}
      />
    </ComposerPendingInputProvider>
  );
  const screen = await renderWithProviders(strictMode ? <StrictMode>{app}</StrictMode> : app, {
    locale,
  });
  screen.store.dispatch(activeThreadReadModelSlotCreated(identity));
  const dispatchProjectionFacts = (facts: readonly ActiveThreadProjectionReadModelFact[]): void => {
    const sessionRevision =
      (screen.store.getState().threadRuntime.byThreadId[threadId]?.sessionRevision ?? 0) + 1;
    screen.store.dispatch(
      activeThreadReadModelTransitionApplied({ identity, sessionRevision, facts }),
    );
  };
  dispatchProjectionFacts([{ type: "baselineAttached", response: attachResponse }]);
  return {
    ...screen,
    composer: (name = "Message Codex") => screen.getByRole("combobox", { name, exact: true }),
    controller,
    dispatchProjectionFacts,
    reservations,
    sessionHarness,
    skillCatalogController: skills,
    turn,
  };
}

export const getComposerPanel = (screen: RenderedComposerTurnControl): HTMLElement => {
  const composerPanel = screen.container.querySelector(".composer-panel");
  if (!(composerPanel instanceof HTMLElement)) {
    throw new Error("composer panel must render");
  }
  return composerPanel;
};
