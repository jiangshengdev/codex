# Codex GUI 多会话激活实施计划

日期：2026-09-06

状态：计划已落盘，待用户确认执行。设计已确认；本轮仅进行只读调查与文档编辑，未实施、生成、运行测试或提交。

设计：[多会话激活设计](../../../../specs/2026/09/06/2026-09-06-codex-gui-multi-session-activation-design.md)。路径以本文所在目录解析；源码路径以下均相对 `/Users/jiangsheng/cnb/codex`。

基线：`dev`，`28be00cad631657a499b21c5c5bee4b600b35a83`。计划调查时仅本次设计为未跟踪文件，Git index 无已暂存变更；执行前重新核验。

## 1. 目标、授权与提交范围

实现已确认的多会话持续驻留：单一查看界面、导航菜单切换、后台队列推进、按会话状态提醒、刷新恢复集合、完成后手动移出，以及运行/排队/待恢复时禁止移出。

直接复用当前单会话持久化。每个恢复队列仍须人工 `Review and continue`；unknown 不自动重发，未提交的普通草稿与队列临时编辑继续遵循各自现有规则。

不实现新建会话、分屏、GUI 审批应答、后端 QueueStore、跨标签页协调、关闭浏览器后的前端调度或自动解除恢复暂停。不改变 Rust 协议、依赖、锁文件、构建配置、单会话持久格式及保留期限。

本计划确认执行后，授权先独立本地提交本设计与本计划，再完成本文限定的代码修改、生成、验证、必要修正及独立行为提交。现在的“落盘计划”不激活这些操作。

代码属于一个完整的行为任务 `T-multi-session`，由多个有界节点组成，最终一个行为提交汇合。原因是替换同一会话权威及其读模型/消费者，避免为中间提交增加旧新并存路径；不要求中间节点满足最终类型检查。文档提交与行为提交分开；不安排纯位置重排，已有提交的后续修正另建提交，禁止 amend/squash。

执行上下文为当前工作树和 `dev` 分支，无 worktree/branch 创建动作，精确 worktree 创建授权为空。各编辑节点共享工作树、按文件集合加锁，Git index `/Users/jiangsheng/cnb/codex/.git/index` 仅主代理可写。不进行任何 Git 远程或 force 操作。

## 2. 计划前证据闭包

| 字段 | 当前证据与结论 |
| --- | --- |
| 权威入口 | `GuiHostConnectionBridge` 创建控制器并接入通知和 pagehide/pageshow；`ActiveThreadSession` 激活与释放；`LiveActiveThreadSession` 持有 projection/queue/status/skills/compaction；`BrowserAuthorizationSession` 拥有恢复查看 ID |
| 已追踪链路 | current/candidate 通知路由与帧调度 → live transition → runtime/transcript slice → 正文、标题、Composer、滚动及历史目录；逐会话持久化 → 快照核对 → 人工恢复；移出 → queue release readiness 与状态刷新 |
| 修改范围 | 集合元数据及其 owner、实例归属合同、分槽读模型、集合生命周期、生产路由/显示接线、菜单及相关测试、两个 Lingui catalog；不复制单会话业务存储 |
| 验证映射 | 现有 runtime/transcript/activeThreadSession 单测，单会话 persistence 回归，App/Composer/历史/标题/滚动 Browser 测试，新增多会话真实 reload 的 mock E2E，最终真实 runtime 无头验收 |
| 排除项 | `ThreadProjectionManager.connection_index` 已为 connection→thread 集合；detach 不停止 turn；现有 GUI allowlist 足够。历史 `threadHistoryDetailOwner` 单独构造只读 transcript，不属于 live 槽。协议生成源与验证器只核对、不修改 |
| 剩余未知 | 当前当次真实 GUI URL、专用验收会话与服务资产是否对应最终源码，需执行时取得；只阻塞 Level 2 及完成声明。无未决产品选择；成员失败阶段、provider 层级和消费者范围按下节方案实现并验证 |

独立源码调查补入以下容易遗漏的事实：

- `TranscriptReadContext.ts` 直接使用 `fixedState ?? state.transcriptState`；必须定向 live 槽，同时保留历史 fixedState 路径。
- `useCommittedTranscriptStickyBottom.ts` 直接订阅全局滚动信号；后台槽变化不能移动当前页面。
- `router.tsx` 通过 `InnerWrap: DocumentTitleOwner` 挂载标题，位于 `App.tsx` 内的能力 Provider 外侧。标题使用当前任务路由的 threadId 查询同一槽，目标未就绪时保持现有标题回退；不直接调用下层 Provider hook，不另建标题会话权威。
- live 的空 facts transition 也增加 revision；归属不能从 facts 推断。历史 leaf `TranscriptState` 与 selectors 是合法单 transcript 模型，不改造成集合。
- release readiness 当前只询问 queue，并不证明后端无运行 turn；移出需要独立的最新状态及 compaction/进行中操作检查。
- live 的合法事件会同步 flush 并送入队列；保留这条终态推进链。delta 的合帧改为每实例调度，不让后台后继依赖可见页面渲染。

## 3. 稳定接口与实现约束

### 3.1 成员元数据与查看指向

新增 `features/sessionCollection` 作为成员元数据及集合专用领域代码的位置。记录只有版本、当前授权上下文、去重后的成员 ID 与稳定顺序；不包含 token、标题、运行状态、queue 或 selected ID。使用独立 sessionStorage key，由本模块校验；不伪造 threadId 复用逐会话记录 key，不扩展公共存储层为会话 owner。

`BrowserAuthorizationSession.activeThreadId` 仍是唯一持久查看位置，内存选择由集合 owner 管理，Redux 仅保存其发布的可序列化视图事实。路由、标题和 UI 都不能独立改写另一份持久 selected 字段。

元数据读取区分不存在、授权上下文不匹配、损坏、不支持版本和存储不可读。不存在时以现有有效恢复 ID/任务路由初始化；错误保留数据并显式报告，不能当作空集合。不同授权上下文不消费旧成员或业务数据。

加入先持久化成员资格，再初始化/提交查看指向。保存失败不报告加入成功；初始化失败保留成员错误和重试入口。查看指向保存失败保留已成功加入的成员和可解释的当前内存状态，提示刷新恢复位置尚未保存。

移出保持成员元数据直到 detach 结果明确；移出当前查看项先清除恢复指向，再处理目标订阅和成员移除。不同 key 不是事务，不使用“原子保存集合与查看”承诺。失败阶段留在内存操作结果中，持久记录始终保留足够的成员资格供刷新后恢复；不增加第二套持久运行状态。

detach 未确认时，该成员进入清理未决状态，保留列表错误与重试，不允许同时对它开启新 attach。成功 detach 但成员保存失败时继续显示该成员的未完成移出状态；刷新按仍存在的成员恢复并走人工暂停，不自动重放任务。最终持久移除成功后才发布移出完成并释放对应槽。所有阶段不得吞掉存储或网络失败。

### 3.2 实例归属与读模型

在现有 `activeThreadSession` 合同 owner 定义前端 live 实例身份：threadId 加能区分同一 thread 前后实例的代次/标识。transition 显式携带该身份、局部 revision 和原有 facts；单独定义建槽/移槽的事件语义，旧代次不能因 revision 较大重新占槽。

`threadRuntime` 与 `transcriptState` 在单一 Redux store 中按成员分槽；每槽独立 revision gate。保留单 transcript leaf 类型、构造器与 `FromTranscriptState` selectors，历史 fixedState 继续使用它们。当前 live 读取通过查看 thread 与有效实例定位；不保留单槽副本双写。

稳定接口由合同节点先提供，读模型节点与运行 owner 节点可分别消费；不得在接口缺口处加 temporary adapter、fallback 或兼容双读。具体源文件重命名没有产品必要性，不安排；若确需移动使用 `git mv`，并遵守行为/纯重排提交隔离。

### 3.3 生命周期与资源释放

集合 owner 持有成员→live/初始化/失败状态的映射、当前查看意图及逐实例帧句柄。对同 thread 去重初始化，不以全局 busy 阻塞无关成员。较早打开请求完成不能覆盖较新的查看意图，但已明确加入的成员仍留在集合。

普通查看只切换视图，不调用旧成员 `reserveRelease`、dispose 或 detach。每个 live 保留自身 queue/projection/status/skills/compaction 与单会话恢复策略。命令及编辑能力绑定 thread/实例/revision，旧 UI 回调不重定向到新查看项。

投影通知按 threadId、subscriptionId、live 代次路由；初始化中的缓冲、状态失效和 replay 归各成员。每实例 flush 独立，终态按当前同步事件链驱动队列。skills 广播失效作用于适用成员，单 thread status 仅触达该成员。

移出前先刷新并等待目标状态核对，状态未知或 active、存在 activeTurn、compaction/队列/中断/管理/持久失败等不安全操作时拒绝。沿用 reservation 和实例版本检查防止本页面内检查到释放之间的变更；发现新事件使前提失效则终止该次释放并保留成员。当前协议没有与其他客户端共同执行的原子“确认空闲并禁止新 turn”操作，不宣称跨客户端互斥；detach 本身也不取消其他客户端后来启动的任务。

移出后台成员不导航；移出查看成员清除查看指向，转到其现有历史详情，不自动激活他项。历史列表仍使用现有查看目录语义；集合为空时保留现有上下文不可用提示，历史详情和继续入口仍可用，不新增目录选择。

### 3.4 恢复与 UI

启动任务路由优先，否则使用保存的查看 ID；恢复成员独立就绪，单个失败不阻塞其他成员。每个读取持久业务记录的实例都先暂停，核对与人工继续按现有 owner 实施；当前会话人工继续不解除后台会话 gate。

pagehide、BFCache pageshow、共享连接失效和最终卸载覆盖全部成员及初始化实例。刷新期间不删除各 thread 业务记录；普通切换不重导入队列或使有效的后台继续许可失效。

菜单沿用 HeroUI `Drawer`、`Button`，选择 `ghost`、重试 `secondary`，语义 token 沿用 surface/foreground/muted/separator。移出独立按钮不嵌套进选择按钮；显示禁止原因与可访问状态。仅菜单及列表标记，无新 toast 或自动导航。

标题用路由 thread 对应 runtime 槽；正文/Composer/停止目标/用量绑定同一就绪查看快照。目标加载失败时不得混用旧内容。sticky-bottom 重置与视图身份一致，后台更新不触发当前滚动；不新增跨刷新滚动位置持久化。

## 4. 读写集合与范围

以下是允许的功能边界，不要求无差别修改目录内每个文件。每节点先列其实际逐文件集合，最终 stage 只用实际差异。

| 集合 | 文件或目录 |
| --- | --- |
| W-meta | 新增 `codex-gui/src/features/sessionCollection/**`，限集合元数据、相关错误/校验与其测试；运行调度仍由 W-owner 完成 |
| W-contract | `codex-gui/src/features/activeThreadSession/activeThreadSessionReadModel.ts`、`activeThreadSessionContracts.ts` 及该目录新增实例身份合同文件与直接合同测试 |
| W-model | `codex-gui/src/features/threadRuntime/**`、`codex-gui/src/features/transcriptState/**`；限分槽、归属 gate、selector 与相关测试；保留 leaf 语义 |
| W-owner | `codex-gui/src/features/activeThreadSession/**`，排除已稳定 W-contract；限集合生命周期/通知/恢复/释放与 live 接线及其测试 |
| W-ui | `codex-gui/src/App.tsx`；`src/features/appShell/**`、`currentTask/**`、`documentTitle/**`、`composerTurnControl/**`、`threadHistory/**`；`committedTranscriptSurface/CommittedTranscriptSurface.tsx`、`TranscriptReadContext.ts`、`TranscriptReadProvider.tsx` 及相关展示测试 |
| W-fixtures | `codex-gui/src/__tests__/**`、上述 feature 的 `__tests__/**`；`src/features/projection/__tests__/projectionFixtures.ts`、`projectionTestBuilders.ts`，仅扩展共享合法多会话 fixture，不手写协议替身 |
| W-e2e | 新增 `codex-gui/e2e/multiSession.spec.ts`、`multiSessionHarness.ts`，现有 `persistence.spec.ts`/`persistenceHarness.ts` 仅在共享入口实际变化时适配 |
| W-catalog | `codex-gui/src/locales/en.po`、`zh-CN.po` |
| W-doc | 本设计、本计划；执行后独立记录 `docs/superpowers/research/2026/09/06/2026-09-06-codex-gui-multi-session-activation-execution.md` |

固定只读输入：`src/app/store.ts`、`main.tsx`、`router.tsx`、`routerComponents.tsx`、`browserLaunch/**`、`browserPersistence/**`、`composerEditor/**`、`composerInputQueue/**`、`projection/**`、`guiHost/**`、`generated/**`、package/TS/Vite/Vitest/Playwright/Lingui 配置和 Rust 协议/GUI host 对应代码。标题按路由读取，保持现有 provider 层级，因而不预设修改 router/main。

W-contract、W-model、W-owner 各自拥有直接单测；生产 UI 与相关 Browser harness 的调整由 W-ui 汇合节点统一持有，避免两个代理同时修改共享 harness。生成与格式化不由编辑子代理自行执行。

没有 Rust、协议生成器、schema、依赖或锁文件写授权。没有以“适配”为名改写单会话发送策略的授权；发现必须扩大这些边界时返回新证据。

## 5. 验证入口与预检

已读取 `package.json`、`.github/workflows/codex-gui.yml`、Vitest shared/parallel/sequential/smoke 配置、Playwright 配置及 Lingui 配置。CI quick 调用 `pnpm run ci`，其中格式检查为 oxfmt；本计划拆用其实际检查入口以限定验证并避免自动全目录 fix。

当前 Node 为用户 fnm 的 v24.17.0，pnpm 为同目录的 10.34.5；Vitest 4.1.11。通过项目声明的 `@playwright/test` 解析到的 chromium/firefox/webkit 二进制路径均存在。本轮只做版本、帮助与文件存在性预检，没有启动浏览器或执行测试。执行前重新核验工具、来源、生成输入与测试收集；不安装任何组件。

下列命令 cwd 均为 `/Users/jiangsheng/cnb/codex/codex-gui`，使用 `/opt/homebrew/bin/fnm exec --using-file`。命令输出的实际收集文件、案例数和结果是通过证据，零收集不能通过。

### 5.1 非修复检查

```sh
/opt/homebrew/bin/fnm exec --using-file pnpm run protocol:check-validators
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
/opt/homebrew/bin/fnm exec --using-file pnpm run lint
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

本任务纯前端与 Markdown，不触发 `just fmt`。`format:oxfmt:fix` 内含 `.`，不能通过追加文件参数缩窄；格式化节点使用已核验 PATH 语法的 `pnpm exec oxfmt --write`，逐个传入实际变更文件且列表不得为空，不传 `.`。随后运行非 fix 检查。lint 若发现可由现有自动修复器安全限定修正的问题，先按实际文件调用该工具并核对 diff，不先手写模拟格式化。

### 5.2 单测与 Browser 回归

```sh
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit src/features/sessionCollection src/features/activeThreadSession src/features/threadRuntime src/features/transcriptState src/features/browserLaunch src/features/browserPersistence src/features/composerInputQueue src/features/composerTurnControl src/features/documentTitle src/features/threadHistory
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:parallel src/features/appShell src/features/currentTask src/features/committedTranscriptSurface src/features/composerTurnControl src/features/documentTitle src/features/threadHistory src/__tests__/App src/__tests__/smoke
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:sequential src/__tests__/sequential
PLAYWRIGHT_HTML_OPEN=never /opt/homebrew/bin/fnm exec --using-file pnpm run test:e2e e2e/multiSession.spec.ts e2e/persistence.spec.ts
```

W-meta 与新 E2E 是计划产物，当前不存在；仅在对应节点创建稳定文件后执行。unit 排除 browser/E2E；parallel 排除 sequential，均 watch=false；Browser 与 Playwright 配置均 headless=true，Browser 保留现有三个引擎。这是在当前 macOS 上执行既有引擎配置，不增加其他操作系统验收。

sequential 覆盖导航/历史/Composer 焦点、视口、分页以及直接消费读模型的 subagent 场景。现有直接构造根 state/action 的 transcript/runtime、App projection、smoke 及共享 harness 测试必须迁移真实形状，不能维持测试专用旧单槽入口。

E2E 沿用项目 Playwright webServer，非 CI 使用 `pnpm run dev` 的 5173 端口。执行前确认复用服务属于当前源码和配置；不接管未知占用进程、不杀用户服务。测试使用 WebSocket mock 和浏览器真实 sessionStorage/reload，不能称为真实 Codex 集成。

### 5.3 Level 2 与结果要求

Level 2 消费最终稳定代码、当前实际 Codex runtime 和当次完整 GUI URL，在无头浏览器中通过历史入口打开至少两个专用验收会话。测试消息仅用于受控验证，不要求修改仓库文件，不操作用户在用任务或向他人发送消息。验证后台队列推进、交错输出、切换不 detach、状态提醒、刷新后各自暂停及人工继续、运行时禁止移出与空闲成功移出。

执行时经可用 `/gui`/`launch_gui` 入口取得或由用户提供完整 URL，不拼接或复用历史 token。当前未取得该 URL，也未确认最终源码资产已由实际服务加载；此缺口只阻塞 Level 2 和最终行为提交/完成声明，其他无依赖节点继续。需要后端构建时只能由用户执行；没有当前运行证据不得以 mock 结果替代。

Level 3 默认不适用。不得为验收打开 headed 浏览器、DevTools 或报告；如出现依赖可见桌面的新证据，单独请求当次窗口授权。

关键断言包括同 revision/空 facts/旧代次隔离、后台更新不触发当前正文重建或滚动、history fixedState 不被覆盖、较晚查看意图胜出、未就绪目标无旧操作对象、单成员失败隔离、成员元数据各失败窗口、全部页面恢复门禁与移出竞态。旧队列持久化回归必须继续成立。

## 6. Lingui 生成边界

权威入口为 `pnpm run messages:extract`；`lingui.config.ts` 的输入是 `src`（排除截图和 traces），source locale 为 en，完整输出为 W-catalog 两个文件。只允许人工补充本次新增或语义改变消息的 en/zh-CN 翻译，保存既有翻译。

新增移出、等待、恢复提示采用 Lingui macros，短操作名称补充准确 translator comment，明确移出不删除历史。首次 extraction 后审查完整 diff，区分 references、comment、msgid、msgstr、fuzzy/obsolete；位置元数据仅在来源正确且同入口稳定时接受。补译后再次 extraction 验证稳定，不手工回写旧行号塑造 diff。

不执行 `messages:extract:clean`。输出越界、意外语义/状态漂移或重复提取不稳定时暂停 catalog 后继，保留其他独立节点；先诊断计划内原因，不放宽检查。协议 validators 本轮只执行 check，没有生成或手工修改授权。

## 7. 描述式执行 DAG

### 7.1 公共字段

下列默认值明确适用于每个节点，节点表给出差异；二者共同组成完整节点记录。

- `taskBoundary`：D 为无提交授权节点，C-doc 为独立文档提交；其余编辑/生成/格式/验证节点归 `T-multi-session`；R 为无提交独立审查，C-code 为任务提交。
- `executionContext`：当前工作树 `/Users/jiangsheng/cnb/codex`、`dev`、唯一 `/Users/jiangsheng/cnb/codex/.git/index`；无 worktree 预配。
- `owner`：K/M/RM/O/U/E 为各有界编辑节点的负责人；C-doc、G、TR、GS、F、各 V、L、C-code 的工具/生成/Git 由主代理执行；R 由未参与编辑的独立只读代理执行。主代理协调并更新执行记录。
- `operationKind`、`outcome`、`estimatedCost`、`hardPredecessors`、`consumes`、`produces`：节点表定义；成本只作粗粒度调度提示。
- `readSet`：已确认设计/计划、适用 AGENTS/skills、节点表实际 consumes 的文件与所需稳定合同；不默认读取其他并行节点正在修改的集合。只读公共工具配置稳定。间接读取新增冲突时按实际 canonical 文件锁等待。
- `writeSet`：节点表限定，编辑节点不写 index；验证节点没有主动源码写集合。
- `stateEffects`：编辑修改对应文件；生成修改 W-catalog；格式化限实际变更文件；验证允许项目工具正常产生缓存/报告/进程状态；执行记录仅主代理写。实际 GUI 验收仅操作当次专用测试会话。
- `commandScope`：编辑用源码内容 patch，无测试/生成/格式/Git；对应专门节点使用第 5、6 节入口。只读核对使用 rg/cat/sed/nl、git status/diff/log/show。Git 节点仅逐文件 add、cached diff/check、普通 commit。禁止安装、后端构建、远程、force、amend。
- `subdelegation`：false。
- `resourceLocks`：每个实际源码 readSet 为读锁，writeSet 为写锁；主代理独占真实 index；W-catalog 提取/补译独占输出且读 src；格式化与其读取/写入的源码互斥。验证工具的 canonical 资源及模式见第 7.3 节，不能只依据 runner 名称判断隔离。
- `deferralEvidence`：无。真实锁冲突只阻止同时运行，不新增编号依赖；需要暂缓时记录收益、具体冲突成本、复查点与失效条件。
- `completionEvidence`：编辑为真实可审查稳定 diff 与合同；生成为完整分类 diff 及重复稳定；验证为目标收集/退出/断言证据；提交为精确 staged allowlist 和 commit ID。口头完成不能解锁。
- `verification`：编辑节点消费后续组合验证，不能以局部验证替代；每项实际入口及通过条件见第 5、6 节。
- `failureDomain`：本节点产物及实际消费它的后继；共享连接/配置失效按真实范围扩大，不无条件扩展全图。
- `replanTriggers`：新产品语义、后端/权限/持久化边界变化、范围外修改、源身份/测试入口失真或工具缺失；计划内修正先进入动态诊断与修正节点，不默认停止。
- `authorizationGate`：当前全部 pending；用户确认执行后，按 action-authorization 为节点建立包含上述范围的最小能力信封并激活。节点完成/撤销后能力到期。落盘本计划不执行 D 后继。

### 7.2 节点记录

| nodeId / operationKind | outcome / estimatedCost | hardPredecessors、consumes | writeSet、produces 与完成证据 |
| --- | --- | --- | --- |
| D / 授权 | 取得计划执行授权，短 | 无图内前置；消费用户明确执行确认及完整计划 | 无源码写；中央授权记录 |
| C-doc / commit | 独立提交已确认设计与计划，短 | D；消费两份文档、当前状态/ignore/index 检查 | 两份文件与 index；文档 commit ID |
| K / 编辑 | 发布实例归属及分槽生命周期合同，短 | C-doc；消费现有 live/projection/readModel 合同 | W-contract；稳定新 transition/实例/建移槽合同与直接测试，不加兼容入口 |
| M / 编辑 | 成员元数据存储与故障行为，中 | C-doc；消费现有 browserLaunch 授权上下文、sessionStorage 语义 | W-meta；合法成员读写、错误隔离、稳定顺序与测试 |
| RM / 编辑 | runtime/transcript 分槽，中 | K；消费明确实例合同、现有 leaf 模型 | W-model；每槽 gate、显式 selectors、旧代次隔离及单测 |
| O / 编辑 | 多 live 集合与通知/恢复/移出，长 | K、M；消费实例合同、成员存储、既有 live/queue/status 功能 | W-owner；后台实例独立、逐成员帧/恢复/释放阶段及对应测试 |
| U / 编辑 | 统一查看接线与菜单，长 | RM、O；消费稳定分槽 selectors、集合操作与快照 | W-ui、W-fixtures；真实 Router 挂载、history 固定状态、滚动、操作目标、菜单及 Browser 回归 |
| E / 编辑 | 多会话 reload E2E，中 | U；消费完整 UI/集合行为 | W-e2e；双会话 mock 网络与真实存储/reload 场景 |
| G / 生成 | 首次提取 UI 消息，短 | U；消费稳定 src 消息 | W-catalog；完整 extraction 分类 diff |
| TR / 编辑 | 补齐新增翻译，短 | G；消费已核对 message identity/context | W-catalog；仅允许的翻译变更 |
| GS / 生成 | 二次提取稳定，短 | TR；消费补译后 catalogs 和同一 src | W-catalog；再次 extraction 稳定 |
| F / 格式化 | 限实际文件格式化，短 | E、GS；消费已汇合实现/测试/catalog | 实际行为 allowlist；oxfmt 有界输出与非 fix 检查 |
| V-static / 验证 | validators/格式/lint/types，中 | F；消费稳定组合源码 | 无主动源码写；第 5.1 节全部通过 |
| V-unit / 验证 | 组合单测，中 | F；消费全部相关源码及测试 | 无主动源码写；第 5.2 节 unit 实际收集通过 |
| V-browser / 验证 | parallel/sequential Browser，中 | F；消费稳定源码/测试/配置 | 无主动源码写；两个 Browser 入口实际收集通过 |
| V-e2e / 验证 | 多会话及持久化 E2E，中 | F；消费稳定实现、专用 mock harness、当前 dev 资产 | 无主动源码写；两个 spec 的实际 reload/网络断言通过 |
| R / 审查 | 独立反向行为/范围审阅，中 | F；消费稳定完整 diff、设计/计划及证据映射，不等待无依赖 runner | 无写；具体发现及证据；若读取最终测试结果则在 fan-in 补核 |
| L / 验证 | 真实 runtime Level 2，中 | F；消费最终实现及当次真实 URL/runtime/专用会话 | 无主动源码写；真实多会话场景证据，URL 缺口仅暂停本节点 |
| C-code / commit | 提交完整多会话行为，短 | V-static、V-unit、V-browser、V-e2e、R、L 和动态修正闭环；消费最终稳定产物 | 实际行为 allowlist、index；独立行为 commit ID |

文档提交后的初始 ready set 为 K、M。K 完成即解锁 RM；K/M 完成即解锁 O。RM 与 O 消费 K 的稳定合同，写集合不相交，可同时推进；两者不读取对方未完成的实现，类型与生产接线在 U 汇合。若实际需要交叉读取，以具体资源锁或新稳定产物边记录，不能偷偷假定“可并行”。

U 消费二者结果；E 与 G 在 U 完成后分别编辑 e2e 与提取 src，读写不相交。E/GS 的稳定结果汇合到 F。F 后审查、静态/单测/Browser/E2E、真实 runtime 可按实际资源锁调度，不把 V-static 通过当作其他节点的虚假依赖；同 package 的冲突 runner 等待锁。

粗粒度关键路径为 D、C-doc、K/M 较长分支、RM/O 较长分支、U、E/GS 较长分支、F、适用验证/审查较长分支、C-code。只有全部验证与独立审查、动态修正完成才形成最终 fan-in。

### 7.3 验证资源的 canonical 身份

以下目录均已核验为当前工作树的实际目录。执行前按工具真实解析路径重新检查，不把版本变化后的旧路径当作新资源身份。

| 资源 | 访问模式与节点 |
| --- | --- |
| `/Users/jiangsheng/cnb/codex/codex-gui/node_modules/.tmp/tsconfig.node.tsbuildinfo` | V-static 类型检查 read/write |
| `/Users/jiangsheng/cnb/codex/codex-gui/node_modules/.tmp/tsconfig.app.tsbuildinfo` | V-static 类型检查 read/write |
| `/Users/jiangsheng/cnb/codex/codex-gui/node_modules/.tmp/tsconfig.vitest.tsbuildinfo` | V-static 类型检查 read/write |
| `/Users/jiangsheng/cnb/codex/codex-gui/node_modules/.tmp/tsconfig.vitest.browser.tsbuildinfo` | V-static 类型检查 read/write |
| `/Users/jiangsheng/cnb/codex/codex-gui/node_modules/.tmp/tsconfig.e2e.tsbuildinfo` | V-static 类型检查 read/write，输入为 `e2e/tsconfig.json` |
| `/Users/jiangsheng/cnb/codex/codex-gui/node_modules/.pnpm/vitest@4.1.11_@types+node@24.13.3_@vitest+browser-playwright@4.1.11_vite@8.2.2_@types+n_b658e750479b3720f9393a885cd94d90/node_modules/vitest/dist/tsconfig.tmp.tsbuildinfo` | V-unit/V-browser typecheck read/write；按当前安装的 Vitest dist 解析，不猜测使用项目 build-info |
| `/Users/jiangsheng/cnb/codex/codex-gui/node_modules/.vite`（包含 Vitest 缓存子目录） | V-unit/V-browser、V-e2e 的 Vite 服务 read/write；相交进程不可同时占用同一写资源 |
| `/Users/jiangsheng/cnb/codex/codex-gui/node_modules/.vite-temp` | 使用 Vite 默认配置加载器的上述入口 read/write |
| `/Users/jiangsheng/cnb/codex/codex-gui/.eslintcache` | V-static 的 ESLint read/write |
| `/Users/jiangsheng/cnb/codex/codex-gui/test-results`、`/Users/jiangsheng/cnb/codex/codex-gui/playwright-report` | V-e2e write |
| 当前工作树 Vite 服务 `127.0.0.1:5173` | V-e2e 启停/复用需独占服务管理；服务所属源码必须核实。仅复用已核实服务时不取得停止其他 owner 服务的能力 |

当前安装的 Vitest typechecker 显式传入 `--tsBuildInfoFile`，因此没有证据证明其写入 V-static 的五个项目 build-info；二者不因“都做类型检查”而增加互斥关系。V-unit 与 V-browser 的临时 build-info，以及各 Vite 入口的缓存才是已确认的冲突。后续实测出现其他共享资源时按新证据更新锁。

Level 2 执行前列出实际 browser session、专用 thread ID、资产服务和报告目录，逐项登记 canonical read/write 身份；未取得这些参数时 L 保持等待。若资产服务复用上述 Vite，按同一资源处理，不因标成 Level 2 就视为隔离。

## 8. 执行记录、提交与失败闭环

执行确认后先从实际状态核对设计/计划 ignore，再逐文件暂存两份文档，检查 `git diff --cached --check` 和完整 staged diff，建立独立本地文档提交。文档无法提交时禁止开始实现，不强制暂存 ignored 文件。

执行记录使用 W-doc 中独立 research 路径，仅在执行授权后创建，由主代理记录节点、稳定产物、锁、实际并行、失败与动态修正；不把已确认计划正文当运行日志，也不强制提交被忽略的记录。

最终 Git owner 从当前完整 diff 建立实际代码/测试/catalog allowlist，逐文件 `git add -- <已核实文件>`，检查 staged diff 与 whitespace 后普通本地 commit，不收取无关文件。禁止把行为修改和无行为的 import/声明重排混在同一提交。

节点失败是新证据，先限制实际失败域，继续在计划内诊断、修正并重跑受影响验证；不要重跑已经稳定且无关的检查。不放宽断言、丢弃覆盖、隐藏错误或新增豁免。需要新增写范围、后端能力、产品改变或缺失工具时，记录精确缺口并仅暂停相关后继。

共享源码被修正后，R 和相应验证必须消费新稳定状态；旧结果不代表新 diff。无依赖分支继续，禁止因等一个会话 URL 或一个 runner 而暂停全部工作。

完成条件是完整行为提交、所有计划内修正、Level 1 与 Level 2 证据及独立审查均闭合；Level 3 默认不适用。最终报告实际并行、关键路径、未启动 ready 节点及原因、提交 ID 和各验收等级，不把文档落盘或 mock 通过称为实现完成。
