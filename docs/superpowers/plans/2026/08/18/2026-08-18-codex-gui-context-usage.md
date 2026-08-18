# Codex GUI 上下文用量展示实施计划

计划状态：已确认

确认日期：2026-08-18

确认原文：开始进行

计划日期：2026-08-18

对应设计：
`docs/superpowers/specs/2026/08/18/2026-08-18-codex-gui-context-usage-design.md`

计划分支：`dev`

计划基线：`becb36104206cf5bbab04bf9a44cceab55d686a9`

## 唯一目标

按已确认设计，为 `codex-gui` 当前任务 Composer 增加上下文用量展示：以
`ThreadTokenUsage.last.totalTokens` 和运行时 `modelContextWindow` 为权威数据，显示原始
已用百分比与 token 明细，并通过真实 HeroUI Button 打开 Popover。

实现必须通过现有 thread projection 提供 attach 基线和有序 live update；最终只能保留这一条
权威 ingress，不直接消费普通 `thread/tokenUsage/updated`，不增加自动压缩预警或 TUI baseline
百分比算法。

## 当前代码为何必须修改

- app-server v2 已有 `ThreadTokenUsageUpdatedNotification` 与 `ThreadTokenUsage`，但
  `ThreadProjectionSnapshot` 和 `ThreadProjectionEvent` 没有 token usage。
- projection attach connection 不是普通 thread subscriber。只把
  `thread/tokenUsage/updated` 加入 GUI allowlist，标准 GUI 仍通常收不到通知，并且没有 attach
  基线、`subscriptionId` 或 commit 顺序。
- `codex-gui` 的 `ThreadRuntimeRecord` 当前不保存 usage；projection ingress、transcript 和
  Composer queue 对新增 event variant 也没有 exhaustiveness 分支。
- Composer 右侧操作组已有明确挂载点，但没有用量 selector、格式化模型、HeroUI 组件和
  Lingui 文案。
- `codex-desktop` 使用原始 `used / window`，TUI `/status` 使用扣除 `12k` baseline 后的剩余
  百分比；已确认设计明确选择前者，不能在实现时重新混合两套语义。

因此本功能不是静态组件修改。必须先补齐 Rust projection contract，再让 GUI runtime 消费同一
生成 contract，最后接入 Composer。

## 权威 contract 与依赖顺序

```text
Core TokenUsageInfo
  -> app-server ThreadTokenUsage
  -> ThreadProjectionSnapshot.tokenUsage
     + ThreadProjectionEvent.tokenUsageUpdated
  -> generated TypeScript/schema/validators/fixtures
  -> projection ingress commit chain
  -> threadRuntime.tokenUsage
  -> derived context usage model
  -> Composer Button + ProgressCircle + Popover
```

- `ThreadTokenUsage` 是跨 Rust/TypeScript 的唯一权威 payload；不得在 GUI 手写字段镜像。
- projection snapshot 提供绝对基线，structural event 提供带 commit/parent 的绝对 live update。
- Redux 只保存原始 `ThreadTokenUsage | null`；百分比、compact 文案和容量是否可知全部在 selector
  或纯展示模型中派生。
- runtime-only usage event 不进入 transcript，也不改变 active turn、Composer queue 或 scroll
  commit。
- HeroUI 组件只消费派生展示事实，不读取累计 `total.totalTokens` 或配置阈值。

## 固定范围

### 设计与计划文档

- `docs/superpowers/specs/2026/08/18/2026-08-18-codex-gui-context-usage-design.md`
- `docs/superpowers/plans/2026/08/18/2026-08-18-codex-gui-context-usage.md`

### Rust protocol 与 app-server

- `codex-rs/app-server-protocol/src/protocol/v2/thread_projection.rs`
- `codex-rs/app-server/src/request_processors/thread_projection.rs`
- `codex-rs/app-server/src/thread_projection.rs`
- `codex-rs/app-server/src/thread_projection_fixtures.rs`
- `codex-rs/app-server/src/thread_projection_fixtures_tests.rs`
- `codex-rs/app-server/tests/suite/v2/thread_projection.rs`
- `codex-rs/app-server/src/outgoing_message.rs`、`projection_fanout.rs`、
  `thread_projection_runtime.rs`（仅新增 enum variant 导致的 exhaustive test/match 更新）
- `codex-rs/app-server/README.md`
- `codex-rs/app-server-protocol/schema/**`（只由 schema 生成脚本更新）
- `codex-gui/src/features/projection/__fixtures__/**`（只由 app-server fixture generator 更新）

### GUI projection 与 runtime

- `codex-gui/src/generated/appServerProtocol/**`（只由 validator generator 更新）
- `codex-gui/src/features/projection/__tests__/projectionFixtures.ts`
- `codex-gui/src/features/projection/__tests__/projectionTestBuilders.ts`
- `codex-gui/src/features/guiHost/__tests__/generatedAppServerProtocol.test.ts`
- `codex-gui/src/features/projectionIngress/projectionIngressAdapter.ts`
- `codex-gui/src/features/projectionIngress/__tests__/projectionIngressAdapter.test.ts`
- `codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts`
- `codex-gui/src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts`
- `codex-gui/src/features/transcriptState/transcriptProjection.ts`
- `codex-gui/src/features/transcriptState/__tests__/transcriptStateCommittedProjection.test.ts`
- `codex-gui/src/features/composerInputQueue/composerInputQueueRuntimeObservation.ts`
- `codex-gui/src/features/composerInputQueue/__tests__/composerInputQueueRuntimeObservation.test.ts`

### Composer 展示、国际化与 Browser 测试

- `codex-gui/src/features/composerTurnControl/ContextUsagePopover.tsx`（新增）
- `codex-gui/src/features/composerTurnControl/contextUsageModel.ts`（新增）
- `codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx`
- `codex-gui/src/features/composerTurnControl/__tests__/contextUsageModel.test.ts`（新增）
- `codex-gui/src/features/composerTurnControl/__tests__/ContextUsagePopover.browser.test.tsx`
  （新增）
- `codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx`
- `codex-gui/src/locales/en.po`
- `codex-gui/src/locales/zh-CN.po`

生成命令实际 diff 若只涉及上述生成目录的一部分，以真实生成结果为准；不得手工添加、删除或
回退生成物来伪造较小范围。

若实现必须修改普通 notification allowlist/callback、GUI Host bridge、startup/thread-switch owner
union、`Thread`/`Turn` payload、`Config`、TUI、桌面端、账户用量、依赖或上述范围外生产模块，立即
停止并回到计划确认。

## 非目标与禁止范围

- 不直接消费普通 `thread/tokenUsage/updated`，不新增平行顶层
  `thread/projection/tokenUsage`。
- 不用 `total.totalTokens`、input/output breakdown、account usage、response usage 或前端 tokenizer
  估算上下文用量。
- 不复制 TUI `12k` baseline，不显示“剩余百分比”。
- 不读取 `model_auto_compact_token_limit`，不新增 warning/danger 色或自动压缩阈值文案。
- 不在 transcript、只读历史详情或跨 thread 汇总中显示用量。
- 不增加 Tooltip、`Popover.Trigger` 嵌套按钮、自定义 overlay 或新增 CSS 文件。
- 不新增依赖、安装工具或浏览器，不运行后端/原生/CLI build 或 run。
- schema 与 projection fixture 的项目生成流程属于明确允许的生成流程；不得用手写 patch 模拟。
- 不运行裸 `cargo test`、crate-wide `just test -p ...`、workspace `just test`、workspace lint 或
  `just fix`。
- 不运行 Git 远程命令。
- 不在行为提交中混入 import、声明、字段、函数、组件等纯顺序整理；若确需纯重排，停止并新增
  独立计划任务。

每个任务以一个独立本地提交结束。中间提交允许暂时无法通过依赖后续任务的 GUI typecheck，但不得
为此引入 adapter、fallback、双写、双读或旧新路径并存；最终状态只有 projection 一条权威链路。

## Preflight（实施前只读）

```bash
git status --short --branch
git rev-parse --abbrev-ref HEAD
git rev-parse HEAD
git log -1 --oneline
rg -n '^version = "0\.0\.0"$' codex-rs/Cargo.toml
test -x /opt/homebrew/bin/fnm
test -x codex-rs/app-server-protocol/scripts/write_schema_fixtures.py
test -d codex-gui/node_modules
test -d codex-gui/.heroui-docs/react
test -d codex-gui/.redux-toolkit-docs
test -d ../vitest/docs
/opt/homebrew/bin/fnm exec --using-file pnpm --version
cargo nextest --version
just --list
```

要求：

- 分支/HEAD 仍为 `dev @ becb36104206cf5bbab04bf9a44cceab55d686a9`；如漂移，先只读评估
  计划与当前代码差异，不机械执行旧行号。
- `codex-rs/Cargo.toml` 的 workspace version 在 `dev` 上仍为 `0.0.0`，每次 Rust 提交前再次
  检查。
- 当前预存变更只能包含本设计和计划文档；若出现其他变更，逐文件避让，不覆盖用户工作。
- fnm、pnpm、node_modules、本地 HeroUI/Redux/Vitest 文档、cargo-nextest、just 或生成脚本缺失时
  停止；助手不得安装。
- 所有 pnpm 命令 cwd 为 `codex-gui`，使用
  `/opt/homebrew/bin/fnm exec --using-file pnpm ...`。`--using-file` deprecation warning 已核实为
  非阻塞提示。
- 所有 Rust test 使用精确名称 filter；不得扩大到 crate 或 workspace。

### Schema 生成入口的当前事实

当前 `just write-app-server-schema` 仍指向已不存在的
`codex-app-server-protocol --bin write_schema_fixtures`。仓库实际存在、且 Git 历史确认的新入口是：

```text
codex-rs/app-server-protocol/scripts/write_schema_fixtures.py
```

本计划直接调用该项目脚本，不修改 `justfile`，也不把修复旧 recipe 混入本功能。

## Task 0：确认并提交设计与计划文档

### 修改

- 用户确认本计划后，把计划状态更新为“已确认”，记录确认日期和确认原文。
- 不改写已确认设计语义或四项产品决策。

### 验证与提交

```bash
git add -- docs/superpowers/specs/2026/08/18/2026-08-18-codex-gui-context-usage-design.md docs/superpowers/plans/2026/08/18/2026-08-18-codex-gui-context-usage.md
git diff --cached --check
git diff --cached --name-only
git diff --cached
git commit -m 'docs(gui): plan context usage display'
```

staged name 必须恰好是这两份文档。

## Task 1：给 thread projection 增加权威 token usage

### 修改

- 在 `ThreadProjectionSnapshot` 增加 `token_usage: Option<ThreadTokenUsage>`。该 v2 response 字段
  wire name 为 `tokenUsage`，未知时序列化为 `null`，不使用 `skip_serializing_if`。
- 在 `ThreadProjectionEvent` 增加 `TokenUsageUpdated`，payload 直接复用
  `ThreadTokenUsageUpdatedNotification`，不创建 projection 专用 DTO。
- snapshot 从 loaded `CodexThread::token_usage_info()` 读取完整状态并通过现有 `From` 转换；无
  权威 usage 时保留 `None`，不从 config 或 transcript 猜测。
- `projection_event_from_notification` 将现有
  `ServerNotification::ThreadTokenUsageUpdated` 转换为 structural event，复用当前
  `commitId / parentCommitId / head` 链。
- 更新所有受新 enum variant 和 snapshot field 影响的 Rust exhaustive match 与测试构造点，只做
  必需分支，不重排代码。
- 新增 app-server 公共 JSON-RPC 集成覆盖：
  - 完成一次带 usage 的 turn 后 attach，snapshot 含最新 usage；
  - 无 usage thread attach 返回 `null`；
  - attach 后下一次 TokenCount 产生 `tokenUsageUpdated` structural event；
  - usage event 推进 head，下一 structural event 的 parent 指向该 commit；
  - snapshot-ahead 后同值绝对 event 覆盖幂等，不丢失后续链。
- 扩展 projection fixture generator：attach baseline/replacement 明确携带 usage 或 `null`；新增
  `event-token-usage-updated.json` 并纳入 fixture set、round-trip 和 commit-chain 断言。
- 更新 app-server README 中 projection attach snapshot、structural event、commit 与 reattach
  说明。
- 使用原生生成流程更新 stable/experimental schema、TypeScript、JSON、`.zst` 和 GUI projection
  JSON fixtures；禁止手改生成输出。

### 生成

从仓库根目录运行：

```bash
python3 codex-rs/app-server-protocol/scripts/write_schema_fixtures.py
python3 codex-rs/app-server-protocol/scripts/write_schema_fixtures.py --experimental
just write-gui-projection-fixtures
```

### 窄验证

新增测试使用以下精确名称，实施时若名称变化必须先用 `rg` 核对后替换，不扩大 filter：

```bash
just test -p codex-app-server-protocol deserialize_thread_projection_token_usage_event_notification
just test -p codex-app-server-protocol typescript_schema_fixtures_match_generated
just test -p codex-app-server-protocol json_schema_fixtures_match_generated
just test -p codex-app-server-protocol stable_precomputed_exports_match_schema_fixtures
just test -p codex-app-server-protocol experimental_precomputed_exports_match_generated
just test -p codex-app-server generated_fixture_set_is_stable
just test -p codex-app-server generated_fixtures_match_current_projection_shape
just test -p codex-app-server generated_fixtures_round_trip_through_protocol_types
just test -p codex-app-server generated_fixtures_match_committed_files
just test -p codex-app-server thread_projection_attach_includes_token_usage_baseline
just test -p codex-app-server thread_projection_token_usage_event_advances_commit_chain
```

测试通过后运行格式化，且不在 `just fmt` 后重复测试：

```bash
just fmt
git diff --check
rg -n '^version = "0\.0\.0"$' codex-rs/Cargo.toml
```

若 `just fmt` 修改计划外文件，逐文件判断是否为本任务必需；禁止直接暂存范围外格式化 churn。

### 提交

只暂存本任务的 Rust 源码、README、schema/`.zst` 生成物和 generator 产出的 projection JSON
fixtures。检查 staged diff 与文件名后提交：

```bash
git commit -m 'feat(app-server): project thread token usage'
```

## Task 2：在 GUI runtime 消费 projection usage

### 修改

- 运行 validator generator，使 `ThreadProjectionEventNotification` 的生成 validator 接受新 variant；
  不修改顶层 selected notification 方法集合，不新增 token usage callback。
- 导入 generator 新增的 `event-token-usage-updated.json`，扩展共享 typed fixture/builder；测试中的
  合法 payload 继续从共享入口取得。
- `ProjectionIngressAdapter` 将 `tokenUsageUpdated` 视为不依赖 parent turn 的合法 structural
  event：它仍验证 `threadId`、`subscriptionId` 和 commit chain，推进现有 head，但不登记 turn。
- `replayForProjectionEvent` 对 usage event 返回 `live`。snapshot 可能已含同值，但 event 是完整
  绝对快照，随后覆盖幂等；不得新增 usage replay ID 或第二个 head。
- `ThreadRuntimeRecord` 增加 `tokenUsage: ThreadTokenUsage | null`：
  - attach/replacement 从 `snapshot.tokenUsage` 初始化；
  - 接受 usage event 时整体覆盖 `event.notification.tokenUsage`；
  - 仍把 event 放入有界 runtime event buffer；
  - 导出只读 `selectThreadRuntimeTokenUsage`，不把百分比、compact 文案或 warning 状态存入 Redux。
- `transcriptProjection` 在记录 transcript dedupe/scroll commit 前显式忽略 usage event，保证
  runtime-only commit 不改变 transcript selector 或滚动信号。
- `runtimeObservationFromAcceptedProjectionEvent` 对 usage event 显式返回 `null`，不改变 queue
  owner。
- 不修改 GUI Host callback、Bridge、startup/thread-switch coordinator 或 top-level allowlist；新
  variant 已沿用现有 projection event transport 和 owner 缓冲链。

### 生成与格式化

在 `codex-gui` 目录运行：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run protocol:generate-validators
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt:fix
```

检查 generator 实际 diff；不得手改 validator JavaScript、descriptor 或 `.d.ts`。

### 定向验证

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/guiHost/__tests__/generatedAppServerProtocol.test.ts src/features/projectionIngress/__tests__/projectionIngressAdapter.test.ts src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts src/features/transcriptState/__tests__/transcriptStateCommittedProjection.test.ts src/features/composerInputQueue/__tests__/composerInputQueueRuntimeObservation.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run protocol:check-validators
/opt/homebrew/bin/fnm exec --using-file pnpm run ci
```

测试至少证明：

- attach baseline、replacement 与 live event 都保存完整权威 payload；
- wrong thread、stale subscription、duplicate commit 与 reconnect 边界继续生效；
- usage event 不要求 parent turn，但必须推进原有 commit head；
- 连续或同值 usage event 只做绝对覆盖，不累加；
- selector 返回当前原始对象或 `null`；
- transcript、active turn、queue 和 scroll signal 不受 usage event 影响；
- 生成 validator 对合法新 variant 接受，对畸形 nested payload 拒绝。

### 提交

只暂存 validator generator 实际输出、projection shared fixtures/builders、ingress/runtime/no-op consumers
及其测试。检查 staged diff 后提交：

```bash
git commit -m 'feat(gui): store projected context usage'
```

## Task 3：在 Composer 显示 HeroUI 上下文用量

### 修改

- 新增纯 `contextUsageModel`，输入直接依赖生成的 `ThreadTokenUsage` 或 selector 返回值，派生：
  - `usedTokens = last.totalTokens`；
  - 窗口已知时 `round(clamp(used / window, 0, 1) * 100)`；
  - compact token 文案；
  - 窗口未知时无百分比，但保留 raw used tokens。
- 新增 `ContextUsagePopover`，使用 HeroUI v3：
  - `Popover`；
  - 真实 `Button size="sm" variant="tertiary"` 直接作为 trigger，不包
    `Popover.Trigger`；
  - Button 内显示中性 `ProgressCircle size="sm" color="default"` 和 compact used token 数；
  - 窗口未知时 `ProgressCircle` 使用 indeterminate；
  - `Popover.Content placement="top" → Popover.Dialog → Popover.Heading`；
  - 内部 ProgressCircle 对辅助技术隐藏，Button 的完整本地化 accessible name 与 Popover 正文提供
    等价信息。
- `ComposerTurnControl` 通过 `selectThreadRuntimeTokenUsage` 消费当前 owner 数据，在右侧操作组、
  `Stop` 之前渲染。usage 为 `null` 时不渲染占位；不修改 props 链、草稿、Stop/Send 或 queue 行为。
- JSX 文案使用 `Trans`，`aria-label` 使用 macro `useLingui().t`；数字先形成具名展示变量，再进入
  message。
- 先运行 Lingui extraction，再补齐 `zh-CN.po` 翻译；项目没有 compile script，不新增一个。
- 不新增 CSS 文件，不硬编码 warning/danger 色，不用 Tooltip 或自定义 overlay。

### 生成与格式化

在 `codex-gui` 目录运行：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run messages:extract
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt:fix
```

检查 catalog diff，只填写本任务新 message 的简体中文 `msgstr`，不顺手重写历史翻译。

### Unit 与 Browser 验证

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/composerTurnControl/__tests__/contextUsageModel.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:parallel -- src/features/composerTurnControl/__tests__/ContextUsagePopover.browser.test.tsx src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run ci
```

Browser 测试使用 `vitest-browser-react` 的异步 `render`、精确 accessible-name locator 和可重试
`expect.element`。至少覆盖：

- usage 未知时 Button 不存在；
- `149k / 258k` 显示原始 `58% 已用`，不显示 TUI baseline 或剩余百分比；
- Button 可见 compact used count，点击与 Enter/Space 打开具名 Popover；
- Popover 展示已用百分比和 `used / total`；
- 窗口未知时显示已用 tokens、indeterminate ring 和容量未知文案，不伪造 `0%`；
- 超窗时百分比钳制为 `100%`，明细保留 raw used；
- 内部 ProgressCircle 不重复暴露第二个可访问 progressbar；
- 英文和简体中文文案可用；
- 高用量仍保持中性，不出现自动压缩或 warning/danger 语义；
- live update 与 replacement attach 更新/清除当前 Button，旧 thread usage 不残留；
- Stop/Send、草稿、queue 提示和 Composer sticky 布局保持原行为。

本地 Vitest Browser 文档没有独立 touch API，因此不伪造合成 touch event。真实 HeroUI Button 的
`onPress` 保留统一 pointer/touch 语义；自动化验证真实 button 的 pointer click 与键盘激活。

测试不锁定 padding、gap、阴影、颜色值或 SVG stroke 数值。

### 提交

只暂存 context usage model/component、Composer 接线、Browser/unit 测试和本任务 catalog 变化。检查
staged diff 后提交：

```bash
git commit -m 'feat(gui): show context usage in composer'
```

## 最终合并状态核验（不产生提交）

Task 3 的 `pnpm run ci` 和定向三浏览器 Browser tests 已覆盖最终 GUI 状态；Task 1 的 Rust 窄测试在
Rust 格式化前完成。全部任务提交后只做只读核验，不重复运行测试，也不生成额外提交：

```bash
git status --short --branch
git log -4 --oneline
git diff HEAD~4..HEAD --check
git diff HEAD~4..HEAD --stat
git diff HEAD~4..HEAD --name-only
rg -n '^version = "0\.0\.0"$' codex-rs/Cargo.toml
```

要求：

- 恰好包含 Task 0–3 四个本地提交，顺序与计划一致；
- 最终 diff 只有固定范围文件和生成器的真实输出；
- `codex-rs/Cargo.toml` 仍为 `0.0.0`；
- 工作树没有本计划遗留变更；预存无关变更若存在则保持原样；
- 不执行 Git 远程操作。

## 计划内失败闭环

- 本次变更引入的生成、类型、lint、测试、格式或 Browser 失败，在对应任务范围内直接修正并重新运行
  该任务必要验证，不回避、不放宽断言、不新增 ignore/skip/fallback。
- Task 1 的 Rust 测试必须在 `just fmt` 前完成；若 `just fmt` 产生语义可疑变化，先检查 diff，不以
  “格式化”名义接受行为变化。
- validator 或 schema generator 若产生计划外大范围变化，停止并报告，不手工删改生成物隐藏漂移。
- 预存或与本次变更无关的失败只记录和汇报，不借本计划修复。
- 只有需要计划外生产文件、新外部 API、不同数据语义、安全/权限变化或新增依赖时，才停止并回到
  计划确认。

## 完成标准

- projection attach 能提供 token usage 基线，后续 usage 通过同一 structural commit 链有序更新。
- GUI runtime 只保存当前 owner 的权威 `ThreadTokenUsage`，reattach/replacement/live update 后收敛，
  不污染 transcript 或 queue。
- Composer 显示原始已用比例和 token 明细，窗口未知时不伪造比例。
- HeroUI Button/Popover 可由 pointer 与键盘访问，Lingui 英文和简体中文文案完整。
- 无普通通知旁路、无 TUI baseline、无自动压缩预警、无手写协议镜像或生成物。
- 四个本地提交与计划一一对应，最终验证通过，工作树无本计划遗留变更。
