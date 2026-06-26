# Codex GUI Runtime Error Circuit Breaker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a project-level dev runtime circuit breaker so a loaded Codex GUI page exits Vite runtime after Vite/HMR errors instead of letting the browser remain in a potentially unbounded recovery loop.

**Architecture:** `codex-rs/gui-host` serves a stable embedded `/__codex-gui/dev-runtime-error` page directly in dev mode with no Vite assets. `codex-gui` installs a dev-only HMR observer that maps `vite:ws:disconnect` and `vite:error` to a one-time `location.replace(...)` navigation to that page.

**Tech Stack:** Rust `axum` GUI host, embedded HTML/CSS via `include_str!`, React/Vite TypeScript app, Vitest unit tests, Cargo/nextest via `just test`.

---

## File Structure

Create: `codex-rs/gui-host/src/embedded_pages/dev_runtime_error.html`

Runtime stopped page. It should reuse the embedded CSS placeholder pattern from `dev_proxy_error.html`, avoid all Vite/client script references, and render only bounded placeholders.

Modify: `codex-rs/gui-host/src/assets.rs`

Add the embedded runtime page constant, renderer, reason normalization, and response helper. Keep existing `dev_proxy_error_page` behavior unchanged.

Modify: `codex-rs/gui-host/src/host.rs`

Add the exact dev-only route `/__codex-gui/dev-runtime-error` before the Vite proxy fallback. Add host-level tests that prove the route returns directly from GUI host and does not hit the Vite proxy.

Create: `codex-gui/src/devRuntimeCircuitBreaker.ts`

Small testable module that installs Vite HMR listeners, owns the one-time guard, builds bounded URLs, and calls an injected `replace`.

Create: `codex-gui/src/__tests__/devRuntimeCircuitBreaker.test.ts`

Vitest node-environment tests for listener registration, one-time navigation, path skip, payload exclusion, and non-dev no-op behavior.

Modify: `codex-gui/src/main.tsx`

Install the dev runtime circuit breaker before async catalog loading and React rendering.

---

### Task 1: Add GUI Host Runtime Error Page Renderer

**Files:**
- Create: `codex-rs/gui-host/src/embedded_pages/dev_runtime_error.html`
- Modify: `codex-rs/gui-host/src/assets.rs`

- [ ] **Step 1: Write failing Rust tests for the runtime page renderer**

Append these tests inside the existing `#[cfg(test)] mod tests` in `codex-rs/gui-host/src/assets.rs`:

```rust
    #[test]
    fn dev_runtime_error_page_renders_bounded_runtime_reason() {
        let page = super::dev_runtime_error_page(
            "http://127.0.0.1:5173",
            Some("hmrDisconnected"),
        );

        assert!(page.contains("Codex GUI dev runtime stopped"));
        assert!(page.contains("HMR disconnected"));
        assert!(page.contains("http://127.0.0.1:5173"));
        assert!(page.contains("dev runtime has been stopped"));
        assert!(!page.contains("@vite/client"));
        assert!(!page.contains("/src/main.tsx"));
        assert!(!page.contains("http-equiv=\"refresh\""));
        assert!(!page.contains("{{CODEX_GUI_HOST_"));
    }

    #[test]
    fn dev_runtime_error_page_uses_bounded_fallback_for_unknown_reason() {
        let page = super::dev_runtime_error_page(
            "http://127.0.0.1:5173/?unsafe=<script>",
            Some("<script>bad</script>"),
        );

        assert!(page.contains("Unknown runtime error"));
        assert!(page.contains("?unsafe=&lt;script&gt;"));
        assert!(!page.contains("<script>bad</script>"));
        assert!(!page.contains("{{CODEX_GUI_HOST_"));
    }

    #[tokio::test]
    async fn dev_runtime_error_response_returns_stable_html() {
        let config = DevAssetProxyConfig {
            vite_origin: "http://127.0.0.1:5173".to_string(),
        };
        let response = super::dev_runtime_error_response(
            config,
            "/__codex-gui/dev-runtime-error?reason=viteError"
                .parse::<Uri>()
                .expect("URI should be valid"),
        )
        .await;

        assert_eq!(response.status(), StatusCode::OK);
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

        assert!(body.contains("Vite error"));
        assert!(!body.contains("Waiting for Vite"));
        assert!(!body.contains("pnpm --dir codex-gui dev"));
        assert!(!body.contains("NO_PROXY=127.0.0.1,localhost"));
    }
```

- [ ] **Step 2: Run the focused Rust tests and verify they fail**

Run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-rs
just test -p codex-gui-host dev_runtime_error
```

Expected: FAIL because `dev_runtime_error_page` and `dev_runtime_error_response` do not exist.

- [ ] **Step 3: Create the embedded runtime error HTML**

Create `codex-rs/gui-host/src/embedded_pages/dev_runtime_error.html` with this content:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Codex GUI dev runtime stopped</title>
    <style>
/* {{CODEX_GUI_HOST_CSS}} */

#spacer {
  box-sizing: border-box;
  height: auto;
  min-height: 120px;
  padding: 32px;
}

@media (max-width: 1024px) {
  #spacer {
    min-height: 104px;
    padding: 24px 20px;
  }
}
    </style>
  </head>
  <body>
    <div id="app">
      <section id="center">
        <div>
          <h1>Codex GUI dev runtime stopped</h1>
          <p>
            Codex GUI host is still running, but the Vite dev runtime has been
            stopped to keep the browser responsive.
          </p>
        </div>
      </section>

      <div class="ticks"></div>

      <section id="next-steps">
        <div id="docs">
          <h2>Runtime state</h2>
          <p>The page left the Vite runtime after a dev-only error signal.</p>
          <code>{{CODEX_GUI_HOST_REASON}}</code>
        </div>

        <div id="social">
          <h2>Manual recovery</h2>
          <p>Fix or restart Vite, then refresh this page or reopen the GUI.</p>
          <code>{{CODEX_GUI_HOST_VITE_ORIGIN}}</code>
        </div>
      </section>

      <div class="ticks"></div>

      <section id="spacer">
        <h2>Why this page is stable</h2>
        <p>This page is served by GUI host directly and does not load Vite.</p>
      </section>
    </div>
  </body>
</html>
```

- [ ] **Step 4: Implement the renderer and response helper**

In `codex-rs/gui-host/src/assets.rs`, add this constant next to the existing embedded constants:

```rust
const DEV_RUNTIME_ERROR_HTML: &str = include_str!("embedded_pages/dev_runtime_error.html");
```

Add this public response helper after `proxy_vite`:

```rust
pub async fn dev_runtime_error_response(config: DevAssetProxyConfig, uri: Uri) -> Response {
    let reason = dev_runtime_error_reason_from_uri(&uri);
    let mut response = (
        StatusCode::OK,
        dev_runtime_error_page(&config.vite_origin, reason.as_deref()),
    )
        .into_response();
    response
        .headers_mut()
        .insert(CONTENT_TYPE, HeaderValue::from_static("text/html"));
    with_security_headers(response)
}
```

Add these private helpers near `dev_proxy_error_page`:

```rust
fn dev_runtime_error_page(vite_origin: &str, reason: Option<&str>) -> String {
    DEV_RUNTIME_ERROR_HTML
        .replace("/* {{CODEX_GUI_HOST_CSS}} */", DEV_PROXY_ERROR_CSS)
        .replace("{{CODEX_GUI_HOST_VITE_ORIGIN}}", &html_escape(vite_origin))
        .replace(
            "{{CODEX_GUI_HOST_REASON}}",
            &html_escape(dev_runtime_error_reason_label(reason)),
        )
}

fn dev_runtime_error_reason_from_uri(uri: &Uri) -> Option<String> {
    uri.query().and_then(|query| {
        query.split('&').find_map(|pair| {
            let (key, value) = pair.split_once('=')?;
            if key == "reason" {
                Some(value.to_string())
            } else {
                None
            }
        })
    })
}

fn dev_runtime_error_reason_label(reason: Option<&str>) -> &'static str {
    match reason {
        Some("hmrDisconnected") => "HMR disconnected",
        Some("viteError") => "Vite error",
        Some(_) | None => "Unknown runtime error",
    }
}
```

- [ ] **Step 5: Run the focused Rust tests and verify they pass**

Run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-rs
just test -p codex-gui-host dev_runtime_error
```

Expected: PASS for the three new tests.

---

### Task 2: Route Runtime Error Page Before Vite Proxy

**Files:**
- Modify: `codex-rs/gui-host/src/host.rs`

- [ ] **Step 1: Write failing host route tests**

Append these tests inside the existing `#[cfg(test)] mod tests` in `codex-rs/gui-host/src/host.rs`:

```rust
    #[tokio::test]
    async fn dev_runtime_error_route_is_served_by_gui_host() {
        let handle = start_host(NoopBackend).await;
        let response = reqwest::get(format!(
            "http://127.0.0.1:{}/__codex-gui/dev-runtime-error?reason=hmrDisconnected",
            handle.local_addr().port()
        ))
        .await
        .expect("runtime error route request should succeed");

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response
                .headers()
                .get("x-frame-options")
                .expect("x-frame-options header should be present"),
            "DENY"
        );
        assert_eq!(
            response
                .headers()
                .get("content-security-policy")
                .expect("content-security-policy header should be present"),
            "frame-ancestors 'none'"
        );

        let body = response.text().await.expect("body should be readable");
        assert!(body.contains("Codex GUI dev runtime stopped"));
        assert!(body.contains("HMR disconnected"));
        assert!(!body.contains("@vite/client"));
        assert!(!body.contains("/src/main.tsx"));

        handle.shutdown().await;
    }

    #[tokio::test]
    async fn dev_runtime_error_route_does_not_replace_proxy_error_route() {
        let handle = start_host(NoopBackend).await;
        let response = reqwest::get(format!(
            "http://127.0.0.1:{}/?threadId=test",
            handle.local_addr().port()
        ))
        .await
        .expect("proxy fallback request should succeed");

        assert_eq!(response.status(), StatusCode::BAD_GATEWAY);
        let body = response.text().await.expect("body should be readable");
        assert!(body.contains("Waiting for Vite"));
        assert!(!body.contains("Codex GUI dev runtime stopped"));

        handle.shutdown().await;
    }
```

- [ ] **Step 2: Run the route tests and verify the new route fails**

Run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-rs
just test -p codex-gui-host dev_runtime_error_route
```

Expected: FAIL because `/__codex-gui/dev-runtime-error` still falls through to `proxy_vite`.

- [ ] **Step 3: Add the dev-only route before fallback**

In `codex-rs/gui-host/src/host.rs`, update the `GuiHostMode::Dev(config)` router construction from:

```rust
            Ok(Router::new()
                .route("/ws", get(crate::ws::ws_handler::<B>))
                .fallback(get(move |uri: Uri| {
                    let config = config.clone();
                    async move { assets::proxy_vite(config, uri).await }
                }))
```

to:

```rust
            let runtime_error_config = config.clone();
            Ok(Router::new()
                .route("/ws", get(crate::ws::ws_handler::<B>))
                .route(
                    "/__codex-gui/dev-runtime-error",
                    get(move |uri: Uri| {
                        let config = runtime_error_config.clone();
                        async move { assets::dev_runtime_error_response(config, uri).await }
                    }),
                )
                .fallback(get(move |uri: Uri| {
                    let config = config.clone();
                    async move { assets::proxy_vite(config, uri).await }
                }))
```

- [ ] **Step 4: Run the route tests and verify they pass**

Run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-rs
just test -p codex-gui-host dev_runtime_error_route
```

Expected: PASS for both route tests.

---

### Task 3: Add Frontend Dev Runtime Circuit Breaker Module

**Files:**
- Create: `codex-gui/src/devRuntimeCircuitBreaker.ts`
- Create: `codex-gui/src/__tests__/devRuntimeCircuitBreaker.test.ts`

- [ ] **Step 1: Write failing Vitest tests**

Create `codex-gui/src/__tests__/devRuntimeCircuitBreaker.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { installDevRuntimeCircuitBreaker } from "../devRuntimeCircuitBreaker";

type HmrCallback = (payload?: unknown) => void;

function createHot() {
  const listeners = new Map<string, HmrCallback>();
  return {
    hot: {
      on(event: string, callback: HmrCallback) {
        listeners.set(event, callback);
      },
    },
    emit(event: string, payload?: unknown) {
      const callback = listeners.get(event);
      if (!callback) {
        throw new Error(`Missing listener for ${event}`);
      }
      callback(payload);
    },
    listenerCount() {
      return listeners.size;
    },
  };
}

describe("dev runtime circuit breaker", () => {
  it("navigates once when Vite HMR disconnects", () => {
    const hmr = createHot();
    const replacements: string[] = [];

    installDevRuntimeCircuitBreaker({
      dev: true,
      hot: hmr.hot,
      pathname: "/",
      replace: (url) => replacements.push(url),
    });

    hmr.emit("vite:ws:disconnect");
    hmr.emit("vite:ws:disconnect");

    expect(replacements).toEqual(["/__codex-gui/dev-runtime-error?reason=hmrDisconnected"]);
  });

  it("navigates once when Vite reports an error without copying payload", () => {
    const hmr = createHot();
    const replacements: string[] = [];

    installDevRuntimeCircuitBreaker({
      dev: true,
      hot: hmr.hot,
      pathname: "/thread/test",
      replace: (url) => replacements.push(url),
    });

    hmr.emit("vite:error", {
      message: "full stack should not enter the URL",
      stack: "stack should not enter the URL",
    });

    expect(replacements).toEqual(["/__codex-gui/dev-runtime-error?reason=viteError"]);
  });

  it("lets the first Vite event win", () => {
    const hmr = createHot();
    const replacements: string[] = [];

    installDevRuntimeCircuitBreaker({
      dev: true,
      hot: hmr.hot,
      pathname: "/",
      replace: (url) => replacements.push(url),
    });

    hmr.emit("vite:error");
    hmr.emit("vite:ws:disconnect");

    expect(replacements).toEqual(["/__codex-gui/dev-runtime-error?reason=viteError"]);
  });

  it("does not install listeners outside dev mode", () => {
    const hmr = createHot();

    installDevRuntimeCircuitBreaker({
      dev: false,
      hot: hmr.hot,
      pathname: "/",
      replace: () => {
        throw new Error("replace should not be called");
      },
    });

    expect(hmr.listenerCount()).toBe(0);
  });

  it("does not navigate from the stable runtime error page", () => {
    const hmr = createHot();
    const replacements: string[] = [];

    installDevRuntimeCircuitBreaker({
      dev: true,
      hot: hmr.hot,
      pathname: "/__codex-gui/dev-runtime-error",
      replace: (url) => replacements.push(url),
    });

    hmr.emit("vite:error");

    expect(replacements).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the focused Vitest test and verify it fails**

Run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm vitest --run src/__tests__/devRuntimeCircuitBreaker.test.ts
```

Expected: FAIL because `../devRuntimeCircuitBreaker` does not exist.

- [ ] **Step 3: Implement the module**

Create `codex-gui/src/devRuntimeCircuitBreaker.ts`:

```ts
const devRuntimeErrorPath = "/__codex-gui/dev-runtime-error";

type DevRuntimeErrorReason = "hmrDisconnected" | "viteError";

type ViteHot = {
  on(event: string, callback: (payload?: unknown) => void): void;
};

type InstallDevRuntimeCircuitBreakerOptions = {
  dev: boolean;
  hot?: ViteHot;
  pathname: string;
  replace: (url: string) => void;
};

let tripped = false;

export function installDevRuntimeCircuitBreaker({
  dev,
  hot,
  pathname,
  replace,
}: InstallDevRuntimeCircuitBreakerOptions): void {
  if (!dev || !hot) {
    return;
  }

  const trip = (reason: DevRuntimeErrorReason) => {
    if (tripped || pathname === devRuntimeErrorPath) {
      return;
    }

    tripped = true;
    replace(`${devRuntimeErrorPath}?reason=${reason}`);
  };

  hot.on("vite:ws:disconnect", () => trip("hmrDisconnected"));
  hot.on("vite:error", () => trip("viteError"));
}

export function resetDevRuntimeCircuitBreakerForTests(): void {
  tripped = false;
}
```

- [ ] **Step 4: Update tests to reset module guard between cases**

Modify the test import in `codex-gui/src/__tests__/devRuntimeCircuitBreaker.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import {
  installDevRuntimeCircuitBreaker,
  resetDevRuntimeCircuitBreakerForTests,
} from "../devRuntimeCircuitBreaker";
```

Add this before the `describe(...)` block:

```ts
beforeEach(() => {
  resetDevRuntimeCircuitBreakerForTests();
});
```

- [ ] **Step 5: Run the focused Vitest test and verify it passes**

Run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm vitest --run src/__tests__/devRuntimeCircuitBreaker.test.ts
```

Expected: PASS for all `dev runtime circuit breaker` tests.

---

### Task 4: Install the Frontend Observer at Startup

**Files:**
- Modify: `codex-gui/src/main.tsx`

- [ ] **Step 1: Confirm the production no-op contract is covered**

No additional test file is required for `main.tsx`. Task 3 already verifies the module does not install listeners when `dev` is false. Keep this task focused on wiring the module into startup.

- [ ] **Step 2: Import and install the circuit breaker before async work**

Modify `codex-gui/src/main.tsx` so the imports include:

```ts
import { installDevRuntimeCircuitBreaker } from "./devRuntimeCircuitBreaker";
```

Add this call after CSS/router imports and before `const container = document.getElementById("root");`:

```ts
installDevRuntimeCircuitBreaker({
  dev: import.meta.env.DEV,
  hot: import.meta.hot,
  pathname: window.location.pathname,
  replace: (url) => window.location.replace(url),
});
```

The top of `main.tsx` should read:

```ts
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { RouterProvider } from "@tanstack/react-router";
import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { ThemeProvider } from "./app/ThemeProvider";
import { store } from "./app/store";
import { installDevRuntimeCircuitBreaker } from "./devRuntimeCircuitBreaker";
import { loadCatalog, resolveInitialLocale } from "./i18n";
import "./index.css";
import { router } from "./router";

installDevRuntimeCircuitBreaker({
  dev: import.meta.env.DEV,
  hot: import.meta.hot,
  pathname: window.location.pathname,
  replace: (url) => window.location.replace(url),
});
```

- [ ] **Step 3: Run focused frontend tests**

Run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm vitest --run src/__tests__/devRuntimeCircuitBreaker.test.ts
```

Expected: PASS.

- [ ] **Step 4: Run frontend type check**

Run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run type-check
```

Expected: PASS.

---

### Task 5: Final Verification

**Files:**
- Verify: `codex-rs/gui-host/src/assets.rs`
- Verify: `codex-rs/gui-host/src/host.rs`
- Verify: `codex-rs/gui-host/src/embedded_pages/dev_runtime_error.html`
- Verify: `codex-gui/src/devRuntimeCircuitBreaker.ts`
- Verify: `codex-gui/src/__tests__/devRuntimeCircuitBreaker.test.ts`
- Verify: `codex-gui/src/main.tsx`

- [ ] **Step 1: Run Rust formatting**

Run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-rs
just fmt
```

Expected: PASS and no unexpected unrelated files changed.

- [ ] **Step 2: Run focused Rust tests**

Run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-rs
just test -p codex-gui-host dev_runtime_error
```

Expected: PASS.

- [ ] **Step 3: Run focused frontend tests**

Run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm vitest --run src/__tests__/devRuntimeCircuitBreaker.test.ts
```

Expected: PASS.

- [ ] **Step 4: Run frontend type check**

Run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run type-check
```

Expected: PASS.

- [ ] **Step 5: Run frontend unit test suite**

Run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run test:unit
```

Expected: PASS.

- [ ] **Step 6: Inspect changed files**

Run:

```bash
cd /Users/jiangsheng/cnb/codex
git status --short
```

Expected: only the planned files plus pre-existing unrelated local changes are present. Do not stage or commit unless the user explicitly asks.

---

## Spec Coverage Self-Review

The plan covers the accepted design as follows:

- Project body only: tasks modify only `codex-rs/gui-host` and `codex-gui`.
- Stable runtime page: Tasks 1 and 2 add `/__codex-gui/dev-runtime-error`.
- New template: Task 1 creates `dev_runtime_error.html` and leaves `dev_proxy_error.html` unchanged.
- `200 OK`: Task 1 asserts the response status.
- Short `reason` enum only: Task 1 normalizes reason; Task 3 only emits `hmrDisconnected` or `viteError`.
- No original URL or payload: Task 3 tests that `vite:error` payload and source URL do not enter the navigation URL.
- One-time guard and path skip: Task 3 tests both.
- First event wins: Task 3 tests event ordering.
- No Vite client on stable page: Tasks 1 and 2 assert no `@vite/client` or `/src/main.tsx`.
- Existing proxy error unchanged: Tasks 1 and 2 assert proxy page content remains separate.
