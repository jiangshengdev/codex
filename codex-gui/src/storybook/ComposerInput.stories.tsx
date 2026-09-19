import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { composerMeta } from "./composer/composerMeta";

const meta = {
  ...composerMeta,
  title: "Composer/Input and send/Input",
} satisfies Meta<typeof composerMeta.component>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};
export const Whitespace: Story = { args: { initialText: "   " } };
export const ValidText: Story = { args: { initialText: "Review this fictional change." } };
export const LongContent: Story = {
  args: {
    initialText: Array.from(
      { length: 20 },
      (_, index) =>
        `Review section ${String(index + 1)}: Keep the input readable while checking the fictional change, its context, and the expected outcome.`,
    ).join("\n\n"),
  },
};
