import { Alert, Spinner, Surface } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
import { FailureLayout } from "@/feedback/FailureLayout";
import { RetryActionButton } from "@/feedback/RetryActionButton";
import { ProjectionRecoveryNotice } from "./ProjectionRecoveryNotice";
import { ConnectionTaskRecoveryNotice } from "./ConnectionTaskRecoveryNotice";

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
  const { activeThreadSession, authorizationToken, routeTarget, status, connectionRecovery } =
    useAppCapabilities();
  const routeThreadId = routeTarget.type === "currentTask" ? routeTarget.threadId : null;
  const requestScope = useMemo(
    () => ({
      activeThreadSession,
      authorizationToken,
      routeThreadId,
    }),
    [activeThreadSession, authorizationToken, routeThreadId],
  );
  const currentScopeRef = useRef<typeof requestScope | null>(null);
  useLayoutEffect(() => {
    currentScopeRef.current = requestScope;
    return () => {
      currentScopeRef.current = null;
    };
  }, [requestScope]);
  const isCurrentScope = (): boolean => currentScopeRef.current === requestScope;
  const [localResult, setLocalResult] = useState<{
    scope: typeof requestScope;
    error: string | null;
  } | null>(null);
  const [pendingState, setPendingState] = useState<{
    scope: typeof requestScope;
    operations: readonly string[];
  } | null>(null);
  const pendingStateRef = useRef<typeof pendingState>(null);
  const pendingOperations = pendingState?.scope === requestScope ? pendingState.operations : [];
  const retryError = localResult?.scope === requestScope ? localResult.error : null;
  const setRetryError = (error: string | null) => {
    if (isCurrentScope()) setLocalResult({ scope: requestScope, error });
  };
  const beginRequest = (operation: string): boolean => {
    if (!isCurrentScope()) return false;
    const current = pendingStateRef.current;
    const operations = current?.scope === requestScope ? current.operations : [];
    if (operations.includes(operation)) return false;
    const next = { scope: requestScope, operations: [...operations, operation] };
    pendingStateRef.current = next;
    setPendingState(next);
    return true;
  };
  const finishRequest = (operation: string) => {
    if (!isCurrentScope()) return;
    const current = pendingStateRef.current;
    if (current?.scope !== requestScope) return;
    const next = {
      scope: requestScope,
      operations: current.operations.filter((entry) => entry !== operation),
    };
    pendingStateRef.current = next;
    setPendingState(next);
  };
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
    if (activeThreadSession == null || !beginRequest("retry")) return;
    try {
      const outcome = await (activate
        ? activeThreadSession.activate(threadId)
        : activeThreadSession.retry(threadId));
      if (!isCurrentScope()) return;
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
            if (isCurrentScope())
              activeThreadSession.setOperationError(outcome.threadId, "navigation", null);
          } catch (error: unknown) {
            if (isCurrentScope())
              activeThreadSession.setOperationError(outcome.threadId, "navigation", error);
          }
        }
        setRetryError(null);
      } else if (outcome.type === "unavailable") {
        const failedMember = activeThreadSession
          .getCollectionSnapshot()
          .members.find((entry) => entry.threadId === threadId);
        setRetryError(
          failedMember?.error != null
            ? null
            : t`Unable to retry this task. Review its current state and try again.`,
        );
      } else if (
        outcome.type === "ready" &&
        !activeThreadSession
          .getCollectionSnapshot()
          .members.find((entry) => entry.threadId === threadId)
          ?.removalBlockers.includes("statusUnknown")
      ) {
        setRetryError(null);
      }
    } catch (error: unknown) {
      setRetryError(errorText(error));
    } finally {
      finishRequest("retry");
    }
  };
  const retryOperation = async (
    threadId: string,
    operation: ActiveThreadMemberOperationError["operation"],
  ): Promise<void> => {
    if (activeThreadSession == null || !beginRequest(operation)) return;
    try {
      if (operation === "navigation") {
        await navigate({ to: CURRENT_TASK_ROUTE_PATH, params: { threadId } });
        if (!isCurrentScope()) return;
      } else {
        const outcome = await activeThreadSession.remove(threadId);
        if (!isCurrentScope()) return;
        if (outcome.type !== "removed") return;
        const target = selectGuiRouteTarget(router.state.matches);
        if (outcome.wasViewed && target?.type === "currentTask" && target.threadId === threadId) {
          try {
            await navigate({ to: HISTORY_DETAIL_ROUTE_PATH, params: { threadId }, replace: true });
            if (isCurrentScope())
              activeThreadSession.setOperationError(threadId, "navigation", null);
          } catch (error: unknown) {
            if (isCurrentScope())
              activeThreadSession.setOperationError(threadId, "navigation", error);
          }
        }
      }
      if (isCurrentScope()) activeThreadSession.setOperationError(threadId, operation, null);
    } catch (error: unknown) {
      if (isCurrentScope()) activeThreadSession.setOperationError(threadId, operation, error);
    } finally {
      finishRequest(operation);
    }
  };
  const operationNotices = member?.operationErrors.map(({ operation, error }) => (
    <Alert key={operation} role="alert" status="danger">
      <Alert.Indicator />
      <FailureLayout
        actions={
          <RetryActionButton
            isPending={
              pendingOperations.includes(operation) ||
              (operation === "remove" && member.removalPending)
            }
            isDisabled={status.label !== "initialized" && operation !== "navigation"}
            pendingChildren={
              operation === "remove" ? (
                <Trans comment="Leaving GUI active task list; task history and drafts are kept">
                  Removing task…
                </Trans>
              ) : (
                <Trans>Opening task…</Trans>
              )
            }
            size="sm"
            variant={operation === "remove" ? "danger" : "primary"}
            onPress={() => {
              void retryOperation(member.threadId, operation);
            }}
          >
            {operation === "remove" ? (
              <Trans comment="Remove from GUI active task list; keep task history and drafts">
                Remove task
              </Trans>
            ) : (
              <Trans>Open task</Trans>
            )}
          </RetryActionButton>
        }
      >
        <Alert.Content>
          <Alert.Title>
            <Trans>Task action failed</Trans>
          </Alert.Title>
          <Alert.Description>
            {operation === "navigation" ? (
              <Trans>The task could not be opened.</Trans>
            ) : (
              <Trans>The task could not be removed.</Trans>
            )}
          </Alert.Description>
          {taskErrorText(error) !== "" ? (
            <FailureDiagnosticModal triggerClassName="mt-2 self-start" triggerSize="sm">
              {taskErrorText(error)}
            </FailureDiagnosticModal>
          ) : null}
        </Alert.Content>
      </FailureLayout>
    </Alert>
  ));

  if (
    activeThreadSession != null &&
    (sessionPhase === "empty" || targetMembershipFailed) &&
    (collection.errors.length > 0 || retryError != null)
  ) {
    const retryAction =
      routeTarget.type === "currentTask" ? (
        <RetryActionButton
          isDisabled={status.label !== "initialized"}
          isPending={pendingOperations.includes("retry") || member?.retryPending === true}
          pendingChildren={<Trans>Loading task…</Trans>}
          size="sm"
          variant="primary"
          onPress={() => {
            void retry(routeTarget.threadId, true);
          }}
        >
          <Trans>Load task</Trans>
        </RetryActionButton>
      ) : null;
    return (
      <main className="task-page" data-gui-host-status={status.label}>
        {retryError != null ? (
          <Alert role="alert" status="danger">
            <Alert.Indicator />
            <FailureLayout actions={retryAction}>
              <Alert.Content>
                <Alert.Title>
                  <Trans>Unable to load the current task</Trans>
                </Alert.Title>
                <Alert.Description>
                  <Trans>The current task could not be loaded.</Trans>
                </Alert.Description>
                {retryError !== "" ? (
                  <FailureDiagnosticModal triggerClassName="mt-2 self-start" triggerSize="sm">
                    {retryError}
                  </FailureDiagnosticModal>
                ) : null}
              </Alert.Content>
            </FailureLayout>
          </Alert>
        ) : null}
        {retryError == null ? retryAction : null}
      </main>
    );
  }

  if (activeThreadSession == null || sessionPhase === "empty" || sessionPhase === "disposed") {
    return <main className="task-page" data-gui-host-status={status.label} />;
  }

  if (routeTarget.type !== "currentTask" || snapshot.threadId !== routeTarget.threadId) {
    return (
      <main className="task-page" data-gui-host-status={status.label}>
        <CurrentTaskLoading />
      </main>
    );
  }
  if (snapshot.phase !== "active" && snapshot.phase !== "projectionUnavailable") {
    if (snapshot.phase === "loading" && snapshot.error == null && retryError == null) {
      return (
        <main className="task-page" data-gui-host-status={status.label}>
          <CurrentTaskLoading />
        </main>
      );
    }
    const retryAction = (
      <RetryActionButton
        isDisabled={status.label !== "initialized"}
        isPending={pendingOperations.includes("retry") || member?.retryPending === true}
        pendingChildren={
          member?.retryAction === "remove" ? (
            <Trans comment="Leaving GUI active task list; task history and drafts are kept">
              Removing task…
            </Trans>
          ) : (
            <Trans>Loading task…</Trans>
          )
        }
        size="sm"
        variant={member?.retryAction === "remove" ? "danger" : "primary"}
        onPress={() => {
          void retry(snapshot.threadId, false);
        }}
      >
        {member?.retryAction === "remove" ? (
          <Trans comment="Remove from GUI active task list; keep task history and drafts">
            Remove task
          </Trans>
        ) : (
          <Trans>Load task</Trans>
        )}
      </RetryActionButton>
    );
    return (
      <main className="task-page" data-gui-host-status={status.label}>
        {snapshot.error != null || retryError != null ? (
          <Alert role="alert" status="danger">
            <Alert.Indicator />
            <FailureLayout actions={retryAction}>
              <Alert.Content>
                <Alert.Title>
                  <Trans>Unable to load the current task</Trans>
                </Alert.Title>
                <Alert.Description>
                  <Trans>The current task could not be loaded.</Trans>
                </Alert.Description>
                {(retryError ?? taskErrorText(snapshot.error)) !== "" ? (
                  <FailureDiagnosticModal triggerClassName="mt-2 self-start" triggerSize="sm">
                    {retryError ?? taskErrorText(snapshot.error)}
                  </FailureDiagnosticModal>
                ) : null}
              </Alert.Content>
            </FailureLayout>
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
      member.removalBlockers.includes("statusUnknown") ||
      (member.retryPending && pendingOperations.includes("retry"))) ? (
      <RetryActionButton
        isDisabled={snapshot.connection.phase !== "available"}
        isPending={pendingOperations.includes("retry") || member.retryPending}
        pendingChildren={
          member.retryAction === "remove" ? (
            <Trans comment="Leaving GUI active task list; task history and drafts are kept">
              Removing task…
            </Trans>
          ) : member.retryAction === "load" ? (
            <Trans>Loading task…</Trans>
          ) : (
            <Trans>Refreshing status…</Trans>
          )
        }
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
        {member.retryAction === "remove" ? (
          <Trans comment="Remove from GUI active task list; keep task history and drafts">
            Remove task
          </Trans>
        ) : member.retryAction === "load" ? (
          <Trans>Load task</Trans>
        ) : (
          <Trans comment="Reload the current task's runtime status">Refresh status</Trans>
        )}
      </RetryActionButton>
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
          {snapshot.connection.phase === "unavailable" ? (
            <ConnectionTaskRecoveryNotice
              connection={snapshot.connection}
              canRecover={status.label === "initialized" && connectionRecovery == null}
              onRecover={() => {
                void activeThreadSession.recoverConnection(snapshot.threadId, snapshot.identity);
              }}
            />
          ) : null}
          {snapshot.phase === "projectionUnavailable" ? (
            <ProjectionRecoveryNotice
              snapshot={snapshot}
              onRecover={() => {
                void activeThreadSession.recoverProjection(snapshot.threadId, snapshot.identity);
              }}
            />
          ) : null}
          {member?.error != null ? (
            <Alert role="alert" status="danger">
              <Alert.Indicator />
              <FailureLayout actions={retryError == null ? recoveryAction : null}>
                <Alert.Content>
                  <Alert.Title>
                    <Trans>Task action failed</Trans>
                  </Alert.Title>
                  <Alert.Description>
                    <Trans>The task action could not be completed.</Trans>
                  </Alert.Description>
                  {taskErrorText(member.error) !== "" ? (
                    <FailureDiagnosticModal triggerClassName="mt-2 self-start" triggerSize="sm">
                      {taskErrorText(member.error)}
                    </FailureDiagnosticModal>
                  ) : null}
                </Alert.Content>
              </FailureLayout>
            </Alert>
          ) : null}
          {operationNotices}
          {recoveryAction != null ? (
            retryError != null ? (
              <Alert role="alert" status="danger">
                <Alert.Indicator />
                <FailureLayout actions={recoveryAction}>
                  <Alert.Content>
                    <Alert.Title>
                      <Trans>Unable to recover the current task</Trans>
                    </Alert.Title>
                    <Alert.Description>
                      <Trans>The task recovery could not be completed.</Trans>
                    </Alert.Description>
                    {retryError !== "" ? (
                      <FailureDiagnosticModal triggerClassName="mt-2 self-start" triggerSize="sm">
                        {retryError}
                      </FailureDiagnosticModal>
                    ) : null}
                  </Alert.Content>
                </FailureLayout>
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
    <main className="task-page" data-gui-host-status={status.label}>
      {notices}
      <Surface className="grid min-w-0 flex-1 content-start" variant="transparent">
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

function CurrentTaskLoading() {
  return (
    <div
      className="mx-auto flex w-fit max-w-full items-center gap-2 py-6 text-sm text-muted"
      role="status"
    >
      <Spinner aria-hidden="true" size="sm" />
      <span>
        <Trans>Loading task…</Trans>
      </span>
    </div>
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
