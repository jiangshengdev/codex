import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import { activateProductControl, focusProductControl } from "./focusKeyboardActions";
import {
  observeCurrentFocus,
  observeKeyboardFocus,
  observeScrollBoundaryFocus,
} from "./focusObservation";

type PendingObservation = {
  state: string;
  trigger: string;
  observations: number;
};

/** Visit reversible product states of an already open pending-message surface. */
export async function observePendingStates(page: Page, testInfo: TestInfo, prefix: string) {
  const results: PendingObservation[] = [];
  const record = async (state: string, trigger: string, currentOnly = false) => {
    const artifact = `${prefix}-${String(results.length)}-${state}`;
    const current = await observeCurrentFocus(page, testInfo, `${artifact}-current`);
    results.push({
      state,
      trigger,
      observations:
        currentOnly || /restored|returned|cancelled|kept/.test(state)
          ? current.length
          : [...current, ...(await observeKeyboardFocus(page, testInfo, artifact))].length,
    });
    const bodies = page
      .getByRole("dialog", { name: "Pending details", exact: true })
      .locator(".drawer__body");
    if (!currentOnly && /lane-|empty-pending/.test(state) && (await bodies.count()) === 1) {
      await observeScrollBoundaryFocus(page, testInfo, `${artifact}-scroll`, bodies);
    }
  };
  const dialogs = page.getByRole("dialog", { name: "Pending details", exact: true });
  const editor = page.getByRole("combobox", { name: "Edit pending message", exact: true });
  const retained = page.getByRole("textbox", { name: "Unsaved pending message", exact: true });
  const confirmation = page
    .getByRole("alertdialog")
    .filter({ hasText: "Discard unsaved changes?" });

  if (await confirmation.isVisible()) {
    await activateProductControl(
      page,
      confirmation.getByRole("button", { name: "Return to edit", exact: true }),
    );
    await expect(confirmation).toBeHidden();
    await record("returned-to-edit", "Return to edit from initial discard confirmation");
  }
  if (await retained.isVisible()) {
    const discard = page.getByRole("dialog").getByRole("button", {
      name: "Discard changes",
      exact: true,
    });
    await activateProductControl(page, discard);
    await expect(confirmation).toBeVisible();
    await record("retained-discard-confirmation", "Discard changes");
    await activateProductControl(
      page,
      confirmation.getByRole("button", { name: "Return to edit", exact: true }),
    );
    await expect(retained).toBeFocused();
    await record("retained-returned", "Return to edit");
    return results;
  }
  if (await editor.isVisible()) {
    await activateProductControl(
      page,
      page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }),
    );
    if (await confirmation.isVisible()) {
      // Existing unsaved content belongs to the preset: retain it instead of discarding it.
      await record("initial-edit-discard-confirmation", "Cancel");
      await activateProductControl(
        page,
        confirmation.getByRole("button", { name: "Return to edit", exact: true }),
      );
      await expect(editor).toBeFocused();
      await record("initial-edit-returned", "Return to edit");
      return results;
    }
    await expect(editor).toBeHidden();
    await record("initial-edit-cancelled", "Cancel unchanged initial edit");
  }
  while ((await dialogs.count()) > 1) {
    await activateProductControl(
      page,
      dialogs.last().getByRole("button", { name: "Close", exact: true }),
    );
    await expect(dialogs).toHaveCount(1);
    await record("initial-detail-closed", "Close initial full-message detail");
  }
  if (!(await dialogs.isVisible())) return results;
  const drawer = dialogs;
  const keep = drawer.getByRole("button", { name: "Keep", exact: true });
  if (await keep.isVisible()) {
    await activateProductControl(page, keep);
    await expect(keep).toBeHidden();
    await record("initial-delete-kept", "Keep");
  }

  const sections = drawer.getByRole("button", { name: /^(Queued|Guiding|Priority) \d+$/ });
  // PendingInputSection names each region via its Disclosure.Heading (product source).
  // Missing lanes can be a refresh failure; only the explicit empty state is empty.
  if ((await sections.count()) === 0) {
    const refreshError = drawer
      .getByRole("alert")
      .getByText("Updated pending order could not be loaded", { exact: true });
    if (await refreshError.isVisible()) {
      await record("refresh-error", "Updated pending order could not be loaded");
      await expect(refreshError).toBeVisible();
    } else {
      await expect(drawer.getByText("No pending messages", { exact: true })).toBeVisible();
      await record("empty-pending-drawer", "No pending messages");
    }
    return results;
  }
  for (let index = 0; index < (await sections.count()); index += 1) {
    const section = sections.nth(index);
    const label = (await section.textContent()) ?? "pending lane";
    if ((await section.getAttribute("aria-expanded")) === "true") {
      await activateProductControl(page, section);
      await expect(section).toHaveAttribute("aria-expanded", "false");
      await record("lane-collapsed", label);
    }
    await activateProductControl(page, section);
    await expect(section).toHaveAttribute("aria-expanded", "true");
    await record("lane-expanded", label);
  }
  await expandPendingPages(page, drawer, (name) => record("lane-page-expanded", name));

  // Each lane has its own scroll and management boundaries; visit both ends per lane.
  const lanes = drawer.getByRole("region", { name: /^(Queued|Guiding|Priority) \d+$/ });
  await expect(lanes).toHaveCount(await sections.count());
  for (let laneIndex = 0; laneIndex < (await lanes.count()); laneIndex += 1) {
    const lane = lanes.nth(laneIndex);
    const details = lane.getByRole("button", { name: "View full message", exact: true });
    for (const index of await boundaryIndices(details)) {
      const trigger = details.nth(index);
      await activateProductControl(page, trigger);
      await expect(dialogs).toHaveCount(2);
      await record("full-message-detail", `lane ${String(laneIndex)}, detail ${String(index)}`);
      await activateProductControl(
        page,
        dialogs.last().getByRole("button", { name: "Close", exact: true }),
      );
      await expect(dialogs).toHaveCount(1);
      await expect(trigger).toBeFocused();
      await record("full-message-restored", `lane ${String(laneIndex)}, detail ${String(index)}`);
    }
    const edits = lane.getByRole("button", { name: "Edit", exact: true });
    for (const index of await boundaryIndices(edits)) {
      const trigger = edits.nth(index);
      if (!(await trigger.isEnabled())) continue;
      await activateProductControl(page, trigger);
      await expect
        .poll(
          async () => (await editor.isVisible()) || (await drawer.getByRole("alert").isVisible()),
        )
        .toBe(true);
      if (!(await editor.isVisible())) {
        await expect(drawer.getByRole("alert")).toBeVisible();
        await record("editing-unavailable", `lane ${String(laneIndex)}, edit ${String(index)}`);
        continue;
      }
      await record("editing", `lane ${String(laneIndex)}, edit ${String(index)}`);
      await focusProductControl(page, editor);
      const mac = await page.evaluate(() => navigator.platform.startsWith("Mac"));
      await page.keyboard.press(mac ? "Meta+ArrowDown" : "Control+End");
      await page.keyboard.type(" focus inspection");
      await activateProductControl(
        page,
        page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }),
      );
      await expect(confirmation).toBeVisible();
      await record("editing-discard-confirmation", "Cancel changed draft");
      await activateProductControl(
        page,
        confirmation.getByRole("button", { name: "Return to edit", exact: true }),
      );
      await expect(editor).toBeFocused();
      await record("editing-returned", "Return to edit");
      await activateProductControl(
        page,
        page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }),
      );
      await activateProductControl(
        page,
        confirmation.getByRole("button", { name: "Discard changes", exact: true }),
      );
      await expect(editor).toBeHidden();
      await expect(drawer).toBeVisible();
      await record("editing-cancelled", "Discard only the inspection draft");
    }
    const deletes = lane.getByRole("button", { name: "Delete", exact: true });
    for (const index of await boundaryIndices(deletes)) {
      const trigger = deletes.nth(index);
      if (!(await trigger.isEnabled())) continue;
      await activateProductControl(page, trigger);
      await expect(keep).toBeVisible();
      await record("delete-confirmation", `lane ${String(laneIndex)}, delete ${String(index)}`);
      await activateProductControl(page, keep);
      await expect(keep).toBeHidden();
      await record("delete-kept", "Keep");
    }
    const menus = lane.getByRole("button", { name: /^More move options for pending message:/ });
    for (const index of await boundaryIndices(menus)) {
      const trigger = menus.nth(index);
      if (!(await trigger.isEnabled())) continue;
      await activateProductControl(page, trigger);
      const menu = page.getByRole("menu");
      await expect(menu).toBeVisible();
      if ((await menu.getByRole("menuitem", { disabled: false }).count()) === 0) {
        await expect(menu).toBeFocused();
        await record("move-menu-all-disabled", "No enabled move destination", true);
        await page.keyboard.press("Escape");
        await expect(menu).toBeHidden();
        await expect(trigger).toBeFocused();
        await record(
          "move-menu-restored",
          `lane ${String(laneIndex)}, menu ${String(index)}`,
          true,
        );
        continue;
      }
      await page.keyboard.press("Home");
      await expect(menu.locator(":focus")).toHaveCount(1);
      const visited = new Set<string>();
      const itemCount = await menu.getByRole("menuitem").count();
      for (let itemIndex = 0; itemIndex < itemCount; itemIndex += 1) {
        const focused = menu.locator(":focus");
        await expect(focused).toHaveCount(1);
        const name = (await focused.textContent()) ?? "";
        if (visited.has(name)) break;
        visited.add(name);
        await record("move-menu-item", name, true);
        await page.keyboard.press("ArrowDown");
      }
      await page.keyboard.press("End");
      await expect(menu.locator(":focus")).toHaveCount(1);
      await record("move-menu-end", "End", true);
      await page.keyboard.press("Escape");
      await expect(menu).toBeHidden();
      await expect(trigger).toBeFocused();
      await record("move-menu-restored", `lane ${String(laneIndex)}, menu ${String(index)}`);
    }
  }
  return results;
}

export async function expandPendingPages(
  page: Page,
  drawer: Locator,
  onPage?: (name: string) => Promise<void>,
) {
  for (const name of ["Show more queued messages", "Show more guiding messages"]) {
    const more = drawer.getByRole("button", { name, exact: true });
    while (await more.isVisible()) {
      const previous = await drawer.getByRole("listitem").count();
      await activateProductControl(page, more);
      await expect.poll(() => drawer.getByRole("listitem").count()).toBeGreaterThan(previous);
      await onPage?.(name);
    }
  }
}

export async function boundaryIndices(locator: Locator) {
  const count = await locator.count();
  return count === 0 ? [] : count === 1 ? [0] : [0, count - 1];
}
