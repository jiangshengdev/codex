# Gui-host Embedded Dev Proxy Error Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dev-mode Vite proxy connection-failure plain-text 502 with a reusable embedded HTML error page that uses the copied Vite-style CSS.

**Architecture:** Keep embedded page resources under `codex-rs/gui-host/src/embedded_pages/`. Rust embeds the HTML template and CSS with `include_str!`, escapes runtime strings, injects CSS and values into prefixed template tokens, and returns a single `text/html` 502 response only for upstream connection failures. Bazel exposes the embedded page files through `compile_data` so Cargo and Bazel builds see the same compile-time inputs.

**Tech Stack:** Rust 2024, axum `Response`, `include_str!`, `codex_rust_crate` `compile_data`, `tokio` tests, `pretty_assertions`.

---

## File Structure

- Existing copied CSS: `codex-rs/gui-host/src/embedded_pages/assets/style.css`
  - Keep this file unchanged in this implementation.
- Create: `codex-rs/gui-host/src/embedded_pages/dev_proxy_error.html`
  - Owns the HTML template and prefixed `{{CODEX_GUI_HOST_*}}` tokens.
- Modify: `codex-rs/gui-host/src/assets.rs`
  - Embeds the template and CSS.
  - Renders the error page.
  - Escapes dynamic fields.
  - Uses the page only when `reqwest::get(upstream_url)` fails.
  - Adds focused unit tests.
- Modify: `codex-rs/gui-host/BUILD.bazel`
  - Adds `compile_data = glob(["src/embedded_pages/**"])`.

## Task 1: Create The Embedded HTML Template

**Files:**
- Create: `codex-rs/gui-host/src/embedded_pages/dev_proxy_error.html`
- Leave unchanged: `codex-rs/gui-host/src/embedded_pages/assets/style.css`

- [ ] **Step 1: Confirm the copied CSS is present**

Run:

```sh
test -f codex-rs/gui-host/src/embedded_pages/assets/style.css
```

Expected: command exits successfully with no output.

- [ ] **Step 2: Create `dev_proxy_error.html`**

Use `apply_patch` to add this exact file content:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Codex GUI dev server unavailable</title>
    <style>
{{CODEX_GUI_HOST_CSS}}
    </style>
  </head>
  <body>
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
  </body>
</html>
```

- [ ] **Step 3: Verify only the intended template tokens are present**

Run:

```sh
rg -n "\\{\\{CODEX_GUI_HOST_" codex-rs/gui-host/src/embedded_pages/dev_proxy_error.html
```

Expected output contains exactly these token names:

```text
{{CODEX_GUI_HOST_CSS}}
{{CODEX_GUI_HOST_VITE_ORIGIN}}
{{CODEX_GUI_HOST_ERROR}}
```

## Task 2: Add Failing Tests For The Friendly 502 Page

**Files:**
- Modify: `codex-rs/gui-host/src/assets.rs`

- [ ] **Step 1: Add test imports**

Inside `#[cfg(test)] mod tests`, replace the current imports:

```rust
use crate::ProdAssetConfig;
```

with:

```rust
use axum::body;
use axum::http::StatusCode;
use axum::http::Uri;
use pretty_assertions::assert_eq;

use crate::DevAssetProxyConfig;
use crate::ProdAssetConfig;
```

- [ ] **Step 2: Add the escaping unit test**

Append this test inside `#[cfg(test)] mod tests`:

```rust
#[test]
fn html_escape_escapes_dynamic_page_values() {
    assert_eq!(
        super::html_escape("<script data-x=\"1\">'&'</script>"),
        "&lt;script data-x=&quot;1&quot;&gt;&#39;&amp;&#39;&lt;/script&gt;"
    );
}
```

Expected before implementation: compile fails because `html_escape` does not exist.

- [ ] **Step 3: Add the proxy failure page test**

Append this test inside `#[cfg(test)] mod tests`:

```rust
#[tokio::test]
async fn proxy_vite_returns_embedded_html_when_upstream_is_unavailable() {
    let config = DevAssetProxyConfig {
        vite_origin: "http://127.0.0.1:1/?unsafe=<script>".to_string(),
    };
    let response = super::proxy_vite(
        config,
        "/?threadId=test"
            .parse::<Uri>()
            .expect("URI should be valid"),
    )
    .await;

    assert_eq!(response.status(), StatusCode::BAD_GATEWAY);
    assert_eq!(
        response
            .headers()
            .get(super::CONTENT_TYPE)
            .expect("content-type should be present"),
        "text/html"
    );

    let body = body::to_bytes(response.into_body(), usize::MAX)
        .await
        .expect("body should be readable");
    let body = String::from_utf8(body.to_vec()).expect("body should be UTF-8");

    assert!(body.contains("Waiting for Vite"));
    assert!(body.contains("pnpm --dir codex-gui dev"));
    assert!(body.contains("NO_PROXY=127.0.0.1,localhost"));
    assert!(body.contains("http://127.0.0.1:1/?unsafe=&lt;script&gt;"));
    assert!(body.contains("Connection error"));
    assert!(!body.contains("{{CODEX_GUI_HOST_"));
}
```

Expected before implementation: compile fails because `html_escape` does not exist, or the proxy test fails because the response is still plain text.

- [ ] **Step 4: Run the focused tests to verify RED**

Run:

```sh
cd codex-rs
just test -p codex-gui-host html_escape_escapes_dynamic_page_values proxy_vite_returns_embedded_html_when_upstream_is_unavailable
```

Expected: FAIL before implementation. Acceptable failures are missing `html_escape` or assertions showing the old plain-text 502 behavior.

## Task 3: Implement Embedded Page Rendering

**Files:**
- Modify: `codex-rs/gui-host/src/assets.rs`

- [ ] **Step 1: Add embedded resource constants**

Add these constants after the existing `CONTENT_SECURITY_POLICY` constant:

```rust
const DEV_PROXY_ERROR_HTML: &str = include_str!("embedded_pages/dev_proxy_error.html");
const DEV_PROXY_ERROR_CSS: &str = include_str!("embedded_pages/assets/style.css");
```

- [ ] **Step 2: Replace only the upstream connection failure branch**

In `proxy_vite`, replace the current `Err(_)` arm:

```rust
Err(_) => with_security_headers(
    (
        StatusCode::BAD_GATEWAY,
        format!("Start Vite at {}", config.vite_origin),
    )
        .into_response(),
),
```

with:

```rust
Err(error) => {
    let mut response = (
        StatusCode::BAD_GATEWAY,
        dev_proxy_error_page(&config.vite_origin, &error.to_string()),
    )
        .into_response();
    response
        .headers_mut()
        .insert(CONTENT_TYPE, HeaderValue::from_static("text/html"));
    with_security_headers(response)
}
```

- [ ] **Step 3: Add the page render helper**

Add this helper after `proxy_vite`:

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

- [ ] **Step 4: Add the HTML escaping helper**

Add this helper after `dev_proxy_error_page`:

```rust
fn html_escape(input: &str) -> String {
    let mut escaped = String::with_capacity(input.len());
    for ch in input.chars() {
        match ch {
            '&' => escaped.push_str("&amp;"),
            '<' => escaped.push_str("&lt;"),
            '>' => escaped.push_str("&gt;"),
            '"' => escaped.push_str("&quot;"),
            '\'' => escaped.push_str("&#39;"),
            _ => escaped.push(ch),
        }
    }
    escaped
}
```

- [ ] **Step 5: Run the focused tests to verify GREEN**

Run:

```sh
cd codex-rs
just test -p codex-gui-host html_escape_escapes_dynamic_page_values proxy_vite_returns_embedded_html_when_upstream_is_unavailable
```

Expected: PASS.

## Task 4: Expose Embedded Page Files To Bazel

**Files:**
- Modify: `codex-rs/gui-host/BUILD.bazel`

- [ ] **Step 1: Update `codex_rust_crate` compile data**

Replace:

```starlark
codex_rust_crate(
    name = "gui-host",
    crate_name = "codex_gui_host",
)
```

with:

```starlark
codex_rust_crate(
    name = "gui-host",
    crate_name = "codex_gui_host",
    compile_data = glob(["src/embedded_pages/**"]),
)
```

- [ ] **Step 2: Run a focused Cargo test after the Bazel file change**

Run:

```sh
cd codex-rs
just test -p codex-gui-host proxy_vite_returns_embedded_html_when_upstream_is_unavailable
```

Expected: PASS.

## Task 5: Final Verification

**Files:**
- Verify: `codex-rs/gui-host/src/assets.rs`
- Verify: `codex-rs/gui-host/src/embedded_pages/dev_proxy_error.html`
- Verify: `codex-rs/gui-host/src/embedded_pages/assets/style.css`
- Verify: `codex-rs/gui-host/BUILD.bazel`

- [ ] **Step 1: Verify the copied CSS remains byte-identical to the reference**

Run:

```sh
cmp -s /Users/jiangsheng/cnb/vite-project/src/style.css codex-rs/gui-host/src/embedded_pages/assets/style.css
```

Expected: command exits successfully with no output.

- [ ] **Step 2: Run the changed crate tests**

Run:

```sh
cd codex-rs
just test -p codex-gui-host
```

Expected: PASS.

- [ ] **Step 3: Run formatting**

Run:

```sh
cd codex-rs
just fmt
```

Expected: PASS.

- [ ] **Step 4: Check for whitespace errors**

Run:

```sh
git diff --check
```

Expected: no output and exit code 0.

- [ ] **Step 5: Review scope before reporting completion**

Run:

```sh
git status --short
git diff --stat
```

Expected changed paths:

```text
docs/superpowers/specs/2026-06-11-gui-host-embedded-dev-proxy-error-page-design.md
docs/superpowers/plans/2026-06-11-gui-host-embedded-dev-proxy-error-page.md
codex-rs/gui-host/BUILD.bazel
codex-rs/gui-host/src/assets.rs
codex-rs/gui-host/src/embedded_pages/assets/style.css
codex-rs/gui-host/src/embedded_pages/dev_proxy_error.html
```

Do not commit unless the user explicitly asks for a commit. If the user asks for a commit, use a Conventional Commits message such as:

```sh
git commit -m "feat(gui-host): add embedded Vite proxy error page"
```

## Self-Review

- Spec coverage: the plan covers resource layout, prefixed placeholders, single-response HTML rendering, Rust escaping, Bazel compile data, tests, and verification.
- Placeholder scan: no task uses open-ended implementation placeholders; the literal `{{CODEX_GUI_HOST_*}}` strings are required template tokens.
- Type consistency: helper names are consistent across tasks: `dev_proxy_error_page`, `html_escape`, `DEV_PROXY_ERROR_HTML`, and `DEV_PROXY_ERROR_CSS`.
