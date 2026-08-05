import { describe, expect, it } from "vitest";
import { resolveBrowserLocale, type AppLocale } from "@/i18n";

describe("resolveBrowserLocale", () => {
  it.each<[readonly string[], AppLocale]>([
    [["en"], "en"],
    [["en-US"], "en"],
    [["zh-CN"], "zh-CN"],
    [["zh-SG"], "zh-CN"],
    [["zh-Hans"], "zh-CN"],
    [["zh"], "zh-CN"],
    [["zh-TW"], "en"],
    [["zh-HK"], "en"],
    [["zh-MO"], "en"],
    [["zh-Hant"], "en"],
    [["zh-Hant-CN"], "en"],
    [["zh-Hans-TW"], "zh-CN"],
  ])("resolves %j to %s", (browserLocales, expectedLocale) => {
    expect(resolveBrowserLocale(browserLocales)).toBe(expectedLocale);
  });

  it("continues after invalid and unsupported locale candidates", () => {
    expect(resolveBrowserLocale(["not_a_locale", "fr-FR", "zh-CN"])).toBe("zh-CN");
  });

  it("uses the first supported locale candidate", () => {
    expect(resolveBrowserLocale(["fr-FR", "en-US", "zh-Hans"])).toBe("en");
    expect(resolveBrowserLocale(["fr-FR", "zh-Hans", "en-US"])).toBe("zh-CN");
  });

  it("stops at an explicit Traditional Chinese candidate", () => {
    expect(resolveBrowserLocale(["zh-Hant", "zh-Hans"])).toBe("en");
  });

  it("falls back to English when no candidate is supported", () => {
    expect(resolveBrowserLocale([])).toBe("en");
    expect(resolveBrowserLocale(["not_a_locale", "fr-FR"])).toBe("en");
  });
});
