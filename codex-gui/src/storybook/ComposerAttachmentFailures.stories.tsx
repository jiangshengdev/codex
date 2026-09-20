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
  title: "Composer/Attachments/Failures",
} satisfies Meta<typeof ComposerAttachmentsPreview>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Upload: Story = { args: { preset: "upload" } };
export const Size: Story = { args: { preset: "size" } };
export const Authorization: Story = { args: { preset: "authorization" } };
export const Interrupted: Story = { args: { preset: "interrupted" } };
