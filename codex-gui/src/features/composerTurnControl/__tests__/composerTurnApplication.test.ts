import { describe, expect, it, vi } from "vitest";
import type { ComposerEditorController } from "@/features/composerEditor/ComposerEditor";
import type { ComposerDraftCapture } from "@/features/composerEditor/composerDraft";
import type { ComposerInputQueueCoordinatorSnapshot } from "@/features/composerInputQueue/composerInputQueueCoordinator";
import type { SkillCatalogState } from "@/features/skillCatalog/skillCatalogOwner";
import {
  createComposerTurnApplication,
  type ComposerTurnSessionFacts,
} from "../composerTurnApplication";

type ComposerRole = ComposerTurnSessionFacts["composerRole"];
type SubmitController = Pick<ComposerEditorController, "capture" | "clearIfCurrent">;

const readySkills: SkillCatalogState = {
  type: "ready",
  candidates: [
    {
      name: "valid",
      description: "Valid skill",
      path: "/skills/valid/SKILL.md",
      scope: "repo",
    },
  ],
  partialErrorCount: 0,
};

const queueSnapshot = (
  patch: Partial<ComposerInputQueueCoordinatorSnapshot> = {},
): ComposerInputQueueCoordinatorSnapshot => ({
  ordinaryQueuedCount: 0,
  guidingCount: 0,
  detailRevision: 0,
  recoveryCount: 0,
  recovery: null,
  isRecovering: false,
  rejectedSteers: [],
  hasUnknownSteer: false,
  canStop: false,
  interrupt: null,
  pendingInputManagementOutcome: null,
  ...patch,
});

const createRole = (patch: Partial<ComposerRole> = {}): ComposerRole => ({
  interruptActiveTurn: vi.fn<ComposerRole["interruptActiveTurn"]>().mockReturnValue(true),
  promoteOrdinaryFrontToSteer: vi
    .fn<ComposerRole["promoteOrdinaryFrontToSteer"]>()
    .mockReturnValue(true),
  recover: vi.fn<ComposerRole["recover"]>().mockReturnValue(true),
  submit: vi.fn<ComposerRole["submit"]>().mockReturnValue({ type: "accepted" }),
  submitSteer: vi.fn<ComposerRole["submitSteer"]>().mockReturnValue({ type: "accepted" }),
  ...patch,
});

const sessionFacts = (patch: Partial<ComposerTurnSessionFacts> = {}): ComposerTurnSessionFacts => ({
  phase: "active",
  revision: 7,
  activeTurnId: null,
  composer: queueSnapshot(),
  composerRole: createRole(),
  skills: readySkills,
  ...patch,
});

const draftCapture = (
  textContent: string,
  selectedSkillPaths: readonly string[] = [],
): ComposerDraftCapture =>
  ({
    draft: {},
    input: [{ type: "text", text: textContent, text_elements: [] }],
    textContent,
    selectedSkillPaths,
  }) as unknown as ComposerDraftCapture;

const editorController = (capture: ComposerDraftCapture): SubmitController => ({
  capture: vi.fn<SubmitController["capture"]>(() => capture),
  clearIfCurrent: vi.fn<SubmitController["clearIfCurrent"]>(() => true),
});

describe("ComposerTurnApplication", () => {
  it("projects Send, Guide, Recover, and Stop from current authoritative facts", () => {
    const application = createComposerTurnApplication();
    const role = createRole();
    const session = sessionFacts({
      activeTurnId: "turn-active",
      composerRole: role,
      composer: queueSnapshot({ canStop: true }),
    });

    expect(
      application.project({
        session,
        editor: { textContent: "Guide this", selectedSkillPaths: [] },
      }),
    ).toEqual({
      operationsEnabled: true,
      isSubmitting: false,
      sendEnabled: true,
      guide: { visible: true, buttonEnabled: true, shortcutEnabled: true },
      recoverEnabled: false,
      stop: { enabled: true, failed: false, pending: false },
      invalidSelectedSkillPaths: new Set(),
    });

    const unavailable = sessionFacts({
      ...session,
      phase: "projectionUnavailable",
      composer: queueSnapshot({
        canStop: true,
        recoveryCount: 2,
        recovery: { reason: "startDefinitelyNotAccepted", count: 2 },
        interrupt: { phase: "definitelyNotAccepted" },
      }),
    });
    expect(
      application.project({
        session: unavailable,
        editor: {
          textContent: "Blocked",
          selectedSkillPaths: ["/skills/missing/SKILL.md"],
        },
      }),
    ).toEqual({
      operationsEnabled: false,
      isSubmitting: false,
      sendEnabled: false,
      guide: { visible: true, buttonEnabled: false, shortcutEnabled: false },
      recoverEnabled: false,
      stop: { enabled: false, failed: true, pending: false },
      invalidSelectedSkillPaths: new Set(["/skills/missing/SKILL.md"]),
    });
  });

  it("binds the exact controller and capture and clears only an accepted submission", () => {
    const application = createComposerTurnApplication();
    const role = createRole();
    const session = sessionFacts({ composerRole: role });
    const capture = draftCapture("Send exactly this");
    const controller = editorController(draftCapture("Do not capture this"));
    application.project({ session, editor: null });

    expect(application.submit({ session, controller, capture, intent: "ordinary" })).toEqual({
      type: "accepted",
    });
    expect(role.submit).toHaveBeenCalledExactlyOnceWith(session.revision, capture);
    expect(controller.capture).not.toHaveBeenCalled();
    expect(controller.clearIfCurrent).toHaveBeenCalledExactlyOnceWith(capture);
  });

  it.each([
    {
      caseName: "queue rejection",
      result: { type: "rejected", reason: "invalidInput" } as const,
    },
    {
      caseName: "stale revision",
      result: {
        type: "unavailable",
        scope: "activeThreadSession",
        reason: "staleRevision",
        revision: 8,
      } as const,
    },
    {
      caseName: "projection unavailable",
      result: {
        type: "unavailable",
        scope: "activeThreadSession",
        reason: "projectionUnavailable",
        revision: 8,
      } as const,
    },
  ])("silently ignores $caseName and preserves the capture", ({ result }) => {
    const application = createComposerTurnApplication();
    const role = createRole({ submit: vi.fn<ComposerRole["submit"]>().mockReturnValue(result) });
    const session = sessionFacts({ composerRole: role });
    const capture = draftCapture("Keep this draft");
    const controller = editorController(capture);
    application.project({ session, editor: null });

    expect(application.submit({ session, controller, capture, intent: "ordinary" })).toEqual({
      type: "ignored",
    });
    expect(controller.clearIfCurrent).not.toHaveBeenCalled();
  });

  it("routes non-empty Guide through steer and empty Guide through promotion", () => {
    const microtasks: (() => void)[] = [];
    const application = createComposerTurnApplication({
      scheduleMicrotask: (callback) => microtasks.push(callback),
    });
    const role = createRole();
    const session = sessionFacts({
      activeTurnId: "turn-active",
      composerRole: role,
      composer: queueSnapshot({ ordinaryQueuedCount: 1 }),
    });
    const guidedCapture = draftCapture("Guide this turn");
    application.project({ session, editor: null });

    expect(
      application.submit({
        session,
        controller: editorController(guidedCapture),
        capture: guidedCapture,
        intent: "guide",
      }),
    ).toEqual({ type: "accepted" });
    expect(role.submitSteer).toHaveBeenCalledExactlyOnceWith(session.revision, guidedCapture);
    expect(role.promoteOrdinaryFrontToSteer).not.toHaveBeenCalled();
    microtasks.shift()?.();

    const emptyCapture = draftCapture("   ");
    const emptyController = editorController(emptyCapture);
    expect(
      application.submit({
        session,
        controller: emptyController,
        capture: emptyCapture,
        intent: "guide",
      }),
    ).toEqual({ type: "accepted" });
    expect(role.promoteOrdinaryFrontToSteer).toHaveBeenCalledExactlyOnceWith(session.revision);
    expect(role.submitSteer).toHaveBeenCalledTimes(1);
    expect(emptyController.clearIfCurrent).not.toHaveBeenCalled();
  });

  it("dispatches Recover and Stop only while their current projections allow them", () => {
    const application = createComposerTurnApplication();
    const role = createRole();
    const recoverable = sessionFacts({
      composerRole: role,
      composer: queueSnapshot({
        recoveryCount: 2,
        recovery: { reason: "startDefinitelyNotAccepted", count: 2 },
      }),
    });
    application.project({ session: recoverable, editor: null });
    expect(application.recover({ session: recoverable })).toEqual({ type: "accepted" });
    expect(role.recover).toHaveBeenCalledExactlyOnceWith(recoverable.revision);

    const stoppable = sessionFacts({
      ...recoverable,
      revision: recoverable.revision + 1,
      composer: queueSnapshot({ canStop: true }),
    });
    application.project({ session: stoppable, editor: null });
    expect(application.stop({ session: stoppable })).toEqual({ type: "accepted" });
    expect(role.interruptActiveTurn).toHaveBeenCalledExactlyOnceWith(stoppable.revision);

    const stale = { ...stoppable, revision: stoppable.revision - 1 };
    expect(application.stop({ session: stale })).toEqual({ type: "ignored" });
    expect(role.interruptActiveTurn).toHaveBeenCalledTimes(1);
  });

  it("sets the latch before dispatch so synchronous reentry is ignored", () => {
    const microtasks: (() => void)[] = [];
    const application = createComposerTurnApplication({
      scheduleMicrotask: (callback) => microtasks.push(callback),
    });
    const capture = draftCapture("One command");
    const controller = editorController(capture);
    let reentryResult: ReturnType<typeof application.submit> | null = null;
    const submit = vi.fn<ComposerRole["submit"]>(() => {
      reentryResult = application.submit({ session, controller, capture, intent: "ordinary" });
      return { type: "accepted" };
    });
    const session = sessionFacts({ composerRole: createRole({ submit }) });
    application.project({ session, editor: null });

    expect(application.submit({ session, controller, capture, intent: "ordinary" })).toEqual({
      type: "accepted",
    });
    expect(reentryResult).toEqual({ type: "ignored" });
    expect(submit).toHaveBeenCalledOnce();
    expect(controller.clearIfCurrent).toHaveBeenCalledOnce();
  });

  it("keeps a new owner generation locked when an old microtask arrives", () => {
    const microtasks: (() => void)[] = [];
    const application = createComposerTurnApplication({
      scheduleMicrotask: (callback) => microtasks.push(callback),
    });
    const first = sessionFacts({ composerRole: createRole(), revision: 1 });
    const second = sessionFacts({ composerRole: createRole(), revision: 2 });
    const firstCapture = draftCapture("First owner");
    const secondCapture = draftCapture("Second owner");
    application.project({ session: first, editor: null });
    application.submit({
      session: first,
      controller: editorController(firstCapture),
      capture: firstCapture,
      intent: "ordinary",
    });

    application.project({ session: second, editor: null });
    application.submit({
      session: second,
      controller: editorController(secondCapture),
      capture: secondCapture,
      intent: "ordinary",
    });
    microtasks[0]?.();
    expect(
      application.project({
        session: second,
        editor: { textContent: "Another", selectedSkillPaths: [] },
      }).isSubmitting,
    ).toBe(true);

    microtasks[1]?.();
    expect(
      application.project({
        session: second,
        editor: { textContent: "Another", selectedSkillPaths: [] },
      }).isSubmitting,
    ).toBe(false);
  });

  it("invalidates queued callbacks and rejects commands after teardown", () => {
    const microtasks: (() => void)[] = [];
    const application = createComposerTurnApplication({
      scheduleMicrotask: (callback) => microtasks.push(callback),
    });
    const listener = vi.fn<Parameters<typeof application.subscribe>[0]>();
    application.subscribe(listener);
    const role = createRole();
    const session = sessionFacts({ composerRole: role });
    const capture = draftCapture("Before teardown");
    application.project({ session, editor: null });
    application.submit({
      session,
      controller: editorController(capture),
      capture,
      intent: "ordinary",
    });
    expect(listener).toHaveBeenCalledOnce();

    application.dispose();
    microtasks[0]?.();
    expect(listener).toHaveBeenCalledOnce();
    expect(
      application.submit({
        session,
        controller: editorController(capture),
        capture,
        intent: "ordinary",
      }),
    ).toEqual({ type: "ignored" });
    expect(role.submit).toHaveBeenCalledOnce();
  });
});
