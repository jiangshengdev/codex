# Codex GUI Composer 当前 Thread 全局状态设计

设计状态：已确认

设计日期：2026-09-03

设计基线：`09cc5d32d`

## 唯一主目标

在不合并当前 `thread` 与其内部各 `turn` 状态、不扩展到其他 thread 或 session tree 的前提下，
在 Composer 底部工具栏二维码右侧始终显示当前 `thread` 的全局状态，并通过静态的 HeroUI
语义色圆点和中性短文字提高状态可扫视性，同时保持 Composer 现有边框、背景、焦点环、
发送控制和各 `turn` 局部状态呈现不变。

## 文档关系与阶段边界

本文以以下 research 中“已确认界面决策”为产品决策输入：

- `docs/superpowers/research/2026/09/03/2026-09-03-codex-gui-agent-status-color-ux.md`

research 的源码调查基线是 `26807b43a25feaa9fbb5a766ce7e9a80ad4eb55d`。本文已经在当前
`09cc5d32d` 重新核对相关生产入口；期间 Composer 新增了
`ContextUsagePopover` 和 compaction 状态，但没有改变已确认的二维码右侧落点、
`ThreadStatus` 权威来源或两层状态边界。

本文是设计，不是 implementation plan。它不包含逐任务执行顺序、执行图、精确命令或提交
拓扑，也不授权修改产品代码、生成物、测试、Git index 或提交历史。设计确认后才能进入独立
计划阶段。

## 已确认的产品决策

1. 状态对象只限当前 `thread`；不聚合其他 thread、子 thread 或 session tree。
2. 当前 `thread` 的全局 `ThreadStatus` 与 transcript 中每个 `turn` 的局部 `TurnStatus` 保持
   两层独立，不互相替代。
3. 状态项放在 Composer 底部工具栏，紧接二维码右侧。
4. 状态项使用无背景、无边框的“圆点 + 短文字”，并始终显示；`idle` 显示灰点和“空闲”。
5. 只有圆点使用 HeroUI 语义色，文字保持中性：`idle` 使用 `default`，普通 `active` 使用
   `accent`，`waitingOnApproval` / `waitingOnUserInput` 使用 `warning`，`systemError` 使用
   `danger`。
6. 所有状态完全静态，不使用呼吸、闪烁、Spinner 或其他持续动效。
7. unread 暂不纳入，也不能从 `idle` 或 turn 完成事实推导。
8. 不改变 Composer 的边框、背景、焦点环、发送按钮或各 `turn` 的局部状态呈现。

## 当前事实与缺口

### Baseline 已存在，但被 Live Session 丢弃

`thread/projection/attach` 的 `ThreadProjectionAttachResponse.snapshot.thread` 已携带完整
`Thread`，其中包括权威 `status`。当前激活流程验证返回的 thread identity 后，把同一个
`attachResponse` 交给 `LiveActiveThreadSession`；但 live session 只保留 `thread.id`、`cwd`
和从 `thread.turns` 派生的 `activeTurnId`，没有保留 `thread.status`。

因此实现不需要增加读取全部线程的请求，也不需要从 turn 事件猜测 thread 状态。缺口只是把
既有 attach baseline 纳入当前 live session 的 snapshot。

证据：

- `codex-rs/app-server-protocol/src/protocol/v2/thread_projection.rs:24-39`
- `codex-gui/src/features/activeThreadSession/activeThreadSession.ts:302-336`
- `codex-gui/src/features/activeThreadSession/liveActiveThreadSession.ts:79-108`
- `codex-gui/src/features/activeThreadSession/activeThreadSessionContracts.ts:45-63`

### 实时通知已有协议，但 GUI 未消费

app-server v2 已定义 `thread/status/changed`，payload 只有 `threadId + status`。GUI 的生成层
认识该方法，但当前 selected notification 集合没有选入它；`guiHostClient` 把它归为
`knownUnconsumed` 后丢弃。因此只读取 attach snapshot 会得到可显示的 baseline，却不能得到
可靠的实时状态。

该通知没有 projection 的 `subscriptionId`、commit ID 或独立 revision。服务端在状态锁内
完成 mutation，释放锁后才异步发送通知；多个状态变化的通知到达顺序不能证明等于状态
mutation 顺序。因此实现不能为它伪造 projection identity，也不能直接把 notification payload
当作 last-write-wins delta 覆盖 attach baseline。

证据：

- `codex-rs/app-server-protocol/src/protocol/v2/thread.rs:2042-2048`
- `codex-rs/app-server/src/thread_status.rs:223-252,414-425`
- `codex-gui/src/generated/appServerProtocol/notificationDescriptors.ts:10-18,139-143`
- `codex-gui/src/features/guiHost/guiHostClient.ts:202-233`

### Composer 工具栏已有左右两组内容

当前工具栏把 `QrAccessPopover` 单独放在左侧，把 `ContextUsagePopover`、Stop、Guide 和 Send
放在右侧控制组。新状态项必须和二维码组成左侧小组，DOM 顺序为二维码后、状态前；右侧控制
组保持原有语义和顺序。

Composer panel 已使用 HeroUI `field-border` 和 `status-focused-field` 表达边框与焦点状态。
thread 状态不得复用或覆盖这些 token，也不得改变整个输入框表面。

证据：

- `codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx:157-247`
- `codex-gui/src/features/qrAccess/QrAccessPopover.tsx:28-65`
- `../heroui/packages/styles/utilities/index.css:40-42`

## 权威状态与 Owner

### 单一权威链路

当前 thread 状态采用一条 owner 链路：

```text
attachResponse.snapshot.thread.status
  -> LiveActiveThreadSession.threadStatus
  -> LiveActiveThreadSessionSnapshot.threadStatus
  -> Composer thread status presentation

thread/status/changed（只作为 invalidation）
  -> GuiHostClient
  -> ActiveThreadSessionController（按当前或候选 threadId 路由）
  -> ActiveThreadStatus.invalidate
  -> thread/read({ threadId, includeTurns: false })
  -> ActiveThreadStatus 的同一个权威值
  -> 同一个 LiveActiveThreadSessionSnapshot.threadStatus
```

`LiveActiveThreadSession` 拥有一个独立的 `ActiveThreadStatus` module，二者共同构成唯一状态
owner。Redux、`AppCapabilities`、
`ThreadHistoryListOwner`、Composer React state 和 transcript read model 都不得保存第二份当前
thread 状态。

`activeTurnId` 继续只表示当前 thread 内是否存在 `inProgress` turn，并继续服务 Composer 的
Send / Guide / Stop 控制。它不能替代 `ThreadStatus`，因为它不拥有
`waitingOnApproval`、`waitingOnUserInput`、`systemError` 或 `notLoaded` 语义。

### Snapshot 与发布

`LiveActiveThreadSessionSnapshot` 的 active 和 projection-unavailable 内容增加
`threadStatus: ThreadStatus | null`。其中非 null 值直接引用生成协议类型，null 只表达前端
owner 已知当前值不可再作为可靠状态展示，不复制或扩展协议联合。

`ActiveThreadStatus` 构造时直接使用 `attachResponse.snapshot.thread.status`；刷新结果只有在
owner identity 有效且结构值实际改变后才发布新 snapshot，避免重复 React render 和重复辅助
技术播报。

状态字段直接引用生成的 `ThreadStatus` / `Thread["status"]`，不得手写同名联合、DTO、validator
或兼容 adapter。协议增加不兼容 variant 时，生成与类型检查必须继续暴露缺口。

### Invalidation 与单飞刷新

`thread/status/changed` 只表示“这个 thread 的 baseline 可能已经过期”。收到匹配通知后，
`ActiveThreadStatus` 调用 GUI 已有的 `thread/read({ threadId, includeTurns: false })` 重新读取
权威 `Thread.status`，不消费通知 payload 中的 `status` 作为最终值。

刷新遵循单飞 dirty-loop：

- 没有刷新在途时，invalidation 启动一次 read；
- read 在途期间再次收到 invalidation，只设置 `dirty`，不并发发出第二个 read；
- read 返回并通过 owner identity 检查后应用 `response.thread.status`；若期间被置为 `dirty`，
  立即继续下一次 read；
- 只有一次 read 窗口内没有新的 invalidation，状态才重新达到 clean；
- 相同状态值不发布新 snapshot。

这样即使旧 notification 晚于新的 attach 或 read response 到达，它也只会触发再次读取当前
权威值，不会把 UI 回退为旧 payload。`thread/read` 失败不得把状态改写为 `idle`、
`systemError` 或继续把已知需要刷新的旧 baseline 冒充当前值；status owner 发布 null，
presentation 显示中性“状态未知”。该失败不阻止已经成功 attach 的 thread，也不改写既有
连接或 projection 状态。后续 invalidation 或 owner 重建可以再次刷新，本文不增加 timer
polling 或自动重试循环。

`thread/read` 已在 GUI request allowlist 中，status module 通过现有 command gateway 消费其
生成 request/response 类型；不得直接访问 transport，也不得新增手写 response DTO。

### 当前与候选 Thread 路由

`ActiveThreadSessionController` 负责 thread identity 路由，Composer 不直接监听 transport：

- 通知 `threadId` 等于当前 live session 的 `threadId` 时，转交当前 owner；
- 激活新 thread 期间，通知 `threadId` 等于 activation candidate 的目标时，只把该 candidate
  标记为 status dirty；不得缓存并重放 notification payload；
- 不匹配当前或候选 thread 的通知直接忽略，不建立全部线程状态索引；
- 连接失效、candidate 放弃、owner 替换或 dispose 时，相关缓存和状态随 owner 生命周期销毁。

候选 owner 先使用 attach response 建立 baseline。若 attach 期间收到匹配 invalidation，必须
在 candidate 发布前通过同一单飞 read 尝试闭合到 clean；若 handoff 检查期间再次变 dirty，
沿用现有 candidate 稳定性门禁，不能发布已知需要刷新的 protocol status。刷新失败时发布
null / “状态未知”，但不因这个辅助状态通道阻止已成功的 projection activation。

每个 read result 必须同时匹配 owner `threadId`、activation/controller generation 和连接
generation。旧 thread、旧连接、已放弃 candidate 或已 dispose owner 的迟到结果全部丢弃。
连接重建后以新的 attach baseline 新建 owner，不延用旧连接的 dirty、in-flight promise 或
最后状态。

现有协议没有 status revision，因此本文明确排除“按消息到达顺序直接重放 payload”。若未来
需要无额外 read 的 delta 合并，协议必须先为 attach/read baseline 与 notification 提供同源
单调 `statusRevision` 或等价 cut；可选 `emittedAtMs` 不是 revision，不能替代。

## Presentation Model

新增纯 presentation 映射，输入接受当前 `ThreadStatus | null`，输出短文字、可访问描述和
HeroUI 圆点语义色。非 null 分支直接消费生成类型；null 只表达 status freshness 失效。它不
读取 `activeTurnId`、最后一个 turn、reasoning item、历史活动或 unread。

| ThreadStatus | 可见短文字 | 可访问描述 | 圆点语义色 |
|---|---|---|---|
| status freshness 不可用（`null`） | 状态未知 | 当前任务状态未知 | `default` |
| `notLoaded` | 未加载 | 当前任务未加载 | `default` |
| `idle` | 空闲 | 当前任务空闲 | `default` |
| `active { activeFlags: [] }` | 进行中 | 当前任务进行中 | `accent` |
| 仅 `waitingOnApproval` | 等待批准 | 当前任务等待批准 | `warning` |
| 仅 `waitingOnUserInput` | 等待输入 | 当前任务等待输入 | `warning` |
| 同时包含两个 waiting flag | 等待处理 | 当前任务等待批准和输入 | `warning` |
| `systemError` | 错误 | 当前任务发生系统错误 | `danger` |

`notLoaded` 是权威协议中的独立状态，不能改名为“空闲”。在正常 attach 成功后的 Composer
中它预期很短暂，但 presentation 必须保持穷尽；若收到该状态，在 projection owner 收束前
如实显示“未加载”。

`activeFlags` 按集合语义处理，不依赖数组顺序。存在任一已知 waiting flag 时，warning
优先于普通 active；两个 flag 同时存在时用短标签“等待处理”，同时在可访问描述中保留两项
具体语义。

## Composer 组件与视觉结构

### 组件边界

状态项是被动、只读的状态文本，不是可点击控件，不使用 `Button`、`Chip`、`Badge`、Popover
或 Tooltip。使用语义化内联容器承载：

```text
Composer footer
├── left cluster
│   ├── QrAccessPopover
│   └── CurrentThreadStatus
│       ├── aria-hidden status dot
│       └── visible neutral label
└── existing right control cluster
```

自定义 markup 的理由是 HeroUI 没有与“无背景、无边框、圆点 + 短文字”的被动状态行完全
对应的 compound component；视觉仍只消费 HeroUI v3 语义 token。

### 视觉规则

- 圆点使用固定小尺寸、完整圆形和 `shrink-0`；颜色只取 `bg-default`、`bg-accent`、
  `bg-warning`、`bg-danger`。
- 文字使用现有中性 muted/foreground token 和小号正文，不随状态着色。
- 容器无背景、无边框、无阴影、无 focus ring，也不进入 Tab 顺序。
- 圆点与文字不使用 transition、animation、Spinner、伪元素呼吸或闪烁。
- 左侧小组保持二维码后紧接状态项；窄宽度时不能隐藏、裁掉或退化为纯圆点。若工具栏空间
  不足，只允许在左右小组之间换行，二维码与状态项仍保持同组和相邻关系。
- 不修改 `.composer-panel` 的 `border-color`、`background`、`status-focused-field`、hover、
  disabled 或 shadow 规则。

### 可访问性与状态播报

可见短文字已经重复颜色语义，因此圆点标记为 `aria-hidden`，颜色不是唯一信息来源。状态
容器使用稳定的 polite status message，并以完整“当前任务……”描述作为 accessible name；
更新不移动焦点。相同 `ThreadStatus` 不重复发布，不因 token streaming 或 turn item 更新反复
播报。

`systemError` 在其他表面已有 error Alert 时仍只保持 polite 状态摘要，不额外创建第二个
assertive alert。状态项本身不承担错误详情、批准操作或输入操作；用户继续通过现有 transcript
和交互表面处理具体请求。

HeroUI `default` 浅色圆点在部分表面可能低于 3:1，但圆点不是理解状态所必需的唯一图形，
短文字与 accessible name 已完整表达状态。实现不得为了提高圆点对比而改写全局 HeroUI
token、改变 Composer surface，或恢复 Work Louder 原始浅色作为硬编码颜色。

## 生成、国际化与契约边界

- 将 `thread/status/changed` 纳入 GUI selected notification 输入后，通过现有 protocol
  validator generator 更新 descriptors 与 validators；禁止手改 generated 文件。
- notification callback 使用生成的 `ThreadStatusChangedNotification`；presentation 使用生成的
  `ThreadStatus` / `Thread["status"]`。
- 新增可见文本和 accessible name 使用现有 Lingui 宏与 catalog 流程，不拼接未本地化片段。
- 本设计不修改 Rust 协议、app-server 通知 payload、HeroUI 主题变量或 Work Louder 色板。

## 生命周期与失败语义

- 初次 attach：在 live session 首次可用时直接显示 attach baseline，不先用 `idle`、
  `activeTurnId` 或 loading placeholder 猜测。
- 实时更新：只接受当前或候选 `threadId` 的合法 generated notification 作为 invalidation；
  单飞 read 返回相等值时去重。
- thread 切换：旧 owner 在 handoff 完成前继续拥有旧状态；新 owner 只在 baseline 与 attach
  期间已观察到的 invalidation 闭合后一次发布，避免把新 thread 状态显示到旧 Composer。
- projection unavailable：snapshot 仍可保留最后一个权威 `threadStatus`，但既有 projection
  unavailable UI 继续表达连接问题；不得把连接问题改写成 `systemError`。
- status refresh 失败：状态项显示中性“状态未知”，不阻止已 attach 的 thread，也不把读取
  失败伪装成 thread 的 `systemError`。
- reconnect：销毁旧 owner、dirty 与 in-flight refresh identity；重新 attach 后从新 baseline
  开始。
- dispose：状态随 session 销毁，不进入 Redux、local storage、rollout 或跨连接恢复状态。
- 非法 selected notification：沿用 gui host 的协议错误处理；不得静默把未知 payload 映射为
  `idle`。

## 明确排除

- 不聚合其他 thread、sub-agent、session tree 或历史任务。
- 不修改每个 turn 的 `TurnStatus` chip、reasoning UI 或 transcript error Alert。
- 不实现 unread、last-seen、完成绿色或成功状态。
- 不把 `idle` 改写为 completed，不把 `active` 改写为 thinking。
- 不把 status refresh failure 改写为 `systemError`，也不继续显示已知需要刷新的旧值。
- 不从 `activeTurnId`、最后一条 transcript entry 或历史 agent activity 猜 `ThreadStatus`。
- 不新增 Redux slice、全局 thread status map、timer polling、payload last-write-wins、fallback、
  双 owner 或兼容旁路。
- 不修改 Composer 边框、背景、焦点环、发送按钮语义或现有右侧控制顺序。
- 不覆盖 HeroUI 全局 `default`、`accent`、`warning`、`danger` 或 `focus` token。
- 不使用 Work Louder 原色、Chip、Badge、Spinner、动画或整块状态填充。

## 计划前事实闭包与验证边界

进入计划前仍需把本文设计映射为精确实现范围，并核对 current HEAD 的生成入口与测试拆分。
计划至少应覆盖以下验证责任，但本文不规定任务顺序或命令：

- generated notification selection 能识别合法 `thread/status/changed` 并拒绝非法 payload；
- live session 从 attach baseline 初始化，status notification 只触发同 thread 单飞 read，且只
  发布实际变化的权威 read result；
- refresh 在途期间的连续 invalidation 通过 dirty-loop 收束，不并发堆积 read；
- activation candidate 的 dirty 闭合、切换、连接失效和 dispose 不泄漏旧 thread 状态或迟到
  read result；
- 旧 notification 晚于新 baseline 时不能使 presentation 回退；
- presentation 对 freshness unavailable、`notLoaded`、`idle`、普通 active、两种单 waiting、
  双 waiting 和 `systemError` 穷尽；
- Composer 状态项始终包含可见短文字和完整 accessible name，只有圆点着色且没有动画；
- 二维码与状态项保持相邻，现有 ContextUsage、Stop、Guide、Send、Composer border/focus 和
  turn 局部状态行为不回归；
- 窄 viewport 不隐藏状态项或让其退化为纯圆点；
- Level 1 Browser Mode 覆盖 DOM、accessible name、语义色和静态视觉约束；
- Level 2 真实应用无头验收覆盖当前 thread 的 idle、active、waiting 和 error 状态切换；
- Level 3 不适用，因为本结果不依赖操作系统窗口、桌面焦点、DevTools 或系统 IME。

## 设计确认门禁

本文设计已经确认；后续 implementation plan 的编写、确认与执行仍分别遵守阶段门禁。
本文不单独授权实现、验证、stage 或 commit。
