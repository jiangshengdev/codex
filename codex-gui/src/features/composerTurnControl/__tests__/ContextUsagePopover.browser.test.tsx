import { describe, expect, it, vi } from "vitest";
import type { ActiveThreadCompactionView } from "@/features/activeThreadSession/activeThreadSessionContracts";
import { renderWithProviders } from "@/utils/test-utils";
import { ContextUsagePopover } from "../ContextUsagePopover";
import type { ContextUsageModel } from "../contextUsageModel";

const knownUsage = {
  usedTokens: 149_000,
  modelContextWindow: 258_000,
  percentage: 58,
  usedTokensCompact: "149k",
  modelContextWindowCompact: "258k",
} satisfies ContextUsageModel;

const idleCompaction = {
  phase: "idle",
  canRequest: true,
  startFailure: null,
} satisfies ActiveThreadCompactionView;

const renderPopover = (
  usage: ContextUsageModel | null,
  compaction: ActiveThreadCompactionView = idleCompaction,
  onRequestCompaction = vi.fn<() => void>(),
  locale: "en" | "zh-CN" = "en",
) =>
  renderWithProviders(
    <ContextUsagePopover
      compaction={compaction}
      onRequestCompaction={onRequestCompaction}
      usage={usage}
    />,
    { locale },
  );

const progressCircleFor = (button: Element): HTMLElement => {
  const progressCircle = button.querySelector('[role="progressbar"]');
  if (!(progressCircle instanceof HTMLElement)) {
    throw new Error("context usage button must contain a progressbar");
  }
  return progressCircle;
};

describe("ContextUsagePopover", () => {
  it("opens raw English context usage details with a pointer click", async () => {
    const screen = await renderPopover(knownUsage);
    const trigger = screen.getByRole("button", {
      name: "Context usage details, 58% used, 149k of 258k tokens",
      exact: true,
    });

    await expect.element(trigger).toBeVisible();
    expect(trigger.element().textContent).toBe("");
    expect(trigger.element().textContent).not.toMatch(/149k|58%/);
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
    const screen = await renderPopover(knownUsage);
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

  it.each([
    ["usage is unavailable", null],
    [
      "context capacity is unavailable",
      {
        usedTokens: 32_000,
        modelContextWindow: null,
        percentage: null,
        usedTokensCompact: "32k",
        modelContextWindowCompact: null,
      } satisfies ContextUsageModel,
    ],
  ])("does not render when percentage data is unavailable because $0", async (_caseName, usage) => {
    const screen = await renderPopover(usage);

    expect(screen.container).toBeEmptyDOMElement();
    await expect.element(screen.getByRole("button")).not.toBeInTheDocument();
  });

  it("shows clamped percentage while retaining raw over-window token values", async () => {
    const usage = {
      usedTokens: 300_000,
      modelContextWindow: 200_000,
      percentage: 100,
      usedTokensCompact: "300k",
      modelContextWindowCompact: "200k",
    } satisfies ContextUsageModel;
    const screen = await renderPopover(usage);
    const trigger = screen.getByRole("button", {
      name: "Context usage details, 100% used, 300k of 200k tokens",
      exact: true,
    });

    expect(trigger.element().textContent).toBe("");
    expect(trigger.element().textContent).not.toMatch(/300k|100%/);
    await trigger.click();

    const dialog = screen.getByRole("dialog", { name: "Context usage", exact: true });
    await expect.element(dialog.getByText("100% used", { exact: true })).toBeVisible();
    await expect
      .element(dialog.getByText("300k tokens used of 200k", { exact: true }))
      .toBeVisible();
  });

  it("localizes the button and details in Simplified Chinese", async () => {
    const screen = await renderPopover(knownUsage, idleCompaction, vi.fn<() => void>(), "zh-CN");
    const trigger = screen.getByRole("button", {
      name: "上下文用量详情，已用 58%，149k / 258k",
      exact: true,
    });

    await expect.element(trigger).toBeVisible();
    expect(trigger.element().textContent).toBe("");
    expect(trigger.element().textContent).not.toMatch(/149k|58%/);
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
    const screen = await renderPopover(usage);
    const trigger = screen.getByRole("button", {
      name: "Context usage details, 99% used, 255k of 258k tokens",
      exact: true,
    });
    await expect.element(trigger).toBeVisible();
    expect(trigger.element().textContent).toBe("");
    expect(trigger.element().textContent).not.toMatch(/255k|99%/);
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

  it.each([
    {
      phase: "requestPending",
      canRequest: false,
      startFailure: null,
    },
    {
      phase: "running",
      canRequest: false,
      startFailure: null,
    },
  ] satisfies ActiveThreadCompactionView[])(
    "keeps the trigger available and disables the action while $phase",
    async (compaction) => {
      const screen = await renderPopover(knownUsage, compaction);
      const trigger = screen.getByRole("button", {
        name: "Context compression in progress",
        exact: true,
      });

      await expect.element(trigger).toBeEnabled();
      expect(trigger.element().textContent).toBe("");
      await trigger.click();

      const dialog = screen.getByRole("dialog", { name: "Context usage", exact: true });
      const action = dialog.getByRole("button", { name: "Compressing", exact: true });
      await expect.element(action).toBeDisabled();
      await expect.element(action).toHaveAttribute("data-pending");
    },
  );

  it("announces a definite start failure without exposing transport detail", async () => {
    const screen = await renderPopover(knownUsage, {
      phase: "idle",
      canRequest: true,
      startFailure: "private transport detail",
    });

    await screen
      .getByRole("button", {
        name: "Context usage details, 58% used, 149k of 258k tokens",
        exact: true,
      })
      .click();

    const dialog = screen.getByRole("dialog", { name: "Context usage", exact: true });
    await expect
      .element(
        dialog.getByRole("alert").getByText("Context compression could not be started.", {
          exact: true,
        }),
      )
      .toBeVisible();
    expect(dialog.element().textContent).not.toContain("private transport detail");
  });
});
