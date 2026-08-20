import { Button, Chip, Surface, toast } from "@heroui/react";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { $getRoot } from "lexical";
import { useEffect, useRef, useId, useMemo, useState, useSyncExternalStore } from "react";
import { useAppSelector } from "@/app/hooks";
import type { GuiRouteTarget } from "@/features/browserLaunch/guiRouteTarget";
import {
  ComposerEditor,
  type ComposerEditorController,
  type ComposerEditorSnapshot,
} from "@/features/composerEditor/ComposerEditor";
import { $isSkillNode } from "@/features/composerEditor/SkillNode";
import { compileComposerDraft } from "@/features/composerEditor/compileComposerDraft";
import type {
  ComposerInputQueueCoordinator,
  ComposerInputQueueCoordinatorSnapshot,
} from "@/features/composerInputQueue/composerInputQueueCoordinator";
import type { GuiHostCommands, GuiHostStatus } from "@/features/guiHost/guiHostClient";
import type { ActiveThreadOwnerHandle } from "@/features/projectionCoordination/activeThreadOwner";
import { QrAccessPopover } from "@/features/qrAccess/QrAccessPopover";
import { selectCanAdvanceThreadIdentity } from "@/features/threadIdentity/threadIdentitySlice";
import {
  selectThreadRuntimeActiveTurnId,
  selectThreadRuntimeSubscriptionState,
  selectThreadRuntimeThreadId,
  selectThreadRuntimeTokenUsage,
} from "@/features/threadRuntime/threadRuntimeSlice";
import { ContextUsagePopover } from "./ContextUsagePopover";
import {
  canRecoverComposerQueue,
  canSend,
  canStop,
  errorDescription,
  invalidSelectedSkillPaths,
  isConnectionUsable,
} from "./composerTurnControlModel";
import { contextUsageModelFromTokenUsage } from "./contextUsageModel";
import { ComposerSkillMenuLayer } from "./ComposerSkillMenuLayer";
import { useRevealComposerOnViewportResize } from "./useRevealComposerOnViewportResize";

export type ComposerTurnControlProps = {
  authorizationToken: string | null;
  commands: GuiHostCommands | null;
  composerInputQueueController?: ComposerInputQueueCoordinator | null;
  guardCompositionEndEnter: boolean;
  guiHostStatus: GuiHostStatus;
  routeTarget: GuiRouteTarget;
  skillCatalogController: ActiveThreadOwnerHandle["skillCatalog"];
};

export function ComposerTurnControl({
  authorizationToken,
  commands,
  composerInputQueueController = null,
  guardCompositionEndEnter,
  guiHostStatus,
  routeTarget,
  skillCatalogController,
}: ComposerTurnControlProps) {
  const { t } = useLingui();
  const [composerEditorController, setComposerEditorController] =
    useState<ComposerEditorController | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const isSubmittingRef = useRef(false);
  const recoveryDescriptionId = useId();
  const composerShellRef = useRef<HTMLElement | null>(null);
  const [skillMenuParent, setSkillMenuParent] = useState<HTMLElement | null>(null);
  const composerFocusVisible = useComposerFocusVisible(composerShellRef);
  const canAdvanceThreadIdentity = useAppSelector(selectCanAdvanceThreadIdentity);
  const threadId = useAppSelector(selectThreadRuntimeThreadId);
  const activeTurnId = useAppSelector(selectThreadRuntimeActiveTurnId);
  const subscriptionState = useAppSelector(selectThreadRuntimeSubscriptionState);
  const tokenUsage = useAppSelector(selectThreadRuntimeTokenUsage);
  const contextUsage = contextUsageModelFromTokenUsage(tokenUsage);
  const queueSnapshot = useSyncExternalStore(
    composerInputQueueController?.subscribe ?? subscribeUnavailableQueue,
    composerInputQueueController?.getSnapshot ?? getUnavailableQueueSnapshot,
  );
  const skillCatalog = useSyncExternalStore(
    skillCatalogController.subscribe,
    skillCatalogController.getSnapshot,
  );
  const editorSnapshot = useSyncExternalStore<ComposerEditorSnapshot | null>(
    composerEditorController?.subscribe ?? subscribeUnavailableEditor,
    composerEditorController?.getSnapshot ?? getUnavailableEditorSnapshot,
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
  const invalidSkillPaths = useMemo(
    () =>
      invalidSelectedSkillPaths(
        skillCatalog,
        editorSnapshot == null ? [] : selectedSkillPaths(editorSnapshot),
      ),
    [editorSnapshot, skillCatalog],
  );
  const invalidStatusText = t`Invalid skill`;
  const skillValidity = useMemo(
    () => ({ invalidPaths: invalidSkillPaths, statusText: invalidStatusText }),
    [invalidSkillPaths, invalidStatusText],
  );
  const sendEnabled = canSend({
    connectionUsable,
    controllerReady: controllerMatchesCurrentThread,
    draftText: editorSnapshot?.textContent ?? "",
    isSending,
    recoveryCount: queueSnapshot.recoveryCount,
    selectedSkillsValid: invalidSkillPaths.size === 0,
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

  const submit = (requestedSnapshot?: ComposerEditorSnapshot): void => {
    const submittedSnapshot = requestedSnapshot ?? composerEditorController?.getSnapshot() ?? null;
    if (
      submittedSnapshot == null ||
      composerEditorController == null ||
      composerInputQueueController == null ||
      isSubmittingRef.current ||
      !canSend({
        connectionUsable,
        controllerReady: controllerMatchesCurrentThread,
        draftText: submittedSnapshot.textContent,
        isSending,
        recoveryCount: queueSnapshot.recoveryCount,
        selectedSkillsValid:
          invalidSelectedSkillPaths(skillCatalog, selectedSkillPaths(submittedSnapshot)).size === 0,
      })
    ) {
      return;
    }

    const input = compileComposerDraft(submittedSnapshot.editorState);
    isSubmittingRef.current = true;
    setIsSending(true);
    const result = composerInputQueueController.submit(input);
    if (result.type === "accepted") {
      composerEditorController.clearIfSame(submittedSnapshot.editorState);
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

  return (
    <section
      aria-label={t`Message composer`}
      className="composer-shell sticky bottom-0 z-10 pb-3"
      ref={composerShellRef}
    >
      <Surface
        aria-disabled={!connectionUsable}
        className="composer-panel relative mx-auto grid w-full max-w-3xl gap-2 rounded-field border bg-field p-2 text-field-foreground shadow-field [border-color:var(--field-border)] [border-width:var(--border-width-field)] transition-[background-color,border-color,box-shadow,opacity] duration-150 motion-reduce:transition-none [&:has([contenteditable]:focus)]:bg-field-focus [&:has([contenteditable]:focus)]:[border-color:var(--field-border-focus)] [&:hover:not([data-disabled=true]):not(:has([contenteditable]:focus))]:bg-field-hover [&:hover:not([data-disabled=true]):not(:has([contenteditable]:focus))]:[border-color:var(--field-border-hover)] data-[disabled=true]:status-disabled data-[focus-visible=true]:status-focused-field"
        data-disabled={!connectionUsable}
        data-focus-visible={composerFocusVisible}
        variant="default"
      >
        <ComposerSkillMenuLayer onPortalParentChange={setSkillMenuParent} />
        <ComposerEditor
          ariaLabel={t`Message Codex`}
          disabled={!connectionUsable}
          guardCompositionEndEnter={guardCompositionEndEnter}
          onControllerChange={setComposerEditorController}
          onRetrySkillCatalog={skillCatalogController.retry}
          onSubmit={submit}
          placeholder={t`Message Codex`}
          skillCatalog={skillCatalog}
          skillMenuParent={skillMenuParent}
          skillValidity={skillValidity}
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
          <QrAccessPopover authorizationToken={authorizationToken} routeTarget={routeTarget} />
          <div className="flex items-center gap-2">
            {contextUsage == null ? null : <ContextUsagePopover usage={contextUsage} />}
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

function useComposerFocusVisible(composerShellRef: {
  readonly current: HTMLElement | null;
}): boolean {
  const [isFocusVisible, setIsFocusVisible] = useState(false);

  useEffect(() => {
    const composerPanel = composerShellRef.current?.querySelector(".composer-panel");
    if (!(composerPanel instanceof HTMLElement)) {
      return;
    }

    let lastModality: "keyboard" | "pointer" = "keyboard";
    let publishedFocusVisible = false;
    const publishFocusVisible = (nextFocusVisible: boolean): void => {
      if (publishedFocusVisible === nextFocusVisible) {
        return;
      }
      publishedFocusVisible = nextFocusVisible;
      setIsFocusVisible(nextFocusVisible);
    };
    const handlePointerDown = (): void => {
      lastModality = "pointer";
      if (composerPanel.contains(document.activeElement)) {
        publishFocusVisible(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Tab" && event.key !== "Escape") {
        return;
      }
      lastModality = "keyboard";
      if (composerPanel.contains(document.activeElement)) {
        publishFocusVisible(true);
      }
    };
    const handleVirtualClick = (event: MouseEvent): void => {
      if (event.detail !== 0) {
        return;
      }
      lastModality = "keyboard";
      if (
        composerPanel.contains(document.activeElement) ||
        (event.target instanceof Node && composerPanel.contains(event.target))
      ) {
        publishFocusVisible(true);
      }
    };
    const handleFocusIn = (): void => {
      publishFocusVisible(lastModality === "keyboard");
    };
    const handleFocusOut = (event: FocusEvent): void => {
      if (event.relatedTarget instanceof Node && composerPanel.contains(event.relatedTarget)) {
        return;
      }
      publishFocusVisible(false);
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("click", handleVirtualClick, true);
    composerPanel.addEventListener("focusin", handleFocusIn);
    composerPanel.addEventListener("focusout", handleFocusOut);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("click", handleVirtualClick, true);
      composerPanel.removeEventListener("focusin", handleFocusIn);
      composerPanel.removeEventListener("focusout", handleFocusOut);
    };
  }, [composerShellRef]);

  return isFocusVisible;
}

const unavailableQueueSnapshot: ComposerInputQueueCoordinatorSnapshot = {
  queuedCount: 0,
  recoveryCount: 0,
  recovery: null,
  isRecovering: false,
  pendingSteers: [],
  queuedSteers: [],
  rejectedSteers: [],
  hasUnknownSteer: false,
};
const subscribeUnavailableQueue = (): (() => void) => () => undefined;
const getUnavailableQueueSnapshot = (): ComposerInputQueueCoordinatorSnapshot =>
  unavailableQueueSnapshot;
const subscribeUnavailableEditor = (): (() => void) => () => undefined;
const getUnavailableEditorSnapshot = (): null => null;

function selectedSkillPaths(snapshot: ComposerEditorSnapshot): string[] {
  return snapshot.editorState.read(() =>
    $getRoot()
      .getAllTextNodes()
      .filter($isSkillNode)
      .map((node) => node.getSkill().path),
  );
}
