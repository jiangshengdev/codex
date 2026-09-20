import { Button, Modal } from "@heroui/react";
import { Trans } from "@lingui/react/macro";
import { useEffect, useRef, useState } from "react";
import { ComposerInputPreviewContent } from "./ComposerInputPreviewContent";

export function ComposerUnknownMessagePreview({ text }: Readonly<{ text: string }>) {
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
    <div className="flex min-w-0 flex-col gap-2">
      <ComposerInputPreviewContent
        preview={{ type: "text", text, truncated: false }}
        textRef={textRef}
      />
      {isTruncated || isOpen ? (
        <Modal isOpen={isOpen} onOpenChange={setIsOpen}>
          <Button className="self-end" size="sm" variant="tertiary">
            <Trans comment="Open a dialog containing the complete unknown-send message">
              View full message
            </Trans>
          </Button>
          <Modal.Backdrop>
            <Modal.Container scroll="inside" size="lg">
              <Modal.Dialog>
                <Modal.CloseTrigger />
                <Modal.Header>
                  <Modal.Heading>
                    <Trans>Sending result unknown</Trans>
                  </Modal.Heading>
                </Modal.Header>
                <Modal.Body>
                  <p className="min-w-0 text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">
                    {text}
                  </p>
                </Modal.Body>
              </Modal.Dialog>
            </Modal.Container>
          </Modal.Backdrop>
        </Modal>
      ) : null}
    </div>
  );
}
