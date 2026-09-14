import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { PendingInputReorderingPreview } from "./pendingInput/reordering/PendingInputReorderingPreview";

const meta = {
  title: "Composer/Pending input/Reordering",
  component: PendingInputReorderingPreview,
  parameters: { layout: "padded" },
} satisfies Meta<typeof PendingInputReorderingPreview>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Interactive: Story = {};
export const PagedLanes: Story = { args: { ordinaryCount: 23, guidingCount: 3 } };
export const ReadOnly: Story = { args: { mutationsEnabled: false, openInitially: true } };
export const NotApplied: Story = {
  args: { failure: "notApplied", showFailureInitially: true },
};
export const RefreshFailed: Story = {
  args: { failure: "refreshFailed", showFailureInitially: true },
};
export const RejectFirstMove: Story = { args: { failure: "notApplied" } };
export const FailFirstRefresh: Story = { args: { failure: "refreshFailed" } };
