import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { StorybookStatefulEnvironment } from "./StorybookStatefulEnvironment";
import { MixedTranscriptPreview } from "./transcript/MixedTranscriptPreview";

const meta = {
  title: "Transcript/Mixed",
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
