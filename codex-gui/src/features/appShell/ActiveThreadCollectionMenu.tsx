import { Button } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { useAppSelector } from "@/app/hooks";
import type {
  ActiveThreadCollectionMember,
  ActiveThreadRemovalOutcome,
} from "@/features/activeThreadSession/activeThreadSessionCollectionContracts";
import {
  CURRENT_TASK_ROUTE_PATH,
  HISTORY_DETAIL_ROUTE_PATH,
  selectGuiRouteTarget,
} from "@/features/browserLaunch/guiRouteTarget";
import { selectThreadRuntimeRecord } from "@/features/threadRuntime/threadRuntimeSlice";
import { errorText } from "@/text/errorText";
import { useActiveThreadCollectionSnapshot, useAppCapabilities } from "./AppCapabilities";
import {
  activeThreadMemberStatus,
  activeThreadRemovalBlockerMessage,
} from "./activeThreadCollectionMessages";

export function ActiveThreadCollectionMenu({ close }: Readonly<{ close(): void }>) {
  const collection = useActiveThreadCollectionSnapshot();
  return (
    <section
      className="mt-4 min-w-0 border-t border-separator pt-3"
      aria-labelledby="active-tasks-heading"
    >
      <h2 className="mb-2 px-2 text-sm font-semibold" id="active-tasks-heading">
        <Trans comment="Tasks kept open in this GUI, including idle tasks; not only running turns">
          Active tasks
        </Trans>
      </h2>
      <p className="px-2 text-xs text-muted">
        <Trans>Removing a task from this list keeps its history and draft.</Trans>
      </p>
      {collection.error != null ? (
        <p className="px-2 text-sm text-danger">
          <Trans>Unable to save the active task list. Retry the task operation.</Trans>{" "}
          {errorText(collection.error)}
        </p>
      ) : null}
      <ul className="flex min-w-0 flex-col gap-3 py-2">
        {collection.members.map((member) => (
          <ActiveThreadCollectionRow
            key={member.threadId}
            member={member}
            viewed={collection.viewedThreadId === member.threadId}
            close={close}
          />
        ))}
      </ul>
    </section>
  );
}

function ActiveThreadCollectionRow({
  member,
  viewed,
  close,
}: Readonly<{ member: ActiveThreadCollectionMember; viewed: boolean; close(): void }>) {
  const { t } = useLingui();
  const navigate = useNavigate();
  const router = useRouter();
  const { activeThreadSession } = useAppCapabilities();
  const runtime = useAppSelector((state) => selectThreadRuntimeRecord(state, member.threadId));
  const [operationError, setOperationError] = useState<string | null>(null);
  const title =
    [runtime?.thread.name, runtime?.thread.preview].find(
      (candidate) => candidate != null && candidate.length > 0,
    ) ?? member.threadId;
  const status = t(activeThreadMemberStatus(member));
  const blockerId = `active-task-removal-${member.threadId}`;
  const select = (): void => {
    close();
    void navigate({ to: CURRENT_TASK_ROUTE_PATH, params: { threadId: member.threadId } }).catch(
      (error: unknown) => {
        setOperationError(errorText(error));
      },
    );
  };
  const removed = async (
    outcome: Extract<ActiveThreadRemovalOutcome, { type: "removed" }>,
  ): Promise<void> => {
    const target = selectGuiRouteTarget(router.state.matches);
    if (
      outcome.wasViewed &&
      target?.type === "currentTask" &&
      target.threadId === outcome.threadId
    ) {
      close();
      await navigate({
        to: HISTORY_DETAIL_ROUTE_PATH,
        params: { threadId: outcome.threadId },
        replace: true,
      });
    }
  };
  const retry = async (): Promise<void> => {
    if (activeThreadSession == null) return;
    setOperationError(null);
    try {
      const outcome = await activeThreadSession.retry(member.threadId);
      if (outcome.type === "removed") await removed(outcome);
      else if (outcome.type === "unavailable")
        setOperationError(t`Unable to retry this task. Review its current state and try again.`);
    } catch (error: unknown) {
      setOperationError(errorText(error));
    }
  };
  const remove = async (): Promise<void> => {
    if (activeThreadSession == null) return;
    setOperationError(null);
    try {
      const outcome = await activeThreadSession.remove(member.threadId);
      if (outcome.type === "removed") {
        await removed(outcome);
      } else if (outcome.type === "failed") {
        setOperationError(t`Unable to remove this task. Retry when its state is ready.`);
      } else if (outcome.type === "blocked") {
        setOperationError(
          outcome.blockers
            .map((blocker) => t(activeThreadRemovalBlockerMessage(blocker)))
            .join(" "),
        );
      } else {
        setOperationError(t`This task is no longer available.`);
      }
    } catch (error: unknown) {
      setOperationError(errorText(error));
    }
  };
  return (
    <li
      className="min-w-0 rounded-xl border border-separator p-2"
      data-active-thread-id={member.threadId}
    >
      <Button
        variant="ghost"
        fullWidth
        className="h-auto min-h-9 min-w-0 justify-start whitespace-normal text-start"
        aria-current={viewed ? "true" : undefined}
        onPress={select}
      >
        <span className="flex min-w-0 flex-col items-start">
          <span className="max-w-full wrap-anywhere">{title}</span>
          <span className="text-xs text-muted">{status}</span>
          {viewed ? (
            <span className="text-xs">
              <Trans comment="Marks the task selected for viewing in the active task list">
                Currently viewed
              </Trans>
            </span>
          ) : null}
        </span>
      </Button>
      {member.error != null ? (
        <p className="text-sm wrap-anywhere text-danger">{errorText(member.error)}</p>
      ) : null}
      {operationError != null ? <p className="text-sm text-danger">{operationError}</p> : null}
      <div className="mt-2 flex flex-wrap gap-2">
        {member.phase === "failed" ||
        (member.phase === "cleanupPending" && !member.canRemove) ||
        (member.phase === "ready" && member.removalBlockers.includes("statusUnknown")) ? (
          <Button
            variant="secondary"
            onPress={() => {
              void retry();
            }}
          >
            <Trans>Retry</Trans>
          </Button>
        ) : null}
        <Button
          variant="secondary"
          isDisabled={!member.canRemove}
          aria-describedby={!member.canRemove ? blockerId : undefined}
          onPress={() => {
            void remove();
          }}
        >
          <Trans comment="Remove only from the active GUI task list; history and draft are kept">
            Remove from list
          </Trans>
        </Button>
      </div>
      {!member.canRemove ? (
        <p id={blockerId} className="mt-1 text-xs text-muted">
          {member.removalBlockers
            .map((blocker) => t(activeThreadRemovalBlockerMessage(blocker)))
            .join(" ")}
        </p>
      ) : null}
    </li>
  );
}
