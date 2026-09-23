export function installClipboardForTest(
  capabilities: Partial<Pick<Clipboard, "write" | "writeText">>,
): void {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: capabilities,
  });
}
