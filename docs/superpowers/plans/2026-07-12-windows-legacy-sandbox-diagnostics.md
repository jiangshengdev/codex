# Windows legacy sandbox 权限诊断实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 `legacy_workspace_write_delete_is_limited_to_writable_roots` 增加测试专用、原生 Win32、行为只读的 token/DACL 诊断，使下一次 Windows CI 失败日志能够区分 ACL 写入失败、宿主继承 grant 绕过、父目录 `FILE_DELETE_CHILD` 绕过和 token restricted SID 异常。

**Architecture:** 新增私有 `unified_exec/legacy_diagnostics.rs`，集中拥有所有 Win32 unsafe 查询、owned 快照、限界冻结和确定性渲染。现有生产 legacy spawn 与 ACL 应用入口保持签名和控制流不变；目标测试通过单独的 diagnostics spawn 入口把观察请求传入同一 backend impl，并在 child 启动前冻结报告。

**Tech Stack:** Rust 2024 workspace、`windows-sys 0.52`、Win32 token/security APIs、`anyhow`、`pretty_assertions`、`cargo-nextest`/`just test`。

---

## 执行约束

- 对应设计：`docs/superpowers/specs/2026-07-12-windows-legacy-sandbox-diagnostics-design.md`。
- 当前分支必须保持 `dev`；不要创建或切换分支，除非用户另行要求。
- 不修改 `Cargo.toml` 或 `Cargo.lock`；现有 `windows-sys` features 已覆盖所需 API。
- 不修改 elevated backend、CI workflow、permission profile、writable-root 计算或 public protocol。
- 不执行 `git fetch`、`git pull`、`git push`、`git remote` 或其他远程 Git 操作。
- 当前本机只安装 `aarch64-apple-darwin` target。不要安装 Windows target；Windows RED/GREEN 和现场输出必须在用户已有 Windows runner 上执行。
- 主代理只负责协调、审查、验证和汇报。文件修改、测试、stage 与 commit 按任务交给执行子代理。
- 每个任务单独本地提交。提交前只 stage 该任务列出的文件，并检查 staged diff。
- 复杂非机械改动目标小于 500 行；若 Task 1–5 累计 diff 超过 500 行，停止并重新评估是否先只落 renderer + snapshot 基础设施，不得继续堆到 800 行以上。
- 所有 Windows 原生指针必须在 handle/security descriptor/token buffer 释放前复制为 owned Rust 数据；报告结构不得保存裸指针。

## 文件结构

**Create**

- `codex-rs/windows-sandbox-rs/src/unified_exec/legacy_diagnostics.rs`
  - 诊断请求、collector、owned token/DACL/ACE 快照、限界冻结、Win32 读取与报告渲染。
- `codex-rs/windows-sandbox-rs/src/unified_exec/legacy_diagnostics_tests.rs`
  - renderer、优先级截断、字节边界和 legacy ACL outcome 转换测试。

**Modify**

- `codex-rs/windows-sandbox-rs/src/unified_exec/mod.rs`
  - 注册私有诊断模块；保留生产入口；新增 test-only diagnostics spawn 入口。
- `codex-rs/windows-sandbox-rs/src/unified_exec/backends/legacy.rs`
  - 把现有入口收敛为共享 impl；在 token 创建后、ACL 前后采集；child 启动前冻结报告。
- `codex-rs/windows-sandbox-rs/src/spawn_prep.rs`
  - 保留原 ACL 应用入口；新增 diagnostics wrapper/impl；记录当前被忽略的 ACL 操作。
- `codex-rs/windows-sandbox-rs/src/acl.rs`
  - 增加 crate-private detailed mutation outcome；公开 helper 映射回原 `Result<bool>` 语义。
- `codex-rs/windows-sandbox-rs/src/unified_exec/tests.rs`
  - 仅目标回归测试改用 diagnostics 入口、登记路径并在失败消息追加报告。

## Task 1：建立诊断数据模型、限界冻结和确定性 renderer

**Files:**

- Create: `codex-rs/windows-sandbox-rs/src/unified_exec/legacy_diagnostics.rs`
- Create: `codex-rs/windows-sandbox-rs/src/unified_exec/legacy_diagnostics_tests.rs`
- Modify: `codex-rs/windows-sandbox-rs/src/unified_exec/mod.rs:10-11`

- [ ] **Step 1：注册私有模块和 sibling test 文件**

在 `unified_exec/mod.rs` 注册：

```rust
pub(crate) mod legacy_diagnostics;
```

在新实现文件末尾注册独立测试模块：

```rust
#[cfg(test)]
#[path = "legacy_diagnostics_tests.rs"]
mod tests;
```

- [ ] **Step 2：先写 deterministic renderer RED 测试**

在 `legacy_diagnostics_tests.rs` 新增
`legacy_diagnostics_report_renders_complete_deterministic_output`。测试构造乱序的完整合成 report，覆盖：

- token user、普通 groups、restricted SIDs；
- logon、Everyone、capability roles；
- root-to-capability mapping；
- `BeforeAcl`/`AfterAcl` path snapshots；
- allow、deny、unknown ACE；
- changed、unchanged、failed ACL operations；
- token 与 path query errors。

测试必须一次比较完整渲染文本：

```rust
use pretty_assertions::assert_eq;

#[test]
fn legacy_diagnostics_report_renders_complete_deterministic_output() {
    let report = complete_report_fixture();
    let actual = report.render();
    let expected = concat!(
        "legacy diagnostics\n",
        "token\n",
        "  user sid=S-1-5-21-100 attributes=0x00000000 roles=[]\n",
        "  group sid=S-1-1-0 attributes=0x00000007 roles=[everyone]\n",
        "  restricted sid=S-1-1-0 attributes=0x00000000 roles=[everyone]\n",
        "capability roots\n",
        "  C:\\\\workspace -> S-1-15-3-100\n",
        "acl operations\n",
        "  EnsureAllowWrite path=C:\\\\workspace sid=S-1-15-3-100 outcome=Changed\n",
        "path snapshots\n",
        "  stage=BeforeAcl path=C:\\\\outside owner=S-1-5-21-100 control=0x0004\n",
        "    ace[0] type=Allow sid=S-1-1-0 mask=0x001f01ff flags=0x03\n",
        "errors\n",
        "  stage=Token api=GetTokenInformation code=5 message=Access is denied\n",
    );
    assert_eq!(actual, expected);
    assert_eq!(report.render(), actual);
}
```

`complete_report_fixture`、`expected_bounded_report_fixture`、`report_from_snapshots` 和 `test_limits`
只放在 sibling test 文件，不把 test-only constructor 放进生产实现。

- [ ] **Step 3：在 Windows 上运行单测确认 RED**

Run:

```text
just test -p codex-windows-sandbox --lib legacy_diagnostics_report_renders_complete_deterministic_output
```

Expected: FAIL/compile error，因为 report 类型与 `render()` 尚未实现。

- [ ] **Step 4：写限界与字节边界 RED 测试**

新增：

```rust
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
    let actual = LegacyDiagnosticsReport::freeze(oversized_capture_fixture(), limits);
    assert_eq!(actual, expected_bounded_report_fixture());
}

#[test]
fn legacy_diagnostics_report_stops_at_complete_section_boundary() {
    let limits = DiagnosticsLimits {
        max_report_bytes: 96,
        ..test_limits()
    };
    let actual = LegacyDiagnosticsReport::freeze(section_boundary_fixture(), limits).render();
    assert_eq!(
        actual,
        "legacy diagnostics\ntoken\n  user sid=S-1-5-21-100 attributes=0x00000000 roles=[]\n[report truncated]\n",
    );
}
```

限界测试必须比较完整冻结对象；不要直接测试生产常量本身。

- [ ] **Step 5：实现 owned 数据模型和纯逻辑**

在 `legacy_diagnostics.rs` 定义以下核心类型；所有 snapshot 类型派生 `Debug, Clone, PartialEq, Eq`：

```rust
const DEFAULT_MAX_PATHS: usize = 24;
const DEFAULT_MAX_ACES_PER_PATH: usize = 64;
const DEFAULT_MAX_GROUPS: usize = 128;
const DEFAULT_MAX_RESTRICTED_SIDS: usize = 128;
const DEFAULT_MAX_OPERATIONS: usize = 128;
const DEFAULT_MAX_ERRORS: usize = 128;
const DEFAULT_MAX_REPORT_BYTES: usize = 128 * 1024;

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

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum AceKind {
    Allow,
    Deny,
    Unknown(u8),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct AceSnapshot {
    pub(crate) index: u32,
    pub(crate) kind: AceKind,
    pub(crate) sid: Option<String>,
    pub(crate) mask: Option<u32>,
    pub(crate) flags: u8,
    pub(crate) parse_error: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct PathAclSnapshot {
    pub(crate) stage: AclSnapshotStage,
    pub(crate) path: PathBuf,
    pub(crate) owner_sid: Option<String>,
    pub(crate) control: Option<u16>,
    pub(crate) dacl_present: Option<bool>,
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
}

pub(crate) enum LegacyDiagnosticsCollector {
    Disabled,
    Capture {
        observed_paths: Vec<PathBuf>,
        capture: LegacyDiagnosticsCapture,
        limits: DiagnosticsLimits,
    },
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
```

实现 `LegacyDiagnosticsReport::freeze` 和 `render`：

- role-bearing SID 优先，其余按 SID 排序；
- path 按 stage + canonical path 排序；
- ACE 保持原 DACL index 顺序；
- operation 保持执行顺序；
- errors 按 stage/path/API 排序；
- renderer 按 section 暂存字符串，只有完整 section 加入后仍不超过 byte cap 才 append；否则 append `[report truncated]`。

同时实现 collector 的基础生命周期；Task 4/5 再增加 operation 与 Win32 capture 方法：

```rust
impl LegacyDiagnosticsCollector {
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

    pub(crate) fn finish(self) -> LegacyDiagnosticsOutput {
        match self {
            Self::Disabled => LegacyDiagnosticsOutput::Disabled,
            Self::Capture {
                capture, limits, ..
            } => LegacyDiagnosticsOutput::Captured(LegacyDiagnosticsReport::freeze(capture, limits)),
        }
    }
}
```

- [ ] **Step 6：运行 renderer 测试确认 GREEN**

Run:

```text
just test -p codex-windows-sandbox --lib legacy_diagnostics
```

Expected: 3 tests PASS。

- [ ] **Step 7：提交 Task 1**

```text
git add codex-rs/windows-sandbox-rs/src/unified_exec/mod.rs codex-rs/windows-sandbox-rs/src/unified_exec/legacy_diagnostics.rs codex-rs/windows-sandbox-rs/src/unified_exec/legacy_diagnostics_tests.rs
git diff --cached --check
git diff --cached --stat
git commit -m "test(windows-sandbox): add bounded legacy diagnostics report"
```

## Task 2：实现原生 token 与路径安全描述符快照

**Files:**

- Modify: `codex-rs/windows-sandbox-rs/src/unified_exec/legacy_diagnostics.rs`
- Modify: `codex-rs/windows-sandbox-rs/src/unified_exec/legacy_diagnostics_tests.rs`

- [ ] **Step 1：写 Win32 snapshot RED 测试**

新增 Windows-only 测试
`legacy_diagnostics_captures_current_token_and_temp_path_as_owned_data`：

```rust
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
        ),
        (false, false, expected_path, true, true),
    );
    let rendered_after_handles_are_closed = report_from_snapshots(token_snapshot, path_snapshot)
        .render();
    assert!(rendered_after_handles_are_closed.contains("token"));
}
```

该测试只验证 owned 生命周期和结构可读取，不断言 runner-specific SID 或 ACE。

- [ ] **Step 2：在 Windows 上运行确认 RED**

Run:

```text
just test -p codex-windows-sandbox --lib legacy_diagnostics_captures_current_token_and_temp_path_as_owned_data
```

Expected: FAIL/compile error，因为 snapshot 函数尚未实现。

- [ ] **Step 3：实现 token snapshot**

在新模块实现：

```rust
pub(crate) unsafe fn snapshot_token(
    token: HANDLE,
    capability_roots: &[(PathBuf, String)],
) -> Result<TokenSnapshot, DiagnosticError>;

fn query_token_information(token: HANDLE, class: TOKEN_INFORMATION_CLASS) -> Result<Vec<u8>, DiagnosticError>;

unsafe fn copy_sid_bytes(sid: *mut c_void, container_len: usize) -> Result<Vec<u8>, DiagnosticError>;

fn parse_sid_and_attributes(
    buffer: &[u8],
    capability_sids: &BTreeSet<String>,
) -> Result<Vec<SidSnapshot>, DiagnosticError>;
```

实现要求：

- `GetTokenInformation` 两阶段查询 `TokenUser`、`TokenGroups`、`TokenRestrictedSids`；
- groups flexible-array 按 `align_of::<SID_AND_ATTRIBUTES>()` 对齐并严格校验 count × element size 不越界；
- 每个 SID 用 `IsValidSid`、`GetLengthSid`、`CopySid` 复制到 `Vec<u8>`；
- 用现有 `winutil::string_from_sid_bytes` 转字符串；
- attributes 原样保留；
- 根据 user、`SE_GROUP_LOGON_ID`、`S-1-1-0` 和 capability mapping 标注 roles；
- token handle 只借用，不调用 `CloseHandle`。

- [ ] **Step 4：实现 path security snapshot 和 ACE 枚举**

新增私有 RAII guards，分别在 Drop 中 `CloseHandle` 和 `LocalFree`。实现：

```rust
pub(crate) fn snapshot_path_security(
    path: &Path,
    stage: AclSnapshotStage,
) -> Result<PathAclSnapshot, DiagnosticError>;

unsafe fn snapshot_aces(
    dacl: *mut ACL,
    max_aces: usize,
) -> Result<(Vec<AceSnapshot>, usize), DiagnosticError>;
```

读取顺序：

1. `CreateFileW` 使用 `READ_CONTROL`、三个 share flags、`OPEN_EXISTING`、`FILE_FLAG_BACKUP_SEMANTICS`。
2. `GetSecurityInfo(handle, SE_FILE_OBJECT, OWNER_SECURITY_INFORMATION | DACL_SECURITY_INFORMATION,
   &mut owner, null_mut(), &mut dacl, null_mut(), &mut security_descriptor)`。
3. `GetSecurityDescriptorControl` 获取 control flags/revision。
4. `GetSecurityDescriptorOwner` 与 `GetSecurityDescriptorDacl` 明确区分 owner、DACL present、null DACL、defaulted。
5. `GetAclInformation(AclSizeInformation)` + `GetAce` 按原顺序枚举。

ACE parser 至少支持：

- allow/deny：type 0/1；
- callback allow/deny：type 9/10；
- object allow/deny：type 5/6；
- callback-object allow/deny：type 11/12。

object ACE 根据 `ACE_OBJECT_TYPE_PRESENT` 和 `ACE_INHERITED_OBJECT_TYPE_PRESENT` 跳过对应 GUID，再定位 SID。未知 ACE 保留 type/header/flags；不能猜 trustee。raw mask 不调用 `MapGenericMask`。

- [ ] **Step 5：运行 Task 2 测试确认 GREEN**

Run:

```text
just test -p codex-windows-sandbox --lib legacy_diagnostics_captures_current_token_and_temp_path_as_owned_data
just test -p codex-windows-sandbox --lib legacy_diagnostics
```

Expected: all selected tests PASS；关闭 token handle 和释放 security descriptor 后仍可渲染 owned snapshot。

- [ ] **Step 6：提交 Task 2**

```text
git add codex-rs/windows-sandbox-rs/src/unified_exec/legacy_diagnostics.rs codex-rs/windows-sandbox-rs/src/unified_exec/legacy_diagnostics_tests.rs
git diff --cached --check
git diff --cached --stat
git commit -m "test(windows-sandbox): capture token and acl diagnostics"
```

## Task 3：暴露 ACL mutation 结果并保持 legacy 语义

**Files:**

- Modify: `codex-rs/windows-sandbox-rs/src/acl.rs:310-600`
- Modify: `codex-rs/windows-sandbox-rs/src/unified_exec/legacy_diagnostics.rs`
- Modify: `codex-rs/windows-sandbox-rs/src/unified_exec/legacy_diagnostics_tests.rs`

- [ ] **Step 1：写 legacy disposition RED 测试**

在 sibling test 文件新增完整转换测试：

```rust
#[test]
fn acl_mutation_attempt_preserves_legacy_failure_disposition() {
    let actual = [
        AclMutationAttempt::Changed.into_legacy_result().map_err(|err| err.to_string()),
        AclMutationAttempt::Unchanged.into_legacy_result().map_err(|err| err.to_string()),
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
```

- [ ] **Step 2：在 Windows 上运行确认 RED**

Run:

```text
just test -p codex-windows-sandbox --lib acl_mutation_attempt_preserves_legacy_failure_disposition
```

Expected: FAIL/compile error，因为 detailed outcome 尚未定义。

- [ ] **Step 3：实现 detailed outcome 与 observed helpers**

在 `acl.rs` 定义 crate-private 类型：

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum AclFailureDisposition {
    ReturnError,
    ReturnUnchanged,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum AclMutationAttempt {
    Changed,
    Unchanged,
    Failed {
        api: &'static str,
        code: u32,
        disposition: AclFailureDisposition,
    },
}

impl AclMutationAttempt {
    pub(crate) fn into_legacy_result(self) -> anyhow::Result<bool> {
        match self {
            Self::Changed => Ok(true),
            Self::Unchanged => Ok(false),
            Self::Failed {
                api,
                code,
                disposition: AclFailureDisposition::ReturnError,
            } => Err(anyhow!("{api} failed: {code}")),
            Self::Failed {
                disposition: AclFailureDisposition::ReturnUnchanged,
                ..
            } => Ok(false),
        }
    }
}
```

新增 `*_observed` helpers，返回 `AclMutationAttempt`。现有 public helpers 仅调用 observed helper 后
`into_legacy_result()`，保持原签名：

```rust
pub unsafe fn add_deny_write_ace(path: &Path, psid: *mut c_void) -> Result<bool> {
    add_deny_write_ace_observed(path, psid).into_legacy_result()
}
```

failure disposition 必须逐 API 保持现状：

- `ensure_allow_*` 的 Get/Set 失败：`ReturnError`；
- `add_allow_ace` 的 `GetNamedSecurityInfoW` 失败：`ReturnError`；其 Set 失败：`ReturnUnchanged`；
- `add_deny_ace` 的 `GetNamedSecurityInfoW` 失败：`ReturnError`；其 Set 失败：`ReturnUnchanged`。

- [ ] **Step 4：运行转换测试和 renderer tests 确认 GREEN**

Run:

```text
just test -p codex-windows-sandbox --lib acl_mutation_attempt_preserves_legacy_failure_disposition
just test -p codex-windows-sandbox --lib legacy_diagnostics
```

Expected: selected tests PASS；现有 public helper 签名无变化。

- [ ] **Step 5：提交 Task 3**

```text
git add codex-rs/windows-sandbox-rs/src/acl.rs codex-rs/windows-sandbox-rs/src/unified_exec/legacy_diagnostics.rs codex-rs/windows-sandbox-rs/src/unified_exec/legacy_diagnostics_tests.rs
git diff --cached --check
git diff --cached --stat
git commit -m "refactor(windows-sandbox): expose acl mutation diagnostics"
```

## Task 4：把 collector 接入 ACL 应用边界

**Files:**

- Modify: `codex-rs/windows-sandbox-rs/src/spawn_prep.rs:269-348`
- Modify: `codex-rs/windows-sandbox-rs/src/unified_exec/legacy_diagnostics.rs`
- Modify: `codex-rs/windows-sandbox-rs/src/unified_exec/legacy_diagnostics_tests.rs`

- [ ] **Step 1：写 collector operation RED 测试**

新增：

```rust
#[test]
fn legacy_diagnostics_collector_records_acl_attempts_without_changing_results() {
    let mut collector = LegacyDiagnosticsCollector::capture(vec![PathBuf::from(r"C:\workspace")]);
    collector.record_acl_attempt(
        LegacyAclOperationKind::DenyWrite,
        Path::new(r"C:\workspace\.git"),
        "S-1-15-3-100",
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
```

- [ ] **Step 2：实现 disabled wrapper 与 diagnostics impl**

保留现有 `apply_legacy_session_acl_rules` 签名；它创建 disabled collector 并委托：

```rust
pub(crate) fn apply_legacy_session_acl_rules(
    permissions: &ResolvedWindowsSandboxPermissions,
    codex_home: &Path,
    current_dir: &Path,
    env_map: &HashMap<String, String>,
    additional_deny_read_paths: &[PathBuf],
    additional_deny_write_paths: &[PathBuf],
    acl_sids: LegacyAclSids<'_>,
) -> Result<()> {
    let mut diagnostics = LegacyDiagnosticsCollector::disabled();
    apply_legacy_session_acl_rules_impl(
        permissions,
        codex_home,
        current_dir,
        env_map,
        additional_deny_read_paths,
        additional_deny_write_paths,
        acl_sids,
        &mut diagnostics,
    )
}

pub(crate) fn apply_legacy_session_acl_rules_with_diagnostics(
    permissions: &ResolvedWindowsSandboxPermissions,
    codex_home: &Path,
    current_dir: &Path,
    env_map: &HashMap<String, String>,
    additional_deny_read_paths: &[PathBuf],
    additional_deny_write_paths: &[PathBuf],
    acl_sids: LegacyAclSids<'_>,
    diagnostics: &mut LegacyDiagnosticsCollector,
) -> Result<()> {
    apply_legacy_session_acl_rules_impl(
        permissions,
        codex_home,
        current_dir,
        env_map,
        additional_deny_read_paths,
        additional_deny_write_paths,
        acl_sids,
        diagnostics,
    )
}
```

新增 private impl 使用同一组参数，并把 `diagnostics: &mut LegacyDiagnosticsCollector` 放在最后。

在 private impl 中：

- 保持 allow/deny path 的现有遍历与 ACL 应用顺序，不为日志稳定性改变权限操作顺序；
- 调用 `*_observed` 得到 attempt；
- 先 `record_acl_attempt`，再执行 `attempt.into_legacy_result()` 或按原 `let _ =` 语义忽略；
- `.codex`/`.agents` 不存在时记录 `SkippedMissing`；
- readonly、deny-read 和 NUL 行为保持现状。

不要让 diagnostics failure 进入 ACL apply 的主 `Result<()>`。

collector 的记录接口固定为：

```rust
impl LegacyDiagnosticsCollector {
    pub(crate) fn record_acl_attempt(
        &mut self,
        kind: LegacyAclOperationKind,
        path: &Path,
        sid: &str,
        attempt: &AclMutationAttempt,
    );

    pub(crate) fn record_acl_skipped_missing(
        &mut self,
        kind: LegacyAclOperationKind,
        path: &Path,
        sid: &str,
    );
}
```

Disabled collector 的两个方法立即返回；Capture collector 把 attempt 转成
`LegacyAclOperationOutcome` 并追加 owned path/SID。

- [ ] **Step 3：运行 collector tests**

Run:

```text
just test -p codex-windows-sandbox --lib legacy_diagnostics_collector_records_acl_attempts_without_changing_results
just test -p codex-windows-sandbox --lib legacy_diagnostics
```

Expected: selected tests PASS。

- [ ] **Step 4：检查非目标调用方签名未变化**

Run:

```text
rg -n -e 'apply_legacy_session_acl_rules\(' codex-rs/windows-sandbox-rs/src
```

Expected: `lib.rs` capture/preflight 及原调用方仍调用旧 wrapper；只有 unified legacy backend 后续会调用 `_with_diagnostics`。

- [ ] **Step 5：提交 Task 4**

```text
git add codex-rs/windows-sandbox-rs/src/spawn_prep.rs codex-rs/windows-sandbox-rs/src/unified_exec/legacy_diagnostics.rs codex-rs/windows-sandbox-rs/src/unified_exec/legacy_diagnostics_tests.rs
git diff --cached --check
git diff --cached --stat
git commit -m "test(windows-sandbox): observe legacy acl application"
```

## Task 5：接入 legacy backend 的 token/ACL 采集时序

**Files:**

- Modify: `codex-rs/windows-sandbox-rs/src/unified_exec/mod.rs:91-121`
- Modify: `codex-rs/windows-sandbox-rs/src/unified_exec/backends/legacy.rs:271-443`
- Modify: `codex-rs/windows-sandbox-rs/src/unified_exec/legacy_diagnostics.rs`

- [ ] **Step 1：定义 diagnostics request/output 和命名返回结构**

```rust
pub(crate) enum LegacyDiagnosticsRequest {
    Disabled,
    Capture { observed_paths: Vec<PathBuf> },
}

pub(crate) struct LegacySpawnWithDiagnostics {
    pub(crate) spawned: SpawnedProcess,
    pub(crate) report: LegacyDiagnosticsReport,
}
```

`LegacyDiagnosticsCollector::from_request` 对 capture paths 做 canonicalize、dedup、leaf priority 和祖先链展开；查询失败记录 error，不 panic。

在同一步实现 backend 所需的三个 collector 方法：

```rust
impl LegacyDiagnosticsCollector {
    pub(crate) fn from_request(request: LegacyDiagnosticsRequest) -> Self {
        match request {
            LegacyDiagnosticsRequest::Disabled => Self::disabled(),
            LegacyDiagnosticsRequest::Capture { observed_paths } => Self::capture(observed_paths),
        }
    }

    pub(crate) fn capture_token(
        &mut self,
        token: HANDLE,
        write_root_sids: &[RootCapabilitySid],
    );

    pub(crate) fn capture_paths(&mut self, stage: AclSnapshotStage);
}
```

`capture_token` 先把 `RootCapabilitySid { root, sid_str, .. }` 复制为 owned mapping，再调用 Task 2 的
`snapshot_token`；失败写入 `DiagnosticError`。`capture_paths` 对 collector 内保留的 observed paths 调用
`snapshot_path_security`，单路径失败只记录 error。

- [ ] **Step 2：把 backend 入口收敛到共享 impl**

在 `legacy.rs` 把当前逻辑移动到：

```rust
pub(super) struct LegacyBackendSpawn {
    pub(super) spawned: SpawnedProcess,
    pub(super) diagnostics: LegacyDiagnosticsOutput,
}

#[allow(clippy::too_many_arguments)]
pub(super) async fn spawn_windows_sandbox_session_legacy_impl(
    permission_profile: &PermissionProfile,
    workspace_roots: &[AbsolutePathBuf],
    codex_home: &Path,
    command: Vec<String>,
    cwd: &Path,
    mut env_map: HashMap<String, String>,
    timeout_ms: Option<u64>,
    additional_deny_read_paths: &[AbsolutePathBuf],
    additional_deny_write_paths: &[AbsolutePathBuf],
    tty: bool,
    stdin_open: bool,
    use_private_desktop: bool,
    diagnostics_request: LegacyDiagnosticsRequest,
) -> Result<LegacyBackendSpawn>;
```

严格保持以下顺序：

```rust
let mut diagnostics = LegacyDiagnosticsCollector::from_request(diagnostics_request);
let security = prepare_legacy_session_security(
    common.uses_write_capabilities,
    codex_home,
    cwd,
    capability_roots,
)?;
diagnostics.capture_token(
    security.h_token,
    &security.write_root_sids,
);
diagnostics.capture_paths(AclSnapshotStage::BeforeAcl);
apply_legacy_session_acl_rules_with_diagnostics(
    &common.permissions,
    codex_home,
    &common.current_dir,
    &env_map,
    &[],
    &additional_deny_write_paths,
    LegacyAclSids {
        readonly_sid: security.readonly_sid.as_ref(),
        readonly_sid_str: security.readonly_sid_str.as_deref(),
        write_root_sids: &security.write_root_sids,
    },
    &mut diagnostics,
)?;
diagnostics.capture_paths(AclSnapshotStage::AfterAcl);
let diagnostics = diagnostics.finish();
let (writer_tx, writer_rx) = mpsc::channel::<Vec<u8>>(128);
let (stdout_tx, stdout_rx) = broadcast::channel::<Vec<u8>>(256);
let stderr_rx = if tty {
    None
} else {
    Some(broadcast::channel::<Vec<u8>>(256))
};
let (exit_tx, exit_rx) = oneshot::channel::<i32>();
let LegacyProcessHandles {
    process: pi,
    output_join,
    writer_handle,
    hpc,
    mut conpty_owner,
    token_handle,
    desktop,
} = match spawn_legacy_process(
    security.h_token,
    &command,
    cwd,
    &env_map,
    use_private_desktop,
    tty,
    stdin_open,
    stdout_tx,
    stderr_rx.as_ref().map(|(tx, _rx)| tx.clone()),
    writer_rx,
    common.logs_base_dir.as_deref(),
) {
    Ok(handles) => handles,
    Err(err) => {
        unsafe {
            CloseHandle(security.h_token);
        }
        return Err(err);
    }
};
```

不要抽取新的单次调用 helper。完成上述替换后，保留当前 `legacy.rs:376-442` 的 process wait、ConPTY
cleanup、terminator、`ProcessDriver` 和 `finish_driver_spawn` 逻辑；只把最终表达式从
`Ok(finish_driver_spawn(driver, stdin_open))` 改为：

```rust
let spawned = finish_driver_spawn(driver, stdin_open);
Ok(LegacyBackendSpawn {
    spawned,
    diagnostics,
})
```

不要把 diagnostics 参数传入 `spawn_legacy_process`。报告必须在 child 启动前冻结。

- [ ] **Step 3：保留生产入口并新增 test-only 入口**

`unified_exec/mod.rs` 的 public production function 继续返回 `Result<SpawnedProcess>`，传入
`LegacyDiagnosticsRequest::Disabled` 并只取 `spawned`。

生产 wrapper 的 body 使用现有全部参数调用 impl：

```rust
let result = backends::legacy::spawn_windows_sandbox_session_legacy_impl(
    permission_profile,
    workspace_roots,
    codex_home,
    command,
    cwd,
    env_map,
    timeout_ms,
    additional_deny_read_paths,
    additional_deny_write_paths,
    tty,
    stdin_open,
    use_private_desktop,
    LegacyDiagnosticsRequest::Disabled,
)
.await?;
Ok(result.spawned)
```

新增：

```rust
#[cfg(test)]
#[allow(clippy::too_many_arguments)]
pub(crate) async fn spawn_windows_sandbox_session_legacy_with_diagnostics(
    permission_profile: &PermissionProfile,
    workspace_roots: &[AbsolutePathBuf],
    codex_home: &Path,
    command: Vec<String>,
    cwd: &Path,
    env_map: HashMap<String, String>,
    timeout_ms: Option<u64>,
    additional_deny_read_paths: &[AbsolutePathBuf],
    additional_deny_write_paths: &[AbsolutePathBuf],
    tty: bool,
    stdin_open: bool,
    use_private_desktop: bool,
    observed_paths: Vec<PathBuf>,
) -> Result<LegacySpawnWithDiagnostics>;
```

实现 body：

```rust
let result = backends::legacy::spawn_windows_sandbox_session_legacy_impl(
    permission_profile,
    workspace_roots,
    codex_home,
    command,
    cwd,
    env_map,
    timeout_ms,
    additional_deny_read_paths,
    additional_deny_write_paths,
    tty,
    stdin_open,
    use_private_desktop,
    LegacyDiagnosticsRequest::Capture { observed_paths },
)
.await?;
let LegacyDiagnosticsOutput::Captured(report) = result.diagnostics else {
    anyhow::bail!("legacy diagnostics request returned disabled output");
};
Ok(LegacySpawnWithDiagnostics {
    spawned: result.spawned,
    report,
})
```

- [ ] **Step 4：运行 diagnostics tests**

Run on Windows:

```text
just test -p codex-windows-sandbox --lib legacy_diagnostics
```

Expected: all diagnostics unit tests PASS。

- [ ] **Step 5：检查 production API diff**

Run:

```text
git diff -- codex-rs/windows-sandbox-rs/src/lib.rs codex-rs/windows-sandbox-rs/Cargo.toml
```

Expected: no output。

- [ ] **Step 6：提交 Task 5**

```text
git add codex-rs/windows-sandbox-rs/src/unified_exec/mod.rs codex-rs/windows-sandbox-rs/src/unified_exec/backends/legacy.rs codex-rs/windows-sandbox-rs/src/unified_exec/legacy_diagnostics.rs
git diff --cached --check
git diff --cached --stat
git commit -m "test(windows-sandbox): capture legacy spawn security state"
```

## Task 6：把目标回归测试接到诊断入口

**Files:**

- Modify: `codex-rs/windows-sandbox-rs/src/unified_exec/tests.rs:458-563`

- [ ] **Step 1：登记完整 leaf path 集合**

在目标测试创建完 fixture 后构造：

```rust
let observed_paths = vec![
    test_root.path().to_path_buf(),
    workspace.clone(),
    workspace_file.clone(),
    temp_root.clone(),
    temp_file.clone(),
    tmp_root.clone(),
    tmp_file.clone(),
    protected_git_dir.clone(),
    outside_root.clone(),
    outside_file.clone(),
];
```

collector 负责补齐 checkout/sandbox cwd 到卷根祖先链；测试不自行执行 `icacls`。

- [ ] **Step 2：改用 diagnostics spawn 并保持原行为参数**

把目标测试的调用替换为 `spawn_windows_sandbox_session_legacy_with_diagnostics`，除最后的
`observed_paths` 外，原参数逐项保持不变。解构：

```rust
let LegacySpawnWithDiagnostics {
    spawned,
    report: diagnostics,
} = spawn_windows_sandbox_session_legacy_with_diagnostics(
    &permission_profile,
    workspace_roots_for(workspace.as_path()).as_slice(),
    codex_home.path(),
    vec![
        "C:\\Windows\\System32\\cmd.exe".to_string(),
        "/d".to_string(),
        "/c".to_string(),
        script.display().to_string(),
    ],
    workspace.as_path(),
    env_map,
    /*timeout_ms*/ Some(5_000),
    /*additional_deny_read_paths*/ &[],
    /*additional_deny_write_paths*/ &[],
    /*tty*/ false,
    /*stdin_open*/ false,
    /*use_private_desktop*/ true,
    observed_paths,
)
.await
.expect("spawn legacy delete session with diagnostics");
```

- [ ] **Step 3：保持完整 tuple 断言并仅在失败时渲染**

保留 expected tuple：

```rust
let actual = (
    exit_code,
    workspace_file.exists(),
    temp_file.exists(),
    tmp_file.exists(),
    fs::read_to_string(&outside_file).ok(),
    protected_git_dir.is_dir(),
);
assert_eq!(
    actual,
    (0, false, false, false, Some("outside".to_string()), true),
    "stdout={stdout:?}\n{}\n{}",
    sandbox_log(codex_home.path()),
    diagnostics.render(),
);
```

不要修改删除脚本、env map、permission profile、timeout、tty/private desktop 或 expected tuple。

- [ ] **Step 4：在 Windows runner 上运行目标测试**

Run:

```text
just test -p codex-windows-sandbox --lib legacy_workspace_write_delete_is_limited_to_writable_roots
```

Expected by environment:

- GitHub-hosted x64 若原问题仍存在：FAIL，tuple 仍为
  `(0, false, false, false, None, false)`，并新增完整 bounded diagnostics report。
- 通过环境：PASS，不打印 diagnostics report。
- upstream ARM64 若权限过窄仍存在：FAIL，保留原 tuple 并附报告。
- runner DACL 若已漂移导致 PASS，不把 PASS 本身视为接线失败。

- [ ] **Step 5：运行 diagnostics unit tests**

Run:

```text
just test -p codex-windows-sandbox --lib legacy_diagnostics
```

Expected: all selected tests PASS。

- [ ] **Step 6：提交 Task 6**

```text
git add codex-rs/windows-sandbox-rs/src/unified_exec/tests.rs
git diff --cached --check
git diff --cached --stat
git commit -m "test(windows-sandbox): attach diagnostics to legacy delete test"
```

## Task 7：最终范围、格式和本地交付检查

**Files:**

- Modify only if generated by formatter: files changed in Task 1–6

- [ ] **Step 1：检查累计变更规模与范围**

Run:

```text
git diff --stat 566edff35
git diff --numstat 566edff35 -- codex-rs/windows-sandbox-rs
git status --short
```

Expected:

- 只出现设计/计划文档和 Task 1–6 列出的 Windows sandbox 文件；
- 无 `Cargo.toml`/`Cargo.lock`/CI/elevated backend 变更；
- 非机械代码变更目标小于 500 行且总变更不超过 800 行。

若非机械代码已超过 500 行，停止，不运行 formatter、不继续提交；回到设计边界拆分最小可交付阶段。

- [ ] **Step 2：按需决定 scoped fix**

如果最终 diff 被判断为“大改动”，先向用户请求明确授权运行：

```text
just fix -p codex-windows-sandbox
```

未获得授权时不得运行。若改动未达到大改动边界，跳过该命令。

- [ ] **Step 3：最后运行 formatter**

Run from `codex-rs`:

```text
just fmt
```

Expected: command exits 0。此后不重新运行测试。

- [ ] **Step 4：检查 formatter 结果**

Run:

```text
git diff --check
git status --short
git diff --stat 566edff35
```

Expected: no whitespace errors；formatter 未扩大文件范围。

- [ ] **Step 5：如 formatter 产生变更，创建独立本地提交**

只 stage formatter 实际修改的 Task 1–6 Rust 文件：

```text
git add codex-rs/windows-sandbox-rs/src/acl.rs codex-rs/windows-sandbox-rs/src/spawn_prep.rs codex-rs/windows-sandbox-rs/src/unified_exec/mod.rs codex-rs/windows-sandbox-rs/src/unified_exec/backends/legacy.rs codex-rs/windows-sandbox-rs/src/unified_exec/legacy_diagnostics.rs codex-rs/windows-sandbox-rs/src/unified_exec/legacy_diagnostics_tests.rs codex-rs/windows-sandbox-rs/src/unified_exec/tests.rs
git diff --cached --check
git diff --cached --stat
git commit -m "style(windows-sandbox): format legacy diagnostics"
```

若 `just fmt` 没有产生变更，不创建空提交。

- [ ] **Step 6：最终本地历史与 workspace 检查**

Run:

```text
git status --short
git log -8 --oneline --decorate
```

Expected:

- Rust 实现按 Task 1–6 保持独立本地提交；
- 设计与计划文档仍按用户后续提交指令处理，不擅自 stage；
- 没有执行任何远程命令。

## Task 8：Windows CI 证据交接门禁

**Files:** none

- [ ] **Step 1：把当前本地提交交给用户**

报告本地提交列表、未提交文档状态和需要用户自行执行的 fork CI。不要 push，不要调用 GitHub API。

- [ ] **Step 2：等待用户提供新的 CI 日志或 ZIP**

需要至少包含 GitHub-hosted Windows x64 shard 4 的目标测试失败输出。若用户还提供 Windows ARM64
或 upstream 自建 runner 日志，可做对照，但不是本实现阶段的阻塞条件。

- [ ] **Step 3：只读验收诊断完成标准**

新日志必须同时包含：

- 原始 tuple；
- TokenUser/TokenGroups/TokenRestrictedSids；
- writable root 到 capability SID 映射；
- allow/deny ACL mutation 结果或 Win32 error；
- before/after path snapshots；
- parent `FILE_DELETE_CHILD` 与 target `DELETE` 所需材料；
- 明确 truncation metadata（若触发）。

缺少任一关键 section 时，不宣称诊断完成；回到对应任务补足。诊断完成后另开新的设计轮次决定安全修复，不在本计划中直接修改权限模型。
