import { vi, type Mock } from "vitest";
import type { ComposerInputQueueCoordinatorSnapshot } from "@/features/composerInputQueue/composerInputQueueCoordinator";
import type { SkillCatalogState } from "@/features/skillCatalog/skillCatalogOwner";
import type {
  ActiveThreadActivationOutcome,
  ActiveThreadCompactionRole,
  ActiveThreadComposerRole,
  ActiveThreadSession,
  ActiveThreadSessionSnapshot,
  ActiveThreadSkillsRole,
  ActiveThreadCollectionSnapshot,
} from "../activeThreadSessionCollectionContracts";
import { createActiveThreadSessionIdentity } from "../activeThreadSessionIdentity";
import type { Thread } from "@codex-protocol/v2";

type ActiveSnapshot = Extract<ActiveThreadSessionSnapshot, { phase: "active" }>;
type ProjectionUnavailableSnapshot = Extract<
  ActiveThreadSessionSnapshot,
  { phase: "projectionUnavailable" }
>;
type EmptySnapshot = Extract<ActiveThreadSessionSnapshot, { phase: "empty" }>;
type DisposedSnapshot = Extract<ActiveThreadSessionSnapshot, { phase: "disposed" }>;

type ActiveSnapshotOptions = Readonly<Partial<Omit<ActiveSnapshot, "phase">>>;
type ProjectionUnavailableSnapshotOptions = Readonly<
  Partial<Omit<ProjectionUnavailableSnapshot, "phase">>
>;

type ActivateOutcomeFactory = (
  threadId: string,
) => ActiveThreadActivationOutcome | Promise<ActiveThreadActivationOutcome>;

export type ActiveThreadSessionHarnessOptions = Readonly<{
  initialSnapshot?: ActiveThreadSessionSnapshot;
  composerRole?: Partial<ActiveThreadComposerRole>;
  compactionRole?: Partial<ActiveThreadCompactionRole>;
  skillsRole?: Partial<ActiveThreadSkillsRole>;
  activate?: ActiveThreadActivationOutcome | ActivateOutcomeFactory;
  initialCollection?: ActiveThreadCollectionSnapshot;
}>;

export type ActiveThreadSessionHarness = Readonly<{
  session: ActiveThreadSession;
  setHistoryCwd(cwd: string | null): void;
  composerRole: ActiveThreadComposerRole;
  compactionRole: ActiveThreadCompactionRole;
  skillsRole: ActiveThreadSkillsRole;
  activate: Mock<ActiveThreadSession["activate"]>;
  view: Mock<ActiveThreadSession["view"]>;
  retry: Mock<ActiveThreadSession["retry"]>;
  recoverProjection: Mock<ActiveThreadSession["recoverProjection"]>;
  remove: Mock<ActiveThreadSession["remove"]>;
  setOperationError: Mock<ActiveThreadSession["setOperationError"]>;
  subscribe: Mock<ActiveThreadSession["subscribe"]>;
  activeSnapshot(options?: ActiveSnapshotOptions): ActiveSnapshot;
  projectionUnavailableSnapshot(
    options?: ProjectionUnavailableSnapshotOptions,
  ): ProjectionUnavailableSnapshot;
  publish(snapshot: ActiveThreadSessionSnapshot): boolean;
  publishCollection(snapshot: ActiveThreadCollectionSnapshot): void;
  setActivateOutcome(outcome: ActiveThreadActivationOutcome | ActivateOutcomeFactory): void;
  listenerCount(): number;
}>;

const emptyComposerSnapshot: ComposerInputQueueCoordinatorSnapshot = {
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
  persistence: { error: null, restoredPaused: false, revision: null, unknownMessages: [] },
};

const emptySkillsState: SkillCatalogState = {
  type: "ready",
  candidates: [],
  partialErrorCount: 0,
};

export const emptyActiveThreadSessionSnapshot: EmptySnapshot = {
  phase: "empty",
  revision: 0,
};

const ownerGone = {
  type: "unavailable",
  scope: "ownerGone",
  reason: "disposed",
} as const;

const createComposerRole = (
  overrides: Partial<ActiveThreadComposerRole> = {},
): ActiveThreadComposerRole => ({
  getDraft: vi.fn<ActiveThreadComposerRole["getDraft"]>().mockReturnValue(null),
  saveDraft: vi.fn<ActiveThreadComposerRole["saveDraft"]>().mockReturnValue(true),
  retryPersistence: vi.fn<ActiveThreadComposerRole["retryPersistence"]>().mockReturnValue(false),
  resumeRestored: vi.fn<ActiveThreadComposerRole["resumeRestored"]>().mockReturnValue(false),
  discardUnknown: vi.fn<ActiveThreadComposerRole["discardUnknown"]>().mockReturnValue(false),
  beginPendingInputEdit: vi
    .fn<ActiveThreadComposerRole["beginPendingInputEdit"]>()
    .mockReturnValue(ownerGone),
  deletePendingInput: vi
    .fn<ActiveThreadComposerRole["deletePendingInput"]>()
    .mockReturnValue(ownerGone),
  interruptActiveTurn: vi
    .fn<ActiveThreadComposerRole["interruptActiveTurn"]>()
    .mockReturnValue(false),
  movePendingInput: vi
    .fn<ActiveThreadComposerRole["movePendingInput"]>()
    .mockReturnValue(ownerGone),
  promoteOrdinaryFrontToSteer: vi
    .fn<ActiveThreadComposerRole["promoteOrdinaryFrontToSteer"]>()
    .mockReturnValue(false),
  readPendingInputDetail: vi
    .fn<ActiveThreadComposerRole["readPendingInputDetail"]>()
    .mockReturnValue(ownerGone),
  readPendingInputPage: vi
    .fn<ActiveThreadComposerRole["readPendingInputPage"]>()
    .mockReturnValue(ownerGone),
  recover: vi.fn<ActiveThreadComposerRole["recover"]>().mockReturnValue(false),
  submit: vi.fn<ActiveThreadComposerRole["submit"]>().mockReturnValue({ type: "accepted" }),
  submitSteer: vi
    .fn<ActiveThreadComposerRole["submitSteer"]>()
    .mockReturnValue({ type: "accepted" }),
  ...overrides,
});

const createCompactionRole = (
  getRevision: () => number,
  overrides: Partial<ActiveThreadCompactionRole> = {},
): ActiveThreadCompactionRole => ({
  requestCompaction: vi
    .fn<ActiveThreadCompactionRole["requestCompaction"]>()
    .mockImplementation(() => ({
      type: "unavailable",
      scope: "activeThreadSession",
      reason: "disposed",
      revision: getRevision(),
    })),
  ...overrides,
});

const createSkillsRole = (
  overrides: Partial<ActiveThreadSkillsRole> = {},
): ActiveThreadSkillsRole => ({
  invalidateSkills: vi.fn<ActiveThreadSkillsRole["invalidateSkills"]>().mockReturnValue(false),
  refreshSkills: vi.fn<ActiveThreadSkillsRole["refreshSkills"]>().mockReturnValue(false),
  retrySkills: vi.fn<ActiveThreadSkillsRole["retrySkills"]>().mockReturnValue(false),
  ...overrides,
});

export const activeThreadSessionSnapshot = (
  options: ActiveSnapshotOptions = {},
): ActiveSnapshot => {
  const revision = options.revision ?? 1;
  return {
    revision,
    identity: createActiveThreadSessionIdentity(options.threadId ?? "thread-1"),
    threadId: "thread-1",
    subscriptionId: "subscription-1",
    activeTurnId: null,
    threadStatus: { type: "idle" } satisfies Thread["status"],
    compaction: { phase: "idle", canRequest: true, startFailure: null },
    composer: emptyComposerSnapshot,
    skills: emptySkillsState,
    composerRole: createComposerRole(),
    compactionRole: createCompactionRole(() => revision),
    skillsRole: createSkillsRole(),
    ...options,
    phase: "active",
  };
};

export const projectionUnavailableActiveThreadSessionSnapshot = (
  options: ProjectionUnavailableSnapshotOptions = {},
): ProjectionUnavailableSnapshot => {
  const revision = options.revision ?? 1;
  return {
    reason: "backpressure",
    recovery: { pending: false, error: null },
    revision,
    identity: createActiveThreadSessionIdentity(options.threadId ?? "thread-1"),
    threadId: "thread-1",
    subscriptionId: "subscription-1",
    activeTurnId: null,
    threadStatus: { type: "idle" } satisfies Thread["status"],
    compaction: { phase: "idle", canRequest: false, startFailure: null },
    composer: emptyComposerSnapshot,
    skills: emptySkillsState,
    composerRole: createComposerRole(),
    compactionRole: createCompactionRole(() => revision),
    skillsRole: createSkillsRole(),
    ...options,
    phase: "projectionUnavailable",
  };
};

export const disposedActiveThreadSessionSnapshot = (revision = 1): DisposedSnapshot => ({
  phase: "disposed",
  revision,
});

export const createActiveThreadSessionHarness = (
  options: ActiveThreadSessionHarnessOptions = {},
): ActiveThreadSessionHarness => {
  const listeners = new Set<() => void>();
  let currentRevision = options.initialSnapshot?.revision ?? 0;
  const initialRoles =
    options.initialSnapshot?.phase === "active" ||
    options.initialSnapshot?.phase === "projectionUnavailable"
      ? options.initialSnapshot
      : null;
  const composerRole =
    options.composerRole == null && initialRoles != null
      ? initialRoles.composerRole
      : createComposerRole(options.composerRole);
  const compactionRole =
    options.compactionRole == null && initialRoles != null
      ? initialRoles.compactionRole
      : createCompactionRole(() => currentRevision, options.compactionRole);
  const skillsRole =
    options.skillsRole == null && initialRoles != null
      ? initialRoles.skillsRole
      : createSkillsRole(options.skillsRole);
  const identities = new Map<string, ActiveSnapshot["identity"]>();
  if (initialRoles != null) identities.set(initialRoles.threadId, initialRoles.identity);
  const identityFor = (threadId = "thread-1") => {
    let identity = identities.get(threadId);
    if (identity == null) {
      identity = createActiveThreadSessionIdentity(threadId);
      identities.set(threadId, identity);
    }
    return identity;
  };
  const activeSnapshot = (snapshotOptions: ActiveSnapshotOptions = {}): ActiveSnapshot =>
    activeThreadSessionSnapshot({
      identity: identityFor(snapshotOptions.threadId),
      ...snapshotOptions,
      compactionRole,
      composerRole,
      skillsRole,
    });
  const projectionUnavailableSnapshot = (
    snapshotOptions: ProjectionUnavailableSnapshotOptions = {},
  ): ProjectionUnavailableSnapshot =>
    projectionUnavailableActiveThreadSessionSnapshot({
      identity: identityFor(snapshotOptions.threadId),
      ...snapshotOptions,
      compactionRole,
      composerRole,
      skillsRole,
    });
  let snapshot =
    initialRoles == null ||
    (initialRoles.compactionRole === compactionRole &&
      initialRoles.composerRole === composerRole &&
      initialRoles.skillsRole === skillsRole)
      ? (options.initialSnapshot ?? emptyActiveThreadSessionSnapshot)
      : initialRoles.phase === "active"
        ? activeSnapshot(initialRoles)
        : projectionUnavailableSnapshot(initialRoles);
  let activateOutcome: ActiveThreadActivationOutcome | ActivateOutcomeFactory =
    options.activate ?? ((threadId) => ({ type: "ready", threadId, warnings: [] }));

  const subscribe = vi.fn<ActiveThreadSession["subscribe"]>((listener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  });
  const activate = vi.fn<ActiveThreadSession["activate"]>((threadId) =>
    Promise.resolve(
      typeof activateOutcome === "function" ? activateOutcome(threadId) : activateOutcome,
    ),
  );
  const collectionFor = (value: ActiveThreadSessionSnapshot): ActiveThreadCollectionSnapshot => ({
    viewedThreadId: "threadId" in value ? value.threadId : null,
    members:
      "threadId" in value
        ? [
            {
              threadId: value.threadId,
              phase:
                value.phase === "loading"
                  ? "initializing"
                  : value.phase === "failed"
                    ? "failed"
                    : "ready",
              snapshot: value,
              error: "error" in value ? value.error : null,
              operationErrors: [],
              canRemove: value.phase === "active",
              removalBlockers: [],
              retryAction:
                value.phase === "loading" || value.phase === "failed" ? "load" : "status",
              retryPending: value.phase === "loading",
              removalPending: false,
            },
          ]
        : [],
    errors: [],
  });
  let collection = options.initialCollection ?? collectionFor(snapshot);
  const retry = vi.fn<ActiveThreadSession["retry"]>(activate);
  const recoverProjection = vi.fn<ActiveThreadSession["recoverProjection"]>(() =>
    Promise.resolve({ type: "unavailable" }),
  );
  const view = vi.fn<ActiveThreadSession["view"]>((threadId) =>
    Promise.resolve(
      typeof activateOutcome === "function" ? activateOutcome(threadId) : activateOutcome,
    ),
  );
  const remove = vi.fn<ActiveThreadSession["remove"]>((threadId) =>
    Promise.resolve({
      type: "removed",
      threadId,
      wasViewed: collection.viewedThreadId === threadId,
    }),
  );
  let historyCwd: string | null = null;
  const session: ActiveThreadSession = {
    getSnapshot: () => snapshot,
    getHistoryCwd: () => historyCwd,
    getCollectionSnapshot: () => collection,
    subscribe,
    activate,
    view,
    retry,
    recoverProjection,
    remove,
    setOperationError: (threadId, operation, error) => {
      setOperationError(threadId, operation, error);
    },
  };
  const setOperationError = vi.fn<ActiveThreadSession["setOperationError"]>(
    (threadId, operation, error) => {
      const memberExists = collection.members.some((member) => member.threadId === threadId);
      collection = {
        ...collection,
        errors: [
          ...collection.errors.filter(
            (entry) => entry.threadId !== threadId || entry.operation !== operation,
          ),
          ...(!memberExists && error != null ? [{ threadId, operation, error }] : []),
        ],
        members: collection.members.map((member) =>
          member.threadId !== threadId
            ? member
            : {
                ...member,
                operationErrors: [
                  ...member.operationErrors.filter((entry) => entry.operation !== operation),
                  ...(error != null ? [{ operation, error }] : []),
                ],
              },
        ),
      };
      for (const listener of Array.from(listeners)) listener();
    },
  );

  return {
    session,
    setHistoryCwd: (cwd) => {
      historyCwd = cwd;
      for (const listener of Array.from(listeners)) listener();
    },
    compactionRole,
    composerRole,
    skillsRole,
    activate,
    view,
    retry,
    recoverProjection,
    remove,
    setOperationError,
    subscribe,
    activeSnapshot,
    projectionUnavailableSnapshot,
    publish: (nextSnapshot) => {
      if (Object.is(snapshot, nextSnapshot)) return false;
      if (
        (nextSnapshot.phase === "active" || nextSnapshot.phase === "projectionUnavailable") &&
        (nextSnapshot.compactionRole !== compactionRole ||
          nextSnapshot.composerRole !== composerRole ||
          nextSnapshot.skillsRole !== skillsRole)
      ) {
        throw new Error("active thread session harness snapshots must preserve role identity");
      }
      snapshot = nextSnapshot;
      if (nextSnapshot.phase === "active" || nextSnapshot.phase === "projectionUnavailable")
        identities.set(nextSnapshot.threadId, nextSnapshot.identity);
      collection = collectionFor(nextSnapshot);
      currentRevision = nextSnapshot.revision;
      for (const listener of Array.from(listeners)) listener();
      return true;
    },
    publishCollection: (nextCollection) => {
      collection = nextCollection;
      for (const listener of Array.from(listeners)) listener();
    },
    setActivateOutcome: (outcome) => {
      activateOutcome = outcome;
    },
    listenerCount: () => listeners.size,
  };
};
