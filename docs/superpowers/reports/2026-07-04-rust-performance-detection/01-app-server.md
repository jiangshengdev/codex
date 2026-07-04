# App Server

后续任务填充 app-server 性能检测结果。

## Projection state and generation

状态：已有 issue 仍成立。

结论：`thread_generations` 的无界保留风险仍存在，且应作为已知 issue `docs/superpowers/issues/2026-05-30-02-thread-generations-unbounded.md` 继续追踪，不作为新发现重复报告。相对本地 `rust-v0.142.0`，该 tag 下不存在当前 `codex-rs/app-server/src/thread_projection.rs`，也未命中 `thread_generations` / `ProjectionGeneration`，因此这是当前 `dev` 相对 `rust-v0.142.0` 新增 projection 状态路径中的风险。

规模变量：`thread_generations` 的 retained size 取决于被 projection 捕获 generation 或 materialize projection entry 的 distinct `ThreadId` 数量。Structural event 和 delta 路径都会 `capture_generation` 并 materialize `thread_entry_mut`；`remove_thread` / `invalidate_thread_projection` 会 bump generation 以保护 stale attach，但没有 generation 回收策略。单次 HashMap 操作通常是 O(1)，长期内存上界随历史 thread 数线性增长。

关键证据：

- `docs/superpowers/issues/2026-05-30-02-thread-generations-unbounded.md:9`-`:17` 已记录 `thread_generations` 只增不减，且 remove 前 bump generation 是为 stale-generation 检测服务。
- `codex-rs/app-server/src/thread_projection.rs:103`-`:106` 当前仍有 `threads`、`connection_index`、`thread_generations` 三个状态表。
- `codex-rs/app-server/src/thread_projection.rs:194`-`:218` `connection_index` 和 `threads` 有 remove 路径；`remove_thread` 先 bump generation，再删除 thread entry。
- `codex-rs/app-server/src/thread_projection.rs:248`-`:250`、`:277`-`:279` projection event / delta 都会捕获 generation 并 materialize thread entry。
- `codex-rs/app-server/src/thread_projection.rs:380`-`:400` `capture_generation` / `bump_generation_if_known` 只插入或更新 `thread_generations`。
- `codex-rs/app-server/src/thread_projection.rs:407`-`:440` invalidation 清 subscriber/head/connection index，但继续保留 bumped generation。
- `codex-rs/app-server/src/thread_projection.rs:1001`-`:1017` 测试断言 remove uncaptured entry 后 thread entry 已无，但 generation 仍存在。

已排除项：

- `threads` 和 `connection_index` 未见与该 issue 等价的无回收证据；删除 thread、断开 connection、invalidate projection 都有对应清理路径。
- unknown thread 的 remove / invalidate / conditional attach / non-projected notification 路径未创建 generation，已有测试覆盖。
- 没有证据支持“已修复”或“已过期”；保留 generation 是当前 stale attach 语义的一部分。

风险/下一步：不能直接在 `remove_thread` 删除 generation，否则可能破坏 in-flight attach 的 stale-generation 防护。后续修复应先设计安全 retention 窗口和回收触发，再补回归覆盖：stale generation attach 仍失败，超过安全窗口的 removed thread generation 可回收。

## Projection attach path

状态：已修复但需回归覆盖。

结论：历史 projection atomicity review 中 attach 相关问题在当前 issue 文档里均已标注已修复；本轮核对当前 attach 准备、listener command、attach response handling、lease/connection cleanup 后，没有发现新的持久无界增长或明显生命周期风险。相对本地 `rust-v0.142.0`，`request_processors/thread_projection.rs` 和 `thread_projection_runtime.rs` 是新增文件，`thread_state.rs` 有修改，因此该路径归因到当前 `dev` 新增的 projection attach/lease 机制。

规模变量：live connections、in-flight `(thread, connection)` projection attach leases、per-thread listener command backlog、已完成 attach 后的 projection subscribers、以及 attach snapshot 中的 turns/items。租约和反向索引维护主要是 HashMap/HashSet 常数成本；snapshot 读取成本随 snapshot 内容规模增长，但本轮没有证据表明 lease/cleanup 路径引入额外持久无界状态。

关键证据：

- `docs/superpowers/issues/2026-05-19-projection-atomicity-review.md:7`-`:18` 已将 stale attach、check-only attach 准备路径、delivery generation 三个历史 finding 标注为已修复。
- `codex-rs/app-server/src/request_processors/thread_projection.rs:99`-`:129` attach RPC 捕获 projection generation，enqueue 失败时释放 projection attach lease。
- `codex-rs/app-server/src/request_processors/thread_projection.rs:132`-`:181` `prepare_projection_attach` 创建 projection-only lease，listener 启动失败会释放 lease。
- `codex-rs/app-server/src/request_processors/thread_projection.rs:282`-`:319` attach response 通过 per-thread listener command 排序，并等待 oneshot completion。
- `codex-rs/app-server/src/thread_projection_runtime.rs:76`-`:185` listener handling 在 closing thread、stale generation、snapshot error、closed connection、成功 attach 后 closed connection 等路径释放 lease 或 detach。
- `codex-rs/app-server/src/thread_state.rs:500`-`:533` lease 使用独立 `projection_attach_leases` 与 `projection_attach_thread_ids_by_connection`。
- `codex-rs/app-server/src/thread_state.rs:787`-`:826` begin/release lease 维护 connection -> thread 反向索引。
- `codex-rs/app-server/src/thread_state.rs:848`-`:881` `remove_connection` 同时清 ordinary subscription 和 projection attach lease，并 dedupe cleanup thread ids。
- `codex-rs/app-server/src/thread_state.rs:258`-`:493`、`codex-rs/app-server/src/thread_projection_runtime.rs:700`-`:855` 现有测试覆盖 lease 不订阅、live connection 要求、connection/thread cleanup、snapshot interleaving 与 late cleanup 等边界。

已排除项：

- 不把历史已修复 issue 重报为新问题。
- 未发现 check-only attach 准备路径仍会留下无反向索引 TSM entry。
- 未发现 projection attach lease 会更新 ordinary subscriber fanout 或 has-connections watcher。
- 未发现成功 attach 后 connection close 必然留下 projection subscriber。

风险/下一步：本轮按要求未运行测试，因此结论依赖只读代码和现有测试入口。后续回归应优先运行 attach 生命周期相关测试；如进入性能测量，再单独测大量并发 attach 对 listener command backlog 与 snapshot read latency 的影响。

## Listener event and cursor cost

状态：已过期。

结论：旧 issue `docs/superpowers/issues/2026-06-01-01-projection-eager-history-cursor.md` 中的 eager history cursor 风险在当前指定入口已过期。`ProjectionHistoryCursor` / `projection_history_cursor_for_listener_start` / `history_cursor` 未出现在当前 `thread_lifecycle.rs` 或 `thread_processor.rs`，listener 启动没有为 projection cursor 读取完整 history，event loop 中也未见每个 event 推进 projection cursor。当前仍有 projection subscriber watcher 进入普通 listener 生命周期；它是当前 `dev` 相对本地 `rust-v0.142.0` 新增的常数级 watcher 成本，不是旧 issue 描述的 history-size 或 per-event cursor 成本。

规模变量：live listeners 决定 projection subscriber watcher receiver 数量；projection subscriber 状态变化决定 watcher wake/sync 次数；ordinary thread events 仍驱动既有 event loop；projection attach commands 只驱动 attach response command 分支；history items 不参与当前 listener 启动 watcher 成本。复杂度上，单个 listener 的新增 watcher 是 O(1) 状态和 O(1) select 分支，整体随 live listener 数线性增长；本轮未发现随 history items、event count 或 projection subscriber history 无界增长的 cursor 成本。

关键证据：

- `docs/superpowers/issues/2026-06-01-01-projection-eager-history-cursor.md:9`-`:31` 旧 issue 指向 listener 启动前完整 history load，以及事件循环中无条件维护 projection cursor。
- `codex-rs/app-server/src/request_processors/thread_lifecycle.rs:18`-`:24` 当前 `UnloadingState` 包含 `ProjectionSubscriberWatch`，没有 cursor/history 字段。
- `codex-rs/app-server/src/request_processors/thread_lifecycle.rs:33`-`:45` listener 启动订阅 `thread_projection_manager().subscribe_to_has_subscribers(thread_id)` 并创建 watcher。
- `codex-rs/app-server/src/request_processors/thread_lifecycle.rs:65`-`:79` unload target 同时等待 ordinary subscribers、projection subscribers 和 active status。
- `codex-rs/app-server/src/request_processors/thread_lifecycle.rs:84`-`:100`、`:125`-`:145` sync/wait 会同步并等待 projection subscriber watcher。
- `codex-rs/app-server/src/request_processors/thread_lifecycle.rs:247`-`:257` `ensure_listener_task_running` 初始化 `UnloadingState`，没有旧 cursor 初始化调用。
- `codex-rs/app-server/src/request_processors/thread_lifecycle.rs:329`-`:379` event branch 未见 projection cursor 或 projection manager 调用；`event.clone()` 属于既有 event handling 形态。
- `codex-rs/app-server/src/request_processors/thread_lifecycle.rs:488`-`:572` projection attach response 位于 listener command 分支，不是每个 event 的默认成本。
- `codex-rs/app-server/src/request_processors/thread_processor.rs:1205`-`:1222` thread start auto-attaches ordinary listener；`:2699`-`:2710` cold resume 也 auto-attaches listener，所以 watcher 常数成本会进入旧 start/resume listener 生命周期。
- `codex-rs/app-server/src/request_processors/thread_processor.rs:770`-`:781` 和 `codex-rs/app-server/src/request_processors/thread_lifecycle.rs:443`-`:451` teardown/unload 会 remove thread projection，当前指定入口未见 watcher 持久无界保留。
- 本地 `rust-v0.142.0` 的 `thread_lifecycle.rs:18`-`:24`、`:54`-`:61`、`:87`-`:118` 没有 `ProjectionSubscriberWatch`、projection subscriber unload target 或 watcher wait 分支，因此该 watcher 成本归因到当前 `dev` 相对 `rust-v0.142.0` 的 projection subscriber-aware unload 改动。

已排除项：

- 旧 issue 的完整 history load / eager cursor 初始化仍存在于指定入口。
- event loop 在指定入口中每个事件都推进 projection cursor。
- `SendThreadProjectionAttachResponse` listener command 被算作所有事件默认成本。
- `event.clone()` 归因到当前 projection cursor 风险；本地 `rust-v0.142.0` 已有该形态。

风险/下一步：普通旧 start/resume listener 路径即使没有 projection subscriber，也会承担 projection subscriber watcher 的常数级状态和 wake 分支，并且卸载延迟语义现在会等待 projection subscribers。当前证据不足以把它标成性能问题；后续回归应验证无 projection subscriber 时不会触发 history load 或 per-event projection work，性能测量可单独覆盖大量 live listener 下 watcher 常数因子。

## Fanout and backpressure

状态：已修复但需回归覆盖。

结论：fanout/backpressure 的核心 silent invalidation 问题已修复：queue full 后会 invalidate 当前 thread projection，并向被清理的 projection subscribers 发送 `thread/projection/closed`，`reason` 为 `backpressure`。这对应已知 issue `docs/superpowers/issues/2026-05-30-01-projection-fanout-silent-invalidation.md` 的状态更新，不是新发现。覆盖层面仍需回归：`docs/superpowers/issues/2026-05-30-05-projection-test-coverage-gaps.md` 记录的端到端覆盖缺口在本轮指定范围内没有被完全关闭；当前能看到 fanout 模块级和 outgoing sender 级测试，但没有证据证明真实 app-server v2 端到端慢客户端链路已覆盖。

规模变量：events/messages 决定 fanout enqueue 次数；active threads 决定 worker/queue 数量；queue depth 固定为 32 jobs/thread；subscribers/connections 决定每个 job 的 `deliveries` 数量和 closed notification 数量；共享 outgoing channel capacity 决定 projection worker 或 closed-notification task 的等待时间。普通 enqueue 是 bounded queue 的 O(1) `try_send`；worker 对每个 job 的成本随 deliveries 线性增长；queue full invalidation 和 closed notification 发送随被清理 subscribers 线性增长；未见 per-thread job queue 无界增长。

关键证据：

- `docs/superpowers/issues/2026-05-30-01-projection-fanout-silent-invalidation.md:9`-`:19` 记录旧问题是 queue full invalidate 后无客户端信号；`:30`-`:34` 已标注为已修复，并说明 closed reason 为 `backpressure`。
- `docs/superpowers/issues/2026-05-30-05-projection-test-coverage-gaps.md:9`-`:17` 记录 detach、queue full/backpressure、事件 payload 的集成层覆盖缺口；`:23`-`:27` 仍指出 per-thread listener lifecycle 和多订阅者 fanout 只单测覆盖。
- `codex-rs/app-server/src/projection_fanout.rs:20`、`:71`-`:83` 定义每线程 fanout queue capacity 为 32。
- `codex-rs/app-server/src/projection_fanout.rs:117`-`:147` `enqueue` 使用 `try_send`；queue full 时 invalidate projection、取消 worker、移除 handle，并触发 closed notification。
- `codex-rs/app-server/src/projection_fanout.rs:157`-`:181` 每个 active thread 懒创建一个 worker 和 bounded `mpsc::channel(capacity)`。
- `codex-rs/app-server/src/projection_fanout.rs:208`-`:239` worker 串行消费 thread jobs；`:242`-`:282` projection delivery 等 outgoing capacity 时可取消，并在发送前检查 generation。
- `codex-rs/app-server/src/projection_fanout.rs:285`-`:315` closed(backpressure) 通知在 spawned task 中逐 subscriber 发送，因此 queue-full handling 不等待 outgoing capacity。
- `codex-rs/app-server/src/outgoing_message.rs:163`-`:177` thread-scoped ordinary notification 先发普通连接，再进入 projection fanout；`:575`-`:619` ordinary notification 直接写 outgoing channel，projection notification 经 facade enqueue。
- `codex-rs/app-server/src/projection_fanout.rs:572`-`:754` 覆盖 queue full closed(backpressure)、delta backpressure、queue-full handling 不等待 outgoing capacity。
- `codex-rs/app-server/src/outgoing_message.rs:1410`-`:1484` 覆盖 projection fanout backpressure 不阻塞 ordinary notification 返回路径。
- 本地 `git diff --name-status rust-v0.142.0 -- ...` 显示 `projection_fanout.rs` 和两个 2026-05-30 issue 文件是新增，`outgoing_message.rs` 有修改；因此该 fanout/backpressure 机制可归因到当前 `dev` 相对 `rust-v0.142.0` 的新增 projection delivery 路径。

已排除项：

- silent invalidation 仍无客户端信号。
- projection delivery 等 outgoing capacity 会阻塞 ordinary notification 返回。
- per-thread projection job queue 无界增长。
- stale delivery 在 invalidation/remove 后继续入队。
- 将已知端到端覆盖缺口重复标成新发现。

风险/下一步：closed notification 发送与普通/projection delivery 最终仍共享 outgoing channel；spawned task 能隔离 queue-full handling，但 outgoing channel 长期阻塞时 closed 通知本身可能延迟。本轮未运行测试，且只读范围内没有真实 app-server v2 端到端慢客户端覆盖证据。后续应补回归：慢/卡住 projection client 触发 queue full 后收到 `thread/projection/closed(reason=backpressure)`，ordinary notification 仍能送达/返回，重新 attach 能拿到新 snapshot baseline，并覆盖多 subscriber / 多 connection 场景。

## Transient delta and snapshot boundary

状态：已修复但需回归覆盖。

结论：`docs/superpowers/issues/2026-05-19-projection-hidden-race-review.md` 中 snapshot/head commit 边界已标为历史已修复；当前代码通过 listener 侧 `ProjectionSnapshotCut` 捕获 generation 与 head，再用该 cut 读取 attach snapshot。Transient delta 不推进 `head_commit_id`，也不生成 commit chain 或 snapshot cut entry；本轮未发现新的 transient-delta/snapshot-boundary 性能风险。相对本地 `rust-v0.142.0`，四个指定文件均为新增，因此该 projection boundary 路径归因到当前 `dev` 新增 app-server projection 机制。

规模变量：history items / snapshot entries 决定 attach snapshot 读取和响应体规模；structural projection events 决定 head commit 推进次数；transient deltas 决定 delta delivery 次数但不推进 head；subscribers 决定每个 event/delta 的 fanout 数量；snapshot cut 本身只保存 `generation` 和 `head_commit_id`，是常数大小。Capture cut 是 manager 锁内 generation check 加 head clone 的常数级路径；structural event 成本随 subscribers fanout，delta 成本随 subscribers fanout 和 delta payload clone；未见 cut 自身随 events/deltas/history 无界增长。

关键证据：

- `docs/superpowers/issues/2026-05-19-projection-hidden-race-review.md:7`-`:13` 标注 Finding 1 已修复，snapshot 与 `headCommitId` 来自同一个 listener 已处理 cut。
- `docs/superpowers/issues/2026-05-19-projection-hidden-race-review.md:54`-`:77` 记录历史 snapshot/head race；`:118`-`:124` 将 snapshot cut 作为已修复风险背景保留。
- `codex-rs/app-server/src/thread_projection_cut.rs:3`-`:7` `ProjectionSnapshotCut` 只有 generation 与 head，没有 history/event/delta 列表。
- `codex-rs/app-server/src/thread_projection.rs:243`-`:269` structural event 推进 head 并生成 commit delivery；`:272`-`:292` delta 只生成 delta delivery，不推进 head。
- `codex-rs/app-server/src/thread_projection.rs:295`-`:308` capture snapshot cut 检查 generation 并复制当前 head；`:338`-`:347` attach 返回当前 head。
- `codex-rs/app-server/src/thread_projection.rs:671`-`:693` 覆盖 delta 不推进 head；`:1121`-`:1150` 覆盖 cut 返回 generation 与当前 head。
- `codex-rs/app-server/src/thread_projection_runtime.rs:90`-`:110` attach handling 先捕获 cut，再用 `read_thread_projection_snapshot_at_cut_for_attach` 读取 snapshot；`:153`-`:193` attach 成功后发送包含 snapshot 的 attach response。
- `codex-rs/app-server/src/thread_projection_runtime.rs:677`-`:696` runtime 测试覆盖 snapshot 可包含 persisted-but-not-projected event 且 snapshot head 为 `None`。
- 本地 `git diff --name-status rust-v0.142.0 -- ...` 对四个指定文件均显示 `A`。

已排除项：

- 不把历史 snapshot/head race 重报为新发现；它是已修复但需回归覆盖。
- 排除 transient delta 推进 head 或扩展 commit chain。
- 排除 snapshot cut 持有 history item、event、delta 或 snapshot entry 集合。
- 排除 snapshot cut 自身随 history items/events/deltas 无界增长；snapshot 内容规模属于 attach baseline 成本。
- 不把 delta 路径 materialize generation/thread entry 作为本任务新发现；该风险已在 Task 2 的 `thread_generations` 已知 issue 中报告。

风险/下一步：本轮未运行测试，结论依赖只读代码和现有测试入口。后续回归应锁定 structural event 推进 head、delta 不推进 head、attach snapshot 使用 cut head、stale generation 不产生错误 attach；若展开性能测量，应单独记录 snapshot entries、subscribers、delta payload size 对 attach latency 与 delta fanout 常数因子的影响。

## Projection fixtures boundary

状态：排除。

结论：projection fixtures 与 `write_gui_projection_fixtures` 是 GUI projection JSON fixture 的离线生成边界，只作为输出背景和协议/客户端回归材料，不属于 app-server 运行时性能检测主面。相对本地 `rust-v0.142.0`，`thread_projection_fixtures.rs` 与 `src/bin/write_gui_projection_fixtures.rs` 是当前 `dev` 新增，`app-server/README.md` 有 projection 文档修改；这些改动可归因到当前 `dev` 的 projection 配套材料，但没有证据把它们归因为运行时性能风险。

规模变量：生成文件数 `G=9`，待删除 stale fixture 名称数 `S=3`，以及每个 fixture 的固定 JSON payload 大小。`write` 路径创建输出目录、删除固定 stale 名称、写入固定 fixture map，复杂度为 `O(G + S + payload_size)`；当前 fixture 构造只包含固定 thread、turn、item、event、delta 示例，不随真实 threads、subscribers、history items 或 runtime events 增长。generator 的成本只在显式运行 fixture 生成命令时发生，不进入 `thread/projection/*` 请求、event fanout、attach snapshot 或 listener 生命周期。

关键证据：

- `codex-rs/app-server/src/thread_projection_fixtures.rs:37`-`:53` 固定列出 9 个 generated fixture 名称和 3 个 stale fixture 名称。
- `codex-rs/app-server/src/thread_projection_fixtures.rs:55`-`:75` `write` 只创建输出目录、删除固定 stale 文件、写入生成出的固定 fixture map。
- `codex-rs/app-server/src/thread_projection_fixtures.rs:77`-`:122` `generate_fixture_files` 逐项插入固定 fixture，并用 `debug_assert_eq!` 对齐固定名称列表。
- `codex-rs/app-server/src/thread_projection_fixtures.rs:124`-`:360` fixture 内容由固定 ids、时间戳、thread/turn/item/event/delta 示例构造并序列化为 pretty JSON。
- `codex-rs/app-server/src/bin/write_gui_projection_fixtures.rs:19`-`:24` generator binary 解析 `--out-dir` 后调用 `write_gui_projection_fixtures`，是显式 CLI 入口。
- `codex-rs/app-server/src/bin/write_gui_projection_fixtures.rs:26`-`:30` 默认输出目录是 `../../codex-gui/src/features/projection/__fixtures__`，说明产物面向 GUI fixture。
- `codex-rs/app-server/README.md:484`-`:494` README 记录 projection attach/event/delta/backpressure 行为，是 API 背景说明，不是 generator runtime path。
- 本地 `git diff --name-status rust-v0.142.0 -- ...` 显示 `thread_projection_fixtures.rs` 和 `write_gui_projection_fixtures.rs` 为新增，README 为修改。

已排除项：

- 排除 `codex-gui/src/features/projection/__fixtures__/*.json` 这类 projection fixture 输出文件作为 Rust 运行时性能检测主面。
- 排除显式运行 `write_gui_projection_fixtures` 的一次性文件生成成本作为 app-server runtime projection 成本。
- 排除 README 中的 projection 示例 JSON 和 protocol fixture 生成说明作为性能热点证据。
- 未审查 fixture 输出文件内容，未运行 generator，未审查生成物差异。

风险/下一步：本轮按要求未运行 generator、测试、schema 生成、snapshot accept 或格式化；结论仅基于限定源文件和 README 的只读边界判断。后续若 fixture 数量被改成由真实 rollout/history 扫描生成，或 generator 被接入常规 app-server runtime path，应重新纳入性能检测；当前建议只把 fixture 输出作为排除项记录。
