# Codex GUI 上下文压缩展示分页实施计划

状态：已确认

日期：2026-08-15

原计划确认日期：2026-08-15

原计划用户确认原文：`确认计划`

修订日期：2026-08-15

修订确认日期：2026-08-15

修订计划用户确认原文：`开始进行`

修订原因：补入已确认的历史竞态架构边界，并用 canonical identity + 按 turn FIFO echo 配对替换
错误的事件紧邻假设。

实施基线：`dev @ 44b0614250da67f2247543e52e84d04c8cfe0a2b`

对应设计：[Codex GUI 上下文压缩展示分页设计](../../../../specs/2026/08/15/2026-08-15-codex-gui-context-compaction-pagination-design.md)

设计状态：已确认。

本修订计划落盘不授权立即实现。用户明确确认本修订计划后，才依次执行 Task 0 至 Task 3；每个 Task
形成一个独立本地提交，最后执行只读完成检查。

## 目标

为 Codex GUI 增加按成功上下文压缩事件划分的纯展示分页，让用户按模型上下文代际查阅
transcript。分页不改变 attach 的完整历史加载、压缩算法或现有 100-entry chunk 的性能边界；
不引入分页持久化、cursor 或新协议字段，只补齐 successful canonical compaction event 的既有
identity 持久化与历史重建，使 compaction 能复用 GUI 已有的 `snapshotDuplicate` 竞态补偿。

第 1 页包含首次成功压缩之前的内容；每个 successful canonical
`itemCompleted(contextCompaction)` 立即建立下一页，completed marker 属于新页。初始展示最新页；
用户位于最新页时继续跟随新页，浏览旧页时保持原页。页面使用 HeroUI v3 `Pagination`，第 2 页
及之后使用 `Separator` 和独立文本“上下文已压缩”，不展示压缩摘要。

## 根因、历史取舍与必须先修复的 identity seam

当前 v2 已有 `ThreadItem::ContextCompaction`，但链路的历史与 GUI 两端都丢失了可靠的 completed
边界：

- 只有 successful canonical `itemCompleted(contextCompaction)` 能建立页面；`itemStarted` 在
  压缩执行前发出，失败时可以永远没有配对 completed，因此 started 不能作为页边界。
- paginated rollout 已持久化 canonical `ItemCompleted`，但 legacy policy 目前只依赖 deprecated
  `ContextCompacted` echo；legacy 也必须持久化 canonical completed，才能保留原始 item identity。
- `ThreadHistoryBuilder` 当前忽略 materialized lifecycle 中的 canonical compaction，并从 deprecated
  echo 生成 synthetic id；canonical completed 与兼容 echo 同时存在时还可能重建出两个 marker。
- 历史 snapshot marker 与 live canonical marker 因而 identity 不同构，无法仅凭
  `(turnId, item.id)` 实现 snapshot/live/reconnect 幂等。
- GUI 的 completed item policy 仍将 `contextCompaction` 设为 `ignore`，无法形成 page partition；
  started 也被忽略，而 started 的这一行为必须保持。

仓库历史已经用 `ProjectionHistoryCursor` 尝试过服务端强一致 snapshot cut，但该方案跨多个 Rust
模块维护 history cursor，既产生 listener/history 成本，又真实造成 persisted final/complete 被
物理截断。`99531ff40` 已明确移除 cursor，`3ea5dc02a` 改为由 GUI 按稳定 turn/item ID 将
snapshot-ahead replay 标记为 `snapshotDuplicate`。本计划必须遵守该架构取舍：不恢复 cursor，
不修改 snapshot cut、listener ordering、thread store 或 core persistence/delivery 顺序。

本次只补齐 compaction 对现有 replay 架构的 identity 前提。修复顺序必须先让 Rust 历史重建保留
canonical completed identity，并用按 turn FIFO 队列配对仍需保留的 deprecated echo，再让 GUI
snapshot/live 走同一 completed boundary 分支。不得用 token、turn 数量、时间邻近、文本、尾页
形状或事件紧邻等启发式信号猜测或去重。

## 精确文件范围

### 文档

- `docs/superpowers/specs/2026/08/15/2026-08-15-codex-gui-context-compaction-pagination-design.md`
- `docs/superpowers/plans/2026/08/15/2026-08-15-codex-gui-context-compaction-pagination.md`

### Rust 历史重建

- `codex-rs/rollout/src/policy.rs`
- 新增 `codex-rs/rollout/src/policy_tests.rs`
- `codex-rs/app-server-protocol/src/protocol/thread_history.rs`
- `codex-rs/app-server/src/thread_projection_runtime.rs`（只新增 attach-ahead 专项测试）
- `codex-rs/app-server/tests/suite/v2/compaction.rs`

### GUI transcript state

- `codex-gui/src/features/projection/__tests__/projectionTestBuilders.ts`
- `codex-gui/src/features/transcriptState/transcriptStateModel.ts`
- 新增 `codex-gui/src/features/transcriptState/transcriptContextPages.ts`
- `codex-gui/src/features/transcriptState/transcriptItemPolicy.ts`
- `codex-gui/src/features/transcriptState/transcriptStateImplementation.ts`
- `codex-gui/src/features/transcriptState/transcriptStateSelectors.ts`
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts`
- `codex-gui/src/features/transcriptState/__tests__/transcriptItemPolicy.test.ts`
- 新增 `codex-gui/src/features/transcriptState/__tests__/transcriptContextPages.test.ts`
- `codex-gui/src/features/transcriptState/__tests__/transcriptStateReconnect.test.ts`
- `codex-gui/src/features/transcriptState/__tests__/transcriptStateReplayDedup.test.ts`
- `codex-gui/src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts`
- `codex-gui/src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts`

### GUI 展示与本地化

- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx`
- 新增
  `codex-gui/src/features/committedTranscriptSurface/TranscriptContextPagination.tsx`
- 新增
  `codex-gui/src/features/committedTranscriptSurface/__tests__/TranscriptContextPagination.browser.test.tsx`
- `codex-gui/src/locales/en.po`
- `codex-gui/src/locales/zh-CN.po`

若证据表明必须修改以上范围之外的文件、增加协议字段、改变滚动产品行为或引入新的 UI 语义，
立即停止并回到计划确认，不自行扩大范围。

## 非目标与禁止范围

- 不做性能分页、增量加载、cursor/limit、虚拟列表、后端存储分页或 attach 协议改造；
- 不恢复 `ProjectionHistoryCursor`，不修改 snapshot cut、listener ordering、thread store、core
  persistence/delivery 顺序或全局 snapshot-ahead 竞态模型；
- 不引入新的分页持久化或 compaction 协议字段；只修复 successful canonical compaction event
  的既有持久化与重建；
- 不展示、传输或持久化压缩摘要，不读取 rollout 原始 `compacted` payload；
- 不改变 v2 `ThreadItem` 形状，不生成或修改 schema、generated TypeScript、validator；
- 不根据 token 比例、turn 数量、页面大小或 started 事件推断页边界；
- 不加入启发式去重，不折叠连续 successful compaction；
- 不复制 transcript 正文，不把所有 entries flatten 成长期存在的全局数组，不形成第二套
  transcript 状态机；
- 不让非当前页以隐藏 DOM 继续挂载，不改变 global status 的含义或归属；
- 不新增计划外滚动、自动定位、焦点恢复或其他交互语义；
- 不为通过验证增加 skip、ignore、豁免、计划外 fallback、放宽断言、删除覆盖或修改基线；
- 不安装依赖、运行后端/原生/CLI build 或 run、操作 Git 远程；
- 不运行 `cargo test`、完整 Rust crate 测试或完整 Rust workspace 测试；
- 不在行为提交中混入 import、声明、函数、组件等纯顺序调整。若确需纯重排，停止并拆为新的
  独立任务，不顺手混入本计划提交；
- 最终 canonical completed 是新历史的唯一权威来源；deprecated echo 按已确认决策继续产出和
  持久化，但只作为配对兼容回声，不构成第二来源。旧 echo-only rollout 继续使用现有 synthetic
  fallback；除这项明确的兼容配对外，不得新增临时双写、双读、adapter、计划外 fallback 或旧新
  权威来源并存。

总代码行为 diff 目标小于 500 行；若实际变更达到 800 行，停止实现并按已验证依赖重新拆分，
不得继续堆叠。

## Preflight（实施前只读检查）

在 Task 0 前完成下列检查，不修改 workspace：

```bash
git status --short --branch
git rev-parse --abbrev-ref HEAD
git rev-parse HEAD
git log -1 --oneline
test -x /opt/homebrew/bin/fnm
test -d codex-gui/node_modules
command -v just
command -v cargo
```

要求：

- 当前分支和 HEAD 与 `dev @ 44b0614250da67f2247543e52e84d04c8cfe0a2b` 一致；若已漂移，
  先只读评估计划是否仍适用；
- 识别所有预存未提交变更，后续只暂存本 Task 的精确文件，不覆盖或提交用户已有变更；
- `/opt/homebrew/bin/fnm`、`codex-gui/node_modules`、`just` 或 `cargo` 缺失时立即停止，由用户自行
  安装或恢复；助手不得安装；
- 所有 pnpm 命令都以 `codex-gui` 为 cwd，并使用
  `/opt/homebrew/bin/fnm exec --using-file pnpm ...`；
- 不执行任何远程 Git 命令。

## Task 0：确认并提交设计与计划修订

### 修改

- 用户确认本修订计划后，只把计划状态从“修订待确认”改为“已确认”，记录修订确认日期与用户
  确认原文；
- 设计正文已经按重新 grilling 的两个确认决策更新，不再改写设计语义；
- 此任务只包含设计与计划文档，不包含代码。

### 验证与提交

```bash
git diff --check -- docs/superpowers/specs/2026/08/15/2026-08-15-codex-gui-context-compaction-pagination-design.md docs/superpowers/plans/2026/08/15/2026-08-15-codex-gui-context-compaction-pagination.md
git add -- docs/superpowers/specs/2026/08/15/2026-08-15-codex-gui-context-compaction-pagination-design.md docs/superpowers/plans/2026/08/15/2026-08-15-codex-gui-context-compaction-pagination.md
git diff --cached --check
git diff --cached --name-only
git diff --cached
git commit -m 'docs(gui): revise context compaction pagination'
```

`git diff --cached --name-only` 必须恰好列出上述设计与计划两份文档，否则先修正暂存集，不提交。

## Task 1：保留 canonical compaction 历史 identity

### 修改

- 在 `codex-rs/rollout/src/policy.rs` 让 legacy rollout 也持久化 successful canonical
  `ItemCompleted(ContextCompaction)`；在新增的 `policy_tests.rs` 中测试，并使用显式
  `#[path = "policy_tests.rs"]`，不把新测试内联进实现文件；
- `ThreadHistoryBuilder` 以 canonical completed 为优先来源，用原始 `turnId + item.id` 重建
  compaction marker；
- deprecated `ContextCompacted` echo 继续产出并在 legacy rollout 中持久化，不改变当前兼容
  消费者与数据格式；
- `ThreadHistoryBuilder` 为当前 turn 维护待消费 echo 的 FIFO identity 队列：首次物化 canonical
  completed 时登记一次；同一 `(turnId, item.id)` 的重复 completed 不重复登记；
- `TokenCount`、`Compacted` 及其他中间事件不得清除 pending 配对；deprecated echo 到达且队列
  非空时消费最早配对项但不追加 marker；队列为空时才生成旧 synthetic marker；
- turn 边界清理未消费 pending 项，使 paginated canonical-only history 不污染后续 turn；
- 禁止使用“抑制下一条 echo”的布尔值、相邻事件判断或其他启发式配对；
- 只保留代码当前已有的 deprecated echo-only 旧 rollout synthetic-id 重建能力，保证旧历史仍有
  边界；canonical completed 存在时 deprecated echo 不成为第二个权威来源；
- 连续 successful compaction 各自保留，不能因配对逻辑或相邻事件而折叠；
- 不修改 v2 类型、wire shape、schema 或压缩算法；
- 在 `codex-rs/app-server/tests/suite/v2/compaction.rs` 新增
  `compact_attach_snapshot_preserves_context_compaction_id`，通过公共 JSON-RPC API 并使用
  auto-env fixture；
- 在 `codex-rs/app-server/src/thread_projection_runtime.rs` 新增
  `attach_snapshot_compaction_replay_preserves_identity`，构造 persisted compaction 已进入 snapshot、
  projection head 仍落后、canonical completed 在 attach 后投递的真实 attach-ahead 顺序，断言
  snapshot 与 live item ID 相同。

### 测试覆盖

- canonical-only 历史保留原始 marker id；
- canonical completed 与 deprecated echo 之间插入 `TokenCount`、`Compacted` 等事件时仍只生成
  一个 canonical-ID marker；
- 重复 canonical completed 不增加 pending echo 或 marker；
- legacy echo-only 历史仍通过当前已有兼容能力生成 synthetic marker；
- 连续 successful compaction 生成多个独立 marker；
- paginated canonical-only turn 在结束后不把未消费 pending 状态泄漏到下一 turn；
- attach snapshot 返回的 marker id 与 canonical completed id 相同。
- attach-ahead snapshot 与随后 live completed 共享 item ID，满足 GUI `snapshotDuplicate` 分类前提。

### 验证顺序

运行以下固定窄 test filter：

```bash
cd codex-rs
just test -p codex-rollout legacy_persists_completed_context_compaction
just test -p codex-app-server-protocol context_compaction
just test -p codex-app-server attach_snapshot_compaction_replay_preserves_identity
just test -p codex-app-server --test all compact_attach_snapshot_preserves_context_compaction_id
```

禁止把 filter 省略成完整 crate 测试。测试通过后运行仓库原生 Rust 格式化：

```bash
cd codex-rs
just fmt
```

`just fmt` 后不再运行测试。检查其实际 diff；若格式化触及范围外文件，停止并处理范围，不把无关
格式化结果带入提交。

### 暂存与提交

只暂存本任务固定的五个 Rust 文件：

```bash
git diff --check -- codex-rs/rollout/src/policy.rs codex-rs/rollout/src/policy_tests.rs codex-rs/app-server-protocol/src/protocol/thread_history.rs codex-rs/app-server/src/thread_projection_runtime.rs codex-rs/app-server/tests/suite/v2/compaction.rs
git add -- codex-rs/rollout/src/policy.rs codex-rs/rollout/src/policy_tests.rs codex-rs/app-server-protocol/src/protocol/thread_history.rs codex-rs/app-server/src/thread_projection_runtime.rs codex-rs/app-server/tests/suite/v2/compaction.rs
git diff --cached --check
git diff --cached --name-only
git diff --cached
git commit -m 'fix(app-server): preserve canonical compaction history'
```

提交前确认没有 schema/generated diff，也没有 Task 2 或 Task 3 文件。

## Task 2：派生 transcript context pages

### 修改

- 在共享 `projectionTestBuilders` 中加入 canonical compaction completed fixture builder，所有新状态
  测试复用它，不在各测试复制不一致 payload；
- `transcriptItemPolicy` 新增 completed boundary 分支，started 继续 `ignore`；
- 新 `transcriptContextPages.ts` 负责基于 normalized transcript state 派生 context pages；每个页
  partition 仅保存 page、boundary 和 ordered turn-fragment/chunk/entry identity references；
- 不复制正文、不 flatten 全历史；同一 turn 可以跨页，每个 fragment 仍引用原 turn owner；
- compaction 必须结束当前 fragment 和 middle chunk，并在新页强制开启新 chunk；现有每 chunk
  最多 100 entries 的规则继续独立生效；
- snapshot rebuild 与 live completed 走同一 boundary 归属和 identity 路径；重复 completed、
  reconnect replay、snapshot/live 重叠都以 canonical `(turnId, item.id)` 幂等；
- attach-ahead 重放继续由现有 `snapshotReplayIndex` / `snapshotDuplicate` 分类处理；分页状态不得
  新增 compaction 数量、turn、时间或尾页形状启发式去重；
- compaction 位于末尾时立即生成仅含 boundary 的页；连续 completed 生成连续独立页；
- 若为现有 renderer 保留 aggregate turn view，它只能是同一 authoritative entry/chunk 的 distinct
  index：不得复制内容、拥有独立生命周期或形成第二状态机；最终不得保留临时双写或兼容路径。

### 测试覆盖

专门的 context pages 单测覆盖第 1 页、同 turn 跨页、末尾 marker、连续 marker、started-only、
重复 completed、snapshot/live identity 统一、reconnect/replay 幂等、compaction 强制新 chunk 和
正文引用不复制。threadRuntime 测试必须用 canonical compaction fixture 覆盖同 ID
`snapshotDuplicate`，证明分页复用既有 replay 分类而非另造启发式。覆盖固定落在 item policy、
context pages、reconnect、replay dedup、selector cache 和 threadRuntime 测试；不为相同事实重复造测试。

### 验证顺序

先运行新单测和直接受影响的既有 unit test 文件，再执行 task-scoped 格式、lint 和类型检查。所有
命令 cwd 为 `codex-gui`：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit -- src/features/transcriptState/__tests__/transcriptItemPolicy.test.ts src/features/transcriptState/__tests__/transcriptContextPages.test.ts src/features/transcriptState/__tests__/transcriptStateReconnect.test.ts src/features/transcriptState/__tests__/transcriptStateReplayDedup.test.ts src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt --write src/features/projection/__tests__/projectionTestBuilders.ts src/features/transcriptState/transcriptStateModel.ts src/features/transcriptState/transcriptContextPages.ts src/features/transcriptState/transcriptItemPolicy.ts src/features/transcriptState/transcriptStateImplementation.ts src/features/transcriptState/transcriptStateSelectors.ts src/features/transcriptState/transcriptStateSlice.ts src/features/transcriptState/__tests__/transcriptItemPolicy.test.ts src/features/transcriptState/__tests__/transcriptContextPages.test.ts src/features/transcriptState/__tests__/transcriptStateReconnect.test.ts src/features/transcriptState/__tests__/transcriptStateReplayDedup.test.ts src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxlint src/features/projection/__tests__/projectionTestBuilders.ts src/features/transcriptState/transcriptStateModel.ts src/features/transcriptState/transcriptContextPages.ts src/features/transcriptState/transcriptItemPolicy.ts src/features/transcriptState/transcriptStateImplementation.ts src/features/transcriptState/transcriptStateSelectors.ts src/features/transcriptState/transcriptStateSlice.ts src/features/transcriptState/__tests__/transcriptItemPolicy.test.ts src/features/transcriptState/__tests__/transcriptContextPages.test.ts src/features/transcriptState/__tests__/transcriptStateReconnect.test.ts src/features/transcriptState/__tests__/transcriptStateReplayDedup.test.ts src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm exec eslint --cache src/features/projection/__tests__/projectionTestBuilders.ts src/features/transcriptState/transcriptStateModel.ts src/features/transcriptState/transcriptContextPages.ts src/features/transcriptState/transcriptItemPolicy.ts src/features/transcriptState/transcriptStateImplementation.ts src/features/transcriptState/transcriptStateSelectors.ts src/features/transcriptState/transcriptStateSlice.ts src/features/transcriptState/__tests__/transcriptItemPolicy.test.ts src/features/transcriptState/__tests__/transcriptContextPages.test.ts src/features/transcriptState/__tests__/transcriptStateReconnect.test.ts src/features/transcriptState/__tests__/transcriptStateReplayDedup.test.ts src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

使用原生命令且把格式化、oxlint、eslint 限定到本 Task 文件；type-check 按项目脚本执行。然后：

```bash
cd codex-rs
just fmt
```

`just fmt` 后不再运行测试。检查 Rust 格式化没有产生 Task 2 范围外 diff。

### 暂存与提交

```bash
git diff --check -- codex-gui/src/features/projection/__tests__/projectionTestBuilders.ts codex-gui/src/features/transcriptState/transcriptStateModel.ts codex-gui/src/features/transcriptState/transcriptContextPages.ts codex-gui/src/features/transcriptState/transcriptItemPolicy.ts codex-gui/src/features/transcriptState/transcriptStateImplementation.ts codex-gui/src/features/transcriptState/transcriptStateSelectors.ts codex-gui/src/features/transcriptState/transcriptStateSlice.ts codex-gui/src/features/transcriptState/__tests__/transcriptItemPolicy.test.ts codex-gui/src/features/transcriptState/__tests__/transcriptContextPages.test.ts codex-gui/src/features/transcriptState/__tests__/transcriptStateReconnect.test.ts codex-gui/src/features/transcriptState/__tests__/transcriptStateReplayDedup.test.ts codex-gui/src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts codex-gui/src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts
git add -- codex-gui/src/features/projection/__tests__/projectionTestBuilders.ts codex-gui/src/features/transcriptState/transcriptStateModel.ts codex-gui/src/features/transcriptState/transcriptContextPages.ts codex-gui/src/features/transcriptState/transcriptItemPolicy.ts codex-gui/src/features/transcriptState/transcriptStateImplementation.ts codex-gui/src/features/transcriptState/transcriptStateSelectors.ts codex-gui/src/features/transcriptState/transcriptStateSlice.ts codex-gui/src/features/transcriptState/__tests__/transcriptItemPolicy.test.ts codex-gui/src/features/transcriptState/__tests__/transcriptContextPages.test.ts codex-gui/src/features/transcriptState/__tests__/transcriptStateReconnect.test.ts codex-gui/src/features/transcriptState/__tests__/transcriptStateReplayDedup.test.ts codex-gui/src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts codex-gui/src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts
git diff --cached --check
git diff --cached --name-only
git diff --cached
git commit -m 'feat(gui): derive transcript context pages'
```

暂存集必须只含本任务状态模型、projection builder、新派生模块和直接对应测试；不得包含展示、locale
或纯重排。

## Task 3：渲染当前上下文页和分页控件

### 修改

- `CommittedTranscriptSurface` 的 fragment renderer 只挂载当前页引用；旧页切走后从 DOM 卸载，
  不以 `display: none` 或折叠容器保留；
- 新 `TranscriptContextPagination` 使用 HeroUI v3 compound API：`Pagination`、
  `Pagination.Content`、`Pagination.Item`、`Pagination.Link`、`Pagination.Previous`、
  `Pagination.Next` 和 `Pagination.Ellipsis`；
- 页面状态为受控 `selectedHistoricalPage: number | null`：`null` 表示跟随最后页；用户选择旧页后
  保存具体页码，直到用户回到最后页；
- 交互使用 `onPress`、`isActive`、`isDisabled` 和 `Ellipsis`；当前页通过组件输出
  `aria-current="page"`，Previous/Next/页码使用可访问名称；
- 只有多页时渲染 `Pagination`；初始和 `null` 状态展示最新页；实时 completed 时，`null` 自动
  跟随新页，具体旧页保持不变；
- 第 2 页及以后在页首渲染 `Separator variant="tertiary"` 和独立
  `<Trans>Context compressed</Trans>`；`zh-CN.po` 翻译为“上下文已压缩”，辅助技术只读出一次；
- 不显示压缩摘要；global status 保持在分页之外，不随页面过滤或复制。

### 本地化

运行 catalog 原生命令，只提取新增消息：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run messages:extract
```

只补目标 `zh-CN.po` 翻译，不运行 `messages:extract:clean` 或 compile，不手工加入未提取的 message。
检查 catalog diff 不包含无关消息删除或重排。

### Browser 覆盖

新增 Browser test 使用 role/name locator 和 `expect.element`，在现有 parallel Browser Mode 三浏览器
配置中覆盖：

- 初次默认最新页；
- 用户选择旧页后，实时 completed 只增加总页数并保持旧页；
- `null` 尾随状态遇到实时 completed 自动进入新页；
- 连续尾随 completed 形成连续独立页；
- 页数足够多时显示 HeroUI Ellipsis；
- 当前页具有 `aria-current="page"`，首尾 Previous/Next 正确 disabled；
- 切页后旧页 transcript DOM 已卸载；
- `zh-CN` 显示“上下文已压缩”。

不得用可见文本代替真正的 accessible name 断言，也不得固化 padding、gap、颜色或阴影数值。

### 验证顺序

先运行新增 Browser test 和完整 unit 回归，再运行 task-scoped 格式、lint、type-check：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:parallel -- src/features/committedTranscriptSurface/__tests__/TranscriptContextPagination.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt --write src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx src/features/committedTranscriptSurface/TranscriptContextPagination.tsx src/features/committedTranscriptSurface/__tests__/TranscriptContextPagination.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxlint src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx src/features/committedTranscriptSurface/TranscriptContextPagination.tsx src/features/committedTranscriptSurface/__tests__/TranscriptContextPagination.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm exec eslint --cache src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx src/features/committedTranscriptSurface/TranscriptContextPagination.tsx src/features/committedTranscriptSurface/__tests__/TranscriptContextPagination.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

Browser 命令必须使用 parallel 配置的 Chromium、Firefox、WebKit 三浏览器，不拆成单浏览器通过。
随后运行：

```bash
cd codex-rs
just fmt
```

`just fmt` 后不再运行测试。检查格式化没有产生范围外 diff。

### 暂存与提交

```bash
git diff --check -- codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx codex-gui/src/features/committedTranscriptSurface/TranscriptContextPagination.tsx codex-gui/src/features/committedTranscriptSurface/__tests__/TranscriptContextPagination.browser.test.tsx codex-gui/src/locales/en.po codex-gui/src/locales/zh-CN.po
git add -- codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx codex-gui/src/features/committedTranscriptSurface/TranscriptContextPagination.tsx codex-gui/src/features/committedTranscriptSurface/__tests__/TranscriptContextPagination.browser.test.tsx codex-gui/src/locales/en.po codex-gui/src/locales/zh-CN.po
git diff --cached --check
git diff --cached --name-only
git diff --cached
git commit -m 'feat(gui): paginate transcript by compaction'
```

暂存集必须只含 surface、分页组件、Browser test 和两份 catalog；不得包含 schema、生成文件、状态
兼容路径或纯重排。

## 编辑、验证与提交纪律

- 每个 Task 开始前检查 `git status --short`，只处理该 Task 范围；中间提交可依赖后续 Task，
  不为使中间提交独立 build 而加入临时 compatibility；
- 源码普通内容仅在没有更高层原生命令可表达时使用补丁；格式化和 catalog 必须使用上述项目命令；
- 每个 Task 的测试在格式化前运行；最后一次 `just fmt` 后不重跑测试；
- 每次只 `git add --` 精确实际文件，随后检查 staged name、staged diff 和 `--check`；
- Task 0、Task 1、Task 2、Task 3 必须各有一个独立提交，禁止合并任务提交；
- 不 amend、不 squash、不创建空提交，不操作远程。

## 最终只读完成检查

Task 3 提交后只读检查，不再修改，不形成第五个或空提交：

```bash
git status --short --branch
git log -4 --oneline --decorate
git diff --check
git diff --cached --check
```

完成条件：

- 最近四个本地提交依次为 docs 提交、Rust 历史提交、GUI state 提交、GUI 展示提交；
- 四个提交的 subject 分别为：
  - `docs(gui): revise context compaction pagination`
  - `fix(app-server): preserve canonical compaction history`
  - `feat(gui): derive transcript context pages`
  - `feat(gui): paginate transcript by compaction`
- workspace 没有本计划遗留的 unstaged/staged 文件；预存无关变更保持原样且未被提交；
- successful canonical completed 在 legacy/paginated snapshot 与 live 路径拥有统一 identity；
- deprecated echo 保持兼容产出，但 canonical + 中间事件 + echo 只物化一个 marker；旧 echo-only
  rollout 仍可恢复；
- 未恢复 history cursor 或改变全局 snapshot-ahead 架构，attach-ahead compaction replay 由稳定
  identity 进入现有 `snapshotDuplicate` 路径；
- GUI 页数与 successful completed 一一对应，started-only 不建页，连续压缩不折叠；
- 同 turn 跨页、chunk 边界、selector cache、reconnect/replay 幂等保持，正文不复制；
- 最新页跟随、旧页保持、旧页 DOM 卸载、HeroUI Pagination/Separator、Lingui 和三浏览器覆盖符合
  已确认设计；
- 没有协议/schema、性能分页、摘要、启发式去重、临时兼容路径、计划外 UI 或 Git 远程改动。
