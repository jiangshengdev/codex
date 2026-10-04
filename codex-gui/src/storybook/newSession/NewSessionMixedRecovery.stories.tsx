import type { Meta, StoryObj } from "@storybook/tanstack-react";
import inputs from "./NewSessionInputs.stories";
import { NewSessionPreview } from "./NewSessionPreview";

const meta = {
  ...inputs,
  id: "new-session-mixed-recovery",
  title: "New session/Mixed input recovery/States (local simulation)",
  component: NewSessionPreview,
  args: { preset: "failed", input: "mixed" },
} satisfies Meta<typeof NewSessionPreview>;
export default meta;
type Story = StoryObj<typeof meta>;
export const CreationFailed: Story = { args: { failure: "create" } };
export const CreationUnknown: Story = { args: { failure: "createUnknown" } };
export const ActivationFailed: Story = { args: { failure: "activate" } };
export const HandoffRejected: Story = { args: { failure: "handoff" } };
export const HandoffUnknown: Story = { args: { failure: "handoffUnknown" } };
