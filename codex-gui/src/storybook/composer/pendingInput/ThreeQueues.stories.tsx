import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { PendingInputRecoveryPreview } from "./recovery/PendingInputRecoveryPreview";

const meta = {
  title: "Composer/Pending input/Three queues",
  component: PendingInputRecoveryPreview,
  parameters: { layout: "padded" },
  args: { preset: "allQueues", openInitially: true },
} satisfies Meta<typeof PendingInputRecoveryPreview>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ShortText: Story = {};
export const MixedText: Story = {
  args: { mixedText: true, allQueuesGuidingCount: 23 },
};
export const PriorityDetail: Story = {
  args: { ...MixedText.args, priorityDetail: true },
};
