import { expect, test, vi } from "vitest";
import type {
  ActiveThreadCompactionRole,
  ActiveThreadSessionSnapshot,
} from "@/features/activeThreadSession/activeThreadSession";
import type { ActiveThreadCompactionView } from "@/features/activeThreadSession/activeThreadSessionContracts";
import { createActiveThreadSessionHarness } from "@/features/activeThreadSession/__tests__/activeThreadSessionHarness";
import { renderWithProviders } from "@/utils/test-utils";
import { ComposerTurnControl } from "../ComposerTurnControl";

const threadId = "thread-composer-compaction";

type ActiveSnapshot = Extract<ActiveThreadSessionSnapshot, { phase: "active" }>;

const composer = (sessionSnapshot: ActiveSnapshot) => (
  <ComposerTurnControl
    authorizationToken={null}
    guardCompositionEndEnter={false}
    routeTarget={{ type: "currentTask", threadId }}
    sessionSnapshot={sessionSnapshot}
  />
);

test("routes context compression through the session role and follows session state", async () => {
  const requestCompaction = vi
    .fn<ActiveThreadCompactionRole["requestCompaction"]>()
    .mockReturnValue({ type: "accepted" });
  const sessionHarness = createActiveThreadSessionHarness({
    compactionRole: { requestCompaction },
  });
  const initialRevision = 17;
  const initial = sessionHarness.activeSnapshot({
    revision: initialRevision,
    threadId,
    compaction: { phase: "idle", canRequest: true, startFailure: null },
  });
  const screen = await renderWithProviders(composer(initial));
  const idleTrigger = screen.getByRole("button", {
    name: "Context usage details, usage unavailable",
    exact: true,
  });

  idleTrigger.element().focus();
  await expect.element(idleTrigger).toHaveFocus();
  await screen.user.keyboard("{Enter}");

  const dialog = screen.getByRole("dialog", { name: "Context usage", exact: true });
  const action = dialog.getByRole("button", { name: "Compress context", exact: true });
  await expect.element(action).toBeEnabled();
  await action.click();

  expect(requestCompaction).toHaveBeenCalledExactlyOnceWith(initialRevision);

  const requestPending = {
    phase: "requestPending",
    claimId: "claim-composer",
    candidateTurnId: null,
  } satisfies ActiveThreadCompactionView;
  await screen.rerender(
    composer(
      sessionHarness.activeSnapshot({
        revision: initialRevision + 1,
        threadId,
        compaction: requestPending,
      }),
    ),
  );

  const pendingTrigger = screen.getByRole("button", {
    name: "Context compression in progress",
    exact: true,
  });
  await expect.element(pendingTrigger).toBeEnabled();
  await expect.element(pendingTrigger).toHaveTextContent("Compressing");
  const pendingAction = dialog.getByRole("button", { name: "Compressing", exact: true });
  await expect.element(pendingAction).toBeDisabled();
  await expect.element(pendingAction).toHaveAttribute("data-pending");

  await screen.rerender(
    composer(
      sessionHarness.activeSnapshot({
        revision: initialRevision + 2,
        threadId,
        compaction: {
          phase: "running",
          turnId: "turn-composer-compaction",
          itemId: "item-composer-compaction",
        },
      }),
    ),
  );

  await expect.element(pendingTrigger).toBeEnabled();
  await expect.element(pendingAction).toBeDisabled();
  expect(requestCompaction).toHaveBeenCalledOnce();

  await screen.rerender(
    composer(
      sessionHarness.activeSnapshot({
        revision: initialRevision + 3,
        threadId,
        compaction: {
          phase: "idle",
          canRequest: true,
          startFailure: "transport detail must stay private",
        },
      }),
    ),
  );

  const failure = dialog.getByRole("alert");
  await expect
    .element(failure.getByText("Context compression could not be started.", { exact: true }))
    .toBeVisible();
  expect(dialog.element().textContent).not.toContain("transport detail must stay private");
});
