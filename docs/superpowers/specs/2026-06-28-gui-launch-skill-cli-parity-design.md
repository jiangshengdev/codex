# GUI 启动 Skill 与 CLI `/gui` 对齐设计

## 日期

2026-06-28

## 状态

待确认

## 背景

当前 `.codex/skills/debug-responsive-gui` 面向调试场景：它会使用 `playwright-cli`、可见的 Google Chrome for Testing、窗口排布、响应式模式、reload 和 metrics 验证。这不是普通 GUI 启动语义。

普通 `GUI 启动` 应该和 CLI `/gui` 保持一致：只启动 GUI URL 生成流程，并把返回的 URL 信息打印给用户。它不是 debug，也不是浏览器自动化入口。

CLI `/gui` 的真实输出由 `codex-rs/tui/src/app/gui.rs` 中的 `gui_launch_success_lines()` 决定：

```text
• GUI URLs:
  Local: <url>
  LAN:   <url>
  VPN:   <url>
```

该函数会按 `launch_gui` 返回的 `entries` 顺序打印所有条目，并根据最长 label 对齐冒号后的 URL。

## 目标

- 新增普通 GUI 启动 skill，用于用户输入 `GUI 启动`、`启动 GUI`、`/gui` 或要求普通 GUI 地址时触发。
- 普通 GUI 启动只调用 Codex 外层 `launch_gui`，并按 CLI `/gui` 的输出格式打印返回的全部 URL。
- 普通 GUI 启动不得自行选择 LAN、Local 或 VPN，不得添加优先级、fallback、可用性判断或地址筛选。
- 普通 GUI 启动不得启动浏览器、不得运行 `debug-responsive-gui`、不得执行 Playwright、不得进入响应式模式、不得截图。
- `debug-responsive-gui` 继续只用于明确的 debug、响应式、截图、浏览器验证或可复现浏览器控制场景。

## 非目标

- 不修改 CLI `/gui` 的 Rust 实现。
- 不修改 `launch_gui` 的返回结构、URL 顺序或 token 生成逻辑。
- 不改变 Vite 生命周期管理策略。
- 不把普通 GUI 启动扩展为自动打开浏览器或自动验证页面。
- 不在普通启动中实现 LAN 优先、Local 回退或 VPN 偏好。

## 行为细节

普通 GUI 启动 skill 的行为必须是低自由度流程：

1. 调用 Codex 外层 `launch_gui`。
2. 读取返回的 URL 条目列表。
3. 按 CLI `/gui` 的文本格式打印所有返回条目：

   ```text
   • GUI URLs:
     <label>:<padding><url>
   ```

4. label 与 URL 必须来自 `launch_gui` 返回值，不得手写、猜测、拼接或复用旧 URL。
5. 如果 `launch_gui` 只返回 Local，就只打印 Local；如果返回 Local、LAN、VPN，就全部按返回顺序打印。
6. 如果 `launch_gui` 失败，按 CLI 语义打印失败信息，不进入 debug 恢复流程。

## Skill 边界

建议新增 `.codex/skills/gui-launch/SKILL.md`：

- frontmatter `description` 应包含 `GUI 启动`、`启动 GUI`、`/gui`、普通 GUI 地址输出等触发词。
- 正文必须强调“输出与 CLI `/gui` 保持一致”。
- 正文必须禁止普通启动做 URL 选择或调试自动化。

建议收窄 `.codex/skills/debug-responsive-gui/SKILL.md`：

- description 和正文应避免承接普通 `GUI 启动`。
- 明确普通 `GUI 启动` 应使用 `gui-launch` skill。
- 只在用户明确需要 debug、响应式、截图、浏览器打开或验证时使用 debug skill。

## 验证思路

- 运行 `quick_validate.py` 验证新增普通 GUI 启动 skill。
- 运行 `quick_validate.py` 验证调整后的 debug skill。
- 搜索两个 skill，确认普通启动文档包含 CLI `/gui` 格式，且不包含 LAN 优先、Local 回退、VPN 偏好等选择策略。
- 搜索 debug skill，确认普通 `GUI 启动` 不再被描述为 debug 流程入口。
