# Codex GUI 失败 turn 错误信息展示设计

设计状态：已确认

## 背景

thread `019ffd6e-d689-7413-92e3-db0abe9ea426` 的历史记录中，子代理 turn
`019ffd97-2aa7-7283-a660-d48f76eaaba2` 以 403 配额错误结束。原始 rollout 的
`task_complete` 事件同时包含 `turn_id` 和完整的 `error.message`：

```text
unexpected status 403 Forbidden: token quota is not enough, token remain quota: ¥0.064714, need quota: ¥0.072198 (request id: 202608140209338062200938268d9d60dAEpcHp), url: https://shapi.vip/v1/responses
```

TUI 在收到非重试 `Error` 事件时按 `turn_id` 暂存错误，并在失败 turn 完成时用
`notification.turn.error` 去重后追加错误历史条目。协议层的 `Turn` 已有 `error`，但
GUI 自己的 `TranscriptTurn` 目前只保存 `status`；`upsertTranscriptTurn` 也只写入
`turn.status`，因此 GUI 只能渲染顶部 `Failed`，无法显示错误正文。

本设计只补齐 GUI 的可见投影和渲染，不改变 TUI、app-server 协议或错误原文。

## 目标

- 对具有 `turn.error` 的失败 turn，在 Codex GUI 中显示完整原始错误信息。
- 错误通过对应的 `turnId` 绑定到正确 turn，不作为全局末尾消息处理。
- 保留现有 turn 顶部 `Failed` 状态展示。
- 在该 turn 内容末尾增加独立错误区域，错误不并入状态组件，也不伪装成 assistant 消息。
- 使用 HeroUI v3 `Alert` 作为错误区域，保留状态语义和可访问结构。
- 保持 TUI 当前行为不变。

## 非目标

- 不修改 TUI 的错误条目、颜色、文字或排序。
- 不修改 app-server v2 的 `Turn`、`Error` 或 `TurnCompleted` 协议字段。
- 不解析供应商错误字符串，不隐藏 request id、URL、额度或其他原始内容。
- 不根据错误文本猜测 turn 内的 item 位置；协议只提供 turn 级定位，没有 item 索引或偏移。
- 不把错误显示为新的 turn，也不改变 turn 顶部状态的位置。
- 不新增重试、复制、折叠或其他错误操作控件。

## 已确认的产品语义

1. 展示范围仅为 GUI；TUI 保持现状。
2. 错误默认直接显示完整原始文本，仅进行界面换行，不截断、不脱敏、不结构化改写。
3. 错误属于具体失败 turn，而不是整个 thread 的全局状态。
4. `Failed` 继续位于 turn 顶部；错误文本作为独立内容位于该 turn 已有内容末尾。
5. 错误不与状态 chip 合并，不创建新的 turn 或 assistant transcript message。
6. 当前协议无法确定错误对应 turn 内的具体 item，因此只承诺 turn 尾部位置。

## 总体设计

```text
app-server Turn / TurnCompleted
          │
          │ turn.status = failed
          │ turn.error = { message, ... }
          ▼
 transcript state
  ├─ TranscriptTurn.status  ─────► 顶部 Chip("Failed")
  └─ TranscriptTurn.error   ─────► turn 尾部错误 Alert
                                      ├─ Indicator
                                      └─ Content
                                          ├─ Title
                                          └─ Description(raw message)
```

错误应继续由 turn 作为唯一权威来源保存。不能把它另建为普通 transcript entry，否则
会丢失“这是 turn 级失败原因”的类型约束，并需要额外维护独立条目的排序、恢复和去重。

## 状态模型

在 GUI 的 `TranscriptTurn` 中增加可为空的 turn 级错误字段，字段形状复用协议 `Turn`
错误的可见部分，至少保存原始 `message`；若现有类型允许安全复用，则保留完整 error
对象以避免再次丢失协议扩展字段。快照重建、实时 `turnStarted`、`turnCompleted` 和
失败状态更新都必须以同一 `turnId` 更新该字段。

更新规则：

- `turn.status` 仍独立保存并驱动顶部 `Chip`。
- `turn.error` 非空时保存错误；错误为空时清除旧错误，避免重用 turn 状态。
- 失败 turn 的错误不会进入 `entriesById`、middle chunk 或 final assistant entry 列表。
- 重复 `turnCompleted`、快照恢复和实时事件都按现有 turn identity 更新，不追加重复错误。

## 选择器与渲染

selector 输出的 turn view 增加可选错误信息，但不把错误转换成 transcript entry。已有
`CommittedTranscriptTurn` 保持顶部 metadata 区域，用现有 `Chip` 渲染 `Failed`；在
`committed-transcript-chunk` 的现有内容之后追加错误 renderer。

错误 renderer 使用 HeroUI v3：

```tsx
<Alert status="danger">
  <Alert.Indicator />
  <Alert.Content>
    <Alert.Title>Request failed</Alert.Title>
    <Alert.Description>{error.message}</Alert.Description>
  </Alert.Content>
</Alert>
```

`Alert.Description` 使用保留换行、可断词的文本样式，使长 URL 和供应商错误在窄窗口
中换行但不截断。错误文本作为文本节点渲染，不走 Markdown，避免后端错误中的 URL、符号
或供应商内容被解释为 GUI 指令或额外 DOM 结构。

## 生命周期与边界

- **失败 turn 完成**：保存 `turn.error`，selector 立即让尾部 Alert 可见。
- **失败但没有 error**：只显示现有 `Failed`，不生成空 Alert。
- **中断 turn**：不复用失败错误；保持现有 `Interrupted` 语义。
- **正常完成 turn**：清除或保持空 error，不渲染错误区域。
- **快照恢复**：直接从历史 turn 的 `error` 恢复，错误仍位于对应 turn 尾部。
- **重连/重复事件**：通过 turn identity 更新同一字段，不重复插入错误条目。
- **长错误文本**：允许自然换行，不截断；不得以摘要替代完整原文。

## 验证边界

- transcript state 测试：失败 turn 的 `error` 从 snapshot 和 `turnCompleted` 正确进入
  对应 turn，正常/中断 turn 不产生错误。
- selector/渲染测试：`Failed` 位于 turn 顶部，完整错误 Alert 位于 turn 内容末尾，且
  错误不成为独立 turn 或普通 assistant message。
- 覆盖包含 403、request id、URL 和换行的原始错误文本，验证文本完整保留。
- 更新必要的 GUI Browser/snapshot 覆盖，确认重连恢复和重复完成事件不会重复显示。

## 相关证据

- [原始 rollout 第 1703 行](</Users/jiangsheng/.codex/sessions/2026/08/14/rollout-2026-08-14T07-22-07-019ffd6e-d689-7413-92e3-db0abe9ea426.jsonl:1703>)
- [TUI 错误事件处理](</Users/jiangsheng/cnb/codex/codex-rs/tui/src/chatwidget/protocol.rs:124>)
- [TUI 失败 turn 处理](</Users/jiangsheng/cnb/codex/codex-rs/tui/src/chatwidget/protocol.rs:299>)
- [GUI turn 状态更新](</Users/jiangsheng/cnb/codex/codex-gui/src/features/transcriptState/transcriptStateImplementation.ts:144>)
- [GUI turn 状态与内容渲染](</Users/jiangsheng/cnb/codex/codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx:730>)
