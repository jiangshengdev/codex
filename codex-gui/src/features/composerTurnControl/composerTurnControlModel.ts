import type { GuiHostStatus } from "@/features/guiHost/guiHostClient";
import type { ComposerInputQueueCoordinatorSnapshot } from "@/features/composerInputQueue/composerInputQueueCoordinator";
import type { SkillCatalogState } from "@/features/skillCatalog/skillCatalogOwner";
import type { ThreadRuntimeSubscription } from "@/features/threadRuntime/threadRuntimeSlice";

export type ComposerAvailabilityInput = {
  canAdvanceThreadIdentity: boolean;
  guiHostStatus: GuiHostStatus;
  threadId: string | null;
  subscriptionState: ThreadRuntimeSubscription["state"] | null;
};

export function isConnectionUsable(input: ComposerAvailabilityInput): boolean {
  return (
    input.canAdvanceThreadIdentity &&
    input.threadId != null &&
    input.subscriptionState === "active" &&
    input.guiHostStatus.label !== "error" &&
    input.guiHostStatus.label !== "closed"
  );
}

export function canSend(input: {
  connectionUsable: boolean;
  controllerReady: boolean;
  draftText: string;
  isSending: boolean;
  recoveryCount: number;
  selectedSkillsValid: boolean;
}): boolean {
  return (
    input.connectionUsable &&
    input.controllerReady &&
    input.draftText.trim().length > 0 &&
    !input.isSending &&
    input.recoveryCount === 0 &&
    input.selectedSkillsValid
  );
}

const noInvalidSkillPaths: ReadonlySet<string> = new Set();

export function invalidSelectedSkillPaths(
  skillCatalog: SkillCatalogState,
  selectedSkillPaths: readonly string[],
): ReadonlySet<string> {
  if (skillCatalog.type !== "ready" || skillCatalog.partialErrorCount > 0) {
    return noInvalidSkillPaths;
  }

  const availablePaths = new Set(skillCatalog.candidates.map((candidate) => candidate.path));
  const invalidPaths = new Set<string>();
  for (const path of selectedSkillPaths) {
    if (!availablePaths.has(path)) {
      invalidPaths.add(path);
    }
  }
  return invalidPaths.size === 0 ? noInvalidSkillPaths : invalidPaths;
}

export function canRecoverComposerQueue(input: {
  connectionUsable: boolean;
  controllerReady: boolean;
  recoveryCount: number;
  isRecovering: boolean;
}): boolean {
  return (
    input.connectionUsable &&
    input.controllerReady &&
    input.recoveryCount > 0 &&
    !input.isRecovering
  );
}

type ComposerInterruptPhase = NonNullable<
  ComposerInputQueueCoordinatorSnapshot["interrupt"]
>["phase"];

type ComposerStopControlState = Readonly<{
  enabled: boolean;
  failed: boolean;
  pending: boolean;
}>;

export function composerStopControlState(input: {
  connectionUsable: boolean;
  controllerMatchesCurrentThread: boolean;
  interruptPhase: ComposerInterruptPhase | null;
  queueCanStop: boolean;
}): ComposerStopControlState {
  return {
    enabled: input.connectionUsable && input.controllerMatchesCurrentThread && input.queueCanStop,
    failed:
      input.controllerMatchesCurrentThread && input.interruptPhase === "definitelyNotAccepted",
    pending:
      input.controllerMatchesCurrentThread &&
      (input.interruptPhase === "issuing" ||
        input.interruptPhase === "accepted" ||
        input.interruptPhase === "unknown"),
  };
}
