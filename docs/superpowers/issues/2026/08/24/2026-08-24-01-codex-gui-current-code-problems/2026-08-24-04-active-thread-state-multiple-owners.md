# Codex GUI active-thread 状态存在多个 owner

日期: 2026-08-24
状态: 🔴 仍需处理
范围: `codex-gui` 的 active thread、projection subscription 与 active turn 状态所有权
优先级: P2

## 摘要

active thread、projection subscription 与 active turn 的关联状态由多个对象和 store 分别持有，当前消费者需要跨来源核对一致性，形成结构性漂移风险。

## 问题

当前 active-thread 会话没有一个能够独立表达并约束 thread identity、subscription lifecycle 与 active turn 的权威 owner。`ActiveThreadOwnerHandle`、`ProjectionApplicationCoordinator`、`ProjectionIngressAdapter`、Redux 的 thread identity/runtime，以及 `App` 的 React state 分别保存了重叠或相互依赖的状态。

这些来源并非单纯的只读投影：它们通过不同事件、不同生命周期入口和不同更新机制推进。Composer 因此需要同时读取 Redux identity、runtime subscription、runtime active turn 和外部 queue controller，再显式核对 controller 所属 thread，才能决定发送、引导和停止操作是否可用。

本轮静态审阅没有复现具体用户故障；问题在于多 owner 结构扩大了线程切换、失败恢复和 projection 失效时出现短暂或持久状态漂移的可能性，也使“一次切换完成后哪些事实必须同时成立”难以由单一边界证明。

## 证据

- `codex-gui/src/features/projectionCoordination/activeThreadOwner.ts:21-30`：`ActiveThreadOwnerHandle` 同时暴露 `threadId`、`subscriptionId`、projection owner、Composer queue coordinator 和 disposal lifecycle。
- `codex-gui/src/features/projectionCoordination/activeThreadOwner.ts:79-84,103-113`：同一 owner 内部又由 projection coordinator 和 queue coordinator 分别维护 projection 事件与 active-turn/Composer 相关状态；accepted event 通过 sink 从前者转交给后者。
- `codex-gui/src/features/projectionCoordination/projectionApplicationCoordinator.ts:40-49,60-66`：projection coordinator 自己保存 launch thread、subscription、ingress cursor 和 replay index，并再次暴露 owner thread/subscription ID。
- `codex-gui/src/features/projectionCoordination/projectionApplicationCoordinator.ts:103-120`：live-thread replacement 通过本地检查后分别写入 coordinator 字段并 dispatch Redux replacement action，跨对象与 store 完成一次提交。
- `codex-gui/src/features/projectionIngress/projectionIngressAdapter.ts:48-54,76-99`：ingress adapter 的 cursor 再次保存 `threadId`、`subscriptionId`、commit head、known turns 和 reconnect 状态，并在 attach 时整体替换。
- `codex-gui/src/features/threadIdentity/threadIdentitySlice.ts:7-10,23-45`：Redux identity slice 单独保存 launch/attached thread ID 与 attach status，并通过普通 attach action 或 replacement action 更新。
- `codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts:47-56,76-90,172-185`：Redux runtime record 再次保存 thread identity、active turn 与 subscription 状态；active turn 又随 projection events 独立推进。
- `codex-gui/src/App.tsx:22-24`：React 根组件另外持有 startup outcome、active owner 和 continue-thread capability 状态。
- `codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx:77-107,125-140`：Composer 同时读取 identity、runtime active turn、runtime subscription 和外部 queue snapshot，并核对 queue controller 的 owner thread 后才计算操作可用性。
- 本轮没有运行测试；以上证据来自 2026-08-24 对当前代码的静态审阅。

## 判断

问题仍成立，但当前证据支持的是结构性漂移风险，不是已经复现的用户可见故障。各状态副本可能承担不同职责，不能仅以“字段重复”为由合并；真正需要处理的是明确权威 owner、派生状态边界、原子切换不变量和失败时的统一失效语义。

## 影响

- 线程启动、线程切换、projection reconnect 与 disposal 需要协调多个更新点，遗漏其中一个来源可能产生身份、subscription 或 active-turn 视图不一致。
- Composer 可用性依赖跨来源一致性检查；新增状态或恢复分支时容易只更新部分 owner。
- 测试需要分别构造并同步多层状态，增加覆盖失败窗口和证明生命周期正确性的成本。
- 在没有先确定权威边界的情况下直接进行大型重构，可能只是移动状态副本，而没有消除漂移风险。

## 后续处理

需要把 active-thread session/transaction owner 作为独立设计目标，先明确 thread identity、subscription lifecycle、active turn、queue 与 projection cursor 中哪些是权威状态、哪些是机械派生状态，并定义切换提交、失败回滚和 disposal 的原子不变量。设计确认后再进入实施计划；本 issue 不预先指定具体状态容器或迁移方案。
