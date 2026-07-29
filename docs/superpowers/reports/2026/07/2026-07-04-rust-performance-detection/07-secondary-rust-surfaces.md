# Secondary Rust Surfaces

## 结论

Task 16 只读检测的 secondary Rust surfaces 中，需要说明的项目如下。只有可归因到当前 `dev` 增量的风险或归因证据不足的观察项进入本轮主线；baseline-only 问题作为排除项记录。

| Surface | 状态 | 是否纳入主线 | 规模变量 | 复杂度/成本 | 是否归因到当前 dev 相对 `rust-v0.142.0` |
| --- | --- | --- | --- | --- | --- |
| `codex-rs/cli/src/doctor.rs` 的 rollout stats 扫描 | 排除 | 不纳入；baseline-only 排除 | `CODEX_HOME/sessions` 与 `CODEX_HOME/archived_sessions` 下目录/文件数，匹配 `.jsonl` rollout 文件数 | 递归 `read_dir` + metadata，`O(dirs + files)`；本地状态越大，`codex doctor` 状态检查越慢；无硬上限 | 否。限定 diff 只改 fork 包名路径/提示，未改该扫描逻辑 |
| `codex-rs/cli/src/doctor.rs` / `codex-rs/cli/src/doctor/updates.rs` 的 doctor 外部探测 | 证据不足 | 纳入 secondary 观察项，不作为当前性能回归结论 | provider endpoints 数、MCP server 数、一次 `npm root -g`、一次 latest-version probe | HTTP provider/MCP probe 有 3s timeout；updates latest probe 通过 `curl --max-time 5`；`npm root -g` 是常数次数但代码层没有显式 timeout | 部分否。当前 diff 主要替换 fork 包名、GitHub release URL 和 version cache 路径；未证明引入新的复杂度阶数 |
| `codex-rs/.config/nextest.toml` 与 `codex-rs/Cargo.toml` 的 CI/build profile 调整 | 无明显风险 | 纳入检测背景，不作为 runtime 性能风险 | test group 数、匹配到的 test cases 数、profile 选择 | 常数配置：限制 app-server zsh fork、本地 app-server、core tool parallelism、Windows-heavy tests 的并发/timeout；`ci-test-slim` 只改变构建 profile 的 debug/strip 设置 | 是。相对 `rust-v0.142.0` 新增/调整 nextest group、slow-timeout 和 `ci-test-slim` profile |

## 关键证据路径/行号

- `codex-rs/cli/src/doctor.rs:2131`：`state_check` 调用 `rollout_stats_details`，同时检查 active 与 archived rollout 文件。
- `codex-rs/cli/src/doctor.rs:2191`：`rollout_stats_details` 扫描 `sessions` 与 `archived_sessions`。
- `codex-rs/cli/src/doctor.rs:2223`：`collect_rollout_stats` 递归进入 `collect_rollout_stats_inner`。
- `codex-rs/cli/src/doctor.rs:2233`：每个目录执行 `std::fs::read_dir`。
- `codex-rs/cli/src/doctor.rs:2242`：遍历目录项。
- `codex-rs/cli/src/doctor.rs:2251`：每个目录项读取 metadata。
- `codex-rs/cli/src/doctor.rs:2258`：目录递归。
- `codex-rs/cli/src/doctor.rs:2260`：只统计 `.jsonl` rollout 文件，并在 `2251-2262` 对每个匹配文件累加大小。
- `codex-rs/cli/src/doctor.rs:984`：npm-managed doctor 路径最多调用一次 `npm_global_root_check`。
- `codex-rs/cli/src/doctor.rs:1054`：`run_command` 直接执行子进程并读取 stdout/stderr；当前代码未给 `npm root -g` 加 timeout。
- `codex-rs/cli/src/doctor.rs:2682`：provider reachability 按 plan endpoints 逐个 probe。
- `codex-rs/cli/src/doctor.rs:2837`：HTTP probe 使用 3s timeout。
- `codex-rs/cli/src/doctor.rs:2845`：MCP HTTP probe 先 HEAD，失败后 GET，每次使用传入 timeout。
- `codex-rs/cli/src/doctor/updates.rs:180`：latest-version probe 通过 `curl -fsSL --max-time 5` 获取 JSON。
- `codex-rs/.config/nextest.toml:20`：本地 app-server integration group 限制为 4 threads。
- `codex-rs/.config/nextest.toml:25`：zsh-fork integration 本地 serial group。
- `codex-rs/.config/nextest.toml:80`：core tool parallelism tests 单独分组并保留 full thread pool。
- `codex-rs/.config/nextest.toml:95`：Windows-heavy tests 使用专门 timeout/group。
- `codex-rs/Cargo.toml:543`：`ci-test` profile 保留 limited debug。
- `codex-rs/Cargo.toml:549`：`ci-test-slim` profile 新增 `debug = 0` 和 `strip = "debuginfo"`。

## 已排除项

- Windows sandbox `SystemRoot`/`WINDIR` 继承、fork 包名替换、npm package README/package metadata、Cargo lock 依赖图噪声写入 `08-excluded-files.md`。
- `codex doctor` rollout stats 扫描是基线已有逻辑，当前 `dev` 相对 `rust-v0.142.0` 没有引入、放大、暴露或改变该扫描路径；同步写入 `08-excluded-files.md` 作为 baseline-only 排除。
- `Cargo.toml` 中 `ext/gui`、`gui-host` workspace member 与 `codex-gui-host` dependency 只作为前序 GUI host tasks 的依赖背景，本任务不重复归因。
- 没有运行 `codex doctor`、`nextest`、benchmark、schema generation、snapshot accept、格式化或安装命令；结论只基于源码与本地 `git diff rust-v0.142.0..HEAD`。

## 风险

- `codex doctor` rollout stats 当前是无上限本地目录扫描；如果用户有大量 active/archived rollout 文件，doctor 的 state check 成本会随历史文件数线性增长。由于该逻辑不是本次 diff 引入，也未被当前 `dev` 增量放大或接入新热路径，本轮作为 baseline-only 排除，不报告为当前 dev 相对 `rust-v0.142.0` 的风险。
- `npm root -g` 是常数次数外部命令，但代码层无 timeout；本轮未运行命令，也未测量 npm 在异常环境下的耗时，因此只能标为“证据不足”。
- nextest/CI 配置属于检测与 CI 调度成本，不代表 runtime 用户路径；若后续把 CI timeout 变化作为产品性能信号，需要单独区分测试环境噪声与真实 runtime regression。

## 下一阶段建议

- 若继续 secondary Rust surfaces，优先为 `codex doctor` state check 建一个独立 issue：为 rollout stats 扫描引入上限、采样、cache 或显式 `--all`/verbose gate 的设计评估。
- 若要验证 doctor 外部命令风险，单独设计只读/可控环境的 probe timeout 检查；不要把真实网络、npm 环境和本地 rollout 历史混入 app-server projection 性能主线。
- CI/nextest 配置后续只作为“检测稳定性/资源调度”输入，不应和 app-server listener、projection attach、fanout/backpressure 的 runtime 性能结论混写。
