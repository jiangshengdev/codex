# YOHO Single-Session Chat GUI Overall Design

## 目标

在 1 个月内，把当前 GUI 从连接状态验证面板推进为 YOHO 风格的单会话普通聊天界面。用户通过 TUI 的 `/gui` 打开当前 primary thread 后，可以在 GUI 中查看已有历史、继续发送消息、看到 assistant 流式回复、查看简化 tool activity，并在需要时中断当前 turn。

## 已确认范围

- 只支持 `/gui` 打开的单个当前会话。
- 启动后必须加载当前会话已有历史。
- 使用普通聊天模式，不复刻 TUI 的完整 transcript 模式。
- Composer 第一版只支持纯文本输入、发送和中断。
- Assistant 消息第一版只支持基础 Markdown：段落、列表、代码块和链接。
- Tool activity 使用简化详情：显示工具名、状态、关键输出片段，并支持展开查看更多。
- 先不做审核、review、approval、permissions 弹窗或类似控制流。

## 非目标

- 不做多会话列表、新建会话、恢复会话、fork 会话或会话切换。
- 不做 slash command 输入体验。
- 不做 `@file` mention、图片、文件附件或粘贴附件。
- 不做 TUI keymap、Vim 模式、composer 历史搜索。
- 不做 TUI transcript renderer 的完整迁移。
- 不把 GUI 做成 projection/debug 面板；projection 只是数据来源。

## 当前基线

当前 `codex-gui` 入口主要展示 GUI host 连接状态：连接、鉴权、initialize、attach、事件计数和最后事件类型。已有 Redux projection slice 可以接收 `thread/projection/attach` snapshot，并用 `thread/projection/event` 增量更新 thread projection。

TUI 侧已有 `/gui` 命令，负责为 primary thread 生成本地 GUI URL。这个目标继续沿用该入口，不扩大到独立 GUI 启动器或远程 GUI 会话。

## 推荐架构

GUI 保持以 app-server projection 为主要数据源：

1. `startGuiHostConnection` 从 URL 读取 `threadId` 和 launch token。
2. WebSocket 完成 `gui/authenticate` 和 `initialize`。
3. GUI 发送 `thread/projection/attach`，用返回 snapshot 渲染已有历史。
4. 后续 `thread/projection/event` 进入 Redux，更新当前会话。
5. Chat UI 从 projection state 派生普通聊天视图模型。
6. Composer 通过 app-server JSON-RPC 发送 `turn/start`，Stop 按钮发送 `turn/interrupt`。

关键原则：projection state 保存协议事实，chat view model 负责把协议 item 映射成普通聊天 UI。不要把 UI 展示字段混入 projection slice。

## UI 形态

第一版页面使用三段式结构：

- 顶部：当前会话标题、连接状态、turn 状态。
- 中部：聊天消息列表，默认滚动到最新消息。
- 底部：纯文本 composer、发送按钮、Stop 按钮。

消息列表按普通聊天产品展示：

- User message：右侧或主色气泡。
- Assistant message：左侧或中性色气泡，支持基础 Markdown。
- Tool activity：嵌入 assistant 区域的活动块，默认显示简化详情。
- Error/status：轻量提示行，不进入复杂 transcript 样式。

## ThreadItem 映射策略

第一版只定义稳定的 UI 语义，不追求覆盖所有 TUI transcript 细节：

- 用户输入 item 映射为 user message。
- Assistant 文本 item 映射为 assistant message。
- Tool call、shell、patch、file read 等 item 映射为 tool activity block。
- Tool 输出优先提取短摘要；完整输出通过展开区域查看。
- 未识别 item 映射为低噪声 activity block，显示类型和可读摘要。
- 审核、approval、review 相关 item 暂不做交互 UI；如果出现，只显示为只读 activity。

## Composer 行为

Composer 只负责单个会话的普通文本 turn：

- 空输入不能发送。
- Enter 发送，Shift+Enter 换行。
- 发送后清空输入。
- 当前 turn 进行中时显示 Stop。
- Stop 调用 `turn/interrupt`，并把 UI 状态切到中断中，等待 projection 或 app-server 事件确认。
- 发送失败时恢复输入文本，并显示错误提示。

## 状态与错误

GUI 至少需要区分这些状态：

- Connecting：WebSocket 尚未 attach。
- Attached：已有 snapshot 可用。
- Streaming：当前 turn 正在更新。
- Interrupting：用户已请求中断。
- Disconnected：WebSocket 正常关闭或断开。
- Error：鉴权、attach、协议解析或发送失败。

错误展示保持短句、可恢复优先。断连后第一版可以提示刷新页面，不要求自动重连。

## 周计划

### 第 1 周：聊天视图模型和历史渲染

- 从 projection snapshot 派生 chat message view model。
- 渲染 user/assistant 基础消息列表。
- 支持基础 Markdown。
- 加入已有历史加载验收。

### 第 2 周：Composer 和 turn 控制

- 实现纯文本 composer。
- 接入 `turn/start`。
- 接入 `turn/interrupt`。
- 补发送失败、中断中、turn 进行中状态。

### 第 3 周：Tool activity 简化详情

- 把 tool/shell/patch/file read item 映射为 activity block。
- 默认显示工具名、状态、关键输出片段。
- 支持展开更多详情。
- 补未知 item 的兜底展示。

### 第 4 周：打磨和验收

- 补空状态、错误状态、断连状态。
- 做桌面和窄屏布局验证。
- 增加 browser tests 和 e2e smoke。
- 用 `/gui` 打开真实单会话完成一次普通聊天验收。

## 验收标准

- 从 TUI 运行 `/gui` 打开的 GUI 能显示当前会话已有历史。
- 用户可以在 GUI 输入普通文本并发送到当前会话。
- Assistant 回复能在 GUI 中更新，并以基础 Markdown 呈现。
- 当前 turn 运行时，用户可以点击 Stop 发起中断。
- 至少一种 tool activity 能以简化详情展示，并可展开查看更多内容。
- GUI 不要求 review/approval 能力，也不要求多会话能力。
- Browser/e2e 覆盖 attach snapshot、projection event、发送 turn、中断 turn 和错误状态。

## 后续设计拆分

这份文件只定义总目标和边界。后续设计应继续放在同一目录下，按实现边界拆分：

- `01-chat-view-model.md`
- `02-message-rendering.md`
- `03-composer-turn-control.md`
- `04-tool-activity.md`
- `05-verification-plan.md`
