import { expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { renderWithProviders as render } from "@/utils/test-utils";
import { MarkdownText } from "../MarkdownText";
import { LiveMarkdownText } from "../LiveMarkdownText";

const { writeText } = vi.hoisted(() => {
  const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
  vi.stubGlobal("isSecureContext", true);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  return { writeText };
});

test("code blocks offer copying without a download action", async () => {
  const screen = await render(<MarkdownText source={"```ts\nconst answer = 42;\n```"} />);

  await expect
    .element(screen.getByRole("button", { name: "Copy code", exact: true }))
    .toBeEnabled();
  expect(
    screen.container.querySelector('[data-streamdown="code-block-download-button"]'),
  ).toBeNull();
  await userEvent.unhover(document.body);
  await screen.getByRole("button", { name: "Copy code", exact: true }).hover();
  await expect.element(page.getByRole("tooltip")).toHaveTextContent("Copy code");
  await screen.getByRole("button", { name: "Copy code", exact: true }).click();
  expect(writeText).toHaveBeenCalledWith("const answer = 42;\n");
  await expect
    .element(screen.getByRole("button", { name: "Code copied", exact: true }))
    .toBeEnabled();
});

test("failed copying reports an error and allows retry", async () => {
  writeText.mockRejectedValueOnce(new Error("Permission denied"));
  const screen = await render(<MarkdownText source={"```\nretry me\n```"} />);
  const copy = screen.getByRole("button", { name: "Copy code", exact: true });
  await copy.click();
  await expect
    .element(screen.getByRole("alert"))
    .toHaveTextContent("Could not copy code. Try again.");
  const alert = screen.getByRole("alert").element();
  const codeBlock = screen.container.querySelector('[data-streamdown="code-block"]');
  if (!codeBlock) throw new Error("Expected the code block above its copy failure feedback");
  expect(alert.getBoundingClientRect().top).toBeGreaterThanOrEqual(
    codeBlock.getBoundingClientRect().bottom,
  );
  const message = screen.getByText("Could not copy code. Try again.").element();
  const bounds = message.getBoundingClientRect();
  expect(
    message.contains(document.elementFromPoint(bounds.left + bounds.width / 2, bounds.bottom - 1)),
  ).toBe(true);
  await expect.element(copy).toBeEnabled();
  await copy.click();
  await expect
    .element(screen.getByRole("button", { name: "Code copied", exact: true }))
    .toBeEnabled();
  await expect.element(screen.getByRole("alert")).not.toBeInTheDocument();
});

test("live code remains disabled for complete and incomplete fences while inline code stays inline", async () => {
  const screen = await render(
    <LiveMarkdownText source={"Use `inline`.\n\n```ts\nconst value = 1;\n```"} />,
  );
  await expect
    .element(screen.getByRole("button", { name: "Copy code", exact: true }))
    .toBeDisabled();
  expect(screen.container.querySelector('[data-streamdown="inline-code"]')?.textContent).toBe(
    "inline",
  );
  expect(
    screen.container.querySelector('[data-streamdown="code-block-download-button"]'),
  ).toBeNull();
  await screen.rerender(<LiveMarkdownText source={"```ts\nconst value ="} />);
  await expect
    .element(screen.getByRole("button", { name: "Copy code", exact: true }))
    .toBeDisabled();
  expect(
    screen.container.querySelector('[data-streamdown="code-block-body"]')?.textContent,
  ).toContain("const value =");
});

test("copy success waits for the clipboard and settling after unmount does not create feedback", async () => {
  let finish: (() => void) | undefined;
  writeText.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const screen = await render(<MarkdownText source={"```\npending\n```"} />);
  await screen.getByRole("button", { name: "Copy code", exact: true }).click();
  await expect
    .element(screen.getByRole("button", { name: "Copy code", exact: true }))
    .toBeDisabled();
  expect(screen.container.textContent).not.toContain("Code copied");
  await screen.unmount();
  finish?.();
  expect(screen.container.querySelector('[data-streamdown="code-block-copy-button"]')).toBeNull();
});
