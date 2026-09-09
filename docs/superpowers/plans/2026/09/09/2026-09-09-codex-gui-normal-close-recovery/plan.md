# QR-X03-001 正常关闭连接恢复实施计划

日期：2026-09-09。状态：计划已落盘，独立影响面审计及两项修订已完成，待用户确认任务拆分与实施；尚未执行。

设计依据：[已确认设计](../../../../../specs/2026/09/09/2026-09-09-codex-gui-normal-close-recovery-design.md)。基线：本地 dev，`ffc118cdf`，包含 QR-X03-002 的 `c80233091`。本计划只服务 QR-X03-001。

## 1. 目标、授权与范围

连接正常关闭后保留旧对话只读、草稿与待发内容，提供手动重新连接；恢复所有已打开任务，保持当前查看位置，各任务失败独立，保留 unknown 和继续发送屏障。

当前授权仅覆盖只读调查和本计划文档落盘。产品编辑、测试运行、生成、stage、commit、真实场景注入均待实施确认；计划中列出的动作是待授权执行范围，不因本文创建而生效。

采用 to-tickets 的纵向拆分，但本地 tracker 尚未配置，且任务拆分尚未单独确认。第 3 节是审阅用任务提案，不是已发布 tickets。后续 tracker 发布须先完成 `/setup-matt-pocock-skills` 并核对目标；本轮不创建 `.scratch`、不发布外部 issue、不修改父 issue。

本轮不修改后端、协议、依赖、路由协议或已有设计文档。无需 worktree，拟在当前 dev 共享工作树按实际依赖推进；不创建分支，不操作远程。无非行为顺序调整任务，不为重连重排 import、声明或函数位置。若确有独立纯移动需求，应另立提交边界，不能混入行为提交。

## 2. 计划前证据与机制

本节路径除特别注明外均相对 `codex-gui/`，是实施定位与影响面证据；不是待发布 ticket 正文。

| 六字段 | 已核验事实与计划含义 |
| --- | --- |
| 权威入口 | `src/main.tsx` → router 的 AppRouteBoundary → `src/App.tsx` → GuiHostConnectionBridge → startGuiHostConnectionLifecycle；`guiHostClient` 正常 close 作废命令后发布 GuiHostStatus.closed；命令合同由 guiHostCommandGateway 的 GuiHostCommands 定义，参数/结果来自生成协议。 |
| 已追踪链路 | connectionUnavailable → collection/member/live dispose → 空正文；live 构造时向 queue/status/skills 固定传入旧命令；AppCapabilities 传播连接能力，AppShell 拥有全局提示；Bridge 冻结 startupTarget；PendingInputProvider 在 App 内稳定挂载，pending session 已具备 retained capture 路径。 |
| 修改范围 | 分离页面与连接轮次的释放；保留 collection/member/live/queue，替换唯一命令能力来源；增加真实连接暂停状态、任务恢复与共享恢复状态；适配页面、输入门禁、状态/skills 请求及直接 fixture。精确集合见第 4 节。 |
| 验证映射 | 应用级 AppProjectionAvailability、AppMultiSessionIsolation、既有 appBrowserTestSupport；lifecycle/member/live/queue/status/skills unit；composer pending/edit Browser；multiSession、persistence、projectionRecovery E2E；最终 CI 与有界 Browser。 |
| 排除项 | 002 的 recoverProjection 依赖有效 live 和原连接，只替换订阅，不能直接恢复 disposed 会话；保持其单任务行为。main/router 已提供实时路由，无需改协议。newSession owner 在 App useState 中稳定存在，setConnection 已递增 generation，保留其 null/new 绑定，不重挂 App。生成协议与校验器不变，保留 check 门禁。 |
| 剩余未知 | 真实 Level 2 的当前完整 URL、任务对象与合法正常关闭触发条件尚缺，是独立验收环境门禁；不以 harness 代替。以下内存/命令机制已有源码依据，实施需要按回归验证，不存在依靠“全部已持久化”的假设。若审计发现遗漏 owner 或输入来源，先修订计划再请求实施。 |

### 2.1 保留数据，替换连接能力

- `composerInputQueueCoordinator` 的 pendingDraft、pendingFacts 可以仅保存在内存；dispose 会清理 pendingFacts、deferredEffects、recovery，liveManagement dispose 会清 activeSession。因此保留 collection/member/live/queue 实例及稳定 composerRole，禁止 dispose 后从存储重建作为正常关闭恢复策略。
- 在会话边界建立唯一可撤销、可替换的命令能力来源，合同从 GuiHostCommands 机械派生。每次操作绑定其实际连接轮次；失效后拒绝新操作。迁移当前固定命令捕获点，不保留旧能力 fallback 或并行旧新路径。该来源是最终架构，不是为中间提交保绿的临时 adapter。
- 命令调用可以使用新连接，已发出的 Promise 仍归原调用。queue 的 generation 是数据 owner 生命周期，不能在每次关闭时直接提升并丢弃旧 claim 的 unknown 结算。通过现有 GuiHostCommandError.delivery 分类保留 definitelyNotAccepted/deliveryUnknown 语义，结算不能自动启动下一项。
- 为连接不可用增加独立的前端状态/屏障，不伪造 projectionUnavailable 的 backpressure 等原因，也不把 closed 当 initialized。暂停网络命令、订阅 ingress 与发送；保留有效展示和输入快照。只在真正卸载 App 时最终 dispose 数据 owner。
- readThread、listSkills、compaction 的迟到结果不得覆盖新轮次。命令换绑与请求结算分别归属，保持失败信息与可重试性；失效轮次不允许触发后续自动查询。

### 2.2 保留编辑器中的输入

- `usePersistComposerDraft` 在 staleRevision 时持有尚未写入 owner 的 draft；保持 ComposerTurnControl 的挂载、role 和 editor identity，关闭时冻结编辑操作而非重挂组件。重连不能用旧持久化初值覆盖当前 editor。用户导航导致真正卸载前，已接收的最新 draft 必须交给同一 live/queue 的本地保留入口；该入口保留内存内容与保存错误，不要求连接可用，不发送消息，也不授权新的离线编辑。不能仅依赖即将卸载的 hook ref 或把 unavailable 当作已经保存。
- `composerPendingInputSession.reconcile` 在 mutationsEnabled=false 时调用 retainEdit，先 capture 最新编辑，再取消旧 reservation；Provider 位于 App 层，不随 Outlet 卸载。沿用这条单一保留路径，保留 retained 内容及既有复制/人工处理能力，不自动写回已失效的编辑目标。
- 停止连接后的 owner 发布必须让 UI 有机会完成 capture；测试覆盖挂载、关闭、重连失败/成功、切换任务。不能先 dispose host 或重置 edit，再声称 queue 保留即无损。
- 普通草稿新增一条明确应用验收：“saveDraft 返回 staleRevision，最新内容尚在 hook/editor → 正常关闭 → 切往另一任务 → 恢复连接 → 返回原任务”，断言最新草稿保留、未发送、保存失败仍可诊断。它与 pending-input drawer 的 retained 编辑是两个不同数据源，分别验证。
- 输入数据保存属于已接收内容的保护，不代表允许断开后继续离线编辑。恢复期间已有独立 persistence/recovery 错误不清除。

### 2.3 恢复路径和任务集合

- 连接生命周期返回有类型的手动恢复能力与释放能力，AppCapabilities 只消费其权威合同。Bridge 提供当前 routeTarget 的实时读取入口，不再把 frozen startupTarget 用作每次恢复目标。
- 将 releaseRound 拆成连接资源释放与页面数据 owner 释放，保留现有 active/round 隔离、BFCache 与清理失败传播。正常关闭只切断旧连接；清理失败可见且阻止把新轮次误报成功。
- 重新认证/握手后绑定新命令。对已有 live 的任务，使用原 queue 与投影协调逻辑接入新快照；对于尚无 live 的已登记任务沿现有初始化路径处理。
- 共享连接恢复需要沿已有 listLoadedThreads 分页判定：确认已加载则 attach，确认未加载才 resume 再 attach，未知/失败不能猜测未加载。002 在同一连接上的纯订阅恢复不额外重启连接。
- 新连接、目标 threadId、subscriptionId 和恢复 attempt 都匹配，候选通知被处理、队列持久化协调有效后，才发布任务恢复成功。沿用 002 的候选通知与追加批次协调，不重建一套平行提交链检查。
- 集合成员以内存 collection 为当前权威，持久化仍承担既有存储职责；关闭不清成员。所有成员分别恢复，不使用一个 Promise rejection 中止整组。保留最近路由意图，后台发布与晚到结果不改变用户查看位置。
- 共享连接失败由全局面板再次重连；共享连接已恢复而某成员失败，由成员恢复入口再次尝试，不重启已健康的共享连接。失败成员保留旧正文。不同恢复前提由 owner 判断，不能将普通 threadStatus retry 冒充订阅恢复。

## 3. 纵向任务提案（待确认、未发布）

### T1：连接关闭后保留可读任务与输入

Blocked by：无实现任务；执行前仍需计划确认和文档提交。

交付：从真实 close 事件经生命周期、任务状态和页面呈现，保留旧正文与输入，展示关闭说明，拒绝失效操作；用应用级测试验证。此切片先完成关闭状态，完整恢复按钮的可执行行为由 T2 完成，不设置无效按钮或临时刷新替代品。

验收：正常关闭不空白；草稿、未保存编辑、队列保留；不发新请求；旧在途发送准确进入既有结算；页面卸载仍释放资源；异常诊断和 002 原有暂停不退化。

### T2：手动重建连接并恢复一个已有任务

Blocked by：T1，依赖保留 owner 与连接暂停语义。

交付：页面点击重新连接，经过共享连接重建、命令换绑、加载判定与重新订阅，恢复一个已有任务；失败仍可重试，内容/输入保留。该切片验收单任务配置，集合扩展是 T3；不能以单任务通过宣称整体设计完成。

验收：按钮 pending、防重复、失败说明与诊断稳定；有效快照后才成功；反复断开与迟到回调不串写；未加载任务使用既有 resume 路径；unknown 和继续发送屏障保留。

### T3：恢复全部任务并隔离部分失败

Blocked by：T2，依赖已经可用的单成员恢复事务。

交付：一次重连覆盖所有登记成员，保持当前查看任务及重连期间新导航；失败成员可单独恢复，健康成员不被连带重连。扩展同一恢复路径，不保留 T2 的另一条单任务实现。

验收：启动 A、查看 B 后重连仍在 B；A 失败不阻止 B；重连中导航不被迟到结果覆盖；每个任务内容、队列与错误归属正确；全计划最终验证完成。

三个任务各为独立行为提交。不新增纯 prefactor 任务：现有证据支持直接建立最终 owner 边界，单纯预先移动代码不带来本目标必需的独立结果。允许中间提交未完成全部设计，不引入临时兼容、双写或 fallback 使中间提交虚假完整。

## 4. 精确读写集合与合同传播

以下集合使用仓库相对路径。每个组包含所列源码、同名直接测试，未列出的新文件/目录不能以“相关”自动纳入。实现前重新搜索当前基线；新消费者缺口按动态执行规则核验范围。

| 组 | 允许实现范围（相对 codex-gui/） | 依据 |
| --- | --- | --- |
| C 连接与合同 | `src/features/appShell/guiHostConnectionLifecycle.ts`、`GuiHostConnectionBridge.tsx`、`AppCapabilities.ts`；`src/features/activeThreadSession/activeThreadSessionContracts.ts`、`activeThreadSessionCollectionContracts.ts`；新增 `src/features/activeThreadSession/activeThreadConnection.ts` 与其 `__tests__/activeThreadConnection.test.ts` | 唯一能力源、暂停/恢复合同和生命周期释放边界 |
| O 会话与输入 owner | `src/features/activeThreadSession/activeThreadSession.ts`、`activeThreadMemberLifecycle.ts`、`liveActiveThreadSession.ts`、`activeThreadStatus.ts`、`activeThreadCompaction.ts`；`src/features/composerInputQueue/composerInputQueueCoordinator.ts`；`src/features/skillCatalog/skillCatalogOwner.ts` | 当前捕获旧命令、dispose 数据、恢复与请求结算的直接 owner |
| U 页面 | `src/App.tsx`；`src/features/appShell/AppShell.tsx`、`AppShellTopBar.tsx`、`activeThreadCollectionPresentation.ts`、`activeThreadCollectionMessages.ts`；`src/features/currentTask/CurrentTaskPage.tsx`；新增 `src/features/appShell/ConnectionRecoveryNotice.tsx`、`src/features/currentTask/ConnectionTaskRecoveryNotice.tsx` | 生产能力接线、全局/成员恢复反馈、集合状态派生 |
| E 输入呈现 | `src/features/composerTurnControl/ComposerTurnControl.tsx`、`composerTurnApplication.ts`、`ComposerPersistenceStatus.tsx`、`usePersistComposerDraft.ts`、`composerPendingInputSession.ts`、`composerPendingInputHost.ts`、`ComposerPendingInputProvider.tsx` | 只读门禁、保持 role/挂载和 retained capture，不复制队列状态 |
| F 合同 fixture | `src/features/appShell/__tests__/appShellTopBarBrowserTestSupport.tsx`；`src/features/threadHistory/__tests__/threadHistoryDetailBrowserHarness.tsx`、`threadHistoryListPageBrowserTestSupport.tsx`；`src/features/activeThreadSession/__tests__/activeThreadSessionHarness.ts`；`src/features/composerTurnControl/__tests__/composerTurnControlBrowserTestSupport.tsx`；`src/__tests__/AppActiveThreadSession.browser.test.tsx`、`smoke/AppThreadSwitch.smoke.browser.test.tsx` | AppCapabilities 直接对象、会话/queue 与输入合同的直接消费者 |
| V 单元与 Browser | `src/features/appShell/__tests__/guiHostConnectionLifecycle.test.ts`、`activeThreadCollectionPresentation.test.ts`；`src/features/activeThreadSession/__tests__/activeThreadSession.test.ts`、`activeThreadMemberLifecycle.test.ts`、`liveActiveThreadSession.test.ts`、`activeThreadStatus.test.ts`、`activeThreadCompaction.test.ts`；`src/features/skillCatalog/__tests__/skillCatalogOwner.test.ts`；`src/features/composerInputQueue/__tests__/composerCoordinatorPersistence.test.ts`；`src/features/composerTurnControl/__tests__/composerPendingInputSession.test.ts`、`composerTurnApplication.test.ts`、`ComposerTurnControlSession.browser.test.tsx`、`ComposerTurnControlPendingInput.browser.test.tsx`；`src/__tests__/AppProjectionAvailability.browser.test.tsx`、`AppMultiSessionIsolation.browser.test.tsx`、`AppShell.browser.test.tsx`、`appBrowserTestSupport.ts` | 关闭、恢复、输入、隔离与旧值断言 |
| X E2E | `e2e/multiSessionHarness.ts`、`e2e/multiSession.spec.ts`、`e2e/projectionRecovery.spec.ts`、`e2e/persistence.spec.ts`；新增 `e2e/connectionRecovery.spec.ts` | 复用现有多任务 fixture，新增正常 close/重连行为覆盖 |
| L 本地化 | `src/locales/en.po`、`src/locales/zh-CN.po` | Lingui 完整配置输出边界 |

F 组还包含 `src/__tests__/AppRouting.browser.test.tsx` 与 `src/__tests__/smoke/AppRouting.smoke.browser.test.tsx`：两者直接构造 ActiveThreadSessionController，必须随权威恢复合同适配。它们由 U owner 维护，前者纳入 parallel Browser，后者由 ci 的 smoke 收集。

上述组是全计划 allowlist，每一执行节点只取得本切片必需的子集；不为列入 allowlist 而制造修改。`ProjectionRecoveryNotice`、projectionIngress、projection facts、transcript readmodel、共享 RetryActionButton 及协议生成物默认只读，连接不可用不伪造投影原因，也不改变 transcript 数据结构。如果反向审计证明必须改动这些合同，计划确认前补入。

只读输入还包括：根及 GUI AGENTS、项目技能、设计、现有 002 设计/计划/执行记录、GUI manifest/config/锁文件、完整 `src` 直接反向消费者、`e2e` 支撑、协议 schema/生成物与合法 fixture。Rust schema 只作为现有前端检查输入，不运行后端构建。

HeroUI：关闭提示使用 Alert 的 warning 语义，失败用 danger；恢复操作复用 RetryActionButton 的 primary variant、内部 Spinner，以及 FailureLayout/FailureDiagnosticModal。使用既有 background/foreground/muted/separator/surface 语义 token，不改共享样式或固定像素布局。main/section 等语义容器保留，不自建交互按钮。

## 5. 验证入口与环境预检

所有前端命令 cwd 为 `/Users/jiangsheng/cnb/codex/codex-gui`。已只读核验 fnm 管理的 Node v24.17.0、pnpm 10.34.5；PATH 首个 pnpm 属于该 fnm 安装。Chromium/Firefox/WebKit 的既有 executable 均存在。未安装任何组件，未运行测试。

package.json 的 ci 是组合门禁：protocol:check-validators → format:oxfmt → lint → type-check → unit → smoke。以 oxfmt 为权威，不并行使用 prettier。Browser parallel/sequential 配置各自决定收集范围，共享配置固定 headless=true；Playwright 本地使用 5173，配置可启动前端 dev 或复用既有服务。

执行前核验 manifest、入口、生成 schema 与 fixture 可读、端口及服务 cwd、浏览器 executable、工具来源与当前基线。无工具时停止受影响执行并给用户安装建议，助手不得安装。真实 URL 不写入计划或公共日志。

### 命令集合

1. 每个切片组合门禁：`/opt/homebrew/bin/fnm exec --using-file pnpm run ci`。
2. 关键应用 Browser：`/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:parallel -- src/__tests__/AppProjectionAvailability.browser.test.tsx src/__tests__/AppMultiSessionIsolation.browser.test.tsx src/__tests__/AppActiveThreadSession.browser.test.tsx src/__tests__/AppShell.browser.test.tsx src/__tests__/AppRouting.browser.test.tsx src/features/appShell src/features/composerTurnControl src/features/threadHistory`。
3. 顺序焦点/编辑回归：`/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:sequential -- src/__tests__/sequential/composerPendingInputCopy.browser.test.tsx src/__tests__/sequential/composer-focus.browser.test.tsx src/__tests__/sequential/navigation-focus.browser.test.tsx src/__tests__/sequential/composer-viewport.browser.test.tsx`。
4. T2 起及最终 E2E：`PLAYWRIGHT_HTML_OPEN=never /opt/homebrew/bin/fnm exec --using-file pnpm run test:e2e -- e2e/connectionRecovery.spec.ts e2e/multiSession.spec.ts e2e/persistence.spec.ts e2e/projectionRecovery.spec.ts`。新增 spec 创建前不调用该命令；不得把零收集视为通过。
5. 生成：`/opt/homebrew/bin/fnm exec --using-file pnpm run messages:extract`。Lingui 配置包含 src、排除截图和 traces，sourceLocale=en，完整输出仅 en.po 与 zh-CN.po；新增/修改消息必须有准确 translator comment，人工仅补本功能新增翻译。逐字段审查完整 diff，保留既有翻译，重复 extraction 验证两个文件稳定。禁止手工重写 source references、clean catalog 或扩大 locale。
6. 格式化使用 `/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt:fix`，随后 `pnpm run ci` 中的非 fix 检查重新验证。该脚本目前固定整个 GUI，执行前所有 GUI 编辑必须稳定，执行后只接受 allowlist 内必要格式变化；有范围外改动风险时改用同一 oxfmt 对显式文件集合执行，先核验参数，不用手工 patch 模拟格式化。
7. Git 检查从仓库根运行 `git diff --check`、`git status --short`、精确文件 `git diff`、暂存后 `git diff --cached --check`。不执行任何远程命令。

局部红绿回归可使用已存在 `test:unit` 脚本加第 4 节明确测试路径；最终 unit 由 ci 覆盖。稳定源码未变化时不重复已有有效验证；新失败和修正只失效实际依赖其输入的证据，最终组合检查不能被局部结果替代。

### 验收等级

- Level 1 必需：上述自动化；E2E 含宽/窄屏、键盘、防重复、失败后再成功、dirty edit、多任务和 unknown。
- Level 2 必需且当前环境未就绪：执行时通过当前 `/gui` 或可用 launch 工具取得完整 URL，使用已有无头入口并核验实际非 headed 状态；选择明确允许的真实任务，合法触发正常关闭，验证保留、重连、当前位置及多任务恢复。不得停止用户运行服务或更改运行状态来制造场景，除非该精确动作另有授权。环境缺口只阻断此节点及完整验收声明，其他实现和自动化继续。
- Level 3 不适用，不开可见浏览器、DevTools、报告窗口。

## 6. 描述式 DAG 与能力信封

节点字段遵循 delegating-micro-stages 的 execution-graph 契约，下列公共字段与每行字段合并为完整记录，不使用图形表达。

### 公共上下文与授权

- `executionContext`：canonical root `/Users/jiangsheng/cnb/codex`；worktree=当前根，branch=dev，共享 Git index，以 `git rev-parse --git-path index` 的当前结果为 canonical index。无新 worktree/branch，没有外部项目主动改动。
- `objective`：第 1 节目标；`phase`=待实施；`grantSource`=后续对本计划的明确实施确认（当前尚无）；`authorizationGate.status`=pending，单个节点执行前由 action-authorization 收紧为 active。
- `grantedOperation/allowedOperations/commandScope`：仅该行 operationKind 对应普通源码编辑、项目生成/格式化/验证、只读审查、精确 stage 或本地 commit；命令限第 5 节及对应明确 Git 动作，不跨动作族。
- `parameterBounds/readSet`：上述 root 与第 4 节当前任务需要的输入；每节点开始前列出精确子集。`writeSet/canonicalTargets`=行内组对应文件的最小子集（或文档节点精确路径），普通程序自动产物按能力信封规则处理，不授予主动清理产物权限。
- `stateEffects`：edit=仅所列文件；generate/format=对应 L/稳定 allowlist；verify=测试正常产物与授权的前端运行状态；review/fan-in=仅返回结果；stage=仅 index；commit=仅当前分支本地提交；document=仅工作文档。
- `subdelegation`=false；主代理拥有拆分节点与下发最小信封的职责，子代理不继续委派。
- `specialApprovals/requiredApprovalIds`=[]；真实状态注入、可见窗口、项目外主动写入不在该空集合授权之内。
- `lifecycle`：节点启动时生效，完成、失败返回、撤销或基线失效时到期。`replanTriggers`：新目标/文件或副作用、产品语义改变、合同/资源或输入范围被证据推翻；只暂停受影响后继。
- `resourceLocks`：组文件按 canonical 路径 read/write 锁；格式化读取/写入 GUI，extraction 读 src 写两 catalog；测试读稳定 GUI 并独占该 GUI 的 runner/cache/端口；stage/commit 独占 canonical index，主代理为唯一 Git owner；执行记录独占单文件写锁。
- `verification`：行内 V 节点及第 5 节实际目标，要求正确收集且全部通过；审查基于稳定 diff。`deferralEvidence`=无；有冲突只按实际相交锁等待，资源释放即重算。
- `failureDomain`：本节点产物及其真实消费者和传递后继；共享输入失效才扩大。计划内失败按动态诊断→修正→再验证继续，不降低检查。

### 节点实例

下表 `Tn` 模板分别实例化 n=1、2、3；所有行均具有唯一 nodeId。列出的 dependency 同时声明 consumes，产出与 completionEvidence 在 outcome 中明确。

| nodeId / taskBoundary | operationKind / owner / estimatedCost | hardPredecessors 与原因 | writeSet / outcome 与 completionEvidence |
| --- | --- | --- | --- |
| D-stage / D0 | stage / 主代理 / 小 | 实施确认；检查两份文档与 ignore 状态 | index 仅本设计及本计划；staged diff/check 通过 |
| D-commit / D0 | commit / 主代理 / 小 | D-stage，消费精确文档 index | 独立本地文档 commit id；成功前不开始任何实现 |
| T1-C / T1 | edit / 合同实施代理 / 中 | D-commit，消费已提交设计/计划 | C 中暂停合同、唯一能力源与 fixture；稳定公共类型和源码 diff |
| T1-O / T1 | edit / owner 实施代理 / 大 | T1-C，消费暂停合同 | O 和对应 owner unit；关闭时不 dispose、队列冻结、旧请求结算及内容保留 |
| T1-U / T1 | edit / 页面实施代理 / 中 | T1-C，消费暂停合同 | U/E/F 的页面与直接 fixture；关闭说明、只读正文、输入挂载/retained 行为和相关测试 |
| T2-C / T2 | edit / 合同实施代理 / 中 | T1-commit，消费保留数据模型 | C 恢复接口、Bridge/lifecycle 手动重连；单轮控制稳定产物 |
| T2-O / T2 | edit / owner 实施代理 / 大 | T2-C，消费新恢复接口 | O/skills 与对应 unit；换绑、loaded 判定、单成员重新订阅、失败后再恢复 |
| T2-U / T2 | edit / 页面实施代理 / 中 | T2-C，消费恢复状态和动作 | U/E/F 与相关测试；全局按钮、诊断、单成员失败入口与成功结果 |
| T3-O / T3 | edit / owner 实施代理 / 中 | T2-commit，消费稳定单成员恢复 | collection/member 的 all-member 协调与隔离 unit；成员独立结果、不改变路由 |
| T3-U / T3 | edit / 页面实施代理 / 中 | T2-commit，消费已稳定恢复合同 | U/F 的路由意图及集合反馈与 Browser；当前任务不被晚到发布覆盖 |
| Tn-I / Tn | edit / 验收代理 / 中 | 本 Tn 的 O/U，消费稳定用户行为 | V/X 中本切片应用验收与 E2E；合法 fixture 驱动可验证场景，不另建平行 harness |
| Tn-G / Tn | generate / 主代理 / 小 | Tn-I 与该任务全部源码编辑稳定 | L；首次 extraction 的完整 diff |
| Tn-L / Tn | edit / 翻译代理 / 小 | Tn-G，消费新增消息 | L 新消息译文；既有翻译不改变，返回字段审查 |
| Tn-G2 / Tn | generate / 主代理 / 小 | Tn-L，消费补齐译文 | L；重复 extraction 稳定 |
| Tn-F / Tn | format / 主代理 / 小 | Tn-G2，全部写锁释放 | 稳定 allowlist；格式化 diff 无范围外变化 |
| Tn-R / 无提交 | review / 独立审查代理 / 中 | Tn-F，消费稳定完整切片 diff | 无写；检查 Spec/Standards、数据保留和命令隔离，返回证据 |
| Tn-V / 无提交 | verify / 主代理 / 中 | Tn-F，同一稳定输入 | 正常测试产物；ci + 本切片 Browser/E2E 证据，收集非零且通过 |
| Tn-J / 无提交 | fan-in / 主代理 / 小 | Tn-R、Tn-V 均通过 | 无写；组合 diff、覆盖与修正闭环，解锁 stage |
| Tn-stage / Tn | stage / 主代理 / 小 | Tn-J，消费组合证据 | index 仅该任务 allowlist，ignore 与 staged check 通过 |
| Tn-commit / Tn | commit / 主代理 / 小 | Tn-stage | 独立行为提交 id，禁止 amend/squash |
| V-final / 无提交 | verify / 主代理 / 中 | T3-commit，消费全部任务合并状态 | 最终 CI、有界 Browser/E2E；刚完成的相同稳定输入证据可复用，变化则失效重验 |
| V-real / 无提交 | verify / 主代理 / 中 | T3-commit + 合法真实环境/场景授权；不依赖 V-final 的输出 | Level 2 各场景证据，或明确记录受阻环境；与其他 runner 按资源锁调度 |
| R-final / 无提交 | review / 独立审查代理 / 中 | T3-commit，消费最终分支组合 diff | 无写；跨提交合同/最终单一路径、无遗漏任务的结论；可与 V-final 并行 |
| J-final / 无提交 | fan-in / 主代理 / 小 | V-final、R-final、V-real 的结果与计划内修正 | 完成或未验收范围明确；Level 2 未通过不能宣称完全验证 |
| D-report / D1 | edit / 主代理 / 小 | J-final 或明确环境检查点 | 新增 `docs/superpowers/reports/2026/09/09/2026-09-09-codex-gui-normal-close-recovery-execution.md`，记录节点、锁、失败/修正、提交与三级证据；不回写设计/计划 |
| D-report-stage / D1 | stage / 主代理 / 小 | D-report，文档检查通过 | index 仅执行记录 |
| D-report-commit / D1 | commit / 主代理 / 小 | D-report-stage | 独立本地报告 commit id |

各 O/U 节点对共享 contracts 的后续修改须由 C owner 发布新稳定产物，不能并发争写。O/U 内的 V 测试子集以对应目录归属划分，I 只改应用与 E2E 测试，不与 O/U 重叠。F 组的 AppActiveThreadSession/ThreadSwitch fixture 由 U owner 统一维护，I 消费稳定结果。

并行窗口的 `readSet` 明确收紧：O 读取稳定 C、O 及其 owner unit；U 读取稳定 C、U/E/F 及其呈现测试，跨边界只消费 C 发布的合同，不读取另一节点正在修改的实现。应用测试 I 在两者发布稳定产物后再读取组合实现。若某一节点确需读取对方尚未稳定的源码，暂停这一具体读取或发布必要稳定接口后重算，不以“允许读取完整 src”忽略读写冲突。

初始 ready set：实施确认后仅 D-stage；文档提交后 T1-C。每个 C 发布后 O/U fan-out；O/U 汇合后 I；格式化完成后 R/V fan-out，J 汇合。T3-O/U 直接消费 T2 的稳定合同，可以同时启动。共享源码写入期间不运行依赖它的测试或 review。

关键路径：文档提交 → T1 暂停/保留 → T2 单任务重连 → T3 集合恢复 → 最终验证/记录。T2 依赖 T1 数据 owner 不被销毁，T3 依赖 T2 的成员恢复事务，是真实产物依赖而非任务编号。任务提交拓扑 D0、T1、T2、T3、D1；无跨 worktree 集成或冲突解决命令。

独立只读审查可与验证读取同一冻结源码并行。CI、Browser 与 E2E 因同一工作树 runner/cache/端口串行执行；锁释放即推进，不因同一仓库阻止独立 O/U 编辑。每个节点形成信封时列出实际文件，禁止以整个 GUI 的写权限代替最小范围。

## 7. 执行纪律与完成条件

- 实施前先把本设计和本计划精确暂存为独立本地提交，检查文件未被 ignore。文档未提交不开始实现；不强制 add，不 amend、不 push/pull/fetch/remote。
- 每个任务提交只包含该切片行为及必要测试/本地化，不顺手重排代码。对已提交实现的修正创建新的独立提交；最终状态只保留一个权威来源和一条恢复实现路径。
- 验证失败先保存具体证据、更新动态节点与受影响证据，继续计划内根因修正。禁止删覆盖、放宽断言、关检查、跳过或篡改基线；新授权/产品结果变化才回对应门禁。
- 计划是稳定输入；运行状态、临时调度、失败域与新增修正只进入执行记录，由主代理唯一写入。子代理不能追加同一日志或操作 index。
- 全部切片与计划内修正完成、最终合并态通过适用验证才完成本计划。Level 2 缺口如实保留，不能以 mock 通过代替。完成后不根据新线索擅自再启动一轮修复。

## 8. 待用户确认

确认三个纵向任务的粒度、阻塞边和是否需要合并/拆分；确认本计划后才进入实施。当前 ticket 未发布，计划中的 `authorizationGate` 均未因文档落盘自动激活。

## 9. 计划审计记录

独立上下文按设计、计划与当前源码反向检查了 owner/旧命令捕获、普通草稿和 retained 编辑、直接 fixture、O/U 读写锁、真实依赖及授权边界。两项缺口已修订：补入两个 AppRouting controller fixture 和 Browser 收集范围；补入普通 staleRevision 草稿在导航卸载前交接及完整回归场景。修订后未发现其他计划级阻断。这是静态计划审计，不是产品测试或真实恢复验收。
