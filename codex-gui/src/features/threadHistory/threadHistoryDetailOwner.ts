import type { GuiHostCommands } from "@/features/guiHost/guiHostClient";
import { buildTranscriptStateFromTurns } from "@/features/transcriptState/transcriptStateImplementation";
import type { TranscriptState } from "@/features/transcriptState/transcriptStateSlice";
import type { Thread } from "@codex-protocol/v2";

export type ThreadHistoryDetailState =
  | Readonly<{ type: "loading" }>
  | Readonly<{ type: "error"; error: unknown }>
  | Readonly<{ type: "ready"; thread: Thread; transcriptState: TranscriptState }>;

export const initialThreadHistoryDetailState: ThreadHistoryDetailState = { type: "loading" };

type ThreadHistoryDetailOwnerOptions = Readonly<{
  threadId: string;
  readThread: GuiHostCommands["readThread"];
}>;

export class ThreadHistoryDetailOwner {
  private readonly threadId: string;
  private readonly readThread: GuiHostCommands["readThread"];
  private readonly listeners = new Set<() => void>();
  private state: ThreadHistoryDetailState = initialThreadHistoryDetailState;
  private generation = 0;
  private started = false;
  private disposed = false;

  constructor({ threadId, readThread }: ThreadHistoryDetailOwnerOptions) {
    this.threadId = threadId;
    this.readThread = readThread;
  }

  readonly getSnapshot = (): ThreadHistoryDetailState => this.state;

  readonly subscribe = (listener: () => void): (() => void) => {
    if (this.disposed) {
      return () => undefined;
    }

    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  start(): boolean {
    if (this.started || this.disposed) {
      return false;
    }

    this.started = true;
    this.requestThread();
    return true;
  }

  readonly retry = (): boolean => {
    if (this.disposed || this.state.type !== "error") {
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
    const generation = ++this.generation;
    this.publish(initialThreadHistoryDetailState);
    void this.readThread({ threadId: this.threadId, includeTurns: true }).then(
      (response) => {
        if (!this.canSettle(generation)) {
          return;
        }

        try {
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
    for (const listener of this.listeners) {
      listener();
    }
  }
}
