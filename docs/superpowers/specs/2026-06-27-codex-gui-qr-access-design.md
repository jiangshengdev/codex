# Codex GUI 二维码访问设计

## 背景

Codex GUI 当前通过带 `threadId` 查询参数和 `#token=` fragment 的启动 URL 连接 app-server。桌面端启动后，`guiHostClient` 会把 fragment token 保存到本地 storage，并清理地址栏里的 `#token=`。这个行为适合桌面端刷新，但不能直接把清理后的 `window.location.href` 用作手机扫码地址，因为手机是另一台设备，无法读取桌面端 storage。

本功能要在网页内显示二维码，方便用户用手机访问当前 GUI 会话。当前阶段不做 LAN 地址发现，不新增后端 API，不改变 app-server 启动协议。

## 目标

- 在底部 composer 操作区提供一个二维码入口，位置在 `Stop` 按钮左侧。
- 二维码入口与 `Stop` 按钮保持同一行、左右对齐，视觉高度一致。
- 点击入口后显示二维码面板，用户可以用手机扫码访问当前 GUI URL。
- 使用 `qrcode.react` 渲染二维码，优先使用 `QRCodeSVG`。
- 使用 HeroUI React v3 组件组合入口、提示和面板，不手写弹层基础设施。
- 二维码内容包含 `threadId` 和 `#token=`，确保新设备可以完成 GUI 鉴权。

## 非目标

- 不自动推导 LAN IP 或 LAN URL。
- 不新增 app-server API 来暴露 Local/LAN URL 列表。
- 不把二维码常驻显示在页面上。
- 不生成、下载或保存二维码图片。
- 不改变现有 token 清理行为。
- 不改变 `launch_gui` 的 URL 生成逻辑。

## 用户体验

Composer 操作区从单纯右对齐按钮改为左右分布：

- 左侧放二维码图标按钮。
- 右侧保留 `Stop` 和 `Send` 按钮。

二维码按钮使用 `lucide-react` 的二维码图标，按钮文本对视觉用户隐藏或仅通过 `aria-label` 暴露。按钮悬停或键盘聚焦时，HeroUI `Tooltip` 显示简短提示，例如 `Scan with phone`。

点击按钮后，HeroUI `Popover` 在 composer 附近打开。面板包含：

- 标题，例如 `Scan with phone`。
- `QRCodeSVG` 渲染出的二维码。
- 二维码对应 URL 的短说明或可选文本展示，便于用户检查当前是否是 `127.0.0.1`、`localhost` 或 LAN host。

如果当前 GUI 是通过 `127.0.0.1` 或 `localhost` 打开的，二维码仍按当前 origin 生成。这是所选方案的预期限制：手机扫描后通常无法访问桌面本机的 loopback 地址。界面只如实显示当前 URL，不在本阶段做地址替换。

## URL 构造

二维码不能直接使用清理后的 `window.location.href`。应在 GUI 连接初始化阶段保留启动参数，并由当前 origin 重建可扫码 URL：

```text
${window.location.origin}/?threadId=<threadId>#token=<token>
```

设计约束：

- `threadId` 来自启动 URL 的查询参数。
- `token` 来自启动 URL fragment 或现有 `readLaunchParams()` 已恢复出的 launch token。
- fragment token 必须重新放回二维码 URL，因为手机端无法共享桌面端 storage。
- URL 中不包含其他当前页面状态。

可将这段逻辑做成小的纯函数，例如 `buildQrAccessUrl({ origin, threadId, token })`，便于测试。该函数只负责字符串构造，不负责 LAN 推导。

## 组件边界

建议新增一个小组件承载二维码入口，例如 `QrAccessPopover`，由 `ComposerTurnControl` 使用。职责划分：

- `ComposerTurnControl` 负责操作区布局，并把可用的启动参数传给二维码组件。
- `QrAccessPopover` 负责 HeroUI `Button`、`Tooltip`、`Popover` 和 `QRCodeSVG` 的组合。
- 纯函数负责二维码 URL 构造，避免在渲染组件里散落 token 拼接规则。

这样二维码功能不会扩大 `guiHostClient` 的职责，也不会把弹层状态混进发送/停止消息的流程。

## HeroUI 使用方式

依据本地 HeroUI React v3 文档：

- 按钮使用 `Button`，交互回调用 `onPress`。
- 悬停/聚焦提示使用 `Tooltip`、`Tooltip.Trigger` 和 `Tooltip.Content`。
- 二维码面板使用 `Popover`、`Popover.Trigger`、`Popover.Content`、`Popover.Arrow`、`Popover.Dialog` 和 `Popover.Heading`。
- 样式优先使用 HeroUI 语义 variant 和 Tailwind 类，避免新增自定义弹层 CSS。

如果 Popover 在极窄视口上表现不好，后续可以单独评估 Modal 兜底；本设计阶段不引入 Modal 分支。

## 状态与错误处理

二维码按钮需要有明确可用条件：

- 有 `threadId` 和 `token` 时启用。
- 缺失任一项时禁用，或在面板内显示不可用状态。

由于当前连接初始化已经会校验缺失 `threadId` 或 token 并显示 GUI host 错误，正常运行状态下二维码入口应始终有完整参数。禁用态主要用于测试和防御式渲染。

二维码面板不发起网络请求，也不验证手机是否可访问当前 URL。扫码能否成功由当前 origin 是否可被手机访问决定。

## 安全说明

二维码 URL 包含当前 GUI 会话 token。该 token 能让扫码设备连接当前线程，因此 UI 文案应避免把它描述成公开分享链接。设计上只在用户主动点击二维码按钮后展示二维码，不常驻暴露在页面上。

本功能不扩大 token 权限，不改变 token 生命周期，也不新增 token 存储位置。二维码仅把当前启动所需 token 重新编码到 fragment 中。

## 测试策略

需要覆盖以下行为：

- 启动 URL fragment 被清理后，二维码 URL 仍包含 `#token=`。
- 二维码 URL 使用当前 `window.location.origin` 和当前 `threadId`。
- Composer 操作区渲染二维码按钮，并且它位于 `Stop` 按钮左侧的同一操作行。
- 点击二维码按钮后显示 Popover 和二维码内容。
- 缺失启动参数时，二维码入口不会生成无效二维码。

实现阶段应优先更新或新增现有 `App.browser.test.tsx` / composer 相关 browser test。若新增纯函数，应添加小范围单元测试覆盖 URL 构造。

## 验证

实现完成后，按 `codex-gui` 规则运行：

```bash
pnpm run lint
pnpm run type-check
```

如果改动影响浏览器行为，还应运行对应的 focused browser/Vitest 测试。是否运行完整 `pnpm run ci` 由实现阶段的变更范围再决定。
