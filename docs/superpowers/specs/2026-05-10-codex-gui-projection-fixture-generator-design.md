# Codex GUI Projection Fixture Generator Design

日期：2026-05-10

状态：设计待审阅

## 目标

迁移 `port/lazy-projections` 中用于生成 GUI projection 测试 JSON 的工具，但按当前分支的 thread projection 协议重写 fixture 内容和生成逻辑。

这次迁移的目标不是恢复历史 projection 实现，而是让 `codex-gui/src/features/projection/__fixtures__` 里的 JSON fixture 重新由 Rust 协议类型生成，避免前端测试继续依赖手写或过时的 JSON 形状。

## 背景

历史分支的生成器由两部分组成：

- `codex-rs/app-server/src/bin/write_gui_projection_fixtures.rs`
- `codex-rs/app-server/src/projection/gui_fixtures.rs`

其中 binary 外壳仍然有价值：接收 `--out-dir`，默认写入 GUI fixture 目录。

但核心生成逻辑不能直接复制。历史实现依赖旧 projection 模型：

- `ProjectionEventPayload`
- `ProjectionEventNotification`
- `ProjectionState`
- `projectionInstanceId`
- `latestSequence`
- `eventId`
- `projectionReset`
- `threadMetadataUpdated`

当前分支的正确实现已经改为 thread projection transport envelope：

```text
ThreadProjectionAttachResponse {
  subscriptionId: string,
  snapshot: {
    thread: Thread,
    headCommitId: string | null,
  },
}

ThreadProjectionEventNotification {
  threadId: string,
  subscriptionId: string,
  commitId: string,
  parentCommitId: string | null,
  event: ThreadProjectionEvent,
}
```

当前 `ThreadProjectionEvent` 第一版只包装四类已有 v2 typed notification：

```text
turnStarted
turnCompleted
itemStarted
itemCompleted
```

因此迁移必须重写 fixture 的语义，而不是移植旧 `projection/gui_fixtures.rs`。

## 设计原则

### Rust 类型是 fixture 真相

所有 GUI projection JSON fixture 应由 Rust 中的 `codex_app_server_protocol` 类型序列化产生。前端测试只消费生成结果，不手写协议字段。

这样 fixture 能覆盖：

- Rust serde rename 行为。
- `ts-rs` 导出类型对应的真实 wire shape。
- `Thread` / `Turn` / `ThreadItem` 结构变化。
- `ThreadProjectionAttachResponse` 和 `ThreadProjectionEventNotification` 的嵌套形状。

### 生成器只构造协议 fixture，不运行 app-server

fixture generator 不启动 app-server，不创建真实 MCP process，不依赖 network、auth、thread store 或 async runtime。

它只做确定性数据构造：

```text
construct protocol structs
serialize pretty JSON
write fixture files
```

这样生成器可以作为轻量工具运行，并且生成结果 byte-stable。

### 不迁移旧 sequence 模型

当前协议没有 `latestSequence` / `sequence`，也不需要 BigInt fixture。

旧的 `event-large-sequence.json` 应删除或替换为 commit-chain fixture。前端 reducer 应通过 `parentCommitId == local.headCommitId` 判断连续性，而不是用数字 sequence 判断 gap。

### 不生成当前协议不存在的 event

当前 projection manager 不产生 `projectionReset` 或 `threadMetadataUpdated` projection event。

旧 fixture：

- `event-projection-reset.json`
- `event-thread-metadata-updated-null.json`

不应该在迁移后保留为 Rust-generated projection fixtures。前端如仍需要测试 metadata 或 reset 行为，应在未来协议实际支持后再补。

## 文件布局

新增或恢复：

```text
codex-rs/app-server/src/bin/write_gui_projection_fixtures.rs
codex-rs/app-server/src/thread_projection_fixtures.rs
```

修改：

```text
codex-rs/app-server/src/lib.rs
codex-gui/src/features/projection/__fixtures__/*.json
codex-gui/src/features/projection/__tests__/projectionFixtures.test.ts
codex-gui/src/features/projection/__tests__/projectionSlice.test.ts
```

不恢复：

```text
codex-rs/app-server/src/projection/gui_fixtures.rs
codex-rs/app-server/src/projection/*
codex-rs/app-server-protocol/src/protocol/v2/projection.rs
```

原因：当前分支已经用 `thread_projection` 系列文件替代旧 `projection` 模块。

## Rust API

`codex-rs/app-server/src/lib.rs` 暴露一个隐藏测试工具入口：

```rust
#[doc(hidden)]
pub fn write_gui_projection_fixtures(out_dir: &std::path::Path) -> anyhow::Result<()> {
    thread_projection_fixtures::write(out_dir)
}
```

binary 维持历史命令形状：

```bash
cargo run -p codex-app-server --bin write_gui_projection_fixtures -- \
  --out-dir ../../codex-gui/src/features/projection/__fixtures__
```

默认 `out_dir`：

```text
<codex-rs/app-server>/../../codex-gui/src/features/projection/__fixtures__
```

## Fixture 集合

迁移后的第一版 fixture 集合建议为：

```text
attach-baseline.json
attach-replacement.json
event-turn-started.json
event-item-started.json
event-item-completed.json
event-turn-completed.json
event-commit-chain-second.json
event-subscription-replacement.json
```

### `attach-baseline.json`

类型：`ThreadProjectionAttachResponse`

内容：

- `subscriptionId = "projection-fixture-subscription"`
- `snapshot.headCommitId = null`
- `snapshot.thread` 包含一个稳定的 baseline thread。
- `snapshot.thread.turns` 至少包含一个 completed turn，用于验证前端 attach 后能直接展示 snapshot。

### `attach-replacement.json`

类型：`ThreadProjectionAttachResponse`

内容：

- `subscriptionId = "projection-fixture-replacement-subscription"`
- `snapshot.headCommitId = "commit-replacement-head"`
- `snapshot.thread.id` 可以与 baseline 相同，用于测试 reattach 替换同一 thread projection。
- `snapshot.thread.name` 和 turns 与 baseline 不同，用于验证整棵替换。

### `event-turn-started.json`

类型：`ThreadProjectionEventNotification`

内容：

```text
threadId = baseline thread id
subscriptionId = baseline subscription id
commitId = "commit-turn-started"
parentCommitId = null
event.type = "turnStarted"
```

`event.notification.turn` 使用真实 `TurnStartedNotification` 的 `turn` 字段结构，而不是旧的 projection payload。

### `event-item-started.json`

类型：`ThreadProjectionEventNotification`

内容：

```text
commitId = "commit-item-started"
parentCommitId = "commit-turn-started"
event.type = "itemStarted"
```

用于验证前端在 parent commit 连续时把 item 写入已有 turn。

### `event-item-completed.json`

类型：`ThreadProjectionEventNotification`

内容：

```text
commitId = "commit-item-completed"
parentCommitId = "commit-item-started"
event.type = "itemCompleted"
```

用于验证前端按 item id 替换 in-progress item。

### `event-turn-completed.json`

类型：`ThreadProjectionEventNotification`

内容：

```text
commitId = "commit-turn-completed"
parentCommitId = "commit-item-completed"
event.type = "turnCompleted"
```

用于验证前端把 turn 更新为 completed。

### `event-commit-chain-second.json`

类型：`ThreadProjectionEventNotification`

内容：

- 可以复用 item 或 turn notification。
- `parentCommitId` 指向另一个 fixture 的 `commitId`。

用途是让前端测试能显式覆盖 commit chain 连续应用，而不是只覆盖单事件。

如果 `event-item-started` / `event-item-completed` 已经覆盖连续链，这个 fixture 可以不单独新增，避免冗余。

### `event-subscription-replacement.json`

类型：`ThreadProjectionEventNotification`

内容：

- `subscriptionId = "projection-fixture-replacement-subscription"`
- `parentCommitId = "commit-replacement-head"`
- `commitId = "commit-replacement-next"`

用于验证前端 reattach 后只接受新 subscription 的事件。

## Frontend 适配

当前 `codex-gui/src/features/projection/projectionSlice.ts` 仍按旧模型建模：

```text
projectionInstanceId
latestSequence
ProjectionEventPayload
sequenceGap
projectionReset
missingTurn
```

迁移 generator 时，前端 reducer 必须先或同步切到当前协议：

```text
subscriptionId
headCommitId
ThreadProjectionEventNotification.event.notification
commit chain mismatch
```

建议的前端状态：

```ts
export type ThreadProjection = {
  subscriptionId: string;
  thread: Thread;
  headCommitId: string | null;
  reattach: ReattachRequest | null;
};
```

attach 处理：

```text
state[threadId] = {
  subscriptionId: response.subscriptionId,
  thread: response.snapshot.thread,
  headCommitId: response.snapshot.headCommitId,
  reattach: null,
}
```

event 处理：

```text
if event.subscriptionId != local.subscriptionId:
  ignore
else if event.parentCommitId != local.headCommitId:
  mark reattach("commitChainMismatch")
else:
  apply event.event.notification
  local.headCommitId = event.commitId
```

事件应用应保持幂等：

- `turnStarted`：按 turn id replace-or-append。
- `itemStarted`：按 turn id 找 parent turn，再按 item id replace-or-append。
- `itemCompleted`：同上。
- `turnCompleted`：按 turn id replace-or-append 或更新完整 turn，取决于 current notification payload 形状。

如果 item/turn parent 缺失，前端应标记 reattach，而不是尝试猜测恢复。

## 写文件行为

沿用历史分支中更安全的写入规则：

- 创建输出目录。
- 只覆盖本生成器负责的 fixture 文件。
- 不清空整个目录。
- 不删除目录里的无关文件。

这能避免误删前端临时 fixture 或后续非 projection fixture。

## Byte Stability

生成器必须保证同一源码在不同机器上输出一致：

- 使用固定 UUID / thread id / subscription id / commit id。
- 使用固定 timestamp。
- 使用固定 cwd。
- Windows 上如果必须构造绝对路径，序列化后归一化为 `/tmp/codex-gui-projection-fixtures`。
- 使用 `serde_json::to_string_pretty`，末尾追加 `\n`。

不要在 fixture 中使用 `Uuid::now_v7()`、当前时间或临时目录路径。

## Rust 测试

在 `thread_projection_fixtures.rs` 内保留 unit tests：

```text
generated_fixture_set_is_stable
generated_fixtures_match_current_projection_shape
generated_commit_chain_is_contiguous
write_preserves_unrelated_files
```

测试重点：

- fixture 文件名集合稳定。
- attach fixture 顶层是 `subscriptionId` + `snapshot`。
- event fixture 顶层是 `threadId` + `subscriptionId` + `commitId` + `parentCommitId` + `event`。
- 不出现旧字段：`projectionInstanceId`、`latestSequence`、`sequence`、`eventId`、`payload`。
- commit chain fixture 的 `parentCommitId` 严格指向前一个 fixture 的 `commitId`。
- writer 不删除 unrelated file。

## GUI 测试

`projectionFixtures.test.ts` 应改为验证当前协议 shape：

- attach imports as `ThreadProjectionAttachResponse`。
- event imports as `ThreadProjectionEventNotification`。
- `attach.snapshot.thread.turns.length > 0`。
- `event.event.type` 是四个当前 union discriminator 之一。
- commit id / parent commit id 的链路符合 fixture 设计。
- fixture 中不存在旧 sequence 字段。

`projectionSlice.test.ts` 应从旧 sequence 测试改为 commit chain 测试：

- attach stores `subscriptionId`、`thread`、`headCommitId`。
- unknown thread event ignored。
- stale subscription event ignored。
- `parentCommitId` mismatch marks reattach。
- matching `parentCommitId` applies event and advances `headCommitId`。
- reattach replaces thread store and subscription id。

删除或重写以下旧测试意图：

- unsafe integer sequence。
- projection instance mismatch。
- sequence gap。
- projection reset。
- thread metadata null projection。

这些测试覆盖的是历史协议，不应继续约束当前分支。

## 非目标

本次 generator 迁移不做：

- 不恢复旧 `ProjectionState`。
- 不恢复旧 `ProjectionEventPayload`。
- 不新增 server-side GUI store。
- 不新增 projection reset event。
- 不新增 metadata projection event。
- 不实现 catch-up 或 missed commits API。
- 不让 generator 启动真实 app-server。
- 不扩大当前 projection event 白名单。

## 验证策略

实现迁移后建议运行：

```bash
cd codex-rs
just fmt
cargo test -p codex-app-server thread_projection_fixtures --no-fail-fast
cargo test -p codex-app-server-protocol thread_projection --no-fail-fast
cargo run -p codex-app-server --bin write_gui_projection_fixtures
```

然后在 repo root 或 `codex-gui` 运行前端测试。具体命令以 `codex-gui/package.json` scripts 为准，预期至少覆盖：

```bash
pnpm --dir codex-gui test
pnpm --dir codex-gui type-check
```

如果修改了 Rust protocol 类型或 schema，不属于单纯 fixture generator 迁移，应另行运行：

```bash
cd codex-rs
just write-app-server-schema
cargo test -p codex-app-server-protocol
```

## 成功标准

- GUI projection fixture JSON 由当前 Rust protocol 类型生成。
- fixture 文件不再包含旧 projection 字段。
- 前端 projection reducer 测试围绕 `subscriptionId` / `headCommitId` / `commitId` / `parentCommitId`。
- writer 命令可以重复运行且输出稳定。
- 不恢复 `port/lazy-projections` 的旧 projection backend、protocol 或 state machine。
