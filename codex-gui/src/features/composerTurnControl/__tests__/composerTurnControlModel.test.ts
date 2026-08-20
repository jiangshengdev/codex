import { describe, expect, it } from "vitest";
import type { GuiHostStatus } from "@/features/guiHost/guiHostClient";
import type { SkillCatalogState } from "@/features/skillCatalog/skillCatalogOwner";
import {
  canRecoverComposerQueue,
  canSend,
  composerStopControlState,
  invalidSelectedSkillPaths,
  isConnectionUsable,
} from "../composerTurnControlModel";

const initializedStatus: GuiHostStatus = {
  label: "initialized",
};

const skillCandidate = (path: string): SkillCatalogState["candidates"][number] => ({
  name: path,
  description: `${path} description`,
  path,
  scope: "repo",
});

describe("composerTurnControlModel", () => {
  it("requires attached identity, active subscription, thread id, and usable host status", () => {
    expect(
      isConnectionUsable({
        canAdvanceThreadIdentity: true,
        guiHostStatus: initializedStatus,
        threadId: "thread-1",
        subscriptionState: "active",
      }),
    ).toBe(true);

    expect(
      isConnectionUsable({
        canAdvanceThreadIdentity: false,
        guiHostStatus: initializedStatus,
        threadId: "thread-1",
        subscriptionState: "active",
      }),
    ).toBe(false);

    expect(
      isConnectionUsable({
        canAdvanceThreadIdentity: true,
        guiHostStatus: initializedStatus,
        threadId: null,
        subscriptionState: "active",
      }),
    ).toBe(false);

    expect(
      isConnectionUsable({
        canAdvanceThreadIdentity: true,
        guiHostStatus: initializedStatus,
        threadId: "thread-1",
        subscriptionState: "manualReconnectRequired",
      }),
    ).toBe(false);

    expect(
      isConnectionUsable({
        canAdvanceThreadIdentity: true,
        guiHostStatus: { label: "error", message: "boom" },
        threadId: "thread-1",
        subscriptionState: "active",
      }),
    ).toBe(false);
  });

  it("derives send availability", () => {
    expect(
      canSend({
        connectionUsable: true,
        controllerReady: true,
        draftText: "Hello",
        isSending: false,
        recoveryCount: 0,
        selectedSkillsValid: true,
      }),
    ).toBe(true);
    expect(
      canSend({
        connectionUsable: true,
        controllerReady: true,
        draftText: "   ",
        isSending: false,
        recoveryCount: 0,
        selectedSkillsValid: true,
      }),
    ).toBe(false);
    expect(
      canSend({
        connectionUsable: true,
        controllerReady: true,
        draftText: "Hello",
        isSending: false,
        recoveryCount: 0,
        selectedSkillsValid: true,
      }),
    ).toBe(true);
    expect(
      canSend({
        connectionUsable: true,
        controllerReady: true,
        draftText: "Hello",
        isSending: true,
        recoveryCount: 0,
        selectedSkillsValid: true,
      }),
    ).toBe(false);
    expect(
      canSend({
        connectionUsable: true,
        controllerReady: false,
        draftText: "Hello",
        isSending: false,
        recoveryCount: 0,
        selectedSkillsValid: true,
      }),
    ).toBe(false);
    expect(
      canSend({
        connectionUsable: true,
        controllerReady: true,
        draftText: "Hello",
        isSending: false,
        recoveryCount: 2,
        selectedSkillsValid: true,
      }),
    ).toBe(false);
    expect(
      canSend({
        connectionUsable: true,
        controllerReady: true,
        draftText: "Hello",
        isSending: false,
        recoveryCount: 0,
        selectedSkillsValid: false,
      }),
    ).toBe(false);
  });

  it.each([
    {
      caseName: "available",
      input: {
        connectionUsable: true,
        controllerMatchesCurrentThread: true,
        interruptPhase: null,
        queueCanStop: true,
      },
      expected: { enabled: true, failed: false, pending: false },
    },
    {
      caseName: "connection unavailable",
      input: {
        connectionUsable: false,
        controllerMatchesCurrentThread: true,
        interruptPhase: null,
        queueCanStop: true,
      },
      expected: { enabled: false, failed: false, pending: false },
    },
    {
      caseName: "controller identity mismatch",
      input: {
        connectionUsable: true,
        controllerMatchesCurrentThread: false,
        interruptPhase: "issuing",
        queueCanStop: false,
      },
      expected: { enabled: false, failed: false, pending: false },
    },
    {
      caseName: "queue cannot stop",
      input: {
        connectionUsable: true,
        controllerMatchesCurrentThread: true,
        interruptPhase: null,
        queueCanStop: false,
      },
      expected: { enabled: false, failed: false, pending: false },
    },
    {
      caseName: "issuing",
      input: {
        connectionUsable: true,
        controllerMatchesCurrentThread: true,
        interruptPhase: "issuing",
        queueCanStop: false,
      },
      expected: { enabled: false, failed: false, pending: true },
    },
    {
      caseName: "accepted",
      input: {
        connectionUsable: true,
        controllerMatchesCurrentThread: true,
        interruptPhase: "accepted",
        queueCanStop: false,
      },
      expected: { enabled: false, failed: false, pending: true },
    },
    {
      caseName: "delivery unknown",
      input: {
        connectionUsable: true,
        controllerMatchesCurrentThread: true,
        interruptPhase: "unknown",
        queueCanStop: false,
      },
      expected: { enabled: false, failed: false, pending: true },
    },
    {
      caseName: "definitely not accepted",
      input: {
        connectionUsable: true,
        controllerMatchesCurrentThread: true,
        interruptPhase: "definitelyNotAccepted",
        queueCanStop: true,
      },
      expected: { enabled: true, failed: true, pending: false },
    },
  ] as const)("derives stop control state for $caseName", ({ input, expected }) => {
    expect(composerStopControlState(input)).toEqual(expected);
  });

  it("derives invalid selected paths only from a complete ready catalog", () => {
    const existingPath = "/skills/existing/SKILL.md";
    const missingPath = "/skills/missing/SKILL.md";
    const selectedPaths = [existingPath, missingPath];
    const completeReady: SkillCatalogState = {
      type: "ready",
      candidates: [skillCandidate(existingPath)],
      partialErrorCount: 0,
    };

    expect([...invalidSelectedSkillPaths(completeReady, selectedPaths)]).toEqual([missingPath]);

    const inconclusiveStates: readonly SkillCatalogState[] = [
      {
        type: "ready",
        candidates: [skillCandidate(existingPath)],
        partialErrorCount: 1,
      },
      { type: "initialLoading", candidates: [], partialErrorCount: 0 },
      {
        type: "refreshing",
        candidates: [skillCandidate(existingPath)],
        partialErrorCount: 0,
      },
      { type: "stale", candidates: [skillCandidate(existingPath)], partialErrorCount: 0 },
      { type: "failed", candidates: [], partialErrorCount: 0 },
    ];

    expect(
      inconclusiveStates.map((state) => ({
        type: state.type,
        invalidPaths: [...invalidSelectedSkillPaths(state, selectedPaths)],
      })),
    ).toEqual([
      { type: "ready", invalidPaths: [] },
      { type: "initialLoading", invalidPaths: [] },
      { type: "refreshing", invalidPaths: [] },
      { type: "stale", invalidPaths: [] },
      { type: "failed", invalidPaths: [] },
    ]);

    const recoveredReady: SkillCatalogState = {
      type: "ready",
      candidates: [skillCandidate(existingPath), skillCandidate(missingPath)],
      partialErrorCount: 0,
    };
    expect([...invalidSelectedSkillPaths(recoveredReady, selectedPaths)]).toEqual([]);
  });

  it.each([
    {
      caseName: "commands unavailable",
      input: {
        connectionUsable: false,
        controllerReady: true,
        recoveryCount: 2,
        isRecovering: false,
      },
      expected: false,
    },
    {
      caseName: "manual reconnect required",
      input: {
        connectionUsable: false,
        controllerReady: true,
        recoveryCount: 2,
        isRecovering: false,
      },
      expected: false,
    },
    {
      caseName: "no recovery batch",
      input: {
        connectionUsable: true,
        controllerReady: true,
        recoveryCount: 0,
        isRecovering: false,
      },
      expected: false,
    },
    {
      caseName: "recovery already running",
      input: {
        connectionUsable: true,
        controllerReady: true,
        recoveryCount: 2,
        isRecovering: true,
      },
      expected: false,
    },
    {
      caseName: "controller unavailable",
      input: {
        connectionUsable: true,
        controllerReady: false,
        recoveryCount: 2,
        isRecovering: false,
      },
      expected: false,
    },
    {
      caseName: "recovery available",
      input: {
        connectionUsable: true,
        controllerReady: true,
        recoveryCount: 2,
        isRecovering: false,
      },
      expected: true,
    },
  ])("derives queue recovery availability for $caseName", ({ input, expected }) => {
    expect(canRecoverComposerQueue(input)).toBe(expected);
  });
});
