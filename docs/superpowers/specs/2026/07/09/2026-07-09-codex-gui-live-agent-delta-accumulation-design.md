# Codex GUI live agent delta accumulation 设计

日期: 2026-07-09
状态: 设计已确认
范围: `08-projection-delta-redux-action-frequency` 与 `09-projection-delta-transient-text-concat` 的 reducer/text accumulation 热路径

## 目标

本设计解决 live `agentMessage` delta 在 `transcriptState` 内的 batch accumulation 成本。

当前 `GuiHostConnectionBridge` 已经把 projection delta 先收集到 RAF batch，再以一个 `threadRuntimeDeltasAccepted({ notifications })` action 投递。因此旧问题不能继续表述为“每个 delta 一次 Redux action / subscription”。剩余问题在 batch reducer 内:

- `threadRuntimeDeltasAccepted` 仍逐个 notification 调用 `applyAcceptedProjectionDelta`。
- 每个 live `agentMessage` delta 都查找 live item。
- 每个 live `agentMessage` delta 都执行 `transientText += delta`。
- 每个 live `agentMessage` delta 都递增 `revision` 和 `liveScrollPulse`。

目标是在不改变 projection ingress、Redux action 边界和 Streamdown 输入模型的前提下，将同一 batch 内同一 live item 的多个 agent text delta 聚合成一次可见更新。

## 上游依据

`08-projection-delta-redux-action-frequency.md` 已将问题校准为“batch 内逐 delta reducer 处理”: action 投递和 store subscription 成本已经从 delta 数 `D` 收窄为非空 batch flush 数 `F`，但 reducer 内仍有 `O(D)` 次同步处理。

`09-projection-delta-transient-text-concat.md` 记录了同一热路径的 text accumulation 成本: 只要 reducer 内继续对长 `transientText` 逐 delta 执行 `+=`，小 delta 高频场景仍可能产生前缀复制成本。

这两个 issue 描述的是同一条热路径的不同层面:

```text
thread/projection/delta
  -> GuiHostConnectionBridge RAF batch
  -> threadRuntimeDeltasAccepted
  -> transcriptState batch reducer
  -> live item transientText / revision / liveScrollPulse
  -> LiveMarkdownText source
```

`LiveMarkdownText` 当前通过 `source: string` 把 live markdown 传给 Streamdown。Streamdown 的主输入也是 markdown string。因此第一阶段不引入 chunks、rope 或 parts 存储模型。

历史聊天记录中的代理最终 Markdown 量级支持该保守方向。主代理最终回复通常在 1k 字符以内，子代理报告更长但常见仍在几千字符量级。该量级本身不是 JS string 的高风险来源；更值得收敛的是同一 frame 内重复 reducer 写入和重复字符串追加。

## 决策 1: 范围只覆盖 reducer/text accumulation

本设计只覆盖 `08 + 09` 的 reducer/text accumulation 热路径。

纳入范围:

- `threadRuntimeDeltasAccepted` batch reducer 内的 per-delta 处理成本。
- live `agentMessage` delta 对 `transientText` 的 batch 内重复追加。
- `revision` 和 `liveScrollPulse` 的 batch 内更新语义。
- reducer 行为测试和一条 browser 集成回归。

不纳入范围:

- Streamdown / Markdown rendering cost。
- Markdown AST cache。
- Markdown-safe partitioner。
- chunks、rope、message parts 或 semantic parts 存储模型。
- reasoning、tool、exec 或其他非 `agentMessage` delta 的显示能力。
- projection protocol、Rust server fanout、GUI host transport 或 RAF batch action 投递边界。

理由:

- `09` 明确把 Markdown rendering cost 记录为独立消费边界，不作为当前已确认问题。
- Streamdown 仍要求最终 markdown string 输入；引入 chunks 后仍需要在渲染边界 join 成 string。
- 当前回复量级不支持先上复杂文本存储结构。

## 决策 2: 保持 `transientText: string`

`TranscriptRenderableLiveItem.transientText` 继续保持 `string`。

实现方向不是把 live text 改成 chunks，而是在 batch reducer 内先聚合同一 live item 的 delta 文本，再对该 item 做一次 append。

推荐的 reducer 数据流:

```text
threadRuntimeDeltasAccepted(notifications)
  -> 过滤当前 thread 的 agentMessage delta
  -> 按首次出现顺序聚合到 turnId/itemId bucket
  -> 每个 bucket 查找一次 live item
  -> item.transientText += mergedDelta
  -> item.status = "streaming"
  -> item.revision += 1
  -> bumpLiveScrollPulse(state)
```

单条 `threadRuntimeDeltaAccepted` 保持现有语义，可以继续复用单 delta append 路径。

## 决策 3: batch 内每个 live item 只 bump 一次

同一 `threadRuntimeDeltasAccepted` batch 内，同一个 `turnId/itemId` 即使包含多个 `agentMessage` delta，也只产生一次可见 live item 更新:

- `transientText` 追加一次合并后的文本。
- `status` 写为 `"streaming"` 一次。
- `revision += 1` 一次。
- `liveScrollPulse` bump 一次。

该语义按“用户可见 frame 更新”计数，而不是按底层网络 delta 计数。

如果一个 batch 同时更新多个 live item，则每个被更新的 live item 各自 bump 一次。不要把整个 batch 固定为只 bump 一次，因为这会把多 item 更新压成一个不清晰的可见信号。

## 决策 4: 保持 delta 顺序和 item 隔离

batch 聚合必须保持以下不变量:

- 同一 `turnId/itemId` 内的 delta 文本按 notification 原始顺序拼接。
- 不同 `turnId/itemId` 的 delta 不能互相合并。
- 聚合后的 item 更新顺序按该 item 在 batch 中首次出现的顺序执行。
- `threadId` 不匹配的 notification 不参与聚合。
- 非 `agentMessage` delta 继续被 `transcriptState` 忽略。
- live item 不存在时，对应聚合结果被忽略，不创建新的 live item。

该策略不引入 delta 去重。projection delta 是 transient progress，不带 commit id；本设计不尝试按内容、delivery 或 subscription 做额外去重。

## 组件边界

`GuiHostConnectionBridge` 保持现状:

- 继续维护 `pendingDeltaNotifications`。
- 继续通过 `requestAnimationFrame` flush delta batch。
- 继续在 attach/event/reconnect 边界前同步 flush pending delta。

`threadRuntimeSlice` 保持现状:

- `threadRuntimeDeltaAccepted` 和 `threadRuntimeDeltasAccepted` 继续只是跨 slice signal。
- runtime slice 不写 transcript buffer。

`transcriptStateSlice` 是本设计的唯一 reducer 行为变更点:

- 单 delta action 保持现有行为。
- batch delta action 从逐 notification apply 改成 batch 内先聚合再 apply。

`CommittedTranscriptSurface` / `LiveMarkdownText` 保持现状:

- live assistant entry 继续把 `item.transientText` 作为 string 传给 `LiveMarkdownText`。
- `LiveMarkdownText` 继续使用 Streamdown streaming mode。
- 不新增 chunk renderer 或多个 Streamdown 实例。

## 错误与边界行为

batch reducer 应保持现有容错语义:

- thread 不匹配: 忽略。
- unsupported delta type: 忽略。
- live item 缺失: 忽略。
- live item index stale 或 key 不匹配: 按现有 `liveItemForKey` 行为忽略。

聚合逻辑不应扩大这些错误的影响范围。一个 bucket 无法应用，不应影响同一 batch 内其他 bucket。

## 验证口径

验证以 reducer 测试为主，补一条 browser 回归。

Reducer 覆盖:

- 同一 batch 内同一 `turnId/itemId` 的多个 `agentMessage` delta 合并后，最终 `transientText` 与旧逐条应用结果一致。
- 上述场景中 `revision` 只增加一次。
- 上述场景中 `liveScrollPulse` 只增加一次。
- 不同 `turnId/itemId` 的 delta 不串联、不互相覆盖。
- 单条 `threadRuntimeDeltaAccepted` 行为不变。
- 非当前 thread 的 delta 不参与聚合。
- 非 `agentMessage` delta 继续不写 transcript state。

Browser 覆盖:

- live assistant text 仍能从 projection delta batch 渲染到 `LiveMarkdownText`。
- sticky-bottom 仍响应 live text 更新。
- scrolled-away 用户不被 live delta 强制拉回底部。

## 验收标准

- `08` 的残留 batch 内 per-delta reducer 写入被收窄为 per updated live item 写入。
- `09` 的同一 frame 内重复 `transientText += delta` 被收窄为每个 live item 一次合并追加。
- `transientText` 仍是 string，Streamdown 输入模型不变。
- live agent message 最终显示文本不变。
- `revision` / `liveScrollPulse` 的新语义明确为 per batch updated live item。
- 不新增 plan、reasoning、tool 或 exec delta 显示能力。

## 非目标

- 不修改 projection protocol。
- 不修改 app-server 或 Rust projection fanout。
- 不修改 `GuiHostConnectionBridge` 的 RAF batching。
- 不修改 Streamdown 配置。
- 不实现 Markdown rendering 性能优化。
- 不引入 chunks、rope、StringBuilder 类或 external text buffer。
- 不处理 committed transcript 的 Markdown 渲染性能。
