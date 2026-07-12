use super::*;
use crate::acl::AclFailureDisposition;
use crate::acl::AclMutationAttempt;
use pretty_assertions::assert_eq;
use std::path::Path;
use std::path::PathBuf;
const USER: &str = "S-1-5-21-100";
const EVERYONE: &str = "S-1-1-0";
const LOGON: &str = "S-1-5-5-100-200";
const CAPABILITY: &str = "S-1-15-3-100";
const USERS: &str = "S-1-5-32-545";
const ADMINS: &str = "S-1-5-32-544";
const GROUP_ATTRIBUTES: u32 = 7;
const FULL_MASK: u32 = 0x001f_01ff;
const DELETE_MASK: u32 = 0x0001_0000;
#[test]
fn legacy_diagnostics_report_renders_complete_deterministic_output() {
    let report = complete_report_fixture();
    let actual = report.render();
    let expected = concat!(
        "legacy diagnostics\ntoken\n  user sid=S-1-5-21-100 attributes=0x00000000 roles=[]\n",
        "  group sid=S-1-5-5-100-200 attributes=0x00000007 roles=[logon]\n  group sid=S-1-1-0 attributes=0x00000007 roles=[everyone]\n",
        "  group sid=S-1-15-3-100 attributes=0x00000004 roles=[capability]\n  group sid=S-1-5-32-545 attributes=0x00000007 roles=[]\n",
        "  restricted sid=S-1-5-5-100-200 attributes=0x00000000 roles=[logon]\n  restricted sid=S-1-1-0 attributes=0x00000000 roles=[everyone]\n",
        "  restricted sid=S-1-15-3-100 attributes=0x00000000 roles=[capability]\n  restricted sid=S-1-5-32-545 attributes=0x00000000 roles=[]\n",
        "capability roots\n  C:\\temp -> S-1-15-3-200\n  C:\\workspace -> S-1-15-3-100\n",
        "acl operations\n  EnsureAllowWrite path=C:\\workspace sid=S-1-15-3-100 outcome=Changed\n",
        "  ProtectWorkspaceCodex path=C:\\workspace\\.codex sid=S-1-15-3-100 outcome=Unchanged\n",
        "  DenyWrite path=C:\\workspace\\.git sid=S-1-15-3-100 outcome=Failed api=SetNamedSecurityInfoW code=5 disposition=ReturnError\n",
        "path snapshots\n",
        "  stage=BeforeAcl path=C:\\outside owner=S-1-5-21-100 control=0x0004 dacl_present=true dacl_is_null=false dacl_defaulted=false total_aces=2\n",
        "    ace[0] type=Allow sid=S-1-1-0 mask=0x001f01ff flags=0x03\n",
        "    ace[1] type=Deny sid=S-1-5-5-100-200 mask=0x00010000 flags=0x10\n",
        "  stage=AfterAcl path=C:\\workspace owner=S-1-5-21-100 control=0x1004 dacl_present=true dacl_is_null=false dacl_defaulted=false total_aces=2\n",
        "    ace[0] type=Deny sid=S-1-15-3-100 mask=0x00010000 flags=0x00\n",
        "    ace[1] type=Unknown(17) sid=<unavailable> mask=<unavailable> flags=0x80 error=unsupported ACE type 17\n",
        "errors\n  stage=Token api=GetTokenInformation code=5 message=Access is denied\n",
        "  stage=AfterAcl path=C:\\missing api=GetNamedSecurityInfoW code=2 message=The system cannot find the file specified\n",
    );
    assert_eq!(actual, expected);
    assert_eq!(report.render(), actual);
}
#[test]
fn legacy_diagnostics_report_applies_collection_bounds_and_preserves_priority() {
    let limits = DiagnosticsLimits {
        max_paths: 3,
        max_aces_per_path: 2,
        max_groups: 2,
        max_restricted_sids: 2,
        max_operations: 2,
        max_errors: 2,
        max_report_bytes: 4096,
    };
    assert_eq!(
        LegacyDiagnosticsReport::freeze(oversized_capture_fixture(), limits),
        expected_bounded_report_fixture(limits)
    );
}
#[test]
fn legacy_diagnostics_report_stops_at_complete_section_boundary() {
    let cases = [
        (section_boundary_fixture(), 96, "legacy diagnostics\n[report truncated]\n"),
        (LegacyDiagnosticsCapture::default(), "legacy diagnostics\n".len(), "legacy diagnostics\n"),
        (LegacyDiagnosticsCapture::default(), "[report truncated]\n".len() - 1, ""),
        (utf8_error_fixture(), "legacy diagnostics\n[report truncated]\n".len(), "legacy diagnostics\n[report truncated]\n"),
    ];
    for (capture, limit, expected) in cases {
        let actual = LegacyDiagnosticsReport::freeze(capture, limits(limit)).render();
        assert_eq!(actual, expected);
        assert!(actual.len() <= limit);
        assert!(String::from_utf8(actual.into_bytes()).is_ok());
    }
}
#[test]
fn legacy_diagnostics_collector_lifecycle_maps_disabled_and_captured() {
    assert_eq!(LegacyDiagnosticsCollector::disabled().finish(), LegacyDiagnosticsOutput::Disabled);
    assert!(matches!(
        LegacyDiagnosticsCollector::capture(vec![PathBuf::from(r"C:\workspace")]).finish(),
        LegacyDiagnosticsOutput::Captured(_)
    ));
}
#[test]
fn legacy_diagnostics_collector_records_acl_attempts_without_changing_results() {
    let mut collector = LegacyDiagnosticsCollector::capture(vec![PathBuf::from(r"C:\workspace")]);
    collector.record_acl_attempt(
        LegacyAclOperationKind::DenyWrite,
        Path::new(r"C:\workspace\.git"),
        CAPABILITY,
        &AclMutationAttempt::Failed {
            api: "SetNamedSecurityInfoW",
            code: 5,
            disposition: AclFailureDisposition::ReturnUnchanged,
        },
    );
    assert_eq!(
        collector.finish(),
        LegacyDiagnosticsOutput::Captured(expected_failed_acl_operation_report()),
    );
}
#[test]
fn legacy_diagnostics_collector_bounds_operations_while_recording() {
    let limits = DiagnosticsLimits {
        max_operations: 2,
        ..DiagnosticsLimits::default()
    };
    let mut collector = LegacyDiagnosticsCollector::Capture {
        observed_paths: vec![PathBuf::from(r"C:\workspace")],
        capture: LegacyDiagnosticsCapture::default(),
        limits,
    };
    collector.record_acl_attempt(
        LegacyAclOperationKind::EnsureAllowWrite,
        Path::new(r"C:\workspace"),
        CAPABILITY,
        &AclMutationAttempt::Changed,
    );
    collector.record_acl_skipped_missing(
        LegacyAclOperationKind::ProtectWorkspaceCodex,
        Path::new(r"C:\workspace\.codex"),
        CAPABILITY,
    );
    collector.record_acl_attempt(
        LegacyAclOperationKind::DenyWrite,
        Path::new(r"C:\workspace\.git"),
        CAPABILITY,
        &AclMutationAttempt::Unchanged,
    );
    collector.record_acl_skipped_missing(
        LegacyAclOperationKind::ProtectWorkspaceAgents,
        Path::new(r"C:\workspace\.agents"),
        CAPABILITY,
    );

    assert_eq!(
        collector.finish(),
        LegacyDiagnosticsOutput::Captured(expected_operation_report(
            vec![
                operation(
                    LegacyAclOperationKind::EnsureAllowWrite,
                    r"C:\workspace",
                    LegacyAclOperationOutcome::Changed,
                ),
                operation(
                    LegacyAclOperationKind::ProtectWorkspaceCodex,
                    r"C:\workspace\.codex",
                    LegacyAclOperationOutcome::SkippedMissing,
                ),
            ],
            limits,
            /*omitted_operations*/ 2,
        )),
    );
}
#[test]
fn acl_mutation_attempt_preserves_legacy_failure_disposition() {
    let actual = [
        AclMutationAttempt::Changed
            .into_legacy_result()
            .map_err(|err| err.to_string()),
        AclMutationAttempt::Unchanged
            .into_legacy_result()
            .map_err(|err| err.to_string()),
        AclMutationAttempt::Failed {
            api: "SetEntriesInAclW",
            code: 5,
            disposition: AclFailureDisposition::ReturnUnchanged,
        }
        .into_legacy_result()
        .map_err(|err| err.to_string()),
        AclMutationAttempt::Failed {
            api: "GetNamedSecurityInfoW",
            code: 5,
            disposition: AclFailureDisposition::ReturnError,
        }
        .into_legacy_result()
        .map_err(|err| err.to_string()),
    ];
    assert_eq!(
        actual,
        [
            Ok(true),
            Ok(false),
            Ok(false),
            Err("GetNamedSecurityInfoW failed: 5".to_string()),
        ],
    );
}
#[test]
fn acl_mutation_attempt_preserves_ensure_fetch_legacy_errors() {
    let path = std::path::Path::new(r"C:\workspace");
    let actual = [
        AclMutationAttempt::Failed {
            api: "CreateFileW",
            code: 2,
            disposition: AclFailureDisposition::ReturnError,
        }
        .into_ensure_legacy_result(path)
        .map_err(|err| err.to_string()),
        AclMutationAttempt::Failed {
            api: "GetSecurityInfo",
            code: 5,
            disposition: AclFailureDisposition::ReturnError,
        }
        .into_ensure_legacy_result(path)
        .map_err(|err| err.to_string()),
    ];
    assert_eq!(
        actual,
        [
            Err("CreateFileW failed for C:\\workspace".to_string()),
            Err("GetSecurityInfo failed for C:\\workspace: 5".to_string()),
        ],
    );
}
#[test]
fn legacy_diagnostics_captures_current_token_and_temp_path_as_owned_data() {
    let token = unsafe { crate::token::get_current_token_for_restriction() }
        .expect("open current token");
    let temp = tempfile::tempdir().expect("create tempdir");
    let token_snapshot = unsafe { snapshot_token(token, &[]) }.expect("snapshot token");
    let path_snapshot = snapshot_path_security(temp.path(), AclSnapshotStage::BeforeAcl)
        .expect("snapshot temp path");
    unsafe { windows_sys::Win32::Foundation::CloseHandle(token) };
    let expected_path = crate::path_normalization::canonicalize_path(temp.path());

    assert_eq!(
        (
            token_snapshot.user.sid.is_empty(),
            token_snapshot.groups.is_empty(),
            path_snapshot.path.clone(),
            path_snapshot.control.is_some(),
            path_snapshot.dacl_present.is_some(),
            path_snapshot.dacl_is_null,
        ),
        (false, false, expected_path, true, true, Some(false)),
    );
    let rendered_after_handles_are_closed = report_from_snapshots(token_snapshot, path_snapshot)
        .render();
    assert!(rendered_after_handles_are_closed.contains("token"));
}
fn complete_report_fixture() -> LegacyDiagnosticsReport {
    LegacyDiagnosticsReport::freeze(
        LegacyDiagnosticsCapture {
            token: Some(token(
                vec![
                    plain_sid(USERS, GROUP_ATTRIBUTES),
                    role_sid(CAPABILITY, 4, SidRole::Capability),
                    role_sid(EVERYONE, GROUP_ATTRIBUTES, SidRole::Everyone),
                    role_sid(LOGON, GROUP_ATTRIBUTES, SidRole::Logon),
                ],
                vec![
                    plain_sid(USERS, 0),
                    role_sid(CAPABILITY, 0, SidRole::Capability),
                    role_sid(EVERYONE, 0, SidRole::Everyone),
                    role_sid(LOGON, 0, SidRole::Logon),
                ],
            )),
            capability_roots: vec![root(r"C:\workspace", CAPABILITY), root(r"C:\temp", "S-1-15-3-200")],
            operations: vec![
                operation(LegacyAclOperationKind::EnsureAllowWrite, r"C:\workspace", LegacyAclOperationOutcome::Changed),
                operation(LegacyAclOperationKind::ProtectWorkspaceCodex, r"C:\workspace\.codex", LegacyAclOperationOutcome::Unchanged),
                failed_operation(r"C:\workspace\.git"),
            ],
            paths: vec![
                path(AclSnapshotStage::AfterAcl, r"C:\workspace", vec![unknown(/*index*/ 1), deny(/*index*/ 0, CAPABILITY, DELETE_MASK, 0)]),
                path(AclSnapshotStage::BeforeAcl, r"C:\outside", vec![deny(/*index*/ 1, LOGON, DELETE_MASK, 0x10), allow(/*index*/ 0, EVERYONE, FULL_MASK, 3)]),
            ],
            errors: vec![
                error(DiagnosticStage::AfterAcl, Some(r"C:\missing"), "GetNamedSecurityInfoW", 2, "The system cannot find the file specified"),
                error(DiagnosticStage::Token, None, "GetTokenInformation", 5, "Access is denied"),
            ],
            omitted_operations: 0,
            omitted_errors: 0,
            original_paths: 0,
            omitted_ancestors: 0,
        },
        DiagnosticsLimits::default(),
    )
}
fn expected_failed_acl_operation_report() -> LegacyDiagnosticsReport {
    expected_operation_report(
        vec![operation(
            LegacyAclOperationKind::DenyWrite,
            r"C:\workspace\.git",
            LegacyAclOperationOutcome::Failed {
                api: "SetNamedSecurityInfoW",
                code: 5,
                disposition: LegacyFailureDispositionSnapshot::ReturnUnchanged,
            },
        )],
        DiagnosticsLimits::default(),
        /*omitted_operations*/ 0,
    )
}
fn expected_operation_report(
    operations: Vec<LegacyAclOperation>,
    limits: DiagnosticsLimits,
    omitted_operations: usize,
) -> LegacyDiagnosticsReport {
    LegacyDiagnosticsReport {
        token: None,
        capability_roots: Vec::new(),
        operations,
        paths: Vec::new(),
        errors: Vec::new(),
        truncation: DiagnosticsTruncation {
            omitted_operations,
            ..DiagnosticsTruncation::default()
        },
        limits,
    }
}
fn report_from_snapshots(
    token: TokenSnapshot,
    path: PathAclSnapshot,
) -> LegacyDiagnosticsReport {
    LegacyDiagnosticsReport::freeze(
        LegacyDiagnosticsCapture {
            token: Some(token),
            paths: vec![path],
            ..LegacyDiagnosticsCapture::default()
        },
        test_limits(),
    )
}
fn oversized_capture_fixture() -> LegacyDiagnosticsCapture {
    LegacyDiagnosticsCapture {
        token: Some(token(
            vec![
                plain_sid(USERS, GROUP_ATTRIBUTES),
                role_sid(EVERYONE, GROUP_ATTRIBUTES, SidRole::Everyone),
                plain_sid(ADMINS, GROUP_ATTRIBUTES),
                role_sid(LOGON, GROUP_ATTRIBUTES, SidRole::Logon),
            ],
            vec![
                plain_sid(USERS, 0),
                role_sid(CAPABILITY, 0, SidRole::Capability),
                plain_sid(ADMINS, 0),
                role_sid(EVERYONE, 0, SidRole::Everyone),
            ],
        )),
        capability_roots: vec![root(r"C:\repo", CAPABILITY)],
        operations: vec![
            operation(LegacyAclOperationKind::EnsureAllowWrite, r"C:\repo", LegacyAclOperationOutcome::Changed),
            operation(LegacyAclOperationKind::ProtectWorkspaceCodex, r"C:\repo\.codex", LegacyAclOperationOutcome::Unchanged),
            failed_operation(r"C:\repo\.git"),
        ],
        paths: vec![
            path(AclSnapshotStage::BeforeAcl, r"c:\REPO\.git\", vec![unknown(/*index*/ 0)]),
            truncated_path(AclSnapshotStage::BeforeAcl, r"C:\repo\.git", vec![unknown(/*index*/ 2), deny(/*index*/ 1, CAPABILITY, DELETE_MASK, 0), allow(/*index*/ 0, EVERYONE, FULL_MASK, 3)], 3),
            path(AclSnapshotStage::AfterAcl, r"C:\repo\.git", vec![deny(/*index*/ 0, CAPABILITY, DELETE_MASK, 0)]),
            path(AclSnapshotStage::BeforeAcl, r"C:\repo\sandbox\cwd", vec![allow(/*index*/ 0, CAPABILITY, FULL_MASK, 0)]),
            path(AclSnapshotStage::BeforeAcl, r"C:\repo", vec![allow(/*index*/ 0, LOGON, DELETE_MASK, 0x10)]),
            path(AclSnapshotStage::BeforeAcl, r"C:\repo\sandbox", Vec::new()),
            path(AclSnapshotStage::BeforeAcl, r"C:\", Vec::new()),
        ],
        errors: vec![
            error(DiagnosticStage::AfterAcl, Some(r"C:\repo\.git"), "GetNamedSecurityInfoW", 5, "after ACL query failed"),
            error(DiagnosticStage::Token, None, "GetTokenInformation(TokenRestrictedSids)", 87, "restricted SID query failed"),
            error(DiagnosticStage::BeforeAcl, Some(r"C:\repo"), "GetNamedSecurityInfoW", 2, "before ACL query failed"),
            error(DiagnosticStage::Token, None, "GetTokenInformation(TokenGroups)", 5, "group query failed"),
        ],
        omitted_operations: 0,
        omitted_errors: 0,
        original_paths: 0,
        omitted_ancestors: 0,
    }
}
fn expected_bounded_report_fixture(limits: DiagnosticsLimits) -> LegacyDiagnosticsReport {
    LegacyDiagnosticsReport {
        token: Some(token(
            vec![role_sid(LOGON, GROUP_ATTRIBUTES, SidRole::Logon), role_sid(EVERYONE, GROUP_ATTRIBUTES, SidRole::Everyone)],
            vec![role_sid(EVERYONE, 0, SidRole::Everyone), role_sid(CAPABILITY, 0, SidRole::Capability)],
        )),
        capability_roots: vec![root(r"C:\repo", CAPABILITY)],
        operations: vec![
            operation(LegacyAclOperationKind::EnsureAllowWrite, r"C:\repo", LegacyAclOperationOutcome::Changed),
            operation(LegacyAclOperationKind::ProtectWorkspaceCodex, r"C:\repo\.codex", LegacyAclOperationOutcome::Unchanged),
        ],
        paths: vec![
            path(AclSnapshotStage::BeforeAcl, r"C:\repo", vec![allow(/*index*/ 0, LOGON, DELETE_MASK, 0x10)]),
            truncated_path(AclSnapshotStage::BeforeAcl, r"C:\repo\.git", vec![allow(/*index*/ 0, EVERYONE, FULL_MASK, 3), deny(/*index*/ 1, CAPABILITY, DELETE_MASK, 0)], 3),
            path(AclSnapshotStage::BeforeAcl, r"C:\repo\sandbox\cwd", vec![allow(/*index*/ 0, CAPABILITY, FULL_MASK, 0)]),
            path(AclSnapshotStage::AfterAcl, r"C:\repo\.git", vec![deny(/*index*/ 0, CAPABILITY, DELETE_MASK, 0)]),
        ],
        errors: vec![
            error(DiagnosticStage::Token, None, "GetTokenInformation(TokenGroups)", 5, "group query failed"),
            error(DiagnosticStage::Token, None, "GetTokenInformation(TokenRestrictedSids)", 87, "restricted SID query failed"),
        ],
        truncation: DiagnosticsTruncation {
            original_paths: 5,
            omitted_ancestors: 2,
            omitted_groups: 2,
            omitted_restricted_sids: 2,
            omitted_operations: 1,
            omitted_errors: 2,
            report_truncated: false,
        },
        limits,
    }
}
fn test_limits() -> DiagnosticsLimits {
    DiagnosticsLimits { max_report_bytes: 4096, ..DiagnosticsLimits::default() }
}
fn limits(max_report_bytes: usize) -> DiagnosticsLimits {
    DiagnosticsLimits { max_report_bytes, ..test_limits() }
}
fn section_boundary_fixture() -> LegacyDiagnosticsCapture {
    LegacyDiagnosticsCapture {
        token: Some(token(Vec::new(), Vec::new())),
        capability_roots: vec![root(r"C:\workspace", CAPABILITY)],
        ..LegacyDiagnosticsCapture::default()
    }
}
fn utf8_error_fixture() -> LegacyDiagnosticsCapture {
    LegacyDiagnosticsCapture {
        errors: vec![error(DiagnosticStage::Render, None, "render", 1, "拒绝访问")],
        ..LegacyDiagnosticsCapture::default()
    }
}
fn token(groups: Vec<SidSnapshot>, restricted_sids: Vec<SidSnapshot>) -> TokenSnapshot {
    TokenSnapshot { user: plain_sid(USER, 0), groups, restricted_sids }
}
fn plain_sid(sid: &str, attributes: u32) -> SidSnapshot {
    SidSnapshot { sid: sid.to_string(), attributes, roles: Vec::new() }
}
fn role_sid(sid: &str, attributes: u32, role: SidRole) -> SidSnapshot {
    SidSnapshot { sid: sid.to_string(), attributes, roles: vec![role] }
}
fn root(path: &str, sid: &str) -> (PathBuf, String) { (PathBuf::from(path), sid.to_string()) }
fn operation(kind: LegacyAclOperationKind, path: &str, outcome: LegacyAclOperationOutcome) -> LegacyAclOperation {
    LegacyAclOperation { kind, path: PathBuf::from(path), sid: CAPABILITY.to_string(), outcome }
}
fn failed_operation(path: &str) -> LegacyAclOperation {
    operation(LegacyAclOperationKind::DenyWrite, path, LegacyAclOperationOutcome::Failed {
        api: "SetNamedSecurityInfoW", code: 5, disposition: LegacyFailureDispositionSnapshot::ReturnError,
    })
}
fn allow(index: u32, sid: &str, mask: u32, flags: u8) -> AceSnapshot {
    ace(index, AceKind::Allow, Some(sid), Some(mask), flags, None)
}
fn deny(index: u32, sid: &str, mask: u32, flags: u8) -> AceSnapshot {
    ace(index, AceKind::Deny, Some(sid), Some(mask), flags, None)
}
fn unknown(index: u32) -> AceSnapshot {
    ace(index, AceKind::Unknown(17), None, None, 0x80, Some("unsupported ACE type 17"))
}
fn ace(index: u32, kind: AceKind, sid: Option<&str>, mask: Option<u32>, flags: u8, parse_error: Option<&str>) -> AceSnapshot {
    AceSnapshot { index, kind, sid: sid.map(str::to_string), mask, flags, parse_error: parse_error.map(str::to_string) }
}
fn path(stage: AclSnapshotStage, path: &str, aces: Vec<AceSnapshot>) -> PathAclSnapshot {
    let total_aces = aces.len();
    truncated_path(stage, path, aces, total_aces)
}
fn truncated_path(stage: AclSnapshotStage, path: &str, aces: Vec<AceSnapshot>, total_aces: usize) -> PathAclSnapshot {
    PathAclSnapshot {
        stage, path: PathBuf::from(path), owner_sid: Some(USER.to_string()),
        control: Some(if stage == AclSnapshotStage::AfterAcl { 0x1004 } else { 0x0004 }),
        dacl_present: Some(true), dacl_is_null: Some(false), dacl_defaulted: Some(false), aces,
        total_aces,
    }
}
fn error(stage: DiagnosticStage, path: Option<&str>, api: &'static str, code: u32, message: &str) -> DiagnosticError {
    DiagnosticError { stage, path: path.map(PathBuf::from), api, code: Some(code), message: message.to_string() }
}
