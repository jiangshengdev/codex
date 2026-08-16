import type { RequestParams, RequestResponse } from "@/features/guiHost/appServerProtocol";
import type { Thread } from "@codex-protocol/v2";

const THREAD_HISTORY_PAGE_LIMIT = 25;
const THREAD_HISTORY_REQUEST_BASE = {
  archived: false,
  limit: THREAD_HISTORY_PAGE_LIMIT,
  sortDirection: "desc",
  sortKey: "recency_at",
} satisfies Omit<RequestParams<"thread/list">, "cursor" | "cwd">;

export type ThreadHistoryListState =
  | Readonly<{ type: "initialLoading"; threads: readonly Thread[]; nextCursor: null }>
  | Readonly<{ type: "initialError"; threads: readonly Thread[]; nextCursor: null; error: unknown }>
  | Readonly<{ type: "ready"; threads: readonly Thread[]; nextCursor: string | null }>
  | Readonly<{ type: "appendLoading"; threads: readonly Thread[]; nextCursor: string }>
  | Readonly<{
      type: "appendError";
      threads: readonly Thread[];
      nextCursor: string;
      error: unknown;
    }>;

export const initialThreadHistoryListState: ThreadHistoryListState = {
  type: "initialLoading",
  threads: [],
  nextCursor: null,
};

type ListThreads = (
  params: RequestParams<"thread/list">,
) => Promise<RequestResponse<"thread/list">>;

type ThreadHistoryListOwnerOptions = Readonly<{
  cwd: string;
  listThreads: ListThreads;
}>;

export class ThreadHistoryListOwner {
  private readonly cwd: string;
  private readonly listThreads: ListThreads;
  private readonly listeners = new Set<() => void>();
  private state: ThreadHistoryListState = initialThreadHistoryListState;
  private generation = 0;
  private started = false;
  private disposed = false;

  constructor({ cwd, listThreads }: ThreadHistoryListOwnerOptions) {
    this.cwd = cwd;
    this.listThreads = listThreads;
  }

  readonly getSnapshot = (): ThreadHistoryListState => this.state;

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
    this.requestInitialPage();
    return true;
  }

  readonly loadMore = (): boolean => {
    if (this.disposed || this.state.type !== "ready" || this.state.nextCursor == null) {
      return false;
    }

    this.requestAppendPage(this.state.nextCursor);
    return true;
  };

  readonly retry = (): boolean => {
    if (this.disposed) {
      return false;
    }

    if (this.state.type === "initialError") {
      this.requestInitialPage();
      return true;
    }
    if (this.state.type === "appendError") {
      this.requestAppendPage(this.state.nextCursor);
      return true;
    }
    return false;
  };

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.generation += 1;
    this.listeners.clear();
  }

  private requestInitialPage(): void {
    this.publish(initialThreadHistoryListState);
    this.requestPage({ ...THREAD_HISTORY_REQUEST_BASE, cwd: this.cwd }, "initial");
  }

  private requestAppendPage(cursor: string): void {
    const threads = this.state.threads;
    this.publish({ type: "appendLoading", threads, nextCursor: cursor });
    this.requestPage({ ...THREAD_HISTORY_REQUEST_BASE, cursor, cwd: this.cwd }, "append");
  }

  private requestPage(params: RequestParams<"thread/list">, kind: "initial" | "append"): void {
    const generation = ++this.generation;
    void this.listThreads(params).then(
      (response) => {
        if (!this.canSettle(generation)) {
          return;
        }

        const threads =
          kind === "initial"
            ? appendUniqueThreads([], response.data)
            : appendUniqueThreads(this.state.threads, response.data);
        this.publish({ type: "ready", threads, nextCursor: response.nextCursor });
      },
      (error: unknown) => {
        if (!this.canSettle(generation)) {
          return;
        }

        if (kind === "initial") {
          this.publish({ type: "initialError", threads: [], nextCursor: null, error });
          return;
        }

        const { threads, nextCursor } = this.state;
        if (nextCursor == null) {
          return;
        }
        this.publish({ type: "appendError", threads, nextCursor, error });
      },
    );
  }

  private canSettle(generation: number): boolean {
    return !this.disposed && generation === this.generation;
  }

  private publish(state: ThreadHistoryListState): void {
    if (this.disposed) {
      return;
    }

    this.state = state;
    for (const listener of this.listeners) {
      listener();
    }
  }
}

function appendUniqueThreads(existing: readonly Thread[], incoming: readonly Thread[]): Thread[] {
  const seen = new Set(existing.map((thread) => thread.id));
  const threads = [...existing];
  for (const thread of incoming) {
    if (!seen.has(thread.id)) {
      seen.add(thread.id);
      threads.push(thread);
    }
  }
  return threads;
}
