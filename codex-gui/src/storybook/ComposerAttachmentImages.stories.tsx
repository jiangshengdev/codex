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
export const ReadFailure: Story = {
  args: { preset: "ready", previewPreset: "readFailure" },
  parameters: {
    docs: {
      description: {
        story:
          "点击附件的重试预览图标，再通过 DEV 控制区完成预览、模拟再次读取失败或解码失败。重试期间保留失败提示，上传状态与发送资格不变。",
      },
    },
  },
};
export const DecodeFailure: Story = { args: { preset: "ready", previewPreset: "decodeFailure" } };
