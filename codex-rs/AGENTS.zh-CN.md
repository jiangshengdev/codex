# Rust/codex-rs

在存放 Rust 代码的 codex-rs 文件夹中：

- Crate 名称以 `codex-` 为前缀。例如，`core` 文件夹中的 crate 名为 `codex-core`。
- 使用 format! 时，只要可以将变量内联到 {} 中，就始终这样做。
- 执行此处的指令之前，如果仓库依赖的命令（例如 `just`、`rg` 或 `cargo-insta`）尚不可用，请先安装。
- 绝不要添加或修改任何与 `CODEX_SANDBOX_NETWORK_DISABLED_ENV_VAR` 或 `CODEX_SANDBOX_ENV_VAR` 相关的代码。
  - 你在沙箱中工作，每次使用 `shell` 工具时，都会设置 `CODEX_SANDBOX_NETWORK_DISABLED=1`。现有使用 `CODEX_SANDBOX_NETWORK_DISABLED_ENV_VAR` 的代码在编写时已考虑这一事实。它通常用于提前退出那些作者已知你因沙箱限制而无法运行的测试。
  - 同样，使用 Seatbelt（`/usr/bin/sandbox-exec`）启动进程时，会在子进程中设置 `CODEX_SANDBOX=seatbelt`。需要自行运行 Seatbelt 的集成测试无法在 Seatbelt 内运行，因此也经常通过检查 `CODEX_SANDBOX=seatbelt`，在适当情况下提前退出测试。
- 始终按照 https://rust-lang.github.io/rust-clippy/master/index.html#collapsible_if 合并可合并的 if 语句。
- 始终按照 https://rust-lang.github.io/rust-clippy/master/index.html#uninlined_format_args 在可能时内联 format! 参数。
- 按照 https://rust-lang.github.io/rust-clippy/master/index.html#redundant_closure_for_method_calls 在可能时使用方法引用代替闭包。
- 避免使用 bool 或含义模糊的 `Option` 参数，以免调用方必须编写 `foo(false)` 或 `bar(None)` 之类难以阅读的代码。优先使用枚举、具名方法、newtype 或其他惯用的 Rust API 形式，让调用点能够自行表达含义。
- 如果无法进行上述 API 修改，而 Rust 中仍需要使用简短的位置字面量调用，请遵循 `argument_comment_lint` 约定：
  - 按位置传递 `None`、布尔值和数字字面量等含义不直观的字面量参数时，在参数前使用精确的 `/*param_name*/` 注释。
  - 如果方法唯一的非 self 参数与方法同名，则可豁免，例如 `fn enabled(&self, enabled: bool)` 对应的 `.enabled(false)`。
  - 不要为字符串或字符字面量添加此类注释，除非注释确实能让含义更清楚；lint 有意豁免这些字面量。
  - 注释中的参数名必须与被调用函数签名中的名称完全一致。
  - 可以运行 `just argument-comment-lint` 在本地执行 lint 检查。该检查由 Bazel 驱动，因此如果 Bazel 尚未预热，首次运行可能较慢，不过增量运行应少于 15 秒。大多数情况下，最好更新 PR 并交由 CI 检查（或在提交 PR 后于后台异步运行）。注意，CI 会检查全部三个平台，而本地运行不会。
- 尽可能让 `match` 语句穷尽所有情况，避免使用通配分支。
- 新增 trait 应包含文档注释，说明其职责以及实现方应如何使用它。
- 不鼓励在 Rust trait 中使用 `#[async_trait]` 或 `#[allow(async_fn_in_trait)]`。
  - 优先使用原生 RPITIT trait 方法，为返回的 future 显式指定 `Send` 约束，参见 `3c7f013f9735` / `#16630`。
  - 推荐的 trait 形式：
    `fn foo(&self, ...) -> impl std::future::Future<Output = T> + Send;`
  - 实现满足该契约时，仍可使用 `async fn foo(&self, ...) -> T`。
  - 不要使用 `#[allow(async_fn_in_trait)]` 来省略对 future 契约的显式声明。
- 编写测试时，优先比较整个对象是否相等，而不是逐个比较字段。
- 不要为静态定义的值添加测试。
- 不要为已删除的逻辑添加反向测试。
- 不要在 `docs/` 文件夹中添加一般性的产品文档或面向用户的文档。Codex 官方文档位于其他位置。例外是 app-server API 文档，其规则见下方 app-server 指南。
- 优先使用私有模块，并显式导出 crate 的公共 API。
- 如果修改了 `ConfigToml` 或嵌套配置类型，请运行 `just write-config-schema`，更新 `codex-rs/core/config.schema.json`。
- 处理 MCP 工具调用时，优先使用 `codex-rs/codex-mcp/src/mcp_connection_manager.rs` 管理工具和工具调用的变更。尽量缩小改动范围，使用已有抽象，避免通过多层函数调用传递相关代码。
- 不要无必要地调用 `reset_client_session`；让增量检查逻辑决定是否复用上一次请求。
- 如果修改 Rust 依赖（`Cargo.toml` 或 `Cargo.lock`），请从仓库根目录运行 `just bazel-lock-update`，刷新 `MODULE.bazel.lock`，并将该锁文件更新纳入同一次变更。CI 会验证锁文件是否发生漂移。
- Bazel 不会自动让源码树中的文件可供 Rust 在编译时访问。如果添加 `include_str!`、`include_bytes!`、`sqlx::migrate!` 或类似的构建时文件或目录读取，请更新 crate 的 `BUILD.bazel`（`compile_data`、`build_script_data` 或测试数据），否则即使 Cargo 通过，Bazel 也可能失败。
- 不要创建只被引用一次的小型辅助方法。
- 跟踪异步任务时，在函数或方法定义上使用 `#[tracing::instrument(...)]`，不要在调用点通过 `.instrument(...)` 向 future 附加 span。添加插桩之前，检查被调用方或其直接委托的实现方法是否已经插桩。
- 避免大型模块：
  - 优先添加新模块，而不是继续扩大现有模块。
  - Rust 模块的目标大小为 500 行代码以下，不含测试。
  - 如果文件超过约 800 行代码，应在新模块中添加功能，而不是继续扩展现有文件，除非有充分且已记录的理由。
  - 本规则尤其适用于那些频繁修改、已吸引许多不相关改动的文件，例如 `codex-rs/tui/src/app.rs`、`codex-rs/tui/src/bottom_pane/chat_composer.rs`、`codex-rs/tui/src/bottom_pane/footer.rs`、`codex-rs/tui/src/chatwidget.rs`、`codex-rs/tui/src/bottom_pane/mod.rs`，以及类似的核心编排模块。
  - 从大型模块中提取代码时，将相关测试以及模块和类型文档移至新实现附近，使不变量靠近负责维护它们的代码。
  - 避免向 `codex-rs/tui/src/chatwidget.rs` 添加新的独立方法，除非改动很小；优先使用新模块或文件，让 `chatwidget.rs` 专注于编排。
- 运行 Rust 命令（例如 `just fix` 或 `just test`）时，请耐心等待，绝不要尝试通过 PID 终止它们。Rust 锁可能导致执行缓慢，这是预期现象。

完成本仓库任意位置的代码修改后，自动运行 `just fmt`（在 `codex-rs` 目录中）；不要为此请求批准。此外，还应运行测试：

1. 不要直接运行 `cargo test`。使用 `just test`，以遵循仓库默认的测试执行方式。
2. 运行所修改项目对应的测试。例如，如果修改了 `codex-rs/tui`，运行 `just test -p codex-tui`。
3. 上述测试通过后，如果修改了 common、core 或 protocol，运行 `just test` 执行完整测试套件。常规本地运行应避免使用 `--all-features`，因为它会扩大构建矩阵，并可能显著增加 `target/` 的磁盘占用；仅在确实需要完整功能覆盖时使用。运行特定项目或单个测试无需询问用户，但运行完整测试套件前必须询问用户。

在完成对 `codex-rs` 的大型变更之前，运行 `just fix -p <project>`（在 `codex-rs` 目录中），修复代码中的 lint 问题。优先使用 `-p` 限定范围，避免缓慢的整个 workspace Clippy 构建；仅在修改共享 crate 时，才运行不带 `-p` 的 `just fix`。运行 `fix` 或 `fmt` 后，不要重新运行测试。

## `codex-core` crate

随着时间推移，`codex-core` crate（定义于 `codex-rs/core/`）变得臃肿，因为它是最大的 crate。向 `codex-core` 添加新内容通常更容易，而将所需的库代码重构提取出来，使新代码既不依赖 `codex-core`，也不增加其体积，则更费力。

因此：**应克制向 codex-core 添加代码的倾向**！

尤其是在引入新概念、功能或 API 时，在向 `codex-core` 添加代码之前，请考虑：

- 是否存在 `codex-core` 之外的其他合适 crate，可以承载这些新代码。
- 是否该在 Cargo workspace 中引入新 crate 来承载新功能。根据需要重构现有代码，以实现这一点。

同样，在代码审查时，对于会向 `codex-core` 不必要地添加代码的 PR，应毫不犹豫地提出异议。

## 代码审查规则

### Crate API 暴露范围

尽可能缩小 crate API 的暴露范围。避免大量增加仅供测试使用的辅助函数。

### 模型可见上下文

Codex 维护一份上下文（消息历史），在推理请求中发送给模型。

1. 不得重写历史；上下文必须以增量方式构建。
2. 避免频繁修改上下文而导致缓存未命中。
3. 不得包含无界条目；注入模型上下文的所有内容都必须有大小边界和硬性上限。
4. 不得包含超过 10K token 的条目。
5. 将新增的、可能超过 1k token 的单个条目标记为 P0。这些条目需要额外的人工审查。
6. 所有注入的片段都必须在 `core/context` 中定义为结构体，并实现 ContextualUserFragment trait。

### 破坏性变更

检查外部集成接口是否存在破坏性变更：

- app-server API
- 原始响应条目事件（`rawResponseItem/*`），即使它们仍处于实验阶段
- CLI 参数
- 配置加载
- 从现有 rollout 恢复会话

### 测试编写指南

对于 agent 的变更，优先使用集成测试而非单元测试。集成测试位于 `core/suite`，使用 `test_codex` 创建 codex 测试实例。

改变 agent 逻辑的功能**必须**添加集成测试：

- 列出需要测试的主要逻辑变更和用户可见行为。

如需单元测试，将其放在专门的测试文件（\*\_tests.rs）中。
避免在主实现中添加仅供测试使用的函数。

检查是否已有辅助工具可让测试更简洁、易读。

### 变更大小指南（800 行）

除非变更是机械性的，否则变更总行数不应超过 800 行。
复杂逻辑变更应控制在 500 行以下。

如果变更更大，应研究能否拆成便于审查的阶段，并确定最小且完整连贯、可优先落地的阶段。
应根据实际 diff、依赖关系和受影响的调用点提出分阶段建议。

## TUI 样式约定

参见 `codex-rs/tui/styles.md`。

## TUI 代码约定

- 使用 ratatui 的 Stylize trait 提供的简洁样式辅助方法。
  - 基础 span：使用 "text".into()
  - 带样式的 span：使用 "text".red()、"text".green()、"text".magenta()、"text".dim() 等。
  - 优先使用这些方法，而不是直接使用 `Span::styled` 和 `Style` 构造样式。
  - 示例：补丁摘要中的文件行
    - 推荐：vec!["  └ ".into(), "M".red(), " ".dim(), "tui/src/app.rs".dim()]

### TUI 样式（ratatui）

- 优先使用 Stylize 辅助方法：尽可能使用 "text".dim()、.bold()、.cyan()、.italic()、.underlined()，而不是手动构造 Style。
- 优先使用简单转换：span 使用 "text".into()，行使用 vec![…].into()；类型推断有歧义时（例如 Paragraph::new/Cell::from），使用 Line::from(spans) 或 Span::from(text)。
- 动态计算的样式：如果 Style 在运行时计算，可以使用 `Span::styled`（也可以使用 `Span::from(text).set_style(style)`）。
- 避免硬编码白色：不要使用 `.white()`；优先使用默认前景色（不指定颜色）。
- 链式调用：通过链式组合辅助方法提高可读性（例如 url.cyan().underlined()）。
- 单个条目：优先使用 "text".into()；只有上下文无法明确目标类型，或使用 .into() 需要额外类型标注时，才使用 Line::from(text) 或 Span::from(text)。
- 构建行：目标类型明确且不需要额外类型标注时，使用 vec![…].into() 构造 Line；否则使用 Line::from(vec![…])。
- 避免无谓改动：如果没有明确的可读性或功能收益，不要在等价形式之间重构（Span::styled ↔ set_style、Line::from ↔ .into()）；遵循文件内既有约定，不要仅为使用 .into() 而引入类型标注。
- 紧凑性：优先选择经 rustfmt 格式化后仍能保持单行的形式；如果 Line::from(vec![…]) 和 vec![…].into() 中只有一种能避免折行，选择该形式。如果两者都要折行，选择折行更少的一种。

### 文本换行

- 始终使用 textwrap::wrap 对普通字符串换行。
- 如果要对 ratatui Line 换行，使用 tui/src/wrapping.rs 中的辅助函数，例如 word_wrap_lines / word_wrap_line。
- 如果需要缩进换行后的文本，尽可能使用 RtOptions 的 initial_indent / subsequent_indent 选项，而不是编写自定义逻辑。
- 如果有一组行，需要为所有行添加前缀（首行与后续行的前缀可以不同），使用 line_utils 中的 `prefix_lines` 辅助函数。

## 测试

### 测试模块组织

- 新增测试模块时，将内容定义在独立的同级文件中，而不是内联在实现文件中。
- 使用显式的 `#[path = "..._tests.rs"]` 属性，让测试文件名具有描述性且易于查找：

  ```rust
  #[cfg(test)]
  #[path = "parser_tests.rs"]
  mod tests;
  ```

- 这仅适用于新增测试模块。不要仅为遵循此约定而移动或重写现有内联的 `#[cfg(test)] mod tests { ... }` 模块。

### 快照测试

本仓库使用快照测试（通过 `insta`）验证渲染输出，尤其是在 `codex-rs/tui` 中。

**要求：**任何影响用户可见 UI 的变更（包括新增 UI）都必须包含相应的 `insta` 快照覆盖（如果尚无快照测试，则新增；否则更新现有快照）。应将快照更新的审查与接受纳入 PR，以便审查 UI 影响，并让后续 diff 保持可视化。

有意修改 UI 或文本输出时，按以下步骤更新快照：

- 运行测试以生成更新后的快照：
  - `just test -p codex-tui`
- 检查待处理的快照：
  - `cargo insta pending-snapshots -p codex-tui`
- 直接阅读仓库中生成的 `*.snap.new` 文件以审查变更，或预览某个文件：
  - `cargo insta show -p codex-tui path/to/file.snap.new`
- 只有在打算接受此 crate 中所有新快照时，才运行：
  - `cargo insta accept -p codex-tui`

如果尚未安装该工具：

- `cargo install --locked cargo-insta`

### 基准测试

可以通过 `just bench` 运行 cargo 基准测试；使用 divan crate 编写新的基准测试。

使用 `just bench-smoke` 试运行一次迭代，确保基准测试能够正常工作。

### 测试断言

- 测试应使用 pretty_assertions::assert_eq，以获得更清晰的 diff。如果尚未导入，请在测试模块顶部导入。
- 尽可能优先使用深度相等比较。对整个对象执行 `assert_eq!()`，而不是单独比较字段。
- 避免在测试中修改进程环境；优先从上层传入根据环境得到的标志或依赖。

### 在测试中启动 workspace 二进制程序（Cargo 与 Bazel）

- 测试需要启动项目自身的二进制程序时，优先使用 `codex_utils_cargo_bin::cargo_bin("...")`，而不是 `assert_cmd::Command::cargo_bin(...)` 或 `escargot`。
  - 在 Bazel 下，二进制程序和资源可能位于 runfiles 中；使用 `codex_utils_cargo_bin::cargo_bin` 解析绝对路径，确保在 `chdir` 后路径仍然稳定。
- 在 Bazel 下定位 fixture 文件或测试资源时，避免使用 `env!("CARGO_MANIFEST_DIR")`。优先使用 `codex_utils_cargo_bin::find_resource!`，使路径在 Cargo 和 Bazel runfiles 下都能正确解析。

### 集成测试

#### codex_core 集成测试

- 编写端到端 Codex 测试时，优先使用 `core_test_support::responses` 中的工具。
- 默认使用 `TestCodexBuilder::build_with_auto_env()`，确保新测试能够在 app/exec 运行于不同操作系统的情况下工作。详情参见 $remote-tests。
- 所有 `mount_sse*` 辅助函数都会返回 `ResponseMock`；保留该对象，以便对发出的 `/responses` POST 请求体进行断言。
- 测试应只发出一次 POST 时，使用 `ResponseMock::single_request()`；要检查捕获的所有 `ResponsesRequest`，使用 `ResponseMock::requests()`。
- `ResponsesRequest` 提供辅助方法（`body_json`、`input`、`function_call_output`、`custom_tool_call_output`、`call_output`、`header`、`path`、`query_param`），让断言可以针对结构化载荷，而不必手动查找 JSON 内容。
- 使用提供的 `ev_*` 构造函数和 `sse(...)` 构建 SSE 载荷。
- 优先使用 `wait_for_event`，而不是 `wait_for_event_with_timeout`。
- 优先使用 `mount_sse_once`，而不是 `mount_sse_once_match` 或 `mount_sse_sequence`。

- 典型模式：

  ```rust
  let mock = responses::mount_sse_once(&server, responses::sse(vec![
      responses::ev_response_created("resp-1"),
      responses::ev_function_call(call_id, "shell", &serde_json::to_string(&args)?),
      responses::ev_completed("resp-1"),
  ])).await;

  codex.submit(Op::UserTurn { ... }).await?;

  // 根据需要断言请求体。
  let request = mock.single_request();
  // 使用 request.function_call_output(call_id)、request.json_body() 或其他辅助方法进行断言。
  ```

#### app-server 集成测试

- 测试应覆盖 app-server 的公共 JSON-RPC API。
- 使用与 core 集成测试类似的服务端模拟方式。
- 默认使用 `TestAppServer::builder().build()` 和 `TestAppServer::send_thread_start_request_with_auto_env()`，确保新测试能够在 app/exec 运行于不同操作系统的情况下工作。详情参见 `$remote-tests`。

## App-server API 开发最佳实践

这些指南适用于 `codex-rs` 中的 app-server 协议开发，尤其是：

- `app-server-protocol/src/protocol/common.rs`
- `app-server-protocol/src/protocol/v2.rs`
- `app-server/README.md`

### 核心规则

- 所有当前 API 开发都应在 app-server v2 中进行。不要为 v1 增加新的 API 接口。
- 一致地遵循载荷命名规则：请求载荷使用 `*Params`，响应使用 `*Response`，通知使用 `*Notification`。
- RPC 方法以 `<resource>/<method>` 形式公开，并保持 `<resource>` 为单数（例如 `thread/read`、`app/list`）。
- 始终使用 `#[serde(rename_all = "camelCase")]`，使传输字段采用 camelCase，除非带标签的联合类型或明确的兼容性要求需要针对性重命名。
- 始终使传输中的字符串枚举值采用 camelCase，并为 serde 和 TS 设置匹配的 `rename_all = "camelCase"` 注解，除非明确的兼容性要求需要针对性重命名。
- 例外：config RPC 载荷应使用 snake_case，与 config.toml 的键一致（参见 `app-server-protocol/src/protocol/v2.rs` 中的配置读取、写入和列表 API）。
- 始终为 v2 的请求、响应和通知类型设置 `#[ts(export_to = "v2/")]`，使生成的 TypeScript 位于正确的命名空间。
- 绝不要对 v2 API 载荷字段使用 `#[serde(skip_serializing_if = "Option::is_none")]`。
  例外：有意不带参数的客户端到服务端请求可以使用：
  `params: #[ts(type = "undefined")] #[serde(skip_serializing_if = "Option::is_none")] Option<()>`。
- 保持 Rust 和 TS 的传输重命名一致。如果字段或变体使用 `#[serde(rename = "...")]`，添加匹配的 `#[ts(rename = "...")]`。
- 对于可判别联合类型，在两种序列化器中都使用显式标签：
  `#[serde(tag = "type", ...)]` 和 `#[ts(tag = "type", ...)]`。
- 在 API 边界优先使用普通 `String` ID（如有需要，在内部进行 UUID 解析或转换）。
- 时间戳应为整数 Unix 秒数（`i64`），并命名为 `*_at`（例如 `created_at`、`updated_at`、`resets_at`）。
- 对于实验性 API：使用 `#[experimental("method/or/field")]`；需要字段级门控时，派生 `ExperimentalApi`；当某方法只有部分字段属于实验性功能时，在 `common.rs` 中使用 `inspect_params: true`。

### 客户端到服务端的请求载荷（`*Params`）

- 每个可选字段都必须标注 `#[ts(optional = nullable)]`。不要在客户端到服务端的请求载荷（`*Params`）之外使用 `#[ts(optional = nullable)]`。
- 可选集合字段（例如 `Vec`、`HashMap`）必须使用 `Option<...>` + `#[ts(optional = nullable)]`。不要使用 `#[serde(default)]` 表示可选集合，也不要在 v2 载荷字段上使用 `skip_serializing_if`。
- 当希望布尔字段省略时表示 `false`，优先使用 `#[serde(default, skip_serializing_if = "std::ops::Not::not")] pub field: bool`，而不是 `Option<bool>`。
- 新增列表方法默认实现游标分页：
  请求字段为 `pub cursor: Option<String>` 和 `pub limit: Option<u32>`，
  响应字段为 `pub data: Vec<...>` 和 `pub next_cursor: Option<String>`。

### 开发流程

- API 行为变化时，更新 app-server 文档和示例（至少更新 `app-server/README.md`）。
- API 结构变化时，重新生成 schema fixture：
  `just write-app-server-schema`
  （如果影响实验性 API fixture，还需运行 `just write-app-server-schema --experimental`）。
- 使用 `just test -p codex-app-server-protocol` 验证。
- 避免编写仅断言 `common.rs` 中单个请求字段的实验性标记的样板测试；应依靠 schema 生成、测试以及行为覆盖。

## Python 开发最佳实践

### 不考虑 Python 2 兼容性

本项目使用 Python 3+。不应使用 `__future__` 模块。

如果需要考虑不同 3.xx 小版本之间的功能兼容性，请查看最近的 `pyproject.toml` 中的 `requires-python` 字段，确认支持的最低运行时版本。

## 平台支持

除非功能明确仅适用于特定操作系统，否则测试和功能必须支持 Linux、macOS 和 Windows。

Codex 支持相互连接的 app-server 和 exec-server 运行在不同操作系统上。有关这些配置的集成测试详情，参见 `$remote-tests` skill。
