# assistant text streaming display 设计

日期: 2026-07-08
状态: 03 设计初稿
范围: Codex GUI 基于 02e live agent message render state 的最小 assistant 文本流式显示

## 目标

本设计只解决 `03 最小 assistant 文本显示`: GUI 如何把 `02e` 已维护好的 live agent message render state 显示到 transcript surface。

03 的目标是让用户在 projection subscription 下看到 assistant message 的实时文本:

- `itemStarted(agentMessage)` 到达后，turn 内出现稳定的 live assistant 显示位置。
- `thread/projection/delta(agentMessage)` 到达后，更新同一个 live assistant Markdown 输入。
- `itemCompleted(agentMessage)` 到达后，live item 从显示层消失，completed item 作为 committed transcript 的权威 final answer 显示。
- live delta 参与 sticky-bottom 行为，但不改变 committed transcript scroll commit key。

03 不重新设计 Rust projection 语义，也不重新设计 GUI live state。它只消费 `02e` 的数据层输出。

## 上游依据

`00-overall-design.md` 已定义 03 的边界: 只显示 assistant text streaming，不设计 thinking、tool call、exec output、MCP progress、复杂折叠或动画。

`02-e-live-agent-message-render-state-design.md` 是 03 的直接数据层依据:

- agent message live state 已由 reducer 写入时维护为可渲染 list。
- `selectTranscriptLiveItemsForTurn(state, turnId)` 目标是 O(1) 返回 store-owned live item array。
- `itemCompleted(agentMessage)` 写入 committed transcript 后，从 live list 移除对应 live item。
- live state 只表示 transient streaming 期间的可渲染状态。

当前 GUI 显示层已有 committed transcript 边界:

- `CommittedTranscriptSurface.tsx` 按 turn 渲染 leading prompt、middle chunks 和 final assistant messages。
- `MiddleTranscriptChunk` 使用 chunk selector 和 memo 边界保护 committed transcript hot path。
- `MarkdownText.tsx` 使用 Streamdown static mode 渲染已完成 assistant Markdown，并配置 sanitize、harden、skipHtml、禁用图片和 link safety。

## 决策 1: 03 只显示 agentMessage 文本

03 严格只消费 `TranscriptRenderableLiveItem` 中 `initialItem.type === "agentMessage"` 的 live item。

thinking/reasoning、tool call、exec output、command output 和其他 streaming item 类型不进入 03 显示层。

理由:

- 00 已把 thinking 和其他类型放到 04 扩展阶段。
- agent message 文本已有完整 01/02 数据闭环，适合作为最小可验收体验。
- thinking/reasoning 的 disclosure、raw/detail content、summary part 和权限边界需要单独设计。

边界:

- 03 不为 thinking/reasoning 预留具体 UI 挂点。
- 如果 live list 后续包含非 agentMessage item，03 显示层必须忽略它们。
- 非 agentMessage live item 的显示策略由 04 或后续子设计决定。

## 决策 2: live assistant text 插入 turn 的 final answer 位置前

`CommittedTranscriptTurn` 的渲染顺序扩展为:

```text
LeadingPromptEntry
MiddleTranscriptModule
LiveAssistantMessages
FinalAssistantMessages
```

`LiveAssistantMessages` 通过 `selectTranscriptLiveItemsForTurn(state, turnId)` 读取当前 turn 的 live items，并只渲染 agent message live item。

理由:

- streaming answer 和 completed final answer 属于同一语义位置。
- completed 后 live item 移除，committed final answer 出现，用户看到的是同一回答从 transient 状态收敛为权威状态。
- live assistant text 不会被放进 `Intermediate updates` 折叠模块，避免被误认为临时状态或被折叠隐藏。
- 放在 final answer 之后会造成 completed 后视觉位置回跳。

边界:

- `LiveAssistantMessages` 不读取 committed chunk entry ids，不 flatten turn 内 committed transcript。
- `MiddleTranscriptModule` 的折叠逻辑不影响 live assistant text。
- `FinalAssistantMessages` 继续只渲染 committed final assistant entries。

## 决策 3: 新增 LiveMarkdownText

新增 live 专用 Markdown 渲染组件，例如 `LiveMarkdownText`。

`LiveMarkdownText` 复用 committed `MarkdownText` 的安全和插件策略:

- Streamdown plugins 继续使用 code 和 cjk。
- rehype 继续使用 sanitize 和 harden。
- 继续 `skipHtml`。
- 继续禁止 `img`。
- 继续禁用 link safety modal。
- 继续保持 transcript text wrapping 和 code inline 样式一致。

live 渲染差异:

```text
mode = "streaming"
isAnimating = true
caret = "block"
```

理由:

- committed `MarkdownText` 保持 static mode，不承担 live 状态参数。
- live renderer 可以独立控制 streaming caret、动画和测试选择器。
- Streamdown 已经是 streaming-optimized renderer，03 不需要临时退化为 plain text。

边界:

- `MarkdownText` 不改成一套同时承载 committed/live 的多模式组件，除非实施阶段发现复用内部配置必须抽取 shared helper。
- 如果抽取 shared Streamdown 配置，只能抽取安全、插件和 components 配置；不能让 committed renderer 接收 live lifecycle props。
- live renderer 不保存 Markdown AST cache，不引入额外 render cache。

## 决策 4: live item 使用 transcript entry 相邻样式，但保持 transient class 边界

live assistant message 应复用 committed assistant message 的基本阅读宽度、card density、Markdown typography 和 wrapping 规则。

同时它需要独立 class 或 data attribute，例如:

```text
committed-transcript-live-entry
committed-transcript-live-assistant-message
```

理由:

- live text 是 transcript surface 的一部分，视觉上应与 completed assistant answer 连贯。
- 独立 selector 让 browser tests 可以稳定定位 live 内容。
- 独立 class 保留后续为 streaming caret、subtle pending state 或 reduced motion 调整样式的空间。

边界:

- 03 不设计复杂动画。
- 03 不新增 collapse/disclosure。
- 03 不用 visible 文案解释 streaming 状态。
- 03 不把 live item 包装成 committed `TranscriptEntry`。

## 决策 5: live delta 参与 sticky-bottom，但不更新 committed scroll key

live delta 到达并改变页面高度时，现有 sticky-bottom 行为应继续生效:

- 用户在底部附近时，页面跟随 live streaming 内容保持在底部。
- 用户手动离开底部阅读历史时，live delta 不强制拉回底部。

delta 不更新 `committedScrollCommitKey`。只有 completed item materialize 成 committed entry 时，沿用现有 committed scroll key 路径。

理由:

- streaming 长文本应让底部用户持续看到最新内容。
- 强制每个 delta 滚底会打断用户阅读历史。
- `committedScrollCommitKey` 表示 committed transcript 权威变化，不能由 transient delta 推进。

边界:

- 03 不把 delta 写入 committed transcript chunk。
- 03 不把 delta 作为 scroll commit key。
- sticky-bottom 的具体 hook 或 sentinel 复用现有 app shell 行为；如果实施阶段发现缺口，只能补 live height change 对 sticky-bottom 的触发，不改变 committed scroll key 语义。

## 数据流

### Started

```text
thread/projection/event(itemStarted(agentMessage))
  -> threadRuntimeEventBuffered
  -> transcriptState append live render item
  -> CommittedTranscriptTurn selects live items for turn
  -> LiveAssistantMessages renders started live item position
```

started live item 的 `transientText` 为空。显示层可以渲染空 Markdown container 或最小 pending visual，但 03 不要求可见 loading 文案。

### Delta

```text
thread/projection/delta(agentMessage)
  -> threadRuntimeDeltaAccepted or threadRuntimeDeltasAccepted
  -> transcriptState updates transientText and revision
  -> LiveMarkdownText receives updated transientText
  -> Streamdown streaming mode renders updated Markdown
```

delta 只改变 live item 的 transient display。它不改变 committed chunks、committed entries 或 committed scroll key。

### Completed

```text
thread/projection/event(itemCompleted(agentMessage))
  -> threadRuntimeEventBuffered
  -> transcriptState materializes committed entry
  -> transcriptState removes matching live item
  -> LiveAssistantMessages no longer renders that item
  -> FinalAssistantMessages renders committed final answer when applicable
```

completed item 是权威显示源。如果 transient text 与 completed text 不一致，UI 通过 live item 移除和 committed entry 显示完成收敛。

## 性能边界

03 必须保留 committed transcript 的 chunk-level 性能边界:

- 不在 `CommittedTranscriptSurface` 或 selector 中 flatten 全部 committed entries。
- 不让 live delta 重新 materialize committed chunk views。
- 不修改 `MiddleTranscriptChunk` 的 memo 边界。
- 不把 live item 合并进 committed chunk arrays。
- 不引入 read-time live item materialization。

`LiveAssistantMessages` 的读取范围只限当前 turn:

```text
selectTranscriptLiveItemsForTurn(state, turnId)
```

live item 数组由 reducer 写入时维护。显示层只过滤 agentMessage item 并渲染当前 turn 的 live list。

## 验收要求

后续 implementation plan 应覆盖以下可验证行为:

- `itemStarted(agentMessage)` 后，目标 turn 在 middle module 和 final assistant messages 之间拥有 live assistant 渲染位置。
- `thread/projection/delta(agentMessage)` 后，页面显示 live assistant text。
- 多个 delta 到达后，live Markdown 输入按顺序累积显示。
- `itemCompleted(agentMessage)` 后，live assistant text 消失，completed text 作为 committed final answer 显示。
- live text 使用 Streamdown streaming mode，committed text 继续使用 static mode。
- live delta 不更新 `committedScrollCommitKey`。
- 用户在底部时，live delta 更新保持 sticky-bottom。
- 用户离开底部时，live delta 不强制滚动到底部。
- live delta 不破坏 committed chunk memo 和 selector cache 边界。

## 非目标

- 不修改 Rust projection 实现。
- 不修改 app-server v2 协议字段。
- 不重新设计 `thread/projection/delta` wire shape。
- 不设计 thinking/reasoning UI。
- 不设计 tool call、exec output、command output 或 MCP progress streaming UI。
- 不设计复杂折叠、动画或 transition。
- 不把 transient delta materialize 进 committed transcript chunk。
- 不改变 completed item 的权威性。
- 不编写 implementation plan。
- 不指定具体测试命令。

## 后续关系

03 设计被确认后，下一步可以编写 implementation plan。计划应只覆盖 GUI 显示层接入:

- `CommittedTranscriptSurface.tsx` 的 live assistant 插入点。
- `LiveMarkdownText` 或等价 live Markdown 渲染组件。
- browser/component tests 中 live streaming display、completed convergence 和 sticky-bottom 验证。

thinking/reasoning 的 projection 数据契约已由 `04-a-thinking-projection-design.md` 单独设计。其 GUI 显示层不得合并进 03 的 implementation plan。
