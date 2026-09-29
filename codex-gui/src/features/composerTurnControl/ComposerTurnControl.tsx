import { Button, Chip, Tooltip } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { CircleAlert } from "lucide-react";
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
  type ComposerEditorController,
  type ComposerEditorSnapshot,
  type ComposerEditorSubmitIntent,
} from "@/features/composerEditor/ComposerEditor";
import { QrAccessPopover } from "@/features/qrAccess/QrAccessPopover";
import { composerShortcutsForPlatform } from "@/features/composerEditor/composerShortcuts";
import { selectThreadRuntimeTokenUsage } from "@/features/threadRuntime/threadRuntimeSlice";
import { ContextUsagePopover } from "./ContextUsagePopover";
import {
  useComposerPendingInput,
  useComposerPendingInputBinding,
} from "./composerPendingInputHost";
import { createComposerTurnApplication } from "./composerTurnApplication";
import { contextUsageModelFromTokenUsage } from "./contextUsageModel";
import { ComposerPendingInputRegion } from "./ComposerPendingInputRegion";
import { ComposerSurface } from "./ComposerSurface";
import { CurrentThreadStatus } from "./CurrentThreadStatus";
import { ComposerPersistenceStatus } from "./ComposerPersistenceStatus";
import { usePersistComposerDraft } from "./usePersistComposerDraft";
import { ShortcutKey } from "@/features/appShell/ShortcutKey";
import { ComposerSendButton } from "./ComposerSendButton";

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
  const pendingHost = useComposerPendingInput();
  const pendingInputSession = pendingHost.session;
  const pendingTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [turnApplication] = useState(createComposerTurnApplication);
  const adapterLifecycleRef = useRef({ generation: 0, mounted: false });
  const recoveryDescriptionId = useId();
  const tokenUsage = useAppSelector((state) =>
    state.threadRuntime.byThreadId[sessionSnapshot.threadId]?.identity.instanceId ===
    sessionSnapshot.identity.instanceId
      ? selectThreadRuntimeTokenUsage(state, sessionSnapshot.threadId)
      : null,
  );
  const contextUsage = contextUsageModelFromTokenUsage(tokenUsage);
  const {
    activeTurnId,
    compaction,
    compactionRole,
    composer: queueSnapshot,
    composerRole,
    revision,
    skills: skillCatalog,
  } = sessionSnapshot;
  const { skillsRole } = sessionSnapshot;
  const initialDraft = useMemo(() => composerRole.getDraft(), [composerRole]);
  const saveDraft = usePersistComposerDraft(composerRole, revision);
  const editorSnapshot = useSyncExternalStore<ComposerEditorSnapshot | null>(
    composerEditorController?.subscribe ?? subscribeUnavailableEditor,
    composerEditorController?.getSnapshot ?? getUnavailableEditorSnapshot,
  );
  useSyncExternalStore(turnApplication.subscribe, turnApplication.getVersion);
  const sessionFacts = {
    activeTurnId,
    composer: queueSnapshot,
    composerRole,
    connection: sessionSnapshot.connection,
    phase: sessionSnapshot.phase,
    revision,
    skills: skillCatalog,
  } as const;
  const controlView = turnApplication.project({ session: sessionFacts, editor: editorSnapshot });
  const pendingFacts = {
    composerRole,
    sessionRevision: revision,
    mutationsEnabled: controlView.operationsEnabled,
    snapshot: queueSnapshot,
  } as const;
  const pendingInputSnapshot = useSyncExternalStore(
    pendingHost.subscribe,
    pendingHost.getSnapshot,
  ).pending;
  const invalidStatusText = t`Invalid skill`;
  const skillValidity = useMemo(
    () => ({ invalidPaths: controlView.invalidSelectedSkillPaths, statusText: invalidStatusText }),
    [controlView.invalidSelectedSkillPaths, invalidStatusText],
  );
  const { guide: guideShortcut } = composerShortcutsForPlatform(navigator.platform);
  const focusComposer = useCallback((): void => {
    if (composerEditorController == null) return;
    if (controlView.operationsEnabled) {
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
  }, [composerEditorController, controlView.operationsEnabled]);

  const focusPendingTrigger = useCallback(() => {
    if (pendingTriggerRef.current != null) pendingTriggerRef.current.focus();
    else focusComposer();
  }, [focusComposer]);
  const retryPendingSkills = useCallback(() => {
    skillsRole.retrySkills(revision);
  }, [skillsRole, revision]);
  useComposerPendingInputBinding({
    ...pendingFacts,
    guardCompositionEndEnter,
    skillCatalog,
    onRetrySkillCatalog: retryPendingSkills,
    onFocusComposer: focusComposer,
    onFocusTrigger: focusPendingTrigger,
  });

  useEffect(() => {
    const lifecycle = adapterLifecycleRef.current;
    const generation = ++lifecycle.generation;
    lifecycle.mounted = true;
    return () => {
      lifecycle.mounted = false;
      queueMicrotask(() => {
        if (lifecycle.mounted || lifecycle.generation !== generation) return;
        turnApplication.dispose();
      });
    };
  }, [turnApplication]);

  const submit = (
    requestedCapture?: ReturnType<ComposerEditorController["capture"]>,
    intent: ComposerEditorSubmitIntent = "ordinary",
  ): void => {
    if (composerEditorController == null) return;
    turnApplication.submit({
      session: sessionFacts,
      controller: composerEditorController,
      ...(requestedCapture == null ? {} : { capture: requestedCapture }),
      intent,
    });
  };

  const recover = (): void => {
    turnApplication.recover({ session: sessionFacts });
  };

  const stop = (): void => {
    turnApplication.stop({ session: sessionFacts });
  };

  const requestCompaction = (): void => {
    compactionRole.requestCompaction(revision);
  };

  return (
    <ComposerSurface
      disabled={!controlView.operationsEnabled}
      key={sessionSnapshot.identity.instanceId}
      editor={{
        authorizationToken,
        disabled: !controlView.operationsEnabled,
        guardCompositionEndEnter,
        onControllerChange: setComposerEditorController,
        initialDraft,
        onDraftChange: saveDraft,
        onRetrySkillCatalog: () => {
          skillsRole.retrySkills(revision);
        },
        onSubmit: submit,
        submitIntents: controlView.guide.shortcutEnabled ? ["ordinary", "guide"] : ["ordinary"],
        skillCatalog,
        skillValidity,
      }}
      afterEditor={
        <>
          <ComposerPersistenceStatus sessionSnapshot={sessionSnapshot} />
          <ComposerPendingInputRegion
            canRecover={controlView.recoverEnabled}
            composerRole={composerRole}
            guardCompositionEndEnter={guardCompositionEndEnter}
            mutationsEnabled={controlView.operationsEnabled}
            onFocusComposer={focusComposer}
            onRecover={recover}
            onRetrySkillCatalog={() => {
              skillsRole.retrySkills(revision);
            }}
            recoveryDescriptionId={recoveryDescriptionId}
            sessionRevision={revision}
            skillCatalog={skillCatalog}
            snapshot={queueSnapshot}
            pendingInputSession={pendingInputSession}
            pendingInputSnapshot={pendingInputSnapshot}
            triggerRef={pendingTriggerRef}
          />
        </>
      }
      toolbarLeading={
        <>
          <QrAccessPopover authorizationToken={authorizationToken} routeTarget={routeTarget} />
          <CurrentThreadStatus status={sessionSnapshot.threadStatus} />
        </>
      }
      actions={
        <>
          <ContextUsagePopover
            compaction={compaction}
            onRequestCompaction={requestCompaction}
            usage={contextUsage}
          />
          <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
            {controlView.stop.failed ? (
              <Chip color="danger" size="md" variant="secondary" role="status">
                <CircleAlert aria-hidden="true" className="size-3" />
                <Chip.Label>
                  <Trans>Stop failed</Trans>
                </Chip.Label>
              </Chip>
            ) : null}
            <Button
              isDisabled={!controlView.stop.enabled}
              isPending={controlView.stop.pending}
              onPress={stop}
              variant="danger-soft"
            >
              <Trans>Stop</Trans>
            </Button>
          </div>
          <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
            {controlView.guide.visible ? (
              <Tooltip>
                <Button
                  render={(props) => <button {...props} aria-keyshortcuts={guideShortcut.aria} />}
                  isDisabled={!controlView.guide.buttonEnabled}
                  onPress={() => {
                    submit(undefined, "guide");
                  }}
                  variant="secondary"
                >
                  <Trans>Guide</Trans>
                </Button>
                <Tooltip.Content>
                  <ShortcutKey aria={guideShortcut.aria} variant="light" />
                </Tooltip.Content>
              </Tooltip>
            ) : null}
            <ComposerSendButton
              isDisabled={!controlView.sendEnabled}
              onPress={() => {
                submit();
              }}
            />
          </div>
        </>
      }
    />
  );
}

const subscribeUnavailableEditor = (): (() => void) => () => undefined;
const getUnavailableEditorSnapshot = (): null => null;
