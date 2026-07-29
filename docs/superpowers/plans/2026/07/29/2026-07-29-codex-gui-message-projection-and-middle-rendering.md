# Codex GUI message projection 与 middle renderer 原子切换实施计划

日期：2026-07-29

状态：待确认

对应设计：[Codex GUI 消息位置与 middle 稳定顺序设计](../../../../specs/2026/07/29/2026-07-29-codex-gui-message-placement-and-middle-order-design.md)

历史计划：

- [Codex GUI 消息位置与 middle 稳定顺序实施计划](./2026-07-29-codex-gui-message-placement-and-middle-order.md)
- [Codex GUI middle 消息稳定顺序实施计划](./2026-07-29-codex-gui-middle-message-order.md)

两份历史计划均保留原状，不更新、不删除，也不作为本轮执行依据。

## 唯一目标

在保留 leading / middle / final 三段结构和现有 live / committed payload owner 的前提下，
以 `(turnId, itemId)` 为稳定 message identity，用唯一 bounded message order 和唯一 placement
contribution owner 保持全部 middle message 的 Rust 原始顺序，并在同一个原子垂直切片中让
`MiddleTranscriptModule` 接管全部 live / committed middle、让 `FinalAssistantMessages` 接管全部
live / committed final、删除独立 `LiveAssistantMessages`。

leading 已由 `f1cbe8503` 修复，本计划不重新实现或修改 leading 产品语义。

## 当前基线与本次纠正

- 当前文档 `HEAD` 为 `e2f03ae86`；该提交只更新设计文档。
- 当前 `codex-gui` 代码仍是 `51a648cb1` 回退后的基线，只保留 leading 修复。
- 当前 state 仍保存 committed-only middle chunks 与独立 live array；renderer 仍按
  committed middle → live assistant → committed final 输出。
- `5f8b39e4a` 已证明“先替换 state Interface、后切 renderer consumer”的任务拆分不可执行：
  旧 renderer 会继续读取已经删除的 `TranscriptChunkView.entries`，中间状态不能 type-check。
- 本计划因此只有一个代码 Task。state、selectors、renderer、旧路径删除和直接相关测试必须在
  同一个未提交工作区中完成并一起验证；禁止用临时 adapter、alias、双写、双读或 fallback
  制造中间兼容状态。

## 实现边界

### 权威 contract

- `Turn`、`ThreadItem`、`ThreadProjectionEvent` 与
  `ThreadProjectionDeltaNotification` 直接使用 generated `@codex-protocol/v2` 类型。
- frontend-owned union 只能表达 snapshot / accepted event / accepted delta batch 的工作流，
  不得复制协议字段、variant、validator 或兼容 DTO。
- 现有 ingress、thread / subscription、commit chain、replay 与 dedup 检查仍是第一道边界；
  message projection 只接收已经接受的输入，并保留第二层 identity 幂等。

### 单一 message projection owner

- 将现有 `transcriptCommittedProjection.ts` 用 `git mv` 重命名并深化为
  `transcriptMessageProjection.ts`，作为唯一 `TranscriptMessageProjection` Module。
- 该 Module 的公开写入口统一接收 snapshot、item started、item completed 与 delta batch；
  slice 不再按事件类型分别直接维护 order、count 和 final membership。
- Module 内部只有一个 collision-free、调用方不可解析的 `TranscriptMessageKey` encoder，
  同一 key 贯穿 order chunk、committed payload、live index、placement membership、selector
  lookup 与 React key。raw `itemId` 只保留为协议 payload 字段。
- 现有 committed-only middle chunk 直接替换为每块最多 100 个 key 的唯一 message chunk；
  chunk 包含 leading、middle、final 与暂不可见 message identity。placement 变化不移动 identity。
- membership index 只用于 O(1) 幂等与 tail append，不形成第二套 order。
- committed payload 改为按 `TranscriptMessageKey` 索引，不能继续使用全局 raw `itemId` key。
- live array、live item payload、compound lookup、RAF delta batching、transient text、revision 与
  live scroll pulse 继续由 `transcriptLiveProjection.ts` 保存和更新，但使用同一 message key。
- completed materialization 继续复用 `transcriptEntryMaterialization.ts`；该文件不修改。

### 单一 placement contribution

- 一个私有 resolver 从 committed-first 的当前 payload 计算 `leading`、`middle`、`final` 或
  `hidden` contribution。
- 只有一个 contribution diff 可以修改 `leadingPromptEntryKey`、`middleEntryCount`、
  `liveFinalMessageKeys` 与 `committedFinalMessageKeys`。
- 空 provisional assistant 不计数；首次非空 delta 通过同一 diff 进入 middle 或 live final。
- item completion 在同一个 reducer transition 内写 committed payload、清理同 key live payload，
  并同步处理 commentary ↔ final migration；对外不暴露中间态。
- duplicate、replay、已知 completion、迟到 started 与 snapshot duplicate 不重复建位、不降级
  committed truth，也不替换未变化的 store-owned result。

### Renderer owner

- `MiddleTranscriptModule` external Interface 只有 `turnId`；内部读取 turn summary、bounded
  message chunks 与 per-key store-owned presentation。
- `CommittedTranscriptTurn` 不再订阅或扫描完整 live array，也不向 middle 传递 committed-only
  `chunkIds`、count 或 final flag。
- slice 删除 raw-ID `selectTranscriptEntry`、`selectTranscriptLiveItem`、turn-level
  `selectTranscriptLiveItemsForTurn` 与旧 `selectTranscriptChunk` export；renderer 只新增
  `selectTranscriptMessageChunk` 与 `selectTranscriptMessagePresentation` 两个 message 读取入口，
  不保留 alias 或 test-only export。
- middle row 在同一个 stable key 位置选择当前 committed 或 live presentation；leading、final、
  hidden identity 返回 `null`，不在 renderer 临时 merge、sort 或 flatten 整个 turn。
- 删除 turn-level `LiveAssistantMessages` 与其 list wrapper；live row 的展示组件可以继续复用。
- `FinalAssistantMessages` 使用同一 per-key presentation seam，先渲染 live final，再渲染
  committed final，继续位于 Disclosure 外。
- surface empty state 只读 turn summary 的可见 contribution，不扫描 live array，也不能仅凭
  不可见 identity chunk 判断已有内容。

### HeroUI 与样式

继续使用现有 HeroUI v3 `Disclosure`、`Button variant="outline"`、`Card` 与 `Chip`，保留现有
semantic token、`className`、CSS、折叠条件和 lazy mount。bounded transcript chunk 是性能边界，
不是应替换成 HeroUI collection 的交互组件。本计划不修改组件 variant、token、样式文件或 CSS。

## Task 0：确认并提交设计状态与本计划

### 文件

- 修改：`docs/superpowers/specs/2026/07/29/2026-07-29-codex-gui-message-placement-and-middle-order-design.md`
- 新建：`docs/superpowers/plans/2026/07/29/2026-07-29-codex-gui-message-projection-and-middle-rendering.md`

### 执行

1. 用户明确确认本计划后，将本文状态从“待确认”改为“已确认”。
2. 不修改两份历史计划，不把它们重新标为可执行。
3. 只 stage 上述两个文档，检查 staged 文件清单、whitespace 与完整 diff。
4. 创建独立本地提交：`docs(gui): plan atomic middle message ownership`。

### 验证

从仓库根目录运行：

```bash
git diff --check -- docs/superpowers/specs/2026/07/29/2026-07-29-codex-gui-message-placement-and-middle-order-design.md docs/superpowers/plans/2026/07/29/2026-07-29-codex-gui-message-projection-and-middle-rendering.md
git diff --cached --name-only
git diff --cached --check
git diff --cached
git status --short
```

## Task 1：原子切换 message projection 与 renderer ownership

这是唯一代码 Task，只创建一个代码提交。中间编辑不要求可 type-check，但 Task 完成后的 staged
tree 必须同时完成 state Interface、全部 consumer 与测试切换，并且只保留一条实现路径。

### 生产文件

- 修改：`codex-gui/src/features/transcriptState/transcriptStateModel.ts`
- 使用 `git mv`：
  `codex-gui/src/features/transcriptState/transcriptCommittedProjection.ts`
  → `codex-gui/src/features/transcriptState/transcriptMessageProjection.ts`
- 修改：`codex-gui/src/features/transcriptState/transcriptLiveProjection.ts`
- 修改：`codex-gui/src/features/transcriptState/transcriptStateSelectors.ts`
- 修改：`codex-gui/src/features/transcriptState/transcriptStateSlice.ts`
- 修改：`codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx`
- 使用 `git rm` 删除：
  `codex-gui/src/features/committedTranscriptSurface/committedTranscriptChunkEquality.ts`

不得修改 `transcriptEntryMaterialization.ts`、projection ingress、thread runtime、scroll hook、
generated TypeScript、CSS 或 package metadata。

### 测试文件

- 使用 `git mv`：
  `codex-gui/src/features/transcriptState/__tests__/transcriptStateCommittedProjection.test.ts`
  → `codex-gui/src/features/transcriptState/__tests__/transcriptMessageProjection.test.ts`
- 修改：`codex-gui/src/features/transcriptState/__tests__/transcriptStateSnapshot.test.ts`
- 修改：`codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveStreaming.test.ts`
- 修改：`codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveItemLifecycle.test.ts`
- 修改：`codex-gui/src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts`
- 修改：`codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveItemIndex.test.ts`
- 修改：`codex-gui/src/features/transcriptState/__tests__/transcriptStateReconnect.test.ts`
- 修改：`codex-gui/src/features/transcriptState/__tests__/transcriptStateReplayDedup.test.ts`
- 修改：`codex-gui/src/features/transcriptState/__tests__/transcriptStateScrollSignals.test.ts`
- 修改：`codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx`
- 修改：`codex-gui/src/__tests__/App.browser.test.tsx`
- 使用 `git rm` 删除：
  `codex-gui/src/features/committedTranscriptSurface/__tests__/committedTranscriptChunkEquality.test.ts`

测试继续复用 `projectionFixtures.ts` 与 `projectionTestBuilders.ts` 的 generated-contract builders；
现有 builder 已能表达所需 message、phase、started、completed 与 delta 场景，不修改 builder 文件。

### 执行前门禁

1. 从仓库根目录运行 `git status --short`，确认 Task 0 提交后工作区干净。
2. 单独运行 `git rev-parse HEAD`，把输出记为本 Task 固定 baseline SHA；后续规模检查不得使用
   `HEAD~1` 推断基线。
3. 从 `codex-gui` 运行：

   ```bash
   test -x /opt/homebrew/bin/fnm
   /opt/homebrew/bin/fnm exec --using-file pnpm --version
   ```

4. 若 `fnm`、现有 pnpm、现有依赖或 Browser Mode 运行环境缺失，立即停止并报告；不得安装、
   更新或重建程序、依赖、runtime 或 browser binary。
5. Task 目标规模为 450–650 changed lines，包含新增与删除。生产代码目标为 250–350，直接相关
   测试目标为 200–300。总量超过 650 时先核对是否存在重复测试、exact-object churn 或范围漂移；
   不得删除有价值覆盖、放宽断言或保留兼容层来压缩数字。总量超过 800 时停止实现并回到计划确认。
   production 文件 changed lines 硬上限为 500，并使用下文独立 production `--numstat` 命令统计。

### 回归用例准备

在 production Interface 切换前，只新增能够通过当前 dispatch / renderer surface 表达的最小失败
Browser 回归，不引用尚不存在的新 selector，也不以类型失败作为 RED：

- A、B 均 live 时显示 A、B，B 先完成、A 后完成时仍显示 A、B；
- 两个 turn 使用相同 raw item ID 时，各自显示自己的 payload。

先运行 focused Browser Mode，确认失败来自当前双 owner 或 raw-ID payload map，而不是 fixture、类型
或环境。不单独提交 RED，也不在此时添加 compound-key selector、双 final membership 或引用稳定测试。

state、selector 与 renderer Interface 完成同一垂直切换后，再通过新生产 Interface 补齐以下直接回归：

- snapshot message identity 严格按原始 `Turn.items` 顺序进入 100 条 bounded chunks；
- accepted started 与 completed-without-started 只在首次观察时建位，unknown delta 不建位；
- 空 started 经首次非空 delta 后可见 count 从 0 变 1；
- `start A → start B → complete B(commentary) → complete A(commentary)` 始终保持 A、B；
- live / committed commentary、null-phase assistant 与后续 user 共用同一 middle order；
- live → committed 保持同 key、同位置、单一可见 contribution；
- commentary ↔ final migration 原子更新 count 与两类 final membership；
- 两个 turn 使用相同 raw item ID 时，payload、selector 与 React key 相互隔离；
- duplicate、replay、reattach 与迟到 started 不重复、不移动、不降级；
- 未变化 chunk、其他 turn 与 sibling presentation 保持引用相等，101st identity 不改变首 chunk；
- Browser Mode 验证 `MiddleTranscriptModule` 独占 middle、`FinalAssistantMessages` 独占 final、
  Disclosure count、collapsed lazy mount、101 条边界与 live-final 既有位置。

完成这些 Interface-level 回归后运行 focused unit 与 Browser Mode；不得通过 skip、ignore、baseline、
豁免、弱化断言或删除覆盖制造 GREEN。

### 实现顺序

1. 用 `git mv` 完成 production / test owner 重命名，再修改内容；不复制后删除。
2. 在 model 中用同一 `TranscriptMessageKey` 替换 raw-ID committed map、committed-only chunk 与
   final membership；保留 live payload 数据结构和非 message state。
3. 在 `TranscriptMessageProjection` 中建立唯一 snapshot / started / completed / delta 写入口、
   bounded identity order、membership、committed-first resolver 与 contribution diff。
4. 让 `transcriptLiveProjection.ts` 复用统一 key，并只提供 projection transition 所需的 payload
   mutation；保持 RAF batching、transient text、revision、index compaction 与 scroll pulse 语义。
5. 在 slice 中保留现有 ingress / dedup gate，但把已接受输入交给唯一 projection 写入口；切换为
   store-owned chunk 与 per-key presentation selector，删除旧 `TranscriptChunkView` cache 和
   `selectTranscriptChunk`、`selectTranscriptEntry`、`selectTranscriptLiveItem`、
   `selectTranscriptLiveItemsForTurn` export。
6. 在同一未提交工作区切换 `CommittedTranscriptSurface.tsx`：middle external Interface 只收
   `turnId`，删除独立 live list，让 final 接管 live / committed final，empty-state 改读 summary。
7. 用 `git rm` 删除旧 equality seam 及测试；不保留 adapter、alias、fallback 或旧新双路径。
8. 将所有受移除 selector、compound key、turn summary 与测试 owner 名称影响的既有测试迁移到
   新生产 Interface；不把内部 membership、encoder、exact state object 或 cache 形状变成主要断言。

### 规模检查时点

所有检查都以执行前记录的固定 baseline SHA 为起点，并对完整 Task 1 文件范围累计统计：

1. 最小失败回归写完、production 尚未修改时检查一次。
2. state、renderer、测试与旧路径删除全部完成、格式化前检查一次。
3. 文件级格式化完成、stage 前执行最终门禁。
4. stage 后对 cached diff 再检查一次。

每次运行：

```bash
git diff --stat <task-1-baseline-sha> -- codex-gui/src/features/transcriptState codex-gui/src/features/committedTranscriptSurface codex-gui/src/__tests__/App.browser.test.tsx
git diff --numstat <task-1-baseline-sha> -- codex-gui/src/features/transcriptState codex-gui/src/features/committedTranscriptSurface codex-gui/src/__tests__/App.browser.test.tsx
git diff --numstat <task-1-baseline-sha> -- codex-gui/src/features/transcriptState/transcriptStateModel.ts codex-gui/src/features/transcriptState/transcriptCommittedProjection.ts codex-gui/src/features/transcriptState/transcriptMessageProjection.ts codex-gui/src/features/transcriptState/transcriptLiveProjection.ts codex-gui/src/features/transcriptState/transcriptStateSelectors.ts codex-gui/src/features/transcriptState/transcriptStateSlice.ts codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx codex-gui/src/features/committedTranscriptSurface/committedTranscriptChunkEquality.ts
```

前两条统计完整 Task 1；第三条只统计 production 文件，用于执行 500 changed-lines 硬门禁。

### 格式化与验证

所有 frontend 命令从 `/Users/jiangsheng/cnb/codex/codex-gui` 运行，并使用 fnm-backed pnpm。
只对实际存在的修改文件执行文件级 `oxfmt --write`；删除文件不传给 formatter。随后运行：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/transcriptState/__tests__/transcriptMessageProjection.test.ts src/features/transcriptState/__tests__/transcriptStateSnapshot.test.ts src/features/transcriptState/__tests__/transcriptStateLiveStreaming.test.ts src/features/transcriptState/__tests__/transcriptStateLiveItemLifecycle.test.ts src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts src/features/transcriptState/__tests__/transcriptStateLiveItemIndex.test.ts src/features/transcriptState/__tests__/transcriptStateReconnect.test.ts src/features/transcriptState/__tests__/transcriptStateReplayDedup.test.ts src/features/transcriptState/__tests__/transcriptStateScrollSignals.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --config=vitest.browser.config.ts --run src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx src/__tests__/App.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run ci
```

`ci` 按当前 `package.json` 串联 validator check、`format:oxfmt`、`lint`、`type-check` 与
`test:unit`。Browser 测试使用 `vitest.browser.config.ts` 的全部 configured browser，不传
`--browser`。React Browser Mode 测试继续使用 `await render(...)`、locator chaining 与
`await expect.element(locator)...`。

验证失败且证据表明由本 Task 引入时，在上述文件边界内直接修正根因并重跑受影响 focused test，
最后重新运行两条 Browser / CI 命令。预存或范围外问题只报告，不修改。禁止新增或扩大 lint
豁免、skip、fallback、静默兜底、放宽断言、删除覆盖或修改 baseline 来通过验证。

从仓库根目录再运行：

```bash
git diff --check -- codex-gui/src/features/transcriptState codex-gui/src/features/committedTranscriptSurface codex-gui/src/__tests__/App.browser.test.tsx
git status --short
```

再搜索旧 renderer selector 名称；以下命令预期没有匹配：

```bash
rg -n -e 'selectTranscriptChunk' -e 'selectTranscriptEntry' -e 'selectTranscriptLiveItem' -e 'selectTranscriptLiveItemsForTurn' codex-gui/src
```

### Stage 与独立提交

最终规模门禁和全部验证通过后，只 stage Task 1 列出的文件。检查：

```bash
git diff --cached --name-status
git diff --cached --check
git diff --cached
git diff --cached --stat
git diff --cached --numstat
```

确认 staged tree 同时完成 state / renderer Interface 切换、两个 rename、两个删除且没有范围外文件后，
创建唯一代码提交：`fix(gui): unify middle message ownership`。

## 提交后最终检查

Task 1 提交后只执行以下只读检查，不再开启新的复审、测试或修正轮次：

```bash
git status --short --branch
git show --stat --oneline --summary HEAD
```

若 Task 1 提交前的计划内验证已经全部通过且工作区干净，本轮立即终止。不得在完成后追加
“final review”、额外测试、无计划重构或新的修复提交。

## 明确排除

- Rust、app-server、协议 schema、generated TypeScript、runtime validator；
- projection ingress、subscription、commit chain、replay / dedup owner；
- live RAF scheduling、delta accumulation、transient payload 或 scroll pulse policy；
- activity、reasoning、command、search 与其他非 message presentation；
- turn fold / archive、sticky-bottom、scroll policy；
- leading 语义或 `f1cbe8503` 已完成实现；
- final 统一顺序或 final 内部顺序重构；
- CSS、HeroUI component / variant / token、Markdown renderer；
- dependencies、lockfile、package script、browser 或其他程序安装；
- Git 远程操作；
- 复用两次失败实现或其 WIP patch。

## 完成条件

- 只有一套 bounded message identity order；不存在 committed-only middle order 或平行
  message-order view/cache。
- `(turnId, itemId)` 的同一 collision-free key 贯穿 order、payload、live index、placement、
  selector 与 React key；两个 turn 的相同 raw item ID 不覆盖。
- snapshot、accepted started 与首次 completed 建位；delta、known completion、duplicate、replay、
  reattach 与 phase migration 不重排。
- 空 started 首次可见、live → committed 与 commentary ↔ final migration 都由同一 contribution
  diff 原子维护 count 与 membership。
- `MiddleTranscriptModule` 是全部 live / committed middle 的唯一 renderer owner，不再存在独立
  `LiveAssistantMessages`。
- `FinalAssistantMessages` 是全部 live / committed final 的唯一 renderer owner；live final 仍在
  Disclosure 外，final 内仍为 live-first、committed-after。
- renderer 不 flatten 完整 turn；100 / 101 chunk、unrelated chunk / sibling 引用、collapsed lazy
  mount 与 empty-state 语义通过直接回归。
- Task 0 与 Task 1 各有一个独立本地提交；Task 1 提交前完成 focused unit、focused Browser Mode、
  frontend `ci`、diff check、规模门禁与 staged diff 检查。
- 最终工作区干净，未操作 Git 远程。

本计划确认前不得运行代码实现、格式化、测试、stage 或 commit。
