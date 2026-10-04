import { Alert } from "@heroui/react";
import { Trans } from "@lingui/react/macro";
import { FailureDiagnosticModal } from "@/feedback/FailureDiagnosticModal";
import { FailureLayout } from "@/feedback/FailureLayout";
import { RetryActionButton } from "@/feedback/RetryActionButton";
import { errorText } from "@/text/errorText";
import type { GuiHostConnectionRecovery } from "./guiHostConnectionLifecycle";

export function ConnectionRecoveryNotice({
  recovery,
  hasRetainedSession,
}: Readonly<{ recovery: GuiHostConnectionRecovery | null; hasRetainedSession: boolean }>) {
  return (
    <Alert
      role={recovery?.error != null ? "alert" : "status"}
      status={recovery?.error != null ? "danger" : "warning"}
    >
      <Alert.Indicator />
      <FailureLayout
        actions={
          recovery == null ? null : (
            <RetryActionButton
              isPending={recovery.pending}
              onPress={recovery.reconnect}
              pendingChildren={
                <Trans comment="Shared GUI connection is being re-established">Reconnecting…</Trans>
              }
              size="sm"
              variant="primary"
            >
              <Trans comment="Manually re-establish the shared GUI host connection">
                Reconnect
              </Trans>
            </RetryActionButton>
          )
        }
      >
        <Alert.Content>
          <Alert.Title>
            {hasRetainedSession ? (
              <Trans comment="GUI connection ended; retained conversations remain read-only">
                Connection closed
              </Trans>
            ) : (
              <Trans>Unable to start Codex GUI</Trans>
            )}
          </Alert.Title>
          <Alert.Description>
            {hasRetainedSession ? (
              <Trans comment="Shown above retained tasks after the GUI host connection closes">
                Content may not be up to date. Your conversations and input are still here.
              </Trans>
            ) : (
              <Trans>Codex GUI could not be started.</Trans>
            )}
          </Alert.Description>
          {recovery?.error != null ? (
            <>
              <Alert.Description>
                <Trans comment="Shared GUI reconnect failed; retained input remains protected">
                  The connection could not be restored. You can try again.
                </Trans>
              </Alert.Description>
              <FailureDiagnosticModal triggerClassName="mt-2 self-start" triggerSize="sm">
                {errorText(recovery.error)}
              </FailureDiagnosticModal>
            </>
          ) : null}
        </Alert.Content>
      </FailureLayout>
    </Alert>
  );
}
