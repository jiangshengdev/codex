import { RouterProvider, createMemoryHistory } from "@tanstack/react-router";
import type { Messages } from "@lingui/core";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import {
  getCleanupConnectionCallCount,
  resetAppBrowserTestSupport,
  type StartGuiHostConnectionMock,
} from "@/__tests__/appBrowserTestSupport";
import type { StartGuiHostConnectionOptions } from "@/features/guiHost/guiHostClient";
import type { AppLocale, LocalePreference } from "@/features/locale/localeRuntime";
import { createAppRouter } from "@/router";
import { renderWithProviders } from "@/utils/test-utils";

const guiHostClientMock = vi.hoisted(() => ({
  startGuiHostConnection: vi.fn<(options: StartGuiHostConnectionOptions) => () => void>(),
}));

const catalogMock = vi.hoisted(() => ({
  loadCatalog: vi.fn<(locale: AppLocale) => Promise<Messages>>(),
}));

vi.mock("@/features/guiHost/guiHostClient", () => ({
  startGuiHostConnection: guiHostClientMock.startGuiHostConnection,
}));

vi.mock("@/i18n", () => ({
  loadCatalog: catalogMock.loadCatalog,
}));

const startGuiHostConnectionMock =
  guiHostClientMock.startGuiHostConnection as unknown as StartGuiHostConnectionMock;

const catalogs: Record<AppLocale, Messages> = {
  en: {},
  "zh-CN": {},
};

// Task 9 owns the generated Chinese catalog and the Chinese-interface copy assertions,
// including `英语 · English` display and `英语` search. These tests intentionally keep
// the catalog seam empty until that generated artifact exists.

function deferred<T>() {
  const callbacks = {} as {
    reject: (reason?: unknown) => void;
    resolve: (value: T) => void;
  };
  const promise = new Promise<T>((resolve, reject) => {
    callbacks.reject = reject;
    callbacks.resolve = resolve;
  });

  return { ...callbacks, promise };
}

beforeEach(() => {
  resetAppBrowserTestSupport(startGuiHostConnectionMock);
  window.localStorage.clear();
  document.documentElement.lang = "en";
  catalogMock.loadCatalog.mockReset();
  catalogMock.loadCatalog.mockImplementation((locale) => Promise.resolve(catalogs[locale]));
});

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  document.documentElement.lang = "";
});

async function renderSettings({
  locale = "en",
  localePreference = "system",
}: {
  locale?: AppLocale;
  localePreference?: LocalePreference;
} = {}) {
  const history = createMemoryHistory({ initialEntries: ["/settings"] });
  const router = createAppRouter({ history });
  const screen = await renderWithProviders(<RouterProvider router={router} />, {
    locale,
    localePreference,
  });

  return { history, router, screen };
}

function languageValue() {
  const value = document.querySelector('[data-slot="autocomplete-value"]');
  if (value == null) {
    throw new Error("Expected the Autocomplete value slot to be rendered");
  }

  return page.elementLocator(value);
}

test("opens and returns through the production router without replacing the app runtime", async () => {
  const history = createMemoryHistory({
    initialEntries: ["/?threadId=settings-thread#launch-token"],
  });
  const router = createAppRouter({ history });
  const warnSpy = vi.spyOn(console, "warn");
  const screen = await renderWithProviders(<RouterProvider router={router} />);
  const settingsButton = screen.getByRole("button", { name: "Settings" });

  await expect.element(settingsButton).toBeVisible();
  expect(history.length).toBe(1);
  expect(guiHostClientMock.startGuiHostConnection).toHaveBeenCalledTimes(1);

  await settingsButton.click();

  const settingsHeading = screen.getByRole("heading", {
    level: 1,
    name: "Settings",
  });
  await expect.element(settingsHeading).toBeVisible();
  expect(warnSpy).not.toHaveBeenCalledWith(
    'If a Dialog does not contain a <Heading slot="title">, it must have an aria-label or aria-labelledby attribute for accessibility.',
  );
  await expect.element(settingsHeading).toHaveFocus();
  await expect.element(screen.getByRole("button", { name: "Back" })).toBeVisible();
  await expect
    .element(screen.getByText("Manage Codex GUI preferences on this device."))
    .toBeVisible();
  await expect.element(screen.getByRole("region", { name: "Language" })).toBeVisible();
  expect(router.state.location.pathname).toBe("/settings");
  expect(router.state.location.searchStr).toBe("?threadId=settings-thread");
  expect(router.state.location.hash).toBe("");
  expect(history.length).toBe(1);
  expect(guiHostClientMock.startGuiHostConnection).toHaveBeenCalledTimes(1);
  expect(getCleanupConnectionCallCount()).toBe(0);

  await screen.getByRole("button", { name: "Back" }).click();

  await expect.element(settingsButton).toBeVisible();
  await expect.element(settingsButton).toHaveFocus();
  expect(router.state.location.pathname).toBe("/");
  expect(router.state.location.searchStr).toBe("?threadId=settings-thread");
  expect(router.state.location.hash).toBe("");
  expect(history.length).toBe(1);
  expect(guiHostClientMock.startGuiHostConnection).toHaveBeenCalledTimes(1);
  expect(getCleanupConnectionCallCount()).toBe(0);
});

test("shows the three locale preferences without a clearable selection or autofocus", async () => {
  const { screen } = await renderSettings();
  const currentLanguage = languageValue();

  await expect.element(currentLanguage).toBeVisible();
  await expect.element(currentLanguage).toHaveTextContent(/^Follow system$/);
  await expect
    .element(screen.getByRole("button", { name: "Clear language selection" }))
    .not.toBeInTheDocument();

  await currentLanguage.click();

  const search = screen.getByRole("searchbox", { name: "Search languages" });
  const languageOptionsDialog = screen.getByRole("dialog", {
    name: "Language options",
  });
  const languageOptionsHeading = screen.getByRole("heading", {
    name: "Language options",
  });
  await expect.element(languageOptionsDialog).toBeVisible();
  await expect.element(languageOptionsHeading).toHaveFocus();
  await expect.element(search).toBeVisible();
  await expect.element(search).not.toHaveFocus();
  await expect
    .element(screen.getByRole("option", { name: "Follow system", exact: true }))
    .toBeVisible();
  await expect.element(screen.getByRole("option", { name: "English", exact: true })).toBeVisible();
  await expect
    .element(
      screen.getByRole("option", {
        name: "Simplified Chinese · 简体中文",
        exact: true,
      }),
    )
    .toBeVisible();
  await expect
    .element(screen.getByRole("option", { name: "English · English", exact: true }))
    .not.toBeInTheDocument();
  expect(document.querySelectorAll('[role="option"]')).toHaveLength(3);
});

test("searches by current and native locale names and exposes an empty state", async () => {
  const { screen } = await renderSettings();
  const currentLanguage = languageValue();
  await expect.element(currentLanguage).toHaveTextContent(/^Follow system$/);
  await currentLanguage.click();
  const search = screen.getByRole("searchbox", { name: "Search languages" });

  for (const [query, option] of [
    ["Simplified", "Simplified Chinese · 简体中文"],
    ["简体中文", "Simplified Chinese · 简体中文"],
    ["English", "English"],
  ] as const) {
    await search.fill(query);
    await expect.element(screen.getByRole("option", { name: option, exact: true })).toBeVisible();
  }

  await search.fill("Klingon");
  await expect.element(screen.getByText("No languages found")).toBeVisible();
  await expect
    .element(screen.getByRole("option", { name: "Follow system", exact: true }))
    .not.toBeInTheDocument();
  await expect
    .element(screen.getByRole("option", { name: "English", exact: true }))
    .not.toBeInTheDocument();
  await expect
    .element(
      screen.getByRole("option", {
        name: "Simplified Chinese · 简体中文",
        exact: true,
      }),
    )
    .not.toBeInTheDocument();

  const clearSearch = screen.getByRole("button", { name: "Clear search" });
  await expect.element(clearSearch).toBeVisible();
  await clearSearch.click();

  await expect.element(search).toHaveValue("");
  await expect
    .element(screen.getByRole("option", { name: "Follow system", exact: true }))
    .toBeVisible();
  await expect.element(screen.getByRole("option", { name: "English", exact: true })).toBeVisible();
  await expect
    .element(
      screen.getByRole("option", {
        name: "Simplified Chinese · 简体中文",
        exact: true,
      }),
    )
    .toBeVisible();
  expect(document.querySelectorAll('[role="option"]')).toHaveLength(3);
  await expect
    .element(screen.getByRole("button", { name: "Clear language selection" }))
    .not.toBeInTheDocument();
});

test("selects with the keyboard and commits the locale after its catalog loads", async () => {
  const chineseCatalog = deferred<Messages>();
  catalogMock.loadCatalog.mockImplementation((locale) =>
    locale === "zh-CN" ? chineseCatalog.promise : Promise.resolve(catalogs.en),
  );
  const { screen } = await renderSettings();
  catalogMock.loadCatalog.mockClear();
  const languageControl = screen.getByRole("button", { name: "Language" });
  const currentLanguage = languageValue();

  await expect.element(currentLanguage).toHaveTextContent(/^Follow system$/);
  await currentLanguage.click();
  const search = screen.getByRole("searchbox", { name: "Search languages" });
  await search.fill("简体中文");
  await search.click();
  await screen.user.keyboard("{ArrowDown}{Enter}");

  await expect.element(languageControl).toBeDisabled();
  await expect.element(search).toBeVisible();
  await expect.element(search).toHaveValue("简体中文");
  expect(document.documentElement.lang).toBe("en");
  expect(window.localStorage.getItem("codex-gui.locale")).toBeNull();

  chineseCatalog.resolve(catalogs["zh-CN"]);

  await expect.element(languageControl).toBeEnabled();
  const selectedLanguage = languageValue();
  await expect.element(selectedLanguage).toBeVisible();
  await expect.element(selectedLanguage).toHaveTextContent(/^Simplified Chinese · 简体中文$/);
  await expect.element(search).not.toBeInTheDocument();
  expect(document.documentElement.lang).toBe("zh-CN");
  expect(window.localStorage.getItem("codex-gui.locale")).toBe("zh-CN");

  await selectedLanguage.click();
  const reopenedSearch = screen.getByRole("searchbox", { name: "Search languages" });
  await expect.element(reopenedSearch).toHaveValue("");
  await expect.element(reopenedSearch).not.toHaveFocus();
});

test("keeps the current preference and search open when the catalog fails", async () => {
  const failure = new Error("Chinese catalog unavailable");
  catalogMock.loadCatalog.mockImplementation((locale) =>
    locale === "zh-CN" ? Promise.reject(failure) : Promise.resolve(catalogs.en),
  );
  const { screen } = await renderSettings();
  const languageControl = screen.getByRole("button", { name: "Language" });
  const currentLanguage = languageValue();

  await expect.element(currentLanguage).toHaveTextContent(/^Follow system$/);
  await currentLanguage.click();
  const dialog = screen.getByRole("dialog", { name: "Language options" });
  const search = screen.getByRole("searchbox", { name: "Search languages" });
  await search.fill("简体中文");
  await screen.getByRole("option", { name: "Simplified Chinese · 简体中文", exact: true }).click();

  await expect.element(languageControl).toBeEnabled();
  await expect.element(currentLanguage).toHaveTextContent(/^Follow system$/);
  expect(document.documentElement.lang).toBe("en");
  expect(window.localStorage.getItem("codex-gui.locale")).toBeNull();
  await expect.element(dialog).toBeVisible();
  await expect.element(search).toBeVisible();
  await expect.element(search).toHaveValue("简体中文");
  await expect.element(screen.getByText("Language could not be changed")).toBeVisible();
  await expect.element(screen.getByText("Chinese catalog unavailable")).toBeVisible();
});

test("follows languagechange only while the system preference is selected", async () => {
  let systemLanguages: readonly string[] = ["en-US"];
  let systemLanguage = "en-US";
  vi.spyOn(window.navigator, "languages", "get").mockImplementation(() => systemLanguages);
  vi.spyOn(window.navigator, "language", "get").mockImplementation(() => systemLanguage);
  const { screen } = await renderSettings();
  catalogMock.loadCatalog.mockClear();

  systemLanguages = ["zh-SG"];
  systemLanguage = "zh-SG";
  window.dispatchEvent(new Event("languagechange"));

  await expect.element(screen.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  await expect.poll(() => document.documentElement.lang).toBe("zh-CN");
  expect(window.localStorage.getItem("codex-gui.locale")).toBeNull();

  const currentLanguage = languageValue();
  await expect.element(currentLanguage).toHaveTextContent(/^Follow system$/);
  await currentLanguage.click();
  await screen.getByRole("searchbox", { name: "Search languages" }).fill("English");
  await screen.getByRole("option", { name: "English", exact: true }).click();

  await expect.poll(() => document.documentElement.lang).toBe("en");
  expect(window.localStorage.getItem("codex-gui.locale")).toBe("en");
  catalogMock.loadCatalog.mockClear();

  systemLanguages = ["zh-CN"];
  systemLanguage = "zh-CN";
  window.dispatchEvent(new Event("languagechange"));

  await expect.element(currentLanguage).toBeVisible();
  await expect.element(currentLanguage).toHaveTextContent(/^English$/);
  expect(document.documentElement.lang).toBe("en");
  expect(catalogMock.loadCatalog).not.toHaveBeenCalled();
});
