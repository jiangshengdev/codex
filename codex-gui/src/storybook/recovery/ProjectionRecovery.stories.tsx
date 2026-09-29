import type { Meta, StoryObj } from "@storybook/tanstack-react";
import type { ProjectionManualReconnectReason } from "@/features/projectionIngress/projectionIngressAdapter";
import { RecoveryPagePreview } from "./RecoveryPagePreview";
import { recoveryFirstId } from "./recoveryCommands";
import type { RecoveryPageSetup } from "./recoveryPageScenario";
import { pauseProjection } from "./pauseProjection";
import { StorybookStatefulEnvironment } from "../environment/StorybookStatefulEnvironment";
import { statefulPreviewRouteTree } from "../environment/statefulPreviewRouter";

const paused =
  (reason: ProjectionManualReconnectReason): RecoveryPageSetup =>
  (controller, host) => {
    pauseProjection(controller, reason, recoveryFirstId);
    host.setAttachOutcomes(recoveryFirstId, ["failure", "success"], 1_500);
    return Promise.resolve();
  };
const meta = {
  id: "feedback-message-synchronization",
  title: "Recovery/Message synchronization/States",
  component: RecoveryPagePreview,
  parameters: {
    layout: "fullscreen",
    hasFixedHeader: true,
    docs: {
      description: {
        component:
          "Real task pages paused by local projection notifications. Each reason can be opened directly; Restore sync fails once and then succeeds. Failed starts after a failed attempt and succeeds on retry; Restoring keeps its response pending. Connection Unavailable preserves a paused projection after task reconnection failed. Other tasks retain their own content and input. No real host or model is contacted.",
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
export const Backpressure: Story = { args: { setup: paused("backpressure") } };
export const CommitChainMismatch: Story = { args: { setup: paused("commitChainMismatch") } };
export const MissingTurn: Story = { args: { setup: paused("missingTurn") } };
export const Restoring: Story = {
  args: {
    setup: async (controller, host) => {
      await paused("backpressure")(controller, host);
      host.setAttachOutcome(recoveryFirstId, "pending");
      const snapshot = controller.session.getSnapshot();
      if (snapshot.phase === "projectionUnavailable")
        void controller.session.recoverProjection(recoveryFirstId, snapshot.identity);
    },
  },
};
export const Failed: Story = {
  args: {
    setup: async (controller, host) => {
      await paused("backpressure")(controller, host);
      host.setAttachOutcome(recoveryFirstId, "failure");
      const snapshot = controller.session.getSnapshot();
      if (snapshot.phase === "projectionUnavailable")
        await controller.session.recoverProjection(recoveryFirstId, snapshot.identity);
      host.setAttachOutcome(recoveryFirstId, "success", 1_500);
    },
  },
};
export const ConnectionUnavailable: Story = {
  args: {
    setup: async (controller, host) => {
      await paused("backpressure")(controller, host);
      controller.connectionUnavailable();
      host.setAttachOutcome(recoveryFirstId, "failure");
      await controller.restoreConnection(host.commands, () => recoveryFirstId);
      host.setAttachOutcome(recoveryFirstId, "success", 1_500);
    },
  },
};

export const TaskOperations: Story = {
  args: {
    setup: async (controller, host) => {
      await paused("backpressure")(controller, host);
      controller.session.setOperationError(
        recoveryFirstId,
        "navigation",
        new Error("STORYBOOK_OPEN_TASK_FAILED"),
      );
      controller.session.setOperationError(
        recoveryFirstId,
        "remove",
        new Error("STORYBOOK_REMOVE_TASK_FAILED"),
      );
    },
  },
};
