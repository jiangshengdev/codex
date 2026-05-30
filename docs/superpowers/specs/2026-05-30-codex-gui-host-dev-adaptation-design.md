# Codex GUI Host 当前 dev 适配设计

日期：2026-05-30

状态：设计草案。本文只描述如何把 `2026-05-11-codex-gui-host-redesign.md` 及两份 `2026-05-13` 补充设计迁到当前 `dev` 的代码形状；不重新发明 GUI host 架构。

## 设计来源

本文以以下文档为 source of truth：

- `docs/superpowers/specs/2026-05-11-codex-gui-host-redesign.md`
- `docs/superpowers/specs/2026-05-13-gui-host-low-intrusion-refactor-design.md`
- `docs/superpowers/specs/2026-05-13-gui-host-extra-open-hook-thinning-design.md`

`2026-05-10-codex-gui-host-design.md` 只保留历史背景，不作为当前实现依据。

## 目标

把 GUI host 设计稳定地落到当前 `dev` 的代码边界里，同时保持旧设计的核心决策不变：

- `/gui` 只显示本机 URL，不自动打开浏览器。
- 认证后的 GUI `/ws` 作为 extra in-process connection 接入现有 `MessageProcessor` / `outbound_connections`。
- `TransportEvent` 只作语义参考，不作为 MVP in-process 路径。
- `in_process.rs`、`app-server-client/src/lib.rs` 只保留 thin hook。
- GUI facade 放在 `app-server-client/src/gui.rs`。
- extra connection 细节下沉到 `in_process_extra.rs`。

## 适配方案比较

### 方案 A：薄 hook + 旁路模块

推荐方案。`in_process.rs` 只保留中性的 extra connection hook；`in_process_extra.rs` 承担 extra connection 生命周期、outbound 状态和桥接细节；`app-server-client/src/gui.rs` 承担 GUI facade；`gui_host.rs` 承担 GUI host 生命周期。

优点是：

- 上游同步时冲突面集中。
- `in_process.rs` 不再堆 GUI 专有逻辑。
- 旧设计和当前 `dev` 代码形状更容易对齐。

代价是：

- 需要新增少量模块和一个清晰的跨 crate 入口。

### 方案 B：把 open/close 细节继续留在 `in_process.rs` 和 `lib.rs`

实现更快，但会把字段漂移、outbound control、client facade 逻辑继续锁在高频变动文件里。

优点是短期 patch 少。

缺点是后续和上游合并会明显更痛，和当前已确认的 low-intrusion 方向不一致。

### 方案 C：现在就抽出更通用的虚拟连接框架

这会把 GUI host 和未来可能的其它连接类型一起纳入一层通用抽象。

优点是理论上更统一。

缺点是超出 MVP 范围，且会把当前问题变成更大的架构 redesign。

### 结论

选方案 A。

## 当前代码边界

当前 `dev` 里，适合承接 GUI host 的位置已经很明确：

- `codex-rs/app-server/src/in_process.rs`：runtime 主循环、主连接、消息处理和 outbound routing。
- `codex-rs/app-server-client/src/lib.rs`：TUI / exec 共享的 in-process facade。
- `codex-rs/tui/src/app.rs` 与 `app_event` / `app_server_session`：TUI 入口和事件分发。

GUI host 迁移不应把这些文件改成 GUI 专用实现；它们只提供必要入口。

## 架构

### crate 归属

- `codex-gui-host`：browser host shell、安全边界、launch token、Host / Origin 校验、`/ws` 首帧认证、allowlist、静态资源服务。
- `codex-app-server`：GUI host 生命周期、认证后的 extra connection 注册、接入 `MessageProcessor` / `outbound_connections`。
- `codex-app-server-client`：GUI launch URL facade。
- `codex-tui`：`/gui` 命令、primary thread 选择、URL 展示。

### 运行时路径

```text
TUI /gui
  -> app-server-client gui facade
  -> GuiHostManager lazy-start / reuse
  -> GUI host launch URL
  -> 浏览器手动打开本机 URL
  -> /ws 首帧 gui/authenticate
  -> 认证后的 WebSocket 注册为 extra in-process connection
  -> MessageProcessor / outbound_connections
```

### 不变量

- 首版 `/gui` 不自动打开浏览器。
- launch token 只用于 GUI host 本地认证。
- `gui/authenticate` 不是 app-server 协议的一部分。
- `TransportEvent` 不进入 MVP in-process 路径。
- 主连接语义不变。

## 文件边界

### `codex-rs/app-server/src/gui_host.rs`

承载 `GuiHostManager` 和 GUI host 生命周期，不接触 `MessageProcessor` 细节。

### `codex-rs/app-server/src/gui_transport.rs`

承载认证后的 browser WebSocket 到 extra connection 的桥接。

### `codex-rs/app-server/src/in_process_extra.rs`

承载 extra connection 的 open / request / notification / close 细节、outbound state、writer bridge、ID 分配。

### `codex-rs/app-server/src/in_process.rs`

只保留薄 hook：

- extra connection 注册入口
- processor command 分派入口
- outbound router 的 control 分支
- thread listener 的 connection id 扩展

### `codex-rs/app-server-client/src/gui.rs`

承载 GUI launch facade：

- `GuiLaunchUrl`
- `GuiLaunchError`
- `AppServerClientGuiExt`

`lib.rs` 只保留导出和最小 wiring。

## 关键设计点

### 1. `/gui` 的行为

`/gui` 首版只返回本机 GUI host URL，不主动调用系统浏览器。
TUI transcript 里显示完整 URL，由用户自己打开。

### 2. 认证后的 `/ws`

浏览器连接后先做 `gui/authenticate`，成功后才注册 app-server 侧连接。
认证失败不创建 extra connection，不在 `outbound_connections` 留痕。

### 3. extra in-process connection

GUI WebSocket 不是另起一套 transport，而是作为额外的 in-process connection 接入当前 `MessageProcessor` 和 `outbound_connections`。
这条路径保留现有 request / notification / response 语义，避免重写 app-server 协议。

### 4. 低侵入 hook

`in_process.rs` 只保留中性 hook，不出现 GUI、WebSocket、Origin、allowlist 这些概念。
`app-server-client/src/lib.rs` 只保留 GUI facade 所需的最小状态和导出。

### 5. `TransportEvent`

`TransportEvent` 只作为远程/未来连接模型的语义参考。
MVP 不复刻它，不把 GUI host 迁成 transport producer。

## 迁移顺序

1. 先把 GUI launch facade 收敛到 `app-server-client/src/gui.rs`。
2. 再把 extra connection 细节收进 `in_process_extra.rs`。
3. 最后让 `in_process.rs` 只剩 runtime hook。
4. `gui_host.rs` 和 `gui_transport.rs` 维持生命周期与桥接职责，不承担 app-server 业务逻辑。

这个顺序的目的不是拆计划，而是避免在高频文件里留下不可控的实现细节。

## 错误边界

- `primary_thread_id` 不可用时，不启动 GUI。
- `Host` / `Origin` 校验失败时，GUI host 直接拒绝。
- `gui/authenticate` 失败时，连接关闭，不进入 app-server。
- 不在 allowlist 内的 browser request 不得进入 `MessageProcessor`。
- bridge 失败时，浏览器只看到连接关闭或 JSON-RPC error。

## 验证范围

这份设计的验收重点不是“功能更多”，而是“边界更清楚”：

- `in_process.rs` 不再承载 GUI 专属实现。
- `app-server-client/src/lib.rs` 不再因为 GUI 接入扩散成一堆 scattered 改动。
- `codex-app-server-client` 通过 `gui.rs` 输出 launch URL。
- `codex-app-server` 通过 extra connection 接入现有 runtime。

## 结论

当前 `dev` 的正确落点不是改写旧设计，而是把旧设计重新分配到当前代码边界中：

- 架构不变。
- 安全边界不变。
- `/gui` 不自动打开浏览器。
- bridge 仍是 extra in-process connection。
- 侵入点只保留 thin hook。
