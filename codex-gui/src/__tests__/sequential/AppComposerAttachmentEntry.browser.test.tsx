import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import {
  launchThreadId,
  resetAppBrowserTestSupport,
  type StartGuiHostConnectionMock,
} from "@/__tests__/appBrowserTestSupport";
import {
  attachmentFileInput,
  renderActiveComposerQueueApp,
  steerTurnParamsAt,
} from "@/__tests__/appComposerQueueBrowserTestSupport";
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

test("attachment button supports keyboard selection, cancellation and selecting the same file again", async () => {
  const upload = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(() => Promise.resolve(new Response("/tmp/repeated.txt", { status: 201 })));
  const { screen, composer } = await renderActiveComposerQueueApp(startHost);
  const attach = screen.getByRole("button", { name: "Attach files", exact: true });
  const input = screen.container.querySelector<HTMLInputElement>('input[type="file"]');
  if (input == null) throw new Error("Missing file input");
  const choose = vi.spyOn(input, "click").mockImplementation(() => {
    // The actual native chooser is exercised by real-runtime acceptance.
  });
  await composer.click();
  await userEvent.tab();
  await expect.element(attach).toHaveFocus();
  await userEvent.keyboard("{Enter}");
  expect(choose).toHaveBeenCalledOnce();
  await attachmentFileInput(screen.container).upload([]);
  expect(upload).not.toHaveBeenCalled();
  const file = new File(["repeated"], "repeated.txt");
  await attachmentFileInput(screen.container).upload(file);
  await expect.element(composer.getByText("Uploaded", { exact: true })).toBeVisible();
  await composer.getByRole("button", { name: "Remove repeated.txt", exact: true }).click();
  await attach.click();
  expect(choose).toHaveBeenCalledTimes(2);
  await attachmentFileInput(screen.container).upload(file);
  await expect.element(composer.getByText("Uploaded", { exact: true })).toBeVisible();
  expect(upload).toHaveBeenCalledTimes(2);
});

test("attachment icon shares the footer with QR access and replaces the top upload entry", async () => {
  const { screen } = await renderActiveComposerQueueApp(startHost);
  const attach = screen.getByRole("button", { name: "Attach files", exact: true });
  const qr = screen.getByRole("button", { name: "Scan with phone", exact: true });
  await expect.element(attach).toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "Upload file", exact: true }))
    .not.toBeInTheDocument();
  const input = screen.container.querySelector<HTMLInputElement>('input[type="file"]');
  expect(input).not.toBeNull();
  await expect.element(input).not.toBeVisible();
  for (const width of [1440, 400]) {
    await page.viewport(width, 900);
    const button = attach.element().getBoundingClientRect();
    const code = qr.element().getBoundingClientRect();
    expect(Math.abs(button.top - code.top)).toBeLessThanOrEqual(1);
    expect(button.right).toBeLessThanOrEqual(code.left);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
  }
  await page.viewport(1280, 720);
});

test("dropping mixed files adds one ordered batch without navigating away", async () => {
  const upload = vi.spyOn(globalThis, "fetch").mockImplementation((url, options) =>
    Promise.resolve(
      options?.method === "POST"
        ? new Response(url === "/upload?filename=picture.png" ? "/tmp/p.png" : "/tmp/n.txt", {
            status: 201,
          })
        : new Response("missing", { status: 404 }),
    ),
  );
  const { screen, composer, steerTurn } = await renderActiveComposerQueueApp(startHost);
  await composer.fill("look ");
  const data = new DataTransfer();
  data.items.add(new File(["image bytes"], "picture.png", { type: "image/png" }));
  data.items.add(new File(["note bytes"], "notes.txt", { type: "text/plain" }));
  const event = new DragEvent("drop", { dataTransfer: data, bubbles: true, cancelable: true });
  composer.element().dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  await expect.element(composer.getByRole("alert")).toHaveTextContent("Preview read failed");
  await expect.element(composer.getByText("notes.txt", { exact: true })).toBeVisible();
  await screen.getByRole("button", { name: "Guide", exact: true }).click();
  await expect.poll(() => steerTurn.mock.calls.length).toBe(1);
  expect(steerTurnParamsAt(steerTurn, 0).input).toEqual([
    {
      type: "text",
      text: "look /tmp/p.png /tmp/n.txt",
      text_elements: [
        { byteRange: { start: 5, end: 15 }, placeholder: "picture.png" },
        { byteRange: { start: 16, end: 26 }, placeholder: "notes.txt" },
      ],
    },
    { type: "localImage", path: "/tmp/p.png" },
  ]);
  expect(upload.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(2);
});

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
  await expect.element(composer.getByRole("alert")).toHaveTextContent("Preview read failed");
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

test.each([
  { name: "pasted.heic", type: "image/heic" },
  { name: "pasted.svg", type: "" },
])("pasted $name uploads and sends only its local file path", async ({ name, type }) => {
  const upload = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response("/tmp/pasted", { status: 201 }));
  const { screen, composer, steerTurn } = await renderActiveComposerQueueApp(startHost);
  const data = new DataTransfer();
  data.items.add(new File(["original pasted bytes"], name, { type }));
  const event = new ClipboardEvent("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", { value: data });
  composer.element().dispatchEvent(event);
  await expect.element(composer.getByRole("status")).toHaveTextContent("Uploaded");
  await screen.getByRole("button", { name: "Guide", exact: true }).click();
  await expect.poll(() => steerTurn.mock.calls.length).toBe(1);
  expect(steerTurnParamsAt(steerTurn, 0).input).toEqual([
    {
      type: "text",
      text: "/tmp/pasted",
      text_elements: [{ byteRange: { start: 0, end: 11 }, placeholder: name }],
    },
  ]);
  expect(upload).toHaveBeenCalledOnce();
  const uploaded = upload.mock.calls[0]?.[1]?.body;
  if (!(uploaded instanceof File)) throw new Error("Expected original pasted file");
  expect(await uploaded.text()).toBe("original pasted bytes");
});
