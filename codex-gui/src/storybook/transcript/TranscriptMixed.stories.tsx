import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { StorybookStatefulEnvironment } from "../environment/StorybookStatefulEnvironment";
import { MixedTranscriptPreview } from "./MixedTranscriptPreview";

const meta = {
  id: "transcript-mixed",
  title: "Transcript/Rich content/Mixed",
  component: MixedTranscriptPreview,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story, context) => (
      <StorybookStatefulEnvironment storyId={context.id}>
        <Story />
      </StorybookStatefulEnvironment>
    ),
  ],
} satisfies Meta<typeof MixedTranscriptPreview>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Replay: Story = {};
export const Growing: Story = { args: { initialStep: 1 } };
export const Completed: Story = { args: { initialStep: 3 } };
export const LocateEarlierTurn: Story = { args: { initialStep: 3, locateTurn: true } };
