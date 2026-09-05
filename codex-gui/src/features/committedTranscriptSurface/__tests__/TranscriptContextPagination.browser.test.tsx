import { expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import { makeStore } from "@/app/store";
import { activeThreadReadModelTransitionApplied } from "@/features/activeThreadSession/activeThreadSessionReadModel";
import type {
  ActiveThreadProjectionAcceptedEvent,
  ActiveThreadProjectionReadModelFact,
} from "@/features/activeThreadSession/activeThreadProjectionFacts";
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
import { TranscriptContextPagination } from "../TranscriptContextPagination";

let sessionRevision = 0;
const readModelAction = (...facts: ActiveThreadProjectionReadModelFact[]) =>
  activeThreadReadModelTransitionApplied({ sessionRevision: ++sessionRevision, facts });
const threadRuntimeAttached = (
  response: Extract<ActiveThreadProjectionReadModelFact, { type: "baselineAttached" }>["response"],
) => readModelAction({ type: "baselineAttached", response });
const threadRuntimeEventBuffered = (payload: ActiveThreadProjectionAcceptedEvent) =>
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

test("keeps keyboard pagination focus visible in regular and constrained layouts", async () => {
  const originalViewport = { width: window.innerWidth, height: window.innerHeight };
  await page.viewport(800, 900);
  try {
    const screen = await renderWithProviders(
      <div
        data-testid="pagination-layout"
        style={{ display: "grid", gap: "16px", position: "relative", width: "min(640px, 100%)" }}
      >
        <button
          aria-label="Focus before context pagination"
          style={{ height: "1px", opacity: 0, position: "absolute", width: "1px" }}
          type="button"
        />
        <div aria-hidden="true" data-testid="pagination-before" style={{ height: "20px" }} />
        <TranscriptContextPagination onPageChange={() => undefined} page={4} totalPages={8} />
        <div aria-hidden="true" data-testid="pagination-after" style={{ height: "20px" }} />
        <button
          aria-label="Focus after context pagination"
          style={{ height: "1px", opacity: 0, position: "absolute", width: "1px" }}
          type="button"
        />
      </div>,
    );

    const layout = screen.getByTestId("pagination-layout").element() as HTMLElement;
    const focusBefore = screen.getByRole("button", {
      name: "Focus before context pagination",
    });
    const focusAfter = screen.getByRole("button", {
      name: "Focus after context pagination",
    });
    const pagination = screen.getByRole("navigation", { name: "Transcript context pages" });
    const previous = pagination.getByRole("button", { name: "Previous context page" });
    const firstPage = pagination.getByRole("button", { name: "Context page 1" });
    const next = pagination.getByRole("button", { name: "Next context page" });
    const paginationElement = pagination.element() as HTMLElement;
    const scrollport = paginationElement.parentElement;
    if (scrollport == null) {
      throw new Error("Expected pagination scrollport");
    }
    const unfocusedShadows = new Map(
      [previous, firstPage, next].map((control) => [
        control.element(),
        getComputedStyle(control.element()).boxShadow,
      ]),
    );
    const unfocusedOutlines = new Map(
      [previous, firstPage, next].map((control) => [
        control.element(),
        getComputedStyle(control.element()).outline,
      ]),
    );
    const expectFocusedClearance = async (control: HTMLElement) => {
      await expect
        .poll(async () => {
          const before = getComputedStyle(control).boxShadow;
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() =>
              requestAnimationFrame(() => {
                resolve();
              }),
            ),
          );
          return (
            control
              .getAnimations({ subtree: true })
              .every((animation) => animation.playState !== "running" && !animation.pending) &&
            getComputedStyle(control).boxShadow === before
          );
        })
        .toBe(true);
      const controlBounds = control.getBoundingClientRect();
      const style = getComputedStyle(control);
      const context = document.createElement("canvas").getContext("2d");
      if (context == null) throw new Error("Expected canvas color measurement");
      const pixels = (color: string) => {
        context.clearRect(0, 0, 1, 1);
        context.fillStyle = color;
        context.fillRect(0, 0, 1, 1);
        return context.getImageData(0, 0, 1, 1).data;
      };
      let backdrop: Element | null = scrollport;
      let background = pixels("white");
      while (backdrop != null) {
        const candidate = pixels(getComputedStyle(backdrop).backgroundColor);
        if (candidate[3] === 255) {
          background = candidate;
          break;
        }
        backdrop = backdrop.parentElement;
      }
      const visibleColor = (color: string) => {
        const actual = pixels(color);
        return (
          (actual[3] ?? 0) > 0 &&
          actual.some((channel, index) => index < 3 && channel !== background[index])
        );
      };
      const shadowOutsets = style.boxShadow.split(/,(?![^()]*\))/).flatMap((shadow) => {
        if (
          unfocusedShadows
            .get(control)
            ?.split(/,(?![^()]*\))/)
            .some((before) => before.trim() === shadow.trim())
        )
          return [];
        const color = /(?:rgba?|[a-z]+)\([^)]*\)/.exec(shadow)?.[0];
        const lengths = shadow
          .replace(/(?:rgba?|[a-z]+)\([^)]*\)/g, "")
          .match(/-?[\d.]+px/g)
          ?.map(Number.parseFloat);
        if (
          shadow.includes("inset") ||
          color == null ||
          !visibleColor(color) ||
          lengths == null ||
          lengths.length < 4
        )
          return [];
        const [x = 0, y = 0, blur = 0, spread = 0] = lengths;
        return [Math.max(Math.abs(x), Math.abs(y)) + blur + spread];
      });
      const outlineOutset =
        style.outline !== unfocusedOutlines.get(control) &&
        style.outlineStyle !== "none" &&
        visibleColor(style.outlineColor)
          ? Number.parseFloat(style.outlineWidth) + Number.parseFloat(style.outlineOffset)
          : 0;
      const outset = Math.max(0, outlineOutset, ...shadowOutsets);
      expect(outset).toBeGreaterThan(0);
      expect.soft(control.matches(":focus-visible")).toBe(true);
      expect(controlBounds.top - outset).toBeGreaterThanOrEqual(0);
      expect(controlBounds.left - outset).toBeGreaterThanOrEqual(0);
      expect(controlBounds.bottom + outset).toBeLessThanOrEqual(window.innerHeight);
      expect(controlBounds.right + outset).toBeLessThanOrEqual(window.innerWidth);
      const clippingClearances: number[] = [];
      for (
        let ancestor = control.parentElement;
        ancestor != null;
        ancestor = ancestor.parentElement
      ) {
        const ancestorStyle = getComputedStyle(ancestor);
        const bounds = ancestor.getBoundingClientRect();
        if (ancestorStyle.overflowX !== "visible") {
          clippingClearances.push(
            controlBounds.left - outset - bounds.left - ancestor.clientLeft,
            bounds.left + ancestor.clientLeft + ancestor.clientWidth - controlBounds.right - outset,
          );
        }
        if (ancestorStyle.overflowY !== "visible") {
          clippingClearances.push(
            controlBounds.top - outset - bounds.top - ancestor.clientTop,
            bounds.top + ancestor.clientTop + ancestor.clientHeight - controlBounds.bottom - outset,
          );
        }
      }
      expect(clippingClearances.every((clearance) => clearance >= 0)).toBe(true);
    };
    const focusPreviousWithKeyboard = async () => {
      (focusBefore.element() as HTMLElement).focus();
      await userEvent.keyboard("{ArrowRight}");
      await userEvent.tab();
      if (document.activeElement === scrollport) {
        await userEvent.tab();
      }
      await expect.element(previous).toHaveFocus();
    };
    const focusNextWithKeyboard = async () => {
      (focusAfter.element() as HTMLElement).focus();
      await userEvent.keyboard("{ArrowLeft}");
      await userEvent.tab({ shift: true });
      if (document.activeElement === scrollport) {
        await userEvent.tab({ shift: true });
      }
      await expect.element(next).toHaveFocus();
    };

    expect.soft(scrollport.scrollWidth).toBe(scrollport.clientWidth);

    await focusPreviousWithKeyboard();
    await expectFocusedClearance(previous.element() as HTMLElement);
    await userEvent.tab();
    await expect.element(firstPage).toHaveFocus();
    await expectFocusedClearance(firstPage.element() as HTMLElement);
    await focusNextWithKeyboard();
    await expectFocusedClearance(next.element() as HTMLElement);

    layout.style.width = "240px";
    expect.soft(scrollport.scrollWidth).toBeGreaterThan(scrollport.clientWidth);

    scrollport.scrollLeft = 0;
    await focusPreviousWithKeyboard();
    expect.soft(scrollport.scrollLeft).toBe(0);
    await expectFocusedClearance(previous.element() as HTMLElement);
    await userEvent.tab();
    await expect.element(firstPage).toHaveFocus();
    await expectFocusedClearance(firstPage.element() as HTMLElement);

    scrollport.scrollLeft = scrollport.scrollWidth;
    await focusNextWithKeyboard();
    expect.soft(scrollport.scrollLeft).toBe(scrollport.scrollWidth - scrollport.clientWidth);
    await expectFocusedClearance(next.element() as HTMLElement);
  } finally {
    await page.viewport(originalViewport.width, originalViewport.height);
  }
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

  const contextBoundary = screen.getByRole("separator", { name: "上下文已压缩" });
  const contextBoundaryLabel = screen.getByText("上下文已压缩", { exact: true });
  await expect.element(contextBoundary).toBeVisible();
  await expect.element(contextBoundaryLabel).toBeVisible();
  expect(contextBoundaryLabel.elements()).toHaveLength(1);
});
