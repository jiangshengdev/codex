use crate::thread_projection::ProjectionGeneration;

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub(crate) struct ProjectionHistoryCursor {
    item_count: usize,
}

impl ProjectionHistoryCursor {
    pub(crate) fn new(item_count: usize) -> Self {
        Self { item_count }
    }

    pub(crate) fn item_count(self) -> usize {
        self.item_count
    }

    pub(crate) fn advance_by(self, item_count: usize) -> Self {
        Self {
            item_count: self.item_count.saturating_add(item_count),
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct ProjectionSnapshotCut {
    pub(crate) generation: ProjectionGeneration,
    pub(crate) head_commit_id: Option<String>,
    pub(crate) history_cursor: ProjectionHistoryCursor,
}
