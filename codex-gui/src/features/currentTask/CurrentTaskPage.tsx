import { Alert, Button, Surface } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import {
  HISTORY_DETAIL_ROUTE_PATH,
  selectGuiRouteTarget,
} from "@/features/browserLaunch/guiRouteTarget";
import { CommittedTranscriptSurface } from "@/features/committedTranscriptSurface/CommittedTranscriptSurface";
import { ComposerTurnControl } from "@/features/composerTurnControl/ComposerTurnControl";
import {
  type AppCapabilities,
  useActiveThreadCollectionSnapshot,
  useActiveThreadSessionSnapshot,
  useAppCapabilities,
} from "@/features/appShell/AppCapabilities";
import { useCommittedTranscriptStickyBottom } from "@/features/appShell/useCommittedTranscriptStickyBottom";
import type { ActiveThreadSessionIdentity } from "@/features/activeThreadSession/activeThreadSessionIdentity";
import { errorText } from "@/text/errorText";

function isMacAppleWebKitRuntime(): boolean {
  return (
    navigator.vendor === "Apple Computer, Inc." &&
    navigator.platform === "MacIntel" &&
    navigator.maxTouchPoints <= 1
  );
}

export function CurrentTaskPage() {
  const { t } = useLingui();
  const navigate = useNavigate();
  const router = useRouter();
  const [retryError, setRetryError] = useState<string | null>(null);
  const { activeThreadSession, activeThreadStartupError, authorizationToken, routeTarget, status } =
    useAppCapabilities();
  const snapshot = useActiveThreadSessionSnapshot();
  const collection = useActiveThreadCollectionSnapshot();
  const sessionPhase = snapshot.phase;
  const targetMembershipFailed =
    routeTarget.type === "currentTask" &&
    collection.error != null &&
    !collection.members.some((member) => member.threadId === routeTarget.threadId);
  const guardCompositionEndEnter = isMacAppleWebKitRuntime();
  const retry = async (threadId: string, activate: boolean): Promise<void> => {
    if (activeThreadSession == null) return;
    setRetryError(null);
    try {
      const outcome = await (activate
        ? activeThreadSession.activate(threadId)
        : activeThreadSession.retry(threadId));
      if (outcome.type === "removed") {
        const target = selectGuiRouteTarget(router.state.matches);
        if (
          outcome.wasViewed &&
          target?.type === "currentTask" &&
          target.threadId === outcome.threadId
        ) {
          await navigate({
            to: HISTORY_DETAIL_ROUTE_PATH,
            params: { threadId: outcome.threadId },
            replace: true,
          });
        }
      } else if (outcome.type === "unavailable") {
        setRetryError(t`Unable to retry this task. Review its current state and try again.`);
      }
    } catch (error: unknown) {
      setRetryError(errorText(error));
    }
  };

  if (
    activeThreadSession != null &&
    (sessionPhase === "empty" || targetMembershipFailed) &&
    (activeThreadStartupError != null || collection.error != null || retryError != null)
  ) {
    return (
      <main className="app-shell-content-boundary py-6" data-gui-host-status={status.label}>
        <Alert role="alert" status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>
              <Trans>Unable to load the current task</Trans>
            </Alert.Title>
            <Alert.Description>
              {retryError ??
                (collection.error != null ? errorText(collection.error) : activeThreadStartupError)}
            </Alert.Description>
          </Alert.Content>
        </Alert>
        {routeTarget.type === "currentTask" ? (
          <Button
            variant="secondary"
            onPress={() => {
              void retry(routeTarget.threadId, true);
            }}
          >
            <Trans>Retry</Trans>
          </Button>
        ) : null}
      </main>
    );
  }

  if (activeThreadSession == null || sessionPhase === "empty" || sessionPhase === "disposed") {
    return <main className="app-shell-content-boundary py-6" data-gui-host-status={status.label} />;
  }

  if (routeTarget.type !== "currentTask" || snapshot.threadId !== routeTarget.threadId) {
    return (
      <main className="app-shell-content-boundary py-6" data-gui-host-status={status.label}>
        <Trans>Loading task…</Trans>
      </main>
    );
  }
  if (snapshot.phase !== "active" && snapshot.phase !== "projectionUnavailable") {
    if (snapshot.phase === "loading") {
      return (
        <main className="app-shell-content-boundary py-6" data-gui-host-status={status.label}>
          <Trans>Loading task…</Trans>
        </main>
      );
    }
    return (
      <main className="app-shell-content-boundary py-6" data-gui-host-status={status.label}>
        <Alert role="alert" status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>
              <Trans>Unable to load the current task</Trans>
            </Alert.Title>
            <Alert.Description>{retryError ?? errorText(snapshot.error)}</Alert.Description>
          </Alert.Content>
        </Alert>
        <Button
          variant="secondary"
          onPress={() => {
            void retry(snapshot.threadId, false);
          }}
        >
          <Trans>Retry</Trans>
        </Button>
      </main>
    );
  }

  return (
    <CurrentTaskReady
      key={snapshot.identity.instanceId}
      identity={snapshot.identity}
      authorizationToken={authorizationToken}
      guardCompositionEndEnter={guardCompositionEndEnter}
      routeTarget={routeTarget}
      status={status}
    />
  );
}

type CurrentTaskReadyProps = Readonly<{
  identity: ActiveThreadSessionIdentity;
  authorizationToken: AppCapabilities["authorizationToken"];
  guardCompositionEndEnter: boolean;
  routeTarget: AppCapabilities["routeTarget"];
  status: AppCapabilities["status"];
}>;

function CurrentTaskReady({
  identity,
  authorizationToken,
  guardCompositionEndEnter,
  routeTarget,
  status,
}: CurrentTaskReadyProps) {
  const transcriptBottomRef = useCommittedTranscriptStickyBottom(identity.threadId);

  return (
    <main className="flex min-h-0 w-full flex-1 flex-col gap-4" data-gui-host-status={status.label}>
      <Surface
        className="task-reading-boundary grid min-w-0 flex-1 content-start"
        variant="transparent"
      >
        <CommittedTranscriptSurface identity={identity} />
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
  if (routeTarget.type !== "currentTask" || routeTarget.threadId !== snapshot.threadId) return null;
  return (
    <ComposerTurnControl
      authorizationToken={authorizationToken}
      guardCompositionEndEnter={guardCompositionEndEnter}
      routeTarget={routeTarget}
      sessionSnapshot={snapshot}
    />
  );
}
