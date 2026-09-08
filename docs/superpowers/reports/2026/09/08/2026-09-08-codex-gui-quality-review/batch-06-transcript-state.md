# B06 对话状态、分块与上下文页

基线：`63762612e56d332f474a5ba3861b22be761f0479`。状态：静态主审、独立复核与跨模块收敛完成。

## 范围与覆盖

本批逐一读取 `codex-gui/src/features/transcriptState/**` 全部 25 个文件，主覆盖身份及进度以 [覆盖清单](./coverage-and-progress.md) 为准。关联读取不转移文件主归属。

实现文件：`transcriptContextPages.ts`、`transcriptEventDedup.ts`、`transcriptItemPolicy.ts`、`transcriptProjection.ts`、`transcriptStateImplementation.ts`、`transcriptStateModel.ts`、`transcriptStateSelectors.ts`、`transcriptStateSlice.ts`。

测试及辅助文件，均在该目录的 `__tests__/`：`requiredTranscriptState.ts`、`transcriptCollabAgentItemPolicy.test.ts`、`transcriptContextPages.test.ts`、`transcriptItemPolicy.test.ts`、`transcriptSessionSlots.test.ts`、`transcriptStateAgentMessageStreaming.test.ts`、`transcriptStateCommittedActivity.test.ts`、`transcriptStateCommittedMessages.test.ts`、`transcriptStateCommittedTerminal.test.ts`、`transcriptStateLiveItemPlacement.test.ts`、`transcriptStateLiveItemSettlement.test.ts`、`transcriptStateReasoningStreaming.test.ts`、`transcriptStateReconnect.test.ts`、`transcriptStateReplayDedup.test.ts`、`transcriptStateScrollSignals.test.ts`、`transcriptStateSelectorCache.test.ts`、`transcriptStateSnapshot.test.ts`。

直接关联证据包括 `activeThreadProjection.ts`、`activeThreadProjectionReplay.ts`、`activeThreadProjectionFacts.ts` 及 `activeThreadProjection.test.ts:1-125`；后端 `request_processors/thread_projection.rs` 的快照构造、`thread_state.rs` 的当前 turn 快照、`thread_projection_runtime.rs` 的 attach 响应、`thread_projection.rs` 的订阅建立、`request_processors/thread_lifecycle.rs` 的 active turn 合并，以及协议 `thread_history.rs` 的相关条目生命周期函数。外部文件只做有界契约追踪，没有全面评审或运行后端程序。

## 七维检查结论

| 维度 | 结论与关键依据 |
| --- | --- |
| 行为正确性 | 常规 snapshot、started、delta、completed 路径均进入同一条目策略与归属实现。发现运行中协作活动 attach 后的真实 completion 被错误去重，见 QR-B06-001。 |
| 状态与生命周期 | `transcriptStateSlice.ts:115-133` 以 instanceId 和递增 sessionRevision 接受 slot 变更；`transcriptStateImplementation.ts:231-300,615-657` 在 middle/final 结算时同步 turn 与 fragment 的索引及可见计数。未发现跨会话污染或常规结算重复计数。 |
| 异常恢复 | `transcriptProjection.ts:86-107` 在订阅不可用时清理流式 reasoning 并保留已完成内容；`transcriptStateImplementation.ts:753-766` 在新 attach 时整体重建，清除旧 transient、去重窗口及中断提示。恢复后的协作活动缺失属于 QR-B06-001。 |
| 契约与安全 | `transcriptStateModel.ts`、`transcriptItemPolicy.ts` 从 `@codex-protocol/v2` 的权威 ThreadItem/Turn/ThreadProjectionDelta 派生，转换 switch 保留穷尽检查。reasoning 只投影 summary，忽略 raw reasoning delta。此层不负责网络输入校验，未把职责外校验缺席当作漏洞。 |
| 性能 | `transcriptStateImplementation.ts:178-201` 按 fragment 分配有界 middle chunk；`transcriptStateSelectors.ts:343-394` 按 entry/chunk 对象及 revision 缓存，只展开当前 chunk。未在 selector 中发现全 turn 条目 flatten。未执行性能测量，不由静态分块结构推出整体渲染性能通过。 |
| 职责与耦合 | policy 负责条目可见性，implementation 负责归属及变更，contextPages 负责分页拓扑，slice 负责会话 slot。turn/fragment 同步索引增加维护面，但有分页和 chunk 消费用途，未仅因字段重复或文件长度登记结构缺陷。 |
| 测试有效性 | 静态阅读覆盖 slot 隔离、快照替换、重复事件、流式结算、计数、上下文边界及未变 chunk 引用。缺少 snapshot 内已有 inProgress collab 之后真实 completion 的整链断言；手工传入 replay 标记的 reducer 测试不能证明上游 replay 分类正确。测试均未执行。 |

Redux 判断按项目 `redux-toolkit` skill 及本地 style-guide/createSlice 文档核对。Immer reducer 中的修改语法符合当前库语义；未将其视为直接修改已发布 Redux 状态。

## QR-B06-001：运行中协作活动 attach 后的真实完成事件被当作快照重复

分类：**确定缺陷**。优先级：**P2**。证据状态：合法后端构造路径与前端消费路径的静态闭包；没有运行复现。

本报告是该发现正文的权威位置。根因代码位于 B03 的 replay 分类，B06 是快照可见性及事件丢弃的消费者；编号及正文位置不意味着相关代码主归属从 B03 转移。B03、X01 与总报告应引用本编号，不复制一份独立问题正文。

### 触发与影响

当 `wait` 或 `resumeAgent` 已开始、尚未结束时 attach 当前任务，快照中包含该 `inProgress` 协作条目。B06 不展示这个快照条目；随后同一 item ID 的真实 `itemCompleted` 被 B03 判为 `snapshotDuplicate`，B06 直接忽略。因此等待/恢复活动及其完成结果不会出现在此次订阅的 transcript 中，直至再次 attach 获取 terminal 快照。

此影响是协作活动记录缺失，未发现其导致后端协作操作本身执行失败或对话正文丢失的证据。触发依赖 attach 与协作调用重叠，故定为 P2。

### 证据链与根因

1. 后端可合法产生这个快照：[thread_history.rs:1008](/Users/jiangsheng/cnb/codex/codex-rs/app-server-protocol/src/protocol/thread_history.rs:1008) 的 waiting begin 将 `call_id` 写为 `InProgress` 条目，`:1030-1063` 的 waiting end 以同一 ID 更新 terminal；resume 对应 `:1107-1153`。这不是手工构造的非法 payload。
2. [thread_projection.rs:229](/Users/jiangsheng/cnb/codex/codex-rs/app-server/src/request_processors/thread_projection.rs:229) 获取 `active_turn_snapshot()`，`:287-290` 将 active turn 合入 paginated snapshot。`thread_state.rs:170-172` 直接返回当前 history builder 快照，`thread_history.rs:265-270` 将当前 turn 转为协议 Turn。
3. [transcriptStateImplementation.ts:727](/Users/jiangsheng/cnb/codex/codex-gui/src/features/transcriptState/transcriptStateImplementation.ts:727) 对 snapshot 每个 item 使用 `projectCompletedTranscriptItem`；[transcriptItemPolicy.ts:197](/Users/jiangsheng/cnb/codex/codex-gui/src/features/transcriptState/transcriptItemPolicy.ts:197) 的 completed collab policy 在 `status === "inProgress"` 时返回 `ignore`，所以没有可见活动条目。
4. [activeThreadProjectionReplay.ts:12](/Users/jiangsheng/cnb/codex/codex-gui/src/features/activeThreadSession/activeThreadProjectionReplay.ts:12) 将 snapshot 所有 item ID 收入索引；`:30-34` 对 `itemStarted` 和 `itemCompleted` 共用 ID 存在性判断。存在性只证明该 item 曾被快照包含，不能证明后续 completion 的状态和内容也被包含。
5. [activeThreadProjection.ts:67](/Users/jiangsheng/cnb/codex/codex-gui/src/features/activeThreadSession/activeThreadProjection.ts:67) 创建该索引，`:85` 在处理之后的 accepted event 时持续使用它；[transcriptProjection.ts:31](/Users/jiangsheng/cnb/codex/codex-gui/src/features/transcriptState/transcriptProjection.ts:31) 对 `snapshotDuplicate` 无条件返回。真实 terminal 因而不能修正第三步的缺失。

根因是 replay 分类把“快照内存在 item”当成“该 item 的后续生命周期事件已被快照覆盖”。B06 将 snapshot 的 inProgress 活动走 completed policy，使问题先表现为活动隐藏，再因错误去重持续缺失。

### 测试证据与缺口

`activeThreadProjection.test.ts:36-115` 测试已完成快照 item 的重复事件，以及 pending turn 中的新 item，没有覆盖快照已有 inProgress collab 的后续 completion。`transcriptStateReplayDedup.test.ts` 直接输入 `replay: "snapshotDuplicate"`，只能证明 B06 遵守该事实，不能证明事实正确。`transcriptCollabAgentItemPolicy.test.ts` 明确断言 completed policy 忽略 inProgress collab；常规 started→completed 的原位更新另由 `transcriptStateCommittedActivity.test.ts` 覆盖。

本次未运行这些测试，也没有新增测试。现有断言即使通过，也不能补足这个集成场景。静态链已足以确认上述控制流，真实 GUI 中的可见复现仍未执行。

### 整改交接

- 涉及模块：B03 `activeThreadProjectionReplay` 与 `activeThreadProjection`，B06 snapshot 构造及 collab item policy；X01 消费事件到展示链路。
- 修正方向：依据权威快照实际覆盖的生命周期状态区分重复和后续有效更新，并明确 snapshot 中运行中协作条目的展示语义。不得通过取消全部去重或增加猜测性协议副本解决。
- 必须保留：真正快照重复事件的幂等性、提交链连续性、thread/subscription/instance 隔离、相同 item 原位结算、分页归属与未变 chunk 的引用稳定性。
- 验收条件：分别覆盖 `wait` 与 `resumeAgent` 的 started→attach(inProgress snapshot)→completed；完成后仅有一份 terminal 记录，并与全过程持续订阅的结果一致。加入失败 terminal 与重复 completion，验证状态更新不被吞掉且不重复插入。运行中展示按修正后明确的产品语义断言；不能将已有 completed snapshot 的重复事件错误当成新活动。
- 关联：B03 replay、B05 accepted event、X01 事件到展示。当前无其他编号归并；其他报告引用本编号。

## 已排除项与证据限制

`transcriptContextPages.ts:74-97` 对 `(turnId,itemId)` boundary 去重；每个新边界创建独立 fragment，middle chunk 从当前 fragment 选择。`transcriptContextPages.test.ts` 静态覆盖重复、连续和尾部 compaction，以及单 turn 跨页。未发现边界重复或跨页共用一个 middle chunk 的路径。

空 live slot 不提前增加可见计数。移除早期 slot 时，`transcriptStateImplementation.ts:264-275` 仅在整个 turn 不再有 middle entry 时清空 chunk 集合，保留后续隐藏 slot 的寻址关系。相关 placement、settlement、selector cache 测试静态覆盖这些边界；没有实际测试通过声明。

曾核查“partial agentMessage 被 snapshot 当成 completed”假设，但外部证据不支持该表述：`thread_history.rs:635-646` 不从 agent/reasoning itemStarted 物化这些条目，`:331-339` 处理完整 AgentMessage/AgentReasoning，不处理 delta。故不将此假设列为缺陷，也不把 QR-B06-001 泛化为所有消息类型。中途 attach 的实时流式恢复能力不能由本次已完成条目检查宣称全面验证。

终止或断线清理在 `transcriptStateImplementation.ts:572-614` 遍历需要清理的 turn 条目；这是状态清理路径，不是 selector/render 的全 turn flatten。未测量清理成本，不把其存在直接定为性能问题。

## 验证与后续交接

本批未执行测试、源码修改或真实运行验收。Level 1 只有静态检查现有测试内容；Level 2 未执行；Level 3 不属于本批验证动作。报告结论不代表产品完全验证通过。

父节点若需确认已有分块和结算断言的实际状态，可为 `transcriptStateSelectorCache.test.ts`、`transcriptStateLiveItemSettlement.test.ts` 或 `transcriptContextPages.test.ts` 建立精确 V 节点，按疑点选择，不默认整批运行。它们不覆盖 QR-B06-001 的完整触发链，不能用其通过替代缺失场景。

跨模块复核已确认 QR-B06-001 的 B03 引用及 X01 归并，见 [跨模块报告](./cross-module-review.md)；其他常规分块、分页和清理结论在本报告声明范围内成立，不由局部未发现问题推出整体质量通过。

## 当前 canonical 生命周期补证

`codex-rs/core/src/tools/handlers/multi_agents_v2/wait.rs:77-115` 真实发出同 call_id 的 InProgress started 与 Completed；`codex-rs/core/src/tools/handlers/multi_agents/resume_agent.rs:64-78` 也有 started 路径。`codex-rs/app-server-protocol/src/protocol/thread_history.rs:586-613,624-650` 物化 canonical CollabAgentToolCall 生命周期，`codex-rs/app-server/src/bespoke_event_handling.rs:1126-1143` 发送 ItemCompleted，`thread_projection.rs:498-505` 转为投影。attach 的 `request_processors/thread_projection.rs:229-231,287-290` 合入 active_turn。因此本发现不只依赖 deprecated 历史处理分支。X01 已确认它只影响协作活动呈现，不扩大为普通队列确认丢失。
