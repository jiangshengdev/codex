# Codex GUI 上下文用量展示设计

设计状态：已确认

确认日期：2026-08-18

确认原文：确认设计。计划落盘

设计日期：2026-08-18

修订日期：2026-08-18

## 主目标

为 `codex-gui` 当前任务 Composer 增加上下文用量展示，让用户在不打开 TUI `/status`
的情况下看到当前活动上下文已经占用的 token 数、模型上下文窗口容量和原始已用百分比。

本设计参考 `codex-desktop` 的 Composer 用量组件以及 TUI `/status` 的权威 token usage
数据来源，但不假定两者的百分比语义相同。GUI 采用已经确认的“原始已用比例”，并通过现有
thread projection 建立 attach 基线与有序 live update，不新增旁路订阅或前端估算来源。

## 当前实现与问题证据

### app-server 已有权威用量类型

app-server v2 已定义 `ThreadTokenUsageUpdatedNotification` 和 `ThreadTokenUsage`：

- `tokenUsage.last.totalTokens` 表示最近一次活动上下文的大小；
- `tokenUsage.total.totalTokens` 表示整个会话累计量；
- `tokenUsage.modelContextWindow` 表示运行时模型上下文窗口，当前允许为 `null`。

权威定义及生成 TypeScript contract 位于：

- `codex-rs/app-server-protocol/src/protocol/v2/thread.rs:1576-1614`
- `codex-rs/app-server-protocol/schema/typescript/v2/ThreadTokenUsage.ts:1-6`
- `codex-rs/app-server-protocol/schema/typescript/v2/TokenUsageBreakdown.ts:1-4`

GUI 不需要也不得手写第二份 token usage DTO。协议形状改变时，生成、类型检查或构建必须继续
暴露不兼容变化。

### 桌面端与 TUI 的百分比语义不同

`codex-desktop` 从同一通知读取 `last.totalTokens` 与 `modelContextWindow`，按原始比例
`used / window` 显示“已用百分比”，并将值钳制到 `0%..100%`：

- `/Users/jiangsheng/cnb/codex-desktop/src/main/appEventAdapter.ts:310-343`
- `/Users/jiangsheng/cnb/codex-desktop/src/renderer/components/ComposerContextUsage.tsx:20-65`

TUI `/status` 同样使用 `last_token_usage` 与运行时 `model_context_window`，但剩余百分比会先从
窗口和已用量中扣除固定 `12k` baseline，用于表达用户可支配上下文比例：

- `codex-rs/tui/src/token_usage.rs:9-53`
- `codex-rs/tui/src/status/card.rs:326-335`
- `codex-rs/tui/src/status/card.rs:394-405`

因此，`149k / 258k` 在桌面端按原始比例显示 `58% 已用`，按 TUI baseline 口径则约为
`56% 已用`。二者不是可互换的实现细节。本设计已明确选择桌面端原始比例，不复制 TUI 的
baseline 公式。

两处参考在数据身份上仍然一致：当前上下文必须读取 `last.totalTokens`，不得使用累计的
`total.totalTokens`。上下文压缩后 core 会更新当前活动上下文用量，同时保留会话累计量；若
GUI 错用 `total`，压缩后比例会持续增长并失真。

### 现有 GUI projection 没有用量链路

当前 `thread/projection/attach` snapshot 只有 `thread` 和 `headCommitId`，structural event
只有 turn/item 生命周期：

- `codex-rs/app-server-protocol/src/protocol/v2/thread_projection.rs:15-36`
- `codex-rs/app-server-protocol/src/protocol/v2/thread_projection.rs:87-113`

GUI Host 只选择 `thread/projection/event`、`thread/projection/delta` 和
`thread/projection/closed` 三类 projection 通知。普通 `thread/tokenUsage/updated` 虽然是
已知协议方法，但会被归类为 `knownUnconsumed`：

- `codex-gui/src/features/guiHost/appServerProtocol.ts:29-33`
- `codex-gui/src/generated/appServerProtocol/notificationDescriptors.ts:132-133`
- `codex-gui/src/generated/appServerProtocol/notificationDescriptors.ts:191-194`
- `codex-gui/src/features/guiHost/guiHostClient.ts:199-225`

这不是只扩充 allowlist 就能解决的问题。projection attach 不把连接注册为普通 thread
subscriber；普通 token usage 通知与 projection fanout 是两条投递路径：

- `codex-rs/app-server/src/thread_state.rs:283-305`
- `codex-rs/app-server/src/outgoing_message.rs:164-178`
- `codex-rs/app-server/src/thread_projection.rs:229-240`

即使 GUI Host 接受普通通知，标准 projection 连接通常也收不到它；并且普通通知没有 attach
基线、`subscriptionId` 或 projection commit 顺序。直接消费普通通知只会建立一条不完整的
旁路，不能作为本设计的实现方向。

### Composer 已有明确挂载位置

当前渲染链路是 `CurrentTaskPage → ComposerTurnControl`。Composer 的底部操作行左侧放置
二维码入口，右侧依次放置 `Stop` 与 `Send`：

- `codex-gui/src/features/currentTask/CurrentTaskPage.tsx:74-93`
- `codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx:181-260`

上下文用量属于当前可继续交互的 thread runtime，不属于 transcript，也不属于只读历史详情。
它应放在 Composer 右侧操作组中、`Stop` 之前；只读历史页没有 Composer，因此不新增同类入口。

本地 HeroUI v3 已提供 `Button`、`ProgressCircle` 与 `Popover`。`TextArea` 没有尾部 adornment
插槽，不能把指标作为原生 suffix 塞入输入框：

- `codex-gui/.heroui-docs/react/components/(forms)/text-area.mdx:116`
- `codex-gui/.heroui-docs/react/components/(feedback)/progress-circle.mdx:23-65`
- `codex-gui/.heroui-docs/react/components/(overlays)/popover.mdx:23-65`

## 已确认的产品语义

1. 主百分比表达“已用”，不表达“剩余”。环形填充随上下文占用增加。
2. 百分比采用原始 `last.totalTokens / modelContextWindow`，不扣除 TUI 的 `12k`
   baseline。
3. 指标是可操作的详情按钮。点击、触摸或按 Enter/Space 打开 HeroUI `Popover`；不使用只有
   hover 行为的伪按钮。
4. 本次只显示中性用量，不读取 `model_auto_compact_token_limit`，不增加警告色、危险色或
   自动压缩阈值文案。

## 权威 projection 设计

### Attach 基线

在 `ThreadProjectionSnapshot` 增加：

```rust
pub token_usage: Option<ThreadTokenUsage>,
```

该字段是 v2 response 字段，遵循现有协议规则：wire 上使用 `tokenUsage`，无数据时序列化为
`null`，不得使用 `skip_serializing_if`。

snapshot 构造阶段已经读取 loaded `CodexThread`。它应通过现有只读
`CodexThread::token_usage_info()` 获取完整权威状态并机械转换为 `ThreadTokenUsage`：

- `codex-rs/core/src/codex_thread.rs:491-500`
- `codex-rs/app-server/src/request_processors/thread_projection.rs:211-229`
- `codex-rs/app-server/src/request_processors/thread_projection.rs:289-292`

新 thread 尚无 token usage、旧 rollout 没有可恢复的 `TokenCount` 或当前状态确实未知时，
snapshot 返回 `null`。不得从 transcript 字符数、turn 数、配置窗口或累计 token 猜测基线。

### 有序 live update

在 `ThreadProjectionEvent` 增加 structural event variant：

```rust
TokenUsageUpdated {
    notification: ThreadTokenUsageUpdatedNotification,
}
```

`projection_event_from_notification` 将现有
`ServerNotification::ThreadTokenUsageUpdated` 映射为该 variant。payload 直接复用现有通知
类型，不创建 projection 专用的字段镜像。

使用 structural event 而不是 delta，原因是 token usage 是当前 thread runtime 的权威绝对
状态，需要进入 projection commit 链：

- 每次事件自动生成 `commitId`；
- `parentCommitId` 指向当前 projection head；
- 所有 subscriber 观察同一 per-thread 顺序；
- reattach 可从新 snapshot 重新建立绝对基线；
- backpressure 后继续复用现有 closed → reattach 恢复路径。

现有 commit 生成与 head 推进位于：

- `codex-rs/app-server/src/thread_projection.rs:243-269`
- `codex-rs/app-server/src/thread_projection.rs:486-507`

token usage 通知携带完整绝对快照，因此 GUI 只做整体覆盖，不累加。若 snapshot 在 attach
竞态中已经观察到某次用量，而同值 live event 随后再次到达，重复覆盖是幂等的；不得为此
新增第二套 replay identity 或 usage head。

### 不新增顶层 transport

GUI Host 仍只消费现有 `thread/projection/event` 顶层通知。新增 variant 自动沿用已有：

```text
GUI Host
  → GuiHostConnectionBridge
  → active thread owner
  → projection ingress / application coordinator
  → Redux threadRuntime
```

不得新增 `thread/projection/tokenUsage` 顶层通知，也不得给普通
`thread/tokenUsage/updated` 增加独立 callback。这样可避免扩宽 transport、bridge、startup
buffer 和 thread-switch owner union，并保持 attach/reconnect 只有一个权威入口。

协议改变后必须通过仓库生成流程更新 app-server schema、生成 TypeScript、机械 fixtures 与
app-server API 文档；禁止手工编辑生成文件或复制 fixture payload。

## GUI 状态与所有权设计

`ThreadRuntimeRecord` 增加从生成类型直接引用的当前 usage：

```ts
tokenUsage: ThreadTokenUsage | null;
```

状态转换规则：

- attach：从 `response.snapshot.tokenUsage` 初始化；
- `tokenUsageUpdated` live event：验证既有 owner、subscription 与 commit 链后，用事件中的完整
  `tokenUsage` 覆盖；
- replacement attach / reconnect：新 snapshot 替换旧 usage；
- thread 切换：usage 与整个 `ThreadRuntimeRecord` 一起切换，不跨 thread 搬运；
- cleanup：旧 owner 的迟到事件继续按现有 generation/subscription 规则失效。

token usage event 是 runtime 状态事件，不是 transcript item，也不改变 Composer queue：

- projection ingress 应将它识别为不依赖 parent turn 的合法 structural event；
- transcript projection 对该 variant 显式无操作；
- composer queue runtime observation 对该 variant 显式无操作；
- exhaustive switch 必须增加明确分支，不得用 wildcard 或 `default` 静默吞掉未来 variant。

相关接缝：

- `codex-gui/src/features/projectionIngress/projectionIngressAdapter.ts:187-213`
- `codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts:46-90`
- `codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts:106-188`
- `codex-gui/src/features/transcriptState/transcriptProjection.ts:60-87`
- `codex-gui/src/features/composerInputQueue/composerInputQueueRuntimeObservation.ts:11-28`

由 `threadRuntime` 导出单一 selector，再派生只读展示模型。展示模型属于前端展示语义，可以
包含 `usedTokens`、`modelContextWindow` 和计算后的 `percentUsed`，但其输入必须保持对生成
`ThreadTokenUsage` 的直接类型依赖，不得重新声明协议字段集合。

## 计算与边界行为

### 已知窗口

当 `tokenUsage != null` 且 `modelContextWindow > 0` 时：

```text
usedTokens  = tokenUsage.last.totalTokens
rawRatio    = usedTokens / modelContextWindow
percentUsed = round(clamp(rawRatio, 0, 1) * 100)
```

环形 `ProgressCircle` 的值与 Popover 文案使用同一个 `percentUsed`，不能分别计算。Popover
同时显示原始 `usedTokens` 和 `modelContextWindow`，使百分比与明细可以直接核对。

当 provider 上报 `usedTokens > modelContextWindow` 时，环形与百分比钳制为 `100%`，明细仍
显示权威原始 token 数，不静默改写 provider 数据。

### 用量未知

当 `tokenUsage == null` 时完全隐藏入口，不显示 `0%`、骨架或空占位。未知不等于零；GUI 不
照搬 `/status` 在“配置窗口已知但 token info 缺失”时使用 default usage 的回退。

### 窗口未知

当 `tokenUsage != null` 但 `modelContextWindow == null` 或非正数时，仍显示已用 token 数：

- 按钮显示 compact used token 数；
- `ProgressCircle` 使用 indeterminate 形态，表示比例无法确定；
- Popover 只说明已用 token 数和上下文窗口容量未知；
- 不生成百分比，不把空环解释为 `0%`。

这与现有数据契约中窗口可空的事实一致，也保留桌面端和 TUI bottom indicator 在容量未知时仍
能展示已用 token 数的能力。

### 数字格式

使用一个前端展示 formatter 生成紧凑 token 数：

- 小于 `1k`：显示整数；
- `1k` 到小于 `10k`：最多一位小数；
- `10k` 到小于 `1M`：按整数 `k`；
- `1M` 及以上：最多两位小数 `M`；
- 去除无意义的尾随零。

formatter 只负责展示，不改变 Redux 中的权威原始数值，也不复制协议类型。

## HeroUI 与 Composer 交互设计

### 组件结构

在 `ComposerTurnControl` 右侧操作组中、`Stop` 之前渲染：

```text
Popover
  ├─ Button size="sm" variant="tertiary"
  │    ├─ ProgressCircle size="sm" color="default"
  │    └─ compact used token count
  └─ Popover.Content placement="top"
       └─ Popover.Dialog
            ├─ Popover.Heading: 上下文用量
            ├─ 58% 已用
            └─ 已用 149k tokens，共 258k
```

真实 `Button` 直接作为 `Popover` 的触发元素，不再使用会生成额外
`div role="button"` 的 `Popover.Trigger` 包装。这样避免嵌套交互控件，并与 Composer 已有
`QrAccessPopover` 模式一致：

- `codex-gui/src/features/qrAccess/QrAccessPopover.tsx:28-72`
- `codex-gui/.heroui-docs/react/demos/en/popover/basic.tsx:1-35`

`Button` 使用语义 token 和 HeroUI focus-visible 状态，不硬编码颜色。所有用量区间保持
`color="default"`；本设计不根据百分比设置 warning/danger。

### 可访问性

- Button 的本地化可访问名称包含完整状态，例如“上下文用量详情，已用 58%，149k / 258k”。
- Button 内部 `ProgressCircle` 设为辅助技术隐藏，避免在一个具名按钮内部重复暴露第二个
  `progressbar`。详情事实由按钮名称和 Popover 正文完整提供。
- 点击、触摸、Enter 和 Space 都能打开 Popover；Escape 和既有 overlay dismiss 行为关闭。
- Popover 打开后使用 `Popover.Heading` 提供标题，不依赖颜色或环形图独占传递信息。
- 打开或关闭详情不改变 Composer 草稿、发送可用性、Stop 状态或焦点所有权。

### 国际化

可见文案、`aria-label` 和容量未知文案全部通过 Lingui 提取。数字格式与本地化文本分离，
不把完整英文句子拼接成不可翻译的字符串。中文目标文案为：

- `上下文用量`
- `{percent}% 已用`
- `已用 {used} tokens，共 {total}`
- `已用 {used} tokens；上下文窗口容量未知`

`tokens` 作为机器计量单位保留字面量；实现时可由 Lingui message 保持该单位在不同语言中的
位置可调整。

## 验证设计

### 协议与 app-server

验证以下权威链路：

- schema 生成包含 snapshot `tokenUsage: ThreadTokenUsage | null` 与新的 projection event
  variant；
- attach 在已有 token usage 时返回基线，无 usage 时返回 `null`；
- live `TokenCount` 产生 `tokenUsageUpdated` projection event；
- event 沿用现有 `commitId / parentCommitId`，不产生独立 head；
- attach 期间 snapshot-ahead 与随后同值 event 最终收敛为同一绝对状态；
- backpressure reattach 后由 snapshot 恢复最新 usage；
- app-server README 的 projection snapshot/event 文档与 wire contract 一致。

协议测试使用现有 Rust DTO 与生成流程；GUI 合法 projection payload 继续通过共享 fixture 和
builder 机械构造，不在测试中手写完整协议对象。

### GUI 状态

定向测试至少证明：

- attach baseline 初始化 `threadRuntime.tokenUsage`；
- live event 整体覆盖，而不是累加；
- snapshot duplicate 或重复绝对值不改变最终结果；
- stale thread、subscription 或旧 owner 事件不能污染当前 thread；
- replacement attach 和 manual reconnect 使用新 snapshot；
- token usage event 不改变 transcript、active turn 或 Composer queue；
- selector 使用 `last.totalTokens`，明确排除 `total.totalTokens`；
- 百分比按原始比例舍入并钳制，窗口未知时不伪造百分比。

### Browser 纵向路径

Composer Browser 测试至少覆盖：

- 无 token usage 时入口不存在；
- 已知窗口时显示 compact used token 数和中性环形比例；
- 点击、键盘与触摸语义均可打开真实 Popover；
- Popover 展示“已用百分比”和“已用 / 总容量”；
- 窗口未知时仍显示已用 tokens，并明确说明容量未知；
- live event 更新按钮名称、环形与 Popover 内容；
- thread replacement 后不保留旧 thread 用量；
- Stop/Send、草稿、队列提示与 Composer sticky 布局保持原行为。

测试断言稳定的用户行为、协议状态和 accessible name，不锁定 padding、gap、颜色值、阴影或
环形 SVG 的具体实现数值。

## 明确排除

- TUI `12k` baseline 百分比算法和“剩余百分比”主文案。
- `total.totalTokens` 会话累计用量、input/output breakdown 和账户 rate limits。
- `account/usage/read`、`rawResponse/completed.usage` 或前端 tokenizer 估算。
- 直接订阅普通 `thread/tokenUsage/updated` 或新增平行 GUI Host callback。
- 只加 live event 而没有 attach 基线，或只加 snapshot 而没有 live update。
- 自动压缩阈值、`config/read`、warning/danger 色和容量风险提示。
- transcript item、只读历史详情入口或跨 thread 用量汇总。
- 本地持久化、localStorage、跨页面缓存或兼容双路径。
- 修改 TUI `/status`、TUI status line 或 `codex-desktop`。

## 完成标准

只有以下纵向链路全部成立，才能称 GUI 上下文用量功能完成：

```text
core token usage
  → app-server ThreadTokenUsage
  → projection snapshot baseline / committed live event
  → current threadRuntime owner
  → derived raw used percentage
  → Composer Button + ProgressCircle + Popover
```

刷新、reattach、thread replacement 和 live update 后，GUI 必须始终显示当前 owner 的最新
绝对 usage；没有权威数据时保持未知，不用累计量、配置或 UI fallback 填补。仅完成静态组件、
仅接收普通通知或仅添加 Redux 字段，都不足以满足本设计。
