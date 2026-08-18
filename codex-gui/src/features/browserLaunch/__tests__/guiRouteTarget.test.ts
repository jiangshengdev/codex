import { describe, expect, it } from "vitest";
import type { MakeRouteMatchUnion } from "@tanstack/react-router";
import {
  CURRENT_TASK_ROUTE_PATH,
  HISTORY_DETAIL_ROUTE_PATH,
  HISTORY_LIST_ROUTE_PATH,
  selectGuiRouteTarget,
  validateEmptyRouteSearch,
} from "../guiRouteTarget";

type RouteMatch = MakeRouteMatchUnion;
const currentThreadId = "11111111-2222-3333-4444-555555555555";
const historyThreadId = "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE";

describe("selectGuiRouteTarget", () => {
  it.each([
    [
      CURRENT_TASK_ROUTE_PATH,
      { threadId: currentThreadId },
      { type: "currentTask", threadId: currentThreadId },
    ],
    [HISTORY_LIST_ROUTE_PATH, {}, { type: "historyList" }],
    [
      HISTORY_DETAIL_ROUTE_PATH,
      { threadId: historyThreadId },
      { type: "historyDetail", threadId: historyThreadId },
    ],
  ] as const)(
    "derives the target for %s from the authoritative match",
    (fullPath, params, expected) => {
      expect(selectGuiRouteTarget([successfulMatch(fullPath, params)])).toEqual(expected);
    },
  );

  it("rejects missing IDs, unmatched paths, pending matches, and search errors", () => {
    expect([
      selectGuiRouteTarget([successfulMatch(CURRENT_TASK_ROUTE_PATH, {})]),
      selectGuiRouteTarget([successfulMatch(HISTORY_DETAIL_ROUTE_PATH, {})]),
      selectGuiRouteTarget([successfulMatch(CURRENT_TASK_ROUTE_PATH, { threadId: "not-a-uuid" })]),
      selectGuiRouteTarget([
        successfulMatch(HISTORY_DETAIL_ROUTE_PATH, {
          threadId: "11111111-2222-3333-4444-55555555555g",
        }),
      ]),
      selectGuiRouteTarget([successfulMatch("/", {})]),
      selectGuiRouteTarget([
        { ...successfulMatch(HISTORY_LIST_ROUTE_PATH, {}), status: "pending" },
      ]),
      selectGuiRouteTarget([
        {
          ...successfulMatch(HISTORY_LIST_ROUTE_PATH, {}),
          searchError: new Error("invalid query"),
        },
      ]),
      selectGuiRouteTarget([]),
    ]).toEqual([null, null, null, null, null, null, null, null]);
  });

  it("rejects extra segments and not-found matches even when a canonical leaf is present", () => {
    expect([
      selectGuiRouteTarget([
        successfulMatch(HISTORY_LIST_ROUTE_PATH, {}),
        successfulMatch("/history/extra", {}),
      ]),
      selectGuiRouteTarget([
        { ...successfulMatch("/", {}), globalNotFound: true },
        successfulMatch(HISTORY_LIST_ROUTE_PATH, {}),
      ]),
      selectGuiRouteTarget([
        { ...successfulMatch(HISTORY_LIST_ROUTE_PATH, {}), status: "notFound" },
      ]),
    ]).toEqual([null, null, null]);
  });
});

describe("validateEmptyRouteSearch", () => {
  it("accepts only an empty query object", () => {
    expect(validateEmptyRouteSearch({})).toEqual({});
    expect(() => validateEmptyRouteSearch({ threadId: "legacy" })).toThrow(
      new Error("Query parameters are not supported"),
    );
    expect(() => validateEmptyRouteSearch({ empty: "" })).toThrow(
      new Error("Query parameters are not supported"),
    );
  });
});

function successfulMatch(fullPath: string, params: Readonly<Record<string, string>>): RouteMatch {
  return {
    fullPath,
    params,
    searchError: undefined,
    status: "success",
  } as RouteMatch;
}
