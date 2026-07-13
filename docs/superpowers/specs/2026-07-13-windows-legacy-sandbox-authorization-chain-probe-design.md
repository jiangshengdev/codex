# Windows legacy sandbox 授权链诊断设计

日期：2026-07-13
状态：设计已确认，计划已落盘

## 1. 背景

第一轮 Windows legacy sandbox 删除权限 probe 已确认，同一套 restricted-token
设计在 GitHub-hosted Windows runner 上出现架构相关差异：

- x64 runner 中，workspace、TEMP、TMP、outside 和受保护 `.git` 的对象
  `DELETE` 与父目录 `FILE_DELETE_CHILD` 检查全部成功，outside 与 `.git` 也被实际删除。
- arm64 runner 中，workspace、TEMP、TMP 的对象 `DELETE` 成功；outside、`.git`
  以及所有父目录的 `FILE_DELETE_CHILD` 返回 `ERROR_ACCESS_DENIED`，实际删除边界符合预期。
- 两侧 restricted child 均为 restricted token、五个 restricted SID、相同 schema，
  无 `probe_error`；volume 均为 NTFS、drive type 3，已观察 flags 相同。盘符虽不同，
  但不足以解释为原因。继承 ACL 也有 `runneradmin:(I)(F)` 与
  `Authenticated Users:(M)` 差异线索，现有输出仍不足以还原完整授权输入。

第一轮证据证明问题真实存在，却没有记录 Windows 授权决策所需的完整 token、
security descriptor、ACE 顺序及多种授权 API 的对照结果。因此需要第二轮一次性诊断，
从 parent token、legacy spawn、restricted child 到文件系统访问检查完整追踪授权链。

## 2. 设计原则

本轮代码明确是一次性诊断代码，目标是尽快获得能够区分根因的证据。

用户已明确允许诊断代码侵入以下位置：

- 创建 restricted token 的 parent 路径。
- Windows legacy sandbox backend。
- restricted child probe。
- 临时 CI workflow 与 artifact 通道。

因此，本设计不以“不得修改生产调用链”为约束。只要能提高证据完整性，可以临时扩展
内部诊断结构、在 token 创建与 spawn 周围加入日志、构造专用 ACL fixture，并增加默认
关闭的 workflow artifact 通道。

侵入范围仍应围绕授权链取证，不借机重构无关代码或改变正式 sandbox 策略。

## 3. 目标

本轮目标是回答以下问题：

1. x64 与 arm64 的 parent token，以及 `CreateRestrictedToken` 前后的 user、groups、
   restricting SIDs、privileges、elevation、integrity level 与 mandatory policy 是否不同。
2. legacy backend 传给 `CreateProcessAsUserW` 的 token、flags、environment、working
   directory 与 child PID 是否符合预期，child 实际 token 是否与 parent 记录一致。
3. 原有目标及父目录的 raw security descriptor、owner、group、DACL control、ACE
   顺序、mask、SID 与继承标记是否存在决定性差异。
4. `CreateFileW`、`AccessCheck` 与 `AuthzAccessCheck` 对同一 token、对象和权限是否一致。
5. 人为控制 ACL 的 sacrificial fixture 是否仍出现 runner 分歧；若授权 API 与实际 I/O
   不同，差异更接近 token/ACL、I/O manager、文件系统、reparse 还是 filter driver 层。

## 4. 非目标

本轮不修复 legacy Windows sandbox，不改变正式 writable-root 或 `.git` 保护语义，
不引入长期 telemetry、公共 API 或用户配置，也不在诊断中试验安全修复。结论不得把
x64/arm64、C:/D: 或 runner image 差异直接写成因果，不得泛化为所有 Windows、x64
或 `WRITE_RESTRICTED` token，也不得声称 `CreateFileW` 已证明真实 `del`、`rmdir`
或 NTFS 最终授权路径。

## 5. 假设树

### 5.1 Token 输入差异

- parent runner 身份、group membership 或 enabled/deny-only 属性不同。
- x64 parent token 含有 arm64 不具备的 privilege。
- `CreateRestrictedToken` 的输入或输出在两侧存在属性差异。
- child token 在 `CreateProcessAsUserW` 后发生了非预期变化。
### 5.2 Security descriptor 差异

- runner 工作目录、TEMP、TMP、outside 或 `.git` 继承了不同 ACL。
- owner、protected DACL、inheritance flags 或 canonical ACE order 不同。
- 普通 allow ACE 与 restricting SID ACE 的组合导致不同访问结果。
### 5.3 授权 API 语义差异

- `AccessCheck` 与 `AuthzAccessCheck` 对 restricted token 的处理不同。
- API 使用的 generic mapping、desired access 或 object type 信息不同。
- privilege set 或 mandatory integrity policy 改变检查结果。
### 5.4 实际文件 I/O 路径差异

- `CreateFileW` 的删除访问与纯授权模拟结果不一致。
- 文件或父目录是 reparse point，导致最终对象与表面路径不同。
- NTFS、I/O manager 或文件系统 filter driver 改变最终访问路径。
- runner image、OS build 或挂载方式引入尚未记录的差异。

## 6. 证据链设计

### 6.1 Parent token

在创建 restricted token 前记录 parent process token：

- `TokenUser`。
- 完整 `TokenGroups`，包括 SID、名称解析结果与 attributes。
- 完整 `TokenRestrictedSids`。
- 完整 `TokenPrivileges`，包括 LUID、名称与 attributes。
- `TokenElevation`、`TokenElevationType`。
- `TokenIntegrityLevel`。
- `TokenMandatoryPolicy`。
- `TokenSessionId`、`TokenType`、`TokenImpersonationLevel`。
- `TokenSource`、`TokenOrigin`、`TokenStatistics` 中稳定且有诊断价值的字段。

创建 restricted token 后，在 parent 中对输出 token 记录同一套字段，确保能够逐项比较。

### 6.2 Legacy spawn 边界

在 legacy backend 的实际 spawn 边界记录：

- 传给 `CreateProcessAsUserW` 的 token identity 与 token statistics。
- application name、command line 的安全摘要、working directory。
- creation flags、startup flags、desktop 与 handle inheritance 设置。
- environment block 中与 runner、TEMP、TMP、架构和诊断相关的白名单字段。
- `CreateProcessAsUserW` 返回值、Win32 error、process ID、thread ID。
- parent 侧打开 child process/token 的结果及错误码。

命令行与环境不得无界输出；仅输出必要字段，并对可能包含 secret 的值做省略或哈希。

### 6.3 Restricted child token

restricted child 启动后立即记录与 parent restricted token 相同的 token schema。

通过全链路唯一 `probe_id`、child PID、authentication ID、token type、session ID 等字段，
核对 parent 侧传入 token 与 child 实际 token 的对应关系。不能依赖单一 PID 或 handle 值
证明 token 完全相同；复制或创建 token 后 `TokenId`、`ModifiedId` 无需相等，结论只比较
user、groups、restricting SIDs、privileges、integrity 与 mandatory policy 等授权属性。

### 6.4 Raw security descriptor

对原有五类目标及其父目录输出：

- canonical path 与 final path。
- object type、file attributes、reparse tag。
- owner SID 与 group SID。
- raw self-relative security descriptor 的完整结构化编码。
- owner、group、DACL、SACL 的 SDDL；读取 SACL 失败应单独记录。
- security descriptor control flags。
- DACL present/null/protected/auto-inherited 状态。
- 每个 ACE 的 index、type、flags、mask、SID、继承状态与 object GUID 信息。

ACE 必须保持系统返回顺序，不能排序后输出，否则会丢失 canonical order 证据。

### 6.5 三路访问判断

对同一 token、同一对象和同一 requested access 并排执行：

- `CreateFileW`：记录 desired access、share mode、creation disposition、flags、
  成功状态与 Win32 error。
- `AccessCheck`：先以所需 token 权限调用 `DuplicateTokenEx`，生成
  `SecurityIdentification` 或更高 impersonation level 的 impersonation token；为对象类型
  明确定义 `GENERIC_MAPPING` 并先调用 `MapGenericMask`。`PrivilegeSet` 按首次调用取得长度、
  第二次调用填充 buffer 的契约执行，记录两次结果、granted access、access status 与错误。
- `AuthzAccessCheck`：独立创建 resource manager 和 child-token context，不复用
  `AccessCheck` impersonation token 的隐含状态；记录 context 构造每一步、失败点、
  granted access、error array、object type list 使用情况与 API error。

每个 case 分别使用对象 security descriptor 检查 `DELETE`、使用 parent security descriptor
检查 `FILE_DELETE_CHILD`，再单独执行真实 `CreateFileW`/`DeleteFileW` 组合并记录结果。
三者是互补证据，不能互相等同。每条记录必须带同一 stable key 与 `probe_id`，以便
x64/arm64 和各授权路径精确关联。

### 6.6 Sacrificial ACL fixtures

在专用临时目录创建四类可删除、可回收 fixture，不修改真实 workspace 或 `.git` ACL：

1. 对象拒绝 `DELETE`，父目录允许 `FILE_DELETE_CHILD`。
2. 对象允许 `DELETE`，父目录拒绝 `FILE_DELETE_CHILD`。
3. 普通 user/group 允许，但选定 writable-root capability SID 缺少对应 allow，或存在显式 deny。
4. 普通 user/group 与同一个选定 writable-root capability SID 均有对应 allow。

restricting SID fixture 必须从被测 child 实际 `TokenRestrictedSids` 中按稳定规则选择一个
已存在的 writable-root capability SID，并记录候选集合、选择规则与选择结果；不得为了
fixture 改变主 probe token 的 restricting SID 集合。若实验确需新增 SID，只能创建独立的
fixture-only token，且不得替换、复用或污染主对照 token。fixture 明确验证 restricted-token
授权是 normal pass 与 restricting pass 的交集；“缺少 allow”和“显式 deny”分别构造为
独立子 case，并在写入后回读 ACE，确认 SID、type、mask、flags 与顺序符合构造意图。
每类 fixture 都分别记录对象 SD 的 `DELETE`、parent SD 的 `FILE_DELETE_CHILD`、真实
`CreateFileW`/`DeleteFileW` 组合语义及实际删除结果。ACL 写入或回读失败只使该 fixture
记录失败，不中止其他 fixture 或原有证据采集。

### 6.7 环境与文件系统

记录以下环境证据：

- OS version、build、edition、architecture。
- runner image、image version、runner architecture 等已公开环境字段。
- volume GUID、filesystem、serial、flags、drive type、DOS device mapping。
- 每个目标的 volume identity 与 final path。
- reparse point 状态、tag 与最终解析结果。
- 可获得的 filesystem minifilter/filter driver 列表与版本摘要。

filter-driver 枚举命令失败不得使测试失败；记录命令不可用、权限不足或输出被截断即可。

## 7. 输出 schema 与错误隔离

probe 使用新的固定 schema version。建议所有记录采用单行、key-value 或 JSON Lines 形式，
避免依赖 PowerShell 表格格式和本地化文本。

每条记录至少包含：

- `schema`
- `probe_id`
- `run_arch`
- `phase`
- `source`
- `key`
- `operation`
- `success`
- `win32_error`
- `payload`

token、security descriptor 与 ACE 必须按结构完整输出，不设置会任意丢弃授权证据的条目
或字节上限。若序列化、写盘或上传导致任何结构不完整，manifest 必须标记
`complete=false`、缺失范围与错误；该 artifact 禁止用于授权结论。仅 filter-driver 等外部
命令输出使用明确、固定的字节上限，并标记 `truncated=true`。

其他错误隔离规则：

- SID/name 解析失败保留 SID 和 error，不丢弃整条记录。
- 单个 API、对象、fixture 或环境命令失败，不阻断其他证据链。
- 顶层 panic、PowerShell/PInvoke 编译失败和 child 启动失败单独输出 `probe_error`。

每次 probe 在 parent 创建不可复用的唯一 `probe_id`，并贯穿 parent、backend、child、
所有日志文件与 manifest。stdout 文件名还包含 target、shard、architecture、host PID、
child PID 和 schema version；无法取得某个 PID 时使用 `unknown`，不伪造来源。

## 8. CI 与 artifact

继续使用默认关闭的 reusable workflow 输入启用诊断，避免影响常规 CI。

显式诊断 run 同时启用：

- `x86_64-pc-windows-msvc` 对应 shard。
- `aarch64-pc-windows-msvc` 对应 shard。

每个 job 无论目标测试成功或失败，都上传同 schema artifact。artifact 名称包含 run target、
shard、attempt 与 schema version，并使用 `if: always()` 和文件不存在时的明确告警。

artifact 至少包含：

- restricted child stdout 日志。
- parent/backend 诊断日志。
- fixture 与环境诊断日志。
- 一个小型 manifest，列出 `probe_id`、文件、schema、target、shard、child PID、完整性与生成状态。

CI 不自动修改 research；artifact 下载后再由人工或后续明确任务对照并写回证据。

## 9. 判读矩阵

| 观察结果 | 优先解释方向 |
| --- | --- |
| parent token 已不同 | runner 身份、groups、privileges 或 elevation 差异 |
| parent restricted token 相同，child token 不同 | spawn 或 child token 转换路径 |
| child token 相同，raw SD/ACE 不同 | runner 初始 ACL、owner 或继承差异 |
| 受控 fixture 在两侧一致，真实路径不同 | 原始路径 ACL、reparse、volume 或 filter 差异 |
| 三种 API 在 x64 均允许、arm64 均拒绝 | token/SD 输入或 Windows 通用授权语义差异 |
| AccessCheck/Authz 拒绝，CreateFileW 允许 | 实际 I/O manager、filesystem 或 filter 路径 |
| AccessCheck 与 Authz 互相不同 | API context、generic mapping 或 Authz 初始化差异 |
| 对象 DELETE 拒绝但实际删除成功 | 父目录 FILE_DELETE_CHILD 或另一实际授权路径 |
| 两种删除权限都拒绝但实际删除成功 | probe 与最终 I/O 路径不等价，需更底层追踪 |
| 四类 fixture 也出现架构分歧 | OS build、token 实现或底层授权环境差异 |

矩阵只用于决定下一轮调查方向，不直接作为最终根因结论。

## 10. 安全与敏感信息

- 不输出 access token、Authorization、完整任意环境或 secret 值。
- command line 只保留 executable、参数类型和必要路径摘要。
- environment 使用字段白名单；未知字段不输出。
- SID、ACL、OS build、volume identity 与 PID 属于诊断证据，可以进入私有 CI artifact。
- 本地绝对路径可保留到 artifact，但写入公开 research 时应只保留必要片段。
- fixture 必须位于专用临时根目录，使用唯一名称，并在测试结束时 best-effort 清理。
- probe 不得修改真实 outside、workspace 根目录或 `.git` 的 ACL。

## 11. 验证要求

本地可完成：

- Rust 与 workflow 格式/静态检查。
- PInvoke 结构、常量、buffer sizing 与 error handling 的代码审查。
- schema 字段、上限、错误隔离和 artifact 路径的静态验证。
- Windows-only 测试的编译验证（环境允许时）。

Windows CI 必须验证：

- x64 与 arm64 均生成 parent、backend、child、fixture、environment 日志。
- manifest 中声明的文件均存在且 schema 一致。
- parent token、child PID 和 child token 能够关联。
- 原有目标与四类 fixture 均包含三路授权结果。
- 任一子 probe 失败时，其他证据仍然存在。
- 两侧 artifact 可按 stable key 机械对照。

任何诊断 test 的 pass/fail 都不能替代 artifact 完整性检查。

## 12. 实施与回退边界

后续实施计划应拆成可独立审查、单独提交的微阶段，依次覆盖 schema 与有界日志、
parent/restricted token、legacy spawn 与 child 关联、security descriptor 与三路授权、
sacrificial fixtures、环境与 filter、workflow artifact、CI 证据写回 research。

具体任务边界由设计确认后的实施计划决定。本设计不提前规定实现细节或 commit 数量。

诊断完成并确认 research 已保留必要证据后，按提交逆序逐个执行独立 `git revert`：

- 每个原提交对应一个 revert commit。
- 不使用 `git revert --no-commit`。
- 不把多个回退合并为一个 staged diff 或 squash commit。
- research 文档是否保留或提交由后续明确授权决定。

## 13. 完成标准

诊断完成时，x64 与 arm64 artifact 必须完整且 schema 一致；parent token、spawn、
child token、security descriptor、三路授权和 fixture 必须可关联；证据至少能排除一类
主要假设，或明确下一步所缺的唯一证据层。结论必须区分事实、推断与未知项，不把盘符
相关性写成因果，不泛化所有 `WRITE_RESTRICTED` token，不声称 probe 已证明 Windows
最终授权路径，也不混入安全修复。一次性代码最终按提交逆序独立回退。

设计确认后才能编写实施计划；实施计划确认后才能修改代码与 workflow。
