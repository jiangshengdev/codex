import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { fn } from "storybook/test";
import { ConnectionTaskRecoveryNotice } from "@/features/currentTask/ConnectionTaskRecoveryNotice";
import { RecoveryPagePreview } from "./RecoveryPagePreview";
import { recoveryFirstId } from "./recoveryCommands";
import type { RecoveryPageSetup } from "./recoveryPageScenario";
import { StorybookStatefulEnvironment } from "../environment/StorybookStatefulEnvironment";
import { statefulPreviewRouteTree } from "../environment/statefulPreviewRouter";

const partialRecovery: RecoveryPageSetup = async (controller, host) => {
  controller.connectionUnavailable();
  host.setAttachOutcome(recoveryFirstId, "failure");
  await controller.restoreConnection(host.commands, () => recoveryFirstId);
  host.setAttachOutcomes(recoveryFirstId, ["failure", "success"], 1_500);
};

const meta = {
  id: "feedback-task-recovery",
  title: "Recovery/Task recovery/States",
  component: RecoveryPagePreview,
  parameters: {
    docs: {
      description: {
        component:
          "Fixed notices use real product components. Partial Recovery starts with a healthy shared connection: task one has failed to restore while task two is available. Restore task fails once and then succeeds. Use the real Menu to switch tasks while waiting. Recovered opens the successful page directly. All external results are local.",
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
export const PartialRecovery: Story = {
  args: { setup: partialRecovery },
  parameters: { layout: "fullscreen", hasFixedHeader: true },
};
export const Recovered: Story = {
  args: { setup: () => Promise.resolve() },
  parameters: { layout: "fullscreen", hasFixedHeader: true },
};
export const Waiting: Story = {
  render: () => (
    <ConnectionTaskRecoveryNotice
      connection={{ phase: "unavailable", recovery: { pending: false, error: null } }}
      canRecover
      onRecover={fn()}
    />
  ),
};
export const Restoring: Story = {
  render: () => (
    <ConnectionTaskRecoveryNotice
      connection={{ phase: "unavailable", recovery: { pending: true, error: null } }}
      canRecover
      onRecover={fn()}
    />
  ),
};
export const Failed: Story = {
  render: () => (
    <ConnectionTaskRecoveryNotice
      connection={{
        phase: "unavailable",
        recovery: {
          pending: false,
          error: "STORYBOOK_TASK_RESTORE_FAILED: local retained task could not attach.",
        },
      }}
      canRecover
      onRecover={fn()}
    />
  ),
};
export const ConnectionUnavailable: Story = {
  render: () => (
    <ConnectionTaskRecoveryNotice
      connection={{ phase: "unavailable", recovery: { pending: false, error: null } }}
      canRecover={false}
      onRecover={fn()}
    />
  ),
};
