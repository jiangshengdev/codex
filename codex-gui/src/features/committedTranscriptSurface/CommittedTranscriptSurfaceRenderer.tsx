import { useState, type ComponentType } from "react";
import { Alert, Card, Typography } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  selectLastTranscriptFragmentIdsByTurnIdFromTranscriptState,
  selectTranscriptContextPageFromTranscriptState,
  selectTranscriptContextPageIdsFromTranscriptState,
  selectTranscriptGlobalStatusFromTranscriptState,
  selectTranscriptTurnFragmentFromTranscriptState,
  selectTranscriptTurnFromTranscriptState,
} from "@/features/transcriptState/transcriptStateSelectors";
import { TranscriptContextBoundary } from "./TranscriptContextBoundary";
import { TranscriptContextPagination } from "./TranscriptContextPagination";
import { useTranscriptSelector } from "./TranscriptReadContext";
import type { TurnPositionRequest } from "@/features/browserLaunch/useTurnPositionRequest";
import { useTurnPositionScroll } from "./useTurnPositionScroll";

export type CommittedTranscriptTurnFragmentRendererProps = Readonly<{
  fragmentId: string;
  lastFragmentIdsByTurnId: Record<string, string>;
}>;

type CommittedTranscriptSurfaceRendererProps = Readonly<{
  turnPosition?: TurnPositionRequest | null;
  onPositionComplete?: (request: TurnPositionRequest) => void;
  subscriptionInterruptionHandled: boolean;
  turnFragmentRenderer: ComponentType<CommittedTranscriptTurnFragmentRendererProps>;
}>;

export const CommittedTranscriptSurfaceRenderer = ({
  turnPosition = null,
  onPositionComplete,
  subscriptionInterruptionHandled,
  turnFragmentRenderer: TurnFragmentRenderer,
}: CommittedTranscriptSurfaceRendererProps) => {
  const { t } = useLingui();
  const pageIds = useTranscriptSelector(selectTranscriptContextPageIdsFromTranscriptState);
  const globalStatus = useTranscriptSelector(selectTranscriptGlobalStatusFromTranscriptState);
  const globalStatusVisibility = {
    subscriptionInterrupted: !subscriptionInterruptionHandled,
  } satisfies Record<(typeof globalStatus)[number]["status"], boolean>;
  const visibleGlobalStatus = globalStatus.filter(
    (status) => globalStatusVisibility[status.status],
  );
  const lastFragmentIdsByTurnId = useTranscriptSelector(
    selectLastTranscriptFragmentIdsByTurnIdFromTranscriptState,
  );
  const totalPages = pageIds.length;
  const targetFound = useTranscriptSelector(
    (state) =>
      turnPosition != null &&
      selectTranscriptTurnFromTranscriptState(state, turnPosition.turnId) != null,
  );
  const targetFragmentId = useTranscriptSelector((state) => {
    if (turnPosition == null || !targetFound) return undefined;
    const fragmentId = lastFragmentIdsByTurnId[turnPosition.turnId];
    if (fragmentId != null) return fragmentId;
    // A turn with no entries still exists. Its end is the boundary immediately
    // after the preceding rendered turn, not a missing-turn fallback.
    for (let index = state.turnIds.indexOf(turnPosition.turnId) - 1; index >= 0; index -= 1) {
      const previous = lastFragmentIdsByTurnId[state.turnIds[index] ?? ""];
      if (previous != null) return previous;
    }
    return undefined;
  });
  const targetPageIndex = useTranscriptSelector((state) =>
    targetFragmentId == null
      ? -1
      : pageIds.findIndex((id) =>
          selectTranscriptContextPageFromTranscriptState(state, id)?.turnFragmentIds.includes(
            targetFragmentId,
          ),
        ),
  );
  const { surfaceRef, targetRef } = useTurnPositionScroll({
    request: turnPosition,
    targetFound,
    onComplete: onPositionComplete,
  });
  const [pageSelection, setPageSelection] = useState<{
    page: number | null;
    totalPages: number;
    request: TurnPositionRequest | null;
  }>(() => ({
    page:
      targetFound && targetPageIndex < 0
        ? 1
        : targetPageIndex < 0 || targetPageIndex === totalPages - 1
          ? null
          : targetPageIndex + 1,
    totalPages,
    request: turnPosition,
  }));
  if (pageSelection.request !== turnPosition || pageSelection.totalPages !== totalPages) {
    setPageSelection({
      page:
        pageSelection.request !== turnPosition
          ? targetFound && targetPageIndex < 0
            ? 1
            : targetPageIndex < 0 || targetPageIndex === totalPages - 1
              ? null
              : targetPageIndex + 1
          : pageSelection.page == null
            ? null
            : Math.min(pageSelection.page, totalPages),
      totalPages,
      request: turnPosition,
    });
  }
  const currentPageNumber =
    pageSelection.page == null ? totalPages : Math.min(pageSelection.page, totalPages);
  const currentPageId = pageIds[currentPageNumber - 1] ?? "";
  const currentPage = useTranscriptSelector((state) =>
    selectTranscriptContextPageFromTranscriptState(state, currentPageId),
  );
  const hasSurfaceContent = useTranscriptSelector((state) => {
    if (currentPage == null) {
      return false;
    }
    if (currentPage.leadingBoundaryId != null) {
      return true;
    }
    return currentPage.turnFragmentIds.some((fragmentId) => {
      const fragment = selectTranscriptTurnFragmentFromTranscriptState(state, fragmentId);
      if (fragment == null) {
        return false;
      }
      const turn = selectTranscriptTurnFromTranscriptState(state, fragment.turnId);
      return (
        fragment.leadingPromptEntryId != null ||
        fragment.middleEntryCount > 0 ||
        fragment.finalAssistantEntryIds.length > 0 ||
        (turn?.error != null && lastFragmentIdsByTurnId[fragment.turnId] === fragment.id)
      );
    });
  });

  return (
    <section
      ref={surfaceRef}
      aria-label={t({
        comment: "Accessible name for the region containing committed transcript turns",
        message: "Committed transcript",
      })}
      className="committed-transcript-surface grid min-w-0 gap-4"
    >
      {targetFound && targetFragmentId == null ? (
        <div aria-hidden="true" className="h-0" ref={targetRef} />
      ) : null}
      {visibleGlobalStatus.length > 0 ? (
        <div className="committed-transcript-status-list grid min-w-0 gap-2">
          {visibleGlobalStatus.map((status) => (
            <Alert
              className="committed-transcript-status"
              key={status.id}
              role="status"
              status="danger"
            >
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>
                  <Trans>Connection interrupted. Reconnect required.</Trans>
                </Alert.Title>
              </Alert.Content>
            </Alert>
          ))}
        </div>
      ) : null}
      {currentPage?.leadingBoundaryId == null ? null : <TranscriptContextBoundary />}
      {!hasSurfaceContent && targetFragmentId == null ? (
        <Card className="committed-transcript-empty">
          <Card.Content>
            <Typography color="muted" type="body-sm">
              <Trans>No committed messages yet.</Trans>
            </Typography>
          </Card.Content>
        </Card>
      ) : (
        <div className="committed-transcript-turn-list grid min-w-0 gap-6">
          {currentPage?.turnFragmentIds.map((fragmentId) => (
            <div key={fragmentId} ref={fragmentId === targetFragmentId ? targetRef : undefined}>
              <TurnFragmentRenderer
                fragmentId={fragmentId}
                lastFragmentIdsByTurnId={lastFragmentIdsByTurnId}
              />
            </div>
          ))}
        </div>
      )}
      <TranscriptContextPagination
        onPageChange={(page) => {
          setPageSelection({
            page: page === totalPages ? null : page,
            totalPages,
            request: turnPosition,
          });
        }}
        page={currentPageNumber}
        totalPages={totalPages}
      />
    </section>
  );
};
