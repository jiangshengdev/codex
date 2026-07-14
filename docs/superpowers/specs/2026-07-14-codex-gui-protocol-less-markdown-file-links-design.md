# Codex GUI 无协议 Markdown 文件链接显示设计

## 背景

`codex-gui` 的 assistant Markdown 由 Streamdown 渲染。committed 与 live 两个入口分别是：

- `codex-gui/src/features/committedTranscriptSurface/MarkdownText.tsx`
- `codex-gui/src/features/committedTranscriptSurface/LiveMarkdownText.tsx`

二者共享
`codex-gui/src/features/committedTranscriptSurface/markdownRendering.tsx`
中的插件、安全过滤、组件覆盖和样式配置。

当前 Markdown 链接会生成 `<a>`。当目标是不带 URI scheme 的本地文件地址时，例如：

```md
[thread_projection.rs](/Users/jiangsheng/cnb/codex/codex-rs/app-server/tests/suite/v2/thread_projection.rs:355)
```

DOM 中的 `href` 属性可以保留原始路径，但浏览器会按当前 GUI HTTP origin 解析并导航到错误的
Web URL。对应问题记录位于
`docs/superpowers/issues/2026-07-03-02-codex-gui-markdown-links-render-as-browser-urls.md`。

Codex GUI transcript 不存在需要保留的站内 Web 相对链接语义。因此，本设计不把无 scheme 目标
继续交给浏览器解析，而是将其显示为不可点击的标准 Markdown 形式。

## 目标

- 带 URI scheme 的 Markdown 链接继续使用 Streamdown 原生链接行为。
- 不带 URI scheme 的 Markdown 链接不生成 anchor。
- 无 scheme 链接显示为标准 Markdown 形式：`[标签](目标)`。
- 同时覆盖 committed assistant Markdown 和 live assistant Markdown。
- 保留现有 `sanitize`、`harden`、raw HTML 禁用和图片禁用边界。
- 不依赖 Markdown 原始源码位置，不承诺逐字符还原输入。

## 非目标

- 不新增宿主打开本地文件、编辑器 reveal 或 IDE deep link 能力。
- 不生成或导航到 `file://` URL。
- 不把本地文件地址转换成 GUI HTTP origin 下的 URL。
- 不恢复原始 Markdown 中的空格、转义、reference link 写法或可选 title。
- 不改变 user message 按纯文本显示的现有行为。
- 不修改 transcript state、projection、app-server 或 Rust 代码。
- 不调整 Streamdown link safety 交互。

## 链接分类

分类只使用 Markdown parser 已经解析出的 link 目标。

### Windows drive 路径

以单个英文字母和冒号开头的目标优先视为 Windows drive 文件地址，例如：

```text
C:\work\codex\file.rs
C:/work/codex/file.rs
C:relative\file.rs
```

该规则先于 URI scheme 判断，避免把盘符误判成单字母协议。代价是单字母自定义 URI scheme
不会作为协议链接处理；Codex transcript 当前没有这类链接需求。

### URI scheme

除 Windows drive 路径外，目标符合以下语义时视为带 scheme：

```text
字母 + 零个或多个字母、数字、加号、连字符或点 + 冒号
```

例如：

```text
https://example.com/docs
mailto:user@example.com
vscode://file/path
```

带 scheme 的 link 节点保持不变，继续进入 Streamdown 的默认链接渲染和现有安全管线。

当前 Streamdown harden 配置允许所有可解析的协议，但仍强制阻止
`javascript:`、`data:`、`file:` 和 `vbscript:` 等危险协议。本设计保持该行为，不新增协议白名单。

### 无 scheme 目标

其余目标全部按文件地址处理，包括：

- POSIX 绝对路径，如 `/Users/.../file.rs`；
- 显式相对路径，如 `./file.rs`、`../src/file.rs`；
- 无前缀相对路径，如 `src/file.rs`；
- protocol-relative、fragment、query 等没有 scheme 的目标。

Codex GUI transcript 不为这些形式保留 Web 相对导航语义。

## Markdown AST 转换

共享 Markdown 配置新增一个 remark 插件。插件在 Markdown AST 阶段遍历 `link` 节点：

1. 读取 parser 已解析出的目标地址。
2. 按“Windows drive 路径优先、随后判断 URI scheme”的规则分类。
3. 带 scheme 的 link 节点不做修改。
4. 无 scheme 的 link 节点替换为普通 AST 内容：
   - 文本节点 `[`；
   - 原 link 的标签子节点；
   - 文本节点 `](`；
   - 包含已解析目标地址的文本节点；
   - 文本节点 `)`。

转换发生在 Markdown 已经完成语法解析之后，因此插入的括号和目标地址只作为普通文本继续渲染，
不会再次被解析成链接。

原标签子节点保持原有 inline 语义。例如标签内已有 emphasis 或 inline code 时，这些内容仍按
Streamdown 的正常标签内容渲染，只是在可见内容外增加 `[`、`](`、目标和 `)`。

该转换不读取原始 source slice。下列输入可以统一显示为标准形式，但不保证保持原始写法：

```md
[file][source]

[source]: src/file.rs "optional title"
```

可显示为：

```text
[file](src/file.rs)
```

可选 title 不显示。

## 组件与配置边界

remark 插件及共享插件列表放在
`codex-gui/src/features/committedTranscriptSurface/markdownRendering.tsx`。该文件已经负责两个
Markdown 入口共用的 Streamdown 配置，链接分类属于同一语义边界。

`MarkdownText` 和 `LiveMarkdownText` 都向 Streamdown 传入同一个共享 remark plugin 列表。
两个入口现有差异保持不变：

- committed 使用 `mode="static"`；
- live 保持 streaming mode、`isAnimating` 和 caret 行为。

不覆盖 `components.a`。协议链接继续使用 Streamdown 原生 anchor 组件，从而保留现有样式、
`rel="noreferrer"`、`target="_blank"`、安全过滤和依赖内部行为。

不引入 HeroUI 组件。这里处理的是 Markdown AST 与语义输出，不是新的交互控件。

## 数据流

### 带 scheme 链接

```text
Markdown source
  -> Streamdown Markdown parser
  -> remark 插件保持 link 节点
  -> sanitize / harden
  -> Streamdown 原生 anchor
```

### 无 scheme 文件地址

```text
Markdown source
  -> Streamdown Markdown parser
  -> remark 插件将 link 替换为普通 AST 内容
  -> sanitize / harden
  -> 普通文本和原标签内容，不生成 anchor
```

live 与 committed 共用同一转换，因此完整链接在 live 阶段完成解析后即采用最终显示语义，提交时
不会从可点击链接切换成不可点击文本。

## 行为矩阵

| Markdown 目标 | 分类 | 可见结果 | Anchor |
| --- | --- | --- | --- |
| `https://example.com/docs` | 带 scheme | 原链接标签 | 保留 |
| `mailto:user@example.com` | 带 scheme | 原链接标签 | 保留 |
| `vscode://file/path` | 带 scheme | 原链接标签 | 保留，继续受 harden 约束 |
| `javascript:alert(1)` | 危险 scheme | 保持现有 harden 阻止结果 | 不放行 |
| `/Users/name/file.rs:10` | 无 scheme | `[标签](/Users/name/file.rs:10)` | 不生成 |
| `src/file.rs` | 无 scheme | `[标签](src/file.rs)` | 不生成 |
| `../src/file.rs` | 无 scheme | `[标签](../src/file.rs)` | 不生成 |
| `C:/work/file.rs:10` | Windows drive 路径 | `[标签](C:/work/file.rs:10)` | 不生成 |
| `#section` | 无 scheme | `[标签](#section)` | 不生成 |

## 安全与异常边界

- 无 scheme 链接在 remark 阶段失去 link 语义，浏览器不会获得可导航 `href`。
- 带 scheme 链接不绕过现有 `sanitize` 和 `harden`。
- 危险 scheme 的处理结果保持现状；本设计不复制或替代 harden 的协议安全逻辑。
- raw HTML 继续由现有 `skipHtml` 和 sanitize 配置处理。
- Markdown 图片继续由现有元素过滤阻止。
- 空目标同样属于无 scheme，显示为 `[标签]()`，不生成 anchor。
- bare 文件路径本来就是普通文本，不属于 link 节点，保持不变。
- 未完成的 live Markdown 继续由 Streamdown 的 streaming parser 处理；插件只转换已经形成的
  link 节点，不自行解析或修补未完成链接语法。

## 性能边界

remark 插件只遍历当前交给 Streamdown 解析的 Markdown AST，不读取 transcript state，不扫描
其他 entry，也不改变 committed chunk 或 live item 边界。

该遍历与现有 Markdown parse/render 同属单条 Markdown 内容的有界工作，不新增 React state、
Redux state、effect、事件监听或跨消息缓存。协议链接保持原节点，无 scheme 链接只进行局部节点
替换。

## 测试策略

在现有
`codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx`
中扩展用户可观察行为覆盖。

committed assistant Markdown 至少覆盖：

- `http:`、`https:`、`mailto:` 和一个自定义安全 scheme 继续生成 anchor；
- 危险 scheme 不因新分类逻辑被放行；
- POSIX 绝对路径显示标准 Markdown 形式且不生成 anchor；
- 无前缀和显式相对路径显示标准 Markdown 形式且不生成 anchor；
- Windows drive 路径显示标准 Markdown 形式且不生成 anchor；
- fragment 等其他无 scheme 目标不生成 anchor；
- reference link 被规范化为 `[标签](目标)`；
- 可选 title 不显示；
- raw HTML 和图片的现有安全断言继续通过。

live assistant Markdown 至少覆盖：

- 完整的无 scheme link 在 live 阶段显示标准 Markdown 形式且不生成 anchor；
- 同一内容提交后可见文本和 anchor 语义不发生变化；
- 带 scheme link 在 live 与 committed 阶段都保持正常链接行为。

断言以可见文本、`getAttribute("href")` 和 `.committed-transcript-entry-markdown a` 是否存在为主，
不锁定 Streamdown 内部 Tailwind 类名。

`codex-gui` 当前没有 insta UI snapshot 基础设施；本变化使用现有 Vitest Browser Mode DOM 行为测试
覆盖，不为该局部语义变化引入 Rust/TUI snapshot 或新的前端截图框架。

计划阶段应列出聚焦 Browser Mode 测试、类型检查和格式检查。具体命令在实施计划中确定，本设计
不授权执行实现或验证命令。

## 风险与约束

- 无 scheme 目标统一失去 Web 相对导航能力；这是已确认的产品语义，而不是兼容性遗漏。
- 单字母加冒号的目标优先按 Windows drive 路径处理，因此不支持单字母自定义 URI scheme。
- reference link、转义和 title 会被规范化，不保证与输入源码逐字符一致。
- remark AST 类型或 Streamdown remark plugin 接口未来升级时，TypeScript 类型检查应暴露接口漂移。
- Streamdown 如果改变 streaming parser 形成完整 link 节点的时机，live 中间态可能变化，但最终
  完整链接的分类和 committed 结果不应变化。

## 后续阶段门禁

本文件只定义设计。用户确认该设计文档后，下一轮才能编写实施计划；计划被用户明确确认前，
不得修改 `codex-gui` 源码、测试或 issue 状态。
