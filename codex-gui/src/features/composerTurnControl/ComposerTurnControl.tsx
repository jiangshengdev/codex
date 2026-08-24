import { Button, Surface, Tooltip } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  useCallback,
  useEffect,
  useRef,
  useId,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { useAppSelector } from "@/app/hooks";
import type { GuiRouteTarget } from "@/features/browserLaunch/guiRouteTarget";
import {
  ComposerEditor,
  type ComposerEditorController,
  type ComposerEditorSnapshot,
  type ComposerEditorSubmitIntent,
} from "@/features/composerEditor/ComposerEditor";
import type { ComposerDraftCapture } from "@/features/composerEditor/composerDraft";
import type {
  ComposerInputQueueCoordinator,
  ComposerInputQueueCoordinatorSnapshot,
} from "@/features/composerInputQueue/composerInputQueueCoordinator";
import type { GuiHostCommands, GuiHostStatus } from "@/features/guiHost/guiHostClient";
import type { ActiveThreadOwnerHandle } from "@/features/projectionCoordination/activeThreadOwner";
import { QrAccessPopover } from "@/features/qrAccess/QrAccessPopover";
import { selectCanAdvanceThreadIdentity } from "@/features/threadIdentity/threadIdentitySlice";
import {
  selectThreadRuntimeSubscriptionState,
  selectThreadRuntimeActiveTurnId,
  selectThreadRuntimeThreadId,
  selectThreadRuntimeTokenUsage,
} from "@/features/threadRuntime/threadRuntimeSlice";
import { ContextUsagePopover } from "./ContextUsagePopover";
import {
  canRecoverComposerQueue,
  canSend,
  composerGuideControlState,
  composerStopControlState,
  invalidSelectedSkillPaths,
  isConnectionUsable,
} from "./composerTurnControlModel";
import { contextUsageModelFromTokenUsage } from "./contextUsageModel";
import { ComposerPendingInputRegion } from "./ComposerPendingInputRegion";
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
  const isSubmittingRef = useRef(false);
  const recoveryDescriptionId = useId();
  const composerShellRef = useRef<HTMLElement | null>(null);
  const [skillMenuParent, setSkillMenuParent] = useState<HTMLElement | null>(null);
  const composerFocusVisible = useComposerFocusVisible(composerShellRef);
  const canAdvanceThreadIdentity = useAppSelector(selectCanAdvanceThreadIdentity);
  const activeTurnId = useAppSelector(selectThreadRuntimeActiveTurnId);
  const threadId = useAppSelector(selectThreadRuntimeThreadId);
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
    () => invalidSelectedSkillPaths(skillCatalog, editorSnapshot?.selectedSkillPaths ?? []),
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
  const guideControl = composerGuideControlState({
    activeTurnId,
    connectionUsable,
    controllerMatchesCurrentThread,
    draftText: editorSnapshot?.textContent ?? "",
    isSending,
    recoveryCount: queueSnapshot.recoveryCount,
    selectedSkillsValid: invalidSkillPaths.size === 0,
  });
  const guideShortcut = guideShortcutForPlatform(navigator.platform);
  const stopControl = composerStopControlState({
    connectionUsable,
    controllerMatchesCurrentThread,
    interruptPhase: queueSnapshot.interrupt?.phase ?? null,
    queueCanStop: queueSnapshot.canStop,
  });
  const canRecover = canRecoverComposerQueue({
    connectionUsable,
    controllerReady: controllerMatchesCurrentThread,
    recoveryCount: queueSnapshot.recoveryCount,
    isRecovering: queueSnapshot.isRecovering,
  });
  const focusComposer = useCallback((): void => {
    composerEditorController?.focus();
  }, [composerEditorController]);

  useRevealComposerOnViewportResize(composerShellRef);

  const submit = (
    requestedCapture?: ComposerDraftCapture,
    intent: ComposerEditorSubmitIntent = "ordinary",
  ): void => {
    const isSubmitting = isSubmittingRef.current;
    const submittedCapture = requestedCapture ?? composerEditorController?.capture() ?? null;
    const submittedGuideControl = composerGuideControlState({
      activeTurnId,
      connectionUsable,
      controllerMatchesCurrentThread,
      draftText: submittedCapture?.textContent ?? "",
      isSending: isSubmitting,
      recoveryCount: queueSnapshot.recoveryCount,
      selectedSkillsValid:
        submittedCapture == null ||
        invalidSelectedSkillPaths(skillCatalog, submittedCapture.selectedSkillPaths).size === 0,
    });
    if (
      submittedCapture == null ||
      composerEditorController == null ||
      composerInputQueueController == null ||
      isSubmitting
    ) {
      return;
    }

    if (intent === "guide" && submittedCapture.textContent.trim().length === 0) {
      if (submittedGuideControl.shortcutEnabled) {
        composerInputQueueController.promoteOrdinaryFrontToSteer();
      }
      return;
    }

    const submissionEnabled =
      intent === "guide"
        ? submittedGuideControl.shortcutEnabled
        : canSend({
            connectionUsable,
            controllerReady: controllerMatchesCurrentThread,
            draftText: submittedCapture.textContent,
            isSending: isSubmitting,
            recoveryCount: queueSnapshot.recoveryCount,
            selectedSkillsValid:
              invalidSelectedSkillPaths(skillCatalog, submittedCapture.selectedSkillPaths).size ===
              0,
          });
    if (!submissionEnabled) {
      return;
    }

    isSubmittingRef.current = true;
    setIsSending(true);
    const result =
      intent === "guide"
        ? composerInputQueueController.submitSteer(submittedCapture)
        : composerInputQueueController.submit(submittedCapture);
    if (result.type === "accepted") {
      composerEditorController.clearIfCurrent(submittedCapture);
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

  const stop = (): void => {
    if (!stopControl.enabled) {
      return;
    }
    composerInputQueueController?.interruptActiveTurn();
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
        <ComposerPendingInputRegion
          canRecover={canRecover}
          controller={controllerMatchesCurrentThread ? composerInputQueueController : null}
          guardCompositionEndEnter={guardCompositionEndEnter}
          onFocusComposer={focusComposer}
          onRecover={recover}
          onRetrySkillCatalog={skillCatalogController.retry}
          recoveryDescriptionId={recoveryDescriptionId}
          skillCatalog={skillCatalog}
          snapshot={queueSnapshot}
        />
        <div className="flex items-center justify-between gap-2">
          <QrAccessPopover authorizationToken={authorizationToken} routeTarget={routeTarget} />
          <div className="flex items-center gap-2">
            {contextUsage == null ? null : <ContextUsagePopover usage={contextUsage} />}
            {stopControl.failed ? (
              <span className="text-sm text-danger" role="status">
                <Trans>Stop failed</Trans>
              </span>
            ) : null}
            <Button
              isDisabled={!stopControl.enabled}
              isPending={stopControl.pending}
              onPress={stop}
              variant="danger-soft"
            >
              <Trans>Stop</Trans>
            </Button>
            {guideControl.visible ? (
              <Tooltip delay={0}>
                <Button
                  aria-keyshortcuts={guideShortcut.aria}
                  isDisabled={!guideControl.buttonEnabled}
                  onPress={() => {
                    submit(undefined, "guide");
                  }}
                  variant="secondary"
                >
                  <Trans>Guide</Trans>
                </Button>
                <Tooltip.Content>{guideShortcut.visible}</Tooltip.Content>
              </Tooltip>
            ) : null}
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

function guideShortcutForPlatform(platform: string): Readonly<{ aria: string; visible: string }> {
  return platform.startsWith("Mac")
    ? { aria: "Meta+Enter", visible: "⌘ Enter" }
    : { aria: "Control+Enter", visible: "Ctrl+Enter" };
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
  ordinaryQueuedCount: 0,
  guidingCount: 0,
  detailRevision: 0,
  recoveryCount: 0,
  recovery: null,
  isRecovering: false,
  rejectedSteers: [],
  hasUnknownSteer: false,
  canStop: false,
  interrupt: null,
  pendingInputManagementOutcome: null,
};
const subscribeUnavailableQueue = (): (() => void) => () => undefined;
const getUnavailableQueueSnapshot = (): ComposerInputQueueCoordinatorSnapshot =>
  unavailableQueueSnapshot;
const subscribeUnavailableEditor = (): (() => void) => () => undefined;
const getUnavailableEditorSnapshot = (): null => null;
