# QR-X03-002 投影暂停恢复实施计划

日期：2026-09-09

状态：设计已确认；用户授权计划落盘。本文件不构成执行授权，产品实现、验证与本地提交均等待用户确认执行。

设计依据：[投影暂停恢复设计](../../../../../specs/2026/09/09/2026-09-09-codex-gui-projection-recovery-design.md)。源码基线：`dev`，`5dc0905db`。

## 1. 目标、任务粒度与授权

交付一个完整纵向任务：[01：当前任务可手动恢复同步](./01-recover-current-task.md)。该任务贯通暂停原因、按钮、订阅、数据保护及验收。队列保护与恢复按钮不能作为独立可发布功能拆开，否则中间用户路径不能满足已确认的数据安全语义。任务内部按不相交职责并行，不为构造多个 ticket 引入临时兼容层。

本地计划沿用项目日期目录；不发布外部 tracker，不创建 `.scratch` 平行计划，不修改原始质量报告或历史设计。ticket 的 ready-for-agent 表示任务描述可供领取，不代表已获得产品执行权限。

当前仅允许创建本计划及独立 ticket 文件。未来用户确认执行后，先把设计、计划和 ticket 创建为独立本地文档提交，随后实现；全部功能变更及其测试、翻译组成一个独立功能提交，执行记录另作独立文档提交。不 amend、不远程、不强制暂存 ignore 文件、不安装、不构建后端。

执行上下文为当前工作树 `/Users/jiangsheng/cnb/codex` 的 `dev` 分支。没有 worktree/branch 创建节点；同一功能任务内的不相交编辑可在同一工作树并行，主代理是唯一 Git index、生成器及执行记录 owner。执行前核对基线与无关变更，保留无关工作。`dev` 的 Rust workspace version 保持 `0.0.0`，本计划不改 Rust。

## 2. 六字段证据闭包

| 字段 | 当前证据与计划结论 |
| --- | --- |
| 权威入口 | GUI Host 的合法 projection 通知经集合 controller 到 member，再由 ingress 进行 thread/subscription/commit 链检查；LiveActiveThreadSessionSnapshot 是页面暂停状态合同。后端 `thread_projection` 的 attach 按同一 connection/thread 替换 subscription，backpressure fanout 只使对应任务投影失效。 |
| 已追踪链路 | 生成的 app-server 类型与 validators → guiHostClient → activeThreadSession/member → live/projection → read-model transition → transcript/runtime reducer → CurrentTaskPage/Composer；集合重试 ready 分支只刷新 status。`baselineAttached` 会重建正文，因此候选成功前不得发布。 |
| 修改范围 | member 缓冲与恢复；live 原位切换；queue 事务快照核对及发送冻结；status/compaction 的恢复一致性；页面原因/动作及正文去重；editor 稳定身份；合同 fixture、回归和两个 catalog。精确范围见第 4 节。 |
| 验证映射 | 现有 AppProjectionAvailability 通过真实 App 渲染 harness 和 mock host 注入合法通知；owner 测试承接难构造竞态；多任务、pending 编辑与 E2E 验证不误发及不丢数据；CI 验证类型/生成合同。全部是未来验证，不以读过测试替代运行。 |
| 排除项 | 不改 backend schema/attach 语义、GUI Host allowlist、共享连接生命周期、路由、持久化格式或共享 RetryActionButton；fixed 历史正文继续保留既有错误展示。上述层只读复用。 |
| 剩余未知 | 当前真实 GUI URL、可用的合法暂停场景及授权测试对象未取得，故 Level 2 尚不可执行；这不改变实现范围，但阻止完整真实验收声明。代码机制及审计发现已收敛到第 3、7 节；压缩请求缺乏关联证据是必须保留的业务不确定状态，不得假装已解除。 |

主要代码证据：`activeThreadMemberLifecycle.retry/routeNotification/initializeMember`，`liveActiveThreadSession.applyProjectionPhase/buildSnapshot`，`composerInputQueueCoordinator.reconcileRestoredTurns/persistTransaction/receiveFact`，`composerInputQueue.reconcileSnapshot`，`ComposerTurnControl` 的 editor key，`ActiveThreadStatus` 的 generation，`ActiveThreadCompaction` 的 claim/reservation，以及 `transcriptProjection` 的 baseline 与 globalStatus。

既有统一规则以 2026-09-09 重试行为设计和已提交的 `RetryActionButton` 为准：loading 保留旧错误和诊断、进行中文案、同一动作防重复；失败后更新错误并恢复同一动作名称；业务成功才撤下对应面板。

## 3. 实施机制与失败边界

### 单一恢复 owner 与候选切换

1. 在集合 session 暴露针对 threadId 和期望 live identity 的 `recoverProjection`，通过 member 委托。返回区分 recovered、failed、unavailable/blocked；不复用普通 retry，不把 fulfilled 当成功。
2. 恢复状态由现有 owner 持有并通过权威 snapshot 发布，取代误导性的 `connectionRestartRequired`。保留暂停原因，表达 pending 及最近恢复错误；页面不重复保存请求状态。合同消费者直接引用或机械派生类型。
3. 先登记唯一 attempt，再发布 pending 并调用 attach，防止同步 listener 重入。member 保持 ready、live 保持 projectionUnavailable，因此旧正文和输入保留。
4. pending 期间按任务收集独立候选通知；取消旧批次 RAF，旧已接纳事实先完成既有有序处理。attach 返回后只接受新 subscriptionId，使用新的 ActiveThreadProjection 累积 baseline 和后续合法事件。状态核对期间仍缓冲；最终同步排空并复核候选连续性。
5. 每个 await 后及可重入发布后核对 disposed、member/live identity、attempt 和连接 owner。不能仅比较 revision，正常队列/技能/状态发布也会推进 revision。
6. 候选有效、队列核对已提交后，在同一 live 上切换 projection/subscription，更新 runtime 与 transcript 基线，发布恢复成功。保留 instanceId、composerRole、queue 和 read-model slot。直到新状态发布完成前都保持投影发送冻结。
7. 失败不发布候选 baseline，不销毁旧 live，不重新接纳旧订阅。解除 pending、更新诊断，下一次 attach 替换失败候选；不得在 finally 中无条件执行 threadId-only detach，以免清理晚到而删除新订阅。真实连接失效仍由现有 collection disposal 管理，旧恢复结果不得借新连接清理。

### 队列、编辑与发送

1. 一旦接受 projectionUnavailable，立即冻结该队列的自动发送；不是等用户点击才冻结。同批次包含暂停事实时，必须先识别并冻结，再处理该批其他可能派生 drain 的已接纳事件，不能等 applyQueueFacts 后才冻结。该条件与现有 restoredPaused、sendingBarrier、recovery 和 unknown 保护组合，覆盖 late start/steer response、编辑取消及 deferred drain。
2. 不调用现有 restored-only `reconcileRestoredTurns` 冒充 active 队列恢复：它会在普通活动队列上直接返回。新增明确返回 committed/blocked 的投影核对事务，复用 queue prepare/commit、interrupt fork 和持久化 owner。
3. 一个事务内按顺序处理已接纳的 pendingFacts、pendingDraft、新快照与候选有效事件；先更新真实 activeTurnId，再核对 start/steer 的正向交付证据及 interrupt 状态。全程冻结发送，保留未知且未匹配的记录。
4. 持久化失败回滚该批，保留原 pendingFacts/pendingDraft，返回可诊断失败；不将候选通过无返回值 receiveFact 延期后宣称恢复成功。队列事务不负责回滚外部 owner：提交前不得修改 live.activeTurnId、compaction claim/reservation 或 threadStatus。下一次手动恢复获取新候选，再次尝试完整有序事务。
5. 只有事务成功且 live 已接纳新投影，才解除投影冻结。不得调用 resumeRestored、清除独立保存错误或自动重发 unknown；正常队列后续消费仍服从原有门禁。
6. `ComposerEditor` key 从 subscriptionId 改为稳定 instanceId；保留 composerRole 引用。暂停期间未保存的 pending 编辑沿用现有 retained 处理，恢复不自动保存或重新打开旧 reservation。
7. 旧 pending-edit capability 必须跨暂停失效；使用独立于有效 start/steer 回执的能力代次，避免为废弃编辑能力而丢弃仍属于同一队列的网络结果。底层取消仍只清理一次。

### 压缩与状态基线

- 暂停不再永久 dispose compaction。保留原 claim、reservation、startFailure 和 deliveryUnknown，禁止新请求；恢复快照只凭相关 turn/item 的正面证据推进状态。已知 turn 终结可解除对应运行/请求；无关联证据不能推断未知请求未执行，也不能直接重置 idle。真正 live dispose 才终结 owner。
- compaction 的变更在队列 committed 后、发送仍冻结时实施；释放已有 reservation 不得触发提前发送。旧请求通过原 claim 身份核验，已结束 claim 的 late settlement 不影响新状态。
- 若 requestPending/deliveryUnknown 没有可关联的 candidateTurnId，即使新快照 idle，也保留 claim 及其独立屏障。同步恢复成功仅表示投影可信，不代表发送/移除/再次压缩已可用。ContextUsagePopover 按权威状态分别说明“等待压缩请求结果”或“压缩请求结果不明”，不把 unknown 统一描述为正在压缩，不新增重发或强制解除入口。
- ActiveThreadStatus 接纳快照时同时使旧 read generation 失效并解绑旧 refreshPromise，不能留下永久占位；保留恢复中 status dirty 并启动新代次刷新。旧 read 的 finally 不能清除新请求。
- baseline 和候选事件顺序应用，不以 snapshotDuplicate 事件假冒新的压缩请求或消息交付。快照中已有压缩 item 时，后续同 ID itemCompleted 目前会被标为 snapshotDuplicate；保持该 replay 合同，使用关联轮次终态闭合该压缩状态，不凭快照包含 item 推断 item 已结束。专门验证后续 turnCompleted 能正常释放；没有完成证据时不承诺提前变为 idle。快照核对用生成的 Turn/Thread 类型，不增加协议镜像。

### 页面与国际化

- 新增窄职责 `ProjectionRecoveryNotice`，由 CurrentTaskPage 传入权威状态与动作能力。HeroUI Alert 使用 danger 表达暂停故障，恢复按钮沿用 primary、小号；复用 FailureLayout、FailureDiagnosticModal、RetryActionButton 及既有主题 token，不新增自制控件或强色布局。
- 非执行名称“恢复同步”，执行中“正在恢复…”及 Spinner。重试期间旧错误与诊断原位保留；结果更新同一面板。三种原因分别解释，旧内容可能过期的说明始终明确。
- 仅当前 live 正文的通用 subscriptionInterrupted 提示由页面面板接管，固定历史正文继续按原逻辑显示；保留 globalStatus 数据语义，不删除历史错误、独立保存错误和 turn 错误。不要简单删掉整个 renderer 的错误区。
- 英文 source message 配准确 translator comment，经 Lingui 提取后补 en/zh-CN；复用现有重试交互，不修改其共享组件。

## 4. 精确写集合

下列路径除文档外均相对 `codex-gui/`。现有文件只修改本任务相关内容；新增文件已显式注明。每个节点仅获得所属集合，不允许通过“相关文件”扩权。

| 集合 | 文件 | 证据与职责 |
| --- | --- | --- |
| C：合同 | `src/features/activeThreadSession/activeThreadSessionContracts.ts`、`activeThreadSessionCollectionContracts.ts`（同目录）；`src/features/composerInputQueue/composerInputQueueCoordinator.ts` 的接口声明 | 权威恢复状态/动作与队列事务接口；不保留旧恢复合同并行路径 |
| Q：队列 | `src/features/composerInputQueue/composerInputQueueCoordinator.ts`、`composerInputQueue.ts`（同目录） | 活动队列快照、暂停发送、事务结果、pending facts 保留 |
| A：辅助 owner | `src/features/activeThreadSession/activeThreadCompaction.ts`、`activeThreadStatus.ts`；`src/features/composerTurnControl/ContextUsagePopover.tsx` | 压缩 claim 快照核对、status 基线与旧查询隔离；明确保留的压缩未知屏障 |
| L：生命周期 | `src/features/activeThreadSession/activeThreadSession.ts`、`activeThreadMemberLifecycle.ts`、`liveActiveThreadSession.ts` | 集合能力、候选缓冲、live 原位事务、旧编辑能力失效 |
| U：界面 | `src/features/currentTask/CurrentTaskPage.tsx`；新增 `src/features/currentTask/ProjectionRecoveryNotice.tsx`；`src/features/composerTurnControl/ComposerTurnControl.tsx`；`src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx`、`CommittedTranscriptSurfaceRenderer.tsx` | 故障面板、editor 身份与 live-only 去重；不改 fixed 历史语义 |
| O：owner 回归 | `src/features/activeThreadSession/__tests__/activeThreadMemberLifecycle.test.ts`、`activeThreadSession.test.ts`、`liveActiveThreadSession.test.ts`、`activeThreadCompaction.test.ts`、`activeThreadStatus.test.ts`；`src/features/composerInputQueue/__tests__/composerCoordinatorPersistence.test.ts`、`composerInputQueuePersistence.test.ts`、`composerInterruptSnapshotPersistence.test.ts` | 重复/晚到恢复、持久化阻塞、队列与压缩/status |
| B：页面回归 | `src/__tests__/AppProjectionAvailability.browser.test.tsx`、`AppProjectionIngress.browser.test.tsx`、`AppProjectionScroll.browser.test.tsx`、`AppMultiSessionIsolation.browser.test.tsx`、`AppErrorPresentation.browser.test.tsx`；`src/features/composerTurnControl/__tests__/ComposerTurnControlPendingInput.browser.test.tsx`、`composerPendingInputSession.test.ts`、`ContextUsagePopover.browser.test.tsx`；`src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurfaceSessions.browser.test.tsx` | 最高层恢复序列、保留输入、失败展示、历史边界和压缩能力 |
| H：合同及 fixture | `src/features/activeThreadSession/__tests__/activeThreadSessionHarness.ts`；`src/features/newSession/__tests__/newSessionOwner.test.ts`；`src/features/composerTurnControl/__tests__/composerTurnControlPendingInputBrowserTestSupport.tsx`；`src/__tests__/appBrowserTestSupport.ts`；`src/features/projection/__tests__/projectionTestBuilders.ts` | 新方法/字段的显式 mock 传播；合法协议 builder，仅按实际需要修改 |
| E：E2E | 新增 `e2e/projectionRecovery.spec.ts`；`e2e/multiSessionHarness.ts`、`persistenceHarness.ts` | 复用已有 host harness 构造新订阅/失败与多任务；原 multiSession/persistence spec 只读回归 |
| G：catalog | `src/locales/en.po`、`src/locales/zh-CN.po` | Lingui 完整生成边界，人工仅改本功能新增/调整消息的翻译 |

owner 回归由对应 Q/A/L 节点写各自测试；C 不改测试，H 由单一集成 owner 更新。U 只负责组件源码，B/E 由应用验收节点负责；B 中 ContextUsagePopover.browser.test.tsx 归 A 单独拥有，I 不写该文件，避免不同节点争用测试与 shared harness。

不新增纯顺序调整或预重构任务：当前接口可以直接扩展到最终模型。若实施确需非行为移动，必须单列节点与提交，不混入功能提交，也不能借重排改范围。

执行记录新增于 `docs/superpowers/reports/2026/09/09/2026-09-09-codex-gui-projection-recovery-execution.md`，仅未来确认执行后由主代理维护。当前落盘不创建执行记录。

## 5. 工具链、生成与验证

计划前已核对 package scripts、Vitest shared/parallel/sequential 配置、Playwright 配置、Lingui 配置、protocol validator CLI 输入，以及本地依赖文档。fnm Node 为 v24.17.0、pnpm 为 10.34.5，pnpm 位于用户 fnm installation；HeroUI 本地源码与已解析包均为 3.2.4，三浏览器 executable 存在。本轮只检查可执行性，未运行产品测试。

执行前重新检查 `/opt/homebrew/bin/fnm env --shell zsh`、fnm 中的 node/pnpm 来源、依赖可执行文件和目标输入；缺失时停止相应节点，不安装。命令 cwd 全部为 `/Users/jiangsheng/cnb/codex/codex-gui`，Git 与文档操作 cwd 为仓库根。

权威格式门禁是 CI 使用的 oxfmt。代码冻结后使用 `pnpm run format:oxfmt:fix` 对应的 fnm 入口；该脚本写整个 GUI，必须持有 GUI 写锁并检查完整 diff，不能接受范围外格式变化。随后以非 fix 门禁验证。纯 GUI/Markdown 不触发仓库 just fmt，不启动独立 Prettier 格式流程。

Lingui 权威入口是 messages:extract，include=src，sourceLocale=en，locale=en/zh-CN，完整输出仅两个 catalog。顺序为提取 → 按 `#: / #. / msgid / msgstr / fuzzy / obsolete` 审查完整 diff → 人工补当前消息翻译 → 同一入口再次提取并验证稳定。不得手工塑造 reference 行号、扩大 locale 或顺手 clean obsolete。

未来执行命令：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt:fix
/opt/homebrew/bin/fnm exec --using-file pnpm run messages:extract
# 补充获准翻译后，重复同一 extraction；稳定后进入验证。
/opt/homebrew/bin/fnm exec --using-file pnpm run messages:extract
/opt/homebrew/bin/fnm exec --using-file pnpm run ci
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:parallel src/__tests__/AppProjectionAvailability.browser.test.tsx src/__tests__/AppProjectionIngress.browser.test.tsx src/__tests__/AppProjectionScroll.browser.test.tsx src/__tests__/AppMultiSessionIsolation.browser.test.tsx src/__tests__/AppErrorPresentation.browser.test.tsx src/features/composerTurnControl src/features/committedTranscriptSurface
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:sequential src/__tests__/sequential/composer-focus.browser.test.tsx src/__tests__/sequential/composerPendingInputCopy.browser.test.tsx
PLAYWRIGHT_HTML_OPEN=never /opt/homebrew/bin/fnm exec --using-file pnpm run test:e2e e2e/projectionRecovery.spec.ts e2e/multiSession.spec.ts e2e/persistence.spec.ts
```

CI 覆盖 validator check、oxfmt、lint、typecheck、全部 unit 和 browser smoke，不再为同一稳定源码无理由重复整套检查。Browser parallel 配置覆盖三个浏览器，sequential 配置独占 focus/clipboard；两者均在配置层 headless。测试必须实际收集指定目标，零用例不算成功。

protocol check 只读当前 app-server/gui-host JSON schema 与生成的 GUI validators；相关输入已存在，协议未改变，不执行 Rust schema 生成或 backend build。

E2E 非 CI 默认端口 5173，会自行启动前端 Vite；执行前用 lsof 核对，已有用户服务时不接管/终止，也不依赖未知服务产生证据，先确认是否为当前获准源码。不得设置 CI 来绕开端口问题并引入未准备的 preview 产物。禁止打开 HTML report、trace viewer 或有头浏览器。

### 行为验收映射

- 三种合法暂停 → 具体原因及按钮 → pending 保留错误/诊断 → 失败重试 → 新订阅成功 → 新事件继续更新；再发生暂停仍可恢复。
- response 前/核对中出现候选事件、delta、closed；旧订阅 closed 晚到；重复点击与同步 listener 重入；恢复中切换任务、连接替换或卸载。
- 草稿和 retained 未保存编辑不丢、不自动提交；新 subscription 不重挂 editor；旧编辑 capability 不复活。
- 暂停中 start/steer 回执晚到不推进发送；新快照 active turn 与停止/引导目标一致；持久化失败回滚且可再次恢复；unknown/restoredPaused 不绕过。
- 压缩 idle/pending/running/unknown 经暂停恢复保持正确能力；candidateTurnId=null 的未知请求不误释放且有说明；快照含压缩 item 后的 duplicate completion 与 turnCompleted 正确收敛。
- 旧 status read 未完成时 rebase、再次 invalidate、旧 read 完成、新请求继续可运行；持久化失败时外部 live/status/compaction 状态保持原值。
- 非目标任务不产生新 attach/detach，当前任务不跳转；fixed 历史错误与独立保存错误仍显示；当前暂停只有一个主错误面板。

Level 1 为上述自动化。Level 2 需当前完整 GUI URL、实际运行任务及明确授权的测试对象；按 codex-gui-toolchain 和 playwright-cli 无头入口执行，记录实际 route、订阅恢复、输入/队列保护、宽窄屏与诊断交互。没有合法真实触发条件的场景标记未执行，不通过伪造消息或 mock 冒充真实证据，不主动构建/运行后端或压垮用户任务。该缺口仅阻止 Level 2 与完整验证声明，其他已授权节点继续。Level 3 不适用。

## 6. 描述式执行 DAG

本节是执行结构，ticket 仅描述用户交付，不作为调度栅栏。所有节点继承以下默认字段，表内显式覆盖；不使用 parallelizable 标记。

- `objective/outcome`：仅服务 QR-X03-002；每节点唯一产物见表。`estimatedCost` 为粗粒度，不是停止阈值。
- `executionContext`：上述当前 dev 工作树；Git index 的 canonical identity 执行前用 `git rev-parse --git-path index` 核对；不创建 worktree。
- `authorizationGate`：当前 pending。未来明确执行确认才成为 grantSource；negativeConstraints 为第 1 节及现行用户规则。每节点仅允许自己的 operationKind、writeSet、命令和固有副作用；特殊项目外或可见窗口授权为空。完成/撤销即到期，subdelegation=false。
- `readSet`：设计/本计划/ticket/适用规则，以及该节点合同、源码和测试。共享源码仅在未写期间读取；跨节点需发布稳定合同或使用只读 Git 基线快照，禁止读取另一代理 mutable diff。测试读整个稳定 GUI 及协议输入、本地依赖文档。
- `writeSet/stateEffects`：仅表中集合；编辑不含生成/格式/stage/commit。验证仅正常 runner 产物。文档与 Git 节点分别限定文档 allowlist 和 index/HEAD。
- `commandScope`：调查/审查仅 rg/cat/sed/nl/只读 Git；编辑仅普通源码/文档编辑，移动删除走原生 Git 且先核对范围；格式/生成/验证仅第 5 节入口；stage/commit 仅普通本地命令和精确 allowlist。
- `resourceLocks`：编辑对第 4 节 canonical 文件写锁、稳定合同读锁；格式对整个 GUI 写锁；extraction 对 src 读锁、两个 catalog 写锁；runner 对源码读锁及实际 node_modules/.vite、tsbuildinfo、报告和端口写锁；Git 独占仓库 index/HEAD；执行记录独占报告路径。
- `deferralEvidence=none`：没有凭据的暂缓无效。资源争用只等待锁，不伪造业务依赖。锁释放即重算 ready set。
- `verification`：稳定产物由 V1–V4、R 按第 5 节核验；测试通过不能替代未执行真实验收。`failureDomain` 为本节点及实际消费者；`replanTriggers` 为新目标/产品语义/写集合/授权/合同前提变化，计划内失败进入动态修正，不自动停止全部工作。

| nodeId / taskBoundary | operationKind / owner / estimatedCost | hardPredecessors 与 consumes → produces | writeSet / completionEvidence |
| --- | --- | --- | --- |
| P0s / T0 文档 | stage / 主代理 / 小 | 未来执行确认＋preflight → 文档 staged snapshot | 设计、本计划、01 ticket 的 index；ignore/差异检查 |
| P0c / T0 文档 | commit / 主代理 / 小 | P0s → 独立文档提交 | index/HEAD；commit id，之后才可产品编辑 |
| C / T1 功能 | 编辑 / 主代理 / 小 | P0c → 最终恢复与队列合同 | C；声明稳定发布，允许中间尚未集成，不加兼容路径 |
| Q / T1 功能 | 编辑 / 队列实现代理 / 中 | C 合同 → 队列冻结与事务核对 | Q＋对应 O 队列测试；接口/失败语义和 diff 固定 |
| A / T1 功能 | 编辑 / 辅助状态实现代理 / 中 | C 的恢复事务约定 → 压缩/status 基线能力 | A＋对应 O 测试＋B中ContextUsagePopover测试；有效/未知结果语义稳定 |
| U / T1 功能 | 编辑 / 页面实现代理 / 中 | C 状态合同 → 页面恢复呈现与稳定editor身份 | U；不读取进行中的 Q/A/L 源码，按稳定合同接线 |
| L / T1 功能 | 编辑 / 主代理 / 大 | C、Q、A 的稳定实现 → 完整 member/live恢复能力 | L＋对应 O；候选/失败/过期路径及 diff 固定 |
| I / T1 功能 | 编辑 / 应用验收代理 / 中 | L、U 的最终路径 → 应用回归与 fixture/E2E | B（排除A拥有的ContextUsagePopover测试）、H、E；全路径案例与直接合同消费者完成 |
| F / T1 功能 | 格式化 / 主代理 / 小 | C/Q/A/U/L/I 全部源码冻结 → 格式稳定源码 | 全 GUI 格式入口，实际差异限 T1；完整 diff 审查 |
| G1 / T1 功能 | 生成 / 主代理 / 小 | F → 首次 catalog | G；字段分类与源映射 |
| G2 / T1 功能 | 编辑 / 主代理 / 小 | G1 → 完整翻译 | G 的允许 msgstr；其余翻译不变 |
| G3 / T1 功能 | 生成 / 主代理 / 小 | G2 → 稳定 catalog | G；二次无结构/语义漂移 |
| R / 无提交 | 审查 / 独立审查代理 / 中 | F 稳定源码 → 行为/范围审查 | 无写入；可与 G 并行，不能审 mutable catalog |
| Rc / 无提交 | 审查 / 独立审查代理 / 小 | R、G3 → 翻译与源码一致审查 | 无写入；字段/范围核对 |
| V1 / T1 功能 | 验证 / 主代理 / 中 | G3 → CI 证据 | runner 正常产物；实际目标全部通过 |
| V2 / T1 功能 | 验证 / 主代理 / 中 | G3 → 有界 Browser 证据 | runner 正常产物；parallel与sequential分别记录 |
| V3 / T1 功能 | 验证 / 主代理 / 中 | G3＋端口preflight → E2E证据 | 前端服务/runner产物；三spec目标通过 |
| V4 / 无提交 | 验证 / 主代理 / 中 | G3＋真实URL/对象/触发条件 → Level 2 分类 | 获准无头真实操作；通过/未执行逐项证据 |
| J / 无提交 | fan-in / 主代理 / 小 | R/Rc/V1–V4 的结果分类 → 功能最终验证身份 | 无产品写入；计划内修正闭环、Level 2限制明确 |
| S1 / T1 功能 | stage / 主代理 / 小 | J 稳定源码 → 功能 staged snapshot | 第4节实际变更 allowlist的index；diff/ignore检查 |
| C1 / T1 功能 | commit / 主代理 / 小 | S1 → 独立功能提交 | index/HEAD；commit id，不混入纯顺序调整 |
| D / T2 记录 | 编辑 / 主代理 / 小 | C1＋执行事件 → 最终执行报告 | 第4节报告路径；节点/锁/验证/限制/提交记录 |
| S2 / T2 记录 | stage / 主代理 / 小 | D → 报告暂存 | 仅报告index；检查通过 |
| C2 / T2 记录 | commit / 主代理 / 小 | S2 → 独立记录提交 | index/HEAD；无计划遗留及无关变更保留 |

初始 ready set 为 P0s。C 发布后 Q/A/U 同时具备调度条件，属同一功能任务且写集合不相交。L 等待 Q/A 的真实接口和失败语义，但不等待 U；I 等待完整行为接口以构造应用级验证。F 等待全部源编辑是全 GUI 格式入口的真实写冲突；R 与 G 可独立并行。V1/V2/V3 无相互业务依赖，但共用 cache、tsbuildinfo、端口时依资源锁轮流运行。V4 未取得真实条件时只记录该分支未执行，不能把等待扩大到代码/自动化。

预计关键路径：文档提交 → 合同 → 队列事务 → member/live集成 → 应用回归 → 格式/翻译 → 最终验证 → 功能提交。提交拓扑只有 T0 → T1 → T2；节点完成不要求单独提交，最终功能提交来自同一组合验证快照。

## 7. 审计、失败闭环与完成条件

计划前独立反向审计已完成。审计读取原设计和当前源码，核对数据/订阅/压缩/status/页面及 fixture 的传播和成功判据，确认默认 AppProjectionAvailability harness 挂载生产 CurrentTaskPage；自定义 probe 用例不得代替按钮交互测试。

四项审计发现已纳入本计划：缺少压缩关联时保留并说明独立屏障；快照已有压缩项的完成采用关联轮次终态闭包；queue committed 前不修改外部 owner 且同批暂停先冻结发送；status rebase 同时处理 generation、refreshPromise 和 dirty。没有证据要求改后端协议或共享重连。Q/A/U 属同一功能任务的不相交分工，L 等待 Q/A 的稳定事务和基线接口，未用任务编号制造依赖。

执行期遵循 delegating-micro-stages 的动态图：失败插入最小诊断/修正/验证节点，保留证据，继续无依赖工作；不得用跳过、放宽断言、静默 fallback 或改基线通过。已有提交的修正新增独立提交。新增范围或产品变化才回到对应确认，普通计划内修正持续完成。

完成条件：唯一功能 ticket 的全部验收成立；所有合同消费者接入最终路径；新投影可信、数据保护与状态能力完整；适用自动化通过；Level 2 逐项报告且未执行时不宣称完整真实验证；文档/功能/记录本地提交完成，无本计划遗留。最终按执行图报告实际并行、关键路径和未启动 ready 节点。本轮仅计划落盘，不产生上述执行结果。
