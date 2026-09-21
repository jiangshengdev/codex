import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { composerMeta } from "./composerMeta";
import { ComposerStopPreview } from "./ComposerStopPreview";

const meta = {
  ...composerMeta,
  id: "composer-input-and-send-stop",
  title: "Composer/Send controls/Stop",
} satisfies Meta<typeof composerMeta.component>;
export default meta;
type Story = StoryObj<typeof meta>;

export const RunningStop: Story = { render: () => <ComposerStopPreview /> };
export const StopRequestPending: Story = {
  render: () => <ComposerStopPreview preset="requestPending" />,
};
export const StopAccepted: Story = {
  render: () => <ComposerStopPreview preset="accepted" />,
  parameters: {
    docs: {
      description: {
        story:
          "Stop was accepted, but the turn is still active. Use the existing DEV control to inject its interrupted terminal event.",
      },
    },
  },
};
export const StopUnknown: Story = {
  render: () => <ComposerStopPreview preset="unknown" />,
  parameters: {
    docs: {
      description: {
        story:
          "Stop acceptance is unknown. The request has settled and is not retried; the turn remains active until a terminal event arrives.",
      },
    },
  },
};
export const StopFailed: Story = {
  render: () => <ComposerStopPreview preset="failed" />,
};
