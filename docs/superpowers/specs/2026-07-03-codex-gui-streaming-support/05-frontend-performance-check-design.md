# Codex GUI 03 frontend performance check 设计

日期: 2026-07-09
状态: 05 设计初稿
范围: Codex GUI 03 assistant text streaming display 完成后的静态时间复杂度审计

## 目标

本设计定义 03 完成后的性能检查方式。检查对象是 Codex GUI assistant text streaming 的直接热路径，目标是用静态代码证据判断 03 增量是否引入、放大或暴露时间复杂度风险。

本检查不做 profiling、不跑 benchmark、不运行测试、不修复问题。它只输出审计结论和证据。

## 上游依据

`00-overall-design.md` 已把 streaming support 的总体性能边界固定为:

- 不在 hot path flatten 整个 transcript。
- committed transcript 保持权威内容边界。
- transient delta 不进入 committed transcript chunk。

`02-e-live-agent-message-render-state-design.md` 已把 agent message live state 修正为 reducer 写入时维护可渲染 list，selector 只做 O(1) 读取。

`03-assistant-text-streaming-display-design.md` 已要求:

- 保留 committed transcript 的 chunk-level 性能边界。
- 不让 live delta 重新 materialize committed chunk views。
- 不修改 `MiddleTranscriptChunk` 的 memo 边界。
- 不把 live item 合并进 committed chunk arrays。
- 不引入 read-time live item materialization。

已有 issue 目录 `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/` 提供本轮审计的时间复杂度口径和已知问题输入。

## 决策 1: 以静态时间复杂度审计为主

本轮性能检查按时间复杂度审计，不按视觉流畅度、耗时测量或性能分数审计。

每个审计条目必须写清楚:

- 触发源。
- 触发频率。
- 单次同步工作。
- 规模变量。
- 累计时间复杂度。
- 03 归因。
- 当前状态。

复杂度判断按 `触发频率 * 单次同步工作 * 规模变量` 展开。只有随明确规模变量增长而放大的问题才作为主 finding。常数级成本不作为主问题，除非它处于高频 delta/event 热路径并随触发频率重复发生。

## 决策 2: 范围只覆盖 03 增量和直接热路径

纳入范围:

- `GuiHostConnectionBridge` 中 projection delta 合批和投递到 Redux 的入口。
- `transcriptStateSlice` 中 live agent message state 的 started、delta、completed 写入路径。
- `CommittedTranscriptSurface` 中 live assistant message 的插入点和当前 turn 读取路径。
- `LiveMarkdownText` 的 streaming markdown 渲染入口。
- sticky-bottom 对 live scroll pulse 的响应路径。

排除范围:

- Rust projection、app-server v2 协议和 delta wire shape。
- 04 thinking、tool call、exec output、MCP progress 等扩展 streaming 类型。
- 全局长 transcript windowing 或 virtualization 设计。
- HeroUI 全量 CSS、首屏 bundle 体积、静态资源加载。
- 通用 React 性能调优、视觉动画和 layout 细节。

如果排除范围中存在问题，报告只能标记为 `非 03 归因` 或背景，不把它作为 03 性能检查 finding。

## 决策 3: 按已有 issue 映射审计切片

审计切片以已有 issue 为入口，再用当前代码证据重新确认状态。

主切片:

- `08-projection-delta-redux-action-frequency.md`: 检查 projection delta 频率是否仍直接绑定 Redux dispatch、Immer 写入和 store subscription。
- `09-projection-delta-transient-text-concat.md`: 检查 live text 累积是否仍存在长文本下反复复制导致的累计复杂度风险。
- `10-live-slot-selector-cache-invalidation.md`: 检查旧 live slot selector cache 高频失效问题在当前 02e/03 实现中是否仍成立、已修复或部分过期。

补充切片:

- `03-item-started-dirties-transcript-state.md`: 只复核重复 `itemStarted` 的窄边界，不把首次 `itemStarted` 创建可见 live render state 当作问题。

边界参考:

- `02-transcript-chunk-selector-view-rebuild.md`: 作为 committed chunk selector 和 memo 边界参考。
- `06-temporary-grouping-full-turn-scan.md`: 作为避免 turn-level flatten/grouping 回退的参考。
- `07-transcript-revision-invariant.md`: 作为 chunk/cache invalidation 不变量参考。

默认排除:

- `04-long-transcript-no-windowing.md`: 长历史 DOM/windowing 是结构性前端问题，但不是 03 增量专属。
- `05-heroui-full-css-import.md`: CSS 体积和首屏加载不是本轮时间复杂度热路径。

## 决策 4: issue 口径必须用当前代码证据校准

已有 issue 只能作为复杂度假设和历史输入。报告不得直接复制旧状态或旧行号作为当前结论。

每个切片必须:

- 引用对应 issue 中的复杂度假设。
- 读取当前代码确认相关路径是否仍存在。
- 判断旧 issue 是否仍成立、已修复、部分过期、非 03 归因或证据不足。
- 明确哪些旧结论因 02e/03 实现变化而过期。

例如旧 `10-live-slot-selector-cache-invalidation.md` 描述的是 live slot selector materialization 和 revision cache invalidation。当前 02e/03 已改为 reducer-owned renderable live list 和 O(1) selector 后，该 issue 不能原样复用，必须重新判断当前是否还有同类时间复杂度风险。

## 决策 5: 输出使用 issue 状态兼容标签

每个审计切片的当前状态只能使用以下标签:

- `仍成立`: 旧 issue 的复杂度风险在当前 03 实现中仍可由代码证据确认。
- `已修复`: 旧 issue 的风险路径已被当前实现消除。
- `部分过期`: 旧 issue 的原始形态过期，但仍有缩小后的复杂度边界需要记录。
- `非 03 归因`: 问题存在或可能存在，但不是 03 增量引入、放大或暴露。
- `证据不足`: 缺少当前代码证据或触发频率证据，不能下结论。

状态标签不替代复杂度描述。报告必须同时给出时间复杂度判断和状态标签。

## 决策 6: 报告只给审计结论，不提出修复方案

本轮报告可以说明某个风险后续需要单独设计或计划，但不得提出具体修复方案。

禁止内容:

- 不写具体 patch 方向。
- 不指定应修改哪个函数或组件。
- 不提出具体数据结构替换方案。
- 不设计节流、缓存、buffer、virtualization 或 markdown rendering 改造。

如果发现风险，报告只记录风险、证据、复杂度、03 归因和后续需要单独设计/计划。

## 报告结构

最终报告目录由设计阶段固定为:

```text
docs/superpowers/reports/2026-07-09-codex-gui-03-performance-check/
  00-summary.md
  01-03-hot-paths.md
```

`00-summary.md` 职责:

- 总体结论。
- 切片索引。
- 当前 03 归因风险列表。
- 非 03 归因或排除项摘要。
- 需要后续单独设计/计划的问题索引。

`01-03-hot-paths.md` 职责:

- 记录 `08`、`09`、`10`、`03` 映射切片的完整审计条目。
- 每个条目使用固定字段:
  - 关联 issue。
  - 触发源。
  - 触发频率。
  - 单次同步工作。
  - 规模变量。
  - 累计时间复杂度。
  - 03 归因。
  - 当前状态。
  - 当前代码证据路径/行号。
  - 排除项。

## 非目标

- 不修复性能问题。
- 不写 implementation plan。
- 不运行测试、benchmark、profiling、browser automation 或测量脚本。
- 不创建或更新 issue。
- 不修改 `codex-gui` 代码。
- 不评价 03 之外的全局前端性能。
- 不把旧 issue 原样复制为当前结论。

## 进入计划阶段的门禁

只有本设计被用户确认后，才能编写实施计划。

计划阶段必须单独定义:

- 哪些只读切片由子代理执行。
- 每个切片允许读取的 issue 和代码范围。
- 每个切片的输出格式。
- 报告文件的创建顺序。
- 是否允许任何命令执行。

在计划被用户确认之前，不得创建报告文件、执行审计、运行测试或修改代码。
