type EnterShortcutModifiers = Readonly<
  Partial<Pick<KeyboardEvent, "altKey" | "ctrlKey" | "metaKey" | "shiftKey">>
>;

export function dispatchEnterShortcut(element: Element, modifiers: EnterShortcutModifiers): void {
  element.dispatchEvent(
    new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Enter",
      ...modifiers,
    }),
  );
}

export function dispatchHistoryShortcut(element: Element, command: "undo" | "redo"): void {
  const isApple = /Mac|iPod|iPhone|iPad/.test(navigator.platform);
  const isRedo = command === "redo";
  element.dispatchEvent(
    new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      ctrlKey: !isApple,
      key: isRedo && !isApple ? "y" : "z",
      metaKey: isApple,
      shiftKey: isRedo && isApple,
    }),
  );
}

export function dispatchGuideShortcut(element: Element): void {
  const isMac = navigator.platform.startsWith("Mac");
  dispatchEnterShortcut(element, { ctrlKey: !isMac, metaKey: isMac });
}
