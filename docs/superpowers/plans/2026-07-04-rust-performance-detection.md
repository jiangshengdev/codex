# Rust Performance Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute a Rust-only performance detection pass for current `dev` against `rust-v0.142.0`, using subagents for all analysis and producing file-split summary reports.

**Architecture:** The controller coordinates small read-only subagent investigations, updates research after each batch, and writes final reports under `docs/superpowers/reports/2026-07-04-rust-performance-detection/`. Each task covers one narrow risk path or output file, focuses on time/space complexity risks rather than constant overhead, and must distinguish known issue status from new findings.

**Tech Stack:** Git read-only diff/stat commands, Rust source inspection, `docs/superpowers/issues/**`, `docs/superpowers/research/**`, optional narrow `just test -p <crate> <filter>` only when explicitly authorized during execution.

---

## File Structure

- Read: `docs/superpowers/specs/2026-07-04-rust-performance-detection-design.md`
- Read/modify: `docs/superpowers/research/2026-07-04-rust-performance-detection/current-findings.md`
- Read/modify: `docs/superpowers/research/2026-07-04-rust-performance-detection/execution-log.md`
- Create: `docs/superpowers/reports/2026-07-04-rust-performance-detection/00-summary.md`
- Create: `docs/superpowers/reports/2026-07-04-rust-performance-detection/01-app-server.md`
- Create: `docs/superpowers/reports/2026-07-04-rust-performance-detection/02-app-server-protocol.md`
- Create: `docs/superpowers/reports/2026-07-04-rust-performance-detection/03-gui-host.md`
- Create: `docs/superpowers/reports/2026-07-04-rust-performance-detection/04-ext-gui.md`
- Create: `docs/superpowers/reports/2026-07-04-rust-performance-detection/05-tui-gui-boundary.md`
- Create: `docs/superpowers/reports/2026-07-04-rust-performance-detection/06-app-server-client.md`
- Create: `docs/superpowers/reports/2026-07-04-rust-performance-detection/07-secondary-rust-surfaces.md`
- Create: `docs/superpowers/reports/2026-07-04-rust-performance-detection/08-excluded-files.md`

Execution must not modify Rust source files. If a subagent finds a likely bug, record it in the report; do not fix it.

## Global Execution Rules

- Every analysis task must be delegated to a subagent.
- The controller may read the design, research, reports, and short targeted evidence snippets only for coordination and spot checks.
- Do not run `git remote`, `git fetch`, `git pull`, or `git push`.
- Do not run benchmark, full test, crate-wide test, schema generation, snapshot accept, formatting, or install commands unless the user explicitly authorizes that exact command shape during execution.
- Do not analyze `codex-gui/**`.
- Do not report known issues as new findings.
- Treat performance as time/space complexity risk, not constant-factor tuning.
- Only report risks attributable to current `dev` changes relative to `rust-v0.142.0`.
- Exclude upstream baseline performance problems, no matter how severe, when current `dev` did not introduce, amplify, expose, or change them.
- If attribution to current `dev` is unclear, mark the item as `证据不足` and state the missing diff or call-chain evidence instead of reporting it as confirmed.
- Each subagent must identify the relevant scale variables, such as history items, events, threads, subscribers, connections, messages, queue depth, or retained map entries.
- Deprioritize constant-only details such as one-time URL construction, one-time argument parsing, small fixed JSON serialization, or fixed host startup steps.
- Record constant costs only when they sit inside a hot loop or repeat with a growing scale variable.
- Update `execution-log.md` before and after every task.
- Update `current-findings.md` whenever a task produces stable planning or detection conclusions.

## Subagent Output Contract

Every subagent must return exactly these sections:

```md
## 结论

## 关键证据路径/行号

## 已排除项

## 风险

## 下一阶段建议
```

The `结论` or `风险` section must explicitly state:

- the scale variable;
- whether the finding is a complexity risk, unbounded growth risk, constant-only cost, or evidence gap;
- whether the risk is attributable to current `dev` changes relative to `rust-v0.142.0`.

If command execution is explicitly authorized later, the subagent may add `### 命令输出摘要` under `关键证据路径/行号`.

## Report Entry Status Values

Use only these status values in final reports:

- `无明显风险`
- `已有 issue 仍成立`
- `已修复但需回归覆盖`
- `已过期`
- `新发现`
- `证据不足`
- `排除`

Do not use `新发现` for constant-only slowdowns unless the slowdown repeats with a growing scale variable.
Do not use `新发现` for upstream baseline issues unless current `dev` introduced, amplified, exposed, or changed the issue.

## Task 1: Preflight And Report Skeleton

**Files:**
- Read: `docs/superpowers/specs/2026-07-04-rust-performance-detection-design.md`
- Modify: `docs/superpowers/research/2026-07-04-rust-performance-detection/execution-log.md`
- Create: all files under `docs/superpowers/reports/2026-07-04-rust-performance-detection/`

- [ ] **Step 1: Confirm branch and inputs**

Run:

```bash
git status --short --branch
test -f docs/superpowers/specs/2026-07-04-rust-performance-detection-design.md
test -f docs/superpowers/research/2026-07-04-rust-performance-detection/current-findings.md
```

Expected:

- Branch is `dev`.
- Design and research files exist.

- [ ] **Step 2: Create report directory and empty report files**

Create:

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

Each file should start with a single H1 matching the filename responsibility and a short note saying the file will be populated by later tasks.

- [ ] **Step 3: Log preflight**

Append to `execution-log.md`:

```md
- Started execution of the Rust performance detection plan. Created report skeleton only; no performance detection has run yet.
```

## Task 2: App-server Projection State And Generation

**Files:**
- Read: `docs/superpowers/issues/2026-05-30-02-thread-generations-unbounded.md`
- Read: `codex-rs/app-server/src/thread_projection.rs`
- Modify: `docs/superpowers/research/2026-07-04-rust-performance-detection/current-findings.md`
- Modify: `docs/superpowers/reports/2026-07-04-rust-performance-detection/01-app-server.md`

- [ ] **Step 1: Dispatch subagent**

Prompt:

```text
只读检测计划任务：检查 app-server projection state/generation 性能风险路径。范围只包括 docs/superpowers/issues/2026-05-30-02-thread-generations-unbounded.md 和 codex-rs/app-server/src/thread_projection.rs 中 thread_generations、threads、connection_index、remove_thread、generation bump/retention 相关入口。不要修复，不跑测试，不跑 benchmark，不读完整大 diff，不访问 git remote。目标是判断最终报告中该文件/路径应标记为哪种状态：无明显风险、已有 issue 仍成立、已修复但需回归覆盖、已过期、新发现、证据不足。必须区分已知 issue 和新发现。按固定五段式返回。
```

- [ ] **Step 2: Update research**

Append a compressed result to `current-findings.md` under a new execution findings section.

- [ ] **Step 3: Update app-server report**

Add the subagent result summary to `01-app-server.md` under a `Projection state and generation` section.

## Task 3: App-server Projection Attach Path

**Files:**
- Read: `docs/superpowers/issues/2026-05-19-projection-atomicity-review.md`
- Read: `codex-rs/app-server/src/request_processors/thread_projection.rs`
- Read: `codex-rs/app-server/src/thread_projection_runtime.rs`
- Read: `codex-rs/app-server/src/thread_state.rs`
- Modify: `docs/superpowers/research/2026-07-04-rust-performance-detection/current-findings.md`
- Modify: `docs/superpowers/reports/2026-07-04-rust-performance-detection/01-app-server.md`

- [ ] **Step 1: Dispatch subagent**

Prompt:

```text
只读检测计划任务：检查 projection attach 路径的性能/生命周期风险边界。范围只包括 docs/superpowers/issues/2026-05-19-projection-atomicity-review.md、codex-rs/app-server/src/request_processors/thread_projection.rs、codex-rs/app-server/src/thread_projection_runtime.rs、codex-rs/app-server/src/thread_state.rs 中 prepare_projection_attach、listener command、handle_thread_projection_attach_response、lease/connection cleanup 相关入口。不要修复，不跑测试，不跑 benchmark，不访问 git remote。不要把历史已修复 issue 重报为新问题。按固定五段式返回。
```

- [ ] **Step 2: Update research and report**

Write the compressed result into `current-findings.md` and `01-app-server.md`.

## Task 4: App-server Listener Event And Cursor Cost

**Files:**
- Read: `docs/superpowers/issues/2026-06-01-01-projection-eager-history-cursor.md`
- Read: `codex-rs/app-server/src/request_processors/thread_lifecycle.rs`
- Read: `codex-rs/app-server/src/request_processors/thread_processor.rs`
- Modify: `docs/superpowers/research/2026-07-04-rust-performance-detection/current-findings.md`
- Modify: `docs/superpowers/reports/2026-07-04-rust-performance-detection/01-app-server.md`

- [ ] **Step 1: Dispatch subagent**

Prompt:

```text
只读检测计划任务：检查 listener 启动/事件循环中 projection 成本是否扩散到未使用 projection 的旧路径。范围只包括 docs/superpowers/issues/2026-06-01-01-projection-eager-history-cursor.md、codex-rs/app-server/src/request_processors/thread_lifecycle.rs、codex-rs/app-server/src/request_processors/thread_processor.rs。注意旧 issue 中的 ProjectionHistoryCursor/projection_history_cursor_for_listener_start 命名可能已过期，应按当前 listener 启动和事件循环入口确认状态。不要修复，不跑测试，不跑 benchmark，不访问 git remote。按固定五段式返回。
```

- [ ] **Step 2: Update research and report**

Write the compressed result into `current-findings.md` and `01-app-server.md`.

## Task 5: App-server Fanout And Backpressure

**Files:**
- Read: `docs/superpowers/issues/2026-05-30-01-projection-fanout-silent-invalidation.md`
- Read: `docs/superpowers/issues/2026-05-30-05-projection-test-coverage-gaps.md`
- Read: `codex-rs/app-server/src/projection_fanout.rs`
- Read: `codex-rs/app-server/src/outgoing_message.rs`
- Modify: `docs/superpowers/research/2026-07-04-rust-performance-detection/current-findings.md`
- Modify: `docs/superpowers/reports/2026-07-04-rust-performance-detection/01-app-server.md`

- [ ] **Step 1: Dispatch subagent**

Prompt:

```text
只读检测计划任务：检查 projection fanout/backpressure 风险路径。范围只包括 docs/superpowers/issues/2026-05-30-01-projection-fanout-silent-invalidation.md、docs/superpowers/issues/2026-05-30-05-projection-test-coverage-gaps.md、codex-rs/app-server/src/projection_fanout.rs、codex-rs/app-server/src/outgoing_message.rs。重点是 bounded queue、worker、ordinary notification 与 projection delivery 隔离、closed(backpressure) 通知、覆盖证据缺口。不要修复，不跑测试，不跑 benchmark，不访问 git remote。按固定五段式返回。
```

- [ ] **Step 2: Update research and report**

Write the compressed result into `current-findings.md` and `01-app-server.md`.

## Task 6: App-server Transient Delta And Snapshot Boundary

**Files:**
- Read: `docs/superpowers/issues/2026-05-19-projection-hidden-race-review.md`
- Read: `codex-rs/app-server/src/thread_projection.rs`
- Read: `codex-rs/app-server/src/thread_projection_cut.rs`
- Read: `codex-rs/app-server/src/thread_projection_runtime.rs`
- Modify: `docs/superpowers/research/2026-07-04-rust-performance-detection/current-findings.md`
- Modify: `docs/superpowers/reports/2026-07-04-rust-performance-detection/01-app-server.md`

- [ ] **Step 1: Dispatch subagent**

Prompt:

```text
只读检测计划任务：检查 transient delta、snapshot cut、head commit 边界是否需要性能检测或回归标记。范围只包括 docs/superpowers/issues/2026-05-19-projection-hidden-race-review.md、codex-rs/app-server/src/thread_projection.rs、codex-rs/app-server/src/thread_projection_cut.rs、codex-rs/app-server/src/thread_projection_runtime.rs。不要修复，不跑测试，不跑 benchmark，不访问 git remote。按固定五段式返回。
```

- [ ] **Step 2: Update research and report**

Write the compressed result into `current-findings.md` and `01-app-server.md`.

## Task 7: App-server Protocol Source

**Files:**
- Read: `codex-rs/app-server-protocol/src/protocol/v2/thread_projection.rs`
- Read: `codex-rs/app-server-protocol/src/protocol/common.rs`
- Read: `codex-rs/app-server-protocol/src/protocol/v2/mod.rs`
- Read: `codex-rs/app-server-protocol/src/export.rs`
- Modify: `docs/superpowers/reports/2026-07-04-rust-performance-detection/02-app-server-protocol.md`
- Modify: `docs/superpowers/research/2026-07-04-rust-performance-detection/current-findings.md`

- [ ] **Step 1: Dispatch subagent**

Prompt:

```text
只读检测计划任务：检查 app-server-protocol handwritten source 是否引入运行时或生成时性能检测关注点。范围只包括 codex-rs/app-server-protocol/src/protocol/v2/thread_projection.rs、common.rs、v2/mod.rs、export.rs，以及 docs/superpowers/issues/2026-05-30-06-export-annotation-last-writer-wins.md 作为非性能风险参考。不要审查 schema 生成物，不跑 schema 生成，不跑测试，不访问 git remote。按固定五段式返回。
```

- [ ] **Step 2: Update research and protocol report**

Write the compressed result into `current-findings.md` and `02-app-server-protocol.md`.

## Task 8: App-server Fixture Boundary

**Files:**
- Read: `codex-rs/app-server/src/thread_projection_fixtures.rs`
- Read: `codex-rs/app-server/src/bin/write_gui_projection_fixtures.rs`
- Read: `codex-rs/app-server/README.md`
- Modify: `docs/superpowers/reports/2026-07-04-rust-performance-detection/01-app-server.md`
- Modify: `docs/superpowers/reports/2026-07-04-rust-performance-detection/08-excluded-files.md`

- [ ] **Step 1: Dispatch subagent**

Prompt:

```text
只读检测计划任务：检查 projection fixtures 和 fixture generator 是否属于性能检测主面或仅作为输出背景。范围只包括 codex-rs/app-server/src/thread_projection_fixtures.rs、codex-rs/app-server/src/bin/write_gui_projection_fixtures.rs、codex-rs/app-server/README.md。不要运行 generator，不审查生成物，不跑测试，不访问 git remote。按固定五段式返回。
```

- [ ] **Step 2: Update reports**

Write the compressed result into `01-app-server.md` and, if excluded output files are identified, `08-excluded-files.md`.

## Task 9: GUI Host Start And URL Boundary

**Files:**
- Read: `codex-rs/gui-host/src/host.rs`
- Read: `codex-rs/gui-host/src/net.rs`
- Read: `codex-rs/gui-host/src/url.rs`
- Read: `codex-rs/gui-host/src/config.rs`
- Modify: `docs/superpowers/reports/2026-07-04-rust-performance-detection/03-gui-host.md`
- Modify: `docs/superpowers/research/2026-07-04-rust-performance-detection/current-findings.md`

- [ ] **Step 1: Dispatch subagent**

Prompt:

```text
只读检测计划任务：检查 Rust gui-host start/url 边界。范围只包括 codex-rs/gui-host/src/host.rs、net.rs、url.rs、config.rs。关注 host 启动、地址发现、URL 生成是否需要性能检测或可观测边界。不要分析 codex-gui/**，不跑服务器，不跑浏览器，不跑测试，不访问 git remote。按固定五段式返回。
```

- [ ] **Step 2: Update research and gui-host report**

Write the compressed result into `current-findings.md` and `03-gui-host.md`.

## Task 10: GUI Host WebSocket Bridge Boundary

**Files:**
- Read: `codex-rs/gui-host/src/ws.rs`
- Read: `codex-rs/gui-host/src/filter.rs`
- Read: `codex-rs/gui-host/src/token.rs`
- Read: `codex-rs/gui-host/src/backend.rs`
- Modify: `docs/superpowers/reports/2026-07-04-rust-performance-detection/03-gui-host.md`
- Modify: `docs/superpowers/research/2026-07-04-rust-performance-detection/current-findings.md`

- [ ] **Step 1: Dispatch subagent**

Prompt:

```text
只读检测计划任务：检查 Rust gui-host WebSocket bridge 边界。范围只包括 codex-rs/gui-host/src/ws.rs、filter.rs、token.rs、backend.rs。关注认证、allowlist、mpsc channel、双向 pump、backpressure 或 buffering 的检测入口。不要分析前端 GUI，不跑服务器，不跑测试，不访问 git remote。按固定五段式返回。
```

- [ ] **Step 2: Update research and gui-host report**

Write the compressed result into `current-findings.md` and `03-gui-host.md`.

## Task 11: GUI Host Assets Boundary

**Files:**
- Read: `codex-rs/gui-host/src/assets.rs`
- Read: `codex-rs/gui-host/src/embedded_pages/dev_proxy_error.html`
- Read: `codex-rs/gui-host/src/embedded_pages/assets/style.css`
- Read: `codex-rs/gui-host/src/lib.rs`
- Modify: `docs/superpowers/reports/2026-07-04-rust-performance-detection/03-gui-host.md`
- Modify: `docs/superpowers/reports/2026-07-04-rust-performance-detection/08-excluded-files.md`

- [ ] **Step 1: Dispatch subagent**

Prompt:

```text
只读检测计划任务：检查 Rust gui-host asset/dev-proxy/prod asset serve 边界。范围只包括 codex-rs/gui-host/src/assets.rs、embedded_pages/dev_proxy_error.html、embedded_pages/assets/style.css、lib.rs。只看 Rust host 成本边界和排除项，不分析前端资源自身性能，不跑服务器，不跑浏览器，不访问 git remote。按固定五段式返回。
```

- [ ] **Step 2: Update reports**

Write the compressed result into `03-gui-host.md` and any excluded frontend/static assets into `08-excluded-files.md`.

## Task 12: Ext GUI Tool Boundary

**Files:**
- Read: `codex-rs/ext/gui/src/extension.rs`
- Read: `codex-rs/ext/gui/src/spec.rs`
- Read: `codex-rs/ext/gui/src/tool.rs`
- Read: `codex-rs/ext/gui/src/lib.rs`
- Modify: `docs/superpowers/reports/2026-07-04-rust-performance-detection/04-ext-gui.md`
- Modify: `docs/superpowers/research/2026-07-04-rust-performance-detection/current-findings.md`

- [ ] **Step 1: Dispatch subagent**

Prompt:

```text
只读检测计划任务：检查 ext/gui launch_gui agent tool 边界。范围只包括 codex-rs/ext/gui/src/extension.rs、spec.rs、tool.rs、lib.rs。关注 tool 注册、参数解析、host service 调用、JSON 输出序列化是否需要性能检测或可观测边界。不要分析 gui-host 内部，不分析前端 GUI，不跑测试，不访问 git remote。按固定五段式返回。
```

- [ ] **Step 2: Update research and ext-gui report**

Write the compressed result into `current-findings.md` and `04-ext-gui.md`.

## Task 13: TUI GUI Launch Boundary

**Files:**
- Read: `codex-rs/tui/src/slash_command.rs`
- Read: `codex-rs/tui/src/chatwidget/slash_dispatch.rs`
- Read: `codex-rs/tui/src/app/thread_routing.rs`
- Read: `codex-rs/tui/src/app/gui.rs`
- Read: `codex-rs/tui/src/app_command.rs`
- Modify: `docs/superpowers/reports/2026-07-04-rust-performance-detection/05-tui-gui-boundary.md`

- [ ] **Step 1: Dispatch subagent**

Prompt:

```text
只读检测计划任务：检查 TUI /gui launch boundary。范围只包括 codex-rs/tui/src/slash_command.rs、chatwidget/slash_dispatch.rs、app/thread_routing.rs、app/gui.rs、app_command.rs。只看 /gui 命令到 launch_gui_for_thread 和 URL 输出边界；不分析 TUI 通用渲染性能，不分析 codex-gui/**，不跑 snapshot/test，不访问 git remote。按固定五段式返回。
```

- [ ] **Step 2: Update TUI report**

Write the compressed result into `05-tui-gui-boundary.md`.

## Task 14: TUI Projection Routing Boundary

**Files:**
- Read: `codex-rs/tui/src/app/app_server_event_targets.rs`
- Read: `codex-rs/tui/src/chatwidget/protocol.rs`
- Read: `codex-rs/tui/src/app_server_session.rs`
- Read: `codex-rs/tui/src/app/thread_routing.rs`
- Modify: `docs/superpowers/reports/2026-07-04-rust-performance-detection/05-tui-gui-boundary.md`

- [ ] **Step 1: Dispatch subagent**

Prompt:

```text
只读检测计划任务：检查 TUI projection routing boundary。范围只包括 codex-rs/tui/src/app/app_server_event_targets.rs、chatwidget/protocol.rs、app_server_session.rs、app/thread_routing.rs。目标是确认 projection 通知是否进入 TUI 展示热路径或被归为非展示/全局处理边界。不要分析通用 TUI 渲染，不跑 snapshot/test，不访问 git remote。按固定五段式返回。
```

- [ ] **Step 2: Update TUI report**

Write the compressed result into `05-tui-gui-boundary.md`.

## Task 15: App-server Client GUI Boundary

**Files:**
- Read: `codex-rs/app-server-client/src/gui.rs`
- Read: `codex-rs/app-server-client/src/lib.rs`
- Modify: `docs/superpowers/reports/2026-07-04-rust-performance-detection/06-app-server-client.md`

- [ ] **Step 1: Dispatch subagent**

Prompt:

```text
只读检测计划任务：检查 app-server-client GUI boundary。范围只包括 codex-rs/app-server-client/src/gui.rs 和 lib.rs。关注 client API 是否只是薄边界，是否需要性能检测或可观测入口。不要分析 gui-host、TUI、前端 GUI，不跑测试，不访问 git remote。按固定五段式返回。
```

- [ ] **Step 2: Update app-server-client report**

Write the compressed result into `06-app-server-client.md`.

## Task 16: Secondary Rust Surfaces

**Files:**
- Read: `codex-rs/windows-sandbox-rs/src/env.rs`
- Read: `codex-rs/windows-sandbox-rs/src/elevated_impl.rs`
- Read: `codex-rs/windows-sandbox-rs/src/spawn_prep.rs`
- Read: `codex-rs/cli/src/doctor.rs`
- Read: `codex-rs/cli/src/doctor/updates.rs`
- Read: `codex-rs/responses-api-proxy/npm/package.json`
- Read: `codex-rs/responses-api-proxy/npm/README.md`
- Read: `codex-rs/Cargo.toml`
- Read: `codex-rs/Cargo.lock`
- Read: `codex-rs/.config/nextest.toml`
- Modify: `docs/superpowers/reports/2026-07-04-rust-performance-detection/07-secondary-rust-surfaces.md`
- Modify: `docs/superpowers/reports/2026-07-04-rust-performance-detection/08-excluded-files.md`

- [ ] **Step 1: Dispatch subagent**

Prompt:

```text
只读检测计划任务：检查 secondary Rust surfaces 是否属于性能检测主线或可排除噪声。范围只包括 windows-sandbox-rs/env.rs、elevated_impl.rs、spawn_prep.rs、cli/doctor.rs、cli/doctor/updates.rs、responses-api-proxy/npm/package.json、responses-api-proxy/npm/README.md、codex-rs/Cargo.toml、Cargo.lock、.config/nextest.toml。不要修复，不跑测试，不访问 git remote。按固定五段式返回。
```

- [ ] **Step 2: Update reports**

Write included results into `07-secondary-rust-surfaces.md` and excluded results into `08-excluded-files.md`.

## Task 17: Excluded Files And Generated Outputs

**Files:**
- Read: `git diff --name-only rust-v0.142.0 -- codex-rs`
- Modify: `docs/superpowers/reports/2026-07-04-rust-performance-detection/08-excluded-files.md`

- [ ] **Step 1: Dispatch subagent**

Prompt:

```text
只读检测计划任务：produce the excluded-files report input. Use only path lists and file categories from `git diff --name-only rust-v0.142.0 -- codex-rs`. Categorize generated schema, tests, snapshots, frontend GUI exclusions, static assets, and files already assigned to other report files. Do not read code contents, do not run tests, do not edit files, do not access git remote. 按固定五段式返回。
```

- [ ] **Step 2: Update excluded report**

Write the category summary into `08-excluded-files.md`.

## Task 18: Final Summary Assembly

**Files:**
- Read: `docs/superpowers/reports/2026-07-04-rust-performance-detection/01-app-server.md`
- Read: `docs/superpowers/reports/2026-07-04-rust-performance-detection/02-app-server-protocol.md`
- Read: `docs/superpowers/reports/2026-07-04-rust-performance-detection/03-gui-host.md`
- Read: `docs/superpowers/reports/2026-07-04-rust-performance-detection/04-ext-gui.md`
- Read: `docs/superpowers/reports/2026-07-04-rust-performance-detection/05-tui-gui-boundary.md`
- Read: `docs/superpowers/reports/2026-07-04-rust-performance-detection/06-app-server-client.md`
- Read: `docs/superpowers/reports/2026-07-04-rust-performance-detection/07-secondary-rust-surfaces.md`
- Read: `docs/superpowers/reports/2026-07-04-rust-performance-detection/08-excluded-files.md`
- Modify: `docs/superpowers/reports/2026-07-04-rust-performance-detection/00-summary.md`
- Modify: `docs/superpowers/research/2026-07-04-rust-performance-detection/current-findings.md`

- [ ] **Step 1: Compile report index**

Create a concise index in `00-summary.md` that links all report files and counts statuses using the fixed status values.

- [ ] **Step 2: Separate known issues from new findings**

In `00-summary.md`, keep known issue status changes separate from new findings.

- [ ] **Step 3: Record evidence gaps**

In `00-summary.md`, list files or slices marked `证据不足` and the exact next evidence needed.

- [ ] **Step 4: Update research**

Append a final execution summary to `current-findings.md`.

## Task 19: Self-Review And Handoff

**Files:**
- Read: `docs/superpowers/specs/2026-07-04-rust-performance-detection-design.md`
- Read: all files under `docs/superpowers/reports/2026-07-04-rust-performance-detection/`
- Modify: report files only if self-review finds internal inconsistency.

- [ ] **Step 1: Verify design coverage**

Check that reports cover:

- app-server.
- app-server-protocol.
- gui-host.
- ext/gui.
- TUI GUI boundary.
- app-server-client.
- secondary Rust surfaces.
- excluded files.

- [ ] **Step 2: Verify prohibited scope stayed excluded**

Confirm no report analyzes:

- `codex-gui/**`.
- React/browser/CSS/DOM frontend performance.
- Upstream implementation quality.
- Fix implementation.

- [ ] **Step 3: Verify known issue handling**

Confirm every finding is tagged as known issue status, new finding, or evidence gap.

- [ ] **Step 4: Verify no unauthorized commands ran**

Confirm `execution-log.md` records no benchmark, full test, crate-wide test, schema generation, snapshot accept, install, or git remote command unless the user explicitly authorized it during execution.

- [ ] **Step 5: Verify dev-increment attribution**

Confirm every reported risk is attributable to current `dev` changes relative to `rust-v0.142.0`, or is explicitly marked `证据不足`. Confirm baseline-only upstream issues are excluded even if severe.

- [ ] **Step 6: Final handoff**

Report the created files and say whether any items remain `证据不足`. Do not stage or commit unless the user explicitly asks.
