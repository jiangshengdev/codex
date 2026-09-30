# GUI 边界校验遵循权威 schema，声明实际接受面

历史决定与修订：2026-08-19、2026-08-28、2026-09-02、2026-09-10。补录日期：2026-09-30。

GUI 从权威 schema 生成边界校验，并使校验器的类型声明反映实际接受的数据；消费者从生成类型派生，不另行维护协议镜像。字段可缺省与字段值可为 `null` 是不同契约，不能为了匹配较强的 TypeScript 声明而默默缩窄实际接受面，也不能为通过 fixture 验证而弱化协议。

这一边界由具体任务共同确立：`TurnError` 的 schema 仅要求 `message` 时，机械生成 `Partial<TurnError> & Required<Pick<TurnError, "message">>`，不改 Rust wire；`pluginId` 为必需 nullable 字段时，补齐消费者 fixture 的 `null`；中断请求使用 `TurnInterruptParams` 专属生成校验器，不借用引导请求形状。schema 闭包与 standalone 校验产物由一个生成 owner 负责，提取该 owner 时保持输出不变。

跨 Rust 导出、schema、类型声明与 GUI 校验的手工镜像会带来持续双维护。保留生成链的复杂度，换取接受面可追溯及协议变化时明确暴露消费者失配；这不意味着以弱化穷尽校验或填充值掩盖版本差异。

2026-09-30 裁决撤销对批量修改上游 nullable 响应方案的认可，保留 2026-08-24 的早期确认和实施经过；撤销发生于本次裁决，不能倒写成当时从未授权。仅使 TypeScript 与 JSON Schema 一致不足以证明统一方向正确，不能据 GUI 校验需求自行决定上游协议语义；现存批量改动作为差异记录，本次未回退代码。固化生成入口的独立修复不随该方案撤销。

本决定不把尚未确认的 `parentCommitId` 缺失处理方案记为已接受；现存 schema 与类型不一致仍须分别核验，不能据本 ADR 声称已全部修复。

恢复证据与现状核对：[GUI 与 Rust 协议边界 #204](https://cnb.cool/jiangshengdev/codex/-/issues/204)。
