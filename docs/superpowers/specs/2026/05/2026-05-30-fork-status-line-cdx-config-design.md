# Fork Status Line cdx Config 设计

## 背景

fork 版本新增了官方版本不存在的底部条 item，例如 `context-used-tokens`。如果 fork 把底部条配置写入 `~/.codex/config.toml`，这个共享配置文件会保存 fork-only item。之后官方版本读取同一份配置时，会把该 item 当作未知底部条配置并发出 warning。

该问题的本质不是底部条渲染逻辑错误，而是 fork-only 底部条配置和官方共享配置文件混用。官方版本行为不在本设计范围内；本设计只约束 fork 版本如何读写自己的底部条配置。

## 目标

fork 版本的底部条配置与主配置文件解耦：

```text
~/.codex/config.toml      # fork 不从这里读写底部条相关配置
~/.codex/cdx/config.toml  # fork 只从这里读写底部条相关配置
```

fork 对以下两个配置项执行严格的只读写 `cdx` 规则：

```toml
[tui]
status_line = [...]
status_line_use_colors = true
```

具体含义：

- fork 读取底部条配置时，只读取 `~/.codex/cdx/config.toml`。
- fork 保存底部条配置时，只写入 `~/.codex/cdx/config.toml`。
- fork 运行时把 `~/.codex/config.toml` 中的 `tui.status_line` 和 `tui.status_line_use_colors` 当作不存在。
- `~/.codex/cdx/config.toml` 只承载这两个底部条相关配置项，不作为完整 config overlay。

## 非目标

本设计不做以下事情：

- 不读取、迁移、清理或修改 `~/.codex/config.toml` 中的底部条配置。
- 不从 `~/.codex/config.toml` 的 `tui.status_line` 或 `tui.status_line_use_colors` fallback。
- 不把 `~/.codex/cdx/config.toml` 扩展为完整 `ConfigToml`。
- 不改变官方版本行为。
- 不改变底部条 item 的解析、渲染、样式、预览或 warning 机制。

## 配置文件形态

fork 私有配置文件路径固定为：

```text
<codex_home>/cdx/config.toml
```

其中 `<codex_home>` 仍来自现有 `Config::codex_home`。

文件内容只支持：

```toml
[tui]
status_line = ["model-with-reasoning", "current-dir", "context-used-tokens"]
status_line_use_colors = true
```

如果文件不存在，或者 `[tui]` 不存在：

- `tui_status_line` 使用 `None`，后续沿用现有默认底部条列表。
- `tui_status_line_use_colors` 使用 `true`。

如果 `status_line` 缺失但 `status_line_use_colors` 存在，只覆盖颜色配置；反之亦然。

## 加载设计

现有主配置加载仍保留，用于除底部条以外的所有配置。fork 在构造运行时 `Config` 时，需要把底部条两个字段从主配置来源中切出。

推荐实现方式：

1. 主配置按现有流程加载和反序列化。
2. 构造 `Config` 时，不从主 `ConfigToml` 读取 `tui.status_line` 和 `tui.status_line_use_colors`。
3. 新增一个只读 helper，从 `<codex_home>/cdx/config.toml` 读取 fork 底部条配置。
4. 将 helper 结果写入运行时字段：
   - `Config::tui_status_line`
   - `Config::tui_status_line_use_colors`

这样即使 `~/.codex/config.toml` 中存在这两个 key，fork 的底部条也不会受影响。

`cdx/config.toml` 的解析应使用最小结构体，而不是 `ConfigToml`：

```rust
struct ForkStatusLineConfigToml {
    tui: Option<ForkStatusLineTuiToml>,
}

struct ForkStatusLineTuiToml {
    status_line: Option<Vec<String>>,
    status_line_use_colors: Option<bool>,
}
```

该结构只表达 fork 底部条需要的两个字段，避免未来误把 `cdx/config.toml` 当作通用配置层。

## 保存设计

`/statusline` 确认保存时，当前代码会通过 `ConfigEditsBuilder::for_config(&self.config)` 写入用户配置文件。fork 需要改为固定写入：

```text
self.config.codex_home / "cdx" / "config.toml"
```

保存内容仍复用现有 config edit：

- `status_line_items_edit(&ids)`
- `status_line_use_colors_edit(use_theme_colors)`

但 builder 必须使用 `ConfigEditsBuilder::for_config_path(&cdx_config_path)`，不能使用 `for_config(&self.config)` 或 `new(&self.config.codex_home)`。

保存成功后，继续更新内存态：

- `self.config.tui_status_line = Some(ids.clone())`
- `self.config.tui_status_line_use_colors = use_theme_colors`
- `self.chat_widget.setup_status_line(items, use_theme_colors)`

`write_atomically` 已负责创建父目录，因此 `<codex_home>/cdx/` 不存在时也可以正常写入。

## 错误处理

读取 `cdx/config.toml` 时：

- 文件不存在不是错误，使用默认值。
- TOML 语法错误应作为配置加载错误暴露，避免静默忽略用户的 fork 底部条配置。
- 类型错误也应作为配置加载错误暴露，例如 `status_line = "model"`。

保存 `cdx/config.toml` 时：

- 沿用现有 `/statusline` 保存失败处理，向用户显示保存失败消息。
- 错误消息应指向 `cdx/config.toml`，方便用户定位 fork 私有配置文件。

## 测试计划

新增或更新测试覆盖以下行为：

- 仅 `~/.codex/config.toml` 配置 `tui.status_line` 时，fork 运行时忽略它，底部条走默认值。
- 仅 `~/.codex/cdx/config.toml` 配置 `tui.status_line` 时，fork 运行时使用它。
- 两个文件都配置 `tui.status_line` 时，fork 只使用 `cdx/config.toml`。
- `cdx/config.toml` 配置 `status_line_use_colors = false` 时，运行时颜色配置为 false。
- `/statusline` 保存后，只创建或修改 `~/.codex/cdx/config.toml`，不修改 `~/.codex/config.toml`。
- `cdx/config.toml` 缺失时不报错，并保留默认底部条行为。

推荐测试位置：

- config 加载相关测试放在 `codex-rs/core/src/config/config_tests.rs` 或相邻配置测试文件。
- `/statusline` 保存路径测试放在现有 TUI app/event 配置持久化测试附近。

## 验收标准

- fork 底部条配置的读路径和写路径都只指向 `<codex_home>/cdx/config.toml`。
- fork 不读取 `~/.codex/config.toml` 中的 `tui.status_line` 和 `tui.status_line_use_colors`。
- fork 保存 `/statusline` 不修改 `~/.codex/config.toml`。
- 现有底部条渲染行为保持不变。
