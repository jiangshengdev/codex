import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { StorybookStatefulEnvironment } from "./StorybookStatefulEnvironment";
import { ComposerPreview } from "./composer/ComposerPreview";
import { ComposerDraftPreview } from "./composer/ComposerDraftPreview";

const meta = {
  title: "Composer/Input and send",
  component: ComposerPreview,
  parameters: { layout: "padded" },
  decorators: [
    (Story, context) => (
      <StorybookStatefulEnvironment storyId={context.id}>
        <Story />
      </StorybookStatefulEnvironment>
    ),
  ],
} satisfies Meta<typeof ComposerPreview>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Empty: Story = {};
export const RestoredDraft: Story = { render: () => <ComposerDraftPreview /> };
