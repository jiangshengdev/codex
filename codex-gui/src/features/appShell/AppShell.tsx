import { Alert, Surface, Toast } from "@heroui/react";
import type { ReactNode } from "react";
import { CommittedTranscriptSurface } from "@/features/committedTranscriptSurface/CommittedTranscriptSurface";
import { ComposerTurnControl } from "@/features/composerTurnControl/ComposerTurnControl";
import type {
  GuiHostCommands,
  GuiHostStatus,
  LaunchParams,
} from "@/features/guiHost/guiHostClient";
import { useCommittedTranscriptStickyBottom } from "./useCommittedTranscriptStickyBottom";

export type AppShellProps = {
  status: GuiHostStatus;
  commands: GuiHostCommands | null;
  launchParams: LaunchParams | null;
};

function isMacAppleWebKitRuntime(): boolean {
  return (
    navigator.vendor === "Apple Computer, Inc." &&
    navigator.platform === "MacIntel" &&
    navigator.maxTouchPoints <= 1
  );
}

function GuiHostErrorAlert({ status }: { status: GuiHostStatus }) {
  if (status.label !== "error") {
    return null;
  }

  return (
    <Alert className="w-full" status="danger">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>Unable to start Codex GUI</Alert.Title>
        <Alert.Description>{status.message}</Alert.Description>
      </Alert.Content>
    </Alert>
  );
}

function AppShellTopNotices({ children }: { children: ReactNode }) {
  return (
    <div
      className="sticky top-0 z-20 border-b border-border bg-background px-4 py-3 sm:px-6 lg:px-8"
      data-app-shell-top-notices=""
    >
      <div className="mx-auto grid w-full max-w-3xl gap-2">{children}</div>
    </div>
  );
}

export function AppShell({ status, commands, launchParams }: AppShellProps) {
  const transcriptBottomRef = useCommittedTranscriptStickyBottom();
  const guardCompositionEndEnter = isMacAppleWebKitRuntime();
  const hasTopNotice = status.label === "error";

  return (
    <main
      className="flex min-h-svh w-full flex-col bg-background text-foreground"
      data-gui-host-status={status.label}
    >
      <Toast.Provider placement="top" />
      {hasTopNotice ? (
        <AppShellTopNotices>
          <GuiHostErrorAlert status={status} />
        </AppShellTopNotices>
      ) : null}
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
        guardCompositionEndEnter={guardCompositionEndEnter}
        guiHostStatus={status}
        launchParams={launchParams}
      />
    </main>
  );
}
