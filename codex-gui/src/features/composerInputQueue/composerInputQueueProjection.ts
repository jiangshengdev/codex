import type {
  ComposerInputQueuePendingStartPhase,
  ComposerInputQueueReleaseBlocker,
  ComposerInputQueueView,
} from "./composerInputQueueContracts";
import { projectComposerInputPreview } from "./composerInputPreview";
import { copyComposerInputPayload } from "./composerInputPayload";
import type { ComposerSteerQueueState } from "./composerSteerQueueState";

export function projectComposerInputQueueView(
  queuedCount: number,
  pendingStartPhase: ComposerInputQueuePendingStartPhase | null,
  steerState: Readonly<ComposerSteerQueueState>,
): ComposerInputQueueView {
  const pendingSteers = steerState.pendingSteers.map(({ claim, phase }) => ({
    key: claim.intent.messageId,
    preview: projectComposerInputPreview(copyComposerInputPayload(claim.intent.input)),
    phase,
  }));
  const queuedSteers = steerState.steerQueue.map((intent) => ({
    key: intent.messageId,
    preview: projectComposerInputPreview(copyComposerInputPayload(intent.input)),
  }));
  const rejectedSteers = steerState.rejectedSteersQueue.map(({ intent, reason }) => ({
    key: intent.messageId,
    preview: projectComposerInputPreview(copyComposerInputPayload(intent.input)),
    reason,
  }));
  const hasUnknownSteer = pendingSteers.some(
    ({ phase }) => phase === "deliveryUnknown" || phase === "responseTurnMismatch",
  );
  const blockers: ComposerInputQueueReleaseBlocker[] = [];
  if (queuedCount > 0) {
    blockers.push({ type: "ordinaryQueued", count: queuedCount });
  }
  if (pendingStartPhase != null) {
    blockers.push({ type: "pendingStart", phase: pendingStartPhase });
  }
  if (queuedSteers.length > 0) {
    blockers.push({ type: "steerQueued", count: queuedSteers.length });
  }
  if (pendingSteers.length > 0) {
    blockers.push({
      type: "pendingSteers",
      count: pendingSteers.length,
      hasUnknown: hasUnknownSteer,
    });
  }
  if (rejectedSteers.length > 0) {
    blockers.push({ type: "rejectedSteers", count: rejectedSteers.length });
  }
  return {
    queuedCount,
    pendingSteers,
    queuedSteers,
    rejectedSteers,
    hasUnknownSteer,
    releaseState: blockers.length === 0 ? { type: "safe" } : { type: "blocked", blockers },
  };
}
