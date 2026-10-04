import { defineConfig } from "@lingui/cli";

export default defineConfig({
  locales: ["en", "zh-CN"],
  sourceLocale: "en",
  catalogs: [
    {
      path: "<rootDir>/src/locales/{locale}",
      include: ["<rootDir>/src"],
      exclude: [
        "<rootDir>/src/storybook/**",
        "<rootDir>/src/**/__screenshots__/**",
        "<rootDir>/src/**/__traces__/**",
      ],
    },
    {
      path: "<rootDir>/src/storybook/locales/{locale}",
      include: ["<rootDir>/src/storybook"],
      exclude: ["<rootDir>/src/**/__screenshots__/**", "<rootDir>/src/**/__traces__/**"],
    },
  ],
});
