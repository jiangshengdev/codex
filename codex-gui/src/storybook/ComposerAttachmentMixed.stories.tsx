import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { StorybookStatefulEnvironment } from "./StorybookStatefulEnvironment";
import { ComposerAttachmentsPreview } from "./composer/ComposerAttachmentsPreview";

const meta = {
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story, context) => (
      <StorybookStatefulEnvironment storyId={context.id}>
        <Story />
      </StorybookStatefulEnvironment>
    ),
  ],
  component: ComposerAttachmentsPreview,
  title: "Composer/Attachments/Mixed",
  args: { mixed: true },
} satisfies Meta<typeof ComposerAttachmentsPreview>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Interactive: Story = { args: { preset: "interactive" } };
export const MixedResults: Story = { args: { preset: "mixedResults", previewPreset: "ready" } };
