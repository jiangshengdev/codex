import { expect, test } from "vitest";
import { disposedActiveThreadSessionSnapshot } from "@/features/activeThreadSession/__tests__/activeThreadSessionHarness";
import { renderComposerTurnControl } from "@/features/composerTurnControl/__tests__/composerTurnControlBrowserTestSupport";

async function copyWithButton(
  screen: Awaited<ReturnType<typeof renderComposerTurnControl>>,
): Promise<void> {
  await screen.getByRole("button", { name: "Copy changes", exact: true }).click();
  await expect.element(screen.getByText("Changes copied", { exact: true })).toBeVisible();
}

test.each(["button", "selection"])(
  "copies retained changes through %s after owner disposal",
  async (method) => {
    const screen = await renderComposerTurnControl({ scenario: { type: "activeFixture" } });
    await screen.composer().fill("Original");
    await screen.getByRole("button", { name: "Send", exact: true }).click();
    await screen.getByRole("button", { name: "Pending: Queued 1", exact: true }).click();
    await screen.getByRole("button", { name: "Edit", exact: true }).click();
    await screen
      .getByRole("combobox", { name: "Edit pending message", exact: true })
      .fill("Native copy of my changes");
    screen.sessionHarness.publish(disposedActiveThreadSessionSnapshot(100));
    await screen.getByRole("button", { name: "Return to edit", exact: true }).click();
    const retained = screen.getByRole("textbox", { name: "Unsaved pending message", exact: true });
    await expect.element(retained).toHaveValue("Native copy of my changes");
    const source = retained.element();
    if (!(source instanceof HTMLTextAreaElement)) throw new Error("Expected retained text area");
    if (method === "button") {
      await copyWithButton(screen);
    } else {
      source.focus();
      source.select();
      await screen.user.copy();
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
    const destination = document.createElement("textarea");
    document.body.append(destination);
    try {
      destination.focus();
      await screen.user.paste();
      expect(destination.value).toBe("Native copy of my changes");
    } finally {
      destination.remove();
    }
  },
);
