import { render } from "vitest-browser-react";
import { expect, test } from "vitest";
import { LiveMarkdownText } from "../LiveMarkdownText";
import { MarkdownText } from "../MarkdownText";

test("renders protocol-less links as markdown text while preserving scheme behavior", async () => {
  const schemeLinks = [
    ["HTTP", "http://example.invalid/docs"],
    ["HTTPS", "https://example.invalid/docs"],
    ["Mail", "mailto:user@example.invalid"],
  ] as const;
  const protocolLessLinks = [
    ["POSIX", "/Users/example/work/file.rs:10"],
    ["Relative", "src/file.rs"],
    ["Current", "./file.rs"],
    ["Parent", "../src/file.rs"],
    ["Fragment", "#section"],
    ["Query", "?view=source"],
    ["Protocol relative", "//example.invalid/path"],
    ["Empty", ""],
  ] as const;
  const markdown = [
    ...schemeLinks.map(([label, target]) => `[${label}](${target})`),
    ...protocolLessLinks.map(([label, target]) => `[${label}](${target})`),
    "[Custom](x:resource)",
    "[Drive relative](C:file.rs)",
    '[Titled](src/titled.rs "ignored title")',
    "[Reference][source]",
    "",
    '[source]: src/reference.rs "ignored title"',
    "",
    "[Unsafe](<javascript:alert(1)>)",
  ].join("\n\n");

  const screen = await render(<MarkdownText source={markdown} />);

  for (const [label, target] of schemeLinks) {
    await expect
      .element(screen.getByRole("link", { name: label, exact: true }))
      .toHaveAttribute("href", target);
  }

  for (const [label, target] of protocolLessLinks) {
    await expect.element(screen.getByText(`[${label}](${target})`, { exact: true })).toBeVisible();
    await expect
      .element(screen.getByRole("link", { name: label, exact: true }))
      .not.toBeInTheDocument();
  }

  await expect.element(screen.getByText("[Titled](src/titled.rs)")).toBeVisible();
  await expect.element(screen.getByText("[Reference](src/reference.rs)")).toBeVisible();
  await expect.element(screen.getByText("ignored title")).not.toBeInTheDocument();
  await expect.element(screen.getByText("[Custom](x:resource)")).not.toBeInTheDocument();
  await expect.element(screen.getByText("[Drive relative](C:file.rs)")).not.toBeInTheDocument();
  await expect
    .element(screen.getByRole("link", { name: "Unsafe", exact: true }))
    .not.toBeInTheDocument();
});

test("shows parsed Windows targets without URI percent encoding", async () => {
  const backslashTarget = String.raw`C:\work\file.rs:10`;
  const spacedTarget = String.raw`C:\work folder\file.rs:10`;
  const uncSourceTarget = String.raw`\\\\server\share\file.rs:10`;
  const uncParsedTarget = String.raw`\\server\share\file.rs:10`;
  const markdown = [
    "[Forward](C:/work/file.rs:10)",
    `[Backslash](${backslashTarget})`,
    `[Spaced](<${spacedTarget}>)`,
    `[UNC](${uncSourceTarget})`,
    "[View **file.rs** and `line 10`](" + backslashTarget + ")",
  ].join("\n\n");

  const screen = await render(<MarkdownText source={markdown} />);
  const paragraphTexts = Array.from(screen.container.querySelectorAll("p")).map(
    (paragraph) => paragraph.textContent,
  );

  expect(paragraphTexts).toEqual(
    expect.arrayContaining([
      "[Forward](C:/work/file.rs:10)",
      `[Backslash](${backslashTarget})`,
      `[Spaced](${spacedTarget})`,
      `[UNC](${uncParsedTarget})`,
      `[View file.rs and line 10](${backslashTarget})`,
    ]),
  );
  expect(screen.container.textContent).not.toContain("%5C");
  expect(screen.container.textContent).not.toContain("%20");

  const strong = screen.container.querySelector('[data-streamdown="strong"]');
  const inlineCode = screen.container.querySelector("p code");
  expect(strong?.textContent).toBe("file.rs");
  expect(strong?.closest("a")).toBeNull();
  expect(inlineCode?.textContent).toBe("line 10");
  expect(inlineCode?.closest("a")).toBeNull();
});

test("uses the same direct-link behavior in live and committed markdown", async () => {
  const markdown = [
    "[Live file](src/live.rs)",
    "",
    "[Live web](https://example.invalid/live)",
  ].join("\n");

  const live = await render(<LiveMarkdownText source={markdown} />, {
    container: document.body.appendChild(document.createElement("div")),
  });
  const committed = await render(<MarkdownText source={markdown} />, {
    container: document.body.appendChild(document.createElement("div")),
  });

  for (const screen of [live, committed]) {
    await expect.element(screen.locator.getByText("[Live file](src/live.rs)")).toBeVisible();
    await expect
      .element(screen.locator.getByRole("link", { name: "Live file", exact: true }))
      .not.toBeInTheDocument();
    await expect
      .element(screen.locator.getByRole("link", { name: "Live web", exact: true }))
      .toHaveAttribute("href", "https://example.invalid/live");
  }
});

test("keeps unresolved live references and resolves committed references", async () => {
  const markdown = ["[Reference][source]", "", '[source]: src/reference.rs "ignored title"'].join(
    "\n",
  );

  const live = await render(<LiveMarkdownText source={markdown} />, {
    container: document.body.appendChild(document.createElement("div")),
  });
  const committed = await render(<MarkdownText source={markdown} />, {
    container: document.body.appendChild(document.createElement("div")),
  });

  await expect.element(live.locator.getByText("[Reference][source]")).toBeVisible();
  await expect
    .element(live.locator.getByText("[Reference](src/reference.rs)"))
    .not.toBeInTheDocument();
  await expect.element(committed.locator.getByText("[Reference](src/reference.rs)")).toBeVisible();
  await expect
    .element(committed.locator.getByRole("link", { name: "Reference", exact: true }))
    .not.toBeInTheDocument();
});
