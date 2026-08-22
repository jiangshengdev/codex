import { useState, type ComponentType } from "react";
import { Alert, Card, Separator, Typography } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  selectLastTranscriptFragmentIdsByTurnIdFromTranscriptState,
  selectTranscriptContextPageFromTranscriptState,
  selectTranscriptContextPageIdsFromTranscriptState,
  selectTranscriptGlobalStatusFromTranscriptState,
  selectTranscriptTurnFragmentFromTranscriptState,
  selectTranscriptTurnFromTranscriptState,
} from "@/features/transcriptState/transcriptStateSelectors";
import { TranscriptContextPagination } from "./TranscriptContextPagination";
import { useTranscriptSelector } from "./TranscriptReadContext";

export type CommittedTranscriptTurnFragmentRendererProps = Readonly<{
  fragmentId: string;
  lastFragmentIdsByTurnId: Record<string, string>;
}>;

type CommittedTranscriptSurfaceRendererProps = Readonly<{
  turnFragmentRenderer: ComponentType<CommittedTranscriptTurnFragmentRendererProps>;
}>;

export const CommittedTranscriptSurfaceRenderer = ({
  turnFragmentRenderer: TurnFragmentRenderer,
}: CommittedTranscriptSurfaceRendererProps) => {
  const { t } = useLingui();
  const pageIds = useTranscriptSelector(selectTranscriptContextPageIdsFromTranscriptState);
  const globalStatus = useTranscriptSelector(selectTranscriptGlobalStatusFromTranscriptState);
  const lastFragmentIdsByTurnId = useTranscriptSelector(
    selectLastTranscriptFragmentIdsByTurnIdFromTranscriptState,
  );
  const totalPages = pageIds.length;
  const [pageSelection, setPageSelection] = useState<{
    page: number | null;
    totalPages: number;
  }>(() => ({ page: null, totalPages }));
  if (pageSelection.totalPages !== totalPages) {
    setPageSelection({
      page: pageSelection.page == null ? null : Math.min(pageSelection.page, totalPages),
      totalPages,
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
      aria-label={t({
        comment: "Accessible name for the region containing committed transcript turns",
        message: "Committed transcript",
      })}
      className="committed-transcript-surface mx-auto grid min-w-0 w-full max-w-3xl gap-4 pt-3"
    >
      {globalStatus.length > 0 ? (
        <div className="committed-transcript-status-list grid min-w-0 gap-2">
          {globalStatus.map((status) => (
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
      {currentPage?.leadingBoundaryId == null ? null : (
        <div className="committed-transcript-context-boundary grid min-w-0 gap-2">
          <Separator variant="tertiary" />
          <Typography color="muted" type="body-sm">
            <Trans>Context compressed</Trans>
          </Typography>
        </div>
      )}
      {!hasSurfaceContent ? (
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
            <TurnFragmentRenderer
              fragmentId={fragmentId}
              key={fragmentId}
              lastFragmentIdsByTurnId={lastFragmentIdsByTurnId}
            />
          ))}
        </div>
      )}
      <TranscriptContextPagination
        onPageChange={(page) => {
          setPageSelection({ page: page === totalPages ? null : page, totalPages });
        }}
        page={currentPageNumber}
        totalPages={totalPages}
      />
    </section>
  );
};
