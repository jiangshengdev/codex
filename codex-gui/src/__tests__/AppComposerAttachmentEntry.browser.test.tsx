import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  launchThreadId,
  resetAppBrowserTestSupport,
  type StartGuiHostConnectionMock,
} from "./appBrowserTestSupport";
import {
  renderActiveComposerQueueApp,
  steerTurnParamsAt,
} from "./appComposerQueueBrowserTestSupport";
import type { StartGuiHostConnectionOptions } from "@/features/guiHost/guiHostClient";
import { createComposerInputQueueCoordinator } from "@/features/composerInputQueue/composerInputQueueCoordinator";

const host = vi.hoisted(() => ({
  startGuiHostConnection: vi.fn<(options: StartGuiHostConnectionOptions) => () => void>(),
}));
vi.mock("@/features/guiHost/guiHostClient", () => ({
  startGuiHostConnection: host.startGuiHostConnection,
}));
const startHost = host.startGuiHostConnection as unknown as StartGuiHostConnectionMock;
vi.mock("@/features/composerInputQueue/composerInputQueueCoordinator", { spy: true });

beforeEach(() => {
  resetAppBrowserTestSupport(startHost);
  vi.mocked(createComposerInputQueueCoordinator).mockClear();
  window.history.replaceState({}, "", `/task/${launchThreadId}#token=secret`);
});
afterEach(() => vi.restoreAllMocks());

test("pasted image bytes enter the attachment flow without pasting their HTML representation", async () => {
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation((_url, options) =>
      Promise.resolve(
        options?.method === "POST"
          ? new Response("/tmp/pasted.png", { status: 201 })
          : new Response("missing preview", { status: 404 }),
      ),
    );
  const { screen, composer, steerTurn } = await renderActiveComposerQueueApp(startHost);
  await composer.fill("prefix ");
  const data = new DataTransfer();
  data.items.add(new File(["pasted bytes"], "pasted.png", { type: "image/png" }));
  data.setData("text/html", '<img src="https://example.invalid/image">');
  data.setData("text/plain", "image representation");
  const event = new ClipboardEvent("paste", {
    clipboardData: data,
    bubbles: true,
    cancelable: true,
  });
  // Firefox drops files from the synthetic ClipboardEvent constructor.
  Object.defineProperty(event, "clipboardData", { value: data });
  expect(data.files.length).toBe(1);
  expect(event.clipboardData?.files.length).toBe(1);
  composer.element().dispatchEvent(event);
  await expect.element(composer.getByText("pasted.png", { exact: true })).toBeVisible();
  await expect.element(composer).not.toHaveTextContent("image representation");
  await screen.getByRole("button", { name: "Guide", exact: true }).click();
  await expect.poll(() => steerTurn.mock.calls.length).toBe(1);
  expect(steerTurnParamsAt(steerTurn, 0).input).toEqual([
    {
      type: "text",
      text: "prefix /tmp/pasted.png",
      text_elements: [{ byteRange: { start: 7, end: 22 }, placeholder: "pasted.png" }],
    },
    { type: "localImage", path: "/tmp/pasted.png" },
  ]);
  expect(fetch.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(1);
});
