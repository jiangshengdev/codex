# codex-gui LAN Vite Host Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `codex-gui` LAN GUI sessions stop failing Vite HMR WebSocket startup by exposing the Vite dev server on LAN by default.

**Architecture:** Keep the current `@vite/client` target shape: `ws://<LAN address>:5173/?token=...`. Change only the default Vite bind host from loopback to all interfaces so that target is reachable. Preserve the existing `CODEX_GUI_VITE_*` environment overrides and the explicit HMR `port` / `clientPort` behavior.

**Tech Stack:** Vite 8, React 19, `codex-gui/vite.config.ts`, fnm-managed pnpm, Playwright/Chrome 10-second LAN smoke verification.

---

## File Structure

- Modify: `codex-gui/vite.config.ts`
  - Change the default `viteHost` fallback from `"127.0.0.1"` to `"0.0.0.0"`.
  - Keep `CODEX_GUI_VITE_HOST`, `CODEX_GUI_VITE_PORT`, `CODEX_GUI_VITE_HMR_HOST`, and `CODEX_GUI_VITE_HMR_PORT` overrides.
  - Keep explicit `hmr.port` and `hmr.clientPort`.
- Verify only: `docs/superpowers/research/2026-06-27-codex-gui-lan-hmr-failure/current-findings.md`
  - Use as the root-cause reference during implementation.
- Verify only: `docs/superpowers/research/2026-06-27-codex-gui-lan-hmr-failure/execution-log.md`
  - Append execution evidence if the implementation run continues the same investigation.
- Do not modify:
  - `codex-rs/gui-host/src/assets.rs`
  - `codex-rs/gui-host/src/host.rs`
  - `codex-rs/gui-host/src/ws.rs`
  - any runtime error page or circuit breaker files
  - Vite source under `/Users/jiangsheng/GitHub/vite`

## Task 1: Confirm The Baseline And Toolchain

**Files:**
- Inspect: `codex-gui/vite.config.ts`
- Inspect: `docs/superpowers/research/2026-06-27-codex-gui-lan-hmr-failure/current-findings.md`

- [ ] **Step 1: Re-read the known root cause**

Run:

```sh
sed -n '1,220p' /Users/jiangsheng/cnb/codex/docs/superpowers/research/2026-06-27-codex-gui-lan-hmr-failure/current-findings.md
```

Expected: the notes still say the browser attempts `ws://<LAN address>:5173/?token=...` while Vite listens only on `127.0.0.1:5173`.

- [ ] **Step 2: Inspect the current Vite config**

Run:

```sh
sed -n '1,80p' /Users/jiangsheng/cnb/codex/codex-gui/vite.config.ts
```

Expected: `viteHost` currently falls back to `"127.0.0.1"`, and the HMR block still sets `port` and `clientPort` from `viteHmrPort`.

- [ ] **Step 3: Initialize the user's fnm environment before pnpm checks**

Run from `codex-gui`:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
source <(/opt/homebrew/bin/fnm env --shell zsh)
type -a pnpm
pnpm --version
```

Expected: `pnpm` does not resolve under `/Users/jiangsheng/.cache/codex-runtimes/`, and the version matches the user's project pnpm. If it resolves under `.cache/codex-runtimes`, stop and report the toolchain mismatch before running any pnpm command.

## Task 2: Change The Default Vite Bind Host

**Files:**
- Modify: `codex-gui/vite.config.ts`

- [ ] **Step 1: Make the one-line config change**

Change:

```ts
const viteHost = process.env.CODEX_GUI_VITE_HOST ?? "127.0.0.1";
```

to:

```ts
const viteHost = process.env.CODEX_GUI_VITE_HOST ?? "0.0.0.0";
```

Do not change the adjacent `vitePort`, `viteHmrHost`, or `viteHmrPort` constants.

- [ ] **Step 2: Confirm the HMR block remains explicit**

Verify the server block still has this shape:

```ts
server: {
  host: viteHost,
  port: vitePort,
  hmr: {
    ...(viteHmrHost ? { host: viteHmrHost } : {}),
    port: viteHmrPort,
    clientPort: viteHmrPort,
  },
},
```

Expected: `hmr.port` and `hmr.clientPort` are still explicitly set, so `@vite/client` continues to target port `5173` by default.

## Task 3: Run Static Verification

**Files:**
- Verify: `codex-gui/vite.config.ts`

- [ ] **Step 1: Run Prettier check for the changed file**

Run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
source <(/opt/homebrew/bin/fnm env --shell zsh)
pnpm exec prettier --check vite.config.ts
```

Expected: PASS.

- [ ] **Step 2: Run TypeScript checking**

Run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
source <(/opt/homebrew/bin/fnm env --shell zsh)
pnpm run type-check
```

Expected: PASS.

- [ ] **Step 3: Inspect the focused diff**

Run:

```sh
cd /Users/jiangsheng/cnb/codex
git diff -- codex-gui/vite.config.ts
```

Expected: the diff contains only the fallback host change from `"127.0.0.1"` to `"0.0.0.0"`.

## Task 4: Run The 10-Second LAN HMR Smoke Verification

**Files:**
- Verify: `codex-gui/vite.config.ts`
- Optional append: `docs/superpowers/research/2026-06-27-codex-gui-lan-hmr-failure/execution-log.md`
- Optional update: `docs/superpowers/research/2026-06-27-codex-gui-lan-hmr-failure/current-findings.md`

- [ ] **Step 1: Start or restart Vite with the new default host**

Run from `codex-gui`:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
source <(/opt/homebrew/bin/fnm env --shell zsh)
pnpm run dev
```

Expected: Vite prints a `Local` URL and at least one `Network` URL. The `Network` URL should include port `5173`.

- [ ] **Step 2: Launch the GUI host and choose a LAN URL**

Use the repo GUI launch flow to obtain a fresh LAN GUI URL. The URL should have this shape:

```text
http://<LAN address>:<gui-host-port>/?threadId=<thread>&token=<launch-token>
```

Expected: the chosen address is the GUI host LAN address, not `127.0.0.1`.

- [ ] **Step 3: Visit the LAN URL with hard 10-second browser lifetime**

Use the existing browser-debug flow with console and pageerror capture. The browser process must be terminated after 10 seconds even if the page is still producing output.

Expected capture requirements:

```text
main document status: 200
browser lifetime: 10 seconds
browser process: terminated after timeout
console/pageerror log: saved to disk
```

- [ ] **Step 4: Check the captured log for the old failure**

Search the capture log:

```sh
rg -n -e 'WebSocket closed without opened|ERR_CONNECTION_REFUSED|ws://[^ ]+:5173' /Users/jiangsheng/cnb/codex/.playwright-cli
```

Expected: no high-frequency `WebSocket closed without opened.` pageerror storm. A successful run may still contain normal Vite connection messages, but it must not repeat the old refused `ws://<LAN address>:5173` failure.

- [ ] **Step 5: Record the verification outcome**

If this implementation is executed as part of the existing LAN HMR investigation, append a short entry to:

```text
docs/superpowers/research/2026-06-27-codex-gui-lan-hmr-failure/execution-log.md
```

Include:

```text
- Vite Network URL shown by `pnpm run dev`.
- LAN GUI URL host and port, with token omitted.
- Capture log path.
- Counts for console, pageerror, and requestfailed.
- Whether the old `WebSocket closed without opened.` storm reproduced.
```

If the smoke verification succeeds, update `current-findings.md` to mark the selected fix as verified by the new capture. If it fails, keep `current-findings.md` focused on the new evidence and do not add another speculative fix.

## Commit Boundary

Do not stage or commit while executing this plan unless the user explicitly asks for it. If the user asks for a commit after verification passes, stage only:

```text
codex-gui/vite.config.ts
docs/superpowers/research/2026-06-27-codex-gui-lan-hmr-failure/current-findings.md
docs/superpowers/research/2026-06-27-codex-gui-lan-hmr-failure/execution-log.md
```

Use this commit message if the research notes were updated:

```text
Fix codex-gui LAN HMR dev host
```

Use this commit message if only the Vite config changed:

```text
Expose codex-gui Vite dev server on LAN
```

## Self-Review Notes

- Design coverage: the plan implements the accepted B/A/A/A/A decision sequence: Vite directly listens on LAN, defaults to `0.0.0.0`, keeps explicit HMR `5173`, preserves env overrides, and verifies with a 10-second LAN browser run.
- Scope: the plan intentionally does not add a GUI host WebSocket proxy and does not revive the runtime error circuit breaker.
- Risk: Vite dev HTTP and HMR are exposed to the LAN by default. This is an accepted design decision for this plan.
- Toolchain: all pnpm commands initialize the user's fnm environment first and stop if pnpm resolves to the Codex runtime cache.
