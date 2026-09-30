# 以受控 RichText 承载消息编辑行为

历史决定：2026-09-01。补录日期：2026-09-30。

Composer 采用 Lexical RichText 宿主，复用原子内联内容的选择、光标与历史行为；仅复制 Equation 节点或继续在 PlainText 上补自研几何导航，无法提供完整交互合同。产品仍是受约束的消息输入区，不开放通用富文本格式，并保留自身结构化输入、发送、剪贴板和 IME 约束；为此接受维护内容限制的成本，替代早期 PlainText 水平增量方案。

原子内容支持同一宿主内的范围选择、多选及替换，不为 Skill 另设 Tab stop 或内部编辑器。键盘提交由单一 Lexical command owner 处理，IME 的键盘抑制与最终提交消费分开；自动化事件证据不代表真实系统 IME 已验收。附件扩展依照其独立决定接入，不把早期仅含文本和 Skill 的限制写成永久内容全集。

恢复证据与现状核对：[选择与焦点 #187](https://cnb.cool/jiangshengdev/codex/-/issues/187)、[文档模型与宿主 #188](https://cnb.cool/jiangshengdev/codex/-/issues/188)。
