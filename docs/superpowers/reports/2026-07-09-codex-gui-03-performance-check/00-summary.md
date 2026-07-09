# Codex GUI 03 performance check summary

## 总体结论

本轮静态时间复杂度审计覆盖四个 issue-mapped 03 assistant text streaming 直接热路径。当前只有 `09-projection-delta-transient-text-concat` 保持 `仍成立`：live `agentMessage` delta 仍通过 `item.transientText += delta` 累积完整可渲染字符串，长文本小 delta 高频场景下存在前缀复制累积成本。

其余三个切片均为 `部分过期`：`08` 的每 delta action 投递 / subscription 假设已被 bridge batch flush 改变，但 reducer 内仍逐 delta 应用；`10` 的旧 selector cache invalidation 已被 reducer-owned renderable live list 消除，但当前 consumption 阶段仍存在 live item 扫描边界；`03` 的首次 `itemStarted(agentMessage)` 是预期 live state 写入，残留问题仅限已有 live item 加不同 `commitId` 的重复 `itemStarted` dirty applied-event window。

## 切片索引

| Slice | Status | 03 attribution | Complexity summary |
| --- | --- | --- | --- |
| `08-projection-delta-redux-action-frequency` | `部分过期` | not 03 | Action 投递 / subscription 频率已从 delta 数 `D` 变为 batch flush 数 `F`，但 batch reducer 内仍有 `O(D)` 逐 delta 同步处理。 |
| `09-projection-delta-transient-text-concat` | `仍成立` | confirmed | `transientText += delta` 的累计成本为 `O(sum(prefix_lengths + delta_lengths))`，小 delta 长文本下可接近 `O(N^2)`。 |
| `10-live-slot-selector-cache-invalidation` | `部分过期` | confirmed | selector read-time materialization 已变为 `O(1)` 读取，但 live consumption 仍可能按 delta 触发 `O(Lt)` current-turn 扫描和 `O(T + Ls)` 空状态判断。 |
| `03-item-started-dirties-transcript-state` | `部分过期` | confirmed | 首次 live item 创建是预期行为，残留重复不同 `commitId` 的 `itemStarted` dirty applied-event window，最坏 `O(D * W)` 且 `W <= 500`。 |

## 当前 03 归因风险

- `09-projection-delta-transient-text-concat`: reducer 中 live `agentMessage` text accumulation 仍随 accumulated live text length 与 delta count 放大，状态为 `仍成立`。

## 非 03 归因或排除项

- `04-long-transcript-no-windowing.md`: excluded by design as global long-history DOM/windowing, not 03-specific.
- `05-heroui-full-css-import.md`: excluded by design as CSS/bundle/loading, not this time-complexity hot path.
- Rust projection, app-server v2 protocol, 04 thinking/tool/exec/MCP streaming, global long-history windowing, and generic React performance tuning are outside this report.

## 需要后续单独设计或计划的问题

- `09-projection-delta-transient-text-concat`: confirmed 03 hot-path risk; any follow-up should be handled by a separate design or plan.
- `10-live-slot-selector-cache-invalidation`: old selector invalidation is gone, but current live consumption scanning is confirmed as a narrowed 03 boundary; any follow-up should be scoped separately.
- `03-item-started-dirties-transcript-state`: only the repeated different-`commitId` existing-live-item dirty applied-event window remains; any follow-up should stay limited to that narrow boundary.
