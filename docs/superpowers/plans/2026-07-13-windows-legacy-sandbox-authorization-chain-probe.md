# Windows legacy sandbox 授权链诊断实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一次性的 Windows legacy sandbox 授权链 probe，在同一 `probe_id` 下关联 parent token、`CreateRestrictedToken` 前后、legacy spawn、restricted child、raw security descriptor、三路授权 API、四类受控 ACL fixture 与 runner 环境证据，并通过 x64/arm64 CI artifact 对照缩小根因。

**Architecture:** 将现有测试内 PowerShell probe 迁移为 crate-root 的 Windows-only 临时诊断模块族，Rust 负责稳定 JSONL schema、token/spawn/security/Authz 取证、manifest 与 artifact 完整性；restricted child 仍执行真实文件 I/O，parent/backend hooks 通过仅测试环境变量启用。生产入口与公共 `SpawnedProcess` 不新增长期 API；一次性内部诊断允许侵入 token、process 与 legacy backend，最终按提交逆序逐个 revert。

**Tech Stack:** Rust 2024、`windows-sys` Win32 Security/Authorization/FileSystem/Threading API、PowerShell restricted-child probe、Serde JSON Lines、GitHub Actions reusable workflow、nextest、`actionlint`。

---

## 实施前状态与固定边界

- 当前分支必须是 `dev`。
- 已确认设计：`docs/superpowers/specs/2026-07-13-windows-legacy-sandbox-authorization-chain-probe-design.md`。
- 第一轮临时实现提交仍在历史中，且必须保持原顺序：
  - `f783fff6b`：delete access probe。
  - `0470ae4ff`：stdout 持久化。
  - `84a56dcb2`：reusable workflow artifact 通道。
  - `347ed4b40`：x64/arm64 启用。
- 第一轮设计与计划已由 `5b6c23de8` 提交；第二轮设计和本计划由计划编写阶段统一提交，不属于临时实现回退链。
- 第二轮每个 Task 形成一个独立本地提交，并把明确 Task 编号、完整 SHA、subject 追加到 `.git/codex-windows-authorization-probe-commits.tsv`。Task 14 在用户确认 research 已保存后，只根据该清单逆序 revert 第二轮临时提交，再逆序 revert第一轮四个临时提交；每个原提交对应一个 revert commit。
- 不修改公共 `codex_utils_pty::SpawnedProcess`。child PID 从 legacy backend 已有 `PROCESS_INFORMATION.dwProcessId` 取证，通过内部 `AuthorizationProbeSpawnContext` 传递。
- 默认不新增 crate 依赖。优先使用现有 `serde`、`serde_json`、`base64`、`chrono`、`windows-sys`。
- 若实现只扩充现有 `windows-sys` feature，不运行 `just bazel-lock-update`；只有 `Cargo.toml` 或 `Cargo.lock` 出现实际依赖版本/包变化时才运行该命令并把 `MODULE.bazel.lock` 纳入同一 Task。
- probe 保持 Rust 源内字符串或 Rust 原生实现；默认不外置 `.ps1`。若后续确认必须新增外置脚本，必须在同一 Task 更新 `codex-rs/windows-sandbox-rs/BUILD.bazel` 的 `compile_data`，并先重新确认扩大范围。
- 本地 macOS 只执行格式、静态检查和非 Windows 单元测试；Windows-only 行为以用户自行触发的 x64/arm64 CI artifact 为准。
- 所有需要本地 RED/GREEN 的纯数据类型与转换函数都放在 `authorization_probe_schema.rs`，测试放在 `authorization_probe_schema_tests.rs`；`authorization_probe/{token,spawn,security_descriptor,access,fixtures,environment}.rs` 只放 Windows FFI 和 handle lifecycle，并只在 `#[cfg(all(test, windows))]` 下编译。

## 文件结构

- Create: `codex-rs/windows-sandbox-rs/src/authorization_probe/mod.rs` — probe 总入口、启用条件、`probe_id`、上下文和输出 sink。
- Create: `codex-rs/windows-sandbox-rs/src/authorization_probe_schema.rs` — 可在 macOS/Linux `#[cfg(test)]` 编译的 schema v2、manifest、attribute decode、动态 buffer 状态机、纯序列化与分文件 JSONL 完整性逻辑。
- Create: `codex-rs/windows-sandbox-rs/src/authorization_probe_schema_tests.rs` — 跨平台 schema/conversion/manifest RED-GREEN 测试。
- Create: `codex-rs/windows-sandbox-rs/src/authorization_probe/schema.rs` — Windows FFI probe 对跨平台 schema 的 re-export 与 Windows-specific payload 类型。
- Create: `codex-rs/windows-sandbox-rs/src/authorization_probe/token.rs` — token information 两次 buffer 查询、SID/privilege 序列化。
- Create: `codex-rs/windows-sandbox-rs/src/authorization_probe/spawn.rs` — parent/backend/child 关联记录和安全摘要。
- Create: `codex-rs/windows-sandbox-rs/src/authorization_probe/security_descriptor.rs` — raw SD、SDDL、control flags、ACE 保序解析。
- Create: `codex-rs/windows-sandbox-rs/src/authorization_probe/access.rs` — `DuplicateTokenEx`、`AccessCheck`、`AuthzAccessCheck`、`CreateFileW` 三路结果。
- Create: `codex-rs/windows-sandbox-rs/src/authorization_probe/fixtures.rs` — 四类 sacrificial ACL fixture 和回读验证。
- Create: `codex-rs/windows-sandbox-rs/src/authorization_probe/environment.rs` — OS/runner/volume/reparse/filter 证据。
- Create: `codex-rs/windows-sandbox-rs/src/authorization_probe/tests.rs` — 仅 Windows FFI wiring、handle lifecycle 与 API 调用测试；不承载跨平台 RED/GREEN。
- Move: `codex-rs/windows-sandbox-rs/src/unified_exec/legacy_temporary_diagnostics.rs` → `codex-rs/windows-sandbox-rs/src/authorization_probe/legacy_acl.rs`，必须使用 `git mv`。
- Modify: `codex-rs/windows-sandbox-rs/src/lib.rs:1-125` — 分别注册跨平台测试 schema 与 Windows-only FFI 模块。
- Modify: `codex-rs/windows-sandbox-rs/src/token.rs:145-483` — `CreateRestrictedToken` 前后 hooks。
- Modify: `codex-rs/windows-sandbox-rs/src/process.rs:70-190` — `CreateProcessAsUserW` 边界 hooks。
- Modify: `codex-rs/windows-sandbox-rs/src/process.rs:250-285` — `spawn_process_with_pipes` 调用点显式传 `/*probe*/ None`。
- Modify: `codex-rs/windows-sandbox-rs/src/lib.rs:550-580` — legacy direct spawn 调用点显式传 `/*probe*/ None`。
- Modify: `codex-rs/windows-sandbox-rs/src/unified_exec/mod.rs:1-125` — 移除旧模块声明，内部传递 probe context。
- Modify: `codex-rs/windows-sandbox-rs/src/unified_exec/backends/legacy.rs:285-479` — 创建 probe context、记录 spawn/child token。
- Modify: `codex-rs/windows-sandbox-rs/src/unified_exec/tests.rs:140-910` — 端到端 fixture、restricted-child 命令、stdout/manifest 断言。
- Modify: `codex-rs/windows-sandbox-rs/Cargo.toml:42-91` — 仅在缺少 Win32 API feature 时扩充 feature。
- Modify: `.github/workflows/rust-ci-full-nextest-platform.yml:35-57,364-451` — schema v2 输出目录、完整性检查和 artifact。
- Modify: `.github/workflows/rust-ci-full.yml:468-493` — x64/arm64 显式启用授权链 probe。
- Modify after CI: `docs/superpowers/research/2026-07-12-windows-legacy-sandbox-diagnostics/current-findings.md`。
- Modify after CI: `docs/superpowers/research/2026-07-12-windows-legacy-sandbox-diagnostics/execution-log.md`。

## 实施启动门禁：冻结 base 与逐 Task SHA manifest

在执行 Task 1 任何源码变更前，先确认第二轮设计与本计划已经作为文档提交存在，然后执行：

Run: `git rev-parse HEAD | tee .git/codex-windows-authorization-probe-base-sha`

Expected: 输出文档提交的完整 SHA。该 SHA 是唯一 implementation base；不得使用 `HEAD~N`、`5b6c23de8` 或宽泛历史范围替代。

初始化空的 `.git/codex-windows-authorization-probe-commits.tsv`。每个 Task commit 完成后，先运行 `git rev-parse HEAD` 取得完整 SHA，再人工追加一行 `task_number<TAB>sha<TAB>subject`；禁止用 shell command substitution。Task 12 最终检查和 Task 14 回退只使用这两个 `.git` 内文件。

### Task 1: 建立 schema v2、probe context 与 manifest 纯结构

**Files:**
- Create: `codex-rs/windows-sandbox-rs/src/authorization_probe/mod.rs`
- Create: `codex-rs/windows-sandbox-rs/src/authorization_probe_schema.rs`
- Create: `codex-rs/windows-sandbox-rs/src/authorization_probe_schema_tests.rs`
- Create: `codex-rs/windows-sandbox-rs/src/authorization_probe/schema.rs`
- Create: `codex-rs/windows-sandbox-rs/src/authorization_probe/tests.rs`
- Modify: `codex-rs/windows-sandbox-rs/src/lib.rs:1-125`

- [ ] **Step 1: 写 schema 编码失败测试**

在 `authorization_probe_schema_tests.rs` 定义固定样例，断言所有记录拥有共同 envelope，manifest 在缺文件时为不完整；在 `authorization_probe_schema.rs` 末尾用显式 path 注册：

```rust
#[cfg(test)]
#[path = "authorization_probe_schema_tests.rs"]
mod tests;
```

```rust
#[test]
fn record_serializes_stable_envelope() {
    let record = ProbeRecord::success(
        ProbeContext::for_test("probe-123", "x86_64-pc-windows-msvc", "4"),
        ProbePhase::ParentToken,
        "token",
        "base",
        "serialize",
        serde_json::json!({"user_sid":"S-1-5-21-test"}),
    );
    let value = serde_json::to_value(record).expect("serialize record");
    assert_eq!(value["schema"], AUTHORIZATION_PROBE_SCHEMA);
    assert_eq!(value["probe_id"], "probe-123");
    assert_eq!(value["success"], true);
    assert_eq!(value["win32_error"], serde_json::Value::Null);
}

#[test]
fn manifest_marks_missing_required_file_incomplete() {
    let manifest = ProbeManifest::for_test(["parent.jsonl", "child.jsonl"])
        .with_generated_file("parent.jsonl", 2, true);
    assert!(!manifest.complete);
    assert_eq!(manifest.missing_files, vec!["child.jsonl"]);
}
```

- [ ] **Step 2: 运行测试并确认红灯**

Run: `cd codex-rs && just test -p codex-windows-sandbox authorization_probe_schema::tests::record_serializes_stable_envelope`

Expected: FAIL，错误包含 `ProbeRecord`、`ProbeContext` 或 `AUTHORIZATION_PROBE_SCHEMA` 未定义。

- [ ] **Step 3: 实现最小 schema 与 context**

在跨平台 `authorization_probe_schema.rs` 定义并保持后续 Task 使用的精确类型；该文件不得 import `windows-sys` 或任何 Windows handle 类型：

```rust
pub(crate) const AUTHORIZATION_PROBE_SCHEMA: u32 = 2;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum ProbePhase {
    ParentToken,
    RestrictedToken,
    Spawn,
    ChildToken,
    SecurityDescriptor,
    Access,
    Fixture,
    Environment,
    Manifest,
    ProbeError,
}

#[derive(Clone, Debug)]
pub(crate) struct ProbeContext {
    pub(crate) probe_id: String,
    pub(crate) run_arch: String,
    pub(crate) target: String,
    pub(crate) shard: String,
    pub(crate) output_dir: PathBuf,
    pub(crate) host_pid: u32,
}

#[derive(Debug, Serialize)]
pub(crate) struct ProbeRecord {
    pub(crate) schema: u32,
    pub(crate) probe_id: String,
    pub(crate) run_arch: String,
    pub(crate) phase: ProbePhase,
    pub(crate) source: String,
    pub(crate) key: String,
    pub(crate) operation: String,
    pub(crate) success: bool,
    pub(crate) win32_error: Option<u32>,
    pub(crate) payload: serde_json::Value,
}
```

`ProbeManifest` 精确包含 `schema`、`probe_id`、`target`、`shard`、`run_arch`、`host_pid`、`child_pid: Option<u32>`、`files: Vec<ManifestFile>`、`complete`、`missing_files`、`errors`。`ProbeContext::from_env()` 只在 `CODEX_WINDOWS_LEGACY_AUTHORIZATION_PROBE_DIR` 存在时返回 `Some`，`probe_id` 使用时间戳、host PID 与 128-bit 随机值组成，禁止复用。

- [ ] **Step 4: 注册仅 Windows 测试模块并跑绿灯**

在 `lib.rs` 加入两个独立 cfg；`authorization_probe` 的 FFI 子模块不得被 macOS/Linux test 编译：

```rust
#[cfg(test)]
mod authorization_probe_schema;

#[cfg(all(test, windows))]
mod authorization_probe;
```

Run: `cd codex-rs && just test -p codex-windows-sandbox authorization_probe_schema::tests`

Expected: PASS，2 tests passed。

- [ ] **Step 5: 提交 Task 1**

```bash
git add codex-rs/windows-sandbox-rs/src/authorization_probe_schema.rs codex-rs/windows-sandbox-rs/src/authorization_probe_schema_tests.rs codex-rs/windows-sandbox-rs/src/authorization_probe codex-rs/windows-sandbox-rs/src/lib.rs
git diff --cached --check
git commit -m "test(windows-sandbox): define authorization probe schema"
```

### Task 2: 用 git mv 迁移旧 ACL 诊断并拆分模块骨架

**Files:**
- Move: `codex-rs/windows-sandbox-rs/src/unified_exec/legacy_temporary_diagnostics.rs` → `codex-rs/windows-sandbox-rs/src/authorization_probe/legacy_acl.rs`
- Create: `codex-rs/windows-sandbox-rs/src/authorization_probe/token.rs`
- Create: `codex-rs/windows-sandbox-rs/src/authorization_probe/spawn.rs`
- Create: `codex-rs/windows-sandbox-rs/src/authorization_probe/security_descriptor.rs`
- Create: `codex-rs/windows-sandbox-rs/src/authorization_probe/access.rs`
- Create: `codex-rs/windows-sandbox-rs/src/authorization_probe/fixtures.rs`
- Create: `codex-rs/windows-sandbox-rs/src/authorization_probe/environment.rs`
- Modify: `codex-rs/windows-sandbox-rs/src/authorization_probe/mod.rs`
- Modify: `codex-rs/windows-sandbox-rs/src/unified_exec/mod.rs:1-16`

- [ ] **Step 1: 写模块边界编译测试**

在 `authorization_probe/tests.rs` 导入每个模块的单一 public-in-crate 入口：

```rust
#[test]
fn module_contracts_are_available() {
    let _: fn(_, _, _) -> _ = token::serialize_token;
    let _: fn(_, _, _) -> _ = security_descriptor::serialize_path_security;
    let _: fn(_, _, _, _) -> _ = access::run_access_triplet;
    let _: fn(_, _) -> _ = fixtures::create_fixture_set;
    let _: fn(_) -> _ = environment::collect_environment;
}
```

- [ ] **Step 2: 运行测试确认入口不存在**

Run on Windows CI only: `just test -p codex-windows-sandbox module_contracts_are_available`

Expected: FAIL，至少一个模块或函数 unresolved。

- [ ] **Step 3: 执行语义移动并建立职责明确的模块**

Run: `git mv codex-rs/windows-sandbox-rs/src/unified_exec/legacy_temporary_diagnostics.rs codex-rs/windows-sandbox-rs/src/authorization_probe/legacy_acl.rs`

在 `unified_exec/mod.rs` 删除旧的 `mod legacy_temporary_diagnostics;`。在 `authorization_probe/mod.rs` 声明七个子模块，并提供暂时返回 `ProbeError::NotImplementedForPhase` 的精确签名；不要复制旧文件内容，不要建立只被调用一次的小 helper。

- [ ] **Step 4: 更新 legacy backend 的旧路径引用并验证移动**

把 `legacy_temporary_diagnostics::dump_path_acls` 改为 `crate::authorization_probe::legacy_acl::dump_path_acls`。Run: `git diff --summary`。

Expected: 输出包含 rename，similarity 高于 90%，没有旧路径残留。

- [ ] **Step 5: 跑模块测试和格式检查**

Run on Windows CI only: `just test -p codex-windows-sandbox module_contracts_are_available`

Expected: PASS。

- [ ] **Step 6: 提交 Task 2**

```bash
git add codex-rs/windows-sandbox-rs/src/authorization_probe codex-rs/windows-sandbox-rs/src/unified_exec
git diff --cached --check
git commit -m "test(windows-sandbox): split authorization probe modules"
```

### Task 3: 实现完整 token serializer

**Files:**
- Modify: `codex-rs/windows-sandbox-rs/src/authorization_probe/token.rs`
- Modify: `codex-rs/windows-sandbox-rs/src/authorization_probe_schema.rs`
- Modify: `codex-rs/windows-sandbox-rs/src/authorization_probe_schema_tests.rs`

- [ ] **Step 1: 写 token buffer 与 attributes 转换测试**

定义纯转换输入并深比较整个对象：

```rust
#[test]
fn group_attributes_keep_enabled_deny_only_and_logon_bits() {
    let actual = decode_group_attributes(0xC000_0014);
    assert_eq!(
        actual,
        GroupAttributes {
            raw: 0xC000_0014,
            enabled: true,
            enabled_by_default: false,
            deny_only: true,
            integrity: false,
            logon_id: true,
        }
    );
}
```

`decode_group_attributes` 是 `authorization_probe_schema.rs` 中的跨平台纯函数，不引用 Windows-only token 模块。再加入跨平台 `VariableBufferQuery` 纯状态机/adapter 测试：adapter 第一次报告 `required_len`，第二次接收精确长度 buffer 并返回 bytes，断言不会截断模拟的 `TokenGroups` 和 `TokenPrivileges`；Windows `GetTokenInformation` FFI 只负责调用该 adapter，不在 FFI 层复制 buffer 状态机。

- [ ] **Step 2: 运行红灯测试**

Run: `cd codex-rs && just test -p codex-windows-sandbox authorization_probe_schema::tests::group_attributes_keep_enabled_deny_only_and_logon_bits`

Expected: FAIL，`decode_group_attributes` 未定义。

- [ ] **Step 3: 实现 token schema 和查询**

`TokenSnapshot`、attribute decoder、动态 buffer 纯状态机/adapter 和所有无 handle 的 payload 类型放在跨平台 `authorization_probe_schema.rs`；Windows `GetTokenInformation` 查询留在 `authorization_probe/token.rs`，且只调用跨平台 adapter。`TokenSnapshot` 必须精确包含：

```rust
#[derive(Debug, PartialEq, Serialize)]
pub(crate) struct TokenSnapshot {
    pub(crate) user: SidEntry,
    pub(crate) groups: Vec<SidEntry>,
    pub(crate) restricted_sids: Vec<SidEntry>,
    pub(crate) privileges: Vec<PrivilegeEntry>,
    pub(crate) elevation: Option<bool>,
    pub(crate) elevation_type: Option<u32>,
    pub(crate) integrity_level: Option<SidEntry>,
    pub(crate) mandatory_policy: Option<u32>,
    pub(crate) session_id: Option<u32>,
    pub(crate) token_type: Option<u32>,
    pub(crate) impersonation_level: Option<u32>,
    pub(crate) source: Option<TokenSourceSnapshot>,
    pub(crate) origin_luid: Option<LuidSnapshot>,
    pub(crate) statistics: Option<TokenStatisticsSnapshot>,
    pub(crate) field_errors: Vec<FieldError>,
}
```

所有 `GetTokenInformation` 类别使用同一个“两次调用但逐字段隔离错误”的 buffer helper。SID 同时记录字符串、`LookupAccountSidW` 名称/域、raw attributes；名称失败保留 SID 和 Win32 error。privilege 记录 LUID、`LookupPrivilegeNameW` 结果与 raw attributes。

- [ ] **Step 4: 跑纯测试与 Windows cross-check**

Run: `cd codex-rs && just test -p codex-windows-sandbox authorization_probe_schema::tests`

Expected: PASS。

Run when Windows target is installed: `cd codex-rs && cargo check -p codex-windows-sandbox --target x86_64-pc-windows-msvc --tests`

Expected: PASS；若本机未安装 target，记录“由 CI 验证”，不得安装。

- [ ] **Step 5: 提交 Task 3**

```bash
git add codex-rs/windows-sandbox-rs/src/authorization_probe codex-rs/windows-sandbox-rs/src/authorization_probe_schema.rs codex-rs/windows-sandbox-rs/src/authorization_probe_schema_tests.rs
git diff --cached --check
git commit -m "test(windows-sandbox): serialize complete token state"
```

### Task 4: 在 base token 与 CreateRestrictedToken 前后加入 hooks

**Files:**
- Modify: `codex-rs/windows-sandbox-rs/src/token.rs:145-483`
- Modify: `codex-rs/windows-sandbox-rs/src/authorization_probe/mod.rs`
- Modify: `codex-rs/windows-sandbox-rs/src/authorization_probe/token.rs`

- [ ] **Step 1: 写 hook 顺序测试**

用内存 sink 调用 `record_token_transition`，断言 phase 顺序和 stable key：

```rust
assert_eq!(
    sink.records().iter().map(|record| (&record.phase, record.key.as_str())).collect::<Vec<_>>(),
    vec![
        (&ProbePhase::ParentToken, "base_process_token"),
        (&ProbePhase::RestrictedToken, "create_restricted_token_output"),
    ]
);
```

- [ ] **Step 2: 运行红灯测试**

Run on Windows CI only: `just test -p codex-windows-sandbox token_transition`

Expected: FAIL，hook 未实现。

- [ ] **Step 3: 接入实际 token 创建位置**

在 `get_current_token_for_restriction()` 成功后、`CreateRestrictedToken` 调用前记录 base token；在 `CreateRestrictedToken` 成功后且任何 `SetTokenInformation` 调整前记录 raw restricted output，再在全部调整后记录 `restricted_token_final`。通过 thread-local 或显式内部 `Option<&AuthorizationProbeContext>` 传递，仅在测试环境变量启用，禁止改变非 probe 返回值和错误路径。

- [ ] **Step 4: 验证失败隔离**

新增 sink 故障测试：写盘失败时 `CreateRestrictedToken` 仍返回原业务结果，同时 manifest errors 包含 `source=token operation=write_record`。

Run: `cd codex-rs && just test -p codex-windows-sandbox authorization_probe_schema::tests`

Expected: PASS。

- [ ] **Step 5: 提交 Task 4**

```bash
git add codex-rs/windows-sandbox-rs/src/token.rs codex-rs/windows-sandbox-rs/src/authorization_probe
git diff --cached --check
git commit -m "test(windows-sandbox): trace restricted token creation"
```

### Task 5: 记录 legacy spawn、CreateProcessAsUserW、probe_id 与 child 关联

**Files:**
- Modify: `codex-rs/windows-sandbox-rs/src/process.rs:70-190`
- Modify: `codex-rs/windows-sandbox-rs/src/process.rs:250-285`
- Modify: `codex-rs/windows-sandbox-rs/src/lib.rs:550-580`
- Modify: `codex-rs/windows-sandbox-rs/src/unified_exec/mod.rs:94-123`
- Modify: `codex-rs/windows-sandbox-rs/src/unified_exec/backends/legacy.rs:285-479`
- Modify: `codex-rs/windows-sandbox-rs/src/authorization_probe/spawn.rs`
- Modify: `codex-rs/windows-sandbox-rs/src/authorization_probe_schema.rs`
- Modify: `codex-rs/windows-sandbox-rs/src/authorization_probe_schema_tests.rs`

- [ ] **Step 1: 写安全摘要和关联测试**

测试 command line 只保留 executable、参数计数和参数类别，不输出参数值；环境只允许 `RUNNER_*`、`ImageOS`、`ImageVersion`、`TEMP`、`TMP`、`PROCESSOR_ARCHITECTURE` 和 probe 自身字段。

```rust
assert_eq!(
    summarize_command(&["powershell.exe".into(), "-File".into(), "C:\\secret\\probe.ps1".into()]),
    CommandSummary { executable: "powershell.exe".into(), argument_count: 2, argument_kinds: vec!["switch", "path"] }
);
```

- [ ] **Step 2: 运行红灯测试**

Run: `cd codex-rs && just test -p codex-windows-sandbox authorization_probe_schema::tests::summarize_command_redacts_values`

Expected: FAIL。

- [ ] **Step 3: 定义内部 spawn context，不改公共 SpawnedProcess**

```rust
pub(crate) struct AuthorizationProbeSpawnContext {
    pub(crate) probe: ProbeContext,
    pub(crate) parent_token_statistics: TokenStatisticsSnapshot,
    pub(crate) child_pid: Option<u32>,
}
```

`spawn_windows_sandbox_session_legacy` 公共签名保持不变；backend 从 probe 环境创建 context，并把 `probe_id` 注入 child env `CODEX_WINDOWS_LEGACY_AUTHORIZATION_PROBE_ID`。`process.rs::create_process_as_user` 新增最后一个仅 crate 内部的 `probe: Option<&ProbeContext>` 参数，记录 token statistics、cwd、creation flags、startup flags、desktop 是否设置、handle inheritance、成功/错误、`dwProcessId`、`dwThreadId`。

必须枚举并更新 `create_process_as_user` 的两个现有调用点：

```rust
// process.rs::spawn_process_with_pipes，非 probe 通道。
create_process_as_user(
    h_token,
    argv,
    cwd,
    env_map,
    logs_base_dir,
    Some((in_r, out_w, stderr_handle)),
    use_private_desktop,
    /*probe*/ None,
)

// lib.rs:565 的 direct legacy spawn，非 unified-exec probe 通道。
create_process_as_user(
    security.h_token,
    &command,
    cwd,
    &env_map,
    logs_base_dir,
    Some((in_r, out_w, err_w)),
    use_private_desktop,
    /*probe*/ None,
)
```

unified-exec legacy backend 的 probe 调用传 `Some(&probe_context)`。opaque `None` 必须使用精确 `/*probe*/` argument comment。

- [ ] **Step 4: 打开 child token 并建立相关性**

`CreateProcessAsUserW` 成功后用 `OpenProcessToken(pi.hProcess, TOKEN_QUERY, ...)` 记录 parent-visible child token；restricted child 启动后自行记录 process token。manifest 写入真实 child PID，不再使用 host PID 冒充 child PID。每次 probe 使用同一 output dir 下的两阶段目录生命周期。pre-spawn 阶段先创建：

```text
${output_dir}/.staging-${probe_id}/
```

parent、restricted token、fixture 与 backend 的 pre-spawn 记录先写入 staging 目录。拿到真实 child PID 后，关闭当前目录 handle，并在同一 output dir 内原子 rename 为最终目录：

```text
${output_dir}/windows-legacy-authorization-probe-${target}-shard-${shard}-host-${host_pid}-child-${child_pid}-schema-v2-${probe_id}/
```

若 spawn 失败、没有 child PID，则把 staging 目录原子 rename 为：

```text
${output_dir}/windows-legacy-authorization-probe-${target}-shard-${shard}-host-${host_pid}-child-failed-spawn-schema-v2-${probe_id}/
```

成功和失败目录内都固定包含 `manifest.json`、`parent.jsonl`、`backend.jsonl`、`child.jsonl`、`fixtures.jsonl`、`environment.jsonl`、`stdout.log`；spawn 失败时 `child.jsonl` 可为空，但必须生成 `complete=false` manifest 和 `probe_error`，明确记录 child PID 不可取得的状态。不得使用 `unknown` 冒充 PID，也不得把全部记录合并为一个长 JSONL 文件。

- [ ] **Step 5: 跑测试并提交**

Run: `cd codex-rs && just test -p codex-windows-sandbox authorization_probe_schema::tests`

Expected: PASS。

```bash
git add codex-rs/windows-sandbox-rs/src/process.rs codex-rs/windows-sandbox-rs/src/lib.rs codex-rs/windows-sandbox-rs/src/unified_exec codex-rs/windows-sandbox-rs/src/authorization_probe codex-rs/windows-sandbox-rs/src/authorization_probe_schema.rs codex-rs/windows-sandbox-rs/src/authorization_probe_schema_tests.rs
git diff --cached --check
git commit -m "test(windows-sandbox): correlate legacy spawn tokens"
```

### Task 6: 采集 raw security descriptor、SDDL 与 ACE 顺序

**Files:**
- Modify: `codex-rs/windows-sandbox-rs/src/authorization_probe/legacy_acl.rs`
- Modify: `codex-rs/windows-sandbox-rs/src/authorization_probe/security_descriptor.rs`
- Modify: `codex-rs/windows-sandbox-rs/src/authorization_probe_schema.rs`
- Modify: `codex-rs/windows-sandbox-rs/src/authorization_probe_schema_tests.rs`
- Modify conditionally: `codex-rs/windows-sandbox-rs/Cargo.toml:42-91`

- [ ] **Step 1: 写 ACE 保序和 raw bytes 测试**

构造三个 synthetic ACE headers，断言 serializer 保持 `[deny, allow, inherited_allow]` 输入顺序，且 raw self-relative descriptor 使用标准 base64 完整编码，不按字节数截断。

- [ ] **Step 2: 运行红灯测试**

Run: `cd codex-rs && just test -p codex-windows-sandbox authorization_probe_schema::tests::ace_order_is_preserved`

Expected: FAIL。

- [ ] **Step 3: 实现 PathSecuritySnapshot**

```rust
pub(crate) struct PathSecuritySnapshot {
    pub(crate) requested_path: String,
    pub(crate) canonical_path: Option<String>,
    pub(crate) final_path: Option<String>,
    pub(crate) file_attributes: Option<u32>,
    pub(crate) reparse_tag: Option<u32>,
    pub(crate) owner: Option<SidEntry>,
    pub(crate) group: Option<SidEntry>,
    pub(crate) raw_security_descriptor_base64: Option<String>,
    pub(crate) sddl_owner_group_dacl: Option<String>,
    pub(crate) sddl_sacl: Option<String>,
    pub(crate) control: Option<u16>,
    pub(crate) dacl: AclSnapshot,
    pub(crate) sacl_error: Option<FieldError>,
    pub(crate) field_errors: Vec<FieldError>,
}
```

安全描述符必须分两次读取，不能让 SACL 权限失败丢失主证据：

1. 第一次 `GetNamedSecurityInfoW` 只请求 `OWNER_SECURITY_INFORMATION | GROUP_SECURITY_INFORMATION | DACL_SECURITY_INFORMATION`，这次结果生成 raw self-relative descriptor、O/G/D SDDL、control flags 与 DACL ACE 主证据。
2. 第二次独立请求 `SACL_SECURITY_INFORMATION`，成功时生成 S SDDL 与 SACL ACE；`ERROR_ACCESS_DENIED` 或 privilege 缺失只写入 `sacl_error`，不得修改第一步成功状态。

`AceSnapshot` 保留 index、type、flags、mask、SID、inherited、object_type_guid、inherited_object_type_guid 与 raw bytes。

- [ ] **Step 4: 接入原有五类目标和父目录**

stable key 固定为 `workspace`、`temp`、`tmp`、`outside`、`protected_git`；每个 key 生成 `object` 与 `parent` 两条 SD 记录，并保留 ancestor diagnostics 作为独立 `legacy_acl` source，不排序 ACE。

- [ ] **Step 5: 检查 windows-sys feature**

若编译器报告缺少 API module，只补充精确 feature；不改版本。Run: `git diff -- codex-rs/windows-sandbox-rs/Cargo.toml codex-rs/Cargo.lock MODULE.bazel.lock`。

Expected: 默认无依赖版本变化。只有 `Cargo.toml` 或 `Cargo.lock` 确实变化时才执行 `just bazel-lock-update`；只有各文件确实变化时才分别 stage `Cargo.toml`、`Cargo.lock`、`MODULE.bazel.lock`，禁止把未变化路径硬塞进 `git add`。

- [ ] **Step 6: 跑测试并提交**

Run: `cd codex-rs && just test -p codex-windows-sandbox authorization_probe_schema::tests`

Expected: PASS。

```bash
git add codex-rs/windows-sandbox-rs/src/authorization_probe codex-rs/windows-sandbox-rs/src/authorization_probe_schema.rs codex-rs/windows-sandbox-rs/src/authorization_probe_schema_tests.rs
git diff --quiet -- codex-rs/windows-sandbox-rs/Cargo.toml || git add codex-rs/windows-sandbox-rs/Cargo.toml
git diff --quiet -- codex-rs/Cargo.lock || git add codex-rs/Cargo.lock
git diff --quiet -- MODULE.bazel.lock || git add MODULE.bazel.lock
git diff --cached --check
git commit -m "test(windows-sandbox): capture raw authorization descriptors"
```

### Task 7: 实现 DuplicateTokenEx、AccessCheck、AuthzAccessCheck 三路对照

**Files:**
- Modify: `codex-rs/windows-sandbox-rs/src/authorization_probe/access.rs`
- Modify: `codex-rs/windows-sandbox-rs/src/authorization_probe_schema.rs`
- Modify: `codex-rs/windows-sandbox-rs/src/authorization_probe_schema_tests.rs`

- [ ] **Step 1: 写 generic mapping 与结果 schema 测试**

对象 `DELETE` 请求固定为 `0x0001_0000`，parent `FILE_DELETE_CHILD` 固定为 `0x0000_0040`。测试 `MapGenericMask` 前后值、两次 `PrivilegeSet` buffer 调用、Authz error array 都进入完整结果对象。

- [ ] **Step 2: 运行红灯测试**

Run: `cd codex-rs && just test -p codex-windows-sandbox authorization_probe_schema::tests::access_triplet_keeps_three_results`

Expected: FAIL。

- [ ] **Step 3: 实现统一输入与三路独立结果**

```rust
pub(crate) struct AccessTripletRequest<'a> {
    pub(crate) key: &'a str,
    pub(crate) path: &'a Path,
    pub(crate) security_descriptor: &'a [u8],
    pub(crate) desired_access: u32,
    pub(crate) object_kind: AccessObjectKind,
}

pub(crate) struct AccessTripletResult {
    pub(crate) create_file: CreateFileAccessResult,
    pub(crate) access_check: AccessCheckResult,
    pub(crate) authz_access_check: AuthzAccessCheckResult,
}
```

三路必须来自同一个 duplicated token，不能让 parent 自己的 token 执行 `CreateFileW`：

```rust
pub(crate) struct DuplicatedProbeToken {
    pub(crate) impersonation_token: OwnedHandle,
    pub(crate) source_statistics: TokenStatisticsSnapshot,
}
```

先对 restricted primary token 调用一次 `DuplicateTokenEx`，得到 `SecurityImpersonation` 级别的 impersonation token。随后：

- `AccessCheck` 使用该 impersonation token，先 `MapGenericMask`，第一次查询 `PrivilegeSetLength`，第二次填充 buffer。
- `AuthzInitializeContextFromToken` 使用同一个 impersonation token 创建独立 Authz context；resource manager 与 context 仍独立销毁。
- parent 侧 `CreateFileW` 通过 RAII `ThreadImpersonationGuard` 调用 `SetThreadToken(NULL, impersonation_token)`，在 guard drop 中无条件调用 `RevertToSelf`。记录 impersonation 成功、I/O 结果和 revert 结果；如果 revert 失败，立即返回 probe error，禁止继续在错误身份下运行。

真实 restricted child 的 `CreateFileW`/`DeleteFileW` 仍由 Task 8 单独记录，名称为 `child_real_io`，用于组合删除语义；它不冒充三路同-token parent 对照。

- [ ] **Step 4: 加入 RAII handle 清理和失败点记录**

每个 API step 记录 `api`、`success`、`win32_error`、`granted_access`、`access_status`、`privileges`、`object_type_list_used` 和相同的 duplicated-token authentication ID。单路失败返回结构化错误；只有无法安全 `RevertToSelf` 时停止整个 probe，其他失败不阻断剩余证据。

- [ ] **Step 5: 跑测试并提交**

Run: `cd codex-rs && just test -p codex-windows-sandbox authorization_probe_schema::tests`

Expected: PASS。

Run on Windows CI only: `just test -p codex-windows-sandbox authorization_probe::tests::access_triplet_uses_one_duplicated_token`

Expected: PASS，并证明三路记录相同 duplicated-token authentication ID，thread impersonation 后成功 `RevertToSelf`。

```bash
git add codex-rs/windows-sandbox-rs/src/authorization_probe codex-rs/windows-sandbox-rs/src/authorization_probe_schema.rs codex-rs/windows-sandbox-rs/src/authorization_probe_schema_tests.rs
git diff --cached --check
git commit -m "test(windows-sandbox): compare Windows authorization APIs"
```

### Task 8: 创建四类 ACL fixtures 并由真实 restricted child 执行 I/O

**Files:**
- Modify: `codex-rs/windows-sandbox-rs/src/authorization_probe/fixtures.rs`
- Modify: `codex-rs/windows-sandbox-rs/src/authorization_probe/access.rs`
- Modify: `codex-rs/windows-sandbox-rs/src/unified_exec/tests.rs:730-910`
- Modify: `codex-rs/windows-sandbox-rs/src/authorization_probe_schema.rs`
- Modify: `codex-rs/windows-sandbox-rs/src/authorization_probe_schema_tests.rs`

- [ ] **Step 1: 写 fixture 规格生成测试**

生成六个子 case：`object_deny_parent_allow`、`object_allow_parent_deny`、`restricting_missing_allow`、`restricting_explicit_deny`、`restricting_normal_and_capability_allow`、`cleanup_control`。断言每个 case 的对象/parent ACE type、mask、SID 与顺序完整相等。

- [ ] **Step 2: 运行红灯测试**

Run: `cd codex-rs && just test -p codex-windows-sandbox authorization_probe_schema::tests::fixture_spec_preserves_acl_intent`

Expected: FAIL。

- [ ] **Step 3: 在 restricted token 创建后、spawn 前选择 capability SID**

`prepare_legacy_session_security` 返回 restricted primary token 后、调用 `spawn_legacy_process` 前，直接从该 token 的实际 `TokenRestrictedSids` 读取候选，过滤已知 writable-root capability SID，按 SID 字符串升序选择第一个；记录完整候选、规则 `lexicographically_first_writable_root_capability` 和选择结果。该 token 正是后续传给 `CreateProcessAsUserW` 的 token，因此不需要 child ready/go 循环，也不允许先 spawn 再修改 fixture ACL。

主 probe token 不新增 SID、不替换 restricting set。若某个额外实验必须新增 SID，只能用单独的 fixture-only token，并把 `token_role=fixture_only` 写入记录；不得用它替代主 child token。

- [ ] **Step 4: 创建、回读并校验 fixture ACL**

fixture 根目录位于 probe output 的 sibling temp root，名称包含 `probe_id`。所有 fixture 都必须在 restricted token 创建后、child spawn 前完成创建和 ACL 写入。用 `SetNamedSecurityInfoW` 或 `SetEntriesInAclW` 写 ACL 后立即调用 Task 6 serializer 回读；只有回读 SID/type/mask/flags/order 与规格一致时才把路径注入 child env 并继续 spawn。单 fixture 失败只标记该 case `complete=false`，其他 fixture 和主目标继续。

- [ ] **Step 5: 让真实 child 执行 I/O**

child 启动后直接从 env 读取已冻结的 fixture 路径，对每个 case 分别执行：对象 `CreateFileW(DELETE)`、parent `CreateFileW(FILE_DELETE_CHILD)`、`DeleteFileW`，记录 before/after existence 和 Win32 error。不要只用 parent process 模拟，也不要增加 ready/go 同步协议。测试结束 best-effort 清理；清理失败进入 manifest errors。

- [ ] **Step 6: 跑测试并提交**

Run: `cd codex-rs && just test -p codex-windows-sandbox authorization_probe_schema::tests`

Expected: PASS。

Run on Windows CI only: `just test -p codex-windows-sandbox authorization_probe::tests::fixtures_are_created_before_child_spawn`

Expected: PASS，记录顺序为 restricted token snapshot → fixture create/readback → child spawn → child real I/O。

```bash
git add codex-rs/windows-sandbox-rs/src/authorization_probe codex-rs/windows-sandbox-rs/src/authorization_probe_schema.rs codex-rs/windows-sandbox-rs/src/authorization_probe_schema_tests.rs codex-rs/windows-sandbox-rs/src/unified_exec/tests.rs
git diff --cached --check
git commit -m "test(windows-sandbox): add controlled ACL fixtures"
```

### Task 9: 记录 OS、runner、volume、reparse 与 filter 环境

**Files:**
- Modify: `codex-rs/windows-sandbox-rs/src/authorization_probe/environment.rs`
- Modify: `codex-rs/windows-sandbox-rs/src/authorization_probe_schema.rs`
- Modify: `codex-rs/windows-sandbox-rs/src/unified_exec/tests.rs:730-910`
- Modify: `codex-rs/windows-sandbox-rs/src/authorization_probe_schema_tests.rs`

- [ ] **Step 1: 写环境白名单和截断测试**

断言未知环境变量和名称含 `TOKEN`、`SECRET`、`AUTHORIZATION` 的值不会输出；filter command output 固定最多 256 KiB，超限时 `truncated=true` 且保留原始 byte count。

- [ ] **Step 2: 运行红灯测试**

Run: `cd codex-rs && just test -p codex-windows-sandbox authorization_probe_schema::tests::environment_whitelist_redacts_secrets`

Expected: FAIL。

- [ ] **Step 3: 实现结构化环境快照**

记录 `RtlGetVersion` OS version/build、edition、process/native architecture；白名单 runner fields；每个目标的 `GetVolumePathNameW`、`GetVolumeNameForVolumeMountPointW`、`GetVolumeInformationW`、`GetDriveTypeW`、`QueryDosDeviceW`；`GetFileInformationByHandleEx` reparse tag 与 `GetFinalPathNameByHandleW` final path。

- [ ] **Step 4: best-effort 采集 filter driver**

优先调用系统已存在的 `fltmc filters`，记录 exit code、stdout/stderr、truncated；命令不存在或权限不足只生成 `success=false` 环境记录，不使测试失败。禁止安装 Sysinternals 或第三方工具。

- [ ] **Step 5: 跑测试并提交**

Run: `cd codex-rs && just test -p codex-windows-sandbox authorization_probe_schema::tests`

Expected: PASS。

```bash
git add codex-rs/windows-sandbox-rs/src/authorization_probe codex-rs/windows-sandbox-rs/src/authorization_probe_schema.rs codex-rs/windows-sandbox-rs/src/authorization_probe_schema_tests.rs codex-rs/windows-sandbox-rs/src/unified_exec/tests.rs
git diff --cached --check
git commit -m "test(windows-sandbox): capture runner authorization environment"
```

### Task 10: 完成端到端测试、stdout 持久化与 manifest 封口

**Files:**
- Modify: `codex-rs/windows-sandbox-rs/src/lib.rs`
- Modify: `codex-rs/windows-sandbox-rs/src/token.rs`
- Modify: `codex-rs/windows-sandbox-rs/src/process.rs`
- Modify: `codex-rs/windows-sandbox-rs/src/unified_exec/mod.rs`
- Modify: `codex-rs/windows-sandbox-rs/src/unified_exec/backends/legacy.rs`
- Modify: `codex-rs/windows-sandbox-rs/src/unified_exec/tests.rs:140-910`
- Modify: `codex-rs/windows-sandbox-rs/src/authorization_probe/mod.rs`
- Modify: `codex-rs/windows-sandbox-rs/src/authorization_probe/schema.rs`
- Modify: `codex-rs/windows-sandbox-rs/src/authorization_probe/tests.rs`
- Modify: `codex-rs/windows-sandbox-rs/src/authorization_probe/legacy_acl.rs`
- Modify: `codex-rs/windows-sandbox-rs/src/authorization_probe/token.rs`
- Modify: `codex-rs/windows-sandbox-rs/src/authorization_probe/spawn.rs`
- Modify: `codex-rs/windows-sandbox-rs/src/authorization_probe/security_descriptor.rs`
- Modify: `codex-rs/windows-sandbox-rs/src/authorization_probe/access.rs`
- Modify: `codex-rs/windows-sandbox-rs/src/authorization_probe/fixtures.rs`
- Modify: `codex-rs/windows-sandbox-rs/src/authorization_probe/environment.rs`
- Modify: `codex-rs/windows-sandbox-rs/src/authorization_probe_schema.rs`
- Modify: `codex-rs/windows-sandbox-rs/src/authorization_probe_schema_tests.rs`

- [ ] **Step 1: 写 manifest 完整性红灯测试**

required files 固定为 `parent.jsonl`、`backend.jsonl`、`child.jsonl`、`fixtures.jsonl`、`environment.jsonl`、`stdout.log`。断言 schema/probe_id 不一致、JSONL 尾行不可解析、任一 required phase 缺失都会使 `complete=false`；另加 spawn 失败样例，断言 staging 被改名为 `child-failed-spawn` 最终目录、`child_pid=None`、manifest `complete=false` 且 errors 含 `probe_error`。

- [ ] **Step 2: 运行红灯测试**

Run: `cd codex-rs && just test -p codex-windows-sandbox authorization_probe_schema::tests::manifest_rejects_incomplete_artifact`

Expected: FAIL。

- [ ] **Step 3: 替换目标测试的 probe orchestration**

保留原测试 `legacy_workspace_write_delete_is_limited_to_writable_roots` 的删除边界断言；启用环境变量时额外创建 schema v2 probe context、运行五个真实目标、六个 fixture 子 case 和环境采集。stdout 无论测试最终 pass/fail 都写盘；diagnostics 错误只进入 artifact，不掩盖原测试结果。

- [ ] **Step 4: 原子写 manifest**

先写 `manifest.json.tmp`，关闭所有 sink 后逐文件统计 byte count、JSONL record count、schema/probe_id 一致性，再 rename 为 `manifest.json`。artifact 目录遵循 Task 5 的 staging → success/failed-spawn 原子 rename；任一 rename 失败时保留可定位的 staging/tmp，并输出 stderr 告警。manifest `complete=true` 仅在成功取得 child PID，且 required files、required phases 和 fixture case 全部存在时成立；spawn 失败目录必须写入 `probe_error` 并保持 `complete=false`。

- [ ] **Step 5: 运行最后一个 Rust 实现 Task 的项目级验证**

Run on Windows CI only: `just test -p codex-windows-sandbox legacy_workspace_write_delete_is_limited_to_writable_roots`

Expected: 原删除边界断言维持自身 pass/fail，同时无论结果如何都生成 schema 2 manifest 和 required files。该 Windows-only 结果由 CI 验证，不插入下面本地提交前验证序列。

Run: `cd codex-rs && just test -p codex-windows-sandbox`

Expected: PASS。该项目级 crate test 默认必须运行，无需额外确认；只有完整 workspace `cd codex-rs && just test` 才需要用户明确确认。

Run: `cd codex-rs && just fix -p codex-windows-sandbox`

Expected: PASS，并应用本 crate lint fixes。

Run: `cd codex-rs && just fmt`

Expected: PASS。fix/fmt 后不重跑测试。

Run: `git diff --check`

Expected: 无输出。

Run: `git diff --name-only <implementation-base-sha>..HEAD && git diff --name-only`

Expected: 两段输出合并后，Rust 路径只包含本 Task `Files` 列出的 Task 1-10 授权链 probe 文件；逐行核对后才能 stage。`<implementation-base-sha>` 必须替换为冻结的完整字面 SHA，不得使用宽泛 range 猜测。

- [ ] **Step 6: 提交 Task 10**

```bash
git add codex-rs/windows-sandbox-rs/src/lib.rs
git add codex-rs/windows-sandbox-rs/src/token.rs
git add codex-rs/windows-sandbox-rs/src/process.rs
git add codex-rs/windows-sandbox-rs/src/unified_exec/mod.rs
git add codex-rs/windows-sandbox-rs/src/unified_exec/backends/legacy.rs
git add codex-rs/windows-sandbox-rs/src/unified_exec/tests.rs
git add codex-rs/windows-sandbox-rs/src/authorization_probe/mod.rs
git add codex-rs/windows-sandbox-rs/src/authorization_probe/schema.rs
git add codex-rs/windows-sandbox-rs/src/authorization_probe/tests.rs
git add codex-rs/windows-sandbox-rs/src/authorization_probe/legacy_acl.rs
git add codex-rs/windows-sandbox-rs/src/authorization_probe/token.rs
git add codex-rs/windows-sandbox-rs/src/authorization_probe/spawn.rs
git add codex-rs/windows-sandbox-rs/src/authorization_probe/security_descriptor.rs
git add codex-rs/windows-sandbox-rs/src/authorization_probe/access.rs
git add codex-rs/windows-sandbox-rs/src/authorization_probe/fixtures.rs
git add codex-rs/windows-sandbox-rs/src/authorization_probe/environment.rs
git add codex-rs/windows-sandbox-rs/src/authorization_probe_schema.rs
git add codex-rs/windows-sandbox-rs/src/authorization_probe_schema_tests.rs
git diff --cached --name-only
git diff --cached --check
git commit -m "test(windows-sandbox): finalize authorization probe artifacts"
```

只按上述逐文件命令 stage 本轮实际变化的 Rust 文件，包括 `just fix`/`just fmt` 可能修改的所有 Task 1-10 Rust 路径；`git diff --cached --name-only` 必须逐行核对为上述 allowlist 的子集。禁止 `git add` 整个目录，禁止 stage name-only 枚举以外的无关文件。Task 6 已负责提交实际发生的 Cargo/Bazel feature 或 lockfile 变化，不在 Task 10 重复 stage。提交后立即用 `git rev-parse HEAD` 取得完整 SHA，并把 `10<TAB>sha<TAB>subject` 追加到逐 Task SHA manifest。Task 11/12 只改 workflow，不再运行 Rust fix/fmt。

### Task 11: 升级默认关闭的 reusable workflow artifact 通道

**Files:**
- Modify: `.github/workflows/rust-ci-full-nextest-platform.yml:35-57,364-451`

- [ ] **Step 1: 写静态红灯检查命令**

Run: `rg -n 'windows_legacy_authorization_probe|schema-2|manifest.json' .github/workflows/rust-ci-full-nextest-platform.yml`

Expected: 无匹配，exit 1。

- [ ] **Step 2: 替换 reusable workflow input 与输出目录**

新增默认 false 的 `windows_legacy_authorization_probe` boolean input；配置步骤创建：

```text
${RUNNER_TEMP}/windows-legacy-authorization-probe/${target}/shard-${shard}/attempt-${GITHUB_RUN_ATTEMPT}
```

写入 `CODEX_WINDOWS_LEGACY_AUTHORIZATION_PROBE_DIR/TARGET/SHARD/RUN_ARCH`。旧 `windows_legacy_delete_diagnostics` 通道在第二轮启用时不再单独上传，避免重复 artifact；第一轮代码仍保留到最终回退。

- [ ] **Step 3: 增加 always 完整性检查和上传**

在 tests 后加入 bash step：在 output dir 下寻找唯一的成功目录 `windows-legacy-authorization-probe-${target}-shard-${shard}-host-*-child-[0-9]*-schema-v2-*/manifest.json`，或失败目录 `windows-legacy-authorization-probe-${target}-shard-${shard}-host-*-child-failed-spawn-schema-v2-*/manifest.json`。两种目录都验证同目录包含 `parent.jsonl`、`backend.jsonl`、`child.jsonl`、`fixtures.jsonl`、`environment.jsonl`、`stdout.log`；失败目录预期 `complete=false` 且包含 `probe_error`。任何 manifest `complete != true` 时输出 `::warning::` 并列出 missing files/errors，但 `continue-on-error: true`，不覆盖测试结论。artifact 上传匹配到的成功或失败 probe 目录整体；若只残留 `.staging-${probe_id}`，也作为异常诊断内容上传并发出 warning。artifact 名固定：

```text
windows-legacy-authorization-probe-${target}-shard-${shard}-attempt-${github.run_attempt}-schema-v2
```

upload 使用 `if: always()`、`if-no-files-found: warn`。

- [ ] **Step 4: 运行 workflow 静态验证**

Run: `actionlint .github/workflows/rust-ci-full-nextest-platform.yml`

Expected: 无输出，exit 0。

- [ ] **Step 5: 提交 Task 11**

```bash
git add .github/workflows/rust-ci-full-nextest-platform.yml
git diff --cached --check
git commit -m "ci: collect Windows authorization chain artifacts"
```

提交后立即记录 Task 11 的完整 SHA、subject 到逐 Task SHA manifest。

### Task 12: 为 x64/arm64 启用并完成本地验证，等待用户触发 CI

**Files:**
- Modify: `.github/workflows/rust-ci-full.yml:468-493`

- [ ] **Step 1: 写启用状态红灯检查**

Run: `rg -n 'windows_legacy_authorization_probe: true' .github/workflows/rust-ci-full.yml`

Expected: 无匹配，exit 1。

- [ ] **Step 2: 同时启用两个 Windows job**

在 `tests_windows_x64` 与 `tests_windows_arm64` 的 `with` 中设置 `windows_legacy_authorization_probe: true`，移除或设 false 旧 `windows_legacy_delete_diagnostics`，保持 `test_threads: 1`。

- [ ] **Step 3: 执行 workflow 与范围最终验证**

Task 10 已按项目测试 → fix → fmt → diff 检查的顺序完成 Rust 最终验证；Task 12 不再运行 Rust test、fix 或 fmt，只验证 workflow 和实现范围。

Run: `git diff --check <implementation-base-sha>..HEAD && git diff --check`

Expected: committed 范围和当前未提交 Task 12 都无 whitespace error；`<implementation-base-sha>` 必须人工替换为 `.git/codex-windows-authorization-probe-base-sha` 中冻结的完整字面 SHA，禁止 shell command substitution。

Run: `actionlint .github/workflows/rust-ci-full.yml .github/workflows/rust-ci-full-nextest-platform.yml`

Expected: 无输出。

- [ ] **Step 4: 检查变更规模和提交边界**

Run: `git diff --stat <implementation-base-sha>..HEAD && git diff --stat`。

Expected: 第一段显示已提交 Task 1-11，第二段显示当前 Task 12；合计只包含授权链 probe、两个 workflow 和必要 Cargo feature。若非机械逻辑超过 800 changed lines，暂停并按模块把未提交部分拆为更小提交，不合并已有 Task commits。

- [ ] **Step 5: 提交 Task 12 并复核完整实现范围**

```bash
git add .github/workflows/rust-ci-full.yml
git diff --cached --check
git commit -m "ci: enable Windows authorization probe comparison"
```

提交后立即用 `git rev-parse HEAD` 取得 Task 12 的完整 SHA，并把 `12<TAB>sha<TAB>subject` 追加到 `.git/codex-windows-authorization-probe-commits.tsv`。Run: `git diff --check <implementation-base-sha>..HEAD && git diff --stat <implementation-base-sha>..HEAD`。

Expected: 范围包含 Task 1-12，不包含设计/计划文档提交，工作树无本轮实现未提交 diff。

- [ ] **Step 6: 停止并交给用户执行远程动作**

报告第二轮所有 commit hash、预期 artifact 名、run target/shard/schema。不得执行 `git push`、`git fetch`、`git pull`、`gh run` 或任何远程命令。等待用户自行 push、审批 workflow 并触发 `rust-ci-full`。

### Task 13: 验收 artifacts 并写回 research

**Files:**
- Modify: `docs/superpowers/research/2026-07-12-windows-legacy-sandbox-diagnostics/current-findings.md`
- Modify: `docs/superpowers/research/2026-07-12-windows-legacy-sandbox-diagnostics/execution-log.md`

- [ ] **Step 1: 验证两侧 manifest 与机械可比性**

对用户提供的 x64/arm64 解压目录运行本地只读脚本或 `jq`：验证 schema=2、各自 probe_id 内文件一致、manifest complete、required phase 全部存在、六个 fixture 子 case 均有 object/parent/real-I/O 三路结果。

Expected: 两侧均完整；任一不完整时只记录缺失证据并返回 Task 11/12 追加诊断，不据此下授权结论。

- [ ] **Step 2: 建立事实对照表**

逐 stable key 比较：base/restricted/child token、groups/restricted SIDs/privileges、integrity/mandatory policy、token statistics 可比字段、raw SD hash、owner/group、DACL control、ACE 顺序、三路 access、fixture real I/O、OS/volume/reparse/filter。

Expected: 每个差异都链接到 artifact 相对路径和 record key；不把 handle、TokenId、ModifiedId 必须相等作为判断条件。

- [ ] **Step 3: 更新 current-findings**

只写稳定事实、已排除项、风险、未知项与下一步。严格区分：

```text
事实：artifact 直接记录的值。
推断：由判读矩阵支持但尚未证明的方向。
未知：probe 未覆盖或结果不完整的层。
```

不得把 x64/arm64、C:/D:、runner image 直接写成原因；不得泛化所有 Windows 或 `WRITE_RESTRICTED` token；不得声称三路 API 等同 NTFS 最终授权路径。

- [ ] **Step 4: 更新 execution-log**

记录 run ID、attempt、artifact 名、下载目录、manifest 完整性、执行过的本地检查、关键 record keys 和下一阶段门禁。research 默认仍被忽略，不 stage、不 commit，除非用户另行明确要求提交。

- [ ] **Step 5: 请求用户确认证据再进入回退**

向用户给出通俗结论和证据边界，明确询问是否“确认 CI 证据和 research 更新，开始按逆序独立 revert”。未确认不得执行 Task 14。

### Task 14: 用户确认后严格逆序独立 revert 所有新旧临时提交

**Files:**
- Revert only: Task 12 至 Task 1 的第二轮临时实现提交
- Revert only: `347ed4b40`, `84a56dcb2`, `0470ae4ff`, `f783fff6b`
- Preserve: `5b6c23de8`、第二轮设计/计划文档提交、research（除非用户另行要求）
- Read only: `.git/codex-windows-authorization-probe-base-sha`
- Read only: `.git/codex-windows-authorization-probe-commits.tsv`

- [ ] **Step 1: 从逐 Task SHA manifest 生成精确回退队列**

Run: `sed -n '1,20p' .git/codex-windows-authorization-probe-commits.tsv`

Expected: 恰好显示 Task 1→Task 12，每行一个明确 SHA。逐个运行 `git show -s --format='%H%x09%s' <sha>`，确认 subject 与 manifest 一致，并确认每个 SHA 都是 `.git/codex-windows-authorization-probe-base-sha` 之后的 descendant。把这 12 个 SHA 人工逆序抄入执行记录；设计/计划文档提交不在 manifest 中，禁止加入回退队列。若缺 Task、重复 SHA 或混入无关提交，停止并修复清单，不使用宽 `git log` range 猜测。

- [ ] **Step 2: 逐个 revert 第二轮 Task 12→Task 1**

对每个 hash 单独运行：

```bash
git revert <task-12-sha>
git show --stat --oneline HEAD
git revert <task-11-sha>
git show --stat --oneline HEAD
```

继续逐个处理到 Task 1。禁止 `git revert --no-commit`，禁止一次命令传多个 hash，禁止 squash。每个自动生成的 commit message 必须保留原 hash。

- [ ] **Step 3: 逐个 revert 第一轮临时提交**

严格执行：

```bash
git revert 347ed4b40
git show --stat --oneline HEAD
git revert 84a56dcb2
git show --stat --oneline HEAD
git revert 0470ae4ff
git show --stat --oneline HEAD
git revert f783fff6b
git show --stat --oneline HEAD
```

Expected: 四个独立 revert commits，顺序与原提交相反。

- [ ] **Step 4: 验证临时代码与 workflow 已清除**

Run: `rg -n 'AUTHORIZATION_PROBE|windows_legacy_authorization_probe|windows-legacy-authorization-probe|legacy_delete_access_probe_script' codex-rs/windows-sandbox-rs .github/workflows`

Expected: 无第二轮 probe 匹配；第一轮临时 probe 匹配也为空。若命中来自设计/计划文档，不纳入源码/workflow 检查范围。

Run: `cd codex-rs && just test -p codex-windows-sandbox`

Expected: PASS。回退后默认运行项目级 crate test；只有完整 workspace `cd codex-rs && just test` 才需要用户明确确认。

Run: `cd codex-rs && just fix -p codex-windows-sandbox`

Expected: PASS。

Run: `cd codex-rs && just fmt`

Expected: PASS；fix/fmt 后不再重跑测试。

Run: `actionlint .github/workflows/rust-ci-full.yml .github/workflows/rust-ci-full-nextest-platform.yml`

Expected: 无输出。

- [ ] **Step 5: 验证保留文档和工作区状态**

Run: `git status --short && git log --oneline -25`

Expected: 没有临时源码/workflow 未提交变更；设计、计划与每个独立 revert commit 都可见；research 是否未跟踪/被忽略与用户授权一致。不得执行任何远程操作。

## 最终自审清单

- [ ] 设计第 6.1 节 parent token 由 Task 3/4 覆盖。
- [ ] 设计第 6.2 节 legacy spawn 由 Task 5 覆盖。
- [ ] 设计第 6.3 节 child token 与 correlation 由 Task 5/10 覆盖。
- [ ] 设计第 6.4 节 raw SD/SDDL/ACE 顺序由 Task 6 覆盖。
- [ ] 设计第 6.5 节三路 access 由 Task 7 覆盖。
- [ ] 设计第 6.6 节 fixture 与真实 child I/O 由 Task 8 覆盖。
- [ ] 设计第 6.7 节环境、volume、reparse、filter 由 Task 9 覆盖。
- [ ] 设计第 7 节 schema、错误隔离、完整性由 Task 1/10 覆盖。
- [ ] 设计第 8 节 x64/arm64 artifact 由 Task 11/12 覆盖。
- [ ] 设计第 9/13 节判读边界由 Task 13 覆盖。
- [ ] 设计第 12 节逆序独立 revert 由 Task 14 覆盖。
- [ ] 未修改公共 `SpawnedProcess`，未默认新增依赖，未外置 `.ps1`。
- [ ] 所有实现 Task 均包含 red、green、精确命令、预期结果和独立 commit。
