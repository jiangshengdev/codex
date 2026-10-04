import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { renderWithProviders } from "@/utils/test-utils";
import { RetryActionButton } from "../RetryActionButton";

test("keeps the action name across attempts and prevents activation while pending", async () => {
  const onPress = vi.fn<() => void>();
  const action = (isPending: boolean) => (
    <RetryActionButton isPending={isPending} pendingChildren="Loading history…" onPress={onPress}>
      Load history
    </RetryActionButton>
  );
  const screen = await renderWithProviders(action(false));
  const button = screen.getByRole("button", { name: "Load history", exact: true });
  await button.click();
  expect(onPress).toHaveBeenCalledTimes(1);
  await screen.rerender(action(true));
  const pending = screen.getByRole("button", { name: "Loading history…", exact: true });
  await expect.element(pending).toHaveAttribute("aria-disabled", "true");
  await expect
    .element(screen.container.querySelector<HTMLElement>('[data-slot="spinner"]'))
    .toBeVisible();
  await userEvent.keyboard("{Enter}");
  expect(onPress).toHaveBeenCalledTimes(1);
  await screen.rerender(action(false));
  await expect.element(button).toBeVisible();
  await userEvent.keyboard("{Enter}");
  expect(onPress).toHaveBeenCalledTimes(2);
});

test("preserves business disabled state outside pending", async () => {
  const screen = await renderWithProviders(
    <RetryActionButton isPending={false} isDisabled pendingChildren="Removing…" variant="danger">
      Remove task
    </RetryActionButton>,
  );
  await expect.element(screen.getByRole("button", { name: "Remove task" })).toBeDisabled();
});
