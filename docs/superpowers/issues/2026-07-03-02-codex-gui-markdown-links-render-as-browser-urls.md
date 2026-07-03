# Codex GUI Markdown 链接被浏览器解析为当前来源 URL

## 状态

- 已记录已知问题；后续修复方向待确认。

## 现象

在 Codex GUI 的 committed transcript Markdown 渲染中，本地绝对路径被识别为链接后，浏览器会按当前页面来源解析它。

示例：

- 原始目标应为：`/Users/jiangsheng/cnb/codex/codex-rs/app-server/tests/suite/v2/thread_projection.rs`
- 当前被浏览器解析为：`http://192.168.3.221:51393/Users/jiangsheng/cnb/codex/codex-rs/app-server/tests/suite/v2/thread_projection.rs:355`

这会让本地路径显示成可点击链接，但点击目标不是本地文件，而是当前 GUI HTTP origin 下的路径。

## 已确认事实

- 当前 committed transcript 的 Markdown 渲染入口是 `codex-gui/src/features/committedTranscriptSurface/MarkdownText.tsx`。
- Streamdown 默认会把 Markdown 链接渲染为 `<a href="...">`。
- `linkSafety={{ enabled: false }}` 只关闭链接确认弹窗，不会禁用链接生成。
- 当前 DOM 中 anchor 的 `href` 属性可以保留为 `/Users/.../thread_projection.rs:355`，但浏览器读取或跳转时会把它解析成当前 origin 下的完整 HTTP URL。
- 当前宿主命令只支持启动和中断 turn；尚未提供打开本地文件或在编辑器中 reveal 文件的能力。

## 初步判断

根因是 Markdown 链接仍然生成了可点击 anchor，而浏览器会把以 `/` 开头的 `href` 当作当前站点的绝对路径处理。

在没有宿主打开文件能力的前提下，让这类内容保持可点击会产生误导。当前最小修复方向是先移除 Markdown 链接交互，只保留链接文本显示。

## 影响

- 本地文件路径可能被误显示为可点击 HTTP URL。
- 用户点击后不会打开本地文件，只会跳到 GUI 服务 origin 下的错误路径。
- 任何 Markdown link 都仍然具备导航行为，风险不只限于本地路径。

## 候选处理

- 在 `MarkdownText.tsx` 的 Streamdown 配置层禁用 `a` 元素。
- 使用 `unwrapDisallowed` 保留链接节点的子文本，使 `[label](url)` 显示为 `label`，但不生成 `<a>`。
- 同步更新 committed transcript browser test：断言 Markdown 链接文本仍显示，同时 `.committed-transcript-entry-markdown a` 不存在。

## 暂不处理

- 不新增宿主打开本地文件能力。
- 不引入 `file://` 跳转。
- 不设计 IDE reveal/open file 协议。
- 不恢复或扩展链接点击行为。
