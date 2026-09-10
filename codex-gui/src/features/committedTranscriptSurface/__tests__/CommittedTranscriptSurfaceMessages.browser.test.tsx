import { assert, expect, test } from "vitest";
import { page } from "vitest/browser";
import { activeThreadReadModelTransitionApplied } from "@/features/activeThreadSession/activeThreadSessionReadModel";
import type {
  ActiveThreadProjectionAcceptedEvent,
  ActiveThreadProjectionReadModelFact,
} from "@/features/activeThreadSession/activeThreadProjectionFacts";
import {
  agentMessage,
  agentMessageDelta,
  attachWithTurns,
  baseTurn,
  failedTurn,
  inProgressTurn,
  itemCompleted,
  itemStarted,
  reasoningItem,
  textInput,
  turnCompleted,
  turnStarted,
  userMessage,
} from "@/features/projection/__tests__/projectionTestBuilders";
import {
  attachBaseline,
  eventAgentMessageDelta,
  eventItemCompleted,
  eventItemStarted,
  eventTurnCompleted,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
import { selectCommittedTranscriptScrollCommitKey } from "@/features/transcriptState/transcriptStateSlice";
import { CommittedTranscriptSurface } from "../CommittedTranscriptSurface";
import { transcriptIdentity, renderTranscriptWithProviders } from "./transcriptSurfaceFixtures";

let sessionRevision = 0;
const readModelAction = (...facts: ActiveThreadProjectionReadModelFact[]) =>
  activeThreadReadModelTransitionApplied({
    identity: transcriptIdentity,
    sessionRevision: ++sessionRevision,
    facts,
  });
const threadRuntimeAttached = (
  response: Extract<ActiveThreadProjectionReadModelFact, { type: "baselineAttached" }>["response"],
) => readModelAction({ type: "baselineAttached", response });
const threadRuntimeEventBuffered = (payload: ActiveThreadProjectionAcceptedEvent) =>
  readModelAction({ type: "eventAccepted", payload });
const threadRuntimeDeltasAccepted = ({
  notifications,
}: Pick<
  Extract<ActiveThreadProjectionReadModelFact, { type: "deltasAccepted" }>,
  "notifications"
>) => readModelAction({ type: "deltasAccepted", notifications });
const threadRuntimeManualReconnectRequired = (
  input: Omit<
    Extract<ActiveThreadProjectionReadModelFact, { type: "projectionUnavailable" }>,
    "type"
  >,
) => readModelAction({ type: "projectionUnavailable", ...input });

const quotaErrorMessage = [
  "unexpected status 403 Forbidden: token quota is not enough, token remain quota: ¥0.064714, need quota: ¥0.072198 (request id: 202608140209338062200938268d9d60dAEpcHp), url:",
  "https://shapi.vip/v1/responses",
].join("\n");

const quotaError = {
  message: quotaErrorMessage,
  codexErrorInfo: "usageLimitExceeded",
  additionalDetails: null,
  misalignment: null,
} satisfies NonNullable<ReturnType<typeof failedTurn>["error"]>;

test("scrolls only overflowing formulas without shrinking them across message lifecycles", async () => {
  const originalViewport = { width: window.innerWidth, height: window.innerHeight };
  const expression = `${Array.from({ length: 16 }, (_, index) => String.raw`\frac{x_{${index + 1}}^2}{y_{${index + 1}}}`).join(" + ")} = z`;
  const source = [
    `Before $${expression}$ after.`,
    `Before \\(${expression}\\) after.`,
    `$$\n${expression}\n$$`,
    `\\[\n${expression}\n\\]`,
    "Short $x^2$ stays readable.",
  ].join("\n\n");
  const turnId = "turn-math-overflow";
  const itemId = "agent-math-overflow";
  try {
    await page.viewport(1280, 900);
    const { store } = await renderTranscriptWithProviders(
      transcriptIdentity,
      <CommittedTranscriptSurface identity={transcriptIdentity} />,
    );
    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "overflow-start",
          turnId,
          agentMessage(itemId, ""),
        ),
        replay: "live",
      }),
    );
    store.dispatch(
      threadRuntimeDeltasAccepted({
        notifications: [agentMessageDelta(eventAgentMessageDelta, turnId, itemId, source)],
      }),
    );
    await expect.poll(() => document.querySelectorAll(".katex").length).toBe(5);
    await document.fonts.ready;
    const desktopFontSizes = Array.from(
      document.querySelectorAll(".katex"),
      (node) => getComputedStyle(node).fontSize,
    );
    await page.viewport(390, 844);

    const verifyOverflow = async () => {
      await expect.poll(() => document.querySelectorAll(".katex").length).toBe(5);
      const formulas = Array.from(document.querySelectorAll<HTMLElement>(".katex"));
      expect(formulas.map((node) => getComputedStyle(node).fontSize)).toEqual(desktopFontSizes);
      expect(document.documentElement.scrollWidth).toBe(document.documentElement.clientWidth);
      const paragraph = document.querySelector(".committed-transcript-entry-markdown p");
      assert(paragraph, "Expected message prose beside the formulas");
      const paragraphLeft = paragraph.getBoundingClientRect().left;
      for (const formula of formulas.slice(0, 4)) {
        let scroller: HTMLElement | null = formula;
        while (scroller && !["auto", "scroll"].includes(getComputedStyle(scroller).overflowX)) {
          scroller = scroller.parentElement;
        }
        assert(scroller, "Expected a horizontal scroll container for the formula");
        const scrollContainer = scroller;
        expect(scrollContainer.textContent).not.toContain("Before");
        expect(scrollContainer.scrollWidth).toBeGreaterThan(scrollContainer.clientWidth);
        scrollContainer.scrollTo({ left: scrollContainer.scrollWidth, behavior: "instant" });
        await expect.poll(() => scrollContainer.scrollLeft).toBeGreaterThan(0);
        expect(
          Math.abs(
            scrollContainer.scrollWidth - scrollContainer.clientWidth - scrollContainer.scrollLeft,
          ),
        ).toBeLessThanOrEqual(1);
        expect(paragraph.getBoundingClientRect().left).toBe(paragraphLeft);
        expect(document.documentElement.scrollLeft).toBe(0);
        expect(formula.querySelector("math mfrac")).not.toBeNull();
        expect(formula.querySelector("annotation")?.textContent.trim()).toBe(expression);
      }
      const shortFormula = formulas[4];
      assert(shortFormula, "Expected the short formula after the four long formulas");
      expect(shortFormula.scrollWidth).toBeLessThanOrEqual(shortFormula.clientWidth);
    };

    await verifyOverflow();
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "overflow-complete",
          turnId,
          agentMessage(itemId, source),
        ),
        replay: "live",
      }),
    );
    await expect
      .poll(() => document.querySelector(".committed-transcript-live-assistant-message"))
      .toBeNull();
    await verifyOverflow();
    store.dispatch(
      threadRuntimeAttached(
        attachWithTurns(attachBaseline, [baseTurn(turnId, [agentMessage(itemId, source)])]),
      ),
    );
    await verifyOverflow();
  } finally {
    await page.viewport(originalViewport.width, originalViewport.height);
  }
});

test("renders an empty committed transcript region", async () => {
  const screen = await renderTranscriptWithProviders(
    transcriptIdentity,
    <CommittedTranscriptSurface identity={transcriptIdentity} />,
  );

  await expect.element(screen.getByRole("region", { name: "Committed transcript" })).toBeVisible();
  await expect.element(screen.getByText("No committed messages yet.")).toBeVisible();
});

test("renders committed user and assistant messages from an attached baseline", async () => {
  const { store, ...screen } = await renderTranscriptWithProviders(
    transcriptIdentity,
    <CommittedTranscriptSurface identity={transcriptIdentity} />,
  );

  store.dispatch(
    threadRuntimeAttached(
      attachWithTurns(attachBaseline, [
        baseTurn("turn-surface", [
          userMessage("user-surface", [textInput("Hello "), textInput("surface")]),
          agentMessage("agent-surface", "Committed response"),
        ]),
      ]),
    ),
  );

  await expect.element(screen.getByRole("article", { name: "Turn turn-surface" })).toBeVisible();
  await expect.element(screen.getByText("Hello surface")).toBeVisible();
  await expect.element(screen.getByText("Committed response")).toBeVisible();
  await expect.element(screen.getByText("turn-surface")).not.toBeInTheDocument();
  await expect.element(screen.getByText("user")).not.toBeInTheDocument();
  await expect.element(screen.getByText("assistant")).not.toBeInTheDocument();

  const entries = Array.from(document.querySelectorAll<HTMLElement>(".committed-transcript-entry"));
  expect(entries.map((entry) => entry.textContent)).toStrictEqual([
    "Hello surface",
    "Committed response",
  ]);
});

test("renders an attached failed-turn error after the turn content", async () => {
  const { store, ...screen } = await renderTranscriptWithProviders(
    transcriptIdentity,
    <CommittedTranscriptSurface identity={transcriptIdentity} />,
  );
  const turnId = "turn-attached-failed-error";

  store.dispatch(
    threadRuntimeAttached(
      attachWithTurns(attachBaseline, [
        failedTurn(turnId, quotaError, [
          userMessage("user-attached-failed-error", [textInput("Use the remaining quota")]),
          agentMessage("agent-attached-failed-error", "Final response before the request failed"),
        ]),
      ]),
    ),
  );

  const turn = screen.getByRole("article", { name: `Turn ${turnId}` });
  const failedStatus = turn.getByText("Failed", { exact: true });
  const finalMessage = turn.getByText("Final response before the request failed", {
    exact: true,
  });
  const errorAlert = turn.getByRole("alert");
  await expect.element(turn).toBeVisible();
  await expect.element(failedStatus).toBeVisible();
  await expect.element(finalMessage).toBeVisible();
  await expect.element(errorAlert).toBeVisible();
  await expect.element(errorAlert.getByText("Request failed", { exact: true })).toBeVisible();
  await expect
    .element(errorAlert.getByText("202608140209338062200938268d9d60dAEpcHp", { exact: false }))
    .toBeVisible();
  await expect
    .element(errorAlert.getByText("https://shapi.vip/v1/responses", { exact: false }))
    .toBeVisible();
  expect(errorAlert.element().textContent).toBe(`Request failed${quotaErrorMessage}`);
  expect(
    failedStatus.element().compareDocumentPosition(finalMessage.element()) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).not.toBe(0);
  expect(
    finalMessage.element().compareDocumentPosition(errorAlert.element()) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).not.toBe(0);
});

test("renders one error alert for a repeated live error-only turn completion", async () => {
  const { store, ...screen } = await renderTranscriptWithProviders(
    transcriptIdentity,
    <CommittedTranscriptSurface identity={transcriptIdentity} />,
  );
  const turnId = "turn-live-error-only";
  const failedNotification = turnCompleted(
    eventTurnCompleted,
    "commit-live-error-only",
    failedTurn(turnId, quotaError),
  );

  store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
  store.dispatch(threadRuntimeEventBuffered({ notification: failedNotification, replay: "live" }));
  store.dispatch(threadRuntimeEventBuffered({ notification: failedNotification, replay: "live" }));

  const turn = screen.getByRole("article", { name: `Turn ${turnId}` });
  const errorAlert = turn.getByRole("alert");
  await expect.element(turn).toBeVisible();
  await expect.element(turn.getByText("Failed", { exact: true })).toBeVisible();
  await expect.element(errorAlert).toBeVisible();
  await expect.element(errorAlert.getByText("Request failed", { exact: true })).toBeVisible();
  expect(errorAlert.element().textContent).toBe(`Request failed${quotaErrorMessage}`);
  expect(turn.getByRole("alert").elements()).toHaveLength(1);
  await expect.element(screen.getByText("No committed messages yet.")).not.toBeInTheDocument();
});

test("keeps same raw item ids isolated between turns", async () => {
  const { store, ...screen } = await renderTranscriptWithProviders(
    transcriptIdentity,
    <CommittedTranscriptSurface identity={transcriptIdentity} />,
  );

  store.dispatch(
    threadRuntimeAttached(
      attachWithTurns(attachBaseline, [
        baseTurn("turn-shared-item-first", [
          agentMessage("agent-shared-item", "First turn payload", "commentary"),
        ]),
        baseTurn("turn-shared-item-second", [
          agentMessage("agent-shared-item", "Second turn payload", "commentary"),
        ]),
      ]),
    ),
  );

  const firstTurn = screen.getByRole("article", { name: "Turn turn-shared-item-first" });
  const secondTurn = screen.getByRole("article", { name: "Turn turn-shared-item-second" });

  await expect.element(firstTurn.getByText("First turn payload")).toBeVisible();
  await expect.element(firstTurn.getByText("Second turn payload")).not.toBeInTheDocument();
  await expect.element(secondTurn.getByText("Second turn payload")).toBeVisible();
  await expect.element(secondTurn.getByText("First turn payload")).not.toBeInTheDocument();
});

test("renders assistant transcript markdown", async () => {
  const { store, ...screen } = await renderTranscriptWithProviders(
    transcriptIdentity,
    <CommittedTranscriptSurface identity={transcriptIdentity} />,
  );

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
  const characterBounds = (root: Element, text: string) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node != null) {
      const offset = node.textContent?.indexOf(text) ?? -1;
      if (offset >= 0) {
        const range = document.createRange();
        range.setStart(node, offset);
        range.setEnd(node, offset + 1);
        return range.getBoundingClientRect();
      }
      node = walker.nextNode();
    }
    throw new Error(`Expected rendered text: ${text}`);
  };
  if (softBreakParagraph == null) {
    throw new Error("Expected soft-break paragraph");
  }
  expect(characterBounds(softBreakParagraph, "Soft line two").top).toBeGreaterThanOrEqual(
    characterBounds(softBreakParagraph, "Soft line one").bottom,
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
  expect(characterBounds(fencedCode, "console").top).toBeGreaterThanOrEqual(
    characterBounds(fencedCode, "const").bottom,
  );
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

test("renders dollar math with semantic output and loaded fonts in assistant history", async () => {
  const { store, ...screen } = await renderTranscriptWithProviders(
    transcriptIdentity,
    <CommittedTranscriptSurface identity={transcriptIdentity} />,
  );
  store.dispatch(
    threadRuntimeAttached(
      attachWithTurns(attachBaseline, [
        baseTurn("turn-math", [
          userMessage("user-math", [textInput("Keep $x^2$ literal")]),
          agentMessage("agent-math", "Inline $x^2$ and $$y^2$$.\n\n$$\n\\frac{1}{2}\n$$"),
        ]),
      ]),
    ),
  );
  await expect.element(screen.getByText("Keep $x^2$ literal")).toBeVisible();
  await expect.poll(() => document.querySelectorAll(".katex math").length).toBe(3);
  expect(document.querySelectorAll(".katex-display")).toHaveLength(1);
  expect(document.querySelector("math mfrac")).not.toBeNull();
  expect(document.querySelector("math msup")).not.toBeNull();
  const fonts = await document.fonts.load("16px KaTeX_Main");
  expect(fonts.length).toBeGreaterThan(0);
  expect(fonts.every((font) => font.status === "loaded")).toBe(true);
});

test("renders backslash geometry and algebra alongside dollar math in assistant history", async () => {
  const { store } = await renderTranscriptWithProviders(
    transcriptIdentity,
    <CommittedTranscriptSurface identity={transcriptIdentity} />,
  );
  store.dispatch(
    threadRuntimeAttached(
      attachWithTurns(attachBaseline, [
        baseTurn("turn-backslash-math", [
          agentMessage(
            "agent-backslash-math",
            String.raw`角度 \(\angle ABC = 90^\circ\)，且 \(AB \perp BC\)。前文 \[\frac{x_1^2}{2}\] 后文。

$y^2$

$$
z^2
$$`,
          ),
        ]),
      ]),
    ),
  );
  await expect.poll(() => document.querySelectorAll(".katex math").length).toBe(5);
  expect(document.querySelectorAll(".katex-display")).toHaveLength(2);
  expect(document.querySelector(".katex-display math mfrac")).not.toBeNull();
  expect(document.querySelector("math msubsup")).not.toBeNull();
  expect(document.querySelector(".katex-error")).toBeNull();
});

test.each(["\n", "\r\n"])(
  "renders backslash delimiters across live deltas, completion and history with %j",
  async (lineEnding) => {
    const { store } = await renderTranscriptWithProviders(
      transcriptIdentity,
      <CommittedTranscriptSurface identity={transcriptIdentity} />,
    );
    const turnId = "turn-live-backslash";
    const itemId = "agent-live-backslash";
    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "backslash-start",
          turnId,
          agentMessage(itemId, ""),
        ),
        replay: "live",
      }),
    );
    const append = (delta: string) =>
      store.dispatch(
        threadRuntimeDeltasAccepted({
          notifications: [
            agentMessageDelta(
              eventAgentMessageDelta,
              turnId,
              itemId,
              delta.replaceAll("\n", lineEnding),
            ),
          ],
        }),
      );
    append("# Opening\n\nFirst paragraph\n\nSecond paragraph\n\nInline \\");
    await expect
      .poll(
        () => document.querySelector(".committed-transcript-live-assistant-message")?.textContent,
      )
      .toContain("Inline");
    append("(x^2");
    await expect
      .poll(
        () => document.querySelector(".committed-transcript-live-assistant-message")?.textContent,
      )
      .toContain("x^2");
    expect(document.querySelector(".katex")).toBeNull();
    append("\\");
    append(")\n\n\\");
    await expect.poll(() => document.querySelectorAll(".katex math").length).toBe(1);
    append("[\nx\n=\ny");
    await expect
      .poll(
        () => document.querySelector(".committed-transcript-live-assistant-message")?.textContent,
      )
      .toContain("y");
    expect(document.querySelectorAll(".katex math")).toHaveLength(1);
    append("\n\\");
    append("]\n\nDone");
    await expect.poll(() => document.querySelectorAll(".katex math").length).toBe(2);
    expect(document.querySelectorAll(".katex-display")).toHaveLength(1);
    const source =
      "# Opening\n\nFirst paragraph\n\nSecond paragraph\n\nInline \\(x^2\\)\n\n\\[\nx\n=\ny\n\\]\n\nDone".replaceAll(
        "\n",
        lineEnding,
      );
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "backslash-complete",
          turnId,
          agentMessage(itemId, source),
        ),
        replay: "live",
      }),
    );
    await expect
      .poll(() => document.querySelector(".committed-transcript-live-assistant-message"))
      .toBeNull();
    await expect.poll(() => document.querySelectorAll(".katex math").length).toBe(2);
    store.dispatch(
      threadRuntimeAttached(
        attachWithTurns(attachBaseline, [baseTurn(turnId, [agentMessage(itemId, source)])]),
      ),
    );
    await expect.poll(() => document.querySelectorAll(".katex math").length).toBe(2);
    expect(
      document
        .querySelector(".katex-display annotation")
        ?.textContent.trim()
        .replaceAll("\r\n", "\n"),
    ).toBe("x\n=\ny");
  },
);

test.each(["history", "live"] as const)(
  "preserves code, escapes, links and non-assistant math in %s",
  async (mode) => {
    const { store, ...screen } = await renderTranscriptWithProviders(
      transcriptIdentity,
      <CommittedTranscriptSurface identity={transcriptIdentity} />,
    );
    const turnId = `turn-math-boundaries-${mode}`;
    const source = [
      String.raw`Valid \(z^2\). Ordinary (ordinary) and [ordinary]. Escaped \\(literal\\) and \\[literal\\].`,
      "Use `\\(inline\\)` and ``\\[inline-block\\]``.",
      "```text\n\\(fenced\\)\n\\[fenced-block\\]\n```",
      "    \\[indented\\]",
      String.raw`[target](https://example.com/\(path\) "\(title\)")`,
      String.raw`[reference][math-link]

[math-link]: https://example.com/\[reference\]`,
      "| Value |\n| --- |\n| \\(t^2\\) |",
    ].join("\n\n");
    const userSource = String.raw`User \(x\) \[y\] $z$ $$w$$`;
    const reasoningSource = String.raw`Reasoning \(x\) \[y\] $z$ $$w$$`;
    const itemId = `agent-boundaries-${mode}`;
    store.dispatch(
      threadRuntimeAttached(
        attachWithTurns(attachBaseline, [
          baseTurn(turnId, [
            userMessage(`user-${mode}`, [textInput(userSource)]),
            reasoningItem(`reasoning-${mode}`, [reasoningSource]),
            ...(mode === "history" ? [agentMessage(itemId, source)] : []),
          ]),
        ]),
      ),
    );
    if (mode === "live") {
      store.dispatch(
        threadRuntimeEventBuffered({
          notification: itemStarted(
            eventItemStarted,
            "boundaries-start",
            turnId,
            agentMessage(itemId, ""),
          ),
          replay: "live",
        }),
      );
      store.dispatch(
        threadRuntimeDeltasAccepted({
          notifications: [agentMessageDelta(eventAgentMessageDelta, turnId, itemId, source)],
        }),
      );
    }
    await expect.poll(() => document.querySelectorAll(".katex math").length).toBe(2);
    expect(document.querySelector("table math msup")).not.toBeNull();
    expect(document.querySelectorAll(".katex-display")).toHaveLength(0);
    await expect
      .element(screen.getByText(/Escaped/))
      .toHaveTextContent(String.raw`Escaped \(literal\) and \[literal\].`);
    await expect.element(screen.getByText("\\(inline\\)", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("\\[inline-block\\]", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("\\(fenced\\)", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("\\[fenced-block\\]", { exact: true })).toBeVisible();
    expect(
      Array.from(document.querySelectorAll("pre"))
        .map((node) => node.textContent)
        .join("\n"),
    ).toContain("\\[indented\\]");
    await expect
      .element(screen.getByRole("link", { name: "target", exact: true }))
      .toHaveAttribute("href", "https://example.com/(path)");
    await expect
      .element(screen.getByRole("link", { name: "target", exact: true }))
      .toHaveAttribute("title", "(title)");
    // Streamdown parses live blocks independently; this definition is in another block.
    const reference = screen.getByText(
      mode === "history" ? "reference" : "[reference][math-link]",
      { exact: true },
    );
    await expect.element(reference).toBeVisible();
    expect(reference.element().getAttribute("href")).toBe(
      mode === "history" ? "https://example.com/%5Breference%5D" : null,
    );
    await expect.element(screen.getByText(userSource)).toBeVisible();
    await screen.getByRole("button", { name: /Intermediate updates/ }).click();
    await expect.element(screen.getByText("Reasoning (x) [y] $z$ $$w$$")).toBeVisible();
    expect(document.querySelector(".committed-transcript-entry-reasoning .katex")).toBeNull();
  },
);

test.each(["history", "live"] as const)(
  "preserves multiline math containers and unfinished markdown in %s",
  async (mode) => {
    const { store, ...screen } = await renderTranscriptWithProviders(
      transcriptIdentity,
      <CommittedTranscriptSurface identity={transcriptIdentity} />,
    );
    const turnId = `turn-math-containers-${mode}`;
    const itemId = `agent-math-containers-${mode}`;
    const source = String.raw`> \[
> \frac{1}{2}
>
> + x^2
> \]

- Explanation

  \[
  y_1^2
  \] **After formula**

Before invalid \(\frac{1}\) after invalid.

\[
unfinished

**Still readable**`;
    store.dispatch(
      threadRuntimeAttached(
        attachWithTurns(
          attachBaseline,
          mode === "history" ? [baseTurn(turnId, [agentMessage(itemId, source)])] : [],
        ),
      ),
    );
    if (mode === "live") {
      store.dispatch(
        threadRuntimeEventBuffered({
          notification: itemStarted(
            eventItemStarted,
            "containers-start",
            turnId,
            agentMessage(itemId, ""),
          ),
          replay: "live",
        }),
      );
      store.dispatch(
        threadRuntimeDeltasAccepted({
          notifications: [agentMessageDelta(eventAgentMessageDelta, turnId, itemId, source)],
        }),
      );
    }
    await expect.poll(() => document.querySelectorAll(".katex-display").length).toBe(2);
    expect(document.querySelector("blockquote math mfrac")).not.toBeNull();
    expect(document.querySelector("li math msubsup")).not.toBeNull();
    const annotations = Array.from(document.querySelectorAll(".katex-display annotation")).map(
      (node) => node.textContent.trim(),
    );
    expect(annotations).toEqual(["\\frac{1}{2}\n\n+ x^2", "y_1^2"]);
    await expect.element(screen.getByText("After formula", { exact: true })).toBeVisible();
    await expect
      .element(screen.getByText("After formula", { exact: true }))
      .toHaveAttribute("data-streamdown", "strong");
    await expect.poll(() => document.querySelector(".katex-error")?.textContent).toBe("\\frac{1}");
    await expect.element(screen.getByText("Still readable", { exact: true })).toBeVisible();
    await expect
      .element(screen.getByText("Still readable", { exact: true }))
      .toHaveAttribute("data-streamdown", "strong");
  },
);

test("keeps user markdown syntax as plain text", async () => {
  const { store, ...screen } = await renderTranscriptWithProviders(
    transcriptIdentity,
    <CommittedTranscriptSurface identity={transcriptIdentity} />,
  );

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

test("preserves default math completion while assistant deltas settle into history", async () => {
  const { store } = await renderTranscriptWithProviders(
    transcriptIdentity,
    <CommittedTranscriptSurface identity={transcriptIdentity} />,
  );
  store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
  const turnId = "turn-streaming-math";
  const itemId = "agent-streaming-math";
  store.dispatch(
    threadRuntimeEventBuffered({
      notification: itemStarted(eventItemStarted, "math-start", turnId, agentMessage(itemId, "")),
      replay: "live",
    }),
  );
  const append = (delta: string) =>
    store.dispatch(
      threadRuntimeDeltasAccepted({
        notifications: [agentMessageDelta(eventAgentMessageDelta, turnId, itemId, delta)],
      }),
    );
  append("Single $x^2");
  await expect
    .poll(() => document.querySelector(".committed-transcript-live-assistant-message")?.textContent)
    .toContain("$x^2");
  expect(document.querySelector(".katex")).toBeNull();
  append("$\n\n$$\ny^2");
  await expect.poll(() => document.querySelectorAll(".katex math").length).toBe(2);
  expect(document.querySelectorAll(".katex-display")).toHaveLength(1);
  append("\n$$\n\nDone");
  await expect
    .poll(() => document.querySelector(".committed-transcript-live-assistant-message")?.textContent)
    .toContain("Done");
  const source = "Single $x^2$\n\n$$\ny^2\n$$\n\nDone";
  store.dispatch(
    threadRuntimeEventBuffered({
      notification: itemCompleted(
        eventItemCompleted,
        "math-completed",
        turnId,
        agentMessage(itemId, source),
      ),
      replay: "live",
    }),
  );
  await expect
    .poll(() => document.querySelector(".committed-transcript-live-assistant-message"))
    .toBeNull();
  await expect.poll(() => document.querySelectorAll(".katex math").length).toBe(2);
  expect(document.querySelectorAll(".katex-display")).toHaveLength(1);
  store.dispatch(
    threadRuntimeAttached(
      attachWithTurns(attachBaseline, [baseTurn(turnId, [agentMessage(itemId, source)])]),
    ),
  );
  await expect.poll(() => document.querySelectorAll(".katex math").length).toBe(2);
});

test("keeps reasoning and code literal and leaves invalid math readable", async () => {
  const { store, ...screen } = await renderTranscriptWithProviders(
    transcriptIdentity,
    <CommittedTranscriptSurface identity={transcriptIdentity} />,
  );
  store.dispatch(
    threadRuntimeAttached(
      attachWithTurns(attachBaseline, [
        baseTurn("turn-math-boundaries", [
          reasoningItem("reasoning-math", ["Reasoning $x^2$ and $$y^2$$"]),
          agentMessage(
            "agent-math-boundaries",
            "Use `$x^2$`.\n\n```text\n$$y^2$$\n```\n\nBefore $\\frac{1}$ after.\n\n| Value |\n| --- |\n| $z^2$ |",
          ),
        ]),
      ]),
    ),
  );
  await screen.getByRole("button", { name: /Intermediate updates/ }).click();
  await expect.element(screen.getByText("Reasoning $x^2$ and $$y^2$$")).toBeVisible();
  expect(document.querySelector(".committed-transcript-entry-reasoning .katex")).toBeNull();
  await expect.poll(() => document.querySelector(".katex-error")?.textContent).toBe("\\frac{1}");
  await expect.element(screen.getByText(/Before/)).toBeVisible();
  await expect.element(screen.getByText(/after\./)).toBeVisible();
  expect(document.querySelector("p code")?.textContent).toBe("$x^2$");
  expect(document.querySelector("pre")?.textContent).toContain("$$y^2$$");
  expect(document.querySelector("table math msup")).not.toBeNull();
});

test("keeps raw html and images inactive while allowing markdown links", async () => {
  const { store, ...screen } = await renderTranscriptWithProviders(
    transcriptIdentity,
    <CommittedTranscriptSurface identity={transcriptIdentity} />,
  );

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

test("updates committed message text after snapshot reattach with stable ids", async () => {
  const { store, ...screen } = await renderTranscriptWithProviders(
    transcriptIdentity,
    <CommittedTranscriptSurface identity={transcriptIdentity} />,
  );

  store.dispatch(
    threadRuntimeAttached(
      attachWithTurns(attachBaseline, [
        baseTurn("turn-reattach", [agentMessage("agent-reattach", "Before reconnect")]),
      ]),
    ),
  );

  await expect.element(screen.getByText("Before reconnect")).toBeVisible();

  store.dispatch(
    threadRuntimeAttached(
      attachWithTurns(attachBaseline, [
        baseTurn("turn-reattach", [agentMessage("agent-reattach", "After reconnect")]),
      ]),
    ),
  );

  await expect.element(screen.getByText("Before reconnect")).not.toBeInTheDocument();
  await expect.element(screen.getByText("After reconnect")).toBeVisible();
});

test("renders live assistant text between intermediate updates and final answers", async () => {
  const { store, ...screen } = await renderTranscriptWithProviders(
    transcriptIdentity,
    <CommittedTranscriptSurface identity={transcriptIdentity} />,
  );

  store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
  const attachScrollKey = selectCommittedTranscriptScrollCommitKey(
    store.getState(),
    transcriptIdentity.threadId,
  );
  store.dispatch(
    threadRuntimeEventBuffered({
      notification: turnStarted(eventTurnStarted, "commit-turn-live", inProgressTurn("turn-live")),
      replay: "live",
    }),
  );
  store.dispatch(
    threadRuntimeEventBuffered({
      notification: itemStarted(
        eventItemStarted,
        "commit-started",
        "turn-live",
        agentMessage("agent-started", "Draft answer", "final_answer"),
      ),
      replay: "live",
    }),
  );

  await expect.element(screen.getByText("Draft answer")).not.toBeInTheDocument();
  await expect.element(screen.getByText("No committed messages yet.")).toBeVisible();
  await expect
    .element(screen.getByRole("article", { name: "Turn turn-live" }))
    .not.toBeInTheDocument();
  expect(document.querySelector(".committed-transcript-live-assistant-message")).toBeNull();

  store.dispatch(
    threadRuntimeDeltasAccepted({
      notifications: [
        agentMessageDelta(
          eventAgentMessageDelta,
          "turn-live",
          "agent-started",
          "**Streaming** answer",
        ),
      ],
    }),
  );

  await expect.element(screen.getByText("Streaming")).toBeVisible();
  await expect.element(screen.getByText("answer")).toBeVisible();
  await expect.element(screen.getByText("No committed messages yet.")).not.toBeInTheDocument();
  const turn = screen.getByRole("article", { name: "Turn turn-live" });
  await expect.element(turn).toBeVisible();
  await expect
    .element(turn.getByRole("button", { name: /Intermediate updates/ }))
    .not.toBeInTheDocument();
  expect(document.querySelector(".committed-transcript-live-assistant-message")).not.toBeNull();
  expect(
    document.querySelector(
      '.committed-transcript-live-assistant-message [data-streamdown="strong"]',
    ),
  ).not.toBeNull();
  expect(
    selectCommittedTranscriptScrollCommitKey(store.getState(), transcriptIdentity.threadId),
  ).toBe(attachScrollKey);

  store.dispatch(
    threadRuntimeEventBuffered({
      notification: itemCompleted(
        eventItemCompleted,
        "commit-completed",
        "turn-live",
        agentMessage("agent-started", "Final answer", "final_answer"),
      ),
      replay: "live",
    }),
  );

  await expect.element(screen.getByText("Streaming")).not.toBeInTheDocument();
  await expect.element(screen.getByText("Final answer")).toBeVisible();
  await expect
    .element(turn.getByRole("button", { name: /Intermediate updates/ }))
    .not.toBeInTheDocument();
  expect(document.querySelector(".committed-transcript-live-assistant-message")).toBeNull();
});

test("keeps middle message order stable while live messages settle out of order", async () => {
  const { store, ...screen } = await renderTranscriptWithProviders(
    transcriptIdentity,
    <CommittedTranscriptSurface identity={transcriptIdentity} />,
  );

  store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
  const turn = screen.getByRole("article", { name: "Turn turn-middle-order" });
  const messages = turn.getByRole("article");
  const startLiveMessage = (itemId: string) => {
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          `commit-middle-order-start-${itemId}`,
          "turn-middle-order",
          agentMessage(itemId, "", "commentary"),
        ),
        replay: "live",
      }),
    );
  };
  const appendLiveMessageDelta = (itemId: string, source: string) => {
    store.dispatch(
      threadRuntimeDeltasAccepted({
        notifications: [
          agentMessageDelta(eventAgentMessageDelta, "turn-middle-order", itemId, source),
        ],
      }),
    );
  };
  const completeMessage = (itemId: string, source: string) => {
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          `commit-middle-order-complete-${itemId}`,
          "turn-middle-order",
          agentMessage(itemId, source, "commentary"),
        ),
        replay: "live",
      }),
    );
  };
  const expectMessageOrder = async (sources: string[]) => {
    for (const [index, source] of sources.entries()) {
      await expect.element(messages.nth(index)).toHaveTextContent(source);
    }
    await expect.element(messages.nth(sources.length)).not.toBeInTheDocument();
  };

  startLiveMessage("agent-middle-order-a");
  startLiveMessage("agent-middle-order-b");
  await expect.element(turn).not.toBeInTheDocument();

  appendLiveMessageDelta("agent-middle-order-b", "Live B");
  await expectMessageOrder(["Live B"]);

  appendLiveMessageDelta("agent-middle-order-a", "Live A");
  await expectMessageOrder(["Live A", "Live B"]);

  completeMessage("agent-middle-order-b", "Committed B");
  await expectMessageOrder(["Live A", "Committed B"]);

  completeMessage("agent-middle-order-a", "Committed A");
  await expectMessageOrder(["Committed A", "Committed B"]);
});

test("leaves live synchronization interruption presentation to the current task page", async () => {
  const { store, ...screen } = await renderTranscriptWithProviders(
    transcriptIdentity,
    <CommittedTranscriptSurface identity={transcriptIdentity} />,
  );
  const attach = attachWithTurns(attachBaseline, []);

  store.dispatch(threadRuntimeAttached(attach));
  store.dispatch(
    threadRuntimeManualReconnectRequired({
      reason: "backpressure",
      threadId: attach.snapshot.thread.id,
      subscriptionId: attach.subscriptionId,
    }),
  );

  await expect
    .element(screen.getByText("Connection interrupted. Reconnect required."))
    .not.toBeInTheDocument();
});
