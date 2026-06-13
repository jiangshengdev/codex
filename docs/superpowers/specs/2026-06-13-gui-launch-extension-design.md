# GUI launch extension design

## 背景

当前 `/gui` 是 TUI slash command。输入层将 `SlashCommand::Gui` 转成 `AppCommand::LaunchGui`，TUI 再用当前 `primary_thread_id` 调用 app-server client 的 `launch_gui_for_thread`，最终由 in-process app-server client 持有的 `GuiHostManager` 启动或复用 GUI host，并返回当前 thread 的 GUI URLs。

`goal` 的对话入口不是 slash command，而是由 extension 暴露 Responses API tools。GUI 的对话入口也应采用 extension 方案，避免让模型伪造 `/gui` 文本或依赖 TUI 输入层。

## 目标

- 允许模型在用户明确要求时，通过对话调用打开当前 thread 的 GUI 入口。
- 使用独立 GUI extension 暴露一个窄职责 tool。
- 复用现有 GUI host 启动与 URL 生成逻辑。
- 保持初版行为与 `/gui` 一致：启动或复用 host，并返回 GUI URLs。

## 非目标

- 不自动打开系统浏览器。
- 不允许模型选择任意 `thread_id`。
- 不把 GUI launch 提升为 app-server v2 RPC。
- 不改变现有 `/gui` slash command 行为。
- 不支持 remote app-server session 的 GUI launch；初版保持现有 unsupported 语义。

## 已确认的产品边界

1. 触发边界：初版只允许显式请求。tool 描述必须要求“only when explicitly requested”，例如用户明确说“打开 GUI”、“启动 GUI”、“launch gui”。
2. 行为边界：tool 只返回 GUI URLs，不自动打开浏览器。
3. 工程落点：新增独立 `codex-gui-extension`，通过注入 `GuiLauncher` capability 复用现有 host 能力。

## 架构

新增 `codex-gui-extension` crate，模式参考 `codex-goal-extension` 的 tool contributor，但职责更窄。extension 在 thread start 时记录当前 thread 是否具备 GUI launch 能力，并在 tools 列表中暴露 `launch_gui`。

`launch_gui` 不接收 `thread_id` 参数。tool executor 从当前 thread runtime 获取 `ThreadId`，再调用 host 注入的 launcher：

```rust
trait GuiLauncher {
    fn launch_gui_for_thread(
        &self,
        thread_id: ThreadId,
    ) -> impl Future<Output = Result<GuiLaunchUrls, GuiLaunchError>> + Send;
}
```

实际 launcher 由 app-server 安装 extension 时注入。launcher 内部复用现有 `GuiHostManager.launch_urls_for_thread(thread_id)`，保持 lazy start、host reuse、launch token 生成和 advertised host URL 生成逻辑不变。

数据流：

```text
用户明确请求打开 GUI
-> 模型调用 launch_gui
-> GuiToolExecutor 使用当前 ThreadId
-> GuiLauncher.launch_gui_for_thread(thread_id)
-> GuiHostManager 启动或复用 GUI host
-> tool result 返回 GUI URLs
-> assistant 向用户展示 URL
```

## 组件

### `codex-gui-extension`

- 定义 `launch_gui` Responses API tool spec。
- tool spec 使用空参数 schema。
- tool description 明确限制：仅在用户显式要求打开 GUI 时调用。
- tool response 返回结构化 URL 列表。

建议响应形状：

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

### `GuiLauncher` capability

- extension 只依赖 trait，不直接依赖 TUI slash command。
- trait 实现负责把当前 thread ID 传给现有 GUI host manager。
- 初版可以只在 in-process app-server 环境安装可用 launcher；remote 环境返回 unsupported。

### app-server extension 安装

app-server 的 extension registry 安装 GUI extension 时注入 launcher，类似 goal extension 注入 `GoalService`、state DB 和 thread manager。安装条件应与当前 GUI host 能力一致：只有 host 能提供 in-process launch capability 时才暴露 tool，或者暴露 tool 后返回清晰 unsupported 错误。初版优先选择不暴露不可用 tool，减少模型误用。

### TUI `/gui`

现有 `/gui` 路径保持不变。它仍然是用户输入层 shortcut，不作为模型 tool 的实现依赖。后续如果需要统一展示格式，可以共享 URL formatting helper，但初版不强制重构。

## 错误处理

- 没有可用 thread：返回模型可读错误，语义与 `/gui` 的 “A thread must start before /gui can launch.” 保持一致。
- remote app-server：返回 unsupported，说明 GUI launch 仅支持 in-process session。
- GUI host config 错误：保留现有 config error 信息。
- GUI host IO 错误：保留现有 launch error 信息。
- launcher channel closed 或 host 已关闭：返回 tool error，让模型告知用户无法启动 GUI。

错误不应自动重试，不应自动打开浏览器，也不应降级为 shell 命令。

## 测试策略

- extension unit tests：验证 `launch_gui` tool spec 名称、空参数、显式触发说明和响应序列化。
- executor tests：使用 fake `GuiLauncher` 验证当前 thread ID 被使用、URL 被返回、错误被转换成模型可读 tool error。
- app-server integration tests：验证安装 extension 后模型 tools 包含 `launch_gui`，不可用环境不暴露或返回 unsupported。
- TUI regression tests：现有 `/gui` slash command 行为保持不变；如果共享格式 helper，再更新对应 snapshot。

## 风险与约束

- GUI launch 是本地 side effect。tool 描述和安装条件必须保守，避免普通任务中误触发。
- URL 包含 launch token。tool response 必须只面向当前对话结果，不应写入长期记忆或额外日志。
- crate 依赖边界需要控制：extension 不应反向依赖 TUI，也不应把 app-server-client worker 细节泄漏到 core extension API。
- 初版不处理自动打开浏览器，避免扩大权限和测试矩阵。

## 成功标准

- 用户明确要求打开 GUI 时，模型能调用 `launch_gui` 并返回当前 thread 的 GUI URLs。
- 普通任务、模糊表达或无显式请求时，模型不会调用该 tool。
- 现有 `/gui` 行为不回退。
- remote 或无 GUI capability 的环境有清晰错误或不暴露 tool。
