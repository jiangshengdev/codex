# Codex GUI Host Dev Adaptation Roadmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `port/lazy-proj-130` 已完成的 GUI host 方案迁移到当前 `dev`，先恢复 MVP 路径，再按当前 low-intrusion 设计压薄高频文件。

**Architecture:** `codex-gui-host` 继续作为本地浏览器 host 和安全边界；`codex-app-server` 拥有 GUI host 生命周期，并把认证后的 `/ws` 注册为 extra in-process connection；`codex-app-server-client` 只暴露 GUI launch facade；`codex-tui` 只实现 `/gui` 命令并显示本机 URL。当前 `dev` 直接采用 low-intrusion 形态：extra connection 细节下沉到 `in_process_extra.rs`，`in_process.rs` 只保留中性 thin hook，`app-server-client/src/lib.rs` 只保留最小 wiring。

**Tech Stack:** Rust 2024, tokio, axum, app-server JSON-RPC, Vite, React, Redux Toolkit, Vitest Browser Mode.

---

## Source Of Truth

- 主设计：`docs/superpowers/specs/2026-05-11-codex-gui-host-redesign.md`
- 当前 `dev` 适配设计：`docs/superpowers/specs/2026-05-30-codex-gui-host-dev-adaptation-design.md`
- low-intrusion 补充设计：
  - `docs/superpowers/specs/2026-05-13-gui-host-low-intrusion-refactor-design.md`
  - `docs/superpowers/specs/2026-05-13-gui-host-extra-open-hook-thinning-design.md`
- 历史背景：`docs/superpowers/specs/2026-05-10-codex-gui-host-design.md`

`2026-05-11-codex-gui-host-redesign.md` 替代 `2026-05-10-codex-gui-host-design.md`。`2026-05-10` 只作为背景，不作为当前实现依据。

旧分支计划和实现只作为迁移证据，不能把旧分支状态原封不动当作当前 `dev` 的执行顺序。当前 `dev` 应从一开始就采用两个 `2026-05-13` 文档确认的 thin-hook 形态，而不是先迁入重实现、再另做一次大 refactor。

## Current Dev Baseline

- `codex-gui/` 已从 `port/lazy-proj-130` 整体迁入。
- 下面 3 个文件和 `port/lazy-proj-130` 不同，是当前分支已有修改，后续不得为了追平旧分支而覆盖：
  - `codex-gui/pnpm-workspace.yaml`
  - `codex-gui/src/App.tsx`
  - `codex-gui/src/features/guiHost/guiHostClient.ts`
- 当前 `dev` 尚未包含 Rust 侧 GUI host 迁移入口：
  - `codex-rs/gui-host/**`
  - `codex-rs/app-server/src/gui_host.rs`
  - `codex-rs/app-server/src/gui_transport.rs`
  - `codex-rs/app-server/src/in_process_extra.rs`
  - `codex-rs/app-server-client/src/gui.rs`
  - `codex-rs/tui/src/app/gui.rs`
- 旧分支的 `08-projection-store-bridge` 语义已经在当前 GUI 文件中可见：`App.tsx` 将 projection attach/event payload dispatch 到 Redux，`guiHostClient.ts` 仍保持 transport client 边界。

## Historical Plan Mapping

- `00-roadmap`：旧分支总控。当前文件是它在 `dev` 上的替代 roadmap。
- `01-gui-host-crate`：host shell。迁移时优先按旧分支代码和当前 crate 规范恢复 `codex-gui-host`。
- `06-in-process-gui-launch`：extra in-process connection 基础。当前 `dev` 不应把实现细节堆在 `in_process.rs`，应直接拆到 `in_process_extra.rs`。
- `02-app-server-bridge`：`GuiHostManager` + `gui_transport`。当前仍保留这个职责边界。
- `03-tui-entry`：`/gui` TUI 入口。当前仍只显示 URL，不自动打开浏览器。
- `04-frontend-handshake`：浏览器握手。当前 GUI 文件已有相关代码，后续只做核对和必要适配。
- `05-packaging-verification`：打包与最终验收。当前仍应作为 MVP 最后 gate。
- `07-low-intrusion-refactor`：旧分支的后置压薄。当前 `dev` 改为前置设计约束，不等实现后再大搬迁。
- `08-projection-store-bridge`：projection attach/event 接入 Redux。当前 GUI 文件已经带入，后续计划只验证并保护边界。
- `09+`：detach、viewer、更多 lifecycle。当前 MVP 不纳入。

## Target Plan Set

本次只创建 `00-roadmap.md`。以下文件名是后续拆分建议，只有在明确授权后才分别编写。

- `01-gui-host-crate.md`：迁入 `codex-rs/gui-host/**`，恢复 host、token、URL、asset、WebSocket auth、allowlist、backend trait。
- `02-in-process-extra-connection.md`：在 `codex-app-server` 中建立 GUI-agnostic extra connection API 和 `in_process_extra.rs`，让 `in_process.rs` 只保留 thin hook。
- `03-app-server-bridge.md`：新增 `GuiHostManager` 和 `gui_transport.rs`，把认证后的 GUI WebSocket 接到 extra connection。
- `04-app-server-client-facade.md`：新增 `app-server-client/src/gui.rs`，在 `lib.rs` 保留最小 wiring，提供 `gui_launch_url` facade。
- `05-tui-gui-command.md`：实现 `/gui` slash command、事件分发、URL 展示和 unsupported/error UI。
- `06-frontend-handshake-and-store.md`：核对当前 GUI handshake、projection attach/event Redux dispatch、测试覆盖，并保护 3 个当前分支特有文件不被旧分支覆盖。
- `07-packaging-verification.md`：完成静态资源打包、npm packaging 入口和端到端验收。
- `08-post-mvp-lifecycle.md`：后续 detach/recovery/viewer 入口，仅在 MVP 验收后再设计。

## Execution Order

```text
01 -> 02 -> 03 -> 04 -> 05 -> 06 -> 07
```

执行顺序解释：

- `01` 先提供 browser host shell，因为后续 app-server bridge 依赖 `codex_gui_host::GuiBackend`、launch token、URL 生成和 `/ws` 安全边界。
- `02` 先做 GUI-agnostic extra connection，而不是先写 `GuiHostManager`，避免 `gui_transport.rs` 倒逼 `in_process.rs` 扩散 GUI 语义。
- `03` 只在 `codex-app-server` 内实现 lifecycle 和 bridge，不让 `codex-gui-host` 反向依赖 app-server。
- `04` 再把 launch URL 暴露到 client facade，保持 `codex-app-server-client/src/lib.rs` 变动可控。
- `05` 最后接 TUI `/gui`，TUI 只调用 facade，不拥有 host，也不转发 JSON-RPC traffic。
- `06` 是当前 GUI 已迁入代码的核对和补测，不覆盖当前 3 个已改文件。
- `07` 统一验收 Rust、frontend、packaging 和端到端路径。

`08-post-mvp-lifecycle.md` 不在 MVP 顺序内。detach、projection viewer、更多 recovery 行为必须在 MVP 验收后单独规划。

## File Boundary

### Rust Host Shell

- Create: `codex-rs/gui-host/Cargo.toml`
- Create: `codex-rs/gui-host/BUILD.bazel`
- Create: `codex-rs/gui-host/src/lib.rs`
- Create: `codex-rs/gui-host/src/token.rs`
- Create: `codex-rs/gui-host/src/config.rs`
- Create: `codex-rs/gui-host/src/url.rs`
- Create: `codex-rs/gui-host/src/filter.rs`
- Create: `codex-rs/gui-host/src/backend.rs`
- Create: `codex-rs/gui-host/src/host.rs`
- Create: `codex-rs/gui-host/src/assets.rs`
- Create: `codex-rs/gui-host/src/ws.rs`
- Modify: `codex-rs/Cargo.toml`
- Modify: `codex-rs/Cargo.lock` only if Rust dependency changes require it
- Modify: `codex-rs/WORKSPACE.bazel` / `codex-rs/MODULE.bazel.lock` only if the crate/dependency wiring requires the repo's Bazel lock flow

### In-Process Extra Connection

- Create: `codex-rs/app-server/src/in_process_extra.rs`
- Modify: `codex-rs/app-server/src/in_process.rs`
- Modify: `codex-rs/app-server/src/lib.rs`

`in_process.rs` may keep only:

- `InProcessClientSender::register_extra_connection`
- `ProcessorCommand` dispatch arms for extra open/request/notification/close
- outbound router control branch
- thread listener connection id expansion
- re-exports needed by app-server bridge

It must not contain GUI, WebSocket, Origin, token, allowlist, or browser-specific concepts.

### App-Server Bridge

- Create: `codex-rs/app-server/src/gui_host.rs`
- Create: `codex-rs/app-server/src/gui_transport.rs`
- Modify: `codex-rs/app-server/Cargo.toml`
- Modify: `codex-rs/app-server/BUILD.bazel`
- Modify: `codex-rs/app-server/src/lib.rs`

`gui_host.rs` owns lazy-start/reuse/shutdown. `gui_transport.rs` owns authenticated WebSocket to extra connection bridging.

### App-Server Client Facade

- Create: `codex-rs/app-server-client/src/gui.rs`
- Modify: `codex-rs/app-server-client/src/lib.rs`

`gui.rs` owns:

- `GuiLaunchUrl`
- `GuiLaunchError`
- `AppServerClientGuiExt`
- in-process implementation
- remote unsupported implementation

`lib.rs` only keeps module export、re-export、manager construction、shutdown/drop wiring。

### TUI Entry

- Create: `codex-rs/tui/src/app/gui.rs`
- Modify: `codex-rs/tui/src/app.rs`
- Modify: `codex-rs/tui/src/app_event.rs`
- Modify: `codex-rs/tui/src/app/event_dispatch.rs`
- Modify: `codex-rs/tui/src/app_server_session.rs`
- Modify: `codex-rs/tui/src/slash_command.rs`
- Modify: `codex-rs/tui/src/chatwidget/slash_dispatch.rs`

`codex-tui` must not add direct dependencies on `codex-app-server` or `codex-gui-host`.

### Frontend Handshake And Store

- Preserve: `codex-gui/pnpm-workspace.yaml`
- Preserve/adapt carefully: `codex-gui/src/App.tsx`
- Preserve/adapt carefully: `codex-gui/src/features/guiHost/guiHostClient.ts`
- Verify: `codex-gui/src/__tests__/App.browser.test.tsx`
- Verify: `codex-gui/src/features/projection/projectionSlice.ts`

`guiHostClient.ts` must stay store-free. Redux dispatch remains in `App.tsx` or other React boundary code, not in the transport client.

## Hard Constraints

- `/gui` 首版只显示本机 URL，不自动打开浏览器。
- `gui/authenticate` 是 GUI host 本地认证首帧，不是 app-server v2 API。
- 认证失败不得调用 `register_extra_connection`，不得在 `outbound_connections` 或 extra connection state 中留下连接。
- MVP in-process 路径不使用 `TransportEvent`，不实现外部 app-server process GUI backend。
- `codex-gui-host` 不依赖 `codex-app-server`。
- `codex-app-server` owns `GuiHostManager` 和 `GuiBackend` implementation。
- `codex-app-server-client` owns launch URL facade。
- `codex-tui` 只请求 launch URL 并显示，不转发 GUI JSON-RPC。
- 不新增 GUI 代码到 `codex-core`。
- 不修改 `CODEX_SANDBOX_NETWORK_DISABLED_ENV_VAR` 或 `CODEX_SANDBOX_ENV_VAR` 相关代码。
- 不把 `run_main_with_transport_options` 的 connection maps、outbound routing、close cleanup 复制到 `in_process.rs`。
- 不新增 `#[async_trait]` 或 `#[allow(async_fn_in_trait)]`；新 trait 使用 RPITIT 并显式 `Send` future bound。
- 不为了追平旧分支覆盖当前分支已有改动的 3 个 GUI 文件。
- 不在 MVP 中做 projection viewer、detach lifecycle、remote GUI、LAN/mobile/public relay、approval、interrupt、user turn 输入、subagent switching。

## Acceptance Gates

- `/gui` 在 in-process TUI session 中显示真实本机 URL，而不是 unsupported 文案。
- 浏览器打开 URL 后连接 same-origin `/ws`。
- `gui/authenticate` 成功后才注册 extra connection。
- `gui/authenticate` 失败以 policy close 结束，并且 app-server runtime 不创建 extra connection。
- 浏览器 `initialize` 通过现有 `MessageProcessor` raw request 路径获得真实响应。
- 浏览器 `thread/projection/attach` 获得真实响应。
- 浏览器收到至少一个真实 `thread/projection/event`。
- `guiHostClient.ts` 不导入 Redux，不直接 dispatch。
- `App.tsx` 将完整 attach response dispatch 到 `projectionAttached`，将完整 projection event notification dispatch 到 `projectionEventReceived`。
- 非 allowlisted browser request 不进入 `MessageProcessor`。
- 非 allowlisted server notification 不发送到浏览器。
- browser close、refresh、backend error、manager shutdown 都能触发 extra connection cleanup。
- 主 TUI in-process connection 的 request/notification/response 外部行为保持不变。
- `in_process.rs` 中只存在中性 hook，不出现 GUI/WebSocket/Origin/allowlist/token/browser 专有概念。
- `codex-tui` 没有直接依赖 `codex-app-server` 或 `codex-gui-host`。

## Verification Strategy

每个后续子计划必须写明自己的最窄验证命令。当前 roadmap 的全局验证原则如下：

- Rust 格式化：Rust 代码改完后在 `codex-rs` 运行 `just fmt`。
- Rust lint：较大 Rust 改动 finalize 前，按 crate 运行 `just fix -p <project>`。
- Rust 测试：按变更 crate 运行 `just test -p <project>`，不要直接运行 `cargo test`。
- App-server protocol shape 如有变化，按 app-server API 规则生成 schema 并运行 `just test -p codex-app-server-protocol`。
- TUI 可见 UI 文案或渲染变化必须有 `insta` snapshot 覆盖，并按 repo 流程 review/accept snapshot。
- Frontend transport/store 改动运行对应 `codex-gui` Vitest / Browser Mode 测试。
- Packaging plan 再统一做端到端：TUI `/gui` -> browser `/ws` -> authenticate -> initialize -> projection attach -> projection event。

## Self-Review Checklist

- [ ] 后续 `01+` 计划必须先读本 roadmap 和对应设计文档。
- [ ] 后续计划不得把旧分支代码状态当作唯一依据，必须检查当前 `dev` 的真实代码形状。
- [ ] 后续计划不得覆盖当前分支已有差异的 3 个 GUI 文件。
- [ ] 后续计划必须把 low-intrusion 当作初始设计，不写成后置大 refactor。
- [ ] 后续计划必须保持 `TransportEvent` 只作语义参考，不进入 MVP in-process 路径。
- [ ] 后续计划必须保持 `/gui` 显示 URL，不自动打开浏览器。
- [ ] 后续计划必须明确测试命令和 expected result。
- [ ] 后续计划必须保持每次只写被明确授权的那一份计划文件。
