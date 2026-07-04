# Rust 性能检测设计

## 背景

当前 `dev` 分支已经包含相对 `rust-v0.142.0` 的大量 Rust 改动。`rust-v0.142.0` 是本次检测的上游基线，只用于界定当前 fork 的增量，不评价上游实现。

本设计只定义后续性能检测应如何组织、拆分和汇总。它不执行性能检测，不给具体性能 verdict，不提出修复方案，也不替代后续 implementation plan。

前置 research 记录在：

- `docs/superpowers/research/2026-07-04-rust-performance-detection/current-findings.md`
- `docs/superpowers/research/2026-07-04-rust-performance-detection/execution-log.md`

## 目标

- 为当前 `dev` 相对 `rust-v0.142.0` 的 Rust 改动制定性能检测设计。
- 把检测范围拆成足够小的风险路径，避免一次性阅读或审查整个大模块。
- 明确已知 issue 在检测中的输入角色，避免重复报告旧问题。
- 明确后续执行必须由子代理承担细分检测，主线程只做协调、抽查和合并。
- 明确最终检测结果按输出文件拆分，而不是把所有结果塞进单个长报告。

## 性能定义

本轮“性能”指时间复杂度或空间复杂度意义上的性能风险，而不是常数开销优化。

核心目标是发现随规模变量增长而退化的结构性问题，例如：

- 从线性或近线性路径退化为平方级、指数级或其它不可接受复杂度。
- 热路径中重复全量扫描、嵌套遍历、重复重建大历史或重复 clone 大对象。
- 状态、缓存、队列、map、subscriber、connection、history cursor 等结构无界增长。
- projection-only 成本扩散到普通 subscribe / resume / listener 路径。
- 每个 event、history item、thread、subscriber、connection、message 或 queue item 都触发与另一个增长变量相乘的工作。

以下内容不是本轮主目标：

- 单次 URL 拼接。
- 一次性参数解析。
- 固定大小 JSON 序列化。
- 一次 host 启动中的固定步骤。
- 从 1 秒变成 2 秒这类没有规模变量放大的常数退化。

常数开销只有在它位于高频循环中，并且会随明确规模变量重复发生时，才可以作为复杂度风险的一部分记录。

## 非目标

- 不检测前端 GUI 性能。
- 不阅读或审查 `codex-gui/**`。
- 不执行 benchmark、测试、schema 生成、snapshot accept 或任何性能测量命令。
- 不修复问题。
- 不创建新 issue。
- 不评价 `rust-v0.142.0` 上游实现。
- 不把生成物、测试、快照作为人工性能审查主面。
- 不把常数级慢一点作为主要问题，除非它能被证明处在随规模增长重复触发的热路径中。

## 范围

纳入范围：

- `codex-rs/**` 中当前 `dev` 相对 `rust-v0.142.0` 的 Rust 相关改动。
- `codex-rs/app-server/**` 中 projection、fanout、listener、RPC、state/outgoing、GUI bridge、in-process 等 Rust 面。
- `codex-rs/app-server-protocol/src/**` 中 projection protocol、method registry、schema export source。
- `codex-rs/app-server-client/**` 中 GUI client 边界。
- `codex-rs/gui-host/**`。这是 Rust GUI host 面，负责本地 HTTP/WebSocket host、URL 生成、地址发现、资产代理/服务和 JSON-RPC 过滤桥。
- `codex-rs/ext/gui/**`。这是 agent tool 面，只覆盖 `launch_gui` 工具注册、参数解析、调用 host service、JSON 输出序列化。
- `codex-rs/tui/**` 中 `/gui` launch、app-server GUI launch 调用、URL 文本展示、projection 通知路由/忽略边界。
- `codex-rs/windows-sandbox-rs/**`、`codex-rs/cli/**`、`codex-rs/responses-api-proxy/**`、workspace 配置等次要 Rust 面，只作为单独确认项。

排除范围：

- `codex-gui/**`。
- React、浏览器渲染、Vite、CSS、DOM、前端 UI 性能。
- `app-server-protocol/schema/**` 生成物逐字审查。
- TUI 通用渲染性能。
- snapshot 视觉差异审查，除非后续计划明确把它作为边界证据。

## 基线与比较原则

- 基线固定为本地 `rust-v0.142.0`。
- 检测对象固定为当前 `dev` 相对该基线的增量。
- 基线仅用于界定增量范围，不评价上游实现好坏。
- 文件级统计、路径分布和已知 issue 只能用于拆分检测计划，不能直接作为性能结论。
- 生成物、测试、快照默认不是人工性能审查主面；它们可以作为 source 契约的输出背景或验证入口。

## 增量归因规则

本轮只检测当前 `dev` 改动造成的复杂度影响。

上游 `rust-v0.142.0` 已经存在的性能问题，不管严重程度如何，都不是本轮检测对象。即使上游基线里存在平方级、指数级、无界增长或其它严重性能问题，只要当前 `dev` 增量没有引入、放大、暴露或改变该问题，就必须排除。

一个问题只有满足以下至少一项，才可以进入本轮报告：

- 当前 `dev` 新增了该复杂度风险。
- 当前 `dev` 把基线已有路径接入新的热路径，使风险变成当前改动的影响。
- 当前 `dev` 扩大了规模变量，例如让原本只随 one thread 增长的成本随 threads 或 subscribers 增长。
- 当前 `dev` 改变了触发频率，例如把一次性成本放进 per-event、per-message、per-subscriber 或 per-connection 路径。
- 当前 `dev` 引入了新的无界 retained state、queue、cache、map 或 replay/snapshot 重建边界。

以下情况不得作为本轮 finding：

- 基线已有问题，当前 `dev` 没有改变它。
- 只是在阅读当前代码时发现的上游旧问题。
- 严重但无法归因到当前 `dev` 增量的问题。
- 只有常数级变化，且没有规模变量放大的问题。

当归因证据不足时，输出应标记为 `证据不足`，并说明需要哪类 diff 或调用链证据；不得直接写成已确认风险。

## 已知 Issue 输入规则

`docs/superpowers/issues/**` 是已知问题输入集。后续检测必须先索引相关 issue，再判断当前切片与 issue 的关系。

每个检测切片必须声明：

- 关联的已知 issue；或
- 明确声明无关联 issue。

检测输出必须区分：

- `已有 issue 仍成立`
- `已修复但需回归覆盖`
- `已过期`
- `新发现`
- `证据不足`

禁止把已知 issue 换个说法重复报告为新问题。

本轮 Rust 性能检测相关的已知 issue 输入包括：

- `docs/superpowers/issues/2026-05-30-02-thread-generations-unbounded.md`
- `docs/superpowers/issues/2026-06-01-01-projection-eager-history-cursor.md`
- `docs/superpowers/issues/2026-05-30-01-projection-fanout-silent-invalidation.md`
- `docs/superpowers/issues/2026-05-30-05-projection-test-coverage-gaps.md`
- `docs/superpowers/issues/2026-05-19-projection-atomicity-review.md`
- `docs/superpowers/issues/2026-05-19-projection-hidden-race-review.md`

Rust 非性能风险可以进入总体风险索引，但不进入性能检测主线：

- `docs/superpowers/issues/2026-05-30-06-export-annotation-last-writer-wins.md`
- `docs/superpowers/issues/2026-05-30-04-non-npm-update-channels-upstream.md`

前端 GUI issue 只作为排除边界参考，不进入 Rust 性能检测任务。

## 切片设计原则

检测切片以风险路径为主轴，文件路径为辅助。

每个切片必须满足：

- 只覆盖一个风险路径。
- 明确该切片的规模变量，例如 history items、events、threads、subscribers、connections、messages、queue depth。
- 明确该切片关注的时间复杂度或空间复杂度风险。
- 明确该风险是否可归因到当前 `dev` 增量。
- 绑定少量入口文件。
- 明确关联 issue 或声明无关联 issue。
- 明确允许证据类型。
- 明确禁止事项。
- 明确停止条件。
- 能由一个子代理独立完成。

禁止的切片形态：

- “检查整个 app-server”。
- “阅读整个 projection”。
- “审查所有 GUI 相关代码”。
- “跑所有测试看看性能”。
- “对比上游实现优劣”。
- “列举所有常数开销小细节”。

## 初始风险路径地图

### Projection

projection 不作为一个大块检测，先拆为：

- 状态/代际表生命周期：`thread_generations`、`threads`、`connection_index`。
- attach 路径：`prepare_projection_attach`、listener command、`handle_projection_attach_response`。
- listener 事件路径：普通通知发送与 projection enqueue 的顺序边界。
- fanout/backpressure：bounded queue、worker、`closed(backpressure)` 通知。
- transient delta：`thread/projection/delta` 不推进 commit head，但走同一 fanout。
- 集成覆盖/可观测输入：只定位现有覆盖点和缺口，不新增测试。

### App-server 辅助面

- protocol source：`app-server-protocol/src/protocol/v2/thread_projection.rs`、`common.rs`、`mod.rs`、`export.rs`。
- fixture 边界：`thread_projection_fixtures.rs`、`write_gui_projection_fixtures.rs`。
- RPC 入口：`request_processors/thread_projection.rs`、`request_processors.rs`、`thread_lifecycle.rs`、`thread_processor.rs` 的小触点。
- state/outgoing 触点：`thread_state.rs`、`outgoing_message.rs`、`message_processor.rs`。
- in-process：`in_process.rs`、`in_process/gui.rs`、`in_process_extra.rs`。

### Rust GUI/TUI

前端 GUI 排除，但 Rust GUI/TUI 边界纳入：

- `tui-gui-launch-boundary`：只看 `/gui` 到 `launch_gui_for_thread` 和 URL 输出。
- `tui-projection-routing-boundary`：只确认 projection 通知不进入 TUI 展示热路径。
- `gui-host-start-url-boundary`：只看 host 启动、地址发现、URL 生成。
- `gui-host-ws-bridge-boundary`：只看认证、allowlist、mpsc channel、双向 pump。
- `gui-host-assets-boundary`：只看 dev proxy / prod asset serve 的 Rust host 成本边界，不看前端资源自身。
- `ext-gui-tool-boundary`：只看 `launch_gui` 工具注册、参数解析、service 调用和 JSON 输出。

### 次要 Rust 面

以下内容不进入第一优先级性能主线，但后续计划中应单独确认是否为无关噪声：

- updates / doctor。
- windows sandbox env。
- responses proxy npm。
- nextest config。
- workspace Cargo 配置和 lockfile。

## 子代理执行原则

真正执行性能分析时必须使用子代理。主线程不直接展开大范围代码分析。

主线程职责：

- 拆分任务。
- 明确每个子代理的范围、禁止事项和输出格式。
- 抽查关键证据。
- 合并结论。
- 更新 research 和最终报告。

子代理职责：

- 只处理一个微切片。
- 不跨范围扩张。
- 不修复。
- 不运行未授权命令。
- 不访问 git remote。
- 不把已知 issue 重报为新问题。
- 必须说明本切片的规模变量。
- 必须说明风险是复杂度风险、无界增长风险、还是常数级成本。
- 必须说明风险是否由当前 `dev` 增量引入、放大、暴露或改变。
- 对基线已有且当前 `dev` 未改变的问题必须排除，即使问题本身很严重。
- 对常数级成本默认降级或排除，不作为主要 finding。

子代理固定输出五段式：

```md
## 结论

## 关键证据路径/行号

## 已排除项

## 风险

## 下一阶段建议
```

如后续进入真实测量，可在 `关键证据路径/行号` 下增加 `命令输出摘要`，但不得粘贴长日志。

## 证据与命令边界

证据分级：

- 只读源码证据：路径、行号、调用入口、状态 owner、队列边界、锁/await 边界。
- 只读文档证据：research、issue、AGENTS、justfile、Cargo 配置。
- 窄测试证据：`just test -p <crate> <test-filter>`。
- 启动验证：`just bench-smoke`，只验证 benchmark 能启动，不代表性能结论。
- 真实测量：`just bench` 或 `cargo bench ...`。
- 写入型验证：schema 生成、snapshot accept。

复杂度风险的主证据应来自规模变量、循环/遍历结构、状态增长边界、fanout 放大关系、replay/snapshot 重建边界和热路径调用频率。benchmark 只能作为辅助观察，不能替代复杂度判断。

可以写入计划、但执行前仍需遵守阶段门禁的命令形态：

- `just test -p <crate> <test-filter>`
- `just bench-smoke`
- `cargo insta pending-snapshots -p codex-tui`
- `cargo insta show -p codex-tui path/to/file.snap.new`

需要单独授权的命令形态：

- `just test`
- `just test -p <crate>` 这类 crate-wide 测试。
- `just bench`
- `cargo bench ...`
- `just write-app-server-schema`
- `just write-app-server-schema --experimental`
- `cargo insta accept -p codex-tui`
- `cargo install ...`
- CI archive / shard 形态的 `cargo nextest archive/run ...`

测试和 benchmark 即使不改 tracked source，也会写 `target/` 产物。snapshot test 可能生成 `.snap.new`。schema 和 snapshot accept 会修改 tracked fixtures/snapshots。计划文档必须把这些副作用写清楚。

## 最终输出文件划分

最终性能检测汇总报告应按输出文件拆分，而不是打印一个包含全部细节的长报告。

建议目录：

```text
docs/superpowers/reports/2026-07-04-rust-performance-detection/
  00-summary.md
  01-app-server.md
  02-app-server-protocol.md
  03-gui-host.md
  04-ext-gui.md
  05-tui-gui-boundary.md
  06-app-server-client.md
  07-secondary-rust-surfaces.md
  08-excluded-files.md
```

文件职责：

- `00-summary.md`：全局结论和索引。
- `01-app-server.md`：`app-server` 相关检测结果。
- `02-app-server-protocol.md`：`app-server-protocol` 相关检测结果。
- `03-gui-host.md`：`gui-host` 相关检测结果。
- `04-ext-gui.md`：`ext/gui` 相关检测结果。
- `05-tui-gui-boundary.md`：TUI 中 `/gui` launch 与 projection routing 边界结果。
- `06-app-server-client.md`：`app-server-client` 相关检测结果。
- `07-secondary-rust-surfaces.md`：`windows-sandbox-rs`、`cli`、`responses-api-proxy`、workspace config 等次要 Rust 面。
- `08-excluded-files.md`：生成物、测试、快照、前端 GUI、明确排除项。

本设计只定义最终输出文件划分，不规定每个输出文件的内部模板。内部模板应在后续计划阶段单独确定。

## 进入计划阶段的门禁

只有本设计文档被用户确认后，才能开始编写计划文档。

计划文档必须：

- 使用单独文件。
- 基于本设计拆分任务。
- 每个任务足够小。
- 明确子代理输入。
- 明确允许证据和禁止事项。
- 明确是否会运行命令。
- 明确是否会产生本地副作用。

只有计划文档被用户确认后，才能开始执行性能检测。
