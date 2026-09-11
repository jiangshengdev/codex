import { Alert, Button } from "@heroui/react";
import { Trans } from "@lingui/react/macro";
import { use, useSyncExternalStore } from "react";
import { FailureDiagnosticModal } from "@/feedback/FailureDiagnosticModal";
import { errorText } from "@/text/errorText";
import { ThreadForkContext } from "./ThreadForkContext";
import type { ThreadForkOwner } from "./threadForkOwner";

export function ThreadForkNotice() {
  const context = use(ThreadForkContext);
  if (context == null) return null;
  return <ForkNotice owner={context.owner} available={context.available} />;
}

function ForkNotice({
  owner,
  available,
}: Readonly<{ owner: ThreadForkOwner; available: boolean }>) {
  const snapshot = useSyncExternalStore(owner.subscribe, owner.getSnapshot);
  if (snapshot.pending || (snapshot.failure == null && snapshot.recoveries.length === 0))
    return null;
  return (
    <div className="grid min-w-0 gap-3">
      {snapshot.failure == null ? null : (
        <Alert status="danger" role="alert">
          <Alert.Indicator />
          <Alert.Content className="min-w-0">
            <Alert.Title>
              <Trans>Unable to create fork</Trans>
            </Alert.Title>
            {snapshot.failure.delivery === "deliveryUnknown" ? (
              <Alert.Description>
                <Trans>
                  The result is unknown. Check history before forking again; another click may
                  create an additional conversation.
                </Trans>
              </Alert.Description>
            ) : null}
            <FailureDiagnosticModal>{errorText(snapshot.failure.error)}</FailureDiagnosticModal>
            <Button variant="tertiary" onPress={owner.dismissFailure}>
              <Trans comment="Dismiss the fork creation error notice">Dismiss</Trans>
            </Button>
          </Alert.Content>
        </Alert>
      )}
      {snapshot.recoveries.map((recovery) => (
        <Alert key={recovery.threadId} status="warning" role="alert">
          <Alert.Indicator />
          <Alert.Content className="min-w-0">
            <Alert.Title>
              <Trans>Fork created</Trans>
            </Alert.Title>
            <Alert.Description>
              <Trans>
                The new conversation is saved. Continue opening it without creating another fork.
              </Trans>
            </Alert.Description>
            <p className="break-all text-muted text-xs">{recovery.threadId}</p>
            {recovery.failure == null ? null : (
              <FailureDiagnosticModal>{errorText(recovery.failure.error)}</FailureDiagnosticModal>
            )}
            <Button
              variant="secondary"
              isDisabled={!available}
              onPress={() => {
                void owner.resume(recovery.threadId);
              }}
            >
              <Trans comment="Resume opening an already created fork without creating it again">
                Open fork
              </Trans>
            </Button>
          </Alert.Content>
        </Alert>
      ))}
    </div>
  );
}
