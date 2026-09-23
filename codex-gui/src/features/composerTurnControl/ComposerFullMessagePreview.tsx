import { Button, Modal } from "@heroui/react";
import { Trans } from "@lingui/react/macro";
import type { ComponentProps, ReactNode } from "react";

export function ComposerFullMessagePreview({
  children,
  fullText,
  heading,
  isOpen,
  onOpenChange,
  showFullMessage,
  spacing = "default",
}: Readonly<{
  children: ReactNode;
  fullText: string | null;
  heading: ReactNode;
  showFullMessage: boolean;
  spacing?: "compact" | "default";
}> &
  Pick<ComponentProps<typeof Modal>, "isOpen" | "onOpenChange">) {
  return (
    <div className={`flex min-w-0 flex-col ${spacing === "compact" ? "gap-1" : "gap-2"}`}>
      {children}
      {showFullMessage ? (
        <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
          <Button className="self-end" size="sm" variant="tertiary">
            <Trans comment="Open a dialog containing the complete message shown in a truncated composer preview">
              View full message
            </Trans>
          </Button>
          <Modal.Backdrop>
            <Modal.Container scroll="inside" size="lg">
              <Modal.Dialog>
                <Modal.CloseTrigger />
                <Modal.Header>
                  <Modal.Heading>{heading}</Modal.Heading>
                </Modal.Header>
                <Modal.Body>
                  <p className="min-w-0 text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">
                    {fullText}
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
