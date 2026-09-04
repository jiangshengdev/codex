import { Button, Drawer } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useNavigate } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { useState } from "react";
import { useAppSelector } from "@/app/hooks";
import {
  CURRENT_TASK_ROUTE_PATH,
  HISTORY_LIST_ROUTE_PATH,
} from "@/features/browserLaunch/guiRouteTarget";
import { selectThreadRuntimeRecord } from "@/features/threadRuntime/threadRuntimeSlice";
import { useActiveThreadId, useAppCapabilities } from "./AppCapabilities";

export function AppShellTopBar() {
  const { t } = useLingui();
  const navigate = useNavigate();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const { routeTarget } = useAppCapabilities();
  const activeThreadId = useActiveThreadId();
  const runtime = useAppSelector(selectThreadRuntimeRecord);
  const isCurrentTask = routeTarget.type === "currentTask";
  const currentTaskTitle =
    isCurrentTask && runtime?.threadId === routeTarget.threadId
      ? [runtime.thread.name, runtime.thread.preview].find(
          (candidate) => candidate != null && candidate.length > 0,
        )
      : undefined;
  const title = isCurrentTask ? (currentTaskTitle ?? t`Current task`) : t`History`;

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

  return (
    <header className="fixed inset-x-0 top-0 z-30 h-14 border-b border-separator bg-surface text-foreground">
      <div className="app-shell-content-boundary flex h-full items-center gap-3">
        <Button
          variant="secondary"
          onPress={() => {
            setIsDrawerOpen(true);
          }}
        >
          <Menu aria-hidden="true" className="size-5" />
          <Trans>Menu</Trans>
        </Button>
        <h1 className="min-w-0 truncate text-base font-semibold">{title}</h1>
      </div>

      <Drawer.Backdrop isOpen={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
        <Drawer.Content placement="left">
          <Drawer.Dialog>
            <Drawer.CloseTrigger />
            <Drawer.Header>
              <Drawer.Heading>
                <Trans>Navigation</Trans>
              </Drawer.Heading>
            </Drawer.Header>
            <Drawer.Body>
              <nav aria-label={t`Main navigation`} className="flex flex-col gap-1">
                <Button
                  aria-describedby="current-task-navigation-description"
                  aria-current={isCurrentTask ? "page" : undefined}
                  aria-labelledby="current-task-navigation-label"
                  className="h-auto min-h-9 justify-start gap-3 rounded-2xl px-2 py-1.5 text-start whitespace-normal md:h-auto"
                  fullWidth
                  isDisabled={activeThreadId == null}
                  variant="ghost"
                  onPress={navigateToCurrentTask}
                >
                  <span
                    aria-hidden="true"
                    className="flex w-4 shrink-0 items-center justify-center self-stretch"
                  >
                    {isCurrentTask ? (
                      <span
                        aria-hidden="true"
                        className="size-2 rounded-full bg-muted"
                        data-current-page-indicator="true"
                      />
                    ) : null}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col items-start">
                    <span
                      className="text-sm font-medium text-foreground"
                      id="current-task-navigation-label"
                    >
                      <Trans>Current task</Trans>
                    </span>
                    <span
                      className="text-xs font-normal text-wrap wrap-break-word text-muted"
                      id="current-task-navigation-description"
                    >
                      <Trans comment="Description for the current task destination in the navigation drawer">
                        Open current task
                      </Trans>
                    </span>
                  </span>
                </Button>
                <Button
                  aria-describedby="history-navigation-description"
                  aria-current={!isCurrentTask ? "page" : undefined}
                  aria-labelledby="history-navigation-label"
                  className="h-auto min-h-9 justify-start gap-3 rounded-2xl px-2 py-1.5 text-start whitespace-normal md:h-auto"
                  fullWidth
                  variant="ghost"
                  onPress={navigateToHistory}
                >
                  <span
                    aria-hidden="true"
                    className="flex w-4 shrink-0 items-center justify-center self-stretch"
                  >
                    {!isCurrentTask ? (
                      <span
                        aria-hidden="true"
                        className="size-2 rounded-full bg-muted"
                        data-current-page-indicator="true"
                      />
                    ) : null}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col items-start">
                    <span
                      className="text-sm font-medium text-foreground"
                      id="history-navigation-label"
                    >
                      <Trans>History</Trans>
                    </span>
                    <span
                      className="text-xs font-normal text-wrap wrap-break-word text-muted"
                      id="history-navigation-description"
                    >
                      <Trans comment="Description for the task history destination in the navigation drawer">
                        Browse task history
                      </Trans>
                    </span>
                  </span>
                </Button>
              </nav>
            </Drawer.Body>
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </header>
  );
}
