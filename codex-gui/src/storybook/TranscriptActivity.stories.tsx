import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { StorybookStatefulEnvironment } from "./StorybookStatefulEnvironment";
import { ActivityPreview } from "./transcript/ActivityPreview";

const meta = {
  title: "Transcript/Activity",
  component: ActivityPreview,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story, context) => (
      <StorybookStatefulEnvironment storyId={context.id}>
        <Story />
      </StorybookStatefulEnvironment>
    ),
  ],
} satisfies Meta<typeof ActivityPreview>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ReasoningStreaming: Story = { args: { initialStep: 1 } };
export const ReasoningCompleted: Story = { args: { initialStep: 2 } };
export const ToolRunning: Story = { args: { initialStep: 3 } };
export const ToolCompleted: Story = { args: { initialStep: 4 } };
export const Completed: Story = { args: { initialStep: 5 } };
export const Replay: Story = {};
