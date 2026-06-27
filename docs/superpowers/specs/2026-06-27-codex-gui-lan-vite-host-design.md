# codex-gui LAN Vite Host 设计

## 背景

`codex-gui` 开发态页面通过 GUI host 的 launch URL 打开。GUI host 自身监听所有接口并提供 Local/LAN/VPN 等 advertised URL，前端资源在 dev mode 下由 GUI host 通过 HTTP fallback 代理到 Vite：

```text
Browser -> http://<gui-host-lan>:<gui-host-port>/... -> GUI host -> http://127.0.0.1:5173/...
```

当前 LAN 页面主文档可以正常加载，但 Vite HMR WebSocket 失败。已记录的失败链路是：

```text
@vite/client
  -> ws://<LAN address>:5173/?token=...
  -> TCP connection refused
  -> WebSocket closed without opened.
  -> pageerror storm
```

原因是 `codex-gui/vite.config.ts` 默认把 Vite server 绑定到 `127.0.0.1:5173`，而 HMR client 在 GUI host LAN URL 下推导出的 host 是 LAN 地址，并且显式使用 `5173` 端口。LAN 地址上的 `5173` 没有监听者，因此浏览器连接被拒绝。

此前 runtime error circuit breaker 方向已经被验证为失败：初始 HMR WebSocket 从未 open，不会触发 `vite:ws:disconnect`，也不会收到 Vite server 的 `vite:error` payload，无法稳定切断该错误风暴。

## 目标

- 让 `codex-gui` 通过 GUI host LAN URL 打开时，Vite HMR WebSocket 默认可连接。
- 保持现有 `@vite/client` 目标形态：`ws://<LAN address>:5173/?token=...`。
- 保持 HMR 默认端口为 `5173`。
- 保留现有环境变量覆盖能力，便于需要时降回 loopback 或调整端口。
- 使用最小配置变更修复当前 LAN HMR 连接被拒绝问题。

## 已确认决策

- 采用 Vite 直接监听 LAN 的方案，不新增 GUI host WebSocket 代理。
- Vite 默认绑定地址从 `127.0.0.1` 改为 `0.0.0.0`。
- HMR 继续显式设置 `port` 和 `clientPort`，默认值继续来自 `CODEX_GUI_VITE_PORT` 或 `5173`。
- 保留 `CODEX_GUI_VITE_HOST`、`CODEX_GUI_VITE_PORT`、`CODEX_GUI_VITE_HMR_HOST` 和 `CODEX_GUI_VITE_HMR_PORT`。
- 验证采用最小实机验证：启动 Vite，确认输出 Network 地址；用 LAN GUI URL 打开浏览器采集 10 秒控制台；超时后 kill 浏览器。

## 非目标

- 不实现 GUI host 到 Vite 的 HMR WebSocket proxy。
- 不修改 GUI host 的 `/ws` JSON-RPC 通道。
- 不修改 GUI host 的 dev HTTP asset proxy。
- 不把 runtime error page 或 circuit breaker 作为修复路径。
- 不修改 `/Users/jiangsheng/GitHub/vite` 中的 Vite 源码。
- 不新增依赖。
- 不新增 Vite config 测试框架。
- 不解决远端设备对开发机防火墙、路由或局域网隔离造成的不可达问题。

## 设计

修改 `codex-gui/vite.config.ts` 中的默认 bind host：

```ts
const viteHost = process.env.CODEX_GUI_VITE_HOST ?? "0.0.0.0";
```

保留当前端口和 HMR 配置形态：

```ts
const vitePort = Number(process.env.CODEX_GUI_VITE_PORT ?? "5173");
const viteHmrHost = process.env.CODEX_GUI_VITE_HMR_HOST;
const viteHmrPort = Number(process.env.CODEX_GUI_VITE_HMR_PORT ?? vitePort);
```

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

这样默认开发态启动后，Vite 监听：

```text
0.0.0.0:5173
```

浏览器在 LAN GUI URL 下继续生成：

```text
ws://<LAN address>:5173/?token=<vite-token>
```

该地址现在会命中同一个 Vite dev server，Vite 自己继续负责 HMR token 校验和 HMR protocol 处理。

## 行为变化

默认 `pnpm run dev` 后，Vite 应输出 Local 和 Network 地址，例如：

```text
Local:   http://localhost:5173/
Network: http://<LAN address>:5173/
```

GUI host LAN 页面仍通过 GUI host 端口访问，不直接变成 Vite 页面：

```text
http://<LAN address>:<gui-host-port>/?threadId=...
```

但页面内的 Vite HMR WebSocket 会直接访问 Vite 暴露出来的 LAN `5173` 端口：

```text
ws://<LAN address>:5173/?token=...
```

如果用户需要恢复本机-only 行为，可以显式设置：

```sh
CODEX_GUI_VITE_HOST=127.0.0.1 pnpm run dev
```

## 风险

该方案会让 Vite dev HTTP 服务和 HMR WebSocket 默认暴露到局域网。局域网内其他设备可以访问 `http://<LAN address>:5173/` 和相关模块资源。Vite 的 HMR WebSocket 仍有 token 校验，但 Vite dev HTTP 资源本身会变成 LAN 可达。

这个风险是本设计的明确取舍：用户已选择 Vite 直接监听 LAN，并选择默认绑定 `0.0.0.0`，而不是通过 GUI host 代理 HMR。

## 替代方案

### GUI host 代理 Vite HMR WebSocket

浏览器连接 GUI host 的专用 path，例如：

```text
ws://<gui-host-lan>:<gui-host-port>/__codex-gui/vite-hmr?token=...
```

GUI host 再转发到：

```text
ws://127.0.0.1:5173/__codex-gui/vite-hmr?token=...
```

优点是 Vite 可以继续只监听 loopback，LAN 只暴露 GUI host 入口。缺点是需要新增 Rust 侧 WebSocket proxy，改动面更大。本轮决策未采用。

### 固定 HMR host 为 `127.0.0.1`

可以让本机浏览器访问 LAN GUI URL 时仍连接本机 loopback：

```text
ws://127.0.0.1:5173/?token=...
```

优点是改动很小，且不暴露 Vite 到 LAN。缺点是远端设备访问 LAN GUI URL 时仍不可用。本轮决策未采用。

### 绑定指定 LAN IP

可以把 Vite 绑定到具体 LAN IP，减少 `0.0.0.0` 的暴露面。缺点是本机网卡和地址变化会让配置不稳定。本轮决策未采用。

## 验证设计

实现后需要做三类验证。

第一，静态确认：

```sh
pnpm exec prettier --check vite.config.ts
pnpm run type-check
```

第二，启动确认：

```sh
pnpm run dev
```

预期 Vite 输出至少一个 `Network` 地址，端口为 `5173`。

第三，LAN 实机采样：

- 使用 fresh GUI host LAN launch URL 打开浏览器。
- 采集 `console`、`pageerror`、`requestfailed`。
- 浏览器运行 10 秒后强制终止。
- 主文档应返回 HTTP `200`。
- 采样日志不应再出现高频 `WebSocket closed without opened.` pageerror 风暴。
- 如果仍出现 `ERR_CONNECTION_REFUSED`，优先检查 Vite 是否真的监听 LAN 地址上的 `5173`，而不是回到 runtime circuit breaker 方向。

## 成功标准

- `codex-gui/vite.config.ts` 的默认 host 为 `0.0.0.0`。
- `CODEX_GUI_VITE_HOST` 仍可覆盖默认 host。
- HMR 默认 `port` 和 `clientPort` 仍为 `5173`。
- `pnpm run dev` 输出 Network 地址。
- LAN GUI URL 10 秒采样不再产生旧的 `WebSocket closed without opened.` 错误风暴。
