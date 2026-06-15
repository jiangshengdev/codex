# Basic Chat Surface Design

## 目标

`06 Basic Chat Surface` 把 `05 Live Event Handling` 产出的 timeline material 推进为第一版普通聊天界面。

这一阶段只做纯文本聊天体验：从已有 snapshot/live projection 数据中展示用户消息、assistant 完整文本消息和轻量状态行。它不实现 Markdown 渲染、不实现 composer 发送、不实现 Stop、不实现 tool activity 展开，也不接入真实 streaming delta。

`06` 的复杂度明显高于 `01` 到 `05`。前面阶段主要是协议输入、runtime state 和 selector；`06` 会开始同时触碰 TypeScript view model、React 结构、HTML 语义、CSS/Tailwind 布局和 browser test。因此 `06` 不作为一个单一实现设计推进，而是作为总览阶段拆成多个独立子设计。

## 当前基线

`05` 已经提供组合 timeline：

```text
snapshotReplay materials
  + liveEventHandling materials
  + live subscription status material
```

当前 `App.tsx` 仍然是 GUI host debug panel，只显示连接状态、attach 状态、事件计数和最后事件类型。它已经负责把 GUI host projection callbacks 分发到 thread identity、projection ingress 和 thread runtime。

`06` 的输入事实只能来自已完成的下层：

- `selectThreadTimelineMaterials(state)`。
- `selectThreadIdentityState(state)`。
- `selectThreadRuntimeActiveTurnId(state)` / `selectThreadRuntimeSubscription(state)`，如果 UI 状态需要。

`06` 不能重新读取旧 `projectionSlice`，不能反向修改 `threadRuntimeSlice` 的 buffer 语义，也不能把 tool activity 或 composer 控制流提前塞进聊天 surface。

## 为什么拆分

如果把 `06` 做成一个设计和一个计划，会混合这些职责：

- 解释 `ThreadItem`，决定哪些 item 属于普通聊天主线。
- 把 replay/live lifecycle material 合并成用户可理解的消息和状态。
- 设计 chat view model 的稳定字段。
- 替换 `App.tsx` 的 debug panel。
- 设计页面 HTML 结构、滚动行为和白色视觉风格。
- 编写 CSS/Tailwind 样式。
- 更新 browser tests 覆盖 snapshot 历史和 live 更新。
- 决定 Markdown 渲染策略。

这些职责的变更风险不同，也需要不同验证方式。拆分后每个子阶段都可以像 `01` 到 `05` 一样独立实现、独立回退、独立验收。

## 已确认决策

**决策 1：`06` 先做纯文本，不做 Markdown**

Assistant 第一版只展示完整 `agentMessage.text`。文本中的 Markdown 语法可以按普通纯文本显示。基础 Markdown 渲染必须作为后续独立阶段处理。

**决策 2：先模型，后 UI**

先从 timeline material 派生 chat text model，再让 React UI 消费该 model。UI 不直接解释 `ThreadItem`，也不直接遍历 raw timeline material。

**决策 3：`06` 不实现 composer 行为**

底部 composer 可以作为占位 shell 出现，但不发送 `turn/start`，不处理中断。真正输入、发送和 Stop 属于 `07 Composer Turn Control`。

**决策 4：tool activity 不进入 `06`**

`commandExecution`、`mcpToolCall`、`dynamicToolCall` 等 tool item 不在 `06` 展示为 tool activity。它们留给 `08 Tool Activity`。`06` 可以忽略这些 item，或在 text model 中保留最小状态 entry，但不得实现展开、输出片段或 tool 详情。

**决策 5：当前不引入 streaming buffer**

Rust / app-server streaming contract 未明确前，`06` 不提前实现可 append assistant buffer。assistant 消息只来自 projection snapshot/event 中完整的 `agentMessage.text`。

## 子阶段拆分

### 06a Chat Text Model

`06a` 是纯 TypeScript / selector 阶段。

职责：

- 输入 `selectThreadTimelineMaterials(state)`。
- 输出普通聊天可消费的 text model。
- 只解释 `userMessage` 和 `agentMessage`。
- 从 manual reconnect material 派生轻量 status row。
- 保留 replay/live ordering，不重新按 timestamp 排序。

非目标：

- 不渲染 React。
- 不写 HTML/CSS。
- 不处理 Markdown。
- 不处理 composer。
- 不处理 tool activity。

建议输出形状在 `06a` 设计中单独确认，例如：

```ts
type ChatTextEntry =
  | { type: "message"; id: string; role: "user" | "assistant"; text: string }
  | { type: "status"; id: string; status: "subscriptionInterrupted"; text: string };
```

实际字段以 `06a` 设计为准。

### 06b Plain Text Chat Shell

`06b` 是 React / HTML / CSS 阶段。

职责：

- 用 `06a` 的 chat text model 渲染三段式聊天页面。
- 顶部显示当前会话和连接/turn 状态。
- 中部显示纯文本消息列表。
- 底部显示 composer 占位或 disabled shell。
- 保持白色视觉风格。
- 使用全局页面滚动，不把消息列表做成独立滚动容器。

非目标：

- 不发送消息。
- 不中断 turn。
- 不渲染 Markdown。
- 不展示 tool activity 详情。

这一阶段会替换当前 `App.tsx` 里的 GUI host debug panel 主界面，但可以保留必要的轻量连接状态信息。

### 06c App Integration And Browser Coverage

`06c` 是集成和验收阶段。

职责：

- 把 `06a` 和 `06b` 稳定接入 `App.tsx`。
- 更新 browser tests。
- 覆盖 attach snapshot 历史消息展示。
- 覆盖 live `itemCompleted(agentMessage)` 后出现 assistant 消息。
- 覆盖 manual reconnect status 展示。
- 确认 mismatch attach 不推进聊天 UI。

非目标：

- 不新增 chat model 能力。
- 不新增 Markdown。
- 不新增 composer 行为。

### 06d Basic Markdown Rendering（后续阶段）

Markdown 不进入当前纯文本 `06` 主线。纯文本聊天稳定后，再单独设计基础 Markdown 渲染。

该后续阶段需要单独决定：

- 是否引入 Markdown 渲染依赖。
- 段落、列表、代码块、链接的最小支持范围。
- 链接安全策略。
- 代码块在白色界面中的视觉风格。

## Chat Text Model 范围

第一版只进入普通聊天主线的 item：

- `ThreadItem.type === "userMessage"`。
- `ThreadItem.type === "agentMessage"`。

`userMessage.content` 第一版只展示 `type === "text"` 的输入。图片、文件、mention、skill 等输入不在 `06` 展示。

`agentMessage.text` 第一版按纯文本展示。`phase`、`memoryCitation` 可以先不渲染，除非 `06a` 明确需要保留为后续字段。

以下 item 不属于 `06` 的主线能力：

- `plan`。
- `reasoning`。
- `commandExecution`。
- `fileChange`。
- `mcpToolCall`。
- `dynamicToolCall`。
- `collabAgentToolCall`。
- `webSearch`。
- `imageView`。
- `imageGeneration`。
- review mode 和 context compaction items。

这些 item 的展示应由后续 status、tool activity 或专门 UI 阶段处理。

## UI 边界

`06b` 的页面形态延续总体设计：

- 顶部：当前会话标题、连接状态、turn 状态。
- 中部：纯文本消息列表。
- 底部：composer 占位或 disabled shell。

样式约束：

- 单一白色界面。
- 不引入暗色消息块或暗色代码块。
- 文本必须在移动和桌面宽度下稳定换行。
- 历史消息很长时使用 window/global scroll。
- 底部区域固定可见时，主体内容必须预留底部空间。

## 验收标准

`06` 总体验收：

- GUI attach 后能从 snapshot 显示已有 user / assistant 纯文本消息。
- live `agentMessage` 完成后能追加显示 assistant 纯文本消息。
- manual reconnect 能显示轻量状态行。
- mismatched attach 不显示聊天主界面或不推进 chat text model。
- 页面从 debug panel 转为普通聊天 shell。
- 底部 composer 只作为占位，不发送消息。
- 不渲染 Markdown；Markdown 语法作为普通文本显示。
- 不展示 tool activity 详情。

分阶段验收：

- `06a` 只验收 chat text model。
- `06b` 只验收纯文本 shell 的结构和样式。
- `06c` 只验收 App 集成和 browser coverage。
- `06d` 单独设计后再验收 Markdown。

## 设计原则

- 不让 UI 直接解释 raw protocol item。
- 不让 `06` 反向修改 `05` 的 timeline material 语义。
- 不在纯文本阶段引入 Markdown 依赖。
- 不在聊天展示阶段顺手实现 composer 或 tool activity。
- 每个子阶段都必须能用 focused test 或 browser test 独立证明。
