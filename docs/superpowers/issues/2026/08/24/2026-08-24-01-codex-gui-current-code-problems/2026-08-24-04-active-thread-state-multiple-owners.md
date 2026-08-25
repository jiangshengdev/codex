# Codex GUI active-thread 状态存在多个 owner

日期: 2026-08-24
状态: ✅ 已修复
范围: `codex-gui` 的 active thread、projection subscription 与 active turn 状态所有权
优先级: P2

## 摘要

原有多 owner 结构已由唯一 `ActiveThreadSession` authority 取代；React Context 只公开 stable session Interface，queue/skills mutation 通过带 revision 与 phase gate 的 role 执行。

## 问题

修复前，active-thread 会话没有一个能够独立表达并约束 thread identity、subscription lifecycle 与 active turn 的权威 owner。`ActiveThreadOwnerHandle`、`ProjectionApplicationCoordinator`、`ProjectionIngressAdapter`、Redux 的 thread identity/runtime，以及 `App` 的 React state 分别保存了重叠或相互依赖的状态。

这些来源并非单纯的只读投影：它们通过不同事件、不同生命周期入口和不同更新机制推进。Composer 因此需要同时读取 Redux identity、runtime subscription、runtime active turn 和外部 queue controller，再显式核对 controller 所属 thread，才能决定发送、引导和停止操作是否可用。

2026-08-25 的实现把 activation、projection、active turn、queue 与 skills 的会话生命周期收归 `ActiveThreadSession`。旧 owner/coordinator 与 Redux thread identity operability 路径已删除；terminal connection failure 会 dispose session，旧 revision 或 projection unavailable phase 会拒绝 mutation。

## 证据

以下路径和行号记录 2026-08-24 修复前的静态证据；对应旧文件已经删除，保留这些记录用于说明原问题：

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

当前源码证据：

- `codex-gui/src/features/appShell/AppCapabilities.ts:8-17`：Context capability 只持有 stable `ActiveThreadSession`，不暴露 controller 或高频 snapshot。
- `codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx:39,68-116,137-141`：Bridge 私有持有唯一 controller，React 侧只接收 `controller.session`；连接终止时统一失效并 dispose。
- `codex-gui/src/features/activeThreadSession/activeThreadSession.ts:61-62,188-228,695-713`：session 是统一 authority，snapshot 仅发布从属 `composerRole` 与 `skillsRole` capability。
- `codex-gui/src/features/activeThreadSession/liveActiveThreadSession.ts:119-186,340-363`：mutation 必须携带 expected revision；disposed、stale revision 与 projection unavailable 均返回明确 unavailable 结果。
- HEAD 中已不存在 `projectionCoordination/activeThreadOwner.ts`、`projectionApplicationCoordinator.ts`、`threadSwitchCoordinator.ts` 与 `threadIdentity/**`，也没有 compatibility alias、fallback、双读或双写路径。

## 判断

问题已修复。最终源码只有一个 `ActiveThreadSession` authority；Redux 只保留 revisioned derived read model，React consumer 通过 stable session snapshot 和 gated roles 读取或变更状态。terminal、stale revision 与 projection unavailable 的统一失效语义已经落在 session 边界内。

## 修复记录

- 设计与计划：`docs/superpowers/specs/2026/08/25/2026-08-25-codex-gui-active-thread-session-owner-design.md`、`docs/superpowers/plans/2026/08/25/2026-08-25-codex-gui-active-thread-session-owner-plan.md`。
- 设计/计划文档：`67b9779a9`；candidate projection：`82d71c644`；revisioned read model：`2fa4e795e`。
- live session：`7b16d61b7`，修正 `3de0a6986`；统一 activation：`44c2d9594`，修正 `6ff212188`。
- C1 stable capability：`1a995cc60`；session invalidation 修正：`758496ebf`；consumer cutover 与 legacy deletion：`79da9681b`。
- 独立 formatter：`9c9ae0a3b`；replan 记录：`107630d8f`；范围外 `Readonly` 类型整理的独立 inverse correction：`51e1e10c0`。

## 验证记录

- 最终 frontend CI：exit 0；unit 共 51/51 files、751/751 tests 通过。
- full Browser：exit 0；parallel 共 54/54 files、801/801 tests，sequential 共 9/9 files、21/21 tests，覆盖三种浏览器。
- V3 source/contract audit：PASS。确认唯一 authority、stable Context、gated roles、terminal/stale invalidation、legacy 删除及提交边界；工作树与 index clean。

## 影响

- 原有跨 owner 漂移风险与 Composer 跨来源 operability 核对已消除。
- 后续修改若绕过 stable session Interface、直接暴露 controller，或绕过 revision/phase gate，可能重新引入同类风险。
- 回归审查应继续检查 Context surface、controller 唯一持有点、legacy 路径缺失和 stale/terminal mutation rejection。

## 后续处理

设计、实现与验证均已完成；后续以现有 active-thread session unit、App Browser、sequential Browser tests 及 V3 source/contract audit 查询作为回归入口。若未来新增 owner、controller escape、operability selector 或 compatibility 双路径，应重新打开本 issue。
