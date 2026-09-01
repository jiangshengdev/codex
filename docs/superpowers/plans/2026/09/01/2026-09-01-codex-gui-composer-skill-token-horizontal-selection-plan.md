# Codex GUI Composer Skill token 水平选择闭环实施计划

## 状态

- 计划状态：已确认
- 日期：2026-09-01
- 当前分支：`dev`
- 当前 HEAD：`40add5ed69cb0c58b0d62b0076b4be37a21feb49`
- Lexical 基线：`0.49.0`
- 设计依据：[Codex GUI Composer Skill token 水平选择闭环设计](../../../../specs/2026/09/01/2026-09-01-codex-gui-composer-skill-token-horizontal-selection-design.md)
- 调研依据：[Composer 输入框光标控制任务拆分调研](../../../../research/2026/09/01/2026-09-01-composer-caret-control-task-splitting.md)

本文是实施计划，不构成实现授权。用户明确确认本计划后，才允许按下述 DAG 执行；实现开始前，
必须先把本计划与已确认设计形成独立本地 Git 提交。

## 唯一目标

形成 Skill token 的无修饰键水平选择闭环：Lexical 0.49 继续拥有相邻 collapsed
`RangeSelection → 单 Skill NodeSelection` 的进入；Composer 只补齐单 Skill
`NodeSelection → token 外部 collapsed RangeSelection` 的视觉左右退出，并在 token Trigger
持有 DOM focus 时执行一次窄 focus handoff，使后续输入回到 editor root。

## 硬边界

- 只处理无 `Shift`、`Alt`、`Meta`、`Ctrl` 的 `ArrowLeft` / `ArrowRight`。
- 不处理 ArrowUp/ArrowDown、显式换行、soft-wrap、视觉列保持或 `Shift+Arrow` range 语义。
- 不恢复 `486e069ee` 删除的 DOM Selection、DOM Range、caret rect、坐标、scroll、RAF、异步
  selection 恢复或浏览器特判层。
- 只允许为视觉 LTR/RTL 映射读取 Skill parent DOM 最终生效的 computed `direction`；无法得到
  明确 `ltr` / `rtl` 时不消费 command，不猜测或 fallback。
- 不增加 `@lexical/selection` 依赖，不导入传递依赖或私有 helper，不迁移 `PlainTextPlugin`。
- 不修改 `ComposerEditor.tsx`、`SelectedSkillToken.tsx`、`SkillNode.ts`、`SkillTypeaheadPlugin.tsx`、
  clipboard、draft、history、controller API、structured payload、HeroUI presentation 或 Lingui catalog。
- 不新增 production test hook、selection 镜像状态、进入来源状态或第二个 navigation owner。
- 不创建 worktree，不安装依赖，不运行 repository-level `just fmt`，不打开可见浏览器或 DevTools，
  不操作 remote，不使用 force、amend 或 squash。
- 不在行为提交中进行 import、声明、函数、分支、组件或测试的纯顺序整理。

HeroUI 不在修改范围。现有 `Chip`、`Tooltip`、Trigger 语义、variant 与 semantic token 保持不变；
验收只证明方向键不会错误打开 Tooltip 或改变既有 Trigger 可访问行为。

## 计划前六字段证据闭包

| 字段 | 当前证据与计划映射 |
| --- | --- |
| 权威入口 | `ComposerEditor.tsx` 挂载 `PlainTextPlugin` 与 `SkillEditingPlugin`；Lexical 0.49 PlainText 的 decorator-aware character move 已拥有 Range→Node 进入；`SkillEditingPlugin.tsx` 已拥有 Skill `NodeSelection` 下输入替换与删除 command 生命周期，是新增窄退出 adapter 的现有 seam。 |
| 已追踪链路 | 已追踪 DOM keydown→Lexical command、RangeSelection→NodeSelection、NodeSelection 下 PlainText 不接管、`selectPrevious()` / `selectNext(0, 0)` 边界、parent computed direction、plugin mount/unmount cleanup、editable、composition、pointer click、Trigger Enter/Space、controller snapshot、clipboard/draft/history/typeahead 与 DOM focus reconcile。 |
| 修改范围 | Task 1 只修改 `ComposerEditor.browser.test.tsx`，用真实 editor-state probe 锁定当前进入合同；Task 2 修改同一测试文件与 `SkillEditingPlugin.tsx`，增加无修饰键退出、computed direction 映射和 Trigger→root 窄 focus handoff。其他 owner 不消费水平 command 或无需新接口。 |
| 验证映射 | 定向 Vitest Browser Mode JSON 证明 Chromium/Firefox/WebKit 非零收集；测试分别断言 Lexical selection、DOM caret、active element、Chip、Tooltip、snapshot/capture；`pnpm run ci` 覆盖 formatter check、lint、type-check、unit、Chromium smoke；`pnpm run test:browser` 覆盖完整三浏览器 Browser suites；Level 2 使用当次完整 GUI URL 做真实 runtime 无头验收。 |
| 排除项 | `SelectedSkillToken` 继续拥有点击/Enter/Space 激活；focus handoff 只在退出 handler 成功后发生，不修改 Trigger；`SkillNode` 的 DOM/序列化与 `ComposerEditor` 组合不变；draft、clipboard、history、typeahead、payload 只消费内容/tree，不消费水平 navigation command；无生成物、schema、snapshot、catalog 或 Rust 变化。 |
| 剩余未知 | 无阻断计划确认的关键未知。非关键未知是执行时是否可取得当次真实 GUI URL、空 Composer 与可用 Skill；它不改变实现范围，只决定 Level 2 记录为 passed 或 `unexecuted`，后者禁止“完整验证”声明。真实 Safari 与辅助技术继续属于后续独立切片。 |

## 反向审计结论

独立反向审计发现并已闭合三项遗漏：

1. Trigger Enter/Space 激活后 DOM focus 留在 Trigger。已由设计确认：成功水平退出后执行一次窄
   focus handoff；不建立通用 focus 恢复层。
2. `format:oxfmt:fix` 是项目固化且作用于整个 `codex-gui` 的写入口。计划声明完整写边界、
   执行前 clean baseline 与范围外 diff 停止条件，不把 direct CLI 伪装为等价入口。
3. Level 2 会改变真实 Composer 的临时 draft/selection/UI 状态。计划只在空 Composer 中写入可识别、
   不提交的临时内容；成功后清除本轮内容，失败时保留现场并报告，不自动清理。

审计还确认：无需修改 `ComposerEditor.tsx`、`SelectedSkillToken.tsx`、`SkillNode.ts`，无需新增
composition、mount/unmount 或 reconcile owner；computed style 已解析继承与 `dir=auto` 的最终方向。

## 精确读写集合

工作文档 `writeSet`：

- `docs/superpowers/specs/2026/09/01/2026-09-01-codex-gui-composer-skill-token-horizontal-selection-design.md`
- `docs/superpowers/plans/2026/09/01/2026-09-01-codex-gui-composer-skill-token-horizontal-selection-plan.md`

Task 1 `writeSet`：

- `codex-gui/src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx`

Task 2 `writeSet`：

- `codex-gui/src/features/composerEditor/SkillEditingPlugin.tsx`
- `codex-gui/src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx`

格式化节点的命令级 `writeSet` 是整个 `codex-gui/**`；最终允许保留、暂存和提交的文件仍严格限于
各 Task allowlist。formatter 产生任何 allowlist 外新 diff 时立即停止并保留现场，不自动恢复。

只读 `readSet` 还包括：

- `ComposerEditor.tsx`、`SelectedSkillToken.tsx`、`SkillNode.ts`、`SkillTypeaheadPlugin.tsx`、
  `ComposerClipboardPlugin.tsx`、`composerDraft.ts` 及相邻 tests；
- `codex-gui/package.json`、Vitest Browser configs、TypeScript/lint/formatter configs、
  `.github/workflows/codex-gui.yml`；
- Lexical 0.49 的 `LexicalEvents.ts`、`LexicalSelection.ts`、`LexicalNode.ts`、PlainText 与
  lexical-selection authored source；
- 本地 Vitest Browser Mode interactivity、assertions 与 filtering 文档。

## 行为与测试合同

### Task 1：水平进入基线

只增加 Browser 回归与 test-local selection probe，不修改 production：

- probe 从 root 取得真实 `LexicalEditor`，在 `editor.getEditorState().read()` 内返回普通快照：
  selection kind、selected node keys、anchor/focus key/type/offset；不得把 Lexical 对象泄漏到 read 外。
- DOM Selection、collapsed caret、active element、Chip `data-selected`、Tooltip、snapshot/capture
  分开观察，禁止互相代证。
- LTR/RTL 从 token 两侧朝向 token 的一次无修饰键 Arrow 必须进入单 Skill `NodeSelection`；
  editor root 保持 DOM focus，内容、snapshot 与 capture 深等不变。
- 定向 Chromium、Firefox、WebKit 当前基线必须通过。失败即证明设计前提不成立，停止 Task 2，
  不添加 production 进入算法、不恢复旧 geometry。

### Task 2：水平退出 adapter

在 `SkillEditingPlugin` 的现有 `mergeRegister` 生命周期内增加 Left/Right command：

- 只接受 editable、无 modifier、恰好一个已附着 `SkillNode` 的 `NodeSelection`。
- 从 Skill parent key 取得 parent DOM，以其 `ownerDocument.defaultView.getComputedStyle()` 读取最终
  `direction`；只接受 `ltr` / `rtl`。
- 按视觉 Left/Right 映射 logical previous/next，分别调用 SkillNode 的 `selectPrevious()` 或
  `selectNext(0, 0)`；不构造 DOM Range。
- selection 成功转换后才 `preventDefault()` 并返回 `true`。
- 若 active element 是当前 Skill DOM 内的 Trigger，成功转换后调用 editor 的官方 focus 路径，
  把 DOM focus 交还 root；editor root/pointer 来源不新增 focus 操作。
- DOM、direction、parent、node attachment 或 selection 条件不满足时返回 `false`，不消费事件。

TDD Browser 合同覆盖：

- LTR/RTL、两侧、邻接文本、连续 token、only-token 的精确 Lexical point；
- 方向键进入、pointer click、Trigger Enter、Trigger Space 四种来源；
- Trigger 来源退出后 root focus、DOM caret 和继续输入侧正确；Tooltip 不因方向键打开；
- modifiers、multi-node、non-Skill、detached/stale、disabled、真实 composition、DOM/direction 不可得
  均不被新增路径接管；
- snapshot/capture 深等、内容、structured Skill identity、submit spy 保持不变。

测试只通过 Composer 的真实 interface 与 test-local editor-state probe，不新增 production prop、controller
method、export 或测试专用 adapter。

## 工具链与精确命令

所有 pnpm 命令从 `/Users/jiangsheng/cnb/codex/codex-gui` 执行。执行前重复核验：

```bash
/opt/homebrew/bin/fnm env --shell zsh
/opt/homebrew/bin/fnm exec --using-file node --version
/opt/homebrew/bin/fnm exec --using-file pnpm --version
```

当前只读预检为 Node `v24.17.0`、pnpm `10.34.5`，且 pnpm 不位于 Codex runtime shim。执行时结果
漂移或工具缺失则停止，不安装替代组件。

Task 1 定向基线：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:parallel --run src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx -t '^Skill token horizontal selection' --reporter=json --outputFile=/tmp/codex-gui-skill-token-horizontal-entry.json
```

Task 2 expected red：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:parallel --run src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx -t 'exits selected skill tokens' --reporter=json --outputFile=/tmp/codex-gui-skill-token-horizontal-exit-red.json
```

Task 2 focused green 与最终定向证据：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:parallel --run src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx -t '^Skill token horizontal selection' --reporter=json --outputFile=/tmp/codex-gui-skill-token-horizontal-final.json
```

每次 JSON 必须证明目标文件与完整测试名被实际执行，Chromium、Firefox、WebKit 均有非零结果；
Task 2 red 必须失败在预期退出/focus/point 断言，而不是配置、编译、fixture 或工具错误。命令在
`test:browser:parallel` 后不得增加额外的 `--`。

项目固化 formatter 与最终门禁：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt:fix
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
/opt/homebrew/bin/fnm exec --using-file pnpm run ci
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser
git diff --check
```

`format:oxfmt:fix` 每个 Task 最多运行一次，运行前必须确认无 allowlist 外 dirty frontend 文件并记录
完整 name-only；运行后立即审查完整 diff。不得运行 lint fix、snapshot accept、schema/catalog generation、
dependency install 或 repository `just fmt`。

## GUI 验收级别

- Level 1：必需。Task 1 当前进入基线、Task 2 red/green、最终定向 JSON、完整 Browser suite 均须
  记录实际三实例目标命中；`pnpm run ci` 的 Chromium smoke 不能替代。
- Level 2：适用。Task 2 提交后重新取得 `/gui` 或 `launch_gui` 返回的完整当前 URL，使用无
  `--headed` 的 `playwright-cli open '<complete current GUI URL>'`，再用
  `playwright-cli list --json` 明确证明 session 非 headed。禁止猜测、拼接或复用旧 URL。
- Level 3：不适用。不得启动可见浏览器。WebKit Browser Mode 不等于真实 Safari；Safari 与辅助技术
  继续保留为后续独立验收。

Level 2 只在以下前提全部成立时执行：真实 runtime 可用、完整 URL 可得、session 明确 non-headed、
当前 Composer 为空且不会覆盖用户 draft、真实 catalog 至少有一个可插入 Skill。使用可识别的临时
未提交文本与 Skill 验证两段式进入/退出、only-token、连续 token、Trigger focus handoff、Tooltip、
root focus 与无页面滚动跳变；禁止发送消息。成功后只清除本轮临时内容并核对 Composer 恢复为空；
失败时保留现场、URL/session 与临时内容，不自动清理。任一前提缺失则记录 `unexecuted`，不得用
Level 1、E2E fixture、旧 URL 或可见浏览器替代，也不得声称完整验证。

## 提交边界

### DOCS

只包含本计划与已确认设计：

```text
docs: plan skill token horizontal selection
```

### TASK-1

只包含 test-local probe 与当前水平进入合同：

```text
test(gui): lock skill token horizontal entry
```

### TASK-2

只包含水平退出 production 行为与其 TDD Browser 合同：

```text
fix(gui): let caret exit selected skill tokens
```

三次提交按 `DOCS → TASK-1 → TASK-2` 形成硬依赖。禁止 squash 或 amend。Task 2 或最终验证发现
已提交问题时，按执行图插入新的独立修正 task/commit，不修改既有提交。

## 描述式执行 DAG

以下节点的 `authorizationGate` 当前均为 `pending`。用户明确确认本计划后，节点仍须由
`$action-authorization` 按各自 operation、read/write set、command scope 与 negative constraints
生成最小能力信封；未列能力默认不授权。所有节点 `subdelegation=false`。

### 文档门禁

**P0 — 确认计划状态**

- `nodeId=P0`；`taskBoundary=DOCS`；`operationKind=编辑`；`outcome`：只把本计划状态更新为已确认。
- `estimatedCost=S`；`deferralEvidence=无`；`hardPredecessors=[]`；消费用户明确计划确认，产生 confirmed plan snapshot。
- `completionEvidence`：只改变状态/确认记录；`readSet/writeSet`：本计划；`stateEffects`：单文档修改。
- `commandScope=apply_patch + 只读 diff`；`executionContext=当前 dev checkout/index 不变`；
  `resourceLocks=plan file write`；`owner=DOCS 文档 owner`。
- `verification`：正文范围不漂移；`failureDomain=P1 及全部后继`；`replanTriggers`：用户确认附带范围变化；
  `authorizationGate=计划确认后 active`。

**P1 — 暂存工作文档**

- `nodeId=P1`；`taskBoundary=DOCS`；`operationKind=stage`；`outcome`：index 只含两份 DOCS allowlist。
- `estimatedCost=S`；`deferralEvidence=无`；`hardPredecessors=P0`，等待 confirmed plan snapshot。
- `consumes` 两份工作文档；`produces` reviewed staged snapshot；`completionEvidence`：cached name-status/diff
  仅含 allowlist，`git diff --cached --check` 通过。
- `readSet`=status、docs、index；`writeSet`=当前 index 的两份 DOCS；`stateEffects`=精确 index 更新。
- `commandScope`=Git 只读检查、`git add -- <两份 DOCS>`、cached check；`executionContext`=当前 dev/index；
  `resourceLocks`=当前 Git index write；`owner`=DOCS Git owner。
- `verification`：research 与其他 dirty 文件不进入 index；`failureDomain=P2 及全部实现节点`；
  `replanTriggers`=index 污染、路径/HEAD/branch 漂移；`authorizationGate`=计划确认后 active。

**P2 — 创建 DOCS 提交**

- `nodeId=P2`；`taskBoundary=DOCS`；`operationKind=commit`；`outcome`：独立工作文档提交。
- `estimatedCost=S`；`deferralEvidence=无`；`hardPredecessors=P1`，等待 reviewed staged snapshot。
- `consumes` staged DOCS；`produces` DOCS commit；`completionEvidence`：commit id，stat 只含两份文档。
- `readSet`=index/identity/staged diff；`writeSet`=本地 Git object/ref；`stateEffects`=一个本地 commit。
- `commandScope`=identity 只读、`git commit -m 'docs: plan skill token horizontal selection'`、只读核验；
  `executionContext`=当前 dev/index；`resourceLocks`=index/ref write；`owner`=DOCS Git owner。
- `verification`：禁止 amend/remote；`failureDomain=B0 及全部后继`；`replanTriggers`=hook、identity、snapshot 漂移；
  `authorizationGate`=P1 完成后 active。

### Task 1：进入合同提交

**B0 — frontend 基线预检**

- `nodeId=B0`；`taskBoundary=无提交`；`operationKind=验证`；`outcome`：fnm 工具、live scripts、目标发现配置、
  clean frontend status 与非 fix oxfmt baseline 可信。
- `estimatedCost=S`；`deferralEvidence=无`；`hardPredecessors=P2`；消费已提交文档与 live config，产生 baseline evidence。
- `completionEvidence`：fnm-backed versions 合法、入口存在、`format:oxfmt` 通过、无计划外 frontend dirty。
- `readSet`=package/config/status/frontend；`writeSet=[]`；`stateEffects`=check 进程与普通缓存。
- `commandScope`=本节 preflight 与 `pnpm run format:oxfmt`；`executionContext=codex-gui cwd`；
  `resourceLocks`=frontend read；`owner`=baseline 验证 owner。
- `verification`：不得零目标或 runtime shim；`failureDomain=T1E 及后继`；`replanTriggers`=缺工具、入口漂移、baseline failure；
  `authorizationGate`=P2 后 active。

**T1E — 编写进入合同**

- `nodeId=T1E`；`taskBoundary=TASK-1`；`operationKind=编辑`；`outcome`：test-local selection probe 与进入 tests。
- `estimatedCost=M`；`deferralEvidence=无`；`hardPredecessors=B0`；消费设计和现有 Browser harness，产生单测试文件 diff。
- `completionEvidence`：测试覆盖 LTR/RTL 两侧进入及分离的 selection/DOM/focus/content 断言，无 production hook。
- `readSet`=目标 test、Composer/Lexical test interfaces；`writeSet`=目标 Browser test；`stateEffects`=单文件修改。
- `commandScope=apply_patch + 只读 diff`；`executionContext=当前 checkout/index 不变`；
  `resourceLocks`=Browser test file write；`owner`=TASK-1 test owner。
- `verification`：保留现有测试；`failureDomain=T1F/T1V/T1R/T1S/T1C 及 Task 2`；
  `replanTriggers`=需要 production API/fixture 外文件；`authorizationGate`=B0 后 active。

**T1F — 格式化 Task 1**

- `nodeId=T1F`；`taskBoundary=TASK-1`；`operationKind=格式化`；`outcome`：项目 formatter 后只保留 Task 1 allowlist diff。
- `estimatedCost=S`；`deferralEvidence=无`；`hardPredecessors=T1E`；消费 clean baseline 与 test diff，产生 formatted test diff。
- `completionEvidence`：`format:oxfmt:fix` 和随后 check 通过，allowlist 外无新 diff。
- `readSet/writeSet=codex-gui/**`；`stateEffects`=project-wide formatter 写入；`commandScope`=固化 fix/check + Git diff；
  `executionContext=codex-gui cwd`；`resourceLocks=codex-gui tree write`；`owner`=TASK-1 formatter owner。
- `verification`：范围外变化立即停止并保留；`failureDomain=T1V 及后继`；`replanTriggers`=范围外 diff/order-only churn；
  `authorizationGate`=T1E 后 active。

**T1V — 验证当前进入基线**

- `nodeId=T1V`；`taskBoundary=TASK-1`；`operationKind=验证`；`outcome`：定向进入合同三实例全绿且非零收集。
- `estimatedCost=M`；`deferralEvidence=无`；`hardPredecessors=T1F`；消费 formatted tests/current production，产生 JSON Level 1 evidence。
- `completionEvidence`：Chromium/Firefox/WebKit 目标与完整测试名执行并通过。
- `readSet`=target/config/production；`writeSet=[]`；`stateEffects`=headless test processes、JSON `/tmp` output、runner caches。
- `commandScope`=Task 1 定向命令 + JSON 审查；`executionContext=codex-gui cwd`；
  `resourceLocks`=Browser runner/cache write；`owner`=TASK-1 Browser owner。
- `verification`：失败只能证明基线不成立，禁止补 production 进入算法；`failureDomain=T1R 及全部 Task 2`；
  `replanTriggers`=零收集、配置/fixture failure、进入合同失败；`authorizationGate`=T1F 后 active。

**T1R/T1S/T1C — 审查、暂存、提交 Task 1**

- `nodeId=T1R/T1S/T1C`；`taskBoundary=TASK-1`；`operationKind` 依次为 fan-in/stage/commit；
  `hardPredecessors` 依次为 T1V/T1R/T1S；`estimatedCost` 依次为 S/S/S；`deferralEvidence=无`。
- `outcome/produces`：reviewed 单测试 diff → index 仅含测试文件 → 独立 `test(gui): lock skill token horizontal entry` commit。
- `completionEvidence`：完整 diff 无 production/order-only 变化；cached check 通过；commit stat 仅含目标 test。
- `readSet`=diff/evidence/index/identity；`writeSet`：T1R=[]，T1S=当前 index 目标 test，T1C=本地 Git object/ref；
  `stateEffects`：review none、精确 stage、一个本地 commit。
- `commandScope`=Git 只读审查；T1S 仅 `git add -- <test>`；T1C 仅精确 commit 与核验；
  `executionContext=当前 dev/index`；`resourceLocks`=test read→index write→ref write；`owner`=TASK-1 Git owner。
- `verification`：禁止 amend/remote；`failureDomain`=各自后继与 Task 2；`replanTriggers`=diff/index/hook/identity 漂移；
  `authorizationGate`=各前置成功后 active。

### Task 2：退出行为提交

**T2T — 编写退出 expected-red 合同**

- `nodeId=T2T`；`taskBoundary=TASK-2`；`operationKind=编辑`；`outcome`：新增退出、来源、边界与不接管 tests。
- `estimatedCost=M`；`deferralEvidence=无`；`hardPredecessors=T1C`，等待稳定进入合同 commit。
- `consumes`=Task 1 probe/commit、设计；`produces`=exit test diff；`completionEvidence`=覆盖本计划 TDD matrix，不改生产。
- `readSet`=target test/production/fixtures；`writeSet`=目标 Browser test；`stateEffects`=单文件修改。
- `commandScope=apply_patch + 只读 diff`；`executionContext=当前 checkout`；`resourceLocks`=test file write；`owner`=TASK-2 test owner。
- `verification`：不放宽 Task 1；`failureDomain=T2R 及后继`；`replanTriggers`=需要 production test hook/额外文件；
  `authorizationGate`=T1C 后 active。

**T2R — 证明 expected red**

- `nodeId=T2R`；`taskBoundary=TASK-2`；`operationKind=验证`；`outcome`：当前 production 因缺失退出/focus owner 而红。
- `estimatedCost=M`；`deferralEvidence=无`；`hardPredecessors=T2T`；消费 exit tests，产生 root-cause-aligned red JSON。
- `completionEvidence`：三实例实际收集；失败命中预期 exit point/focus 断言，不是编译、工具或 fixture。
- `readSet`=target/config/production；`writeSet=[]`；`stateEffects`=headless processes、red JSON、runner caches。
- `commandScope`=Task 2 red 命令 + JSON 审查；`executionContext=codex-gui cwd`；`resourceLocks`=Browser runner/cache write；
  `owner`=TASK-2 red owner。
- `verification`：意外通过或错误失败返回事实/设计；`failureDomain=T2E 及后继`；
  `replanTriggers`=根因不符；`authorizationGate`=T2T 后 active。

**T2E — 实现窄退出 adapter**

- `nodeId=T2E`；`taskBoundary=TASK-2`；`operationKind=编辑`；`outcome`：`SkillEditingPlugin` 完成设计规定的退出与 focus handoff。
- `estimatedCost=M`；`deferralEvidence=无`；`hardPredecessors=T2R`；消费 red、Lexical public primitives、computed direction contract，
  产生单 production file behavior diff。
- `completionEvidence`：条件过滤、direction、previous/next、成功消费、Trigger→root focus 均在现有 plugin 内；无 fallback/第二 owner。
- `readSet`=SkillEditingPlugin/SkillNode guards/Lexical source；`writeSet`=SkillEditingPlugin；`stateEffects`=单文件修改。
- `commandScope=apply_patch + 只读 diff`；`executionContext=当前 checkout`；`resourceLocks`=production file write；
  `owner`=TASK-2 production owner。
- `verification`：不修改其他 owner；`failureDomain=T2F/T2G 及后继`；`replanTriggers`=需要额外依赖、文件、DOM geometry、通用 focus owner；
  `authorizationGate`=可信 red 后 active。

**T2F — 格式化 Task 2**

- 字段与 T1F 相同，`nodeId=T2F`、`taskBoundary=TASK-2`、`hardPredecessors=T2E`，最终 retained allowlist
  为 `SkillEditingPlugin.tsx` 与目标 Browser test；`failureDomain=T2G 及后继`；`owner=TASK-2 formatter owner`。
- `completionEvidence`：固化 fix/check 通过且 allowlist 外无新 diff；`authorizationGate=T2E 后 active`。

**T2G — focused green**

- `nodeId=T2G`；`taskBoundary=TASK-2`；`operationKind=验证`；`outcome`：进入与退出 describe 在三实例全绿。
- `estimatedCost=M`；`deferralEvidence=无`；`hardPredecessors=T2F`；消费完整 Task 2 diff，产生 final focused JSON。
- `completionEvidence`：非零收集，Chromium/Firefox/WebKit 全绿，Task 1 未回归。
- `readSet`=two-file diff/config；`writeSet=[]`；`stateEffects`=headless processes、JSON、runner caches；
  `commandScope`=final focused command + JSON 审查；`executionContext=codex-gui cwd`；`resourceLocks`=Browser runner/cache write；
  `owner`=TASK-2 green owner。
- `verification`：不得改断言取绿；`failureDomain=T2Q/T2S/T2C 及最终验证`；
  `replanTriggers`=需要 skip/fallback/额外 owner；`authorizationGate`=T2F 后 active。

**T2Q/T2S/T2C — 审查、暂存、提交 Task 2**

- 字段结构与 T1R/T1S/T1C 相同，`nodeId=T2Q/T2S/T2C`，`hardPredecessors` 依次为 T2G/T2Q/T2S。
- `outcome/produces`：reviewed 两文件行为 diff → index 仅含 Task 2 allowlist → 独立
  `fix(gui): let caret exit selected skill tokens` commit。
- `completionEvidence`：无 order-only、fallback、额外 owner；cached check 通过；commit stat 只含两文件。
- `readSet`=diff/evidence/index/identity；`writeSet`：review=[]，stage=当前 index 两文件，commit=本地 Git object/ref；
  `stateEffects`=review none、精确 stage、一个本地 commit；`commandScope`=只读审查/精确 add/精确 commit；
  `executionContext=当前 dev/index`；`resourceLocks`=files read→index write→ref write；`owner=TASK-2 Git owner`。
- `verification`：禁止 amend/remote；`failureDomain`=各自后继与最终完成；`replanTriggers`=diff/index/hook/identity 漂移；
  `authorizationGate`=各前置成功后 active。

### 最终验证 fan-out/fan-in

**V-CI — 固化 CI 门禁**

- `nodeId=V-CI`；`taskBoundary=无提交`；`operationKind=验证`；`outcome`：`pnpm run ci` 通过。
- `estimatedCost=L`；`deferralEvidence=无`；`hardPredecessors=T2C`；产生 formatter/lint/type/unit/smoke evidence。
- `completionEvidence`：固化入口退出 0；`readSet=codex-gui/**`；`writeSet=[]`；`stateEffects`=checks/caches；
  `commandScope=fnm-backed pnpm run ci`；`executionContext=codex-gui cwd`；`resourceLocks`=CI runners/caches；`owner=CI owner`。
- `verification`：禁止 fix/豁免；`failureDomain=V-FANIN`；`replanTriggers`=本次问题插入独立修正 task，预存问题只报告；
  `authorizationGate`=T2C 后 active。

**V-BROWSER — 完整 Browser suites**

- `nodeId=V-BROWSER`；`taskBoundary=无提交`；`operationKind=验证`；`outcome`：parallel+sequential 三浏览器 suites 通过。
- `estimatedCost=L`；`deferralEvidence=无`；`hardPredecessors=T2C`；产生完整 Level 1 evidence。
- `completionEvidence`：`pnpm run test:browser` 退出 0 且目标 describe 实际命中；`readSet=browser source/config`；
  `writeSet=[]`；`stateEffects`=headless browsers/caches；`commandScope`=fnm-backed full Browser script；
  `executionContext=codex-gui cwd`；`resourceLocks`=Browser runners/caches；`owner=full Browser owner`。
- `verification`：WebKit 不写成 Safari；`failureDomain=V-FANIN`；`replanTriggers`=计划内失败插入修正 task；
  `authorizationGate`=T2C 后 active。

**V-L2 — 真实 runtime 无头验收**

- `nodeId=V-L2`；`taskBoundary=无提交`；`operationKind=验证`；`outcome`：Level 2 记录为 passed 或有证据的 `unexecuted`。
- `estimatedCost=L`；`deferralEvidence=无`；`hardPredecessors=T2C`；消费当次完整 URL/空 Composer/真实 Skill，产生 route、session、场景证据。
- `completionEvidence`：non-headed 与全部场景 passed；或精确记录哪个前提缺失并禁止完整验证声明。
- `readSet`=当前 GUI runtime/DOM；`writeSet`=当前空 Composer 的本轮临时 draft/selection；
  `stateEffects`=headless session、临时未提交输入、成功清理或失败现场保留。
- `commandScope`=当次 GUI URL 获取、`playwright-cli open`/`list --json` 与同 session keyboard/DOM inspection；
  `executionContext=真实 runtime`；`resourceLocks`=该 headless session 与目标 Composer write；`owner=Level 2 owner`。
- `verification`：禁止发送、旧 URL、headed、覆盖既有 draft；`failureDomain=V-FANIN 的完整验证结论`；
  `replanTriggers`=需要 visible、真实状态与设计不符；`authorizationGate`=T2C 后 active。

V-CI、V-BROWSER、V-L2 在 T2C 后同时进入 ready set。它们读取同一稳定 commit，不存在人为硬依赖；
若 CI 与 Browser runner 的实际 canonical cache/port 发生写冲突，节点保持 ready 并等待锁，不伪造依赖。

**V-FANIN — 最终审查**

- `nodeId=V-FANIN`；`taskBoundary=无提交`；`operationKind=fan-in`；`outcome`：集成状态与所有验证结果形成最终结论。
- `estimatedCost=M`；`deferralEvidence=无`；`hardPredecessors=V-CI,V-BROWSER,V-L2`，等待三类稳定证据。
- `consumes`=三提交、完整 diff/status、Level 1/2 evidence；`produces`=完成或部分验证报告；
  `completionEvidence`：全部计划任务提交存在，工作树/index 边界清楚，验证逐层报告，`git diff --check` 通过。
- `readSet`=Git state/commits/evidence；`writeSet=[]`；`stateEffects`=无；`commandScope`=Git/文件/输出只读审查；
  `executionContext=当前 dev`；`resourceLocks`=stable commits read；`owner`=主协调 owner。
- `verification`：Level 2 unexecuted 时不得声称完整验证；`failureDomain=最终报告`；
  `replanTriggers`=发现已提交问题则插入独立修正 task/commit，不 amend；`authorizationGate`=三前置终态后 active。

## Ready set、关键路径和资源拓扑

- 初始 ready set：计划确认后只有 P0。P2 完成前，全部实现与验证节点受工作文档提交门禁阻塞。
- Task 关键路径：`P0 → P1 → P2 → B0 → T1E → T1F → T1V → T1R → T1S → T1C →
  T2T → T2R → T2E → T2F → T2G → T2Q → T2S → T2C → V-FANIN`。
- Task 1 与 Task 2 不能并行：Task 2 消费 Task 1 已提交的 selection probe/进入合同，且两者写同一测试文件。
- 最终 fan-out：T2C 后 V-CI、V-BROWSER、V-L2 同时 ready；资源冲突只限制同时运行，不增加硬边。
- 最终 fan-in：V-FANIN 等待三类验证终态。Level 2 `unexecuted` 是稳定证据，但会把最终结论降为
  “实现与 Level 1 完成、Level 2 未执行”。
- execution context：全部提交直接落当前 `dev` checkout 和同一 Git index；不创建 worktree/branch。
- Git index、branch ref、project-wide formatter、Browser runner/cache、Level 2 session 分别按 canonical
  资源加锁；任务编号、agent 复用或文档顺序不产生额外依赖。

## 失败域与动态修正

- Task 1 基线失败：暂停 Task 1 提交与全部 Task 2，回到设计；不新增进入 owner。
- Task 2 red 不可信：只暂停 Task 2 后继，修正 test/fixture 证据；不得先改 production。
- formatter 产生 allowlist 外 diff：暂停该 Task 及后继，保留现场，不自动恢复或清理。
- Task 2 或最终验证发现计划内问题：按 `$delegating-micro-stages` 插入诊断、修正、验证节点；若已有
  commit，修正必须形成新的独立 commit，禁止 amend。
- V-CI、V-BROWSER、V-L2 任一失败只暂停其实际消费者；其他 ready 分支继续耗尽。
- 需要新增依赖、production file、DOM geometry、selection 镜像、可见窗口、产品决策或改变 focus/RTL
  合同时，停止受影响范围并返回相应设计、计划或授权门禁。
- 只有执行图契约定义的正面硬阻塞成立时才能终止受影响路径；首次失败或未知根因不是停止条件。

## 完成标准

- DOCS、TASK-1、TASK-2 三个独立提交存在，顺序与 allowlist 正确，无 squash/amend/remote。
- 当前 Lexical 进入合同与新增 Composer 退出合同在 Chromium、Firefox、WebKit 中均有直接
  Lexical selection 与独立 DOM/focus 证据。
- LTR/RTL、两侧、连续 token、only-token、四种来源和所有不接管路径符合设计。
- 无新增依赖、production test hook、DOM Selection/geometry、第二 owner、fallback、顺序整理或范围外文件。
- `pnpm run ci`、`pnpm run test:browser`、最终定向目标与 `git diff --check` 结果分别记录。
- Level 2 passed 或明确 `unexecuted`；后者不得声称完整验证。Level 3 不适用，真实 Safari 未验收。
- 最终报告按执行图固定列出：`实际并行`、`关键路径`、`未启动 ready 节点`。
