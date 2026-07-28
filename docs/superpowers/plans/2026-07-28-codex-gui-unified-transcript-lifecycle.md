# Codex GUI 统一 transcript lifecycle 实施计划

日期：2026-07-28
状态：待确认

设计依据：
`docs/superpowers/specs/2026-07-28-codex-gui-unified-transcript-lifecycle-design.md`

## 目标

把当前 message 的 committed/live 双管线重写为统一 transcript lifecycle：由 message policy 独占
leading prompt、commentary 和 final answer 分类语义，由同一个 coordinator 处理 accepted snapshot、
`itemStarted`、类型化 update batch 与 `itemCompleted`。在这个基础上恢复已经人工验收的 activity 展示，
不增加 reasoning、命令行或搜索 UI。

最终实现必须满足：

- streaming message、activity 与 commentary 共用按首次可见顺序排列的 intermediate timeline；
- completed 完整 `ThreadItem` 覆盖 transient state，并收敛同一 logical slot；
- activity 不拥有自己的 lifecycle、scroll、chunk、selector 或 equality 管线；
- Redux slice 只路由 accepted runtime 输入，不编排 item 类型或 live/committed 分支；
- snapshot/realtime、dedup/reconnect、chunk/cache、sticky-bottom 和折叠不挂载语义保持一致；
- activity 的既有文案、可见时机、原位收敛、Card 和 accessibility 行为保持不变。

## Authoritative contract 与范围

authoritative source 是 generated `@codex-protocol/v2`：

- 完整 item 使用 `ThreadItem`；
- snapshot 使用 `ThreadProjectionAttachResponse` 对应的 accepted attach payload；
- started/completed 使用 `ThreadProjectionEventNotification`；
- typed updates 使用 `ThreadProjectionDeltaNotification`。

新代码只直接使用 generated 类型，或通过 `Extract`、indexed access 等机械方式派生。禁止新增
frontend-owned protocol mirror、兼容 DTO、宽泛 record、runtime validator 或公共 capability registry。
frontend-owned 类型只表达 lifecycle、presentation、placement、revision 和 rendering 语义。

实现修改限定在 `codex-gui/**`。不修改：

- `codex-rs/**`、app-server protocol、generated contracts 或 validators；
- projection ingress、thread runtime coordination 或 transport contract；
- reasoning、`commandExecution`、`webSearch`、MCP、file change 的具体 UI；
- 子线程订阅、导航、liveness 或终态推断；
- 依赖、lockfile、`package.json` 或 package scripts。

预计最终生产文件：

- Create: `codex-gui/src/features/transcriptState/transcriptLifecycle.ts`
- Create: `codex-gui/src/features/transcriptState/transcriptMessagePresentation.ts`
- Create: `codex-gui/src/features/transcriptState/transcriptActivityPresentation.ts`
- Create: `codex-gui/src/features/committedTranscriptSurface/TranscriptActivityCard.tsx`
- Modify: `codex-gui/src/features/transcriptState/transcriptStateModel.ts`
- Modify: `codex-gui/src/features/transcriptState/transcriptStateSlice.ts`
- Modify: `codex-gui/src/features/transcriptState/transcriptStateSelectors.ts`
- Modify: `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx`
- Modify: `codex-gui/src/features/committedTranscriptSurface/committedTranscriptChunkEquality.ts`
- Delete after atomic ownership migration:
  `codex-gui/src/features/transcriptState/transcriptCommittedProjection.ts`
- Delete after atomic ownership migration:
  `codex-gui/src/features/transcriptState/transcriptLiveProjection.ts`
- Delete after semantic replacement:
  `codex-gui/src/features/transcriptState/transcriptEntryMaterialization.ts`

语义明确的重命名使用 `git mv`，删除使用 `git rm`。若实现需要修改计划外生产文件，停止并更新计划；不用
临时 adapter、兼容分支、ignore 或降级检查掩盖范围变化。

## 实施纪律

- 计划确认后按任务顺序连续执行；每个任务完成修改、聚焦验证和直接引入问题的闭环后，只 stage 本任务
  文件，检查 staged diff，并立即创建一个本地提交。
- 每个任务在 stage 前，对实际修改的 frontend 文件运行 scoped `oxfmt --write`，检查 diff，再对同一文件
  列表运行 `oxfmt --check`；格式化属于该任务提交。
- Task 2 必须原子切换 lifecycle ownership；任何已提交状态都不能同时存在新 coordinator 与旧
  committed/live coordinator。
- 每个非机械任务保持可审查。若单任务非机械 diff 实际超过约 800 行，先按真实依赖更新计划并重新确认，
  不通过压缩测试、删除覆盖或放宽断言缩小数字。
- GUI 命令全部从 `codex-gui` 运行，使用
  `/opt/homebrew/bin/fnm exec --using-file pnpm ...`。
- 实施前只检查 `fnm`、`pnpm` 与已有 Playwright browser binary；缺失时停止并请用户自行安装，助手不安装。
- 合法 protocol fixture 优先扩展 shared projection builders，不在单个测试中手写 authoritative contract。
- 不合并任务提交，不 amend 已完成任务，不操作 Git 远程。

## Task 0：提交已确认的工作文档

目标：在代码实施前固定已经确认的设计状态和实施计划，使后续任务只提交各自代码与测试。

Files:

- Modify: `docs/superpowers/specs/2026-07-28-codex-gui-unified-transcript-lifecycle-design.md`
- Create: `docs/superpowers/plans/2026-07-28-codex-gui-unified-transcript-lifecycle.md`

Implementation:

- 将本计划状态从“待确认”更新为“已确认（2026-07-28）”。
- 复核设计状态已是“已确认（2026-07-28）”。
- 只提交上述两份文档，不 stage 被 ignore 的 research。

Verification:

```bash
git diff --check
git status --short
```

Commit boundary:

- 建议提交信息：`docs(gui): plan unified transcript lifecycle`

## Task 1：建立 presentation slot 与 message policy 基础

目标：在现有 projection owner 内建立 frontend-domain slot、message policy、message-centered placement、
snapshot generation 与 selector/cache 基础。这个提交不创建、不启用 `transcriptLifecycle` external entry
points；snapshot/started/update/completed 仍由现有 projection 文件编排，因此不会出现双 owner。

Files:

- Create: `codex-gui/src/features/transcriptState/transcriptMessagePresentation.ts`
- Modify: `codex-gui/src/features/transcriptState/transcriptStateModel.ts`
- Modify: `codex-gui/src/features/transcriptState/transcriptCommittedProjection.ts`
- Modify: `codex-gui/src/features/transcriptState/transcriptEntryMaterialization.ts`
- Modify: `codex-gui/src/features/transcriptState/transcriptStateSlice.ts`
- Modify: `codex-gui/src/features/transcriptState/transcriptStateSelectors.ts`
- Modify: `codex-gui/src/features/transcriptState/__tests__/transcriptStateSnapshot.test.ts`
- Modify: `codex-gui/src/features/transcriptState/__tests__/transcriptStateCommittedProjection.test.ts`
- Modify: `codex-gui/src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts`

Implementation:

- 建立稳定 slot identity、`turnId`、location、authority、typed presentation、revision 与 snapshot generation；
  middle chunk 只保存 slot ID，不把 committed 或 item type 写进基础设施语义。
- 把 message materialization 收敛到真实 production message policy。policy 直接接收 generated message
  variant，只返回 message presentation 与 placement intent，不负责 chunk、scroll、dedup 或 React。
- snapshot 与 realtime completed message 共用 authoritative materialization。
- placement 只接受 message policy 的特殊请求：第一条可见 user message 才能成为 leading，assistant
  `final_answer` 才能进入 final，其他 message 进入 intermediate；基础设施不维护 non-message 排除表。
- snapshot 是 full replacement，并推进 presentation generation；不同 attach 使用相同 IDs/revisions 时不能
  错误复用旧 view。
- 保持 chunk 上限 100、所属 chunk 局部 revision、其他 chunk/turn selector 引用稳定；revision 不是内容
  相等的唯一依据。
- 现有 streaming live state 和用户行为保持不变；本任务不增加新的 lifecycle coordinator。

Focused verification:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run \
  src/features/transcriptState/__tests__/transcriptStateSnapshot.test.ts \
  src/features/transcriptState/__tests__/transcriptStateCommittedProjection.test.ts \
  src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
/opt/homebrew/bin/fnm exec --using-file pnpm run lint
```

Commit boundary:

- 建议提交信息：`refactor(gui): establish transcript presentation slots`

## Task 2：原子切换到统一 message lifecycle

目标：一次性创建三个 authoritative external entry points，迁移 snapshot、started、typed updates、completed、
dedup、guard、ordering、revision 与 scroll impact，然后删除旧 committed/live owner。提交后 message 只能通过
统一 lifecycle 进入 presentation timeline。

Files:

- Create: `codex-gui/src/features/transcriptState/transcriptLifecycle.ts`
- Modify: `codex-gui/src/features/transcriptState/transcriptStateModel.ts`
- Modify: `codex-gui/src/features/transcriptState/transcriptStateSlice.ts`
- Modify: `codex-gui/src/features/transcriptState/transcriptStateSelectors.ts`
- Modify: `codex-gui/src/features/transcriptState/transcriptEventDedup.ts`（仅 ownership 迁移需要时）
- Delete: `codex-gui/src/features/transcriptState/transcriptCommittedProjection.ts`
- Delete: `codex-gui/src/features/transcriptState/transcriptLiveProjection.ts`
- Delete: `codex-gui/src/features/transcriptState/transcriptEntryMaterialization.ts`
- Modify: `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx`
- Modify: `codex-gui/src/features/appShell/useCommittedTranscriptStickyBottom.ts`（仅统一 signal 改变 selector
  contract 时）
- Rename:
  `codex-gui/src/features/transcriptState/__tests__/transcriptStateCommittedProjection.test.ts` →
  `codex-gui/src/features/transcriptState/__tests__/transcriptLifecycleAuthoritative.test.ts`
- Rename:
  `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveItemLifecycle.test.ts` →
  `codex-gui/src/features/transcriptState/__tests__/transcriptLifecycleRealtime.test.ts`
- Delete after migrating relevant cases:
  `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveItemIndex.test.ts`
- Delete after migrating relevant cases:
  `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveStreaming.test.ts`
- Modify: `codex-gui/src/features/transcriptState/__tests__/transcriptStateReplayDedup.test.ts`
- Modify: `codex-gui/src/features/transcriptState/__tests__/transcriptStateReconnect.test.ts`
- Modify: `codex-gui/src/features/transcriptState/__tests__/transcriptStateScrollSignals.test.ts`
- Modify: `codex-gui/src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts`
- Modify: `codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx`

Implementation:

- 对外只暴露 accepted attach replacement、accepted structural event、accepted typed update batch；参数从
  runtime action payload / generated types 机械取得，不包装 frontend-owned protocol union。
- slice 的三个 runtime reducer 只调用上述入口；turn event 也由 coordinator 处理。manual reconnect 仍只
  添加 interruption status，下一次 attach 才 replacement。
- coordinator 自身检查 current thread/subscription/generation；wrong-thread、stale-subscription、
  `snapshotDuplicate`、重复 `commitId` 与重复 started 是完整 no-op，不改变 selector identity、revision 或
  scroll impact。
- started agent message 建立 transient intermediate slot；delta 只更新已有且类型匹配的 lifecycle record，
  缺失 record 不创建幽灵 slot。
- update batch 保持 notification 顺序，按 `(turnId, itemId)` 隔离 coalescing；每个被触及 slot 每批只
  materialize 一次、推进一次 revision/visible-change impact。
- completed 使用完整 item 权威替换 transient content；commentary 保留首次可见位置，final answer 是唯一
  允许从 intermediate 移入 final 的跨 location transition。
- 删除 `liveItemsByTurnId`、live index、live selectors、live-tail renderer 及旧 committed/live 编排；surface
  只消费统一 presentation view，不读取 lifecycle ledger。
- scroll 改为统一 visible-presentation change impact；hidden/no-op 不触发，sticky-bottom 继续决定用户离开
  底部时不强制拉回。
- attach replacement 清除 transient lifecycle、dedup window 与旧 interruption status；dedup 窗口继续硬
  限制为 500。

Test migration rules:

- 测试只穿过 production external entry points / Redux runtime actions 和 selectors，不断言旧 container。
- 参数化验证 snapshot/realtime 收敛、started/update/completed、completed-without-started、mixed message
  ordering、final settlement、duplicate no-op、reconnect replacement 和 batch isolation。
- selector/cache 验证同 revision 内容变化仍失效、同 generation 无变化保持引用、reattach generation 隔离、
  只有所属 chunk 失效。

Focused verification:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run \
  src/features/transcriptState/__tests__/transcriptLifecycleAuthoritative.test.ts \
  src/features/transcriptState/__tests__/transcriptLifecycleRealtime.test.ts \
  src/features/transcriptState/__tests__/transcriptStateReplayDedup.test.ts \
  src/features/transcriptState/__tests__/transcriptStateReconnect.test.ts \
  src/features/transcriptState/__tests__/transcriptStateScrollSignals.test.ts \
  src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --config=vitest.browser.config.ts --run \
  src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
/opt/homebrew/bin/fnm exec --using-file pnpm run lint
```

Commit boundary:

- 检查 staged diff 已彻底删除旧 message live/committed lifecycle owner。
- 建议提交信息：`refactor(gui): unify message transcript lifecycle`

## Task 3：实现 bounded activity presentation policy

目标：建立 coordinator 后续直接消费的真实 production activity policy，并用其正式 interface 锁定已验收
文案与 boundedness。本任务不接入 lifecycle、不创建 slot、不修改 renderer，也不暴露 test-only helper。

Files:

- Modify: `codex-gui/src/features/projection/__tests__/projectionTestBuilders.ts`
- Create: `codex-gui/src/features/transcriptState/transcriptActivityPresentation.ts`
- Create: `codex-gui/src/features/transcriptState/__tests__/transcriptActivityPresentation.test.ts`

Implementation:

- 输入类型从 generated `ThreadItem` 机械提取
  `collabAgentToolCall | subAgentActivity`；输出是 frontend activity presentation 或 hidden。
- 保持三类 `SubAgentActivity` title、wait/resume started 可见、spawn/send/close 等 started hidden、receiver
  顺序、空 receiver/state 泛化文案和既有 state/message 语义。
- sender ID、item ID、`agentThreadId` 不进入文案；不查询跨线程 state 或推断 liveness。
- prompt/completed/error 保持 `160/240/160` grapheme 上限；collection detail 增加明确的行数与总文本硬上限。
- 所有 tool/status/kind/state 分支穷尽；不保存 raw payload，不增加 runtime compatibility。
- 测试通过 production policy interface 验证完整文案、visible/hidden、隐私、排序与 bounds；不导出或测试
  truncation 等内部 helper。

Focused verification:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run \
  src/features/transcriptState/__tests__/transcriptActivityPresentation.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
/opt/homebrew/bin/fnm exec --using-file pnpm run lint
```

Commit boundary:

- 检查 production policy 没有 lifecycle、chunk、scroll、selector 或 React 依赖。
- 建议提交信息：`feat(gui): derive bounded activity presentations`

## Task 4：接入 activity lifecycle 与 renderer

目标：让统一 coordinator 消费 Task 3 的 activity policy，并完成 snapshot、started/completed、ordering、
selector/cache、HeroUI rendering 和 browser coverage。所有最终集成验证必须在本任务提交前通过。

Files:

- Modify: `codex-gui/src/features/transcriptState/transcriptLifecycle.ts`
- Modify: `codex-gui/src/features/transcriptState/transcriptActivityPresentation.ts`（仅 coordinator 接入需要时）
- Modify: `codex-gui/src/features/transcriptState/transcriptStateModel.ts`
- Modify: `codex-gui/src/features/transcriptState/transcriptStateSelectors.ts`（仅通用 view 需要时）
- Modify: `codex-gui/src/features/transcriptState/__tests__/transcriptLifecycleAuthoritative.test.ts`
- Modify: `codex-gui/src/features/transcriptState/__tests__/transcriptLifecycleRealtime.test.ts`
- Modify: `codex-gui/src/features/transcriptState/__tests__/transcriptStateSnapshot.test.ts`
- Modify: `codex-gui/src/features/transcriptState/__tests__/transcriptStateReplayDedup.test.ts`
- Modify: `codex-gui/src/features/transcriptState/__tests__/transcriptStateScrollSignals.test.ts`
- Modify: `codex-gui/src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts`
- Create: `codex-gui/src/features/committedTranscriptSurface/TranscriptActivityCard.tsx`
- Modify: `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx`
- Modify: `codex-gui/src/features/committedTranscriptSurface/committedTranscriptChunkEquality.ts`
- Modify:
  `codex-gui/src/features/committedTranscriptSurface/__tests__/committedTranscriptChunkEquality.test.ts`
- Modify:
  `codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx`

Implementation:

- snapshot 与 realtime completed 共用 authoritative activity policy；completed-without-started 在 completed
  到达位置创建 authoritative slot。
- wait/resume 等 visible started 创建 transient intermediate slot；hidden started 不创建 slot；completed
  使用同一 identity 原位收敛，并把完整 item 作为最终权威值。
- activity 及其他 non-message 默认只能进入 intermediate，不占 leading/final，也不阻止后续 user message
  成为 leading。
- activity 与 streaming/commentary 按首次可见顺序进入同一 chunked timeline；update/completed 只使所属
  slot/chunk 失效并产生一次 visible-change impact。
- selector/equality 基础设施只依赖通用 generation、slot identity/revision 与不可变 presentation identity；
  不增加 `activity.title/details` 专用比较分支，也不读取 raw activity payload。
- 使用 HeroUI v3 `Card variant="transparent"`、`Card.Header`、`Card.Title`、条件式
  `Card.Description`、`role="article"` 与确定性 accessible name；不增加 button、link、navigation、focus
  target 或 liveness。
- 折叠时不挂载内部 slot；一个 turn 跨 chunk 仍只有一个 `Intermediate updates` disclosure。

Focused verification:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run \
  src/features/transcriptState/__tests__/transcriptActivityPresentation.test.ts \
  src/features/transcriptState/__tests__/transcriptLifecycleAuthoritative.test.ts \
  src/features/transcriptState/__tests__/transcriptLifecycleRealtime.test.ts \
  src/features/transcriptState/__tests__/transcriptStateSnapshot.test.ts \
  src/features/transcriptState/__tests__/transcriptStateReplayDedup.test.ts \
  src/features/transcriptState/__tests__/transcriptStateScrollSignals.test.ts \
  src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts \
  src/features/committedTranscriptSurface/__tests__/committedTranscriptChunkEquality.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --config=vitest.browser.config.ts --run \
  src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx
```

Browser coverage:

- 通过 role + accessible name 定位 transparent activity Card，断言无交互控件和隐私 ID。
- wait started 可见，completed 后同一 DOM 顺序位置显示最终内容且 Card 数量不增加。
- activity 与 commentary/message 保持首次可见顺序。
- final answer 后 `Intermediate updates` 折叠且内部 activity 不挂载；展开后恢复顺序。
- 跨 100-entry chunk 仍只有一个 disclosure；完整文案矩阵不在 browser 重复。
- 对 locator 使用 `expect.element` 的 retriable assertions。

Final verification before commit:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
/opt/homebrew/bin/fnm exec --using-file pnpm run ci
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --config=vitest.browser.config.ts --run \
  src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx
git diff --check
git status --short
```

- `vitest.browser.config.ts` 当前覆盖 Chromium、Firefox、WebKit。
- 任一失败若由本次计划引入，必须在 Task 4 内修正并重跑相应验证后再提交；预存或无关失败只读汇报，
  不扩大修复范围。

Commit boundary:

- 检查 staged diff 没有 activity 专用 lifecycle/scroll/cache 分支，且所有最终验证已通过。
- 建议提交信息：`feat(gui): render activity through unified transcript lifecycle`

## 提交后状态确认与停止条件

Task 4 提交后只运行不会产生修复需求的只读状态检查：

```bash
git status --short
git log -5 --oneline
```

所有计划任务、验证和本地提交完成后，本轮立即停止，不追加复审、测试、实现、生成、验证或新任务。

## 计划确认门禁

本计划经用户明确确认前：

- 不修改 `codex-gui/**`；
- 不运行实现验证、格式化或生成命令；
- 不 stage 或 commit 本计划及其他变更；
- 不开始任何实现任务。
