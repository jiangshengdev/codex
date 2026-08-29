import { Alert, Toast } from "@heroui/react";
import { Trans } from "@lingui/react/macro";
import { useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import type { GuiRouteTarget } from "@/features/browserLaunch/guiRouteTarget";
import type { GuiHostStatus } from "@/features/guiHost/guiHostClient";
import { useAppCapabilities } from "./AppCapabilities";
import { AppShellTopBar } from "./AppShellTopBar";

export type AppShellProps = { children: ReactNode };

function GuiHostErrorAlert({ status }: { status: GuiHostStatus }) {
  if (status.label !== "error") {
    return null;
  }

  return (
    <Alert className="w-full" status="danger">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>
          <Trans>Unable to start Codex GUI</Trans>
        </Alert.Title>
        <Alert.Description>{status.message}</Alert.Description>
      </Alert.Content>
    </Alert>
  );
}

function AppShellTopNotices({ children }: { children: ReactNode }) {
  return (
    <div className="sticky top-14 z-20" data-app-shell-top-notices="">
      <div className="app-shell-content-boundary grid gap-2 pt-3">{children}</div>
    </div>
  );
}

export function AppShell({ children }: AppShellProps) {
  const { routeTarget, status } = useAppCapabilities();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const hasTopNotice = status.label === "error";
  const hasFixedBottomAction = pathname.startsWith("/history/");

  return (
    <div
      className="flex min-h-svh w-full flex-col bg-background text-foreground"
      data-app-shell-content-layout={contentLayoutForRouteTarget(routeTarget)}
    >
      <Toast.Provider placement="top" />
      <AppShellTopBar />
      <div aria-hidden="true" className="h-14 shrink-0" />
      {hasTopNotice ? (
        <AppShellTopNotices>
          <GuiHostErrorAlert status={status} />
        </AppShellTopNotices>
      ) : null}
      {children}
      {hasFixedBottomAction ? (
        <div aria-hidden="true" className="h-24 shrink-0" data-app-shell-bottom-action-space="" />
      ) : null}
    </div>
  );
}

function contentLayoutForRouteTarget(routeTarget: GuiRouteTarget): "reading" | "wide" {
  switch (routeTarget.type) {
    case "currentTask":
    case "historyDetail":
      return "reading";
    case "historyList":
      return "wide";
  }

  routeTarget satisfies never;
}
