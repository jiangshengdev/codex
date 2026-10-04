import { Trans } from "@lingui/react/macro";
import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { appShortcutDefinitions } from "@/features/appShell/appShortcuts";
import { StorybookStatefulEnvironment } from "../environment/StorybookStatefulEnvironment";
import { ShortcutInstructions } from "../shared/ShortcutInstructions";
import { ShellPreview } from "./ShellPreview";

const meta = {
  id: "app-shell-shortcuts-tasks",
  title: "App shell/Shortcuts/Task switching",
  component: ShellPreview,
  args: { realPages: true, collection: "multiple" },
  parameters: { layout: "fullscreen", hasFixedHeader: true },
  decorators: [
    (Story, context) => (
      <StorybookStatefulEnvironment storyId={context.id}>
        <ShortcutInstructions
          hasFixedHeader
          keys={[appShortcutDefinitions.previousTask.mac, appShortcutDefinitions.nextTask.mac]}
        >
          <Trans>
            K selects the previous task; J selects the next. The displayed order is Shell task one,
            Shell task 2, Shell task 3. Initially task one is selected: previous wraps to task 3;
            next selects task 2. Keep typing separate drafts to check retention. With one task,
            navigation stays on that task; with none, it does nothing. From History, cycling starts
            from the last viewed task (task one), not from the page route. Held keys and composition
            do not switch.
          </Trans>
        </ShortcutInstructions>
        <Story />
      </StorybookStatefulEnvironment>
    ),
  ],
} satisfies Meta<typeof ShellPreview>;
export default meta;
type Story = StoryObj<typeof meta>;
export const PreviousTask: Story = {};
export const NextTask: Story = {};
export const NoTasks: Story = { args: { route: "historyList", empty: true } };
export const OneTask: Story = { args: { collection: undefined } };
export const FromHistory: Story = { args: { route: "historyList" } };
