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

旧的 `event-large-sequence.json` 应删除。前端 reducer 应通过 commit id 判断连续性，而不是用数字 sequence 判断 gap。

### 不生成当前协议不存在的 event

当前 projection manager 不产生 `projectionReset` 或 `threadMetadataUpdated` projection event。

旧 fixture：

- `event-large-sequence.json`
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
codex-gui/.prettierignore
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

## 前端工程边界

历史分支把前端按 repo-level monorepo 工作方式处理，容易让 GUI 依赖安装或脚本执行修改根 `pnpm-lock.yaml`。

当前分支的 `codex-gui` 应作为 repo 内独立前端工程处理：

- 不把 `codex-gui` 加入根 `pnpm-workspace.yaml`。
- 不因 GUI 依赖安装或测试修改根 `pnpm-lock.yaml`。
- GUI 依赖锁定应落在 `codex-gui` 自己的 lockfile。如果当前没有 `codex-gui/pnpm-lock.yaml`，第一次安装 GUI 依赖时应在 `codex-gui` 目录内生成并提交它。
- 前端命令默认在 `codex-gui` 目录内执行，而不是从 repo root 通过 workspace filter 执行。
- 如果使用 `pnpm -C codex-gui ...`，需要确保不会把安装解析回根 workspace；安装依赖时优先用 `cd codex-gui && pnpm install --ignore-workspace`。

这条边界和 Rust fixture generator 无关，但会影响实现时的验证命令和锁文件改动范围。

## Rust API

`codex-rs/app-server/src/lib.rs` 暴露一个隐藏测试工具入口：

```rust
#[doc(hidden)]
pub fn write_gui_projection_fixtures(out_dir: &std::path::Path) -> anyhow::Result<()> {
    thread_projection_fixtures::write(out_dir)
}
```

这层 re-export 不是协议 API。保留它的理由是维持历史 binary 调用形状，让 `src/bin/write_gui_projection_fixtures.rs` 可以继续通过 `codex_app_server::write_gui_projection_fixtures` 调用 crate 内实现。除该 binary 和测试外，不应把它当作外部稳定接口使用。

binary 维持历史命令形状：

```bash
cargo run -p codex-app-server --bin write_gui_projection_fixtures -- \
  --out-dir ../../codex-gui/src/features/projection/__fixtures__
```

默认 `out_dir`：

```text
CARGO_MANIFEST_DIR/../../codex-gui/src/features/projection/__fixtures__
```

这里必须以 `env!("CARGO_MANIFEST_DIR")` 为基准，而不是 current working directory。这样无论命令从 repo root、`codex-rs` 还是 `codex-rs/app-server` 运行，默认输出目录都一致。

## Fixture 集合

迁移后的第一版 fixture 集合建议为：

```text
attach-baseline.json
attach-replacement.json
event-turn-started.json
event-item-started.json
event-item-completed.json
event-turn-completed.json
event-subscription-replacement.json
```

不生成旧文件：

```text
event-large-sequence.json
event-projection-reset.json
event-thread-metadata-updated-null.json
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

`event.notification` 必须是完整 `TurnStartedNotification`，即包含 `threadId` 和 `turn`。生成器应直接构造 Rust 协议结构体，不手写局部 JSON，也不只生成 `turn` 字段。

### `event-item-started.json`

类型：`ThreadProjectionEventNotification`

内容：

```text
commitId = "commit-item-started"
parentCommitId = "commit-turn-started"
event.type = "itemStarted"
```

`event.notification` 必须是完整 `ItemStartedNotification`，即包含 `threadId`、`turnId`、`item`、`startedAtMs`。用于验证前端在 parent commit 连续时把 item 写入已有 turn。

### `event-item-completed.json`

类型：`ThreadProjectionEventNotification`

内容：

```text
commitId = "commit-item-completed"
parentCommitId = "commit-item-started"
event.type = "itemCompleted"
```

`event.notification` 必须是完整 `ItemCompletedNotification`，即包含 `threadId`、`turnId`、`item`、`completedAtMs`。用于验证前端按 item id 替换 in-progress item。

### `event-turn-completed.json`

类型：`ThreadProjectionEventNotification`

内容：

```text
commitId = "commit-turn-completed"
parentCommitId = "commit-item-completed"
event.type = "turnCompleted"
```

`event.notification` 必须是完整 `TurnCompletedNotification`，即包含 `threadId` 和 `turn`。用于验证前端把 turn 更新为 completed。

### `event-subscription-replacement.json`

类型：`ThreadProjectionEventNotification`

内容：

- `subscriptionId = "projection-fixture-replacement-subscription"`
- `parentCommitId = "commit-replacement-head"`
- `commitId = "commit-replacement-next"`
- `event.type = "turnStarted"`
- `event.notification` 使用完整 `TurnStartedNotification`，即包含 replacement thread id 和一个 replacement turn。

用于验证前端 reattach 后只接受新 subscription 的事件。这个 fixture 也复用于 stale subscription 测试：在 baseline subscription 状态下派发它，应因为 `subscriptionId` 不匹配而被忽略；在 `attach-replacement` 后派发它，应按 replacement 链正常 apply。

## Commit Chain 拓扑

第一版 fixture 使用两条明确的链。

baseline 链：

```text
attach-baseline
  snapshot.headCommitId = null
  subscriptionId = "projection-fixture-subscription"
  |
  v
event-turn-started
  parentCommitId = null
  commitId = "commit-turn-started"
  |
  v
event-item-started
  parentCommitId = "commit-turn-started"
  commitId = "commit-item-started"
  |
  v
event-item-completed
  parentCommitId = "commit-item-started"
  commitId = "commit-item-completed"
  |
  v
event-turn-completed
  parentCommitId = "commit-item-completed"
  commitId = "commit-turn-completed"
```

replacement 链：

```text
attach-replacement
  snapshot.headCommitId = "commit-replacement-head"
  subscriptionId = "projection-fixture-replacement-subscription"
  |
  v
event-subscription-replacement
  parentCommitId = "commit-replacement-head"
  commitId = "commit-replacement-next"
  event.type = "turnStarted"
```

不新增 `event-commit-chain-second.json`。`event-item-started`、`event-item-completed`、`event-turn-completed` 已经覆盖连续 commit chain，额外 fixture 只会增加维护面。

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
else if event.commitId == local.headCommitId:
  ignore duplicate
else if event.parentCommitId != local.headCommitId:
  mark reattach("commitChainMismatch")
else:
  apply event.event.notification
  local.headCommitId = event.commitId
```

这里的 duplicate 分支是必须的。server 或 transport 层如果重放了本地已经应用过的最新 commit，前端不能把它当成断链，否则会产生 reattach 循环。

第一版前端只保存 `headCommitId`，不保存完整祖先集合。因此可识别的重复事件只有 `event.commitId == local.headCommitId`。如果未来前端保存短窗口 commit history，可以把“可识别祖先 commit”也作为 duplicate ignore；第一版不为此额外建索引。

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
- 所有 path-shaped fixture 字段都必须输出正斜杠路径；不要通过 `Path::display()` 把 Windows `\` 写入 fixture。
- 使用 `serde_json::to_string_pretty`，末尾追加 `\n`。

不要在 fixture 中使用 `Uuid::now_v7()`、当前时间或临时目录路径。

### 平台与 path 字段

这个 generator 只在 unix-like 平台运行。

- `#[cfg(not(unix))]` 下不编译 generator binary 和 golden 测试，或者直接 `compile_error!`。
- `write_gui_projection_fixtures` 的 CI 只在 unix runner 上执行。
- `Thread.cwd` 必须用 `AbsolutePathBuf::from_absolute_path("/tmp/codex-gui-projection-fixtures")` 构造。
- `Thread.path` 在所有 fixture 中固定为 `None`。
- 其他 path-shaped 字段如果无法稳定保证正斜杠和平台一致性，也应优先设为 `None` 或空集合，而不是让 generator 试图跨平台序列化 `PathBuf`。

这样可以避免 Windows 上 `AbsolutePathBuf` 构造失败，也避免 `PathBuf` 默认序列化把反斜杠写进 committed fixture。

## Prettier 边界

`codex-gui` 的 `ci` 脚本第一步会运行 `prettier --check .`。Rust 的 `serde_json::to_string_pretty` 输出不应被要求匹配 Prettier 的 JSON 格式，否则 generator 输出和前端 formatter 会争夺 fixture 文件所有权。

实现时应新增或更新 `codex-gui/.prettierignore`，排除 generator-owned fixture 目录：

```text
src/features/projection/__fixtures__/
```

这样 JSON fixture 的格式由 Rust generator 负责，Prettier 不再重排这些文件。不要改成让 generator 复刻 Prettier 输出；那会让 byte stability 依赖前端 formatter 版本和配置。

## Rust 测试

在 `thread_projection_fixtures.rs` 内保留 unit tests：

```text
generated_fixture_set_is_stable
generated_fixtures_match_current_projection_shape
generated_fixtures_round_trip_through_protocol_types
generated_commit_chain_is_contiguous
generated_fixtures_match_committed_files
write_preserves_unrelated_files
```

测试重点：

- fixture 文件名集合稳定。
- attach fixture 顶层是 `subscriptionId` + `snapshot`。
- event fixture 顶层是 `threadId` + `subscriptionId` + `commitId` + `parentCommitId` + `event`。
- 不出现旧字段：`projectionInstanceId`、`latestSequence`、`sequence`、`eventId`、`payload`。
- commit chain fixture 的 `parentCommitId` 严格指向前一个 fixture 的 `commitId`。
- 每个 attach fixture 都能 `serde_json::from_str::<ThreadProjectionAttachResponse>`。
- 每个 event fixture 都能 `serde_json::from_str::<ThreadProjectionEventNotification>`。
- 反序列化后的结构体再次 pretty serialize，应与原 fixture 内容一致。
- `generated_fixtures_match_committed_files` 应把 generator 输出和已提交的 GUI fixture 文件逐字节比较。
- writer 不删除 unrelated file。

`generated_fixtures_match_committed_files` 的测试形状：

```text
for each (name, generated_contents) in generate_fixture_files():
  committed_path = CARGO_MANIFEST_DIR/../../codex-gui/src/features/projection/__fixtures__/<name>
  committed_contents = read(committed_path)
  assert_eq!(committed_contents, generated_contents)
```

失败信息应明确提示：

```text
re-run cargo run -p codex-app-server --bin write_gui_projection_fixtures and commit the fixture changes
```

这个测试让 generator 漂移在 Rust 测试阶段暴露，而不是等到前端测试或 code review 才发现 fixture 过时。

首次落地 `generated_fixtures_match_committed_files` 时，需要先运行 `cargo run -p codex-app-server --bin write_gui_projection_fixtures` 写入 fixture 并提交，然后 `cargo test` 才能通过。后续如果 generator 输出变化，也使用同样流程：先运行 binary 重写 fixture，再提交 fixture 更新，再运行测试。

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
- stale subscription event ignored。这个用例复用 `event-subscription-replacement.json`：在 baseline projection state 下派发 replacement subscription event，状态不应变化。
- duplicate latest commit ignored。
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
git -C .. status --short -- codex-gui/src/features/projection/__fixtures__
```

`write_gui_projection_fixtures` 必须是幂等的。在干净 working tree 上运行后，`git status` 不应该出现 fixture 改动；如果出现改动，说明 generator 输出不稳定，或者已提交 fixture 过时，需要重新生成并提交。

然后在 `codex-gui` 目录内运行前端测试。具体命令以 `codex-gui/package.json` scripts 为准，预期至少覆盖：

```bash
cd codex-gui
pnpm test
pnpm type-check
```

当前 `codex-gui/package.json` 的 scripts 已包含 `test` 和 `type-check`，并且 `ci` 脚本通过 `pnpm` 串起 format、lint、type-check、test。实现时如 package manager 或 scripts 变化，以当时的 `codex-gui/package.json` 为准。

如果实现过程中需要安装或更新 GUI 依赖，命令应在 `codex-gui` 内执行，并避免修改 repo root `pnpm-lock.yaml`：

```bash
cd codex-gui
pnpm install --ignore-workspace
```

预期锁文件结果：

- 可以新增或更新 `codex-gui/pnpm-lock.yaml`。
- 不应修改 repo root `pnpm-lock.yaml`，除非用户明确要求把 `codex-gui` 纳入根 workspace。

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
