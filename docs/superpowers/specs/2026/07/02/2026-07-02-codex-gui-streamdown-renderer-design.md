# Codex GUI Streamdown Renderer 设计

## 背景

`codex-gui` 当前 committed transcript 的 Markdown 渲染边界在
`codex-gui/src/features/committedTranscriptSurface/MarkdownText.tsx`。
`CommittedTranscriptSurface` 只在 assistant message 且 `sourceKind` 为 `markdown`
时调用该组件；用户消息继续按纯文本渲染。

当前实现使用 `react-markdown`，并在 `MarkdownText` 内维护一组自定义
Markdown components、元素白名单和样式类。新的方向是把 completed assistant
Markdown renderer 迁移到 Streamdown，同时保持 transcript state 和 turn/chunk
结构不变。

本设计只覆盖 completed renderer 替换。Rust/app-server 侧已有
`thread/projection/delta` 流式能力，但本轮不接入 GUI delta，不新增 streaming
transcript state，也不改变 `itemStarted` / `itemCompleted` 生命周期。

## 目标

- 使用 `Streamdown` 替代 `react-markdown` 渲染 completed assistant Markdown。
- 保留 `MarkdownText` 作为 committed transcript 的 Markdown 渲染边界。
- 启用 Streamdown 的 `code` 和 `cjk` 插件。
- 不启用 `math` 插件，即使依赖已经安装。
- 删除旧 `react-markdown` 自定义 components，采用 Streamdown 默认样式和控件。
- 继续禁止 raw HTML 生效。
- 继续禁止 Markdown 图片生成 active DOM。
- 允许 Markdown 链接生成可点击链接，并关闭 Streamdown link safety。
- 迁移后如果没有其他引用，移除 `react-markdown` 依赖。

## 非目标

- 不消费 `thread/projection/delta`。
- 不实现流式 assistant 文本显示。
- 不新增 streaming entry、draft entry 或 transient transcript reducer 状态。
- 不启用 `@streamdown/math`，不引入 KaTeX CSS。
- 不引入 Mermaid。
- 不追求旧 HeroUI Markdown class 的逐项视觉兼容。

## 组件边界

`CommittedTranscriptSurface` 继续只负责 transcript 结构渲染和 entry 类型判断：

- user message 仍走纯文本 `Typography`。
- assistant markdown message 仍调用 `MarkdownText`。
- intermediate disclosure 的折叠行为不变；折叠内容不提前 mount。

`MarkdownText` 负责封装 Streamdown 配置：

- `mode="static"`，因为输入是 completed committed Markdown。
- `plugins={{ code, cjk }}`。
- `skipHtml`。
- `linkSafety={{ enabled: false }}`。
- 通过元素过滤或 disallow 策略禁止图片成为 active DOM。
- 保留外层 transcript className，用于现有页面布局和测试定位。

如果 Streamdown 类型需要替代 `react-markdown` 的类型：

- `Options` 使用 `ComponentPropsWithoutRef<typeof Streamdown>`。
- `Components` 使用
  `ComponentPropsWithoutRef<typeof Streamdown>["components"]`。

本设计预期删除旧 custom components 后不再需要本地 `Components` 类型；只有在实现中确实保留局部组件覆盖时才引入该类型。

## 插件与样式

本轮启用的插件是：

- `streamdown`
- `@streamdown/code`
- `@streamdown/cjk`

本轮不启用：

- `@streamdown/math`

`codex-gui` 使用 Tailwind 4，因此需要在 `codex-gui/src/index.css` 顶部 import
之后加入 Streamdown source：

- `@source "../node_modules/streamdown/dist/*.js";`
- `@source "../node_modules/@streamdown/code/dist/*.js";`
- `@source "../node_modules/@streamdown/cjk/dist/*.js";`

不加入 `@streamdown/math` source，因为本轮不启用 math 插件。

## 安全语义

本迁移有两个明确的安全语义：

- raw HTML 继续不生效。现有 unsafe HTML 不应变成 active DOM。
- 图片继续不渲染。Markdown 图片不应生成 `<img>`。

本迁移有一个有意改变：

- Markdown 链接允许生成 active `<a>`，并关闭 Streamdown link safety。

测试需要反映这个改变：旧测试中“链接不生成 active DOM”的断言要改为“链接可见且可点击”，同时继续验证 raw HTML 和图片没有 active DOM。

## 数据流

数据流不变：

1. `transcriptEntryMaterialization.ts` 将 assistant `agentMessage.text` 物化为
   `sourceKind: "markdown"`。
2. `transcriptStateSlice.ts` 只在 snapshot rebuild 和 live `itemCompleted` 时写入
   committed transcript entry。
3. `CommittedTranscriptSurface` 根据 entry role 和 `sourceKind` 选择纯文本或
   `MarkdownText`。
4. `MarkdownText` 使用 Streamdown 渲染 completed markdown 字符串。

`itemStarted` 仍不物化 transcript entry。`thread/projection/delta` 仍不进入 GUI
runtime 或 transcript state。

## 测试策略

Browser test 只锁行为，不锁旧样式 class：

- assistant Markdown 能渲染 heading、blockquote、list、inline code、fenced code。
- user Markdown 语法继续按纯文本显示。
- raw HTML 不生成 active DOM。
- Markdown 图片不生成 `<img>`。
- Markdown 链接生成 active `<a>`，并且不需要 Streamdown link safety 交互。
- 折叠的 temporary Markdown 在展开前不 mount，展开后才渲染。

实现后应使用当前 `codex-gui/package.json` 中存在的脚本验证：

- `pnpm run test:browser`
- `pnpm run type-check`

如果实现触及格式或 lint，按当前项目脚本使用 `pnpm run format:oxfmt` 和
`pnpm run lint`。

## 提交边界

后续实现按“每一个任务一个提交”拆分，至少保持以下边界：

- 依赖变更提交：只包含 Streamdown 相关依赖安装产生的 `package.json` 和
  `pnpm-lock.yaml` 变化。
- renderer 迁移提交：替换 `ReactMarkdown` 为 `Streamdown`，保留 `MarkdownText`
  wrapper，并启用 `code` / `cjk`。
- Tailwind source 提交：加入本轮启用包对应的 `@source`。
- 测试调整提交：更新 browser behavior tests，不再锁旧样式 class。
- 旧依赖移除提交：确认无引用后移除 `react-markdown`。

这些边界描述实现提交的审查粒度，不代表已经批准进入实现。实现计划仍需在设计被接受后单独制定。
