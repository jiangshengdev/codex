import { aggregateErrorText } from "@/text/aggregateErrorText";
import type {
  ActiveThreadActivationFailure,
  ActiveThreadActivationOutcome,
  ActiveThreadSessionSnapshot,
} from "./activeThreadSessionCollectionContracts";

/** Converts a typed activation result at its consumer boundary, retaining the original cause. */
export function activationOutcomeError(
  outcome: ActiveThreadActivationOutcome,
  expectedThreadId: string,
): Error {
  switch (outcome.type) {
    case "unavailable":
      return new Error(activationFailureText(outcome.failure), { cause: outcome });
    case "empty":
      return new Error(`Activation returned no task. Expected threadId: ${expectedThreadId}`, {
        cause: outcome,
      });
    case "ready":
      return new Error(
        `Activation returned a different task. Expected threadId: ${expectedThreadId}; actual threadId: ${outcome.threadId}`,
        { cause: outcome },
      );
  }
  return outcome satisfies never;
}

function activationFailureText(failure: ActiveThreadActivationFailure): string {
  switch (failure.type) {
    case "operationFailed":
      return [
        `Activation failed (${failure.phase}): ${aggregateErrorText(failure.error)}`,
        ...(failure.cleanupError == null
          ? []
          : [`Cleanup: ${aggregateErrorText(failure.cleanupError)}`]),
      ].join("\n");
    case "connectionLost":
      return [
        `Activation connection lost (${failure.progress}); threadId: ${String(failure.threadId)}`,
        ...(failure.cleanupError == null
          ? []
          : [`Cleanup: ${aggregateErrorText(failure.cleanupError)}`]),
      ].join("\n");
    case "collectionFailed":
      return `Activation blocked by task collection failure (${failure.operation}); threadId: ${String(failure.threadId)}`;
    case "switchInProgress":
      return "Activation blocked: another task switch is in progress.";
    case "currentThreadChanged":
      return `Activation interrupted: current task changed; threadId: ${String(failure.activeThreadId)}; expectedRevision: ${String(failure.expectedRevision)}; actualRevision: ${String(failure.actualRevision)}`;
    case "currentThreadUnresolved":
      return `Activation blocked: current task has unresolved work; threadId: ${failure.activeThreadId}; blockers: ${JSON.stringify(failure.blockers)}`;
  }
  return failure satisfies never;
}

export function activationSnapshotError(
  snapshot: ActiveThreadSessionSnapshot,
  expectedThreadId: string,
): Error {
  const threadId = "threadId" in snapshot ? snapshot.threadId : null;
  return new Error(
    [
      `Activated task is not ready for input. Expected threadId: ${expectedThreadId}; actual threadId: ${String(threadId)}; phase: ${snapshot.phase}`,
      ...("error" in snapshot && snapshot.error != null
        ? [aggregateErrorText(snapshot.error)]
        : []),
    ].join("\n"),
    { cause: snapshot },
  );
}
