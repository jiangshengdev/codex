import path from "node:path";
import js from "@eslint/js";
import vitestPlugin from "@vitest/eslint-plugin";
import { defineConfig, globalIgnores, includeIgnoreFile } from "eslint/config";
import skipFormatting from "eslint-config-prettier/flat";
import linguiPlugin from "eslint-plugin-lingui";
import pluginOxlint from "eslint-plugin-oxlint";
import playwrightPlugin from "eslint-plugin-playwright";
import reactPlugin from "eslint-plugin-react";
import reactDom from "eslint-plugin-react-dom";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import reactX from "eslint-plugin-react-x";
import storybook from "eslint-plugin-storybook";
import globals from "globals";
import { configs } from "typescript-eslint";

const gitignorePath = path.resolve(import.meta.dirname, ".gitignore");

export default [
  ...defineConfig(
    includeIgnoreFile(gitignorePath, "Imported .gitignore patterns"),
    globalIgnores([
      "**/*.snap",
      "**/dist/",
      "**/.yalc/",
      "**/build/",
      "**/temp/",
      "**/.temp/",
      "**/.tmp/",
      "**/.yarn/",
      "**/coverage/",
    ]),
    {
      name: "app/files-to-lint",
      files: ["**/*.{ts,mts,tsx}"],
      extends: [
        js.configs.recommended,
        configs.strictTypeChecked,
        configs.stylisticTypeChecked,
        {
          name: "eslint-plugin-react/jsx-runtime",
          ...reactPlugin.configs.flat["jsx-runtime"],
        },
        reactX.configs["recommended-typescript"],
        reactDom.configs.recommended,
        reactHooks.configs.flat.recommended,
        reactRefresh.configs.vite,
        linguiPlugin.configs["flat/recommended"],
      ],
      linterOptions: {
        reportUnusedDisableDirectives: 2,
      },
      languageOptions: {
        globals: globals.browser,
        parserOptions: {
          projectService: true,
          tsconfigRootDir: import.meta.dirname,
        },
      },
      rules: {
        "@typescript-eslint/consistent-type-definitions": [2, "type"],
        "@typescript-eslint/consistent-type-imports": [
          2,
          {
            prefer: "type-imports",
            fixStyle: "separate-type-imports",
            disallowTypeAnnotations: true,
          },
        ],
        "no-restricted-imports": [
          2,
          {
            paths: [
              {
                name: "react-redux",
                importNames: ["useSelector", "useStore", "useDispatch"],
                message: "Please use pre-typed versions from `src/app/hooks.ts` instead.",
              },
            ],
          },
        ],
      },
    },
    {
      ...playwrightPlugin.configs["flat/recommended"],
      files: ["e2e/**/*.{test,spec}.{js,ts,jsx,tsx}"],
    },
    {
      ...vitestPlugin.configs.recommended,
      files: ["src/**/__tests__/**/*.{ts,tsx}"],
      settings: {
        vitest: {
          typecheck: true,
        },
      },
    },
  ),
  ...storybook.configs["flat/recommended"],
  ...pluginOxlint.buildFromOxlintConfigFile(".oxlintrc.json"),
  skipFormatting,
];
