import { expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import { renderWithProviders } from "@/utils/test-utils";
import { AttachmentFailureDetails } from "../AttachmentFailureDetails";

test("starts attachment failure reading at the heading on every open and restores its entry", async () => {
  await userEvent.unhover(document.body);
  const screen = await renderWithProviders(
    <AttachmentFailureDetails name="photo.png">
      Could not read image preview.
    </AttachmentFailureDetails>,
  );
  const trigger = screen.getByRole("button", { name: "Failure details for photo.png" });
  const dialog = page.getByRole("dialog", { name: "Failure details for photo.png" });
  const heading = dialog.getByRole("heading", { name: "Failure details for photo.png" });
  const close = dialog.getByRole("button", { name: "Close failure details" });
  trigger.element().focus();
  await userEvent.keyboard("{Enter}");
  await expect.element(dialog).toBeVisible();
  await expect.element(heading).toHaveFocus();
  await expect.element(dialog).toHaveTextContent("Could not read image preview.");
  await userEvent.tab();
  await expect.element(close).toHaveFocus();
  await userEvent.tab();
  await expect.element(close).toHaveFocus();
  await userEvent.keyboard("{Escape}");
  await expect.element(dialog).not.toBeInTheDocument();
  await expect.element(trigger).toHaveFocus();
  await trigger.click();
  await expect.element(heading).toHaveFocus();
  await close.click();
  await expect.element(dialog).not.toBeInTheDocument();
  await expect.element(trigger).toHaveFocus();
});
