import { Button, Drawer } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useNavigate } from "@tanstack/react-router";
import { History, House, Menu } from "lucide-react";
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
                  aria-current={isCurrentTask ? "page" : undefined}
                  className="justify-start"
                  isDisabled={activeThreadId == null}
                  variant={isCurrentTask ? "secondary" : "tertiary"}
                  onPress={navigateToCurrentTask}
                >
                  <House aria-hidden="true" className="size-5" />
                  <Trans>Current task</Trans>
                </Button>
                <Button
                  aria-current={!isCurrentTask ? "page" : undefined}
                  className="justify-start"
                  variant={!isCurrentTask ? "secondary" : "tertiary"}
                  onPress={navigateToHistory}
                >
                  <History aria-hidden="true" className="size-5" />
                  <Trans>History</Trans>
                </Button>
              </nav>
            </Drawer.Body>
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </header>
  );
}
