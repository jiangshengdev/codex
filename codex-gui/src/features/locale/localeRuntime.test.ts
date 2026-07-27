import { describe, expect, test, vi } from "vitest";
import {
  localeStorageKey,
  readLocalePreference,
  resolveActiveLocale,
  resolveSystemLocale,
  writeLocalePreference,
} from "./localeRuntime";

describe("readLocalePreference", () => {
  test.each([
    { storedValue: null, expected: "system" },
    { storedValue: "system", expected: "system" },
    { storedValue: "en", expected: "en" },
    { storedValue: "zh-CN", expected: "zh-CN" },
    { storedValue: "zh-TW", expected: "system" },
    { storedValue: "", expected: "system" },
  ] as const)("maps $storedValue to $expected", ({ expected, storedValue }) => {
    const storage = {
      getItem: vi.fn<(key: string) => string | null>(() => storedValue),
    };

    expect(readLocalePreference(storage)).toEqual({
      preference: expected,
      warning: null,
    });
    expect(storage.getItem).toHaveBeenCalledWith(localeStorageKey);
  });

  test("falls back to system and preserves a storage read failure", () => {
    const cause = new Error("storage read denied");
    const storage = {
      getItem: vi.fn<(key: string) => string | null>(() => {
        throw cause;
      }),
    };

    expect(readLocalePreference(storage)).toEqual({
      preference: "system",
      warning: {
        cause,
        kind: "storage-read-failed",
      },
    });
  });
});

describe("writeLocalePreference", () => {
  test.each(["system", "en", "zh-CN"] as const)("persists %s without resolving it", (value) => {
    const storage = {
      setItem: vi.fn<(key: string, value: string) => void>(),
    };

    expect(writeLocalePreference(storage, value)).toBeNull();
    expect(storage.setItem).toHaveBeenCalledWith(localeStorageKey, value);
  });

  test("preserves a storage write failure for the runtime to publish", () => {
    const cause = new Error("storage write denied");
    const storage = {
      setItem: vi.fn<(key: string, value: string) => void>(() => {
        throw cause;
      }),
    };

    expect(writeLocalePreference(storage, "zh-CN")).toEqual({
      cause,
      kind: "storage-write-failed",
    });
  });
});

describe("resolveSystemLocale", () => {
  test.each([
    { languages: ["en-US"], fallback: "zh-CN", expected: "en" },
    { languages: ["en-GB"], fallback: "zh-CN", expected: "en" },
    { languages: ["zh-CN"], fallback: "en-US", expected: "zh-CN" },
    { languages: ["zh-SG"], fallback: "en-US", expected: "zh-CN" },
    { languages: ["zh-Hans"], fallback: "en-US", expected: "zh-CN" },
    { languages: ["zh-TW"], fallback: "zh-CN", expected: "en" },
    { languages: ["zh-HK"], fallback: "zh-CN", expected: "en" },
    { languages: ["zh-MO"], fallback: "zh-CN", expected: "en" },
    { languages: ["zh-Hant"], fallback: "zh-CN", expected: "en" },
    { languages: ["zh-Hant-CN"], fallback: "zh-CN", expected: "en" },
    { languages: ["zh"], fallback: "en-US", expected: "zh-CN" },
    { languages: ["not_a_locale", "zh-CN"], fallback: "en-US", expected: "zh-CN" },
    { languages: ["fr-FR", "de-DE"], fallback: "zh-CN", expected: "en" },
    { languages: [], fallback: "zh-SG", expected: "zh-CN" },
  ] as const)(
    "resolves $languages with $fallback fallback to $expected",
    ({ expected, fallback, languages }) => {
      expect(resolveSystemLocale(languages, fallback)).toBe(expected);
    },
  );

  test("stops at a supported Traditional Chinese candidate", () => {
    expect(resolveSystemLocale(["fr-FR", "zh-TW", "zh-CN"], "zh-CN")).toBe("en");
  });

  test("gives an explicit script priority over a conflicting region", () => {
    expect(resolveSystemLocale(["zh-Hans-TW"], "en-US")).toBe("zh-CN");
    expect(resolveSystemLocale(["zh-Hant-CN"], "zh-CN")).toBe("en");
  });
});

describe("resolveActiveLocale", () => {
  test("keeps the system preference separate from its resolved locale", () => {
    const { preference } = readLocalePreference({ getItem: () => "system" });

    expect({
      preference,
      activeLocale: resolveActiveLocale(preference, ["zh-CN"], "en-US"),
    }).toEqual({
      preference: "system",
      activeLocale: "zh-CN",
    });
  });

  test.each([
    { preference: "en", expected: "en" },
    { preference: "zh-CN", expected: "zh-CN" },
  ] as const)("does not let the system override $preference", ({ expected, preference }) => {
    expect(resolveActiveLocale(preference, ["zh-CN", "en-US"], "zh-CN")).toBe(expected);
  });
});
