# Codex GUI 思考信息 Card 样式实施计划

状态：已确认

日期：2026-08-15

实施基线：`dev @ 506e53ca55f49909ddaee6d89d25f63e00fe9c16`

对应设计：[Codex GUI 思考信息 Card 样式设计](../../../../specs/2026/08/15/2026-08-15-codex-gui-reasoning-card-style-design.md)

设计确认：用户于 2026-08-15 明确回复“确认设计。计划落盘”，确认已落盘设计并授权进入计划阶段。

实施确认：用户于 2026-08-15 明确回复“开始进行”，确认本计划并授权进入实施阶段。

## 目标

只修改 committed transcript 的 reasoning 显示层：让流式态与完成态都由 HeroUI v3
`Card variant="default"` 承载，完成态直接删除硬编码的 `•`，同时保持动态标题、ARIA live、Markdown、
raw reasoning 隐藏、事件顺序、活动分组边界、折叠和 chunk 性能语义不变。

完成状态必须由 Browser Mode 测试证明 reasoning 位于 default Card 内且目标 TUI 字符已从受控 JSX
输出中消失。仅引入 Card import、用 CSS 隐藏字符或放宽旧断言不构成完成。

## 根因与最小实现 seam

根因只在 `CommittedTranscriptSurface.tsx` 的 `ReasoningEntryRenderer`：

- `streaming` 分支直接返回带实时播报属性的 `Typography`，没有 Card 表面；
- `completed` 分支返回普通 `article`，并在 `MarkdownText` 前硬编码 `U+2022 BULLET`；
- `Card` 已从 `@heroui/react` 导入，项目已有 v3 compound component 用法；
- `ReasoningTranscriptSurface.browser.test.tsx` 已覆盖流式更新、完成态权威 Markdown、raw reasoning
  隐藏、活动分组边界、顺序和折叠，但旧断言明确要求完成态没有 Card 且包含 `•`。

因此只需修改 renderer 和对应 Browser Test。不得进入协议、projection、transcript state、selector、
fixture、locale、CSS 或 Vitest 配置。

## 权威 contract 与性能边界

权威派生路径保持：

```text
generated protocol types
  -> transcript projection and item policy
  -> transcript state stored entry
  -> stable TranscriptEntryView
  -> ReasoningEntryRenderer
```

实现继续直接消费 `TranscriptEntryView` 的流式 `title` 与完成态 `source`，不读取 raw wire payload，不新增
consumer-owned DTO、validator、fallback 或兼容分支。

renderer 仍由现有 chunk-scoped component 调用。不得 flatten turn、跨 chunk 聚合 reasoning、改变 entry key，
或让每次 delta 产生新的 Card/DOM identity。

## 精确文件范围

允许修改：

- `docs/superpowers/specs/2026/08/15/2026-08-15-codex-gui-reasoning-card-style-design.md`
- `docs/superpowers/plans/2026/08/15/2026-08-15-codex-gui-reasoning-card-style.md`
- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx`
- `codex-gui/src/features/committedTranscriptSurface/__tests__/ReasoningTranscriptSurface.browser.test.tsx`

若实现证明必须修改此列表外文件，停止并回到计划确认。不得把显示层改造扩大到 locale、CSS、协议、状态
或其他 transcript entry。

## 非目标与禁止范围

- 不修改 Rust、app-server、schema、generated TypeScript 或 runtime validator；
- 不修改 projection、transcript state、selector、thread runtime、fixture 或 test config；
- 不新增固定“思考”标题、本地化文案、图标、Tag、Badge、Spinner、交互或 disclosure；
- 不修改子代理活动的 transparent Card、Tag、文案或分组；
- 不改变 reasoning 内容来源、summary 组合、生命周期、排序、计数、折叠、snapshot 或 reconnect；
- 不清洗 Markdown 源内容中的反引号、项目符号或其他业务字符；
- 不增加依赖、package script、浏览器二进制、E2E 或截图基线；
- 不运行协议生成、validator 生成、Rust build、Rust test 或任何 Git 远程命令；
- 不通过 skip、ignore、豁免、断言放宽、删除覆盖、CSS 隐藏或修改检查基线通过验证；
- 不进行 import、声明、函数、组件或分支的纯顺序调整。若确需纯重排，停止并新增独立计划任务。

## Preflight

计划确认并进入实施后，在仓库根目录先执行只读核验：

```bash
git branch --show-current
git rev-parse HEAD
git status --short --untracked-files=all
git diff --cached --name-only
git check-ignore -v -- docs/superpowers/specs/2026/08/15/2026-08-15-codex-gui-reasoning-card-style-design.md
git check-ignore -v -- docs/superpowers/plans/2026/08/15/2026-08-15-codex-gui-reasoning-card-style.md
test -x /opt/homebrew/bin/fnm
test -d codex-gui/node_modules
```

要求：

- 当前分支预期为 `dev`；HEAD 若变化，重新核对目标 seam 和测试，不盲目沿用旧行号；
- 当前已知 workspace 变化应只有本轮设计与计划文档；发现其他变更时保留并报告，不覆盖；
- 两份文档不得被 ignore，禁止强制暂存 ignore 文件；
- 缺少 fnm、已有 `node_modules`、Node、pnpm 或 Browser 运行条件时停止，告知用户自行准备；助手不得安装。

进入 `codex-gui` 后只读确认工具来源：

```bash
/opt/homebrew/bin/fnm exec --using-file node --version
/opt/homebrew/bin/fnm exec --using-file pnpm --version
```

所有 pnpm 命令使用相同 fnm-backed 形式，cwd 固定为 `codex-gui`，不得使用 Codex runtime shim。

## 编辑、验证与提交纪律

- 普通 Markdown 和 TSX 没有更高层项目命令可表达内容修改时使用 `apply_patch`；
- TSX 修改后先用 scoped `oxfmt --write`，再运行非 fix 格式检查；
- Browser Mode 继续使用 locator 与 `expect.element` 的可重试断言；
- 只锁定公开的 HeroUI Card 基础/variant class、业务内容、ARIA 语义、顺序和目标字符消失，不锁定私有
  DOM、padding、gap、颜色值、阴影值或圆角数值；
- 当前任务引入的 format、lint、type 或 Browser 失败必须在对应任务范围内闭环；
- 预存或无关失败只报告，不借本任务修复；
- staged review 必须核对文件名、`diff --check`、完整 diff 和变更行数；
- 行为提交不得包含纯代码顺序调整；
- 行为 diff 目标低于 500 changed lines，达到 800 行或以上时停止并拆分。

## Task 0：确认并提交设计与计划文档

### 文件

- 已确认的设计文档；
- 本计划文档。

### 修改

- 保持设计状态和设计确认记录为“已确认”；
- 用户明确确认本计划后，把计划状态改为“已确认”，并记录确认原文与日期；
- 除状态和确认记录外，不改写或重排设计、计划正文。

### 检查与提交

在仓库根目录：

```bash
git diff --check -- docs/superpowers/specs/2026/08/15/2026-08-15-codex-gui-reasoning-card-style-design.md docs/superpowers/plans/2026/08/15/2026-08-15-codex-gui-reasoning-card-style.md
git add -- docs/superpowers/specs/2026/08/15/2026-08-15-codex-gui-reasoning-card-style-design.md docs/superpowers/plans/2026/08/15/2026-08-15-codex-gui-reasoning-card-style.md
git diff --cached --name-only
git diff --cached --check
git diff --cached
git commit -m 'docs(gui): design reasoning card style'
```

staged 文件必须恰好为上述两份文档。

## Task 1：用 HeroUI Card 渲染 reasoning

### Renderer 修改

在 `CommittedTranscriptSurface.tsx` 的 `ReasoningEntryRenderer`：

- `streaming` 分支外层改为 `Card variant="default"`，内容使用 `Card.Content`；
- 把现有 `Typography` 原样放入 Card 内容区，保留 `entry.title`、`role="status"`、
  `aria-live="polite"`、`aria-atomic="true"`、muted 文字和现有换行 class；
- `completed` 分支外层改为 `Card variant="default"`，内容使用 `Card.Content`；
- 保留现有 reasoning entry class 与 `MarkdownText source={entry.source}`，但直接删除承载 `•` 的
  `span` 及其双列 TUI 布局；
- 不新增固定 title、description、header 或可见状态文案；
- 不抽取只调用一次的 helper，不移动 renderer 或重排 import/分支；
- 不修改 `groupTranscriptEntries`、chunk renderer、disclosure 或其他 entry renderer。

具体 class 合并属于实现细节，但最终不得保留只服务于圆点列的 grid、column 或 gap 布局。

### Browser Mode 测试

修改现有 `ReasoningTranscriptSurface.browser.test.tsx`：

- 在流式测试中证明唯一 live status 位于 `.card.card--default` 内，且动态标题更新仍原位收敛；
- 在完成态测试中把“没有 Card”反向更新为包含 `.card.card--default`；
- 把 `•` 存在断言反向更新为受控 reasoning Card 不包含硬编码项目符号；
- 继续验证权威 Markdown 的强调、inline code、link，以及 raw reasoning 不可见；
- 保留 reasoning 切断 activity group、DOM 顺序、final 前后 disclosure 和 raw delta 忽略断言；
- 不断言具体 background、padding、gap、shadow、radius 或 HeroUI 内部嵌套 DOM；
- 不对整个 transcript 做全局 `•` 清洗断言，避免误伤 Markdown 业务内容或其他 entry。

### 格式化与验证

在 `codex-gui` 依次执行：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt --write src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx src/features/committedTranscriptSurface/__tests__/ReasoningTranscriptSurface.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
/opt/homebrew/bin/fnm exec --using-file pnpm run lint
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:parallel -- src/features/committedTranscriptSurface/__tests__/ReasoningTranscriptSurface.browser.test.tsx
```

目标测试文件属于 parallel 分区；该命令使用项目配置的 Chromium、Firefox、WebKit 三浏览器矩阵。不运行
不包含目标文件的 sequential 分区，也不缩减为单浏览器。

### staged review 与提交

在仓库根目录只暂存两个实现文件：

```bash
git add -- codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx codex-gui/src/features/committedTranscriptSurface/__tests__/ReasoningTranscriptSurface.browser.test.tsx
git diff --cached --name-only
git diff --cached --check
git diff --cached --numstat
git diff --cached
git commit -m 'feat(gui): render reasoning in cards'
```

staged 文件必须恰好为上述两个实现文件。

## 最终完成条件

- Task 0 与 Task 1 各自形成一个本地提交；
- 最终 workspace 不包含本任务遗留的未暂存或未提交变更；
- 所有计划内格式、lint、type-check 和三浏览器 Browser Mode 验证通过；
- 流式态与完成态均使用真实 HeroUI v3 default Card；
- 固定“思考”标题没有被引入，完成态硬编码 `•` 已从 JSX 删除；
- 动态标题、ARIA live、Markdown、raw reasoning 隐藏、活动分组边界、顺序、折叠和 chunk 语义不变；
- diff 不包含协议、projection、state、selector、locale、CSS、test config、其他 renderer 或纯重排；
- 没有安装依赖或操作 Git 远程。

本文档落盘不授权立即实现。用户明确回复“确认计划”后，才进入实施轮并按 Task 0、Task 1 连续执行。
