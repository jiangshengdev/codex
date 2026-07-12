# Windows legacy sandbox 一次性排查日志设计

日期：2026-07-12
状态：设计与实施计划已确认
范围：`codex-rs/windows-sandbox-rs` 的 Windows legacy sandbox 失败排查
生命周期：取得根因证据后全部回退，不保留为产品能力

## 错误反思

目标始终是排查
`legacy_workspace_write_delete_is_limited_to_writable_roots` 为什么在不同 Windows runner 上表现为权限
过宽或权限过窄。需要的是一次性取证代码，用户提交后从 Windows CI 日志查出 BUG，排查结束即全部放弃。

此前设计从“总体决策”开始，把一次性取证错误地设计成长期可复用的 Win32 诊断框架，继而建设通用数据
模型、collector、renderer、freeze、专用 spawn API、稳定输出协议和完整框架测试。

最近两个提交体现了这个错误：

- `6efa5a0c7b9fbdd0424351ea934f483dc3023a03` 增加临时诊断实现。
- `3f749f4e34b10960084384caa261bd0ccd8ba5c7` 独立回退该实现，当前代码净变化为零。

问题不在于实现有 2553 行，也不在于修改文件多。用户从未设置行数上限。一次性排查代码可以很多、很
丑、重复、侵入调用链，只要这些代码直接提高一次 CI 查出 BUG 的概率。如果大量代码都是取得根因证据
所必需的，行数本身没有问题。

真正错误的是把工作量花在长期维护和优雅抽象上，而不是逐项回答“下一次 CI 还缺什么证据”。

## 目标

下一次或少数几次 Windows CI 应尽可能直接查出 BUG，而不只是比现在多打印一些日志。失败输出需要覆盖：

- restricted token 的 user、groups、restricted SIDs 及关键 attributes。
- 每个 writable root 与 capability SID 的实际映射。
- ACL mutation 前后，workspace、`.git`、outside、`TEMP`、`TMP`、待删除对象及必要父目录的 DACL/ACE。
- writable-root allow、protected-path deny 等当前被忽略的 mutation 返回结果、失败 API 和 Win32 error
  code。
- restricted child 的实际身份。
- 每个 `del` / `rmdir` 的退出码和错误输出。
- 原测试最终文件状态 tuple。

这些证据应能区分：

- ACL 写入失败或被错误跳过。
- runner 继承 ACE 通过 logon SID、Everyone SID 或其他同时满足两次 access check 的 SID 放行。
- 父目录 `FILE_DELETE_CHILD` 允许删除受保护 child。
- 实际 `TokenRestrictedSids` 与构造预期不一致。
- allow ACE 写入成功，但 mask、inherit flags 或实际 descendant DACL 不足以允许 writable-root 删除。

日志只提供原始事实，根因由人工根据同一次 CI 输出判断，不在临时代码中实现自动分类器。

## 非目标

- 不在本次修复 sandbox 权限行为。
- 不把诊断能力产品化或长期保留。
- 不为复用而建设 collector 协议、稳定 renderer、freeze、排序、截断模型或公共 API。
- 不追求代码优雅、低侵入、少文件、少行数、稳定输出格式或长期兼容。
- 不修改 elevated backend、公开协议、依赖或 CI workflow，除非后续证据明确表明不修改就无法取得根因。
- 不要求用户提供 Windows 开发机；用户提交代码后由现有 Windows CI 提供现场。

## 方案决策

采用“围绕真实调用链直接插入完整临时取证”。

能用 Windows 自带命令取得的证据，直接在目标测试的 child 脚本中运行 `whoami /all` 和 `icacls`。命令
输出不完整的部分，例如 `TokenRestrictedSids`、原始 ACE mask/flags、ACL 修改前状态或具体 Win32 API
失败阶段，直接在现有 Rust/Win32 调用点读取并打印。

允许采用任何能最快取得完整证据的一次性手段：

- 测试专用环境变量。
- 临时参数或临时私有返回值。
- 直接 `println!` / `eprintln!`。
- 固定路径逐项打印。
- 重复 Win32 查询代码。
- 在 token、ACL 和 spawn 调用链中临时传递诊断数据。
- 为避免信息在现有 `Result<bool>` 中被折叠而临时暴露更详细结果。

不要求把这些手段统一成框架。判断标准只有两个：是否直接增加根因证据，以及是否保持被测 sandbox 行为
不变。

仅使用 `whoami` 和 `icacls` 不足以作为完整方案，因为它们可能看不到 restricted SIDs、ACL 修改前状态
和被折叠的 Win32 错误。原生 Win32 取证本身不是过度设计；把它包装成长期通用系统才是。

## 取证位置

### 1. Token 创建完成后

在 legacy restricted token 创建完成、ACL 应用开始之前，直接输出：

- `TokenUser`。
- `TokenGroups` 的 SID 和 attributes。
- `TokenRestrictedSids` 的 SID 和 attributes。
- logon SID、Everyone SID。
- writable roots 与 capability SIDs。

输出必须来自实际将用于 spawn 的 token，不能只打印构造参数。

### 2. ACL mutation 前

对固定关键路径打印原始 DACL：

- workspace 目录、workspace 文件和 `.git`。
- outside 目录和 outside 文件。
- `TEMP` / `TMP` 目录和各自文件。
- 上述对象的直接父目录。
- 如果 CI 证据需要定位继承来源，再打印到 checkout root 或卷根的父链；禁止无界目录扫描。

每个 ACE 至少打印原始顺序、type、trustee SID、access mask 和 inherit flags。目标对象和父目录必须同时
记录，以区分对象 `DELETE` 与父目录 `FILE_DELETE_CHILD`。

### 3. 每次 ACL mutation

在当前忽略或折叠结果的位置直接输出：

- operation。
- path。
- target SID。
- changed / unchanged / error。
- 失败发生在哪个 Win32 API。
- 原始 Win32 error code 和现有错误文本。

重点覆盖 `add_allow_ace`、`ensure_allow_write_aces`、`add_deny_write_ace`、workspace `.codex` / `.agents`
protection，以及 `SetEntriesInAclW`、`SetNamedSecurityInfoW` 等关键底层阶段。

为了保留这些信息，可以临时改变私有返回值或增加一次性 helper；不需要设计长期 outcome 类型。

### 4. ACL mutation 后、child 启动前

对与 mutation 前相同的路径再次打印原始 DACL。前后输出必须能人工一一对应，从而确认：

- 调用报告成功时 DACL 是否真的改变。
- allow / deny ACE 是否写到预期 SID。
- mask 和 inherit flags 是否正确。
- descendant 是否实际继承。
- runner 原有 inherited ACE 是否仍然提供删除权限。

### 5. Restricted child 内

在任何删除动作之前输出：

- `whoami /all`。
- 固定关键路径的 `icacls`。

随后逐个执行原有 `del` / `rmdir`，每条命令之后立即保存并打印自己的 `errorlevel`，避免被下一条命令
覆盖。单条诊断命令或删除命令失败不能让脚本提前退出。

### 6. 断言失败

继续使用现有 stdout 捕获和最终 tuple 断言。失败消息同时包含 child 输出、host 侧 token/ACL/mutation
日志和现有 sandbox log。测试期望值、删除目标和执行顺序不改变。

## 修改范围原则

预计会触及以下真实链路，但不设文件数或行数限制：

- `codex-rs/windows-sandbox-rs/src/unified_exec/tests.rs`
- `codex-rs/windows-sandbox-rs/src/unified_exec/backends/legacy.rs`
- `codex-rs/windows-sandbox-rs/src/spawn_prep.rs`
- `codex-rs/windows-sandbox-rs/src/acl.rs`
- token 创建或 Win32 security 查询所在的其他私有文件

如果必须增加新文件、临时类型、临时参数或更多直接日志，可以增加。每处改动只需回答：它是否能验证一条
当前根因假设。不得因为代码已经多了，就转而建设通用框架；也不得为了控制代码量，删掉可能决定根因的
证据。

## 行为约束

- 诊断只由目标测试开启，正常产品运行和其他测试不打印。
- 不改变 token、ACL、permission profile、writable roots、命令顺序或最终断言。
- 诊断失败不能覆盖原始测试结果或改变原有错误处理语义。
- 不输出文件内容、完整环境变量或凭据。
- 不做无界目录扫描；除此之外不设置人为日志规模或代码规模门槛。

## 验证

本机不需要 Windows，也不安装 Windows target。实施后：

- 检查每处 diff 是否直接贡献 token、ACL、mutation 或删除行为证据，不按行数验收。
- 按仓库规则运行 `just fmt`。
- 运行当前平台能够执行的窄编译或测试检查；Windows-only 现场以用户提交后的 CI 为准。
- Windows CI 失败时，检查一次输出是否已覆盖所有候选根因所需证据。

如果第一轮 CI 仍无法确定根因，下一轮只补缺失证据，不重构或美化已有临时代码。

## 放弃条件

一旦日志足以确定 BUG 根因，这批诊断代码全部删除或整体 revert。即使其中有可复用部分，也不在本次
整理、测试或产品化。后续若确实需要长期 Windows 诊断能力，作为新需求重新设计。

## 成功标准

- Windows CI 日志能够确定或显著收敛到唯一根因。
- 根因判断不依赖用户额外提供 Windows 环境。
- 诊断没有改变被测 sandbox 行为。
- 排查结束后可以明确地全部回退，不留下长期框架。
