import { expect, test } from "vitest";
import {
  agentMessage,
  attachWithTurns,
  baseTurn,
  inProgressTurn,
  itemCompleted,
  itemStarted,
  textInput,
  turnStarted,
  userMessage,
} from "@/features/projection/__tests__/projectionTestBuilders";
import {
  attachBaseline,
  eventItemCompleted,
  eventItemStarted,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
import {
  threadRuntimeAttached,
  threadRuntimeEventBuffered,
  threadRuntimeManualReconnectRequired,
} from "@/features/threadRuntime/threadRuntimeSlice";
import { renderWithProviders } from "@/utils/test-utils";
import { CommittedTranscriptSurface } from "../CommittedTranscriptSurface";

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
              "Use `inline code` here.",
              "",
              "```",
              "fenced code",
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
  const inlineCode = markdown.querySelector("p code");
  expect(inlineCode?.textContent).toContain("inline code");
  expect(inlineCode?.classList.contains("bg-muted")).toBe(false);
  expect(inlineCode?.classList.contains("bg-default")).toBe(true);
  expect(inlineCode?.classList.contains("text-default-700")).toBe(true);
  const fencedCode = markdown.querySelector("pre > code");
  expect(fencedCode?.textContent).toContain("fenced code");
  expect(fencedCode?.classList.contains("rounded")).toBe(false);
  expect(fencedCode?.classList.contains("px-1")).toBe(false);
  expect(fencedCode?.classList.contains("bg-default")).toBe(false);
  const fencedCodeBlock = markdown.querySelector("pre");
  expect(fencedCodeBlock?.classList.contains("bg-muted")).toBe(false);
  expect(fencedCodeBlock?.classList.contains("bg-default")).toBe(true);
  expect(fencedCodeBlock?.classList.contains("text-default-700")).toBe(true);
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

test("does not render unsafe markdown nodes as active DOM", async () => {
  const { store, ...screen } = await renderWithProviders(<CommittedTranscriptSurface />);

  store.dispatch(
    threadRuntimeAttached(
      attachWithTurns(attachBaseline, [
        baseTurn("turn-markdown-safety", [
          agentMessage(
            "agent-markdown-safety",
            [
              "Before <strong>raw html</strong> after.",
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
  expect(document.querySelector(".committed-transcript-entry-markdown img")).toBeNull();
  expect(document.querySelector(".committed-transcript-entry-markdown a")).toBeNull();
  await expect.element(screen.getByText("blocked link")).toBeVisible();
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

test("renders live completed items without rendering started items", async () => {
  const { store, ...screen } = await renderWithProviders(<CommittedTranscriptSurface />);

  store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
  store.dispatch(
    threadRuntimeEventBuffered(
      turnStarted(eventTurnStarted, "commit-turn-live", inProgressTurn("turn-live")),
    ),
  );
  store.dispatch(
    threadRuntimeEventBuffered(
      itemStarted(
        eventItemStarted,
        "commit-started",
        "turn-live",
        agentMessage("agent-started", "Draft answer"),
      ),
    ),
  );

  await expect.element(screen.getByText("Draft answer")).not.toBeInTheDocument();
  await expect.element(screen.getByText("No committed messages yet.")).toBeVisible();
  await expect
    .element(screen.getByRole("article", { name: "Turn turn-live" }))
    .not.toBeInTheDocument();

  store.dispatch(
    threadRuntimeEventBuffered(
      itemCompleted(
        eventItemCompleted,
        "commit-completed",
        "turn-live",
        agentMessage("agent-live", "Final answer"),
      ),
    ),
  );

  await expect.element(screen.getByRole("article", { name: "Turn turn-live" })).toBeVisible();
  await expect.element(screen.getByText("Final answer")).toBeVisible();
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

test("renders temporary content forced open until a final answer exists", async () => {
  const { store, ...screen } = await renderWithProviders(<CommittedTranscriptSurface />);

  store.dispatch(
    threadRuntimeAttached(
      attachWithTurns(attachBaseline, [
        baseTurn("turn-temporary-open", [
          agentMessage("agent-commentary-open", "Working before final", "commentary"),
        ]),
      ]),
    ),
  );

  await expect.element(screen.getByText("Working before final")).toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "Intermediate updates · 1 item" }))
    .toBeDisabled();
});

test("renders temporary content collapsed beside the final answer once final answer exists", async () => {
  const { store, ...screen } = await renderWithProviders(<CommittedTranscriptSurface />);

  store.dispatch(
    threadRuntimeAttached(
      attachWithTurns(attachBaseline, [
        baseTurn("turn-temporary-collapsed", [
          agentMessage("agent-commentary-collapsed", "Hidden working note", "commentary"),
          agentMessage("agent-final-collapsed", "Visible final answer", "final_answer"),
        ]),
      ]),
    ),
  );

  await expect.element(screen.getByText("Visible final answer")).toBeVisible();
  await expect.element(screen.getByText("Hidden working note")).not.toBeInTheDocument();

  const trigger = screen.getByRole("button", { name: "Intermediate updates · 1 item" });
  await expect.element(trigger).toBeEnabled();
  await trigger.click();

  await expect.element(screen.getByText("Hidden working note")).toBeVisible();
});

test("does not mount collapsed temporary markdown before expansion", async () => {
  const { store, ...screen } = await renderWithProviders(<CommittedTranscriptSurface />);

  store.dispatch(
    threadRuntimeAttached(
      attachWithTurns(attachBaseline, [
        baseTurn("turn-collapsed-markdown", [
          agentMessage("agent-collapsed-markdown", "# Hidden markdown heading", "commentary"),
          agentMessage("agent-collapsed-markdown-final", "Visible final answer", "final_answer"),
        ]),
      ]),
    ),
  );

  await expect.element(screen.getByText("Visible final answer")).toBeVisible();
  await expect
    .element(screen.getByRole("heading", { name: "Hidden markdown heading" }))
    .not.toBeInTheDocument();
  await expect.element(screen.getByText("# Hidden markdown heading")).not.toBeInTheDocument();

  const trigger = screen.getByRole("button", { name: "Intermediate updates · 1 item" });
  await trigger.click();

  await expect
    .element(screen.getByRole("heading", { name: "Hidden markdown heading" }))
    .toBeVisible();
});

test("renders one collapsed temporary module for a turn split across chunks", async () => {
  const { store, ...screen } = await renderWithProviders(<CommittedTranscriptSurface />);
  const commentaryMessages = Array.from({ length: 101 }, (_, index) =>
    agentMessage(
      `agent-cross-chunk-commentary-${String(index)}`,
      `Cross chunk working note ${String(index)}`,
      "commentary",
    ),
  );

  store.dispatch(
    threadRuntimeAttached(
      attachWithTurns(attachBaseline, [
        baseTurn("turn-temporary-cross-chunk", [
          ...commentaryMessages,
          agentMessage(
            "agent-cross-chunk-final",
            "Visible final answer after chunk boundary",
            "final_answer",
          ),
        ]),
      ]),
    ),
  );

  await expect.element(screen.getByText("Visible final answer after chunk boundary")).toBeVisible();
  await expect.element(screen.getByText("Cross chunk working note 0")).not.toBeInTheDocument();

  const triggers = Array.from(
    document.querySelectorAll<HTMLButtonElement>(".committed-transcript-temporary-trigger"),
  );
  expect(triggers.map((trigger) => trigger.textContent)).toStrictEqual([
    "Intermediate updates · 101 items",
  ]);
  expect(triggers.map((trigger) => trigger.classList.contains("button--outline"))).toStrictEqual([
    true,
  ]);
  expect(triggers.map((trigger) => trigger.classList.contains("button--secondary"))).toStrictEqual([
    false,
  ]);

  const trigger = screen.getByRole("button", { name: "Intermediate updates · 101 items" });
  await expect.element(trigger).toBeEnabled();
  await trigger.click();

  await expect.element(screen.getByText("Cross chunk working note 0")).toBeVisible();
});

test("renders later user messages inside the intermediate disclosure", async () => {
  const { store, ...screen } = await renderWithProviders(<CommittedTranscriptSurface />);

  store.dispatch(
    threadRuntimeAttached(
      attachWithTurns(attachBaseline, [
        baseTurn("turn-middle-user", [
          userMessage("user-leading-middle", [textInput("Initial prompt")]),
          agentMessage("agent-middle-user-note", "Working note", "commentary"),
          userMessage("user-middle-follow-up", [textInput("Follow-up input")]),
          agentMessage("agent-middle-user-final", "Final response", "final_answer"),
        ]),
      ]),
    ),
  );

  await expect.element(screen.getByText("Initial prompt")).toBeVisible();
  await expect.element(screen.getByText("Final response")).toBeVisible();
  await expect.element(screen.getByText("Working note")).not.toBeInTheDocument();
  await expect.element(screen.getByText("Follow-up input")).not.toBeInTheDocument();

  const trigger = screen.getByRole("button", { name: "Intermediate updates · 2 items" });
  await expect.element(trigger).toBeEnabled();
  await trigger.click();

  await expect.element(screen.getByText("Working note")).toBeVisible();
  await expect.element(screen.getByText("Follow-up input")).toBeVisible();
});

test("renders multiple final assistant messages outside the intermediate disclosure", async () => {
  const { store, ...screen } = await renderWithProviders(<CommittedTranscriptSurface />);

  store.dispatch(
    threadRuntimeAttached(
      attachWithTurns(attachBaseline, [
        baseTurn("turn-multi-final-surface", [
          userMessage("user-multi-final-surface", [textInput("Prompt")]),
          agentMessage("agent-final-surface-one", "First final", "final_answer"),
          agentMessage("agent-final-surface-two", "Second final", "final_answer"),
        ]),
      ]),
    ),
  );

  await expect.element(screen.getByText("Prompt")).toBeVisible();
  await expect.element(screen.getByText("First final")).toBeVisible();
  await expect.element(screen.getByText("Second final")).toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: /Intermediate updates/ }))
    .not.toBeInTheDocument();
});

test("renders legacy assistant messages inside the intermediate disclosure", async () => {
  const { store, ...screen } = await renderWithProviders(<CommittedTranscriptSurface />);

  store.dispatch(
    threadRuntimeAttached(
      attachWithTurns(attachBaseline, [
        baseTurn("turn-legacy-phase", [
          agentMessage("agent-legacy", "Legacy assistant text", null),
          agentMessage("agent-final-legacy", "Final after legacy", "final_answer"),
        ]),
      ]),
    ),
  );

  await expect.element(screen.getByText("Final after legacy")).toBeVisible();
  await expect.element(screen.getByText("Legacy assistant text")).not.toBeInTheDocument();

  const trigger = screen.getByRole("button", { name: "Intermediate updates · 1 item" });
  await expect.element(trigger).toBeEnabled();
  await trigger.click();

  await expect.element(screen.getByText("Legacy assistant text")).toBeVisible();
});
