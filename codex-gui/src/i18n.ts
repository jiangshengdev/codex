import type { I18n, Messages } from "@lingui/core";

export type AppLocale = "en" | "zh-CN";

export const defaultLocale: AppLocale = "en";

export function resolveBrowserLocale(browserLocales: readonly string[]): AppLocale {
  for (const browserLocale of browserLocales) {
    let locale: Intl.Locale;

    try {
      locale = new Intl.Locale(browserLocale);
    } catch {
      continue;
    }

    if (locale.language === "en") {
      return "en";
    }

    if (locale.language !== "zh") {
      continue;
    }

    if (locale.script === "Hans") {
      return "zh-CN";
    }

    if (locale.script === "Hant") {
      return "en";
    }

    if (locale.region === "CN" || locale.region === "SG") {
      return "zh-CN";
    }

    if (locale.region === "TW" || locale.region === "HK" || locale.region === "MO") {
      return "en";
    }

    return locale.maximize().script === "Hans" ? "zh-CN" : "en";
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
