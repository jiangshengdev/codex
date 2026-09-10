import { Alert, Button, Surface } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { FailureDiagnosticModal } from "@/feedback/FailureDiagnosticModal";
import { FailureLayout } from "@/feedback/FailureLayout";
import { RetryActionButton } from "@/feedback/RetryActionButton";
import {
  useAppCapabilities,
  useNewSessionCwd,
  useNewSessionSnapshot,
} from "@/features/appShell/AppCapabilities";
import { CURRENT_TASK_ROUTE_PATH } from "@/features/browserLaunch/guiRouteTarget";
import {
  ComposerEditor,
  type ComposerEditorController,
} from "@/features/composerEditor/ComposerEditor";
import type { ComposerDraftCapture } from "@/features/composerEditor/composerEditorContracts";
import { ComposerSkillMenuLayer } from "@/features/composerTurnControl/ComposerSkillMenuLayer";
import type { GuiHostCommands } from "@/features/guiHost/guiHostClient";
import { SkillCatalogOwner } from "@/features/skillCatalog/skillCatalogOwner";
import { useStrictModeSafeOwner } from "@/features/threadHistory/useStrictModeSafeOwner";
import { errorText } from "@/text/errorText";
import type { NewSessionSnapshot } from "./newSessionOwner";
import { NewSessionWorkingDirectory } from "./NewSessionWorkingDirectory";

export function NewSessionPage() {
  const { newSessionOwner, commands } = useAppCapabilities();
  const snapshot = useNewSessionSnapshot();
  const cwd = useNewSessionCwd();

  useEffect(() => {
    newSessionOwner.open(cwd);
  }, [cwd, newSessionOwner]);

  return (
    <main className="app-shell-content-boundary flex min-h-0 flex-1 flex-col justify-end gap-4 py-3">
      {snapshot == null ? (
        <p className="text-muted">
          <Trans>A working directory is required to start a session.</Trans>
        </p>
      ) : (
        <Surface className="flex min-w-0 flex-col gap-1 rounded-3xl p-1" variant="secondary">
          <NewSessionWorkingDirectory cwd={snapshot.cwd} />
          {commands == null ? (
            <p className="px-4 pb-3 text-muted">
              <Trans>Connect to Codex to send this draft.</Trans>
            </p>
          ) : (
            <NewSessionEditor commands={commands} snapshot={snapshot} />
          )}
        </Surface>
      )}
    </main>
  );
}

function NewSessionEditor({
  commands,
  snapshot,
}: Readonly<{
  commands: GuiHostCommands;
  snapshot: NonNullable<NewSessionSnapshot>;
}>) {
  const { t } = useLingui();
  const navigate = useNavigate();
  const { newSessionOwner, activeThreadSession } = useAppCapabilities();
  const controller = useRef<ComposerEditorController | null>(null);
  const [skillMenuParent, setSkillMenuParent] = useState<HTMLElement | null>(null);
  const catalogOwner = useMemo(
    () => new SkillCatalogOwner({ cwd: snapshot.cwd, listSkills: commands.listSkills }),
    [commands, snapshot.cwd],
  );
  const skillCatalog = useStrictModeSafeOwner(catalogOwner);
  const pending = snapshot.phase === "creating" || snapshot.phase === "activating";
  const unknownHandoff = snapshot.phase === "handoffUnknown";
  const submit = async (capture?: ComposerDraftCapture): Promise<void> => {
    const result = await newSessionOwner.submit(capture);
    if (result.type !== "accepted") return;
    try {
      await navigate({ to: CURRENT_TASK_ROUTE_PATH, params: { threadId: result.threadId } });
    } catch (error: unknown) {
      activeThreadSession?.setOperationError(result.threadId, "navigation", error);
    }
  };

  return (
    <>
      {snapshot.failure == null ? null : (
        <Alert role="alert" status="danger">
          <Alert.Indicator />
          <FailureLayout>
            <Alert.Content>
              <Alert.Title>
                <Trans>Unable to start the conversation</Trans>
              </Alert.Title>
              <Alert.Description>
                {unknownHandoff ? (
                  <Trans comment="Input may already belong to the existing task queue; do not offer another send">
                    Input handoff could not be confirmed. Open the session to review its queue
                    before continuing.
                  </Trans>
                ) : snapshot.failure.stage === "create" &&
                  snapshot.failure.delivery === "deliveryUnknown" ? (
                  <Trans comment="thread/start may have succeeded without returning an ID; an explicit retry can create another empty session">
                    The creation result is unknown. Retrying may leave an extra empty session.
                  </Trans>
                ) : (
                  <Trans>Your input is retained. Retry to continue.</Trans>
                )}
              </Alert.Description>
              <FailureDiagnosticModal triggerClassName="mt-2 self-start">
                {errorText(snapshot.failure.error)}
              </FailureDiagnosticModal>
              {unknownHandoff && snapshot.threadId != null ? (
                <Button
                  className="mt-2 self-start"
                  variant="secondary"
                  onPress={() => {
                    const threadId = snapshot.threadId;
                    if (threadId == null) return;
                    void navigate({ to: CURRENT_TASK_ROUTE_PATH, params: { threadId } }).catch(
                      (error: unknown) =>
                        activeThreadSession?.setOperationError(threadId, "navigation", error),
                    );
                  }}
                >
                  <Trans>Open session</Trans>
                </Button>
              ) : null}
            </Alert.Content>
          </FailureLayout>
        </Alert>
      )}
      <Surface className="relative min-w-0 rounded-2xl border border-separator p-2">
        <ComposerSkillMenuLayer onPortalParentChange={setSkillMenuParent} />
        <ComposerEditor
          ariaLabel={t`Message Codex`}
          controllerRef={controller}
          disabled={snapshot.isInputLocked}
          guardCompositionEndEnter={
            navigator.vendor === "Apple Computer, Inc." &&
            navigator.platform === "MacIntel" &&
            navigator.maxTouchPoints <= 1
          }
          initialDraft={snapshot.draft}
          onDraftChange={(draft) => {
            newSessionOwner.saveDraft(draft);
          }}
          onRetrySkillCatalog={() => {
            catalogOwner.retry();
          }}
          onSubmit={(capture) => {
            void submit(capture);
          }}
          placeholder={t`Message Codex`}
          skillCatalog={skillCatalog}
          skillMenuParent={skillMenuParent}
        />
        <div className="flex justify-end">
          <RetryActionButton
            variant="primary"
            isDisabled={pending || unknownHandoff}
            isPending={pending}
            pendingChildren={
              <Trans comment="Pending state of Send while creating a session and handing off its first message">
                Sending
              </Trans>
            }
            onPress={() => {
              void submit(snapshot.isInputLocked ? undefined : controller.current?.capture());
            }}
          >
            <Trans>Send</Trans>
          </RetryActionButton>
        </div>
      </Surface>
    </>
  );
}
