import { Alert, Button, toast, Typography } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAppCapabilities } from "@/features/appShell/AppCapabilities";
import type {
  ActiveThreadActivationFailure,
  ActiveThreadActivationWarning,
  ActiveThreadSession,
} from "@/features/activeThreadSession/activeThreadSession";
import {
  CURRENT_TASK_ROUTE_PATH,
  HISTORY_LIST_ROUTE_PATH,
  type GuiRouteTarget,
} from "@/features/browserLaunch/guiRouteTarget";
import { ReadOnlyCommittedTranscriptSurface } from "@/features/committedTranscriptSurface/CommittedTranscriptSurface";
import { formatTaskDocumentTitle } from "@/features/documentTitle/documentTitle";
import { HistoryDetailDocumentTitleFactPublisher } from "@/features/documentTitle/DocumentTitleOwner";
import type { GuiHostCommands } from "@/features/guiHost/guiHostClient";
import { QrAccessPopover } from "@/features/qrAccess/QrAccessPopover";
import type { Thread } from "@codex-protocol/v2";
import {
  initialThreadHistoryDetailState,
  ThreadHistoryDetailOwner,
  type ThreadHistoryDetailState,
} from "./threadHistoryDetailOwner";
import { useStrictModeSafeOwner } from "./useStrictModeSafeOwner";

type RetainedThreadHistoryDetailCapability = Readonly<{
  readThread: GuiHostCommands["readThread"];
}>;

export function ThreadHistoryDetailPage() {
  const { threadId } = useParams({ from: "/app/history/$threadId" });
  const { t } = useLingui();
  const { activeThreadSession, authorizationToken, commands, routeTarget, status } =
    useAppCapabilities();
  const activateThread = activeThreadSession?.activate ?? null;
  const [retainedCapability, setRetainedCapability] =
    useState<RetainedThreadHistoryDetailCapability | null>(() =>
      commands == null ? null : { readThread: commands.readThread },
    );

  useEffect(() => {
    if (commands == null) {
      return;
    }

    let isCurrent = true;
    queueMicrotask(() => {
      if (isCurrent) {
        setRetainedCapability((retained) => retained ?? { readThread: commands.readThread });
      }
    });
    return () => {
      isCurrent = false;
    };
  }, [commands]);

  const unavailableState: ThreadHistoryDetailState =
    status.label === "error"
      ? { type: "error", error: status.message }
      : status.label === "closed"
        ? { type: "error", error: t`The task connection was closed.` }
        : initialThreadHistoryDetailState;

  return (
    <main className="app-shell-content-boundary grid min-h-0 flex-1 content-start gap-6 py-6">
      {retainedCapability == null ? (
        <ThreadHistoryDetailContent
          authorizationToken={authorizationToken}
          activateThread={activateThread}
          retry={null}
          routeTarget={routeTarget}
          state={unavailableState}
          threadId={threadId}
        />
      ) : (
        <ThreadHistoryDetailOwnerBound
          authorizationToken={authorizationToken}
          activateThread={activateThread}
          readThread={retainedCapability.readThread}
          routeTarget={routeTarget}
          threadId={threadId}
        />
      )}
    </main>
  );
}

type ThreadHistoryDetailOwnerBoundProps = Readonly<{
  activateThread: ActiveThreadSession["activate"] | null;
  authorizationToken: string | null;
  readThread: GuiHostCommands["readThread"];
  routeTarget: GuiRouteTarget;
  threadId: string;
}>;

function ThreadHistoryDetailOwnerBound({
  activateThread,
  authorizationToken,
  readThread,
  routeTarget,
  threadId,
}: ThreadHistoryDetailOwnerBoundProps) {
  const owner = useMemo(
    () => new ThreadHistoryDetailOwner({ threadId, readThread }),
    [readThread, threadId],
  );
  const state = useStrictModeSafeOwner(owner);

  return (
    <ThreadHistoryDetailContent
      activateThread={activateThread}
      authorizationToken={authorizationToken}
      retry={owner.retry}
      routeTarget={routeTarget}
      state={state}
      threadId={threadId}
    />
  );
}

type ThreadHistoryDetailContentProps = Readonly<{
  activateThread: ActiveThreadSession["activate"] | null;
  authorizationToken: string | null;
  retry: (() => boolean | undefined) | null;
  routeTarget: GuiRouteTarget;
  state: ThreadHistoryDetailState;
  threadId: string;
}>;

function ThreadHistoryDetailContent({
  activateThread,
  authorizationToken,
  retry,
  routeTarget,
  state,
  threadId,
}: ThreadHistoryDetailContentProps) {
  const { t } = useLingui();
  const navigate = useNavigate();
  const thread = state.type === "ready" ? state.thread : null;
  const title = thread == null ? t`History detail` : threadTitle(thread, t`Untitled task`);

  return (
    <>
      {state.type === "ready" ? (
        <HistoryDetailDocumentTitleFactPublisher
          threadId={state.thread.id}
          title={formatTaskDocumentTitle({
            name: state.thread.name,
            preview: state.thread.preview,
            fallback: t`Untitled task`,
          })}
        />
      ) : null}
      <header className="grid gap-3">
        <div>
          <Button
            onPress={() => {
              void navigate({ to: HISTORY_LIST_ROUTE_PATH });
            }}
            variant="secondary"
          >
            <Trans>Back to history</Trans>
          </Button>
        </div>
        <div className="grid gap-1">
          <Typography className="wrap-break-word" type="h1">
            {title}
          </Typography>
          <Typography color="muted" type="body-sm">
            <Trans>Read-only history</Trans>
          </Typography>
        </div>
      </header>
      {state.type === "loading" ? (
        <Typography color="muted" role="status" type="body-sm">
          <Trans>Loading task history…</Trans>
        </Typography>
      ) : null}
      {state.type === "error" ? <HistoryDetailError error={state.error} retry={retry} /> : null}
      {state.type === "ready" && state.thread.turns.length === 0 ? (
        <Typography color="muted" type="body-sm">
          <Trans>This task has no messages.</Trans>
        </Typography>
      ) : null}
      {state.type === "ready" && state.thread.turns.length > 0 ? (
        <ReadOnlyCommittedTranscriptSurface
          surfaceKey={state.thread.id}
          transcriptState={state.transcriptState}
        />
      ) : null}
      {state.type === "ready" ? (
        <ContinueTaskAction
          activateThread={activateThread}
          authorizationToken={authorizationToken}
          key={state.thread.id}
          routeTarget={routeTarget}
          threadId={threadId}
        />
      ) : null}
    </>
  );
}

function threadTitle(thread: Thread, fallback: string): string {
  const name = thread.name?.trim() ?? "";
  return name || thread.preview.trim() || fallback;
}

function HistoryDetailError({
  error,
  retry,
}: Readonly<{ error: unknown; retry: (() => unknown) | null }>) {
  return (
    <Alert role="alert" status="danger">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>
          <Trans>Unable to load task history</Trans>
        </Alert.Title>
        <Alert.Description>{errorText(error)}</Alert.Description>
        {retry == null ? null : (
          <Button className="mt-3" onPress={retry} variant="tertiary">
            <Trans>Retry</Trans>
          </Button>
        )}
      </Alert.Content>
    </Alert>
  );
}

type ContinueTaskState =
  | Readonly<{ type: "idle" }>
  | Readonly<{ type: "pending"; capabilityToken: symbol }>
  | Readonly<{ type: "empty"; capabilityToken: symbol }>
  | Readonly<{
      type: "unavailable";
      capabilityToken: symbol;
      failure: ActiveThreadActivationFailure;
    }>
  | Readonly<{ type: "unexpectedFailure"; capabilityToken: symbol; error: unknown }>;

type ContinueTaskRequest = Readonly<{
  capabilityToken: symbol;
}>;

function ContinueTaskAction({
  activateThread,
  authorizationToken,
  routeTarget,
  threadId,
}: Readonly<{
  activateThread: ActiveThreadSession["activate"] | null;
  authorizationToken: string | null;
  routeTarget: GuiRouteTarget;
  threadId: string;
}>) {
  const { t } = useLingui();
  const navigate = useNavigate();
  const unavailableDescriptionId = useId();
  const warningMessages: ActivationWarningMessages = {
    authorizationPersistenceFailed: {
      title: t`Task opened`,
      description: t`The task opened, but some state synchronization did not finish.`,
    },
    previousOwnerCleanupFailed: {
      title: t`Task opened`,
      description: t`The previous task connection could not be fully cleaned up. Later state may be affected.`,
    },
  };
  const capability = useMemo(
    () => ({ activateThread, token: Symbol("activeThreadSession.activate capability") }),
    [activateThread],
  );
  const capabilityToken = capability.token;
  const currentCapabilityTokenRef = useRef(capabilityToken);
  const mountedRef = useRef(true);
  const inFlightRef = useRef<ContinueTaskRequest | null>(null);
  const [state, setState] = useState<ContinueTaskState>({ type: "idle" });
  const visibleState =
    state.type === "idle" || state.capabilityToken === capabilityToken
      ? state
      : ({ type: "idle" } as const);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      inFlightRef.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    currentCapabilityTokenRef.current = capabilityToken;
    if (inFlightRef.current != null && inFlightRef.current.capabilityToken !== capabilityToken) {
      inFlightRef.current = null;
    }

    return () => {
      if (inFlightRef.current?.capabilityToken === capabilityToken) {
        inFlightRef.current = null;
      }
    };
  }, [capabilityToken]);

  const navigateToReadyTask = (activeThreadId: string): void => {
    void navigate({
      to: CURRENT_TASK_ROUTE_PATH,
      params: { threadId: activeThreadId },
      replace: true,
    });
  };

  const navigateToCurrentTask = (activeThreadId: string): void => {
    void navigate({
      to: CURRENT_TASK_ROUTE_PATH,
      params: { threadId: activeThreadId },
    });
  };

  const handleContinue = async (): Promise<void> => {
    if (
      capability.activateThread == null ||
      inFlightRef.current?.capabilityToken === capabilityToken
    ) {
      return;
    }

    setState({ type: "idle" });
    const request: ContinueTaskRequest = { capabilityToken };
    inFlightRef.current = request;

    try {
      const switching = capability.activateThread(threadId);
      let settled = false;
      void switching.then(
        () => {
          settled = true;
        },
        () => {
          settled = true;
        },
      );
      queueMicrotask(() => {
        if (
          !settled &&
          mountedRef.current &&
          currentCapabilityTokenRef.current === capabilityToken &&
          inFlightRef.current === request
        ) {
          setState({ type: "pending", capabilityToken });
        }
      });

      const outcome = await switching;
      if (
        !mountedRef.current ||
        currentCapabilityTokenRef.current !== capabilityToken ||
        inFlightRef.current !== request
      ) {
        return;
      }
      inFlightRef.current = null;
      switch (outcome.type) {
        case "ready":
          for (const warning of outcome.warnings) {
            showActivationWarning(warning, warningMessages);
          }
          navigateToReadyTask(outcome.threadId);
          return;
        case "unavailable":
          setState({ type: "unavailable", capabilityToken, failure: outcome.failure });
          return;
        case "empty":
          setState({ type: "empty", capabilityToken });
          return;
      }

      outcome satisfies never;
    } catch (error: unknown) {
      if (
        mountedRef.current &&
        currentCapabilityTokenRef.current === capabilityToken &&
        inFlightRef.current === request
      ) {
        inFlightRef.current = null;
        setState({ type: "unexpectedFailure", capabilityToken, error });
      }
    }
  };

  return (
    <>
      {visibleState.type === "unavailable" ? (
        <ContinueTaskUnavailableAlert
          descriptionId={unavailableDescriptionId}
          failure={visibleState.failure}
          navigateToCurrentTask={navigateToCurrentTask}
        />
      ) : null}
      {visibleState.type === "unexpectedFailure" ? (
        <Alert role="alert" status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>
              <Trans>Unable to continue this task</Trans>
            </Alert.Title>
            <Alert.Description>
              <span className="block">
                <Trans>An unexpected error occurred while continuing the task.</Trans>
              </span>
              <span className="mt-1 block">
                <Trans>Diagnostic:</Trans> {errorText(visibleState.error)}
              </span>
            </Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}
      {visibleState.type === "empty" ? (
        <Alert role="alert" status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>
              <Trans>Unable to continue this task</Trans>
            </Alert.Title>
            <Alert.Description>
              <Trans>The task could not be activated.</Trans>
            </Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}
      <aside className="fixed inset-x-0 bottom-0 z-30 border-t border-separator bg-surface/95 px-4 py-4 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-2">
          <QrAccessPopover authorizationToken={authorizationToken} routeTarget={routeTarget} />
          <Button
            aria-describedby={
              visibleState.type === "unavailable" ? unavailableDescriptionId : undefined
            }
            className="flex-1"
            isDisabled={capability.activateThread == null}
            isPending={visibleState.type === "pending"}
            onPress={() => {
              void handleContinue();
            }}
            variant="primary"
          >
            <Trans>Continue this task</Trans>
          </Button>
        </div>
      </aside>
    </>
  );
}

type ActivationWarningMessages = Readonly<
  Record<
    ActiveThreadActivationWarning["type"],
    Readonly<{
      title: string;
      description: string;
    }>
  >
>;

function showActivationWarning(
  warning: ActiveThreadActivationWarning,
  messages: ActivationWarningMessages,
): void {
  switch (warning.type) {
    case "authorizationPersistenceFailed":
      toast.warning(messages.authorizationPersistenceFailed.title, {
        description: messages.authorizationPersistenceFailed.description,
      });
      return;
    case "previousOwnerCleanupFailed":
      toast.warning(messages.previousOwnerCleanupFailed.title, {
        description: messages.previousOwnerCleanupFailed.description,
      });
      return;
  }

  warning satisfies never;
}

function ContinueTaskUnavailableAlert({
  descriptionId,
  failure,
  navigateToCurrentTask,
}: Readonly<{
  descriptionId: string;
  failure: ActiveThreadActivationFailure;
  navigateToCurrentTask: (threadId: string) => void;
}>) {
  switch (failure.type) {
    case "switchInProgress":
      return (
        <Alert role="alert" status="warning">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>
              <Trans>Unable to switch tasks yet</Trans>
            </Alert.Title>
            <Alert.Description id={descriptionId}>
              <Trans>Another task switch is already in progress. Try again shortly.</Trans>
            </Alert.Description>
          </Alert.Content>
        </Alert>
      );
    case "currentThreadChanged": {
      const activeThreadId = failure.activeThreadId;
      return (
        <Alert role="alert" status="warning">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>
              <Trans>Unable to continue this task</Trans>
            </Alert.Title>
            <Alert.Description id={descriptionId}>
              <Trans>The task could not be activated.</Trans>
            </Alert.Description>
            {activeThreadId == null ? null : (
              <Button
                className="mt-3"
                onPress={() => {
                  navigateToCurrentTask(activeThreadId);
                }}
                variant="secondary"
              >
                <Trans>Return to current task</Trans>
              </Button>
            )}
          </Alert.Content>
        </Alert>
      );
    }
    case "currentThreadUnresolved": {
      const activeThreadId = failure.activeThreadId;
      return (
        <Alert role="alert" status="warning">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>
              <Trans>Unable to switch tasks yet</Trans>
            </Alert.Title>
            <Alert.Description id={descriptionId}>
              <Trans>
                The current task still has queued or unresolved messages. Return to it before
                switching.
              </Trans>
            </Alert.Description>
            <Button
              className="mt-3"
              onPress={() => {
                navigateToCurrentTask(activeThreadId);
              }}
              variant="secondary"
            >
              <Trans>Return to current task</Trans>
            </Button>
          </Alert.Content>
        </Alert>
      );
    }
    case "connectionLost":
      return (
        <Alert role="alert" status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>
              {failure.progress === "beforeCommit" ? (
                <Trans>Unable to continue this task</Trans>
              ) : (
                <Trans>Task switched, but cannot be opened</Trans>
              )}
            </Alert.Title>
            <Alert.Description id={descriptionId}>
              <span className="block">
                {failure.progress === "beforeCommit" ? (
                  <Trans>
                    The connection was interrupted before the task switch completed. Reconnect and
                    try again.
                  </Trans>
                ) : (
                  <Trans>
                    The task switch was committed, but the connection was interrupted. Reconnect and
                    confirm the current task.
                  </Trans>
                )}
              </span>
              {failure.cleanupError == null ? null : (
                <span className="mt-1 block">
                  <Trans>Cleanup diagnostic:</Trans> {errorText(failure.cleanupError)}
                </span>
              )}
            </Alert.Description>
          </Alert.Content>
        </Alert>
      );
    case "operationFailed":
      return (
        <Alert role="alert" status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>
              <Trans>Unable to continue this task</Trans>
            </Alert.Title>
            <Alert.Description id={descriptionId}>
              <span className="block">
                <OperationFailureSummary phase={failure.phase} />
              </span>
              <span className="mt-1 block">
                <Trans>Operation diagnostic:</Trans> {errorText(failure.error)}
              </span>
              {failure.cleanupError == null ? null : (
                <span className="mt-1 block">
                  <Trans>Cleanup diagnostic:</Trans> {errorText(failure.cleanupError)}
                </span>
              )}
            </Alert.Description>
          </Alert.Content>
        </Alert>
      );
  }

  failure satisfies never;
  return null;
}

function OperationFailureSummary({
  phase,
}: Readonly<{
  phase: Extract<ActiveThreadActivationFailure, { type: "operationFailed" }>["phase"];
}>) {
  switch (phase) {
    case "resume":
      return <Trans>The task could not be resumed.</Trans>;
    case "attach":
      return <Trans>The task connection could not be prepared.</Trans>;
    case "prepare":
      return <Trans>The task connection could not be prepared.</Trans>;
    case "activate":
      return <Trans>The task could not be activated.</Trans>;
  }

  phase satisfies never;
  return null;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
