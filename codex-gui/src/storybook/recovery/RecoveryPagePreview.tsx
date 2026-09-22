import { StrictMode, useEffect, useSyncExternalStore } from "react";
import { Trans } from "@lingui/react/macro";
import { useLocation } from "@tanstack/react-router";
import { useAppDispatch } from "@/app/hooks";
import { AppCapabilitiesContext } from "@/features/appShell/AppCapabilities";
import { AppShell } from "@/features/appShell/AppShell";
import { CurrentTaskPage } from "@/features/currentTask/CurrentTaskPage";
import { PendingInputPreview } from "../composer/pendingInput/PendingInputScenarioView";
import { createRecoveryPageScenario, type RecoveryPageSetup } from "./recoveryPageScenario";

function RecoveryPage({
  scenario,
}: Readonly<{ scenario: ReturnType<typeof createRecoveryPageScenario> }>) {
  const capabilities = useSyncExternalStore(scenario.subscribe, scenario.getSnapshot);
  const ready = useSyncExternalStore(scenario.subscribe, scenario.isReady);
  const sendCount = useSyncExternalStore(scenario.host.subscribeSends, scenario.host.getSendCount);
  const pathname = useLocation({ select: (location) => location.pathname });
  useEffect(() => {
    scenario.start();
  }, [scenario]);
  useEffect(() => {
    const threadId = pathname.split("/")[2];
    if (ready && pathname.startsWith("/task/") && threadId != null) scenario.view(threadId);
  }, [pathname, ready, scenario]);
  if (!ready) return null;
  return (
    <div className="relative" data-recovery-send-count={sendCount}>
      <AppCapabilitiesContext value={capabilities}>
        <AppShell>
          <CurrentTaskPage />
          <div className="grid gap-6 pb-8" data-recovery-scroll-preview="">
            {[1, 2, 3, 4, 5, 6].map((section) => (
              <section
                key={section}
                className="min-h-[50svh] space-y-4 border-t border-separator py-6"
              >
                <h2 className="text-lg font-semibold">
                  <Trans comment="Storybook scroll demonstration heading; section is its ordinal number.">
                    Scroll preview — section {section}
                  </Trans>
                </h2>
                <p>
                  <Trans>
                    Scroll down to observe the fixed menu and recovery notices. Open the menu at
                    different scroll positions to inspect its placement over the page content.
                  </Trans>
                </p>
                <p className="text-muted">
                  <Trans>
                    These numbered sections are demonstration content for scrolling, separate from
                    the task conversation.
                  </Trans>
                </p>
              </section>
            ))}
          </div>
        </AppShell>
      </AppCapabilitiesContext>
    </div>
  );
}

export function RecoveryPagePreview({
  setup,
  startup = false,
}: Readonly<{ setup?: RecoveryPageSetup; startup?: boolean }>) {
  const dispatch = useAppDispatch();
  return (
    <StrictMode>
      <PendingInputPreview
        key={String(startup)}
        createScenario={() => createRecoveryPageScenario(dispatch, setup, startup)}
      >
        {(scenario) => <RecoveryPage scenario={scenario} />}
      </PendingInputPreview>
    </StrictMode>
  );
}
