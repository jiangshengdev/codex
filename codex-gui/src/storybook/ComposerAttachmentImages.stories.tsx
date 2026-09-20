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
  title: "Composer/Attachments/Images",
  args: { image: true },
} satisfies Meta<typeof ComposerAttachmentsPreview>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Interactive: Story = { args: { preset: "interactive" } };
export const Uploading: Story = { args: { preset: "uploading" } };
export const Ready: Story = { args: { preset: "ready", previewPreset: "ready" } };
export const Loading: Story = { args: { preset: "ready" } };
export const ReadFailure: Story = { args: { preset: "ready", previewPreset: "readFailure" } };
export const DecodeFailure: Story = { args: { preset: "ready", previewPreset: "decodeFailure" } };
