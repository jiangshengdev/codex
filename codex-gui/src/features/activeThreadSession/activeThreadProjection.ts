import {
  ProjectionIngressAdapter,
  type ProjectionIgnoredReason,
  type ProjectionManualReconnectReason,
} from "@/features/projectionIngress/projectionIngressAdapter";
import {
  replayForProjectionEvent,
  snapshotReplayIndexFromTurns,
} from "./activeThreadProjectionReplay";
import type {
  ActiveThreadProjectionAcceptedEvent,
  ActiveThreadProjectionReadModelFact,
} from "./activeThreadProjectionFacts";
import type {
  ThreadProjectionAttachResponse,
  ThreadProjectionClosedNotification,
  ThreadProjectionDeltaNotification,
  ThreadProjectionEventNotification,
} from "@codex-protocol/v2";

export type ActiveThreadProjectionStagedBatch = Readonly<{
  readModelFacts: readonly ActiveThreadProjectionReadModelFact[];
  acceptedQueueFacts: readonly ActiveThreadProjectionAcceptedEvent[];
}>;

export type ActiveThreadProjectionInputOutcome =
  | Readonly<{ type: "accepted" }>
  | Readonly<{ type: "ignored"; reason: ProjectionIgnoredReason }>
  | Readonly<{
      type: "projectionUnavailable";
      reason: ProjectionManualReconnectReason;
    }>;

export type ActiveThreadProjection = Readonly<{
  threadId: string;
  subscriptionId: string;
  handleEvent(notification: ThreadProjectionEventNotification): ActiveThreadProjectionInputOutcome;
  handleDelta(notification: ThreadProjectionDeltaNotification): ActiveThreadProjectionInputOutcome;
  handleClosed(
    notification: ThreadProjectionClosedNotification,
  ): ActiveThreadProjectionInputOutcome;
  flush(): ActiveThreadProjectionStagedBatch;
}>;

type CreateActiveThreadProjectionInput = Readonly<{
  threadId: string;
  attachResponse: ThreadProjectionAttachResponse;
}>;

class ActiveThreadProjectionImpl implements ActiveThreadProjection {
  readonly threadId: string;
  readonly subscriptionId: string;
  private readonly ingress: ProjectionIngressAdapter;
  private readonly snapshotReplayIndex;
  private readModelFacts: ActiveThreadProjectionReadModelFact[];
  private acceptedQueueFacts: ActiveThreadProjectionAcceptedEvent[] = [];
  private pendingDeltas: ThreadProjectionDeltaNotification[] = [];

  constructor({ threadId, attachResponse }: CreateActiveThreadProjectionInput) {
    this.threadId = threadId;
    this.subscriptionId = attachResponse.subscriptionId;
    this.ingress = new ProjectionIngressAdapter(threadId);
    const attachOutcome = this.ingress.handleAttach(attachResponse);
    if (attachOutcome.type !== "attachAccepted") {
      throw new Error("Active thread projection attach did not match the candidate thread");
    }
    this.snapshotReplayIndex = snapshotReplayIndexFromTurns(
      attachOutcome.response.snapshot.thread.turns,
    );
    this.readModelFacts = [
      {
        type: "baselineAttached",
        response: attachOutcome.response,
      },
    ];
  }

  handleEvent(notification: ThreadProjectionEventNotification): ActiveThreadProjectionInputOutcome {
    const outcome = this.ingress.handleEvent(notification);
    switch (outcome.type) {
      case "eventAccepted": {
        this.flushPendingDeltas();
        const payload: ActiveThreadProjectionAcceptedEvent = {
          notification: outcome.notification,
          replay: replayForProjectionEvent(this.snapshotReplayIndex, outcome.notification),
        };
        this.readModelFacts.push({ type: "eventAccepted", payload });
        this.acceptedQueueFacts.push(payload);
        return { type: "accepted" };
      }
      case "manualReconnectRequired":
        return this.stageProjectionUnavailable(outcome);
      case "ignored":
        return outcome;
      case "attachAccepted":
      case "deltaAccepted":
        throw new Error("Projection ingress returned an invalid event outcome");
    }
  }

  handleDelta(notification: ThreadProjectionDeltaNotification): ActiveThreadProjectionInputOutcome {
    const outcome = this.ingress.handleDelta(notification);
    switch (outcome.type) {
      case "deltaAccepted":
        this.pendingDeltas.push(outcome.notification);
        return { type: "accepted" };
      case "manualReconnectRequired":
        return this.stageProjectionUnavailable(outcome);
      case "ignored":
        return outcome;
      case "attachAccepted":
      case "eventAccepted":
        throw new Error("Projection ingress returned an invalid delta outcome");
    }
  }

  handleClosed(
    notification: ThreadProjectionClosedNotification,
  ): ActiveThreadProjectionInputOutcome {
    const outcome = this.ingress.handleClosed(notification);
    switch (outcome.type) {
      case "manualReconnectRequired":
        return this.stageProjectionUnavailable(outcome);
      case "ignored":
        return outcome;
      case "attachAccepted":
      case "eventAccepted":
      case "deltaAccepted":
        throw new Error("Projection ingress returned an invalid closed outcome");
    }
  }

  flush(): ActiveThreadProjectionStagedBatch {
    this.flushPendingDeltas();
    const batch = {
      readModelFacts: this.readModelFacts,
      acceptedQueueFacts: this.acceptedQueueFacts,
    };
    this.readModelFacts = [];
    this.acceptedQueueFacts = [];
    return batch;
  }

  private flushPendingDeltas(): void {
    if (this.pendingDeltas.length === 0) {
      return;
    }
    const notifications = this.pendingDeltas;
    this.pendingDeltas = [];
    this.readModelFacts.push({ type: "deltasAccepted", notifications });
  }

  private stageProjectionUnavailable(
    outcome: Extract<
      ReturnType<ProjectionIngressAdapter["handleClosed"]>,
      { type: "manualReconnectRequired" }
    >,
  ): ActiveThreadProjectionInputOutcome {
    this.flushPendingDeltas();
    this.readModelFacts.push({
      type: "projectionUnavailable",
      reason: outcome.reason,
      threadId: outcome.threadId,
      subscriptionId: outcome.subscriptionId,
    });
    return { type: "projectionUnavailable", reason: outcome.reason };
  }
}

export function createActiveThreadProjection(
  input: CreateActiveThreadProjectionInput,
): ActiveThreadProjection {
  return new ActiveThreadProjectionImpl(input);
}
