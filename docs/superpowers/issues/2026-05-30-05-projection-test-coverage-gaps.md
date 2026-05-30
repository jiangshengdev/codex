# P2 · Projection 已知风险路径无端到端测试覆盖

日期:2026-05-30
范围:批次 5(Projection 测试)
优先级:中(覆盖缺口 —— 已知高风险路径无集成测试把守,重构易回归且不可见)

## 问题

两个投影集成测试(`tests/suite/v2/thread_projection.rs`)自身确定性良好(全程 `tokio::time::timeout` + 缓冲读取,无 sleep 碰运气、无 flaky),但本特性最容易回归的几条路径在集成层完全无人把守,仅靠 manager 单测(不经真实 outgoing channel / per-thread listener task)间接覆盖。

三处高价值缺口:

1. **detach 后不再投递**——核心契约无端到端覆盖。test 1 调了 detach 后不再跑 turn;test 2 全程不 detach。没有「attach→收事件→detach→再跑 turn→断言该订阅收不到新事件」这条路径(`thread_projection.rs` 整体)。若 detach 在 fanout/投递层没真正退订(listener 仍发),集成层抓不到。

2. **队列满→静默 invalidate**——本特性核心防护无端到端覆盖。生产路径 `projection_fanout.rs:132-139`(`TrySendError::Full` → `invalidate_thread_projection` + `cancel()` + `remove_handle`)只有合成容量单测 `queue_full_invalidates_generation_and_drops_current_job`。没有「慢/卡住客户端把真实 outgoing channel 堵满 → 该订阅被 invalidate 且静默停收,同时其它订阅/线程存活」的集成测试。直接关联已落盘的 [[2026-05-30-01-projection-fanout-silent-invalidation]]。

3. **事件负载不断言**——`thread_projection.rs:144-159` 只校验 `thread_id`/`subscription_id`/`commit_id`↔`parent_commit_id` 链,从不断言首事件是 `ThreadProjectionEvent::TurnStarted`,也不断言任何 turn/item 负载。生产侧 `projection_event_from_notification`(`thread_projection.rs:428`)的通知→事件映射若回归(发错事件种类、payload 空/错配),只要 commit id 链仍连续,测试照样绿。契约的「事件内容」这一半未覆盖。

## 为何是风险

这三条恰好是「客户端与线程保持同步」这一特性最关键、也最容易在重构中破坏的链路:退订是否生效、背压满了如何处置、事件内容对不对。集成测试全绿不代表它们正确 —— 回归会静默通过 CI。

## 次要项(P3,一句话带过)

- `thread_projection.rs:147` 的 `assert_eq!(attach.snapshot.head_commit_id, first.parent_commit_id)` 实为 `None == None` 恒真(attach 在任何事件前),给人「验证了 snapshot→首事件父链」的错觉,未在 head=Some 的非平凡场景验证。
- per-thread listener task 在 thread unload/remove 时的生命周期、多订阅者 fanout 路由,均仅单测覆盖,无集成测试。
- `turn_interrupt.rs:58` 把既有 abort 测试静默切到 `create_config_toml_excluding_tmp_roots`,改动了被中断工具的沙箱面(与 abort 语义无关),仅信息性。
