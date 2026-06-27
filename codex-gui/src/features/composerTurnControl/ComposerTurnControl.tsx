import { Button, TextArea, toast } from "@heroui/react";
import { useState, type KeyboardEvent } from "react";
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
  selectThreadRuntimeRecord,
  selectThreadRuntimeSubscription,
} from "@/features/threadRuntime/threadRuntimeSlice";
import {
  buildPlainTextInput,
  canSend,
  canStop,
  errorDescription,
  isConnectionUsable,
} from "./composerTurnControlModel";

export type ComposerTurnControlProps = {
  commands: GuiHostCommands | null;
  guiHostStatus: GuiHostStatus;
  launchParams: LaunchParams | null;
};

export function ComposerTurnControl({
  commands,
  guiHostStatus,
  launchParams,
}: ComposerTurnControlProps) {
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const canAdvanceThreadIdentity = useAppSelector(selectCanAdvanceThreadIdentity);
  const runtime = useAppSelector(selectThreadRuntimeRecord);
  const activeTurnId = useAppSelector(selectThreadRuntimeActiveTurnId);
  const subscription = useAppSelector(selectThreadRuntimeSubscription);

  const connectionUsable =
    commands != null &&
    isConnectionUsable({
      canAdvanceThreadIdentity,
      guiHostStatus,
      runtime,
      subscription,
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

  const submit = async (): Promise<void> => {
    if (!sendEnabled || runtime == null || commands == null) {
      return;
    }

    const submittedDraft = draft;
    setIsSending(true);
    try {
      await commands.startTurn({
        threadId: runtime.threadId,
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
    if (!stopEnabled || runtime == null || activeTurnId == null || commands == null) {
      return;
    }

    try {
      await commands.interruptTurn({
        threadId: runtime.threadId,
        turnId: activeTurnId,
      });
    } catch (error) {
      toast.danger("Stop failed", {
        description: errorDescription(error),
      });
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }
    event.preventDefault();
    void submit();
  };

  return (
    <section aria-label="Message composer" className="fixed inset-x-0 bottom-0 z-10 pt-3 pb-0">
      <div className="mx-auto grid w-full max-w-6xl gap-2 bg-white p-2">
        <TextArea
          disabled={!connectionUsable}
          fullWidth
          onChange={(event) => {
            setDraft(event.target.value);
          }}
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
      </div>
    </section>
  );
}
