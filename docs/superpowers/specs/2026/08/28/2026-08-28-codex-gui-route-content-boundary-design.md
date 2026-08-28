# Codex GUI 路由内容边界统一设计

设计状态：已确认

确认日期：2026-08-28

确认原文：`确认，计划落盘`

设计日期：2026-08-28

设计分支：`dev`

设计时 HEAD：`d3acdba518afee9ba19b95d6c28140628499ee6c`

关联设计：

- [`2026-07-06-codex-gui-top-notices-sticky-design.md`](../../07/06/2026-07-06-codex-gui-top-notices-sticky-design.md)
- [`2026-08-17-codex-gui-thread-history-responsive-grid-design.md`](../17/2026-08-17-codex-gui-thread-history-responsive-grid-design.md)

## 唯一主目标

让同一路由内的顶栏内容、顶部持久 notice 和页面级内容使用一致的水平内容边界，消除
`/history` 启动失败态中两个错误 `Alert` 随视口变化出现“窄屏上方更宽、宽屏下方更宽”的反转，
同时保留历史列表为网格使用宽内容区、当前任务与历史详情使用窄阅读内容区的现有产品语义。

## 与既有设计的关系

本设计定向补充而不推翻两个既有设计：

- 2026-07-06 顶部 notice 设计继续拥有 sticky、层级、多 notice 堆叠和 HeroUI `Alert` 语义；
- 2026-08-17 历史网格设计继续拥有历史列表 `max-w-6xl`、1/2/3 列网格，以及当前任务和历史详情
  保持窄阅读宽度的边界；
- 本设计只修正二者交汇处缺失的“当前路由内容边界”所有权，不改变 notice 生命周期或历史网格
  拓扑。

2026-07-06 设计中顶部 notice 内层固定 `max-w-3xl` 的决策，由本设计收紧为跟随当前路由的内容
宽度；其余 sticky notice 决策继续有效。

## 当前实现与根因证据

### 三个 owner 分别声明宽度

当前 `/history` 同时存在三套布局声明：

- `AppShellTopBar` 根据 `routeTarget.type === "historyList"` 在 `max-w-6xl` 和 `max-w-3xl`
  之间切换，并使用 `px-4`；
- `ThreadHistoryListPage` 使用 `max-w-6xl px-4`；
- `AppShellTopNotices` 无视路由，固定使用 `max-w-3xl`，且没有水平 gutter。

HeroUI `.alert` 本身使用 `w-full`，没有独立最大宽度。两个错误块的宽度差由各自父布局决定，
不是 `Alert` variant、文案长度或 DevTools 缩放造成。

设视口 CSS 宽度为 `V`，当前两个错误块近似为：

```text
顶部启动错误 = min(V, 48rem)
历史页面错误 = min(V, 72rem) - 2rem
```

因此小于 800px 时顶部错误宽 32px，800px 时两者相等，大于 800px 后历史页面错误继续增长而
顶部错误被 768px 封顶，形成可稳定复现的方向反转。

### 权威路由事实已经存在

`GuiRouteTarget` 已经穷举当前三个合法路由目标：

- `currentTask`
- `historyList`
- `historyDetail`

它由成功的 TanStack Router 末级 route match 产生，并经 `AppCapabilities` 提供给 AppShell 与页面。
布局不得重新解析 pathname，也不得建立平行的路由字符串 contract。

## 已确认的产品决策

### 统一的是同一路由内部边界，不是所有路由使用同一宽度

用户选择全局采用“跟随当前路由内容宽度”的顶部 notice：

- 历史列表使用宽布局，服务大量历史 Card 的响应式网格；
- 当前任务与历史详情使用窄阅读布局；
- 顶栏、顶部 notice 和页面级 chrome 均跟随当前路由的宽窄语义。

历史列表保持比当前任务和历史详情更宽。不得以“统一”为由把三条路由全部改成 `max-w-6xl`
或全部收窄为 `max-w-3xl`。

### 当前任务 ready 状态保持 full-bleed

当前任务 ready 状态的 transcript `Surface`、Composer 和 sticky-bottom 结构具有独立布局语义，
现有 `<main>` 刻意不使用 `px-4`。它们不是 route chrome seam 的消费者，本设计不借统一内容边界
改变其 full-bleed 行为。

当前任务错误态与空态属于页面级 chrome，可以消费窄阅读内容边界；ready transcript 内部已有的
单列内容上限继续由其现有 owner 管理。

## 设计

### AppShell 持有唯一路由布局策略

路由内容布局策略属于 `appShell` 域。它以权威 `GuiRouteTarget` 为唯一输入，并穷举映射：

- `historyList` → `wide`
- `currentTask`、`historyDetail` → `reading`

`wide` 和 `reading` 只是 AppShell implementation 内部字面量，不是协议、持久数据、公共产品
contract 或可供页面自行扩展的枚举。未来新增 `GuiRouteTarget` variant 时，布局映射必须在
TypeScript 穷尽性检查中失败，迫使新增路由明确选择布局语义。

### 语义化内容边界 Interface

提供一个供现有语义元素复用的内容边界 Interface。调用方只声明自己属于当前路由内容边界，
不再了解或复制 `max-w-3xl`、`max-w-6xl` 和水平 gutter 的组合。

该 Interface 只承诺：

- `w-full`；
- 水平居中；
- 页面级水平 gutter；
- 继承当前路由的最大内容宽度。

它不拥有以下实现：

- 元素应是 `<header>`、`<main>`、`div`、`Surface` 还是 `aside`；
- `flex`、`grid`、列数和纵向 gap；
- sticky、fixed、z-index 和 bottom action space；
- HeroUI 组件、状态 variant 和交互行为。

因此顶栏、顶部 notice 与页面仍保留各自的原生语义和布局职责，只共享水平内容边界。

### Seam 形态

采用 CSS 语义 class 配合 AppShell 私有 route layout 属性：

- AppShell 根根据 `GuiRouteTarget` 暴露内部 `wide` 或 `reading` 布局状态；
- 私有 CSS custom property 把该状态映射到现有 Tailwind container token；
- 语义化内容边界 class 使用该 property 取得当前路由最大宽度，并统一居中和 gutter；
- 测试只验证可见几何结果，不断言私有 data attribute、CSS custom property 名称或内部字面量。

该 seam 比共享 class 解析函数更深：页面不需要取得或传递 `routeTarget`，路由知识集中在 AppShell。
它也比 polymorphic React wrapper 更小：不会引入额外 DOM，也无需暴露 `as`、intrinsic props、ref
转发或 class 合并 Interface。

所有依赖均为 in-process dependency，不需要 port、Adapter、mock 或新增运行时依赖。

### 消费边界

应消费共享 route content seam 的生产 owner 包括：

- `AppShellTopBar` 内层内容；
- `AppShellTopNotices` 内层 notice 栈；
- 当前任务错误态与空态的页面级容器；
- 历史列表页面主体；
- 历史详情页面主体。

不得机械替换仓库中所有 `max-w-3xl`。transcript、Composer、Card、详情内部内容和其他嵌套单列
上限不是路由宽窄 owner，强行纳入会扩大范围并破坏局部布局所有权。

历史详情底部固定操作条已有独立的外层 gutter、fixed 和 backdrop 语义，而且只存在于
`historyDetail` 路由，不负责在宽窄路由之间选择布局；它继续由现有 owner 管理，不接入本 seam。

## HeroUI 与视觉语义

- 两个错误块继续使用 HeroUI v3 `Alert status="danger"`；
- `Alert.Indicator`、`Alert.Content`、`Alert.Title` 和 `Alert.Description` 结构保持不变；
- 不给单条 `Alert` 增加 route-aware max width，宽度继续由父内容边界控制；
- 继续使用现有 surface、background、separator 和 spacing 语义 token；
- 不新增硬编码颜色、阴影、图片、字体或依赖。

## 保持不变

- 历史列表 1/2/3 列响应式网格、Card 宽度和长文本处理；
- 当前任务和历史详情的窄阅读宽度；
- 当前任务 ready transcript/Composer 的 full-bleed 与 sticky-bottom 行为；
- `AppShellTopNotices` 的 sticky 归属、多 notice 纵向堆叠、层级和 DOM 位置；
- GUI host 连接、授权 session、启动错误产生和历史加载状态模型；
- HeroUI `Alert` 内容、文案、本地化和无障碍语义；
- 历史列表、当前任务和历史详情的路由、数据与交互语义。

## 非目标

- 不修改 app-server、Rust、协议、schema、generated 类型或 runtime validator；
- 不修改历史列表数据、分页、网格列数、Card 或历史详情内容；
- 不重新设计当前任务 transcript、Composer、Drawer 或底部操作条；
- 不新增通用 layout framework、polymorphic wrapper、route DTO 或平行路由 contract；
- 不改变 notice 的生命周期、关闭能力、优先级、折叠或堆叠策略；
- 不用 overflow、缩放、负 margin 或单条 Alert 特例隐藏宽度差；
- 不新增依赖、兼容层、fallback、双路径或运行时兜底。

## 验证设计

### Browser Mode 几何回归

自动化验证应通过可见几何而不是 Tailwind class 名称证明 seam 生效：

- 在窄屏、800px 交叉点和宽屏范围触发 GUI host 启动错误；
- 在 `/history` 同时观察顶部启动错误与页面级“无法加载历史记录”错误；
- 比较顶栏内层、顶部 notice 内容边界和历史页面主体的 `getBoundingClientRect()` 左右边界；
- 证明两个错误 `Alert` 在所有代表性视口中左右边界一致，不再发生大小关系反转；
- 证明历史列表内容边界仍宽于当前任务和历史详情；
- 证明页面、notice 和 Alert 没有横向 overflow、clipping 或额外滚动条；
- 保留现有 sticky、DOM 顺序、错误文案、无 Composer 和路由对齐断言。

测试不得把私有 route layout attribute、custom property 名称、具体 helper 或 class 组合作为产品契约。

### 可见浏览器验收

实现后使用可见的 Google Chrome for Testing：

- 在代表性窄屏和宽屏检查 `/history` 双错误状态的左右边界、垂直堆叠、sticky 和页面滚动；
- 使用有效 GUI launch URL 验证正常历史列表仍能利用宽内容区展示响应式网格；
- 验证当前任务与历史详情仍保持窄阅读宽度；
- 验证当前任务 ready transcript/Composer 没有因共享 seam 改变 full-bleed 行为；
- 不把页面启动、自动测试、DOM 断言或截图单独当作真实 GUI 验收。

当前 `http://localhost:5173/history` 缺少 launch token，只能证明启动失败态布局；它不能替代正常历史
列表和真实 Codex-backed 路由的验收。

## 验收条件

1. `/history` 的顶栏内容、顶部 notice 与历史主体在窄屏、交叉点和宽屏具有一致左右边界。
2. 顶部启动错误与历史页面错误在所有代表性视口等宽，不再发生大小关系反转。
3. 历史列表保持宽布局；当前任务和历史详情保持窄阅读布局。
4. 当前任务错误态与空态使用 reading 内容边界，ready transcript/Composer 保持现有 full-bleed。
5. route width 和 gutter 的选择只有一个 AppShell owner；页面不再自行判断 route type。
6. `GuiRouteTarget` 保持唯一权威，新增 variant 会触发布局映射的穷尽性失败。
7. sticky notice、HeroUI `Alert`、错误文案、路由、数据和交互语义保持不变。
8. 不新增依赖、平行 route contract、兼容路径、fallback 或范围外页面改造。

## 否决条件

出现以下任一情况，方案不得验收：

- 只给 `AppShellTopNotices` 增加一个 `/history` 条件分支，继续让宽度策略散落；
- 把历史列表收窄，或把当前任务、历史详情扩大为网格宽度；
- 给单条 `Alert` 写专用宽度、负 margin 或 viewport 特例；
- 为共享 class 新增额外 DOM，破坏 `<header>`、`<main>`、grid、sticky 或 fixed 语义；
- 机械替换所有 `max-w-3xl`，改变 transcript、Composer 或嵌套内容上限；
- 测试只断言 class 或截图，不验证实际左右边界；
- 用 overflow 隐藏几何错误，或放宽、删除现有路由和响应式断言；
- 修改协议、状态模型、路由语义、notice 生命周期或其他未确认行为。

## 后续门禁

本文档已经用户确认；用户同时授权把对应计划落盘。该授权不包含修改代码、测试、样式、生成物、
Git 暂存、提交或执行实现。计划落盘后仍需用户明确确认计划，才能进入实施阶段。
