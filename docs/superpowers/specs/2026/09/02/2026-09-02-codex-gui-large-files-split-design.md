# Codex GUI 大文件拆分设计

## 状态

- 设计状态：已确认
- 确认日期：2026-09-02
- 日期：2026-09-02
- 当前分支：`dev`
- 设计基线：`901746c28fea89eba071489da51de5173bec47be`
- 候选报告：`codex-gui/.reports/large-files.md`
- 报告生成时间：`2026-09-02T04:04:45.396Z`

本文只定义当前大文件候选的职责判断、Module seam、owner、不变量和分批边界，不是
implementation plan，不定义任务提交、精确执行命令或 worktree，也不授权修改 production、测试、
生成物、Git index 或提交历史。

## 唯一主目标

在不改变产品行为、外部 Interface、状态语义、生成合同、渲染性能和测试覆盖的前提下，评估并拆分
报告中的 Source 与 Test 大文件；第一批优先处理 Composer queue ownership，使 pending-input 管理变化
集中到具有真实状态所有权的深 Module，而不是按行数把实现搬进一组浅文件。

## 已确认的范围决策

1. Source 与 Test 两组都纳入本设计。
2. 第一批选择 Composer queue ownership，并同步处理与该 owner 对齐的测试行为族。

“纳入设计”表示逐项判断应拆、暂不拆或延后专项设计，不表示报告中的 20 个文件都必须拆。文件行数、
Top 10 排名和近期变更次数都是调查信号，不是拆分阈值或验收目标。

## 当前证据与判断原则

`codex-gui/AGENTS.md` 要求按职责、状态所有权、耦合、函数范围、可测试性和可审查性判断前端结构，
禁止把 TypeScript/TSX 文件长度单独当成硬停止条件，也禁止为满足长度信号削弱测试。

当前本地 Git 历史显示：

- `composerInputQueue.ts`、`composerInputQueueCoordinator.ts` 和 `composerSteerQueueState.ts` 是唯一明显的
  近期共同变更簇；变更主题集中在 queue admission、pending reads/edit/reordering、delivery、interrupt 和
  recovery。
- `CommittedTranscriptSurface.tsx`、`transcriptStateImplementation.ts`、
  `composerPendingInputSession.ts`、`activeThreadSession.ts`、`typescriptArtifacts.ts` 等大多独立演化。
- 共变更只证明变化压力，不能证明 owner 错位；是否拆分仍由当前代码中的闭合职责 seam 决定。

已有专项设计也是当前结构的权威背景：

- `2026-07-11-codex-gui-transcript-state-split-design.md` 已把 transcript state 拆为领域模型、projection、
  selector 和装配边界；当前 `transcriptStateImplementation.ts` 是该方向继续深化后的 mutation owner。
- `2026-08-25-codex-gui-active-thread-session-owner-design.md` 已把 active thread 切换收敛为单一 session
  事务；当前 `activeThreadSession.ts` 的 candidate、generation、staged dispatch、replay、publication 和
  cleanup 共同维护原子发布。
- Composer pending-input Drawer 和 application session 的既有设计已经明确 queue、session 与 UI 的 owner
  分工；本设计不得重新建立 queue mirror、第二 session identity 或第二 lifecycle owner。

## 总体设计原则

### 深 Module 优先于短文件

拆分后的 Module 必须隐藏真实复杂度并拥有可说明的 Interface。若一个候选删除后，复杂度只会重新散落到
多个 caller，它具有 Depth；若只是转发同一批参数和回调，它是浅 Module，不应创建。

物理文件可以承载 Module 的 private Implementation seam，但不能仅为测试或行数扩大 public export。
生产和测试继续通过同一稳定 Interface 验证行为，不为新文件增加 test-only production API。

### 单一 owner

- queue slot、display identity、revision、reservation、delivery phase、recovery transfer 和 active-session
  generation 各自只能有一个权威 owner。
- React、Redux、Drawer session 和测试 harness 都不得复制 queue 或 active-session 状态。
- 拆分不得留下旧/新双入口、adapter、fallback、临时 re-export、双读或双写。
- 中间批次可以尚未完成全部拆分，但不能为保持旧路径可用而新增兼容层。

### 行为与合同不变

- ordinary 与 steer 继续独立 FIFO，禁止跨 lane move。
- sent steer、`deliveryUnknown`、rejected、recovery、interrupt 和 release reservation 语义不变。
- pending display key、cursor、revision/CAS、edit reservation 和 stale/invalidation 结果不变。
- authoritative protocol types、schema 输入、生成失败传播和 byte-for-byte determinism 不变。
- transcript chunk、memo、selector identity、折叠时不挂载隐藏内容等性能边界不变。
- Browser 测试的 Chromium、Firefox、WebKit 覆盖和纵向集成层级不降级。

## Source 候选结论

| 当前文件 | 结论 | 设计依据 |
| --- | --- | --- |
| `composerInputQueue.ts` | 拆分，第一批 | ordinary slot、pending identity/management 与 delivery/recovery 编排可形成 private ownership seam |
| `composerInputQueueCoordinator.ts` | 拆分，第一批 | live management transaction、accepted-event mailbox 与 RPC/recovery lifecycle 是两个变化轴 |
| `CommittedTranscriptSurface.tsx` | 拆分，后续批次 | activity、entry renderer、turn-fragment selector 编排是单向依赖的三个 UI Module |
| `composerSteerQueueState.ts` | 暂不拆 | 当前是完整 steer state machine；unsent lane seam 尚不足以证明拆分收益大于跨状态不变量风险 |
| `composerPendingInputSession.ts` | 暂不拆 | open/close、owner generation、pages、edit、focus effects 和 publication 共同构成单一 Drawer session owner |
| `ComposerPendingInputDrawer.tsx` | 拆分，queue 后续批次 | Drawer adapter、editor adapter、pending list/item 和 preview 已有清晰 UI seam |
| `transcriptStateImplementation.ts` | 暂不拆 | 当前跨索引 mutation 必须原子维护，按事件类型拆分会泄漏 placement/chunk/fragment 不变量 |
| `activeThreadSession.ts` | 暂不拆 | candidate preparation 与一次发布是单一事务；按方法拆会产生双 owner 和错误失败分类 |
| `typescriptArtifacts.ts` | 延后专项设计 | 有自然 artifact-family seam，但 2026-07-27 拆分次日被无原因说明地整体 revert，且当前新增 auxiliary schema contract |
| `ThreadHistoryDetailPage.tsx` | 拆分，后续批次 | route/read content 与 continue-task activation 是两个独立生命周期族 |

### 为什么不是“前 10 全拆”

`composerSteerQueueState.ts`、`composerPendingInputSession.ts`、`transcriptStateImplementation.ts` 和
`activeThreadSession.ts` 的长度主要来自一个完整状态机必须共同维护的不变量。当前没有证据支持把这些
不变量分给多个 owner。为让它们退出报告而拆分，会把维护复杂度从一个深 Module 泄漏到多个浅 Interface。

`typescriptArtifacts.ts` 的历史拆分 `1b2123dc9` 与 transcript Browser 测试拆分一起被
`c76e6d71c` 整体 revert。提交信息只证明回退，不说明技术失败或产品否定；同样，它也不足以授权直接恢复
旧结构。该文件应在后续独立设计中重新核对 auxiliary schema、formatter、artifact set 和完整生成链。

## 第一批：Composer queue ownership

### 保持稳定的外部 Interface

第一批不把 queue 改造成通用 `read/apply`、`read/execute` command bus，也不在
`ActiveThreadComposerRole` 上新增一套并列 capability。

保持下列唯一生产入口及既有领域方法：

- `createComposerInputQueue`
- `ComposerInputQueue`
- `createComposerInputQueueCoordinator`
- `ComposerInputQueueCoordinator`
- `ActiveThreadComposerRole` 当前从 live session 机械选取的 queue 操作

这样避免为了“入口更少”引入宽 discriminated union、扩大迁移面或加深
`composerInputQueueContracts`、start state 与 steer state 的类型循环。

### `ComposerOrdinaryQueueState` private Module

从 `composerInputQueue.ts` 提取一个 feature-private `composerOrdinaryQueueState.ts`，真实拥有：

- ordinary slot 数组；
- ordinary acquisition/reservation slot；
- ordinary FIFO、head issue、restore 和原位 drain；
- ordinary edit/save/cancel/delete/move；
- ordinary message identity、顺序和 reservation 失效不变量。

该 Module 返回 typed outcome，不执行 RPC，不读取 React/Redux，也不拥有 steer、active turn、recovery 或
snapshot publication。`ComposerInputQueue` 继续是跨 ordinary/start/steer/recovery 的唯一组合 owner。

### `ComposerPendingInputIdentity` private Module

从 `composerInputQueue.ts` 提取 feature-private `composerPendingInputIdentity.ts`，唯一拥有：

- display key 与 message id 的双向索引；
- owner-scoped cursor capability、lane、offset 和 revision 绑定；
- 单调 detail revision；
- stale/foreign cursor 判断；
- 消息进入、移除、替换和恢复时的 identity 生命周期。

该 Module 不拥有 queue slot，也不决定 FIFO、delivery 或 recovery。queue root 在完成真实状态 mutation 后
通知 identity Module 推进可观察 revision；no-op、stale 和拒绝操作不得推进 revision。

### queue root 保留的职责

`composerInputQueue.ts` 拆分后仍负责：

- 组合 ordinary state、`ComposerStartQueueState` 与 `ComposerSteerQueue`；
- active turn、prepared interruption 与 user-stopped recovery；
- submit、promotion、start/steer settlement、terminal observation 和 recovery 编排；
- 跨 lane pending page/detail/management resolution；
- 把同步状态变化转换为有序 `ComposerInputQueueEffect`。

跨 lane resolution 留在 root 是有意设计：ordinary 与 steer 的状态 owner 不应互相 import，也不应为一个
调用者创建抽象 port。若提取后仍需要大量传入 raw array、Map 或可变 callback，说明 seam 太浅，应保留在 root。

### `ComposerPendingInputLiveManagement` private Module

从 `composerInputQueueCoordinator.ts` 提取 feature-private
`composerPendingInputLiveManagement.ts`，完整拥有：

- management acquisition/mutation/replay 三类互斥状态；
- active management session 与一次性 edit reservation wrapper；
- accepted runtime event mailbox、延迟和按原顺序 replay；
- begin/save/cancel/delete/move 的 session-invalidated、mutation-pending 和 target-invalidated 归一化；
- management 完成后的 deferred drain intents。

该 Module 直接操作同一个 `ComposerInputQueue` 引用，不复制 queue state。它返回领域 outcome、queue
transition 和是否需要 publication 的事实；外层 coordinator 继续唯一拥有：

- generation、dispose 和 owner-gone lifecycle；
- start/steer/interrupt RPC effect；
- recovery、release reservation 和 interrupt state；
- snapshot、listener 与 publication；
- 远端 command error 的 `definitelyNotAccepted`/`deliveryUnknown` 分类。

若该提取需要把 generation、recovery、release reservation 或 snapshot setter 作为一组可变 callback 传入，
说明 Module 没有闭合，应缩回 coordinator；不得创建薄 facade。

### `composerSteerQueueState.ts` 的边界

第一批不修改 `composerSteerQueueState.ts` 的状态所有权或外部 Interface；queue root 继续只通过现有 typed
Interface 调用它。steer state 不得导入 ordinary/identity 的 private types。它继续统一拥有 unsent slots、
in-flight phases、closed targets、rejected FIFO、recovery transfer 和一次性 capability。

只有后续证据证明“unsent steer lane”可以独占真实 slot、edit reservation、move 和 issue-head，且 parent
只消费 typed transition、不共享 Map/array/capability 时，才能为它单独设计 `ComposerUnsentSteerLane`；本设计
不预先承诺该拆分。

## 其他 Source 拆分设计

### `CommittedTranscriptSurface.tsx`

目标依赖方向：

```text
surface entrypoint
  -> turn fragment renderer
  -> entry renderer
  -> activity renderer/presentation
```

目标文件：

- `TranscriptActivityEntries.tsx`：collab/sub-agent 文案、本地化、chips、相邻 activity 分组和 Card 展示。
- `TranscriptEntryRenderer.tsx`：message/reasoning/status/activity 的穷尽分派。
- `CommittedTranscriptTurnFragment.tsx`：leading/middle/final/error 编排、chunk memo、selector 订阅和折叠。
- `CommittedTranscriptSurface.tsx`：只保留 live/read-only 入口、provider 与现有 renderer 接线。

必须保持 `MiddleTranscriptChunk` 与 turn-fragment 组件定义的稳定 identity、细粒度 selector、final entry
引用比较、折叠后不挂载 middle 内容以及 chunk-level 性能边界。不得把 turn flatten 成 entry 数组。

### `ComposerPendingInputDrawer.tsx`

目标文件：

- `ComposerPendingInputDrawer.tsx`：HeroUI Drawer、session projection、semantic effect 到 DOM/focus 的 adapter。
- `ComposerPendingInputEditorAdapter.tsx`：Lexical controller attach/capture/restore 与 editor UI。
- `ComposerPendingInputList.tsx`：两 lane 分组、item、detail disclosure、move/edit/delete controls。
- `ComposerInputPreviewContent.tsx`：通用 preview renderer，供 Drawer 与 region 两个现有消费者复用。

列表 Module 不持有 queue/session lifecycle；顶层 Drawer 继续唯一拥有 DOM refs、focus targets 和 effect
消费。状态化 detail/read failure 不得被提升为跨 feature shared helper。

### `ThreadHistoryDetailPage.tsx`

目标文件：

- `ThreadHistoryDetailPage.tsx`：唯一公开 route component，负责 params、capabilities 和 owner 接线。
- `ThreadHistoryDetailContent.tsx`：loading/error/empty/ready、document title、back、只读 transcript。
- `ContinueTaskAction.tsx`：完整 continuation lifecycle、capability token、in-flight、activation outcome、warning
  toast、QR 与导航。

`ThreadHistoryDetailOwner` 继续唯一拥有 `thread/read`、identity、retry/generation 和 transcript state；
`ActiveThreadSession.activate` 继续唯一拥有 continuation outcome。不得从私有组件扩大 barrel/public API。

## 明确保持现状的 Source Module

### `composerPendingInputSession.ts`

该文件继续作为 React 外的 Drawer application session，统一拥有 phase、owner generation、pages、edit、
alert、announcement、focus effect、publication 和 dispose。只移动 contracts 或逐命令方法不能形成新 Depth；
后续只有出现第二个真实 adapter 或独立变化轴时才重新评估。

### `transcriptStateImplementation.ts`

该文件继续是 transcript mutation kernel。一次 placement 必须原子同步 `entriesById`、
`entryChunkById`、chunk/turn/fragment 索引与 revision、context page、scroll pulse 和 commit key。按
started/delta/completed/snapshot 建平级模块会让这些不变量跨文件泄漏，因此本设计不实施该拆分。

### `activeThreadSession.ts`

该文件继续是 live thread 切换与发布事务 owner。candidate notification buffering、replay count、staged
Redux dispatch、release reservation、generation、pre/post-commit failure classification 和旧 owner cleanup
保持同一事务。只在另一个专项设计证明完整 `ActivationAttempt` 能拥有全部 candidate 事实时才允许深化；
本设计不做 contracts-only 搬移，也不按 `activate`/cleanup/event handler 分文件。

## Test 拆分设计

测试拆分的验收单位是行为场景、断言语义和真实 test collection，不是新文件行数。原注册点至少保持：

| 当前文件 | 当前注册点 | 目标行为族 |
| --- | ---: | --- |
| `ComposerTurnControl.browser.test.tsx` | 53 | session、input、pending-input、delivery |
| `ComposerEditor.browser.test.tsx` | 39 | typeahead、skill tokens、lifecycle |
| `composerInputQueueCoordinator.test.ts` | 43 | release、delivery、management、move |
| `composerInputQueue.test.ts` | 46 | start、steer、pending projection、management |
| `CommittedTranscriptSurface.browser.test.tsx` | 33 | messages、activity、disclosure |
| `AppComposerQueue.browser.test.tsx` | 12 | ordinary、steer、interrupt |
| `transcriptStateCommittedProjection.test.ts` | 20 | activity、messages、terminal/chunking |
| `ThreadHistoryDetailPage.browser.test.tsx` | 24 | read/navigation、continuation |
| `AppProjectionTranscript.browser.test.tsx` | 19 | ingress、scroll、availability |
| `transcriptStateLiveStreaming.test.ts` | 13 | reasoning streaming、agent-message streaming |

`test.each` 展开后的实际 collection 还必须在实施基线中记录；源码注册点只能防止明显漏迁，不能替代真实
收集数。

### 第一批 queue 测试

与 queue Source seam 同批拆分：

- `composerInputQueueStart.test.ts`
- `composerInputQueueSteer.test.ts`
- `composerInputQueuePendingProjection.test.ts`
- `composerInputQueueManagement.test.ts`
- `composerInputQueueCoordinatorRelease.test.ts`
- `composerInputQueueCoordinatorDelivery.test.ts`
- `composerInputQueueCoordinatorManagement.test.ts`
- `composerInputQueueCoordinatorMove.test.ts`

测试继续穿过 `ComposerInputQueue`/`ComposerInputQueueCoordinator` Interface，不直接测试 private ordinary、
identity 或 live-management Module。现有带 module-level `messageCaptures` cache 的 fixture 不能被描述为纯
builder，也不能让新文件依赖另一个测试文件先填充 cache。

### Composer UI 测试

目标 sibling files：

- `ComposerTurnControlSession.browser.test.tsx`
- `ComposerTurnControlInput.browser.test.tsx`
- `ComposerTurnControlPendingInput.browser.test.tsx`
- `ComposerTurnControlDelivery.browser.test.tsx`
- `ComposerEditorTypeahead.browser.test.tsx`
- `ComposerEditorSkillTokens.browser.test.tsx`
- `ComposerEditorLifecycle.browser.test.tsx`
- `AppComposerQueueOrdinary.browser.test.tsx`
- `AppComposerQueueSteer.browser.test.tsx`
- `AppComposerQueueInterrupt.browser.test.tsx`

`createQueueControllerHarness` 留在 pending-input 行为族，不提升成所有 Composer 测试共享的万能 owner。
每个 App sibling 自己拥有 hoisted mock、history seed、support reset 和 restore，不依赖文件执行顺序。

### Transcript 测试

目标 sibling files：

- `CommittedTranscriptSurfaceMessages.browser.test.tsx`
- `CommittedTranscriptSurfaceActivity.browser.test.tsx`
- `CommittedTranscriptSurfaceDisclosure.browser.test.tsx`
- `transcriptStateCommittedActivity.test.ts`
- `transcriptStateCommittedMessages.test.ts`
- `transcriptStateCommittedTerminal.test.ts`
- `transcriptStateReasoningStreaming.test.ts`
- `transcriptStateAgentMessageStreaming.test.ts`
- `AppProjectionIngress.browser.test.tsx`
- `AppProjectionScroll.browser.test.tsx`
- `AppProjectionAvailability.browser.test.tsx`

每个 transcript state 测试文件拥有自己的 revision/store factory；不得共享 module-level revision counter。
`AppProjectionScroll` 独占 document scroll、fake RAF/timer 和临时 `IntersectionObserver`，并在本文件完成
恢复。拆分不得把 chunk selector 或 Browser integration 降成 unit coverage。

### Thread history 测试

目标 sibling files：

- `ThreadHistoryDetailRead.browser.test.tsx`
- `ThreadHistoryDetailContinuation.browser.test.tsx`

可建立窄的 per-call browser harness，负责 memory router、capabilities store 和 active-session harness；Toast
清理只属于 continuation 文件。两组测试仍通过完整 route/page 挂载，不直接导出私有组件做 unit mount。

## 分批边界

本节只定义设计上的独立交付边界，不是实施顺序、提交图或命令清单。

1. Composer queue private ownership seam及 queue/coordinator 行为测试。
2. queue-adjacent UI：Pending Drawer 文件和 ComposerTurnControl/AppComposerQueue 行为测试。
3. transcript renderer 与其 Browser 测试；transcript state 只拆测试，不再拆 mutation owner。
4. thread history route/content/continuation 与对应 Browser 测试。
5. ComposerEditor 与 AppProjection 的独立 test-only 行为族整理。
6. `typescriptArtifacts.ts` 进入新的专项设计；在回退原因和当前 auxiliary contract 闭合前不实施。

每个边界都必须能独立说明行为保持、Interface 保持、测试迁移和失败域。实际计划必须再依据真实依赖、
写集合、Browser 资源冲突和 change-size 审查建立 DAG；本设计不把编号当成串行依赖。

## 生成合同不变量

若后续专项设计处理 `typescriptArtifacts.ts`，必须保留：

- Rust schema JSON、request/notification metadata 和 GUI-host schema 的权威输入链；
- `RequestResponse<M>`、`Extract<ServerNotification, ...>["params"]`、`Pick`/`Required`/`Partial` 等
  对 authoritative types 的机械依赖；
- auxiliary schema required-field projection；
- missing schema/type/validator export、formatter error 的失败传播；
- artifact 文件名、header、imports、exports、排序和 byte-for-byte determinism；
- 由固化 generator 入口写入 `src/generated/**`，禁止手工修改生成物。

不得用手写 DTO、literal union、consumer-owned validator、`unknown` reconstruction 或 runtime fallback
替代 compile-time contract failure。

## Browser 与测试资源不变量

- 新 Browser 文件继续由现有 parallel config 在 Chromium、Firefox、WebKit 中收集；不得迁入 sequential
  或缩小 browser matrix 来绕过全局状态问题。
- 每个新文件独立完成 `vi.hoisted`/`vi.mock`、support reset、history seed、timer/RAF、DOM global、Toast、
  observer 和 navigator override 的建立与恢复。
- 只共享纯 builder 和每次调用创建新实例的窄 harness；不共享 mutable revision、probe、queue/session 或
  singleton mock state。
- 不删除断言、不合并场景以减少注册数、不放宽等待、不修改基线、不用 unit test 替代原有纵向覆盖。

## 方案比较与选择

### 未选择：全 queue `read/apply` Interface

该方案把 queue 收敛为两个入口，Depth 表面较高，但会把 submit、settlement、observation、recovery 和
pending management 塞进宽 command/query union，扩大 caller/test 迁移，并可能退化成 command bus。
它解决的是方法数量，不直接解决 pending-input locality。

### 未选择：Drawer 常用调用者 capability

该方案在 `ActiveThreadComposerRole` 增加短生命周期 `pendingInputs()` facet，能隐藏 cursor/request 拼装，
但会同时改变 active-session Interface、queue revision 暴露和 Drawer/session 调用语义，超出纯大文件拆分。
若只是逐方法转发，又会成为浅 Module。

### 选择：稳定外部 Interface + private ownership seam

保留唯一生产入口和外部 Interface，在 queue/coordinator Implementation 内移动真实 state 与 transaction
ownership。该方案对 caller 影响最小，同时直接提高 Locality；无法闭合的 seam 保持原位，不为缩短文件制造
抽象。

## 非目标

- 不改变任何用户可见行为、文案、焦点、导航、queue 顺序或恢复语义。
- 不新增 app-server/RPC、协议字段、Redux state、React Context、持久化或 runtime validation。
- 不修改报告脚本、Top 10 limit、阈值或 CI gate。
- 不承诺每个 Source 文件退出报告，也不设单文件行数接受标准。
- 不新增通用 `shared`/`utils` 目录或大型测试 support。
- 不重新设计 transcript state、ActiveThreadSession、Composer pending session 或 steer delivery FSM。
- 不直接恢复 `1b2123dc9`，不手改 generated artifacts。
- 不安装依赖，不启动浏览器、runtime、DevTools 或 GUI，不执行测试、格式化、stage、commit 或 Git remote。

## 后续计划必须保留的验收条件

1. 第一批只围绕闭合的 queue private ownership seam，不建立第二 owner、command bus 或兼容层。
2. `ComposerInputQueue`、coordinator 和 active-session 外部 Interface 保持不变；跨 lane/root 编排仍由单一
   owner 负责。
3. ordinary/steer FIFO、reservation、revision/CAS、display identity、delivery/recovery 和 accepted-event
   replay 的现有断言语义完整保留。
4. 所有 Test 拆分以原 test name、源码注册点和真实 collection 三重清单防止遗漏；Browser matrix 与纵向
   覆盖不降级。
5. transcript renderer 拆分不改变 chunk/memo/selector identity 或隐藏内容挂载边界。
6. history 拆分不复制 `ThreadHistoryDetailOwner` 或 `ActiveThreadSession.activate` 状态机。
7. 暂不拆和延后专项设计的 Source 文件不得在实施中顺手整理。
8. 验收报告分别说明结构收益、行为验证、collection 保持、生成合同适用性和剩余 Top 10；不得用“行数下降”
   代替正确性与 owner 证据。

## 进入下一阶段的门禁

本设计需由用户明确确认。确认前不得创建 implementation plan。确认后下一轮只编写并落盘计划，列出精确
修改范围、验证范围、任务提交拓扑、执行 DAG、Browser 资源冲突和最终 fan-in；计划再次明确确认后才允许
实施。
