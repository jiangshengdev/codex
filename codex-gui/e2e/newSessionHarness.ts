import { expect, type Page } from "@playwright/test";
import { attachBaseline } from "@/features/projection/__tests__/projectionFixtures";
import { createMultiSessionHarness, openMenu } from "./multiSessionHarness";
import { composer } from "./persistenceHarness";

export const createdThreadId = "00000000-0000-0000-0000-000000000003";
export const retriedThreadId = "00000000-0000-0000-0000-000000000004";
export const originalCwd = attachBaseline.snapshot.thread.cwd;
export const otherCwd = "/tmp/codex-new-session-other";

export function createNewSessionHarness(
  page: Page,
  initiallyActive = false,
  acknowledgeSends = true,
) {
  return createMultiSessionHarness(page, initiallyActive, acknowledgeSends, [
    createdThreadId,
    retriedThreadId,
  ]);
}

export async function openNewSession(page: Page) {
  await openMenu(page);
  await page.getByRole("button", { name: "New session", exact: true }).click();
  await expect(page).toHaveURL(/\/new$/);
  await expect(composer(page)).toBeVisible();
}

export async function sendNewSession(page: Page, text: string) {
  await composer(page).fill(text);
  await page.getByRole("button", { name: "Send", exact: true }).click();
}
