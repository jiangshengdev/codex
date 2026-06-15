# Basic Chat Surface Design

## 目标

`06 Basic Chat Surface` 是 `06a/06b/06c/06d` 的总设计边界，不是一个独立实现任务。

不存在单独的 `06` plan，也不存在单独的 `06` implementation。后续实施必须从 `06a Chat Text Model` 开始，并按 `06a -> 06b -> 06c -> 06d` 严格串行推进。

`06a/06b/06c` 的目标是把 `05 Live Event Handling` 产出的 timeline material 推进为第一版纯文本普通聊天界面。`06d` 才单独设计基础 Markdown 渲染。

## 当前基线

`05` 已经提供组合 timeline：

```text
snapshotReplay materials
  + liveEventHandling materials
  + live subscription status material
```

当前 `App.tsx` 仍然是 GUI host debug panel，只显示连接状态、attach 状态、事件计数和最后事件类型。它已经负责把 GUI host projection callbacks 分发到 thread identity、projection ingress 和 thread runtime。

`06a/06b/06c` 的输入事实只能来自已完成的下层：

- `selectThreadTimelineMaterials(state)`。
- `selectThreadIdentityState(state)`。
- `selectThreadRuntimeActiveTurnId(state)` / `selectThreadRuntimeSubscription(state)`，如果 UI 状态需要。

`06a/06b/06c` 不能重新读取旧 `projectionSlice`，不能反向修改 `threadRuntimeSlice` 的 buffer 语义，也不能把 tool activity、composer 控制流或 Markdown 渲染提前塞进纯文本聊天链路。

## 已确认决策

**决策 1：`06a/06b/06c` 纯文本，`06d` 专门做 Markdown**

`06a/06b/06c` 只展示纯文本 user / assistant 消息和轻量状态。Assistant 文本只读取现有 projection snapshot/event 中完整的 `agentMessage.text`，Markdown 语法按普通纯文本显示。

基础 Markdown 渲染由 `06d Basic Markdown Rendering` 单独设计，不进入 `06a/06b/06c` 的验收口径。

**决策 2：`06` 只是总设计/目录，不是实现任务**

`06` 不对应代码改动任务。后续不能创建一个“实现 06”的大计划来串联全部工作；每个子任务必须独立设计、计划、实现和验收。

**决策 3：严格串行推进**

推进顺序固定为：

```text
06a Chat Text Model
  -> 06b Plain Text Chat Shell
  -> 06c App Integration And Browser Coverage
  -> 06d Basic Markdown Rendering
```

不得合并 `06a` 和 `06b`，也不得把 `06c` 的 App 集成验收混入前两个阶段。

**决策 4：总设计只定义边界**

本文件只定义 abcd 的边界、顺序、非目标和跨阶段验收口径。

它不提前规定 `06a` 的具体 TypeScript 字段、`06b` 的 DOM 结构、`06c` 的测试细节或 `06d` 的 Markdown 依赖。那些内容必须留到对应子设计中确认。

**决策 5：同步收敛 `00-overall-design.md`**

`00-overall-design.md` 可以保留最终目标里的基础 Markdown 能力，但必须明确 `06a/06b/06c` 是纯文本链路，`06d` 才处理 Markdown，避免读起来像前三个子任务已经要支持 Markdown。

**决策 6：`06c` 只做集成和 browser coverage**

`06c` 负责把 `06a` 和 `06b` 稳定接入 `App.tsx`，并通过 browser coverage 验收真实路径。它不新增 chat model 能力，不新增展示能力，不补齐 `06b` 未完成的 UI 行为。

**决策 7：`06c` 替换 debug panel 主界面**

`06c` 完成后，主界面应从 GUI host debug panel 转为普通聊天界面。必要的连接、attach 或 turn 状态可以保留为轻量顶部信息或状态行，但调试面板不再作为主界面存在。

**决策 8：`06d` 是后续独立设计阶段**

`06d` 不属于当前纯文本链路验收。`06a/06b/06c` 完成后，纯文本 chat surface 可以独立验收；Markdown 另开 `06d`。

**决策 9：总设计只列跨阶段最终口径**

本文件只列 abcd 合起来的方向和验收口径。每个子任务必须在自己的设计中定义可独立证明的验收标准，避免把这里写成一个不存在的 `06` 实现任务。

## 子设计边界

### 06a Chat Text Model

`06a` 是纯 TypeScript / selector 阶段。

职责：

- 从 `selectThreadTimelineMaterials(state)` 派生普通聊天可消费的纯文本 model。
- 只建立 user / assistant 纯文本消息和轻量状态行的模型边界。
- 保留 replay/live ordering，不重新按 timestamp 排序。

非目标：

- 不渲染 React。
- 不写 HTML/CSS。
- 不处理 Markdown。
- 不处理 composer。
- 不处理 tool activity。
- 不规定最终页面结构。

`06a` 的具体输出类型、字段命名、id 策略、ignored item 策略和 status row 文案必须在 `06a` 子设计中单独确认。

### 06b Plain Text Chat Shell

`06b` 是 React / HTML / CSS 阶段。

职责：

- 用 `06a` 的纯文本 chat model 渲染三段式聊天页面。
- 顶部显示当前会话和轻量连接/turn 状态。
- 中部显示纯文本消息列表。
- 底部显示 composer 占位或 disabled shell。
- 保持白色视觉风格。
- 使用全局页面滚动，不把消息列表做成独立滚动容器。

非目标：

- 不发送消息。
- 不中断 turn。
- 不渲染 Markdown。
- 不展示 tool activity 详情。
- 不直接解释 raw timeline material。

`06b` 不接入真实 GUI host path；它只定义和验证 shell/UI 自身。

### 06c App Integration And Browser Coverage

`06c` 是集成和验收阶段。

职责：

- 把 `06a` 和 `06b` 稳定接入 `App.tsx`。
- 用聊天界面替换当前 GUI host debug panel 主界面。
- 保留必要的轻量连接、attach 或 turn 状态。
- 更新 browser tests，覆盖真实 App 路径。
- 覆盖 snapshot 历史消息、live assistant 完整文本消息、manual reconnect 状态和 mismatch attach 阻断。

非目标：

- 不新增 chat model 能力。
- 不新增 shell/UI 展示能力。
- 不新增 Markdown。
- 不新增 composer 行为。
- 不新增 tool activity。

### 06d Basic Markdown Rendering

`06d` 是后续独立设计阶段。

职责：

- 在纯文本聊天链路稳定后，单独设计基础 Markdown 渲染。
- 决定是否引入 Markdown 渲染依赖。
- 决定段落、列表、代码块、链接的最小支持范围。
- 决定链接安全策略。
- 决定代码块在白色界面中的视觉风格。

非目标：

- 不回头改变 `05` timeline material 语义。
- 不把 Markdown 能力塞回 `06a/06b/06c` 的验收口径。
- 不顺手实现 composer、Stop 或 tool activity。

## 纯文本链路范围

`06a/06b/06c` 第一版只覆盖普通聊天主线：

- user message 的文本内容。
- assistant 完整文本消息。
- manual reconnect 等轻量状态行。

以下能力不进入 `06a/06b/06c`：

- Markdown 渲染。
- composer 发送。
- Stop / interrupt。
- tool activity 展开或输出片段。
- streaming delta / append buffer。
- 图片、文件、mention、skill 等富输入展示。
- review mode 和 context compaction 专门 UI。

这些能力应由 `06d`、`07 Composer Turn Control`、`08 Tool Activity` 或后续专门阶段处理。

## UI 边界

`06b/06c` 的页面形态延续总体设计：

- 顶部：当前会话标题、连接状态、turn 状态。
- 中部：纯文本消息列表。
- 底部：composer 占位或 disabled shell。

样式约束：

- 单一白色界面。
- 不引入暗色消息块或暗色代码块。
- 文本必须在移动和桌面宽度下稳定换行。
- 历史消息很长时使用 window/global scroll。
- 底部区域固定可见时，主体内容必须预留底部空间。

## 跨阶段验收口径

`06a/06b/06c` 完成后：

- GUI attach 后能从 snapshot 显示已有 user / assistant 纯文本消息。
- live `agentMessage` 完成后能追加显示 assistant 纯文本消息。
- manual reconnect 能显示轻量状态行。
- mismatched attach 不显示聊天主界面或不推进 chat text model。
- 主界面从 debug panel 转为普通聊天 shell。
- 底部 composer 只作为占位，不发送消息。
- Markdown 语法作为普通文本显示。
- 不展示 tool activity 详情。

`06d` 完成后，才开始验收基础 Markdown 渲染。

分阶段验收：

- `06a` 只验收 chat text model。
- `06b` 只验收纯文本 shell 的结构和样式。
- `06c` 只验收 App 集成和 browser coverage。
- `06d` 只验收基础 Markdown 渲染。

## 设计原则

- 不让 UI 直接解释 raw protocol item。
- 不让 `06a/06b/06c` 反向修改 `05` 的 timeline material 语义。
- 不在纯文本阶段引入 Markdown 依赖。
- 不在聊天展示阶段顺手实现 composer 或 tool activity。
- 每个子设计必须足够小，可以独立实现、独立回退、独立验收。
