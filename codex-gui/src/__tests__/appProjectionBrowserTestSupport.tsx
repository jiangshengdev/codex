import { expect } from "vitest";
import {
  attachResponse,
  createGuiHostCommands,
  getHostOptions,
  initializeHost,
  queueAttachProjectionResponse,
  type StartGuiHostConnectionMock,
} from "./appBrowserTestSupport";
import { AppBrowserRenderHarness as App } from "./appBrowserRenderHarness";
import type {
  GuiHostCommands,
  StartGuiHostConnectionOptions,
} from "@/features/guiHost/guiHostClient";
import { renderWithProviders } from "@/utils/test-utils";

export const getAppComposer = (screen: Awaited<ReturnType<typeof renderWithProviders>>) =>
  screen.getByRole("combobox", { name: "Message Codex", exact: true });

export const renderReadyApp = async (
  startGuiHostConnectionMock: StartGuiHostConnectionMock,
  commandHandle = createGuiHostCommands(),
) => {
  const screen = await renderWithProviders(<App />);
  const options = getHostOptions(startGuiHostConnectionMock);

  initializeAppWithProjection(options, attachResponse, commandHandle);
  await expect.element(getAppComposer(screen)).toHaveAttribute("contenteditable", "true");

  return { commandHandle, options, screen };
};

export const initializeAppWithProjection = (
  options: StartGuiHostConnectionOptions,
  response = attachResponse,
  commands = createGuiHostCommands(),
): GuiHostCommands => {
  queueAttachProjectionResponse(commands, response);
  initializeHost(options, commands);
  return commands;
};
