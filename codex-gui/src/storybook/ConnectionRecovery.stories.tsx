import type { Meta, StoryObj } from "@storybook/tanstack-react";
import {
  Controls,
  Description,
  Primary,
  Source,
  Stories,
  Title,
} from "@storybook/addon-docs/blocks";
import type { ComponentProps } from "react";
import { fn } from "storybook/test";
import { ConnectionRecoveryNotice } from "@/features/appShell/ConnectionRecoveryNotice";

const recoveryPresets = {
  Ready: { pending: false, error: null, reconnect: fn().mockName("reconnect") },
  Pending: { pending: true, error: null, reconnect: fn().mockName("reconnect") },
  Failed: {
    pending: false,
    error: "Simulated reconnect failure",
    reconnect: fn().mockName("reconnect"),
  },
  Unavailable: null,
} satisfies Record<string, ComponentProps<typeof ConnectionRecoveryNotice>["recovery"]>;

const meta = {
  title: "Feedback/Connection recovery/States",
  component: ConnectionRecoveryNotice,
  tags: ["autodocs"],
  parameters: {
    docs: {
      page: () => (
        <>
          <Title />
          <Primary />
          <Controls />
          <Description />
          <p>
            Local simulations:{" "}
            <a
              href="/?path=/story/feedback-connection-recovery-interactions--success"
              target="_top"
            >
              Success
            </a>
            {" / "}
            <a
              href="/?path=/story/feedback-connection-recovery-interactions--failure"
              target="_top"
            >
              Failure
            </a>
          </p>
          <h2>Usage</h2>
          <Source
            language="tsx"
            code={
              "<ConnectionRecoveryNotice\n  hasRetainedSession={true}\n  recovery={{ pending: false, error: null, reconnect: handleReconnect }}\n/>"
            }
          />
          <Stories />
        </>
      ),
      description: {
        component: `Displays GUI host connection recovery feedback. This business component owns its title, description, severity, reconnect action, and diagnostic dialog.

### Props

\`hasRetainedSession\` describes whether a conversation session is retained. When true, the notice says “Connection closed” and explains that conversations and input remain. When false, it says “Unable to start Codex GUI”. It does not select warning or error severity.

\`recovery\` is either null or an object with \`pending: boolean\`, \`error: unknown\`, and \`reconnect(): void\`. Null hides the reconnect button. A non-null error selects danger feedback and enables diagnostics; otherwise the notice uses warning feedback. Pending disables the reconnect action while showing its progress label.

The recovery control selects complete prop values: Ready = pending false / error null; Pending = pending true / error null; Failed = pending false / a simulated error; Unavailable = null. Every non-null preset provides a reconnect callback recorded in Actions.

### Local interaction demos

Success and Failure simulate a reconnect locally. They do not connect to a backend. The fixed examples below only render the supplied props; clicking Reconnect records a callback without changing them.

Component text follows the existing locale and theme environment. Documentation and story names remain in English.`,
      },
    },
  },
  argTypes: {
    hasRetainedSession: {
      control: "boolean",
      description:
        "Whether a conversation session is retained. Controls the title and description, not severity.",
    },
    recovery: {
      control: "select",
      options: ["Ready", "Pending", "Failed", "Unavailable"],
      mapping: recoveryPresets,
      description:
        "Recovery data and callback, or null when reconnect is unavailable. Select a complete prop preset.",
    },
  },
  args: {
    hasRetainedSession: true,
    recovery: recoveryPresets.Ready,
  },
} satisfies Meta<typeof ConnectionRecoveryNotice>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

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
