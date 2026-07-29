# App Server Client

后续任务填充 app-server-client 性能检测结果。

## GUI client boundary

状态：无明显风险

结论：`app-server-client` 的 GUI API 是薄边界。当前 dev 相对 `rust-v0.142.0` 新增 `gui.rs`，并在 `lib.rs` 增加导出、`ClientCommand::LaunchGui` 和 worker 分发；本层不解析 GUI host 状态、不维护 URL 集合、不遍历 transcript/event 流，也没有明显需要新增性能检测或可观测入口的位置。若需要观测 GUI host 启动耗时或复用行为，入口应放在下游 launch service / gui-host 范围，而不是这个 client facade。

规模变量：主要变量是 GUI launch 调用次数 `L`。每次调用在 client 层创建一个 `oneshot`、发送一个 bounded `mpsc` command，并由 worker 派生一次异步调用；本层单次成本为常数级，内存为常数级。command/event 队列容量来自 `channel_capacity.max(1)`，不是无界队列。返回 `GuiLaunchUrls.entries` 的大小由 `codex_gui_host` 生成，本任务未分析 gui-host。

关键证据：
- `codex-rs/app-server-client/src/gui.rs:67` 定义 `AppServerClientGuiExt` 作为 extension facade，说明此处只是为需要本地 GUI launch URL 的 surface 暴露统一入口。
- `codex-rs/app-server-client/src/gui.rs:78` 到 `codex-rs/app-server-client/src/gui.rs:102`：in-process 实现只创建 `oneshot`、发送 `ClientCommand::LaunchGui`、等待响应；没有循环、缓存或集合增长。
- `codex-rs/app-server-client/src/gui.rs:105` 到 `codex-rs/app-server-client/src/gui.rs:111`：remote 实现直接返回 `UnsupportedRemote`，没有额外传输或重试。
- `codex-rs/app-server-client/src/lib.rs:495` 到 `codex-rs/app-server-client/src/lib.rs:500`：command/event channel 使用 `channel_capacity.max(1)` 创建 bounded `mpsc`。
- `codex-rs/app-server-client/src/lib.rs:526` 到 `codex-rs/app-server-client/src/lib.rs:541`：worker 收到 `LaunchGui` 后 clone sender 并派生一次异步调用，把 service 结果映射回 `GuiLaunchError`。
- `codex-rs/app-server-client/src/lib.rs:1428` 到 `codex-rs/app-server-client/src/lib.rs:1457`：已有覆盖验证多线程 launch 复用同一 host origin；`codex-rs/app-server-client/src/lib.rs:2472` 到 `codex-rs/app-server-client/src/lib.rs:2485` 覆盖 GUI launch 后 shutdown 不等待 fallback timeout。
- 本地对比 `rust-v0.142.0`：`codex-rs/app-server-client/src/gui.rs` 为新增文件，`codex-rs/app-server-client/src/lib.rs` 修改；限定两文件 diff 统计为 375 行插入，其中 `gui.rs` 209 行、`lib.rs` 166 行。

已排除项：未分析 `gui-host`、TUI、前端 GUI、下游 launch service 内部行为；未运行测试、benchmark、schema 生成、snapshot accept、格式化或安装；未访问 git remote。

风险/下一步：当前边界无明显性能风险。唯一保留风险是如果未来把 GUI launch 暴露成高频自动调用，worker 每个已接收 launch command 都会派生一个异步任务，届时应在调用方或下游 service 增加并发/频率约束或观测；按当前手动 launch 语义不需要在 client facade 增加检测。
