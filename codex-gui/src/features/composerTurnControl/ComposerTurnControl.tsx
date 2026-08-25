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
import type { ActiveThreadSessionSnapshot } from "@/features/activeThreadSession/activeThreadSession";
import type { GuiRouteTarget } from "@/features/browserLaunch/guiRouteTarget";
import {
  ComposerEditor,
  type ComposerEditorController,
  type ComposerEditorSnapshot,
  type ComposerEditorSubmitIntent,
} from "@/features/composerEditor/ComposerEditor";
import type { ComposerDraftCapture } from "@/features/composerEditor/composerDraft";
import { QrAccessPopover } from "@/features/qrAccess/QrAccessPopover";
import { selectThreadRuntimeTokenUsage } from "@/features/threadRuntime/threadRuntimeSlice";
import { ContextUsagePopover } from "./ContextUsagePopover";
import {
  canRecoverComposerQueue,
  canSend,
  composerGuideControlState,
  composerStopControlState,
  invalidSelectedSkillPaths,
} from "./composerTurnControlModel";
import { contextUsageModelFromTokenUsage } from "./contextUsageModel";
import { ComposerPendingInputRegion } from "./ComposerPendingInputRegion";
import { ComposerSkillMenuLayer } from "./ComposerSkillMenuLayer";
import { useRevealComposerOnViewportResize } from "./useRevealComposerOnViewportResize";

export type ComposerTurnControlProps = {
  authorizationToken: string | null;
  guardCompositionEndEnter: boolean;
  routeTarget: GuiRouteTarget;
  sessionSnapshot: Extract<
    ActiveThreadSessionSnapshot,
    { phase: "active" | "projectionUnavailable" }
  >;
};

export function ComposerTurnControl({
  authorizationToken,
  guardCompositionEndEnter,
  routeTarget,
  sessionSnapshot,
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
  const tokenUsage = useAppSelector(selectThreadRuntimeTokenUsage);
  const contextUsage = contextUsageModelFromTokenUsage(tokenUsage);
  const operationsEnabled = sessionSnapshot.phase === "active";
  const { activeTurnId, composer: queueSnapshot, composerRole, revision, skills: skillCatalog } =
    sessionSnapshot;
  const { skillsRole } = sessionSnapshot;
  const editorSnapshot = useSyncExternalStore<ComposerEditorSnapshot | null>(
    composerEditorController?.subscribe ?? subscribeUnavailableEditor,
    composerEditorController?.getSnapshot ?? getUnavailableEditorSnapshot,
  );

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
    operationsEnabled,
    draftText: editorSnapshot?.textContent ?? "",
    isSending,
    recoveryCount: queueSnapshot.recoveryCount,
    selectedSkillsValid: invalidSkillPaths.size === 0,
  });
  const guideControl = composerGuideControlState({
    activeTurnId,
    operationsEnabled,
    draftText: editorSnapshot?.textContent ?? "",
    isSending,
    recoveryCount: queueSnapshot.recoveryCount,
    selectedSkillsValid: invalidSkillPaths.size === 0,
  });
  const guideShortcut = guideShortcutForPlatform(navigator.platform);
  const stopControl = composerStopControlState({
    operationsEnabled,
    interruptPhase: queueSnapshot.interrupt?.phase ?? null,
    queueCanStop: queueSnapshot.canStop,
  });
  const canRecover = canRecoverComposerQueue({
    operationsEnabled,
    recoveryCount: queueSnapshot.recoveryCount,
    isRecovering: queueSnapshot.isRecovering,
  });
  const focusComposer = useCallback((): void => {
    if (composerEditorController == null) return;
    if (operationsEnabled) {
      composerEditorController.focus();
      return;
    }
    const root = composerEditorController.getRootElement();
    if (root == null) return;
    const previousTabIndex = root.getAttribute("tabindex");
    root.tabIndex = -1;
    root.focus();
    if (previousTabIndex == null) root.removeAttribute("tabindex");
    else root.setAttribute("tabindex", previousTabIndex);
  }, [composerEditorController, operationsEnabled]);

  useRevealComposerOnViewportResize(composerShellRef);

  const submit = (
    requestedCapture?: ComposerDraftCapture,
    intent: ComposerEditorSubmitIntent = "ordinary",
  ): void => {
    const isSubmitting = isSubmittingRef.current;
    const submittedCapture = requestedCapture ?? composerEditorController?.capture() ?? null;
    const submittedGuideControl = composerGuideControlState({
      activeTurnId,
      operationsEnabled,
      draftText: submittedCapture?.textContent ?? "",
      isSending: isSubmitting,
      recoveryCount: queueSnapshot.recoveryCount,
      selectedSkillsValid:
        submittedCapture == null ||
        invalidSelectedSkillPaths(skillCatalog, submittedCapture.selectedSkillPaths).size === 0,
    });
    if (submittedCapture == null || composerEditorController == null || isSubmitting) {
      return;
    }

    if (intent === "guide" && submittedCapture.textContent.trim().length === 0) {
      if (submittedGuideControl.shortcutEnabled) {
        composerRole.promoteOrdinaryFrontToSteer(revision);
      }
      return;
    }

    const submissionEnabled =
      intent === "guide"
        ? submittedGuideControl.shortcutEnabled
        : canSend({
            operationsEnabled,
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
        ? composerRole.submitSteer(revision, submittedCapture)
        : composerRole.submit(revision, submittedCapture);
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
    composerRole.recover(revision);
  };

  const stop = (): void => {
    if (!stopControl.enabled) {
      return;
    }
    composerRole.interruptActiveTurn(revision);
  };

  return (
    <section
      aria-label={t`Message composer`}
      className="composer-shell sticky bottom-0 z-10 pb-3"
      ref={composerShellRef}
    >
      <Surface
        aria-disabled={!operationsEnabled}
        className="composer-panel relative mx-auto grid w-full max-w-3xl gap-2 rounded-field border bg-field p-2 text-field-foreground shadow-field [border-color:var(--field-border)] [border-width:var(--border-width-field)] transition-[background-color,border-color,box-shadow,opacity] duration-150 motion-reduce:transition-none [&:has([contenteditable]:focus)]:bg-field-focus [&:has([contenteditable]:focus)]:[border-color:var(--field-border-focus)] [&:hover:not([data-disabled=true]):not(:has([contenteditable]:focus))]:bg-field-hover [&:hover:not([data-disabled=true]):not(:has([contenteditable]:focus))]:[border-color:var(--field-border-hover)] data-[disabled=true]:status-disabled data-[focus-visible=true]:status-focused-field"
        data-disabled={!operationsEnabled}
        data-focus-visible={composerFocusVisible}
        variant="default"
      >
        <ComposerSkillMenuLayer onPortalParentChange={setSkillMenuParent} />
        <ComposerEditor
          ariaLabel={t`Message Codex`}
          disabled={!operationsEnabled}
          guardCompositionEndEnter={guardCompositionEndEnter}
          onControllerChange={setComposerEditorController}
          onRetrySkillCatalog={() => {
            skillsRole.retrySkills(revision);
          }}
          onSubmit={submit}
          placeholder={t`Message Codex`}
          skillCatalog={skillCatalog}
          skillMenuParent={skillMenuParent}
          skillValidity={skillValidity}
        />
        <ComposerPendingInputRegion
          canRecover={canRecover}
          composerRole={composerRole}
          guardCompositionEndEnter={guardCompositionEndEnter}
          mutationsEnabled={operationsEnabled}
          onFocusComposer={focusComposer}
          onRecover={recover}
          onRetrySkillCatalog={() => {
            skillsRole.retrySkills(revision);
          }}
          recoveryDescriptionId={recoveryDescriptionId}
          sessionRevision={revision}
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

const subscribeUnavailableEditor = (): (() => void) => () => undefined;
const getUnavailableEditorSnapshot = (): null => null;
