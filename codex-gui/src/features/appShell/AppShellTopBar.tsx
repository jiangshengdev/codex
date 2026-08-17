import { Button, Drawer } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { History, House, Menu } from "lucide-react";
import { useState } from "react";
import { useAppSelector } from "@/app/hooks";
import { selectThreadRuntimeRecord } from "@/features/threadRuntime/threadRuntimeSlice";

export function AppShellTopBar() {
  const { t } = useLingui();
  const navigate = useNavigate();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const runtime = useAppSelector(selectThreadRuntimeRecord);
  const isCurrentTask = pathname === "/";
  const isHistoryList = pathname === "/history";
  const currentTaskTitle = [runtime?.thread.name, runtime?.thread.preview].find(
    (candidate) => candidate != null && candidate.length > 0,
  );
  const title = isCurrentTask ? (currentTaskTitle ?? t`Current task`) : t`History`;

  const navigateTo = (to: "/" | "/history"): void => {
    setIsDrawerOpen(false);
    void navigate({ to, search: true });
  };

  return (
    <header className="fixed inset-x-0 top-0 z-30 h-14 border-b border-separator bg-surface text-foreground">
      <div
        className={`mx-auto flex h-full w-full items-center gap-3 px-4 ${isHistoryList ? "max-w-6xl" : "max-w-3xl"}`}
      >
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
                  variant={isCurrentTask ? "secondary" : "tertiary"}
                  onPress={() => {
                    navigateTo("/");
                  }}
                >
                  <House aria-hidden="true" className="size-5" />
                  <Trans>Current task</Trans>
                </Button>
                <Button
                  aria-current={pathname.startsWith("/history") ? "page" : undefined}
                  className="justify-start"
                  variant={pathname.startsWith("/history") ? "secondary" : "tertiary"}
                  onPress={() => {
                    navigateTo("/history");
                  }}
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
