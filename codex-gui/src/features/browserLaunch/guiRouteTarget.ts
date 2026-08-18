import type { MakeRouteMatchUnion } from "@tanstack/react-router";
import { CURRENT_TASK_PATH_SEGMENT, HISTORY_PATH_SEGMENT } from "@codex-gui-host-contract";

export const CURRENT_TASK_ROUTE_PATH = `/${CURRENT_TASK_PATH_SEGMENT}/$threadId` as const;
export const HISTORY_LIST_ROUTE_PATH = `/${HISTORY_PATH_SEGMENT}` as const;
export const HISTORY_DETAIL_ROUTE_PATH = `${HISTORY_LIST_ROUTE_PATH}/$threadId` as const;

const threadIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type GuiRouteTarget =
  | Readonly<{ type: "currentTask"; threadId: string }>
  | Readonly<{ type: "historyList" }>
  | Readonly<{ type: "historyDetail"; threadId: string }>;

type GuiRouteMatch = MakeRouteMatchUnion;

export function selectGuiRouteTarget(matches: readonly GuiRouteMatch[]): GuiRouteTarget | null {
  if (
    matches.some(
      (match) =>
        match.status !== "success" ||
        match.globalNotFound === true ||
        match.error != null ||
        match.paramsError != null ||
        match.searchError != null,
    )
  ) {
    return null;
  }

  const match = matches.at(-1);
  if (match == null) {
    return null;
  }

  switch (match.fullPath) {
    case CURRENT_TASK_ROUTE_PATH: {
      const threadId = threadIdFromParams(match.params);
      return threadId == null ? null : { type: "currentTask", threadId };
    }
    case HISTORY_LIST_ROUTE_PATH:
      return { type: "historyList" };
    case HISTORY_DETAIL_ROUTE_PATH: {
      const threadId = threadIdFromParams(match.params);
      return threadId == null ? null : { type: "historyDetail", threadId };
    }
    default:
      return null;
  }
}

export function validateEmptyRouteSearch(search: Record<string, unknown>): Record<string, never> {
  if (Object.keys(search).length > 0) {
    throw new Error("Query parameters are not supported");
  }
  return {};
}

export function isValidThreadId(value: unknown): value is string {
  return typeof value === "string" && threadIdPattern.test(value);
}

function threadIdFromParams(params: Readonly<Record<string, unknown>>): string | null {
  const threadId = params.threadId;
  return isValidThreadId(threadId) ? threadId : null;
}
