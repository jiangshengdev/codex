import { describe, expect, it } from "vitest";
import type { SkillCatalogState } from "@/features/skillCatalog/skillCatalogOwner";
import {
  canRecoverComposerQueue,
  canSend,
  composerGuideControlState,
  composerStopControlState,
  invalidSelectedSkillPaths,
} from "../composerTurnControlModel";

const skillCandidate = (path: string): SkillCatalogState["candidates"][number] => ({
  name: path,
  description: `${path} description`,
  path,
  scope: "repo",
});

describe("composerTurnControlModel", () => {
  it("derives send availability", () => {
    expect(
      canSend({
        operationsEnabled: true,
        draftText: "Hello",
        isSending: false,
        recoveryCount: 0,
        selectedSkillsValid: true,
      }),
    ).toBe(true);
    expect(
      canSend({
        operationsEnabled: true,
        draftText: "   ",
        isSending: false,
        recoveryCount: 0,
        selectedSkillsValid: true,
      }),
    ).toBe(false);
    expect(
      canSend({
        operationsEnabled: true,
        draftText: "Hello",
        isSending: false,
        recoveryCount: 0,
        selectedSkillsValid: true,
      }),
    ).toBe(true);
    expect(
      canSend({
        operationsEnabled: true,
        draftText: "Hello",
        isSending: true,
        recoveryCount: 0,
        selectedSkillsValid: true,
      }),
    ).toBe(false);
    expect(
      canSend({
        operationsEnabled: false,
        draftText: "Hello",
        isSending: false,
        recoveryCount: 0,
        selectedSkillsValid: true,
      }),
    ).toBe(false);
    expect(
      canSend({
        operationsEnabled: true,
        draftText: "Hello",
        isSending: false,
        recoveryCount: 2,
        selectedSkillsValid: true,
      }),
    ).toBe(false);
    expect(
      canSend({
        operationsEnabled: true,
        draftText: "Hello",
        isSending: false,
        recoveryCount: 0,
        selectedSkillsValid: false,
      }),
    ).toBe(false);
  });

  it.each([
    {
      caseName: "idle",
      input: {
        activeTurnId: null,
        operationsEnabled: true,
        draftText: "Guide this",
        isSending: false,
        recoveryCount: 0,
        selectedSkillsValid: true,
      },
      expected: { visible: false, buttonEnabled: false, shortcutEnabled: false },
    },
    {
      caseName: "active with an empty draft",
      input: {
        activeTurnId: "turn-active",
        operationsEnabled: true,
        draftText: "  ",
        isSending: false,
        recoveryCount: 0,
        selectedSkillsValid: true,
      },
      expected: { visible: true, buttonEnabled: false, shortcutEnabled: true },
    },
    {
      caseName: "active with a non-empty draft",
      input: {
        activeTurnId: "turn-active",
        operationsEnabled: true,
        draftText: "Guide this",
        isSending: false,
        recoveryCount: 0,
        selectedSkillsValid: true,
      },
      expected: { visible: true, buttonEnabled: true, shortcutEnabled: true },
    },
    ...[
      {
        blockedBy: "session phase",
        patch: { operationsEnabled: false },
        visible: true,
      },
      { blockedBy: "submission", patch: { isSending: true }, visible: true },
      { blockedBy: "recovery", patch: { recoveryCount: 1 }, visible: true },
      {
        blockedBy: "invalid skills",
        patch: { selectedSkillsValid: false },
        visible: true,
      },
    ].map(({ blockedBy, patch, visible }) => ({
      caseName: `active but blocked by ${blockedBy}`,
      input: {
        activeTurnId: "turn-active",
        operationsEnabled: true,
        draftText: "Guide this",
        isSending: false,
        recoveryCount: 0,
        selectedSkillsValid: true,
        ...patch,
      },
      expected: { visible, buttonEnabled: false, shortcutEnabled: false },
    })),
  ])("derives guide control state for $caseName", ({ input, expected }) => {
    expect(composerGuideControlState(input)).toEqual(expected);
  });

  it.each([
    {
      caseName: "available",
      input: {
        operationsEnabled: true,
        interruptPhase: null,
        queueCanStop: true,
      },
      expected: { enabled: true, failed: false, pending: false },
    },
    {
      caseName: "projection unavailable",
      input: {
        operationsEnabled: false,
        interruptPhase: null,
        queueCanStop: true,
      },
      expected: { enabled: false, failed: false, pending: false },
    },
    {
      caseName: "queue cannot stop",
      input: {
        operationsEnabled: true,
        interruptPhase: null,
        queueCanStop: false,
      },
      expected: { enabled: false, failed: false, pending: false },
    },
    {
      caseName: "issuing",
      input: {
        operationsEnabled: true,
        interruptPhase: "issuing",
        queueCanStop: false,
      },
      expected: { enabled: false, failed: false, pending: true },
    },
    {
      caseName: "accepted",
      input: {
        operationsEnabled: true,
        interruptPhase: "accepted",
        queueCanStop: false,
      },
      expected: { enabled: false, failed: false, pending: true },
    },
    {
      caseName: "delivery unknown",
      input: {
        operationsEnabled: true,
        interruptPhase: "unknown",
        queueCanStop: false,
      },
      expected: { enabled: false, failed: false, pending: true },
    },
    {
      caseName: "definitely not accepted",
      input: {
        operationsEnabled: true,
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
      caseName: "empty session",
      input: {
        operationsEnabled: false,
        recoveryCount: 2,
        isRecovering: false,
      },
      expected: false,
    },
    {
      caseName: "manual reconnect required",
      input: {
        operationsEnabled: false,
        recoveryCount: 2,
        isRecovering: false,
      },
      expected: false,
    },
    {
      caseName: "no recovery batch",
      input: {
        operationsEnabled: true,
        recoveryCount: 0,
        isRecovering: false,
      },
      expected: false,
    },
    {
      caseName: "recovery already running",
      input: {
        operationsEnabled: true,
        recoveryCount: 2,
        isRecovering: true,
      },
      expected: false,
    },
    {
      caseName: "disposed session",
      input: {
        operationsEnabled: false,
        recoveryCount: 2,
        isRecovering: false,
      },
      expected: false,
    },
    {
      caseName: "recovery available",
      input: {
        operationsEnabled: true,
        recoveryCount: 2,
        isRecovering: false,
      },
      expected: true,
    },
  ])("derives queue recovery availability for $caseName", ({ input, expected }) => {
    expect(canRecoverComposerQueue(input)).toBe(expected);
  });
});
