import type { UserInput } from "@codex-protocol/v2";
import { Button, Popover } from "@heroui/react";
import { Fragment, use, type ReactNode } from "react";
import { AppCapabilitiesContext } from "@/features/appShell/AppCapabilities";
import { UploadedImagePreview } from "@/features/fileUpload/UploadedImagePreview";

type TextInput = Extract<UserInput, { type: "text" }>;

function TextInputContent({
  input,
  images,
}: Readonly<{ input: TextInput; images: Extract<UserInput, { type: "localImage" }>[] }>) {
  const authorizationToken = use(AppCapabilitiesContext)?.authorizationToken ?? null;
  if (input.text_elements.length === 0) return input.text;

  const bytes = new TextEncoder().encode(input.text);
  const decoder = new TextDecoder();
  const elements = [...input.text_elements].sort(
    (left, right) => left.byteRange.start - right.byteRange.start,
  );
  const content: ReactNode[] = [];
  let offset = 0;

  for (const element of elements) {
    const { start, end } = element.byteRange;
    const original = decoder.decode(bytes.subarray(start, end));
    const label = element.placeholder ?? original;
    content.push(
      <Fragment key={`${String(start)}:${String(end)}`}>
        {decoder.decode(bytes.subarray(offset, start))}
        <span className="relative m-1 inline-block max-w-[calc(100%-0.5rem)] align-bottom focus-within:z-10">
          {images.some((image) => image.path === original) ? (
            <UploadedImagePreview
              path={original}
              name={label}
              authorizationToken={authorizationToken}
            />
          ) : (
            <Popover>
              <Button
                className="inline-flex h-auto max-w-full min-w-0 rounded-xl px-2 py-1 align-bottom text-sm md:h-auto"
                variant="tertiary"
              >
                <span className="truncate">{label}</span>
              </Button>
              <Popover.Content
                className="max-w-[min(32rem,calc(100vw-24px))]"
                placement="top start"
              >
                <Popover.Dialog aria-label={label}>
                  <p className="wrap-anywhere whitespace-pre-wrap select-text">{original}</p>
                </Popover.Dialog>
              </Popover.Content>
            </Popover>
          )}
        </span>
      </Fragment>,
    );
    offset = end;
  }
  content.push(decoder.decode(bytes.subarray(offset)));
  return <>{content}</>;
}

export function UserMessageText({
  inputs,
  images,
}: Readonly<{ inputs: TextInput[]; images: Extract<UserInput, { type: "localImage" }>[] }>) {
  const authorizationToken = use(AppCapabilitiesContext)?.authorizationToken ?? null;
  let offset = 0;
  const content: ReactNode[] = [];
  for (const input of inputs) {
    if (input.text.length === 0) continue;
    content.push(<TextInputContent input={input} images={images} key={offset} />);
    offset += input.text.length;
  }
  return (
    <div className="committed-transcript-entry-source min-w-0 max-w-full whitespace-pre-wrap wrap-break-word text-base leading-6">
      {content}
      {images
        .filter(
          (image) =>
            !inputs.some((input) =>
              input.text_elements.some(
                (element) =>
                  new TextDecoder().decode(
                    new TextEncoder()
                      .encode(input.text)
                      .subarray(element.byteRange.start, element.byteRange.end),
                  ) === image.path,
              ),
            ),
        )
        .map((image) => (
          <span
            key={image.path}
            className="relative m-1 inline-block max-w-[calc(100%-0.5rem)] align-bottom focus-within:z-10"
          >
            <UploadedImagePreview
              path={image.path}
              name={image.path.split(/[\\/]/).at(-1) ?? image.path}
              authorizationToken={authorizationToken}
            />
          </span>
        ))}
    </div>
  );
}
