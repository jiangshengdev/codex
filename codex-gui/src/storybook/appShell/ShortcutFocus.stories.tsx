import { Trans } from "@lingui/react/macro";
import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { appShortcutDefinitions } from "@/features/appShell/appShortcuts";
import { StorybookStatefulEnvironment } from "../environment/StorybookStatefulEnvironment";
import { ShortcutInstructions } from "../shared/ShortcutInstructions";
import { ShellPreview } from "./ShellPreview";

const meta = {
  id: "app-shell-shortcuts-focus",
  title: "App shell/Shortcuts/Menu and focus",
  component: ShellPreview,
  args: { realPages: true },
  parameters: { layout: "fullscreen", hasFixedHeader: true },
  decorators: [
    (Story, context) => (
      <StorybookStatefulEnvironment storyId={context.id}>
        <ShortcutInstructions
          hasFixedHeader
          keys={appShortcutDefinitions[context.name === "Toggle Menu" ? "menu" : "focus"].mac}
        >
          {context.name === "Toggle Menu" ? (
            <Trans>
              Focus the message input or Menu button, then toggle the menu. Keyboard opening shows
              one themed close-button ring; mouse opening is the comparison. Escape or the shortcut
              closes the menu and restores focus. Hover or Tab to Menu to inspect its Tooltip.
            </Trans>
          ) : (
            <Trans>
              Focus Menu, then press the shortcut. Focus moves into the editable Composer with a
              visible focus frame. When the input is unavailable or this page has no Composer, focus
              stays on Menu.
            </Trans>
          )}
        </ShortcutInstructions>
        <Story />
      </StorybookStatefulEnvironment>
    ),
  ],
} satisfies Meta<typeof ShellPreview>;
export default meta;
type Story = StoryObj<typeof meta>;
export const ToggleMenu: Story = {};
export const FocusComposer: Story = {};
export const FocusNewDraft: Story = { args: { route: "newTask" } };
export const InputUnavailable: Story = { args: { route: "newTask", inputUnavailable: true } };
export const PageWithoutComposer: Story = { args: { route: "historyList" } };
