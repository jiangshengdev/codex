# Windows legacy sandbox 权限诊断设计

日期: 2026-07-12
状态: 设计已确认，计划已落盘
范围: `codex-rs/windows-sandbox-rs`

## 背景

Windows-only 测试
`legacy_workspace_write_delete_is_limited_to_writable_roots` 在不同 runner 上表现出两种相反的失败:

- GitHub-hosted Windows x64 runner 稳定得到
  `(0, false, false, false, None, false)`。workspace、`TEMP`、`TMP` 内文件成功删除，但 writable
  roots 外文件和受保护的 `.git` 目录也被删除，属于权限过宽。
- 部分 upstream Windows ARM64 runner 得到
  `(1, true, true, true, Some("outside"), true)`。安全边界仍然生效，但 writable roots 内文件无法
  删除，属于权限过窄。

最近三次 fork 运行中，GitHub-hosted Windows x64 均在 `D:\a\codex\codex` 下稳定复现权限过宽；
fork Windows ARM64 在 `C:\a\codex\codex` 下通过。upstream Windows x64 使用自建 runner 和
`C:\a\codex\codex`，对应测试通过。后两组 x64 对照使用相同 Windows Server 与 runner image，
但 runner pool、provisioner 和 checkout 根不同。

当前实现缺少闭环所需的运行时证据:

- legacy restricted token 把 capability SIDs、logon SID 和 Everyone SID 放入 restricting SID
  集合，但失败日志没有输出实际 token 内容。
- writable-root allow、protected-path deny 等 ACL 操作的结果在 `spawn_prep.rs` 中被丢弃。
- `add_deny_ace` 还会把部分 Win32 ACL 写入失败折叠为 `Ok(false)`。
- 测试只输出最终文件状态，没有记录 ACL 修改前后各路径的原始 ACE。
- Windows 删除既可能依赖目标对象的 `DELETE`，也可能依赖父目录的 `FILE_DELETE_CHILD`；只查看
  目标对象不足以判断 `.git` 为什么能被删除。

因此现有日志不能区分以下候选:

- ACL API 写入失败或被预检错误跳过。
- 宿主继承 DACL 中的 logon/Everyone grant 同时满足普通 token 与 restricting SID 检查。
- 父目录的 `FILE_DELETE_CHILD` 绕过 protected child 上的 capability deny。
- 实际 restricted SID 集合与构造阶段预期不一致。

## 目标

在不改变 sandbox 权限行为的前提下，让现有失败测试一次 CI 运行即可回答:

- 实际 restricted token 包含哪些 user、group 和 restricting SIDs。
- writable-root allow 与 protected-path deny 操作是否成功，失败时的 Win32 错误是什么。
- 关键路径在 ACL 应用前后的 DACL、ACE mask 和继承状态是什么。
- 哪个 SID/ACE 组合允许 outside 删除或 `.git` 删除。
- 权限过宽与权限过窄是否来自同一个 ACL 阶段。

## 非目标

- 不修复 token restricting SID 模型。
- 不规范化、替换或关闭宿主目录的 DACL 继承。
- 不增加 spawn 前 fail-closed 安全门禁。
- 不把当前测试改成确定性 ACL fixture。
- 不修改 elevated Windows sandbox backend。
- 不修改 CI workflow，也不依赖 `whoami`、`icacls` 或本地化命令输出。
- 不改变现有测试断言、命令、环境变量或 writable-root 计算。
- 不把诊断信息写入正常产品日志。

## 总体决策

新增一个私有、Windows-only 的 legacy 诊断模块，使用 Win32 API 结构化读取 token 与 DACL。

现有生产入口 `spawn_windows_sandbox_session_legacy` 的签名和行为保持不变。目标测试使用一个
命名明确的诊断入口；该入口与生产入口共享同一内部 spawn 实现，但附带测试创建的诊断收集器。
不向已有长参数列表追加 `bool` 或含义不明确的 `Option` 参数。

诊断收集器只观察状态。它不得修改 token、ACL、命令、环境变量、路径或断言。正常产品调用走
无诊断分支，不创建收集器，也不增加日志。

## 模块边界

### 新私有诊断模块

在 `windows-sandbox-rs/src/unified_exec/legacy_diagnostics.rs` 新增独立私有模块，承载:

- 诊断收集器与只读快照数据结构。
- token user、groups、restricted SIDs 的原生读取。
- 路径 owner/DACL 与 ACE 的原生读取。
- SID 转字符串、ACE 类型/mask/flags 的结构化转换。
- 有界、确定性文本报告渲染。
- 诊断查询错误的结构化记录。

`spawn_prep.rs`、`acl.rs` 和 `unified_exec/tests.rs` 均已接近大型模块边界；上述实现不得继续内联到
这些文件。新模块保持 crate-private，不从 `lib.rs` 导出新的公共 API。

### Spawn 入口

保留当前生产入口。另提供仅供 crate 内 Windows 测试使用的命名入口
`spawn_windows_sandbox_session_legacy_with_diagnostics`。该入口返回包含 `SpawnedProcess` 与冻结诊断
报告的命名结构，避免通过元组或 `Option` 表达结果。两个入口委托给同一个私有实现:

- 生产入口使用 no-op 观察器。
- 诊断入口接收具体收集器。
- 内部请求类型表达 `Disabled` 与 `Capture { observed_paths }` 语义，不使用位置含义不清晰的布尔
  参数。

诊断入口只供目标测试调用，不替换其他 legacy process tests。

### ACL 应用入口

`apply_legacy_session_acl_rules` 还有 preflight 和其他 legacy 调用方。保留其现有调用方式和行为，
由一个带诊断观察器的私有实现承载公共逻辑:

- 现有调用方使用 no-op 观察器。
- 目标诊断路径把每次 ACL 操作结果发送给收集器。
- 生产错误传播语义不在本次改变；当前被忽略的结果在记录后仍按原行为继续。

## 采集阶段

### 1. Token 创建完成后

在 `prepare_legacy_session_security` 返回、ACL 应用开始之前采集实际 token:

- TokenUser SID。
- TokenGroups 中每个 SID 及 attributes。
- TokenRestrictedSids 中每个 SID 及 attributes。
- logon SID、Everyone SID 的角色标记。
- 每个 writable root 到 capability SID 的映射。

报告必须同时保留 SID 字符串和角色。不能只输出账户名，因为 capability SID 通常没有稳定账户名，
账户名解析也可能受 runner 配置影响。

### 2. ACL 应用前快照

在 `apply_legacy_session_acl_rules` 修改 ACL 之前，对目标测试登记的关键路径拍摄基线快照。基线用于
确认 GitHub-hosted runner 从 `D:\a` 父链继承了哪些 grant，并与修改后的 DACL 对比。

### 3. ACL 操作结果

为以下操作逐条记录:

- writable root 的 `ensure_allow_write_aces`。
- deny path 的 `add_deny_write_ace`。
- workspace `.codex` / `.agents` 的保护操作；若路径不存在，记录为未执行，而不是错误。

每条记录包含:

- 操作类型。
- 路径。
- 目标 SID。
- 返回的 changed/unchanged 状态。
- 完整错误与 Win32 error code。

底层 `add_deny_ace` 当前无法区分“已有 ACE”和部分写入 API 失败。本诊断设计要求在不改变生产
控制流的前提下，把 `SetEntriesInAclW` 与 `SetNamedSecurityInfoW` 的失败转换为可观察的诊断结果。
若这需要补充内部返回信息，生产调用方仍保持原有继续执行语义。

### 4. ACL 应用后、进程启动前快照

在 `apply_legacy_session_acl_rules` 完成后、`spawn_legacy_process` 之前，对同一组路径再次拍摄快照。
该时点必须早于 child 启动，因为 child 会删除待观察的 outside 文件和 `.git` 目录。

## 观察路径

目标测试创建收集器时登记固定、有限的路径集合:

- checkout/sandbox cwd 到卷根的祖先链。
- `test_root`。
- `workspace` 与 `workspace_file`。
- `temp_root` 与 `temp_file`。
- `tmp_root` 与 `tmp_file`。
- `workspace/.git`。
- `outside_root` 与 `outside_file`。

祖先链用于定位继承 grant 的来源。`workspace` 与 `.git` 必须同时观察，因为删除 `.git` 可能由
workspace 父目录上的 `FILE_DELETE_CHILD` 允许。outside root 与 file 必须同时观察，因为文件删除
同样可能由父目录权限完成。

`TEMP` 和 `TMP` 也拍摄修改前后 ACL。upstream ARM64 的权限过窄同时影响 workspace、`TEMP` 与
`TMP`；仅记录 allow 操作结果不能证明 inheritable ACE 已传播到三个实际删除目标。

路径按规范化后的稳定顺序去重。不存在或已不可读取的路径记录查询错误，不中止测试。

## ACL 快照格式

每个路径快照包含:

- 阶段: `before_acl` 或 `after_acl`。
- 规范化绝对路径。
- owner SID，如果可读取。
- DACL present/null/protected 等控制信息。
- 每个 ACE 的原始顺序。
- ACE 类型: allow、deny 或 unknown。
- trustee SID。
- 原始 access mask，使用固定宽度十六进制。
- ACE flags，包含 inherit-only、inherited、container-inherit、object-inherit 标记。
- 无法解析的 ACE header/type 及查询错误。

不得只渲染 `FullControl`、`Modify` 等友好名称，因为根因判定需要区分 `DELETE` 与
`FILE_DELETE_CHILD`，并确认 ACE 是否仅用于继承。

## 有界输出

诊断报告只在原测试断言失败时附加到失败消息。测试通过时不打印报告。

报告必须使用以下硬上限:

- 最多记录 24 个路径。显式登记的 leaf paths 优先保留，其次保留卷根和离 leaf 最近的祖先；超出时
  记录原始路径总数与被截断的祖先数量，不中止原测试。
- 祖先链在卷根终止，不扫描兄弟目录或目录内容。
- 每个路径最多记录 64 个 ACE，按 DACL 原始顺序保留；超出时包含
  `truncated_after=64` 与原始 ACE 总数。
- TokenGroups 与 TokenRestrictedSids 各最多记录 128 项。logon、Everyone 和 capability 角色项优先
  保留，其余按 SID 字符串排序后截断。
- ACL 操作最多记录 128 项；按执行顺序保留，超出时记录总数与截断点。
- 查询错误最多记录 128 项；按阶段、路径和 API 名称排序。
- 最终渲染报告最多 128 KiB；达到上限时在完整结构边界停止，并追加明确的报告截断标记。
- 路径快照按阶段和规范化路径排序；每个路径内部的 ACE 保持原始顺序，保证 DACL 顺序仍可审查。

报告不输出完整环境变量、文件内容、命令 stdout 之外的新进程数据或账户凭据。测试路径和 SID 是
本次根因判断必需的信息。

## 错误处理

诊断是 best-effort，但不得静默丢失错误:

- token 或 DACL 查询失败时，记录阶段、对象、API 名称和错误码。
- 单个路径失败不阻止其他路径采集。
- 诊断采集失败不提前终止测试，不覆盖原始权限 tuple。
- child spawn、文件删除和最终断言仍按现有路径执行。
- 诊断内部 panic 必须避免；可恢复错误进入报告。

这能确保诊断缺陷不会把“权限过宽”伪装成另一种测试失败。

## 判别规则

一次失败报告应允许按以下顺序判定:

1. 若 allow/deny 操作记录明确返回 Win32 错误，根因进入 ACL 写入失败分支。
2. 若 ACL 操作成功，但 outside 的初始/最终 DACL 存在 logon 或 Everyone write/delete grant，且该
   SID 同时出现在普通 groups 与 restricted SIDs 中，则确认宿主 inherited grant 绕过。
3. 若 `.git` 上存在 capability deny，但 workspace 父目录存在匹配普通/restricted SID 的
   `FILE_DELETE_CHILD` allow，则确认父目录删除权限绕过 child deny。
4. 若 capability SID、logon SID 或 Everyone SID 未按构造预期出现在 restricted SIDs 中，则进入
   token 构造或传递异常分支。
5. 若 allow 操作成功且 token/capability 映射正确，但 writable roots 内仍无法删除，则比较修改后
   descendant ACE 的 `DELETE`、继承 flags 与目标对象实际 DACL，定位权限过窄阶段。

报告只提供事实，不在测试内自动给根因分类。最终判断保留给人工审查，避免诊断代码复制一套可能
不完整的 Windows access-check 实现。

## 测试与验证边界

后续实施计划应采用窄验证:

- 在 Windows 上运行报告渲染与截断逻辑测试:
  `just test -p codex-windows-sandbox legacy_diagnostics`。
- 在 Windows 上只运行目标测试:
  `just test -p codex-windows-sandbox legacy_workspace_write_delete_is_limited_to_writable_roots`。
- 不直接运行 `cargo test`。
- 不默认运行 crate-wide 或 workspace-wide 测试。
- 若 GitHub-hosted Windows x64 上的原问题仍复现，诊断改动不得改变其失败 tuple，失败输出应新增
  完整诊断报告；若 runner DACL 漂移后测试通过，不把通过本身视为诊断实现失败。
- fork Windows ARM64 或通过环境不应产生诊断输出，也不应改变测试结果。
- 非 Windows target 不应编译或导出诊断实现。
- 完成上述测试后运行 `just fmt`，格式化后不重复运行测试。

报告渲染与有界截断逻辑必须在
`windows-sandbox-rs/src/unified_exec/legacy_diagnostics_tests.rs` 中覆盖，优先比较完整结构或完整渲染
结果，不逐字段重复断言静态常量。原生 token/DACL 采集的最终有效性仍以 Windows 目标测试的 CI
输出为准。

## 预期修改范围

预计涉及:

- 新增私有 Windows legacy diagnostics 模块及其 sibling tests。
- `unified_exec` 模块注册与测试专用诊断入口。
- legacy backend 在 token 创建、ACL 应用前后调用观察器。
- `spawn_prep` 在当前被忽略的 ACL 操作处记录结果。
- 目标回归测试登记观察路径，并在原断言失败消息中追加报告。

不修改:

- `PermissionProfile`、writable-root 计算或 public protocol。
- elevated backend。
- CI workflow。
- `Cargo.toml` / `Cargo.lock`。
- `docs/superpowers/research/**` 的历史结论；应在得到新 CI 证据后另行更新。

## 风险

- Win32 token/DACL 读取代码包含 unsafe 边界。所有 buffer 长度、SID 生命周期和 `LocalFree` / handle
  释放必须封装在新模块内，不能把裸指针存入快照。
- ACL 报告可能较长，因此必须实施上述硬上限和确定性排序。
- 只在失败时渲染不等于只在失败后采集；ACL 与 token 必须在 child 启动前采集，报告则延迟到断言
  失败时生成。
- 若为了记录错误而改变 `add_deny_ace` 的内部返回类型，必须保证所有生产调用方的控制流与当前
  一致。本设计不允许借诊断改动顺手启用 fail-closed。
- 诊断输出中的 SID 和 runner 路径是必要证据，但不应扩展到环境变量或用户文件内容。

## 完成标准

设计实施并在失败 runner 上运行后，单次测试日志应同时包含:

- 原始权限 tuple。
- token user/groups/restricted SIDs。
- writable root 到 capability SID 的映射。
- 每个关键 ACL 操作的结果或 Win32 错误。
- 关键路径修改前后的原始 ACE。
- 父目录 `FILE_DELETE_CHILD` 与目标 `DELETE` 所需的全部判定材料。

满足这些条件后，本诊断阶段完成。后续根据实际证据另行设计安全修复；不得在本阶段预先选择
token 收窄、ACL 规范化或 spawn 前门禁。
