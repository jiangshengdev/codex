import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { QrAccessPopover, type QrAccessPopoverProps } from "@/features/qrAccess/QrAccessPopover";

function QrPreview({
  edge = "right",
  ...props
}: QrAccessPopoverProps & { edge?: "left" | "right" }) {
  return (
    <main
      className={`flex min-h-[85svh] items-end p-2 ${edge === "right" ? "justify-end" : "justify-start"}`}
    >
      <QrAccessPopover {...props} />
    </main>
  );
}

const meta = {
  id: "app-shell-qr-access",
  title: "App shell/QR access/States",
  component: QrPreview,
  parameters: { layout: "fullscreen" },
  args: {
    authorizationToken: "storybook-fictional-token",
    origin: "https://gui.example.test",
    routeTarget: { type: "currentTask", threadId: "00000000-0000-0000-0000-000000000301" },
  },
} satisfies Meta<typeof QrPreview>;
export default meta;
type Story = StoryObj<typeof meta>;
export const CurrentTask: Story = {};
export const HistoryDetail: Story = {
  args: {
    routeTarget: { type: "historyDetail", threadId: "00000000-0000-0000-0000-000000000302" },
  },
};
export const MissingCredentials: Story = { args: { authorizationToken: null } };
export const HistoryList: Story = { args: { routeTarget: { type: "historyList" } } };
export const NewSession: Story = { args: { routeTarget: { type: "newTask" } } };
export const LongUrlRightEdge: Story = {
  args: { authorizationToken: "storybook-fictional-long-token-".repeat(8) },
};
export const LongUrlLeftEdge: Story = { args: { ...LongUrlRightEdge.args, edge: "left" } };
