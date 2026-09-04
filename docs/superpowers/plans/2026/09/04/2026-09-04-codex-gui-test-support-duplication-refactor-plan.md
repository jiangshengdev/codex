# Codex GUI 测试支撑重复重构实施计划

## 状态与边界

- 计划状态：已确认（含 2026-09-04 Editor seam 修订）
- 日期：2026-09-04
- 设计依据：[Codex GUI 测试支撑重复重构设计](../../../../specs/2026/09/04/2026-09-04-codex-gui-test-support-duplication-refactor-design.md)
- 计划编写基线：`dev` / `8de6f1cab63e895926e3507562d5717d7adef626`
- 适用验收：Level 1；Level 2、Level 3 不适用

本文把已确认设计转换为可执行计划，不授权当前立即执行。用户明确确认本计划后，才允许按本文完成
工作文档提交、四个 sparse worktree 创建、测试与测试支撑编辑、前端格式化、验证、stage、任务提交和
本地 `dev` 集成。

本计划不授权修改 production、协议、生成物、package script、依赖或 CI；不授权 Git remote、force、
amend、squash、rebase、worktree cleanup、branch cleanup、依赖安装、可见浏览器或计划外文件修改。
实现和验证必须保持无头。四个实现 worktree 与 branch 在本计划结束后保留，清理需要独立授权。

## 已确认的 Editor seam 修订

2026-09-04 已确认将 ComposerEditor 的单文件 `.tsx` support 精确化为唯一公共
`composerEditorBrowserTestSupport.ts` 与私有 component-only `composerEditorBrowserTestFixture.tsx`。
公共 `.ts` Module 继续公开 `ComposerEditorFixture`、`renderEditor`、`catalog`、`skill`、
`getController` 五个入口，其中 `ComposerEditorFixture` 从私有 `.tsx` fixture re-export；私有 fixture 只导出
该组件。四个 caller 继续使用不带扩展名的公共 support import。

修订依据是 live `eslint.config.ts` 启用的 `react-refresh/only-export-components`：组件与四个非组件 helper
同处 `.tsx` 时，`renderEditor`、`catalog`、`skill`、`getController` 均被报告。禁用规则、配置
`allowExportNames`、借 `.test.` 命名避开扫描或把组件和 helper 继续放在单文件中改用 `createElement` 都只会
绕过检查，不消除 owner 混合；公共 `.ts` support 与私有 component-only `.tsx` fixture 才直接满足约束。

本修订作为两份工作文档的独立 docs-only `DOCS_AMENDMENT_COMMIT` 落在主 `dev`。Editor branch/worktree
base 必须保持原 `DOCS_COMMIT`；应用本修订时存在的任意 in-scope 未提交状态必须原样保留。本修订只授权
工作文档变更，不授权为了制造祖先关系 rebase、restore 或 cleanup Editor worktree。Editor 实现继续前必须
先形成 `DOCS_AMENDMENT_COMMIT`。后续
`N52-INTEGRATE-EDITOR` 把仍以原 `DOCS_COMMIT` 为 parent 的 `EDITOR_COMMIT` cherry-pick 到执行时当前
`dev`；该 `dev` 必须已经包含 `DOCS_AMENDMENT_COMMIT` 与其余三个已集成任务。

## 唯一目标与完成语义

在不改变生产行为、测试场景边界、事件顺序和完整断言的前提下，建立四个 test-only 深 Module：

1. `composerTurnControlBrowserTestSupport.tsx` 统一 ComposerTurnControl Browser mount graph；
2. 唯一公共 `composerEditorBrowserTestSupport.ts` 与私有 component-only
   `composerEditorBrowserTestFixture.tsx` 统一 ComposerEditor Browser fixture 与普通 render helper；
3. `appComposerQueueBrowserTestSupport.tsx` 统一 App composer queue mount、pending readers 与 command readers；
4. `composerInputQueueCoordinatorTestFixtures.ts` 统一 coordinator construction 与单步 fixture。

完成以四个任务提交集成后的最终状态判断：全部原测试场景、名称、事件/RPC/Promise/交互顺序和完整断言
保留，目标测试被非零收集并通过，format/lint/type-check/unit/Browser Level 1 验证通过，production 无 diff，
目标 `jscpd` 大块重复族消失且总体指标作为观察值下降。`jscpd` 数字不是硬门槛，也不允许通过删除测试、
放宽断言、ignore、fallback、兼容层或 CI 豁免来改善。

## 已核验执行事实

- 当前 checkout 为 `/Users/jiangsheng/cnb/codex`，branch `dev`，HEAD 为
  `8de6f1cab63e895926e3507562d5717d7adef626`；当前已知工作树变化只有未跟踪的本设计文档与本计划文档。
- `codex-gui/package.json` 的权威前端入口包括 `format:oxfmt:fix`、`format:oxfmt`、`lint`、
  `type-check`、`test:unit`、`test:browser:parallel` 和 `test:browser:sequential`。
- `vitest.browser.parallel.config.ts` 收集 `src/**/*.browser.test.ts(x)`，排除 sequential 目录，并在 headless
  Chromium、Firefox、WebKit 中运行；`vitest.browser.shared.config.ts` 固定 `headless: true`。
- 本地 Vitest 文档确认 CLI 文件路径参数只加载匹配文件；Browser locator 的异步 DOM 断言继续使用
  `expect.element`，不因本次支撑重构改写测试断言模型。
- `/opt/homebrew/bin/fnm` 存在，fnm-backed `pnpm` 当前版本为 `10.34.5`；`jscpd` 当前可解析。执行每个
  命令前仍须在对应 worktree 重做 cwd、工具来源、配置输入和目标收集预检；禁止安装缺失组件。
- `/Users/jiangsheng/cnb/codex/.worktrees/vitest` 是 symlink，直接目标为
  `/Users/jiangsheng/cnb/vitest`，最终物理目标为 `/Users/jiangsheng/GitHub/vitest`。四条 worktree 命令必须
  传 `--vitest-root /Users/jiangsheng/cnb/vitest`，不得迁移或覆盖现有 direct mapping。
- 下列四个 worktree 路径与 branch 在计划编写时不存在；执行创建前必须重新核验。
- 默认 sparse control plane 在当前基线存在：`.codex/skills`、`.agents/skills`、`docs/superpowers`、
  `codex-gui`、app-server protocol 与 gui-host 的 TypeScript/JSON schema 目录。
- 风险等级为中低：只改测试与测试支撑，无生产、wire contract、生成链或真实运行时行为变化；主要风险是
  Vitest mock hoisting、mount/revision 顺序、fixture 默认值、分页读取完整性和 helper 隐藏因果顺序。

## 精确修改范围与任务提交

### `TASK-DOC`：工作文档提交

提交只包含：

- `docs/superpowers/specs/2026/09/04/2026-09-04-codex-gui-test-support-duplication-refactor-design.md`
- `docs/superpowers/plans/2026/09/04/2026-09-04-codex-gui-test-support-duplication-refactor-plan.md`

建议提交信息：`docs: plan test support duplication refactor`。

### `TASK-DOC-AMENDMENT`：Editor seam 修订文档提交

独立 docs-only 提交仍只包含上述两份工作文档，记录公共 `.ts` support、私有 component-only `.tsx`
fixture、Editor 十个 path identities 与修订后的集成拓扑，不包含代码、运行状态或其他文档。

建议提交信息：`docs: refine composer editor test support seam`。

### `TASK-TURN-CONTROL`：ComposerTurnControl Browser 支撑

- branch：`codex/gui-test-support-turn-control`
- worktree：`/Users/jiangsheng/cnb/codex/.worktrees/gui-test-support-turn-control`

write set：

- 新建 `codex-gui/src/features/composerTurnControl/__tests__/composerTurnControlBrowserTestSupport.tsx`
- 修改 `codex-gui/src/features/composerTurnControl/__tests__/composerTurnControlPendingInputBrowserTestSupport.tsx`
- 修改 `codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControlDelivery.browser.test.tsx`
- 修改 `codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControlInput.browser.test.tsx`
- 修改 `codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControlSession.browser.test.tsx`
- 修改 `codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControlPendingInput.browser.test.tsx`
- 修改 `codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControlPendingInputReordering.browser.test.tsx`

新 Module 拥有一次性 `renderComposerTurnControl(options)`、skill catalog harness、session/revision/subscription/
baseline mount graph 和 raw handles。旧 pending support 只保留 projected queue、分页、detail、movement 与
recovery fake。owner replacement JSX/rerender、mock 生命周期、事件数组、交互和断言留在 caller。

建议提交信息：`test(codex-gui): share composer turn control browser support`。

### `TASK-EDITOR`：ComposerEditor Browser 支撑

- branch：`codex/gui-test-support-editor`
- worktree：`/Users/jiangsheng/cnb/codex/.worktrees/gui-test-support-editor`

write set（十个 path identities）：

- 通过 `git mv` 将
  `codex-gui/src/features/composerEditor/__tests__/composerEditorSkillTokenBrowserTestSupport.tsx` 移为
  `codex-gui/src/features/composerEditor/__tests__/composerEditorBrowserTestSupport.ts`
- 新增私有 `codex-gui/src/features/composerEditor/__tests__/composerEditorBrowserTestFixture.tsx`，只导出
  `ComposerEditorFixture`；公共 `.ts` support re-export 该组件
- 删除 `codex-gui/src/features/composerEditor/__tests__/composerEditorSkillTokenBrowserTestFixture.tsx`
- 删除 `codex-gui/src/features/composerEditor/__tests__/composerEditorTypeaheadBrowserTestSupport.tsx`
- 删除 `codex-gui/src/features/composerEditor/__tests__/composerEditorTypeaheadBrowserTestFixture.tsx`
- 修改 `codex-gui/src/features/composerEditor/__tests__/ComposerEditorSkillTokenEditing.browser.test.tsx`
- 修改 `codex-gui/src/features/composerEditor/__tests__/ComposerEditorSkillTokenPresentation.browser.test.tsx`
- 修改 `codex-gui/src/features/composerEditor/__tests__/ComposerEditorTypeaheadMenu.browser.test.tsx`
- 修改 `codex-gui/src/features/composerEditor/__tests__/ComposerEditorTypeaheadSelection.browser.test.tsx`

唯一公共 `.ts` Module 只公开 `ComposerEditorFixture`、`renderEditor`、`catalog`、`skill`、`getController`；
私有 `.tsx` fixture 只导出组件，四个 caller 的 extensionless imports 保持。双 editor、Drawer、catalog
rerender、invalid topology、NodeSelection/DOM Selection/caret/history helpers 保留在 owning suite。

建议提交信息：`test(codex-gui): share composer editor browser support`。

### `TASK-APP-QUEUE`：App composer queue Browser 支撑

- branch：`codex/gui-test-support-app-queue`
- worktree：`/Users/jiangsheng/cnb/codex/.worktrees/gui-test-support-app-queue`

write set：

- 新建 `codex-gui/src/__tests__/appComposerQueueBrowserTestSupport.tsx`
- 修改 `codex-gui/src/__tests__/AppComposerQueueOrdinary.browser.test.tsx`
- 修改 `codex-gui/src/__tests__/AppComposerQueueSteer.browser.test.tsx`
- 修改 `codex-gui/src/__tests__/AppComposerQueueInterrupt.browser.test.tsx`
- 修改 `codex-gui/src/__tests__/AppActiveThreadSession.browser.test.tsx`
- 修改 `codex-gui/src/__tests__/smoke/AppComposerQueue.smoke.browser.test.tsx`

新 Module 拥有 `renderActiveComposerQueueApp`、完整分页的 `readAllPendingItems`、
`readPendingTextPreviews`、`startTurnParamsAt`、`steerTurnParamsAt`、
`readGuiHostCommandCallCounts` 和 `dispatchGuideShortcut`。后两个非主 queue suite 只复用纯 reader，不复用
active App mount。顶层 hoisted mock、deferred settle、projection/RPC 顺序和完整 request 断言保持显式。

建议提交信息：`test(codex-gui): share app composer queue browser support`。

### `TASK-QUEUE-COORDINATOR`：Coordinator fixtures

- branch：`codex/gui-test-support-queue-coordinator`
- worktree：`/Users/jiangsheng/cnb/codex/.worktrees/gui-test-support-queue-coordinator`

write set：

- 新建 `codex-gui/src/features/composerInputQueue/__tests__/composerInputQueueCoordinatorTestFixtures.ts`
- 修改 `codex-gui/src/features/composerInputQueue/__tests__/composerInputQueueCoordinatorInterruptDelivery.test.ts`
- 修改 `codex-gui/src/features/composerInputQueue/__tests__/composerInputQueueCoordinatorManagementLifecycle.test.ts`
- 修改 `codex-gui/src/features/composerInputQueue/__tests__/composerInputQueueCoordinatorManagementRecovery.test.ts`
- 修改 `codex-gui/src/features/composerInputQueue/__tests__/composerInputQueueCoordinatorManagementReplay.test.ts`
- 修改 `codex-gui/src/features/composerInputQueue/__tests__/composerInputQueueCoordinatorMove.test.ts`
- 修改 `codex-gui/src/features/composerInputQueue/__tests__/composerInputQueueCoordinatorRelease.test.ts`
- 修改 `codex-gui/src/features/composerInputQueue/__tests__/composerInputQueueCoordinatorStartDelivery.test.ts`
- 修改 `codex-gui/src/features/composerInputQueue/__tests__/composerInputQueueCoordinatorSteerDelivery.test.ts`

新 fixture Module 公开机械派生的 `StartTurn`/`SteerTurn`/`InterruptTurn` 与 `createCoordinator`、
`deferredStart`、`live`、`pendingItem`、`committedUserMessage`、`nextMicrotask`。不移动 coordinator mutation、
settlement、observation、recovery、request/response 队列和完整 expected object。

建议提交信息：`test(codex-gui): share queue coordinator fixtures`。

所有已存在文件的删除必须用 `git rm`；文件移动必须用 `git mv`。普通 TypeScript/TSX 内容变更在没有
更高层迁移工具时使用 `apply_patch`。四个任务都是不改变行为的测试组织重构，不得顺手重排范围外代码。
每个 task commit 创建后必须用其 parent tree 与 commit tree 做完整比较，不能用 clean worktree 的无参数
`git diff` 代替；最终组合审查统一使用 `DOCS_COMMIT..HEAD`。

## 描述式执行 DAG

下列节点记录是权威执行结构。节点编号、文档顺序和提交顺序本身不构成依赖。

### 文档门禁与统一预配

#### `N00-DOC-REVIEW`

- `taskBoundary`: `TASK-DOC`
- `operationKind`: 审查
- `outcome`: 两份工作文档与已确认设计、当前计划和精确 allowlist 一致。
- `estimatedCost`: 小
- `deferralEvidence`: 无；计划确认后属于初始 ready set。
- `hardPredecessors`: 无。
- `consumes`: 已确认设计、待确认计划、当前 `dev` status/HEAD。
- `produces`: 两文档 allowlist 与可 stage 审查证据。
- `completionEvidence`: 直接读取两份文档并检查尾随空白；`git status --short` 证明仅两份目标文档待提交。
- `readSet`: 两份文档、`dev` status/diff/HEAD。
- `writeSet`: 空。
- `stateEffects`: 仅审查结果。
- `commandScope`: `git status --short --branch`、`sed`、`rg -n '[[:blank:]]+$'` 与只读路径/链接检查；
  不把普通 `git diff` 用作未跟踪文件内容证据。
- `subdelegation`: 禁止。
- `executionContext`: 主 checkout / `dev` / 共享 index，只读。
- `resourceLocks`: `/Users/jiangsheng/cnb/codex` tree 与 `/Users/jiangsheng/cnb/codex/.git/index` read。
- `owner`: 主代理协调，文档 Git owner 子代理执行审查。
- `verification`: 设计状态为已确认；计划状态为执行时已确认；allowlist 精确为两文件。
- `failureDomain`: `N01-DOC-STAGE` 及全部实现后继。
- `replanTriggers`: 文档与设计不等价、HEAD 漂移使计划事实失效、目标路径出现重叠用户修改。
- `authorizationGate`: `pending`；用户明确确认本计划后转为 active，只读审查能力。

#### `N01-DOC-STAGE`

- `taskBoundary`: `TASK-DOC`
- `operationKind`: stage
- `outcome`: 主 index 只包含两份工作文档。
- `estimatedCost`: 小
- `deferralEvidence`: 无。
- `hardPredecessors`: `N00-DOC-REVIEW`；等待精确 allowlist 证据。
- `consumes`: 两文档 allowlist。
- `produces`: 两文档 staged snapshot。
- `completionEvidence`: `git diff --cached --name-only` 精确等于两路径，`git diff --cached --check` 通过。
- `readSet`: 两文档与主 index。
- `writeSet`: 主 index 中两文档条目。
- `stateEffects`: 更新 `/Users/jiangsheng/cnb/codex/.git/index`。
- `commandScope`: `git add -- <design-doc> <plan-doc>` 及只读 staged 检查。
- `subdelegation`: 禁止。
- `executionContext`: 主 checkout / `dev` / 独占主 index。
- `resourceLocks`: `/Users/jiangsheng/cnb/codex/.git/index` write。
- `owner`: `TASK-DOC` 唯一 Git owner 子代理。
- `verification`: staged name/status/diff/check 精确审查。
- `failureDomain`: `N02-DOC-COMMIT` 及全部实现后继。
- `replanTriggers`: index 已含 allowlist 外路径或 staged snapshot 与审查证据不一致。
- `authorizationGate`: `pending`；计划确认后只授权两路径 stage。

#### `N02-DOC-COMMIT`

- `taskBoundary`: `TASK-DOC`
- `operationKind`: commit
- `outcome`: 创建 docs-only 本地提交。
- `estimatedCost`: 小
- `deferralEvidence`: 无。
- `hardPredecessors`: `N01-DOC-STAGE`；等待已审查 staged snapshot。
- `consumes`: 两文档 staged snapshot。
- `produces`: `DOCS_COMMIT` 与更新后的 `dev` HEAD。
- `completionEvidence`: 新提交只含两文档，信息为 `docs: plan test support duplication refactor`。
- `readSet`: staged snapshot、Git identity、当前 HEAD。
- `writeSet`: `dev` ref、Git object database、主 index。
- `stateEffects`: 一个本地提交；无 remote。
- `commandScope`: `git commit -m 'docs: plan test support duplication refactor'` 与只读提交核验。
- `subdelegation`: 禁止。
- `executionContext`: 主 checkout / `dev` / 独占主 index。
- `resourceLocks`: `/Users/jiangsheng/cnb/codex/.git/index`、主 worktree 与 `refs/heads/dev` write；Git object
  database 由 Git 自身原子协议管理，不作为外部独占调度锁。
- `owner`: `TASK-DOC` 唯一 Git owner 子代理。
- `verification`: `git show`、`git diff-tree` 核对提交边界并记录完整 SHA 为 `DOCS_COMMIT`。
- `failureDomain`: `N03A` 至 `N03D`、`N04` 及全部实现后继。
- `replanTriggers`: commit hook 产生计划外文件、提交边界不精确、`dev` 被并发推进。
- `authorizationGate`: `pending`；计划确认后授权精确 docs-only 本地提交，不含 amend/remote。

#### `N03A-WORKTREE-TURN`

- `taskBoundary`: 无提交；turn-control 执行上下文预配
- `operationKind`: 生成
- `outcome`: 从 `DOCS_COMMIT` 创建并验收 turn-control sparse worktree。
- `estimatedCost`: 中
- `deferralEvidence`: 无；与其余 worktree 节点同时 ready，共享 registry write lock 释放后立即调度。
- `hardPredecessors`: `N02-DOC-COMMIT`；实现上下文必须包含已提交工作文档。
- `consumes`: `DOCS_COMMIT`、worktree 脚本、默认 sparse 输入、Vitest direct mapping。
- `produces`: turn-control worktree/branch/index/sparse list/resource links/clean status。
- `completionEvidence`: 脚本成功并报告 `$codex-gui-worktree` 完整验收清单。
- `readSet`: repo/worktree/vitest metadata、`DOCS_COMMIT` tree、脚本与默认 sparse 输入。
- `writeSet`: `/Users/jiangsheng/cnb/codex/.worktrees/gui-test-support-turn-control`、branch
  `codex/gui-test-support-turn-control`、对应 worktree registry/index/links。
- `stateEffects`: 创建一个本地 branch、sparse worktree、目录和脚本规定的 symlink。
- `commandScope`: 重检冲突与 mapping 后运行：

  ```bash
  bash .codex/skills/codex-gui-worktree/scripts/create-codex-gui-worktree.sh --name gui-test-support-turn-control --branch codex/gui-test-support-turn-control --base <DOCS_COMMIT> --repo-root /Users/jiangsheng/cnb/codex --worktree-root /Users/jiangsheng/cnb/codex/.worktrees --vitest-root /Users/jiangsheng/cnb/vitest
  ```
- `subdelegation`: 禁止。
- `executionContext`: 主 repo 调脚本，产出独立 turn-control context。
- `resourceLocks`: `/Users/jiangsheng/cnb/codex/.git/worktrees` write、目标 branch ref write、目标路径 write；
  `/Users/jiangsheng/cnb/codex/.worktrees/vitest` direct mapping read。
- `owner`: turn-control worktree 准备子代理。
- `verification`: path/branch/sparse/control-plane/schema/linked resources/status 全量验收。
- `failureDomain`: 本节点与 `N04-WORKTREE-FAN-IN`；不删除其他已成功 worktree。
- `replanTriggers`: path/branch/symlink 冲突、base 不等于 `DOCS_COMMIT`、sparse 输入缺失、脚本要求覆盖。
- `authorizationGate`: `pending`；计划确认后授权该精确创建动作，禁止 force/overwrite/cleanup/remote。

#### `N03B-WORKTREE-EDITOR`

- `taskBoundary`: 无提交；editor 执行上下文预配
- `operationKind`: 生成
- `outcome`: 从 `DOCS_COMMIT` 创建并验收 editor sparse worktree。
- `estimatedCost`: 中
- `deferralEvidence`: 无；共享 registry write lock 释放后立即调度。
- `hardPredecessors`: `N02-DOC-COMMIT`。
- `consumes`: `DOCS_COMMIT`、worktree 脚本、默认 sparse 输入、Vitest direct mapping。
- `produces`: editor worktree/branch/index/sparse list/resource links/clean status。
- `completionEvidence`: 脚本成功并报告完整验收清单。
- `readSet`: repo/worktree/vitest metadata、`DOCS_COMMIT` tree、脚本与默认 sparse 输入。
- `writeSet`: `/Users/jiangsheng/cnb/codex/.worktrees/gui-test-support-editor`、branch
  `codex/gui-test-support-editor`、对应 registry/index/links。
- `stateEffects`: 创建一个本地 branch、sparse worktree、目录和脚本规定的 symlink。
- `commandScope`: 重检后运行：

  ```bash
  bash .codex/skills/codex-gui-worktree/scripts/create-codex-gui-worktree.sh --name gui-test-support-editor --branch codex/gui-test-support-editor --base <DOCS_COMMIT> --repo-root /Users/jiangsheng/cnb/codex --worktree-root /Users/jiangsheng/cnb/codex/.worktrees --vitest-root /Users/jiangsheng/cnb/vitest
  ```
- `subdelegation`: 禁止。
- `executionContext`: 主 repo 调脚本，产出独立 editor context。
- `resourceLocks`: `/Users/jiangsheng/cnb/codex/.git/worktrees` write、目标 branch ref write、目标路径 write；
  Vitest direct mapping read。
- `owner`: editor worktree 准备子代理。
- `verification`: `$codex-gui-worktree` 完整验收。
- `failureDomain`: 本节点与 `N04-WORKTREE-FAN-IN`；保留其他成功现场。
- `replanTriggers`: path/branch/symlink/base/sparse 冲突或覆盖要求。
- `authorizationGate`: `pending`；计划确认后授权该精确创建动作。

#### `N03C-WORKTREE-APP`

- `taskBoundary`: 无提交；app-queue 执行上下文预配
- `operationKind`: 生成
- `outcome`: 从 `DOCS_COMMIT` 创建并验收 app-queue sparse worktree。
- `estimatedCost`: 中
- `deferralEvidence`: 无；共享 registry write lock 释放后立即调度。
- `hardPredecessors`: `N02-DOC-COMMIT`。
- `consumes`: `DOCS_COMMIT`、worktree 脚本、默认 sparse 输入、Vitest direct mapping。
- `produces`: app-queue worktree/branch/index/sparse list/resource links/clean status。
- `completionEvidence`: 脚本成功并报告完整验收清单。
- `readSet`: repo/worktree/vitest metadata、`DOCS_COMMIT` tree、脚本与默认 sparse 输入。
- `writeSet`: `/Users/jiangsheng/cnb/codex/.worktrees/gui-test-support-app-queue`、branch
  `codex/gui-test-support-app-queue`、对应 registry/index/links。
- `stateEffects`: 创建一个本地 branch、sparse worktree、目录和脚本规定的 symlink。
- `commandScope`: 重检后运行：

  ```bash
  bash .codex/skills/codex-gui-worktree/scripts/create-codex-gui-worktree.sh --name gui-test-support-app-queue --branch codex/gui-test-support-app-queue --base <DOCS_COMMIT> --repo-root /Users/jiangsheng/cnb/codex --worktree-root /Users/jiangsheng/cnb/codex/.worktrees --vitest-root /Users/jiangsheng/cnb/vitest
  ```
- `subdelegation`: 禁止。
- `executionContext`: 主 repo 调脚本，产出独立 app-queue context。
- `resourceLocks`: `/Users/jiangsheng/cnb/codex/.git/worktrees` write、目标 branch ref write、目标路径 write；
  Vitest direct mapping read。
- `owner`: app-queue worktree 准备子代理。
- `verification`: `$codex-gui-worktree` 完整验收。
- `failureDomain`: 本节点与 `N04-WORKTREE-FAN-IN`；保留其他成功现场。
- `replanTriggers`: path/branch/symlink/base/sparse 冲突或覆盖要求。
- `authorizationGate`: `pending`；计划确认后授权该精确创建动作。

#### `N03D-WORKTREE-COORD`

- `taskBoundary`: 无提交；coordinator 执行上下文预配
- `operationKind`: 生成
- `outcome`: 从 `DOCS_COMMIT` 创建并验收 coordinator sparse worktree。
- `estimatedCost`: 中
- `deferralEvidence`: 无；共享 registry write lock 释放后立即调度。
- `hardPredecessors`: `N02-DOC-COMMIT`。
- `consumes`: `DOCS_COMMIT`、worktree 脚本、默认 sparse 输入、Vitest direct mapping。
- `produces`: coordinator worktree/branch/index/sparse list/resource links/clean status。
- `completionEvidence`: 脚本成功并报告完整验收清单。
- `readSet`: repo/worktree/vitest metadata、`DOCS_COMMIT` tree、脚本与默认 sparse 输入。
- `writeSet`: `/Users/jiangsheng/cnb/codex/.worktrees/gui-test-support-queue-coordinator`、branch
  `codex/gui-test-support-queue-coordinator`、对应 registry/index/links。
- `stateEffects`: 创建一个本地 branch、sparse worktree、目录和脚本规定的 symlink。
- `commandScope`: 重检后运行：

  ```bash
  bash .codex/skills/codex-gui-worktree/scripts/create-codex-gui-worktree.sh --name gui-test-support-queue-coordinator --branch codex/gui-test-support-queue-coordinator --base <DOCS_COMMIT> --repo-root /Users/jiangsheng/cnb/codex --worktree-root /Users/jiangsheng/cnb/codex/.worktrees --vitest-root /Users/jiangsheng/cnb/vitest
  ```
- `subdelegation`: 禁止。
- `executionContext`: 主 repo 调脚本，产出独立 coordinator context。
- `resourceLocks`: `/Users/jiangsheng/cnb/codex/.git/worktrees` write、目标 branch ref write、目标路径 write；
  Vitest direct mapping read。
- `owner`: coordinator worktree 准备子代理。
- `verification`: `$codex-gui-worktree` 完整验收。
- `failureDomain`: 本节点与 `N04-WORKTREE-FAN-IN`；保留其他成功现场。
- `replanTriggers`: path/branch/symlink/base/sparse 冲突或覆盖要求。
- `authorizationGate`: `pending`；计划确认后授权该精确创建动作。

#### `N04-WORKTREE-FAN-IN`

- `taskBoundary`: 无提交；实现前统一预配屏障
- `operationKind`: fan-in
- `outcome`: 四个独立 worktree 的稳定验收证据全部可用。
- `estimatedCost`: 小
- `deferralEvidence`: 无。
- `hardPredecessors`: `N03A-WORKTREE-TURN`、`N03B-WORKTREE-EDITOR`、`N03C-WORKTREE-APP`、
  `N03D-WORKTREE-COORD`；全局规则要求所有相关 worktree 预配完成后才开始实现。
- `consumes`: 四份 worktree completion evidence。
- `produces`: 可解锁 `N05A-DOC-AMEND-EDIT`、`N10-TURN-EDIT`、`N30-APP-EDIT`、`N40-COORD-EDIT`，并满足
  `N20-EDITOR-EDIT` 一个硬前提的统一预配证据。
- `completionEvidence`: 四 worktree 均指向同一 `DOCS_COMMIT`，各自 status clean、control plane 与 links 完整。
- `readSet`: 四 worktree 的 HEAD/status/sparse/link metadata。
- `writeSet`: 空。
- `stateEffects`: 仅 fan-in 结论。
- `commandScope`: 只读 `git worktree list --porcelain`、各 worktree HEAD/status/sparse/link 检查。
- `subdelegation`: 禁止。
- `executionContext`: 主 repo 协调，四 worktree 只读。
- `resourceLocks`: 四 worktree metadata/read。
- `owner`: 主代理协调的预配审查子代理。
- `verification`: base、branch、path、index 与链接逐一对应。
- `failureDomain`: amendment 文档链与四个实现任务；失败的创建节点独立保留现场，不自动 cleanup。
- `replanTriggers`: 任一 worktree HEAD/base/link/status 与验收证据不一致。
- `authorizationGate`: `pending`；计划确认后只读 fan-in active。

#### `N05A-DOC-AMEND-EDIT`

- `taskBoundary`: `TASK-DOC-AMENDMENT`
- `operationKind`: 编辑
- `outcome`: 两份工作文档记录已确认的 Editor 公共 `.ts` support、私有 component-only `.tsx` fixture、十个
  path identities 与修订后集成拓扑。
- `estimatedCost`: 小
- `deferralEvidence`: 无。
- `hardPredecessors`: `N04-WORKTREE-FAN-IN`；等待四个 worktree 已稳定固定在原 `DOCS_COMMIT`。
- `consumes`: 用户选择 A、Editor lint 失败与规则 owner 证据、原设计和计划。
- `produces`: 两份工作文档内未暂存的 amendment diff。
- `completionEvidence`: 设计与计划只修改两份 allowlist 文档，公共五入口、十个 path identities、原
  `DOCS_COMMIT` worktree base、最后集成顺序和所有排除项一致。
- `readSet`: 两份工作文档、Editor lint/config/plugin 证据与主 status/HEAD/index。
- `writeSet`:
  `docs/superpowers/specs/2026/09/04/2026-09-04-codex-gui-test-support-duplication-refactor-design.md` 与
  `docs/superpowers/plans/2026/09/04/2026-09-04-codex-gui-test-support-duplication-refactor-plan.md`。
- `stateEffects`: 仅修改两份工作文档；不修改代码、worktree 或 Git index。
- `commandScope`: `apply_patch` 编辑两份文档，以及只读 diff/status/路径/尾随空白检查。
- `subdelegation`: 禁止。
- `executionContext`: 主 checkout/`dev`，主 index 只读。
- `resourceLocks`: 上述两份工作文档 write；`/Users/jiangsheng/cnb/codex/.git/index` read。
- `owner`: amendment 文档编辑子代理。
- `verification`: 逐项核对设计、`TASK-EDITOR`、`N20` 至 `N25`、`N52`、`N59`、`N55` 与 ready/关键路径。
- `failureDomain`: `N05B` 至 `N05D`、`N20` 至 `N25`、`N52`、`N59`、`N55`。
- `replanTriggers`: 需要第三个文档、代码文件、Editor 第十个 identity 外目标或产品行为改变。
- `authorizationGate`: `active`；用户选择 A 已授权两文档 amendment。

#### `N05B-DOC-AMEND-REVIEW`

- `taskBoundary`: `TASK-DOC-AMENDMENT`
- `operationKind`: 审查
- `outcome`: amendment diff 与用户选择 A、lint 根因、设计不变量及描述式 DAG 一致。
- `estimatedCost`: 小
- `deferralEvidence`: 无。
- `hardPredecessors`: `N05A-DOC-AMEND-EDIT`；等待稳定的两文档 diff。
- `consumes`: 两文档 amendment diff、用户选择 A 与 lint 证据。
- `produces`: 两文档精确 stage allowlist。
- `completionEvidence`: `git diff --check` 通过；仅两文档变化；无旧 `.tsx` 公共 support、九 path identities、
  动态运行状态或 DAG 前提矛盾残留。
- `readSet`: 两份工作文档、主 status/index 与 amendment diff。
- `writeSet`: 空。
- `stateEffects`: 仅审查结论。
- `commandScope`: 只读 `git status`、`git diff`、`git diff --check`、`rg` 与路径检查。
- `subdelegation`: 禁止。
- `executionContext`: 主 checkout/`dev`，主 index 只读。
- `resourceLocks`: 两份工作文档与 `/Users/jiangsheng/cnb/codex/.git/index` read。
- `owner`: 独立 amendment 文档 review 子代理。
- `verification`: 反向审查四节点 amendment DAG、N20 前提、N52 最后集成和静态现场约束。
- `failureDomain`: `N05C`、`N05D` 及所有消费 amendment 的 Editor 后继。
- `replanTriggers`: allowlist、十路径、集成前提或静态约束不精确。
- `authorizationGate`: `active`；用户选择 A 授权只读 amendment review。

#### `N05C-DOC-AMEND-STAGE`

- `taskBoundary`: `TASK-DOC-AMENDMENT`
- `operationKind`: stage
- `outcome`: 主 index 只含两份 amendment 工作文档。
- `estimatedCost`: 小
- `deferralEvidence`: 无。
- `hardPredecessors`: `N05B-DOC-AMEND-REVIEW`；等待精确 allowlist 审查证据。
- `consumes`: 审查通过的两文档 amendment diff。
- `produces`: 两文档 staged snapshot。
- `completionEvidence`: cached name/status 精确等于两份文档，`git diff --cached --check` 通过。
- `readSet`: 两份工作文档与主 index。
- `writeSet`: `/Users/jiangsheng/cnb/codex/.git/index` 中两份文档条目。
- `stateEffects`: 精确 stage 两份文档。
- `commandScope`: 精确运行
  `git add -- docs/superpowers/specs/2026/09/04/2026-09-04-codex-gui-test-support-duplication-refactor-design.md docs/superpowers/plans/2026/09/04/2026-09-04-codex-gui-test-support-duplication-refactor-plan.md`，
  随后只读审查 cached name/status/diff/check。
- `subdelegation`: 禁止。
- `executionContext`: 主 checkout/`dev`/独占主 index。
- `resourceLocks`: `/Users/jiangsheng/cnb/codex/.git/index` write。
- `owner`: `TASK-DOC-AMENDMENT` 唯一 Git owner。
- `verification`: staged snapshot 仅两文档且内容等于 review 产物。
- `failureDomain`: `N05D-DOC-AMEND-COMMIT` 及所有消费 amendment 的 Editor 后继。
- `replanTriggers`: index 预含其他条目、cached allowlist 不精确或 check 失败。
- `authorizationGate`: `active`；用户选择 A 已授权精确两文档 stage。

#### `N05D-DOC-AMEND-COMMIT`

- `taskBoundary`: `TASK-DOC-AMENDMENT`
- `operationKind`: commit
- `outcome`: 在主 `dev` 创建独立 docs-only amendment commit。
- `estimatedCost`: 小
- `deferralEvidence`: 无。
- `hardPredecessors`: `N05C-DOC-AMEND-STAGE`；等待已审查 staged snapshot。
- `consumes`: 两文档 staged snapshot、Git identity 与执行时主 `dev` HEAD。
- `produces`: `DOCS_AMENDMENT_COMMIT`。
- `completionEvidence`: 新提交只含两份文档，提交信息精确为
  `docs: refine composer editor test support seam`；提交后主 status/index clean。
- `readSet`: staged snapshot、Git identity、主 HEAD/status/index。
- `writeSet`: `refs/heads/dev`、Git object database 与主 index。
- `stateEffects`: 一个独立 docs-only 本地提交；无 remote。
- `commandScope`: 精确 `git commit -m 'docs: refine composer editor test support seam'` 与只读
  show/diff-tree/status/rev-parse 审计。
- `subdelegation`: 禁止。
- `executionContext`: 主 checkout/`dev`/独占主 index。
- `resourceLocks`: `/Users/jiangsheng/cnb/codex/.git/index`、主 worktree 与 `refs/heads/dev` write；Git object
  database 由 Git 自身原子协议管理。
- `owner`: `TASK-DOC-AMENDMENT` 唯一 Git owner。
- `verification`: 记录完整 SHA，证明 parent 为执行时锁定 HEAD、边界为两文档且 subject 精确。
- `failureDomain`: `N20` 至 `N25`、`N52`、`N59`、`N55`。
- `replanTriggers`: HEAD 漂移、hook 越界、提交失败或边界不精确。
- `authorizationGate`: `active`；用户选择 A 已授权精确 docs-only 本地提交，无 amend/remote。

### 四个任务分支

`N10-TURN-EDIT`、`N30-APP-EDIT`、`N40-COORD-EDIT` 与 `N05A-DOC-AMEND-EDIT` 在
`N04-WORKTREE-FAN-IN` 完成后进入 ready set；`N20-EDITOR-EDIT` 还必须等待
`N05D-DOC-AMEND-COMMIT`。每个代码任务内部依赖固定为 `EDIT -> FORMAT -> VERIFY -> REVIEW -> STAGE ->
COMMIT`。所有 Vitest 节点共享
`/Users/jiangsheng/cnb/codex/codex-gui/node_modules/.vite` 的 write lock，因此 ready 时按锁排队；其他编辑、
格式化和静态验证不因该锁被人为串行化。

#### `N10-TURN-EDIT`

- `taskBoundary`: `TASK-TURN-CONTROL`
- `operationKind`: 编辑
- `outcome`: 通用 mount graph 移入新 Module，五个 caller 切换，旧 pending support 只保留 pending fake。
- `estimatedCost`: 大
- `deferralEvidence`: 无；预配后立即 ready。
- `hardPredecessors`: `N04-WORKTREE-FAN-IN`；等待四 worktree 统一预配证据。
- `consumes`: 已确认设计、现有五个 suites、pending support、production authoritative types。
- `produces`: 该任务 write set 内未格式化 diff。
- `completionEvidence`: 新 Interface 使用 tagged scenario/queue；无场景 DSL；mock、事件、交互、断言仍在 caller。
- `readSet`: 该任务 write set、直接 production/session/queue/skill/projection 类型与测试工具。
- `writeSet`: `TASK-TURN-CONTROL` 精确七文件。
- `stateEffects`: 修改独立 worktree 文件；不操作 index。
- `commandScope`: `apply_patch` 普通 TS/TSX 编辑和只读 diff；不删除 suite。
- `subdelegation`: 禁止。
- `executionContext`: turn-control worktree/branch，独立 index。
- `resourceLocks`: `TASK-TURN-CONTROL` 七个 absolute worktree file targets write；worktree index 不访问。
- `owner`: turn-control 编辑子代理。
- `verification`: 静态核对 Interface、不变量与 test name/断言/事件顺序无删除。
- `failureDomain`: 本任务 `N11` 至 `N15`；不影响其他任务。
- `replanTriggers`: 需要 production、计划外 suite、镜像类型、行为改变或 owner replacement DSL。
- `authorizationGate`: `pending`；计划确认后授权七文件编辑。

#### `N11-TURN-FORMAT`

- `taskBoundary`: `TASK-TURN-CONTROL`
- `operationKind`: 格式化
- `outcome`: 权威 oxfmt fix 处理 task diff，随后 check 通过。
- `estimatedCost`: 小
- `deferralEvidence`: 无。
- `hardPredecessors`: `N10-TURN-EDIT`；等待完整 task diff。
- `consumes`: turn-control task diff、live package script。
- `produces`: 格式化后的 task diff。
- `completionEvidence`: `format:oxfmt` exit 0；diff 仍仅命中 task write set。
- `readSet`: `codex-gui` tree、package/config、task files。
- `writeSet`: oxfmt 自动输出；预期边界为 task write set。
- `stateEffects`: `format:oxfmt:fix` 自动文件写入；不操作 index。
- `commandScope`: 在该 worktree `codex-gui` 运行 fnm-backed `pnpm run format:oxfmt:fix`，再运行
  `pnpm run format:oxfmt` 与只读 diff。若产生 write set 外变化，保留现场并暂停，不自动 restore。
- `subdelegation`: 禁止。
- `executionContext`: turn-control worktree。
- `resourceLocks`: `/Users/jiangsheng/cnb/codex/.worktrees/gui-test-support-turn-control/codex-gui` write。
- `owner`: 该任务唯一格式化 owner。
- `verification`: 格式检查与精确 diff audit。
- `failureDomain`: `N12` 至 `N15`。
- `replanTriggers`: formatter 输出越界、入口缺失或工具来源不是 fnm。
- `authorizationGate`: `pending`；计划确认后授权 task 格式化副作用。

#### `N12-TURN-VERIFY`

- `taskBoundary`: `TASK-TURN-CONTROL`
- `operationKind`: 验证
- `outcome`: 静态检查与五个目标 Browser files 在三浏览器非零收集并通过。
- `estimatedCost`: 大
- `deferralEvidence`: 无；共享 Vitest cache lock 冲突时保持 ready 等待锁。
- `hardPredecessors`: `N11-TURN-FORMAT`；验证稳定格式化 task state。
- `consumes`: 格式化 task diff、package scripts、parallel Browser config。
- `produces`: format/lint/type-check 与 focused Browser 证据。
- `completionEvidence`: 全部 exit 0，输出列出五个目标文件且测试数非零。
- `readSet`: 完整 `codex-gui` tree 与五个目标 tests。
- `writeSet`: 仅工具内部 cache/report 副作用。
- `stateEffects`: headless test/cache 状态；不修改源码/index。
- `commandScope`: 在该 worktree 的 `codex-gui` cwd 依次运行：

  ```bash
  /opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
  /opt/homebrew/bin/fnm exec --using-file pnpm run lint
  /opt/homebrew/bin/fnm exec --using-file pnpm run type-check
  /opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --config=vitest.browser.parallel.config.ts --run src/features/composerTurnControl/__tests__/ComposerTurnControlDelivery.browser.test.tsx src/features/composerTurnControl/__tests__/ComposerTurnControlInput.browser.test.tsx src/features/composerTurnControl/__tests__/ComposerTurnControlSession.browser.test.tsx src/features/composerTurnControl/__tests__/ComposerTurnControlPendingInput.browser.test.tsx src/features/composerTurnControl/__tests__/ComposerTurnControlPendingInputReordering.browser.test.tsx
  ```
- `subdelegation`: 禁止。
- `executionContext`: turn-control worktree / `codex-gui` cwd。
- `resourceLocks`: `/Users/jiangsheng/cnb/codex/codex-gui/node_modules/.vite` write；
  `/Users/jiangsheng/cnb/codex/.worktrees/gui-test-support-turn-control/codex-gui/.eslintcache` write；
  Playwright browser installation read，临时 profile 由进程隔离。
- `owner`: turn-control 验证子代理。
- `verification`: Level 1 headless Chromium/Firefox/WebKit，记录 collection 与结果。
- `failureDomain`: 本任务 `N13` 至 `N15`；失败作为证据进入计划内修正，不降低验证。
- `replanTriggers`: 配置未收集目标、需要可见浏览器、计划外文件或产品行为决定。
- `authorizationGate`: `pending`；计划确认后授权上述无头验证。

#### `N13-TURN-REVIEW`

- `taskBoundary`: `TASK-TURN-CONTROL`
- `operationKind`: 审查
- `outcome`: task diff 符合设计且无 production、断言、场景与顺序漂移。
- `estimatedCost`: 中
- `deferralEvidence`: 无。
- `hardPredecessors`: `N12-TURN-VERIFY`；等待稳定通过证据。
- `consumes`: 完整 task diff 与验证证据。
- `produces`: 精确 stage allowlist。
- `completionEvidence`: `git diff HEAD` 与 `git diff --check` 通过；新增/删除 test name 为零；
  task write set 外 diff 为零。
- `readSet`: task diff、目标测试、设计文档。
- `writeSet`: 空。
- `stateEffects`: 仅审查结论。
- `commandScope`: `git diff HEAD -- <TASK-TURN-CONTROL paths>`、`git diff --check`、status 与只读 `rg` 结构检查。
- `subdelegation`: 禁止。
- `executionContext`: turn-control worktree，只读 index。
- `resourceLocks`: turn-control task file targets 与
  `/Users/jiangsheng/cnb/codex/.git/worktrees/gui-test-support-turn-control/index` read。
- `owner`: 独立 review 子代理，不是编辑 owner。
- `verification`: 反向检查 DSL、fallback、镜像 DTO、顺序隐藏与断言删除。
- `failureDomain`: `N14`、`N15`。
- `replanTriggers`: 设计不变量被破坏或需要计划外修正。
- `authorizationGate`: `pending`；计划确认后只读审查 active。

#### `N14-TURN-STAGE`

- `taskBoundary`: `TASK-TURN-CONTROL`
- `operationKind`: stage
- `outcome`: 独立 index 只含 task 七文件。
- `estimatedCost`: 小
- `deferralEvidence`: 无。
- `hardPredecessors`: `N13-TURN-REVIEW`；等待 allowlist。
- `consumes`: 审查通过的 task diff。
- `produces`: task staged snapshot。
- `completionEvidence`: cached name-only 精确等于 write set，cached check 通过。
- `readSet`: task files/index。
- `writeSet`: turn-control worktree index。
- `stateEffects`: 精确 stage。
- `commandScope`: `git add --` 七路径与只读 cached 检查。
- `subdelegation`: 禁止。
- `executionContext`: turn-control worktree/独占 index。
- `resourceLocks`: `/Users/jiangsheng/cnb/codex/.git/worktrees/gui-test-support-turn-control/index` write。
- `owner`: 本任务唯一 Git owner。
- `verification`: staged diff 全量复核。
- `failureDomain`: `N15-TURN-COMMIT`。
- `replanTriggers`: index 污染或 staged snapshot 漂移。
- `authorizationGate`: `pending`；计划确认后授权精确 stage。

#### `N15-TURN-COMMIT`

- `taskBoundary`: `TASK-TURN-CONTROL`
- `operationKind`: commit
- `outcome`: 创建独立 turn-control task commit。
- `estimatedCost`: 小
- `deferralEvidence`: 无。
- `hardPredecessors`: `N14-TURN-STAGE`。
- `consumes`: task staged snapshot。
- `produces`: `TURN_COMMIT`。
- `completionEvidence`: commit 仅含七文件，信息为
  `test(codex-gui): share composer turn control browser support`。
- `readSet`: staged snapshot/Git identity。
- `writeSet`: task branch ref/object database/index。
- `stateEffects`: 一个本地提交。
- `commandScope`: 精确 `git commit -m` 与只读 commit audit。
- `subdelegation`: 禁止。
- `executionContext`: turn-control worktree/branch。
- `resourceLocks`: `/Users/jiangsheng/cnb/codex/.git/worktrees/gui-test-support-turn-control/index` 与
  `refs/heads/codex/gui-test-support-turn-control` write；Git object database 不作为外部独占锁。
- `owner`: 本任务唯一 Git owner。
- `verification`: 记录完整 SHA 与 commit boundary。
- `failureDomain`: 对应集成节点及 final fan-in。
- `replanTriggers`: hook 越界或提交边界不精确。
- `authorizationGate`: `pending`；计划确认后授权独立本地提交，无 amend/remote。

#### `N20-EDITOR-EDIT`

- `taskBoundary`: `TASK-EDITOR`
- `operationKind`: 编辑
- `outcome`: 两套 support/fixture 收敛为唯一公共 `.ts` Module 与私有 component-only `.tsx` fixture，四个
  caller 通过 extensionless import 切换。
- `estimatedCost`: 中
- `deferralEvidence`: 无。
- `hardPredecessors`: `N04-WORKTREE-FAN-IN` 与 `N05D-DOC-AMEND-COMMIT`；等待四 worktree 固定在原
  `DOCS_COMMIT` 的预配证据和独立 `DOCS_AMENDMENT_COMMIT`。
- `consumes`: `DOCS_AMENDMENT_COMMIT`、两套现有 support/fixture、四个 suites、权威
  editor/catalog/controller types，以及 Editor worktree 内必须保留的任意 in-scope 未提交状态。
- `produces`: task write set 内未格式化 diff。
- `completionEvidence`: 公共 `.ts` Module 保持五个短入口与原默认值并 re-export `ComposerEditorFixture`；
  私有 `.tsx` fixture 只导出该组件；四个 caller 保持 extensionless import；特殊 mount/selection 场景未吸收。
- `readSet`: task write set 与直接 production/test types。
- `writeSet`: `TASK-EDITOR` 精确十个 path identities，包括一项 move 的 source/destination、一个新增私有
  fixture、三项 delete 与四个 caller 修改。
- `stateEffects`: `git mv`、`git rm` 会把 rename/delete 写入 editor 独立 index；普通内容编辑保持 unstaged；
  不 stage 其他文件。
- `commandScope`: 精确 `git mv`、三个 `git rm --`、`apply_patch`、只读 diff。
- `subdelegation`: 禁止。
- `executionContext`: editor worktree/branch/独立 index；branch base 保持原 `DOCS_COMMIT`，不 rebase、restore
  或 cleanup，直接在保留的 in-scope 状态上完成修订后的实现。
- `resourceLocks`: `TASK-EDITOR` 十个 absolute path identities write；
  `/Users/jiangsheng/cnb/codex/.git/worktrees/gui-test-support-editor/index` write 仅用于 `git mv/rm`。
- `owner`: editor 编辑子代理。
- `verification`: fixture DOM/CSS、locale/catalog/controller readiness 与 extensionless imports 等价；公共
  `.ts`/私有 component-only `.tsx` owner 分离成立；后续审查必须合并读取 staged rename/delete 与 unstaged
  内容 diff。
- `failureDomain`: `N21` 至 `N25`。
- `replanTriggers`: 需要修改 Lifecycle/Drawer/双 editor suite、production props、第三个 support/fixture 文件
  或新增 Adapter。
- `authorizationGate`: `pending`；计划确认后授权精确 move/delete/edit。

#### `N21-EDITOR-FORMAT`

- `taskBoundary`: `TASK-EDITOR`
- `operationKind`: 格式化
- `outcome`: oxfmt fix/check 后 diff 仍局限于 `TASK-EDITOR` 十个 path identities。
- `estimatedCost`: 小
- `deferralEvidence`: 无。
- `hardPredecessors`: `N20-EDITOR-EDIT`。
- `consumes`: editor diff/package script。
- `produces`: 格式化 diff。
- `completionEvidence`: format check exit 0，范围 audit 精确覆盖十个 path identities。
- `readSet`: `codex-gui` tree/task files。
- `writeSet`: oxfmt 自动输出；预期严格为 `TASK-EDITOR` 十个 path identities。
- `stateEffects`: formatter 自动写入。
- `commandScope`: fnm-backed `pnpm run format:oxfmt:fix`、`pnpm run format:oxfmt`、只读 diff；越界则保留现场暂停。
- `subdelegation`: 禁止。
- `executionContext`: editor worktree。
- `resourceLocks`: `/Users/jiangsheng/cnb/codex/.worktrees/gui-test-support-editor/codex-gui` write。
- `owner`: editor 格式化 owner。
- `verification`: format 与范围检查。
- `failureDomain`: `N22` 至 `N25`。
- `replanTriggers`: formatter 越界或工具预检失败。
- `authorizationGate`: `pending`。

#### `N22-EDITOR-VERIFY`

- `taskBoundary`: `TASK-EDITOR`
- `operationKind`: 验证
- `outcome`: lint 验证公共 `.ts`/私有 component-only `.tsx` owner 分离，其他静态检查和四个 Browser suites
  三浏览器非零收集并通过。
- `estimatedCost`: 大
- `deferralEvidence`: 无；Vitest lock 冲突时 ready 等锁。
- `hardPredecessors`: `N21-EDITOR-FORMAT`。
- `consumes`: 格式化 diff、package scripts、Browser config。
- `produces`: format/lint/type/focused Browser 证据。
- `completionEvidence`: 全部 exit 0；lint 不再报告 `react-refresh/only-export-components`；输出命中四个目标
  files 且 tests 非零。
- `readSet`: 完整 GUI tree、`TASK-EDITOR` 十个 path identities、lint config 与四个 suites。
- `writeSet`: 工具 cache/report 副作用。
- `stateEffects`: headless Browser/cache 状态。
- `commandScope`: 在该 worktree 的 `codex-gui` cwd 依次运行：

  ```bash
  /opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
  /opt/homebrew/bin/fnm exec --using-file pnpm run lint
  /opt/homebrew/bin/fnm exec --using-file pnpm run type-check
  /opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --config=vitest.browser.parallel.config.ts --run src/features/composerEditor/__tests__/ComposerEditorSkillTokenEditing.browser.test.tsx src/features/composerEditor/__tests__/ComposerEditorSkillTokenPresentation.browser.test.tsx src/features/composerEditor/__tests__/ComposerEditorTypeaheadMenu.browser.test.tsx src/features/composerEditor/__tests__/ComposerEditorTypeaheadSelection.browser.test.tsx
  ```
- `subdelegation`: 禁止。
- `executionContext`: editor worktree/`codex-gui` cwd。
- `resourceLocks`: `/Users/jiangsheng/cnb/codex/codex-gui/node_modules/.vite` write；
  `/Users/jiangsheng/cnb/codex/.worktrees/gui-test-support-editor/codex-gui/.eslintcache` write；
  Playwright installation read，临时 profile 进程隔离。
- `owner`: editor 验证子代理。
- `verification`: Level 1 Chromium/Firefox/WebKit collection/result。
- `failureDomain`: `N23` 至 `N25`。
- `replanTriggers`: 未收集目标、需要可见验收或范围外修正。
- `authorizationGate`: `pending`。

#### `N23-EDITOR-REVIEW`

- `taskBoundary`: `TASK-EDITOR`
- `operationKind`: 审查
- `outcome`: 公共 `.ts` support 与私有 component-only `.tsx` fixture 只消除重复并满足 lint owner 约束，
  不参数化特殊场景或改变断言。
- `estimatedCost`: 中
- `deferralEvidence`: 无。
- `hardPredecessors`: `N22-EDITOR-VERIFY`。
- `consumes`: task diff/验证证据。
- `produces`: stage allowlist。
- `completionEvidence`: `git diff HEAD`、`git diff --cached`、diff/check/type derivation/import audit 通过；十个
  path identities 精确；私有 `.tsx` 只导出组件，公共 `.ts` re-export；四个 caller extensionless imports 与
  test names 无增删。
- `readSet`: task diff/设计/目标 suites。
- `writeSet`: 空。
- `stateEffects`: 审查结论。
- `commandScope`: `git diff HEAD -- <TASK-EDITOR paths>`、`git diff --cached -- <TASK-EDITOR paths>`、
  `git diff --check` 与只读 `rg` 检查。
- `subdelegation`: 禁止。
- `executionContext`: editor worktree。
- `resourceLocks`: editor task file identities 与
  `/Users/jiangsheng/cnb/codex/.git/worktrees/gui-test-support-editor/index` read。
- `owner`: 独立 review 子代理。
- `verification`: 检查无 arbitrary props/callback bag/fixtureKind/镜像类型，也无 lint disable、
  `allowExportNames`、`.test.` 命名绕过或单文件 component/helper 混合。
- `failureDomain`: `N24`、`N25`。
- `replanTriggers`: 特殊场景被隐藏或 delete 边界异常。
- `authorizationGate`: `pending`。

#### `N24-EDITOR-STAGE`

- `taskBoundary`: `TASK-EDITOR`
- `operationKind`: stage
- `outcome`: editor index 只含 `TASK-EDITOR` 十个 path identities。
- `estimatedCost`: 小
- `deferralEvidence`: 无。
- `hardPredecessors`: `N23-EDITOR-REVIEW`。
- `consumes`: 审查通过 diff。
- `produces`: staged snapshot。
- `completionEvidence`: cached name/status/check 精确覆盖一项 move 的 source/destination、一个新增私有 fixture、
  三项 delete 与四个 caller modify，共十个 path identities。
- `readSet`: task files/index。
- `writeSet`: editor index。
- `stateEffects`: 精确 stage。
- `commandScope`: `git add --` 新/修改路径；已删除路径已由 `git rm` 记录；只读 cached audit。
- `subdelegation`: 禁止。
- `executionContext`: editor worktree/独占 index。
- `resourceLocks`: `/Users/jiangsheng/cnb/codex/.git/worktrees/gui-test-support-editor/index` write。
- `owner`: 本任务唯一 Git owner。
- `verification`: staged diff 全量审查。
- `failureDomain`: `N25-EDITOR-COMMIT`。
- `replanTriggers`: index 污染，十个 path identities 不精确，或 move/delete/add 语义不符。
- `authorizationGate`: `pending`。

#### `N25-EDITOR-COMMIT`

- `taskBoundary`: `TASK-EDITOR`
- `operationKind`: commit
- `outcome`: 创建独立 editor task commit。
- `estimatedCost`: 小
- `deferralEvidence`: 无。
- `hardPredecessors`: `N24-EDITOR-STAGE`。
- `consumes`: staged snapshot。
- `produces`: `EDITOR_COMMIT`。
- `completionEvidence`: commit 边界精确为 `TASK-EDITOR` 十个 path identities，信息为
  `test(codex-gui): share composer editor browser support`。
- `readSet`: staged snapshot/Git identity。
- `writeSet`: editor branch ref/object database/index。
- `stateEffects`: 一个本地提交。
- `commandScope`: 精确 `git commit -m` 与只读 audit。
- `subdelegation`: 禁止。
- `executionContext`: editor worktree/branch。
- `resourceLocks`: `/Users/jiangsheng/cnb/codex/.git/worktrees/gui-test-support-editor/index` 与
  `refs/heads/codex/gui-test-support-editor` write；Git object database 不作为外部独占锁。
- `owner`: 本任务唯一 Git owner。
- `verification`: 记录 SHA 与边界。
- `failureDomain`: editor 集成节点/final fan-in。
- `replanTriggers`: hook 越界或提交不精确。
- `authorizationGate`: `pending`。

#### `N30-APP-EDIT`

- `taskBoundary`: `TASK-APP-QUEUE`
- `operationKind`: 编辑
- `outcome`: queue-specific mount/readers 集中，三个主 suites 与两个纯-reader consumers 切换。
- `estimatedCost`: 大
- `deferralEvidence`: 无。
- `hardPredecessors`: `N04-WORKTREE-FAN-IN`；等待四 worktree 统一预配证据。
- `consumes`: 六文件 write set、App/host/coordinator authoritative types、mock topology。
- `produces`: task write set 内未格式化 diff。
- `completionEvidence`: active mount 不用于 smoke/session；全分页 reader fail-fast；完整 request/事件顺序仍在 caller。
- `readSet`: task files、`appBrowserTestSupport.ts`、production App/host/queue types。
- `writeSet`: `TASK-APP-QUEUE` 精确六文件。
- `stateEffects`: 普通 TSX 编辑，不操作 index。
- `commandScope`: `apply_patch` 与只读 diff。
- `subdelegation`: 禁止。
- `executionContext`: app-queue worktree/branch。
- `resourceLocks`: `TASK-APP-QUEUE` 六个 absolute worktree file targets write。
- `owner`: app-queue 编辑子代理。
- `verification`: mock hoisting、分页 revision/cursor、command Record completeness、request assertions 静态审查。
- `failureDomain`: `N31` 至 `N35`。
- `replanTriggers`: 需要修改通用 `appBrowserTestSupport.ts`、production、silent retry 或页面对象 DSL。
- `authorizationGate`: `pending`。

#### `N31-APP-FORMAT`

- `taskBoundary`: `TASK-APP-QUEUE`
- `operationKind`: 格式化
- `outcome`: oxfmt fix/check 后 diff 仍在 task write set。
- `estimatedCost`: 小
- `deferralEvidence`: 无。
- `hardPredecessors`: `N30-APP-EDIT`。
- `consumes`: app task diff/package script。
- `produces`: 格式化 diff。
- `completionEvidence`: format check exit 0 与范围 audit 通过。
- `readSet`: GUI tree/task files。
- `writeSet`: oxfmt 自动输出；预期为 task write set。
- `stateEffects`: formatter 自动写入。
- `commandScope`: fnm-backed fix/check 与只读 diff；越界保留现场暂停。
- `subdelegation`: 禁止。
- `executionContext`: app-queue worktree。
- `resourceLocks`: `/Users/jiangsheng/cnb/codex/.worktrees/gui-test-support-app-queue/codex-gui` write。
- `owner`: app-queue 格式化 owner。
- `verification`: format/range check。
- `failureDomain`: `N32` 至 `N35`。
- `replanTriggers`: formatter 越界或预检失败。
- `authorizationGate`: `pending`。

#### `N32-APP-VERIFY`

- `taskBoundary`: `TASK-APP-QUEUE`
- `operationKind`: 验证
- `outcome`: 静态检查和五个 Browser suites 三浏览器非零收集并通过。
- `estimatedCost`: 大
- `deferralEvidence`: 无；Vitest lock 冲突时 ready 等锁。
- `hardPredecessors`: `N31-APP-FORMAT`。
- `consumes`: 格式化 diff/package scripts/Browser config。
- `produces`: format/lint/type/focused Browser evidence。
- `completionEvidence`: 全部 exit 0，五个目标 files/tests 非零。
- `readSet`: 完整 GUI tree与五个 Browser suites。
- `writeSet`: 工具 cache/report 副作用。
- `stateEffects`: headless Browser/cache 状态。
- `commandScope`: 在该 worktree 的 `codex-gui` cwd 依次运行：

  ```bash
  /opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
  /opt/homebrew/bin/fnm exec --using-file pnpm run lint
  /opt/homebrew/bin/fnm exec --using-file pnpm run type-check
  /opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --config=vitest.browser.parallel.config.ts --run src/__tests__/AppComposerQueueOrdinary.browser.test.tsx src/__tests__/AppComposerQueueSteer.browser.test.tsx src/__tests__/AppComposerQueueInterrupt.browser.test.tsx src/__tests__/AppActiveThreadSession.browser.test.tsx src/__tests__/smoke/AppComposerQueue.smoke.browser.test.tsx
  ```
- `subdelegation`: 禁止。
- `executionContext`: app-queue worktree/GUI cwd。
- `resourceLocks`: `/Users/jiangsheng/cnb/codex/codex-gui/node_modules/.vite` write；
  `/Users/jiangsheng/cnb/codex/.worktrees/gui-test-support-app-queue/codex-gui/.eslintcache` write；
  Playwright installation read，临时 profile 进程隔离。
- `owner`: app-queue 验证子代理。
- `verification`: Level 1 Chromium/Firefox/WebKit collection/result。
- `failureDomain`: `N33` 至 `N35`。
- `replanTriggers`: target collection 缺失、mock order failure 需要范围外改动、可见验收需求。
- `authorizationGate`: `pending`。

#### `N33-APP-REVIEW`

- `taskBoundary`: `TASK-APP-QUEUE`
- `operationKind`: 审查
- `outcome`: helper 只隐藏稳定机制，不隐藏 lane、settlement、RPC/projection 顺序或完整断言。
- `estimatedCost`: 中
- `deferralEvidence`: 无。
- `hardPredecessors`: `N32-APP-VERIFY`。
- `consumes`: task diff/验证证据。
- `produces`: stage allowlist。
- `completionEvidence`: `git diff HEAD`、diff/check/test-name/no-DSL audit 通过，task write set 外 diff 为零。
- `readSet`: task diff/设计/目标 suites。
- `writeSet`: 空。
- `stateEffects`: 审查结论。
- `commandScope`: `git diff HEAD -- <TASK-APP-QUEUE paths>`、`git diff --check` 与只读 `rg` 检查。
- `subdelegation`: 禁止。
- `executionContext`: app-queue worktree。
- `resourceLocks`: app-queue task file targets 与
  `/Users/jiangsheng/cnb/codex/.git/worktrees/gui-test-support-app-queue/index` read。
- `owner`: 独立 review 子代理。
- `verification`: Record 类型、分页 fail-fast、hoisted mocks 和完整 payload 对照。
- `failureDomain`: `N34`、`N35`。
- `replanTriggers`: helper 吞掉行为或 reader 改变产品/测试语义。
- `authorizationGate`: `pending`。

#### `N34-APP-STAGE`

- `taskBoundary`: `TASK-APP-QUEUE`
- `operationKind`: stage
- `outcome`: app-queue index 只含 task 六文件。
- `estimatedCost`: 小
- `deferralEvidence`: 无。
- `hardPredecessors`: `N33-APP-REVIEW`。
- `consumes`: 审查通过 diff。
- `produces`: staged snapshot。
- `completionEvidence`: cached name-only 精确，cached check 通过。
- `readSet`: task files/index。
- `writeSet`: app-queue index。
- `stateEffects`: 精确 stage。
- `commandScope`: `git add --` 六路径及 cached audit。
- `subdelegation`: 禁止。
- `executionContext`: app-queue worktree/独占 index。
- `resourceLocks`: `/Users/jiangsheng/cnb/codex/.git/worktrees/gui-test-support-app-queue/index` write。
- `owner`: 本任务唯一 Git owner。
- `verification`: staged diff 全量审查。
- `failureDomain`: `N35-APP-COMMIT`。
- `replanTriggers`: index 污染或 snapshot 漂移。
- `authorizationGate`: `pending`。

#### `N35-APP-COMMIT`

- `taskBoundary`: `TASK-APP-QUEUE`
- `operationKind`: commit
- `outcome`: 创建独立 app-queue task commit。
- `estimatedCost`: 小
- `deferralEvidence`: 无。
- `hardPredecessors`: `N34-APP-STAGE`。
- `consumes`: staged snapshot。
- `produces`: `APP_QUEUE_COMMIT`。
- `completionEvidence`: 精确六文件 commit，信息为
  `test(codex-gui): share app composer queue browser support`。
- `readSet`: staged snapshot/Git identity。
- `writeSet`: branch ref/object database/index。
- `stateEffects`: 一个本地提交。
- `commandScope`: 精确 `git commit -m` 与只读 audit。
- `subdelegation`: 禁止。
- `executionContext`: app-queue worktree/branch。
- `resourceLocks`: `/Users/jiangsheng/cnb/codex/.git/worktrees/gui-test-support-app-queue/index` 与
  `refs/heads/codex/gui-test-support-app-queue` write；Git object database 不作为外部独占锁。
- `owner`: 本任务唯一 Git owner。
- `verification`: 记录 SHA 与边界。
- `failureDomain`: app 集成节点/final fan-in。
- `replanTriggers`: hook 越界或提交不精确。
- `authorizationGate`: `pending`。

#### `N40-COORD-EDIT`

- `taskBoundary`: `TASK-QUEUE-COORDINATOR`
- `operationKind`: 编辑
- `outcome`: 八个 suites 改用单个 coordinator fixture Module，行为顺序仍显式。
- `estimatedCost`: 大
- `deferralEvidence`: 无。
- `hardPredecessors`: `N04-WORKTREE-FAN-IN`；等待四 worktree 统一预配证据。
- `consumes`: 九文件 write set、production coordinator/contracts、projection builders。
- `produces`: task write set 内未格式化 diff。
- `completionEvidence`: Start/Steer/Interrupt types 机械派生；`nextMicrotask` 仅一次 Promise；无 mutation DSL。
- `readSet`: task files、现有 queue fixtures、production/projection authoritative types。
- `writeSet`: `TASK-QUEUE-COORDINATOR` 精确九文件。
- `stateEffects`: 普通 TS 编辑，不操作 index。
- `commandScope`: `apply_patch` 与只读 diff。
- `subdelegation`: 禁止。
- `executionContext`: coordinator worktree/branch。
- `resourceLocks`: `TASK-QUEUE-COORDINATOR` 九个 absolute worktree file targets write。
- `owner`: coordinator 编辑子代理。
- `verification`: 每个 suite 的 submit/resolve/reject/observe/flush 顺序与完整断言逐项对照。
- `failureDomain`: `N41` 至 `N45`。
- `replanTriggers`: helper 需要调用 mutation、循环 drain、production export 或镜像 DTO。
- `authorizationGate`: `pending`。

#### `N41-COORD-FORMAT`

- `taskBoundary`: `TASK-QUEUE-COORDINATOR`
- `operationKind`: 格式化
- `outcome`: oxfmt fix/check 后 diff 仍在 task write set。
- `estimatedCost`: 小
- `deferralEvidence`: 无。
- `hardPredecessors`: `N40-COORD-EDIT`。
- `consumes`: coordinator diff/package script。
- `produces`: 格式化 diff。
- `completionEvidence`: format check exit 0 与范围 audit 通过。
- `readSet`: GUI tree/task files。
- `writeSet`: oxfmt 自动输出；预期为 task write set。
- `stateEffects`: formatter 自动写入。
- `commandScope`: fnm-backed fix/check 与只读 diff；越界保留现场暂停。
- `subdelegation`: 禁止。
- `executionContext`: coordinator worktree。
- `resourceLocks`: `/Users/jiangsheng/cnb/codex/.worktrees/gui-test-support-queue-coordinator/codex-gui` write。
- `owner`: coordinator 格式化 owner。
- `verification`: format/range check。
- `failureDomain`: `N42` 至 `N45`。
- `replanTriggers`: formatter 越界或预检失败。
- `authorizationGate`: `pending`。

#### `N42-COORD-VERIFY`

- `taskBoundary`: `TASK-QUEUE-COORDINATOR`
- `operationKind`: 验证
- `outcome`: 静态检查与八个 focused unit suites 非零收集并通过。
- `estimatedCost`: 中
- `deferralEvidence`: 无；Vitest lock 冲突时 ready 等锁。
- `hardPredecessors`: `N41-COORD-FORMAT`。
- `consumes`: 格式化 diff/package scripts/unit config。
- `produces`: format/lint/type/focused unit evidence。
- `completionEvidence`: 全部 exit 0，八个 files/tests 非零。
- `readSet`: 完整 GUI tree与八个 unit suites。
- `writeSet`: 工具 cache/report 副作用。
- `stateEffects`: headless unit/cache 状态。
- `commandScope`: 在该 worktree 的 `codex-gui` cwd 依次运行：

  ```bash
  /opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
  /opt/homebrew/bin/fnm exec --using-file pnpm run lint
  /opt/homebrew/bin/fnm exec --using-file pnpm run type-check
  /opt/homebrew/bin/fnm exec --using-file pnpm run test:unit -- src/features/composerInputQueue/__tests__/composerInputQueueCoordinatorInterruptDelivery.test.ts src/features/composerInputQueue/__tests__/composerInputQueueCoordinatorManagementLifecycle.test.ts src/features/composerInputQueue/__tests__/composerInputQueueCoordinatorManagementRecovery.test.ts src/features/composerInputQueue/__tests__/composerInputQueueCoordinatorManagementReplay.test.ts src/features/composerInputQueue/__tests__/composerInputQueueCoordinatorMove.test.ts src/features/composerInputQueue/__tests__/composerInputQueueCoordinatorRelease.test.ts src/features/composerInputQueue/__tests__/composerInputQueueCoordinatorStartDelivery.test.ts src/features/composerInputQueue/__tests__/composerInputQueueCoordinatorSteerDelivery.test.ts
  ```
- `subdelegation`: 禁止。
- `executionContext`: coordinator worktree/GUI cwd。
- `resourceLocks`: `/Users/jiangsheng/cnb/codex/codex-gui/node_modules/.vite` write；
  `/Users/jiangsheng/cnb/codex/.worktrees/gui-test-support-queue-coordinator/codex-gui/.eslintcache` write。
- `owner`: coordinator 验证子代理。
- `verification`: 记录 file/test collection 与结果。
- `failureDomain`: `N43` 至 `N45`。
- `replanTriggers`: target 未收集或修正需要计划外文件/语义改变。
- `authorizationGate`: `pending`。

#### `N43-COORD-REVIEW`

- `taskBoundary`: `TASK-QUEUE-COORDINATOR`
- `operationKind`: 审查
- `outcome`: fixture 仅构造依赖/事件 wrapper/只读 lookup，不隐藏 mutation 或 recovery。
- `estimatedCost`: 中
- `deferralEvidence`: 无。
- `hardPredecessors`: `N42-COORD-VERIFY`。
- `consumes`: task diff/验证证据。
- `produces`: stage allowlist。
- `completionEvidence`: `git diff HEAD`、diff/check/test-name/type derivation/order audit 通过，task write set 外 diff 为零。
- `readSet`: task diff/设计/目标 suites。
- `writeSet`: 空。
- `stateEffects`: 审查结论。
- `commandScope`: `git diff HEAD -- <TASK-QUEUE-COORDINATOR paths>`、`git diff --check` 与只读 `rg` 检查。
- `subdelegation`: 禁止。
- `executionContext`: coordinator worktree。
- `resourceLocks`: coordinator task file targets 与
  `/Users/jiangsheng/cnb/codex/.git/worktrees/gui-test-support-queue-coordinator/index` read。
- `owner`: 独立 review 子代理。
- `verification`: 无 `completeTurn`/`recoverScenario`/循环 drain/fallback/silent retry。
- `failureDomain`: `N44`、`N45`。
- `replanTriggers`: fixture 越过行为边界或类型不再机械派生。
- `authorizationGate`: `pending`。

#### `N44-COORD-STAGE`

- `taskBoundary`: `TASK-QUEUE-COORDINATOR`
- `operationKind`: stage
- `outcome`: coordinator index 只含 task 九文件。
- `estimatedCost`: 小
- `deferralEvidence`: 无。
- `hardPredecessors`: `N43-COORD-REVIEW`。
- `consumes`: 审查通过 diff。
- `produces`: staged snapshot。
- `completionEvidence`: cached name-only 精确，cached check 通过。
- `readSet`: task files/index。
- `writeSet`: coordinator index。
- `stateEffects`: 精确 stage。
- `commandScope`: `git add --` 九路径及 cached audit。
- `subdelegation`: 禁止。
- `executionContext`: coordinator worktree/独占 index。
- `resourceLocks`: `/Users/jiangsheng/cnb/codex/.git/worktrees/gui-test-support-queue-coordinator/index` write。
- `owner`: 本任务唯一 Git owner。
- `verification`: staged diff 全量审查。
- `failureDomain`: `N45-COORD-COMMIT`。
- `replanTriggers`: index 污染或 snapshot 漂移。
- `authorizationGate`: `pending`。

#### `N45-COORD-COMMIT`

- `taskBoundary`: `TASK-QUEUE-COORDINATOR`
- `operationKind`: commit
- `outcome`: 创建独立 coordinator task commit。
- `estimatedCost`: 小
- `deferralEvidence`: 无。
- `hardPredecessors`: `N44-COORD-STAGE`。
- `consumes`: staged snapshot。
- `produces`: `COORD_COMMIT`。
- `completionEvidence`: 精确九文件 commit，信息为
  `test(codex-gui): share queue coordinator fixtures`。
- `readSet`: staged snapshot/Git identity。
- `writeSet`: branch ref/object database/index。
- `stateEffects`: 一个本地提交。
- `commandScope`: 精确 `git commit -m` 与只读 audit。
- `subdelegation`: 禁止。
- `executionContext`: coordinator worktree/branch。
- `resourceLocks`: `/Users/jiangsheng/cnb/codex/.git/worktrees/gui-test-support-queue-coordinator/index` 与
  `refs/heads/codex/gui-test-support-queue-coordinator` write；Git object database 不作为外部独占锁。
- `owner`: 本任务唯一 Git owner。
- `verification`: 记录 SHA 与边界。
- `failureDomain`: coordinator 集成节点/final fan-in。
- `replanTriggers`: hook 越界或提交不精确。
- `authorizationGate`: `pending`。

### 本地集成与最终 fan-in

#### `N59-INTEGRATION-FAN-IN`

- `taskBoundary`: 无提交；集成 fan-in
- `operationKind`: fan-in
- `outcome`: `DOCS_COMMIT`、独立 `DOCS_AMENDMENT_COMMIT` 与四个独立 task commits 都保留在 `dev`，四个
  task 提交均一对一集成且边界可审计。
- `estimatedCost`: 小
- `deferralEvidence`: 无。
- `hardPredecessors`: `N51-INTEGRATE-TURN`、`N52-INTEGRATE-EDITOR`、`N53-INTEGRATE-APP`、
  `N54-INTEGRATE-COORD`；等待四个独立集成产物。
- `consumes`: `DOCS_COMMIT`、`DOCS_AMENDMENT_COMMIT`、四份 integrated commit evidence、当前 `dev`
  history/status/index。
- `produces`: 四任务全部集成后的稳定 `INTEGRATED_HEAD`。
- `completionEvidence`: `dev` history 保留原 docs、独立 amendment docs 与四个 task 边界，主 status/index 无
  计划外变化。
- `readSet`: 主 repo refs/index/status/history 与四个 source/integrated commits。
- `writeSet`: 空。
- `stateEffects`: 仅 fan-in 结论。
- `commandScope`: `git status`、`git log`、`git show`、`git diff-tree`、ancestor checks。
- `subdelegation`: 禁止。
- `executionContext`: 主 checkout/`dev`，只读 index。
- `resourceLocks`: `/Users/jiangsheng/cnb/codex/.git/index` 与 `refs/heads/dev` read。
- `owner`: 主协调 agent 的 integration fan-in 审查子代理。
- `verification`: source/integrated diff 一对一等价，无 squash/amend/production diff。
- `failureDomain`: `N55-FINAL-VERIFY`；不回滚已完成 task branches 或 integrated commits。
- `replanTriggers`: 集成边界缺失、source/integrated diff 不等价、主 index 污染。
- `authorizationGate`: `pending`；计划确认后授权只读 fan-in。

#### `N51-INTEGRATE-TURN`

- `taskBoundary`: 本地集成；保留 `TASK-TURN-CONTROL` 边界
- `operationKind`: 集成
- `outcome`: turn-control task 作为一个独立 commit 集成到 `dev`。
- `estimatedCost`: 小
- `deferralEvidence`: 无。
- `hardPredecessors`: `N15-TURN-COMMIT`；该 task commit 完成即可竞争主 `dev` 集成锁。
- `consumes`: `TURN_COMMIT`、`DOCS_COMMIT` 与执行时当前 `dev` HEAD/status/index。
- `produces`: `dev` 上一对一 integrated turn commit。
- `completionEvidence`: 集成前 task commit parent 为 `DOCS_COMMIT`、task boundary 正确且 merge-tree 无冲突；
  `git cherry-pick <TURN_COMMIT>` 成功，单 commit 边界保持，status/index clean。
- `readSet`: source commit/`dev` HEAD。
- `writeSet`: `dev` ref/tree/index/object database。
- `stateEffects`: 一次本地 cherry-pick；无 remote。
- `commandScope`: 先运行 `git status`、`git show`、`git diff-tree`、ancestor 与 merge-tree 只读预检并锁定
  当前 `dev` HEAD；随后精确运行 `git cherry-pick <TURN_COMMIT>` 与只读 audit；不处理冲突。
- `subdelegation`: 禁止。
- `executionContext`: 主 checkout/`dev`/独占 index。
- `resourceLocks`: `/Users/jiangsheng/cnb/codex/.git/index`、主 worktree 与 `refs/heads/dev` write；Git object
  database 只使用 Git 自身原子并发协议，不作为外部独占调度锁。
- `owner`: 唯一本地集成 Git owner 子代理。
- `verification`: integrated diff 等价于 source task diff。
- `failureDomain`: 本节点、`N59-INTEGRATION-FAN-IN` 与 `N55-FINAL-VERIFY`；其他已 ready 集成分支继续；
  保留失败现场，不 abort/restore。
- `replanTriggers`: cherry-pick 冲突、hook 越界、HEAD 不等于预检快照。
- `authorizationGate`: `pending`；计划确认后授权该精确本地集成，无 abort/force/remote。

#### `N52-INTEGRATE-EDITOR`

- `taskBoundary`: 本地集成；保留 `TASK-EDITOR` 边界
- `operationKind`: 集成
- `outcome`: editor task 作为独立 commit 集成到 `dev`。
- `estimatedCost`: 小
- `deferralEvidence`: 无；本节点由真实集成产物依赖明确排在最后，不是基于编号或 agent 复用暂缓。
- `hardPredecessors`: `N25-EDITOR-COMMIT`、`N05D-DOC-AMEND-COMMIT`、`N51-INTEGRATE-TURN`、
  `N53-INTEGRATE-APP`、`N54-INTEGRATE-COORD`；等待十个 path identities 的稳定 Editor task commit、独立
  amendment commit 和其余三个 task 的稳定 integrated commits，使 Editor 成为最后一个集成节点。
- `consumes`: parent 仍为原 `DOCS_COMMIT` 的 `EDITOR_COMMIT`、`DOCS_AMENDMENT_COMMIT`，以及执行时已经
  包含 amendment 和其余三个 integrated task commits 的当前 `dev` HEAD/status/index。
- `produces`: integrated editor commit。
- `completionEvidence`: source parent 精确为原 `DOCS_COMMIT`，source 边界精确为十个 path identities；当前
  `dev` 包含 `DOCS_AMENDMENT_COMMIT` 与其余三个 integrated task commits；merge-tree 预检通过，cherry-pick
  成功且边界等价、status/index clean。
- `readSet`: source commit/`dev` HEAD。
- `writeSet`: `dev` ref/tree/index/object database。
- `stateEffects`: 一次本地 cherry-pick。
- `commandScope`: 先完成当前 HEAD/status、原 `DOCS_COMMIT` parent、十个 path identities、
  `DOCS_AMENDMENT_COMMIT`/其余三个 task 集成存在性与 merge-tree 只读预检，再运行
  `git cherry-pick <EDITOR_COMMIT>` 与只读 audit；不 rebase source，不 restore/cleanup Editor worktree，不处理
  冲突。
- `subdelegation`: 禁止。
- `executionContext`: 主 checkout/`dev`/独占 index。
- `resourceLocks`: `/Users/jiangsheng/cnb/codex/.git/index`、`/Users/jiangsheng/cnb/codex` tree 与
  `refs/heads/dev` write；Git object database 不作为外部独占锁。
- `owner`: 唯一 integration Git owner。
- `verification`: source/integrated diff 等价。
- `failureDomain`: 本节点、`N59-INTEGRATION-FAN-IN` 与 `N55-FINAL-VERIFY`；三个前置集成产物保持不变。
- `replanTriggers`: amendment 或其余三个 task integration 缺失、source parent/boundary 不符、冲突、hook
  越界或 HEAD 漂移。
- `authorizationGate`: `pending`。

#### `N53-INTEGRATE-APP`

- `taskBoundary`: 本地集成；保留 `TASK-APP-QUEUE` 边界
- `operationKind`: 集成
- `outcome`: app-queue task 作为独立 commit 集成到 `dev`。
- `estimatedCost`: 小
- `deferralEvidence`: 无；没有串行边，主 index/ref write lock 只形成动态互斥。
- `hardPredecessors`: `N35-APP-COMMIT`；该 task commit 完成即可竞争主 `dev` 集成锁。
- `consumes`: `APP_QUEUE_COMMIT`、`DOCS_COMMIT` 与执行时当前 `dev` HEAD/status/index。
- `produces`: integrated app-queue commit。
- `completionEvidence`: parent/boundary/merge-tree 预检通过；cherry-pick 成功、边界等价、status/index clean。
- `readSet`: source commit/`dev` HEAD。
- `writeSet`: `dev` ref/tree/index/object database。
- `stateEffects`: 一次本地 cherry-pick。
- `commandScope`: 先完成当前 HEAD/status/parent/boundary/merge-tree 只读预检，再运行
  `git cherry-pick <APP_QUEUE_COMMIT>` 与只读 audit；不处理冲突。
- `subdelegation`: 禁止。
- `executionContext`: 主 checkout/`dev`/独占 index。
- `resourceLocks`: `/Users/jiangsheng/cnb/codex/.git/index`、`/Users/jiangsheng/cnb/codex` tree 与
  `refs/heads/dev` write；Git object database 不作为外部独占锁。
- `owner`: 唯一 integration Git owner。
- `verification`: diff 等价。
- `failureDomain`: 本节点、`N59-INTEGRATION-FAN-IN` 与 `N55-FINAL-VERIFY`；其他集成分支继续。
- `replanTriggers`: 冲突、hook 越界、HEAD 漂移。
- `authorizationGate`: `pending`。

#### `N54-INTEGRATE-COORD`

- `taskBoundary`: 本地集成；保留 `TASK-QUEUE-COORDINATOR` 边界
- `operationKind`: 集成
- `outcome`: coordinator task 作为独立 commit 集成到 `dev`。
- `estimatedCost`: 小
- `deferralEvidence`: 无；没有串行边，主 index/ref write lock 只形成动态互斥。
- `hardPredecessors`: `N45-COORD-COMMIT`；该 task commit 完成即可竞争主 `dev` 集成锁。
- `consumes`: `COORD_COMMIT`、`DOCS_COMMIT` 与执行时当前 `dev` HEAD/status/index。
- `produces`: integrated coordinator commit。
- `completionEvidence`: parent/boundary/merge-tree 预检通过；cherry-pick 成功、边界等价、status/index clean。
- `readSet`: source commit/`dev` HEAD。
- `writeSet`: `dev` ref/tree/index/object database。
- `stateEffects`: 一次本地 cherry-pick。
- `commandScope`: 先完成当前 HEAD/status/parent/boundary/merge-tree 只读预检，再运行
  `git cherry-pick <COORD_COMMIT>` 与只读 audit；不处理冲突。
- `subdelegation`: 禁止。
- `executionContext`: 主 checkout/`dev`/独占 index。
- `resourceLocks`: `/Users/jiangsheng/cnb/codex/.git/index`、`/Users/jiangsheng/cnb/codex` tree 与
  `refs/heads/dev` write；Git object database 不作为外部独占锁。
- `owner`: 唯一 integration Git owner。
- `verification`: coordinator source/integrated diff 等价。
- `failureDomain`: 本节点、`N59-INTEGRATION-FAN-IN` 与 `N55-FINAL-VERIFY`。
- `replanTriggers`: 冲突、hook 越界、HEAD 漂移。
- `authorizationGate`: `pending`。

#### `N55-FINAL-VERIFY`

- `taskBoundary`: 无提交；最终 fan-in 验证
- `operationKind`: 验证
- `outcome`: 集成状态满足全部设计不变量、Level 1 与结构验收。
- `estimatedCost`: 大
- `deferralEvidence`: 无；单一最终验证节点按权威入口串行记录，避免同一 checkout 的 eslint/Vite/Browser
  cache 写冲突；这不是任务之间的硬依赖。
- `hardPredecessors`: `N59-INTEGRATION-FAN-IN`；等待四任务集成后的稳定 `INTEGRATED_HEAD`。
- `consumes`: `INTEGRATED_HEAD`、`DOCS_COMMIT`、`DOCS_AMENDMENT_COMMIT`、所有 task/focused evidence、live
  package scripts/config、设计基线 `jscpd` 口径。
- `produces`: 最终 format/lint/type/unit/parallel Browser/sequential Browser/jscpd/production-diff 证据。
- `completionEvidence`: 所有适用命令 exit 0；unit/parallel/sequential tests 非零收集；四类目标 tests 全部出现；
  Editor 公共 `.ts`/私有 component-only `.tsx` 分离且四个 caller extensionless imports 保持；
  `git diff <DOCS_COMMIT>..HEAD` 证明 production diff 为零、test names/完整断言无删除；`jscpd` 记录新指标和
  目标大块重复族结果。
- `readSet`: 完整 integrated GUI tree、Git diff、package/config、四类目标 files。
- `writeSet`: 工具内部 cache/report 副作用；源码/index 空。
- `stateEffects`: headless verification cache/log；不 stage/commit，不生成或接受基线。
- `commandScope`: 在主 checkout `codex-gui`、fnm-backed环境按顺序运行：

  ```bash
  /opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
  /opt/homebrew/bin/fnm exec --using-file pnpm run lint
  /opt/homebrew/bin/fnm exec --using-file pnpm run type-check
  /opt/homebrew/bin/fnm exec --using-file pnpm run test:unit
  /opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:parallel
  /opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:sequential
  jscpd /Users/jiangsheng/cnb/codex/codex-gui/src \
    --reporters console \
    --min-lines 6 \
    --min-tokens 60 \
    --ignore "**/*.po,**/*.json,**/.DS_Store,**/generated/**"
  ```

  另以 `git diff --name-only <DOCS_COMMIT>..HEAD -- codex-gui/src` 和
  `git diff <DOCS_COMMIT>..HEAD -- codex-gui/src` 为统一比较基线，检查 production diff、test names、
  完整断言、helper imports、禁止项和工作树/index 状态；不能用 clean worktree 的无参数 `git diff` 代替。
- `subdelegation`: 禁止。
- `executionContext`: 主 checkout/`dev`/`codex-gui` cwd；浏览器严格 headless。
- `resourceLocks`: `/Users/jiangsheng/cnb/codex/codex-gui` tree read；
  `/Users/jiangsheng/cnb/codex/codex-gui/.eslintcache` 与
  `/Users/jiangsheng/cnb/codex/codex-gui/node_modules/.vite` write；Playwright installation read，临时 profile
  由本节点进程隔离。
- `owner`: 最终验证子代理；主代理审查完整输出并作最终判断。
- `verification`: Level 1；Level 2/3 明确不适用。`jscpd` 只观察，不成为 pass/fail 数值门槛。
- `failureDomain`: 仅失败验证及实际消费者；按执行图插入计划内诊断/修正/重验证节点。已有 task commit 的修正
  必须形成新的独立提交，禁止 amend；不处理预存或无关失败。
- `replanTriggers`: 修正需要 production/计划外文件、新产品决策、可见桌面、依赖安装、降低检查或新增豁免。
- `authorizationGate`: `pending`；计划确认后授权上述无头验证与计划内直接引入问题的闭环。

## Ready set、关键路径与并行审计

- 初始 ready set：计划确认后的 `N00-DOC-REVIEW`。
- 文档提交后：`N03A` 至 `N03D` 同时 ready；它们因共享
  `/Users/jiangsheng/cnb/codex/.git/worktrees` write lock 逐个取得执行权，四项完成后 `N04` fan-in。
- 首次 fan-out：`N10-TURN-EDIT`、`N30-APP-EDIT`、`N40-COORD-EDIT` 与
  `N05A-DOC-AMEND-EDIT` 同时 ready；`N20-EDITOR-EDIT` 等待 `N05D-DOC-AMEND-COMMIT`。
- 任务内关键链：代码任务各自 `EDIT -> FORMAT -> VERIFY -> REVIEW -> STAGE -> COMMIT`；amendment 文档链为
  `N05A -> N05B -> N05C -> N05D`。
- Editor branch/worktree base 保持原 `DOCS_COMMIT`，任意 in-scope 未提交状态必须保留；amendment 不授权
  rebase、restore 或 cleanup。
- 粗粒度关键路径：`TASK-DOC -> 最慢 worktree 预配 -> N04 -> N05A -> N05B -> N05C -> N05D -> Editor
  EDIT/FORMAT/VERIFY/REVIEW/STAGE/COMMIT -> N52 -> N59 -> N55`。
- `N51`、`N53`、`N54` 各自在对应 task commit 完成后竞争主 `dev` index/ref write lock；`N52` 等待这三个
  integrated commits、`N05D` 与 `N25`，因此精确作为最后一个集成节点。`N59` 等待四个 integrated commits，
  `N55` 等待 `N59` 的稳定 `INTEGRATED_HEAD`。
- 四个代码任务 write sets、branch、worktree、index 均不相交；唯一新增跨任务硬依赖是 N20 消费稳定
  `DOCS_AMENDMENT_COMMIT`，以及 N52 消费其余三个稳定 integrated commits。任务编号、方向相似、同仓库或
  最终合并本身都不产生串行边。
- 实现阶段的跨任务运行冲突是所有 worktree symlink 到同一
  `/Users/jiangsheng/cnb/codex/codex-gui/node_modules`，Vitest/Vite 写同一物理 `.vite` cache；以该 canonical
  cache write lock 调度验证，不伪造 DAG 依赖。锁释放即重算 ready set。
- 主 `dev` 的四次 cherry-pick 必须串行，因为它们写同一主 worktree、index 和 `refs/heads/dev`；Git object
  database 由 Git 自身原子并发协议管理，不作为额外调度锁。
- 未采用单一 worktree 串行实施，因为四个 seam 和消费者集合不交叉，串行会无证据地延长关键路径。
- 未采用四个任务各自再拆多个编辑 agent：每个 task 内 helper 与 callers 需要同步保持 type/import/order 一致，
  进一步拆分会让共享 mutable diff 的协调成本抵消收益。

## 验收与停止条件

实施和动态修正必须继续遵守：

- 只修改列出的测试与测试支撑路径；production、package/config、协议、schema、catalog、snapshot 无 diff。
- 原 suites 不合并、不删除、不减少、不重新分类；test names、完整 expected objects、payload/snapshot/DOM/
  accessibility/locale assertions 保留。
- caller 显式保留 mock registration/reset、queue/projection/RPC/Promise/user interaction 顺序。
- 新 Modules 不引入 scenario DSL、mega harness、任意 callback/props bag、镜像 DTO、宽 record、fallback、
  silent retry、双路径、兼容层或 test-only production export。
- `readAllPendingItems` 遍历全部页并在 stale/owner gone/revision change 时失败；`nextMicrotask` 只等待一次
  `Promise.resolve()`。
- 上游 authoritative types 的不兼容变化继续通过 TypeScript 或测试收集失败传播。
- formatter 产生 write set 外变化、目标测试零收集、Browser config 不再 headless、需要 production 或用户可见
  行为改变时，暂停实际受影响分支并回到相应门禁；不得通过跳过、ignore、基线或放宽断言继续。
- 首次验证失败不是终止条件。只要存在具体、已授权、安全且能产生新证据或推进目标的下一步，按
  `$delegating-micro-stages` 动态插入诊断/修正/重验证节点；若修正已有提交，创建新的独立提交。
- 预存、无关或自行发现的问题只报告，不吸收到本计划。Level 2/3、可见桌面和 cleanup 不执行。

计划执行终态必须报告：实际并行、实际关键路径、曾 ready 但未立即启动的节点及当时有效原因；同时报告
最终 `dev` HEAD、docs/task/integration/fix commit ids、验证收集与结果、`jscpd` 观察值、production diff、
保留的 worktrees/branches，以及任何明确排除或未执行项。
