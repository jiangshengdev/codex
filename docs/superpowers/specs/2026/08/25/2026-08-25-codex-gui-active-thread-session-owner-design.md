# Codex GUI ActiveThreadSession 唯一 Owner 设计

日期：2026-08-25

状态：已确认

确认日期：2026-08-25

确认原文：`确认设计，计划落盘`

设计分支：`dev`

设计时 HEAD：`c169080a6b025ff8aa3107cc965f2fea33396ffd`

关联 issue：

- `docs/superpowers/issues/2026/08/24/2026-08-24-01-codex-gui-current-code-problems/2026-08-24-04-active-thread-state-multiple-owners.md`

相关既有设计：

- `docs/superpowers/specs/2026/08/24/2026-08-24-codex-gui-thread-switch-terminal-outcome-design.md`
- `docs/superpowers/specs/2026/08/04/2026-08-04-codex-gui-message-queue-and-steering-design.md`
- `docs/superpowers/specs/2026/07/17/2026-07-17-codex-gui-connection-lifecycle-owners-design.md`

## 唯一主目标

为 `codex-gui` 建立唯一的 `ActiveThreadSession` 权威状态 seam，使 thread identity、subscription
lifecycle、active turn 与 Composer 操作能力由同一个已提交 session 解释；线程切换以候选 session
准备和单次发布完成，projection 失效时所有操作能力统一失效，从结构上消除 Redux、React、projection
与 queue 多 owner 漂移风险。

本设计只定义前端内部权威来源、Module Interface、状态转换、发布不变量、失败语义、迁移终态和验证边界。
它不是 implementation plan，不定义任务顺序、提交拆分或执行命令，也不授权修改产品代码。

## 已确认的产品决策

1. 建立唯一的 active-thread session 权威边界；不以封装现有跨来源检查或增加诊断代替根因修复。
2. 切换候选准备期间旧 session 保持可用；候选完整准备后一次性切换，准备失败继续使用旧 session。
3. 已提交 session 的 projection subscription 失效时，整个 session 统一进入不可操作状态；不得只禁用
   Composer 的某一部分。
4. 本次不新增前端自动或手动 subscription 重连。恢复继续依赖现有连接生命周期重建或页面刷新。
5. 新 session 发布后，切换结果仍等待旧 owner disposal 和旧 projection detach 尝试完成；清理失败只作为
   warning，不回滚已提交的新 session。

## 当前代码与为什么需要改动

### Issue 之后已有的事务骨架

原 issue 的判断仍成立，但当前代码已经包含不能忽略的后续进展：

- `ThreadSwitchCoordinator` 已有 candidate、generation、notification buffer、prepare、commit、publish、
  replay 和 cleanup 阶段；
- `liveThreadReplacementCommitted` 已通过一次 Redux dispatch 同步替换 `threadIdentity`、
  `threadRuntime` 与 transcript baseline；
- candidate 在提交前不会直接污染当前 Redux；
- 新 owner 发布后才释放旧 owner，清理失败被分类为 warning；
- terminal outcome 已核验 Redux committed thread、coordinator owner 和 published owner。

因此，本设计不是重新发明线程切换状态机，而是把现有事务骨架深化成一个真正的深 Module，并删除调用者
必须理解和核对的多 owner Interface。

### 仍然存在的多个权威来源

当前 live session 的同一组事实仍分别存在于：

- `ActiveThreadOwnerHandle`：公开 `threadId`、`subscriptionId`、projection owner、queue coordinator、
  skill catalog 和 disposal；
- `ProjectionApplicationCoordinator`：再次保存 launch thread、subscription、ingress、replay index、
  delta buffer 和 lifecycle；
- `ProjectionIngressAdapter`：再次保存 thread、subscription、commit head、known turns 和 reconnect 状态；
- Redux `threadIdentity`：保存 launch/attached thread 和 attach status；
- Redux `threadRuntime`：保存 thread、subscription state 和 active turn；
- `ComposerInputQueueCoordinator`：保存所属 thread、active-turn 相关队列状态和操作能力；
- `GuiHostConnectionBridge` 与 `App` React state：另存 current owner、startup outcome 和 continue capability。

Redux 内一次 replacement dispatch 是局部原子边界，但完整切换仍按以下顺序跨多个对象推进：

```text
projection owner fields
  -> Redux replacement
  -> coordinator active owner
  -> React active owner publication
  -> authorization recovery locator
  -> candidate notification replay
  -> old owner disposal
  -> old projection detach
```

调用者因此不能只相信一个来源。`ComposerTurnControl` 必须读取 Redux identity、runtime thread、
subscription、active turn 和外部 queue snapshot，再比较 queue owner thread，才能决定发送、引导和停止是否
可用。该比较是必要的现有安全闸门，同时也是 external Interface 过浅的直接证据。

### 当前行为与已确认语义的冲突

当前 switch admission 在异步 `resume` 和 `attach` 之前就取得旧 queue 的 release reservation。reservation
存续期间，旧 queue 会拒绝 submit、recover 和部分管理操作。

所以当前真实行为是“旧页面仍显示，但候选准备期间旧 Composer 被部分冻结”，并不满足已经确认的“旧
session 在候选完整准备前保持可用”。本设计必须把长时间 reservation 改成最终提交闸门上的短暂交接检查；
不能沿用现机制后宣称语义已经满足。

### 当前不存在自动重连

当前前端的两类失效路径不同：

- WebSocket error/close 会永久 invalidate commands，并清除 active owner；同一连接生命周期内不会创建新
  WebSocket；
- projection ingress 发现 closed、commit chain mismatch、missing turn 或 backpressure 时，只会进入
  `manualReconnectRequired`、停止接收后续增量并让 UI 不可操作；生产代码没有同 thread reattach 入口。

因此本设计只统一失效所有权和表现，不把自动重连、手动 retry 或新 UI 控件偷渡进 ownership 重构。

## Domain Model

### ActiveThreadSession

`ActiveThreadSession` 是已提交 live thread 的唯一权威 Module。它唯一解释：

- 当前是否存在 live thread；
- 已提交 `threadId` 与 `subscriptionId`；
- session phase；
- authoritative `activeTurnId`；
- 当前 Composer、queue 和 skill 操作是否允许；
- 当前 session revision；
- candidate 是否正在准备。

### CandidateSession

`CandidateSession` 是未发布的私有准备态。它可以拥有新的 subscription、projection ingress、baseline、
queue 初态、skill catalog 和候选通知缓冲，但不得出现在 React context、Redux selector、路由或 Composer
Interface 中。

### SessionSnapshot

`SessionSnapshot` 是消费者唯一可观察的权威快照。Redux read model、React 页面、Composer view 和路由
行为只能从同一 revision 的 snapshot 派生，不能反向决定 session identity 或 operability。

### Derived Read Model

Redux transcript/runtime 是 session 产生的机械派生 read model，用于渲染、标题、历史页 cwd 和 transcript
缓存。它可以保留归属 `threadId`、token usage、turn 或 subscription 展示信息，但这些字段不再具有 active
session 决策权。

### Recovery Locator

`BrowserAuthorizationSession.activeThreadId` 只是在下一次连接启动时寻找 thread 的 recovery locator，
不是 live owner。`routeTarget.threadId` 同样只是导航目标。

## 总体架构

采用一个 connection-scoped 深 Module，对 React 暴露小 Interface，并把现有 owner 收进私有
Implementation：

```text
GuiHostConnectionBridge
  -> ActiveThreadSession Module
       ├── Candidate/session transition implementation
       ├── Projection ingress/application implementation
       ├── Composer queue implementation
       ├── Skill catalog implementation
       ├── Redux read-model adapter
       └── authorization recovery-locator adapter

React / App / CurrentTask / Composer
  <- one SessionSnapshot + session-gated operations
```

删除该 Module 后，candidate、通知缓冲、identity 校验、发布、queue 交接、projection 失效、Redux 派生、
旧 owner 清理等复杂性会重新散落到 Bridge、App、Composer 和多个 coordinator，说明该 Module 具备真实
Depth，而不是 pass-through wrapper。

## External Interface

精确 TypeScript 命名留给后续 implementation plan，但 external Interface 必须保持以下语义形状：

```ts
type ActiveThreadSessionSnapshot =
  | Readonly<{
      phase: "empty";
      revision: number;
      transition: Readonly<{ type: "idle" }>;
    }>
  | Readonly<{
      phase: "active";
      revision: number;
      threadId: string;
      subscriptionId: string;
      activeTurnId: string | null;
      transition:
        | Readonly<{ type: "idle" }>
        | Readonly<{ type: "preparing"; targetThreadId: string }>;
      composer: ActiveThreadComposerView;
      skills: ActiveThreadSkillsView;
    }>
  | Readonly<{
      phase: "projectionUnavailable";
      revision: number;
      threadId: string;
      reason: ProjectionManualReconnectReason;
      recovery: "connectionRestartRequired";
      composer: ActiveThreadComposerView;
      skills: ActiveThreadSkillsView;
    }>
  | Readonly<{
      phase: "disposed";
      revision: number;
      transition: Readonly<{ type: "idle" }>;
    }>;

type ActiveThreadSession = Readonly<{
  getSnapshot(): ActiveThreadSessionSnapshot;
  subscribe(listener: () => void): () => void;
  activate(threadId: string): Promise<ActiveThreadActivationOutcome>;
  perform(expectedRevision: number, operation: ActiveThreadOperation): ActiveThreadOperationOutcome;
  dispose(): void;
}>;
```

`getSnapshot + subscribe` 是一个观察入口；`activate` 统一表达首次 attach、切换以及 already-current；
`perform` 表示所有会改变 session 或其从属 queue 的用户操作都必须再次通过 session capability gate。

后续计划可以把 `perform` 机械拆成若干明确命名的方法或稳定角色 view，只要满足以下硬约束：

- React 不得再得到 raw `ProjectionApplicationCoordinator`、`ComposerInputQueueCoordinator` 或
  `SkillCatalogOwner`；
- Composer 操作不能绕过 session phase 与 revision gate；
- 不得让调用者重新拼接 Redux、queue 与 React owner 来推导可用性；
- stale render、旧异步 callback 或旧 session capability 必须以 revision/generation 拒绝；
- session snapshot 中的角色 view 是同一 session 的稳定派生能力，不是新的 identity owner。

projection notification、connection unavailable 和 skills changed 等 host wiring 入口属于 Module 私有 ingress
Interface，只交给 `GuiHostConnectionBridge` adapter，不进入 React context，也不扩大普通 caller 的
Interface。

## 权威来源与从属状态

### 唯一权威状态

只有 `ActiveThreadSession` 可决定：

- current thread identity；
- current subscription identity 与 phase；
- active turn；
- session 是否允许发送、引导、停止、queue recovery 或 queue management；
- candidate 是否允许提交；
- session 是否已经 disposed。

### ProjectionIngressAdapter

ingress cursor 继续保存 thread/subscription、commit head、known turns 和 manual reconnect reason。这些字段用于
拒绝 wrong-thread、stale-subscription、duplicate commit、missing parent turn 和断链输入，是必要的内部校验
游标。

它们不是第二个业务 owner：cursor 由所属 session 构造，只能推进所属 session 的私有 projection，并通过
session transition 报告失效。调用者不得读取 cursor 来决定 current identity。

### Composer queue

queue 继续唯一拥有 FIFO、ordinary/steer lane、delivery identity、delivery unknown、recovery、pending-input
management 和 release reservation 等局部状态机。这些是 queue domain，不应复制到 session。

但 queue 不再拥有“当前 live thread 是否可操作”的最终决定权：

- queue 绑定 session identity，只能由所属 session 调用；
- session phase 非 `active` 时，操作在进入 queue 前就被拒绝；
- queue 内部仍保留自己的 generation/disposed/identity 检查，作为从属状态机防御，不成为 UI 可见 owner；
- queue 的 active-turn observation 由 session 对同一 accepted projection fact 的内部 effect 驱动；
- 任何会改变对外 queue view、recovery、delivery、management 或 operation capability 的 queue transition，
  必须由 session transition 同步吸收、递增同一个 session revision 并发布新 snapshot；queue snapshot 不得
  绕过 session 独立通知 UI 或形成第二套 operability revision；
- queue controller 不再作为 React capability 直接暴露。

projection unavailable 时，queue 的本地状态可以留在不可操作 session 内，避免在同一生命周期内凭空丢弃
delivery/recovery facts；本设计不新增跨连接、刷新或重启的 queue 持久化承诺。

### Skill catalog

skill catalog 继续按 session cwd 隔离并拥有查询、invalidate 和 retry 语义，但它是 session 从属 Module。
skill catalog 加载失败不使整个 session 失效；React 只能通过 session 提供的 skills view 使用它。

`projectionUnavailable` 时可以保留最后一次 skills view 供只读展示，但 UI retry、refresh 以及任何会发起
session-scoped command 的 catalog 操作都必须经过 session phase/revision gate 并被拒绝。host
`skillsChanged` 最多把内部缓存标记为 stale，不得在不可操作 phase 自动发起新的 catalog RPC。

### Redux

- `threadIdentity` 不再作为 active identity owner，也不再被 Composer 或 switch terminal gate 读取；最终状态中
  不应保留一套可独立推进的 attach identity 状态机。
- `threadRuntime` 和 transcript 可以继续存在为派生 read model。
- read model 更新只能由 session 接受的 attach baseline、projection fact 或失效 transition 产生。
- Composer 不再通过 runtime `threadId`、`subscription`、`activeTurnId` selector 决定操作能力。
- Redux 中保留的 thread/turn/subscription 字段必须明确是带 session revision 的渲染投影，不能反向证明
  session commit。

## Session 状态机

```text
empty
  -- activate(A) prepared + committed --> active(A, revision N)

active(A)
  -- activate(B) --> active(A, transition preparing B)
  -- candidate failure --> active(A, transition idle)
  -- candidate committed --> active(B, revision N+1)
  -- accepted projection facts --> active(A, updated turn/view)
  -- projection invalid --> projectionUnavailable(A, revision N+1)
  -- connection unavailable/dispose --> disposed

projectionUnavailable(A)
  -- connection lifecycle rebuilt --> old session disposed; new Module starts from empty
  -- dispose --> disposed
```

本次没有 `projectionUnavailable -> active` 的 session 内转换，因为已确认不新增自动或手动 subscription
重连。恢复必须建立新的 connection-scoped Module，不能把原 session 的部分 owner 偷偷恢复为 active。

## Candidate 准备与单次发布

### 准备阶段

切换到 B 时：

1. Module 建立私有 `CandidateSession(B)`，当前 snapshot 仍发布 A。
2. 旧 A 继续接收合法 projection，并允许现有 Composer/queue 操作。
3. candidate 完成 resume、attach 和两次 authoritative thread identity 校验。
4. candidate 从 attach baseline 构造私有 projection、active turn、queue 初态和 skill catalog。
5. B 的 notification 在 candidate 内按 thread/subscription 缓冲；A 的 notification 继续进入 A。
6. candidate 在发布前归并所有合法 buffered notification，形成完整 staged snapshot 和 Redux replacement。

候选事件不得像当前实现一样在 Redux commit 和 React publication 之后才 replay。否则 UI 可能先观察到尚未
吸收候选事件的新 baseline，违背“一次性切换”。

### 最终交接闸门

候选完整准备后，才进入短暂同步交接闸门：

1. 对旧 A 执行带 session revision/generation 的 release readiness CAS 或等价检查。
2. 若旧 queue 此时存在 delivery unknown、recovery、management reservation 或其他不可安全释放状态，取消
   candidate，detach B，A 保持 active。
3. 若检查成功，只在不可 `await` 的同步提交窗口内冻结 A 的新操作。
4. 再次核验 connection、candidate generation、B identity 和 staged notification head。
5. 替换唯一 current session pointer/revision，并同步产出 Redux derived replacement。
6. 所有 session subscriber 只收到一次 B snapshot publication。

长时间 release reservation 不得跨越远端 resume/attach await。旧 session 在准备阶段发生合法变化时，最终
CAS 可以拒绝 candidate；不能通过提前冻结用户操作来伪造稳定输入。

### 原子性的准确含义

“原子发布”不意味着 JavaScript 能让 Redux、React state、session storage 和网络 detach 同时完成。其准确含义
是：

- external caller 只有一个权威 current session pointer/snapshot；
- candidate 在 linearization point 之前完全不可见；
- session subscribers 在所有同步 read-model 派生完成后只收到一次 publication；
- React 不再保存第二份 `activeOwner` 来决定操作目标；
- authorization persistence 和旧 projection cleanup 是发布后的副作用，不参与 current identity 权威性。

Redux dispatch 仍可同步更新渲染 read model，但即使 read model 更新或 subscriber 时序发生变化，任何用户操作
都必须通过 session revision gate，因此不能利用短暂派生视图操作错误 thread。

## 发布后清理与 terminal outcome

新 session 一旦发布：

- 不得回滚到旧 session；
- 新 session 立即成为唯一 notification 和操作 owner；
- 旧 thread 的迟到 notification 由新 session 的 ingress identity 防御拒绝；
- 依次尝试 dispose 旧 owner、detach 旧 projection、释放交接资源；
- 切换仍保持 busy，直到上述清理尝试结束；
- 清理成功或失败后才 settle `activate` outcome，并允许下一次切换；
- cleanup、detach 或 authorization recovery locator 持久化失败只进入 warning/diagnostics，不把已发布的新
  session 伪装成失败，也不恢复旧 owner。

若在该 cleanup 等待窗口中 connection generation 终止，新 session 虽已发布过，但已不再可用；此时
`activate` 必须返回 post-commit connection failure，并使 Module 进入 `disposed`。只有连接仍有效时的普通
旧 owner cleanup、detach 或 recovery-locator 持久化失败，才允许分类为 success + warning。

这一语义保留当前“等待清理尝试后再报告成功”的用户行为，同时消除 cleanup 对 identity authority 的影响。

## Projection 失效语义

matching current ingress 报告 manual reconnect reason 时，`ActiveThreadSession` 必须在一个同步 transition 中：

1. 将 phase 改为 `projectionUnavailable` 并递增 revision；
2. 停止接受该 subscription 的后续 event/delta/closed；
3. 令 session 的所有 mutating operation 在方法入口返回 unavailable；
4. 产生 Redux/transcript 的派生 interruption/reconnect read model；
5. 发布一次统一 snapshot。

不能只在 UI 中通过 `subscriptionState !== active` 禁用按钮。即使旧 React callback、快捷键或测试直接调用操作
Interface，也必须被 session 自身拒绝。

本设计不增加自动 backoff、定时器、手动 retry 按钮或同 thread reattach。用户可见恢复路径保持为连接重建或
页面刷新；新的 Module 生命周期从 `empty` 重新开始。

## Startup 与 switch 统一语义

当前 startup coordinator 和 switch coordinator 对 commit 异常、readback、notification replay 与 terminal
classification 的处理不同。新 Module 必须让首次 activate 与后续 activate 共享以下不变量：

- attach response identity 必须匹配 target thread；
- candidate notification 必须在发布前归并；
- publication 前失败不得产生 current session；
- publication 后异常不得伪装成未提交失败；
- terminal success 由 session 自己的 committed revision 和 identity 证明，不再回读 Redux 作为权威证据；
- startup outcome 只携带结果事实和 warning，不携带另一个可长期保存的 raw active owner。

首次启动没有旧 session，因此不需要 release CAS；其他 candidate、publication 和 post-commit 语义保持一致。

## Caller 终态

### GuiHostConnectionBridge

Bridge 只负责：

- 创建 connection-scoped `ActiveThreadSession` Module；
- 把 validated projection notifications 和 connection lifecycle facts交给 Module 私有 ingress；
- 把 Module 的 stable Interface 发布给 React；
- connection unavailable/unmount 时 dispose Module。

Bridge 不再保存 `currentActiveOwner`、在 startup/switch coordinator 之间切换 notification owner，或分别发布
React owner 与 continue capability。

### App 与 AppCapabilities

`App` 不再分别保存 `startupOutcome`、`activeOwner` 和 `continueThread` 作为 live identity 的组成部分。
React context 暴露稳定 session Interface 及其 snapshot；route、status 和 authorization token 保留既有职责。

### CurrentTask 与 Composer

`CurrentTaskPage` 从同一个 active session snapshot 取得 transcript/composer/skills 角色 view。
`ComposerTurnControl` 不再读取 Redux identity、runtime thread、subscription 和 active turn 后与 queue owner 比较。

发送、引导、停止、恢复和 pending-input 管理都通过 session-gated Interface；按钮显示可以使用同一 snapshot 的
派生 view，但方法入口仍执行 revision/phase 检查。

### Redux 其他消费者

`DocumentTitleOwner`、`AppShellTopBar`、history list cwd 和 `CommittedTranscriptSurface` 可以继续消费 Redux
read model。它们只用于显示，不参与 live session operation target 或 operability 判断。

## Authoritative contract 与 runtime validation

本设计不改变 app-server RPC、wire schema 或 generated validator：

- request/response 类型继续机械来自 generated `ClientRequestDefinition` 与 request descriptors；
- projection notification 继续由 generated notification classifier 和 validator 收窄；
- `resumeThread`、`attachThreadProjection`、`detachThreadProjection`、turn commands 和 `listSkills` 继续通过
  现有 `GuiHostCommands`；
- Module 内部可以注入窄的 host command port，但不得手写 DTO、method union、response wrapper 或 runtime
  validator；
- 不得把 authoritative 类型擦除成 `unknown` 后由 session 重建字段契约；
- `ProjectionIngressAdapter` 现有 commit-chain 和 identity 防御继续消费 generated notification types。

`ActiveThreadSessionSnapshot`、session phase、revision 和 operation outcomes 表达的是新的前端 domain semantics，
不是 wire DTO 镜像，因此属于合法的 frontend-owned model。

## Interface 方案比较

### 继续暴露多个 controller

该方案只把现有 owner 包进新对象，React 仍会得到 projection/queue/catalog controller，并继续负责组合。它的
Interface 与 Implementation 一样复杂，删除 wrapper 后复杂性几乎不增加，是浅 Module，拒绝采用。

### 分别暴露 start、switch、reconnect 和各 phase 操作

该方案扩展性高，但会把 startup/switch/reconnect 的状态机和 ordering 变成 caller 必须学习的 Interface。
而且已确认本次不新增 session-level reconnect，保留该入口会建立没有第二 adapter/use case 的假设 seam，拒绝采用。

### 单一 snapshot、activate 和 gated operations

该方案让 caller 只学习一个权威 snapshot、一个 activation 入口和一个操作门禁；candidate、notification replay、
Redux 派生、queue handoff、cleanup 与失效全部隐藏在 Implementation 内。它对 App、Composer、路由和测试提供最高
Leverage，并把变化集中在同一 Module，采用该方案。

## 失败分类

### 发布前失败

包括：

- transition 已在进行；
- current queue 在最终交接闸门不可安全释放；
- resume/attach 失败；
- response identity mismatch；
- candidate construction 或 notification reconciliation 失败；
- connection/generation 在 linearization point 前失效。

结果：dispose/detach candidate，保留旧 session 及其 revision；首次启动则保持 `empty`。失败 outcome 不携带
candidate owner。

### 发布后 degradation

包括：

- authorization recovery locator 持久化失败；
- old owner disposal 失败；
- old projection detach 失败。

结果：新 session 保持唯一权威；等待清理尝试结束后返回 success + warning。不得制造兼容 fallback、双 owner
或旧新路径并存。

该分类以 connection generation 仍有效为前提。发布后等待 cleanup 时发生 WebSocket/commands terminal，必须
优先分类为 post-commit connection failure，而不是 cleanup warning；已发布 session 随 connection-scoped
Module 一起进入 `disposed`。

### 当前 session 失效

包括 matching subscription closed、commit chain mismatch、missing parent turn 或 backpressure。结果是统一
`projectionUnavailable`，而不是 candidate failure，也不是局部 Composer error。

### Connection terminal

WebSocket error/close 或 commands invalidation 使整个 connection-scoped Module disposed。所有旧 revision、操作
capability、candidate 和 notification callback 永久失效。

## 验证边界

后续 implementation plan 必须以 `ActiveThreadSession` Interface 作为主要测试 surface，验证可观察结果，不穿透
Interface 断言私有 owner 字段。

必须覆盖的行为族：

- 首次 attach baseline 成为唯一 current session；
- candidate prepare 期间旧 session 的发送、引导、停止和 queue 操作仍按原语义工作；
- prepare 期间旧 session 发生变化后，最终 CAS 能安全提交或拒绝 candidate；
- candidate notification 在 publication 前归并，subscriber 只观察一次完整新 snapshot；
- resume、attach、identity、prepare 和 final release failure 均保留同一个旧 session；
- 成功 publication 后旧 owner 只释放一次，并等待 detach 尝试后 settle outcome；
- cleanup failure 返回 warning，不回滚新 session；
- publication 后等待旧 cleanup 期间 connection terminal 返回 post-commit connection failure，不得降级为
  success warning；
- accepted turnStarted/turnCompleted 同时推进 session active turn、queue effect 和 Redux read model；
- 任一改变公开 queue capability 的内部 transition 都推进同一个 session revision，UI 不订阅独立 queue
  operability owner；
- matching projection invalidation 统一禁用所有 mutating operation，方法入口不能被旧 callback 绕过；
- projection unavailable 时 skills 缓存只读可见，但 retry/refresh 不得发起 command；
- wrong-thread、stale-subscription、duplicate commit 与 post-invalidation notification 被忽略；
- connection unavailable/dispose 使所有 generation 和 capability 永久失效；
- React、CurrentTask 和 Composer 不需要也无法构造 Redux thread 与 queue owner mismatch；
- App Browser 行为覆盖旧 session 在候选准备时可用、失败保留旧 session、成功只发布一次、失效统一不可操作；
- generated protocol validators 与现有 ingress commit-chain 防御继续通过既有测试证明。

原先专门构造 Redux/queue identity 漂移来验证 Composer guard 的测试，在新结构中应由“非法组合无法通过
Interface 构造”和 stale revision 拒绝测试替代。不得为了迁移方便保留旧 public controller 或双读路径。

## 非目标

- 不修改 Rust、app-server API、RPC method、wire schema 或 generated artifacts。
- 不重写 projection commit-chain、known-turn、wrong-thread 或 stale-subscription 算法。
- 不改变 Composer FIFO、steer、interrupt、delivery unknown、recovery 或 pending-input management 语义。
- 不改变 skill catalog 查询、invalidate、retry 或 cwd 映射语义。
- 不重构 transcript chunk、rendering、history detail owner 或 DocumentTitle 展示逻辑。
- 不新增自动重连、手动 subscription retry、backoff、Toast、按钮或其他恢复 UI。
- 不新增 queue 持久化，也不承诺跨连接、URL、刷新或 GUI 重启保留本地 queue。
- 不把 route target 或 authorization recovery locator 提升为 live identity owner。
- 不新增 runtime freeze、proxy、手写内部 validator、fallback、adapter 双路径或兼容层。
- 不创建 implementation plan，不修改产品代码。

## 与既有设计的关系

- 2026-08-24 thread-switch terminal outcome 设计中，pre-/post-commit failure、cleanup warning、terminal result
  不携带不可证明 owner 等语义继续有效。
- 其中“Redux 是 active-thread identity 最终权威、通过回读 Redux 证明 commit”的结论，被本设计的单一
  `ActiveThreadSession` authority 取代；Redux 降为机械派生 read model。
- 2026-08-04 queue/steering 设计中的 FIFO、delivery identity、delivery unknown、recovery 和 GUI-local lifecycle
  保持不变；“threadRuntime 是 active turn 唯一 owner”的旧结论由本设计取代，active turn 权威上移到 session，
  queue 只消费同一 accepted fact。
- 2026-07-17 connection lifecycle owner 设计中的 transport、handshake、command gateway 和 generated contract
  seam 保持不变；`ActiveThreadSession` 位于 commands-ready 之后，不吸收 WebSocket 或 handshake owner。

## 完成判据

设计目标完成时，必须能够仅通过一个 session revision 回答以下问题：

- 当前 live thread 是谁；
- 当前 subscription 是否可信；
- 当前 active turn 是谁；
- Composer 和 queue 操作是否允许；
- candidate 是否仍未提交；
- projection 失效后哪些能力必须同时失效。

任何 React、Redux selector、queue controller、projection cursor 或 recovery locator 都不能独立给出与 session
不同的答案，也不能绕过 session operation gate。只有达到这一终态，才是消除多 owner 根因，而不是隐藏现有
不一致。
