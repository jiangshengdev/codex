# Codex GUI Host Design

日期：2026-05-10

状态：设计文档，基于 `.tmp/codex-gui-host-decisions.md` 已确认决策整理。

## 背景

`2026-05-02-codex-gui-projection-design.md` 把 GUI 定位为从 TUI 启动的 companion surface，这个产品边界仍然成立：TUI 负责终端交互、输入、approval 和复杂控制，GUI 负责浏览器中更适合图形界面的观察能力。

但旧设计中“浏览器 GUI 直接连接 app-server WebSocket”的路径不再作为首版方案。现有 app-server remote WebSocket 是 program-client transport，不是 browser-safe 页面入口：

- remote WebSocket 当前明确拒绝带 `Origin` header 的请求。
- remote WebSocket 认证依赖 `Authorization: Bearer`，浏览器原生 WebSocket 不能设置这个 header。
- remote WebSocket 仍保持远程 program-client transport 定位，不为 GUI 页面改变安全模型。

因此首版新增一个本机 `GuiHost`。它服务 GUI 页面资源，并提供浏览器可用的同源 `/ws` 入口。`GuiHost /ws` 接入 app-server 现有 transport / connection 管线，复用 JSON-RPC、projection subscription、notification fanout 和 connection cleanup 语义。

Projection 协议本身以 `2026-05-08-codex-gui-server-projection-redesign.md` 为准。本设计只定义 TUI 如何打开 GUI、`GuiHost` 如何承载页面和 browser-safe WebSocket，以及首版最小验收范围。

## 目标

- 在 TUI 中通过 `/gui` 打开本机浏览器 GUI。
- `/gui` 默认打开主 thread，也就是 `primary_thread_id`。
- 浏览器从 `GuiHost` 同源加载页面资源，并从同源 `/ws` 建立 WebSocket。
- `/ws` 只允许 projection 首版最小 JSON-RPC 能力。
- 首版只要求浏览器开发者工具中能看到 `/ws` 连接建立成功。
- 为后续可信家庭局域网访问保留边界，但第一版只实现本机 loopback。

## 非目标

第一版不实现：

- 浏览器直连现有 app-server remote WebSocket。
- 完整 app-server v2 passthrough。
- GUI timeline、snapshot 渲染、projection event 渲染或完整 UI。
- `/gui --current`、`/gui <threadId>` 或跟随 TUI 当前子代理视图。
- 局域网、手机访问、Tailscale 集成或非 loopback bind。
- npm 打包和发布细节设计。
- Vite 自动启动、端口扫描或 dev/prod 自动 fallback。

## 架构

首版架构增加 `GuiHost`：

```text
TUI
  ├─ handles /gui
  ├─ lazy-starts GuiHost on first /gui
  ├─ passes primary_thread_id into launch URL
  └─ opens browser URL via platform default opener

GuiHost
  ├─ binds 127.0.0.1:0
  ├─ serves/proxies GUI page resources
  ├─ exposes same-origin /ws for browser GUI
  ├─ validates Host, Origin, and launch token
  ├─ filters JSON-RPC methods at transport entry
  └─ forwards allowed traffic into app-server transport / connection pipeline

Browser GUI
  ├─ loads page from GuiHost
  ├─ reads launch token from URL fragment
  ├─ authenticates as first /ws message
  └─ establishes projection connection

App Server
  ├─ owns JSON-RPC processing
  ├─ owns thread/projection attach and detach
  ├─ owns projection notification fanout
  └─ cleans up connection state on close
```

TUI 不作为数据转发层。TUI 只负责启动 `GuiHost` 和打开浏览器 URL。浏览器的 JSON-RPC 消息在 `GuiHost` transport 入口通过安全和白名单检查后进入 app-server 原有处理链。

## `/gui` 入口

`/gui` 第一版始终打开主 thread：

```text
threadId = primary_thread_id
```

它不跟随当前 TUI 显示的子代理、side conversation 或临时视图。未来可以新增 `/gui --current`，但不属于第一版。

第一次执行 `/gui` 时，TUI 懒启动 `GuiHost`。同一 TUI session 内后续 `/gui` 复用同一个 host。host 绑定随机 loopback 端口：

```text
127.0.0.1:0
```

TUI 打开的 URL 形如：

```text
http://127.0.0.1:<port>/?threadId=<primary-thread-id>#token=<launch-token>
```

`threadId` 可以放在 query 中，因为它不是认证 secret。首版前端读取该 query，并把它作为 `thread/projection/attach` 的目标 thread。TUI 生成的 `/gui` URL 始终填入 `primary_thread_id`，但 `GuiHost` 不额外强制 attach 目标必须等于 primary；拿到 launch token 的本机调用方可以请求 attach 任意 app-server 认可的 thread。这个能力仍受本机 loopback、token 和 JSON-RPC method whitelist 边界约束。

`launch-token` 放在 fragment 中，避免随着普通 HTTP 静态资源请求发送到 server 或进入常规 HTTP access log。前端读取 token 后，应立即调用 `history.replaceState(..., "", location.pathname + location.search)` 从地址栏移除 fragment，减少 token 进入浏览器历史、复制粘贴内容或非恶意扩展可见范围的机会。

如果 `primary_thread_id` 尚不可用，`/gui` 应直接在 TUI 中提示当前 session 尚未准备好打开 GUI，而不是启动空 host。

TUI 使用平台默认打开方式打开 URL：macOS 使用 `open`，Linux 使用 `xdg-open`，Windows 使用 `start` 或等价 shell 入口。打开失败时，TUI 在终端打印完整 URL，供用户手动复制到浏览器。

## WebSocket 认证

浏览器连接：

```text
ws://127.0.0.1:<port>/ws
```

浏览器原生 WebSocket 无法设置 `Authorization` header，因此 `GuiHost /ws` 不复用 remote WebSocket 的 bearer-header 认证。认证流程为：

1. TUI 为当前 `GuiHost` 生成一个 launch token。
2. TUI 打开带 `#token=...` 的 GUI URL。
3. 前端读取 `location.hash`。
4. 前端建立 `/ws`。
5. `/ws` 建立后，前端发送第一条认证消息，携带 launch token。
6. `GuiHost` 验证成功后才接受后续 JSON-RPC 消息。

认证消息使用 JSON-RPC 2.0 request 格式，但属于 `GuiHost` transport 前置协议，不进入 app-server JSON-RPC processor。第一条 WebSocket text frame 必须是：

```json
{"jsonrpc":"2.0","id":1,"method":"gui/authenticate","params":{"token":"<launch-token>"}}
```

`id` 可以是任意 JSON-RPC request id。认证成功时，`GuiHost` 返回同一 `id` 的 JSON-RPC response：

```json
{"jsonrpc":"2.0","id":1,"result":{"authenticated":true}}
```

认证成功后，该 WebSocket 进入 app-server JSON-RPC 转发状态，后续消息只能使用白名单方法。认证失败、首帧不是 `gui/authenticate`、payload 格式错误或 token 缺失时，`GuiHost` 可以先返回同一 `id` 的 JSON-RPC error，然后以 WebSocket close code `1008` 关闭连接；如果首帧无法解析出 request id，则直接以 `1008` 关闭。失败路径不得创建 app-server connection；如果实现为复用底层连接对象而已创建，则必须立即执行 connection cleanup，且不得放行任何业务 JSON-RPC。

launch token 使用系统 CSPRNG 生成，至少包含 128 位熵，使用 base64url 或 hex 编码。token 对 server 是 opaque 字符串，只做直接匹配，不解析结构或嵌入可预测信息。

launch token 在同一 TUI session 内可复用，支持刷新页面、多次 `/gui` 和多个本机 browser tab。token 随 `GuiHost` / TUI 进程退出失效。第一版不要求 token 单次使用。

## 本机安全边界

第一版安全模型是：

```text
loopback bind + short-lived launch token + Host/Origin check + method whitelist
```

`GuiHost` 只绑定 `127.0.0.1:0`。它必须对所有 HTTP 请求和 WebSocket upgrade 校验 `Host`，只接受严格等于 `127.0.0.1:<port>` 的值。默认不接受 `localhost:<port>`、其他 loopback 名称、缺失 Host 或任意可解析到 loopback 的 DNS 名称；这样可以降低 DNS rebinding 页面以 `evil.example:<port>` 访问本机服务的风险。

WebSocket `Origin` 也必须严格等于 `http://127.0.0.1:<port>`。浏览器页面与 `/ws` 同源，因此正常路径下 Origin 应匹配该值；缺失或不匹配的 Origin 默认拒绝。未来如果支持非浏览器客户端或局域网访问，必须通过显式配置扩展 allowlist，而不是放宽第一版默认策略。

method whitelist 在 `GuiHost` transport 入口实现。非白名单 JSON-RPC 请求不进入 app-server processor。server-to-browser notification 也只允许首版白名单通知。

这个边界为未来可信家庭局域网访问保留扩展点：未来可以引入 bind address、访问策略、token 策略和更严格的 origin allowlist。但第一版不实现这些能力，也不和 Tailscale 耦合。

## JSON-RPC 白名单

首版允许 browser-to-server：

```text
initialize
thread/projection/attach
thread/projection/detach
```

首版允许 server-to-browser：

```text
thread/projection/event
```

白名单 request 对应的 JSON-RPC response 和 error 必须正常放行，因为它们是已允许 request 的结果。server-initiated notification 只允许 `thread/projection/event`。

`GuiHost` 不是完整 app-server v2 gateway。任何不在白名单中的 request 都应在 `GuiHost` transport 入口被拒绝。拒绝可以返回 JSON-RPC error，也可以在明显越权时关闭连接；实现计划阶段再确定错误码和用户可见文案。

`thread/projection/attach`、`thread/projection/detach` 和 `thread/projection/event` 的 payload、`subscriptionId`、`headCommitId`、`commitId`、`parentCommitId` 语义沿用 `2026-05-08-codex-gui-server-projection-redesign.md`。本设计不重新定义 projection reducer 或 commit 链。

## 静态资源模式

`GuiHost` 支持 dev 和 prod 两种资源来源。模式由 build profile 默认决定：

```text
debug build  -> dev
release build -> prod
```

不做自动 fallback。debug/dev 下 Vite 不可用时只提示错误；release/prod 下资源路径缺失时只提示错误。

### dev

dev 模式只使用 Vite dev server。默认地址：

```text
http://127.0.0.1:5173
```

允许 dev-only 环境变量覆盖 Vite 地址。`GuiHost` 不扫描常见端口，不自动发现 Vite，不自动运行 npm/pnpm。

浏览器仍然打开 `GuiHost` URL，而不是 Vite URL。`GuiHost` 反向代理 Vite 页面资源，使页面和 `/ws` 保持同源。这样 Vite 不需要知道 `GuiHost` 的随机端口，也不需要为 `/ws` 配置反向代理。

Vite HMR 首版不经 `GuiHost /ws`，避免与 projection WebSocket 混用。dev 前端配置应把 HMR WebSocket 显式指向 Vite dev server，例如 `ws://127.0.0.1:5173` 或环境变量覆盖后的 Vite 地址。这样只有开发模式下 HMR WebSocket 直连 Vite 端口，页面资源和 projection `/ws` 仍从 `GuiHost` 同源加载。若 Vite HMR 配置缺失或不可用，不要求 `GuiHost` 自动代理 HMR；开发者可以手动刷新页面。

### prod

prod 模式只按 npm 包目录结构相对路径读取 GUI 构建产物。npm package root 由 Node CLI wrapper 启动 Rust binary 时通过内部环境变量传递：

```text
CODEX_GUI_PACKAGE_ROOT
```

该环境变量表示 GUI npm package root，不直接表示 dist 目录。prod 下 GUI dist 固定为：

```text
$CODEX_GUI_PACKAGE_ROOT/dist/
```

prod 模式不依赖 cwd，不优先依赖 executable path，也不 fallback 到 Vite。`CODEX_GUI_PACKAGE_ROOT` 缺失或 `dist/` 不存在时，`/gui` 直接报错，提示当前安装缺少 GUI package root / GUI 资源路径。

打包和 npm 发布结构后续单独设计。本设计只规定运行时定位边界。

## 生命周期

`GuiHost` 生命周期绑定 TUI session：

- TUI 启动时不启动 `GuiHost`。
- 第一次 `/gui` 懒启动。
- 同一 TUI session 复用同一个 `GuiHost` 和同一个 launch token。
- 每个 TUI session 拥有独立的 `GuiHost`、随机端口和 launch token；多个并发 TUI session 互不共享 host，也不是全局单例。
- 多个本机 tab 可以同时连接同一个 `GuiHost`。
- TUI 进程退出时 `GuiHost` 退出，token 失效，所有 `/ws` connection 经 app-server connection cleanup 清理。

连接关闭时应复用 app-server 原有 `ConnectionClosed` 语义，清理 projection subscription。正常浏览器关闭或刷新导致的断开不需要额外 server-side grace period。

## 首版前端行为

首版 GUI 页面只需要完成连接验证：

1. 页面从 `GuiHost` 加载成功。
2. 页面从 fragment 读取 launch token。
3. 页面通过 `history.replaceState` 清除 URL fragment。
4. 页面连接同源 `/ws`。
5. 页面发送 `gui/authenticate` 认证 request。
6. 认证成功后发送 `initialize`。
7. 页面读取 query 中的 `threadId` 并 attach 默认 thread，但不要求渲染 snapshot 或事件。

验收标准是浏览器开发者工具中能看到 `/ws` 连接。UI、timeline、snapshot 展示、projection event 展示都不在本次范围内。

## 错误处理

首版需要明确几类错误：

- `primary_thread_id` 不存在：TUI 提示当前 session 尚未准备好打开 GUI。
- dev 模式 Vite 不可用：TUI 提示当前是 dev 模式，需要开发者启动 Vite，并显示使用的 Vite 地址。
- prod 模式 `CODEX_GUI_PACKAGE_ROOT` 缺失：TUI 提示当前安装缺少 GUI package root。
- prod 模式 `dist/` 缺失或不可读：TUI 提示 GUI 构建产物缺失或不可读。
- Host/Origin 校验失败：`GuiHost` 拒绝请求。
- launch token 缺失或错误：`GuiHost` 关闭 `/ws`，不放行 JSON-RPC。
- JSON-RPC method 不在白名单：`GuiHost` 拒绝，不进入 app-server processor。

错误提示应面向当前操作者：dev 错误给开发者可执行提示，prod 错误说明安装/发布包不完整。

## 实现边界

`GuiHost` 首版作为 `codex-app-server` crate 内部模块实现，例如 `codex-rs/app-server/src/gui_host.rs` 及必要的子模块，而不是新增独立 crate。它应复用 `codex-app-server-transport` 和 app-server 现有 connection 管线，但 browser 页面服务、launch token、Host/Origin 校验和白名单逻辑由 `codex-app-server` 内部拥有。这样首版可以减少 workspace / Bazel 单元和 API 暴露面；未来如果 GUI host 需要独立发布或被其他 binary 复用，再抽成 `codex-gui-host` crate。

该模块放在 app-server transport 边界附近，因为它需要：

- 创建 browser-safe WebSocket transport。
- 生成 app-server connection。
- 对 incoming JSON-RPC 做 method whitelist。
- 对 outgoing notification 做 whitelist。
- 参与 connection close cleanup。

TUI 侧只新增 `/gui` 命令处理、懒启动 host、读取 `primary_thread_id`、打开 URL 和错误展示。TUI 不解析 projection event，不转发 browser data。

前端代码属于 `codex-gui`。首版前端可以保持极小，只做页面加载和 `/ws` 连接认证。当前 `codex-gui` 使用 Vite，默认 build output 为 `dist/`，与 prod 运行时路径一致。

## 测试策略

实现时至少覆盖：

- `/gui` 使用 `primary_thread_id`，不使用当前 displayed thread。
- 第一次 `/gui` 启动 `GuiHost`，后续 `/gui` 复用同一 host。
- `GuiHost` 绑定 loopback 随机端口。
- launch URL 使用 fragment 携带 token。
- `/ws` 要求第一条认证消息，认证失败不放行 JSON-RPC。
- Host/Origin 校验拒绝非同源请求。
- 非白名单 request 不进入 app-server processor。
- server-to-browser 只放行 `thread/projection/event`。
- dev 模式代理固定 Vite 地址，并在不可用时报错。
- prod 模式只从 `$CODEX_GUI_PACKAGE_ROOT/dist/` 读取资源，缺失时报错。

如果实现修改 app-server v2 API，需要更新 app-server README 和 schema fixtures，并运行 app-server protocol 测试。若只新增 `GuiHost` transport 且不改变协议 schema，则不需要改 projection protocol 文档。

## 后续扩展

后续可以在不推翻首版边界的基础上扩展：

- `/gui --current` 打开 TUI 当前 displayed thread。
- GUI timeline 和 projection store 渲染。
- 更完整的 projection event 类型。
- npm 打包和发布结构设计。
- 可信家庭局域网访问策略，包括 bind address、origin allowlist、token 策略和用户确认流程。
- 手机访问适配。

这些扩展不属于首版验收范围。
