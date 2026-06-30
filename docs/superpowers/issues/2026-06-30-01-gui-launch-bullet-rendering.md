# GUI launch 输出在聊天渲染中出现重复 bullet

## 状态

- 记录中，未修复。

## 现象

普通 `GUI启动` 返回 URL 时，用户看到首行变成：

```text
• • GUI URLs:
```

预期只显示一个 bullet：

```text
• GUI URLs:
```

## 已确认事实

- `.codex/skills/gui-launch/SKILL.md` 当前要求最终回复第一行固定为真实 bullet 字符 `• GUI URLs:`。
- 当最终消息渲染层把该行再识别为列表项时，可能出现额外的外层 bullet，形成 `• • GUI URLs:`。
- URL 内容、label 顺序和 `launch_gui` 返回值本身没有在本次问题中显示异常。

## 影响

- 主要是显示瑕疵。
- 不影响 GUI URL 的可用性。

## 后续建议

- 将 `gui-launch` skill 的最终输出要求改为使用 `text` 代码块承载 CLI 文本，避免 Markdown 列表二次渲染。
- 保持代码块内部文本仍与 CLI `/gui` 输出一致。
