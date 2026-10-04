import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { StorybookStatefulEnvironment } from "../environment/StorybookStatefulEnvironment";
import { ShellPreview } from "./ShellPreview";

const meta = {
  id: "app-shell-navigation",
  title: "App shell/Navigation/States",
  component: ShellPreview,
  parameters: { layout: "fullscreen", hasFixedHeader: true },
  decorators: [
    (Story, context) => (
      <StorybookStatefulEnvironment storyId={context.id}>
        <Story />
      </StorybookStatefulEnvironment>
    ),
  ],
} satisfies Meta<typeof ShellPreview>;
export default meta;
type Story = StoryObj<typeof meta>;
export const CurrentTask: Story = {};
export const HistoryList: Story = { args: { route: "historyList" } };
export const HistoryDetail: Story = { args: { route: "historyDetail" } };
export const NewSession: Story = { args: { route: "newTask" } };
export const LongTitle: Story = { args: { title: "long" } };
export const PreviewFallback: Story = { args: { title: "preview" } };
export const MissingTitle: Story = { args: { title: "missing" } };
export const MissingHistoryTitle: Story = { args: { route: "historyDetail", title: "missing" } };
export const NoActiveTask: Story = { args: { route: "historyList", empty: true } };
export const MissingWorkingDirectory: Story = {
  args: { route: "historyList", empty: true, missingCwd: true },
};
export const TaskError: Story = { args: { error: "task" } };
export const ConnectionError: Story = { args: { error: "connection" } };
