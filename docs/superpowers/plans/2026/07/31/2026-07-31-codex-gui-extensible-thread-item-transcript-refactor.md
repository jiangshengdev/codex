# Codex GUI 可扩展 ThreadItem transcript 重构实施计划

日期：2026-07-31

状态：待确认

实施基线：`dev` @ `6a0750ac7fe82abb3bc49ab9d5ff8b1e2d85a99c`

对应设计：[Codex GUI 可扩展 ThreadItem transcript 重构设计](../../../../specs/2026/07/31/2026-07-31-codex-gui-extensible-thread-item-transcript-refactor-design.md)

关联 research：[Codex GUI 可扩展 ThreadItem transcript 评估](../../../../research/2026/07/31/2026-07-31-codex-gui-extensible-thread-item-transcript-evaluation.md)

## 目标

深化现有 `transcriptState` module，保留单一 order/payload/index owner、`(turnId,itemId)`
identity、100-entry bounded chunks、message leading/final placement 与当前 UI；将 generated
ThreadItem/Delta 解释、lifecycle、placement、visibility、chunk、scroll 收敛到中央
implementation。首轮不启用新的 reasoning、command、collab 或 sub-agent UI。

## 当前证据

- `transcriptStateModel.ts`：已有复合 identity、leading/middle/final、bounded chunks 与唯一
  `entriesById`/`entryChunkById`；live 仍是 `initialItem + transientText`。
- `transcriptEntryMaterialization.ts`：只生成 user/agent message，其他 ThreadItem 显式返回 `null`。
- `transcriptCommittedProjection.ts`：已同时拥有 snapshot、started/completed、placement、chunk 与 count。
- `transcriptLiveProjection.ts`：另行拥有 delta bucket、visible contribution、chunk revision 与 scroll。
- `transcriptStateSlice.ts`：`extraReducers` 仍直接组合多个 implementation helper。
- `transcriptStateSelectors.ts`：已有按 chunk revision 缓存的 bounded read seam。
- `committedTranscriptChunkEquality.ts`：逐字段比较 message/status/live，未知 variant 返回 `true`。
- `CommittedTranscriptSurface.tsx`：已保留 chunk React boundary/Disclosure lazy mount，但 renderer
  仍读取 `initialItem.type` 和 `transientText`。

## 权威、非目标与否决条件

- 直接使用 generated `@codex-protocol/v2` 的 ThreadItem、Turn、attach/event/delta；禁止手写
  DTO、`unknown`、broad record 或 fallback。
- 私有 policy 使用 `Extract`/indexed access/exhaustive switch；暂不展示类别显式 ignore。
- 不修改 Rust、protocol、generated TypeScript、validator、projection ingress/coordinator/replay。
- 不安装依赖、不修改 package script、不操作 Git 远程。
- 不新增 sub-agent Card/preview/spinner/liveness/navigation，不伪造 command/sub-agent delta。
- 不新增第二套 order、payload、lifecycle、cache、slot、renderer sequence 或公共 registry。
- 不保留旧新双写/双读、compatibility adapter 或 fallback，不 flatten 整 turn。
- 若 policy 修改 chunk/placement/scroll，slice 按 item type 选 helper，或 snapshot/realtime 用不同
  materializer，立即停止。
- 若恢复 activity 专属管线、`lifecycleRecordsById`/`presentationSlotsById` 或新 coordinator，
  立即停止。
- 若提前添加没有 producer 的 sub-agent variant/空 renderer，或 equality 继续枚举领域字段，
  立即停止。

## HeroUI 与性能保持

- 保留 HeroUI v3 `Card`、`Disclosure`、`Button variant="outline"`、`Chip`、`Alert`、
  `Typography` 及现有 variant、ARIA、className、文案和 Markdown/Streamdown。
- `MiddleTranscriptChunk` 继续使用自定义 `div` 作为 bounded performance boundary。
- Disclosure 折叠时不选择/挂载隐藏 chunk；`middleEntryCount === 0` 时不挂载 middle。
- chunk 上限保持 100；单 item 更新不扫描整 turn；delta 每 identity/batch 最多 join 一次。
- hidden reserve 不增 count/DOM/scroll；未变 chunk 保持 stable view reference。

## 执行约束

- 计划确认前禁止实施或暂存/提交产品代码、运行前端格式化/测试；本次用户已授权的设计状态与计划 docs 提交除外。
- 设计确认状态与本计划按用户要求在计划确认前单独提交；该 docs 提交不计入实施 Task。
- 计划确认后预期只产生 Task 1→2→3→4 四个代码提交。
- 每 Task 聚焦验证、只暂存自己的文件、
  检查 staged diff，再创建一个独立本地提交。
- frontend 命令在 `codex-gui` 下使用 `/opt/homebrew/bin/fnm exec --using-file pnpm ...`。
- fnm/Node/pnpm 缺失时停止，由用户自行安装；助手不安装任何组件。
- 源码内容用 `apply_patch`；移动用 `git mv`；删除用 `git rm`。
- 纯 import/声明/代码位置或顺序调整不得混入以下提交。
- `git mv` 必需的 import 路径更新属于同一 rename Task，不视为纯位置调整。

## 实施 preflight 与失败闭环

计划确认后、Task 1 开始前先做只读核对：

```text
git branch --show-current
git rev-parse HEAD
git merge-base --is-ancestor 6a0750ac7fe82abb3bc49ab9d5ff8b1e2d85a99c HEAD
git diff --name-only 6a0750ac7fe82abb3bc49ab9d5ff8b1e2d85a99c..HEAD -- codex-gui codex-rs
git status --short --branch
test -x /opt/homebrew/bin/fnm
/opt/homebrew/bin/fnm exec --using-file pnpm --version
```

- 必须位于 `dev`，当前 HEAD 必须包含实施基线，且基线之后不得有未计划的
  `codex-gui`/`codex-rs` 代码差异。
- worktree 若有用户变更，先区分归属；无法避开与当前 Task 冲突时停止。
- 每 Task 引入的 format/type/lint/test 失败必须在提交前修正，然后按该 Task 命令顺序重跑。
- 预存或与本计划无关的失败只记录并报告，不修复、不放宽检查。
- 修正需越过当前 Task 精确文件边界时，停止并请求用户决策。

## Task 1：建立唯一 projection 写入 Interface

依赖：preflight 通过。

精确文件：

- 新建 `codex-gui/src/features/transcriptState/transcriptProjection.ts`
- 修改 `codex-gui/src/features/transcriptState/transcriptStateSlice.ts`

实施与不变量：

1. 在 `transcriptProjection.ts` 建立单一 `reduceTranscriptInput` Interface，直接消费
   `threadRuntimeAttached`、`threadRuntimeEventBuffered`、`threadRuntimeDeltasAccepted` 和
   `threadRuntimeManualReconnectRequired` 四类现有 action 的机械派生 union。
2. slice `extraReducers` 只调用该 Interface，不再选择 started/completed/delta/dedup helper。
3. 旧 committed/live/dedup helpers 仅作为该 Interface 的 implementation，不新建 adapter/平行路径。
4. attach replacement、duplicate/replay no-op、wrong-thread no-op、reconnect status、selector/DOM 不变。

验证：

```text
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt src/features/transcriptState/transcriptProjection.ts src/features/transcriptState/transcriptStateSlice.ts --write
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
/opt/homebrew/bin/fnm exec --using-file pnpm run lint
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/transcriptState/__tests__
```

只暂存上述两文件，运行：

```text
git diff --cached --name-only
git diff --cached --check
git diff --cached
```

提交 `refactor(gui): centralize transcript projection input`，然后核对：

```text
git diff-tree --no-commit-id --name-only -r HEAD
git status --short --branch
```

## Task 2：深化中央 implementation 与 ThreadItem policy

依赖：Task 1 提交完成。

精确文件：

- `git mv codex-gui/src/features/transcriptState/transcriptCommittedProjection.ts codex-gui/src/features/transcriptState/transcriptStateImplementation.ts`
- `git mv codex-gui/src/features/transcriptState/transcriptEntryMaterialization.ts codex-gui/src/features/transcriptState/transcriptItemPolicy.ts`
- 修改 `transcriptStateModel.ts`、`transcriptStateImplementation.ts`、`transcriptItemPolicy.ts`、
  `transcriptStateSelectors.ts`、`transcriptStateSlice.ts`

实施与不变量：

1. 立即更新所有 production import，不保留旧文件或新增临时 adapter。
2. implementation 拥有 snapshot、started/completed、identity、placement、chunk 与 count。
3. item policy 只从 generated ThreadItem 派生 presentation/ignore，不修改 state/chunk/scroll。
4. policy 逐项处理现有 `userMessage`、`hookPrompt`、`agentMessage`、`plan`、`reasoning`、
   `commandExecution`、`fileChange`、`mcpToolCall`、`dynamicToolCall`、`collabAgentToolCall`、
   `subAgentActivity`、`webSearch`、`imageView`、`sleep`、`imageGeneration`、
   `enteredReviewMode`、`exitedReviewMode`、`contextCompaction`。
5. 每个 variant 明确 materialize 或 explicit ignore，switch 编译期穷尽且没有 `default`。
6. snapshot 与 realtime completion 共用同一 policy；不提前创建 sub-agent/reasoning view。
7. 原始首项 user leading、后续 user middle、final/commentary/null placement、completed-without-started、
   空/非消息 ignore 全部不变。

验证：

```text
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt src/features/transcriptState/transcriptStateModel.ts src/features/transcriptState/transcriptStateImplementation.ts src/features/transcriptState/transcriptItemPolicy.ts src/features/transcriptState/transcriptStateSelectors.ts src/features/transcriptState/transcriptStateSlice.ts src/features/transcriptState/transcriptProjection.ts --write
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
/opt/homebrew/bin/fnm exec --using-file pnpm run lint
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/transcriptState/__tests__
```

`git mv` 会记录 staged rename；只添加本 Task 其余文件，然后运行：

```text
git diff --cached --name-only
git diff --cached --check
git diff --cached
```

确认没有 adapter 后提交 `refactor(gui): deepen transcript state implementation`，再运行
`git diff-tree --no-commit-id --name-only -r HEAD` 与 `git status --short --branch`。

## Task 3：收敛 typed transient lifecycle

依赖：Task 2 提交完成。

精确文件：

- `git rm codex-gui/src/features/transcriptState/transcriptLiveProjection.ts`
- 修改 `transcriptStateModel.ts`、`transcriptStateImplementation.ts`、`transcriptItemPolicy.ts`、
  `transcriptStateSelectors.ts`、`transcriptStateSlice.ts`

实施与不变量：

1. agent-message started/delta/completed 解释进入 item policy 的私有 typed seam，不导出 registry。
2. policy 只返回 ignore/reserve/present/remove 与 typed content；中央 implementation 应用结构变化。
3. implementation 独占 order、placement、visibility、chunk、revision、count 和 scroll；删除 live owner。
4. 首轮只激活 agent-message transient；subAgentActivity 等显式 ignore，不生产 preview。
5. `ThreadProjectionDelta` 私有 switch 显式处理四个现有 variant：`agentMessage` active；
   `reasoningSummaryText`、`reasoningSummaryPartAdded`、`reasoningText` explicit ignore；
   编译期穷尽且没有 `default`。
6. Task 结束时 stored transient 是 typed agent transient，不再是通用 `initialItem + transientText`。
7. hidden reserve 是同一 `entriesById` identity 内的 internal state，不新增 reserve/lifecycle map。
8. duplicate started、hidden reserve、首个非空 delta、missing identity no-op、per-item batch order、
   原位 settlement、空 completion cleanup、100/101 边界与 scroll 不变。

验证：

```text
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt src/features/transcriptState/transcriptStateModel.ts src/features/transcriptState/transcriptStateImplementation.ts src/features/transcriptState/transcriptItemPolicy.ts src/features/transcriptState/transcriptStateSelectors.ts src/features/transcriptState/transcriptStateSlice.ts src/features/transcriptState/transcriptProjection.ts --write
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
/opt/homebrew/bin/fnm exec --using-file pnpm run lint
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/transcriptState/__tests__
```

`git rm` 后只暂存本 Task 其余文件，运行完整 staged 检查：

```text
git diff --cached --name-only
git diff --cached --check
git diff --cached
```

确认没有 renderer 变更后提交 `refactor(gui): centralize typed transcript lifecycles`，
再运行 `git diff-tree --no-commit-id --name-only -r HEAD` 与 `git status --short --branch`。

## Task 4：用 stable view identity 驱动唯一 renderer

依赖：Task 3 提交完成。

精确文件：

- 修改 `codex-gui/src/features/transcriptState/transcriptStateModel.ts`、
  `codex-gui/src/features/transcriptState/transcriptStateSelectors.ts`、
  `codex-gui/src/features/transcriptState/transcriptStateSlice.ts`
- 修改 `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx`
- `git rm codex-gui/src/features/committedTranscriptSurface/committedTranscriptChunkEquality.ts`
- `git rm codex-gui/src/features/committedTranscriptSurface/__tests__/committedTranscriptChunkEquality.test.ts`
- 修改 `codex-gui/src/features/transcriptState/__tests__/transcriptStateSnapshot.test.ts`、
  `codex-gui/src/features/transcriptState/__tests__/transcriptStateCommittedProjection.test.ts`、
  `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveItemLifecycle.test.ts`、
  `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveStreaming.test.ts`、
  `codex-gui/src/features/transcriptState/__tests__/transcriptStateReconnect.test.ts`、
  `codex-gui/src/features/transcriptState/__tests__/transcriptStateReplayDedup.test.ts`、
  `codex-gui/src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts`

Browser 文件 `src/__tests__/App.browser.test.tsx` 与
`committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx` 只作为验证输入；
若现有产品语义断言无需更新，不修改它们。

实施与不变量：

1. selector 以 stable `TranscriptEntryView`/`TranscriptChunkView` 引用与 revision 驱动 invalidation。
2. selectors 只返回可见 `TranscriptEntryView`，hidden reserve 在 read seam 被过滤。
3. stored union 与 public view 角色分离，但仍由同一 `TranscriptState`/`entriesById` owner 管理，
   不建立第二张 payload map。
4. 删除逐字段 comparator 及其私有测试；内容变化必须返回新 view，未变 chunk 返回原 view。
5. presentation union 只包含真实 `message`/`status`；streaming 是 message rendering mode，不暴露
   公共 `live` variant，不添加 sub-agent variant。
6. leading/middle/final 共用唯一 exhaustive renderer，不根据空字符串或 lifecycle 决定 `null`，
   不读取 `initialItem`/`transientText`。
7. user plain text、assistant Markdown/streaming、HeroUI/ARIA/class/文案、Disclosure lazy mount、
   final 外置、React composite key 和 snapshot replacement invalidation 不变。
8. 保留全部产品语义测试；只删除已失去产品 Interface 价值的私有 comparator 测试。

验证：

```text
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt src/features/transcriptState/transcriptStateModel.ts src/features/transcriptState/transcriptStateSelectors.ts src/features/transcriptState/transcriptStateSlice.ts src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx src/features/transcriptState/__tests__/transcriptStateSnapshot.test.ts src/features/transcriptState/__tests__/transcriptStateCommittedProjection.test.ts src/features/transcriptState/__tests__/transcriptStateLiveItemLifecycle.test.ts src/features/transcriptState/__tests__/transcriptStateLiveStreaming.test.ts src/features/transcriptState/__tests__/transcriptStateReconnect.test.ts src/features/transcriptState/__tests__/transcriptStateReplayDedup.test.ts src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts --write
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
/opt/homebrew/bin/fnm exec --using-file pnpm run lint
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/transcriptState/__tests__
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --config=vitest.browser.config.ts --browser=chromium --run src/__tests__/App.browser.test.tsx src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run ci
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser
```

切换到 `codex-rs` 工作目录后运行：

```text
just fmt
```

`just fmt` 之后禁止重跑测试；返回 repo root，只做 diff/status 核对，确认无计划外 diff。

`git rm` 后只暂存本 Task 其余文件，运行：

```text
git diff --cached --name-only
git diff --cached --check
git diff --cached
```

确认无 CSS/新 Card/非目标 variant 后提交 `refactor(gui): render stable transcript entry views`。
提交后只读核对并结束：

```text
git diff-tree --no-commit-id --name-only -r HEAD
git status --short --branch
```

## 完成条件

四个 Task 各有一个独立本地代码提交；单一 implementation/typed
policy/stable selector/exhaustive renderer 均已成立；当前 UI 不变；没有安装依赖、Git 远程、
Rust/protocol/generated 变更或 sub-agent UI。完成后立即终止，不追加新一轮审查或修复。

计划确认前禁止实施或暂存/提交产品代码、运行前端格式化/测试；本次用户已授权的设计状态与计划 docs 提交除外。
