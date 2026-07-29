# GUI Host

后续任务填充 gui-host 性能检测结果。

## Start and URL boundary

状态：无明显风险。

结论：`gui-host` 的 host 启动、地址发现和 URL 生成适合作为后续实测的可观测边界，但只读检查未发现新的性能风险。启动路径一次性发现 advertised hosts、绑定 unspecified IPv4 ephemeral port、生成 token、构造 router 并启动 server task；URL 生成按 advertised hosts 输出 entries；每次请求的 Host 校验只扫描 advertised hosts。

规模变量：接口地址数 `I`，Windows adapter/unicast 地址数 `A/U`，advertised hosts 数 `H`，thread id 长度 `T`，请求数 `R`。复杂度：Unix discovery `O(I)`；Windows discovery `O(A+U)` 且最多 3 次 buffer retry；host selection 是对接口列表的有限次线性扫描；URL 生成 `O(H * T)`；每请求 Host 校验 `O(H)`。当前构造最多 local + 一个 LAN + 一个 VPN，`H` 通常上限为 3，因此运行时校验和 URL entries 是小常数规模。四个指定文件相对 `rust-v0.142.0` 均为新增，边界归因于当前 `dev`。

关键证据：

- `codex-rs/gui-host/src/host.rs:51`-`:60` 启动入口调用 `discover_advertised_hosts(/*include_ipv6*/ false)`。
- `codex-rs/gui-host/src/host.rs:193`-`:235` host start 绑定 listener、读取 local addr、生成 token、构造 state/router、spawn server task，无持久累积循环。
- `codex-rs/gui-host/src/host.rs:160`-`:191` Host middleware 对 advertised hosts 做 `.iter().any(...)`。
- `codex-rs/gui-host/src/net.rs:17`-`:39` advertised hosts 从 local 开始，最多追加一个 LAN 和一个 VPN。
- `codex-rs/gui-host/src/net.rs:119`-`:165` Unix collector 遍历 `getifaddrs` 返回链表。
- `codex-rs/gui-host/src/net.rs:212`-`:301` Windows collector 最多 3 次 `GetAdaptersAddresses` retry，并遍历 adapter/unicast 地址。
- `codex-rs/gui-host/src/url.rs:87`-`:110` URL entries 由 hosts map 生成。
- `codex-rs/gui-host/src/config.rs:20`-`:31`、`:43`-`:62` config 只读取有限环境变量并选择 dev/prod。
- 本地 `git diff --name-status rust-v0.142.0 -- ...` 对 `host.rs`、`net.rs`、`url.rs`、`config.rs` 均显示 `A`。

已排除项：排除 `codex-gui/**`、浏览器、dev server、前端 UI 性能；排除 asset proxy/prod asset service 和 WebSocket bridge 成本；排除接口发现是每请求成本；排除 advertised hosts 无界增长。

风险/下一步：未运行测试或 benchmark，结论来自只读源码。若后续进入性能检测，建议记录 host start latency、接口地址数、advertised hosts 数、URL entries 数和 Host 校验计数；下一切片应单独覆盖 WebSocket bridge 或 assets boundary。

## WebSocket bridge boundary

状态：无明显风险。

结论：当前只读范围未发现 `gui-host` WebSocket bridge 存在无界 channel 增长或明显性能风险。连接先通过 HTTP `Host` / `Origin` 校验，再要求首个 WebSocket text frame 在 5 秒内提交 `gui/authenticate` 和 launch token；认证成功后才创建 backend connection。双向 pump 使用固定容量的 mpsc channel，入站消息先过 browser allowlist，出站消息先过 backend response/notification filter。

规模变量：连接数 `C`，单连接入站/出站 channel 容量 `K=128`，消息大小 `M`，消息数 `N`，allowlist 方法数 `A`，advertised hosts 数 `H`。复杂度：Host/Origin 校验 `O(H)`；auth 和每条 text 分类/过滤都需要 JSON parse，成本 `O(M)`；allowlist 是固定小常数 `matches!`；buffering 是每连接 `2 * K` 条消息，整体 `O(C * K)` 条消息，但按字节仍随 payload size 增长。四个指定文件相对本地 `rust-v0.142.0` 都是新增，归因于当前 `dev`。

关键证据：

- `codex-rs/gui-host/src/ws.rs:72`-`:90` upgrade 前校验 `Host` / `Origin`，失败直接 `403`。
- `codex-rs/gui-host/src/ws.rs:95`-`:108` advertised hosts 线性匹配 authority/origin。
- `codex-rs/gui-host/src/ws.rs:31`-`:33`、`:126`-`:145` 生产 auth timeout 是 5 秒，首帧不满足 auth 就 policy close。
- `codex-rs/gui-host/src/ws.rs:110`-`:124` auth request 反序列化后直接比较 launch token。
- `codex-rs/gui-host/src/token.rs:10`-`:16` token 使用 32 字节 OS random 并 URL-safe base64 编码。
- `codex-rs/gui-host/src/backend.rs:3`、`:10`-`:22` 每个 authenticated connection 创建两个 bounded mpsc channel，容量均为 128。
- `codex-rs/gui-host/src/ws.rs:155`-`:165` 认证成功后创建 backend task，pump 结束后 abort backend task。
- `codex-rs/gui-host/src/ws.rs:168`-`:224` pump 用 `tokio::select!` 双向转发；入站 `send(...).await`，出站也等待 WebSocket sink。
- `codex-rs/gui-host/src/ws.rs:242`-`:276` browser text 必须是 JSON-RPC 2.0，request 只允许 client request allowlist，notification 当前全部拒绝。
- `codex-rs/gui-host/src/ws.rs:278`-`:302` backend text 只允许合法 response 或 server notification allowlist。
- `codex-rs/gui-host/src/filter.rs:1`-`:23` client/server allowlist 是固定分支，不是动态集合。
- `codex-rs/gui-host/src/backend.rs:30`-`:39` backend 只接收 text channel，bridge 边界没有额外全局 buffer。
- 本地 `git diff --name-status rust-v0.142.0 -- codex-rs/gui-host/src/ws.rs codex-rs/gui-host/src/filter.rs codex-rs/gui-host/src/token.rs codex-rs/gui-host/src/backend.rs` 显示四个文件均为 `A`。

已排除项：排除前端 GUI、浏览器 runtime、dev server、server 启动、asset service/proxy；排除未认证连接进入 backend；排除 mpsc 条数无界增长；排除动态 allowlist 增长；排除 backend 任意 notification 透传；排除 browser notification 透传。

风险/下一步：未运行测试、benchmark、server、schema、snapshot、格式化或前端验证，结论来自只读源码。当前 channel 条数有界，但这四个文件内没有显式单条 text / JSON-RPC payload 字节 cap；内存成本仍随 payload size 增长，尤其 outbound channel 最多可持有 128 条已序列化 String。后续若授权实测，建议记录 channel occupancy、filter/drop/close 计数、单条 payload bytes、auth timeout/failure、WebSocket send await latency 和 projection notification burst size；若要确认字节级 cap，需要单独查看 WebSocket extractor 配置或上游 payload 限制。

## Assets and dev proxy boundary

### 结论

状态：新发现。

结论：`gui-host` asset 边界没有发现运行时无界集合或跨请求累积状态，但 dev proxy 有明确性能检测关注点：每个 proxied request 都新建一个 `reqwest::Client`，并把 upstream body 完整读成 bytes 后再返回。prod asset serve 的目录服务创建是常数配置成本；prod index handler 每次读取完整 `index.html`，成本随 index 文件大小和请求数增长。dev proxy error page 只在上游不可用时把编译期嵌入的 HTML/CSS 和两个动态字符串做线性拼接/转义，属于固定页面模板加动态错误字符串的常数级边界。`dev_proxy_error.html` 和 `style.css` 作为前端/静态资源自身性能排除，只保留其 Rust host 组装成本。

规模变量：prod dist path 长度 `P`，prod index bytes `I`，prod/static asset response bytes `B`，dev proxy 请求数 `R`，dev proxy upstream response bytes `U`，Vite origin/path-and-query 长度 `V/Q`，proxy error 字符串长度 `E`，嵌入模板+CSS bytes `S=6486`。复杂度/成本：`prod_dist_dir` 是一次 path metadata 检查，`O(P)`；`prod_assets_service` 只是构造 `ServeDir`，每请求文件查找/传输委托给 `tower_http::services::ServeDir`，本文件未维护无界缓存或列表；`serve_prod_index` 每请求 `O(I)` 读取并持有完整 String；`proxy_vite` 每请求构造 client、拼接 URL、请求 upstream，并以 `O(U)` 完整缓冲 body；error page 组装是 `O(S + V + E)`。四个指定文件相对本地 `rust-v0.142.0` 均为新增，归因到当前 `dev`。

### 关键证据路径/行号

- `codex-rs/gui-host/src/assets.rs:17`-`:18` 使用 `include_str!` 编译期嵌入 dev proxy error HTML/CSS。
- `codex-rs/gui-host/src/assets.rs:20`-`:25` `prod_dist_dir` 只检查 dist dir 是否存在。
- `codex-rs/gui-host/src/assets.rs:28`-`:30` `prod_assets_service` 只构造 `ServeDir` 并启用 directory index。
- `codex-rs/gui-host/src/assets.rs:32`-`:45` `serve_prod_index` 每次异步读取完整 `index.html`，成功和失败分支都只追加安全响应头。
- `codex-rs/gui-host/src/assets.rs:48`-`:67` `proxy_vite` 从 request URI 拼接 upstream URL，并为本次请求构造 `reqwest::Client` 后发送 GET。
- `codex-rs/gui-host/src/assets.rs:67`-`:74` dev proxy 成功分支调用 `upstream.bytes().await`，完整缓冲 upstream body 后返回。
- `codex-rs/gui-host/src/assets.rs:89`-`:107` upstream 不可用时返回 embedded error page，并通过三次 `replace` 插入 CSS、escaped origin 和 escaped error。
- `codex-rs/gui-host/src/assets.rs:117`-`:130` `html_escape` 对动态字符串逐字符线性转义。
- `codex-rs/gui-host/src/assets.rs:132`-`:145` 安全响应头只做固定 header insert。
- `codex-rs/gui-host/src/embedded_pages/dev_proxy_error.html:1`-`:61` 是固定 error page template，只有 origin/error placeholder。
- `codex-rs/gui-host/src/embedded_pages/assets/style.css:1`-`:296` 是固定嵌入 CSS；本轮只计入 error page 组装 bytes，不分析 CSS/frontend rendering 性能。
- `codex-rs/gui-host/src/lib.rs:1`-`:23` 仅声明模块和导出非 asset API；未在 lib root 暴露新的 asset-side 状态集合。
- 本地只读 `wc -c` 显示 `dev_proxy_error.html` 1426 bytes、`style.css` 5060 bytes，嵌入模板+CSS 合计 6486 bytes。
- 本地 `git diff --name-status rust-v0.142.0 -- codex-rs/gui-host/src/assets.rs codex-rs/gui-host/src/embedded_pages/dev_proxy_error.html codex-rs/gui-host/src/embedded_pages/assets/style.css codex-rs/gui-host/src/lib.rs` 显示四个文件均为 `A`。

### 已排除项

已排除：不分析 `dev_proxy_error.html` 的视觉布局、CSS selector/rendering、浏览器 paint/layout、Vite dev server 性能、前端 bundle 自身大小、prod dist 内具体静态资源、`codex-gui/**`、服务器启动、WebSocket bridge、Host/Origin 校验和 app-server projection。prod asset file serving 的具体文件 I/O 策略归属 `ServeDir`，本切片只记录 `gui-host` 对它的配置边界；若要分析 `ServeDir` 内部行为，需要另开依赖实现切片。

### 风险

风险：未运行测试、benchmark、server、schema、snapshot、格式化或浏览器验证，结论来自指定文件只读检查。dev proxy 的完整 body buffering 和 per-request client construction 是 dev-mode 关注点；它可能在大 bundle、source map、HMR burst 或高并发刷新时放大 CPU/内存/latency，但不直接代表 prod asset path。`assets.rs` 内没有对 prod index bytes、dev proxy response bytes、error string bytes 的显式上限；是否存在上游 HTTP body limit 或 tower/axum 层限制，超出本轮指定文件范围，当前记为证据不足。

### 下一阶段建议

下一阶段建议：若后续授权性能检测，dev proxy 记录 request count、upstream response bytes、client construction count、proxy latency、body buffering bytes 和 error page fallback count；prod path 记录 index bytes、index request count、static asset request bytes/latency，并把 `ServeDir` 内部行为作为独立依赖边界确认。前端/static assets 继续归入排除文件，只在 Rust host 组装或 serving 边界出现时记录字节规模。
