# Codex GUI TUI Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标：** 添加最小化的 `/gui` TUI 命令：向当前 app-server session 请求 GUI launch URL，并把结果打印到 transcript。

**架构：** TUI 只负责 slash command dispatch 和用户可见消息。`codex-app-server` 拥有 GUI host 生命周期和 transport wiring；`codex-app-server-client` 通过 `AppServerClientGuiExt` extension trait 暴露 launch URL API。In-process 会话返回真实 URL；remote 会话返回 `GuiLaunchError::Unsupported`。TUI 不实例化 `GuiHost`，不持有 `GuiHostHandle`，不消费 raw backend handle，也不转发 GUI JSON-RPC traffic。

**技术栈：** Rust 2024, codex-tui, codex-app-server-client.

---

Source spec: `docs/superpowers/specs/2026-05-11-codex-gui-host-redesign.md`.
Bridge plan: `docs/superpowers/plans/2026-05-11-gui-host/02-app-server-bridge.md`.
Prerequisite plan: `docs/superpowers/plans/2026-05-11-gui-host/06-in-process-gui-launch.md` (must be merged so `AppServerClientGuiExt` is available).

## 硬约束

- 不给 `codex-tui` 添加 `codex-gui-host` 依赖。
- 不在 TUI 中导入 `GuiHost`、`GuiHostHandle`、`GuiHostConfig` 或 `GuiHostMode`。
- 不给 `App` 添加 `gui_host`、`gui_backend` 或类似 GUI runtime ownership 字段。
- 不在 TUI 中暴露或消费 `GuiBackendHandle`。
- 本计划不修改 `codex-rs/app-server/src/in_process.rs`。
- 不给 `codex-tui` 添加直接 `codex-app-server` 依赖。
- TUI 必须能处理三类返回：happy path（真实本机 URL，in-process 默认路径）、`GuiLaunchError::Unsupported`（remote 会话）、`GuiLaunchError::Transport(_)`（IO 错误）。
- TUI 不得缓存 `GuiLaunchUrl`；每次 `/gui` 都重新向 client 请求。

## 文件结构

- Modify: `codex-rs/tui/src/app_event.rs`
  - 添加 `AppEvent::OpenGui`。
- Modify: `codex-rs/tui/src/slash_command.rs`
  - 添加可见的 `/gui` command metadata。
- Modify: `codex-rs/tui/src/chatwidget/slash_dispatch.rs`
  - 把 `/gui` dispatch 到 `AppEvent::OpenGui`。
- Create: `codex-rs/tui/src/app/gui.rs`
  - 实现 `App::open_gui(&mut self, app_server: &AppServerSession)`。
  - 通过 `AppServerSession` 请求 launch URL。
  - 渲染 URL、unsupported、not-ready 和 error 消息。
- Modify: `codex-rs/tui/src/app.rs`
  - 声明 `mod gui;`。
- Modify: `codex-rs/tui/src/app/event_dispatch.rs`
  - 处理 `AppEvent::OpenGui`，调用 `self.open_gui(app_server).await`。
- Modify: `codex-rs/tui/src/app_server_session.rs`
  - 为 `codex_app_server_client::AppServerClient::gui_launch_url` 添加小 wrapper。
- Test: `codex-rs/tui/src/slash_command.rs`
- Test: `codex-rs/tui/src/chatwidget/tests/slash_commands.rs`
- Test: `codex-rs/tui/src/app/gui.rs`

预期不修改 `codex-rs/tui/Cargo.toml`。`codex-tui` 已经依赖 `codex-app-server-client`；它不能新增 `codex-gui-host` 或 `codex-app-server` 依赖。

## Task 8: 注册并 Dispatch `/gui`

**Files:**
- Modify: `codex-rs/tui/src/app_event.rs`
- Modify: `codex-rs/tui/src/slash_command.rs`
- Modify: `codex-rs/tui/src/chatwidget/slash_dispatch.rs`
- Test: `codex-rs/tui/src/slash_command.rs`
- Test: `codex-rs/tui/src/chatwidget/tests/slash_commands.rs`

- [ ] **Step 1: 写失败测试**

添加到 `codex-rs/tui/src/slash_command.rs` 现有 `#[cfg(test)] mod tests`：

```rust
#[test]
fn gui_command_is_visible_and_available() {
    assert_eq!(SlashCommand::from_str("gui"), Ok(SlashCommand::Gui));
    assert_eq!(SlashCommand::Gui.command(), "gui");
    assert_eq!(
        SlashCommand::Gui.description(),
        "open GUI for the primary thread"
    );
    assert!(SlashCommand::Gui.available_during_task());
    assert!(!SlashCommand::Gui.supports_inline_args());
}
```

添加到 `codex-rs/tui/src/chatwidget/tests/slash_commands.rs`：

```rust
#[tokio::test]
async fn gui_command_emits_open_gui_event() {
    let (mut chat, mut rx, _op_rx) = make_chatwidget_manual(/*model_override*/ None).await;

    chat.dispatch_command(SlashCommand::Gui);

    assert_matches!(rx.try_recv(), Ok(AppEvent::OpenGui));
}
```

- [ ] **Step 2: 运行测试确认失败**

在 `codex-rs` 目录运行：

```bash
cargo test -p codex-tui -- gui_command_
```

预期失败包含：

```text
no variant or associated item named `Gui` found for enum `SlashCommand`
no variant or associated item named `OpenGui` found for enum `AppEvent`
```

- [ ] **Step 3: 添加 `AppEvent::OpenGui`**

在 `codex-rs/tui/src/app_event.rs` 中，放在其他 app-level open action 附近：

```rust
    /// Request a browser launch URL for the primary thread GUI.
    OpenGui,
```

- [ ] **Step 4: 添加 slash-command metadata**

在 `codex-rs/tui/src/slash_command.rs` 中，把 `Gui` 加到 `SlashCommand`，放在其他用户可见 navigation/status 命令附近：

```rust
    Gui,
```

添加 description arm：

```rust
            SlashCommand::Gui => "open GUI for the primary thread",
```

让 `/gui` 在任务运行中仍可用，把它加入 `available_during_task` 的 true arm：

```rust
            | SlashCommand::Gui
```

不要把 `SlashCommand::Gui` 加入 `supports_inline_args`；`/gui` 不接受 inline args。

- [ ] **Step 5: 从 `ChatWidget` dispatch `/gui`**

在 `codex-rs/tui/src/chatwidget/slash_dispatch.rs` 中添加 match arm：

```rust
            SlashCommand::Gui => {
                self.app_event_tx.send(AppEvent::OpenGui);
            }
```

- [ ] **Step 6: 运行测试确认通过**

在 `codex-rs` 目录运行：

```bash
cargo test -p codex-tui -- gui_command_
```

预期：

```text
test slash_command::tests::gui_command_is_visible_and_available ... ok
test chatwidget::tests::slash_commands::gui_command_emits_open_gui_event ... ok
```

- [ ] **Step 7: Commit**

```bash
git add codex-rs/tui/src/app_event.rs codex-rs/tui/src/slash_command.rs codex-rs/tui/src/chatwidget/slash_dispatch.rs codex-rs/tui/src/chatwidget/tests/slash_commands.rs
git commit -m "feat(tui): register GUI slash command"
```

## Task 9: 通过 App-Server-Client 请求 Launch URL

**Files:**
- Create: `codex-rs/tui/src/app/gui.rs`
- Modify: `codex-rs/tui/src/app.rs`
- Modify: `codex-rs/tui/src/app/event_dispatch.rs`
- Modify: `codex-rs/tui/src/app_server_session.rs`
- Test: `codex-rs/tui/src/app/gui.rs`

- [ ] **Step 1: 写 focused presentation tests**

先创建 `codex-rs/tui/src/app/gui.rs`，只放测试：

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use codex_app_server_client::GuiLaunchError;
    use codex_app_server_client::GuiLaunchUrl;
    use pretty_assertions::assert_eq;

    #[test]
    fn launch_url_result_renders_url_message() {
        let message = launch_result_message(Ok(GuiLaunchUrl {
            url: "http://127.0.0.1:4321/?threadId=thread-a#token=secret".to_string(),
        }));

        assert_eq!(
            message,
            GuiLaunchMessage::Info(
                "GUI ready:\nhttp://127.0.0.1:4321/?threadId=thread-a#token=secret\nOpen this URL in a browser on this machine.".to_string()
            )
        );
    }

    #[test]
    fn launch_url_result_renders_unsupported_message() {
        let message = launch_result_message(Err(GuiLaunchError::Unsupported));

        assert_eq!(
            message,
            GuiLaunchMessage::Info(
                "GUI is not available for this app-server session yet.".to_string()
            )
        );
    }

    #[test]
    fn launch_url_result_renders_transport_error() {
        let message = launch_result_message(Err(GuiLaunchError::Transport(
            std::io::Error::new(std::io::ErrorKind::BrokenPipe, "worker stopped"),
        )));

        assert_eq!(
            message,
            GuiLaunchMessage::Error("Failed to open GUI: worker stopped".to_string())
        );
    }
}
```

这些测试只覆盖 TUI 如何渲染 app-server-client 的结果。具体 session 是否能产生 URL，或返回 `Unsupported`，由 `02-app-server-bridge.md` 的 app-server-client 测试负责。

- [ ] **Step 2: 运行测试确认失败**

在 `codex-rs` 目录运行：

```bash
cargo test -p codex-tui -- launch_url_result_
```

预期失败包含缺少 `GuiLaunchUrl`、`GuiLaunchError`、`GuiLaunchMessage` 和 `launch_result_message`。其中 `GuiLaunchUrl` / `GuiLaunchError` 需要先由 `06-in-process-gui-launch.md` Task 5 提供。

- [ ] **Step 3: 添加 app-server session wrapper**

在 `codex-rs/tui/src/app_server_session.rs` 中 import launch types 和 extension trait：

```rust
use codex_app_server_client::AppServerClientGuiExt;
use codex_app_server_client::GuiLaunchError;
use codex_app_server_client::GuiLaunchUrl;
```

在 `impl AppServerSession` 中添加：

```rust
    pub(crate) async fn gui_launch_url(
        &self,
        primary_thread_id: ThreadId,
    ) -> Result<GuiLaunchUrl, GuiLaunchError> {
        let thread_id = primary_thread_id.to_string();
        match &self.client {
            AppServerClient::InProcess(client) => {
                client.gui_launch_url(&thread_id).await
            }
            AppServerClient::Remote(client) => {
                client.gui_launch_url(&thread_id).await
            }
        }
    }
```

Matching on `&self.client` follows the existing `thread_params_mode` pattern at `codex-rs/tui/src/app_server_session.rs:418`. `AppServerClientGuiExt` must be in scope at call sites because `gui_launch_url` is not an inherent method — it is the trait method.

这是 TUI 面向 GUI 的唯一 app-server-client API。不要添加暴露 raw backend handle 的方法。

- [ ] **Step 4: 实现 `app/gui.rs`**

把 `codex-rs/tui/src/app/gui.rs` 的 test-only 内容替换为：

```rust
use super::*;
use crate::app_server_session::AppServerSession;
use codex_app_server_client::GuiLaunchError;
use codex_app_server_client::GuiLaunchUrl;

#[derive(Debug, PartialEq, Eq)]
enum GuiLaunchMessage {
    Info(String),
    Error(String),
}

fn launch_result_message(result: Result<GuiLaunchUrl, GuiLaunchError>) -> GuiLaunchMessage {
    match result {
        Ok(launch) => GuiLaunchMessage::Info(format!(
            "GUI ready:\n{}\nOpen this URL in a browser on this machine.",
            launch.url
        )),
        Err(GuiLaunchError::Unsupported) => GuiLaunchMessage::Info(
            "GUI is not available for this app-server session yet.".to_string(),
        ),
        Err(GuiLaunchError::Transport(err)) => {
            GuiLaunchMessage::Error(format!("Failed to open GUI: {err}"))
        }
    }
}

impl App {
    pub(crate) async fn open_gui(&mut self, app_server: &AppServerSession) {
        let Some(primary_thread_id) = self.primary_thread_id else {
            self.chat_widget.add_info_message(
                "Current session is not ready to open GUI.".to_string(),
                /*hint*/ None,
            );
            return;
        };

        match launch_result_message(app_server.gui_launch_url(primary_thread_id).await) {
            GuiLaunchMessage::Info(message) => {
                self.chat_widget.add_info_message(message, /*hint*/ None);
            }
            GuiLaunchMessage::Error(message) => {
                self.chat_widget.add_error_message(message);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use pretty_assertions::assert_eq;

    #[test]
    fn launch_url_result_renders_url_message() {
        let message = launch_result_message(Ok(GuiLaunchUrl {
            url: "http://127.0.0.1:4321/?threadId=thread-a#token=secret".to_string(),
        }));

        assert_eq!(
            message,
            GuiLaunchMessage::Info(
                "GUI ready:\nhttp://127.0.0.1:4321/?threadId=thread-a#token=secret\nOpen this URL in a browser on this machine.".to_string()
            )
        );
    }

    #[test]
    fn launch_url_result_renders_unsupported_message() {
        let message = launch_result_message(Err(GuiLaunchError::Unsupported));

        assert_eq!(
            message,
            GuiLaunchMessage::Info(
                "GUI is not available for this app-server session yet.".to_string()
            )
        );
    }

    #[test]
    fn launch_url_result_renders_transport_error() {
        let message = launch_result_message(Err(GuiLaunchError::Transport(
            std::io::Error::new(std::io::ErrorKind::BrokenPipe, "worker stopped"),
        )));

        assert_eq!(
            message,
            GuiLaunchMessage::Error("Failed to open GUI: worker stopped".to_string())
        );
    }
}
```

`launch_result_message` 是刻意保留的小型 presentation boundary：这样 TUI messaging 可以用纯 unit test 覆盖，而不需要在 `codex-tui` 测试里启动 app-server。不要把 `GuiLaunchUrl` 存到 `App`；每次 `/gui` 都重新向 app-server-client 请求当前 launch URL。

- [ ] **Step 5: 声明 module**

在 `codex-rs/tui/src/app.rs` 的其他 `mod` 附近添加：

```rust
mod gui;
```

- [ ] **Step 6: 处理 `AppEvent::OpenGui`**

在 `codex-rs/tui/src/app/event_dispatch.rs` 中添加 event arm：

```rust
            AppEvent::OpenGui => {
                self.open_gui(app_server).await;
            }
```

这个 event handler 必须使用现有 app event dispatch 中已经传入的 `app_server: &mut AppServerSession`。不要通过 `AppEvent` 传递 GUI backend handle。

- [ ] **Step 7: 运行 focused tests**

在 `codex-rs` 目录运行：

```bash
cargo test -p codex-tui -- launch_url_result_
```

预期：

```text
test app::gui::tests::launch_url_result_renders_url_message ... ok
test app::gui::tests::launch_url_result_renders_unsupported_message ... ok
test app::gui::tests::launch_url_result_renders_transport_error ... ok
```

- [ ] **Step 8: 运行 command path tests**

在 `codex-rs` 目录运行：

```bash
cargo test -p codex-tui -- gui_command_
```

预期：两个测试都通过。

- [ ] **Step 9: Commit**

```bash
git add codex-rs/tui/src/app/gui.rs codex-rs/tui/src/app.rs codex-rs/tui/src/app/event_dispatch.rs codex-rs/tui/src/app_server_session.rs
git commit -m "feat(tui): request GUI launch URL from app server"
```

## Task 10: 验证 TUI Dependency Boundaries

**Files:**
- Verify: `codex-rs/tui/Cargo.toml`
- Verify: `codex-rs/tui/BUILD.bazel`
- Verify: `codex-rs/tui/src`

- [ ] **Step 1: 检查 TUI 不依赖 GUI host 或 app-server**

在 repo root 运行：

```bash
rg -n "codex-gui-host|codex_gui_host|\\bGuiHost\\b|GuiHostHandle|GuiBackendHandle|codex-app-server\\s*=|\\bcodex_app_server::" codex-rs/tui
```

预期：没有匹配。命名空间 `codex_app_server_client::` 是合法的（现有依赖），所以用 `\bcodex_app_server::` 精确排除根 crate 的路径。

- [ ] **Step 2: 格式化并 lint**

在 `codex-rs` 目录运行：

```bash
just fmt
just fix -p codex-tui
```

预期：格式化完成，scoped lint fixes 被应用，或没有需要修改的内容。

- [ ] **Step 3: 运行 TUI tests**

在 `codex-rs` 目录运行（每个 `cargo test` 只传一个 filter，避免依赖 libtest 的多 filter OR 行为）：

```bash
cargo test -p codex-tui -- gui_command_
cargo test -p codex-tui -- launch_url_result_
```

预期：两个命令都退出 0；所有 `/gui` focused tests 通过。

- [ ] **Step 4: Commit verification fixes**

如果 `just fmt` 或 `just fix -p codex-tui` 修改了文件，提交：

```bash
git add codex-rs/tui
git commit -m "chore(tui): format GUI launch entry"
```

如果没有 formatting 或 lint 变更，不创建空 commit。

## Acceptance Gates

- `/gui` 已注册、可见，并且在 task running 时可用。
- `/gui` 发出 `AppEvent::OpenGui`。
- `AppEvent::OpenGui` 使用 primary thread ID 向 `AppServerSession` 请求 launch URL。
- 如果没有 primary thread，TUI 打印：`Current session is not ready to open GUI.`
- 在默认的 in-process 会话（CLI TUI 路径）下，`gui_launch_url` 返回真实本机 URL（不是 `Unsupported`），TUI 打印该 URL。
- 在 remote 会话下 (`AppServerClient::Remote`)，`gui_launch_url` 返回 `GuiLaunchError::Unsupported`，TUI 打印：`GUI is not available for this app-server session yet.`
- 如果 `gui_launch_url` 返回 transport error，TUI 打印 `Failed to open GUI: ...`。
- `codex-tui` 没有直接 `codex-app-server` 依赖。
- `codex-tui` 没有 `codex-gui-host` 依赖。
- `codex-tui` 不实例化 `GuiHost`。
- `codex-tui` 不持有 `GuiHostHandle` 或 `GuiBackendHandle`。
- 没有计划步骤修改 `codex-rs/app-server/src/in_process.rs`。

## Self-Review Checklist

- 本计划匹配方案 B：app-server 拥有 GUI host 生命周期；TUI 只请求 launch URL。
- 没有步骤要求 TUI 消费 raw backend handle。
- 没有步骤给 `App` 添加 GUI host runtime 字段。
- 没有步骤给 TUI 添加 `codex-gui-host` 依赖。
- 测试命令限定在 `codex-tui`。
- App-server bridge 行为仍由 `02-app-server-bridge.md` 负责。
- `AppServerClientGuiExt` 在 session wrapper 里 import 一次并通过 `AppServerClient` match dispatch 到底层实现。
