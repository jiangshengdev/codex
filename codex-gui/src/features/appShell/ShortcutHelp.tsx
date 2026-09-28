import type { ReactNode } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { composerShortcutsForPlatform } from "@/features/composerEditor/composerShortcuts";
import { appShortcut, appShortcutDefinitions, type AppShortcutAction } from "./appShortcuts";
import { ShortcutKey } from "./ShortcutKey";

export function ShortcutHelp() {
  const { t } = useLingui();
  const composer = composerShortcutsForPlatform(navigator.platform);
  return (
    <main className="app-shell-content-boundary flex min-w-0 flex-col gap-8 py-6">
      <section aria-labelledby="shortcut-navigation-heading">
        <h2 className="mb-3 text-base font-semibold" id="shortcut-navigation-heading">
          <Trans>Navigation</Trans>
        </h2>
        <dl className="flex flex-col gap-4 text-sm">
          <AppShortcutRow
            action="menu"
            description={<Trans>Open or close the main menu from any page.</Trans>}
          />
          <AppShortcutRow
            action="newSession"
            description={
              <Trans>Open the unsent draft when a working directory or draft is available.</Trans>
            }
          />
          <AppShortcutRow
            action="previousTask"
            description={
              <Trans>
                Move backward through active tasks in displayed order, wrapping at the beginning.
                Requires a selected active task.
              </Trans>
            }
          />
          <AppShortcutRow
            action="nextTask"
            description={
              <Trans>
                Move forward through active tasks in displayed order, wrapping at the end. Requires
                a selected active task.
              </Trans>
            }
          />
        </dl>
      </section>
      <section aria-labelledby="shortcut-input-heading">
        <h2 className="mb-3 text-base font-semibold" id="shortcut-input-heading">
          <Trans comment="Shortcut help group for focusing and editing the message composer">
            Message input
          </Trans>
        </h2>
        <dl className="flex flex-col gap-4 text-sm">
          <AppShortcutRow
            action="focus"
            description={
              <Trans>
                Focus the message input only when it is present and editable on the current page.
              </Trans>
            }
          />
          <ShortcutRow
            label={t`Send`}
            aria={composer.send.aria}
            description={<Trans>When the message input is focused and sending is available.</Trans>}
          />
          <ShortcutRow
            label={t({ message: "New line", comment: "Insert a newline in the message editor" })}
            aria={composer.newline.aria}
            description={<Trans>When the message input is focused and editable.</Trans>}
          />
          <ShortcutRow
            label={t({
              message: "Guide current task",
              comment: "Steer the current running task with a message",
            })}
            aria={composer.guide.aria}
            description={
              <Trans>
                When the message input is focused and guiding the running task is available.
              </Trans>
            }
          />
        </dl>
      </section>
    </main>
  );
}

function AppShortcutRow({
  action,
  description,
}: Readonly<{ action: AppShortcutAction; description: ReactNode }>) {
  const { t } = useLingui();
  const shortcut = appShortcut(action);
  return shortcut == null ? null : (
    <ShortcutRow
      label={t(appShortcutDefinitions[action].label)}
      aria={shortcut.aria}
      description={description}
    />
  );
}

function ShortcutRow({
  label,
  aria,
  description,
}: Readonly<{ label: string; aria: string; description: ReactNode }>) {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-1">
      <dt className="min-w-0 self-center wrap-break-word font-medium">{label}</dt>
      <dd className="row-span-2">
        <ShortcutKey aria={aria} />
      </dd>
      <dd className="min-w-0 text-xs wrap-break-word text-muted">{description}</dd>
    </div>
  );
}
