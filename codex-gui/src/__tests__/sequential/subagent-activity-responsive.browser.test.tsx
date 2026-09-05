import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { activeThreadReadModelTransitionApplied } from "@/features/activeThreadSession/activeThreadSessionReadModel";
import type { ActiveThreadProjectionReadModelFact } from "@/features/activeThreadSession/activeThreadProjectionFacts";
import {
  attachWithTurns,
  baseTurn,
  subAgentActivity,
} from "@/features/projection/__tests__/projectionTestBuilders";
import { attachBaseline } from "@/features/projection/__tests__/projectionFixtures";
import { CommittedTranscriptSurface } from "@/features/committedTranscriptSurface/CommittedTranscriptSurface";
import { renderWithProviders } from "@/utils/test-utils";

let sessionRevision = 0;
const threadRuntimeAttached = (
  response: Extract<ActiveThreadProjectionReadModelFact, { type: "baselineAttached" }>["response"],
) =>
  activeThreadReadModelTransitionApplied({
    sessionRevision: ++sessionRevision,
    facts: [{ type: "baselineAttached", response }],
  });

const fitsWithinOwnWidth = (element: Element): boolean =>
  element.scrollWidth <= element.clientWidth + 1;

test("keeps a fixed bounded set of sub-agent chips responsive", async () => {
  const originalViewport = { height: window.innerHeight, width: window.innerWidth };
  const longLeaf = `x${"y".repeat(319)}`;
  const longLabel = `X${"y".repeat(319)}`;
  let unmount: (() => Promise<void>) | null = null;

  try {
    await page.viewport(390, 900);
    const { store, ...screen } = await renderWithProviders(<CommittedTranscriptSurface />);
    unmount = screen.unmount;
    store.dispatch(
      threadRuntimeAttached(
        attachWithTurns(attachBaseline, [
          baseTurn("turn-responsive-subagent-activity", [
            subAgentActivity(
              "activity-responsive-desktop-context",
              "started",
              "/root/desktop_context_usage",
              { agentThreadId: "thread-responsive-desktop-context" },
            ),
            subAgentActivity(
              "activity-responsive-gui-composer",
              "started",
              "/root/gui_composer_surface",
              { agentThreadId: "thread-responsive-gui-composer" },
            ),
            subAgentActivity("activity-responsive-long-leaf", "started", `/root/${longLeaf}`, {
              agentThreadId: "thread-responsive-long-leaf",
            }),
            subAgentActivity("activity-responsive-omitted", "started", "/root/gui_usage_ingress", {
              agentThreadId: "thread-responsive-omitted",
            }),
          ]),
        ]),
      ),
    );

    const transcript = screen.getByRole("region", { name: "Committed transcript" });
    const activity = screen.getByRole("article", { name: /^Started/ });
    const firstLabel = screen.getByText("Desktop context usage", { exact: true });
    const secondLabel = screen.getByText("Gui composer surface", { exact: true });
    const longTaskLabel = screen.getByText(longLabel, { exact: true });
    const hiddenFourthLabel = screen.getByText("Gui usage ingress", { exact: true });

    await expect.element(transcript).toBeVisible();
    await expect.element(activity).toBeVisible();
    await expect.element(firstLabel).toBeVisible();
    await expect.element(secondLabel).toBeVisible();
    await expect.element(longTaskLabel).toBeVisible();
    await expect.element(activity).toHaveAccessibleName(/and 1 more sub-agent/);
    await expect.element(hiddenFourthLabel).not.toBeInTheDocument();

    const assertResponsiveLayout = async () => {
      await expect
        .poll(() => {
          const chipRoots = Array.from(
            activity.element().querySelectorAll<HTMLElement>('[data-slot="chip"]'),
          );
          const chipLabels = Array.from(
            activity.element().querySelectorAll<HTMLElement>('[data-slot="chip-label"]'),
          );
          const chipContainer = chipRoots[0]?.parentElement;
          const longLabelElement = longTaskLabel.element();
          if (
            chipRoots.length !== 3 ||
            chipLabels.length !== 3 ||
            !(chipContainer instanceof HTMLElement)
          ) {
            return null;
          }

          const longLabelStyle = window.getComputedStyle(longLabelElement);
          return {
            activityFits: fitsWithinOwnWidth(activity.element()),
            chipContainerFlexWrap: window.getComputedStyle(chipContainer).flexWrap,
            chipCount: chipRoots.length,
            labelCount: chipLabels.length,
            longLabelIsClipped: longLabelElement.scrollWidth > longLabelElement.clientWidth,
            longLabelOverflow: longLabelStyle.overflow,
            longLabelTextOverflow: longLabelStyle.textOverflow,
            longLabelWhiteSpace: longLabelStyle.whiteSpace,
            transcriptFits: fitsWithinOwnWidth(transcript.element()),
          };
        })
        .toEqual({
          activityFits: true,
          chipContainerFlexWrap: "wrap",
          chipCount: 3,
          labelCount: 3,
          longLabelIsClipped: true,
          longLabelOverflow: "hidden",
          longLabelTextOverflow: "ellipsis",
          longLabelWhiteSpace: "nowrap",
          transcriptFits: true,
        });
      await expect.element(activity).toHaveAccessibleName(/and 1 more sub-agent/);
      await expect.element(hiddenFourthLabel).not.toBeInTheDocument();
    };

    await assertResponsiveLayout();
    await page.viewport(1440, 900);
    await assertResponsiveLayout();
  } finally {
    await unmount?.();
    await page.viewport(originalViewport.width, originalViewport.height);
  }
});
