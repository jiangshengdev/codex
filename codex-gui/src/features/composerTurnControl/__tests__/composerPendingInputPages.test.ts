import { describe, expect, it, vi } from "vitest";
import type {
  ComposerPendingInputCursor,
  ComposerPendingInputDisplayKey,
  ComposerPendingInputLane,
  ComposerPendingInputPageItem,
  ComposerPendingInputPageResult,
} from "@/features/composerInputQueue/composerInputQueueContracts";
import type { ComposerInputQueueCoordinator } from "@/features/composerInputQueue/composerInputQueueCoordinator";
import {
  COMPOSER_PENDING_INPUT_PAGE_SIZE,
  createComposerPendingInputLoadBudgets,
  increaseComposerPendingInputLoadBudget,
  readInitialComposerPendingInputPrefixes,
  refreshComposerPendingInputPrefixes,
  showMoreComposerPendingInputLane,
} from "../composerPendingInputPages";

type LaneItems = Readonly<
  Record<ComposerPendingInputLane, readonly ComposerPendingInputPageItem[]>
>;

function item(id: string, lane: ComposerPendingInputLane): ComposerPendingInputPageItem {
  return {
    key: id as ComposerPendingInputDisplayKey,
    lane,
    management: { type: "manageable" },
    movement: null,
    preview: { type: "text", text: id, truncated: false },
  };
}

function items(prefix: string, lane: ComposerPendingInputLane, count: number) {
  return Array.from({ length: count }, (_, index) => item(`${prefix}-${index + 1}`, lane));
}

function itemIds(entries: readonly ComposerPendingInputPageItem[]): string[] {
  return entries.map(({ preview }) => {
    if (preview.type !== "text") throw new Error("expected text preview");
    return preview.text;
  });
}

function page(
  revision: number,
  entries: readonly ComposerPendingInputPageItem[],
  nextCursor: ComposerPendingInputCursor | null = null,
): ComposerPendingInputPageResult {
  return { type: "page", revision, items: entries, nextCursor };
}

function createPagedReader(revisions: Readonly<Record<number, LaneItems>>) {
  const cursorFacts = new WeakMap<
    ComposerPendingInputCursor,
    Readonly<{ lane: ComposerPendingInputLane; offset: number; revision: number }>
  >();
  return vi.fn<ComposerInputQueueCoordinator["readPendingInputPage"]>((request) => {
    const revisionItems = revisions[request.revision];
    if (revisionItems == null) throw new Error(`missing revision ${request.revision}`);
    const cursor = request.cursor == null ? null : cursorFacts.get(request.cursor);
    if (
      request.cursor != null &&
      (cursor == null || cursor.lane !== request.lane || cursor.revision !== request.revision)
    ) {
      throw new Error("invalid cursor");
    }
    const offset = cursor?.offset ?? 0;
    const laneItems = revisionItems[request.lane];
    const entries = laneItems.slice(offset, offset + request.limit);
    const nextOffset = offset + entries.length;
    let nextCursor: ComposerPendingInputCursor | null = null;
    if (nextOffset < laneItems.length) {
      nextCursor = {} as ComposerPendingInputCursor;
      cursorFacts.set(nextCursor, {
        lane: request.lane,
        offset: nextOffset,
        revision: request.revision,
      });
    }
    return page(request.revision, entries, nextCursor);
  });
}

function asReader(readPendingInputPage: ComposerInputQueueCoordinator["readPendingInputPage"]) {
  return { readPendingInputPage };
}

describe("composer pending input page prefixes", () => {
  it("reads both initial lane prefixes at the same revision and page size", () => {
    const readPage = createPagedReader({
      7: {
        ordinary: items("ordinary", "ordinary", 25),
        steer: items("steer", "steer", 22),
      },
    });

    const result = readInitialComposerPendingInputPrefixes(asReader(readPage), 7);

    expect(result).toMatchObject({
      type: "ready",
      prefixes: {
        revision: 7,
        budgets: { ordinary: 20, steer: 20 },
      },
    });
    if (result.type !== "ready") throw new Error("expected ready prefixes");
    expect(result.prefixes.steer.items).toHaveLength(20);
    expect(result.prefixes.ordinary.items).toHaveLength(20);
    expect(readPage).toHaveBeenNthCalledWith(1, {
      lane: "steer",
      revision: 7,
      cursor: null,
      limit: COMPOSER_PENDING_INPUT_PAGE_SIZE,
    });
    expect(readPage).toHaveBeenNthCalledWith(2, {
      lane: "ordinary",
      revision: 7,
      cursor: null,
      limit: COMPOSER_PENDING_INPUT_PAGE_SIZE,
    });
  });

  it("loads only the requested lane and records request capacity independently of item count", () => {
    const readPage = createPagedReader({
      3: {
        ordinary: items("ordinary", "ordinary", 25),
        steer: items("steer", "steer", 45),
      },
    });
    const initial = readInitialComposerPendingInputPrefixes(asReader(readPage), 3);
    if (initial.type !== "ready") throw new Error("expected ready prefixes");

    const ordinaryMore = showMoreComposerPendingInputLane(
      asReader(readPage),
      initial.prefixes,
      "ordinary",
    );
    if (ordinaryMore.type !== "ready") throw new Error("expected ordinary page");
    expect(ordinaryMore.prefixes.budgets).toEqual({ ordinary: 40, steer: 20 });
    expect(ordinaryMore.prefixes.ordinary.items).toHaveLength(25);
    expect(ordinaryMore.prefixes.ordinary.nextCursor).toBeNull();
    expect(ordinaryMore.prefixes.steer).toBe(initial.prefixes.steer);

    const steerMore = showMoreComposerPendingInputLane(
      asReader(readPage),
      ordinaryMore.prefixes,
      "steer",
    );
    if (steerMore.type !== "ready") throw new Error("expected steer page");
    expect(steerMore.prefixes.budgets).toEqual({ ordinary: 40, steer: 40 });
    expect(steerMore.prefixes.steer.items).toHaveLength(40);
    expect(steerMore.prefixes.ordinary).toBe(ordinaryMore.prefixes.ordinary);
  });

  it("does not increase a lane budget or publish a partial append when Show more fails", () => {
    const cursor = {} as ComposerPendingInputCursor;
    const current = {
      revision: 4,
      budgets: createComposerPendingInputLoadBudgets(),
      ordinary: { items: items("ordinary", "ordinary", 20), nextCursor: cursor },
      steer: { items: items("steer", "steer", 2), nextCursor: null },
    };
    const readPage = vi
      .fn<ComposerInputQueueCoordinator["readPendingInputPage"]>()
      .mockReturnValue({ type: "stale", revision: 5 });

    expect(showMoreComposerPendingInputLane(asReader(readPage), current, "ordinary")).toEqual({
      type: "stale",
      revision: 5,
    });
    expect(current.budgets).toEqual({ ordinary: 20, steer: 20 });
    expect(current.ordinary.items).toHaveLength(20);
  });

  it("refreshes different lane budgets from cursor null without deriving them from item counts", () => {
    const readPage = createPagedReader({
      9: {
        ordinary: items("ordinary", "ordinary", 23),
        steer: items("steer", "steer", 51),
      },
    });
    const budgets = increaseComposerPendingInputLoadBudget(
      increaseComposerPendingInputLoadBudget(
        increaseComposerPendingInputLoadBudget(createComposerPendingInputLoadBudgets(), "steer"),
        "steer",
      ),
      "ordinary",
    );

    const result = refreshComposerPendingInputPrefixes(asReader(readPage), 9, budgets);

    if (result.type !== "ready") throw new Error("expected refreshed prefixes");
    expect(result.prefixes.budgets).toEqual({ ordinary: 40, steer: 60 });
    expect(result.prefixes.ordinary.items).toHaveLength(23);
    expect(result.prefixes.steer.items).toHaveLength(51);
    expect(readPage.mock.calls.map(([request]) => [request.lane, request.limit])).toEqual([
      ["steer", 20],
      ["steer", 20],
      ["steer", 20],
      ["ordinary", 20],
      ["ordinary", 20],
    ]);
  });

  it("discards a stale attempt and restarts both lane prefixes once at the returned revision", () => {
    const readPage = createPagedReader({
      11: {
        ordinary: items("new-ordinary", "ordinary", 3),
        steer: items("new-steer", "steer", 2),
      },
    });
    readPage.mockReturnValueOnce({ type: "stale", revision: 11 });

    const result = refreshComposerPendingInputPrefixes(
      asReader(readPage),
      10,
      createComposerPendingInputLoadBudgets(),
    );

    if (result.type !== "ready") throw new Error("expected restarted prefixes");
    expect(result.prefixes.revision).toBe(11);
    expect(itemIds(result.prefixes.steer.items)).toEqual(["new-steer-1", "new-steer-2"]);
    expect(itemIds(result.prefixes.ordinary.items)).toEqual([
      "new-ordinary-1",
      "new-ordinary-2",
      "new-ordinary-3",
    ]);
    expect(readPage.mock.calls.map(([request]) => [request.revision, request.lane])).toEqual([
      [10, "steer"],
      [11, "steer"],
      [11, "ordinary"],
    ]);
  });

  it("returns a bounded stale failure with an atomic latest initial fallback", () => {
    const fallbackSteer = items("fallback-steer", "steer", 2);
    const fallbackOrdinary = items("fallback-ordinary", "ordinary", 3);
    const readPage = vi
      .fn<ComposerInputQueueCoordinator["readPendingInputPage"]>()
      .mockReturnValueOnce({ type: "stale", revision: 11 })
      .mockReturnValueOnce(page(11, items("discarded-steer", "steer", 1)))
      .mockReturnValueOnce({ type: "stale", revision: 12 })
      .mockReturnValueOnce(page(12, fallbackSteer))
      .mockReturnValueOnce(page(12, fallbackOrdinary));

    const result = refreshComposerPendingInputPrefixes(
      asReader(readPage),
      10,
      createComposerPendingInputLoadBudgets(),
    );

    expect(result).toEqual({
      type: "stale",
      revision: 12,
      fallback: {
        revision: 12,
        budgets: { ordinary: 20, steer: 20 },
        ordinary: { items: fallbackOrdinary, nextCursor: null },
        steer: { items: fallbackSteer, nextCursor: null },
      },
    });
    expect(readPage).toHaveBeenCalledTimes(5);
  });

  it("does not chase another revision when the fallback is stale", () => {
    const readPage = vi
      .fn<ComposerInputQueueCoordinator["readPendingInputPage"]>()
      .mockReturnValueOnce({ type: "stale", revision: 2 })
      .mockReturnValueOnce({ type: "stale", revision: 3 })
      .mockReturnValueOnce({ type: "stale", revision: 4 });

    expect(
      refreshComposerPendingInputPrefixes(
        asReader(readPage),
        1,
        createComposerPendingInputLoadBudgets(),
      ),
    ).toEqual({ type: "stale", revision: 4, fallback: null });
    expect(readPage).toHaveBeenCalledTimes(3);
  });

  it("passes owner loss through during refresh and fallback reads", () => {
    const ownerGone = {
      type: "unavailable" as const,
      scope: "ownerGone" as const,
      reason: "ownerReplaced" as const,
    };
    const immediate = vi
      .fn<ComposerInputQueueCoordinator["readPendingInputPage"]>()
      .mockReturnValue(ownerGone);
    expect(
      refreshComposerPendingInputPrefixes(
        asReader(immediate),
        1,
        createComposerPendingInputLoadBudgets(),
      ),
    ).toEqual(ownerGone);

    const duringFallback = vi
      .fn<ComposerInputQueueCoordinator["readPendingInputPage"]>()
      .mockReturnValueOnce({ type: "stale", revision: 2 })
      .mockReturnValueOnce({ type: "stale", revision: 3 })
      .mockReturnValueOnce(ownerGone);
    expect(
      refreshComposerPendingInputPrefixes(
        asReader(duringFallback),
        1,
        createComposerPendingInputLoadBudgets(),
      ),
    ).toEqual(ownerGone);
    expect(duringFallback).toHaveBeenCalledTimes(3);
  });
});
