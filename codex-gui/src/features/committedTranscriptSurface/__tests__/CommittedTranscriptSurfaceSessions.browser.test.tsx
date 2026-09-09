import { expect, test } from "vitest";
import type { AppStore } from "@/app/store";
import type { ActiveThreadSessionIdentity } from "@/features/activeThreadSession/activeThreadSessionIdentity";
import {
  activeThreadReadModelSlotCreated,
  activeThreadReadModelSlotRemoved,
  activeThreadReadModelTransitionApplied,
} from "@/features/activeThreadSession/activeThreadSessionReadModel";
import { attachBaseline } from "@/features/projection/__tests__/projectionFixtures";
import {
  agentMessage,
  attachWithThreadId,
  attachWithTurns,
  baseTurn,
} from "@/features/projection/__tests__/projectionTestBuilders";
import { buildTranscriptStateFromTurns } from "@/features/transcriptState/transcriptStateImplementation";
import { renderWithProviders } from "@/utils/test-utils";
import {
  CommittedTranscriptSurface,
  ReadOnlyCommittedTranscriptSurface,
} from "../CommittedTranscriptSurface";
import { makeTranscriptStore } from "./transcriptSurfaceFixtures";

const first: ActiveThreadSessionIdentity = { threadId: "surface-first", instanceId: "first-owner" };
const second: ActiveThreadSessionIdentity = {
  threadId: "surface-second",
  instanceId: "second-owner",
};

function baseline(identity: ActiveThreadSessionIdentity, text: string) {
  return attachWithTurns(attachWithThreadId(attachBaseline, identity.threadId), [
    baseTurn(`${identity.threadId}-turn`, [agentMessage(`${identity.threadId}-message`, text)]),
  ]);
}

function publish(
  store: AppStore,
  identity: ActiveThreadSessionIdentity,
  revision: number,
  text: string,
) {
  store.dispatch(
    activeThreadReadModelTransitionApplied({
      identity,
      sessionRevision: revision,
      facts: [{ type: "baselineAttached", response: baseline(identity, text) }],
    }),
  );
}

test("keeps the viewed transcript DOM while another session updates and reveals its latest state when selected", async () => {
  const store = makeTranscriptStore(first);
  store.dispatch(activeThreadReadModelSlotCreated(second));
  publish(store, first, 1, "First session response");
  publish(store, second, 1, "Second session response");
  const screen = await renderWithProviders(<CommittedTranscriptSurface identity={first} />, {
    store,
  });

  await expect.element(screen.getByText("First session response")).toBeVisible();
  const foregroundMessage = screen.getByText("First session response").element();
  publish(store, second, 2, "Second session updated in background");
  await expect.element(screen.getByText("First session response")).toBeVisible();
  expect(screen.getByText("First session response").element()).toBe(foregroundMessage);
  await expect
    .element(screen.getByText("Second session updated in background"))
    .not.toBeInTheDocument();

  await screen.rerender(<CommittedTranscriptSurface identity={second} />);
  await expect.element(screen.getByText("Second session updated in background")).toBeVisible();
  await expect.element(screen.getByText("First session response")).not.toBeInTheDocument();
  publish(store, first, 2, "First session updated in background");
  await expect.element(screen.getByText("Second session updated in background")).toBeVisible();
  await screen.rerender(<CommittedTranscriptSurface identity={first} />);
  await expect.element(screen.getByText("First session updated in background")).toBeVisible();
});

test("keeps fixed history unchanged when the same thread has a live session update", async () => {
  const store = makeTranscriptStore(first);
  const transcriptState = buildTranscriptStateFromTurns(
    baseline(first, "Saved history response").snapshot.thread.turns,
  );
  const screen = await renderWithProviders(
    <ReadOnlyCommittedTranscriptSurface
      surfaceKey={first.threadId}
      transcriptState={transcriptState}
    />,
    { store },
  );
  await expect.element(screen.getByText("Saved history response")).toBeVisible();
  publish(store, first, 1, "Current live response");
  await expect.element(screen.getByText("Saved history response")).toBeVisible();
  await expect.element(screen.getByText("Current live response")).not.toBeInTheDocument();
  await screen.rerender(<CommittedTranscriptSurface identity={first} />);
  await expect.element(screen.getByText("Current live response")).toBeVisible();
});

test("preserves fixed-history interruption details while the live page owns its synchronization notice", async () => {
  const store = makeTranscriptStore(first);
  const saved = buildTranscriptStateFromTurns(
    baseline(first, "Saved interrupted response").snapshot.thread.turns,
  );
  const transcriptState = {
    ...saved,
    globalStatus: [
      {
        id: "saved-interruption",
        status: "subscriptionInterrupted" as const,
        reason: "backpressure" as const,
        subscriptionId: "saved-subscription",
      },
    ],
  };
  const screen = await renderWithProviders(
    <ReadOnlyCommittedTranscriptSurface
      surfaceKey={first.threadId}
      transcriptState={transcriptState}
    />,
    { store },
  );
  const notice = screen.getByText("Connection interrupted. Reconnect required.", { exact: true });
  await expect.element(notice).toBeVisible();
  await expect
    .element(screen.getByText("Saved interrupted response", { exact: true }))
    .toBeVisible();
  publish(store, first, 1, "Live interrupted response");
  store.dispatch(
    activeThreadReadModelTransitionApplied({
      identity: first,
      sessionRevision: 2,
      facts: [
        {
          type: "projectionUnavailable",
          reason: "backpressure",
          threadId: first.threadId,
          subscriptionId: "live-subscription",
        },
      ],
    }),
  );
  await expect.element(notice).toBeVisible();
  await screen.rerender(<CommittedTranscriptSurface identity={first} />);
  await expect
    .element(screen.getByText("Live interrupted response", { exact: true }))
    .toBeVisible();
  await expect.element(notice).not.toBeInTheDocument();
});

test("does not expose a replacement owner's transcript to an old mounted identity or accept its late transitions", async () => {
  const store = makeTranscriptStore(first);
  publish(store, first, 1, "Original owner response");
  const screen = await renderWithProviders(<CommittedTranscriptSurface identity={first} />, {
    store,
  });
  await expect.element(screen.getByText("Original owner response")).toBeVisible();

  const replacement: ActiveThreadSessionIdentity = { ...first, instanceId: "replacement-owner" };
  store.dispatch(activeThreadReadModelSlotRemoved(first));
  store.dispatch(activeThreadReadModelSlotCreated(replacement));
  publish(store, replacement, 1, "Replacement owner response");
  publish(store, first, 100, "Late original owner response");
  await expect.element(screen.getByText("No committed messages yet.")).toBeVisible();
  await expect.element(screen.getByText("Replacement owner response")).not.toBeInTheDocument();
  await expect.element(screen.getByText("Late original owner response")).not.toBeInTheDocument();

  await screen.rerender(<CommittedTranscriptSurface identity={replacement} />);
  await expect.element(screen.getByText("Replacement owner response")).toBeVisible();
  await expect.element(screen.getByText("Late original owner response")).not.toBeInTheDocument();
});
