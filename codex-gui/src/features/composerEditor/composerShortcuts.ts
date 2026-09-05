type EnterModifiers = Pick<KeyboardEvent, "altKey" | "ctrlKey" | "metaKey" | "shiftKey">;

function createComposerShortcuts(modifier: "Meta" | "Control") {
  const primaryKey = modifier === "Meta" ? "metaKey" : "ctrlKey";
  const otherKey = modifier === "Meta" ? "ctrlKey" : "metaKey";

  return {
    guide: {
      aria: `${modifier}+Enter`,
      visible: modifier === "Meta" ? "⌘ Enter" : "Ctrl+Enter",
    },
    submitIntentForEnter(event: EnterModifiers): "ordinary" | "guide" | null {
      if (event.shiftKey) return null;
      return event[primaryKey] && !event[otherKey] && !event.altKey ? "guide" : "ordinary";
    },
  } as const;
}

export type ComposerShortcuts = ReturnType<typeof createComposerShortcuts>;

const macShortcuts = createComposerShortcuts("Meta");
const otherShortcuts = createComposerShortcuts("Control");

export function composerShortcutsForPlatform(platform: string): ComposerShortcuts {
  return platform.startsWith("Mac") ? macShortcuts : otherShortcuts;
}
