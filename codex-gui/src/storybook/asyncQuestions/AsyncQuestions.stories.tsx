import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { StorybookStatefulEnvironment } from "../environment/StorybookStatefulEnvironment";
import { statefulPreviewRouteTree } from "../environment/statefulPreviewRouter";
import { QuestionPagePreview } from "./QuestionPagePreview";
import { questionThreadId } from "./questionScenario";

const meta = {
  id: "transcript-async-questions",
  title: "Transcript/Agent questions/Daily answers",
  component: QuestionPagePreview,
  parameters: {
    layout: "fullscreen",
    hasFixedHeader: true,
    tanstack: { router: { route: statefulPreviewRouteTree, path: `/task/${questionThreadId}` } },
    docs: {
      description: {
        component:
          "Complete task page with real question ownership and sending coordination. Only backend results are simulated. Submit or skip questions independently; runtime confirmation advances one accepted answer at a time. The bottom draft remains separate.",
      },
    },
  },
  decorators: [
    (Story, context) => (
      <StorybookStatefulEnvironment storyId={context.id}>
        <Story />
      </StorybookStatefulEnvironment>
    ),
  ],
} satisfies Meta<typeof QuestionPagePreview>;
export default meta;
type Story = StoryObj<typeof meta>;
export const PlainText: Story = { args: { preset: "plainText" } };
export const Options: Story = { args: { preset: "options" } };
export const LongText: Story = { args: { preset: "longText" } };
export const Multiple: Story = { args: { preset: "multiple" } };
