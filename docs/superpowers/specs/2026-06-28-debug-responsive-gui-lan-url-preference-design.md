# debug-responsive-gui 优先使用局域网 URL 设计

## 背景

`launch_gui` 会返回至少一种 GUI 代理 URL。当前 `debug-responsive-gui` skill 文档要求使用 `launch_gui` 返回的 Local URL，并在示例中持续强调 Local HTTP(S) URL。

现在需要调整为：当 `launch_gui` 同时返回 Local 和 LAN URL 时，GUI 启动和调试流程默认优先使用 LAN URL。这样在需要手机、局域网设备或跨设备验证时，输出和操作路径都优先指向可从局域网访问的入口。

## 目标行为

- 调用 `launch_gui` 后，优先选择返回列表中的 LAN URL 作为 `--gui-url`。
- 只有在 `launch_gui` 没有返回 LAN URL，或 LAN URL 明确不可用时，才退回 Local URL。
- 文档中的稳定用法、运行方式、重启/恢复、单步恢复示例都使用“优先 LAN，退回 Local”的表述。
- 如果用户明确要求只使用本机地址、只打印 Local 地址，或当前任务需要本机专用验证，则按用户要求使用 Local URL。
- URL 中的 `threadId` 和 `token` 必须保持完整，不手写、不猜测、不从旧 URL 拼接。

## 非目标

- 不修改 `debug-responsive-gui` 自动化脚本参数接口；脚本仍只接收一个 `--gui-url`。
- 不让 `debug-responsive-gui` 脚本负责启动或管理 Vite 生命周期。
- 不改变 Chrome for Testing、DevTools、响应式模式、窗口排布或 metrics 验证逻辑。
- 不把 LAN 页面加载成功等同于 HMR 一定成功；如果出现 HMR 相关错误，仍需要按 Vite 监听地址和 HMR 目标分别诊断。

## 恢复语义

- 如果所选 `launch_gui` URL 返回 HTTP 502，仍按现有语义处理：这通常表示 `codex-gui` Vite dev server 未运行或不可达。
- 先检查默认 Vite 端口或 `CODEX_GUI_VITE_PORT` 指定端口是否已有监听。
- 如果没有监听，在 `codex-gui` 目录启动前台 `pnpm run dev` 会话，并保持运行。
- Vite 启动后刷新同一个 `launch_gui` URL；不要因为 502 直接归因到 Chrome、Playwright 或 `launch_gui` 本身。

## 预期修改范围

- 只修改 `.codex/skills/debug-responsive-gui/SKILL.md` 的说明文字。
- 不修改脚本、测试、项目源码或计划文件，除非后续计划被用户确认后发现必要。

## 验证思路

- 运行 skill 基本校验，确认 `SKILL.md` 结构仍有效。
- 搜索文档，确认不再把 Local URL 描述为唯一或必须的默认选择。
- 保留 Local fallback 的说明，避免无 LAN URL 环境无法使用该 skill。
