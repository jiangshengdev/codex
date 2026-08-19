import type { GuiHostStatus } from "@/features/guiHost/guiHostClient";
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
  hasController: boolean;
  recoveryCount: number;
  isRecovering: boolean;
}): boolean {
  return (
    input.connectionUsable && input.hasController && input.recoveryCount > 0 && !input.isRecovering
  );
}

export function canStop(input: {
  connectionUsable: boolean;
  activeTurnId: string | null;
  isStopping: boolean;
}): boolean {
  return input.connectionUsable && input.activeTurnId != null && !input.isStopping;
}

export function errorDescription(error: unknown): string | undefined {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return undefined;
}
