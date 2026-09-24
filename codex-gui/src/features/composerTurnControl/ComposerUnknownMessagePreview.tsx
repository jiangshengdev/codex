import { Trans } from "@lingui/react/macro";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ComposerFullMessagePreview } from "./ComposerFullMessagePreview";
import { ComposerInputPreviewContent } from "./ComposerInputPreviewContent";

export function ComposerUnknownMessagePreview({
  actions,
  text,
}: Readonly<{ actions: ReactNode; text: string }>) {
  const textRef = useRef<HTMLParagraphElement>(null);
  const [isTruncated, setIsTruncated] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const element = textRef.current;
    if (element == null) return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setIsTruncated(element.scrollHeight > element.clientHeight);
      });
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [text]);

  return (
    <ComposerFullMessagePreview
      actions={actions}
      actionLayout="adaptive"
      fullText={text}
      heading={<Trans>Sending result unknown</Trans>}
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      showFullMessage={isTruncated || isOpen}
    >
      <ComposerInputPreviewContent
        preview={{ type: "text", text, truncated: false }}
        textRef={textRef}
      />
    </ComposerFullMessagePreview>
  );
}
