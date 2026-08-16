import type { PropsWithChildren } from "react";
import type { TranscriptState } from "@/features/transcriptState/transcriptStateSlice";
import { TranscriptReadContext } from "./TranscriptReadContext";

export const TranscriptReadProvider = ({
  children,
  transcriptState,
}: PropsWithChildren<{ transcriptState: TranscriptState | null }>) => {
  return <TranscriptReadContext value={transcriptState}>{children}</TranscriptReadContext>;
};
