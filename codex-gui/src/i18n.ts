import type { I18n, Messages } from "@lingui/core";

export const defaultLocale = "en";
export const localeStorageKey = "codex-gui.locale";

export const availableLocales = [
  { locale: "en", label: "English" },
  { locale: "zh-CN", label: "简体中文" },
] as const;

export type AppLocale = (typeof availableLocales)[number]["locale"];

export function isAppLocale(locale: string | null | undefined): locale is AppLocale {
  return availableLocales.some((entry) => entry.locale === locale);
}

export function toAppLocale(locale: string | null | undefined): AppLocale {
  return isAppLocale(locale) ? locale : defaultLocale;
}

function localeFromBrowserLocale(browserLocale: string): AppLocale | undefined {
  if (isAppLocale(browserLocale)) {
    return browserLocale;
  }

  const language = browserLocale.split("-")[0];

  return availableLocales.find((entry) => entry.locale.split("-")[0] === language)?.locale;
}

export function saveLocale(locale: AppLocale) {
  localStorage.setItem(localeStorageKey, locale);
}

export function resolveInitialLocale(): AppLocale {
  const storedLocale = localStorage.getItem(localeStorageKey);

  if (isAppLocale(storedLocale)) {
    return storedLocale;
  }

  const browserLocales =
    navigator.languages.length > 0 ? navigator.languages : [navigator.language];

  for (const browserLocale of browserLocales) {
    const locale = localeFromBrowserLocale(browserLocale);

    if (locale) {
      return locale;
    }
  }

  return defaultLocale;
}

/**
 * Load messages for requested locale and activate it.
 * This function isn't part of the LinguiJS library because there are
 * many ways how to load messages — from REST API, from file, from cache, etc.
 */
export async function loadCatalog(locale: AppLocale, i18n: I18n) {
  const catalog = (await import(`./locales/${locale}.po`)) as { messages: Messages };
  i18n.loadAndActivate({ locale, messages: catalog.messages });
  document.documentElement.lang = locale;
}
