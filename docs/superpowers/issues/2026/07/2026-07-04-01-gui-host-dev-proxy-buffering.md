# P2 · GUI host dev proxy 每请求新建 client 并完整缓冲响应

日期: 2026-07-04
状态: 📏 待量化
范围: gui-host dev proxy / asset boundary
优先级: P2

## 摘要

`gui-host` dev proxy 每个 proxied request 都新建 `reqwest::Client` 并完整缓冲 upstream response，性能影响仍需量化。

## 问题

2026-07-04 Rust performance detection 发现：`gui-host` dev proxy 在每个 proxied request 中都会新建一个 `reqwest::Client`，并把 upstream response body 完整读成 bytes 后再返回。

## 证据

- `codex-rs/gui-host/src/assets.rs:48-67`：`proxy_vite` 从 request URI 拼接 upstream URL，并为本次请求构造 `reqwest::Client` 后发送 GET。
- `codex-rs/gui-host/src/assets.rs:67-74`：dev proxy 成功分支调用 `upstream.bytes().await`，完整缓冲 upstream body 后返回。
- 2026-07-04 只读性能检测标记为 `新发现`。
- 本次核对未运行测试、benchmark、server 或浏览器验证，也未实现修复。
- `assets.rs` 内没有证明 prod index bytes、dev proxy response bytes、error string bytes 的显式上限。
- 是否存在上游 body limit 仍是证据边界。

## 判断

待量化。问题只记录 Rust host dev proxy 边界，不是 prod asset path 的结论。prod asset serve 的目录服务创建是常数配置成本，静态资源传输主要委托给 `tower_http::services::ServeDir`。

## 影响

该路径成本随 dev proxy 请求数 `R` 和 upstream response bytes `U` 增长。大 bundle、source map、HMR burst 或高并发刷新时，每请求新建 client 会放大 CPU/连接管理成本，完整 buffering 会让内存峰值随响应大小和并发请求数增长。

## 后续处理

先做量化或只读复核：记录 request count、upstream response bytes、client construction count、proxy latency、body buffering bytes、error page fallback count，并确认是否已有上游 HTTP body limit 或 tower/axum 层限制。若量化后仍值得处理，再进入设计/计划阶段评估复用 `reqwest::Client` 和 streaming proxy response。
