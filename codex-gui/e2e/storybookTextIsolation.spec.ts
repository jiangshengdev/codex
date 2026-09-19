import { expect, test, type FrameLocator } from "@playwright/test";

test.use({ locale: "en" });

const cases = [
  {
    group: "composer-pending-input-browsing",
    mixed: "ordinary-detail",
    baseline: "queued",
    kind: "detail",
  },
  {
    group: "composer-pending-input-reordering",
    mixed: "mixed-text",
    baseline: "interactive",
    kind: "list",
  },
  {
    group: "composer-pending-input-editing",
    mixed: "mixed-text-retained",
    baseline: "editing",
    kind: "edit",
  },
  {
    group: "composer-pending-input-recovery",
    mixed: "mixed-text-combined",
    baseline: "guiding",
    kind: "recovery",
  },
  {
    group: "composer-input-and-send-queue",
    mixed: "running-queue-long-list",
    baseline: "running-queue",
    kind: "list",
  },
  {
    group: "composer-input-and-send-guide",
    mixed: "guide-queued-long-list",
    baseline: "running-guide",
    kind: "list",
  },
  {
    group: "composer-input-and-send-send",
    mixed: "send-unknown-long-list",
    baseline: "send-unknown-multiple-long-text",
    kind: "unknown",
  },
] as const;

async function expectClosedComposer(preview: FrameLocator) {
  await expect(preview.getByRole("dialog")).toHaveCount(0);
  await expect(
    preview
      .getByRole("textbox", { name: "Main draft", exact: true })
      .or(preview.getByRole("combobox", { name: "Message Codex", exact: true })),
  ).toBeVisible();
}

const expectedStates: Record<
  (typeof cases)[number]["kind"],
  {
    mixed: (preview: FrameLocator) => Promise<void>;
    baseline: (preview: FrameLocator) => Promise<void>;
  }
> = {
  detail: {
    mixed: async (preview) => {
      await expect(preview.getByRole("dialog").last()).toContainText("END OF Ordinary message 1");
    },
    baseline: expectClosedComposer,
  },
  list: {
    mixed: async (preview) => {
      await expect(
        preview
          .getByRole("dialog")
          .getByRole("group", { name: /^(Ordinary|Guide) message / })
          .first(),
      ).toBeVisible();
    },
    baseline: expectClosedComposer,
  },
  edit: {
    mixed: async (preview) => {
      await expect(
        preview.getByRole("textbox", { name: "Unsaved pending message", exact: true }),
      ).toHaveValue(/END OF Ordinary message 1$/);
    },
    baseline: async (preview) => {
      await expect(
        preview.getByRole("combobox", { name: "Edit pending message", exact: true }),
      ).toHaveText("Ordinary message 1");
      await expect(
        preview.getByRole("textbox", { name: "Unsaved pending message", exact: true }),
      ).toHaveCount(0);
    },
  },
  recovery: {
    mixed: async (preview) => {
      await expect(
        preview
          .getByRole("region", { name: "Pending messages", exact: true })
          .getByRole("listitem"),
      ).toHaveCount(23);
    },
    baseline: async (preview) => {
      await expect(
        preview.getByRole("group", { name: "Pending: Guide 1, Queued 3", exact: true }),
      ).toBeVisible();
      await expect(
        preview.getByRole("heading", { name: "Will send first", exact: true }),
      ).toHaveCount(0);
    },
  },
  unknown: {
    mixed: async (preview) => {
      await expect(
        preview.getByRole("button", { name: "Remove local record", exact: true }),
      ).toHaveCount(23);
    },
    baseline: async (preview) => {
      await expect(
        preview.getByRole("button", { name: "Remove local record", exact: true }),
      ).toHaveCount(3);
      await expect(preview.getByText(/END OF Historical guide/)).toHaveCount(0);
    },
  },
};

for (const scenario of cases) {
  test(`${scenario.group} releases mixed text when switching stories in the same preview`, async ({
    page,
  }) => {
    const mixedId = `${scenario.group}--${scenario.mixed}`;
    const baselineId = `${scenario.group}--${scenario.baseline}`;
    await page.goto(`http://localhost:6006/?path=/story/${mixedId}`);
    const preview = page.frameLocator("#storybook-preview-iframe");
    const expected = expectedStates[scenario.kind];
    await expected.mixed(preview);
    await page.locator(`a[href="/?path=/story/${baselineId}"]`).click();
    await expected.baseline(preview);
    await page.locator(`a[href="/?path=/story/${mixedId}"]`).click();
    await expected.mixed(preview);
    await expect(page).toHaveURL(new RegExp(`[?&]path=/story/${mixedId}(?:&|$)`));
  });
}
