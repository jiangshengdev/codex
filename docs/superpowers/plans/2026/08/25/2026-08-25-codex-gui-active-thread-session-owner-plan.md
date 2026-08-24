# Codex GUI ActiveThreadSession 唯一 Owner 实施计划

计划日期：2026-08-25

计划状态：已确认

确认日期：2026-08-25

确认原文：`确认计划。开始进行`

对应已确认设计：

- `docs/superpowers/specs/2026/08/25/2026-08-25-codex-gui-active-thread-session-owner-design.md`

关联 issues：

- `docs/superpowers/issues/2026/08/24/2026-08-24-01-codex-gui-current-code-problems/2026-08-24-04-active-thread-state-multiple-owners.md`
- `docs/superpowers/issues/2026/08/24/2026-08-24-01-codex-gui-current-code-problems/2026-08-24-05-duplicate-attach-transactions.md`

计划分支：`dev`

计划时 HEAD：`c169080a6b025ff8aa3107cc965f2fea33396ffd`

## 目标

按已确认设计把 `ActiveThreadSession` 落为 `codex-gui` 唯一 live-thread authority：candidate 在私有
projection/read model 中完成 publication 前归并；thread identity、subscription phase、active turn、queue 与
skills capability 使用同一 session revision；首次 attach 与 thread switch 共用 activation transaction；Redux
降为 revisioned derived read model；React、Composer、History 和 TopBar 只消费 stable session Interface，不再
持有或核对 raw owner/controller。

计划执行完成后，issue 04 和 issue 05 依据实际代码与验证证据更新为已修复。issue 06 的 Composer React
domain state machine 不在本次解决范围，不能顺带关闭。

## 当前基线与实施必要性

计划编写时：

- 当前分支为 `dev`，HEAD 为 `c169080a6b025ff8aa3107cc965f2fea33396ffd`；
- 工作树只有本次 design 目录为 untracked，计划落盘后还会增加本文件；
- `threadIdentity` 仍注册在 root store；
- `RouteConnectionStartupCoordinator` 与 `ThreadSwitchCoordinator` 仍分别实现 candidate attach transaction；
- candidate notification 仍在 Redux commit/React publication 后 replay；
- switch 仍在远端 `resume`/`attach` 前取得 queue release reservation；
- `ComposerTurnControl` 仍跨 Redux identity/runtime 与 raw queue owner 推导 operability；
- Bridge、App、CurrentTask、TopBar、History 和 tests 仍保存或构造 raw active owner/continue capability。

当前代码证明必须修改，而不是只靠目标设计推导合理性：

1. `ProjectionApplicationCoordinator` 会立即 dispatch accepted event/delta/reconnect；把 replay 机械前移会在旧
   session 仍 active 时污染 Redux，必须先建立 candidate-local staging。
2. `liveThreadReplacementCommitted`、runtime event/delta/reconnect action 没有 session revision；旧 RAF effect
   可能在新 session 提交后写入 store，必须给 read-model facts 加 revision 并由 reducer 拒绝 stale effect。
3. queue/skill 自己 publish snapshot；session 若只订阅后立即转发，会在一次 accepted event 中暴露 active turn、
   queue 和 Redux 不同 revision，必须在 session transaction 内吸收并只发布一次。
4. pending-input edit 返回的 `save/cancel` capability 可在获取后继续调用；只 gate Composer 按钮不够，完整
   queue capability chain 都必须由 session role 包装。
5. 当前 startup/switch transaction 已经重复且语义分化；建立一个 activation owner 会同时消除 issue 04 与
   issue 05 的根因。

## 技术校准结论

### Candidate projection 必须私有暂存

新 `activeThreadProjection` Module 复用 `ProjectionIngressAdapter` 的 thread/subscription、commit-chain、known-turn
和 manual-reconnect 算法，但不直接 dispatch real Redux，也不依赖 RAF 才能形成 candidate baseline。它在
candidate 内按序吸收 snapshot、event、delta、closed，产生 staged read-model facts 与 accepted queue facts。

### Revision 贯穿所有派生事实

baseline replacement、accepted event、accepted delta 与 projection unavailable action 都携带
`sessionRevision`。threadRuntime/transcript reducer 只接受当前 revision；旧 session、旧 subscription 和旧 RAF
effect 不能推进新的 read model。

### Session role 是 capability seam，不是 controller wrapper

Composer role 覆盖 submit、guide、promote、interrupt、recover、read page/detail、begin edit、edit reservation
的 save/cancel、delete 和 move。Skills role 覆盖 read view 与 active phase 下的 retry/refresh。所有 mutating
method 都执行 expected revision、phase、generation 和 disposed gate；React 不再取得 raw queue/catalog。

### Context 只发布 stable session Interface

React Context 不放高频 snapshot。App、route、TopBar、History 与 Composer 通过 `useSyncExternalStore` 的稳定
snapshot/primitive selector hook 订阅所需片段；`getSnapshot()` 必须返回缓存对象。session lifecycle 只属于
Bridge，消费者订阅/unsubscribe，不调用 dispose。

### 无兼容双路径

中间提交允许 consumer 尚未迁移或全包 type-check 暂时失败。不得为中间提交新增 old/new alias、fallback、
adapter、双写、双读或 raw controller escape hatch。Consumer cutover 直接迁移所有生产 caller，并用 `git rm`
删除旧 coordinator/owner 路径。

## 精确实施范围

### 工作文档

- `docs/superpowers/specs/2026/08/25/2026-08-25-codex-gui-active-thread-session-owner-design.md`
- `docs/superpowers/plans/2026/08/25/2026-08-25-codex-gui-active-thread-session-owner-plan.md`

### Task P：candidate-local projection staging

新增：

- `codex-gui/src/features/activeThreadSession/activeThreadProjection.ts`
- `codex-gui/src/features/activeThreadSession/__tests__/activeThreadProjection.test.ts`

只读复用：

- `codex-gui/src/features/projectionIngress/projectionIngressAdapter.ts`
- `codex-gui/src/features/projection/__tests__/projectionFixtures.ts`
- `codex-gui/src/features/projection/__tests__/projectionTestBuilders.ts`

### Task R：revisioned Redux derived read model

修改：

- `codex-gui/src/app/store.ts`
- `codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts`
- `codex-gui/src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts`
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts`
- `codex-gui/src/features/transcriptState/transcriptProjection.ts`
- `codex-gui/src/features/transcriptState/transcriptStateModel.ts`
- `codex-gui/src/features/transcriptState/__tests__/transcriptContextPages.test.ts`
- `codex-gui/src/features/transcriptState/__tests__/transcriptItemPolicy.test.ts`
- `codex-gui/src/features/transcriptState/__tests__/transcriptStateCommittedProjection.test.ts`
- `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveItemLifecycle.test.ts`
- `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveStreaming.test.ts`
- `codex-gui/src/features/transcriptState/__tests__/transcriptStateReconnect.test.ts`
- `codex-gui/src/features/transcriptState/__tests__/transcriptStateReplayDedup.test.ts`
- `codex-gui/src/features/transcriptState/__tests__/transcriptStateScrollSignals.test.ts`
- `codex-gui/src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts`
- `codex-gui/src/features/transcriptState/__tests__/transcriptStateSnapshot.test.ts`

移动并扩展：

- 使用 `git mv` 将
  `codex-gui/src/features/projectionCoordination/buildLiveThreadReplacementRecord.ts` 移为
  `codex-gui/src/features/activeThreadSession/activeThreadSessionReadModel.ts`，由它构造带 session revision 的
  candidate/read-model replacement；不保留旧路径或 wrapper。

删除：

- `codex-gui/src/features/threadIdentity/threadIdentitySlice.ts`
- `codex-gui/src/features/threadIdentity/__tests__/threadIdentitySlice.test.ts`
- `codex-gui/src/features/projectionCoordination/liveThreadReplacement.ts`
- `codex-gui/src/features/projectionCoordination/__tests__/liveThreadReplacement.test.ts`，其仍有价值的 baseline 断言迁入
  Task P/R tests。

### Task L：live session 与从属 queue/skills role

新增：

- `codex-gui/src/features/activeThreadSession/activeThreadSessionContracts.ts`
- `codex-gui/src/features/activeThreadSession/liveActiveThreadSession.ts`
- `codex-gui/src/features/activeThreadSession/__tests__/liveActiveThreadSession.test.ts`

默认只读复用：

- `codex-gui/src/features/composerInputQueue/composerInputQueueCoordinator.ts`
- `codex-gui/src/features/composerInputQueue/composerInputQueueContracts.ts`
- `codex-gui/src/features/skillCatalog/skillCatalogOwner.ts`

只有 unit evidence 证明 child publication 无法由 parent transaction 吸收，或 unavailable phase 无法阻止 catalog
RPC 时，才触发重编图并扩大到对应 coordinator/owner 及测试；计划不预先修改 queue FIFO、delivery、recovery
或 skill catalog 算法。

### Task A：统一 activation transaction

新增：

- `codex-gui/src/features/activeThreadSession/activeThreadSession.ts`
- `codex-gui/src/features/activeThreadSession/__tests__/activeThreadSession.test.ts`

只读复用：

- `codex-gui/src/features/browserLaunch/browserAuthorizationSession.ts`
- `codex-gui/src/features/guiHost/guiHostClient.ts`
- 旧 startup/switch/owner implementation 与 tests，仅作为语义证据，Task C 再删除。

### Task C：React consumer cutover 与旧路径删除

修改 production：

- `codex-gui/src/features/appShell/AppCapabilities.ts`
- `codex-gui/src/features/appShell/AppCapabilitiesContext.tsx`
- `codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx`
- `codex-gui/src/features/appShell/AppShellTopBar.tsx`
- `codex-gui/src/App.tsx`
- `codex-gui/src/features/currentTask/CurrentTaskPage.tsx`
- `codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx`
- `codex-gui/src/features/composerTurnControl/composerTurnControlModel.ts`
- `codex-gui/src/features/composerTurnControl/ComposerPendingInputRegion.tsx`
- `codex-gui/src/features/composerTurnControl/ComposerPendingInputDrawer.tsx`
- `codex-gui/src/features/composerTurnControl/composerPendingInputPages.ts`
- `codex-gui/src/features/threadHistory/ThreadHistoryListPage.tsx`
- `codex-gui/src/features/threadHistory/ThreadHistoryDetailPage.tsx`

修改 tests/harness：

- `codex-gui/src/__tests__/App.browser.test.tsx`
- `codex-gui/src/__tests__/sequential/composer-viewport.browser.test.tsx`
- `codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx`
- `codex-gui/src/features/composerTurnControl/__tests__/composerTurnControlModel.test.ts`
- `codex-gui/src/features/appShell/__tests__/AppShellTopBar.browser.test.tsx`
- `codex-gui/src/features/threadHistory/__tests__/ThreadHistoryListPage.browser.test.tsx`
- `codex-gui/src/features/threadHistory/__tests__/ThreadHistoryDetailPage.browser.test.tsx`

删除：

- `codex-gui/src/features/projectionCoordination/activeThreadOwner.ts`
- `codex-gui/src/features/projectionCoordination/__tests__/activeThreadOwner.test.ts`
- `codex-gui/src/features/projectionCoordination/threadSwitchCoordinator.ts`
- `codex-gui/src/features/projectionCoordination/__tests__/threadSwitchCoordinator.test.ts`
- `codex-gui/src/features/appShell/routeConnectionStartupCoordinator.ts`
- `codex-gui/src/features/appShell/__tests__/routeConnectionStartupCoordinator.test.ts`
- `codex-gui/src/features/projectionCoordination/projectionApplicationCoordinator.ts`
- `codex-gui/src/features/projectionCoordination/__tests__/projectionApplicationCoordinator.test.ts`

所有删除必须用 `git rm`。仍有价值的 startup/switch/owner/projection lifecycle assertions 必须先迁入 Task P/L/A
或 App Browser tests，不能为保留旧测试而保留旧 public path。

### 验证后 issue 更新

- 更新 issue 04：状态改为 `✅ 已修复`，保留历史静态证据，新增修复记录、验证记录和 design/plan/commit 入口。
- 更新 issue 05：状态改为 `✅ 已修复`，说明 startup 与 switch 已归并到唯一 activation transaction，并记录验证。
- 不修改 issue 06。

## 明确排除

- Rust、app-server、RPC、wire schema、generated validators、protocol fixtures 和 allowlist。
- `ProjectionIngressAdapter` 的 commit-chain、known-turn、wrong-thread、stale-subscription 算法修改。
- queue FIFO、lane、delivery identity、delivery unknown、recovery 和 pending-input domain 语义修改。
- skill catalog cwd、query、retry domain 语义修改。
- transcript chunk、rendering、history detail owner、DocumentTitle 展示逻辑重构。
- 自动/手动 projection reconnect、backoff、Toast、按钮或恢复 UI。
- queue 跨连接、URL、刷新或重启持久化。
- HeroUI、CSS、Lingui 文案或 catalog 修改；若实际实现出现文案变化，必须暂停并重编图。
- dependency、runtime、浏览器安装或下载。
- backend/native build、Git 远程和任何 force 操作。
- repository `just fmt`；纯 frontend/docs 不在 live `scripts/format.py` 管理范围。
- protocol generator、schema generator、E2E；`pnpm run ci` 已包含 protocol validator drift check。

## 跨任务硬约束

1. Candidate notification 必须在 private staged model 中归并，禁止在 publication 前 dispatch real store。
2. baseline/event/delta/unavailable 全部携带 session revision；reducer 拒绝旧 revision。
3. queue/skills child publication 由 session transaction 吸收；React 只订阅 session snapshot/role view。
4. 一项 accepted projection fact 对外只产生一个 revision publication。
5. pending-input edit reservation 的 save/cancel 也必须受 session revision/phase gate。
6. 候选异步准备期间不得持有旧 queue release reservation；最终同步 handoff 才 reserve 并检查 current revision。
7. Candidate replay 完成后才能进入 linearization point；发布前失败保留旧 session。
8. 发布后 connection terminal 优先于 cleanup warning，返回 post-commit connection failure 并 dispose Module。
9. 普通 old owner cleanup/detach failure 只形成 warning，等待清理尝试后才 settle success。
10. startup outcome 保留 history-context-unavailable 与 attach/application failure 事实，但不得携带 raw owner。
11. Context 只放 stable session Interface；高频 snapshot 不进入 Context value。
12. `getSnapshot()` 返回缓存对象；未变化不得发布；primitive selector 避免 AppShell/transcript 随 queue revision重渲染。
13. Redux 只保留实际显示消费者需要的最小 read model；不得继续提供 operability selector。
14. 所有 production caller 一次性移除 raw owner/controller、旧 coordinator、Redux operability selector。
15. 不保留 compatibility alias、fallback、adapter、双读、双写或旧新路径并存。
16. 行为提交不得夹带 import、声明、字段、分支、函数或组件的纯顺序调整；formatter 结果单独提交。
17. 每个 Task 独立提交；已有提交的修正创建新提交，禁止 amend。
18. 中间提交不必让整个计划完成或全包 type-check 通过；不得为中间绿色制造临时兼容层。

## 实施前文档与 Git 门禁

用户必须明确确认本计划后才能实施。确认后：

1. 更新本文件为“计划状态：已确认”，记录确认日期与确认原文；
2. 只读 preflight 核验分支、HEAD、dirty scope、工具链、脚本、本地 docs、worktree/branch 冲突和当前 consumer；
3. 将 design 与 plan 作为一个 docs-only 本地提交；提交成功前禁止创建实施 worktree或编辑产品代码；
4. 从包含 docs commit 的 `dev` 创建并核验唯一实施 worktree；
5. 按 Task P → R → L → A 的稳定 Interface 关键路径依次形成提交；
6. Task C 内部按不相交写集合 fan-out，fan-in 后形成一个 consumer cutover 行为提交；
7. formatter/order-only diff 单独提交；
8. 组合验证全部通过后才更新并提交 issues；
9. 不执行 Git 远程。

计划提交拓扑：

```text
DOCS
  -> P: candidate projection staging
      -> R: revisioned Redux read model
          -> L: live session + gated roles
              -> A: activation transaction
                  -> C: React consumer cutover + legacy deletion
                      -> F: formatter/order-only commit（仅有 diff 时）
                          -> validation fan-out/fan-in
                              -> ISSUE-EVIDENCE docs commit
```

P → R → L → A 的串行边都消费前一个稳定 Interface，不是编号依赖。Task C 的 production 子节点只消费稳定
Task A commit，可以并行编辑不相交文件；tests 等对应 production 节点稳定后再迁移。

## Worktree 精确授权

本计划确认后授权创建一个 sparse GUI implementation worktree。创建动作必须发生在 DOCS commit 后，并以更新
后的 `dev` 为 base：

```bash
bash .codex/skills/codex-gui-worktree/scripts/create-codex-gui-worktree.sh \
  --name gui-active-thread-session \
  --branch codex/gui-active-thread-session \
  --base dev
```

精确参数：

- requested name：`gui-active-thread-session`
- branch：`codex/gui-active-thread-session`
- base：`dev`（必须已包含 DOCS commit）
- canonical worktree path：`/Users/jiangsheng/cnb/codex/.worktrees/gui-active-thread-session`
- sparse include：脚本固定 control plane，不增加 `--include`
- Git index：该 worktree/branch 的独立 index

脚本预计创建的 canonical links：

- `/Users/jiangsheng/cnb/codex/.worktrees/gui-active-thread-session/codex-gui/node_modules` →
  `/Users/jiangsheng/cnb/codex/codex-gui/node_modules`
- `/Users/jiangsheng/cnb/codex/.worktrees/gui-active-thread-session/codex-gui/.heroui-docs/react` →
  `/Users/jiangsheng/cnb/codex/codex-gui/.heroui-docs/react`
- `/Users/jiangsheng/cnb/codex/.worktrees/gui-active-thread-session/codex-gui/.redux-toolkit-docs/redux` →
  `/Users/jiangsheng/cnb/codex/codex-gui/.redux-toolkit-docs/redux`
- `/Users/jiangsheng/cnb/codex/.worktrees/gui-active-thread-session/codex-gui/.redux-toolkit-docs/toolkit` →
  `/Users/jiangsheng/cnb/codex/codex-gui/.redux-toolkit-docs/toolkit`
- `/Users/jiangsheng/cnb/codex/.worktrees/gui-active-thread-session/vitest` → `/Users/jiangsheng/cnb/vitest`

执行时仍必须在工具调用前打印完整命令、canonical target 和上述全部 link mapping。若 branch、worktree path、
文件、目录或 symlink 已存在，或 base 未包含 docs commit，停止并报告，不得覆盖或 force。

## Preflight

确认计划后，在当前 `dev` checkout 只读执行：

```bash
git status --short --branch
git rev-parse --abbrev-ref HEAD
git rev-parse HEAD
git diff --check -- docs/superpowers/specs/2026/08/25/2026-08-25-codex-gui-active-thread-session-owner-design.md docs/superpowers/plans/2026/08/25/2026-08-25-codex-gui-active-thread-session-owner-plan.md
git branch --list 'codex/gui-active-thread-session'
git worktree list --porcelain
test -x /opt/homebrew/bin/fnm
test -d codex-gui/node_modules
test -d codex-gui/.redux-toolkit-docs/redux
test -d codex-gui/.redux-toolkit-docs/toolkit
test -d ../vitest/docs
rg -n -e 'ActiveThreadOwnerHandle' -e 'ThreadSwitchCoordinator' -e 'RouteConnectionStartupCoordinator' -e 'selectCanAdvanceThreadIdentity' -e 'selectThreadRuntimeSubscriptionState' codex-gui/src
rg -n -e '"ci"' -e '"format:oxfmt:fix"' -e '"format:oxfmt"' -e '"lint"' -e '"type-check"' -e '"test:unit"' -e '"test:browser:parallel"' -e '"test:browser:sequential"' codex-gui/package.json
```

在 `codex-gui` 执行工具链只读预检：

```bash
/opt/homebrew/bin/fnm exec --using-file node --version
/opt/homebrew/bin/fnm exec --using-file pnpm --version
/opt/homebrew/bin/fnm exec --using-file which pnpm
```

要求：

- 当前分支必须为 `dev`；HEAD 漂移时重新核验 design evidence、consumer、scripts 和 plan write set。
- 除本次 design/plan 外的 dirty changes 必须逐文件避让；与 write set 重叠且无法安全避让时停止。
- `pnpm` 不得解析到 `/Users/jiangsheng/.cache/codex-runtimes/`。
- fnm、pnpm、node_modules、Redux docs、Vitest docs 或三浏览器 binary 缺失时停止，由用户自行安装；助手不得安装。
- worktree/branch/link 冲突时停止，不得覆盖。

## 可调度执行图

以下执行图是计划的权威执行结构。每次节点完成、失败、锁释放或图变化后，必须在同一调度循环重新计算
ready set；节点编号和文档顺序不构成依赖。

### 公共执行约束

- `authorizationGate`：除 A0 外所有实施节点均要求用户明确确认本计划；当前未满足。worktree、stage、commit、
  formatter、测试和 issue 更新只在计划确认后授权。
- `executionContext`：D0-D3 在当前 `dev` checkout；W0 后所有产品代码、格式和验证节点在
  `/Users/jiangsheng/cnb/codex/.worktrees/gui-active-thread-session`、branch
  `codex/gui-active-thread-session`、独立 Git index；I1-I3 也在该 implementation branch。
- `resourceLocks`：stage或commit独占所在worktree Git index；源码编辑按 canonical file write lock；formatter 独占
  整个 `codex-gui` tracked tree；unit/type/lint/Browser runner 使用该 worktree 的 Vite/TypeScript/ESLint/Playwright
  cache 与 process lock。不同 lock 只有 read/read 才可并发。
- `deferralEvidence`：除明确写出的 runner/cache 或 write-set conflict 外均为无；不得用 agent 数、任务编号或
  “同一方向”暂缓 ready 节点。
- `replanTriggers`：任何节点写集合扩大、public session contract 改变、generated/Rust/文案范围出现、现有合法
  fixture不足、branch/base 漂移或验证发现计划内缺口时，暂停其 failure domain、插入修正节点并重算图；不得
  用 compatibility fallback 绕过。
- 所有 stage 节点继承对应 checkout 的独立 Git index execution context，以 cached path list、
  `git diff --cached --check` 和 cached diff review 为 verification；所有 commit 节点继承同一 index/branch context，
  以 commit exit 0、`git show --stat --oneline HEAD` 与预期 path list 一致为 verification。两类节点的
  `authorizationGate` 均为A0，写集合越界均触发其failure domain并重编图；这些公共字段是每个对应节点声明的一部分。

### 授权、文档与 worktree 节点

#### A0 — 确认实际计划

- `taskBoundary`：无提交；`operationKind`：授权；`estimatedCost`：低。
- `outcome`：用户明确确认本文件及其中 docs commit、worktree、代码提交、格式、验证和 issue 更新范围。
- `hardPredecessors`：无；`consumes`：本计划；`produces`：稳定确认事实与确认原文。
- `completionEvidence`：用户明确回复“确认计划”或等价直接授权。
- `readSet/writeSet`：本计划/无；`executionContext/resourceLocks`：对话授权状态/无；`owner`：用户。
- `verification`：确认对象必须是本文件；`failureDomain`：未确认时全图等待；`authorizationGate`：当前未满足。
- `replanTriggers`：用户修改目标、范围、worktree、提交或验证边界。

#### D0 — 实施前只读 preflight

- `taskBoundary`：DOCS；`operationKind`：调查；`estimatedCost`：低；`deferralEvidence`：无。
- `outcome`：输出 branch/HEAD/dirty/tool/docs/script/consumer/worktree conflict 的可执行或停止结论。
- `hardPredecessors`：A0，依赖稳定授权；`consumes`：确认计划与当前 workspace；`produces`：preflight evidence。
- `completionEvidence`：上述 Preflight 全部通过且无范围冲突。
- `readSet`：Git state、design/plan、package/scripts、consumer paths；`writeSet`：无。
- `executionContext`：current `dev`；`resourceLocks`：repository metadata read；`owner`：协调者。
- `verification`：执行 Preflight 原样命令；`failureDomain`：D1 及全部实施后继；`authorizationGate`：A0 满足。
- `replanTriggers`：HEAD、dirty scope、tool、branch/worktree 或 script 与计划不符。

#### D1 — 固化确认状态

- `taskBoundary`：DOCS；`operationKind`：编辑；`estimatedCost`：低；`deferralEvidence`：无。
- `outcome`：plan 状态改为已确认，并记录确认日期/原文；design 保持已确认。
- `hardPredecessors`：D0；`consumes`：preflight 与确认原文；`produces`：最终 docs diff。
- `completionEvidence`：只修改 design/plan 两文件且 `git diff --check` 通过。
- `readSet/writeSet`：design+plan/design+plan；`executionContext`：current `dev`；`resourceLocks`：两文档 write。
- `owner`：DOCS editor；`verification`：`git diff --check -- <design> <plan>`。
- `failureDomain`：D2-D3及全部实施后继；`replanTriggers`：需要修改设计语义；`authorizationGate`：A0。

#### D2 — 暂存 DOCS

- `taskBoundary`：DOCS；`operationKind`：stage；`estimatedCost`：低；`deferralEvidence`：无。
- `outcome`：只将 design 与 plan 写入 dev index。
- `hardPredecessors`：D1；`consumes`：verified docs diff；`produces`：verified DOCS index。
- `completionEvidence`：staged paths 仅为两文档，`git diff --cached --check` 通过。
- `readSet/writeSet`：两文档/dev index；`executionContext`：current `dev`；`resourceLocks`：dev Git index write。
- `owner`：唯一 DOCS Git owner；`failureDomain`：D3及后继；`replanTriggers`：stage越界；`authorizationGate`：A0。

#### D3 — 提交 DOCS

- `taskBoundary`：DOCS；`operationKind`：commit；`estimatedCost`：低；`deferralEvidence`：无。
- `outcome`：design 与 plan 形成唯一 docs-only commit。
- `hardPredecessors`：D2；`consumes`：verified DOCS index；`produces`：DOCS commit SHA。
- `completionEvidence`：commit成功，`git show --stat --oneline HEAD`仅含两文档。
- `readSet/writeSet`：dev index/dev branch；`executionContext`：current `dev`；`resourceLocks`：dev Git index/branch write。
- `owner`：唯一 DOCS Git owner；`failureDomain`：W0及全部产品后继；`authorizationGate`：A0。

#### W0 — 创建并核验 implementation worktree

- `taskBoundary`：无提交；`operationKind`：集成；`estimatedCost`：低；`deferralEvidence`：无。
- `outcome`：精确 worktree/branch/index/control-plane/links 全部存在且 clean。
- `hardPredecessors`：D3，必须消费包含文档的 committed `dev`；`consumes`：DOCS commit；`produces`：stable
  implementation execution context。
- `completionEvidence`：脚本成功；sparse list、links、关键 AGENTS/skills/docs/schema 可读；`git status --short --branch`
  clean。
- `readSet`：dev tree、script、shared caches；`writeSet`：精确 worktree path、local branch、symlinks。
- `executionContext`：current repo creates target worktree；`resourceLocks`：Git worktree registry/local refs/worktree path write。
- `owner`：唯一 worktree owner；`verification`：按 `$codex-gui-worktree` 全部 post-check。
- `failureDomain`：全部产品节点；`replanTriggers`：路径/branch/link 冲突或 base 不含 D3；`authorizationGate`：A0
  对精确动作已满足，但执行前仍须完整披露。

### Task P 节点

#### P1 — 编辑 candidate projection staging

- `taskBoundary`：P；`operationKind`：编辑；`estimatedCost`：中；`deferralEvidence`：无。
- `outcome`：新增私有 staged projection 与 unit tests；不 dispatch real store、不重写 ingress 算法。
- `hardPredecessors`：W0；`consumes`：generated notification types、existing ingress/fixtures；`produces`：staging Interface
  与 tests。
- `completionEvidence`：write set 仅 Task P 新文件；tests 覆盖 FIFO replay、sync delta flush、invalid/stale input。
- `readSet/writeSet`：Task P 声明集合/Task P 新文件；`executionContext`：implementation worktree。
- `resourceLocks`：Task P files write；`owner`：P editor；`verification`：source review + `git diff --check`。
- `failureDomain`：P2 及 R/L/A/C；`replanTriggers`：必须改 ingress algorithm、Redux 或 fixtures；`authorizationGate`：A0。

#### P2 — 验证 Task P

- `taskBoundary`：P；`operationKind`：验证；`estimatedCost`：中；`deferralEvidence`：无。
- `outcome`：focused staged-projection unit exit 0。
- `hardPredecessors`：P1；`consumes`：Task P diff；`produces`：unit evidence。
- `completionEvidence`：`pnpm run test:unit -- src/features/activeThreadSession/__tests__/activeThreadProjection.test.ts`
  exit 0，且 tracked diff 未被测试修改。
- `readSet/writeSet`：Task P files + fixtures/Vitest cache only；`executionContext`：implementation `codex-gui`。
- `resourceLocks`：Vitest/Vite cache and unit runner write；`owner`：P verifier。
- `verification`：fnm-backed command；`failureDomain`：P3 及后继；`replanTriggers`：fixture/interface failure；
  `authorizationGate`：A0。

#### P3 — 暂存 Task P

- `taskBoundary`：P；`operationKind`：stage；`estimatedCost`：低；`deferralEvidence`：无。
- `outcome`：只暂存 Task P files；`hardPredecessors`：P2；`produces`：verified P index。
- `completionEvidence`：cached check与diff review通过；`readSet/writeSet`：P files/index。
- `resourceLocks`：implementation Git index write；`owner`：P Git owner；`failureDomain`：P4及后继；`authorizationGate`：A0。

#### P4 — 提交 Task P

- `taskBoundary`：P；`operationKind`：commit；`estimatedCost`：低；`deferralEvidence`：无。
- `outcome`：独立提交 `feat(gui): stage active thread projection`；`hardPredecessors`：P3。
- `consumes`：verified P index；`produces`：P commit SHA；`completionEvidence`：commit成功且show范围准确。
- `readSet/writeSet`：index/branch；`resourceLocks`：implementation Git index/branch write；`owner`：P Git owner。
- `failureDomain`：R1及后继；`authorizationGate`：A0。

### Task R 节点

#### R1M — 移动 candidate read-model builder

- `taskBoundary`：R；`operationKind`：git-move；`estimatedCost`：低；`deferralEvidence`：无。
- `outcome`：先用 `git mv` 将旧 builder 固化到计划声明的新路径；不编辑内容、不删除其他文件。
- `hardPredecessors`：P4；`consumes`：stable staging fact types与旧builder；`produces`：新路径及rename index state。
- `completionEvidence`：`git status --short`只显示该rename，新路径可读且旧路径不存在。
- `readSet/writeSet`：旧/新builder路径与Git index；`executionContext`：implementation worktree。
- `resourceLocks`：两条canonical paths与Git index write；`owner`：唯一R Git owner；`verification`：status/path核验。
- `failureDomain`：R1及后继；`replanTriggers`：目标已存在、旧路径漂移或rename无法成立；`authorizationGate`：A0。

#### R1 — 编辑 revisioned read model

- `taskBoundary`：R；`operationKind`：编辑；`estimatedCost`：高；`deferralEvidence`：无。
- `outcome`：baseline/event/delta/unavailable action revision 化，runtime/transcript 拒绝 stale revision；普通源码编辑
  不操作 Git index。
- `hardPredecessors`：R1M，消费已移动的新路径；`consumes`：P commit、RTK local docs、Redux slices；
  `produces`：revisioned derived read-model Interface。
- `completionEvidence`：新read model、reducers与精确列出的tests完成，待删除路径已无生产消费者。
- `readSet/writeSet`：Task R 声明集合/Task R 声明集合；`executionContext`：implementation worktree。
- `resourceLocks`：store/runtime/transcript/read-model files write；`owner`：R editor；`verification`：`rg` old symbols + diff check。
- `failureDomain`：R1D及 L/A/C；`replanTriggers`：发现新增 operational consumer、candidate baseline不能 staged、write set扩大；
  `authorizationGate`：A0。

#### R1D — 删除旧 Redux authority

- `taskBoundary`：R；`operationKind`：git-delete；`estimatedCost`：低；`deferralEvidence`：无。
- `outcome`：用 `git rm` 删除 Task R 明列的四个 legacy files；不移动或编辑内容。
- `hardPredecessors`：R1；`consumes`：已切断旧 imports 的 R diff；`produces`：精确 rename/delete index state。
- `completionEvidence`：`git status --short` 仅新增计划内delete，旧authority路径不存在且无消费者。
- `readSet/writeSet`：Task R 明列delete paths/Git index；`resourceLocks`：这些路径与Git index write。
- `owner`：唯一 R Git owner；`failureDomain`：R2及后继；`replanTriggers`：仍有旧消费者；`authorizationGate`：A0。

#### R2 — 验证 Task R

- `taskBoundary`：R；`operationKind`：验证；`estimatedCost`：中；`deferralEvidence`：无。
- `outcome`：focused runtime/transcript unit exit 0，old authority source audit 无残留定义。
- `hardPredecessors`：R1D；`consumes`：R diff与rename/delete state；`produces`：unit/audit evidence。
- `completionEvidence`：fnm-backed focused unit paths均 exit 0；`rg` 不再找到 threadIdentity definition/store key。
- `readSet/writeSet`：R files/tests/Vitest cache only；`executionContext`：implementation `codex-gui`。
- `resourceLocks`：unit runner/Vite cache write；`owner`：R verifier。
- `verification`：`pnpm run test:unit --` 加Task R精确列出的runtime/transcript tests；`failureDomain`：R3+后继。
- `replanTriggers`：old consumer超出 Task C、stale reducer test失败；`authorizationGate`：A0。

#### R3 — 暂存 Task R

- `taskBoundary`：R；`operationKind`：stage；`estimatedCost`：低；`deferralEvidence`：无。
- `outcome`：暂存其余Task R edits并保留R1D index结果；`hardPredecessors`：R2；`produces`：verified R index。
- `completionEvidence`：cached范围/check/diff review通过；`readSet/writeSet`：R files/index；`resourceLocks`：Git index write。
- `owner`：R Git owner；`failureDomain`：R4及后继；`authorizationGate`：A0。

#### R4 — 提交 Task R

- `taskBoundary`：R；`operationKind`：commit；`estimatedCost`：低；`deferralEvidence`：无。
- `outcome`：独立提交 `refactor(gui): derive active thread read models`；`hardPredecessors`：R3。
- `consumes`：verified R index；`produces`：R commit SHA；`completionEvidence`：commit成功且show范围准确。
- `readSet/writeSet`：index/branch；`resourceLocks`：Git index/branch write；`owner`：R Git owner。
- `failureDomain`：L1及后继；`authorizationGate`：A0。

### Task L 节点

#### L1 — 编辑 live session 与 gated roles

- `taskBoundary`：L；`operationKind`：编辑；`estimatedCost`：高；`deferralEvidence`：无。
- `outcome`：新增 cached session snapshot、single revision transaction、完整 Composer/skills role gate 和 child
  subscription teardown。
- `hardPredecessors`：R4，消费 revisioned read-model Interface；`consumes`：P/R commits、queue/catalog interfaces；
  `produces`：stable live-session role Interface。
- `completionEvidence`：raw child listeners不对外；accepted fact只发布一次 revision；stale edit reservation与skills
  retry均拒绝。
- `readSet/writeSet`：Task L声明集合/Task L新文件；`executionContext`：implementation worktree。
- `resourceLocks`：Task L files write；`owner`：L editor；`verification`：diff check + deletion test review。
- `failureDomain`：L2及A/C；`replanTriggers`：必须修改queue/catalog、双revision、role不覆盖Drawer能力；
  `authorizationGate`：A0。

#### L2 — 验证 Task L

- `taskBoundary`：L；`operationKind`：验证；`estimatedCost`：中；`deferralEvidence`：无。
- `outcome`：focused live-session、queue、catalog unit exit 0。
- `hardPredecessors`：L1；`consumes`：L diff；`produces`：role/gate unit evidence。
- `completionEvidence`：`pnpm run test:unit --` 指向 liveActiveThreadSession、queue coordinator、skill catalog tests
  exit 0。
- `readSet/writeSet`：L files+read-only child tests/Vitest cache；`executionContext`：implementation `codex-gui`。
- `resourceLocks`：unit runner/Vite cache write；`owner`：L verifier；`verification`：fnm-backed command。
- `failureDomain`：L3及A/C；`replanTriggers`：child write set需要扩大；`authorizationGate`：A0。

#### L3 — 暂存 Task L

- `taskBoundary`：L；`operationKind`：stage；`estimatedCost`：低；`deferralEvidence`：无。
- `outcome`：只暂存Task L files；`hardPredecessors`：L2；`produces`：verified L index。
- `completionEvidence`：cached check与diff review通过；`readSet/writeSet`：L files/index；`resourceLocks`：Git index write。
- `owner`：L Git owner；`failureDomain`：L4及后继；`authorizationGate`：A0。

#### L4 — 提交 Task L

- `taskBoundary`：L；`operationKind`：commit；`estimatedCost`：低；`deferralEvidence`：无。
- `outcome`：独立提交 `feat(gui): gate active thread session roles`；`hardPredecessors`：L3。
- `consumes`：verified L index；`produces`：L commit SHA；`completionEvidence`：commit成功且show范围准确。
- `readSet/writeSet`：index/branch；`resourceLocks`：Git index/branch write；`owner`：L Git owner。
- `failureDomain`：A1及后继；`authorizationGate`：A0。

### Task A 节点

#### A1 — 编辑 activation transaction

- `taskBoundary`：ACTIVATION；`operationKind`：编辑；`estimatedCost`：高；`deferralEvidence`：无。
- `outcome`：首次 attach/switch 共用 activate；candidate准备期旧session可用；最终短release CAS；pre-publication
  reconciliation；single publication；cleanup/connection terminal分类完整。
- `hardPredecessors`：L4，消费 stable live-session role；`consumes`：P/R/L commits、GuiHostCommands、auth locator；
  `produces`：public ActiveThreadSession Interface。
- `completionEvidence`：unit tests覆盖设计全部activation failure/success invariants。
- `readSet/writeSet`：Task A声明集合/Task A新文件；`executionContext`：implementation worktree。
- `resourceLocks`：Task A files write；`owner`：A editor；`verification`：diff check与outcome exhaustiveness review。
- `failureDomain`：A2及Task C；`replanTriggers`：需要旧coordinator、长reservation、post-publication replay或protocol改动；
  `authorizationGate`：A0。

#### A2 — 验证 Task A

- `taskBoundary`：ACTIVATION；`operationKind`：验证；`estimatedCost`：中；`deferralEvidence`：无。
- `outcome`：focused activation unit exit 0。
- `hardPredecessors`：A1；`consumes`：A diff；`produces`：activation evidence。
- `completionEvidence`：fnm-backed `pnpm run test:unit -- src/features/activeThreadSession/__tests__/activeThreadSession.test.ts`
  exit 0。
- `readSet/writeSet`：A files/tests/Vitest cache；`executionContext`：implementation `codex-gui`。
- `resourceLocks`：unit runner/Vite cache write；`owner`：A verifier；`verification`：focused command。
- `failureDomain`：A3及Task C；`replanTriggers`：Interface或outcome变化；`authorizationGate`：A0。

#### A3 — 暂存 Task A

- `taskBoundary`：ACTIVATION；`operationKind`：stage；`estimatedCost`：低；`deferralEvidence`：无。
- `outcome`：只暂存Task A files；`hardPredecessors`：A2；`produces`：verified A index。
- `completionEvidence`：cached check与diff review通过；`readSet/writeSet`：A files/index；`resourceLocks`：Git index write。
- `owner`：A Git owner；`failureDomain`：A4及后继；`authorizationGate`：A0。

#### A4 — 提交 Task A

- `taskBoundary`：ACTIVATION；`operationKind`：commit；`estimatedCost`：低；`deferralEvidence`：无。
- `outcome`：独立提交 `feat(gui): coordinate active thread activation`；`hardPredecessors`：A3。
- `consumes`：verified A index；`produces`：A commit SHA/public Interface稳定点；`completionEvidence`：commit成功且show范围准确。
- `readSet/writeSet`：index/branch；`resourceLocks`：Git index/branch write；`owner`：A Git owner。
- `failureDomain`：C1-C8；`authorizationGate`：A0。

### Task C fan-out/fan-in 节点

#### C1 — React capability contract

- `taskBoundary`：CONSUMER；`operationKind`：编辑；`estimatedCost`：中；`deferralEvidence`：无。
- `outcome`：Context仅暴露stable session，新增cached snapshot/primitive selector hooks。
- `hardPredecessors`：A4；`consumes`：public ActiveThreadSession Interface；`produces`：React capability contract。
- `completionEvidence`：只写 AppCapabilities two files；Context value无高频 snapshot/raw owner。
- `readSet/writeSet`：Task C capability files/同文件；`executionContext`：implementation worktree。
- `resourceLocks`：capability files write；`owner`：C capability editor；`verification`：diff check。
- `failureDomain`：C2-C5；`replanTriggers`：getSnapshot不稳定或contract缺startup事实；`authorizationGate`：A0。

#### C2 — Bridge/App 接线

- `taskBoundary`：CONSUMER；`operationKind`：编辑；`estimatedCost`：高；`deferralEvidence`：无。
- `outcome`：Bridge唯一创建/dispose session并路由host facts；App不保存owner/continue/snapshot，route订阅primitive。
- `hardPredecessors`：C1；`consumes`：React contract；`produces`：connection/root wiring。
- `completionEvidence`：write set仅 Bridge/App；无startup/switch coordinator创建和raw owner state。
- `readSet/writeSet`：Bridge/App+session contract/Bridge/App；`executionContext`：implementation worktree。
- `resourceLocks`：Bridge/App files write；`owner`：C2 editor；`verification`：source audit。
- `failureDomain`：C5/C6；`replanTriggers`：需改session Interface或connection contract；`authorizationGate`：A0。

#### C3 — CurrentTask/Composer/pending capability切换

- `taskBoundary`：CONSUMER；`operationKind`：编辑；`estimatedCost`：高；`deferralEvidence`：无。
- `outcome`：Composer及pending drawer只用session role；删除Redux operability/raw queue/catalog订阅。
- `hardPredecessors`：C1；`consumes`：React contract与gated roles；`produces`：current-task/composer cutover。
- `completionEvidence`：声明production write set内无raw controller props；完整pending edit capability受gate。
- `readSet/writeSet`：Task C composer/current files/同文件；`executionContext`：implementation worktree。
- `resourceLocks`：current/composer files write；`owner`：C3 editor；`verification`：`rg`旧props/selectors。
- `failureDomain`：C5/C6；`replanTriggers`：role缺能力或queue语义改变；`authorizationGate`：A0。

#### C4 — TopBar/History consumer切换

- `taskBoundary`：CONSUMER；`operationKind`：编辑；`estimatedCost`：中；`deferralEvidence`：无。
- `outcome`：TopBar/History通过primitive session identity与activate outcome工作；startup空/错误事实保留。
- `hardPredecessors`：C1；`consumes`：React contract；`produces`：navigation/history cutover。
- `completionEvidence`：无activeOwner/continueThread fixture或production import。
- `readSet/writeSet`：Task C topbar/history files/同文件；`executionContext`：implementation worktree。
- `resourceLocks`：topbar/history files write；`owner`：C4 editor；`verification`：source audit。
- `failureDomain`：C5/C6；`replanTriggers`：history outcome语义变化或需新文案；`authorizationGate`：A0。

上述 C2/C3/C4 在 C1 完成后 write set 不相交，必须并行调度；它们共享 worktree但不操作Git index。

#### C5 — Consumer production fan-in 审查

- `taskBoundary`：CONSUMER；`operationKind`：fan-in审查；`estimatedCost`：中；`deferralEvidence`：无。
- `outcome`：唯一owner审查共享worktree中C2/C3/C4的组合diff，确认各节点未越界、接口一致且无冲突；不写文件。
- `hardPredecessors`：C2、C3、C4；`consumes`：三组共享worktree mutable diff；`produces`：稳定production fan-in evidence。
- `completionEvidence`：逐文件归属、组合`git diff --check`和旧symbol审查通过；`readSet/writeSet`：C2-C4 files/无。
- `resourceLocks`：C2-C4 source read；`owner`：唯一C fan-in reviewer；`failureDomain`：C6及后继。
- `replanTriggers`：写集合越界、接口冲突或新增consumer；`authorizationGate`：A0。

#### C6 — Consumer tests/harness迁移

- `taskBoundary`：CONSUMER；`operationKind`：编辑；`estimatedCost`：高；`deferralEvidence`：无。
- `outcome`：迁移unit/Browser/sequential harness；非法多owner组合不可构造；不删除文件、不操作index。
- `hardPredecessors`：C5；`consumes`：稳定production fan-in与A tests；`produces`：完整replacement coverage diff。
- `completionEvidence`：Task C精确声明的测试全部迁移；`readSet/writeSet`：Task C tests/Task C tests。
- `resourceLocks`：Task C tests write；`owner`：C6 editor；`verification`：`rg` old fixtures与`git diff --check`。
- `failureDomain`：C7及后继；`replanTriggers`：额外consumer或UI文案；`authorizationGate`：A0。

#### C7 — 删除 legacy consumer paths

- `taskBoundary`：CONSUMER；`operationKind`：git-delete；`estimatedCost`：低；`deferralEvidence`：无。
- `outcome`：使用`git rm`删除Task C明列的旧owner/coordinators/tests；不编辑其他文件。
- `hardPredecessors`：C6；`consumes`：已迁移测试与零生产consumer证据；`produces`：精确legacy deletion index state。
- `completionEvidence`：删除集合与计划完全一致，旧production symbols不在`codex-gui/src`。
- `readSet/writeSet`：Task C legacy files/Git index；`resourceLocks`：legacy paths与Git index write；`owner`：唯一C Git owner。
- `failureDomain`：C8及后继；`replanTriggers`：仍有消费者或删除集合变化；`authorizationGate`：A0。

#### C8 — Consumer组合验证

- `taskBoundary`：CONSUMER；`operationKind`：验证；`estimatedCost`：高；`deferralEvidence`：无。
- `outcome`：focused unit、parallel Browser、sequential viewport、type-check通过。
- `hardPredecessors`：C7；`consumes`：完整consumer diff；`produces`：组合验证证据。
- `completionEvidence`：以下fnm-backed commands全部exit 0，tracked diff不变：
  - `pnpm run test:unit -- src/features/activeThreadSession/__tests__/activeThreadProjection.test.ts src/features/activeThreadSession/__tests__/liveActiveThreadSession.test.ts src/features/activeThreadSession/__tests__/activeThreadSession.test.ts src/features/composerTurnControl/__tests__/composerTurnControlModel.test.ts`
  - `pnpm run type-check`
  - `pnpm run test:browser:parallel -- src/__tests__/App.browser.test.tsx src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx src/features/appShell/__tests__/AppShellTopBar.browser.test.tsx src/features/threadHistory/__tests__/ThreadHistoryListPage.browser.test.tsx src/features/threadHistory/__tests__/ThreadHistoryDetailPage.browser.test.tsx`
  - `pnpm run test:browser:sequential -- src/__tests__/sequential/composer-viewport.browser.test.tsx`
- `readSet/writeSet`：all Task P-R-L-A-C files/Vite、TS、Browser caches only；`executionContext`：implementation `codex-gui`。
- `resourceLocks`：type/unit/browser runners按canonical cache/process独占，命令串行取得锁；`owner`：C verifier。
- `verification`：本地Vitest docs要求DOM用`expect.element`，非DOM异步state用`expect.poll`。
- `failureDomain`：C9及后继；`replanTriggers`：计划内failure插修正节点；浏览器缺失停止，不安装；
  `authorizationGate`：A0。

#### C9 — 暂存 Consumer

- `taskBoundary`：CONSUMER；`operationKind`：stage；`estimatedCost`：低；`deferralEvidence`：无。
- `outcome`：暂存其余Task C edits并保留C7 deletion index；`hardPredecessors`：C8；`produces`：verified C index。
- `completionEvidence`：cached范围/check/diff review通过；`readSet/writeSet`：C files/index；`resourceLocks`：Git index write。
- `owner`：C Git owner；`failureDomain`：C10及后继；`authorizationGate`：A0。

#### C10 — 提交 Consumer

- `taskBoundary`：CONSUMER；`operationKind`：commit；`estimatedCost`：低；`deferralEvidence`：无。
- `outcome`：独立提交 `refactor(gui): switch consumers to active thread session`；`hardPredecessors`：C9。
- `consumes`：verified C index；`produces`：C commit SHA；`completionEvidence`：commit成功且show范围准确。
- `readSet/writeSet`：index/branch；`resourceLocks`：Git index/branch write；`owner`：C Git owner。
- `failureDomain`：F1及validation；`authorizationGate`：A0。

### Formatting、最终验证与 issue 节点

#### F1 — frontend formatter

- `taskBoundary`：FORMAT；`operationKind`：格式化；`estimatedCost`：低；`deferralEvidence`：无。
- `outcome`：`pnpm run format:oxfmt:fix` 只产生格式/order-only变化，随后check通过；若无diff则FORMAT task完成无提交。
- `hardPredecessors`：C10；`consumes`：stable integrated code；`produces`：format diff或empty evidence。
- `completionEvidence`：fix与`pnpm run format:oxfmt` exit 0，diff逐文件确认无行为变化/范围外文件。
- `readSet/writeSet`：entire `codex-gui` tracked tree/formatter实际触及文件；`executionContext`：implementation `codex-gui`。
- `resourceLocks`：entire frontend tree write、formatter cache；`owner`：唯一 FORMAT owner。
- `verification`：format check + diff review；`failureDomain`：F2/V nodes；`replanTriggers`：行为或范围外diff；
  `authorizationGate`：A0。

#### F2 — 暂存 formatter/order-only diff

- `taskBoundary`：FORMAT；`operationKind`：stage；`estimatedCost`：低；`deferralEvidence`：无。
- `outcome`：有diff时只暂存formatter diff；无diff时产生empty evidence。
- `hardPredecessors`：F1；`consumes`：reviewed format diff；`produces`：verified F index或empty evidence。
- `completionEvidence`：cached check通过或`git status`证明无diff；`readSet/writeSet`：formatter files/index。
- `resourceLocks`：Git index write；`owner`：FORMAT Git owner；`failureDomain`：F3/V节点；`authorizationGate`：A0。

#### F3 — 提交 formatter/order-only diff

- `taskBoundary`：FORMAT；`operationKind`：commit；`estimatedCost`：低；`deferralEvidence`：无。
- `outcome`：有diff时独立提交 `style(gui): format active thread session changes`；无diff时记录not needed。
- `hardPredecessors`：F2；`consumes`：verified F index或empty evidence；`produces`：optional F commit或empty evidence。
- `completionEvidence`：commit成功且show只含format/order变化，或index为空；`readSet/writeSet`：index/branch。
- `resourceLocks`：Git index/branch write；`owner`：FORMAT Git owner；`failureDomain`：V1-V3；`authorizationGate`：A0。

#### V1 — full frontend CI

- `taskBoundary`：无提交；`operationKind`：验证；`estimatedCost`：高；`deferralEvidence`：无。
- `outcome`：`pnpm run ci` exit 0且tracked diff不变。
- `hardPredecessors`：F3；`consumes`：formatted stable branch；`produces`：protocol-check、format-check、lint、type、full-unit evidence。
- `completionEvidence`：fnm-backed command exit 0。
- `readSet/writeSet`：entire frontend/Vite、TS、ESLint、unit caches；`executionContext`：implementation `codex-gui`。
- `resourceLocks`：共享symlink target下`node_modules/.vite`、`node_modules/.tmp/*.tsbuildinfo`、ESLint cache及其runner process write；
  `owner`：V1 verifier；`verification`：exact package script。
- `failureDomain`：I1/FR；`replanTriggers`：计划内failure插新修正commit；`authorizationGate`：A0。

#### V2 — full Browser Mode

- `taskBoundary`：无提交；`operationKind`：验证；`estimatedCost`：高；`deferralEvidence`：无。
- `outcome`：`pnpm run test:browser` 在parallel+sequential、Chromium/Firefox/WebKit全部exit 0。
- `hardPredecessors`：F3；`consumes`：formatted stable branch；`produces`：full Browser evidence。
- `completionEvidence`：fnm-backed command exit 0，tracked diff不变。
- `readSet/writeSet`：all Browser tests/Vite server、Playwright processes/artifacts；`executionContext`：implementation `codex-gui`。
- `resourceLocks`：共享symlink target下`node_modules/.vite`、`node_modules/.tmp/*.tsbuildinfo`、Browser/Vite/Playwright
  process与artifacts write；`owner`：V2 verifier；`verification`：exact script。
- `failureDomain`：I1/FR；`replanTriggers`：缺browser停止用户安装；计划内failure插修正commit；`authorizationGate`：A0。

#### V3 — source/contract audit

- `taskBoundary`：无提交；`operationKind`：审查；`estimatedCost`：中；`deferralEvidence`：无。
- `outcome`：证明无raw owner/controller、旧coordinator、threadIdentity operability、compat/fallback、generated/Rust diff，
  并核对提交规模与既有design invariants。
- `hardPredecessors`：F3；`consumes`：stable formatted tree与commit history；`produces`：final audit report。
- `completionEvidence`：targeted `rg`无旧production符号；`git diff`/`git log`证明task commits/order-only split；无范围外文件。
- `readSet/writeSet`：repo source/history/无；`executionContext`：implementation worktree。
- `resourceLocks`：source/history read；`owner`：独立reviewer；`verification`：source-backed review。
- `failureDomain`：I1/FR；`replanTriggers`：发现遗漏consumer、第二owner或commit混杂；`authorizationGate`：A0。

V1、V2、V3 在F3后同时进入ready set；V3与runner只读不冲突，应立即并行。V1/V2因上述canonical cache/process
写锁只允许一个运行，先获得锁者运行，释放后立即调度另一个，不能伪造hard dependency。

#### I1 — 更新 issues 04/05

- `taskBoundary`：ISSUE-EVIDENCE；`operationKind`：编辑；`estimatedCost`：低；`deferralEvidence`：无。
- `outcome`：issues 04/05按workflow改为已修复，写入真实commits和V1/V2/V3证据；issue06不变。
- `hardPredecessors`：V1、V2、V3，必须消费全部稳定验证；`consumes`：implementation commits与evidence；
  `produces`：two issue docs diff。
- `completionEvidence`：required metadata/section order保留，修复/验证记录准确，后续处理不含计划正文。
- `readSet/writeSet`：issues04/05/issues04/05；`executionContext`：implementation worktree。
- `resourceLocks`：two issue docs write；`owner`：issue editor；`verification`：workflow quality check+diff check。
- `failureDomain`：I2/FR；`replanTriggers`：验证不完整或issue06实际被修改；`authorizationGate`：A0。

#### I2 — 暂存 issue evidence

- `taskBoundary`：ISSUE-EVIDENCE；`operationKind`：stage；`estimatedCost`：低；`deferralEvidence`：无。
- `outcome`：只暂存issues04/05；`hardPredecessors`：I1；`produces`：verified issue index。
- `completionEvidence`：cached范围/check/diff review通过；`readSet/writeSet`：issues/index；`resourceLocks`：Git index write。
- `owner`：issue Git owner；`failureDomain`：I3/FR；`authorizationGate`：A0。

#### I3 — 提交 issue evidence

- `taskBoundary`：ISSUE-EVIDENCE；`operationKind`：commit；`estimatedCost`：低；`deferralEvidence`：无。
- `outcome`：独立提交 `docs: close active thread ownership issues`；`hardPredecessors`：I2。
- `consumes`：verified issue index；`produces`：issue commit SHA；`completionEvidence`：commit成功且show范围准确。
- `readSet/writeSet`：index/branch；`resourceLocks`：Git index/branch write；`owner`：issue Git owner。
- `failureDomain`：FR；`authorizationGate`：A0。

#### FR — 最终完成审查

- `taskBoundary`：无提交；`operationKind`：fan-in；`estimatedCost`：低；`deferralEvidence`：无。
- `outcome`：所有节点、commits、验证、issue状态和clean worktree满足计划；输出交付摘要。
- `hardPredecessors`：I3；`consumes`：全部commit SHA、V1/V2/V3 evidence；`produces`：final completion report。
- `completionEvidence`：`git status --short --branch` clean；commit topology完整；无未处理计划内failure。
- `readSet/writeSet`：worktree/history/无；`executionContext`：implementation worktree。
- `resourceLocks`：source/history read；`owner`：主协调者；`verification`：final status/log/audit。
- `failureDomain`：仅最终交付；`replanTriggers`：任何节点未完成或状态不clean；`authorizationGate`：A0。

## 初始 ready set、关键路径与并行汇合

当前计划尚未确认，ready set 只有 A0（用户授权节点）。计划确认后：

```text
A0 -> D0 -> D1 -> D2 -> D3 -> W0 -> P1 -> P2 -> P3 -> P4
   -> R1M -> R1 -> R1D -> R2 -> R3 -> R4 -> L1 -> L2 -> L3 -> L4
   -> A1 -> A2 -> A3 -> A4 -> C1
                              ├-> C2 ─┐
                              ├-> C3 ─┼-> C5 -> C6 -> C7 -> C8 -> C9 -> C10 -> F1 -> F2 -> F3
                              └-> C4 ─┘
                                                                                 ├-> V1 ─┐
                                                                                 ├-> V2 ─┼-> I1 -> I2 -> I3 -> FR
                                                                                 └-> V3 ─┘
```

关键路径是 DOCS → worktree → P → R → L → A → C1 → max(C2/C3/C4) → production fan-in → tests →
legacy deletion → consumer verification/commit → formatter →
max(serialized V1/V2, V3) → issue evidence。C2/C3/C4 是第一组真正无硬依赖、无写冲突的并行节点；V3 与
V1/V2 runner 并行。其余串行边都有稳定 Interface、组合 diff、Git index或验证证据依赖。

## 验证命令

所有 frontend commands 从 implementation worktree 的 `codex-gui` 目录，以 fnm-backed 方式执行。计划中的
简写 `pnpm ...` 实际必须写成：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run <script> [-- <args>]
```

最终固化入口：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt:fix
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
/opt/homebrew/bin/fnm exec --using-file pnpm run ci
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser
```

不运行：

- `just fmt`；pure frontend/docs 不在 live repo formatter scope。
- `protocol:generate-validators`、schema/Rust generator；无 contract 变化。
- `test:e2e`/headed；本次真实 React/App surface 由三浏览器 Vitest Browser覆盖。
- frontend `build`；type-check、full unit 与 Browser 已覆盖内部 ownership wiring，无打包产物目标。
- dependency install/update或browser download。

若 formatter、lint、type、unit或Browser发现本次计划内问题，插入边界明确的修正节点和新的独立commit，重算
受影响验证；不得amend。预存或无关失败只报告，不顺带修复。

## 完成判据

- design/plan docs commit、P/R/L/A/C行为提交、可选FORMAT提交、issue evidence提交均存在且边界独立。
- `ActiveThreadSession` 是唯一current identity/subscription/active-turn/operability authority。
- Candidate baseline/events/deltas在publication前私有归并，real Redux只接受revisioned facts。
- 旧session在远端candidate准备期间可用，最终同步release CAS才决定提交或保留旧session。
- queue/skills与pending edit完整能力链受同一revision/phase gate；React无raw controller escape。
- startup/switch共用activation transaction，旧owner/coordinators/threadIdentity production path已删除。
- Context只持stable session；AppShell/transcript不因完整高频snapshot进入Context而无谓重渲染。
- issue04/05记录真实修复与验证；issue06保持未解决。
- `pnpm run ci`与完整`pnpm run test:browser`通过，最终worktree clean。
- 无generated/Rust/protocol/i18n/dependency/remote/force/范围外变更。
