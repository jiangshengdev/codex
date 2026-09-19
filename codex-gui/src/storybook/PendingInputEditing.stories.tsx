import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { PendingInputEditingPreview } from "./pendingInput/editing/PendingInputEditingPreview";

const meta = {
  title: "Composer/Pending input/Editing",
  component: PendingInputEditingPreview,
  parameters: { layout: "padded", docs: { story: { inline: false } } },
} satisfies Meta<typeof PendingInputEditingPreview>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Interactive: Story = {};
export const GuidingTarget: Story = { args: { guiding: true } };
export const SendingConflict: Story = { args: { sendingConflict: true } };

export const Editing: Story = { args: { initialState: "editing" } };
export const DeleteConfirmation: Story = { args: { initialState: "deleteConfirmation" } };
export const Retained: Story = { args: { initialState: "retained" } };

export const MixedTextEditing: Story = { args: { initialState: "editing", mixedText: true } };
export const MixedTextRetained: Story = { args: { initialState: "retained", mixedText: true } };
export const MixedTextDeleteConfirmation: Story = {
  args: { initialState: "deleteConfirmation", mixedText: true },
};
export const MixedTextDiscardConfirmation: Story = {
  args: { initialState: "discardConfirmation", mixedText: true },
};
