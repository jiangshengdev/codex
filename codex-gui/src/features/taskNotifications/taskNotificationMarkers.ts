import { createListenerSet } from "@/subscriptions/listenerSet";

export type TaskNotificationMarker = "waiting" | "finished";
export type TaskNotificationMarkerSnapshot = ReadonlyMap<
  string,
  ReadonlySet<TaskNotificationMarker>
>;

/** Page-local viewed state, independent of question answers and execution state. */
export class TaskNotificationMarkers {
  private snapshot: TaskNotificationMarkerSnapshot = new Map();
  private readonly listeners = createListenerSet();
  readonly subscribe = (listener: () => void) => this.listeners.subscribe(listener);
  readonly getSnapshot = () => this.snapshot;

  mark(threadId: string, kind: TaskNotificationMarker): void {
    const current = this.snapshot.get(threadId);
    if (current?.has(kind)) return;
    this.publish(new Map(this.snapshot).set(threadId, new Set([...(current ?? []), kind])));
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

  private publish(next: TaskNotificationMarkerSnapshot): void {
    this.snapshot = next;
    this.listeners.notify();
  }
}
