import { Plural, Trans } from "@lingui/react/macro";
import type { ReactNode } from "react";
import type { ComposerInputPreview } from "@/features/composerInputQueue/composerInputPreview";

export function ComposerInputPreviewContent({
  preview,
}: Readonly<{ preview: ComposerInputPreview }>) {
  if (preview.type === "text")
    return (
      <p className="min-w-0 line-clamp-3 text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">
        {preview.text}
      </p>
    );
  const counts: ReactNode[] = [];
  if (preview.imageCount > 0)
    counts.push(<Plural key="images" value={preview.imageCount} one="# image" other="# images" />);
  if (preview.audioCount > 0)
    counts.push(
      <Plural key="audio" value={preview.audioCount} one="# audio item" other="# audio items" />,
    );
  if (preview.skillCount > 0)
    counts.push(<Plural key="skills" value={preview.skillCount} one="# skill" other="# skills" />);
  if (preview.mentionCount > 0)
    counts.push(
      <Plural key="mentions" value={preview.mentionCount} one="# mention" other="# mentions" />,
    );
  return (
    <p className="flex min-w-0 flex-wrap gap-x-2 text-sm [overflow-wrap:anywhere]">
      {counts.length === 0 ? <Trans>Structured input</Trans> : counts}
    </p>
  );
}
