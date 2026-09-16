import { Button } from "@heroui/react";
import { Trans } from "@lingui/react/macro";
import { useEffect, useState, type ComponentProps } from "react";
import { ConnectionRecoveryNotice } from "@/features/appShell/ConnectionRecoveryNotice";
import { DevOnly } from "./DevOnly";

export function ConnectionRecoverySimulation({
  outcome,
}: Readonly<{ outcome: "success" | "failure" }>) {
  const [phase, setPhase] = useState<"ready" | "pending" | "succeeded" | "failed">("ready");

  useEffect(() => {
    if (phase !== "pending") return;
    const timer = window.setTimeout(() => {
      setPhase(outcome === "success" ? "succeeded" : "failed");
    }, 1_500);
    return () => {
      window.clearTimeout(timer);
    };
  }, [outcome, phase]);

  const recovery: ComponentProps<typeof ConnectionRecoveryNotice>["recovery"] = {
    pending: phase === "pending",
    error: phase === "failed" ? "STORYBOOK_RECONNECT_FAILED: simulated connection refusal." : null,
    reconnect: () => {
      setPhase("pending");
    },
  };

  return (
    <div className="flex flex-col gap-4">
      {phase !== "succeeded" && <ConnectionRecoveryNotice hasRetainedSession recovery={recovery} />}
      <DevOnly>
        <Button
          className="justify-self-start"
          variant="secondary"
          onPress={() => {
            setPhase("ready");
          }}
        >
          <Trans comment="Storybook control that resets the local connection recovery demo">
            Restart simulation
          </Trans>
        </Button>
      </DevOnly>
    </div>
  );
}
