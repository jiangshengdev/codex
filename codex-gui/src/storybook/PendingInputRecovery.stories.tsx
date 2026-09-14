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
