import { createContext, use } from "react";
import type { EqualityFn } from "react-redux";
import { useAppSelector } from "@/app/hooks";
import type { TranscriptState } from "@/features/transcriptState/transcriptStateSlice";

export type TranscriptStateSelector<Selected> = (state: TranscriptState) => Selected;

export const TranscriptReadContext = createContext<TranscriptState | null>(null);

export const useTranscriptSelector = <Selected>(
  selector: TranscriptStateSelector<Selected>,
  equalityFn?: EqualityFn<Selected>,
): Selected => {
  const fixedState = use(TranscriptReadContext);
  return useAppSelector((state) => selector(fixedState ?? state.transcriptState), equalityFn);
};
