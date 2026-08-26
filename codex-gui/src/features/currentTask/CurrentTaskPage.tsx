import { Alert, Surface } from "@heroui/react";
import { Trans } from "@lingui/react/macro";
import { CommittedTranscriptSurface } from "@/features/committedTranscriptSurface/CommittedTranscriptSurface";
import { ComposerTurnControl } from "@/features/composerTurnControl/ComposerTurnControl";
import {
  type AppCapabilities,
  useActiveThreadSessionPhase,
  useActiveThreadSessionSnapshot,
  useAppCapabilities,
} from "@/features/appShell/AppCapabilities";
import { useCommittedTranscriptStickyBottom } from "@/features/appShell/useCommittedTranscriptStickyBottom";

function isMacAppleWebKitRuntime(): boolean {
  return (
    navigator.vendor === "Apple Computer, Inc." &&
    navigator.platform === "MacIntel" &&
    navigator.maxTouchPoints <= 1
  );
}

export function CurrentTaskPage() {
  const { activeThreadSession, activeThreadStartupError, authorizationToken, routeTarget, status } =
    useAppCapabilities();
  const sessionPhase = useActiveThreadSessionPhase();
  const guardCompositionEndEnter = isMacAppleWebKitRuntime();

  if (activeThreadSession != null && sessionPhase === "empty" && activeThreadStartupError != null) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-6" data-gui-host-status={status.label}>
        <Alert role="alert" status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>
              <Trans>Unable to load the current task</Trans>
            </Alert.Title>
            <Alert.Description>{activeThreadStartupError}</Alert.Description>
          </Alert.Content>
        </Alert>
      </main>
    );
  }

  if (activeThreadSession == null || sessionPhase === "empty" || sessionPhase === "disposed") {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-6" data-gui-host-status={status.label} />
    );
  }

  return (
    <CurrentTaskReady
      authorizationToken={authorizationToken}
      guardCompositionEndEnter={guardCompositionEndEnter}
      routeTarget={routeTarget}
      status={status}
    />
  );
}

type CurrentTaskReadyProps = Readonly<{
  authorizationToken: AppCapabilities["authorizationToken"];
  guardCompositionEndEnter: boolean;
  routeTarget: AppCapabilities["routeTarget"];
  status: AppCapabilities["status"];
}>;

function CurrentTaskReady({
  authorizationToken,
  guardCompositionEndEnter,
  routeTarget,
  status,
}: CurrentTaskReadyProps) {
  const transcriptBottomRef = useCommittedTranscriptStickyBottom();

  return (
    <main className="flex min-h-0 w-full flex-1 flex-col gap-4" data-gui-host-status={status.label}>
      <Surface
        className="mx-auto grid min-w-0 w-full max-w-3xl flex-1 content-start"
        variant="transparent"
      >
        <CommittedTranscriptSurface />
      </Surface>
      <div
        aria-hidden="true"
        className="committed-transcript-bottom-sentinel h-px w-full"
        ref={transcriptBottomRef}
      />
      <CurrentTaskComposer
        authorizationToken={authorizationToken}
        guardCompositionEndEnter={guardCompositionEndEnter}
        routeTarget={routeTarget}
      />
    </main>
  );
}

function CurrentTaskComposer({
  authorizationToken,
  guardCompositionEndEnter,
  routeTarget,
}: Readonly<{
  authorizationToken: AppCapabilities["authorizationToken"];
  guardCompositionEndEnter: boolean;
  routeTarget: AppCapabilities["routeTarget"];
}>) {
  const snapshot = useActiveThreadSessionSnapshot();
  if (snapshot.phase !== "active" && snapshot.phase !== "projectionUnavailable") return null;
  return (
    <ComposerTurnControl
      authorizationToken={authorizationToken}
      guardCompositionEndEnter={guardCompositionEndEnter}
      routeTarget={routeTarget}
      sessionSnapshot={snapshot}
    />
  );
}
