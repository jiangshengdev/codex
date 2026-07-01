use crate::thread_projection::ProjectionGeneration;

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct ProjectionSnapshotCut {
    pub(crate) generation: ProjectionGeneration,
    pub(crate) head_commit_id: Option<String>,
}
