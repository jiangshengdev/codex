import { Trans } from "@lingui/react/macro";
import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { appShortcutDefinitions } from "@/features/appShell/appShortcuts";
import { StorybookStatefulEnvironment } from "../environment/StorybookStatefulEnvironment";
import { ShortcutInstructions } from "../shared/ShortcutInstructions";
import { ShellPreview } from "../appShell/ShellPreview";

const meta = {
  id: "new-session-shortcuts-open",
  title: "New session/Shortcuts/Open draft",
  component: ShellPreview,
  args: { realPages: true },
  parameters: { layout: "fullscreen", hasFixedHeader: true },
  decorators: [
    (Story, context) => (
      <StorybookStatefulEnvironment storyId={context.id}>
        <ShortcutInstructions hasFixedHeader keys={appShortcutDefinitions.newSession.mac}>
          <Trans>
            Open the unsent new-session draft. Repeating the shortcut retains its text without
            sending. With no current task, the configured directory still permits a new draft. With
            neither a directory nor an existing draft, the shortcut does nothing. An existing draft
            can reopen even without a directory in the launch context. Holding the keys or composing
            text must not navigate.
          </Trans>
        </ShortcutInstructions>
        <Story />
      </StorybookStatefulEnvironment>
    ),
  ],
} satisfies Meta<typeof ShellPreview>;
export default meta;
type Story = StoryObj<typeof meta>;
export const FromTask: Story = {};
export const ExistingDraft: Story = { args: { newDraft: "Retained new-session draft" } };
export const AlreadyOnDraft: Story = {
  args: { route: "newTask", newDraft: "Retained new-session draft" },
};
export const NoCurrentTask: Story = { args: { route: "historyList", empty: true } };
export const MissingDirectory: Story = {
  args: { route: "historyList", empty: true, missingCwd: true },
};
export const ExistingDraftWithoutDirectory: Story = {
  args: {
    route: "historyList",
    empty: true,
    missingCwd: true,
    newDraft: "Retained new-session draft",
  },
};
