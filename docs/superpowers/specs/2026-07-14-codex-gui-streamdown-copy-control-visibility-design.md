# Codex GUI Streamdown 复制控件可见性设计

## 背景

`codex-gui` 的 committed Markdown 和 live Markdown 都直接使用 Streamdown：

- `codex-gui/src/features/committedTranscriptSurface/MarkdownText.tsx`
- `codex-gui/src/features/committedTranscriptSurface/LiveMarkdownText.tsx`

当前两个入口都没有传入 `controls`。Streamdown 因此会渲染默认复制控件；用户通过
`http://192.168.x.x:<port>` 等局域网 HTTP 地址访问时，页面通常不是 secure
context，浏览器可能不暴露 Clipboard API，按钮仍然显示，但点击后无法复制。

现有问题记录位于
`docs/superpowers/issues/2026-07-03-01-codex-gui-streamdown-copy-lan-http.md`。
该记录仍将 LAN HTTP secure context 限制标记为待运行时验证。本设计不把尚未完成的
运行时验证改写为已确认根因，只处理能够在渲染前确定的剪贴板能力缺失。

## 目标

- 页面不具备可预判的剪贴板写入能力时，不显示 Streamdown 的复制控件。
- 同时覆盖代码块、表格和 Mermaid 的复制控件。
- committed Markdown 和 live Markdown 使用相同的能力判断与控件配置。
- 剪贴板能力可用时保持 Streamdown 当前默认行为。
- 保留下载、全屏、缩放等非复制控件。

## 非目标

- 不为 LAN HTTP 增加 HTTPS、证书或其他安全来源方案。
- 不实现 `document.execCommand("copy")` 等剪贴板降级路径。
- 不使用 Permissions API 查询 `clipboard-write` 权限。
- 不在首次复制抛出 `NotAllowedError` 后动态隐藏按钮。
- 不覆盖或重写 Streamdown 内建的代码块、表格或 Mermaid 控件。
- 不通过 CSS 选择器依赖 Streamdown 内部 DOM 或类名隐藏按钮。
- 不修改 transcript state、projection、app-server 或 Rust 代码。

## 能力判定

本设计把“可预判的剪贴板写入能力”定义为同时满足：

- 代码运行在浏览器环境中；
- `window.isSecureContext === true`；
- `navigator.clipboard` 存在；
- `navigator.clipboard.writeText` 是函数。

任一条件不满足时，统一隐藏代码块、表格和 Mermaid 的复制控件。

该判定只回答“当前页面是否具备调用 Clipboard API 的基本条件”，不承诺一次实际写入
一定成功。即使 API 存在，浏览器策略、用户手势要求或后续权限拒绝仍可能让复制调用
失败；这类点击后失败保持 Streamdown 当前错误处理，不在本设计中增加状态或反馈。

## 组件边界

共享能力判断和 Streamdown `controls` 配置放在
`codex-gui/src/features/committedTranscriptSurface/markdownRendering.tsx`。该文件已经集中维护
两个 Markdown 渲染入口共用的插件、rehype 配置、元素过滤、组件覆盖和样式类，因此复制
控件策略属于同一配置边界。

模块初始化时读取一次当前浏览器能力，并生成带 `ControlsConfig` 类型约束的共享常量。
`MarkdownText` 和 `LiveMarkdownText` 只负责导入该常量并传给 Streamdown：

1. `markdownRendering.tsx` 首次加载时读取 secure context 和 Clipboard API 能力。
2. 能力结果在当前页面生命周期内固定，不在后续组件渲染时重复检查。
3. 能力可用时不关闭任何复制控件，保持 Streamdown 默认配置。
4. 能力不可用时生成局部 `controls` 配置，将 `code.copy`、`table.copy` 和
   `mermaid.copy` 设为 `false`。
5. 其他控件字段不覆盖，继续使用 Streamdown 默认值。

从 HTTP 切换到 HTTPS、更换主机或更换来源会重新加载页面，对应模块也会重新初始化并重新
判定。A 方案不查询或监听 Permissions API，因此没有需要在页面生命周期内动态刷新的权限
状态。

不新增统一 Streamdown 包装组件。当前只有两个调用点，共享配置常量已经足以消除判断
重复；新增包装层会把插件、渲染模式和 live 动画语义一起重构，超出本问题所需范围。

## 行为矩阵

| 页面环境 | 代码块复制 | 表格复制 | Mermaid 复制 | 其他控件 |
| --- | --- | --- | --- | --- |
| secure context 且 Clipboard API 可写 | 保持显示 | 保持显示 | 保持显示 | 不变 |
| 非 secure context | 不显示 | 不显示 | 不显示 | 不变 |
| `navigator.clipboard` 不存在 | 不显示 | 不显示 | 不显示 | 不变 |
| `navigator.clipboard.writeText` 不存在 | 不显示 | 不显示 | 不显示 | 不变 |

`LiveMarkdownText` 的 `isAnimating` 语义保持不变：能力可用时，复制按钮仍由 Streamdown
在动画期间禁用；能力不可用时，复制按钮直接不渲染。动画状态不参与剪贴板能力判断。

## 性能边界

能力判断只在 `markdownRendering.tsx` 模块初始化时执行一次。后续 Markdown 组件渲染只读取
共享的 `controls` 常量，不新增 effect、事件监听、React state、Redux 状态或 transcript
扫描。该变化不会改变 committed chunk、live item 或 selector 的更新边界。

## 测试策略

在现有
`codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx`
中扩展 Streamdown 行为覆盖，继续通过用户可观察的 DOM 行为验证：

- secure context 且 `navigator.clipboard.writeText` 可用时，committed 代码块复制按钮存在；
- 非 secure context 时，committed 和 live 代码块复制按钮都不存在；
- Clipboard API 缺失时，复制按钮不存在；
- 能力不可用时，代码块下载等非复制控件仍保留；
- 能力可用且 live Markdown 正在动画时，复制按钮仍存在但保持 Streamdown 当前禁用状态。

测试使用 Streamdown 已提供的 `data-streamdown` 属性定位控件，不锁定内部 Tailwind 类名。
现有 GFM 渲染能力可以直接增加表格 fixture，并验证表格复制控件不存在。当前 GUI 未启用
Mermaid 插件，因此不为复制按钮可见性测试引入 Mermaid 插件或异步图表环境；Mermaid 的
`copy: false` 由公开 `controls` 类型检查覆盖。

为了验证“一次初始化”而不是“每次渲染检查”，相关测试应在设置浏览器能力后隔离加载
Markdown 渲染模块，再渲染多个 Markdown 条目；同一模块实例内改变测试替身不应改变已生成
的共享配置。测试之间重新加载模块，以分别覆盖能力可用和不可用两条初始化分支。

计划阶段应列出使用当前 fnm 管理的 Node 和 pnpm 执行的聚焦 Browser Mode 测试、类型检查
与格式检查。具体命令在实施计划中确定，本设计不授权执行实现或验证命令。

## 风险与约束

- Clipboard API 存在不等于写入一定成功；本设计有意不处理运行时权限拒绝。
- `window.isSecureContext` 和 Clipboard API 能力在当前页面生命周期内按初始化结果处理，因此
  不引入响应式权限监听。若未来需要动态响应权限状态，应作为独立需求设计。
- Streamdown 的 `controls` 是公开 API；如果未来升级改变该类型，TypeScript 类型检查应在编译
  阶段暴露配置漂移。

## 后续阶段门禁

本文件只定义设计。设计被用户确认后，下一轮才能编写实施计划；计划被用户确认前，不得修改
`codex-gui` 源码、测试或 issue 状态。
