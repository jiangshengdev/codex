import type { Meta, StoryObj } from "@storybook/tanstack-react";
import daily from "./AsyncQuestions.stories";
import type { QuestionPagePreview } from "./QuestionPagePreview";

const meta = {
  ...daily,
  id: "transcript-async-question-lifecycle",
  title: "Transcript/Agent questions/Turn and queue",
} satisfies Meta<typeof QuestionPagePreview>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Idle: Story = { args: { preset: "idle" } };
export const Queued: Story = { args: { preset: "queued" } };
