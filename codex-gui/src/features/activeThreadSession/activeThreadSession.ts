import type { AppDispatch } from "@/app/store";
import type { BrowserAuthorizationSession } from "@/features/browserLaunch/browserAuthorizationSession";
import type { GuiHostCommands } from "@/features/guiHost/guiHostClient";
import { createListenerSet } from "@/subscriptions/listenerSet";
import { SessionCollectionPersistenceStore } from "@/features/sessionCollection/sessionCollectionPersistence";
import {
  createActiveThreadMemberLifecycle,
  type ActiveThreadMemberLifecycle,
} from "./activeThreadMemberLifecycle";
import type {
  ActiveThreadCollectionSnapshot,
  ActiveThreadRemovalOutcome,
  ActiveThreadCollectionError,
  ActiveThreadMemberOperationError,
} from "./activeThreadSessionCollectionContracts";
export type {
  ActiveThreadCollectionSnapshot,
  ActiveThreadCollectionMember,
  ActiveThreadRemovalOutcome,
  ActiveThreadRemovalBlocker,
} from "./activeThreadSessionCollectionContracts";
import type {
  ThreadProjectionClosedNotification,
  ThreadProjectionDeltaNotification,
  ThreadProjectionEventNotification,
  ThreadStatusChangedNotification,
} from "@codex-protocol/v2";
import type { CreateLiveActiveThreadSessionInput } from "./liveActiveThreadSession";

type ActiveThreadSessionCommands = Pick<
  GuiHostCommands,
  | "attachThreadProjection"
  | "compactThread"
  | "detachThreadProjection"
  | "interruptTurn"
  | "listSkills"
  | "listLoadedThreads"
  | "readThread"
  | "resumeThread"
  | "startTurn"
  | "steerTurn"
>;

type ActiveThreadAuthorizationSession = Pick<
  BrowserAuthorizationSession,
  "commitActiveThread" | "clearActiveThread" | "getSnapshot"
>;

export type * from "./activeThreadSessionCollectionContracts";
import type {
  ActiveThreadSessionScheduler,
  ActiveThreadSessionSnapshot,
  ActiveThreadActivationWarning,
  ActiveThreadActivationFailure,
  ActiveThreadActivationOutcome,
  ActiveThreadRetryOutcome,
  ActiveThreadSession,
  ActiveThreadSessionController,
} from "./activeThreadSessionCollectionContracts";

export type CreateActiveThreadSessionInput = Readonly<{
  authorizationSession: ActiveThreadAuthorizationSession;
  commands: ActiveThreadSessionCommands;
  dispatch: AppDispatch;
  scheduler: ActiveThreadSessionScheduler;
  persistence: CreateLiveActiveThreadSessionInput["persistence"];
}>;

type Member = {
  threadId: string;
  lifecycle: ActiveThreadMemberLifecycle;
  operationErrors: readonly ActiveThreadMemberOperationError[];
  removal: Promise<ActiveThreadRemovalOutcome> | null;
  unsubscribe: () => void;
};

class ActiveThreadSessionImpl implements ActiveThreadSessionController {
  readonly session: ActiveThreadSession;
  private readonly authorizationSession: ActiveThreadAuthorizationSession;
  private readonly commands: ActiveThreadSessionCommands;
  private readonly dispatch: AppDispatch;
  private readonly scheduler: ActiveThreadSessionScheduler;
  private readonly persistence: CreateLiveActiveThreadSessionInput["persistence"];
  private readonly listeners = createListenerSet();
  private readonly members = new Map<string, Member>();
  private collectionStore: SessionCollectionPersistenceStore | null = null;
  private collectionErrors: readonly ActiveThreadCollectionError[] = [];
  private collectionLoaded = false;
  private viewedThreadId: string | null = null;
  private selectionIntent = 0;
  private disposed = false;
  private snapshot: ActiveThreadSessionSnapshot = { phase: "empty", revision: 0 };
  private collectionSnapshot: ActiveThreadCollectionSnapshot = {
    viewedThreadId: null,
    members: [],
    errors: [],
  };

  constructor({
    authorizationSession,
    commands,
    dispatch,
    scheduler,
    persistence,
  }: CreateActiveThreadSessionInput) {
    this.authorizationSession = authorizationSession;
    this.commands = commands;
    this.dispatch = dispatch;
    this.scheduler = scheduler;
    this.persistence = persistence;
    this.session = {
      getSnapshot: this.getSnapshot,
      getHistoryCwd: () => this.authorizationSession.getSnapshot().historyCwd ?? null,
      getCollectionSnapshot: this.getCollectionSnapshot,
      subscribe: this.subscribe,
      activate: this.activate,
      view: this.view,
      retry: this.retry,
      remove: this.remove,
      setOperationError: this.setOperationError,
    };
  }

  getSnapshot = (): ActiveThreadSessionSnapshot => this.snapshot;
  getCollectionSnapshot = (): ActiveThreadCollectionSnapshot => this.collectionSnapshot;
  subscribe = (listener: () => void): (() => void) => this.listeners.subscribe(listener);

  private setCollectionError(
    operation: ActiveThreadCollectionError["operation"],
    threadId: string | null,
    error: unknown,
  ): void {
    this.collectionErrors = this.collectionErrors.filter(
      (entry) => entry.operation !== operation || entry.threadId !== threadId,
    );
    if (error != null)
      this.collectionErrors = [...this.collectionErrors, { operation, threadId, error }];
  }

  private setOperationError = (
    threadId: string,
    operation: ActiveThreadMemberOperationError["operation"],
    error: unknown,
  ): void => {
    if (this.isDisposed()) return;
    const member = this.members.get(threadId);
    this.setCollectionError(operation, threadId, member == null ? error : null);
    if (member != null) {
      member.operationErrors = member.operationErrors.filter(
        (entry) => entry.operation !== operation,
      );
      if (error != null) member.operationErrors = [...member.operationErrors, { operation, error }];
    }
    this.publish();
  };

  private loadCollection(): boolean {
    if (this.collectionLoaded) return true;
    try {
      this.collectionStore ??= new SessionCollectionPersistenceStore(this.persistence);
      const result = this.collectionStore.read();
      if (result.type === "restored") {
        for (const threadId of result.threadIds)
          this.members.set(threadId, this.createMember(threadId));
      }
      this.collectionLoaded = true;
      this.setCollectionError("collectionRead", null, null);
      return true;
    } catch (error: unknown) {
      this.setCollectionError("collectionRead", null, error);
      this.publish();
      return false;
    }
  }

  activateRecoveryThread = (
    preferredThreadId?: string | null,
  ): Promise<ActiveThreadActivationOutcome> => {
    if (this.isDisposed())
      return Promise.resolve(this.connectionFailure(preferredThreadId ?? null));
    if (!this.loadCollection())
      return Promise.resolve(this.collectionFailure("collectionRead", null));
    const target = preferredThreadId ?? this.authorizationSession.getSnapshot().activeThreadId;
    // Begin the foreground intent before any asynchronous background initialization settles.
    const foreground =
      target == null ? Promise.resolve({ type: "empty" } as const) : this.activate(target);
    this.initializeWaitingMembers(target);
    this.publish();
    return foreground;
  };

  private activate = (threadId: string): Promise<ActiveThreadActivationOutcome> =>
    this.selectThread(threadId, "activate");

  private view = (threadId: string): Promise<ActiveThreadActivationOutcome> =>
    this.selectThread(threadId, "view");

  private selectThread = async (
    threadId: string,
    mode: "activate" | "view",
  ): Promise<ActiveThreadActivationOutcome> => {
    if (this.isDisposed()) return this.connectionFailure(threadId);
    const intent = ++this.selectionIntent;
    if (!this.loadCollection()) return this.collectionFailure("collectionRead", null);
    let member = this.members.get(threadId);
    if (member == null) {
      try {
        this.commitMembership([...this.members.keys(), threadId]);
        this.setCollectionError("membershipAdd", threadId, null);
      } catch (error: unknown) {
        this.setCollectionError("membershipAdd", threadId, error);
        this.initializeWaitingMembers(threadId);
        this.publish();
        return this.collectionFailure("membershipAdd", threadId);
      }
      member = this.createMember(threadId);
      this.members.set(threadId, member);
    }
    this.viewedThreadId = threadId;
    this.publish();
    const foreground =
      mode === "view" && member.lifecycle.getState().phase === "failed"
        ? Promise.resolve(this.failure("prepare", member.lifecycle.getState().error))
        : member.lifecycle.initialize();
    this.initializeWaitingMembers(threadId);
    const result = await foreground;
    if (this.isDisposed()) return this.connectionFailure(threadId);
    if (intent !== this.selectionIntent)
      return {
        type: "unavailable",
        failure: {
          type: "currentThreadChanged",
          activeThreadId: this.viewedThreadId,
          expectedRevision: intent,
          actualRevision: this.selectionIntent,
        },
      };
    if (result.type !== "ready") return result;
    const warnings: ActiveThreadActivationWarning[] = [];
    try {
      this.commitSelection(member);
      this.setCollectionError("viewSelection", threadId, null);
    } catch (error: unknown) {
      this.setCollectionError("viewSelection", threadId, error);
      warnings.push({ type: "authorizationPersistenceFailed", error });
    }
    this.publish();
    return { type: "ready", threadId, warnings };
  };

  private retry = async (threadId: string): Promise<ActiveThreadRetryOutcome> => {
    if (this.isDisposed()) return this.connectionFailure(threadId);
    if (!this.loadCollection()) return this.collectionFailure("collectionRead", null);
    const intent = this.selectionIntent;
    const wasViewed = this.viewedThreadId === threadId;
    this.initializeWaitingMembers(threadId);
    const member = this.members.get(threadId);
    if (member == null)
      return this.failure("prepare", new Error("Session is no longer a collection member"));
    if (member.lifecycle.getState().retryRemoval) {
      const removed = await this.remove(threadId);
      if (this.isDisposed()) return this.connectionFailure(threadId);
      if (removed.type === "failed" && removed.phase !== "detach")
        return this.collectionFailure(
          removed.phase === "selection" ? "removeSelection" : "membershipRemove",
          threadId,
        );
      return removed.type === "removed"
        ? removed
        : this.failure(
            "activate",
            removed.type === "failed" ? removed.error : member.lifecycle.getState().error,
          );
    }
    const result = await member.lifecycle.retry();
    if (this.isDisposed()) return this.connectionFailure(threadId);
    if (this.members.get(threadId) !== member)
      return this.failure("prepare", new Error("Session is no longer a collection member"));
    if (result.type !== "ready") return result;
    if (!wasViewed || intent !== this.selectionIntent || this.viewedThreadId !== threadId)
      return result;
    const warnings = [...result.warnings];
    try {
      this.commitSelection(member);
      this.setCollectionError("viewSelection", threadId, null);
    } catch (error: unknown) {
      this.setCollectionError("viewSelection", threadId, error);
      warnings.push({ type: "authorizationPersistenceFailed", error });
    }
    this.publish();
    return { type: "ready", threadId, warnings };
  };

  private commitSelection(member: Member): void {
    const { cwd } = member.lifecycle.getState();
    if (cwd == null) throw new Error("Cannot persist selection before thread initialization");
    this.authorizationSession.commitActiveThread(member.threadId, cwd);
  }

  private createMember(threadId: string): Member {
    const operationErrors: ActiveThreadMemberOperationError[] = [];
    for (const entry of this.collectionErrors) {
      if (
        entry.threadId === threadId &&
        (entry.operation === "navigation" || entry.operation === "remove")
      ) {
        operationErrors.push({ operation: entry.operation, error: entry.error });
      }
    }
    for (const entry of operationErrors) this.setCollectionError(entry.operation, threadId, null);
    const lifecycle = createActiveThreadMemberLifecycle({
      threadId,
      commands: this.commands,
      dispatch: this.dispatch,
      scheduler: this.scheduler,
      persistence: this.persistence,
    });
    return {
      threadId,
      lifecycle,
      operationErrors,
      removal: null,
      unsubscribe: lifecycle.subscribe(() => {
        this.publish();
      }),
    };
  }

  private initializeWaitingMembers(foregroundThreadId: string | null): void {
    for (const member of this.members.values()) {
      if (
        member.threadId !== foregroundThreadId &&
        member.lifecycle.getState().phase === "initializing"
      )
        void member.lifecycle.initialize();
    }
  }

  private remove = (threadId: string): Promise<ActiveThreadRemovalOutcome> => {
    const member = this.members.get(threadId);
    if (this.isDisposed() || member == null)
      return Promise.resolve({ type: "unavailable", threadId });
    if (member.removal != null) return member.removal;
    const pending = this.removeMember(member).finally(() => {
      if (member.removal === pending) member.removal = null;
      this.publish();
    });
    member.removal = pending;
    this.publish();
    return pending;
  };

  private async removeMember(member: Member): Promise<ActiveThreadRemovalOutcome> {
    const threadId = member.threadId;
    const release = await member.lifecycle.prepareRemoval();
    if (release.type !== "prepared") return release;
    if (this.isDisposed() || this.members.get(threadId) !== member) {
      release.cancel();
      return { type: "unavailable", threadId };
    }
    const wasViewed = this.viewedThreadId === threadId;
    try {
      if (wasViewed || this.authorizationSession.getSnapshot().activeThreadId === threadId) {
        this.authorizationSession.clearActiveThread();
        this.setCollectionError("removeSelection", threadId, null);
      }
    } catch (error: unknown) {
      release.cancel();
      this.setCollectionError("removeSelection", threadId, error);
      this.publish();
      return { type: "failed", threadId, phase: "selection", error };
    }
    const released = await release.release();
    if (released.type !== "released") return released;
    if (this.isDisposed()) return { type: "unavailable", threadId };
    try {
      this.commitMembership([...this.members.keys()].filter((id) => id !== threadId));
      this.setCollectionError("membershipRemove", threadId, null);
    } catch (error: unknown) {
      this.setCollectionError("membershipRemove", threadId, error);
      this.publish();
      return { type: "failed", threadId, phase: "membership", error };
    }
    member.lifecycle.finalizeRemoval();
    member.unsubscribe();
    for (const entry of member.operationErrors) {
      if (entry.operation !== "remove")
        this.setCollectionError(entry.operation, threadId, entry.error);
    }
    this.setCollectionError("remove", threadId, null);
    this.setCollectionError("removeSelection", threadId, null);
    this.setCollectionError("viewSelection", threadId, null);
    this.members.delete(threadId);
    if (this.viewedThreadId === threadId) {
      this.viewedThreadId = null;
      this.selectionIntent += 1;
    }
    this.publish();
    return { type: "removed", threadId, wasViewed };
  }

  handleProjectionEvent = (notification: ThreadProjectionEventNotification): void => {
    if (!this.disposed)
      this.members.get(notification.threadId)?.lifecycle.handleProjectionEvent(notification);
  };
  handleProjectionDelta = (notification: ThreadProjectionDeltaNotification): void => {
    if (!this.disposed)
      this.members.get(notification.threadId)?.lifecycle.handleProjectionDelta(notification);
  };
  handleProjectionClosed = (notification: ThreadProjectionClosedNotification): void => {
    if (!this.disposed)
      this.members.get(notification.threadId)?.lifecycle.handleProjectionClosed(notification);
  };
  handleSkillsChanged = (): void => {
    for (const member of this.members.values()) member.lifecycle.invalidateSkills();
  };
  handleThreadStatusChanged = (notification: ThreadStatusChangedNotification): void => {
    if (!this.disposed) this.members.get(notification.threadId)?.lifecycle.invalidateThreadStatus();
  };
  suspendRestoredQueue = (): void => {
    for (const member of this.members.values()) member.lifecycle.suspendRestored();
  };
  connectionUnavailable = (): void => {
    this.dispose();
  };
  dispose = (): void => {
    if (this.isDisposed()) return;
    this.disposed = true;
    let cleanupError: unknown = null;
    for (const member of this.members.values()) {
      try {
        member.unsubscribe();
        member.lifecycle.dispose();
      } catch (error: unknown) {
        cleanupError = appendError(cleanupError, error);
      }
    }
    this.snapshot = { phase: "disposed", revision: this.snapshot.revision + 1 };
    this.collectionSnapshot = {
      viewedThreadId: this.viewedThreadId,
      members: [],
      errors:
        cleanupError == null ? [] : [{ operation: "dispose", threadId: null, error: cleanupError }],
    };
    this.listeners.notify();
    this.listeners.clear();
    if (cleanupError != null)
      throw new Error("Session collection cleanup failed", { cause: cleanupError });
  };

  private publish(): void {
    if (this.isDisposed()) return;
    const viewed = this.viewedThreadId == null ? null : this.members.get(this.viewedThreadId);
    const viewedState = viewed?.lifecycle.getState();
    this.snapshot =
      viewedState == null
        ? { phase: "empty", revision: this.snapshot.revision + 1 }
        : (viewedState.snapshot ?? {
            phase: viewedState.phase === "initializing" ? "loading" : "failed",
            threadId: viewedState.threadId,
            revision: this.snapshot.revision + 1,
            error: viewedState.error,
          });
    this.collectionSnapshot = {
      viewedThreadId: this.viewedThreadId,
      members: [...this.members.values()].map((member) => {
        const { phase, snapshot, error, removalBlockers } = member.lifecycle.getState();
        return {
          threadId: member.threadId,
          phase,
          snapshot,
          error,
          operationErrors: member.operationErrors,
          canRemove: member.removal == null && removalBlockers.length === 0,
          removalBlockers,
        };
      }),
      errors: this.collectionErrors,
    };
    this.listeners.notify();
  }

  private isDisposed(): boolean {
    return this.disposed;
  }

  private commitMembership(threadIds: readonly string[]): void {
    const store = this.collectionStore;
    if (store == null) throw new Error("Session collection storage has not been loaded");
    store.commit(threadIds);
  }

  private failure(
    phase: "loaded" | "resume" | "attach" | "prepare" | "activate",
    error: unknown,
    cleanupError: unknown = null,
  ): ActiveThreadActivationOutcome {
    return {
      type: "unavailable",
      failure: { type: "operationFailed", phase, error, cleanupError },
    };
  }

  private collectionFailure(
    operation: Extract<ActiveThreadActivationFailure, { type: "collectionFailed" }>["operation"],
    threadId: string | null,
  ): ActiveThreadActivationOutcome {
    return { type: "unavailable", failure: { type: "collectionFailed", operation, threadId } };
  }

  private connectionFailure(threadId: string | null): ActiveThreadActivationOutcome {
    return {
      type: "unavailable",
      failure: { type: "connectionLost", progress: "beforeCommit", threadId, cleanupError: null },
    };
  }
}

function appendError(current: unknown, error: unknown): unknown {
  if (error == null) return current;
  if (current == null) return error;
  return new AggregateError([current, error], "Multiple active thread activation errors");
}

export function createActiveThreadSession(
  input: CreateActiveThreadSessionInput,
): ActiveThreadSessionController {
  return new ActiveThreadSessionImpl(input);
}
