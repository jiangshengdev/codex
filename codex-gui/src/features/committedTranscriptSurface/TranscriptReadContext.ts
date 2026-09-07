import { createContext, use } from "react";
import type { EqualityFn } from "react-redux";
import { useAppSelector } from "@/app/hooks";
import type { ActiveThreadSessionIdentity } from "@/features/activeThreadSession/activeThreadSessionIdentity";
import { initialTranscriptState } from "@/features/transcriptState/transcriptStateModel";
import type { TranscriptState } from "@/features/transcriptState/transcriptStateSlice";

export type TranscriptStateSelector<Selected> = (state: TranscriptState) => Selected;

export type TranscriptReadTarget =
  | Readonly<{ kind: "live"; identity: ActiveThreadSessionIdentity }>
  | Readonly<{ kind: "fixed"; transcriptState: TranscriptState }>;

export const TranscriptReadContext = createContext<TranscriptReadTarget | null>(null);

export const useTranscriptSelector = <Selected>(
  selector: TranscriptStateSelector<Selected>,
  equalityFn?: EqualityFn<Selected>,
): Selected => {
  const target = use(TranscriptReadContext);
  if (target == null) {
    throw new Error("useTranscriptSelector requires a TranscriptReadProvider");
  }
  return useAppSelector((state) => {
    if (target.kind === "fixed") {
      return selector(target.transcriptState);
    }
    const slot = state.transcriptState.byThreadId[target.identity.threadId];
    const transcript =
      slot?.identity.instanceId === target.identity.instanceId
        ? slot.transcript
        : initialTranscriptState;
    return selector(transcript);
  }, equalityFn);
};
