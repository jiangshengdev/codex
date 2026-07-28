import type { Key } from "react";
import { Label, ListBox, Select } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { availableLocales, loadCatalog, saveLocale, toAppLocale, type AppLocale } from "./i18n";

export function LanguageSwitcher() {
  const { i18n, t } = useLingui();
  const [locale, setLocale] = useState<AppLocale>(() => toAppLocale(i18n.locale));
  const [isLoading, setIsLoading] = useState(false);

  const handleLocaleChange = (value: Key | Key[] | null) => {
    const nextLocale = toAppLocale(Array.isArray(value) ? String(value[0]) : String(value));

    if (nextLocale === locale) {
      return;
    }

    setIsLoading(true);

    void loadCatalog(nextLocale, i18n)
      .then(() => {
        saveLocale(nextLocale);
        setLocale(nextLocale);
      })
      .finally(() => {
        setIsLoading(false);
      });
  };

  return (
    <Select
      aria-label={t`Language`}
      className="w-40"
      isDisabled={isLoading}
      value={locale}
      variant="secondary"
      onChange={handleLocaleChange}
    >
      <Label>{t`Language`}</Label>
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {availableLocales.map((option) => (
            <ListBox.Item key={option.locale} id={option.locale} textValue={option.label}>
              {option.label}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}
