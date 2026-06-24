import { Surface, Toast } from "@heroui/react";
import { CommittedTranscriptSurface } from "@/features/committedTranscriptSurface/CommittedTranscriptSurface";
import { ComposerTurnControl } from "@/features/composerTurnControl/ComposerTurnControl";
import type { GuiHostCommands, GuiHostStatus } from "@/features/guiHost/guiHostClient";
import { useCommittedTranscriptStickyBottom } from "./useCommittedTranscriptStickyBottom";

export type AppShellProps = {
  status: GuiHostStatus;
  commands: GuiHostCommands | null;
};

export function AppShell({ status, commands }: AppShellProps) {
  const transcriptBottomRef = useCommittedTranscriptStickyBottom();

  return (
    <main
      className="min-h-svh w-full px-4 py-6 pb-44 sm:px-6 lg:px-8"
      data-gui-host-status={status.label}
    >
      <Toast.Provider placement="top" />
      <Surface className="mx-auto grid min-w-0 w-full max-w-6xl content-start" variant="default">
        <CommittedTranscriptSurface />
      </Surface>
      <div
        aria-hidden="true"
        className="committed-transcript-bottom-sentinel h-px w-full"
        ref={transcriptBottomRef}
      />
      <ComposerTurnControl commands={commands} guiHostStatus={status} />
    </main>
  );
}
