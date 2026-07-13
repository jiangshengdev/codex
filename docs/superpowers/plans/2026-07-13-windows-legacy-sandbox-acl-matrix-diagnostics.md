# Windows legacy sandbox ACL 矩阵诊断 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在一次 Windows x64 CI 现场中生成并执行 12 个受控 ACL case，用结构化 artifact 区分继承、trustee、owner 与删除授权路径，同时保持生产 sandbox 行为和原测试断言不变。

**Architecture:** 在 `unified_exec` 下新增一个仅测试编译的 sibling module，由 Rust 生成受控 `acl-matrix` 根、12-case manifest 和内嵌 PowerShell/C# 脚本；脚本的 parent setup mode 使用测试专用 Win32 ACL API 设置并回读 descriptor，restricted child probe mode 使用同一 manifest 做 descriptor 校验、`CreateFileW` access probe 和 `DeleteFileW` 真实删除。现有测试只增加显式 x64 诊断门禁、最小 setup/child 接线，并继续通过已有 stdout 持久化和 workflow artifact 链路收集结果；原 workspace、TEMP、TMP、outside、`.git` 操作及最终断言保持不变。

**Tech Stack:** Rust test-only module、`serde`/`serde_json`、Windows Security/ACL Win32 API、内嵌 Windows PowerShell 与 C# P/Invoke、GitHub Actions 现有 nextest artifact 链路。

---

## 范围与完成判据

- 仅在 `dev` 分支执行本计划。
- 不安装程序、依赖、运行时或浏览器二进制。
- 不执行任何 Git remote 命令，包括 `git fetch`、`git pull`、`git push` 和 `git remote`。
- 不修改生产 token 构造、ACL mutation、restricted SID、spawn 或命令执行逻辑。
- 不修改 `Cargo.toml`、`Cargo.lock`、`BUILD.bazel`、`MODULE.bazel.lock`。
- 不修改 `.github/workflows/rust-ci-full.yml` 或 `.github/workflows/rust-ci-full-nextest-platform.yml`；直接复用现有 `CODEX_WINDOWS_LEGACY_DELETE_DIAGNOSTICS_*` 门禁和 `windows-legacy-delete-diagnostics-*` artifact。
- Windows arm64 不是完成条件；本轮只判读 Windows x64。macOS 本地不运行无意义的 Windows 测试。
- 不安排 crate/workspace 全量测试、`just fix`、Clippy 或 `cargo test`。
- Windows x64 上目标测试继续失败可能是预期结果。实现完成标准是 artifact 含可判读的 metadata、12 条 case JSONL、原五个 baseline 复现证据，而不是测试变绿。
- artifact 缺失 metadata、任一 case 记录或关键 descriptor 字段时，停止根因判断并报告缺口；不得用不完整记录下结论。
- 诊断完成只表示证据边界收窄，不表示安全修复已经设计或实现。

## File Structure

- Create: `codex-rs/windows-sandbox-rs/src/unified_exec/legacy_acl_matrix_diagnostics.rs`
  - 定义 x64 诊断门禁、12-case manifest/record schema、受控 descriptor 模板、内嵌 setup/probe PowerShell+C#、parent setup 调用和 child 命令片段。
  - 所有代码只在 `#[cfg(all(windows, test))]` 下编译，不进入生产路径。
- Modify: `codex-rs/windows-sandbox-rs/src/unified_exec/mod.rs`
  - 注册新的 test-only sibling module，不改变现有 backend 或 public API。
- Modify: `codex-rs/windows-sandbox-rs/src/unified_exec/tests.rs`
  - 在现有目标测试中增加门禁检查、矩阵 setup、manifest/script 环境变量和 child probe 调用。
  - 保持原五个 baseline fixture、删除命令、stdout 持久化和最终 tuple 断言不变。
- Update after CI evidence: `docs/superpowers/research/2026-07-13-windows-legacy-sandbox-ci-evidence/current-findings.md`
  - 只写入 artifact 已支持的稳定结论、已排除项、剩余边界和下一步。
- Append after CI evidence: `docs/superpowers/research/2026-07-13-windows-legacy-sandbox-ci-evidence/execution-log.md`
  - 追加 run、artifact、metadata、12-case 校验和判读过程；默认不 stage、不 commit。
- Do not modify:
  - `.github/workflows/rust-ci-full.yml`
  - `.github/workflows/rust-ci-full-nextest-platform.yml`
  - `codex-rs/windows-sandbox-rs/Cargo.toml`
  - `codex-rs/windows-sandbox-rs/BUILD.bazel`
  - `codex-rs/windows-sandbox-rs/src/acl.rs`
  - `codex-rs/windows-sandbox-rs/src/token.rs`
  - `codex-rs/windows-sandbox-rs/src/unified_exec/backends/**`

## 固定实现契约

### Rust API 与门禁

新模块暴露给 `tests.rs` 的接口固定为：

```rust
pub(super) const ACL_MATRIX_MANIFEST_ENV: &str = "CODEX_WINDOWS_LEGACY_ACL_MATRIX_MANIFEST";
pub(super) const ACL_MATRIX_SCRIPT_ENV: &str = "CODEX_WINDOWS_LEGACY_ACL_MATRIX_SCRIPT";

pub(super) struct PreparedAclMatrix {
    pub manifest_path: PathBuf,
    pub script_path: PathBuf,
}

pub(super) fn diagnostics_enabled() -> bool;

pub(super) fn prepare_acl_matrix(
    test_root: &Path,
    runner_user: &str,
) -> anyhow::Result<PreparedAclMatrix>;

pub(super) fn child_probe_command() -> String;
```

`diagnostics_enabled()` 必须同时满足：

```rust
std::env::var_os("CODEX_WINDOWS_LEGACY_DELETE_DIAGNOSTICS_DIR").is_some()
    && std::env::var("CODEX_WINDOWS_LEGACY_DELETE_DIAGNOSTICS_TARGET").as_deref()
        == Ok("x86_64-pc-windows-msvc")
    && cfg!(target_arch = "x86_64")
```

不得仅用 `target_arch` 或仅用环境变量开启矩阵。门禁关闭时不得创建 `acl-matrix`、manifest 或脚本，也不得增加 child 输出。

### Manifest 与 JSONL schema

Rust manifest 使用以下 serde 结构；所有字段名保持 snake_case，以便 PowerShell/C# 原样读写：

```rust
#[derive(Clone, Debug, Serialize, Deserialize)]
struct MatrixManifest {
    schema: u32,
    matrix_version: String,
    root: PathBuf,
    sids: ResolvedSids,
    cases: Vec<CaseManifest>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct ResolvedSids {
    runner_user: String,
    authenticated_users: String,
    everyone: String,
    system: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct CaseManifest {
    family: String,
    case_name: String,
    parent_path: PathBuf,
    object_path: PathBuf,
    expected_parent_descriptor: DescriptorSpec,
    expected_object_descriptor: DescriptorSpec,
    setup_status: SetupStatus,
    setup_error: Option<DiagnosticError>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
enum SetupStatus {
    Pending,
    Ok,
    SetupError,
    SetupMismatch,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
struct DescriptorSpec {
    owner_sid: String,
    dacl_protected: bool,
    dacl_auto_inherited: bool,
    aces: Vec<AceSpec>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
struct AceSpec {
    ace_type: String,
    mask: u32,
    flags: u8,
    trustee_sid: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct DiagnosticError {
    stage: String,
    api: String,
    code: Option<u32>,
    message: String,
}
```

child 每个 case 输出一条单行 `acl_matrix_case` JSONL，字段固定为：

```json
{"record_type":"acl_matrix_case","schema":1,"matrix_version":"acl-matrix-v1","family":"inheritance","case":"inherited_user","setup_status":"ok","setup_error":null,"expected_parent_descriptor":{"owner_sid":"S-...","dacl_protected":true,"dacl_auto_inherited":false,"aces":[]},"actual_parent_descriptor":{"owner_sid":"S-...","dacl_protected":true,"dacl_auto_inherited":false,"aces":[]},"expected_object_descriptor":{"owner_sid":"S-...","dacl_protected":false,"dacl_auto_inherited":true,"aces":[]},"actual_object_descriptor":{"owner_sid":"S-...","dacl_protected":false,"dacl_auto_inherited":true,"aces":[]},"object_delete_probe_allowed":false,"object_delete_probe_error":5,"parent_delete_child_probe_allowed":false,"parent_delete_child_probe_error":5,"exists_before_delete":true,"delete_attempted":true,"delete_win32_error":5,"delete_succeeded":false,"exists_after_delete":true,"result_valid":true}
```

矩阵开始前输出一条 `acl_matrix_metadata` JSONL，至少包含：

```json
{"record_type":"acl_matrix_metadata","schema":1,"matrix_version":"acl-matrix-v1","target":"x86_64-pc-windows-msvc","process_arch":"x86_64","runner_os":"...","runner_image":"...","test_root":"D:\\...","volume_root":"D:\\","file_system":"NTFS","runner_user_sid":"S-...","restricted_sids":["S-1-1-0"],"diagnostics_dir_present":true,"case_count":12}
```

### 12-case 固定表

`build_case_manifests()` 必须按下列顺序生成恰好 12 个 case；每个 case 使用独立 parent 目录和 `delete-me.txt`：

| 顺序 | family | case | 唯一变量 |
| --- | --- | --- | --- |
| 1 | inheritance | `inherited_user` | runner user `Modify` 从 parent 继承，object ACE 带 `INHERITED_ACE`，object DACL unprotected |
| 2 | inheritance | `explicit_user_unprotected` | 等价 runner user `Modify` 为 explicit，object DACL unprotected |
| 3 | inheritance | `explicit_user_protected` | 等价 runner user `Modify` 为 explicit，object DACL protected |
| 4 | trustee | `inherited_runner_user` | inherited `Modify` trustee 为 runner user |
| 5 | trustee | `inherited_authenticated_users` | inherited `Modify` trustee 为 `S-1-5-11` |
| 6 | trustee | `inherited_everyone` | inherited `Modify` trustee 为 `S-1-1-0`，作为正控制 |
| 7 | owner | `owner_runner_user` | object owner 为 runner user SID |
| 8 | owner | `owner_system` | object owner 为 `S-1-5-18` |
| 9 | delete-path | `object_only` | object 允许 `DELETE`，parent 不允许 `FILE_DELETE_CHILD` |
| 10 | delete-path | `parent_only` | object 不允许 `DELETE`，parent 允许 `FILE_DELETE_CHILD` |
| 11 | delete-path | `neither` | 两条删除路径均不允许，负控制 |
| 12 | delete-path | `both` | 两条删除路径均允许，正控制 |

descriptor 模板必须使用数值 mask 与 flags，不用 `Modify` 字符串做最终比较。固定常量至少包含：

```rust
const DELETE: u32 = 0x0001_0000;
const FILE_DELETE_CHILD: u32 = 0x0000_0040;
const READ_CONTROL: u32 = 0x0002_0000;
const SYNCHRONIZE: u32 = 0x0010_0000;
const FILE_READ_ATTRIBUTES: u32 = 0x0000_0080;
const OBJECT_INHERIT_ACE: u8 = 0x01;
const CONTAINER_INHERIT_ACE: u8 = 0x02;
const INHERITED_ACE: u8 = 0x10;
```

delete-path 的 allow ACE 使用 `S-1-1-0`，确保普通 SID 与 restricting SID 两侧均可满足；deny 通过不添加对应 allow 实现，不新增 deny ACE。所有 family 除表中声明变量外，owner、ACE 顺序、基础 mask 和 DACL control 必须完全相同；实际 descriptor 不匹配时 `setup_status=setup_mismatch` 且 `result_valid=false`。

进入 `Setup` 前必须把 runner user、Authenticated Users、Everyone 和 SYSTEM 全部解析为规范 SID 字符串：runner user 使用 `LookupAccountNameW`，三个固定主体分别解析为 `S-1-5-11`、`S-1-1-0`、`S-1-5-18` 并通过 `ConvertStringSidToSidW`/`ConvertSidToStringSidW` 规范化。解析任一主体失败属于矩阵级 parent error；manifest 的 `ResolvedSids`、expected descriptor owner 和所有 ACE trustee 只存 SID 字符串，不存 `DOMAIN\\user` 或本地化主体名。

矩阵根自身也必须应用完整 expected descriptor：显式授予 unrestricted parent 创建目录、文件、写入 manifest、设置及读取 owner/DACL 所需权限；显式授予 restricted child 读取脚本、读取 manifest、遍历矩阵根和进入各 case parent 所需权限。矩阵根不得授予 object `DELETE` 或 parent `FILE_DELETE_CHILD`，也不得通过可继承的聚合 `Modify`/`Full Control` 意外引入未声明删除路径；所有删除权限只由各 case 的 parent/object descriptor 定义。

### 内嵌 setup/probe 脚本模式

`legacy_acl_matrix_diagnostics.rs` 内嵌单份 PowerShell 脚本和单个 C# helper，PowerShell 参数固定为：

```powershell
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('Setup', 'Probe')]
    [string]$Mode,
    [Parameter(Mandatory = $true)]
    [string]$Manifest
)
```

- `Setup`：由 unrestricted parent 在 spawn 前执行。逐 case 创建 parent/object，使用 C# P/Invoke 的 `SetNamedSecurityInfoW`、ACL 初始化/ACE 添加 API 精确设置 owner、DACL protection、ACE mask/flags/order；设置后立即用 `GetNamedSecurityInfoW` 回读 parent/object descriptor。每个 case 独立 `try/catch`，把 `ok`、`setup_error` 或 `setup_mismatch` 及 error code 写回同一 manifest，单 case 失败不得终止后续 setup。
- `Probe`：由 restricted child 执行。读取同一 manifest；先输出 metadata，再逐 case 在删除前回读 parent/object descriptor并计算 `result_valid`；object `CreateFileW` 的 `dwDesiredAccess` 为 `DELETE`，parent `CreateFileW` 的 `dwDesiredAccess` 为 `FILE_DELETE_CHILD`，且仅 parent 调用的 `dwFlagsAndAttributes` 使用 `FILE_FLAG_BACKUP_SEMANTICS`。不得把 `FILE_FLAG_BACKUP_SEMANTICS` 位或进 desired access。随后对 object 调用 `DeleteFileW`，记录返回值和 `GetLastWin32Error()`，再读取 post-state。逐 case单行输出合法 JSONL，case-local 异常转成该 case 的错误字段并继续，最后输出 `{"record_type":"acl_matrix_end","schema":1,"case_count":12,"completed":true}`。
- `Probe` 不执行 `exit 1`，不因 case 失败中断；原 baseline 命令仍在同一个 `.cmd` 中继续执行。
- parent setup 和 child probe 均以 `-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File` 调用已写入 workspace 的脚本，禁止 `-Command` 拼接动态 descriptor 内容。

## Task 1: 实现完整临时 ACL 矩阵并创建独立本地提交

**Files:**
- Create: `codex-rs/windows-sandbox-rs/src/unified_exec/legacy_acl_matrix_diagnostics.rs`
- Modify: `codex-rs/windows-sandbox-rs/src/unified_exec/mod.rs`
- Modify: `codex-rs/windows-sandbox-rs/src/unified_exec/tests.rs`

- [ ] **Step 1: 确认分支、工作区边界和设计输入**

Run from repository root:

```sh
git branch --show-current
git status --short
sed -n '1,260p' docs/superpowers/specs/2026-07-13-windows-legacy-sandbox-acl-matrix-diagnostics-design.md
```

Expected:

- 当前分支精确为 `dev`。
- 设计文档存在；计划执行不得覆盖用户已有变更。
- 除本设计/计划文档等已知未跟踪文档外，没有与三个目标 Rust 文件重叠的用户变更；若有重叠，停止并报告。

- [ ] **Step 2: 创建 test-only sibling module 并注册模块**

Create `codex-rs/windows-sandbox-rs/src/unified_exec/legacy_acl_matrix_diagnostics.rs`，实现“固定实现契约”中的 Rust API、serde schema、12-case 表、descriptor 模板和内嵌双模式脚本。所有 public-to-parent 项使用 `pub(super)`，其余保持 private；不得创建通用生产 ACL helper。

Modify `codex-rs/windows-sandbox-rs/src/unified_exec/mod.rs`，在现有临时诊断模块旁加入：

```rust
#[cfg(all(windows, test))]
mod legacy_acl_matrix_diagnostics;
```

不要修改现有：

```rust
#[cfg(all(windows, test))]
mod legacy_temporary_diagnostics;
```

- [ ] **Step 3: 在 parent setup 中生成 manifest、运行 Setup 并保留 case-local 错误**

`prepare_acl_matrix()` 必须按以下顺序工作：

```rust
let matrix_root = test_root.join("acl-matrix");
let manifest_path = matrix_root.join("manifest.json");
let script_path = matrix_root.join("acl-matrix.ps1");
fs::create_dir_all(&matrix_root)?;
fs::write(&script_path, ACL_MATRIX_SCRIPT)?;
let resolved_sids = resolve_required_sids(runner_user)?;
let cases = build_case_manifests(test_root, &resolved_sids)?;
let manifest = MatrixManifest {
    schema: 1,
    matrix_version: "acl-matrix-v1".to_string(),
    root: matrix_root,
    sids: resolved_sids,
    cases,
};
fs::write(&manifest_path, serde_json::to_vec_pretty(&manifest)?)?;
run_script_mode(&script_path, "Setup", &manifest_path)?;
Ok(PreparedAclMatrix {
    manifest_path,
    script_path,
})
```

`resolved_sids` 只解析一次，再同时用于 manifest 和 `build_case_manifests()`；不得重复解析得到可能不一致的主体表示。`run_script_mode()` 只把 SID 解析失败、矩阵根 descriptor 设置失败、脚本进程无法启动、进程异常退出或 manifest 无法再次解析视为矩阵级错误。单 case 的 Win32 setup 错误必须由脚本写入 manifest，不能使其他 11 个 case 丢失。

- [ ] **Step 4: 在 restricted child 中完成 descriptor、probe、DeleteFileW 与 JSONL 输出**

`child_probe_command()` 返回的命令只引用两个固定环境变量：

```text
C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%CODEX_WINDOWS_LEGACY_ACL_MATRIX_SCRIPT%" -Mode Probe -Manifest "%CODEX_WINDOWS_LEGACY_ACL_MATRIX_MANIFEST%"
```

C# helper 必须提供以下窄接口，并由 PowerShell 将返回对象序列化为单行 JSON：

```csharp
public static DescriptorRecord ReadDescriptor(string path);
public static ProbeRecord ProbeDeleteAccess(string objectPath, string parentPath);
public static DeleteRecord DeleteFileAndReadPostState(string objectPath);
public static void ApplyDescriptor(string path, DescriptorSpec descriptor, bool isDirectory);
public static MatrixMetadata ReadMetadata(string testRoot);
```

`ProbeDeleteAccess` 对 object 使用 `dwDesiredAccess=DELETE`、普通文件 flags；对 parent 使用 `dwDesiredAccess=FILE_DELETE_CHILD`、`dwFlagsAndAttributes=FILE_FLAG_BACKUP_SEMANTICS`。两次 `CreateFileW` 都记录 allowed 与 Win32 code，成功 handle 必须关闭。`DeleteFileAndReadPostState` 必须先记录 `exists_before_delete`，然后确实调用 `DeleteFileW`，分别记录 `delete_attempted`、`delete_succeeded`、`delete_win32_error` 和 `exists_after_delete`，不得从 post-state 反推 API 返回值。

- [ ] **Step 5: 在现有目标测试中增加最小门禁与 setup 接线**

在 `legacy_workspace_write_delete_is_limited_to_writable_roots()` 中，保留原五个 baseline 和两个已有 control 的创建逻辑。取得 `runner_user` 后增加：

```rust
let acl_matrix = if legacy_acl_matrix_diagnostics::diagnostics_enabled() {
    match legacy_acl_matrix_diagnostics::prepare_acl_matrix(test_root.path(), &runner_user) {
        Ok(acl_matrix) => Some(acl_matrix),
        Err(err) => {
            eprintln!("acl_matrix_parent_error stage=prepare error={err:#}");
            None
        }
    }
} else {
    None
};
```

这里禁止 `expect`、`unwrap` 或 panic。`acl_matrix_parent_error stage=prepare` 是稳定的 parent-side 错误前缀；错误后必须令 `acl_matrix=None`，不注入矩阵环境变量、不运行矩阵 child command，并继续原五个 baseline、stdout 持久化和最终断言。

在 `env_map` 构造完成后，仅当 `acl_matrix` 为 `Some` 时追加：

```rust
if let Some(acl_matrix) = &acl_matrix {
    env_map.insert(
        legacy_acl_matrix_diagnostics::ACL_MATRIX_MANIFEST_ENV.to_string(),
        acl_matrix.manifest_path.to_string_lossy().into_owned(),
    );
    env_map.insert(
        legacy_acl_matrix_diagnostics::ACL_MATRIX_SCRIPT_ENV.to_string(),
        acl_matrix.script_path.to_string_lossy().into_owned(),
    );
}
```

因此把现有 `let env_map = HashMap::from([...]);` 改为 `let mut env_map = ...`，除此之外不重排已有 key。

- [ ] **Step 6: 在现有 `.cmd` 中先运行矩阵，再继续原五个 baseline 删除**

把脚本从纯 `concat!` 调整为先构造可选矩阵片段，再拼接原内容。矩阵片段只在 `acl_matrix.is_some()` 时插入，并位于现有 PowerShell access probe 之后、首个 `del /f /q "%WORKSPACE_DELETE%"` 之前：

```rust
let acl_matrix_command = acl_matrix
    .as_ref()
    .map(|_| {
        format!(
            "{} 2>&1\r\necho acl_matrix_probe_errorlevel=%errorlevel%\r\n",
            legacy_acl_matrix_diagnostics::child_probe_command()
        )
    })
    .unwrap_or_default();
```

最终 `.cmd` 的执行顺序必须是：

1. 现有 whoami/icacls 输出；
2. 现有 delete access probe；
3. 可选 ACL matrix Probe；
4. 原 workspace、TEMP、TMP、outside、`.git` 五个删除操作；
5. `exit /b 0`。

不得删除、重命名或改变原五个 baseline 命令及 errorlevel 输出。不得改变最终 `assert_eq!` tuple 的字段、顺序或期望值。

- [ ] **Step 7: 做本地静态检查并运行根目录格式化**

Run from repository root:

```sh
rg -n -e 'legacy_acl_matrix_diagnostics' -e 'acl_matrix' codex-rs/windows-sandbox-rs/src/unified_exec/mod.rs codex-rs/windows-sandbox-rs/src/unified_exec/tests.rs codex-rs/windows-sandbox-rs/src/unified_exec/legacy_acl_matrix_diagnostics.rs
rg -n -e 'inherited_user' -e 'explicit_user_unprotected' -e 'explicit_user_protected' -e 'inherited_runner_user' -e 'inherited_authenticated_users' -e 'inherited_everyone' -e 'owner_runner_user' -e 'owner_system' -e 'object_only' -e 'parent_only' -e 'neither' -e 'both' codex-rs/windows-sandbox-rs/src/unified_exec/legacy_acl_matrix_diagnostics.rs
just fmt
git diff --check
```

Expected:

- 第一条搜索显示新模块注册、测试接线和模块实现。
- 第二条搜索显示 12 个固定 case 名称全部存在。
- `just fmt` 成功。
- `git diff --check` 无输出；这只是 tracked diff 的预检查，不覆盖尚未 stage 的新模块。完整 whitespace gate 必须以 Step 10 的 `git diff --cached --check` 为准。
- 不在 macOS 运行目标 Windows 测试；不运行全量测试、`fix` 或 Clippy。

- [ ] **Step 8: 审查实现 diff，确认未触碰禁止范围**

Run:

```sh
git diff -- codex-rs/windows-sandbox-rs/src/unified_exec/legacy_acl_matrix_diagnostics.rs codex-rs/windows-sandbox-rs/src/unified_exec/mod.rs codex-rs/windows-sandbox-rs/src/unified_exec/tests.rs
git diff --no-index -- /dev/null codex-rs/windows-sandbox-rs/src/unified_exec/legacy_acl_matrix_diagnostics.rs || true
git diff --name-only
git status --short
```

Expected implementation files are exactly:

```text
codex-rs/windows-sandbox-rs/src/unified_exec/legacy_acl_matrix_diagnostics.rs
codex-rs/windows-sandbox-rs/src/unified_exec/mod.rs
codex-rs/windows-sandbox-rs/src/unified_exec/tests.rs
```

第一条 `git diff` 只覆盖 tracked 修改；第二条 `git diff --no-index` 必须完整展示 untracked 新模块；`git status --short` 必须同时显示该新文件。设计和计划文档可以继续保持未跟踪，但不得混入实现提交。若 `.github/workflows/**`、Cargo/Bazel 文件或生产 sandbox 文件出现在 diff 中，停止并恢复该越界变更。

- [ ] **Step 9: 在 stage 前执行 change-size gate**

Run from repository root:

```sh
git diff --stat -- codex-rs/windows-sandbox-rs/src/unified_exec/mod.rs codex-rs/windows-sandbox-rs/src/unified_exec/tests.rs
git diff --numstat -- codex-rs/windows-sandbox-rs/src/unified_exec/mod.rs codex-rs/windows-sandbox-rs/src/unified_exec/tests.rs
git diff --no-index --stat -- /dev/null codex-rs/windows-sandbox-rs/src/unified_exec/legacy_acl_matrix_diagnostics.rs || true
git diff --no-index --numstat -- /dev/null codex-rs/windows-sandbox-rs/src/unified_exec/legacy_acl_matrix_diagnostics.rs || true
```

把 tracked `--numstat` 的 added+deleted 与新模块 `--no-index --numstat` 的 added+deleted 相加。若总变更超过 800 行，或 Rust/C# 复杂逻辑本身明显超过 500 行，立即停止，不 stage、不 commit；返回设计/计划阶段，把实现拆成可独立审查的阶段并等待用户确认，不得自行越过 change-size gate。机械生成的内嵌脚本文本也计入总变更，不因“临时代码”豁免。

- [ ] **Step 10: stage 仅三个实现文件并创建独立本地提交**

Run:

```sh
git add codex-rs/windows-sandbox-rs/src/unified_exec/legacy_acl_matrix_diagnostics.rs codex-rs/windows-sandbox-rs/src/unified_exec/mod.rs codex-rs/windows-sandbox-rs/src/unified_exec/tests.rs
git diff --cached --check
git diff --cached --name-only
git diff --cached --stat
git diff --cached --numstat
git commit -m "test(windows-sandbox): add temporary ACL matrix diagnostics"
```

Expected staged names are exactly the three implementation files above。`git diff --cached --check` 是同时覆盖 tracked 修改和新模块的最终完整 whitespace gate；cached stat/numstat 必须仍满足 Step 9 的 change-size gate。提交成功后记录实际 commit hash，后续回退必须使用该 hash；不要 push。

## Task 2: 只读审查提交与 CI 复用边界，并交给用户触发 Windows x64

**Files:**
- Read: committed files from Task 1
- Read: `.github/workflows/rust-ci-full.yml`
- Read: `.github/workflows/rust-ci-full-nextest-platform.yml`

- [ ] **Step 1: 只读检查本地提交内容和范围**

Run:

```sh
git show --stat --oneline --decorate HEAD
git show --check --format=fuller HEAD
git diff HEAD^ HEAD --name-only
git status --short
```

Expected:

- `HEAD` 是 Task 1 的临时诊断提交。
- commit 仅含三个实现文件。
- `git show --check` 不报告 whitespace error。
- research、设计、计划文档若未跟踪，保持未 stage 状态。

- [ ] **Step 2: 只读确认现有 workflow 已满足门禁与 artifact 收集**

Run:

```sh
rg -n -C 5 -e 'windows_legacy_delete_diagnostics' -e 'CODEX_WINDOWS_LEGACY_DELETE_DIAGNOSTICS' -e 'Upload Windows legacy delete diagnostics' .github/workflows/rust-ci-full.yml .github/workflows/rust-ci-full-nextest-platform.yml
```

Expected:

- Windows x64 job 已传入 `windows_legacy_delete_diagnostics: true`。
- reusable workflow 已设置 diagnostics dir、target、shard 三个环境变量。
- existing upload step 在失败时仍上传同一 diagnostics dir。
- 不需要 workflow 修改。

- [ ] **Step 3: 向用户交接 Windows x64 运行方式，不代执行远程操作**

优先让用户触发既有 Windows x64 shard；如果用户在 Windows x64 runner 上做窄验证，使用：

```sh
just test -p codex-windows-sandbox legacy_workspace_write_delete_is_limited_to_writable_roots --test-threads=1
```

该命令从 repository root 运行，不先 `cd codex-rs`。

Expected:

- 测试可能继续失败，且这不构成诊断实现失败。
- diagnostics artifact 应来自既有 `windows-legacy-delete-diagnostics-x86_64-pc-windows-msvc-shard-<n>` 链路。
- 不运行 Windows arm64 作为完成门禁，不运行 crate/workspace 全量测试。
- Codex 不执行 push、workflow dispatch 或任何 remote 命令。

## Task 3: 收到 artifact 后判读矩阵并更新 research，不提交

**Files:**
- Update: `docs/superpowers/research/2026-07-13-windows-legacy-sandbox-ci-evidence/current-findings.md`
- Append: `docs/superpowers/research/2026-07-13-windows-legacy-sandbox-ci-evidence/execution-log.md`

- [ ] **Step 1: 登记用户提供的 run、attempt、artifact 与日志绝对路径**

在 `execution-log.md` 追加：run id、attempt、Windows x64 job/shard、artifact 名称、下载目录、目标日志文件名和 Task 1 临时提交 hash。只记录实际收到的值，不补猜缺失字段。

- [ ] **Step 2: 验证 metadata 与 JSONL 完整性**

对 artifact 中持久化 stdout 文件运行只读检查；将 `<artifact-log>` 替换为用户提供的实际绝对路径：

```sh
rg -n -e '"record_type":"acl_matrix_metadata"' -e '"record_type":"acl_matrix_case"' -e '"record_type":"acl_matrix_end"' '<artifact-log>'
rg -c '"record_type":"acl_matrix_case"' '<artifact-log>'
```

Expected:

- 恰好一条 metadata，且 target 为 `x86_64-pc-windows-msvc`、process arch 为 x86_64、`case_count=12`。
- 恰好 12 条 `acl_matrix_case`。
- 恰好一条 `acl_matrix_end`，`completed=true`、`case_count=12`。
- 若缺任一项，停止判读并在 research 记录“artifact 不完整”，不得下根因结论。

- [ ] **Step 3: 校验 12 个固定 case、setup 状态和 child-side descriptor 有效性**

逐行解析 JSON，而不是依赖文本目测。确认 12 个固定 family/case 组合各出现一次；对每条记录检查：

```text
setup_status == "ok"
setup_error == null
exists_before_delete == true
delete_attempted == true
result_valid == true
actual_parent_descriptor == expected_parent_descriptor
actual_object_descriptor == expected_object_descriptor
```

任何 case 不满足时，把它标记为 invalid 并从家族结论排除。若某家族无法形成完整单变量对照，停止该家族判读，不用其他家族结果填补。

- [ ] **Step 4: 先校准 delete-path，再判读其他家族**

delete-path 完成条件固定为：

```text
object_only: object DELETE probe allowed；parent FILE_DELETE_CHILD probe denied；DeleteFileW 成功
parent_only: object DELETE probe denied；parent FILE_DELETE_CHILD probe allowed；DeleteFileW 成功
neither: 两个 probe 均 denied；DeleteFileW 失败且 Win32 error 为 access denied
both: 两个 probe 均 allowed；DeleteFileW 成功
```

如果四个 control 不符合上述关系，不对 inheritance/trustee/owner 的真实删除结果作 authorization-path 结论，只记录观察值和实验失效原因。

- [ ] **Step 5: 确认原五个 baseline 仍复现目标 x64 失败**

从同一 stdout 中核对 workspace、TEMP、TMP、outside、`.git` 的既有 access probe、删除 errorlevel 和最终断言输出。完成条件不是测试通过，而是同一运行仍显示已知 x64 过宽模式：outside 和 `.git` 删除边界失效，同时矩阵记录完整。

如果 baseline 未复现，则该 run 不能用于解释原问题；记录环境/行为变化并停止根因判断。

- [ ] **Step 6: 按固定判读规则更新 current findings**

仅在 Step 2–5 全部满足后更新 `current-findings.md`：

- inheritance：只有 `inherited_user` 翻转，记录 inheritance/`INHERITED_ACE` 为强候选；两个 unprotected 一致而 protected 翻转，记录 DACL protection/control 为强候选；三者均拒绝，记录受控矩阵未复现宿主条件。
- trustee：`inherited_everyone` 应作为 allow 正控制；runner user 与 `Authenticated Users` 的差异只在 token SID 前提与 descriptor 均有效时解释。
- owner：仅 `owner_runner_user` 与 `owner_system` 形成有效差异时，把 owner 纳入候选；结果一致只排除 owner 在该受控 DACL 下是独立充分因素。
- delete-path：明确记录实际删除由 object `DELETE`、parent `FILE_DELETE_CHILD` 或两者任一路径校准后的现场行为。
- 不把单次矩阵写成普遍 Windows 语义，不把 `D:` 写成已证实原因，不宣称安全修复完成。

- [ ] **Step 7: 追加 execution log 并确认 research 保持未提交**

在 `execution-log.md` 追加实际检查命令、每个 family 的有效/无效 case、delete-path 校准结果、baseline 复现和停止条件。research 目录是 ignored 调查记录，不能使用普通 `git diff` 或 path-scoped `git status` 作为内容已更新的证据。然后运行：

```sh
rg -n -e 'run [0-9]+' -e 'acl_matrix_metadata' -e 'delete-path' docs/superpowers/research/2026-07-13-windows-legacy-sandbox-ci-evidence/current-findings.md docs/superpowers/research/2026-07-13-windows-legacy-sandbox-ci-evidence/execution-log.md
tail -n 80 docs/superpowers/research/2026-07-13-windows-legacy-sandbox-ci-evidence/current-findings.md
tail -n 120 docs/superpowers/research/2026-07-13-windows-legacy-sandbox-ci-evidence/execution-log.md
git check-ignore -v docs/superpowers/research/2026-07-13-windows-legacy-sandbox-ci-evidence/current-findings.md docs/superpowers/research/2026-07-13-windows-legacy-sandbox-ci-evidence/execution-log.md
git diff --cached --name-only
git status --short
```

Expected: `rg`/`tail` 直接显示新增 run id、稳定结论和执行记录；`git check-ignore -v` 确认两文件由 ignore 规则管理；cached names 不包含两份 research 文件；整体 `git status` 不显示它们被 stage。两份 research 文件不 commit。

## Task 4: 用户确认取证充分后逐提交回退临时代码

**Files:**
- Revert: 本轮实际产生的临时诊断提交
- Preserve: research、设计、计划文档的未提交状态

- [ ] **Step 1: 等待用户明确确认取证充分并授权进入回退**

没有用户明确确认时，不执行任何 revert。确认安全修复另行设计；本任务只回退临时代码。

- [ ] **Step 2: 列出本轮临时提交并确定反向顺序**

Run:

```sh
git log --oneline --decorate --max-count=20
git status --short
```

记录所有“本轮 ACL 矩阵诊断”实际提交 hash。若除 Task 1 单提交外又产生临时提交，按原提交时间的反向顺序处理；每个原提交必须对应一个独立 revert commit。

- [ ] **Step 3: 对最新临时提交执行一个独立 revert**

Run once per commit, newest first:

```sh
git revert <actual-temporary-commit-sha>
```

禁止使用 `git revert --no-commit`、批量 staged 反向 diff、手写反向 patch或 squash。默认 revert message 必须保留原 commit hash 关联。

- [ ] **Step 4: 每个 revert 后立即检查该独立提交**

Run after each revert:

```sh
git show --stat --oneline --decorate HEAD
git show --check --format=fuller HEAD
git status --short
```

Expected:

- 当前 `HEAD` 是刚完成的单一 revert commit。
- 该 revert 只撤销对应原提交。
- 未提交 research、设计和计划文档仍保留；不得被 revert 清理或加入提交。

- [ ] **Step 5: 重复独立 revert，直到所有本轮临时提交均已回退**

每次只 revert 一个 hash，并重复 Step 4。不要合并多个回退。

- [ ] **Step 6: 最终确认矩阵代码已移除且生产路径未被改变**

Run:

```sh
rg -n -e 'legacy_acl_matrix_diagnostics' -e 'acl_matrix_v1' codex-rs/windows-sandbox-rs/src/unified_exec || true
git log --oneline --decorate --max-count=12
git status --short
```

Expected:

- 新增 sibling module 与测试接线均已由 revert 移除。
- 每个临时提交均有一个可审查的独立 revert commit。
- research、设计、计划文档状态符合回退前状态。
- 不 push，不运行远程命令。
