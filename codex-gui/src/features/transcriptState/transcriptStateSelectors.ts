import type {
  TranscriptChunk,
  TranscriptChunkView,
  TranscriptCollabAgentStateSummary,
  TranscriptCollabAgentStoredEntry,
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

type TranscriptCollabAgentPresentation = {
  title: string;
  details: readonly string[];
};

const collabAgentStateDetail = (summary: TranscriptCollabAgentStateSummary): string => {
  switch (summary.status) {
    case "pendingInit":
      return "Pending init";
    case "running":
      return "Running";
    case "interrupted":
      return "Interrupted";
    case "completed":
      return summary.messagePreview == null || summary.messagePreview.length === 0
        ? "Completed"
        : `Completed - ${summary.messagePreview}`;
    case "errored":
      if (summary.messagePreview == null) {
        return "Error - Agent errored";
      }
      return summary.messagePreview.length === 0 ? "Error" : `Error - ${summary.messagePreview}`;
    case "shutdown":
      return "Shutdown";
    case "notFound":
      return "Not found";
  }

  const exhaustiveStatus: never = summary.status;
  return exhaustiveStatus;
};

const withOmittedDetail = (details: string[], omittedCount: number): readonly string[] =>
  omittedCount === 0 ? details : [...details, `... and ${String(omittedCount)} more`];

const spawnRequestSuffix = (entry: TranscriptCollabAgentStoredEntry): string => {
  if (entry.model == null || entry.reasoningEffort == null) {
    return "";
  }

  const model = entry.model.trim();
  if (model.length > 0) {
    return ` (${model} ${entry.reasoningEffort})`;
  }
  return entry.reasoningEffort === "medium" ? "" : ` (${entry.reasoningEffort})`;
};

const collabAgentPresentation = (
  entry: TranscriptCollabAgentStoredEntry,
): TranscriptCollabAgentPresentation | null => {
  const receiver = entry.receiverThreadIds[0];
  if (entry.toolStatus === "inProgress") {
    switch (entry.tool) {
      case "resumeAgent":
        return receiver == null ? null : { title: `Resuming ${receiver}`, details: [] };
      case "wait": {
        const title =
          entry.receiverCount === 0
            ? "Waiting for agents"
            : entry.receiverCount === 1 && receiver != null
              ? `Waiting for ${receiver}`
              : `Waiting for ${String(entry.receiverCount)} agents`;
        const details =
          entry.receiverCount > 1
            ? withOmittedDetail([...entry.receiverThreadIds], entry.omittedReceiverCount)
            : [];
        return { title, details };
      }
    }

    entry satisfies never;
    return entry;
  }

  switch (entry.tool) {
    case "spawnAgent":
      return {
        title:
          receiver == null
            ? "Agent spawn failed"
            : `Spawned ${receiver}${spawnRequestSuffix(entry)}`,
        details: entry.promptPreview == null ? [] : [entry.promptPreview],
      };
    case "sendInput":
      return receiver == null
        ? null
        : {
            title: `Sent input to ${receiver}`,
            details: entry.promptPreview == null ? [] : [entry.promptPreview],
          };
    case "resumeAgent": {
      if (receiver == null) {
        return null;
      }

      const agentState = entry.agentStateSummaries[0];
      return {
        title: `Resumed ${receiver}`,
        details: [
          agentState == null ? "Error - Agent resume failed" : collabAgentStateDetail(agentState),
        ],
      };
    }
    case "wait": {
      const stateDetails = entry.agentStateSummaries.map(
        (summary) => `${summary.threadId}: ${collabAgentStateDetail(summary)}`,
      );
      return {
        title: "Finished waiting",
        details:
          stateDetails.length === 0 && entry.omittedAgentStateCount === 0
            ? ["No agents completed yet"]
            : withOmittedDetail(stateDetails, entry.omittedAgentStateCount),
      };
    }
    case "closeAgent":
      return receiver == null ? null : { title: `Closed ${receiver}`, details: [] };
  }

  entry satisfies never;
  return entry;
};

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
    case "collabAgent": {
      const presentation = collabAgentPresentation(entry);
      if (presentation == null) {
        return null;
      }

      return {
        type: "collabAgent",
        id: entry.id,
        turnId: entry.turnId,
        title: presentation.title,
        details: presentation.details,
        revision: entry.revision,
      };
    }
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
