import { Alert, Button, Surface } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import {
  HISTORY_DETAIL_ROUTE_PATH,
  CURRENT_TASK_ROUTE_PATH,
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
import type { ActiveThreadMemberOperationError } from "@/features/activeThreadSession/activeThreadSessionCollectionContracts";
import { errorText } from "@/text/errorText";
import { FailureDiagnosticModal } from "@/feedback/FailureDiagnosticModal";

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
  const { activeThreadSession, authorizationToken, routeTarget, status } = useAppCapabilities();
  const snapshot = useActiveThreadSessionSnapshot();
  const collection = useActiveThreadCollectionSnapshot();
  const sessionPhase = snapshot.phase;
  const targetMembershipFailed =
    routeTarget.type === "currentTask" &&
    collection.errors.some((error) => error.threadId === routeTarget.threadId) &&
    !collection.members.some((member) => member.threadId === routeTarget.threadId);
  const member =
    routeTarget.type === "currentTask"
      ? collection.members.find((entry) => entry.threadId === routeTarget.threadId)
      : undefined;
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
          try {
            await navigate({
              to: HISTORY_DETAIL_ROUTE_PATH,
              params: { threadId: outcome.threadId },
              replace: true,
            });
            activeThreadSession.setOperationError(outcome.threadId, "navigation", null);
          } catch (error: unknown) {
            activeThreadSession.setOperationError(outcome.threadId, "navigation", error);
          }
        }
      } else if (outcome.type === "unavailable") {
        setRetryError(t`Unable to retry this task. Review its current state and try again.`);
      }
    } catch (error: unknown) {
      setRetryError(errorText(error));
    }
  };
  const retryOperation = async (
    threadId: string,
    operation: ActiveThreadMemberOperationError["operation"],
  ): Promise<void> => {
    if (activeThreadSession == null) return;
    try {
      if (operation === "navigation") {
        await navigate({ to: CURRENT_TASK_ROUTE_PATH, params: { threadId } });
      } else {
        const outcome = await activeThreadSession.remove(threadId);
        if (outcome.type !== "removed") return;
        const target = selectGuiRouteTarget(router.state.matches);
        if (outcome.wasViewed && target?.type === "currentTask" && target.threadId === threadId) {
          try {
            await navigate({ to: HISTORY_DETAIL_ROUTE_PATH, params: { threadId }, replace: true });
            activeThreadSession.setOperationError(threadId, "navigation", null);
          } catch (error: unknown) {
            activeThreadSession.setOperationError(threadId, "navigation", error);
          }
        }
      }
      activeThreadSession.setOperationError(threadId, operation, null);
    } catch (error: unknown) {
      activeThreadSession.setOperationError(threadId, operation, error);
    }
  };
  const operationNotices = member?.operationErrors.map(({ operation, error }) => (
    <Alert key={operation} role="alert" status="danger">
      <Alert.Indicator />
      <Alert.Content className="grid min-w-0 flex-1 grid-cols-1 gap-x-4 sm:grid-cols-[minmax(0,1fr)_auto]">
        <Alert.Title>
          <Trans>Task action failed</Trans>
        </Alert.Title>
        <Alert.Description className="col-start-1">
          {operation === "navigation" ? (
            <Trans>The task could not be opened.</Trans>
          ) : (
            <Trans>The task could not be removed.</Trans>
          )}
        </Alert.Description>
        {taskErrorText(error) !== "" ? (
          <FailureDiagnosticModal
            triggerClassName="col-start-1 mt-2 justify-self-start"
            triggerSize="sm"
          >
            {taskErrorText(error)}
          </FailureDiagnosticModal>
        ) : null}
        <div className="mt-2 flex flex-wrap items-start gap-2 sm:col-start-2 sm:row-span-2 sm:row-start-1 sm:mt-0">
          <Button
            size="sm"
            variant={operation === "remove" ? "danger" : "primary"}
            onPress={() => {
              void retryOperation(member.threadId, operation);
            }}
          >
            <Trans>Retry</Trans>
          </Button>
        </div>
      </Alert.Content>
    </Alert>
  ));

  if (
    activeThreadSession != null &&
    (sessionPhase === "empty" || targetMembershipFailed) &&
    (collection.errors.length > 0 || retryError != null)
  ) {
    const retryAction =
      routeTarget.type === "currentTask" ? (
        <Button
          size="sm"
          variant="primary"
          onPress={() => {
            void retry(routeTarget.threadId, true);
          }}
        >
          <Trans>Retry</Trans>
        </Button>
      ) : null;
    return (
      <main className="app-shell-content-boundary py-6" data-gui-host-status={status.label}>
        {retryError != null ? (
          <Alert role="alert" status="danger">
            <Alert.Indicator />
            <Alert.Content className="grid min-w-0 flex-1 grid-cols-1 gap-x-4 sm:grid-cols-[minmax(0,1fr)_auto]">
              <Alert.Title>
                <Trans>Unable to load the current task</Trans>
              </Alert.Title>
              <Alert.Description className="col-start-1">
                <Trans>The current task could not be loaded.</Trans>
              </Alert.Description>
              {retryError !== "" ? (
                <FailureDiagnosticModal
                  triggerClassName="col-start-1 mt-2 justify-self-start"
                  triggerSize="sm"
                >
                  {retryError}
                </FailureDiagnosticModal>
              ) : null}
              <div className="mt-2 flex flex-wrap items-start gap-2 sm:col-start-2 sm:row-span-2 sm:row-start-1 sm:mt-0">
                {retryAction}
              </div>
            </Alert.Content>
          </Alert>
        ) : null}
        {retryError == null ? retryAction : null}
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
    const retryAction = (
      <Button
        size="sm"
        variant="primary"
        onPress={() => {
          void retry(snapshot.threadId, false);
        }}
      >
        <Trans>Retry</Trans>
      </Button>
    );
    return (
      <main className="app-shell-content-boundary py-6" data-gui-host-status={status.label}>
        {snapshot.error != null || retryError != null ? (
          <Alert role="alert" status="danger">
            <Alert.Indicator />
            <Alert.Content className="grid min-w-0 flex-1 grid-cols-1 gap-x-4 sm:grid-cols-[minmax(0,1fr)_auto]">
              <Alert.Title>
                <Trans>Unable to load the current task</Trans>
              </Alert.Title>
              <Alert.Description className="col-start-1">
                <Trans>The current task could not be loaded.</Trans>
              </Alert.Description>
              {(retryError ?? taskErrorText(snapshot.error)) !== "" ? (
                <FailureDiagnosticModal
                  triggerClassName="col-start-1 mt-2 justify-self-start"
                  triggerSize="sm"
                >
                  {retryError ?? taskErrorText(snapshot.error)}
                </FailureDiagnosticModal>
              ) : null}
              <div className="mt-2 flex flex-wrap items-start gap-2 sm:col-start-2 sm:row-span-2 sm:row-start-1 sm:mt-0">
                {retryAction}
              </div>
            </Alert.Content>
          </Alert>
        ) : null}
        {operationNotices}
        {snapshot.error == null && retryError == null ? retryAction : null}
      </main>
    );
  }

  const recoveryAction =
    member != null &&
    (member.phase === "cleanupPending" ||
      member.phase === "removalPending" ||
      member.removalBlockers.includes("statusUnknown")) ? (
      <Button
        size="sm"
        variant={
          member.phase === "cleanupPending" || member.phase === "removalPending"
            ? "danger"
            : "primary"
        }
        onPress={() => {
          void retry(member.threadId, false);
        }}
      >
        <Trans>Retry</Trans>
      </Button>
    ) : null;

  return (
    <CurrentTaskReady
      key={snapshot.identity.instanceId}
      identity={snapshot.identity}
      authorizationToken={authorizationToken}
      guardCompositionEndEnter={guardCompositionEndEnter}
      routeTarget={routeTarget}
      status={status}
      notices={
        <>
          {member?.error != null ? (
            <Alert role="alert" status="danger">
              <Alert.Indicator />
              <Alert.Content className="grid min-w-0 flex-1 grid-cols-1 gap-x-4 sm:grid-cols-[minmax(0,1fr)_auto]">
                <Alert.Title>
                  <Trans>Task action failed</Trans>
                </Alert.Title>
                <Alert.Description className="col-start-1">
                  <Trans>The task action could not be completed.</Trans>
                </Alert.Description>
                {taskErrorText(member.error) !== "" ? (
                  <FailureDiagnosticModal
                    triggerClassName="col-start-1 mt-2 justify-self-start"
                    triggerSize="sm"
                  >
                    {taskErrorText(member.error)}
                  </FailureDiagnosticModal>
                ) : null}
                <div className="mt-2 flex flex-wrap items-start gap-2 sm:col-start-2 sm:row-span-2 sm:row-start-1 sm:mt-0">
                  {retryError == null ? recoveryAction : null}
                </div>
              </Alert.Content>
            </Alert>
          ) : null}
          {operationNotices}
          {recoveryAction != null ? (
            retryError != null ? (
              <Alert role="alert" status="danger">
                <Alert.Indicator />
                <Alert.Content className="grid min-w-0 flex-1 grid-cols-1 gap-x-4 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <Alert.Title>
                    <Trans>Unable to recover the current task</Trans>
                  </Alert.Title>
                  <Alert.Description className="col-start-1">
                    <Trans>The task recovery could not be completed.</Trans>
                  </Alert.Description>
                  {retryError !== "" ? (
                    <FailureDiagnosticModal
                      triggerClassName="col-start-1 mt-2 justify-self-start"
                      triggerSize="sm"
                    >
                      {retryError}
                    </FailureDiagnosticModal>
                  ) : null}
                  <div className="mt-2 flex flex-wrap items-start gap-2 sm:col-start-2 sm:row-span-2 sm:row-start-1 sm:mt-0">
                    {recoveryAction}
                  </div>
                </Alert.Content>
              </Alert>
            ) : member?.error == null ? (
              recoveryAction
            ) : null
          ) : null}
        </>
      }
    />
  );
}

type CurrentTaskReadyProps = Readonly<{
  identity: ActiveThreadSessionIdentity;
  authorizationToken: AppCapabilities["authorizationToken"];
  guardCompositionEndEnter: boolean;
  routeTarget: AppCapabilities["routeTarget"];
  status: AppCapabilities["status"];
  notices: ReactNode;
}>;

function CurrentTaskReady({
  identity,
  authorizationToken,
  guardCompositionEndEnter,
  routeTarget,
  status,
  notices,
}: CurrentTaskReadyProps) {
  const transcriptBottomRef = useCommittedTranscriptStickyBottom(identity.threadId);

  return (
    <main className="flex min-h-0 w-full flex-1 flex-col gap-4" data-gui-host-status={status.label}>
      {notices}
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

function taskErrorText(error: unknown): string {
  return error instanceof AggregateError
    ? error.errors.map(taskErrorText).join("; ")
    : errorText(error);
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
