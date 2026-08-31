# Codex GUI Composer Skill Chip 四方向原子导航正式修复计划

日期：2026-08-31

状态：待确认

计划类型：正式产品修复；以完整达成已确认设计为完成条件

依据设计：[Codex GUI Composer Skill Chip 四方向原子导航设计](../../../specs/2026/08/31/2026-08-31-codex-gui-composer-skill-chip-four-direction-navigation-design.md)

依据调研：[Composer skill chip selection transition diagnostics](../../../research/2026/08/31/2026-08-31-composer-skill-chip-selection-transition-diagnostics.md)

历史诊断计划：[Codex GUI Composer Skill Chip 原生目标探测诊断计划](2026-08-31-codex-gui-composer-skill-chip-native-target-diagnostic-plan.md)

## 唯一目标与完成定义

正式修复 Composer 中 skill chip 的四方向键盘导航，使 chip 在显式换行和 CSS soft-wrap 中成为原子“超长字符”停靠点，并同时修复现有多行左右跳过 chip 或边界落点错误的问题。

本计划不是新的阶段性调查计划。只有以下用户可见结果全部成立，计划才算完成：

- 普通 collapsed caret 的无修饰方向键原生目标命中 chip 时，一次按键激活该 chip 的唯一 `NodeSelection`；
- 原生目标位于 chip 外的普通字符、空白、行首或行尾时，skill handler 不调用 `preventDefault()`、不写 selection、不吸附到 chip，最终保持浏览器原生 textarea 式结果；
- chip 已选中时，`ArrowLeft`/`ArrowUp` 一次落到视觉左边界，`ArrowRight`/`ArrowDown` 一次落到视觉右边界；下一次按键才继续原生移动；
- 显式换行、soft-wrap、窄容器、动态宽度、连续 chip、LTR/RTL 在 Chromium、Firefox、WebKit 中遵守同一契约；
- typeahead 上下导航、focus、删除、输入替换、clipboard、undo/redo、draft/capture、queue 和提交 payload 不回退；
- 带 `Shift`、`Option/Alt`、`Command/Ctrl` 的方向键不进入新语义。

红色回归、候选命中算法或单浏览器绿色都只是中间证据，不能作为本计划完成条件。若三浏览器无法在设计约束内稳定区分“命中 chip”与“chip 外目标”，本计划失败并停止，不能把该结果表述为完成，也不能增加吸附、距离阈值、logical sibling、浏览器跳过或静默 fallback。

## 当前事实闭包

- 创建本计划前核验的 `HEAD` 为 `0c96ae50efb41a1efbb7ffa1e1830c86d626641b`，当时工作树与 Git index 均为空；创建后只有本计划文件为 untracked，Git index 与其他 tracked 状态仍为空。
- stash object `5f6876cf92c6cc18d0d257e5c3dd2cba755d4ec4`（tree `870bf21b90139644705c168213229ee365d0b44c`）是 2026-08-31 17:01:34 保存的本轮调查现场；它在创建本计划时显示为 `stash@{0}`，只包含：
  - `codex-gui/src/features/composerEditor/ComposerEditor.tsx` 的临时 selection diagnostic hook；
  - `codex-gui/src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx` 的临时采样用例；
  - `docs/superpowers/reports/2026/08/31/2026-08-31-codex-gui-composer-skill-chip-native-target-diagnostic/vitest-evidence.json`。
- 本计划不 `apply`、`pop`、`drop`、修改或删除该 stash object。临时代码不在当前工作树，因此没有“恢复整个文件”或“删除整个文件”的任务。
- 当前 production owner 是 `codex-gui/src/features/composerEditor/SkillEditingPlugin.tsx`。它只注册 `KEY_ARROW_LEFT_COMMAND` 和 `KEY_ARROW_RIGHT_COMMAND`，并用 `selectPrevious()`/`selectNext()` 从唯一 Skill `NodeSelection` 退出。
- 当前正式 Browser 测试只覆盖同行 LTR/RTL 左右两步停靠；进入、退出和第二步被合并在同一用例中，没有显式换行、soft-wrap、chip 外原生反例或上下方向覆盖。
- Lexical 0.49 command listener 在 update 内运行；`COMMAND_PRIORITY_BEFORE_EDITOR` 可早于 `PlainTextPlugin` 的 editor-priority 左右 handler，同时晚于 typeahead 使用的更高优先级 owner。
- Lexical 自身使用 DOM `Selection.modify()` 取得 character/line 原生目标，并在 rich-text block decorator 导航中采用“保存 DOM selection、同步探测、恢复”的形状；现有 rich-text 实现排除 inline decorator，不能直接复用为产品结果。
- 已选中 chip 的准确前后边界可用其 parent element 的 child index 表示，避免把 caret 塞进相邻 Text node 后再猜视觉位置。
- 当前 fnm 环境为 Node `v24.17.0`、pnpm `10.34.5`，pnpm 路径为 `/Users/jiangsheng/.local/share/fnm/node-versions/v24.17.0/installation/bin/pnpm`，不在 Codex runtime shim 下。
- `codex-gui/package.json` 的权威入口包括 `format:oxfmt`、`lint`、`type-check` 和 `test:browser:parallel`；parallel Browser config 收集 `src/**/*.browser.test.ts(x)`，以 headless Playwright provider 运行 Chromium、Firefox、WebKit。

## 修改范围

正式产品写入只允许：

- `codex-gui/src/features/composerEditor/SkillEditingPlugin.tsx`
- `codex-gui/src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx`

计划文档写入只允许：

- 本计划文件

不修改：

- `ComposerEditor.tsx`、`SkillNode.ts`、`SelectedSkillToken.tsx`、`SkillTypeaheadPlugin.tsx`；
- Lexical、HeroUI、package、Vitest config、生成物、locale、queue、draft 或 protocol；
- 已确认设计、历史诊断计划、research 与 stash object `5f6876cf92c6cc18d0d257e5c3dd2cba755d4ec4`。

如果正式修复确实需要计划外 production 文件、公开接口、依赖、配置或生成链，先停止并回到计划确认；不能借 helper 抽取、fallback 或测试便利扩大范围。

## 正式实现约束

### 四方向 command owner

在 `SkillEditingPlugin` 中统一注册四个无修饰方向键：

- `KEY_ARROW_LEFT_COMMAND`
- `KEY_ARROW_RIGHT_COMMAND`
- `KEY_ARROW_UP_COMMAND`
- `KEY_ARROW_DOWN_COMMAND`

skill handler 使用 `COMMAND_PRIORITY_BEFORE_EDITOR`，先检查 typeahead 未消费后的 selection；任一修饰键存在、selection 非 collapsed `RangeSelection`/唯一 Skill `NodeSelection`、root 或 node 不可用时立即返回 `false`。

### 已选中 chip 的退出

对唯一 Skill `NodeSelection`：

- 读取当前 parent 的 writing direction；
- 用 SkillNode 在 parent 中的 child index 建立准确的 collapsed element-point `RangeSelection`；
- `Left`/`Up` 映射到视觉左边界，`Right`/`Down` 映射到视觉右边界；LTR/RTL 只改变 visual-to-logical 映射，不改变产品语义；
- 建立边界后 `preventDefault()` 并结束本次按键，不继续执行 line/character move。

不得继续依赖相邻 Text node 的 `selectPrevious()`/`selectNext()` 作为最终边界，因为它会把 selection 位置绑定到 sibling 内容与多行布局。

### 普通 caret 的原生目标命中

正式测试必须先在三浏览器通过平台前提门禁，证明候选原生探测可稳定取得 character/line 目标、区分 chip rect 与 chip 外目标、同步恢复原始 DOM selection，并且不改变 focus/scroll。只有该门禁成立，production 才采用以下已经被证据闭合的探测形状；门禁失败时不得开始 production 编辑或改用设计禁止的 fallback。

对无修饰 collapsed `RangeSelection`：

1. 验证 Lexical selection、DOM selection、editor root 与 focus 属于同一当前编辑器；
2. 保存原始 DOM anchor/focus 与 caret rect；
3. 左右按 character、上下按 line 调用原生 `Selection.modify()` 探测目标；
4. 读取探测后的 DOM point、caret rect、实际 Skill host rect 和 writing direction；
5. 同步恢复原始 DOM selection；
6. 仅当原生移动路径的第一个原子视觉 stop 明确落在一个已挂载 SkillNode 自身 rect 内时，在当前 command update 中建立只含该 node key 的 `NodeSelection`，保持 focus、调用 `preventDefault()` 并返回 `true`；
7. 普通字符、空白、行首、行尾、无 range、目标不唯一或任何不可判定情况返回 `false`，不写 Lexical selection，让浏览器继续原生移动。

命中判定只能消费当次真实 DOM point/rect 和 chip 自身视觉占位。允许用正式红测证明后的精确 rect 相交/路径顺序条件；禁止使用 chip 中心点、最近距离、固定像素阈值、整行吸附、logical sibling scan 或缓存旧 rect。

连续 chip 时，只能激活移动方向上的第一个实际原子 stop；不能把 decorator label 的 Text node 当成普通可编辑文本，也不能一次跨过两个 chip。

## 正式回归矩阵

测试只在 `ComposerEditor.browser.test.tsx` 中增加轻量 fixture 和几何 helper，不向 production `ComposerEditor` 增加 test-only API，也不复用 stash 中的 diagnostic types、`task.meta` evidence 或 observer 状态机。平台前提 case 作为正式回归保留，不是运行后删除的临时 probe。

每个导航 case 只发送一次方向键，并先证明 DOM/Lexical 起点同步。表驱动矩阵必须交叉覆盖以下行为，而不是做所有维度的笛卡尔积：

1. 命中 chip：
   - 同行 LTR/RTL 左右进入；
   - 截图结构“开始调研 / 独占一行 chip / `aab`”中，从几何对齐的上一行按一次 Down、从下一行按一次 Up；
   - soft-wrap 上下进入；
   - 窄容器长 chip 在宽度变化前后重新按当前几何判断；
   - 连续 chip 精确选中移动方向上的第一个 node key。
2. chip 外原生行为：
   - 四方向交叉覆盖普通字符、普通空白、行首、行尾；
   - 覆盖显式换行、soft-wrap 与 LTR/RTL；
   - 断言 skill handler 未 `preventDefault()`、未产生 `NodeSelection`，最终 collapsed DOM/Lexical caret 位于 fixture 声明的原生目标。
3. 已选 chip 退出：
   - 四方向 × LTR/RTL；
   - inline、only-chip、显式换行至少各有代表 case；
   - 断言 Left/Up 到视觉左、Right/Down 到视觉右，DOM/Lexical 同步，一次只移动一个 stop。
4. 边界第二步：
   - 四方向分别从准确边界建立独立 fixture，再按一次；
   - 断言继续原生移动，不重新选择 chip、不在同一次按键跨两个 stop。
5. 不接管路径：
   - 非 collapsed selection、非 Skill `NodeSelection`、多个 node、root/node 不可用；
   - `Shift`、`Alt/Option`、`Meta/Command`、`Ctrl` 方向键保持修改前基线；
   - typeahead 打开时上下仍由 option navigation owner 消费。

所有核心 case 共同断言：目标 chip key 与 DOM host 对应、caret 不进入 chip label、editor focus 保持、`data-selected` 与 selection 一致、editor/外层 scroll 不因探测变化、Composer `capture()` 的完整 `input`/draft/selected paths 深等于按键前结果、`onSubmit` 未调用。完整 capture 不变证明方向键没有改写后续提交 payload；`onSubmit` 未调用证明导航没有进入 queue/turn-start。最终 full parallel Browser 还必须收集并通过既有 `ComposerTurnControl` skill capture/queue 用例，作为跨 owner 非回退证据。

现有删除、输入替换、undo/redo、draft/capture、pointer/Tab 与 typeahead 用例继续作为非回退证据；clipboard 使用现有 `src/__tests__/sequential/composerClipboard.browser.test.tsx` 的三浏览器 copy/cut/paste 原子 skill payload 用例，不在本任务新建 clipboard 测试框架。

## 权威命令

以下命令均在 `/Users/jiangsheng/cnb/codex/codex-gui` 运行，不安装依赖、不启动可见浏览器：

```text
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:parallel --run src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx -t 'proves native skill chip navigation targets without side effects'
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:parallel --run src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx -t 'moves through skill chips as four-direction atomic stops'
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:parallel --run src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
/opt/homebrew/bin/fnm exec --using-file pnpm run lint
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:sequential --run src/__tests__/sequential/composerClipboard.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:parallel --run
```

首条命令是实现前平台前提门禁，必须在 Chromium、Firefox、WebKit 中绿色证明保存/探测/恢复、chip/非 chip 区分、显式换行、soft-wrap、`contenteditable=false` host、focus/scroll 无副作用与 LTR/RTL 边界映射；它失败时禁止开始 production 编辑。

第二条命令在仅写入正式测试、尚未修改 production handler 时必须因设计中缺失的上下进入/退出和多行左右路径失败；测试未被收集、因 fixture 初始化失败或因无关断言失败都不算有效红灯。

第三条命令在实现后验证完整 ComposerEditor Browser 文件。最后一条命令验证全部 parallel Browser suite，并必须分别报告 Chromium、Firefox、WebKit 的实际收集数与结果；成功但未收集正式目标和既有 ComposerTurnControl skill queue/capture 目标都不算验证。

`format:oxfmt` 是 check 入口，不运行 fix；若发现格式问题，只允许在声明的两个源码文件中用项目 `format:oxfmt:fix` 的限定能力处理本次改动，然后重新运行 check。不得借自动修复改动范围外文件。

## 验收层级

- Level 1：适用。Vitest Browser Mode 在 Chromium、Firefox、WebKit 中验证真实 DOM Selection、原生 keydown、rect、focus、scroll 和 Lexical selection 转换。
- Level 2：不适用。已确认设计明确以三浏览器无头 Browser Mode 作为本行为的充分证据，本次不改变 runtime、catalog、protocol、queue 或 mount integration。
- Level 3：不适用。本结果不依赖系统 IME、桌面窗口、跨应用 focus 或 DevTools；禁止启动可见浏览器或桌面 GUI。

## 描述式执行 DAG

### 初始 ready set、关键路径与汇合

- 用户确认本计划后，初始 ready set 只有 `D0`；它创建实施前必需的独立工作文档提交。
- 关键路径：`D0 → T1 → V0 → V1 → I1 → V2 → V3 → G1 → C1 → F1`。
- `V2`、`V4`、`V5`、`V6`、`V7` 在 `I1` 后 fan-out；它们读取同一稳定源码，分别使用 focused Browser、formatter、linter、type-check、sequential Browser runner。`V3` 只依赖 `V2` 的 focused green。若执行环境实际共享不可并发 cache/runner，则保留 ready 状态等待对应 canonical lock，不伪造新的 hard dependency。
- `G1` 是 task-level fan-in；只有全部验证稳定通过，才允许 `C1` stage/commit。
- 不创建 worktree、branch 或第二 Git index。唯一 execution context 是当前 `dev` 工作树和当前 Git index。
- stash object `5f6876cf92c6cc18d0d257e5c3dd2cba755d4ec4` 是只读历史证据，不属于执行输入，不获取写锁。

### 节点记录

#### D0 — 工作文档独立提交

- `nodeId`: `D0`
- `taskBoundary`: `Docs`；独立文档提交
- `operationKind`: `commit`
- `outcome`: 只提交本计划文件，形成实施前门禁 commit
- `estimatedCost`: 低
- `deferralEvidence`: 无
- `hardPredecessors`: 用户明确确认本计划；等待稳定授权，不消费代码产物
- `consumes`: 已确认设计、诊断结论、用户计划确认
- `produces`: `docs: plan skill chip four-direction navigation repair` 本地 commit id
- `completionEvidence`: `git show --stat --oneline HEAD` 只包含本计划文件，`git status --short` 不含本节点残留
- `readSet`: 本计划文件、Git status/index/HEAD
- `writeSet`: 当前 Git index、本地 `dev` ref
- `stateEffects`: stage 本计划文件并创建一个本地 commit
- `commandScope`: `git status`、`git diff --check`、`git add -- <plan>`、`git diff --cached`、`git commit -m 'docs: plan skill chip four-direction navigation repair'`、只读 commit 核验
- `subdelegation`: false
- `executionContext`: 当前 worktree、`dev`、当前 Git index；独占 index/ref
- `resourceLocks`: `/Users/jiangsheng/cnb/codex/.git/index` write；local `refs/heads/dev` write
- `owner`: 唯一 Git owner 子代理
- `verification`: staged snapshot 只含本计划文件，`git diff --cached --check` 通过
- `failureDomain`: `D0` 及全部实施后继
- `replanTriggers`: staged snapshot 含其他文件、HEAD/branch 漂移、计划未获明确确认
- `authorizationGate`: 待用户确认本计划后由 `$action-authorization` 激活；不含 remote、amend、force

#### T1 — 正式回归测试与 fixture

- `nodeId`: `T1`
- `taskBoundary`: `Task 1 — 正式修复 skill chip 四方向导航`
- `operationKind`: `edit`
- `outcome`: 建立覆盖完整正式矩阵的表驱动 Browser 测试，且不含临时 diagnostic seam
- `estimatedCost`: 中
- `deferralEvidence`: 无
- `hardPredecessors`: `D0`；等待文档 commit id
- `consumes`: 已确认设计、current clean test baseline、stash evidence 的只读结论
- `produces`: 正式测试 diff 与固定测试名称 `moves through skill chips as four-direction atomic stops`
- `completionEvidence`: test diff 只修改 `ComposerEditor.browser.test.tsx`，`git diff --check` 通过，未出现 `testOnlyNavigationDiagnosticRef`、`task.meta` 或 observer
- `readSet`: 设计、research、当前 test file、ComposerEditor/SkillNode/SelectedSkillToken 测试 seam
- `writeSet`: `codex-gui/src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx`
- `stateEffects`: 工作树测试源码修改；不操作 Git index
- `commandScope`: 只读定位与普通源码编辑；不运行 fix/generate
- `subdelegation`: false
- `executionContext`: 当前 worktree，共享 branch，禁止 index 操作
- `resourceLocks`: test file write
- `owner`: 测试编辑子代理
- `verification`: `git diff --check` 与人工矩阵映射审查
- `failureDomain`: `T1` 及 `V1`、`I1`、全部后继
- `replanTriggers`: 需要 production test hook、计划外文件或无法建立确定几何 fixture
- `authorizationGate`: 待计划确认后激活；只允许该 test file 编辑

#### V0 — 三浏览器原生探测平台前提门禁

- `nodeId`: `V0`
- `taskBoundary`: `Task 1`
- `operationKind`: `verification`
- `outcome`: 正式保留的平台前提 case 证明三浏览器可无副作用地区分真实 chip 目标与 chip 外目标
- `estimatedCost`: 中
- `deferralEvidence`: 无
- `hardPredecessors`: `T1`；等待稳定正式 test diff
- `consumes`: 正式平台前提 tests、原生 DOM Selection/rect fixture
- `produces`: Chromium/Firefox/WebKit 的保存/探测/恢复与几何区分绿色证据
- `completionEvidence`: 首条权威命令实际收集目标并在三浏览器通过；覆盖 character/line、显式换行、soft-wrap、`contenteditable=false`、LTR/RTL、focus/scroll 与 chip 外反例
- `readSet`: test file、当前 Composer DOM、Vitest config、browser runtime
- `writeSet`: 无代理主动输出
- `stateEffects`: headless Browser 测试运行状态与程序内部临时产物
- `commandScope`: 仅执行首条 platform-prerequisite Browser 命令一次
- `subdelegation`: false
- `executionContext`: 当前 worktree；不写 Git index
- `resourceLocks`: Vitest parallel Browser runner write/exclusive
- `owner`: Browser 验证子代理
- `verification`: 核对三浏览器 target 收集、DOM selection 精确恢复和无副作用断言
- `failureDomain`: `V0` 及全部 production/commit 后继
- `replanTriggers`: 任一浏览器无法区分、fixture 初始化失败、零收集、focus/scroll/selection 副作用
- `authorizationGate`: 待计划确认后激活；禁止安装和有头浏览器

#### V1 — 有效红灯

- `nodeId`: `V1`
- `taskBoundary`: `Task 1`
- `operationKind`: `verification`
- `outcome`: 三浏览器正式目标被实际收集，并仅因现有四方向产品缺口失败
- `estimatedCost`: 中
- `deferralEvidence`: 无
- `hardPredecessors`: `V0`；等待三浏览器平台前提绿色证据
- `consumes`: 正式目标测试
- `produces`: Chromium/Firefox/WebKit 红灯结果与失败 case 清单
- `completionEvidence`: 命令收集正式目标；上下进入/退出或多行左右断言失败；fixture、import、环境和非目标用例未失败
- `readSet`: test file、production baseline、Vitest config、node_modules
- `writeSet`: 无代理主动输出
- `stateEffects`: headless Browser 测试运行状态与程序内部临时产物
- `commandScope`: 仅执行第二条 behavior-focused Browser 命令一次
- `subdelegation`: false
- `executionContext`: 当前 worktree；不写 Git index
- `resourceLocks`: Vitest parallel Browser runner write/exclusive
- `owner`: Browser 验证子代理
- `verification`: 核对三浏览器 target 收集和预期行为失败
- `failureDomain`: `V1` 及全部后继
- `replanTriggers`: 零收集、fixture 失败、工具缺失、非产品行为失败
- `authorizationGate`: 待计划确认后激活；禁止安装和有头浏览器

#### I1 — 最小 production 修复

- `nodeId`: `I1`
- `taskBoundary`: `Task 1`
- `operationKind`: `edit`
- `outcome`: `SkillEditingPlugin` 完成四方向 command、准确 boundary exit 与原生命中转换
- `estimatedCost`: 中
- `deferralEvidence`: 无
- `hardPredecessors`: `V1`；等待有效红灯证据
- `consumes`: 红灯 case、Lexical command/Selection API、设计约束
- `produces`: 单一 production diff
- `completionEvidence`: 只修改 `SkillEditingPlugin.tsx`；无 browser-specific fallback、阈值、logical sibling scan、cache、公开接口或新 module；`git diff --check` 通过
- `readSet`: `SkillEditingPlugin.tsx`、`SkillNode.ts`、Lexical local source、正式 test diff
- `writeSet`: `codex-gui/src/features/composerEditor/SkillEditingPlugin.tsx`
- `stateEffects`: 工作树 production 源码修改；不操作 Git index
- `commandScope`: 普通源码编辑；不运行 fix/generate
- `subdelegation`: false
- `executionContext`: 当前 worktree，共享 branch，禁止 index 操作
- `resourceLocks`: `SkillEditingPlugin.tsx` write；test file read
- `owner`: production 编辑子代理
- `verification`: 静态检查实现形状并交给 `V2`
- `failureDomain`: `I1` 及全部验证/提交后继
- `replanTriggers`: 精确命中需要计划外 API/file、三浏览器只能靠 fallback、用户可见语义偏离设计
- `authorizationGate`: 待计划确认后激活；只允许该 production file 编辑

#### V2 — focused 三浏览器绿色

- `nodeId`: `V2`
- `taskBoundary`: `Task 1`
- `operationKind`: `verification`
- `outcome`: 正式四方向目标在三浏览器全部通过
- `estimatedCost`: 中
- `deferralEvidence`: 无
- `hardPredecessors`: `I1`；等待稳定 product diff
- `consumes`: 正式 tests + production fix
- `produces`: focused green evidence
- `completionEvidence`: Chromium、Firefox、WebKit 正式目标全部通过，收集数与矩阵一致
- `readSet`: 两个 task files、Vitest config、node_modules
- `writeSet`: 无代理主动输出
- `stateEffects`: headless Browser 测试运行状态
- `commandScope`: 重跑第二条 behavior-focused Browser 命令
- `subdelegation`: false
- `executionContext`: 当前 worktree
- `resourceLocks`: Vitest parallel Browser runner write/exclusive
- `owner`: Browser 验证子代理
- `verification`: 三浏览器 target 绿色且无 skipped target
- `failureDomain`: `V2` 及全部后继
- `replanTriggers`: 跨浏览器分歧、未收集 target、计划外失败
- `authorizationGate`: 待计划确认后激活；禁止有头浏览器

#### V3 — 完整 ComposerEditor Browser 文件

- `nodeId`: `V3`
- `taskBoundary`: `Task 1`
- `operationKind`: `verification`
- `outcome`: 三浏览器完整 `ComposerEditor.browser.test.tsx` 全部通过
- `estimatedCost`: 高
- `deferralEvidence`: 无
- `hardPredecessors`: `V2`；等待 focused green
- `consumes`: 稳定两文件 diff
- `produces`: 完整 Composer editor 回归结果
- `completionEvidence`: 第三条权威命令在三浏览器零失败，既有 typeahead/删除/替换/undo/redo/draft owner 回归不退化
- `readSet`: task files、完整 ComposerEditor Browser test 依赖
- `writeSet`: 无代理主动输出
- `stateEffects`: headless Browser 测试运行状态
- `commandScope`: 仅执行第三条完整 ComposerEditor Browser 命令
- `subdelegation`: false
- `executionContext`: 当前 worktree
- `resourceLocks`: Vitest parallel Browser runner write/exclusive
- `owner`: Browser 验证子代理
- `verification`: 记录每浏览器 collected/passed/failed/skipped
- `failureDomain`: `V3`、`G1`、`C1`、`F1`
- `replanTriggers`: 计划外失败或 target 未收集
- `authorizationGate`: 待计划确认后激活

#### V4 — formatter check

- `nodeId`: `V4`
- `taskBoundary`: `Task 1`
- `operationKind`: `verification`
- `outcome`: frontend 权威 formatter check 通过
- `estimatedCost`: 低
- `deferralEvidence`: 无
- `hardPredecessors`: `I1`；等待稳定 product diff，与 `V2` 无行为产物依赖
- `consumes`: 稳定两文件 diff
- `produces`: `format:oxfmt` 绿色结果
- `completionEvidence`: 第四条权威命令退出 0
- `readSet`: `codex-gui` formatter inputs
- `writeSet`: 无代理主动输出
- `stateEffects`: formatter check 状态
- `commandScope`: 仅执行 `format:oxfmt`
- `subdelegation`: false
- `executionContext`: 当前 worktree
- `resourceLocks`: oxfmt runner read
- `owner`: 静态验证子代理
- `verification`: 退出码 0
- `failureDomain`: `V4`、`G1`、`C1`、`F1`
- `replanTriggers`: formatter 报告范围外预存问题
- `authorizationGate`: 待计划确认后激活；不运行 fix

#### V5 — lint

- `nodeId`: `V5`
- `taskBoundary`: `Task 1`
- `operationKind`: `verification`
- `outcome`: frontend 权威 lint 通过
- `estimatedCost`: 中
- `deferralEvidence`: 无
- `hardPredecessors`: `I1`；等待稳定 product diff，与 `V2` 无行为产物依赖
- `consumes`: 稳定两文件 diff
- `produces`: lint 绿色结果
- `completionEvidence`: 第五条权威命令退出 0
- `readSet`: `codex-gui` lint inputs
- `writeSet`: 无代理主动输出
- `stateEffects`: lint 状态与 ESLint 内部 cache
- `commandScope`: 仅执行 `lint`
- `subdelegation`: false
- `executionContext`: 当前 worktree
- `resourceLocks`: eslint/oxlint runner 与内部 cache write
- `owner`: 静态验证子代理
- `verification`: 退出码 0
- `failureDomain`: `V5`、`G1`、`C1`、`F1`
- `replanTriggers`: lint 报告范围外预存问题
- `authorizationGate`: 待计划确认后激活；不运行 fix

#### V6 — type-check

- `nodeId`: `V6`
- `taskBoundary`: `Task 1`
- `operationKind`: `verification`
- `outcome`: TypeScript project type-check 通过并覆盖 Browser test
- `estimatedCost`: 中
- `deferralEvidence`: 无
- `hardPredecessors`: `I1`；等待稳定 product diff，与 `V2` 无行为产物依赖
- `consumes`: 稳定两文件 diff、`tsconfig.vitest.browser.json`
- `produces`: type-check 绿色结果
- `completionEvidence`: 第六条权威命令退出 0
- `readSet`: `codex-gui` TypeScript graph
- `writeSet`: 无代理主动输出
- `stateEffects`: type-check 状态与程序内部增量 cache
- `commandScope`: 仅执行 `type-check`
- `subdelegation`: false
- `executionContext`: 当前 worktree
- `resourceLocks`: TypeScript runner 与内部 cache write
- `owner`: 静态验证子代理
- `verification`: 退出码 0
- `failureDomain`: `V6`、`G1`、`C1`、`F1`
- `replanTriggers`: 范围外预存类型错误
- `authorizationGate`: 待计划确认后激活

#### V7 — clipboard 原子 payload 非回退

- `nodeId`: `V7`
- `taskBoundary`: `Task 1`
- `operationKind`: `verification`
- `outcome`: 现有三浏览器 clipboard owner 用例证明 skill copy/cut/paste 原子 payload 未回退
- `estimatedCost`: 中
- `deferralEvidence`: 无
- `hardPredecessors`: `I1`；等待稳定 product diff，与 `V2` 无行为产物依赖
- `consumes`: committed-style navigation selection semantics、现有 sequential clipboard Browser tests
- `produces`: Chromium/Firefox/WebKit clipboard 回归结果
- `completionEvidence`: 第七条权威命令实际收集目标并在三浏览器零失败；canonical text 与 structured skill payload 断言保持通过
- `readSet`: `ComposerClipboardPlugin.tsx`、sequential clipboard Browser test 及其依赖、task files
- `writeSet`: 无代理主动输出
- `stateEffects`: headless sequential Browser 测试运行状态
- `commandScope`: 仅执行 focused sequential clipboard Browser 命令
- `subdelegation`: false
- `executionContext`: 当前 worktree
- `resourceLocks`: Vitest sequential Browser runner write/exclusive
- `owner`: Browser 验证子代理
- `verification`: 记录每浏览器 collected/passed/failed/skipped
- `failureDomain`: `V7`、`G1`、`C1`、`F1`
- `replanTriggers`: clipboard 目标未收集或出现计划外失败
- `authorizationGate`: 待计划确认后激活；禁止有头浏览器

#### G1 — task fan-in 与完整 diff 审查

- `nodeId`: `G1`
- `taskBoundary`: `Task 1`
- `operationKind`: `fan-in`
- `outcome`: 组合 diff 完整满足设计且只含两文件正式修复
- `estimatedCost`: 中
- `deferralEvidence`: 无
- `hardPredecessors`: `V3`、`V4`、`V5`、`V6`、`V7`；分别等待完整 Composer Browser、format、lint、type-check、clipboard 稳定证据
- `consumes`: 两文件完整 diff、全部验证结果、反向审计清单
- `produces`: 可提交 staged allowlist 与审查结论
- `completionEvidence`: 无临时 diagnostic、fallback、阈值、计划外行为或文件；设计每项验收映射到正式 case
- `readSet`: 两文件 diff、设计、计划、验证摘要、Git status
- `writeSet`: 无
- `stateEffects`: 审查结论
- `commandScope`: `git status`、`git diff --check`、`git diff -- <two files>`、只读 `rg`
- `subdelegation`: false
- `executionContext`: 当前 worktree
- `resourceLocks`: 两 task files read；Git index read
- `owner`: 独立审查子代理；不能是 I1/T1 编辑 owner
- `verification`: 正向 spec review + 反向范围/原生行为审计
- `failureDomain`: `G1`、`C1`、`F1`
- `replanTriggers`: 任何设计项无测试证据、diff 含临时探针或计划外文件
- `authorizationGate`: 待计划确认后激活；只读

#### C1 — Task 1 本地提交

- `nodeId`: `C1`
- `taskBoundary`: `Task 1`
- `operationKind`: `commit`
- `outcome`: 两文件正式修复形成独立本地 commit
- `estimatedCost`: 低
- `deferralEvidence`: 无
- `hardPredecessors`: `G1`；等待可提交审查结论
- `consumes`: 两文件 allowlist、全部稳定验证
- `produces`: `fix(gui): navigate skill chips in four directions` commit id
- `completionEvidence`: staged snapshot 只含两个 task files；commit 创建成功；无 amend/squash/remote
- `readSet`: 两文件、Git status/index/HEAD
- `writeSet`: 当前 Git index、本地 `dev` ref
- `stateEffects`: stage 两文件并创建一个本地 commit
- `commandScope`: `git add -- <two files>`、`git diff --cached --check`、`git diff --cached`、`git commit -m 'fix(gui): navigate skill chips in four directions'`、只读核验
- `subdelegation`: false
- `executionContext`: 当前 worktree、`dev`、当前 Git index；独占
- `resourceLocks`: `/Users/jiangsheng/cnb/codex/.git/index` write；local `refs/heads/dev` write
- `owner`: Task 1 唯一 Git owner 子代理
- `verification`: commit snapshot 精确、message 正确、working tree 无 task 残留
- `failureDomain`: `C1`、`F1`
- `replanTriggers`: staged snapshot 含范围外文件、HEAD/branch 漂移、commit hook 产生新失败
- `authorizationGate`: 待计划确认后激活；不含 amend、force、remote

#### F1 — 最终 parallel Browser 与完成核验

- `nodeId`: `F1`
- `taskBoundary`: 无新提交；最终验证
- `operationKind`: `verification`
- `outcome`: 合并后的最终状态完整达到设计目标
- `estimatedCost`: 高
- `deferralEvidence`: 无
- `hardPredecessors`: `C1`；等待 Task 1 commit id
- `consumes`: 已提交最终代码、全部 parallel Browser suite
- `produces`: 最终三浏览器验证摘要与 clean task status
- `completionEvidence`: 第八条权威命令零失败且收集正式目标与既有 ComposerTurnControl skill queue/capture 目标；`git status --short` 无本任务残留；stash object `5f6876cf92c6cc18d0d257e5c3dd2cba755d4ec4` 仍可解析为 tree `870bf21b90139644705c168213229ee365d0b44c`
- `readSet`: committed `codex-gui` parallel Browser graph、Git status、稳定 stash object identity
- `writeSet`: 无代理主动输出
- `stateEffects`: headless Browser 测试运行状态
- `commandScope`: 仅执行第八条全 parallel Browser 命令；随后只读 `git status`、`git show`、`git cat-file`/`git rev-parse` stable stash object
- `subdelegation`: false
- `executionContext`: 当前 worktree；不写 Git index
- `resourceLocks`: Vitest parallel Browser runner write/exclusive；Git index read；stash read
- `owner`: 最终验证子代理
- `verification`: 报告 actual collected/passed/failed/skipped、两个 commit ids、稳定 stash object 未触碰
- `failureDomain`: `F1`
- `replanTriggers`: 最终 suite 失败、正式目标未收集、task 残留或 stash identity 变化
- `authorizationGate`: 待计划确认后激活；禁止有头浏览器、安装、remote

## 任务提交拓扑

1. `Docs`：本计划文件独立提交 `docs: plan skill chip four-direction navigation repair`。
2. `Task 1`：正式测试与 production 修复在同一行为任务中 fan-in，验证后独立提交 `fix(gui): navigate skill chips in four directions`。
3. 不拆分“红测 commit”和“实现 commit”，避免保留故意失败的中间产品提交；但执行顺序仍严格 test-first。
4. 对提交后的修正只能创建新的独立修正提交，禁止 amend、squash 或并入已有提交。
5. 不执行任何 Git remote、force、stash apply/pop/drop 或 ignored research stage。

## 计划完成检查

- 设计中的三项产品决策全部有正式三浏览器证据，不以诊断完成替代产品完成；
- screenshot 目标精确实现：选中中间 chip 后 Up 一次到“开始调研”一侧的视觉左边界、Down 一次到 `aab` 一侧的视觉右边界；从“开始调研”对齐 caret Down 一次进入 chip，从 `aab` 对齐 caret Up 一次进入 chip；
- chip 外字符按普通 textarea 式原生移动，没有飞到 chip 左右；
- 多行左右不再跳过 chip或落错边界；
- 临时诊断代码未进入 production/test 最终 diff，stash object `5f6876cf92c6cc18d0d257e5c3dd2cba755d4ec4` 保持未触碰；
- 两个本地提交边界清楚，最终 parallel Browser、format、lint、type-check 全部通过；
- 无可见桌面窗口、依赖安装、remote、force、amend、squash、fallback 或计划外文件。
