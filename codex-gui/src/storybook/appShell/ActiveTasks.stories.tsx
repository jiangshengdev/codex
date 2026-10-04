import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { StorybookStatefulEnvironment } from "../environment/StorybookStatefulEnvironment";
import { ShellPreview } from "./ShellPreview";

const meta = {
  id: "app-shell-active-tasks",
  title: "App shell/Active tasks/States",
  component: ShellPreview,
  parameters: {
    layout: "fullscreen",
    hasFixedHeader: true,
    docs: {
      description: {
        component:
          "Local simulation using the real AppShell and active task owner. Open Menu to browse tasks. Remove from list only removes active membership; history and drafts are retained. Business pages are route placeholders. No model or real session is contacted. Restart simulation restores the preset.",
      },
    },
  },
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

export const Empty: Story = { args: { route: "historyList", empty: true } };
export const MultipleTasks: Story = { args: { collection: "multiple" } };
export const LongTaskNames: Story = { args: { collection: "long" } };
export const MissingTaskName: Story = { args: { collection: "missing" } };
export const RemovalRestricted: Story = { args: { collection: "running" } };
export const NavigationFailure: Story = {
  args: { collection: "navigationFailure" },
  parameters: {
    docs: {
      description: {
        story: "The first task navigation fails. Reopen Menu and select the task again to recover.",
      },
    },
  },
};
export const RemovalFailure: Story = {
  args: { collection: "removalFailure" },
  parameters: {
    docs: {
      description: {
        story:
          "Removing Shell task 2 fails once during projection detach. The task and error remain until Remove from list succeeds on the next attempt.",
      },
    },
  },
};
