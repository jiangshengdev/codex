# Codex GUI Composer 待处理输入管理设计

日期：2026-08-23
状态：已确认

确认日期：2026-08-23

确认原文：确认设计

## 唯一主目标

在现有 `Pending details` 输入队列抽屉中，为纯本地、尚未进入发送链的 ordinary 与 steer
条目提供安全的逐条编辑和删除能力，同时严格保持两条 lane 既有的 FIFO、消息 identity、
发送优先级、交付对账、失败恢复与 thread owner 生命周期语义。

## 与既有设计的关系

本设计是以下两个已确认设计之上的增量设计，不覆盖或重写它们：

- `2026-08-22-codex-gui-composer-pending-input-drawer-design.md` 已建立统一待处理入口、
  ordinary/steer 分组、20 条有界分页、160-grapheme preview、按需全文读取和 Drawer
  的焦点语义。本设计把其中“只读抽屉”扩展为可管理抽屉；计数、分页和异常状态投影仍以
  原设计为基础。
- `2026-08-22-codex-gui-composer-skill-restorable-draft-design.md` 已建立同一 capture 中
  `draft + input` 的双表示、`ComposerEditorController.restore()` 的可失败恢复，以及文本、
  段落和完整 `SkillNode` 的可逆编辑基础。本设计消费该 seam，不从协议 `UserInput[]`
  反编译草稿，也不改变 Skill identity。

本设计参考 TUI 的只有“纯本地条目可以把内容所有权转移给编辑会话”这一状态模型。它不复制
TUI 的 LIFO 取回、快捷键、覆盖主 Composer、先移除后恢复、无取消回滚或 sidecar mention
binding 数据结构。

## 当前代码事实与设计约束

### 一个 queue owner，两条执行 lane

`composerInputQueue.ts` 中的 `ComposerInputQueueImpl` 是 ordinary、start state 和 steer state
的组合 owner。ordinary 保存在 FIFO 数组中；`composerSteerQueueState.ts` 另行拥有
`steerQueue`、`pendingSteers` 与 `rejectedSteersQueue`。两条 lane 的发送条件不同：

- ordinary 只有在无 active turn、无 pending start 时才能从队首形成 `StartClaim`；
- steer 绑定 `threadId + expectedTurnId + clientUserMessageId`，从 `steerQueue` 队首形成
  `SteerClaim`；
- `pendingSteers` 已进入 `turn/steer` 发送与对账链，可能处于 `issuing`、
  `acceptedAwaitingCommit`、`deliveryUnknown` 或 `responseTurnMismatch`；
- rejected-first、user-stop recovery、definite failure recovery 与 ordinary promotion 均会
  移动 owner 或改变后续 drain，不能被 React 绕过。

因此管理操作必须在 queue/coordinator owner 内完成，Drawer 不能保有可发送消息副本，
也不能直接修改分页数组。

### 当前详情读取不能表达可管理性

`ComposerPendingInputPageItem` 当前只包含 display key、lane 与 preview。steer 页由
`pendingSteers` 在前、`steerQueue` 在后的同一分页组成，所以 React 不能根据 `lane ===
"steer"` 判断条目是否可编辑或删除。可管理性必须由 queue owner 按确切生命周期投影到
page item。

现有 display key 只用于 owner 内反查 message identity；cursor 同时绑定 owner、revision、
lane 与 offset。管理入口必须沿用这一一致性边界，并把 `detailRevision` 作为获取操作的 CAS
事实，不能新增基于 preview、数组下标或文本匹配的 mutation。

### 现有 release reservation 不是条目 reservation

`ComposerInputQueueCoordinator.reserveRelease()` 是 thread switch 准备释放整个 queue owner
时使用的门闩。它会阻止 queue 操作，职责是保证 owner 可安全切换。本设计的 item
reservation 是某一 lane 中原 slot 的长期调度占位，职责完全不同；两者不得复用同一
capability 或状态。

## 已确认产品决策

1. 只管理纯本地、尚未发送的条目：全部 ordinary 与仍在 `steerQueue` 的 steer 可管理；
   `pendingSteers` 继续显示但保持只读。
2. 可管理条目允许逐条删除。
3. 可管理条目允许编辑。
4. 编辑采用受控内容所有权转移。只有 Drawer 独立编辑器成功恢复 draft 后，正式内容所有权
   才转移给编辑会话；恢复失败时编辑器和队列均不变化。
5. 编辑发生在同一个 Drawer 内的单条编辑视图，使用独立 `ComposerEditor`，不复用页面底部
   主 Composer，也不叠加 Dialog。
6. 取消编辑丢弃本次修改，并把原条目恢复到原 lane、原位置。
7. 保存只替换内容，保留原 lane、message identity 与原相对顺序。
8. 不提供同 lane 重排、跨 lane 转换、批量操作或借编辑改变调度语义。
9. 删除使用条目内二次确认，不叠加 Dialog，不提供 Undo。
10. 编辑或删除与 drain、发送或 revision 变化发生竞态时，拒绝操作、刷新列表，并在 Drawer
    内明确提示条目已开始发送或不再可管理。
11. 编辑期间在原位置保留 reservation。同 lane 中位于它之前的条目仍可发送；后续条目不能
    越过 reservation；save/cancel 在原位置结算。

## 范围

本设计包含：

- Drawer 的列表、单条编辑和条目内删除确认三种 UI 状态；
- ordinary 与 `steerQueue` 条目的 owner-projected 可管理性；
- 逐条 begin edit、save、cancel 与 delete 的并发安全 seam；
- ordinary/steer 原位 reservation 及其对 count、分页、drain、recovery、terminal、release
  和 dispose 的影响；
- Drawer 独立 `ComposerEditor`、独立 Skill typeahead portal、编辑有效性与焦点管理；
- 明确的竞态、恢复失败、空保存和 capability 失效反馈；
- Lingui、键盘、读屏和 Browser Mode/queue 状态机验证边界。

## 非目标

- 管理、撤回或删除已经进入发送链的 `pendingSteers`、pending start 或
  `deliveryUnknown` 条目。
- 新增 app-server cancel-steer/cancel-start API，或声称删除本地记录能够撤回网络请求。
- 合并 ordinary 与 steer 的 owner、FIFO、计数或发送顺序。
- 重排、拖动、跨 lane 转换、批量选择、批量删除或批量编辑。
- 复用或覆盖页面底部主 Composer 的草稿、selection、undo/redo history 或 typeahead portal。
- 为编辑中的临时修改新增持久化、跨 thread 恢复、user-stop recovery 或 terminal recovery
  承诺。
- 扩大可逆草稿范围；图片、音频、mention 及其他当前未纳入可逆草稿设计的结构化输入仍不
  因本功能变得可编辑。
- 修改现有 queue 容量、协议 payload、rejected-first 文案或异常状态的产品语义。
- 用 padding、gap、颜色、阴影等主观实现数值建立低价值测试。

## 用户界面状态模型

Drawer 在任一时刻只处于下列三种内容状态之一。Drawer 自身仍是唯一 overlay，不在其中
叠加 Dialog。

### 列表态

列表继续按 `引导中`、`已排队` 两组展示有界分页；每个 page item 由 owner 投影管理状态：

- `manageable`：纯本地 ordinary 或 `steerQueue` 条目，显示编辑与删除操作；
- `editing`：该 slot 正由本 Drawer 的编辑 reservation 占用，不显示第二个管理入口；
- `readOnly`：已进入发送链的 `pendingSteers`，显示不可管理语义，不显示会误导为可用的操作。

上述名称只是设计 seam，计划阶段可调整类型名；“由 owner 投影而不是由 UI 猜测”是不可变
约束。只读 steer 可使用简洁的状态说明或 accessible description 表明它已开始发送；不能用
禁用按钮作为唯一解释。

条目操作使用稳定 display key。分页刷新时保持 owner 顺序，不用 React 本地数组做乐观删除
或插入。列表中的 reservation 继续占一个条目，因此 lane count、offset、下一页 cursor 与
释放 blocker 不会在编辑期间虚假减少。

### 单条编辑态

点击可管理条目的编辑操作后，Drawer 从列表切换到单条编辑内容，不叠加第二层 modal。
编辑视图只挂载一个新的、独立的 `ComposerEditor`：

- 使用保存的 `ComposerDraft` 恢复文本、段落和完整 `SkillNode`，光标位于文档末尾；
- 使用自己的 controller、焦点根节点、提交意图与 Skill typeahead portal；
- 使用当前 Skill catalog 的 loading、retry、stale/partial error、invalid path 与提交有效性
  投影，但不按 name 重建或静默换绑 Skill；
- typeahead popup 必须挂在 Drawer dialog 内，不能复用假设“从页面底部向上展开”的主
  Composer portal 或定位逻辑；
- 保留现有 IME、clipboard、段落与 Shift+Enter 换行行为；普通 Enter 的 submit intent 在
  编辑态只映射为 Save，绝不映射成 submit/steer 或 lane 变更。

编辑视图提供 Save 与 Cancel。Cancel 使用 secondary 语义，Save 使用 primary 语义。
显式 Cancel 结算 reservation 后回到刷新后的列表；Save 成功后同样回到列表。编辑期间
前序条目 drain 导致 `detailRevision` 前进，不得让已取得的 capability 自动失效或关闭编辑器。

Drawer 的 Escape、backdrop 和 `Drawer.CloseTrigger` 在编辑态统一执行“先 cancel，成功结算
后再关闭 Drawer”。若 Skill typeahead popup 正在响应 Escape，则先关闭 popup；只有 popup
不再消费该键时才取消整个编辑。任何关闭路径都不能直接卸载仍拥有正式内容的编辑会话。

### 条目内删除确认态

删除确认发生在列表中的当前条目内，用确认文案和两个明确操作替换或展开该条目的普通操作：

- Cancel 返回该条目的普通列表呈现，不改变队列；
- Delete 使用 danger 语义，第二次明确确认后才调用 queue mutation；
- 点击其他条目、分页或关闭 Drawer 不构成删除确认；
- 不提供延迟删除或 Undo。

删除成功后刷新 owner 页，并把焦点移到同一位置的新条目；若该位置为空则移到前一个条目，
该分组为空时移到另一分组标题或 Drawer heading。竞态失败时不伪装成功，退出陈旧确认态，
刷新列表，把焦点放在 Drawer 内的反馈或仍存在的邻近条目。

## 管理 seam 与所有权边界

### 获取编辑 reservation

coordinator 对外提供一个小而受控的编辑入口，概念形状为：

```ts
beginPendingInputEdit(request, restore): BeginResult;
```

`request` 携带 display key 与当前 `detailRevision`。queue owner 在一次 CAS 中验证：

- key 属于当前 coordinator generation；
- revision 仍是当前详情事实；
- 条目仍位于原 lane、原 slot，并且是纯本地可管理生命周期；
- coordinator 未 disposed，也没有与 owner release、recovery 或已有 edit session 冲突的
  所有权转移。

验证通过后，owner 锁定确切 slot，并同步调用 Drawer 独立编辑器提供的 `restore(draft)`。
只有结果为 `restored` 时，owner 才用 reservation marker 原位替换消息，并返回 opaque
reservation capability；若结果为 `invalidDraft`，队列、revision、编辑器原状态与 drain
完全不变。

这是“先验证、恢复成功才交权”的单一事务 seam。Drawer 不先取走 draft、再另发 remove，
也不存在可被异步 drain 穿过的“读取成功但尚未占位”窗口。

### Opaque capability

成功 begin 返回的 capability 暴露概念操作：

```ts
reservation.save(capture)
reservation.cancel()
```

具体类型名属于实现判断。capability 必须是 owner 生成、不可伪造、单次结算并绑定原 slot
的对象。后续 save/cancel 不继续要求旧全局 revision，因为同 lane 前序 drain、另一 lane
变化或分页读取都可以合法推进 revision；它们只验证 capability 仍是当前 slot owner。

- `save(capture)` 使用独立编辑器对当前 EditorState 的原子 capture，只替换 reservation 中
  的 `draft + input`；保留 message id、display key、lane、slot 和 steer intent 的
  `expectedTurnId`、`clientUserMessageId`、`source`。
- 空 capture 不能保存成功。Save 保持编辑态和 reservation，显示可访问错误；不得用空消息
  删除原条目，也不得回退为 cancel。
- 当前 Skill 无效或 catalog 状态不允许提交时，沿用 Composer 有效性投影禁用/拒绝 Save，
  reservation 继续存在。
- `cancel()` 用原消息替换 reservation，恢复原 `draft + input` 与所有调度 identity。
- save/cancel 只可成功一次；旧 capability、外部失效 capability 或 dispose 后调用返回受控的
  unavailable/stale 结果，不能修改新 owner。

begin 成功、save、cancel 和外部失效都推进详情 revision 并发布 snapshot。结算后 owner
主动重新尝试对应 lane 的 drain，不等待一次无关事件偶然唤醒。

### 删除 CAS

删除是独立 mutation，不创建编辑 session 或 reservation：

```ts
deletePendingInput(request): DeleteResult;
```

它以 display key + 当前 `detailRevision` 做 CAS，只删除仍处于 `manageable` 的确切 slot。
成功后释放 message/display identity、推进 revision、发布 snapshot，并重新尝试受影响 lane
的 drain。若条目已被 drain、进入 `pendingSteers`、被其他状态机转移、revision 变化或 owner
失效，返回 stale/unavailable；Drawer 按已确认竞态语义刷新并提示，不把本地删除描述为撤回。

## Reservation domain model

reservation 是 lane 数组中的原位 marker，不是 React 状态，也不是临时把消息移到队尾。
它至少内聚以下事实，但不要求把这些字段暴露给 UI：

- 原 message/display identity 与原 lane；
- 原 slot 的调度顺序；
- cancel 所需的原 `draft + input`；
- steer 原有的 target、client identity 与 source；
- 单次结算 token 与当前有效性。

它必须满足以下 invariants：

1. reservation 占据原数组 slot，并继续计入该 lane count、分页和 release blocker。
2. 同 lane 前序消息可以正常 drain；marker 到队首后该 lane 停止，后序消息不能越过。
3. 另一 lane 仍遵守既有独立调度；本设计不因为一条 ordinary 正在编辑而无条件冻结 steer，
   也不因为一条 steer 正在编辑而冻结 ordinary。
4. save/cancel 原位替换 marker，不通过重新 submit 追加到队尾。
5. display key、message identity、lane 和相对顺序在 begin/save/cancel 期间不变。
6. marker 不能形成 `StartClaim` 或 `SteerClaim`，不能进入协议 input，也不能被 promotion、
   rejected merge 或 recovery 当作普通消息展开。
7. 任一状态机要移动包含 marker 的范围时，必须显式处理 marker；不得依赖类型断言、过滤或
   空 payload 让它静默穿过。

## Ordinary 全路径语义

### 正常 drain

ordinary 数组继续严格 FIFO。reservation 位于中间或尾部时，之前的 ordinary 条目可以按
既有条件形成 start；当 marker 成为队首时，`drainNextStart()` 返回无 effect，后续 ordinary
和 ordinary promotion 均不得越过。save/cancel 结算队首 marker 后立即恢复 ordinary drain。

删除非 reservation 条目保持剩余 FIFO；删除后若新的队首满足既有 start 条件，owner 重新
运行 drain。编辑本身不把条目变成 steer，也不改变 rejected-first 先于 ordinary 的规则。

### Start failure 与 recovery

一个更早 ordinary 已经形成 `StartClaim` 后，用户可以编辑其后的纯本地条目。该 claim 的
`definitelyNotAccepted` 仍只把 claim message 放入现有 recovery；reservation 留在原 ordinary
slot，后续 drain 到 marker 时停止。显式恢复 recovery 也不能把消息插到 marker 之后再绕过
它；恢复顺序必须继续满足既有 FIFO 和 reservation 边界。

pending start 已进入发送链，不在 Drawer ordinary 分组中，也不因拥有 draft 而可管理。
`deliveryUnknown` 继续持有 claim 并阻止不安全后继。

### Stop 与 user-stop recovery

活跃编辑会话构成未结算的内容 owner，因此 coordinator 的 `canStop` 为 false；用户不能在
reservation 未结算时发起新的 local Stop，从而避免 `applyInterruptedDisposition(local)`
一次移出全部 ordinary 时丢失编辑 owner。

如果 begin 前已经存在 interrupt/recovery owner，begin 拒绝获取新的 reservation。若运行时
仍产生 terminal 或非本地 interruption，则现有状态机处理已拥有的 claim；ordinary marker
留在 FIFO 并继续阻塞其后内容，直到 save/cancel 或 capability 因 owner dispose 失效。
`recover()` 在编辑结算前保持不可用，或必须以等价方式保留同一 reservation 边界；不得把
recovery restore 当作重新排队从而越过 marker。

## Steer 全路径语义

### 正常 issue 与对账

只有 `steerQueue` 中尚未 issue 的条目可编辑或删除；`pendingSteers` 始终只读。steer
reservation 位于中间或尾部时，前序 intent 可继续 issue；marker 到队首时 `issueNext`
停止，后续 steer 不得越过。

save 只替换该 intent 的 `draft + input`，必须保留其原 `threadId`、`expectedTurnId`、
`clientUserMessageId` 与 `source`。结算后恢复 steer drain。已经 accepted、delivery unknown
或 response-turn-mismatch 的 pending steer 不进入 begin/delete 成功路径，也没有重试或
撤回操作。

### Target terminal、not-steerable 与 rejected-first

`composerSteerQueueState.ts` 当前会在 target terminal 或 active-turn-not-steerable 时，按
target 把 pending 和尚未 issue 的 intents 移入 `rejectedSteersQueue`。该遍历必须识别
reservation：

- 对应 target 关闭时，reserved steer 不再能以原 steer 身份 save/cancel；owner 使 capability
  失效，并按既有状态机对原条目执行 terminal/rejected 归类；
- Drawer 收到失效结果后退出编辑态、刷新列表，并在 Drawer 内提示条目已开始处理或不再
  可管理；
- 编辑器中的临时修改不转入 rejected-first，不创建新的恢复批次，也不承诺跨 terminal
  保存；现有状态机只保留原条目本来就会得到的归类。

同一 target 的其他 pending/queued steer 继续保持现有批量关闭顺序。不能让 marker 被
`removeUnsentTarget()` 遗漏，也不能把 marker 当作无 input 的 rejected intent。

### Steer definite failure 与 recovery

已经 issue 的 steer 若 `definitelyNotAccepted`，继续形成现有 `SteerRecoveryTransfer`；它不是
可编辑条目。恢复 transfer 时若 lane 中存在 reservation，restore 与后续 `drainSteer()` 必须
保持 reservation 边界，不能让恢复消息或后继 intent 越过原 slot。

## Release、thread switch 与 dispose

active reservation 继续计入原 lane count，因此现有 `ordinaryQueued` 或 `steerQueued`
release blocker 仍能阻止 thread switch 释放 owner；无需也不得把 item reservation 伪装成
`reserveRelease()` 返回的全局 release reservation。

thread switch 的 release 只有在 queue/recovery/interrupt/edit blocker 全部安全后才能继续。
Drawer 打开本身不是 blocker；只有未结算编辑 capability 是 blocker。删除确认态不拥有内容，
也不是 blocker。

App/coordinator dispose 是最终生命周期边界，可以强制使所有未结算 capability 失效。dispose
后 save/cancel 返回 unavailable，不向已销毁 owner 写入，也不启动 drain。Drawer 必须停止
使用旧 controller，关闭编辑视图并呈现现有 owner replacement/关闭语义；本设计不承诺在
App 整体销毁后保存临时编辑内容。

## 错误与竞态反馈

Drawer 内使用一个明确、非重复的语义反馈区域；warning/error 不能只靠颜色表达，也不能与
页面底部异常状态创建重复 live announcement。

| 场景 | Owner 结果 | UI 行为 |
| --- | --- | --- |
| begin 时 revision 已变化或条目已 drain | stale/not manageable | 不进入编辑态；刷新列表并提示条目已开始发送或不再可管理 |
| draft 恢复失败 | invalid draft | 编辑器和队列均保持原样；留在列表并提示无法打开该条目 |
| Save 为空 | invalid input | 保留编辑内容与 reservation；提示需要输入内容 |
| Skill 当前无效 | validation blocked | 保留编辑态；使用现有 invalid Skill 可访问状态，Save 不成功 |
| save/cancel 前 steer target terminal | capability unavailable | 丢弃临时修改，回到刷新列表；提示条目状态已变化 |
| delete 二次确认时 revision 变化 | stale/not manageable | 不显示删除成功；退出确认态、刷新列表并提示 |
| owner replacement/dispose | unavailable | 不调用旧 owner；关闭或切换到新 owner 的列表状态 |
| 分页 cursor/detail 失效 | stale/missing | 按既有详情设计从当前 revision 重读，不合并陈旧页 |

反馈文案描述“本地管理操作没有发生”，不能使用“已撤回”暗示 server-side cancel。一次失败只
在 Drawer 的一个权威位置播报；刷新列表本身不抢走页面底部主 Composer 的焦点。

## 国际化与可访问性

- 所有新增文案使用 Lingui `Trans`、`Plural` 或 `useLingui` macro，并通过项目既有生成入口
  更新 catalog；不手写 locale 分支。
- Drawer 保留可访问 heading、focus trap、scroll lock 和关闭后 Trigger 焦点恢复。
- 列表条目的 Edit/Delete accessible name 必须包含足以区分条目的 preview 或组内位置；
  不依赖图标或颜色表达操作。
- 进入编辑态后焦点落在独立编辑器；Save 失败后焦点留在编辑上下文，错误与控件建立可读
  关联；Save/Cancel 成功后焦点回到刷新列表中的原 slot 邻近位置。
- 删除确认明确说明目标，Cancel 与 danger Delete 都可用键盘访问；确认状态不能只靠颜色。
- Escape 在 typeahead、编辑取消和 Drawer 关闭之间遵循从内到外的单一消费顺序，防止一次
  按键同时选择 Skill、取消编辑并关闭 Drawer。
- IME composition 中的 Enter 不触发 Save；Shift+Enter 仍插入换行。
- queue revision 更新不得自动打开 Drawer、抢走主 Composer 焦点或重复播报正常 drain。
- 窄屏继续使用 HeroUI Drawer 的 dialog 与 viewport 适配，不新增自定义 overlay。

## 验证矩阵

### Queue 与 coordinator 状态机

定向测试至少覆盖：

- page item 准确投影 ordinary、`steerQueue` 与 `pendingSteers` 的 manageable/editing/read-only
  状态，UI 无需按 lane 猜测；
- begin 以 key + revision 做 CAS，`restore()` 只有 `restored` 时才安装 marker；
  `invalidDraft` 时编辑器、队列、revision 与 effect 全部不变；
- reservation 分别位于 ordinary 和 steer 的队首、中间、队尾时，前序可 drain、marker
  阻塞后序，count、分页、display key 和 release blocker 保持一致；
- save/cancel 保持 message id、lane、slot 和相对顺序；steer 额外保持 expected turn、client
  identity 与 source；成功结算后主动恢复正确 lane 的 drain；
- 前序 drain 推进 detail revision 后，opaque capability 仍可结算，旧列表 cursor 仍按现有
  规则 stale；
- 空 save、重复 save/cancel、伪造 capability、旧 capability 和 dispose 后 capability 都不会
  改写 owner；
- delete 只删除 CAS 命中的纯本地 slot，不能删除 pending steer；删除头/中/尾后剩余 FIFO
  与 drain 正确；
- ordinary 的较早 start accepted、definitely-not-accepted、delivery-unknown、normal terminal
  与 interrupted terminal 均不越过 marker；
- local Stop 在 edit session 活跃时不可发起；user-stop recovery/restore 与 reservation 边界
  不丢消息、不重复消息、不越序；
- steer 的 accepted-awaiting-commit、delivery-unknown、response-turn-mismatch、
  definitely-not-accepted recovery、active-turn-not-steerable 与 target terminal 路径均识别
  marker；target 关闭会失效 capability 并保持原有 rejected 顺序；
- ordinary promotion 在队首为 marker 时停止，不能跨 lane 偷越 reservation；
- release readiness 在 edit session 中继续由原 lane blocker 阻止释放，且不复用 thread-switch
  release capability；owner dispose 后所有 mutation/read/capability 均 unavailable。

测试应比较完整状态或完整 result/effect，而不是只逐字段断言；对 runtime 竞态应覆盖事件先后
顺序，证明同一条目只被一个 owner 消费。

### Drawer Browser Mode

组件测试至少覆盖：

- 同一 Drawer 在列表、单条编辑、条目内删除确认三态间切换，不出现嵌套 Dialog；
- ordinary 与纯本地 steer 显示 Edit/Delete，pending steer 只读且有明确说明；
- 编辑恢复文本、段落、重复 SkillNode、普通 `$name` 与 SkillNode 的区别，使用独立 editor
  和位于 Drawer 内的 typeahead portal；
- 主 Composer 已有草稿、selection 和 typeahead 状态在 Drawer 编辑全过程保持不变；
- Enter 保存、Shift+Enter 换行、IME Enter 不保存；invalid Skill 和空内容阻止 Save；
- Save/Cancel 回列表且保持原位置，Escape/backdrop/CloseTrigger 先 cancel 后关闭；typeahead
  打开时 Escape 只先关闭 popup；
- 删除必须二次确认，Cancel 不变更 owner，Delete 成功后的邻近焦点与空组焦点正确；
- begin/delete/save/cancel 的 stale、terminal、dispose 竞态都在 Drawer 内明确反馈并刷新，
  不显示虚假成功；
- 前序 drain 更新列表 revision 时编辑器不被卸载，成功结算后分页与计数刷新；
- 键盘遍历、Drawer heading、操作 accessible name、中英文文案和 focus return 正确；
- 窄 viewport 下 editor、typeahead、确认操作和反馈仍可见可滚动。

Browser Mode 使用 role/name locator 与真实 Lexical contenteditable 交互断言，不使用
placeholder/value API；异步状态通过 polling 等待，不以固定 sleep 掩盖竞态。样式只验证稳定、
用户可感知的布局约束，不锁定主观数值。

### App 纵向路径

纵向验证至少证明：真实 `ComposerTurnControl` 使用当前 thread 的 coordinator；Drawer 编辑
不修改主 Composer；保存后的新 input 在轮到该 slot 时走既有 generated `turn/start` 或
`turn/steer` gateway，删除条目不产生 RPC；thread owner replacement 与 App dispose 不会让
旧 capability 向新 thread 写入。

## 当前代码影响面与排除依据

以下文件构成当前纵向证据链；具体拆分与命名留到计划阶段决定：

- `composerInputQueueContracts.ts`：page/detail、queue message、release blocker 与公开结果类型；
- `composerInputQueue.ts`：ordinary slot、display key/revision、分页、start/steer drain、
  promotion、terminal 与 recovery 编排；
- `composerSteerQueueState.ts`：`steerQueue`/`pendingSteers` 生命周期、target close、rejected 与
  recovery transfer；
- `composerInputQueueCoordinator.ts`：generation、dispose、release、async effect、snapshot、
  interrupt 与 user-stop ownership；
- `ComposerPendingInputDrawer.tsx`：当前列表分页、Disclosure、Drawer presence 与焦点恢复；
- `ComposerPendingInputRegion.tsx`、`ComposerTurnControl.tsx`：当前 controller/snapshot、主
  Composer focus 与 Drawer 挂载边界；
- `ComposerEditor.tsx`、`composerDraft.ts`、`SkillTypeaheadPlugin.tsx`：独立 editor、capture、
  restore、IME、Skill validity 与 portal seam；
- `threadSwitchCoordinator.ts`：全局 owner release reservation 与 dispose 生命周期。

当前证据排除以下改动：

- 不需要 app-server 协议或 generated TypeScript contract 变更，因为编辑和删除只发生在
  RPC 前的纯本地 owner；
- 不需要从 `ComposerDraft` 向分页/detail contract 暴露草稿，因为恢复只通过 begin 的受控
  callback 发生；
- 不需要 Redux 队列副本或 React 乐观 owner，因为 coordinator 已提供同步 snapshot、分页与
  generation 生命周期；
- 不需要修改 TUI，因为 TUI 与 GUI 的交互模型、草稿表示和顺序保证不同；
- 不需要通用 Dialog 编辑器，因为已确认交互是同一 Drawer 中的独立编辑模式；
- 不需要复用底部主 Composer，因为那会引入未确认的草稿覆盖、lane 选择和焦点冲突。

## 设计完成条件

本设计只有在以下事实同时成立时才算实现目标：纯本地 ordinary 与 steer 可在 Drawer 中逐条
编辑/删除；`pendingSteers` 始终只读；编辑恢复失败不改变任一 owner；reservation 严格阻止
同 lane 后继越序；save/cancel 保持 identity、lane 与原位置；所有 terminal、recovery、
release 和 dispose 路径显式处理 capability；主 Composer 与 server-side 交付语义不受影响；
竞态不会被虚假成功或静默删除掩盖。
