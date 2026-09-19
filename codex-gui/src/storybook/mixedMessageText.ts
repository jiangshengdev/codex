import { composerLongSendText } from "./composer/composerLongSendText";

/** Deterministic fictional content shared by list previews; even rows stay short. */
export function mixedMessageText(label: string, index: number): string {
  const title = `${label} ${String(index)}`;
  return index % 2 === 0 ? title : `${title}\n${composerLongSendText}\n\nEND OF ${title}`;
}
