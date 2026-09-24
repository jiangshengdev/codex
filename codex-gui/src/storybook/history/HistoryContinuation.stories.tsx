import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { userEvent, within } from "storybook/test";
import flow from "./HistoryFlow.stories";
import { HistoryPreview } from "./HistoryPreview";

const meta = {
  ...flow,
  id: "history-continuation",
  title: "History/Continue task/States",
  component: HistoryPreview,
  play: async ({ canvasElement }) => {
    await userEvent.click(
      await within(canvasElement).findByRole("button", {
        name: /^(Continue this task|继续此任务)$/,
      }),
    );
  },
} satisfies Meta<typeof HistoryPreview>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Unresolved: Story = { args: { continuation: "unresolved" } };
export const SwitchInProgress: Story = { args: { continuation: "switchInProgress" } };
export const CurrentChanged: Story = { args: { continuation: "currentChanged" } };
export const CurrentChangedEmpty: Story = { args: { continuation: "currentChangedEmpty" } };
export const DisconnectedBeforeCommit: Story = {
  args: { continuation: "disconnectedBeforeCommit" },
};
export const DisconnectedAfterCommit: Story = { args: { continuation: "disconnectedAfterCommit" } };
export const PreparationFailed: Story = { args: { continuation: "preparationFailed" } };
export const ResumeFailed: Story = { args: { continuation: "resumeFailed" } };
export const ActivationFailed: Story = { args: { continuation: "activationFailed" } };
export const EmptyResult: Story = { args: { continuation: "empty" } };
export const UnexpectedFailure: Story = { args: { continuation: "unexpectedFailure" } };
export const NavigationFailed: Story = { args: { continuation: "navigationFailed" } };
export const Pending: Story = { args: { continuation: "pending" } };
export const SynchronizationWarning: Story = { args: { warning: "synchronization" } };
export const CleanupWarning: Story = { args: { warning: "cleanup" } };
