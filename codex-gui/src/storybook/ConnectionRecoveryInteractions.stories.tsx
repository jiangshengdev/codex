import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { ConnectionRecoverySimulation } from "./ConnectionRecoverySimulation";

const meta = {
  title: "Feedback/Connection recovery/Interactions",
  component: ConnectionRecoverySimulation,
  parameters: {
    docs: {
      description: {
        component:
          "Local reconnect simulations using ConnectionRecoveryNotice. No backend connection is made. Click Reconnect to start, then Restart simulation to reset.",
      },
    },
  },
} satisfies Meta<typeof ConnectionRecoverySimulation>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Success: Story = { args: { outcome: "success" } };

export const Failure: Story = { args: { outcome: "failure" } };
