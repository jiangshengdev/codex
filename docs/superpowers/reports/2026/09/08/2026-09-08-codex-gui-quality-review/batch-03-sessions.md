# B03 会话生命周期与持久化评审

日期：2026-09-08。代码基线：`63762612e56d332f474a5ba3861b22be761f0479`。

状态：主审与独立复核完成；已有定向单测证据。本报告不表示已修复或完成真实运行验收。

## 范围与结论

主覆盖为 `codex-gui/src/features/activeThreadSession/**`、`sessionCollection/**`、`browserPersistence/**`，共 24 个文件，已逐一检查实现与测试内容，无主范围排除项。精确文件及内容身份见 [覆盖清单](./coverage-and-progress.md) 的 B03 行。调查末尾对上述三目录执行相对基线的 `git diff --name-only`，输出为空。

确定缺陷 1 项：QR-B03-001。未另列待验证风险或结构改进建议。其运行证据缺口记录在该确定缺陷中，不重复建立风险编号。

核心生命周期基本具有独立 owner、异步选择意图、订阅身份与持久化失败边界；发现的问题是编辑能力绑定了过宽的会话版本，普通流式更新也会撤销对待发送消息的编辑。

## 七个维度的检查结果

| 维度 | 检查结论与依据 |
| --- | --- |
| 行为正确性 | 查看失败成员不会隐式重试，显式激活可重试；前台选择意图防止后台完成抢回查看目标。待发送编辑保存存在 QR-B03-001。 |
| 状态与生命周期 | 成员按 threadId 独立，live owner 另有 instanceId；初始化缓冲通知，成员清理取消 frame 与监听，迟到回调受 disposed 检查。普通展示 revision 与编辑有效性的耦合造成已确认问题。 |
| 异常恢复 | loaded 分页失败不推断为未加载，attach 失败不自动 resume；detach 与 membership 写失败保留不同重试状态。交付未知与恢复暂停没有被本批会话切换绕过。 |
| 契约与安全 | 消费 `@codex-protocol/v2` 权威类型；命令与角色以 Pick/ReturnType/索引类型关联来源。存储 envelope 是前端恢复语义，按授权 context 隔离；损坏记录不被静默覆盖。生成校验链的主评审归 B12。 |
| 性能 | 正常 delta 使用每成员 frame 合并，后台更新保持当前查看 snapshot 引用；初始化缓冲与集合遍历已检查，未取得足以单独定级的规模/延迟证据，不以文件大小或成员数猜测性能缺陷。 |
| 职责与耦合 | collection、member lifecycle、live session、projection、compaction、status、storage 有分工。编辑 gate 与所有会话更新共享 revision 的行为耦合已纳入缺陷，不再重复提出结构建议。 |
| 测试有效性 | 现有测试覆盖异步选择、加载分页、清理重试、持久化失败、旧身份、暂停恢复和 compaction。编辑测试明确期望普通 delta 后保存失效，因此其通过只能证明当前行为稳定，不能证明编辑体验正确。 |

## 关键链路与已排除疑点

本报告源码路径均相对 `codex-gui/src/features/`；未写目录的文件名位于 `activeThreadSession/`，仅写行号时沿用同条最近的文件。行号对应上述固定基线。

- 选择与恢复：`activeThreadSession/activeThreadSession.ts:203-245` 记录 selection intent 并在 await 后核验；`:280-291` 只为仍被查看且未被新意图取代的 retry 保存选择。既有成员保持原 owner，不因切换销毁后台队列。相关测试在 `activeThreadSession/__tests__/activeThreadSession.test.ts`。
- loaded/未加载分流：`activeThreadMemberLifecycle.ts:218-244` 查找 loaded 分页，成功确认未加载后才 resume，再 attach；身份不符失败。测试包含晚页命中、晚页错误、空且未落盘线程、attach 失败后显式重试重新查询。
- 通知隔离：`activeThreadMemberLifecycle.ts:438-478` 检查 threadId/subscriptionId，初始化时缓冲并排空，正常 delta 按 frame 刷新；`:502-529` 清理 frame、listener、live owner 与 slot。
- 安全移除：`activeThreadMemberLifecycle.ts:329-422` 刷新权威状态、检查 active turn/compaction/restoredPaused/队列 blocker，再获取 release reservation。`activeThreadSession.ts:353-400` 在成员持久化移除成功后 finalize；detach 或 membership 写失败保持可见、可重试的中间状态。
- 读模型身份：`activeThreadSessionIdentity.ts:9-12` 为 live owner 分配独立身份；关联读取 `threadRuntime/threadRuntimeSlice.ts:77-101` 与 `transcriptState/transcriptStateSlice.ts:103-133`，确认 slot 创建、移除、更新检查 instanceId 和递增 revision，旧 owner transition 不会创建或覆盖新 slot。
- 持久化：`browserPersistence/browserPersistenceStore.ts` 对同线程记录检查授权 context、版本、payload 与 expectedRevision；序列化后的数据先解码再单次 setItem。`sessionCollection/sessionCollectionPersistence.ts` 仅保存成员列表，查看目标仍由 browserLaunch 负责。损坏旧授权记录阻断写入是现有显式保护及测试约束，本批不将其误报为新缺陷。
- 恢复与 compaction：`liveActiveThreadSession.ts:112-149` 交给 queue reconciliation 后发布；成员保存 late suspension 信号。`activeThreadCompaction.ts` 将 ack 与 canonical lifecycle 分开，deliveryUnknown 不自动变成可重试，迟到 claim settlement 不复活结束操作。完整发送持久化闭包交接 B09/X02。

## QR-B03-001 普通流式更新使待发送编辑失效

分类：确定缺陷。优先级：P2。证据强度：完整静态调用链及下述现有单测运行记录。

### 触发、证据与影响

用户在线程仍输出时编辑一条待发送消息。开始编辑后，哪怕被编辑消息和 owner 均未变化，只要收到普通 projection delta 并刷新，点击保存就会失败。

1. `activeThreadSession/liveActiveThreadSession.ts:264` 保存整个 session 的 `capabilityRevision`，`:282` 用该版本校验编辑闭包；`:469-491` 最终要求它等于当前会话 revision。
2. 普通 delta flush 经 `:543`、`:578-591` 推进该 revision，所以一次与编辑目标无关的展示更新就使闭包失效。
3. `:270-277` 在失效后执行 `childReservation.cancel()`，恢复原待发送文本；保存闭包返回 unavailable，没有调用实际保存。
4. 直接 UI 消费者 `composerTurnControl/composerPendingInputSession.ts:389` 调用保存；`:692-699`、`:715-723` 处理 unavailable 时清空编辑并显示 `sessionInvalidated`。丢失的是用户本次新编辑内容，原待发送文本仍被恢复；不能描述成原队列消息丢失。
5. 现有 `activeThreadSession/__tests__/liveActiveThreadSession.test.ts:446-501` 明确构造开始编辑、delta、flush、保存，并断言 stale 与原文本恢复。这个断言印证当前行为，也说明现有测试会接受此问题。

影响是运行中编辑经常无法保存，用户需重新打开并重输修改。它不需要断线、切换会话或被编辑目标真正失效，因此定为有明确用户影响的局部缺陷 P2。

### 根因与整改交接

根因是把所有会话读模型更新的 revision 同时当成长时间编辑 reservation 的有效性版本。会话没有失效，但流式显示、技能或状态刷新都可能推进该版本。

涉及模块：B03 live session 能力门禁、B09 pending-input live management、B10 编辑状态与界面。下层 `composerInputQueue/composerPendingInputLiveManagement.ts:154-230` 已维护编辑 reservation，`:365-380` 表达 `targetInvalidated`，整改应依据实际目标及 owner 生命周期界定冲突，而非直接取消安全检查。

修正方向：将编辑有效性与无关展示 revision 解耦，保持单一编辑 owner 和目标失效语义；失败时明确处理尚未保存的新输入。本报告不指定实现计划。

必须保留：disposed、projectionUnavailable、真实目标删除/发送/替换后的陈旧写拒绝；失败清理一次性；跨会话隔离；原待发送内容可恢复；禁止为通过测试简单移除这些保护。

验收条件：同 owner、同目标的一般 delta 更新后仍可保存修改；真实目标或 owner 失效仍被拒绝；新编辑内容的保留/恢复结果明确；既有原消息恢复及单次清理约束仍成立。

关联问题与归并：B10 与 X01 引用本节，不重复保存问题正文。另有 [QR-B06-001](./batch-06-transcript-state.md) 的根因在本批 snapshot replay：快照已有 inProgress item 的未来真实 completion 被误判重复。该独立问题正文保留于 B06，不重复计数。

## 验证与证据缺口

- 已完成：24 文件静态检查及必要直接消费者读取，B03 相对基线差异核验。
- Level 1：主代理 V-01 于 15:43:13（本地时间）在 codex-gui 执行 `/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit src/features/activeThreadSession/__tests__/liveActiveThreadSession.test.ts src/features/committedTranscriptSurface/__tests__/subAgentActivityPresentation.test.ts`，2 文件合计 32 测试通过、无类型错误，退出 0。32 是跨 B03/B07 合计，不是本批独有数量。现有 stale 断言通过仅验证当前缺陷行为。Browser UI 输入丢弃复现未执行。
- Level 2：未执行，不在本计划默认授权范围。静态源码链路不能替代真实 Codex 运行验收。
- Level 3：本问题不依赖可见桌面、系统 IME 或跨应用焦点，不适用；未启动可见窗口。

QR-B03-001 已交接 B10/X01；评审期间不修改源码或测试。
