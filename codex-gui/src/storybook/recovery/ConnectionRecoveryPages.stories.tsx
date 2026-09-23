import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { RecoveryPagePreview } from "./RecoveryPagePreview";
import { recoveryFirstId } from "./recoveryCommands";
import { StorybookStatefulEnvironment } from "../environment/StorybookStatefulEnvironment";
import { statefulPreviewRouteTree } from "../environment/statefulPreviewRouter";

const meta = {
  id: "feedback-connection-recovery-pages",
  title: "Recovery/Connection recovery/Pages",
  component: RecoveryPagePreview,
  parameters: {
    layout: "fullscreen",
    hasFixedHeader: true,
    docs: {
      description: {
        component:
          "Real AppShell and CurrentTaskPage with local connection results. Retained disconnection fails the first reconnect and succeeds on retry; startup failure succeeds on reconnect. No GUI host, upload, or model requests are made. Restart simulation discards the previous owner and its pending results.",
      },
    },
    tanstack: { router: { route: statefulPreviewRouteTree, path: `/task/${recoveryFirstId}` } },
  },
  decorators: [
    (Story, context) => (
      <StorybookStatefulEnvironment storyId={context.id}>
        <Story />
      </StorybookStatefulEnvironment>
    ),
  ],
} satisfies Meta<typeof RecoveryPagePreview>;
export default meta;
type Story = StoryObj<typeof meta>;
export const RetainedDisconnection: Story = {};
export const StartupFailure: Story = { args: { startup: true } };
