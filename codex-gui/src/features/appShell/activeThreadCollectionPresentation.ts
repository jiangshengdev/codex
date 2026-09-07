import type { ActiveThreadCollectionMember } from "@/features/activeThreadSession/activeThreadSessionCollectionContracts";

export function activeThreadMemberHasError(member: ActiveThreadCollectionMember): boolean {
  if (member.phase === "failed" || member.error != null || member.operationErrors.length > 0)
    return true;
  const snapshot = member.snapshot;
  if (snapshot?.phase === "failed" || snapshot?.phase === "projectionUnavailable") return true;
  if (snapshot?.phase !== "active") return false;
  return (
    snapshot.composer.persistence.error != null ||
    snapshot.composer.recoveryCount > 0 ||
    snapshot.composer.rejectedSteers.length > 0 ||
    snapshot.composer.persistence.unknownMessages.length > 0 ||
    snapshot.composer.hasUnknownSteer ||
    snapshot.threadStatus?.type === "systemError"
  );
}
