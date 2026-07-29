# Codex GUI 父任务子代理活动展示实施计划

**Goal:** 在 GUI 父任务 transcript 中按 projection 发生顺序展示现有子代理协作活动，并保持 turn 分段、chunk 性能边界、`Intermediate updates` 和既有 assistant live streaming 行为不变。

**Architecture:** authoritative 输入继续是 `@codex-protocol/v2` 的 `ThreadItem`。前端在 transcript state 内把 `collabAgentToolCall` / `subAgentActivity` 机械派生为有界的 `activity` entry；`transcriptCommittedProjection` 统一负责 snapshot、`itemStarted`、`itemCompleted` 三条生命周期路径。可见 wait started 直接占据 committed middle 的稳定位置，completed 用同一 item ID 原位更新。React 只渲染已经派生的 title/details，并使用 HeroUI v3 transparent Card。

**Tech Stack:** React 19、TypeScript 6、Redux Toolkit 2、HeroUI React v3、Vitest 4 unit tests、Vitest Browser Mode + Playwright、fnm 管理的 Node/pnpm。

---

状态：待确认

设计依据：`docs/superpowers/specs/2026/07/2026-07-26-codex-gui-parent-subagent-activity-display-design.md`

## 实施边界

所有修改限定在 `codex-gui/**`。不修改 Rust、app-server、GUI Host、generated contracts、runtime validators、依赖、`package.json` 或 package scripts。

计划内生产文件：

- Create: `codex-gui/src/features/transcriptState/transcriptActivityMaterialization.ts`
  - 接受从 authoritative `ThreadItem` 机械提取的两类 activity variant。
  - 穷尽派生 title/details、生命周期可见性和 160/240/160 grapheme 截断。
- Modify: `codex-gui/src/features/transcriptState/transcriptStateModel.ts`
  - 增加前端领域 `activity` entry：`title`、`details`、`revision`。
- Modify: `codex-gui/src/features/transcriptState/transcriptEntryMaterialization.ts`
  - 把两类 activity item 分派给 activity materializer，继续对其他未展示 item 返回 `null`。
- Modify: `codex-gui/src/features/transcriptState/transcriptCommittedProjection.ts`
  - 增加 started ingress；统一 snapshot/started/completed 的首次分类与同 ID upsert。
  - activity 强制进入 middle，并保持 started 时确定的 chunk、index 和计数。
- Modify: `codex-gui/src/features/transcriptState/transcriptStateSlice.ts`
  - 在通用 live slot 之前让 committed projection 接管可见 collab started。
  - 保留 replay、commit ID、wrong-thread、重复事件与普通 live item 路由语义。
- Create: `codex-gui/src/features/committedTranscriptSurface/TranscriptActivityCard.tsx`
  - 使用 `Card variant="transparent"`、`Card.Header`、`Card.Title`、条件式 `Card.Description`。
  - 使用 `role="article"` 与确定性的 `aria-labelledby`，不增加交互或焦点目标。
- Modify: `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx`
  - 在 committed entry 的穷尽分派中渲染 activity Card。
  - 保留现有 chunk、turn、live assistant 和 disclosure 结构。
- Modify: `codex-gui/src/features/committedTranscriptSurface/committedTranscriptChunkEquality.ts`
  - 比较 activity 的所有 rendered fields，避免新 union variant 被错误视为相等。

计划内测试与 fixture 文件：

- Modify: `codex-gui/src/features/projection/__tests__/projectionTestBuilders.ts`
- Create: `codex-gui/src/features/transcriptState/__tests__/transcriptActivityMaterialization.test.ts`
- Modify: `codex-gui/src/features/transcriptState/__tests__/transcriptStateSnapshot.test.ts`
- Modify: `codex-gui/src/features/transcriptState/__tests__/transcriptStateCommittedProjection.test.ts`
- Modify: `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveItemLifecycle.test.ts`
- Modify: `codex-gui/src/features/transcriptState/__tests__/transcriptStateScrollSignals.test.ts`
- Modify: `codex-gui/src/features/committedTranscriptSurface/__tests__/committedTranscriptChunkEquality.test.ts`
- Modify: `codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx`

明确不修改：

- `codex-gui/src/features/transcriptState/transcriptLiveProjection.ts`：activity started 不进入普通 live slot，避免 completed 时迁移位置。
- `codex-gui/src/features/transcriptState/transcriptStateSelectors.ts`：现有 chunk identity + revision selector seam 足够。
- `codex-gui/src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts`：generic selector cache 行为不因 entry variant 改变。
- `codex-gui/src/features/transcriptState/__tests__/transcriptStateReplayDedup.test.ts`：相同 commit 和 snapshot duplicate 过滤与 item variant 无关；新增的不同 commit、同 activity item ID 重复 started 由 lifecycle 测试负责。
- App 路由、子任务导航、子代理列表、持续 liveness、完整 transcript 镜像和自动 `Completed` / `Errored`。

实施阶段运行命令前必须先确认本机 `fnm`、`pnpm` 和既有 Playwright browser binary 可用；不得安装或更新任何组件。所有命令从 `/Users/jiangsheng/cnb/codex/codex-gui` 运行，并使用 `/opt/homebrew/bin/fnm exec --using-file pnpm ...`。

## Task 1：建立 authoritative activity fixtures 与纯派生测试

**Files:**

- Modify: `codex-gui/src/features/projection/__tests__/projectionTestBuilders.ts`
- Create: `codex-gui/src/features/transcriptState/__tests__/transcriptActivityMaterialization.test.ts`

- [ ] 新增返回 `ThreadItem` 的 typed builders：`subAgentActivity(...)` 与 `collabAgentToolCall(...)`。可选参数只为 generated contract 已有字段提供测试默认值；继续复用现有 `itemStarted` / `itemCompleted` envelope builders，不在单个测试中手写协议镜像。
- [ ] 先写 activity materializer 测试，锁定 `started`、`interacted`、`interrupted` 三种 title，以及 collab tool/status 的可见与不可见组合。
- [ ] 锁定当前空 receiver/state wait 文案：started 为 `Waiting for agents`；completed 为 `Finished waiting`，detail 为 `No agents completed yet`。
- [ ] 覆盖 receiver、prompt、model/reasoning effort、agent state/message 的既有载荷派生；确认 item ID、sender ID、agent thread ID 不进入 title/details。
- [ ] 覆盖 trim/空白折叠和 prompt 160、completed message 240、error message 160 的边界值、超限值与组合 grapheme；最终 `...` 计入上限且不切断 emoji/组合字符。
- [ ] 实现 `transcriptActivityMaterialization.ts`，输入类型使用 `Extract<ThreadItem, ...>` 等机械推导，所有 tool/status/kind/state 分支穷尽；不保存 raw payload，不查询跨 item 或跨线程 metadata。

Focused verification:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit src/features/transcriptState/__tests__/transcriptActivityMaterialization.test.ts
```

## Task 2：扩展 transcript entry 与 snapshot 分类

**Files:**

- Modify: `codex-gui/src/features/transcriptState/transcriptStateModel.ts`
- Modify: `codex-gui/src/features/transcriptState/transcriptEntryMaterialization.ts`
- Modify: `codex-gui/src/features/transcriptState/transcriptCommittedProjection.ts`
- Modify: `codex-gui/src/features/transcriptState/__tests__/transcriptStateSnapshot.test.ts`

- [ ] 给 `TranscriptEntry` 增加 distinct frontend-domain `activity` variant，仅包含 `id`、`turnId`、`title`、`details`、`revision`。
- [ ] 在通用 materializer 中穷尽分派 `collabAgentToolCall` 与 `subAgentActivity`；其他现有 item 的 materialization 结果保持不变。
- [ ] 在 committed projection 的首次分类中显式让 activity 进入 middle，绝不占用 `leadingPromptEntryId` 或 `finalAssistantEntryIds`。
- [ ] 保持 activity-first 边界：activity 已进入 middle 时，后续第一条符合既有 leading prompt 语义的普通 entry 仍可成为 leading prompt；实现不得 flatten 全 turn，也不得改变非 activity turn 的既有分类。
- [ ] 用 snapshot exact-object 测试锁定两类 activity 的原始顺序、middle 计数和 entry 内容；覆盖 activity-first、后续 leading prompt、final answer，以及跨 100-entry chunk 边界。
- [ ] 确认 snapshot rebuild 继续复用 `entriesById`、`entryChunkById` 和既有 chunk ID/revision 规则，不新增平行 state 容器。

Focused verification:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit src/features/transcriptState/__tests__/transcriptActivityMaterialization.test.ts src/features/transcriptState/__tests__/transcriptStateSnapshot.test.ts
```

## Task 3：接入 started/completed 原位生命周期

**Files:**

- Modify: `codex-gui/src/features/transcriptState/transcriptCommittedProjection.ts`
- Modify: `codex-gui/src/features/transcriptState/transcriptStateSlice.ts`
- Modify: `codex-gui/src/features/transcriptState/__tests__/transcriptStateCommittedProjection.test.ts`
- Modify: `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveItemLifecycle.test.ts`
- Modify: `codex-gui/src/features/transcriptState/__tests__/transcriptStateScrollSignals.test.ts`

- [ ] 为 committed projection 增加 `itemStarted` 应用入口，返回该 item 是否已由 committed transcript 接管；只有当前应显示的 collab started 建立 middle 占位。
- [ ] 在 slice 中先执行 started pre-dedup，再调用 committed ingress；已接管 activity 不进入 `liveItemsByTurnId`，其余 started item 继续走既有 live projection。
- [ ] 对同 turn + item ID 的重复 activity started 保持完整 no-op：不记录第二个 entry、不增加 count/revision、不推进 scroll signal，也不创建 live slot。
- [ ] completed 使用相同 ID 更新 started 占位：entry revision 与所属 chunk revision 各推进一次；chunk ID、entry index、`entryChunkById`、`middleEntryCount` 和已有顺序不变。
- [ ] completed 缺少 started 时按事件到达位置新增 middle activity；completed materializer 返回 `null` 时不留下空占位。
- [ ] 用 Redux exact-object 测试同时断言 turn、entry、chunk 和 live arrays；在 wait 前后插入其他 middle entry，证明 completed 不会把 wait 移到 turn 尾部。
- [ ] scroll signal 测试锁定：可见 started 推进 `committedScrollCommitKey` 且不推进 `liveScrollPulse`；completed 原位更新再次推进 committed key；普通 agent message 的现有 live pulse 行为不变。

Focused verification:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit src/features/transcriptState/__tests__/transcriptStateCommittedProjection.test.ts src/features/transcriptState/__tests__/transcriptStateLiveItemLifecycle.test.ts src/features/transcriptState/__tests__/transcriptStateScrollSignals.test.ts
```

## Task 4：渲染 transparent activity Card 并保持 chunk memoization

**Files:**

- Create: `codex-gui/src/features/committedTranscriptSurface/TranscriptActivityCard.tsx`
- Modify: `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx`
- Modify: `codex-gui/src/features/committedTranscriptSurface/committedTranscriptChunkEquality.ts`
- Modify: `codex-gui/src/features/committedTranscriptSurface/__tests__/committedTranscriptChunkEquality.test.ts`
- Modify: `codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx`

- [ ] 实现 `TranscriptActivityCard`：`Card variant="transparent"`、`role="article"`、`Card.Header`、`Card.Title` 和仅在有内容时挂载的 `Card.Description`；title ID 由 turn/entry ID 确定性构造，并通过 `aria-labelledby` 提供 accessible name。
- [ ] 在 `CommittedTranscriptEntry` 对 `activity` 做穷尽分派；普通 user/assistant/status Card 的 variant、Markdown 和排版保持不变。
- [ ] 保留 `MiddleTranscriptModule`、`MiddleTranscriptChunk` 和 selector 边界，不创建 activity 专属 disclosure，不 flatten turn，不在折叠时挂载隐藏 activity。
- [ ] 扩展 chunk equality：activity title、details 或 revision 改变时返回 `false`；完全相同的新对象可返回 `true`。对应测试比较完整 activity objects。
- [ ] Browser Mode 覆盖 `Started` / `Interacted with` / `Interrupted`、wait started→completed、无 detail 时不生成空 description、thread/item/sender ID 不可见。
- [ ] 通过 role + accessible name 定位 activity article，并断言 `.card--transparent`；普通 user `secondary`、assistant `default` Card 保持不变，activity 不产生 button/link/tab stop。
- [ ] 锁定 activity 与 commentary/message 的 DOM 顺序；wait completed 后 started title 消失、最终 Card 只有一张、disclosure item count 不增加。
- [ ] 锁定无 final answer 时 activity 已挂载且 disclosure disabled；出现 final answer 后 activity 默认不在 DOM，计数包含 activity，展开后才按 chunk 顺序挂载。

Focused verification:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit src/features/committedTranscriptSurface/__tests__/committedTranscriptChunkEquality.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --config=vitest.browser.config.ts --browser=chromium --run src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx
```

## Task 5：执行完整的前端验证与范围检查

**Files:**

- Verify only; no new implementation files.

- [ ] 先运行所有计划内 unit tests，确认 materialization、snapshot、lifecycle、scroll 与 chunk equality 同时通过。
- [ ] 使用 `pnpm exec oxfmt <计划内文件> --write` 仅格式化实际修改的计划内前端文件；检查 diff 后对同一文件列表运行非 fix `pnpm exec oxfmt <计划内文件>` 复验。若自动格式化产生范围外改动，停止并回报，不手工掩盖。
- [ ] 运行完整 lint 与 type-check；闭环本次计划内变更引入的问题，不增加 ignore、skip、豁免或降级检查。
- [ ] 运行目标 Browser Mode 测试的 Chromium 聚焦验证，再运行三种既有 Playwright provider 的该测试文件。
- [ ] 检查最终 `git diff --check`、`git status --short` 和 scoped diff，确认未修改 `codex-rs/**`、generated contracts、validators、依赖、锁文件或计划外功能。
- [ ] 本计划不包含 stage、commit 或任何 Git 远程操作；完成验证后停止并汇报实际修改、验证结果与任何预存问题。

Verification commands:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit src/features/transcriptState/__tests__/transcriptActivityMaterialization.test.ts src/features/transcriptState/__tests__/transcriptStateSnapshot.test.ts src/features/transcriptState/__tests__/transcriptStateCommittedProjection.test.ts src/features/transcriptState/__tests__/transcriptStateLiveItemLifecycle.test.ts src/features/transcriptState/__tests__/transcriptStateScrollSignals.test.ts src/features/committedTranscriptSurface/__tests__/committedTranscriptChunkEquality.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt src/features/projection/__tests__/projectionTestBuilders.ts src/features/transcriptState/transcriptActivityMaterialization.ts src/features/transcriptState/transcriptStateModel.ts src/features/transcriptState/transcriptEntryMaterialization.ts src/features/transcriptState/transcriptCommittedProjection.ts src/features/transcriptState/transcriptStateSlice.ts src/features/transcriptState/__tests__/transcriptActivityMaterialization.test.ts src/features/transcriptState/__tests__/transcriptStateSnapshot.test.ts src/features/transcriptState/__tests__/transcriptStateCommittedProjection.test.ts src/features/transcriptState/__tests__/transcriptStateLiveItemLifecycle.test.ts src/features/transcriptState/__tests__/transcriptStateScrollSignals.test.ts src/features/committedTranscriptSurface/TranscriptActivityCard.tsx src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx src/features/committedTranscriptSurface/committedTranscriptChunkEquality.ts src/features/committedTranscriptSurface/__tests__/committedTranscriptChunkEquality.test.ts src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx --write
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt --check src/features/projection/__tests__/projectionTestBuilders.ts src/features/transcriptState/transcriptActivityMaterialization.ts src/features/transcriptState/transcriptStateModel.ts src/features/transcriptState/transcriptEntryMaterialization.ts src/features/transcriptState/transcriptCommittedProjection.ts src/features/transcriptState/transcriptStateSlice.ts src/features/transcriptState/__tests__/transcriptActivityMaterialization.test.ts src/features/transcriptState/__tests__/transcriptStateSnapshot.test.ts src/features/transcriptState/__tests__/transcriptStateCommittedProjection.test.ts src/features/transcriptState/__tests__/transcriptStateLiveItemLifecycle.test.ts src/features/transcriptState/__tests__/transcriptStateScrollSignals.test.ts src/features/committedTranscriptSurface/TranscriptActivityCard.tsx src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx src/features/committedTranscriptSurface/committedTranscriptChunkEquality.ts src/features/committedTranscriptSurface/__tests__/committedTranscriptChunkEquality.test.ts src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run lint
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --config=vitest.browser.config.ts --browser=chromium --run src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser --run src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx
git diff --check
git status --short
```

## 实施协作与停止条件

- 计划确认后，按 `$delegating-micro-stages` 把 fixture/test、状态实现、UI 实现、验证分别交给边界明确的子代理；编辑、验证和后续可能的 stage/commit 必须保持独立微阶段。
- 主代理负责检查每个阶段的 scoped diff、抽查关键不变量并协调计划内失败修正。
- 缺少 `fnm`、`pnpm` 或已有 browser binary 时停止，报告用户需自行安装的组件和建议命令；助手不得安装。
- 若实现需要修改计划外文件、协议/API、导航/liveness、用户可见文案语义或数据边界，停止并回到计划确认，不自行扩大范围。
- 本计划经用户明确确认前，不修改 `codex-gui`、不运行实现验证、不 stage、不 commit。
