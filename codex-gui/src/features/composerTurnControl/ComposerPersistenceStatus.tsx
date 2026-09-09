import { Alert, Button } from "@heroui/react";
import { Trans } from "@lingui/react/macro";
import type { ActiveThreadSessionSnapshot } from "@/features/activeThreadSession/activeThreadSession";
import { FailureDiagnosticModal } from "@/feedback/FailureDiagnosticModal";
import { FailureLayout } from "@/feedback/FailureLayout";

export function ComposerPersistenceStatus({
  sessionSnapshot,
}: Readonly<{
  sessionSnapshot: Extract<
    ActiveThreadSessionSnapshot,
    { phase: "active" | "projectionUnavailable" }
  >;
}>) {
  const {
    composerRole,
    revision,
    composer: { persistence },
  } = sessionSnapshot;
  const enabled =
    sessionSnapshot.phase === "active" && sessionSnapshot.connection.phase === "available";
  return (
    <>
      {persistence.error != null ? (
        <Alert status="danger" role="alert">
          <Alert.Indicator />
          <FailureLayout
            actions={
              <Button
                variant="primary"
                isDisabled={!enabled}
                onPress={() => {
                  composerRole.retryPersistence(revision);
                }}
              >
                <Trans comment="Retries saving the composer draft and queue in this browser tab">
                  Retry saving
                </Trans>
              </Button>
            }
          >
            <Alert.Content>
              <Alert.Title>
                <Trans>Changes could not be saved</Trans>
              </Alert.Title>
              <Alert.Description>
                <Trans>Your input is still here. Sending is blocked until saving succeeds.</Trans>
              </Alert.Description>
              {persistence.error !== "" ? (
                <FailureDiagnosticModal>{persistence.error}</FailureDiagnosticModal>
              ) : null}
            </Alert.Content>
          </FailureLayout>
        </Alert>
      ) : null}
      {persistence.restoredPaused ? (
        <Alert status="warning" role="status">
          <Alert.Indicator />
          <Alert.Content className="grid min-w-0 flex-1 grid-cols-1 gap-x-4 sm:grid-cols-[minmax(0,1fr)_auto]">
            <Alert.Title>
              <Trans>Restored messages are paused</Trans>
            </Alert.Title>
            <Alert.Description className="col-start-1">
              <Trans>
                Check the queue, other open pages, and conversation history before continuing.
                Messages with an unknown sending result remain blocked.
              </Trans>
            </Alert.Description>
            <Button
              className="mt-2 justify-self-start sm:col-start-2 sm:row-span-2 sm:row-start-1 sm:mt-0"
              variant="primary"
              isDisabled={!enabled || persistence.error != null}
              onPress={() => {
                composerRole.resumeRestored(revision, persistence.revision);
              }}
            >
              <Trans comment="Resumes sending this page's restored queue; does not open the queue">
                Continue sending
              </Trans>
            </Button>
          </Alert.Content>
        </Alert>
      ) : null}
      {persistence.unknownMessages.length > 0 ? (
        <Alert status="warning" role="status">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>
              <Trans>Sending result unknown</Trans>
            </Alert.Title>
            <Alert.Description>
              <Trans>
                These messages will not be sent again automatically. Removing a local record does
                not cancel or retract a message on the server.
              </Trans>
            </Alert.Description>
            <ul className="grid gap-2">
              {persistence.unknownMessages.map((message) => (
                <li key={message.id} className="grid min-w-0 gap-1">
                  <p className="whitespace-pre-wrap wrap-anywhere">{message.text}</p>
                  <Button
                    variant="danger"
                    isDisabled={!enabled || persistence.error != null}
                    onPress={() => {
                      composerRole.discardUnknown(revision, message.id, persistence.revision);
                    }}
                  >
                    <Trans comment="Drops only this local unknown-send record, without retracting server work">
                      Remove local record
                    </Trans>
                  </Button>
                </li>
              ))}
            </ul>
          </Alert.Content>
        </Alert>
      ) : null}
    </>
  );
}
