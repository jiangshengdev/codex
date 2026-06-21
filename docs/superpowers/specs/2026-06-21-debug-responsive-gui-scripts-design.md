# Debug Responsive GUI 脚本设计

## 日期

2026-06-21

## 状态

设计已确认，等待实现计划。本文只描述将要产出的 skill 脚本系统，不修改 `SKILL.md` 的稳定使用说明。

## 背景

`debug-responsive-gui` skill 已经沉淀了手动操作 Codex GUI 的稳定经验：使用可见的 `Google Chrome for Testing`，通过 `playwright-cli` 控制浏览器生命周期，启动时用 Chrome 参数打开 DevTools，窗口几何控制用 AppleScript，响应式模式用 metrics 先检测再必要时发送 `Command+Shift+M`。

当前问题是流程仍依赖人工重新组织命令，容易在“浏览器已存在、GUI 已启动、DevTools 已打开、窗口已排好”这些中间状态下重复或误操作。需要把流程拆成可恢复的脚本，每一步先检测，满足则跳过，不满足才执行。

## 目标

- 在 `.codex/skills/debug-responsive-gui/scripts/` 下实现一组脚本。
- 入口默认执行完整流程。
- 每个步骤都可以单独运行，用于失败后继续。
- 每个步骤先检测当前状态，避免重复启动、重复打开 DevTools、重复切换响应式模式。
- 使用 Node.js `.mjs` 作为主实现，AppleScript 独立文件只负责系统窗口和允许的快捷键。
- 使用 JSON run state 记录本次流程状态。
- Codex 外层负责调用 `launch_gui` 获取 GUI URL，再通过参数传给脚本。

## 非目标

- 不自动选择或验证具体设备型号。
- 不把设计文档写入或引用到 `SKILL.md`。
- 不在设计阶段实现脚本。
- 不使用 Computer Use。
- 不使用坐标点击。
- 不安装任何新依赖、运行时、浏览器二进制或工具。
- 不提交 commit。

## 已定决策

- 主实现语言：Node.js `.mjs`。
- 系统窗口控制：独立 AppleScript 文件。
- 状态文件：`/tmp/codex-debug-responsive-gui/current.json`。
- 脚本结构：入口脚本、共享库、每步一个 `.mjs`、AppleScript 独立文件。
- GUI URL 来源：Codex 外层 `launch_gui` 后传入 `--gui-url`。
- 启动前策略：默认先 discovery，再补齐缺失项。
- 浏览器生命周期：复用合格的现有 `Google Chrome for Testing`；不合格才启动新的临时 profile。
- DevTools 策略：已打开则复用；未打开时通过 `--auto-open-devtools-for-tabs` 新启或重启 CFT。
- 窗口布局：动态检测屏幕，选择非 Codex 所在屏幕排布；必要时 fallback 到已验证坐标。
- 响应式模式：先读 metrics；不是响应式再激活 DevTools 并发送 `Command+Shift+M`。
- 失败恢复：入口跑完整流程，每个 step 也可独立运行。
- 验证边界：只验证流程状态，不验证具体设备型号。

## 文件结构

```text
.codex/skills/debug-responsive-gui/scripts/
  debug-responsive-gui.mjs
  lib/
    applescript.mjs
    exec.mjs
    metrics.mjs
    playwright-cli.mjs
    state.mjs
  steps/
    00-check-tools.mjs
    05-discover-current-state.mjs
    10-start-cft-if-needed.mjs
    20-open-gui-if-needed.mjs
    30-layout-windows-if-needed.mjs
    40-enter-responsive-if-needed.mjs
    50-reload-page.mjs
    60-verify-responsive-metrics.mjs
  applescript/
    close-restore-dialog.applescript
    enter-responsive.applescript
    layout-windows.applescript
    query-windows.applescript
```

`SKILL.md` 不引用本文。脚本真实实现并验证后，再更新 `SKILL.md`，只记录稳定入口、运行方式和关键限制。

## 状态模型

状态文件路径：

```text
/tmp/codex-debug-responsive-gui/current.json
```

建议结构：

```json
{
  "runId": "2026-06-21T00:00:00.000Z",
  "profile": "/tmp/codex-cft-profile...",
  "config": "/tmp/codex-cft-devtools....json",
  "guiUrl": "http://127.0.0.1:59636/?threadId=...#token=...",
  "guiUrlNoFragment": "http://127.0.0.1:59636/?threadId=...",
  "browser": {
    "browserType": "chrome-for-testing",
    "headed": true,
    "userDataDir": "/tmp/codex-cft-profile..."
  },
  "discovery": {
    "hasBrowser": true,
    "isChromeForTesting": true,
    "isHeaded": true,
    "isCodexGui": true,
    "hasDevToolsWindow": true,
    "layoutOk": true,
    "responsiveLike": true
  },
  "lastMetrics": {}
}
```

`current.json` 是运行态缓存，不进入仓库。每个 step 读取并更新它，但不能只相信旧状态；执行前必须做当前状态检测。

## 步骤职责

### `debug-responsive-gui.mjs`

- 解析入口参数。
- 接收 `--gui-url`。
- 默认按顺序运行所有 step。
- 不直接包含业务逻辑，只负责编排和错误透传。

### `00-check-tools.mjs`

- 检查 `node`、`playwright-cli`、`osascript` 可用。
- 不安装缺失工具。
- 缺失时明确失败并输出缺失项。

### `05-discover-current-state.mjs`

- 读取 `playwright-cli list --json`。
- 读取当前页面 URL、title、基础 metrics。
- 通过 AppleScript 查询 `Google Chrome for Testing` 窗口和 DevTools 窗口。
- 写入当前 discovery 摘要。

### `10-start-cft-if-needed.mjs`

- 如果当前浏览器是 `chrome-for-testing` 且 `headed: true`，跳过。
- 否则创建临时 profile。
- 写入 DevTools 偏好：
  - `currentDockState: "\"undocked\""`
  - `disable-locale-info-bar: "true"`
- 创建 `playwright-cli` config，包含 `--auto-open-devtools-for-tabs`。
- 启动 `playwright-cli open --browser=chromium --headed --profile=... --config ... about:blank`。

### `20-open-gui-if-needed.mjs`

- 要求入口已传入 `--gui-url`，或 state 中已有本次 GUI URL。
- 如果当前页面已经是该 GUI URL 且 title 是 `codex-gui`，跳过。
- 否则执行 `playwright-cli goto <gui-url>`。
- 验证 GUI URL 去掉 fragment 后 HTTP 可访问，页面 title 是 `codex-gui`。

### `30-layout-windows-if-needed.mjs`

- 使用 AppleScript 查询 CFT 和 DevTools 窗口。
- 动态检测屏幕，优先选择非 Codex 所在屏幕。
- 如果浏览器和 DevTools 已经在目标屏幕左右排布，跳过。
- 否则用 AppleScript 设置窗口位置和大小。
- 如果动态检测失败，允许 fallback 到已验证的左屏坐标。

### `40-enter-responsive-if-needed.mjs`

- 读取页面 metrics。
- 如果 metrics 已经表现为响应式或移动渲染状态，跳过。
- 否则激活 DevTools 窗口，发送已允许的 `Command+Shift+M`。
- 发送后再次读取 metrics，记录诊断结果。

### `50-reload-page.mjs`

- 执行 `playwright-cli reload`。
- 不做设备型号判断。

### `60-verify-responsive-metrics.mjs`

- 读取并打印页面 metrics。
- 验证页面仍为 `codex-gui`，且浏览器连接正常。
- metrics 用于诊断流程状态，不断言 iPhone SE、XR 或其他具体设备。

## AppleScript 边界

AppleScript 只用于：

- 激活 `Google Chrome for Testing`。
- 查询窗口名称、位置、大小、全屏状态。
- 设置窗口位置和大小。
- 关闭 Chrome 崩溃恢复弹窗中可通过 AX 描述识别的关闭按钮。
- 在 DevTools 窗口上发送 `Command+Shift+M`。

AppleScript 禁止用于：

- 坐标点击。
- 操作系统 `Google Chrome`。
- 盲按 DevTools toggle 快捷键。
- 自动选择 DevTools 设备下拉框。

## 失败恢复

每个 step 都遵守同一契约：

- 读取 state。
- 检测当前真实状态。
- 满足目标时输出 `skip` 并退出 0。
- 不满足时执行本步骤。
- 执行后再次验证。
- 成功时更新 state。
- 失败时输出诊断信息并非 0 退出。

入口失败后，用户或代理可以直接运行失败 step。单步脚本不依赖入口进程内状态，只依赖 `current.json` 和实时检测。

## 验证边界

实现后至少验证：

- `node --check` 或等效语法检查覆盖所有 `.mjs`。
- AppleScript 文件能被 `osascript` 解析或实际运行到查询路径。
- `00-check-tools.mjs` 在当前环境输出可用工具状态。
- 带 `--gui-url` 的入口能复用已有合格 CFT。
- 在无合格 CFT 时，启动的是 headed `chrome-for-testing`。
- DevTools 缺失时，启动参数能打开 DevTools。
- 响应式步骤不会在 metrics 已经响应式时再次发送 `Command+Shift+M`。

不验证：

- 具体设备型号。
- DevTools 设备下拉框当前选项。
- 截图视觉状态，除非后续用户明确要求。

## 后续计划入口

下一步进入实现计划时，应把本文拆成可执行任务：

- 创建脚本目录和库文件。
- 实现 state、exec、playwright-cli、metrics、AppleScript 调用封装。
- 实现每个 step。
- 实现入口编排。
- 做语法检查和代表性 dry-run。
- 脚本验证通过后再更新 `SKILL.md`。
