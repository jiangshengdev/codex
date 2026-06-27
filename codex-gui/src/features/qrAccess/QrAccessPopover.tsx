import { Button, Popover } from "@heroui/react";
import { QrCode } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useMemo } from "react";
import type { LaunchParams } from "@/features/guiHost/guiHostClient";
import { buildQrAccessUrl } from "./qrAccessUrl";

export type QrAccessPopoverProps = {
  launchParams: LaunchParams | null;
  origin?: string;
};

export function QrAccessPopover({
  launchParams,
  origin = window.location.origin,
}: QrAccessPopoverProps) {
  const qrUrl = useMemo(() => {
    if (launchParams == null) {
      return null;
    }

    return buildQrAccessUrl({
      origin,
      threadId: launchParams.threadId,
      token: launchParams.token,
    });
  }, [launchParams, origin]);

  const isDisabled = qrUrl == null;

  return (
    <Popover>
      <Button
        isIconOnly
        aria-label="Scan with phone"
        isDisabled={isDisabled}
        size="sm"
        variant="tertiary"
      >
        <QrCode aria-hidden="true" size={18} />
      </Button>
      <Popover.Content className="w-72" placement="top" offset={12}>
        <Popover.Dialog>
          <Popover.Heading>Scan with phone</Popover.Heading>
          {qrUrl == null ? (
            <p className="text-sm text-default-500">
              QR access is unavailable until the GUI launch token is ready.
            </p>
          ) : (
            <div className="grid gap-3">
              <div className="rounded-lg bg-white p-3">
                <QRCodeSVG
                  aria-label="QR code for current GUI URL"
                  className="h-full w-full"
                  marginSize={4}
                  value={qrUrl}
                />
              </div>
              <p className="break-all text-xs text-default-500">{qrUrl}</p>
            </div>
          )}
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
