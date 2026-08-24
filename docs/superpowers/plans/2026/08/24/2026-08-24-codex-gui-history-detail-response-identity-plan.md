# Codex GUI History Detail 响应线程身份实施计划

计划日期：2026-08-24

计划状态：已确认

确认日期：2026-08-24

确认原文：`开始执行`

对应已确认设计：
`docs/superpowers/specs/2026/08/24/2026-08-24-codex-gui-history-detail-response-identity-design.md`

关联 issue：
`docs/superpowers/issues/2026/08/24/2026-08-24-01-codex-gui-current-code-problems/2026-08-24-02-history-detail-response-identity.md`

## 目标

在 history detail owner 的 `thread/read` 响应接收边界严格核对请求 `threadId` 与
`response.thread.id`。身份不匹配时复用现有可重试加载错误，禁止错误线程进入 ready、构建
transcript 或暴露“继续此任务”；身份匹配时保持现有行为。

## 当前基线与实施必要性

计划确认时：

- worktree：`/Users/jiangsheng/cnb/codex/.worktrees/gui-history-detail-response-identity`
- 分支：`codex/gui-history-detail-response-identity`
- HEAD：`a0e46f04191430fc571ebeebe728e98650a80ea9`（`docs(gui): design history detail response identity`）
- worktree 与独立 Git index 均干净。
- `a0e46f041` 已是包含本次 design 与 plan 的独立 docs-only 提交；D1-D3 只创建新的 plan-only
  确认提交，不重复提交 design。同日期目录还存在由 `866fd4c63` 提交、与本任务无关的
  thread-switch design/plan，任何节点都不得修改或重复纳入本任务提交。
- `codex-gui/AGENTS.md` 已在更早的 `3d6c46100` 中明确：当前 Task H 与 docs 文件均不属于
  `scripts/format.py` 管理范围，因此本计划禁止运行仓库级 `just fmt`。

实施前必须重新核验当前状态，不能把上述 HEAD 和行号当作未来执行时的固定事实。

当前代码必须修改的证据：

- `threadHistoryDetailOwner.ts:74-98` 在 generation 防护后直接用任意合法 `response.thread`
  构建 transcript 并发布 ready，没有维护请求—响应身份关系。
- `ThreadHistoryDetailPage.tsx:147-207,281-288` 使用响应线程展示标题与 transcript，却使用路由
  `threadId` 继续任务；错误身份进入 ready 后会形成“展示 A、继续 B”。
- 生成 validator 只验证单个响应结构，JSON-RPC `id` 只关联 pending request；二者都没有请求
  `threadId` 上下文，不能完成该关系校验。
- 相邻 startup/thread switch 路径已经在响应接收边界拒绝不同线程身份，证明该不变量属于现有
  代码约束，不是新增兼容行为。

## 完整纵向路径

```text
history detail route threadId
  -> ThreadHistoryDetailOwner.readThread({ threadId, includeTurns: true })
  -> generated thread/read descriptor + runtime shape validator
  -> decoded response.thread
  -> generation/dispose gate
  -> request threadId === response.thread.id gate
       mismatch -> existing error state -> Alert + Retry original threadId
       match    -> buildTranscriptStateFromTurns -> ready
  -> ready-only document title / transcript / ContinueTaskAction
```

## 实施硬约束

1. 校验顺序固定为 generation 有效性、身份比较、transcript 构建、ready 发布。
2. mismatch 必须在现有成功回调的 `try/catch` 内抛出普通
   `Error("thread/read returned a different thread identity")`。
3. 不修改 `ThreadHistoryDetailPage.tsx`；现有 error/ready 互斥渲染已经满足产品语义。
4. 不新增状态 variant、错误类、自动重试、重定向、fallback、兼容层或双路径。
5. 不修改 app-server、协议、schema、生成 TypeScript、runtime validator、GUI Host gateway/allowlist、
   resume/attach/thread switch 或 live owner 生命周期。
6. 测试使用现有生成协议类型和共享 projection builders，不手写镜像 DTO。
7. Browser Mode 异步 DOM 断言使用 locator 与 `expect.element`；不增加 E2E、截图或低价值样式断言。
8. 行为提交不得夹带 import、声明、函数、分支或其他代码的纯顺序调整。
9. 不安装依赖、runtime 或浏览器，不操作 Git 远程，不运行后端/原生构建。
10. 实施开始前，本次 design 与 plan 的 work-doc 提交及 plan-only 确认提交必须均已成功。

## 精确写入范围

### 已有 work-doc 提交

- `docs/superpowers/specs/2026/08/24/2026-08-24-codex-gui-history-detail-response-identity-design.md`
- `docs/superpowers/plans/2026/08/24/2026-08-24-codex-gui-history-detail-response-identity-plan.md`

### Plan confirmation 提交

- `docs/superpowers/plans/2026/08/24/2026-08-24-codex-gui-history-detail-response-identity-plan.md`

### Task H：行为与验证

- `codex-gui/src/features/threadHistory/threadHistoryDetailOwner.ts`
- `codex-gui/src/features/threadHistory/__tests__/threadHistoryDetailOwner.test.ts`
- `codex-gui/src/features/threadHistory/__tests__/ThreadHistoryDetailPage.browser.test.tsx`

格式化命令可能扫描更宽目录，但最终行为提交只能包含上述三个 Task H 文件。任何其他文件发生修改，
均触发范围核验；不能把它顺手并入提交。

## 明确只读、不写

- `codex-gui/src/features/threadHistory/ThreadHistoryDetailPage.tsx`
- `codex-gui/src/features/guiHost/**`
- `codex-gui/src/generated/**`
- `codex-rs/**`
- `codex-gui/src/locales/**`
- 关联 issue 文档
- 同日期目录中由 `866fd4c63` 提交的 thread-switch design/plan

## Worktree、branch 与 Git index

本计划利用已经创建并完成核验的 feature worktree，不再创建其他 worktree。

- execution context：`/Users/jiangsheng/cnb/codex/.worktrees/gui-history-detail-response-identity`
- branch：`codex/gui-history-detail-response-identity`
- Git index：该 feature worktree 的独立 index
- plan confirmation 与 Task H 存在硬依赖：plan-only confirmation commit 成功前禁止编辑代码或测试。
- Task H 在 D3 后先发布基线源码与测试的只读 Git blob 快照。三个编辑节点只消费该稳定快照，
  不读取彼此正在修改的 working-tree 文件，因此可以在同一 worktree 并行；它们都不得操作 index。
- formatter、stage 与 commit 分别由 Task H 唯一 owner 在 fan-in 后执行。

如果实施前分支不再是 `codex/gui-history-detail-response-identity`、目标写集合出现无法安全避让的用户修改，或需要新的
worktree/branch/index，停止并重新确认计划参数。

## 实施前预检

计划确认后，从 feature worktree 根只读核验：

```bash
git status --short --branch
git rev-parse --abbrev-ref HEAD
git rev-parse HEAD
git ls-files --others --exclude-standard -- docs/superpowers/specs/2026/08/24 docs/superpowers/plans/2026/08/24
git diff --check -- docs/superpowers/specs/2026/08/24/2026-08-24-codex-gui-history-detail-response-identity-design.md docs/superpowers/plans/2026/08/24/2026-08-24-codex-gui-history-detail-response-identity-plan.md
test -x /opt/homebrew/bin/fnm
test -d codex-gui/node_modules
test -d ../vitest/docs
rg -n -e 'thread/read returned a different thread identity' -e 'ThreadHistoryDetailOwner' codex-gui/src/features/threadHistory codex-gui/src/features/appShell codex-gui/src/features/projectionCoordination
```

从 `codex-gui` 核验 fnm 工具链与固化脚本：

```bash
/opt/homebrew/bin/fnm exec --using-file node --version
/opt/homebrew/bin/fnm exec --using-file pnpm --version
/opt/homebrew/bin/fnm exec --using-file which pnpm
/opt/homebrew/bin/fnm exec --using-file pnpm exec playwright install --list
rg -n -e '"ci"' -e '"format:oxfmt:fix"' -e '"test:unit"' -e '"test:browser:parallel"' package.json
```

要求：

- `pnpm` 不得解析到 `/Users/jiangsheng/.cache/codex-runtimes/`。
- fnm、pnpm、node_modules、本地 Vitest docs 或 Browser config 要求的 Chromium、Firefox、WebKit
  任一缺失时停止，由用户自行安装；助手不得安装。
- P0 必须把完整 dirty/untracked path 集合与 GUI formatter 的真实写集合 `codex-gui/**` 求交。
  P0 已在干净的 `a0e46f041` 基线上完成；三个 Task H 文件只要在 H1/H2/H3 前已经 dirty 或
  untracked 就是既有用户修改，必须停止。只有 H1/H2/H3 完成后的 F1 才允许这三个本轮产物存在。
  任何其他交集都必须在代码编辑和 formatter 之前停止，不能先格式化再恢复或覆盖用户文件。
- HEAD 漂移时重新核对 owner、页面消费、协议来源、相邻校验与测试入口；若结论或写集合改变，
  返回计划确认。

## 提交拓扑

```text
existing work-doc commit `a0e46f041`
  -> plan confirmation commit
  -> stable baseline snapshot
  -> Task H parallel edits
       -> formatter fan-in
       -> CI and Browser Mode verification ready-set + shared-cache serialization
       -> Task H behavior commit
       -> final commit audit
```

建议提交信息：

- existing work-doc：`docs(gui): design history detail response identity`
- plan confirmation：`docs(gui): confirm history detail response identity plan`
- Task H：`fix(gui): reject mismatched history thread reads`

任何针对已创建提交的修正都必须形成新的独立提交，禁止 amend。不得 squash，不得执行 Git 远程操作。

## 计划阶段独立审计修正

反向审计与漏并行审计确认功能写集合仍是三个 Task H 文件，并持续修正执行图问题：

1. H1/H2/H3 不再读取彼此的 mutable working-tree 输入；新增 H0 发布 D3 Git tree 中的稳定 blob
   snapshot，保留真实并行而不制造 owner read/write 冲突。
2. P0 与 F1 在 GUI formatter 运行前检查 M1 的完整宽写集合，并补齐 fnm、pnpm、node_modules、
   本地 Vitest docs 与三种 Playwright browser 的存在性检查；不能在 formatter 改写后才发现用户文件冲突。
3. V1/V2 没有独立 Vite `cacheDir`，因此共享 `node_modules/.vite` write lock。两者同时 ready，
   但实际串行获取资源；不再宣称并行运行。
4. P0 不再豁免尚未由本轮产生的 Task H dirty 文件；H0 和每个编辑节点写入前都比较实际目标文件
   与稳定 Git blob，防止并发漂移。V1/V2 还共同锁定 Browser tsbuildinfo。
5. 提交 `3d6c46100` 把 `just fmt` 触发条件收窄为 `scripts/format.py` 实际管理范围。当前计划只
   修改 GUI frontend 与 Markdown docs，因此删除仓库 formatter 节点及其 Rust/Python/buildifier 预检。
6. 执行前已创建 feature worktree，且 `a0e46f041` 已提交 design 与 plan；原 D1-D3 的未提交文档
   假设失效，因此 D1-D3 改为只记录并提交 plan confirmation，H0 依赖该新提交。

以上修正不改变设计语义或功能文件；提交拓扑仅按当前 Git 事实拆为既有 work-doc、plan
confirmation 与后续 behavior 三个提交。

## 可调度执行图

以下执行图是计划的权威结构。节点状态以计划确认后的首次调度为准。

### A0 — 计划授权

- `nodeId`：A0
- `status`：已完成。
- `taskBoundary`：无提交；授权门禁。
- `operationKind`：授权。
- `outcome`：用户明确确认本文件，授权精确 preflight、plan confirmation commit、Task H 修改、格式化、验证与本地提交。
- `estimatedCost`：低。
- `deferralEvidence`：无。
- `hardPredecessors`：无。
- `consumes`：本计划实际正文。
- `produces`：稳定的计划确认事实与确认原文。
- `completionEvidence`：用户于 2026-08-24 明确回复 `开始执行`。
- `readSet`：本计划。
- `writeSet`：无。
- `executionContext`：对话授权状态。
- `resourceLocks`：无。
- `owner`：用户。
- `verification`：确认对象必须是已落盘的本文件。
- `failureDomain`：未确认时全图等待，不视为失败。
- `replanTriggers`：用户修改目标、范围、验证、提交或 worktree 参数。
- `authorizationGate`：已满足。

### P0 — 只读 preflight

- `nodeId`：P0
- `status`：已完成。
- `taskBoundary`：无提交；实施前调查。
- `operationKind`：调查。
- `outcome`：核验 branch、HEAD、dirty scope、工具、脚本、权威边界和全部直接 consumer，输出可执行或漂移报告。
- `estimatedCost`：低。
- `deferralEvidence`：无。
- `hardPredecessors`：A0；实施动作只在计划确认后开始。
- `consumes`：确认计划与当前 workspace/Git/toolchain 状态。
- `produces`：preflight evidence snapshot。
- `completionEvidence`：预检命令成功，branch、dirty scope、工具和脚本约束满足。
- `readSet`：Git metadata、design/plan、`codex-gui/package.json`、目标源码/测试、本地 Vitest docs、格式化入口。
- `writeSet`：无。
- `executionContext`：feature worktree，独立 index 只读。
- `resourceLocks`：feature worktree/index read；toolchain path read。
- `owner`：主协调者。
- `verification`：逐条核验命令输出，不用旧 memory 或旧行号代替当前事实。
- `failureDomain`：P0 及全部后继暂停；不影响其他用户文件。
- `replanTriggers`：branch、write set、consumer、script、tool 或 docs 路径漂移。
- `authorizationGate`：A0；不授权安装、构建或远程 Git。已完成。

### D1 — 写入计划确认元数据

- `nodeId`：D1
- `taskBoundary`：DOCS。
- `operationKind`：编辑。
- `outcome`：计划状态改为“已确认”，写入确认日期与确认原文；design 保持已确认。
- `estimatedCost`：低。
- `deferralEvidence`：无。
- `hardPredecessors`：P0；等待当前基线与确认对象完成核验。
- `consumes`：A0 确认事实与 P0 evidence。
- `produces`：已确认状态的 plan。
- `completionEvidence`：plan header 与用户确认原文一致，diff 只含计划确认元数据及由当前 Git
  状态直接推出的执行事实校正。
- `readSet`：design、plan。
- `writeSet`：plan。
- `executionContext`：feature worktree，独立 index 未写。
- `resourceLocks`：plan file write。
- `owner`：DOCS Git owner。
- `verification`：scoped `git diff --check`。
- `failureDomain`：DOCS 及全部代码后继暂停。
- `replanTriggers`：确认原文改变范围或 plan 出现计划外 diff。
- `authorizationGate`：A0。

### D2 — scoped docs stage

- `nodeId`：D2
- `taskBoundary`：DOCS。
- `operationKind`：stage。
- `outcome`：Git index 恰好包含本次 plan confirmation，不含 design 或同日期的其他无关文档。
- `estimatedCost`：低。
- `deferralEvidence`：无。
- `hardPredecessors`：D1；等待已确认文档内容。
- `consumes`：已确认 plan diff。
- `produces`：plan-only staged snapshot。
- `completionEvidence`：cached name list 只含 plan 精确路径，`git diff --cached --check` 通过。
- `readSet`：本次 plan、Git index。
- `writeSet`：feature worktree 独立 Git index，仅 plan 路径。
- `executionContext`：feature worktree，独立 index 独占。
- `resourceLocks`：feature Git index write。
- `owner`：DOCS Git owner。
- `verification`：scoped `git add -- <plan>` 后审查 cached name/check/diff。
- `failureDomain`：D2、D3 与全部 Task H 后继暂停。
- `replanTriggers`：staged scope 不精确、ignored match 或用户内容混入。
- `authorizationGate`：A0 精确授权 plan confirmation commit。

### D3 — plan-only confirmation commit

- `nodeId`：D3
- `taskBoundary`：DOCS。
- `operationKind`：commit。
- `outcome`：创建独立本地 plan confirmation commit。
- `estimatedCost`：低。
- `deferralEvidence`：无。
- `hardPredecessors`：D2；等待稳定 staged snapshot。
- `consumes`：plan-only staged snapshot。
- `produces`：本地 commit `docs(gui): confirm history detail response identity plan`。
- `completionEvidence`：commit id，且 commit tree 只含本次 plan 路径。
- `readSet`：Git index、staged diff。
- `writeSet`：local Git objects/refs/index。
- `executionContext`：feature branch/index 独占。
- `resourceLocks`：feature Git index/ref write。
- `owner`：DOCS Git owner。
- `verification`：`git show --stat --oneline HEAD` 与 scoped status。
- `failureDomain`：所有 Task H 节点暂停；plan confirmation commit 门禁不得绕过。
- `replanTriggers`：hook 修改文件、提交失败、branch/HEAD 意外变化。
- `authorizationGate`：A0；只允许本地 commit，不允许远程。

### H0 — 发布稳定编辑基线

- `nodeId`：H0
- `taskBoundary`：无提交；Task H 只读准备。
- `operationKind`：调查。
- `outcome`：记录 D3 commit 中 owner、两个目标测试、页面 consumer、共享 fixture 与相邻身份检查的 Git blob identity，供并行编辑只读消费。
- `estimatedCost`：低。
- `deferralEvidence`：无。
- `hardPredecessors`：D3；快照必须引用 plan confirmation commit 后的稳定 Git tree。
- `consumes`：D3 commit identity 与目标文件列表。
- `produces`：带 commit/blob identity 的稳定 baseline snapshot。
- `completionEvidence`：每个输入均能从 D3 commit 读取，hash 与当前预期文件对应；三个实际目标
  working-tree 文件与对应 D3 blob 内容一致；snapshot 不引用 mutable working tree。
- `readSet`：D3 Git tree 中的 owner、page、两个测试、共享 fixture、相邻身份检查。
- `writeSet`：无。
- `executionContext`：feature worktree；只读 Git object database，不读取后续 mutable diff。
- `resourceLocks`：repository Git object database read。
- `owner`：主协调者。
- `verification`：用 `git rev-parse <commit>:<path>` 与 `git show <commit>:<path>` 核验稳定输入，
  并用 `git diff --quiet <commit> -- <three Task H paths>` 证明实际目标文件尚未漂移。
- `failureDomain`：H0 与全部 Task H 后继暂停。
- `replanTriggers`：目标路径不存在、blob 与 preflight 证据不一致或需要新增输入文件。
- `authorizationGate`：A0 + D3；只读。

### H1 — owner 身份门禁编辑

- `nodeId`：H1
- `taskBoundary`：Task H 行为提交。
- `operationKind`：编辑。
- `outcome`：owner 在 transcript 构建与 ready 发布前拒绝不同线程身份，并把错误交给现有 error 状态。
- `estimatedCost`：低。
- `deferralEvidence`：无。
- `hardPredecessors`：H0；相关工作文档必须先提交且稳定编辑基线已发布。
- `consumes`：已确认设计、H0 中的 owner 生命周期与相邻错误消息稳定快照。
- `produces`：production diff。
- `completionEvidence`：获得目标文件写锁后、首次写入前再次证明 owner 与 H0 blob 一致；检查位于
  `canSettle` 后和 transcript 构建前，且处于现有 `try/catch` 内。
- `readSet`：H0 的 owner、页面 consumer、相邻 startup/thread-switch 身份检查 Git blob snapshot；工作树中只访问自己的目标文件。
- `writeSet`：`threadHistoryDetailOwner.ts`。
- `executionContext`：feature worktree，独立 index 未写。
- `resourceLocks`：working-tree owner file write；H0 Git blobs read。
- `owner`：Task H production editor。
- `verification`：写入前运行目标文件相对 H0 commit 的 `git diff --quiet`；随后静态核对顺序、
  精确错误消息与无额外状态/interface。
- `failureDomain`：H1、F1 及其后继；H2/H3 可继续到自己的编辑完成点。
- `replanTriggers`：需要页面、gateway、协议、生成物或其他 production 文件。
- `authorizationGate`：A0 + D3，限 Task H。

### H2 — owner 单元测试编辑

- `nodeId`：H2
- `taskBoundary`：Task H 行为提交。
- `operationKind`：编辑。
- `outcome`：测试证明匹配保持 ready，mismatch 进入 error，Retry 仍请求原 ID 并可恢复。
- `estimatedCost`：低。
- `deferralEvidence`：无。
- `hardPredecessors`：H0；行为语义与基线测试上下文已经稳定，不依赖 H1 的 mutable diff。
- `consumes`：已确认设计、H0 中的 owner/test harness/shared fixture Git blob snapshot。
- `produces`：owner test diff。
- `completionEvidence`：获得目标文件写锁后、首次写入前再次证明 owner test 与 H0 blob 一致；
  完整状态与精确调用断言覆盖 mismatch 及恢复，不重建协议 DTO。
- `readSet`：H0 的 owner 与共享 projection builder Git blobs；工作树中只访问自己的 owner test 文件。
- `writeSet`：`threadHistoryDetailOwner.test.ts`。
- `executionContext`：feature worktree，独立 index 未写。
- `resourceLocks`：working-tree owner test file write；H0 Git blobs read。
- `owner`：Task H owner-test editor。
- `verification`：写入前运行目标文件相对 H0 commit 的 `git diff --quiet`；随后静态检查测试命名、
  全对象断言和 fixture 来源。
- `failureDomain`：H2、F1 及其后继；H1/H3 不暂停。
- `replanTriggers`：需要 test-only production helper 或新的 fixture 文件。
- `authorizationGate`：A0 + D3，限 Task H。

### H3 — Browser Mode 测试编辑

- `nodeId`：H3
- `taskBoundary`：Task H 行为提交。
- `operationKind`：编辑。
- `outcome`：Browser test 证明 mismatch 显示错误、错误线程内容和 Continue 不存在，Retry 后恢复匹配详情。
- `estimatedCost`：低。
- `deferralEvidence`：无。
- `hardPredecessors`：H0；页面语义、错误消息与测试基线已经稳定，不依赖 H1 mutable diff。
- `consumes`：已确认设计、H0 中的 page/owner/Browser harness Git blob snapshot、本地 Vitest locator/assertion 文档。
- `produces`：Browser Mode test diff。
- `completionEvidence`：获得目标文件写锁后、首次写入前再次证明 Browser test 与 H0 blob 一致；
  测试使用 `expect.element`，覆盖错误可见、错误内容不可见、Continue 不存在与恢复。
- `readSet`：H0 的 owner/page Git blobs、本地 Vitest docs；工作树中只访问自己的 Browser test 文件。
- `writeSet`：`ThreadHistoryDetailPage.browser.test.tsx`。
- `executionContext`：feature worktree，独立 index 未写。
- `resourceLocks`：working-tree Browser test file write；H0 Git blobs与本地 Vitest docs read。
- `owner`：Task H browser-test editor。
- `verification`：写入前运行目标文件相对 H0 commit 的 `git diff --quiet`；随后静态检查 locator、
  异步断言及无样式/截图断言。
- `failureDomain`：H3、F1 及其后继；H1/H2 不暂停。
- `replanTriggers`：需要页面结构、Lingui catalog、E2E 或共享 fixture 文件。
- `authorizationGate`：A0 + D3，限 Task H。

### F1 — Task H 编辑 fan-in

- `nodeId`：F1
- `taskBoundary`：Task H 行为提交。
- `operationKind`：fan-in。
- `outcome`：三个编辑产物组合后满足设计，diff 只覆盖 Task H 精确文件且无纯顺序调整。
- `estimatedCost`：低。
- `deferralEvidence`：无。
- `hardPredecessors`：H1、H2、H3；必须读取三者组合后的稳定工作树。
- `consumes`：production、owner test、Browser test diffs。
- `produces`：Task H combination review evidence。
- `completionEvidence`：scoped diff、`git diff --check` 与只读搜索均通过审查；再次核验完整
  formatter 写集合，除三个 Task H 文件外没有 dirty/untracked 交集。
- `readSet`：三个 Task H 文件及组合 diff。
- `writeSet`：无。
- `executionContext`：feature worktree/独立 index 只读。
- `resourceLocks`：Task H files read。
- `owner`：Task H Git owner。
- `verification`：审查身份检查顺序、错误路径、测试边界和文件范围；在 formatter 获取写锁前
  重复 P0 的完整 dirty-scope 交集检查。
- `failureDomain`：F1 及 formatter/verification/commit 后继暂停；具体失败只返回对应 H 节点修正。
- `replanTriggers`：组合后暴露 interface、范围或测试假设冲突。
- `authorizationGate`：A0 + D3。

### M1 — GUI 固化 formatter

- `nodeId`：M1
- `taskBoundary`：Task H 行为提交。
- `operationKind`：格式化。
- `outcome`：通过项目 `format:oxfmt:fix` 固化入口格式化 GUI，Task H 文件符合当前格式规则。
- `estimatedCost`：低。
- `deferralEvidence`：无。
- `hardPredecessors`：F1；formatter 必须读取完整组合 diff。
- `consumes`：Task H combination review evidence。
- `produces`：格式化后的 Task H diff 与 formatter exit status。
- `completionEvidence`：命令成功，检查后最终 diff 仍只含三个 Task H 文件。
- `readSet`：`codex-gui/**`、package scripts、formatter config。
- `writeSet`：`codex-gui/**`（formatter 扫描范围）；允许的最终持久 diff 仅三个 Task H 文件。
- `executionContext`：feature worktree，独立 index 未写。
- `resourceLocks`：feature worktree codex-gui formatter/config write；整个 `codex-gui` worktree write。
- `owner`：Task H formatter owner。
- `verification`：`/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt:fix` 后立即检查 name-only 与 diff。
- `failureDomain`：M1 及全部验证/commit 后继暂停；不得提交范围外 formatter diff。
- `replanTriggers`：formatter 修改 Task H 之外文件、工具链路径漂移或脚本消失。
- `authorizationGate`：A0 精确授权该项目入口；不授权安装。

### F2 — formatter 完成审查

- `nodeId`：F2
- `taskBoundary`：Task H 行为提交。
- `operationKind`：审查。
- `outcome`：GUI formatter 完成后，最终未暂存 diff 仍严格等于三个 Task H 文件。
- `estimatedCost`：低。
- `deferralEvidence`：无。
- `hardPredecessors`：M1；验证必须读取 formatter 完成后的稳定工作树。
- `consumes`：GUI formatter 产物与 exit status。
- `produces`：可验证 Task H snapshot。
- `completionEvidence`：name-only、diff check 与完整 diff 审查通过。
- `readSet`：整个 worktree status、三个 Task H 文件及 diff。
- `writeSet`：无。
- `executionContext`：feature worktree/独立 index 只读。
- `resourceLocks`：feature worktree read。
- `owner`：Task H Git owner。
- `verification`：`git status --short`、scoped name-only、`git diff --check`、完整 diff 审查。
- `failureDomain`：F2 及验证/commit 后继暂停。
- `replanTriggers`：任何范围外 diff、格式化改写行为语义或用户并发修改。
- `authorizationGate`：A0 + D3。

### V1 — GUI CI 验证

- `nodeId`：V1
- `taskBoundary`：Task H 行为提交。
- `operationKind`：验证。
- `outcome`：项目 `ci` 固化入口完成 validator check、format check、lint、type-check 与 unit tests。
- `estimatedCost`：中。
- `deferralEvidence`：无；与 V2 同时就绪，但共享 Vite/Vitest cache write lock，未获得锁的一侧保持就绪等待，不伪造依赖边。
- `hardPredecessors`：F2；必须验证 formatter 后稳定 snapshot。
- `consumes`：可验证 Task H snapshot、`codex-gui/package.json` scripts。
- `produces`：GUI CI exit status 与日志。
- `completionEvidence`：`/opt/homebrew/bin/fnm exec --using-file pnpm run ci` exit 0。
- `readSet`：`codex-gui/**`、node_modules、tool caches。
- `writeSet`：测试/工具临时缓存，不允许源码持久修改。
- `executionContext`：feature worktree；独立 Git index 只读。
- `resourceLocks`：feature worktree pnpm runner read；`codex-gui/node_modules/.vite` shared cache write；
  `codex-gui/node_modules/.tmp/tsconfig.vitest.browser.tsbuildinfo` shared write；lint/type-check/unit tool cache write。
- `owner`：Task H CI verifier。
- `verification`：只接受完整命令成功，不扩大豁免、忽略或基线。
- `failureDomain`：V1、F3 及 commit 后继暂停；V2 可继续。
- `replanTriggers`：失败要求计划外文件、依赖安装、基线修改或检查降级。
- `authorizationGate`：A0；前端验证已授权，不授权安装。

### V2 — 定向 Browser Mode 验证

- `nodeId`：V2
- `taskBoundary`：Task H 行为提交。
- `operationKind`：验证。
- `outcome`：history detail Browser Mode 测试在现有浏览器运行时通过。
- `estimatedCost`：中。
- `deferralEvidence`：无；与 V1 同时就绪，但两套 Vitest config 没有独立 `cacheDir`，未获得共享 cache write lock 的一侧保持就绪等待。
- `hardPredecessors`：F2；必须验证 formatter 后稳定 snapshot。
- `consumes`：可验证 Task H snapshot、parallel browser config、已有浏览器。
- `produces`：定向 Browser Mode exit status 与日志。
- `completionEvidence`：`/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:parallel -- src/features/threadHistory/__tests__/ThreadHistoryDetailPage.browser.test.tsx` exit 0。
- `readSet`：目标 Browser test、其 frontend dependencies、node_modules、browser binary。
- `writeSet`：Browser/Vitest 临时产物，不允许源码持久修改。
- `executionContext`：feature worktree；独立 Git index 只读。
- `resourceLocks`：feature worktree Vitest Browser/Playwright runner read；`codex-gui/node_modules/.vite` shared cache write；
  `codex-gui/node_modules/.tmp/tsconfig.vitest.browser.tsbuildinfo` shared write；browser profile/temp cache write。
- `owner`：Task H browser verifier。
- `verification`：使用 package 固化 script 和精确测试文件，不下载浏览器。
- `failureDomain`：V2、F3 及 commit 后继暂停；V1 可继续。
- `replanTriggers`：浏览器缺失、需要安装、测试暴露计划外页面/fixture 修改或 config 漂移。
- `authorizationGate`：A0；前端 Browser 验证已授权，不授权下载。

### F3 — 验证 fan-in 与最终审查

- `nodeId`：F3
- `taskBoundary`：Task H 行为提交。
- `operationKind`：审查。
- `outcome`：CI 与 Browser Mode 证据均成功，最终 diff 满足设计、范围和提交边界。
- `estimatedCost`：低。
- `deferralEvidence`：无。
- `hardPredecessors`：V1、V2；需要两类互补验证证据。
- `consumes`：CI、Browser Mode logs 与最终 diff。
- `produces`：可提交 Task H snapshot。
- `completionEvidence`：验证 exit 0；`git diff --check` 通过；name-only 仅三个 Task H 文件；无豁免、fallback 或纯重排。
- `readSet`：Task H files、完整 diff、验证日志、Git status。
- `writeSet`：无。
- `executionContext`：feature worktree/独立 index 只读。
- `resourceLocks`：feature worktree/index read。
- `owner`：Task H Git owner。
- `verification`：逐项核对设计完成标准和计划排除项。
- `failureDomain`：F3 及 stage/commit 后继暂停。
- `replanTriggers`：验证发现计划内问题时插入 scoped 修正节点；需要扩大范围则返回确认。
- `authorizationGate`：A0 + D3。

### S1 — scoped Task H stage

- `nodeId`：S1
- `taskBoundary`：Task H 行为提交。
- `operationKind`：stage。
- `outcome`：Git index 恰好包含三个 Task H 文件。
- `estimatedCost`：低。
- `deferralEvidence`：无。
- `hardPredecessors`：F3；只允许 stage 已验证 snapshot。
- `consumes`：可提交 Task H snapshot。
- `produces`：Task H staged snapshot。
- `completionEvidence`：cached name list 精确等于三个文件，cached diff check 与 diff 审查通过。
- `readSet`：三个 Task H 文件、Git index。
- `writeSet`：feature worktree 独立 Git index，仅三个 Task H 文件。
- `executionContext`：feature worktree，独立 index 独占。
- `resourceLocks`：feature Git index write。
- `owner`：Task H Git owner。
- `verification`：scoped `git add -- <three files>` 后检查 cached name/check/diff。
- `failureDomain`：S1、S2、Z1 暂停。
- `replanTriggers`：staged scope 漂移、用户修改混入或文件被 ignore。
- `authorizationGate`：A0 精确授权 Task H commit。

### S2 — Task H behavior commit

- `nodeId`：S2
- `taskBoundary`：Task H 行为提交。
- `operationKind`：commit。
- `outcome`：创建独立本地行为提交，不含纯顺序调整或其他文件。
- `estimatedCost`：低。
- `deferralEvidence`：无。
- `hardPredecessors`：S1；等待稳定 staged snapshot。
- `consumes`：Task H staged snapshot。
- `produces`：本地 commit `fix(gui): reject mismatched history thread reads`。
- `completionEvidence`：commit id，commit tree 只含三个 Task H 文件。
- `readSet`：Git index、cached diff。
- `writeSet`：local Git objects/refs/index。
- `executionContext`：feature branch/index 独占。
- `resourceLocks`：feature Git index/ref write。
- `owner`：Task H Git owner。
- `verification`：`git show --stat --oneline HEAD` 与 scoped status。
- `failureDomain`：S2、Z1 暂停；不得 amend work-doc 或 plan confirmation commit。
- `replanTriggers`：commit hook 修改文件、提交失败或 branch/HEAD 意外变化。
- `authorizationGate`：A0；只允许本地 commit，不允许远程。

### Z1 — 最终提交审计

- `nodeId`：Z1
- `taskBoundary`：无新提交；最终汇合。
- `operationKind`：审查。
- `outcome`：既有 work-doc、plan confirmation 与 Task H behavior 三个提交边界、验证证据和剩余工作树状态均可解释，任务完成。
- `estimatedCost`：低。
- `deferralEvidence`：无。
- `hardPredecessors`：S2；必须审计最终提交状态。
- `consumes`：work-doc commit、plan confirmation commit、Task H behavior commit、验证日志、Git status。
- `produces`：最终交付证据与未触碰用户文件清单。
- `completionEvidence`：三个 commit id；Task H 完成标准全部满足；无计划内未提交 diff；其他用户文件保持原状态。
- `readSet`：Git log/show/status、三个提交、design/plan、Task H files。
- `writeSet`：无。
- `executionContext`：feature worktree/独立 index 只读。
- `resourceLocks`：feature Git refs/index/worktree read。
- `owner`：主协调者。
- `verification`：比较提交文件列表、最终 status 与计划初始用户变更基线。
- `failureDomain`：Z1 失败只阻止完成声明；若需修正已提交代码，插入新的独立修正提交节点。
- `replanTriggers`：发现范围外提交、验证证据失效或用户并发修改与计划文件重叠。
- `authorizationGate`：A0。

## 初始 ready set、关键路径与汇合点

执行开始时 A0 已由用户原文 `开始执行` 满足，P0 已在干净的 feature worktree 基线上完成；当前
ready set 为 D1。

```text
A0 -> P0 -> D1 -> D2 -> D3
                         -> H0 -> H1 -|
                               |-> H2 -|-> F1 -> M1 -> F2 -> V1 -|
                               |-> H3 -|                  V2 -|-> F3 -> S1 -> S2 -> Z1
```

关键路径粗略为 DOCS 门禁 → 三个 Task H 编辑中耗时最长者 → GUI formatter → V1 与 V2 的共享缓存
串行等待 → stage/commit/audit。

硬串行依据：

- D3 等待 D2 的精确 staged snapshot；H0 等待 plan confirmation commit 并发布稳定 Git blob 输入，所有代码编辑等待 H0。
- F1 等待三个不相交编辑产物汇合；formatter 必须读取完整组合 diff。
- F2 等待 GUI formatter 释放写锁；验证只能读取 formatter 后稳定 snapshot。
- V1 与 V2 同时进入 ready set，但共享 `codex-gui/node_modules/.vite` write lock，同一时刻只能有一侧运行；这不是 DAG 依赖。
- F3 等待 CI 与 Browser Mode 两类互补证据；stage 只能消费验证后的 snapshot。
- commit 等待 staged snapshot；最终审计等待 commit identity。

没有其他串行边。H1/H2/H3 在其共同前置完成后必须立即并行调度。V1/V2 同时就绪，
调度器先运行获得共享 cache write lock 的一侧，锁释放后立即运行另一侧，不制造伪硬依赖。

## 失败与修正

- 某个编辑节点失败只暂停 F1 及后继，其他编辑节点继续完成。
- M1 失败只暂停其后继；V1/V2 的一侧失败后释放共享 cache lock，另一侧仍按原授权运行，
  以保留独立失败证据。
- 已确认范围内由本次改动引入的格式、lint、类型或测试失败，插入写集合精确的修正节点，重新运行
  受影响验证，再进入 stage；不得扩大豁免、忽略、断言放宽或基线修改。
- 修正需要修改三个 Task H 文件之外的文件、改变错误语义、协议或页面结构时，停止并返回计划确认。
- 若问题只在提交后发现，修正必须创建新的独立提交，禁止 amend。

## 完成标准

1. mismatch 响应只能进入现有 error，不能构建或发布 ready transcript。
2. matching 响应的现有 ready 行为保持不变。
3. Retry 仍读取原 route thread ID，并能在匹配响应后恢复。
4. Browser Mode 证明错误线程内容与 Continue 不可见。
5. 协议、生成链、gateway、页面结构、Lingui 和 live thread 生命周期没有修改。
6. 既有 work-doc、plan confirmation 与 Task H behavior 分别形成三个独立本地提交，验证全部成功，
   其他无关文件未被暂存或修改。
