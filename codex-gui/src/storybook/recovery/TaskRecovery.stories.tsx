import type { Meta, StoryObj } from "@storybook/tanstack-react";
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
          "Recovery pages use real product components and local results. Partial Recovery starts with a healthy shared connection: task one has failed to restore while task two is available. Restore task fails once and then succeeds. Restoring keeps the task attachment pending; Failed retries successfully. Waiting and Connection Unavailable retain the task while waiting for the shared connection to recover. Use the real Menu to switch tasks on recovery pages. Recovered opens the successful page directly.",
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
  parameters: { layout: "fullscreen", hasFixedHeader: true },
};
export const Restoring: Story = {
  args: {
    setup: (controller, host) => {
      controller.connectionUnavailable();
      host.setAttachOutcome(recoveryFirstId, "pending");
      void controller.restoreConnection(host.commands, () => recoveryFirstId);
      return Promise.resolve();
    },
  },
  parameters: { layout: "fullscreen", hasFixedHeader: true },
};
export const Failed: Story = {
  args: {
    setup: async (controller, host) => {
      await partialRecovery(controller, host);
      host.setAttachOutcome(recoveryFirstId, "success", 1_500);
    },
  },
  parameters: { layout: "fullscreen", hasFixedHeader: true },
};
export const ConnectionUnavailable: Story = {
  parameters: { layout: "fullscreen", hasFixedHeader: true },
};
