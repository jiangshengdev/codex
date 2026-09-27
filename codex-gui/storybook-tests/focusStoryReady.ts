import { expect, type Page } from "@playwright/test";

/** Wait for product state after the existing click-only History play functions. */
export async function waitForFocusStoryReady(page: Page, storyId: string): Promise<void> {
  switch (storyId) {
    case "history-continuation--unresolved":
    case "history-continuation--switch-in-progress":
    case "history-continuation--current-changed":
    case "history-continuation--current-changed-empty":
    case "history-continuation--disconnected-before-commit":
    case "history-continuation--disconnected-after-commit":
    case "history-continuation--preparation-failed":
    case "history-continuation--resume-failed":
    case "history-continuation--activation-failed":
    case "history-continuation--empty-result":
    case "history-continuation--unexpected-failure":
    case "history-continuation--navigation-failed": {
      // This panel has no alert before continuation settles. The scenario specs
      // independently assert each failure's message and recovery action.
      const panel = page.getByRole("complementary");
      await expect(panel.getByRole("alert")).toBeVisible();
      await expect(
        panel.getByRole("button", { name: "Continuing this task…", exact: true }),
      ).toHaveCount(0);
      await expect(
        panel.getByRole("button", { name: "Continue this task", exact: true }),
      ).toBeEnabled();
      await expect(page.getByText("Read-only history evidence", { exact: true })).toBeVisible();
      return;
    }
    case "history-continuation--pending": {
      // This preset deliberately keeps activation unresolved.
      await expect(
        page.getByRole("button", { name: "Continuing this task…", exact: true }),
      ).toHaveAttribute("aria-disabled", "true");
      await expect(page.getByText("Read-only history evidence", { exact: true })).toBeVisible();
      return;
    }
    case "history-continuation--synchronization-warning":
    case "history-continuation--cleanup-warning": {
      await waitForCurrentHistoryTask(page);
      const warning =
        storyId === "history-continuation--synchronization-warning"
          ? "The task opened, but some state synchronization did not finish."
          : "The previous task connection could not be fully cleaned up. Later state may be affected.";
      await expect(page.getByRole("alertdialog").filter({ hasText: warning })).toBeVisible();
      return;
    }
    case "history-fork--navigation-failed": {
      const notice = page
        .getByRole("region", { name: "Page notices", exact: true })
        .getByRole("alert")
        .filter({ hasText: "Fork created" });
      // The initial saved-fork notice has no diagnostic. It only gains one
      // after the pending activation/navigation attempt settles with failure.
      await expect(
        notice.getByRole("button", { name: "View diagnostic information", exact: true }),
      ).toBeVisible();
      await expect(notice.getByRole("button", { name: "Open fork", exact: true })).toBeEnabled();
      await expect(page.getByText("Read-only history evidence", { exact: true })).toBeVisible();
      return;
    }
    case "history-fork--completed": {
      await waitForCurrentHistoryTask(page);
      await expect(page.getByText("Fork created", { exact: true })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Open fork", exact: true })).toHaveCount(0);
      return;
    }
    case "history-list--append-error": {
      const error = page.getByRole("main").getByRole("alert");
      await expect(error).toContainText("Unable to load history");
      await expect(error.getByRole("button", { name: "Load more", exact: true })).toBeEnabled();
      await expect(page.getByRole("button", { name: "Loading more…", exact: true })).toHaveCount(0);
      await expect(
        page.getByRole("link", { name: "Investigate history recovery", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: "Earlier investigation", exact: true }),
      ).toHaveCount(0);
      return;
    }
    case "history-list--append-loading": {
      // This preset deliberately keeps its append request unresolved.
      await expect(
        page.getByRole("button", { name: "Loading more…", exact: true }),
      ).toHaveAttribute("aria-disabled", "true");
      await expect(
        page.getByRole("link", { name: "Investigate history recovery", exact: true }),
      ).toBeVisible();
      return;
    }
    default:
      return;
  }
}

async function waitForCurrentHistoryTask(page: Page): Promise<void> {
  await expect(page.getByText("Recovered authoritative task", { exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Message Codex", exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continuing this task…", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Continue this task", exact: true })).toHaveCount(
    0,
  );
}
