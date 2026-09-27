import { expect, type Page, type TestInfo } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { activateProductControl, focusProductControl } from "./focusKeyboardActions";
import { observeCurrentFocus, type observeScrollBoundaryFocus } from "./focusObservation";

import {
  assertDocumentFocus,
  readDocumentPosition,
  wheelDocumentToPosition,
  type DocumentWheelInput,
} from "./focusDocumentBoundaries";

type ResetStory = () => Promise<void>;
type SharedBoundary = Awaited<ReturnType<typeof observeScrollBoundaryFocus>>[number];
type HistoryState = "long-ready" | "long-failure" | "fork-pending";
export type DocumentBoundary = Pick<
  SharedBoundary,
  "axis" | "endpoint" | "target" | "status" | "reason" | "observations" | "expectedPosition"
> & {
  state: HistoryState;
  scrollInput?: DocumentWheelInput;
  beforeInput?: Awaited<ReturnType<typeof readDocumentPosition>>;
  beforeCapture?: Awaited<ReturnType<typeof readDocumentPosition>>;
  afterCapture?: Awaited<ReturnType<typeof readDocumentPosition>>;
};

/**
 * Only these text-only History fixtures use this document boundary route.
 * resetStory must reload the same fixture, await readiness, and reapply the
 * current container width. Each endpoint starts fresh, including failure setup.
 * The shared scroll-boundary collector's record contract is reused, while its
 * programmatic positioning path is deliberately not called for the document.
 * These fixtures contain static text and fixed controls. Wheel input prepares
 * document edges while the control retains focus reached through real Tab keys.
 */
export async function observeHistoryDocumentBoundaries(
  page: Page,
  testInfo: TestInfo,
  storyId: string,
  resetStory: ResetStory,
): Promise<void> {
  if (
    storyId !== "history-detail--long-content" &&
    storyId !== "history-detail--long-content-continuation-failure" &&
    storyId !== "history-fork--pending"
  )
    return;

  const prefix = `${storyId}-document-boundaries`;
  const states: readonly HistoryState[] = storyId.endsWith("-continuation-failure")
    ? ["long-ready", "long-failure"]
    : storyId === "history-fork--pending"
      ? ["fork-pending"]
      : ["long-ready"];
  const boundaries: DocumentBoundary[] = [];
  const main = page.getByRole("main");
  const evidence = main.getByText("Read-only history evidence", { exact: true });
  const continuation = page.getByRole("button", { name: "Continue this task", exact: true });
  const failure = page.getByRole("alert").filter({ hasText: "The task could not be resumed." });

  const assertState = async (state: HistoryState) => {
    await expect(evidence).toHaveCount(1);
    await expect(main).toContainText(
      "Long investigation paragraph with enough context to review the previous task.",
    );
    await expect(continuation).toBeEnabled();
    await expect(page.getByRole("button", { name: "Scan with phone", exact: true })).toBeDisabled();
    if (state === "long-failure") await expect(failure).toBeVisible();
    else await expect(failure).toHaveCount(0);
    if (state === "fork-pending") {
      // The real pending snapshot hides its Fork notice; no disabled control is a focus target.
      await expect(page.getByRole("button", { name: "Open fork", exact: true })).toHaveCount(0);
      await expect(page.getByRole("combobox", { name: "Message Codex", exact: true })).toHaveCount(
        0,
      );
    }
  };

  try {
    for (const state of states) {
      for (const endpoint of ["start", "end"] as const) {
        // AppShellTopBar renders Menu first. ContinueTaskAction renders Continue
        // last, after the optional failure diagnostic and disabled QR button.
        const name = endpoint === "start" ? "Menu" : "Continue this task";
        const target = page.getByRole("button", { name, exact: true });
        const result: DocumentBoundary = {
          state,
          axis: "y",
          endpoint,
          target: { tag: "BUTTON", name },
          status: "blocked",
        };
        boundaries.push(result);
        try {
          await resetStory();
          await assertState(state === "fork-pending" ? "fork-pending" : "long-ready");
          if (state === "long-failure") {
            await activateProductControl(page, continuation);
            await assertState("long-failure");
          }
          await focusProductControl(page, target);
          result.beforeInput = await readDocumentPosition(evidence);
          const pointer = await main.evaluate((element) => {
            const bounds = element.getBoundingClientRect();
            return {
              x: Math.max(1, Math.min(innerWidth - 1, (bounds.left + bounds.right) / 2)),
              y: innerHeight / 2,
            };
          });
          result.scrollInput = { kind: "wheel", ...pointer, deltasY: [] };
          const retainedTarget = await target.elementHandle();
          try {
            await wheelDocumentToPosition(
              page,
              evidence,
              retainedTarget,
              result.scrollInput,
              endpoint === "start"
                ? 0
                : result.beforeInput.scrollHeight - result.beforeInput.clientHeight,
            );

            const assertEndpoint = async () => {
              await assertState(state);
              await expect
                .poll(
                  async () => {
                    const current = await readDocumentPosition(evidence);
                    const maximum = current.scrollHeight - current.clientHeight;
                    return (
                      current.documentFocused &&
                      current.nestedScrollports.length === 0 &&
                      maximum > 0.5 &&
                      Math.abs(current.windowY - current.scrollTop) <= 0.5 &&
                      Math.abs(current.scrollTop - (endpoint === "start" ? 0 : maximum)) <= 0.5
                    );
                  },
                  {
                    message: `Wheel input must reach the History document's ${endpoint} scroll limit`,
                  },
                )
                .toBe(true);
              await assertDocumentFocus(retainedTarget);
            };

            await assertEndpoint();
            result.beforeCapture = await readDocumentPosition(evidence);
            result.expectedPosition =
              endpoint === "start"
                ? 0
                : result.beforeCapture.scrollHeight - result.beforeCapture.clientHeight;
            const observations = await observeCurrentFocus(
              page,
              testInfo,
              `${prefix}-${state}-y-${endpoint}`,
            );
            result.observations = observations.length;
            await assertEndpoint();
            result.afterCapture = await readDocumentPosition(evidence);
            expect(
              observations.length,
              "Document endpoint has no product focus observation",
            ).toBeGreaterThan(0);
            result.status = "observed-awaiting-visual-review";
          } finally {
            await retainedTarget.dispose();
          }
        } catch (error) {
          result.reason = String(error);
          const current = await readDocumentPosition(evidence).catch(() => null);
          if (current != null) result.afterCapture = current;
        }
      }
    }
  } finally {
    const artifact = testInfo.outputPath(`${prefix}-scroll-boundaries.json`);
    await writeFile(artifact, JSON.stringify(boundaries, null, 2));
    await testInfo.attach(`${prefix}-scroll-boundaries`, {
      path: artifact,
      contentType: "application/json",
    });
  }
  expect(
    boundaries.filter((boundary) => boundary.status === "blocked"),
    "History document scroll endpoint observation was blocked",
  ).toEqual([]);
}
