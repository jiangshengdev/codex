import type { Meta } from "@storybook/tanstack-react";
import { StorybookStatefulEnvironment } from "../StorybookStatefulEnvironment";
import { ComposerPreview } from "./ComposerPreview";

export const composerMeta = {
  component: ComposerPreview,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story, context) => (
      <StorybookStatefulEnvironment storyId={context.id}>
        <Story />
      </StorybookStatefulEnvironment>
    ),
  ],
} satisfies Meta<typeof ComposerPreview>;
