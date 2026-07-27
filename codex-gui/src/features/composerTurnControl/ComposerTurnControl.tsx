import { Button, Surface, TextArea, Tooltip, toast } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Settings } from "lucide-react";
import { useRef, useState, type CompositionEvent, type KeyboardEvent } from "react";
import { useAppSelector } from "@/app/hooks";
import type { BrowserLaunchParams } from "@/features/browserLaunch/browserLaunchParams";
import { useChatUiSession } from "@/features/chatUiSession/ChatUiSessionContext";
import type { GuiHostCommands, GuiHostStatus } from "@/features/guiHost/guiHostClient";
import { QrAccessPopover } from "@/features/qrAccess/QrAccessPopover";
import { selectCanAdvanceThreadIdentity } from "@/features/threadIdentity/threadIdentitySlice";
import {
  selectThreadRuntimeActiveTurnId,
  selectThreadRuntimeSubscriptionState,
  selectThreadRuntimeThreadId,
} from "@/features/threadRuntime/threadRuntimeSlice";
import {
  buildPlainTextInput,
  canSend,
  canStop,
  errorDescription,
  isConnectionUsable,
} from "./composerTurnControlModel";
import { useRevealComposerOnViewportResize } from "./useRevealComposerOnViewportResize";

export type ComposerTurnControlProps = {
  commands: GuiHostCommands | null;
  guardCompositionEndEnter: boolean;
  guiHostStatus: GuiHostStatus;
  launchParams: BrowserLaunchParams | null;
  onOpenSettings: () => void;
};

export function ComposerTurnControl({
  commands,
  guardCompositionEndEnter,
  guiHostStatus,
  launchParams,
  onOpenSettings,
}: ComposerTurnControlProps) {
  const { t } = useLingui();
  const { draft, setDraft } = useChatUiSession();
  const [isSending, setIsSending] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const composerShellRef = useRef<HTMLElement | null>(null);
  const isComposingRef = useRef(false);
  const suppressNextEnterRef = useRef(false);
  const canAdvanceThreadIdentity = useAppSelector(selectCanAdvanceThreadIdentity);
  const threadId = useAppSelector(selectThreadRuntimeThreadId);
  const activeTurnId = useAppSelector(selectThreadRuntimeActiveTurnId);
  const subscriptionState = useAppSelector(selectThreadRuntimeSubscriptionState);

  const connectionUsable =
    commands != null &&
    isConnectionUsable({
      canAdvanceThreadIdentity,
      guiHostStatus,
      threadId,
      subscriptionState,
    });
  const sendEnabled = canSend({
    connectionUsable,
    activeTurnId,
    draft,
    isSending,
  });
  const stopEnabled = canStop({
    connectionUsable,
    activeTurnId,
    isStopping,
  });

  useRevealComposerOnViewportResize(composerShellRef);

  const submit = async (): Promise<void> => {
    if (!sendEnabled || threadId == null || commands == null) {
      return;
    }

    const submittedDraft = draft;
    setIsSending(true);
    try {
      await commands.startTurn({
        threadId,
        clientUserMessageId: null,
        input: [buildPlainTextInput(submittedDraft)],
      });
      setDraft((currentDraft) => (currentDraft === submittedDraft ? "" : currentDraft));
    } catch (error) {
      toast.danger(
        t({
          comment: "Title of a toast shown when sending a chat prompt fails",
          message: "Message failed to send",
        }),
        { description: errorDescription(error) },
      );
    } finally {
      setIsSending(false);
    }
  };

  const stop = async (): Promise<void> => {
    if (!stopEnabled || threadId == null || activeTurnId == null || commands == null) {
      return;
    }

    setIsStopping(true);
    try {
      await commands.interruptTurn({
        threadId,
        turnId: activeTurnId,
      });
    } catch (error) {
      toast.danger(
        t({
          comment: "Title of a toast shown when interrupting a Codex turn fails",
          message: "Stop failed",
        }),
        { description: errorDescription(error) },
      );
    } finally {
      setIsStopping(false);
    }
  };

  const onCompositionStart = (): void => {
    isComposingRef.current = true;
    suppressNextEnterRef.current = false;
  };

  const onCompositionEnd = (event: CompositionEvent<HTMLTextAreaElement>): void => {
    const wasComposing = isComposingRef.current;
    isComposingRef.current = false;
    if (wasComposing && guardCompositionEndEnter) {
      suppressNextEnterRef.current = true;
    }
    setDraft(event.currentTarget.value);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key !== "Enter" || event.shiftKey) {
      suppressNextEnterRef.current = false;
      return;
    }

    if (event.nativeEvent.isComposing || isComposingRef.current) {
      return;
    }

    if (suppressNextEnterRef.current) {
      event.preventDefault();
      suppressNextEnterRef.current = false;
      return;
    }

    event.preventDefault();
    void submit();
  };

  return (
    <section
      aria-label={t({
        comment: "Accessible name for the region containing the chat prompt controls",
        message: "Message composer",
      })}
      className="composer-shell sticky bottom-0 z-10 pb-3"
      ref={composerShellRef}
    >
      <Surface
        className="composer-panel mx-auto grid w-full max-w-3xl gap-2 rounded-[20px] p-2 shadow-md"
        variant="default"
      >
        <TextArea
          disabled={!connectionUsable}
          fullWidth
          onChange={(event) => {
            setDraft(event.target.value);
          }}
          onCompositionEnd={onCompositionEnd}
          onCompositionStart={onCompositionStart}
          onKeyDown={onKeyDown}
          placeholder={t({
            comment: "Placeholder in the chat prompt field; Codex is the product name",
            message: "Message Codex",
          })}
          value={draft}
          variant="primary"
        />
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1" data-composer-secondary-actions="">
            <QrAccessPopover launchParams={launchParams} />
            <Tooltip delay={0}>
              <Button
                aria-label={t({
                  comment: "Accessible label and tooltip for the icon that opens settings",
                  message: "Settings",
                })}
                data-settings-trigger=""
                isIconOnly
                onPress={onOpenSettings}
                size="sm"
                variant="tertiary"
              >
                <Settings aria-hidden="true" size={18} />
              </Button>
              <Tooltip.Content>
                <Trans comment="Accessible label and tooltip for the icon that opens settings">
                  Settings
                </Trans>
              </Tooltip.Content>
            </Tooltip>
          </div>
          <div className="flex items-center gap-2">
            <Button
              isDisabled={!stopEnabled}
              onPress={() => {
                void stop();
              }}
              variant="danger-soft"
            >
              <Trans comment="Button that interrupts the active Codex turn">Stop</Trans>
            </Button>
            <Button
              isDisabled={!sendEnabled}
              onPress={() => {
                void submit();
              }}
              variant="outline"
            >
              <Trans comment="Button that submits the current chat prompt">Send</Trans>
            </Button>
          </div>
        </div>
      </Surface>
    </section>
  );
}
