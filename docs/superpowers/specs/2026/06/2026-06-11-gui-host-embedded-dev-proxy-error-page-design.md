# Gui-host embedded dev proxy error page 设计

## 背景

`codex-gui-host` 在 dev mode 下通过 `proxy_vite` 把浏览器请求代理到 Vite dev server。当前当 Vite upstream 连接失败时，`codex-rs/gui-host/src/assets.rs` 只返回 `502 Bad Gateway` 和裸文本 `Start Vite at <origin>`。

这个响应能表达技术状态，但浏览器里缺少可操作信息。实际故障可能是 Vite 未启动，也可能是 `http_proxy` / `all_proxy` 等环境变量影响 localhost 访问。错误页应清楚说明 GUI host 已启动、Vite 不可达，并给出最小下一步。

## 目标

- 为 dev-mode Vite proxy 连接失败提供一个友好的 HTML 错误页。
- 页面视觉直接参考 `/Users/jiangsheng/cnb/vite-project` 的 Vite welcome page 结构和 CSS，而不是重新设计独立卡片页。
- 资源以 embedded page 形式编译进 `codex-gui-host`，最终对浏览器返回单个 HTML 响应。
- CSS 作为可复用资源放在通用目录下，后续其他 embedded pages 可以复用。
- 动态字段必须 HTML escape，避免把配置值或错误文本直接注入页面。
- Bazel 和 Cargo 构建都能看到编译期嵌入文件。

## 非目标

- 不修改已复制的参考 CSS。
- 不引入图片、JavaScript、外部字体或额外 HTTP 资源请求。
- 不自动启动 Vite。
- 不读取、修改或清理 proxy 环境变量。
- 不改变 prod asset serving 行为。
- 不改变 Vite proxy 成功路径和 upstream body read failure 路径。
- 不新增 Rust 依赖，不修改 lockfile。
- 不触碰 `CODEX_SANDBOX_NETWORK_DISABLED_ENV_VAR` 或 `CODEX_SANDBOX_ENV_VAR` 相关代码。

## 资源布局

采用已确认的方案 A：

```text
codex-rs/gui-host/src/embedded_pages/
  assets/
    style.css
  dev_proxy_error.html
```

`assets/style.css` 是从参考 Vite 项目复制来的 CSS，第一阶段保持原样。任何复制或移动这类资源文件的操作必须使用命令完成，并用 `cmp` 或 checksum 验证一致性。

`dev_proxy_error.html` 是正式 Rust 模板文件，不从临时预览 HTML 复制。它只包含错误页需要的 HTML 结构和带前缀占位符。

## 模板占位符

模板占位符统一使用 `CODEX_GUI_HOST` 前缀，避免和普通前端模板语法或 CSS 内容冲突。

```text
{{CODEX_GUI_HOST_CSS}}
{{CODEX_GUI_HOST_VITE_ORIGIN}}
{{CODEX_GUI_HOST_ERROR}}
```

替换规则：

- `{{CODEX_GUI_HOST_CSS}}` 替换为静态 CSS 内容，不做 HTML escape。
- `{{CODEX_GUI_HOST_VITE_ORIGIN}}` 替换为 escaped `DevAssetProxyConfig.vite_origin`。
- `{{CODEX_GUI_HOST_ERROR}}` 替换为 escaped upstream connect error。
- 渲染后的 HTML 不应残留任何 `{{CODEX_GUI_HOST_` 占位符。

## 页面结构

页面复用参考 CSS 的现有选择器，减少第一阶段 CSS 修改。

```html
<div id="app">
  <section id="center">
    <div>
      <h1>Waiting for Vite</h1>
      <p>
        Codex GUI host is running, but it could not connect to
        <code>{{CODEX_GUI_HOST_VITE_ORIGIN}}</code>.
      </p>
    </div>
  </section>

  <div class="ticks"></div>

  <section id="next-steps">
    <div id="docs">
      <h2>Start dev server</h2>
      <p>Run the frontend dev server and refresh this page.</p>
      <code>pnpm --dir codex-gui dev</code>
    </div>

    <div id="social">
      <h2>If Vite is already running</h2>
      <p>Check whether proxy environment variables are intercepting localhost.</p>
      <code>NO_PROXY=127.0.0.1,localhost</code>
    </div>
  </section>

  <div class="ticks"></div>

  <section id="spacer">
    <h2>Connection error</h2>
    <p>{{CODEX_GUI_HOST_ERROR}}</p>
  </section>
</div>
```

这里刻意使用 `#app`、`#center`、`.ticks`、`#next-steps`、`#docs`、`#social`、`#spacer`，以便直接继承参考 CSS 的布局、边框和响应式行为。

## Rust 集成

`assets.rs` 负责嵌入模板和 CSS：

```rust
const DEV_PROXY_ERROR_HTML: &str = include_str!("embedded_pages/dev_proxy_error.html");
const DEV_PROXY_ERROR_CSS: &str = include_str!("embedded_pages/assets/style.css");
```

渲染函数负责替换占位符：

```rust
fn dev_proxy_error_page(vite_origin: &str, error: &str) -> String {
    DEV_PROXY_ERROR_HTML
        .replace("{{CODEX_GUI_HOST_CSS}}", DEV_PROXY_ERROR_CSS)
        .replace(
            "{{CODEX_GUI_HOST_VITE_ORIGIN}}",
            &html_escape(vite_origin),
        )
        .replace("{{CODEX_GUI_HOST_ERROR}}", &html_escape(error))
}
```

`proxy_vite` 只在 upstream connect failure 分支使用该页面：

- HTTP status 保持 `StatusCode::BAD_GATEWAY`。
- `Content-Type` 设置为 `text/html`。
- 响应继续经过 `with_security_headers`。

## Bazel 集成

`include_str!` 会在编译期读取非 Rust 文件。Cargo 通常能直接读取源码树文件，但 Bazel 只向编译 action 提供显式声明的输入。

因此 `codex-rs/gui-host/BUILD.bazel` 需要为 `codex_rust_crate` 增加 `compile_data`，覆盖 embedded page 资源。建议使用窄范围 glob：

```starlark
codex_rust_crate(
    name = "gui-host",
    crate_name = "codex_gui_host",
    compile_data = glob(["src/embedded_pages/**"]),
)
```

## 测试策略

新增 `codex-gui-host` 单元测试，直接调用 `proxy_vite` 的 failure path。

覆盖点：

- upstream 不可达时 status 是 `502 Bad Gateway`。
- 响应 `Content-Type` 是 HTML。
- body 包含 `Waiting for Vite`。
- body 包含 `pnpm --dir codex-gui dev`。
- body 包含 `NO_PROXY=127.0.0.1,localhost`。
- body 包含 escaped Vite origin。
- body 包含 escaped error 文本。
- body 不包含 `{{CODEX_GUI_HOST_`。

同时为 `html_escape` 增加 focused 覆盖，验证 `<`、`>`、`&`、`"`、`'` 不会原样进入 HTML。

## 验证

实现完成后应运行：

```sh
just test -p codex-gui-host
just fmt
git diff --check
```

如果实施阶段实际修改了共享 crate、协议或配置 schema，再按对应仓库规则追加验证；本设计的第一阶段不涉及这些范围。

## 风险与缓解

- **Bazel 漏声明资源**：通过 `compile_data = glob(["src/embedded_pages/**"])` 避免 `include_str!` 在 Bazel 下找不到文件。
- **占位符残留**：测试断言 body 不包含 `{{CODEX_GUI_HOST_`。
- **动态内容注入 HTML**：所有运行时字符串先经过 `html_escape`。
- **CSS 与参考不一致**：复制 CSS 使用命令，并用 `cmp` 或 checksum 验证；第一阶段不手写重建 CSS。
- **页面范围膨胀**：第一阶段不做图片、JS、自动诊断或自动修复，只做静态说明和下一步提示。

## 后续扩展

后续如果需要为其他 `gui-host` embedded pages 提供同一视觉语言，可以继续复用：

```text
codex-rs/gui-host/src/embedded_pages/assets/style.css
```

并在 `embedded_pages/` 下新增其他 HTML 模板。新增模板必须沿用带前缀占位符规则，并继续通过 `compile_data` 暴露给 Bazel。
