import type { I18n, Messages } from "@lingui/core";
import {
  defaultLocale,
  isAppLocale,
  localeStorageKey,
  readLocalePreference,
  resolveActiveLocale,
  type AppLocale,
} from "@/features/locale/localeRuntime";

export { defaultLocale, isAppLocale, localeStorageKey, type AppLocale };

export const availableLocales = [
  { locale: "en", label: "English" },
  { locale: "zh-CN", label: "简体中文" },
] as const;

export function toAppLocale(locale: string | null | undefined): AppLocale {
  return isAppLocale(locale) ? locale : defaultLocale;
}

export function saveLocale(locale: AppLocale) {
  localStorage.setItem(localeStorageKey, locale);
}

export function resolveInitialLocale(): AppLocale {
  const { preference } = readLocalePreference(localStorage);
  return resolveActiveLocale(preference, navigator.languages, navigator.language);
}

/**
 * Load messages for requested locale and activate it.
 * This function isn't part of the LinguiJS library because there are
 * many ways how to load messages — from REST API, from file, from cache, etc.
 */
export async function loadCatalog(locale: AppLocale): Promise<Messages>;
export async function loadCatalog(locale: AppLocale, i18n: I18n): Promise<Messages>;
export async function loadCatalog(locale: AppLocale, i18n?: I18n): Promise<Messages> {
  const catalog = (await import(`./locales/${locale}.po`)) as { messages: Messages };
  if (i18n != null) {
    i18n.loadAndActivate({ locale, messages: catalog.messages });
    document.documentElement.lang = locale;
  }
  return catalog.messages;
}
