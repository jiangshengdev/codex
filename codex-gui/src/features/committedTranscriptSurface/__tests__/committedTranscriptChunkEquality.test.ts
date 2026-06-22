import { describe, expect, it } from "vitest";
import type {
  TranscriptChunkView,
  TranscriptEntry,
} from "@/features/transcriptState/transcriptStateSlice";
import { areTranscriptChunkViewsEqual } from "../committedTranscriptChunkEquality";

type TranscriptMessageEntry = Extract<TranscriptEntry, { type: "message" }>;

const entry = (id: string, revision: number): TranscriptMessageEntry => ({
  type: "message",
  id,
  turnId: "turn-1",
  role: "assistant",
  source: `source ${id} ${String(revision)}`,
  sourceKind: "plainText",
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
  it("treats fresh chunk and entry objects as equal when stable ids and revisions match", () => {
    const previous = chunk({
      entries: [
        { ...entry("entry-1", 0), source: "previous source" },
        { ...entry("entry-2", 0), source: "previous second source" },
      ],
    });
    const next = chunk({
      entries: [
        { ...entry("entry-1", 0), source: "next source" },
        { ...entry("entry-2", 0), source: "next second source" },
      ],
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

  it("compares nullable chunk views", () => {
    expect(areTranscriptChunkViewsEqual(null, null)).toBe(true);
    expect(areTranscriptChunkViewsEqual(null, chunk())).toBe(false);
    expect(areTranscriptChunkViewsEqual(chunk(), null)).toBe(false);
  });
});
