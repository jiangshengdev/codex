import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { userEvent, within } from "storybook/test";
import flow from "./HistoryFlow.stories";
import { HistoryPreview } from "./HistoryPreview";

const meta = {
  ...flow,
  id: "history-list",
  title: "History/List/States",
  component: HistoryPreview,
} satisfies Meta<typeof HistoryPreview>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Loading: Story = { args: { list: "loading" } };
export const Empty: Story = { args: { list: "empty" } };
export const ContextUnavailable: Story = { args: { list: "contextUnavailable" } };
export const InitialError: Story = { args: { list: "initialError" } };
export const Pagination: Story = { args: { list: "pagination" } };
export const PaginationError: Story = { args: { list: "paginationError" } };
const loadMore: Story["play"] = async ({ canvasElement }) => {
  await userEvent.click(
    await within(canvasElement).findByRole("button", { name: /Load more|加载更多/ }),
  );
};
export const AppendLoading: Story = { args: { list: "appendLoading" }, play: loadMore };
export const AppendError: Story = { ...PaginationError, play: loadMore };
export const LongContent: Story = { args: { list: "longContent" } };
export const NoMoreRecords: Story = {};
