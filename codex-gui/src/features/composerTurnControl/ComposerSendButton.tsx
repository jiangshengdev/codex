import { Tooltip } from "@heroui/react";
import { Trans } from "@lingui/react/macro";
import { RetryActionButton, type RetryActionButtonProps } from "@/feedback/RetryActionButton";
import { ShortcutKey } from "@/features/appShell/ShortcutKey";
import { composerShortcutsForPlatform } from "@/features/composerEditor/composerShortcuts";

type ComposerSendButtonProps = Pick<RetryActionButtonProps, "isDisabled" | "onPress"> & {
  isPending?: boolean;
};

export function ComposerSendButton({
  isDisabled,
  isPending = false,
  onPress,
}: ComposerSendButtonProps) {
  const { send } = composerShortcutsForPlatform(navigator.platform);
  return (
    <Tooltip>
      <RetryActionButton
        render={(props) => <button {...props} aria-keyshortcuts={send.aria} />}
        variant="outline"
        isDisabled={isDisabled}
        isPending={isPending}
        pendingChildren={
          <Trans comment="Pending state of Send while creating a session and handing off its first message">
            Sending
          </Trans>
        }
        onPress={onPress}
      >
        <Trans>Send</Trans>
      </RetryActionButton>
      <Tooltip.Content>
        <ShortcutKey aria={send.aria} variant="light" />
      </Tooltip.Content>
    </Tooltip>
  );
}
