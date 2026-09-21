import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { composerMeta } from "./composerMeta";
import { ComposerDraftPreview } from "./ComposerDraftPreview";

const meta = {
  ...composerMeta,
  id: "composer-input-and-send-draft",
  title: "Composer/Input and drafts/Draft",
} satisfies Meta<typeof composerMeta.component>;
export default meta;
type Story = StoryObj<typeof meta>;

export const RestoredDraft: Story = {
  render: () => <ComposerDraftPreview />,
  parameters: {
    docs: {
      description: {
        story:
          "Direct preview of multiple paragraphs and a selected skill restored from isolated draft storage. Continue editing, remove the skill, or send locally. This also covers the selected-skill and multi-paragraph presets.",
      },
    },
  },
};
export const InvalidSkill: Story = {
  render: () => <ComposerDraftPreview initialSkillAvailable={false} />,
};
export const SavingFailed: Story = {
  render: () => <ComposerDraftPreview initialSaveFailure />,
};
