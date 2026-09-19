import { Trans } from "@lingui/react/macro";
import { useEffect, useRef } from "react";
import type { ActiveThreadComposerRole } from "@/features/activeThreadSession/activeThreadSession";
import { useComposerPendingInput } from "@/features/composerTurnControl/composerPendingInputHost";
import { PendingInputPreview, PendingInputScenarioView } from "../PendingInputScenarioView";
import {
  createPendingInputScenario,
  type PendingInputScenarioOptions,
} from "../pendingInputScenario";
import { DevOnly } from "../../DevOnly";

type ReorderingOptions = Pick<
  PendingInputScenarioOptions,
  "ordinaryCount" | "guidingCount" | "mixedText"
> &
  Readonly<{
    failure?: "notApplied" | "refreshFailed";
    showFailureInitially?: boolean;
    openInitially?: boolean;
    mutationsEnabled?: boolean;
  }>;

function createReorderingScenario({
  failure,
  ordinaryCount,
  guidingCount,
  mixedText,
}: ReorderingOptions) {
  const scenario = createPendingInputScenario({ ordinaryCount, guidingCount, mixedText });
  let failNextMove = failure != null;
  let staleReadsRemaining = 0;
  const role: ActiveThreadComposerRole = {
    ...scenario.role,
    movePendingInput(revision, request) {
      if (!failNextMove) return scenario.role.movePendingInput(revision, request);
      failNextMove = false;
      if (failure === "notApplied") {
        return {
          type: "notManageable",
          scope: "liveOwner",
          revision: scenario.coordinator.getSnapshot().detailRevision,
        };
      }
      const result = scenario.role.movePendingInput(revision, request);
      // Exhaust both refresh attempts and the initial-prefix fallback. Only reads
      // are injected: the move above has already changed the real coordinator.
      if (result.type === "moved") staleReadsRemaining = 3;
      return result;
    },
    readPendingInputPage(request) {
      if (staleReadsRemaining > 0) {
        staleReadsRemaining--;
        return { type: "stale", revision: scenario.coordinator.getSnapshot().detailRevision };
      }
      return scenario.role.readPendingInputPage(request);
    },
  };
  return { ...scenario, role };
}

function InitialState({ move }: Readonly<{ move: boolean }>) {
  const host = useComposerPendingInput();
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current) return;
    const connection = host.getSnapshot().connection;
    if (connection == null) return;
    initialized.current = true;
    const facts = connection.binding;
    host.session.open(facts);
    if (!move) return;
    const page = facts.composerRole.readPendingInputPage({
      lane: "ordinary",
      revision: facts.snapshot.detailRevision,
      cursor: null,
      limit: 20,
    });
    if (page.type === "page" && page.items[1] != null)
      host.session.moveItem(facts, page.items[1], "earlier");
  }, [host, move]);
  return null;
}

function FailureDescription({ failure }: Pick<ReorderingOptions, "failure">) {
  if (failure == null) return null;
  return (
    <DevOnly>
      <p className="text-sm text-muted">
        {failure === "notApplied" ? (
          <Trans comment="Explains the bounded role-interface failure in the queue sorting Story">
            Injected feedback: the first move is rejected without changing the queue. Later moves
            use the real queue.
          </Trans>
        ) : (
          <Trans comment="Explains that only post-move page reads are injected in this Story">
            Injected feedback: the first move changes the real queue, then its refreshed list cannot
            load. Close and reopen the queue to read the updated order.
          </Trans>
        )}
      </p>
    </DevOnly>
  );
}

export function PendingInputReorderingPreview(options: ReorderingOptions) {
  return (
    <PendingInputPreview
      key={JSON.stringify(options)}
      createScenario={() => createReorderingScenario(options)}
      renderDrawerControls={() => <FailureDescription failure={options.failure} />}
    >
      {(scenario) => (
        <PendingInputScenarioView scenario={scenario} mutationsEnabled={options.mutationsEnabled}>
          <FailureDescription failure={options.failure} />
          {options.showFailureInitially || options.openInitially ? (
            <InitialState move={options.showFailureInitially ?? false} />
          ) : null}
        </PendingInputScenarioView>
      )}
    </PendingInputPreview>
  );
}
