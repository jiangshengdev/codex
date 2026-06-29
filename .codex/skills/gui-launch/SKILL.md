---
name: gui-launch
description: Ordinary Codex GUI launch URL printing. Use when the user says `GUI 启动`, `启动 GUI`, `/gui`, asks for normal GUI URLs, or wants the same output as the CLI `/gui` command. Do not use for debugging, responsive-mode checks, screenshots, browser automation, or visual verification.
---

# GUI Launch

## 基本规则

- 回复用户使用简体中文。
- 这是普通 GUI 启动流程；行为必须和 CLI `/gui` 保持一致。
- 只调用 Codex 外层 `launch_gui` 工具并打印返回的 URL 列表。
- 不要运行 `.codex/skills/debug-responsive-gui/scripts/debug-responsive-gui.mjs`。
- 不要启动或控制浏览器，不要使用 Playwright，不要进入响应式模式，不要截图，不要验证页面。
- 不要启动、停止或管理 `codex-gui` Vite dev server。
- 不要选择 LAN、Local 或 VPN；不要添加优先级、fallback、可用性判断或地址筛选。
- URL、label、顺序和 token 必须来自本次 `launch_gui` 返回值；不要手写、猜测、拼接或复用旧 URL。

## 输出格式

调用 `launch_gui` 后，按 CLI `/gui` 的文本格式打印全部返回条目：

```text
• GUI URLs:
  <label>:<padding><url>
```

具体规则：

- 第一行固定为 `• GUI URLs:`。
- 后续每个 URL 条目一行，格式为两个空格、label、冒号、padding、URL。
- padding 使用 CLI `/gui` 的对齐语义：以返回条目中最长 label 宽度为准，让 URL 起始列对齐。
- 如果只返回 `Local`，只打印 `Local`。
- 如果返回 `Local`、`LAN`、`VPN` 或其他 label，全部按 `launch_gui` 返回顺序打印。
- 最终回复不要额外添加解释、Markdown 链接、调试状态、验证结果或替代地址。

示例：

```text
• GUI URLs:
  Local: http://127.0.0.1:12345/?threadId=t#token=x
  LAN:   http://192.168.3.165:12345/?threadId=t#token=x
  VPN:   http://100.88.28.119:12345/?threadId=t#token=x
```

## 错误处理

如果 `launch_gui` 失败，按 CLI `/gui` 的语义报告失败信息：

```text
Failed to launch GUI: <error>
```

不要自动切换到 debug skill，不要启动 Vite，不要打开浏览器。
