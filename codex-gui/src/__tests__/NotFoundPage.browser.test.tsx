import { RouterProvider, createMemoryHistory } from "@tanstack/react-router";
import { expect, test } from "vitest";
import type { AppLocale } from "@/features/locale/localeRuntime";
import { createAppRouter } from "@/router";
import { renderWithProviders } from "@/utils/test-utils";
import { task6SimplifiedChineseMessages } from "./task6LocaleTestSupport";

const supportEmail = "jiangshengdev@outlook.com";

async function renderNotFound(locale: AppLocale) {
  const history = createMemoryHistory({ initialEntries: ["/missing-page"] });
  const router = createAppRouter({ history });
  return renderWithProviders(<RouterProvider router={router} />, {
    locale,
    messages: locale === "zh-CN" ? task6SimplifiedChineseMessages : undefined,
  });
}

test("renders the English not-found actions and support link", async () => {
  const screen = await renderNotFound("en");

  await expect.element(screen.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await expect
    .element(screen.getByText("Sorry, we couldn’t find the page you’re looking for."))
    .toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Go back home" })).toBeVisible();
  await expect
    .element(screen.getByRole("link", { name: "Contact support" }))
    .toHaveAttribute("href", `mailto:${supportEmail}`);
});

test("renders the Simplified Chinese not-found actions without translating identifiers", async () => {
  const screen = await renderNotFound("zh-CN");

  await expect.element(screen.getByRole("heading", { name: "页面未找到" })).toBeVisible();
  await expect.element(screen.getByText("抱歉，我们找不到你要访问的页面。")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "返回首页" })).toBeVisible();
  await expect
    .element(screen.getByRole("link", { name: "联系支持" }))
    .toHaveAttribute("href", `mailto:${supportEmail}`);
});
