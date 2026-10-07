# 响应 Schema 对齐 TypeScript，校验器声明实际接受面

历史决定与修订：2026-08-19、2026-08-28、2026-09-02、2026-09-10。历史补录日期：2026-09-30；响应对齐规则澄清日期：2026-10-07。

GUI 从权威 Schema 生成边界校验，校验器的类型声明必须反映实际接受的数据；消费者从生成契约派生类型，不另行维护协议镜像。字段可省略与字段值可为 `null` 是不同契约；不能通过静默缩窄接受面，或为通过 fixture 验证而弱化协议，掩盖契约不一致。

这一边界由此前任务共同确立：`TurnError` 的 Schema 仅要求 `message` 时，机械生成校验器声明 `Partial<TurnError> & Required<Pick<TurnError, "message">>`，不改 Rust wire 行为；`pluginId` 为必需 nullable 字段时，补齐消费者 fixture 的显式 `null`；中断请求使用专属的 `TurnInterruptParams` 生成校验器，不借用引导请求形状。Schema 闭包与 standalone 校验产物由同一个生成 owner 维护，提取该 owner 时保持输出不变。

保留生成链，避免在 Rust 导出、Schema、类型声明与 GUI 校验之间持续维护手工镜像。生成链的复杂度换取接受面可追溯，以及协议变化时明确暴露消费者失配；不得通过削弱检查或填充值掩盖版本差异。

2026-09-30 裁决撤销对批量修改上游 nullable 响应方案的认可。2026-08-24 的早期确认和实施经过仍是历史事实；撤销不表示当时从未授权，也不表示每项改动都错误。当次未回退代码，固化生成入口的独立修复仍获认可。

## 2026-10-07 确认的响应对齐规则

默认以既有的生成 TypeScript 响应声明为契约基准，对齐 JSON Schema 和运行时校验器。TS 中必需且 nullable 的字段必须存在，值允许为 `null`；可选字段允许省略，只有 TS 类型允许时，其值才允许为 `null`。通过修正 Rust 源码标注、执行项目生成入口更新产物，不手改生成文件。校验器声明必须始终反映实际接受面。

允许有证据支持的例外：若既有 TS 声明不符合已确立的 wire 行为，可以同时纠正 TS 和 JSON Schema，并记录原声明、wire 证据及最终字段契约。不得仅为通过一致性检查而修改 TS。历史例子是 `ConfigReadResponse.layers`：服务端原本就在未请求 layers 时省略字段、请求时返回数组，因此将 `layers: Array<ConfigLayer> | null` 改为 `layers?: Array<ConfigLayer>`，并让 Schema 对齐这一行为。

本次澄清认可上述默认对齐方向及有证据的例外；此后不能将九月的撤销裁决解释为对该方向的一概否定，也不能追溯性地认定每项历史改动都正确。对 `7d7b85f2` 及 `5fe2e64dff` 重生成产物的审计发现：53 个字段对齐既有的必需 nullable TS 声明，2 个字段对齐既有的可选 non-null TS 声明，另有 `layers` 例外。历史改动仍须逐项核验；仅凭 `#[serde(default)]` 存在或被删除，不能判断正确性。

现有跨契约检查覆盖 stable 和 experimental 导出中 manifest 可达的 v2 响应，对 optional 或 nullable 的顶层字段比较存在性及可空性；它不证明递归或完整类型等价。在该覆盖范围内，生成物一致是必要条件，但不足以单独证明 wire 契约例外合理。

本决定不认可尚未确定的 `parentCommitId` 缺失处理方案，也不宣称所有既有不一致已修复。这里记录的是已确认规则，不是 `promptHash` 的实现或验证结果。

历史证据与现状核对：[GUI 与 Rust 协议边界 #204](https://cnb.cool/jiangshengdev/codex/-/issues/204)。
