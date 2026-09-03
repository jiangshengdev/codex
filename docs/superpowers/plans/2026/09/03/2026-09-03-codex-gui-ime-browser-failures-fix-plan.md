# Codex GUI IME Browser 失败修复实施计划

> 日期：2026-09-03
> 状态：已确认，待文档提交后执行
> 设计：[IME Browser 失败修复设计](../../../specs/2026/09/03/2026-09-03-codex-gui-ime-browser-failures-fix-design.md)
> 调研：[11 个 IME Browser 失败根因调查](../../../research/2026/09/03/2026-09-03-codex-gui-ime-browser-failures-root-cause.md)

## 目标与边界

按已确认设计修复 11 个 IME Browser 失败：T1 抽取共享 conditional `COMPOSITION_END_COMMAND` test helper 且保持 Lifecycle 行为不变；T2 让 TurnControl fixture 使用 helper，消除 8 个 fixture-only 失败；T3 在生产 Lexical command owner 中用 `KEY_DOWN_COMMAND` 与 `COMMAND_PRIORITY_BEFORE_EDITOR` 恢复 suppression 生命周期清理，并增加 `Shift+Enter` 回归覆盖，同时让 `KEY_ENTER_COMMAND` 保持唯一提交/消费 owner、保留 keyup 语义。

明确禁止通过 timeout、降低并发、React `onKeyDown`、生产 composition bridge、放宽断言、删除覆盖、修改基线或新增兼容路径完成目标。Level 1 自动化 Browser Mode 是完成条件；Level 2 不适用；Level 3 不执行，最终必须报告“可见桌面验收未执行”，不得声称真实系统 IME 已验证。

## 执行环境与提交拓扑

- 仓库与 cwd：Git worktree `/Users/jiangsheng/cnb/codex`；所有 frontend 命令 cwd 为 `/Users/jiangsheng/cnb/codex/codex-gui`。
- 分支与 index：使用当前默认 worktree、`dev` 分支和默认 Git index；不创建 worktree 或 branch。原因是本任务直接消费前序稳定提交，且 T1、T2、T3 依次消费上一任务的稳定提交并共享相交测试文件/默认 index；独立 worktree 不会缩短关键路径，反而需要额外集成。
- 文档门禁：先只提交本次两份工作文档，commit message 为 `docs: plan IME Browser failure repair`；该 commit 成功前禁止实现。
- 任务提交：T1、T2、T3 分别形成独立本地提交，建议 message 依次为 `test(gui): share composer composition end helper`、`test(gui): align turn control composition fixture`、`fix(gui): clear IME Enter guard on non-submit keydown`。
- 禁止 amend、squash、force 和任何 Git remote 操作；每个任务只 stage 自己的 allowlist。已有提交的后续修正必须形成新的独立提交。
- 工具链：frontend 命令均通过 `/opt/homebrew/bin/fnm exec --using-file pnpm ...` 调用 `codex-gui/package.json` 的现行脚本；执行前核验 fnm 与 pnpm 来源，禁止安装缺失工具或浏览器。

## 文件范围

- DOC 新建：
  - `/Users/jiangsheng/cnb/codex/docs/superpowers/specs/2026/09/03/2026-09-03-codex-gui-ime-browser-failures-fix-design.md`
  - `/Users/jiangsheng/cnb/codex/docs/superpowers/plans/2026/09/03/2026-09-03-codex-gui-ime-browser-failures-fix-plan.md`
- T1 新建/修改：
  - `/Users/jiangsheng/cnb/codex/codex-gui/src/features/composerEditor/__tests__/composerEditorCompositionBrowserTestSupport.ts`
  - `/Users/jiangsheng/cnb/codex/codex-gui/src/features/composerEditor/__tests__/ComposerEditorLifecycle.browser.test.tsx`
- T2 修改：
  - `/Users/jiangsheng/cnb/codex/codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControlInput.browser.test.tsx`
- T3 修改：
  - `/Users/jiangsheng/cnb/codex/codex-gui/src/features/composerEditor/ComposerEditor.tsx`
  - `/Users/jiangsheng/cnb/codex/codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControlInput.browser.test.tsx`

若实现需要上述范围外的源码、测试、配置、生成物或文档写入，暂停受影响节点并触发重新计划；只读定位和计划内命令的正常自动产物按能力信封处理，但不得主动 stage 或提交范围外文件。

## 命令与成功条件

执行前先在 frontend cwd 运行 `/opt/homebrew/bin/fnm env --shell zsh` 和 `/opt/homebrew/bin/fnm exec --using-file pnpm --version` 完成来源核验；若 pnpm 解析到 `/Users/<user>/.cache/codex-runtimes/` 或工具缺失，阻断依赖节点且不得安装。

项目入口如下；focused 与 full Browser 命令都必须从输出确认 Chromium、Firefox、WebKit 实际收集了非零目标，命令 exit 0 但目标零收集不算通过：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt:fix
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
/opt/homebrew/bin/fnm exec --using-file pnpm run lint
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:parallel --run src/features/composerEditor/__tests__/ComposerEditorLifecycle.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:parallel --run src/features/composerTurnControl/__tests__/ComposerTurnControlInput.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:parallel --run
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:sequential --run
```

`format:oxfmt:fix` 是现有 repository-owned fix 入口，运行后必须审查完整 diff；若它改变当前 task allowlist 之外的 tracked 文件，不得吸收或恢复这些变化，暂停依赖提交节点并动态重编图。`format:oxfmt` 必须随后确认稳定无差异。

## DAG 总览

初始 ready set 只有 `DOC-COMMIT`。稳定文档 commit 解锁 T1；T1 commit 解锁 T2；T2 commit 解锁 T3。三个串行边都等待实际稳定产物，而不是按编号人为串行：T2 消费 T1 的共享 helper，T3 消费 T2 已修正的 fixture 与同一测试文件，且三者共享默认 index。T3 commit 后 fan-out 到最终格式检查、lint、type-check、两项 focused Browser 验证和两套 full Browser 验证；Browser 节点共享同一 Playwright/Vitest browser runner 写锁，因此保持 ready 但按资源锁串行。`FINAL-FAN-IN` 等待全部最终证据。

粗粒度关键路径为 `DOC-COMMIT -> T1 -> T2 -> T3 -> 最慢最终验证 -> FINAL-FAN-IN`。没有基于主观收益的 `deferralEvidence`；资源冲突只负责运行时互斥，不伪造依赖边。

## 通用能力信封

下列信封与各节点记录共同构成完整 `authorizationGate`；每个节点的 scope 进一步收窄文件、命令与副作用。

### `DOC-COMMIT-ENVELOPE`

- `objective`：形成实现前所需的稳定设计与计划 commit；`phase`：plan/document landing；`operationKind`：提交已有变更。
- `grantSource`：用户“确认，设计计划落盘，然后开始进行”及已确认计划；`status`：active。
- `allowedOperations`：只读审查两份文档与 Git 状态；仅 stage 两个文档；检查 staged diff；创建一个本地 commit；只读核验 commit identity。
- `parameterBounds`：cwd `/Users/jiangsheng/cnb/codex`，当前 `dev`、默认 index，message 精确为 `docs: plan IME Browser failure repair`。
- `readSet` / `writeSet`：读取两份文档与本地 Git 元数据；写默认 index 和一个本地 commit；`canonicalTargets` 为两份文档、当前默认 index 与当前分支本地 ref。
- `stateEffects`：两份文档被暂存并形成一个本地 commit。
- `commandScope`：只读 Git 检查、`git add -- <两个精确路径>`、非 amend 的 `git commit -m 'docs: plan IME Browser failure repair'`、只读 commit 核验。
- `negativeConstraints`：无源码编辑、额外 stage、amend、squash、force、remote、测试、格式化、清理；`specialApprovals` / `requiredApprovalIds`：空；`subdelegation`：false。
- `lifecycle`：commit 核验后到期；`replanTriggers`：文档路径/内容漂移、index 含范围外 staged 变化或 commit 无法保持精确边界。

### `EDIT-ENVELOPE`

- `objective`：完成节点所属任务的单一源码/测试产物；`phase`：implementation；`operationKind`：编辑。
- `grantSource`：已确认设计、计划及用户“然后开始进行”；`status`：active。
- `allowedOperations`：只读相关代码、调研与文档；用 `apply_patch` 编辑节点精确 writeSet。
- `parameterBounds`：repo cwd `/Users/jiangsheng/cnb/codex`，仅节点列出的文件与语义。
- `readSet`：节点 writeSet、直接 imports/consumers、已确认设计/计划/research；`writeSet` / `canonicalTargets`：节点精确列出的文件。
- `stateEffects`：节点文件产生未暂存修改；`commandScope`：只读 `rg`/`sed`/Git 检查与 `apply_patch`。
- `negativeConstraints`：无范围外写入、格式化、验证、stage、commit、worktree、remote、force、Level 2/3、React `onKeyDown`、生产 bridge、timeout/并发/断言降级；`specialApprovals` / `requiredApprovalIds`：空；`subdelegation`：false。
- `lifecycle`：节点返回时到期；`replanTriggers`：需要范围外文件、产品语义变化或 owner/接口证据失真。

### `FORMAT-ENVELOPE`

- `objective`：使用权威 frontend formatter 修正节点 allowlist 并证明稳定；`phase`：implementation；`operationKind`：格式化。
- `grantSource`：已确认计划内格式化；`status`：active。
- `allowedOperations`：预检后运行 `format:oxfmt:fix`，审查完整 diff，再运行 `format:oxfmt`。
- `parameterBounds`：cwd `/Users/jiangsheng/cnb/codex/codex-gui`，fnm-backed pnpm，现行 package scripts。
- `readSet`：frontend tracked source 与 formatter config；`writeSet` / `canonicalTargets`：formatter 命令显式入口及本 task allowlist，程序正常自动副作用另按能力信封契约。
- `stateEffects`：格式化器可能修改 frontend 文件；只允许 task allowlist 进入后继提交。
- `commandScope`：上述两个精确 package script 命令与只读 diff 检查。
- `negativeConstraints`：无直接 oxfmt fallback、无范围外主动处理、无 stage/commit/remote/force；`specialApprovals` / `requiredApprovalIds`：空；`subdelegation`：false。
- `lifecycle`：check 通过并审查 diff 后到期；`replanTriggers`：工具缺失、入口漂移、范围外 tracked diff 或重复运行不稳定。

### `VERIFY-ENVELOPE`

- `objective`：产生节点声明的 Level 1 或静态验证证据；`phase`：verification；`operationKind`：验证。
- `grantSource`：已确认计划内验证；`status`：active。
- `allowedOperations`：预检后运行节点精确命令，读取输出并核验目标收集与结果。
- `parameterBounds`：cwd `/Users/jiangsheng/cnb/codex/codex-gui`，fnm-backed pnpm，无 headed 参数。
- `readSet`：稳定源码、测试、config、依赖与 runner 输入；`writeSet` / `canonicalTargets`：无代理主动文件写入，命令正常自动产物按能力信封契约。
- `stateEffects`：headless test/lint/type-check 运行状态和内部自动缓存/报告；`commandScope`：节点精确 package script 命令与只读输出检查。
- `negativeConstraints`：无 fix/update/accept/rewrite、无安装、无可见窗口、无 Level 2/3、无 stage/commit/remote/force；`specialApprovals` / `requiredApprovalIds`：空；`subdelegation`：false。
- `lifecycle`：证据返回时到期；`replanTriggers`：入口/配置/工具漂移、目标零收集、失败揭示计划假设失真或需要范围外修正。

### `TASK-COMMIT-ENVELOPE`

- `objective`：把单个 taskBoundary 的已验证变化形成稳定本地 commit；`phase`：implementation landing；`operationKind`：提交已有变更。
- `grantSource`：已确认计划中的逐任务独立提交；`status`：active。
- `allowedOperations`：只读审查 task diff；仅 stage 节点 allowlist；检查 staged diff 与 `git diff --cached --check`；创建一个非 amend 本地 commit；只读核验 identity。
- `parameterBounds`：cwd `/Users/jiangsheng/cnb/codex`，当前 `dev`、默认 index、节点精确 message。
- `readSet`：task allowlist 与本地 Git 元数据；`writeSet` / `canonicalTargets`：默认 index、当前本地 branch ref、一个 task commit。
- `stateEffects`：task allowlist 被暂存并形成独立 commit；`commandScope`：只读 Git 检查、精确 `git add --`、`git diff --cached --check`、非 amend commit、只读核验。
- `negativeConstraints`：无编辑、额外 stage、amend、squash、force、remote、清理或恢复；`specialApprovals` / `requiredApprovalIds`：空；`subdelegation`：false。
- `lifecycle`：commit 核验后到期；`replanTriggers`：index 污染、allowlist 外 diff、验证失效或 commit 失败。

## 节点记录

### `DOC-COMMIT`

- `taskBoundary`：DOC 文档独立提交；`operationKind`：commit；`outcome`：两份工作文档形成 message 为 `docs: plan IME Browser failure repair` 的稳定本地 commit。
- `estimatedCost`：低；`deferralEvidence`：无。
- `hardPredecessors`：无；它是实现门禁和初始 ready set。
- `consumes`：已确认设计、计划文本与两个 untracked Markdown；`produces`：DOC commit id。
- `completionEvidence`：commit 只含两个文档，message 与路径精确，提交后实现文件仍未修改。
- `readSet` / `writeSet` / `stateEffects` / `commandScope`：`DOC-COMMIT-ENVELOPE` 的精确范围。
- `subdelegation`：false；`executionContext`：当前默认 worktree、`dev`、默认 index，独占 index 写。
- `resourceLocks`：`/Users/jiangsheng/cnb/codex/.git/index` write；当前 `dev` local ref write。
- `owner`：唯一 Git owner；`verification`：staged path allowlist、`git diff --cached --check` 与 commit identity 核验。
- `failureDomain`：T1、T2、T3 与全部最终验证；`replanTriggers`：见 envelope。
- `authorizationGate`：`DOC-COMMIT-ENVELOPE`，status active。

### `T1-EDIT`

- `taskBoundary`：T1 共享 helper；`operationKind`：编辑；`outcome`：新建 ComposerEditor composition Browser support，并让 Lifecycle 测试改用它且断言不变。
- `estimatedCost`：低；`deferralEvidence`：无。
- `hardPredecessors`：`DOC-COMMIT`，原因是实现必须消费稳定文档 commit。
- `consumes`：Lifecycle 现有 conditional bridge 与 DOC commit；`produces`：T1 未暂存源码快照。
- `completionEvidence`：helper 派发原生 `compositionend`，仅在 `editor.isComposing()` 时补发同事件的 `COMPOSITION_END_COMMAND`；Lifecycle 不再保有重复实现。
- `readSet`：T1 两个文件、设计/计划/research 与直接 Lexical imports；`writeSet`：T1 两个精确文件；`stateEffects`：两个未暂存文件变化；`commandScope`：`EDIT-ENVELOPE`。
- `subdelegation`：false；`executionContext`：默认 worktree、`dev`、默认 index（不写 index）。
- `resourceLocks`：T1 两个文件 write；`owner`：T1 edit owner。
- `verification`：结构审查，禁止行为、断言或事件顺序漂移。
- `failureDomain`：T1 后继及全图；`replanTriggers`：见 envelope。
- `authorizationGate`：`EDIT-ENVELOPE` + T1 scope，status active。

### `T1-FORMAT`

- `taskBoundary`：T1；`operationKind`：格式化；`outcome`：T1 文件经权威 formatter fix 后 check 稳定。
- `estimatedCost`：低；`deferralEvidence`：无。
- `hardPredecessors`：`T1-EDIT`，等待 T1 未暂存快照。
- `consumes`：T1 未格式化快照；`produces`：T1 格式化快照与 check 证据。
- `completionEvidence`：fix 后 `format:oxfmt` exit 0，diff 仅含 T1 allowlist。
- `readSet` / `writeSet` / `stateEffects` / `commandScope`：`FORMAT-ENVELOPE` + T1 allowlist。
- `subdelegation`：false；`executionContext`：默认 worktree，frontend formatter 独占。
- `resourceLocks`：`/Users/jiangsheng/cnb/codex/codex-gui` formatter write；T1 files write。
- `owner`：T1 format owner；`verification`：两条格式化入口与完整 diff 审查。
- `failureDomain`：T1 verify/commit 与所有后继；`replanTriggers`：见 envelope。
- `authorizationGate`：`FORMAT-ENVELOPE` + T1 scope，status active。

### `T1-VERIFY`

- `taskBoundary`：T1；`operationKind`：验证；`outcome`：Lifecycle focused Browser 测试三浏览器非零收集且通过。
- `estimatedCost`：中；`deferralEvidence`：无。
- `hardPredecessors`：`T1-FORMAT`，等待稳定格式化快照。
- `consumes`：T1 快照；`produces`：Lifecycle 三浏览器 Level 1 证据。
- `completionEvidence`：focused Lifecycle 命令 exit 0，Chromium/Firefox/WebKit 均实际执行目标测试且非零收集。
- `readSet`：稳定 T1 files、Browser config 与依赖；`writeSet`：无主动写；`stateEffects` / `commandScope`：`VERIFY-ENVELOPE`，命令为 Lifecycle focused 命令。
- `subdelegation`：false；`executionContext`：默认 worktree，headless Browser runner。
- `resourceLocks`：Vitest/Playwright browser runner write；`owner`：T1 verify owner。
- `verification`：Lifecycle focused 命令；`failureDomain`：T1 commit 与所有后继；`replanTriggers`：见 envelope。
- `authorizationGate`：`VERIFY-ENVELOPE` + Lifecycle focused scope，status active。

### `T1-COMMIT`

- `taskBoundary`：T1；`operationKind`：commit；`outcome`：T1 allowlist 形成 `test(gui): share composer composition end helper` 独立 commit。
- `estimatedCost`：低；`deferralEvidence`：无。
- `hardPredecessors`：`T1-VERIFY`，等待通过的 T1 稳定证据。
- `consumes`：T1 diff 与验证证据；`produces`：T1 commit id。
- `completionEvidence`：commit 只含 T1 两个文件，message 精确，staged diff check 通过。
- `readSet` / `writeSet` / `stateEffects` / `commandScope`：`TASK-COMMIT-ENVELOPE` + T1 allowlist/message。
- `subdelegation`：false；`executionContext`：默认 worktree、`dev`、默认 index，独占 index。
- `resourceLocks`：default index write、`dev` local ref write；`owner`：T1 Git owner。
- `verification`：staged allowlist、diff check、commit identity；`failureDomain`：T2/T3 与全部最终验证；`replanTriggers`：见 envelope。
- `authorizationGate`：`TASK-COMMIT-ENVELOPE` + T1 scope，status active。

### `T2-EDIT`

- `taskBoundary`：T2 TurnControl fixture；`operationKind`：编辑；`outcome`：TurnControl composition helper 消费 T1 shared helper，不再假设原生 `compositionend` 总会结束 Lexical composing。
- `estimatedCost`：低；`deferralEvidence`：无。
- `hardPredecessors`：`T1-COMMIT`，原因是 T2 import 消费 T1 的稳定 helper API。
- `consumes`：T1 commit/shared helper 与 TurnControl fixture；`produces`：T2 未暂存测试快照。
- `completionEvidence`：所有目标 composition 用例经 shared conditional bridge，测试语义与断言未放宽。
- `readSet`：T1 helper、TurnControl test、设计/计划/research；`writeSet`：仅 TurnControl test；`stateEffects`：一个未暂存文件变化；`commandScope`：`EDIT-ENVELOPE`。
- `subdelegation`：false；`executionContext`：默认 worktree、`dev`、默认 index（不写 index）。
- `resourceLocks`：TurnControl test write；`owner`：T2 edit owner。
- `verification`：结构审查；`failureDomain`：T2 后继、T3 与最终验证；`replanTriggers`：见 envelope。
- `authorizationGate`：`EDIT-ENVELOPE` + T2 scope，status active。

### `T2-FORMAT`

- `taskBoundary`：T2；`operationKind`：格式化；`outcome`：T2 文件经 formatter fix/check 稳定。
- `estimatedCost`：低；`deferralEvidence`：无；`hardPredecessors`：`T2-EDIT`，等待 T2 快照。
- `consumes`：T2 快照；`produces`：格式化快照与 check 证据；`completionEvidence`：format check exit 0 且 diff 不越出 T2 allowlist。
- `readSet` / `writeSet` / `stateEffects` / `commandScope`：`FORMAT-ENVELOPE` + T2 allowlist。
- `subdelegation`：false；`executionContext`：默认 worktree，formatter 独占。
- `resourceLocks`：frontend formatter write、TurnControl test write；`owner`：T2 format owner。
- `verification`：fix/check 与完整 diff；`failureDomain`：T2 verify/commit、T3 与最终验证；`replanTriggers`：见 envelope。
- `authorizationGate`：`FORMAT-ENVELOPE` + T2 scope，status active。

### `T2-VERIFY`

- `taskBoundary`：T2；`operationKind`：验证；`outcome`：TurnControl focused Browser 测试三浏览器到达生产路径，8 个 fixture-only 失败消失。
- `estimatedCost`：中；`deferralEvidence`：无；`hardPredecessors`：`T2-FORMAT`，等待稳定快照。
- `consumes`：T1 helper 与 T2 fixture；`produces`：TurnControl focused Level 1 证据。
- `completionEvidence`：目标文件在 Chromium/Firefox/WebKit 均非零收集；fixture-only 八项通过；仍存在且仅存在已知 non-Enter 生产回归时，该失败必须按预先声明的 T2 完成语义记录，而不是放宽断言。T2 commit 只在输出能精确区分 fixture 修复已成立且后续失败与 T3 已知行为回归一致时解锁。
- `readSet`：T1/T2 稳定文件、Browser config/依赖；`writeSet`：无主动写；`stateEffects` / `commandScope`：`VERIFY-ENVELOPE`，命令为 TurnControl focused 命令。
- `subdelegation`：false；`executionContext`：默认 worktree，headless Browser runner。
- `resourceLocks`：Vitest/Playwright browser runner write；`owner`：T2 verify owner。
- `verification`：精确失败矩阵和非零收集；`failureDomain`：T2 commit、T3 与最终验证；`replanTriggers`：失败矩阵不能由已知 T3 回归唯一解释。
- `authorizationGate`：`VERIFY-ENVELOPE` + TurnControl focused scope，status active。

### `T2-COMMIT`

- `taskBoundary`：T2；`operationKind`：commit；`outcome`：T2 allowlist 形成 `test(gui): align turn control composition fixture` 独立 commit。
- `estimatedCost`：低；`deferralEvidence`：无；`hardPredecessors`：`T2-VERIFY`，等待 fixture 完成证据。
- `consumes`：T2 diff/证据；`produces`：T2 commit id；`completionEvidence`：commit 只含 TurnControl test，message 精确，diff check 通过。
- `readSet` / `writeSet` / `stateEffects` / `commandScope`：`TASK-COMMIT-ENVELOPE` + T2 allowlist/message。
- `subdelegation`：false；`executionContext`：默认 worktree、`dev`、默认 index，独占 index。
- `resourceLocks`：default index write、`dev` local ref write；`owner`：T2 Git owner。
- `verification`：staged allowlist、diff check、identity；`failureDomain`：T3 与最终验证；`replanTriggers`：见 envelope。
- `authorizationGate`：`TASK-COMMIT-ENVELOPE` + T2 scope，status active。

### `T3-EDIT`

- `taskBoundary`：T3 production behavior；`operationKind`：编辑；`outcome`：ComposerEditor plugin 注册 `KEY_DOWN_COMMAND` 清理非提交 keydown suppression，并增加 `Shift+Enter` 回归覆盖。
- `estimatedCost`：中；`deferralEvidence`：无；`hardPredecessors`：`T2-COMMIT`，原因是 T3 消费已稳定的三浏览器 fixture 并再次修改同一测试文件。
- `consumes`：T2 commit、当前 `KEY_ENTER_COMMAND` owner、历史语义；`produces`：T3 未暂存生产/测试快照。
- `completionEvidence`：非 Enter 与 `Shift+Enter` 清 suppression 且返回 false；ordinary/guide Enter 仍只由 `KEY_ENTER_COMMAND` 提交/消费；effect cleanup 注销两个 command；keyup 路径未新增清理。
- `readSet`：T3 两个文件、直接 Lexical API/consumers、设计/计划/research；`writeSet`：T3 两个精确文件；`stateEffects`：两个未暂存文件变化；`commandScope`：`EDIT-ENVELOPE`。
- `subdelegation`：false；`executionContext`：默认 worktree、`dev`、默认 index（不写 index）。
- `resourceLocks`：ComposerEditor.tsx write、TurnControl test write；`owner`：T3 edit owner。
- `verification`：结构审查 owner、返回值与 cleanup；`failureDomain`：T3 后继与最终验证；`replanTriggers`：需要生产 composition 生命周期或额外 owner 变更。
- `authorizationGate`：`EDIT-ENVELOPE` + T3 scope，status active。

### `T3-FORMAT`

- `taskBoundary`：T3；`operationKind`：格式化；`outcome`：T3 文件经 formatter fix/check 稳定。
- `estimatedCost`：低；`deferralEvidence`：无；`hardPredecessors`：`T3-EDIT`，等待 T3 快照。
- `consumes`：T3 快照；`produces`：格式化快照与 check 证据；`completionEvidence`：format check exit 0 且 diff 不越出 T3 allowlist。
- `readSet` / `writeSet` / `stateEffects` / `commandScope`：`FORMAT-ENVELOPE` + T3 allowlist。
- `subdelegation`：false；`executionContext`：默认 worktree，formatter 独占。
- `resourceLocks`：frontend formatter write、T3 files write；`owner`：T3 format owner。
- `verification`：fix/check 与完整 diff；`failureDomain`：T3 verify/commit 与最终验证；`replanTriggers`：见 envelope。
- `authorizationGate`：`FORMAT-ENVELOPE` + T3 scope，status active。

### `T3-VERIFY`

- `taskBoundary`：T3；`operationKind`：验证；`outcome`：Lifecycle 与 TurnControl 两个 focused 文件在三浏览器非零收集并全部通过。
- `estimatedCost`：中；`deferralEvidence`：无；`hardPredecessors`：`T3-FORMAT`，等待稳定快照。
- `consumes`：T1/T2/T3 合并快照；`produces`：两个 focused Level 1 证据。
- `completionEvidence`：两条 focused 命令均 exit 0；Chromium/Firefox/WebKit 非零收集；原 11 项失败为零；普通非 Enter、`Shift+Enter`、ordinary/guide Enter 与两个 keyup case 均符合设计。
- `readSet`：T1/T2/T3 files、Browser config/依赖；`writeSet`：无主动写；`stateEffects` / `commandScope`：`VERIFY-ENVELOPE`，依次运行两条 focused 命令。
- `subdelegation`：false；`executionContext`：默认 worktree，headless Browser runner。
- `resourceLocks`：Vitest/Playwright browser runner write；`owner`：T3 verify owner。
- `verification`：focused 三浏览器矩阵；`failureDomain`：T3 commit 与最终验证；`replanTriggers`：见 envelope。
- `authorizationGate`：`VERIFY-ENVELOPE` + 两个 focused scope，status active。

### `T3-COMMIT`

- `taskBoundary`：T3；`operationKind`：commit；`outcome`：T3 allowlist 形成 `fix(gui): clear IME Enter guard on non-submit keydown` 独立 commit。
- `estimatedCost`：低；`deferralEvidence`：无；`hardPredecessors`：`T3-VERIFY`，等待 T3 focused 证据。
- `consumes`：T3 diff/证据；`produces`：T3 commit id；`completionEvidence`：commit 只含 T3 两个文件，message 精确，diff check 通过。
- `readSet` / `writeSet` / `stateEffects` / `commandScope`：`TASK-COMMIT-ENVELOPE` + T3 allowlist/message。
- `subdelegation`：false；`executionContext`：默认 worktree、`dev`、默认 index，独占 index。
- `resourceLocks`：default index write、`dev` local ref write；`owner`：T3 Git owner。
- `verification`：staged allowlist、diff check、identity；`failureDomain`：全部最终验证；`replanTriggers`：见 envelope。
- `authorizationGate`：`TASK-COMMIT-ENVELOPE` + T3 scope，status active。

### `FINAL-FORMAT-CHECK`

- `taskBoundary`：FINAL（无提交）；`operationKind`：验证；`outcome`：合并状态通过 `format:oxfmt` 且不产生 diff。
- `estimatedCost`：低；`deferralEvidence`：无；`hardPredecessors`：`T3-COMMIT`，等待全部任务稳定提交。
- `consumes`：DOC/T1/T2/T3 commits；`produces`：格式稳定证据；`completionEvidence`：format check exit 0，工作树无新 tracked diff。
- `readSet`：frontend tree/config；`writeSet`：无主动写；`stateEffects` / `commandScope`：`VERIFY-ENVELOPE`，format check 命令。
- `subdelegation`：false；`executionContext`：默认 worktree；`resourceLocks`：frontend formatter read。
- `owner`：final verify owner；`verification`：权威 check；`failureDomain`：FINAL-FAN-IN；`replanTriggers`：见 envelope。
- `authorizationGate`：`VERIFY-ENVELOPE` + format-check scope，status active。

### `FINAL-LINT`

- `taskBoundary`：FINAL（无提交）；`operationKind`：验证；`outcome`：合并状态通过完整 frontend lint。
- `estimatedCost`：中；`deferralEvidence`：无；`hardPredecessors`：`T3-COMMIT`，等待稳定 commits。
- `consumes`：最终源码；`produces`：lint 证据；`completionEvidence`：`pnpm run lint` exit 0。
- `readSet`：frontend tree/config；`writeSet`：无主动写；`stateEffects` / `commandScope`：`VERIFY-ENVELOPE`，lint 命令。
- `subdelegation`：false；`executionContext`：默认 worktree；`resourceLocks`：frontend source read、eslint cache internal state。
- `owner`：final lint owner；`verification`：完整 lint；`failureDomain`：FINAL-FAN-IN；`replanTriggers`：见 envelope。
- `authorizationGate`：`VERIFY-ENVELOPE` + lint scope，status active。

### `FINAL-TYPECHECK`

- `taskBoundary`：FINAL（无提交）；`operationKind`：验证；`outcome`：合并状态通过完整 frontend type-check。
- `estimatedCost`：中；`deferralEvidence`：无；`hardPredecessors`：`T3-COMMIT`，等待稳定 commits。
- `consumes`：最终源码与 TS config；`produces`：type-check 证据；`completionEvidence`：`pnpm run type-check` exit 0。
- `readSet`：frontend TS graph/config；`writeSet`：无主动写；`stateEffects` / `commandScope`：`VERIFY-ENVELOPE`，type-check 命令。
- `subdelegation`：false；`executionContext`：默认 worktree；`resourceLocks`：frontend source read、TypeScript internal cache。
- `owner`：final type-check owner；`verification`：完整 type-check；`failureDomain`：FINAL-FAN-IN；`replanTriggers`：见 envelope。
- `authorizationGate`：`VERIFY-ENVELOPE` + type-check scope，status active。

### `FINAL-FOCUSED-LIFECYCLE`

- `taskBoundary`：FINAL（无提交）；`operationKind`：验证；`outcome`：最终 commit 状态的 Lifecycle focused 测试三浏览器非零收集并通过。
- `estimatedCost`：中；`deferralEvidence`：无；`hardPredecessors`：`T3-COMMIT`。
- `consumes`：最终 commits；`produces`：Lifecycle final Level 1 证据；`completionEvidence`：三浏览器目标非零收集、exit 0。
- `readSet`：最终源码/测试/config；`writeSet`：无主动写；`stateEffects` / `commandScope`：`VERIFY-ENVELOPE` + Lifecycle focused 命令。
- `subdelegation`：false；`executionContext`：默认 worktree、headless runner；`resourceLocks`：Vitest/Playwright browser runner write。
- `owner`：final Browser owner；`verification`：focused matrix；`failureDomain`：FINAL-FAN-IN；`replanTriggers`：见 envelope。
- `authorizationGate`：`VERIFY-ENVELOPE` + Lifecycle focused scope，status active。

### `FINAL-FOCUSED-TURNCONTROL`

- `taskBoundary`：FINAL（无提交）；`operationKind`：验证；`outcome`：最终 commit 状态的 TurnControl focused 测试三浏览器非零收集并通过。
- `estimatedCost`：中；`deferralEvidence`：无；`hardPredecessors`：`T3-COMMIT`。
- `consumes`：最终 commits；`produces`：TurnControl final Level 1 证据；`completionEvidence`：三浏览器目标非零收集、原 11 失败为零、exit 0。
- `readSet`：最终源码/测试/config；`writeSet`：无主动写；`stateEffects` / `commandScope`：`VERIFY-ENVELOPE` + TurnControl focused 命令。
- `subdelegation`：false；`executionContext`：默认 worktree、headless runner；`resourceLocks`：Vitest/Playwright browser runner write。
- `owner`：final Browser owner；`verification`：focused matrix；`failureDomain`：FINAL-FAN-IN；`replanTriggers`：见 envelope。
- `authorizationGate`：`VERIFY-ENVELOPE` + TurnControl focused scope，status active。

### `FINAL-BROWSER-PARALLEL`

- `taskBoundary`：FINAL（无提交）；`operationKind`：验证；`outcome`：完整 parallel Browser suite 在三浏览器非零收集并通过。
- `estimatedCost`：高；`deferralEvidence`：无；`hardPredecessors`：`T3-COMMIT`。
- `consumes`：最终 commits 与 parallel config；`produces`：完整 parallel Level 1 证据；`completionEvidence`：Chromium/Firefox/WebKit 各有非零目标且 suite exit 0。
- `readSet`：完整 parallel Browser scope/config；`writeSet`：无主动写；`stateEffects` / `commandScope`：`VERIFY-ENVELOPE` + full parallel 命令。
- `subdelegation`：false；`executionContext`：默认 worktree、headless runner；`resourceLocks`：Vitest/Playwright browser runner write。
- `owner`：final Browser owner；`verification`：full parallel；`failureDomain`：FINAL-FAN-IN；`replanTriggers`：见 envelope。
- `authorizationGate`：`VERIFY-ENVELOPE` + full parallel scope，status active。

### `FINAL-BROWSER-SEQUENTIAL`

- `taskBoundary`：FINAL（无提交）；`operationKind`：验证；`outcome`：完整 sequential Browser suite 在三浏览器非零收集并通过。
- `estimatedCost`：高；`deferralEvidence`：无；`hardPredecessors`：`T3-COMMIT`。
- `consumes`：最终 commits 与 sequential config；`produces`：完整 sequential Level 1 证据；`completionEvidence`：Chromium/Firefox/WebKit 各有非零目标且 suite exit 0。
- `readSet`：完整 sequential Browser scope/config；`writeSet`：无主动写；`stateEffects` / `commandScope`：`VERIFY-ENVELOPE` + full sequential 命令。
- `subdelegation`：false；`executionContext`：默认 worktree、headless runner；`resourceLocks`：Vitest/Playwright browser runner write。
- `owner`：final Browser owner；`verification`：full sequential；`failureDomain`：FINAL-FAN-IN；`replanTriggers`：见 envelope。
- `authorizationGate`：`VERIFY-ENVELOPE` + full sequential scope，status active。

### `FINAL-FAN-IN`

- `taskBoundary`：FINAL（无提交）；`operationKind`：fan-in；`outcome`：形成最终完成判定、commit 清单和 Level 1/2/3 分层报告。
- `estimatedCost`：低；`deferralEvidence`：无。
- `hardPredecessors`：`FINAL-FORMAT-CHECK`、`FINAL-LINT`、`FINAL-TYPECHECK`、`FINAL-FOCUSED-LIFECYCLE`、`FINAL-FOCUSED-TURNCONTROL`、`FINAL-BROWSER-PARALLEL`、`FINAL-BROWSER-SEQUENTIAL`；等待每个独立稳定证据。
- `consumes`：全部最终验证结果、DOC/T1/T2/T3 commit ids 与运行记录；`produces`：完成/局部失败/硬阻塞终态报告。
- `completionEvidence`：所有前置均完成；工作树/index 边界核验；报告实际并行、关键路径、未启动 ready 节点；明确 Level 2 不适用与“可见桌面验收未执行”。
- `readSet`：本地 Git 状态/提交与验证输出；`writeSet`：无；`stateEffects`：仅对话报告；`commandScope`：只读 Git/结果核验。
- `subdelegation`：false；`executionContext`：默认 worktree，只读；`resourceLocks`：本地 Git metadata read。
- `owner`：唯一协调 owner；`verification`：核对全部 completionEvidence，不能用单个 suite 替代。
- `failureDomain`：终态报告本身；`replanTriggers`：任何前置证据失效或工作树/index 出现未经解释的变化。
- `authorizationGate`：active，只读 fan-in，来源为已确认计划；无 special approvals。

## 计划内失败与动态重编图

任何节点首次失败都作为新证据，不是默认终止：记录原始输出、实际收集数、受影响产物与失效验证，释放 runner/index/formatter 锁，只暂停失败节点、读取其不稳定产物的消费者及传递后继；其他无依赖且已授权的 final 分支继续。协调 owner 在当前目标、产品语义、文件范围和授权内插入最小诊断、修正、重新格式化、重新验证与新提交节点，补齐完整节点字段、能力信封、读写集合、资源锁与失败域后立即重算 ready set。

修正已有 T1/T2/T3 commit 时必须新增独立修正 commit，禁止 amend 或 squash。动态重编图不得改写本计划正文，不得扩大文件范围、降低验证标准、修改基线、增加 timeout、降低并发、删除覆盖或新增 fallback。只有继续需要新文件/动作授权、产品结果或安全边界改变、必需工具不可获得且无替代、约束被证明矛盾，或所有具体安全有效路径都已由正面证据排除时，才把对应失败域标为硬阻塞并请求用户决定。

## 完成条件

- DOC、T1、T2、T3 各自保持独立 commit identity；没有 amend、squash、remote、force 或范围外 staged 内容。
- conditional test bridge 只有一个共享 owner，Lifecycle 行为不变；TurnControl 的 8 个 fixture-only 失败消失。
- production `KEY_DOWN_COMMAND` 只清理非提交 keydown suppression，返回 false；`KEY_ENTER_COMMAND` 是 ordinary/guide Enter 的唯一提交/消费 owner；keyup 仍保持 suppression。
- format fix/check、完整 lint、type-check、两项 focused 三浏览器测试、完整 parallel 和 sequential 三浏览器 suite 都具备非零收集与通过证据。
- 最终报告分别说明 Level 1 结果、Level 2 不适用和 Level 3 未执行，并写明“可见桌面验收未执行”。
