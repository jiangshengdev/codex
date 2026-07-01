# Codex GUI Markdown 渲染设计

**日期：** 2026-07-01

**状态：** 已完成对话内设计确认，待用户审阅后进入实施计划。

## 背景

历史设计文件
`/Users/jiangsheng/cnb/codex-desktop/docs/superpowers/specs/2026-04-20-markdown-rendering-design.md`
已经确定了 Markdown 渲染的核心边界：只在 renderer 展示层做受限渲染，核心状态继续保存纯文本，不支持 raw HTML、图片、外链点击等能力，也不把结构化运行块统一 Markdown 化。

当前项目是 `/Users/jiangsheng/cnb/codex` 下的 `codex-gui`，不能直接复用历史实现入口。当前 committed transcript 的主要入口是：

- `codex-gui/src/features/transcriptState/transcriptEntryMaterialization.ts`
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts`
- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx`

当前 `TranscriptEntry` 已经预留 `sourceKind: "plainText" | "markdown"`，但 `agentMessage` 与 `userMessage` 目前都 materialize 为 `plainText`。界面层当前统一使用纯文本 `Typography` 渲染。

## 目标

- 让 assistant message 支持基础 Markdown 排版。
- 保持 user message 与 status 的纯文本展示。
- 保持 transcript state 只保存纯文本 source，不保存 AST、HTML 或富文本结构。
- 保持当前 committed transcript 的 chunk-level performance boundaries。
- 保持 collapsed middle entries 不挂载、不预解析。
- 复用已安装的 `react-markdown` 依赖。

## 非目标

- 不让 user message 进入 Markdown 渲染。
- 不让 status 进入 Markdown 渲染。
- 不在本阶段渲染 `plan`、`reasoning`、`commandExecution`、`fileChange` 等非 message item；这些 item 当前也没有进入 committed transcript surface。
- 不支持 raw HTML。
- 不支持图片、音视频、iframe、脚本或样式注入。
- 不支持可点击外链。
- 不支持表格、任务列表、删除线、数学公式、Mermaid。
- 不支持代码语法高亮。
- 不引入 Markdown AST 缓存、增量 patch 或 selector 层预处理。

## 已确认决策

### 1. 接入范围

只让 assistant message 使用 Markdown。

- `agentMessage` materialize 为 `sourceKind: "markdown"`。
- `userMessage` 保持 `sourceKind: "plainText"`。
- `status` 继续走当前纯文本/专用展示。

### 2. Markdown 子集

支持基础受限 Markdown：

- 段落
- 标题
- 无序列表
- 有序列表
- 引用
- 行内 code
- fenced code block

禁止以下能力：

- raw HTML
- 图片
- 可点击链接
- 表格
- 任务列表
- 删除线
- 数学公式
- Mermaid

### 3. 渲染入口

Markdown 分流集中在 `CommittedTranscriptEntry` 内完成。

推荐规则：

- 当 `entry.type === "message"`、`entry.role === "assistant"` 且 `entry.sourceKind === "markdown"` 时，使用受限 Markdown renderer。
- 其他 entry 保持现有纯文本渲染。

这样可以让 `LeadingPromptEntry`、`MiddleTranscriptChunk`、`FinalAssistantMessages` 继续只负责选择与挂载 entry，不分散 Markdown 判断。

## 组件边界

新增一个受限展示组件，建议命名为 `MarkdownText`。

它只承担：

- 接收纯文本 `source`。
- 使用 `react-markdown` 渲染允许的 Markdown 子集。
- 用组件白名单收敛最终输出节点与样式。

它不承担：

- transcript 事件归并。
- Redux state 更新。
- selector 缓存。
- chunk view 构造。
- 链接点击行为。
- 命令输出、文件变更、计划步骤等结构化 block 展示。

实现时不应引入：

- `rehypeRaw`
- GFM 扩展
- `dangerouslySetInnerHTML`
- HTML 字符串快照
- Markdown AST 持久化

## 数据流

目标数据流如下：

1. `transcriptEntryMaterialization.ts` 将 `agentMessage` 转为 `TranscriptEntry`。
2. assistant entry 的 `source` 仍为原始纯文本，`sourceKind` 标记为 `markdown`。
3. `CommittedTranscriptEntry` 根据 `sourceKind` 选择纯文本或 Markdown 展示。
4. `MarkdownText` 只在 React 展示层解析当前 `source`。

该设计不改变 transcript snapshot、chunk id、turn slot、entry revision 或 selector 缓存模型。

## 性能边界

本设计必须保留 `codex-gui/AGENTS.md` 中的 transcript rendering 性能约束：

- 不在 render path 或 selector path flatten 全 turn。
- 不把 UI 分组、折叠、标签或 Markdown 渲染变成全 turn 数组扫描。
- 不在 collapsed middle entries 时挂载隐藏 entry。
- 不在 collapsed middle entries 时预解析 Markdown。
- 继续使用 chunk-level selector 和 chunk-level React component 边界。

具体约束：

- `MiddleTranscriptModule` 的 `shouldShowEntries ? ... : null` 挂载边界必须保留。
- `MiddleTranscriptChunk` 继续按 chunk 订阅 `selectTranscriptChunk`。
- Markdown 解析只发生在已经挂载的 `CommittedTranscriptEntry` 内。
- 不把 React Markdown 节点、AST 或派生结构写入 Redux state。

## 安全边界

Markdown renderer 必须是只读展示层。

要求：

- 使用 `react-markdown` 的安全默认模型。
- 启用 raw HTML 跳过或禁用策略。
- 限制允许输出的元素集合。
- 不渲染 `img`。
- 不输出可点击 `a`。
- 不添加外链打开逻辑。
- 不使用 `dangerouslySetInnerHTML`。

链接语法在本阶段不作为可点击链接支持。若输入包含 Markdown 链接，应避免产生可点击外链。

## 测试策略

后续实施计划应覆盖以下行为：

- assistant Markdown 能渲染标题、列表、引用、行内 code、fenced code block。
- user message 中的 Markdown 语法保持纯文本展示。
- raw HTML 不作为 HTML 生效。
- 图片语法不产生图片节点。
- 链接语法不产生可点击外链。
- collapsed middle Markdown 内容在展开前不进入 DOM。
- `agentMessage` materialization 输出 `sourceKind: "markdown"`。
- `userMessage` materialization 仍输出 `sourceKind: "plainText"`。

验证命令应使用 `codex-gui/package.json` 中实际存在的脚本，并在 `codex-gui` 目录按项目规则初始化用户 fnm 环境后运行。当前可用脚本包括：

- `pnpm run type-check`
- `pnpm run test:unit`
- `pnpm run test:browser`
- `pnpm run ci`

## 废弃旧方案说明

历史设计中的安全边界和展示层原则继续有效，但旧项目的 `HistoryBlock` / `EventItem` 接入点不适用于当前 `codex-gui`。

当前设计以 `TranscriptEntry.sourceKind` 和 `CommittedTranscriptEntry` 为入口，替代旧设计中的 renderer block 分流方式。
