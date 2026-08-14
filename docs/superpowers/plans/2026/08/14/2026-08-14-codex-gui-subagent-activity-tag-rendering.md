# Codex GUI 子代理活动 Tag 渲染实施计划

状态：已确认

日期：2026-08-14

实施基线：`dev @ 79f5e8988d99d1a8c7405d9760d7d3547a48c133`

对应设计：[Codex GUI 子代理活动 Tag 渲染设计](../../../../specs/2026/08/14/2026-08-14-codex-gui-subagent-activity-tag-rendering-design.md)

设计确认：用户先后确认逐条保留时间线、Tag 保留原句位置、详情使用纯 GUI 层级，并在发现
HeroUI TagGroup 原生焦点语义后明确选择保留该焦点行为。设计已于当前聊天中确认。

用户于 2026-08-14 回复“开始进行”，明确进入实施，视为确认本计划。

## 目标

只修改 committed transcript 的 GUI renderer：删除活动行的终端式项目符号、树形连接符和占位布局，
把 `SubAgentActivity` 三类标题中原先由反引号包裹的完整 `agentPath` 改为 HeroUI v3
`TagGroup` / `Tag`，同时保持时间顺序、本地化语序、详情、折叠和 chunk 行为不变。

完成状态必须由 Browser Mode 测试证明真实 HeroUI Tag 已进入 DOM、保留原生键盘焦点、没有选择或动作
能力，并且活动区域不再出现目标终端符号。仅删除字符串或用 CSS 隐藏符号不构成完成。

## 根因与最小实现 seam

根因是 `CommittedTranscriptSurface.tsx` 的 GUI 视觉表达：

- `ActivityEntryRow` 直接渲染行首项目符号和详情树形连接符；
- `ActivityEntryRenderer.copyText` 把三类 `agentPath` 与反引号拼成单一字符串；
- `ActivityEntryRow` 只接受字符串标题，无法在本地化句子内部嵌入 Tag。

现有 stable `TranscriptEntryView` 已携带 `entry.type`、结构化 title copy 和完整 `agentPath`。因此只需
修改 renderer；不得修改 generated protocol、projection、transcript state、selector、identity、chunk
或 disclosure。

## 精确文件范围

允许修改：

- `docs/superpowers/specs/2026/08/14/2026-08-14-codex-gui-subagent-activity-tag-rendering-design.md`
- `docs/superpowers/plans/2026/08/14/2026-08-14-codex-gui-subagent-activity-tag-rendering.md`
- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx`
- `codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx`
- `codex-gui/src/locales/en.po`
- `codex-gui/src/locales/zh-CN.po`

后两份 catalog 只能由现有 `messages:extract` 产生结构变化；提取后只允许补目标新 message 的简体中文
`msgstr`。若实现证明必须修改此列表外文件，停止并回到计划确认，不得把 renderer 问题扩大到协议、
projection 或 transcript state。

## 非目标

- 不修改 Rust、app-server、schema、generated TypeScript 或 runtime validator；
- 不修改 projection、transcript state、selector、threadRuntime 或共享 fixture/builder；
- 不修改外层 intermediate-updates disclosure；
- 不把 collab receiver、model、reasoning effort、thread ID 或状态摘要变成 Tag；
- 不合并重复活动，不按代理聚合，不改变活动顺序；
- 不新增选择、删除、点击、导航、tooltip、popover、图标、emoji、avatar 或 spinner；
- 不把 TagGroup 标记为 disabled，不覆盖 `tabIndex` 或隐藏焦点样式；
- 不增加依赖、package script、浏览器二进制、E2E 或截图测试；
- 不运行协议生成、validator 生成或 `messages:extract:clean`；
- 不操作 Git 远程。

## Preflight

计划确认并进入实现后，在仓库根目录先执行只读核验：

```bash
git branch --show-current
git rev-parse HEAD
git status --short
git diff -- docs/superpowers/specs/2026/08/14/2026-08-14-codex-gui-subagent-activity-tag-rendering-design.md docs/superpowers/plans/2026/08/14/2026-08-14-codex-gui-subagent-activity-tag-rendering.md
git diff --cached --name-only
git check-ignore -v -- docs/superpowers/specs/2026/08/14/2026-08-14-codex-gui-subagent-activity-tag-rendering-design.md
git check-ignore -v -- docs/superpowers/plans/2026/08/14/2026-08-14-codex-gui-subagent-activity-tag-rendering.md
test -x /opt/homebrew/bin/fnm
test -d codex-gui/node_modules
```

要求：

- 当前分支预期为 `dev`，计划基线为上述 HEAD；HEAD 变化时重新核验目标文件，不盲目沿用旧行号；
- 当前已知 workspace 变化应只有本轮设计与计划文档；发现其他变更时保留并报告，不覆盖；
- 文档不得被 ignore，禁止强制暂存 ignore 文件；
- 缺少 fnm、现有 `node_modules`、Node、pnpm 或 Browser 运行条件时停止，告知用户自行准备，助手不得
  安装。

在 `codex-gui` 中只读确认工具来源：

```bash
/opt/homebrew/bin/fnm exec --using-file node --version
/opt/homebrew/bin/fnm exec --using-file pnpm --version
```

所有 pnpm 命令均使用相同 fnm-backed 形式，cwd 固定为 `codex-gui`。

## 编辑与验证纪律

- 普通 TSX 和 Markdown 没有更高层项目命令可以表达时使用 `apply_patch`；
- catalog 的 source references、msgid、obsolete 标记和排序必须由 `messages:extract` 生成；
- Browser 测试使用 locator 与 `expect.element` 的可重试断言；
- 测试只锁定 TagGroup 公开无障碍语义、业务文案、顺序和符号消失，不锁定 HeroUI 私有 class、内部 DOM、
  padding、gap、颜色或阴影；
- 当前任务引入的 format、lint、type、catalog 或 Browser 失败必须在同一任务范围内修正；
- 禁止通过 skip、ignore、豁免、放宽断言、删除覆盖、CSS 隐藏字符或修改检查基线通过验证；
- 预存或无关失败只报告，不借本任务修复；
- 行为提交不得包含 import、声明、函数、组件或分支的纯顺序调整；若确需纯重排，停止并补独立任务；
- 本次行为 diff 目标低于 500 changed lines，达到 800 行或以上时停止并拆分。

## Task 0：确认并提交设计与计划文档

### 文件

- 已确认的设计文档；
- 本计划文档。

### 修改

- 保持设计状态为“已确认”，并保留第四项焦点决策；
- 用户明确确认本计划后，将计划状态改为“已确认”，记录计划确认；
- 除状态和确认记录外不重排正文。

### 检查与提交

在仓库根目录：

```bash
git diff --check -- docs/superpowers/specs/2026/08/14/2026-08-14-codex-gui-subagent-activity-tag-rendering-design.md docs/superpowers/plans/2026/08/14/2026-08-14-codex-gui-subagent-activity-tag-rendering.md
git add -- docs/superpowers/specs/2026/08/14/2026-08-14-codex-gui-subagent-activity-tag-rendering-design.md docs/superpowers/plans/2026/08/14/2026-08-14-codex-gui-subagent-activity-tag-rendering.md
git diff --cached --name-only
git diff --cached --check
git diff --cached
git commit -m 'docs(gui): design subagent activity tags'
```

staged 文件必须恰好为这两份文档。

## Task 1：把子代理路径改为 HeroUI Tag

### Renderer 修改

在 `CommittedTranscriptSurface.tsx`：

- 从 `@heroui/react` 使用 HeroUI v3 `TagGroup` 和 `Tag`；使用 compound 结构
  `TagGroup > TagGroup.List > Tag`；
- 新增 renderer-local 的 `AgentPathTag`，使用
  `TagGroup selectionMode="none" size="sm" variant="default"`；组的非可见无障碍名称直接使用完整
  `agentPath`，不新增可见 Label 或中文描述文本；
- `Tag` 使用完整 `agentPath` 作为 children、稳定 `id` 和 `textValue`；不传 `isDisabled`、selection、
  remove、press 或 navigation props，保留 HeroUI 原生焦点；
- 把 activity copy renderer 分成结构化 React 内容与普通字符串两条内部路径：仅
  `agentStarted`、`agentInteracted`、`agentInterrupted` 使用 Lingui `<Trans>` 组件插值嵌入
  `AgentPathTag`；其他 title/detail 继续复用现有 `copyText`；
- 三类 rich message 保持当前业务含义，并允许 locale 移动 Tag placeholder，确保中文仍为“已与 + Tag +
  交互”的语序；
- `ActivityEntryRow` 接受结构化 title/detail 内容。可访问名称改由 `aria-labelledby` 关联可见
  `Card.Title`，使文案和 Tag 文本共同形成 article 名称，不维护第二份易漂移字符串；
- 删除行首项目符号节点、详情树形连接符节点和固定宽度空占位；详情继续使用
  `Card.Description`，只通过逻辑方向缩进、间距和次级文字 token 表达从属关系；
- 保留 `Card variant="transparent"`、现有 activity group、entry key、chunk 组件和 disclosure；
- 不做纯代码重排，不改变 renderer 之外的数据和控制流。

### Lingui catalog

源码修改完成后，在 `codex-gui` 运行：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run messages:extract
```

随后：

- 只补三个目标 rich message 在 `zh-CN.po` 中的翻译，并保留 component placeholder；
- 不手写 source references、msgid、obsolete 标记或排序；
- 不使用 `messages:extract:clean`，避免清除无关 obsolete message；
- 再运行一次相同的 `messages:extract`，确认 catalog 结构稳定；
- 检查 `en.po`、`zh-CN.po` diff 仅来自三个目标 message 的替换与翻译。

项目没有 `messages:compile` script；不得杜撰或运行不存在的命令。

### Browser Mode 测试

修改现有 `CommittedTranscriptSurface.browser.test.tsx`，复用当前 shared projection builders：

- 三种 sub-agent activity article 的 accessible name 不含反引号，且完整业务文案和路径仍存在；
- 在每个目标 article 内通过公开 role/name 定位 TagGroup 与 Tag，验证完整路径和只读语义；
- 验证 Tag 保留原生 `tabIndex="0"`，但没有 selected、remove button、link、press action 或额外动作控件；
- 增加一个重复 interacted fixture，断言两条活动均存在且顺序不变；
- 英文和简体中文 locale 分别验证 Tag placeholder 位于原句位置，不重建 semantic view；
- 受控活动区域不再包含行首项目符号、树形连接符或路径两侧反引号；不得对 raw detail 做全局字符清洗
  断言；
- 保留 spawn prompt、model、reasoning effort 和状态详情，并证明 receiver 没有被改为 Tag；
- 保留 message/status 分组边界、final 前后折叠、展开恢复顺序和跨 chunk 断言；
- 不修改外层 disclosure 文案断言。

若真实 HeroUI DOM 与已确认的焦点或只读契约不一致，停止并回到设计；不得用 disabled、CSS、私有 DOM
选择器或放宽测试绕过。

### 格式化与验证

在 `codex-gui` 依次执行：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt --write src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt --check src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxlint src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm exec eslint --cache src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:parallel -- src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx
```

目标 Browser 文件属于 parallel 分区；该命令使用项目配置的 Chromium、Firefox、WebKit 三浏览器矩阵。
不运行不包含目标文件的 sequential 分区，也不缩减为单浏览器。

### staged review 与提交

在仓库根目录只暂存四份实现文件：

```bash
git add -- codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx codex-gui/src/locales/en.po codex-gui/src/locales/zh-CN.po
git diff --cached --name-only
git diff --cached --check
git diff --cached --numstat
git diff --cached
git commit -m 'feat(gui): render subagent paths as tags'
```

staged 文件必须恰好为上述四份文件。catalog 没有实际 diff 时不得强行暂存或提交空变化。

## 最终完成条件

- Task 0 与 Task 1 各自形成一个本地提交；
- 最终 workspace 不包含本任务遗留的未暂存或未提交变更；
- 所有计划内验证通过，或预存失败已被证据明确区分且未被本任务隐藏；
- GUI 中目标活动不再显示终端符号，完整路径由真实 HeroUI Tag 呈现；
- 重复活动、locale 语序、详情层级、折叠、顺序和 chunk 边界符合设计；
- Tag 保留原生键盘焦点，但没有选择、删除、点击、动作或导航；
- diff 不包含协议、projection、transcript state、外层 disclosure 或无关重排。

本文档落盘不授权立即实现。用户明确回复“确认计划”后，才进入实现轮并按 Task 0、Task 1 连续执行。
