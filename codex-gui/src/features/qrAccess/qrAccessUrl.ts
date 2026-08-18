import { TOKEN_FRAGMENT_KEY } from "@codex-gui-host-contract";
import {
  CURRENT_TASK_ROUTE_PATH,
  HISTORY_DETAIL_ROUTE_PATH,
  type GuiRouteTarget,
} from "@/features/browserLaunch/guiRouteTarget";

export type QrAccessUrlInput = {
  authorizationToken: string | null;
  origin: string;
  routeTarget: GuiRouteTarget;
};

export function buildQrAccessUrl({
  authorizationToken,
  origin,
  routeTarget,
}: QrAccessUrlInput): string | null {
  if (authorizationToken == null) {
    return null;
  }

  const pathname = pathnameForRouteTarget(routeTarget);
  if (pathname == null) {
    return null;
  }

  const url = new URL(pathname, origin);
  url.hash = new URLSearchParams({ [TOKEN_FRAGMENT_KEY]: authorizationToken }).toString();
  return url.toString();
}

function pathnameForRouteTarget(routeTarget: GuiRouteTarget): string | null {
  switch (routeTarget.type) {
    case "currentTask":
      return CURRENT_TASK_ROUTE_PATH.replace("$threadId", routeTarget.threadId);
    case "historyList":
      return null;
    case "historyDetail":
      return HISTORY_DETAIL_ROUTE_PATH.replace("$threadId", routeTarget.threadId);
  }

  routeTarget satisfies never;
}
