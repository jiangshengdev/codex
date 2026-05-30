import path from "node:path";
import { includeIgnoreFile } from "@eslint/compat";
import js from "@eslint/js";
import globals from "globals";
import vitestPlugin from "@vitest/eslint-plugin";
import linguiPlugin from "eslint-plugin-lingui";
import playwrightPlugin from "eslint-plugin-playwright";
import reactPlugin from "eslint-plugin-react";
import reactDom from "eslint-plugin-react-dom";
import reactHooks from "eslint-plugin-react-hooks";
import reactX from "eslint-plugin-react-x";
import reactRefresh from "eslint-plugin-react-refresh";
import prettierConfig from "eslint-config-prettier/flat";
import { configs } from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

const gitignorePath = path.resolve(import.meta.dirname, ".gitignore");

export default defineConfig(
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
    files: ["**/*.{ts,tsx}"],
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
  prettierConfig,
);
