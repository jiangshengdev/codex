import { Button, ButtonGroup, Modal, Tooltip } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Info } from "lucide-react";
import type { ReactNode } from "react";

export function AttachmentFailureDetails({
  name,
  children,
}: {
  name: string;
  children: ReactNode;
}) {
  const { t } = useLingui();
  const label = t({
    comment: "Opens upload or preview failure details for the named draft attachment",
    message: `Failure details for ${name}`,
  });
  return (
    <Modal>
      <Tooltip>
        <Button
          isIconOnly
          size="sm"
          variant="tertiary"
          className="h-auto shrink-0 md:h-auto"
          aria-label={label}
        >
          <ButtonGroup.Separator />
          <Info size={16} aria-hidden="true" />
        </Button>
        <Tooltip.Content>{label}</Tooltip.Content>
      </Tooltip>
      <Modal.Backdrop>
        <Modal.Container scroll="inside">
          <Modal.Dialog>
            <Modal.CloseTrigger
              aria-label={t({
                comment: "Closes the attachment failure dialog",
                message: "Close failure details",
              })}
            />
            <Modal.Header>
              <Modal.Heading className="wrap-anywhere pr-8">{label}</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="wrap-anywhere">{children}</Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
