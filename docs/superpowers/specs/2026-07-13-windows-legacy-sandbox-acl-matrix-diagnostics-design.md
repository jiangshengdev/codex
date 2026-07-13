# Windows legacy sandbox ACL 矩阵诊断设计

## 背景

Windows legacy sandbox 的测试 `legacy_workspace_write_delete_is_limited_to_writable_roots` 在 GitHub-hosted Windows x64 runner 上稳定失败：restricted child 能删除 workspace 外部文件和受保护的 `.git` 目录。相同测试在其他 runner/代码组合中未表现出同样的过宽权限。

现有诊断已经确认：

- child token 为 restricted token，token access flags 中的 `WRITE_RESTRICTED` 状态符合预期，并包含预期的 restricting/capability SID；
- workspace、TEMP、TMP、outside 和 `.git` 的对象 `DELETE` 与父目录 `FILE_DELETE_CHILD` 探测在失败现场均被放行；
- outside 文件与 `.git` 目录最终确实被真实删除；
- 使用 `/inheritance:r` 构造的显式 runner user `Modify` control 和显式 `Authenticated Users` `Modify` control，其对象 `DELETE` 探测均返回拒绝；
- 因此，`WRITE_RESTRICTED` 并非整体失效，普通 user/group allow ACE 也不会必然绕过 restricting SID；异常更接近宿主继承安全描述符、owner 或删除授权路径的组合差异。

当前 control 只做了 access probe，没有执行真实删除。control 的最终存在状态只能说明测试没有删除它，不能代替真实 `del` 结果，也不能证明 Windows 最终删除走了哪条授权路径。

本设计用于一次性加入临时诊断代码，以同一 runner、同一代码、同一 restricted token、同一测试根目录中的单变量矩阵快速确定异常边界。取得证据后，新增诊断代码与 fixture 必须整体回退。

## 证据边界

现有证据足以排除：

- restricted token 未创建或在 spawn 前被替换；
- `WRITE_RESTRICTED` access flag 未生效，或预期 restricting/capability SID 未进入 child token；
- access probe 在所有 DACL 上无条件放行；
- 单纯存在 runner user 或 `Authenticated Users` allow ACE 就必然绕过 restricting SID。

现有证据仍无法区分：

- ACE 的继承来源或 `INHERITED_ACE` flag 是否触发异常；
- DACL protection/control flags 是否触发异常；
- 特定 trustee 是否影响 restricted access check；
- owner 是否改变访问判断；
- 真实删除最终依赖对象 `DELETE`、父目录 `FILE_DELETE_CHILD`，或两者中的任一路径；
- `D:\\a` 与 `C:\\a` 的差异究竟来自盘符、宿主 DACL、runner 策略还是其他安全描述符属性。

本矩阵只在单一失败现场内比较独立 fixture，不以跨 runner、跨镜像或跨代码版本对照作为唯一根因证据。

## 目标

- 在单次 Windows x64 CI 中完成继承、trustee、owner 和删除路径的完整判别矩阵。
- 对每个 disposable fixture 同时记录 Security Descriptor、access probe、真实删除命令结果和最终存在状态。
- 将 setup 是否符合预期与 access/delete 结果分开，避免使用构造失败的数据推断根因。
- 保持现有五个基线 fixture：workspace、TEMP、TMP、outside 和 `.git`，用它们确认本次运行仍复现原失败模式。
- 只增加显式诊断门禁下运行的临时代码，不改变生产安全行为。

## 非目标

- 不设计或实现永久修复。
- 不修改生产 token 构造、restricted SID、ACL mutation、spawn 或命令执行逻辑。
- 不将 `C:`/`D:` 盘符直接认定为根因。
- 不扩大到所有 Windows ACL 组合或建立通用 ACL 测试框架。
- 不把新增诊断长期保留为产品测试。
- 不以 probe 结果代替真实删除，也不以 control 文件仍存在代替真实 delete 证据。

## 方案选择

### 采用：独立 fixture 家族

每个 case 使用独立父目录和独立文件。inheritance、trustee、owner 和 delete-path 家族互不复用可变状态；单个 case 设置失败或真实删除成功不会污染后续 case。

该方案优点是构造直接、日志容易对应、失败隔离清楚，最符合本次临时代码“快、准、狠”的目标。

### 不采用：原始 Security Descriptor 克隆

该方案可以复制同一 Security Descriptor，再只翻转 `INHERITED_ACE`、DACL protection 或 owner，理论上最接近严格单变量实验。但它需要更重的 Windows Security Descriptor/PInvoke 构造与生命周期管理，容易把诊断时间消耗在 descriptor 构造错误上，也会扩大临时代码范围。

### 不采用：单个 fixture 顺序复用

该方案依次修改一个 fixture，代码量可能较少，但前一步的继承、owner、ACE 顺序或删除状态可能污染下一步；真实删除后还需要重建对象，日志也更难证明各 case 相互独立。

## 总体结构

保留现有五个基线 fixture 及其原测试断言。在同一测试根目录下新增唯一的 `acl-matrix` 根目录，矩阵中的所有对象均为 disposable，仅用于本次诊断。

`acl-matrix` 根目录必须先移除宿主继承并规范化为受控的 protected DACL。每个 case 必须完整定义 parent 与 object 两侧的 owner、DACL control flags、有序 ACE、基础访问权限和仅由该 case 翻转的权限位，不能继续依赖 `D:\\a` 宿主目录未记录的继承状态。矩阵测试的是在受控描述符中复现或排除具体因素，不直接复制宿主 raw Security Descriptor。

矩阵必须满足：

1. 所有 case 在 parent 侧独立创建与配置。
2. 所有 case 由同一次 sandbox spawn 的同一个 restricted child 检查。
3. child 先读取并输出 parent/object 两侧的实际 owner、DACL control flags 和有序 ACE，再执行 probe 与真实删除。
4. 每个 case 使用独立 try/catch 或等价的 case-local error boundary；setup、probe 或 delete 出错只记录该 case，不得中断其余矩阵。
5. child 必须完成全部矩阵 case 与全部 baseline 操作后才退出；禁止在中间断言、异常或单 case 失败时 fail-fast。
6. parent 等待 child 完整退出并收集所有结果后，最后执行现有原测试断言；矩阵结果只作为附加诊断，不把未知结果改写成通过。
7. 矩阵只在显式诊断门禁开启时创建和运行，普通测试执行不产生新增 fixture、日志或行为变化。

建议目录结构：

```text
acl-matrix/
  inheritance/
    inherited_user/
    explicit_user_unprotected/
    explicit_user_protected/
  trustee/
    inherited_runner_user/
    inherited_authenticated_users/
    inherited_everyone/
  owner/
    owner_runner_user/
    owner_system/
  delete-path/
    object_only/
    parent_only/
    neither/
    both/
```

每个叶目录包含独立的 disposable 文件；需要测试父目录删除语义时，也只操作该 case 自己的叶目录。

### 描述符契约

每个 case 的 expected descriptor 由完整模板生成，而不是只描述“变化项”：

- 矩阵根：owner 固定为测试设置方，DACL protected，禁止宿主 ACE 继续向下继承，只包含创建/遍历矩阵所需的显式受控 ACE。
- case parent：owner、control flags、对象属性和有序 ACE 全部显式定义；固定包含 traversal、list、read attributes、`READ_CONTROL`、`SYNCHRONIZE` 等基础权限，是否包含可继承 ACE 与 `FILE_DELETE_CHILD` 由 case 定义。
- case object：owner、control flags、普通文件属性和有序 ACE 全部显式定义；固定包含 read attributes、`READ_CONTROL`、`SYNCHRONIZE` 等基础权限，是否包含 inherited/explicit `Modify` 或 object `DELETE` 由 case 定义。
- 所有 expected ACE 同时记录 type、数值 mask、inheritance flags 和 trustee SID，禁止仅以 `Modify` 等聚合名称作为最终比较依据。
- 同一家族除表格声明的变量外，parent/object descriptor 的其余字段必须逐项相同。实现若无法满足这一点，该 case 必须标记 invalid。

## 精确矩阵

### inheritance 家族

三个 case 的 trustee、owner、基础权限、属性和 ACE 顺序保持一致，只改变 ACE 继承状态与 DACL protection 状态。每个 case 同时定义完整的 parent/object descriptor，parent 不得意外提供未声明的 `FILE_DELETE_CHILD`。

严格区分 `INHERITED_ACE` 与 DACL protection 需要测试专用 Win32 ACL API 精确构造并读取 descriptor；允许为此增加窄范围测试辅助代码，但仍不克隆宿主 raw Security Descriptor。如果实现阶段只使用 `icacls` 等命令而无法证明实际 flags 严格符合定义，这三个 case 只能标记为“受控近似对照”，结论必须降级为相关性，不能声称已单独隔离 `INHERITED_ACE` 或 protection bit。

| Case | 文件 ACE | DACL 状态 | 用途 |
| --- | --- | --- | --- |
| `inherited_user` | 从父目录继承 runner user `Modify` | unprotected，ACE 带 inherited flag | 复现可疑的宿主继承模式 |
| `explicit_user_unprotected` | 显式 runner user `Modify` | unprotected | 隔离 ACE inherited flag |
| `explicit_user_protected` | 与上一项等价的显式 runner user `Modify` | protected | 隔离 DACL protection/control flags |

判读规则：

- 只有 `inherited_user` 被删除：继承状态成为强候选因素，但仍不能脱离 descriptor 校验和 delete-path 校准直接认定为底层根因。
- `inherited_user` 与 `explicit_user_unprotected` 一致，而 `explicit_user_protected` 不同：DACL protection/control 状态成为强候选因素。
- 三者均被删除：继承不是独立充分因素，继续根据 owner 与 delete-path 家族判断。
- 三者均拒绝：受控矩阵未复制原 outside/`.git` 的放行条件；只能说明还存在宿主 ACE 组合或其他 Security Descriptor 属性差异，不能断言具体是哪一项。

任何 case 的实际 ACE、flags 或 control bits 不符合定义时，必须标记 `setup_mismatch`，不得纳入上述判读。

### trustee 家族

三个 case 均使用相同的完整 parent/object descriptor 模板和 inherited `Modify`，只改变 trustee：

- `inherited_runner_user`
- `inherited_authenticated_users`
- `inherited_everyone`

`Everyone` 同时存在于普通 SID 与 restricted SID 集合，应作为允许访问/删除的正控制。runner user 和 `Authenticated Users` 不在 restricting SID 集合，按预期应被拒绝。若实际 token SID 集合与该前提不符，日志必须显式记录，相关 case 不得按此预期判读。

### owner 家族

两个 case 使用完全相同的 parent/object DACL、属性和 ACE 顺序，只改变 object owner：

- `owner_runner_user`
- `owner_system`

只有 runner-owned 对象放行时，owner 才可作为独立候选因素纳入根因模型。两者结果一致时，只能排除 owner 在该受控 DACL 下是独立充分因素，不能排除 owner 与宿主继承 ACE、protection 或其他属性交互。

owner 设置失败只影响该 case：记录 `setup_error` 或 `setup_mismatch`，继续执行矩阵其他 case，不中止整个测试，也不使用失败 case 推断 owner 影响。

### delete-path 家族

该家族用于校准对象 `DELETE`、父目录 `FILE_DELETE_CHILD` probe 与真实 `del` 的对应关系。四个 case 必须使用完全相同的 owner、对象属性、parent/object DACL control flags、ACE 顺序，以及 traversal、list、read attributes、`READ_CONTROL`、`SYNCHRONIZE` 等执行 probe 和删除所必需的固定基线权限。唯一允许翻转的权限是 object `DELETE` 与 parent `FILE_DELETE_CHILD`。

表中的 allow 必须同时满足普通 SID 和 restricting SID 两侧。deny 表示对应 descriptor 中缺少该 allow，而不是新增 deny ACE；这样避免 deny ACE 优先级或 ACE 排序成为额外变量。

| Case | 对象 `DELETE` | 父目录 `FILE_DELETE_CHILD` | 真实删除预期 |
| --- | --- | --- | --- |
| `object_only` | allow | deny | 成功 |
| `parent_only` | deny | allow | 成功 |
| `neither` | deny | deny | 失败 |
| `both` | allow | allow | 成功 |

真实删除必须实际执行并记录 command errorlevel 与 post-state。不能仅根据 probe 推断 `del` 行为，也不能因为文件最终存在就推断真实删除被拒绝；只有明确执行过 delete 且记录了返回结果，post-state 才具有判读意义。

## 结构化输出 schema

每个 case 必须输出一条独立、单行、合法 JSON 的 JSONL 记录。下列展示为便于阅读的 schema，实际 artifact 中不得换行：

```json
{
  "record_type": "acl_matrix_case",
  "family": "inheritance",
  "case": "inherited_user",
  "setup_status": "ok",
  "setup_error": null,
  "expected_parent_descriptor": {
    "owner_sid": "...",
    "control": { "dacl_protected": true, "dacl_auto_inherited": false },
    "aces": []
  },
  "actual_parent_descriptor": {
    "owner_sid": "...",
    "control": { "dacl_protected": true, "dacl_auto_inherited": false },
    "aces": []
  },
  "expected_object_descriptor": {
    "owner_sid": "...",
    "control": { "dacl_protected": false, "dacl_auto_inherited": true },
    "aces": []
  },
  "actual_object_descriptor": {
    "owner_sid": "...",
    "control": { "dacl_protected": false, "dacl_auto_inherited": true },
    "aces": []
  },
  "object_delete_probe_allowed": false,
  "object_delete_probe_error": 5,
  "parent_delete_child_probe_allowed": false,
  "parent_delete_child_probe_error": 5,
  "exists_before_delete": true,
  "delete_attempted": true,
  "delete_command": "...",
  "delete_errorlevel": 5,
  "delete_succeeded": false,
  "exists_after_delete": true,
  "result_valid": true
}
```

要求：

- `family` 与 `case` 使用上述固定名称。
- `setup_status` 取 `ok`、`setup_error` 或 `setup_mismatch`。
- expected/actual 的 parent/object descriptor 分开输出；每侧都必须包含 owner、完整 control flags 和有序 ACE。
- `aces` 按实际顺序输出每条 ACE 的 type、mask、flags 和 trustee SID，不只输出格式化权限名称。
- probe 同时记录 bool 与 Win32 error code。
- `delete_attempted` 必须区分“未执行”与“执行后失败”。
- `exists_before_delete` 必须为 true，才能解释真实删除结果；`delete_succeeded` 根据命令/API 返回值明确记录，不从 post-state 反推。
- `result_valid` 由 child 在执行真实删除之前读取的 actual parent/object descriptor 与 expected descriptor 共同决定。parent-side descriptor 读取只用于 spawn 前构造核对，不能替代 child-side 删除前快照。
- 日志中不得包含依赖人眼拼接的多段 case 结果；artifact 可以同时保留原始文本，但每个 case 必须有一行完整 JSON。

同时输出一次矩阵级元数据：runner OS/image、架构、测试根路径、volume、runner user SID、restricted SID 集合、diagnostic gate 状态和矩阵版本。元数据用于确认所有 case 确实运行在同一现场，不用于跨环境直接归因。

## 数据流

1. 测试确认显式诊断门禁开启。
2. parent 创建原五个基线 fixture，保持现有逻辑不变。
3. parent 先将 `acl-matrix` 根规范化为受控 protected DACL，再创建各独立 case，并完整设置 parent/object 的预期 owner、DACL、ACE 与继承关系。
4. parent 在 spawn 前读取并保存每个 case 两侧的实际 Security Descriptor，作为构造核对；不符合预期者预先标记 setup 异常，但不提前终止。
5. 现有生产路径创建 restricted token 并 spawn child；诊断不得替换或修改这条路径。
6. child 对每个 case 建立独立 try/catch 或等价错误边界，在删除前读取两侧实际 descriptor，并据此计算 `result_valid`。
7. child 分别 probe 文件对象 `DELETE` 与父目录 `FILE_DELETE_CHILD`。
8. child 对 disposable 对象执行真实删除，记录命令、errorlevel 和 post-state。
9. child 在单 case 失败后继续下一个 case，完成全部矩阵和全部 baseline 操作后才退出，过程中禁止 fail-fast。
10. parent 收集 child 的完整输出后，最后执行原测试断言。
11. CI 通过现有日志/artifact 链路保留完整 JSONL；只有现有链路无法完整保留时，才临时修改 workflow/artifact 配置。

## setup mismatch 与错误处理

- API/命令调用失败时记录 `setup_error`，包含阶段、Win32 error code 或命令 errorlevel。
- API/命令返回成功但实际 owner、DACL flags、ACE 顺序/mask/flags/trustee 与定义不符时记录 `setup_mismatch`。
- `setup_error` 和 `setup_mismatch` case 的 `result_valid=false`，其 probe/delete 结果可以继续采集以辅助排查，但不得用于最终矩阵判读。
- fixture setup 与 child 检查都必须按 case 放入独立 try/catch 或等价的 `Result` error boundary；单个 case 错误不得提前返回、panic 或跳过其他家族。
- owner 设置失败只作 case-local 处理。
- 若矩阵级前提失败，例如 restricted token 元数据缺失、child 未运行或显式诊断门禁未生效，则将整个矩阵标记 invalid，同时保留原测试结果。
- 清理失败不得覆盖原测试错误；清理结果作为独立诊断字段输出。

## CI 与 artifact

- 矩阵仅在显式诊断门禁下运行，门禁应由目标 Windows x64 CI job 明确设置；本地或普通 CI 默认关闭。
- 只运行能够复现目标测试的最小 Windows x64 job/shard，不扩大测试矩阵。
- 优先复用当前 CI 日志与 artifact 收集链路。仅当现有链路会截断、拆散或丢失完整 JSONL 时，才增加临时 workflow/artifact 修改。
- artifact 至少包含矩阵级元数据、每个 case 的结构化结果、原五个 fixture 的现有诊断和目标测试完整输出。
- job console 保留一行摘要，详细 ACE/descriptor 数据通过现有 artifact 保留，避免 console 截断。
- 若不得不新增临时 artifact，其名称包含 run attempt、架构和矩阵版本；若复用现有 artifact，则在矩阵元数据中记录这些字段，避免与旧诊断混淆。
- 不修改 runner 镜像、checkout drive 或生产环境变量来制造对照；本次设计依赖同一现场内的独立 fixture 对照。

## 验证

本次临时诊断的验证重点不是证明产品行为正确，而是证明实验本身可判读：

1. 诊断门禁关闭时，现有测试行为和输出不变，且不创建 `acl-matrix`。
2. 门禁开启时，原五个 fixture 仍按现有方式运行，目标 x64 失败可复现。
3. 所有新增对象均位于 disposable `acl-matrix` 下，不触碰真实 workspace 内容。
4. 每个 case 的 parent/child descriptor 输出与定义一致；不一致者正确标记 invalid。
5. delete-path 的 `object_only`、`parent_only`、`neither`、`both` 能校准 probe 与真实删除。
6. control 结果包含明确的 `delete_attempted=true`、errorlevel 和 post-state，不再用最终存在状态替代真实 delete。
7. 任一 case setup 失败后，其余 case 仍能产生完整记录。
8. artifact 下载后可仅依靠固定 JSONL 字段完成 inheritance、trustee、owner 和 delete-path 判读。
9. 单次 run 中所有用于判断的 case 都满足 child-side descriptor 有效，且 delete-path 正控制/负控制符合预期；本轮不要求跨 run 重复性。

## 预计修改范围

实现阶段应保持窄范围，优先复用当前一次性诊断所在的 Windows legacy sandbox 测试与 CI artifact 路径：

- `codex-rs/windows-sandbox-rs/src/unified_exec/tests.rs`：只保留最小接线与现有测试编排。该文件已超过 1200 行，不继续承载矩阵实现。
- 紧邻 `tests.rs` 的专用测试诊断模块：承载 fixture descriptor 定义/构造、child probe/真实删除、JSONL 输出与 case-local error handling；该模块只在测试和显式诊断门禁下使用。
- 目标 Windows x64 CI workflow/job：优先不改；只有现有链路无法设置门禁或完整保留 JSONL 时，才增加最小临时配置。
- 必要的测试辅助代码：只服务于读取实际 owner/DACL/ACE 和输出 schema，不进入生产 token/ACL/spawn 路径。

具体文件必须在计划阶段根据当前分支实际诊断实现与 workflow 定义确认。本设计不授权创建计划或修改代码。

## 风险与控制

- **fixture 构造不准确**：parent-side 只作构造核对，最终以 child 删除前读取的 parent/object 两侧实际 Security Descriptor、`setup_mismatch` 和 `result_valid` 控制。
- **真实删除污染后续 case**：每个 case 使用独立父目录和文件，所有对象均 disposable。
- **父目录权限意外提供备用删除路径**：每个 case 显式检查父目录 `FILE_DELETE_CHILD`，并输出完整父/子 descriptor。
- **日志过长或被截断**：console 只保留摘要，完整结构化输出上传 artifact。
- **诊断改变生产安全路径**：禁止修改生产 token、ACL mutation 或 spawn；诊断只包围测试 fixture 与观测。
- **矩阵默认长期运行**：使用显式门禁，普通执行默认关闭。
- **临时代码遗留**：取得足够证据后整体回退诊断代码、CI 门禁与 artifact 配置，不将矩阵演化为永久产品逻辑。
- **将相关性误写为根因**：只使用同一现场内 `result_valid=true` 且 delete-path 已校准的单变量 case 更新候选因素；单次矩阵只收窄边界，不宣称已经证明 Windows 底层根因。

## 回退条件

满足以下任一条件即可停止扩大诊断并准备整体回退：

- 单次 run 中 inheritance 三 case 的 child-side descriptor 全部有效，并出现可判读的单变量翻转，且 delete-path 正/负控制已确认真实删除对应的授权路径；
- inheritance 未充分解释，但 trustee 或 owner case 出现有效翻转，且 descriptor 校验完整；
- 所有有效矩阵 case 均未复现原 outside/`.git` 放行，说明受控矩阵没有包含触发条件；此时保留 artifact 作为下一轮设计输入，不在本轮继续堆叠更多组合，也不直接断言宿主具体哪项属性是原因；
- 矩阵级前提无法成立，继续增加 case 不会提高证据质量；
- 已取得足以设计永久修复或下一轮更窄诊断的证据。

回退必须移除所有新增 disposable fixture 构造、结构化输出、显式诊断门禁和临时 artifact 配置，恢复到加入本矩阵前的代码与 CI 状态。原有、独立有价值的测试不在本设计中决定是否保留。

## 完成标准

- 一次目标 Windows x64 CI run 产生原五个基线 fixture 与完整四家族矩阵结果。
- 每个有效 case 都以单行 JSON 记录 expected/actual parent/object descriptor、`exists_before_delete`、两个 probe、真实 delete errorlevel、`delete_succeeded` 和 post-state。
- inheritance 三 case 在使用测试专用 Win32 ACL API 且 descriptor 验证通过时可按既定规则严格判读；若只能构造受控近似对照，结论明确降级。owner 设置失败不会影响其他 case。
- delete-path 家族明确校准对象 `DELETE`、父目录 `FILE_DELETE_CHILD` 与真实删除的关系。
- 所有新增对象均 disposable，且矩阵只在显式诊断门禁下运行。
- 没有修改生产 token、ACL mutation、spawn 或 sandbox 行为。
- artifact 足以支持根因边界判断，不需要依赖 control 最终存在状态或缺失的真实删除步骤。
- 证据取得并形成稳定结论后，临时诊断整体回退。
