/** Feed fictional samples through the same file-selection event as local files. */
export function insertSampleFiles(root: HTMLElement | null, files: readonly File[]) {
  const input = root?.querySelector<HTMLInputElement>('input[type="file"]');
  if (input == null) return;
  const transfer = new DataTransfer();
  for (const file of files) transfer.items.add(file);
  input.files = transfer.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}
