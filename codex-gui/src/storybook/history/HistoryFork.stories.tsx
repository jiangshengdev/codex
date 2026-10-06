import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { userEvent, within } from "storybook/test";
import flow from "./HistoryFlow.stories";
import { HistoryPreview } from "./HistoryPreview";

const meta = {
  ...flow,
  id: "history-fork",
  title: "History/Fork/Recovery",
  component: HistoryPreview,
  args: { detail: "longContent" },
} satisfies Meta<typeof HistoryPreview>;
export default meta;
type Story = StoryObj<typeof meta>;
const openFork: Story["play"] = async ({ canvasElement }) => {
  await userEvent.click(
    await within(canvasElement).findByRole("button", { name: /^(Open fork|打开分叉会话)$/ }),
  );
};
export const CreationFailure: Story = { args: { fork: "creationFailure" } };
export const ResultUnknown: Story = { args: { fork: "resultUnknown" } };
export const CreatedUnopened: Story = { args: { fork: "createdUnopened" } };
export const OpenFailed: Story = { args: { fork: "openFailed" } };
export const ActivationFailed: Story = {
  args: { fork: "activationFailed" },
  play: async (context) => {
    await openFork(context);
    await userEvent.click(
      await within(context.canvasElement).findByRole("button", {
        name: /^(View diagnostic information|查看诊断信息)$/,
      }),
    );
  },
};
export const NavigationFailed: Story = { args: { fork: "navigationFailed" }, play: openFork };
export const Pending: Story = { args: { fork: "pending" } };
export const Unavailable: Story = { args: { fork: "unavailable" } };
export const Completed: Story = { args: { fork: "completed" }, play: openFork };
export const PageCoexistence: Story = {
  args: { fork: "pageCoexistence", warning: "cleanup" },
};
