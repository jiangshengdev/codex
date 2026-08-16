import { Alert, Button, Card, Chip } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { useAppSelector } from "@/app/hooks";
import { useAppCapabilities } from "@/features/appShell/AppCapabilities";
import type { GuiHostCommands } from "@/features/guiHost/guiHostClient";
import { selectThreadRuntimeRecord } from "@/features/threadRuntime/threadRuntimeSlice";
import type { Thread } from "@codex-protocol/v2";
import {
  initialThreadHistoryListState,
  ThreadHistoryListOwner,
  type ThreadHistoryListState,
} from "./threadHistoryListOwner";

const noop = () => undefined;

export function ThreadHistoryListPage() {
  const { commands } = useAppCapabilities();
  const runtime = useAppSelector(selectThreadRuntimeRecord);
  const cwd = runtime?.thread.cwd ?? null;

  useEffect(() => {
    window.scrollTo({ left: 0, top: 0 });
  }, []);

  return (
    <main className="mx-auto grid min-h-0 w-full max-w-3xl flex-1 content-start gap-4 px-4 py-6">
      {commands != null && cwd != null ? (
        <ThreadHistoryListOwnerBound commands={commands} cwd={cwd} />
      ) : (
        <HistoryListContent loadMore={noop} retry={noop} state={initialThreadHistoryListState} />
      )}
    </main>
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
  const state = useSyncExternalStore(owner.subscribe, owner.getSnapshot, owner.getSnapshot);

  useEffect(() => {
    owner.start();
    return () => {
      owner.dispose();
    };
  }, [owner]);

  return <HistoryListContent loadMore={owner.loadMore} retry={owner.retry} state={state} />;
}

type HistoryListContentProps = {
  state: ThreadHistoryListState;
  loadMore: () => boolean | undefined;
  retry: () => boolean | undefined;
};

function HistoryListContent({ state, loadMore, retry }: HistoryListContentProps) {
  if (state.type === "initialLoading") {
    return renderHistoryMessage(<Trans>Loading history…</Trans>);
  }

  if (state.type === "initialError") {
    return <HistoryError error={state.error} retry={retry} />;
  }

  if (state.threads.length === 0) {
    return renderHistoryMessage(<Trans>No history for the current working directory.</Trans>);
  }

  return (
    <section className="grid gap-4">
      {state.threads.map((thread) => (
        <ThreadHistoryCard key={thread.id} thread={thread} />
      ))}
      {state.type === "appendError" ? <HistoryError error={state.error} retry={retry} /> : null}
      {state.type === "appendLoading" || (state.type === "ready" && state.nextCursor != null) ? (
        <Button
          className="justify-self-center"
          isPending={state.type === "appendLoading"}
          onPress={loadMore}
          variant="secondary"
        >
          <Trans>Load more</Trans>
        </Button>
      ) : null}
    </section>
  );
}

function ThreadHistoryCard({ thread }: { thread: Thread }) {
  const { i18n, t } = useLingui();
  const navigate = useNavigate();
  const name = thread.name?.trim() ?? "";
  const preview = thread.preview.trim();
  const title = name || preview || t`Untitled task`;
  const summary = name && preview ? preview : null;
  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(i18n.locale, { dateStyle: "medium", timeStyle: "short" }),
    [i18n.locale],
  );
  const activityTime = dateFormatter.format(
    new Date((thread.recencyAt ?? thread.updatedAt) * 1000),
  );

  return (
    <Card aria-labelledby={`thread-history-title-${thread.id}`} role="article" variant="default">
      <Card.Header>
        <Card.Title id={`thread-history-title-${thread.id}`}>{title}</Card.Title>
        {summary == null ? null : <Card.Description>{summary}</Card.Description>}
      </Card.Header>
      <Card.Content className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-muted">{activityTime}</span>
        <ThreadStatusChip status={thread.status} />
      </Card.Content>
      <Card.Footer className="justify-end">
        <Button
          variant="secondary"
          onPress={() => {
            void navigate({
              to: "/history/$threadId",
              params: { threadId: thread.id },
            });
          }}
        >
          <Trans>View</Trans>
        </Button>
      </Card.Footer>
    </Card>
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

function HistoryError({ error, retry }: { error: unknown; retry: () => boolean | undefined }) {
  return (
    <Alert role="alert" status="danger">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>
          <Trans>Unable to load history</Trans>
        </Alert.Title>
        <Alert.Description>
          {error instanceof Error ? error.message : String(error)}
        </Alert.Description>
        <Button className="mt-3" onPress={retry} variant="tertiary">
          <Trans>Retry</Trans>
        </Button>
      </Alert.Content>
    </Alert>
  );
}
