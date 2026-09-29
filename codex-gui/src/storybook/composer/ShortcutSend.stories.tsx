import { Trans } from "@lingui/react/macro";
import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { composerShortcutsForPlatform } from "@/features/composerEditor/composerShortcuts";
import { StorybookStatefulEnvironment } from "../environment/StorybookStatefulEnvironment";
import { ShortcutInstructions } from "../shared/ShortcutInstructions";
import { ComposerShortcutPreview } from "./ComposerShortcutPreview";

const shortcuts = composerShortcutsForPlatform("MacIntel");
const meta = {
  id: "composer-shortcuts-send",
  title: "Composer/Shortcuts/Send and newline",
  component: ComposerShortcutPreview,
  decorators: [
    (Story, context) => (
      <StorybookStatefulEnvironment storyId={context.id}>
        <ShortcutInstructions keys={[shortcuts.send.aria, shortcuts.newline.aria]}>
          <Trans>
            Focus the input. Enter sends the prepared text once and clears the draft; Shift+Enter
            inserts a newline at the caret without sending. Empty or whitespace-only input does not
            send. Unavailable input cannot be edited or sent. During a running turn, Enter adds an
            ordinary queued message. Hover or Tab to Send to inspect its Tooltip. Simulation
            controls can advance the response and runtime confirmation. On Safari, confirm real IME
            candidates: composing Enter and the immediate post-composition Enter must not send.
          </Trans>
        </ShortcutInstructions>
        <Story />
      </StorybookStatefulEnvironment>
    ),
  ],
} satisfies Meta<typeof ComposerShortcutPreview>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Send: Story = {};
export const Newline: Story = { args: { text: "First paragraph\nSecond paragraph" } };
export const Empty: Story = { args: { text: "" } };
export const Whitespace: Story = { args: { text: "   " } };
export const InputUnavailable: Story = { args: { inputUnavailable: true } };
export const RunningQueue: Story = { args: { running: true } };
export const CompositionGuard: Story = { args: { text: "保留这段输入" } };
