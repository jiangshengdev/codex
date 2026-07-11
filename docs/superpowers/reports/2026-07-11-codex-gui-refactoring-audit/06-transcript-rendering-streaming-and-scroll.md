# 06 Transcript 渲染、流式更新与滚动

状态：审计完成

## 审计范围

状态：审计完成。

计划范围：committed transcript surface、live Markdown/Streamdown、chunk equality、sticky-bottom、scroll hooks 与相关 React 组件。

## 范围交界

状态：审计完成。

- 允许交界：transcript selector output、AppShell composition。
- 禁止扩张：state shape、projection ingress、协议。

## 审计进度

| 微阶段 | 状态 | 压缩结论 | Finding ID / 覆盖状态 | 关键证据 |
| --- | --- | --- | --- | --- |
| R06-SURFACE | 完成 | 已由现有抽象覆盖，不建议重构：`MiddleTranscriptChunk` 已隔离 selector/equality adapter，`CommittedTranscriptTurn` 负责 turn-level committed/live 顺序编排。 | RA-06-001；已由现有抽象覆盖/非 finding | `CommittedTranscriptSurface.tsx:96-113,220-258`；`committedTranscriptChunkEquality.ts:34-59`；`transcriptStateSelectors.ts:14-41`；`CommittedTranscriptSurface.browser.test.tsx:219-307,421-519`；`committedTranscriptChunkEquality.test.ts:46-116` |
| R06-MARKDOWN | 完成 | 已由现有抽象覆盖：共享 Streamdown 配置集中于 `markdownRendering.tsx`，static committed 与 streaming live 由两个薄包装器明确表达差异。 | RA-06-001；已由现有抽象覆盖/非 finding | `markdownRendering.tsx:5-33`；`MarkdownText.tsx:11-27`；`LiveMarkdownText.tsx:11-29`；`CommittedTranscriptSurface.tsx:40-52,189-196`；`CommittedTranscriptSurface.browser.test.tsx:71-217,244-307` |
| R06-STICKY | 完成 | 已由现有抽象覆盖：transcript state 发布 committed/live scroll signals，AppShell 专用 hook 集中处理 sentinel 观察与 document scroll，AppShell 拥有 sentinel composition。 | RA-06-001；已由现有抽象覆盖/非 finding | `useCommittedTranscriptStickyBottom.ts:8-50`；`AppShell.tsx:50-76`；`transcriptStateSlice.ts:54-66,160-168`；`App.browser.test.tsx:532-744`；`transcriptStateScrollSignals.test.ts:33-235` |
| R06-BOUNDARY | 完成 | UI consumption、transcript selectors/signals 与 AppShell composition 保持单向依赖；计划文件与直接测试均已覆盖，本轮无确认重构点。 | RA-06-001；已由现有抽象覆盖/非 finding | 本报告 R06-SURFACE、R06-MARKDOWN、R06-STICKY 证据及 `AppShell.tsx:50-76` |

## Findings

状态：审计完成；包含一个“已由现有抽象覆盖”条目，无确认重构点。

### RA-06-001 渲染、Markdown 与 sticky-bottom 职责已由现有抽象覆盖

- **Finding ID：** `RA-06-001`。
- **主报告：** `06-transcript-rendering-streaming-and-scroll.md`。
- **Evidence owner：** `06-transcript-rendering-streaming-and-scroll`。
- **状态：** 已由现有抽象覆盖。
- **重构优先级：** 非 finding。
- **结论摘要：** Transcript state 只提供 render-ready selectors/views 与 committed/live scroll signals；Committed Transcript feature 拥有 turn-level committed/live composition、chunk render equality 和 static/live Markdown 语义；AppShell 通过专用 hook 与 sentinel 拥有 document-level sticky-bottom 副作用。三个 owner 形成单向依赖，本轮无确认重构点。
- **当前 owner 与当前职责：** `transcriptStateSelectors.ts` 构造并缓存 `TranscriptChunkView`、提供 live item views，`transcriptStateSlice.ts` 通过稳定 facade 导出 selector 与两个 scroll signals。`CommittedTranscriptSurface.tsx` 只消费公开 selector，内部组件分别处理 leading/middle/live/final composition；`committedTranscriptChunkEquality.ts` 保持 UI render equality；`markdownRendering.tsx` 集中共享 Streamdown policy，两个薄包装器表达 static/streaming 差异。`useCommittedTranscriptStickyBottom.ts` 集中 observer、pinned ref 与 document scroll，`AppShell.tsx` 拥有 sentinel 布局位置。
- **问题类型或为何不应继续抽象：** 各部分变化原因不同且已有窄边界：state view 随 transcript data identity/revision 变化，render composition 随 turn display 语义变化，Markdown 包装器随 static/streaming 模式变化，sticky hook 随 document layout 与 scroll signals 变化。新增统一 presenter、通用 Markdown variant wrapper、全局 scroll manager 或更宽 selector/effect 层会混合不同变化原因，并增加参数、间接层和迁移成本。
- **影响文件、定义侧、构造方、调用方和消费方：**
  - 定义侧：`transcriptStateSelectors.ts:14-53` 定义 chunk/live view helper；`transcriptStateSlice.ts:54-80,160-170` 定义并导出公开 selectors/signals；`markdownRendering.tsx:5-33` 定义共享 Markdown policy；`useCommittedTranscriptStickyBottom.ts:8-50` 定义 sticky-bottom effect。
  - 构造方：`transcriptChunkView` 从 transcript state 构造缓存 view；`CommittedTranscriptTurn` 从 turn、entry、chunk 与 live selectors 构造可见顺序；AppShell 构造 transcript surface、bottom sentinel 与 composer 的页面顺序。
  - 调用方：`MiddleTranscriptChunk` 调用 chunk selector/equality；`CommittedTranscriptEntry` 与 `LiveAssistantMessageEntry` 分别调用 static/live Markdown wrapper；`AppShell` 是 sticky hook 的唯一调用方。
  - 消费方：Committed Transcript 组件树消费 state views；Streamdown 消费共享 policy 与 source string；sticky hook 消费 committed key/live pulse 并只产生 document scroll 副作用。
- **共同语义或变化原因：** 三个节点共同服务 transcript 的可见输出，但分别拥有“渲染什么”“如何解释 Markdown”“何时保持 document 底部”三类语义；共同出现在一条 UI 链路不要求合并 owner。
- **保留边界与允许的依赖方向：** 保持 `transcript state selectors/signals → committed transcript UI consumption → AppShell composition` 的消费方向；UI feature 可以依赖公开 `TranscriptChunkView`，state 不依赖 UI equality、Markdown 或 DOM；AppShell 可以组合 surface 与 sticky hook，surface 不依赖 AppShell/document scroll；共享 Markdown policy 留在 committed transcript feature 内。
- **保持现状收益：** 维持 state/UI/DOM 副作用分层，避免 reducer 或 selector 感知 React/Streamdown/document，避免 static/live 差异被不透明参数化，也避免为单一 AppShell consumer 建立通用 scroll abstraction。现有单元、browser 与 signal 测试继续围绕稳定 owner 验证行为。
- **建议变更范围、最小可审查批次和明确排除范围：** 最小批次为无，不建议代码变更。明确排除 transcript reducer/projection、timeline material、协议、general Streamdown 性能、通用 AppShell/composer 重构及新增跨 feature presenter/scroll manager。
- **行为、状态、性能和测试风险：** 行为风险为 mixed middle/live/final DOM 顺序缺少直接断言，以及 `IntersectionObserver` 缺失时 sticky hook 保持初始 pinned 状态；状态风险为未来把 committed key/live pulse 泛化为无语义 activity counter；性能风险为 static/live wrappers 单边修改共享 props 后产生配置漂移或额外渲染；测试风险为 live 路径未单独覆盖与 static 相同的 HTML/image 安全 policy。以上均为保留风险，不升级为 finding。
- **后续实施时建议的验证范围：** 若未来触碰相关边界，运行 committed transcript browser tests、chunk equality tests、App sticky-bottom browser tests 与 transcript scroll signal tests，并精确核对 static/live Streamdown props、mixed-stage DOM order、pinned/scroll-away 行为及 selector equality。涉及代码修改时再运行项目要求的 type-check、lint 与格式化；本轮未运行任何测试或项目命令。
- **当前代码关键证据路径与行号：** `CommittedTranscriptSurface.tsx:40-64,96-113,117-218,220-279`；`committedTranscriptChunkEquality.ts:34-59`；`markdownRendering.tsx:5-33`；`MarkdownText.tsx:11-27`；`LiveMarkdownText.tsx:11-29`；`transcriptStateSelectors.ts:14-53`；`transcriptStateSlice.ts:54-80,160-170`；`useCommittedTranscriptStickyBottom.ts:8-50`；`AppShell.tsx:50-76`；`CommittedTranscriptSurface.browser.test.tsx:71-307,421-543`；`committedTranscriptChunkEquality.test.ts:46-116`；`App.browser.test.tsx:532-744`；`transcriptStateScrollSignals.test.ts:33-235`。
- **关联的既有报告、issue 或专项设计：** [RA-05-001](./05-transcript-state-and-materialization.md#ra-05-001) 是 transcript model/materialization、selector view cache 与 UI equality 定义侧边界的 Evidence owner；本条只拥有 UI consumption、Markdown 与 AppShell scroll effect，不复制 05 边界结论。[RA-01-001](./01-app-entry-shell-and-platform.md#ra-01-001) 已确认 typed Redux hooks 为应用状态访问入口，并把 `CommittedTranscriptSurface` 与 `useCommittedTranscriptStickyBottom` 列为直接消费者；本条沿用该入口，不新增 hook wrapper。
- **已排除项：** 不把 turn-level composition、UI equality adapter、static/live 薄包装器、document-level sticky hook 或两个窄 scroll signals 误报为重复抽象；不以测试缺口、未来滚动容器迁移或 props 漂移可能性代替当前 owner 问题证据；不进入 01/05 已拥有的 store、selector 定义侧或 retained state 结论。
- **报告建议：** 保留为 `RA-06-001`，状态“已由现有抽象覆盖”，重构优先级“非 finding”；R06 本轮不进入后续重构设计，只保留覆盖索引与边界风险。

## 已排除项

状态：审计完成。

- R06-SURFACE：不将 turn-level leading/middle/live/final composition 或 UI feature 内的 chunk equality adapter 记为重构 finding；不进入 transcript reducer/projection 内部。
- R06-MARKDOWN：不合并 static/live 包装器，不将共同配置抽象记为重构 finding；不进入 general Streamdown 性能审计。
- R06-STICKY：不将 document-level sticky-bottom hook、scroll signal selectors 或 AppShell sentinel composition 记为重构 finding；未审计 transcript reducer/projection 内部。

## 风险

状态：审计完成。

- R06-SURFACE：现有测试覆盖 stable-id reattach、live→final 切换及跨 chunk 分组，但没有直接断言 middle/live/final 混合阶段的 DOM 顺序；仅作为测试风险保留。
- R06-MARKDOWN：两个包装器重复传递共享 props，存在单边修改导致配置漂移的可能；安全行为测试集中于 static 路径，live 路径未单独覆盖相同策略。两项均仅作为风险保留。
- R06-STICKY：当前 hook 绑定 document scroller、viewport observer 与 sentinel 位置；`IntersectionObserver` 缺失时保持初始 pinned 状态；两个 Redux signal 不宜泛化为全局 activity counter。三项均仅作为边界风险保留。
