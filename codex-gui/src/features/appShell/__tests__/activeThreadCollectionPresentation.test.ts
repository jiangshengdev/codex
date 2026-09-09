import { expect, test } from "vitest";
import {
  activeThreadSessionSnapshot,
  projectionUnavailableActiveThreadSessionSnapshot,
} from "@/features/activeThreadSession/__tests__/activeThreadSessionHarness";
import type { ActiveThreadCollectionMember } from "@/features/activeThreadSession/activeThreadSessionCollectionContracts";
import { activeThreadMemberHasError } from "../activeThreadCollectionPresentation";

const active = activeThreadSessionSnapshot();
const member = (
  overrides: Partial<ActiveThreadCollectionMember> = {},
): ActiveThreadCollectionMember => ({
  threadId: active.threadId,
  phase: "ready",
  snapshot: active,
  error: null,
  operationErrors: [],
  canRemove: true,
  removalBlockers: [],
  retryAction: "status",
  retryPending: false,
  removalPending: false,
  ...overrides,
});

test.each([
  member({
    phase: "initializing",
    snapshot: null,
    canRemove: false,
    removalBlockers: ["initializing"],
  }),
  member({ phase: "removalPending" }),
  member({
    snapshot: activeThreadSessionSnapshot({ threadStatus: null }),
    canRemove: false,
    removalBlockers: ["statusUnknown"],
  }),
  member({ snapshot: activeThreadSessionSnapshot({ threadStatus: { type: "notLoaded" } }) }),
  member({
    snapshot: activeThreadSessionSnapshot({ threadStatus: { type: "active", activeFlags: [] } }),
  }),
  member({
    snapshot: activeThreadSessionSnapshot({
      threadStatus: { type: "active", activeFlags: ["waitingOnApproval"] },
    }),
  }),
  member({
    snapshot: activeThreadSessionSnapshot({
      threadStatus: { type: "active", activeFlags: ["waitingOnUserInput"] },
    }),
  }),
  member({
    snapshot: activeThreadSessionSnapshot({
      composer: {
        ...active.composer,
        persistence: { ...active.composer.persistence, restoredPaused: true },
      },
    }),
  }),
  member(),
])("does not mark normal activity or missing status as an error: %#", (value) => {
  expect(activeThreadMemberHasError(value)).toBe(false);
});

test.each([
  member({ phase: "failed", snapshot: null }),
  member({ phase: "cleanupPending", snapshot: null, error: new Error("cleanup failed") }),
  member({ operationErrors: [{ operation: "navigation", error: new Error("navigation failed") }] }),
  member({ operationErrors: [{ operation: "remove", error: new Error("remove failed") }] }),
  member({ snapshot: projectionUnavailableActiveThreadSessionSnapshot() }),
  member({ snapshot: activeThreadSessionSnapshot({ threadStatus: { type: "systemError" } }) }),
  member({
    snapshot: activeThreadSessionSnapshot({
      composer: {
        ...active.composer,
        persistence: { ...active.composer.persistence, error: "save failed" },
      },
    }),
  }),
  member({
    snapshot: activeThreadSessionSnapshot({
      composer: {
        ...active.composer,
        persistence: {
          ...active.composer.persistence,
          unknownMessages: [{ id: "unknown", text: "message" }],
        },
      },
    }),
  }),
  member({
    snapshot: activeThreadSessionSnapshot({
      composer: { ...active.composer, hasUnknownSteer: true },
    }),
  }),
  member({
    snapshot: activeThreadSessionSnapshot({ composer: { ...active.composer, recoveryCount: 1 } }),
  }),
  member({
    snapshot: activeThreadSessionSnapshot({
      composer: {
        ...active.composer,
        rejectedSteers: [
          {
            key: "rejected",
            reason: "activeTurnNotSteerable",
            preview: { type: "text", text: "message", truncated: false },
          },
        ],
      },
    }),
  }),
])("marks unresolved task failures and message recovery states: %#", (value) => {
  expect(activeThreadMemberHasError(value)).toBe(true);
});

test("clearing one operation leaves the other unresolved operation marked", () => {
  const navigation = { operation: "navigation", error: new Error("failed") } as const;
  const remove = { operation: "remove", error: new Error("failed") } as const;
  expect(activeThreadMemberHasError(member({ operationErrors: [navigation, remove] }))).toBe(true);
  expect(activeThreadMemberHasError(member({ operationErrors: [remove] }))).toBe(true);
  expect(activeThreadMemberHasError(member({ operationErrors: [] }))).toBe(false);
});
