# Codex GUI Composer 待处理输入同 lane 排序管理设计

日期：2026-08-23

状态：已确认

确认日期：2026-08-23

确认原文：确认设计

## 唯一主目标

在现有 `Pending details` 输入队列抽屉中，允许用户显式调整纯本地 ordinary 与
`steerQueue` 条目各自在同一 lane 内的真实发送顺序，同时保持既有发送生命周期、消息
identity、编辑 reservation、失败恢复、分页和 thread owner 一致性语义。

## 与既有设计的关系

本设计是
`2026-08-23-codex-gui-composer-pending-input-management-design.md` 之上的独立增量设计，
不回写或覆盖历史文档。

本设计仅覆盖该文档已确认产品决策 #8 中“**不提供同 lane 重排**”这一子句：纯本地、仍为
`manageable` 的 ordinary 与 `steerQueue` 条目新增显式同 lane 手动重排。决策 #8 中“跨
lane 转换、批量操作或借编辑改变调度语义”的禁令继续有效；决策 #7 与 #11 继续有效，编辑
Save/Cancel 本身保持原 slot 和相对顺序，任一 active edit 期间全局禁止排序，因此
reservation 不参与移动。

既有非目标中的“重排、拖动、跨 lane 转换、批量选择……”仅有“重排”在上述纯本地同 lane
范围内被本设计取代；拖动、跨 lane 和批量相关排除项不变。既有 Drawer 的两组展示、
20 条有界 cursor 分页、加载更多、按需详情、编辑、删除和反馈 seam 继续作为前置能力。

## 当前代码事实与约束

### 一个 owner、两条独立调度 lane

`ComposerInputQueueImpl` 是 ordinary、start state 和 steer state 的组合 owner。ordinary 只在
没有 active turn 和 pending start 时从队首形成 `StartClaim`；`steerQueue` 中尚未 issue 的
intent 从队首形成 `SteerClaim`。两条 lane 的发送时机和 identity 不同，因此不存在一条可供
用户统一排序的全局序列。

steer Drawer 分组还是一个混合投影：`pendingSteers` 是已经进入发送链的只读前缀，
`steerQueue` 才是纯本地可排序后缀。`guidingCount` 和可见数组 index 都不能表达可排序边界，
移动能力必须由 owner 投影或裁决，不能由 React 推算。

### 排序是 owner mutation，不是展示排序

当前 page 顺序直接来自 ordinary slot 数组和 steer owner；display key、cursor 与
`detailRevision` 共同绑定当前 owner 事实。排序必须在 queue/coordinator owner 内原子改变
权威调度顺序。React 不维护第二份顺序，不先乐观换位，也不把当前页 index 回写成 owner
位置。

排序成功后，下一个尚未形成 claim 的条目按新顺序发送。已经形成 `StartClaim`、
`SteerClaim` 或进入 `pendingSteers` 的条目不受影响，也不能被排回纯本地队列。

### steer 顺序跨多个生命周期容器

steer 不只用 `steerQueue` 数组表达顺序。当前实现还通过 `intentOrder`、`rejectedOrder` 和
rejection batch 维持 target terminal、not-steerable、rejected-first、definite failure 与
restore 的相对关系。因此 steer 排序不能只对数组做局部换位；用户确认的新顺序必须成为
后续跨 rejected/recovery 生命周期使用的权威顺序关系。

## 已确认产品决策

1. ordinary 与纯本地 `steerQueue` 都支持排序，但只能分别在自己的 lane 内移动。
2. 排序只作用于仍为 `manageable` 的条目；`pendingSteers`、pending start、rejected 条目、
   outstanding recovery batch、`deliveryUnknown` 和 reservation 均不可排序。
3. 排序是用户发起的手动重排，并立即改变 owner 的真实发送顺序；不是仅改变 Drawer 展示，
   也不是按时间、内容或优先级字段自动排序。
4. 每个可排序条目常驻“上移”和“下移”操作；条目操作菜单提供“移到最前”和“移到最后”。
5. 不支持拖拽；按钮和菜单是唯一排序入口。
6. 任一 active edit 或 edit acquisition 存在时，全局禁止排序，不只冻结 reservation 所在
   lane。
7. 排序成功后，Drawer 按新 revision 重新读取两条 lane 各自与排序前相同加载预算对应的权威
   前缀。条目若移出该前缀，允许从当前视图消失；不自动扩大加载预算、搜索或定位该条目。
8. 排序成功播报新位置。若条目仍在已加载前缀中，焦点回到该条目；若条目已经移出前缀，
   焦点回到对应 lane heading 或排序结果反馈，不为恢复焦点而自动扩大加载范围。

## 范围

本设计包含：

- ordinary 与纯本地 `steerQueue` 的同 lane 手动排序；
- 上移、下移、移到最前、移到最后四种语义操作；
- owner-projected 移动能力和位置事实；
- 基于 display key 与 revision 的原子排序 mutation；
- 排序与 drain、claim、active edit、release、runtime replay、terminal、rejected 和 recovery
  的并发与顺序关系；
- 保持当前加载深度的 owner 重读、成功播报、失败反馈与焦点恢复；
- queue/coordinator 状态机、Drawer Browser Mode 和真实发送纵向验证。

## 非目标

- 跨 ordinary/steer lane 移动或改变条目的发送类型。
- 管理、撤回或重排 `pendingSteers`、pending start、`deliveryUnknown` 或任何已经形成 claim
  的条目。
- 直接排序 `rejectedSteersQueue`、user-stop recovery 或尚未恢复的 recovery transfer。
- 拖拽、批量选择、批量排序、任意多选操作或按字段自动排序。
- 输入绝对位置、页码分页、自动跳转到移动后条目或为了定位它而加载全部队列。
- 借 Edit Save/Cancel 隐式改变条目位置，或允许条目跨过 active reservation。
- React 本地乐观排序、Redux 队列副本或基于 preview/文本/index 的 mutation。
- 修改队列容量、消息 payload、app-server 协议、TUI 输入队列或 server-side queue reorder。
- 新增持久化；排序只属于当前 GUI thread owner 的纯本地生命周期。
- 修改 rejected-first、promotion、recovery precedence、release blocker 或 delivery 对账语义。

## Drawer 交互设计

### 条目操作

只有 `management.type === "manageable"` 的条目显示排序入口：

- “上移”把条目与同 lane 可排序集合中的前一个条目交换；
- “下移”把条目与同 lane 可排序集合中的后一个条目交换；
- “移到最前”把条目移到同 lane 可排序集合的首位；
- “移到最后”把条目移到同 lane 可排序集合的末位。

steer 的“最前”始终是纯本地 `steerQueue` 的首位，不能越过 `pendingSteers` 只读前缀。四个
操作改变的是完整条目及其 message、draft、input、target 和 source identity，不拆分或重建
内容。

上移、下移常驻条目 action row；移到最前、最后放入条目操作菜单，避免与既有 Edit/Delete
形成拥挤的常驻按钮组。删除确认态继续替换普通 action row，不允许同时排序；编辑态不渲染
列表，也不提供排序入口。

首位条目的上移/移到最前和末位条目的下移/移到最后保持禁用，并提供可访问的不可用语义。
owner 仍把边界操作当作受控 no-op 防御：不改变顺序、不推进 revision、不发布虚假成功。

### 加载更多与刷新

当前 UI 是每个 lane 独立的 cursor“加载更多”，不是 `1 / 2 / 3` 页码。Drawer 为两条 lane
分别记录加载预算：默认请求容量为 20，每次 Show more 再增加 20；实际可见数量可以因 lane
为空、剩余条目不足或并发变化而小于预算。

排序成功使旧 cursor 和旧 page 全部失效。Drawer 不复用旧 page 或本地 splice，而是用新
revision 从 owner 重新读取：

1. 保存两条 lane 排序前各自的加载预算；
2. 从两条 lane 的首批开始读取，并继续通过各自的新 cursor 读取，直到达到各自预算或 owner
   已无更多条目；
3. 只有两个前缀的全部 page 都属于同一 revision 时才原子替换 Drawer 列表，不能混合两个
   revision 的 page；
4. 组装期间 stale 时丢弃全部中间结果并以最新 revision 最多重新开始一次；再次 stale 时
   停止追逐变化，显示现有 warning/Alert 并回到最新首批事实与 lane heading 焦点。

如果移动条目仍在新前缀中，刷新后聚焦该条目；如果移到前缀之外，只播报结果并把焦点放到
对应 lane heading 或反馈区域。Drawer 不自动继续 Show more，也不新增页码或随机跳页。

### 反馈与可访问性

排序控件必须可通过键盘操作，accessible name 包含方向和足以区分条目的 preview 或组内
位置。操作菜单使用当前 Drawer 内受控的 HeroUI `Dropdown.Popover`，遵循其焦点、Escape
和关闭语义；不叠加 Dialog，也不能把焦点移出 Drawer 的 modal 语义。

成功后在 Drawer 单一 live region 播报 lane、新位置和总可排序数量，例如“已将该已排队消息
移到第 4 项，共 12 项”。这里的 steer 总数只计算可排序 `steerQueue`，不包含只读
`pendingSteers`。正常 snapshot 刷新不重复播报整份列表。

stale、not manageable、active edit、mutation pending 或 owner replacement 不显示成功。
它们沿用现有 Drawer Alert/反馈 seam，刷新到最新 owner 事实，并把焦点保持在反馈或仍存在的
对应/邻近条目。失败文案描述“排序没有发生”，不能暗示已撤回或修改 server 请求。

## 权威排序 seam

### 小而深的 mutation interface

queue/coordinator owner 新增一个与 begin edit、delete 并列的排序 mutation。概念形状为：

```ts
movePendingInput({ key, revision, destination }): MoveResult;
```

`destination` 只表达四种稳定意图：`earlier`、`later`、`first`、`last`。Drawer 不提交数组
index、完整排列或当前 page 副本。这个小 interface 把以下复杂度封装在 owner module 内：

- display key 到当前 message identity 和 lane slot 的解析；
- revision CAS 与 coordinator generation/live-owner 仲裁；
- manageable 生命周期、active edit、release 和 mutation 序列化；
- 同 lane 可排序边界与目标位置计算；
- ordinary 数组移动和 steer 跨生命周期顺序元数据更新；
- revision、snapshot、runtime replay 与后续 scheduler 恢复；
- 完整、可测试的成功/no-op/冲突结果。

page item 由 owner 投影相邻与首尾移动能力，使 Drawer 能在触发 mutation 前呈现正确的禁用
与可访问语义。React 不能用可见 index、当前 page 长度或混合的 `guidingCount` 猜测
`canMoveEarlier/canMoveLater`；mutation 内仍重复裁决，防御 projection 后发生的竞态。

### 原子 mutation 与结果

owner 在一次同步 mutation 中验证：

- coordinator generation 与 queue owner 仍存活；
- request revision 等于当前 `detailRevision`；
- key 仍解析到同一 owner 的纯本地 manageable slot；
- 没有 active edit/acquisition、release reservation、recovery pending/active、另一
  management mutation 或禁止进入 mutation 的 runtime replay；
- destination 在该 lane 当前可排序集合中有实际变化。

验证成功后，owner 原子移动完整 slot，更新该 lane 的全部权威顺序事实，只推进一次详情
revision，发布新 snapshot，并在 coordinator 完成 mutation settlement 后恢复既有 runtime
event replay 和 scheduler pump。排序本身不生成 RPC；后续 scheduler 只会按新队首走原有
`turn/start` 或 `turn/steer` gateway。

成功结果至少提供新 revision、lane、新的一基位置和可排序总数，供 Drawer 重读与播报。
边界 no-op 不推进 revision。stale、not manageable、edit conflict、mutation pending、
release reserved、owner gone/disposed 都返回受控失败，不“尽力”移动一个猜测位置。

## 顺序与生命周期不变量

1. 排序只改变同 lane 纯本地 manageable 条目之间的相对次序，不改变 message/display
   identity、draft、input、lane、target、client identity、source、count 或 release blocker。
2. FIFO 仍是调度规则；排序 mutation 改变的是 FIFO 当前权威序列，后续 drain 按新序列消费。
3. 已形成 claim 的条目保持在发送/对账 owner 中，不回到可排序集合，也不因后续排序改变
   其提交次序。
4. 新提交继续追加到对应纯本地 lane 尾部，不因已有用户排序引入自动优先级。
5. ordinary promotion 继续只取排序后的 ordinary 队首，并追加到当前 steer 尾部；排序不等于
   lane 转换。
6. rejected-first 继续先于 ordinary start；用户不能把 ordinary 排到 rejected batch 之前。
7. 任一 active edit/acquisition 时所有排序 mutation 都拒绝，因此 reservation 保持原 slot，
   没有条目跨过 marker。Save/Cancel 仍只替换原 slot。
8. user-stop recovery 的 ordinary 批次继续按既有规则恢复到 ordinary 队首；其后原有
   manageable 条目仍保持用户最近确认的相对顺序。
9. ordinary start definite failure 的消息继续按既有显式 recovery/submit 路径重新进入；它的
   既有插入 precedence 不因排序改变，未离开 ordinary 的条目保持当前用户顺序。
10. steer definite-failure recovery、target terminal、not-steerable、rejected batch 和 rejected
    restore 继续遵守各自既有 precedence，但处理仍未 issue 条目时必须使用用户排序后的
    权威顺序，不能回退到排序前的 insertion order。
11. `pendingSteers` 始终是 steer 分组中的固定只读前缀；“移到最前”只到
    `steerQueue` 首位。

steer 的具体 rank/token 表达、重编号策略和内部容器拆分属于计划阶段的实现判断；设计要求是
所有会转移或恢复 unsent intent 的路径共享同一权威顺序关系，而不是同时保留互相矛盾的
“数组顺序”和“历史 insertion order”。

## 并发、失败与恢复

| 场景 | Owner 结果 | Drawer/调度行为 |
| --- | --- | --- |
| revision 已变化或条目先被 drain | stale/not manageable | 不移动；按最新 revision 重读并提示 |
| 条目已经形成 start/steer claim | not manageable | 不修改发送链；刷新并提示已开始发送 |
| 任一 active edit/acquisition | edit conflict | 全局不排序；保持编辑 session 和 reservation |
| 另一 management mutation 或 runtime replay 正在结算 | mutation pending | 不并行修改；刷新或允许用户重试 |
| release 已取得 reservation | unavailable | 不修改即将释放的 owner |
| owner 被 replace/dispose | owner gone | 不向旧 owner 写入；关闭或切换到新 owner 事实 |
| synchronous snapshot listener 触发 dispose/replace | settlement unavailable | 不对新 owner继续 drain；成功事实只属于原 owner generation |
| accepted runtime event 在 mutation 中到达 | deferred then replayed | mutation 结算后按 coordinator 既有顺序 replay |
| recovery pending 或 active | unavailable | 不排序；等待 recovery 结算后按最新 owner 顺序重试 |
| recovery 后条目重新进入 lane | 既有 recovery precedence | 恢复条目按既有规则插入，其余条目保持用户相对顺序 |
| 首/尾边界操作 | no-op | 不推进 revision，不显示成功 |

排序和 drain 使用同一 coordinator mutation 仲裁。二者发生竞态时只有一个先取得当前 owner
事实：排序先成功则 drain 使用新队首；drain 先形成 claim 则旧 revision 的排序失败。任何路径
都不能让同一条消息同时留在队列并形成 claim。

## 验证矩阵

### Queue 与 steer 状态机

定向测试至少覆盖：

- ordinary 和 `steerQueue` 的头、中、尾执行 earlier/later/first/last 后得到完整期望顺序；
- 首尾边界 no-op 不推进 revision，owner 投影的移动能力与真实可移动边界一致；
- pending steer 固定在前且只读，唯一 unsent steer 不因混合 group count 获得虚假移动能力；
- 排序保持完整 message、draft/input、display key、lane、target、client identity 和 source；
- 新 enqueue 追加到排序后尾部，ordinary promotion 使用排序后的队首；
- 下一次 start/steer claim 和纵向 RPC 使用排序后的条目，而不是旧展示或旧 insertion order；
- active edit/acquisition、stale key/revision、foreign key、drained item、pending item、release 和
  dispose 均不能改变顺序；
- 排序与 drain/claim 两种事件先后顺序都只消费一次消息；
- user-stop recovery、ordinary start recovery、steer definite recovery 分别保持自身既有
  precedence，并保留其余 manageable 条目的用户相对顺序；
- target terminal/not-steerable、mixed pending/unsent target、rejected merge definite failure
  与 rejected restore 不会让 steer 回退到排序前的 insertion order；
- count、release blocker、pending prefix 和 rejected-first 不因排序变化。

测试通过 owner interface 比较完整结果、完整 snapshot 和完整后续 claim，不暴露内部
splice/rank 算法作为测试 seam。

### Coordinator

定向测试至少覆盖：

- move 与 begin/delete 使用同一 live-owner、generation 和 management mutation 仲裁；
- mutation 成功只推进一次 revision并发布权威 snapshot；旧 cursor/page/detail 全部 stale；
- deferred accepted runtime event 在 settlement 后只 replay 一次；
- synchronous subscriber dispose/replace 后不向旧或新 owner错误续写；
- owner gone、release reserved、active edit、mutation pending 和 recovery pending 返回明确结果；
- mutation settlement 后 scheduler 按新顺序恢复，不产生排序专用 RPC。

### Drawer Browser Mode

组件测试至少覆盖：

- manageable ordinary/steer 显示常驻上移/下移和菜单首尾操作；pending steer、editing 和
  read-only 条目没有排序入口；
- 首尾操作禁用语义、键盘操作、菜单 Escape、accessible name 与中英文 Lingui 文案；
- 不存在拖拽入口或把 pointer drag 当作唯一操作；
- 初始各 lane 的加载预算为 20，Show more 增加各自预算；排序后按新 revision 重读两条 lane
  各自原预算内的权威前缀，不局部重排旧 page；
- 多 page 重读只允许一次 stale 重启，再次 stale 时显示现有反馈并回到最新首批事实，不形成
  无界刷新循环；
- 移动条目留在前缀时恢复条目焦点；移出前缀时不自动加载或定位，焦点落到 lane heading/
  反馈并只播报一次新位置；
- stale/not manageable/edit conflict/owner gone 不显示成功，刷新后仍可继续管理有效条目；
- 删除确认态和编辑态不暴露排序操作，主 Composer 焦点与草稿不受影响；
- 窄 viewport 下 action row、菜单、反馈和加载更多仍可访问、可滚动。

Browser Mode 使用 role/name locator，不固化 padding、颜色等主观样式数值；异步 owner 刷新用
polling 等待，不用固定 sleep 掩盖竞态。

### App 纵向路径

纵向验证至少证明：真实 `ComposerTurnControl` 通过当前 thread coordinator 发起 move；
ordinary 与 steer 的下一次 generated `turn/start` / `turn/steer` 请求使用新顺序；排序不产生
额外协议调用；thread owner replacement、release 和 dispose 不让旧 Drawer 向新 owner 写入。

## 当前代码影响面与排除依据

以下文件构成计划阶段必须追踪的纵向路径；本节不预先规定具体拆分或命名：

- `composerInputQueueContracts.ts`：page item 移动能力、move request/result 与公开 owner
  interface；
- `composerInputQueue.ts`：ordinary 权威顺序、display key/revision、claim、promotion、recovery
  和组合 owner mutation；
- `composerSteerQueueState.ts`：steerQueue、pending、intent/rejected order、target close 与
  recovery restore；
- `composerInputQueueCoordinator.ts`：live owner、management mutation、runtime replay、release、
  snapshot 和 dispose；
- `ComposerPendingInputDrawer.tsx`：条目 actions/menu、已加载深度、新 revision 重读、反馈和
  焦点；
- `ComposerPendingInputRegion.tsx`、`ComposerTurnControl.tsx`：当前 controller、snapshot 与
  Drawer 挂载纵向路径；
- 对应 queue/coordinator/Browser Mode/App 集成测试与 Lingui catalog 生成物。

当前证据排除 app-server protocol、generated RPC contract、Redux、TUI 与主 Composer 编辑器
改动。排序在 GUI 本地 owner 内完成，现有 coordinator 已是生产和测试共同使用的真实 seam，
不为排序新增 pass-through adapter 或第二个 owner。

## 设计完成条件

本设计只有在以下事实同时成立时才算实现目标：用户能通过按钮和菜单调整 ordinary 与纯本地
steer 各自的真实发送顺序；跨 lane 和已发送条目始终不可移动；active edit 全局禁排；owner
以 key + revision 原子完成 mutation；steer 的 rejected/recovery 路径不会恢复旧 insertion
order；排序后按两条 lane 原加载预算重读权威前缀且不自动定位移出条目；下一次 start/steer 使用新
顺序；所有竞态、release、recovery 和 dispose 路径都不会产生重复发送、虚假成功或双 owner。
