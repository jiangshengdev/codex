import { expect, test } from "vitest";
import { makeStore } from "@/app/store";
import { activeThreadReadModelTransitionApplied } from "@/features/activeThreadSession/activeThreadSessionReadModel";
import type {
  ActiveThreadProjectionAcceptedQueueFact,
  ActiveThreadProjectionReadModelFact,
} from "@/features/activeThreadSession/activeThreadProjection";
import {
  attachWithTurns,
  baseTurn,
  contextCompaction,
  contextCompactionCompleted,
  failedTurn,
  inProgressTurn,
  textInput,
  turnCompleted,
  userMessage,
} from "@/features/projection/__tests__/projectionTestBuilders";
import {
  attachBaseline,
  attachReplacement,
  eventItemCompleted,
  eventTurnCompleted,
} from "@/features/projection/__tests__/projectionFixtures";
import { buildTranscriptStateFromTurns } from "@/features/transcriptState/transcriptStateImplementation";
import { renderWithProviders } from "@/utils/test-utils";
import {
  CommittedTranscriptSurface,
  ReadOnlyCommittedTranscriptSurface,
} from "../CommittedTranscriptSurface";

let sessionRevision = 0;
const readModelAction = (...facts: ActiveThreadProjectionReadModelFact[]) =>
  activeThreadReadModelTransitionApplied({ sessionRevision: ++sessionRevision, facts });
const threadRuntimeAttached = (
  response: Extract<ActiveThreadProjectionReadModelFact, { type: "baselineAttached" }>["response"],
) => readModelAction({ type: "baselineAttached", response });
const threadRuntimeEventBuffered = (payload: ActiveThreadProjectionAcceptedQueueFact) =>
  readModelAction({ type: "eventAccepted", payload });

const boundaryOnlyFailure = {
  message: "The request failed after context compaction",
  codexErrorInfo: null,
  additionalDetails: null,
  misalignment: null,
} satisfies NonNullable<ReturnType<typeof failedTurn>["error"]>;

const attachedContextPages = (pageCount: number, attach = attachBaseline) =>
  attachWithTurns(
    attach,
    Array.from({ length: pageCount }, (_, index) => {
      const page = index + 1;
      const pageText = String(page);
      const items = [
        ...(page === 1 ? [] : [contextCompaction(`compaction-${pageText}`)]),
        userMessage(`user-page-${pageText}`, [textInput(`Message on context page ${pageText}`)]),
      ];
      return baseTurn(`turn-page-${pageText}`, items);
    }),
  );

test("navigates attached context pages and unmounts the previous page", async () => {
  const { store, ...screen } = await renderWithProviders(<CommittedTranscriptSurface />);
  store.dispatch(threadRuntimeAttached(attachedContextPages(8)));

  const pagination = screen.getByRole("navigation", { name: "Transcript context pages" });
  const previous = pagination.getByRole("button", { name: "Previous context page" });
  const next = pagination.getByRole("button", { name: "Next context page" });
  const firstPage = pagination.getByRole("button", { name: "Context page 1" });
  const lastPage = pagination.getByRole("button", { name: "Context page 8" });

  await expect.element(pagination).toBeVisible();
  await expect.element(lastPage).toHaveAttribute("aria-current", "page");
  await expect.element(previous).toBeEnabled();
  await expect.element(next).toBeDisabled();
  await expect.element(screen.getByText("Message on context page 8")).toBeVisible();
  await expect.element(screen.getByText("Message on context page 1")).not.toBeInTheDocument();
  expect(pagination.element().querySelectorAll(".pagination__ellipsis")).toHaveLength(1);

  await firstPage.click();

  await expect.element(firstPage).toHaveAttribute("aria-current", "page");
  await expect.element(previous).toBeDisabled();
  await expect.element(next).toBeEnabled();
  await expect.element(screen.getByText("Message on context page 1")).toBeVisible();
  await expect.element(screen.getByText("Message on context page 8")).not.toBeInTheDocument();

  await next.click();
  await expect
    .element(pagination.getByRole("button", { name: "Context page 2" }))
    .toHaveAttribute("aria-current", "page");

  await previous.click();
  await expect.element(firstPage).toHaveAttribute("aria-current", "page");
});

test("renders an isolated read-only snapshot through the same current-page surface", async () => {
  const attach = attachedContextPages(3);
  const { store, ...liveScreen } = await renderWithProviders(<CommittedTranscriptSurface />);
  store.dispatch(threadRuntimeAttached(attach));

  const liveRegion = liveScreen.getByRole("region", { name: "Committed transcript" });
  await expect.element(liveScreen.getByText("Message on context page 3")).toBeVisible();
  const liveText = liveRegion.element().textContent;
  await liveScreen.unmount();

  const transcriptState = buildTranscriptStateFromTurns(attach.snapshot.thread.turns);
  const readOnlyScreen = await renderWithProviders(
    <ReadOnlyCommittedTranscriptSurface
      surfaceKey={attach.snapshot.thread.id}
      transcriptState={transcriptState}
    />,
    { store },
  );
  const readOnlyRegion = readOnlyScreen.getByRole("region", { name: "Committed transcript" });
  const readOnlyPagination = readOnlyScreen.getByRole("navigation", {
    name: "Transcript context pages",
  });

  await expect.element(readOnlyRegion).toHaveTextContent(liveText);
  await expect.element(readOnlyScreen.getByText("Message on context page 3")).toBeVisible();
  await expect
    .element(readOnlyScreen.getByText("Message on context page 1"))
    .not.toBeInTheDocument();

  store.dispatch(
    threadRuntimeEventBuffered({
      notification: contextCompactionCompleted(
        eventItemCompleted,
        "commit-read-only-live-ingress",
        "turn-page-3",
        "compaction-read-only-live-ingress",
      ),
      replay: "live",
    }),
  );

  await expect
    .element(readOnlyPagination.getByRole("button", { name: "Context page 3" }))
    .toHaveAttribute("aria-current", "page");
  await expect
    .element(readOnlyPagination.getByRole("button", { name: "Context page 4" }))
    .not.toBeInTheDocument();

  await readOnlyPagination.getByRole("button", { name: "Context page 1" }).click();
  await expect.element(readOnlyScreen.getByText("Message on context page 1")).toBeVisible();
  await expect
    .element(readOnlyScreen.getByText("Message on context page 3"))
    .not.toBeInTheDocument();
});

test("keeps a selected historical page while live compactions extend the followed tail", async () => {
  const { store, ...screen } = await renderWithProviders(<CommittedTranscriptSurface />);
  store.dispatch(
    threadRuntimeAttached(
      attachWithTurns(attachBaseline, [
        baseTurn("turn-history", [
          userMessage("user-history", [textInput("Historical context page")]),
        ]),
        inProgressTurn("turn-live", [
          contextCompaction("compaction-2"),
          userMessage("user-live", [textInput("Current context page")]),
        ]),
      ]),
    ),
  );

  const pagination = screen.getByRole("navigation", { name: "Transcript context pages" });
  const firstPage = pagination.getByRole("button", { name: "Context page 1" });
  await expect
    .element(pagination.getByRole("button", { name: "Context page 2" }))
    .toHaveAttribute("aria-current", "page");

  await firstPage.click();
  await expect.element(screen.getByText("Historical context page")).toBeVisible();

  store.dispatch(
    threadRuntimeEventBuffered({
      notification: contextCompactionCompleted(
        eventItemCompleted,
        "commit-compaction-3",
        "turn-live",
        "compaction-3",
      ),
      replay: "live",
    }),
  );

  await expect.element(firstPage).toHaveAttribute("aria-current", "page");
  await expect.element(screen.getByText("Historical context page")).toBeVisible();
  const thirdPage = pagination.getByRole("button", { name: "Context page 3" });
  await expect.element(thirdPage).toBeVisible();

  await thirdPage.click();
  await expect.element(thirdPage).toHaveAttribute("aria-current", "page");

  for (const page of [4, 5]) {
    const pageText = String(page);
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: contextCompactionCompleted(
          eventItemCompleted,
          `commit-compaction-${pageText}`,
          "turn-live",
          `compaction-${pageText}`,
        ),
        replay: "live",
      }),
    );

    await expect
      .element(pagination.getByRole("button", { name: `Context page ${pageText}` }))
      .toHaveAttribute("aria-current", "page");
  }

  await expect.element(screen.getByText("Context compressed")).toBeVisible();
  await expect.element(screen.getByText("No committed messages yet.")).not.toBeInTheDocument();
});

test("renders a same-turn failure on a boundary-only latest page", async () => {
  const { store, ...screen } = await renderWithProviders(<CommittedTranscriptSurface />);
  const turnId = "turn-boundary-only-failure";

  store.dispatch(
    threadRuntimeAttached(
      attachWithTurns(attachBaseline, [
        inProgressTurn(turnId, [
          userMessage("user-before-boundary-only-failure", [
            textInput("Message before failed compaction follow-up"),
          ]),
        ]),
      ]),
    ),
  );
  store.dispatch(
    threadRuntimeEventBuffered({
      notification: contextCompactionCompleted(
        eventItemCompleted,
        "commit-boundary-only-failure",
        turnId,
        "compaction-boundary-only-failure",
      ),
      replay: "live",
    }),
  );
  store.dispatch(
    threadRuntimeEventBuffered({
      notification: turnCompleted(
        eventTurnCompleted,
        "commit-turn-boundary-only-failure",
        failedTurn(turnId, boundaryOnlyFailure),
      ),
      replay: "live",
    }),
  );

  const latestPage = screen.getByRole("button", { name: "Context page 2" });
  const turn = screen.getByRole("article", { name: `Turn ${turnId}` });
  const errorAlert = turn.getByRole("alert");
  await expect.element(latestPage).toHaveAttribute("aria-current", "page");
  await expect.element(screen.getByText("Context compressed")).toBeVisible();
  await expect.element(turn.getByText("Failed", { exact: true })).toBeVisible();
  await expect.element(errorAlert.getByText("Request failed", { exact: true })).toBeVisible();
  await expect
    .element(errorAlert.getByText(boundaryOnlyFailure.message, { exact: true }))
    .toBeVisible();
  await expect
    .element(screen.getByText("Message before failed compaction follow-up"))
    .not.toBeInTheDocument();
});

test("keeps a selected historical page across a same-thread replacement attach", async () => {
  const { store, ...screen } = await renderWithProviders(<CommittedTranscriptSurface />);
  store.dispatch(threadRuntimeAttached(attachedContextPages(4)));

  const pagination = screen.getByRole("navigation", { name: "Transcript context pages" });
  const thirdPage = pagination.getByRole("button", { name: "Context page 3" });
  await thirdPage.click();
  await expect.element(thirdPage).toHaveAttribute("aria-current", "page");
  await expect.element(screen.getByText("Message on context page 3")).toBeVisible();

  store.dispatch(threadRuntimeAttached(attachedContextPages(5, attachReplacement)));

  await expect.element(thirdPage).toHaveAttribute("aria-current", "page");
  await expect.element(screen.getByText("Message on context page 3")).toBeVisible();
  await expect.element(screen.getByText("Message on context page 5")).not.toBeInTheDocument();
  await expect.element(pagination.getByRole("button", { name: "Context page 5" })).toBeVisible();

  store.dispatch(threadRuntimeAttached(attachedContextPages(2, attachReplacement)));

  const clampedPage = pagination.getByRole("button", { name: "Context page 2" });
  await expect.element(clampedPage).toHaveAttribute("aria-current", "page");
  await expect.element(screen.getByText("Message on context page 2")).toBeVisible();

  store.dispatch(
    threadRuntimeEventBuffered({
      notification: contextCompactionCompleted(
        eventItemCompleted,
        "commit-compaction-after-clamp",
        "turn-page-2",
        "compaction-after-clamp",
      ),
      replay: "live",
    }),
  );

  await expect.element(clampedPage).toHaveAttribute("aria-current", "page");
  await expect.element(screen.getByText("Message on context page 2")).toBeVisible();
  await expect.element(pagination.getByRole("button", { name: "Context page 3" })).toBeVisible();
});

test("localizes the context boundary on later pages", async () => {
  const store = makeStore();
  store.dispatch(threadRuntimeAttached(attachedContextPages(2)));

  const screen = await renderWithProviders(<CommittedTranscriptSurface />, {
    locale: "zh-CN",
    store,
  });

  await expect.element(screen.getByText("上下文已压缩", { exact: true })).toBeVisible();
  expect(screen.getByText("上下文已压缩", { exact: true }).elements()).toHaveLength(1);
});
