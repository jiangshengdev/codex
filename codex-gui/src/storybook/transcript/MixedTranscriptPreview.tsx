import { Button } from "@heroui/react";
import { Trans } from "@lingui/react/macro";
import { useState } from "react";
import type { TurnPositionRequest } from "@/features/browserLaunch/useTurnPositionRequest";
import { DevOnly } from "../environment/DevOnly";
import { TranscriptImageEnvironment } from "./TranscriptImageEnvironment";
import { TranscriptReplayPreview } from "./TranscriptReplayPreview";
import { mixedReplay } from "./mixedReplay";

export function MixedTranscriptPreview({
  initialStep = 0,
  locateTurn = false,
}: {
  initialStep?: number;
  locateTurn?: boolean;
}) {
  const [turnPosition, setTurnPosition] = useState<TurnPositionRequest | null>(null);
  return (
    <TranscriptImageEnvironment>
      {locateTurn ? (
        <div className="app-shell-content-boundary" data-app-shell-content-layout="reading">
          <DevOnly>
            <Button
              variant="secondary"
              onPress={() => {
                setTurnPosition({ turnId: "rich-longCode", position: "end", visit: {} });
              }}
            >
              <Trans comment="Storybook control that locates the end of an earlier conversation turn containing code">
                Locate code turn
              </Trans>
            </Button>
          </DevOnly>
        </div>
      ) : null}
      <TranscriptReplayPreview
        frames={mixedReplay}
        initialStep={initialStep}
        turnPosition={turnPosition}
        onReset={() => {
          setTurnPosition(null);
        }}
      />
    </TranscriptImageEnvironment>
  );
}
