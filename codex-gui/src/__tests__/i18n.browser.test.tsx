import { useState } from "react";
import { useLingui } from "@lingui/react";
import { expect, it } from "vitest";
import { renderWithProviders } from "@/utils/test-utils";

const LocaleProbe = () => {
  const { i18n } = useLingui();
  const [initialLocaleState] = useState(() => `${i18n.locale}:${document.documentElement.lang}`);

  return (
    <output aria-label="locale probe" role="status">
      {initialLocaleState}
    </output>
  );
};

it("activates the requested locale before rendering", async () => {
  const previousDocumentLocale = document.documentElement.lang;

  try {
    const screen = await renderWithProviders(<LocaleProbe />, { locale: "zh-CN" });

    await expect
      .element(screen.getByRole("status", { name: "locale probe" }))
      .toHaveTextContent("zh-CN:zh-CN");
  } finally {
    document.documentElement.lang = previousDocumentLocale;
  }
});
