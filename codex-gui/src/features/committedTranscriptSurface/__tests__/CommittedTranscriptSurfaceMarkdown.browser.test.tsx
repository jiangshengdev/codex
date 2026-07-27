import { expect, test } from "vitest";
import {
  agentMessage,
  attachWithTurns,
  baseTurn,
  textInput,
  userMessage,
} from "@/features/projection/__tests__/projectionTestBuilders";
import { attachBaseline } from "@/features/projection/__tests__/projectionFixtures";
import { threadRuntimeAttached } from "@/features/threadRuntime/threadRuntimeSlice";
import { renderWithProviders } from "@/utils/test-utils";
import { CommittedTranscriptSurface } from "../CommittedTranscriptSurface";

test("renders assistant transcript markdown", async () => {
  const { store, ...screen } = await renderWithProviders(<CommittedTranscriptSurface />);

  store.dispatch(
    threadRuntimeAttached(
      attachWithTurns(attachBaseline, [
        baseTurn("turn-markdown", [
          agentMessage(
            "agent-markdown",
            [
              "# Heading",
              "",
              "> Quoted text",
              "",
              "- First item",
              "- Second item",
              "",
              "1. First ordered item",
              "2. Second ordered item",
              "",
              "Soft line one",
              "Soft line two",
              "",
              "Use `inline code` here.",
              "",
              "[Allowed link](https://example.invalid/docs)",
              "",
              "```ts",
              'const value: string = "fenced code";',
              "console.log(value);",
              "```",
            ].join("\n"),
          ),
        ]),
      ]),
    ),
  );

  await expect.element(screen.getByRole("heading", { name: "Heading" })).toBeVisible();
  await expect.element(screen.getByText("Quoted text")).toBeVisible();
  await expect.element(screen.getByText("First item")).toBeVisible();
  await expect.element(screen.getByText("Second item")).toBeVisible();
  await expect.element(screen.getByText("First ordered item")).toBeVisible();
  await expect.element(screen.getByText("Second ordered item")).toBeVisible();

  const markdown = document.querySelector<HTMLElement>(".committed-transcript-entry-markdown");
  expect(markdown).not.toBeNull();
  if (!markdown) {
    return;
  }

  expect(markdown.querySelector("blockquote")?.textContent).toContain("Quoted text");
  expect(markdown.querySelector("ul")?.textContent).toContain("First item");
  expect(markdown.querySelector("ol")?.textContent).toContain("First ordered item");
  const softBreakParagraph = Array.from(markdown.querySelectorAll("p")).find((paragraph) =>
    paragraph.textContent.includes("Soft line one"),
  );
  expect(softBreakParagraph?.textContent).toContain("Soft line one\nSoft line two");
  expect(softBreakParagraph ? window.getComputedStyle(softBreakParagraph).whiteSpace : null).toBe(
    "pre-wrap",
  );
  const inlineCode = markdown.querySelector("p code");
  expect(inlineCode?.textContent).toContain("inline code");

  const fencedCodeBlock = markdown.querySelector("pre");
  expect(fencedCodeBlock?.textContent).toContain('const value: string = "fenced code";');
  expect(fencedCodeBlock?.textContent).toContain("console.log(value);");
  const fencedCode = fencedCodeBlock?.querySelector<HTMLElement>("code");
  expect(fencedCode).not.toBeNull();
  if (!fencedCode) {
    throw new Error("Expected fenced code element to render");
  }
  expect(fencedCode.className).not.toContain("counter-reset:line");
  const codeLines = Array.from(fencedCode.querySelectorAll<HTMLElement>(":scope > span"));
  expect(codeLines.length).toBeGreaterThanOrEqual(2);
  for (const codeLine of codeLines) {
    expect(codeLine.className).not.toContain("before:content-[counter(line)]");
    expect(window.getComputedStyle(codeLine).display).toBe("block");
  }
  const clipboardWriteAvailable =
    window.isSecureContext &&
    typeof (navigator as Partial<Pick<Navigator, "clipboard">>).clipboard?.writeText === "function";
  const codeCopyButton = markdown.querySelector('[data-streamdown="code-block-copy-button"]');
  expect(codeCopyButton !== null).toBe(clipboardWriteAvailable);

  const allowedLink = markdown.querySelector<HTMLAnchorElement>(
    'a[href="https://example.invalid/docs"]',
  );
  expect(allowedLink).not.toBeNull();
  expect(allowedLink?.textContent).toContain("Allowed link");
});

test("keeps user markdown syntax as plain text", async () => {
  const { store, ...screen } = await renderWithProviders(<CommittedTranscriptSurface />);

  store.dispatch(
    threadRuntimeAttached(
      attachWithTurns(attachBaseline, [
        baseTurn("turn-user-markdown-literal", [
          userMessage("user-markdown-literal", [textInput("# User heading\n- User item")]),
          agentMessage("agent-user-markdown-literal", "Assistant response"),
        ]),
      ]),
    ),
  );

  await expect.element(screen.getByText("# User heading\n- User item")).toBeVisible();
  await expect
    .element(screen.getByRole("heading", { name: "User heading" }))
    .not.toBeInTheDocument();
});

test("keeps raw html and images inactive while allowing markdown links", async () => {
  const { store, ...screen } = await renderWithProviders(<CommittedTranscriptSurface />);

  store.dispatch(
    threadRuntimeAttached(
      attachWithTurns(attachBaseline, [
        baseTurn("turn-markdown-safety", [
          agentMessage(
            "agent-markdown-safety",
            [
              "Before <strong>raw html</strong> and <em>raw emphasis</em> after.",
              "",
              '<a href="https://example.invalid/raw">raw link</a>',
              "",
              "![blocked image](https://example.invalid/image.png)",
              "",
              "[blocked link](https://example.invalid)",
            ].join("\n"),
          ),
        ]),
      ]),
    ),
  );

  await expect.element(screen.getByText(/Before/)).toBeVisible();
  expect(document.querySelector(".committed-transcript-entry-markdown strong")).toBeNull();
  expect(
    document.querySelector('.committed-transcript-entry-markdown [data-streamdown="strong"]'),
  ).toBeNull();
  expect(document.querySelector(".committed-transcript-entry-markdown em")).toBeNull();
  expect(document.querySelector(".committed-transcript-entry-markdown img")).toBeNull();
  const links = Array.from(
    document.querySelectorAll<HTMLAnchorElement>(".committed-transcript-entry-markdown a"),
  );
  expect(links.find((link) => link.textContent === "raw link")).toBeUndefined();
  const allowedLink = links.find((link) => link.textContent === "blocked link");
  expect(allowedLink).not.toBeNull();
  expect(allowedLink?.getAttribute("href")).toContain("https://example.invalid");
  expect(allowedLink?.textContent).toBe("blocked link");
});
