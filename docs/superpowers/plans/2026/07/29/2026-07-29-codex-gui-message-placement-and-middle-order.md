# Codex GUI 消息位置与 middle 稳定顺序实施计划

日期：2026-07-29

状态：已确认

对应设计：[Codex GUI 消息位置与 middle 稳定顺序设计](../../../../specs/2026/07/29/2026-07-29-codex-gui-message-placement-and-middle-order-design.md)

## 目标

以 Rust projection 的原始 `Turn.items` 顺序为唯一事实来源：

- 只有原始首项是可渲染 `userMessage` 时才建立 leading；
- middle 中的 user / assistant、live / committed message 共用一条稳定 identity 顺序；
- live 转 committed 只替换同一 identity 的 presentation，不移动位置；
- 最终仍保持 leading → middle → final 三段结构。

设计文档保持不变。本计划不修改 Rust、app-server、协议、generated TypeScript、runtime validator、scroll、折叠归档、final 顺序或非 message item。

## 唯一实现路径

最终只保留以下 owner：

- `TranscriptTurn.messageOrderChunkIds`；
- `TranscriptState.messageOrderChunksById`；
- 以 `(turnId, itemId)` 为 key 的 membership index；
- `entriesById` 继续拥有 committed payload；
- live state 继续拥有 transient payload，但 live 数组位置不再表示展示顺序。

直接删除或替换旧路径：

- `middleChunkIds`、`chunksById`、`entryChunkById`；
- `TranscriptChunk`、`TranscriptChunkView` 及其 equality helper；
- 按 materialization 时刻 append committed middle 的逻辑；
- 以“第一个可见 entry”判断 leading 的逻辑；
- renderer 中 committed middle 与 turn-level live list 两条独立 middle 序列。

禁止为提交边界引入双写、双读、adapter、fallback、别名或同步逻辑。Task 1 完成后允许 GUI 尚未整体通过类型检查；Task 2 必须直接接通新 owner 并使合并后的最终状态完整。

## 变更规模与测试布局

- 总 changed lines 必须控制在 800 行以内，复杂 production 逻辑控制在 500 行以内。
- 不新增通用 lifecycle、placement engine、renderer registry 或第二份 message payload 存储。
- 顺序语义集中在三份现有 state 测试：
  - `transcriptStateSnapshot.test.ts`：snapshot、原始首项、placement、100 / 101 chunk；
  - `transcriptStateLiveItemLifecycle.test.ts`：started / completed、乱序完成、幂等与 phase migration；
  - `transcriptStateSelectorCache.test.ts`：chunk revision、引用稳定与 reattach replacement。
- `transcriptStateCommittedProjection.test.ts` 与 `transcriptStateLiveStreaming.test.ts` 只做 API/expected-state 的必要迁移，不重复上述顺序不变量。
- 浏览器行为只在现有 `CommittedTranscriptSurface.browser.test.tsx` 验证。

若实际规模超过上限，不得用兼容层规避；停止实现并重新拆分计划。

## 执行规则

- 所有 frontend 命令从 `/Users/jiangsheng/cnb/codex/codex-gui` 运行。
- 开始代码任务前确认 `/opt/homebrew/bin/fnm` 存在，并运行 `/opt/homebrew/bin/fnm exec --using-file pnpm --version`。
- 不安装、升级或重建依赖，不运行后端、原生程序或 CLI build，不操作 Git 远程。
- 每个 Task 对应一个本地提交。中间提交不要求独立完整或通过依赖后续任务的验证，但必须运行当前 Task 可独立执行的检查。
- 每次只暂存当前 Task 文件，检查 staged diff 后提交；不得合并任务提交。

## Task 0：确认并提交重写后的计划

### 文件

- 修改：`docs/superpowers/plans/2026/07/29/2026-07-29-codex-gui-message-placement-and-middle-order.md`

### 执行

1. 用户确认本计划后，将状态改为“已确认”。
2. 确认设计文档没有变化，计划 diff 只包含本次整份重写。
3. 只暂存计划文件并创建本地提交：`docs(gui): rewrite stable transcript message order plan`。

### 验证

```text
git diff --check -- docs/superpowers/plans/2026/07/29/2026-07-29-codex-gui-message-placement-and-middle-order.md
git diff --cached --name-only
git diff --cached --check
git diff --cached
```

## Task 1：替换 transcript state 的顺序 owner

### Production 文件

- 修改：`codex-gui/src/features/transcriptState/transcriptStateModel.ts`
- 新建：`codex-gui/src/features/transcriptState/transcriptMessageOrder.ts`
- 修改：`codex-gui/src/features/transcriptState/transcriptCommittedProjection.ts`
- 修改：`codex-gui/src/features/transcriptState/transcriptLiveProjection.ts`
- 修改：`codex-gui/src/features/transcriptState/transcriptStateSelectors.ts`
- 修改：`codex-gui/src/features/transcriptState/transcriptStateSlice.ts`

### 测试文件

- 修改：`codex-gui/src/features/transcriptState/__tests__/transcriptStateSnapshot.test.ts`
- 修改：`codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveItemLifecycle.test.ts`
- 修改：`codex-gui/src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts`
- 必要迁移：`codex-gui/src/features/transcriptState/__tests__/transcriptStateCommittedProjection.test.ts`
- 必要迁移：`codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveStreaming.test.ts`

### 执行

1. 删除旧 committed middle chunk owner；建立 message-only、100 条有界的 order chunk 与 membership index。
2. snapshot 在过滤或 materialize 前记录原始 `items[0]`，再按完整 `Turn.items` 顺序登记 message identity。
3. `itemStarted` 首次登记 identity；`itemCompleted` 缺少 identity 时登记一次；delta 只更新已有 live payload。
4. completed payload 成为内容与最终 phase 的权威值；identity 不因 settlement、duplicate、迟到 started 或 phase migration 重建。
5. selectors 只暴露 bounded order identity view；不 flatten、merge 或 sort 整个 turn。
6. 集中更新 state 测试，不新增独立 message-order 测试文件，不在 replay / reconnect / streaming 测试重复同一不变量。

本 Task 不保留旧 state owner 供 renderer 兼容。renderer 在 Task 2 前允许暂时无法通过整包 type-check。

### 可独立验证与提交

```text
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/transcriptState/__tests__/transcriptStateSnapshot.test.ts src/features/transcriptState/__tests__/transcriptStateLiveItemLifecycle.test.ts src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts src/features/transcriptState/__tests__/transcriptStateCommittedProjection.test.ts src/features/transcriptState/__tests__/transcriptStateLiveStreaming.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt <Task 1 实际修改的 TypeScript 文件> --write
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxlint <Task 1 实际修改的 TypeScript 文件>
git diff --check -- codex-gui/src/features/transcriptState
```

只暂存 Task 1 文件，检查 staged diff 后创建本地提交：`refactor(gui): replace transcript middle order owner`。

## Task 2：切换 renderer 并删除旧展示路径

### 文件

- 修改：`codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx`
- 删除：`codex-gui/src/features/committedTranscriptSurface/committedTranscriptChunkEquality.ts`
- 删除：`codex-gui/src/features/committedTranscriptSurface/__tests__/committedTranscriptChunkEquality.test.ts`
- 修改：`codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx`

### 执行

1. middle renderer 按 order chunk 遍历 stable identity child。
2. 每个 child 独立解析 presentation：属于 middle 的 committed entry 优先，否则读取同 identity 的可见 live payload。
3. leading、final、不可渲染或尚无可见内容的 identity 不在 middle 输出；`middleEntryCount` 对同一 identity 只计一次。
4. 删除 committed chunk equality helper 和旧 committed-middle renderer；turn-level live list 不再承担 middle 顺序。
5. 保留现有 `Disclosure`、lazy mount、HeroUI 组件、样式、final renderer 与 bounded subtree，不修改 CSS。
6. 浏览器测试集中验证 A / B 反序完成仍原位、live → committed 只有一个 logical message、原始首项不可渲染时后续 user 位于 middle。

### 最终验证与提交

```text
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/transcriptState/__tests__/transcriptStateSnapshot.test.ts src/features/transcriptState/__tests__/transcriptStateLiveItemLifecycle.test.ts src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts src/features/transcriptState/__tests__/transcriptStateCommittedProjection.test.ts src/features/transcriptState/__tests__/transcriptStateLiveStreaming.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --config=vitest.browser.config.ts --browser=chromium --run src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run ci
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt <Task 2 实际修改的 TypeScript 文件> --write
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
git diff --check
```

最终验证发现本计划引入的问题时，在 Task 2 内直接修正并重跑受影响验证，不创建额外兼容路径或新任务。

只暂存 Task 2 文件，检查 staged diff 后创建本地提交：`fix(gui): render middle messages in projection order`。

## 完成条件

- 原始 `Turn.items[0]` 是 leading 资格的唯一来源，后续 message 不补位。
- snapshot 与 realtime 共用唯一 message order owner。
- live / committed、user / assistant 在 middle 中只有一条顺序；delta 不创建 identity。
- completed-without-started、duplicate、迟到事件、phase migration 与 reattach 不重复或移动 identity。
- order chunk 保持 100 条上限；单条 delta 不使无关 chunk selector 失效。
- 旧 committed middle owner、equality helper 和独立 live-middle 展示路径已删除。
- 合并 Task 0–2 后通过全部最终验证，且只有三个对应本地提交。

Task 2 提交完成后，本轮计划立即终止；不得追加复审、测试、修正或提交。
