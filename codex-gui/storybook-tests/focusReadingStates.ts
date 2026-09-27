import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import {
  observeCurrentFocus,
  observeKeyboardFocus,
  observeScrollBoundaryFocus,
  isProductElement,
} from "./focusObservation";
import { activateProductControl } from "./focusKeyboardActions";

/** Authoritative boundary for the diagnostic environment request and its inferred type. */
export function parseReadingEntryCapture(text: string) {
  const parsed: unknown = JSON.parse(text);
  if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Reading entry capture must be a JSON object");
  }
  const value = parsed as Record<string, unknown>;
  const requireFields = (fields: string[]) => {
    const keys = Object.keys(value);
    if (keys.length !== fields.length || keys.some((key) => !fields.includes(key))) {
      throw new Error(`Reading entry capture requires exactly: ${fields.join(", ")}`);
    }
  };
  switch (value.kind) {
    case "context-pages": {
      requireFields(["kind", "pages", "restoreOriginal"]);
      if (!Array.isArray(value.pages) || typeof value.restoreOriginal !== "boolean") {
        throw new Error("Context capture requires pages array and boolean restoreOriginal");
      }
      const pages = value.pages.map((page: unknown) => {
        if (typeof page !== "number" || !Number.isInteger(page) || page <= 0) {
          throw new Error("Context pages must be positive integers");
        }
        return page;
      });
      if (new Set(pages).size !== pages.length || (pages.length === 0 && !value.restoreOriginal)) {
        throw new Error("Context capture requires unique pages and at least one endpoint");
      }
      return { kind: "context-pages" as const, pages, restoreOriginal: value.restoreOriginal };
    }
    case "image-preview": {
      requireFields(["kind", "name"]);
      if (typeof value.name !== "string" || value.name.length === 0) {
        throw new Error("Image preview capture requires a nonempty name");
      }
      return { kind: "image-preview" as const, name: value.name };
    }
    case "table-restoration": {
      requireFields(["kind", "copyIndex", "fullscreenIndex"]);
      if (value.copyIndex !== 0 || value.fullscreenIndex !== 0) {
        throw new Error("Table restoration only accepts copyIndex 0 and fullscreenIndex 0");
      }
      return {
        kind: "table-restoration" as const,
        copyIndex: 0 as const,
        fullscreenIndex: 0 as const,
      };
    }
    default:
      throw new Error(`Unknown reading entry capture kind: ${String(value.kind)}`);
  }
}

export type ReadingEntryCapture = ReturnType<typeof parseReadingEntryCapture>;

type ReadingObservation = {
  state: string;
  trigger: string;
  observations: number;
};

type RecordState = (state: string, trigger: string, currentOnly?: boolean) => Promise<void>;

async function isAvailableProductControl(control: Locator) {
  if (!(await control.isVisible()) || !(await control.isEnabled())) return false;
  return control.evaluate(isProductElement);
}

async function observeTableMenus(
  page: Page,
  scope: Locator,
  record: RecordState,
  prefix: string,
  entryCapture?: Extract<ReadingEntryCapture, { kind: "table-restoration" }>,
) {
  const triggers = scope.getByRole("button", { name: "Copy table", exact: true });
  const count = await triggers.count();
  if (entryCapture != null) {
    expect(count, "Requested initial Copy table trigger is absent").toBeGreaterThan(0);
  }
  const end = entryCapture == null ? count : 1;
  for (let index = 0; index < end; index += 1) {
    const trigger = triggers.nth(index);
    const available = await isAvailableProductControl(trigger);
    if (entryCapture != null)
      expect(available, "Requested Copy table trigger is unavailable").toBe(true);
    if (!available) continue;
    await activateProductControl(page, trigger);
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Markdown", exact: true })).toBeVisible();
    if (entryCapture == null) {
      const items = menu.getByRole("menuitem");
      const itemCount = await items.count();
      await page.keyboard.press("Home");
      for (let itemIndex = 0; itemIndex < itemCount; itemIndex += 1) {
        await expect(items.nth(itemIndex)).toBeFocused();
        await record(
          `${prefix}-copy-menu-${String(index)}-item-${String(itemIndex)}`,
          `Copy table → Home${" → ArrowDown".repeat(itemIndex)}`,
          true,
        );
        if (itemIndex + 1 < itemCount) await page.keyboard.press("ArrowDown");
      }
      await page.keyboard.press("End");
      await expect(items.last()).toBeFocused();
    }
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(trigger).toBeFocused();
    await record(`${prefix}-copy-restored-${String(index)}`, "Copy table menu → Escape");
  }
}

async function observeTables(
  page: Page,
  transcript: Locator,
  record: RecordState,
  prefix: string,
  entryCapture?: Extract<ReadingEntryCapture, { kind: "table-restoration" }>,
) {
  await observeTableMenus(page, transcript, record, prefix, entryCapture);
  const triggers = transcript.getByRole("button", { name: "View fullscreen", exact: true });
  const count = await triggers.count();
  if (entryCapture != null) {
    expect(count, "Requested initial View fullscreen trigger is absent").toBeGreaterThan(0);
  }
  const end = entryCapture == null ? count : 1;
  for (let index = 0; index < end; index += 1) {
    const trigger = triggers.nth(index);
    const available = await isAvailableProductControl(trigger);
    if (entryCapture != null)
      expect(available, "Requested View fullscreen trigger is unavailable").toBe(true);
    if (!available) continue;
    await activateProductControl(page, trigger);
    const dialog = page.getByRole("dialog").filter({
      has: page.getByRole("button", { name: "Exit fullscreen", exact: true }),
    });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("table")).toBeVisible();
    const state = `${prefix}-fullscreen-${String(index)}`;
    if (entryCapture == null) {
      await record(state, "View fullscreen");
      await observeTableMenus(page, dialog, record, state);
    }
    await activateProductControl(
      page,
      dialog.getByRole("button", { name: "Exit fullscreen", exact: true }),
    );
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    await record(`${state}-restored`, "Exit fullscreen");
  }
}

async function observeImages(
  page: Page,
  transcript: Locator,
  record: RecordState,
  prefix: string,
  entryCapture?: Extract<ReadingEntryCapture, { kind: "image-preview" }>,
) {
  const triggers = transcript
    .getByRole("button", { name: /^Preview / })
    .filter({ has: page.locator("img") });
  const count = await triggers.count();
  let visited = 0;
  if (entryCapture != null) {
    await expect(
      triggers.and(page.getByRole("button", { name: entryCapture.name, exact: true })),
    ).toHaveCount(1);
  }
  for (let index = 0; index < count; index += 1) {
    const trigger = triggers.nth(index);
    if (!(await isAvailableProductControl(trigger))) continue;
    const name = await trigger.getAttribute("aria-label");
    if (entryCapture != null && name !== entryCapture.name) continue;
    await activateProductControl(page, trigger);
    const dialog = page.getByRole("dialog").filter({
      has: page.getByRole("button", { name: "Close image preview", exact: true }),
    });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("img")).toBeVisible();
    const state = `${prefix}-image-${String(index)}`;
    await record(
      entryCapture == null ? state : `${state}-initial`,
      name ?? "Preview image",
      entryCapture != null,
    );
    await activateProductControl(
      page,
      dialog.getByRole("button", { name: "Close image preview", exact: true }),
    );
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    await record(`${state}-restored`, "Close image preview");
    visited += 1;
  }
  if (entryCapture != null) {
    expect(visited, "Requested image preview has no available product trigger").toBe(1);
  }
}

async function observeContent(
  page: Page,
  record: RecordState,
  prefix: string,
  entryCapture?: Exclude<ReadingEntryCapture, { kind: "context-pages" }>,
) {
  const productPage = page.locator("body");
  if (entryCapture?.kind === "table-restoration") {
    await observeTables(page, productPage, record, prefix, entryCapture);
    return;
  }
  if (entryCapture?.kind === "image-preview") {
    await observeImages(page, productPage, record, prefix, entryCapture);
    return;
  }
  await observeTables(page, productPage, record, prefix);
  await observeImages(page, productPage, record, prefix);
  const transcript = page.getByRole("region", { name: "Committed transcript", exact: true });
  if ((await transcript.count()) === 0) return;
  const disclosures = transcript.getByRole("button", { name: /^Intermediate updates/ });
  const count = await disclosures.count();
  for (let index = 0; index < count; index += 1) {
    const disclosure = disclosures.nth(index);
    if (!(await isAvailableProductControl(disclosure))) continue;
    const expanded = await disclosure.getAttribute("aria-expanded");
    expect(expanded).toMatch(/^(true|false)$/);
    const state = `${prefix}-updates-${String(index)}`;
    await activateProductControl(page, disclosure);
    await expect(disclosure).toHaveAttribute(
      "aria-expanded",
      expanded === "true" ? "false" : "true",
    );
    await record(`${state}-toggled`, "Intermediate updates → toggle");
    if (expanded === "false") {
      await observeTables(page, transcript, record, `${state}-expanded`);
      await observeImages(page, transcript, record, `${state}-expanded`);
    }
    await activateProductControl(page, disclosure);
    await expect(disclosure).toHaveAttribute("aria-expanded", expanded ?? "false");
    await record(`${state}-restored`, "Intermediate updates → restore original expansion");
  }
}

/** Visit only product reading controls that exist in the currently rendered story. */
export async function observeReadingStates(
  page: Page,
  testInfo: TestInfo,
  prefix: string,
  entryCapture?: ReadingEntryCapture,
) {
  const results: ReadingObservation[] = [];
  const record: RecordState = async (state, trigger, currentOnly = false) => {
    const observe =
      currentOnly || state.includes("restored") ? observeCurrentFocus : observeKeyboardFocus;
    results.push({ state, trigger, observations: (await observe(page, testInfo, state)).length });
  };
  if (entryCapture?.kind !== "context-pages") {
    await observeContent(page, record, `${prefix}-reading-initial`, entryCapture);
    if (entryCapture != null) return results;
  }
  const pagination = page.getByRole("navigation", {
    name: "Transcript context pages",
    exact: true,
  });
  if (entryCapture != null) await expect(pagination).toHaveCount(1);
  if ((await pagination.count()) === 0) return results;
  const observePaginationEdges = async (state: string) => {
    await observeScrollBoundaryFocus(
      page,
      testInfo,
      `${state}-pagination`,
      pagination.locator(".."),
    );
  };
  if (entryCapture == null) await observePaginationEdges(`${prefix}-reading-initial`);
  const current = pagination.locator('[aria-current="page"]');
  await expect(current).toHaveCount(1);
  const originalName = await current.getAttribute("aria-label");
  expect(originalName).not.toBeNull();
  const names = await pagination
    .getByRole("button", { name: /^Context page \d+$/ })
    .evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-label")));
  let selectedNames: string[] | undefined;
  let preparationName: string | undefined;
  if (entryCapture != null) {
    selectedNames = entryCapture.pages.map((number) => `Context page ${String(number)}`);
    for (const name of selectedNames) {
      expect(name, "Requested page must differ from the original page").not.toBe(originalName);
      expect(names, "Requested page is absent from this fixture").toContain(name);
    }
    if (selectedNames.length === 0) {
      preparationName = names.find((name): name is string => name != null && name !== originalName);
      expect(preparationName, "Restoration requires a real different page").toBeDefined();
    }
  }
  for (const name of names) {
    if (name == null || name === originalName) continue;
    if (selectedNames != null && !selectedNames.includes(name) && name !== preparationName)
      continue;
    const trigger = pagination.getByRole("button", { name, exact: true });
    await activateProductControl(page, trigger);
    await expect(trigger).toHaveAttribute("aria-current", "page");
    const state = `${prefix}-context-${name.replaceAll(" ", "-")}`;
    if (entryCapture == null) {
      await record(state, name);
      await observePaginationEdges(state);
      await observeContent(page, record, state);
    } else if (selectedNames?.includes(name)) {
      await record(`${state}-initial`, name, true);
    }
  }
  if (originalName != null && (entryCapture == null || entryCapture.restoreOriginal)) {
    const original = pagination.getByRole("button", { name: originalName, exact: true });
    await activateProductControl(page, original);
    await expect(original).toHaveAttribute("aria-current", "page");
    await record(`${prefix}-context-restored`, originalName);
  }
  return results;
}
