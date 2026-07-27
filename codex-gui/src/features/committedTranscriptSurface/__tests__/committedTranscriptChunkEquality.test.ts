import { describe, expect, it } from "vitest";
import type {
  TranscriptChunkView,
  TranscriptEntry,
} from "@/features/transcriptState/transcriptStateSlice";
import { areTranscriptChunkViewsEqual } from "../committedTranscriptChunkEquality";

type TranscriptMessageEntry = Extract<TranscriptEntry, { type: "message" }>;
type TranscriptStatusEntry = Extract<TranscriptEntry, { type: "status" }>;
type TranscriptActivityEntry = Extract<TranscriptEntry, { type: "activity" }>;

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

const activityEntry = (
  overrides: Partial<Pick<TranscriptActivityEntry, "copy" | "details" | "revision">> = {},
): TranscriptActivityEntry => ({
  type: "activity",
  id: "activity-1",
  turnId: "turn-1",
  copy: { kind: "agentSpawned", receiver: "receiver-a", model: "gpt-5", reasoningEffort: "high" },
  details: [
    { kind: "raw", text: "Review the transcript state" },
    {
      kind: "copy",
      copy: { kind: "agentStatus", receiver: "receiver-a", status: "running", message: null },
    },
  ],
  revision: 0,
  ...overrides,
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

  it("treats fresh semantic activity objects as equal when all rendered fields match", () => {
    const previous = chunk({ entries: [activityEntry()] });
    const next = chunk({ entries: [activityEntry()] });

    expect(areTranscriptChunkViewsEqual(previous, next)).toBe(true);
  });

  it("detects semantic activity copy, details, and revision changes", () => {
    const previous = chunk({ entries: [activityEntry()] });
    const changes: TranscriptActivityEntry[] = [
      activityEntry({ copy: { kind: "agentSpawnFailed" } }),
      activityEntry({
        copy: {
          kind: "agentSpawned",
          receiver: "receiver-b",
          model: "gpt-5",
          reasoningEffort: "high",
        },
      }),
      activityEntry({
        copy: {
          kind: "agentSpawned",
          receiver: "receiver-a",
          model: "gpt-5-mini",
          reasoningEffort: "high",
        },
      }),
      activityEntry({
        copy: {
          kind: "agentSpawned",
          receiver: "receiver-a",
          model: "gpt-5",
          reasoningEffort: "medium",
        },
      }),
      activityEntry({ details: [{ kind: "raw", text: "Updated prompt" }] }),
      activityEntry({
        details: [
          {
            kind: "copy",
            copy: {
              kind: "agentStatus",
              receiver: "receiver-b",
              status: "completed",
              message: "Done",
            },
          },
        ],
      }),
    ];
    for (const changed of changes) {
      expect(areTranscriptChunkViewsEqual(previous, chunk({ entries: [changed] }))).toBe(false);
    }
    expect(
      areTranscriptChunkViewsEqual(previous, chunk({ entries: [activityEntry({ revision: 1 })] })),
    ).toBe(false);
  });

  it("compares nullable chunk views", () => {
    expect(areTranscriptChunkViewsEqual(null, null)).toBe(true);
    expect(areTranscriptChunkViewsEqual(null, chunk())).toBe(false);
    expect(areTranscriptChunkViewsEqual(chunk(), null)).toBe(false);
  });
});
