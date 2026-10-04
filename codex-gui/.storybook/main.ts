import type { StorybookConfig } from "@storybook/tanstack-react";
import { mergeConfig, searchForWorkspaceRoot } from "vite";
import { generatedArtifactWatchIgnored } from "../scripts/devServerWatch.ts";
import { currentRunContext } from "../scripts/testRun/resources.ts";
import {
  appServerProtocolDirectory,
  guiHostContractDirectory,
} from "../scripts/sharedContractPaths.ts";

const config: StorybookConfig = {
  stories: ["../src/**/*.mdx", "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"],
  addons: [
    "@chromatic-com/storybook",
    "@storybook/addon-vitest",
    "@storybook/addon-a11y",
    "@storybook/addon-docs",
    "@storybook/addon-mcp",
  ],
  framework: "@storybook/tanstack-react",
  viteFinal: (viteConfig) => ({
    // The Storybook builder replaces the shared Vite server configuration.
    ...mergeConfig(viteConfig, {
      ...(process.env.CODEX_GUI_TEST_RUN_DIR
        ? { cacheDir: `${currentRunContext().cacheDirectory}/storybook-vite` }
        : {}),
      server: {
        watch: { ignored: generatedArtifactWatchIgnored },
        fs: {
          allow: [
            searchForWorkspaceRoot(viteConfig.root ?? process.cwd()),
            guiHostContractDirectory,
            appServerProtocolDirectory,
          ],
        },
      },
    }),
    // This client-only GUI needs real Link navigation in its memory routers.
    // The framework interceptor replaces Link with an action-only anchor.
    plugins: viteConfig.plugins?.filter(
      (plugin) =>
        !(
          plugin != null &&
          typeof plugin === "object" &&
          "name" in plugin &&
          plugin.name === "storybook:tanstack-react:module-interception"
        ),
    ),
  }),
};
export default config;
