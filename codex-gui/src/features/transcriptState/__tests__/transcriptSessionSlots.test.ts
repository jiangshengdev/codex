import { describe, expect, it } from "vitest";
import { makeStore } from "@/app/store";
import {
  activeThreadReadModelSlotCreated,
  activeThreadReadModelSlotRemoved,
  activeThreadReadModelTransitionApplied,
  buildActiveThreadCandidateReadModelTransition,
} from "@/features/activeThreadSession/activeThreadSessionReadModel";
import {
  attachBaseline,
  attachReplacement,
} from "@/features/projection/__tests__/projectionFixtures";
import { attachWithThreadId } from "@/features/projection/__tests__/projectionTestBuilders";
import { selectThreadRuntimeRecord } from "@/features/threadRuntime/threadRuntimeSlice";
import {
  selectCommittedTranscriptScrollCommitKey,
  selectTranscriptContextPage,
  selectTranscriptState,
  selectTranscriptTurnIds,
} from "../transcriptStateSlice";

const foreground = { threadId: attachBaseline.snapshot.thread.id, instanceId: "foreground" };
const background = { threadId: "background-thread", instanceId: "background" };
const replacement = { ...foreground, instanceId: "replacement" };

describe("live session read-model slots", () => {
  it("accepts equal local revisions independently and keeps foreground references and scroll signals stable", () => {
    const store = makeStore();
    store.dispatch(activeThreadReadModelSlotCreated(foreground));
    store.dispatch(activeThreadReadModelSlotCreated(background));
    store.dispatch(
      activeThreadReadModelTransitionApplied(
        buildActiveThreadCandidateReadModelTransition(foreground, 1, attachBaseline),
      ),
    );
    const before = store.getState();
    const page = selectTranscriptContextPage(before, foreground.threadId, "context-page:1");
    const turnIds = selectTranscriptTurnIds(before, foreground.threadId);
    const scroll = selectCommittedTranscriptScrollCommitKey(before, foreground.threadId);

    store.dispatch(
      activeThreadReadModelTransitionApplied(
        buildActiveThreadCandidateReadModelTransition(
          background,
          1,
          attachWithThreadId(attachReplacement, background.threadId),
        ),
      ),
    );
    const after = store.getState();
    expect(selectThreadRuntimeRecord(after, background.threadId)?.threadId).toBe(
      background.threadId,
    );
    expect(selectTranscriptState(after, background.threadId)?.sessionRevision).toBe(1);
    expect(after.threadRuntime.byThreadId[foreground.threadId]).toBe(
      before.threadRuntime.byThreadId[foreground.threadId],
    );
    expect(selectTranscriptState(after, foreground.threadId)).toBe(
      selectTranscriptState(before, foreground.threadId),
    );
    expect(selectTranscriptContextPage(after, foreground.threadId, "context-page:1")).toBe(page);
    expect(selectTranscriptTurnIds(after, foreground.threadId)).toBe(turnIds);
    expect(selectCommittedTranscriptScrollCommitKey(after, foreground.threadId)).toBe(scroll);
  });

  it("advances empty transitions only in their own slot and rejects equal or older facts", () => {
    const store = makeStore();
    store.dispatch(activeThreadReadModelSlotCreated(foreground));
    store.dispatch(activeThreadReadModelSlotCreated(background));
    store.dispatch(
      activeThreadReadModelTransitionApplied({
        identity: foreground,
        sessionRevision: 8,
        facts: [],
      }),
    );
    expect(store.getState().threadRuntime.byThreadId[foreground.threadId]?.sessionRevision).toBe(8);
    expect(selectTranscriptState(store.getState(), foreground.threadId)?.sessionRevision).toBe(8);
    expect(selectTranscriptState(store.getState(), background.threadId)?.sessionRevision).toBe(0);
    const before = store.getState();
    for (const revision of [8, 7]) {
      store.dispatch(
        activeThreadReadModelTransitionApplied(
          buildActiveThreadCandidateReadModelTransition(foreground, revision, attachBaseline),
        ),
      );
      expect(store.getState()).toBe(before);
    }
    store.dispatch(
      activeThreadReadModelTransitionApplied(
        buildActiveThreadCandidateReadModelTransition(
          background,
          1,
          attachWithThreadId(attachBaseline, background.threadId),
        ),
      ),
    );
    expect(selectThreadRuntimeRecord(store.getState(), background.threadId)).not.toBeNull();
  });

  it("requires explicit creation, preserves existing slots on repeated creation, and ignores obsolete owners", () => {
    const store = makeStore();
    const absent = store.getState();
    store.dispatch(
      activeThreadReadModelTransitionApplied(
        buildActiveThreadCandidateReadModelTransition(foreground, 1, attachBaseline),
      ),
    );
    expect(store.getState()).toBe(absent);
    store.dispatch(activeThreadReadModelSlotCreated(foreground));
    store.dispatch(
      activeThreadReadModelTransitionApplied(
        buildActiveThreadCandidateReadModelTransition(foreground, 9, attachBaseline),
      ),
    );
    const existing = store.getState();
    store.dispatch(activeThreadReadModelSlotCreated(foreground));
    store.dispatch(activeThreadReadModelSlotCreated(replacement));
    store.dispatch(activeThreadReadModelSlotRemoved(replacement));
    expect(store.getState()).toBe(existing);

    store.dispatch(activeThreadReadModelSlotRemoved(foreground));
    expect(selectTranscriptState(store.getState(), foreground.threadId)).toBeNull();
    expect(selectThreadRuntimeRecord(store.getState(), foreground.threadId)).toBeNull();
    store.dispatch(activeThreadReadModelSlotCreated(replacement));
    store.dispatch(
      activeThreadReadModelTransitionApplied(
        buildActiveThreadCandidateReadModelTransition(replacement, 1, attachReplacement),
      ),
    );
    const replaced = store.getState();
    store.dispatch(activeThreadReadModelSlotRemoved(foreground));
    store.dispatch(
      activeThreadReadModelTransitionApplied(
        buildActiveThreadCandidateReadModelTransition(foreground, 100, attachBaseline),
      ),
    );
    store.dispatch(
      activeThreadReadModelTransitionApplied({
        identity: foreground,
        sessionRevision: 101,
        facts: [],
      }),
    );
    expect(store.getState()).toBe(replaced);
    expect(selectThreadRuntimeRecord(replaced, foreground.threadId)?.thread.name).toBe(
      "Replacement projection fixture",
    );
    expect(selectTranscriptState(replaced, foreground.threadId)?.sessionRevision).toBe(1);
  });
});
