import { Button } from "@heroui/react";
import { Trans } from "@lingui/react/macro";
import { useEffect, useState } from "react";

function permission(): NotificationPermission | "unavailable" {
  return typeof Notification === "undefined" ? "unavailable" : Notification.permission;
}

export function BrowserNotificationPermission() {
  const [current, setCurrent] = useState(permission);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const refresh = () => {
      setCurrent(permission());
    };
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
    };
  }, []);
  const request = async () => {
    if (permission() !== "default") {
      setCurrent(permission());
      return;
    }
    setPending(true);
    setFailed(false);
    try {
      setCurrent(await Notification.requestPermission());
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  };
  if (current === "granted" || current === "unavailable") return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="secondary"
        isDisabled={pending || current === "denied"}
        onPress={() => {
          void request();
        }}
      >
        <Trans comment="Explicit user action that requests the browser's notification permission">
          Enable browser notifications
        </Trans>
      </Button>
      {current === "denied" || failed ? (
        <span className="text-sm text-muted">
          <Trans>Browser notifications are unavailable. Task markers remain enabled.</Trans>
        </span>
      ) : null}
    </div>
  );
}
