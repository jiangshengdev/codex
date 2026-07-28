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
