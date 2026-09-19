import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { composerMeta } from "./composer/composerMeta";
import { ComposerQueuePreview } from "./composer/ComposerQueuePreview";

const meta = {
  ...composerMeta,
  title: "Composer/Input and send/Queue",
} satisfies Meta<typeof composerMeta.component>;
export default meta;
type Story = StoryObj<typeof meta>;

export const RunningQueue: Story = { render: () => <ComposerQueuePreview /> };
export const RunningQueueLongList: Story = {
  render: () => <ComposerQueuePreview longList />,
  parameters: {
    docs: {
      description: {
        story:
          "23 mixed-length queued messages, initially showing 20 through the real pagination. Ordinary sends remain blocked by the active turn. At 375×720 and 1280×720 the drawer scrolls.",
      },
    },
  },
};
