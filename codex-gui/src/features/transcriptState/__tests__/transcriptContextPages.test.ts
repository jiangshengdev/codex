import { describe, expect, it } from "vitest";
import {
  agentMessage,
  contextCompaction,
} from "@/features/projection/__tests__/projectionTestBuilders";
import { applyCompletedTranscriptItem } from "../transcriptStateImplementation";
import { createEmptyTranscriptState, transcriptEntryIdFor } from "../transcriptStateModel";

describe("transcript context pages", () => {
  it("starts with one page before any context compaction", () => {
    const state = createEmptyTranscriptState();

    expect(state.contextPageIds).toStrictEqual(["context-page:1"]);
    expect(state.contextPagesById).toStrictEqual({
      "context-page:1": {
        id: "context-page:1",
        leadingBoundaryId: null,
        turnFragmentIds: [],
      },
    });
  });

  it("splits one turn across pages, forces a new chunk, and keeps entry bodies authoritative", () => {
    const state = createEmptyTranscriptState();
    const turnId = "turn-across-pages";
    const beforeItem = agentMessage("agent-before", "Before compaction", "commentary");
    const afterItem = agentMessage("agent-after", "After compaction", "commentary");

    applyCompletedTranscriptItem(state, turnId, beforeItem, "commit-before");
    const beforeEntryId = transcriptEntryIdFor(turnId, beforeItem.id);
    const beforeEntry = state.entriesById[beforeEntryId];

    applyCompletedTranscriptItem(
      state,
      turnId,
      contextCompaction("compaction-1"),
      "commit-compaction",
    );
    const secondFragmentId = JSON.stringify(["context-page:2", turnId, 0]);
    const boundaryFragment = state.turnFragmentsById[secondFragmentId];
    expect(boundaryFragment).toStrictEqual({
      id: secondFragmentId,
      turnId,
      leadingPromptEntryId: null,
      middleChunkIds: [],
      middleEntryCount: 0,
      finalAssistantEntryIds: [],
    });
    applyCompletedTranscriptItem(state, turnId, afterItem, "commit-after");

    const afterEntryId = transcriptEntryIdFor(turnId, afterItem.id);
    const firstFragmentId = JSON.stringify(["context-page:1", turnId, 0]);
    expect(state.contextPageIds).toStrictEqual(["context-page:1", "context-page:2"]);
    expect(state.contextPagesById).toStrictEqual({
      "context-page:1": {
        id: "context-page:1",
        leadingBoundaryId: null,
        turnFragmentIds: [firstFragmentId],
      },
      "context-page:2": {
        id: "context-page:2",
        leadingBoundaryId: transcriptEntryIdFor(turnId, "compaction-1"),
        turnFragmentIds: [secondFragmentId],
      },
    });
    expect(state.turnFragmentsById).toStrictEqual({
      [firstFragmentId]: {
        id: firstFragmentId,
        turnId,
        leadingPromptEntryId: null,
        middleChunkIds: [`${turnId}:chunk:0`],
        middleEntryCount: 1,
        finalAssistantEntryIds: [],
      },
      [secondFragmentId]: {
        id: secondFragmentId,
        turnId,
        leadingPromptEntryId: null,
        middleChunkIds: [`${turnId}:chunk:1`],
        middleEntryCount: 1,
        finalAssistantEntryIds: [],
      },
    });
    expect(state.turnFragmentsById[secondFragmentId]).toBe(boundaryFragment);
    expect(state.chunksById).toStrictEqual({
      [`${turnId}:chunk:0`]: {
        id: `${turnId}:chunk:0`,
        turnId,
        entryIds: [beforeEntryId],
        revision: 1,
      },
      [`${turnId}:chunk:1`]: {
        id: `${turnId}:chunk:1`,
        turnId,
        entryIds: [afterEntryId],
        revision: 1,
      },
    });
    expect(state.entriesById[beforeEntryId]).toBe(beforeEntry);
    expect(beforeEntry).toMatchObject({
      id: "agent-before",
      turnId,
      source: "Before compaction",
    });
    expect(state.entriesById[transcriptEntryIdFor(turnId, "compaction-1")]).toBeUndefined();
    expect(JSON.stringify(state.contextPagesById)).not.toContain("Before compaction");
    expect(JSON.stringify(state.turnFragmentsById)).not.toContain("After compaction");
  });

  it("creates boundary-only pages for trailing and consecutive compactions", () => {
    const state = createEmptyTranscriptState();
    const turnId = "turn-trailing-compactions";

    applyCompletedTranscriptItem(
      state,
      turnId,
      contextCompaction("compaction-1"),
      "commit-compaction-1",
    );
    applyCompletedTranscriptItem(
      state,
      turnId,
      contextCompaction("compaction-2"),
      "commit-compaction-2",
    );

    const secondFragmentId = JSON.stringify(["context-page:2", turnId, 0]);
    const thirdFragmentId = JSON.stringify(["context-page:3", turnId, 0]);
    expect(state.contextPageIds).toStrictEqual([
      "context-page:1",
      "context-page:2",
      "context-page:3",
    ]);
    expect(state.contextPagesById["context-page:2"]).toStrictEqual({
      id: "context-page:2",
      leadingBoundaryId: transcriptEntryIdFor(turnId, "compaction-1"),
      turnFragmentIds: [secondFragmentId],
    });
    expect(state.contextPagesById["context-page:3"]).toStrictEqual({
      id: "context-page:3",
      leadingBoundaryId: transcriptEntryIdFor(turnId, "compaction-2"),
      turnFragmentIds: [thirdFragmentId],
    });
    expect(state.turnFragmentsById).toStrictEqual({
      [secondFragmentId]: {
        id: secondFragmentId,
        turnId,
        leadingPromptEntryId: null,
        middleChunkIds: [],
        middleEntryCount: 0,
        finalAssistantEntryIds: [],
      },
      [thirdFragmentId]: {
        id: thirdFragmentId,
        turnId,
        leadingPromptEntryId: null,
        middleChunkIds: [],
        middleEntryCount: 0,
        finalAssistantEntryIds: [],
      },
    });
  });

  it("deduplicates repeated completed compaction identity", () => {
    const state = createEmptyTranscriptState();
    const turnId = "turn-duplicate-compaction";
    const item = contextCompaction("compaction-1");

    applyCompletedTranscriptItem(state, turnId, item, "commit-compaction-1");
    applyCompletedTranscriptItem(state, turnId, item, "commit-compaction-replay");

    expect(state.contextPageIds).toStrictEqual(["context-page:1", "context-page:2"]);
    expect(state.contextBoundaryIdsById).toStrictEqual({
      [transcriptEntryIdFor(turnId, item.id)]: true,
    });
  });
});
