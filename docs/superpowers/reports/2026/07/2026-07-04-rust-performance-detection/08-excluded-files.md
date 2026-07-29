# Excluded Files

后续任务填充 excluded files 说明。

## Projection fixture outputs

状态：排除。

结论：projection fixture 输出文件和一次性生成物只作为 GUI projection 客户端/协议回归背景，不纳入 Rust app-server 运行时性能检测主面。

排除类别：

- `codex-gui/src/features/projection/__fixtures__/*.json`：`write_gui_projection_fixtures` 的默认输出目录下的 GUI projection JSON fixtures。
- `attach-baseline.json`、`attach-replacement.json`、`closed-backpressure.json`、`event-*.json`：当前 generator 固定生成的 projection attach/event/delta/backpressure 示例产物类别。
- `event-large-sequence.json`、`event-projection-reset.json`、`event-thread-metadata-updated-null.json`：当前 generator 明确视为 stale 并会删除的历史 fixture 名称。

排除理由：这些文件是显式 generator 产物，不是 app-server 请求处理、listener、fanout、attach snapshot 或 projection delta 的运行时状态；生成复杂度随固定 fixture 名称和固定 payload 大小变化，不随真实 runtime history/subscriber/event 规模增长。

风险/下一步：本轮未读取或审查实际输出文件，也未运行 generator。若后续任务需要验证客户端 fixture 回归，应作为 GUI/protocol fixture 任务单独处理。

## GUI host static assets

状态：排除。

结论：GUI host 的 embedded error page HTML/CSS 属于前端/static asset 内容，不纳入 Rust performance detection 的前端资源自身性能分析；Task 11 只把它们作为 Rust host 组装 error response 时的固定字节输入记录。

排除类别：

- `codex-rs/gui-host/src/embedded_pages/dev_proxy_error.html`：dev proxy fallback 页面模板；只保留 Rust `include_str!` 和 placeholder replacement 的 host-side 成本。
- `codex-rs/gui-host/src/embedded_pages/assets/style.css`：fallback 页面嵌入 CSS；只保留编译期嵌入和 error page 拼接字节规模，不分析 CSS selector、layout、paint 或浏览器端性能。
- prod dist / Vite served frontend assets：不在本报告切片内逐项分析；只有 `gui-host` 的 `ServeDir` 配置、prod index 读取和 dev proxy buffering 属于 Rust host 边界。

排除理由：这些文件和资源的主体成本属于前端或静态内容本身；当前任务只检测 Rust host 是否引入无界增长、重复读取、buffering 或 per-request 常数放大。静态 HTML/CSS 当前是固定 6486 bytes 的模板输入，不构成随 runtime history、connection、subscriber 或 projection event 增长的 Rust 状态。

风险/下一步：若后续关注 GUI bundle 大小、CSS/rendering 或浏览器性能，应转入 frontend/static asset 专项；若继续 Rust-only 检测，只追踪 host-side bytes、request count、proxy buffering 和 prod index read frequency。

## Task 16 secondary excluded surfaces

状态：排除。

## 结论

Task 16 下列文件/改动不纳入 Rust performance detection 主线，作为噪声或已由前序任务覆盖的背景排除：

| Surface | 状态 | 排除理由 | 规模变量 | 复杂度/成本 | 是否归因到当前 dev 相对 `rust-v0.142.0` |
| --- | --- | --- | --- | --- | --- |
| `codex-rs/windows-sandbox-rs/src/env.rs` | 排除 | 新增 `SystemRoot`/`WINDIR` 继承是 Windows sandbox spawn env 正确性补丁，不涉及 projection/listener/fanout 主线 | env map key 数、父进程 env lookup 数 | `existing_env_key` 线性扫 env keys；`parent_system_root` 最多读两个 env vars；常数级路径插入 | 是，但不是性能主线 |
| `codex-rs/windows-sandbox-rs/src/elevated_impl.rs` | 排除 | 只在 elevated capture env prep 中调用 `inherit_system_root_env` | 每次 sandbox spawn 一次 env prep | 常数调用；后续 capture loop 原有 stdout/stderr 累积成本不属于本 diff | 是，但不是性能主线 |
| `codex-rs/windows-sandbox-rs/src/spawn_prep.rs` | 排除 | 只在 legacy/elevated spawn prep 中调用 `inherit_system_root_env` | 每次 Windows sandbox spawn 一次 env prep | 常数调用；ACL/path root 复杂度沿用原逻辑，本 diff 未扩大阶数 | 是，但不是性能主线 |
| `codex-rs/responses-api-proxy/npm/package.json` | 排除 | npm package 名称、repository、publishConfig 元数据 | package metadata 字段数 | 发布/安装元数据常数成本；不是 Rust runtime | 是，但不是性能主线 |
| `codex-rs/responses-api-proxy/npm/README.md` | 排除 | README package scope 与链接替换 | 文档长度 | 文档常数成本；不是 runtime | 是，但不是性能主线 |
| `codex-rs/Cargo.lock` | 排除 | lockfile 记录 `codex-gui-agent-extension`、`codex-gui-host`、`tower-http` transitive dependency 图；对应 runtime 风险已在 GUI host tasks 检测 | dependency entry 数 | 构建解析/依赖图背景，不代表新增执行路径本身 | 是，但由前序 GUI host/app-server tasks 覆盖 |
| `codex-rs/Cargo.toml` workspace members/dependencies/version | 排除 | `ext/gui`、`gui-host` member 与 dependency 声明已由前序 GUI host/app-server tasks 覆盖；workspace version `0.0.0` 是 release metadata | workspace member 数、dependency 条目数 | Cargo metadata 常数/构建图成本；不是运行时主线 | 是，但本任务不重复归因 |
| `codex-rs/cli/src/doctor.rs` fork string/package root替换 | 排除 | `@openai/codex` 到 `@jiangshengdev/codex` 的字符串与路径拼接替换，不改变复杂度阶数 | PATH entries 数、npm root output 行数 | 与旧逻辑相同；只改常数字符串 | 是，但不是性能主线 |
| `codex-rs/cli/src/doctor.rs` 的 rollout stats 扫描 | 排除 | baseline-only：扫描逻辑不是当前 diff 引入，当前 `dev` 相对 `rust-v0.142.0` 未引入、放大、暴露或改变该路径 | `CODEX_HOME/sessions` 与 `CODEX_HOME/archived_sessions` 下目录/文件数，匹配 `.jsonl` rollout 文件数 | 递归 `read_dir` + metadata，`O(dirs + files)`；属于基线已有本地状态扫描成本 | 否。限定 diff 只改 fork 包名路径/提示，未改该扫描逻辑 |
| `codex-rs/cli/src/doctor/updates.rs` fork URL/cache路径替换 | 排除 | GitHub release URL、package action label、cache dir 从 root version file 切到 `cdx/version.json`；latest probe 的 bounded 行为不变 | 一次 cache file read、一次 latest-version URL probe | cache read 常数文件；curl probe 已有 `--max-time 5` | 是，但不是性能主线 |

## 关键证据路径/行号

- `codex-rs/windows-sandbox-rs/src/env.rs:34`：`existing_env_key` 在 env map keys 中查找 case-insensitive key。
- `codex-rs/windows-sandbox-rs/src/env.rs:41`：`parent_system_root` 最多读取 `SystemRoot` 与 `WINDIR`。
- `codex-rs/windows-sandbox-rs/src/env.rs:49`：`inherit_system_root_env` 只插入或补齐 `SystemRoot`。
- `codex-rs/windows-sandbox-rs/src/elevated_impl.rs:133`：elevated capture env prep 调用 `normalize_null_device_env`。
- `codex-rs/windows-sandbox-rs/src/elevated_impl.rs:135`：同一路径新增 `inherit_system_root_env`。
- `codex-rs/windows-sandbox-rs/src/spawn_prep.rs:98`：common spawn prep 调用 env normalization。
- `codex-rs/windows-sandbox-rs/src/spawn_prep.rs:100`：common spawn prep 新增 `inherit_system_root_env`。
- `codex-rs/windows-sandbox-rs/src/spawn_prep.rs:363`：elevated spawn prep 调用 env normalization。
- `codex-rs/windows-sandbox-rs/src/spawn_prep.rs:365`：elevated spawn prep 新增 `inherit_system_root_env`。
- `codex-rs/responses-api-proxy/npm/package.json:2`：package name 是 `@jiangshengdev/codex-responses-api-proxy`。
- `codex-rs/responses-api-proxy/npm/package.json:16`：repository 元数据。
- `codex-rs/responses-api-proxy/npm/package.json:21`：`publishConfig.access = public`。
- `codex-rs/responses-api-proxy/npm/README.md:1`：README package name。
- `codex-rs/responses-api-proxy/npm/README.md:5`：README GitHub link。
- `codex-rs/Cargo.toml:51`：workspace member `ext/gui`。
- `codex-rs/Cargo.toml:63`：workspace member `gui-host`。
- `codex-rs/Cargo.toml:179`：workspace dependency `codex-gui-agent-extension`。
- `codex-rs/Cargo.toml:192`：workspace dependency `codex-gui-host`。
- `codex-rs/Cargo.lock:3127`：lockfile package `codex-gui-agent-extension`。
- `codex-rs/Cargo.lock:3734`：lockfile package `codex-responses-api-proxy` 依赖列表未新增 runtime 性能主线依赖。
- `codex-rs/cli/src/doctor.rs:831`：npm mismatch summary 使用 `@jiangshengdev/codex`。
- `codex-rs/cli/src/doctor.rs:1001`：npm package root 拼接 `@jiangshengdev/codex`。
- `codex-rs/cli/src/doctor.rs:2131`：`state_check` 调用 `rollout_stats_details`，但该调用链不是本次 diff 引入。
- `codex-rs/cli/src/doctor.rs:2191`：`rollout_stats_details` 扫描 `sessions` 与 `archived_sessions`，作为 baseline-only 排除项。
- `codex-rs/cli/src/doctor.rs:2223`：`collect_rollout_stats` 递归进入 `collect_rollout_stats_inner`。
- `codex-rs/cli/src/doctor/updates.rs:24`：version cache dir 是 `cdx`。
- `codex-rs/cli/src/doctor/updates.rs:26`：latest release URL 指向 `jiangshengdev/codex`。
- `codex-rs/cli/src/doctor/updates.rs:112`：version cache path 是 `codex_home/cdx/version.json`。
- `codex-rs/cli/src/doctor/updates.rs:180`：latest probe 仍是 `curl -fsSL --max-time 5`。

## 已排除项

- 不把 Windows sandbox env 继承计入 projection attach、listener event、fanout/backpressure 或 GUI host request path 性能主线。
- 不把 npm package metadata/README 链接替换计入 Rust runtime 性能。
- 不把 `Cargo.lock` 依赖图行数当作运行时无界增长证据；GUI host 相关运行时 surface 已由 Task 9-15 处理。
- 不把 fork package scope 字符串替换计入性能风险；`doctor` 外部命令仍在 `07-secondary-rust-surfaces.md` 中标为 `证据不足`，rollout scan 行为在本文件和 `07-secondary-rust-surfaces.md` 中作为 baseline-only 排除。

## 风险

- Windows sandbox env prep 仍会随 env map key 数线性查找一次；这不是当前性能主线，且本轮未测量 Windows spawn latency。
- Cargo workspace/lockfile 排除不代表 GUI host runtime 已无风险；其 runtime 边界按前序任务结论处理。
- README/package metadata 排除不覆盖发布流程正确性；本轮只判断性能检测范围。

## 下一阶段建议

- 若后续专查 Windows sandbox spawn latency，再以 sandbox task 单独读取 ACL、cap SID、deny-read state 和 runner IPC 路径；不要并入 app-server projection 性能主线。
- 若后续专查 package/distribution，单独检查 npm shim、vendor binary size 和 install/update flow；不要把 README/package metadata 混入 Rust runtime 检测。
- Cargo lockfile 只在依赖新增导致可执行路径或二进制体积风险时重新纳入；否则保留为构建图背景。

## Diff-wide excluded categories

状态：排除。

## 结论

基于 `git diff --name-only rust-v0.142.0 -- codex-rs` 的 path list，本 diff-wide 汇总下列类别不再进入 Rust performance detection 的逐文件分析：生成 schema/typescript 输出、测试文件、snapshot 文件、GUI frontend/static asset 边界、以及已经分配给 Task 2-16 其它 report 的 Rust 源码、配置、文档和 lockfile。它们在本报告中的统一状态为 `排除`，排除理由是：要么不是 runtime 性能源头，要么只是验证/生成产物，要么已由前序 report 按更窄 runtime surface 归因。

| 分类 | 状态 | 关键 path 例子 | 排除理由 | 后续归口 |
| --- | --- | --- | --- | --- |
| generated schema outputs | 排除 | `codex-rs/app-server-protocol/schema/json/ClientRequest.json`; `codex-rs/app-server-protocol/schema/json/v2/ThreadProjectionDeltaNotification.json`; `codex-rs/app-server-protocol/schema/typescript/v2/ThreadProjectionSnapshot.ts`; `codex-rs/app-server-protocol/schema/typescript/v2/index.ts` | 生成输出随协议源更新而变化；性能风险应归因到协议源/API shape，而不是重复分析生成文件字节差异 | Task 7 app-server protocol source |
| tests | 排除 | `codex-rs/app-server/src/extensions_gui_tests.rs`; `codex-rs/app-server/tests/suite/v2/thread_projection.rs`; `codex-rs/ext/gui/tests/gui_extension.rs`; `codex-rs/gui-host/tests/prod_serves_hashed_asset.rs`; `codex-rs/core/tests/suite/unified_exec.rs`; `codex-rs/tui/src/updates_cache_tests.rs` | 测试文件用于覆盖行为和回归，不代表生产 runtime hot path；本轮禁止运行测试，因此只作为覆盖线索保留 | 对应 runtime task 或后续测试覆盖专项 |
| snapshots | 排除 | `codex-rs/tui/src/snapshots/codex_tui__app__tests__gui_launch_url_message.snap`; `codex-rs/tui/src/chatwidget/snapshots/codex_tui__chatwidget__tests__update_popup.snap`; `codex-rs/tui/src/history_cell/snapshots/codex_tui__history_cell__tests__standalone_unix_update_available_history_cell_snapshot.snap` | snapshot 是 UI/text 输出基线，不是执行路径；不把 snapshot 字节差异当作 Rust 性能信号 | TUI UI 回归或 snapshot 专项 |
| frontend GUI exclusions | 排除 | `codex-rs/gui-host/src/embedded_pages/dev_proxy_error.html`; `codex-rs/gui-host/src/embedded_pages/assets/style.css` | HTML/CSS 内容主体属于 frontend/static asset 表现；Rust-only 检测只保留 host-side 嵌入、读取、代理和 response 边界 | Task 11 GUI host assets boundary |
| static assets | 排除 | `codex-rs/gui-host/src/embedded_pages/assets/style.css`; `codex-rs/gui-host/src/embedded_pages/dev_proxy_error.html` | 固定静态资源不是随 thread、projection event、subscriber、history 或 request fanout 增长的 Rust 状态；不单独作为 runtime 性能风险 | frontend/static asset 专项或 Task 11 |
| already assigned to app-server projection reports | 排除 | `codex-rs/app-server/src/thread_projection.rs`; `codex-rs/app-server/src/thread_projection_runtime.rs`; `codex-rs/app-server/src/projection_fanout.rs`; `codex-rs/app-server/src/request_processors/thread_projection.rs`; `codex-rs/app-server/src/message_processor.rs` | 已由 projection state/generation、attach、listener/cursor、fanout/backpressure、transient delta 等前序切片覆盖 | Task 2-6 |
| already assigned to protocol report | 排除 | `codex-rs/app-server-protocol/src/protocol/common.rs`; `codex-rs/app-server-protocol/src/protocol/v2/mod.rs`; `codex-rs/app-server-protocol/src/protocol/v2/thread_projection.rs`; `codex-rs/app-server-protocol/src/export.rs` | 协议源已作为 API shape 和 schema export 源头单独分析；本汇总不重复判断 | Task 7 |
| already assigned to fixture report | 排除 | `codex-rs/app-server/src/bin/write_gui_projection_fixtures.rs`; `codex-rs/app-server/src/thread_projection_fixtures.rs`; `codex-rs/app-server/src/thread_projection_fixtures_tests.rs` | fixture 生成/验证边界已单独排除或归因；不纳入 runtime 主线 | Task 8 |
| already assigned to GUI host reports | 排除 | `codex-rs/gui-host/src/host.rs`; `codex-rs/gui-host/src/ws.rs`; `codex-rs/gui-host/src/backend.rs`; `codex-rs/gui-host/src/assets.rs`; `codex-rs/gui-host/BUILD.bazel`; `codex-rs/gui-host/Cargo.toml` | GUI host 启动、URL、WebSocket bridge、asset serving 已由前序 GUI host 切片覆盖 | Task 9-11 |
| already assigned to ext GUI report | 排除 | `codex-rs/ext/gui/src/tool.rs`; `codex-rs/ext/gui/src/extension.rs`; `codex-rs/ext/gui/src/spec.rs`; `codex-rs/ext/gui/BUILD.bazel`; `codex-rs/ext/gui/Cargo.toml` | ext GUI tool/extension runtime 边界已单独分析 | Task 12 |
| already assigned to TUI reports | 排除 | `codex-rs/tui/src/app/gui.rs`; `codex-rs/tui/src/app/thread_routing.rs`; `codex-rs/tui/src/app_server_session.rs`; `codex-rs/tui/src/chatwidget/protocol.rs`; `codex-rs/tui/src/slash_command.rs` | TUI `/gui` launch 与 projection routing 已单独分析；snapshot/test 文件另按上方类别排除 | Task 13-14 |
| already assigned to app-server client report | 排除 | `codex-rs/app-server-client/src/gui.rs`; `codex-rs/app-server-client/src/lib.rs`; `codex-rs/app-server-client/Cargo.toml` | app-server client GUI boundary 已单独分析 | Task 15 |
| already assigned to secondary Rust surfaces report | 排除 | `codex-rs/windows-sandbox-rs/src/env.rs`; `codex-rs/windows-sandbox-rs/src/elevated_impl.rs`; `codex-rs/windows-sandbox-rs/src/spawn_prep.rs`; `codex-rs/cli/src/doctor.rs`; `codex-rs/cli/src/doctor/updates.rs`; `codex-rs/responses-api-proxy/npm/package.json`; `codex-rs/Cargo.lock`; `codex-rs/Cargo.toml` | 非 projection/GUI 主线、package metadata、lockfile/workspace metadata、doctor/update 边界已在 secondary surfaces 中处理 | Task 16 |

## 关键证据路径/行号

- `git diff --name-only rust-v0.142.0 -- codex-rs` 输出包含 `codex-rs/app-server-protocol/schema/json/**` 与 `codex-rs/app-server-protocol/schema/typescript/**`，作为 generated schema outputs 排除。
- 同一 path list 包含 `codex-rs/**/tests/**`、`*_tests.rs`、`codex-rs/tui/src/app/tests.rs`、`codex-rs/core/tests/suite/unified_exec.rs`，作为 tests 排除。
- 同一 path list 包含 `codex-rs/tui/src/**/snapshots/*.snap`，作为 snapshots 排除。
- 同一 path list 包含 `codex-rs/gui-host/src/embedded_pages/dev_proxy_error.html` 与 `codex-rs/gui-host/src/embedded_pages/assets/style.css`，作为 frontend GUI/static assets 排除。
- 同一 path list 中其余 Rust 源码、Cargo metadata、README、BUILD.bazel 和 npm metadata 已按 Task 2-16 的 report 边界分配；本节不重新打开源码或重复归因。

## 已排除项

- 排除所有 generated schema/json/typescript 输出；只保留协议源 report 的判断。
- 排除所有 tests 与 snapshots；它们只作为覆盖或 UI baseline 线索，不作为生产 runtime 性能证据。
- 排除 frontend GUI/static asset 文件本体；Rust-only 检测只关注 host-side serving、proxy、embedding 和 request 边界。
- 排除所有已分配给 Task 2-16 的文件，避免同一 diff surface 被多次归因。
- 排除对源文件内容的再次阅读；本任务只依据 path list 和文件类别完成 diff-wide 分类。

## 风险

- 仅凭 path list 分类无法发现测试文件中可能揭示的未覆盖 runtime 风险；该限制符合本任务“不读代码内容”的范围。
- generated schema 输出被排除不表示协议变更没有风险；协议源已归入 Task 7，后续应以协议源和 schema generation gate 处理。
- tests/snapshots 排除不表示回归覆盖充分；它们只是不作为性能检测对象。
- static assets 排除不覆盖浏览器端 bundle、CSS layout、paint 或 GUI frontend 性能。

## 下一阶段建议

- 若要复核排除分类，下一步只需重新运行同一个 path-list 命令并对照本表，不需要读取源码。
- 若后续要验证 schema 生成一致性、snapshot 变化或测试覆盖，应单独授权对应生成/测试/snapshot 工作流。
- 若后续发现某个已分配文件仍无 report 承接，应新增窄 report，而不是扩大本 diff-wide exclusion report。
