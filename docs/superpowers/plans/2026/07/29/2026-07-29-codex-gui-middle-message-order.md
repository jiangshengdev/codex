# Codex GUI middle 消息稳定顺序实施计划

日期：2026-07-29

状态：待确认

对应设计：[Codex GUI 消息位置与 middle 稳定顺序设计](../../../../specs/2026/07/29/2026-07-29-codex-gui-message-placement-and-middle-order-design.md)

历史计划：[Codex GUI 消息位置与 middle 稳定顺序实施计划](./2026-07-29-codex-gui-message-placement-and-middle-order.md)保留为历史记录，不更新、不删除，也不作为本轮执行依据。

## 目标

本计划仅解决 middle 内 live / committed message 的稳定顺序。leading 已由提交 `f1cbe8503` 完成，本轮不再修改 leading 语义或实现。

采用已确认的方案 A：

- 删除独立的 `LiveAssistantMessages`；
- `MiddleTranscriptModule` 独占全部 live / committed middle message；
- `FinalAssistantMessages` 独占全部 live / committed final message；
- live final 继续位于 `Disclosure` 外；
- final 区域内部继续按 live-first、committed-after 的现有可见顺序展示，不重构为统一 final order。

## 核心实现约束

### 单一 middle order owner

深化并替换现有 bounded committed middle chunk，使其成为 message identity order 的唯一 owner。最终状态不得同时保留 committed middle chunks 与第二套 `messageOrder` chunks，也不得通过双写、双读、fallback、adapter 或兼容层维持两条 middle 顺序。

- order 只保存 message identity；正文继续由 `entriesById` 与现有 live state 持有。
- membership 是模块私有的 `(turnId, itemId)` compound key，不能假设 item ID 跨 turn 全局唯一。
- 每个 order chunk 最多保存 100 条 identity。
- order revision 只在 identity 首次追加时变化。
- delta、已知 identity 的 completion、duplicate、replay、reattach 与 phase migration 都不得改变 identity 顺序或推进 order revision。
- 不暴露 position、view、cache 等平行公共体系；selectors 只提供 renderer 实际需要的 bounded chunk 与 per-item 读取 seam。
- `middleEntryCount` 只统计当前可见 middle message，同一 identity 在 live / committed 转换时只计一次。

### 权威契约与生命周期

- 直接消费 generated `@codex-protocol/v2` 的 `ThreadItem` 与 `Turn`，不得手工镜像协议 DTO、字段集合、union、validator 或兼容类型。
- frontend state 只表达 transcript 顺序与展示语义；不复制 authoritative item，也不改变 generated contract 的类型失败传播。
- snapshot 必须按原始 `Turn.items` 顺序建立 message identity。
- accepted `itemStarted` 首次观察到 message 时建位；缺少 started 时，accepted `itemCompleted` 首次观察时建位。
- delta 不建位，只更新已存在的 live message。
- duplicate、replay、reattach replacement、迟到 started、已知 completion 和 middle / final phase migration都不移动既有 identity。
- completed item 继续是文本与最终 phase 的权威来源；settlement 只切换同一位置的内容来源。

### HeroUI 与样式

保留现有 HeroUI v3 `Disclosure`、`Button variant="outline"`、`Card`，以及现有 semantic token、`className` 和 CSS。不得新增或替换 HeroUI 组件、variant、token、样式文件或 CSS 规则。bounded transcript chunk 继续使用现有自定义结构，因为它承担渲染与引用稳定边界，而不是新的交互组件。

### 规模门禁

Task 1 与 Task 2 的代码和测试合计目标为 350–450 changed lines，硬上限为 500 changed lines。Task 2 提交前必须统计这两个 Task 的累计新增行与删除行；超过 500 时立即停止，保留当前证据并回到计划确认，不得用豁免、忽略、兼容层、减少覆盖或放宽断言隐藏超限。

## 工具与执行规则

所有 frontend 命令都从 `/Users/jiangsheng/cnb/codex/codex-gui` 运行。开始 Task 1 前先执行：

```bash
test -x /opt/homebrew/bin/fnm
/opt/homebrew/bin/fnm exec --using-file pnpm --version
```

任一必要工具、现有依赖或本地 Browser Mode 运行环境缺失时立即停止，说明需要用户自行安装的组件与建议命令；助手不得安装程序、依赖、运行时或浏览器二进制。

当前 `package.json` 的权威脚本是 `ci`、`format:oxfmt`、`lint`、`type-check`、`test:unit` 和 `test:browser`。完整验证必须使用这些现有脚本；focused unit / browser 测试使用 `/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest ...`，不新增或修改 package script。

Browser Mode 测试按本地 `../vitest/docs` 文档编写：React component 使用 `await render(...)`，DOM 查询使用 locator，并通过 `await expect.element(locator)...` 进行可重试断言。browser 命令使用 `vitest.browser.config.ts` 中全部已配置 browser，不传 `--browser`。

每个变更 Task 必须在自身 focused 验证通过后，只 stage 本 Task 文件，检查 `git diff --cached --name-only`、`git diff --cached --check` 与完整 staged diff，再创建该 Task 的独立本地提交。不得操作 Git 远程。

## Task 0：确认并提交设计与新计划文档

### 文件

- 修改：`docs/superpowers/specs/2026/07/29/2026-07-29-codex-gui-message-placement-and-middle-order-design.md`
- 新建：`docs/superpowers/plans/2026/07/29/2026-07-29-codex-gui-middle-message-order.md`

旧 broad plan `docs/superpowers/plans/2026/07/29/2026-07-29-codex-gui-message-placement-and-middle-order.md` 只保留为历史，不得修改或纳入提交。

### 执行

1. 用户明确确认本计划后，将本文状态从“待确认”改为“已确认”；计划确认前不得执行本 Task 或任何代码实现。
2. 只检查对应设计与本文的路径、状态、相互引用、目标、范围、任务、验证和提交边界。
3. 只 stage 上述设计与新计划两个文档，检查 staged 文件清单、whitespace 与完整 diff。
4. 创建独立本地提交：`docs(gui): plan unified middle message rendering`。

### 验证

从仓库根目录运行：

```bash
git diff --check -- docs/superpowers/specs/2026/07/29/2026-07-29-codex-gui-message-placement-and-middle-order-design.md docs/superpowers/plans/2026/07/29/2026-07-29-codex-gui-middle-message-order.md
git diff --cached --name-only
git diff --cached --check
git diff --cached
git status --short
```

## Task 1：建立唯一 bounded message identity order

### 生产文件

- 修改：`codex-gui/src/features/transcriptState/transcriptStateModel.ts`
- 新建：`codex-gui/src/features/transcriptState/transcriptMessageOrder.ts`
- 修改：`codex-gui/src/features/transcriptState/transcriptCommittedProjection.ts`
- 修改：`codex-gui/src/features/transcriptState/transcriptStateSelectors.ts`
- 修改：`codex-gui/src/features/transcriptState/transcriptStateSlice.ts`

### 测试文件

只修改以下既有测试，不新建综合 message-order 测试文件：

- `codex-gui/src/features/transcriptState/__tests__/transcriptStateCommittedProjection.test.ts`
- `codex-gui/src/features/transcriptState/__tests__/transcriptStateSnapshot.test.ts`
- `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveItemLifecycle.test.ts`
- `codex-gui/src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts`

### RED

先在上述既有测试中增加失败断言，覆盖：

- snapshot message identity 按原始 `Turn.items` 顺序进入 100 条有界 chunk；100 / 101 跨 chunk；
- accepted started 首次建位，completed-without-started 首次建位；
- `start A → start B → complete B(commentary) → complete A(commentary)` 始终保持 A、B；
- live commentary、null-phase assistant、committed commentary 与后续 user 共用一条顺序；
- duplicate、replay、迟到 started、已知 completion 与 phase migration 不重复、不移动；
- unknown delta 不建位，known delta 不推进 order revision；
- membership 按 `(turnId, itemId)` 隔离；
- 未变化 chunk 与 selector result 保持引用稳定，`middleEntryCount` 不重复计数。

运行 focused RED，并确认失败来自旧 committed/live 双顺序而非测试夹具或环境：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/transcriptState/__tests__/transcriptStateCommittedProjection.test.ts src/features/transcriptState/__tests__/transcriptStateSnapshot.test.ts src/features/transcriptState/__tests__/transcriptStateLiveItemLifecycle.test.ts src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts
```

不得通过 skip、豁免、放宽断言、删除既有覆盖或修改基线制造 GREEN。

### GREEN

1. 在 `transcriptStateModel.ts` 中把现有 bounded committed middle chunk 深化为唯一的 message identity order chunk；移除旧 committed-only middle order 字段，不能并存第二套 chunks。
2. 在新建的 `transcriptMessageOrder.ts` 中实现模块私有 compound membership、100 条 tail append、首次 identity 幂等登记、placement 与 middle count 的最小机械逻辑；不保存正文，不暴露 position/view/cache 公共类型。
3. 在 `transcriptCommittedProjection.ts` 中让 completed materialization 继续写 `entriesById`，但不再以 completion 时刻向 committed-only middle chunk 追加 entry。
4. 在 `transcriptStateSlice.ts` 中让 snapshot 按 `Turn.items` 原始顺序登记 identity；accepted started 或首次 completed 登记 identity；delta 不登记。保留现有 ingress、dedup、RAF、live payload 与 authoritative completed 内容边界。
5. 在 `transcriptStateSelectors.ts` 中只提供 bounded identity chunk 与 per-item renderer 所需 selector；不得 flatten 整个 turn，也不得建立第二套 view/cache 体系。
6. 更新受 state exact-object、chunk 和 count 语义影响的四个既有测试，保持 leading、final 与非 message 行为不变。

### GREEN 验证

先对实际 Task 1 文件执行文件级格式化，再运行 focused test、类型检查与文件级 lint；随后用现有 format check 确认没有格式漂移：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt --write src/features/transcriptState/transcriptStateModel.ts src/features/transcriptState/transcriptMessageOrder.ts src/features/transcriptState/transcriptCommittedProjection.ts src/features/transcriptState/transcriptStateSelectors.ts src/features/transcriptState/transcriptStateSlice.ts src/features/transcriptState/__tests__/transcriptStateCommittedProjection.test.ts src/features/transcriptState/__tests__/transcriptStateSnapshot.test.ts src/features/transcriptState/__tests__/transcriptStateLiveItemLifecycle.test.ts src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/transcriptState/__tests__/transcriptStateCommittedProjection.test.ts src/features/transcriptState/__tests__/transcriptStateSnapshot.test.ts src/features/transcriptState/__tests__/transcriptStateLiveItemLifecycle.test.ts src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxlint src/features/transcriptState/transcriptStateModel.ts src/features/transcriptState/transcriptMessageOrder.ts src/features/transcriptState/transcriptCommittedProjection.ts src/features/transcriptState/transcriptStateSelectors.ts src/features/transcriptState/transcriptStateSlice.ts src/features/transcriptState/__tests__/transcriptStateCommittedProjection.test.ts src/features/transcriptState/__tests__/transcriptStateSnapshot.test.ts src/features/transcriptState/__tests__/transcriptStateLiveItemLifecycle.test.ts src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm exec eslint --no-cache src/features/transcriptState/transcriptStateModel.ts src/features/transcriptState/transcriptMessageOrder.ts src/features/transcriptState/transcriptCommittedProjection.ts src/features/transcriptState/transcriptStateSelectors.ts src/features/transcriptState/transcriptStateSlice.ts src/features/transcriptState/__tests__/transcriptStateCommittedProjection.test.ts src/features/transcriptState/__tests__/transcriptStateSnapshot.test.ts src/features/transcriptState/__tests__/transcriptStateLiveItemLifecycle.test.ts src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
```

从仓库根目录运行：

```bash
git diff --check -- codex-gui/src/features/transcriptState
git diff --stat -- codex-gui/src/features/transcriptState
```

### Stage 与独立提交

只 stage Task 1 列出的生产和测试文件，然后运行：

```bash
git diff --cached --name-only
git diff --cached --check
git diff --cached
```

确认 staged diff 无范围外文件后创建独立本地提交：`feat(gui): establish stable middle message order`。

## Task 2：统一 middle / final renderer ownership

### 修改文件

- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx`
- `codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx`

### 删除文件

本 Task 直接确定删除以下旧 committed-chunk equality seam；删除时使用 `git rm`：

- `codex-gui/src/features/committedTranscriptSurface/committedTranscriptChunkEquality.ts`
- `codex-gui/src/features/committedTranscriptSurface/__tests__/committedTranscriptChunkEquality.test.ts`

### RED

在既有 browser test 中先增加回归，使用 `await render(...)`、locator 和 `await expect.element(...)` 覆盖：

- A、B 均 live 时按 A、B 显示，B 先 settlement、A 后 settlement 时仍为 A、B；
- live commentary、committed commentary、后续 user 与 null-phase assistant 交错时保持 Rust identity 顺序；
- live → committed 原位切换只出现一个 logical message，不重复渲染；
- `Intermediate updates` count 在 live / committed 转换中准确且不重复；
- live final 位于 `Disclosure` 外，final 内继续 live-first、committed-after；
- 101 条 identity 保持 bounded chunk 边界，单个 `Disclosure`、collapsed lazy mount 与展开行为不回归。

先运行 focused browser RED，确认旧独立 `LiveAssistantMessages` 路径导致新顺序断言失败：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --config=vitest.browser.config.ts --run src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx
```

### GREEN

1. 删除 `LiveAssistantMessages`；turn 根不再订阅完整 `liveItemsByTurnId[turnId]` 数组。
2. `MiddleTranscriptModule` 按 bounded identity chunk 渲染，每条 identity 由 per-item selector 解析当前 presentation：当前 committed middle entry 优先，否则使用当前 live middle item；leading、final、不可渲染或无可见内容返回 `null`。
3. 稳定 `(turnId, itemId)` identity 作为 React key；settlement 只切换内容来源，不创建第二个逻辑节点。
4. `FinalAssistantMessages` 独占 live / committed final；先渲染 live final，再渲染 committed final，以保持现有可见顺序。final 不接入统一 order。
5. 保留现有 `Disclosure`、`Button variant="outline"`、`Card`、折叠条件、lazy mount、token、`className` 与 CSS。
6. 用 `git rm` 删除旧 `committedTranscriptChunkEquality.ts` 及其测试；不得保留 adapter、fallback 或重复 equality 路径。

### GREEN 验证

先格式化实际 Task 2 文件，再运行受影响的 focused unit / browser、类型检查、完整现有 lint 与 format check：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt --write src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/transcriptState/__tests__/transcriptStateCommittedProjection.test.ts src/features/transcriptState/__tests__/transcriptStateSnapshot.test.ts src/features/transcriptState/__tests__/transcriptStateLiveItemLifecycle.test.ts src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --config=vitest.browser.config.ts --run src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
/opt/homebrew/bin/fnm exec --using-file pnpm run lint
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
```

从仓库根目录运行：

```bash
git diff --check -- codex-gui/src/features/committedTranscriptSurface codex-gui/src/features/transcriptState
git diff --stat HEAD~1 -- codex-gui/src/features/committedTranscriptSurface codex-gui/src/features/transcriptState
git diff --numstat HEAD~1 -- codex-gui/src/features/committedTranscriptSurface codex-gui/src/features/transcriptState
```

此时 `HEAD~1` 是 Task 0 文档提交，统计范围包含已提交的 Task 1 与尚未提交的 Task 2。以 `--numstat` 的新增行与删除行之和计算 changed lines：目标 350–450，超过 500 立即停止并回到计划确认，不提交 Task 2。

### Stage 与独立提交

规模门禁通过后，只 stage Task 2 的两个修改文件与两个删除文件，然后运行：

```bash
git diff --cached --name-only
git diff --cached --check
git diff --cached
```

确认 staged diff 无范围外文件后创建独立本地提交：`fix(gui): unify live and committed message rendering`。

## Task 3：无变更最终验证

本 Task 默认不修改文件、不创建提交。先从 `/Users/jiangsheng/cnb/codex/codex-gui` 运行当前完整 frontend CI，再对目标 browser test 文件使用全部配置的 browser 运行，不传 `--browser`：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run ci
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --config=vitest.browser.config.ts --run src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx
```

`ci` 已按当前 `package.json` 串联 validator check、`format:oxfmt`、`lint`、`type-check` 与 `test:unit`；不另造重复脚本。`test:browser` 是完整 browser runner，目标文件的 focused 复验使用上面的 `pnpm exec vitest` 等价入口以限定文件并保留全部配置 browser。

随后从仓库根目录运行：

```bash
git diff --check
git status --short --branch
```

若最终验证发现由本次变更引入、且修正完全位于 Task 1 或 Task 2 已确认文件边界内的问题，直接闭环该问题：只修改必要文件，使用文件级 `oxfmt --write`，重跑受影响 focused test、`type-check`、`lint`、`format:oxfmt` 和最终验证，只 stage 修正文件并检查 staged diff，创建独立本地提交：`fix(gui): close middle message order verification`。

没有本次引入的计划内问题时不创建 Task 3 提交。预存问题、范围外问题或需要改变产品行为、接口、数据、安全、风险及授权边界的问题只报告，不修改。

## 明确排除

- Rust、app-server、协议 schema、generated TypeScript、runtime validator；
- projection ingress、subscription、replay 与 dedup owner；
- live RAF batching、delta accumulation 与 transient payload owner；
- scroll、sticky-bottom 与 scroll pulse；
- activity、reasoning、command、search；
- turn fold / archive；
- final unified order 或 final 内部顺序重构；
- leading 行为与 `f1cbe8503` 已完成实现；
- CSS、HeroUI component / variant / token 变更；
- dependencies、lockfile、安装程序或浏览器；
- Git 远程操作。

## 完成条件

- 只有一套 bounded message identity order，旧 committed-only middle chunks 不再作为第二 owner 存在。
- snapshot、accepted started 与首次 completed 建位；delta、known completion、duplicate、replay、reattach 与 phase migration 不重排。
- `MiddleTranscriptModule` 是全部 live / committed middle 的唯一 renderer owner，不再存在独立 `LiveAssistantMessages`。
- `FinalAssistantMessages` 是全部 live / committed final 的唯一 renderer owner；live final 仍在 `Disclosure` 外，final 内仍为 live-first、committed-after。
- turn 根不订阅完整 live 数组，bounded chunk、per-item selector、101 边界与 collapsed lazy mount 保持性能语义。
- Task 1 与 Task 2 累计 changed lines 不超过 500，未通过兼容层、豁免或弱化测试隐藏问题。
- Task 0、Task 1、Task 2 各自只有一个对应本地提交；Task 3 无修正时无提交，有计划内修正时只有独立 fix 提交。
- Task 3 的最终验证与必要计划内闭环完成后，本轮立即终止，不追加复审、测试、实现、生成、验证或提交。

计划确认前不得实施代码修改、运行格式化或测试、stage 或 commit。
