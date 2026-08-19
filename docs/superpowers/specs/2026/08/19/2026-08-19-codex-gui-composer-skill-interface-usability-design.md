# Codex GUI Composer 与 Skill 候选界面可用性设计

状态：已确认

日期：2026-08-19

## 唯一主目标

重新设计 Codex GUI 的 Composer 与 `$skill` 候选界面，使其在桌面和窄屏下都达到布局闭合、清晰可读、可操作、焦点明确且具备基本审美的人类可用标准，同时保留结构化 skill 输入能力。

## 文档关系

本文是
`2026-08-19-codex-gui-skill-input-completion-design.md` 的界面可用性修订。
两者冲突时，本文只在 Composer 外观、候选菜单布局、响应式几何和对应界面验收方面优先；原设计中的 Lexical 文档模型、`SkillNode` identity、catalog、协议、队列、IME、剪贴板和提交语义保持不变。

诊断证据记录在：

- `docs/superpowers/research/2026/08/19/2026-08-19-codex-gui-skill-typeahead-layout-regression.md`

## 为什么需要修订

当前实现存在两个独立根因，不能用一次 CSS 微调混为一谈：

1. Lexical 创建的 `role="listbox"` anchor 只有 `$` query Range 的约
   `9.77×19px`，实际 `320×290px` 左右的菜单从该容器向外溢出。默认翻转逻辑只计算 contenteditable root 内的上方空间，导致底部 Composer 中的菜单仍向下展开、越出 viewport 并增加 document 高度；anchor 还没有能覆盖 sticky Composer `z-10` 的层级。
2. HeroUI `TextArea` 被 Lexical `ContentEditable` 替换时，只迁移了基础尺寸和 padding，没有迁移 field 的背景、边框、阴影、hover、focus-visible、disabled 和 placeholder 盒模型。DOM focus 存在，但界面没有可见 focus 反馈。

该问题在 `400×876` 和 `1440×900` 均可复现，不是单个移动端断点，也不是候选 description、过滤逻辑或 HeroUI `Surface` 自身造成的。

## 已确认的产品决策

本次设计共完成 7 项实质决策：

1. 候选菜单与 Composer 等宽，固定显示在 Composer 上方。
2. 候选项采用分层布局：第一层突出名称与 `$skill-id`，第二层显示说明；说明可以换行，不强制单行。
3. 默认显示简短来源；重名时补最短唯一父路径；完整来源和路径可由 hover 或键盘 active candidate 查看。
4. 菜单使用中等自适应高度，最高约 `40vh` 且不超过 `360px`；更多候选在菜单内部滚动。
5. Composer 编辑区默认约 3 行，自动增长至约 8 行或 `30vh`，达到上限后内部滚动，操作栏保持固定。
6. 编辑区与操作栏共用一个统一 Composer 外壳，由整个外壳承担普通、hover、focus-visible 和 disabled 状态。
7. 当前候选整行高亮，hover 反馈弱于键盘 active 状态；菜单底部预留详情区，显示当前候选的完整来源和路径，候选行本身不展开。

## 界面结构

```text
┌──────────────────── 与 Composer 等宽的候选菜单 ────────────────────┐
│  Skill 名称   $skill-id                              简短来源      │
│  最多两行的说明；允许自然换行                                      │
│────────────────────────────────────────────────────────────────────│
│  Skill 名称   $skill-id                              简短来源      │
│  说明                                                              │
│                                                                    │
│  ……候选列表在此区域内部滚动……                                    │
├──────────────────── 当前候选详情 ──────────────────────────────────┤
│  完整来源 · /canonical/skill/path                                  │
└────────────────────────────────────────────────────────────────────┘

┌──────────────────── 统一 Composer 外壳 ────────────────────────────┐
│  可自动增长的 Lexical 编辑区                                       │
│                                                                    │
│  左侧操作                                  状态 / 停止 / 发送      │
└────────────────────────────────────────────────────────────────────┘
```

候选菜单与 Composer 是两个视觉 Surface，但属于同一交互组合：使用一致的圆角、边框、阴影层级和语义颜色，不做逐像素复制，也不在 Composer 内再嵌套第二个完整输入框边框。

## 候选菜单几何契约

### 单一定位 owner

菜单必须有一个同时掌握以下几何事实的定位 owner：

- Composer 外壳的实际矩形；
- visual viewport 的 offset、宽度和高度；
- 菜单自身的实际宽高；
- 页面滚动和 resize；
- sticky Composer 与其他 overlay 的 stacking 层级。

Lexical 仍可提供 query、active option 和键盘 menu primitive，但 caret-sized anchor 不再拥有可见菜单的尺寸和碰撞决策。不得依赖子菜单从小 anchor 的 `overflow: visible` 向外绘制。

### 位置与尺寸

- 菜单左右边界与 Composer 外壳对齐，不按 caret 水平位置改变宽度。
- 菜单优先放在 Composer 上方，二者之间使用项目语义 spacing token 保持清楚但紧凑的间隔。
- 菜单最大高度为 `min(40vh, 360px, Composer 上方实际可用高度)`。
- 正常空间下至少完整显示约 3 个候选；空间不足时缩小列表 viewport，而不是把菜单移出 visual viewport。
- 打开、过滤、滚动或关闭菜单都不得增加 `documentElement.scrollHeight` 或 `scrollWidth`。
- 菜单的可见矩形必须完整位于 visual viewport 内，并高于 sticky Composer 的 stacking 层级。
- 窄屏、软键盘和 visual viewport resize 时重新计算可用空间；不通过滚动整个 document 来迁就菜单。

## 候选项信息层级

### 主体

每个候选项保持稳定行高和相同信息层级：

- 第一层：友好展示名为主标签，`$canonical-name` 为次标签，简短来源在行尾弱化显示。
- 第二层：description 最多显示两行，允许自然换行；超出部分截断，不允许长文本撑破菜单宽度。
- 没有 description 时不制造空白说明行，候选仍保持足够的点击和触摸目标高度。
- 名称、ID、来源和说明均使用语义文字颜色；不得把次要信息做成低对比度到不可读。

候选项不要求单行。不得为了视觉紧凑把名称、ID、说明和来源压成一个连续文本流。

### 重名与路径

- 普通候选显示由权威 metadata 派生的简短来源。
- 同展示名、不同 canonical path 时，在候选行补足能够区分它们的最短唯一父路径。
- 完整来源和 canonical path 显示在菜单底部详情区。
- 详情区响应鼠标 hover candidate 或键盘 active candidate；鼠标离开后回到键盘 active candidate，不出现两个互相冲突的详情 owner。
- 长路径使用 `overflow-wrap: anywhere` 等价行为保持横向闭合；路径增长只能减少候选列表的可滚动高度，不得增加菜单总高度或页面宽度。

### 状态反馈

- 键盘 active candidate 使用清楚的整行背景、前景或边界反馈，并通过 `aria-activedescendant` 公布。
- pointer hover 反馈比 active 状态弱，不能让用户误判当前 Enter 会选择哪一项。
- 已选择、invalid、loading、partial error、total error 和 empty result 延续原结构化输入设计的语义，不只依赖颜色表达。
- 列表滚动时 active candidate 必须保持在列表可视区域内；不得滚动 document 追随 active option。

## Composer 外壳与编辑区

### 统一外壳

Composer 使用单一 HeroUI field/surface seam 包含编辑区和操作栏：

- 普通态具有可辨识但克制的 field 背景、边框、圆角和阴影。
- pointer hover 使用 HeroUI field hover 语义，不用硬编码颜色。
- 键盘 focus-visible 时，整个 Composer 外壳显示清楚的 ring、边框或等价语义反馈；不能只证明 contenteditable 拥有 DOM focus。
- 鼠标点击产生的 focus 不必使用与键盘同强度的 ring，但输入边界仍应稳定。
- disabled/read-only 同时改变语义和视觉状态，包括 opacity、cursor、可交互性与可访问属性；不能只设置 `contenteditable="false"`。
- invalid skill token 的局部 danger 状态与 Composer field 的整体 focus/disabled 状态相互独立。

Lexical 继续是唯一编辑内核。不得恢复隐藏 `TextArea`、双写草稿，或用两个输入控件拼出原样式。

### 编辑区增长

- 空编辑器和短消息默认提供约 3 行文本的编辑高度。
- 编辑区随内容自动增长，最高达到约 8 行或 `30vh`，取更小值。
- 达到上限后只滚动编辑区；操作栏固定在 Composer 底部，不随文本滚走。
- placeholder 与实际文本共享同一个局部定位和 padding 坐标系，字体、字号、行高和起始位置一致。
- 长的不可分割文本必须在编辑区内断行或滚动闭合，不得产生页面横向滚动。

## 交互与可访问性

- 输入 `$` 后，editor 保持真实 DOM focus；菜单不会把 focus 移入 portal。
- Arrow 键更新 active candidate；Enter/Tab 接受、Escape 关闭等既有语义保持不变，IME 约束不变。
- 鼠标和触摸候选具有足够的目标面积；pointer 选择后 focus 返回或保留在 editor。
- `combobox`、`listbox`、`option`、`aria-controls`、`aria-expanded`、`aria-activedescendant` 和 live status 关系保持完整。
- 底部详情区与当前 active option 建立可访问关联；键盘用户不需要 hover 才能得知完整来源和路径。
- focus-visible、active、hover、disabled 和 error 的差异必须在高对比和非颜色线索下仍可理解。

## 基本审美约束

- 使用 HeroUI v3 的 surface、field、separator、accent、danger 和 focus 语义 token；不硬编码白色、品牌色或截图中的具体色值。
- 菜单与 Composer 的宽度、圆角、边界和阴影形成同一视觉系统，但通过间隔和 elevation 区分两个 Surface。
- 名称是最强视觉信息，`$skill-id` 次之，description 与来源再次之；路径只出现在详情区，不与名称争夺注意力。
- 不使用多余标题栏、粗重分隔线或每项独立 Card。候选列表保持连续、可快速扫描。
- 动效只用于必要的打开、关闭或状态过渡，并服从 reduced-motion；不得用位移动画掩盖定位跳动。

## 响应式行为

桌面与窄屏使用同一拓扑，不切换为 Drawer、Modal 或 bottom sheet：

- 菜单始终与当前 Composer 等宽并位于其上方。
- 宽度变窄时，第一层信息允许合理收缩，description 最多两行；来源和最短唯一父路径不得挤压主名称到不可读。
- `400×876` 是必须覆盖的窄屏基线，`1440×900` 是桌面基线。
- 两种基线都必须满足 visual viewport 闭合、document 尺寸不增长、内部滚动、层级正确和可见 focus。

## 验收边界

后续计划必须把以下稳定产品性质转化为 Browser Mode 验证，而不是只断言 class 或 DOM 存在：

- 菜单与 Composer 左右边界对齐，菜单位于 Composer 上方。
- 菜单实际可见 Surface 和 `role="listbox"` 的几何 owner 一致，不存在 caret-sized 外壳承载大菜单的 overflow。
- 菜单完整位于 visual viewport，打开前后 document 的 scroll width/height 不增长。
- 候选超过容量后只滚动列表，Arrow 导航后的 active candidate 仍可见。
- 多行说明、重名 skill、超长名称和不可分割长路径均不造成横向溢出。
- blur、pointer focus、keyboard focus-visible 和 disabled 的 computed visual state 可区分。
- placeholder 与首个输入字符位置一致，编辑区增长到上限后操作栏不移动。
- 鼠标、触摸和键盘均可完成打开、浏览、查看详情、选择和关闭。

测试不应锁定具体 padding、gap、颜色、阴影数值或“候选必须单行”等主观实现细节；应锁定上述直接决定人类可用性的几何和状态契约。

## 非目标

- 不改变 skill catalog、匹配、排序、20 项上限、加载错误或 retry 的既有产品语义。
- 不改变 `SkillNode`、canonical `name + path`、clipboard、queue、recovery 或 `turn/start` 协议。
- 不引入通用富文本、Markdown 工具栏或新的输入命令体系。
- 不逐像素复制非开源 Codex App，也不规定候选项必须单行。
- 不以新增兼容层、隐藏溢出、扩大 document 或只提高 `z-index` 代替根因修复。
- 本设计不包含实施任务拆分；精确文件和提交边界属于设计确认后的计划阶段。

## 设计确认门禁

本文已按全部 7 项已完成决策落盘并由用户确认。当前允许进入计划阶段；在对应计划落盘并确认前，不得开始实现。
