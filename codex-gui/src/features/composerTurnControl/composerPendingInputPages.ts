import type {
  ComposerPendingInputCursor,
  ComposerPendingInputLane,
  ComposerPendingInputOwnerGoneResult,
  ComposerPendingInputPageItem,
} from "@/features/composerInputQueue/composerInputQueueContracts";
import type { ActiveThreadComposerRole } from "@/features/activeThreadSession/activeThreadSession";

export const COMPOSER_PENDING_INPUT_PAGE_SIZE = 20;

export type ComposerPendingInputLoadBudgets = Readonly<Record<ComposerPendingInputLane, number>>;

type ComposerPendingInputLanePrefix = Readonly<{
  items: readonly ComposerPendingInputPageItem[];
  nextCursor: ComposerPendingInputCursor | null;
}>;

export type ComposerPendingInputPrefixes = Readonly<{
  revision: number;
  budgets: ComposerPendingInputLoadBudgets;
  ordinary: ComposerPendingInputLanePrefix;
  steer: ComposerPendingInputLanePrefix;
}>;

type ComposerPendingInputPageReader = Pick<ActiveThreadComposerRole, "readPendingInputPage">;

export type ComposerPendingInputPrefixReadResult =
  | Readonly<{ type: "ready"; prefixes: ComposerPendingInputPrefixes }>
  | Readonly<{ type: "stale"; revision: number }>
  | ComposerPendingInputOwnerGoneResult;

export type ComposerPendingInputPrefixRefreshResult =
  | Readonly<{ type: "ready"; prefixes: ComposerPendingInputPrefixes }>
  | Readonly<{
      type: "stale";
      revision: number;
      fallback: ComposerPendingInputPrefixes | null;
    }>
  | ComposerPendingInputOwnerGoneResult;

export function createComposerPendingInputLoadBudgets(): ComposerPendingInputLoadBudgets {
  return {
    ordinary: COMPOSER_PENDING_INPUT_PAGE_SIZE,
    steer: COMPOSER_PENDING_INPUT_PAGE_SIZE,
  };
}

export function increaseComposerPendingInputLoadBudget(
  budgets: ComposerPendingInputLoadBudgets,
  lane: ComposerPendingInputLane,
): ComposerPendingInputLoadBudgets {
  return {
    ...budgets,
    [lane]: budgets[lane] + COMPOSER_PENDING_INPUT_PAGE_SIZE,
  };
}

export function readInitialComposerPendingInputPrefixes(
  reader: ComposerPendingInputPageReader,
  revision: number,
): ComposerPendingInputPrefixReadResult {
  return readComposerPendingInputPrefixes(
    reader,
    revision,
    createComposerPendingInputLoadBudgets(),
  );
}

export function showMoreComposerPendingInputLane(
  reader: ComposerPendingInputPageReader,
  current: ComposerPendingInputPrefixes,
  lane: ComposerPendingInputLane,
): ComposerPendingInputPrefixReadResult {
  const currentLane = current[lane];
  if (currentLane.nextCursor == null) return { type: "ready", prefixes: current };

  const result = reader.readPendingInputPage({
    lane,
    revision: current.revision,
    cursor: currentLane.nextCursor,
    limit: COMPOSER_PENDING_INPUT_PAGE_SIZE,
  });
  if (result.type !== "page") return result;
  if (result.revision !== current.revision) {
    return { type: "stale", revision: result.revision };
  }

  return {
    type: "ready",
    prefixes: {
      ...current,
      budgets: increaseComposerPendingInputLoadBudget(current.budgets, lane),
      [lane]: {
        items: [...currentLane.items, ...result.items],
        nextCursor: result.nextCursor,
      },
    },
  };
}

export function refreshComposerPendingInputPrefixes(
  reader: ComposerPendingInputPageReader,
  revision: number,
  budgets: ComposerPendingInputLoadBudgets,
): ComposerPendingInputPrefixRefreshResult {
  const firstAttempt = readComposerPendingInputPrefixes(reader, revision, budgets);
  if (firstAttempt.type !== "stale") return firstAttempt;

  const secondAttempt = readComposerPendingInputPrefixes(reader, firstAttempt.revision, budgets);
  if (secondAttempt.type !== "stale") return secondAttempt;

  const fallback = readInitialComposerPendingInputPrefixes(reader, secondAttempt.revision);
  if (fallback.type === "unavailable") return fallback;
  if (fallback.type === "stale") {
    return { type: "stale", revision: fallback.revision, fallback: null };
  }
  return {
    type: "stale",
    revision: fallback.prefixes.revision,
    fallback: fallback.prefixes,
  };
}

function readComposerPendingInputPrefixes(
  reader: ComposerPendingInputPageReader,
  revision: number,
  budgets: ComposerPendingInputLoadBudgets,
): ComposerPendingInputPrefixReadResult {
  const steer = readComposerPendingInputLanePrefix(reader, "steer", revision, budgets.steer);
  if (steer.type !== "ready") return steer;

  const ordinary = readComposerPendingInputLanePrefix(
    reader,
    "ordinary",
    revision,
    budgets.ordinary,
  );
  if (ordinary.type !== "ready") return ordinary;

  return {
    type: "ready",
    prefixes: {
      revision,
      budgets: { ...budgets },
      ordinary: ordinary.prefix,
      steer: steer.prefix,
    },
  };
}

type ComposerPendingInputLaneReadResult =
  | Readonly<{ type: "ready"; prefix: ComposerPendingInputLanePrefix }>
  | Exclude<ComposerPendingInputPrefixReadResult, { type: "ready" }>;

function readComposerPendingInputLanePrefix(
  reader: ComposerPendingInputPageReader,
  lane: ComposerPendingInputLane,
  revision: number,
  budget: number,
): ComposerPendingInputLaneReadResult {
  const items: ComposerPendingInputPageItem[] = [];
  let nextCursor: ComposerPendingInputCursor | null = null;
  let remainingBudget = budget;

  while (remainingBudget > 0) {
    const limit = Math.min(COMPOSER_PENDING_INPUT_PAGE_SIZE, remainingBudget);
    const result = reader.readPendingInputPage({ lane, revision, cursor: nextCursor, limit });
    if (result.type !== "page") return result;
    if (result.revision !== revision) return { type: "stale", revision: result.revision };

    items.push(...result.items);
    nextCursor = result.nextCursor;
    remainingBudget -= limit;
    if (nextCursor == null) break;
  }

  return { type: "ready", prefix: { items, nextCursor } };
}
