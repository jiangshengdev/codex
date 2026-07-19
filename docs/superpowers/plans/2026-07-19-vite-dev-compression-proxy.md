# Vite 开发资源压缩与 GUI host HTTP 代理实现计划

Status: ready-for-human

设计依据：[2026-07-19-vite-dev-compression-proxy-design.md](../specs/2026-07-19-vite-dev-compression-proxy-design.md)

## 目标与不变量

目标是让 Vite 开发服务器生成 gzip 响应，并让 GUI host 从公开 Dev HTTP 入口透明保留 Vite 的状态码、端到端 headers 与响应流。

实现期间必须保持以下不变量：

- gzip 默认启用；只启用 gzip，不启用 Brotli，不增加环境变量开关。
- 压缩配置明确写为 `threshold: 1024`。`@polka/compression` 的实际判断是 `size >= threshold`；自动测试使用 512 B 和 2048 B 两档输入，避开 1024 B 边界，避免把依赖的边界语义误写成产品验收争议。
- GUI host 只代理 Vite 开发资源的 `GET` 和 `HEAD`，不扩展为通用反向代理。
- GUI host 不自行压缩响应；压缩协商由 Vite 完成。
- HMR WebSocket 保持现有直连架构，Prod 路由继续直接提供 `dist/`。
- 每个实现任务形成一个独立本地提交；禁止任何 Git 远程操作。

## 完整文件清单

预计创建或修改：

- `codex-gui/vite.config.ts`
- `codex-gui/src/__tests__/viteDevCompression.test.ts`（新建）
- `codex-rs/gui-host/src/assets.rs`
- `codex-rs/gui-host/src/host.rs`
- `codex-rs/gui-host/tests/dev_proxy.rs`（新建）
- `codex-rs/gui-host/Cargo.toml`
- `codex-rs/Cargo.lock`（仅在 Cargo 实际生成差异时纳入）
- `MODULE.bazel.lock`（由仓库命令更新并按实际差异纳入）

不修改 `codex-gui/package.json` 或 `pnpm-lock.yaml`：`@polka/compression@1.0.0-next.25` 已安装并提交。

## Task 1：在真实 Vite HTTP 入口启用 gzip

### Red

1. 新建 `codex-gui/src/__tests__/viteDevCompression.test.ts`。
2. 使用 Vite `createServer` 的 `middlewareMode` 启动真实 Vite middleware，并挂到临时 Node HTTP server；测试通过 HTTP 请求观察公开行为，不直接调用压缩函数。
3. 在临时 root 创建 512 B 和 2048 B 的可压缩资源，覆盖：
   - 2048 B + `Accept-Encoding: gzip` 返回 `Content-Encoding: gzip`，解压后内容一致。
   - 512 B + `Accept-Encoding: gzip` 不压缩。
   - 2048 B + `Accept-Encoding: identity` 不压缩。
   - 协商响应的 `Vary` 包含 `Accept-Encoding`。
4. 先只运行该测试，确认当前配置下大响应 gzip 断言失败。

### Green

1. 修改 `codex-gui/vite.config.ts`，把 `@polka/compression` 注册为 Vite dev middleware。
2. 配置 `threshold: 1024`、`gzip: true`、`brotli: false`。
3. 显式追加 `Vary: Accept-Encoding`，保留其他 middleware 已写入的 `Vary` 值，不覆盖既有 token。
4. 重跑测试并通过，再运行类型、lint 与格式检查。

### 精确验证命令

在 `codex-gui/` 中执行：

```bash
/opt/homebrew/bin/fnm env --shell zsh
/opt/homebrew/bin/fnm exec --using-file pnpm --version
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/__tests__/viteDevCompression.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
/opt/homebrew/bin/fnm exec --using-file pnpm run lint
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
```

运行任何 pnpm 命令前确认输出路径不是 `/Users/jiangsheng/.cache/codex-runtimes/`；本任务不运行安装或更新依赖的命令。

### 提交边界

只提交 `codex-gui/vite.config.ts` 和 `codex-gui/src/__tests__/viteDevCompression.test.ts`，本地提交信息必须是 `Enable gzip for Vite development responses`。

## Task 2：先完成 GUI host 的 HTTP 语义透传

本任务故意保留 `upstream.bytes()` 全量缓冲，只先闭环 HTTP 方法、状态码和 headers；流式 body 在 Task 3 单独处理，使失败能明确归因。

### Red

1. 新建公开集成测试 `codex-rs/gui-host/tests/dev_proxy.rs`。
2. 测试内启动可控假 Vite upstream，再通过公开 `GuiHost::start` 启动 Dev host；所有断言都从 GUI host 的真实 HTTP 地址发起。
3. 覆盖：
   - `GET` 与 `HEAD` 到达 upstream，path/query 保持一致，`HEAD` 客户端不收到 body。
   - `Accept-Encoding`、`If-None-Match`、`If-Modified-Since`、`Range` 等端到端请求 headers 到达 upstream。
   - upstream 状态码以及 `Content-Type`、`Content-Encoding`、`Vary`、`ETag`、`Cache-Control`、`Last-Modified`、`Content-Range` 等端到端响应 headers 到达客户端。
   - 条件请求的 `304 Not Modified` 原样穿过代理。
   - Range 请求的 `206 Partial Content` 与 `Content-Range` 原样穿过代理。
   - 标准 hop-by-hop headers，以及 `Connection` 动态列出的字段，在请求和响应两个方向都被过滤。
4. 先运行新集成测试，确认当前只支持固定 GET、只保留 `Content-Type` 的实现失败。

### Green

1. 修改 `host.rs`，让 Dev fallback 把完整 `Request<Body>` 交给代理；路由仍只接受 `GET`/`HEAD`，WebSocket route 不变。
2. 修改 `assets.rs`：
   - 使用客户端请求的真实 method、path/query 和过滤后的端到端 headers 构造 reqwest 请求。
   - `Host` 由上游 URL 重新生成；不把 GUI host 的 authority 发给 Vite。
   - 在两段连接上过滤 `Connection`、`Keep-Alive`、`Proxy-Authenticate`、`Proxy-Authorization`、`TE`、`Trailer`、`Transfer-Encoding`、`Upgrade` 等 hop-by-hop headers，并解析 `Connection` 中动态声明的字段。
   - 保留 upstream 状态码及过滤后的端到端响应 headers。
   - 保持现有 GUI host 安全 headers 与 502 错误页行为。
   - 暂时继续使用 `upstream.bytes()` 创建响应 body。
3. 让 Task 2 的全部协议测试通过，并保护现有上游不可用错误页测试。

### 精确验证命令

从仓库根目录执行：

```bash
just test -p codex-gui-host --test dev_proxy
just test -p codex-gui-host proxy_vite_returns_embedded_html_when_upstream_is_unavailable
just fmt
git diff --check
```

测试必须在 `just fmt` 之前完成；按仓库规则，格式化后不重复运行测试。检查 `just fmt` 的 diff，只保留本任务相关格式化结果。

### 提交边界

只提交 `codex-rs/gui-host/src/assets.rs`、`codex-rs/gui-host/src/host.rs` 和 `codex-rs/gui-host/tests/dev_proxy.rs`，本地提交信息必须是 `Preserve Vite HTTP semantics through GUI host`。

## Task 3：改为流式响应并更新依赖锁定

### Red

1. 在 `dev_proxy.rs` 增加首块流式测试：假 upstream 先发送首个 chunk，再等待测试释放信号后发送剩余 body。
2. 客户端必须在释放 upstream 之前，通过 `bytes_stream()` 和超时断言收到首个 chunk。
3. 先单独运行该测试，确认 `upstream.bytes()` 会等待 upstream 完成，因此测试失败。

### Green

1. 在 `codex-rs/gui-host/Cargo.toml` 为 reqwest 增加 `stream` feature。
2. 在 `assets.rs` 用 upstream 的 `bytes_stream()` 构造 `Body::from_stream`，不再完整缓冲响应；保持 Task 2 已验证的 status 与 headers 行为。
3. 运行仓库的 Cargo/Bazel 锁定流程；只纳入命令实际产生的 `codex-rs/Cargo.lock` 和 `MODULE.bazel.lock` 差异。
4. 运行流式测试、完整 Dev 代理集成测试、`codex-gui-host` crate 测试和现有 Prod 资源集成测试，确认 Dev 改造没有改变 Prod 行为。

### 精确验证与生成命令

从仓库根目录按顺序执行：

```bash
just test -p codex-gui-host --test dev_proxy proxy_streams_first_chunk_before_upstream_completes
just test -p codex-gui-host --test dev_proxy
just test -p codex-gui-host
just test -p codex-gui-host --test prod_serves_hashed_asset
just bazel-lock-update
just bazel-lock-check
just fix -p codex-gui-host
just fmt
git diff --check
```

确认本计划即表示允许上述精确的 `just test -p codex-gui-host` crate 范围；不扩大到 workspace 全量测试。测试与锁检查先完成，随后执行 `just fix -p codex-gui-host`，最后执行 `just fmt`；按仓库规则，`fix`/`fmt` 后不再重跑测试。若 `fix` 或 `fmt` 产生范围外修改，先排除范围外差异再提交。

### 提交边界

提交 `codex-rs/gui-host/src/assets.rs`、`codex-rs/gui-host/tests/dev_proxy.rs`、`codex-rs/gui-host/Cargo.toml`，以及命令实际更新的 `codex-rs/Cargo.lock`、`MODULE.bazel.lock`。本地提交信息必须是 `Stream proxied Vite response bodies`。

## Task 4：可见浏览器 smoke 与最终核对

本任务只做验证，不修改代码，不创建提交。

1. 使用 fnm 管理的 pnpm 在 `codex-gui/` 启动并保持前台 Vite dev session：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run dev
```

2. 使用当前 GUI URL，完整保留 `threadId` 与 `token`。
3. 按 `$debug-responsive-gui` 使用可见的 Google Chrome for Testing 打开该 URL：

```bash
node .codex/skills/debug-responsive-gui/scripts/debug-responsive-gui.mjs --gui-url '<本次获取的完整 GUI URL>'
```

4. 在可见 DevTools 中确认：
   - 页面及模块资源通过 GUI host 正常加载，无解码或 MIME 错误。
   - 大型可压缩 Vite 资源实际带有 `Content-Encoding: gzip` 和包含 `Accept-Encoding` 的 `Vary`。
   - 控制台显示 Vite HMR 已连接，Network 的 HMR WebSocket 仍直连 Vite，未改经 GUI host。
   - 页面可正常刷新并继续工作；真实 4G/5G 加载耗时只作观察，不作为通过门槛。
5. 最后执行只读核对：

```bash
git status --short
git log --oneline -3
```

确认三个实现任务各有一个本地提交，工作区没有计划外变更；Task 4 不提交，也不执行任何 Git 远程命令。

## 明确不做

- 不启用 Brotli。
- 不修改 HMR WebSocket 架构或把 HMR 改经 GUI host。
- 不修改 Prod 路由或生产资源提供方式。
- 不支持 `GET`/`HEAD` 之外的方法。
- 不扩展重定向、认证、Cookie、CSP 冲突、Vite `server.proxy` 等通用代理场景。
- 不以蜂窝网络的固定加载时间或改善比例作为硬验收标准。

## 实施门禁

本文件当前状态为 `ready-for-human`。用户明确确认本计划之前，不得修改实现文件、运行实现验证、stage 或 commit；确认后才按 Task 1 到 Task 4 的顺序执行。每个实现任务单独创建本地提交，禁止执行任何 Git 远程操作。
