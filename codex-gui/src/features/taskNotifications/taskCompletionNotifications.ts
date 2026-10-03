import type { ThreadGoal, ThreadItem, Turn } from "@codex-protocol/v2";
import type { ActiveThreadProjectionAcceptedEvent } from "@/features/activeThreadSession/activeThreadProjectionFacts";
import { createListenerSet } from "@/subscriptions/listenerSet";

export type TaskCompletion = Readonly<{
  turnId: string;
  failed: boolean;
  preview: string;
  error: string | null;
}>;

/** Live completion candidates only. Projection snapshots restore state without notifying. */
export class TaskCompletionNotifications {
  private goal: ThreadGoal | null;
  private pending: TaskCompletion | null = null;
  private readonly seen = new Set<string>();
  private readonly received: TaskCompletion[] = [];
  private readonly listeners = createListenerSet();
  private previewTurnId: string | null = null;
  private preview = "";

  constructor(goal: ThreadGoal | null) {
    this.goal = goal;
  }

  readonly subscribe = (listener: () => void) => this.listeners.subscribe(listener);
  readonly getReceived = (): readonly TaskCompletion[] => this.received;

  rebase(goal: ThreadGoal | null, turns: readonly Turn[]): void {
    this.goal = goal;
    this.pending = null;
    this.previewTurnId = null;
    this.preview = "";
    for (const turn of turns) {
      if (turn.status !== "inProgress") this.seen.add(turn.id);
      else for (const item of turn.items) this.observeItem(turn.id, item);
    }
  }

  observe(fact: ActiveThreadProjectionAcceptedEvent, executionContinuing: boolean): void {
    const event = fact.notification.event;
    if (event.type === "goalUpdated") {
      this.goal = event.notification.goal;
      if (this.goal.status === "active") this.pending = null;
      return;
    }
    if (event.type === "goalCleared") {
      this.goal = null;
      return;
    }
    if (fact.replay !== "live") return;
    switch (event.type) {
      case "turnStarted":
        this.pending = null;
        this.previewTurnId = event.notification.turn.id;
        this.preview = "";
        break;
      case "itemCompleted":
        this.observeItem(event.notification.turnId, event.notification.item);
        break;
      case "turnCompleted": {
        const turn = event.notification.turn;
        if (this.seen.has(turn.id)) return;
        this.seen.add(turn.id);
        this.pending = null;
        if (
          (turn.status !== "completed" && turn.status !== "failed") ||
          this.goal?.status === "active"
        )
          return;
        for (const item of turn.items) this.observeItem(turn.id, item);
        this.pending = {
          turnId: turn.id,
          failed: turn.status === "failed",
          preview: this.previewTurnId === turn.id ? this.preview : "",
          error: turn.error?.message ?? null,
        };
        this.settle(executionContinuing);
        break;
      }
      case "itemStarted":
      case "tokenUsageUpdated":
        break;
      default:
        event satisfies never;
    }
  }

  settle(executionContinuing: boolean): void {
    if (executionContinuing || this.pending == null) return;
    const completion = this.pending;
    this.pending = null;
    if (this.goal?.status === "active") return;
    this.received.push(completion);
    this.listeners.notify();
  }

  private observeItem(turnId: string, item: ThreadItem): void {
    if (item.type !== "agentMessage" || item.phase !== "final_answer" || item.delivery === "async")
      return;
    this.previewTurnId = turnId;
    this.preview = notificationPreview(item.text, 200);
  }
}

export function notificationPreview(text: string, limit: number): string {
  return Array.from(
    new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(
      text.replace(/\s+/gu, " ").trim(),
    ),
  )
    .slice(0, limit)
    .map((part) => part.segment)
    .join("");
}
