import { Alert, Button, Typography } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useNavigate } from "@tanstack/react-router";
import type { ActiveThreadSession } from "@/features/activeThreadSession/activeThreadSession";
import {
  HISTORY_LIST_ROUTE_PATH,
  type GuiRouteTarget,
} from "@/features/browserLaunch/guiRouteTarget";
import { ReadOnlyCommittedTranscriptSurface } from "@/features/committedTranscriptSurface/CommittedTranscriptSurface";
import { formatTaskDocumentTitle } from "@/features/documentTitle/documentTitle";
import { HistoryDetailDocumentTitleFactPublisher } from "@/features/documentTitle/DocumentTitleOwner";
import { ContinueTaskAction } from "./ContinueTaskAction";
import type { ThreadHistoryDetailState } from "./threadHistoryDetailOwner";
import { resolveThreadHistoryPresentation } from "./threadHistoryPresentation";

type ThreadHistoryDetailContentProps = Readonly<{
  activateThread: ActiveThreadSession["activate"] | null;
  authorizationToken: string | null;
  retry: (() => boolean | undefined) | null;
  routeTarget: GuiRouteTarget;
  state: ThreadHistoryDetailState;
  threadId: string;
}>;

export function ThreadHistoryDetailContent({
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
  const title =
    thread == null
      ? t`History detail`
      : resolveThreadHistoryPresentation(thread, t`Untitled task`).title;

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

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
