import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { StorybookStatefulEnvironment } from "./StorybookStatefulEnvironment";
import { ComposerPreview } from "./composer/ComposerPreview";
import { ComposerDraftPreview } from "./composer/ComposerDraftPreview";
import { ComposerQueuePreview } from "./composer/ComposerQueuePreview";
import { ComposerGuidePreview } from "./composer/ComposerGuidePreview";
import { ComposerStopPreview } from "./composer/ComposerStopPreview";

const meta = {
  title: "Composer/Input and send",
  component: ComposerPreview,
  parameters: { layout: "fullscreen" },
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
// Direct-display coverage: Empty owns empty input; RestoredDraft already owns
// multiple paragraphs, selected skills, and restored content. Add only the gaps.
export const Empty: Story = {};
export const Whitespace: Story = { args: { initialText: "   " } };
export const ValidText: Story = { args: { initialText: "Review this fictional change." } };
export const LongContent: Story = {
  args: {
    initialText: Array.from(
      { length: 20 },
      (_, index) =>
        `Review section ${String(index + 1)}: Keep the input readable while checking the fictional change, its context, and the expected outcome.`,
    ).join("\n\n"),
  },
};
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
// RestoredDraft owns the healthy saved draft; this entry starts at the real save error.
export const SavingFailed: Story = {
  render: () => <ComposerDraftPreview initialSaveFailure />,
};
export const RunningQueue: Story = { render: () => <ComposerQueuePreview /> };
export const RunningGuide: Story = { render: () => <ComposerGuidePreview /> };
export const RunningStop: Story = { render: () => <ComposerStopPreview /> };
