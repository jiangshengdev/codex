import { useEffect } from "react";
import type { createActiveThreadSessionProbe } from "./activeThreadSessionProbe";
import {
  useActiveThreadSession,
  useActiveThreadSessionSnapshot,
} from "@/features/appShell/AppCapabilities";

export function ThreadSwitchCapabilityProbe({
  probe,
  candidateThreadId,
}: {
  probe: ReturnType<typeof createActiveThreadSessionProbe>;
  candidateThreadId: string;
}) {
  const session = useActiveThreadSession();
  const snapshot = useActiveThreadSessionSnapshot();
  const available = snapshot.phase === "active" || snapshot.phase === "projectionUnavailable";
  useEffect(() => {
    probe.capture(session);
  }, [probe, session]);

  return (
    <section aria-label="Thread switch capability probe">
      <button
        disabled={session == null || !available}
        onClick={() => {
          void session?.activate(candidateThreadId);
        }}
        type="button"
      >
        Continue candidate thread
      </button>
      <output aria-label="Active thread session">{available ? snapshot.threadId : "none"}</output>
      <output aria-label="Active skill catalog status">
        {available ? snapshot.skills.type : "none"}
      </output>
      <output aria-label="Active skill catalog">
        {available
          ? snapshot.skills.candidates.map(({ name }) => name).join(",") || "none"
          : "none"}
      </output>
    </section>
  );
}
