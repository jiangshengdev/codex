# Codex GUI Host Migration Roadmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 制定 GUI host 从旧设计资产迁移到当前 `dev` / `rust-v0.136.0` 代码边界的总地图。

**Architecture:** 复用已恢复的 GUI host / projection 设计决策，但不复刻旧分支的实现路线。当前迁移必须以 `rust-v0.136.0` 代码形状为边界：优先 fork-only 模块和最小 adapter，禁止为了 GUI host 重构上游 app-server/runtime/projection 代码。

**Tech Stack:** Rust 2024, codex-app-server, codex-app-server-client, codex-tui, codex-gui-host, app-server JSON-RPC, Vite, React, Redux Toolkit, Vitest Browser Mode.

---

## Scope

本文只负责 `00` 总览和迁移地图，不是具体实现计划。

它要回答：

- 哪些 design 文件是 source of truth。
- 哪些旧设计决策继续保留。
- 哪些旧 plan / 旧实现路线不能直接执行。
- 后续应拆成哪些 `01+` 计划。
- 每个阶段的边界、输入、输出和停止条件。

它不包含：

- 具体 Rust patch。
- 具体测试代码。
- 可直接交给 agent 执行的逐步实现任务。
- 对 `rust-v0.136.0` app-server/runtime/projection 代码的重构方案。

后续每一份 `01+` plan 必须先读本文和对应 design，再按当前源码重新制定，不得直接沿用旧分支 commit 顺序。

## Source Of Truth

当前迁移复用这些设计文件：

- 主设计：`docs/superpowers/specs/2026-05-11-codex-gui-host-redesign.md`
- 当前 `dev` 适配设计：`docs/superpowers/specs/2026-05-30-codex-gui-host-dev-adaptation-design.md`
- low-intrusion 补充设计：
  - `docs/superpowers/specs/2026-05-13-gui-host-low-intrusion-refactor-design.md`
  - `docs/superpowers/specs/2026-05-13-gui-host-extra-open-hook-thinning-design.md`
- Projection 背景与协议设计：
  - `docs/superpowers/specs/2026-05-02-codex-gui-projection-design.md`
  - `docs/superpowers/specs/2026-05-08-codex-gui-server-projection-redesign.md`
- 历史背景：`docs/superpowers/specs/2026-05-10-codex-gui-host-design.md`

`2026-05-10-codex-gui-host-design.md` 只作为背景。当前 GUI host 规范来源是 `2026-05-11-codex-gui-host-redesign.md`，但其中涉及 `in_process.rs` / bridge API shape 的部分必须经过当前 `rust-v0.136.0` 源码复核后再落 plan。

## Non-Negotiable Constraints

- 绝对不要重构 `rust-v0.136.0` 引入的 app-server/runtime/projection 代码。
- 不把旧分支的 `open_extra_jsonrpc_connection` / `ExtraJsonRpcConnectionFactory` 方向恢复回来。
- 不把旧的 extra-connection 提交序列当作当前 `dev` 的执行顺序。
- 不复制 `remote-control` 的 connection maps、outbound routing、close cleanup 到 `in_process.rs`。
- 不为了 GUI host 改写上游已有数据结构、主循环职责或 projection fanout 结构。
- 不新增 GUI 代码到 `codex-core`。
- 不让 `codex-gui-host` 依赖 `codex-app-server`。
- 不让 `codex-tui` 直接依赖 `codex-app-server` 或 `codex-gui-host`。
- 不自动打开浏览器；`/gui` 首版只显示本机 URL。
- 不把 `gui/authenticate` 加进 app-server v2 API；它只是 GUI host 本地首帧认证。
- 不修改 `CODEX_SANDBOX_NETWORK_DISABLED_ENV_VAR` 或 `CODEX_SANDBOX_ENV_VAR` 相关代码。

如果某个后续计划无法在这些约束内成立，必须停止并回到 design 讨论，不能继续写实现步骤。

## Preserved Design Decisions

这些决策直接复用：

- GUI 是从 TUI 启动的 companion surface。
- TUI 只请求 launch URL 并显示，不转发 browser JSON-RPC traffic。
- 浏览器不直连 existing app-server remote WebSocket。
- `codex-gui-host` 是 browser-safe 本机入口，负责 HTTP assets、same-origin `/ws`、Host / Origin 校验、launch token 和 allowlist。
- `codex-gui-host` 只定义 host shell 和 backend contract，不拥有 app-server business logic。
- app-server runtime owns GUI host lifecycle。
- `/gui` 首版使用 primary thread。
- `/gui` 首版不支持 LAN、mobile、公网 relay、approval、interrupt、user turn、subagent switching、projection viewer。
- 认证成功后，browser traffic 才能进入 app-server 侧处理链。
- 认证失败不得在 app-server runtime 留下 connection / session / outbound state。
- 入方向 allowlist 首版只允许 projection transport MVP 需要的 JSON-RPC 方法。
- 出方向 allowlist 首版只允许 projection transport MVP 需要的 notification / response。
- Frontend transport client 保持 store-free；Redux dispatch 留在 React boundary。

## Decisions That Must Be Rechecked

这些旧设计方向不能直接执行，必须先做 current-source audit：

- 认证后的 `/ws` 如何接入当前 `rust-v0.136.0` app-server runtime。
- 是否仍然需要 `in_process_extra.rs`，以及它的最小 API shape。
- `in_process.rs` 中允许的 hook 数量、位置和命名。
- app-server-client facade 是否需要持有 manager / sender / handle，具体 drop 顺序如何保证。
- 当前 projection attach/event API 和 05-08 redesign 的差异。
- 当前 `codex-gui` 已迁入代码和旧 GUI projection 设计的差异。

复核原则：

- 先读当前源码，再写 plan。
- 优先 adapter，不 reshape 上游结构。
- 如果当前源码已经有合适边界，使用当前边界。
- 如果没有合适边界，只加最窄 hook。
- 如果最窄 hook 仍然需要大面积改 `rust-v0.136.0` 代码，停止。

## Existing Plan Status

当前目录里的旧计划状态：

- `00-roadmap.md`：本文是新的总地图。
- `01-gui-host-crate.md`：已重写为 design/source audit gate。文件名暂保留 `01` 历史编号，但内容不再是 host crate 实现计划。
- `02-in-process-extra-connection.md`：已删除。不要恢复；旧版沿用了失败尝试的实现路线，后续必须先经过 bridge 形态复核后另写新计划。

被 revert 的旧 plan / 旧 commit 只可作为历史证据，不可作为当前执行依据。

## Migration Map

推荐迁移路线：

```text
00 roadmap
  -> 01 design/source audit
  -> 02 gui-host crate recovery
  -> 03 bridge boundary decision
  -> 04 minimal app-server adapter
  -> 05 app-server-client facade
  -> 06 TUI /gui command
  -> 07 frontend handshake/store verification
  -> 08 packaging and end-to-end verification
```

其中 `01` 和 `03` 是保护 `rust-v0.136.0` 的关键 gate。没有通过 gate，不允许写后续 implementation plan。

## Target Plan Set

后续计划建议如下。只有用户明确要求时才分别创建。

### `01-design-source-audit.md`

目标：只读复核 design 与当前源码边界。

输入：

- 本文。
- source-of-truth design 文件。
- 当前 `dev` / `rust-v0.136.0` app-server、app-server-client、tui、gui-host、codex-gui 源码。

输出：

- `KEEP / RECHECK / DROP` 决策表。
- 当前源码中可用的 hook / adapter 点。
- 旧 plan 中不可执行的步骤列表。
- 后续 `02+` 的硬边界。

停止条件：

- 如果发现主设计要求大面积改写 `rust-v0.136.0` 代码，停止并回到 design。

### `02-gui-host-crate.md`

目标：恢复或迁入 `codex-gui-host` host shell。

边界：

- 可以创建/恢复 `codex-rs/gui-host/**`。
- 可以做 workspace wiring。
- 不接 app-server runtime。
- 不修改 projection runtime。

预期文件：

- `codex-rs/gui-host/Cargo.toml`
- `codex-rs/gui-host/BUILD.bazel`
- `codex-rs/gui-host/src/lib.rs`
- `codex-rs/gui-host/src/token.rs`
- `codex-rs/gui-host/src/config.rs`
- `codex-rs/gui-host/src/url.rs`
- `codex-rs/gui-host/src/filter.rs`
- `codex-rs/gui-host/src/backend.rs`
- `codex-rs/gui-host/src/host.rs`
- `codex-rs/gui-host/src/assets.rs`
- `codex-rs/gui-host/src/ws.rs`

必须保持：

- `codex-gui-host` 不依赖 `codex-app-server`。
- `GuiBackend` trait 使用 RPITIT + explicit `Send` future bound。
- Host / Origin / token / allowlist 属于 gui-host shell。

### `03-bridge-boundary-decision.md`

目标：决定当前 `dev` 上认证后的 GUI `/ws` 如何最小接入 app-server runtime。

这是决策计划，不是实现计划。

必须比较：

- 使用当前 app-server runtime 已有边界的 adapter。
- 在 `in_process.rs` 加最窄中性 hook。
- 放弃本轮迁移并回到 design 的条件。

必须禁止：

- 恢复旧 `open_extra_jsonrpc_connection` / `ExtraJsonRpcConnectionFactory`。
- 重写 `rust-v0.136.0` runtime loop。
- 搬运旧 extra-connection commit。

输出：

- 选定 bridge 形态。
- 允许修改的文件清单。
- 明确的“不改文件/不改结构”清单。
- 针对 `rust-v0.136.0` 的风险说明。

### `04-minimal-app-server-adapter.md`

目标：按 `03` 的结论实现最小 app-server adapter。

边界：

- 只能使用 `03` 批准的 hook。
- GUI 专属逻辑进入 fork-only 文件，例如 `gui_host.rs` / `gui_transport.rs`。
- `in_process.rs` 只能保留中性 hook，不出现 GUI、WebSocket、Origin、token、allowlist、browser 等概念。

预期文件由 `03` 决定，不能在本 roadmap 中提前锁死。

停止条件：

- 如果实现需要重构 current runtime/projection fanout，停止。

### `05-app-server-client-facade.md`

目标：把 launch URL 暴露给 TUI。

边界：

- `codex-rs/app-server-client/src/gui.rs` 承担 GUI facade。
- `codex-rs/app-server-client/src/lib.rs` 只做最小 wiring / re-export / construction / drop ordering。
- remote client 返回 unsupported，不尝试远程 GUI。

预期类型：

- `GuiLaunchUrl`
- `GuiLaunchError`
- `AppServerClientGuiExt`

### `06-tui-gui-command.md`

目标：新增 `/gui` TUI 入口。

边界：

- TUI 只调用 app-server-client facade。
- TUI 只显示 URL 或错误。
- TUI 不持有 GUI host。
- TUI 不转发 JSON-RPC。
- TUI 不直接依赖 `codex-app-server` 或 `codex-gui-host`。

首版行为：

- 使用 primary thread。
- 不自动打开浏览器。
- 不实现 `/gui --open`、`/gui --current`、`/gui <threadId>`。

### `07-frontend-handshake-store-verification.md`

目标：核对当前 `codex-gui` 已迁入代码是否符合 design。

必须保护当前分支已有差异：

- `codex-gui/pnpm-workspace.yaml`
- `codex-gui/src/App.tsx`
- `codex-gui/src/features/guiHost/guiHostClient.ts`

边界：

- `guiHostClient.ts` 保持 store-free。
- Redux dispatch 留在 `App.tsx` 或 React boundary。
- 只做 handshake / attach / event MVP。
- 不做 projection viewer。

### `08-packaging-e2e-verification.md`

目标：完成 prod asset、npm package root、端到端验收。

验收路径：

```text
TUI /gui
  -> local URL displayed
  -> browser opens GUI host page
  -> same-origin /ws
  -> gui/authenticate
  -> initialize
  -> thread/projection/attach
  -> thread/projection/event
```

边界：

- 不引入 LAN/mobile/public relay。
- 不新增 browser control。
- 不新增 user turn / approval / tool 调用。

## File Boundary Principles

### Fork-only / low-risk files

优先把新逻辑放在这些位置：

- `codex-rs/gui-host/**`
- `codex-rs/app-server/src/gui_host.rs`
- `codex-rs/app-server/src/gui_transport.rs`
- `codex-rs/app-server-client/src/gui.rs`
- `codex-rs/tui/src/app/gui.rs`

### High-risk current `rust-v0.136.0` files

这些文件只能做最小 hook，不做重构：

- `codex-rs/app-server/src/in_process.rs`
- `codex-rs/app-server/src/message_processor.rs`
- `codex-rs/app-server/src/outgoing_message.rs`
- `codex-rs/app-server/src/thread_state.rs`
- `codex-rs/app-server/src/request_processors/thread_lifecycle.rs`
- `codex-rs/app-server/src/request_processors/thread_processor.rs`
- `codex-rs/app-server/src/projection_fanout.rs`
- `codex-rs/app-server/src/thread_projection*.rs`
- `codex-rs/app-server-client/src/lib.rs`
- central TUI files such as `codex-rs/tui/src/app.rs`

如果后续计划需要在这些文件中超过最小 hook，必须先写风险说明并得到确认。

## Acceptance Gates

### Roadmap gate

- source-of-truth design 链完整。
- 旧 plan 状态明确：不可直接执行。
- `rust-v0.136.0` 不重构约束明确。
- 后续 plan 拆分和 gate 明确。

### Migration gate

后续所有 `01+` 计划必须满足：

- 先读本文和对应 design。
- 先读当前源码。
- 明确哪些旧设计决策保留、哪些必须重审。
- 明确不改哪些 current `rust-v0.136.0` 结构。
- 明确最窄验证命令。
- 不在未经确认的情况下扩大到下一份计划。

### MVP gate

最终 MVP 成立时必须满足：

- `/gui` 在 in-process TUI session 中显示真实本机 URL。
- 浏览器打开 URL 后连接 same-origin `/ws`。
- `gui/authenticate` 成功后才进入 app-server 侧 bridge。
- `gui/authenticate` 失败不会创建 app-server state。
- browser `initialize` 获得真实响应。
- browser `thread/projection/attach` 获得真实响应。
- browser 收到至少一个真实 `thread/projection/event`。
- 非 allowlisted browser request 不进入 app-server processor。
- 非 allowlisted server notification 不发送到 browser。
- browser close / refresh / backend error / session shutdown 会清理对应 bridge state。
- 主 TUI in-process connection 行为保持不变。
- `rust-v0.136.0` app-server/runtime/projection 结构没有被 GUI host 重构。

## Verification Strategy

本文是文档 roadmap，验证限于文档边界：

- 检查 source-of-truth 文件存在。
- 检查旧 plan 不再被描述为可执行。
- 检查 roadmap 明确禁止重构 `rust-v0.136.0` 代码。

后续 `01+` implementation plan 必须各自写明最窄验证命令。默认规则：

- Rust 代码改完后在 `codex-rs` 运行 `just fmt`。
- Rust 测试用 `just test -p <project>`，不要直接运行 `cargo test`。
- 较大 Rust 改动 finalize 前按 crate 运行 `just fix -p <project>`。
- 不主动本地跑 Bazel、Bazel lock、remote test、CI matrix。
- TUI 可见 UI 变化必须有 `insta` snapshot 覆盖。
- Frontend transport/store 变化运行对应 `codex-gui` Vitest / Browser Mode 测试。
- app-server API shape 如有变化，按 app-server protocol 规则更新 schema 并运行 `just test -p codex-app-server-protocol`。

## Self-Review Checklist

- [ ] 本文没有把旧 extra-connection commit 序列当作当前执行路径。
- [ ] 本文没有要求重构 `rust-v0.136.0` app-server/runtime/projection 代码。
- [ ] 本文把 bridge 形态放在单独 decision gate 中。
- [ ] 本文保留了 GUI host / projection 的核心设计决策。
- [ ] 本文明确旧 `01` / `02` plan 需要重写后才能执行。
- [ ] 本文没有扩大到具体 Rust patch 或测试代码。
