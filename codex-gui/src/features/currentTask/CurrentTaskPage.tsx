import { Alert, Surface } from "@heroui/react";
import { Trans } from "@lingui/react/macro";
import { CommittedTranscriptSurface } from "@/features/committedTranscriptSurface/CommittedTranscriptSurface";
import { ComposerTurnControl } from "@/features/composerTurnControl/ComposerTurnControl";
import { type AppCapabilities, useAppCapabilities } from "@/features/appShell/AppCapabilities";
import { useCommittedTranscriptStickyBottom } from "@/features/appShell/useCommittedTranscriptStickyBottom";

function isMacAppleWebKitRuntime(): boolean {
  return (
    navigator.vendor === "Apple Computer, Inc." &&
    navigator.platform === "MacIntel" &&
    navigator.maxTouchPoints <= 1
  );
}

export function CurrentTaskPage() {
  const { activeOwner, authorizationToken, commands, routeTarget, startupOutcome, status } =
    useAppCapabilities();
  const guardCompositionEndEnter = isMacAppleWebKitRuntime();

  if (startupOutcome?.type === "failed") {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-6" data-gui-host-status={status.label}>
        <Alert role="alert" status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>
              <Trans>Unable to load the current task</Trans>
            </Alert.Title>
            <Alert.Description>{errorText(startupOutcome.error)}</Alert.Description>
          </Alert.Content>
        </Alert>
      </main>
    );
  }

  if (startupOutcome?.type !== "ready" || activeOwner == null) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-6" data-gui-host-status={status.label} />
    );
  }

  return (
    <CurrentTaskReady
      activeOwner={activeOwner}
      authorizationToken={authorizationToken}
      commands={commands}
      guardCompositionEndEnter={guardCompositionEndEnter}
      routeTarget={routeTarget}
      status={status}
    />
  );
}

type CurrentTaskReadyProps = Readonly<{
  activeOwner: NonNullable<AppCapabilities["activeOwner"]>;
  authorizationToken: AppCapabilities["authorizationToken"];
  commands: AppCapabilities["commands"];
  guardCompositionEndEnter: boolean;
  routeTarget: AppCapabilities["routeTarget"];
  status: AppCapabilities["status"];
}>;

function CurrentTaskReady({
  activeOwner,
  authorizationToken,
  commands,
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
      <ComposerTurnControl
        authorizationToken={authorizationToken}
        commands={commands}
        composerInputQueueController={activeOwner.queueCoordinator}
        guardCompositionEndEnter={guardCompositionEndEnter}
        guiHostStatus={status}
        routeTarget={routeTarget}
      />
    </main>
  );
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
