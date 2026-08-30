# Skill typeahead 键盘滚动首尾边界修复设计

日期：2026-08-30
状态：已确认

## 唯一主目标

修复 skill 输入框候选列表的键盘导航边界：只要仍有候选项，切换到首项和末项时，候选列表的滚动位置就严格到达 `0/max`；同时保留 HeroUI 视觉语义、完整 focus ring 和现有 Lexical 交互 owner。

## 设计依据与证据边界

本设计只消费已有 research，不追加调查。事实来源见 [Skill typeahead 键盘滚动首尾边缘空隙调查](../../../../research/2026/08/30/2026-08-30-skill-typeahead-keyboard-scroll-edge-gap.md)。

当前高置信候选根因是滚动几何不一致：HeroUI Select 派生的 listbox 首尾 padding 为 6px，而候选滚动容器的 scroll padding 为 4px；Codex 在 active option 变化后调用 `scrollIntoView({ block: "nearest" })`，因此源码几何推导出的首尾余量为 2px。

该推导尚未由 focused Browser Mode red loop 记录为运行时最终根因。现有测试只证明滚动容器可以手工到达 `0/max`，没有证明键盘导航到首尾后会到达极值。设计因此把 focused 键盘复现作为实施前置证据：若测得事实推翻 6px/4px 推导，不得继续按本设计实施，必须回到事实闭包。

## 已确认的产品决策

- `ready`、`refreshing`、`stale` 和 partial-error 状态只要仍有候选项，都必须使用同一套严格 `0/max` 键盘滚动结果。
- 状态横幅不属于候选列表的滚动内容；横幅存在期间始终可见，候选列表独立滚动。
- `failed` 状态没有候选项。错误横幅不参与方向键 option 导航，`Retry` 继续使用普通焦点导航。
- 不根据首项或末项 index 直接写入 `scrollTop = 0/max`；修复必须建立正确的容器边界与滚动几何，而不是增加边缘特判。

## 目标

- 让键盘导航首项后的候选滚动容器满足 `scrollTop === 0`。
- 让键盘导航末项后的候选滚动容器满足 `scrollTop === scrollHeight - clientHeight`。
- 让上述结果与状态横幅是否存在无关。
- 保留 Lexical 对 active index、方向键循环和 option 选择的所有权。
- 保留 `scrollIntoView({ block: "nearest" })` 的最小可见滚动语义。
- 保留 HeroUI listbox/item 样式和 active option 的完整 focus ring。

## 非目标

- 不把当前菜单替换为完整 HeroUI `Select`，也不把键盘 owner 从 Lexical 迁移到 HeroUI 或 React Aria。
- 不修改方向键循环、option 选择、pointer hover、editor focus 或 `aria-activedescendant` 语义。
- 不删除 listbox padding、focus ring、ring offset 或其他 HeroUI 视觉保护空间。
- 不让状态横幅变成方向键候选项或候选滚动内容。
- 不为 `failed` 状态新增虚构的候选列表滚动行为。
- 不在本设计阶段创建实施计划、修改 production 代码、运行验证或提交 Git 变更。

## 总体设计

把当前混合承载“状态横幅 + 候选列表”的滚动区域拆成两个同级区域，并只保留一个候选滚动 owner：

```text
Skill typeahead popover（总高度与裁切边界）
├── status region（非滚动；有状态时始终可见）
└── candidate scroll region（唯一纵向滚动容器）
    └── listbox（保留 HeroUI 6px 首尾 padding）
        └── options（Lexical active index owner）
```

popover 外层继续拥有整体最大高度和裁切边界。状态区域按内容占用固定布局空间；候选区域使用剩余空间，并通过 `min-height: 0` 允许在 flex/grid 布局内实际收缩和产生内部滚动。外层与状态区域都不得成为候选项的滚动 ancestor。

候选滚动区域的上下 scroll padding 与 Select 派生 listbox 的上下 padding 对齐为 6px。listbox 的 6px padding 不变，active focus ring 不变，active option 变化后仍由现有 layout effect 调用 `scrollIntoView({ block: "nearest" })`。

这个几何不变量使 `nearest` 自然得到边界结果：

- 首项 border box 距滚动内容顶部 6px；有效 scrollport 顶部也内缩 6px，因此首项的 start 对齐位置就是 `scrollTop = 0`。
- 末项 border box 距滚动内容底部 6px；有效 scrollport 底部也内缩 6px，因此末项的 end 对齐位置就是 `maximumScrollTop`。

设计不读取 active index，也不在滚动后二次改写 `scrollTop`。严格边界是正确几何与浏览器 `nearest` 算法的结果，不是首尾分支补丁。

## 组件与状态边界

### Popover 布局边界

现有 popover 表面继续负责宽度、最大高度、阴影、圆角、背景和整体 overflow 裁切。其内部改为纵向布局，明确分离非滚动状态区域与可收缩候选区域。

总高度上限保持不变：

- `ready` 没有状态横幅，候选区域可以使用全部可用高度。
- `refreshing`、`stale` 与 partial-error 先为状态横幅保留可见空间，候选区域只滚动剩余高度。
- 状态变化不得复用旧候选区域的错误 scroll owner；同一个候选区域始终是 option 的最近纵向滚动 ancestor。

### 状态区域

状态区域只渲染状态信息和既有操作，不设置 `overflow-y-auto`，不携带 listbox scroll padding，也不接收 Lexical active option 的滚动。

横幅出现、更新或消失时可以改变候选 viewport 的高度，但不能改变候选内容坐标系的首尾几何。只要候选项仍存在，随后导航到首项或末项仍分别收敛到候选区域自己的 `0/max`。

### 候选滚动区域

候选滚动区域是唯一的 `overflow-y-auto` owner，并满足：

- 可在外层纵向布局中收缩；
- 上下 computed scroll padding 均为 6px；
- listbox 仍保留上下 6px computed padding；
- `scrollHeight`、`clientHeight` 和 `scrollTop` 只描述候选列表，不包含状态横幅；
- option 的 `scrollIntoView({ block: "nearest" })` 只滚动该区域，不移动状态横幅或整个 popover。

### `failed` 与 `Retry`

完全失败且没有候选项时不创建伪 option，也不要求候选滚动区域满足边界断言。错误横幅保持可见，`Retry` 仍是普通可聚焦控件，使用 Tab/Shift+Tab 等常规焦点导航；ArrowUp/ArrowDown 不把它纳入 Lexical option 集合。

## 视觉语义

严格 `0/max` 指候选滚动容器的物理滚动位置，不表示 active focus ring 必须贴住 popover 外缘。

listbox 的 6px padding 与约 4px 的向外 focus ring 继续提供约 2px 的视觉 clearance。该空间用于完整显示 HeroUI focus ring，不能通过删除 padding 或 ring 来消除。修复后应同时满足：滚动值严格到边界，focus ring 完整且不被裁切。

## 验证设计

### Focused Browser Mode red loop

实施前先建立真实键盘路径，使用足够多的候选项确保候选区域发生 overflow。测试必须先证明当前实现失败，并记录：

- candidate scroll region 的 `scrollTop`、`scrollHeight - clientHeight`；
- computed `scrollPaddingTop`、`scrollPaddingBottom`；
- listbox computed `paddingTop`、`paddingBottom`；
- active option 与 candidate scroll region 的 `getBoundingClientRect()`。

如果运行时结果不是 research 推导的 6px/4px 几何差，停止按本设计实施并回到根因确认；不得用放宽断言或首尾特判把不同根因包装成通过。

### 键盘行为契约

对每个仍有候选项的状态覆盖真实 Arrow 键路径：

- 初始首项 active 时，candidate scroll region 为 `0`。
- 从首项按 ArrowUp 循环到末项后，末项 active，candidate scroll region 等于 `scrollHeight - clientHeight`。
- 从末项按 ArrowDown 循环到首项后，首项 active，candidate scroll region 回到 `0`。
- `ready`、`refreshing`、`stale` 与 partial-error 都满足同一结果。
- 有状态横幅时，横幅在首尾导航前后均位于 candidate scroll region 外且保持可见。

同时保留现有 editor focus、`aria-activedescendant`、active option 样式、完整 focus ring 和 pointer hover 不改写 active option 的覆盖。

### 结构与几何契约

- 页面中只有 candidate scroll region 是候选列表的纵向滚动 owner。
- candidate scroll region 的上下 scroll padding 与 listbox 的上下 padding 均为 6px。
- 状态横幅不计入 candidate scroll region 的 `scrollHeight`。
- `failed` 状态没有 option；`Retry` 仍通过普通焦点导航可用。
- 在项目支持的 Chromium、Firefox 和 WebKit Browser Mode 中验证严格边界，避免把单一引擎的 rounding 当成通用结论。

## 风险与约束

- 若纵向布局缺少 `min-height: 0`，候选区域可能扩张外层而不是内部滚动；测试必须用实际 overflow 证明 owner 正确。
- 状态横幅高度变化会改变候选区域的 `clientHeight` 和 `max`，但不应改变首尾对齐公式；断言必须每次从实际 geometry 计算 `max`，不能写固定像素。
- `scrollIntoView` 会滚动最近的可滚动 ancestor。实现若意外让 popover 外层或状态区域可滚动，就会重新引入 owner 歧义。
- 浏览器可能存在亚像素布局，但产品契约仍是候选滚动坐标的精确物理边界。若 focused red loop 证明引擎对正确几何仍产生非零亚像素结果，需要重新设计几何或调用方式，不能追加 index 特判。

## 验收标准

- `ready`、`refreshing`、`stale` 与 partial-error 的候选列表通过真实键盘导航严格到达自身 `0/max`。
- 状态横幅始终位于候选滚动区域之外并保持可见。
- 实现中不存在按首项/末项 index 写入 `scrollTop` 的分支。
- Lexical 继续拥有 active index 与 option 选择；Codex 继续使用 `scrollIntoView({ block: "nearest" })`。
- HeroUI listbox/item 视觉语义与完整 focus ring 保持不变。
- `failed` 与 `Retry` 的焦点语义不变。
- focused Browser Mode 先形成失败证据，再证明修复后的结构、几何与键盘行为；项目要求的前端静态检查通过。

## 阶段边界

本文仅为设计，不是 implementation plan，也不授权修改 production 代码、测试、生成物、Git index 或提交。设计经用户明确确认后，下一轮才可落盘实施计划。
