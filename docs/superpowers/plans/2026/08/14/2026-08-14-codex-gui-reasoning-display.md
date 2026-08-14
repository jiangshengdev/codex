# Codex GUI reasoning summary 显示实施计划

状态：已确认

日期：2026-08-14

实施基线：`dev @ b38b29b9c4d330748056b6dbb4d0c63b833878e8`

对应设计：[Codex GUI reasoning summary 显示设计](../../../../specs/2026/08/14/2026-08-14-codex-gui-reasoning-display-design.md)

设计确认：用户于 2026-08-14 明确回复“确认，计划落盘”，确认已落盘设计并授权进入计划阶段。

实施确认：用户于 2026-08-14 明确回复“开始进行”，确认本计划并授权进入实施阶段。

## 目标

在不修改 app-server 协议的前提下，让 `codex-gui`：

- reasoning 生成期间在原始 middle-entry 位置显示当前最新 summary 标题；
- reasoning item 完成后，以 completed item 的权威 `summary` 固化一条 transcript 记录；
- 按 `summaryIndex` 保留多 part 顺序，永不保存或 fallback 到 raw `content` / `reasoningText`；
- 保持 commentary、reasoning、可见 agent activity 的事件顺序、chunk cache 和滚动信号；
- final answer 出现后把 reasoning 纳入现有 `Intermediate updates` disclosure；
- 以无 Card、无 `Thinking` 标签的紧凑圆点、弱化斜体 Markdown 渲染完成态；
- 在 turn 中断、失败和 projection 重连时清除未完成 reasoning，只恢复 completed summary。

## 根因与实现 seam

当前 app-server v2 协议已经提供完整数据，但 GUI 在 transcript policy 层主动丢弃：

- `ThreadItem.Reasoning` 完成态有 `summary` 与 raw `content`；
- `ThreadProjectionDelta` 有 `reasoningSummaryText`、`reasoningSummaryPartAdded` 和 raw
  `reasoningText`；
- `transcriptItemPolicy.ts` 对 reasoning started、completed 及三种 delta 全部返回 `ignore`；
- `transcriptStateModel.ts`、selectors 与 renderer 没有 reasoning entry/view。

因此改动必须进入既有 transcript 链路，而不是新增独立历史区：

```text
generated v2 protocol types
  → transcript item policy
  → transcript state implementation / projection
  → chunk-scoped selectors
  → committed transcript renderer
```

现有 projection coordinator 已保证结构事件前 flush 已接收 delta，并保持一个 batch 内的顺序；
thread runtime 已把 delta 作为跨 slice 信号发布。两者无需修改。

## 权威 contract 与派生路径

- 唯一协议权威来源是生成的 `@codex-protocol/v2`：`ThreadItem`、
  `ThreadProjectionDelta`、`ThreadProjectionDeltaNotification`。
- frontend reasoning item/delta 类型必须使用 `Extract`、indexed access 等机械派生方式；禁止手写镜像
  `summary`、`summaryIndex`、`delta` 或 discriminator contract。
- frontend stored entry/view 是不同于 wire payload 的 GUI domain model，只保存展示所需的 summary
  lifecycle、parts、title、source 与 revision；不得出现 raw `content`、`contentIndex` 或 raw text。
- incompatible upstream 变化必须继续在 TypeScript exhaustiveness/type-check 阶段失败；禁止使用
  `unknown`、宽 record、assertion 或 runtime fallback 隐藏变化。

## 精确文件范围

### 设计与计划文档

- `docs/superpowers/specs/2026/08/14/2026-08-14-codex-gui-reasoning-display-design.md`
- `docs/superpowers/plans/2026/08/14/2026-08-14-codex-gui-reasoning-display.md`

### 状态与投影

- `codex-gui/src/features/projection/__tests__/projectionTestBuilders.ts`
- `codex-gui/src/features/transcriptState/transcriptStateModel.ts`
- `codex-gui/src/features/transcriptState/transcriptItemPolicy.ts`
- `codex-gui/src/features/transcriptState/transcriptStateImplementation.ts`
- `codex-gui/src/features/transcriptState/transcriptProjection.ts`
- `codex-gui/src/features/transcriptState/transcriptStateSelectors.ts`
- `codex-gui/src/features/transcriptState/__tests__/transcriptItemPolicy.test.ts`
- `codex-gui/src/features/transcriptState/__tests__/transcriptStateCommittedProjection.test.ts`
- `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveStreaming.test.ts`
- `codex-gui/src/features/transcriptState/__tests__/transcriptStateSnapshot.test.ts`
- `codex-gui/src/features/transcriptState/__tests__/transcriptStateReconnect.test.ts`
- `codex-gui/src/features/transcriptState/__tests__/transcriptStateReplayDedup.test.ts`
- `codex-gui/src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts`
- `codex-gui/src/features/transcriptState/__tests__/transcriptStateScrollSignals.test.ts`

### 渲染

- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx`
- `codex-gui/src/features/committedTranscriptSurface/__tests__/ReasoningTranscriptSurface.browser.test.tsx`

不预先修改 `index.css`。已确认样式可由 HeroUI `Typography` 和局部 Tailwind 语义 token 表达；若真实
Browser 验证证明 Streamdown 子元素无法继承弱化/斜体语义，停止并更新计划，而不是临时扩大文件范围。

## 非目标与禁止范围

- 不修改 `codex-rs`、app-server、schema、generated TypeScript 或 validators；
- 不修改现有 reasoning JSON fixture、projection ingress/coordinator、thread runtime 或 GUI host；
- 不修改 `LiveMarkdownText.tsx`、`MarkdownText.tsx`、`markdownRendering.tsx` 或 locale catalog；
- 不新增独立 reasoning disclosure、Card、Chip、spinner、图标、动画、caret、可见 label 或 fallback 文案；
- 不 flatten 整个 turn，不跨 chunk 聚合或建立全 turn selector；
- 不保存、渲染、记录或测试 raw reasoning 正文；
- 不新增依赖、package script、浏览器二进制、E2E、截图或视觉 snapshot；
- 不运行协议生成、validator 生成、Rust build、Rust test 或 Git 远程命令；
- 不通过 skip、ignore、豁免、断言放宽、删除覆盖、CSS 隐藏或修改基线让验证通过；
- 不进行 import、声明、函数、组件或分支的纯顺序调整。若确需纯重排，必须停止并另建任务。

## Preflight

计划确认并进入实施后，先在仓库根目录执行只读检查：

```bash
git branch --show-current
git rev-parse HEAD
git status --short --untracked-files=all
git diff --cached --name-only
git check-ignore -v -- docs/superpowers/specs/2026/08/14/2026-08-14-codex-gui-reasoning-display-design.md
git check-ignore -v -- docs/superpowers/plans/2026/08/14/2026-08-14-codex-gui-reasoning-display.md
test -x /opt/homebrew/bin/fnm
test -d codex-gui/node_modules
command -v just
```

要求：

- 当前分支预期为 `dev`；HEAD 若已变化，重新核对所有 seam 和测试事实，不盲用旧行号；
- 当前已知 workspace 变化应只有本轮设计和计划文档；发现其他变更时保留并报告，不覆盖；
- 两份文档不得被 ignore，禁止强制暂存 ignore 文件；
- 缺少 fnm、已有 `node_modules`、Node、pnpm 或 just 时停止，告知用户自行安装或准备；助手不得安装。

进入 `codex-gui` 后只读确认工具来源：

```bash
/opt/homebrew/bin/fnm exec --using-file node --version
/opt/homebrew/bin/fnm exec --using-file pnpm --version
```

所有 pnpm 命令使用 `/opt/homebrew/bin/fnm exec --using-file pnpm ...`，cwd 固定为
`codex-gui`，不得使用 Codex runtime shim。

## 编辑、验证与提交纪律

- 普通 Markdown、TypeScript 和 TSX 没有更高层项目命令可表达内容修改时使用 `apply_patch`；
- 格式化必须先用 scoped `oxfmt --write`，再以 `oxfmt --check` 或包级 check 验证；
- 合法协议测试输入必须使用共享 projection fixture/builder，不手写完整 protocol envelope；
- Browser Mode 使用 locator 与 `expect.element` 的可重试断言，不锁定 padding、gap、颜色值、阴影或
  HeroUI 私有 DOM；
- state delta 处理必须保留 batch 原始顺序；不得把 `partAdded` 和不同 `summaryIndex` 塞进现有
  agent-message 字符串 join bucket；
- 每个任务完成修改和本任务验证后，只暂存该任务文件，检查 staged diff，再创建一个独立本地提交；
- 当前任务引入的 format、lint、type 或 test 失败必须在计划范围内修正后再提交；预存或无关失败只报告；
- 目标行为 diff 保持在 800 changed lines 以下；达到或超过 800 行时停止并拆分，不以测试省略规避上限；
- 不得在行为提交中夹带纯重排。

## Task 0：确认并提交设计与计划文档

### 文件

- 已确认设计文档；
- 本计划文档。

### 修改

- 用户明确确认本计划后，把计划状态改为“已确认”，并记录确认原文与日期；
- 除状态和确认记录外，不改写或重排设计、计划正文。

### 检查与提交

在仓库根目录：

```bash
git diff --check -- docs/superpowers/specs/2026/08/14/2026-08-14-codex-gui-reasoning-display-design.md docs/superpowers/plans/2026/08/14/2026-08-14-codex-gui-reasoning-display.md
git add -- docs/superpowers/specs/2026/08/14/2026-08-14-codex-gui-reasoning-display-design.md docs/superpowers/plans/2026/08/14/2026-08-14-codex-gui-reasoning-display.md
git diff --cached --name-only
git diff --cached --check
git diff --cached
git commit -m 'docs(gui): design reasoning summary display'
```

staged 文件必须恰好为上述两份文档。

## Task 1：实现 reasoning transcript 状态与投影

### Shared projection builders

在 `projectionTestBuilders.ts`：

- 从权威 `ThreadItem` 派生 `ReasoningItem`，新增 `reasoningItem(id, summary, content?)` builder；
- 为三种现有 fixture 增加类型安全 builder：`reasoningSummaryTextDelta`、
  `reasoningSummaryPartAddedDelta`、`reasoningTextDelta`；
- builder 只替换 fixture 中的 envelope 字段，不手写或复制完整协议 contract；
- 不修改既有 JSON fixture 或 fixture 验证测试。

### Domain model 与 policy

按以下依赖顺序编辑：

1. `transcriptStateModel.ts`
   - 使用 `Extract<ThreadItem, { type: "reasoning" }>` 派生权威 item type；
   - 增加专用 streaming/completed stored entry 与 streaming/completed reasoning view；
   - streaming state 按 numeric `summaryIndex` 保存临时 parts、当前 index、title 和 revision；
   - completed state 只保存规范化后的 summary parts/source，不包含 raw content；
   - 将 reasoning 纳入 `TranscriptStoredEntry`、`TranscriptEntryView`，不冒充 assistant message。
2. `transcriptItemPolicy.ts`
   - started reasoning 返回专用 reserve projection；
   - completed reasoning trim/filter 权威 `summary`，非空时返回 completed entry，空时返回 remove；
   - delta policy 分别返回 agent message、summary text 和 part-added operation；
   - raw `reasoningText` 永久返回 `ignore`；
   - 只做无状态事实分类；标题跨 delta 闭合，不在 policy 内提取。

### State implementation 与 projection

在 `transcriptStateImplementation.ts`：

- started 时把 streaming reasoning entry 放入当前 middle chunk，保留 event order，但 title 为空时不增加
  `middleEntryCount`；
- 按输入数组原始顺序逐个应用 summary text/part-added operation，以 `(turnId, itemId)` 定位 streaming
  reasoning；
- summary text 按 `summaryIndex` 追加，part-added 建立/切换当前 part；
- 从当前 part 的累积文本中提取第一个非空 `**...**` 作为 title；未闭合或不存在时不显示 fallback；
- title 首次可见时增加 `middleEntryCount`，同位置更新只 bump entry、所属 chunk revision 和
  `liveScrollPulse`；
- completed item 直接用权威 summary 替换同一 entry identity，不与流式缓存合并；
- completed summary 为空时删除临时 entry，正确回收可见计数、chunk、entry mapping 和 committed scroll
  signal；
- 无对应 streaming entry、已完成、已清理、wrong thread 或迟到 delta 直接忽略，不能复活 entry；
- 增加按 turn 清理以及清理全部 streaming reasoning 的内部 helper，保留 completed reasoning。

在 `transcriptProjection.ts`：

- attach 继续从空 state 只经 completed policy 重建，不另存流式状态；
- terminal `turnCompleted` 更新后，若 turn 是 `interrupted` 或 `failed`，清理该 turn 的 streaming
  reasoning；
- manual reconnect required 时先清理全部 streaming reasoning，再保留现有 global reconnect status；
- 不修改 coordinator、runtime、event dedup 或 ingress。

### Selectors

在 `transcriptStateSelectors.ts`：

- streaming title 为空时返回 `null` view；
- streaming title 非空时返回专用 reasoning streaming view；
- completed summary parts 以空行连接为静态 Markdown source，返回专用 completed view；
- 保持 WeakMap entry/chunk cache；reasoning delta 只能失效目标 entry 和所属 chunk；
- 不输出 raw content，不建立全 turn 派生数组。

### 状态测试

- `transcriptItemPolicy.test.ts`：started reserve、completed summary normalize、空 summary remove、两种
  summary delta present、raw delta ignore；
- `transcriptStateCommittedProjection.test.ts`：替换旧的“reasoning 不建 slot”断言，覆盖预留不可见位置、
  completed 原位权威替换、空 summary 清理、与 commentary/activity 的事件顺序、terminal turn 清理；
- `transcriptStateLiveStreaming.test.ts`：标题跨 delta 闭合、同一位置更新、多个/稀疏 index、part boundary、
  raw/wrong target/迟到/无 entry delta ignore；
- `transcriptStateSnapshot.test.ts`：snapshot 只恢复 completed summary，多 part 顺序及空 part 过滤；
- `transcriptStateReconnect.test.ts`：manual reconnect 和 reattach 清除 streaming，保留/恢复 completed；
- `transcriptStateReplayDedup.test.ts`：snapshot duplicate、重复 completed 不重复 entry 或计数；
- `transcriptStateSelectorCache.test.ts`：只失效目标 entry/chunk，其他 chunk/view 引用稳定；
- `transcriptStateScrollSignals.test.ts`：标题首次出现/更新触发 live pulse，completed 替换/可见删除触发
  committed signal，空不可见 entry 不制造滚动。

测试必须比较完整 state/view 对象或完整序列；不得只断言零散字段来掩盖多余 raw 数据或计数漂移。

### Scoped 格式化与验证

在 `codex-gui` 执行 scoped `oxfmt --write`，目标为 Task 1 的实际 TS 文件；随后：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt --check src/features/projection/__tests__/projectionTestBuilders.ts src/features/transcriptState/transcriptStateModel.ts src/features/transcriptState/transcriptItemPolicy.ts src/features/transcriptState/transcriptStateImplementation.ts src/features/transcriptState/transcriptProjection.ts src/features/transcriptState/transcriptStateSelectors.ts src/features/transcriptState/__tests__/transcriptItemPolicy.test.ts src/features/transcriptState/__tests__/transcriptStateCommittedProjection.test.ts src/features/transcriptState/__tests__/transcriptStateLiveStreaming.test.ts src/features/transcriptState/__tests__/transcriptStateSnapshot.test.ts src/features/transcriptState/__tests__/transcriptStateReconnect.test.ts src/features/transcriptState/__tests__/transcriptStateReplayDedup.test.ts src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts src/features/transcriptState/__tests__/transcriptStateScrollSignals.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/transcriptState/__tests__/transcriptItemPolicy.test.ts src/features/transcriptState/__tests__/transcriptStateCommittedProjection.test.ts src/features/transcriptState/__tests__/transcriptStateLiveStreaming.test.ts src/features/transcriptState/__tests__/transcriptStateSnapshot.test.ts src/features/transcriptState/__tests__/transcriptStateReconnect.test.ts src/features/transcriptState/__tests__/transcriptStateReplayDedup.test.ts src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts src/features/transcriptState/__tests__/transcriptStateScrollSignals.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxlint src/features/projection/__tests__/projectionTestBuilders.ts src/features/transcriptState/transcriptStateModel.ts src/features/transcriptState/transcriptItemPolicy.ts src/features/transcriptState/transcriptStateImplementation.ts src/features/transcriptState/transcriptProjection.ts src/features/transcriptState/transcriptStateSelectors.ts src/features/transcriptState/__tests__/transcriptItemPolicy.test.ts src/features/transcriptState/__tests__/transcriptStateCommittedProjection.test.ts src/features/transcriptState/__tests__/transcriptStateLiveStreaming.test.ts src/features/transcriptState/__tests__/transcriptStateSnapshot.test.ts src/features/transcriptState/__tests__/transcriptStateReconnect.test.ts src/features/transcriptState/__tests__/transcriptStateReplayDedup.test.ts src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts src/features/transcriptState/__tests__/transcriptStateScrollSignals.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm exec eslint --cache src/features/projection/__tests__/projectionTestBuilders.ts src/features/transcriptState/transcriptStateModel.ts src/features/transcriptState/transcriptItemPolicy.ts src/features/transcriptState/transcriptStateImplementation.ts src/features/transcriptState/transcriptProjection.ts src/features/transcriptState/transcriptStateSelectors.ts src/features/transcriptState/__tests__/transcriptItemPolicy.test.ts src/features/transcriptState/__tests__/transcriptStateCommittedProjection.test.ts src/features/transcriptState/__tests__/transcriptStateLiveStreaming.test.ts src/features/transcriptState/__tests__/transcriptStateSnapshot.test.ts src/features/transcriptState/__tests__/transcriptStateReconnect.test.ts src/features/transcriptState/__tests__/transcriptStateReplayDedup.test.ts src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts src/features/transcriptState/__tests__/transcriptStateScrollSignals.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

### staged review 与提交

只暂存 Task 1 的 14 个状态/测试文件：

```bash
git add -- codex-gui/src/features/projection/__tests__/projectionTestBuilders.ts codex-gui/src/features/transcriptState/transcriptStateModel.ts codex-gui/src/features/transcriptState/transcriptItemPolicy.ts codex-gui/src/features/transcriptState/transcriptStateImplementation.ts codex-gui/src/features/transcriptState/transcriptProjection.ts codex-gui/src/features/transcriptState/transcriptStateSelectors.ts codex-gui/src/features/transcriptState/__tests__/transcriptItemPolicy.test.ts codex-gui/src/features/transcriptState/__tests__/transcriptStateCommittedProjection.test.ts codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveStreaming.test.ts codex-gui/src/features/transcriptState/__tests__/transcriptStateSnapshot.test.ts codex-gui/src/features/transcriptState/__tests__/transcriptStateReconnect.test.ts codex-gui/src/features/transcriptState/__tests__/transcriptStateReplayDedup.test.ts codex-gui/src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts codex-gui/src/features/transcriptState/__tests__/transcriptStateScrollSignals.test.ts
git diff --cached --name-only
git diff --cached --check
git diff --cached --numstat
git diff --cached
git commit -m 'feat(gui): project reasoning summaries into transcript'
```

staged 文件必须恰好为上述 14 个文件。

## Task 2：渲染 reasoning 并完成 Browser 验证

### Renderer

在 `CommittedTranscriptSurface.tsx`：

- 把 reasoning 作为 singleton entry，与 message/status 一样切断连续 activity group；
- streaming view 使用现有 HeroUI v3 `Typography type="body-sm" color="muted"`，增加
  `role="status"`、`aria-live="polite"`、`aria-atomic="true"`；只显示 title；
- streaming entry 继续使用 `(turnId,itemId)` key，同一 title 位置更新 DOM，不创建新行；
- completed view 使用语义 `article` 与局部两列布局：第一列是 `aria-hidden` 的 `•`，第二列复用现有
  `MarkdownText`；wrapper 使用 `text-sm text-muted italic`，让所有换行与正文起点对齐；
- 不使用 Card、Chip、Disclosure、`Typography.Prose` 或 `LiveMarkdownText`；完成态必须继续复用
  Streamdown 的 sanitize、链接、code/CJK 和 `skipHtml` 策略；
- 不改 outer `MiddleTranscriptModule`；reasoning 自然计入现有 `middleEntryCount`，final 前展开、final
  后默认折叠且隐藏内容不挂载。

HeroUI 选择说明：临时标题是纯语义文字，使用 `Typography` 的正式 `body-sm` / `muted` API；完成态是
Markdown AST 和悬挂圆点布局，HeroUI 没有等价 interactive/surface component，使用语义 markup 与局部
token 比 Card 或 `Typography.Prose` 更符合设计和 transcript 性能边界。

### 新建 Browser Mode 测试

新建 `ReasoningTranscriptSurface.browser.test.tsx`，复用 shared projection builders 和现有
`renderWithProviders`，覆盖：

- 标题跨 delta 闭合前不可见，闭合后出现；后续 part 只更新同一 `role="status"`，DOM 中始终一条；
- streaming region 具有 `aria-live="polite"` 与 atomic 语义，无可见 `Thinking` 文案；
- completed 后临时 status 被一条圆点 Markdown article 原位替换，completed payload 覆盖不同流式内容；
- 完成态能渲染 Markdown emphasis/code/link，且 reasoning article 不位于 Card 内；
- 两个相邻 activity 被 reasoning 分成两个 activity group，DOM 顺序与事件顺序一致；
- final answer 前 reasoning 可见；final 出现后 `Intermediate updates · 1 item` 默认折叠且 hidden Markdown
  不挂载，展开后恢复同一 completed reasoning；
- 空 summary、raw-only reasoning 不出现空圆点或空 article。

使用 `page`/render locator 与 `expect.element` 的可重试断言；允许对受控 reasoning wrapper 做语义 class
存在性检查，但不锁 padding、gap、颜色实现值、HeroUI 私有 DOM 或浏览器截图。

目标文件位于 parallel Browser 分区，必须运行项目配置的 Chromium、Firefox、WebKit 三浏览器实例；
不放入 sequential 分区。

### Scoped 格式化与验证

在 `codex-gui`：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt --write src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx src/features/committedTranscriptSurface/__tests__/ReasoningTranscriptSurface.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt --check src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx src/features/committedTranscriptSurface/__tests__/ReasoningTranscriptSurface.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run --config=vitest.browser.parallel.config.ts src/features/committedTranscriptSurface/__tests__/ReasoningTranscriptSurface.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxlint src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx src/features/committedTranscriptSurface/__tests__/ReasoningTranscriptSurface.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm exec eslint --cache src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx src/features/committedTranscriptSurface/__tests__/ReasoningTranscriptSurface.browser.test.tsx
```

随后执行合并状态的最终 GUI 验证：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/transcriptState/__tests__/transcriptItemPolicy.test.ts src/features/transcriptState/__tests__/transcriptStateCommittedProjection.test.ts src/features/transcriptState/__tests__/transcriptStateLiveStreaming.test.ts src/features/transcriptState/__tests__/transcriptStateSnapshot.test.ts src/features/transcriptState/__tests__/transcriptStateReconnect.test.ts src/features/transcriptState/__tests__/transcriptStateReplayDedup.test.ts src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts src/features/transcriptState/__tests__/transcriptStateScrollSignals.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
/opt/homebrew/bin/fnm exec --using-file pnpm run lint
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

最后在 `codex-rs` 目录执行仓库强制格式化：

```bash
just fmt
```

`just fmt` 会调用仓库 `justfile` 的 `fmt` recipe；执行后不得重跑测试。随后回到仓库根目录检查
`git status --short` 和 diff。预期它不产生 Rust 或其他范围外 diff；若产生，停止并报告，不暂存范围外
文件。

### staged review 与提交

只暂存两个 Task 2 文件：

```bash
git add -- codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx codex-gui/src/features/committedTranscriptSurface/__tests__/ReasoningTranscriptSurface.browser.test.tsx
git diff --cached --name-only
git diff --cached --check
git diff --cached --numstat
git diff --cached
git commit -m 'feat(gui): render transcript reasoning summaries'
```

staged 文件必须恰好为上述两个文件。

## 最终完成条件

- Task 0、Task 1、Task 2 各形成一个独立本地提交；
- 最终 workspace 不遗留本任务的未暂存或未提交变更；
- `ThreadItem` / delta contract 保持机械派生和 exhaustive failure propagation；
- state 中不存在 raw reasoning，completed summary 始终覆盖 transient 内容；
- streaming、completed、空 summary、顺序、计数、滚动、snapshot、replay、interrupt 和 reconnect 均有
  targeted unit coverage；
- Browser Mode 在 Chromium、Firefox、WebKit 证明单一 live title、圆点 Markdown、无 Card/Thinking、
  activity 分隔和 disclosure 行为；
- chunk selector cache 保持稳定，未 flatten turn 或挂载折叠内容；
- 包级 formatting、lint、type-check 和 targeted tests 通过；`just fmt` 最后执行且不产生范围外 diff；
- diff 不包含协议、generated 文件、runtime ingress/coordinator、locale、全局 CSS、依赖或无关重排。
