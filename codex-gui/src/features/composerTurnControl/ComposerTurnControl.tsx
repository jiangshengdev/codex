import { Button, Chip, Surface, TextArea, toast } from "@heroui/react";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import {
  useRef,
  useId,
  useState,
  useSyncExternalStore,
  type CompositionEvent,
  type KeyboardEvent,
} from "react";
import { useAppSelector } from "@/app/hooks";
import type { BrowserLaunchParams } from "@/features/browserLaunch/browserLaunchParams";
import type {
  ComposerInputQueueCoordinator,
  ComposerInputQueueCoordinatorSnapshot,
} from "@/features/composerInputQueue/composerInputQueueCoordinator";
import type { GuiHostCommands, GuiHostStatus } from "@/features/guiHost/guiHostClient";
import { QrAccessPopover } from "@/features/qrAccess/QrAccessPopover";
import { selectCanAdvanceThreadIdentity } from "@/features/threadIdentity/threadIdentitySlice";
import {
  selectThreadRuntimeActiveTurnId,
  selectThreadRuntimeSubscriptionState,
  selectThreadRuntimeThreadId,
} from "@/features/threadRuntime/threadRuntimeSlice";
import {
  canRecoverComposerQueue,
  canSend,
  canStop,
  errorDescription,
  isConnectionUsable,
} from "./composerTurnControlModel";
import { useRevealComposerOnViewportResize } from "./useRevealComposerOnViewportResize";

export type ComposerTurnControlProps = {
  commands: GuiHostCommands | null;
  composerInputQueueController?: ComposerInputQueueCoordinator | null;
  guardCompositionEndEnter: boolean;
  guiHostStatus: GuiHostStatus;
  launchParams: BrowserLaunchParams | null;
};

export function ComposerTurnControl({
  commands,
  composerInputQueueController = null,
  guardCompositionEndEnter,
  guiHostStatus,
  launchParams,
}: ComposerTurnControlProps) {
  const { t } = useLingui();
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const isSubmittingRef = useRef(false);
  const recoveryDescriptionId = useId();
  const composerShellRef = useRef<HTMLElement | null>(null);
  const isComposingRef = useRef(false);
  const suppressNextEnterRef = useRef(false);
  const canAdvanceThreadIdentity = useAppSelector(selectCanAdvanceThreadIdentity);
  const threadId = useAppSelector(selectThreadRuntimeThreadId);
  const activeTurnId = useAppSelector(selectThreadRuntimeActiveTurnId);
  const subscriptionState = useAppSelector(selectThreadRuntimeSubscriptionState);
  const queueSnapshot = useSyncExternalStore(
    composerInputQueueController?.subscribe ?? subscribeUnavailableQueue,
    composerInputQueueController?.getSnapshot ?? getUnavailableQueueSnapshot,
  );

  const connectionUsable =
    commands != null &&
    isConnectionUsable({
      canAdvanceThreadIdentity,
      guiHostStatus,
      threadId,
      subscriptionState,
    });
  const controllerMatchesCurrentThread =
    composerInputQueueController != null &&
    threadId != null &&
    composerInputQueueController.ownerThreadId === threadId;
  const sendEnabled = canSend({
    connectionUsable,
    controllerReady: controllerMatchesCurrentThread,
    draft,
    isSending,
    recoveryCount: queueSnapshot.recoveryCount,
  });
  const stopEnabled = canStop({
    connectionUsable,
    activeTurnId,
    isStopping,
  });
  const canRecover = canRecoverComposerQueue({
    connectionUsable,
    hasController: composerInputQueueController != null,
    recoveryCount: queueSnapshot.recoveryCount,
    isRecovering: queueSnapshot.isRecovering,
  });

  useRevealComposerOnViewportResize(composerShellRef);

  const submit = (): void => {
    if (!sendEnabled || composerInputQueueController == null || isSubmittingRef.current) {
      return;
    }

    const submittedDraft = draft;
    isSubmittingRef.current = true;
    setIsSending(true);
    const result = composerInputQueueController.submit(submittedDraft);
    if (result.type === "accepted") {
      setDraft((currentDraft) => (currentDraft === submittedDraft ? "" : currentDraft));
    }
    queueMicrotask(() => {
      isSubmittingRef.current = false;
      setIsSending(false);
    });
  };

  const recover = (): void => {
    if (!canRecover) {
      return;
    }
    composerInputQueueController?.recover();
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
      toast.danger(t`Stop failed`, {
        description: errorDescription(error),
      });
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
    submit();
  };

  return (
    <section
      aria-label={t`Message composer`}
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
          placeholder={t`Message Codex`}
          value={draft}
          variant="primary"
        />
        {queueSnapshot.queuedCount > 0 || queueSnapshot.recoveryCount > 0 ? (
          <div className="flex items-center gap-2">
            {queueSnapshot.queuedCount > 0 ? (
              <Chip size="sm" variant="tertiary">
                <Plural
                  value={queueSnapshot.queuedCount}
                  one="# message queued"
                  other="# messages queued"
                />
              </Chip>
            ) : null}
            {queueSnapshot.recoveryCount > 0 ? (
              <>
                <span id={recoveryDescriptionId}>
                  <Plural
                    value={queueSnapshot.recoveryCount}
                    one="# message has not been sent"
                    other="# messages have not been sent"
                  />
                </span>
                <Button
                  aria-describedby={recoveryDescriptionId}
                  isDisabled={!canRecover}
                  isPending={queueSnapshot.isRecovering}
                  onPress={recover}
                  size="sm"
                  variant="secondary"
                >
                  <Trans>Continue sending</Trans>
                </Button>
              </>
            ) : null}
          </div>
        ) : null}
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
              <Trans>Stop</Trans>
            </Button>
            <Button
              isDisabled={!sendEnabled}
              onPress={() => {
                submit();
              }}
              variant="outline"
            >
              <Trans>Send</Trans>
            </Button>
          </div>
        </div>
      </Surface>
    </section>
  );
}

const unavailableQueueSnapshot: ComposerInputQueueCoordinatorSnapshot = {
  queuedCount: 0,
  recoveryCount: 0,
  isRecovering: false,
};
const subscribeUnavailableQueue = (): (() => void) => () => undefined;
const getUnavailableQueueSnapshot = (): ComposerInputQueueCoordinatorSnapshot =>
  unavailableQueueSnapshot;
