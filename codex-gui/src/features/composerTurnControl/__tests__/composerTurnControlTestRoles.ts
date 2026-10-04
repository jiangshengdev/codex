import type { ActiveThreadComposerRole } from "@/features/activeThreadSession/activeThreadSession";
import type { ComposerInputQueueCoordinator } from "@/features/composerInputQueue/composerInputQueueCoordinator";

const staleSessionOperation = (revision: number) =>
  ({
    type: "unavailable",
    scope: "activeThreadSession",
    reason: "staleRevision",
    revision,
  }) as const;

export const createPendingInputComposerRole = (
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

export const createComposerRole = (
  controller: ComposerInputQueueCoordinator,
  getRevision: () => number,
): Partial<ActiveThreadComposerRole> => ({
  getDraft: controller.getDraft,
  retainDraft: controller.retainDraft,
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
  ...createPendingInputComposerRole(controller, getRevision),
});
