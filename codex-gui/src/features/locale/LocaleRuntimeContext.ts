import { createContext, use } from "react";
import type { AppLocale, LocalePreference } from "./localeRuntime";

export type AppLocaleRuntime = {
  preference: LocalePreference;
  activeLocale: AppLocale;
  isChanging: boolean;
  setPreference(preference: LocalePreference): Promise<void>;
};

export const LocaleRuntimeContext = createContext<AppLocaleRuntime | null>(null);

export function useLocaleRuntime(): AppLocaleRuntime {
  const runtime = use(LocaleRuntimeContext);
  if (runtime == null) {
    throw new Error("useLocaleRuntime must be used within LocaleRuntimeProvider");
  }
  return runtime;
}
