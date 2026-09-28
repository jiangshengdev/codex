import { Disclosure, Kbd } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { composerShortcutsForPlatform } from "@/features/composerEditor/composerShortcuts";
import { appShortcut, appShortcutDefinitions, type AppShortcutAction } from "./appShortcuts";

export function ShortcutHelp() {
  const { t } = useLingui();
  const guide = composerShortcutsForPlatform(navigator.platform).guide;
  return (
    <Disclosure className="mt-3 border-t border-separator pt-3">
      <Disclosure.Heading>
        <Disclosure.Trigger>
          <Trans comment="Navigation drawer entry for the keyboard shortcut reference">
            Keyboard shortcuts
          </Trans>
          <Disclosure.Indicator />
        </Disclosure.Trigger>
      </Disclosure.Heading>
      <Disclosure.Content>
        <dl className="flex flex-col gap-3 py-3 text-sm">
          {(Object.keys(appShortcutDefinitions) as AppShortcutAction[]).map((action) => {
            const shortcut = appShortcut(action);
            return shortcut == null ? null : (
              <div key={action} className="flex flex-wrap items-center justify-between gap-2">
                <dt>{t(appShortcutDefinitions[action].label)}</dt>
                <dd>
                  <Kbd>{shortcut.visible}</Kbd>
                </dd>
              </div>
            );
          })}
          <div>
            <dt>
              <Trans>Send</Trans>
            </dt>
            <dd>
              <Kbd>Enter</Kbd>
            </dd>
          </div>
          <div>
            <dt>
              <Trans comment="Insert a newline in the message editor">New line</Trans>
            </dt>
            <dd>
              <Kbd>Shift+Enter</Kbd>
            </dd>
          </div>
          <div>
            <dt>
              <Trans comment="Steer the current running task with a message">
                Guide current task
              </Trans>
            </dt>
            <dd>
              <Kbd>{guide.visible}</Kbd>
            </dd>
          </div>
          <div>
            <dt>
              <Trans>Stop</Trans>
            </dt>
            <dd>
              <Trans comment="The stop action has no keyboard binding">No keyboard shortcut</Trans>
            </dd>
          </div>
        </dl>
      </Disclosure.Content>
    </Disclosure>
  );
}
