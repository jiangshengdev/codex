import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { PendingInputRecoveryPreview } from "./pendingInput/recovery/PendingInputRecoveryPreview";

const meta = {
  title: "Composer/Pending input/Recovery",
  component: PendingInputRecoveryPreview,
  parameters: { layout: "padded" },
} satisfies Meta<typeof PendingInputRecoveryPreview>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Guiding: Story = {};
export const Unsent: Story = { args: { preset: "unsent" } };
export const GuideAccepted: Story = { args: { preset: "guideAccepted" } };
export const GuideUnknown: Story = { args: { preset: "guideUnknown" } };
export const Priority: Story = { args: { preset: "priority" } };
export const RecoveryDisabled: Story = { args: { preset: "recoveryDisabled" } };
export const Recovering: Story = { args: { preset: "recovering" } };
export const Combined: Story = { args: { preset: "combined" } };
export const MixedTextCombined: Story = {
  args: { preset: "combined", mixedText: true },
  parameters: {
    docs: {
      description: {
        story:
          "23 rejected guides in the real priority summary, plus 23 ordinary queued messages. Priority summaries and the paged drawer scroll at 375×720 and 1280×720; summaries intentionally retain product truncation.",
      },
    },
  },
};
export const MixedTextUnsent: Story = {
  args: { preset: "unsent", mixedText: true },
  parameters: {
    docs: {
      description: {
        story:
          "23 ordinary messages: one failed message is retained for recovery, the next start is reserved but not issued, and 21 remain in the paged queue. Continue sending releases the existing recovery gate; no request is retried automatically.",
      },
    },
  },
};
export const MixedTextGuideUnknown: Story = {
  args: { preset: "guideUnknown", mixedText: true },
  parameters: {
    docs: {
      description: {
        story:
          "23 guides and 23 ordinary messages. The first guide has an unknown result, blocking further guide dispatch. Open the real paged queue for mixed-text details; the shared full unknown-record panel is covered under Input and send / Send.",
      },
    },
  },
};
