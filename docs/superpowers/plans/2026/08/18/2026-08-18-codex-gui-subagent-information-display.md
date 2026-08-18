# Codex GUI 子代理信息显示实施计划

计划日期：2026-08-18

计划状态：已确认

确认日期：2026-08-18

确认原文：确认。提交文档

对应设计：
`docs/superpowers/specs/2026/08/18/2026-08-18-codex-gui-subagent-information-display-design.md`

计划分支：`dev`

计划基线：`7ed780e6171660274ab3c03c00286ebe943dce1d`

## 唯一目标

按已确认设计增强 `codex-gui` transcript 中的 `subAgentActivity`：使用权威
`agentThreadId` 保持稳定身份，从 `agentPath` 派生格式化任务名，对相邻同动作活动做前三项有界聚合
与最短父路径消歧，并用非交互 HeroUI `Chip` 保留 TUI 的 `Started / Interacted with / Interrupted`
文案语义。

当前任务与历史只读详情必须复用同一展示；本计划不新增代理面板、运行状态、nickname/role、导航或
协议字段。

## 当前代码为何必须修改

- 权威 `ThreadItem.subAgentActivity` 已包含 `agentThreadId` 与 `agentPath`，但 GUI item policy 当前只
  保存 `activityKind + agentPath`，明确丢弃稳定身份。
- selector 把活动映射为只带 raw `agentPath` 的三种 title copy，renderer 因而只能原样显示完整路径。
- 当前 `ActivityEntryGroup` 只把相邻 activity 放进同一 Card，内部仍逐条渲染；它没有同 kind 子代理
  聚合、前三项上限或重名消歧。
- 当前组件使用 `TagGroup/Tag`。HeroUI 本地文档将其定义为可聚焦集合，现有 Browser 测试也断言
  `tabindex="0"`；这与已确认的纯信息、无额外焦点语义冲突。HeroUI `Chip` 是现成的非交互
  informational badge，能够机械满足设计，不需要自定义控件。
- 当前中英文 catalog 只有单代理 rich message，没有“及其他 N 个子代理”的有界聚合文案。

因此根因位于 GUI 的 transcript domain/presentation seam，不在 Rust、app-server 或 transport。
实现必须保留权威字段和现有 chunk 拓扑，不能用显示文本作为身份，也不能通过 CSS 隐藏多余 DOM 来
伪造前三项上限。

关键证据：

- `codex-rs/protocol/src/items.rs:313-319`
- `codex-gui/src/features/transcriptState/transcriptStateModel.ts:124-133`
- `codex-gui/src/features/transcriptState/transcriptItemPolicy.ts:351-362`
- `codex-gui/src/features/transcriptState/transcriptStateSelectors.ts:279-304`
- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx:103-110`
- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx:377-424`
- `codex-gui/.heroui-docs/react/components/(collections)/tag-group.mdx:1-3`
- `codex-gui/.heroui-docs/react/components/(data-display)/chip.mdx:1-18`

## 权威 contract 与数据流

```text
generated ThreadItem.subAgentActivity
  -> transcriptItemPolicy
  -> TranscriptSubAgentActivityStoredEntry
       agentThreadId + agentPath + activityKind
  -> transcriptStateSelectors
  -> per-entry activity view
  -> single-chunk ActivityEntryGroup presentation
       same-kind runs -> format -> disambiguate -> first 3 + omitted count
  -> TUI action copy + HeroUI Chip
```

- authoritative source 始终是生成的 `ThreadItem`；不得手写协议 DTO 或 runtime validator。
- `identityKey = agentThreadId`，`canonicalPath = agentPath`，显示 label 由 path leaf 派生。
- 聚合只发生在 `MiddleTranscriptChunk` 已提供的单个 chunk presentation 中，不改变 committed entry、
  item ID、projection 顺序、middle count 或 chunk cache。
- `collabAgentToolCall` 保持现有逐行 presentation，并切断两侧 `subAgentActivity` 聚合。

## 固定范围

### 设计与计划文档

- `docs/superpowers/specs/2026/08/18/2026-08-18-codex-gui-subagent-information-display-design.md`
- `docs/superpowers/plans/2026/08/18/2026-08-18-codex-gui-subagent-information-display.md`

### Transcript domain 与 selector

- `codex-gui/src/features/transcriptState/transcriptStateModel.ts`
- `codex-gui/src/features/transcriptState/transcriptItemPolicy.ts`
- `codex-gui/src/features/transcriptState/transcriptStateSelectors.ts`
- `codex-gui/src/features/transcriptState/__tests__/transcriptItemPolicy.test.ts`
- `codex-gui/src/features/transcriptState/__tests__/transcriptStateSnapshot.test.ts`
- `codex-gui/src/features/transcriptState/__tests__/transcriptStateCommittedProjection.test.ts`
- `codex-gui/src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts`

### Presentation、国际化与 Browser 测试

- `codex-gui/src/features/committedTranscriptSurface/subAgentActivityPresentation.ts`（新增）
- `codex-gui/src/features/committedTranscriptSurface/__tests__/subAgentActivityPresentation.test.ts`（新增）
- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx`
- `codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx`
- `codex-gui/src/features/threadHistory/__tests__/ThreadHistoryDetailPage.browser.test.tsx`
- `codex-gui/src/__tests__/sequential/subagent-activity-responsive.browser.test.tsx`（新增）
- `codex-gui/src/locales/en.po`
- `codex-gui/src/locales/zh-CN.po`

若真实实现能在不降低覆盖的前提下少改某个测试文件，以实际必需文件为准；不得因为计划列出文件就
制造无价值 diff。若必须修改上述范围外生产模块、协议、生成文件、fixture builder、路由或 package
script，立即停止并回到计划确认。

## 非目标与禁止范围

- 不修改 `codex-rs/**`、app-server schema、生成 TypeScript、validators 或 projection fixtures。
- 不修改 `collabAgentToolCall` 的文案、详情、生命周期或 receiver/state 语义。
- 不新增 nickname、role、prompt、model、reasoning effort、实时状态、“已更新”或结果摘要。
- 不新增链接、按钮、Popover、Tooltip、Disclosure 或子代理任务导航。
- 不跨 chunk 聚合，不把 turn entries 展平成全量数组，不测量 DOM 行数决定显示数量。
- 不先渲染全部 Chip 再用 CSS 隐藏；省略项不进入隐藏 DOM。
- 不按 nickname、role、状态或代理序号添加彩色图标与硬编码颜色。
- 不新增依赖、安装工具/浏览器，不修改 package script，不运行后端、原生或 CLI build/run。
- 不运行 Git 远程命令。
- 不在行为提交中混入 import、声明、函数、组件或测试的纯顺序整理；若确需纯重排，停止并单独更新
  计划，不得顺手混入。

## Preflight（实施前只读）

```bash
git status --short --branch
git branch --show-current
git rev-parse HEAD
git log -1 --oneline
test -x /opt/homebrew/bin/fnm
test -d codex-gui/node_modules
test -d codex-gui/.heroui-docs/react
test -d ../vitest/docs
/opt/homebrew/bin/fnm exec --using-file pnpm --version
```

要求：

- 分支仍为 `dev`。HEAD 可因当前其他已确认任务推进而变化；若不再是计划基线，先只读检查目标文件
  和设计依据是否漂移，不机械依赖旧行号。
- fnm、pnpm、`node_modules`、本地 HeroUI 或 Vitest docs 缺失时停止；助手不得安装。
- 所有 pnpm 命令 cwd 为 `codex-gui`，使用
  `/opt/homebrew/bin/fnm exec --using-file pnpm ...`。
- 计划落盘时工作树已有 context-usage 相关改动，其中
  `transcriptStateCommittedProjection.test.ts` 与本计划潜在重叠。实施前若任何目标文件仍含本任务之外
  的未提交改动，先检查能否完全避让；只要编辑或 stage 会混入、覆盖或错误归属既有改动，就停止并
  请求用户协调，不使用 restore、覆盖、兼容层或强制暂存绕过。
- `projectionTestBuilders.ts` 当前已有其他任务改动，但现有 `subAgentActivity` builder 已支持覆盖
  `agentThreadId`；本计划不得修改该文件。

每个 Task 对应一个独立本地提交。中间提交不要求满足后续 UI 结果，但必须通过该任务可独立执行的
验证；不得为中间完整性增加 fallback、双写、旧新 presentation 并存或兼容 adapter。

## Task 0：确认并提交设计与计划文档

### 修改

- 用户确认本计划后，把计划状态改为“已确认”，记录确认日期与确认原文。
- 保留设计已确认状态和确认后的 HeroUI `Chip` 技术纠错说明，不改变已确认产品语义。

### 验证与提交

```bash
git add -- docs/superpowers/specs/2026/08/18/2026-08-18-codex-gui-subagent-information-display-design.md docs/superpowers/plans/2026/08/18/2026-08-18-codex-gui-subagent-information-display.md
git diff --cached --check
git diff --cached --name-only
git diff --cached
git commit -m 'docs(gui): plan subagent information display'
```

staged 文件必须恰好是这两份文档，不得带入其他工作树变更。

## Task 1：贯通子代理稳定身份

### 修改

- 在 `TranscriptSubAgentActivityStoredEntry` 增加直接引用生成 contract 的 `agentThreadId` 字段；不声明
  宽化字符串 DTO 或第二套身份类型。
- `transcriptItemPolicy` 对 completed `subAgentActivity` 机械保存 `item.agentThreadId`。
- 三种 activity title copy 与 selector view 原样携带 `agentThreadId + agentPath`，对 kind 继续穷尽
  分支；不在本任务做格式化、消歧或 UI 聚合。
- 更新 item policy、snapshot、committed projection 与 selector cache 的精确对象断言，反转当前
  “不含 agentThreadId”断言，并证明同显示路径的不同 thread ID 不被 state/view 合并。
- 不改变 item/chunk ID、revision、entry 顺序、middle count 或 cache key。

### 限定格式化

在 `codex-gui` 目录仅对本任务实际修改文件运行：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt src/features/transcriptState/transcriptStateModel.ts src/features/transcriptState/transcriptItemPolicy.ts src/features/transcriptState/transcriptStateSelectors.ts src/features/transcriptState/__tests__/transcriptItemPolicy.test.ts src/features/transcriptState/__tests__/transcriptStateSnapshot.test.ts src/features/transcriptState/__tests__/transcriptStateCommittedProjection.test.ts src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts --write
```

### 窄验证

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/transcriptState/__tests__/transcriptItemPolicy.test.ts src/features/transcriptState/__tests__/transcriptStateSnapshot.test.ts src/features/transcriptState/__tests__/transcriptStateCommittedProjection.test.ts src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

### 暂存与提交

```bash
git add -- codex-gui/src/features/transcriptState/transcriptStateModel.ts codex-gui/src/features/transcriptState/transcriptItemPolicy.ts codex-gui/src/features/transcriptState/transcriptStateSelectors.ts codex-gui/src/features/transcriptState/__tests__/transcriptItemPolicy.test.ts codex-gui/src/features/transcriptState/__tests__/transcriptStateSnapshot.test.ts codex-gui/src/features/transcriptState/__tests__/transcriptStateCommittedProjection.test.ts codex-gui/src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts
git diff --cached --check
git diff --cached --name-only
git diff --cached
git commit -m 'feat(gui): retain subagent transcript identity'
```

staged diff 只能贯通现有字段及更新对应测试，不能包含 Task 2 的可见 UI 行为。

## Task 2：显示有界任务 Chip 聚合

### 纯 presentation seam

- 新建 `subAgentActivityPresentation.ts`，输入只接受前端 activity view 所需的只读机械派生字段，统一
  负责：
  - 从 `agentPath` 取 leaf，把 `_` 转为空格并只大写首个可显示字符；
  - 不维护 `GUI/URL` 等缩写词典，不从 nickname/role/thread title 猜名称；
  - 按格式化 label 查找重名，只给重名项补最短可区分父路径；
  - 保持原事件顺序，返回前三项和 omitted count；
  - React identity 使用 `turnId + itemId + agentThreadId` 派生值，不使用 label。
- 为纯函数增加整对象 equality 单测，覆盖普通 leaf、数字/下划线、父路径重名、一层仍不唯一、
  1/2/3/4 个项目和固定顺序。

### 单 chunk 行级聚合

- 保留现有 `groupTranscriptEntries` 的单 chunk Card 边界；在 `ActivityEntryGroup` 内把最大连续且同
  `activityKind` 的 `subAgentActivity` 合成一行。
- `collabAgent`、不同 kind 或任何其他 entry 都切断该行级聚合；不跨 Card、chunk 或隐藏 disclosure
  查找同类活动。
- 单活动复用同一行 renderer，不保留另一套 raw-path Tag DOM。
- 前三项之外只产生 omitted count 文案，不创建隐藏 Chip。

### HeroUI、文案与响应式

- 用 `Chip size="sm" variant="secondary" color="default"` 替换可聚焦 `TagGroup/Tag`；外层使用
  普通语义容器和 `flex-wrap`，不添加 action、selection、grid/row 或 Tab 焦点。
- `Chip.Label` 在有界 `min-width: 0` 容器内单行 `nowrap + overflow-hidden + text-ellipsis`；视觉文本
  可截断，组级 accessible name 保留完整消歧标签。
- 继续用 `Trans` 表达 JSX rich message 与 TUI 动作语序；用 `Plural` 表达 omitted count 的
  “及其他 N 个子代理”。英文与中文分别保持自然语序，不拼接不可翻译整句。
- 运行 `messages:extract`，检查 catalog diff，只填写本功能新增/变化的简体中文翻译；不使用 clean
  extraction，不手写模拟提取结果。
- 当前任务和 `ReadOnlyCommittedTranscriptSurface` 继续复用同一 renderer；历史页不增加点击、跳转
  或展开能力。

### 测试

- 扩展 `CommittedTranscriptSurface.browser.test.tsx`：
  - 三种 TUI 动作使用格式化 Chip，DOM 不再出现 raw path 或“已更新”；
  - 相邻同 kind 1/2/3/4 项的 Chip 数、顺序和 omitted count 正确；
  - `collabAgent`、不同 kind 分隔聚合；省略项目不在 DOM；
  - 重名使用最短父路径，Chip 无 button/link/grid/row/selection/Tab 焦点；
  - 使用 accessible-name locator 与可重试 `expect.element`，不按 Tailwind class 断言。
- 扩展 `ThreadHistoryDetailPage.browser.test.tsx` 一条只读集成覆盖，证明历史详情使用同一格式化与聚合
  且没有子代理 action。
- 新增 sequential 响应式 Browser 测试，在 390x900 与 1440x900 下用 `page.viewport` 验证：
  - transcript 受约束容器 `scrollWidth <= clientWidth`；
  - Chip 容器允许换行；
  - 长 label 的计算样式是单行、隐藏溢出、ellipsis；
  - 固定前三项不随 viewport 改变。
- 每个 viewport 测试保存并恢复原尺寸，不截图、不固定 padding/gap/颜色/阴影或精确 Chip 宽度。

### 国际化生成与限定格式化

在 `codex-gui` 目录运行：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run messages:extract
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt src/features/committedTranscriptSurface/subAgentActivityPresentation.ts src/features/committedTranscriptSurface/__tests__/subAgentActivityPresentation.test.ts src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx src/features/threadHistory/__tests__/ThreadHistoryDetailPage.browser.test.tsx src/__tests__/sequential/subagent-activity-responsive.browser.test.tsx --write
```

运行后检查 `src/locales/en.po`、`zh-CN.po` 只包含本次文案与必要 source reference 更新；发现无关 catalog
漂移时停止调查生成原因，不手工删除生成结果来伪造通过。

### 窄验证

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/committedTranscriptSurface/__tests__/subAgentActivityPresentation.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --config=vitest.browser.parallel.config.ts src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx src/features/threadHistory/__tests__/ThreadHistoryDetailPage.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --config=vitest.browser.sequential.config.ts src/__tests__/sequential/subagent-activity-responsive.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run lint
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

Browser Mode 必须覆盖 Chromium、Firefox、WebKit；不得以只跑 Chromium 代替矩阵。

### 暂存与提交

```bash
git add -- codex-gui/src/features/committedTranscriptSurface/subAgentActivityPresentation.ts codex-gui/src/features/committedTranscriptSurface/__tests__/subAgentActivityPresentation.test.ts codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx codex-gui/src/features/threadHistory/__tests__/ThreadHistoryDetailPage.browser.test.tsx codex-gui/src/__tests__/sequential/subagent-activity-responsive.browser.test.tsx codex-gui/src/locales/en.po codex-gui/src/locales/zh-CN.po
git diff --cached --check
git diff --cached --name-only
git diff --cached
git commit -m 'feat(gui): display subagent task chips'
```

staged diff 必须只包含本任务 presentation、测试和由 Lingui 原生流程产生的目标 catalog 更新。

## 最终验证

Task 2 提交完成后，在 `codex-gui` 目录运行当前 package scripts：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run ci
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser
/opt/homebrew/bin/fnm exec --using-file pnpm run build
```

要求：

- `ci` 覆盖 validator drift check、format check、lint、type-check 和完整 unit suite；
- `test:browser` 覆盖 parallel + sequential 的 Chromium/Firefox/WebKit matrix；
- `build` 覆盖 TypeScript project build 与 Vite production build；
- 不运行 `test:e2e`，本功能已有直接 Browser Mode 覆盖；
- 不在最终验证后为了“顺手整理”新增代码变更；若验证发现本次计划内问题，按所属 Task 修正并 amend
  对应本地提交，重新执行受影响验证与最终验证；
- 预存或其他任务引入的失败要与本次变更区分并报告，不修改范围外文件掩盖失败。

## 完成标准

- 设计与计划文档各自状态、确认原文和提交边界正确。
- `agentThreadId` 从 authoritative item 贯通 stored entry 与 view，显示文本不再充当身份。
- 用户看到格式化任务 Chip、最短父路径消歧、同动作前三项聚合和自然语言 omitted count。
- TUI 动作语义保持不变，不出现 nickname/role/实时状态/“已更新”或交互入口。
- Chip 是非交互语义、无额外焦点；长文本单行省略但完整 accessible name 可读。
- 当前任务和历史只读详情一致；手机/桌面无水平溢出。
- chunk、折叠不挂载、selector cache 与事件顺序约束有回归覆盖。
- 三个计划 Task 各自一个本地提交，最终验证全部通过，工作树中其他任务变更未被覆盖或误提交。

## 计划确认

用户已于 2026-08-18 以原文“确认。提交文档”明确确认本计划，现可按 Task 0 → Task 1 → Task 2 执行。
