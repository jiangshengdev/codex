import { expect, type Page, type TestInfo } from "@playwright/test";
import { activateProductControl, focusProductControl } from "./focusKeyboardActions";
import { observeCurrentFocus } from "./focusObservation";
import { boundaryIndices, expandPendingPages } from "./focusPendingStates";

/** Recheck confirmation geometry after actual keyboard arrival; never confirms deletion. */
export async function observePendingConfirmation(page: Page, testInfo: TestInfo, storyId: string) {
  const summaries = page
    .getByRole("group", { name: /^Pending:/ })
    .getByRole("button", { name: /^(Queued|Guide|Priority) \d+$/ });
  const drawer = page.getByRole("dialog", { name: "Pending details", exact: true });
  if (!(await drawer.isVisible())) await activateProductControl(page, summaries.first());
  await expect(drawer).toBeVisible();
  const sections = drawer.getByRole("button", { name: /^(Queued|Guiding|Priority) \d+$/ });
  for (let index = 0; index < (await sections.count()); index += 1) {
    const section = sections.nth(index);
    if ((await section.getAttribute("aria-expanded")) !== "true")
      await activateProductControl(page, section);
    await expect(section).toHaveAttribute("aria-expanded", "true");
  }
  await expandPendingPages(page, drawer);
  const lanes = drawer.getByRole("region", { name: /^(Queued|Guiding|Priority) \d+$/ });
  for (let laneIndex = 0; laneIndex < (await lanes.count()); laneIndex += 1) {
    const rows = lanes
      .nth(laneIndex)
      .getByRole("group")
      .filter({ has: page.getByRole("button", { name: "Delete", exact: true }) });
    for (const rowIndex of await boundaryIndices(rows)) {
      const row = rows.nth(rowIndex);
      const remove = row.getByRole("button", { name: "Delete", exact: true });
      if (!(await remove.isEnabled())) continue;
      const state = `${storyId}-natural-confirmation-${String(laneIndex)}-${String(rowIndex)}`;
      await activateProductControl(page, remove);
      const keep = row.getByRole("button", { name: "Keep", exact: true });
      await expect(keep).toBeVisible();
      await observeCurrentFocus(page, testInfo, `${state}-opened`);
      for (const [name, control] of [
        ["keep", keep],
        ["delete", remove],
      ] as const) {
        await focusProductControl(page, control);
        await observeCurrentFocus(page, testInfo, `${state}-${name}`);
      }
      await activateProductControl(page, keep);
      await expect(keep).toBeHidden();
      await observeCurrentFocus(page, testInfo, `${state}-kept`);
    }
  }
}
