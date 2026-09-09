import type { GuiHostCommands } from "@/features/guiHost/guiHostClient";
import { buildTranscriptStateFromTurns } from "@/features/transcriptState/transcriptStateImplementation";
import type { TranscriptState } from "@/features/transcriptState/transcriptStateSlice";
import { createListenerSet } from "@/subscriptions/listenerSet";
import type { Thread } from "@codex-protocol/v2";

export type ThreadHistoryDetailState =
  | Readonly<{ type: "waitingForConnection" }>
  | Readonly<{ type: "loading" }>
  | Readonly<{ type: "error" | "retrying"; error: unknown }>
  | Readonly<{ type: "ready"; thread: Thread; transcriptState: TranscriptState }>;

export const initialThreadHistoryDetailState: ThreadHistoryDetailState = { type: "loading" };

type ThreadHistoryDetailOwnerOptions = Readonly<{
  threadId: string;
}>;

export class ThreadHistoryDetailOwner {
  private readonly threadId: string;
  private readThread: GuiHostCommands["readThread"] | null = null;
  private readonly listeners = createListenerSet();
  private state: ThreadHistoryDetailState = { type: "waitingForConnection" };
  private generation = 0;
  private started = false;
  private disposed = false;

  constructor({ threadId }: ThreadHistoryDetailOwnerOptions) {
    this.threadId = threadId;
  }

  readonly getSnapshot = (): ThreadHistoryDetailState => this.state;

  readonly subscribe = (listener: () => void): (() => void) => {
    if (this.disposed) {
      return () => undefined;
    }

    return this.listeners.subscribe(listener);
  };

  start(): boolean {
    if (this.started || this.disposed) {
      return false;
    }

    this.started = true;
    if (this.readThread != null) {
      this.requestThread();
    }
    return true;
  }

  setReadThread(readThread: GuiHostCommands["readThread"] | null): void {
    if (this.disposed || this.readThread === readThread) {
      return;
    }

    this.readThread = readThread;
    this.generation += 1;
    if (this.state.type === "loading" || this.state.type === "retrying") {
      this.publish({
        type: "error",
        error: new Error("Task history read was interrupted because the connection changed."),
      });
    } else if (this.started && this.state.type === "waitingForConnection" && readThread != null) {
      this.requestThread();
    }
  }

  readonly retry = (): boolean => {
    if (this.disposed || this.readThread == null || this.state.type !== "error") {
      return false;
    }

    this.requestThread();
    return true;
  };

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.generation += 1;
    this.listeners.clear();
  }

  private requestThread(): void {
    const readThread = this.readThread;
    if (readThread == null) {
      return;
    }
    const generation = ++this.generation;
    this.publish(
      this.state.type === "error"
        ? { type: "retrying", error: this.state.error }
        : initialThreadHistoryDetailState,
    );
    void readThread({ threadId: this.threadId, includeTurns: true }).then(
      (response) => {
        if (!this.canSettle(generation)) {
          return;
        }

        try {
          if (response.thread.id !== this.threadId) {
            throw new Error("thread/read returned a different thread identity");
          }

          this.publish({
            type: "ready",
            thread: response.thread,
            transcriptState: buildTranscriptStateFromTurns(response.thread.turns),
          });
        } catch (error: unknown) {
          this.publish({ type: "error", error });
        }
      },
      (error: unknown) => {
        if (this.canSettle(generation)) {
          this.publish({ type: "error", error });
        }
      },
    );
  }

  private canSettle(generation: number): boolean {
    return !this.disposed && generation === this.generation;
  }

  private publish(state: ThreadHistoryDetailState): void {
    if (this.disposed) {
      return;
    }

    this.state = state;
    this.listeners.notify();
  }
}
