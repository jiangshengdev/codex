import { Button, Modal } from "@heroui/react";
import { Trans } from "@lingui/react/macro";
import type { ComponentProps, ReactNode } from "react";
import { ReadingModalHeading } from "@/feedback/ReadingModalHeading";

export function ComposerFullMessagePreview({
  actions,
  actionLayout = "footer",
  children,
  footerStart,
  fullText,
  heading,
  isOpen,
  onOpenChange,
  showFullMessage,
  spacing = "default",
}: Readonly<{
  actions?: ReactNode;
  actionLayout?: "footer" | "adaptive";
  children: ReactNode;
  footerStart?: ReactNode;
  fullText: string | null;
  heading: ReactNode;
  showFullMessage: boolean;
  spacing?: "compact" | "default";
}> &
  Pick<ComponentProps<typeof Modal>, "isOpen" | "onOpenChange">) {
  const inlineActions = actionLayout === "adaptive" && !showFullMessage;
  return (
    <div
      className={`flex min-w-0 ${inlineActions ? "flex-wrap items-center" : "flex-col"} ${spacing === "compact" ? "gap-1" : "gap-2"}`}
    >
      <div className={`min-w-0 ${inlineActions ? "max-w-full flex-[1_1_max-content]" : ""}`}>
        {children}
      </div>
      {showFullMessage || actions || footerStart ? (
        <div
          className={`flex min-w-0 max-w-full shrink-0 flex-wrap items-center justify-end gap-2 ${footerStart ? "w-full" : "ml-auto"}`}
        >
          {footerStart ? <div className="mr-auto min-w-0 max-w-full">{footerStart}</div> : null}
          {showFullMessage ? (
            <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
              <Button className={footerStart ? "ml-auto" : "self-end"} size="sm" variant="outline">
                <Trans comment="Open a dialog containing the complete message shown in a truncated composer preview">
                  View full message
                </Trans>
              </Button>
              <Modal.Backdrop>
                <Modal.Container scroll="inside" size="lg">
                  <Modal.Dialog>
                    <Modal.CloseTrigger />
                    <Modal.Header>
                      <ReadingModalHeading>{heading}</ReadingModalHeading>
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
          {actions}
        </div>
      ) : null}
    </div>
  );
}
