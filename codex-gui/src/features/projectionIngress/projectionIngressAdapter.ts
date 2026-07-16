import type {
  ThreadProjectionAttachResponse,
  ThreadProjectionClosedNotification,
  ThreadProjectionDeltaNotification,
  ThreadProjectionEvent,
  ThreadProjectionEventNotification,
} from "@codex-protocol/v2";

export type ProjectionManualReconnectReason =
  | "commitChainMismatch"
  | "missingTurn"
  | "backpressure";

export type ProjectionIgnoredReason =
  | "wrongThread"
  | "staleSubscription"
  | "duplicateCommit"
  | "alreadyRequiresManualReconnect";

export type ProjectionIngressOutcome =
  | {
      type: "attachAccepted";
      response: ThreadProjectionAttachResponse;
    }
  | {
      type: "eventAccepted";
      notification: ThreadProjectionEventNotification;
    }
  | {
      type: "deltaAccepted";
      notification: ThreadProjectionDeltaNotification;
    }
  | {
      type: "manualReconnectRequired";
      reason: ProjectionManualReconnectReason;
      threadId: string;
      subscriptionId: string | null;
    }
  | {
      type: "ignored";
      reason: ProjectionIgnoredReason;
    };

type ProjectionManualReconnect = {
  reason: ProjectionManualReconnectReason;
};

type ProjectionIngressCursor = {
  threadId: string;
  subscriptionId: string | null;
  headCommitId: string | null;
  knownTurnIds: Set<string>;
  manualReconnect: ProjectionManualReconnect | null;
};

export class ProjectionIngressAdapter {
  private cursor: ProjectionIngressCursor;

  constructor(threadId: string) {
    this.cursor = {
      threadId,
      subscriptionId: null,
      headCommitId: null,
      knownTurnIds: new Set(),
      manualReconnect: null,
    };
  }

  handleAttach(response: ThreadProjectionAttachResponse): ProjectionIngressOutcome {
    const thread = response.snapshot.thread;
    if (thread.id !== this.cursor.threadId) {
      return { type: "ignored", reason: "wrongThread" };
    }

    this.cursor = {
      threadId: thread.id,
      subscriptionId: response.subscriptionId,
      headCommitId: response.snapshot.headCommitId,
      knownTurnIds: new Set(thread.turns.map((turn) => turn.id)),
      manualReconnect: null,
    };

    return { type: "attachAccepted", response };
  }

  handleEvent(notification: ThreadProjectionEventNotification): ProjectionIngressOutcome {
    const ignored = this.ignoreReasonForNotification(
      notification.threadId,
      notification.subscriptionId,
    );
    if (ignored != null) {
      return { type: "ignored", reason: ignored };
    }

    if (notification.commitId === this.cursor.headCommitId) {
      return { type: "ignored", reason: "duplicateCommit" };
    }

    if (notification.parentCommitId !== this.cursor.headCommitId) {
      return this.requireManualReconnect("commitChainMismatch");
    }

    if (this.eventIsMissingParentTurn(notification.event)) {
      return this.requireManualReconnect("missingTurn");
    }

    this.cursor.headCommitId = notification.commitId;
    this.recordKnownTurn(notification.event);

    return { type: "eventAccepted", notification };
  }

  handleDelta(notification: ThreadProjectionDeltaNotification): ProjectionIngressOutcome {
    const ignored = this.ignoreReasonForNotification(
      notification.threadId,
      notification.subscriptionId,
    );
    if (ignored != null) {
      return { type: "ignored", reason: ignored };
    }

    return { type: "deltaAccepted", notification };
  }

  handleClosed(notification: ThreadProjectionClosedNotification): ProjectionIngressOutcome {
    const ignored = this.ignoreReasonForNotification(
      notification.threadId,
      notification.subscriptionId,
    );
    if (ignored != null) {
      return { type: "ignored", reason: ignored };
    }

    return this.requireManualReconnect(notification.reason);
  }

  private ignoreReasonForNotification(
    threadId: string,
    subscriptionId: string,
  ): ProjectionIgnoredReason | null {
    if (threadId !== this.cursor.threadId) {
      return "wrongThread";
    }

    if (subscriptionId !== this.cursor.subscriptionId) {
      return "staleSubscription";
    }

    if (this.cursor.manualReconnect != null) {
      return "alreadyRequiresManualReconnect";
    }

    return null;
  }

  private requireManualReconnect(
    reason: ProjectionManualReconnectReason,
  ): ProjectionIngressOutcome {
    this.cursor.manualReconnect = { reason };

    return {
      type: "manualReconnectRequired",
      reason,
      threadId: this.cursor.threadId,
      subscriptionId: this.cursor.subscriptionId,
    };
  }

  private eventIsMissingParentTurn(event: ThreadProjectionEvent): boolean {
    switch (event.type) {
      case "turnStarted":
      case "turnCompleted":
        return false;
      case "itemStarted":
      case "itemCompleted":
        return !this.cursor.knownTurnIds.has(event.notification.turnId);
      default:
        event satisfies never;
        return false;
    }
  }

  private recordKnownTurn(event: ThreadProjectionEvent): void {
    switch (event.type) {
      case "turnStarted":
      case "turnCompleted":
        this.cursor.knownTurnIds.add(event.notification.turn.id);
        return;
      case "itemStarted":
      case "itemCompleted":
        return;
      default:
        event satisfies never;
    }
  }
}
