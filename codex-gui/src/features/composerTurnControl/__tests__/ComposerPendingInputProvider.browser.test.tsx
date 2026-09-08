import { expect, test, vi } from "vitest";
import { disposedActiveThreadSessionSnapshot } from "@/features/activeThreadSession/__tests__/activeThreadSessionHarness";
import { renderComposerTurnControl } from "./composerTurnControlBrowserTestSupport";

test("keeps unsaved edits after the Composer unmounts and returns from discard confirmation", async () => {
  const screen = await renderComposerTurnControl({
    scenario: { type: "activeFixture" },
    strictMode: true,
  });
  await screen.composer().fill("Original queued message");
  await screen.getByRole("button", { name: "Send", exact: true }).click();
  await screen.composer().fill("Separate main draft");
  await screen.getByRole("button", { name: "Pending: Queued 1", exact: true }).click();
  await screen.getByRole("button", { name: "Edit", exact: true }).click();
  await screen
    .getByRole("combobox", { name: "Edit pending message", exact: true })
    .fill("Keep this changed text");
  screen.sessionHarness.publish(disposedActiveThreadSessionSnapshot(100));
  await expect.element(screen.composer()).not.toBeInTheDocument();
  await expect.element(screen.getByRole("alertdialog")).toBeVisible();
  await screen.getByRole("button", { name: "Return to edit", exact: true }).click();
  const retained = screen.getByRole("textbox", { name: "Unsaved pending message", exact: true });
  await expect.element(retained).toHaveValue("Keep this changed text");
  await expect.element(retained).toHaveFocus();
  await expect
    .element(screen.getByRole("button", { name: "Save", exact: true }))
    .not.toBeInTheDocument();
  const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
  const original = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  try {
    await screen.getByRole("button", { name: "Copy changes", exact: true }).click();
    expect(writeText).toHaveBeenCalledExactlyOnceWith("Keep this changed text");
    await expect.element(screen.getByText("Changes copied", { exact: true })).toBeVisible();
    writeText.mockRejectedValueOnce(new Error("clipboard denied"));
    await screen.getByRole("button", { name: "Copy changes", exact: true }).click();
    await expect
      .element(
        screen.getByText("Copy failed. Select the text and copy it manually.", { exact: true }),
      )
      .toBeVisible();
    await expect.element(retained).toHaveValue("Keep this changed text");
  } finally {
    if (original == null) Reflect.deleteProperty(navigator, "clipboard");
    else Object.defineProperty(navigator, "clipboard", original);
  }
  await screen
    .getByRole("dialog")
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  await screen
    .getByRole("alertdialog")
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  await expect.element(retained).not.toBeInTheDocument();
  await expect
    .element(screen.getByRole("region", { name: "Pending message editor", exact: true }))
    .toHaveFocus();
});

test.each(["close", "escape", "backdrop"])(
  "returns from %s confirmation without cancelling the edit or replacing the main draft",
  async (method) => {
    const screen = await renderComposerTurnControl({
      scenario: { type: "activeFixture", captureEditReservations: true },
    });
    await screen.composer().fill("Original");
    await screen.getByRole("button", { name: "Send", exact: true }).click();
    await screen.composer().fill("Main draft");
    await screen.getByRole("button", { name: "Pending: Queued 1", exact: true }).click();
    await screen.getByRole("button", { name: "Edit", exact: true }).click();
    const editor = screen.getByRole("combobox", { name: "Edit pending message", exact: true });
    await editor.fill("Changed");
    const reservation = screen.reservations[0];
    if (reservation == null) throw new Error("Expected edit reservation");
    const cancel = vi.spyOn(reservation, "cancel");
    if (method === "close")
      await screen.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
    else if (method === "escape") await screen.user.keyboard("{Escape}");
    else {
      const backdrop = document.querySelector('[data-slot="drawer-backdrop"]');
      if (!(backdrop instanceof HTMLElement)) throw new Error("Expected drawer backdrop");
      await screen.user.click(backdrop, { position: { x: 2, y: 2 } });
    }
    await expect.element(screen.getByRole("alertdialog")).toBeVisible();
    expect(cancel).not.toHaveBeenCalled();
    await screen.getByRole("button", { name: "Return to edit", exact: true }).click();
    await expect.element(editor).toHaveTextContent("Changed");
    await expect.element(editor).toHaveFocus();
    await screen.getByRole("button", { name: "Save", exact: true }).click();
    await expect
      .element(screen.getByRole("dialog").getByText("Changed", { exact: true }))
      .toBeVisible();
    await screen.user.keyboard("{Escape}");
    await expect.element(screen.composer()).toHaveTextContent("Main draft");
  },
);
