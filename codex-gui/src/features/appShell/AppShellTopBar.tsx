import { Badge, Button, Drawer } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useNavigate } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { use, useState } from "react";
import { ComposerFocusContext } from "@/features/composerEditor/composerFocusContext";
import { useAppSelector } from "@/app/hooks";
import {
  CURRENT_TASK_ROUTE_PATH,
  HISTORY_LIST_ROUTE_PATH,
  NEW_TASK_ROUTE_PATH,
} from "@/features/browserLaunch/guiRouteTarget";
import { selectThreadRuntimeRecord } from "@/features/threadRuntime/threadRuntimeSlice";
import { useHistoryDetailTitle } from "@/features/documentTitle/historyDetailTitleContext";
import {
  useActiveThreadCollectionSnapshot,
  useActiveThreadId,
  useAppCapabilities,
  useNewSessionCwd,
  useNewSessionSnapshot,
} from "./AppCapabilities";
import { ActiveThreadCollectionMenu } from "./ActiveThreadCollectionMenu";
import { activeThreadMemberHasError } from "./activeThreadCollectionPresentation";
import { TopBarNavigationItem } from "./TopBarNavigationItem";
import { appShortcut, useAppShortcuts } from "./appShortcuts";
import { ShortcutHelp } from "./ShortcutHelp";
import { useActiveTaskNavigation } from "./useActiveTaskNavigation";

export function AppShellTopBar() {
  const { t } = useLingui();
  const navigate = useNavigate();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const composerFocus = use(ComposerFocusContext);
  const taskNavigation = useActiveTaskNavigation(() => {
    setIsDrawerOpen(false);
  });
  const { routeTarget, status, newSessionOwner, connectionRecovery } = useAppCapabilities();
  const newSession = useNewSessionSnapshot();
  const newSessionCwd = useNewSessionCwd();
  const canOpenNewSession = newSession != null || newSessionCwd != null;
  const activeThreadId = useActiveThreadId();
  const collection = useActiveThreadCollectionSnapshot();
  const runtime = useAppSelector((state) =>
    routeTarget.type === "currentTask"
      ? selectThreadRuntimeRecord(state, routeTarget.threadId)
      : null,
  );
  const hasError =
    status.label === "error" ||
    status.label === "closed" ||
    connectionRecovery != null ||
    collection.errors.length > 0 ||
    collection.members.some(activeThreadMemberHasError);
  const isCurrentTask = routeTarget.type === "currentTask";
  const isHistoryDetail = routeTarget.type === "historyDetail";
  const isNewTask = routeTarget.type === "newTask";
  const isHistory = routeTarget.type === "historyList" || isHistoryDetail;
  const historyDetailTitle = useHistoryDetailTitle();
  const currentTaskTitle =
    isCurrentTask && runtime?.threadId === routeTarget.threadId
      ? [runtime.thread.name, runtime.thread.preview].find(
          (candidate) => candidate != null && candidate.length > 0,
        )
      : undefined;
  const title = isCurrentTask
    ? (currentTaskTitle ?? t`Current task`)
    : isHistoryDetail
      ? (historyDetailTitle ?? t`History detail`)
      : isNewTask
        ? t`New session`
        : t`History`;

  const navigateToCurrentTask = (): void => {
    if (activeThreadId == null) {
      return;
    }
    setIsDrawerOpen(false);
    void navigate({
      to: CURRENT_TASK_ROUTE_PATH,
      params: { threadId: activeThreadId },
    });
  };

  const navigateToHistory = (): void => {
    setIsDrawerOpen(false);
    void navigate({ to: HISTORY_LIST_ROUTE_PATH });
  };

  const navigateToNewSession = (): void => {
    if (!newSessionOwner.open(newSessionCwd)) return;
    setIsDrawerOpen(false);
    void navigate({ to: NEW_TASK_ROUTE_PATH });
  };

  useAppShortcuts({
    previousTask: () => taskNavigation.cycle(-1),
    nextTask: () => taskNavigation.cycle(1),
    newSession: () => {
      if (!canOpenNewSession) return false;
      navigateToNewSession();
      return true;
    },
    menu: () => {
      setIsDrawerOpen((open) => !open);
      return true;
    },
    focus: () => {
      const focus = composerFocus?.current;
      if (focus == null) return false;
      setIsDrawerOpen(false);
      requestAnimationFrame(() => {
        if (composerFocus?.current === focus) focus();
      });
      return true;
    },
  });

  return (
    <header className="fixed inset-x-0 top-0 z-30 h-14 border-b border-separator bg-surface text-foreground">
      <div className="app-shell-content-boundary flex h-full items-center gap-2 sm:gap-3">
        <Badge.Anchor className="shrink-0">
          <Button
            render={(props) => <button {...props} aria-keyshortcuts={appShortcut("menu")?.aria} />}
            className="shrink-0"
            aria-describedby={hasError ? "active-tasks-error" : undefined}
            variant="secondary"
            onPress={() => {
              setIsDrawerOpen(true);
            }}
          >
            <Menu aria-hidden="true" className="size-5" />
            <span title={appShortcut("menu")?.visible}>
              <Trans>Menu</Trans>
            </span>
          </Button>
          {hasError ? (
            <Badge color="danger" size="sm" aria-hidden="true" data-menu-error-indicator="true" />
          ) : null}
        </Badge.Anchor>
        {hasError ? (
          <span className="sr-only" id="active-tasks-error">
            <Trans comment="Accessible description of the navigation menu error dot; task or global errors remain unresolved">
              Tasks or the connection need attention.
            </Trans>
          </span>
        ) : null}
        <h1 className="min-w-0 flex-1 truncate text-base font-semibold" title={title}>
          {title}
        </h1>
      </div>

      <Drawer.Backdrop isOpen={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
        <Drawer.Content placement="left">
          <Drawer.Dialog>
            {/* An initial child focus avoids the dialog's delayed refocus racing nested menus. */}
            <Drawer.CloseTrigger autoFocus />
            <Drawer.Header>
              <Drawer.Heading>
                <Trans>Navigation</Trans>
              </Drawer.Heading>
            </Drawer.Header>
            <Drawer.Body className="-mx-1 -my-px min-h-0 overflow-y-auto p-1">
              <nav aria-label={t`Main navigation`} className="flex flex-col gap-1">
                <TopBarNavigationItem
                  id="new-session-navigation"
                  shortcut={appShortcut("newSession")}
                  isCurrent={isNewTask}
                  isDisabled={!canOpenNewSession}
                  onPress={navigateToNewSession}
                  label={<Trans>New session</Trans>}
                  description={
                    canOpenNewSession ? (
                      <Trans>Start a conversation</Trans>
                    ) : (
                      <Trans>A working directory is required to start a session.</Trans>
                    )
                  }
                />
                <TopBarNavigationItem
                  id="current-task-navigation"
                  isCurrent={isCurrentTask}
                  isDisabled={activeThreadId == null}
                  onPress={navigateToCurrentTask}
                  label={<Trans>Current task</Trans>}
                  description={
                    <Trans comment="Description for the current task destination in the navigation drawer">
                      Open current task
                    </Trans>
                  }
                />
                <TopBarNavigationItem
                  id="history-navigation"
                  isCurrent={isHistory}
                  onPress={navigateToHistory}
                  label={<Trans>History</Trans>}
                  description={
                    <Trans comment="Description for the task history destination in the navigation drawer">
                      Browse task history
                    </Trans>
                  }
                />
              </nav>
              <ActiveThreadCollectionMenu
                close={() => {
                  setIsDrawerOpen(false);
                }}
              />
              <ShortcutHelp />
            </Drawer.Body>
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </header>
  );
}
