import { expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import { renderWithProviders } from "@/utils/test-utils";
import { FailureDiagnosticModal } from "../FailureDiagnosticModal";

test("keeps complete diagnostics behind an auxiliary action and returns keyboard focus", async () => {
  const diagnostic = 'RPC -32603: no rollout found; request="task-123"\nCleanup: original detail';
  const screen = await renderWithProviders(
    <FailureDiagnosticModal>{diagnostic}</FailureDiagnosticModal>,
  );
  const trigger = screen.getByRole("button", { name: "View diagnostic information" });
  await expect.element(trigger).toHaveClass("button--secondary");
  await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
  await expect.element(screen.getByText(diagnostic)).not.toBeInTheDocument();
  trigger.element().focus();
  await userEvent.keyboard("{Enter}");
  const dialog = page.getByRole("dialog", { name: "Diagnostic information" });
  await expect.element(dialog).toBeVisible();
  expect(dialog.element().querySelector('[data-slot="modal-body"]')?.textContent).toBe(diagnostic);
  await expect.poll(() => dialog.element().contains(document.activeElement)).toBe(true);
  await userEvent.keyboard("{Escape}");
  await expect.element(dialog).not.toBeInTheDocument();
  await expect.element(trigger).toHaveFocus();
  await trigger.click();
  await dialog.getByRole("button", { name: "Close diagnostics" }).click();
  await expect.element(dialog).not.toBeInTheDocument();
  await expect.element(trigger).toHaveFocus();
});

test("contains long raw text in a narrow scroll region and removes the overlay on unmount", async () => {
  const viewport = { width: window.innerWidth, height: window.innerHeight };
  const diagnostic = Array.from(
    { length: 100 },
    (_, index) => `${String(index)}: ${"raw-id".repeat(40)}`,
  ).join("\n");
  try {
    await page.viewport(375, 667);
    const screen = await renderWithProviders(
      <FailureDiagnosticModal>{diagnostic}</FailureDiagnosticModal>,
    );
    await screen.getByRole("button", { name: "View diagnostic information" }).click();
    const dialog = page.getByRole("dialog", { name: "Diagnostic information" });
    await expect.element(dialog).toBeVisible();
    const body = dialog.element().querySelector('[data-slot="modal-body"]');
    if (!(body instanceof HTMLElement)) throw new Error("Expected diagnostic scroll region");
    expect(body.textContent).toBe(diagnostic);
    await expect.poll(() => body.scrollHeight > body.clientHeight).toBe(true);
    expect(body.scrollWidth).toBeLessThanOrEqual(body.clientWidth + 1);
    const bounds = dialog.element().getBoundingClientRect();
    expect(bounds.left).toBeGreaterThanOrEqual(0);
    expect(bounds.right).toBeLessThanOrEqual(window.innerWidth);
    await userEvent.wheel(body, { delta: { y: body.scrollHeight } });
    await expect.poll(() => body.scrollTop).toBeGreaterThan(0);
    await screen.unmount();
    await expect.element(dialog).not.toBeInTheDocument();
    await expect.poll(() => document.querySelector('[data-slot="modal-backdrop"]')).toBeNull();
  } finally {
    await page.viewport(viewport.width, viewport.height);
  }
});
