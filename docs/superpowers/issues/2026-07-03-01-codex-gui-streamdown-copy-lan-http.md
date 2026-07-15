# 局域网 HTTP 访问时 Streamdown 复制按钮不可用

日期: 2026-07-03
状态: ✅ 已修复，能力不可用时隐藏复制控件
范围: Codex GUI / Streamdown / Clipboard API / LAN HTTP
优先级: 未定

## 摘要

Codex GUI 现在会在 Markdown 渲染模块初始化时检查 secure context 和 Clipboard API 写入能力；能力不可用时不再显示代码块、表格和 Mermaid 的复制控件。

## 问题

通过 `http://192.168.x.x:<port>` 等局域网 HTTP 地址访问 Codex GUI 时，浏览器通常不会把页面视为 secure context，`navigator.clipboard.writeText` 可能不可用。此前 Streamdown 仍显示复制控件，用户点击后无法完成复制。

流式 Markdown 在 `isAnimating=true` 时禁用复制控件属于 Streamdown 的独立既有行为，不是本 issue 的修复对象。

## 证据

- `codex-gui/src/features/committedTranscriptSurface/markdownRendering.tsx:66` 至 `:77` 在模块初始化时检查 `window.isSecureContext` 和 `navigator.clipboard.writeText`；能力不可用时只关闭 `code.copy`、`table.copy` 和 `mermaid.copy`。
- `codex-gui/src/features/committedTranscriptSurface/MarkdownText.tsx:19` 将共享 `streamdownControls` 接入 committed Markdown。
- `codex-gui/src/features/committedTranscriptSurface/LiveMarkdownText.tsx:20` 将同一配置接入 live Markdown；`:21` 的 `isAnimating` 保持不变。
- `codex-gui/src/features/committedTranscriptSurface/__tests__/MarkdownCopyControlsAvailable.browser.test.tsx` 覆盖 secure context 且 `writeText` 可用时的 committed/live 控件行为。
- `codex-gui/src/features/committedTranscriptSurface/__tests__/MarkdownCopyControlsUnavailable.browser.test.tsx` 覆盖非 secure context，并验证模块初始化后不会因全局值变化而重新计算。
- `codex-gui/src/features/committedTranscriptSurface/__tests__/MarkdownCopyControlsMissingClipboardWrite.browser.test.tsx` 覆盖 Clipboard 对象存在但缺少 `writeText` 的情况。
- 本地实现提交为 `fc0c16a7effc3520d6da182ea8f8327143b7a1f5`（`fix(gui): hide unavailable markdown copy controls`）。

## 判断

需求行为已修复。页面不具备 Clipboard 写入能力时，Streamdown 的复制控件不会显示；下载、表格全屏和 Mermaid 缩放等非复制控件保持默认行为。

该修复没有改变浏览器对局域网 HTTP 来源的 secure context 限制，也没有增加复制 fallback、Permissions API 查询或动态权限监听。它解决的是“无可用能力时仍显示不可用按钮”的界面问题，而不是让 LAN HTTP 获得剪贴板权限。

## 修复记录

- 设计: `docs/superpowers/specs/2026-07-14-codex-gui-streamdown-copy-control-visibility-design.md`
- 实施计划: `docs/superpowers/plans/2026-07-14-codex-gui-streamdown-copy-control-visibility.md`
- 实现提交: `fc0c16a7effc3520d6da182ea8f8327143b7a1f5`
- 实现方式: 模块初始化时生成共享 `ControlsConfig`，由 committed 和 live Markdown 两个入口共同使用。

## 验证记录

- TDD 红灯验证: 修复前 Chromium Browser Mode 为 `17 passed / 2 failed`，失败点均为能力不可用时复制按钮仍被渲染。
- 最终 Browser Mode 回归: Chromium、Firefox、WebKit 合计 `57/57` 个测试通过。
- 静态验证: `type-check`、`format:oxfmt`、oxlint 和 eslint 全部通过。
- 本地合并后重复运行上述三浏览器回归与静态验证，结果仍全部通过。

## 影响

手机或其他设备通过局域网 HTTP 地址访问 Codex GUI 时，不再看到当前环境无法使用的复制按钮。本机通过安全来源访问且 Clipboard 写入能力可用时，现有复制行为保持不变。

## 后续处理

本 issue 无剩余代码处理项。若目标变为“让局域网设备也能实际复制”，应另建 issue，并单独进入局域网 HTTPS、安全来源或受控 fallback 的设计与计划阶段。

## 历史记录

- 2026-07-03: 初始状态为 `📏 待验证`；静态证据指向局域网 HTTP 非 secure context，但尚未验证运行时行为。
- 2026-07-14: 设计确认采用“能力不可用时隐藏复制控件”，不增加权限监听或复制 fallback。
