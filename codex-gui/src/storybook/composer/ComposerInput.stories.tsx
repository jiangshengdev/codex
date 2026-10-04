import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { composerMeta } from "./composerMeta";
import { userEvent, within } from "storybook/test";
import { ClipboardFailurePreview } from "./ClipboardFailurePreview";

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

export const ClipboardFailure: Story = {
  decorators: [
    (Story) => (
      <ClipboardFailurePreview>
        <Story />
      </ClipboardFailurePreview>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("combobox", { name: /^(Message Codex|向 Codex 发送消息)$/ }),
    );
    await userEvent.keyboard("$preview");
    await userEvent.click(await canvas.findByRole("option", { name: /preview-review/ }));
    await userEvent.click(await canvas.findByText("$preview-review", { exact: true }));
    // Leave the real shortcut to the user (and E2E), so loading a story does not
    // produce an intentional unhandled rejection in the Storybook scene runner.
  },
};
