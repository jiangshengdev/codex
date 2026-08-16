import type {
  TranscriptActivityDetail,
  TranscriptChunk,
  TranscriptChunkView,
  TranscriptCollabAgentStateSummary,
  TranscriptCollabAgentStoredEntry,
  TranscriptCollabAgentView,
  TranscriptContextPage,
  TranscriptEntryId,
  TranscriptEntryView,
  TranscriptGlobalStatus,
  TranscriptState,
  TranscriptStoredEntry,
  TranscriptSubAgentActivityView,
  TranscriptTurn,
  TranscriptTurnFragment,
} from "./transcriptStateModel";

export const selectCommittedTranscriptScrollCommitKeyFromTranscriptState = (
  transcriptState: TranscriptState,
): string | null => transcriptState.committedScrollCommitKey;

export const selectTranscriptLiveScrollPulseFromTranscriptState = (
  transcriptState: TranscriptState,
): number => transcriptState.liveScrollPulse;

export const selectTranscriptTurnIdsFromTranscriptState = (
  transcriptState: TranscriptState,
): string[] => transcriptState.turnIds;

export const selectTranscriptTurnFromTranscriptState = (
  transcriptState: TranscriptState,
  turnId: string,
): TranscriptTurn | null => transcriptState.turnsById[turnId] ?? null;

export const selectTranscriptContextPageIdsFromTranscriptState = (
  transcriptState: TranscriptState,
): string[] => transcriptState.contextPageIds;

export const transcriptContextPageTopology = (
  transcriptState: TranscriptState,
  pageId: string,
): TranscriptContextPage | null => transcriptState.contextPagesById[pageId] ?? null;

export const transcriptTurnFragmentTopology = (
  transcriptState: TranscriptState,
  fragmentId: string,
): TranscriptTurnFragment | null => transcriptState.turnFragmentsById[fragmentId] ?? null;

export const selectTranscriptGlobalStatusFromTranscriptState = (
  transcriptState: TranscriptState,
): TranscriptGlobalStatus[] => transcriptState.globalStatus;

const lastTranscriptFragmentIdsByTurnIdCache = new WeakMap<
  TranscriptState["contextPagesById"],
  Record<string, string>
>();

export const selectLastTranscriptFragmentIdsByTurnIdFromTranscriptState = (
  transcriptState: TranscriptState,
): Record<string, string> => {
  const cached = lastTranscriptFragmentIdsByTurnIdCache.get(transcriptState.contextPagesById);
  if (cached != null) {
    return cached;
  }

  const result: Record<string, string> = {};
  for (const pageId of transcriptState.contextPageIds) {
    const page = transcriptContextPageTopology(transcriptState, pageId);
    if (page == null) {
      continue;
    }
    for (const fragmentId of page.turnFragmentIds) {
      const fragment = transcriptTurnFragmentTopology(transcriptState, fragmentId);
      if (fragment != null) {
        result[fragment.turnId] = fragment.id;
      }
    }
  }

  lastTranscriptFragmentIdsByTurnIdCache.set(transcriptState.contextPagesById, result);
  return result;
};

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

type TranscriptCollabAgentPresentation = Pick<TranscriptCollabAgentView, "title" | "details">;

const rawActivityDetail = (text: string): TranscriptActivityDetail => ({ kind: "raw", text });

const copyActivityDetail = (
  copy: Extract<TranscriptActivityDetail, { kind: "copy" }>["copy"],
): TranscriptActivityDetail => ({ kind: "copy", copy });

const agentStateDetail = (
  summary: TranscriptCollabAgentStateSummary,
  threadId: TranscriptCollabAgentStateSummary["threadId"] | null,
): TranscriptActivityDetail =>
  copyActivityDetail({
    kind: "agentState",
    threadId,
    status: summary.status,
    messagePreview: summary.messagePreview,
  });

const withOmittedDetail = (
  details: TranscriptActivityDetail[],
  omittedCount: number,
): readonly TranscriptActivityDetail[] =>
  omittedCount === 0
    ? details
    : [...details, copyActivityDetail({ kind: "omitted", count: omittedCount })];

const collabAgentPresentation = (
  entry: TranscriptCollabAgentStoredEntry,
): TranscriptCollabAgentPresentation | null => {
  const receiver = entry.receiverThreadIds[0];
  if (entry.toolStatus === "inProgress") {
    switch (entry.tool) {
      case "resumeAgent":
        return receiver == null
          ? null
          : { title: { kind: "agentResuming", receiver }, details: [] };
      case "wait": {
        const title = {
          kind: "agentsWaiting" as const,
          receiver: receiver ?? null,
          receiverCount: entry.receiverCount,
        };
        const details =
          entry.receiverCount > 1
            ? withOmittedDetail(
                entry.receiverThreadIds.map(rawActivityDetail),
                entry.omittedReceiverCount,
              )
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
            ? { kind: "agentSpawnFailed" }
            : {
                kind: "agentSpawned",
                receiver,
                model: entry.model,
                reasoningEffort: entry.reasoningEffort,
              },
        details: entry.promptPreview == null ? [] : [rawActivityDetail(entry.promptPreview)],
      };
    case "sendInput":
      return receiver == null
        ? null
        : {
            title: { kind: "inputSent", receiver },
            details: entry.promptPreview == null ? [] : [rawActivityDetail(entry.promptPreview)],
          };
    case "resumeAgent": {
      if (receiver == null) {
        return null;
      }

      const agentState = entry.agentStateSummaries[0];
      return {
        title: { kind: "agentResumed", receiver },
        details: [
          agentState == null
            ? copyActivityDetail({ kind: "agentResumeFailed" })
            : agentStateDetail(agentState, null),
        ],
      };
    }
    case "wait": {
      const stateDetails = entry.agentStateSummaries.map((summary) =>
        agentStateDetail(summary, summary.threadId),
      );
      return {
        title: { kind: "agentsFinishedWaiting" },
        details:
          stateDetails.length === 0 && entry.omittedAgentStateCount === 0
            ? [copyActivityDetail({ kind: "noAgentsCompletedYet" })]
            : withOmittedDetail(stateDetails, entry.omittedAgentStateCount),
      };
    }
    case "closeAgent":
      return receiver == null ? null : { title: { kind: "agentClosed", receiver }, details: [] };
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
    case "reasoning":
      switch (entry.lifecycle) {
        case "streaming":
          if (entry.title == null) {
            return null;
          }
          return {
            type: "reasoning",
            id: entry.id,
            turnId: entry.turnId,
            lifecycle: entry.lifecycle,
            title: entry.title,
            revision: entry.revision,
          };
        case "completed":
          return {
            type: "reasoning",
            id: entry.id,
            turnId: entry.turnId,
            lifecycle: entry.lifecycle,
            source: entry.summaryParts.join("\n\n"),
            revision: entry.revision,
          };
      }

      entry satisfies never;
      return entry;
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
      let title: TranscriptSubAgentActivityView["title"];
      switch (entry.activityKind) {
        case "started":
          title = { kind: "agentStarted", agentPath: entry.agentPath };
          break;
        case "interacted":
          title = { kind: "agentInteracted", agentPath: entry.agentPath };
          break;
        case "interrupted":
          title = { kind: "agentInterrupted", agentPath: entry.agentPath };
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

export const selectTranscriptEntryFromTranscriptState = transcriptEntryView;

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

export const selectTranscriptChunkFromTranscriptState = transcriptChunkView;
export const selectTranscriptContextPageFromTranscriptState = transcriptContextPageTopology;
export const selectTranscriptTurnFragmentFromTranscriptState = transcriptTurnFragmentTopology;
