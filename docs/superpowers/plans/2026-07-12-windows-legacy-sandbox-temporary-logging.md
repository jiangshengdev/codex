# Windows legacy sandbox 一次性排查日志实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 `legacy_workspace_write_delete_is_limited_to_writable_roots` 增加一次性 Windows 现场取证，使用户提交后能从 CI 日志定位权限过宽或权限过窄的根因；取得证据后全部回退。

**Architecture:** 沿目标测试真实经过的 token、ACL mutation、legacy spawn 和 child 删除链路直接插入日志。测试专用环境变量开启诊断；`whoami` / `icacls` 输出命令行可见信息，Rust 侧直接查询 restricted SID、原始 ACE 和 Win32 返回码，不建设 collector、renderer、freeze 或长期 API。

**Tech Stack:** Rust 2024、`windows-sys 0.52`、Win32 token/security APIs、Windows `cmd.exe`、`whoami.exe`、`icacls.exe`、现有 `just` 工具链。

---

## 执行约束

- 对应设计：`docs/superpowers/specs/2026-07-12-windows-legacy-sandbox-temporary-logging-design.md`。
- 一次性排查代码允许重复、直接打印、临时参数和侵入私有调用链，不以文件数或行数验收。
- 每处改动必须直接提供 token、ACL、mutation 或删除行为证据；禁止建设长期诊断框架。
- 不改变 token 构造、ACL 顺序、permission profile、writable roots、child 删除顺序和最终 tuple 断言。
- 诊断失败只能记录并继续，不能改变被测行为或把原有忽略错误改成 fail-closed。
- 不安装 Windows target、程序、依赖或运行时。本机没有 Windows 不是阻塞，现场由现有 Windows CI 提供。
- 不执行任何 Git 远程命令。用户负责把本地提交送到 CI。
- 实现形成一个本地临时诊断提交，便于取得证据后用一个独立 `git revert <sha>` 全部放弃。

## 文件范围

**Create**

- `codex-rs/windows-sandbox-rs/src/unified_exec/legacy_temporary_diagnostics.rs`
  - 读取实际 token 和固定路径 DACL，直接 `eprintln!` 原始信息；不定义 report/collector 模型。

**Modify**

- `codex-rs/windows-sandbox-rs/src/unified_exec/mod.rs`
- `codex-rs/windows-sandbox-rs/src/unified_exec/tests.rs`
- `codex-rs/windows-sandbox-rs/src/unified_exec/backends/legacy.rs`
- `codex-rs/windows-sandbox-rs/src/spawn_prep.rs`
- `codex-rs/windows-sandbox-rs/src/acl.rs`
- `codex-rs/windows-sandbox-rs/src/workspace_acl.rs`

若实际取证必须修改其他私有 Windows 文件，可以修改，但需要先说明该文件回答哪条根因假设。

## Task 1：让目标测试输出 child 现场

**Files:**

- Modify: `codex-rs/windows-sandbox-rs/src/unified_exec/tests.rs:458-563`

- [ ] **Step 1：增加唯一诊断开关和固定观察路径**

在目标测试的 `env_map` 加入：

```rust
("CODEX_WINDOWS_LEGACY_TEMP_DIAGNOSTICS".to_string(), "1".to_string()),
("DIAG_WORKSPACE".to_string(), workspace.to_string_lossy().into_owned()),
("DIAG_TEMP_ROOT".to_string(), temp_root.to_string_lossy().into_owned()),
("DIAG_TMP_ROOT".to_string(), tmp_root.to_string_lossy().into_owned()),
("DIAG_OUTSIDE_ROOT".to_string(), outside_root.to_string_lossy().into_owned()),
```

保留现有五个删除目标变量。

- [ ] **Step 2：在任何删除前运行 `whoami` 和 `icacls`**

向现有 `.cmd` 加入：

```bat
echo ==== legacy temporary diagnostics: whoami ====
C:\Windows\System32\whoami.exe /all
echo whoami_errorlevel=%errorlevel%
echo ==== legacy temporary diagnostics: icacls ====
C:\Windows\System32\icacls.exe "%DIAG_WORKSPACE%"
C:\Windows\System32\icacls.exe "%WORKSPACE_DELETE%"
C:\Windows\System32\icacls.exe "%PROTECTED_GIT_DIR%"
C:\Windows\System32\icacls.exe "%DIAG_OUTSIDE_ROOT%"
C:\Windows\System32\icacls.exe "%OUTSIDE_DELETE%"
C:\Windows\System32\icacls.exe "%DIAG_TEMP_ROOT%"
C:\Windows\System32\icacls.exe "%TEMP_DELETE%"
C:\Windows\System32\icacls.exe "%DIAG_TMP_ROOT%"
C:\Windows\System32\icacls.exe "%TMP_DELETE%"
```

不使用 `&&`，任何诊断命令失败后仍继续。

- [ ] **Step 3：逐条打印删除结果**

保持原删除顺序，改为：

```bat
del /f /q "%WORKSPACE_DELETE%"
echo delete_workspace_errorlevel=%errorlevel%
del /f /q "%TEMP_DELETE%"
echo delete_temp_errorlevel=%errorlevel%
del /f /q "%TMP_DELETE%"
echo delete_tmp_errorlevel=%errorlevel%
del /f /q "%OUTSIDE_DELETE%"
echo delete_outside_errorlevel=%errorlevel%
rmdir "%PROTECTED_GIT_DIR%"
echo remove_git_errorlevel=%errorlevel%
exit /b 0
```

- [ ] **Step 4：保留现有失败消息**

继续把 child stdout 和 `sandbox_log(codex_home.path())` 放入原 `assert_eq!` 消息，不改变期望 tuple。

- [ ] **Step 5：检查本任务 diff**

Run: `git diff -- codex-rs/windows-sandbox-rs/src/unified_exec/tests.rs`

Expected: 只有目标测试的环境变量和 `.cmd` 日志变化。

## Task 2：读取最终用于 spawn 的 restricted token

**Files:**

- Create: `codex-rs/windows-sandbox-rs/src/unified_exec/legacy_temporary_diagnostics.rs`
- Modify: `codex-rs/windows-sandbox-rs/src/unified_exec/mod.rs:1-20`
- Modify: `codex-rs/windows-sandbox-rs/src/unified_exec/backends/legacy.rs:55-105,310-370`

- [ ] **Step 1：注册 Windows-only 私有临时模块**

```rust
#[cfg(windows)]
mod legacy_temporary_diagnostics;
```

不从 `lib.rs` 导出。

- [ ] **Step 2：读取回退提交中的安全 Win32 buffer 处理作为参考**

Run:

```text
git show 6efa5a0c7b9fbdd0424351ea934f483dc3023a03:codex-rs/windows-sandbox-rs/src/unified_exec/legacy_diagnostics/win32.rs
```

Expected: 找到 `snapshot_token`、`query_token_information`、SID_AND_ATTRIBUTES 解析和 SID 字符串转换。只复用指针与 buffer 处理，不复制 snapshot、collector、error model 或排序逻辑。

- [ ] **Step 3：实现直接输出 token 的入口**

临时模块提供：

```rust
pub(super) unsafe fn dump_spawn_token(token: HANDLE, capability_roots: &[RootCapabilitySid]) {
    eprintln!("==== legacy temporary diagnostics: spawn token ====");
    dump_token_class(token, TokenUser, "TokenUser");
    dump_token_class(token, TokenGroups, "TokenGroups");
    dump_token_class(token, TokenRestrictedSids, "TokenRestrictedSids");
    for root in capability_roots {
        eprintln!("capability_root path={} sid={}", root.root.display(), root.sid_str);
    }
}
```

`dump_token_class` 按 `GetTokenInformation` 两次调用模式读取 buffer。`TokenUser` 输出 SID；groups/restricted SIDs 按原顺序输出 `index`、SID、`attributes=0x........`。每个失败分支立即输出 API、class、`GetLastError()` 并继续下一 class。不得保存裸指针。

- [ ] **Step 4：在最终 spawn handle 使用点调用**

给 `spawn_legacy_process` 增加私有参数 `temporary_diagnostics: Option<&[RootCapabilitySid]>`。在进入 `if tty` 前执行：

```rust
if let Some(capability_roots) = temporary_diagnostics {
    unsafe { legacy_temporary_diagnostics::dump_spawn_token(h_token, capability_roots) };
}
```

该 `h_token` 必须是随后传给两个 `CreateProcessAsUserW` 分支的同一 handle，禁止重新打开当前进程 token。

- [ ] **Step 5：只在目标测试开关开启时传入 roots**

```rust
let temporary_diagnostics = env_map
    .contains_key("CODEX_WINDOWS_LEGACY_TEMP_DIAGNOSTICS")
    .then_some(security.write_root_sids.as_slice());
```

正常调用传 `None`。

## Task 3：输出 ACL mutation 前后的原始 DACL/ACE

**Files:**

- Modify: `codex-rs/windows-sandbox-rs/src/unified_exec/legacy_temporary_diagnostics.rs`
- Modify: `codex-rs/windows-sandbox-rs/src/unified_exec/backends/legacy.rs:310-340`

- [ ] **Step 1：读取回退提交中的 ACL 指针解析作为参考**

Run:

```text
git show 6efa5a0c7b9fbdd0424351ea934f483dc3023a03:codex-rs/windows-sandbox-rs/src/unified_exec/legacy_diagnostics/win32_acl.rs
```

Expected: 找到 security descriptor 生命周期、`GetNamedSecurityInfoW`、`GetAclInformation`、`GetAce`、ACE SID/mask/flags 和 `LocalFree` 处理。不要复制 snapshot/report 类型。

- [ ] **Step 2：实现固定路径直接输出**

```rust
pub(super) fn dump_path_acls(stage: &str, env_map: &HashMap<String, String>) {
    for key in [
        "DIAG_WORKSPACE", "WORKSPACE_DELETE", "PROTECTED_GIT_DIR",
        "DIAG_OUTSIDE_ROOT", "OUTSIDE_DELETE", "DIAG_TEMP_ROOT",
        "TEMP_DELETE", "DIAG_TMP_ROOT", "TMP_DELETE",
    ] {
        match env_map.get(key) {
            Some(path) => unsafe { dump_one_path_acl(stage, key, Path::new(path)) },
            None => eprintln!("acl stage={stage} key={key} missing_env"),
        }
    }
}
```

`dump_one_path_acl` 输出 path/exists、owner SID、DACL control、每个 ACE 的 index/type/SID/mask/flags。目标和直接父目录都输出；workspace/outside 可沿 parent 打印到卷根，循环必须在 `parent() == current` 或 `None` 停止。未知 ACE 输出原始 type/flags，不能 panic。每个 Win32 失败输出 API/path/code 后继续。security descriptor 返回前 `LocalFree`。

- [ ] **Step 3：在 ACL 应用前后调用**

```rust
if temporary_diagnostics_enabled {
    legacy_temporary_diagnostics::dump_path_acls("before_acl", &env_map);
}
apply_legacy_session_acl_rules(/* existing arguments */)?;
if temporary_diagnostics_enabled {
    legacy_temporary_diagnostics::dump_path_acls("after_acl", &env_map);
}
```

`after_acl` 必须早于 child spawn。

- [ ] **Step 4：核对证据**

Run: `rg -n 'before_acl|after_acl|dump_path_acls|GetAce|GetAclInformation' codex-rs/windows-sandbox-rs/src/unified_exec`

Expected: 同一组对象和父目录存在前后两份输出。

## Task 4：记录 ACL operation 与被折叠的 Win32 错误

**Files:**

- Modify: `codex-rs/windows-sandbox-rs/src/spawn_prep.rs:269-347`
- Modify: `codex-rs/windows-sandbox-rs/src/acl.rs:62-80,310-380,446-505,547-600`
- Modify: `codex-rs/windows-sandbox-rs/src/workspace_acl.rs:13-35`

- [ ] **Step 1：在高层读取开关**

```rust
let temporary_diagnostics_enabled =
    env_map.contains_key("CODEX_WINDOWS_LEGACY_TEMP_DIAGNOSTICS");
```

- [ ] **Step 2：把目标 `let _ =` 改为记录后仍忽略**

对 readonly allow、writable-root allow、deny-write、`.codex` 和 `.agents` protection 使用：

```rust
let result = ensure_allow_write_aces(p, &[root_sid.sid.as_ptr()]);
if temporary_diagnostics_enabled {
    eprintln!(
        "legacy_acl operation=ensure_allow_write path={} sid={} result={result:?}",
        p.display(), root_sid.sid_str
    );
}
```

其他 operation 名分别为 `add_allow_readonly`、`add_deny_write`、`protect_workspace_codex`、`protect_workspace_agents`。记录后不使用 `?`，保持原忽略语义。

- [ ] **Step 3：保留 `CreateFileW` 即时错误码**

在 `fetch_dacl_handle` 失败后立即 `GetLastError()` 并放入现有 `Err` 文本，不能经过其他 Win32 调用后再读取。

- [ ] **Step 4：在 `add_allow_ace` 和 `add_deny_ace` 原地打印被折叠的码**

在 `SetEntriesInAclW` 的 `code2 != ERROR_SUCCESS` 和 `SetNamedSecurityInfoW` 的 `code3 != ERROR_SUCCESS` 分支直接打印：

```rust
eprintln!(
    "legacy_acl_api operation={operation} path={} api={api} code={code}",
    path.display()
);
```

`operation` 分别标识 allow/deny，deny 同时输出 `kind=read|write`。保持原 `Result<bool>` 和 `Ok(false)` 控制流，不建设 outcome 类型。

- [ ] **Step 5：区分 workspace protection missing 与 mutation 结果**

在 `protect_workspace_subdir` 输出 path 的 `is_dir` 状态和委托给 `add_deny_write_ace` 的完整结果。若要保证正常产品零日志，给该私有 helper 增加 `temporary_diagnostics_enabled: bool` 参数；不要使用进程全局环境变量。

- [ ] **Step 6：核对所有目标结果可见**

Run: `nl -ba codex-rs/windows-sandbox-rs/src/spawn_prep.rs | sed -n '285,350p'`

Expected: allow/deny/protection 都能看到 operation/path/SID/result，底层非零 API 码不再静默折叠。

## Task 5：本机验证与范围审查

**Files:**

- Verify all implementation files from Tasks 1-4

- [ ] **Step 1：确认开关只由目标测试设置**

Run: `rg -n 'CODEX_WINDOWS_LEGACY_TEMP_DIAGNOSTICS' codex-rs/windows-sandbox-rs/src`

Expected: 唯一设置点在目标测试，其他位置只读取。

- [ ] **Step 2：确认没有长期框架**

Run: `rg -n 'Collector|DiagnosticsRequest|DiagnosticsReport|DiagnosticsLimits|freeze\(|render\(' codex-rs/windows-sandbox-rs/src/unified_exec/legacy_temporary_diagnostics.rs`

Expected: 无匹配。

- [ ] **Step 3：运行窄测试**

Run from `codex-rs`:

```text
just test -p codex-windows-sandbox legacy_workspace_write_delete_is_limited_to_writable_roots
```

Expected: 当前平台通过或按现有 Windows-only 条件跳过。若 macOS 不编译目标模块，记录事实；不要安装 Windows target。

- [ ] **Step 4：按仓库规则最后运行格式化**

Run from `codex-rs`: `just fmt`

Expected: succeeds。格式化后不重复运行测试。

- [ ] **Step 5：检查最终 diff**

Run:

```text
git diff --check
git status --short
git diff --stat
git diff -- codex-rs/windows-sandbox-rs/src
```

Expected: 无 whitespace error；每处变更都直接贡献根因证据，不按行数验收。

## Task 6：创建可整体回退的本地诊断提交

**Files:**

- Stage only implementation files from Tasks 1-4

- [ ] **Step 1：明确暂存实现文件**

```text
git add codex-rs/windows-sandbox-rs/src/unified_exec/legacy_temporary_diagnostics.rs codex-rs/windows-sandbox-rs/src/unified_exec/mod.rs codex-rs/windows-sandbox-rs/src/unified_exec/tests.rs codex-rs/windows-sandbox-rs/src/unified_exec/backends/legacy.rs codex-rs/windows-sandbox-rs/src/spawn_prep.rs codex-rs/windows-sandbox-rs/src/acl.rs codex-rs/windows-sandbox-rs/src/workspace_acl.rs
```

实际增加其他经确认的诊断文件时明确追加；不使用 `git add -A`。

- [ ] **Step 2：检查 staged diff**

Run separately:

```text
git diff --cached --check
git diff --cached --stat
git diff --cached
```

Expected: 全部是一次性取证代码；设计与计划文档不混入代码提交。

- [ ] **Step 3：创建单个临时诊断提交**

Run: `git commit -m "test(windows-sandbox): add temporary legacy bug diagnostics"`

Expected: 本地提交成功。记录完整 SHA；禁止任何远程操作。

## Task 7：Windows CI 证据门禁与退出

**Files:**

- No code changes before CI evidence is reviewed

- [ ] **Step 1：由用户把本地提交送入现有 Windows CI**

主代理不执行远程 Git 操作。

- [ ] **Step 2：检查一次 CI 是否包含完整证据链**

按顺序确认：spawn token 三类信息、root-to-SID、before ACL/ACE、每次 mutation 结果、底层 Win32 error code、after ACL/ACE、child `whoami`、child `icacls`、每次删除 errorlevel、最终 tuple 和 sandbox log。

- [ ] **Step 3：按证据判断根因**

- mutation 有 Win32 error：定位写入失败 API。
- mutation 成功但前后 DACL 不变：定位预检或写入目标错误。
- DACL 正确但 outside/`.git` 仍删除：比较普通 groups 与 restricted SIDs 的共同 SID，以及父目录 `FILE_DELETE_CHILD`。
- writable roots 删除失败：比较 allow SID、mask、inherit flags 和 descendant 实际 DACL。
- restricted SIDs 不符合 capability/logon/Everyone 预期：定位 token 构造或最终 spawn token。

- [ ] **Step 4：若仍缺证据，只补一个明确缺口**

新增日志前写明“缺失问题”和“新增证据”。不得重构、美化、增加 renderer 或通用测试。

- [ ] **Step 5：根因确定后独立回退临时提交**

Run: `git revert <temporary-diagnostics-full-sha>`

Expected: 生成独立 revert commit，正文包含原完整 hash。禁止 `--no-commit`、手写反向 patch、squash 或 reset。

- [ ] **Step 6：检查回退结果**

Run:

```text
git show --stat --oneline HEAD
git status --short
```

Expected: 工作区干净；临时诊断代码净变化归零；实现提交与对应 revert 都保留在历史中。
