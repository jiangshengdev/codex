import { Alert, Button } from "@heroui/react";
import { Trans } from "@lingui/react/macro";
import { FailureDiagnosticModal } from "@/feedback/FailureDiagnosticModal";
import type { ActiveThreadActivationFailure } from "@/features/activeThreadSession/activeThreadSession";
import { errorText } from "@/text/errorText";

type ContinueTaskFailureAlertState =
  | Readonly<{ type: "idle" }>
  | Readonly<{ type: "pending" }>
  | Readonly<{ type: "empty" }>
  | Readonly<{ type: "unavailable"; failure: ActiveThreadActivationFailure }>
  | Readonly<{ type: "unexpectedFailure"; error: unknown }>;

export function ContinueTaskFailureAlert({
  descriptionId,
  navigateToCurrentTask,
  state,
}: Readonly<{
  descriptionId: string;
  navigateToCurrentTask: (threadId: string) => void;
  state: ContinueTaskFailureAlertState;
}>) {
  switch (state.type) {
    case "idle":
    case "pending":
      return null;
    case "unavailable":
      return (
        <ContinueTaskUnavailableAlert
          descriptionId={descriptionId}
          failure={state.failure}
          navigateToCurrentTask={navigateToCurrentTask}
        />
      );
    case "unexpectedFailure":
      return (
        <Alert role="alert" status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>
              <Trans>Unable to continue this task</Trans>
            </Alert.Title>
            <Alert.Description>
              <span className="block" id={descriptionId}>
                <Trans>An unexpected error occurred while continuing the task.</Trans>
              </span>
              <FailureDiagnosticModal>
                <span className="block">
                  <Trans>Diagnostic:</Trans> {errorText(state.error)}
                </span>
              </FailureDiagnosticModal>
            </Alert.Description>
          </Alert.Content>
        </Alert>
      );
    case "empty":
      return (
        <Alert role="alert" status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>
              <Trans>Unable to continue this task</Trans>
            </Alert.Title>
            <Alert.Description id={descriptionId}>
              <Trans>The task could not be activated.</Trans>
            </Alert.Description>
          </Alert.Content>
        </Alert>
      );
  }

  state satisfies never;
  return null;
}

function ContinueTaskUnavailableAlert({
  descriptionId,
  failure,
  navigateToCurrentTask,
}: Readonly<{
  descriptionId: string;
  failure: ActiveThreadActivationFailure;
  navigateToCurrentTask: (threadId: string) => void;
}>) {
  switch (failure.type) {
    case "collectionFailed":
      return (
        <Alert role="alert" status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>
              <Trans>Unable to continue this task</Trans>
            </Alert.Title>
            <Alert.Description id={descriptionId}>
              <Trans>Resolve the task list error above, then try again.</Trans>
            </Alert.Description>
          </Alert.Content>
        </Alert>
      );
    case "switchInProgress":
      return (
        <Alert role="alert" status="warning">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>
              <Trans>Unable to switch tasks yet</Trans>
            </Alert.Title>
            <Alert.Description id={descriptionId}>
              <Trans>Another task switch is already in progress. Try again shortly.</Trans>
            </Alert.Description>
          </Alert.Content>
        </Alert>
      );
    case "currentThreadChanged": {
      const activeThreadId = failure.activeThreadId;
      return (
        <Alert role="alert" status="warning">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>
              <Trans>Unable to continue this task</Trans>
            </Alert.Title>
            <Alert.Description>
              <span className="block" id={descriptionId}>
                <Trans>The task could not be activated.</Trans>
              </span>
            </Alert.Description>
            {activeThreadId == null ? null : (
              <Button
                className="mt-3"
                onPress={() => {
                  navigateToCurrentTask(activeThreadId);
                }}
                variant="secondary"
              >
                <Trans>Return to current task</Trans>
              </Button>
            )}
          </Alert.Content>
        </Alert>
      );
    }
    case "currentThreadUnresolved": {
      const activeThreadId = failure.activeThreadId;
      return (
        <Alert role="alert" status="warning">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>
              <Trans>Unable to switch tasks yet</Trans>
            </Alert.Title>
            <Alert.Description>
              <span className="block" id={descriptionId}>
                <Trans>
                  The current task still has queued or unresolved messages. Return to it before
                  switching.
                </Trans>
              </span>
            </Alert.Description>
            <Button
              className="mt-3"
              onPress={() => {
                navigateToCurrentTask(activeThreadId);
              }}
              variant="secondary"
            >
              <Trans>Return to current task</Trans>
            </Button>
          </Alert.Content>
        </Alert>
      );
    }
    case "connectionLost":
      return (
        <Alert role="alert" status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>
              {failure.progress === "beforeCommit" ? (
                <Trans>Unable to continue this task</Trans>
              ) : (
                <Trans>Task switched, but cannot be opened</Trans>
              )}
            </Alert.Title>
            <Alert.Description>
              <span className="block" id={descriptionId}>
                {failure.progress === "beforeCommit" ? (
                  <Trans>
                    The connection was interrupted before the task switch completed. Reconnect and
                    try again.
                  </Trans>
                ) : (
                  <Trans>
                    The task switch was committed, but the connection was interrupted. Reconnect and
                    confirm the current task.
                  </Trans>
                )}
              </span>
              {failure.cleanupError == null ? null : (
                <FailureDiagnosticModal>
                  <span className="block">
                    <Trans>Cleanup diagnostic:</Trans> {errorText(failure.cleanupError)}
                  </span>
                </FailureDiagnosticModal>
              )}
            </Alert.Description>
          </Alert.Content>
        </Alert>
      );
    case "operationFailed":
      return (
        <Alert role="alert" status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>
              <Trans>Unable to continue this task</Trans>
            </Alert.Title>
            <Alert.Description>
              <span className="block" id={descriptionId}>
                <OperationFailureSummary phase={failure.phase} />
              </span>
              <FailureDiagnosticModal>
                <span className="block">
                  <Trans>Operation diagnostic:</Trans> {errorText(failure.error)}
                </span>
                {failure.cleanupError == null ? null : (
                  <span className="block">
                    <Trans>Cleanup diagnostic:</Trans> {errorText(failure.cleanupError)}
                  </span>
                )}
              </FailureDiagnosticModal>
            </Alert.Description>
          </Alert.Content>
        </Alert>
      );
  }

  failure satisfies never;
  return null;
}

function OperationFailureSummary({
  phase,
}: Readonly<{
  phase: Extract<ActiveThreadActivationFailure, { type: "operationFailed" }>["phase"];
}>) {
  switch (phase) {
    case "resume":
      return <Trans>The task could not be resumed.</Trans>;
    case "attach":
      return <Trans>The task connection could not be prepared.</Trans>;
    case "prepare":
      return <Trans>The task connection could not be prepared.</Trans>;
    case "activate":
      return <Trans>The task could not be activated.</Trans>;
  }

  phase satisfies never;
  return null;
}
