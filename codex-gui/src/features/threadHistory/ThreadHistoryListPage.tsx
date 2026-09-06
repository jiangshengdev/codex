import { Alert, Button, Card, Chip } from "@heroui/react";
import { cardVariants } from "@heroui/styles";
import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { useAppSelector } from "@/app/hooks";
import {
  useActiveThreadId,
  useActiveThreadSessionPhase,
  useAppCapabilities,
} from "@/features/appShell/AppCapabilities";
import { HISTORY_DETAIL_ROUTE_PATH } from "@/features/browserLaunch/guiRouteTarget";
import type { GuiHostCommands } from "@/features/guiHost/guiHostClient";
import { selectThreadRuntimeRecord } from "@/features/threadRuntime/threadRuntimeSlice";
import { errorText } from "@/text/errorText";
import type { Thread } from "@codex-protocol/v2";
import {
  formatThreadHistoryDateLabel,
  getThreadHistoryActivityDate,
  groupThreadHistoryByDate,
} from "./threadHistoryDateGroups";
import { ThreadHistoryListOwner, type ThreadHistoryListState } from "./threadHistoryListOwner";
import { resolveThreadHistoryPresentation } from "./threadHistoryPresentation";
import { useStrictModeSafeOwner } from "./useStrictModeSafeOwner";

export function ThreadHistoryListPage() {
  const { activeThreadSession, activeThreadStartupError, commands, status } = useAppCapabilities();
  const activeThreadId = useActiveThreadId();
  const activeThreadSessionPhase = useActiveThreadSessionPhase();
  const runtime = useAppSelector(selectThreadRuntimeRecord);
  const cwd =
    activeThreadId != null && runtime?.thread.id === activeThreadId ? runtime.thread.cwd : null;
  const historyContextUnavailable =
    activeThreadSession != null &&
    commands != null &&
    status.label !== "error" &&
    status.label !== "closed" &&
    activeThreadSessionPhase === "empty" &&
    activeThreadId == null;
  const startupActivationFailed =
    activeThreadSession != null &&
    activeThreadSessionPhase === "empty" &&
    activeThreadStartupError != null;

  useEffect(() => {
    window.scrollTo({ left: 0, top: 0 });
  }, []);

  return (
    <main className="app-shell-content-boundary grid min-h-0 flex-1 content-start gap-4 py-3">
      {startupActivationFailed ? (
        <HistoryError error={activeThreadStartupError} />
      ) : activeThreadSession == null && status.label !== "error" && status.label !== "closed" ? (
        renderHistoryMessage(<Trans>Loading history…</Trans>)
      ) : historyContextUnavailable ? (
        <HistoryContextUnavailable />
      ) : commands != null && cwd != null ? (
        <ThreadHistoryListOwnerBound commands={commands} cwd={cwd} />
      ) : (
        <HistoryError />
      )}
    </main>
  );
}

function HistoryContextUnavailable() {
  return (
    <Alert role="alert" status="danger">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>
          <Trans>History context unavailable</Trans>
        </Alert.Title>
        <Alert.Description>
          <Trans>Open an active task in this browser tab before viewing its history.</Trans>
        </Alert.Description>
      </Alert.Content>
    </Alert>
  );
}

type ThreadHistoryListOwnerBoundProps = {
  commands: GuiHostCommands;
  cwd: string;
};

function ThreadHistoryListOwnerBound({ commands, cwd }: ThreadHistoryListOwnerBoundProps) {
  const owner = useMemo(
    () => new ThreadHistoryListOwner({ cwd, listThreads: commands.listThreads }),
    [commands.listThreads, cwd],
  );
  const state = useStrictModeSafeOwner(owner);

  return <HistoryListContent loadMore={owner.loadMore} retry={owner.retry} state={state} />;
}

type HistoryListContentProps = {
  state: ThreadHistoryListState;
  loadMore: () => boolean | undefined;
  retry: () => boolean | undefined;
};

// Read the wall clock again on render without scheduling background date updates.
const subscribeToHistoryDay = () => () => undefined;
const getHistoryDaySnapshot = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
};

function HistoryListContent({ state, loadMore, retry }: HistoryListContentProps) {
  const { i18n, t } = useLingui();
  const now = new Date(useSyncExternalStore(subscribeToHistoryDay, getHistoryDaySnapshot));
  if (state.type === "initialLoading") {
    return renderHistoryMessage(<Trans>Loading history…</Trans>);
  }

  if (state.type === "initialError") {
    return <HistoryError error={state.error} retry={retry} />;
  }

  if (state.threads.length === 0) {
    return renderHistoryMessage(<Trans>No history for the current working directory.</Trans>);
  }

  const labels = {
    today: t({
      message: "Today",
      comment: "History date group: tasks last active on the current local day",
    }),
    yesterday: t({
      message: "Yesterday",
      comment: "History date group: tasks last active on the previous local day",
    }),
  };

  return (
    <div className="grid min-w-0 gap-6">
      {groupThreadHistoryByDate(state.threads).map((group) => (
        <section
          key={group.key}
          aria-labelledby={`thread-history-date-${group.key}`}
          className="grid min-w-0 gap-3"
        >
          <h2 id={`thread-history-date-${group.key}`} className="text-sm font-medium text-muted">
            {formatThreadHistoryDateLabel(group.date, now, i18n.locale, labels)}
          </h2>
          <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {group.threads.map((thread) => (
              <ThreadHistoryCard key={thread.id} thread={thread} />
            ))}
          </div>
        </section>
      ))}
      {state.type === "appendError" ? (
        <div className="col-span-full">
          <HistoryError error={state.error} retry={retry} />
        </div>
      ) : null}
      {state.type === "appendLoading" || (state.type === "ready" && state.nextCursor != null) ? (
        <Button
          className="col-span-full justify-self-center"
          isPending={state.type === "appendLoading"}
          onPress={loadMore}
          variant="secondary"
        >
          <Trans>Load more</Trans>
        </Button>
      ) : null}
    </div>
  );
}

function ThreadHistoryCard({ thread }: { thread: Thread }) {
  const { i18n, t } = useLingui();
  const { title, summary } = resolveThreadHistoryPresentation(thread, t`Untitled task`);
  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(i18n.locale, { timeStyle: "short" }),
    [i18n.locale],
  );
  const activityDate = getThreadHistoryActivityDate(thread);
  const activityTime = dateFormatter.format(activityDate);
  const slots = cardVariants({ variant: "default" });

  return (
    <article aria-labelledby={`thread-history-title-${thread.id}`} className="h-full min-w-0">
      <Link
        to={HISTORY_DETAIL_ROUTE_PATH}
        params={{ threadId: thread.id }}
        tabIndex={0}
        aria-labelledby={`thread-history-title-${thread.id}`}
        className={slots.base({
          className:
            "h-full min-w-0 gap-3 text-foreground no-underline transition-colors hover:bg-surface-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
        })}
      >
        <Card.Header className={slots.header({ className: "min-w-0 gap-1" })}>
          <Card.Title
            className={slots.title({ className: "line-clamp-2 min-w-0 [overflow-wrap:anywhere]" })}
            id={`thread-history-title-${thread.id}`}
          >
            {title}
          </Card.Title>
          {summary == null ? null : (
            <Card.Description
              className={slots.description({
                className: "line-clamp-2 min-w-0 [overflow-wrap:anywhere]",
              })}
            >
              {summary}
            </Card.Description>
          )}
        </Card.Header>
        <Card.Footer className={slots.footer({ className: "mt-auto min-w-0 flex-wrap gap-2" })}>
          <time className="text-sm text-muted" dateTime={activityDate.toISOString()}>
            {activityTime}
          </time>
          <ThreadStatusChip status={thread.status} />
          <span className="ms-auto text-sm text-muted">
            <Trans>View</Trans>
          </span>
        </Card.Footer>
      </Link>
    </article>
  );
}

function ThreadStatusChip({ status }: { status: Thread["status"] }) {
  const labelByStatus = {
    notLoaded: <Trans>Not loaded</Trans>,
    idle: <Trans>Idle</Trans>,
    active: <Trans>Active</Trans>,
    systemError: <Trans>System error</Trans>,
  } satisfies Record<Thread["status"]["type"], ReactNode>;

  return (
    <Chip color={status.type === "systemError" ? "danger" : "default"} size="sm" variant="soft">
      {labelByStatus[status.type]}
    </Chip>
  );
}

const renderHistoryMessage = (message: ReactNode) => (
  <p className="text-sm text-muted">{message}</p>
);

type HistoryErrorProps =
  | { error: unknown; retry?: () => boolean | undefined }
  | { error?: never; retry?: never };

function HistoryError(props: HistoryErrorProps) {
  return (
    <Alert role="alert" status="danger">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>
          <Trans>Unable to load history</Trans>
        </Alert.Title>
        {"error" in props ? <Alert.Description>{errorText(props.error)}</Alert.Description> : null}
        {props.retry == null ? null : (
          <Button className="mt-3" onPress={props.retry} variant="tertiary">
            <Trans>Retry</Trans>
          </Button>
        )}
      </Alert.Content>
    </Alert>
  );
}
