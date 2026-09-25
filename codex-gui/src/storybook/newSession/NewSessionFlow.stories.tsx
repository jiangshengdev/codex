import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { StorybookStatefulEnvironment } from "../environment/StorybookStatefulEnvironment";
import { NewSessionPreview } from "./NewSessionPreview";

const meta = {
  id: "new-session-flow",
  title: "New session/Flow/States (local simulation)",
  component: NewSessionPreview,
  parameters: { layout: "fullscreen", hasFixedHeader: true },
  decorators: [
    (Story, context) => (
      <StorybookStatefulEnvironment storyId={context.id}>
        <Story />
      </StorybookStatefulEnvironment>
    ),
  ],
} satisfies Meta<typeof NewSessionPreview>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Interactive: Story = {};
export const InitialInput: Story = { args: { preset: "initialInput" } };
export const MissingDirectory: Story = { args: { preset: "missingDirectory" } };
export const BlankInput: Story = { args: { preset: "blankInput" } };
export const Creating: Story = { args: { preset: "creating" } };
export const Activating: Story = { args: { preset: "activating" } };
export const CreationFailed: Story = { args: { preset: "failed", failure: "create" } };
export const CreationUnknown: Story = { args: { preset: "failed", failure: "createUnknown" } };
export const ActivationFailed: Story = { args: { preset: "failed", failure: "activate" } };
export const HandoffRejected: Story = { args: { preset: "failed", failure: "handoff" } };
export const HandoffUnknown: Story = { args: { preset: "failed", failure: "handoffUnknown" } };
