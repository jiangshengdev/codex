import type { ThreadItem, Turn } from "@codex-protocol/v2";
import type { ActiveThreadProjectionAcceptedEvent } from "./activeThreadProjectionFacts";

export type TaskCompletion = Readonly<{
  turnId: string;
  status: "completed" | "failed";
  text: string;
  error: Turn["error"];
}>;

/** Page-local live completion candidates. Execution and replay remain owned upstream. */
export class TaskCompletions {
  private readonly seen = new Set<string>();
  private readonly answers = new Map<string, string>();
  private pending: TaskCompletion | null = null;
  private received: TaskCompletion | null = null;

  rebase(turns: readonly Turn[]): void {
    this.pending = null;
    this.answers.clear();
    for (const turn of turns) {
      if (turn.status === "inProgress") {
        for (const item of turn.items) this.observeAnswer(turn.id, item);
      }
    }
  }

  observe(fact: ActiveThreadProjectionAcceptedEvent): void {
    if (fact.replay !== "live") return;
    const event = fact.notification.event;
    if (event.type === "itemCompleted") {
      this.observeAnswer(event.notification.turnId, event.notification.item);
    } else if (event.type === "turnStarted") {
      this.pending = null;
    } else if (event.type === "turnCompleted") {
      const { turn } = event.notification;
      if (this.seen.has(turn.id) || turn.status === "inProgress") return;
      this.seen.add(turn.id);
      for (const item of turn.items) this.observeAnswer(turn.id, item);
      const text = this.answers.get(turn.id) ?? "";
      this.answers.delete(turn.id);
      this.pending =
        (turn.status === "completed" || turn.status === "failed") &&
        event.goal.type === "known" &&
        event.goal.status !== "active"
          ? { turnId: turn.id, status: turn.status, text, error: turn.error }
          : null;
    }
  }

  settle(continuing: boolean): TaskCompletion | null {
    if (!continuing && this.pending != null) {
      this.received = this.pending;
      this.pending = null;
    }
    return this.received;
  }

  private observeAnswer(turnId: string, item: ThreadItem): void {
    if (
      item.type === "agentMessage" &&
      item.delivery !== "async" &&
      (item.phase === "final_answer" || item.phase == null)
    ) {
      this.answers.set(turnId, item.text);
    }
  }
}
