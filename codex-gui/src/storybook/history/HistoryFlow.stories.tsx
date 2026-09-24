import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { StorybookStatefulEnvironment } from "../environment/StorybookStatefulEnvironment";
import { HistoryPreview } from "./HistoryPreview";

const meta = {
  id: "history-flow",
  title: "History/Continue task/Flow",
  component: HistoryPreview,
  parameters: { layout: "fullscreen", hasFixedHeader: true },
  decorators: [
    (Story, context) => (
      <StorybookStatefulEnvironment storyId={context.id}>
        <Story />
      </StorybookStatefulEnvironment>
    ),
  ],
} satisfies Meta<typeof HistoryPreview>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Success: Story = {};
