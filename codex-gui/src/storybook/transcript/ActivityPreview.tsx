import { TranscriptReplayPreview } from "./TranscriptReplayPreview";
import { activityReplay } from "./activityReplay";

export function ActivityPreview({ initialStep = 0 }: { initialStep?: number }) {
  return <TranscriptReplayPreview frames={activityReplay} initialStep={initialStep} />;
}
