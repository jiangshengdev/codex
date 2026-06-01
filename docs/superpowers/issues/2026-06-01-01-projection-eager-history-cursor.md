# P2 · Projection cursor 无条件初始化和维护影响旧 listener 路径

日期:2026-06-01
范围:app-server thread lifecycle / projection 接入点
优先级:中高(旧路径额外 I/O 和事件处理开销)

## 问题

`thread_lifecycle.rs` 在 listener 启动和事件循环中无条件维护 projection history cursor,
即使当前没有 projection subscriber。

两处主要影响:

1. listener 启动前新增一次完整 history load

   `ensure_listener_task_running` 会先调用 `projection_history_cursor_for_listener_start`。
   对非 ephemeral 线程,该函数会执行 `conversation.load_history(/*include_archived*/ true)`。

   这会影响旧路径:普通 `thread/subscribe` / resume 只要触发 listener 启动,即使没有
   projection subscriber,也会额外读取完整历史。功能输出不变,但大历史线程可能增加首次
   subscribe / resume 的启动延迟。

2. 每个事件都会推进 projection cursor

   listener 事件循环中,每个 `EventMsg` 都会计算 persisted item 数量,推进
   `ProjectionHistoryCursor`,并更新 projection manager。这里为了正确处理
   `RawResponseItem` 会构造临时 `RolloutItem` 并 clone event/item。

   正确性方向合理:`RawResponseItem` 本身不按 Limited 持久化,但对应 `ResponseItem`
   会写入 history,所以 cursor 需要把它算进去。风险主要是旧客户端也会无条件承担
   clone / 计数 / projection manager lock 的开销。

## 为何是风险

Projection 是新增能力,但这两处逻辑挂在旧 listener 生命周期上,没有按“存在 projection
需求”延迟触发。结果是没有使用 projection 的旧 app-server 客户端也会付出额外成本。

影响最明显的场景是历史很大的线程:过去 listener 启动不需要为了 projection cursor 先读
完整 history,现在普通 subscribe / resume 也可能被这次读取拖慢。

事件循环里的 cursor 维护开销单次不大,但它发生在所有 thread event 上。高频事件场景下,
这会把 projection 的内部账本成本扩散到旧通知路径。

## 建议方向

- 将 `projection_history_cursor_for_listener_start` 改为 lazy:只有存在 projection
  attach/subscriber,或即将生成 projection snapshot/event 时才读取历史并初始化 cursor。
- 事件循环中只有 projection manager 当前需要 cursor 时才更新 projection cursor;没有
  projection subscriber 时避免 event clone 和 manager lock。
- 保留当前 cursor 正确性语义:尤其是 `RawResponseItem` 对应 persisted `ResponseItem`
  的计数逻辑,不要退回到只数 `EventMsg`。

## 关联观察

- `thread_processor.rs` 的历史功能风险较低,主要行为改动只是 teardown 时调用
  `remove_thread_projection(thread_id)` 清理 projection 状态。
- `message_processor.rs` 只是接入 attach/detach dispatch 和 connection close 清理,风险
  主要在下游 projection 生命周期闭环。
- `outgoing_message.rs` 的普通通知仍先于 projection fanout 发送,且 projection 队列满时
  使用非阻塞路径,不像主要历史回归来源。
- `thread_state.rs` 将 projection attach lease 与普通 subscriber 集合隔离,旧订阅语义
  基本不变;剩余风险在调用方是否可靠释放 lease/subscriber。
