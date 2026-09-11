import type { ActiveThreadSession } from "@/features/activeThreadSession/activeThreadSessionCollectionContracts";
import {
  isGuiHostCommandError,
  type GuiHostCommandError,
  type GuiHostCommands,
} from "@/features/guiHost/guiHostCommandGateway";
import { createListenerSet } from "@/subscriptions/listenerSet";

export type ThreadForkConnection = Readonly<{
  commands: Pick<GuiHostCommands, "forkThread">;
  session: ActiveThreadSession;
}>;

export type ThreadForkFailure = Readonly<{
  stage: "create" | "activate" | "navigate";
  delivery: GuiHostCommandError["delivery"];
  error: unknown;
}>;

export type ThreadForkRecovery = Readonly<{
  threadId: string;
  needsActivation: boolean;
  failure: ThreadForkFailure | null;
}>;

export type ThreadForkSnapshot = Readonly<{
  pending: boolean;
  sourceThreadId: string | null;
  lastTurnId: string | null;
  failure: ThreadForkFailure | null;
  recoveries: readonly ThreadForkRecovery[];
}>;

/** Retains created identities across page changes without owning source input or generation. */
export class ThreadForkOwner {
  private readonly listeners = createListenerSet();
  private snapshot: ThreadForkSnapshot = {
    pending: false,
    sourceThreadId: null,
    lastTurnId: null,
    failure: null,
    recoveries: [],
  };
  private connection: ThreadForkConnection | null = null;
  private navigationIntent: unknown;
  private generation = 0;

  private readonly navigate: (threadId: string) => void | Promise<void>;

  constructor(navigate: (threadId: string) => void | Promise<void>) {
    this.navigate = navigate;
  }

  readonly getSnapshot = (): ThreadForkSnapshot => this.snapshot;
  readonly subscribe = (listener: () => void): (() => void) => this.listeners.subscribe(listener);

  setConnection(connection: ThreadForkConnection | null): void {
    if (
      this.connection?.commands === connection?.commands &&
      this.connection?.session === connection?.session
    )
      return;
    this.connection = connection;
    this.generation += 1;
    this.publish({
      ...this.snapshot,
      recoveries: this.snapshot.recoveries.map((recovery) => ({
        ...recovery,
        needsActivation: true,
      })),
    });
  }

  setNavigation(intent: unknown): void {
    if (this.navigationIntent !== intent) this.generation += 1;
    this.navigationIntent = intent;
  }

  readonly dismissFailure = (): void => {
    this.publish({ ...this.snapshot, failure: null });
  };

  readonly fork = async (sourceThreadId: string, lastTurnId: string): Promise<void> => {
    const connection = this.connection;
    if (connection === null || this.snapshot.pending) return;
    const generation = this.generation;
    this.publish({
      ...this.snapshot,
      pending: true,
      sourceThreadId,
      lastTurnId,
      failure: null,
    });
    try {
      const response = await connection.commands.forkThread({
        threadId: sourceThreadId,
        lastTurnId,
      });
      const threadId = response.thread.id;
      // A stale response still represents a real server-side thread. Never lose that ID.
      this.updateRecovery({ threadId, needsActivation: true, failure: null });
      if (this.isCurrent(connection, generation)) {
        await this.open(threadId, connection, generation);
      }
    } catch (error) {
      this.publish({
        ...this.snapshot,
        failure: {
          stage: "create",
          delivery: isGuiHostCommandError(error) ? error.delivery : "deliveryUnknown",
          error,
        },
      });
    } finally {
      this.publish({ ...this.snapshot, pending: false });
    }
  };

  /** Continues opening an already created thread; this path never sends thread/fork. */
  readonly resume = async (threadId: string): Promise<void> => {
    const connection = this.connection;
    if (
      connection === null ||
      this.snapshot.pending ||
      !this.snapshot.recoveries.some((recovery) => recovery.threadId === threadId)
    )
      return;
    const generation = this.generation;
    this.publish({ ...this.snapshot, pending: true });
    try {
      await this.open(threadId, connection, generation);
    } finally {
      this.publish({ ...this.snapshot, pending: false });
    }
  };

  private async open(
    threadId: string,
    connection: ThreadForkConnection,
    generation: number,
  ): Promise<void> {
    let recovery = this.snapshot.recoveries.find((entry) => entry.threadId === threadId);
    if (recovery === undefined || !this.isCurrent(connection, generation)) return;
    let stage: ThreadForkFailure["stage"] = "activate";
    try {
      if (recovery.needsActivation) {
        const activation = await connection.session.activate(threadId);
        if (activation.type !== "ready" || activation.threadId !== threadId) {
          this.updateRecovery({
            ...recovery,
            failure: { stage, delivery: "definitelyNotAccepted", error: activation },
          });
          return;
        }
        // A changed connection has not activated this identity in its own session.
        if (this.connection !== connection) return;
        recovery = { ...recovery, needsActivation: false, failure: null };
        this.updateRecovery(recovery);
      }
      if (!this.isCurrent(connection, generation)) return;
      stage = "navigate";
      await this.navigate(threadId);
      // Successful navigation changes the intent itself; it must not invalidate its completion.
      this.publish({
        ...this.snapshot,
        recoveries: this.snapshot.recoveries.filter((entry) => entry.threadId !== threadId),
      });
    } catch (error) {
      const latest = this.snapshot.recoveries.find((entry) => entry.threadId === threadId);
      if (latest !== undefined) {
        this.updateRecovery({
          ...latest,
          failure: { stage, delivery: "definitelyNotAccepted", error },
        });
      }
    }
  }

  private isCurrent(connection: ThreadForkConnection, generation: number): boolean {
    return this.connection === connection && this.generation === generation;
  }

  private updateRecovery(recovery: ThreadForkRecovery): void {
    const exists = this.snapshot.recoveries.some((entry) => entry.threadId === recovery.threadId);
    this.publish({
      ...this.snapshot,
      recoveries: exists
        ? this.snapshot.recoveries.map((entry) =>
            entry.threadId === recovery.threadId ? recovery : entry,
          )
        : [...this.snapshot.recoveries, recovery],
    });
  }

  private publish(snapshot: ThreadForkSnapshot): void {
    this.snapshot = snapshot;
    this.listeners.notify();
  }
}
