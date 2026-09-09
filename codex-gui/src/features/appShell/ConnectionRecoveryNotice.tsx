import { Alert } from "@heroui/react";
import { Trans } from "@lingui/react/macro";

export function ConnectionRecoveryNotice() {
  return (
    <Alert role="status" status="warning">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>
          <Trans comment="GUI connection ended; retained conversations remain read-only">
            Connection closed
          </Trans>
        </Alert.Title>
        <Alert.Description>
          <Trans comment="Shown above retained tasks after the GUI host connection closes">
            Content may not be up to date. Your conversations and input are still here.
          </Trans>
        </Alert.Description>
      </Alert.Content>
    </Alert>
  );
}
