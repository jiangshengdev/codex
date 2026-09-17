import { MAX_UPLOAD_BYTES, UPLOAD_PATH, type GuiUploadParams } from "@codex-gui-host-contract";

export type UploadFailure = "size" | "authorization" | "upload";
export type UploadResult =
  | { type: "uploaded"; path: string }
  | { type: "failed"; reason: UploadFailure };

export async function uploadFile(
  file: File,
  authorizationToken: string,
  signal: AbortSignal,
): Promise<UploadResult> {
  if (file.size > MAX_UPLOAD_BYTES) return { type: "failed", reason: "size" };
  try {
    const query = new URLSearchParams({ filename: file.name } satisfies GuiUploadParams);
    const response = await fetch(`${UPLOAD_PATH}?${query}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${authorizationToken}`,
        "Content-Type": "application/octet-stream",
      },
      body: file,
      signal,
    });
    if (response.status !== 201)
      return {
        type: "failed",
        reason:
          response.status === 413 ? "size" : response.status === 403 ? "authorization" : "upload",
      };
    const path = await response.text();
    return path.length === 0 ? { type: "failed", reason: "upload" } : { type: "uploaded", path };
  } catch {
    return { type: "failed", reason: "upload" };
  }
}
