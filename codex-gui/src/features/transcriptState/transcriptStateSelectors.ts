import type {
  TranscriptChunk,
  TranscriptChunkView,
  TranscriptEntryId,
  TranscriptEntryView,
  TranscriptState,
  TranscriptStoredEntry,
} from "./transcriptStateModel";

type TranscriptEntryViewCacheEntry = {
  revision: number;
  view: TranscriptEntryView | null;
};

type TranscriptChunkViewCacheEntry = {
  revision: number;
  view: TranscriptChunkView;
};

const transcriptChunkViewCache = new WeakMap<TranscriptChunk, TranscriptChunkViewCacheEntry>();
const transcriptEntryViewCache = new WeakMap<
  TranscriptStoredEntry,
  TranscriptEntryViewCacheEntry
>();

const createTranscriptEntryView = (entry: TranscriptStoredEntry): TranscriptEntryView | null => {
  switch (entry.type) {
    case "message":
      return {
        type: "message",
        id: entry.id,
        turnId: entry.turnId,
        role: entry.role,
        rendering: {
          mode: entry.sourceKind === "plainText" ? "plainText" : "staticMarkdown",
          source: entry.source,
        },
        revision: entry.revision,
      };
    case "status":
      return {
        type: "status",
        id: entry.id,
        turnId: entry.turnId,
        status: entry.status,
        revision: entry.revision,
      };
    case "subAgentActivity": {
      let title: string;
      switch (entry.activityKind) {
        case "started":
          title = `Started \`${entry.agentPath}\``;
          break;
        case "interacted":
          title = `Interacted with \`${entry.agentPath}\``;
          break;
        case "interrupted":
          title = `Interrupted \`${entry.agentPath}\``;
          break;
        default: {
          const exhaustiveActivityKind: never = entry.activityKind;
          return exhaustiveActivityKind;
        }
      }

      return {
        type: "subAgentActivity",
        id: entry.id,
        turnId: entry.turnId,
        title,
        details: [],
        revision: entry.revision,
      };
    }
    case "live":
      if (entry.transientText.length === 0) {
        return null;
      }

      return {
        type: "message",
        id: entry.id,
        turnId: entry.turnId,
        role: "assistant",
        rendering: { mode: "streamingMarkdown", source: entry.transientText },
        revision: entry.revision,
      };
  }

  const exhaustiveEntry: never = entry;
  return exhaustiveEntry;
};

export const transcriptEntryView = (
  transcriptState: TranscriptState,
  entryId: TranscriptEntryId,
): TranscriptEntryView | null => {
  const entry = transcriptState.entriesById[entryId];
  if (entry == null) {
    return null;
  }

  const cachedEntry = transcriptEntryViewCache.get(entry);
  if (cachedEntry?.revision === entry.revision) {
    return cachedEntry.view;
  }

  const view = createTranscriptEntryView(entry);
  transcriptEntryViewCache.set(entry, { revision: entry.revision, view });
  return view;
};

export const transcriptChunkView = (
  transcriptState: TranscriptState,
  chunkId: string,
): TranscriptChunkView | null => {
  const chunk = transcriptState.chunksById[chunkId];
  if (chunk == null) {
    return null;
  }

  const cachedEntry = transcriptChunkViewCache.get(chunk);
  if (cachedEntry?.revision === chunk.revision) {
    return cachedEntry.view;
  }

  const view: TranscriptChunkView = {
    id: chunk.id,
    turnId: chunk.turnId,
    revision: chunk.revision,
    entries: chunk.entryIds.flatMap((entryId) => {
      const entry = transcriptEntryView(transcriptState, entryId);
      return entry == null ? [] : [entry];
    }),
  };

  transcriptChunkViewCache.set(chunk, { revision: chunk.revision, view });
  return view;
};
