import { msg } from "@lingui/core/macro";
import type {
  ActiveThreadCollectionMember,
  ActiveThreadRemovalBlocker,
} from "@/features/activeThreadSession/activeThreadSessionCollectionContracts";

export function activeThreadMemberStatus(member: ActiveThreadCollectionMember) {
  switch (member.phase) {
    case "initializing":
      return msg`Loading task…`;
    case "failed":
      return msg`Unable to load task`;
    case "cleanupPending":
      return msg`Connection cleanup needs retry`;
    case "removalPending":
      return msg`Removing from active tasks…`;
    case "ready":
      break;
  }
  const snapshot = member.snapshot;
  if (snapshot?.phase !== "active" && snapshot?.phase !== "projectionUnavailable")
    return msg`Status unavailable`;
  if (snapshot.phase === "projectionUnavailable") return msg`Connection needs recovery`;
  if (snapshot.composer.persistence.error != null) return msg`Unable to save task state`;
  if (snapshot.composer.persistence.restoredPaused) return msg`Review required after reload`;
  if (
    snapshot.composer.recoveryCount > 0 ||
    snapshot.composer.persistence.unknownMessages.length > 0 ||
    snapshot.composer.hasUnknownSteer
  )
    return msg`Messages need review`;
  const status = snapshot.threadStatus;
  if (status == null) return msg`Status unavailable`;
  switch (status.type) {
    case "notLoaded":
      return msg`Task not loaded`;
    case "systemError":
      return msg`Task error`;
    case "idle":
      return msg({ message: "Idle", comment: "Backend task status: no turn is running" });
    case "active":
      if (status.activeFlags.includes("waitingOnApproval")) return msg`Waiting for approval`;
      if (status.activeFlags.includes("waitingOnUserInput")) return msg`Waiting for input`;
      return msg({ message: "Running", comment: "Backend task status: a turn is running" });
  }
}

export function activeThreadRemovalBlockerMessage(blocker: ActiveThreadRemovalBlocker) {
  const type = typeof blocker === "string" ? blocker : blocker.type;
  switch (type) {
    case "initializing":
      return msg`Wait for this task to finish loading before removing it.`;
    case "statusUnknown":
      return msg`Wait until the task's running state is available.`;
    case "activeTurn":
      return msg`This task is still running.`;
    case "compaction":
      return msg`Wait for context compaction to finish.`;
    case "projectionUnavailable":
      return msg`Recover this task's connection before removing it.`;
    case "changed":
      return msg`The task changed. Review its current state and try again.`;
    case "restoredPaused":
      return msg`Review and continue this task after reload before removing it.`;
    case "ordinaryQueued":
    case "steerQueued":
      return msg`This task still has queued messages.`;
    case "pendingStart":
    case "pendingSteers":
      return msg`Wait for pending message delivery to finish or review its outcome.`;
    case "rejectedSteers":
    case "recoveryPending":
      return msg`Review unresolved messages in this task before removing it.`;
    case "recovering":
      return msg`Wait for this task's recovery to finish.`;
    case "releaseReserved":
    case "managementPending":
      return msg`Wait for the current task operation to finish.`;
    case "interruptPending":
      return msg`Wait for the stop request to finish or review its outcome.`;
    case "persistenceFailed":
      return msg`Retry saving this task's state before removing it.`;
    case "disposed":
      return msg`This task is no longer connected.`;
  }
}
