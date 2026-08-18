import { expect, test } from "vitest";
import { renderWithProviders } from "@/utils/test-utils";
import { QrAccessPopover } from "../QrAccessPopover";

test("renders the QR URL with HeroUI typography", async () => {
  const screen = await renderWithProviders(
    <QrAccessPopover
      authorizationToken="secret"
      origin="http://127.0.0.1:5173"
      routeTarget={{
        type: "currentTask",
        threadId: "11111111-2222-3333-4444-555555555555",
      }}
    />,
  );

  await screen.getByRole("button", { name: "Scan with phone" }).click();

  const qrUrl = "http://127.0.0.1:5173/task/11111111-2222-3333-4444-555555555555#token=secret";
  const qrUrlText = screen.getByText(qrUrl);
  await expect.element(qrUrlText).toBeVisible();

  await expect.element(qrUrlText).toHaveClass("typography", "typography--body-xs");
});

test("localizes QR access copy while preserving the raw URL", async () => {
  const screen = await renderWithProviders(
    <QrAccessPopover
      authorizationToken="secret-zh-CN"
      origin="http://127.0.0.1:5173"
      routeTarget={{
        type: "historyDetail",
        threadId: "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE",
      }}
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
    .element(
      dialog.getByText(
        "http://127.0.0.1:5173/history/AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE#token=secret-zh-CN",
      ),
    )
    .toBeVisible();
});

test.each([
  ["history list", { type: "historyList" } as const, "secret"],
  [
    "missing authorization token",
    {
      type: "currentTask",
      threadId: "11111111-2222-3333-4444-555555555555",
    } as const,
    null,
  ],
])("disables QR access for %s", async (_caseName, routeTarget, authorizationToken) => {
  const screen = await renderWithProviders(
    <QrAccessPopover authorizationToken={authorizationToken} routeTarget={routeTarget} />,
  );

  await expect.element(screen.getByRole("button", { name: "Scan with phone" })).toBeDisabled();
});
