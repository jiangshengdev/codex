import { Trans } from "@lingui/react/macro";
import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { composerShortcutsForPlatform } from "@/features/composerEditor/composerShortcuts";
import { isMacAppleWebKitRuntime } from "@/features/composerEditor/composerRuntime";
import { StorybookStatefulEnvironment } from "../environment/StorybookStatefulEnvironment";
import { ShortcutInstructions } from "../shared/ShortcutInstructions";
import { ComposerGuidePreview } from "./ComposerGuidePreview";

const meta = {
  id: "composer-shortcuts-guide",
  title: "Composer/Shortcuts/Guide",
  component: ComposerGuidePreview,
  args: { preset: "withInput" },
  render: (args) => (
    <ComposerGuidePreview {...args} guardCompositionEndEnter={isMacAppleWebKitRuntime()} />
  ),
  decorators: [
    (Story, context) => (
      <StorybookStatefulEnvironment storyId={context.id}>
        <ShortcutInstructions keys={composerShortcutsForPlatform("MacIntel").guide.aria}>
          <Trans>
            Focus the input and press Command+Enter. During a running turn, the draft becomes a
            Guide message. Use the simulated guide response and runtime confirmation to observe
            completion; a separate later draft is retained. Empty input with an ordinary queue
            promotes its first message to Guide even though the Guide button is disabled. Empty
            input without a queue, no active turn, unavailable input, or a recovery blocker does not
            submit. Hover or Tab to Guide to inspect its Tooltip. On Safari, check real IME
            composition and the immediate post-composition Enter separately; this story uses the
            production runtime guard.
          </Trans>
        </ShortcutInstructions>
        <Story />
      </StorybookStatefulEnvironment>
    ),
  ],
} satisfies Meta<typeof ComposerGuidePreview>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Guide: Story = {};
export const Empty: Story = { args: { preset: "empty" } };
export const PromoteQueuedMessage: Story = { args: { preset: "ordinaryQueue" } };
export const NoActiveTurn: Story = { args: { preset: "idle" } };
export const InputUnavailable: Story = { args: { inputUnavailable: true } };
export const RecoveryBlocked: Story = { args: { preset: "failed" } };
export const CompositionGuard: Story = {};
