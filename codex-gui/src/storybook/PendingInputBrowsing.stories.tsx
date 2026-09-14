import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { PendingInputBrowsingPreview } from "./pendingInput/PendingInputScenarioView";

const meta = {
  title: "Composer/Pending input/Browsing",
  component: PendingInputBrowsingPreview,
  parameters: { layout: "padded" },
  args: { ordinaryCount: 3, guidingCount: 0, longText: false },
} satisfies Meta<typeof PendingInputBrowsingPreview>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Queued: Story = {};
export const Empty: Story = { args: { ordinaryCount: 0 } };
export const SingleMessage: Story = { args: { ordinaryCount: 1 } };
export const BothLanes: Story = { args: { ordinaryCount: 23, guidingCount: 23, longText: true } };
export const Sending: Story = { args: { ordinaryCount: 2, startSending: true } };
export const ReadOnly: Story = { args: { mutationsEnabled: false, longText: true } };
