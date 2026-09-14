import { expect, test } from "@playwright/test";

test.use({ locale: "en" });

test("isolates Redux state and memory navigation when switching stories", async ({ page }) => {
  const businessSockets: string[] = [];
  page.on("websocket", (socket) => {
    const url = new URL(socket.url());
    const isStorybookSocket =
      url.host === "localhost:6006" &&
      (url.pathname === "/" || url.pathname === "/storybook-server-channel") &&
      url.searchParams.has("token");
    if (!isStorybookSocket) {
      businessSockets.push(socket.url());
    }
  });
  await page.goto("http://localhost:6006/?path=/story/environment-stateful--empty");
  const preview = page.frameLocator("#storybook-preview-iframe");
  await expect(preview.getByRole("status")).toHaveText("Redux slots: 0; route: /");
  await preview.getByRole("button", { name: "Create read-model slot" }).click();
  await expect(preview.getByRole("status")).toHaveText("Redux slots: 1; route: /");
  await preview.getByRole("button", { name: "Navigate to details" }).click();
  await expect(preview.getByRole("status")).toHaveText(
    "Redux slots: 1; route: /history/storybook-preview",
  );
  await expect(page).toHaveURL("http://localhost:6006/?path=/story/environment-stateful--empty");
  await page.getByRole("link", { name: "Seeded", exact: true }).click();
  await expect(preview.getByRole("status")).toHaveText("Redux slots: 1; route: /");
  await preview.getByRole("button", { name: "Create read-model slot" }).click();
  await expect(preview.getByRole("status")).toHaveText("Redux slots: 2; route: /");
  await page.getByRole("link", { name: "Empty", exact: true }).click();
  await expect(preview.getByRole("status")).toHaveText("Redux slots: 0; route: /");
  expect(businessSockets).toEqual([]);
});
