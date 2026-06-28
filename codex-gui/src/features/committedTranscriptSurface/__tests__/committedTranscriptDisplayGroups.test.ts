import { describe, expect, it } from "vitest";
import type { TranscriptEntry } from "@/features/transcriptState/transcriptStateSlice";
import { groupTranscriptEntriesForDisplay } from "../committedTranscriptDisplayGroups";

const message = (
  id: string,
  role: "user" | "assistant",
  phase: Extract<TranscriptEntry, { type: "message" }>["phase"],
): TranscriptEntry => ({
  type: "message",
  id,
  turnId: "turn-display",
  role,
  source: id,
  sourceKind: "plainText",
  phase,
  revision: 0,
});

const status = (id: string): TranscriptEntry => ({
  type: "status",
  id,
  turnId: "turn-display",
  status: "interrupted",
  revision: 0,
});

describe("groupTranscriptEntriesForDisplay", () => {
  it("groups commentary into a forced-open temporary module before final answer exists", () => {
    const commentary = message("commentary", "assistant", "commentary");

    expect(groupTranscriptEntriesForDisplay([commentary])).toStrictEqual([
      {
        type: "temporaryModule",
        id: "temporary:commentary",
        entries: [commentary],
        hasFinalAnswer: false,
      },
    ]);
  });

  it("keeps temporary and final answer modules as siblings once final answer exists", () => {
    const user = message("user", "user", null);
    const commentary = message("commentary", "assistant", "commentary");
    const finalAnswer = message("final", "assistant", "final_answer");

    expect(groupTranscriptEntriesForDisplay([user, commentary, finalAnswer])).toStrictEqual([
      { type: "entry", entry: user },
      {
        type: "temporaryModule",
        id: "temporary:commentary",
        entries: [commentary],
        hasFinalAnswer: true,
      },
      { type: "finalAnswer", entry: finalAnswer },
    ]);
  });

  it("groups multiple pre-final commentary entries into one temporary module", () => {
    const firstCommentary = message("commentary-1", "assistant", "commentary");
    const secondCommentary = message("commentary-2", "assistant", "commentary");
    const finalAnswer = message("final", "assistant", "final_answer");

    expect(
      groupTranscriptEntriesForDisplay([firstCommentary, secondCommentary, finalAnswer]),
    ).toStrictEqual([
      {
        type: "temporaryModule",
        id: "temporary:commentary-1:commentary-2",
        entries: [firstCommentary, secondCommentary],
        hasFinalAnswer: true,
      },
      { type: "finalAnswer", entry: finalAnswer },
    ]);
  });

  it("passes status entries through without folding them into temporary content", () => {
    const interrupted = status("interrupted");
    const commentary = message("commentary", "assistant", "commentary");

    expect(groupTranscriptEntriesForDisplay([interrupted, commentary])).toStrictEqual([
      { type: "entry", entry: interrupted },
      {
        type: "temporaryModule",
        id: "temporary:commentary",
        entries: [commentary],
        hasFinalAnswer: false,
      },
    ]);
  });

  it("does not fold legacy null phase assistant messages", () => {
    const legacy = message("legacy", "assistant", null);
    const finalAnswer = message("final", "assistant", "final_answer");

    expect(groupTranscriptEntriesForDisplay([legacy, finalAnswer])).toStrictEqual([
      { type: "entry", entry: legacy },
      { type: "finalAnswer", entry: finalAnswer },
    ]);
  });

  it("does not fold commentary after the first final answer", () => {
    const finalAnswer = message("final", "assistant", "final_answer");
    const lateCommentary = message("late-commentary", "assistant", "commentary");

    expect(groupTranscriptEntriesForDisplay([finalAnswer, lateCommentary])).toStrictEqual([
      { type: "finalAnswer", entry: finalAnswer },
      { type: "entry", entry: lateCommentary },
    ]);
  });
});
