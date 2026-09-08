import { createAction } from "@reduxjs/toolkit";
import type { ActiveThreadProjectionReadModelFact } from "./activeThreadProjectionFacts";
import type { ThreadProjectionAttachResponse } from "@codex-protocol/v2";
import type { ActiveThreadSessionIdentity } from "./activeThreadSessionIdentity";

export type ActiveThreadReadModelTransition = Readonly<{
  identity: ActiveThreadSessionIdentity;
  /** Strictly increasing within this instance, including transitions without facts. */
  sessionRevision: number;
  facts: readonly ActiveThreadProjectionReadModelFact[];
}>;

/**
 * The member lifecycle owner creates an empty slot before publishing its first transition.
 * Creation only applies to an absent thread slot; replacing an owner requires removal
 * of the previous identity first. Repeated creation must not reset an existing slot.
 */
export const activeThreadReadModelSlotCreated = createAction<ActiveThreadSessionIdentity>(
  "activeThreadSession/readModelSlotCreated",
);

/** Removal only applies when both threadId and instanceId match the current slot. */
export const activeThreadReadModelSlotRemoved = createAction<ActiveThreadSessionIdentity>(
  "activeThreadSession/readModelSlotRemoved",
);

/** Transitions only update an existing matching slot; they never create or replace one. */
export const activeThreadReadModelTransitionApplied = createAction<ActiveThreadReadModelTransition>(
  "activeThreadSession/readModelTransitionApplied",
);

export function buildActiveThreadCandidateReadModelTransition(
  identity: ActiveThreadSessionIdentity,
  sessionRevision: number,
  response: ThreadProjectionAttachResponse,
): ActiveThreadReadModelTransition {
  return {
    identity,
    sessionRevision,
    facts: [{ type: "baselineAttached", response }],
  };
}
