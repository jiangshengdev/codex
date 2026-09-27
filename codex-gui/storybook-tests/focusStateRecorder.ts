import type { Page, TestInfo } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { observeCurrentFocus, observeKeyboardFocus } from "./focusObservation";

type ReviewStatus = "observed-awaiting-visual-review" | "observed-awaiting-visual-and-state-review";

export type FocusStateObservation<Status extends ReviewStatus = ReviewStatus> = {
  state: string;
  trigger: string;
  observations: number;
  status: Status | "no-product-focus-observed" | "blocked";
  reason?: string;
};

// Prefixes are artifact identities owned by each collector, not inferred from state names.
// The combined case retains App shell's existing single-row count and file names.
type CapturePrefixes =
  | { current: string; traversal?: string }
  | { current?: never; traversal: string };

type FocusStateRecorder = {
  phase(state: string): void;
  record(state: string, trigger: string, prefixes: CapturePrefixes): Promise<void>;
};

/** One owner for diagnostic state capture, incremental persistence, and error precedence. */
export async function recordFocusStates<Status extends ReviewStatus>(
  page: Page,
  testInfo: TestInfo,
  options: {
    artifactName: string;
    initialPhase: string;
    failureTrigger: string;
    observedStatus: Status;
    persistEvidence?: () => Promise<void>;
  },
  visit: (recorder: FocusStateRecorder) => Promise<void>,
): Promise<FocusStateObservation<Status>[]> {
  const results: FocusStateObservation<Status>[] = [];
  const artifact = testInfo.outputPath(`${options.artifactName}.json`);
  const persist = async () => {
    // Attempt both artifacts even if one writer fails; preserve the first error.
    const writes = await Promise.allSettled([
      writeFile(artifact, JSON.stringify(results, null, 2)),
      options.persistEvidence?.(),
    ]);
    for (const write of writes) {
      if (write.status === "rejected") throw write.reason;
    }
  };
  let phase = options.initialPhase;
  let failed = false;
  let artifactFailure: { error: unknown } | undefined;
  const recorder: FocusStateRecorder = {
    phase(state) {
      phase = state;
    },
    async record(state, trigger, prefixes) {
      phase = state;
      const row: FocusStateObservation<Status> = {
        state,
        trigger,
        observations: 0,
        status: "no-product-focus-observed",
      };
      // Add only after an observer completes. A failed observer still preserves
      // its partial focus JSON using focusObservation's existing finally protocol.
      let appended = false;
      const retain = async (count: number) => {
        row.observations += count;
        row.status = row.observations > 0 ? options.observedStatus : "no-product-focus-observed";
        if (!appended) {
          results.push(row);
          appended = true;
        }
        await persist();
      };
      if (prefixes.current != null) {
        const current = await observeCurrentFocus(page, testInfo, prefixes.current);
        await retain(current.length);
      }
      // Persist the exact natural landing above before Tab changes the surface.
      // A traversal failure leaves that completed landing row plus a blocked phase.
      if (prefixes.traversal != null) {
        const traversal = await observeKeyboardFocus(page, testInfo, prefixes.traversal);
        await retain(traversal.length);
      }
    },
  };
  try {
    await visit(recorder);
  } catch (error) {
    failed = true;
    results.push({
      state: phase,
      trigger: options.failureTrigger,
      observations: 0,
      status: "blocked",
      reason: String(error),
    });
    throw error;
  } finally {
    try {
      await persist();
      await testInfo.attach(options.artifactName, {
        path: artifact,
        contentType: "application/json",
      });
    } catch (error) {
      artifactFailure = { error };
      if (failed)
        testInfo.annotations.push({ type: "focus-artifact-error", description: String(error) });
    }
  }
  if (artifactFailure != null) throw artifactFailure.error;
  return results;
}
