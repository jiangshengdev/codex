import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { composerMeta } from "./composer/composerMeta";
import { ComposerSendPreview } from "./composer/ComposerSendPreview";

const meta = {
  ...composerMeta,
  title: "Composer/Input and send/Send",
} satisfies Meta<typeof composerMeta.component>;
export default meta;
type Story = StoryObj<typeof meta>;

export const SendRequestPending: Story = {
  render: () => <ComposerSendPreview preset="requestPending" />,
};
export const SendRuntimePending: Story = {
  render: () => <ComposerSendPreview preset="runtimePending" />,
};
export const SendFailed: Story = {
  render: () => <ComposerSendPreview preset="failed" />,
};
export const SendUnknown: Story = {
  render: () => <ComposerSendPreview preset="unknown" />,
};
export const SendUnknownMultiple: Story = {
  render: () => <ComposerSendPreview preset="unknownMultiple" />,
  parameters: {
    docs: {
      description: {
        story:
          "Three unresolved historical guide messages restored from isolated storage. This previews the shared sending-result-unknown panel; ordinary sends remain serial. Remove records independently or restart to restore all three.",
      },
    },
  },
};
export const SendUnknownLongText: Story = {
  render: () => <ComposerSendPreview preset="unknown" longText />,
};
export const SendUnknownMultipleLongText: Story = {
  ...SendUnknownMultiple,
  render: () => <ComposerSendPreview preset="unknownMultiple" longText />,
};
