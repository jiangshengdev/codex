# Projection Attach Generation Gate Design

## 背景

`thread/projection/attach` 不是同步完成的。request processor 先校验 thread 和 connection，
然后把 `SendThreadProjectionAttachResponse` 排进 thread listener；listener 内部先等待
projection snapshot，之后才调用 `ThreadProjectionManager::attach(...)` 注册 projection
subscriber 并返回成功 response。

当前问题是：snapshot 等待期间，另一个入口可能已经执行 `finalize_thread_teardown(thread_id)`。
teardown 会调用 `ThreadProjectionManager::remove_thread(thread_id)` 清掉 projection state。
但旧 attach 在 snapshot 返回后仍会继续调用 `attach(...)`；而 `attach(...)` 会通过
`thread_entry_mut(...).or_insert_with(...)` 重新创建 projection entry。结果是一个 teardown 前
开始、teardown 后才继续的旧 attach 可以复活 projection subscription，并向客户端返回成功。

这不是单纯“少检查一次”的问题。任何在 `ThreadProjectionManager` 外部做的 loaded/closing
检查，都可能在检查和最终 `attach(...)` 之间被 teardown 穿插。真正的状态边界必须落在
`ThreadProjectionManager` 自己的锁内。

## 已确认选择

本设计采用 generation gate 方案：

- `ThreadProjectionManager` 为每个 `thread_id` 维护一个 server-side lifecycle generation。
- attach 开始时捕获当前 generation。
- `remove_thread(thread_id)` 在清理 projection state 时递增 generation。
- listener 最终注册 subscriber 时，必须在 `ThreadProjectionManager` 锁内比较 expected
  generation 与当前 generation；只有匹配时才能创建 projection entry 和 subscriber。
- generation 不暴露给 protocol，不进入 snapshot/event payload。

stale attach 的响应语义采用 `invalid_request`。当 connection 仍 live，但 attach 所属的 thread
lifecycle 已经在 snapshot 期间被 teardown，客户端应该收到明确失败，而不是静默等待。

## 目标

- 阻止 teardown 前开始、teardown 后继续的旧 `thread/projection/attach` 重新创建 projection
  entry。
- 阻止这类旧 attach 返回成功 `ThreadProjectionAttachResponse`。
- 把 `remove_thread` 与 conditional attach 的判断放在 `ThreadProjectionManager` 同一状态 owner
  内，避免外部 check-after-await 伪原子。
- 保持 ordinary thread subscription lifecycle 不变。
- 保持 projection attach/detach/event 的 wire schema 不变。

## 非目标

- 不解决 `ThreadStateManager::try_thread_state_for_live_connection` 创建无反向索引 TSM entry 的问题。
- 不把 projection subscription 写入 ordinary `ThreadStateManager` subscription index。
- 不改变 `thread/unsubscribe` 和 `thread/projection/detach` 的语义边界。
- 不解决 projection event delivery 在 PM 锁外发送后遇到 teardown 的 head/replay 问题。
- 不引入客户端可见 generation、epoch、sequence 字段。
- 不重写 projection snapshot reconstruction。

## 设计

### 1. Generation 是 PM 内部 lifecycle epoch

新增一个内部 newtype：

```rust
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub(crate) struct ProjectionGeneration(u64);
```

`ProjectionGeneration` 只在 app-server 内部使用。它不是 projection commit id、不是 subscription id，
也不是 protocol 字段。它只回答一个问题：某个 attach 捕获 generation 之后，这个 thread 的
projection lifecycle 是否被 teardown 推进过。

`ThreadProjectionManagerInner` 增加：

```rust
thread_generations: HashMap<ThreadId, ProjectionGeneration>,
```

generation 必须独立于 `ThreadEntry` 存储。`remove_thread(thread_id)` 会删除 `ThreadEntry`，
但删除之后仍要保留更高 generation，才能让旧 attach 回来时被识别为 stale。

### 2. Capturing generation

`ThreadProjectionManager` 提供：

```rust
pub(crate) async fn current_generation(&self, thread_id: ThreadId) -> ProjectionGeneration
```

语义：

- 如果 `thread_id` 没有 generation 记录，返回 `ProjectionGeneration::default()`。
- 该方法不创建 `ThreadEntry`。
- 该方法不创建 subscriber。
- 该方法只读取 PM generation state。

`thread_projection_attach(...)` 在成功 `prepare_projection_attach(...)` 之后、构造 snapshot future
之前读取 generation，并把它作为这次 attach 的 expected generation 传入 listener command。

捕获点选择在 request processor 侧，是为了覆盖整个 async attach 生命周期：从 request processor
决定进入 listener-ordered attach 开始，到 listener 最终注册 subscriber 结束。

### 3. Listener command 携带 expected generation

`ThreadListenerCommand::SendThreadProjectionAttachResponse` 增加字段：

```rust
projection_generation: ProjectionGeneration,
```

`enqueue_projection_attach_response(...)` 接收该 generation，并转发给 listener command。

`thread_projection_runtime::handle_projection_attach_response(...)` 接收 expected generation，用它执行
conditional attach。

### 4. Conditional attach API

`ThreadProjectionManager` 新增：

```rust
pub(crate) enum ProjectionAttachAttempt {
    Attached(ProjectionAttachResult),
    StaleThreadGeneration,
}

pub(crate) async fn attach_if_generation_matches(
    &self,
    thread_id: ThreadId,
    connection_id: ConnectionId,
    expected_generation: ProjectionGeneration,
) -> ProjectionAttachAttempt
```

语义：

- 在 PM 锁内读取当前 generation。
- 如果当前 generation 不等于 expected generation，返回 `StaleThreadGeneration`。
- stale 路径不得调用 `thread_entry_mut(...)`。
- stale 路径不得创建 projection entry。
- stale 路径不得创建 subscriber。
- generation 匹配时，执行与当前 `attach(...)` 相同的注册逻辑：创建 subscription id，读取当前
  `head_commit_id`，写 subscriber，维护 connection index。

原 `attach(thread_id, connection_id)` 可以保留给测试或薄 wrapper 使用，但 production attach response
路径必须使用 conditional API。如果保留无条件 `attach(...)`，它的调用点必须明确不是 listener
ordered attach response path。

### 5. remove_thread bumps generation

`ThreadProjectionManager::remove_thread(thread_id)` 的新语义：

- 在 PM 锁内递增 `thread_generations[thread_id]`。
- 然后移除 `threads[thread_id]`，并清理 `connection_index`。
- 即使 `threads` 中没有该 thread entry，也仍然递增 generation。

“即使没有 entry 也递增”很重要。`finalize_thread_teardown(thread_id)` 可能在 projection attach
真正注册前发生；如果此时没有 PM entry，但不递增 generation，旧 attach 后续仍会用默认 generation
通过检查并创建 entry。

递增使用 wrapping add 可以接受；实际单进程生命周期内溢出不可达。为可读性，建议在
`ProjectionGeneration` 上提供私有 `next()` helper。

### 6. Stale attach response

listener 内 attach 流程保持现有检查顺序，但把最终 attach 换成 conditional attach：

1. 检查 `pending_thread_unloads`，命中则返回当前 closing-thread error。
2. `snapshot.await`。
3. 检查 connection 是否仍 live，closed 则保持现有 silent skip。
4. 再检查 `pending_thread_unloads`。
5. 调用 `attach_if_generation_matches(...)`。
6. 如果返回 `StaleThreadGeneration`，发送 `invalid_request`：

```text
thread {thread_id} was unloaded while attaching projection; retry thread/projection/attach after the thread is loaded
```

7. 如果返回 `Attached(...)`，继续现有 post-attach connection-close cleanup。
8. connection 仍 live 时发送成功 `ThreadProjectionAttachResponse`。

stale attach 使用 `invalid_request` 的理由：

- connection 仍 live，server 已经收到并处理了 request。
- 静默跳过会让客户端难以区分 request 仍在等待、被丢弃、还是需要重新 attach。
- closing-thread path 已经使用 request error；stale generation 是同类 lifecycle 失败。

### 7. 为什么不只参考 ordinary subscription 加 TSM 锁

ordinary subscription 的强保证来自 `ThreadStateManager` 同一锁内完成 live check、正反索引写入和
watcher 更新。这个模式适用于 ordinary subscription，因为它的 subscription membership 就由 TSM
拥有。

Finding 1 的坏状态由 `ThreadProjectionManager` 拥有：`remove_thread` 删除 PM state，而旧
`attach` 又在 PM 中重新创建 entry。把检查放到 TSM，只能在 PM attach 前做一个外部前置条件；
前置条件和 PM attach 之间仍可能被 teardown 穿插。

因此本设计参考 ordinary subscription 的原则，而不是照搬 owner：

- 原则：check 与 state transition 必须在同一 owner/同一锁内完成。
- Finding 1 的 owner：`ThreadProjectionManager`。
- 所以 gate 必须在 PM 内部完成 generation comparison + attach。

## 测试策略

### 1. 红测：teardown 后旧 attach 不得复活 projection entry

新增 focused test，建议放在现有 app-server projection 测试附近，测试名：

```text
projection_attach_does_not_recreate_subscription_after_thread_teardown
```

测试必须构造当前代码会失败的 interleaving：

1. 创建 loaded thread 和 live connection。
2. 发起 projection attach，并让 snapshot future 被 oneshot 卡住。
3. 在 snapshot 卡住期间触发 teardown，至少要执行到
   `ThreadProjectionManager::remove_thread(thread_id)`。
4. 放行 snapshot。
5. 断言不会收到成功 `ThreadProjectionAttachResponse`。
6. 断言 PM 没有为该 connection/thread 留下 projection subscriber。

这个测试的核心不是验证 error 文本，而是验证旧 attach 没有复活 PM state。error 文本可以作为
辅助断言。

### 2. PM 单元测试

给 `ThreadProjectionManager` 增加小型单元测试：

- `remove_thread` 在没有 entry 时也会 bump generation。
- 使用旧 generation 调用 `attach_if_generation_matches` 返回 `StaleThreadGeneration`。
- stale attach 后不会创建 thread entry，也不会写 connection index。
- 使用当前 generation attach 成功，并保持既有 `head_commit_id` / subscriber behavior。

这些测试能把 generation gate 的状态机规则固定在 PM 内部，避免只通过高层 integration test
间接验证。

### 3. 回归测试范围

运行：

```bash
cargo test -p codex-app-server thread_projection
```

如果新增测试位于更窄的 test filter 下，先跑单测 filter，再跑 `thread_projection` filter。

本设计不要求运行完整 workspace test。若后续实现改动了共享 crate 或 protocol schema，再按实际
变更扩大验证范围。

## 错误处理

- invalid `threadId`：保持当前 invalid request。
- thread not loaded：保持当前 invalid request。
- thread closing：保持当前 pending unload error。
- connection closed：保持当前 silent skip。
- stale generation：新增 invalid request，提示 thread 在 attach 期间已 unload，需要重新 attach。
- post-attach connection close：保持当前 cleanup 逻辑，detach 已注册 projection subscriber 后返回。

## 成功标准

- `ThreadProjectionManager::remove_thread(thread_id)` 之后，任何持有旧 generation 的 attach 都不能创建
  projection entry。
- teardown 前开始、teardown 后继续的旧 attach 不会返回成功 `ThreadProjectionAttachResponse`。
- PM generation 不出现在 app-server protocol schema 或 TypeScript fixtures 中。
- ordinary subscription 行为没有变化。
- Finding 2 的 TSM orphan entry 问题没有被伪装成已解决；它仍作为独立后续问题处理。
