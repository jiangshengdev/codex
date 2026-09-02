# Codex GUI Skill Typeahead 键盘滚动 owner 修复实施计划

## 状态

- 计划状态：已确认并落盘
- 日期：2026-09-02
- 当前分支：`dev`
- 计划基线：`f31e15eb1e2abf5f23f90621e4d0d8301e22d7a7`
- 设计依据：
  `docs/superpowers/specs/2026/09/02/2026-09-02-codex-gui-skill-typeahead-keyboard-scroll-owner-design.md`
- 关联既有计划：
  `docs/superpowers/plans/2026/09/01/2026-09-01-codex-gui-composer-rich-text-skill-equation-parity-plan.md`

本文只规划 Skill Typeahead 键盘滚动 owner 修复。计划落盘不构成实现授权；用户明确确认本计划
后，才允许按下述 DAG 提交工作文档、修改测试与生产代码并验证。执行期间不得回写本文作为运行
记录。

## 唯一目标

在保留多 Composer 唯一 ARIA ID、Lexical 键盘选中 owner 和唯一内部滚动 owner 的前提下，
恢复 Skill 菜单键盘选择的内部滚动与首末精确边界覆盖，解决当前 Chromium、Firefox、WebKit
各 1 个 AppShell 响应式失败。

## 当前证据与边界

- 根因已经由三引擎精确目标测试和当前源码闭合：Lexical 私有滚动依赖固定
  `#typeahead-menu`，Composer 的多实例 ARIA owner 必须替换该 ID，而 `d7631c45f` 又删除了
  Composer renderer 自己的 `scrollIntoView({ block: "nearest" })`。
- 当前 active index、ARIA、菜单锚定、宽高、viewport 可见性、document 尺寸和 Composer bottom
  均正常；只有 active option 可见性和内部 `scrollTop` 失败。
- 当前工作树除本次设计文档外无其他变化；计划文档创建后，两个工作文档是唯一允许进入文档
  提交的文件。
- 本计划不处理现有 11 个 composition 失败，也不把本任务的 focused 或 Level 2 通过提升为既有
  RichText 计划的 F0、L2、G6 或 F6 成功。

## 最终文件范围

工作文档：

- `docs/superpowers/specs/2026/09/02/2026-09-02-codex-gui-skill-typeahead-keyboard-scroll-owner-design.md`
- `docs/superpowers/plans/2026/09/02/2026-09-02-codex-gui-skill-typeahead-keyboard-scroll-owner-plan.md`

测试修改：

- `codex-gui/src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx`

生产修改：

- `codex-gui/src/features/composerEditor/SkillTypeaheadPlugin.tsx`

只读验收：

- `codex-gui/src/__tests__/AppShell.browser.test.tsx`

`AppShell.browser.test.tsx` 不在预期写集合中；若执行证据要求修改它，必须暂停依赖该变化的节点
并回到计划门禁，不得在当前计划内顺手编辑或放宽断言。

## 提交拓扑

计划确认后形成下列独立本地提交，禁止 amend、squash、合并任务提交或 remote：

1. `docs: plan skill typeahead keyboard scrolling`
   - 只包含本次设计与计划文档。
   - 该提交是任何代码或测试编辑的硬前置。
2. `test(gui): restore skill typeahead scroll boundaries`
   - 只包含 `ComposerEditor.browser.test.tsx`。
   - 明确允许它作为 TDD 红灯中间提交；计划完成按全部提交合并后的最终状态判断。
3. `fix(gui): restore skill typeahead keyboard scrolling`
   - 只包含 `SkillTypeaheadPlugin.tsx` 的行为修复。

若权威格式入口确实产生必要的纯格式或顺序变化，不得并入行为提交；动态图必须插入独立
`style(gui): format skill typeahead scrolling changes` 修正提交。没有实际格式变化时不得创建空提交。

## 执行上下文与资源

- 使用当前 `/Users/jiangsheng/cnb/codex` worktree、`dev` 分支和默认 Git index。
- 不创建 worktree、branch 或额外 Git index。原因是测试提交是生产修复的稳定红灯前置，两项改动
  本来就存在真实串行依赖；额外 worktree 不能缩短关键路径，反而需要后续集成。
- 所有 pnpm 命令从 `/Users/jiangsheng/cnb/codex/codex-gui` 执行，并使用
  `/opt/homebrew/bin/fnm exec --using-file pnpm ...`。
- 每个 pnpm 节点执行前都必须重新运行 `/opt/homebrew/bin/fnm env --shell zsh` 并用
  `/opt/homebrew/bin/fnm exec --using-file pnpm --version` 核对来源；若 pnpm 解析到 Codex runtime
  shim 或版本入口不可用，只暂停依赖它的节点。
- Browser 使用 `vitest.browser.parallel.config.ts`，当前 live config 收集两个目标文件并在
  Chromium、Firefox、WebKit 中 headless 执行。
- Level 2 使用当次 `launch_gui` 返回的完整 URL 与已存在的 `playwright-cli`，只允许明确 non-headed
  session；不得复用旧 URL、猜测 URL 或切换 headed。
- 禁止安装依赖、runtime 或 browser binary；禁止可见浏览器、DevTools、真实 Safari、remote、
  force、amend、squash 和清理失败现场。

## 描述式执行 DAG

### DOC-COMMIT：工作文档硬门禁

- `nodeId`: `DOC-AUDIT`
- `taskBoundary`: `DOC`，文档提交边界
- `operationKind`: 审查
- `outcome`: 证明设计与计划是工作树中唯一待提交变化，且直接内容审阅与目标一致。
- `estimatedCost`: 低
- `deferralEvidence`: 无
- `hardPredecessors`: 无；计划确认后属于初始 ready set。
- `consumes`: 用户对本计划的明确确认、本次设计和计划文件。
- `produces`: 精确文档 allowlist 与可提交 diff 证据。
- `completionEvidence`: `git status --short --untracked-files=all` 精确列出两个 untracked 工作文档；
  用定向 `sed` 读取并审阅两个完整文件；默认 index 为空。untracked 内容的 whitespace 检查留给
  `DOC-STAGE` 的 `git diff --cached --check`，不得把普通 `git diff` 的空输出当成证据。
- `readSet`: 两个工作文档、当前 worktree 状态、默认 Git index。
- `writeSet`: 空。
- `stateEffects`: 无。
- `commandScope`: `git status --short --untracked-files=all`、定向 `sed`、index/status 等本地只读命令；
  禁止用普通 `git diff` 声称审阅了 untracked 内容。
- `subdelegation`: 禁止。
- `executionContext`: 当前 `dev` worktree、默认 Git index，只读。
- `resourceLocks`: 当前 worktree 与默认 Git index，read。
- `owner`: DOC taskBoundary 的唯一 Git owner。
- `verification`: 文档路径、设计目标、生产/测试范围、提交拓扑与本文 DAG 相互一致。
- `failureDomain`: `DOC-STAGE`、`DOC-COMMIT` 及全部实现节点。
- `replanTriggers`: 出现 allowlist 外 dirty、文档目标冲突、基线漂移或需要新文件。
- `authorizationGate`: 当前为 `waiting`；用户明确确认本计划后，由 `$action-authorization` 为本地
  文档 stage/commit 形成 active 能力信封。

- `nodeId`: `DOC-STAGE`
- `taskBoundary`: `DOC`
- `operationKind`: stage
- `outcome`: 默认 Git index 只包含两个工作文档。
- `estimatedCost`: 低
- `deferralEvidence`: 无
- `hardPredecessors`: `DOC-AUDIT`；等待其精确 allowlist 与 clean staged baseline。
- `consumes`: `DOC-AUDIT` 的 allowlist。
- `produces`: 文档-only staged snapshot。
- `completionEvidence`: `git diff --cached --name-only` 精确等于两个工作文档，且
  `git diff --cached --check` 通过。
- `readSet`: 两个工作文档、默认 Git index。
- `writeSet`: 默认 Git index 中两个工作文档的 entries。
- `stateEffects`: stage 两个文档。
- `commandScope`: `git add -- <design> <plan>` 与 staged 只读审查；禁止 `-f`。
- `subdelegation`: 禁止。
- `executionContext`: 当前 `dev` worktree、默认 Git index，独占。
- `resourceLocks`: 默认 Git index canonical path，write。
- `owner`: DOC taskBoundary 的唯一 Git owner。
- `verification`: staged allowlist 与 staged diff 完整审查。
- `failureDomain`: `DOC-COMMIT` 及全部实现节点。
- `replanTriggers`: index 已含其他条目、文件被 ignore、stage 内容与审计快照不一致。
- `authorizationGate`: 计划确认后由中央能力信封激活；当前 `waiting`。

- `nodeId`: `DOC-COMMIT`
- `taskBoundary`: `DOC`
- `operationKind`: commit
- `outcome`: 创建独立文档提交 `docs: plan skill typeahead keyboard scrolling`。
- `estimatedCost`: 低
- `deferralEvidence`: 无
- `hardPredecessors`: `DOC-STAGE`；等待文档-only staged snapshot。
- `consumes`: 已审查 staged snapshot。
- `produces`: 文档 commit id，作为全部代码/测试编辑的稳定门禁产物。
- `completionEvidence`: commit 成功；`git show --stat --oneline HEAD` 只列两个文档；index clean。
- `readSet`: staged snapshot、local Git identity。
- `writeSet`: 本地 `dev` ref、对象库和默认 Git index。
- `stateEffects`: 一个本地 commit；不触碰 remote。
- `commandScope`: `git commit -m 'docs: plan skill typeahead keyboard scrolling'` 与本地只读核对。
- `subdelegation`: 禁止。
- `executionContext`: 当前 `dev` worktree、默认 Git index，独占。
- `resourceLocks`: local `dev` ref、Git object database、默认 Git index，write。
- `owner`: DOC taskBoundary 的唯一 Git owner。
- `verification`: commit identity、父提交、文件 allowlist。
- `failureDomain`: 全部实现节点；文档提交失败时禁止开始实现。
- `replanTriggers`: commit identity 漂移、hooks 修改 allowlist、commit 失败或 HEAD 非预期。
- `authorizationGate`: 计划确认后由中央能力信封激活；当前 `waiting`。

### ENV-PREFLIGHT：frontend 执行入口

- `nodeId`: `ENV-PREFLIGHT`
- `taskBoundary`: 无提交，执行环境预检
- `operationKind`: 调查
- `outcome`: 证明后续 pnpm、Browser 与 Level 2 节点拥有当前有效的权威入口和工具来源。
- `estimatedCost`: 低
- `deferralEvidence`: 无
- `hardPredecessors`: `DOC-COMMIT`；实现前先满足工作文档提交硬门禁。
- `consumes`: live `package.json`、Vitest configs、fnm、pnpm、`playwright-cli` 和当前 worktree。
- `produces`: frontend command preflight 证据；每个后续命令节点仍须即时复核。
- `completionEvidence`: cwd/HEAD/branch 符合计划；`test:browser:parallel`、format、oxlint、ESLint、
  type-check scripts 存在；fnm-backed pnpm 可用且不来自 Codex runtime shim；parallel config 非零收集
  目标路径并声明三引擎 headless；`playwright-cli` 存在。
- `readSet`: package/config、工具路径、当前 Git 状态。
- `writeSet`: 空。
- `stateEffects`: 无。
- `commandScope`: 本地只读 Git/文件检查、`/opt/homebrew/bin/fnm env --shell zsh`、
  `/opt/homebrew/bin/fnm exec --using-file pnpm --version`、`command -v playwright-cli`。
- `subdelegation`: 禁止。
- `executionContext`: 当前 worktree，只读。
- `resourceLocks`: package/config/tool paths，read。
- `owner`: frontend 预检执行者。
- `verification`: 记录实际 cwd、HEAD、脚本、三引擎与工具来源，不用历史计划代替 live 结果。
- `failureDomain`: 全部 pnpm、Browser 和 Level 2 节点；不依赖缺失工具的本地文档/提交审计不受影响。
- `replanTriggers`: 工具缺失、script/config 漂移、pnpm 来源错误、目标不再被收集。
- `authorizationGate`: 计划确认后由中央只读预检能力信封激活；当前 `waiting`。

### TEST：恢复精确红灯合同

- `nodeId`: `TEST-EDIT`
- `taskBoundary`: `TEST`，独立测试提交
- `operationKind`: 编辑
- `outcome`: 在现有 catalog-state 参数化测试中恢复首末 0/max、6px clearance、banner、ARIA、
  focus 和 active style 断言，不新建平行矩阵。
- `estimatedCost`: 中
- `deferralEvidence`: 无
- `hardPredecessors`: `ENV-PREFLIGHT`；等待文档 commit 与 frontend 权威入口证据。
- `consumes`: 已确认设计、文档 commit、当前参数化测试 seam、`d7631c45f` 删除前的历史合同。
- `produces`: 仅测试文件的未暂存 diff。
- `completionEvidence`: diff 只修改参数化测试；保留四种 catalog 状态；没有豁免、skip、断言放宽、
  production hook 或 AppShell 修改。
- `readSet`: 设计、计划、`ComposerEditor.browser.test.tsx`、`SkillTypeaheadPlugin.tsx`、相关 local
  history。
- `writeSet`: `codex-gui/src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx`。
- `stateEffects`: 一个测试源码 diff；不操作 index。
- `commandScope`: `apply_patch` 与定向只读 diff。
- `subdelegation`: 禁止。
- `executionContext`: 当前 `dev` worktree、默认 Git index 不写。
- `resourceLocks`: 目标测试文件 canonical path，write。
- `owner`: TEST taskBoundary 的编辑执行者。
- `verification`: 结构审查确认测试真实读取唯一 scroll region 与首末 option geometry。
- `failureDomain`: `TEST-RED`、`TEST-STAGE`、`TEST-COMMIT` 及生产修复后继。
- `replanTriggers`: 需要新测试文件、生产 hook、AppShell 编辑或新产品语义。
- `authorizationGate`: 计划确认后由中央能力信封激活；当前 `waiting`。

- `nodeId`: `TEST-RED`
- `taskBoundary`: `TEST`
- `operationKind`: 验证
- `outcome`: 新恢复的直接合同在未修生产代码时稳定红灯，且失败只指向内部滚动边界。
- `estimatedCost`: 中
- `deferralEvidence`: 无
- `hardPredecessors`: `TEST-EDIT`；等待完整测试 diff。
- `consumes`: 修改后的测试与未修改生产代码。
- `produces`: 三引擎红灯证据。
- `completionEvidence`: 目标测试非零收集；Chromium、Firefox、WebKit 均执行四种 catalog case；
  失败字段限定为末项不可见、`scrollTop` 未到 max 或对应 6px 边界，而 active、ARIA、focus、banner
  仍正确。该预先声明的红灯属于节点成功；其他错误进入动态诊断。
- `readSet`: 目标测试、生产代码、Vitest config。
- `writeSet`: 空；测试程序内部自动产物按能力信封处理，不主动清理。
- `stateEffects`: headless Browser 测试进程及其自动缓存/失败截图。
- `commandScope`: 从 `codex-gui` 先重复 fnm/pnpm 来源预检，再通过固化 script 执行
  `/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:parallel --run src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx -t 'keeps keyboard navigation at the candidate scroll boundaries across catalog states'`；script 参数后不得插入额外 `--`。
- `subdelegation`: 禁止。
- `executionContext`: 当前 worktree，Browser runner 只读源码。
- `resourceLocks`: Vitest parallel Browser runner 与浏览器实例，write/独占运行状态。
- `owner`: TEST taskBoundary 的验证执行者。
- `verification`: 记录实际 collected/failed 数和三引擎分布，不能以退出码替代目标命中。
- `failureDomain`: `TEST-STAGE` 及全部生产修复节点；非预期失败先插入只读诊断节点。
- `replanTriggers`: 测试未收集、错误不是滚动合同、需要修改产品结果或测试 seam。
- `authorizationGate`: 计划确认后由中央能力信封激活；当前 `waiting`。

- `nodeId`: `TEST-STAGE`
- `taskBoundary`: `TEST`
- `operationKind`: stage
- `outcome`: index 只包含目标测试文件。
- `estimatedCost`: 低
- `deferralEvidence`: 无
- `hardPredecessors`: `TEST-RED`；等待有效红灯稳定证据。
- `consumes`: 测试 diff 与红灯证据。
- `produces`: test-only staged snapshot。
- `completionEvidence`: staged allowlist 精确为目标测试；staged diff/check 通过。
- `readSet`: 测试 diff、默认 Git index。
- `writeSet`: 默认 Git index 中目标测试 entry。
- `stateEffects`: stage 一个测试文件。
- `commandScope`: `git add -- <test-file>` 及 staged 只读审查；禁止 `-f`。
- `subdelegation`: 禁止。
- `executionContext`: 当前 worktree、默认 Git index，独占。
- `resourceLocks`: 默认 Git index，write。
- `owner`: TEST taskBoundary 的唯一 Git owner。
- `verification`: staged diff 保持 red contract，不含 production 或文档变化。
- `failureDomain`: `TEST-COMMIT` 及全部生产修复节点。
- `replanTriggers`: index 污染或 staged snapshot 与已验证 diff 不同。
- `authorizationGate`: 计划确认后由中央能力信封激活；当前 `waiting`。

- `nodeId`: `TEST-COMMIT`
- `taskBoundary`: `TEST`
- `operationKind`: commit
- `outcome`: 创建 `test(gui): restore skill typeahead scroll boundaries`。
- `estimatedCost`: 低
- `deferralEvidence`: 无
- `hardPredecessors`: `TEST-STAGE`；等待 test-only staged snapshot。
- `consumes`: staged snapshot 与红灯证据。
- `produces`: 独立测试 commit id，作为生产修复的稳定输入。
- `completionEvidence`: commit 只含目标测试文件；index clean；红灯证据绑定该 commit 内容。
- `readSet`: staged snapshot、local Git identity。
- `writeSet`: local `dev` ref、对象库、默认 Git index。
- `stateEffects`: 一个本地 commit。
- `commandScope`: `git commit -m 'test(gui): restore skill typeahead scroll boundaries'` 与只读核对。
- `subdelegation`: 禁止。
- `executionContext`: 当前 worktree、默认 Git index，独占。
- `resourceLocks`: local `dev` ref、Git object database、默认 Git index，write。
- `owner`: TEST taskBoundary 的唯一 Git owner。
- `verification`: commit allowlist 与父提交身份。
- `failureDomain`: 全部生产修复节点。
- `replanTriggers`: commit hooks 改写内容、commit 失败或 HEAD 漂移。
- `authorizationGate`: 计划确认后由中央能力信封激活；当前 `waiting`。

### FIX：恢复 Composer renderer 滚动副作用

- `nodeId`: `FIX-EDIT`
- `taskBoundary`: `FIX`，独立行为提交
- `operationKind`: 编辑
- `outcome`: 在 `SkillMenu` 中恢复 active option 派生与 `useLayoutEffect` nearest 滚动。
- `estimatedCost`: 低
- `deferralEvidence`: 无
- `hardPredecessors`: `TEST-COMMIT`；等待稳定的 test-only 红灯 commit。
- `consumes`: 红灯合同、设计 owner 边界、当前 `selectedIndex`/option ref seam。
- `produces`: 仅 production 文件的行为 diff。
- `completionEvidence`: 只新增所需 React hook import、`activeOption` 派生和
  `activeOption?.ref?.current?.scrollIntoView({ block: "nearest" })` layout effect；不新增 Arrow
  command、状态、helper、ID fallback、手写几何或代码顺序调整。
- `readSet`: 设计、计划、test commit、`SkillTypeaheadPlugin.tsx`、Lexical authored source。
- `writeSet`: `codex-gui/src/features/composerEditor/SkillTypeaheadPlugin.tsx`。
- `stateEffects`: 一个 production 源码 diff；不操作 index。
- `commandScope`: `apply_patch` 与定向只读 diff。
- `subdelegation`: 禁止。
- `executionContext`: 当前 worktree、默认 Git index 不写。
- `resourceLocks`: production 文件 canonical path，write。
- `owner`: FIX taskBoundary 的编辑执行者。
- `verification`: diff 与设计逐项比对；不得依赖 Lexical 私有固定 ID。
- `failureDomain`: `FIX-BROWSER`、`FIX-OXLINT`、`FIX-ESLINT`、`FIX-TYPECHECK`、`FIX-FANIN`、
  提交与最终验收。
- `replanTriggers`: nearest 滚动被证明确实移动外层 ancestor、需要新文件或产品边界变化。
- `authorizationGate`: 计划确认后由中央能力信封激活；当前 `waiting`。

`FIX-EDIT` 完成后，`FIX-BROWSER`、`FIX-OXLINT`、`FIX-ESLINT` 与 `FIX-TYPECHECK` 同时进入
ready set。四者只读同一稳定工作树 diff，使用不同 runner，不存在源码 write 冲突；不得因编号
或习惯人为串行。format check 在行为 commit 后运行，真实原因是必须先发布 behavior-only 稳定
commit，才能让可能的 formatter 输出天然成为独立 format-only diff。

- `nodeId`: `FIX-BROWSER`
- `taskBoundary`: `FIX`
- `operationKind`: 验证
- `outcome`: 直接边界、唯一 scroll owner、多 Composer、drawer、pointer hover 和 AppShell 响应式
  合同在三引擎全部通过。
- `estimatedCost`: 中
- `deferralEvidence`: 无
- `hardPredecessors`: `FIX-EDIT`；等待完整 production diff。
- `consumes`: production diff、test commit、两个既有 Browser 文件、parallel config。
- `produces`: focused 三引擎绿色证据。
- `completionEvidence`: 目标测试非零收集；Chromium、Firefox、WebKit 均 0 failed/0 skipped；
  AppShell 的 document/Composer/menu geometry 断言保持原样通过。
- `readSet`: production/test 文件、Vitest/Vite config、package manifest。
- `writeSet`: 空；测试程序内部自动产物按能力信封处理，不主动清理。
- `stateEffects`: headless Browser 测试进程与自动缓存。
- `commandScope`: 从 `codex-gui` 先重复 fnm/pnpm 来源预检，再通过固化 script 执行
  `/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:parallel --run src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx src/__tests__/AppShell.browser.test.tsx -t 'uses a clipped Select popover surface with one nested scroll owner|keeps keyboard navigation at the candidate scroll boundaries across catalog states|keeps simultaneous typeahead ids and keyboard ownership scoped to each editor|keeps a drawer-placed skill menu inside its dialog and returns focus after selection|does not scroll back to an offscreen active candidate on pointer hover|App keeps the skill menu anchored above the composer across responsive viewports'`；script 参数后不得插入额外 `--`。
- `subdelegation`: 禁止。
- `executionContext`: 当前 worktree，Browser runner。
- `resourceLocks`: Vitest parallel Browser runner 与浏览器实例，write/独占运行状态。
- `owner`: FIX taskBoundary 的 Browser 验证执行者。
- `verification`: 记录实际 collected/passed 数、三引擎分布和 0 skipped；截图不替代断言。
- `failureDomain`: `FIX-FANIN`、`FIX-STAGE`、`FIX-COMMIT` 与最终审计；失败按执行图插入诊断/修正。
- `replanTriggers`: 外层滚动、ARIA、多 Composer、hover 或 drawer 合同失败，或者目标未收集。
- `authorizationGate`: 计划确认后由中央能力信封激活；当前 `waiting`。

- `nodeId`: `FIX-OXLINT`
- `taskBoundary`: `FIX`
- `operationKind`: 验证
- `outcome`: oxlint 在当前组合状态通过。
- `estimatedCost`: 低
- `deferralEvidence`: 无
- `hardPredecessors`: `FIX-EDIT`；等待完整 production diff。
- `consumes`: test commit、production diff、live `lint:oxlint` script。
- `produces`: oxlint 绿色证据。
- `completionEvidence`: 命令退出 0，真实扫描项目且不运行 fix。
- `readSet`: `codex-gui/**`、live package/config、当前 diff。
- `writeSet`: 空；工具内部自动 cache 按能力信封处理。
- `stateEffects`: oxlint 进程及自动 cache。
- `commandScope`: 从 `codex-gui` 重复 fnm/pnpm 来源预检后执行
  `/opt/homebrew/bin/fnm exec --using-file pnpm run lint:oxlint`。
- `subdelegation`: 禁止。
- `executionContext`: 当前 worktree，oxlint runner。
- `resourceLocks`: oxlint runner，独占运行状态。
- `owner`: FIX taskBoundary 的 oxlint 验证执行者。
- `verification`: 记录退出状态与实际扫描结果。
- `failureDomain`: `FIX-FANIN`、提交与最终验收。
- `replanTriggers`: script/tool 来源变化或暴露计划外错误。
- `authorizationGate`: 计划确认后由中央能力信封激活；当前 `waiting`。

- `nodeId`: `FIX-ESLINT`
- `taskBoundary`: `FIX`
- `operationKind`: 验证
- `outcome`: ESLint 在当前组合状态通过。
- `estimatedCost`: 低
- `deferralEvidence`: 无
- `hardPredecessors`: `FIX-EDIT`；等待完整 production diff。
- `consumes`: test commit、production diff、live `lint:eslint` script。
- `produces`: ESLint 绿色证据。
- `completionEvidence`: 命令退出 0，真实扫描项目且不运行 fix。
- `readSet`: `codex-gui/**`、live package/config、当前 diff。
- `writeSet`: 空；`.eslintcache` 等程序内部自动 cache 按能力信封处理。
- `stateEffects`: ESLint 进程及自动 cache。
- `commandScope`: 从 `codex-gui` 重复 fnm/pnpm 来源预检后执行
  `/opt/homebrew/bin/fnm exec --using-file pnpm run lint:eslint`。
- `subdelegation`: 禁止。
- `executionContext`: 当前 worktree，ESLint runner。
- `resourceLocks`: ESLint runner 与其自动 cache，write/独占运行状态。
- `owner`: FIX taskBoundary 的 ESLint 验证执行者。
- `verification`: 记录退出状态与实际扫描结果。
- `failureDomain`: `FIX-FANIN`、提交与最终验收。
- `replanTriggers`: script/tool 来源变化或暴露计划外错误。
- `authorizationGate`: 计划确认后由中央能力信封激活；当前 `waiting`。

- `nodeId`: `FIX-TYPECHECK`
- `taskBoundary`: `FIX`
- `operationKind`: 验证
- `outcome`: TypeScript type-check 在当前组合状态通过。
- `estimatedCost`: 中
- `deferralEvidence`: 无
- `hardPredecessors`: `FIX-EDIT`；等待完整 production diff。
- `consumes`: test commit、production diff、live `type-check` script。
- `produces`: type-check 绿色证据。
- `completionEvidence`: 命令退出 0，`tsc -b --noEmit` 实际执行。
- `readSet`: `codex-gui/**`、tsconfig、live package/config、当前 diff。
- `writeSet`: 空；工具内部自动 cache 按能力信封处理。
- `stateEffects`: TypeScript 进程及自动 cache。
- `commandScope`: 从 `codex-gui` 重复 fnm/pnpm 来源预检后执行
  `/opt/homebrew/bin/fnm exec --using-file pnpm run type-check`。
- `subdelegation`: 禁止。
- `executionContext`: 当前 worktree，TypeScript runner。
- `resourceLocks`: TypeScript runner，独占运行状态。
- `owner`: FIX taskBoundary 的 type-check 验证执行者。
- `verification`: 记录退出状态与目标 config。
- `failureDomain`: `FIX-FANIN`、提交与最终验收。
- `replanTriggers`: script/tool 来源变化、配置漂移或暴露计划外错误。
- `authorizationGate`: 计划确认后由中央能力信封激活；当前 `waiting`。

- `nodeId`: `FIX-FANIN`
- `taskBoundary`: `FIX`
- `operationKind`: fan-in
- `outcome`: Browser、oxlint、ESLint 与 type-check 证据共同绑定当前 production diff，且完整 diff
  仅含 production 文件。
- `estimatedCost`: 低
- `deferralEvidence`: 无
- `hardPredecessors`: `FIX-BROWSER`、`FIX-OXLINT`、`FIX-ESLINT`、`FIX-TYPECHECK`；等待四个并行
  验证分支的稳定证据。
- `consumes`: 四分支验证证据、当前 diff、test commit identity。
- `produces`: 可提交 behavior-only snapshot 结论。
- `completionEvidence`: 四分支均绿色；`git diff --check` 通过；unstaged allowlist 精确为 production
  文件；index clean。format 仍由 behavior commit 后的独立节点验收。
- `readSet`: 当前 diff、Git status/index、四分支结果。
- `writeSet`: 空。
- `stateEffects`: 无。
- `commandScope`: 本地只读 Git 命令与结果审查。
- `subdelegation`: 禁止。
- `executionContext`: 当前 worktree、默认 Git index，只读。
- `resourceLocks`: production 文件与默认 Git index，read。
- `owner`: FIX taskBoundary 的唯一 Git owner。
- `verification`: 组合验证结论不得复用 TEST-RED 或其他旧快照。
- `failureDomain`: `FIX-STAGE`、`FIX-COMMIT` 与最终审计。
- `replanTriggers`: diff 超范围、验证对应的源码快照漂移或 index 污染。
- `authorizationGate`: 计划确认后由中央能力信封激活；当前 `waiting`。

- `nodeId`: `FIX-STAGE`
- `taskBoundary`: `FIX`
- `operationKind`: stage
- `outcome`: index 只包含 production 文件。
- `estimatedCost`: 低
- `deferralEvidence`: 无
- `hardPredecessors`: `FIX-FANIN`；等待可提交 behavior-only snapshot。
- `consumes`: 已验证 production diff。
- `produces`: behavior-only staged snapshot。
- `completionEvidence`: staged allowlist 精确；`git diff --cached --check` 通过；staged diff 与已验证
  diff 一致。
- `readSet`: production diff、默认 Git index。
- `writeSet`: 默认 Git index 中 production file entry。
- `stateEffects`: stage 一个 production 文件。
- `commandScope`: `git add -- <production-file>` 与 staged 只读审查；禁止 `-f`。
- `subdelegation`: 禁止。
- `executionContext`: 当前 worktree、默认 Git index，独占。
- `resourceLocks`: 默认 Git index，write。
- `owner`: FIX taskBoundary 的唯一 Git owner。
- `verification`: staged diff 不含 test、docs 或顺序调整。
- `failureDomain`: `FIX-COMMIT` 与最终审计。
- `replanTriggers`: staged snapshot 不一致、index 污染或 hook 前置变化。
- `authorizationGate`: 计划确认后由中央能力信封激活；当前 `waiting`。

- `nodeId`: `FIX-COMMIT`
- `taskBoundary`: `FIX`
- `operationKind`: commit
- `outcome`: 创建 `fix(gui): restore skill typeahead keyboard scrolling`。
- `estimatedCost`: 低
- `deferralEvidence`: 无
- `hardPredecessors`: `FIX-STAGE`；等待 behavior-only staged snapshot。
- `consumes`: staged snapshot、focused Browser、oxlint、ESLint 与 type-check 证据。
- `produces`: 独立行为 commit id。
- `completionEvidence`: commit 只含 production 文件；index/worktree clean；父提交是 TEST commit。
- `readSet`: staged snapshot、local Git identity、验证结果。
- `writeSet`: local `dev` ref、对象库、默认 Git index。
- `stateEffects`: 一个本地 commit。
- `commandScope`: `git commit -m 'fix(gui): restore skill typeahead keyboard scrolling'` 与只读核对。
- `subdelegation`: 禁止。
- `executionContext`: 当前 worktree、默认 Git index，独占。
- `resourceLocks`: local `dev` ref、Git object database、默认 Git index，write。
- `owner`: FIX taskBoundary 的唯一 Git owner。
- `verification`: commit allowlist、parent、message 与已验证 snapshot 一致。
- `failureDomain`: `FORMAT-CHECK`、Level 1 fan-in、Level 2 与最终审计。
- `replanTriggers`: hooks 改写内容、commit 失败、HEAD 漂移或工作树不 clean。
- `authorizationGate`: 计划确认后由中央能力信封激活；当前 `waiting`。

### FORMAT：behavior commit 后的格式验收

- `nodeId`: `FORMAT-CHECK`
- `taskBoundary`: 无提交；通过时是最终验证，失败时触发独立 FORMAT taskBoundary
- `operationKind`: 验证
- `outcome`: 权威 oxfmt 非 fix 检查在最终 behavior commit 状态通过，或精确产生需要独立修正的
  format-only 失败证据。
- `estimatedCost`: 低
- `deferralEvidence`: 无
- `hardPredecessors`: `FIX-COMMIT`；等待 behavior-only 稳定 commit，使任何 formatter 输出天然
  与行为提交隔离。
- `consumes`: DOC/TEST/FIX commits、live `format:oxfmt` script。
- `produces`: format 绿色证据；若失败则产生条件 FORMAT 分支输入。
- `completionEvidence`: 正常路径要求命令退出 0 且 worktree/index clean；非零时节点进入失败并按条件
  FORMAT taskBoundary 动态重编，不能事后把失败算成成功。
- `readSet`: `codex-gui/**`、live package/config、最终 committed snapshot。
- `writeSet`: 空。
- `stateEffects`: oxfmt check 进程，不运行 fix。
- `commandScope`: 从 `codex-gui` 重复 fnm/pnpm 来源预检后执行
  `/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt`。
- `subdelegation`: 禁止。
- `executionContext`: 当前 clean worktree，oxfmt runner。
- `resourceLocks`: oxfmt runner，独占运行状态。
- `owner`: 最终格式验证执行者。
- `verification`: 记录实际扫描文件数与退出状态；format fail 不得被 lint/type 结果覆盖。
- `failureDomain`: `L1-FANIN`、Level 2 与最终审计；条件 FORMAT 分支成功后恢复。
- `replanTriggers`: script/tool 来源变化、allowlist 外格式漂移或 formatter 输出含语义变化。
- `authorizationGate`: 计划确认后由中央验证能力信封激活；当前 `waiting`。

- `nodeId`: `L1-FANIN`
- `taskBoundary`: 无提交，Level 1 fan-in
- `operationKind`: fan-in
- `outcome`: 最终 committed snapshot 同时具备 focused Browser、format、oxlint、ESLint 与
  type-check 绿色证据。
- `estimatedCost`: 低
- `deferralEvidence`: 无
- `hardPredecessors`: `FIX-COMMIT`、`FORMAT-CHECK`；若触发 FORMAT taskBoundary，则动态图以
  FORMAT commit 后重新执行的绿色 format/static 证据替换旧前置。
- `consumes`: 最终 commit identity、Level 1 行为与静态证据。
- `produces`: Level 1 完成证据，解锁 Level 2。
- `completionEvidence`: 所有适用命令非零命中并绿色；证据读取最终提交状态；worktree/index clean。
- `readSet`: commits、验证结果、Git status。
- `writeSet`: 空。
- `stateEffects`: 无。
- `commandScope`: 只读结果与 Git 审查。
- `subdelegation`: 禁止。
- `executionContext`: 当前 worktree，只读。
- `resourceLocks`: local Git snapshot 与验证结果，read。
- `owner`: 主协调者 fan-in；不替代独立最终审计。
- `verification`: 不复用 TEST-RED，不把 focused 结果外推为完整 Browser suite。
- `failureDomain`: Level 2 与最终完成声明。
- `replanTriggers`: 最终 commit 漂移、证据绑定旧 snapshot 或 format/static 未绿色。
- `authorizationGate`: 计划确认后由中央 fan-in 能力信封激活；当前 `waiting`。

### LEVEL-2：无头真实 Codex runtime 验收

- `nodeId`: `L2-PREP`
- `taskBoundary`: 无提交，Level 2 准备
- `operationKind`: 调查
- `outcome`: 获得当次真实 Codex runtime 完整 GUI URL，并证明控制 session 可以明确 non-headed。
- `estimatedCost`: 低
- `deferralEvidence`: 无
- `hardPredecessors`: `L1-FANIN`；真实 runtime 只消费最终 Level 1 绿色提交状态。
- `consumes`: 当次 `launch_gui` 输出、`playwright-cli`、最终 commit。
- `produces`: 未猜测、未复用的完整 URL 与明确 non-headed session identity。
- `completionEvidence`: `launch_gui` 返回当前完整 URL；`playwright-cli open '<complete current GUI URL>'`
  不带 `--headed`；`playwright-cli list --json` 明确标识目标 session non-headed；页面是可用的真实 Codex
  runtime 与预期 route。
- `readSet`: 当前 runtime URL、session list、页面基本状态。
- `writeSet`: 空；浏览器程序内部 session 状态按能力信封处理。
- `stateEffects`: 启动或取得真实 GUI runtime URL，创建 headless browser session；无可见窗口。
- `commandScope`: `launch_gui`；`playwright-cli open '<complete current GUI URL>'`；
  `playwright-cli list --json`。不得猜测、拼接、复用旧 URL 或加 `--headed`。
- `subdelegation`: 禁止。
- `executionContext`: 当前最终 commit、真实 Codex runtime、headless browser。
- `resourceLocks`: 当次 GUI runtime/session，write/独占交互状态。
- `owner`: Level 2 准备执行者。
- `verification`: URL、route、runtime state 与 non-headed 字段全部形成当前证据。
- `failureDomain`: `L2-VERIFY` 与完整验证声明；Level 1 完成事实不失效。
- `replanTriggers`: URL/runtime/session 不可用、headed 状态不明确、页面不是当前真实应用。
- `authorizationGate`: 计划确认后由中央 Level 2 headless 能力信封激活；当前 `waiting`。

- `nodeId`: `L2-VERIFY`
- `taskBoundary`: 无提交，Level 2 验收
- `operationKind`: 验证
- `outcome`: 在真实 catalog 与实际 Composer 布局中证明键盘 active 随内部菜单滚动进入可视区，且
  document、Composer 与菜单 anchor 不移动。
- `estimatedCost`: 中
- `deferralEvidence`: 无
- `hardPredecessors`: `L2-PREP`；等待当前完整 URL、真实 runtime 与明确 headless session。
- `consumes`: 真实空 Composer、真实 Skill catalog、headless session、设计验收合同。
- `produces`: Level 2 滚动验收证据。
- `completionEvidence`: 菜单有足够真实候选形成 overflow；记录滚动前 document/Composer/menu geometry；
  键盘移动 active 到离屏候选后，active 完整进入唯一内部 scroll region，内部 `scrollTop` 前进，
  document scroll、Composer bottom 与菜单 anchor 保持稳定；不提交消息。成功时只移除本轮临时 `$`
  query；失败时保留现场，不清理。
- `readSet`: 当前真实页面 DOM、accessibility/geometry/scroll state。
- `writeSet`: 当次真实 runtime 中目标 Composer draft 的临时 query 状态；不修改仓库文件。
- `stateEffects`: 真实 GUI 内临时未提交 Composer 内容与 headless session 交互状态。
- `commandScope`: 使用既有 headless `playwright-cli` session 的 snapshot/locator/keyboard/evaluate 能力；
  禁止 headed、发送消息、路径输出、DevTools 或截图清理。
- `subdelegation`: 禁止。
- `executionContext`: `L2-PREP` 的真实 runtime/session。
- `resourceLocks`: 目标 Composer draft、当前 headless session，write/独占交互状态。
- `owner`: Level 2 验收执行者。
- `verification`: Browser DOM/geometry evidence；Level 1 fixture 或截图不得替代。
- `failureDomain`: 完整 GUI 验证声明与最终审计；若真实 catalog 不足以 overflow，标记 Level 2
  `unexecuted`，不得伪造候选或声称完全验证。
- `replanTriggers`: runtime/catalog/route 不满足前提、需要发送消息或新增 production hook 才能观察。
- `authorizationGate`: 计划确认后由中央 Level 2 headless 能力信封激活；当前 `waiting`。

### FINAL：独立提交与完成审计

- `nodeId`: `FINAL-AUDIT`
- `taskBoundary`: 无提交，最终审计
- `operationKind`: 审查
- `outcome`: 独立核对至少三个计划提交、文件边界、验证证据和剩余已知失败，形成本任务终态。
- `estimatedCost`: 低
- `deferralEvidence`: 无
- `hardPredecessors`: `L2-VERIFY`；若 Level 2 因必要真实状态不可得而 `unexecuted`，最终审计仍可
  形成部分终态，但禁止完整验证声明。若插入 FORMAT taskBoundary，则同时等待其独立提交与重验证。
- `consumes`: DOC/TEST/FIX/可选 FORMAT commit ids、最终 Git 状态、Level 1/Level 2 结果、既有
  composition 失败边界。
- `produces`: G6 风格的独立本地 Git/提交审计结论与本任务 fan-in 结论。
- `completionEvidence`: 提交顺序与 allowlist 精确；无 amend/squash/remote；worktree/index clean；
  Level 1 证据绑定最终提交状态；Level 2 结果单独记录；明确报告 composition 未修复及原计划未完成
  节点。只有 Level 2 通过时才可声明本任务完整 GUI 验证完成。
- `readSet`: local Git history/status/diffs、验证摘要、设计与计划。
- `writeSet`: 空。
- `stateEffects`: 无。
- `commandScope`: 本地只读 Git 与文件检查；禁止 remote 命令。
- `subdelegation`: 禁止。
- `executionContext`: 当前 worktree，只读。
- `resourceLocks`: local Git history、worktree、index，read。
- `owner`: 与各 taskBoundary 执行者不同的独立审计子代理；主代理保留最终判断。
- `verification`: 按提交逐一检查文件、message、parent、验证结果与剩余排除项。
- `failureDomain`: 本任务最终完成声明；审计发现已有提交问题时，按执行图插入新的独立修正
  taskBoundary，禁止 amend。
- `replanTriggers`: 发现计划外文件、验证证据失效、目标行为未满足或需要新授权。
- `authorizationGate`: 计划确认后由中央只读审计能力信封激活；当前 `waiting`。

## 条件 FORMAT taskBoundary

只有 behavior-only `FIX-COMMIT` 已形成，且 `FORMAT-CHECK` 证明权威 `format:oxfmt` 失败时，
才能动态插入 FORMAT taskBoundary；这样 formatter 的全部变化天然位于已有 TEST/FIX commits
之后，不需要在同一文件中手工拆分行为 diff 与格式 diff：

1. `FORMAT-PREFLIGHT`：确认 worktree/index clean，重复 fnm/pnpm 来源预检，记录
   `format:oxfmt:fix` 的命令级写边界为整个 `codex-gui/**`。
2. `FORMAT-FIX`：运行
   `/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt:fix`，随后审查完整 diff。
3. 若变化超出本计划两个 frontend 文件、包含语义变化或不能证明仅为 whitespace/import/声明等
   顺序调整，立即保留现场并暂停该分支，不 restore、不清理。
4. `FORMAT-VERIFY`：重新运行非 fix `format:oxfmt`；并行重跑 oxlint、ESLint、type-check。若
   独立审计不能证明纯格式语义不变，再重跑 focused Browser。
5. `FORMAT-STAGE` 与 `FORMAT-COMMIT`：只 stage 完整审计后的两个目标 frontend 文件中实际变化
   的子集，`git diff --cached --check` 通过后创建独立
   `style(gui): format skill typeahead scrolling changes`；禁止空提交、amend 或并入 TEST/FIX。
6. FORMAT commit 与重验证证据替换 `L1-FANIN` 的旧 format/static 前置，后续 Level 2 和最终审计
   消费新的最终 commit identity。

该条件分支不允许使用 direct oxfmt、lint fix、手写格式化、基线更新或新豁免。

## Ready set、关键路径与 fan-in

- 计划确认后的初始 ready set：仅 `DOC-AUDIT`。代码节点被文档 commit 硬门禁阻塞。
- 文档提交后：`ENV-PREFLIGHT → TEST-EDIT → TEST-RED → TEST-STAGE → TEST-COMMIT`。
- 测试提交后：`FIX-EDIT`。
- `FIX-EDIT` 后 fan-out：`FIX-BROWSER`、`FIX-OXLINT`、`FIX-ESLINT`、`FIX-TYPECHECK` 应实际
  并行；四者 fan-in 到 `FIX-FANIN`。
- 行为提交后：`FORMAT-CHECK → L1-FANIN → L2-PREP → L2-VERIFY → FINAL-AUDIT`；若 FORMAT
  分支被触发，`L1-FANIN` 等待其独立提交与重验证。
- 粗粒度关键路径：文档提交 → 红灯测试提交 → production edit → 较慢的 focused Browser/静态
  分支 → FIX fan-in → 行为提交 → format → Level 1 fan-in → Level 2 → 最终审计。

串行边只有以下真实原因：文档提交硬门禁；生产修复消费稳定红灯测试提交；taskBoundary 内
stage/commit 消费已验证 snapshot；format 等待 behavior commit 以隔离非行为 diff；Level 2 消费
最终 Level 1 绿色提交。没有因编号、同一仓库或 agent 复用制造其他串行边。

## 失败吸收与停止条件

- 预先声明的 TEST 红灯是成功证据，不得把它改写为异常失败，也不得为转绿提前修改生产代码。
- 计划内 Browser、lint、type 或格式失败是新证据；只要仍有已授权、安全且能产生新证据的下一步，
  就按执行图插入诊断、修正、重新验证节点并继续，不回写计划正文。
- 修正任何已有提交必须创建新的独立 commit，禁止 amend。
- 若 native nearest 滚动被证明会移动 document、dialog、Composer 或菜单 anchor，停止受影响修复
  分支并回到设计；不得静默加入手写几何 fallback。
- composition 失败、其他预存失败或计划外问题只记录并排除，不得修改。
- 只有缺少必要授权、必须改变产品结果、安全边界不可跨越、必要工具不可获得且无替代，或所有
  有效路径均被正面证据耗尽时，才能形成局部或全局硬阻塞。
- 任何失败现场、截图、cache 或中间证据不得未经授权清理、restore 或覆盖。

## 完成条件

本任务只有同时满足以下条件才完成：

1. DOC、TEST、FIX 三个 taskBoundary 均形成独立本地 commit；若触发 FORMAT，其修正也形成独立
   commit；提交顺序和 allowlist 正确。
2. 首末 `0`/`maximumScrollTop`、6px clearance、四种 catalog banner、多 Composer、drawer、hover
   和唯一 scroll owner 合同在 Chromium、Firefox、WebKit 中通过。
3. AppShell 400×876 与 1440×900 下 active 可见、内部滚动、document/Composer/menu geometry
   稳定断言保持原样通过。
4. format、oxlint、ESLint、type-check 全部通过。
5. Level 2 在当次真实 Codex runtime 与明确 non-headed session 中通过；若真实 catalog 不足以形成
   overflow 或 runtime 不可用，只能报告“实现与 Level 1 完成，完整 GUI 验证未完成”。
6. 最终 Git 审计确认 worktree/index clean，无 remote、force、amend、squash 或范围外变化。
7. 最终报告分别列出实际并行、关键路径、未启动 ready 节点，并明确 11 个 composition 失败及
   既有 RichText 计划 F0、L2、G6、F6 的状态未被本任务改变。
