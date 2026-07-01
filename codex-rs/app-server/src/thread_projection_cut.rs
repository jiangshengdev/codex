use codex_protocol::protocol::RolloutItem;
use codex_thread_store::StoredHistoryBoundary;

use crate::thread_projection::ProjectionGeneration;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) struct ProjectionHistoryBoundary {
    boundary: StoredHistoryBoundary,
}

impl ProjectionHistoryBoundary {
    pub(crate) fn new(boundary: StoredHistoryBoundary) -> Self {
        Self { boundary }
    }

    pub(crate) fn truncate_history(self, history: &mut Vec<RolloutItem>) {
        history.truncate(self.boundary.physical_item_count_for_logs());
    }
}

impl Default for ProjectionHistoryBoundary {
    fn default() -> Self {
        Self::new(StoredHistoryBoundary::new(0))
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct ProjectionSnapshotCut {
    pub(crate) generation: ProjectionGeneration,
    pub(crate) head_commit_id: Option<String>,
    pub(crate) history_boundary: ProjectionHistoryBoundary,
}
