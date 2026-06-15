import { describe, expect, it } from "vitest";
import { makeStore } from "@/app/store";
import {
  buildChatTextModel,
  selectChatTextModel,
  type ChatTextModel,
} from "@/features/chatTextModel/chatTextModel";
import type { TimelineMaterial } from "@/features/liveEventHandling/liveEventHandling";
import attachBaselineJson from "@/features/projection/__fixtures__/attach-baseline.json";
import eventTurnStartedJson from "@/features/projection/__fixtures__/event-turn-started.json";
import {
  threadRuntimeAttached,
  threadRuntimeEventBuffered,
  threadRuntimeManualReconnectRequired,
} from "@/features/threadRuntime/threadRuntimeSlice";
import type {
  ThreadItem,
  ThreadProjectionAttachResponse,
  ThreadProjectionEventNotification,
  Turn,
  UserInput,
} from "@codex-protocol/v2";

const attachBaseline = attachBaselineJson as ThreadProjectionAttachResponse;
const eventTurnStarted = eventTurnStartedJson as ThreadProjectionEventNotification;

const baseTurn = (id: string): Turn => ({
  id,
  items: [],
  itemsView: "full",
  status: "completed",
  error: null,
  startedAt: 1700000001,
  completedAt: 1700000005,
  durationMs: 4000,
});

const textInput = (text: string): UserInput => ({
  type: "text",
  text,
  text_elements: [],
});

const imageInput = (url: string): UserInput => ({
  type: "image",
  url,
});

const userMessage = (id: string, content: UserInput[]): ThreadItem => ({
  type: "userMessage",
  id,
  clientId: null,
  content,
});

const agentMessage = (id: string, text: string): ThreadItem => ({
  type: "agentMessage",
  id,
  text,
  phase: "final_answer",
  memoryCitation: null,
});

const planItem = (id: string): ThreadItem => ({
  type: "plan",
  id,
  text: "Hidden plan text",
});

describe("chat text model", () => {
  it("returns an empty model for an empty timeline", () => {
    expect(buildChatTextModel([])).toStrictEqual({
      turns: [],
      globalStatus: [],
    } satisfies ChatTextModel);
  });

  it("groups replayed user and assistant text messages by turn", () => {
    const turn = baseTurn("turn-replay");
    const materials = [
      {
        type: "turnStarted",
        source: "snapshotReplay",
        threadId: "thread-1",
        turn,
      },
      {
        type: "itemReplayed",
        source: "snapshotReplay",
        threadId: "thread-1",
        turnId: turn.id,
        item: userMessage("user-1", [textInput("Hello "), textInput("there")]),
      },
      {
        type: "itemReplayed",
        source: "snapshotReplay",
        threadId: "thread-1",
        turnId: turn.id,
        item: agentMessage("agent-1", "**Plain** text only"),
      },
      {
        type: "turnCompleted",
        source: "snapshotReplay",
        threadId: "thread-1",
        turn: {
          id: turn.id,
          itemsView: turn.itemsView,
          status: turn.status,
          error: turn.error,
          startedAt: turn.startedAt,
          completedAt: turn.completedAt,
          durationMs: turn.durationMs,
        },
      },
    ] satisfies TimelineMaterial[];

    expect(buildChatTextModel(materials)).toStrictEqual({
      turns: [
        {
          id: "turn-replay",
          entries: [
            { type: "message", id: "user-1", role: "user", text: "Hello there" },
            { type: "message", id: "agent-1", role: "assistant", text: "**Plain** text only" },
          ],
        },
      ],
      globalStatus: [],
    } satisfies ChatTextModel);
  });

  it("uses live itemCompleted messages and ignores live itemStarted messages", () => {
    const turn = baseTurn("turn-live");
    const materials = [
      { type: "turnStarted", source: "liveEvent", threadId: "thread-1", turn },
      {
        type: "itemStarted",
        source: "liveEvent",
        threadId: "thread-1",
        turnId: turn.id,
        item: agentMessage("agent-started", "Do not show"),
      },
      {
        type: "itemCompleted",
        source: "liveEvent",
        threadId: "thread-1",
        turnId: turn.id,
        item: agentMessage("agent-completed", "Show completed text"),
      },
    ] satisfies TimelineMaterial[];

    expect(buildChatTextModel(materials)).toStrictEqual({
      turns: [
        {
          id: "turn-live",
          entries: [
            {
              type: "message",
              id: "agent-completed",
              role: "assistant",
              text: "Show completed text",
            },
          ],
        },
      ],
      globalStatus: [],
    } satisfies ChatTextModel);
  });

  it("creates turn groups from completed or replayed item material when turnStarted is absent", () => {
    const materials = [
      {
        type: "itemCompleted",
        source: "liveEvent",
        threadId: "thread-1",
        turnId: "turn-from-live-item",
        item: userMessage("user-from-live-item", [textInput("Recovered from live item")]),
      },
      {
        type: "itemReplayed",
        source: "snapshotReplay",
        threadId: "thread-1",
        turnId: "turn-from-replayed-item",
        item: userMessage("user-from-replayed-item", [textInput("Recovered from replayed item")]),
      },
    ] satisfies TimelineMaterial[];

    expect(buildChatTextModel(materials)).toStrictEqual({
      turns: [
        {
          id: "turn-from-live-item",
          entries: [
            {
              type: "message",
              id: "user-from-live-item",
              role: "user",
              text: "Recovered from live item",
            },
          ],
        },
        {
          id: "turn-from-replayed-item",
          entries: [
            {
              type: "message",
              id: "user-from-replayed-item",
              role: "user",
              text: "Recovered from replayed item",
            },
          ],
        },
      ],
      globalStatus: [],
    } satisfies ChatTextModel);
  });

  it("ignores an itemStarted material when turnStarted is absent", () => {
    const materials = [
      {
        type: "itemStarted",
        source: "liveEvent",
        threadId: "thread-1",
        turnId: "turn-started-only",
        item: agentMessage("agent-started-only", "Do not create a turn"),
      },
    ] satisfies TimelineMaterial[];

    expect(buildChatTextModel(materials)).toStrictEqual({
      turns: [],
      globalStatus: [],
    } satisfies ChatTextModel);
  });

  it("ignores non-text user inputs, empty text messages, and non-chat items", () => {
    const turn = baseTurn("turn-filtered");
    const materials = [
      { type: "turnStarted", source: "snapshotReplay", threadId: "thread-1", turn },
      {
        type: "itemReplayed",
        source: "snapshotReplay",
        threadId: "thread-1",
        turnId: turn.id,
        item: userMessage("image-only", [imageInput("https://example.invalid/image.png")]),
      },
      {
        type: "itemReplayed",
        source: "snapshotReplay",
        threadId: "thread-1",
        turnId: turn.id,
        item: userMessage("empty-user", [textInput("")]),
      },
      {
        type: "itemReplayed",
        source: "snapshotReplay",
        threadId: "thread-1",
        turnId: turn.id,
        item: agentMessage("empty-agent", ""),
      },
      {
        type: "itemReplayed",
        source: "snapshotReplay",
        threadId: "thread-1",
        turnId: turn.id,
        item: planItem("hidden-plan"),
      },
    ] satisfies TimelineMaterial[];

    expect(buildChatTextModel(materials)).toStrictEqual({
      turns: [{ id: "turn-filtered", entries: [] }],
      globalStatus: [],
    } satisfies ChatTextModel);
  });

  it("derives subscription interruption as turn-external global status", () => {
    const materials = [
      {
        type: "subscriptionInterrupted",
        source: "liveEvent",
        threadId: "thread-1",
        reason: "backpressure",
        subscriptionId: "subscription-1",
      },
    ] satisfies TimelineMaterial[];

    expect(buildChatTextModel(materials)).toStrictEqual({
      turns: [],
      globalStatus: [
        {
          type: "status",
          id: "subscriptionInterrupted:thread-1:subscription-1:backpressure",
          status: "subscriptionInterrupted",
          text: "Connection interrupted. Reconnect required.",
        },
      ],
    } satisfies ChatTextModel);
  });

  it("selects chat text model from runtime timeline selectors", () => {
    if (eventTurnStarted.event.type !== "turnStarted") {
      throw new Error("fixture must contain a turnStarted projection event");
    }

    const attachWithChatTurn: ThreadProjectionAttachResponse = {
      ...attachBaseline,
      snapshot: {
        ...attachBaseline.snapshot,
        thread: {
          ...attachBaseline.snapshot.thread,
          turns: [
            {
              ...baseTurn("selector-turn"),
              items: [
                userMessage("selector-user", [textInput("Selector user")]),
                agentMessage("selector-agent", "Selector assistant"),
              ],
            },
          ],
        },
      },
    };

    const store = makeStore();
    store.dispatch(threadRuntimeAttached(attachWithChatTurn));
    store.dispatch(threadRuntimeEventBuffered(eventTurnStarted));
    store.dispatch(
      threadRuntimeManualReconnectRequired({
        reason: "backpressure",
        threadId: attachWithChatTurn.snapshot.thread.id,
        subscriptionId: attachWithChatTurn.subscriptionId,
      }),
    );

    expect(selectChatTextModel(store.getState())).toStrictEqual({
      turns: [
        {
          id: "selector-turn",
          entries: [
            { type: "message", id: "selector-user", role: "user", text: "Selector user" },
            {
              type: "message",
              id: "selector-agent",
              role: "assistant",
              text: "Selector assistant",
            },
          ],
        },
        { id: eventTurnStarted.event.notification.turn.id, entries: [] },
      ],
      globalStatus: [
        {
          type: "status",
          id: `subscriptionInterrupted:${attachWithChatTurn.snapshot.thread.id}:${attachWithChatTurn.subscriptionId}:backpressure`,
          status: "subscriptionInterrupted",
          text: "Connection interrupted. Reconnect required.",
        },
      ],
    } satisfies ChatTextModel);
  });
});
