import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { StartGuiHostConnectionOptions } from "@/features/guiHost/guiHostClient";
import { launchThreadId, resetAppBrowserTestSupport } from "./appBrowserTestSupport";
import { renderReadyApp } from "./appProjectionBrowserTestSupport";

const hostMock = vi.hoisted(() => ({
  startGuiHostConnection: vi.fn<(options: StartGuiHostConnectionOptions) => () => void>(),
}));

vi.mock("@/features/guiHost/guiHostClient", () => ({
  startGuiHostConnection: hostMock.startGuiHostConnection,
}));

beforeEach(() => {
  resetAppBrowserTestSupport(hostMock.startGuiHostConnection);
  window.history.replaceState({}, "", `/task/${launchThreadId}#token=secret`);
});

afterEach(() => {
  vi.restoreAllMocks();
});

test("App Browser fixtures do not leave notification workers controlling later test files", async () => {
  const register = vi.spyOn(navigator.serviceWorker, "register");
  await renderReadyApp(hostMock.startGuiHostConnection);
  expect(register).toHaveBeenCalledWith("/task-notifications.js");

  // Observe completion of the actual App registration attempt, including a
  // rejected attempt in the isolated Browser environment, before checking leaks.
  const attempts = register.mock.results.map((result) => {
    if (result.type !== "return") throw new Error("Expected a service worker registration promise");
    return result.value;
  });
  await Promise.allSettled(attempts);
  expect(await navigator.serviceWorker.getRegistrations()).toEqual([]);
});
