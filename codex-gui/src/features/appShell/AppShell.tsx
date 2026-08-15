import { Alert, Surface, Toast } from "@heroui/react";
import { Trans } from "@lingui/react/macro";
import type { ReactNode } from "react";
import type { BrowserLaunchParams } from "@/features/browserLaunch/browserLaunchParams";
import { CommittedTranscriptSurface } from "@/features/committedTranscriptSurface/CommittedTranscriptSurface";
import type { ComposerInputQueueCoordinator } from "@/features/composerInputQueue/composerInputQueueCoordinator";
import { ComposerTurnControl } from "@/features/composerTurnControl/ComposerTurnControl";
import type { GuiHostCommands, GuiHostStatus } from "@/features/guiHost/guiHostClient";
import { useCommittedTranscriptStickyBottom } from "./useCommittedTranscriptStickyBottom";

export type AppShellProps = {
  status: GuiHostStatus;
  commands: GuiHostCommands | null;
  composerInputQueueController: ComposerInputQueueCoordinator | null;
  launchParams: BrowserLaunchParams | null;
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
        <Alert.Title>
          <Trans>Unable to start Codex GUI</Trans>
        </Alert.Title>
        <Alert.Description>{status.message}</Alert.Description>
      </Alert.Content>
    </Alert>
  );
}

function AppShellTopNotices({ children }: { children: ReactNode }) {
  return (
    <div className="sticky top-0 z-20" data-app-shell-top-notices="">
      <div className="mx-auto grid w-full max-w-3xl gap-2 pt-3">{children}</div>
    </div>
  );
}

export function AppShell({
  status,
  commands,
  composerInputQueueController,
  launchParams,
}: AppShellProps) {
  const transcriptBottomRef = useCommittedTranscriptStickyBottom();
  const guardCompositionEndEnter = isMacAppleWebKitRuntime();
  const hasTopNotice = status.label === "error";

  return (
    <main
      className="flex min-h-svh w-full flex-col gap-4 bg-background text-foreground"
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
        composerInputQueueController={composerInputQueueController}
        guardCompositionEndEnter={guardCompositionEndEnter}
        guiHostStatus={status}
        launchParams={launchParams}
      />
    </main>
  );
}
