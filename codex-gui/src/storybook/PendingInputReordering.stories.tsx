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
/** 23 rows per lane, with the first 20 loaded by the real pagination. */
export const MixedText: Story = {
  args: { ordinaryCount: 23, guidingCount: 23, mixedText: true, openInitially: true },
  parameters: {
    docs: {
      description: {
        story:
          "23 ordinary messages and 23 guides, alternating long and short text; 20 initially loaded per lane. Real move controls and pagination remain available. The drawer scrolls at 375×720 and 1280×720.",
      },
    },
  },
};
export const ReadOnly: Story = { args: { mutationsEnabled: false, openInitially: true } };
export const NotApplied: Story = {
  args: { failure: "notApplied", showFailureInitially: true },
};
export const RefreshFailed: Story = {
  args: { failure: "refreshFailed", showFailureInitially: true },
};
export const RejectFirstMove: Story = { args: { failure: "notApplied" } };
export const FailFirstRefresh: Story = { args: { failure: "refreshFailed" } };
