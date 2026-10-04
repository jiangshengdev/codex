export function isMarkdownTextCopyAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    typeof (navigator as Partial<Pick<Navigator, "clipboard">>).clipboard?.writeText === "function"
  );
}
