# Codex GUI Skill Typeahead HeroUI 样式优化设计

日期：2026-08-29

状态：已确认

## 唯一主目标

在保留 Lexical 唯一交互 owner 和 canonical `name + path` 内部身份的前提下，优化 `$` skill 候选面板的 HeroUI v3 视觉与信息层级；只在相同 canonical name 对应多个不同 canonical path 时，把最短唯一父路径稳定显示在对应候选行内，并删除会随 active 或 hover 切换的底部 path 详情区。

## 文档关系

本文是以下既有设计的定向修订：

- `docs/superpowers/specs/2026/08/19/2026-08-19-codex-gui-skill-input-completion-design.md`
- `docs/superpowers/specs/2026/08/19/2026-08-19-codex-gui-composer-skill-interface-usability-design.md`

发生冲突时，本文只在 skill typeahead 的候选行信息层级、HeroUI 样式、碰撞 path 展示和底部详情区方面优先：

- 原设计的 Lexical focus/selection owner、`SkillNode`、catalog、匹配、排序、IME、剪贴板、队列和提交语义保持不变。
- 原可用性设计的菜单定位、与 Composer 等宽、最大高度、内部滚动、viewport 闭合和 Composer 外壳设计保持不变。
- 原设计中“path 不进入可见文本”的约束修订为：完整 canonical path 仍不得进入可见文本；只有发生 canonical name 碰撞时，候选行可以显示机械计算的最短唯一父路径。
- 原可用性设计中的常驻来源、最多两行 description、底部完整 path 详情区和 hover preview 被本文替代。

调查证据记录在：

- `docs/superpowers/research/2026/08/29/2026-08-29-skill-typeahead-heroui-assessment.md`

## 当前事实与问题

### HeroUI 并非缺席

当前 `SkillTypeaheadPlugin` 已使用 HeroUI `Surface`、`ScrollShadow`、`Separator` 和 `Button`。准确问题不是“没有使用 HeroUI”，而是候选列表仍由 Lexical 管理的原生 `ul/li`、本地状态和 Tailwind class 构成，候选行没有复用 HeroUI listbox 的基础视觉语言。

不能为了外观直接替换成 HeroUI `ListBox`。HeroUI 3.2.4 的 `ListBox` 与 `ListBox.Item` 包装 React Aria primitive，会引入自己的 focus、selection 和 pressed owner；现有菜单必须让 DOM focus 留在 Lexical editor，并由 `LexicalTypeaheadMenuPlugin` 管理 active option 和选择。

HeroUI 同时明确支持把 `@heroui/styles` 的 variant functions 应用于原生元素。因此正确组合方式是保留 Lexical 交互 owner，在现有 `ul/li` 上复用 `listboxVariants` 与 `listboxItemVariants`。

### 当前视觉状态分叉

候选行目前自行定义 `min-height`、圆角、padding、左侧 active 边框、hover ring、背景和前景。HeroUI 的 listbox item 基础样式已经提供统一的目标高度、圆角、间距、hover、pressed 与 reduced-motion 行为。

但 HeroUI 3.2.4 的默认 selected 规则没有可见样式。仅添加 `listboxItemVariants` 并保留 `aria-selected="true"` 不会产生足够明确的 Lexical active 反馈，因此 active 状态仍需使用 HeroUI 语义 token 显式定义。

### 底部详情区制造不稳定信息面

当前底部详情区显示 hover 或 keyboard active 候选的 `sourceLabel · path`。pointer 在候选间移动时，底部内容与高度可能持续切换；hover 离开后又回到 keyboard active 候选。该区域造成视觉闪烁，并额外维护 preview owner、隐藏 active description 和 `aria-describedby` 关联。

当碰撞所需的来源信息直接稳定地显示在每条候选内后，底部详情区不再提供独立价值。

### path 碰撞是真实产品边界

skill 的权威身份是 canonical path，而不是 name。生产聚合会保留同 `name`、同 `scope`、不同 path 的多个 skill；GUI 查询测试也明确保留这种候选。按 name 或 `name + scope` 在 GUI 中去重会改变生产语义并可能选择错误的 skill。

因此：

- path 不能从内部 identity、排序、`SkillNode` 或提交载荷中删除；
- 普通候选不需要展示 path；
- 两个不同 canonical path 的候选若 canonical name 相同，必须在各自行内显示足以区分它们的 path 信息；主标签是否相同不改变该判断。

## 已确认产品决策

1. 保留 Lexical 作为唯一 focus/selection owner，不引入 HeroUI `ListBox` 的第二套交互状态。
2. 候选行采用渐进披露：友好名称始终显示；canonical name 仅在与友好名称不同时显示；description 最多一行。
3. 不新增 Rust 或 app-server provenance 字段，也不按 name 折叠合法候选。
4. 只有相同 canonical name 对应多个不同 canonical path 时，才在对应各行显示 scope 与最短唯一父路径；不显示完整 canonical `SKILL.md` path。
5. 删除底部 path 详情区、`Separator`、隐藏 path description 与 hover preview；path 信息不再随 pointer 或 keyboard active 切换。
6. 候选基础视觉复用 HeroUI listbox variants；Lexical active 继续使用 HeroUI 语义 token 明确表达，并始终强于 pointer hover。

## 候选面板结构

普通候选采用最小信息层级：

```text
┌──────────────────────────────────────────────────────────┐
│ Action Authorization                                     │
│ Clarify action authorization and scope boundaries.       │
├──────────────────────────────────────────────────────────┤
│ Ask Matt                                                 │
│ Find the right skill or workflow.                        │
└──────────────────────────────────────────────────────────┘
```

友好名称与 canonical name 不同时，canonical name 作为次要身份显示：

```text
│ Friendly Action Name                         $action-auth │
│ Clarify action authorization and scope boundaries.       │
```

候选的 canonical name 相同且 canonical path 不同时，每条候选稳定显示 scope 与最短唯一父路径：

```text
│ Action Authorization                                     │
│ Repository · plugins/governance                          │
│ Clarify action authorization and scope boundaries.       │
├──────────────────────────────────────────────────────────┤
│ Action Authorization                                     │
│ Repository · workspace/skills                            │
│ Clarify action authorization and scope boundaries.       │
```

面板不再有底部“当前候选详情”区域。pointer hover 和 keyboard active 只改变对应行的视觉状态，不改变其他区域的文字或几何。

## 信息层级与碰撞规则

### 主标签

- `interface.displayName` 去除首尾空白后非空时作为主标签；否则回退 canonical `name`。
- 主标签是候选行中视觉权重最高的文本。
- 长主标签必须在候选行宽度内闭合，不得扩大菜单或 document 宽度。

### canonical name

- canonical name 与主标签的可见文本不同时，显示 `$canonical-name`。
- 两者相同时不重复显示，避免把相同身份写两遍。
- canonical name 仍参与查询匹配和稳定排序；是否展示不改变查询或选择语义。

### description

- description 仍按现有优先级选择 `interface.shortDescription`、`shortDescription`、`description`。
- 非空 description 最多显示一行，超出部分截断；不得通过扩大候选高度显示更多内容。
- 空 description 不生成占位行。

### canonical name 碰撞

碰撞判断只服务展示，不改变候选集合或内部 identity。两个候选的 canonical name 相同且 canonical path 不同时，构成 canonical name 碰撞；主标签、description 或 scope 是否相同不参与碰撞判断。

当前真实 catalog 中，项目 skill 的主标签回退为 `code-review`，用户 skill 的主标签为 `Code Review`，两者 canonical name 均为 `code-review` 且 canonical path 不同。因此即使主标签已经不同，这两项仍属于同一碰撞组，并各自显示 scope 与最短唯一父路径。

碰撞组中的每个候选显示：

- 由权威 `scope` 机械派生的 scope label；
- 在该碰撞组内足以区分候选的最短唯一父路径。

最短唯一父路径沿用现有 `shortestUniqueParentPath` 语义：从最短父目录后缀开始，只有仍无法区分时才逐级扩展。它不包含末尾 `SKILL.md` 文件名；除非候选的父目录本身直到根部都相同，否则不显示完整绝对父路径。

path 只在碰撞组内出现。canonical name 唯一的候选以及同一 canonical path 的重复输入均不显示 path；主标签不同不能单独免除 path 消歧。

## HeroUI 组合与视觉状态

### 组件边界

- 面板外壳继续使用 HeroUI `Surface variant="secondary"`。
- 滚动区继续使用 HeroUI `ScrollShadow`，保留可见细滚动条和当前最大高度约束。
- loading、partial error、total error、retry 与 empty result 延续现有 HeroUI feedback/button 组合。
- 原生 `ul` 使用 `listboxVariants({ variant: "default" })`。
- 原生 `li` 使用 `listboxItemVariants({ variant: "default" }).item()`。
- 不使用 HeroUI `ListBox`、`ListBox.Item` 或 trigger-driven `Popover`，因为它们会改变 Lexical focus/selection owner。

### 状态优先级

| 状态 | 视觉语义 | 约束 |
| --- | --- | --- |
| default | HeroUI listbox item 基础样式 | 不增加本地左边框或 ring。 |
| pointer hover | HeroUI `bg-default` 等价语义 | 只表示 pointer 所在行，不改变 active 或选择目标。 |
| Lexical active | `accent-soft` 背景与匹配前景语义 | 必须明显强于 hover，并继续对应 `aria-selected="true"`。 |
| active + hover | active 优先 | pointer 位于 active 行时不得退化成较弱 hover。 |
| pressed | HeroUI item pressed 语义 | 保留 reduced-motion；不得移动 editor focus。 |

移除当前 active 左侧强调边框与 hover ring。pointer hover 可以由 HeroUI 原生 `:hover` 表达，不再为了底部 preview 维护独立的 React hover 文本 owner。

候选 `li` 不持有真实 DOM focus，因此不得伪造 `data-focus-visible="true"`。keyboard 导航通过 combobox 的 `aria-activedescendant` 和清楚的 active 行状态表达。

## 交互与可访问性

以下契约保持不变：

- editor 保持 `role="combobox"`、`aria-haspopup="listbox"`、`aria-autocomplete="list"` 和真实 DOM focus；
- `aria-controls`、`aria-expanded`、`aria-activedescendant`、每实例唯一 menu/option ID 保持同步；
- 候选继续使用 `role="option"` 与 `aria-selected`；
- Arrow 键只改变 Lexical active；Enter/Tab 接受 active；Escape 关闭；IME 约束不变；
- pointer/touch 选择继续阻止焦点离开 editor，并执行与键盘相同的 replacement command；
- active 变化继续使用 `scrollIntoView({ block: "nearest" })`；pointer hover 不改变 active，也不触发滚动回跳；
- loading、error 与 empty 状态继续使用 live status 语义。

随底部详情区删除：

- option 上只为隐藏 path 服务的 `aria-describedby`；
- 隐藏的 active path description；
- hover detail preview 与其状态回退逻辑。

碰撞候选的 scope 与最短唯一父路径是该 option 的稳定可见文本，因此同时进入其 accessible name；键盘用户不依赖 hover 即可获知消歧信息。

## 响应式与几何边界

本文不改变既有菜单几何 owner：

- 菜单继续与当前 Composer 等宽，并保持当前 above/below placement 契约；
- 最大高度、内部滚动、`ScrollShadow`、drawer host 边界和 visual viewport 闭合保持不变；
- path 只作为碰撞候选的行内次要文本参与自然换行或断行，不新增固定底部区域；
- 长名称、canonical name、description 和最短唯一父路径均不得产生横向 overflow；
- 窄屏不切换为 Modal、Drawer 或 bottom sheet。

## 权威来源与数据边界

- `SkillMetadata` 仍是候选 name、description、path 和 scope 的权威来源。
- `SkillQueryCandidate` 继续通过 TypeScript 机械 `Pick` 依赖生成协议类型，不新增 consumer-owned wire mirror。
- `name + path` 继续作为选择与提交身份；path 继续作为 option key、稳定排序 tie-break、`SkillNode` 和结构化提交载荷的一部分。
- 最短唯一父路径是 GUI 从权威 path 机械派生的展示值，不成为新的 identity、协议字段或持久状态。
- 不修改 Rust、app-server v2 wire shape、schema 或生成 TypeScript 协议。

## 验证边界

后续计划必须覆盖以下稳定产品性质：

- 普通候选不显示 scope 或 path；友好名称与 canonical name 相同时不重复显示 canonical name。
- 友好名称与 canonical name 不同时显示 `$canonical-name`。
- canonical name 相同且 canonical path 不同时，每个碰撞候选显示 scope 与最短唯一父路径；不显示完整 `SKILL.md` path。
- 同展示名但 canonical name 不同的候选不构成碰撞，不额外显示 path；主标签不同但 canonical name 相同的候选仍显示 path。
- 面板不存在底部详情区、相关 Separator、隐藏 path description 或 hover preview。
- pointer hover 不改变 keyboard active、Enter 选择目标或 scroll position；active + hover 仍表现为 active。
- HeroUI item 圆角、hover、pressed 与 reduced-motion 生效；Lexical active 有清楚且独立的语义 token 反馈。
- 长文本、碰撞 path、20 项列表、窄屏和 drawer 内均无横向 overflow，内部滚动与现有几何边界不回退。
- 菜单 ARIA、键盘、pointer/touch、IME、loading、error、retry 与 empty 状态不回退。

由于改动影响可见布局、hover/active 状态、滚动与 focus flow，自动测试不能替代真实 GUI 验收。实现完成后必须在真实 GUI 中覆盖 keyboard active、pointer hover、active + hover、滚动、窄屏、dark mode、drawer、focus-visible 与碰撞候选；未完成时必须标记“真实 GUI 未验收”。

## 范围

本设计包含：

- skill typeahead 候选行的 HeroUI styles 组合；
- 候选信息渐进披露；
- canonical name 碰撞与最短唯一父路径展示；
- 底部详情区和 hover preview 的删除；
- 直接受影响的 ARIA 与前端验证边界。

## 非目标

- 修改 Rust、app-server 协议、skill discovery、catalog owner、匹配算法、排序规则或 20 项上限；
- 按 name、display name 或 scope 折叠不同 canonical path 的合法候选；
- 删除或改变内部 canonical path identity；
- 直接替换为 HeroUI `ListBox` 并改变 focus/selection owner；
- 修改 Composer 外壳、菜单定位、placement、viewport 几何或队列/提交行为；
- 展示完整 canonical path、为唯一候选常驻显示来源，或恢复独立底部详情区；
- 编写实施计划或开始实现。

## 设计完成标准

- 候选面板在保留 Lexical 交互契约的同时复用 HeroUI listbox 基础视觉语言。
- 普通候选信息精简，只有 canonical name 相同且 canonical path 不同的碰撞候选显示稳定的行内最短唯一父路径。
- 底部 path 详情区及其 hover/active 文本切换被完整移除。
- 内部 `name + path` identity、排序、选择和提交语义不变。
- 本文所列响应式、可访问性与真实 GUI 验收边界进入后续计划。

本文仅完成设计落盘；尚未编写或确认实施计划，也未开始实现。
