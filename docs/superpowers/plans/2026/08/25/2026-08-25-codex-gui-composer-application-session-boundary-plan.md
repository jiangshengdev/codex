# Codex GUI Composer 应用会话边界实施计划

计划日期：2026-08-25

计划状态：已确认

确认日期：2026-08-25

确认原文：确认计划，开始实施

对应已确认设计：

- `docs/superpowers/specs/2026/08/25/2026-08-25-codex-gui-composer-application-session-boundary-design.md`

关联 issue：

- `docs/superpowers/issues/2026/08/24/2026-08-24-01-codex-gui-current-code-problems/2026-08-24-06-composer-react-domain-state-machine.md`

计划分支：`dev`

计划时 HEAD：`097ddb6a7627191784619513676f1e67ce9b2e5c`

## 目标

按已确认设计把 pending-input 管理会话与 Send、Guide、Recover、Stop 的应用编排从 React 展示生命周期中
收进两个 feature-private 深 Module：`ComposerPendingInputSession` 与 `ComposerTurnApplication`。React 最终只负责
订阅、HeroUI presence、Lingui 文案、Lexical/editor attachment、DOM ref、ARIA 与语义焦点 effect；现有用户行为、
session/revision gate、queue/reservation 权威边界和即时拒绝的静默语义全部保持不变。

## 当前基线与为什么需要修改

计划编写时：

- 当前分支为 `dev`，HEAD 为 `097ddb6a7627191784619513676f1e67ce9b2e5c`；
- 工作树只有本次已确认 design 文档和本计划文档为未跟踪/未提交工作文档；
- `CurrentTaskPage.tsx` 是 `ComposerTurnControl` 唯一生产直接消费者；
- `ActiveThreadSessionSnapshot` 已统一提供稳定 `composerRole`、revision、queue、skill 与 active-turn facts，Redux
  只为 context usage 展示提供 read model；
- `ComposerInputQueueCoordinator` 已经拥有 queue、reservation、revision、delivery 和 recovery 事务；
- `ComposerEditorController` 已经拥有 draft/capture/controller identity，无需新增 editor adapter；
- `ComposerTurnControl.tsx` 仍直接拥有同步 submit latch、capture/result 分类、accepted-only clear 与 microtask
  解锁；
- `ComposerPendingInputDrawer.tsx` 仍直接拥有 opened owner、closing session、preparation、reservation、completion
  hold、outcome identity、move refresh suppression、结果分类与焦点时序；
- `ComposerPendingInputRegion.tsx` 仍以 React state 单独拥有 Drawer presence；
- `SkillTypeaheadPlugin.tsx` 的 Lexical root、composition、MutationObserver 与 ARIA 同步是合法平台 adapter，不是
  本次迁移对象。

当前代码证明这些改动是必要的：

1. pending-input 正确性目前必须同时推理 render-time 投影、effect、HeroUI presence、reservation callback 和 DOM
   focus；只移动 handler 或拆组件不能消除根因。
2. submit 的正确性依赖精确 controller/capture identity、同步重入锁和 generation-safe microtask；纯布尔投影函数
   不能独立证明这条临界区。
3. owner replacement 与普通 revision 推进语义不同，必须由跨 render 存活的应用 session 统一解释；React state
   拼装容易把同 owner revision 误当成 session replacement。
4. projection unavailable 在编辑与只读浏览下行为不同；若只用组件卸载或统一 disabled 状态，会隐藏既有
   reservation 与只读详情约束。

## 技术判断

### 两个 Module，不建立 Composer 大状态机

- `composerPendingInputSession.ts` 拥有 Drawer 应用会话、同步 `project(currentFacts)`、preparation/reservation
  coordination、completion hold、结果分类和语义 effect。
- `composerTurnApplication.ts` 拥有 control view projection、submit/recover/stop command 临界区、精确 capture
  identity 与 generation-safe unlock。
- 两者生命周期和失败域不同，保持独立；React presenter 组合它们，但不复制内部状态。

### 直接复用既有权威 seam

- command 继续只经 `ActiveThreadComposerRole`；
- queue facts 继续来自 `ComposerInputQueueCoordinatorSnapshot`；
- draft/capture/controller 继续由 `ComposerEditorController` 提供；
- skill validity 继续复用当前 catalog 与纯投影；
- `composerPendingInputPages.ts` 与 `composerTurnControlModel.ts` 可作为 Module 内部纯辅助算法保留，不拥有应用
  lifecycle，也不再由 React 拼装 operation result。

### 无兼容双路径

两个独立 Module 提交可在集成前暂时没有生产 caller。集成任务直接切换消费者并删除 React 中旧应用状态；不新增
old/new flag、fallback、双读、双写、adapter shim 或第二 Redux/queue/session owner。最终只有新 Module 路径。

## 精确实施范围

### 工作文档提交

- `docs/superpowers/specs/2026/08/25/2026-08-25-codex-gui-composer-application-session-boundary-design.md`
- `docs/superpowers/plans/2026/08/25/2026-08-25-codex-gui-composer-application-session-boundary-plan.md`

### Task P：Pending-input application session

新增：

- `codex-gui/src/features/composerTurnControl/composerPendingInputSession.ts`
- `codex-gui/src/features/composerTurnControl/__tests__/composerPendingInputSession.test.ts`

只读复用：

- `codex-gui/src/features/composerTurnControl/composerPendingInputPages.ts`
- `codex-gui/src/features/activeThreadSession/activeThreadSession.ts`
- `codex-gui/src/features/activeThreadSession/activeThreadSessionContracts.ts`
- `codex-gui/src/features/composerInputQueue/composerInputQueueContracts.ts`
- `codex-gui/src/features/composerInputQueue/composerInputQueueCoordinator.ts`
- `codex-gui/src/features/composerEditor/ComposerEditor.tsx`
- `codex-gui/src/features/composerEditor/composerDraft.ts`

该 Module 必须覆盖已确认设计的六条 pending-side 契约：同 owner 跨 revision、owner replacement、当前 render
同步 closing/read-only 投影、preparation token、同步 publication 与 outcome identity、completion hold、presence 后清理、
generation/effect id 单次消费，以及 teardown 不主动 save/cancel reservation。

### Task T：Turn application

新增：

- `codex-gui/src/features/composerTurnControl/composerTurnApplication.ts`
- `codex-gui/src/features/composerTurnControl/__tests__/composerTurnApplication.test.ts`

只读复用：

- `codex-gui/src/features/composerTurnControl/composerTurnControlModel.ts`
- `codex-gui/src/features/activeThreadSession/activeThreadSession.ts`
- `codex-gui/src/features/composerEditor/ComposerEditor.tsx`
- `codex-gui/src/features/composerEditor/composerDraft.ts`
- `codex-gui/src/features/skillCatalog/skillCatalogOwner.ts`

该 Module 必须覆盖 Send、Guide、空草稿 Guide promotion、Recover、Stop 的当前投影与 command；submit 开始时绑定
精确 controller/capture，只有 `accepted` 才清空同一 capture；stale/unavailable/invalid rejection 返回 `ignored`、
保持静默且不清草稿；旧 microtask 不能解锁新 generation。

### Task I：React/HeroUI adapter 集成

修改 production：

- `codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx`
- `codex-gui/src/features/composerTurnControl/ComposerPendingInputRegion.tsx`
- `codex-gui/src/features/composerTurnControl/ComposerPendingInputDrawer.tsx`
- `codex-gui/src/features/composerTurnControl/ComposerPendingInputEditor.tsx`

修改测试：

- `codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx`

集成后：

- `ComposerTurnControl` 创建/持有 application Module，订阅可渲染 snapshot，并继续拥有 context usage、
  focus-visible、viewport reveal、HeroUI 和 Lingui adapter；
- `ComposerPendingInputRegion` 不再拥有独立应用 presence state，只转发 HeroUI presence completion 与语义状态；
- `ComposerPendingInputDrawer` 不再拥有 reservation、opened owner、preparing、completion hold、outcome-at-begin、
  refresh suppression 或结果分类，只渲染 Module view、附着 editor、反馈 presence 和执行 guarded focus effect；
- `ComposerPendingInputEditor` 继续是 editor/skill/Lingui adapter，但 validity/controller attachment 通过显式 input
  回报 Module；
- `ComposerTurnControl` 对两个 Module 的 ownership 必须能承受 React StrictMode setup/cleanup replay：开发期 replay
  不得永久 dispose 随后复用的实例，真实 unmount 必须使旧 callback/effect 失效且只完成一次 teardown；实现限定在
  `ComposerTurnControl.tsx` 内，不复用 threadHistory 专属 hook；
- Browser 回归保留并收窄代表性纵向行为，重点覆盖 owner replacement、projection unavailable 的 edit/read-only
  分叉、同步 drain、StrictMode replay/真实 unmount、旧 editor callback、旧 microtask、最后一项 completion hold 与
  焦点 fallback。

## 明确排除

- `codex-rs/**`、app-server、RPC、wire schema、generated validators、protocol fixture 与 generator；
- `activeThreadSession/**`、`composerInputQueue/**`、`composerEditor/**`、`skillCatalog/**` 和 Redux 的生产语义修改；
- `SkillTypeaheadPlugin.tsx` 的 Lexical/DOM/ARIA 重构；
- Send、Guide、Recover、Stop、pending-input 排序、容量、失败提示、草稿清理或 focus 产品语义变化；
- 新 toast、alert、即时拒绝文案、Lingui catalog 或样式变化；
- Redux composer slice、queue mirror、第二 session identity、兼容层、双路径或 fallback；
- 为行为保持型重构新增视觉 snapshot、主观样式断言或低价值 DOM 实现细节测试；
- 关联 issue 的状态、证据或内容更新；已确认设计未授权该额外交付物；
- dependency、runtime、浏览器或可执行组件安装；
- Git 远程、force 操作、squash、amend；
- 仓库级 `just fmt`、Rust/native build、protocol/schema generator 和 E2E。

若实施证据表明必须修改任何排除的生产语义或文件，暂停受影响失败域并回到计划确认，不得顺带扩大。

## Worktree 预配授权

计划确认后，先在当前 `dev` 工作树创建仅包含设计与计划的 docs-only 本地提交。提交成功后，使用项目固化脚本
从已含该提交的 `dev` 创建以下三个 sparse worktree；在全部创建并核验前不得开始任何 implementation edit：

```text
.codex/skills/codex-gui-worktree/scripts/create-codex-gui-worktree.sh --name gui-composer-pending-session --branch codex/gui-composer-pending-session --base dev --repo-root /Users/jiangsheng/cnb/codex --worktree-root /Users/jiangsheng/cnb/codex/.worktrees --vitest-root /Users/jiangsheng/GitHub/vitest

.codex/skills/codex-gui-worktree/scripts/create-codex-gui-worktree.sh --name gui-composer-turn-application --branch codex/gui-composer-turn-application --base dev --repo-root /Users/jiangsheng/cnb/codex --worktree-root /Users/jiangsheng/cnb/codex/.worktrees --vitest-root /Users/jiangsheng/GitHub/vitest

.codex/skills/codex-gui-worktree/scripts/create-codex-gui-worktree.sh --name gui-composer-application-session-boundary --branch codex/gui-composer-application-session-boundary --base dev --repo-root /Users/jiangsheng/cnb/codex --worktree-root /Users/jiangsheng/cnb/codex/.worktrees --vitest-root /Users/jiangsheng/GitHub/vitest
```

固定路径与执行上下文：

| 用途 | worktree | branch | Git index |
| --- | --- | --- | --- |
| Pending session | `/Users/jiangsheng/cnb/codex/.worktrees/gui-composer-pending-session` | `codex/gui-composer-pending-session` | 该 worktree 独占 |
| Turn application | `/Users/jiangsheng/cnb/codex/.worktrees/gui-composer-turn-application` | `codex/gui-composer-turn-application` | 该 worktree 独占 |
| 集成与最终验证 | `/Users/jiangsheng/cnb/codex/.worktrees/gui-composer-application-session-boundary` | `codex/gui-composer-application-session-boundary` | 该 worktree 独占 |

脚本默认 sparse include 已覆盖 `.codex/skills`、`.agents/skills`、`codex-gui`、协议 schema 与
`docs/superpowers`，本计划不追加 include。三个 worktree 共享主工作树已有的 `node_modules`、HeroUI/Redux/Vitest
文档链接；不运行 install。

## 执行图

下列 graph 是权威执行结构。成本使用 S/M/L；所有 Git stage/commit、格式化和集成都由对应 taskBoundary 的唯一
owner 执行。实现阶段每个节点事件后重新计算 ready set。

### D0 — 记录计划确认

- `nodeId`: D0
- `taskBoundary`: DOCS（独立 docs-only 提交）
- `operationKind`: 编辑
- `outcome`: 将本计划状态改为已确认，并记录确认日期与用户确认原文。
- `estimatedCost`: S
- `deferralEvidence`: 无。
- `hardPredecessors`: 无；本节点只受下述授权门禁约束。
- `consumes`: 用户对本计划的明确确认。
- `produces`: 已确认状态的计划文档 working diff。
- `completionEvidence`: 状态、日期、确认原文与用户回复一致，设计文档不再变更。
- `readSet`: 本计划、用户确认消息。
- `writeSet`: 本计划单文件。
- `executionContext`: 主 worktree `/Users/jiangsheng/cnb/codex`，branch `dev`，index 不变。
- `resourceLocks`: 本计划文件 write。
- `owner`: DOCS owner。
- `verification`: 只读检查文档头部与 Git diff。
- `failureDomain`: D1、D2 及所有 implementation 后继。
- `replanTriggers`: 用户确认同时改变目标、范围或行为。
- `authorizationGate`: 当前未满足；用户确认本计划后满足。

### D1 — 工作文档 stage

- `nodeId`: D1
- `taskBoundary`: DOCS（独立 docs-only 提交）
- `operationKind`: stage
- `outcome`: 只暂存本设计与本计划两个文件，staged diff 无其他路径。
- `estimatedCost`: S
- `deferralEvidence`: 无。
- `hardPredecessors`: D0；等待已记录的计划确认。
- `consumes`: 已确认设计、已确认计划、干净的 scoped Git 状态。
- `produces`: docs-only staged index。
- `completionEvidence`: `git diff --cached --name-only` 仅列两个工作文档，`git diff --cached --check` 通过。
- `readSet`: 两个工作文档、Git status/index。
- `writeSet`: 当前 `dev` worktree Git index。
- `executionContext`: 主 worktree `/Users/jiangsheng/cnb/codex`，branch `dev`，独占 index。
- `resourceLocks`: `/Users/jiangsheng/cnb/codex/.git/index` write。
- `owner`: DOCS Git owner；唯一允许 stage。
- `verification`: staged name/status/diff/check 四项只读核验。
- `failureDomain`: D1、D2 及所有 implementation 后继；不改变工作文档内容。
- `replanTriggers`: staged 出现第三个路径、设计/计划内容在确认后漂移。
- `authorizationGate`: 当前未满足；用户确认本计划后满足。

### D2 — 工作文档提交

- `nodeId`: D2
- `taskBoundary`: DOCS
- `operationKind`: commit
- `outcome`: 形成一个只含设计与计划的本地提交。
- `estimatedCost`: S
- `deferralEvidence`: 无。
- `hardPredecessors`: D1；等待已核验 staged index。
- `consumes`: docs-only staged index。
- `produces`: DOCS commit id，`dev` 新基线。
- `completionEvidence`: `git show --stat --oneline HEAD` 只含两个文档，worktree scoped clean。
- `readSet`: staged diff、Git metadata。
- `writeSet`: `dev` ref、Git object database/index。
- `executionContext`: 主 worktree `dev`，独占 index。
- `resourceLocks`: repository refs/object database write；主 index write。
- `owner`: DOCS Git owner；唯一允许 commit。
- `verification`: commit 后核验路径、parent 与 branch。
- `failureDomain`: 所有 worktree 创建与 implementation 节点。
- `replanTriggers`: commit hook 产生范围外修改或提交内容不匹配。
- `authorizationGate`: 计划确认后满足；禁止 amend。

### W1 / W2 / W3 — 三个 sparse worktree 创建

三个节点字段相同，仅参数与 executionContext 不同：

| nodeId | taskBoundary | operationKind | outcome | estimatedCost | hardPredecessors |
| --- | --- | --- | --- | --- | --- |
| W1 | PREP-P（无提交） | 集成准备 | pending session worktree/branch 创建并链接资源 | S | D2 的 DOCS commit |
| W2 | PREP-T（无提交） | 集成准备 | turn application worktree/branch 创建并链接资源 | S | D2 的 DOCS commit |
| W3 | PREP-I（无提交） | 集成准备 | integration worktree/branch 创建并链接资源 | S | D2 的 DOCS commit |

- `deferralEvidence`: 无；三个脚本目标、branch、index 不相交，D2 后同时 ready。
- `consumes`: D2 commit、上节精确脚本参数、canonical shared resources。
- `produces`: 对应 worktree、branch、sparse checkout 与资源 symlink。
- `completionEvidence`: branch HEAD 等于 D2 commit；sparse list 正确；worktree status clean；五项共享资源链接指向
  canonical target。
- `readSet`: 固化脚本、D2 commit、共享 `node_modules` 与本地 docs roots。
- `writeSet`: 各自 `.worktrees/<name>`、独立 branch ref 与独立 Git index。
- `executionContext`: 分别为上表 P/T/I worktree，branch/index 独占。
- `resourceLocks`: repository worktree registry/refs write，以及
  `/Users/jiangsheng/cnb/codex/.worktrees/vitest` shared symlink write；脚本执行期间三者均 ready，但按这两个
  canonical 写锁串行取得和释放，不伪造依赖边。
- `owner`: 每个 preparation 节点的唯一 worktree owner。
- `verification`: 固化脚本成功后只读核验 HEAD、branch、status、sparse paths 与 symlink targets。
- `failureDomain`: 仅失败节点及 W4；已成功的 sibling 保留，不 force 清理。
- `replanTriggers`: branch/path 已存在、base 不再是 D2、共享资源缺失或 symlink 指向异常。
- `authorizationGate`: 计划确认后精确授权上述三条命令；当前未满足。

### W4 — 统一预配屏障

- `nodeId`: W4
- `taskBoundary`: PREP-FAN-IN（无提交）
- `operationKind`: fan-in
- `outcome`: 三个实现上下文都从同一 D2 基线可用。
- `estimatedCost`: S
- `deferralEvidence`: 无。
- `hardPredecessors`: W1、W2、W3；等待三个已核验 worktree identities。
- `consumes`: 三份 worktree completion evidence。
- `produces`: implementation ready barrier。
- `completionEvidence`: 三 worktree HEAD、branch、clean status 汇总一致。
- `readSet`: 三 worktree Git metadata。
- `writeSet`: 无。
- `executionContext`: 主协调上下文，只读。
- `resourceLocks`: 三 worktree metadata read。
- `owner`: 主协调者。
- `verification`: 对照固定路径/branch/base 表。
- `failureDomain`: P/T/I implementation 节点。
- `replanTriggers`: 任一工作树在屏障前出现未声明修改。
- `authorizationGate`: 继承 W1-W3；满足后自动继续。

### P1 — Pending session 编辑

- `nodeId`: P1
- `taskBoundary`: P（独立提交）
- `operationKind`: 编辑
- `outcome`: 新 Module 与 unit tests 完整表达 pending application session，不接入 React。
- `estimatedCost`: L
- `deferralEvidence`: 无。
- `hardPredecessors`: W4；等待隔离 worktree。
- `consumes`: 已确认设计、现有 role/contracts/pages/editor seam。
- `produces`: 两个 Task P 新文件的 working diff。
- `completionEvidence`: diff 只含 Task P writeSet，测试覆盖契约矩阵且 Module 无平台 import。
- `readSet`: Task P 只读复用文件及现有 Drawer/Browser tests。
- `writeSet`: `composerPendingInputSession.ts`、`__tests__/composerPendingInputSession.test.ts`。
- `executionContext`: P worktree/branch/index；编辑不操作 index。
- `resourceLocks`: P worktree 两个新文件 write。
- `owner`: P implementation owner。
- `verification`: 静态 import boundary 检查；不在编辑节点运行 fix。
- `failureDomain`: PF-P4、I1P 及其后继；T 分支继续。
- `replanTriggers`: 需要修改 queue/session/editor 权威语义、React 或第三个生产文件。
- `authorizationGate`: 计划确认且 W4 完成后满足。

### PF — Pending session 限定格式化

- `nodeId`: PF
- `taskBoundary`: P
- `operationKind`: 格式化
- `outcome`: 仅格式化 Task P 两个新文件。
- `estimatedCost`: S
- `deferralEvidence`: 无。
- `hardPredecessors`: P1；等待 Task P working diff。
- `consumes`: P1 diff、oxfmt config。
- `produces`: formatted P diff。
- `completionEvidence`: 精确目标 fix 后对同两文件执行非 fix 检查通过，diff 无第三个路径。
- `readSet`: Task P 两文件、formatter config。
- `writeSet`: Task P 两文件。
- `executionContext`: P worktree，index 不变。
- `resourceLocks`: Task P 两文件 write；oxfmt runner write。
- `owner`: P format owner。
- `verification`: fnm-backed `pnpm exec oxfmt <两个精确路径> --write` 后对相同路径执行 `--check`。
- `failureDomain`: P2-P4、I1P/I1F 及其后继；I1T 可继续。
- `replanTriggers`: formatter 修改第三个路径或入口不可用。
- `authorizationGate`: 已确认实现内自动执行。

### P2 — Pending session focused unit 验证

- `nodeId`: P2
- `taskBoundary`: P
- `operationKind`: 验证
- `outcome`: Task P unit tests 通过，Module import boundary 合法。
- `estimatedCost`: M
- `deferralEvidence`: 无。
- `hardPredecessors`: PF；等待 formatted Task P diff。
- `consumes`: PF diff。
- `produces`: focused test 与检查证据。
- `completionEvidence`: fnm-backed `pnpm run test:unit -- src/features/composerTurnControl/__tests__/composerPendingInputSession.test.ts`
  exit 0；目标文件不导入 React/HeroUI/Lingui/Lexical/DOM types。
- `readSet`: P1 writeSet、package/config/node_modules。
- `writeSet`: 测试 runner 临时 cache/artifacts。
- `executionContext`: P worktree，index 不变。
- `resourceLocks`: `/Users/jiangsheng/cnb/codex/codex-gui/node_modules/.vite` write；
  `/Users/jiangsheng/cnb/codex/codex-gui/node_modules/.tmp` write；P worktree其他 test artifacts write；shared
  node_modules 其余内容 read。
- `owner`: P verification owner。
- `verification`: `/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit -- ...`。
- `failureDomain`: P3-P4、I1P 后继；计划内失败插入 P-fix 节点，T 继续。
- `replanTriggers`: failure 证明需改写排除的权威 seam。
- `authorizationGate`: 已确认实现内自动执行。

### P3 / P4 — Pending session stage 与 commit

- `nodeId`: P3；`taskBoundary`: P；`operationKind`: stage；`outcome`: 仅 Task P 两文件进入 index；
  `estimatedCost`: S；`hardPredecessors`: P2；`consumes`: verified P diff；`produces`: scoped staged index；
  `completionEvidence`: staged name-only 两文件且 `git diff --cached --check` 通过；`readSet`: P diff/status；
  `writeSet`: P index；`executionContext`: P worktree/index 独占；`resourceLocks`: P index write；`owner`: P Git owner；
  `verification`: staged diff review；`failureDomain`: P4/I1P 后继；`replanTriggers`: staged 越界；
  `authorizationGate`: 计划确认后满足；`deferralEvidence`: 无。
- `nodeId`: P4；`taskBoundary`: P；`operationKind`: commit；`outcome`: 形成 Pending session 独立提交；
  `estimatedCost`: S；`hardPredecessors`: P3；`consumes`: scoped staged index；`produces`: P commit id；
  `completionEvidence`: commit 只含两文件且 branch scoped clean；`readSet`: staged diff；`writeSet`: P branch ref/object/index；
  `executionContext`: P worktree/index 独占；`resourceLocks`: P index + repo refs write；`owner`: P Git owner；
  `verification`: `git show --stat`；`failureDomain`: I1P 及后继；`replanTriggers`: commit 内容漂移；
  `authorizationGate`: 计划确认后满足，禁止 amend/squash；`deferralEvidence`: 无。

### T1 — Turn application 编辑

- `nodeId`: T1
- `taskBoundary`: T（独立提交）
- `operationKind`: 编辑
- `outcome`: 新 Module 与 unit tests 完整表达 control projection 和 command 临界区，不接入 React。
- `estimatedCost`: M
- `deferralEvidence`: 无。
- `hardPredecessors`: W4；等待隔离 worktree，不依赖 P。
- `consumes`: 已确认设计、现有 control model、role/editor/skill seam。
- `produces`: 两个 Task T 新文件的 working diff。
- `completionEvidence`: diff 只含 Task T writeSet；测试覆盖 accepted-only clear、静默拒绝、reentry/generation。
- `readSet`: Task T 只读复用文件、TurnControl 与现有 tests。
- `writeSet`: `composerTurnApplication.ts`、`__tests__/composerTurnApplication.test.ts`。
- `executionContext`: T worktree/branch/index；编辑不操作 index。
- `resourceLocks`: T worktree两个新文件 write。
- `owner`: T implementation owner。
- `verification`: 静态 import boundary 检查。
- `failureDomain`: TF-T4、I1T 及后继；P 分支继续。
- `replanTriggers`: 需要修改 ActiveThreadSession、editor 或产品失败语义。
- `authorizationGate`: 计划确认且 W4 完成后满足。

### TF — Turn application 限定格式化

- `nodeId`: TF
- `taskBoundary`: T
- `operationKind`: 格式化
- `outcome`: 仅格式化 Task T 两个新文件。
- `estimatedCost`: S
- `deferralEvidence`: 无。
- `hardPredecessors`: T1；等待 Task T working diff。
- `consumes`: T1 diff、oxfmt config。
- `produces`: formatted T diff。
- `completionEvidence`: 精确目标 fix 后对同两文件执行非 fix 检查通过，diff 无第三个路径。
- `readSet`: Task T 两文件、formatter config。
- `writeSet`: Task T 两文件。
- `executionContext`: T worktree，index 不变。
- `resourceLocks`: Task T 两文件 write；oxfmt runner write。
- `owner`: T format owner。
- `verification`: fnm-backed `pnpm exec oxfmt <两个精确路径> --write` 后对相同路径执行 `--check`。
- `failureDomain`: T2-T4、I1T 及其后继。
- `replanTriggers`: formatter 修改第三个路径或入口不可用。
- `authorizationGate`: 已确认实现内自动执行。

### T2 — Turn application focused unit 验证

- `nodeId`: T2
- `taskBoundary`: T
- `operationKind`: 验证
- `outcome`: Task T unit tests 通过，Module 无平台依赖。
- `estimatedCost`: M
- `deferralEvidence`: 无。
- `hardPredecessors`: TF。
- `consumes`: TF diff。
- `produces`: focused test 与 import-boundary evidence。
- `completionEvidence`: fnm-backed `pnpm run test:unit -- src/features/composerTurnControl/__tests__/composerTurnApplication.test.ts`
  exit 0。
- `readSet`: T1 writeSet、package/config/node_modules。
- `writeSet`: T worktree test cache/artifacts。
- `executionContext`: T worktree，index 不变。
- `resourceLocks`: `/Users/jiangsheng/cnb/codex/codex-gui/node_modules/.vite` write；
  `/Users/jiangsheng/cnb/codex/codex-gui/node_modules/.tmp` write；T worktree其他 test artifacts write；shared
  node_modules 其余内容 read。
- `owner`: T verification owner。
- `verification`: 固化 pnpm script 与 fnm invocation。
- `failureDomain`: T3-T4、I1T 后继；计划内失败插入 T-fix 节点，P 继续。
- `replanTriggers`: failure 证明设计 contract 不足或写集合需扩大。
- `authorizationGate`: 已确认实现内自动执行。

### T3 / T4 — Turn application stage 与 commit

- `nodeId`: T3；`taskBoundary`: T；`operationKind`: stage；`outcome`: 仅 Task T 两文件进入 index；
  `estimatedCost`: S；`hardPredecessors`: T2；`consumes`: verified T diff；`produces`: scoped staged index；
  `completionEvidence`: staged name-only 两文件且 `git diff --cached --check` 通过；`readSet`: T diff/status；
  `writeSet`: T index；`executionContext`: T worktree/index 独占；`resourceLocks`: T index write；`owner`: T Git owner；
  `verification`: staged diff review；`failureDomain`: T4/I1T 后继；`replanTriggers`: staged 越界；
  `authorizationGate`: 计划确认后满足；`deferralEvidence`: 无。
- `nodeId`: T4；`taskBoundary`: T；`operationKind`: commit；`outcome`: 形成 Turn application 独立提交；
  `estimatedCost`: S；`hardPredecessors`: T3；`consumes`: scoped staged index；`produces`: T commit id；
  `completionEvidence`: commit 只含两文件且 branch scoped clean；`readSet`: staged diff；`writeSet`: T branch ref/object/index；
  `executionContext`: T worktree/index 独占；`resourceLocks`: T index + repo refs write；`owner`: T Git owner；
  `verification`: `git show --stat`；`failureDomain`: I1T 及后继；`replanTriggers`: commit 内容漂移；
  `authorizationGate`: 计划确认后满足，禁止 amend/squash；`deferralEvidence`: 无。

### I1T / I1P / I1F — 模块提交汇入集成 branch

为保留两个并行分支的原 commit identity，禁止 cherry-pick。Turn application 编辑成本预计为 M，Pending session
预计为 L，因此 integration branch 先在预计更早的 T commit 可用时 fast-forward，再以本地非 squash merge 把 P
commit 纳为祖先；merge commit 只表达拓扑汇合，不重写 P/T。若实际成本反转，T-first 仍保持确定、可审计的拓扑，
代价只是一段 integration worktree 空闲时间，不阻止 P/T implementation 或验证继续。

- `nodeId`: I1T；`taskBoundary`: INTEGRATE-T；`operationKind`: 集成；`outcome`: integration branch 以
  `git merge --ff-only codex/gui-composer-turn-application` 快进到原 T commit；`estimatedCost`: S；
  `deferralEvidence`: 无；`hardPredecessors`: T4；T4 已传递保证 W4；`consumes`: T commit、D2-based integration branch；
  `produces`: integration HEAD 等于 T commit id；`completionEvidence`: HEAD identity 相等且 status clean；
  `readSet`: T commit/I branch；`writeSet`: I branch/index/worktree；`executionContext`: I worktree/index 独占；
  `resourceLocks`: I index/worktree + repo refs write；`owner`: I integration Git owner；
  `verification`: merge-base、HEAD identity、status、diff-check；`failureDomain`: I1P/I1F 及全部 I/V/A 后继；
  `replanTriggers`: 无法 fast-forward 或 branch base 漂移；`authorizationGate`: 计划确认后满足，仅本地 Git。
- `nodeId`: I1P；`taskBoundary`: INTEGRATE-P；`operationKind`: 集成；`outcome`: 使用本地非交互命令
  `git merge --no-ff -m 'Integrate pending input session module' codex/gui-composer-pending-session` 形成 merge commit，
  使原 P commit 与原 T commit 均为祖先；
  `estimatedCost`: S；`deferralEvidence`: 无；`hardPredecessors`: I1T、P4；`consumes`: T-based integration HEAD、P commit；
  `produces`: P/T fan-in merge commit；`completionEvidence`: 两个原 commit 均为 HEAD ancestor、merge diff 无额外改写、
  status clean；`readSet`: P/T commits/I branch；`writeSet`: I branch/index/worktree；
  `executionContext`: I worktree/index 独占；`resourceLocks`: I index/worktree + repo refs write；
  `owner`: I integration Git owner；`verification`: ancestor、parents、status、diff-check；
  `failureDomain`: I1P/I1F 及全部 I/V/A 后继；`replanTriggers`: merge conflict 或 merge tree 含非 P/T 变更；
  `authorizationGate`: 计划确认后满足；禁止 squash、amend、远程与 force。
- `nodeId`: I1F；`taskBoundary`: INTEGRATION-FAN-IN（无新提交）；`operationKind`: fan-in；
  `outcome`: 发布包含原 P/T identities 的稳定集成 baseline；`estimatedCost`: S；`deferralEvidence`: 无；
  `hardPredecessors`: I1P；`consumes`: P/T merge topology；`produces`: stable integration commit identity；
  `completionEvidence`: P/T 原 ids 均为 ancestor、worktree/index clean、无 conflict marker；
  `readSet`: integration log/tree/status；`writeSet`: 无；`executionContext`: I worktree只读；
  `resourceLocks`: I commit/tree read；`owner`: 主协调者；`verification`: log/ancestor/tree/status；
  `failureDomain`: 全部 I/V/A 后继；`replanTriggers`: identity 或 tree 不匹配；
  `authorizationGate`: 继承 I1P/I1T。

### I2 — React adapter cutover 与纵向测试编辑

- `nodeId`: I2
- `taskBoundary`: I（独立 React 集成提交）
- `operationKind`: 编辑
- `outcome`: 四个 React 文件只消费两个 Module 的 view/command/effect，Browser test 保持代表性行为。
- `estimatedCost`: L
- `deferralEvidence`: 无。
- `hardPredecessors`: I1F；等待两个 Module 的稳定 Interface 与原提交 identity。
- `consumes`: 集成后的 P/T commits、当前 React adapters、Browser harness。
- `produces`: Task I 五文件 working diff。
- `completionEvidence`: React 不再持有设计列出的 application transaction state；无 old/new 双路径；测试覆盖核心纵向
  契约以及 StrictMode replay 后仍可 submit/open/edit、真实 unmount 只 teardown 一次。
- `readSet`: P/T files、Task I files、现有 pages/model、session/editor contracts、Browser fixtures。
- `writeSet`: Task I 列出的四个 production 文件和一个 Browser test。
- `executionContext`: I worktree/branch/index；编辑不操作 index。
- `resourceLocks`: Task I 五文件 write。
- `owner`: I implementation owner。
- `verification`: 静态搜索旧 state names、平台 import boundary 与单一路径。
- `failureDomain`: I3-I7、V/A；P/T commits 保留。
- `replanTriggers`: 需要修改 CurrentTaskPage、底层 owner、文案/catalog、样式或排除文件。
- `authorizationGate`: 已确认计划内自动执行。

### I3 — 限定格式化

- `nodeId`: I3
- `taskBoundary`: I
- `operationKind`: 格式化
- `outcome`: 仅 Task I 五个 TypeScript 文件按项目 formatter 规范化，并对 P/T 已提交文件做非 fix 检查。
- `estimatedCost`: S
- `deferralEvidence`: 无。
- `hardPredecessors`: I2；等待组合 working diff。
- `consumes`: 已格式化的 P/T commits 与 Task I working diff。
- `produces`: formatted integration diff。
- `completionEvidence`: `format:oxfmt` 非 fix 检查对目标集合通过，diff 没有范围外文件。
- `readSet`: Task P/T/I files、formatter config。
- `writeSet`: Task I 四个 production 文件与一个 Browser test，仅 formatter 产生的机械变化。
- `executionContext`: I worktree；index 不变。
- `resourceLocks`: I source files write；oxfmt runner write。
- `owner`: I format owner；先对 Task I 五文件使用 `pnpm exec oxfmt <精确文件> --write`，再对 P/T/I 全部目标用
  精确文件的非 fix `--check` 检查。
- `verification`: fnm-backed invocation；检查实际 diff。
- `failureDomain`: I4-I7、V/A。
- `replanTriggers`: formatter 修改范围外文件或项目入口不支持精确目标。
- `authorizationGate`: 已确认实现内自动执行；不运行 repository `just fmt`。

### I4 / I5T / I5L / I6 — 组合验证 fan-out

I3 后四项同时 ready。I4、I5T 与 I6 都会写共享的 canonical Vite/typecheck cache，因此保持 ready、竞争同一
动态写锁；I5L 的 worktree-local lint cache 不与其冲突。

| nodeId | operationKind | outcome | verification | resourceLocks |
| --- | --- | --- | --- | --- |
| I4 | 验证 | 两个 Module unit 与既有 pages/model unit 全部通过 | `pnpm run test:unit --` 后跟四个精确 test paths | shared `node_modules/.vite` + `node_modules/.tmp` write；I unit artifacts write |
| I5T | 验证 | TypeScript 对组合 diff 通过 | `pnpm run type-check` | shared `node_modules/.tmp` write；source read |
| I5L | 验证 | lint 对组合 diff 通过 | `pnpm run lint` | I worktree `.eslintcache` write；source read |
| I6 | 验证 | Composer Browser 代表测试（含 StrictMode lifecycle）在 parallel config 通过 | `pnpm run test:browser:parallel -- src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx` | shared `node_modules/.vite` + `node_modules/.tmp` write；browser artifacts write |

共同字段：

- `taskBoundary`: I；`estimatedCost`: I4 M、I5T M、I5L M、I6 L；`deferralEvidence`: 无。
- `hardPredecessors`: I3；等待 formatted combined diff。
- `consumes`: formatted P/T/I diff 与项目配置。
- `produces`: 各自验证证据。
- `completionEvidence`: 对应命令 exit 0，无 pending artifacts。
- `readSet`: P/T/I source/tests、package/config/node_modules。
- `writeSet`: 表中 runner cache/artifacts，不修改 tracked source。
- `executionContext`: I worktree，index 不变。
- `owner`: 各验证节点唯一 runner owner。
- `failureDomain`: 仅 I7 与 V/A 后继；失败插入 scoped fix 节点，其他无冲突验证继续。
- `replanTriggers`: failure 指向排除文件、产品语义变化或 runner 写集合与声明不符。
- `authorizationGate`: 已确认实现内自动执行。

### I7 / I8 — React 集成 stage 与 commit

- `nodeId`: I7；`taskBoundary`: I；`operationKind`: stage；`outcome`: 仅 Task I 五文件进入 index；
  `estimatedCost`: S；`hardPredecessors`: I4、I5T、I5L、I6；`consumes`: verified combined diff；`produces`: scoped staged index；
  `completionEvidence`: staged name-only 等于 Task I writeSet，`git diff --cached --check` 通过；`readSet`: integration diff；
  `writeSet`: I index；`executionContext`: I worktree/index 独占；`resourceLocks`: I index write；`owner`: I Git owner；
  `verification`: staged diff review 并确认 P/T commits 未被改写；`failureDomain`: I8/V/A；`replanTriggers`: staged 越界；
  `authorizationGate`: 计划确认后满足；`deferralEvidence`: 无。
- `nodeId`: I8；`taskBoundary`: I；`operationKind`: commit；`outcome`: 形成 React adapter 集成独立提交；
  `estimatedCost`: S；`hardPredecessors`: I7；`consumes`: scoped staged index；`produces`: I commit id；
  `completionEvidence`: commit 只含 Task I 五文件、branch clean、P/T/I 三个 commit identity 可见；`readSet`: staged diff；
  `writeSet`: I branch ref/object/index；`executionContext`: I worktree/index 独占；`resourceLocks`: I index + repo refs write；
  `owner`: I Git owner；`verification`: commit show/log/status；`failureDomain`: V/A；`replanTriggers`: commit 内容漂移；
  `authorizationGate`: 计划确认后满足，禁止 amend/squash；`deferralEvidence`: 无。

### V1 / V2 / V3 — 最终验证 fan-out

I8 形成稳定集成状态后：

| nodeId | operationKind | outcome | verification | canonical resource |
| --- | --- | --- | --- | --- |
| V1 | 验证 | frontend CI 静态、protocol drift 与全部 unit 通过 | `/opt/homebrew/bin/fnm exec --using-file pnpm run ci` | shared `node_modules/.vite` + `node_modules/.tmp` write；I `.eslintcache`/unit artifacts write |
| V2 | 验证 | parallel Browser 全套通过，包含 Composer 与 App 纵向路径 | `/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:parallel` | shared `node_modules/.vite` + `node_modules/.tmp` write；parallel browser artifacts write |
| V3 | 验证 | sequential Browser 全套通过，包含 composer viewport | `/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:sequential` | shared `node_modules/.vite` + `node_modules/.tmp` write；sequential browser artifacts write |

共同字段：

- `taskBoundary`: FINAL-VERIFY（无提交）；`estimatedCost`: L；`deferralEvidence`: 无。
- `hardPredecessors`: I8；等待稳定 committed integration state。
- `consumes`: P/T/I commits、package scripts、linked node_modules。
- `produces`: final verification evidence。
- `completionEvidence`: 对应命令 exit 0，tracked status clean。
- `readSet`: 整个 `codex-gui` tracked tree 与配置。
- `writeSet`: 表中 runner artifacts/cache，不修改 tracked source。
- `executionContext`: I worktree，commit 固定，index 不变。
- `resourceLocks`: V1/V2/V3 对 canonical `node_modules/.vite` 与 `node_modules/.tmp` 均为 write，因此三者同时
  ready、动态串行取得共享锁；
  各自其他 artifact 锁按表声明，不伪造 DAG edge。
- `owner`: 每个 final runner 的唯一 owner。
- `failureDomain`: 失败节点、A2 与最终完成；其他已运行验证继续。计划内 failure 插入新 fix taskBoundary 和新提交，
  禁止 amend；只重跑被其写集合失效的验证。
- `replanTriggers`: failure 证明需扩大产品/协议/owner/排除文件范围，或验证命令不存在/要求安装。
- `authorizationGate`: 已确认实现内自动执行；不安装缺失组件。

### A1 — 独立代码与边界反向审计

- `nodeId`: A1
- `taskBoundary`: FINAL-AUDIT（无提交）
- `operationKind`: 审查
- `outcome`: 独立上下文确认设计契约、单 owner、单路径、写集合与静态测试映射均满足。
- `estimatedCost`: M
- `deferralEvidence`: 无。
- `hardPredecessors`: I8；等待稳定 final committed diff，不等待无依赖 runner。
- `consumes`: 已确认设计、P/T/I commits 与测试代码。
- `produces`: 结论、路径/行号、排除项、遗留风险。
- `completionEvidence`: 审计明确逐项覆盖六条硬契约、无兼容双路径、无排除范围修改。
- `readSet`: final committed diff、设计、计划与测试代码。
- `writeSet`: 无。
- `executionContext`: 独立只读上下文。
- `resourceLocks`: final commit/diff read。
- `owner`: 非实现 owner 的独立审计者。
- `verification`: 反向从用户行为、failure matrix、owner 与 adapter boundary 追踪到代码和 tests。
- `failureDomain`: A2 与完成节点；若发现计划内缺陷，插入新 fix commit 节点并使相关验证失效。
- `replanTriggers`: 审计发现范围或设计契约必须改变。
- `authorizationGate`: 已确认实现内自动执行。

### A2 — 最终证据 fan-in

- `nodeId`: A2
- `taskBoundary`: FINAL-FAN-IN（无提交）
- `operationKind`: fan-in
- `outcome`: 代码审计和三项最终验证证据共同满足计划完成条件。
- `estimatedCost`: S
- `deferralEvidence`: 无。
- `hardPredecessors`: A1、V1、V2、V3；等待四份互相独立的稳定证据。
- `consumes`: A1 audit、CI、parallel Browser、sequential Browser results。
- `produces`: final completion evidence bundle。
- `completionEvidence`: 四个 predecessor 均成功且没有未关闭的 failure/fix node。
- `readSet`: audit 与 runner evidence、final Git status/log。
- `writeSet`: 无。
- `executionContext`: 主协调上下文只读。
- `resourceLocks`: evidence 与 Git metadata read。
- `owner`: 主协调者。
- `verification`: 对照计划完成标准逐项核验。
- `failureDomain`: final completion。
- `replanTriggers`: 任一证据失效或出现新 fix commit。
- `authorizationGate`: 已确认实现内自动执行。

## 初始 ready set、关键路径与汇合

### 计划确认前

- ready set 为空：D0 的计划确认授权尚未满足。

### 计划确认后的初始 ready set

- `D0`；D1 等待确认元数据落盘，D2 必须等待 scoped staged index。
- D2 完成后：`W1`、`W2`、`W3` 同时 ready；脚本仅因 repository worktree registry 的动态写锁短时互斥。
- W4 完成后：`P1` 与 `T1` fan-out 并行；integration worktree空闲等待稳定 commits。
- T4 后 `I1T` 可先快进；`I1P` 等待 I1T 与 P4，再由 I1F 发布稳定 baseline；任一 P/T 分支失败不暂停另一分支。
- P2/T2 可同时 ready，但对 shared `.vite`/`.tmp` cache 动态互斥；不会阻止另一分支继续其非 runner 后继。
- I3 后：`I4`、`I5T`、`I5L`、`I6` fan-out；I4/I5T/I6 对 shared Vite/typecheck cache 动态互斥。
- I8 后：`A1`、`V1`、`V2`、`V3` 同时 ready；V1/V2/V3 对 shared Vite cache 动态串行取得写锁，A1 不等待 runner。
- A1/V1/V2/V3 fan-in 到 A2。

粗粒度关键路径：

```text
D0 -> D1 -> D2 -> W1/W2/W3 -> W4
  -> max(P1->PF->serialized-cache(P2)->P3->P4, T1->TF->serialized-cache(T2)->T3->T4)
  -> I1T -> I1P -> I1F -> I2 -> I3 -> max(I5L, serialized cache holders I4/I5T/I6) -> I7 -> I8
  -> max(A1, serialized cache holders V1/V2/V3) -> A2
```

## 提交拓扑

最终 integration branch 必须保留以下独立提交身份，禁止 squash/amend：

```text
DOCS  设计 + 计划（docs-only）
  ├─ P  Pending-input application session + unit tests
  └─ T  Turn application + unit tests
       \ /
        I  React/HeroUI adapter cutover + Browser regression
```

若任何验证或审计要求修正已存在提交，创建新的 scoped fix commit 插入受影响提交与后继之间；不得修改、amend、
squash 或隐藏原提交。

## 验证原则

- 所有 `pnpm` 命令从对应 worktree 的 `codex-gui` 目录执行，并使用
  `/opt/homebrew/bin/fnm exec --using-file pnpm ...`；
- 不运行 install，不下载 browser/runtime，不直接调用不存在的脚本；
- DOM/browser 断言优先 locator 与 `expect.element` 内置 retry，不使用手写 sleep；
- Module tests 验证领域/application contract，Browser tests 只保留真实 React/HeroUI/editor/presence/focus seam；
- 不新增视觉 snapshot 或样式数值断言；
- 不通过删除覆盖、放宽断言、ignore、skip、静默兜底或修改 baseline 让验证通过；
- formatter 先精确写目标文件，再用项目非 fix 入口检查；
- 最终 `ci`、parallel Browser、sequential Browser 全部读取已提交集成状态。

## 计划完成标准

- DOCS、P、T、I 每个 taskBoundary 都形成独立本地提交，P/T 在隔离 worktree 并行形成且保留 identity；
- `ComposerPendingInputSession` 统一拥有 Drawer application session，React 不再拥有 reservation/owner/preparation/
  completion/outcome/suppression 状态；
- `ComposerTurnApplication` 统一拥有 projection、command critical section、capture identity 和 generation-safe unlock；
- `ActiveThreadSession`、queue、skill catalog、editor、Redux、Lexical/DOM/ARIA 的权威边界未复制、绕过或扩大；
- owner replacement、projection unavailable、presence、旧 callback、旧 microtask、completion hold、focus fallback 和
  accepted-only clear 均有 Module/Browser 对应证据；StrictMode replay 不误 dispose，真实 unmount 只 teardown 一次；
- 即时 session/revision rejection 仍静默并保留草稿；
- 最终只存在一条 production application path，无兼容双路径；
- scoped tests、type-check、lint、full CI、parallel Browser、sequential Browser 与独立反向审计均通过；
- 无 Git 远程、force、安装、Rust/native build、范围外修改或未声明提交。
