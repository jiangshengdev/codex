import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { StorybookStatefulEnvironment } from "./StorybookStatefulEnvironment";
import { BasicMessagePreview } from "./transcript/BasicMessagePreview";

const meta = {
  title: "Transcript/Messages",
  component: BasicMessagePreview,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story, context) => (
      <StorybookStatefulEnvironment storyId={context.id}>
        <Story />
      </StorybookStatefulEnvironment>
    ),
  ],
} satisfies Meta<typeof BasicMessagePreview>;
export default meta;
type Story = StoryObj<typeof meta>;
export const UserMessage: Story = { args: { content: "user" } };
export const AssistantText: Story = { args: { content: "assistant" } };
export const Streaming: Story = {};
export const FirstDelta: Story = { args: { initialStep: 1 } };
export const SecondDelta: Story = { args: { initialStep: 2 } };
export const Completed: Story = { args: { initialStep: 3 } };
