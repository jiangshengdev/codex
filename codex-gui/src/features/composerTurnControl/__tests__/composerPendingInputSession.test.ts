import { describe, expect, test, vi } from "vitest";
import type { ActiveThreadComposerRole } from "@/features/activeThreadSession/activeThreadSession";
import type { ActiveThreadPendingInputEditReservation } from "@/features/activeThreadSession/activeThreadSessionContracts";
import type { ComposerDraftCapture } from "@/features/composerEditor/composerDraft";
import type {
  ComposerPendingInputDisplayKey,
  ComposerPendingInputLane,
  ComposerPendingInputPageItem,
  ComposerPendingInputPageRequest,
  ComposerPendingInputPageResult,
} from "@/features/composerInputQueue/composerInputQueueContracts";
import type { ComposerInputQueueCoordinatorSnapshot } from "@/features/composerInputQueue/composerInputQueueCoordinator";
import {
  createComposerPendingInputSession,
  type ComposerPendingInputCurrentFacts,
  type ComposerPendingInputSession,
} from "../composerPendingInputSession";

const item = (key: string, lane: ComposerPendingInputLane = "ordinary") =>
  ({
    key: key as ComposerPendingInputDisplayKey,
    lane,
    management: { type: "manageable" },
    movement: null,
    preview: { type: "text", text: key, truncated: false },
  }) satisfies ComposerPendingInputPageItem;

const queueSnapshot = (
  overrides: Partial<ComposerInputQueueCoordinatorSnapshot> = {},
): ComposerInputQueueCoordinatorSnapshot => ({
  ordinaryQueuedCount: 1,
  guidingCount: 0,
  detailRevision: 1,
  recoveryCount: 0,
  recovery: null,
  isRecovering: false,
  rejectedSteers: [],
  hasUnknownSteer: false,
  canStop: true,
  interrupt: null,
  pendingInputManagementOutcome: null,
  ...overrides,
});

type RoleHarness = Readonly<{
  role: ActiveThreadComposerRole;
  setItems(next: readonly ComposerPendingInputPageItem[]): void;
  setPageResult(
    next: ((request: ComposerPendingInputPageRequest) => ComposerPendingInputPageResult) | null,
  ): void;
  beginEdit: ReturnType<typeof vi.fn>;
  deleteItem: ReturnType<typeof vi.fn>;
  moveItem: ReturnType<typeof vi.fn>;
}>;

function createRoleHarness(
  initialItems: readonly ComposerPendingInputPageItem[] = [item("one")],
): RoleHarness {
  let items = initialItems;
  let pageResult:
    | ((request: ComposerPendingInputPageRequest) => ComposerPendingInputPageResult)
    | null = null;
  const readPendingInputPage = vi.fn<ActiveThreadComposerRole["readPendingInputPage"]>(
    (request: ComposerPendingInputPageRequest) =>
      pageResult == null
        ? {
            type: "page" as const,
            revision: request.revision,
            items: items.filter(({ lane }) => lane === request.lane),
            nextCursor: null,
          }
        : pageResult(request),
  );
  const beginEdit = vi.fn<ActiveThreadComposerRole["beginPendingInputEdit"]>(() => ({
    type: "notManageable" as const,
    scope: "liveOwner" as const,
    revision: 1,
  }));
  const deleteItem = vi.fn<ActiveThreadComposerRole["deletePendingInput"]>(() => ({
    type: "notManageable" as const,
    scope: "liveOwner" as const,
    revision: 1,
  }));
  const moveItem = vi.fn<ActiveThreadComposerRole["movePendingInput"]>(() => ({
    type: "noOp" as const,
    reason: "alreadyAtDestination" as const,
    revision: 1,
  }));
  const role = {
    readPendingInputPage,
    beginPendingInputEdit: beginEdit,
    deletePendingInput: deleteItem,
    movePendingInput: moveItem,
  } as unknown as ActiveThreadComposerRole;
  return {
    role,
    setItems(next) {
      items = next;
    },
    setPageResult(next) {
      pageResult = next;
    },
    beginEdit,
    deleteItem,
    moveItem,
  };
}

const facts = (
  role: ActiveThreadComposerRole,
  overrides: Partial<Omit<ComposerPendingInputCurrentFacts, "composerRole" | "snapshot">> &
    Readonly<{ snapshot?: ComposerInputQueueCoordinatorSnapshot }> = {},
): ComposerPendingInputCurrentFacts => ({
  composerRole: role,
  sessionRevision: overrides.sessionRevision ?? 1,
  mutationsEnabled: overrides.mutationsEnabled ?? true,
  snapshot: overrides.snapshot ?? queueSnapshot(),
});

function openSession(harness = createRoleHarness()): Readonly<{
  session: ComposerPendingInputSession;
  harness: RoleHarness;
  current: ComposerPendingInputCurrentFacts;
}> {
  const session = createComposerPendingInputSession();
  const current = facts(harness.role);
  expect(session.open(current)).toEqual({ type: "applied" });
  return { session, harness, current };
}

function beginActiveEdit(
  session: ComposerPendingInputSession,
  harness: RoleHarness,
  current: ComposerPendingInputCurrentFacts,
  reservation: ActiveThreadPendingInputEditReservation,
): number {
  harness.beginEdit.mockReturnValueOnce({ type: "begun", revision: 2, reservation });
  const begun = session.beginEdit(current, item("one"));
  if (begun.type !== "preparing") throw new Error("edit must enter preparation");
  expect(
    session.attachEditor({
      facts: current,
      preparationToken: begun.preparationToken,
      itemKey: "one",
      restore: () => ({ type: "restored" }),
      capture: () => ({}) as ComposerDraftCapture,
    }),
  ).toEqual({ type: "applied" });
  return begun.preparationToken;
}

describe("ComposerPendingInputSession", () => {
  test("keeps one session across revisions and synchronously closes only for owner replacement", () => {
    const { session, harness, current } = openSession();
    harness.setItems([item("two")]);
    const revised = facts(harness.role, { snapshot: queueSnapshot({ detailRevision: 2 }) });

    expect(session.project(revised)).toMatchObject({
      phase: "open",
      ownerGeneration: 1,
      view: { pages: { revision: 2 } },
    });

    const replacement = createRoleHarness([item("replacement")]);
    expect(session.project(facts(replacement.role))).toMatchObject({
      phase: "closing",
      ownerGeneration: 1,
      view: null,
    });
    expect(session.moveItem(current, item("one"), "later")).toEqual({ type: "ignored" });
  });

  test("keeps browsing projection unavailable as read-only but closes an edit without settling it", () => {
    const browsing = openSession();
    expect(
      browsing.session.project(
        facts(browsing.harness.role, { mutationsEnabled: false, snapshot: queueSnapshot() }),
      ),
    ).toMatchObject({ phase: "open", actionsEnabled: false, view: { pages: { revision: 1 } } });

    const editing = openSession();
    const reservation = {
      save: vi.fn<ActiveThreadPendingInputEditReservation["save"]>(() => ({
        type: "saved" as const,
        revision: 2,
      })),
      cancel: vi.fn<ActiveThreadPendingInputEditReservation["cancel"]>(() => ({
        type: "cancelled" as const,
        revision: 2,
      })),
    };
    beginActiveEdit(editing.session, editing.harness, editing.current, reservation);

    expect(
      editing.session.project(
        facts(editing.harness.role, { mutationsEnabled: false, snapshot: queueSnapshot() }),
      ),
    ).toMatchObject({ phase: "closing", view: null });
    expect(reservation.save).not.toHaveBeenCalled();
    expect(reservation.cancel).not.toHaveBeenCalled();
  });

  test("accepts only the current preparation token, owner generation, and item", () => {
    const { session, harness, current } = openSession();
    const first = session.beginEdit(current, item("one"));
    if (first.type !== "preparing") throw new Error("first edit must prepare");
    session.detachEditor(current, first.preparationToken);
    const second = session.beginEdit(current, item("one"));
    if (second.type !== "preparing") throw new Error("second edit must prepare");
    const attachment = {
      facts: current,
      itemKey: "one",
      restore: () => ({ type: "restored" as const }),
      capture: () => ({}) as ComposerDraftCapture,
    };

    expect(
      session.attachEditor({ ...attachment, preparationToken: first.preparationToken }),
    ).toEqual({ type: "ignored" });
    expect(harness.beginEdit).not.toHaveBeenCalled();
    expect(
      session.attachEditor({
        ...attachment,
        itemKey: "other",
        preparationToken: second.preparationToken,
      }),
    ).toEqual({ type: "ignored" });
    expect(harness.beginEdit).not.toHaveBeenCalled();
  });

  test("holds an empty drawer through synchronous delete publication and command settlement", () => {
    const { session, harness, current } = openSession();
    const emptyFacts = facts(harness.role, {
      snapshot: queueSnapshot({ ordinaryQueuedCount: 0, detailRevision: 2 }),
    });
    harness.deleteItem.mockImplementationOnce(() => {
      harness.setItems([]);
      expect(session.project(emptyFacts).phase).toBe("open");
      return { type: "deleted", revision: 2 };
    });

    expect(session.deleteItem(current, item("one"))).toEqual({ type: "applied" });
    expect(session.project(emptyFacts)).toMatchObject({
      phase: "open",
      view: { pages: { revision: 2, ordinary: { items: [] }, steer: { items: [] } } },
    });
  });

  test("matches management outcomes by object identity and item key", () => {
    const initialOutcome = {
      type: "unavailable" as const,
      scope: "liveOwner" as const,
      reason: "targetInvalidated" as const,
      revision: 1,
      key: "one" as ComposerPendingInputDisplayKey,
      lane: "steer" as const,
      targetReason: "terminal" as const,
    };
    const harness = createRoleHarness();
    const current = facts(harness.role, {
      snapshot: queueSnapshot({ pendingInputManagementOutcome: initialOutcome }),
    });
    const session = createComposerPendingInputSession();
    session.open(current);
    session.beginEdit(current, item("one"));

    expect(session.project(current).alert).toBeNull();
    const distinctOutcome = { ...initialOutcome };
    expect(
      session.project(
        facts(harness.role, {
          snapshot: queueSnapshot({ pendingInputManagementOutcome: distinctOutcome }),
        }),
      ),
    ).toMatchObject({ phase: "open", alert: "targetInvalidated", view: { edit: null } });
  });

  test("rejects stale editor callbacks after a new owner generation", () => {
    const first = openSession();
    const preparation = first.session.beginEdit(first.current, item("one"));
    if (preparation.type !== "preparing") throw new Error("edit must prepare");
    const replacement = createRoleHarness();
    first.session.project(facts(replacement.role));
    first.session.drawerPresenceEnded(preparation.ownerGeneration);
    const replacementFacts = facts(replacement.role);
    first.session.open(replacementFacts);

    expect(
      first.session.attachEditor({
        facts: replacementFacts,
        preparationToken: preparation.preparationToken,
        itemKey: "one",
        restore: () => ({ type: "restored" }),
        capture: () => ({}) as ComposerDraftCapture,
      }),
    ).toEqual({ type: "ignored" });
    expect(replacement.beginEdit).not.toHaveBeenCalled();
  });

  test("cleans up only after presence ends and consumes generation-tagged effects once", () => {
    const { session, current } = openSession();
    session.requestClose(current);
    expect(session.getSnapshot()).toMatchObject({ phase: "closing", effects: [] });

    session.drawerPresenceEnded(1);
    const closed = session.getSnapshot();
    expect(closed).toMatchObject({
      phase: "closed",
      ownerGeneration: 1,
      effects: [{ ownerGeneration: 1, target: { type: "trigger" } }],
    });
    const effect = closed.effects[0];
    if (effect == null) throw new Error("presence completion must issue a focus effect");
    session.consumeEffect(effect.id);
    expect(session.getSnapshot().effects).toEqual([]);
    session.consumeEffect(effect.id);
    expect(session.getSnapshot().effects).toEqual([]);
  });

  test("does not save or cancel a reservation during teardown", () => {
    const { session, harness, current } = openSession();
    const reservation = {
      save: vi.fn<ActiveThreadPendingInputEditReservation["save"]>(() => ({
        type: "saved" as const,
        revision: 2,
      })),
      cancel: vi.fn<ActiveThreadPendingInputEditReservation["cancel"]>(() => ({
        type: "cancelled" as const,
        revision: 2,
      })),
    };
    beginActiveEdit(session, harness, current, reservation);

    session.dispose();
    expect(reservation.save).not.toHaveBeenCalled();
    expect(reservation.cancel).not.toHaveBeenCalled();
    expect(session.getSnapshot()).toMatchObject({ phase: "closed", effects: [] });
  });

  test("classifies invalid save and preserves the active edit", () => {
    const { session, harness, current } = openSession();
    const reservation = {
      save: vi.fn<ActiveThreadPendingInputEditReservation["save"]>(() => ({
        type: "invalidInput" as const,
        reason: "emptyInput" as const,
        revision: 1,
      })),
      cancel: vi.fn<ActiveThreadPendingInputEditReservation["cancel"]>(() => ({
        type: "cancelled" as const,
        revision: 2,
      })),
    };
    const token = beginActiveEdit(session, harness, current, reservation);

    expect(session.saveEdit(current, token)).toEqual({ type: "ignored" });
    expect(session.getSnapshot()).toMatchObject({
      phase: "open",
      alert: "empty",
      view: { edit: { phase: "active", preparationToken: token } },
    });
  });

  test("suppresses exhausted move refresh until a newer revision can be read", () => {
    const entries = [item("one"), item("two")];
    const firstEntry = entries[0];
    if (firstEntry == null) throw new Error("move test requires an initial entry");
    const { session, harness, current } = openSession(createRoleHarness(entries));
    harness.moveItem.mockReturnValueOnce({
      type: "moved",
      revision: 2,
      lane: "ordinary",
      position: 2,
      count: 2,
    });
    harness.setPageResult((request) => ({ type: "stale", revision: request.revision + 1 }));

    expect(session.moveItem(current, firstEntry, "later")).toEqual({ type: "applied" });
    expect(session.getSnapshot()).toMatchObject({
      phase: "open",
      alert: "moveRefreshFailed",
      view: { pages: null },
    });
    expect(
      session.project(
        facts(harness.role, {
          snapshot: queueSnapshot({ detailRevision: 5, ordinaryQueuedCount: 2 }),
        }),
      ),
    ).toMatchObject({ phase: "open", view: { pages: null } });

    harness.setPageResult(null);
    expect(
      session.project(
        facts(harness.role, {
          snapshot: queueSnapshot({ detailRevision: 6, ordinaryQueuedCount: 2 }),
        }),
      ),
    ).toMatchObject({ phase: "open", view: { pages: { revision: 6 } } });
  });
});
