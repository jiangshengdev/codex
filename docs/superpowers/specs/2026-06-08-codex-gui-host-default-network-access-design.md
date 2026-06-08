# Codex GUI Host 默认局域网访问设计

日期：2026-06-08

状态：设计草案。本文修订 `2026-05-11-codex-gui-host-redesign.md` 与 `2026-05-30-codex-gui-host-dev-adaptation-design.md` 中的 loopback-only / 不支持 LAN 决策。新的默认方向是：`/gui` 默认给出本机、默认局域网和 VPN / overlay 网络入口。

## 背景

当前 GUI host 首版设计把安全边界定义为：

```text
loopback bind + short-lived launch token + strict Host/Origin + JSON-RPC allowlist
```

实现也沿用该模型：

- `GuiHost` 绑定 `127.0.0.1:0`。
- launch URL 固定为 `http://127.0.0.1:<port>/?threadId=...#token=...`。
- `/ws` 只接受 `Host` / `Origin` 等于 `127.0.0.1:<port>`。
- TUI 只显示单个 `GUI URL: ...`。

新的产品决策是：`/gui` 默认应该支持局域网访问，并且同时覆盖 Tailscale 这类 VPN / overlay 网络。Tailscale 不应成为特殊依赖；其他 VPN 只要给本机分配可用私网地址，也应该自然进入默认 URL 候选。
该默认行为适用于 Unix/macOS/Linux 和 Windows；其它平台可以回退到只展示 Local。

## 目标

- `/gui` 默认显示多个可访问 URL，而不是只显示 `127.0.0.1`。
- 默认覆盖三类入口：
  - Local：`127.0.0.1`
  - LAN：默认路由接口上的私网 IPv4
  - VPN：active 接口上的首选 VPN / overlay 地址
- GUI host 使用单 listener 监听所有 IPv4 接口。
- Host / Origin 校验继续保持 exact allowlist，不因默认局域网访问而退化。
- launch token 继续放在 URL fragment 中，并作为 WebSocket 首帧认证凭证。
- 地址发现不依赖 `tailscale` CLI、`ipconfig`、PowerShell 或其它外部命令。

## 非目标

- 不支持公网地址自动 advertise。
- 不引入公网 relay、NAT traversal、配对码或远程设备 enrollment。
- 不引入新的 `/gui --lan`、`/gui --tailscale`、`/gui --all-network-urls` 等参数。
- 不把 Tailscale MagicDNS、tailnet ACL 或设备名作为 MVP 依赖。
- 不在首版输出 IPv6 ULA URL；ULA 只作为分类和未来 IPv6 listener 支持的候选。
- 不改变浏览器 JSON-RPC allowlist。
- 不改变 app-server projection / extra connection 生命周期。

## 决策

### 1. 默认访问面

`/gui` 默认展示：

```text
Local + 默认 LAN + VPN
```

具体规则：

- Local 固定为 `127.0.0.1`。
- LAN 使用默认路由接口上的首选 RFC1918 IPv4 地址。
- VPN 首版使用 active 接口上的首选 IPv4 VPN / overlay 地址。
- 如果某一类不存在，则不展示该类。

默认不展示公网地址。

### 2. 监听策略

GUI host 使用单 IPv4 listener：

```text
0.0.0.0:<random-port>
```

这让同一个端口同时服务 Local、LAN 和 IPv4 VPN URL。IPv6 ULA 只保留为分类候选；首版不输出 ULA URL，直到 GUI host 能在同一端口服务 IPv6。

### 3. 地址发现

地址发现使用系统接口枚举，不依赖外部命令。

平台边界：

- Unix/macOS/Linux：使用 `getifaddrs` 收集 active 接口地址。
- Windows：使用 Win32 IP Helper API 收集 active adapter 地址。
- 其它平台或枚举失败：回退到只展示 Local。

公共选择逻辑和平台枚举逻辑分离。平台 collector 只负责把系统接口转换成统一 `InterfaceAddress`；公共 selector 负责分类、排序和 fallback。

纳入：

- 默认路由接口上的 RFC1918 IPv4：
  - `10.0.0.0/8`
  - `172.16.0.0/12`
  - `192.168.0.0/16`
- VPN / overlay 常用 CGNAT IPv4：
  - `100.64.0.0/10`
- IPv6 ULA 分类候选：
  - `fc00::/7`
- loopback：
  - `127.0.0.1`

排除：

- 公网 IP
- IPv4 link-local：`169.254.0.0/16`
- IPv6 link-local：`fe80::/10`
- inactive 接口
- 没有合格地址的接口

LAN 优先选择标记为默认路由接口的 RFC1918 IPv4。若平台 collector 暂时不能可靠标记默认路由，则 fallback 到第一个 active RFC1918 IPv4。

### 4. Launch URL API

GUI launch API 不再返回单个字符串 URL，而是返回结构化多 URL。

设计形状：

```rust
pub struct GuiLaunchUrls {
    pub entries: Vec<GuiLaunchUrlEntry>,
}

pub struct GuiLaunchUrlEntry {
    pub kind: GuiLaunchUrlKind,
    pub label: String,
    pub url: String,
}

pub enum GuiLaunchUrlKind {
    Local,
    Lan,
    Vpn,
}
```

`codex-gui-host` 负责生成 URL entry。`codex-app-server` 和 `codex-app-server-client` 只转交结构化结果。TUI 只负责展示，不解析 URL 字符串。

### 5. Host / Origin 校验

GUI host 只接受 advertised URLs 对应的 exact Host / Origin。

示例：

```text
Advertised:
  Local: http://127.0.0.1:4567/?threadId=...#token=...
  LAN:   http://192.168.3.165:4567/?threadId=...#token=...
  VPN:   http://100.88.28.119:4567/?threadId=...#token=...
```

允许：

```text
Host: 127.0.0.1:4567
Origin: http://127.0.0.1:4567

Host: 192.168.3.165:4567
Origin: http://192.168.3.165:4567

Host: 100.88.28.119:4567
Origin: http://100.88.28.119:4567
```

拒绝：

- 未展示的私网 IP
- `localhost:<port>`
- 缺失 `Origin`
- 任意 DNS 名称
- 任意公网地址

### 6. Token 策略

同一个 GUI host session 的所有 advertised URLs 共享同一个 launch token。

这保留现有语义：

- 同一 app-server session 复用同一个 GUI host。
- 同一 GUI host 复用同一个随机端口。
- 同一 GUI host 复用同一个 launch token。
- 多个本机或局域网浏览器 tab 可同时连接。

### 7. URL 展示顺序

TUI 固定按以下顺序展示：

```text
Local -> LAN -> VPN
```

示例：

```text
GUI URLs:
  Local: http://127.0.0.1:4567/?threadId=...#token=...
  LAN:   http://192.168.3.165:4567/?threadId=...#token=...
  VPN:   http://100.88.28.119:4567/?threadId=...#token=...
```

### 8. 每类最多一个地址

每个 URL kind 最多展示一个 entry：

- Local：固定 `127.0.0.1`
- LAN：默认路由接口上的首选私网 IPv4
- VPN：首选 IPv4 VPN / overlay 地址

不展示同一类的多个网卡地址，避免 `/gui` 输出变乱。

### 9. VPN 首选规则

首版 VPN URL 只 advertise IPv4 overlay 地址：

```text
CGNAT IPv4
```

也就是优先选择 `100.64.0.0/10` IPv4。IPv6 ULA 仍可在纯分类测试中识别为 VPN candidate，但 `discover_advertised_hosts` 首版以 `include_ipv6 = false` 调用，不输出 ULA URL。

未来如果 GUI host 支持同端口 IPv6 listener，ULA 可以成为 CGNAT IPv4 不存在时的 fallback。届时 IPv6 URL 必须使用 bracket 格式：

```text
http://[fdxx::...]:4567/?threadId=...#token=...
```

## 组件边界

### `codex-gui-host`

负责：

- 绑定 `0.0.0.0:<random-port>`。
- 通过平台 collector 枚举或接收 advertised host candidates。
- 用公共 selector 选择 Local / LAN / VPN entries。
- 生成 `GuiLaunchUrls`。
- 从 advertised entries 构造 Host / Origin allowlist。
- 对所有 HTTP 请求校验 Host；对 WebSocket upgrade 同时校验 Host 和 Origin。
- 保持 launch token、`/ws` 首帧认证和 JSON-RPC allowlist。

### `codex-app-server`

负责：

- 继续拥有 GUI host 生命周期。
- 从 `GuiHostHandle` 获取结构化 launch URLs。
- 不解析 URL、不实现 Host / Origin 策略。

### `codex-app-server-client`

负责：

- 把 GUI launch facade 的返回值从单 URL 改成多 URL。
- remote client 继续返回 unsupported，不新增远程 app-server GUI host 行为。

### `codex-tui`

负责：

- 把 `GuiLaunchUrls.entries` 渲染成多行 transcript message。
- 保持 `/gui` 不自动打开浏览器。
- 不直接依赖 `codex-gui-host` 或 `codex-app-server`。

### `codex-gui`

原则上不需要知道多 URL 结构。浏览器打开任一 advertised URL 后，前端继续使用当前 `location.host` 建立 same-origin `/ws`。

## 数据流

```text
TUI /gui
  -> app-server-client launch_gui_for_thread(thread_id)
  -> app-server GuiHostManager lazy-starts/reuses GuiHost
  -> codex-gui-host binds 0.0.0.0:<port>
  -> codex-gui-host discovers advertised entries
  -> codex-gui-host returns GuiLaunchUrls
  -> TUI prints Local/LAN/VPN URLs
  -> browser opens one URL
  -> browser connects same-origin /ws
  -> gui/authenticate with shared token
  -> authenticated traffic enters existing app-server GUI transport
```

## 安全边界

默认局域网访问扩大了网络暴露面。安全边界必须变成：

```text
private-interface bind + advertised exact Host/Origin + launch token + JSON-RPC allowlist
```

关键约束：

- 监听 `0.0.0.0` 不代表接受任意 Host / Origin。
- 只有 advertised URLs 对应的 Host 能访问 HTTP assets。
- 只有 advertised URLs 对应的 Host / Origin 能通过 `/ws` upgrade。
- launch token 仍是 bearer credential；拥有完整 URL 的设备可以连接 GUI host。
- 默认不 advertise 公网地址。
- HTTP / WS 仍是明文。Tailscale 等 overlay 网络可提供传输层保护，但物理 LAN 上的明文风险由用户网络环境承担。

## 错误处理

- 如果无法发现 LAN 地址，只展示 Local 和可能存在的 VPN。
- 如果无法发现 VPN 地址，只展示 Local 和可能存在的 LAN。
- 如果 Unix 或 Windows 地址枚举失败，回退到只展示 Local，但 host 仍可绑定成功时继续运行。
- 如果 listener bind `0.0.0.0:0` 失败，GUI launch 返回现有 IO error 路径。
- 如果 advertised entries 为空，必须至少回退到 Local entry；不允许返回空 URL 列表。

## 测试要求

### `codex-gui-host`

- 默认 listener 绑定所有 IPv4 接口。
- 公共 selector 测试覆盖 Local / LAN / VPN 分类、排序和 fallback，不依赖真实网卡。
- Unix collector 和 Windows collector 出错时都回退到 Local。
- URL entries 按 Local -> LAN -> VPN 排序。
- 每类最多一个 entry。
- HTTP Host allowlist 只接受 advertised exact match。
- WebSocket Host / Origin allowlist 只接受 advertised exact match。
- `localhost`、未展示私网 IP、缺失 Origin、公网 Host 都被拒绝。
- CGNAT IPv4 被选为 VPN URL。
- ULA IPv6 可被分类为 VPN candidate，但首版 discovery 不输出 IPv6 URL。
- token 仍在 fragment 中，不进入 query string。

### `codex-app-server`

- `GuiHostManager` 首次 launch 返回结构化多 URL。
- 多次 launch 复用同一 host、同一端口和同一 token。
- 结构化结果不破坏 shutdown / drop 语义。

### `codex-app-server-client`

- in-process client facade 返回 `GuiLaunchUrls`。
- remote client 继续返回 unsupported error。

### `codex-tui`

- `/gui` transcript 渲染多行 `GUI URLs`。
- 缺失 LAN/VPN 时只渲染存在的 entries。
- snapshot 覆盖 Local + LAN + VPN 的稳定输出。

### `codex-gui`

- 现有 same-origin `/ws` 构造继续通过。
- 不需要为多 URL API 增加前端状态。

## 文档修订点

后续 implementation plan 应同步修订以下旧边界：

- `2026-05-11-codex-gui-host-redesign.md`
  - 删除或更新“局域网访问”为非目标。
  - 更新 `127.0.0.1:0` / loopback-only 安全模型。
  - 更新 TUI URL 示例和 WebSocket 示例。
- `2026-05-30-codex-gui-host-dev-adaptation-design.md`
  - 更新 `/gui` 只显示本机 URL 的描述。
- `docs/superpowers/plans/2026-05-30-gui-host/00-roadmap.md`
  - 更新 `/gui` 首版不支持 LAN 的旧路线图边界。
  - 保持 same-origin `/ws`、Host / Origin、token、allowlist 的 shell 归属不变。

## 验收摘要

在一台同时拥有 Wi-Fi LAN 和 VPN / overlay IP 的机器上，`/gui` 默认输出：

```text
GUI URLs:
  Local: http://127.0.0.1:<port>/?threadId=<thread-id>#token=<token>
  LAN:   http://<default-lan-ip>:<port>/?threadId=<thread-id>#token=<token>
  VPN:   http://<vpn-ip>:<port>/?threadId=<thread-id>#token=<token>
```

三类 URL 打开后都连接同一个 GUI host，并通过各自 exact Host / Origin 校验。任意未展示 Host / Origin 不能建立 `/ws`。
