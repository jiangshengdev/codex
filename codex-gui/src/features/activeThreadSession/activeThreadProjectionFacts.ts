import type { ProjectionManualReconnectReason } from "@/features/projectionIngress/projectionIngressAdapter";
import type {
  ThreadProjectionAttachResponse,
  ThreadProjectionDeltaNotification,
  ThreadProjectionEventNotification,
} from "@codex-protocol/v2";

export type ActiveThreadProjectionEventReplay = "live" | "snapshotDuplicate";

export type ActiveThreadProjectionAcceptedEvent = Readonly<{
  notification: ThreadProjectionEventNotification;
  replay: ActiveThreadProjectionEventReplay;
}>;

export type ActiveThreadProjectionReadModelFact =
  | Readonly<{
      type: "baselineAttached";
      response: ThreadProjectionAttachResponse;
    }>
  | Readonly<{
      type: "deltasAccepted";
      notifications: readonly ThreadProjectionDeltaNotification[];
    }>
  | Readonly<{
      type: "eventAccepted";
      payload: ActiveThreadProjectionAcceptedEvent;
    }>
  | Readonly<{
      type: "projectionUnavailable";
      reason: ProjectionManualReconnectReason;
      threadId: string;
      subscriptionId: string | null;
    }>;
