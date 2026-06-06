# Codex GUI Host Packaging/E2E Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成 GUI host MVP 的 prod asset、package root 和端到端验收，证明 `/gui` 输出的本机 URL 可以加载 GUI、完成 same-origin `/ws` handshake，并收到 projection event。

**Architecture:** 本计划执行 `00-roadmap.md` 中的 `08 packaging and end-to-end verification`。它只收尾验证 packaging/e2e，不重新打开 `04` bridge、`05` facade、`06` TUI command 或 `07` frontend store boundary；如发现这些层的问题，先记录 `BLOCKED`，再回到对应已完成 plan 审计。自动化覆盖优先放在 stale Playwright e2e 替换和 `codex-gui` real `dist` prod smoke，最后再做一次手工或 browser-assisted full-stack smoke。

**Tech Stack:** Rust 2024, codex-gui-host, codex-app-server-client, codex-tui, React 19, Vite, Playwright, Vitest, pnpm, `just test`.

---

## Scope

本计划只负责 packaging/e2e 收尾验证。

允许修改：

- `docs/superpowers/plans/2026-05-30-gui-host/08-packaging-e2e-verification.md`
- `codex-gui/e2e/app.spec.ts`
- `codex-rs/gui-host/tests/prod_serves_hashed_asset.rs`

只允许在明确发现 e2e harness 必须调整时修改：

- `codex-gui/playwright.config.ts`

不允许修改：

- `codex-rs/app-server/**`
- `codex-rs/app-server-client/**`
- `codex-rs/tui/**`
- `codex-rs/core/**`
- `codex-rs/app-server-protocol/**`
- `codex-rs/gui-host/src/**`
- `codex-gui/src/**`
- `codex-gui/package.json`
- `codex-gui/pnpm-lock.yaml`
- `codex-gui/pnpm-workspace.yaml`
- `docs/superpowers/specs/**`

停止条件：

- 如果需要改变 authenticated bridge、`in_process.rs` extra-connection、projection fanout 或 cleanup 语义，停止；那属于 `04-minimal-app-server-adapter.md` 回归。
- 如果需要改变 `AppServerClientGuiExt`、`GuiLaunchUrl`、`GuiLaunchError` 或 remote unsupported 行为，停止；那属于 `05-app-server-client-facade.md` 回归。
- 如果需要改变 `/gui` 命令行为、自动打开浏览器、支持 `/gui --open`、`/gui --current` 或 `/gui <threadId>`，停止；那不属于首版 `08`。
- 如果需要让 `guiHostClient.ts` import Redux/React/store，停止；`07` 已锁定 transport client store-free。
- 如果需要新增 user turn、approval、interrupt、tool 调用、browser control、LAN/mobile/public relay 或完整 projection viewer，停止；这些不是 MVP 收尾。
- 如果需要修改 Rust dependencies、`Cargo.toml`、`Cargo.lock` 或 `MODULE.bazel.lock`，停止并重新评估；本计划不应需要 dependency change。

## Source Of Truth

解释冲突时按以下顺序：

1. `docs/superpowers/plans/2026-05-30-gui-host/00-roadmap.md`
2. `docs/superpowers/specs/2026-05-11-codex-gui-host-redesign.md`
3. `docs/superpowers/plans/2026-05-30-gui-host/07-frontend-handshake-store-verification.md`
4. `docs/superpowers/plans/2026-05-30-gui-host/06-tui-gui-command.md`
5. `docs/superpowers/plans/2026-05-30-gui-host/05-app-server-client-facade.md`
6. current source under `codex-gui/**` and `codex-rs/gui-host/**`

Fixed `08` boundaries from `00-roadmap.md`:

- TUI `/gui` 显示本机 URL，不自动打开浏览器。
- Browser loads GUI host page, then connects same-origin `/ws`.
- Browser sends `gui/authenticate -> initialize -> thread/projection/attach`.
- Browser receives at least one `thread/projection/event`.
- `08` owns prod asset, npm package root, and end-to-end verification.
- `08` does not add browser control, user turn, approval, tool calls, LAN/mobile/public relay, or projection viewer.

## File Responsibilities

- `codex-gui/e2e/app.spec.ts`: replace the stale counter template e2e tests with GUI host launch-param and WebSocket handshake e2e tests. It may mock the WebSocket server with Playwright so frontend packaging/e2e can run without a live Rust app-server.
- `codex-rs/gui-host/tests/prod_serves_hashed_asset.rs`: keep the existing temp-dist prod static test and add an env-driven smoke that serves the real `codex-gui/dist` build when `CODEX_GUI_PACKAGE_ROOT` is set by the verification command.
- `codex-gui/playwright.config.ts`: only adjust if the GUI host e2e cannot run with existing Vite dev/preview server settings. Do not change app source to satisfy Playwright.
- `docs/superpowers/plans/2026-05-30-gui-host/08-packaging-e2e-verification.md`: append execution notes and final result only.

## Task 1: Confirm Gates And Current `08` Inputs

**Files:**
- Verify: `docs/superpowers/plans/2026-05-30-gui-host/00-roadmap.md`
- Verify: `docs/superpowers/plans/2026-05-30-gui-host/07-frontend-handshake-store-verification.md`
- Verify: `codex-gui/e2e/app.spec.ts`
- Verify: `codex-gui/package.json`
- Verify: `codex-rs/gui-host/src/config.rs`
- Verify: `codex-rs/gui-host/src/host.rs`
- Modify only if recording execution: `docs/superpowers/plans/2026-05-30-gui-host/08-packaging-e2e-verification.md`

- [ ] **Step 1: Confirm roadmap places `08` after completed `07`**

Run from repo root:

```bash
rg -n '07 frontend handshake/store verification|08 packaging and end-to-end verification|TUI /gui|gui/authenticate|thread/projection/attach|thread/projection/event|不引入 LAN/mobile/public relay|不新增 browser control|不新增 user turn / approval / tool 调用' \
  docs/superpowers/plans/2026-05-30-gui-host/00-roadmap.md
```

Expected: output shows `07 -> 08`, the required e2e path, and the explicit non-goals.

- [ ] **Step 2: Confirm `07` completed and stopped before packaging/e2e**

Run from repo root:

```bash
rg -n '### Final Result|PASS: `guiHostClient.ts` remains store-free|PASS: `App.tsx` remains the React/Redux boundary|PASS: focused App browser-mode test passed|PASS: `07` did not enter packaging/e2e scope|Ready next plan: `08-packaging-e2e-verification.md`' \
  docs/superpowers/plans/2026-05-30-gui-host/07-frontend-handshake-store-verification.md
```

Expected: output confirms `07` is complete and explicitly hands off to `08`.

- [ ] **Step 3: Confirm current e2e file is stale before replacing it**

Run from repo root:

```bash
rg -n 'renders the counter page|updates the counter value|Count|Set increment amount|Decrement value|404' \
  codex-gui/e2e/app.spec.ts
```

Expected: output confirms the current Playwright file still tests the starter counter/not-found app and must be replaced for GUI host MVP verification.

- [ ] **Step 4: Confirm build/e2e scripts and prod package root contract**

Run from repo root:

```bash
rg -n '"build"|"test:e2e"|playwright test|vite build' codex-gui/package.json

rg -n 'CODEX_GUI_HOST_MODE|CODEX_GUI_PACKAGE_ROOT|ProdAssetConfig|dist_dir|prod_dist_dir|GuiHostMode::Prod|fallback_service' \
  codex-rs/gui-host/src/config.rs \
  codex-rs/gui-host/src/assets.rs \
  codex-rs/gui-host/src/host.rs
```

Expected: output confirms `pnpm run build`, `pnpm run test:e2e`, `CODEX_GUI_PACKAGE_ROOT`, and `package_root/dist` are the current packaging contract.

- [ ] **Step 5: Record gate result**

Append this exact result shape under `Execution Notes`:

```markdown
### Task 1 Result: Gates And Inputs

- PASS: `00-roadmap.md` places `08` after completed frontend verification and defines the final `/gui -> /ws -> projection event` e2e path.
- PASS: `07-frontend-handshake-store-verification.md` completed and explicitly stopped before packaging/e2e.
- PASS: `codex-gui/e2e/app.spec.ts` still contains stale counter template tests and needs replacement.
- PASS: `codex-gui` exposes build/e2e scripts and `codex-gui-host` prod mode uses `CODEX_GUI_PACKAGE_ROOT/dist`.
```

If any expected line is missing, stop and replace the relevant `PASS` with `BLOCKED`, including the exact missing pattern and file path.

## Task 2: Replace Stale Playwright E2E With GUI Host Handshake E2E

**Files:**
- Modify: `codex-gui/e2e/app.spec.ts`

- [ ] **Step 1: Replace `app.spec.ts` with GUI host e2e tests**

Replace the entire contents of `codex-gui/e2e/app.spec.ts` with:

```ts
import { expect, type Page, test } from "@playwright/test";

const threadId = "00000000-0000-0000-0000-000000000001";
const subscriptionId = "projection-e2e-subscription";

type RpcRequest = {
  id: number;
  method: string;
  params?: unknown;
};

const attachResponse = {
  subscriptionId,
  snapshot: {
    thread: {
      id: threadId,
      sessionId: threadId,
      forkedFromId: null,
      preview: "Projection e2e thread",
      ephemeral: false,
      modelProvider: "openai",
      createdAt: 1700000000,
      updatedAt: 1700000030,
      status: { type: "idle" },
      path: null,
      cwd: "/tmp/codex-gui-e2e",
      cliVersion: "projection-e2e",
      source: "appServer",
      threadSource: null,
      agentNickname: null,
      agentRole: null,
      gitInfo: null,
      name: "Projection e2e",
      turns: [],
    },
    headCommitId: null,
  },
};

const projectionEvent = {
  threadId,
  subscriptionId,
  commitId: "commit-turn-started",
  parentCommitId: null,
  event: {
    type: "turnStarted",
    notification: {
      threadId,
      turn: {
        id: "turn-in-progress",
        items: [],
        itemsView: "full",
        status: "inProgress",
        error: null,
        startedAt: 1700000010,
        completedAt: null,
        durationMs: null,
      },
    },
  },
};

async function routeGuiHostWebSocket(page: Page): Promise<string[]> {
  const sentMethods: string[] = [];

  await page.routeWebSocket("/ws", (ws) => {
    ws.onMessage((message) => {
      const request = JSON.parse(String(message)) as RpcRequest;
      sentMethods.push(request.method);

      if (request.method === "gui/authenticate") {
        ws.send(JSON.stringify({ jsonrpc: "2.0", id: request.id, result: { authenticated: true } }));
        return;
      }

      if (request.method === "initialize") {
        ws.send(JSON.stringify({ jsonrpc: "2.0", id: request.id, result: {} }));
        return;
      }

      if (request.method === "thread/projection/attach") {
        ws.send(JSON.stringify({ jsonrpc: "2.0", id: request.id, result: attachResponse }));
        ws.send(
          JSON.stringify({
            jsonrpc: "2.0",
            method: "thread/projection/event",
            params: projectionEvent,
          }),
        );
        return;
      }

      ws.send(
        JSON.stringify({
          jsonrpc: "2.0",
          id: request.id,
          error: { code: -32601, message: `unexpected method ${request.method}` },
        }),
      );
    });
  });

  return sentMethods;
}

test("renders a launch-param error when opened outside GUI host", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator("main")).toHaveAttribute("data-gui-host-status", "error");
  await expect(page.getByText("error: Missing threadId query parameter")).toBeVisible();
});

test("authenticates, attaches, and renders the first projection event", async ({ page }) => {
  const sentMethods = await routeGuiHostWebSocket(page);

  await page.goto(`/?threadId=${threadId}#token=e2e-secret-token`);

  await expect(page.locator("main")).toHaveAttribute("data-gui-host-status", "received event");
  await expect(page.getByText(/^yes$/)).toBeVisible();
  await expect(page.getByText(/^1$/)).toBeVisible();
  await expect(page.getByText("turnStarted")).toBeVisible();
  await expect.poll(() => sentMethods).toEqual([
    "gui/authenticate",
    "initialize",
    "thread/projection/attach",
  ]);
  expect(page.url()).not.toContain("#token=");
});
```

Do not keep the counter tests. Do not add projection viewer assertions; the page only needs to show MVP status, attach state, event count, and last event type.

- [ ] **Step 2: Run focused Chromium e2e**

Run from repo root:

```bash
pnpm --dir codex-gui exec playwright test e2e/app.spec.ts --project=chromium
```

Expected: 2 tests pass. If this fails because `page.routeWebSocket` is unavailable, stop and record the exact Playwright error; do not replace it with broad product-code changes.

- [ ] **Step 3: Run full e2e script**

Run from repo root:

```bash
pnpm --dir codex-gui run test:e2e
```

Expected: the GUI host e2e tests pass for the projects configured in `codex-gui/playwright.config.ts`.

- [ ] **Step 4: Record e2e result**

Append this exact result shape under `Execution Notes`:

```markdown
### Task 2 Result: Playwright GUI Host E2E

- PASS: Replaced stale counter Playwright tests with GUI host launch-param and WebSocket handshake e2e coverage.
- PASS: Focused Chromium Playwright e2e passed.
- PASS: `pnpm --dir codex-gui run test:e2e` passed with the configured Playwright projects.
```

If a command fails, replace the relevant `PASS` with `BLOCKED` and include the command plus the first failing assertion or environment error.

## Task 3: Add Real `codex-gui/dist` Prod Smoke For GUI Host

**Files:**
- Modify: `codex-rs/gui-host/tests/prod_serves_hashed_asset.rs`

- [ ] **Step 1: Add env-driven real dist smoke test**

Append these imports near the existing imports in `codex-rs/gui-host/tests/prod_serves_hashed_asset.rs`:

```rust
use std::path::PathBuf;
```

Append these helpers and test to the end of `codex-rs/gui-host/tests/prod_serves_hashed_asset.rs`:

```rust
fn first_module_script_src(html: &str) -> Option<String> {
    let marker = r#"<script type="module" crossorigin src=""#;
    let start = html.find(marker)? + marker.len();
    let rest = &html[start..];
    let end = rest.find('"')?;
    Some(rest[..end].to_string())
}

#[tokio::test]
async fn prod_serves_built_codex_gui_dist_from_package_root_env() {
    let Some(package_root) = std::env::var_os("CODEX_GUI_PACKAGE_ROOT") else {
        eprintln!(
            "skipping real codex-gui dist smoke; CODEX_GUI_PACKAGE_ROOT is not set"
        );
        return;
    };
    let package_root = PathBuf::from(package_root);
    let dist_dir = package_root.join("dist");
    assert!(
        dist_dir.join("index.html").is_file(),
        "expected {} to exist; run `pnpm --dir codex-gui run build` first",
        dist_dir.join("index.html").display()
    );

    let handle = GuiHost::start(
        GuiHostConfig {
            mode: GuiHostMode::Prod(ProdAssetConfig {
                package_root: package_root.clone(),
            }),
        },
        NoopBackend,
    )
    .await
    .expect("host should start with real codex-gui dist");

    let root_response = reqwest::get(format!("http://{}/", handle.local_addr()))
        .await
        .expect("root request should succeed");
    assert_eq!(root_response.status(), StatusCode::OK);
    let html = root_response.text().await.expect("html body should be readable");
    assert!(html.contains(r#"<div id="root"></div>"#));
    let script_src = first_module_script_src(&html).expect("Vite module script should exist");

    let asset_response = reqwest::get(format!("http://{}{}", handle.local_addr(), script_src))
        .await
        .expect("built asset request should succeed");
    assert_eq!(asset_response.status(), StatusCode::OK);
    assert!(
        asset_response
            .headers()
            .get("content-type")
            .and_then(|value| value.to_str().ok())
            .is_some_and(|value| value.contains("javascript")),
        "built module asset should be served as JavaScript"
    );

    handle.shutdown().await;
}
```

Do not use `env!("CARGO_MANIFEST_DIR")` to locate `codex-gui`; this smoke is intentionally driven by the command-provided package root.

- [ ] **Step 2: Format Rust test change**

Run from repo root:

```bash
just fmt
```

Expected: formatting completes successfully.

- [ ] **Step 3: Build real frontend dist**

Run from repo root:

```bash
pnpm --dir codex-gui run build
```

Expected: `codex-gui/dist/index.html` and at least one `codex-gui/dist/assets/*.js` file exist.

- [ ] **Step 4: Run focused GUI host prod smoke with package root set**

Run from repo root:

```bash
(cd codex-rs && CODEX_GUI_PACKAGE_ROOT="$PWD/../codex-gui" just test -p codex-gui-host prod_serves_built_codex_gui_dist_from_package_root_env)
```

Expected: the new test passes and does not print the skip message.

- [ ] **Step 5: Run existing GUI host prod/static tests**

Run from repo root:

```bash
(cd codex-rs && just test -p codex-gui-host prod)
```

Expected: existing prod/static GUI host tests pass. The env-driven real-dist smoke may skip in this command if `CODEX_GUI_PACKAGE_ROOT` is not set; the non-skipping coverage is Step 4.

- [ ] **Step 6: Record prod smoke result**

Append this exact result shape under `Execution Notes`:

```markdown
### Task 3 Result: Real Prod Dist Smoke

- PASS: Added an env-driven `CODEX_GUI_PACKAGE_ROOT` prod smoke for the real `codex-gui/dist` build.
- PASS: `just fmt` passed after Rust test changes.
- PASS: `pnpm --dir codex-gui run build` produced `dist/index.html` and built assets.
- PASS: Focused real-dist GUI host prod smoke passed with `CODEX_GUI_PACKAGE_ROOT` set.
- PASS: Existing GUI host prod/static tests passed.
```

If any command fails, replace the relevant `PASS` with `BLOCKED` and include the exact command plus the first error.

## Task 4: Run Cross-Layer Regression Checks

**Files:**
- Verify: `codex-rs/app-server-client/src/gui.rs`
- Verify: `codex-rs/tui/src/app/gui.rs`
- Verify: `codex-gui/src/features/guiHost/guiHostClient.ts`
- Verify: `codex-gui/src/App.tsx`
- Modify only if recording execution: `docs/superpowers/plans/2026-05-30-gui-host/08-packaging-e2e-verification.md`

- [ ] **Step 1: Re-run focused Rust launch/TUI checks**

Run from repo root:

```bash
(cd codex-rs && just test -p codex-app-server-client launch_gui)
(cd codex-rs && just test -p codex-tui gui_launch)
```

Expected: both focused test groups pass. Do not run workspace-wide `just test` unless the user explicitly approves it.

- [ ] **Step 2: Re-run focused frontend checks from `07`**

Run from repo root:

```bash
pnpm --dir codex-gui exec vitest --run src/features/guiHost/guiHostClient.test.ts src/features/projection/__tests__/projectionSlice.test.ts
pnpm --dir codex-gui exec vitest --config=vitest.browser.config.ts --run src/__tests__/App.browser.test.tsx
pnpm --dir codex-gui run type-check
pnpm --dir codex-gui run format
```

Expected: all commands pass. Do not run `pnpm --dir codex-gui run build` here; build was already covered in Task 3.

- [ ] **Step 3: Check for forbidden scope drift**

Run from repo root:

```bash
git diff --name-only
```

Expected: changed files are limited to:

```text
codex-gui/e2e/app.spec.ts
codex-rs/gui-host/tests/prod_serves_hashed_asset.rs
docs/superpowers/plans/2026-05-30-gui-host/08-packaging-e2e-verification.md
```

If `codex-gui/playwright.config.ts` was changed, confirm the change is only an e2e harness adjustment and record why it was necessary.

- [ ] **Step 4: Record regression result**

Append this exact result shape under `Execution Notes`:

```markdown
### Task 4 Result: Cross-Layer Regression Checks

- PASS: Focused `codex-app-server-client` GUI launch tests passed.
- PASS: Focused `codex-tui` GUI launch tests passed.
- PASS: Focused frontend unit/browser/type/format checks passed.
- PASS: Changed files stayed within the `08` allowed scope.
```

If any verification failed, replace the relevant `PASS` with `BLOCKED` and include the exact command plus first failure.

## Task 5: Manual Full-Stack `/gui` Smoke

**Files:**
- Modify only if recording execution: `docs/superpowers/plans/2026-05-30-gui-host/08-packaging-e2e-verification.md`

- [ ] **Step 1: Start Vite for dev-mode GUI assets**

Run from repo root in one terminal:

```bash
pnpm --dir codex-gui run dev
```

Expected: Vite listens on `http://127.0.0.1:5173`.

- [ ] **Step 2: Start Codex TUI in dev GUI mode**

Run from repo root in a second terminal:

```bash
CODEX_GUI_HOST_MODE=dev CODEX_GUI_VITE_URL=http://127.0.0.1:5173 just codex
```

Expected: Codex TUI starts normally.

- [ ] **Step 3: Request a GUI URL from the primary thread**

In the TUI, start or resume a normal primary thread, then submit:

```text
/gui
```

Expected: the transcript shows a line beginning with:

```text
GUI URL: http://127.0.0.1:
```

The URL must include `?threadId=` and `#token=`.

- [ ] **Step 4: Open the URL in a browser and confirm attach**

Open the exact URL from Step 3 in a browser.

Expected:

- Page heading is `GUI host`.
- `status` eventually becomes `attached`.
- `attached` is `yes`.
- `events` may still be `0` immediately after attach.
- `last event` may still be `none` immediately after attach.
- Browser location no longer contains `#token=`.

- [ ] **Step 5: Trigger a real projectable notification**

After the browser is attached, trigger one real notification that `thread/projection/event` can wrap. Prefer a local shell stimulus because it does not depend on model output. In the same TUI primary thread, submit:

```text
!printf 'gui-projection-smoke\n'
```

Expected:

- Browser `status` becomes `received event`.
- Browser `events` is at least `1`.
- Browser `last event` is a projection event type such as `itemStarted` or `itemCompleted`.

If the local shell stimulus cannot run in the current environment, use a normal real turn as the fallback stimulus:

```text
Reply with OK only.
```

Expected fallback result: browser `status` becomes `received event`, `events` is at least `1`, and `last event` is a projection event type such as `turnStarted`, `itemStarted`, or `turnCompleted`.

Do not use `/debug-config` for this step. `/debug-config` only updates local TUI transcript history and does not guarantee an app-server `ServerNotification::{TurnStarted, TurnCompleted, ItemStarted, ItemCompleted}` after projection attach.

- [ ] **Step 6: Close or refresh the browser**

Close the tab or refresh it.

Expected: TUI remains usable, the primary thread is still active, and there is no visible panic or app-server shutdown.

- [ ] **Step 7: Stop dev processes**

Stop the TUI and Vite process.

Expected: both processes exit cleanly. Do not leave background dev servers running.

- [ ] **Step 8: Record manual smoke result**

Append this exact result shape under `Execution Notes`:

```markdown
### Task 5 Result: Manual Full-Stack `/gui` Smoke

- PASS: Vite served dev GUI assets on `127.0.0.1:5173`.
- PASS: TUI `/gui` displayed a loopback URL with `threadId` and launch token.
- PASS: Browser loaded the GUI host page, authenticated, attached, and cleared the launch token.
- PASS: A real shell or turn stimulus after attach produced at least one projection event in the browser.
- PASS: Browser close/refresh did not break the TUI primary thread.
- PASS: Dev processes were stopped after verification.
```

If manual verification is not possible in the current environment, replace the relevant `PASS` lines with `BLOCKED` and include the exact reason, such as unavailable browser, no interactive TUI, or missing local credentials.

## Task 6: Finalize `08`

**Files:**
- Modify: `docs/superpowers/plans/2026-05-30-gui-host/08-packaging-e2e-verification.md`

- [ ] **Step 1: Record final result**

Append this exact result shape under `Execution Notes`:

```markdown
### Final Result

- PASS: Stale counter e2e tests were replaced by GUI host launch-param and WebSocket handshake e2e coverage.
- PASS: Real `codex-gui/dist` build was served through `codex-gui-host` prod mode with `CODEX_GUI_PACKAGE_ROOT`.
- PASS: Focused Rust and frontend regressions passed.
- PASS: Manual `/gui` full-stack smoke passed or environment limitations were recorded above.
- PASS: `08` did not reopen bridge, TUI command, app-server-client facade, or frontend store boundaries.
```

If any verification is blocked, replace the relevant `PASS` with `BLOCKED` and do not claim MVP completion.

- [ ] **Step 2: Review changed files**

Run from repo root:

```bash
git diff --check
git diff --name-only
```

Expected: no whitespace errors. Changed files remain within `08` scope.

- [ ] **Step 3: Commit only the `08` changes if requested**

If the user asks to commit, stage only allowed files:

```bash
git add \
  docs/superpowers/plans/2026-05-30-gui-host/08-packaging-e2e-verification.md \
  codex-gui/e2e/app.spec.ts \
  codex-rs/gui-host/tests/prod_serves_hashed_asset.rs
git diff --cached --name-only
git commit -m "test(gui): verify GUI host packaging e2e"
```

Expected staged paths are limited to the files above. If only this plan file changed, use:

```bash
git add docs/superpowers/plans/2026-05-30-gui-host/08-packaging-e2e-verification.md
git diff --cached --name-only
git commit -m "docs(gui-host): add packaging e2e plan"
```

Do not stage unrelated local changes.

## Execution Notes

Append execution results here when this plan is run. Keep this section append-only.

### Task 1 Result: Gates And Inputs

- PASS: `00-roadmap.md` places `08` after completed frontend verification and defines the final `/gui -> /ws -> projection event` e2e path.
- PASS: `07-frontend-handshake-store-verification.md` completed and explicitly stopped before packaging/e2e.
- PASS: `codex-gui/e2e/app.spec.ts` still contains stale counter template tests and needs replacement.
- PASS: `codex-gui` exposes build/e2e scripts and `codex-gui-host` prod mode uses `CODEX_GUI_PACKAGE_ROOT/dist`.

### Task 2 Result: Playwright GUI Host E2E

- PASS: Replaced stale counter Playwright tests with GUI host launch-param and WebSocket handshake e2e coverage.
- PASS: Focused Chromium Playwright e2e passed.
- PASS: `pnpm --dir codex-gui run test:e2e` passed with the configured Playwright projects.

### Task 3 Result: Real Prod Dist Smoke

- PASS: Added an env-driven `CODEX_GUI_PACKAGE_ROOT` prod smoke for the real `codex-gui/dist` build.
- PASS: `just fmt` passed after Rust test changes.
- PASS: `pnpm --dir codex-gui run build` produced `dist/index.html` and built assets.
- PASS: Focused real-dist GUI host prod smoke passed with `CODEX_GUI_PACKAGE_ROOT` set.
- PASS: Existing GUI host prod/static tests passed.

### Task 4 Result: Cross-Layer Regression Checks

- PASS: Focused `codex-app-server-client` GUI launch tests passed.
- PASS: Focused `codex-tui` GUI launch tests passed.
- PASS: Focused frontend unit/browser/type/format checks passed.
- PASS: Changed files stayed within the `08` allowed scope.

### Task 5 Result: Manual Full-Stack `/gui` Smoke

- PASS: Vite served dev GUI assets on `127.0.0.1:5173`.
- PASS: TUI `/gui` displayed a loopback URL with `threadId` and launch token.
- PASS: Browser loaded the GUI host page, authenticated, attached, and cleared `#token`; the page remained usable at `status=attached`, `events=0`, and `last event=none`.
- BLOCKED: Manual projection-event verification used `/debug-config`, which only updates local TUI transcript history and is not a valid projectable notification stimulus; rerun this smoke with a real shell or turn stimulus after attach.
- PASS: Browser close did not break the TUI primary thread; the TUI remained running and accepted `/quit`.
- PASS: Dev processes were stopped after verification.

### Final Result

- PASS: Stale counter e2e tests were replaced by GUI host launch-param and WebSocket handshake e2e coverage.
- PASS: Real `codex-gui/dist` build was served through `codex-gui-host` prod mode with `CODEX_GUI_PACKAGE_ROOT`.
- PASS: Focused Rust and frontend regressions passed.
- BLOCKED: Manual `/gui` full-stack projection-event smoke used an invalid or insufficient stimulus (`/debug-config`); attach/auth succeeded, but projection-event verification must be rerun with a real shell or turn stimulus after attach.
- PASS: `08` did not reopen bridge, TUI command, app-server-client facade, or frontend store boundaries.

### Review Follow-up Result

- PASS: Tightened Playwright WebSocket mock to reject missing launch tokens and unexpected `threadId` values before sending the projection event.
- PASS: Replaced exact Vite script tag marker parsing with module-script attribute parsing that tolerates attribute order changes.
- PASS: Re-ran focused Chromium e2e, full Playwright e2e, GUI host prod tests with `CODEX_GUI_PACKAGE_ROOT`, and the module-script parser unit test after review fixes.

### Task 5 Rerun Result: Manual Full-Stack `/gui` Smoke With Projectable Stimulus

- PASS: Vite served dev GUI assets on `127.0.0.1:5173`.
- PASS: TUI `/gui` displayed a loopback URL with `threadId=019e9b3d-917d-7d40-ae7b-3b78e573417a` and a launch token.
- PASS: Browser loaded the GUI host page, authenticated, attached, and cleared `#token`; before stimulus it showed `status=attached`, `events=0`, and `last event=none`.
- PASS: A real local shell stimulus after attach (`!printf 'gui-projection-smoke\n'`) produced projection events in the browser; final observed state was `status=received event`, `events=4`, and `last event=turnCompleted`.
- PASS: Browser close did not break the TUI primary thread; the TUI accepted `/quit` and exited normally.
- PASS: Dev processes were stopped after verification, with no leftover Vite or TUI process found.

### Final Result Update

- PASS: Corrected manual `/gui` full-stack smoke passed with a real projectable shell stimulus after attach.
- PASS: The earlier `BLOCKED` was caused by an invalid `/debug-config` stimulus, not by a demonstrated `/gui` attach or projection fanout failure.

## Self-Review Checklist

- [ ] This plan executes `08` and does not create a `09`.
- [ ] This plan preserves the `04/05/06/07` boundaries instead of redesigning bridge, facade, TUI, or frontend store behavior.
- [ ] This plan replaces stale counter Playwright tests with GUI host MVP e2e coverage.
- [ ] This plan verifies real `codex-gui/dist` with `CODEX_GUI_PACKAGE_ROOT`.
- [ ] This plan includes focused Rust, frontend, and manual full-stack verification.
- [ ] This plan does not add LAN/mobile/public relay, browser control, user turn, approval, tool calls, or projection viewer behavior.
