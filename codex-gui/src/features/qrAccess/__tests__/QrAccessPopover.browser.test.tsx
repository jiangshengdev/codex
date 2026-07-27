import { expect, test } from "vitest";
import { task6SimplifiedChineseMessages } from "@/__tests__/task6LocaleTestSupport";
import { renderWithProviders } from "@/utils/test-utils";
import { QrAccessPopover } from "../QrAccessPopover";

test("renders English QR access copy while preserving the QR URL", async () => {
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
  await expect.element(screen.getByRole("dialog", { name: "Scan with phone" })).toBeVisible();
  await expect.element(screen.getByLabelText("QR code for current GUI URL")).toBeVisible();
  const qrUrlText = screen.getByText(qrUrl);
  await expect.element(qrUrlText).toBeVisible();

  await expect.element(qrUrlText).toHaveClass("typography", "typography--body-xs");

  await screen.rerender(<QrAccessPopover launchParams={null} origin="http://127.0.0.1:5173" />);
  await expect.element(screen.getByRole("button", { name: "Scan with phone" })).toBeDisabled();
  await expect
    .element(screen.getByText("QR access is unavailable until the GUI launch token is ready."))
    .toBeVisible();
});

test("renders Simplified Chinese QR access copy while preserving the QR URL", async () => {
  const screen = await renderWithProviders(
    <QrAccessPopover
      launchParams={{ threadId: "thread-123", token: "secret" }}
      origin="http://127.0.0.1:5173"
    />,
    { locale: "zh-CN", messages: task6SimplifiedChineseMessages },
  );

  await screen.getByRole("button", { name: "手机扫码" }).click();
  const qrUrl = "http://127.0.0.1:5173/?threadId=thread-123#token=secret";
  await expect.element(screen.getByRole("dialog", { name: "手机扫码" })).toBeVisible();
  await expect.element(screen.getByLabelText("当前 GUI URL 的二维码")).toBeVisible();
  await expect.element(screen.getByText(qrUrl)).toBeVisible();

  await screen.rerender(<QrAccessPopover launchParams={null} origin="http://127.0.0.1:5173" />);
  await expect.element(screen.getByRole("button", { name: "手机扫码" })).toBeDisabled();
  await expect.element(screen.getByText("GUI 启动令牌就绪前，无法使用二维码访问。")).toBeVisible();
});
