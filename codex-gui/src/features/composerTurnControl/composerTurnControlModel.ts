import type { ComposerInputQueueCoordinatorSnapshot } from "@/features/composerInputQueue/composerInputQueueCoordinator";
import type { SkillCatalogState } from "@/features/skillCatalog/skillCatalogOwner";

export function canSend(input: {
  operationsEnabled: boolean;
  draftText: string;
  isSending: boolean;
  recoveryCount: number;
  selectedSkillsValid: boolean;
}): boolean {
  return (
    input.operationsEnabled &&
    input.draftText.trim().length > 0 &&
    !input.isSending &&
    input.recoveryCount === 0 &&
    input.selectedSkillsValid
  );
}

export type ComposerGuideControlState = Readonly<{
  visible: boolean;
  buttonEnabled: boolean;
  shortcutEnabled: boolean;
}>;

export function composerGuideControlState(input: {
  activeTurnId: string | null;
  operationsEnabled: boolean;
  draftText: string;
  isSending: boolean;
  recoveryCount: number;
  selectedSkillsValid: boolean;
}): ComposerGuideControlState {
  const visible = input.activeTurnId != null;
  const operationEnabled =
    visible && input.operationsEnabled && !input.isSending && input.recoveryCount === 0;
  const hasDraft = input.draftText.trim().length > 0;
  return {
    visible,
    buttonEnabled: operationEnabled && hasDraft && input.selectedSkillsValid,
    shortcutEnabled: operationEnabled && (!hasDraft || input.selectedSkillsValid),
  };
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
  operationsEnabled: boolean;
  recoveryCount: number;
  isRecovering: boolean;
}): boolean {
  return input.operationsEnabled && input.recoveryCount > 0 && !input.isRecovering;
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
  operationsEnabled: boolean;
  interruptPhase: ComposerInterruptPhase | null;
  queueCanStop: boolean;
}): ComposerStopControlState {
  return {
    enabled: input.operationsEnabled && input.queueCanStop,
    failed: input.interruptPhase === "definitelyNotAccepted",
    pending:
      input.interruptPhase === "issuing" ||
      input.interruptPhase === "accepted" ||
      input.interruptPhase === "unknown",
  };
}
