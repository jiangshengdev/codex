import { Alert, Surface } from "@heroui/react";
import { Trans } from "@lingui/react/macro";
import { CommittedTranscriptSurface } from "@/features/committedTranscriptSurface/CommittedTranscriptSurface";
import { ComposerTurnControl } from "@/features/composerTurnControl/ComposerTurnControl";
import { useAppCapabilities } from "@/features/appShell/AppCapabilities";
import { useCommittedTranscriptStickyBottom } from "@/features/appShell/useCommittedTranscriptStickyBottom";

function isMacAppleWebKitRuntime(): boolean {
  return (
    navigator.vendor === "Apple Computer, Inc." &&
    navigator.platform === "MacIntel" &&
    navigator.maxTouchPoints <= 1
  );
}

export function CurrentTaskPage() {
  const { activeOwner, commands, startupOutcome, status } = useAppCapabilities();
  const transcriptBottomRef = useCommittedTranscriptStickyBottom();
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
        commands={commands}
        composerInputQueueController={activeOwner.queueCoordinator}
        guardCompositionEndEnter={guardCompositionEndEnter}
        guiHostStatus={status}
        launchParams={null}
      />
    </main>
  );
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
