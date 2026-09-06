import { Button, Modal } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";

export function FailureDiagnosticModal({ children }: Readonly<{ children: ReactNode }>) {
  const { t } = useLingui();

  return (
    <Modal>
      <Button className="mt-2 h-auto" variant="tertiary">
        <Trans comment="Button in a history continuation error that opens a dialog with raw diagnostic details">
          View diagnostic information
        </Trans>
      </Button>
      <Modal.Backdrop>
        <Modal.Container scroll="inside">
          <Modal.Dialog>
            <Modal.CloseTrigger
              aria-label={t({
                message: "Close diagnostics",
                comment: "Accessible label for closing the history continuation diagnostics dialog",
              })}
            />
            <Modal.Header>
              <Modal.Heading>
                <Trans comment="Title of the dialog showing raw history continuation errors">
                  Diagnostic information
                </Trans>
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body className="whitespace-pre-wrap [overflow-wrap:anywhere]">
              {children}
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
