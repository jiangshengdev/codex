import { expect } from "vitest";
import type { ActiveThreadSession } from "@/features/activeThreadSession/activeThreadSession";

export function createActiveThreadSessionProbe() {
  let capturedSession: ActiveThreadSession | null = null;

  const read = () => capturedSession;
  const requireSession = (): ActiveThreadSession => {
    const session = read();
    if (session == null) {
      throw new Error("thread switch probe must expose an active session");
    }
    return session;
  };

  const waitAvailable = async () => {
    await expect
      .poll(() => {
        const snapshot = read()?.getSnapshot();
        return snapshot?.phase === "active" || snapshot?.phase === "projectionUnavailable";
      })
      .toBe(true);
    const session = requireSession();
    const snapshot = session.getSnapshot();
    if (snapshot.phase !== "active" && snapshot.phase !== "projectionUnavailable") {
      throw new Error("thread switch probe session must be available");
    }
    return { session, snapshot };
  };

  return {
    capture(session: ActiveThreadSession | null) {
      capturedSession = session;
    },
    read,
    requireSession,
    waitAvailable,
  };
}
