# Codex GUI Markdown 链接被浏览器解析为当前来源 URL

日期: 2026-07-03
状态: 🔴 仍需处理
范围: Codex GUI / committed transcript Markdown / Streamdown links
优先级: 未定

## 摘要

Codex GUI committed transcript 中的本地绝对路径链接会被浏览器解析成当前 GUI HTTP origin 下的 URL，仍需处理。

## 问题

在 Codex GUI 的 committed transcript Markdown 渲染中，本地绝对路径被识别为链接后，浏览器会按当前页面来源解析它。这会让本地路径显示成可点击链接，但点击目标不是本地文件，而是当前 GUI HTTP origin 下的路径。

## 证据

- 原始目标应为：`/Users/jiangsheng/cnb/codex/codex-rs/app-server/tests/suite/v2/thread_projection.rs`。
- 当前被浏览器解析为：`http://192.168.3.221:51393/Users/jiangsheng/cnb/codex/codex-rs/app-server/tests/suite/v2/thread_projection.rs:355`。
- 当前 committed transcript 的 Markdown 渲染入口是 `codex-gui/src/features/committedTranscriptSurface/MarkdownText.tsx:13`，仍直接渲染 `Streamdown`。
- `codex-gui/src/features/committedTranscriptSurface/MarkdownText.tsx:17` 仍设置 `linkSafety={{ enabled: false }}`；该配置只关闭链接安全提示，不禁用 Markdown 链接生成。
- `codex-gui/src/features/committedTranscriptSurface/markdownRendering.tsx:12` 的 `allowMarkdownElement` 只排除 `img`，没有排除 `a`。
- `codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx:151` 至 `:155` 仍断言 Markdown 链接会渲染为 anchor，并保留链接文本。
- Streamdown 默认会把 Markdown 链接渲染为 `<a href="...">`。
- 当前 DOM 中 anchor 的 `href` 属性可以保留为 `/Users/.../thread_projection.rs:355`，但浏览器读取或跳转时会把它解析成当前 origin 下的完整 HTTP URL。
- 当前宿主命令只支持启动和中断 turn；尚未提供打开本地文件或在编辑器中 reveal 文件的能力。

## 判断

仍需处理。当前代码仍允许 committed transcript 中的 Markdown 链接生成可点击 anchor，而浏览器会把以 `/` 开头的 `href` 当作当前站点的绝对路径处理。在没有宿主打开文件能力的前提下，让这类本地路径内容保持可点击会产生误导。

## 影响

本地文件路径可能被误显示为可点击 HTTP URL。用户点击后不会打开本地文件，只会跳到 GUI 服务 origin 下的错误路径。任何 Markdown link 都仍然具备导航行为，风险不只限于本地路径。

## 后续处理

进入单独设计/计划阶段确认 committed transcript 链接策略；后续验证入口至少需要覆盖链接文本仍显示、committed transcript 中是否生成可点击 anchor，以及本地绝对路径不会被误导性导航到 GUI HTTP origin。

## 历史记录

- 候选处理：在 `MarkdownText.tsx` 的 Streamdown 配置层禁用 `a` 元素。
- 候选处理：使用 `unwrapDisallowed` 保留链接节点的子文本，使 `[label](url)` 显示为 `label`，但不生成 `<a>`。
- 候选处理：同步更新 committed transcript browser test，断言 Markdown 链接文本仍显示，同时 `.committed-transcript-entry-markdown a` 不存在。
- 暂不处理：不新增宿主打开本地文件能力。
- 暂不处理：不引入 `file://` 跳转。
- 暂不处理：不设计 IDE reveal/open file 协议。
- 暂不处理：不恢复或扩展链接点击行为。
