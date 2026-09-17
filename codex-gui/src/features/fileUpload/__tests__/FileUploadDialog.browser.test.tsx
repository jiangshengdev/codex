import { afterEach, expect, test, vi } from "vitest";
import { renderWithProviders } from "@/utils/test-utils";
import { FileUploadDialog } from "../FileUploadDialog";

afterEach(() => {
  vi.restoreAllMocks();
});

test("retains a failed file and uploads it again only after manual retry", async () => {
  const request = vi
    .spyOn(globalThis, "fetch")
    .mockRejectedValueOnce(new TypeError("Network unavailable"))
    .mockResolvedValueOnce(new Response("/tmp/codex-upload-retry/photo.HEIC", { status: 201 }));
  const screen = await renderWithProviders(<FileUploadDialog authorizationToken="upload-token" />);
  await screen.getByRole("button", { name: "Upload file", exact: true }).click();
  const dialog = screen.getByRole("dialog", { name: "Upload file", exact: true });
  await dialog
    .getByLabelText("Choose a file")
    .upload(new File(["whole original content"], "photo.HEIC"));
  await dialog.getByRole("button", { name: "Upload", exact: true }).click();
  await expect.element(dialog.getByRole("alert")).toHaveTextContent("File upload failed.");
  await expect.element(dialog.getByText("photo.HEIC", { exact: true })).toBeVisible();
  await expect.element(dialog.getByRole("button", { name: "Retry upload" })).toBeEnabled();
  expect(request).toHaveBeenCalledOnce();
  await dialog.getByRole("button", { name: "Close file upload" }).click();
  await screen.getByRole("button", { name: "Upload file", exact: true }).click();
  await expect.element(dialog.getByText("photo.HEIC", { exact: true })).toBeVisible();
  expect(request).toHaveBeenCalledOnce();
  await dialog.getByRole("button", { name: "Retry upload" }).click();
  await expect.element(dialog.getByText("/tmp/codex-upload-retry/photo.HEIC")).toBeVisible();
  expect(request).toHaveBeenCalledTimes(2);
  const retriedFile = request.mock.calls[1]?.[1]?.body;
  expect(retriedFile).toBe(request.mock.calls[0]?.[1]?.body);
  if (!(retriedFile instanceof File)) throw new Error("Expected complete File body");
  expect(await retriedFile.text()).toBe("whole original content");
});

test("uploads an original HEIC file and displays the returned CLI path", async () => {
  const request = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response("/tmp/codex-upload-example/phone photo.HEIC", { status: 201 }));
  const screen = await renderWithProviders(<FileUploadDialog authorizationToken="upload-token" />);
  await screen.getByRole("button", { name: "Upload file", exact: true }).click();
  const dialog = screen.getByRole("dialog", { name: "Upload file", exact: true });
  await dialog
    .getByLabelText("Choose a file")
    .upload(
      new File([new Uint8Array([0, 1, 255, 128])], "phone photo.HEIC", { type: "image/heic" }),
    );
  await dialog.getByRole("button", { name: "Upload", exact: true }).click();
  await expect
    .element(dialog.getByText("/tmp/codex-upload-example/phone photo.HEIC"))
    .toBeVisible();
  expect(request).toHaveBeenCalledOnce();
  const call = request.mock.calls[0];
  if (call == null) throw new Error("Expected upload request");
  const [url, options] = call;
  if (typeof url !== "string") throw new Error("Expected upload URL");
  expect(new URL(url, window.location.href).pathname).toBe("/upload");
  expect(new URL(url, window.location.href).searchParams.get("filename")).toBe("phone photo.HEIC");
  expect(options?.method).toBe("POST");
  expect(new Headers(options?.headers).get("Authorization")).toBe("Bearer upload-token");
  expect(new Headers(options?.headers).get("Content-Type")).toBe("application/octet-stream");
  const uploadedFile = options?.body;
  expect(uploadedFile).toBeInstanceOf(File);
  if (!(uploadedFile instanceof File)) throw new Error("Expected original File body");
  expect(Array.from(new Uint8Array(await uploadedFile.arrayBuffer()))).toEqual([0, 1, 255, 128]);
  await dialog.getByRole("button", { name: "Close file upload" }).click();
  await screen.getByRole("button", { name: "Upload file", exact: true }).click();
  await expect
    .element(dialog.getByText("/tmp/codex-upload-example/phone photo.HEIC"))
    .toBeVisible();
});

test.each(["server failure", "response body interrupted"])(
  "retries %s without claiming success before the path arrives",
  async (failure) => {
    const failedResponse =
      failure === "server failure"
        ? new Response("write failed", { status: 500 })
        : new Response(
            new ReadableStream({
              start(controller) {
                controller.error(new TypeError("Response interrupted"));
              },
            }),
            { status: 201 },
          );
    const request = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(failedResponse)
      .mockResolvedValueOnce(new Response("/tmp/codex-upload-retry/note.txt", { status: 201 }));
    const screen = await renderWithProviders(
      <FileUploadDialog authorizationToken="upload-token" />,
    );
    await screen.getByRole("button", { name: "Upload file", exact: true }).click();
    const dialog = screen.getByRole("dialog", { name: "Upload file", exact: true });
    await dialog.getByLabelText("Choose a file").upload(new File(["hello"], "note.txt"));
    await dialog.getByRole("button", { name: "Upload", exact: true }).click();
    await expect.element(dialog.getByRole("alert")).toHaveTextContent("File upload failed.");
    await expect
      .element(
        dialog.getByText(
          "The file may already have been saved. Retrying uploads the entire file again and may create another copy.",
        ),
      )
      .toBeVisible();
    await expect
      .element(dialog.getByText("File saved on the Codex machine"))
      .not.toBeInTheDocument();
    expect(request).toHaveBeenCalledOnce();
    await dialog.getByRole("button", { name: "Retry upload" }).click();
    await expect.element(dialog.getByText("/tmp/codex-upload-retry/note.txt")).toBeVisible();
    expect(request).toHaveBeenCalledTimes(2);
  },
);

test("aborts the in-flight upload on unmount", async () => {
  const request = vi.spyOn(globalThis, "fetch").mockImplementation(
    (_url, options) =>
      new Promise((_resolve, reject) => {
        options?.signal?.addEventListener(
          "abort",
          () => {
            reject(new DOMException("Aborted", "AbortError"));
          },
          { once: true },
        );
      }),
  );
  const screen = await renderWithProviders(<FileUploadDialog authorizationToken="upload-token" />);
  await screen.getByRole("button", { name: "Upload file", exact: true }).click();
  const dialog = screen.getByRole("dialog", { name: "Upload file", exact: true });
  await dialog.getByLabelText("Choose a file").upload(new File(["hello"], "note.txt"));
  await dialog.getByRole("button", { name: "Upload", exact: true }).click();
  const signal = request.mock.calls[0]?.[1]?.signal;
  expect(signal?.aborted).toBe(false);
  await expect.element(dialog.getByLabelText("Choose a file")).toBeDisabled();
  await screen.unmount();
  expect(signal?.aborted).toBe(true);
  expect(request).toHaveBeenCalledOnce();
});

test("rejects a file exceeding 50 MiB before sending it", async () => {
  const request = vi.spyOn(globalThis, "fetch");
  const screen = await renderWithProviders(<FileUploadDialog authorizationToken="upload-token" />);
  await screen.getByRole("button", { name: "Upload file", exact: true }).click();
  const dialog = screen.getByRole("dialog", { name: "Upload file", exact: true });
  // Playwright's in-memory upload bridge rejects buffers over 50 MiB.
  // Dispatch the real browser FileList to test the application limit instead.
  const transfer = new DataTransfer();
  transfer.items.add(new File([new Uint8Array(52_428_801)], "large.bin"));
  const input = dialog.getByLabelText("Choose a file").element() as HTMLInputElement;
  input.files = transfer.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
  await expect
    .element(dialog.getByRole("alert"))
    .toHaveTextContent("The file exceeds the 50 MiB limit.");
  await expect.element(dialog.getByRole("button", { name: "Upload", exact: true })).toBeDisabled();
  expect(request).not.toHaveBeenCalled();
});

test.each([
  [403, "File upload is not authorized. Open the current GUI launch link."],
  [413, "The file exceeds the 50 MiB limit."],
  [500, "File upload failed."],
])(
  "shows a useful failure for HTTP %s without displaying a successful path",
  async (status, message) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("private backend details", { status }),
    );
    const screen = await renderWithProviders(
      <FileUploadDialog authorizationToken="upload-token" />,
    );
    await screen.getByRole("button", { name: "Upload file", exact: true }).click();
    const dialog = screen.getByRole("dialog", { name: "Upload file", exact: true });
    await dialog.getByLabelText("Choose a file").upload(new File(["hello"], "note.txt"));
    await dialog.getByRole("button", { name: "Upload", exact: true }).click();
    await expect.element(dialog.getByRole("alert")).toHaveTextContent(message);
    await expect
      .element(dialog.getByText("File saved on the Codex machine"))
      .not.toBeInTheDocument();
  },
);
