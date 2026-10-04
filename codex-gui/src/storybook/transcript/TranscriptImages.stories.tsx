import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { StorybookStatefulEnvironment } from "../environment/StorybookStatefulEnvironment";
import { ImageContentPreview } from "./ImageContentPreview";

const meta = {
  id: "transcript-images",
  title: "Transcript/Rich content/Images",
  component: ImageContentPreview,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story, context) => (
      <StorybookStatefulEnvironment storyId={context.id}>
        <Story />
      </StorybookStatefulEnvironment>
    ),
  ],
} satisfies Meta<typeof ImageContentPreview>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ImageOnly: Story = { args: { preset: "imageOnly" } };
export const MixedContent: Story = { args: { preset: "mixedContent" } };
export const MarkdownImageBoundary: Story = { args: { preset: "markdownImageBoundary" } };
