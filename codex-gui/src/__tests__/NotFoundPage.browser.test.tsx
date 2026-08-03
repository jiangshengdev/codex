import { expect, test, vi } from "vitest";
import { NotFoundPage } from "@/NotFoundPage";
import { renderWithProviders } from "@/utils/test-utils";

const routerMocks = vi.hoisted(() => ({
  navigate: vi.fn<(options: { to: "/" }) => void>(),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => routerMocks.navigate,
}));

test("renders the not-found page in Simplified Chinese", async () => {
  const screen = await renderWithProviders(<NotFoundPage />, { locale: "zh-CN" });

  await expect.element(screen.getByRole("heading", { level: 1, name: "找不到页面" })).toBeVisible();
  await expect
    .element(screen.getByText("抱歉，找不到您要访问的页面。", { exact: true }))
    .toBeVisible();
  await expect.element(screen.getByRole("button", { name: "返回首页" })).toBeVisible();
  await expect.element(screen.getByText("404", { exact: true })).toBeVisible();
  const supportLink = screen.getByRole("link", { name: "联系支持" });
  await expect.element(supportLink).toBeVisible();
  expect(supportLink.element().getAttribute("href")?.startsWith("mailto:")).toBe(true);
});
