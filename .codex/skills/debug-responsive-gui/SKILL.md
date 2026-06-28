---
name: debug-responsive-gui
description: Use when debugging the Codex GUI with playwright-cli in a visible Google Chrome for Testing browser, including DevTools, responsive layout checks, screenshots, or reproducible browser-control step records.
---

# Debug Responsive GUI

## 基本规则

- 回复用户使用简体中文。
- 浏览器生命周期优先使用 `playwright-cli`。
- 调试浏览器必须是 `Google Chrome for Testing`，不是系统 `Google Chrome`。
- 浏览器必须可见；启动时必须带 `--headed`。
- 禁止使用 Computer Use。
- 禁止坐标点击。
- 禁止自动选择或验证具体设备型号。
- AppleScript 只用于激活 `Google Chrome for Testing`、查询窗口、移动窗口、关闭可识别的恢复弹窗，以及在 DevTools 窗口发送已允许的 `Command+Shift+M`。
- 不确定视觉状态时必须查询状态或截图，不要盲猜。

## 自动化脚本入口

脚本路径：

```bash
.codex/skills/debug-responsive-gui/scripts/debug-responsive-gui.mjs
```

稳定用法：

```bash
node .codex/skills/debug-responsive-gui/scripts/debug-responsive-gui.mjs --gui-url '<launch_gui 返回的 LAN URL；没有 LAN 或 LAN 不可用时使用 Local URL>'
```

运行方式：

- 先由 Codex 外层调用 `launch_gui` 获取当前 GUI URL。
- 如果 `launch_gui` 返回 LAN URL，默认优先把 LAN URL 传给 `--gui-url`；只有没有 LAN URL、LAN URL 明确不可用，或用户明确要求本机地址时，才使用 Local URL。
- URL 中的 `threadId` 和 `token` 必须完整保留；不要手写、猜测或从旧 URL 拼接。
- 入口脚本默认按顺序执行 discovery、CFT 启动/复用、GUI 导航、窗口排布、响应式模式、reload 和 metrics 验证。
- 每个步骤都会先检测当前真实状态；满足目标时输出 `skip` 并退出 0，不满足时才执行本步骤。
- 状态文件是 `/tmp/codex-debug-responsive-gui/current.json`。
- GUI URL 必须使用本次 `launch_gui` 返回的完整 URL，默认 LAN 优先，Local 只作回退或按用户明确要求使用。

## 重启/恢复 GUI

当用户说“重启 GUI”“重启后端”“GUI 不可用”或页面显示 `Codex GUI dev server unavailable` 时，先调用外层 `launch_gui` 重新获取当前 GUI URL，再优先选择返回的 LAN URL；没有 LAN URL、LAN URL 明确不可用，或用户明确要求本机地址时，才使用 Local URL。

不要把“重启 GUI”默认理解成重启 `codex-gui` 的 Vite 前端，也不要先 kill `codex app-server`、查进程或重启 Codex App。`launch_gui` 是恢复 GUI 后端/代理入口。

如果重新调用 `launch_gui` 并打开 URL 后仍显示 `Codex GUI dev server unavailable`，再确认或启动 Vite dev server，然后刷新同一个 `launch_gui` URL。

如果 `launch_gui` URL 返回 HTTP 502，通常表示代理背后的 `codex-gui` Vite dev server 未运行或不可达。先检查默认 Vite dev server 端口或 `CODEX_GUI_VITE_PORT` 指定端口是否已有监听：如果用户已经提前启动并保持 Vite 运行，不要再启动；如果没有监听，在仓库的 `codex-gui` 目录里启动前台会话：

```bash
pnpm run dev
```

保持该 Vite 会话运行，再刷新同一个 `launch_gui` URL。不要把 `debug-responsive-gui` 自动化脚本当作 Vite 生命周期管理器；它只负责打开/验证 GUI。不要默认用 `nohup` 或后台 shell 保活 Vite，除非用户明确要求切换为后台守护方式并接受额外验证。

## 单步恢复

失败后可以直接运行失败的单步脚本继续：

```bash
node .codex/skills/debug-responsive-gui/scripts/steps/00-check-tools.mjs
node .codex/skills/debug-responsive-gui/scripts/steps/05-discover-current-state.mjs
node .codex/skills/debug-responsive-gui/scripts/steps/10-start-cft-if-needed.mjs
node .codex/skills/debug-responsive-gui/scripts/steps/20-open-gui-if-needed.mjs --gui-url '<launch_gui 返回的 LAN URL；没有 LAN 或 LAN 不可用时使用 Local URL>'
node .codex/skills/debug-responsive-gui/scripts/steps/30-layout-windows-if-needed.mjs
node .codex/skills/debug-responsive-gui/scripts/steps/40-enter-responsive-if-needed.mjs
node .codex/skills/debug-responsive-gui/scripts/steps/50-reload-page.mjs
node .codex/skills/debug-responsive-gui/scripts/steps/60-verify-responsive-metrics.mjs
```

如果某一步失败，先读取 stderr 和 `/tmp/codex-debug-responsive-gui/current.json`。不要因为一个步骤失败而改用 Computer Use、坐标点击或系统 `Google Chrome`。

## 验证边界

脚本验证的是流程状态：

- `playwright-cli` 连接正常。
- 浏览器是 headed `chrome-for-testing`。
- 页面是 `codex-gui`。
- DevTools 和浏览器窗口可通过 AX 查询并排布。
- 响应式步骤只在 metrics 不是 responsive-like 时发送 `Command+Shift+M`。
- reload 后 metrics 仍能证明页面是 `codex-gui`。

脚本不验证：

- 具体设备型号。
- DevTools 设备下拉框当前选项。
- iPhone SE、iPhone XR 或其他设备 profile。

## 常用验证命令

```bash
find .codex/skills/debug-responsive-gui/scripts -name '*.mjs' -print0 | xargs -0 -n1 node --check
node .codex/skills/debug-responsive-gui/scripts/steps/00-check-tools.mjs
osascript .codex/skills/debug-responsive-gui/scripts/applescript/query-windows.applescript
node .codex/skills/debug-responsive-gui/scripts/steps/60-verify-responsive-metrics.mjs
```
