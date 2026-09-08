# Codex GUI 跨模块质量复核

基线：`63762612e56d332f474a5ba3861b22be761f0479`。X01、X02、X03 静态复核完成。来源为各批稳定报告及直接相关源码；未运行真实 GUI 验收。

## X01 发送到展示

Capture 固定 EditorState 和技能身份；本地持久化接收成功后才 clearIfCurrent，不能把本地 accepted 当服务端执行成功。coordinator 先保存候选再执行 RPC effects，使用 thread/turn/client ID 与 generation 归属。队列消费 live userMessage itemStarted 确认，transcript 按 completed policy 展示，两者允许合法中间状态。

依据：`composerDraft.ts:99-116,173-225`、`ComposerEditor.tsx:344-355`、`composerTurnApplication.ts:165-207`、`composerInputQueueCoordinator.ts:449-500,526-539,785-873`、`composerInputQueueRuntimeObservation.ts:5-29`。上述文件位于各自同名 feature 目录。

| 已有编号 | 跨模块结论与唯一正文 |
| --- | --- |
| QR-B03-001 | [B03](./batch-03-sessions.md)：过宽 session revision 撤销 pending edit，B10 丢本次修改；不是 B08 capture 清除后续编辑。 |
| QR-B06-001 | [B06](./batch-06-transcript-state.md)：inProgress 快照与真实 completion 的去重错配；不影响普通队列 userMessage 确认。 |
| QR-B07-001 | [B07](./batch-07-transcript-display.md)：合法 AgentPath 进入展示后抛错，与 B06 未入状态不同。 |
| QR-B09-001 | [B09](./batch-09-input-queue.md)：unknown merge discard 所有权遗漏，保存失败并回滚。 |
| QR-B09-002 | [B09](./batch-09-input-queue.md)：discard 成功后的发布与合法续发缺失，与保存回滚不同。 |
| QR-B02-001 | [B02](./batch-02-connection.md)：当前 GUI settings 失败支路已排除；未找到已接受后返回 RPC error 的完整生产反例，保留风险。明确拒绝不立即自动重发。 |
| QR-B09-004 | [B09](./batch-09-input-queue.md)：accepted 入 pending 不等于已 commit；生产 terminal/response 调度仍缺证据。snapshot 恢复可收敛，不能当作在线即时恢复。 |

X01 拆为 DISPLAY、RPC、STEER 三个独立只读问题，无新增编号。局部单测通过不能证明这条链路整体一致通过。

## X02 会话切换、新建、历史与恢复

查看与激活、异步新建选择意图、loaded 分页、删除后重新读取路由的正常链路已静态闭合。查看失败成员不自动重试；loaded 查询失败不推断为未加载；移除不等于删除后端 thread。

[B04 的 QR-B04-001](./batch-04-new-and-history.md) 保持确定：连接替换后历史详情保留旧 readThread 能力，Retry 仍失败。数据快照寿命与连接能力寿命必须分开；不得卸载已有历史快照来规避。

B03 编辑失效与 B09 两个 discard 问题保持原编号。B09 旧 revision 还会阻止 resumeRestored，直到另次 publish；该影响归并 QR-B09-002。新建、恢复等既有保护不能作为自动重发 unknown 的授权。X02 无新增独立发现。

## X03 断线、协议错误与公共反馈

公共诊断组件保留原始错误内容；失败状态未进入组件展示分支时，组件本身无法补救。异常 close 和协议错误有 error 反馈，正常 close 与 projectionUnavailable 存在下列不同缺口。

### QR-X03-001：连接正常关闭后当前任务无提示变为空白

分类：确定缺陷；优先级：P2。位置均相对仓库根，属于上述固定基线。

触发：当前任务已加载，无其他错误，WebSocket code 1000 关闭，之前没有 terminalError 且清理成功。

证据：

- `codex-gui/src/features/guiHost/guiHostClient.ts:100-108` 先 invalidate transport/commands，再发布 closed。
- `codex-gui/src/features/appShell/guiHostConnectionLifecycle.ts:131-135` 清 commands 并调用 connectionUnavailable；`codex-gui/src/features/activeThreadSession/activeThreadSession.ts:423-448` dispose 会话并清集合。
- `codex-gui/src/features/currentTask/CurrentTaskPage.tsx:193-194` 对 disposed 返回空 main。
- `codex-gui/src/features/appShell/AppShell.tsx:15,52` 与 `AppShellTopBar.tsx:39-42` 的提示条件没有 closed。
- lifecycle `:81-83,123-128` 仅 BFCache persisted pageshow 触发 restart，没有正常关闭后的页面内恢复入口。

影响：当前任务内容和输入消失，但用户看不到关闭原因或恢复操作。持久化记录未因此删除，浏览器刷新仍是页面外恢复方式。不能泛化为所有断线均无提示。该局部可用性失败定为 P2，未宣称数据丢失。

根因：连接生命周期正确撤销能力，但页面未消费正常关闭状态的用户反馈和恢复语义。

整改涉及 guiHost、appShell、currentTask、activeThreadSession。修正方向是提供可见关闭说明和明确恢复操作。必须保留失效命令隔离、清理失败传播、启动任务归属和未知交付屏障；不得把 closed 假装成 initialized 或自动重发。

验收条件：已连接任务正常关闭后有解释及可用恢复入口；异常关闭、协议错误仍可诊断；恢复后任务归属正确且 unknown 不重复交付。

验证：静态调用链确认；`codex-gui/src/__tests__/AppProjectionAvailability.browser.test.tsx:180-193` 已有断言确认连接 unavailable 后 composer/input/QR 消失，但本轮未运行该 Browser 测试，也未真实复现 code 1000 交互。

### QR-X03-002：投影暂停缺少具体原因与可执行恢复入口

分类：确定缺陷；优先级：P2。触发：已发布 ready 会话收到合法 backpressure 关闭通知，或提交链不匹配，host 连接仍可用。

证据：

- `codex-gui/src/features/projectionIngress/projectionIngressAdapter.ts:105-125,145-153,174-185` 转为 manualReconnectRequired 并忽略后续事件。
- `codex-gui/src/features/activeThreadSession/activeThreadProjection.ts:153-166` 与 `liveActiveThreadSession.ts:569-574,608-614` 发布 projectionUnavailable、reason 和 connectionRestartRequired。
- `codex-gui/src/features/composerTurnControl/composerTurnApplication.ts:115-124`、`ComposerTurnControl.tsx:174-184` 禁止操作；`codex-gui/src/features/currentTask/CurrentTaskPage.tsx:204,254-274` 保留内容，但 recoveryAction 没有覆盖 projectionUnavailable。
- `codex-gui/src/features/transcriptState/transcriptProjection.ts:97-106` 设置 globalStatus，`codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurfaceRenderer.tsx:81-99` 在正文显示 Connection interrupted. Reconnect required.，但未展示 backpressure/commitChainMismatch 的具体原因。
- `codex-gui/src/features/appShell/ActiveThreadCollectionMenu.tsx:170-181` 另有错误圆点与 This task needs attention，移除阻断文案要求先恢复连接；菜单只有选择/删除，没有恢复。
- `codex-gui/src/features/activeThreadSession/activeThreadMemberLifecycle.ts:196-201` 对 ready 的激活直接返回；`:168-176` 的既有 retry 只刷新 threadStatus，不重新 attach。

影响：用户看到旧内容、禁用输入和正文通用重连提示，菜单也提示需注意，但没有具体原因与执行恢复的入口。不是缺少文字反馈，也不是 WebSocket 必然断开。暂停是必要保护，缺陷在暂停后的用户恢复路径，定为 P2。

根因与整改：投影 owner 提供了 reason/recovery 契约，页面控制没有消费其恢复能力。涉及 projectionIngress、activeThreadSession、currentTask 和 composerTurnControl；应提供与 connectionRestartRequired 一致的明确恢复操作及原因。必须保留提交链检查、暂停门禁、身份隔离及 unknown 交付屏障；不得通过重新启用发送或忽略连续性检查掩盖问题。

验收条件：backpressure 与 commitChainMismatch 均有可见原因和明确恢复操作；完成恢复前仍拒绝发送，恢复后使用有效订阅且不重发 unknown；普通 threadStatus retry 不伪装为投影恢复。

验证：静态调用链确认。`codex-gui/src/__tests__/AppProjectionAvailability.browser.test.tsx:143-178,195-211` 覆盖暂停与 recovery 字段，但未断言用户可见原因或完成恢复；本轮未运行 Browser/真实运行验收。

## 归并与限制

X03 的两项发现仅在本文件保存正文。B01 修正为“保留 session 引用，但当前正文卸载”；B04 连接已替换后仍用旧能力是另一根因。B12 parentCommitId schema 差异继续保留风险：非法输入若被接受会显式暂停，未证明当前后端会省略字段。B13 .surface 载体当前存在，其布局断言缺口只属于可维护性建议。

全部跨模块节点完成；剩余产品整改与真实场景验证是后续交接，不在本轮执行。定向测试实际证据见 [汇总](./00-summary.md) 与 [覆盖记录](./coverage-and-progress.md)。
