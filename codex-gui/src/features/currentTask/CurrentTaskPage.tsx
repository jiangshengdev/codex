import { Surface } from "@heroui/react";
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
  const { activeOwner, commands, launchParams, status } = useAppCapabilities();
  const transcriptBottomRef = useCommittedTranscriptStickyBottom();
  const guardCompositionEndEnter = isMacAppleWebKitRuntime();

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
        composerInputQueueController={activeOwner?.queueCoordinator ?? null}
        guardCompositionEndEnter={guardCompositionEndEnter}
        guiHostStatus={status}
        launchParams={launchParams}
      />
    </main>
  );
}
