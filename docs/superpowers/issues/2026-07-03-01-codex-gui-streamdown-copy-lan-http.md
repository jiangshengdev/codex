# 局域网 HTTP 访问时 Streamdown 复制按钮不可用

## 状态

- 已记录已知问题；初步判断与浏览器 Clipboard API 的 secure context 限制有关，尚未做运行时验证。

## 现象

用户反馈：当前 Streamdown 剪贴板复制无法使用。当前访问方式是局域网地址，例如通过 `http://192.168.x.x:<port>` 访问 Codex GUI。

## 已确认事实

- Streamdown 的交互控件包含复制能力，复制按钮通常依赖浏览器 `navigator.clipboard`。
- 现代浏览器的 Clipboard API 要求页面处于 secure context。
- `http://localhost` 和 `http://127.0.0.1` 通常会被浏览器视为本地安全上下文。
- `http://192.168.x.x:<port>` 这类局域网 IP HTTP 来源通常不是 secure context。
- 如果 `window.isSecureContext` 为 `false`，或 `navigator.clipboard` 不存在，复制按钮可能失败或不可用。
- Streamdown 在流式输出仍处于 `isAnimating=true` 时也可能禁用复制控件；该原因需要和 secure context 问题分开验证。

## 初步判断

最可能的根因是：通过局域网 IP 的 HTTP 地址访问 Codex GUI 时，浏览器没有把页面视为 secure context，导致 Streamdown 复制按钮无法使用 Clipboard API。

该问题不是 Streamdown 必须运行在公网 HTTPS 下，而是浏览器对剪贴板能力的安全上下文要求。局域网访问如果要稳定支持复制，通常需要 HTTPS，或者使用浏览器调试参数临时把该 HTTP 来源标记为安全来源。

## 影响

- 手机或其他设备通过局域网地址访问 Codex GUI 时，代码块或消息内容的复制能力不可用。
- 本机使用 `localhost` 访问时可能正常，导致问题只在局域网访问场景暴露。
- 如果只修 UI 层复制按钮，不处理页面来源安全上下文，问题可能无法根治。

## 需要补充的信息

- 失败页面控制台中 `window.isSecureContext` 的值。
- 失败页面控制台中 `navigator.clipboard` 是否存在。
- 复制失败时浏览器 console 是否有 `NotAllowedError`、`Clipboard API` 或 secure context 相关错误。
- 复制失败时 Streamdown 是否仍处于流式输出状态，也就是复制控件是否因 `isAnimating=true` 被禁用。
- 受影响的浏览器和设备：桌面 Chrome、iOS Safari、iOS Chrome、Android Chrome 或其他 WebView。

## 后续建议

- 先用 Chrome 临时安全来源白名单验证问题是否确实由 insecure context 导致。
- 如果验证成立，长期方案优先评估局域网 HTTPS：
  - 本地 CA / 自签证书方案：适合局域网 IP 或本地域名，但访问设备需要信任证书。
  - 真实域名 + 公有可信证书方案：适合希望避免每台设备安装证书的场景，域名可解析到局域网地址。
- 不建议只在前端复制逻辑里做静默降级；如果页面不是 secure context，很多浏览器能力都会继续受限。
