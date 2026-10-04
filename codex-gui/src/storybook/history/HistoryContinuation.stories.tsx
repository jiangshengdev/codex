import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { expect, userEvent, within } from "storybook/test";
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

export const InitializationAndCleanupFailed: Story = {
  args: { continuation: "cleanupPending" },
};

export const RepeatedContinueLosesDiagnostics: Story = {
  args: { continuation: "cleanupPending" },
  parameters: {
    docs: {
      description: {
        story:
          "复现当前缺陷：首次激活在 projection 发布前关闭，detach 同时失败。首次诊断有两个原因；再次继续后只显示 AggregateError 摘要。使用真实 session owner 生成失败，未修复产品行为。",
      },
    },
  },
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
    await expect(
      await within(canvasElement.ownerDocument.body).findByRole("dialog"),
    ).toHaveTextContent("Multiple active thread activation errors");
  },
};
