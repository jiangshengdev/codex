import { Button, Modal } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";

export function FailureDiagnosticModal({
  children,
  triggerClassName = "mt-2",
}: Readonly<{ children: ReactNode; triggerClassName?: string }>) {
  const { t } = useLingui();

  return (
    <Modal>
      <Button className={`h-auto ${triggerClassName}`} variant="secondary">
        <Trans comment="Opens raw diagnostic details for the associated failure">
          View diagnostic information
        </Trans>
      </Button>
      <Modal.Backdrop>
        <Modal.Container scroll="inside">
          <Modal.Dialog>
            <Modal.CloseTrigger
              aria-label={t({
                message: "Close diagnostics",
                comment: "Accessible label for closing the failure diagnostics dialog",
              })}
            />
            <Modal.Header>
              <Modal.Heading>
                <Trans comment="Title of the dialog showing raw failure details">
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
