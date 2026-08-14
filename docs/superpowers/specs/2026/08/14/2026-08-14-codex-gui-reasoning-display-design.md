# Codex GUI reasoning summary 显示设计

## 背景

app-server v2 已把 reasoning 作为结构化 `ThreadItem` 暴露：完成态包含
`summary: Vec<String>` 与 `content: Vec<String>`，流式态则通过带
`summaryIndex` 的 `reasoningSummaryText` 和 `reasoningSummaryPartAdded`
增量描述 summary，并另行提供 raw `reasoningText`。

当前 GUI 在 `transcriptItemPolicy.ts` 中明确忽略 reasoning 的 started、completed
和全部 reasoning delta，`transcriptStateModel.ts` 也没有 reasoning 对应的 stored entry
或 view。因此问题不是现有样式没有显示出来，而是 reasoning 尚未进入 GUI transcript
的投影、状态和渲染链路。

本设计承接
[`2026-08-14-codex-gui-reasoning-display-decisions.md`](../../../../research/2026/08/14/2026-08-14-codex-gui-reasoning-display-decisions.md)
中的已确认决策。TUI 仅作为显示语义参考：生成中从当前 summary part 提取标题，完成后把
summary parts 合成一个 `ReasoningSummaryCell`，以圆点、弱化和斜体 Markdown 显示。

## 目标

- 让 GUI 在 reasoning 生成期间显示当前最新的 summary 标题。
- reasoning item 完成后，在 transcript 中固化其完整、权威的 `summary`。
- 保持 reasoning 与 commentary、可见 agent activity 的原始事件顺序。
- final answer 出现后，让 reasoning 与其他 middle entry 一起进入现有
  `Intermediate updates` disclosure，并沿用默认折叠行为。
- 保持 transcript 的 chunk 级更新、selector cache 和重连重建边界。

## 非目标

- 不保存、投影或渲染 raw `content`、`reasoningText`。
- 不在 summary 缺失时用 raw reasoning 兜底。
- 不修改 app-server 协议或生成的协议类型。
- 不新增 reasoning 的独立 disclosure、完整消息 Card 或可见 `Thinking` 标签。
- 不改变 `Intermediate updates` 的计数、展开条件和默认折叠规则。
- 不在本设计中编写实施计划或修改代码。

## 已确认的产品语义

1. GUI 的唯一 reasoning 内容来源是完成态 `summary` 与流式 summary delta。
2. 生成期间只显示一个临时标题；完整 summary 只在 item completed 后固化。
3. 一个 reasoning item 对应一条 transcript 记录，多 part 按 `summaryIndex` 顺序组合，
   空 part 不产生内容。
4. reasoning 属于 middle entry，按事件顺序与其他 middle entry 交错。
5. 固化记录采用 TUI 风格的紧凑圆点、弱化斜体 Markdown，无可见标签和 Card。
6. 中断、失败或 projection 重连会丢弃未完成的临时 reasoning；只有 completed item
   能从权威快照恢复。

## 总体设计

reasoning 进入现有 transcript 投影链路，不建立第二套 transcript 或独立历史区：

```text
app-server projection event
          │
          ▼
 transcriptItemPolicy
  ├─ started reasoning ───────► 预留 middle entry 位置
  ├─ summary delta ──────────► 更新临时 summary parts 与最新标题
  ├─ completed reasoning ────► 用权威 summary 替换临时状态
  └─ raw reasoning delta ────► ignore
          │
          ▼
 transcript state / selectors
          │
          ▼
 CommittedTranscriptSurface
  ├─ streaming: 单行临时标题
  └─ completed: 圆点 + 弱化斜体 Markdown
```

started 时预留 middle chunk 中的顺序位置，但在尚无可见标题时不计入
`middleEntryCount`。第一次得到可显示标题后才成为可见 middle entry；completed 时在同一
位置替换为固化记录，避免把完成事件到达时间误当成内容发生顺序。

## 状态模型

### Stored entry

为 transcript 增加专用 reasoning stored entry，而不是把 reasoning 冒充 assistant
message。两者的内容权威性、生命周期和渲染语义不同，独立类型能使 raw reasoning
不可能误入普通 Markdown message 路径。

reasoning entry 需要表达以下信息：

- `id`、`turnId`：沿用 item identity 和 turn identity。
- 生命周期：`streaming` 或 `completed`。
- 流式 summary parts：按 `summaryIndex` 寻址的临时字符串集合。
- 当前 part index：用于确定“最新摘要标题”的来源。
- 完成态 summary：已经过滤空 part、按协议顺序排列的只读字符串列表。
- `revision`：继续驱动 entry view cache 的精确失效。

流式 parts 只属于内存中的 projection 状态，不进入持久快照，也不与完成态 summary
合并。completed item 是唯一权威结果；完成事件到达时直接以 item 的 `summary` 替换流式
缓存，而不是假设已接收 delta 的拼接结果与 completed payload 一致。

### View model

selector 输出专用 reasoning view：

- `streaming` view 只包含当前可显示的 title。
- `completed` view 包含按顺序组合后的 Markdown source。

selector 不向渲染层暴露 raw `content` 或 `reasoningText`。空 title 的 streaming entry
返回不可见 view；空 summary 的 completed entry 被移除或不投影，均不增加
`middleEntryCount`。

### Chunk 与 cache 边界

reasoning 使用现有 `TranscriptChunk` 和 `entryChunkById`：

- started 只修改承载该 entry 的 chunk。
- title 首次可见或消失时同步维护 `middleEntryCount`。
- delta 只递增 reasoning entry 和所属 chunk 的 `revision`，不使其他 chunk 的 selector
  cache 失效。
- completed 替换同一 entry identity，不移动 chunk，也不重排相邻 activity。

这保留 `TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT` 的现有性能边界；reasoning 不建立跨 turn
或跨 chunk 的全量派生列表。

## 事件投影与生命周期

### Item started

收到 reasoning `itemStarted` 后，以 `(turnId, itemId)` 创建 streaming reasoning entry，
并在当前 middle chunk 尾部预留位置。没有 summary title 前，该 entry 不产生 view，因而不会
出现空圆点或空白占位。

重复 started 继续由现有 item identity 去重，不重置已经收到的 summary delta。

### Summary text delta

`reasoningSummaryText` 只在对应 streaming reasoning entry 存在时接受：

1. 以 `summaryIndex` 找到或建立 part。
2. 将 `delta` 追加到该 part。
3. 把该 index 视为当前 part。
4. 从当前 part 提取第一个非空的 `**...**` Markdown 加粗片段作为临时标题，行为与
   TUI 的 summary header 提取一致。

标题尚未闭合或不存在时，不使用正文、raw reasoning 或固定文案兜底；保留当前位置但不
显示新内容。后续 delta 形成标题后，再让 entry 首次可见。新的 summary part 得到标题后，
同一临时位置更新为新标题，不追加第二条临时记录。

### Summary part added

`reasoningSummaryPartAdded` 表示 summary part 边界。它更新当前 `summaryIndex`，并为对应
part 建立空槽位，但本身不产生可见内容。这样乱序或分批到达的 part 仍由 index 寻址，最终
不会依赖对象插入顺序。

### Raw reasoning delta

`reasoningText` 始终返回 `ignore`。状态模型不为 `contentIndex` 或 raw text 提供字段，
从结构上保证它既不能显示，也不能成为 summary fallback。

### Item completed

收到 reasoning `itemCompleted` 后：

1. 忽略流式缓存的完整性，以 completed item 的 `summary` 为准。
2. 按数组顺序 trim 并过滤空 part。
3. 将剩余 part 用空行连接成一条 Markdown source，对应一条 transcript entry。
4. 在 started 时预留的同一 middle 位置完成替换。
5. 若没有非空 summary，则删除临时 entry，并正确回收可见计数和空 chunk。

completed payload 的 `content` 无论是否非空都不读取。

### Turn 结束与 projection 重连

turn 进入 `interrupted` 或 `failed` 时，清除该 turn 下所有 streaming reasoning entry；
已经 completed 的 reasoning 保留，异常仍由现有 `Interrupted.` 或 `Failed.` entry/status
表达，不新增 reasoning 专用错误提示。

projection 重新 attach 时继续通过 snapshot 全量重建 transcript。重建只调用 completed
item policy，因此临时 reasoning 自然消失，snapshot 中已经 completed 的 reasoning 按权威
summary 恢复。进入 manual reconnect required 状态时也先清除当前 subscription 的 streaming
reasoning，避免断线后继续显示无法确认的新鲜度。

迟到 delta 若找不到仍处于 streaming 的对应 entry，直接忽略；不得复活已完成或已清理的
临时 reasoning。

## 排序与 disclosure

reasoning 不获得特殊的 turn 分区。除首条 user prompt 和 `final_answer` 外，它与 commentary、
collab agent、sub-agent activity 一样进入 middle chunk：

- started 的到达顺序决定其相对位置。
- completed 只替换原位置，不移动到 final answer 前端或 turn 末尾。
- final answer 尚未出现时，现有 `MiddleTranscriptModule` 保持展开。
- final answer 出现后，现有模块按 `middleEntryCount` 显示并默认折叠；reasoning 计为一项。

activity grouping 只继续合并相邻 activity。reasoning 是 singleton entry，会像 message 或
status 一样切断 activity group，从而保留真实交错顺序。

## 渲染设计

### 临时标题

streaming reasoning 使用稳定的紧凑行，仅渲染最新 title。它不使用 Card，也不显示
`Thinking`、状态 chip 或完整 summary 正文。title 更新复用同一 DOM identity，避免每个
delta 新增一行；可访问性上把该位置作为温和更新区域，而不是反复创建新的 transcript
文章。

### 固化 summary

completed reasoning 使用独立 renderer：

- 首行前缀为 `• `，换行内容与正文起点对齐。
- 整体采用弱化前景与斜体。
- 内容走现有静态 Markdown renderer，以保留段落、强调、代码和链接行为。
- 不包裹 HeroUI Card，不增加可见标题。

样式表达 TUI 的层级关系，但不要求逐像素复制终端布局。reasoning 仍服从 GUI 现有最大宽度、
换行和 Markdown 安全策略。

## 边界情况

- **只有空 summary part**：不固化记录，也不留下空白 middle entry。
- **summary index 稀疏或乱序**：流式时按 index 寻址；完成时完全服从 completed 数组顺序。
- **重复 completed/replay**：沿用 commit 和 item identity 去重，不重复增加记录或计数。
- **completed 与已流式内容不同**：直接显示 completed summary，不保留流式差异。
- **只有 raw reasoning**：GUI 不显示 reasoning。
- **标题跨多个 delta 才闭合**：闭合前不显示 fallback，闭合后在原临时位置出现。
- **completed 先于可用 delta**：直接从 completed summary 创建固化 entry。
- **中断后迟到 delta**：因为 streaming entry 已清除，delta 被忽略。

## 验证策略

实现阶段需要覆盖以下稳定行为，不把主观 spacing 或颜色数值固化为测试：

- policy 测试：reasoning started/completed/summary delta 的投影，以及 raw delta 永久 ignore。
- state 生命周期测试：预留、标题首次可见、同位置更新、completed 权威替换、空 summary 删除。
- 顺序测试：reasoning 与 commentary、activity 的交错顺序及 activity group 分隔。
- replay 与 snapshot 测试：completed reasoning 去重并可恢复，streaming reasoning 不恢复。
- interruption/reconnect 测试：临时 reasoning 被清除，completed reasoning 保留。
- selector cache 测试：delta 只使所属 entry/chunk 失效，不破坏 chunk 级引用稳定性。
- Browser Mode 测试：生成中只显示一个标题；完成后显示一条圆点 Markdown；final answer
  出现后 reasoning 进入并计入 `Intermediate updates`，无 Card 和可见 `Thinking` 标签。

## 预期实现边界

后续实施计划应将修改限制在 GUI transcript 的 policy、state model、state implementation、
selectors、committed transcript renderer/样式及其针对性测试。协议类型已满足需求，除非后续
代码证据发现协议与本文假设不一致，否则不修改 `codex-rs`、schema fixture 或生成协议文件。
