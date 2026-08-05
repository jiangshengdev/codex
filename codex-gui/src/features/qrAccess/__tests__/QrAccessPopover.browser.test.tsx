import { expect, test } from "vitest";
import { renderWithProviders } from "@/utils/test-utils";
import { QrAccessPopover } from "../QrAccessPopover";

test("renders the QR URL with HeroUI typography", async () => {
  const screen = await renderWithProviders(
    <QrAccessPopover
      launchParams={{
        threadId: "thread-123",
        token: "secret",
      }}
      origin="http://127.0.0.1:5173"
    />,
  );

  await screen.getByRole("button", { name: "Scan with phone" }).click();

  const qrUrl = "http://127.0.0.1:5173/?threadId=thread-123#token=secret";
  const qrUrlText = screen.getByText(qrUrl);
  await expect.element(qrUrlText).toBeVisible();

  await expect.element(qrUrlText).toHaveClass("typography", "typography--body-xs");
});

test("localizes QR access copy while preserving the raw URL", async () => {
  const screen = await renderWithProviders(
    <QrAccessPopover
      launchParams={{
        threadId: "thread-zh-CN",
        token: "secret-zh-CN",
      }}
      origin="http://127.0.0.1:5173"
    />,
    { locale: "zh-CN" },
  );

  const trigger = screen.getByRole("button", { name: "使用手机扫描" });
  await expect.element(trigger).toBeVisible();
  await trigger.click();

  const dialog = screen.getByRole("dialog", { name: "使用手机扫描" });
  await expect.element(dialog).toBeVisible();
  await expect.element(dialog.getByLabelText("当前 GUI URL 的二维码。")).toBeVisible();
  await expect
    .element(dialog.getByText("http://127.0.0.1:5173/?threadId=thread-zh-CN#token=secret-zh-CN"))
    .toBeVisible();
});
