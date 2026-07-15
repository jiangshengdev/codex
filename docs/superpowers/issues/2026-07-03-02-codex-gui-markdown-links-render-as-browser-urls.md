# Codex GUI Markdown 链接被浏览器解析为当前来源 URL

日期: 2026-07-03
状态: ✅ 已修复
范围: Codex GUI / live 与 committed transcript Markdown / Streamdown links
优先级: 未定

## 摘要

Codex GUI 已将无 URI scheme 的 Markdown 链接显示为不可点击的 `[链接文字](目标)`，不再让本地路径被浏览器解析成当前 GUI HTTP origin 下的 URL。

## 问题

修复前，Codex GUI 的 committed transcript Markdown 会把本地绝对路径生成为 anchor，浏览器随后按当前页面来源解析目标。这会让本地路径显示成可点击链接，但点击目标不是本地文件，而是当前 GUI HTTP origin 下的路径。live 与 committed 渲染也缺少统一的无协议链接处理边界。

## 证据

- 原始复现目标为 `/Users/jiangsheng/cnb/codex/codex-rs/app-server/tests/suite/v2/thread_projection.rs:355`，修复前会被浏览器解析为 `http://192.168.3.221:51393/Users/jiangsheng/cnb/codex/codex-rs/app-server/tests/suite/v2/thread_projection.rs:355`。
- `codex-gui/src/features/committedTranscriptSurface/markdownRendering.tsx:16` 至 `:17` 先用 `pathe.isAbsolute` 识别绝对路径，再用 `uri-js` 判断 URI scheme。
- `codex-gui/src/features/committedTranscriptSurface/markdownRendering.tsx:30` 至 `:55` 包装 `mdast-util-to-hast` 的默认 `link` 与 `linkReference` handler，只把无 scheme 目标改成普通 HAST 文本；默认 handler 仍负责 label children、reference resolution 和 anchor 构造。
- `codex-gui/src/features/committedTranscriptSurface/markdownRendering.tsx:57` 至 `:62` 集中导出共享 `remarkRehypeOptions`，没有新增 AST 全树遍历、正则或 URI 反向解码。
- `codex-gui/src/features/committedTranscriptSurface/MarkdownText.tsx:25` 与 `LiveMarkdownText.tsx:27` 让 committed 和 live Streamdown 使用同一组 handlers。
- `codex-gui/src/features/committedTranscriptSurface/markdownRendering.tsx:79` 至 `:84` 保留原有 `sanitize`、`harden` 和图片过滤安全边界；带 scheme 链接仍走 Streamdown 默认链路。
- `codex-gui/src/features/committedTranscriptSurface/__tests__/MarkdownFileLinks.browser.test.tsx:6` 至 `:143` 覆盖 POSIX、相对路径、fragment、query、protocol-relative、空目标、Windows 路径、UNC、reference、live/committed 一致性及危险 scheme 边界。

## 判断

已修复。无 URI scheme 的 direct link 和已解析 reference link 不再生成 anchor，而是保留完整的 `[链接文字](目标)` 可见文本；浏览器因此不会再把本地路径导航到 GUI HTTP origin。`http:`、`https:`、`mailto:` 以及其他带 scheme 目标仍由 Streamdown 的默认 handler 和安全链路处理。

## 修复记录

- `c3cac989f Add markdown and URI utility dependencies for codex-gui`：将 `mdast-util-to-hast@13.2.1`、`pathe@2.0.3`、`uri-js@4.4.1` 声明为 production direct dependencies，复用 lockfile 中已有版本。
- `8324fb833 fix(gui): render protocol-less markdown links as text`：增加共享默认 handler 包装，接入 live/committed Streamdown，并添加专用 Browser Mode 测试。

## 验证记录

- Browser Mode RED：新增测试在旧行为下 Chromium 4/4 失败，失败集中在无 scheme 链接仍生成 anchor 及 Windows 目标被 URI 编码。
- Browser Mode GREEN：专用测试在 Chromium、Firefox、WebKit 共 12/12 通过。
- 最终 Browser 回归：三浏览器全部 8 个 Browser Mode 测试文件，共 213/213 通过，Type Errors 为 0。
- `pnpm run type-check`、`pnpm run format:oxfmt`、`pnpm run lint` 均通过。
- 最终规格、代码质量和整体代码审查均无 findings。

## 影响

本 issue 记录的误导性导航已消除：无 scheme 文件路径不再可点击，同时完整目标仍对用户可见。正常 Web、邮件和其他带 scheme 链接的默认行为不受影响。

## 后续处理

本 issue 无需继续处理。宿主打开本地文件、IDE reveal、`file://` 跳转或恢复文件链接点击能力仍不在本次修复范围；如需这些能力，应单独进入设计与计划阶段。

## 历史记录

- 已放弃候选：在 `MarkdownText.tsx` 的 Streamdown 配置层禁用所有 `a` 元素。
- 已放弃候选：使用 `unwrapDisallowed` 只保留链接 label；最终实现保留完整 `[label](target)` 文本。
- 已完成：增加 live/committed 专用 Browser Mode 覆盖，验证无 scheme 链接不生成 anchor。
- 暂不处理：不新增宿主打开本地文件能力。
- 暂不处理：不引入 `file://` 跳转。
- 暂不处理：不设计 IDE reveal/open file 协议。
- 暂不处理：不恢复或扩展链接点击行为。
