# Codex GUI 浏览器标题优化设计

设计状态：已确认

确认日期：2026-08-18

确认原文：确认设计，计划落盘

设计日期：2026-08-18

修订日期：2026-08-18

设计分支：`dev`

设计时 HEAD：`d8d5fe3cf747298d6b9e5820c2ac92441652ce4d`

## 唯一主目标

改进 `codex-gui` 的浏览器标签页标题，使其比固定的 `codex-gui` 更有用、更易识别，并明确
当前任务、历史列表、历史详情及无效路由下的标题语义。

本设计只优化浏览器文档标题，不改变页面内标题、路由、任务数据、投影协议、连接状态、任务
运行状态或历史只读语义。

## 当前实现与问题证据

### 当前标题只有一个静态来源

`codex-gui/index.html:7` 固定声明：

```html
<title>codex-gui</title>
```

React 入口和 TanStack Router 当前没有 `document.title`、route head 或其他运行时标题 owner。
开发模式由 Vite 提供该 HTML；生产 GUI Host 也对当前任务、历史列表和历史详情路由复用构建后的
同一份 `dist/index.html`。因此所有正常路由始终显示 `codex-gui`，多个标签页无法通过标题区分。

GUI Host 握手中的 `clientInfo.title: null` 是 app-server client metadata，不是浏览器文档标题，
不得借修改该协议字段实现本目标。

### GUI 已有可复用的任务标题事实

当前任务顶栏已经读取匹配当前 route thread ID 的 runtime thread，并使用 `name`、`preview` 和
“当前任务”回退构造页面内标题：

- `codex-gui/src/features/appShell/AppShellTopBar.tsx:18-28`
- `codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts:36-47`

历史详情 owner 在读取成功后持有完整 `Thread`，页面使用去除首尾空白后的
`name → preview → 未命名任务` 作为详情标题；加载期间使用“历史详情”：

- `codex-gui/src/features/threadHistory/ThreadHistoryDetailPage.tsx:165-177`
- `codex-gui/src/features/threadHistory/ThreadHistoryDetailPage.tsx:231-234`

历史列表 Card 也使用同一类 `name → preview → 未命名任务` 回退。这些数据已经由生成的 app-server
v2 `Thread` contract 提供，不需要新增协议字段、手写 DTO 或旁路请求。

### `preview` 没有长度上限

app-server v2 只把 `Thread.preview` 定义为 `String`，语义通常是首条用户消息；协议没有声明长度
上限：

- `codex-rs/app-server-protocol/src/protocol/v2/thread_data.rs:187-200`
- `codex-rs/app-server/src/request_processors/thread_processor.rs:5327-5340`

GUI 的历史列表测试已经覆盖数百字符的 URL、中文摘要和无空格 token。浏览器虽然会在可见标签页
中自行省略，但完整文档标题还会进入窗口切换器和浏览器历史。直接复制无上限 `preview` 不是完整
解决方案，标题 owner 必须规范化并限制完整标题长度。

## 已确认的产品语义

### 页面与任务信息范围

当前任务和历史详情在权威任务数据可用时显示具体任务标题；历史列表显示页面类别。具体任务标题
可能出现在浏览器标签、窗口切换器和浏览器历史中，这是已确认选择，不额外隐藏任务名称。

标题不承载连接中、运行中、失败或空闲等状态。任务身份保持稳定，不因 turn 生命周期或短暂连接
变化频繁改写。

### 标题格式

所有标题采用“页面或任务信息在前，应用标识在后”的格式：

```text
<内容> · Codex
```

`Codex` 是固定产品标识，不参与本地化。页面标签和回退标签跟随当前 Lingui locale；切换 locale
后标题随现有界面语言更新。

采用中点和两侧空格作为统一分隔符。分隔符的视觉字面量由本设计固定，避免不同页面各自拼接出
不同格式。

### 路由与数据状态映射

| 当前目标 | 中性或失败状态 | 权威任务数据可用后 |
| --- | --- | --- |
| 当前任务 | `当前任务 · Codex` | `<任务标题> · Codex` |
| 历史列表 | `历史记录 · Codex` | 不变 |
| 历史详情 | `历史详情 · Codex` | `<任务标题> · Codex` |
| 无效路由或无效查询参数 | `找不到页面 · Codex` | 不适用 |

表中的中文只说明 `zh-CN` 目标语义；其他 locale 使用对应的现有 Lingui 消息。

路由一旦切换，标题必须立即改为目标路由的中性标题，不得继续显示上一个任务。异步任务数据加载
成功后再替换为具体标题。加载失败时保留目标路由的中性标题，不在标题中追加“加载失败”，也不
恢复旧标题。

具体任务标题使用以下回退：

- 当前任务：`trim(name) → trim(preview) → 本地化“当前任务”`；
- 历史详情：`trim(name) → trim(preview) → 本地化“未命名任务”`。

只有与当前 route thread ID 完全一致的数据才能覆盖中性标题。旧 route、旧 owner、延迟清理或
错配 runtime 中的任务数据不得污染当前浏览器标题。

### 空白规范化

任务标题进入文档标题前执行统一的展示规范化：

1. 去除首尾空白；
2. 将换行、制表符及连续 Unicode 空白折叠为一个普通空格；
3. 不解析 Markdown，不删除路径、URL、命令、标点或其他用户内容；
4. 规范化后为空时继续使用下一回退来源。

该规范化只生成浏览器标题的展示值，不改写 Redux、history owner 或协议中的原始 `Thread` 数据，
也不改变页面内当前已经显示的完整任务文本。

## 60 字完整上限

完整浏览器标题最多为 60 个用户感知字符，计数范围包含：

- 规范化后的页面或任务内容；
- 必要的末尾省略号 `…`；
- 固定后缀 ` · Codex`。

字符计数按 Unicode grapheme cluster，而不是 UTF-16 code unit 或 UTF-8 byte；不得截断 emoji、
组合音标或其他用户感知字符。实现应使用浏览器平台的 grapheme segmentation 能力，不新增字符
截断依赖。

固定后缀共有 8 个 grapheme。未超限时，内容最多可占 52 个 grapheme；内容超过 52 个时，取
前 51 个 grapheme，追加一个 `…`，再追加固定后缀，使完整标题恰好不超过 60：

```text
<前 51 个内容字符>… · Codex
```

不得从中间或尾部截取，也不得截断、删除或本地化 ` · Codex`。固定页面标签同样经过统一 formatter，
但当前标签长度不会触发截断。

## 所有权与数据流设计

### 单一文档标题 owner

运行时只能有一个组件或模块负责写入 `document.title`。该 owner 位于 Router 内、各具体页面之上，
以便同时覆盖正常 app 路由和 `NotFoundPage`。不得让 `CurrentTaskPage`、
`ThreadHistoryDetailPage`、`AppShellTopBar` 各自通过 effect 直接写 `document.title`；多 writer 会在
导航、StrictMode remount 和异步详情加载时互相覆盖。

静态 `index.html` 标题改为中性的 `Codex`，只承担 React hydration 前和脚本启动失败时的基线。
运行时 owner 挂载后，以当前 route 和 locale 计算唯一标题。

### 页面只发布标题事实，不写浏览器状态

运行时 owner 持有当前 route identity 和可选的 route-scoped title fact：

```text
TanStack route match
  → 当前 route type / thread ID
  → 中性本地化内容

匹配 route 的 Thread fact
  → name / preview / fallback
  → 规范化内容

内容
  → 60 字 formatter
  → 单一 owner 写 document.title
```

当前任务可以直接复用 `threadRuntime` 的生成 `Thread` 类型数据，但必须先验证
`runtime.threadId === routeTarget.threadId`。历史详情数据继续由现有
`ThreadHistoryDetailOwner` 管理；详情页面只向标题 owner 发布带 thread ID 的只读标题事实，
不把详情 thread 搬入 live `threadRuntime`，也不新增第二个详情请求。

发布接口属于前端页面元数据，不复制 app-server contract。它只接受已经派生的展示内容和 route
identity；owner 只消费与当前 route identity 完全匹配的事实。页面卸载、thread ID 改变或详情
owner 替换时清理旧事实。由于 route identity 是最终门禁，即使 StrictMode 的旧 cleanup 延后，旧
事实也不能覆盖新路由的中性标题。

标题 formatter、任务标题回退和空白规范化应有一个权威前端实现。页面顶栏如需继续显示既有
标题，可机械复用同一派生函数，避免浏览器标题与页面标题在 `trim()` 和空值判断上漂移；不得为此
改动页面顶栏的视觉结构。

## 国际化与可访问性

“当前任务”“历史记录”“历史详情”“未命名任务”和“找不到页面”通过 Lingui 消息获取。应用
标识 `Codex`、分隔符和省略号不进入翻译。

浏览器标题不是页面可访问名称的替代品。本设计不删除或改写页面内 `<h1>`、`main`、Alert、
Card accessible name 或 Drawer 导航语义。标题变化不发送额外 live region 公告，不抢占焦点，
也不引入可见 HeroUI 组件。

## 权威 contract 与保持不变

任务数据继续直接使用生成的 app-server v2 `Thread` contract。不得新增或手写包含 `name`、
`preview`、`id` 的浏览器标题 DTO，也不得把生成类型擦除为 `unknown` 后重新验证。

以下行为保持不变：

- app-server 协议、schema、生成 TypeScript 和 GUI Host 握手；
- 当前任务 projection attach、live event、thread replacement 与 reconnect；
- 历史列表和历史详情 owner、请求、分页、重试与只读边界；
- TanStack Router 的 canonical path、参数校验和 Not Found 行为；
- AppShell 顶栏、Drawer、Composer、transcript 和历史 Card 的可见布局与交互；
- thread 原始 `name`、`preview` 及其他持久化数据。

## 非目标

- 不在标题中显示 turn、连接、错误、token usage、队列或 subagent 状态；
- 不增加 favicon badge、未读标记、动画、声音、系统通知或完成提醒；
- 不支持用户自定义标题模板、分隔符、品牌名或最大长度；
- 不从 transcript 重新推导 task name，不调用模型生成标题；
- 不新增协议字段、旁路订阅、额外详情请求、依赖或持久化设置；
- 不以浏览器自动省略为由保留无上限 `preview`；
- 不修改页面内标题的截断、布局或视觉样式。

## 验证设计

### 纯函数验证

标题派生和 formatter 的稳定边界应覆盖：

- `name → preview → fallback` 回退及空白规范化；
- 完整标题少于、等于和超过 60 grapheme 时的结果；
- 超限时保留 ` · Codex`，并把 `…` 计入 60 字上限；
- emoji、组合字符、中文、URL 和无空格连续 token 不被拆分；
- Markdown、路径和标点只作为文本保留，不进行内容解析。

测试应比较完整结果，不逐字段或逐字符拼凑断言。

### Browser Mode 验证

现有 Vitest Browser Mode 足以验证 `document.title`，不需要截图、DOM locator 或端到端服务。使用
`expect.poll(() => document.title)` 等待异步详情或 runtime 数据生效，覆盖：

- 当前任务先显示中性标题，再在匹配 runtime attach 后显示任务标题；
- 错配 thread runtime 不能覆盖当前 route 标题；
- `/task/:id → /history → /history/:id` 及浏览器 back/forward 后标题与当前 route 同步；
- 历史详情加载期间显示中性标题，成功后显示任务标题，失败时不泄漏上一标题；
- Not Found 使用本地化页面标题；
- locale 变化后固定标签更新，`Codex` 后缀保持不变。

浏览器标题不属于可见页面截图，也不适合 `insta` 或 CSS 快照。验证应断言完整
`document.title` 和路由结果，不锁定 effect 数量、内部 context 形状或组件文件位置。

## 验收条件

1. 当前任务和历史详情在匹配任务数据可用后显示具体任务标题，历史列表显示本地化页面标题。
2. 所有运行时标题采用 `<内容> · Codex`，且完整标题最多 60 个 grapheme。
3. 超限任务内容从尾部截断为 51 个内容 grapheme 加 `…`，固定后缀完整保留。
4. 路由切换立即清除旧任务标题；加载或读取失败时保持目标路由的中性标题。
5. 运行、连接和失败状态不进入标题。
6. 只有与当前 route thread ID 匹配的任务事实能够覆盖中性标题。
7. Not Found 和固定页面标签随 Lingui locale 更新，`Codex` 不本地化。
8. 运行时只有一个 `document.title` writer；各页面不直接竞争写入。
9. 未新增协议、手写 contract、请求、依赖、持久化设置或范围外 UI 改动。

## 否决条件

出现以下任一情况，方案不得验收：

- 页面组件各自通过 effect 直接写 `document.title`，形成多个 writer；
- 导航后继续显示旧任务标题，直到新详情加载成功；
- 使用未校验 thread ID 的 stale runtime 或详情事实更新标题；
- 让浏览器自行处理无上限 `preview`，或按 UTF-16 code unit 截断组合字符；
- 超过 60 个用户感知字符，或截断、删除固定 ` · Codex` 后缀；
- 在标题中顺带增加运行、连接、错误、未读或完成状态；
- 手写 `Thread` 字段镜像、增加协议字段、额外请求、依赖或 runtime fallback；
- 为通过测试而放宽长度断言、跳过跨路由验证或保留旧标题兜底；
- 改动页面内可见标题、导航、Composer、transcript 或历史只读语义。

## 后续门禁

本文档已经用户明确确认；本次确认同时授权对应实施计划落盘，但不授权修改代码、测试、生成物、
Git 暂存或提交。

对应计划仍需用户明确确认，之后才能开始实现和验证。
