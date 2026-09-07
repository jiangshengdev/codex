import type { RootState } from "@/app/store";
import { selectTranscriptState } from "../transcriptStateSlice";

export function requiredTranscriptState(state: RootState, threadId: string) {
  const transcript = selectTranscriptState(state, threadId);
  if (transcript == null) {
    throw new Error(`Missing transcript slot for ${threadId}`);
  }
  return transcript;
}
