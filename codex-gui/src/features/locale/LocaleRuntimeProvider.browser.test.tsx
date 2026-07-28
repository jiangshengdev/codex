import type { PropsWithChildren } from "react";
import { setupI18n, type Messages } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { Toast, toast } from "@heroui/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import type { AppLocale } from "./localeRuntime";
import { useLocaleRuntime } from "./LocaleRuntimeContext";
import { LocaleRuntimeProvider } from "./LocaleRuntimeProvider";
import { bootstrapLocaleRuntime } from "./localeRuntimeBootstrap";

const catalogMock = vi.hoisted(() => ({
  loadCatalog: vi.fn<(locale: AppLocale) => Promise<Messages>>(),
}));

vi.mock("@/i18n", () => ({
  loadCatalog: catalogMock.loadCatalog,
}));

const catalogs: Record<AppLocale, Messages> = {
  en: {},
  "zh-CN": {},
};

let latestPreferenceChange: Promise<void> | null = null;

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

function RuntimeProbe() {
  const runtime = useLocaleRuntime();
  const setPreference = (preference: "system" | AppLocale): void => {
    latestPreferenceChange = runtime.setPreference(preference);
    void latestPreferenceChange.catch(() => undefined);
  };

  return (
    <section aria-label="Locale runtime">
      <output aria-label="Preference">{runtime.preference}</output>
      <output aria-label="Active locale">{runtime.activeLocale}</output>
      <output aria-label="Changing">{String(runtime.isChanging)}</output>
      <output aria-label="Runtime interface">{Object.keys(runtime).sort().join(",")}</output>
      <button type="button" onClick={() => { setPreference("system"); }}>
        Use system
      </button>
      <button type="button" onClick={() => { setPreference("en"); }}>
        Use English
      </button>
      <button type="button" onClick={() => { setPreference("zh-CN"); }}>
        Use Simplified Chinese
      </button>
    </section>
  );
}

function RuntimeTestRoot({ children }: PropsWithChildren) {
  const i18n = setupI18n();
  i18n.loadAndActivate({ locale: "en", messages: catalogs.en });

  return (
    <I18nProvider i18n={i18n}>
      <Toast.Provider placement="top" />
      <LocaleRuntimeProvider>{children}</LocaleRuntimeProvider>
    </I18nProvider>
  );
}

let systemLanguages: readonly string[];
let systemLanguage: string;

beforeEach(() => {
  toast.clear();
  latestPreferenceChange = null;
  systemLanguages = ["en-US"];
  systemLanguage = "en-US";
  vi.spyOn(window.navigator, "languages", "get").mockImplementation(() => systemLanguages);
  vi.spyOn(window.navigator, "language", "get").mockImplementation(() => systemLanguage);
  window.localStorage.clear();
  document.documentElement.lang = "en";
  catalogMock.loadCatalog.mockReset();
  catalogMock.loadCatalog.mockImplementation((locale) => Promise.resolve(catalogs[locale]));
});

afterEach(() => {
  toast.clear();
  vi.restoreAllMocks();
  window.localStorage.clear();
  document.documentElement.lang = "";
});

async function renderRuntime() {
  return render(<RuntimeProbe />, { wrapper: RuntimeTestRoot });
}

test("exposes only the product locale state and preference operation", async () => {
  const screen = await renderRuntime();

  await expect.element(screen.getByLabelText("Preference")).toHaveTextContent("system");
  await expect.element(screen.getByLabelText("Active locale")).toHaveTextContent("en");
  await expect.element(screen.getByLabelText("Changing")).toHaveTextContent("false");
  await expect
    .element(screen.getByLabelText("Runtime interface"))
    .toHaveTextContent("activeLocale,isChanging,preference,setPreference");
});

test("reacts to languagechange only for the system preference and skips duplicate loads", async () => {
  const screen = await renderRuntime();
  expect(catalogMock.loadCatalog).not.toHaveBeenCalled();

  systemLanguages = ["zh-SG"];
  window.dispatchEvent(new Event("languagechange"));

  await expect.element(screen.getByLabelText("Active locale")).toHaveTextContent("zh-CN");
  await expect.element(screen.getByLabelText("Changing")).toHaveTextContent("false");
  expect(catalogMock.loadCatalog).toHaveBeenCalledTimes(1);
  expect(catalogMock.loadCatalog).toHaveBeenCalledWith("zh-CN");
  expect(document.documentElement.lang).toBe("zh-CN");

  window.dispatchEvent(new Event("languagechange"));
  await expect.element(screen.getByLabelText("Active locale")).toHaveTextContent("zh-CN");
  expect(catalogMock.loadCatalog).toHaveBeenCalledTimes(1);

  await screen.getByRole("button", { name: "Use English" }).click();
  await expect.element(screen.getByLabelText("Preference")).toHaveTextContent("en");
  await expect.element(screen.getByLabelText("Active locale")).toHaveTextContent("en");
  await expect.element(screen.getByLabelText("Changing")).toHaveTextContent("false");
  expect(catalogMock.loadCatalog).toHaveBeenCalledTimes(2);

  systemLanguages = ["zh-CN"];
  window.dispatchEvent(new Event("languagechange"));
  await expect.element(screen.getByLabelText("Active locale")).toHaveTextContent("en");
  expect(catalogMock.loadCatalog).toHaveBeenCalledTimes(2);
});

test("does not let a late catalog overwrite the latest preference", async () => {
  const chineseCatalog = deferred<Messages>();
  catalogMock.loadCatalog.mockImplementation((locale) =>
    locale === "zh-CN" ? chineseCatalog.promise : Promise.resolve(catalogs.en),
  );
  const screen = await renderRuntime();

  await screen.getByRole("button", { name: "Use Simplified Chinese" }).click();
  await expect.element(screen.getByLabelText("Changing")).toHaveTextContent("true");

  await screen.getByRole("button", { name: "Use English" }).click();
  await expect.element(screen.getByLabelText("Preference")).toHaveTextContent("en");
  await expect.element(screen.getByLabelText("Active locale")).toHaveTextContent("en");
  await expect.element(screen.getByLabelText("Changing")).toHaveTextContent("false");

  chineseCatalog.resolve(catalogs["zh-CN"]);

  await expect.element(screen.getByLabelText("Active locale")).toHaveTextContent("en");
  expect(document.documentElement.lang).toBe("en");
  expect(window.localStorage.getItem("codex-gui.locale")).toBe("en");
});

test("keeps the previous locale usable and publishes the catalog failure", async () => {
  const failure = new Error("catalog download failed");
  catalogMock.loadCatalog.mockRejectedValueOnce(failure);
  const screen = await renderRuntime();

  await screen.getByRole("button", { name: "Use Simplified Chinese" }).click();

  expect(latestPreferenceChange).not.toBeNull();
  await expect(latestPreferenceChange).rejects.toBe(failure);

  await expect.element(screen.getByLabelText("Preference")).toHaveTextContent("system");
  await expect.element(screen.getByLabelText("Active locale")).toHaveTextContent("en");
  await expect.element(screen.getByLabelText("Changing")).toHaveTextContent("false");
  await expect.element(screen.getByText("catalog download failed")).toBeVisible();
  expect(document.documentElement.lang).toBe("en");
});

test("applies an in-memory selection and warns when persistence fails", async () => {
  const failure = new Error("storage write denied");
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw failure;
  });
  const screen = await renderRuntime();

  await screen.getByRole("button", { name: "Use Simplified Chinese" }).click();

  await expect.element(screen.getByLabelText("Preference")).toHaveTextContent("zh-CN");
  await expect.element(screen.getByLabelText("Active locale")).toHaveTextContent("zh-CN");
  await expect.element(screen.getByText("storage write denied")).toBeVisible();
  expect(document.documentElement.lang).toBe("zh-CN");
});

test("starts with the system preference and warns when storage cannot be read", async () => {
  const failure = new Error("storage read denied");
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw failure;
  });

  const screen = await renderRuntime();

  await expect.element(screen.getByLabelText("Preference")).toHaveTextContent("system");
  await expect.element(screen.getByLabelText("Active locale")).toHaveTextContent("en");
  await expect.element(screen.getByText("storage read denied")).toBeVisible();
});

test("rejects bootstrap with the original catalog failure", async () => {
  const failure = new Error("bootstrap catalog download failed");
  catalogMock.loadCatalog.mockRejectedValueOnce(failure);
  const i18n = setupI18n();

  await expect(bootstrapLocaleRuntime(i18n)).rejects.toBe(failure);
  expect(catalogMock.loadCatalog).toHaveBeenCalledWith("en");
});
