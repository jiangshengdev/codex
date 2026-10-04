import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { composerMeta } from "./composerMeta";

const meta = {
  ...composerMeta,
  id: "composer-input-and-send-input",
  title: "Composer/Input and drafts/Input",
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
