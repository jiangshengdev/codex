import { describe, expect, it } from "vitest";
import { activationOutcomeError, activationSnapshotError } from "../activationDiagnostic";
import type { ActiveThreadActivationFailure } from "../activeThreadSessionCollectionContracts";

describe("activation diagnostics", () => {
  it("retains the original outcome and displays operation and nested cleanup errors", () => {
    const outcome = {
      type: "unavailable",
      failure: {
        type: "operationFailed",
        phase: "attach",
        error: new Error("Attach failed"),
        cleanupError: new AggregateError(
          [new Error("Detach failed"), new Error("Dispose failed")],
          "Cleanup failed",
        ),
      },
    } as const;
    const error = activationOutcomeError(outcome, "expected");
    expect(error.message).toBe(
      "Activation failed (attach): Attach failed\nCleanup: Detach failed; Dispose failed",
    );
    expect(error.cause).toBe(outcome);
  });

  it.each([
    [{ type: "collectionFailed", operation: "membershipAdd", threadId: "task" }, "membershipAdd"],
    [{ type: "switchInProgress" }, "another task switch"],
    [
      {
        type: "currentThreadChanged",
        activeThreadId: "other",
        expectedRevision: 2,
        actualRevision: 3,
      },
      "actualRevision: 3",
    ],
    [
      {
        type: "currentThreadUnresolved",
        activeThreadId: "other",
        blockers: [{ type: "recoveryPending", count: 1 }],
      },
      "recoveryPending",
    ],
    [
      {
        type: "connectionLost",
        progress: "afterCommit",
        threadId: "task",
        cleanupError: new Error("Cleanup interrupted"),
      },
      "Cleanup interrupted",
    ],
  ] satisfies [ActiveThreadActivationFailure, string][])("describes %j", (failure, text) => {
    expect(activationOutcomeError({ type: "unavailable", failure }, "expected").message).toContain(
      text,
    );
  });

  it("describes empty results and wrong task identities", () => {
    expect(activationOutcomeError({ type: "empty" }, "expected").message).toContain("no task");
    expect(
      activationOutcomeError({ type: "ready", threadId: "other", warnings: [] }, "expected")
        .message,
    ).toContain("actual threadId: other");
    expect(activationSnapshotError({ phase: "empty", revision: 1 }, "expected").message).toContain(
      "phase: empty",
    );
  });
});
