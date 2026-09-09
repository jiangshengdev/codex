# QR-B04-001 历史详情连接恢复实施计划

日期：2026-09-09

状态：计划草案已按用户要求落盘，任务粒度、阻塞关系和执行授权待确认；未开始实现、测试、暂存、提交或外部发布。

设计依据：[历史详情连接恢复设计](../../../../specs/2026/09/09/2026-09-09-codex-gui-history-detail-connection-recovery-design.md)。用户已确认测试边界：现有历史详情页面集成测试为主，owner 单元测试补充竞态，不新增生产测试接口。

只读核查基线：`dev`，`0ad31f5b4f890cda61ee76ce7443675daa49b14a`。计划编写前只有本任务设计文档未跟踪，没有已有产品代码变更。

## 目标与约束

修复 QR-B04-001：连接替换后，历史详情通过当前连接读取和重试，保留已加载内容，并隔离旧请求。

- 已失败或被中断的读取，在重连后等待用户手动重试，不自动重读。
- ready 内容与标题在断线、重连期间保留，不自动刷新。
- 首次进入及切换到另一 thread，连接可用时执行该目标的首次加载；不继承上一 thread 的内容或失败重试状态。
- 请求仍为当前 `threadId` 和 `includeTurns: true`；保留响应身份检查、StrictMode、卸载与迟到结果隔离。
- 只读查看不触发 resume、attach 或发送；继续任务使用其现有独立能力门禁。
- 不修改后端协议、连接重启机制或共享生命周期 hook，不新增兼容路径、全局缓存、自动重试、翻译消息或无关重排。

## 纵向影响面证据

| 字段 | 当前证据与计划判断 |
| --- | --- |
| 权威入口 | `codex-gui/src/router.tsx` 的 historyDetailRoute 挂载 ThreadHistoryDetailPage；AppCapabilities 发布当前 commands；GuiHostCommands 的 readThread 直接派生 thread/read 请求响应类型 |
| 已追踪链路 | guiHostConnectionLifecycle 发布不可用与新能力，旧 gateway invalidate 后拒绝请求；Page 永久保留首次函数，Owner 固定构造注入；Owner 发布状态给 DetailContent，现有 hook 管理订阅、start 与 dispose；generated requestDescriptors 和既有 validator 继续拥有协议验证 |
| 修改范围 | Page 更新能力绑定，Owner 分离快照寿命与连接寿命，Content 在必要时承接相应状态和动作可用性；现有详情测试及其 harness 覆盖页面接线和请求隔离 |
| 验证映射 | Read.browser 覆盖页面、capabilities store 和调用结果；Owner 单元测试补充竞态；Continuation.browser 保留只读快照与继续能力隔离；独立 Browser Mode 入口命中前两类浏览器用例，普通 unit 入口明确排除 browser 文件 |
| 排除项 | Owner 无其他生产构造方，详情 state 无范围外生产消费者；共享 useStrictModeSafeOwner 同时服务历史列表和新建页，不需为本问题改动；gateway 已正确拒绝旧请求，连接生命周期已正确发布新能力；不更改协议、生成配置、路由或 ContinueTaskAction |
| 剩余未知 | 实现与验收结果尚未知，不影响上述范围；真实 runtime 的当前完整 GUI URL 和可复现的中断场景须在执行期取得。该环境缺口只阻塞 Level 2 及完整验收声明，不阻塞源码实现和 Level 1；若需新增故障注入或范围外动作，先单独核对授权 |

只读独立核对确认消费者范围，补充了同一详情路由 thread A→B、能力更新与 StrictMode start 顺序、旧请求在 dispose 前返回等验证要求。它不代表独立代码审查或测试已经通过。

## 待确认的纵向任务拆分

### 01：历史详情在连接替换后可手动恢复读取

**What to build：** 用户无需退出历史详情，就能在新连接可用后手动重试；已加载内容继续可读，旧连接或旧记录的响应不能污染当前页面。首次进入与切换记录仍正常加载。

**Blocked by：** 无其他票据。执行本任务前须完成计划确认和本任务工作文档的独立本地提交。

**Status：** draft，待用户确认粒度与依赖；未发布为 ready-for-agent。

- [ ] A 读取失败，A→null→B 后不自动请求；点击加载才以 B 读取当前 thread。
- [ ] 同一挂载中 A→B 也立即使 A 失效，不依赖可观察的 null 中间帧。
- [ ] 首次读取或重试在途时失去能力，结束进行中并显示失败；恢复后仍等待手动操作。
- [ ] A 的迟到成功、失败均不覆盖 B 的内容、错误或执行状态。
- [ ] ready 经断线、恢复持续保留内容与标题，不自动刷新。
- [ ] 首次无连接、新 thread 无连接时等待能力，能力可用后首次加载；旧 thread 的内容与重试状态不串入新 thread。
- [ ] 重试期间保留旧错误及诊断，防止重复执行，失败后更新错误，成功后展示详情。
- [ ] 响应身份不匹配、StrictMode 和卸载隔离检查仍有效；无新增 resume、attach 或发送调用。
- [ ] 完成范围内自动化回归、真实运行验收及独立审查，并形成行为修复的独立本地提交。

只保留一个纵向任务。能力绑定、内容保留和在途请求失效共享同一 owner 状态转换，拆成按层票据会使任一票据缺少用户可验证的完整行为。无需前置整理；不为中间提交添加旧新路径并存。测试、审查与验收是该票据的内部节点，不另造产品票据。

本轮只写计划草案。to-tickets 要求用户确认拆分后才发布票据；当前尚未提供 tracker 与标签配置。外部发布前需运行 `/setup-matt-pocock-skills`。不自行创建 `.scratch` 票据、不操作远程、不修改父 issue 或原始评审报告。

## 修改白名单与技术路径

以下精确路径属于实施计划的执行附件，不属于票据描述。路径以仓库根目录为基准。

必改：

- `codex-gui/src/features/threadHistory/ThreadHistoryDetailPage.tsx`：删除永久 retained readThread；owner 按 thread 保持稳定，当前能力变化传入同一 owner，保留首次无连接提示与正常首次读取的区别。
- `codex-gui/src/features/threadHistory/threadHistoryDetailOwner.ts`：接收当前可用能力，能力切换使在途请求过期，保留 ready；分别处理尚未开始首次读、失败等待重试和在途被中断；重试在执行时读取当前能力。
- `codex-gui/src/features/threadHistory/__tests__/ThreadHistoryDetailRead.browser.test.tsx`：主要用户流程回归。
- `codex-gui/src/features/threadHistory/__tests__/threadHistoryDetailOwner.test.ts`：适配 owner 接口并补足结果竞态。

按实际需要修改，仍在授权候选范围内：

- `codex-gui/src/features/threadHistory/ThreadHistoryDetailContent.tsx`：如 state 合同调整，完整呈现等待、失败、重试与 ready；当前能力不可用时不提供有效请求入口。复用现有失败和动作组件，不增加新布局或文案。
- `codex-gui/src/features/threadHistory/__tests__/threadHistoryDetailBrowserHarness.tsx`：仅扩展现有能力更新或 thread 导航的测试入口，不增加生产接口。
- `codex-gui/src/features/threadHistory/__tests__/ThreadHistoryDetailContinuation.browser.test.tsx`：仅在接口适配或现有快照/继续约束需要补断言时修改。

状态由 owner 定义，消费者直接引用，不镜像另一套状态合同。保留现有请求代次和销毁检查，补能力身份归属；不能仅在 React effect 完成后才假定旧请求安全，须覆盖能力切换与旧 Promise 结算的先后关系。断线中断可以表达为明确的本地失败，不能伪装成收到的服务端错误，也不能静默丢弃后永久停留 loading。

不新增翻译消息，不调整既有消息归属或主动重排源代码，因此不规划 catalogs、schema、validator、锁文件写入。若证据表明必须改变这些边界，先按范围变更规则处理；不得手改生成物或通过忽略检查完成任务。

## 验证入口与执行前预检

命令 cwd 均为 `/Users/jiangsheng/cnb/codex/codex-gui`，使用 codex-gui-toolchain。本次只读确认 Node `v24.17.0`、pnpm `10.34.5` 来自 fnm 管理的安装；Vitest、oxfmt、TypeScript 和 Chromium/Firefox/WebKit 二进制存在。执行时重新确认工具来源、基线、输入与测试收集，不安装任何组件。

`package.json` 是脚本入口，`.github/workflows/codex-gui.yml` 实际调用 `pnpm run ci`。CI 中的格式化检查为 oxfmt；全目录 fix 脚本会越过本任务修改范围，故格式化仅用同一 oxfmt 对实际改动白名单文件执行 `--write`，随后以 `--check` 验证。普通源码内容编辑使用 patch；不手工模拟格式化。

定向单元回归：

```sh
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit src/features/threadHistory/__tests__/threadHistoryDetailOwner.test.ts
```

定向 Browser Mode 回归：

```sh
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:parallel src/features/threadHistory/__tests__/ThreadHistoryDetailRead.browser.test.tsx src/features/threadHistory/__tests__/ThreadHistoryDetailContinuation.browser.test.tsx
```

现有 shared 配置强制 headless，parallel 配置包含目标文件并启用 Chromium、Firefox、WebKit；不得以普通 unit 命令或 smoke 测试替代这一验证。必须记录实际收集的文件、浏览器与结果。

最终自动化门禁：

```sh
/opt/homebrew/bin/fnm exec --using-file pnpm run ci
```

该脚本依次执行 validator 一致性、oxfmt、lint、类型检查、单元测试和 browser smoke。生成检查消费既有 app-server/gui-host schema 与生成产物，本任务只 check，不执行 write；协议 TypeScript、schema、现有 fixture 和 alias 依赖须在运行前重新验证完整。定向回归用于实现闭环，最终 CI 用于稳定合并状态；通过后不无依据重复全套测试。

Level 2：使用执行时取得的完整当前 GUI URL 与已运行的真实 Codex runtime，无头建立以下场景：ready 断线后保持内容；真实失败或在途读取中断后恢复连接，自动读取次数不增加，点击才加载成功；切换历史记录不串内容。复用现有授权的读取和连接恢复入口，禁止发送输入、停止外部服务或更改系统网络来制造失败。测试环境 mock、合成 pageshow 和请求路由注入只能作 Level 1 证据，不能宣称真实 BFCache 已验证。缺少真实失败场景时保留对应未执行项并请求所需条件，不编造验收结论。

Level 3：不适用，不打开可见窗口。Level 1、Level 2、本地静态审查分别记录；本轮均未执行。

## 描述式执行 DAG

本节字段按执行图契约定义。以下共享声明与节点表组合构成每个节点的完整记录，不使用节点编号制造依赖。

### 共享声明

- `executionContext`：当前 worktree `/Users/jiangsheng/cnb/codex`，branch `dev`，Git index `/Users/jiangsheng/cnb/codex/.git/index`；不创建 branch/worktree，不存在预配任务。
- `owner`：除 R 为独立只读审查代理外，均为主代理；主代理是唯一 Git index、格式化和提交 owner。独立审查者不得是本次代码修改者。
- `authorizationGate`：所有执行节点目前 pending。来源候选为用户后续对本计划的明确执行确认；用户当前“计划落盘”只授权本文。执行前逐节点按 action-authorization 建立最小能力信封，包含精确 read/write、动作和参数，未列能力不授予。
- `subdelegation`：false。R 只读，不获得编辑、测试、浏览器或 Git 写权限。
- `deferralEvidence`：无。实现集中在一个有界 owner 生命周期链，单一主代理编辑；审查与验证读取稳定结果后可并行，无需拆出多个相互等待的编辑者。
- `readSet`：节点消费的 D 文档、S 源码白名单，以及必要只读依赖 I；I 为 threadHistory、appShell、guiHost、路由、共享测试支持、package/Vitest/格式化配置、已生成协议、schema 和 fixture。R 可反向读取这些消费者。
- `writeSet` 与 `stateEffects`：以节点表为准；D 表示本任务设计和本计划，S 表示前述源码/测试白名单，其他源码禁止修改。验证工具正常运行的内部缓存、报告与进程状态按能力契约处理，不 stage 这些产物。
- `resourceLocks`：D/S 使用上述 canonical 根目录加精确相对路径计算 read/write；Git 写节点独占 `.git/index` 及 `.git` 提交状态；自动化节点独占该 worktree 的 Vitest/CI runner 与 `.eslintcache` 等共享检查状态；L 独占本次实际取得的浏览器 session，运行前补记其精确身份。独立审查只读稳定 S/D，不读易变 runner 产物。
- `failureDomain`：本节点产物及消费它的传递后继；R/V/L 互不消费彼此结果，一项失败不自动阻止其他项。需要源码修正时，等待并行只读者释放 S，再使被改动影响的验证证据失效。
- `replanTriggers`：实际基线发生相关变化；必须越过 S/D 写集合；产品行为、文案/生成链或授权边界改变；验证环境需未授权动作。计划内实现失败先诊断和修正，不直接作为终态。
- `verification`：按节点 completionEvidence 核实，所有运行结果必须对应相同的最终 S 内容；`estimatedCost` 仅用于安排执行，不构成停止阈值。

### 节点记录

| nodeId / taskBoundary / operationKind | outcome；consumes → produces | hardPredecessors 与原因 | writeSet / stateEffects / commandScope | completionEvidence / estimatedCost |
| --- | --- | --- | --- | --- |
| D0 / 文档准备提交 / stage | 审核后的 D → 仅 D 的暂存快照 | 无；需执行授权 active | `.git/index`；本地 status、diff、check-ignore、显式 `git add --` D | staged diff 仅含 D，ignore 与空白检查通过；短 |
| D1 / 文档准备提交 / commit | D0 暂存快照 → 独立文档 commit | D0，等待精确文档暂存快照 | `.git`；普通本地 `git commit`，不 amend | 新文档 commit id，产品代码未开始；短 |
| E / 01 / edit | 确认设计与基线 S → 贯通页面、owner、测试的实现 | D1，工作文档必须先独立提交 | S；普通 patch 与只读源码核查，无 Git 写 | 完整 diff 覆盖票据验收、删除旧能力保留路径；中 |
| F / 01 / format | E 完整 diff → 格式稳定的 S | E，必须使用实际修改文件集合 | 实际变更的 S；fnm 下 `pnpm exec oxfmt --write` 显式文件，再 `--check` | 格式 check 通过且 diff 未扩出白名单；短 |
| V / 01 / 验证 | F 稳定 S → Level 1 与 CI 证据 | F，检查输入必须稳定 | 无主动源码写；仅上节定向 unit、browser 与 ci 脚本及必要只读预检 | 所有目标被收集且通过，记录检查结果；中 |
| R / 01 / 审查 | F 稳定 S 与设计 → 独立行为/约束审查结论 | F，审查同一稳定 diff | 无；只读 rg、文件、local git diff，不运行命令修改状态 | 审查能力交接、迟到结果、thread、StrictMode、保留约束与覆盖，无未处理计划内缺陷；短 |
| L / 01 / 验证 | F 稳定 S 与当前真实 runtime → Level 2 场景证据 | F，真实页面须运行该实现；完整 URL/runtime 另作执行前环境门禁 | 已授权的无头浏览器 session 状态；现有启动与浏览器入口按 skill 预检后使用 | 明确覆盖的真实场景与证据；必需场景未执行则不宣称全验收通过；中 |
| J / 01 / fan-in | V/R/L 证据与最终 S → 可提交结论 | V、R、L，消费同一实现的独立证据 | 无；核对结果、完整 diff 与当前状态 | 全部验收满足、无范围内未修正项；短 |
| G / 01 / stage | J 可提交结论与 S → 仅本任务的 staged diff | J，必须先汇合最终证据 | `.git/index`；显式 `git add --` 实际改动 S，再核对 cached diff | 白名单、ignore、空白、行为与重排隔离检查通过；短 |
| C / 01 / commit | G staged diff → 行为修复独立 commit | G，消费经审核暂存快照 | `.git`；普通本地 `git commit` | 新 commit id、提交内容与验收 S 一致；短 |

初始 ready set：计划明确批准执行后为 D0；当前全部等待。fan-out 为 F 后的 V、R、L，三者不存在相互阻塞边；实际 L 若没有可用 runtime 只等待自身环境门禁。fan-in 为 J。关键路径为文档提交、完整实现、格式化、最慢的验收/审查分支、汇合与行为提交。

V 内部按定向回归后最终 CI 执行，因为定向失败需要修改 S，CI 应消费收敛后的最终状态；不为通过中间节点新增兼容层。自动化写共享 runner 缓存不与 R 的源码只读集合冲突；L 不复用自动化浏览器 session。若发现真实资源冲突，按 canonical 资源锁调度，不伪造永久阻塞边。

提交拓扑仅包含独立文档准备提交和一个行为修复提交。不包含纯重排任务、不操作远程、不强制暂存 ignore 文件。若后续验证修正已形成的提交，必须另建修正提交，禁止 amend。工作树若出现他人变更，保留原状并只处理精确白名单。

## 失败处理与完成边界

执行时由主代理在对话中维护节点状态、事件、产物、锁、失败域和插入修正节点，不回写已确认计划正文，不创建未授权执行记录文件。失败先形成证据并在计划范围内诊断、修正、重验；代码变更使相关 R/V/L 证据失效时只重跑实际受影响项。

缺少工具、真实 runtime 或必要授权时暂停对应节点及后继，继续其他独立工作；禁止安装、后端构建、破坏性故障注入、自动打开可见窗口、扩大忽略或删除覆盖。Level 2 缺口不能由 Level 1 冒充，也不能将票据标记完整完成。

全部任务、计划内修正、最终验证和本地提交完成后结束本轮执行；报告实际并行、关键路径、未启动 ready 节点，以及 Level 1/2 的真实结果。设计、计划落盘本身不表示执行已获批准。
