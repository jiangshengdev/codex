import type { Meta, StoryObj } from "@storybook/tanstack-react";
import daily from "./AsyncQuestions.stories";
import type { QuestionPagePreview } from "./QuestionPagePreview";

const meta = {
  ...daily,
  id: "transcript-async-question-recovery",
  title: "Transcript/Agent questions/Recovery and history",
} satisfies Meta<typeof QuestionPagePreview>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Disconnected: Story = { args: { preset: "disconnected" } };
export const History: Story = { args: { preset: "history" } };
