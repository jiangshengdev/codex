import type { GuiHostCommands } from "@/features/guiHost/guiHostClient";
import type { Thread } from "@codex-protocol/v2";

export type ActiveThreadStatusSnapshot = Thread["status"] | null;

export type ActiveThreadStatus = Readonly<{
  getSnapshot(): ActiveThreadStatusSnapshot;
  subscribe(listener: () => void): () => void;
  invalidate(): boolean;
  settleInvalidations(): Promise<void>;
  dispose(): void;
}>;

type CreateActiveThreadStatusInput = Readonly<{
  threadId: Thread["id"];
  initialStatus: Thread["status"];
  readThread: GuiHostCommands["readThread"];
}>;

class ActiveThreadStatusImpl implements ActiveThreadStatus {
  private readonly threadId: Thread["id"];
  private readonly readThread: GuiHostCommands["readThread"];
  private readonly listeners = new Set<() => void>();
  private snapshot: ActiveThreadStatusSnapshot;
  private generation = 0;
  private dirty = false;
  private refreshPromise: Promise<void> | null = null;
  private resolveDisposed: () => void = () => undefined;
  private readonly disposedPromise = new Promise<void>((resolve) => {
    this.resolveDisposed = resolve;
  });
  private disposed = false;

  constructor({ threadId, initialStatus, readThread }: CreateActiveThreadStatusInput) {
    this.threadId = threadId;
    this.snapshot = initialStatus;
    this.readThread = readThread;
  }

  getSnapshot = (): ActiveThreadStatusSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    if (this.disposed) return () => undefined;
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  invalidate = (): boolean => {
    if (this.disposed) return false;
    const changed = !this.dirty;
    this.dirty = true;
    void this.ensureRefresh();
    return changed;
  };

  settleInvalidations = async (): Promise<void> => {
    while (!this.disposed) {
      const refresh = this.ensureRefresh();
      if (refresh == null) return;
      await Promise.race([refresh, this.disposedPromise]);
    }
  };

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.generation += 1;
    this.dirty = false;
    this.refreshPromise = null;
    this.resolveDisposed();
    this.listeners.clear();
  }

  private ensureRefresh(): Promise<void> | null {
    if (this.disposed || !this.dirty) return this.refreshPromise;
    if (this.refreshPromise != null) return this.refreshPromise;

    const generation = this.generation;
    this.dirty = false;
    const request = this.readThread({ threadId: this.threadId, includeTurns: false }).then(
      (response) => {
        if (!this.canSettle(generation)) return;
        this.publish(response.thread.id === this.threadId ? response.thread.status : null);
      },
      () => {
        if (!this.canSettle(generation)) return;
        this.publish(null);
      },
    );
    const tracked = request.finally(() => {
      if (!this.canSettle(generation) || this.refreshPromise !== tracked) return;
      this.refreshPromise = null;
      void this.ensureRefresh();
    });
    this.refreshPromise = tracked;
    return tracked;
  }

  private canSettle(generation: number): boolean {
    return !this.disposed && generation === this.generation;
  }

  private publish(snapshot: ActiveThreadStatusSnapshot): void {
    if (threadStatusEqual(this.snapshot, snapshot)) return;
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener();
  }
}

function threadStatusEqual(
  left: ActiveThreadStatusSnapshot,
  right: ActiveThreadStatusSnapshot,
): boolean {
  if (left == null || right == null) return left === right;
  if (left.type !== right.type) return false;
  switch (left.type) {
    case "notLoaded":
    case "idle":
    case "systemError":
      return true;
    case "active":
      return (
        right.type === "active" &&
        left.activeFlags.length === right.activeFlags.length &&
        left.activeFlags.every((flag) => right.activeFlags.includes(flag))
      );
    default:
      left satisfies never;
      return false;
  }
}

export function createActiveThreadStatus(input: CreateActiveThreadStatusInput): ActiveThreadStatus {
  return new ActiveThreadStatusImpl(input);
}
