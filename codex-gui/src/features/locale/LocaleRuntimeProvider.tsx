import { useCallback, useEffect, useMemo, useRef, useState, type PropsWithChildren } from "react";
import type { I18n } from "@lingui/core";
import { useLingui } from "@lingui/react/macro";
import { toast } from "@heroui/react";
import { loadCatalog } from "@/i18n";
import { LocaleRuntimeContext, type AppLocaleRuntime } from "./LocaleRuntimeContext";
import {
  isAppLocale,
  readLocalePreference,
  resolveSystemLocale,
  writeLocalePreference,
  type AppLocale,
  type LocalePreference,
  type LocaleStorageWarning,
} from "./localeRuntime";
import type { LocaleRuntimeBootstrap } from "./localeRuntimeBootstrap";

export type { AppLocaleRuntime } from "./LocaleRuntimeContext";
export type { LocaleRuntimeBootstrap } from "./localeRuntimeBootstrap";

type LocaleRuntimeProviderProps = PropsWithChildren<{
  initialState?: LocaleRuntimeBootstrap;
}>;

function currentSystemLocale(): AppLocale {
  return resolveSystemLocale(navigator.languages, navigator.language);
}

function errorDescription(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function activateLocale(
  i18n: I18n,
  locale: AppLocale,
  messages: Awaited<ReturnType<typeof loadCatalog>>,
) {
  i18n.loadAndActivate({ locale, messages });
  document.documentElement.lang = locale;
}

export function LocaleRuntimeProvider({ children, initialState }: LocaleRuntimeProviderProps) {
  const { i18n, t } = useLingui();
  const derivedInitialState = useMemo<LocaleRuntimeBootstrap>(() => {
    if (initialState != null) {
      return initialState;
    }
    const { preference, warning } = readLocalePreference(localStorage);
    return {
      preference,
      activeLocale: isAppLocale(i18n.locale) ? i18n.locale : "en",
      warning,
    };
  }, [i18n, initialState]);
  const [preference, setPreferenceState] = useState(derivedInitialState.preference);
  const [activeLocale, setActiveLocale] = useState(derivedInitialState.activeLocale);
  const [isChanging, setIsChanging] = useState(false);
  const activeLocaleRef = useRef(activeLocale);
  const preferenceRef = useRef(preference);
  const requestedPreferenceRef = useRef(preference);
  const generationRef = useRef(0);
  const initialWarningRef = useRef(derivedInitialState.warning);

  const publishStorageWarning = useCallback(
    (warning: LocaleStorageWarning): void => {
      const title =
        warning.kind === "storage-read-failed"
          ? t`Language preference could not be loaded`
          : t`Language preference could not be saved`;
      toast.warning(title, { description: errorDescription(warning.cause) });
    },
    [t],
  );

  useEffect(() => {
    const warning = initialWarningRef.current;
    if (warning == null) {
      return;
    }
    initialWarningRef.current = null;
    publishStorageWarning(warning);
  }, [publishStorageWarning]);

  const requestLocale = useCallback(
    async (targetLocale: AppLocale, nextPreference: LocalePreference | null): Promise<void> => {
      const generation = generationRef.current + 1;
      generationRef.current = generation;

      const commitPreference = (): void => {
        if (nextPreference == null) {
          return;
        }
        preferenceRef.current = nextPreference;
        requestedPreferenceRef.current = nextPreference;
        setPreferenceState(nextPreference);
        const warning = writeLocalePreference(localStorage, nextPreference);
        if (warning != null) {
          publishStorageWarning(warning);
        }
      };

      if (targetLocale === activeLocaleRef.current) {
        commitPreference();
        setIsChanging(false);
        return;
      }

      setIsChanging(true);
      try {
        const messages = await loadCatalog(targetLocale);
        if (generation !== generationRef.current) {
          return;
        }
        activateLocale(i18n, targetLocale, messages);
        activeLocaleRef.current = targetLocale;
        setActiveLocale(targetLocale);
        commitPreference();
        setIsChanging(false);
      } catch (error) {
        if (generation !== generationRef.current) {
          return;
        }
        requestedPreferenceRef.current = preferenceRef.current;
        setIsChanging(false);
        toast.danger(t`Language could not be changed`, {
          description: errorDescription(error),
        });
        throw error;
      }
    },
    [i18n, publishStorageWarning, t],
  );

  const setPreference = useCallback(
    async (nextPreference: LocalePreference): Promise<void> => {
      requestedPreferenceRef.current = nextPreference;
      const targetLocale = nextPreference === "system" ? currentSystemLocale() : nextPreference;
      await requestLocale(targetLocale, nextPreference);
    },
    [requestLocale],
  );

  useEffect(() => {
    if (preference !== "system") {
      return;
    }
    const handleLanguageChange = (): void => {
      if (requestedPreferenceRef.current === "system") {
        void requestLocale(currentSystemLocale(), null).catch(() => {
          // requestLocale publishes the failure before rejecting; this internal caller has no
          // consumer that can observe the returned promise.
        });
      }
    };
    window.addEventListener("languagechange", handleLanguageChange);
    return () => {
      window.removeEventListener("languagechange", handleLanguageChange);
    };
  }, [preference, requestLocale]);

  const runtime = useMemo<AppLocaleRuntime>(
    () => ({ preference, activeLocale, isChanging, setPreference }),
    [activeLocale, isChanging, preference, setPreference],
  );

  return <LocaleRuntimeContext value={runtime}>{children}</LocaleRuntimeContext>;
}
