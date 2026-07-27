import type { I18n } from "@lingui/core";
import { loadCatalog } from "@/i18n";
import {
  readLocalePreference,
  resolveActiveLocale,
  type AppLocale,
  type LocalePreference,
  type LocaleStorageWarning,
} from "./localeRuntime";

export type LocaleRuntimeBootstrap = {
  preference: LocalePreference;
  activeLocale: AppLocale;
  warning: LocaleStorageWarning | null;
};

export async function bootstrapLocaleRuntime(i18n: I18n): Promise<LocaleRuntimeBootstrap> {
  const { preference, warning } = readLocalePreference(localStorage);
  const activeLocale = resolveActiveLocale(
    preference,
    navigator.languages,
    navigator.language,
  );
  const messages = await loadCatalog(activeLocale);
  i18n.loadAndActivate({ locale: activeLocale, messages });
  document.documentElement.lang = activeLocale;
  return { preference, activeLocale, warning };
}
