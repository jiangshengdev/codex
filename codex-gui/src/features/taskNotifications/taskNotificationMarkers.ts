import { createListenerSet } from "@/subscriptions/listenerSet";

/** Page-local viewed state, independent of question answers and execution state. */
export class TaskNotificationMarkers {
  private snapshot: ReadonlySet<string> = new Set();
  private readonly listeners = createListenerSet();
  readonly subscribe = (listener: () => void) => this.listeners.subscribe(listener);
  readonly getSnapshot = () => this.snapshot;

  mark(threadId: string): void {
    if (!this.snapshot.has(threadId)) this.publish(new Set([...this.snapshot, threadId]));
  }

  viewed(threadId: string): void {
    if (!this.snapshot.has(threadId)) return;
    const next = new Set(this.snapshot);
    next.delete(threadId);
    this.publish(next);
  }

  retain(threadIds: ReadonlySet<string>): void {
    const next = new Set([...this.snapshot].filter((id) => threadIds.has(id)));
    if (next.size !== this.snapshot.size) this.publish(next);
  }

  private publish(next: ReadonlySet<string>): void {
    this.snapshot = next;
    this.listeners.notify();
  }
}
