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
