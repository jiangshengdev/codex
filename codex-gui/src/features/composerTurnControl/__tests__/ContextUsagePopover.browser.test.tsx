import { describe, expect, it } from "vitest";
import type { ContextUsageModel } from "../contextUsageModel";
import { renderWithProviders } from "@/utils/test-utils";
import { ContextUsagePopover } from "../ContextUsagePopover";

const knownUsage = {
  usedTokens: 149_000,
  modelContextWindow: 258_000,
  percentage: 58,
  usedTokensCompact: "149k",
  modelContextWindowCompact: "258k",
} satisfies ContextUsageModel;

const progressCircleFor = (button: Element): HTMLElement => {
  const progressCircle = button.querySelector('[role="progressbar"]');
  if (!(progressCircle instanceof HTMLElement)) {
    throw new Error("context usage button must contain a progressbar");
  }
  return progressCircle;
};

describe("ContextUsagePopover", () => {
  it("opens raw English context usage details with a pointer click", async () => {
    const screen = await renderWithProviders(<ContextUsagePopover usage={knownUsage} />);
    const trigger = screen.getByRole("button", {
      name: "Context usage details, 58% used, 149k of 258k tokens",
      exact: true,
    });

    await expect.element(trigger).toBeVisible();
    await expect.element(trigger).toHaveTextContent("149k");
    await trigger.click();

    const dialog = screen.getByRole("dialog", { name: "Context usage", exact: true });
    await expect.element(dialog).toBeVisible();
    await expect.element(dialog.getByText("58% used", { exact: true })).toBeVisible();
    await expect
      .element(dialog.getByText("149k tokens used of 258k", { exact: true }))
      .toBeVisible();
    expect(dialog.element().textContent).not.toContain("remaining");
  });

  it.each([
    ["Enter", "{Enter}"],
    ["Space", " "],
  ] as const)("opens with %s", async (_keyName, key) => {
    const screen = await renderWithProviders(<ContextUsagePopover usage={knownUsage} />);
    const trigger = screen.getByRole("button", {
      name: "Context usage details, 58% used, 149k of 258k tokens",
      exact: true,
    });

    await expect.element(trigger).toBeVisible();
    trigger.element().focus();
    await screen.user.keyboard(key);

    await expect
      .element(screen.getByRole("dialog", { name: "Context usage", exact: true }))
      .toBeVisible();
  });

  it("renders unknown capacity as indeterminate without inventing zero percent", async () => {
    const usage = {
      usedTokens: 149_000,
      modelContextWindow: null,
      percentage: null,
      usedTokensCompact: "149k",
      modelContextWindowCompact: null,
    } satisfies ContextUsageModel;
    const screen = await renderWithProviders(<ContextUsagePopover usage={usage} />);
    const trigger = screen.getByRole("button", {
      name: "Context usage details, 149k tokens used, context window capacity unknown",
      exact: true,
    });
    await expect.element(trigger).toBeVisible();
    const progressCircle = progressCircleFor(trigger.element());

    expect(progressCircle.hasAttribute("aria-valuenow")).toBe(false);
    await trigger.click();

    const dialog = screen.getByRole("dialog", { name: "Context usage", exact: true });
    await expect
      .element(
        dialog.getByText("149k tokens used; context window capacity unknown", { exact: true }),
      )
      .toBeVisible();
    expect(dialog.element().textContent).not.toContain("0%");
  });

  it("shows clamped percentage while retaining raw over-window token values", async () => {
    const usage = {
      usedTokens: 300_000,
      modelContextWindow: 200_000,
      percentage: 100,
      usedTokensCompact: "300k",
      modelContextWindowCompact: "200k",
    } satisfies ContextUsageModel;
    const screen = await renderWithProviders(<ContextUsagePopover usage={usage} />);
    const trigger = screen.getByRole("button", {
      name: "Context usage details, 100% used, 300k of 200k tokens",
      exact: true,
    });

    await trigger.click();

    const dialog = screen.getByRole("dialog", { name: "Context usage", exact: true });
    await expect.element(dialog.getByText("100% used", { exact: true })).toBeVisible();
    await expect
      .element(dialog.getByText("300k tokens used of 200k", { exact: true }))
      .toBeVisible();
  });

  it("localizes the button and details in Simplified Chinese", async () => {
    const screen = await renderWithProviders(<ContextUsagePopover usage={knownUsage} />, {
      locale: "zh-CN",
    });
    const trigger = screen.getByRole("button", {
      name: "上下文用量详情，已用 58%，149k / 258k",
      exact: true,
    });

    await expect.element(trigger).toBeVisible();
    await trigger.click();

    const dialog = screen.getByRole("dialog", { name: "上下文用量", exact: true });
    await expect.element(dialog.getByText("58% 已用", { exact: true })).toBeVisible();
    await expect
      .element(dialog.getByText("已用 149k tokens，共 258k", { exact: true }))
      .toBeVisible();
  });

  it("keeps high usage neutral and exposes no second accessible progressbar", async () => {
    const usage = {
      ...knownUsage,
      usedTokens: 255_000,
      percentage: 99,
      usedTokensCompact: "255k",
    } satisfies ContextUsageModel;
    const screen = await renderWithProviders(<ContextUsagePopover usage={usage} />);
    const trigger = screen.getByRole("button", {
      name: "Context usage details, 99% used, 255k of 258k tokens",
      exact: true,
    });
    await expect.element(trigger).toBeVisible();
    const progressCircle = progressCircleFor(trigger.element());
    const hiddenPresentation = progressCircle.closest('[aria-hidden="true"]');
    if (hiddenPresentation == null) {
      throw new Error("context usage progressbar must have a hidden ancestor");
    }

    expect(hiddenPresentation.getAttribute("aria-hidden")).toBe("true");
    await expect.element(screen.getByRole("progressbar")).not.toBeInTheDocument();

    await trigger.click();
    const dialog = screen.getByRole("dialog", { name: "Context usage", exact: true });
    await expect.element(dialog).toBeVisible();
    expect(dialog.element().textContent).not.toMatch(/warning|danger|auto-compact/i);
  });
});
