# Codex GUI Composer 应用会话边界设计

日期：2026-08-25

状态：已确认

确认日期：2026-08-25

确认原文：确认设计，计划落盘

设计分支：`dev`

设计时 HEAD：`097ddb6a7627191784619513676f1e67ce9b2e5c`

关联 issue：

- `docs/superpowers/issues/2026/08/24/2026-08-24-01-codex-gui-current-code-problems/2026-08-24-06-composer-react-domain-state-machine.md`

## 唯一主目标

为 Composer 建立清晰的应用会话边界：把 pending-input 管理事务和 turn 操作编排从 React
展示生命周期中收进可独立验证的深 Module，同时保留 React、HeroUI、Lexical、DOM 与 ARIA
各自必须承担的适配职责，并保持当前全部用户可见行为不变。

本设计只定义模块责任、Interface、状态与生命周期、不变量、失败语义、适配 seam、影响边界和验证边界。
它不是 implementation plan，不定义任务顺序、提交拆分或执行命令，也不授权修改产品代码。

## 已确认的产品决策

本次采用行为保持型优化：即时命令被 session/revision gate 拒绝时，继续静默返回，不新增提示、错误文案
或额外错误状态，也不清空当前草稿。

这项决定适用于 Send、Guide、Recover、Stop 以及空草稿 Guide promotion 等即时操作。pending-input
Drawer 已有的管理失败提示继续保留，因为它们是当前交互的一部分，不属于本次新增行为。

## 当前代码证据校准

### Issue 中已经过时的部分

原 issue 对 `ComposerPendingInputDrawer` 的结构性判断仍成立；它列出的 `SkillTypeaheadPlugin` DOM/ARIA
事实仍然准确，但这些事实证明该文件承担平台 adapter 职责，不足以证明存在领域状态混杂。对
`ComposerTurnControl` 与 Redux 的描述则已被后续代码演进部分推翻，不能原样作为当前设计前提。

- `CurrentTaskPage.tsx:105-113` 从 `useActiveThreadSessionSnapshot()` 取得单一 session snapshot，再将其传给
  `ComposerTurnControl`。
- `activeThreadSession.ts:40-69` 定义稳定的 `composerRole`、`skillsRole` 与
  `ActiveThreadSessionSnapshot`；queue view、skill catalog、active turn、revision 和操作 capability
  已经由同一个 session snapshot 聚合。
- `ComposerTurnControl.tsx:62-76` 只从 Redux 读取 `selectThreadRuntimeTokenUsage`，用途是构造 context usage
  展示；提交资格不再由 Redux runtime identity、subscription 或 active turn selector 决定。
- `ComposerTurnControl.tsx:64-112` 的提交、Guide、Stop 与 Recover 投影来自 `sessionSnapshot` 中的
  phase、active turn、queue snapshot、skill catalog 和 revision，再结合 editor snapshot。
- `ComposerTurnControl.tsx:173-185` 通过同一 `composerRole` 和 session revision 发起 submit；
  `ActiveThreadSession` 是 operation gate，Redux 不是提交资格 owner。

因此，本设计不得再声称 React 正在跨 Redux、queue external store 和 skill catalog 三套 owner 拼装线程
身份或提交资格，也不新增 Redux composer slice、queue 镜像或第二套 session identity。

### 当前仍然存在的问题

后续 ownership 重构消除了跨 owner 的线程身份拼接，但没有消除 React 内剩余的应用会话编排：

- `ComposerTurnControl.tsx:87-112` 和 `130-200` 在 React 内同时完成操作投影、提交 capture、同步重入
  保护、结果解释、条件清空、microtask 解锁以及 Recover/Stop command dispatch。
- `ComposerPendingInputDrawer.tsx:31-73` 定义 edit、open/close owner、alert、move announcement 和 refresh
  suppression 等应用状态；`101-160` 又在 render 中组合这些状态与最新 snapshot，投影同步关闭。
- `ComposerPendingInputDrawer.tsx:181-355` 处理 management completion 临界区、reservation 结果分类、
  owner replacement、外部失效、completion hold、presence 与焦点恢复。
- `ComposerPendingInputDrawer.tsx:388-582` 处理 editor preparation、edit reservation、save、delete、move、
  revision refresh、stale fallback 和操作后焦点目标。
- `SkillTypeaheadPlugin.tsx:84-102` 直接适配 Lexical root 与 composition DOM listener；`240-280` 用
  `MutationObserver` 维持 menu/root ARIA identity；`480-507` 设置 combobox 角色和展开状态。这些职责应继续
  作为平台 adapter 隔离，而不是迁入 Composer 领域 Module。

问题不是组件行数本身，也不是 HeroUI 选型错误。真正需要优化的是：领域操作的 session 状态和结果分类仍
与 React presence、DOM ref、焦点执行及文案渲染交织，导致正确性必须跨多个生命周期一起推理；Lexical/DOM/
ARIA adapter 本身不属于要迁走的领域状态。

## 设计原则

### 深 Module，而不是机械拆文件

新边界必须隐藏 reservation、revision reconciliation、completion hold、owner replacement、结果分类和
提交临界区。若只是把 hooks 或 handler 移到新文件，但调用者仍需知道这些状态如何配合，就没有形成更深的
Module，只是把同一复杂度分散开。

### 一个权威事实只保留一个 owner

- active thread identity、session phase、operation revision 和 capability 继续由
  `ActiveThreadSession` 权威拥有；
- FIFO、ordinary/steer lane、pending-input identity、delivery/recovery 和 edit reservation 继续由
  Composer queue 权威拥有；
- skill catalog 继续由 session 从属的 skill catalog owner 权威拥有；
- editor 内容、selection、selected skills 和 capture identity 继续由 `ComposerEditorController` 拥有；
- 新 Module 只拥有 UI 应用会话所需的临时协调状态，不复制上述权威数据。

### 领域结果与平台副作用分离

应用 Module 产生语义结果，例如“关闭 Drawer 后聚焦 composer”“删除后聚焦同 lane 的后继项”或“显示
target invalidated”。React adapter 负责把结果翻译成 HeroUI state、Lingui 文案和真实 DOM focus。

### 当前行为是兼容边界

本次不新增兼容层，但必须保持现有可见行为。Module 的失败分类应直接表达既有结果，不通过 fallback、
静默吞错或放宽 session/revision 检查来换取结构简化。

## 总体架构

采用两个独立的应用深 Module，并在 React 上保留一层很薄的 presenter/adapter：

```text
ActiveThreadSessionSnapshot + composerRole
  ├── ComposerPendingInputSession
  │    └── PendingInputView + semantic effects
  └── ComposerTurnApplication
       └── TurnControlView + command outcomes

React presenter
  ├── HeroUI render/presence
  ├── Lingui message rendering
  ├── editor controller attachment
  └── semantic focus effect -> DOM ref

Lexical adapter
  └── SkillTypeaheadPlugin -> root/menu DOM + ARIA synchronization
```

不建立统一的“Composer 大状态机”。pending-input 管理是可跨多个 render、revision 与 Drawer presence 存活的
会话；Send/Guide/Recover/Stop 是围绕一次即时 command 的应用临界区。两者生命周期不同，合并会制造新的
中央枢纽和过宽 Interface。

## Module 与 Interface 设计

### ComposerPendingInputSession

`ComposerPendingInputSession` 是 feature-private、每个 Drawer 应用会话一个实例的深 Module。它拥有：

- Drawer 的 closed/open/closing 会话状态；
- 打开时捕获的 `composerRole` owner identity；
- 分页 prefixes、load budgets 与 detail revision reconciliation；
- edit preparation token、active reservation 和 management outcome identity；
- completion hold、同步 publication 重入保护与 exhausted move refresh suppression；
- alert、move announcement 和语义化焦点请求；
- save、cancel、delete、move、show more、detail failure 与 external update 的结果分类。

它不拥有 queue 数据本身，不重新实现 pending-input 排序、reservation 或 revision gate。所有事务仍调用捕获的
`composerRole`；Module 只解释权威结果并维护 Drawer 应用会话。

建议的语义 Interface 形状如下，精确 TypeScript 命名留给后续计划：

```ts
type ComposerPendingInputSession = Readonly<{
  project(input: PendingInputCurrentFacts): ComposerPendingInputSessionSnapshot;
  subscribe(listener: () => void): () => void;
  open(input: PendingInputOpenInput): PendingInputCommandOutcome;
  requestClose(input: PendingInputCommandInput): PendingInputCommandOutcome;
  attachEditor(input: PendingInputEditorAttachment): void;
  saveEdit(input: PendingInputSaveInput): PendingInputCommandOutcome;
  cancelEdit(input: PendingInputCancelInput): PendingInputCommandOutcome;
  deleteItem(input: PendingInputDeleteInput): PendingInputCommandOutcome;
  moveItem(input: PendingInputMoveInput): PendingInputCommandOutcome;
  showMore(input: PendingInputShowMoreInput): PendingInputCommandOutcome;
  drawerPresenceEnded(): void;
  consumeEffect(effectId: number): void;
  dispose(): void;
}>;
```

`PendingInputCurrentFacts` 与所有 command input 必须携带调用方当次观察到的 `composerRole`、session revision、
mutation capability、queue snapshot 和必要 counts。`project(state, current facts)` 是同步纯投影：当前 render
一旦观察到 owner mismatch、pages unavailable 或 mutation-disabled active edit，就必须立即返回 closing/hidden
view，不能等待 effect 再把外部事实写回 session。Module 不从 Redux 或 DOM 反查状态，也不缓存这些权威
facts 作为第二来源。

### PendingInputSessionSnapshot

对 React 暴露的 snapshot 应是可直接渲染的稳定 view，而不是内部 reservation 或状态字段集合：

```ts
type ComposerPendingInputSessionSnapshot = Readonly<{
  phase: "closed" | "open" | "closing";
  view: PendingInputView | null;
  editor: "none" | "preparing" | "active";
  actionsEnabled: boolean;
  alert: PendingInputAlert | null;
  announcement: PendingInputAnnouncement | null;
  effects: readonly PendingInputSemanticEffect[];
}>;
```

`view` 包含当前可见 prefixes、counts、editor target 和按钮所需语义；不得暴露 reservation、outcome-at-begin、
completion hold 或 suppression token 让 React 再次拼装状态机。

语义 effect 使用 module-issued identity，例如：

```ts
type PendingInputSemanticEffect = Readonly<{
  id: number;
  ownerGeneration: number;
  target:
    | Readonly<{ type: "composer" }>
    | Readonly<{ type: "trigger" }>
    | Readonly<{ type: "drawerHeading" }>
    | Readonly<{ type: "laneHeading"; lane: ComposerPendingInputLane }>
    | Readonly<{ type: "item"; key: string; fallbackLane: ComposerPendingInputLane }>;
}>;
```

Module 不持有 HTMLElement，也不调用 `.focus()`。React 只在 owner generation 仍匹配时执行 effect，执行后按
effect id 单次消费。

### ComposerTurnApplication

`ComposerTurnApplication` 加深现有 `composerTurnControlModel`，统一负责 Send、Guide、Recover、Stop 的应用
投影和 command 临界区。它接收同一次 render 的 session facts、skill validity 和 editor snapshot，返回
可直接渲染的 control view，并以明确 command 方法再次检查输入。

它拥有：

- Send/Guide/Recover/Stop 的纯投影；
- 同步提交重入锁及其 generation；
- intent 对应的 capture/controller identity；
- ordinary submit、steer submit 和空草稿 Guide promotion 的结果解释；
- `accepted` 后才清空对应 capture 的规则；
- command 结束后的 generation-safe 解锁。

它不拥有 active turn、queue recovery、interrupt phase、skill catalog 或 editor draft。这些仍由权威 snapshot
提供。它也不生成用户文案或操作 DOM。

建议的语义 Interface：

```ts
type ComposerTurnApplication = Readonly<{
  project(input: ComposerTurnApplicationInput): ComposerTurnControlView;
  submit(input: ComposerTurnSubmitInput): ComposerTurnCommandOutcome;
  recover(input: ComposerTurnCommandInput): ComposerTurnCommandOutcome;
  stop(input: ComposerTurnCommandInput): ComposerTurnCommandOutcome;
  dispose(): void;
}>;
```

`ComposerTurnCommandOutcome` 只需区分 UI 必须执行的语义，例如 `acceptedAndClearCapture`、`accepted` 与
`ignored`。按已确认决策，session/revision rejection 映射为 `ignored`，不新增提示；原始领域结果仍由
`ActiveThreadSession`/queue 保留，不被 Redux 或 presenter 重解释。

## Pending session 状态模型

```text
closed
  -- open with current composerRole + readable page --> open(list)

open(list)
  -- begin edit --> open(edit preparing, preparation token)
  -- editor attached with same token + reservation begun --> open(edit active)
  -- save/cancel/delete/move --> open(list or alert/completion hold)
  -- explicit close --> closing
  -- owner replacement/pages unavailable --> closing
  -- mutations unavailable while editing --> closing
  -- mutations unavailable while browsing --> open(read-only list)

closing
  -- Drawer presence ended --> closed + semantic focus effect

any live phase
  -- dispose --> discard local capability/tokens; authoritative owner performs invalidation cleanup
```

`closing` 是真实状态，不能由 `isOpen=false` 代替。HeroUI Drawer 退出动画期间，trigger、session cleanup 和焦点
恢复仍有顺序约束；只有 presence 真正结束后才能完成会话清理。

## 反向审计得出的六条硬契约

### 1. Session 跨 revision 存活，owner replacement 按角色身份识别

普通 queue/detail revision 更新不能重建或关闭 Drawer session。打开 owner 以稳定的 `composerRole` 对象身份
识别；同 owner 的 revision 变化只触发 reconciliation。`composerRole` 被替换才表示 owner replacement，旧
session 必须关闭并拒绝其后续 callback。

### 2. 当前 render 必须同步投影关闭

当当前 render 已经观察到 owner mismatch、pages unavailable、mutation-disabled active edit 或无 pending
input 且不存在 completion hold 时，返回给 React 的 snapshot 必须立即是 closing/closed view。不能等 effect
运行后再隐藏旧 Drawer，否则一个 render 窗口仍会暴露无效操作和过时内容。

### 3. Editor restore 由 preparation token 保护

每次 begin edit 生成唯一 preparation token。editor attachment 必须同时匹配 token、owner generation 和目标
key，才能调用 `beginPendingInputEdit` 并安装 reservation。旧 editor 的迟到 controller callback 或卸载回调
不得取消、覆盖或激活更新会话的 edit。

### 4. 同步 publication、outcome identity 与 completion hold 必须保留

queue mutation 可能同步发布新 snapshot。Module 必须在 command 调用期间维持重入保护，避免 external update
先于 command 结果结算而误关 Drawer。management outcome 必须按对象 identity 与 key 和
`outcomeAtBegin` 比较，不能只比较可重复的枚举值。最后一项被删除或编辑移出后，completion hold 必须让当前
事务完成、提示和焦点目标稳定，再允许“队列为空”关闭会话。

### 5. Presence 后清理，焦点 effect 必须带 owner/generation 且只消费一次

进入 closing 不能立刻抹掉 session。reservation settlement、trigger existence 和焦点目标要保留到 Drawer
presence 结束。焦点请求由 Module 以 owner generation 和 effect id 发出；React 只执行仍属当前会话的请求，
并且每个 effect 最多消费一次。旧会话的 microtask 不得把焦点从新会话夺走。

### 6. 提交必须绑定精确 capture/controller，解锁必须 generation-safe

Turn submit 开始时必须捕获精确的 editor controller 与 `ComposerDraftCapture`。只有同一 command 返回
`accepted` 才调用该 controller 的 `clearIfCurrent(capture)`；stale、unavailable、invalid 或其他即时拒绝都
保持静默并保留草稿。microtask 解锁携带 command generation，旧 command 的迟到 microtask 不能解锁或覆盖
更新提交。

## React、HeroUI、DOM 与 ARIA adapter 边界

React presenter 保留以下职责：

- 订阅两个应用 Module 的 snapshot 并渲染；
- 挂载 `ComposerEditor`、`Drawer`、`Button`、`Alert`、`Disclosure`、`Dropdown` 等 HeroUI 组件；
- 将 Lingui 文案映射到稳定的 alert/announcement 枚举；
- 保存 editor controller attachment 与真实 DOM refs；
- 接收 HeroUI 的 `onOpenChange`、presence end 和按钮事件，并转为 Module command；
- 执行语义化 focus effect，处理目标不存在时已定义的 fallback；
- 保留 composer panel 的 focus-visible modality 适配，因为它直接依赖 document event 与 DOM containment。

React 不再持有 reservation、opened owner、preparing ref、completion hold、outcome-at-begin、refresh
suppression 或 submit reentrancy 等应用状态，也不再自行分类 queue/session operation result。

HeroUI presence 是平台生命周期输入，不是领域 owner。Module 决定“应关闭以及关闭后聚焦哪里”，HeroUI
决定退出动画何时完成，React 将 presence end 回报给 Module。

## SkillTypeaheadPlugin 为什么不做伪领域化拆分

`SkillTypeaheadPlugin` 的 root listener、composition listener、menu anchor id、`aria-controls`、
`aria-activedescendant`、`aria-expanded` 和 `MutationObserver` 都依赖 Lexical 与浏览器真实 DOM 生命周期。
这些不是可脱离平台复用的 Composer 领域状态。

把这些代码搬进所谓“typeahead state machine”只会出现两种坏结果：要么新 Module 持有 HTMLElement、
MutationObserver 和 LexicalEditor，成为换名后的 adapter；要么 React 仍需理解全部同步规则，形成更浅的
Interface。因此它继续作为 Lexical/DOM/ARIA adapter，允许在文件内部按可读性整理纯查询函数，但本设计不
要求把平台适配伪装成领域 Module。

Skill catalog 的候选与加载状态仍来自 `ActiveThreadSessionSnapshot.skills`；plugin 不创建 catalog 镜像，也不
决定 session operation capability。

## 数据流

### 普通发送或引导

```text
ActiveThreadSessionSnapshot + ComposerEditorSnapshot
  -> ComposerTurnApplication.project
  -> React renders Send/Guide state
  -> user intent + exact controller/capture
  -> ComposerTurnApplication.submit
  -> composerRole submit/submitSteer/promote with expected revision
  -> accepted: clearIfCurrent(exact capture)
  -> rejected: keep draft, no new message
  -> generation-safe microtask unlock
```

### Pending-input 管理

```text
session snapshot update
  -> ComposerPendingInputSession.update
  -> reconciled PendingInputView + semantic effects
  -> React/HeroUI render
  -> user command
  -> session calls captured composerRole with expected revision
  -> queue/session authoritative result
  -> session classifies result, refreshes view and publishes effect
  -> React renders message and performs valid focus effect
```

### Owner replacement 或 projection unavailable

```text
new session snapshot
  -> old composerRole mismatch
     -> PendingInputSession synchronously projects closing
     -> React closes Drawer; HeroUI presence ends
     -> session releases application state and emits guarded focus effect
  -> projection unavailable
     -> active/preparing edit synchronously projects closing without UI settlement
     -> ordinary browsing remains open as read-only details
     -> React disables all mutation actions and emits no new error message
```

## 生命周期

### Composer mount

React 为当前 mounted Composer 创建 turn application 与 pending-input session，连接当前
`ActiveThreadSessionSnapshot`，并挂接 editor/presence/DOM adapter。Module 实例不进入 Redux，也不跨页面共享。

### Snapshot revision 推进

同一 `composerRole` 下，每次 render 通过 `project(currentFacts)` 同步 reconciliation 当前 revision；每个
command 也显式接收当次 facts。pending-input session 保留分页 budgets、edit reservation 和 Drawer presence，
但不把 revision 或 queue view 缓存成第二权威来源；turn application 同样在每次 project/command 使用当前输入。

### Owner replacement

新的 `composerRole` 到达时，旧 pending session 进入 closing，旧 command/callback 由 generation 拒绝。新
owner 不复用旧 reservation、pages 或 focus effect。UI 不对旧 reservation 主动执行 save/cancel；其失效与清理
仍由 `ActiveThreadSession` 和 queue coordinator 的 owner 生命周期负责。Turn application 的在途锁同样通过
generation 隔离。

### Projection unavailable

`projectionUnavailable` 只关闭并禁用正在 preparing/active 的编辑会话，且 UI 不主动结算 reservation。普通
pending-input 详情继续按当前行为保持只读可见；只有 pages 本身不可读取、owner 已替换或既有关闭条件成立时
才关闭整个 Drawer。所有 mutation command 继续由 session phase/revision gate 拒绝。

### Unmount 与 dispose

React unmount 时 detach editor 和 DOM adapter，再 dispose 两个应用 Module。dispose 使旧 callback 与 effect
失效并丢弃本地 reservation capability；它不得因为 React teardown、owner replacement 或 projection unavailable
主动调用 save/cancel，也不向 Redux 回写或修改 queue 权威事实。reservation 的最终失效清理由既有
`ActiveThreadSession`/queue owner lifecycle 完成。

## 失败矩阵

| 场景 | 权威结果 | 应用 Module 行为 | 用户可见结果 |
| --- | --- | --- | --- |
| Send/Guide 被 stale revision 或 unavailable 拒绝 | `ActiveThreadSession` | 返回 `ignored`，不清空 capture | 保持当前静默行为与草稿 |
| Recover/Stop 当前不可用 | session/queue view | 不发 command，返回 `ignored` | 控件保持禁用或既有状态 |
| Edit begin stale / not manageable / invalid draft | queue/session result | 结束 preparation、刷新并分类既有 alert | 显示现有 Drawer 提示 |
| Edit reservation owner gone | capability result | 进入 closing，废弃旧 token | Drawer 关闭并按既有规则恢复焦点 |
| Edit target/session invalidated | management outcome | 保留 completion hold，刷新列表 | 显示现有 target/session 提示 |
| Delete 成功且列表变空 | queue result | 刷新、保持 completion hold、发布焦点 effect | 事务完成后再关闭或稳定聚焦 |
| Move 未应用但刷新成功 | queue + refresh result | 发布 `moveNotApplied` | 显示现有 warning |
| Move 已应用但反复 revision 使刷新失败 | queue + refresh result | suppression + completion hold | 显示现有 refresh warning |
| owner replacement | session snapshot | 同步投影 closing，拒绝旧 callback，不由 UI 结算 reservation | 不暴露旧操作；不新增错误文案 |
| projection unavailable，正在编辑 | session snapshot | 同步投影 closing，禁用 mutation，不由 UI 结算 reservation | Drawer 按既有规则关闭；不新增错误文案 |
| projection unavailable，只读浏览 | session snapshot | 保留详情 view，禁用全部 mutation | Drawer 继续只读可见；不新增错误文案 |
| focus 目标已消失 | DOM adapter lookup | 使用 item -> lane heading -> drawer heading/composer 的既有 fallback | 焦点仍落在有效位置 |

## 现有权威 owner 与新边界关系

| 事实或能力 | 当前及最终权威 owner | 新 Module 的权限 |
| --- | --- | --- |
| active thread、phase、revision、operation gate | `ActiveThreadSession` | 读取、携带 expected revision、解释结果；不得复制 |
| queue lanes、pending identity、reservation、delivery/recovery | Composer queue | 通过 `composerRole` 调用；不得重实现 |
| skill candidates 与 catalog lifecycle | skill catalog owner | 只用于投影 validity/status；不得镜像 |
| draft、capture identity、editor root | `ComposerEditorController` | 绑定精确 controller/capture；不得拥有内容 |
| Drawer management application session | `ComposerPendingInputSession` | 唯一拥有临时协调状态 |
| Send/Guide/Recover/Stop application critical section | `ComposerTurnApplication` | 唯一拥有即时 command 临界区 |
| HeroUI presence、DOM refs、focus execution | React adapter | 接受语义 effect；不得解释事务结果 |
| Lexical root/menu ARIA 同步 | `SkillTypeaheadPlugin` adapter | 保持平台适配职责 |
| token usage 展示 read model | Redux `threadRuntime` | 只用于 context usage 展示，不参与提交资格 |

## 范围

本设计包含：

- pending-input Drawer 应用会话的独立 Module Interface；
- Send/Guide/Recover/Stop 应用投影与提交临界区的独立 Module Interface；
- React presenter 与 HeroUI presence、DOM focus、Lingui 文案的 adapter seam；
- 与 `ActiveThreadSession`、Composer queue、skill catalog 和 editor controller 的权威边界；
- 现有失败语义、owner/revision 并发语义和焦点行为的保持；
- 适合独立验证的纯状态与 operation-result tests，以及必要的 Browser/App 纵向覆盖。

## 非目标

- 不重写整个 Composer；
- 不改变 Send、Guide、Recover、Stop 或 pending-input 的产品语义；
- 不新增即时拒绝提示、toast、alert、日志 UI 或错误文案；
- 不修改 app-server 协议、生成 contract、queue wire semantics 或恢复协议；
- 不新增 Redux composer slice、queue snapshot mirror 或第二个 active-thread owner；
- 不改变 `ActiveThreadSession` 已建立的 identity/revision gate；
- 不把 `SkillTypeaheadPlugin` 的 Lexical/DOM/ARIA 适配搬进伪领域 Module；
- 不因样式或文件长度机械新增 snapshot、样式断言或拆文件；
- 不新增兼容层、双读、双写、fallback adapter 或旧新路径长期并存。

## 预计代码影响面

预计影响集中在 `codex-gui/src/features/composerTurnControl/**`：

- pending-input application session 的 feature-private Module 及其独立测试；
- turn application Module 与现有 `composerTurnControlModel` 的职责深化；
- `ComposerPendingInputDrawer`、`ComposerPendingInputRegion` 和 `ComposerTurnControl` 的 presenter/adapter
  收窄；
- 既有 Composer Browser/App 测试中与 owner replacement、revision、reservation、presence、焦点和提交草稿
  身份相关的纵向覆盖。

`activeThreadSession/**`、`composerInputQueue/**`、`composerEditor/**`、skill catalog 与 Redux 预计作为权威
依赖被复用，而不是重建状态模型。若后续证据表明必须修改其公开语义、协议或权威 ownership，则已超出本设计
边界，必须回到设计确认，而不能在实施中顺带扩大。

## 验证边界

### Module 级验证

Pending session 的独立测试应证明：

- 同 owner 跨 revision 存活，owner replacement 关闭；
- render-time external close 立即反映到 snapshot；
- stale editor attachment 不能激活或破坏新 edit；
- 同步 publication 不会越过 command settlement；
- outcome identity、completion hold 和 move refresh suppression 保持；
- presence 后清理与 generation-guarded single-consume focus effect；
- save/cancel/delete/move 的既有结果分类完整。

Turn application 的独立测试应证明：

- Send/Guide/Recover/Stop 投影与当前模型等价；
- exact capture/controller 绑定；
- 只有 accepted 清空当前 capture；
- stale/unavailable rejection 静默且保留草稿；
- 同步重入锁与 generation-safe microtask 解锁；
- 空草稿 Guide promotion 的现有行为保持。

### 纵向验证

保留或收窄现有代表性 Browser/App 覆盖，验证 React、HeroUI presence、editor attachment 与 DOM focus adapter
能够正确消费 Module snapshot/effect。重点是 owner replacement、projection unavailable、最后一项管理完成、
旧 editor callback、旧 microtask 和焦点 fallback。

本次没有视觉设计变化，不因重构新增低价值样式断言；只有既有用户可见语义对应的 Browser 行为需要保持。
若渲染输出没有变化，不要求仅为证明重构而新增视觉 snapshot。

### 静态边界检查

最终结构应能从依赖方向直接看出：React 不持有 reservation 或 application transaction state；应用 Module
不导入 HeroUI、Lingui、HTMLElement、MutationObserver 或 LexicalEditor；Redux token usage 不参与 operation
eligibility；所有 session-scoped mutation 仍经过 `composerRole` 和 expected revision。

## 设计完成标准

只有同时满足以下条件，才可认定本设计目标完成：

- pending-input 的 owner/revision/reservation/completion 状态由一个 feature-private session Module 统一拥有，
  React 不再重组其状态机；
- Send/Guide/Recover/Stop 的 projection、capture identity、同步重入与解锁由 turn application 统一拥有；
- `ActiveThreadSession`、Composer queue、skill catalog 和 editor controller 的既有权威边界没有被复制或绕过；
- React 只承担展示、presence、平台事件、DOM ref、焦点执行和文案映射；
- `SkillTypeaheadPlugin` 明确保留为 Lexical/DOM/ARIA adapter，不进行无收益伪领域化；
- 六条反向审计契约均由 Module Interface 和验证覆盖锁定；
- 已确认的行为保持决策成立：即时拒绝不新增提示、不清空草稿；
- 代表性纵向行为保持，且没有通过豁免、fallback、弱化断言或删除覆盖隐藏问题；
- 最终只保留一条应用路径，不长期保留旧新状态 owner、双读或兼容同步逻辑。
