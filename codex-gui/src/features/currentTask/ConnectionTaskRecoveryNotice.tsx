import { Alert } from "@heroui/react";
import { Trans } from "@lingui/react/macro";
import type { ActiveThreadConnectionState } from "@/features/activeThreadSession/activeThreadSessionContracts";
import { FailureDiagnosticModal } from "@/feedback/FailureDiagnosticModal";
import { FailureLayout } from "@/feedback/FailureLayout";
import { RetryActionButton } from "@/feedback/RetryActionButton";
import { errorText } from "@/text/errorText";

export function ConnectionTaskRecoveryNotice({
  connection,
  canRecover,
  onRecover,
}: Readonly<{
  connection: Extract<ActiveThreadConnectionState, { phase: "unavailable" }>;
  canRecover: boolean;
  onRecover: () => void;
}>) {
  const { recovery } = connection;
  return (
    <Alert
      role={recovery.error == null ? "status" : "alert"}
      status={recovery.error == null ? "warning" : "danger"}
    >
      <Alert.Indicator />
      <FailureLayout
        actions={
          <RetryActionButton
            isDisabled={!canRecover}
            isPending={recovery.pending}
            onPress={onRecover}
            pendingChildren={
              <Trans comment="Restoring one retained task after the GUI reconnects">
                Restoring task…
              </Trans>
            }
            size="sm"
            variant="primary"
          >
            <Trans comment="Retry restoring this task using the already connected GUI host">
              Restore task
            </Trans>
          </RetryActionButton>
        }
      >
        <Alert.Content>
          <Alert.Title>
            <Trans comment="This retained task has not yet resumed live updates">
              Task updates are paused
            </Trans>
          </Alert.Title>
          <Alert.Description>
            <Trans comment="Other tasks may already be restored; this task keeps its old content">
              The content shown here may be out of date. Your input is still here.
            </Trans>
          </Alert.Description>
          {recovery.error != null ? (
            <>
              <Alert.Description>
                <Trans comment="One task failed to restore; the shared connection remains healthy">
                  This task could not be restored. You can try again.
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
