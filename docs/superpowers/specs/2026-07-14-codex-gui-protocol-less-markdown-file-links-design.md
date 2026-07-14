# Codex GUI 无协议 Markdown 文件链接显示设计

## 背景

`codex-gui` 使用 Streamdown 渲染 assistant Markdown。committed 与 live 的入口分别为：

- `codex-gui/src/features/committedTranscriptSurface/MarkdownText.tsx`
- `codex-gui/src/features/committedTranscriptSurface/LiveMarkdownText.tsx`

二者共享
`codex-gui/src/features/committedTranscriptSurface/markdownRendering.tsx`
中的插件、安全过滤、组件覆盖和样式配置。

Streamdown 默认把 Markdown link 转换为 `<a>`。当目标是本地文件地址时，例如：

```md
[thread_projection.rs](/Users/jiangsheng/cnb/codex/codex-rs/app-server/tests/suite/v2/thread_projection.rs:355)
```

浏览器会把 `/Users/...` 解释为当前 GUI HTTP origin 下的路径。页面只显示链接文字，用户既看不到完整文件地址，点击后也不会打开本地文件，而是导航到错误的 Web URL。对应问题记录位于
`docs/superpowers/issues/2026-07-03-02-codex-gui-markdown-links-render-as-browser-urls.md`。

本设计只定义最终用户效果，不预设通过 React component、remark plugin 或 rehype plugin 达成。经过对 Streamdown 2.5.0 和其 Markdown 转换链路的检查，选择在 `remark-rehype` 的 link handler 边界实现，以复用默认处理并避免重写或反向恢复数据。

## 目标

- 保持 Streamdown 对浏览器可处理的带 URI scheme 链接的默认行为。
- 所有无 URI scheme 的 Markdown link 不生成可点击 anchor。
- 无 scheme link 显示为 `[链接文字](目标)`，同时显示默认链接文字和文件地址。
- 链接文字内部的 emphasis、inline code 等 Markdown 语义继续按默认方式渲染。
- 目标显示 Markdown parser 已解析出的值，不显示浏览器解析后的绝对 URL，也不显示 URI-normalize 后的百分号编码值。
- committed 与 live 共用同一分类和转换逻辑，同时保留 Streamdown 默认的不同解析生命周期。
- 保留现有 `sanitize`、`harden`、raw HTML 禁用、图片禁用和 link safety 配置边界。

## 非目标

- 不新增宿主打开文件、编辑器 reveal 或 IDE deep link 能力。
- 不生成或导航到 `file://` URL。
- 不把本地文件地址转换成 GUI HTTP origin 下的 URL。
- 不保留 Web 相对导航语义；无 scheme 的 fragment、query、protocol-relative 和相对路径同样按文件地址显示。
- 不保证逐字符还原 Markdown 源码中的尖括号、转义或空白写法。
- 不显示无 scheme link 的可选 title。
- 不为 live reference link 增加跨 block definition cache、回溯更新或整段重解析。
- 不修改 user message 的纯文本行为。
- 不修改 transcript state、projection、app-server 或 Rust 代码。

## 已确认的用户效果

### 带 URI scheme

带 scheme 的链接完全交还 Streamdown 默认链路。例如：

```md
[OpenAI](https://openai.com)
[Email](mailto:user@example.com)
[Editor](vscode://file/path)
[Custom](x:resource)
```

本功能不改变这些节点。它们是否最终生成 anchor，继续由 Streamdown 的 `sanitize`、`harden` 和现有配置决定。危险 scheme 不因本功能获得放行。

### 无 URI scheme

无 scheme 的链接显示为不可点击的 Markdown 形式。例如：

```md
[thread_projection.rs](/Users/a/thread_projection.rs:355)
[config.toml](../config.toml)
[README](README.md)
[Section](#details)
```

页面分别显示：

```text
[thread_projection.rs](/Users/a/thread_projection.rs:355)
[config.toml](../config.toml)
[README](README.md)
[Section](#details)
```

这些内容不包含 `<a>`，因此不存在浏览器导航行为。

### Windows 文件地址

明确的 Windows 绝对路径和 UNC 路径按文件地址处理。显示值使用 Markdown parser 已解析出的目标，而不是 HAST `href` 的编码结果：

| Markdown 输入 | 显示结果 |
| --- | --- |
| `[file](C:/work/file.rs:10)` | `[file](C:/work/file.rs:10)` |
| `[file](C:\work\file.rs:10)` | `[file](C:\work\file.rs:10)` |
| `[file](<C:\work folder\file.rs:10>)` | `[file](C:\work folder\file.rs:10)` |

因此不会把反斜杠显示为 `%5C`，也不会把空格显示为 `%20`。

UNC destination 中的反斜杠仍按 Markdown 语法解析。最终显示 `node.url` 中的 parser 结果，不承诺逐字符保留源码中用于转义的连续反斜杠；但分类结果仍为不可点击的文件地址。

### 链接文字格式

链接文字继续使用默认转换结果。例如：

```md
[查看 **thread_projection.rs**](/Users/a/thread_projection.rs)
```

最终不生成 anchor，但 `thread_projection.rs` 仍保持粗体；方括号、圆括号和目标由普通 HAST text 节点提供。

### Reference link

committed 模式拥有完整 Markdown 时，reference link 使用默认 definition resolution，再按 definition 的目标分类：

```md
[file.rs][source]

[source]: /Users/a/file.rs:355 "source file"
```

最终显示：

```text
[file.rs](/Users/a/file.rs:355)
```

可选 title 不显示。

live 模式保留 Streamdown 默认分块行为。如果引用和 definition 不在同一个解析 block，未解析的引用继续显示：

```text
[file.rs][source]
```

不为稍后到达的 definition 回溯更新旧 block。消息提交后，committed 使用完整 Markdown 重新解析并得到最终结果。

## 链接分类

分类使用 Markdown parser 已解析出的目标值，顺序固定如下：

1. 使用 `pathe.isAbsolute` 识别明确的 POSIX、Windows 绝对路径和 UNC 路径。这些目标按文件地址处理。
2. 对其余目标使用 `uri-js.parse(target).scheme` 判断是否存在 URI scheme。
3. 存在 scheme 时保持 Streamdown 默认 link；不存在 scheme 时按文件地址处理。

该顺序避免把 `C:\work\file.rs` 和 `C:/work/file.rs` 误判成 `c:` scheme，同时不需要手写 scheme 或 Windows drive 正则。

有歧义的 drive-relative 写法不作猜测：

- `C:\work\file.rs`、`C:/work/file.rs`：明确的 Windows 绝对路径，按文件地址处理。
- `C:file.rs`：不是绝对路径，按 RFC URI scheme 结果处理。
- `x:resource`：按单字母 URI scheme 处理。

其余无 scheme 目标统一按文件地址处理，包括 POSIX 绝对路径、显式相对路径、裸相对路径、fragment、query 和 protocol-relative 目标。

## 架构

### 共享 Streamdown 配置

在 `markdownRendering.tsx` 中定义共享 `remarkRehypeOptions`，并由 `MarkdownText` 与 `LiveMarkdownText` 同时传给 Streamdown。

该配置只覆盖：

- `handlers.link`
- `handlers.linkReference`

其他 mdast 节点继续使用 `mdast-util-to-hast` 默认 handler。

### 包装默认 handler

自定义 handler 不自行重建 link/reference 转换。它首先调用 `mdast-util-to-hast` 导出的 `defaultHandlers.link` 或 `defaultHandlers.linkReference`，复用默认行为：

- link label 子节点转换；
- reference definition lookup；
- HAST position 传递；
- 默认 anchor 属性和规范化 `href` 生成；
- unresolved reference 的默认回退表现。

随后只做目标分类和输出选择。

### Direct link

对于 `link`：

1. 调用 `defaultHandlers.link(state, node)` 获得默认 HAST anchor。
2. 使用 `node.url` 分类。
3. 有 scheme 时原样返回默认 anchor。
4. 无 scheme 时返回普通 HAST 内容：
   - text `[`；
   - 默认 anchor 的 children；
   - text `](`；
   - text `node.url`；
   - text `)`。

### Reference link

对于 `linkReference`：

1. 调用 `defaultHandlers.linkReference(state, node)`。
2. 如果当前 handler state 中不存在匹配 definition，原样返回默认 unresolved-reference 结果。
3. 如果 definition 存在，使用 `definition.url` 分类。
4. 有 scheme 时返回默认 anchor。
5. 无 scheme 时使用默认 anchor children 和 `definition.url` 生成与 direct link 相同的普通 HAST 内容。

reference lookup 继续由 `mdast-util-to-hast` 的 `state.definitionById` 提供，不自行遍历或收集 definition。

## 数据流

### 带 scheme 链接

```text
Markdown source
  -> Streamdown remark parse
  -> wrapped default link handler
  -> target has scheme: return default anchor
  -> existing sanitize / harden
  -> Streamdown default anchor component or existing blocked result
```

### 无 scheme 文件地址

```text
Markdown source
  -> Streamdown remark parse
  -> wrapped default link handler
  -> target has no scheme: emit ordinary HAST content
  -> existing sanitize / harden
  -> [default label children](parsed target) without anchor
```

### Live reference

```text
reference block without visible definition
  -> default linkReference handler returns unresolved source representation
  -> wrapper preserves it

committed full Markdown with definition
  -> default handler resolves definition
  -> wrapper converts a no-scheme result to [label](definition.url)
```

## 依赖边界

实现只复用现有依赖树中已经存在的公开能力，但凡生产源码直接 import 的包都必须在 `codex-gui/package.json` 中声明为直接依赖：

- `mdast-util-to-hast`：`defaultHandlers`、handler/state 类型和默认转换行为；
- `pathe`：跨平台绝对文件路径识别；
- `uri-js`：RFC URI scheme 解析。

不引入或直接使用：

- `unist-util-visit`；
- `mdast-util-to-markdown`；
- `mdast-util-from-markdown`；
- 自定义 AST 类型；
- 手写递归或 scheme 正则。

这些包当前已存在于 pnpm lock/store 的传递依赖中，但传递安装状态不是源码可依赖的 API 契约。计划和实现阶段需要把实际 import 的包声明为 direct dependency；这不等同于重新实现依赖已经提供的能力。

## 安全与异常边界

- 无 scheme 目标被写入 HAST text 节点，不成为 URL 属性，不具备导航或脚本执行能力。
- link label children 仍经过后续 sanitize；raw HTML 和图片的现有处理不变。
- 有 scheme 节点不绕过 `sanitize` 或 `harden`。
- `javascript:`、`data:`、`file:`、`vbscript:` 等危险 scheme 继续服从 Streamdown 当前安全结果。
- 自定义 scheme 是否可用继续由 Streamdown 当前配置决定，本功能不增加 allowlist。
- `uri-js` 解析异常或没有 scheme 时按无 scheme 处理；分类函数不抛出到 React render。
- 空目标属于无 scheme，显示为 `[链接文字]()`。
- bare 文件路径如果没有 Markdown link 语法，本来就是普通文本，不进入 handler。
- 无 scheme link 的 title 不显示，因为最终效果只要求链接文字和目标。
- handler 不能取得合法 default anchor children 时，应保留默认 handler 结果，不生成不完整的自定义结构。

## 性能边界

- 不遍历整棵 mdast 或 HAST；工作量只发生在被默认转换访问到的 link/linkReference 节点。
- 不读取或切片完整 Markdown source。
- 不增加 React state、Redux state、effect、事件监听或跨消息缓存。
- 不改变 Streamdown 的 live block splitter、remend 或 memoization。
- committed 与 live 继续保持现有 static/streaming 模式差异。

## 行为矩阵

| Markdown 目标 | 分类 | 可见结果 | Anchor |
| --- | --- | --- | --- |
| `https://example.com/docs` | 带 scheme | 默认链接标签 | 保持默认 |
| `mailto:user@example.com` | 带 scheme | 默认链接标签 | 保持默认 |
| `x:resource` | 单字母 scheme | 保持 Streamdown 默认安全结果 | 保持默认 |
| `C:file.rs` | 有歧义，按 scheme | 保持 Streamdown 默认安全结果 | 保持默认 |
| `javascript:alert(1)` | 危险 scheme | 保持 Streamdown 默认阻止结果 | 不放行 |
| `/Users/name/file.rs:10` | 无 scheme 文件地址 | `[标签](/Users/name/file.rs:10)` | 不生成 |
| `src/file.rs` | 无 scheme 文件地址 | `[标签](src/file.rs)` | 不生成 |
| `../src/file.rs` | 无 scheme 文件地址 | `[标签](../src/file.rs)` | 不生成 |
| `C:/work/file.rs:10` | Windows 绝对路径 | `[标签](C:/work/file.rs:10)` | 不生成 |
| `C:\work\file.rs:10` | Windows 绝对路径 | `[标签](C:\work\file.rs:10)` | 不生成 |
| `#section` | 无 scheme | `[标签](#section)` | 不生成 |
| 空目标 | 无 scheme | `[标签]()` | 不生成 |

## 测试策略

在现有 Browser Mode 测试中覆盖用户可观察行为，不锁定 Streamdown 内部 class 或实现细节。

### Committed

- `http:`、`https:`、`mailto:` 继续使用默认 anchor 行为。
- `x:resource` 和 `C:file.rs` 不被本功能转换为 `[标签](目标)`，最终结果服从现有安全过滤。
- 危险 scheme 不因新 handler 获得放行。
- POSIX 绝对路径、裸相对路径、显式相对路径、fragment、query、protocol-relative 和空目标显示 `[标签](目标)`，且不存在对应 anchor。
- `C:/...`、`C:\...`、带空格的 Windows 路径显示 parser 目标值，不出现 `%5C` 或 `%20`。
- UNC 路径按文件地址处理，并断言显示 Markdown parser 得到的目标值，不断言逐字符保留源码中的转义反斜杠。
- link label 中的 emphasis 和 inline code 保持默认样式。
- 无 scheme link 的 title 不显示。
- reference definition 可见时，committed 显示 `[标签](definition.url)` 且不生成 anchor。
- raw HTML、图片、copy controls 和现有 Markdown 安全测试继续通过。

### Live

- 完整 direct 无 scheme link 在形成 link 节点后显示 `[标签](目标)`，且不生成 anchor。
- unresolved reference 保持 Streamdown 默认原文表现。
- 后置 definition 位于其他 live block 时，不要求旧 reference block 回溯更新。
- 同一内容进入 committed 后按完整 Markdown definition resolution 得到最终结果。
- 带 scheme link 保持 Streamdown 默认 live 行为。

### 验证范围

计划阶段应包含：

- 聚焦 Browser Mode 测试；
- TypeScript type-check；
- GUI format 与 lint；
- direct dependency 与 lockfile importer 检查。

本设计不授权执行实现、依赖变更或验证命令；具体命令和提交边界在实施计划中确定。

## 风险与约束

- 无 scheme 目标统一失去 Web 相对导航能力，这是已确认产品语义。
- `C:file.rs` 按 scheme 处理，可能不符合极少数 Windows drive-relative 使用场景；这是为避免误判单字母自定义 scheme 作出的明确取舍。
- Markdown parser 会消解部分源码转义或尖括号包装；本设计显示 parser 目标值，不承诺源码逐字符一致。
- live reference 可能长期保持 `[label][id]`，直到 committed 重新解析；这是 Streamdown 默认分块边界，不是本功能新增的不一致。
- `mdast-util-to-hast` handler API 或 Streamdown `remarkRehypeOptions` 升级时，类型检查应暴露接口漂移。

## 后续阶段门禁

本文件只定义设计。设计文档经用户确认后，下一轮才能编写实施计划；计划被明确确认前，不得修改 `codex-gui` 源码、测试、依赖或 issue 状态。
