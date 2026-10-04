import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { StorybookStatefulEnvironment } from "../environment/StorybookStatefulEnvironment";
import { RichContentPreview } from "./RichContentPreview";

const meta = {
  id: "transcript-rich-content",
  title: "Transcript/Rich content/Formatting",
  component: RichContentPreview,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story, context) => (
      <StorybookStatefulEnvironment storyId={context.id}>
        <Story />
      </StorybookStatefulEnvironment>
    ),
  ],
} satisfies Meta<typeof RichContentPreview>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Markdown: Story = { args: { sample: "markdown" } };
export const LongCode: Story = { args: { sample: "longCode" } };
export const WideTable: Story = { args: { sample: "wideTable" } };
export const LongText: Story = { args: { sample: "longText" } };
export const UnclosedMarkdown: Story = { args: { sample: "unclosedMarkdown" } };
export const UnclosedCode: Story = { args: { sample: "unclosedCode" } };
