import { msg } from "@lingui/core/macro";
import { useEffect, useEffectEvent } from "react";

export const appShortcutDefinitions = {
  menu: {
    label: msg({
      message: "Toggle main menu",
      comment: "Keyboard shortcut that opens or closes the navigation drawer",
    }),
    mac: "Meta+B",
    windows: "Control+B",
  },
  focus: {
    label: msg({
      message: "Focus message input",
      comment: "Keyboard shortcut to focus the current message composer",
    }),
    mac: "Meta+Shift+E",
    windows: "Control+Alt+E",
  },
  newSession: {
    label: msg({ message: "New session", comment: "Open the unsent new conversation draft" }),
    mac: "Meta+Shift+O",
    windows: "Control+Alt+N",
  },
  previousTask: {
    label: msg({
      message: "Previous task",
      comment: "Previous task in displayed active-task order, wrapping at the beginning",
    }),
    mac: "Control+Meta+K",
    windows: "Control+Alt+K",
  },
  nextTask: {
    label: msg({
      message: "Next task",
      comment: "Next task in displayed active-task order, wrapping at the end",
    }),
    mac: "Control+Meta+J",
    windows: "Control+Alt+J",
  },
} as const;

export type AppShortcutAction = keyof typeof appShortcutDefinitions;

export function appShortcut(action: AppShortcutAction, platform = navigator.platform) {
  const platformKey = platform.startsWith("Mac")
    ? "mac"
    : platform.startsWith("Win")
      ? "windows"
      : null;
  if (platformKey == null) return null;
  const aria = appShortcutDefinitions[action][platformKey];
  return {
    aria,
  };
}

export function useAppShortcuts(actions: Partial<Record<AppShortcutAction, () => boolean>>) {
  const handle = useEffectEvent((event: KeyboardEvent) => {
    for (const action of Object.keys(actions) as AppShortcutAction[]) {
      const shortcut = appShortcut(action);
      if (shortcut == null) continue;
      const keys = shortcut.aria.split("+");
      if (
        event.key.toUpperCase() !== keys.at(-1) ||
        event.metaKey !== keys.includes("Meta") ||
        event.ctrlKey !== keys.includes("Control") ||
        event.altKey !== keys.includes("Alt") ||
        event.shiftKey !== keys.includes("Shift")
      )
        continue;
      if (actions[action]?.()) {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }
  });
  useEffect(() => {
    let composing = false;
    const start = () => {
      composing = true;
    };
    const end = () => {
      composing = false;
    };
    const keydown = (event: KeyboardEvent) => {
      if (
        composing ||
        event.isComposing ||
        event.repeat ||
        event.defaultPrevented ||
        event.getModifierState("AltGraph")
      )
        return;
      handle(event);
    };
    document.addEventListener("compositionstart", start, true);
    document.addEventListener("compositionend", end, true);
    document.addEventListener("keydown", keydown, true);
    window.addEventListener("blur", end);
    return () => {
      document.removeEventListener("compositionstart", start, true);
      document.removeEventListener("compositionend", end, true);
      document.removeEventListener("keydown", keydown, true);
      window.removeEventListener("blur", end);
    };
  }, []);
}
