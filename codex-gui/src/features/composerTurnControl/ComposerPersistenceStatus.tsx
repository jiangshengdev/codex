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
                size="sm"
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
                <FailureDiagnosticModal triggerClassName="mt-2 self-start" triggerSize="sm">
                  {persistence.error}
                </FailureDiagnosticModal>
              ) : null}
            </Alert.Content>
          </FailureLayout>
        </Alert>
      ) : null}
      {persistence.restoredPaused ? (
        <Alert status="warning" role="status">
          <Alert.Indicator />
          <FailureLayout
            actions={
              <Button
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
            }
          >
            <Alert.Content>
              <Alert.Title>
                <Trans>Restored messages are paused</Trans>
              </Alert.Title>
              <Alert.Description>
                <Trans>
                  Check the queue, other open pages, and conversation history before continuing.
                  Messages with an unknown sending result remain blocked.
                </Trans>
              </Alert.Description>
            </Alert.Content>
          </FailureLayout>
        </Alert>
      ) : null}
      {persistence.unknownMessages.length > 0 ? (
        <Alert status="warning" role="status">
          <Alert.Indicator />
          <Alert.Content className="min-w-0 flex-1">
            <Alert.Title>
              <Trans>Sending result unknown</Trans>
            </Alert.Title>
            <Alert.Description>
              <Trans>
                These messages will not be sent again automatically. Removing a local record does
                not cancel or retract a message on the server.
              </Trans>
            </Alert.Description>
            <ul className="mt-4 grid max-h-[min(30vh,240px)] w-full min-w-0 gap-2 overflow-y-auto">
              {persistence.unknownMessages.map((message) => (
                <li key={message.id} className="min-w-0">
                  <FailureLayout
                    actions={
                      <Button
                        size="sm"
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
                    }
                  >
                    <p className="whitespace-pre-wrap wrap-anywhere">{message.text}</p>
                  </FailureLayout>
                </li>
              ))}
            </ul>
          </Alert.Content>
        </Alert>
      ) : null}
    </>
  );
}
