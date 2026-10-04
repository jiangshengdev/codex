import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { Suspense, use, type PropsWithChildren } from "react";
import { ThemeProvider } from "@/app/ThemeProvider";
import { ThemePreferenceControl } from "@/app/ThemePreferenceControl";
import { createThemePreferenceStore } from "@/app/themePreference";
import { resolveBrowserLocale } from "@/i18n";
import { loadPreviewCatalog } from "./loadPreviewCatalog";
import { DevOnly } from "./DevOnly";
import { DevVisibilityProvider } from "./DevVisibilityProvider";

const language = (async () => {
  const i18n = setupI18n();
  const locales = navigator.languages.length > 0 ? navigator.languages : [navigator.language];
  await loadPreviewCatalog(resolveBrowserLocale(locales), i18n);
  return i18n;
})();

// The preview document owns this preference; Story remounts retain it, reloads do not.
const themePreference = createThemePreferenceStore();

function LocalizedPreview({
  children,
  hasFixedHeader,
}: PropsWithChildren<{ hasFixedHeader: boolean }>) {
  const i18n = use(language);
  return (
    <I18nProvider i18n={i18n}>
      <DevOnly
        className={`mb-4 w-fit justify-self-end ml-auto ${hasFixedHeader ? "mt-16 mr-4" : ""}`}
      >
        <ThemePreferenceControl />
      </DevOnly>
      {children}
    </I18nProvider>
  );
}

export function StorybookEnvironment({
  children,
  hasFixedHeader = false,
}: PropsWithChildren<{ hasFixedHeader?: boolean }>) {
  return (
    <ThemeProvider preferenceStore={themePreference}>
      <Suspense>
        <DevVisibilityProvider>
          <LocalizedPreview hasFixedHeader={hasFixedHeader}>{children}</LocalizedPreview>
        </DevVisibilityProvider>
      </Suspense>
    </ThemeProvider>
  );
}
