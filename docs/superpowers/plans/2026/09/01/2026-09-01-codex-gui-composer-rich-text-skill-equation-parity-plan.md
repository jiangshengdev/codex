# Codex GUI Composer RichText 宿主与 Skill/Equation 行为等价实施计划

## 状态

- 计划状态：已确认
- 日期：2026-09-01
- 当前分支：`dev`
- 当前 HEAD：`49edc94a2ad77f99945f9d93de57920e49674809`
- Lexical 基线：`v0.49.0`
- HeroUI 基线：`@heroui/react@3.2.4`、`@heroui/styles@3.2.4`
- 设计依据：[Codex GUI Composer RichText 宿主与 Skill/Equation 行为等价设计](../../../../specs/2026/09/01/2026-09-01-codex-gui-composer-rich-text-skill-equation-parity-design.md)
- 调研依据：[Composer 从 PlainTextPlugin 迁移到 RichTextPlugin 的方案评估](../../../../research/2026/09/01/2026-09-01-composer-rich-text-migration-assessment.md)

本文是实施计划，不构成当前实现授权。用户明确确认本计划后，才允许执行下述 DAG。任何
production/test 修改前，必须先把已确认设计与本计划形成独立本地 Git 提交。

## 唯一目标

把 Composer 的唯一通用编辑宿主从 PlainText 迁移到 RichText，使 Skill chip 在同一 Composer
宿主下的 selection、caret、方向键、删除、pointer、clipboard 和 focus 行为与 inline
EquationNode 等价，同时保持 Composer 的纯文本加结构化 Skill 产品合同。

## 最终 owner 状态

- `RichTextPlugin` 通过 `useRichTextSetup()` 注册 `registerRichText` 与 Dragon support，拥有
  decorator-aware 四方向 command、通用 NodeSelection 删除、paragraph/line break、Escape、
  drag/drop 和默认 clipboard handlers。
- Lexical core/selection 继续拥有 RangeSelection、NodeSelection、DOM point 映射、DOM Selection
  与视觉 caret reconcile；Composer 不建立第二份 reconcile。
- Composer 内容模型 owner 拒绝 format、禁用未批准 drag/drop、阻止闭菜单 Escape blur，并用
  TextNode/ParagraphNode transforms 把 paste、restore 和 programmatic mutation 归一化到受控树。
- Composer clipboard 高优先级 handler 继续完整消费 copy/cut/paste，并调用官方 clipboard
  primitive；RichText 的默认 handler 在这些路径不重复消费。
- Composer 原子节点 owner 只处理普通输入替换一个或多个可替换 inline atomic decorators；
  仅在 editor editable 时生效；Backspace/Delete 只由 RichText 处理。
- Skill adapter 只处理 click/Shift+click、keyed host selected/accessibility 投影、canonical data 与
  HeroUI 展示；不处理方向键、DOM caret、键盘 trigger 或内部编辑器。

## 计划前六字段证据闭包

| 字段 | 当前证据与计划映射 |
| --- | --- |
| 权威入口 | `ComposerEditor.tsx:108-164` 是生产组合入口，当前挂载 `PlainTextPlugin`、`SkillEditingPlugin`、History、typeahead 与 clipboard。Lexical `LexicalRichTextPlugin.tsx:33-54` 经 `useRichTextSetup.ts:15-21` 注册 `registerRichText`；RichText `index.ts:1342-1803` 拥有目标 command；Lexical core `LexicalSelection.ts` 拥有 selection/reconcile primitive。 |
| 已追踪链路 | 已追踪 ContentEditable mount/unmount、Enter/IME、typeahead Escape priority、Range/NodeSelection、Text/Paragraph mutation transforms、paste/clipboard、history、draft capture/restore、clear、disabled/read-only、Tooltip focus、keyed host、queue/pending restore、Browser/E2E 消费链。无 schema 或生成物链。 |
| 修改范围 | Task 1 只做插件文件/符号纯重命名；Task 2 修改 Composer 宿主、内容模型与 typeahead priority；Task 3 把 Skill-only 输入/删除 owner 改为通用 atomic input owner；Task 4 修改 SkillNode/SelectedSkillToken 的 pointer、多选、DOM/CSS、Tooltip 与可访问语义。每个 production 范围均由真实 mount 或 owner 证据支持。 |
| 验证映射 | Unit 覆盖 Skill JSON 与 draft compiler；parallel Browser 三引擎覆盖 RichText selection、content model、atomic input、focus/Tooltip/typeahead/IME/history；sequential Browser 三引擎覆盖 clipboard；完整 Browser 覆盖 queue/pending consumers；build 与 E2E 覆盖生产 bundle/应用提交；Level 2 使用当次完整 GUI URL 做 headless 真实 runtime 验收。 |
| 排除项 | `ComposerClipboardPlugin.tsx`、`composerDraft.ts`、payload/queue/protocol/package/lockfile 当前无 production 修改依据；现有 high-priority clipboard 与 compiler 已满足 owner/输出合同，计划只以 tests 验证。无 Lexical 升级、依赖安装、Lingui extraction、Rust、schema、snapshot 或 remote。 |
| 剩余未知 | 无阻断计划落盘的关键未知。非关键未知一：HeroUI trigger 的最终非交互 ARIA 载体需在 Task 4 以“无 button/math role、非 Tab stop、Skill 名称与 invalid 状态可访问”结果约束选择，不改变已确认产品结果。非关键未知二：执行时当前 GUI URL、空 Composer 与真实 Skill catalog 是否可得，只影响 Level 2 是否形成证据；缺失时不得声称完整验证。 |

## 生产修改范围

### Task 1：纯结构重命名

使用 `git mv`：

- `codex-gui/src/features/composerEditor/SkillEditingPlugin.tsx`
- → `codex-gui/src/features/composerEditor/ComposerAtomicNodePlugin.tsx`

同时只重命名导出符号和 `ComposerEditor.tsx` import/mount。不得修改 handler、priority、条件或行为。

### Task 2：RichText 宿主与受控内容模型

修改或新增：

- `codex-gui/src/features/composerEditor/ComposerEditor.tsx`
  - 用 `RichTextPlugin` 取代 `PlainTextPlugin`；
  - 挂载新的 Composer 内容模型插件；
  - 不直接依赖 `@lexical/rich-text`，不并挂两套宿主。
- `codex-gui/src/features/composerEditor/ComposerContentModelPlugin.tsx`（新增）
  - 高优先级消费 `FORMAT_TEXT_COMMAND`、`SET_TEXT_FORMAT_COMMAND`、
    `FORMAT_ELEMENT_COMMAND`；
  - TextNode transform 清除 text format/style；
  - ParagraphNode transform 清除 alignment、indent、style、text format/style，但保留 direction，
    避免破坏 RTL；
  - 高优先级消费并 `preventDefault()` RichText 的 `DRAGSTART_COMMAND`、`DRAGOVER_COMMAND`、
    `DROP_COMMAND`，不建立 drop fallback；
  - 在 typeahead 之后、RichText editor priority 之前消费闭菜单 `KEY_ESCAPE_COMMAND`，保持 editor
    focus。
- `codex-gui/src/features/composerEditor/SkillTypeaheadPlugin.tsx`
  - 显式把 `LexicalTypeaheadMenuPlugin.commandPriority` 提升为 `COMMAND_PRIORITY_HIGH`，菜单打开时
    先消费 Escape；不改 typeahead 数据、排序、ID 或插入结果。

不修改 `ComposerClipboardPlugin.tsx`：structured/plain/html paste 继续经过当前高优先级 owner，
内容模型 transform 在同一 Lexical mutation cycle 内剥离 Text/Element format。若执行证据证明
transform 无法覆盖 paste commit，停止受影响节点回到设计，不把 clipboard 改动静默加入计划。

### Task 3：Composer 全局 inline atomic 输入替换

修改 `ComposerAtomicNodePlugin.tsx`：

- 保留 high-priority `BEFORE_INPUT_COMMAND`；
- 只接受普通文本插入，不接管 `insertFromComposition` 或已禁用的 `insertFromDrop`；
- selection 必须是非空 NodeSelection，且全部节点满足可替换 inline atomic decorator 能力：
  `$isDecoratorNode(node) && node.isInline() && node.isKeyboardSelectable()`；
- `editor.isEditable()` 为 false 时直接 pass through，不改变 selection 或节点；
- 使用 Lexical NodeSelection primitive 原子替换全部已选节点，不 import 或特判 `$isSkillNode`；
- 删除 high-priority Backspace/Delete handler，使 RichText 成为 NodeSelection 删除的唯一 command
  owner；
- 不增加第二份 selection、节点来源状态或 PlainText fallback。

### Task 4：Skill/Equation 节点 adapter 对齐

修改：

- `codex-gui/src/features/composerEditor/SkillNode.ts`
  - keyed host 保持 inline atomic `span`，补稳定 class/data hook、`inline-block` 与
    `user-select:none`；
  - 使用支持 author-provided name 的非交互 `role="group"` 承载可访问名称，不复制 `role="math"`，
    不重复 override DecoratorNode 已提供的 `isInline()`。
- `codex-gui/src/features/composerEditor/SelectedSkillToken.tsx`
  - 普通 click 清除后单选；Shift+click toggle 当前 Skill 且保留其他 NodeSelection；
  - selected、accessible name、invalid/disabled 投影写到 `editor.getElementByKey(nodeKey)` 的 keyed
    host，并在更新/卸载时清理陈旧属性；
  - 删除 Enter/Space/Backspace/Delete 的 DOM-focus keyboard adapter；
  - HeroUI `Tooltip.Trigger` 显式 `tabIndex={-1}`，覆盖内部 `useFocusable` 默认值；把内层 trigger
    覆盖为 presentation role，确保最终 accessibility tree 无 button/math role；
  - 对 mouse/touch/pen 的 primary、button 0 `pointerdown` 统一 `preventDefault()`，抵消 HeroUI trigger
    的程序化可聚焦性；对应 Browser tests 必须证明兼容 click 仍形成 NodeSelection，且 editor root
    继续持有 DOM focus；
  - 保留 HeroUI Tooltip/Chip、hover 详情、`delay={0}`、selected style 与现有业务展示；
  - 不新增 double-click handler、Skill 更换器或内部编辑器。

HeroUI 3.2.4 本地源码证明 `Tooltip.Trigger` 在
`packages/react/src/components/tooltip/tooltip.tsx:179-205` 内使用 `useFocusable` 并默认输出
`role="button"`；因此只删除调用方的 `tabIndex` 不构成完成。

## 测试修改范围

- `codex-gui/src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx`
  - 删除/改写 Shift+click 强制单选、`tabindex=0`、Tab/Space/Backspace trigger、programmatic trigger
    focus 等失效合同；
  - 增加 click/Shift+click toggle、多选删除/输入替换、四方向 Range↔NodeSelection、LTR/RTL、
    邻接文本、连续 Skill、only-Skill、显式换行、soft-wrap、NodeSelection Enter 提交、闭菜单
    Escape 不 blur、Tab 跳过 Skill、hover Tooltip、double-click 无内部编辑、真实 mouse click 的
    NodeSelection+editor focus、合成 touch/pen primary `pointerdown` cancellation + compatible click
    selection、keyed host `group` role/name/invalid/selected、disabled 输入/删除/paste/selection 不变；
  - Lexical selection、DOM Selection、视觉 caret、DOM focus、Tooltip 和 content/payload 分开断言。
- `codex-gui/src/features/composerEditor/__tests__/ComposerContentModelPlugin.browser.test.tsx`（新增）
  - 独立证明 format commands、programmatic formatted Text/Paragraph mutation、drag/drop 和 Escape
    containment，不把这些底层合同塞入完整 Composer fixture。
- `codex-gui/src/features/composerEditor/__tests__/ComposerAtomicNodePlugin.browser.test.tsx`（新增）
  - 用 test-local 非 Skill inline DecoratorNode 证明能力判断是通用 atomic contract；覆盖单/多节点、
    非 atomic、disabled、composition/drop exclusion 和 RichText delete owner，不增加 production test hook。
- `codex-gui/src/__tests__/sequential/composerClipboard.browser.test.tsx`
  - 保留 same-namespace Skill round-trip、纯文本隐私和外部 plain paste；
  - 增加 multi-NodeSelection copy/cut/paste、external HTML format stripping、structured paste 归一化。
- `codex-gui/src/features/composerEditor/__tests__/composerDraft.test.ts`
  - 不修改；在 focused/final unit 中复跑现有 paragraph、line break、canonical payload、去重和
    round-trip 合同。内容模型 normalization 由挂载该插件的 Browser harness 验证。
- `codex-gui/src/features/composerEditor/__tests__/SkillNode.test.ts`
  - 不修改；在 focused/final unit 中复跑现有 node/serialization 合同，不为静态 class/data hook 增加
    unit test。

## 明确排除

- 不修改旧 research、旧设计、旧计划；它们继续作为失效历史。
- 不升级 Lexical，不新增 direct `@lexical/rich-text` dependency，不改 package/lockfile。
- 不复制 RichText 私有 helper、DOM Range、caret geometry、`Selection.modify()` 或浏览器特判。
- 不保留 PlainText/RichText 双宿主，不保留 Skill-only delete/input fallback。
- 不修改 app-server、protocol、Rust、queue/payload 类型、Lingui catalog 或 HeroUI package。
- 不安装依赖、runtime 或 browser binary，不运行 repository-level `just fmt`。
- 不使用 force、amend、squash、remote，不自动清理失败现场。
- 不在行为提交中顺手移动或排序 import、声明、函数、分支、组件或测试。
- 不启动可见浏览器、DevTools、真实 Safari 或辅助技术验收；Level 3 未获本计划授权。

## 工具链预检与精确命令

全部 frontend 命令从 `/Users/jiangsheng/cnb/codex/codex-gui` 执行。当前只读预检确认：

- `/opt/homebrew/bin/fnm` 存在；
- Node 为 fnm 的 `v24.17.0`；
- pnpm 为 fnm 路径下的 `10.34.5`，不位于 Codex runtime shim；
- `package.json` 的 unit、parallel/sequential Browser、format、lint、type-check、build、E2E scripts
  均存在；
- parallel Browser config 收集 `src/**/*.browser.test.ts(x)`，并强制 Chromium、Firefox、WebKit
  三实例 headless；sequential config 收集 `src/__tests__/sequential/**`。

执行每个命令前重复一般预检和 live package/config 核验。固定命令如下：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit -- src/features/composerEditor/__tests__/SkillNode.test.ts src/features/composerEditor/__tests__/composerDraft.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:parallel --run src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx src/features/composerEditor/__tests__/ComposerContentModelPlugin.browser.test.tsx src/features/composerEditor/__tests__/ComposerAtomicNodePlugin.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:sequential --run src/__tests__/sequential/composerClipboard.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
/opt/homebrew/bin/fnm exec --using-file pnpm run lint
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser
/opt/homebrew/bin/fnm exec --using-file pnpm run build
PLAYWRIGHT_HTML_OPEN=never /opt/homebrew/bin/fnm exec --using-file pnpm run test:e2e
```

Focused Browser 命令在文件尚未创建的 Task 中只传当时存在的目标。每次必须记录非零实际
collected/passed、三个 browser project、0 failed/0 skipped；命令在 script 后不得插入额外 `--`。
`pnpm run ci` 不作为最终替代，因为 Browser smoke 不收集 ComposerEditor 或 clipboard。

每个 task 先运行非 fix `format:oxfmt`。若仅 task allowlist 文件格式失败，执行图按失败证据插入
一次项目固化 `pnpm run format:oxfmt:fix` 节点；该命令的命令级写边界是整个 `codex-gui/**`，运行
前必须确认无 allowlist 外 frontend dirty，运行后审查完整 diff。任何 allowlist 外变化都停止并
保留现场，不自动 restore。不得改用 direct oxfmt、lint fix 或手写格式化绕过固化入口。

E2E 执行前必须确认 port `5173` 没有被无关 server 占用；`playwright.config.ts` 在本地会启动或
复用 Vite dev server。无法证明已有 server 来自当前 checkout 时停止 E2E，不把错误 server 结果
写入验证证据。

## GUI 验收级别

- Level 1：必需。focused unit/parallel Browser/sequential clipboard、完整 unit/Browser、build 与
  三浏览器 E2E 全部通过，且目标非零命中。
- Level 2：适用且属于最终完整验收。自动化通过后重新取得当次 `/gui` 或 `launch_gui` 返回的完整
  GUI URL；不得猜测、拼接或复用旧 URL。使用无 `--headed` 的 `playwright-cli open
  '<complete current GUI URL>'`，再以 `playwright-cli list --json` 证明 session 明确 non-headed。
- Level 3：本计划不适用。真实 Safari、VoiceOver、macOS 系统 IME UI 和任何可见桌面窗口需后续
  单独任务与该次窗口授权；headless WebKit 不等于真实 Safari。

Level 2 只在真实 runtime、当前完整 URL、空 Composer 和真实 catalog Skill 可用时执行。验证
插入 Skill、普通 click、Shift+click 多选/toggle、四方向、连续/only-Skill、普通输入替换、删除、
Tab skip、hover Tooltip 与 editor focus；禁止提交消息。structured payload 只由 Level 1 controller/
clipboard/draft tests 证明，因为当前生产 GUI 在不发送消息且不增加 production hook 时没有只读 payload
观察入口。Level 2 成功后只清除本轮临时内容并
核对 Composer 恢复为空；失败时保留现场与输入，不自动清理。前提缺失时标记 `unexecuted` 并让
Level 2/最终完成分支保持硬阻塞，不得用旧 URL、Level 1 或可见浏览器替代，也不得声称完整验证。

## Worktree、执行上下文与提交拓扑

本计划不创建 worktree。Task 2/3 的稳定 owner 状态是后继真实输入，Task 3/4 又会写同一个
`ComposerEditor.browser.test.tsx`；在当前 checkout 保留独立 task commit 时，独立 worktree 的集成
冲突与额外验证成本抵消并行收益。Task 4 production 分支在 `H2C` 后已就绪，但受当前 checkout 的
TASK-3 reservation 暂缓到 `A3C`；若之后获得独立 worktree 授权且冲突成本事实变化，该暂缓证据失效，
必须重算而不是保留串行惯例。

提交按以下稳定产物形成硬依赖，禁止 squash 或 amend：

1. `DOCS`：设计 + 计划，`docs: plan composer rich text migration`
2. `TASK-1`：纯结构重命名，`refactor(gui): rename atomic node plugin`
3. `TASK-2`：RichText 宿主与受控内容模型，`feat(gui): use a controlled rich text composer`
4. `TASK-3`：通用 atomic input replacement，`fix(gui): replace selected atomic composer nodes`
5. `TASK-4`：Skill/Equation adapter 对齐，`fix(gui): align skill chips with equation behavior`

每个 task 的 production 与 test 编辑可在 writeSet 不相交时并行，fan-in 后由该 task 唯一 Git owner
运行组合验证、审查完整 diff、只 stage allowlist、执行 cached diff/check 并提交。最终验证或审计
发现已提交问题时，按执行图插入新的独立修正 task/commit，禁止 amend，也不得为中间提交增加
最终状态不需要的 compatibility/fallback。

## 描述式执行 DAG

以下 `authorizationGate` 当前均为 `pending-plan-confirmation`。用户明确确认本计划后，执行前仍由
`$action-authorization` 为每个节点生成最小能力信封；未列能力默认不授权。所有节点
`subdelegation=false`，除非计划执行协调 owner 按既有授权为单个节点另建更小信封。

### Canonical 资源解析

- 所有源码、测试和文档 `readSet/writeSet` 都解析为
  `/Users/jiangsheng/cnb/codex/` 下对应的真实绝对路径；`rg` 只限节点 `readSet`，并行编辑节点的
  `git diff` 只限自己的 `writeSet`。只有 task fan-in/Git owner 可读取组合 diff。
- Git index 与 dev ref 的 canonical identity 分别是
  `/Users/jiangsheng/cnb/codex/.git/index` 和
  `/Users/jiangsheng/cnb/codex/.git/refs/heads/dev`。
- TypeScript 增量状态的 canonical write 资源是
  `/Users/jiangsheng/cnb/codex/codex-gui/node_modules/.tmp/*.tsbuildinfo`；任何运行 `tsc -b` 的节点
  都持有同一 write lock。ESLint cache 是
  `/Users/jiangsheng/cnb/codex/codex-gui/.eslintcache`。
- build 输出是 `/Users/jiangsheng/cnb/codex/codex-gui/dist/**`；E2E 的 canonical 独占资源是
  `tcp://127.0.0.1:5173`，程序输出为 `playwright-report/**` 与 `test-results/**`。Browser Mode 与 E2E
  没有已证明的共享 browser-pool 物理资源，不建立伪锁。
- Level 2 headless session 以 `playwright-cli list --json` 返回的当次 session id 作为 runtime-resolved
  canonical identity；当前 Composer draft 是该节点唯一 UI write 资源。

### DOCS 门禁

**D0 — 确认计划状态**

- `nodeId=D0`；`taskBoundary=DOCS`；`operationKind=编辑`；`outcome`：只把本计划状态改为“已确认”。
- `estimatedCost=S`；`deferralEvidence=无`；`hardPredecessors=[]`；`consumes`：用户明确计划确认；
  `produces`：confirmed plan snapshot。
- `completionEvidence`：仅状态字段变化；`readSet/writeSet`：本计划；`stateEffects`：单文档修改；
  `commandScope=apply_patch + 只读 diff`。
- `executionContext=当前 dev checkout，index 不变`；`resourceLocks=本计划绝对路径 write`；
  `owner=DOCS 文档 owner`；`verification`：正文目标/范围不漂移。
- `failureDomain=D1 及全部后继`；`replanTriggers`：确认附带目标或范围变化；
  `authorizationGate=pending-plan-confirmation`。

**D1 — 暂存工作文档**

- `nodeId=D1`；`taskBoundary=DOCS`；`operationKind=stage`；`outcome`：index 只含本设计与本计划。
- `estimatedCost=S`；`deferralEvidence=无`；`hardPredecessors=D0`，等待 confirmed snapshot；
  `consumes`：两份 docs；`produces`：reviewed staged snapshot。
- `completionEvidence`：cached name-status/diff 只含两份 allowlist，`git diff --cached --check` 通过；
  `readSet`：status/docs/index；`writeSet`：index 中两份 docs；`stateEffects`：精确 index 更新；
  `commandScope=Git 只读 + git add -- <两份 docs> + cached check`。
- `executionContext=当前 dev/index`；`resourceLocks=/Users/jiangsheng/cnb/codex/.git/index write`；
  `owner=DOCS Git owner`；
  `verification`：旧 docs/research/其他 dirty 不进入 index。
- `failureDomain=D2 及全部实现节点`；`replanTriggers`：index 污染、branch/HEAD/path 漂移；
  `authorizationGate=pending-plan-confirmation`。

**D2 — 创建 DOCS 提交**

- `nodeId=D2`；`taskBoundary=DOCS`；`operationKind=commit`；`outcome`：独立工作文档提交。
- `estimatedCost=S`；`deferralEvidence=无`；`hardPredecessors=D1`，等待 reviewed staged snapshot；
  `consumes`：staged docs；`produces`：DOCS commit。
- `completionEvidence`：commit id/stat 只含两份 docs；`readSet`：identity/index/staged diff；
  `writeSet`：本地 Git object/ref；`stateEffects`：一个本地 commit；
  `commandScope=identity 只读 + git commit -m 'docs: plan composer rich text migration' + 只读核验`。
- `executionContext=当前 dev/index`；`resourceLocks=.git/index + .git/refs/heads/dev write`；
  `owner=DOCS Git owner`；
  `verification`：禁止 amend/remote。
- `failureDomain=B0 及全部后继`；`replanTriggers`：hook、identity、snapshot 漂移；
  `authorizationGate=pending-plan-confirmation`。

### 共享基线

**B0 — frontend 执行预检**

- `nodeId=B0`；`taskBoundary=无提交`；`operationKind=验证`；`outcome`：工具、入口、branch/HEAD、
  frontend baseline 与 test discovery 可信。
- `estimatedCost=S`；`deferralEvidence=无`；`hardPredecessors=D2`；`consumes`：DOCS commit、live
  package/config；`produces`：baseline evidence。
- `completionEvidence`：fnm Node/pnpm 来源合法、适用 root/codex-gui `AGENTS.md` 已读取、scripts/config
  命中、`format:oxfmt` 通过、无计划外 frontend dirty；`readSet`：AGENTS/status/package/config/source；
  `writeSet=[]`；`stateEffects`：只读进程与
  工具普通缓存；`commandScope=只读 preflight + pnpm run format:oxfmt`。
- `executionContext=当前 dev；pnpm cwd=codex-gui`；`resourceLocks=codex-gui/** read`；
  `owner=preflight owner`；`verification`：不接受 runtime shim、0 target 或错误 cwd。
- `failureDomain=R1E 及全部实现/验证后继`；`replanTriggers`：工具缺失、入口/基线/branch 漂移；
  `authorizationGate=pending-plan-confirmation`。

### TASK-1：纯结构重命名

**R1E — 移动并重命名插件符号**

- `nodeId=R1E`；`taskBoundary=TASK-1`；`operationKind=编辑`；`outcome`：文件、export、import/mount
  改名，运行行为不变。
- `estimatedCost=S`；`deferralEvidence=无`；`hardPredecessors=B0`；`consumes`：baseline；
  `produces`：TASK-1 diff。
- `completionEvidence`：旧路径/符号无引用，新路径只有机械等价变化；`readSet`：旧插件与
  ComposerEditor；`writeSet`：两者；`stateEffects`：git mv + 普通源码修改；
  `commandScope=git mv <精确路径> + apply_patch + readSet 内 rg + git diff -- <writeSet>`。
- `executionContext=当前 dev/index 不变`；`resourceLocks=SkillEditingPlugin/ComposerAtomicNodePlugin 与
  ComposerEditor 绝对路径 write`；
  `owner=TASK-1 edit owner`；`verification`：禁止 handler/priority/条件变化。
- `failureDomain=R1V/R1S/R1C 及后继`；`replanTriggers`：发现额外消费者；
  `authorizationGate=pending-plan-confirmation`。

**R1V — 验证结构等价**

- `nodeId=R1V`；`taskBoundary=TASK-1`；`operationKind=验证`；`outcome`：格式与类型证明 rename 可解析。
- `estimatedCost=M`；`deferralEvidence=无`；`hardPredecessors=R1E`；`consumes`：TASK-1 diff；
  `produces`：format/type evidence。
- `completionEvidence`：`format:oxfmt`、`type-check` 通过；`readSet`：完整 `codex-gui/**`；`writeSet=[]`；
  `stateEffects`：验证进程/普通缓存；`commandScope=pnpm run format:oxfmt + pnpm run type-check`。
- `executionContext=codex-gui cwd`；`resourceLocks=codex-gui/** read + node_modules/.tmp/*.tsbuildinfo write`；
  `owner=TASK-1 verify owner`；
  `verification`：检查输出真实命中 browser tsconfig imports。
- `failureDomain=R1S/R1C 及后继`；`replanTriggers`：非 rename failure；
  `authorizationGate=pending-plan-confirmation`。

**R1S — 暂存 TASK-1**

- `nodeId=R1S`；`taskBoundary=TASK-1`；`operationKind=stage`；`outcome`：index 只含 rename allowlist。
- `estimatedCost=S`；`deferralEvidence=无`；`hardPredecessors=R1V`；`consumes`：verified diff；
  `produces`：reviewed staged snapshot。
- `completionEvidence`：cached diff 为纯结构 rename/symbol rename，cached check 通过；`readSet`：diff/index；
  `writeSet`：TASK-1 allowlist index；`stateEffects`：index 更新；`commandScope=git add -- <allowlist> + cached checks`。
- `executionContext=当前 dev/index`；`resourceLocks=.git/index write`；`owner=TASK-1 Git owner`；
  `verification`：不含行为变化。
- `failureDomain=R1C 及后继`；`replanTriggers`：范围外 staged/行为 diff；
  `authorizationGate=pending-plan-confirmation`。

**R1C — 提交 TASK-1**

- `nodeId=R1C`；`taskBoundary=TASK-1`；`operationKind=commit`；`outcome`：独立结构提交。
- `estimatedCost=S`；`deferralEvidence=无`；`hardPredecessors=R1S`；`consumes`：staged snapshot；
  `produces`：TASK-1 commit。
- `completionEvidence`：commit id/stat 与 allowlist 一致；`readSet`：index/diff；`writeSet`：local Git ref/object；
  `stateEffects`：一个 local commit；`commandScope=git commit -m 'refactor(gui): rename atomic node plugin' + 核验`。
- `executionContext=当前 dev/index`；`resourceLocks=.git/index + .git/refs/heads/dev write`；
  `owner=TASK-1 Git owner`；
  `verification`：no amend/remote。
- `failureDomain=H2P/H2T 及全部后继`；`replanTriggers`：commit identity/snapshot 漂移；
  `authorizationGate=pending-plan-confirmation`。

### TASK-2：RichText 与受控内容模型

**H2P — 编辑宿主与内容模型 production**

- `nodeId=H2P`；`taskBoundary=TASK-2`；`operationKind=编辑`；`outcome`：唯一 RichText 宿主、内容
  transform/command containment 与明确 typeahead Escape priority。
- `estimatedCost=L`；`deferralEvidence=无`；`hardPredecessors=R1C`；`consumes`：TASK-1 commit、设计；
  `produces`：TASK-2 production diff。
- `completionEvidence`：PlainText 无生产引用；新插件注册/卸载成对；无 direct rich-text dependency；
  `readSet`：ComposerEditor/SkillTypeahead/Lexical source；`writeSet`：ComposerEditor、
  SkillTypeaheadPlugin、新 ContentModelPlugin；`stateEffects`：三文件源码变化；
  `commandScope=apply_patch + readSet 内 rg + git diff -- <writeSet>`。
- `executionContext=当前 dev/index 不变`；`resourceLocks=TASK-2 三个 production 绝对路径 write`；
  `owner=TASK-2 production owner`；`verification`：不改 clipboard/draft/protocol。
- `failureDomain=H2F/H2V/H2S/H2C 及后继`；`replanTriggers`：需要 clipboard/compiler/依赖改动；
  `authorizationGate=pending-plan-confirmation`。

**H2T — 编写宿主与内容模型 tests**

- `nodeId=H2T`；`taskBoundary=TASK-2`；`operationKind=编辑`；`outcome`：RichText selection、format、
  drop、Escape、paste/draft 合同 tests。
- `estimatedCost=L`；`deferralEvidence=无`；`hardPredecessors=R1C`；`consumes`：设计、现有 harness；
  `produces`：TASK-2 test diff。
- `completionEvidence`：新增 ContentModel Browser 文件，更新 Composer/clipboard tests，断言分离
  selection/DOM/focus/content；`readSet`：现有 tests、Vitest docs/config；`writeSet`：
  `ComposerContentModelPlugin.browser.test.tsx`、`ComposerEditor.browser.test.tsx`、
  `composerClipboard.browser.test.tsx`；
  `stateEffects`：test 文件变化；`commandScope=apply_patch + readSet 内 rg + git diff -- <writeSet>`。
- `executionContext=当前 dev/index 不变`；`resourceLocks=TASK-2 三个 test 绝对路径 write`；
  `owner=TASK-2 test owner`；
  `verification`：不新增 production hook，不删除无关覆盖。
- `failureDomain=H2F/H2V/H2S/H2C 及后继`；`replanTriggers`：需要 fixture/public API 扩围；
  `authorizationGate=pending-plan-confirmation`。

**H2F — TASK-2 fan-in**

- `nodeId=H2F`；`taskBoundary=TASK-2`；`operationKind=fan-in`；`outcome`：production/test diff 组合且
  owner/allowlist 自洽。
- `estimatedCost=S`；`deferralEvidence=无`；`hardPredecessors=H2P,H2T`，等待两份稳定 diff；
  `consumes`：两分支 diff；`produces`：TASK-2 combined snapshot。
- `completionEvidence`：完整 diff 无 overlap 冲突、PlainText/格式/drag/Escape contracts 映射完整；
  `readSet`：TASK-2 combined diff；`writeSet=[]`；`stateEffects`：只读审查；`commandScope=git diff/rg`。
- `executionContext=当前 dev/index 不变`；`resourceLocks=TASK-2 production/test 绝对路径 read`；
  `owner=TASK-2 fan-in owner`；
  `verification`：检查 Clipboard/compiler 排除仍成立。
- `failureDomain=H2V/H2S/H2C 及后继`；`replanTriggers`：production/test 接口不一致；
  `authorizationGate=pending-plan-confirmation`。

**H2V — 验证 TASK-2**

- `nodeId=H2V`；`taskBoundary=TASK-2`；`operationKind=验证`；`outcome`：focused 三引擎与静态门禁通过。
- `estimatedCost=XL`；`deferralEvidence=无`；`hardPredecessors=H2F`；`consumes`：combined snapshot；
  `produces`：TASK-2 verification evidence。
- `completionEvidence`：focused unit、Composer+ContentModel parallel Browser、sequential clipboard 非零
  三引擎通过，format/lint/type 通过；`readSet`：完整 `codex-gui/**`；`writeSet=[]`；
  `stateEffects`：test/lint caches；`commandScope`：本计划对应 focused 命令、format、lint、type-check。
- `executionContext=codex-gui cwd`；`resourceLocks=codex-gui/** read + .eslintcache write +
  node_modules/.tmp/*.tsbuildinfo write + 本节点 child browser processes exclusive`；
  `owner=TASK-2 verify owner`；
  `verification`：0 collected/skipped 不算成功。
- `failureDomain=H2S/H2C 及后继`；`replanTriggers`：transform 不能覆盖 clipboard/restore、需生产扩围；
  `authorizationGate=pending-plan-confirmation`。

**H2S — 暂存 TASK-2**

- `nodeId=H2S`；`taskBoundary=TASK-2`；`operationKind=stage`；`outcome`：index 只含 TASK-2 allowlist。
- `estimatedCost=S`；`deferralEvidence=无`；`hardPredecessors=H2V`；`consumes`：verified snapshot；
  `produces`：reviewed staged snapshot。
- `completionEvidence`：cached name-status/diff/check 通过；`readSet`：diff/index；`writeSet`：TASK-2
  allowlist index；`stateEffects`：index 更新；`commandScope=git add -- <allowlist> + cached checks`。
- `executionContext=当前 dev/index`；`resourceLocks=.git/index write`；`owner=TASK-2 Git owner`；
  `verification`：无 package/lock/clipboard production drift。
- `failureDomain=H2C 及后继`；`replanTriggers`：范围外 staged/diff；
  `authorizationGate=pending-plan-confirmation`。

**H2C — 提交 TASK-2**

- `nodeId=H2C`；`taskBoundary=TASK-2`；`operationKind=commit`；`outcome`：RichText/content model 行为提交。
- `estimatedCost=S`；`deferralEvidence=无`；`hardPredecessors=H2S`；`consumes`：staged snapshot；
  `produces`：TASK-2 commit。
- `completionEvidence`：commit id/stat 与 allowlist 一致；`readSet`：index/diff；`writeSet`：local Git ref/object；
  `stateEffects`：一个 local commit；`commandScope=git commit -m 'feat(gui): use a controlled rich text composer' + 核验`。
- `executionContext=当前 dev/index`；`resourceLocks=.git/index + .git/refs/heads/dev write`；
  `owner=TASK-2 Git owner`；
  `verification`：no amend/remote。
- `failureDomain=A3P/A3T 及后继`；`replanTriggers`：commit snapshot 漂移；
  `authorizationGate=pending-plan-confirmation`。

### TASK-3：通用 atomic input owner

**A3P — 编辑 atomic production owner**

- `nodeId=A3P`；`taskBoundary=TASK-3`；`operationKind=编辑`；`outcome`：通用 inline atomic 输入替换，
  删除 command 完全交给 RichText。
- `estimatedCost=M`；`deferralEvidence=无`；`hardPredecessors=H2C`；`consumes`：RichText commit；
  `produces`：TASK-3 production diff。
- `completionEvidence`：无 `$isSkillNode`/Backspace/Delete/composition/drop owner，能力判断精确，
  `editor.isEditable()` 为 false 时 pass through；
  `readSet`：Atomic plugin/Lexical selection；`writeSet`：ComposerAtomicNodePlugin；
  `stateEffects`：单 production 文件修改；
  `commandScope=apply_patch + readSet 内 rg + git diff -- <writeSet>`。
- `executionContext=当前 dev/index 不变`；`resourceLocks=ComposerAtomicNodePlugin 绝对路径 write`；
  `owner=TASK-3 production owner`；`verification`：无 fallback/第二 selection。
- `failureDomain=A3F/A3V/A3S/A3C 及后继`；`replanTriggers`：需要 Skill 特判或 RichText delete 不成立；
  `authorizationGate=pending-plan-confirmation`。

**A3T — 编写 atomic tests**

- `nodeId=A3T`；`taskBoundary=TASK-3`；`operationKind=编辑`；`outcome`：通用非 Skill decorator 与
  Composer multi-selection input/delete tests。
- `estimatedCost=M`；`deferralEvidence=无`；`hardPredecessors=H2C`；`consumes`：设计、RichText commit；
  `produces`：TASK-3 test diff。
- `completionEvidence`：新增 Atomic Browser file，更新 Composer Browser，覆盖 disabled pass-through，
  不用 production hook；
  `readSet`：tests/Vitest docs；`writeSet`：Atomic Browser、ComposerEditor Browser；
  `stateEffects`：test 修改；`commandScope=apply_patch + readSet 内 rg + git diff -- <writeSet>`。
- `executionContext=当前 dev/index 不变`；`resourceLocks=TASK-3 两个 test 绝对路径 write`；
  `owner=TASK-3 test owner`；`verification`：composition/drop exclusion 与 RichText delete 分开断言。
- `failureDomain=A3F/A3V/A3S/A3C 及后继`；`replanTriggers`：需新增 production API；
  `authorizationGate=pending-plan-confirmation`。

**A3F — TASK-3 fan-in**

- `nodeId=A3F`；`taskBoundary=TASK-3`；`operationKind=fan-in`；`outcome`：atomic production/test 合并审查。
- `estimatedCost=S`；`deferralEvidence=无`；`hardPredecessors=A3P,A3T`；`consumes`：两分支 diff；
  `produces`：TASK-3 combined snapshot。
- `completionEvidence`：能力合同、selection mutation、IME/drop 排除与 tests 一致；`readSet`：combined diff；
  `writeSet=[]`；`stateEffects`：只读；`commandScope=git diff/rg`。
- `executionContext=当前 dev/index 不变`；`resourceLocks=TASK-3 production/test 绝对路径 read`；
  `owner=TASK-3 fan-in owner`；
  `verification`：RichText delete 无双 owner。
- `failureDomain=A3V/A3S/A3C 及后继`；`replanTriggers`：owner/test 不一致；
  `authorizationGate=pending-plan-confirmation`。

**A3V — 验证 TASK-3**

- `nodeId=A3V`；`taskBoundary=TASK-3`；`operationKind=验证`；`outcome`：atomic focused Browser 与静态门禁通过。
- `estimatedCost=L`；`deferralEvidence=无`；`hardPredecessors=A3F`；`consumes`：combined snapshot；
  `produces`：TASK-3 verification evidence。
- `completionEvidence`：Composer+Atomic parallel Browser 三引擎非零通过，format/lint/type 通过；
  `readSet`：完整 `codex-gui/**`；`writeSet=[]`；`stateEffects`：test/lint caches；
  `commandScope=focused parallel Browser + format/lint/type`。
- `executionContext=codex-gui cwd`；`resourceLocks=codex-gui/** read + .eslintcache write +
  node_modules/.tmp/*.tsbuildinfo write + 本节点 child browser processes exclusive`；
  `owner=TASK-3 verify owner`；`verification`：0 collected/skipped 不算成功。
- `failureDomain=A3S/A3C 及后继`；`replanTriggers`：generic contract 无法实现；
  `authorizationGate=pending-plan-confirmation`。

**A3S — 暂存 TASK-3**

- `nodeId=A3S`；`taskBoundary=TASK-3`；`operationKind=stage`；`outcome`：index 只含 TASK-3 allowlist。
- `estimatedCost=S`；`deferralEvidence=无`；`hardPredecessors=A3V`；`consumes`：verified snapshot；
  `produces`：reviewed staged snapshot。
- `completionEvidence`：cached diff/check 通过；`readSet`：diff/index；`writeSet`：TASK-3 allowlist index；
  `stateEffects`：index 更新；`commandScope=git add -- <allowlist> + cached checks`。
- `executionContext=当前 dev/index`；`resourceLocks=.git/index write`；`owner=TASK-3 Git owner`；
  `verification`：无 Skill-only fallback。
- `failureDomain=A3C 及后继`；`replanTriggers`：范围外 staged；
  `authorizationGate=pending-plan-confirmation`。

**A3C — 提交 TASK-3**

- `nodeId=A3C`；`taskBoundary=TASK-3`；`operationKind=commit`；`outcome`：atomic input 行为提交。
- `estimatedCost=S`；`deferralEvidence=无`；`hardPredecessors=A3S`；`consumes`：staged snapshot；
  `produces`：TASK-3 commit。
- `completionEvidence`：commit id/stat 与 allowlist 一致；`readSet`：index/diff；`writeSet`：local Git ref/object；
  `stateEffects`：一个 local commit；`commandScope=git commit -m 'fix(gui): replace selected atomic composer nodes' + 核验`。
- `executionContext=当前 dev/index`；`resourceLocks=.git/index + .git/refs/heads/dev write`；
  `owner=TASK-3 Git owner`；
  `verification`：no amend/remote。
- `failureDomain=S4T 及消费 TASK-3 commit 的后继`；`replanTriggers`：commit snapshot 漂移；
  `authorizationGate=pending-plan-confirmation`。

### TASK-4：Skill adapter

**S4P — 编辑 Skill production adapter**

- `nodeId=S4P`；`taskBoundary=TASK-4`；`operationKind=编辑`；`outcome`：Shift+click、keyed host、
  non-Tab Tooltip 与 mouse/touch/pen pointer focus 达到设计合同。
- `estimatedCost=L`；`deferralEvidence`：`H2C` 后并行预计只提前一个独立 production diff；TASK-3
  verification 会读取完整 frontend，若同一 checkout 已有 S4P dirty 则不能得到 TASK-3 stable snapshot，
  冲突资源是当前 checkout source state，协调成本抵消收益；暂缓 S4P 到 `A3C` 发布并释放 TASK-3
  checkout reservation，复查点为 `A3C`，若获独立 worktree 授权则证据失效；`hardPredecessors=H2C`；
  `consumes`：RichText commit、设计；
  `produces`：TASK-4 production diff。
- `completionEvidence`：无 keyboard trigger/double-click、无 button/math role、keyed host `group`
  role/name/invalid/selected cleanup 成对，primary mouse/touch/pen pointer 不夺 root focus；
  `readSet`：SkillNode/SelectedSkillToken/HeroUI 3.2.4/Equation；`writeSet`：SkillNode、SelectedSkillToken；
  `stateEffects`：两 production 文件修改；
  `commandScope=apply_patch + readSet 内 rg + git diff -- <writeSet>`。
- `executionContext=当前 dev/index 不变；TASK-3 checkout reservation 释放后运行`；
  `resourceLocks=SkillNode/SelectedSkillToken 绝对路径 write`；
  `owner=TASK-4 production owner`；`verification`：HeroUI/Chip/Tooltip 保留，无 CSS/package 改动。
- `failureDomain=S4F/S4V/S4S/S4C 及后继`；`replanTriggers`：HeroUI 无法表达非交互可访问 host；
  `authorizationGate=pending-plan-confirmation`。

**S4T — 编写 Skill parity tests**

- `nodeId=S4T`；`taskBoundary=TASK-4`；`operationKind=编辑`；`outcome`：多选、Tab/focus、hover、host
  a11y、double-click 与 multi clipboard tests。
- `estimatedCost=L`；`deferralEvidence=无`；`hardPredecessors=A3C`；`consumes`：设计、现有 fixtures；
  `produces`：TASK-4 test diff。
- `completionEvidence`：旧 trigger-focus contracts 被语义等价新断言替换；真实 mouse click 证明
  NodeSelection+editor focus，合成 touch/pen 只证明 primary `pointerdown` 被取消且 compatible click 仍选中，
  不冒充真实设备 focus transfer；覆盖 `group` role/name 与 disabled 不变，未删除 payload/invalid/hover 覆盖；
  `readSet`：Composer/clipboard tests、Vitest docs；`writeSet`：ComposerEditor Browser、sequential clipboard，
  `stateEffects`：test 修改；`commandScope=apply_patch + readSet 内 rg + git diff -- <writeSet>`。
- `executionContext=当前 dev/index 不变`；`resourceLocks=TASK-4 两个 test 绝对路径 write`；
  `owner=TASK-4 test owner`；`verification`：DOM/Lexical/focus/Tooltip 分开。
- `failureDomain=S4F/S4V/S4S/S4C 及后继`；`replanTriggers`：需新产品语义或 production hook；
  `authorizationGate=pending-plan-confirmation`。

**S4F — TASK-4 fan-in**

- `nodeId=S4F`；`taskBoundary=TASK-4`；`operationKind=fan-in`；`outcome`：Skill production/test 合并审查。
- `estimatedCost=S`；`deferralEvidence=无`；`hardPredecessors=S4P,S4T`；`consumes`：两分支 diff；
  `produces`：TASK-4 combined snapshot。
- `completionEvidence`：五项产品决定均有 production owner 与 tests；`readSet`：combined diff；
  `writeSet=[]`；`stateEffects`：只读；`commandScope=git diff/rg`。
- `executionContext=当前 dev/index 不变`；`resourceLocks=TASK-4 production/test 绝对路径 read`；
  `owner=TASK-4 fan-in owner`；
  `verification`：无旧 focus/单选/Skill-only owner 残留。
- `failureDomain=S4V/S4S/S4C 及后继`；`replanTriggers`：owner/test 不一致；
  `authorizationGate=pending-plan-confirmation`。

**S4V — 验证 TASK-4**

- `nodeId=S4V`；`taskBoundary=TASK-4`；`operationKind=验证`；`outcome`：Skill/clipboard focused 三引擎与静态门禁通过。
- `estimatedCost=XL`；`deferralEvidence=无`；`hardPredecessors=S4F`；`consumes`：combined snapshot；
  `produces`：TASK-4 verification evidence。
- `completionEvidence`：Composer parallel Browser、sequential clipboard 三引擎非零通过，format/lint/type 通过；
  `readSet`：完整 `codex-gui/**`；`writeSet=[]`；`stateEffects`：test/lint caches；
  `commandScope=focused Browser/clipboard + format/lint/type`。
- `executionContext=codex-gui cwd`；`resourceLocks=codex-gui/** read + .eslintcache write +
  node_modules/.tmp/*.tsbuildinfo write + 本节点 child browser processes exclusive`；
  `owner=TASK-4 verify owner`；`verification`：0 collected/skipped 不算成功。
- `failureDomain=S4S/S4C 及后继`；`replanTriggers`：非交互 a11y/焦点合同无法满足；
  `authorizationGate=pending-plan-confirmation`。

**S4S — 暂存 TASK-4**

- `nodeId=S4S`；`taskBoundary=TASK-4`；`operationKind=stage`；`outcome`：index 只含 TASK-4 allowlist。
- `estimatedCost=S`；`deferralEvidence=无`；`hardPredecessors=S4V`；`consumes`：verified snapshot；
  `produces`：reviewed staged snapshot。
- `completionEvidence`：cached diff/check 通过；`readSet`：diff/index；`writeSet`：TASK-4 allowlist index；
  `stateEffects`：index 更新；`commandScope=git add -- <allowlist> + cached checks`。
- `executionContext=当前 dev/index`；`resourceLocks=.git/index write`；`owner=TASK-4 Git owner`；
  `verification`：无 HeroUI/package/catalog drift。
- `failureDomain=S4C 及后继`；`replanTriggers`：范围外 staged；
  `authorizationGate=pending-plan-confirmation`。

**S4C — 提交 TASK-4**

- `nodeId=S4C`；`taskBoundary=TASK-4`；`operationKind=commit`；`outcome`：Skill parity 行为提交。
- `estimatedCost=S`；`deferralEvidence=无`；`hardPredecessors=S4S`；`consumes`：staged snapshot；
  `produces`：TASK-4 commit。
- `completionEvidence`：commit id/stat 与 allowlist 一致；`readSet`：index/diff；`writeSet`：local Git ref/object；
  `stateEffects`：一个 local commit；`commandScope=git commit -m 'fix(gui): align skill chips with equation behavior' + 核验`。
- `executionContext=当前 dev/index`；`resourceLocks=.git/index + .git/refs/heads/dev write`；
  `owner=TASK-4 Git owner`；
  `verification`：no amend/remote。
- `failureDomain=F1/F2/F3/F4/F5/F0/L2P/L2V/G6/F6`；`replanTriggers`：commit snapshot 漂移；
  `authorizationGate=pending-plan-confirmation`。

### 最终验证 fan-out/fan-in

S4C 完成后，`F1`、`F2`、`F3`、`F4`、`F5` 同时进入 ready set。`F1` 与 `F4` 都写同一组
TypeScript `.tsbuildinfo`，保持 ready 但由 canonical write lock 串行；`F3` 与 `F5` 没有已证明的共享
browser-pool 物理资源，可在槽位允许时并行，`F5` 另持有 port `5173`。其他分支读取同一稳定 commit，
只按真实 cache/output 锁调度。

**F1 — 最终静态门禁**

- `nodeId=F1`；`taskBoundary=最终验证无提交`；`operationKind=验证`；`outcome`：format/lint/type 全通过。
- `estimatedCost=L`；`deferralEvidence=无`；`hardPredecessors=S4C`；`consumes`：集成 stable commit；
  `produces`：static evidence。
- `completionEvidence`：三命令 0 exit；`readSet`：完整 frontend source/config；`writeSet=[]`；
  `stateEffects`：eslint/TS caches；`commandScope=pnpm run format:oxfmt + lint + type-check`。
- `executionContext=codex-gui cwd`；`resourceLocks=codex-gui/** read + .eslintcache write +
  node_modules/.tmp/*.tsbuildinfo write`；`owner=final static owner`；
  `verification`：不得 fix/放宽。
- `failureDomain=F0/L2P/L2V/G6/F6`；`replanTriggers`：计划内源码问题插入独立修正 commit；
  `authorizationGate=pending-plan-confirmation`。

**F2 — 完整 unit**

- `nodeId=F2`；`taskBoundary=最终验证无提交`；`operationKind=验证`；`outcome`：完整 unit suite 通过。
- `estimatedCost=L`；`deferralEvidence=无`；`hardPredecessors=S4C`；`consumes`：stable commit；
  `produces`：unit evidence。
- `completionEvidence`：实际非零文件/tests，0 failed/skipped；`readSet`：frontend unit source/config；
  `writeSet=[]`；`stateEffects`：Vitest caches；`commandScope=pnpm run test:unit`。
- `executionContext=codex-gui cwd`；`resourceLocks=codex-gui source/tests read + 本节点 unit child process
  exclusive`；`owner=final unit owner`；
  `verification`：记录实际 totals。
- `failureDomain=F0/L2P/L2V/G6/F6`；`replanTriggers`：计划内问题插入修正；
  `authorizationGate=pending-plan-confirmation`。

**F3 — 完整 Browser**

- `nodeId=F3`；`taskBoundary=最终验证无提交`；`operationKind=验证`；`outcome`：parallel+sequential
  Browser 在 Chromium/Firefox/WebKit 全通过。
- `estimatedCost=XL`；`deferralEvidence=无`；`hardPredecessors=S4C`；`consumes`：stable commit；
  `produces`：Browser evidence。
- `completionEvidence`：两 config 均非零收集，三实例 0 failed/skipped，目标 Composer/clipboard 文件在
  实际清单；`readSet`：Browser source/config；`writeSet=[]`；`stateEffects`：Vitest/Playwright caches；
  `commandScope=pnpm run test:browser`。
- `executionContext=codex-gui cwd`；`resourceLocks=codex-gui Browser source/config read + 本节点 child
  browser process ids exclusive`；
  `owner=final Browser owner`；`verification`：headless，不开报告/窗口。
- `failureDomain=F0/L2P/L2V/G6/F6`；`replanTriggers`：计划内问题插入修正；
  `authorizationGate=pending-plan-confirmation`。

**F4 — production build**

- `nodeId=F4`；`taskBoundary=最终验证无提交`；`operationKind=验证`；`outcome`：production bundle 成功。
- `estimatedCost=L`；`deferralEvidence=无`；`hardPredecessors=S4C`；`consumes`：stable commit；
  `produces`：build evidence。
- `completionEvidence`：`pnpm run build` 0 exit 且生产入口命中；`readSet`：frontend source/config；
  `writeSet`：`codex-gui/dist/**`（程序输出）；`stateEffects`：build artifacts；`commandScope=pnpm run build`。
- `executionContext=codex-gui cwd`；`resourceLocks=codex-gui/** read + node_modules/.tmp/*.tsbuildinfo write +
  dist/** write`；`owner=final build owner`；
  `verification`：不把 build 代替 tests。
- `failureDomain=F0/L2P/L2V/G6/F6`；`replanTriggers`：计划内问题插入修正；
  `authorizationGate=pending-plan-confirmation`。

**F5 — Level 1 E2E**

- `nodeId=F5`；`taskBoundary=最终验证无提交`；`operationKind=验证`；`outcome`：三浏览器应用级
  plain submit/clear 回归通过。
- `estimatedCost=XL`；`deferralEvidence=无`；`hardPredecessors=S4C`；`consumes`：stable commit、可信
  port/server preflight；`produces`：E2E evidence。
- `completionEvidence`：三 projects 非零、0 failed/0 skipped，HTML report 不自动打开；
  `readSet`：e2e/app source/config；
  `writeSet`：Playwright artifacts（程序输出）；`stateEffects`：headless browsers、Vite dev server、artifacts；
  `commandScope=PLAYWRIGHT_HTML_OPEN=never pnpm run test:e2e`。
- `executionContext=codex-gui cwd`；`resourceLocks=codex-gui e2e/app source read +
  tcp://127.0.0.1:5173 write + playwright-report/** write + test-results/** write + 本节点 child browser
  process ids exclusive`；
  `owner=final E2E owner`；`verification`：existing server 必须来自当前 checkout。
- `failureDomain=F0/L2P/L2V/G6/F6`；`replanTriggers`：port/tool/runtime 不可信或计划内问题；
  `authorizationGate=pending-plan-confirmation`。

**F0 — 自动化 fan-in**

- `nodeId=F0`；`taskBoundary=最终验证无提交`；`operationKind=fan-in`；`outcome`：五路自动化证据完整。
- `estimatedCost=S`；`deferralEvidence=无`；`hardPredecessors=F1,F2,F3,F4,F5`；`consumes`：全部 evidence；
  `produces`：automated acceptance snapshot。
- `completionEvidence`：无失效/缺失证据；`readSet`：五路结果/最终 commit；`writeSet=[]`；
  `stateEffects`：只读汇总；`commandScope=结果审查 + git status`。
- `executionContext=当前 dev`；`resourceLocks=evidence read`；`owner=final fan-in owner`；
  `verification`：不能用 smoke/exit 0 代替目标命中。
- `failureDomain=L2P/L2V/G6/F6`；`replanTriggers`：任一证据失败或被修正 commit 失效；
  `authorizationGate=pending-plan-confirmation`。

**L2P — headless 真实 runtime 前提分类**

- `nodeId=L2P`；`taskBoundary=最终验收无提交`；`operationKind=调查`；`outcome`：把 Level 2 前提分类为
  available 或以正面证据证明哪项 unavailable。
- `estimatedCost=S`；`deferralEvidence=无`；`hardPredecessors=F0`；`consumes`：automated snapshot、当次
  runtime state；`produces`：可复核 prerequisite classification。
- `completionEvidence`：核验 `playwright-cli` 已存在；available 必须同时给出当次完整 GUI URL 与真实
  runtime；unavailable 必须给出精确
  缺口且未启动交互。分类完成不构成 Level 2 passed；`readSet`：当前 GUI/runtime state；`writeSet=[]`；
  `stateEffects`：只读 preflight；`commandScope=GUI URL 只读取得 + playwright-cli 存在性/list 只读核验`。
- `executionContext=当前真实 Codex runtime`；`resourceLocks=当前 GUI/runtime state read`；
  `owner=Level 2 preflight owner`；`verification`：禁止旧 URL、可见 fallback、安装或消息提交。
- `failureDomain=L2V/F6`；`replanTriggers`：runtime 在分类后变化；
  `authorizationGate=pending-plan-confirmation-and-current-runtime`。

**L2V — headless 真实 runtime 验收**

- `nodeId=L2V`；`taskBoundary=最终验收无提交`；`operationKind=验证`；`outcome`：真实 Composer 完成
  Skill/RichText 行为矩阵且不提交消息。
- `estimatedCost=L`；`deferralEvidence=无`；`hardPredecessors=L2P`，且只消费 available classification；
  `consumes`：当次完整 GUI URL 与真实 runtime；`produces`：Level 2 passed evidence。
- `completionEvidence`：创建 session 后先证明 session non-headed、Composer 为空且真实 Skill catalog 可用，
  任一前提不成立时在交互前失败并硬阻塞；前提成立后列出的 selection/focus/Tooltip 场景通过，成功后
  Composer 恢复为空；`readSet`：当前 GUI/runtime state；`writeSet`：本轮临时 Composer draft/selection；
  `stateEffects`：headless browser session 与临时 UI state；
  `commandScope=playwright-cli open '<current complete URL>' + list --json + 有界交互`。
- `executionContext=当前真实 Codex runtime`；`resourceLocks=当前 Composer draft write + runtime-resolved
  playwright-cli session id write`；
  `owner=Level 2 owner`；`verification`：禁止旧 URL、可见 fallback、消息提交。
- `failureDomain=F6 完整验证声明`；`replanTriggers`：非空 draft、catalog/session 缺失、行为失败或
  available classification 失效；
  `authorizationGate=pending-plan-confirmation-and-current-runtime`。

若 `L2P` 证明前提 unavailable，`L2V` 因缺少 required stable input 进入硬阻塞而不是 completed；`F6`
保持等待，但下述 `G6` 仍独立执行。执行协调 owner 只能报告“实现、Level 1 与 Git 审计已完成，
Level 2 未执行，计划验证不完整”。前提后来可得时重新激活 `L2V`。不得用 `unexecuted` 解锁 `F6`。

**G6 — 独立 Git/提交审计**

- `nodeId=G6`；`taskBoundary=最终审计无提交`；`operationKind=审查`；`outcome`：提交拓扑、workspace
  与 index 可审计，不依赖 Level 2 是否可用。
- `estimatedCost=S`；`deferralEvidence=无`；`hardPredecessors=F0`；`consumes`：全部 commits 与 Level 1
  evidence；`produces`：Git audit evidence。
- `completionEvidence`：DOCS+四 task commits 独立、无 amend/squash/remote、index clean、无计划外 tracked
  diff；`readSet`：local log/status/diffs/evidence；`writeSet=[]`；
  `stateEffects`：只读；`commandScope=local git log/status/show/diff checks`。
- `executionContext=当前 dev`；`resourceLocks=.git/index + .git/refs/heads/dev + commits/evidence read`；
  `owner=final audit owner`；
  `verification`：报告任务、提交、Level 1/2/3、实际 totals。
- `failureDomain=最终完成声明`；`replanTriggers`：提交/状态/证据不一致；
  `authorizationGate=pending-plan-confirmation`。

**F6 — 完整成功 fan-in**

- `nodeId=F6`；`taskBoundary=最终完成无提交`；`operationKind=fan-in`；`outcome`：只有 Level 1、Level 2
  与 Git 审计全部通过时形成完整成功证据。
- `estimatedCost=S`；`deferralEvidence=无`；`hardPredecessors=L2V,G6`；`consumes`：Level 2 passed 与 Git
  audit evidence；`produces`：complete final evidence。
- `completionEvidence`：所有 task/commit/Level 1/Level 2 证据有效，Level 3 明确未授权且不属于本计划；
  `readSet`：全部最终 evidence；`writeSet=[]`；`stateEffects`：只读汇总；`commandScope=结果审查`。
- `executionContext=当前 dev`；`resourceLocks=final evidence read`；`owner=final success owner`；
  `verification`：不得把 blocked/unexecuted 降级成 passed。
- `failureDomain=最终完成声明`；`replanTriggers`：任一证据失效；
  `authorizationGate=pending-plan-confirmation`。

## Ready set、关键路径与漏并行审计

- 计划确认后的初始 ready set 只有 `D0`；文档提交是所有实现的硬门禁。
- `R1E→R1V→R1S→R1C` 是纯结构前置；Task 2 消费其稳定 import/path。
- Task 2 内 `H2P` 与 `H2T` 可并行，fan-in 后验证/提交；Task 3、Task 4 同理。
- `H2C→A3C` 是硬依赖：移除 Skill delete owner 前必须已有 RichText delete owner。
- `S4P` 在 `H2C` 后已 ready，但同一 checkout 的 TASK-3 source-state reservation 构成完整暂缓证据；
  `S4T` 真实消费 TASK-3 multi-atomic test contract，保留 `A3C` 硬依赖。`A3C` 后二者并行。
- `S4C` 后静态、unit、Browser、build、E2E 五路 fan-out；`F1/F4` 只因同一 tsbuildinfo write lock
  不能同时运行，`F3/F5` 无伪 browser-pool 锁并可按槽位并行。
- `F0` 后 `L2P` 与 `G6` 同时 ready；`G6` 不依赖 Level 2，完整成功 `F6` 才 fan-in `G6` 与 `L2V`。
- 粗粒度关键路径预计为
  `D0-D2 → B0 → TASK-1 → TASK-2 → TASK-3 → TASK-4 → F3/F5 → F0 → L2P → L2V → F6`。
- 没有可由独立 worktree 提前形成且不会与中央 mount/test/owner 冲突的行为提交；因此不创建 worktree，
  不是以任务编号代替并行判断。

计划执行期间的节点状态、失败吸收、动态修正节点、资源锁和实际并行证据记录在执行上下文，不回写
本计划。任一计划内验证失败都先作为新证据吸收；只要存在已授权、安全且能产生新证据的下一步，
继续插入诊断/修正/验证节点。只有执行图契约定义的正面硬阻塞条件成立时才停止受影响失败域。
