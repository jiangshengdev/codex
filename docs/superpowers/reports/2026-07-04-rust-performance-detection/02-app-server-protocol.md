# App Server Protocol

后续任务填充 app-server-protocol 性能检测结果。

## Handwritten protocol source

状态：无明显风险。

结论：指定 handwritten protocol source 没有发现新的运行时或生成时性能检测 finding。`thread_projection.rs` 新增 projection attach/detach/snapshot/event/delta/closed payload 类型；`common.rs` / `v2/mod.rs` 把这些类型注册到 v2 request/notification 和 re-export；`export.rs` 保留 schema generation 辅助逻辑。`docs/superpowers/issues/2026-05-30-06-export-annotation-last-writer-wins.md` 对应的 annotation last-writer-wins 仍可视为已有 issue 仍成立，但它是 build-time schema 文档注解风险，作为性能 finding 排除。

规模变量：运行时成本随协议 payload 大小线性增长，主要是 `ThreadProjectionSnapshot.thread` 的 snapshot 内容、event/delta payload 和字符串 id 长度。生成时成本随协议类型数量、generated TS/JSON 文件数量、schema tree 大小、definitions/ref 图大小、同名 schema 冲突次数增长。新增 projection 注册项规模固定：2 个 client request、3 个 server notification、有限数量 schema/TS 导出项。`schemas_match_except_annotations` 只在同名 schema 冲突路径 clone 并递归遍历两棵 schema tree，复杂度随冲突 schema tree 节点数线性增长，未见无界缓存或运行时热路径。

关键证据：

- `codex-rs/app-server-protocol/src/protocol/v2/thread_projection.rs:12`-`:119` 只定义 projection payload 类型并 derive serde/schema/TS，没有 loop、global state 或缓存。
- `codex-rs/app-server-protocol/src/protocol/v2/thread_projection.rs:30`-`:32` snapshot payload 包含 `Thread` 和 optional head commit；成本随 snapshot 内容增长，属于协议 payload 固有规模。
- `codex-rs/app-server-protocol/src/protocol/common.rs:509`-`:518` 新增 attach/detach request 注册，scope 是 thread id。
- `codex-rs/app-server-protocol/src/protocol/common.rs:431`-`:449`、`:1410`-`:1415` schema 导出按注册类型逐项 push `write_json_schema`。
- `codex-rs/app-server-protocol/src/protocol/common.rs:1626`-`:1628` 新增 projection event/delta/closed notification 注册。
- `codex-rs/app-server-protocol/src/protocol/v2/mod.rs:27`、`:56` 只是新增 module 和 re-export。
- `codex-rs/app-server-protocol/src/export.rs:113`-`:185` TS 生成成本随 generated TS 文件数和内容总量增长。
- `codex-rs/app-server-protocol/src/export.rs:200`-`:246` JSON 生成聚合 schema、构建 bundle 和 flat v2 bundle。
- `codex-rs/app-server-protocol/src/export.rs:993`-`:1073`、`:1088`-`:1135` bundle/flat bundle 处理随 schema、definitions 和 ref 图大小增长。
- `codex-rs/app-server-protocol/src/export.rs:1297`-`:1326`、`:1338`-`:1363` 同名 schema 冲突时进行 annotation-insensitive comparison 并可能替换 existing。
- `docs/superpowers/issues/2026-05-30-06-export-annotation-last-writer-wins.md:5`、`:13`-`:15` 明确该 issue 仅影响 build-time schema 文档字段，不影响运行时。
- 本地只读对照 `rust-v0.142.0`：`thread_projection.rs` 是新增；`common.rs` / `v2/mod.rs` / `export.rs` 是修改。因此本节有限生成成本增量和非性能 schema 注解风险归因到当前 `dev` 相对 `rust-v0.142.0` 的 app-server-protocol 变更。

已排除项：

- 排除把 annotation last-writer-wins 当作性能 finding；它是已有非性能 issue，当前性能检测只引用为风险边界。
- 排除 handwritten protocol source 自身引入 projection runtime 状态增长；该文件只定义 payload 类型，runtime 状态由 app-server 任务覆盖。
- 排除 `v2/mod.rs` module/re-export 成为运行时热路径。
- 排除新增 request/notification 注册造成非线性生成成本；当前新增类型数量固定，导出路径按类型逐项处理。
- 排除 `schemas_match_except_annotations` 是运行时协议成本；它只在 schema generation bundle 构建时处理 `serde_json::Value`。

风险/下一步：本轮未运行 schema generation、测试、benchmark 或格式化，因此结论是只读源码判断，不是实测耗时结果。后续若要验证生成时成本，应在单独授权下记录 schema 数量、definitions 数量、TS/JSON 文件数、同名 schema collision 次数和生成耗时；非性能方向继续用 `2026-05-30-06-export-annotation-last-writer-wins.md` 追踪注解覆盖风险，不混入性能检测主线。
