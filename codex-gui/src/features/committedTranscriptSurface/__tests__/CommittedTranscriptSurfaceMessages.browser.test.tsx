import { expect, test } from "vitest";
import { activeThreadReadModelTransitionApplied } from "@/features/activeThreadSession/activeThreadSessionReadModel";
import type {
  ActiveThreadProjectionAcceptedQueueFact,
  ActiveThreadProjectionReadModelFact,
} from "@/features/activeThreadSession/activeThreadProjection";
import {
  agentMessage,
  agentMessageDelta,
  attachWithTurns,
  baseTurn,
  failedTurn,
  inProgressTurn,
  itemCompleted,
  itemStarted,
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
import { renderWithProviders } from "@/utils/test-utils";
import { CommittedTranscriptSurface } from "../CommittedTranscriptSurface";

let sessionRevision = 0;
const readModelAction = (...facts: ActiveThreadProjectionReadModelFact[]) =>
  activeThreadReadModelTransitionApplied({ sessionRevision: ++sessionRevision, facts });
const threadRuntimeAttached = (
  response: Extract<ActiveThreadProjectionReadModelFact, { type: "baselineAttached" }>["response"],
) => readModelAction({ type: "baselineAttached", response });
const threadRuntimeEventBuffered = (payload: ActiveThreadProjectionAcceptedQueueFact) =>
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

test("renders an empty committed transcript region", async () => {
  const screen = await renderWithProviders(<CommittedTranscriptSurface />);

  await expect.element(screen.getByRole("region", { name: "Committed transcript" })).toBeVisible();
  await expect.element(screen.getByText("No committed messages yet.")).toBeVisible();
});

test("renders committed user and assistant messages from an attached baseline", async () => {
  const { store, ...screen } = await renderWithProviders(<CommittedTranscriptSurface />);

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
  expect(
    entries.map((entry) => ({
      isSecondary: entry.classList.contains("card--secondary"),
      text: entry.textContent,
    })),
  ).toStrictEqual([
    { isSecondary: true, text: "Hello surface" },
    { isSecondary: false, text: "Committed response" },
  ]);
});

test("renders an attached failed-turn error after the turn content", async () => {
  const { store, ...screen } = await renderWithProviders(<CommittedTranscriptSurface />);
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
  const { store, ...screen } = await renderWithProviders(<CommittedTranscriptSurface />);
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
  const { store, ...screen } = await renderWithProviders(<CommittedTranscriptSurface />);

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

test("updates committed message text after snapshot reattach with stable ids", async () => {
  const { store, ...screen } = await renderWithProviders(<CommittedTranscriptSurface />);

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
  const { store, ...screen } = await renderWithProviders(<CommittedTranscriptSurface />);

  store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
  const attachScrollKey = selectCommittedTranscriptScrollCommitKey(store.getState());
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
  expect(selectCommittedTranscriptScrollCommitKey(store.getState())).toBe(attachScrollKey);

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
  const { store, ...screen } = await renderWithProviders(<CommittedTranscriptSurface />);

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

test("renders manual reconnect interruption status", async () => {
  const { store, ...screen } = await renderWithProviders(<CommittedTranscriptSurface />);
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
    .toBeVisible();
});
