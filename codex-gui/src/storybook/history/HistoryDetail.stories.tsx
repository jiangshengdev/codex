import type { Meta, StoryObj } from "@storybook/tanstack-react";
import flow from "./HistoryFlow.stories";
import { HistoryPreview } from "./HistoryPreview";

const meta = {
  ...flow,
  id: "history-detail",
  title: "History/Detail/States",
  component: HistoryPreview,
} satisfies Meta<typeof HistoryPreview>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Loading: Story = { args: { detail: "loading" } };
export const ReadError: Story = { args: { detail: "readError" } };
export const Empty: Story = { args: { detail: "empty" } };
export const Content: Story = { args: { detail: "content" } };
export const LongContent: Story = { args: { detail: "longContent" } };
export const LongContentContinuationFailure: Story = {
  args: { detail: "longContent", continuation: "resumeFailed" },
};
