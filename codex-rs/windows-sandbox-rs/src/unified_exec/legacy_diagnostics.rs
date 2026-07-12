mod win32;
mod win32_acl;

pub(crate) use win32::snapshot_token;
pub(crate) use win32_acl::snapshot_path_security;

use crate::acl::{AclFailureDisposition, AclMutationAttempt};
use crate::path_normalization::canonicalize_path;
use crate::spawn_prep::RootCapabilitySid;
use codex_utils_pty::SpawnedProcess;
use std::collections::BTreeSet;
use std::fmt::Write as _;
use std::path::{Path, PathBuf};
use windows_sys::Win32::Foundation::HANDLE;
const DEFAULT_MAX_PATHS: usize = 24;
const DEFAULT_MAX_ACES_PER_PATH: usize = 64;
const DEFAULT_MAX_GROUPS: usize = 128;
const DEFAULT_MAX_RESTRICTED_SIDS: usize = 128;
const DEFAULT_MAX_OPERATIONS: usize = 128;
const DEFAULT_MAX_ERRORS: usize = 128;
const DEFAULT_MAX_REPORT_BYTES: usize = 128 * 1024;
const REPORT_TRUNCATED_MARKER: &str = "[report truncated]\n";
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct DiagnosticsLimits {
    pub(crate) max_paths: usize,
    pub(crate) max_aces_per_path: usize,
    pub(crate) max_groups: usize,
    pub(crate) max_restricted_sids: usize,
    pub(crate) max_operations: usize,
    pub(crate) max_errors: usize,
    pub(crate) max_report_bytes: usize,
}
impl Default for DiagnosticsLimits {
    fn default() -> Self {
        Self {
            max_paths: DEFAULT_MAX_PATHS,
            max_aces_per_path: DEFAULT_MAX_ACES_PER_PATH,
            max_groups: DEFAULT_MAX_GROUPS,
            max_restricted_sids: DEFAULT_MAX_RESTRICTED_SIDS,
            max_operations: DEFAULT_MAX_OPERATIONS,
            max_errors: DEFAULT_MAX_ERRORS,
            max_report_bytes: DEFAULT_MAX_REPORT_BYTES,
        }
    }
}
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub(crate) enum SidRole {
    User,
    Logon,
    Everyone,
    Capability,
}
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct SidSnapshot {
    pub(crate) sid: String,
    pub(crate) attributes: u32,
    pub(crate) roles: Vec<SidRole>,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub(crate) enum AclSnapshotStage {
    BeforeAcl,
    AfterAcl,
}
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub(crate) enum AceKind {
    Allow,
    Deny,
    Unknown(u8),
}
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub(crate) struct AceSnapshot {
    pub(crate) index: u32,
    pub(crate) kind: AceKind,
    pub(crate) sid: Option<String>,
    pub(crate) mask: Option<u32>,
    pub(crate) flags: u8,
    pub(crate) parse_error: Option<String>,
}
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub(crate) struct PathAclSnapshot {
    pub(crate) stage: AclSnapshotStage,
    pub(crate) path: PathBuf,
    pub(crate) owner_sid: Option<String>,
    pub(crate) control: Option<u16>,
    pub(crate) dacl_present: Option<bool>,
    /// `None` when no DACL is present; otherwise whether the present DACL is null.
    pub(crate) dacl_is_null: Option<bool>,
    pub(crate) dacl_defaulted: Option<bool>,
    pub(crate) aces: Vec<AceSnapshot>,
    pub(crate) total_aces: usize,
}
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct TokenSnapshot {
    pub(crate) user: SidSnapshot,
    pub(crate) groups: Vec<SidSnapshot>,
    pub(crate) restricted_sids: Vec<SidSnapshot>,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub(crate) enum DiagnosticStage {
    Token,
    BeforeAcl,
    AclOperation,
    AfterAcl,
    Render,
}
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct DiagnosticError {
    pub(crate) stage: DiagnosticStage,
    pub(crate) path: Option<PathBuf>,
    pub(crate) api: &'static str,
    pub(crate) code: Option<u32>,
    pub(crate) message: String,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum LegacyAclOperationKind {
    AllowReadonly,
    EnsureAllowWrite,
    DenyWrite,
    ProtectWorkspaceCodex,
    ProtectWorkspaceAgents,
}
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum LegacyFailureDispositionSnapshot {
    ReturnError,
    ReturnUnchanged,
}
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum LegacyAclOperationOutcome {
    Changed,
    Unchanged,
    SkippedMissing,
    Failed {
        api: &'static str,
        code: u32,
        disposition: LegacyFailureDispositionSnapshot,
    },
}
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct LegacyAclOperation {
    pub(crate) kind: LegacyAclOperationKind,
    pub(crate) path: PathBuf,
    pub(crate) sid: String,
    pub(crate) outcome: LegacyAclOperationOutcome,
}
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub(crate) struct DiagnosticsTruncation {
    pub(crate) original_paths: usize,
    pub(crate) omitted_ancestors: usize,
    pub(crate) omitted_groups: usize,
    pub(crate) omitted_restricted_sids: usize,
    pub(crate) omitted_operations: usize,
    pub(crate) omitted_errors: usize,
    pub(crate) report_truncated: bool,
}
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub(crate) struct LegacyDiagnosticsCapture {
    pub(crate) token: Option<TokenSnapshot>,
    pub(crate) capability_roots: Vec<(PathBuf, String)>,
    pub(crate) operations: Vec<LegacyAclOperation>,
    pub(crate) paths: Vec<PathAclSnapshot>,
    pub(crate) errors: Vec<DiagnosticError>,
    pub(crate) omitted_operations: usize,
    pub(crate) omitted_errors: usize,
    pub(crate) original_paths: usize,
    pub(crate) omitted_ancestors: usize,
}
pub(crate) enum LegacyDiagnosticsRequest {
    Disabled,
    Capture { observed_paths: Vec<PathBuf> },
}
pub(crate) enum LegacyDiagnosticsCollector {
    Disabled,
    Capture {
        observed_paths: Vec<PathBuf>,
        capture: LegacyDiagnosticsCapture,
        limits: DiagnosticsLimits,
    },
}
impl LegacyDiagnosticsCollector {
    pub(crate) fn from_request(request: LegacyDiagnosticsRequest) -> Self {
        match request {
            LegacyDiagnosticsRequest::Disabled => Self::Disabled,
            LegacyDiagnosticsRequest::Capture { observed_paths } => {
                let limits = DiagnosticsLimits::default();
                let (observed_paths, original_paths, omitted_ancestors) =
                    prepare_observed_paths(observed_paths, limits.max_paths);
                Self::Capture {
                    observed_paths,
                    capture: LegacyDiagnosticsCapture {
                        original_paths,
                        omitted_ancestors,
                        ..LegacyDiagnosticsCapture::default()
                    },
                    limits,
                }
            }
        }
    }
    pub(crate) fn disabled() -> Self {
        Self::Disabled
    }
    pub(crate) fn capture(observed_paths: Vec<PathBuf>) -> Self {
        Self::Capture {
            observed_paths,
            capture: LegacyDiagnosticsCapture::default(),
            limits: DiagnosticsLimits::default(),
        }
    }
    pub(crate) fn capture_token(
        &mut self,
        token: HANDLE,
        write_root_sids: &[RootCapabilitySid],
    ) {
        let Self::Capture {
            capture, limits, ..
        } = self
        else {
            return;
        };
        capture.capability_roots = write_root_sids
            .iter()
            .map(|root_sid| (root_sid.root.clone(), root_sid.sid_str.clone()))
            .collect();
        match unsafe { snapshot_token(token, &capture.capability_roots) } {
            Ok(token_snapshot) => capture.token = Some(token_snapshot),
            Err(error) => Self::record_error(capture, limits.max_errors, error),
        }
    }
    pub(crate) fn capture_paths(&mut self, stage: AclSnapshotStage) {
        let Self::Capture {
            observed_paths,
            capture,
            limits,
        } = self
        else {
            return;
        };
        for path in observed_paths.iter() {
            match snapshot_path_security(path, stage) {
                Ok(path_snapshot) => capture.paths.push(path_snapshot),
                Err(error) => Self::record_error(capture, limits.max_errors, error),
            }
        }
    }
    fn record_error(
        capture: &mut LegacyDiagnosticsCapture,
        max_errors: usize,
        error: DiagnosticError,
    ) {
        if capture.errors.len() >= max_errors {
            capture.omitted_errors = capture.omitted_errors.saturating_add(1);
        } else {
            capture.errors.push(error);
        }
    }
    pub(crate) fn record_acl_attempt(
        &mut self,
        kind: LegacyAclOperationKind,
        path: &Path,
        sid: &str,
        attempt: &AclMutationAttempt,
    ) {
        let Self::Capture {
            capture, limits, ..
        } = self
        else {
            return;
        };
        if capture.operations.len() >= limits.max_operations {
            capture.omitted_operations = capture.omitted_operations.saturating_add(1);
            return;
        }
        let outcome = match attempt {
            AclMutationAttempt::Changed => LegacyAclOperationOutcome::Changed,
            AclMutationAttempt::Unchanged => LegacyAclOperationOutcome::Unchanged,
            AclMutationAttempt::Failed {
                api,
                code,
                disposition,
            } => LegacyAclOperationOutcome::Failed {
                api: *api,
                code: *code,
                disposition: match disposition {
                    AclFailureDisposition::ReturnError => {
                        LegacyFailureDispositionSnapshot::ReturnError
                    }
                    AclFailureDisposition::ReturnUnchanged => {
                        LegacyFailureDispositionSnapshot::ReturnUnchanged
                    }
                },
            },
        };
        capture.operations.push(LegacyAclOperation {
            kind,
            path: path.to_path_buf(),
            sid: sid.to_string(),
            outcome,
        });
    }
    pub(crate) fn record_acl_skipped_missing(
        &mut self,
        kind: LegacyAclOperationKind,
        path: &Path,
        sid: &str,
    ) {
        let Self::Capture {
            capture, limits, ..
        } = self
        else {
            return;
        };
        if capture.operations.len() >= limits.max_operations {
            capture.omitted_operations = capture.omitted_operations.saturating_add(1);
            return;
        }
        capture.operations.push(LegacyAclOperation {
            kind,
            path: path.to_path_buf(),
            sid: sid.to_string(),
            outcome: LegacyAclOperationOutcome::SkippedMissing,
        });
    }
    pub(crate) fn finish(self) -> LegacyDiagnosticsOutput {
        match self {
            Self::Disabled => LegacyDiagnosticsOutput::Disabled,
            Self::Capture {
                capture, limits, ..
            } => LegacyDiagnosticsOutput::Captured(LegacyDiagnosticsReport::freeze(
                capture, limits,
            )),
        }
    }
}
pub(crate) struct LegacySpawnWithDiagnostics {
    pub(crate) spawned: SpawnedProcess,
    pub(crate) report: LegacyDiagnosticsReport,
}
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct LegacyDiagnosticsReport {
    pub(crate) token: Option<TokenSnapshot>,
    pub(crate) capability_roots: Vec<(PathBuf, String)>,
    pub(crate) operations: Vec<LegacyAclOperation>,
    pub(crate) paths: Vec<PathAclSnapshot>,
    pub(crate) errors: Vec<DiagnosticError>,
    pub(crate) truncation: DiagnosticsTruncation,
    limits: DiagnosticsLimits,
}
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum LegacyDiagnosticsOutput {
    Disabled,
    Captured(LegacyDiagnosticsReport),
}
impl LegacyDiagnosticsReport {
    pub(crate) fn freeze(
        mut capture: LegacyDiagnosticsCapture,
        limits: DiagnosticsLimits,
    ) -> Self {
        let targets = capture
            .capability_roots
            .iter()
            .map(|(path, _)| windows_path_key(path))
            .chain(capture.operations.iter().map(|op| windows_path_key(&op.path)))
            .collect::<BTreeSet<_>>();
        let mut truncation = DiagnosticsTruncation::default();
        if let Some(token) = capture.token.as_mut() {
            truncation.omitted_groups = freeze_sids(&mut token.groups, limits.max_groups);
            truncation.omitted_restricted_sids =
                freeze_sids(&mut token.restricted_sids, limits.max_restricted_sids);
        }
        capture.capability_roots.sort_by_key(|(path, sid)| {
            (windows_path_key(path), path_text(path), sid.clone())
        });
        truncation.omitted_operations = capture.omitted_operations.saturating_add(truncate(
            &mut capture.operations,
            limits.max_operations,
        ));
        capture.errors.sort_by_key(|error| {
            (
                error.stage,
                error.path.as_deref().map(path_sort_key),
                error.api,
                error.code,
                error.message.clone(),
            )
        });
        truncation.omitted_errors = capture
            .omitted_errors
            .saturating_add(truncate(&mut capture.errors, limits.max_errors));
        let (paths, snapshot_original_paths, snapshot_omitted_ancestors) =
            freeze_paths(capture.paths, &targets, limits.max_paths, limits.max_aces_per_path);
        truncation.original_paths = capture.original_paths.max(snapshot_original_paths);
        truncation.omitted_ancestors = capture
            .omitted_ancestors
            .saturating_add(snapshot_omitted_ancestors);
        Self {
            token: capture.token,
            capability_roots: capture.capability_roots,
            operations: capture.operations,
            paths,
            errors: capture.errors,
            truncation,
            limits,
        }
    }
    pub(crate) fn render(&self) -> String {
        let sections = self.render_sections();
        if sections.iter().map(String::len).sum::<usize>() <= self.limits.max_report_bytes {
            return sections.concat();
        }
        let Some(limit) = self
            .limits
            .max_report_bytes
            .checked_sub(REPORT_TRUNCATED_MARKER.len())
        else {
            return String::new();
        };
        let mut output = String::new();
        for section in sections {
            if output.len().saturating_add(section.len()) > limit {
                break;
            }
            output.push_str(&section);
        }
        output.push_str(REPORT_TRUNCATED_MARKER);
        output
    }
    fn render_sections(&self) -> Vec<String> {
        let mut sections = vec![String::from("legacy diagnostics\n")];
        if let Some(token) = &self.token {
            let mut section = String::from("token\n");
            push_sid(&mut section, "user", &token.user);
            token.groups.iter().for_each(|sid| push_sid(&mut section, "group", sid));
            token
                .restricted_sids
                .iter()
                .for_each(|sid| push_sid(&mut section, "restricted", sid));
            sections.push(section);
        }
        if !self.capability_roots.is_empty() {
            let mut section = String::from("capability roots\n");
            for (path, sid) in &self.capability_roots {
                let _ = writeln!(section, "  {} -> {sid}", path.display());
            }
            sections.push(section);
        }
        if !self.operations.is_empty() {
            let mut section = String::from("acl operations\n");
            for op in &self.operations {
                let _ = writeln!(
                    section,
                    "  {:?} path={} sid={} outcome={}",
                    op.kind,
                    op.path.display(),
                    op.sid,
                    outcome_text(&op.outcome)
                );
            }
            sections.push(section);
        }
        if !self.paths.is_empty() {
            let mut section = String::from("path snapshots\n");
            for path in &self.paths {
                let _ = write!(
                    section,
                    "  stage={:?} path={} owner={} control={} dacl_present={} dacl_is_null={} dacl_defaulted={} total_aces={}",
                    path.stage,
                    path.path.display(),
                    text_or_unavailable(path.owner_sid.as_deref()),
                    hex_u16(path.control),
                    bool_text(path.dacl_present),
                    bool_text(path.dacl_is_null),
                    bool_text(path.dacl_defaulted),
                    path.total_aces
                );
                if path.total_aces > path.aces.len() {
                    let _ = write!(section, " truncated_after={}", path.aces.len());
                }
                section.push('\n');
                for ace in &path.aces {
                    let _ = write!(
                        section,
                        "    ace[{}] type={:?} sid={} mask={} flags=0x{:02x}",
                        ace.index,
                        ace.kind,
                        text_or_unavailable(ace.sid.as_deref()),
                        hex_u32(ace.mask),
                        ace.flags
                    );
                    if let Some(error) = &ace.parse_error {
                        let _ = write!(section, " error={error}");
                    }
                    section.push('\n');
                }
            }
            sections.push(section);
        }
        if !self.errors.is_empty() {
            let mut section = String::from("errors\n");
            for error in &self.errors {
                let _ = write!(section, "  stage={:?}", error.stage);
                if let Some(path) = &error.path {
                    let _ = write!(section, " path={}", path.display());
                }
                let _ = write!(section, " api={}", error.api);
                if let Some(code) = error.code {
                    let _ = write!(section, " code={code}");
                }
                let _ = writeln!(section, " message={}", error.message);
            }
            sections.push(section);
        }
        if let Some(section) = self.render_truncation() {
            sections.push(section);
        }
        sections
    }
    fn render_truncation(&self) -> Option<String> {
        let value = &self.truncation;
        let counts = [
            ("groups", value.omitted_groups),
            ("restricted_sids", value.omitted_restricted_sids),
            ("acl_operations", value.omitted_operations),
            ("errors", value.omitted_errors),
        ];
        if value.omitted_ancestors == 0
            && counts.iter().all(|(_, count)| *count == 0)
            && !value.report_truncated
        {
            return None;
        }
        let mut section = String::from("truncation\n");
        if value.omitted_ancestors > 0 {
            let _ = writeln!(
                section,
                "  paths original={} omitted_ancestors={}",
                value.original_paths, value.omitted_ancestors
            );
        }
        for (label, count) in counts {
            if count > 0 {
                let _ = writeln!(section, "  {label} omitted={count}");
            }
        }
        if value.report_truncated {
            section.push_str("  report_truncated=true\n");
        }
        Some(section)
    }
}
fn prepare_observed_paths(
    observed_paths: Vec<PathBuf>,
    max_paths: usize,
) -> (Vec<PathBuf>, usize, usize) {
    let explicit_paths = canonicalize_unique_paths(observed_paths);
    let explicit_keys = explicit_paths
        .iter()
        .map(|path| windows_path_key(path))
        .collect::<BTreeSet<_>>();
    let mut expanded_paths = explicit_paths.clone();
    for path in &explicit_paths {
        expanded_paths.extend(volume_ancestor_chain(path));
    }
    expanded_paths.sort_by_key(|path| path_sort_key(path));
    expanded_paths.dedup_by(|left, right| windows_path_key(left) == windows_path_key(right));

    let original_paths = expanded_paths.len();
    let mut ancestors = expanded_paths
        .into_iter()
        .filter(|path| !explicit_keys.contains(&windows_path_key(path)))
        .collect::<Vec<_>>();
    ancestors.sort_by_key(|path| {
        let key = windows_path_key(path);
        let distance = explicit_keys
            .iter()
            .filter(|leaf| is_ancestor(&key, leaf))
            .map(|leaf| path_depth(leaf).saturating_sub(path_depth(&key)))
            .min()
            .unwrap_or(usize::MAX);
        (!is_volume_root(&key), distance, path_sort_key(path))
    });

    let retained_explicit = explicit_paths.len().min(max_paths);
    let retained_ancestors = ancestors
        .len()
        .min(max_paths.saturating_sub(retained_explicit));
    let omitted_ancestors = ancestors.len().saturating_sub(retained_ancestors);
    let mut retained = explicit_paths
        .into_iter()
        .take(retained_explicit)
        .chain(ancestors.into_iter().take(retained_ancestors))
        .collect::<Vec<_>>();
    retained.sort_by_key(|path| path_sort_key(path));
    (retained, original_paths, omitted_ancestors)
}
fn canonicalize_unique_paths(paths: Vec<PathBuf>) -> Vec<PathBuf> {
    let mut paths = paths
        .into_iter()
        .map(|path| canonicalize_path(&path))
        .collect::<Vec<_>>();
    paths.sort_by_key(|path| path_sort_key(path));
    paths.dedup_by(|left, right| windows_path_key(left) == windows_path_key(right));
    paths
}
fn volume_ancestor_chain(path: &Path) -> Vec<PathBuf> {
    let mut ancestors = Vec::new();
    for ancestor in path.ancestors() {
        ancestors.push(ancestor.to_path_buf());
        if is_volume_root(&windows_path_key(ancestor)) {
            return ancestors;
        }
    }
    Vec::new()
}
fn truncate<T>(items: &mut Vec<T>, limit: usize) -> usize {
    let omitted = items.len().saturating_sub(limit);
    items.truncate(limit);
    omitted
}
fn freeze_sids(sids: &mut Vec<SidSnapshot>, limit: usize) -> usize {
    for sid in sids.iter_mut() {
        sid.roles.sort();
        sid.roles.dedup();
    }
    sids.sort_by_key(|sid| {
        (
            sid.roles.is_empty(),
            sid.roles.clone(),
            sid.sid.clone(),
            sid.attributes,
        )
    });
    truncate(sids, limit)
}
fn freeze_paths(
    mut paths: Vec<PathAclSnapshot>,
    targets: &BTreeSet<String>,
    max_paths: usize,
    max_aces: usize,
) -> (Vec<PathAclSnapshot>, usize, usize) {
    for path in &mut paths {
        path.aces.sort_by_key(|ace| ace.index);
        path.aces.truncate(max_aces);
    }
    paths.sort_by(|left, right| {
        left.stage
            .cmp(&right.stage)
            .then_with(|| windows_path_key(&left.path).cmp(&windows_path_key(&right.path)))
            .then_with(|| left.cmp(right))
    });
    paths.dedup_by(|left, right| {
        left.stage == right.stage && windows_path_key(&left.path) == windows_path_key(&right.path)
    });
    let unique = paths
        .iter()
        .map(|path| windows_path_key(&path.path))
        .collect::<BTreeSet<_>>();
    let leaves = unique
        .iter()
        .filter(|path| !unique.iter().any(|other| is_ancestor(path, other)))
        .cloned()
        .collect::<BTreeSet<_>>();
    let mut ranked = unique.iter().cloned().collect::<Vec<_>>();
    ranked.sort_by_key(|path| (path_priority(path, targets, &leaves), path.clone()));
    ranked.truncate(max_paths);
    let retained = ranked.into_iter().collect::<BTreeSet<_>>();
    let mut frozen = paths
        .into_iter()
        .filter(|path| retained.contains(&windows_path_key(&path.path)))
        .collect::<Vec<_>>();
    frozen.sort_by_key(|path| (path.stage, path_sort_key(&path.path)));
    let original = unique.len();
    (frozen, original, original.saturating_sub(retained.len()))
}
fn path_priority(
    path: &str,
    targets: &BTreeSet<String>,
    leaves: &BTreeSet<String>,
) -> (u8, usize) {
    if targets.contains(path) || leaves.contains(path) {
        (0, 0)
    } else if is_volume_root(path) {
        (1, 0)
    } else {
        let distance = leaves
            .iter()
            .filter(|leaf| is_ancestor(path, leaf))
            .map(|leaf| path_depth(leaf).saturating_sub(path_depth(path)))
            .min()
            .unwrap_or(usize::MAX);
        (2, distance)
    }
}
fn path_sort_key(path: &Path) -> (String, String) {
    (windows_path_key(path), path_text(path))
}
fn windows_path_key(path: &Path) -> String {
    let mut key = path_text(path).replace('/', "\\").to_ascii_lowercase();
    while key.ends_with('\\') && !is_drive_root(&key) {
        key.pop();
    }
    key
}
fn path_text(path: &Path) -> String {
    path.as_os_str().to_string_lossy().into_owned()
}
fn is_ancestor(parent: &str, child: &str) -> bool {
    parent != child
        && child.starts_with(parent)
        && (parent.ends_with('\\') || child.as_bytes().get(parent.len()) == Some(&b'\\'))
}
fn path_depth(path: &str) -> usize {
    path.split('\\')
        .filter(|part| !part.is_empty() && !part.ends_with(':'))
        .count()
}
fn is_volume_root(path: &str) -> bool {
    is_drive_root(path)
        || path.strip_prefix("\\\\").is_some_and(|rest| {
            rest.split('\\').filter(|part| !part.is_empty()).count() == 2
        })
}
fn is_drive_root(path: &str) -> bool {
    let bytes = path.as_bytes();
    bytes.len() == 3 && bytes[0].is_ascii_alphabetic() && bytes[1..] == *b":\\"
}

fn push_sid(output: &mut String, label: &str, sid: &SidSnapshot) {
    let roles = sid.roles.iter().map(role_text).collect::<Vec<_>>().join(", ");
    let _ = writeln!(
        output,
        "  {label} sid={} attributes=0x{:08x} roles=[{roles}]",
        sid.sid, sid.attributes
    );
}

fn role_text(role: &SidRole) -> &'static str {
    match role {
        SidRole::User => "user",
        SidRole::Logon => "logon",
        SidRole::Everyone => "everyone",
        SidRole::Capability => "capability",
    }
}

fn outcome_text(outcome: &LegacyAclOperationOutcome) -> String {
    match outcome {
        LegacyAclOperationOutcome::Changed => "Changed".to_string(),
        LegacyAclOperationOutcome::Unchanged => "Unchanged".to_string(),
        LegacyAclOperationOutcome::SkippedMissing => "SkippedMissing".to_string(),
        LegacyAclOperationOutcome::Failed {
            api,
            code,
            disposition,
        } => format!("Failed api={api} code={code} disposition={disposition:?}"),
    }
}

fn text_or_unavailable(value: Option<&str>) -> &str {
    value.unwrap_or("<unavailable>")
}

fn hex_u16(value: Option<u16>) -> String {
    value.map_or_else(|| "<unavailable>".to_string(), |value| format!("0x{value:04x}"))
}

fn hex_u32(value: Option<u32>) -> String {
    value.map_or_else(|| "<unavailable>".to_string(), |value| format!("0x{value:08x}"))
}

fn bool_text(value: Option<bool>) -> &'static str {
    match value {
        Some(true) => "true",
        Some(false) => "false",
        None => "<unavailable>",
    }
}

#[cfg(test)]
#[path = "legacy_diagnostics_tests.rs"]
mod tests;
