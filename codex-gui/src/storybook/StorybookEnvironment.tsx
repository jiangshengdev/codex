import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { Suspense, use, type PropsWithChildren } from "react";
import { ThemeProvider } from "@/app/ThemeProvider";
import { loadCatalog, resolveBrowserLocale } from "@/i18n";

const language = (async () => {
  const i18n = setupI18n();
  const locales = navigator.languages.length > 0 ? navigator.languages : [navigator.language];
  await loadCatalog(resolveBrowserLocale(locales), i18n);
  return i18n;
})();

function LocalizedPreview({ children }: PropsWithChildren) {
  const i18n = use(language);
  return <I18nProvider i18n={i18n}>{children}</I18nProvider>;
}

export function StorybookEnvironment({ children }: PropsWithChildren) {
  return (
    <ThemeProvider>
      <Suspense>
        <LocalizedPreview>{children}</LocalizedPreview>
      </Suspense>
    </ThemeProvider>
  );
}
