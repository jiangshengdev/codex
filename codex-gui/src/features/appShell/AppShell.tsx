import { Alert, Toast } from "@heroui/react";
import { Trans } from "@lingui/react/macro";
import { useRef, type ReactNode } from "react";
import { ComposerFocusContext } from "@/features/composerEditor/composerFocusContext";
import { FailureDiagnosticModal } from "@/feedback/FailureDiagnosticModal";
import { FailureLayout } from "@/feedback/FailureLayout";
import type { GuiRouteTarget } from "@/features/browserLaunch/guiRouteTarget";
import type { GuiHostStatus } from "@/features/guiHost/guiHostClient";
import { aggregateErrorText } from "@/text/aggregateErrorText";
import {
  useActiveThreadCollectionSnapshot,
  useActiveThreadSessionSnapshot,
  useAppCapabilities,
} from "./AppCapabilities";
import { AppShellTopBar } from "./AppShellTopBar";
import { ConnectionRecoveryNotice } from "./ConnectionRecoveryNotice";
import { AppShellNotices } from "./AppShellNotices";
import { BrowserNotificationPermission } from "@/features/taskNotifications/BrowserNotificationPermission";

export type AppShellProps = { children: ReactNode };

function GuiHostErrorAlert({ status }: { status: GuiHostStatus }) {
  if (status.label !== "error") {
    return null;
  }

  return (
    <Alert className="w-full" status="danger">
      <Alert.Indicator />
      <FailureLayout>
        <Alert.Content>
          <Alert.Title>
            <Trans>Unable to start Codex GUI</Trans>
          </Alert.Title>
          <Alert.Description>
            <Trans>Codex GUI could not be started.</Trans>
          </Alert.Description>
          {status.message ? (
            <FailureDiagnosticModal triggerClassName="mt-2 self-start">
              {status.message}
            </FailureDiagnosticModal>
          ) : null}
        </Alert.Content>
      </FailureLayout>
    </Alert>
  );
}

export function AppShell({ children }: AppShellProps) {
  const composerFocus = useRef<(() => boolean) | null>(null);
  const { routeTarget, status, connectionRecovery, activeThreadSession } = useAppCapabilities();
  const collection = useActiveThreadCollectionSnapshot();
  const snapshot = useActiveThreadSessionSnapshot();
  const isCurrentTask = routeTarget.type === "currentTask";
  const isDetail = isCurrentTask || routeTarget.type === "historyDetail";
  const floating = isCurrentTask
    ? (snapshot.phase === "active" || snapshot.phase === "projectionUnavailable") &&
      snapshot.threadId === routeTarget.threadId
    : status.label === "initialized" || activeThreadSession != null;

  return (
    <ComposerFocusContext value={composerFocus}>
      <div
        className="flex min-h-svh w-full flex-col bg-background text-foreground"
        data-app-shell-content-layout={contentLayoutForRouteTarget(routeTarget)}
      >
        <Toast.Provider placement="top" />
        <AppShellTopBar />
        <div aria-hidden="true" className="h-14 shrink-0" />
        <div className={isDetail ? "app-shell-content-boundary task-page-layout" : "contents"}>
          <AppShellNotices
            contained={isDetail}
            floating={floating}
            notices={
              <>
                <BrowserNotificationPermission />
                {connectionRecovery == null ? <GuiHostErrorAlert status={status} /> : null}
                {status.label === "closed" || connectionRecovery != null ? (
                  <ConnectionRecoveryNotice
                    recovery={connectionRecovery}
                    hasRetainedSession={activeThreadSession != null}
                  />
                ) : null}
                {collection.errors.map(({ operation, threadId, error }) => {
                  const diagnostic = aggregateErrorText(error);

                  return (
                    <Alert key={`${operation}:${threadId ?? ""}`} role="alert" status="danger">
                      <Alert.Indicator />
                      <FailureLayout>
                        <Alert.Content>
                          <Alert.Title>
                            <Trans>Unable to update the task list</Trans>
                          </Alert.Title>
                          <Alert.Description>
                            <Trans>The task list could not be updated.</Trans>
                          </Alert.Description>
                          {diagnostic ? (
                            <FailureDiagnosticModal triggerClassName="mt-2 self-start">
                              {diagnostic}
                            </FailureDiagnosticModal>
                          ) : null}
                        </Alert.Content>
                      </FailureLayout>
                    </Alert>
                  );
                })}
              </>
            }
          >
            {children}
          </AppShellNotices>
        </div>
      </div>
    </ComposerFocusContext>
  );
}

function contentLayoutForRouteTarget(routeTarget: GuiRouteTarget): "reading" | "wide" {
  switch (routeTarget.type) {
    case "currentTask":
    case "historyDetail":
    case "newTask":
    case "shortcuts":
      return "reading";
    case "historyList":
      return "wide";
  }

  routeTarget satisfies never;
}
