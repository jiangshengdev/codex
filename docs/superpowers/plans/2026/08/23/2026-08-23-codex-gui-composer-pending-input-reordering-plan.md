# Codex GUI Composer 待处理输入同 lane 排序实施计划

计划日期：2026-08-23

计划状态：已确认

确认日期：2026-08-23

确认原文：开始执行

对应已确认设计：
`docs/superpowers/specs/2026/08/23/2026-08-23-codex-gui-composer-pending-input-reordering-design.md`

## 目标

在现有 `Pending details` Drawer 中，为纯本地 ordinary 与 `steerQueue` 条目增加真实同 lane
排序：常驻上移/下移，HeroUI Dropdown 中提供移到最前/最后；不支持拖拽。排序以 owner 的
display key + revision 原子改变后续发送顺序，并保持 pending claim、编辑 reservation、
rejected/recovery、双 lane 加载预算、thread owner 与 delivery 对账语义。

## 当前代码必要性

本计划调查基线为 `dev` 的 `08c2dc6995f08a6d15e7ea76257b6322f75fffd1`。执行前必须重新
核验 HEAD 与工作树，不能把该值当作未来固定事实。

- `composerInputQueueContracts.ts` 的 page item 只有 key、lane、management 与 preview，没有
  owner-projected movement，也没有 move request/result。
- `composerInputQueue.ts` 的 page 顺序直接来自 ordinary slot 数组与 steer owner；公开 queue
  interface 只有 begin edit、delete 和 drain，没有排序 mutation。ordinary drain 与 promotion
  都使用当前数组队首，因此只有 owner 顺序能改变真实发送结果。
- `composerSteerQueueState.ts` 除 `steerQueue` 数组外，还用 `intentOrder`、`rejectedOrder` 与
  rejection batch 维持 terminal、not-steerable、rejected restore 和 definite-failure recovery
  顺序。只 splice 数组会在后续恢复时回退到旧 insertion order。
- `composerInputQueueCoordinator.ts` 集中拥有 generation、release、recovery、runtime replay、
  synchronous snapshot publication 与 dispose。Drawer 不能绕过 coordinator 直接调用 queue；
  move 必须在 publication/replay 期间持有同一 management mutation 仲裁。
- `ComposerPendingInputDrawer.tsx` 当前只保有 page items/cursor，没有两 lane load budget；任一
  revision 变化都会回到初始 20 条。条目 action 只有 Edit/Delete，没有 move、成功 live status
  或排序后双前缀原子重读。
- `ComposerTurnControl.browser.test.tsx` 与 `App.browser.test.tsx` 都有完整的 coordinator/page
  fake 或真实 owner 路径；新增 movement 和 coordinator move interface 后必须机械更新这些
  直接消费者，不能用宽类型或 optional fallback 掩盖 contract fallout。

因此该功能不能只在 Drawer 数组中换位。必须先建立跨普通队列与 steer 生命周期成立的权威
排序，再由 coordinator 包装完整 live-owner 事务，最后接入 UI 与真实发送纵向验证。

## 已核验的完整纵向路径

### 权威读取与移动能力

```text
ComposerInputQueueImpl / ComposerSteerQueueImpl
  -> owner projects movement(position/count/can earlier/can later)
  -> bounded page + cursor(owner/revision/lane/offset)
  -> ComposerInputQueueCoordinator live owner
  -> ComposerPendingInputDrawer
  -> HeroUI Buttons + Dropdown.Menu disabledKeys
```

`movement` 是 frontend-owned queue domain fact，不复制 generated wire contract。pending steer、
reservation 和 acquisition 投影 `null`；ordinary recoverable 与纯本地 steer intent 才有可移动
位置。steer 的 position/count 只计算 `steerQueue` 可排序后缀，不包含 `pendingSteers` 前缀。

### 原子 move

```text
Drawer move action
  -> coordinator.movePendingInput(key + visible revision + destination)
  -> coordinator gates generation/release/recovery/edit/mutation/replay
  -> queue resolves display key + current lifecycle + same-lane destination
  -> ordinary moves complete slot
     OR steer moves intent and rewrites current scheduling-order token assignment
  -> one detailRevision advance + authoritative snapshot publication
  -> deferred accepted facts replay once, then generation re-check
  -> moved(new revision + lane + 1-based position + sortable count)
```

边界 no-op、stale、notManageable、edit conflict、recovery pending/active、release reserved、
mutation pending 与 ownerGone 都是受控结果。move 不创建 capability、reservation、RPC、
deferred move 或 React owner。

### 双 lane 加载预算刷新

```text
move success
  -> capture ordinaryBudget + steerBudget
  -> read both lanes from cursor=null at returned revision
  -> follow each cursor in batches of 20 until its budget/end
  -> commit both prefixes only when every page has one revision
  -> first stale: discard all and restart once at returned latest revision
  -> second stale: stop, show existing live failure, return to latest initial pages
```

移动条目仍在前缀时恢复 item focus；移出前缀时只播报新位置并聚焦 lane heading/status，不扩大
预算、不自动定位。Show more 只增加对应 lane 的预算，实际 item 数可以小于预算。

### 后续调度与恢复

```text
ordinary move
  -> next eligible drain/promotion reads new ordinary head
  -> existing start/rejected-first/user-stop/start-recovery precedence unchanged

steer move
  -> next eligible issue reads new steerQueue head
  -> pendingSteers remain fixed read-only prefix
  -> target close/rejected transfer/restore read user-updated scheduling order
  -> outstanding recovery retains its existing precedence
```

move 本身不形成新的 start/steer claim。已经形成的 claim 不变；下一次既有 runtime/terminal/
recovery 调度机会消费新顺序。

### 公开与间接消费者

- queue domain authority：`composerInputQueueContracts.ts`、`composerInputQueue.ts`、
  `composerSteerQueueState.ts`；
- live owner interface：`composerInputQueueCoordinator.ts`；
- production consumer：`ComposerPendingInputDrawer.tsx`，通过现有
  `ComposerPendingInputRegion` / `ComposerTurnControl` controller 传递，无需新增 prop owner；
- direct test consumers：queue/coordinator tests、`ComposerTurnControl.browser.test.tsx`、
  `App.browser.test.tsx`、`composer-viewport.browser.test.tsx`；
- indirect owner/release consumers：`activeThreadOwner.ts` 与 `threadSwitchCoordinator.ts`，以及
  各自 tests；它们只消费现有 coordinator owner/readiness seam，已核验无需修改；
- generated output：`src/locales/en.po` 与 `src/locales/zh-CN.po`，只通过现有
  `messages:extract` 入口更新。

本计划不修改 app-server protocol、generated TypeScript RPC contract、validator、gateway、
Redux、TUI、主 Composer 或 Skill editor。

## 跨任务硬约束

1. 只有 ordinary recoverable 与纯本地 `steerQueue` intent 可排序；pending start、
   `pendingSteers`、rejected、outstanding recovery、delivery unknown、acquisition 和 reservation
   永远没有 movement。
2. owner 投影 movement；React 不从 visible index、items length、guidingCount、preview 或文本
   推导位置与边界。mutation 内再次裁决以覆盖 projection 后竞态。
3. move request 只包含 display key、revision 与 `earlier | later | first | last`。禁止 lane、数组
   index、cursor、目标 key 或完整排列输入。
4. moved 只推进一次 revision，返回 lane、一基 position 与 sortable count；边界 no-op 不推进
   revision、不 publish 成功、不播报成功。
5. ordinary/steer 都移动完整 owner slot，保持 message/display identity、draft/input、target、
   client identity、source、count 与 release blocker。
6. steer 的用户顺序必须成为 terminal/rejected/recovery 共同使用的 scheduling order。最终只能
   有一份权威顺序；不得新增与 `intentOrder` 漂移的第二个 rank map。
7. pending steer 保持固定前缀。“移到最前”只到 `steerQueue` 首位；position/count 只计算
   sortable suffix。
8. 任一 active edit/acquisition、recovery pending/active、release reservation、另一 management
   mutation、runtime replay 或 accepted mailbox 未清空时拒绝 move，不排队自动重试。
9. coordinator publication/replay 的 synchronous listener 重入必须被 mutation gate 覆盖；
   dispose/owner replacement 后不得继续 publish、replay、drain 或向新 owner 写入。
10. move 不生成 RPC 或排序专用 effect；既有 scheduler 下一次读取新顺序。新 enqueue 继续追加
    lane 尾部，ordinary promotion、rejected-first 和三类 recovery precedence 不变。
11. Drawer 只在列表态、manageable、非删除确认时显示操作。编辑态、delete-confirm、readOnly
    和 editing 不提供排序入口。
12. 常驻上/下使用 HeroUI `Button size="sm" variant="tertiary"`；首/尾使用当前 Drawer 内的
    HeroUI v3 `Dropdown.Popover` + `Dropdown.Menu onAction/disabledKeys`，不叠加 Dialog。
13. 不新增 drag handler、页码、绝对位置、Toast、第二 live region 或全局 Redux feedback。
14. 两 lane 各自保存 20 为步长的 load budget；成功后只原子提交同 revision 的双前缀。最多
    一次 stale restart，禁止无界追逐 revision。
15. 成功使用单一 polite status；失败沿用现有 Alert/ownerGone 关闭 seam。焦点恢复不能通过
    自动加载或搜索被移动条目实现。
16. 新 UI 文案使用 Lingui macro，并通过 `messages:extract` 更新 catalog；不运行 clean、不手写
    catalog reference、不新增 locale 分支。
17. Browser Mode 使用 role/name locator、真实 locator/user interaction、`expect.element` 或
    `expect.poll`；不使用 sleep、test id、placeholder/value API 或主观 padding/gap 数值断言。
18. typed in-process contract 使用 `Readonly`、private owner 与必要 copy；不加 freeze/proxy、
    宽 `unknown`、consumer mirror DTO、runtime validator 或 compatibility adapter。
19. 行为提交不夹带 import、声明、字段、分支、函数或组件的纯顺序调整。自动格式化若产生
    与行为无关的顺序移动，必须放入独立 pure-format 提交；禁止 amend。
20. 不安装依赖、运行时或浏览器，不执行 Git 远程操作，不运行后端/原生 build。只使用已经
    核验存在的项目脚本和 fnm-backed pnpm。

## 实施前硬门禁

用户确认本计划前不得实施。用户确认后：

1. 把本计划状态改为“已确认”，记录确认日期与确认原文；
2. 只提交本次 design 与 plan，形成独立 docs commit；
3. docs commit 成功前禁止修改代码或测试；
4. 后续每个 Task 完成修改、定向验证、相关文件 stage、staged diff 审查与独立本地提交后，
   才进入下一 Task；
5. 后续复审或修正一律创建新提交，禁止 amend；
6. 不触碰当前无关的未跟踪文档：
   - `docs/superpowers/specs/2026/08/23/2026-08-23-parallel-execution-graph-workflow-design.md`；
   - `docs/superpowers/plans/2026/08/23/2026-08-23-parallel-execution-graph-workflow-plan.md`。

## Task 0：提交已确认设计与计划

### 精确文件

- `docs/superpowers/specs/2026/08/23/2026-08-23-codex-gui-composer-pending-input-reordering-design.md`
- `docs/superpowers/plans/2026/08/23/2026-08-23-codex-gui-composer-pending-input-reordering-plan.md`

### 执行与检查

```bash
git status --short --branch
git add -- docs/superpowers/specs/2026/08/23/2026-08-23-codex-gui-composer-pending-input-reordering-design.md docs/superpowers/plans/2026/08/23/2026-08-23-codex-gui-composer-pending-input-reordering-plan.md
git diff --cached --check
git diff --cached --stat
git diff --cached -- docs/superpowers/specs/2026/08/23/2026-08-23-codex-gui-composer-pending-input-reordering-design.md docs/superpowers/plans/2026/08/23/2026-08-23-codex-gui-composer-pending-input-reordering-plan.md
git commit -m "docs(gui): plan pending input reordering"
```

提交后用 `git status --short` 确认只有用户原有范围外变更仍未提交。禁止 stage 上述两个文件以外
的路径。

## Task 1：建立 queue owner 的权威同 lane 排序

### 精确文件

- `codex-gui/src/features/composerInputQueue/composerInputQueueContracts.ts`
- 新建 `codex-gui/src/features/composerInputQueue/composerPendingInputMove.ts`
- `codex-gui/src/features/composerInputQueue/composerInputQueue.ts`
- `codex-gui/src/features/composerInputQueue/composerSteerQueueState.ts`
- 新建
  `codex-gui/src/features/composerInputQueue/__tests__/composerPendingInputReordering.test.ts`
- 仅在完整对象断言需要新增 movement 时机械更新：
  - `codex-gui/src/features/composerInputQueue/__tests__/composerInputQueue.test.ts`
  - `codex-gui/src/features/composerInputQueue/__tests__/composerSteerQueueState.test.ts`

### 实施内容

1. 在 frontend-owned contracts 增加 destination、movement、move request/result；保留现有
   management discriminant，不把 movement 混成新 lifecycle。
2. 新建共享 move module，只封装两个 lane 都使用的完整数组元素移动与目标 index 计算；不把
   owner 校验、revision、steer rank 或 UI 语义泄露到该 module。
3. ordinary page item 投影一基 position/count/canMoveEarlier/canMoveLater；只对 recoverable
   slot 提供 movement。
4. queue `movePendingInput` 复用现有 key + revision + active edit resolution，原子移动完整
   ordinary slot，成功推进一次 revision；stale/notManageable/conflict/noOp 明确返回。
5. steer state 为纯本地 intent 投影 sortable suffix position/capability，并提供同 lane move。
   复用当前 intent order token 集合按新数组顺序重新分配，不创建第二套 rank authority。
6. 让 target close、rejected transfer/restore 与 definite-failure recovery 继续读取更新后的
   scheduling order；pending/outstanding recovery 的 token 和既有 precedence 不变。
7. 通过公开 queue/state seam 验证完整后续 claim 和 lifecycle，不断言 splice 或 WeakMap
   内部实现。

### 定向验证

从 `codex-gui` 执行：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit -- src/features/composerInputQueue/__tests__/composerPendingInputReordering.test.ts src/features/composerInputQueue/__tests__/composerInputQueue.test.ts src/features/composerInputQueue/__tests__/composerSteerQueueState.test.ts
```

覆盖 ordinary/steer 四种 destination、边界 no-op、revision/cursor stale、active edit、pending
prefix、identity preservation、新 enqueue、promotion/claim 与 release/count 不变。steer 生命周期
必须显式覆盖 move→claim 与 claim→move 两种竞态、pending + sorted unsent 同 target 的 terminal/
not-steerable、mixed target、takeRejected→restoreRejected、rejected merge 后 definite-start-failure
recovery，以及 outstanding steer recovery 后 target close/restore；不得只用孤立 move 断言替代这些
组合链路。

### 提交

只 stage 本 Task 文件，执行 `git diff --cached --check` 与 staged diff 审查后提交：

```bash
git commit -m "feat(gui): add pending input reordering owner"
```

## Task 2：把 move 纳入 coordinator live-owner 事务

### 精确文件

- `codex-gui/src/features/composerInputQueue/composerInputQueueCoordinator.ts`
- `codex-gui/src/features/composerInputQueue/__tests__/composerInputQueueCoordinator.test.ts`

若新增 coordinator interface 使 Browser fake 出现直接类型错误，只为最终 interface 完整性机械
补齐方法，不在本 Task 实现 UI 行为：

- `codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx`
- `codex-gui/src/__tests__/App.browser.test.tsx`

### 实施内容

1. 在现有 coordinator interface 增加同步 `movePendingInput(request)`，使用 queue-domain
   request/result，不新增 adapter 或第二 owner。
2. 在调用 queue 前依次检查 disposed/generation、management mutation/runtime replay、release、
   recovery pending、`isRecovering` 与 active edit/acquisition。
3. 将 move 的 queue mutation、snapshot publication、accepted mailbox replay 与 generation
   复核放在同一有界 critical section；同步 listener 重入只能 defer，不能观察半结算状态。
4. moved 时清旧 management outcome、publish 新 revision、FIFO replay 一次 deferred accepted
   event，然后返回当前 generation 的最终权威 revision/position/count。
5. owner 在 publication/replay 中 dispose 或 replace 时优先返回 ownerGone，不继续 publish、
   replay、drain 或写 replacement owner。
6. noOp 与所有拒绝路径不留下 deferred move、不推进 revision、不发布成功、不形成 RPC。

### 定向验证

从 `codex-gui` 执行：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit -- src/features/composerInputQueue/__tests__/composerInputQueueCoordinator.test.ts
```

覆盖 moved/noOp/stale/notManageable、active edit/acquisition、release、recovery pending/active、
runtime replay/mailbox、listener 注入 accepted event、同步 dispose/replacement、单次 publication 与
“move 本身不调用 start/steer”。

### 提交

只 stage 本 Task 文件；执行 `git diff --cached --check`、`git diff --cached --stat` 并逐项审查
staged diff，确认没有范围外文件后提交：

```bash
git commit -m "feat(gui): coordinate pending input reordering"
```

## Task 3：接入 Drawer 排序交互、加载预算与可访问反馈

### 精确文件

- 新建 `codex-gui/src/features/composerTurnControl/composerPendingInputPages.ts`
- 新建
  `codex-gui/src/features/composerTurnControl/__tests__/composerPendingInputPages.test.ts`
- `codex-gui/src/features/composerTurnControl/ComposerPendingInputDrawer.tsx`
- `codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx`
- `codex-gui/src/__tests__/sequential/composer-viewport.browser.test.tsx`
- `codex-gui/src/locales/en.po`
- `codex-gui/src/locales/zh-CN.po`

### 实施内容

1. 提取 page-prefix module，集中表示两 lane load budget、按 20 cursor 读取、同 revision 原子
   结果、一次 stale restart 与二次 stale failure；不把 owner pages 复制成第二权威顺序。
2. Drawer 的初始预算各为 20；Show more 成功只增加对应 lane 预算。move 捕获两 lane 预算，
   仅在 coordinator moved 后按返回 revision 重读双前缀。
3. 增加独立 move success feedback。条目仍可见时恢复条目 group focus；移出前缀时聚焦 lane
   heading/status，只播报一次 position/count，不自动加载或定位。
4. live-owner failure 复用现有 Alert + refresh，ownerGone 复用 closeInvalidDrawer；noOp 不播报。
5. manageable 普通 action row 使用 `flex-wrap`，加入上/下 tertiary Buttons 和首/尾 Dropdown。
   availability 只消费 owner movement；Dropdown 使用稳定 item id/textValue、Label、onAction 与
   disabledKeys。
6. 删除确认继续替换整行 action；编辑态、preparing、editing/readOnly 不显示 move controls；
   不增加 drag、Dialog、Toast 或主 Composer 依赖。
7. 扩展 Browser harness，使 move 先改变其权威 details 与 revision，再由 Drawer 重读；禁止在
   DOM 中直接换位伪造 owner success。
8. 通过 `messages:extract` 生成上/下、首/尾、菜单、成功播报和失败反馈 catalog 引用，只补
   本任务新增的 `zh-CN` 翻译。

### 定向验证与生成

从 `codex-gui` 执行：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run messages:extract
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit -- src/features/composerTurnControl/__tests__/composerPendingInputPages.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --config=vitest.browser.parallel.config.ts src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --config=vitest.browser.sequential.config.ts src/__tests__/sequential/composer-viewport.browser.test.tsx
```

Browser 覆盖四个动作、边界 disabled、Dropdown keyboard/Escape、pending/readOnly/edit/delete
互斥、两 lane 不同预算、同 revision 原子重读、一次 stale restart、二次 stale Alert、移出前缀
不定位、单次 status/focus，以及 390×700 下 actions/menu/status 可滚动且无水平溢出。

检查 catalog diff，只保留本任务新增引用与翻译；不运行 `messages:extract:clean`。

### 提交

只 stage 本 Task 的 helper、Drawer、定向测试与两个 catalog；执行
`git diff --cached --check`、`git diff --cached --stat` 并逐项审查 staged diff，确认没有范围外
文件后提交：

```bash
git commit -m "feat(gui): manage pending input order in drawer"
```

## Task 4：验证 App 真实发送顺序与 owner 生命周期

### 精确文件

- `codex-gui/src/__tests__/App.browser.test.tsx`

### 实施内容

1. 扩展 App 的 direct coordinator consumer/fake，完整支持 movement 与 move interface，不使用
   optional method 或宽断言。
2. 增加真实 active-owner ordinary 纵向用例：在 active turn 中排队多条 ordinary，通过 Drawer
   排序后完成当前 turn，断言 generated `turn/start` input 严格按新顺序发送。
3. 增加真实 steer 纵向用例：保持一个 issuing/pending steer 固定，排序纯本地 steer 后缀，
   断言后续 `turn/steer` 保持 expected turn/client identity 并按新顺序 issue。
4. 覆盖 recovery pending/active 或 owner replacement 时 move 被拒绝，不缓存 deferred move，
   恢复/新 owner 继续使用各自权威事实。
5. 断言排序不生成额外 RPC、不改变 transcript visibility、release blocker 或已经形成的 claim。

### 定向验证

从 `codex-gui` 执行：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --config=vitest.browser.parallel.config.ts src/__tests__/App.browser.test.tsx
```

### 提交

只 stage App Browser test；执行 `git diff --cached --check`、`git diff --cached --stat` 并逐项
审查 staged diff，确认没有范围外文件后提交：

```bash
git commit -m "test(gui): verify pending input reordering integration"
```

## 最终验证与修正纪律

先确认 fnm-backed pnpm 可用且未解析到 Codex runtime shim。然后从 `codex-gui` 执行：

```bash
/opt/homebrew/bin/fnm exec --using-file which pnpm
/opt/homebrew/bin/fnm exec --using-file pnpm --version
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
/opt/homebrew/bin/fnm exec --using-file pnpm run lint
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit -- src/features/composerInputQueue/__tests__/composerPendingInputReordering.test.ts src/features/composerInputQueue/__tests__/composerInputQueue.test.ts src/features/composerInputQueue/__tests__/composerSteerQueueState.test.ts src/features/composerInputQueue/__tests__/composerInputQueueCoordinator.test.ts src/features/composerTurnControl/__tests__/composerPendingInputPages.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --config=vitest.browser.parallel.config.ts src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx src/__tests__/App.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --config=vitest.browser.sequential.config.ts src/__tests__/sequential/composer-viewport.browser.test.tsx
```

检查 `which pnpm` 输出不位于 `~/.cache/codex-runtimes/`；若仍解析到 Codex runtime shim，停止并
报告，不继续执行包命令。

若 `format:oxfmt` 失败，先记录 `git status --short` 与当前 diff。若存在本计划范围外且可能被
formatter 改写的用户变更，停止并报告，不运行全目录 fix。工作树边界安全时，只运行项目固化
fix 入口：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt:fix
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
```

运行后立即比较执行前后的 `git status --short` 与 `git diff`。若产生范围外变化，停止处理，
不得 stage；若只产生本计划文件中的必要修正，则重新运行非 fix format 检查。若 fix 只产生与
行为无关的顺序调整，创建独立 pure-format 提交；只 stage 本计划范围文件，执行
`git diff --cached --check`、`git diff --cached --stat` 并逐项审查 staged diff 后再提交，不得
并入行为提交或 amend。

全部前端验证通过后，先记录仓库根的 `git status --short` 与当前 diff。若存在本计划范围外且
可能被 formatter 改写的用户变更，停止并报告，不运行全仓格式化。工作树边界安全时，从
`codex-rs` 执行仓库要求的格式化：

```bash
just fmt
```

按仓库规则，`just fmt` 后不重新运行测试。回到仓库根执行：

```bash
git status --short
git diff --check
git diff
git log --oneline -8
```

比较 `just fmt` 前后的状态与 diff；若出现范围外变化，停止处理且不得 stage。若只产生本计划
范围内的必要格式化，按上述 pure-format 提交门禁独立提交。最终检查每个 Task 都有独立提交，
只有本计划文件在预定提交中，未触碰用户范围外文件。若最终验证发现本次变更引入的问题，在
同一计划范围内修正、运行受影响的定向验证，并创建新的独立 fix 提交；禁止 amend。预存或无关
失败只报告，不借本计划修复。

## 完成条件

- owner-projected movement 与实际 move 边界一致，React 不推算顺序；
- ordinary/steer 四种 move 改变下一次真实发送顺序，边界 no-op 不改变 revision；
- steer target close、rejected restore 与 recovery 不回退到旧 insertion order；
- coordinator 在 edit/recovery/release/replay/dispose 下无双 owner、无 deferred move、无额外 RPC；
- Drawer 只有按钮与 Dropdown 排序，没有拖拽，双 lane 加载预算和一次 stale restart 正确；
- 移出前缀时不自动定位，成功/失败播报与焦点符合设计；
- App 与窄 viewport Browser 回归证明真实交互、发送顺序和 responsive 可用性；
- Lingui catalog、format、lint、type-check、定向 unit/Browser 与 `just fmt` 全部完成；
- design/plan 与 Task 1–4 分别形成独立本地提交，无 Git 远程操作。
