import { Alert } from "@heroui/react";
import { Trans } from "@lingui/react/macro";
import type { ReactNode } from "react";
import type { LiveActiveThreadSessionSnapshot } from "@/features/activeThreadSession/activeThreadSessionContracts";
import { FailureDiagnosticModal } from "@/feedback/FailureDiagnosticModal";
import { FailureLayout } from "@/feedback/FailureLayout";
import { RetryActionButton } from "@/feedback/RetryActionButton";
import { errorText } from "@/text/errorText";

type UnavailableProjection = Extract<
  LiveActiveThreadSessionSnapshot,
  { phase: "projectionUnavailable" }
>;

export function ProjectionRecoveryNotice({
  snapshot,
  onRecover,
}: Readonly<{
  snapshot: UnavailableProjection;
  onRecover: () => void;
}>) {
  const { reason, recovery } = snapshot;
  const diagnostics = [
    `reason: ${reason}`,
    `threadId: ${snapshot.threadId}`,
    `subscriptionId: ${snapshot.subscriptionId}`,
    ...(recovery.error == null ? [] : [errorText(recovery.error)]),
  ].join("\n");

  return (
    <Alert role="alert" status="danger">
      <Alert.Indicator />
      <FailureLayout
        actions={
          <RetryActionButton
            isDisabled={snapshot.connection.phase !== "available"}
            isPending={recovery.pending}
            pendingChildren={
              <Trans comment="Pending button label while restoring this task's message synchronization">
                Restoring sync…
              </Trans>
            }
            onPress={onRecover}
            size="sm"
            variant="primary"
          >
            <Trans comment="Button to restore this task's message synchronization; same label after failure">
              Restore sync
            </Trans>
          </RetryActionButton>
        }
      >
        <Alert.Content>
          <Alert.Title>
            <Trans comment="Current task message updates are paused, not the task itself">
              Message synchronization paused
            </Trans>
          </Alert.Title>
          <Alert.Description>{projectionReasonDescription(reason)}</Alert.Description>
          <Alert.Description>
            <Trans>
              The conversation shown here may be out of date. Restore sync to get the latest
              content.
            </Trans>
          </Alert.Description>
          {recovery.error != null ? (
            <Alert.Description>
              <Trans>Synchronization could not be restored. You can try again.</Trans>
            </Alert.Description>
          ) : null}
          <FailureDiagnosticModal triggerClassName="mt-2 self-start" triggerSize="sm">
            {diagnostics}
          </FailureDiagnosticModal>
        </Alert.Content>
      </FailureLayout>
    </Alert>
  );
}

function projectionReasonDescription(reason: UnavailableProjection["reason"]): ReactNode {
  switch (reason) {
    case "backpressure":
      return <Trans>Message updates have piled up, so synchronization has paused.</Trans>;
    case "commitChainMismatch":
      return (
        <Trans>Message updates arrived out of order, so the conversation may be incomplete.</Trans>
      );
    case "missingTurn":
      return (
        <Trans>
          A message update is missing its associated turn, so it cannot be fully displayed.
        </Trans>
      );
  }
  return reason satisfies never;
}
