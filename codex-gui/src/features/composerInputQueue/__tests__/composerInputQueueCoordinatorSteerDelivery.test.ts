import { describe, expect, it, vi } from "vitest";
import {
  eventItemStarted,
  eventTurnCompleted,
} from "@/features/projection/__tests__/projectionFixtures";
import {
  baseTurn,
  itemStarted,
  turnCompleted,
} from "@/features/projection/__tests__/projectionTestBuilders";
import { GuiHostCommandError } from "@/features/guiHost/guiHostCommandGateway";
import type { TurnSteerParams, TurnSteerResponse } from "@codex-protocol/v2";
import { copyComposerInputPayload } from "@/features/composerInput/composerInputPayload";
import {
  committedUserMessage,
  createCoordinator,
  deferredStart,
  live,
  nextMicrotask,
  type StartTurn,
  type SteerTurn,
} from "./composerInputQueueCoordinatorTestFixtures";
import { composerCapture as input, composerDraftCapture } from "./composerInputQueueTestFixtures";
describe("ComposerInputQueueCoordinator", () => {
  it("sends exact steer identities, issues an accepted successor, and releases only its commit", async () => {
    const responses: {
      promise: Promise<TurnSteerResponse>;
      resolve: (response: TurnSteerResponse) => void;
    }[] = [];
    const steerTurn = vi.fn<SteerTurn>(() => {
      let resolve!: (response: TurnSteerResponse) => void;
      const promise = new Promise<TurnSteerResponse>((yes) => {
        resolve = yes;
      });
      responses.push({ promise, resolve });
      return promise;
    });
    const coordinator = createCoordinator({
      threadId: "thread-1",
      activeTurnId: "turn-1",
      startTurn: vi.fn<StartTurn>(),
      steerTurn,
    });
    coordinator.submitSteer(input("first"));
    coordinator.submitSteer(input("second"));
    const firstParams = steerTurn.mock.calls[0]?.[0];
    expect(firstParams).toEqual({
      threadId: "thread-1",
      expectedTurnId: "turn-1",
      clientUserMessageId: firstParams?.clientUserMessageId,
      input: input("first").input,
    });
    expect(firstParams?.clientUserMessageId).toMatch(/^composer-steer-/);
    expect(coordinator.getSnapshot()).toMatchObject({
      guidingCount: 2,
      ordinaryQueuedCount: 0,
      hasUnknownSteer: false,
    });
    const initialDetails = coordinator.readPendingInputPage({
      lane: "steer",
      revision: coordinator.getSnapshot().detailRevision,
      cursor: null,
      limit: 10,
    });
    expect(initialDetails).toMatchObject({
      type: "page",
      items: [
        { preview: { type: "text", text: "first", truncated: false } },
        { preview: { type: "text", text: "second", truncated: false } },
      ],
    });
    const serializedSnapshot = JSON.stringify(coordinator.getSnapshot());
    expect(serializedSnapshot).not.toContain("/example/skills/");
    expect(serializedSnapshot).not.toContain('"input":');
    expect(serializedSnapshot).not.toContain('"path":');
    expect(serializedSnapshot).not.toContain('"claim":');
    expect(serializedSnapshot).not.toContain('"error":');
    expect(serializedSnapshot).not.toContain("clientUserMessageId");

    responses[0]?.resolve({ turnId: "turn-1" });
    await nextMicrotask();
    expect(steerTurn).toHaveBeenCalledTimes(2);
    expect(steerTurn.mock.calls[1]?.[0].input).toEqual(input("second").input);
    coordinator.observeAcceptedEvent(
      live(
        itemStarted(
          eventItemStarted,
          "commit-first",
          "turn-1",
          committedUserMessage(firstParams?.clientUserMessageId ?? "missing-client-id"),
        ),
      ),
    );
    const remainingDetails = coordinator.readPendingInputPage({
      lane: "steer",
      revision: coordinator.getSnapshot().detailRevision,
      cursor: null,
      limit: 10,
    });
    expect(remainingDetails).toMatchObject({
      type: "page",
      items: [{ preview: { type: "text", text: "second", truncated: false } }],
    });

    coordinator.dispose();
    responses[1]?.resolve({ turnId: "turn-1" });
    await nextMicrotask();
    expect(steerTurn).toHaveBeenCalledTimes(2);
  });

  it("copies every generated input variant without retaining mutable aliases", () => {
    const payload: TurnSteerParams["input"] = [
      {
        type: "text",
        text: "@agent",
        text_elements: [{ byteRange: { start: 0, end: 6 }, placeholder: "agent" }],
      },
      { type: "image", detail: "high", url: "https://example.test/image.png" },
      { type: "localImage", detail: "low", path: "/tmp/image.png" },
      { type: "audio", url: "https://example.test/audio.wav" },
      { type: "localAudio", path: "/tmp/audio.wav" },
      { type: "skill", name: "skill-name", path: "/tmp/SKILL.md" },
      { type: "mention", name: "agent", path: "/tmp/agent.md" },
    ];

    const copied = copyComposerInputPayload(payload);

    expect(copied).toEqual(payload);
    expect(copied).not.toBe(payload);
    for (const [index, item] of copied.entries()) {
      expect(item).not.toBe(payload[index]);
    }
    const copiedText = copied[0];
    const sourceText = payload[0];
    if (copiedText?.type !== "text" || sourceText?.type !== "text") {
      throw new Error("expected text input items");
    }
    expect(copiedText.text_elements).not.toBe(sourceText.text_elements);
    expect(copiedText.text_elements[0]).not.toBe(sourceText.text_elements[0]);
  });

  it("sends the exact text and skill input captured with the opaque draft", () => {
    const steerTurn = vi.fn<SteerTurn>(() => new Promise<TurnSteerResponse>(() => undefined));
    const capture = composerDraftCapture("Use ", {
      skill: {
        name: "skill-name",
        path: "/tmp/SKILL.md",
        displayName: "Skill name",
        sourceLabel: "Test",
      },
    });
    const coordinator = createCoordinator({
      threadId: "thread-1",
      activeTurnId: "turn-1",
      startTurn: vi.fn<StartTurn>(),
      steerTurn,
    });

    coordinator.submitSteer(capture);

    const requestInput = steerTurn.mock.calls[0]?.[0].input;
    expect(requestInput).toEqual(capture.input);
    expect(requestInput).not.toBe(capture.input);
    expect(requestInput?.[0]).not.toBe(capture.input[0]);
  });

  it.each([
    ["responseTurnMismatch", "response"],
    ["deliveryUnknown", "error"],
  ] as const)("keeps %s blocked without issuing a successor", async (phase, settlement) => {
    let resolve!: (response: TurnSteerResponse) => void;
    let reject!: (error: unknown) => void;
    const steerTurn = vi.fn<SteerTurn>(
      () =>
        new Promise<TurnSteerResponse>((yes, no) => {
          resolve = yes;
          reject = no;
        }),
    );
    const coordinator = createCoordinator({
      threadId: "thread-1",
      activeTurnId: "turn-1",
      startTurn: vi.fn<StartTurn>(),
      steerTurn,
    });
    coordinator.submitSteer(input("first"));
    coordinator.submitSteer(input("second"));
    if (settlement === "response") {
      resolve({ turnId: "turn-other" });
    } else {
      reject(new Error("delivery is unknown"));
    }
    await nextMicrotask();

    expect(steerTurn).toHaveBeenCalledTimes(1);
    expect(coordinator.getSnapshot()).toMatchObject({
      guidingCount: 2,
      hasUnknownSteer: true,
    });
    expect(["responseTurnMismatch", "deliveryUnknown"]).toContain(phase);
    expect(
      coordinator.readPendingInputPage({
        lane: "steer",
        revision: coordinator.getSnapshot().detailRevision,
        cursor: null,
        limit: 10,
      }),
    ).toMatchObject({
      type: "page",
      items: [
        { preview: { type: "text", text: "first", truncated: false } },
        { preview: { type: "text", text: "second", truncated: false } },
      ],
    });
    expect(coordinator.getReleaseReadiness()).toEqual({
      type: "blocked",
      blockers: [
        { type: "steerQueued", count: 1 },
        { type: "pendingSteers", count: 1, hasUnknown: true },
      ],
    });
  });

  it("preserves structured rejections for a terminal merge before ordinary start", async () => {
    let rejectSteer!: (error: unknown) => void;
    const steerTurn = vi.fn<SteerTurn>(
      () =>
        new Promise<TurnSteerResponse>((_resolve, reject) => {
          rejectSteer = reject;
        }),
    );
    const startRequest = deferredStart();
    const startTurn = vi.fn<StartTurn>(() => startRequest.promise);
    const coordinator = createCoordinator({
      threadId: "thread-1",
      activeTurnId: "turn-1",
      startTurn,
      steerTurn,
    });
    coordinator.submit(input("ordinary"));
    coordinator.submitSteer(input("steer-a"));
    coordinator.submitSteer(input("steer-b"));
    rejectSteer(
      new GuiHostCommandError({
        source: "rpc",
        delivery: "definitelyNotAccepted",
        error: new Error("cannot steer"),
        rpcError: {
          code: -32000,
          message: "cannot steer",
          data: {
            message: "cannot steer",
            codexErrorInfo: { activeTurnNotSteerable: { turnKind: "review" } },
            additionalDetails: null,
          },
        },
      }),
    );
    await nextMicrotask();
    expect(coordinator.getSnapshot().rejectedSteers.map(({ preview }) => preview)).toEqual([
      { type: "text", text: "steer-a", truncated: false },
      { type: "text", text: "steer-b", truncated: false },
    ]);

    coordinator.observeAcceptedEvent(
      live(turnCompleted(eventTurnCompleted, "terminal-1", baseTurn("turn-1"))),
    );
    expect(startTurn).toHaveBeenCalledTimes(1);
    expect(startTurn.mock.calls[0]?.[0].input).toEqual([
      ...input("steer-a").input,
      ...input("steer-b").input,
    ]);
    startRequest.reject(
      new GuiHostCommandError({
        source: "rpc",
        delivery: "definitelyNotAccepted",
        error: new Error("start rejected"),
      }),
    );
    await nextMicrotask();
    expect(coordinator.getSnapshot()).toMatchObject({
      ordinaryQueuedCount: 1,
      rejectedSteers: [
        { preview: { type: "text", text: "steer-a", truncated: false } },
        { preview: { type: "text", text: "steer-b", truncated: false } },
      ],
    });
  });
});
