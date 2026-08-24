# Codex GUI Thread Switch 终态结果实施计划

计划日期：2026-08-24

计划状态：已确认

确认日期：2026-08-24

确认原文：`确认计划。提交文档。暂不执行`

实施状态：暂缓；按用户要求，本次只提交工作文档，不启动代码、测试、生成或 GUI 验收节点。

对应已确认设计：
`docs/superpowers/specs/2026/08/24/2026-08-24-codex-gui-thread-switch-terminal-outcome-design.md`

关联 issue：
`docs/superpowers/issues/2026/08/24/2026-08-24-01-codex-gui-current-code-problems/2026-08-24-01-thread-switch-returns-disposed-owner.md`

## 目标

把 `ThreadSwitchCoordinator.continueThread()` 收敛为可信的 `ready | unavailable` 终态 interface：只有结果交付时仍存在可用目标 owner 才返回 `ready`；connection generation 在提交前或提交后结束时返回不同的 `connectionLost` 事实；目标 owner 可用但 previous-owner cleanup 或 post-commit 状态同步降级时继续成功并返回准确 warning。随后迁移 history continue 页面、Toast、Lingui catalog 和纵向测试，消除页面对 owner 生命周期的探测与误导航。

## 当前基线与必要性

计划编写时：

- 分支：`dev`
- HEAD：`4a28da9efebafb34b7a9b9ee577397dc37d5d705`
- 工作树范围内只有本次未提交 design 文档；计划创建后还会包含本文件。

实施前必须重新核验，不能把上述 HEAD 当作未来执行时的固定事实。

当前代码必须修改的证据：

- `threadSwitchCoordinator.ts` 在 commit/replay/previous-owner cleanup 后等待旧 projection detach，最终无条件返回 `switched + activeOwner`；等待期间 connection invalidation 可以销毁该 owner。
- `dispose()` 是整代 connection/owner capability 的永久终止，不是可重试的一次 switch cancellation。
- `ThreadHistoryDetailPage` 把 `current` 与 `switched` 都当作导航成功，把 `disposed` 与可重试 blocker 共用 UI，并从 `activeOwner` 读取路由 identity。
- `reserveRelease()`、reservation release、prepared/previous owner dispose 等同步异常仍可能以 rejected Promise 越过 outcome union。
- `publishActiveOwner` 同时执行 owner publication 与可能抛错的 authorization-session persistence；单个 `void` callback 不能准确区分“owner 未发布”和“owner 已发布但持久化降级”。
- AppShell 已经挂载 HeroUI `Toast.Provider`，默认 Toast queue 位于 React 外部；无需新增 Redux/context/provider。
- `ContinueThread` 由 `ThreadSwitchCoordinator["continueThread"]` 机械派生；不存在需要同步维护的第二份 DTO、runtime validator 或 generated contract。

## 计划阶段技术校准

反向审计发现并已在设计文档中补齐三项不改变产品决策的技术缺口：

1. `operationFailed.phase` 增加 `admission`，保证 reserve/release 等 admission 异常也进入总 outcome。
2. warning 区分 `previousOwnerCleanupFailed` 与 `postCommitDegraded`，避免把 authorization/replay 降级错误展示为“上一任务清理未完成”。
3. `connectionLost` 保留次级 `cleanupError`，但 connection termination 始终是主因。

实施必须以 coordinator generation/disposed/commit 事实做分类，不能根据 `GUI host WebSocket is not available` 等 Error 文本猜连接状态。GUI host 会先拒绝 pending command，再同步使 commands unavailable 并 dispose coordinator；Promise catch 在后续 microtask 执行时必须重新读取 lifecycle fact。

## 完整纵向路径

```text
history detail “Continue this task”
  -> AppCapabilities.continueThread
  -> ThreadSwitchCoordinator.continueThread
       -> admission / reserveRelease
       -> thread/resume
       -> thread/projection/attach
       -> prepare + commit
       -> publish owner + authorization persistence receipt
       -> replay
       -> previous owner local cleanup
       -> previous projection remote detach (await)
       -> final lifecycle gate
       -> ready(threadId, warning) | unavailable(failure)
  -> ThreadHistoryDetailPage
       -> ready: optional toast.warning + replace navigation
       -> temporary blocker: warning Alert + valid recovery
       -> connectionLost: danger Alert + remain history
       -> operationFailed: phase summary + primary/secondary diagnostic
```

Connection invalidation path：

```text
WebSocket error / close / cleanup
  -> GuiHostCommandGateway.invalidate
  -> onCommandsUnavailable
  -> GuiHostConnectionBridge.invalidateCommandsAndOwner
  -> ThreadSwitchCoordinator.dispose
  -> clear commands / activeOwner / continueThread
  -> pending RPC rejection settles later
  -> coordinator final classification prefers connectionLost
```

## 跨任务硬约束

1. `ready` 是唯一可导航结果，只携带权威 `threadId` 与 nullable warning，不携带 owner。
2. unavailable 结果不得携带 owner；页面不得读取 queue readiness、projection owner 或 disposed flag。
3. `current` 与 `switched` 合并为 `ready`，不保留兼容 alias、overload、adapter 或双路径。
4. connection lost 必须按 commit fact 区分 `beforeCommit` 与 `afterCommit`；两者都不导航。
5. connection termination 的分类优先级高于 pending RPC 的 rejection phase；不得从 Error message 猜生命周期。
6. admission、resume、attach、activate 和 cleanup 的异常全部收敛成 outcome；未预期 throw 的页面 catch 只保留为防御，不构成第二套正常错误协议。
7. owner publication 与 authorization persistence 必须在内部 seam 上可判定。目标 owner 已发布且可用、只有 authorization persistence 失败时返回 `ready + postCommitDegraded`。
8. previous owner local dispose 与 remote detach 必须分别尝试；一个失败不得跳过另一个。目标 owner 可用时合并为 `previousOwnerCleanupFailed` warning。
9. cleanup diagnostic 不覆盖主要 failure；connectionLost 和 operationFailed 都保留必要次级诊断。
10. busy 与 queue blocker 保持暂时可恢复；只有 `currentThreadUnresolved` 携带可导航的 `activeThreadId`。
11. old connection generation 的 `continueThread` 永久失效。页面只跟随当前 AppCapabilities，不能在本地保存 stale recovery callback。
12. cleanup warning 使用现有 HeroUI v3 `toast.warning(title, { description })`；不新增 provider、Redux slice、context、event bus 或手写 toast。
13. JSX 文案使用 Lingui `Trans`，Toast 等非 JSX 字符串使用 `useLingui` 的 `t`；catalog 只通过 `messages:extract` 生成结构，再补目标中文翻译。
14. `ContinueThread` 继续从 coordinator method 机械派生；禁止页面或测试重新声明镜像 union。
15. 不修改 app-server RPC、wire contract、generated validator、GUI Host allowlist 或 server projection 语义。
16. 行为提交不得夹带 import、声明、字段、分支、函数或组件的纯顺序调整。formatter 若产生范围外或纯重排 diff，触发重编图，禁止并入行为提交。
17. 不安装依赖、runtime 或浏览器，不操作 Git 远程，不运行后端/原生构建。

## 精确实施范围

### 工作文档提交

- `docs/superpowers/specs/2026/08/24/2026-08-24-codex-gui-thread-switch-terminal-outcome-design.md`
- `docs/superpowers/plans/2026/08/24/2026-08-24-codex-gui-thread-switch-terminal-outcome-plan.md`

### Task C：coordinator 终态 contract

- `codex-gui/src/features/projectionCoordination/threadSwitchCoordinator.ts`
- `codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx`
- `codex-gui/src/features/projectionCoordination/__tests__/threadSwitchCoordinator.test.ts`

### Task U：history/UI/纵向消费

- `codex-gui/src/features/threadHistory/ThreadHistoryDetailPage.tsx`
- `codex-gui/src/features/threadHistory/__tests__/ThreadHistoryDetailPage.browser.test.tsx`
- `codex-gui/src/__tests__/App.browser.test.tsx`
- `codex-gui/src/__tests__/AppRouting.browser.test.tsx`
- `codex-gui/src/locales/en.po`
- `codex-gui/src/locales/zh-CN.po`

### 明确只读、不写

- `codex-gui/src/features/appShell/AppCapabilities.ts`：已机械派生权威方法类型。
- `codex-gui/src/App.tsx`：现有 capability state/provider 足够。
- `codex-gui/src/features/appShell/AppShell.tsx`：已有唯一 Toast provider。
- `codex-gui/src/features/projectionCoordination/activeThreadOwner.ts`：不新增公开 liveness probe。
- `codex-gui/package.json`、`lingui.config.ts`、`i18n.ts`：现有入口和 catalog 加载足够。
- app-server、protocol、generated validators、router contract 与 Rust 文件。
- 关联 issue：本计划不顺带更新 issue 状态；实现结果只在本轮交付中报告。

## 实施前门禁与 Git 拓扑

用户确认本计划前不得开始实施。确认后：

1. 先执行只读 preflight；
2. 把本计划状态更新为“已确认”，记录确认日期与确认原文；
3. design 与 plan 形成独立 docs-only 本地提交；
4. docs commit 成功前不得修改代码、测试或 catalog；
5. Task C 形成独立行为提交；
6. Task U 消费 Task C 的稳定 contract，形成独立行为提交；
7. 对已有提交的任何修正使用新的独立提交，禁止 amend；
8. 不执行 Git 远程操作。

提交拓扑：

```text
DOCS commit
  -> C commit: coordinator/bridge terminal outcome
       -> U commit: history UI/Toast/i18n + vertical consumers
            -> visible GUI + final audit
```

Task C 的中间提交允许 TypeScript consumer 尚未迁移，因此可能不能通过全项目 type-check；不得为中间提交增加兼容结果、双 union 或 fallback。Task C 只用定向 coordinator unit 证明自身状态机。Task U 直接迁移全部 consumer，并在组合状态运行 `ci` 与定向 Browser Mode。

## Worktree、branch 与 Git index

本计划不创建新 worktree。

- execution context：`/Users/jiangsheng/cnb/codex`
- branch：`dev`
- Git index：当前 worktree 的唯一共享 index
- Task C 与 Task U 不并行写：Task U 必须消费 Task C commit 的稳定新 contract，这是真实硬依赖。
- stage、commit、catalog generation 与 formatter 均由每个 taskBoundary 的唯一 Git owner 执行。

如果实施前分支不再是 `dev`、工作树出现与精确写集合重叠的用户修改，或需要新的 worktree/branch/index，停止并重新确认计划参数。

## Preflight 命令

用户确认计划后、更新计划状态与 docs commit 之前，从仓库根执行：

```bash
git status --short --branch
git rev-parse --abbrev-ref HEAD
git rev-parse HEAD
git diff --check -- docs/superpowers/specs/2026/08/24/2026-08-24-codex-gui-thread-switch-terminal-outcome-design.md docs/superpowers/plans/2026/08/24/2026-08-24-codex-gui-thread-switch-terminal-outcome-plan.md
test -x /opt/homebrew/bin/fnm
test -d codex-gui/node_modules
test -d ../vitest/docs
test -d codex-gui/.heroui-docs/react
rg -n -e 'ThreadSwitchOutcome' -e 'continueThread' -e 'commitInProgress' -e 'disposeRequested' codex-gui/src/features/projectionCoordination codex-gui/src/features/appShell codex-gui/src/features/threadHistory
rg -n -e 'type: "current"' -e 'type: "switched"' -e 'type: "blocked"' -e 'type: "failed"' codex-gui/src --glob '*.ts' --glob '*.tsx'
```

从 `codex-gui` 执行工具链预检：

```bash
/opt/homebrew/bin/fnm exec --using-file node --version
/opt/homebrew/bin/fnm exec --using-file pnpm --version
/opt/homebrew/bin/fnm exec --using-file which pnpm
```

要求：

- branch 仍为 `dev`；HEAD 漂移时重新核对权威定义、全部 consumer、测试路径和脚本，不按旧行号机械实施。
- `pnpm` 不得解析到 `/Users/jiangsheng/.cache/codex-runtimes/`。
- fnm、pnpm、`node_modules`、本地 Vitest docs、HeroUI docs 或既有浏览器缺失时停止，由用户自行安装；助手不得安装。
- `package.json` 中必须仍存在 `messages:extract`、`format:oxfmt:fix`、`format:oxfmt`、`lint`、`type-check`、`test:unit`、`test:browser:parallel` 与 `ci`。
- 除本次 design/plan 外的用户变更必须逐文件避让；与写集合重叠且无法安全避让时停止。

## 可调度执行图

以下执行图是计划的权威结构。状态以计划确认后的首次调度为准。

### A0 — 用户确认实际计划

- `nodeId`：A0
- `taskBoundary`：无提交；授权门禁。
- `operationKind`：授权。
- `outcome`：用户明确确认本文件，并授权其中精确的本地 preflight、docs commit、两个行为提交、验证与可见 GUI 动作。
- `estimatedCost`：低。
- `deferralEvidence`：无。
- `hardPredecessors`：无。
- `consumes`：本计划实际正文。
- `produces`：稳定的计划确认事实与确认原文。
- `completionEvidence`：用户明确回复“确认计划”或等价直接授权。
- `readSet`：本计划。
- `writeSet`：无。
- `executionContext`：对话授权状态。
- `resourceLocks`：无。
- `owner`：用户。
- `verification`：确认对象必须是已落盘的本文件。
- `failureDomain`：未确认时全图保持等待，不视为失败。
- `replanTriggers`：用户修改目标、范围、提交边界、验证或 worktree 参数。
- `authorizationGate`：当前未满足。

### P0 — 只读 preflight

- `nodeId`：P0
- `taskBoundary`：无提交；实施前调查。
- `operationKind`：调查。
- `outcome`：核验 branch、HEAD、dirty scope、工具、脚本、本地 docs 与全部旧 outcome consumer；输出可执行或明确漂移报告。
- `estimatedCost`：低。
- `deferralEvidence`：无。
- `hardPredecessors`：A0；计划授权后才能进入实施调度。
- `consumes`：确认计划、当前 workspace/Git/toolchain 状态。
- `produces`：preflight evidence snapshot。
- `completionEvidence`：上述命令全部成功，branch/dirty/write-set/tool 约束满足。
- `readSet`：Git metadata、design/plan、`codex-gui/package.json`、目标源码/测试、本地 Vitest/HeroUI docs。
- `writeSet`：无。
- `executionContext`：当前 dev worktree，共享 index 只读。
- `resourceLocks`：Git worktree/index read；toolchain paths read。
- `owner`：主协调者。
- `verification`：逐条检查命令退出码与实际路径，不用旧 memory 代替。
- `failureDomain`：P0 及全部后继暂停；不影响用户其他 workspace 内容。
- `replanTriggers`：branch、write set、consumer、script、tool 或 docs 路径漂移。
- `authorizationGate`：A0 满足后已授权；不授权安装或远程 Git。

### D1 — 更新计划确认状态

- `nodeId`：D1
- `taskBoundary`：DOCS。
- `operationKind`：编辑。
- `outcome`：本计划状态改为“已确认”，记录确认日期与确认原文；design 保持“已确认”。
- `estimatedCost`：低。
- `deferralEvidence`：无。
- `hardPredecessors`：P0；等待稳定 preflight。
- `consumes`：A0 确认事实、P0 evidence。
- `produces`：已确认状态的 plan 文件。
- `completionEvidence`：plan header 与用户确认原文一致，diff 只含计划状态元数据。
- `readSet`：design、plan。
- `writeSet`：plan。
- `executionContext`：当前 dev worktree，共享 index 未写。
- `resourceLocks`：plan file write。
- `owner`：DOCS Git owner。
- `verification`：`git diff --check -- <design> <plan>`。
- `failureDomain`：DOCS 与全部代码后继暂停。
- `replanTriggers`：确认原文改变实际范围或 plan 文件出现计划外 diff。
- `authorizationGate`：A0。

### D2 — scoped docs stage

- `nodeId`：D2
- `taskBoundary`：DOCS。
- `operationKind`：stage。
- `outcome`：Git index 中恰好只有本次 design 与 plan。
- `estimatedCost`：低。
- `deferralEvidence`：无。
- `hardPredecessors`：D1；等待已确认文档内容。
- `consumes`：已确认 design/plan diff。
- `produces`：docs-only staged snapshot。
- `completionEvidence`：`git diff --cached --name-only` 恰好输出两个精确路径；`git diff --cached --check` 通过。
- `readSet`：design、plan、Git index。
- `writeSet`：共享 Git index，仅两个文档路径。
- `executionContext`：当前 dev worktree，共享 index 独占。
- `resourceLocks`：canonical Git index write。
- `owner`：DOCS Git owner。
- `verification`：运行 scoped `git add -- <design> <plan>`、cached name/check/diff 审查。
- `failureDomain`：D2、D3 与全部代码后继暂停。
- `replanTriggers`：staged scope 不精确、ignored match、用户变更混入。
- `authorizationGate`：A0 精确授权 docs commit。

### D3 — docs-only commit

- `nodeId`：D3
- `taskBoundary`：DOCS。
- `operationKind`：commit。
- `outcome`：创建独立本地 docs commit。
- `estimatedCost`：低。
- `deferralEvidence`：无。
- `hardPredecessors`：D2；等待稳定 staged snapshot。
- `consumes`：docs-only staged snapshot。
- `produces`：commit `docs(gui): design thread switch terminal outcomes`。
- `completionEvidence`：本地 commit id；commit tree 只含两个文档路径。
- `readSet`：Git index、staged diff。
- `writeSet`：local Git objects/refs/index。
- `executionContext`：当前 dev branch/index 独占。
- `resourceLocks`：canonical Git index/ref write。
- `owner`：DOCS Git owner。
- `verification`：`git show --stat --oneline HEAD` 与 `git status --short --branch`。
- `failureDomain`：所有代码节点暂停；docs commit 门禁不得绕过。
- `replanTriggers`：commit hook 修改文件、提交失败、branch/HEAD 意外变化。
- `authorizationGate`：A0；只允许本地 commit，不允许远程。

### C1 — coordinator 与 publication receipt 编辑

- `nodeId`：C1
- `taskBoundary`：C。
- `operationKind`：编辑。
- `outcome`：权威 outcome、single terminal classifier、final lifecycle gate、cleanup accumulation 与 bridge publication receipt 完成；不存在旧 success union 或 owner-bearing failure。
- `estimatedCost`：中。
- `deferralEvidence`：无。
- `hardPredecessors`：D3；工作文档必须先提交。
- `consumes`：已确认 design、Task C baseline、bridge connection lifecycle。
- `produces`：Task C production diff。
- `completionEvidence`：静态搜索不再发现生产代码构造 `current|switched|blocked|failed` 旧结果；所有 exit 进入新 classifier。
- `readSet`：`threadSwitchCoordinator.ts`、`GuiHostConnectionBridge.tsx`、`activeThreadOwner.ts`、`browserAuthorizationSession.ts`、`guiHostClient.ts`。
- `writeSet`：`threadSwitchCoordinator.ts`、`GuiHostConnectionBridge.tsx`。
- `executionContext`：当前 dev worktree，共享 index 未写；Task C production owner 独占两文件。
- `resourceLocks`：两个 production files write。
- `owner`：Task C production editor。
- `verification`：只读 `rg` 核对旧结果、owner-bearing outcome、publish callback 与 detach await；不运行测试。
- `failureDomain`：C1 及 C2–C6 暂停；Task U 尚未解锁。
- `replanTriggers`：需要修改 `activeThreadOwner.ts`、AppCapabilities、AppShell、协议或写集合外文件；无法形成可判定 publication receipt。
- `authorizationGate`：A0 + D3；范围限 Task C。

### C2 — coordinator unit tests 编辑

- `nodeId`：C2
- `taskBoundary`：C。
- `operationKind`：编辑。
- `outcome`：unit tests 覆盖新总 outcome、admission/cleanup exception、同步重入、detach await connection loss、warning 分类与无 owner failure。
- `estimatedCost`：中。
- `deferralEvidence`：无。
- `hardPredecessors`：C1；测试消费稳定的新 contract/implementation diff。
- `consumes`：C1 production diff、既有 harness。
- `produces`：Task C unit test diff。
- `completionEvidence`：测试断言不再固定 `switched + disposed owner`，新增 before/after commit 与 publication/cleanup warning cases。
- `readSet`：C1 两个 production files、existing coordinator test/harness。
- `writeSet`：`threadSwitchCoordinator.test.ts`。
- `executionContext`：当前 dev worktree，共享 index 未写。
- `resourceLocks`：unit test file write；C1 files read。
- `owner`：Task C test editor。
- `verification`：静态审查 test names/assertions；实际运行由 C4。
- `failureDomain`：C2 及 C3–C6 暂停。
- `replanTriggers`：需要 test-only production helper、第二 outcome DTO 或新增 fixture 文件。
- `authorizationGate`：A0 + D3；范围限 Task C。

### C3 — Task C formatter

- `nodeId`：C3
- `taskBoundary`：C。
- `operationKind`：格式化。
- `outcome`：Task C files 通过项目 oxfmt，且 formatter 未产生 Task C 写集合外 tracked diff。
- `estimatedCost`：低。
- `deferralEvidence`：无。
- `hardPredecessors`：C1、C2；Task C edits fan-in。
- `consumes`：组合 Task C diff。
- `produces`：格式稳定 Task C diff。
- `completionEvidence`：`format:oxfmt:fix` 后 `format:oxfmt` 通过，实际 diff 仍限 Task C files。
- `readSet`：整个 `codex-gui` formatter input。
- `writeSet`：项目入口可触及整个 `codex-gui`；允许保留的 tracked write 仅 Task C 三文件。
- `executionContext`：当前 dev worktree，formatter exclusive；index 未写。
- `resourceLocks`：canonical `codex-gui` formatting write lock。
- `owner`：Task C Git owner。
- `verification`：从 `codex-gui` 运行 `/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt:fix`，再运行 `format:oxfmt` 并审查 status/diff。
- `failureDomain`：C3–C6 暂停；范围外 formatter diff 触发重编图，不自动保留或提交。
- `replanTriggers`：formatter 改动范围外文件、纯重排需要独立提交、脚本漂移。
- `authorizationGate`：A0；项目固化 formatter。

### C4 — 定向 coordinator unit verification

- `nodeId`：C4
- `taskBoundary`：C。
- `operationKind`：验证。
- `outcome`：coordinator unit file 通过。
- `estimatedCost`：中。
- `deferralEvidence`：无。
- `hardPredecessors`：C3；读取格式稳定组合 diff。
- `consumes`：Task C production/test diff。
- `produces`：unit verification evidence。
- `completionEvidence`：命令退出 0，目标测试无失败。
- `readSet`：Task C source/tests、Vitest config、node_modules。
- `writeSet`：ignored `codex-gui/node_modules/.tmp/tsconfig.vitest.tsbuildinfo` 与失败时 test artifacts。
- `executionContext`：`codex-gui`，shared worktree；test runner exclusive on its tsbuildinfo。
- `resourceLocks`：unit Vitest runner write；`tsconfig.vitest.tsbuildinfo` write。
- `owner`：Task C verifier。
- `verification`：`/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit -- src/features/projectionCoordination/__tests__/threadSwitchCoordinator.test.ts`。
- `failureDomain`：C4–C6；计划内失败插入 Task C 修正节点，其他未解锁任务等待。
- `replanTriggers`：失败要求 Task C 写集合外修改或暴露设计冲突。
- `authorizationGate`：A0；不安装依赖。

### C5 — Task C scoped stage

- `nodeId`：C5
- `taskBoundary`：C。
- `operationKind`：stage。
- `outcome`：index 恰好含 Task C 三文件的审查后 diff。
- `estimatedCost`：低。
- `deferralEvidence`：无。
- `hardPredecessors`：C4；等待验证证据。
- `consumes`：格式稳定且定向通过的 Task C diff。
- `produces`：Task C staged snapshot。
- `completionEvidence`：cached name-only 恰好为 Task C 三路径；cached check 通过；无纯重排混入。
- `readSet`：Task C files、Git index。
- `writeSet`：共享 Git index，仅 Task C paths。
- `executionContext`：current dev index exclusive。
- `resourceLocks`：canonical Git index write。
- `owner`：Task C Git owner。
- `verification`：scoped `git add --`、cached name/check/full diff。
- `failureDomain`：C5、C6 暂停。
- `replanTriggers`：staged scope 漂移、unexpected generated/cache tracked files。
- `authorizationGate`：A0 精确授权 Task C local commit。

### C6 — Task C commit

- `nodeId`：C6
- `taskBoundary`：C。
- `operationKind`：commit。
- `outcome`：创建独立 coordinator 行为提交。
- `estimatedCost`：低。
- `deferralEvidence`：无。
- `hardPredecessors`：C5。
- `consumes`：Task C staged snapshot + unit evidence。
- `produces`：commit `fix(gui): make thread switch outcomes terminal`。
- `completionEvidence`：local commit id 与精确 file stat。
- `readSet`：Git index/staged diff。
- `writeSet`：local Git objects/refs/index。
- `executionContext`：current dev branch/index exclusive。
- `resourceLocks`：canonical Git index/ref write。
- `owner`：Task C Git owner。
- `verification`：`git show --stat --oneline HEAD`、status；不要求中间全项目 type-check。
- `failureDomain`：C6 与 Task U 后继暂停。
- `replanTriggers`：commit hook 产生修改、提交失败、consumer contract 与计划不一致。
- `authorizationGate`：A0；只允许本地 commit。

### U1 — history terminal outcome UI 编辑

- `nodeId`：U1
- `taskBoundary`：U。
- `operationKind`：编辑。
- `outcome`：页面只消费 ready/unavailable；按 failure 分类呈现 Alert/恢复，ready 可发准确 Toast 并按 threadId replace；activeOwner props 链从 history continue 移除。
- `estimatedCost`：中。
- `deferralEvidence`：无。
- `hardPredecessors`：C6；必须消费稳定 Task C contract。
- `consumes`：C commit、已确认 UI 设计、HeroUI/Lingui local docs。
- `produces`：ThreadHistoryDetailPage production diff 与稳定英文 msgids。
- `completionEvidence`：旧 outcome switch 与 owner-based navigation/return 不再存在；Toast 使用 `toast.warning` 和 Lingui `t`。
- `readSet`：new coordinator contract、AppCapabilities、AppShell Toast setup、page。
- `writeSet`：`ThreadHistoryDetailPage.tsx`。
- `executionContext`：current dev worktree/index 未写。
- `resourceLocks`：page file write。
- `owner`：Task U UI editor。
- `verification`：静态 exhaustive switch、accessible Alert/Buttons、no stale owner path；实际 Browser 由 U7。
- `failureDomain`：U1 及 U2–U10 暂停。
- `replanTriggers`：需要 App/AppShell/Redux/router 修改、HeroUI local docs 不支持设计 API。
- `authorizationGate`：A0 + C6；范围限 Task U。

### U2 — Browser/App consumer tests 编辑

- `nodeId`：U2
- `taskBoundary`：U。
- `operationKind`：编辑。
- `outcome`：三个 Browser files 完整迁移新 contract，覆盖 UI 文案、无导航、capability replacement、warning 跨导航与真实 App switch 行为。
- `estimatedCost`：高。
- `deferralEvidence`：无。
- `hardPredecessors`：U1；测试消费稳定页面行为。
- `consumes`：C commit、U1 diff、existing Browser harness/projection builders。
- `produces`：Task U Browser/App test diff。
- `completionEvidence`：旧 outcome fixtures 搜索归零；新增 ready/warning、before/after connectionLost、operation phase、currentThreadUnresolved 与 Toast assertions。
- `readSet`：U1 page、C contract/bridge、existing three Browser tests、Vitest local docs。
- `writeSet`：`ThreadHistoryDetailPage.browser.test.tsx`、`App.browser.test.tsx`、`AppRouting.browser.test.tsx`。
- `executionContext`：current dev worktree/index 未写。
- `resourceLocks`：three test files write；U1/C files read。
- `owner`：Task U test editor。
- `verification`：locators 使用 role/name，异步 DOM 使用 `expect.element`/`expect.poll`；Toast queue 在测试间 `toast.clear()`。
- `failureDomain`：U2、U6–U10 暂停；catalog path可按 U1 独立继续。
- `replanTriggers`：需要新 test-only production seam、fixture contract mirror、e2e 或 sequential suite。
- `authorizationGate`：A0；范围限 Task U。

### U3 — Lingui catalog extraction

- `nodeId`：U3
- `taskBoundary`：U。
- `operationKind`：生成。
- `outcome`：从 U1 源码机械提取新增/变化 msgid 到 en/zh-CN catalogs。
- `estimatedCost`：低。
- `deferralEvidence`：无。
- `hardPredecessors`：U1；英文消息源码必须稳定。
- `consumes`：U1 Lingui macros、lingui config。
- `produces`：generated catalog structure diff。
- `completionEvidence`：`messages:extract` 退出 0；catalog diff 只含本任务 source refs/msgids/obsolete transitions。
- `readSet`：`codex-gui/src`、lingui config、package script。
- `writeSet`：`src/locales/en.po`、`src/locales/zh-CN.po`。
- `executionContext`：`codex-gui`，catalog exclusive。
- `resourceLocks`：canonical `codex-gui/src` read；canonical `codex-gui/src/locales` write。
- `owner`：Task U catalog/Git owner。
- `verification`：运行 `/opt/homebrew/bin/fnm exec --using-file pnpm run messages:extract`；不运行 clean/compile。
- `failureDomain`：U3–U10 catalog 后继暂停；U2 若无资源冲突可继续。
- `replanTriggers`：生成范围外大量 diff、msgid 与已确认文案不一致、脚本漂移。
- `authorizationGate`：A0；项目固化生成入口。

### U4 — 简体中文补译

- `nodeId`：U4
- `taskBoundary`：U。
- `operationKind`：编辑。
- `outcome`：只补本任务新 msgid 的 `zh-CN` 翻译，不手写 catalog 结构。
- `estimatedCost`：低。
- `deferralEvidence`：无。
- `hardPredecessors`：U3；必须消费 generated entries。
- `consumes`：U3 catalog diff、已确认中文产品语义。
- `produces`：完整目标中文翻译。
- `completionEvidence`：目标 entries 非 fuzzy、非空；en catalog 只保留 generator 输出。
- `readSet`：en.po、zh-CN.po、design。
- `writeSet`：zh-CN.po 目标 msgstr。
- `executionContext`：current worktree，locales write exclusive。
- `resourceLocks`：zh-CN.po write。
- `owner`：Task U catalog owner。
- `verification`：逐项对照 before/after commit、operation phase 和两类 warning，不翻译机器标识。
- `failureDomain`：U4–U10 catalog 后继暂停。
- `replanTriggers`：需要变更 source English、删除其他 messages 或修改 Lingui config。
- `authorizationGate`：A0。

### U5 — catalog 稳定性生成

- `nodeId`：U5
- `taskBoundary`：U。
- `operationKind`：生成。
- `outcome`：再次 extraction 后 catalog 结构稳定且保留目标翻译。
- `estimatedCost`：低。
- `deferralEvidence`：无。
- `hardPredecessors`：U4。
- `consumes`：translated catalogs、U1 source messages。
- `produces`：catalog stability evidence。
- `completionEvidence`：第二次 `messages:extract` 退出 0；除稳定 generator metadata 外不产生新 diff；目标 zh translation 保留。
- `readSet`：source、config、catalogs。
- `writeSet`：en.po、zh-CN.po。
- `executionContext`：`codex-gui`，catalog exclusive。
- `resourceLocks`：canonical `codex-gui/src` read；canonical `codex-gui/src/locales` write。
- `owner`：Task U catalog owner。
- `verification`：审查前后 catalog diff；不运行 clean/compile。
- `failureDomain`：U5–U10 暂停。
- `replanTriggers`：extract 持续漂移、翻译被覆盖、范围外 catalog 改动。
- `authorizationGate`：A0。

### U6 — Task U formatter

- `nodeId`：U6
- `taskBoundary`：U。
- `operationKind`：格式化。
- `outcome`：Task U 源码/测试格式稳定，formatter 未产生 Task U 写集合外 tracked diff。
- `estimatedCost`：低。
- `deferralEvidence`：无。
- `hardPredecessors`：U2、U5；全部 Task U edits/generation fan-in。
- `consumes`：Task U combined diff。
- `produces`：format-stable Task U diff。
- `completionEvidence`：fix 后 check 通过，status/diff 只含 Task U files。
- `readSet`：整个 `codex-gui` formatter input。
- `writeSet`：入口可触及整个 `codex-gui`；允许保留 tracked write 仅 Task U files。
- `executionContext`：current worktree，formatter exclusive。
- `resourceLocks`：canonical `codex-gui` formatting write lock。
- `owner`：Task U Git owner。
- `verification`：运行 fnm-backed `format:oxfmt:fix`、`format:oxfmt` 并审查 diff。
- `failureDomain`：U6–U10 暂停；范围外或纯重排触发重编图。
- `replanTriggers`：formatter write set 扩大、脚本漂移。
- `authorizationGate`：A0。

### U7 — 定向 Browser Mode verification

- `nodeId`：U7
- `taskBoundary`：U。
- `operationKind`：验证。
- `outcome`：三个直接 Browser consumer 在 Chromium、Firefox、WebKit 通过。
- `estimatedCost`：高。
- `deferralEvidence`：无；与 U8 的并发限制由 canonical cache/typebuild 资源锁表达，不伪造暂缓策略。
- `hardPredecessors`：U6；读取格式稳定组合状态。
- `consumes`：C commit + Task U combined diff。
- `produces`：Browser verification evidence。
- `completionEvidence`：定向 parallel config 命令退出 0，三浏览器无失败。
- `readSet`：Task U/C source/tests、browser config、node_modules/browser binaries。
- `writeSet`：ignored `tsconfig.vitest.browser.tsbuildinfo`、Vitest/Vite caches、失败 attachments。
- `executionContext`：`codex-gui` test runner。
- `resourceLocks`：canonical browser Vitest runner/cache/typebuild write lock。
- `owner`：Task U Browser verifier。
- `verification`：`/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:parallel -- src/features/threadHistory/__tests__/ThreadHistoryDetailPage.browser.test.tsx src/__tests__/App.browser.test.tsx src/__tests__/AppRouting.browser.test.tsx`。
- `failureDomain`：U7、U9、U10；计划内问题插入 Task U fix node，U8 不依赖时继续。
- `replanTriggers`：失败需要 e2e/test hook/写集合外修复，或 browser binary 缺失。
- `authorizationGate`：A0；禁止安装 browser。

### U8 — codex-gui CI verification

- `nodeId`：U8
- `taskBoundary`：U。
- `operationKind`：验证。
- `outcome`：validator drift check、format check、lint、type-check 与全量 unit 全部通过。
- `estimatedCost`：高。
- `deferralEvidence`：无；与 U7 的并发限制由 canonical cache/typebuild 资源锁表达，不伪造暂缓策略。
- `hardPredecessors`：U6；不把 U7 伪造成产物依赖。
- `consumes`：C commit + Task U combined diff。
- `produces`：CI verification evidence。
- `completionEvidence`：`pnpm run ci` 退出 0。
- `readSet`：整个 `codex-gui` source/config/tests、generated validators。
- `writeSet`：ignored `.eslintcache`、tsbuildinfo 与 test caches；tracked source 必须不变。
- `executionContext`：`codex-gui` CI runner。
- `resourceLocks`：canonical frontend lint/typecheck/unit caches write lock；与 U7 browser typebuild/cache lock按实际共享底层资源互斥。
- `owner`：Task U CI verifier。
- `verification`：`/opt/homebrew/bin/fnm exec --using-file pnpm run ci`；运行后确认 tracked diff 未变化。
- `failureDomain`：U8、U9、U10；U7 已运行时结果保留但受修正文件影响的验证失效。
- `replanTriggers`：失败需要计划外修复、检查规则本身被证明错误、tracked generated drift。
- `authorizationGate`：A0；不运行 build/e2e/full browser。

### U9 — Task U scoped stage

- `nodeId`：U9
- `taskBoundary`：U。
- `operationKind`：stage。
- `outcome`：index 恰好含 Task U 六个精确文件，包含 generator 的真实 catalog diff，无范围外或纯重排。
- `estimatedCost`：低。
- `deferralEvidence`：无。
- `hardPredecessors`：U7、U8；两类组合验证均完成。
- `consumes`：Task U diff、Browser/CI evidence。
- `produces`：Task U staged snapshot。
- `completionEvidence`：cached name-only/check/full diff 满足范围与设计。
- `readSet`：Task U files、Git index。
- `writeSet`：shared Git index，仅 Task U paths。
- `executionContext`：current dev index exclusive。
- `resourceLocks`：canonical Git index write。
- `owner`：Task U Git owner。
- `verification`：scoped `git add --`、cached check/name/full diff；核对 catalogs 无范围外删除。
- `failureDomain`：U9、U10 暂停。
- `replanTriggers`：staged scope 漂移、catalog/formatter unexpected diff、用户变更混入。
- `authorizationGate`：A0 精确授权 Task U local commit。

### U10 — Task U commit

- `nodeId`：U10
- `taskBoundary`：U。
- `operationKind`：commit。
- `outcome`：创建独立 history/UI/Toast/i18n 行为提交。
- `estimatedCost`：低。
- `deferralEvidence`：无。
- `hardPredecessors`：U9。
- `consumes`：Task U staged snapshot + Browser/CI evidence。
- `produces`：commit `fix(gui): handle thread switch terminal outcomes`。
- `completionEvidence`：local commit id、精确 file stat、clean task scope。
- `readSet`：Git index/staged diff。
- `writeSet`：local Git objects/refs/index。
- `executionContext`：current dev branch/index exclusive。
- `resourceLocks`：canonical Git index/ref write。
- `owner`：Task U Git owner。
- `verification`：`git show --stat --oneline HEAD`、status；commit 不修改验证过的 tree content。
- `failureDomain`：U10、V1、F1 暂停。
- `replanTriggers`：commit hook 修改 tracked files、commit failure、baseline changed after verification。
- `authorizationGate`：A0；只允许本地 commit。

### V1 — 可见 GUI 验收

- `nodeId`：V1
- `taskBoundary`：无提交；最终可见验证。
- `operationKind`：验证。
- `outcome`：在 headed Google Chrome for Testing 中核对 history detail 的桌面/窄屏正常布局与导航；自动 failure/warning 语义以已通过的 Browser Mode 为权威，不增加 production test hook。
- `estimatedCost`：中。
- `deferralEvidence`：无。
- `hardPredecessors`：U10；读取稳定 committed tree。
- `consumes`：最终两个 code commits、当前 `launch_gui` URL、existing Vite/GUI runtime。
- `produces`：headed responsive verification record。
- `completionEvidence`：debug-responsive workflow 确认 headed CFT、codex-gui page、responsive metrics；人工/locator 核对 history transcript、bottom action、无横向溢出。若能自然触发目标 Toast，则额外核对可见/可关闭；不能为制造异常添加 test hook。
- `readSet`：committed GUI source、current runtime page。
- `writeSet`：`/tmp/codex-debug-responsive-gui/current.json`、浏览器临时 profile/state；无 workspace tracked write。
- `executionContext`：outer `launch_gui` + visible CFT/playwright-cli。
- `resourceLocks`：headed CFT window/playwright-cli session write；可选 Vite foreground session。
- `owner`：visible GUI verifier。
- `verification`：先调用 outer `launch_gui` 获取当前完整 URL，按 VPN→LAN→Local 选择；从仓库根运行 `/opt/homebrew/bin/fnm exec --using-file node .codex/skills/debug-responsive-gui/scripts/debug-responsive-gui.mjs --gui-url '<current full URL>'`。若 502 且无 Vite listener，按 skill 使用 fnm-backed `pnpm run dev` foreground session；不安装任何组件。
- `failureDomain`：V1、F1；Browser/CI evidence 不因纯 runtime unavailable 失效，但最终 UI 验收未完成。
- `replanTriggers`：缺失现有 CFT/playwright-cli、需要安装、current URL 不可用、可见缺陷需要写集合外修复。
- `authorizationGate`：A0；允许前端 dev server与可见浏览器，不允许安装或系统 Chrome。

### F1 — 最终 fan-in 审计

- `nodeId`：F1
- `taskBoundary`：无提交；最终审查。
- `operationKind`：fan-in。
- `outcome`：全部 required nodes、commits、验证与写集合满足，工作树没有本任务未提交 tracked diff。
- `estimatedCost`：低。
- `deferralEvidence`：无。
- `hardPredecessors`：C6、U10、V1；两个行为提交与可见验证全部稳定。
- `consumes`：docs/C/U commit ids、C4/U7/U8/V1 evidence、Git status。
- `produces`：最终交付摘要与任何预存/无关问题清单。
- `completionEvidence`：`git status --short --branch`、`git log -3 --oneline`、两次 `git show --stat`、最终 design completion checklist 全部核对。
- `readSet`：Git metadata、commits、design/plan、verification logs。
- `writeSet`：无。
- `executionContext`：current dev worktree read-only。
- `resourceLocks`：Git refs/worktree read。
- `owner`：主协调者。
- `verification`：不重复运行相同 stable input 上的 CI/Browser；只有提交 hook、修正或基线变化使证据失效时才重跑受影响节点。
- `failureDomain`：只暂停最终完成声明；不回滚已完成独立提交。
- `replanTriggers`：缺失节点、commit scope 不符、验证证据失效、workspace 出现本任务未提交变化。
- `authorizationGate`：A0；最终报告不触发远程 Git。

## 初始 ready set、关键路径与调度

计划落盘但未确认时：

```text
ready = {A0}
```

用户确认后首次调度：

```text
A0 complete
ready = {P0}
```

粗粒度关键路径：

```text
A0 -> P0 -> D1 -> D2 -> D3
   -> C1 -> C2 -> C3 -> C4 -> C5 -> C6
   -> U1 -> fan-out {U2, U3 -> U4 -> U5}
   -> U6 -> ready {U7, U8} (shared runner/cache lock serializes execution)
   -> U9 -> U10 -> V1 -> F1
```

Fan-out/fan-in：

- U1 完成后，U2 与 U3 同时 ready，但 `messages:extract` 会读取整个 `codex-gui/src`，与 U2 正在写的 Browser test 文件形成 canonical read/write 冲突。优先启动关键路径上的 U2；U3 保持 ready 等待该源码锁释放，不添加伪 hard edge。U2 完成后同一调度循环立即启动 U3。
- U3→U4→U5 因同一 catalog 生成/翻译产物构成真实串行链。
- U2 与 U5 在 U6 formatter fan-in。
- U6 后 U7 与 U8 同时 ready，但共享 frontend typebuild/browser/Vitest caches；一个运行时另一个保持 ready 等待 canonical lock，不添加伪 hard edge。锁释放后同一调度循环立即启动等待节点。
- U7/U8 在 U9 stage fan-in。

未使用多个 worktree 的原因不是“同一仓库”，而是 Task U 对 Task C 稳定 contract 的真实依赖；同一 taskBoundary 内只有明确不相交的 U2 与 catalog chain 并发写。

## Task C 详细行为与测试

### Coordinator contract

- 用单一 total `ContinueThreadOutcome` 替换旧四分支；所有 caller-visible exit 都返回 outcome。
- already-current 返回 `ready { threadId, warning: null }`，不返回 owner。
- busy、queue blockers 分别返回 `switchInProgress` 与 `currentThreadUnresolved`；后者由 coordinator 捕获当时权威 `activeThreadId`。
- reserveRelease 或 admission cleanup 抛错返回 `operationFailed.admission`。
- resume/attach 错误在 coordinator 仍 active 时分别返回 `operationFailed.resume|attach`；若 catch 时 generation 已终止，优先返回 `connectionLost`。
- commit fact、owner publication fact 与 `disposed` 独立记录；terminal classifier 不从 exception message 推断。
- `publishActiveOwner` 内部 seam 返回可判定 receipt：owner publication 是必需事实，authorization persistence failure 是 post-commit degradation。Bridge 继续先发布 owner，再捕获并报告 persistence error；不把它升级为 owner unavailable。
- replay/application exception 只有在 final gate 仍证明 owner 可用时转成 `postCommitDegraded`；否则 `operationFailed.activate` 或 `connectionLost`。
- previous owner local dispose 与 remote detach 都执行；error 累积为 cleanup warning/diagnostic。
- 在 previous detach await 之后执行 final gate，核验 generation、disposed、active owner identity 与 committed/published facts。
- 任何 connectionLost、operationFailed 都不携带 owner。

### Coordinator unit coverage

- ordinary switch 与 already-current → `ready` only threadId。
- busy 与 queue blocker → 对应 unavailable；queue blocker 携带权威 activeThreadId。
- reserveRelease throw → `operationFailed.admission`，不 reject Promise。
- dispose during resume/attach/candidate cleanup → `connectionLost.beforeCommit`。
- dispatch/publish synchronous reentry dispose → 非 ready；若 commit fact 已成立则 `afterCommit`。
- previous detach pending 时 connection dispose → `connectionLost.afterCommit`。
- previous local dispose throw 仍尝试 remote detach；remote detach throw 仍保留已完成 local cleanup。
- owner 可用 + previous cleanup failure → `ready + previousOwnerCleanupFailed`。
- owner 可用 + authorization/replay degradation → `ready + postCommitDegraded`，operation 精确。
- commit 未生效/owner publication 不成立 → `operationFailed.activate`。
- primary failure 与 cleanup diagnostic 保持主次，不用 AggregateError 抹掉分类。
- disposed coordinator 的后续调用稳定返回 connection lost/unavailable，不恢复。

## Task U 详细 UI 与测试

### ThreadHistoryDetailPage

- `ContinueTaskState` 按 failure taxonomy 分为 temporary blocker 与 unavailable failure，不再复用旧 `blocked|failed` 形状。
- `ready` 先按 warning discriminant 产生对应 Lingui `toast.warning`，再 replace 到结果 `threadId`。
- normal ready 没有 Toast。
- `connectionLost.beforeCommit` 留在 history，显示“连接在任务切换完成前中断。重新连接后请重试。”
- `connectionLost.afterCommit` 留在 history，显示“任务切换已提交，但连接已中断。重新连接后请确认当前任务。”
- connection lost 不显示“返回当前任务”，也不调用旧 callback。
- currentThreadUnresolved 的返回操作只使用 failure 自带 `activeThreadId`；移除 activeOwner 从页面根到 action 的 props 链。
- operationFailed 显示翻译后的 admission/resume/attach/activate 摘要，主 error 与 cleanup diagnostic 有标签和主次。
- capability store 把旧 continueThread 清空时按钮 disabled；新 generation 发布后只调用新 callback。

### Toast 文案

- previous cleanup warning：标题 `Task opened`；说明 `The previous task connection could not be fully cleaned up. Later state may be affected.`
- post-commit degradation：标题 `Task opened`；说明 `The task opened, but some state synchronization did not finish.`
- 使用 `toast.warning(t`...`, { description: t`...` })`；测试 afterEach 清理 default toast queue。

### Browser/App coverage

- `ThreadHistoryDetailPage.browser.test.tsx`：完整 failure/UI matrix、transcript 保留、route、按钮、ready + warning Toast、无 warning、new capability replacement。
- `App.browser.test.tsx`：迁移 switch probe 对旧 union 的直接断言；保留 active owner、queue、projection replay、commands unavailable/unmount 原子性；pending switch teardown 断言 before/after commit fact。
- `AppRouting.browser.test.tsx`：真实 router + AppShell provider 下验证 ready replace、resume failure 留页，以及 previous cleanup failure 后 current task 可用且 warning Toast 跨详情卸载可见。
- 使用 role/name locators 与 `expect.element`/`expect.poll`；不锁定颜色、padding、gap、className 等低价值样式数值。

## Catalog、格式与验证命令

所有 pnpm 命令从 `/Users/jiangsheng/cnb/codex/codex-gui` 运行，并使用 fnm：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run messages:extract
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt:fix
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit -- src/features/projectionCoordination/__tests__/threadSwitchCoordinator.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:parallel -- src/features/threadHistory/__tests__/ThreadHistoryDetailPage.browser.test.tsx src/__tests__/App.browser.test.tsx src/__tests__/AppRouting.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run ci
```

不运行：

- `messages:extract:clean`：会扩大 obsolete message 删除范围。
- 不存在的 `messages:compile`。
- full `test:browser` 或 sequential Browser：目标文件都在 parallel config，定向命令已在 Chromium/Firefox/WebKit 执行。
- Playwright E2E：没有跨进程协议或启动链变化。
- `build`：没有 build-only 风险，CI 的 validator/format/lint/type-check/unit 与定向 Browser 足够。
- protocol generator：outcome 是 GUI 内部 TypeScript contract。

## 失败域与计划内修正

- DOCS 失败只阻止所有代码后继；不得绕过 docs commit 门禁。
- Task C 失败只阻止 Task C 后继和依赖其 contract 的 Task U。
- Task U Browser 与 CI 失败只阻止 Task U stage/commit；互不依赖的验证可以保留，但修改其读取文件后相应 evidence 失效。
- visible GUI runtime 不可用不会抹掉 CI/Browser 结果，但最终验收保持未完成。
- 计划内修正插入失败节点与后继之间，声明精确写集合与失效验证；对已提交 C/U 的修正创建新 commit，禁止 amend。
- 任何需要修改计划外文件、接口语义、自动重连、安全/数据边界、worktree 或 branch 参数的修正都停止并返回计划确认。

## 反向审计结果

独立影响面反向审计已确认：

- 权威 outcome 只有 coordinator 一处，AppCapabilities 是机械派生。
- 生产 consumer 只有 history detail；App tests 是直接 test consumer，必须迁移。
- connection invalidation 的真实 async 可达窗口是 previous detach await，不应只修同步 mock 路径。
- admission/cleanup throw、publication/persistence 混合与 warning taxonomy 是原设计示意中的三个缺口，已在计划与 design 技术校准中补齐。
- Toast provider、Lingui generator、Vitest parallel config 与 fnm 固化入口当前存在。
- 无证据要求修改 activeThreadOwner、App、AppShell、Redux、protocol 或 server。

独立漏并行审计已移除：

- 把相同稳定输入上的 post-commit CI/Browser 机械复跑作为“最终验证”的重复节点；
- 把 U7 Browser 与 U8 CI 误写成 hard dependency；两者只是共享 runner/cache lock。
- 因任务编号或同仓库制造的伪串行。

审计保留的真实串行边是：docs commit 门禁、Task U 对 Task C contract 的消费、catalog extraction/translation/stability、formatter fan-in 与 stage/commit。

## 完成标准

计划执行完成必须同时满足：

- DOCS、C、U 三个独立本地提交存在且范围精确；
- `ready` 可靠代表结果交付时可用的目标 owner，且不暴露 owner 给页面；
- before/after commit connection loss 都不导航并显示不同事实；
- admission/resume/attach/activate/cleanup 不再绕过 total outcome；
- previous cleanup 与 post-commit degradation 成功 warning 分类和文案准确；
- stale capability 不被重试，新 generation capability 可替换；
- coordinator unit、三个 Browser files、codex-gui CI 和可见 GUI 验收完成；
- catalogs 只包含本任务真实 extraction 与中文补译；
- 无 compatibility、fallback、runtime owner probe、范围外 formatter diff、远程 Git 或安装动作；
- 本次未引入的问题之外的预存失败只汇报，不擅自修复。
