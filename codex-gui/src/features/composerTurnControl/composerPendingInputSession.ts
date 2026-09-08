import type { ActiveThreadComposerRole } from "@/features/activeThreadSession/activeThreadSession";
import type { ActiveThreadPendingInputEditReservation } from "@/features/activeThreadSession/activeThreadSessionContracts";
import type { ComposerDraftCapture } from "@/features/composerEditor/composerEditorContracts";
import type {
  ComposerPendingInputDetailResult,
  ComposerPendingInputEditRestore,
  ComposerPendingInputLane,
  ComposerPendingInputMoveDestination,
  ComposerPendingInputPageItem,
} from "@/features/composerInputQueue/composerInputQueueContracts";
import type { ComposerInputQueueCoordinatorSnapshot } from "@/features/composerInputQueue/composerInputQueueCoordinator";
import { createListenerSet } from "@/subscriptions/listenerSet";
import {
  createComposerPendingInputLoadBudgets,
  readInitialComposerPendingInputPrefixes,
  refreshComposerPendingInputPrefixes,
  showMoreComposerPendingInputLane,
  type ComposerPendingInputLoadBudgets,
  type ComposerPendingInputPrefixes,
} from "./composerPendingInputPages";

export type ComposerPendingInputCurrentFacts = Readonly<{
  composerRole: ActiveThreadComposerRole;
  sessionRevision: number;
  mutationsEnabled: boolean;
  snapshot: ComposerInputQueueCoordinatorSnapshot;
}>;

export type ComposerPendingInputAlert =
  | "empty"
  | "invalidDraft"
  | "moveNotApplied"
  | "moveNotAppliedRefreshFailed"
  | "moveRefreshFailed"
  | "notManageable"
  | "sessionInvalidated"
  | "stale"
  | "targetInvalidated";

export type ComposerPendingInputAnnouncement = Readonly<{
  lane: ComposerPendingInputLane;
  position: number;
  count: number;
}>;

export type ComposerPendingInputEffectTarget =
  | Readonly<{ type: "composer" }>
  | Readonly<{ type: "trigger" }>
  | Readonly<{ type: "drawerHeading" }>
  | Readonly<{ type: "editor"; preparationToken: number }>
  | Readonly<{ type: "laneHeading"; lane: ComposerPendingInputLane }>
  | Readonly<{
      type: "item";
      key: string;
      fallbackLane: ComposerPendingInputLane;
    }>;

export type ComposerPendingInputSemanticEffect = Readonly<{
  id: number;
  ownerGeneration: number;
  target: ComposerPendingInputEffectTarget;
}>;

export type ComposerPendingInputEditView =
  | Readonly<{
      phase: "preparing";
      item: ComposerPendingInputPageItem;
      preparationToken: number;
    }>
  | Readonly<{
      phase: "active";
      item: ComposerPendingInputPageItem;
      preparationToken: number;
      valid: boolean;
    }>
  | Readonly<{
      phase: "retained";
      item: ComposerPendingInputPageItem;
      preparationToken: number;
      text: string;
    }>;

export type ComposerPendingInputView = Readonly<{
  pages: ComposerPendingInputPrefixes | null;
  guidingCount: number;
  ordinaryQueuedCount: number;
  edit: ComposerPendingInputEditView | null;
}>;

export type ComposerPendingInputSessionSnapshot = Readonly<{
  phase: "closed" | "open" | "closing";
  ownerGeneration: number;
  view: ComposerPendingInputView | null;
  actionsEnabled: boolean;
  alert: ComposerPendingInputAlert | null;
  announcement: ComposerPendingInputAnnouncement | null;
  effects: readonly ComposerPendingInputSemanticEffect[];
  confirmDiscard: boolean;
}>;

export type ComposerPendingInputCommandOutcome =
  | Readonly<{ type: "applied" }>
  | Readonly<{ type: "ignored" }>;

export type ComposerPendingInputBeginEditOutcome =
  | Readonly<{ type: "preparing"; preparationToken: number; ownerGeneration: number }>
  | Readonly<{ type: "ignored" }>;

export type ComposerPendingInputEditorAttachment = Readonly<{
  facts: ComposerPendingInputCurrentFacts;
  preparationToken: number;
  itemKey: string;
  restore: ComposerPendingInputEditRestore;
  capture: () => ComposerDraftCapture;
}>;

export type ComposerPendingInputSession = Readonly<{
  getSnapshot(): ComposerPendingInputSessionSnapshot;
  subscribe(listener: () => void): () => void;
  project(facts: ComposerPendingInputCurrentFacts): ComposerPendingInputSessionSnapshot;
  open(facts: ComposerPendingInputCurrentFacts): ComposerPendingInputCommandOutcome;
  requestClose(facts: ComposerPendingInputCurrentFacts): ComposerPendingInputCommandOutcome;
  disconnect(facts: ComposerPendingInputCurrentFacts): void;
  returnToEdit(facts: ComposerPendingInputCurrentFacts): void;
  discardEdit(facts: ComposerPendingInputCurrentFacts): void;
  beginEdit(
    facts: ComposerPendingInputCurrentFacts,
    item: ComposerPendingInputPageItem,
  ): ComposerPendingInputBeginEditOutcome;
  attachEditor(
    attachment: ComposerPendingInputEditorAttachment,
  ): ComposerPendingInputCommandOutcome;
  detachEditor(facts: ComposerPendingInputCurrentFacts, preparationToken: number): void;
  setEditorValidity(
    facts: ComposerPendingInputCurrentFacts,
    preparationToken: number,
    valid: boolean,
  ): void;
  saveEdit(
    facts: ComposerPendingInputCurrentFacts,
    preparationToken: number,
  ): ComposerPendingInputCommandOutcome;
  cancelEdit(
    facts: ComposerPendingInputCurrentFacts,
    preparationToken: number,
  ): ComposerPendingInputCommandOutcome;
  deleteItem(
    facts: ComposerPendingInputCurrentFacts,
    item: ComposerPendingInputPageItem,
  ): ComposerPendingInputCommandOutcome;
  moveItem(
    facts: ComposerPendingInputCurrentFacts,
    item: ComposerPendingInputPageItem,
    destination: ComposerPendingInputMoveDestination,
  ): ComposerPendingInputCommandOutcome;
  showMore(
    facts: ComposerPendingInputCurrentFacts,
    lane: ComposerPendingInputLane,
  ): ComposerPendingInputCommandOutcome;
  detailFailed(
    facts: ComposerPendingInputCurrentFacts,
    result: Exclude<ComposerPendingInputDetailResult, { type: "detail" }>,
  ): ComposerPendingInputCommandOutcome;
  drawerPresenceEnded(ownerGeneration: number): void;
  consumeEffect(effectId: number): void;
  dispose(): void;
}>;

type PendingInputPages = ComposerPendingInputPrefixes &
  Readonly<{ composerRole: ActiveThreadComposerRole }>;

type PreparingEdit = Readonly<{
  phase: "preparing";
  item: ComposerPendingInputPageItem;
  preparationToken: number;
  ownerGeneration: number;
  outcomeAtBegin: ComposerInputQueueCoordinatorSnapshot["pendingInputManagementOutcome"];
}>;

type ActiveEdit = Readonly<{
  phase: "active";
  item: ComposerPendingInputPageItem;
  preparationToken: number;
  ownerGeneration: number;
  outcomeAtBegin: ComposerInputQueueCoordinatorSnapshot["pendingInputManagementOutcome"];
  reservation: ActiveThreadPendingInputEditReservation;
  capture: () => ComposerDraftCapture;
  initialInput: string;
  valid: boolean;
}>;

type RetainedEdit = Readonly<{
  phase: "retained";
  item: ComposerPendingInputPageItem;
  preparationToken: number;
  capture: ComposerDraftCapture;
}>;

type EditSession = PreparingEdit | ActiveEdit | RetainedEdit;

type ExhaustedMoveRefresh = Readonly<{
  composerRole: ActiveThreadComposerRole;
  throughRevision: number;
}>;

const ignored = { type: "ignored" } as const;
const applied = { type: "applied" } as const;

class ComposerPendingInputSessionImpl implements ComposerPendingInputSession {
  private readonly listeners = createListenerSet();
  private phase: ComposerPendingInputSessionSnapshot["phase"] = "closed";
  private owner: ActiveThreadComposerRole | null = null;
  private ownerGeneration = 0;
  private pages: PendingInputPages | null = null;
  private edit: EditSession | null = null;
  private alert: ComposerPendingInputAlert | null = null;
  private announcement: ComposerPendingInputAnnouncement | null = null;
  private effects: ComposerPendingInputSemanticEffect[] = [];
  private completionHold = false;
  private exhaustedMoveRefresh: ExhaustedMoveRefresh | null = null;
  private handledOutcome: ComposerInputQueueCoordinatorSnapshot["pendingInputManagementOutcome"] =
    null;
  private focusAfterClose: "composer" | "trigger" | null = null;
  private managementDepth = 0;
  private nextPreparationToken = 0;
  private nextEffectId = 0;
  private disposed = false;
  private confirmDiscard = false;
  private discardClosesDrawer = false;
  private snapshot: ComposerPendingInputSessionSnapshot = this.createSnapshot(null);

  getSnapshot = (): ComposerPendingInputSessionSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    if (this.disposed) return () => undefined;
    return this.listeners.subscribe(listener);
  };

  project = (facts: ComposerPendingInputCurrentFacts): ComposerPendingInputSessionSnapshot => {
    if (!this.disposed) this.reconcile(facts);
    this.snapshot = this.createSnapshot(facts);
    return this.snapshot;
  };

  open = (facts: ComposerPendingInputCurrentFacts): ComposerPendingInputCommandOutcome => {
    if (this.disposed || this.phase !== "closed" || !hasPendingInputs(facts.snapshot))
      return ignored;
    const result = readInitialComposerPendingInputPrefixes(
      facts.composerRole,
      facts.snapshot.detailRevision,
    );
    if (result.type !== "ready") return ignored;

    this.ownerGeneration += 1;
    this.phase = "open";
    this.owner = facts.composerRole;
    this.pages = { composerRole: facts.composerRole, ...result.prefixes };
    this.edit = null;
    this.alert = null;
    this.announcement = null;
    this.effects = [];
    this.completionHold = false;
    this.exhaustedMoveRefresh = null;
    this.handledOutcome = null;
    this.focusAfterClose = null;
    this.confirmDiscard = false;
    this.publish(facts);
    return applied;
  };

  requestClose = (facts: ComposerPendingInputCurrentFacts): ComposerPendingInputCommandOutcome => {
    this.reconcile(facts);
    if (!this.accepts(facts)) return ignored;
    if (this.hasUnsavedChanges()) {
      this.confirmDiscard = true;
      this.discardClosesDrawer = true;
      this.publish(facts);
      return applied;
    }
    if (this.edit?.phase === "active") {
      const result = this.runManagement(() => this.editActive().reservation.cancel());
      const settled = this.settleEditResult(facts, result, true);
      this.publish(facts);
      return settled ? applied : ignored;
    }
    this.edit = null;
    this.beginClosing(hasPendingInputs(facts.snapshot) ? "trigger" : "composer");
    this.publish(facts);
    return applied;
  };

  disconnect = (facts: ComposerPendingInputCurrentFacts): void => {
    if (!this.accepts(facts)) return;
    if (!this.hasUnsavedChanges()) {
      const edit = this.edit;
      this.edit = null;
      if (edit?.phase === "active") this.runManagement(edit.reservation.cancel);
      this.pages = null;
      this.beginClosing(null);
      this.publish(facts);
      return;
    }
    this.retainEdit("sessionInvalidated", true);
    this.pages = null;
    if (this.edit?.phase === "retained") {
      this.confirmDiscard = true;
      this.discardClosesDrawer = true;
    } else this.beginClosing(null);
    this.publish(facts);
  };

  returnToEdit = (facts: ComposerPendingInputCurrentFacts): void => {
    if (!this.accepts(facts)) return;
    this.confirmDiscard = false;
    if (this.edit != null) {
      this.enqueueEffect({ type: "editor", preparationToken: this.edit.preparationToken });
    }
    this.publish(facts);
  };

  discardEdit = (facts: ComposerPendingInputCurrentFacts): void => {
    if (!this.accepts(facts)) return;
    const close = this.discardClosesDrawer || this.edit?.phase === "retained";
    this.confirmDiscard = false;
    if (this.edit?.phase === "active") {
      const active = this.edit;
      const result = this.runManagement(active.reservation.cancel);
      this.settleEditResult(facts, result, close);
    }
    this.edit = null;
    this.alert = null;
    if (close) this.beginClosing("composer");
    this.publish(facts);
  };

  beginEdit = (
    facts: ComposerPendingInputCurrentFacts,
    item: ComposerPendingInputPageItem,
  ): ComposerPendingInputBeginEditOutcome => {
    this.reconcile(facts);
    if (!this.accepts(facts) || !facts.mutationsEnabled || this.edit != null) return ignored;
    const preparationToken = ++this.nextPreparationToken;
    this.edit = {
      phase: "preparing",
      item,
      preparationToken,
      ownerGeneration: this.ownerGeneration,
      outcomeAtBegin: facts.snapshot.pendingInputManagementOutcome,
    };
    this.alert = null;
    this.announcement = null;
    this.publish(facts);
    return { type: "preparing", preparationToken, ownerGeneration: this.ownerGeneration };
  };

  attachEditor = (
    attachment: ComposerPendingInputEditorAttachment,
  ): ComposerPendingInputCommandOutcome => {
    const { facts } = attachment;
    const candidate = this.edit;
    if (
      !this.accepts(facts) ||
      candidate?.phase !== "preparing" ||
      candidate.preparationToken !== attachment.preparationToken ||
      candidate.ownerGeneration !== this.ownerGeneration ||
      candidate.item.key !== attachment.itemKey
    ) {
      return ignored;
    }
    this.reconcile(facts);
    const preparing = this.edit;
    if (
      !this.accepts(facts) ||
      !facts.mutationsEnabled ||
      preparing?.phase !== "preparing" ||
      preparing.preparationToken !== attachment.preparationToken ||
      preparing.ownerGeneration !== this.ownerGeneration ||
      preparing.item.key !== attachment.itemKey
    ) {
      return ignored;
    }

    const result = this.runManagement(() =>
      facts.composerRole.beginPendingInputEdit(
        facts.sessionRevision,
        {
          key: preparing.item.key,
          revision: this.pages?.revision ?? facts.snapshot.detailRevision,
        },
        attachment.restore,
      ),
    );
    if (result.type === "begun") {
      this.edit = {
        ...preparing,
        phase: "active",
        reservation: result.reservation,
        capture: attachment.capture,
        initialInput: JSON.stringify(attachment.capture().input),
        valid: true,
      };
      if (this.pages != null) this.pages = { ...this.pages, revision: result.revision };
      this.exhaustedMoveRefresh = null;
      this.enqueueEffect({ type: "editor", preparationToken: preparing.preparationToken });
      this.publish(facts);
      return applied;
    }
    if (result.type === "unavailable" && result.scope === "ownerGone") {
      this.closeInvalid();
      this.publish(facts);
      return ignored;
    }
    this.handleLiveFailure(
      result.type === "stale"
        ? "stale"
        : result.type === "notManageable"
          ? "notManageable"
          : result.type === "invalidDraft"
            ? "invalidDraft"
            : "sessionInvalidated",
      "revision" in result ? result.revision : facts.snapshot.detailRevision,
      facts,
    );
    this.publish(facts);
    return ignored;
  };

  detachEditor = (facts: ComposerPendingInputCurrentFacts, preparationToken: number): void => {
    if (!this.accepts(facts)) return;
    if (this.edit?.phase === "preparing" && this.edit.preparationToken === preparationToken) {
      this.edit = null;
      this.publish(facts);
    }
  };

  setEditorValidity = (
    facts: ComposerPendingInputCurrentFacts,
    preparationToken: number,
    valid: boolean,
  ): void => {
    if (!this.accepts(facts)) return;
    if (this.edit?.phase !== "active" || this.edit.preparationToken !== preparationToken) return;
    if (this.edit.valid === valid) return;
    this.edit = { ...this.edit, valid };
    this.publish(facts);
  };

  saveEdit = (
    facts: ComposerPendingInputCurrentFacts,
    preparationToken: number,
  ): ComposerPendingInputCommandOutcome => {
    this.reconcile(facts);
    if (
      !this.accepts(facts) ||
      !facts.mutationsEnabled ||
      this.edit?.phase !== "active" ||
      this.edit.preparationToken !== preparationToken
    ) {
      return ignored;
    }
    const active = this.edit;
    const result = this.runManagement(() => active.reservation.save(active.capture()));
    const settled = this.settleEditResult(facts, result, false);
    this.publish(facts);
    return settled ? applied : ignored;
  };

  cancelEdit = (
    facts: ComposerPendingInputCurrentFacts,
    preparationToken: number,
  ): ComposerPendingInputCommandOutcome => {
    this.reconcile(facts);
    if (
      !this.accepts(facts) ||
      !facts.mutationsEnabled ||
      this.edit?.phase !== "active" ||
      this.edit.preparationToken !== preparationToken
    ) {
      return ignored;
    }
    if (this.hasUnsavedChanges()) {
      this.confirmDiscard = true;
      this.discardClosesDrawer = false;
      this.publish(facts);
      return applied;
    }
    const result = this.runManagement(() => this.editActive().reservation.cancel());
    const settled = this.settleEditResult(facts, result, false);
    this.publish(facts);
    return settled ? applied : ignored;
  };

  deleteItem = (
    facts: ComposerPendingInputCurrentFacts,
    item: ComposerPendingInputPageItem,
  ): ComposerPendingInputCommandOutcome => {
    this.reconcile(facts);
    if (!this.accepts(facts) || !facts.mutationsEnabled || this.pages == null) return ignored;
    this.announcement = null;
    const laneItems = this.pages[item.lane].items;
    const deletedIndex = laneItems.findIndex(({ key }) => key === item.key);
    const focusKey =
      laneItems[deletedIndex + 1]?.key ??
      (deletedIndex > 0 ? laneItems[deletedIndex - 1]?.key : undefined);
    const result = this.runManagement(() =>
      facts.composerRole.deletePendingInput(facts.sessionRevision, {
        key: item.key,
        revision: this.pages?.revision ?? facts.snapshot.detailRevision,
      }),
    );
    if (result.type === "deleted") {
      this.alert = null;
      const nextPages = this.refreshPages(facts, result.revision);
      this.completionHold = nextPages != null && pagesAreEmpty(nextPages);
      this.enqueueEffect(
        focusKey == null
          ? { type: "laneHeading", lane: item.lane }
          : { type: "item", key: focusKey, fallbackLane: item.lane },
      );
      this.publish(facts);
      return applied;
    }
    if (result.type === "unavailable" && result.scope === "ownerGone") {
      this.closeInvalid();
    } else {
      this.handleLiveFailure(
        result.type === "stale"
          ? "stale"
          : result.type === "notManageable"
            ? "notManageable"
            : "sessionInvalidated",
        "revision" in result ? result.revision : facts.snapshot.detailRevision,
        facts,
      );
    }
    this.publish(facts);
    return ignored;
  };

  moveItem = (
    facts: ComposerPendingInputCurrentFacts,
    item: ComposerPendingInputPageItem,
    destination: ComposerPendingInputMoveDestination,
  ): ComposerPendingInputCommandOutcome => {
    this.reconcile(facts);
    if (!this.accepts(facts) || !facts.mutationsEnabled || this.pages == null) return ignored;
    const hadAnnouncement = this.announcement != null;
    this.announcement = null;
    const budgets = this.pages.budgets;
    const result = this.runManagement(() =>
      facts.composerRole.movePendingInput(facts.sessionRevision, {
        key: item.key,
        revision: this.pages?.revision ?? facts.snapshot.detailRevision,
        destination,
      }),
    );
    if (result.type === "noOp") {
      if (hadAnnouncement) this.publish(facts);
      return ignored;
    }
    if (result.type === "unavailable" && result.scope === "ownerGone") {
      this.closeInvalid();
      this.publish(facts);
      return ignored;
    }

    const revision = "revision" in result ? result.revision : facts.snapshot.detailRevision;
    const refreshed = refreshComposerPendingInputPrefixes(facts.composerRole, revision, budgets);
    if (refreshed.type === "unavailable") {
      this.closeInvalid();
      this.publish(facts);
      return ignored;
    }
    const nextPrefixes = refreshed.type === "ready" ? refreshed.prefixes : refreshed.fallback;
    if (nextPrefixes != null) {
      this.exhaustedMoveRefresh = null;
      this.pages = { composerRole: facts.composerRole, ...nextPrefixes };
    } else {
      this.exhaustedMoveRefresh = {
        composerRole: facts.composerRole,
        throughRevision:
          refreshed.type === "ready" ? refreshed.prefixes.revision : refreshed.revision,
      };
      this.pages = null;
    }

    if (result.type !== "moved") {
      this.completionHold = true;
      this.alert = refreshed.type === "ready" ? "moveNotApplied" : "moveNotAppliedRefreshFailed";
      this.enqueueEffect({ type: "drawerHeading" });
      this.publish(facts);
      return ignored;
    }
    if (refreshed.type === "stale") {
      this.completionHold = true;
      this.alert = "moveRefreshFailed";
      this.enqueueEffect({ type: "drawerHeading" });
      this.publish(facts);
      return applied;
    }
    this.completionHold = false;
    this.alert = null;
    this.announcement = { lane: result.lane, position: result.position, count: result.count };
    this.enqueueEffect({ type: "item", key: item.key, fallbackLane: result.lane });
    this.publish(facts);
    return applied;
  };

  showMore = (
    facts: ComposerPendingInputCurrentFacts,
    lane: ComposerPendingInputLane,
  ): ComposerPendingInputCommandOutcome => {
    this.reconcile(facts);
    if (!this.accepts(facts) || this.pages == null) return ignored;
    const result = showMoreComposerPendingInputLane(this.pages.composerRole, this.pages, lane);
    if (result.type === "ready") {
      this.pages = { composerRole: this.pages.composerRole, ...result.prefixes };
      this.exhaustedMoveRefresh = null;
      this.publish(facts);
      return applied;
    }
    if (result.type === "unavailable") this.closeInvalid();
    else this.handleLiveFailure("stale", result.revision, facts);
    this.publish(facts);
    return ignored;
  };

  detailFailed = (
    facts: ComposerPendingInputCurrentFacts,
    result: Exclude<ComposerPendingInputDetailResult, { type: "detail" }>,
  ): ComposerPendingInputCommandOutcome => {
    this.reconcile(facts);
    if (!this.accepts(facts)) return ignored;
    if (result.type === "missing") return ignored;
    if (result.type === "unavailable") this.closeInvalid();
    else this.handleLiveFailure("stale", result.revision, facts);
    this.publish(facts);
    return ignored;
  };

  drawerPresenceEnded = (ownerGeneration: number): void => {
    if (this.disposed || this.phase !== "closing" || ownerGeneration !== this.ownerGeneration) {
      return;
    }
    const target = this.focusAfterClose;
    this.phase = "closed";
    this.owner = null;
    this.pages = null;
    this.edit = null;
    this.alert = null;
    this.announcement = null;
    this.completionHold = false;
    this.exhaustedMoveRefresh = null;
    this.handledOutcome = null;
    this.focusAfterClose = null;
    this.confirmDiscard = false;
    if (target != null) this.enqueueEffect({ type: target });
    this.publish(null);
  };

  consumeEffect = (effectId: number): void => {
    const index = this.effects.findIndex(({ id }) => id === effectId);
    if (index < 0) return;
    this.effects = this.effects.filter(({ id }) => id !== effectId);
    this.snapshot = { ...this.snapshot, effects: [...this.effects] };
    this.listeners.notify();
  };

  dispose = (): void => {
    if (this.disposed) return;
    this.disposed = true;
    this.ownerGeneration += 1;
    this.phase = "closed";
    this.owner = null;
    this.pages = null;
    this.edit = null;
    this.effects = [];
    this.listeners.clear();
    this.snapshot = this.createSnapshot(null);
  };

  private reconcile(facts: ComposerPendingInputCurrentFacts): void {
    if (this.phase !== "open" || this.owner == null) return;
    if (facts.composerRole !== this.owner) {
      this.retainEdit("sessionInvalidated", true);
      if (this.edit?.phase !== "retained") this.beginClosing("composer");
      return;
    }
    if (this.edit?.phase === "retained") return;

    const outcome = facts.snapshot.pendingInputManagementOutcome;
    if (
      this.edit != null &&
      outcome != null &&
      outcome !== this.edit.outcomeAtBegin &&
      outcome !== this.handledOutcome &&
      outcome.key === this.edit.item.key
    ) {
      this.handledOutcome = outcome;
      if (!this.retainEdit("targetInvalidated", false)) this.edit = null;
      this.completionHold = true;
      this.alert = "targetInvalidated";
      this.announcement = null;
      this.enqueueEffect({ type: "drawerHeading" });
    }

    if (!facts.mutationsEnabled && this.edit != null) {
      if (!this.retainEdit("sessionInvalidated", true)) this.beginClosing("composer");
      return;
    }

    const suppressed =
      this.exhaustedMoveRefresh?.composerRole === facts.composerRole &&
      facts.snapshot.detailRevision <= this.exhaustedMoveRefresh.throughRevision;
    if (!suppressed && this.pages?.revision !== facts.snapshot.detailRevision) {
      const result = readInitialComposerPendingInputPrefixes(
        facts.composerRole,
        facts.snapshot.detailRevision,
      );
      if (result.type !== "ready") {
        this.closeInvalid();
        return;
      }
      this.pages = { composerRole: facts.composerRole, ...result.prefixes };
      this.exhaustedMoveRefresh = null;
    } else if (suppressed) {
      this.pages = null;
    }

    if (
      !hasPendingInputs(facts.snapshot) &&
      !this.completionHold &&
      this.edit == null &&
      this.managementDepth === 0
    ) {
      this.beginClosing("composer");
    }
  }

  private accepts(facts: ComposerPendingInputCurrentFacts): boolean {
    return !this.disposed && this.phase === "open" && this.owner === facts.composerRole;
  }

  private beginClosing(focusTarget: "composer" | "trigger" | null): void {
    if (this.phase !== "open") return;
    this.phase = "closing";
    this.focusAfterClose = focusTarget;
  }

  private closeInvalid(): void {
    this.pages = null;
    this.retainEdit("sessionInvalidated", true);
    if (this.edit?.phase === "retained") return;
    this.edit = null;
    this.alert = null;
    this.announcement = null;
    this.completionHold = false;
    this.exhaustedMoveRefresh = null;
    this.beginClosing("composer");
  }

  private refreshPages(
    facts: ComposerPendingInputCurrentFacts,
    revision: number,
    budgets: ComposerPendingInputLoadBudgets = this.pages?.composerRole === facts.composerRole
      ? this.pages.budgets
      : createComposerPendingInputLoadBudgets(),
  ): PendingInputPages | null {
    const result = refreshComposerPendingInputPrefixes(facts.composerRole, revision, budgets);
    if (result.type === "unavailable") {
      this.closeInvalid();
      return null;
    }
    const prefixes = result.type === "ready" ? result.prefixes : result.fallback;
    if (prefixes == null) return null;
    this.exhaustedMoveRefresh = null;
    this.pages = { composerRole: facts.composerRole, ...prefixes };
    return this.pages;
  }

  private handleLiveFailure(
    alert: Exclude<ComposerPendingInputAlert, "empty">,
    revision: number,
    facts: ComposerPendingInputCurrentFacts,
  ): void {
    this.completionHold = true;
    this.retainEdit(alert, false);
    if (this.edit?.phase !== "retained") this.edit = null;
    this.alert = alert;
    this.announcement = null;
    if (this.edit?.phase !== "retained") this.refreshPages(facts, revision);
    this.enqueueEffect({ type: "drawerHeading" });
  }

  private settleEditResult(
    facts: ComposerPendingInputCurrentFacts,
    result:
      | ReturnType<ActiveThreadPendingInputEditReservation["save"]>
      | ReturnType<ActiveThreadPendingInputEditReservation["cancel"]>,
    closeAfterSettlement: boolean,
  ): boolean {
    const active = this.edit?.phase === "active" ? this.edit : null;
    if (active == null) return false;
    if (result.type === "unavailable") {
      this.retainEdit(
        result.reason === "targetInvalidated" ? "targetInvalidated" : "sessionInvalidated",
        false,
      );
      return false;
    }
    if (result.type === "invalidInput") {
      this.alert = "empty";
      return false;
    }
    this.edit = null;
    this.alert = null;
    this.announcement = null;
    if (closeAfterSettlement) {
      this.beginClosing(hasPendingInputs(facts.snapshot) ? "trigger" : "composer");
    } else {
      const nextPages = this.refreshPages(facts, result.revision);
      this.completionHold = nextPages != null && pagesAreEmpty(nextPages);
      this.enqueueEffect({
        type: "item",
        key: active.item.key,
        fallbackLane: active.item.lane,
      });
    }
    return true;
  }

  private runManagement<Result>(operation: () => Result): Result {
    this.managementDepth += 1;
    try {
      return operation();
    } finally {
      this.managementDepth -= 1;
    }
  }

  private editActive(): ActiveEdit {
    if (this.edit?.phase !== "active") throw new Error("Pending input edit is not active");
    return this.edit;
  }

  private hasUnsavedChanges(): boolean {
    if (this.edit?.phase === "retained") return true;
    return (
      this.edit?.phase === "active" &&
      JSON.stringify(this.edit.capture().input) !== this.edit.initialInput
    );
  }

  private retainEdit(alert: ComposerPendingInputAlert, cancel: boolean): boolean {
    const active = this.edit;
    if (active?.phase !== "active") return active?.phase === "retained";
    const capture = active.capture();
    this.edit = {
      phase: "retained",
      item: active.item,
      preparationToken: active.preparationToken,
      capture,
    };
    this.pages = null;
    this.alert = alert;
    this.announcement = null;
    this.completionHold = true;
    if (cancel) this.runManagement(active.reservation.cancel);
    this.enqueueEffect({ type: "drawerHeading" });
    return true;
  }

  private enqueueEffect(target: ComposerPendingInputEffectTarget): void {
    this.effects.push({ id: ++this.nextEffectId, ownerGeneration: this.ownerGeneration, target });
  }

  private publish(facts: ComposerPendingInputCurrentFacts | null): void {
    this.snapshot = this.createSnapshot(facts);
    this.listeners.notify();
  }

  private createSnapshot(
    facts: ComposerPendingInputCurrentFacts | null,
  ): ComposerPendingInputSessionSnapshot {
    const open = this.phase === "open";
    const counts = facts?.snapshot;
    const view =
      open && counts != null
        ? {
            pages: this.pages == null ? null : stripPageOwner(this.pages),
            guidingCount: counts.guidingCount,
            ordinaryQueuedCount: counts.ordinaryQueuedCount,
            edit: editView(this.edit),
          }
        : null;
    return {
      phase: this.phase,
      ownerGeneration: this.ownerGeneration,
      view,
      actionsEnabled:
        open &&
        facts?.mutationsEnabled === true &&
        this.edit?.phase !== "preparing" &&
        this.edit?.phase !== "retained",
      alert: open ? this.alert : null,
      announcement: open ? this.announcement : null,
      effects: [...this.effects],
      confirmDiscard: open && this.confirmDiscard,
    };
  }
}

export function createComposerPendingInputSession(): ComposerPendingInputSession {
  return new ComposerPendingInputSessionImpl();
}

function hasPendingInputs(snapshot: ComposerInputQueueCoordinatorSnapshot): boolean {
  return snapshot.guidingCount > 0 || snapshot.ordinaryQueuedCount > 0;
}

function pagesAreEmpty(pages: ComposerPendingInputPrefixes): boolean {
  return pages.steer.items.length === 0 && pages.ordinary.items.length === 0;
}

function stripPageOwner(pages: PendingInputPages): ComposerPendingInputPrefixes {
  return {
    revision: pages.revision,
    budgets: pages.budgets,
    ordinary: pages.ordinary,
    steer: pages.steer,
  };
}

function editView(edit: EditSession | null): ComposerPendingInputEditView | null {
  if (edit == null) return null;
  if (edit.phase === "retained") {
    return {
      phase: edit.phase,
      item: edit.item,
      preparationToken: edit.preparationToken,
      text: edit.capture.textContent,
    };
  }
  if (edit.phase === "preparing") {
    return {
      phase: edit.phase,
      item: edit.item,
      preparationToken: edit.preparationToken,
    };
  }
  return {
    phase: edit.phase,
    item: edit.item,
    preparationToken: edit.preparationToken,
    valid: edit.valid,
  };
}
