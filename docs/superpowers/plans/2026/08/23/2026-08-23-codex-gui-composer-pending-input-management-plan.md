# Codex GUI Composer 待处理输入管理实施计划

计划日期：2026-08-23

计划状态：已确认

确认日期：2026-08-23

确认原文：确认计划，开始实现

对应已确认设计：
`docs/superpowers/specs/2026/08/23/2026-08-23-codex-gui-composer-pending-input-management-design.md`

关联 research：
`docs/superpowers/research/2026/08/22/2026-08-22-codex-gui-pending-input-management-and-skill-editing.md`

## 目标

在现有 `Pending details` Drawer 中为纯本地 ordinary 和尚未 issue 的 `steerQueue` 条目增加
逐条编辑与删除；编辑使用 Drawer 内独立 `ComposerEditor`，通过 queue owner 的原位
reservation 保持 lane、message identity 与 FIFO。已经进入发送链的 `pendingSteers` 始终
只读，现有 start/steer 对账、rejected-first、recovery、thread release 和 dispose 语义不变。

## 当前代码必要性

当前 HEAD 基线为 `58f055fa0327569606f22ff6a9c2994c48626ce6`，分支为 `dev`。实施前
必须重新核验，不能把这两个值当作未来执行时的固定事实。

- `composerInputQueueContracts.ts` 的 `ComposerPendingInputPageItem` 只有 key、lane 与 preview；
  steer 页混排 `pendingSteers` 与 `steerQueue`，Drawer 无法从当前 contract 判断可管理性。
- `composerInputQueue.ts` 的 ordinary 是 `ComposerQueueMessage[]`，`drainNextStart()` 直接
  `shift()`；当前没有可占据原 slot、阻止后继越序的 domain variant，也没有 begin/delete
  CAS 或 opaque edit capability。
- `composerSteerQueueState.ts` 的 `steerQueue` 是 `SteerIntent[]`，`issueNext()` 直接
  `shift()`；target terminal 与 not-steerable 会遍历并移走同 target 的全部 unsent intents。
  若只在 React 中“锁定”条目，steer drain 和 terminal 路径仍会穿过或遗漏它。
- `composerInputQueueCoordinator.ts` 已集中 generation、async effects、recovery、interrupt、
  release reservation 和 dispose。长期 edit capability 必须在这里参与 `canStop`、recover、
  release 和 dispose；Drawer 不能另建生命周期 owner。
- `ComposerPendingInputDrawer.tsx` 当前只有分页、Disclosure 与关闭焦点逻辑，没有三态管理、
  mutation 反馈或独立 editor。它每次 `detailRevision` 变化都会重读列表，不能让已成功 begin
  的编辑会话继续依赖旧 revision。
- `ComposerEditor.tsx` 已有 capture/restore、IME、clipboard 和 Skill validity seam；
  `SkillTypeaheadPlugin.tsx` 当前通过传入 parent 建 portal，但 anchor/class 仍面向底部 Composer
  的向上布局。Drawer 需要独立 parent 与适合 dialog 内的定位，不能复用主 Composer 实例。
- `threadSwitchCoordinator.ts` 使用 `reserveRelease()` 保护整个 queue owner 的释放。item
  reservation 必须继续表现为原 lane blocker，而不能复用该全局 release capability。

因此本功能不是给只读条目加两个按钮；必须先在 queue/steer/coordinator 的权威状态机中
建立 mutation 与 reservation，再把受控能力接到 Drawer。

## 已核验的完整纵向路径

### 读取与管理入口

```text
ComposerInputQueueImpl / ComposerSteerQueueImpl（唯一消息 owner）
  -> detailRevision + bounded page item management projection
  -> ComposerInputQueueCoordinator（thread generation / dispose owner）
  -> ComposerTurnControl（当前 thread + Skill catalog）
  -> ComposerPendingInputRegion
  -> ComposerPendingInputDrawer list
       -> begin edit / delete CAS(key + detailRevision)
```

### 编辑事务

```text
Drawer Edit
  -> mount one independent ComposerEditor in Drawer dialog
  -> queue validates owner + key + revision + local lifecycle + exact slot
  -> synchronous editor.restore(saved draft)
       -> invalidDraft: editor and queue unchanged
       -> restored: message becomes same-slot reservation
  -> opaque capability
       -> save(new capture): same identity/lane/slot, replace draft + input
       -> cancel(): same slot, restore original message
  -> advance detail revision + publish + emit affected-lane drain intent
  -> coordinator gate
       -> no recovery: form the next eligible claim
       -> recovery pending/isRecovering: merge deferred lane intent; form no claim
  -> recover finishes -> lane-specific existing order
       -> ordinary: finish recovery restore, then an existing deferred successor effect or the
          management deferred lane intent; recovered failed message follows its current restore position
       -> steer: restore failed intent to steer head and retry it before successors
  -> flush/merge management drain intent without overtaking those lane rules
```

### 删除事务

```text
Drawer item-local confirmation
  -> delete CAS(key + detailRevision)
  -> remove exact still-local slot
  -> forget display/message ownership
  -> advance revision + publish + emit affected-lane drain intent
  -> coordinator applies the same recovery gate before any claim is formed
```

### Ordinary 调度

```text
ordinary FIFO
  -> earlier messages may form StartClaim
  -> reservation at head blocks drainNextStart and ordinary promotion
  -> save/cancel replaces marker in place
  -> normal start / definite failure recovery / delivery unknown / terminal
     continue through existing StartQueueState paths
```

### Steer 调度与失效

```text
steerQueue FIFO
  -> earlier intents may form SteerClaim and enter pendingSteers (read-only)
  -> reservation at head blocks issueNext
  -> save/cancel preserves threadId + expectedTurnId + clientUserMessageId + source
  -> terminal / activeTurnNotSteerable closes target
       -> queue transition emits exact draft-free edit invalidation fact
       -> coordinator immediately clears edit gate and invalidates capability
       -> original entry follows existing rejected-first classification
       -> coordinator publishes; Drawer exits edit, drops temporary edits, refreshes and reports
```

### Thread 生命周期

```text
activeThreadOwner
  -> queue coordinator
  -> original lane count/release blocker includes reservation
  -> threadSwitchCoordinator.reserveRelease cannot pass while blocker exists
  -> coordinator dispose/replacement emits ownerGone cause and invalidates edit capability plus all
     old reads/mutations; old Drawer closes instead of holding
```

权威 wire input 仍机械派生自 generated `TurnStartParams["input"]` 与
`TurnSteerParams["input"]`。本计划不修改 Rust app-server、generated contracts、validator、
gateway 或 allowlist；编辑 mutation 只处理 RPC 前的 frontend-owned `ComposerDraft` 与已有
generated-contract-derived input。

## 跨任务硬约束

1. 只有 ordinary 与 `steerQueue` 条目可管理；`pendingSteers`、pending start、rejected、
   recovery owner 与 `deliveryUnknown` 不得获得 edit/delete capability。
2. page item 的 `manageable`、`editing`、`readOnly` 由 queue owner 投影。React 不按 lane、
   页位置、preview 或按钮状态猜生命周期。
3. begin/delete 获取阶段使用 display key + `detailRevision` 做 CAS；begin 成功后的 save/cancel
   只使用 opaque、单次结算、绑定原 slot 的 capability，不继续依赖旧全局 revision。
4. `restore(draft)` 只有返回 `restored` 才安装 marker；`invalidDraft` 时 editor、queue、revision
   和 effects 全不变。
5. marker 是原数组 slot 的 domain variant，继续计入 count、分页、cursor offset 与现有 lane
   release blocker；前序可 drain，marker 到头阻塞后序。
6. save 只替换 `draft + input`；保留 message id、display key、lane、slot 和 steer target/client
   identity/source。cancel 恢复原内容。空 capture 与 invalid Skill 不得保存成功。
7. save/cancel/delete 成功后必须产生受影响 lane 的 drain intent；coordinator 只有在
   `recovery == null && !isRecovering` 时才能据此形成 StartClaim/SteerClaim。recovery gate
   期间合并 deferred lane intent，recover 完成后按各 lane 既有顺序 flush：ordinary 先完成
   recovery restore，再执行已有 deferred queued successor effect；marker 恰在头而不存在该
   effect 时，执行 management deferred lane intent。recovered failed message 按当前 ordinary
   恢复位置随后发送；steer 把 failed intent 恢复到队首并优先 retry。不得用
   一个统一 retry-first 规则覆盖两条 lane，不得等待无关 runtime event或提前发 claim。
8. ordinary promotion、start definite failure、user-stop recovery、steer recovery、target close、
   rejected transfer 和 terminal 遍历必须显式识别 marker，不得以 filter、cast 或空 input 绕过。
9. active edit 使 `canStop=false`；begin 与现有 interrupt/recovery/release owner 冲突时拒绝。
   App dispose 可失效 capability，但不能把旧 capability 写入 replacement thread。
10. target terminal/not-steerable 移走 reserved steer 时，queue transition 必须携带精确、
    不含 draft 的 edit invalidation fact（或等价的单一 owner projection）；coordinator 立即清除
    active edit gate、使 capability 失效并发布。Drawer 不等待 save/cancel、不扫描第一页、
    不自行猜测失效。
11. Drawer 只有列表、单条编辑、条目内删除确认三态；不叠加 Dialog，不复用主 Composer，
    不新增重排、lane 转换、批量操作或 Undo。
12. 普通外部 drain 使两组为空时继续按现有语义自动关闭 Drawer；最后一项因 save、cancel
    后立即 drain、delete 或 target invalidation 消失时，进入 management-completion hold，
    保持 Drawer 列表态、heading 与焦点直到用户显式关闭，通用 `hasPendingInputs` effect 不得
    抢先卸载。成功 save/delete/cancel 只结算、刷新与恢复焦点，不显示 Alert。同一 live owner
    内的 target/session invalidation、stale、notManageable、invalid draft/input 等失败保持
    management hold 并显示 Alert；coordinator disposed 或 owner replacement 属于 owner-gone，
    绝不保持旧 Drawer、调用旧 capability/controller 或显示旧 owner Alert，按既有 owner
    replacement/dispose 与焦点语义关闭旧 Drawer或切换新 owner 列表。
13. queue/coordinator 的 controlled result 与 invalidation projection 必须用 discriminant 明确
    区分 `liveOwner` 竞态失败和 `ownerGone`（disposed/replaced）失效，并在 ownerGone 中携带
    dispose/replacement cause；UI 只按该权威 reason 和当前 controller identity 行为，不把所有
    unavailable 统一成 hold，也不通过 count、分页或 timing 猜原因。
14. 最终只有一条管理路径。禁止 optional reservation、旧 mutation + 新 mutation 双写、
    input-only fallback、adapter、兼容 overload、React 乐观 owner 或从 input 反编译 draft。
15. typed in-process contract 使用 `Readonly`、private owner 和必要 copy；不加 freeze/proxy，
    不手写 authoritative wire DTO 或 runtime validator。
16. 行为提交不得夹带 import、声明、字段、分支、函数或组件的纯顺序调整。若格式化产生纯
    顺序/换行差异，放入独立 pure-format 提交，禁止 amend。
17. 不安装依赖、运行时或浏览器，不操作 Git 远程，不运行后端/原生构建。前端测试、lint、
    type-check、catalog 生成和仓库要求的 `just fmt` 允许按本计划执行。

## 实施前硬门禁

用户确认本计划前不得实施。用户在计划正文尚不存在时预先说“确认计划”或“开始实现”，不构成
对本文件的确认。

用户确认实际计划后：

1. 把本计划状态改为“已确认”，记录确认日期与确认原文；
2. 只提交本次 design 与 plan，形成独立 docs commit；
3. docs commit 成功前禁止修改代码或测试；
4. 后续每个任务完成范围内修改、定向验证、staged diff 审查并创建一个独立本地提交后，
   才进入下一任务；任何修正使用新提交，禁止 amend。

## Task 0：提交已确认设计与计划

### 精确文件

- `docs/superpowers/specs/2026/08/23/2026-08-23-codex-gui-composer-pending-input-management-design.md`
- `docs/superpowers/plans/2026/08/23/2026-08-23-codex-gui-composer-pending-input-management-plan.md`

明确排除 ignored research、旧 design/plan、代码、测试、catalog 与其他用户变更。

### 执行与检查

```bash
git status --short --branch
git add -- docs/superpowers/specs/2026/08/23/2026-08-23-codex-gui-composer-pending-input-management-design.md docs/superpowers/plans/2026/08/23/2026-08-23-codex-gui-composer-pending-input-management-plan.md
git diff --cached --check
git diff --cached --name-only
git diff --cached
git commit -m 'docs(gui): plan pending input management'
```

`git diff --cached --name-only` 必须恰好只有上述两个路径。提交失败立即停止，不绕过门禁。

## Preflight（docs commit 后、代码修改前）

以下检查从仓库根执行：

```bash
git status --short --branch
git rev-parse --abbrev-ref HEAD
git rev-parse HEAD
test -x /opt/homebrew/bin/fnm
test -d codex-gui/node_modules
test -d ../vitest/docs
rg -n -e 'ComposerPendingInputPageItem' -e 'readPendingInputPage' -e 'readPendingInputDetail' -e 'reserveRelease' -e 'ComposerInputQueueCoordinator' codex-gui/src
rg -n -e 'steerQueue' -e 'pendingSteers' -e 'issueNext' -e 'removeUnsentTarget' -e 'drainNextStart' -e 'drainSteer' codex-gui/src/features/composerInputQueue
rg -n -e 'ComposerPendingInputDrawer' -e 'skillMenuParent' -e 'SkillTypeaheadPlugin' -e 'onPresenceChange' codex-gui/src
```

以下检查从 `codex-gui` 目录执行：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm --version
```

要求：

- 分支仍为 `dev`。HEAD 或消费者相对本计划证据漂移时，先只读更新实际影响面；不能按旧
  行号或旧文件清单机械实施。
- 除 docs commit 外若有用户变更，逐文件避让；与计划文件重叠且无法安全避让时停止。
- fnm、pnpm、`node_modules`、本地 Vitest docs 或既有浏览器二进制缺失时停止，请用户自行
  安装；助手不得安装。
- 所有 pnpm 命令从 `codex-gui` 目录执行，并使用
  `/opt/homebrew/bin/fnm exec --using-file pnpm ...`。
- `package.json` 中已核验存在 `format:oxfmt`、`format:oxfmt:fix`、`lint`、`type-check`、
  `test:unit`、`test:browser:parallel`、`test:browser:sequential` 与 `messages:extract`；执行前
  若脚本漂移，停止并更新计划，不编造等价入口。

## Task 1：建立 management contract 与 ordinary 原位 reservation

本任务是一个独立 queue-domain 行为提交。中间提交允许 steer 分支尚未取得完整 reservation
行为；不得为临时完整性加入 optional marker、兼容 overload 或 fallback。

### 精确文件

生产代码：

- `codex-gui/src/features/composerInputQueue/composerInputQueueContracts.ts`
- `codex-gui/src/features/composerInputQueue/composerInputQueue.ts`

测试：

- `codex-gui/src/features/composerInputQueue/__tests__/composerInputQueue.test.ts`
- `codex-gui/src/features/composerInputQueue/__tests__/composerInputQueueTestFixtures.ts`（仅当现有
  fixture 需要为完整 management request/result 提供合法构造）

### 行为与 interface

- 为 page item 增加 owner-derived management discriminant，至少区分 manageable、editing 与
  read-only delivery-in-progress；不向页面暴露 draft、message id、claim 或可发送 payload。
- 定义 begin/delete 请求与受控结果，以及 opaque edit reservation capability 的公开只读
  seam。capability 的 token/slot/rollback escrow 保持 queue-private。
- ordinary 内部数组改为 message/reservation 的 exhaustive union。begin 使用 key + revision
  找到确切 manageable ordinary slot；同步 restore 成功才原位替换 marker，失败完全不变。
- capability save/cancel 单次原位结算。save 拒绝空 capture，只替换同 identity 的 draft +
  input；cancel 恢复原 message。
- delete 用同一 CAS 边界删除确切 ordinary message，不创建 session；成功后忘记 identity、推进
  revision，并返回 ordinary drain intent。queue transition 在本任务只表达候选 drain，不因
  management 结算提前形成 StartClaim；Task 3 的 coordinator gate 决定立即 drain 或延后合并。
- `drainNextStart()`、ordinary promotion、分页、详情、count 与 release projection 对 marker
  做 exhaustive handling：前序可 drain，marker 到头停止，后序不越过。
- 同一 queue 同时只允许一个 Drawer edit session；第二次 begin 返回 controlled conflict，
  不创建第二个内容 owner。

### 测试不变量

- begin 的 foreign/stale key、旧 revision、pending/nonexistent 条目均不 mutation。
- restore 返回 invalid 时完整 queue view、page、effects 与 editor probe 均不变。
- marker 在 ordinary 头/中/尾时 count、page key、cursor 与 release blocker 不变；前序 drain
  后 marker 成为头并阻塞后序。
- save/cancel 保持完整 message identity/lane/slot；detail revision 可在前序 drain 后变化而
  capability 仍结算。
- empty save、双结算、旧/伪 capability 不修改 owner。
- delete 头/中/尾后保持剩余 FIFO，stale delete 不显示为成功；save/cancel/delete 的结果携带
  ordinary drain intent 而不是预先创建的 StartClaim。
- ordinary promotion、start accepted/definite failure/delivery unknown/terminal 不越过 marker。
- queue-level 顺序覆盖 `start failure -> reservation settle/delete -> recover -> existing deferred
  successor effect or management deferred lane intent -> recovered failed message`：management
  结算在 recovery gate 内不新增 claim；recover 先按当前 ordinary 语义重新放置 failed message。
  failure 时已有 queued successor claim/effect 则先执行它；marker 恰在头而不存在该 effect 时，
  flush management deferred lane intent。recovered failed message 留在其恢复位置随后发送；若
  不存在更早 ordinary，仍允许 recovery 按当前语义直接为 recovered message 形成 claim，
  不得强制把 ordinary 改成 retry-first。

### 定向验证

从 `codex-gui` 执行：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit -- src/features/composerInputQueue/__tests__/composerInputQueue.test.ts
```

### 提交边界

只暂存本任务实际修改文件，检查 `git diff --cached --check`、name-only 与完整 staged diff。

建议提交标题：

```text
feat(gui): reserve ordinary pending input edits
```

## Task 2：让 steer 全生命周期识别原位 reservation

本任务完成 steer domain 行为，形成一个独立提交；不修改 coordinator 或 React。

### 精确文件

生产代码：

- `codex-gui/src/features/composerInputQueue/composerSteerQueueState.ts`
- `codex-gui/src/features/composerInputQueue/composerInputQueue.ts`
- `codex-gui/src/features/composerInputQueue/composerInputQueueContracts.ts`（仅当 Task 1 的共享
  management result 需要补充 steer-specific controlled reason）

测试：

- `codex-gui/src/features/composerInputQueue/__tests__/composerSteerQueueState.test.ts`
- `codex-gui/src/features/composerInputQueue/__tests__/composerInputQueue.test.ts`

### 行为与 interface

- `steerQueue` 使用 intent/reservation 的 exhaustive union；page projection 对 pending steer
  返回 read-only，对 unsent intent 返回 manageable，对 marker 返回 editing。
- begin 只允许仍在 `steerQueue` 的 exact slot；save/cancel 保留 threadId、expectedTurnId、
  clientUserMessageId、source、message/display identity 与 slot。
- `issueNext()` 遇到 marker 停止；较早 intent 可以继续 issue，marker 后的 intent 不越过。
- delete 只删除 unsent intent，并在结算后返回 steer drain intent；queue transition 不在
  coordinator recovery gate 之前形成 SteerClaim。
- target terminal、active-turn-not-steerable、`removeUnsentTarget()`、rejected transfer、
  recovery restore 与 commit/settlement 编排显式处理 marker。target 关闭并移走 reserved steer
  时，transition 同步携带精确、draft-free 的 edit invalidation fact（包含足以匹配当前 edit
  session 的 owner identity/key/lane 与原因，不携带 draft/input）；原消息按既有
  rejected-first 顺序归类，编辑临时修改不进入 rejected/recovery。
- definite failure transfer 与 restore 不能把 intent 插过 marker；普通 terminal/rejected 批量顺序
  与现有 pending-before-unsent 语义保持一致。

### 测试不变量

- steer marker 在头/中/尾时前序可 issue、后序被阻塞，count/page/release blocker 不减少。
- save/cancel 后发出的 RPC-domain claim 使用新/原 input，但所有 steer identity 完全保持。
- pending phases `issuing`、`acceptedAwaitingCommit`、`deliveryUnknown`、
  `responseTurnMismatch` 始终 read-only，begin/delete 被拒绝。
- target terminal 与 active-turn-not-steerable 在 reservation 期间失效 capability，并按原条目
  顺序进入 rejected-first；transition 只产生一个权威 invalidation fact，旧 save/cancel 不复活
  条目。
- definite failure recovery/restore、terminal-before-settlement 与 stale settlement 不丢失、不
  重复、不越过 marker。
- queue-level 顺序覆盖 `steer failure -> reservation settle/delete -> recover -> failed intent retry
  -> successor`：management 结算在 recover 前只有 steer drain intent，不形成 successor claim；
  recovery 继续把 failed intent 恢复到 steer 队首并优先 retry。

### 定向验证

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit -- src/features/composerInputQueue/__tests__/composerSteerQueueState.test.ts src/features/composerInputQueue/__tests__/composerInputQueue.test.ts
```

### 提交边界

只暂存本任务实际修改文件并审查 staged diff。

建议提交标题：

```text
feat(gui): preserve steer slots during pending edits
```

## Task 3：在 coordinator 收口 capability、release、recovery 与 dispose

本任务形成独立 coordinator 行为提交；不接 UI。

### 精确文件

生产代码：

- `codex-gui/src/features/composerInputQueue/composerInputQueueCoordinator.ts`
- `codex-gui/src/features/composerInputQueue/composerInputQueueContracts.ts`（仅补 coordinator
  public result 所需共享类型）
- `codex-gui/src/features/projectionCoordination/activeThreadOwner.ts`（只把 dispose cause 传给
  queue coordinator）
- `codex-gui/src/features/projectionCoordination/threadSwitchCoordinator.ts`（只在 committed
  replacement 清理旧 owner 时传递 `ownerReplaced`，不接入 item reservation）

测试：

- `codex-gui/src/features/composerInputQueue/__tests__/composerInputQueueCoordinator.test.ts`
- `codex-gui/src/features/projectionCoordination/__tests__/activeThreadOwner.test.ts`
- `codex-gui/src/features/projectionCoordination/__tests__/threadSwitchCoordinator.test.ts`

### 行为与 interface

- controller 公开 begin/delete；begin 接受同步 restore callback，成功后返回不暴露内部 token
  的 save/cancel capability。所有结果为 discriminated union，不抛出可预期竞态，并明确区分：
  同一 live owner 内的 `stale`/`notManageable`/`targetInvalidated`/`sessionInvalidated`，以及
  `ownerGone` 下的 `disposed`/`ownerReplaced`。具体 variant 名可等价调整，但 scope/cause 不能
  丢失，不能只返回无原因的 `unavailable`。
- controller 用 generation/disposed/release/recovery/interrupt/edit 状态守住获取与结算；begin
  在 recovery owner 已存在时拒绝新 edit，已有 capability 的 save/cancel 及独立 delete 仍可
  结算本地 slot，但其 drain intent 受 recovery gate 延后。异步 start/steer settlement 继续先
  核验 generation。
- begin/save/cancel/delete 统一 consume queue transition、发布 snapshot 并处理 drain intent；
  不在 controller 保存第二份 message/draft。若 `recovery != null` 或 `isRecovering`，只完成
  slot 结算并把 lane 合并进 deferred drain set，不调用会形成 StartClaim/SteerClaim 的 queue
  drain；recover 成功完成后做 lane-aware flush。ordinary 先完成当前 `queue.submit(recovered)`
  恢复，再执行 failure transition 已保存的 queued successor effect；若 marker 在头且没有该
  effect，则执行 management deferred lane intent，并让 recovered failed message 按 ordinary
  当前恢复位置随后发送。steer 先 `restoreSteerRecovery` 到队首并产生 retry，再处理
  successors。management intents 在不越过上述顺序的前提下去重/合并。
- edit session 活跃时 `canStop=false`、`recover()` 不取得冲突 owner、release readiness 仍显示
  原 lane blocker；不得调用或持有 thread-switch `reserveRelease()` 作为 item capability。
- user-stop、start/steer definite recovery 与 terminal 到达时，queue 的 marker 结果被完整发布；
  target close transition 携带的 draft-free invalidation fact 是唯一外部失效传播 seam。
  coordinator 必须在同一次 transition consumption 中匹配 active session、立即清除 edit gate、
  使 capability 失效并发布 `liveOwner` management outcome；不得等待后续 save/cancel 或 UI
  读页触发。
- dispose 接受/记录权威 cause，至少区分 coordinator/App `disposed` 与 committed owner
  replacement 的 `ownerReplaced`；清理 listener/generation、使 capability 和 mutation 返回
  对应 `ownerGone` result，不启动新 drain。release reservation 与 edit reservation 保持不同
  类型和生命周期。

### 测试不变量

- begin/delete 委托保持 owner CAS，snapshot revision 与 management projection同步更新。
- active edit 阻止 Stop/release；save/cancel/delete 在无 recovery gate 时恢复正确 lane drain，
  recovery pending/isRecovering 时 management 路径只合并 deferred intent、不形成新的 claim；
  recover 完成后先运行各 lane 已有的 deferred successor/retry effect，再以 lane-aware 方式处理
  management intent。
- earlier drain 的 async settlement 推进 revision 后 capability 仍能结算。
- ordinary 覆盖 `failure -> reservation settle/delete -> recover -> existing deferred successor
  effect or management deferred lane intent -> recovered failed message`，steer 覆盖 `failure ->
  reservation settle/delete -> recover -> failed retry -> successor`；两者在 recover 前都不因
  management intent 新建 claim，local Stop/user-stop recovery、terminal 与 marker 组合均不越序。
- target close 使旧 capability 返回 live-owner invalidation；dispose/owner generation
  replacement 使其返回带 cause 的 ownerGone。重复结算无 effect，不向新 owner写入。
- controlled result 测试证明 live-owner invalidation 与 owner-gone dispose/replacement 原因不可
  混淆；旧 controller/capability 在 ownerGone 后只返回带 cause 的结果且不发布可让旧 Drawer
  继续 hold 的 live outcome。
- target terminal/not-steerable 的 invalidation 在没有 save/cancel 调用、没有新 page read 的
  情况下也会立即清除 active edit gate并发布一次；fact 不含 draft/input，重复 runtime fact
  不重复通知。
- release readiness 继续使用 `ordinaryQueued`/`steerQueued` 原 blocker，未出现
  item-reservation 冒充 `releaseReserved`。

### 定向验证

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit -- src/features/composerInputQueue/__tests__/composerInputQueueCoordinator.test.ts src/features/projectionCoordination/__tests__/activeThreadOwner.test.ts src/features/projectionCoordination/__tests__/threadSwitchCoordinator.test.ts
```

### 提交边界

只暂存 coordinator、必要 contract、窄 scope 的 owner cause wiring 与上述测试，审查 staged
diff；`threadSwitchCoordinator.ts` 不得出现 item reservation 或调度逻辑。

建议提交标题：

```text
feat(gui): coordinate pending input management
```

## Task 4：支持 Drawer-scoped ComposerEditor 与 Skill portal

本任务建立独立编辑器复用 seam，形成一个独立行为提交；不提前增加 Drawer 管理按钮。

### 精确文件

生产代码：

- `codex-gui/src/features/composerEditor/ComposerEditor.tsx`
- `codex-gui/src/features/composerEditor/SkillTypeaheadPlugin.tsx`

测试：

- `codex-gui/src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx`

### 行为与 interface

- 保持每次 `ComposerEditor` 挂载拥有独立 Lexical instance、history、controller 和 composition
  state；不引入全局 singleton 或共享主 Composer controller。
- 把 Skill menu 的 portal parent 与布局方向/anchor 语义做成明确、窄小的 editor-owned 配置；
  现有底部 Composer 行为不变，Drawer 变体可把 popup 留在 dialog 内并适配可用空间。
- Escape 的 typeahead command 继续先关闭 popup；该按键被消费时不能冒泡触发外层 Drawer
  cancel。IME composition Enter 与 composition-end guard 保持现有行为。
- submit intent contract 保持现有 ordinary/guide，不新增 queue lane 到通用 editor；Drawer
  wrapper 在下一任务把任一非换行 submit intent 映射为 Save。
- 继续使用同一 capture/restore、clipboard、Skill validity/retry 与 invalid-path 语义；不修改
  draft 或 wire contract。

### Browser 验证

- 同页挂载两个 ComposerEditor 时 controller、draft、selection、history 和 typeahead 互不
  污染。
- Drawer-style portal parent 内的 listbox 可见、受可用高度约束，pointer/keyboard 选择后焦点
  回到对应 editor。
- typeahead 打开时 Escape 只关闭 menu；IME Enter 不 submit；Shift+Enter 仍换行。
- 原底部 Composer menu 行为与现有 Skill catalog loading/retry/invalid tests继续通过。

### 定向验证

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:parallel -- src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx
```

### 提交边界

只暂存上述 editor 文件与测试并审查 staged diff。

建议提交标题：

```text
feat(gui): support drawer scoped composer editing
```

## Task 5：实现 Drawer 三态管理 UI、Lingui 与组件验证

本任务一次性接入用户可见管理能力，形成一个独立行为提交。不保留只读 Drawer 与管理
Drawer 双路径。

### 精确文件

生产代码：

- 新建 `codex-gui/src/features/composerTurnControl/ComposerPendingInputEditor.tsx`，内聚独立
  editor session、restore/capture、Save/Cancel、validity 与 Drawer portal；若实施时证据证明
  更窄的 sibling module 名更符合现有职责，可等价调整，但不得把独立 editor owner 塞进
  `ComposerTurnControl.tsx`。
- 修改 `codex-gui/src/features/composerTurnControl/ComposerPendingInputDrawer.tsx`。
- 修改 `codex-gui/src/features/composerTurnControl/ComposerPendingInputRegion.tsx`。
- 修改 `codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx`。

测试与生成物：

- `codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx`
- `codex-gui/src/locales/en.po`
- `codex-gui/src/locales/zh-CN.po`

### HeroUI 与交互落点

- 保留 `Drawer.Backdrop/Content/Dialog/CloseTrigger/Header/Heading/Body/Footer` 的唯一 overlay；
  编辑态 Save/Cancel 固定放在 `Drawer.Footer`，不随可滚动 editor body 漂移。
- 列表 item 使用语义 list/section；编辑态 Cancel 固定使用 `Button variant="secondary"`，
  Save 使用 `primary`，最终 Delete 确认使用 `danger`。Edit 可按现有次级操作语义在
  `secondary`/`tertiary` 中做技术判断，不与 Save 或 Delete 竞争主语义。
- 条目内删除确认留在当前 list item，不使用 Dialog。Drawer 内竞态/validation 反馈使用
  HeroUI `Alert` 的 warning/danger 等语义 status，不用颜色作为唯一信息。
- 编辑视图只挂载一个 `ComposerPendingInputEditor`；主 Composer controller、草稿、selection
  与 menu parent 不参与所有权转移。
- Edit 点击后先 mount/ready 独立 editor，再把同步 restore callback 交给 begin。只有
  `restored` 才进入编辑态；invalid/stale 留在刷新后的列表。
- explicit Cancel 回列表；Save 成功回列表。Escape/backdrop/CloseTrigger 在编辑态先 cancel，
  结算成功再关闭；typeahead 已消费 Escape 时不触发外层取消。
- Enter 映射 Save，Shift+Enter 换行，IME Enter 不保存；空 capture 或 invalid Skill 保持编辑态
  并显示可访问错误。
- 前序 drain 引起 revision 变化时只刷新列表 projection，不卸载持有有效 capability 的 editor。
- coordinator 发布 matching `liveOwner` edit invalidation outcome 时，Drawer 不调用
  save/cancel、不重读第一页来猜状态；它立即退出编辑态、丢弃临时 editor、刷新同一当前
  owner，并显示 target 已关闭或条目不再可管理的 Alert。
- controller identity/controlled result 表明 `ownerGone` 时，Drawer 立即丢弃对旧 editor、
  capability、controller 和 page/cursor 的全部引用，绝不调用旧 save/cancel/read；旧 Drawer
  按既有 owner replacement/dispose 语义关闭，或直接切换到新 owner 的全新列表与 revision。
  焦点沿用既有 replacement/Composer 回退，不为已死亡 owner 保持 management hold 或 Alert。
- 删除需要条目内二次确认；成功后按同位置、前一项、组 heading、Drawer heading 的顺序恢复
  焦点。stale 退出确认态、刷新并明确提示。
- page item read-only 状态明确说明已进入发送链；`pendingSteers` 不出现 Edit/Delete。
- 保留两种清空来源：普通外部 drain 在 Drawer 列表态使两组为空时，继续由
  `hasPendingInputs`/owner-change 路径自动关闭；最后一项因 save 后立即 drain、delete 或 target
  invalidation 消失时，设置 management-completion hold。成功 save/delete/cancel 只结算
  editor/capability、刷新为空的列表态并把焦点放到 Drawer heading，不创建成功 Alert；Drawer
  即使 count=0 也保持 heading 和关闭控件，直到用户显式关闭。同一 live owner 内的 target/
  session invalidation、stale、notManageable 等竞态失败也保持 Drawer，并额外提交可访问 Alert
  与合理反馈/heading 焦点。ownerGone 的 disposed/replacement 不进入此 hold，立即关闭旧
  Drawer 或切换新 owner 列表。通用 auto-close 不能抢先卸载 live management completion，
  但也不能阻止 ownerGone teardown。

### Catalog 生成

普通 TSX 编辑完成后，从 `codex-gui` 运行项目固化入口：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run messages:extract
```

检查实际 catalog diff，只补本任务新增中文翻译；不运行 `messages:extract:clean`，不手写生成
结构，不删除范围外消息。

### Browser 验证

- 列表/编辑/条目内删除确认三态均在同一 Drawer，DOM 中没有嵌套 dialog。
- ordinary 与 unsent steer 可管理，pending steer 只读；两组分页、count、preview/Disclosure 与
  Show more 继续正确。
- restore 文本、段落、重复 SkillNode、普通 `$name`；独立 typeahead portal、retry、invalid
  path、clipboard 与 IME 正确，主 Composer 草稿保持不变。
- save/cancel 保持原 lane/位置；空 save、invalid draft、stale begin/delete、target terminal 等
  live-owner 失败给出真实 Alert，不出现虚假成功；dispose/replacement 则关闭旧 Drawer/切换
  新 owner，不保留或操作旧 controller。
- Escape/backdrop/CloseTrigger 先结算再关闭，正常关闭焦点回 Trigger；编辑/删除结算后的邻近
  焦点符合设计。
- 普通外部 drain 清空列表仍自动关闭；最后一项 save/delete/cancel 的 management completion
  保持 count=0 的 Drawer 列表态与 heading，焦点恢复后仍等待用户显式关闭，并且不存在成功
  Alert；最后一项 live-owner target/session invalidation、stale/notManageable 不会被
  `hasPendingInputs=false` 抢先关闭，其 Alert 在 Drawer 内可被读屏与键盘用户感知；
  ownerGone dispose/replacement 会按既有语义关闭旧 Drawer 或显示新 owner 列表，不 hold。
- 同一测试矩阵分别注入 live-owner sessionInvalidated/stale/notManageable 与 ownerGone
  disposed/replaced：
  前者保持 management hold + Alert，后者断言旧 Drawer/editor 卸载、旧 capability/controller
  没有任何后续调用，并按既有焦点语义关闭或渲染 replacement owner；UI 不从 count 猜 scope。
- 使用 role/name locator、`expect.element`/`expect.poll` 与真实 contenteditable 交互，不使用
  placeholder/value API，不以 sleep 等待异步状态。

### 定向验证

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --config=vitest.browser.parallel.config.ts src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx
```

全项目 `type-check` 延后到 Task 6 一次性迁移 App 与 thread-switch test doubles 后执行。
不得通过 optional method、cast 或 fallback 让旧 mock 假装完整；记录实际消费者并在下一任务
直接切换。

### 提交边界

只暂存本任务 production、Browser test 与两个 catalog；审查 staged diff，确认没有 catalog
范围外删除或自动顺序调整。

建议提交标题：

```text
feat(gui): manage pending inputs in drawer
```

## Task 6：收口 App、thread switch 与响应式纵向回归

本任务只迁移真实纵向消费者和增加回归覆盖，形成独立测试提交；不改变已确认产品行为。

### 精确文件

- `codex-gui/src/__tests__/App.browser.test.tsx`
- `codex-gui/src/__tests__/sequential/composer-viewport.browser.test.tsx`
- `codex-gui/src/features/projectionCoordination/__tests__/liveThreadReplacement.test.ts`（仅当
  owner replacement fixture 直接消费新增 interface）
- 上述测试已使用的 shared App Browser support/fixture（仅当 `rg` 证明必须修改）。

### 纵向回归

- 真实 App harness 中 ordinary 编辑保存后仍到原 FIFO slot 才发 `turn/start`，删除不产生
  RPC；transcript 只有 authoritative commit 后出现用户消息。
- unsent steer 编辑保存后保留 expected turn/client identity，并在前序结束后按原顺序发
  `turn/steer`；pending/unknown steer 只读且不能被本地删除冒充撤回。
- target terminal/rejected-first、definite failure recovery、local Stop gate 与恢复顺序不因
  Drawer 管理而改变。
- App harness 分别证明 lane-specific 顺序：ordinary 为 `failure -> reservation settle/delete ->
  recover -> existing deferred successor effect or management deferred lane intent -> recovered
  failed message`，steer 为 `failure ->
  reservation settle/delete -> recover -> failed intent retry -> successor`。recovery pending/
  isRecovering 期间 management intent 不新增 claim/RPC；recover 后保持各 lane 当前顺序，
  不把 ordinary 错改为 retry-first。
- target terminal/not-steerable 无需用户再按 Save/Cancel、无需 UI read page，就通过唯一
  live-owner invalidation outcome 主动退出编辑、清除 coordinator gate、丢弃临时修改并显示
  Alert。
- thread switch 在 edit reservation 存在时收到原 lane blocker；save/cancel 后才可重新评估
  release。committed replacement/dispose 后 controlled result 带 ownerGone cause，旧 page key、
  cursor 与 edit capability 全部失效；App 关闭旧 Drawer或显示 replacement owner 新列表，
  不 hold、不显示旧 owner Alert、不调用旧 controller，且不能写入新 thread。
- 390×700 等窄 viewport 下列表、editor、typeahead、Alert、删除确认与 Save/Cancel 可滚动、
  无横向溢出，关闭控件可达；不把具体 padding/gap 固化为断言。
- 区分普通外部 drain 清空自动关 Drawer 与最后一项 management completion：成功
  save/delete/cancel 后 count=0 的列表态、Drawer heading 与焦点保持到用户显式关闭，且没有
  成功 Alert；同一 live owner 内 target/session invalidation、stale/notManageable 的 Alert 在
  Drawer 保持可读；ownerGone dispose/replacement 关闭旧 Drawer/切换新列表，不 hold。
- controller test doubles 一次性补齐真实 public interface；不保留旧只读 mock wrapper 或
  optional management methods。

### 定向验证

Unit：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit -- src/features/projectionCoordination/__tests__/liveThreadReplacement.test.ts
```

只运行实际修改或直接消费新 interface 的 optional 测试；未修改且无类型命中的文件从命令
删除，并在执行记录说明证据。

Parallel Browser：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --config=vitest.browser.parallel.config.ts src/__tests__/App.browser.test.tsx
```

Sequential Browser：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --config=vitest.browser.sequential.config.ts src/__tests__/sequential/composer-viewport.browser.test.tsx
```

### 提交边界

只暂存实际命中的纵向/响应式测试和 shared fixture，审查 staged diff。

建议提交标题：

```text
test(gui): verify pending input management integration
```

## 最终验证与格式化收尾

Task 6 行为/测试提交完成后，在全部行为提交合并状态先运行非 fix 验证。所有命令从
`codex-gui` 执行：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
/opt/homebrew/bin/fnm exec --using-file pnpm run lint
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit -- src/features/composerInputQueue/__tests__/composerInputQueue.test.ts src/features/composerInputQueue/__tests__/composerSteerQueueState.test.ts src/features/composerInputQueue/__tests__/composerInputQueueCoordinator.test.ts src/features/projectionCoordination/__tests__/threadSwitchCoordinator.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --config=vitest.browser.parallel.config.ts src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx src/__tests__/App.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --config=vitest.browser.sequential.config.ts src/__tests__/sequential/composer-viewport.browser.test.tsx
```

若 `format:oxfmt` 失败，只运行项目固化 fix 入口：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt:fix
```

格式修正后继续运行上述其余非 fix 验证。随后使用 `$debug-responsive-gui` 在已有 Google
Chrome for Testing 中做一次可见检查，不安装浏览器：桌面与窄屏分别走 ordinary 编辑保存、
steer 取消、删除二次确认、pending steer 只读、typeahead 与 Escape/关闭焦点路径；记录可
复现步骤，确认 Drawer 可滚动、无横向溢出且主 Composer 草稿未变化。只检查稳定的用户行为，
不把主观 spacing 数值转成测试。

随后从仓库 `codex-rs` 目录运行仓库要求的最终格式化入口：

```bash
just fmt
```

不运行 `cargo build`、`cargo run`、`just codex` 或其他后端/原生构建。按照仓库规则，
`just fmt` 后不重跑测试；只检查：

```bash
git status --short
git diff --check
git diff
```

若两个格式化入口无 diff，不创建空提交。若只产生本计划文件的纯格式、import/声明顺序或
换行差异，创建独立 pure-format 提交，禁止 amend 或并入 Task 6：

```text
style(gui): format pending input management
```

若格式化产生行为差异或范围外文件，停止并报告；不得暂存范围外修改。若最终非 fix 验证暴露
本次计划内行为问题，在运行最终 `just fmt` 前以新的独立修正提交闭环，并重跑受影响定向验证；
不得修改断言、豁免检查或删除覆盖来隐藏失败。

## 每个任务的统一提交纪律

每个 Task 修改完成后：

```bash
git diff --check -- <task-files>
git add -- <task-files>
git diff --cached --check
git diff --cached --name-only
git diff --cached
git commit -m '<task commit title>'
```

- `<task-files>` 必须替换为该任务实际路径，不使用 broad glob，不暂存无关用户变更。
- 生成 catalog 只能随 Task 5 提交；纯格式只进入条件式格式化提交。
- 某项修正发生在原任务提交后，创建新的独立 fix 提交，禁止 amend。
- 中间提交不要求独立 type-check 或满足最终 UI，但当前任务可运行的定向验证必须通过；禁止
  为中间完整性增加兼容双路径。
- 任何提交均不操作 Git 远程。

## 排除项与当前证据

- 不改 app-server/protocol/generated validator：management 发生在 RPC 前，wire input 仍从
  已有 generated contract 机械派生。
- 不改 Redux/transcript：pending owner 仍是 current thread queue coordinator；正式 transcript
  只接受 runtime commit。
- 原则上不改 `composerStartQueueState.ts`：marker 只存在 ordinary FIFO、不会形成 StartClaim；
  若实施证据显示 start state public type 被 union 直接命中，先更新计划，不用 cast 绕过。
- 不把 item reservation 加进 `threadSwitchCoordinator.ts` production：现有 release readiness
  已通过 lane blocker 读取 queue owner。该文件只允许在 committed replacement 清理旧 owner
  时传递 `ownerReplaced` cause；若还需要调度或 blocker 改动，属于设计影响面变化，必须停下
  更新计划。
- 不新增 Playwright E2E：App Browser harness 已覆盖真实 Composer→coordinator→gateway→commit
  与 owner replacement，viewport Browser test 已覆盖真实 Drawer portal 和窄屏。
- 不新增依赖、HeroUI Provider、自定义 overlay 或 focus trap：现有 `@heroui/react` v3、Drawer、
  Button、Alert、Chip、Disclosure 与现有 App Provider 足够。
- 不修改 TUI：TUI 只有较弱的 LIFO 取回模型，没有 GUI reservation/cancel/Drawer 交互。
- 不修改 research：research 是已完成调查记录，实施文档提交明确排除其 ignored 文件。

## 完成标准

- page item 由 owner 准确区分 manageable/editing/read-only；`pendingSteers` 没有 edit/delete。
- begin/delete CAS 不会命中已 drain、已发送、foreign owner 或 stale revision 条目；失败有明确
  Drawer 反馈。
- restore 失败两边不变；save/cancel 使用 opaque capability 原位结算，空 save 不删除内容。
- ordinary 与 steer marker 的头/中/尾、前序 drain、promotion、start failure、Stop/recovery、
  steer accepted/unknown/terminal/rejected 全部定向覆盖，后继从不越过 marker。
- recovery pending/isRecovering 期间 management settle/delete 只合并 deferred lane drain intent，
  不形成 claim 或 RPC；ordinary 保持 recover→已有 deferred successor effect 或 management
  deferred lane intent→recovered failed message，steer 保持 recover→failed intent retry→
  successor，两种顺序均有测试。
- steer save 保持 expected turn/client identity/source；terminal 失效不承诺恢复临时修改。
- target terminal/not-steerable 通过 queue 的单一 draft-free invalidation fact 主动清除 coordinator
  edit gate并驱动 Drawer 退出/Alert；不依赖 save/cancel、分页扫描或 UI 猜测。
- Drawer 三态、独立 editor/typeahead portal、Skill validity、IME、键盘、焦点、Lingui 与窄屏
  行为通过 Browser Mode 验证；Cancel 固定 secondary，Save/Cancel 位于 Drawer.Footer，主
  Composer 内容不受影响。
- 普通外部 drain 清空仍自动关闭 Drawer；最后一项 save/delete/cancel 后即使 count=0 也保持
  Drawer 列表态、heading 与焦点直到用户显式关闭，不显示成功 Alert；target invalidation/
  session invalidation/stale/notManageable 等 live-owner 失败则保持 Drawer 并显示必要 Alert；
  ownerGone disposed/replacement 关闭旧 Drawer或切换新 owner 列表，绝不保持/调用旧
  Drawer/capability/controller。live management completion 不会被 `hasPendingInputs` effect
  抢先卸载，ownerGone teardown 也不会被 hold 阻止。
- controlled result/invalidation reason 足以区分 liveOwner 与 ownerGone dispose/replacement，
  UI 不把所有 unavailable 统一 hold。active edit 阻止不安全 Stop/release；ownerGone 后旧
  capability 不写入新 owner。
- lint、type-check、定向 unit、parallel/sequential Browser Mode 和最终 `just fmt` 按顺序完成；
  `just fmt` 后不重跑测试。
- 所有计划任务各有独立本地提交，最终只有一个权威 owner 与一条管理路径，没有兼容层、
  fallback、双读、双写、计划外文件或未提交格式化差异。
