import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { expect, userEvent, within } from "storybook/test";
import flow from "./HistoryFlow.stories";
import { HistoryPreview } from "./HistoryPreview";
import { Trans } from "@lingui/react/macro";
import { DevOnly } from "../environment/DevOnly";

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

export const InitializationAndCleanupFailed: Story = {
  args: { continuation: "cleanupPending" },
};

export const RepeatedContinueLosesDiagnostics: Story = {
  // Preserve the existing direct link to this regression scenario.
  name: "Repeated Continue Preserves Diagnostics",
  args: { continuation: "cleanupPending" },
  decorators: [
    (Story) => (
      <>
        <DevOnly>
          <p>
            <Trans comment="Story-only explanation of retained diagnostics after continuing again">
              The projection closes before publication during the first activation, and detach also
              fails. Both the first diagnostic and the diagnostic after continuing again retain the
              initialization and cleanup errors. The real session owner produces these failures.
            </Trans>
          </p>
        </DevOnly>
        <Story />
      </>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const continueTask = await canvas.findByRole("button", {
      name: /^(Continue this task|继续此任务)$/,
    });
    await userEvent.click(continueTask);
    await canvas.findByRole("alert");
    await expect(continueTask).toBeEnabled();
    await userEvent.click(continueTask);
    await userEvent.click(
      await canvas.findByRole("button", {
        name: /^(View diagnostic information|查看诊断信息)$/,
      }),
    );
    const dialog = await within(canvasElement.ownerDocument.body).findByRole("dialog");
    await expect(dialog).toHaveTextContent(
      "Candidate projection became unavailable before publication",
    );
    await expect(dialog).toHaveTextContent("STORYBOOK_CONTINUE_CLEANUP_FAILED");
  },
};
