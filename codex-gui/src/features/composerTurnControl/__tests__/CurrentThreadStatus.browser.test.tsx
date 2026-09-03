import { expect, test } from "vitest";
import type { Thread } from "@codex-protocol/v2";
import { renderWithProviders } from "@/utils/test-utils";
import { CurrentThreadStatus } from "../CurrentThreadStatus";

const cases = [
  [null, "Unknown", "Current task status is unknown", "bg-default"],
  [{ type: "notLoaded" }, "Not loaded", "Current task is not loaded", "bg-default"],
  [{ type: "idle" }, "Idle", "Current task is idle", "bg-default"],
  [{ type: "active", activeFlags: [] }, "In progress", "Current task is in progress", "bg-accent"],
  [
    { type: "active", activeFlags: ["waitingOnApproval"] },
    "Waiting for approval",
    "Current task is waiting for approval",
    "bg-warning",
  ],
  [
    { type: "active", activeFlags: ["waitingOnUserInput"] },
    "Waiting for input",
    "Current task is waiting for input",
    "bg-warning",
  ],
  [
    { type: "active", activeFlags: ["waitingOnApproval", "waitingOnUserInput"] },
    "Waiting",
    "Current task is waiting for approval and input",
    "bg-warning",
  ],
  [{ type: "systemError" }, "Error", "Current task has a system error", "bg-danger"],
] as const satisfies readonly (readonly [Thread["status"] | null, string, string, string])[];

test.each(cases)(
  "renders the static $label status",
  async (status, label, accessibleName, color) => {
    const screen = await renderWithProviders(<CurrentThreadStatus status={status} />);
    const statusItem = screen.getByRole("status", { name: accessibleName, exact: true });
    const dot = statusItem.element().querySelector(".current-thread-status-dot");
    if (!(dot instanceof HTMLElement)) throw new Error("current thread status dot must render");

    await expect.element(statusItem).toHaveTextContent(label);
    await expect.element(statusItem).toHaveAttribute("aria-live", "polite");
    await expect.element(statusItem).toHaveClass("text-muted", "whitespace-nowrap");
    await expect.element(dot).toHaveAttribute("aria-hidden", "true");
    await expect.element(dot).toHaveClass("size-2", "shrink-0", "rounded-full", color);
    expect(statusItem.element().tabIndex).toBe(-1);
    expect(statusItem.element().className).not.toMatch(
      /(?:^|\s)(?:bg-|border|shadow|transition|animate-)/u,
    );
    expect(dot.className).not.toMatch(/(?:^|\s)(?:transition|animate-)/u);
    expect(statusItem.element().querySelector("button,[role=button],svg")).toBeNull();
  },
);

test("localizes the visible label and accessible name", async () => {
  const screen = await renderWithProviders(
    <CurrentThreadStatus status={{ type: "systemError" }} />,
    {
      locale: "zh-CN",
    },
  );

  await expect
    .element(screen.getByRole("status", { name: "当前任务发生系统错误", exact: true }))
    .toHaveTextContent("错误");
});

test("keeps focus in place when the status changes", async () => {
  const screen = await renderWithProviders(
    <div>
      <button type="button">Focus anchor</button>
      <CurrentThreadStatus status={{ type: "idle" }} />
    </div>,
  );
  const focusAnchor = screen.getByRole("button", { name: "Focus anchor", exact: true });
  focusAnchor.element().focus();
  await expect.element(focusAnchor).toHaveFocus();

  await screen.rerender(
    <div>
      <button type="button">Focus anchor</button>
      <CurrentThreadStatus status={{ type: "active", activeFlags: ["waitingOnApproval"] }} />
    </div>,
  );

  await expect.element(focusAnchor).toHaveFocus();
  await expect
    .element(screen.getByRole("status", { name: "Current task is waiting for approval" }))
    .toHaveTextContent("Waiting for approval");
});
