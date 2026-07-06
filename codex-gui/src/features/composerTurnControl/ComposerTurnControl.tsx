import { Button, Surface, TextArea, toast } from "@heroui/react";
import { useRef, useState, type CompositionEvent, type KeyboardEvent } from "react";
import { useAppSelector } from "@/app/hooks";
import type {
  GuiHostCommands,
  GuiHostStatus,
  LaunchParams,
} from "@/features/guiHost/guiHostClient";
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
  launchParams: LaunchParams | null;
};

export function ComposerTurnControl({
  commands,
  guardCompositionEndEnter,
  guiHostStatus,
  launchParams,
}: ComposerTurnControlProps) {
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
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
      toast.danger("Message failed to send", {
        description: errorDescription(error),
      });
    } finally {
      setIsSending(false);
    }
  };

  const stop = async (): Promise<void> => {
    if (!stopEnabled || threadId == null || activeTurnId == null || commands == null) {
      return;
    }

    try {
      await commands.interruptTurn({
        threadId,
        turnId: activeTurnId,
      });
    } catch (error) {
      toast.danger("Stop failed", {
        description: errorDescription(error),
      });
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
      aria-label="Message composer"
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
          placeholder="Message Codex"
          value={draft}
          variant="primary"
        />
        <div className="flex items-center justify-between gap-2">
          <QrAccessPopover launchParams={launchParams} />
          <div className="flex items-center gap-2">
            <Button
              isDisabled={!stopEnabled}
              onPress={() => {
                void stop();
              }}
              variant="danger-soft"
            >
              Stop
            </Button>
            <Button
              isDisabled={!sendEnabled}
              onPress={() => {
                void submit();
              }}
              variant="outline"
            >
              Send
            </Button>
          </div>
        </div>
      </Surface>
    </section>
  );
}
