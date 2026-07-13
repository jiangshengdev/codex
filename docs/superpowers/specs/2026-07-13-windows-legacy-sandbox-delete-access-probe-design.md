# Windows legacy sandbox 删除访问窄诊断设计

日期：2026-07-13
状态：设计已确认，计划已落盘
范围：`codex-rs/windows-sandbox-rs` 目标测试的一次性删除访问取证

## 关联材料

- 完整一次性日志设计：
  `docs/superpowers/specs/2026-07-12-windows-legacy-sandbox-temporary-logging-design.md`
  - 该文档是本设计的实施基线；本设计只补充它取得现场后仍未闭合的证据。
- 早期通用诊断设计：
  `docs/superpowers/specs/2026-07-12-windows-legacy-sandbox-diagnostics-design.md`
  - 该文档仅作历史背景，已被后续一次性日志设计取代，不再作为实施依据。
- 当前稳定研究结论：
  `docs/superpowers/research/2026-07-13-windows-legacy-sandbox-ci-evidence/current-findings.md`

## 背景

上一轮临时诊断已在 fork Windows x64 shard 4/4 中取得两组完整现场，并闭合了以下证据：

- workspace、`TEMP`、`TMP` 的 capability SID 均正确生成、写入 ACL 并加入
  `TokenRestrictedSids`。
- `.git` 的 capability SID deny ACE 已成功写入，并包含删除相关权限。
- 诊断读取的 `h_token` 未在应用层被替换，而是直接传给 `CreateProcessAsUserW`。
- 两次现场中 workspace、`TEMP`、`TMP`、outside 和 `.git` 的删除操作全部成功。
- outside 文件与 `.git` 仍有普通 `TokenUser` 的 `runneradmin:(I)(F)`，删除结果与该 ACE
  直接放行一致。

因此不再需要重复证明 token 构造、ACL mutation、父侧 token dump 或最终删除结果。当前只剩下
一个需要运行时证据的问题：在真正的 restricted child 中，文件对象 `DELETE` 与父目录
`FILE_DELETE_CHILD` 分别是否可获得，且这个结果是否随 `D:\a` / `C:\a` 卷环境变化。

## 单一待验证假设

legacy sandbox 使用 `WRITE_RESTRICTED` token，期望 restricting SID 对删除访问形成第二重权限约束。

当前假设是：

> 在 fork GitHub-hosted Windows x64 `D:\a` 环境中，以该 restricted token 请求文件 `DELETE`
> 或父目录 `FILE_DELETE_CHILD` 时，至少有一条授权路径可以只由普通 `runneradmin` Full Control
> 满足，restricting SID 没有形成设计预期的删除边界。

本设计只验证这一假设，不同时设计修复。

## 方案比较

### A. 目标测试生成临时 PowerShell/PInvoke probe（采用）

由目标测试在 `test_root` 中写入一个临时 `.ps1` 文件。受限 `cmd.exe` 在原删除操作之前调用系统
`powershell.exe`，脚本通过 P/Invoke 直接调用 Win32 token、file access 和 volume API。

PowerShell 启动参数固定为 `-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File <probe.ps1>`，
`cmd.exe` 调用处使用 `2>&1` 把 probe stderr 并入现有 stdout，并在 probe 返回后立即保存与输出
`probe_errorlevel`。

优点：

- probe 在 restricted child 派生进程中运行，获得的是实际 child token 与内核文件访问结果。
- 无需增加 Cargo binary、Bazel target 或 nextest helper 打包。
- 代码与现有一次性诊断一起回退，不建设长期框架。

代价：

- P/Invoke 定义和 PowerShell 引号处理较长。
- `powershell.exe` 启动或 `Add-Type` 失败时只能记录诊断不可用，不能替换原测试结果。

### B. 新增临时 Rust helper binary（不采用）

该方案可获得同等 Win32 证据，但需要新增 binary target，并修改 nextest archive、runtime helper
artifact 及 Cargo/Bazel 构建绑定。对一次性 probe 而言范围过大。

### C. 父进程模拟 `AccessCheck` 或 impersonation（不采用）

父进程模拟无法同时证明 child 中 token 状态与真实 `CreateFileW` 行为，且容易引入 generic mapping、
impersonation level 或模拟差异。本轮应优先读取真实 child token 并让 Windows 文件系统实际判定访问。

## 目标

- 从实际 probe child 读取 `TokenIsRestricted` 和 `TokenRestrictedSids`。
- 分别测量每个关键对象的文件/目录 `DELETE` 与父目录 `FILE_DELETE_CHILD` 授权结果。
- 记录目标路径所在卷的 drive type、filesystem name 和 volume flags。
- 在 fork Windows x64 `D:\a` 与 Windows arm64 `C:\a` 上取得同格式输出。
- 保持原 token、ACL、五个删除命令的相对顺序、删除目标、errorlevel 记录和最终 tuple
  断言不变；只在第一条删除命令前插入 probe。

## 非目标

- 不重复父侧完整 `TokenUser`、`TokenGroups`、`TokenRestrictedSids` 输出。
- 不新增第二套 ACL mutation 前后全量 DACL/ACE、`icacls`、`whoami /all` 或删除 errorlevel 采集。
  上一轮临时输出仍原样存在，并可能随完整 child stdout 一起进入 artifact。
- 不修改 `WRITE_RESTRICTED`、capability SID、ACL mask、权限计算或 spawn 逻辑。
- 不建设通用 collector、renderer、自动根因分类器或长期诊断协议。
- 不将 `D:`、filesystem 或 volume flags 直接解释为根因。
- 不要求 upstream 添加本次临时诊断。
- 不修改 elevated backend、公开协议或依赖。

## 总体设计

新 probe 沿用现有 `CODEX_WINDOWS_LEGACY_TEMP_DIAGNOSTICS` 测试门禁，只由
`legacy_workspace_write_delete_is_limited_to_writable_roots` 开启。

目标测试新增一个临时 PowerShell/PInvoke probe 脚本，并在现有 `delete-fixtures.cmd` 中的第一条删除命令前
运行。probe 不修改五个被观察 fixture、它们的 ACL、token 或删除 disposition；它只打开 token、
尝试获得指定访问权限、立即关闭 handle，并输出卷信息。诊断生成的 `.ps1`、`Add-Type` 临时编译产物和
artifact 不属于被观察 fixture。

PowerShell 进程由受限 `cmd.exe` 直接创建，使用默认 token 继承语义。本轮查询的是该派生 probe 进程的
当前 token；它验证默认创建语义下继承的 restricted token 及该 token 的真实文件访问结果，不声称直接读取
`cmd.exe` 自身 token。

probe stdout 以及由 `2>&1` 并入的 stderr 继续通过现有 child stdout pipe 返回测试。为了在 arm64 测试通过时
仍能取得日志，父侧
测试在 `collect_stdout_and_exit` 后把已捕获的 stdout 复制到 CI 指定的诊断目录。workflow 在测试成功或
失败时都上传该目录。

PowerShell 冷启动与 `Add-Type` 编译可能超过现有 5 秒 session timeout。因此只在诊断门禁开启时，目标测试将
session timeout 提高到 30 秒，stdout/exit 收集等待预算必须大于该值。这是诊断时序变化，不得写成测试
完全无时序变化；保持不变的是权限配置、五个删除命令的相对顺序和最终文件状态断言。

## Child token 原生核对

PowerShell probe 通过 P/Invoke 执行：

1. `GetCurrentProcess` 取得当前 probe 进程。
2. `OpenProcessToken(..., TOKEN_QUERY, ...)` 打开当前进程 token。
3. `IsTokenRestricted` 输出布尔结果。
4. `GetTokenInformation(TokenRestrictedSids)` 输出每个 SID 与 attributes。

输出只包含当前缺失的 child 证据，不再重复完整 `TokenGroups` 或账户名解析。SID 必须使用
`ConvertSidToStringSidW` 输出稳定字面量。

输出格式：

```text
probe_begin schema=1
child_token is_restricted=true
child_token restricted_sid index=0 sid=S-... attributes=0x00000007
probe_end status=ok
```

`OpenProcessToken`、`GetTokenInformation` 或 SID 转换失败时输出 API 名和原始 Win32 error code，不使 probe
或原删除脚本提前失败。

## `DELETE` / `FILE_DELETE_CHILD` 非破坏性探测

### 观察对象

对以下对象使用固定 key：

- `workspace_file`
- `temp_file`
- `tmp_file`
- `outside_file`
- `protected_git_dir`

workspace、`TEMP`、`TMP` 是允许删除的正控制；outside 和 `.git` 是应拒绝的负控制。

### 对象 `DELETE`

对每个文件或目录单独调用 `CreateFileW`：

- `dwDesiredAccess = DELETE`
- `dwShareMode = FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE`
- `dwCreationDisposition = OPEN_EXISTING`
- 目录额外使用 `FILE_FLAG_BACKUP_SEMANTICS`
- 禁止 `FILE_FLAG_DELETE_ON_CLOSE`

成功时立即 `CloseHandle`。不调用 `SetFileInformationByHandle`、`DeleteFileW`、`RemoveDirectoryW` 或任何修改对象状态的 API。

### 父目录 `FILE_DELETE_CHILD`

对每个对象的直接父目录单独调用 `CreateFileW`：

- `dwDesiredAccess = FILE_DELETE_CHILD`
- 其余 share mode 与 creation disposition 同上
- 必须使用 `FILE_FLAG_BACKUP_SEMANTICS`

该 probe 只回答 token 能否打开带有 `FILE_DELETE_CHILD` 权限的父目录 handle。它不删除 child，也不在
诊断代码中判断原 `del` / `rmdir` 最终选择了哪条路径。

输出格式：

```text
access_probe key=outside_file access=DELETE success=true code=0
access_probe key=outside_file_parent access=FILE_DELETE_CHILD success=false code=5
```

对于权限拒绝，`success=false code=5` 是有效诊断结果，不是 probe 失败。输出保留原始 error code，禁止在
probe 中把所有失败自动解释为 ACL 拒绝。

## 卷环境采集

对每个观察路径先调用 `GetVolumePathNameW` 得到 volume root，按规范化 root 去重后输出：

- `GetDriveTypeW` 结果。
- `GetVolumeInformationW` 返回的 filesystem name。
- volume flags，使用固定宽度十六进制。
- API 失败时的 Win32 error code。

输出格式：

```text
volume root=D:\ drive_type=3 filesystem=NTFS flags=0x00000000
```

不输出 volume label、卷中文件列表或其他与删除访问无关的机器信息。

## 诊断插入时点与数据流

1. 目标测试创建现有 workspace、`TEMP`、`TMP`、outside、`.git` 和待删除对象。
2. 目标测试写入临时 PowerShell/PInvoke probe 脚本。
3. 现有 legacy 路径创建 restricted token 并应用 ACL，保留已有诊断输出。
4. 受限 `cmd.exe` 先运行 probe，输出 child token、access probe 和 volume 记录。
5. probe 返回后，同一 `cmd.exe` 按原相对顺序执行五个删除命令。
6. 父侧测试收集 stdout 和 exit code，保留原 tuple 断言。
7. 如果 CI 诊断目录已显式配置，父侧测试在执行 tuple assertion 前，best-effort 将已捕获的完整
   child stdout 写入唯一诊断文件。
8. workflow 在 `always()` 条件下 best-effort 上传诊断文件，使失败的 x64 和通过的 arm64 都能取得证据。

## CI 对照与 artifact

### 显式门禁

在 reusable Windows test workflow 中增加一个默认为 `false` 的诊断 input。只有 fork 的 Windows x64 与 Windows arm64
调用显式开启。

开关开启时，workflow 为 test step 设置一个专用输出目录环境变量。该变量是 CI 取证开关，不是
sandbox 产品配置。本地和默认 CI 不设置时，测试不写诊断文件。

### 唯一文件

诊断文件名必须包含：

- target triple。
- shard 编号。
- 当前测试进程 ID。

这避免 nextest retry 或并行 shard 覆盖证据。输出目录必须是父侧测试可写的 `RUNNER_TEMP` 子目录，不要求
restricted child 直接写入 writable roots 之外。

### 上传

workflow 新增 `if: always()` 的 artifact upload step：

- artifact name 包含 target 和 shard。
- path 只匹配专用诊断目录。
- 其他 shard 没有诊断文件时使用 `if-no-files-found: ignore`。
- 使用 `continue-on-error: true`，artifact 服务失败不得把原本通过的 arm64 测试变成失败。
- 不修改整个 shard 的 nextest success-output 策略。

当前 workflow 虽然会 `always()` 上传 nextest JUnit，但本设计不把 JUnit 当作“通过测试原始 stdout 必然完整保留”的
稳定接口。专用 artifact 用于确保 arm64 通过现场可下载对照。不应为了显示一个测试的成功输出而打开整个
shard 的成功日志。

## 输出边界

本轮新增的记录类型只包含：

- child `TokenIsRestricted`。
- child `TokenRestrictedSids`。
- 五个观察对象的 `DELETE` probe。
- 相应父目录的 `FILE_DELETE_CHILD` probe。
- 去重后卷信息。
- probe 自身 API 或 PowerShell 启动错误。

父侧持久化的是完整 child stdout，因此 artifact 也会包含上一轮已存在的 `whoami`、`icacls` 和删除
errorlevel。这不代表本轮新增了第二套采集。不增加新的全量 ACL、账户名、环境变量、文件内容或系统软件列表。

## 错误处理

- probe 中的单个 API 失败记录 API 名、key 和 Win32 error code，然后继续其他 probe。
- `powershell.exe` 启动失败、脚本解析失败或 probe 退出非零时，`cmd.exe` 记录 probe errorlevel 并继续原删除
  操作。
- 诊断文件写入失败只输出警告，不改变原 tuple 断言。
- 权限拒绝是有效 probe 结果，不作为诊断错误。
- 诊断失败不能掩盖原测试的权限过宽或权限过窄结果。

## 行为约束

- 新诊断仍只在 `#[cfg(all(windows, test))]` 可达的目标测试路径中存在。
- 正常产品构建不包含 probe 调用，也不读取 CI 诊断开关。
- 不向 `process.rs` 增加诊断回调、布尔参数或 post-spawn hook。
- 不改变 `spawn_windows_sandbox_session_legacy` 公开签名。
- 不改变 token、ACL、五个被观察 fixture 的文件内容、五个删除命令的相对顺序或最终断言。
- probe 打开的每个 handle 必须及时关闭，不能保持到真实删除阶段。

## 验证设计

本机无法运行 Windows 访问检查。后续实施计划应分为两类验证。

### 本地静态与窄验证

- 检查 probe 只由目标测试生成和调用。
- 检查所有 access probe 均禁止 delete-on-close 和任何 disposition mutation。
- 检查诊断文件名包含 target、shard 和 PID。
- 检查诊断文件在 tuple assertion 前写入，artifact upload 使用 `continue-on-error: true`。
- 检查 PowerShell/PInvoke 的 x64 / ARM64 结构布局使用 `IntPtr` 和架构正确的偏移计算，不假设固定 pointer 宽度。
- 按项目要求运行 `just fmt`。
- 若非 Windows 窄测试或编译无法覆盖 P/Invoke 运行时，不把本地通过解释为诊断已有效。

### Windows CI 现场

- fork Windows x64 `D:\a` 和 Windows arm64 `C:\a` 均产生同 schema artifact。
- x64 原失败 tuple 不得因 probe 变化。
- arm64 原通过结果不得因 probe 变化。
- 每份 artifact 至少包含 child token 限制状态、五组对象 `DELETE`、五组父目录
  `FILE_DELETE_CHILD` 和去重 volume 信息。
- 若 probe 失败，artifact 必须显示具体失败 API 与 error code，不得只缺少整段输出。

## 预期修改范围

后续实施预计涉及：

- `codex-rs/windows-sandbox-rs/src/unified_exec/tests.rs`
  - 写入临时 PowerShell/PInvoke probe。
  - 在原删除脚本前调用 probe。
  - 在显式 CI 开关存在时持久化捕获 stdout。
- `.github/workflows/rust-ci-full.yml`
  - 仅对 fork Windows x64 / arm64 调用开启诊断 input。
- `.github/workflows/rust-ci-full-nextest-platform.yml`
  - 增加默认关闭的 input、test step 诊断目录环境变量和 `always()` artifact upload。

不预期修改：

- `codex-rs/windows-sandbox-rs/src/process.rs`
- `codex-rs/windows-sandbox-rs/src/token.rs`
- `codex-rs/windows-sandbox-rs/src/acl.rs`
- `codex-rs/windows-sandbox-rs/src/unified_exec/legacy_temporary_diagnostics.rs`
- `PermissionProfile`、writable-root 解析、elevated backend、公开协议或依赖锁文件

## 风险

- PowerShell 子进程必须确认继承 restricted token；child token 输出本身就是该确认。
- `CreateFileW` 失败可能来自 sharing、路径类型或对象状态，因此必须保留原始 error code，不做自动归因。
- `.git` 是目录，若遗漏 `FILE_FLAG_BACKUP_SEMANTICS` 会制造假阴性。
- probe handle 若未在真实删除前关闭，可能改变删除结果。
- `Add-Type` 可能使 probe 受 PowerShell/编译环境影响，所有失败必须可观察，不能被误当为 ACL 结果。
- P/Invoke 对 `TOKEN_GROUPS` / `SID_AND_ATTRIBUTES` 的解析必须按当前架构计算 pointer 宽度与对齐，且
  `ConvertSidToStringSidW` 返回的内存必须用 `LocalFree` 释放。
- CI artifact 修改是为获取通过的 arm64 现场，不能扩展为通用测试日志归档系统。

## 回退条件

当 x64 与 arm64 artifact 已能回答以下问题时，本设计对应的一次性诊断应与上一轮临时诊断一起
整体回退：

- probe child 是否仍是 restricted token。
- 哪些对象可直接获得 `DELETE`。
- 哪些父目录可获得 `FILE_DELETE_CHILD`。
- x64 `D:\a` 与 arm64 `C:\a` 的 volume 类型与 flags 有何不同。
- probe 结果与原 `del` / `rmdir` 结果如何做人工证据对应；不声称已证明 Windows 最终选择了哪条
  删除授权路径。

回退前先把新稳定证据写入 research 记录。后续安全修复必须根据实际 probe 结果另行设计，不得在本诊断
阶段预选 token 收窄、ACL 规范化或显式 deny 方案。

## 完成标准

- 新输出只补齐 child token、两类删除访问和 volume 差异，不重复已有全量诊断。
- probe 不修改五个被观察 fixture、其 ACL、token 或删除状态。
- fork Windows x64 与 arm64 都产生可下载、可直接对比的诊断 artifact。
- 五个原删除命令的相对顺序、删除对象、各自 errorlevel 记录和最终 tuple 断言保持不变；
  诊断门禁开启时明确允许扩大该目标测试的 timeout 预算。
- 无诊断开关时不生成诊断文件，不上传新 artifact，不影响正常产品路径。
- 取得证据后能整体回退，不留下长期 probe 框架。
