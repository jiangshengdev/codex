import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { StorybookStatefulEnvironment } from "./StorybookStatefulEnvironment";
import { ImageContentPreview } from "./transcript/ImageContentPreview";

const meta = {
  title: "Transcript/Images",
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
