import { Badge, Button, ButtonGroup, Dropdown, Label } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { Ellipsis } from "lucide-react";
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
import { useActiveThreadCollectionSnapshot, useAppCapabilities } from "./AppCapabilities";
import { activeThreadRemovalBlockerMessage } from "./activeThreadCollectionMessages";
import { activeThreadMemberHasError } from "./activeThreadCollectionPresentation";

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
      <ul className="flex min-w-0 flex-col gap-1 py-2">
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
  const title = runtime?.thread.name?.trim() ? runtime.thread.name : member.threadId;
  const hasError = activeThreadMemberHasError(member);
  const errorId = `active-task-error-${member.threadId}`;
  const blockerId = `active-task-removal-${member.threadId}`;
  const select = (): void => {
    close();
    void navigate({ to: CURRENT_TASK_ROUTE_PATH, params: { threadId: member.threadId } }).then(
      () => activeThreadSession?.setOperationError(member.threadId, "navigation", null),
      (error: unknown) => {
        activeThreadSession?.setOperationError(member.threadId, "navigation", error);
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
      }).then(
        () => activeThreadSession?.setOperationError(member.threadId, "navigation", null),
        (error: unknown) =>
          activeThreadSession?.setOperationError(member.threadId, "navigation", error),
      );
    }
  };
  const remove = async (): Promise<void> => {
    if (activeThreadSession == null) return;
    try {
      const outcome = await activeThreadSession.remove(member.threadId);
      if (outcome.type === "removed") {
        activeThreadSession.setOperationError(member.threadId, "remove", null);
        await removed(outcome);
      }
    } catch (error: unknown) {
      activeThreadSession.setOperationError(member.threadId, "remove", error);
    }
  };
  return (
    <li className="min-w-0 px-2 py-1" data-active-thread-id={member.threadId}>
      <Badge.Anchor className="w-full min-w-0">
        <ButtonGroup variant="ghost" className="w-full min-w-0" aria-label={title}>
          <Button
            className="min-w-0 flex-1 justify-start text-start"
            aria-current={viewed ? "true" : undefined}
            aria-describedby={hasError ? errorId : undefined}
            onPress={select}
          >
            <span className="min-w-0 truncate" title={title}>
              {title}
            </span>
          </Button>
          <Dropdown>
            <Button
              isIconOnly
              className="shrink-0"
              aria-label={t({
                message: `More options for ${title}`,
                comment:
                  "Accessible name of the active task row actions button; title is the task name or UUID",
              })}
            >
              <ButtonGroup.Separator />
              <Ellipsis aria-hidden="true" className="size-4" />
            </Button>
            <Dropdown.Popover placement="bottom end">
              <Dropdown.Menu
                aria-label={t({
                  message: "Task actions",
                  comment:
                    "Accessible label for the active task row dropdown containing Remove from list",
                })}
                disabledKeys={member.canRemove ? [] : ["remove"]}
                onAction={() => {
                  void remove();
                }}
              >
                <Dropdown.Item
                  id="remove"
                  textValue={t`Remove from list`}
                  aria-describedby={!member.canRemove ? blockerId : undefined}
                >
                  <Label>
                    <Trans comment="Remove only from the active GUI task list; history and draft are kept">
                      Remove from list
                    </Trans>
                  </Label>
                </Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown.Popover>
          </Dropdown>
        </ButtonGroup>
        {hasError ? (
          <Badge color="danger" size="sm" aria-hidden="true" data-task-error-indicator="true" />
        ) : null}
      </Badge.Anchor>
      {hasError ? (
        <span id={errorId} className="sr-only">
          <Trans>This task needs attention.</Trans>
        </span>
      ) : null}
      {!member.canRemove ? (
        <p id={blockerId} className="sr-only">
          {member.removalBlockers
            .map((blocker) => t(activeThreadRemovalBlockerMessage(blocker)))
            .join(" ")}
        </p>
      ) : null}
    </li>
  );
}
