import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { fn } from "storybook/test";
import { ConnectionRecoveryNotice } from "@/features/appShell/ConnectionRecoveryNotice";

const meta = {
  title: "Feedback/Connection recovery/States",
  component: ConnectionRecoveryNotice,
  args: {
    hasRetainedSession: true,
    recovery: {
      pending: false,
      error: null,
      reconnect: fn(),
    },
  },
} satisfies Meta<typeof ConnectionRecoveryNotice>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ReconnectFailed: Story = {
  args: {
    recovery: {
      pending: false,
      error: [
        "Simulated reconnect failure",
        ...Array.from(
          { length: 40 },
          (_, index) => `Attempt detail ${String(index + 1)}: simulated transport unavailable.`,
        ),
        `Diagnostic code: ${"SIMULATED_CONNECTION_FAILURE_".repeat(12)}`,
        "END OF SIMULATED DIAGNOSTICS",
      ].join("\n"),
      reconnect: fn(),
    },
  },
};

export const StartupFailed: Story = {
  args: { hasRetainedSession: false },
};

export const ConnectionClosed: Story = {};

export const Reconnecting: Story = {
  args: {
    recovery: { pending: true, error: null, reconnect: fn() },
  },
};
