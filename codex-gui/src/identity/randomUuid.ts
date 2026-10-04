/** UUID v4 identifiers also work on ordinary HTTP origins used by LAN clients. */
export function randomUuid(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const hex = Array.from(bytes, (byte, index) => {
    if (index === 6) byte = (byte & 0x0f) | 0x40;
    if (index === 8) byte = (byte & 0x3f) | 0x80;
    return byte.toString(16).padStart(2, "0");
  }).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
