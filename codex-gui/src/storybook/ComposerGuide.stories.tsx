import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { composerMeta } from "./composer/composerMeta";
import { ComposerGuidePreview } from "./composer/ComposerGuidePreview";

const meta = {
  ...composerMeta,
  title: "Composer/Input and send/Guide",
} satisfies Meta<typeof composerMeta.component>;
export default meta;
type Story = StoryObj<typeof meta>;

export const RunningGuide: Story = { render: () => <ComposerGuidePreview /> };
export const RunningWithInput: Story = {
  render: () => <ComposerGuidePreview preset="withInput" />,
};
export const GuideRequestPending: Story = {
  render: () => <ComposerGuidePreview preset="requestPending" />,
};
export const GuideRuntimePending: Story = {
  render: () => <ComposerGuidePreview preset="runtimePending" />,
};
export const GuideUnavailable: Story = {
  render: () => <ComposerGuidePreview preset="unavailable" />,
};
export const GuideFailed: Story = {
  render: () => <ComposerGuidePreview preset="failed" />,
};
export const GuideUnknown: Story = {
  render: () => <ComposerGuidePreview preset="unknown" />,
};
export const GuideQueuedLongList: Story = {
  render: () => <ComposerGuidePreview preset="queuedLongList" />,
  parameters: {
    docs: {
      description: {
        story:
          "23 mixed-length guides: one issuing request and 22 queued, not concurrent requests. The real drawer initially loads 20 and scrolls at 375×720 and 1280×720.",
      },
    },
  },
};
