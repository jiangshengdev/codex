import { describe, expect, it } from "vitest";
import type {
  TranscriptChunkView,
  TranscriptEntry,
} from "@/features/transcriptState/transcriptStateSlice";
import { areTranscriptChunkViewsEqual } from "../committedTranscriptChunkEquality";

type TranscriptMessageEntry = Extract<TranscriptEntry, { type: "message" }>;
type TranscriptStatusEntry = Extract<TranscriptEntry, { type: "status" }>;

const entry = (id: string, revision: number): TranscriptMessageEntry => ({
  type: "message",
  id,
  turnId: "turn-1",
  role: "assistant",
  source: `source ${id} ${String(revision)}`,
  sourceKind: "markdown",
  phase: "final_answer",
  revision,
});

const statusEntry = (
  id: string,
  revision: number,
  status: TranscriptStatusEntry["status"] = "interrupted",
): TranscriptStatusEntry => ({
  type: "status",
  id,
  turnId: "turn-1",
  status,
  revision,
});

const chunk = (
  overrides: Partial<Omit<TranscriptChunkView, "entries">> & {
    entries?: TranscriptEntry[];
  } = {},
): TranscriptChunkView => ({
  id: "chunk-1",
  turnId: "turn-1",
  revision: 0,
  entries: [entry("entry-1", 0), entry("entry-2", 0)],
  ...overrides,
});

describe("areTranscriptChunkViewsEqual", () => {
  it("treats fresh chunk and entry objects as equal when rendered fields match", () => {
    const previous = chunk({
      entries: [{ ...entry("entry-1", 0) }, { ...entry("entry-2", 0) }],
    });
    const next = chunk({
      entries: [{ ...entry("entry-1", 0) }, { ...entry("entry-2", 0) }],
    });

    expect(areTranscriptChunkViewsEqual(previous, next)).toBe(true);
  });

  it("detects chunk identity, turn identity, and chunk revision changes", () => {
    expect(areTranscriptChunkViewsEqual(chunk(), chunk({ id: "chunk-2" }))).toBe(false);
    expect(areTranscriptChunkViewsEqual(chunk(), chunk({ turnId: "turn-2" }))).toBe(false);
    expect(areTranscriptChunkViewsEqual(chunk(), chunk({ revision: 1 }))).toBe(false);
  });

  it("detects entry order, length, and revision changes", () => {
    expect(
      areTranscriptChunkViewsEqual(
        chunk({ entries: [entry("entry-1", 0), entry("entry-2", 0)] }),
        chunk({ entries: [entry("entry-2", 0), entry("entry-1", 0)] }),
      ),
    ).toBe(false);
    expect(
      areTranscriptChunkViewsEqual(
        chunk({ entries: [entry("entry-1", 0), entry("entry-2", 0)] }),
        chunk({ entries: [entry("entry-1", 0)] }),
      ),
    ).toBe(false);
    expect(
      areTranscriptChunkViewsEqual(
        chunk({ entries: [entry("entry-1", 0), entry("entry-2", 0)] }),
        chunk({ entries: [entry("entry-1", 0), entry("entry-2", 1)] }),
      ),
    ).toBe(false);
  });

  it("detects message phase changes when entry id and revision match", () => {
    expect(
      areTranscriptChunkViewsEqual(
        chunk({ entries: [entry("entry-1", 0)] }),
        chunk({ entries: [{ ...entry("entry-1", 0), phase: "commentary" }] }),
      ),
    ).toBe(false);
  });

  it("detects message source changes when entry id and revision match", () => {
    expect(
      areTranscriptChunkViewsEqual(
        chunk({ entries: [{ ...entry("entry-1", 0), source: "Before reconnect" }] }),
        chunk({ entries: [{ ...entry("entry-1", 0), source: "After reconnect" }] }),
      ),
    ).toBe(false);
  });

  it("detects status changes when entry id and revision match", () => {
    expect(
      areTranscriptChunkViewsEqual(
        chunk({ entries: [statusEntry("status-1", 0, "interrupted")] }),
        chunk({ entries: [statusEntry("status-1", 0, "failed")] }),
      ),
    ).toBe(false);
  });

  it("compares nullable chunk views", () => {
    expect(areTranscriptChunkViewsEqual(null, null)).toBe(true);
    expect(areTranscriptChunkViewsEqual(null, chunk())).toBe(false);
    expect(areTranscriptChunkViewsEqual(chunk(), null)).toBe(false);
  });
});
