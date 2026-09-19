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

/** 23 rows in each lane; the real drawer initially loads 20 per lane. */
export const MixedText: Story = {
  args: { ordinaryCount: 23, guidingCount: 23, mixedText: true, openInitially: true },
  parameters: {
    docs: {
      description: {
        story:
          "23 ordinary messages and 23 guides, alternating long and short text. Each lane initially loads 20; the drawer scrolls at 375×720 and 1280×720. Details preserve paragraphs, line breaks, and an unbroken reference.",
      },
    },
  },
};
export const OrdinaryDetail: Story = {
  parameters: MixedText.parameters,
  args: { ...MixedText.args, detail: "ordinary" },
};
export const GuideDetail: Story = {
  parameters: MixedText.parameters,
  args: { ...MixedText.args, detail: "guiding" },
};
