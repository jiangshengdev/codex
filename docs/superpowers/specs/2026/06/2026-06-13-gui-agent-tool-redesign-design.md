# GUI Agent Tool 重做设计

日期：2026-06-13

状态：设计草案。本文替代已回退的 GUI launch extension 设计，不复用其实现形态；但旧设计中与本文不冲突的资产和判断可以保留。

## 背景

今天已回退 GUI launch extension 系列提交。回退后的结论是：旧方案只覆盖 in-process app-server client 路径，没有在 Codex App stdio subprocess 路径下启用，所以不能作为当前实现基线。

新设计必须从回退后的 `dev` 重新出发，并参考能够在 subprocess 路径工作的 goal extension 分层模式。goal extension 的关键点不是把所有逻辑堆进 app-server，而是：

- extension crate 负责 agent tool 的 schema、可见性和执行语义。
- app-server 在本进程安装 extension。
- app-server 通过服务对象、事件 sink、runtime handle 等 host capability 给 extension 注入能力。
- tool 在 app-server subprocess 内执行，因此不依赖闭源 Codex App 改造。

## 基线与兼容约束

实现基线按 `rust-v0.139.0` 管理：

- 不重构 `rust-v0.139.0` 原始代码。
- 不改变 `rust-v0.139.0` 的默认行为。
- 优先只调整当前 `dev` 相对 `rust-v0.139.0` 的 GUI / app-server 增量层。
- 允许通过新增薄 hook、薄 adapter、旁路模块扩展 `rust-v0.139.0` 行为。
- 如果必须修改 `rust-v0.139.0` 原始文件，优先新增小入口、小字段、小分支；保持 diff 局部、可对比、易在后续 tag 合并时重放。
- 不为了 GUI agent tool 重排 app-server 主 runtime、TUI 主流程、thread projection 主模型或 transport 主模型。

旧设计并非全部不可取。下列资产在不冲突时应保留：

- `codex-gui-host` crate。
- 现有 `/gui` slash command 与 TUI 对话展示路径。
- 现有 `codex-rs/app-server/src/gui_host.rs` 的 GUI host 生命周期思路。
- 现有 `codex-rs/app-server/src/gui_transport.rs` 的 browser WebSocket 到 app-server JSON-RPC 的桥接思路。
- 现有 `in_process_extra` / extra connection 的低侵入 hook 思路。

下列已回退概念只作为反例，不作为现状参考：

- `codex-gui-extension` 的旧实现形态。
- `GuiLauncher`。
- `SharedGuiHostLauncher`。
- 将 GUI launch 能力绑死在 `InProcessClientSender` / app-server-client in-process worker 的设计。

## 目标

- 新增 `launch_gui` agent tool，覆盖 Codex App stdio subprocess app-server 路径。
- 保持 TUI 中 `/gui` 对话打开 GUI 的能力。
- 让 agent tool 和 TUI `/gui` 共用同一套 GUI launch service、host 生命周期和本地连接桥。
- 返回结构化 GUI URLs，不自动打开浏览器。
- 保持 GUI host 的认证、Host 校验、allowlist 和 launch token 安全边界。
- 让后续合并其他 tag 到 `dev` 时冲突面集中在 fork 增量模块或薄 hook 上。

## 非目标

- 不修改闭源 Codex App。
- 不把 browser GUI traffic 通过 TUI 转发。
- 不新增第二套 app-server runtime。
- 不为 GUI agent tool 重写 app-server transport。
- 不让 agent tool 自动打开浏览器。
- 不把 `/gui` 变成模型 tool 调用的包装。
- 不复活已回退的旧 GUI extension wiring。

## 总体架构

采用与 goal extension 接近的分层：

```text
core turn tool registry
  -> ext/gui ToolContributor
  -> GuiLaunchService trait
  -> app-server GuiLaunchService implementation
  -> codex-gui-host lazy start / reuse
  -> local app-server connection bridge
  -> MessageProcessor / outgoing routing
```

### `ext/gui`

新增 `codex-rs/ext/gui` extension crate。

职责：

- 注册 `launch_gui` agent tool。
- 定义 tool schema。
- 决定 tool 是否对当前线程可见。
- 调用 `GuiLaunchService`。
- 将成功结果和错误结果转成稳定 JSON。

`ext/gui` 不负责：

- 启动 GUI host。
- 管理 WebSocket。
- 访问 `InProcessClientSender`。
- 调用 app-server client。
- 了解 subprocess / in-process 差异。

### `GuiLaunchService`

`ext/gui` 只依赖一个 host capability：

```rust
GuiLaunchService::launch_urls_for_thread(thread_id) -> Result<GuiLaunchUrls, GuiLaunchError>
```

这是 extension 与 app-server 的边界。该边界保持小而稳定，类似 goal extension 依赖 `GoalService` 和 runtime capability。

### app-server 实现

`GuiLaunchService` 的真实实现放在 `codex-app-server`。

职责：

- 持有 GUI host manager。
- lazy-start / reuse `codex-gui-host`。
- 为指定 `ThreadId` 生成 launch URLs。
- 提供 browser GUI WebSocket 接入 app-server 的本地连接桥。
- 在 app-server shutdown 时关闭 GUI host。

这样 subprocess app-server 自己拥有 GUI launch 能力，agent tool 不需要闭源 App 提供 launcher。

### 本地连接桥

当前失败点是 `GuiTransportBackend` 绑定 `InProcessClientSender.register_extra_connection`。重做后需要把“本机额外连接”抽成 app-server 侧能力，而不是 client 侧能力。

目标形态：

- GUI browser `/ws` 认证成功后，注册为 app-server 本进程内的额外 JSON-RPC connection。
- 该 connection 进入同一套 `MessageProcessor`、connection session state、outgoing routing。
- in-process TUI 和 stdio subprocess 共用同一种 app-server-local connection bridge。
- `InProcessClientSender` 只能作为旧 in-process client 的适配入口，不再是 GUI bridge 的唯一依赖。

这部分可以保留现有 `in_process_extra` 的低侵入思想，但应把能力上移成 app-server runtime 可用的本地连接 bridge。

## TUI `/gui` 路径

TUI 对话打开 GUI 仍然需要支持。

目标路径：

```text
TUI /gui
  -> app-server-client launch GUI request
  -> app-server GuiLaunchService
  -> codex-gui-host
  -> TUI transcript 展示 URLs
```

TUI `/gui` 与 agent `launch_gui` 共用同一个 `GuiLaunchService`。差异只在调用入口：

- TUI `/gui` 是用户命令，展示 URLs 给用户。
- agent `launch_gui` 是 tool call，返回结构化 JSON 给模型。

TUI 不应该单独持有 GUI host，也不应该让 agent tool 反向依赖 TUI 命令。

## Tool 行为

### 成功结果

`launch_gui` 返回结构化 JSON：

```json
{
  "urls": [
    {
      "kind": "local",
      "label": "Local",
      "url": "http://127.0.0.1:12345/?threadId=...#token=..."
    }
  ]
}
```

不自动打开浏览器。模型可以把 URL 告诉用户，或解释如何使用。

### 错误结果

错误结果结构化，至少区分三类：

- `config_error`：GUI host 配置无法解析，例如 dev/prod asset 配置错误。
- `launch_error`：GUI host 启动失败、端口监听失败、bridge 初始化失败。
- `unavailable`：当前线程、当前会话或当前 feature 状态不支持 GUI launch。

tool 不把启动失败伪装成成功，也不降级成提示用户手动运行 `/gui`。

### 可见性

tool 可见性与 `/gui` 同源：

- 当前线程必须已有有效 `ThreadId`。
- 当前 app-server 进程必须具备 GUI host 能力。
- GUI feature / profile 配置必须允许启动 host。
- 如果当前会话不支持 GUI launch，优先不暴露 tool；必须暴露时也要返回 `unavailable`。

## 文件边界

### 新增或主要调整

- `codex-rs/ext/gui/`
  - agent tool schema、executor、extension install API。
- `codex-rs/app-server/src/gui_launch_service.rs`
  - app-server 侧 `GuiLaunchService` 实现和错误映射。
- `codex-rs/app-server/src/gui_connection_bridge.rs` 或收敛后的 `in_process_extra` 扩展
  - app-server-local extra JSON-RPC connection bridge。

### 复用现有增量

- `codex-rs/gui-host/`
  - host、URL、token、WebSocket、安全边界。
- `codex-rs/app-server/src/gui_host.rs`
  - GUI host manager，可按新 service 边界调整。
- `codex-rs/app-server/src/gui_transport.rs`
  - browser WebSocket 到 app-server-local connection bridge 的适配。
- `codex-rs/tui/src/app/gui.rs`
  - `/gui` transcript 展示。
- `codex-rs/app-server-client/src/gui.rs`
  - TUI-facing facade，可改为请求 app-server service，而不是自己拥有 host。

### 薄 hook 原则

若必须修改 `rust-v0.139.0` 原始文件，目标只是挂接：

- extension install hook。
- app-server startup/shutdown hook。
- request processor 或 client facade 的最小入口。
- connection closed / outgoing routing 的最小接入点。

这些 hook 不应包含 GUI token、browser、WebSocket、Host、Origin、allowlist 等专属逻辑；专属逻辑留在 fork 增量模块。

## 数据流

### agent tool

```text
Model calls launch_gui
  -> core tool router
  -> ext/gui LaunchGuiToolExecutor
  -> GuiLaunchService::launch_urls_for_thread(thread_id)
  -> app-server GuiHostManager lazy-start / reuse
  -> return GuiLaunchUrls
  -> tool returns JSON urls[]
```

### TUI `/gui`

```text
User enters /gui
  -> TUI AppCommand::LaunchGui
  -> app-server-client GUI facade
  -> app-server GUI launch request / local service
  -> same GuiLaunchService
  -> TUI displays URL lines in transcript
```

### browser connection

```text
User opens GUI URL
  -> codex-gui-host serves page
  -> browser opens /ws
  -> GUI auth / token validation
  -> app-server-local connection bridge registers extra connection
  -> browser JSON-RPC enters MessageProcessor
  -> outgoing messages route back to browser connection
```

## 低侵入策略

本设计允许扩展 `rust-v0.139.0`，但优先采用“薄 hook + 增量模块”：

1. 新功能尽量新增 crate / module。
2. 高频 upstream 文件只加入口，不放业务逻辑。
3. 原始文件中的新增代码应可用注释或类型名清楚标识为 GUI extension hook。
4. 避免把 app-server client、transport、thread projection、outgoing routing 主路径改成 GUI-aware 状态机。
5. 如果某一步需要大面积改写原始文件，停止并回到设计讨论。

## 测试策略

禁止全量测试。只设计聚焦验证：

- `ext/gui`
  - tool schema。
  - 成功时返回 `urls[]` JSON。
  - `config_error` / `launch_error` / `unavailable` 映射。
- `app-server`
  - subprocess 风格本地 connection bridge 可以完成 initialize round-trip。
  - GUI host service lazy-start / reuse。
  - shutdown 不泄漏 host task。
- `app-server-client` / `TUI`
  - `/gui` 仍在对话中展示 URL。
  - 无 primary thread 时仍显示现有错误。
  - remote / unsupported session 给出明确错误。

## 已确认决策

- 新增 `ext/gui`，按 goal extension 模式提供 `launch_gui` tool。
- `ext/gui` 只依赖 `GuiLaunchService` 抽象。
- `GuiLaunchService` 实现在 `app-server`。
- GUI WebSocket 通过抽出的 app-server 本地连接桥进入同一套 `MessageProcessor` / outgoing routing。
- `launch_gui` 返回结构化 `urls[]`，不自动打开浏览器。
- tool 可见性与 `/gui` 同源。
- 错误结构化为 `config_error` / `launch_error` / `unavailable`。
- 测试采用三层聚焦覆盖。
- 兼容策略选择：只改当前 `dev` 相对 `rust-v0.139.0` 的 GUI / app-server 增量层；必须碰原始文件时用薄 hook。
- TUI `/gui` 和 agent `launch_gui` 共用同一个 `GuiLaunchService`。

## 停止条件

进入实施计划或实现时，出现以下情况必须停止并回到设计：

- 需要修改闭源 Codex App。
- 需要重构 `rust-v0.139.0` app-server 主 runtime。
- 需要改变 `rust-v0.139.0` 默认行为。
- `ext/gui` 需要直接依赖 `InProcessClientSender` 或 app-server-client。
- TUI `/gui` 和 agent tool 开始分叉成两套 host 生命周期。
- 本地 connection bridge 不能在 stdio subprocess app-server 内工作。
- 新增 diff 主要落在 upstream 高频原始文件，而不是新增薄模块 / hook。
