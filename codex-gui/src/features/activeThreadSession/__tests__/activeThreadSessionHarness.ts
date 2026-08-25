import { vi, type Mock } from "vitest";
import type { ComposerInputQueueCoordinatorSnapshot } from "@/features/composerInputQueue/composerInputQueueCoordinator";
import type { SkillCatalogState } from "@/features/skillCatalog/skillCatalogOwner";
import type {
  ActiveThreadActivationOutcome,
  ActiveThreadComposerRole,
  ActiveThreadSession,
  ActiveThreadSessionSnapshot,
  ActiveThreadSkillsRole,
} from "../activeThreadSession";

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
  skillsRole?: Partial<ActiveThreadSkillsRole>;
  activate?: ActiveThreadActivationOutcome | ActivateOutcomeFactory;
}>;

export type ActiveThreadSessionHarness = Readonly<{
  session: ActiveThreadSession;
  composerRole: ActiveThreadComposerRole;
  skillsRole: ActiveThreadSkillsRole;
  activate: Mock<ActiveThreadSession["activate"]>;
  subscribe: Mock<ActiveThreadSession["subscribe"]>;
  activeSnapshot(options?: ActiveSnapshotOptions): ActiveSnapshot;
  projectionUnavailableSnapshot(
    options?: ProjectionUnavailableSnapshotOptions,
  ): ProjectionUnavailableSnapshot;
  publish(snapshot: ActiveThreadSessionSnapshot): boolean;
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
): ActiveSnapshot => ({
  revision: 1,
  threadId: "thread-1",
  subscriptionId: "subscription-1",
  activeTurnId: null,
  composer: emptyComposerSnapshot,
  skills: emptySkillsState,
  composerRole: createComposerRole(),
  skillsRole: createSkillsRole(),
  ...options,
  phase: "active",
});

export const projectionUnavailableActiveThreadSessionSnapshot = (
  options: ProjectionUnavailableSnapshotOptions = {},
): ProjectionUnavailableSnapshot => ({
  reason: "backpressure",
  recovery: "connectionRestartRequired",
  revision: 1,
  threadId: "thread-1",
  subscriptionId: "subscription-1",
  activeTurnId: null,
  composer: emptyComposerSnapshot,
  skills: emptySkillsState,
  composerRole: createComposerRole(),
  skillsRole: createSkillsRole(),
  ...options,
  phase: "projectionUnavailable",
});

export const disposedActiveThreadSessionSnapshot = (revision = 1): DisposedSnapshot => ({
  phase: "disposed",
  revision,
});

export const createActiveThreadSessionHarness = (
  options: ActiveThreadSessionHarnessOptions = {},
): ActiveThreadSessionHarness => {
  const listeners = new Set<() => void>();
  const initialRoles =
    options.initialSnapshot?.phase === "active" ||
    options.initialSnapshot?.phase === "projectionUnavailable"
      ? options.initialSnapshot
      : null;
  const composerRole =
    options.composerRole == null && initialRoles != null
      ? initialRoles.composerRole
      : createComposerRole(options.composerRole);
  const skillsRole =
    options.skillsRole == null && initialRoles != null
      ? initialRoles.skillsRole
      : createSkillsRole(options.skillsRole);
  const activeSnapshot = (snapshotOptions: ActiveSnapshotOptions = {}): ActiveSnapshot =>
    activeThreadSessionSnapshot({ ...snapshotOptions, composerRole, skillsRole });
  const projectionUnavailableSnapshot = (
    snapshotOptions: ProjectionUnavailableSnapshotOptions = {},
  ): ProjectionUnavailableSnapshot =>
    projectionUnavailableActiveThreadSessionSnapshot({
      ...snapshotOptions,
      composerRole,
      skillsRole,
    });
  let snapshot =
    initialRoles == null ||
    (initialRoles.composerRole === composerRole && initialRoles.skillsRole === skillsRole)
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
  const session: ActiveThreadSession = {
    getSnapshot: () => snapshot,
    subscribe,
    activate,
  };

  return {
    session,
    composerRole,
    skillsRole,
    activate,
    subscribe,
    activeSnapshot,
    projectionUnavailableSnapshot,
    publish: (nextSnapshot) => {
      if (Object.is(snapshot, nextSnapshot)) return false;
      if (
        (nextSnapshot.phase === "active" || nextSnapshot.phase === "projectionUnavailable") &&
        (nextSnapshot.composerRole !== composerRole || nextSnapshot.skillsRole !== skillsRole)
      ) {
        throw new Error("active thread session harness snapshots must preserve role identity");
      }
      snapshot = nextSnapshot;
      for (const listener of Array.from(listeners)) listener();
      return true;
    },
    setActivateOutcome: (outcome) => {
      activateOutcome = outcome;
    },
    listenerCount: () => listeners.size,
  };
};
