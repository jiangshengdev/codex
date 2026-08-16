import { Alert, Button, Typography } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { THREAD_QUERY_KEY } from "@codex-gui-host-contract";
import { useAppCapabilities } from "@/features/appShell/AppCapabilities";
import type { ContinueThread } from "@/features/appShell/AppCapabilities";
import { ReadOnlyCommittedTranscriptSurface } from "@/features/committedTranscriptSurface/CommittedTranscriptSurface";
import type { GuiHostCommands } from "@/features/guiHost/guiHostClient";
import type { ThreadSwitchBlockedReason } from "@/features/projectionCoordination/threadSwitchCoordinator";
import type { Thread } from "@codex-protocol/v2";
import {
  initialThreadHistoryDetailState,
  ThreadHistoryDetailOwner,
  type ThreadHistoryDetailState,
} from "./threadHistoryDetailOwner";

type RetainedThreadHistoryDetailCapability = Readonly<{
  readThread: GuiHostCommands["readThread"];
}>;

export function ThreadHistoryDetailPage() {
  const { threadId } = useParams({ from: "/history/$threadId" });
  const { t } = useLingui();
  const { commands, continueThread, status } = useAppCapabilities();
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
    <main className="mx-auto grid min-h-0 w-full max-w-3xl flex-1 content-start gap-6 px-4 py-6">
      {retainedCapability == null ? (
        <ThreadHistoryDetailContent
          continueThread={continueThread}
          retry={null}
          state={unavailableState}
          threadId={threadId}
        />
      ) : (
        <ThreadHistoryDetailOwnerBound
          continueThread={continueThread}
          readThread={retainedCapability.readThread}
          threadId={threadId}
        />
      )}
    </main>
  );
}

type ThreadHistoryDetailOwnerBoundProps = Readonly<{
  continueThread: ContinueThread | null;
  readThread: GuiHostCommands["readThread"];
  threadId: string;
}>;

function ThreadHistoryDetailOwnerBound({
  continueThread,
  readThread,
  threadId,
}: ThreadHistoryDetailOwnerBoundProps) {
  const owner = useMemo(
    () => new ThreadHistoryDetailOwner({ threadId, readThread }),
    [readThread, threadId],
  );
  const state = useSyncExternalStore(owner.subscribe, owner.getSnapshot, owner.getSnapshot);

  useEffect(() => {
    owner.start();
    return () => {
      owner.dispose();
    };
  }, [owner]);

  return (
    <ThreadHistoryDetailContent
      continueThread={continueThread}
      retry={owner.retry}
      state={state}
      threadId={threadId}
    />
  );
}

type ThreadHistoryDetailContentProps = Readonly<{
  continueThread: ContinueThread | null;
  retry: (() => boolean | undefined) | null;
  state: ThreadHistoryDetailState;
  threadId: string;
}>;

function ThreadHistoryDetailContent({
  continueThread,
  retry,
  state,
  threadId,
}: ThreadHistoryDetailContentProps) {
  const { t } = useLingui();
  const navigate = useNavigate();
  const thread = state.type === "ready" ? state.thread : null;
  const title = thread == null ? t`History detail` : threadTitle(thread, t`Untitled task`);

  return (
    <>
      <header className="grid gap-3">
        <div>
          <Button
            onPress={() => {
              void navigate({ to: "/history", search: true });
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
          continueThread={continueThread}
          key={state.thread.id}
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
  | Readonly<{ type: "pending" }>
  | Readonly<{ type: "blocked"; reason: ThreadSwitchBlockedReason }>
  | Readonly<{ type: "failed"; error: unknown; cleanupError?: unknown }>;

function ContinueTaskAction({
  continueThread,
  threadId,
}: Readonly<{ continueThread: ContinueThread | null; threadId: string }>) {
  const navigate = useNavigate();
  const blockedDescriptionId = useId();
  const mountedRef = useRef(true);
  const inFlightRef = useRef<ReturnType<ContinueThread> | null>(null);
  const [state, setState] = useState<ContinueTaskState>({ type: "idle" });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      inFlightRef.current = null;
    };
  }, []);

  const navigateToCurrentTask = (activeThreadId: string): void => {
    void navigate({
      to: "/",
      replace: true,
      search: { [THREAD_QUERY_KEY]: activeThreadId },
    });
  };

  const handleContinue = async (): Promise<void> => {
    if (continueThread == null || inFlightRef.current != null) {
      return;
    }

    setState({ type: "idle" });
    const switching = continueThread(threadId);
    inFlightRef.current = switching;
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
      if (!settled && mountedRef.current && inFlightRef.current === switching) {
        setState({ type: "pending" });
      }
    });

    try {
      const outcome = await switching;
      if (!mountedRef.current || inFlightRef.current !== switching) {
        return;
      }
      inFlightRef.current = null;
      switch (outcome.type) {
        case "current":
        case "switched":
          navigateToCurrentTask(outcome.activeOwner.threadId);
          return;
        case "blocked":
          setState({ type: "blocked", reason: outcome.reason });
          return;
        case "failed":
          setState({
            type: "failed",
            error: outcome.error,
            cleanupError: outcome.cleanupFailure?.error ?? null,
          });
          return;
      }

      outcome satisfies never;
    } catch (error: unknown) {
      if (mountedRef.current && inFlightRef.current === switching) {
        inFlightRef.current = null;
        setState({ type: "failed", error });
      }
    }
  };

  return (
    <>
      {state.type === "blocked" ? (
        <Alert role="alert" status="warning">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>
              <Trans>Unable to switch tasks yet</Trans>
            </Alert.Title>
            <Alert.Description id={blockedDescriptionId}>
              <BlockedReason reason={state.reason} />
            </Alert.Description>
            <Button
              className="mt-3"
              onPress={() => {
                void navigate({ to: "/", search: true });
              }}
              variant="secondary"
            >
              <Trans>Return to current task</Trans>
            </Button>
          </Alert.Content>
        </Alert>
      ) : null}
      {state.type === "failed" ? (
        <Alert role="alert" status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>
              <Trans>Unable to continue this task</Trans>
            </Alert.Title>
            <Alert.Description>
              <span className="block">{errorText(state.error)}</span>
              {state.cleanupError == null ? null : (
                <span className="mt-1 block">{errorText(state.cleanupError)}</span>
              )}
            </Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}
      <aside className="fixed inset-x-0 bottom-0 z-30 border-t border-separator bg-surface/95 px-4 py-4 backdrop-blur">
        <div className="mx-auto w-full max-w-3xl">
          <Button
            aria-describedby={state.type === "blocked" ? blockedDescriptionId : undefined}
            className="w-full"
            isDisabled={continueThread == null}
            isPending={state.type === "pending"}
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

function BlockedReason({ reason }: Readonly<{ reason: ThreadSwitchBlockedReason }>) {
  switch (reason.type) {
    case "queueReleaseBlocked":
      return (
        <Trans>
          The current task still has queued or unresolved messages. Return to it before switching.
        </Trans>
      );
    case "busy":
      return <Trans>Another task switch is already in progress.</Trans>;
    case "disposed":
      return <Trans>The task connection is no longer available.</Trans>;
  }

  reason satisfies never;
  return null;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
