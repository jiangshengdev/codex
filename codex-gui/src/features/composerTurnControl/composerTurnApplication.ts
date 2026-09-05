import type {
  ActiveThreadComposerRole,
  ActiveThreadSessionSnapshot,
} from "@/features/activeThreadSession/activeThreadSession";
import type {
  ComposerEditorController,
  ComposerEditorSnapshot,
  ComposerEditorSubmitIntent,
} from "@/features/composerEditor/ComposerEditor";
import type { ComposerDraftCapture } from "@/features/composerEditor/composerEditorContracts";
import {
  canRecoverComposerQueue,
  canSend,
  composerGuideControlState,
  composerStopControlState,
  invalidSelectedSkillPaths,
  type ComposerGuideControlState,
} from "./composerTurnControlModel";

type ActiveComposerSessionSnapshot = Extract<
  ActiveThreadSessionSnapshot,
  { phase: "active" | "projectionUnavailable" }
>;

type ComposerTurnCommandRole = Pick<
  ActiveThreadComposerRole,
  "interruptActiveTurn" | "promoteOrdinaryFrontToSteer" | "recover" | "submit" | "submitSteer"
>;

export type ComposerTurnSessionFacts = Readonly<
  Pick<
    ActiveComposerSessionSnapshot,
    "activeTurnId" | "composer" | "phase" | "revision" | "skills"
  > & {
    composerRole: ComposerTurnCommandRole;
  }
>;

export type ComposerTurnControlView = Readonly<{
  operationsEnabled: boolean;
  isSubmitting: boolean;
  sendEnabled: boolean;
  guide: ComposerGuideControlState;
  recoverEnabled: boolean;
  stop: ReturnType<typeof composerStopControlState>;
  invalidSelectedSkillPaths: ReadonlySet<string>;
}>;

export type ComposerTurnCommandOutcome = Readonly<{ type: "accepted" | "ignored" }>;

export type ComposerTurnSubmitInput = Readonly<{
  session: ComposerTurnSessionFacts;
  controller: Pick<ComposerEditorController, "capture" | "clearIfCurrent">;
  capture?: ComposerDraftCapture;
  intent: ComposerEditorSubmitIntent;
}>;

export type ComposerTurnCommandInput = Readonly<{
  session: ComposerTurnSessionFacts;
}>;

export type ComposerTurnApplication = Readonly<{
  getVersion(): number;
  subscribe(listener: () => void): () => void;
  project(input: {
    session: ComposerTurnSessionFacts;
    editor: ComposerEditorSnapshot | null;
  }): ComposerTurnControlView;
  submit(input: ComposerTurnSubmitInput): ComposerTurnCommandOutcome;
  recover(input: ComposerTurnCommandInput): ComposerTurnCommandOutcome;
  stop(input: ComposerTurnCommandInput): ComposerTurnCommandOutcome;
  dispose(): void;
}>;

type ComposerTurnApplicationOptions = Readonly<{
  scheduleMicrotask?: (callback: () => void) => void;
}>;

type ProjectedSession = Readonly<{
  composerRole: ComposerTurnCommandRole;
  revision: number;
}>;

type SubmissionToken = Readonly<{
  ownerGeneration: number;
  commandGeneration: number;
}>;

class ComposerTurnApplicationImpl implements ComposerTurnApplication {
  private readonly scheduleMicrotask: (callback: () => void) => void;
  private readonly listeners = new Set<() => void>();
  private projectedSession: ProjectedSession | null = null;
  private activeSubmission: SubmissionToken | null = null;
  private ownerGeneration = 0;
  private commandGeneration = 0;
  private version = 0;
  private disposed = false;

  constructor({
    scheduleMicrotask = (callback) => {
      queueMicrotask(callback);
    },
  }: ComposerTurnApplicationOptions) {
    this.scheduleMicrotask = scheduleMicrotask;
  }

  readonly getVersion = (): number => this.version;

  readonly subscribe = (listener: () => void): (() => void) => {
    if (this.disposed) return () => undefined;
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  project({
    session,
    editor,
  }: {
    session: ComposerTurnSessionFacts;
    editor: ComposerEditorSnapshot | null;
  }): ComposerTurnControlView {
    this.observeProjection(session);
    const operationsEnabled = !this.disposed && session.phase === "active";
    const isSubmitting = this.activeSubmission != null;
    const invalidPaths = invalidSelectedSkillPaths(
      session.skills,
      editor?.selectedSkillPaths ?? [],
    );
    const selectedSkillsValid = invalidPaths.size === 0;
    const draftText = editor?.textContent ?? "";

    return {
      operationsEnabled,
      isSubmitting,
      sendEnabled: canSend({
        operationsEnabled,
        draftText,
        isSending: isSubmitting,
        recoveryCount: session.composer.recoveryCount,
        selectedSkillsValid,
      }),
      guide: composerGuideControlState({
        activeTurnId: session.activeTurnId,
        operationsEnabled,
        draftText,
        isSending: isSubmitting,
        recoveryCount: session.composer.recoveryCount,
        selectedSkillsValid,
      }),
      recoverEnabled: canRecoverComposerQueue({
        operationsEnabled,
        recoveryCount: session.composer.recoveryCount,
        isRecovering: session.composer.isRecovering,
      }),
      stop: composerStopControlState({
        operationsEnabled,
        interruptPhase: session.composer.interrupt?.phase ?? null,
        queueCanStop: session.composer.canStop,
      }),
      invalidSelectedSkillPaths: invalidPaths,
    };
  }

  submit(input: ComposerTurnSubmitInput): ComposerTurnCommandOutcome {
    const controller = input.controller;
    const capture = input.capture ?? controller.capture();
    if (!this.accepts(input.session) || this.activeSubmission != null) return ignored;

    const guide = composerGuideControlState({
      activeTurnId: input.session.activeTurnId,
      operationsEnabled: input.session.phase === "active",
      draftText: capture.textContent,
      isSending: false,
      recoveryCount: input.session.composer.recoveryCount,
      selectedSkillsValid:
        invalidSelectedSkillPaths(input.session.skills, capture.selectedSkillPaths).size === 0,
    });
    const emptyGuide = input.intent === "guide" && capture.textContent.trim().length === 0;
    const enabled =
      input.intent === "guide"
        ? guide.shortcutEnabled
        : canSend({
            operationsEnabled: input.session.phase === "active",
            draftText: capture.textContent,
            isSending: false,
            recoveryCount: input.session.composer.recoveryCount,
            selectedSkillsValid:
              invalidSelectedSkillPaths(input.session.skills, capture.selectedSkillPaths).size ===
              0,
          });
    if (!enabled) return ignored;

    const token = this.beginSubmission();
    const result = emptyGuide
      ? input.session.composerRole.promoteOrdinaryFrontToSteer(input.session.revision)
      : input.intent === "guide"
        ? input.session.composerRole.submitSteer(input.session.revision, capture)
        : input.session.composerRole.submit(input.session.revision, capture);

    const accepted = emptyGuide
      ? result === true
      : typeof result === "object" && result.type === "accepted";
    if (accepted && !emptyGuide) controller.clearIfCurrent(capture);
    this.scheduleUnlock(token);
    return accepted ? acceptedOutcome : ignored;
  }

  recover({ session }: ComposerTurnCommandInput): ComposerTurnCommandOutcome {
    if (!this.accepts(session)) return ignored;
    const enabled = canRecoverComposerQueue({
      operationsEnabled: session.phase === "active",
      recoveryCount: session.composer.recoveryCount,
      isRecovering: session.composer.isRecovering,
    });
    if (!enabled) return ignored;
    return session.composerRole.recover(session.revision) === true ? acceptedOutcome : ignored;
  }

  stop({ session }: ComposerTurnCommandInput): ComposerTurnCommandOutcome {
    if (!this.accepts(session)) return ignored;
    const control = composerStopControlState({
      operationsEnabled: session.phase === "active",
      interruptPhase: session.composer.interrupt?.phase ?? null,
      queueCanStop: session.composer.canStop,
    });
    if (!control.enabled) return ignored;
    return session.composerRole.interruptActiveTurn(session.revision) === true
      ? acceptedOutcome
      : ignored;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.ownerGeneration += 1;
    this.activeSubmission = null;
    this.projectedSession = null;
    this.version += 1;
    this.listeners.clear();
  }

  private observeProjection(session: ComposerTurnSessionFacts): void {
    if (this.disposed) return;
    if (
      this.projectedSession != null &&
      this.projectedSession.composerRole !== session.composerRole
    ) {
      this.ownerGeneration += 1;
      this.activeSubmission = null;
    }
    this.projectedSession = {
      composerRole: session.composerRole,
      revision: session.revision,
    };
  }

  private accepts(session: ComposerTurnSessionFacts): boolean {
    return (
      !this.disposed &&
      this.projectedSession?.composerRole === session.composerRole &&
      this.projectedSession.revision === session.revision
    );
  }

  private beginSubmission(): SubmissionToken {
    const token = {
      ownerGeneration: this.ownerGeneration,
      commandGeneration: ++this.commandGeneration,
    };
    this.activeSubmission = token;
    this.publish();
    return token;
  }

  private scheduleUnlock(token: SubmissionToken): void {
    this.scheduleMicrotask(() => {
      if (
        this.disposed ||
        this.activeSubmission !== token ||
        token.ownerGeneration !== this.ownerGeneration
      ) {
        return;
      }
      this.activeSubmission = null;
      this.publish();
    });
  }

  private publish(): void {
    this.version += 1;
    for (const listener of this.listeners) listener();
  }
}

const acceptedOutcome: ComposerTurnCommandOutcome = { type: "accepted" };
const ignored: ComposerTurnCommandOutcome = { type: "ignored" };

export function createComposerTurnApplication(
  options: ComposerTurnApplicationOptions = {},
): ComposerTurnApplication {
  return new ComposerTurnApplicationImpl(options);
}
