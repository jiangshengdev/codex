# Codex GUI Skill Typeahead 的 HeroUI Select Popover 视觉修订设计

日期：2026-08-29

状态：已确认并落盘

## 唯一主目标

在保留 Lexical 唯一交互 owner、canonical `name + path` 内部身份及既有碰撞消歧规则的前提下，使 `$` skill 选择面板的可见样式参考 HeroUI 3.2.4 `Select.Popover`，并移除滚动后遮挡上下候选内容的渐变遮罩。

## 文档关系

本文是以下已确认设计的后续定向修订：

- `docs/superpowers/specs/2026/08/29/2026-08-29-codex-gui-skill-typeahead-heroui-style-design.md`
- `docs/superpowers/specs/2026/08/19/2026-08-19-codex-gui-skill-input-completion-design.md`
- `docs/superpowers/specs/2026/08/19/2026-08-19-codex-gui-composer-skill-interface-usability-design.md`

发生冲突时，本文只在 skill typeahead 的面板壳层、滚动提示、候选 active/hover 视觉和开合动效方面优先。以下既有结论继续有效：

- Lexical 继续是唯一 focus、active index、keyboard selection 和 pointer selection owner；
- 不直接替换为 HeroUI `Select`、`Select.Popover`、`ListBox` 或 `ListBox.Item` 交互 primitive；
- canonical `name + path` 继续作为内部身份和提交身份；
- 只有相同 canonical name 对应多个不同 canonical path 时，才在每条碰撞候选中显示 scope 与最短唯一父路径；
- 底部 path 详情区、hover preview 和完整 canonical path 可见展示继续保持删除状态；
- catalog、匹配、排序、IME、剪贴板、队列、提交、菜单 placement 和 Composer owner 不变。

本次一手调查记录在：

- `docs/superpowers/research/2026/08/29/2026-08-29-skill-typeahead-heroui-assessment.md`

## 当前事实与根因

### 遮罩来自 ScrollShadow fade mask

当前候选滚动区由 HeroUI `ScrollShadow` 渲染，使用默认 `variant="fade"` 和默认 `size=40`。当列表同时可以向上、向下滚动时，组件对整个滚动容器应用上下各 40px 的 `mask-image` 渐变；它不是 `Surface` 阴影、active 行背景或独立 overlay。

该 mask 会把滚动区两端的候选文字和背景同时淡出。截图中顶部 active 候选和底部候选被大面积洗白，正是此机制的可见结果。

HeroUI `Select.Popover` 本身不使用该 fade mask，而是在 popover 上使用 `overflow-y-auto`、overscroll containment 和可见滚动条。因此，继续保留 mask 与“参考 Select 选择面板样式”的目标冲突。

### 当前外壳仍是 secondary Surface 视觉

当前面板外壳是 `Surface variant="secondary"`，并额外使用 `rounded-xl`、`border-separator` 和 Tailwind `shadow-lg`。HeroUI 3.2.4 `Select.Popover` 的官方视觉则使用：

- `bg-overlay`；
- `shadow-overlay`；
- `min(32px, radius-3xl)` 圆角；
- 默认无显式外边框；
- popover 内 listbox `p-1.5`；
- item 在通用 HeroUI listbox item 基础上使用 `px-2.5`。

当前候选行已复用公开的 `listboxVariants` 与 `listboxItemVariants`，但外壳层级、圆角、阴影和 Select 局部列表密度尚未对齐。

### Lexical active 不等于 Select selected value

typeahead 的 active 候选表示“当前按 Enter 将接受的候选”，不是已经提交的 Select value。HeroUI 3.2.4 默认 listbox selected 规则没有额外背景，通常依赖可选 checkmark；直接照搬 selected 表达会混淆导航位置和已提交选择。

同时，候选 `li` 不持有真实 DOM focus。真实 focus 必须继续停留在 editor，并通过 `aria-activedescendant` 指向 active option。因此，新的 focus ring 只表达 active 的视觉代理，不得伪造 option 获得了 DOM focus。

## 已确认产品决策

1. 完全移除滚动区上下 fade mask，只保留细滚动条作为 overflow 提示；不新增边线、箭头或其他边缘提示。
2. 面板壳层完整采用 HeroUI `Select.Popover` 的视觉语言：overlay 背景、语义 overlay 阴影、大圆角、无外边框和 Select 列表密度。
3. keyboard active 候选使用中性背景加 HeroUI focus ring；pointer hover 只使用中性背景。
4. active 与 hover 同时命中时，active 的 focus ring 必须保留，pointer hover 不得改变 active 或 Enter 的选择目标。
5. 菜单保持即时出现、即时关闭，不采用 HeroUI `Select.Popover` 的 enter/exit animation。
6. “参考 Select”只定义视觉结果，不授权引入 `Select` 的 trigger、value、indicator、form invalid、selected checkmark 或 React Aria focus/selection owner。

## 目标视觉结构

```text
╭──────────────────────────────────────────────────────────╮
│ Action Authorization                                     │
│ Clarify action authorization and scope boundaries.       │
│                                                          │
│ Ask Matt                                      $ask-matt   │
│ Find the right skill or workflow.                        │
│                                                          │
│ Code Review                                              │
│ Repository · plugins/review                              │
│ Run a final code review on a pull request.               │
╰──────────────────────────────────────────────────────────╯
```

结构要求：

- 整个面板是一个 overlay 层级的连续圆角浮层；
- 外层没有额外 separator border；
- listbox 与候选行使用 HeroUI `Select.Popover` 内的留白密度；
- 候选内容不会因滚动位置被 mask 淡出；
- 细滚动条保留，active 变化仍自动把目标滚入最近可见位置；
- loading、stale、failed、partial error、retry 和 empty 状态继续位于同一浮层内，不新增独立 footer。

## HeroUI 组合边界

### 壳层

面板壳层的视觉权威来源是 HeroUI 3.2.4 的公开 `selectVariants().popover()` slot 及其对应 `select.css`，而不是重新手写一组近似颜色、圆角和阴影。

实现可以在不引入 React Aria Popover owner 的前提下，把公开 popover slot 样式组合到现有 Lexical portal 容器。是否继续保留 `Surface` 作为无交互 layout wrapper 属于实现细节，但最终 computed style 必须符合本设计的 overlay、shadow、radius、border 和 density 结果，且不得让 `Surface variant="secondary"` 覆盖 Select popover 视觉。

### 滚动区

滚动 owner 必须继续提供：

- `overflow-y: auto`；
- 当前最大高度约束；
- 可见细滚动条；
- `overscroll-contain`；
- 无横向 overflow；
- active option 的 `scrollIntoView({ block: "nearest" })`。

滚动容器不得再应用 `mask-image`、fade gradient 或覆盖候选内容的滚动提示。保留还是替换 `ScrollShadow` wrapper 属于实现细节；最终状态只允许一个滚动 owner，且不能因删除 wrapper 丢失内部滚动。

### 候选行

原生 `ul/li` 继续复用 HeroUI `listboxVariants` 与 `listboxItemVariants`，不引入第二套交互 primitive。Select popover 对 listbox/item 的局部 padding 也应进入最终 computed style。

状态语义如下：

| 状态 | 视觉结果 | 行为约束 |
| --- | --- | --- |
| default | HeroUI listbox item 默认样式 | 不增加本地边框或强调色填充。 |
| pointer hover | 中性 `bg-default` | 不改变 Lexical active、Enter 目标或滚动位置。 |
| keyboard active | 中性背景加 HeroUI `status-focused` 等价 focus ring | 继续对应 `aria-selected="true"` 与 `aria-activedescendant`。 |
| active + hover | active ring 保留 | hover 不得覆盖或削弱 active。 |
| pressed | HeroUI item pressed 语义 | 不移动 editor focus。 |

不得给 option 伪造 `data-focus-visible="true"`，也不得把 DOM focus 移到候选行。active ring 应由既有 `data-active` 或等价的 Lexical active 派生状态应用。

## 信息层级与碰撞规则

本次不改变上一版设计的信息结构：

- 友好名称始终显示；
- canonical name 仅在与友好名称不同时显示为 `$canonical-name`；
- description 非空时最多显示一行；
- 普通候选不显示 scope 或 path；
- canonical name 相同且 canonical path 不同时，每个碰撞候选稳定显示 scope 与最短唯一父路径；
- 主标签不同不能免除 canonical name 碰撞消歧；
- 不显示完整 canonical `SKILL.md` path；
- 不恢复底部详情区或 hover preview。

## 交互、可访问性与几何

以下契约保持不变：

- editor 保持真实 DOM focus、combobox ARIA 和唯一的 keyboard owner；
- `aria-controls`、`aria-expanded`、`aria-activedescendant`、option ID、`role="option"` 与 `aria-selected` 保持同步；
- Arrow、Enter、Tab、Escape、IME、pointer/touch replacement 行为不变；
- pointer hover 不改变 keyboard active；
- 菜单继续与 Composer 等宽，维持 above/below placement、最大高度、viewport 闭合和 pending-input drawer host 边界；
- 长名称、canonical name、description 和碰撞 path 均不得产生横向 overflow；
- 窄屏不切换为 Modal、Drawer 或 bottom sheet；
- light、dark 和 reduced-motion 下均使用 HeroUI 语义 token；由于已确认无开合动画，reduced-motion 不产生另一套菜单生命周期。

## 权威来源与数据边界

- `SkillMetadata` 继续是 name、description、path 和 scope 的权威来源；
- `SkillQueryCandidate` 继续通过 TypeScript 机械依赖生成协议类型；
- `name + path` 继续作为 option key、排序 tie-break、`SkillNode` 和结构化提交身份；
- overlay、shadow、radius、listbox density、hover、pressed 和 focus ring 的样式权威来自匹配版本的 `@heroui/styles`；
- 不新增 consumer-owned wire mirror，不修改 Rust、app-server v2、schema、generated TypeScript、依赖或 lockfile。

## 验证边界

后续计划必须分别覆盖自动验证与真实 GUI 验收，二者不得互相替代。

自动验证至少证明：

- 滚动区仍为单一 `overflow-y: auto` owner，保留细滚动条、最大高度和 active 自动滚入视口；
- 滚动前、顶部、中间和底部状态均不存在 `mask-image` 或 fade；
- 壳层 computed style 使用 overlay background、overlay shadow、Select popover radius、无外边框和目标 padding；
- active 使用中性背景和 focus ring，hover 仅使用中性背景，active + hover 不丢失 ring；
- pointer hover 不改变 active、Enter 目标或 scroll position；
- 菜单没有 enter/exit animation；
- 碰撞 path、ARIA、IME、loading/error/retry/empty、窄屏和 drawer 既有契约不回退。

真实 GUI 至少验收：

- 长列表在顶部、中间、底部滚动位置没有上下内容被洗白；
- 细滚动条足以表达 overflow，滚轮、触控板和键盘导航均可继续到达所有候选；
- default、hover、active、active + hover、pressed 的可见层级与 Enter 目标一致；
- desktop/narrow、light/dark、above/below placement 和 pending-input drawer 中，面板保持 overlay 层级、连续圆角、无横向 overflow；
- 打开和关闭均即时，没有残留壳层或延迟选择；
- 真实 canonical name 碰撞仍只在对应行内显示 scope 与最短唯一父路径。

若受影响的真实状态无法全部到达，最终必须明确写“真实 GUI 未完整验收”，自动测试和截图不得替代。

## 范围

本设计包含：

- skill typeahead 面板壳层对齐 HeroUI `Select.Popover` 视觉；
- 删除滚动 fade mask并保留内部滚动；
- Select listbox density；
- keyboard active 与 pointer hover 的新视觉层级；
- 直接受影响的前端自动验证与真实 GUI 验收边界。

## 非目标

- 直接替换为 HeroUI `Select`、`Popover`、`ListBox` 或 `ListBox.Item` 交互组件；
- 引入 trigger、indicator、form invalid、selected checkmark 或开合动画；
- 修改 Rust、protocol、schema、catalog、query、collision、path identity、排序、IME、队列或提交；
- 修改 Composer 外壳、菜单 placement、20 项上限或 viewport owner；
- 恢复常驻 path、完整 path、底部详情区、hover preview 或第二个 focus/selection owner；
- 编写实施计划、修改代码、运行验证、stage 或 commit。

## 设计完成标准

- 面板可见外壳与列表密度明确采用 HeroUI `Select.Popover` 视觉语言，而不是 secondary Surface 的近似样式；
- 所有滚动位置均不再出现遮挡候选内容的渐变 mask，同时保留单一内部滚动 owner 和细滚动条；
- active、hover 和 active + hover 状态清晰、稳定，且不改变 Lexical 交互 owner；
- 既有 path 碰撞消歧、ARIA、IME、响应式和提交身份契约保持不变；
- 本文所列自动验证与真实 GUI 场景进入后续计划。

本文仅完成设计落盘；尚未编写或确认实施计划，也未开始实现。
