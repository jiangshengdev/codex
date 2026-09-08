import { beforeEach, expect, test, vi } from "vitest";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import type { StartGuiHostConnectionOptions } from "@/features/guiHost/guiHostClient";
import {
  CURRENT_TASK_ROUTE_PATH,
  HISTORY_LIST_ROUTE_PATH,
  NEW_TASK_ROUTE_PATH,
} from "@/features/browserLaunch/guiRouteTarget";
import {
  attachWithThreadId,
  attachWithTurns,
  inProgressTurn,
} from "@/features/projection/__tests__/projectionTestBuilders";
import { createAppRouter } from "@/router";
import { renderWithProviders } from "@/utils/test-utils";
import {
  attachResponse,
  createGuiHostCommands,
  getHostOptions,
  initializeHost,
  launchThreadId,
  queueAttachProjectionResponse,
  resetAppBrowserTestSupport,
  seedBrowserAuthorizationSession,
} from "./appBrowserTestSupport";

const hostMock = vi.hoisted(() => ({
  startGuiHostConnection: vi.fn<(options: StartGuiHostConnectionOptions) => () => void>(),
}));
vi.mock("@/features/guiHost/guiHostClient", () => ({
  startGuiHostConnection: hostMock.startGuiHostConnection,
}));
beforeEach(() => {
  resetAppBrowserTestSupport(hostMock.startGuiHostConnection);
  seedBrowserAuthorizationSession({ token: "pending-edit-recovery-test" });
});

test.each([HISTORY_LIST_ROUTE_PATH, NEW_TASK_ROUTE_PATH, CURRENT_TASK_ROUTE_PATH])(
  "retains the old edit across navigation to %s and preserves the main draft",
  async (to) => {
    const router = createAppRouter(
      createMemoryHistory({ initialEntries: [`/task/${launchThreadId}`] }),
    );
    const screen = await renderWithProviders(<RouterProvider router={router} />);
    const secondThreadId = "00000000-0000-0000-0000-000000000002";
    const commands = createGuiHostCommands({ storedThreadIds: [launchThreadId, secondThreadId] });
    queueAttachProjectionResponse(
      commands,
      attachWithTurns(attachResponse, [inProgressTurn("editing-turn")]),
    );
    initializeHost(getHostOptions(hostMock.startGuiHostConnection), commands);
    const composer = screen.getByRole("combobox", { name: "Message Codex", exact: true });
    await composer.fill("Original queued message");
    await screen.getByRole("button", { name: "Send", exact: true }).click();
    await composer.fill("Independent main draft");
    await screen.getByRole("button", { name: "Pending: Queued 1", exact: true }).click();
    await screen.getByRole("button", { name: "Edit", exact: true }).click();
    await screen
      .getByRole("combobox", { name: "Edit pending message", exact: true })
      .fill("Retain my edit across navigation");
    if (to === CURRENT_TASK_ROUTE_PATH) {
      queueAttachProjectionResponse(
        commands,
        attachWithThreadId(attachWithTurns(attachResponse, []), secondThreadId),
      );
      await router.navigate({ to, params: { threadId: secondThreadId } });
    } else await router.navigate({ to });
    await expect.element(screen.getByRole("alertdialog")).toBeVisible();
    await screen.getByRole("button", { name: "Return to edit", exact: true }).click();
    const retained = screen.getByRole("textbox", { name: "Unsaved pending message", exact: true });
    await expect.element(retained).toHaveValue("Retain my edit across navigation");
    expect(router.state.location.pathname).toBe(
      to === CURRENT_TASK_ROUTE_PATH ? `/task/${secondThreadId}` : to,
    );
    await expect
      .element(screen.getByRole("button", { name: "Save", exact: true }))
      .not.toBeInTheDocument();
    await screen
      .getByRole("dialog")
      .getByRole("button", { name: "Discard changes", exact: true })
      .click();
    await screen
      .getByRole("alertdialog")
      .getByRole("button", { name: "Discard changes", exact: true })
      .click();
    await expect.element(retained).not.toBeInTheDocument();
    await router.navigate({ to: "/task/$threadId", params: { threadId: launchThreadId } });
    await expect.element(composer).toHaveTextContent("Independent main draft");
    await screen.getByRole("button", { name: "Pending: Queued 1", exact: true }).click();
    await expect
      .element(screen.getByRole("dialog").getByText("Original queued message", { exact: true }))
      .toBeVisible();
    expect(commands.startTurn).not.toHaveBeenCalled();
  },
);
