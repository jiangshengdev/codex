import type {
  ThreadItem,
  ThreadProjectionAttachResponse,
  ThreadProjectionClosedNotification,
  ThreadProjectionDeltaNotification,
  ThreadProjectionEventNotification,
  Turn,
  UserInput,
} from "@codex-protocol/v2";

export const textInput = (text: string): UserInput => ({
  type: "text",
  text,
  text_elements: [],
});

export const imageInput = (url: string): UserInput => ({
  type: "image",
  url,
});

export const audioInput = (url: string): UserInput => ({
  type: "audio",
  url,
});

export const localAudioInput = (path: string): UserInput => ({
  type: "localAudio",
  path,
});

export const userMessage = (id: string, content: UserInput[]): ThreadItem => ({
  type: "userMessage",
  id,
  clientId: null,
  content,
});

type AgentMessagePhase = Extract<ThreadItem, { type: "agentMessage" }>["phase"];

export const agentMessage = (
  id: string,
  text: string,
  phase: AgentMessagePhase = "final_answer",
): ThreadItem => ({
  type: "agentMessage",
  id,
  text,
  phase,
  memoryCitation: null,
});

type ReasoningItem = Extract<ThreadItem, { type: "reasoning" }>;

export const reasoningItem = (
  id: string,
  summary: ReasoningItem["summary"],
  content: ReasoningItem["content"] = [],
): ReasoningItem => ({
  type: "reasoning",
  id,
  summary,
  content,
});

export const planItem = (id: string): ThreadItem => ({
  type: "plan",
  id,
  text: "Hidden plan text",
});

export const sleepItem = (id: string): ThreadItem => ({
  type: "sleep",
  id,
  durationMs: 1000,
});

type ContextCompactionItem = Extract<ThreadItem, { type: "contextCompaction" }>;

export const contextCompaction = (id: string): ContextCompactionItem => ({
  type: "contextCompaction",
  id,
});

type SubAgentActivityItem = Extract<ThreadItem, { type: "subAgentActivity" }>;

export const subAgentActivity = (
  id: string,
  kind: SubAgentActivityItem["kind"],
  agentPath: string,
  overrides: Partial<Pick<SubAgentActivityItem, "agentThreadId">> = {},
): SubAgentActivityItem => ({
  type: "subAgentActivity",
  id,
  kind,
  agentThreadId: "agent-thread-id",
  agentPath,
  ...overrides,
});

type CollabAgentToolCallItem = Extract<ThreadItem, { type: "collabAgentToolCall" }>;
type CollabAgentToolCallOverrides = Partial<
  Omit<CollabAgentToolCallItem, "type" | "id" | "tool" | "status">
>;
type CollabAgentState = NonNullable<CollabAgentToolCallItem["agentsStates"][string]>;

export const collabAgentState = (
  status: CollabAgentState["status"],
  message: CollabAgentState["message"] = null,
): CollabAgentState => ({ status, message });

export const collabAgentToolCall = (
  id: string,
  tool: CollabAgentToolCallItem["tool"],
  status: CollabAgentToolCallItem["status"],
  overrides: CollabAgentToolCallOverrides = {},
): CollabAgentToolCallItem => ({
  type: "collabAgentToolCall",
  id,
  tool,
  status,
  senderThreadId: "sender-thread-id",
  receiverThreadIds: [],
  prompt: null,
  model: null,
  reasoningEffort: null,
  agentsStates: {},
  ...overrides,
});

export const baseTurn = (id: string, items: ThreadItem[] = []): Turn => ({
  id,
  items,
  itemsView: "full",
  status: "completed",
  error: null,
  startedAt: 1700000001,
  completedAt: 1700000005,
  durationMs: 4000,
});

export const inProgressTurn = (id: string, items: ThreadItem[] = []): Turn => ({
  ...baseTurn(id, items),
  status: "inProgress",
  completedAt: null,
  durationMs: null,
});

export const failedTurn = (
  id: string,
  error: NonNullable<Turn["error"]>,
  items: ThreadItem[] = [],
): Turn => ({
  ...baseTurn(id, items),
  status: "failed",
  error,
});

export const turnWithItems = (turn: Turn, items: ThreadItem[]): Turn => ({
  ...turn,
  items,
});

export const turnWithId = (turn: Turn, id: string): Turn => ({
  ...turn,
  id,
});

export const turnWithStatus = (turn: Turn, status: Turn["status"]): Turn => ({
  ...turn,
  status,
});

export const attachWithTurns = (
  attachBaseline: ThreadProjectionAttachResponse,
  turns: Turn[],
): ThreadProjectionAttachResponse => ({
  ...attachBaseline,
  snapshot: {
    ...attachBaseline.snapshot,
    thread: {
      ...attachBaseline.snapshot.thread,
      turns,
    },
  },
});

export const attachWithHeadCommitId = (
  attach: ThreadProjectionAttachResponse,
  headCommitId: string | null,
): ThreadProjectionAttachResponse => ({
  ...attach,
  snapshot: {
    ...attach.snapshot,
    headCommitId,
  },
});

export const attachWithThreadId = (
  attach: ThreadProjectionAttachResponse,
  threadId: string,
): ThreadProjectionAttachResponse => ({
  ...attach,
  snapshot: {
    ...attach.snapshot,
    thread: {
      ...attach.snapshot.thread,
      id: threadId,
    },
  },
});

type EventEnvelopeOverrides = {
  threadId?: ThreadProjectionEventNotification["threadId"];
  subscriptionId?: ThreadProjectionEventNotification["subscriptionId"];
  commitId?: ThreadProjectionEventNotification["commitId"];
  parentCommitId?: ThreadProjectionEventNotification["parentCommitId"];
};

export const eventWithEnvelope = (
  event: ThreadProjectionEventNotification,
  overrides: EventEnvelopeOverrides,
): ThreadProjectionEventNotification => ({
  ...event,
  ...overrides,
});

type ProjectionNotificationOwner = Pick<
  ThreadProjectionEventNotification,
  "threadId" | "subscriptionId"
>;

const projectionPayloadForThread = <T extends { notification: { threadId: string } }>(
  payload: T,
  threadId: string,
): T => ({
  ...payload,
  notification: { ...payload.notification, threadId },
});

export const eventForThreadOwner = (
  event: ThreadProjectionEventNotification,
  owner: ProjectionNotificationOwner,
): ThreadProjectionEventNotification => ({
  ...event,
  ...owner,
  event: projectionPayloadForThread(event.event, owner.threadId),
});

type TokenUsageUpdatedEvent = Extract<
  ThreadProjectionEventNotification["event"],
  { type: "tokenUsageUpdated" }
>;

export const tokenUsageUpdated = (
  eventTokenUsageUpdated: ThreadProjectionEventNotification,
  tokenUsage: TokenUsageUpdatedEvent["notification"]["tokenUsage"],
): ThreadProjectionEventNotification => {
  if (eventTokenUsageUpdated.event.type !== "tokenUsageUpdated") {
    throw new Error("fixture must contain a tokenUsageUpdated projection event");
  }

  return {
    ...eventTokenUsageUpdated,
    event: {
      ...eventTokenUsageUpdated.event,
      notification: {
        ...eventTokenUsageUpdated.event.notification,
        tokenUsage,
      },
    },
  };
};

type DeltaEnvelopeOverrides = {
  threadId?: ThreadProjectionDeltaNotification["threadId"];
  subscriptionId?: ThreadProjectionDeltaNotification["subscriptionId"];
};

export const deltaWithEnvelope = (
  delta: ThreadProjectionDeltaNotification,
  overrides: DeltaEnvelopeOverrides,
): ThreadProjectionDeltaNotification => ({
  ...delta,
  ...overrides,
});

export const deltaForThreadOwner = (
  delta: ThreadProjectionDeltaNotification,
  owner: ProjectionNotificationOwner,
): ThreadProjectionDeltaNotification => ({
  ...delta,
  ...owner,
  delta: projectionPayloadForThread(delta.delta, owner.threadId),
});

type ClosedEnvelopeOverrides = {
  threadId?: ThreadProjectionClosedNotification["threadId"];
  subscriptionId?: ThreadProjectionClosedNotification["subscriptionId"];
};

export const closedWithEnvelope = (
  closed: ThreadProjectionClosedNotification,
  overrides: ClosedEnvelopeOverrides,
): ThreadProjectionClosedNotification => ({
  ...closed,
  ...overrides,
});

export const agentMessageDelta = (
  eventAgentMessageDelta: ThreadProjectionDeltaNotification,
  turnId: string,
  itemId: string,
  delta: string,
): ThreadProjectionDeltaNotification => {
  if (eventAgentMessageDelta.delta.type !== "agentMessage") {
    throw new Error("fixture must contain an agentMessage projection delta");
  }

  return {
    ...eventAgentMessageDelta,
    delta: {
      ...eventAgentMessageDelta.delta,
      notification: {
        ...eventAgentMessageDelta.delta.notification,
        turnId,
        itemId,
        delta,
      },
    },
  };
};

type ReasoningSummaryTextDelta = Extract<
  ThreadProjectionDeltaNotification["delta"],
  { type: "reasoningSummaryText" }
>;

export const reasoningSummaryTextDelta = (
  eventReasoningSummaryTextDelta: ThreadProjectionDeltaNotification,
  turnId: ReasoningSummaryTextDelta["notification"]["turnId"],
  itemId: ReasoningSummaryTextDelta["notification"]["itemId"],
  delta: ReasoningSummaryTextDelta["notification"]["delta"],
  summaryIndex: ReasoningSummaryTextDelta["notification"]["summaryIndex"],
): ThreadProjectionDeltaNotification => {
  if (eventReasoningSummaryTextDelta.delta.type !== "reasoningSummaryText") {
    throw new Error("fixture must contain a reasoningSummaryText projection delta");
  }

  return {
    ...eventReasoningSummaryTextDelta,
    delta: {
      ...eventReasoningSummaryTextDelta.delta,
      notification: {
        ...eventReasoningSummaryTextDelta.delta.notification,
        turnId,
        itemId,
        delta,
        summaryIndex,
      },
    },
  };
};

type ReasoningSummaryPartAddedDelta = Extract<
  ThreadProjectionDeltaNotification["delta"],
  { type: "reasoningSummaryPartAdded" }
>;

export const reasoningSummaryPartAddedDelta = (
  eventReasoningSummaryPartAddedDelta: ThreadProjectionDeltaNotification,
  turnId: ReasoningSummaryPartAddedDelta["notification"]["turnId"],
  itemId: ReasoningSummaryPartAddedDelta["notification"]["itemId"],
  summaryIndex: ReasoningSummaryPartAddedDelta["notification"]["summaryIndex"],
): ThreadProjectionDeltaNotification => {
  if (eventReasoningSummaryPartAddedDelta.delta.type !== "reasoningSummaryPartAdded") {
    throw new Error("fixture must contain a reasoningSummaryPartAdded projection delta");
  }

  return {
    ...eventReasoningSummaryPartAddedDelta,
    delta: {
      ...eventReasoningSummaryPartAddedDelta.delta,
      notification: {
        ...eventReasoningSummaryPartAddedDelta.delta.notification,
        turnId,
        itemId,
        summaryIndex,
      },
    },
  };
};

type ReasoningTextDelta = Extract<
  ThreadProjectionDeltaNotification["delta"],
  { type: "reasoningText" }
>;

export const reasoningTextDelta = (
  eventReasoningTextDelta: ThreadProjectionDeltaNotification,
  turnId: ReasoningTextDelta["notification"]["turnId"],
  itemId: ReasoningTextDelta["notification"]["itemId"],
  delta: ReasoningTextDelta["notification"]["delta"],
  contentIndex: ReasoningTextDelta["notification"]["contentIndex"],
): ThreadProjectionDeltaNotification => {
  if (eventReasoningTextDelta.delta.type !== "reasoningText") {
    throw new Error("fixture must contain a reasoningText projection delta");
  }

  return {
    ...eventReasoningTextDelta,
    delta: {
      ...eventReasoningTextDelta.delta,
      notification: {
        ...eventReasoningTextDelta.delta.notification,
        turnId,
        itemId,
        delta,
        contentIndex,
      },
    },
  };
};

export const itemCompleted = (
  eventItemCompleted: ThreadProjectionEventNotification,
  commitId: string,
  turnId: string,
  item: ThreadItem,
): ThreadProjectionEventNotification => {
  if (eventItemCompleted.event.type !== "itemCompleted") {
    throw new Error("fixture must contain an itemCompleted projection event");
  }

  return {
    ...eventItemCompleted,
    commitId,
    event: {
      ...eventItemCompleted.event,
      notification: {
        ...eventItemCompleted.event.notification,
        turnId,
        item,
      },
    },
  };
};

export const contextCompactionCompleted = (
  eventItemCompleted: ThreadProjectionEventNotification,
  commitId: string,
  turnId: string,
  itemId: string,
): ThreadProjectionEventNotification =>
  itemCompleted(eventItemCompleted, commitId, turnId, contextCompaction(itemId));

export const itemStarted = (
  eventItemStarted: ThreadProjectionEventNotification,
  commitId: string,
  turnId: string,
  item: ThreadItem,
): ThreadProjectionEventNotification => {
  if (eventItemStarted.event.type !== "itemStarted") {
    throw new Error("fixture must contain an itemStarted projection event");
  }

  return {
    ...eventItemStarted,
    commitId,
    event: {
      ...eventItemStarted.event,
      notification: {
        ...eventItemStarted.event.notification,
        turnId,
        item,
      },
    },
  };
};

export const turnStarted = (
  eventTurnStarted: ThreadProjectionEventNotification,
  commitId: string,
  turn: Turn,
): ThreadProjectionEventNotification => {
  if (eventTurnStarted.event.type !== "turnStarted") {
    throw new Error("fixture must contain a turnStarted projection event");
  }

  return {
    ...eventTurnStarted,
    commitId,
    event: {
      ...eventTurnStarted.event,
      notification: {
        ...eventTurnStarted.event.notification,
        turn,
      },
    },
  };
};

export const turnCompleted = (
  eventTurnCompleted: ThreadProjectionEventNotification,
  commitId: string,
  turn: Turn,
): ThreadProjectionEventNotification => {
  if (eventTurnCompleted.event.type !== "turnCompleted") {
    throw new Error("fixture must contain a turnCompleted projection event");
  }

  return {
    ...eventTurnCompleted,
    commitId,
    event: {
      ...eventTurnCompleted.event,
      notification: {
        ...eventTurnCompleted.event.notification,
        turn,
      },
    },
  };
};
