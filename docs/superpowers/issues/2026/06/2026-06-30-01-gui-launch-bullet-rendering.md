# GUI launch 输出在聊天渲染中出现重复 bullet

日期: 2026-06-30
状态: 🟡 skill 已修正，待聊天渲染回归
范围: `.codex/skills/gui-launch/SKILL.md` / 聊天渲染
优先级: 未定

## 摘要

`GUI启动` 输出重复 bullet 的 skill 输出约束已修复，但仍需下次普通渲染回归确认。

## 问题

普通 `GUI启动` 返回 URL 时，用户曾看到首行变成 `• • GUI URLs:`，预期只显示一个 bullet：`• GUI URLs:`。

## 证据

- `.codex/skills/gui-launch/SKILL.md:20` 要求最终回复使用 CLI `/gui` text format。
- `.codex/skills/gui-launch/SKILL.md:22` 至 `:25` 当前使用 `text` 代码块示例承载 CLI 文本，首行是 `GUI URLs:`。
- `.codex/skills/gui-launch/SKILL.md:29` 明确第一行必须精确为 `GUI URLs:`，且文本中不要包含真实 bullet 字符。
- 当最终消息渲染层把该行再识别为列表项时，可能出现额外的外层 bullet，形成 `• • GUI URLs:`。
- URL 内容、label 顺序和 `launch_gui` 返回值本身没有在本次问题中显示异常。

## 判断

部分完成。skill 输出约束已修复，当前静态证据显示 skill 文本不会主动输出真实 bullet；但尚未记录普通 `GUI启动` 的实际聊天渲染回归结果，因此不能升级为 ✅。

## 修复记录

- skill 输出约束已改为首行固定 `GUI URLs:`。
- skill 文本要求避免包含真实 bullet 字符。

## 影响

主要是显示瑕疵，不影响 GUI URL 的可用性。

## 后续处理

下次执行普通 `GUI启动` 时，只读确认最终聊天消息首行是否只显示外层 bullet 加 `GUI URLs:`，并记录渲染截图或 transcript 观察结果。若回归通过，可更新为已验证修复。
