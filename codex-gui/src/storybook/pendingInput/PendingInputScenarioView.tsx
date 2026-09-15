import { Button, Surface, TextArea } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  StrictMode,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { ActiveThreadComposerRole } from "@/features/activeThreadSession/activeThreadSession";
import type { ComposerInputQueueCoordinatorSnapshot } from "@/features/composerInputQueue/composerInputQueueCoordinator";
import { ComposerPendingInputProvider } from "@/features/composerTurnControl/ComposerPendingInputProvider";
import { ComposerPendingInputRegion } from "@/features/composerTurnControl/ComposerPendingInputRegion";
import {
  useComposerPendingInput,
  useComposerPendingInputBinding,
} from "@/features/composerTurnControl/composerPendingInputHost";
import type { SkillCatalogState } from "@/features/skillCatalog/skillCatalogOwner";
import { baseTurn } from "@/features/projection/__tests__/projectionTestBuilders";
import {
  createPendingInputScenario,
  type PendingInputScenario,
  type PendingInputScenarioOptions,
} from "./pendingInputScenario";

const skills: SkillCatalogState = { type: "ready", candidates: [], partialErrorCount: 0 };
const noop = () => {
  // The preview's fixed empty skill catalog has no external retry operation.
};

export function PendingInputScenarioView({
  scenario,
  role = scenario.role,
  mutationsEnabled = true,
  displaySnapshot,
  children,
}: Readonly<{
  scenario: PendingInputScenario;
  role?: ActiveThreadComposerRole;
  mutationsEnabled?: boolean;
  /** A labeled, captured transient state for fixed previews; normal flows use the live owner. */
  displaySnapshot?: ComposerInputQueueCoordinatorSnapshot;
  children?: ReactNode;
}>) {
  const { t } = useLingui();
  const liveSnapshot = useSyncExternalStore(
    scenario.coordinator.subscribe,
    scenario.coordinator.getSnapshot,
  );
  const snapshot = displaySnapshot ?? liveSnapshot;
  const host = useComposerPendingInput();
  const pending = useSyncExternalStore(host.subscribe, host.getSnapshot);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const onFocusComposer = useCallback(() => composerRef.current?.focus(), []);
  const onFocusTrigger = useCallback(() => {
    if (triggerRef.current != null) triggerRef.current.focus();
    else onFocusComposer();
  }, [onFocusComposer]);
  const binding = {
    composerRole: role,
    snapshot,
    sessionRevision: 1,
    mutationsEnabled,
    guardCompositionEndEnter: false,
    skillCatalog: skills,
    onRetrySkillCatalog: noop,
    onFocusComposer,
    onFocusTrigger,
  };
  useComposerPendingInputBinding(binding);
  return (
    <Surface className="mx-auto grid w-full max-w-2xl gap-4 rounded-3xl p-4">
      <p className="text-sm text-muted">
        <Trans>
          Local simulation. Requests and runtime events advance only when you use the simulation
          controls.
        </Trans>
      </p>
      <TextArea
        ref={composerRef}
        aria-label={t({
          message: "Main draft",
          comment:
            "Accessible name for the separate main composer draft in the pending-input Storybook simulation",
        })}
        defaultValue="Separate main draft"
      />
      <ComposerPendingInputRegion
        {...binding}
        canRecover={mutationsEnabled && !snapshot.isRecovering}
        onRecover={() => {
          scenario.coordinator.recover();
        }}
        recoveryDescriptionId="preview-recovery"
        pendingInputSession={host.session}
        pendingInputSnapshot={pending.pending}
        triggerRef={triggerRef}
      />
      {children}
    </Surface>
  );
}

export function PendingInputPreview<Scenario extends PendingInputScenario>({
  createScenario,
  children,
  renderDrawerControls,
}: Readonly<{
  createScenario: () => Scenario;
  children: (scenario: Scenario) => ReactNode;
  renderDrawerControls?: (scenario: Scenario) => ReactNode;
}>) {
  const [generation, setGeneration] = useState(0);
  return (
    <div className="grid gap-3">
      <Button
        className="justify-self-start"
        variant="secondary"
        onPress={() => {
          setGeneration((value) => value + 1);
        }}
      >
        <Trans comment="Reset the local pending-input Storybook scenario to its initial state">
          Restart simulation
        </Trans>
      </Button>
      <PendingInputPreviewInstance
        key={generation}
        createScenario={createScenario}
        renderDrawerControls={renderDrawerControls}
      >
        {children}
      </PendingInputPreviewInstance>
    </div>
  );
}

function PendingInputPreviewInstance<Scenario extends PendingInputScenario>({
  createScenario,
  children,
  renderDrawerControls,
}: Readonly<{
  createScenario: () => Scenario;
  children: (scenario: Scenario) => ReactNode;
  renderDrawerControls?: (scenario: Scenario) => ReactNode;
}>) {
  const [scenario] = useState(createScenario);
  const lifecycle = useRef({ generation: 0 });
  useEffect(() => {
    const state = lifecycle.current;
    const generation = ++state.generation;
    return () => {
      queueMicrotask(() => {
        if (state.generation === generation) scenario.dispose();
      });
    };
  }, [scenario]);
  return (
    <ComposerPendingInputProvider
      renderConnectionRecovery={
        renderDrawerControls == null ? undefined : () => renderDrawerControls(scenario)
      }
    >
      {children(scenario)}
    </ComposerPendingInputProvider>
  );
}

function SendingControls({ scenario }: Readonly<{ scenario: PendingInputScenario }>) {
  const requests = useSyncExternalStore(scenario.starts.subscribe, scenario.starts.getSnapshot);
  const [activeTurnId, setActiveTurnId] = useState<string | null>(() =>
    requests.length === 0 ? "preview-active" : null,
  );
  const [responseTurnId, setResponseTurnId] = useState<string | null>(null);
  const nextTurn = useRef(0);
  const [confirmed, setConfirmed] = useState(false);
  return (
    <div className="grid gap-2">
      <Button
        variant="secondary"
        isDisabled={activeTurnId == null || requests.length > 0 || responseTurnId != null}
        onPress={() => {
          if (activeTurnId == null) return;
          scenario.completeTurn(activeTurnId);
          setActiveTurnId(null);
          setConfirmed(false);
        }}
      >
        <Trans comment="Inject the terminal event for the current simulated assistant turn; queued input may then start sending">
          Simulate current turn completed
        </Trans>
      </Button>
      <Button
        variant="secondary"
        isDisabled={requests.length === 0}
        onPress={() => {
          const request = requests[0];
          if (request == null) return;
          const id = `preview-next-${String(++nextTurn.current)}`;
          request.resolve({ turn: { ...baseTurn(id), status: "inProgress" } });
          setResponseTurnId(id);
        }}
      >
        <Trans comment="Resolve the pending local start-turn request without injecting a runtime event">
          Simulate send response
        </Trans>
      </Button>
      <Button
        variant="secondary"
        isDisabled={responseTurnId == null}
        onPress={() => {
          if (responseTurnId == null) return;
          scenario.acceptTurn(responseTurnId);
          setActiveTurnId(responseTurnId);
          setResponseTurnId(null);
          setConfirmed(true);
        }}
      >
        <Trans comment="Inject the runtime turn-started event that confirms the simulated queued message was accepted">
          Simulate runtime confirmation
        </Trans>
      </Button>
      <p role="status">
        {requests.length > 0 ? (
          <Trans comment="The local start-turn request remains unresolved until the preview response control is used">
            Waiting for send response
          </Trans>
        ) : responseTurnId != null ? (
          <Trans comment="The request succeeded but the simulated runtime acceptance event has not been injected">
            Response received; waiting for runtime confirmation
          </Trans>
        ) : confirmed ? (
          <Trans comment="The preview injected the runtime acceptance event for the queued message">
            Runtime confirmation received
          </Trans>
        ) : activeTurnId != null ? (
          <Trans comment="A simulated assistant turn blocks automatic dispatch of ordinary queued messages">
            Current turn is running
          </Trans>
        ) : (
          <Trans comment="No simulated assistant turn or start-turn request remains active">
            Simulation is idle
          </Trans>
        )}
      </p>
    </div>
  );
}

export function PendingInputBrowsingPreview({
  mutationsEnabled = true,
  ...options
}: PendingInputScenarioOptions & Readonly<{ mutationsEnabled?: boolean }>) {
  return (
    <StrictMode>
      <PendingInputPreview createScenario={() => createPendingInputScenario(options)}>
        {(scenario) => (
          <PendingInputScenarioView scenario={scenario} mutationsEnabled={mutationsEnabled}>
            <SendingControls scenario={scenario} />
          </PendingInputScenarioView>
        )}
      </PendingInputPreview>
    </StrictMode>
  );
}
