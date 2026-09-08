# B05 事件接入与运行状态

基线：`63762612e56d332f474a5ba3861b22be761f0479`。状态：静态主审、独立复核与跨模块收敛完成。

## 覆盖

已读取本批全部 4 个文件：`projectionIngressAdapter.ts`、`threadRuntimeSlice.ts` 及各自测试。关联读取 `activeThreadSessionReadModel`、App store 和展示消费者，关联文件主归属不转移。

## 结论与检查依据

本批未发现证据充分的独立缺陷或结构整改项。

| 维度 | 检查结论 |
| --- | --- |
| 行为 | `projectionIngressAdapter.ts:105` 接收事件前检查 thread/subscription、最新 commit 去重、parentCommit 链和 item 父 turn；delta 不推进持久提交链。 |
| 状态与生命周期 | attach 重设订阅、head、已知 turn 与手动重连状态；发生连续性缺口后后续事件和 delta 均被暂停，不在不一致数据上继续累积。 |
| 恢复 | matching backpressure 进入 manualReconnectRequired；新 attach 才清除暂停。错误 thread、旧 subscription 不污染当前会话。 |
| 契约与安全 | event switch 消费权威 ThreadProjectionEvent，并保留 `satisfies never`；没有把前端猜测写成替代协议。 |
| 性能 | runtime store 不复制 turns/status；selector 按 threadId 读取。sessionRevision 随 transition 更新为一致性证据，未证明其实际渲染成本构成性能缺陷。 |
| 职责 | ingress 判断接入资格，runtime slice 派生展示元数据；session 生命周期仍由外部 owner 管理，没有在 reducer 执行连接副作用。 |
| 测试 | ingress 测试覆盖正确链、错误归属、最新提交重复、快照已含事件、token usage、缺 turn、暂停及替换；runtime 测试覆盖 revision 单调性与基线替换。仅静态读取。 |

## 排除与验证边界

turnCompleted 不强制要求本地已知 turn，因为完成事件携带完整 turn；不得把与 item 事件不同的策略直接当成漏检。快照重放已确认存在跨批问题 [QR-B06-001](./batch-06-transcript-state.md)：B05 接受连续事件后，B03 replay 可能把真实 completion 标成重复，再由 B06 丢弃。问题正文仅保留于 B06，本批无独立发现不代表整条链无问题。

本批未执行测试；如跨模块复核对顺序或重放产生具体疑点，可定向运行两份现有单测。当前没有为获得测试数量而运行无疑点的检查。

## 交接

X01 核对接入事实到 transcript 展示的传播，X03 核对暂停状态到恢复入口。整体数据一致性以跨模块结论为准，不由此局部无发现推出。
