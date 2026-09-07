import { Alert, Toast } from "@heroui/react";
import { Trans } from "@lingui/react/macro";
import type { ReactNode } from "react";
import { FailureDiagnosticModal } from "@/feedback/FailureDiagnosticModal";
import { FailureLayout } from "@/feedback/FailureLayout";
import type { GuiRouteTarget } from "@/features/browserLaunch/guiRouteTarget";
import type { GuiHostStatus } from "@/features/guiHost/guiHostClient";
import { errorText } from "@/text/errorText";
import { useActiveThreadCollectionSnapshot, useAppCapabilities } from "./AppCapabilities";
import { AppShellTopBar } from "./AppShellTopBar";

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

function AppShellTopNotices({ children }: { children: ReactNode }) {
  return (
    <div className="sticky top-14 z-20" data-app-shell-top-notices="">
      <div className="app-shell-content-boundary grid gap-3 pt-3">{children}</div>
    </div>
  );
}

export function AppShell({ children }: AppShellProps) {
  const { routeTarget, status } = useAppCapabilities();
  const collection = useActiveThreadCollectionSnapshot();
  const hasTopNotice = status.label === "error" || collection.errors.length > 0;

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
          {collection.errors.map(({ operation, threadId, error }) => {
            const diagnostic = collectionErrorText(error);

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
        </AppShellTopNotices>
      ) : null}
      {children}
    </div>
  );
}

function collectionErrorText(error: unknown): string {
  return error instanceof AggregateError
    ? error.errors.map(collectionErrorText).join("; ")
    : errorText(error);
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
