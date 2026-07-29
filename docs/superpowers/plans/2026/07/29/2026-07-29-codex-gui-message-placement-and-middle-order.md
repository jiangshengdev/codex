# Codex GUI 消息位置与 middle 稳定顺序实施计划

日期：2026-07-29

状态：已确认

对应设计：[Codex GUI 消息位置与 middle 稳定顺序设计](../../../../specs/2026/07/29/2026-07-29-codex-gui-message-placement-and-middle-order-design.md)

## 目标与边界

按已确认设计保留 leading / middle / final 三段结构，以 Rust 投影的原始 `Turn.items` 顺序为唯一事实来源：只有原始首项是可渲染 `userMessage` 时才建立 leading；middle 中全部 user / assistant message 在 live / committed 转换期间共用同一稳定顺序。

本计划不修改 Rust、app-server、协议 schema、generated TypeScript、runtime validator、projection ingress、subscription、replay、scroll、sticky-bottom、activity、reasoning、command、search、折叠归档或 final 顺序。不得安装、升级或重建依赖，不得运行后端、原生程序或 CLI 构建，不得操作 Git 远程。

## 权威契约与派生链

- 权威外部契约是 generated `@codex-protocol/v2` 中的 `Turn`、`ThreadItem`、`ThreadProjectionEventNotification` 与 `ThreadProjectionDeltaNotification`。
- `threadRuntimeSlice` 已接收并规范化 snapshot、accepted structural event 与 accepted delta；`transcriptStateSlice` 只消费这些权威输入，不自行镜像协议 DTO，不从 composer、request ID、`clientUserMessageId` 或 local storage 推断顺序。
- frontend-owned `TranscriptTurn`、message-order chunk、membership index 与 selector view 只表达 transcript placement、顺序和渲染性能语义；其输入继续直接使用 generated `ThreadItem` / `Turn`，并通过穷尽分支保持上游不兼容变更的类型失败传播。
- completed `ThreadItem` 继续拥有文本与最终 phase；message-order 只保存 `(turnId, itemId)` identity 和位置，不复制协议 item 或消息正文。

## HeroUI 与自定义布局边界

- 保持现有 `Disclosure`、`Button variant="outline"`、`Card`、`Chip`、`Alert`、`Typography` 及其现有语义和 token，不新增或替换 HeroUI 组件、variant、token 或样式。
- middle order chunk 继续使用自定义 `div`：它是 transcript 的有界渲染、React identity 与引用稳定边界，不是交互控件或通用布局组件；改成 HeroUI 容器不会增加语义，反而会模糊 hot-path chunk 边界。
- 不修改 CSS。Task 3 只改变现有组件读取的 ordered presentation 数据和 React 列表位置。

## 工具与执行约束

- 所有 frontend 命令从 `/Users/jiangsheng/cnb/codex/codex-gui` 运行，并使用 `/opt/homebrew/bin/fnm exec --using-file pnpm ...`。
- 开始 Task 1 前先确认 `/opt/homebrew/bin/fnm` 可执行，并运行 `/opt/homebrew/bin/fnm exec --using-file pnpm --version`；工具缺失时停止，告知用户自行安装，不得代为安装。
- 每个产生文件变更的 Task 在 focused 验证通过后，只暂存该 Task 的文件，检查 staged diff，并立即创建一个本地提交；完成提交后才能开始下一 Task。
- Task 4 默认只执行最终验证，无文件变更时不创建提交；仅在修正本次引入且位于已确认文件边界内的问题时，创建后文规定的独立 fix 提交。任何 Task 都不得 fetch、pull、push 或读取/写入远程引用。

## Task 0：提交已确认设计与计划文档

### 文件

- 修改：`docs/superpowers/specs/2026/07/29/2026-07-29-codex-gui-message-placement-and-middle-order-design.md`
- 新建：`docs/superpowers/plans/2026/07/29/2026-07-29-codex-gui-message-placement-and-middle-order.md`

### 执行

1. 用户确认计划后，将计划状态改为“已确认”；确认设计与计划状态均为“已确认”后再进入实现，计划未确认时不得执行本节提交或后续 Task。
2. 只检查上述两份文档的 diff、路径、相互引用、目标、非目标、任务与验证边界。
3. 只暂存上述两份文档，检查 staged diff，不得包含代码或其他文档。
4. 创建本地提交：`docs(gui): plan stable transcript message order`。

### 验证

```text
git diff --check -- docs/superpowers/specs/2026/07/29/2026-07-29-codex-gui-message-placement-and-middle-order-design.md docs/superpowers/plans/2026/07/29/2026-07-29-codex-gui-message-placement-and-middle-order.md
git diff --cached --name-only
git diff --cached --check
git diff --cached
git status --short
```

## Task 1：建立 snapshot 原始首项事实与 message-order 模型

### 文件

- 修改：`codex-gui/src/features/transcriptState/transcriptStateModel.ts`
- 新建：`codex-gui/src/features/transcriptState/transcriptMessageOrder.ts`
- 修改：`codex-gui/src/features/transcriptState/transcriptCommittedProjection.ts`
- 修改：`codex-gui/src/features/transcriptState/transcriptStateSelectors.ts`
- 修改：`codex-gui/src/features/transcriptState/transcriptStateSlice.ts`
- 新建：`codex-gui/src/features/transcriptState/__tests__/transcriptStateMessageOrder.test.ts`
- 修改：`codex-gui/src/features/transcriptState/__tests__/transcriptStateSnapshot.test.ts`
- 修改：`codex-gui/src/features/transcriptState/__tests__/transcriptStateCommittedProjection.test.ts`
- 修改：`codex-gui/src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts`

### RED

1. 在新测试文件中先锁定 snapshot 原始首项规则：首项为可渲染 user 时是唯一 leading；首项为不可渲染 item、不可渲染 user、commentary 或 final 时 leading 为 `null`，后续 user 只能进入 middle。
2. 锁定 snapshot message identity 完全按原始 `Turn.items` 顺序写入有界 order chunks；只记录 user / agent message，membership key 同时包含 turn ID。
3. 锁定 commentary、`phase === null`、后续 user、leading 与 final 的 placement；同一 identity 只在当前可见 middle 时计入 `middleEntryCount`。
4. 锁定 100 / 101 message identity 的 chunk 边界，以及未变化 order chunk selector 的引用稳定性。
5. 先运行 focused 测试并确认新增断言因缺少原始首项/order model 而失败，不得通过放宽断言或跳过测试制造 GREEN。

```text
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/transcriptState/__tests__/transcriptStateMessageOrder.test.ts src/features/transcriptState/__tests__/transcriptStateSnapshot.test.ts src/features/transcriptState/__tests__/transcriptStateCommittedProjection.test.ts src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts
```

### GREEN

1. 在 `TranscriptTurn` 中保存 Rust 原始首项 identity 和 order chunk IDs；在 `TranscriptState` 中保存 message-order chunks 与 `(turnId, itemId)` membership index。
2. `transcriptMessageOrder.ts` 只负责 message identity 判定、幂等 membership lookup、100 条有界 tail append、当前 placement 判定与 middle 可见计数；不保存正文、不拥有 live / committed payload、不引入通用 lifecycle 或 renderer registry。
3. snapshot rebuild 在 materialization 前读取 `Turn.items[0]`，再按完整原始顺序登记 message identity；过滤不可见内容后不得重新寻找 leading。
4. committed entry 仍写入 `entriesById`；leading、middle、final 由原始首项和 completed phase 机械派生。已知 identity 内容更新不得重排 order，也不得推进无关 order chunk revision。
5. selector 返回 bounded order chunk identity view，并保持未变化 chunk 的引用稳定；不得 flatten 整个 turn。
6. 更新受新 `TranscriptTurn` / state 形状影响的现有 exact-object 测试，不改变它们原有语义。

### 验证与本地提交

```text
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/transcriptState/__tests__/transcriptStateMessageOrder.test.ts src/features/transcriptState/__tests__/transcriptStateSnapshot.test.ts src/features/transcriptState/__tests__/transcriptStateCommittedProjection.test.ts src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt src/features/transcriptState/transcriptStateModel.ts src/features/transcriptState/transcriptMessageOrder.ts src/features/transcriptState/transcriptCommittedProjection.ts src/features/transcriptState/transcriptStateSelectors.ts src/features/transcriptState/transcriptStateSlice.ts src/features/transcriptState/__tests__/transcriptStateMessageOrder.test.ts src/features/transcriptState/__tests__/transcriptStateSnapshot.test.ts src/features/transcriptState/__tests__/transcriptStateCommittedProjection.test.ts src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts --write
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
git diff --check -- codex-gui/src/features/transcriptState
```

只暂存 Task 1 文件，然后运行：

```text
git diff --cached --name-only
git diff --cached --check
git diff --cached
```

确认 staged diff 只包含 Task 1 文件后，创建本地提交：`feat(gui): add stable transcript message order`。

## Task 2：让实时 started / delta / completed 生命周期收敛到同一 order identity

### 文件

- 修改：`codex-gui/src/features/transcriptState/transcriptStateSlice.ts`
- 修改：`codex-gui/src/features/transcriptState/transcriptLiveProjection.ts`
- 修改：`codex-gui/src/features/transcriptState/transcriptMessageOrder.ts`
- 修改：`codex-gui/src/features/transcriptState/__tests__/transcriptStateMessageOrder.test.ts`
- 修改：`codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveItemLifecycle.test.ts`
- 修改：`codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveStreaming.test.ts`
- 修改：`codex-gui/src/features/transcriptState/__tests__/transcriptStateReplayDedup.test.ts`
- 修改：`codex-gui/src/features/transcriptState/__tests__/transcriptStateReconnect.test.ts`
- 修改：`codex-gui/src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts`

### RED

1. 锁定 `start A → start B → complete B(commentary)` 与相反完成顺序始终保留 A、B identity 顺序。
2. 锁定 live commentary、null-phase assistant、committed commentary 与后续 user 共用一条 middle 顺序；live 到 committed 只切换 presentation，不删除并重新追加 identity。
3. 锁定 completed-without-started 在首次 completed observation 建立一次位置；duplicate started、duplicate completed、snapshot duplicate、迟到 started、reattach replacement 不重复或移动 identity。
4. 锁定 completed phase 在 middle / final 间迁移时 identity 不移动，`middleEntryCount` 只反映当前可见 middle message。
5. 锁定未知 delta 继续 no-op，不创建 turn、message 或 order identity；已知 delta 只更新目标 live payload，不推进 order revision，也不使无关 chunk selector 失效。
6. 先运行 focused 测试并确认新增 lifecycle 断言在旧双序列模型下失败。

```text
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/transcriptState/__tests__/transcriptStateMessageOrder.test.ts src/features/transcriptState/__tests__/transcriptStateLiveItemLifecycle.test.ts src/features/transcriptState/__tests__/transcriptStateLiveStreaming.test.ts src/features/transcriptState/__tests__/transcriptStateReplayDedup.test.ts src/features/transcriptState/__tests__/transcriptStateReconnect.test.ts src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts
```

### GREEN

1. 在 accepted `itemStarted` 处理内先幂等登记原始首项事实和 message order，再建立现有 agent live payload；non-message 只可建立原始首项事实，不进入 message order。
2. 在 accepted `itemCompleted` 处理中，缺少 identity 时先追加一次；再以完整 completed item materialize committed entry、清理同 identity live payload并更新 placement。
3. completed 后迟到 started 不得把已有 committed message 降级为 live；现有 event dedup 仍是第一道边界，order membership 自身仍保持幂等。
4. 保持现有 RAF delta batch、per-item bucket、`transientText`、revision、scroll pulse 与未知 live item no-op；delta 不参与首项、order 或 placement 建立。
5. snapshot attach 继续全量 replacement，新的 order state 只从当前 Rust snapshot 重建，不保留旧 GUI 顺序。

### 验证与本地提交

```text
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/transcriptState/__tests__/transcriptStateMessageOrder.test.ts src/features/transcriptState/__tests__/transcriptStateLiveItemLifecycle.test.ts src/features/transcriptState/__tests__/transcriptStateLiveStreaming.test.ts src/features/transcriptState/__tests__/transcriptStateReplayDedup.test.ts src/features/transcriptState/__tests__/transcriptStateReconnect.test.ts src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt src/features/transcriptState/transcriptStateSlice.ts src/features/transcriptState/transcriptLiveProjection.ts src/features/transcriptState/transcriptMessageOrder.ts src/features/transcriptState/__tests__/transcriptStateMessageOrder.test.ts src/features/transcriptState/__tests__/transcriptStateLiveItemLifecycle.test.ts src/features/transcriptState/__tests__/transcriptStateLiveStreaming.test.ts src/features/transcriptState/__tests__/transcriptStateReplayDedup.test.ts src/features/transcriptState/__tests__/transcriptStateReconnect.test.ts src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts --write
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
git diff --check -- codex-gui/src/features/transcriptState
```

只暂存 Task 2 文件，然后运行：

```text
git diff --cached --name-only
git diff --cached --check
git diff --cached
```

确认 staged diff 只包含 Task 2 文件后，创建本地提交：`fix(gui): preserve live message order through settlement`。

## Task 3：按 ordered middle presentation 渲染并增加浏览器回归

### 文件

- 修改：`codex-gui/src/features/transcriptState/transcriptStateModel.ts`
- 修改：`codex-gui/src/features/transcriptState/transcriptStateSelectors.ts`
- 修改：`codex-gui/src/features/transcriptState/transcriptStateSlice.ts`
- 修改：`codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx`
- 修改：`codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx`

### RED

1. 扩展现有 focused browser test，按 DOM article 文本顺序断言 A、B live 后完成 B(commentary)仍显示 A、B；再完成 A 后仍不移动。
2. 覆盖 live commentary 与 committed commentary / user 交错、`phase === null` 位于 middle、final 保持 Disclosure 外、原始不可渲染首项后 user 位于 Disclosure 内。
3. 覆盖 live → committed 原位切换时只出现一个 logical message，`Intermediate updates` 计数不重复；空 provisional identity 不计数。
4. 保留现有 101 项单 Disclosure、collapsed content 不挂载、later user、legacy null phase、multiple final 行为断言。
5. 先用 Chromium focused browser 命令确认新增顺序断言在旧独立 live list renderer 下失败。

```text
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --config=vitest.browser.config.ts --browser=chromium --run src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx
```

### GREEN

1. order chunk selector 逐 identity 解析当前 presentation：middle committed entry 优先，否则使用属于 middle 且已有可见内容的 live item；leading、final、不可渲染或暂时无内容返回 `null`。
2. `MiddleTranscriptChunk` 继续作为 bounded React subtree，只订阅本 chunk identities；每个稳定 `(turnId, itemId)` key 的 child 独立选择 committed/live 内容，单条 delta 不重渲染旧 chunk 中无关 message。
3. `MiddleTranscriptModule` 保留现有 `Disclosure`、折叠条件与 lazy mount，只将内容来源和计数改成 ordered middle view。
4. turn-level live list 只保留不属于 middle 的 live assistant presentation；leading 和 completed final renderer 保持现有语义与顺序。
5. 不改 HeroUI 组件、variant、token、className 或 CSS。

### 验证与本地提交

```text
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/transcriptState/__tests__/transcriptStateMessageOrder.test.ts src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --config=vitest.browser.config.ts --browser=chromium --run src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
/opt/homebrew/bin/fnm exec --using-file pnpm run lint
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt src/features/transcriptState/transcriptStateModel.ts src/features/transcriptState/transcriptStateSelectors.ts src/features/transcriptState/transcriptStateSlice.ts src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx --write
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
git diff --check -- codex-gui/src/features/transcriptState codex-gui/src/features/committedTranscriptSurface
```

只暂存 Task 3 文件，然后运行：

```text
git diff --cached --name-only
git diff --cached --check
git diff --cached
```

确认 staged diff 只包含 Task 3 文件后，创建本地提交：`fix(gui): render middle messages in projection order`。

## Task 4：无变更最终验证

本 Task 验证 Task 0–3 的已提交结果。若最终验证发现由本次变更引入、且修正仍位于本计划已确认文件边界内的问题，直接在 Task 4 内修正；只对本次实际修正的精确文件运行 `/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt <实际修正文件...> --write`，随后运行 `pnpm run format:oxfmt` check 和受影响的 focused 验证，只暂存修正文件并创建独立本地提交 `fix(gui): close message order verification`。没有文件变更时不创建提交。范围外问题与预存问题只报告，不修改。

### 验证

```text
/opt/homebrew/bin/fnm exec --using-file pnpm run ci
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --config=vitest.browser.config.ts --run src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx
git diff --check
git status --short --branch
```

若 Task 4 产生计划内修正，提交前必须运行：

```text
git diff --cached --name-only
git diff --cached --check
git diff --cached
```

### 完成条件

- leading 只由 Rust 原始 `Turn.items[0]` 的可渲染 user message 建立，后续 entry 永不补位。
- snapshot 与 realtime 都只建立一份有界 message order；live / committed settlement 不重排 identity。
- unknown delta、duplicate、replay、reattach、completed-without-started 与 phase migration 满足设计不变量。
- middle renderer 保持 chunk 引用稳定、Disclosure lazy mount 与 100 / 101 边界，实际 DOM 顺序稳定。
- generated contract、Rust、协议、final 顺序、scroll、activity 等非目标没有变化。
- Task 0–3 各自只有一个对应本地提交；Task 4 无变更时无提交，有计划内修正时只有独立提交 `fix(gui): close message order verification`。全程没有安装依赖、运行 Rust/后端/原生 build 或操作 Git 远程。
- Task 4 的验证、必要计划内修正、focused 复验和独立提交完成后，本轮任务立即终止；不得追加调查、测试、实现、生成、验证或提交。
