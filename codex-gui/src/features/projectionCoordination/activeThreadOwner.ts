import type { AppDispatch } from "@/app/store";
import {
  createComposerInputQueueCoordinator,
  type ComposerInputQueueCoordinator,
} from "@/features/composerInputQueue/composerInputQueueCoordinator";
import type { GuiHostCommands } from "@/features/guiHost/guiHostClient";
import type {
  ThreadProjectionAttachResponse,
  ThreadProjectionClosedNotification,
  ThreadProjectionDeltaNotification,
  ThreadProjectionEventNotification,
} from "@codex-protocol/v2";
import { buildLiveThreadReplacementRecord } from "./buildLiveThreadReplacementRecord";
import {
  ProjectionApplicationCoordinator,
  type ProjectionAnimationFrameScheduler,
} from "./projectionApplicationCoordinator";

export type ActiveThreadOwnerHandle = Readonly<{
  threadId: string;
  subscriptionId: string;
  projectionOwner: ProjectionApplicationCoordinator;
  queueCoordinator: ComposerInputQueueCoordinator;
}>;

type ActiveThreadOwnerCommands = Pick<GuiHostCommands, "startTurn">;

export type PreparedActiveThreadOwner = Readonly<{
  activeOwner: ActiveThreadOwnerHandle;
  commit(): boolean;
  dispose(): void;
}>;

export type ActiveThreadOwnerNotification =
  | Readonly<{ type: "event"; notification: ThreadProjectionEventNotification }>
  | Readonly<{ type: "delta"; notification: ThreadProjectionDeltaNotification }>
  | Readonly<{ type: "closed"; notification: ThreadProjectionClosedNotification }>;

export function applyActiveThreadOwnerNotification(
  activeOwner: ActiveThreadOwnerHandle,
  input: ActiveThreadOwnerNotification,
): void {
  switch (input.type) {
    case "event":
      activeOwner.projectionOwner.handleProjectionEvent(input.notification);
      break;
    case "delta":
      activeOwner.projectionOwner.handleProjectionDelta(input.notification);
      break;
    case "closed":
      activeOwner.projectionOwner.handleProjectionClosed(input.notification);
      break;
  }
}

export function prepareActiveThreadOwner({
  attachResponse,
  commands,
  dispatch,
  scheduler,
}: Readonly<{
  attachResponse: ThreadProjectionAttachResponse;
  commands: ActiveThreadOwnerCommands;
  dispatch: AppDispatch;
  scheduler: ProjectionAnimationFrameScheduler;
}>): PreparedActiveThreadOwner {
  const replacementRecord = buildLiveThreadReplacementRecord(attachResponse);
  let queueCoordinator: ComposerInputQueueCoordinator | null = null;
  const projectionOwner = new ProjectionApplicationCoordinator({
    dispatch,
    scheduler,
    acceptedEventSink: (payload) => {
      queueCoordinator?.observeAcceptedEvent(payload);
    },
  });

  try {
    queueCoordinator = createComposerInputQueueCoordinator({
      threadId: attachResponse.snapshot.thread.id,
      activeTurnId:
        attachResponse.snapshot.thread.turns
          .toReversed()
          .find((turn) => turn.status === "inProgress")?.id ?? null,
      startTurn: commands.startTurn,
    });
  } catch (error: unknown) {
    projectionOwner.dispose();
    throw error;
  }

  const activeOwner: ActiveThreadOwnerHandle = {
    threadId: attachResponse.snapshot.thread.id,
    subscriptionId: attachResponse.subscriptionId,
    projectionOwner,
    queueCoordinator,
  };
  let disposed = false;
  return {
    activeOwner,
    commit: () => projectionOwner.commitLiveThreadReplacement(replacementRecord),
    dispose: () => {
      if (disposed) {
        return;
      }
      disposed = true;
      queueCoordinator.dispose();
      projectionOwner.dispose();
    },
  };
}
