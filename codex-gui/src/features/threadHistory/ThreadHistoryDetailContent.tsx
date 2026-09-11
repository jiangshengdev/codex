import { Alert, Typography } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { FailureDiagnosticModal } from "@/feedback/FailureDiagnosticModal";
import { FailureLayout } from "@/feedback/FailureLayout";
import { RetryActionButton } from "@/feedback/RetryActionButton";
import type { ActiveThreadSession } from "@/features/activeThreadSession/activeThreadSession";
import type { GuiRouteTarget } from "@/features/browserLaunch/guiRouteTarget";
import type { TurnPositionRequest } from "@/features/browserLaunch/useTurnPositionRequest";
import { ReadOnlyCommittedTranscriptSurface } from "@/features/committedTranscriptSurface/CommittedTranscriptSurface";
import { HistoryDetailDocumentTitleFactPublisher } from "@/features/documentTitle/DocumentTitleOwner";
import { errorText } from "@/text/errorText";
import { ContinueTaskAction } from "./ContinueTaskAction";
import type { ThreadHistoryDetailState } from "./threadHistoryDetailOwner";
import { resolveThreadHistoryPresentation } from "./threadHistoryPresentation";
import { ThreadForkSourceContext } from "@/features/threadFork/ThreadForkContext";

type ThreadHistoryDetailContentProps = Readonly<{
  turnPosition?: TurnPositionRequest | null;
  activateThread: ActiveThreadSession["activate"] | null;
  authorizationToken: string | null;
  retry: (() => boolean | undefined) | null;
  routeTarget: GuiRouteTarget;
  state: ThreadHistoryDetailState;
  threadId: string;
}>;

export function ThreadHistoryDetailContent({
  turnPosition = null,
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
        <Typography className="pt-3" color="muted" role="status" type="body-sm">
          <Trans>Loading task history…</Trans>
        </Typography>
      ) : null}
      {state.type === "error" || state.type === "retrying" ? (
        <div className="pt-3">
          <HistoryDetailError
            error={state.error}
            retry={retry}
            isPending={state.type === "retrying"}
          />
        </div>
      ) : null}
      {state.type === "ready" && state.thread.turns.length === 0 ? (
        <Typography className="pt-3" color="muted" type="body-sm">
          <Trans>This task has no messages.</Trans>
        </Typography>
      ) : null}
      {state.type === "ready" && (state.thread.turns.length > 0 || turnPosition != null) ? (
        <div className="pt-3">
          <ThreadForkSourceContext value={state.thread.id}>
            <ReadOnlyCommittedTranscriptSurface
              surfaceKey={state.thread.id}
              transcriptState={state.transcriptState}
              turnPosition={turnPosition}
            />
          </ThreadForkSourceContext>
        </div>
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
  isPending,
}: Readonly<{ error: unknown; retry: (() => unknown) | null; isPending: boolean }>) {
  return (
    <Alert role="alert" status="danger">
      <Alert.Indicator />
      <FailureLayout
        actions={
          retry == null ? null : (
            <RetryActionButton
              onPress={retry}
              variant="tertiary"
              isPending={isPending}
              pendingChildren={<Trans>Loading task history…</Trans>}
            >
              <Trans comment="Button to read the selected task's historical messages">
                Load task history
              </Trans>
            </RetryActionButton>
          )
        }
      >
        <Alert.Content>
          <Alert.Title>
            <Trans>Unable to load task history</Trans>
          </Alert.Title>
          <FailureDiagnosticModal triggerClassName="mt-2 self-start">
            {errorText(error)}
          </FailureDiagnosticModal>
        </Alert.Content>
      </FailureLayout>
    </Alert>
  );
}
