import { StrictMode, useEffect, useSyncExternalStore } from "react";
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
        className=""
        key={String(startup)}
        createScenario={() => createRecoveryPageScenario(dispatch, setup, startup)}
      >
        {(scenario) => <RecoveryPage scenario={scenario} />}
      </PendingInputPreview>
    </StrictMode>
  );
}
