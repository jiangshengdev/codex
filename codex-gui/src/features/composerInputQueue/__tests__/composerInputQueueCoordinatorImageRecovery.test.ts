import { describe, expect, it, vi } from "vitest";
import { $createParagraphNode, $getRoot, createEditor } from "lexical";
import { createDeferred } from "@/__tests__/appBrowserTestSupport";
import { AttachmentNode, $createAttachmentNode } from "@/features/composerEditor/AttachmentNode";
import { captureComposerDraft } from "@/features/composerEditor/composerDraft";
import { GuiHostCommandError } from "@/features/guiHost/guiHostCommandGateway";
import {
  createCoordinator,
  nextMicrotask,
  type StartTurn,
  type SteerTurn,
} from "./composerInputQueueCoordinatorTestFixtures";
import { composerDraftCapture } from "./composerInputQueueTestFixtures";

function imageCapture() {
  const editor = createEditor({
    nodes: [AttachmentNode],
    onError(error) {
      throw error;
    },
  });
  editor.update(
    () => {
      $getRoot().append(
        $createParagraphNode().append(
          $createAttachmentNode({
            id: "image",
            name: "reference.png",
            mediaType: "image",
            status: "ready",
            path: "/tmp/ref.png",
            failure: null,
          }),
        ),
      );
    },
    { discrete: true },
  );
  return captureComposerDraft(editor.getEditorState());
}

describe("image rejection recovery", () => {
  it("retains a rejected guide and requires explicit recovery to retry", async () => {
    const capture = imageCapture();
    const reason = "Selected model does not support images";
    const steerTurn = vi
      .fn<SteerTurn>()
      .mockRejectedValueOnce(
        new GuiHostCommandError({
          source: "rpc",
          delivery: "definitelyNotAccepted",
          error: new Error(reason),
        }),
      )
      .mockResolvedValueOnce({ turnId: "active" });
    const coordinator = createCoordinator({
      threadId: "thread",
      activeTurnId: "active",
      startTurn: vi.fn<StartTurn>(),
      steerTurn,
    });
    coordinator.submitSteer(capture);
    await nextMicrotask();
    expect(coordinator.getSnapshot().recovery).toEqual({
      reason: "steerDefinitelyNotAccepted",
      count: 1,
      rejectionReason: reason,
    });
    expect(steerTurn).toHaveBeenCalledOnce();
    expect(coordinator.recover()).toBe(true);
    expect(coordinator.getSnapshot().recovery).toBeNull();
    expect(steerTurn).toHaveBeenCalledTimes(2);
    expect(steerTurn.mock.calls[1]?.[0]).toEqual(steerTurn.mock.calls[0]?.[0]);
    expect(steerTurn.mock.calls[1]?.[0].input).toEqual(capture.input);
    await nextMicrotask();
    expect(coordinator.getSnapshot().recovery).toBeNull();
  });

  it("does not attach a model error to a text-only rejection", async () => {
    const startTurn = vi.fn<StartTurn>().mockRejectedValue(
      new GuiHostCommandError({
        source: "rpc",
        delivery: "definitelyNotAccepted",
        error: new Error("other rejection"),
      }),
    );
    const coordinator = createCoordinator({
      threadId: "thread",
      activeTurnId: null,
      startTurn,
      steerTurn: vi.fn<SteerTurn>(),
    });
    coordinator.submit(composerDraftCapture("text"));
    await nextMicrotask();
    expect(coordinator.getSnapshot().recovery).toEqual({
      reason: "startDefinitelyNotAccepted",
      count: 1,
      rejectionReason: null,
    });
  });

  it("ignores late image rejection after the owning coordinator is disposed", async () => {
    const pending = createDeferred<Awaited<ReturnType<StartTurn>>>();
    const coordinator = createCoordinator({
      threadId: "thread",
      activeTurnId: null,
      startTurn: vi.fn<StartTurn>().mockReturnValue(pending.promise),
      steerTurn: vi.fn<SteerTurn>(),
    });
    coordinator.submit(imageCapture());
    coordinator.dispose();
    const snapshot = coordinator.getSnapshot();
    pending.reject(
      new GuiHostCommandError({
        source: "rpc",
        delivery: "definitelyNotAccepted",
        error: new Error("late image rejection"),
      }),
    );
    await nextMicrotask();
    expect(coordinator.getSnapshot()).toBe(snapshot);
    expect(coordinator.getSnapshot().recovery).toBeNull();
  });
});
