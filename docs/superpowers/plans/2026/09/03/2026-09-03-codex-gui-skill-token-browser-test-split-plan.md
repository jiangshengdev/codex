# Codex GUI Skill Token Browser 大测试拆分实施计划

> 日期：2026-09-03
> 状态：已确认，工作树已预配，待文档提交后执行
> 设计：[`2026-09-03-codex-gui-skill-token-browser-test-split-design.md`](../../../../specs/2026/09/03/2026-09-03-codex-gui-skill-token-browser-test-split-design.md)
> 计划基线：`968cbf2661c1fab19ea9f88263c05bf73f36065a`

## 目标与范围

在
`codex-gui/src/features/composerEditor/__tests__/ComposerEditorSkillTokenPresentation.browser.test.tsx`
内，把当前聚合 collision、delete、undo/redo 与 draft restore 的单个 Browser 测试拆成 3 个独立测试，
保留原 9 轮完整 Tooltip checkpoint 和全部状态、安全披露、invalid、selection 断言。

本计划只有一个 test-only 实现任务。不修改生产代码、Browser 配置、timeout、并发、sequential
分区或其他慢测试；全部工作在独立 worktree
`/Users/jiangsheng/cnb/codex/.worktrees/gui-skill-token-test-split` 的
`codex/gui-skill-token-test-split` branch 上完成，不执行 Git remote 操作。

## 当前事实与权威入口

- base 为 `dev` 的 `968cbf2661c1fab19ea9f88263c05bf73f36065a`，计划基线与设计基线一致。
- feature worktree 已由用户直接授权预配，路径为
  `/Users/jiangsheng/cnb/codex/.worktrees/gui-skill-token-test-split`，branch 为
  `codex/gui-skill-token-test-split`，拥有独立 index
  `/Users/jiangsheng/cnb/codex/.git/worktrees/gui-skill-token-test-split/index`。
- feature worktree 的固定 sparse control plane、依赖 links 与状态已核验；不得因目标路径和 branch
  已存在而重跑创建脚本。
- 主 checkout `/Users/jiangsheng/cnb/codex` 保持在 `dev`；其中本设计与本计划的两份未跟踪原文副本
  属于范围外既有状态，必须原样保留，不得清理、恢复、stage 或提交。
- `.worktrees/vitest` 请求路径及 direct target 均为 `/Users/jiangsheng/cnb/vitest`，fully resolved
  physical target 为 `/Users/jiangsheng/GitHub/vitest`。
- `codex-gui/package.json` 是 frontend 命令 owner；必须从
  `/Users/jiangsheng/cnb/codex/.worktrees/gui-skill-token-test-split/codex-gui` 运行 fnm-backed pnpm。
- parallel 配置收集 `src/**/*.browser.test.ts(x)`，排除
  `src/__tests__/sequential/**`，并在 Chromium、Firefox、WebKit 三个 headless instance 中运行。
- sequential 配置只收集 `src/__tests__/sequential/**` 且 `fileParallelism: false`；目标文件不属于
  sequential，但完整 sequential 仍作为回归证据。
- 目标文件当前有 5 个源码测试；将 1 个替换为 3 个后应有 7 个，focused 三浏览器必须收集并通过
  `21/21`。
- frontend 目标不受仓库级 `just fmt` 管理；格式、lint 与类型检查分别使用
  `format:oxfmt`、`lint`、`type-check`。

统一执行预检：

```bash
/opt/homebrew/bin/fnm env --shell zsh
/opt/homebrew/bin/fnm exec --using-file pnpm --version
```

若 pnpm 解析到 Codex runtime shim、必要浏览器或依赖缺失，暂停依赖该输入的节点并报告；禁止安装、
升级或下载任何组件。

## 提交边界

两个独立本地提交都在 feature branch 上形成：

1. `DOC`：只包含 feature worktree 中的本设计文档与本计划文档，提交信息
   `docs: plan skill token browser test split`。
2. `TEST_SPLIT`：只包含 feature worktree 中的目标 Browser 测试文件，提交信息
   `test(gui): split skill token browser coverage`。

两个提交只写 feature worktree 的独立 index 与 `refs/heads/codex/gui-skill-token-test-split`；禁止写
`refs/heads/dev`，禁止 amend、squash、合并任务提交或 stage 范围外文件。

## 描述式执行 DAG

### `WT-PREP`

- `nodeId`: `WT-PREP`
- `taskBoundary`: 工作树预配，无提交
- `operationKind`: preparation
- `outcome`: 创建并核验目标 sparse worktree、独立 branch/index、固定 control plane 与本地 links。
- `estimatedCost`: 低
- `deferralEvidence`: 无。
- `hardPredecessors`: 无；它是历史初始 ready set，现已完成。
- `consumes`: 用户直接要求“新建工作树，在工作树进行”、base `dev`、目标路径/branch 与已预检 links。
- `produces`: worktree 路径、feature ref、独立 index、sparse list、links 和干净 status 的稳定证据。
- `completionEvidence`: 目标路径、branch、HEAD、sparse list、固定 control plane 可读性、links 与 status
  均已核验；现有目标不得重跑创建脚本覆盖。
- `readSet`: base tree、worktree root、固定 sparse paths 与 link sources。
- `writeSet`: 目标 worktree、Git worktree metadata、feature ref 与 worktree 内 links。
- `stateEffects`: 新建独立 sparse worktree、branch/index 与 links；不改变主 checkout 文件或 `dev` ref。
- `commandScope`: 已执行 repository-owned worktree script及其只读核验；当前不得重跑。
- `subdelegation`: 禁止。
- `executionContext`: 主 repo 只提供 committed base；产物是 feature worktree/branch/独立 index。
- `resourceLocks`: 目标 worktree 路径、Git worktree metadata、feature ref，write；`dev` ref 只读。
- `owner`: worktree 预配 owner。
- `verification`: worktree list、HEAD、branch、sparse list、links 与 status。
- `failureDomain`: `DOC-MATERIALIZE`、`DOC-COMMIT` 及全部实现后继。
- `replanTriggers`: worktree、branch、base、sparse inputs 或 link mapping 失真。
- `authorizationGate`: 用户当前直接授权，已完成。

### `DOC-MATERIALIZE`

- `nodeId`: `DOC-MATERIALIZE`
- `taskBoundary`: `DOC`
- `operationKind`: edit
- `outcome`: 在 feature worktree 落盘已确认设计与忠实更新 worktree 执行上下文的计划；主副本不变。
- `estimatedCost`: 低
- `deferralEvidence`: 无。
- `hardPredecessors`: `WT-PREP`；等待 feature worktree 稳定产物。
- `consumes`: 主 checkout 两份未跟踪原文的只读内容、已确认设计/计划及用户新增执行上下文。
- `produces`: feature worktree 内两份未跟踪工作文档。
- `completionEvidence`: 设计语义不变；计划完整反映 feature worktree/index/ref/cwd；主两份原件未变化。
- `readSet`: 主 checkout 两份未跟踪原件。
- `writeSet`: 仅 feature worktree 两份文档。
- `stateEffects`: 在 feature worktree 创建两份未跟踪文档。
- `commandScope`: 只读查看原件并以 `apply_patch` 创建 feature 文档。
- `subdelegation`: 禁止。
- `executionContext`: feature worktree、feature branch、独立 index（不写 index）。
- `resourceLocks`: feature 两份文档 write；主两份原件 read。
- `owner`: DOC 文档 owner。
- `verification`: `git diff --check` 与主/feature 双 checkout status 核验。
- `failureDomain`: `DOC-COMMIT` 及全部实现节点。
- `replanTriggers`: 设计语义漂移、写入范围扩大或主原件变化。
- `authorizationGate`: 已确认文档落盘及当前 worktree 指令，active。

### `DOC-COMMIT`

- `nodeId`: `DOC-COMMIT`
- `taskBoundary`: `DOC`
- `operationKind`: commit
- `outcome`: feature worktree 的已确认设计与计划形成独立本地文档提交；成功前不开始实现编辑。
- `estimatedCost`: 低
- `deferralEvidence`: 无；它是实施硬门禁。
- `hardPredecessors`: `DOC-MATERIALIZE`；等待两份 feature 文档稳定落盘。
- `consumes`: feature worktree 两份文档及独立 index。
- `produces`: feature branch 文档提交 SHA 与干净独立 index。
- `completionEvidence`: feature HEAD 只列两份文档且 message 精确；`dev` ref 未改变。
- `readSet`: feature 两份文档、feature status/index；主原件与 `dev` ref 只读核验。
- `writeSet`: feature 独立 index、`refs/heads/codex/gui-skill-token-test-split`、object store。
- `stateEffects`: 精确 stage feature 两份文档并创建一个本地提交。
- `commandScope`: 在 feature worktree 根运行 `git status --short`、`git diff --check`、精确
  `git add -- <design> <plan>`、`git diff --cached --check`、staged allowlist、
  `git commit -m 'docs: plan skill token browser test split'` 与只读核验。
- `subdelegation`: 禁止。
- `executionContext`: feature worktree、feature branch、独立 index；独占 Git 写入。
- `resourceLocks`: feature index、feature ref、object store，write。
- `owner`: DOC 唯一 Git owner。
- `verification`: staged snapshot 只有两份 feature 文档；feature HEAD/commit tree 与 `dev` ref 核验。
- `failureDomain`: 阻塞全部实现节点；文档不能提交时不得绕过。
- `replanTriggers`: feature identity/基线漂移、范围外 staged 内容、需要 force/remote。
- `authorizationGate`: 用户确认计划落盘与 worktree 执行，active。

### `TEST-EDIT`

- `nodeId`: `TEST-EDIT`
- `taskBoundary`: `TEST_SPLIT`
- `operationKind`: edit
- `outcome`: 在同一文件内形成 3 个独立测试与文件私有 helper，原 9 轮 Tooltip checkpoint 完整保留。
- `estimatedCost`: 中
- `deferralEvidence`: 无。
- `hardPredecessors`: `DOC-COMMIT`；等待文档提交 SHA 这一实施门禁产物。
- `consumes`: 已确认设计、文档提交、现有 fixture/controller/catalog/history Interface。
- `produces`: 只修改目标测试文件的稳定源码 diff。
- `completionEvidence`: 源码中有 7 个 test；新测试分别拥有 delete、undo/redo、draft restore；
  Tooltip helper 共被 9 个 checkpoint 调用；无 `.only`、timeout override 或跳过。
- `readSet`: feature worktree 目标测试文件及其既有直接 test support。
- `writeSet`: 仅 feature worktree 目标测试文件。
- `stateEffects`: 修改一个 tracked test file；不操作 Git index。
- `commandScope`: 只读搜索与查看；普通源码编辑使用 `apply_patch`。
- `subdelegation`: 禁止。
- `executionContext`: feature worktree、feature branch、独立 index（不写 index）。
- `resourceLocks`: feature 目标测试文件，write。
- `owner`: TEST_SPLIT 编辑 owner。
- `verification`: 审查完整 diff，逐项映射原状态与断言，确认未修改生产行为或配置。
- `failureDomain`: 只暂停读取该 diff 的格式、Browser、静态检查和提交节点。
- `replanTriggers`: 需要修改共享 support、生产代码、配置、timeout、并发或第二个测试文件。
- `authorizationGate`: 已确认计划实现，active；能力只覆盖目标测试文件。

### `FORMAT-CHECK`

- `nodeId`: `FORMAT-CHECK`
- `taskBoundary`: `TEST_SPLIT`
- `operationKind`: verification
- `outcome`: 权威 Oxfmt check 接受 TEST-EDIT 快照。
- `estimatedCost`: 低
- `deferralEvidence`: 无。
- `hardPredecessors`: `TEST-EDIT`。
- `consumes`: TEST-EDIT diff 与 live formatter config。
- `produces`: formatter check 证据。
- `completionEvidence`: `pnpm run format:oxfmt` 退出 0。
- `readSet`: feature frontend formatter 输入与目标源码；`writeSet`: 无主动源码写入。
- `stateEffects`: check 的正常内部缓存/日志。
- `commandScope`: fnm-backed `pnpm run format:oxfmt`；禁止用 fix 伪装验证。
- `subdelegation`: 禁止。
- `executionContext`: feature worktree，cwd=`/Users/jiangsheng/cnb/codex/.worktrees/gui-skill-token-test-split/codex-gui`。
- `resourceLocks`: frontend formatter runner read；稳定源码 read。
- `owner`: 格式验证 owner。
- `verification`: 退出 0；若仅目标文件不合格式，先核对 change list 后用权威 fix 并重新检查。
- `failureDomain`: Browser、静态检查和 commit 后继。
- `replanTriggers`: formatter 命中范围外 tracked 文件或入口漂移。
- `authorizationGate`: 已确认计划内验证；条件式 fix 只覆盖目标文件，active。

### `FOCUSED-BROWSER`

- `nodeId`: `FOCUSED-BROWSER`; `taskBoundary`: `TEST_SPLIT`; `operationKind`: verification
- `outcome`: 三浏览器证明三个行为测试完整收集、通过且各自低于 15 秒。
- `estimatedCost`: 中；`deferralEvidence`: 无。
- `hardPredecessors`: `FORMAT-CHECK`。
- `consumes`: 目标测试、parallel/shared config、Browser fixture 与生产组件。
- `produces`: focused `21/21` 与逐测试耗时证据。
- `completionEvidence`: 三 instance 各 7 tests，总计 `21/21`；三个新测试均 `<15000ms`；无 timeout、
  unhandled error 或零收集。
- `readSet`: feature focused 测试及传递输入；`writeSet`: 无主动源码写入。
- `stateEffects`: Browser runner 正常缓存、日志与进程状态。
- `commandScope`: fnm-backed `pnpm run test:browser:parallel --run src/features/composerEditor/__tests__/ComposerEditorSkillTokenPresentation.browser.test.tsx`。
- `subdelegation`: 禁止。
- `executionContext`: feature worktree，frontend cwd，headless。
- `resourceLocks`: Vitest/Playwright Browser runner write；timing-sensitive verification capacity exclusive。
- `owner`: Browser 验证 owner；`verification`: 核验三 instances、count 与耗时。
- `failureDomain`: FULL-PARALLEL 与 TEST_SPLIT commit。
- `replanTriggers`: 需要生产、timeout、并发、sequential 或范围外修改。
- `authorizationGate`: 已确认无头 Level 1，active。

### `FULL-PARALLEL`

- `nodeId`: `FULL-PARALLEL`; `taskBoundary`: `TEST_SPLIT`; `operationKind`: verification
- `outcome`: 原失败的完整三浏览器并发环境不再出现目标超时或其他回归。
- `estimatedCost`: 高
- `deferralEvidence`: focused 完成前暂缓；focused 以更低成本直接验证唯一改动，且共享 runner；
  触发点为 focused `21/21`，focused 不再覆盖目标时失效。
- `hardPredecessors`: `FORMAT-CHECK`；无伪造 focused 数据依赖。
- `consumes`: 格式已接受的 feature 源码与完整 parallel collection。
- `produces`: full parallel 证据；当前基线预期 `924/924`。
- `completionEvidence`: 三浏览器非零收集、退出 0，目标三个测试仍各 `<15000ms`。
- `readSet`: feature 完整 parallel 输入；`writeSet`: 无主动源码写入。
- `stateEffects`: Browser runner 正常缓存、日志与进程状态。
- `commandScope`: fnm-backed `pnpm run test:browser:parallel`。
- `subdelegation`: 禁止。
- `executionContext`: feature worktree，frontend cwd，headless。
- `resourceLocks`: Browser runner write；timing-sensitive capacity exclusive。
- `owner`: Browser 验证 owner；`verification`: 退出、collection、三浏览器命中与目标耗时。
- `failureDomain`: TEST_SPLIT commit；计划内失败动态闭环。
- `replanTriggers`: 需要计划外文件、降低检查或改变产品结果。
- `authorizationGate`: 已确认无头 Level 1，active。

### `FULL-SEQUENTIAL`

- `nodeId`: `FULL-SEQUENTIAL`; `taskBoundary`: `TEST_SPLIT`; `operationKind`: verification
- `outcome`: sequential Browser suite 在同一 feature 源码快照继续通过。
- `estimatedCost`: 中
- `deferralEvidence`: 仅因与 Browser 节点共享 canonical runner 互斥等待，不形成硬依赖。
- `hardPredecessors`: `FORMAT-CHECK`。
- `consumes`: 格式已接受的 feature 源码与 sequential collection。
- `produces`: full sequential 证据；当前基线预期 `30/30`。
- `completionEvidence`: 三 instance 非零收集并退出 0。
- `readSet`: feature sequential 输入及传递生产依赖；`writeSet`: 无主动源码写入。
- `stateEffects`: Browser runner 正常缓存、日志与进程状态。
- `commandScope`: fnm-backed `pnpm run test:browser:sequential`。
- `subdelegation`: 禁止。
- `executionContext`: feature worktree，frontend cwd，headless。
- `resourceLocks`: Browser runner write；timing-sensitive capacity exclusive。
- `owner`: Browser 验证 owner；`verification`: 退出、非零 collection 与三 instances。
- `failureDomain`: TEST_SPLIT commit；只闭环本次引入的问题。
- `replanTriggers`: 需要修改 sequential 测试或配置。
- `authorizationGate`: 已确认无头 Level 1，active。

### `STATIC-CHECKS`

- `nodeId`: `STATIC-CHECKS`; `taskBoundary`: `TEST_SPLIT`; `operationKind`: verification
- `outcome`: Oxfmt、Oxc/ESLint 与 TypeScript 在 feature 最终源码快照全部通过。
- `estimatedCost`: 中
- `deferralEvidence`: timing-sensitive Browser 运行期间暂缓，避免 CPU/IO 争用污染 15 秒耗时证据；
  Browser 释放后立即启动，Browser 不再承担耗时验收时失效。
- `hardPredecessors`: `FORMAT-CHECK`。
- `consumes`: 同一 feature 源码快照与 package config。
- `produces`: format、lint、type-check 三项证据。
- `completionEvidence`: 三条权威 package script 均退出 0。
- `readSet`: feature formatter/lint/TypeScript 输入；`writeSet`: 无主动源码写入。
- `stateEffects`: 各检查器正常缓存与日志。
- `commandScope`: fnm-backed `pnpm run format:oxfmt`、`pnpm run lint`、`pnpm run type-check`；
  三个无源码写入子节点可并行。
- `subdelegation`: 禁止。
- `executionContext`: feature worktree，frontend cwd。
- `resourceLocks`: 稳定源码 read；formatter/lint/TypeScript runner 各自独立。
- `owner`: 三个静态验证 owner，由主协调者 fan-in。
- `verification`: 三项分别记录，任一失败不能被其他成功覆盖。
- `failureDomain`: TEST_SPLIT commit；只修正本次引入的问题。
- `replanTriggers`: 需要计划外语义修改、关闭检查或扩大豁免。
- `authorizationGate`: 已确认计划内静态验证，active。

### `TEST-FAN-IN-AND-COMMIT`

- `nodeId`: `TEST-FAN-IN-AND-COMMIT`
- `taskBoundary`: `TEST_SPLIT`
- `operationKind`: commit
- `outcome`: 全部组合验证成立后，只把 feature 目标测试文件形成独立 test-only commit。
- `estimatedCost`: 低；`deferralEvidence`: 无。
- `hardPredecessors`: `FOCUSED-BROWSER`、`FULL-PARALLEL`、`FULL-SEQUENTIAL`、`STATIC-CHECKS`。
- `consumes`: 全部验证证据与 feature 目标文件最终 diff。
- `produces`: TEST_SPLIT SHA、干净 feature index 与可审计 snapshot。
- `completionEvidence`: staged diff 只有目标文件；cached check 通过；message 精确；feature HEAD 只列目标；
  `dev` ref 未改变。
- `readSet`: feature diff/status/index 与验证证据；主 `dev` ref 只读。
- `writeSet`: feature index、feature ref、object store。
- `stateEffects`: 精确 stage feature 目标文件并创建本地 commit。
- `commandScope`: 在 feature root 运行只读 status/diff、精确 `git add -- <target>`、cached check/diff、
  `git commit -m 'test(gui): split skill token browser coverage'` 与只读核验。
- `subdelegation`: 禁止。
- `executionContext`: feature worktree、feature branch、独立 index；独占 Git 写入。
- `resourceLocks`: feature index、feature ref、object store，write。
- `owner`: TEST_SPLIT 唯一 Git owner。
- `verification`: commit tree 与已验证快照一致；feature 无额外 staged/tracked 修改；`dev` ref 不变。
- `failureDomain`: FINAL-AUDIT；提交后修正必须新建独立 commit，禁止 amend。
- `replanTriggers`: staged 范围外、feature identity/基线漂移、需要 force/remote。
- `authorizationGate`: 已确认计划实现及本地 task commit，active。

### `FINAL-AUDIT`

- `nodeId`: `FINAL-AUDIT`; `taskBoundary`: 无提交，fan-in 审计; `operationKind`: fan-in
- `outcome`: feature 的两个提交、验证、范围及主 checkout 保护状态全部满足后结束。
- `estimatedCost`: 低；`deferralEvidence`: 无。
- `hardPredecessors`: `TEST-FAN-IN-AND-COMMIT`。
- `consumes`: 两个 feature commits、验证记录、feature 与主 checkout 最终状态。
- `produces`: 完成报告。
- `completionEvidence`: feature 提交边界正确、index 干净且无范围外 tracked/staged 修改；HEAD、counts、
  timings 已记录；主 `dev` ref 仍为基线、index 为空、两份未跟踪原文副本仍存在且未被清理；无 remote
  或可见桌面动作。
- `readSet`: feature commits/status、验证摘要、主 status/ref 与两份原件；`writeSet`: 无。
- `stateEffects`: 仅用户报告。
- `commandScope`: 对 feature 和主 checkout 分别运行只读 `git log/show/status/diff`。
- `subdelegation`: 禁止。
- `executionContext`: feature worktree；主 checkout 仅只读审计。
- `resourceLocks`: feature 与主 Git metadata read；主两份原件 read。
- `owner`: 主协调者；`verification`: 逐项核对，口头完成不替代证据。
- `failureDomain`: 未满足项保持未完成，按执行图继续安全路径。
- `replanTriggers`: 目标、范围、授权、安全或 checkout 身份实质变化。
- `authorizationGate`: 已确认计划内最终只读审计，active。

## 调度、关键路径与反向审计

- 历史初始 ready set 为 `WT-PREP`；它已完成。`DOC-MATERIALIZE` 随即完成，当前只有
  `DOC-COMMIT` ready；文档 commit 成功后 `TEST-EDIT` 才能开始。
- `TEST-EDIT → FORMAT-CHECK` 是源码快照依赖；formatter 通过后 Browser 与静态检查 ready。
- `FOCUSED-BROWSER` 优先获得 timing-sensitive runner；`FULL-PARALLEL` 在 focused 前用完整
  `deferralEvidence` 暂缓。三个 Browser 节点共享 runner/capacity，因资源锁互斥运行但无伪造数据依赖。
- Browser 释放 timing-sensitive capacity 后，STATIC-CHECKS 的三个只读检查并行运行。
- `TEST-FAN-IN-AND-COMMIT` 等待全部组合验证；`FINAL-AUDIT` 等待测试提交。
- 关键路径：worktree 预配 → 文档落盘/提交 → 测试编辑 → formatter → focused → full parallel →
  其余互斥 Browser → static fan-in → 测试提交 → 最终审计。
- 独立 worktree 是用户直接指定的执行上下文，隔离 feature index/ref 与主 `dev` 未跟踪原件；隔离本身
  不构成实现任务之间的伪依赖。
- 不把三个新测试拆成三个提交：它们共同消费文件私有 setup/Tooltip helper 并写同一物理文件。

## 失败吸收与完成条件

- 任一节点失败首先作为新证据，只暂停读取其无效产物的后继；仍有安全、已授权且能产生新证据的
  节点继续。
- 本次直接引入的格式、lint、类型或测试问题在计划范围内诊断、修正并重跑受影响验证；若修正发生
  在 TEST_SPLIT 提交后，必须形成新独立提交，禁止 amend。
- 不通过提高 timeout、降低并发、移动 sequential、删除断言、减少浏览器、放宽检查或修改基线闭环。
- 预存或无关失败只证据化区分并汇报，不纳入修复。
- 任何失败处理均不得清理、移动、恢复、stage 或提交主 `dev` 的两份未跟踪原件；worktree 预配证据
  失效时只暂停 feature 后继，不得回退到主 `dev` 实现。
- 只有 WT-PREP、DOC、TEST_SPLIT、全部 Level 1 验证和 FINAL-AUDIT 均完成时，本计划才完成。
- Level 2 与 Level 3 不适用；不启动可见浏览器、DevTools 或桌面窗口。
