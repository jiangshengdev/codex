import { Alert, Toast } from "@heroui/react";
import { Trans } from "@lingui/react/macro";
import type { ReactNode } from "react";
import { FailureDiagnosticModal } from "@/feedback/FailureDiagnosticModal";
import { FailureLayout } from "@/feedback/FailureLayout";
import { ErrorNoticeStack, type ErrorNotice } from "@/feedback/ErrorNoticeStack";
import { useCurrentTaskRecoveryNotices } from "@/features/currentTask/useCurrentTaskRecoveryNotices";
import type { GuiRouteTarget } from "@/features/browserLaunch/guiRouteTarget";
import type { GuiHostStatus } from "@/features/guiHost/guiHostClient";
import { aggregateErrorText } from "@/text/aggregateErrorText";
import { useActiveThreadCollectionSnapshot, useAppCapabilities } from "./AppCapabilities";
import { AppShellTopBar } from "./AppShellTopBar";
import { ConnectionRecoveryNotice } from "./ConnectionRecoveryNotice";

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
  const { routeTarget, status, connectionRecovery, activeThreadSession } = useAppCapabilities();
  const collection = useActiveThreadCollectionSnapshot();
  const taskNotices = useCurrentTaskRecoveryNotices();
  const isCurrentTask = routeTarget.type === "currentTask";
  const notices: ErrorNotice[] = [];
  if (connectionRecovery == null && status.label === "error") {
    notices.push({ id: "host", content: <GuiHostErrorAlert status={status} /> });
  }
  if (status.label === "closed" || connectionRecovery != null) {
    notices.push({
      id: "connection",
      content: (
        <ConnectionRecoveryNotice
          recovery={connectionRecovery}
          hasRetainedSession={activeThreadSession != null}
        />
      ),
    });
  }
  notices.push(...taskNotices);
  for (const { operation, threadId, error } of collection.errors) {
    const diagnostic = aggregateErrorText(error);
    notices.push({
      id: `collection:${operation}:${threadId ?? ""}`,
      content: (
        <Alert role="alert" status="danger">
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
      ),
    });
  }

  return (
    <div
      className="flex min-h-svh w-full flex-col bg-background text-foreground"
      data-app-shell-content-layout={contentLayoutForRouteTarget(routeTarget)}
    >
      <Toast.Provider placement="top" />
      <AppShellTopBar />
      <div aria-hidden="true" className="h-14 shrink-0" />
      <div className={isCurrentTask ? "app-shell-content-boundary task-page-layout" : "contents"}>
        <ErrorNoticeStack notices={notices} />
        {children}
      </div>
    </div>
  );
}

function contentLayoutForRouteTarget(routeTarget: GuiRouteTarget): "reading" | "wide" {
  switch (routeTarget.type) {
    case "currentTask":
    case "historyDetail":
    case "newTask":
      return "reading";
    case "historyList":
      return "wide";
  }

  routeTarget satisfies never;
}
