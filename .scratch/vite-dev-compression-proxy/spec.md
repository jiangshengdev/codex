# Vite 开发资源压缩与 GUI host HTTP 代理透传

Status: ready-for-human

## Problem Statement

开发者通过 LAN、VPN 或蜂窝网络远程访问 Codex GUI 开发环境时，Vite 开发资源以未压缩形式传输。开发环境还会产生较多独立的 JavaScript、CSS、HTML、JSON 与静态资源请求，因此在带宽有限或延迟较高的网络中，首次加载和刷新明显变慢。

当前 GUI host 对 Vite 开发资源的代理不是符合端到端 HTTP 语义的透明代理。它只保留有限的响应信息，并在返回客户端前完整读取上游 body。这会丢失 Vite 已提供的压缩协商、缓存验证、范围请求等语义，也会增加首字节等待和代理内存占用。

本设计需要改善远程开发体验，同时保持现有 HMR 工作方式和生产资源服务行为不变。

## Solution

Vite 开发服务器默认对符合条件的响应启用 gzip。客户端声明支持 gzip 且响应超过 1 KiB 时，Vite 返回 gzip 编码的响应；较小响应或不支持 gzip 的客户端继续接收未压缩响应。

GUI host 的开发资源代理改为符合 HTTP 规范的流式代理：

- 支持 Vite 开发资源使用的 `GET` 和 `HEAD` 请求。
- 将真实的端到端请求语义转发给 Vite。
- 将 Vite 的状态码和端到端响应语义返回客户端。
- 过滤不得跨代理连接转发的逐跳 headers。
- 流式转发响应 body，避免完整缓冲。
- 保持 HMR WebSocket 现有直连方式。
- 保持生产模式直接提供构建产物的现有行为。

最终，浏览器能够实际获得 Vite 生成的 gzip、缓存验证和范围请求结果，而 GUI host 不重复实现压缩算法或改变 Vite 的资源语义。

## User Stories

1. 作为通过远程网络访问 Codex GUI 的开发者，我希望开发资源能够压缩传输，从而减少首次加载所需的数据量。
2. 作为使用 4G、5G 或其他受限网络的开发者，我希望开发页面刷新时尽量少传输重复内容，从而缩短等待时间。
3. 作为本机开发者，我希望 gzip 默认随开发服务器启用，从而不需要记忆或设置额外的环境变量。
4. 作为开发者，我希望所有标准开发启动方式使用一致的压缩行为，从而避免本机、LAN 和 VPN 入口出现配置差异。
5. 作为浏览器客户端，我希望在声明支持 gzip 时收到 gzip 编码的适用响应，从而降低网络传输量。
6. 作为不支持 gzip 的客户端，我希望仍能收到普通响应，从而保持协议兼容性。
7. 作为开发者，我希望小于或等于压缩阈值的响应不进行无收益的压缩，从而避免额外的压缩开销。
8. 作为开发者，我希望只启用 gzip 而不启用 Brotli，从而在改善传输体积的同时控制开发服务器的实时压缩成本。
9. 作为浏览器客户端，我希望 GUI host 将 `Accept-Encoding` 转发给 Vite，从而让 Vite 能够执行真实的内容协商。
10. 作为浏览器客户端，我希望 GUI host 保留 `Content-Encoding` 和 `Vary`，从而正确解码响应并区分不同协商结果。
11. 作为浏览器客户端，我希望 Vite 的 `Content-Type` 等资源元数据完整到达客户端，从而正确加载 HTML、JavaScript、CSS、JSON 和静态资源。
12. 作为开发者，我希望刷新页面时浏览器能够使用 `ETag` 和条件请求，从而让未变化的资源返回 `304`，而不是重新传输完整内容。
13. 作为浏览器客户端，我希望 `If-None-Match` 和 `If-Modified-Since` 能够到达 Vite，从而保留 Vite 现有的缓存验证行为。
14. 作为浏览器客户端，我希望 `Cache-Control`、`ETag` 和 `Last-Modified` 能够从 Vite 到达浏览器，从而按 Vite 的真实规则缓存开发资源。
15. 作为需要加载可分段资源的客户端，我希望 `Range` 请求能够到达 Vite，并收到 `206` 和 `Content-Range`，从而保留标准范围请求行为。
16. 作为使用开发工具检查网络请求的开发者，我希望看到 Vite 实际产生的状态码和端到端 headers，从而能够准确诊断开发资源问题。
17. 作为开发者，我希望 `GET` 和 `HEAD` 都具备一致的代理语义，从而能够加载资源或仅查询其元数据。
18. 作为远程访问开发页面的用户，我希望响应 body 在上游开始返回后即可向客户端传输，从而减少完整缓冲造成的首字节等待。
19. 作为 GUI host 的维护者，我希望代理过滤标准逐跳 headers，从而避免把一段 HTTP 连接的传输控制错误地复制到另一段连接。
20. 作为 GUI host 的维护者，我希望代理识别并过滤 `Connection` 动态声明的逐跳字段，从而符合 HTTP 代理规范。
21. 作为前端开发者，我希望 HMR 继续使用现有直连方式，从而不因资源代理优化而改变热更新架构。
22. 作为前端开发者，我希望压缩和代理改造后 HMR 仍然正常，从而保持现有快速反馈体验。
23. 作为生产环境用户，我希望生产模式仍直接提供构建产物，从而不受仅面向开发环境的改造影响。
24. 作为维护者，我希望本次验收基于确定性的 HTTP 行为，而不是易受信号质量、运营商和缓存状态影响的真实 4G 时间指标。
25. 作为维护者，我希望压缩由 Vite 产生并由 GUI host 透传，从而避免 GUI host 形成第二套压缩策略。
26. 作为维护者，我希望实现只覆盖当前 Vite 开发服务器真实使用的 HTTP 行为，从而避免为未发生的通用反向代理场景增加复杂度。
27. 作为维护者，我希望现有依赖管理明确记录压缩 middleware，从而不依赖工具内部未公开的捆绑实现。
28. 作为测试维护者，我希望能够分别识别压缩协商、缓存验证、范围请求、header 过滤或流式传输的回归，从而快速定位失败所在层。

## Implementation Decisions

- 本功能只优化现有 Vite 开发模式，不新增生产式预览入口。
- Vite 开发服务器默认启用压缩，不增加环境变量开关。
- 压缩算法仅使用 gzip，不启用 Brotli。
- 压缩阈值固定为 1 KiB。
- 使用 `@polka/compression` 的精确版本 `1.0.0-next.25`。
- 压缩 middleware 作为项目直接开发依赖维护，不依赖 Vite 内部捆绑但未暴露的实现。
- `@polka/compression` 不会自动补充压缩协商所需的 `Vary: Accept-Encoding`，开发服务器必须显式补齐该响应语义。
- gzip 由 Vite 开发服务器执行。GUI host 不对 Vite 响应重新压缩。
- GUI host 的开发资源代理支持 `GET` 和 `HEAD`。
- 代理转发 Vite 开发资源实际使用的端到端请求 headers，包括压缩协商、条件请求和范围请求相关 headers。
- 代理保留 Vite 返回的状态码。
- 代理保留端到端响应 headers，包括内容类型、内容编码、缓存控制、缓存验证、修改时间、协商变化和范围响应相关 headers。
- 代理必须支持 Vite 返回的 `304 Not Modified`。
- 代理必须支持 Vite 返回的 `206 Partial Content`。
- 代理必须过滤标准 hop-by-hop headers。
- 代理必须解析 `Connection` header，并过滤其中动态指定的逐跳字段。
- 上游响应 body 使用流式方式传递给客户端，不再在 GUI host 中完整读取后重建。
- HMR WebSocket 保持现有直连 Vite 的方式，不接入本次 HTTP 代理改造。
- 生产模式继续直接提供构建产物，不使用 Vite 开发服务器，也不改变现有生产资源路径。
- 验收以确定性的 HTTP 协议行为为准。真实蜂窝网络加载时间可以作为观察数据，但不是通过或失败的硬门槛。
- 设计只覆盖当前 Vite 开发服务器真实发生的资源行为，不扩展为通用反向代理。
- 当前 Vite 配置不会触发的重定向、认证、Cookie、安全响应头冲突等策略不构成本设计的一部分。

## Testing Decisions

- 测试只验证从公开入口可观察到的 HTTP 行为，不依赖私有函数调用、内部字段或特定实现步骤。
- Vite 压缩行为使用真实 Vite dev HTTP 入口作为公开测试 seam。
- 通过真实 Vite dev HTTP 入口验证：大于 1 KiB 的适用响应在客户端声明支持 gzip 时返回 `Content-Encoding: gzip`，并可正确还原原始内容。
- 通过真实 Vite dev HTTP 入口验证：低于压缩阈值的响应不进行 gzip 压缩。
- 通过真实 Vite dev HTTP 入口验证：客户端请求 identity 编码时获得未压缩响应。
- 通过真实 Vite dev HTTP 入口验证：压缩协商响应显式包含 `Vary: Accept-Encoding`。
- GUI host 代理行为使用真实 GUI host Dev HTTP 入口连接可控假 upstream 作为公开测试 seam。
- 通过 GUI host Dev HTTP 入口验证 `GET` 和 `HEAD` 的代理行为。
- 通过可控假 upstream 观察端到端请求 headers 是否到达上游，并从客户端观察上游状态码和端到端响应 headers 是否被保留。
- 验证 `ETag` 与 `If-None-Match` 对应的 `304` 行为能够穿过代理。
- 验证 `Range` 对应的 `206` 和 `Content-Range` 能够穿过代理。
- 验证 `Cache-Control`、`Last-Modified`、`Vary`、`Content-Encoding` 等真实端到端响应语义能够穿过代理。
- 验证标准 hop-by-hop headers 不会跨代理连接传递。
- 验证 `Connection` 动态列出的逐跳字段不会跨代理连接传递。
- 让可控假 upstream 分阶段发送 body，并验证首个 chunk 在 upstream 完成前已经到达客户端，以证明代理不存在全量缓冲。
- HMR 不新增代理测试 seam；继续使用现有开发环境 browser smoke 验证连接和热更新保持正常。
- 生产资源路径不新增新的内部测试 seam；由现有生产资源公开入口的回归测试保护其行为不变。
- 真实 4G 或 5G 网络体验可以作为手工观察，但不作为自动测试或硬性验收门槛。

## Out of Scope

- 不启用 Brotli。
- 不新增独立的生产式预览或远程预览启动模式。
- 不以固定的 4G 或 5G 页面加载时间改善比例作为验收门槛。
- 不修改 HMR WebSocket 的连接方式。
- 不把 HMR WebSocket 改为经 GUI host 转发。
- 不改变生产模式提供构建产物的方式。
- 不把 GUI host 扩展为支持所有 HTTP 方法的通用反向代理。
- 不设计当前配置不会触发的重定向跟随或绝对 `Location` 重写策略。
- 不设计 `Authorization`、`Proxy-Authorization` 或 Cookie 的代理策略。
- 不设计 Vite 上游 `Set-Cookie` 的处理策略。
- 不设计 Vite 与 GUI host 之间的 CSP 或 `X-Frame-Options` 冲突策略。
- 不修改当前 Vite `base` 配置。
- 不引入 Vite `server.proxy`。
- 不创建或修改 domain context 文档或 ADR，除非后续发现真实的术语或架构决策需要单独记录。
- 不在本设计阶段生成实现 tickets、修改实现或执行验证。

## Further Notes

- 当前 Codex GUI 使用的 Vite 版本与调研时检查的 Vite 源码版本在本设计涉及的开发资源行为上保持一致。
- Vite 开发资源已经提供 `Content-Type`、`Cache-Control`、`ETag`、条件请求、修改时间和范围请求等语义；本设计的重点是让这些语义穿过 GUI host，而不是在 GUI host 中重新创造它们。
- `@polka/compression@1.0.0-next.25` 已作为直接开发依赖安装并提交。
- 本设计依赖的核心边界是浏览器、GUI host 和 Vite 之间的两段 HTTP 连接。端到端语义应跨越代理，单连接传输细节应由每一跳独立处理。
- 正式 spec 获得用户确认后，状态可转为 `ready-for-agent`，下一阶段再通过 Matt `to-tickets` 将设计拆分为有依赖顺序的本地 Markdown tickets；在用户确认 spec 前不得进入该阶段。
