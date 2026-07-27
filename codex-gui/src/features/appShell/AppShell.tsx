import { Alert, Surface } from "@heroui/react";
import { Trans } from "@lingui/react/macro";
import { useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { createPrimarySurfaceNavigation } from "@/features/appRuntime/primarySurfaceNavigation";
import type { BrowserLaunchParams } from "@/features/browserLaunch/browserLaunchParams";
import { CommittedTranscriptSurface } from "@/features/committedTranscriptSurface/CommittedTranscriptSurface";
import { ComposerTurnControl } from "@/features/composerTurnControl/ComposerTurnControl";
import type { GuiHostCommands, GuiHostStatus } from "@/features/guiHost/guiHostClient";
import { useCommittedTranscriptStickyBottom } from "./useCommittedTranscriptStickyBottom";

export type AppShellProps = {
  status: GuiHostStatus;
  commands: GuiHostCommands | null;
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
          <Trans comment="Error alert title; Codex GUI is the product name">
            Unable to start Codex GUI
          </Trans>
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

export function AppShell({ status, commands, launchParams }: AppShellProps) {
  const navigate = useNavigate();
  const { openSettings } = createPrimarySurfaceNavigation(navigate);
  const { captureScrollSnapshot, transcriptBottomRef } =
    useCommittedTranscriptStickyBottom();
  const guardCompositionEndEnter = isMacAppleWebKitRuntime();
  const hasTopNotice = status.label === "error";

  const onOpenSettings = (): void => {
    captureScrollSnapshot();
    void openSettings();
  };

  return (
    <main
      className="flex min-h-svh w-full flex-col gap-4 bg-background text-foreground"
      data-chat-main=""
      data-gui-host-status={status.label}
      tabIndex={-1}
    >
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
        onOpenSettings={onOpenSettings}
      />
    </main>
  );
}
