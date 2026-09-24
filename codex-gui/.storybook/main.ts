import type { StorybookConfig } from "@storybook/tanstack-react";

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
    ...viteConfig,
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
