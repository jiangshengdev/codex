import type { PropsWithChildren } from "react";
import { TranscriptReadContext, type TranscriptReadTarget } from "./TranscriptReadContext";

export const TranscriptReadProvider = ({
  children,
  target,
}: PropsWithChildren<{ target: TranscriptReadTarget }>) => {
  return <TranscriptReadContext value={target}>{children}</TranscriptReadContext>;
};
