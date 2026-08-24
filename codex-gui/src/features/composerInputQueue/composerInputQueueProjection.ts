import type {
  ComposerInputQueuePendingStartPhase,
  ComposerInputQueueReleaseBlocker,
  ComposerInputQueueView,
} from "./composerInputQueueContracts";
import { projectComposerInputPreview } from "./composerInputPreview";
import { copyComposerInputPayload } from "./composerInputPayload";
import type { ComposerSteerQueueOverview } from "./composerSteerQueueState";

export function projectComposerInputQueueView(
  ordinaryQueuedCount: number,
  pendingStartPhase: ComposerInputQueuePendingStartPhase | null,
  steerOverview: ComposerSteerQueueOverview,
  detailRevision: number,
): ComposerInputQueueView {
  const rejectedSteers = steerOverview.rejectedSteersQueue.map(({ intent, reason }) => ({
    key: intent.message.id,
    preview: projectComposerInputPreview(copyComposerInputPayload(intent.message.input)),
    reason,
  }));
  const blockers: ComposerInputQueueReleaseBlocker[] = [];
  if (ordinaryQueuedCount > 0) {
    blockers.push({ type: "ordinaryQueued", count: ordinaryQueuedCount });
  }
  if (pendingStartPhase != null) {
    blockers.push({ type: "pendingStart", phase: pendingStartPhase });
  }
  if (steerOverview.queuedCount > 0) {
    blockers.push({ type: "steerQueued", count: steerOverview.queuedCount });
  }
  if (steerOverview.pendingCount > 0) {
    blockers.push({
      type: "pendingSteers",
      count: steerOverview.pendingCount,
      hasUnknown: steerOverview.hasUnknown,
    });
  }
  if (rejectedSteers.length > 0) {
    blockers.push({ type: "rejectedSteers", count: rejectedSteers.length });
  }
  return {
    ordinaryQueuedCount,
    guidingCount: steerOverview.pendingCount + steerOverview.queuedCount,
    detailRevision,
    rejectedSteers,
    hasUnknownSteer: steerOverview.hasUnknown,
    releaseState: blockers.length === 0 ? { type: "safe" } : { type: "blocked", blockers },
  };
}
