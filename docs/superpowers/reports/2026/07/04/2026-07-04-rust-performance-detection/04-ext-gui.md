# Ext GUI

后续任务填充 ext-gui 性能检测结果。

## Launch GUI tool boundary

状态：无明显风险。

结论：`codex-rs/ext/gui` 的 `launch_gui` extension 边界只注册一个 tool、解析空对象参数、调用一次 host service，并把 host 返回的 URL entries 转为 JSON 输出；没有发现新的长期状态、动态注册集合、无界缓存或跨调用累积。该边界应作为后续性能检测的可观测输入记录，但不是当前性能 finding。四个指定文件相对本地 `rust-v0.142.0` 均为新增，因此该 extension tool 边界归因于当前 `dev` 相对 `rust-v0.142.0` 新增。

规模变量：工具列表查询次数 `Q`、thread id 字符串长度 `T`、工具调用次数 `N`、参数字符串字节数 `A`、URL entry 数 `U`、label/url 字符串总字节数 `B`、错误消息字节数 `E`、host service latency `S`。注册和配置更新是 `O(1)`；每次 tools 查询最多构造一个 executor，`ThreadId` parse 为 `O(T)`；参数解析是 `O(A)`；host service 是 extension 层一次 await；成功输出构造是 `O(U + B)`；错误输出构造是 `O(E)`。

关键证据：

- `codex-rs/ext/gui/src/extension.rs:40`-`:52` thread start 时只把 enabled bool 写入 thread store。
- `codex-rs/ext/gui/src/extension.rs:55`-`:67` config changed 时只更新同一个 `GuiExtensionConfig`，没有追加集合或跨调用缓存。
- `codex-rs/ext/gui/src/extension.rs:70`-`:93` tool contributor 读取 config，disabled / missing config / invalid thread id 都返回空 vec；enabled 时只返回一个 `LaunchGuiToolExecutor`。
- `codex-rs/ext/gui/src/extension.rs:96`-`:109` install 只注册 lifecycle、config、tool contributor 三个 contributor。
- `codex-rs/ext/gui/src/spec.rs:7`-`:22` `launch_gui` tool spec 是固定名称、固定描述、空 properties、空 required、`additionalProperties: false` 的 object schema；spec 构造是固定规模。
- `codex-rs/ext/gui/src/tool.rs:20`-`:25` extension 层只依赖 `GuiLaunchToolService::launch_urls_for_thread(thread_id)`，host service 内部成本不在本任务范围内。
- `codex-rs/ext/gui/src/tool.rs:91`-`:121` tool handle 先解析参数，再 await 一次 service 调用；成功时构造 `{ "urls": ... }`，失败时构造 `{ "error": { "kind", "message" } }` 且 success=false。
- `codex-rs/ext/gui/src/tool.rs:132`-`:145` 参数解析对完整 argument string 做一次 `serde_json::from_str`，只接受空 object，非空 object 或非 object 直接返回给模型的错误。
- `codex-rs/ext/gui/src/tool.rs:147`-`:155` URL 输出按 `urls.entries.into_iter().map(...).collect()` 线性转换，没有过滤、排序、缓存或额外 fanout。
- `codex-rs/ext/gui/src/tool.rs:158`-`:164` URL kind 是三分支固定 match。
- `codex-rs/ext/gui/src/lib.rs:1`-`:16` lib 只 re-export extension/spec/tool API，没有额外运行时逻辑。
- 本地 `git diff --name-status rust-v0.142.0 -- codex-rs/ext/gui/src/extension.rs codex-rs/ext/gui/src/spec.rs codex-rs/ext/gui/src/tool.rs codex-rs/ext/gui/src/lib.rs` 输出四个文件均为 `A`。

已排除项：`gui-host` 内部启动、地址发现、URL 生成、WebSocket bridge、asset service/proxy 和前端 GUI；tool 注册集合无界增长；extension 层持有 per-call URL 历史；`launch_gui` 参数对象导致业务规模增长；`lib.rs` re-export 成为运行时热路径。

风险/下一步：本轮未运行测试、benchmark、schema 生成、snapshot、格式化或前端验证，因此结论是只读源码判断。extension 层没有看到对 argument string 或 URL output JSON 字节数的显式 cap；成本仍会随模型传入参数字节数、host service 返回 URL entry 数和字符串长度线性增长。后续如果进入实测阶段，可在授权后观测 `launch_gui` invocation count、argument bytes、service latency、URL entry count、URL/label total bytes、error kind/message bytes 和 output JSON bytes；若需要证明 entries 上限或 service latency，应转到 `gui-host` URL/service 边界，不要把 host 内部成本归因给 ext/gui。
