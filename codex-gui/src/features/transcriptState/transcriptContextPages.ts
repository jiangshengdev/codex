import {
  transcriptEntryIdFor,
  type TranscriptContextPage,
  type TranscriptEntryId,
  type TranscriptState,
  type TranscriptTurnFragment,
} from "./transcriptStateModel";

const currentContextPage = (state: TranscriptState): TranscriptContextPage => {
  const pageId = state.contextPageIds.at(-1);
  const page = pageId == null ? null : state.contextPagesById[pageId];
  if (page == null) {
    throw new Error("transcript context topology must contain an active page");
  }
  return page;
};

const createTurnFragment = (
  state: TranscriptState,
  page: TranscriptContextPage,
  turnId: string,
): TranscriptTurnFragment => {
  const fragment: TranscriptTurnFragment = {
    id: JSON.stringify([page.id, turnId, page.turnFragmentIds.length]),
    turnId,
    leadingPromptEntryId: null,
    middleChunkIds: [],
    middleEntryCount: 0,
    finalAssistantEntryIds: [],
  };
  state.turnFragmentsById[fragment.id] = fragment;
  page.turnFragmentIds.push(fragment.id);
  return fragment;
};

const currentTurnFragment = (state: TranscriptState, turnId: string): TranscriptTurnFragment => {
  const page = currentContextPage(state);
  const lastFragmentId = page.turnFragmentIds.at(-1);
  const lastFragment = lastFragmentId == null ? null : state.turnFragmentsById[lastFragmentId];
  return lastFragment?.turnId === turnId ? lastFragment : createTurnFragment(state, page, turnId);
};

export const ensureTranscriptEntryFragment = (
  state: TranscriptState,
  turnId: string,
  entryId: TranscriptEntryId,
): TranscriptTurnFragment => {
  const existingFragmentId = state.entryFragmentById[entryId];
  const existingFragment =
    existingFragmentId == null ? null : state.turnFragmentsById[existingFragmentId];
  if (existingFragment?.turnId === turnId) {
    return existingFragment;
  }

  const fragment = currentTurnFragment(state, turnId);
  state.entryFragmentById[entryId] = fragment.id;
  return fragment;
};

export const appendTranscriptContextBoundary = (
  state: TranscriptState,
  turnId: string,
  itemId: string,
): boolean => {
  const boundaryId = transcriptEntryIdFor(turnId, itemId);
  if (state.contextBoundaryIdsById[boundaryId]) {
    return false;
  }

  state.contextBoundaryIdsById[boundaryId] = true;
  const page: TranscriptContextPage = {
    id: `context-page:${String(state.contextPageIds.length + 1)}`,
    leadingBoundaryId: boundaryId,
    turnFragmentIds: [],
  };
  state.contextPageIds.push(page.id);
  state.contextPagesById[page.id] = page;
  createTurnFragment(state, page, turnId);
  return true;
};

export const appendLeadingEntryToTranscriptFragment = (
  state: TranscriptState,
  turnId: string,
  entryId: TranscriptEntryId,
) => {
  const fragment = ensureTranscriptEntryFragment(state, turnId, entryId);
  fragment.leadingPromptEntryId = entryId;
};

export const appendFinalEntryToTranscriptFragment = (
  state: TranscriptState,
  turnId: string,
  entryId: TranscriptEntryId,
) => {
  const fragment = ensureTranscriptEntryFragment(state, turnId, entryId);
  if (!fragment.finalAssistantEntryIds.includes(entryId)) {
    fragment.finalAssistantEntryIds.push(entryId);
  }
};

export const removeFinalEntryFromTranscriptFragment = (
  state: TranscriptState,
  entryId: TranscriptEntryId,
) => {
  const fragmentId = state.entryFragmentById[entryId];
  const fragment = fragmentId == null ? null : state.turnFragmentsById[fragmentId];
  if (fragment == null) {
    return;
  }
  const entryIndex = fragment.finalAssistantEntryIds.indexOf(entryId);
  if (entryIndex !== -1) {
    fragment.finalAssistantEntryIds.splice(entryIndex, 1);
  }
};

export const transcriptFragmentForMiddleEntry = (
  state: TranscriptState,
  turnId: string,
  entryId: TranscriptEntryId,
): TranscriptTurnFragment => ensureTranscriptEntryFragment(state, turnId, entryId);

export const appendChunkToTranscriptFragment = (
  state: TranscriptState,
  fragment: TranscriptTurnFragment,
  chunkId: string,
) => {
  fragment.middleChunkIds.push(chunkId);
  state.chunkFragmentById[chunkId] = fragment.id;
};

export const removeChunkFromTranscriptFragment = (state: TranscriptState, chunkId: string) => {
  const fragmentId = state.chunkFragmentById[chunkId];
  const fragment = fragmentId == null ? null : state.turnFragmentsById[fragmentId];
  if (fragment != null) {
    const chunkIndex = fragment.middleChunkIds.indexOf(chunkId);
    if (chunkIndex !== -1) {
      fragment.middleChunkIds.splice(chunkIndex, 1);
    }
  }
  Reflect.deleteProperty(state.chunkFragmentById, chunkId);
};

export const adjustTranscriptFragmentMiddleEntryCount = (
  state: TranscriptState,
  entryId: TranscriptEntryId,
  delta: number,
) => {
  const fragmentId = state.entryFragmentById[entryId];
  const fragment = fragmentId == null ? null : state.turnFragmentsById[fragmentId];
  if (fragment != null) {
    fragment.middleEntryCount += delta;
  }
};

export const forgetTranscriptEntryFragment = (
  state: TranscriptState,
  entryId: TranscriptEntryId,
) => {
  Reflect.deleteProperty(state.entryFragmentById, entryId);
};
