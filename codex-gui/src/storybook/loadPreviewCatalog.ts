import type { I18n, Messages } from "@lingui/core";
import type { AppLocale } from "@/i18n";

export async function loadPreviewCatalog(locale: AppLocale, i18n: I18n) {
  const [product, preview] = await Promise.all([
    import(`../locales/${locale}.po`) as Promise<{ messages: Messages }>,
    import(`./locales/${locale}.po`) as Promise<{ messages: Messages }>,
  ]);
  // Extraction makes the preview catalog disjoint from the product catalog.
  i18n.loadAndActivate({ locale, messages: { ...product.messages, ...preview.messages } });
  document.documentElement.lang = locale;
}
