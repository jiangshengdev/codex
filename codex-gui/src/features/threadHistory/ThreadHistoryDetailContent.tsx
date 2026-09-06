import { Alert, Button, Typography } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { ActiveThreadSession } from "@/features/activeThreadSession/activeThreadSession";
import type { GuiRouteTarget } from "@/features/browserLaunch/guiRouteTarget";
import { ReadOnlyCommittedTranscriptSurface } from "@/features/committedTranscriptSurface/CommittedTranscriptSurface";
import { HistoryDetailDocumentTitleFactPublisher } from "@/features/documentTitle/DocumentTitleOwner";
import { errorText } from "@/text/errorText";
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
  const thread = state.type === "ready" ? state.thread : null;
  const title =
    thread == null
      ? t`History detail`
      : resolveThreadHistoryPresentation(thread, t`Untitled task`).title;

  return (
    <>
      {state.type === "ready" ? (
        <HistoryDetailDocumentTitleFactPublisher threadId={state.thread.id} title={title} />
      ) : null}
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
