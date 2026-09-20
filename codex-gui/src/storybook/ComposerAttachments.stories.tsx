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
  title: "Composer/Attachments/Files",
} satisfies Meta<typeof ComposerAttachmentsPreview>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Interactive: Story = { args: { preset: "interactive" } };
export const Uploading: Story = { args: { preset: "uploading" } };
export const Ready: Story = { args: { preset: "ready" } };
