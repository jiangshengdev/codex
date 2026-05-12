import { beforeEach, expect, test, vi } from "vitest";
import App from "@/App";
import type {
  GuiHostStatus,
  StartGuiHostConnectionOptions,
} from "@/features/guiHost/guiHostClient";
import { renderWithProviders } from "@/utils/test-utils";

const guiHostClientMock = vi.hoisted(() => ({
  startGuiHostConnection: vi.fn(),
}));

vi.mock("@/features/guiHost/guiHostClient", () => ({
  startGuiHostConnection: guiHostClientMock.startGuiHostConnection,
}));

type StartGuiHostConnectionMock = {
  mockImplementation: (
    implementation: (options: StartGuiHostConnectionOptions) => () => void,
  ) => void;
  mockReset: () => void;
};

const startGuiHostConnectionMock =
  guiHostClientMock.startGuiHostConnection as StartGuiHostConnectionMock;

let emitStatus: ((status: GuiHostStatus) => void) | undefined;
let cleanupConnectionCallCount: number;

beforeEach(() => {
  emitStatus = undefined;
  cleanupConnectionCallCount = 0;
  startGuiHostConnectionMock.mockReset();
  startGuiHostConnectionMock.mockImplementation((options) => {
    emitStatus = options.onStatus;
    return () => {
      cleanupConnectionCallCount += 1;
    };
  });
});

test("App renders the GUI host status panel without opening a real WebSocket", async () => {
  const screen = await renderWithProviders(<App />);

  await expect.element(screen.getByRole("heading", { name: "GUI host" })).toBeVisible();
  await expect.element(screen.getByText("connecting")).toBeVisible();
  await expect.element(screen.getByText(/^no$/)).toBeVisible();
  await expect.element(screen.getByText(/^0$/)).toBeVisible();
  await expect.element(screen.getByText(/^none$/)).toBeVisible();
  expect(guiHostClientMock.startGuiHostConnection).toHaveBeenCalledTimes(1);
});

test("App reflects GUI host status callback updates", async () => {
  const screen = await renderWithProviders(<App />);

  emitStatus?.({
    label: "received event",
    eventCount: 2,
    lastEventType: "turnStarted",
  });

  await expect.element(screen.getByText("received event")).toBeVisible();
  await expect.element(screen.getByText(/^yes$/)).toBeVisible();
  await expect.element(screen.getByText(/^2$/)).toBeVisible();
  await expect.element(screen.getByText("turnStarted")).toBeVisible();
});

test("App closes the GUI host connection when unmounted", async () => {
  const screen = await renderWithProviders(<App />);

  await screen.unmount();

  expect(cleanupConnectionCallCount).toBe(1);
});
