import { createAction } from "@reduxjs/toolkit";
import type { ActiveThreadProjectionReadModelFact } from "./activeThreadProjection";
import type { ThreadProjectionAttachResponse } from "@codex-protocol/v2";

export type ActiveThreadReadModelTransition = Readonly<{
  sessionRevision: number;
  facts: readonly ActiveThreadProjectionReadModelFact[];
}>;

export const activeThreadReadModelTransitionApplied =
  createAction<ActiveThreadReadModelTransition>(
    "activeThreadSession/readModelTransitionApplied",
  );

export function buildActiveThreadCandidateReadModelTransition(
  sessionRevision: number,
  response: ThreadProjectionAttachResponse,
): ActiveThreadReadModelTransition {
  return {
    sessionRevision,
    facts: [{ type: "baselineAttached", response }],
  };
}
