# Codex GUI 多会话激活设计

日期：2026-09-06

状态：用户已确认整体设计；正在编制实施计划，未开始代码修改。

源码基线：`dev`，`28be00cad`。本文的现状结论来自本次源码、提交及测试代码核查，不代表本次执行过测试或真实 GUI 验收。

## 1. 主目标与阶段关系

先让 GUI 同时保持多个会话并行运行，再实现新建会话。一次查看、操作一个会话，其他已激活会话保留各自运行状态并继续推进已提交的队列。

单会话持久化是在此前多会话讨论之后完成的前置能力。本设计以当前实现为基础，不把当时的内存队列状态当作现状，也不重新实现草稿序列化、队列持久化或发送结果恢复。

相关历史设计：[GUI 前端数据持久化设计](2026-09-06-codex-gui-frontend-persistence-design.md)。该文档保留当时阶段与事实；是否已实现以当前代码及提交为准，本轮不改写其历史内容。

本轮不实现新建会话、不开放 `thread/start`，不增加分屏、跨标签页协同、后端持久队列或浏览器关闭后继续推进前端队列的服务。此前新建会话的目录、入口、创建时机和草稿选择继续保留，但不作为本轮交付条件。

## 2. 已确认的产品行为

| 事项 | 决定 |
| --- | --- |
| 展示 | 一次查看、操作一个会话；其他会话保持后台运行与各自状态 |
| 切换入口 | 导航菜单列出已激活会话，显示标题、运行状态和当前查看标记 |
| 后台队列 | 按原有顺序与通道规则继续推进；某会话等待处理不阻塞其他会话 |
| 提醒 | 菜单入口及列表显示状态标记；不新增完成通知弹窗，不自动切换会话 |
| 刷新恢复 | 恢复激活列表和上次查看会话，重新获取各会话运行状态 |
| 排队消息 | 复用现有跨刷新持久化；恢复后统一先暂停，由用户逐会话检查后明确继续 |
| 发送结果未知 | 沿用正向证据核对；不自动重发，人工继续也不解除 unknown 的独立阻塞 |
| 完成后的列表 | 保留，直到用户手动移出 |
| 移出限制 | 运行中、有排队消息或待恢复事项时禁止移出；其他现有不可安全释放条件继续生效 |
| 移出的含义 | 结束该会话在当前 GUI 的驻留与订阅，不删除历史、不隐含停止或丢弃任务 |

已有会话的普通草稿沿用后来实现的跨刷新保存。队列编辑中未保存的内容、编辑弹层和临时能力不恢复。此前“新建页草稿刷新后不保留”适用于尚未实现的新建页，与已有会话草稿不是同一对象。

“后台”指当前 GUI 页面仍在运行、但该会话不是正在查看的会话。刷新、BFCache 恢复、连接丢失、浏览器暂停或关闭必须遵守已有恢复边界，不能被解释为持有永久后台执行服务。

## 3. 当前实现与实际缺口

### 3.1 已完成的持久化能力

当前历史包含以下提交：

- `ba4ab1a10`：浏览器持久存储与草稿序列化基础。
- `d0d5091e9`：队列事务、发送阶段和恢复状态持久化。
- `ef5b21020`：生产会话接线及恢复控制界面。
- `5ecab083d`：草稿、队列跨刷新测试覆盖。
- `28be00cad`：非安全 HTTP origin 的 UUID 生成修复。

`BrowserPersistenceStore` 使用 `sessionStorage`，按 `threadId` 定位记录，并校验 `authorizationContext`。`ComposerCoordinatorRecord` 保存队列、普通草稿、中断状态与失败中断目标。生产连接入口把 `BrowserAuthorizationSession.getPersistenceContext()` 传给 live session，再传给队列协调者。

恢复时，协调者先设置 `restoredPaused`，导入并核对持久记录；`ComposerPersistenceStatus` 提供 `Review and continue`。持久化失败阻止依赖保存的发送，unknown 消息不会自动重发。新授权上下文不自动消费旧业务记录。以上全部复用。

存储已经按会话隔离，不等于 GUI 已同时保有多个 live session。

### 3.2 当前仍存在的单会话假设

| 位置 | 当前事实 | 多会话影响 |
| --- | --- | --- |
| `activeThreadSession.ts` | 一个 `current`、一个 `candidate`；激活成功后 `previous.dispose()` 并 detach | 查看切换同时触发运行实例替换 |
| 同一控制器的通知与帧调度 | 只向 current/candidate 路由；一个 pending projection frame | 后台会话无法获得独立完整的事件处理与 flush |
| `activeThreadSessionReadModel.ts` | transition 只有 `sessionRevision` 和 `facts` | 空 facts 也会发布，无法从内容可靠推断归属 |
| `threadRuntimeSlice.ts`、`transcriptStateSlice.ts` | 单槽数据、全局 revision gate | 多实例 baseline 相互覆盖，局部 revision 相撞会丢更新 |
| `AppCapabilities` 与显示消费者 | Composer、标题、正文等读取单会话能力或读模型 | 必须共同绑定同一个查看对象，不能只改导航列表 |
| `browserAuthorizationSession.ts` | 保存一个 `activeThreadId` 与授权上下文 | 缺少激活集合的持久元数据 |
| `GuiHostConnectionBridge.tsx` | 启动与页面恢复处理单一控制器中的会话 | 恢复和暂停门禁必须覆盖集合中的所有实例 |

### 3.3 后端能力与边界

`ThreadProjectionManager` 已有 `threads: HashMap<ThreadId, ThreadEntry>` 和 `connection_index: HashMap<ConnectionId, HashSet<ThreadId>>`，同一连接可以拥有多个会话的投影订阅。

`thread/projection/detach` 只移除对应连接的订阅，不中断正在运行的 turn。空闲卸载还要求普通订阅、投影订阅均为空且线程非 Active。因此，本设计不需要新增“后端同时运行多个会话”的机制。

现有 GUI host 已放行 `thread/resume`、projection attach/detach、`turn/start`、`turn/steer`、`turn/interrupt`。本设计复用这些方法，不预设新增协议或放宽 allowlist。

当前 `guiHostClient` 对带 `id` 的服务端请求直接返回，没有 GUI 审批应答链。菜单可以根据权威 `ThreadStatus`/`ThreadActiveFlag` 标出等待审批等状态，但本设计不声称可在 GUI 内完成审批，也不增加审批请求转发、应答或新的权限流程。审批继续使用既有处理渠道；只有对应会话等待。

## 4. 会话归属与模块职责

区分三个概念：

- **已激活会话**：当前页面管理的会话成员，可处于运行、空闲、恢复暂停或失败状态。
- **当前查看会话**：唯一供当前任务页面展示及操作的成员；选择它不改变其他成员的存续。
- **后端运行状态**：来自后端事实，不能由“是否查看”“是否在列表”推导。

集合管理模块拥有成员、每个成员的初始化/释放过程、通知分发与当前查看选择。每个 live session 继续拥有自己的 projection、queue、compaction、skills、thread status 和恢复能力。集合管理器不接管单会话的发送、重试、unknown 判断或持久化事务。

对外操作应直接表达加入并查看、查看已有成员、读取列表、请求移出、处理连接/页面生命周期。具体命名在实施计划中确定；不创建单会话 owner 的泛化基类或第二套队列调度层。

对同一 `threadId` 只保留一个 live owner。同一会话的重复打开合并到已有初始化或实例；不同会话的初始化、发送和恢复互不依赖。查看切换只提交最新有效的用户查看意图，较早的异步打开完成不能抢回界面。

每个实例保留自己的 revision 与生命周期代次。view selection 的变化不得使其他会话的运行能力失效；旧页面上已经失效的按钮、编辑回调和旧订阅也不得被重绑定到新会话。

## 5. 共享读模型与后台事件处理

应用继续使用一个 Redux store。runtime/transcript 按 `threadId` 分槽，并记录能够区分该会话前后两次 live 实例的身份。每个槽独立检查 revision；transition 显式携带归属，即使 `facts` 为空也可准确路由。

live 对象、Promise、订阅、回调和能力句柄留在运行模块中，不放入 Redux。取消旧的单槽 `current` 权威结构，不保留“当前副本”和多会话副本双写。当前视图由选择标识与对应槽派生。

`ActiveThreadProjectionReadModelFact` 继续引用权威生成的 attach/event/delta 类型；前端 transition 只增加归属语义，不复制后端 DTO、协议字段或验证器。

所有已激活会话持续消费合法投影通知、状态失效和队列事实：

- 入站事件先按 `threadId` 找成员，再按订阅及实例身份接受；旧实例的迟到事件和回调不能更新新槽。
- 初始化中的通知仍按现有 attach cut/replay 规则处理，但缓存及候选状态归具体成员。
- delta flush 按实例调度与取消；切换查看对象不取消后台 flush。
- 终态事实与队列后继推进不依赖 Composer 或正文挂载，也不能只依赖当前可见视图的渲染帧。
- 单会话 projection closed 或存储失败只影响该成员；共享连接失效则使全部相关网络能力失效，按连接实际故障范围处理。
- `skills/changed` 对适用实例失效其缓存；`thread/status/changed` 只更新对应成员，不在切换时复用另一会话的目录或技能状态。

标题、document title、Composer、token usage、正文和当前任务链接绑定同一个查看身份与就绪状态。目标未就绪时展示该目标的加载/失败状态，不能把旧正文与新操作能力拼在一起。

正文只挂载当前查看会话。保留现有 chunk、page、fragment 与滚动定位边界；后台更新不重建无关会话的 chunk selector 结果，不把所有会话的历史展平用于菜单。菜单只消费必要的会话摘要。

## 6. 激活、查看与移出

### 6.1 激活入口

当前任务路由及历史详情的 `Continue this task` 使用同一个集合入口。历史只读浏览本身不激活会话。

打开已驻留成员只切换查看项，不重复 resume/attach，也不从存储重新导入其队列。打开未驻留会话沿现有 resume、attach、准备和持久数据恢复链建立一个成员；原成员继续运行。

此前“旧会话有排队消息就不能切换”的约束来自释放旧实例。本设计消除这个释放原因：普通查看切换不执行 release reservation，不因旧会话队列存在而阻止切换。相同的保护能力仍用于真正移出和释放，不能通过删检查实现多会话。

查看历史页面不停止任何激活成员，也不改变记住的当前查看会话。现有当前任务/历史路由继续使用；路由同步响应用户查看意图，后台状态更新不产生导航。

### 6.2 移出

移出前对目标成员核对后端运行状态，并复用队列 release readiness；运行中、排队、unknown、恢复批次、编辑管理操作、中断未决、保存失败及其他未完成的实例操作不能被移出动作丢弃。检查与释放之间保留实例身份和并发变更核验，不能只在按钮渲染时检查一次。

拒绝移出时说明该会话的具体原因，用户可以切到它完成、停止或处理剩余事项。移出不自动发送 interrupt，不清空队列，不自动丢弃草稿。

成功移出只释放目标实例及其投影、调度和读模型槽，保留该 thread 的持久草稿与历史。重新打开时复用正常恢复路径，不复活旧能力。

移出后台会话不改变当前页面。移出当前查看会话后，可落到该会话现有的只读历史详情，并清除已不在集合内的查看指向；不自动激活另一项。这样即使列表为空也有可继续阅读和重新打开的真实入口，无需新增空会话或目录选择功能。

移出或持久元数据保存失败时明确区分是否已释放；不得隐藏仍然受管的工作。detach 失败必须显示并限制对应成员的重复 attach，直到原清理结果得到处理，不能误把错误释放归到其他成员。

## 7. 激活集合的持久化与恢复

### 7.1 复用与新增数据

逐会话业务记录继续由现有 `BrowserPersistenceStore<ComposerCoordinatorRecord>` 与队列 owner 管理，保留当前 key、格式、授权隔离、原子保存和错误传播规则。

新增的只是激活成员 ID 集合及其稳定顺序的元数据。它由集合模块拥有，使用独立版本化记录和当前 `authorizationContext`；不将成员运行状态或业务队列塞入授权记录，不把集合伪装成一个虚假的 `threadId` 记录。

`BrowserAuthorizationSession.activeThreadId` 继续作为唯一持久“上次查看会话”来源。集合记录不再存一份可独立修改的 selected ID。标题、完成状态、订阅和完整 transcript 不持久化为第二套后端事实。

多个存储 key 不构成原子事务。成员加入先保存成员元数据，再提交查看指向；查看位置保存失败时保留已成功加入的成员并报告该失败。移出当前查看项先清除其恢复指向，再移除成员记录，失败时保留可追踪的中间状态，不能声称整组修改已原子成功。全过程使用显式阶段处理，避免崩溃恢复后指向已隐藏的运行实例。

读取不到新集合记录时，可以依据现有有效 `activeThreadId` 或当前任务路由建立初始成员；这保证已有单会话使用入口继续可用，不另建长期运行的旧/新集合两条路径。损坏、版本不支持或读取失败不等于没有记录，必须显式报告并保留原始数据。

### 7.2 恢复顺序与失败隔离

读取授权上下文和成员元数据后，按现有当前任务路由优先、否则保存的查看 ID 规则解析查看对象。路由指定但不在列表中的合法会话使用正常加入入口，不能被恢复过程重定向回旧查看项。

每个成员独立 resume/attach、构造 live 实例、读取业务记录并核对后端快照。查看成员的可用性不依赖其他所有成员恢复成功；后台恢复完成不抢占当前页面。

每个从持久记录恢复的队列都先建立 `restoredPaused`。核对完成仍不能自动发送，用户进入相应会话执行 `Review and continue` 后才解除该实例的恢复暂停。没有“查看过即同意”、全局统一继续或持久化的自动继续许可。

unknown、恢复批次及存储失败继续独立阻塞；当前会话的人工继续不能解除其他会话门禁。原页面中未重建实例的普通查看切换不属于刷新恢复，不反复暂停正常后台队列。

某成员恢复失败时保留其 ID 和可见错误，允许针对该成员重试；成功成员可以继续查看和操作。共享授权/连接失败需要统一失效网络能力，但不能删除各成员持久记录。

`pagehide`、BFCache 恢复、连接失效和组件清理覆盖全部成员及初始化实例，不只处理查看项。人工继续许可沿用当前规则失效，不因恢复了激活列表而跨页面重用。

sessionStorage 的页面会话保留期限、复制页可能获得初始副本、普通关闭后新开不主动恢复等边界原样保留。不新增跨标签页锁或共享所有权，也不承诺全局恰好一次发送。

## 8. 界面与反馈

沿用当前 HeroUI v3 `Drawer` 导航结构。会话选择及移出使用独立 `Button`，避免把移出按钮嵌进另一个按钮。选择项使用 `ghost`，重试等次要动作使用 `secondary`；移出不是删除历史，不使用暗示永久删除的危险文案。

列表提供标题、运行/等待/失败/完成状态、当前查看标记以及移出受限原因。菜单入口汇总后台状态，正文不显示后台会话内容。状态由权威运行事实与各队列恢复状态派生，不只用颜色表达，也不增加未经决策的未读通知系统。

沿用 `surface`、`foreground`、`muted`、`separator` 等语义 token 和现有标题截断规则。长列表在 Drawer 内滚动；窄容器下标题与状态可读，切换、移出、重试均可通过键盘到达，并保持焦点归属。

继续复用单会话保存失败、恢复暂停和 unknown 界面。后台会话的相应状态出现在列表，选择后才能在原归属下处理；不自动切换，不新增完成 toast。

所有新增用户文案遵循现有 Lingui 提取、翻译和上下文规则；本轮文档不生成 catalog。

## 9. 证据与影响面

以下路径相对项目根，符号以本节源码基线为准。

| 链路 | 当前证据 | 设计影响 |
| --- | --- | --- |
| 生产连接与页面生命周期 | `codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx` | 集合启动、连接失效、pagehide/pageshow 覆盖全部成员 |
| 激活与通知归属 | `codex-gui/src/features/activeThreadSession/activeThreadSession.ts` | current/candidate、全局 busy、通知与帧槽转为成员归属；查看与释放分离 |
| 单会话执行 | `codex-gui/src/features/activeThreadSession/liveActiveThreadSession.ts` | 保留 queue/projection/status/skills/compaction owner，仅调整归属接线和释放能力 |
| read model 发布 | `codex-gui/src/features/activeThreadSession/activeThreadSessionReadModel.ts` | 明确 thread 与实例归属，包括空 facts |
| runtime/transcript | `codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts`、`codex-gui/src/features/transcriptState/transcriptStateSlice.ts`、`codex-gui/src/features/transcriptState/transcriptProjection.ts` | 按会话分槽、局部 revision、定向 selector；保留 chunk 边界 |
| 视图消费者 | `codex-gui/src/App.tsx`、`codex-gui/src/features/appShell/AppCapabilities.ts`、`codex-gui/src/features/appShell/AppShellTopBar.tsx`、`codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx`、`codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx`、`codex-gui/src/features/documentTitle/DocumentTitleOwner.tsx` | 标题、正文、操作、URL 和滚动归属一致 |
| 历史入口与目录上下文 | `codex-gui/src/features/threadHistory/ContinueTaskAction.tsx`、`ThreadHistoryListPage.tsx`、`ThreadHistoryDetailPage.tsx` | 继续操作接入集合；保持历史只读入口和现有目录筛选语义 |
| 会话业务持久化 | `codex-gui/src/features/browserPersistence/browserPersistenceStore.ts`、`codex-gui/src/features/composerInputQueue/composerCoordinatorPersistence.ts`、`codex-gui/src/features/composerInputQueue/composerInputQueueCoordinator.ts` | 直接复用每会话记录及事务，不另建队列存储 |
| 查看位置与授权 | `codex-gui/src/features/browserLaunch/browserAuthorizationSession.ts` | 保留 activeThreadId 唯一性与 persistenceContext；新增成员元数据不复制 token |
| 服务端投影 | `codex-rs/app-server/src/thread_projection.rs`、`codex-rs/app-server/src/request_processors/thread_projection.rs`、`codex-rs/app-server/src/request_processors/thread_lifecycle.rs` | 已有多 thread 订阅及非终止 detach；真实集成仍需验证 |
| GUI 协议接入 | `codex-rs/gui-host/src/filter.rs`、`codex-gui/src/features/guiHost/guiHostClient.ts` | 复用当前 allowlist/生成解析；不把状态提示等同审批交互实现 |

权威协议仍来自 `codex-rs/app-server-protocol`，通过当前生成 TS 类型和验证器进入 GUI。新增会话集合、实例归属属于前端领域数据；不为它们复制协议 DTO，不关闭不兼容契约的生成/类型检查失败。

## 10. 设计验收条件

本节是结果要求，不是实施任务清单，也不是已运行的验证记录。

- 两个会话交错运行时，前后台各自收到文本、终态和状态变化；后台完成可推进其下一条已入队消息。
- 两个实例 revision 相同、空 facts 交错、同 thread 重新 attach、旧订阅迟到时不串会话、不丢合法更新。
- 在 A 有队列、unknown 或待恢复状态时可查看 B；A 的阻塞不能迁移给 B，也不能因切换而被解除。
- 后台 baseline、delta、保存失败和恢复不会替换当前正文、标题、输入框或停止按钮目标；切换中的旧回调不能操作新会话。
- 切换期间 pending flush 保持正确；后台更新不重建当前会话不相关 chunk 的 selector 结果。
- 历史只读浏览不激活、不释放成员；打开已有成员不重复 resume/attach，不触发持久队列重复导入。
- 刷新恢复多个成员、查看位置、各自普通草稿和队列；每个恢复队列都先暂停，单独人工继续，unknown 保持独立阻塞。
- 页面恢复/复制、授权上下文变化、损坏记录、保存失败、部分 attach 失败和共享连接失败保留现有错误传播及恢复边界。
- 成员元数据与查看指向保存中途失败或刷新时，不隐藏尚受管的任务，不产生第二个查看权威或静默重放。
- 完成后列表稳定；运行、排队、恢复和其他不安全释放状态禁止移出；成功移出只清理目标成员，保留历史与草稿。
- 菜单在窄组件容器、长标题和长列表中可滚动、键盘可达，当前标记和状态文字可被辅助技术识别。

现有回归入口包括 `activeThreadSession`/`liveActiveThreadSession` 测试、runtime/transcript 测试、`AppActiveThreadSession`/`AppRouting`/`AppShell` Browser 测试，以及 `composerCoordinatorPersistence.test.ts`、`composerInputQueuePersistence.test.ts`、`ComposerTurnControlPersistence.browser.test.tsx`、`e2e/persistence.spec.ts`。实施计划需把新增多会话场景映射到实际可收集入口，不能只复用单会话 fixture 声称多会话通过。

Level 1：需要自动化回归覆盖隔离、交错、队列、持久化及真实浏览器存储/交互。

Level 2：需要当前 Codex runtime 的无头验收，真实打开多个会话并验证后台推进、切换、刷新恢复与移出限制。mock E2E 不能替代该证据；本轮未执行。

Level 3：本设计没有依赖可见桌面或系统 IME 的新增行为，默认不适用；若后续证据改变适用性，另行取得当次可见窗口授权。不得用缺少 Level 2 为由打开可见浏览器。

## 11. 进入实施计划的边界

整体设计审阅后再编制实施计划。本轮只新增本文，不修改业务代码、历史设计、依赖或生成物，不暂存或提交。

计划前还需细化成员操作的持久提交/失败阶段、逐会话读模型所有消费者和实际测试入口，完成独立反向影响面审计；这些是本设计内的技术闭包，不另设用户实现机制选择题。

尤其不得把现有 release readiness 直接等同“可移出”：它原先服务于单会话切换，需要补足已确认的运行中不可移出条件，并核对 compaction、状态不确定和进行中操作。后台队列是否能够独立于可见帧推进也必须由实现链路与验证证明。

若后续证据要求新增后端协议、GUI 审批应答、跨标签页发送所有权、恢复自动续发或扩大浏览器保留期限，这会改变当前范围，应先回到对应产品决策；不能在本设计的“复用”名义下顺手加入。
