import type { Key } from "@heroui/react";
import {
  Autocomplete,
  EmptyState,
  Label,
  ListBox,
  Popover,
  SearchField,
  useFilter,
} from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocaleRuntime } from "@/features/locale/LocaleRuntimeProvider";
import {
  isLocalePreference,
  type LocalePreference,
} from "@/features/locale/localeRuntime";

type LanguageOption = {
  preference: LocalePreference;
  displayName: string;
  textValue: string;
};

function languageName(currentName: string, nativeName?: string): string {
  return nativeName == null || nativeName === currentName
    ? currentName
    : `${currentName} · ${nativeName}`;
}

export function LanguageAutocomplete() {
  const { t } = useLingui();
  const runtime = useLocaleRuntime();
  const { contains } = useFilter({ sensitivity: "base" });
  const [isOpen, setIsOpen] = useState(false);
  const [isSearchReady, setIsSearchReady] = useState(false);
  const [query, setQuery] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const isSubmittingRef = useRef(false);
  const options = useMemo<LanguageOption[]>(() => {
    const followSystem = t({
      comment:
        "Language preference option that follows the operating system or browser language",
      message: "Follow system",
    });
    const english = t({
      comment:
        "Autocomplete option showing the English language name in the current UI language",
      message: "English",
    });
    const simplifiedChinese = t({
      comment:
        "Autocomplete option showing the Simplified Chinese language name in the current UI language",
      message: "Simplified Chinese",
    });

    return [
      {
        preference: "system",
        displayName: followSystem,
        textValue: followSystem,
      },
      {
        preference: "en",
        displayName: languageName(english, "English"),
        textValue: languageName(english, "English"),
      },
      {
        preference: "zh-CN",
        displayName: languageName(simplifiedChinese, "简体中文"),
        textValue: languageName(simplifiedChinese, "简体中文"),
      },
    ];
  }, [t]);
  const selectedOption = options.find(
    (option) => option.preference === runtime.preference,
  );
  const searchLanguages = t({
    comment: "Accessible label and placeholder for the language search input",
    message: "Search languages",
  });

  useEffect(() => {
    if (isOpen && !isSearchReady) {
      setIsSearchReady(true);
    }
  }, [isOpen, isSearchReady]);

  useEffect(() => {
    if (isOpen && isSearchReady) {
      headingRef.current?.focus({ preventScroll: true });
    }
  }, [isOpen, isSearchReady]);

  const onOpenChange = (nextIsOpen: boolean): void => {
    if (!nextIsOpen && isSubmittingRef.current) {
      return;
    }

    if (nextIsOpen) {
      setIsSearchReady(false);
      setIsOpen(true);
      return;
    }

    setIsSearchReady(false);
    setIsOpen(nextIsOpen);
    if (!nextIsOpen && !runtime.isChanging) {
      setQuery("");
    }
  };

  const onPreferenceChange = async (value: Key | Key[] | null): Promise<void> => {
    if (typeof value !== "string" || !isLocalePreference(value)) {
      return;
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    try {
      await runtime.setPreference(value);
      setIsSearchReady(false);
      setIsOpen(false);
      setQuery("");
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-sm">
      <Autocomplete
        allowsEmptyCollection
        fullWidth
        isDisabled={runtime.isChanging || isSubmitting}
        isOpen={isOpen}
        onChange={(value) => {
          void onPreferenceChange(value);
        }}
        onOpenChange={onOpenChange}
        placeholder={t({
          comment: "Placeholder for the language preference autocomplete",
          message: "Choose a language",
        })}
        selectionMode="single"
        value={runtime.preference}
        variant="secondary"
      >
        <Label>
          <Trans comment="Label for the language preference field">
            Language
          </Trans>
        </Label>
        <Autocomplete.Trigger>
          <Autocomplete.Value>
            {({ defaultChildren }) =>
              selectedOption?.displayName ?? defaultChildren
            }
          </Autocomplete.Value>
          <Autocomplete.Indicator />
        </Autocomplete.Trigger>
        <Autocomplete.Popover>
          <Popover.Heading
            ref={headingRef}
            className="sr-only"
            tabIndex={0}
          >
            <Trans comment="Accessible title for the language options dialog">
              Language options
            </Trans>
          </Popover.Heading>
          <Autocomplete.Filter
            filter={contains}
            inputValue={query}
            onInputChange={setQuery}
          >
            <SearchField
              aria-label={searchLanguages}
              autoFocus={false}
              isDisabled={!isSearchReady}
              name="language-search"
              variant="secondary"
            >
              <SearchField.Group>
                <SearchField.SearchIcon />
                <SearchField.Input placeholder={searchLanguages} />
              </SearchField.Group>
            </SearchField>
            <ListBox
              renderEmptyState={() => (
                <EmptyState>
                  <Trans comment="Empty state when no language options match the search">
                    No languages found
                  </Trans>
                </EmptyState>
              )}
            >
              {options.map((option) => (
                <ListBox.Item
                  id={option.preference}
                  key={option.preference}
                  textValue={option.textValue}
                >
                  {option.displayName}
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Autocomplete.Filter>
        </Autocomplete.Popover>
      </Autocomplete>
      {runtime.isChanging ? (
        <span className="sr-only" role="status">
          <Trans comment="Accessible loading status while the UI language changes">
            Changing language…
          </Trans>
        </span>
      ) : null}
    </div>
  );
}
