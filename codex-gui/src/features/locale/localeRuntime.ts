export const defaultLocale = "en";
export const localeStorageKey = "codex-gui.locale";

export type LocalePreference = "system" | "en" | "zh-CN";
export type AppLocale = Exclude<LocalePreference, "system">;

export type LocaleStorageWarning = {
  kind: "storage-read-failed" | "storage-write-failed";
  cause: unknown;
};

type LocalePreferenceStorageReader = Pick<Storage, "getItem">;
type LocalePreferenceStorageWriter = Pick<Storage, "setItem">;

export function isAppLocale(locale: string | null | undefined): locale is AppLocale {
  return locale === "en" || locale === "zh-CN";
}

export function isLocalePreference(
  preference: string | null | undefined,
): preference is LocalePreference {
  return preference === "system" || isAppLocale(preference);
}

export function readLocalePreference(storage: LocalePreferenceStorageReader): {
  preference: LocalePreference;
  warning: LocaleStorageWarning | null;
} {
  try {
    const storedPreference = storage.getItem(localeStorageKey);
    return {
      preference: isLocalePreference(storedPreference) ? storedPreference : "system",
      warning: null,
    };
  } catch (cause) {
    return {
      preference: "system",
      warning: { kind: "storage-read-failed", cause },
    };
  }
}

export function writeLocalePreference(
  storage: LocalePreferenceStorageWriter,
  preference: LocalePreference,
): LocaleStorageWarning | null {
  try {
    storage.setItem(localeStorageKey, preference);
    return null;
  } catch (cause) {
    return { kind: "storage-write-failed", cause };
  }
}

type LocaleCandidateResolution = AppLocale | "continue";

function resolveLocaleCandidate(localeTag: string): LocaleCandidateResolution {
  let locale: Intl.Locale;
  try {
    locale = new Intl.Locale(localeTag);
  } catch {
    return "continue";
  }

  if (locale.language === "en") {
    return "en";
  }
  if (locale.language !== "zh") {
    return "continue";
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

export function resolveSystemLocale(
  languages: readonly string[],
  fallbackLanguage: string,
): AppLocale {
  const candidates = languages.length > 0 ? languages : [fallbackLanguage];
  for (const localeTag of candidates) {
    const resolution = resolveLocaleCandidate(localeTag);
    if (resolution !== "continue") {
      return resolution;
    }
  }
  return defaultLocale;
}

export function resolveActiveLocale(
  preference: LocalePreference,
  languages: readonly string[],
  fallbackLanguage: string,
): AppLocale {
  return preference === "system"
    ? resolveSystemLocale(languages, fallbackLanguage)
    : preference;
}
