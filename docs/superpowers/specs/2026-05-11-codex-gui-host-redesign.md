# Codex GUI Host Redesign

日期：2026-05-11

状态：设计草案。本文替代 `2026-05-10-codex-gui-host-design.md` 作为长期方案的规范来源。

## 背景

GUI 仍然定位为从 TUI 启动的 companion surface：TUI 负责终端交互、输入、approval 和复杂控制，GUI 负责浏览器中更适合图形界面的观察能力。

旧方案把 `GuiHost` 放在 `codex-app-server` 内部，并让 `codex-tui` 直接依赖 `codex-app-server`。这个原型验证了本机 host、静态资源、dev proxy、launch token 和 browser-safe `/ws` 认证，但还没有把认证后的 WebSocket 接入 app-server JSON-RPC / projection pipeline。认证成功后的允许消息只被白名单检查，并没有产生真正的 `initialize` response、`thread/projection/attach` response 或 `thread/projection/event` notification。

上游 tag 更新频繁，长期维护需要把冲突面控制在少数薄入口。新版设计从一开始采用独立 `codex-gui-host` crate，将 browser-safe host shell 与 app-server projection 业务分离。

## 目标

- 在 TUI 中通过 `/gui` 启动或复用本机 GUI host。
- `/gui` 默认只在 TUI 中显示 URL，不自动打开浏览器。
- 浏览器从 GUI host 同源加载页面资源，并连接同源 `/ws`。
- `/ws` 使用 launch token 做 browser-safe 首帧认证。
- 认证后的 WebSocket 通过 app-server bridge 接入现有 JSON-RPC / projection pipeline。
- 首版必须能在浏览器 WebSocket frames 中看到真实数据传输：
  - `gui/authenticate` response
  - `initialize` response
  - `thread/projection/attach` response
  - `thread/projection/event` notification
- 前端首版只显示简单连接阶段状态，不把 projection snapshot/event 写入 store，不渲染 timeline/UI。
- 新设计文档自包含，不依赖旧设计作为规范来源。

## 非目标

首版不实现：

- 浏览器直连现有 app-server remote WebSocket。
- 完整 app-server v2 gateway。
- GUI timeline、snapshot、event 详情渲染。
- projection 数据接入 Redux/store。
- `/gui --open`、`/gui --current`、`/gui <threadId>`。
- 自动打开浏览器。
- 局域网、手机访问、Tailscale 或非 loopback bind。
- Vite 自动启动、端口扫描或 dev/prod 自动 fallback。
- GUI host 独立 daemon 化。
- 新增 projection protocol surface。首版复用现有 `initialize`、`thread/projection/attach`、`thread/projection/detach`、`thread/projection/event`。

## 架构

新增 crate：

```text
codex-rs/gui-host
  crate name: codex-gui-host
```

依赖方向：

```text
codex-tui        -> codex-gui-host
codex-app-server -> codex-gui-host
codex-gui-host   -> does not depend on codex-app-server
```

`GuiBackend` trait 放在 `codex-gui-host` 是刻意的：host shell 定义它需要的最小后端接口，`codex-app-server` 只实现这个接口，不把 app-server 业务反向拉进 host crate。如果未来出现多个 host 或多个 backend 共享同一协议边界，可以再抽出更小的 `codex-gui-protocol` crate；首版不为单一接口增加额外 crate。

运行结构：

```text
TUI
  ├─ handles /gui
  ├─ lazy-starts/reuses GuiHost
  ├─ passes primary_thread_id into launch URL
  └─ prints URL in transcript

codex-gui-host
  ├─ binds 127.0.0.1:0
  ├─ serves/proxies GUI assets
  ├─ exposes same-origin /ws
  ├─ validates Host and Origin
  ├─ authenticates first frame with launch token
  ├─ filters browser-to-server JSON-RPC methods
  ├─ filters server-to-browser notifications
  └─ delegates authenticated traffic to a GuiBackend bridge

codex-app-server
  ├─ implements GuiBackend
  ├─ adapts authenticated GUI traffic into existing app-server JSON-RPC pipeline
  ├─ owns thread/projection attach and detach
  ├─ owns projection notification fanout
  └─ owns connection cleanup semantics

Browser GUI
  ├─ loads page from GuiHost
  ├─ reads launch token from URL fragment or sessionStorage
  ├─ authenticates on /ws
  ├─ sends initialize
  ├─ sends thread/projection/attach
  └─ displays simple connection status
```

TUI 不作为数据转发层。TUI 不解析 projection event，不参与 browser data forwarding。

`codex-gui-host` 不处理 app-server 业务。它只负责 browser-safe HTTP/WebSocket shell、安全边界和 allowlist。`codex-app-server` 通过 bridge 把认证后的连接接入现有 app-server 处理链。

运行时拓扑上，首版不引入 GUI daemon，也不通过子进程 IPC 连接 app-server。`codex` binary 是 composition root：它同时链接 `codex-tui`、`codex-gui-host` 和 `codex-app-server`，并把 `codex-app-server` 的 `GuiBackend` implementation 注入 TUI 启动的 `GuiHost`。`codex-tui` crate 仍然不直接依赖 `codex-app-server`。

## Crate 边界

`codex-gui-host` 拥有：

- `GuiHost`
- `GuiHostConfig`
- `GuiHostMode`
- `DevAssetProxyConfig`
- `ProdAssetConfig`
- `GuiHostHandle`
- `LaunchToken`
- launch URL formatting
- HTTP asset serving
- dev Vite proxy
- `/ws` upgrade
- Host / Origin validation
- `gui/authenticate` first-frame auth
- client method allowlist
- server notification allowlist
- WebSocket pump framework
- bridge trait definitions

`codex-gui-host` 不拥有：

- app-server request processors
- thread store
- projection subscription state
- projection fanout implementation
- app-server protocol schema
- TUI state
- npm packaging policy

`codex-app-server` owns:

- `GuiBackend` implementation
- conversion between authenticated GUI connection and existing app-server JSON-RPC connection lifecycle
- projection subscription cleanup through existing close semantics

`codex-tui` owns:

- `/gui` slash command surface
- primary thread selection
- host lifecycle within one TUI session
- transcript message containing the launch URL

## Bridge 形态

`codex-gui-host` 暴露一个通用 bridge trait。名称和具体 signature 可在实现计划中细化，但职责边界固定：

```rust
/// Backend that connects an authenticated GUI JSON-RPC stream to an application server.
pub trait GuiBackend: Send + Sync {
    fn connect(
        &self,
        connection: AuthenticatedGuiConnection,
    ) -> impl std::future::Future<Output = anyhow::Result<()>> + Send;
}
```

首版按 generic backend injection 设计，不要求 `GuiBackend` dyn-compatible。若实现计划需要 `Box<dyn GuiBackend>` 或运行时替换 backend，必须把 trait signature 改成 boxed future 等 dyn-compatible 形态，而不是直接使用上面的 RPITIT signature。

概念数据流：

```text
browser text frame
  -> codex-gui-host auth/filter
  -> AuthenticatedGuiConnection inbound
  -> codex-app-server GuiBackend implementation
  -> existing app-server JSON-RPC processor

app-server outgoing JSON-RPC
  -> GuiBackend outbound
  -> codex-gui-host response/notification filter
  -> browser text frame
```

`codex-gui-host` 不把 `initialize`、`thread/projection/attach` 或 `thread/projection/detach` 实现为直接业务 API。它只转发允许的 JSON-RPC traffic。业务语义必须来自 app-server 现有 pipeline，避免出现第二套 projection processor。

`connect()` future 必须持有 authenticated connection，直到底层 WebSocket / inbound stream 关闭或 host 主动取消该 future。连接关闭或 future 被 drop 时，`GuiBackend` 必须触发现有 app-server connection cleanup，以清理 projection subscription。浏览器刷新或关闭 tab 不需要额外 server-side grace period。首版不增加单独的 `on_close` hook。

## `/gui` 入口

`/gui` 首版始终打开主 thread：

```text
threadId = primary_thread_id
```

它不跟随当前 TUI 显示的子代理、side conversation 或临时视图。未来可以新增 `/gui --current` 或 `/gui <threadId>`，但不属于首版。

第一次执行 `/gui` 时，TUI 懒启动 `GuiHost`。同一 TUI session 内后续 `/gui` 复用同一个 host、同一个随机端口和同一个 launch token。

TUI 显示的 URL 形如：

```text
http://127.0.0.1:<port>/?threadId=<primary-thread-id>#token=<launch-token>
```

`threadId` 放在 query 中，因为它不是认证 secret。写入 URL 前必须做 URL encoding。`launch-token` 放在 fragment 中，避免随着普通 HTTP 请求发送到 server 或进入常规 HTTP access log。

如果 `primary_thread_id` 尚不可用，`/gui` 直接在 TUI 中提示当前 session 尚未准备好打开 GUI，不启动空 host。

首版 `/gui` 不自动打开浏览器。TUI transcript 显示完整 URL，并提示用户在本机浏览器中打开。这样用户可以先打开 DevTools，再访问 URL，便于生产环境调试。

## WebSocket 认证

浏览器连接：

```text
ws://127.0.0.1:<port>/ws
```

浏览器原生 WebSocket 无法设置 `Authorization` header，因此 GUI host `/ws` 不复用 remote WebSocket 的 bearer-header 认证。

认证流程：

1. TUI 为当前 `GuiHost` 生成 launch token。
2. TUI 显示带 `#token=...` 的 GUI URL。
3. 前端读取 `location.hash`。
4. 前端把 token 写入 `sessionStorage`。
5. 前端调用 `history.replaceState` 清除 URL fragment。
6. 前端建立同源 `/ws`。
7. `/ws` 建立后，前端发送第一条认证消息。
8. GUI host 验证 token 成功后，才把后续 traffic 交给 bridge。

第一条 WebSocket text frame 必须是 JSON-RPC 2.0 request：

```json
{"jsonrpc":"2.0","id":1,"method":"gui/authenticate","params":{"token":"<launch-token>"}}
```

认证成功返回：

```json
{"jsonrpc":"2.0","id":1,"result":{"authenticated":true}}
```

GUI host 只在 `gui/authenticate` 完成后才开始代理后续 JSON-RPC traffic 到 backend。因此认证 request 的 `id` 属于 host-local handshake，即使浏览器随后对 `initialize` 复用 `id:1`，两个 id 空间也不会重叠。

认证失败、首帧不是 `gui/authenticate`、payload 格式错误或 token 缺失时，GUI host 以 WebSocket close code `1008` 关闭连接。失败路径不得创建 app-server connection；如果实现中已创建底层资源，必须立即 cleanup，且不得放行任何业务 JSON-RPC。

`/ws` upgrade 成功后，GUI host 必须对第一条 text frame 设置接收超时。首版建议 5 秒；超时按认证失败处理，使用 close code `1008`，且不得创建 app-server connection。

launch token 使用系统 CSPRNG 生成，至少 128 位熵，使用 base64url 或等价 URL-safe 编码。token 对 server 是 opaque 字符串，只做直接匹配。

launch token 在同一 TUI session 内可复用，支持刷新页面、多次 `/gui` 和多个本机 browser tab。token 随 `GuiHost` / TUI 进程退出失效。首版不要求 token 单次使用。

## Token 刷新策略

前端使用 fragment 首次引导 + `sessionStorage` 同 tab 恢复：

```text
首次打开:
  read #token
  save to sessionStorage
  clear fragment

刷新:
  no #token
  read token from sessionStorage
```

这样 production 调试时，用户可以打开页面后再刷新以观察 Network / WebSocket frames，而不会因为 fragment 已清理导致 token 丢失。

限制：

- 复制清理后的 URL 到新 tab 会缺 token。
- 跨浏览器或跨 tab 分享清理后的 URL 不保证可用。
- 多 tab 复用 token 指每个 tab 都通过 TUI 显示的带 fragment URL 进入，或重新执行 `/gui` 取得同一个 session 的完整 URL。
- 这是预期行为；token 不应长期保留在地址栏或 query 中。

## 本机安全边界

首版安全模型：

```text
loopback bind + short-lived launch token + strict Host/Origin + JSON-RPC allowlist
```

GUI host 只绑定：

```text
127.0.0.1:0
```

所有 HTTP 请求和 WebSocket upgrade 都必须校验 `Host`，只接受严格等于：

```text
127.0.0.1:<port>
```

默认不接受 `localhost:<port>`、其他 loopback 名称、缺失 Host 或任意可解析到 loopback 的 DNS 名称。

WebSocket `Origin` 必须严格等于：

```text
http://127.0.0.1:<port>
```

缺失或不匹配的 Origin 默认拒绝。未来如果支持非浏览器客户端或局域网访问，必须通过显式配置扩展 allowlist，而不是放宽首版默认策略。

GUI host 控制的页面和静态资源响应应发送 `X-Frame-Options: DENY`，并通过 CSP `frame-ancestors 'none'` 禁止被其它页面 iframe。dev proxy 响应也应尽量追加这些 header，除非 Vite/HMR 的具体实现要求更窄的例外。

## JSON-RPC allowlist

首版允许 browser-to-server request：

```text
initialize
thread/projection/attach
thread/projection/detach
```

首版允许 server-to-browser notification：

```text
thread/projection/event
```

JSON-RPC response 和 error 必须正常放行，因为它们是已允许 request 的结果。

GUI host 不是完整 app-server v2 gateway。任何不在 allowlist 中的 browser-to-server request 都不得进入 app-server processor。拒绝策略可以是 JSON-RPC error 或 WebSocket close；具体错误码在实现计划中确定。

Browser-to-server JSON-RPC notification 首版默认全部拒绝，不进入 app-server processor。未来如果前端需要发送 notification，必须在 allowlist 中显式新增 method 和测试。

Server-to-browser notification 只放行 `thread/projection/event`。其它 server notification 不发送到 browser。

`thread/projection/attach`、`thread/projection/detach` 和 `thread/projection/event` 的 payload、`subscriptionId`、`headCommitId`、`commitId`、`parentCommitId` 语义沿用现有 projection protocol。本文不新增 projection schema。

## 静态资源模式

GUI host 支持 dev 和 prod 两种资源来源。模式由 build profile 默认决定：

```text
debug build   -> dev
release build -> prod
```

可以用 `CODEX_GUI_HOST_MODE=dev|prod` 覆盖 build profile 默认值，供 release build 的 dev smoke test 或 CI 场景使用。该覆盖不做自动 fallback；非法值直接报错，production package 不应依赖它改变模式。

不做自动 fallback。debug/dev 下 Vite 不可用时提示开发者启动 Vite；release/prod 下资源路径缺失时提示安装或发布包不完整。

### Dev

dev 模式只使用 Vite dev server。默认地址：

```text
http://127.0.0.1:5173
```

允许 dev-only 环境变量 `CODEX_GUI_VITE_URL` 覆盖 Vite 地址。GUI host 不扫描常见端口，不自动发现 Vite，不自动运行 npm/pnpm。

浏览器仍然打开 GUI host URL，而不是 Vite URL。GUI host 反向代理 Vite 页面资源，使页面和 projection `/ws` 保持同源。

Vite HMR 首版不经 GUI host `/ws`，避免与 projection WebSocket 混用。dev 前端配置应把 HMR WebSocket 显式指向 Vite dev server。

### Prod

prod 模式只按 npm 包目录结构相对路径读取 GUI 构建产物。npm package root 由 Node CLI wrapper 启动 Rust binary 时通过内部环境变量传递：

```text
CODEX_GUI_PACKAGE_ROOT
```

该环境变量表示 GUI package root，不直接表示 `dist` 目录。prod 下 GUI dist 固定为：

```text
$CODEX_GUI_PACKAGE_ROOT/dist/
```

prod 模式不依赖 cwd，不优先依赖 executable path，也不 fallback 到 Vite。`CODEX_GUI_PACKAGE_ROOT` 缺失或 `dist/` 不存在时，`/gui` 报错并提示当前安装缺少 GUI package root 或 GUI 构建产物。

prod 静态资源应区分缓存策略：HTML entry 使用 no-cache 或等价短缓存，带 fingerprint 的 JS/CSS/assets 可以使用 long-cache immutable header。

## 前端首版行为

前端首版只做 transport verification：

1. 页面从 GUI host 加载成功。
2. 页面读取 `threadId` query。
3. 页面从 fragment 或 `sessionStorage` 读取 launch token。
4. 页面清理 fragment。
5. 页面连接同源 `/ws`。
6. 页面发送 `gui/authenticate`。
7. 认证成功后发送 `initialize`。
8. `initialize` 成功后发送 `thread/projection/attach`。
9. 页面根据收到的 response / notification 显示简单状态。

页面状态可以包括：

```text
connecting
authenticated
initialized
attached
received event
error: ...
```

前端不把 projection snapshot/event 写入 Redux/store，不渲染 timeline、snapshot 或 event UI。

## 生命周期

GUI host 生命周期绑定 TUI session：

- TUI 启动时不启动 GUI host。
- 第一次 `/gui` 懒启动。
- 同一 TUI session 复用同一个 GUI host 和同一个 launch token。
- 每个 TUI session 拥有独立 host、随机端口和 launch token。
- 多个本机 browser tab 可以同时连接同一个 host。
- TUI 进程退出时 GUI host 退出，token 失效。
- 浏览器连接关闭时，app-server bridge 触发现有 connection cleanup，清理 projection subscription。

## 错误处理

首版需要覆盖：

- `primary_thread_id` 不存在：TUI 提示当前 session 尚未准备好打开 GUI。
- dev Vite 不可用：TUI 或页面请求返回开发者可执行提示，包含 Vite 地址。
- prod `CODEX_GUI_PACKAGE_ROOT` 缺失：TUI 提示当前安装缺少 GUI package root。
- prod `dist/` 缺失或不可读：TUI 提示 GUI 构建产物缺失或不可读。
- Host/Origin 校验失败：GUI host 拒绝请求。
- launch token 缺失或错误：GUI host 关闭 `/ws`，不创建 app-server connection。
- JSON-RPC method 不在 allowlist：GUI host 拒绝，且不进入 app-server processor。
- app-server bridge 失败：browser 收到 JSON-RPC error 或连接关闭，页面显示 error 状态。

## 测试策略

测试靠近所属 crate/module，避免把 GUI 生命周期测试集中放进 TUI 大型测试文件。

### `codex-gui-host`

覆盖：

- loopback ephemeral bind。
- launch URL 使用 query `threadId` 和 fragment token。
- CSPRNG token 生成格式和最低熵约束。
- Host/Origin strict validation。
- `gui/authenticate` 成功和失败路径。
- client request allowlist。
- server notification allowlist。
- dev Vite proxy。
- prod `$CODEX_GUI_PACKAGE_ROOT/dist` static serving。
- 多 tab 复用同一个 token。
- 不同 host token 隔离。
- shutdown 后 server task 结束。

### `codex-app-server`

覆盖 browser-style end-to-end projection transport：

- auth -> `initialize` -> `thread/projection/attach` 返回 response。
- thread 产生 projection update 后，browser 收到 `thread/projection/event`。
- 非 allowlist request 不进入 app-server processor。
- server-to-browser 非 allowlist notification 不发送。
- browser close / refresh 触发 projection subscription cleanup。

这些测试应放在 app-server integration tests 或 focused bridge tests 中，不放在 TUI 层。

### `codex-tui`

只覆盖薄入口：

- `/gui` slash command 可见并 dispatch。
- `AppEvent::OpenGui` 处理后启动或复用 host。
- `primary_thread_id` 不存在时显示提示。
- 有 primary thread 时 transcript 显示 launch URL。

TUI 不测试 WebSocket 细节，不依赖 `tokio-tungstenite`。

### `codex-gui`

覆盖：

- launch params 读取。
- token 写入 `sessionStorage`。
- fragment 清理。
- refresh 后从 `sessionStorage` 恢复 token。
- WebSocket message order：`gui/authenticate` -> `initialize` -> `thread/projection/attach`。
- 页面状态更新。

E2E 可验证页面进入 `attached` 或 `received event` 状态；不要求渲染 projection 内容。

## 迁移策略

当前 `port/gui-host` 原型作为参考，不作为最终结构直接合并。

建议实施顺序：

1. 新建 `codex-gui-host` crate 和 Bazel/Cargo wiring。
2. 迁移 host shell：bind、assets、token、auth、allowlist、URL。
3. 让 TUI 依赖 `codex-gui-host`，不依赖 `codex-app-server`。
4. 实现 `/gui` 只显示 URL。
5. 在 app-server 实现 `GuiBackend` bridge。
6. 补 app-server browser-style projection transport tests。
7. 更新 `codex-gui` handshake 和简单状态。
8. 最后处理 npm packaging。

提交应分层，便于后续 rebase：

```text
1. codex-gui-host crate skeleton
2. host auth/assets/allowlist
3. TUI thin /gui entry
4. app-server bridge
5. frontend handshake/status
6. packaging
7. integration/e2e tests
```

## 验收标准

首版完成时必须满足：

- `/gui` 在 TUI 中显示本机 URL。
- 浏览器打开 URL 后页面连接同源 `/ws`。
- URL fragment token 被清理，刷新后同 tab 仍可通过 `sessionStorage` 连接。
- 无效 token 或首帧不是 `gui/authenticate` 时，连接以 `1008` 关闭，且没有创建 app-server connection。
- WebSocket frames 中可见：
  - `gui/authenticate` response
  - `initialize` response
  - `thread/projection/attach` response
  - 至少一个 `thread/projection/event` notification
- 页面显示至少 `attached`，收到 event 后显示 `received event` 或等价状态。
- 非 allowlist request 不进入 app-server processor。
- browser close / refresh 清理 projection subscription。
- `codex-tui` 不直接依赖 `codex-app-server`。
- GUI host 主体代码位于 `codex-gui-host` crate。
