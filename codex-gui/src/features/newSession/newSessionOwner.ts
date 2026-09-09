import type { ActiveThreadSession } from "@/features/activeThreadSession/activeThreadSessionCollectionContracts";
import type {
  ComposerDraft,
  ComposerDraftCapture,
} from "@/features/composerEditor/composerEditorContracts";
import {
  isGuiHostCommandError,
  type GuiHostCommandError,
  type GuiHostCommands,
} from "@/features/guiHost/guiHostCommandGateway";
import { createListenerSet } from "@/subscriptions/listenerSet";

export type NewSessionConnection = Readonly<{
  commands: Pick<GuiHostCommands, "startThread">;
  session: ActiveThreadSession;
}>;

export type NewSessionFailure = Readonly<{
  stage: "create" | "activate" | "handoff";
  delivery: GuiHostCommandError["delivery"];
  error: unknown;
}>;

export type NewSessionSnapshot = Readonly<{
  cwd: string;
  draft: ComposerDraft | null;
  threadId: string | null;
  isInputLocked: boolean;
  phase: "editing" | "creating" | "activating" | "failed" | "handoffUnknown";
  failure: NewSessionFailure | null;
}> | null;

export type NewSessionSubmitOutcome =
  | Readonly<{ type: "accepted"; threadId: string }>
  | Readonly<{ type: "retained" }>;

/** Owns only the tab-local input until the existing session queue accepts it. */
export class NewSessionOwner {
  private readonly listeners = createListenerSet();
  private snapshot: NewSessionSnapshot = null;
  private capture: ComposerDraftCapture | null = null;
  private connection: NewSessionConnection | null = null;
  private navigationIntent: unknown;
  private onNewPage = false;
  private generation = 0;
  private pending = false;

  readonly getSnapshot = (): NewSessionSnapshot => this.snapshot;
  readonly subscribe = (listener: () => void): (() => void) => this.listeners.subscribe(listener);

  open(cwd: string | null): boolean {
    if (this.snapshot !== null) return true;
    if (!cwd) return false;
    this.publish({
      cwd,
      draft: null,
      threadId: null,
      isInputLocked: false,
      phase: "editing",
      failure: null,
    });
    return true;
  }

  saveDraft(draft: ComposerDraft): boolean {
    if (this.snapshot === null || this.pending || this.capture !== null) return false;
    this.publish({ ...this.snapshot, draft });
    return true;
  }

  setConnection(connection: NewSessionConnection | null): void {
    if (
      this.connection?.commands === connection?.commands &&
      this.connection?.session === connection?.session
    )
      return;
    this.connection = connection;
    this.generation += 1;
  }

  setNavigation(isNewPage: boolean, intent: unknown): void {
    if (this.onNewPage !== isNewPage || this.navigationIntent !== intent) this.generation += 1;
    this.onNewPage = isNewPage;
    this.navigationIntent = intent;
  }

  readonly submit = async (capture?: ComposerDraftCapture): Promise<NewSessionSubmitOutcome> => {
    const connection = this.connection;
    const draft = this.snapshot;
    if (
      draft === null ||
      connection === null ||
      !this.onNewPage ||
      this.pending ||
      draft.phase === "handoffUnknown"
    )
      return { type: "retained" };
    const input = this.capture ?? capture;
    if (input === undefined || input.textContent.trim().length === 0) return { type: "retained" };
    this.capture = input;
    this.pending = true;
    const generation = this.generation;
    const current = () =>
      this.generation === generation && this.onNewPage && this.connection === connection;
    let stage: NewSessionFailure["stage"] = "create";
    this.publish({
      ...draft,
      draft: input.draft,
      isInputLocked: true,
      phase: draft.threadId === null ? "creating" : "activating",
    });
    try {
      let threadId = draft.threadId;
      if (threadId === null) {
        const response = await connection.commands.startThread({ cwd: draft.cwd });
        threadId = response.thread.id;
        // The server identity survives a navigation or connection change while awaiting creation.
        this.publish({
          ...draft,
          draft: input.draft,
          isInputLocked: true,
          threadId,
          phase: "activating",
        });
      }
      if (!current()) return { type: "retained" };
      stage = "activate";
      const activation = await connection.session.activate(threadId);
      if (!current()) return { type: "retained" };
      if (activation.type !== "ready" || activation.threadId !== threadId) {
        this.fail(stage, activation, "definitelyNotAccepted");
        return { type: "retained" };
      }
      const target = connection.session.getSnapshot();
      if (target.phase !== "active" || target.threadId !== threadId) {
        this.fail(stage, target, "definitelyNotAccepted");
        return { type: "retained" };
      }
      const latest = connection.session.getSnapshot();
      if (
        !current() ||
        latest.phase !== "active" ||
        latest.identity.instanceId !== target.identity.instanceId ||
        latest.threadId !== threadId ||
        latest.revision !== target.revision
      )
        return { type: "retained" };
      stage = "handoff";
      const result = target.composerRole.submit(target.revision, input);
      if (result.type !== "accepted") {
        this.fail(stage, result, "definitelyNotAccepted");
        return { type: "retained" };
      }
      this.capture = null;
      this.publish(null);
      return { type: "accepted", threadId };
    } catch (error) {
      const delivery =
        stage === "handoff"
          ? "deliveryUnknown"
          : isGuiHostCommandError(error)
            ? error.delivery
            : stage === "create"
              ? "deliveryUnknown"
              : "definitelyNotAccepted";
      this.fail(stage, error, delivery);
      return { type: "retained" };
    } finally {
      this.pending = false;
      if (this.snapshot?.phase === "creating" || this.snapshot?.phase === "activating")
        this.publish({ ...this.snapshot, phase: "editing" });
    }
  };

  private fail(
    stage: NewSessionFailure["stage"],
    error: unknown,
    delivery: NewSessionFailure["delivery"],
  ): void {
    if (this.snapshot === null) return;
    this.publish({
      ...this.snapshot,
      phase: stage === "handoff" && delivery === "deliveryUnknown" ? "handoffUnknown" : "failed",
      failure: { stage, delivery, error },
    });
  }

  private publish(snapshot: NewSessionSnapshot): void {
    this.snapshot = snapshot;
    this.listeners.notify();
  }
}
