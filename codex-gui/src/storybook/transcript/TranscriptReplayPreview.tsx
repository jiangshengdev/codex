import { Button } from "@heroui/react";
import { Trans } from "@lingui/react/macro";
import { useEffect, useRef, useState } from "react";
import { useAppDispatch } from "@/app/hooks";
import {
  activeThreadReadModelSlotCreated,
  activeThreadReadModelSlotRemoved,
  activeThreadReadModelTransitionApplied,
} from "@/features/activeThreadSession/activeThreadSessionReadModel";
import { CommittedTranscriptSurface } from "@/features/committedTranscriptSurface/CommittedTranscriptSurface";
import type { TurnPositionRequest } from "@/features/browserLaunch/useTurnPositionRequest";
import { attachBaseline } from "@/features/projection/__tests__/projectionFixtures";
import { DevOnly } from "../environment/DevOnly";
import type { TranscriptReplay } from "./messageReplay";

const identity = {
  threadId: attachBaseline.snapshot.thread.id,
  instanceId: "storybook-transcript-replay",
};

export function TranscriptReplayPreview({
  frames,
  initialStep = 0,
  turnPosition,
  onReset,
}: {
  frames: TranscriptReplay;
  initialStep?: number;
  turnPosition?: TurnPositionRequest | null;
  onReset?: () => void;
}) {
  const dispatch = useAppDispatch();
  const revision = useRef(0);
  const [step, setStep] = useState(initialStep);
  const [playing, setPlaying] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const lastStep = frames.length - 1;

  useEffect(() => {
    dispatch(activeThreadReadModelSlotCreated(identity));
    dispatch(
      activeThreadReadModelTransitionApplied({
        identity,
        sessionRevision: ++revision.current,
        facts: frames.slice(0, initialStep + 1).flat(),
      }),
    );
    return () => {
      dispatch(activeThreadReadModelSlotRemoved(identity));
    };
  }, [dispatch, frames, initialStep]);

  useEffect(() => {
    if (!playing || step >= lastStep) return;
    const timer = window.setTimeout(() => {
      const next = step + 1;
      dispatch(
        activeThreadReadModelTransitionApplied({
          identity,
          sessionRevision: ++revision.current,
          facts: frames[next] ?? [],
        }),
      );
      setStep(next);
      if (next === lastStep) setPlaying(false);
    }, 1200);
    return () => {
      window.clearTimeout(timer);
    };
  }, [dispatch, frames, lastStep, playing, step]);

  return (
    <main
      className="app-shell-content-boundary grid gap-4 py-4"
      data-app-shell-content-layout="reading"
    >
      <DevOnly>
        <p className="text-sm text-muted">
          <Trans>Local transcript replay. No model, tool or upload requests are made.</Trans>
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            isDisabled={step === lastStep}
            onPress={() => {
              setPlaying(!playing);
            }}
          >
            {playing ? (
              <Trans comment="Pauses the Storybook transcript timeline">Pause replay</Trans>
            ) : (
              <Trans comment="Plays the Storybook transcript timeline">Play replay</Trans>
            )}
          </Button>
          <Button
            variant="secondary"
            isDisabled={step === lastStep}
            onPress={() => {
              setPlaying(false);
              const next = step + 1;
              dispatch(
                activeThreadReadModelTransitionApplied({
                  identity,
                  sessionRevision: ++revision.current,
                  facts: frames[next] ?? [],
                }),
              );
              setStep(next);
            }}
          >
            <Trans comment="Advances one fixed frame in the Storybook transcript timeline">
              Next step
            </Trans>
          </Button>
          <Button
            variant="tertiary"
            onPress={() => {
              setPlaying(false);
              onReset?.();
              dispatch(activeThreadReadModelSlotRemoved(identity));
              dispatch(activeThreadReadModelSlotCreated(identity));
              dispatch(
                activeThreadReadModelTransitionApplied({
                  identity,
                  sessionRevision: ++revision.current,
                  facts: frames[0] ?? [],
                }),
              );
              setStep(0);
              setResetKey(resetKey + 1);
            }}
          >
            <Trans comment="Returns the Storybook transcript timeline to its first frame">
              Reset replay
            </Trans>
          </Button>
        </div>
        <p role="status">
          <Trans comment="Current frame number and last frame number in the Storybook timeline">
            Step {step} / {lastStep}
          </Trans>
        </p>
      </DevOnly>
      <CommittedTranscriptSurface key={resetKey} identity={identity} turnPosition={turnPosition} />
    </main>
  );
}
