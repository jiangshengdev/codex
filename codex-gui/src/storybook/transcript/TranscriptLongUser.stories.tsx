import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { StorybookStatefulEnvironment } from "../environment/StorybookStatefulEnvironment";
import { LongUserMessagePreview } from "./LongUserMessagePreview";

const meta = {
  id: "transcript-long-user-message",
  title: "Transcript/Basic messages/Long user message",
  component: LongUserMessagePreview,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story, context) => (
      <StorybookStatefulEnvironment storyId={context.id}>
        <Story />
      </StorybookStatefulEnvironment>
    ),
  ],
} satisfies Meta<typeof LongUserMessagePreview>;
export default meta;
type Story = StoryObj<typeof meta>;

export const LongUserMessage: Story = {};
