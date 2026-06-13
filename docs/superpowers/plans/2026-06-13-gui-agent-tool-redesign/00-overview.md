# GUI Agent Tool Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在回退后的 `dev` 上重做 `launch_gui` agent tool，使其覆盖 Codex App stdio subprocess，并保持 TUI `/gui` 对话打开 GUI 的能力。

**Architecture:** 采用 goal extension 式分层：`ext/gui` 提供 tool，app-server 提供 `GuiLaunchService`，GUI browser connection 通过 app-server-local connection bridge 进入同一套 `MessageProcessor` / outgoing routing。实现优先落在当前 `dev` 相对 `rust-v0.139.0` 的 GUI/app-server 增量层；必须碰原始文件时只加薄 hook。

**Tech Stack:** Rust 2024, Cargo, Bazel lock, codex-extension-api, codex-app-server, codex-app-server-client, codex-gui-host, codex-tui, app-server JSON-RPC, tokio.

---

## Source Of Truth

- Design: `docs/superpowers/specs/2026-06-13-gui-agent-tool-redesign-design.md`
- Positive references:
  - `codex-rs/ext/goal/src/extension.rs`
  - `codex-rs/ext/goal/src/tool.rs`
  - `codex-rs/app-server/src/extensions.rs`
  - `codex-rs/app-server/src/message_processor.rs`
  - `codex-rs/app-server/src/gui_host.rs`
  - `codex-rs/app-server/src/gui_transport.rs`
  - `codex-rs/app-server/src/in_process_extra.rs`
  - `codex-rs/tui/src/app/gui.rs`
- Negative references only:
  - 已回退的 `codex-gui-extension`
  - 已回退的 `GuiLauncher`
  - 已回退的 `SharedGuiHostLauncher`

## Plan Set

- `01-boundary-audit.md`: 只读复核 `rust-v0.139.0..dev` 增量，锁定允许改的文件和停止条件。
- `02-local-connection-bridge.md`: 把 GUI WebSocket 所需的 extra JSON-RPC connection 能力变成 app-server-local bridge，不再依赖 `InProcessClientSender`。
- `03-gui-launch-service.md`: 在 app-server 内实现 `GuiLaunchService`，收敛 GUI host lifecycle，并准备 TUI/app-server-client 调用入口。
- `04-ext-gui-agent-tool.md`: 新增 `ext/gui`，按 goal extension 模式注册 `launch_gui` tool。
- `05-tui-and-client-convergence.md`: 让 TUI `/gui` 与 agent tool 共用同一 service，不再由 app-server-client 自己拥有 host。
- `06-focused-verification.md`: 聚焦验证、格式化、必要 lockfile/schema 处理和最终提交检查。

## Global Constraints

- 禁止运行全量测试。
- 不修改闭源 Codex App。
- 不改变 `rust-v0.139.0` 默认行为。
- 不为了本功能重构 `rust-v0.139.0` app-server 主 runtime、transport 主模型、TUI 主流程或 projection 主模型。
- 优先新增 crate/module；高频原始文件只加薄 hook。
- 不把 GUI token、Host、Origin、browser、WebSocket、allowlist 逻辑塞进 `in_process.rs` 或 app-server 主循环。
- 不让 `ext/gui` 依赖 `InProcessClientSender`、`codex-app-server-client` 或 TUI。
- 不让 TUI `/gui` 和 agent `launch_gui` 分叉成两套 host lifecycle。
- 不自动打开浏览器；只返回或展示 URLs。

## Commit Boundaries

建议每个阶段一个或多个小提交：

- audit/docs gate 可以单独提交。
- bridge source + bridge tests 单独提交。
- app-server service + app-server tests 单独提交。
- `ext/gui` crate + tool tests 单独提交。
- TUI/app-server-client convergence + focused tests 单独提交。
- lockfile、schema、format/fix 结果按实际改动和 review 需要拆分。

不要把 bridge、extension、TUI 和 lockfile 修复挤成一个提交。

## Execution Order

- [ ] **Step 1: Complete Plan 01**

Run through `01-boundary-audit.md` and stop after the allowed-files table is confirmed.

- [ ] **Step 2: Complete Plan 02**

Run through `02-local-connection-bridge.md` and stop after subprocess-style local bridge round-trip passes.

- [ ] **Step 3: Complete Plan 03**

Run through `03-gui-launch-service.md` and stop after app-server GUI launch service is usable by both tool and client-facing paths.

- [ ] **Step 4: Complete Plan 04**

Run through `04-ext-gui-agent-tool.md` and stop after `launch_gui` appears as an extension tool in eligible threads.

- [ ] **Step 5: Complete Plan 05**

Run through `05-tui-and-client-convergence.md` and stop after TUI `/gui` uses the shared app-server service.

- [ ] **Step 6: Complete Plan 06**

Run through `06-focused-verification.md` and stop with clean working tree unless the user asks not to commit final changes.

## Final Success Criteria

- Codex App stdio subprocess path can expose and execute `launch_gui`.
- TUI `/gui` still displays GUI URL lines in the conversation.
- Agent tool and TUI use the same app-server-owned GUI host lifecycle.
- Browser GUI connection enters app-server through the shared local bridge.
- No old `GuiLauncher` / `SharedGuiHostLauncher` implementation shape is restored.
- Focused tests cover extension tool, local bridge, app-server service, and TUI `/gui` regression.
