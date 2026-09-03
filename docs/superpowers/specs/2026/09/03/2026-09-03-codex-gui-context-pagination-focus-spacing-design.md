# Codex GUI 上下文分页 focus ring 与间距设计

> 日期：2026-09-03
> 状态：已确认
> 确认日期：2026-09-03
> 用户确认原文：`确认，计划落盘`
> 依据：[上下文分页 focus ring 与间距问题排查](../../../../research/2026/09/03/2026-09-03-codex-gui-context-pagination-focus-spacing.md)

## 目标

调整上下文压缩展示分页的局部样式，使分页控件之间保持清晰但不过度松散的视觉间距，键盘
`focus-visible` ring 在常规宽度和窄宽度横向滚动场景中完整可见，同时保持当前分页按钮位置与
外部纵向节奏。

本设计只改变分页局部布局样式，不改变分页算法、上下文页语义、翻页行为、可访问名称、当前页
状态或 transcript 展示拓扑。

## 根因与设计约束

`TranscriptContextPagination` 当前以无 padding 的 `w-full overflow-x-auto` 包裹 HeroUI
`Pagination`。横向 `overflow: auto` 会使另一轴的 `visible` 计算为 `auto`，因此包装层也形成
纵向裁剪边界。HeroUI 3.2.4 的分页链接使用 2px ring 与 2px offset，focus 视觉向控件外扩约
4px；现有包装没有提供这段空间，导致截图中的上下 ring 被裁掉。

HeroUI 的 `.pagination__content` 默认使用 `gap-1`，即 4px。Codex GUI 当前没有覆盖该 slot 的
间距。已确认的样式目标不是修改 HeroUI 全局默认值，而是在当前分页实例中把控件间距调整为
8px，并独立提供 focus 安全区。

## 已确认的样式设计

### 横向控件间距

`Pagination.Content` 的 Previous、页码、ellipsis 与 Next 项之间统一使用 8px 间距。该间距只
作用于当前上下文分页实例，不修改 Previous/Next 内部 icon 与文字间距，也不修改 HeroUI 全局
`.pagination__content`。

8px 在当前 `size="sm"` 控件上提供比默认 4px 更清楚的分组边界，同时避免 12px 方案对窄宽度
横向占用的额外放大。页码窗口、ellipsis 数量和按钮尺寸保持不变。

### Focus 安全区

横向滚动的 scrollport 内部在四周为分页控件保留 4px clearance，使 HeroUI 现有 focus ring
完整落在裁剪边界以内。安全区属于分页包装的布局责任，不通过关闭 ring、改成 inset ring、缩小
ring、隐藏 focus 状态或修改 HeroUI 全局样式实现。

上下各 4px clearance 吸收到现有区块间距中，不额外增加分页区域对外占用的总高度。分页按钮
相对正文的视觉位置与现有纵向节奏保持不变；安全区只把原本位于裁剪边界外的 focus 绘制空间
纳入 scrollport。

横向仍保留可滚动能力。首尾控件在滚动边界处同样拥有 4px clearance，避免 focus 移动或浏览器
自动滚动后左右 ring 贴边被裁剪。

## HeroUI 组件与语义

- 继续使用 HeroUI v3 `Pagination` compound API 和当前 `size="sm"`。
- 继续使用 `Pagination.Content`、`Pagination.Item`、`Pagination.Previous`、`Pagination.Link`、
  `Pagination.Ellipsis` 与 `Pagination.Next`。
- 继续使用 `onPress`、`isDisabled`、`isActive` 和既有 `aria-label`；不自建 button，不改变
  React Aria focus 行为。
- 样式使用现有 Tailwind spacing scale 表达 8px item gap 与 4px clearance，不引入硬编码颜色或
  第二套 focus token。

## Owner 与预计文件范围

后续计划的生产 owner 限定为：

- `codex-gui/src/features/committedTranscriptSurface/TranscriptContextPagination.tsx`：拥有当前分页
  实例的 scrollport clearance 与 content gap。

回归覆盖限定为：

- `codex-gui/src/features/committedTranscriptSurface/__tests__/TranscriptContextPagination.browser.test.tsx`：
  覆盖分页 focus 与滚动裁剪几何。

若实现需要修改 HeroUI sibling checkout、全局 CSS、transcript renderer、分页状态或其他生产文件，
说明当前局部 owner 假设失效，必须先回到计划范围确认，不能自行扩大。

## 明确排除

- 不修改 `pageItemsFor`、当前页选择、ellipsis、Previous/Next 启停或压缩分页语义。
- 不改变 HeroUI 全局 `.pagination`、`.pagination__content`、`.pagination__link` 或 focus token。
- 不以 `overflow: hidden`、关闭 outline/ring、降低颜色对比或缩小 focus 视觉掩盖裁剪。
- 不改变分页按钮尺寸、文字、icon、圆角、active 背景或 hover/pressed 状态。
- 不增加性能分页、网络分页、虚拟化、滚动位置持久化或新的自动定位语义。
- 不启动可见浏览器或桌面窗口；可见桌面验收不属于本设计的完成前提。

## 后续验收要求

Level 1 Browser Mode 应使用真实键盘导航触发 `focus-visible`，并覆盖 Previous、数字页码与 Next。
几何断言应确认控件四周至少有 4px scrollport 内部 clearance，同时验证 8px item gap、横向滚动、
翻页、`aria-current` 和 disabled 语义未回归。目标测试必须在 Chromium、Firefox、WebKit 中非零
收集并通过。

Level 2 应在真实 Codex runtime 的无头场景检查常规宽度和窄宽度：focus ring 四边完整、滚动后
首尾控件不被裁剪、分页按钮位置和外部纵向节奏不发生可见偏移。Level 3 不适用；本设计不依赖
操作系统窗口、跨应用焦点或系统 IME。
