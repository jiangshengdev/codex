# 局域网 HTTP 访问时 Streamdown 复制按钮不可用

日期: 2026-07-03
状态: 📏 待验证
范围: Codex GUI / Streamdown / Clipboard API / LAN HTTP
优先级: 未定

## 摘要

局域网 HTTP 访问时 Streamdown 复制按钮不可用，初步判断与 Clipboard API secure context 限制有关，但尚未做运行时验证。

## 问题

用户反馈 Streamdown 剪贴板复制无法使用。当前访问方式是局域网地址，例如通过 `http://192.168.x.x:<port>` 访问 Codex GUI。

## 证据

- `codex-gui/src/features/committedTranscriptSurface/MarkdownText.tsx:13` 的 committed Markdown 路径仍直接使用 `Streamdown`。
- `codex-gui/src/features/committedTranscriptSurface/LiveMarkdownText.tsx:13` 的 live Markdown 路径也直接使用 `Streamdown`，并在 `LiveMarkdownText.tsx:18` 设置 `isAnimating`。
- `codex-gui/src/features/committedTranscriptSurface/markdownRendering.tsx:14` 至 `:28` 只定制 `inlineCode` 组件；限定证据范围内没有发现 Codex GUI 自定义 clipboard fallback、secure context 检测或 LAN HTTP 特判。
- Streamdown 的交互控件包含复制能力，复制按钮通常依赖浏览器 `navigator.clipboard`。
- 现代浏览器的 Clipboard API 要求页面处于 secure context。
- `http://localhost` 和 `http://127.0.0.1` 通常会被浏览器视为本地安全上下文。
- `http://192.168.x.x:<port>` 这类局域网 IP HTTP 来源通常不是 secure context。
- 如果 `window.isSecureContext` 为 `false`，或 `navigator.clipboard` 不存在，复制按钮可能失败或不可用。
- Streamdown 在流式输出仍处于 `isAnimating=true` 时也可能禁用复制控件；该原因需要和 secure context 问题分开验证。

## 判断

待验证。最可能的根因仍是通过局域网 IP 的 HTTP 地址访问 Codex GUI 时，浏览器没有把页面视为 secure context，导致 Streamdown 复制按钮无法使用 Clipboard API。当前静态代码证据只能说明限定路径内没有 GUI 自定义 clipboard/secure context 处理，不能替代真实 LAN HTTP 浏览器验证。

该问题不是 Streamdown 必须运行在公网 HTTPS 下，而是浏览器对剪贴板能力的安全上下文要求。

## 影响

手机或其他设备通过局域网地址访问 Codex GUI 时，代码块或消息内容的复制能力不可用。本机使用 `localhost` 访问时可能正常，导致问题只在局域网访问场景暴露。如果只修 UI 层复制按钮，不处理页面来源安全上下文，问题可能无法根治。

## 后续处理

先做只读运行时验证：记录失败页面控制台中 `window.isSecureContext` 的值、`navigator.clipboard` 是否存在、复制失败时是否有 `NotAllowedError` / `Clipboard API` / secure context 相关错误，以及 Streamdown 是否仍处于 `isAnimating=true`。若验证成立，再进入局域网 HTTPS 或安全来源策略的设计/计划阶段。
