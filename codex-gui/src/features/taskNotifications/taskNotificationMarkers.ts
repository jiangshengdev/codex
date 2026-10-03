import { createListenerSet } from "@/subscriptions/listenerSet";

export type TaskNotificationMarker = Readonly<{ waiting: boolean; finished: boolean }>;

/** Page-local viewed state, independent of question answers and execution state. */
export class TaskNotificationMarkers {
  private snapshot: ReadonlyMap<string, TaskNotificationMarker> = new Map();
  private readonly listeners = createListenerSet();
  readonly subscribe = (listener: () => void) => this.listeners.subscribe(listener);
  readonly getSnapshot = () => this.snapshot;

  mark(threadId: string, kind: keyof TaskNotificationMarker): void {
    const previous = this.snapshot.get(threadId) ?? { waiting: false, finished: false };
    if (previous[kind]) return;
    this.publish(new Map(this.snapshot).set(threadId, { ...previous, [kind]: true }));
  }

  viewed(threadId: string): void {
    if (!this.snapshot.has(threadId)) return;
    const next = new Map(this.snapshot);
    next.delete(threadId);
    this.publish(next);
  }

  retain(threadIds: ReadonlySet<string>): void {
    const next = new Map([...this.snapshot].filter(([id]) => threadIds.has(id)));
    if (next.size !== this.snapshot.size) this.publish(next);
  }

  private publish(next: ReadonlyMap<string, TaskNotificationMarker>): void {
    this.snapshot = next;
    this.listeners.notify();
  }
}
