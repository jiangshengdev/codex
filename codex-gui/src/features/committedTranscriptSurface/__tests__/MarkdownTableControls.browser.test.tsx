import { render } from "vitest-browser-react";
import { afterEach, assert, beforeEach, expect, test, vi } from "vitest";
import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { page, userEvent } from "vitest/browser";
import type { ReactNode } from "react";
import "@/index.css";
import { disableMotionForTest } from "@/utils/test-utils";
import { MarkdownText } from "../MarkdownText";
import { LiveMarkdownText } from "../LiveMarkdownText";

vi.hoisted(() => {
  vi.stubGlobal("isSecureContext", true);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn<Clipboard["writeText"]>().mockResolvedValue(undefined) },
  });
});

const markdown =
  '| Name | Value | Empty |\n| --- | --- | --- |\n| **A & B** | "one,two" | |\n| Pipe | one\\|two | |';
const clipboardItem = globalThis.ClipboardItem;
let restoreMotion: () => void;
beforeEach(() => {
  vi.stubGlobal("isSecureContext", true);
  vi.stubGlobal("ClipboardItem", clipboardItem);
  restoreMotion = disableMotionForTest();
});
afterEach(() => {
  restoreMotion();
});

const content = (children: ReactNode) => (
  <I18nProvider i18n={setupI18n({ locale: "en", messages: { en: {} } })}>{children}</I18nProvider>
);
const installClipboard = (
  write = vi.fn<(items: ClipboardItems) => Promise<void>>().mockResolvedValue(undefined),
) => {
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { write } });
  return write;
};

test("hides table copy when only clipboard text writes are available", async () => {
  const screen = await render(
    <I18nProvider i18n={setupI18n({ locale: "en", messages: { en: {} } })}>
      <MarkdownText source={"| Name | Value |\n| --- | --- |\n| Copy | Enabled |"} />
    </I18nProvider>,
  );
  await expect.element(screen.getByRole("table")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Copy table" })).not.toBeInTheDocument();
});

test.for([
  [
    "Markdown",
    '| Name | Value | Empty |\n| --- | --- | --- |\n| A & B | "one,two" |  |\n| Pipe | one\\|two |  |',
  ],
  ["CSV", 'Name,Value,Empty\nA & B,"""one,two""",\nPipe,one|two,'],
  ["TSV", 'Name\tValue\tEmpty\nA & B\t"one,two"\t\nPipe\tone|two\t'],
])("copies %s and HTML together without requiring writeText", async ([format, plain]) => {
  const write = installClipboard();
  const screen = await render(content(<MarkdownText source={markdown} />));
  await screen.getByRole("button", { name: "Copy table", exact: true }).click();
  await page.getByRole("menuitem", { name: format, exact: true }).click();
  await expect.element(screen.getByRole("status")).toHaveTextContent("Table copied");
  const item = write.mock.calls[0]?.[0][0];
  assert(item);
  expect(item.types).toEqual(["text/plain", "text/html"]);
  expect(await (await item.getType("text/plain")).text()).toBe(plain);
  const html = new DOMParser().parseFromString(
    await (await item.getType("text/html")).text(),
    "text/html",
  );
  expect(html.querySelectorAll("table")).toHaveLength(1);
  expect(html.querySelectorAll("th")).toHaveLength(3);
  expect(html.querySelectorAll("tbody tr")).toHaveLength(2);
  expect(html.querySelector('[data-streamdown="strong"]')?.textContent).toBe("A & B");
  expect(html.querySelector("tbody tr")?.lastElementChild?.textContent).toBe("");
  await expect.element(screen.getByRole("button", { name: /download/i })).not.toBeInTheDocument();
});

test.for(["insecure", "missing ClipboardItem", "missing write"])(
  "hides unsupported table copy: %s",
  async (missing) => {
    installClipboard();
    if (missing === "insecure") vi.stubGlobal("isSecureContext", false);
    if (missing === "missing ClipboardItem") vi.stubGlobal("ClipboardItem", undefined);
    if (missing === "missing write")
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: {} });
    const screen = await render(content(<MarkdownText source={markdown} />));
    await expect.element(screen.getByRole("table")).toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Copy table", exact: true }))
      .not.toBeInTheDocument();
    await expect.element(screen.getByRole("button", { name: "View fullscreen" })).toBeEnabled();
  },
);

test("reports a rejected write and permits a successful retry", async () => {
  const write = installClipboard(
    vi
      .fn<(items: ClipboardItems) => Promise<void>>()
      .mockRejectedValueOnce(new DOMException("denied", "NotAllowedError"))
      .mockResolvedValue(undefined),
  );
  const screen = await render(content(<MarkdownText source={markdown} />));
  await screen.getByRole("button", { name: "Copy table", exact: true }).click();
  await page.getByRole("menuitem", { name: "CSV", exact: true }).click();
  await expect
    .element(screen.getByRole("alert"))
    .toHaveTextContent("Could not copy table. Try again.");
  await expect.element(screen.getByRole("status")).not.toBeInTheDocument();
  await screen.getByRole("button", { name: "Copy table", exact: true }).click();
  await page.getByRole("menuitem", { name: "CSV", exact: true }).click();
  await expect.element(screen.getByRole("status")).toHaveTextContent("Table copied");
  await expect.element(screen.getByRole("alert")).not.toBeInTheDocument();
  expect(write.mock.calls).toHaveLength(2);
});

test("keeps the copy trigger focusable while a clipboard write is pending", async () => {
  let completeWrite: (() => void) | undefined;
  const writeResult = new Promise<void>((resolve) => {
    completeWrite = resolve;
  });
  installClipboard(vi.fn<Clipboard["write"]>().mockReturnValue(writeResult));
  const screen = await render(content(<MarkdownText source={markdown} />));
  const copy = screen.getByRole("button", { name: "Copy table", exact: true });
  await copy.click();
  await page.getByRole("menuitem", { name: "CSV", exact: true }).click();
  await expect.element(copy).toHaveAttribute("aria-disabled", "true");
  await expect.element(copy).toHaveFocus();
  await expect.element(screen.getByRole("status")).not.toBeInTheDocument();
  assert(completeWrite);
  completeWrite();
  await expect.element(screen.getByRole("status")).toHaveTextContent("Table copied");
  await expect.element(copy).not.toHaveAttribute("aria-disabled", "true");
});

test("supports keyboard menu navigation, fullscreen focus and layered Escape", async () => {
  const write = installClipboard();
  const screen = await render(
    content(
      <>
        <input aria-label="Before table" />
        <MarkdownText source={markdown} />
        <input aria-label="After table" />
      </>,
    ),
  );
  await screen.getByRole("textbox", { name: "Before table" }).click();
  await userEvent.tab();
  const copy = screen.getByRole("button", { name: "Copy table", exact: true });
  await expect.element(copy).toHaveFocus();
  await userEvent.keyboard("{Enter}");
  const menu = page.getByRole("menu", { name: "Copy table", exact: true });
  await expect.element(menu).toBeVisible();
  await userEvent.keyboard("{ArrowDown}{Enter}");
  await expect.element(screen.getByRole("status")).toHaveTextContent("Table copied");
  expect(write.mock.calls).toHaveLength(1);
  await expect.element(copy).toHaveFocus();
  await userEvent.keyboard("{Enter}{Escape}");
  await expect.element(menu).not.toBeInTheDocument();
  await expect.element(copy).toHaveFocus();
  await userEvent.tab();
  const open = screen.getByRole("button", { name: "View fullscreen" });
  await expect.element(open).toHaveFocus();
  const overflowBefore = document.documentElement.style.overflow;
  await userEvent.keyboard("{Enter}");
  const dialog = page.getByRole("dialog", { name: "View fullscreen" });
  await expect.element(dialog).toBeVisible();
  await expect.poll(() => dialog.element().contains(document.activeElement)).toBe(true);
  await expect.element(dialog.getByRole("button", { name: /download/i })).not.toBeInTheDocument();
  for (let step = 0; step < 4; step += 1) {
    await userEvent.tab();
    expect(dialog.element().contains(document.activeElement)).toBe(true);
  }
  await userEvent.tab({ shift: true });
  expect(dialog.element().contains(document.activeElement)).toBe(true);
  const fullscreenCopy = dialog.getByRole("button", { name: "Copy table", exact: true });
  await fullscreenCopy.click();
  await expect.element(menu).toBeVisible();
  await userEvent.keyboard("{Escape}");
  await expect.element(menu).not.toBeInTheDocument();
  await expect.element(dialog).toBeVisible();
  await expect.element(fullscreenCopy).toHaveFocus();
  await userEvent.keyboard("{Enter}");
  await page.getByRole("menuitem", { name: "TSV", exact: true }).click();
  await expect.element(dialog.getByRole("status")).toHaveTextContent("Table copied");
  await expect.element(menu).not.toBeInTheDocument();
  await expect.element(fullscreenCopy).toHaveFocus();
  await userEvent.keyboard("{Escape}");
  await expect.element(dialog).not.toBeInTheDocument();
  await expect.element(open).toHaveFocus();
  expect(document.documentElement.style.overflow).toBe(overflowBefore);
});

test("disables streaming operations while preserving the fullscreen close action and current content", async () => {
  installClipboard();
  const screen = await render(content(<LiveMarkdownText source={markdown} />));
  await expect
    .element(screen.getByRole("button", { name: "Copy table", exact: true }))
    .toBeDisabled();
  await expect.element(screen.getByRole("button", { name: "View fullscreen" })).toBeDisabled();
  await screen.rerender(content(<MarkdownText source={markdown} />));
  await screen.getByRole("button", { name: "View fullscreen" }).click();
  const dialog = page.getByRole("dialog", { name: "View fullscreen" });
  await screen.rerender(content(<MarkdownText source={markdown + "\n| Latest | Now | |"} />));
  await expect.element(dialog.getByRole("cell", { name: "Latest" })).toBeVisible();
  await expect.element(dialog.getByRole("button", { name: "Exit fullscreen" })).toBeEnabled();
  await dialog.getByRole("button", { name: "Exit fullscreen" }).click();
  await expect.element(dialog).not.toBeInTheDocument();
});

const longTable = (rows: number) =>
  "| Name | Value |\n| --- | --- |\n" +
  Array.from(
    { length: rows },
    (_, index) => `| Row ${String(index)} | ${"Wide".repeat(40)} |`,
  ).join("\n");

test("follows growing tables at the bottom without stealing a reader's scroll position", async () => {
  installClipboard();
  const screen = await render(content(<LiveMarkdownText source={longTable(25)} />));
  const table = screen.getByRole("table").element();
  const scroller = table.parentElement;
  assert(scroller);
  expect(scroller.clientHeight).toBeLessThanOrEqual(300);
  expect(scroller.scrollWidth).toBeGreaterThan(scroller.clientWidth);
  await expect
    .poll(() => Math.abs(scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop))
    .toBeLessThanOrEqual(1);
  await screen.rerender(content(<LiveMarkdownText source={longTable(30)} />));
  await expect
    .poll(() => Math.abs(scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop))
    .toBeLessThanOrEqual(1);
  scroller.scrollTo({ top: 0, left: 40, behavior: "instant" });
  await expect.poll(() => scroller.scrollTop).toBe(0);
  const readingLeft = scroller.scrollLeft;
  await screen.rerender(content(<LiveMarkdownText source={longTable(35)} />));
  await expect
    .element(screen.getByRole("cell", { name: "Row 34", exact: true }))
    .toBeInTheDocument();
  expect(scroller.scrollTop).toBe(0);
  expect(scroller.scrollLeft).toBe(readingLeft);
});

test("preserves normal table reading position and releases fullscreen on unmount", async () => {
  installClipboard();
  const screen = await render(content(<MarkdownText source={longTable(25)} />));
  const scroller = screen.getByRole("table").element().parentElement;
  assert(scroller);
  scroller.scrollTo({ top: 50, left: 40, behavior: "instant" });
  await expect.poll(() => scroller.scrollTop).toBe(50);
  const readingLeft = scroller.scrollLeft;
  const overflowBefore = document.documentElement.style.overflow;
  await screen.getByRole("button", { name: "View fullscreen" }).click();
  const dialog = page.getByRole("dialog", { name: "View fullscreen" });
  await dialog.getByRole("button", { name: "Exit fullscreen" }).click();
  await expect.element(dialog).not.toBeInTheDocument();
  expect(scroller.scrollTop).toBe(50);
  expect(scroller.scrollLeft).toBe(readingLeft);
  await screen.getByRole("button", { name: "View fullscreen" }).click();
  await expect.element(dialog).toBeVisible();
  await screen.unmount();
  await expect.element(dialog).not.toBeInTheDocument();
  expect(document.documentElement.style.overflow).toBe(overflowBefore);
});
