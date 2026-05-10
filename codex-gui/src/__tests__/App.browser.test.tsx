import { expect, test } from "vitest";
import App from "@/App";
import { renderWithProviders } from "@/utils/test-utils";

test("App should have correct initial render", async () => {
  const screen = await renderWithProviders(<App />);

  const countLabel = screen.getByLabelText("Count");
  const incrementValueInput = screen.getByRole("textbox", {
    name: "Set increment amount",
  });

  await expect.element(countLabel).toHaveTextContent("0");
  await expect.element(incrementValueInput).toHaveValue("2");
});

test("Increment value and Decrement value should work as expected", async () => {
  const screen = await renderWithProviders(<App />);

  const countLabel = screen.getByLabelText("Count");
  const incrementValueButton = screen.getByLabelText("Increment value");
  const decrementValueButton = screen.getByLabelText("Decrement value");

  await incrementValueButton.click();
  await expect.element(countLabel).toHaveTextContent("1");

  await decrementValueButton.click();
  await expect.element(countLabel).toHaveTextContent("0");
});

test("Language switcher changes the active catalog", async () => {
  const screen = await renderWithProviders(<App />);

  await expect.element(screen.getByText("Red")).toBeVisible();

  await screen.getByLabelText("Language").click();
  await screen.getByRole("option", { name: "简体中文" }).click();

  await expect.element(screen.getByText("红色")).toBeVisible();
  await expect.element(screen.getByTitle("点击此按钮测试复数形式")).toBeVisible();
});
