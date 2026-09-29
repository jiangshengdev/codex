import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { StorybookStatefulEnvironment } from "../environment/StorybookStatefulEnvironment";
import { NewSessionPreview } from "./NewSessionPreview";

const meta = {
  id: "new-session-inputs",
  title: "New session/Inputs/Variants (local simulation)",
  component: NewSessionPreview,
  parameters: { layout: "fullscreen", hasFixedHeader: true },
  args: { preset: "initialInput" },
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
export const Skill: Story = { args: { input: "skill" } };
export const File: Story = { args: { input: "file" } };
export const Image: Story = { args: { input: "image" } };
export const Mixed: Story = { args: { input: "mixed" } };
export const MixedUploading: Story = { args: { input: "mixed", uploading: true } };
