# Codex GUI 导航菜单 HeroUI 对齐设计

## 状态

- 设计状态：已确认
- 日期：2026-09-04
- 设计范围：左侧导航 Drawer 内的“当前任务”和“历史记录”菜单项
- HeroUI 基线：`@heroui/react` 3.2.4、`@heroui/styles` 3.2.4
- 当前代码基线：`1374e6a8851403a86d9fa2fd12c809d151370f90`

本文只确认设计，不是实施计划，也不授权修改代码、运行测试或 GUI 验收、创建 worktree、
stage、commit 或 remote 操作。后续开始代码实现时，必须在独立 worktree 中进行；创建该
worktree 的精确动作、路径和分支由后续计划与授权另行确定。

## 背景与当前事实

当前全局导航由 `AppShellTopBar` 中的 HeroUI `Drawer` 承载。Drawer 内是带可访问名称的
`nav`，两个目的地分别使用 HeroUI `Button`。当前按钮沿用默认的内容宽度、大圆角和填充
背景，因此呈现为彼此分离的胶囊；菜单项只有图标与单行标题，没有说明文字。

现有行为合同包括：

- 当前页面通过 `aria-current="page"` 表达；
- “当前任务”在没有 active thread id 时禁用；
- 选择目的地后关闭 Drawer，并使用既有 canonical route；
- Escape 关闭 Drawer，焦点返回菜单触发器；
- “历史记录”的当前态同时覆盖历史列表与历史详情页面。

本地 HeroUI 3.2.4 的 `Dropdown — With descriptions` 示例提供了“前导视觉、标题、说明”
三部分的紧凑整行布局。`With section-level selection` 示例则展示了固定前导选择指示列，
其中单选圆点由 MenuItem 的 selection state 驱动。

这两个示例只能作为布局和视觉状态依据，不能改变导航语义：`Dropdown` 面向 actions 或
options，section-level selection 表达同一菜单分区内的单选或多选；当前对象是页面导航，
不是一份独立的选择值。

## 目标

1. 把两个胶囊按钮改为占满导航内容宽度的紧凑菜单行。
2. 为每个目的地同时显示标题和一行静态功能说明。
3. 以中性圆点清晰表达当前页面，并把持续选中、hover、focus 和 disabled 四种状态分开。
4. 保留现有 Drawer、路由、可访问导航、禁用、关闭和焦点恢复合同。
5. 使用 HeroUI v3 组件和语义 token，不复制 Dropdown 的错误角色或另建选择状态。

## 非目标

- 不把 Drawer 替换成 Dropdown 或 Popover。
- 不把导航拆成多个 `Dropdown.Section`，不引入 `selectionMode`、`selectedKeys` 或
  `onSelectionChange`。
- 不显示任务标题、历史数量、快捷键或其他动态说明数据。
- 不修改页面路由、active thread 所有权、Drawer 生命周期或顶部栏菜单触发器。
- 不增加蓝色选中背景、左侧功能图标，或同时叠加圆点与第二种持续选中信号。
- 不把 headless 浏览器结果表述为可见桌面验收。

## 菜单项设计

### 组件与结构

继续使用 HeroUI `Drawer` compound components 和语义 `nav`。每个目的地继续使用 HeroUI
`Button` 处理按压、焦点与禁用行为，采用 `ghost` 语义 variant 和 full-width 布局；按钮
内部改为三列：

1. 固定宽度的前导指示列；
2. 垂直排列的标题与说明；
3. 不设置尾随快捷键或其他装饰。

按钮需要覆盖默认的固定高度与单行文本限制，使两行内容自然撑高；圆角、间距、字号和
padding 参考本地 HeroUI `menu-item` / `description` 样式，而不复制 Dropdown 的 Popover
容器尺寸。

不得在 Drawer 外单独使用 `Dropdown.Item` 或 `Dropdown.ItemIndicator`。
`Dropdown.ItemIndicator` 依赖 MenuItem context，脱离该上下文既不成立，也会诱导错误的
selection owner。前导圆点由导航视图根据当前 route 派生，只是 `aria-hidden` 的视觉标记。

### 文案

| 目的地 | 标题 | 说明 |
| --- | --- | --- |
| 当前任务 | 当前任务 | 打开当前任务 |
| 历史记录 | 历史记录 | 浏览历史任务 |

说明保持静态、简短并使用 muted 文本 token。它不读取 task name、preview、数量或运行状态。

### 状态

- 默认：透明背景，标题使用正常前景色，说明使用 muted 前景色。
- 当前页面：固定前导列显示中性圆点；不增加持续背景或强调色。
- 非当前页面：前导列保留相同宽度但不显示圆点，文字不会横向移动。
- Hover：使用 HeroUI `ghost` Button 的 `bg-default` hover 反馈；hover 不改变当前页面归属。
- Focus visible：使用 HeroUI 标准 `status-focused` ring，与圆点状态独立。
- Pressed：沿用 HeroUI Button 的按压反馈和 reduced-motion 行为。
- Disabled：没有 active thread id 时，“当前任务”继续禁用并使用 HeroUI `status-disabled`；
  禁用不会改变 route 派生的当前页面语义。

### 可访问性与交互

- 保留 `nav` 的既有可访问名称和每个目的地的 Button 角色。
- 当前页面只由 `aria-current="page"` 表达，不增加 `aria-selected`、`aria-checked` 或 radio
  语义。
- 圆点不进入可访问树；标题继续作为按钮名称，说明通过描述关系提供，不把标题与说明
  粗暴拼接成不稳定的按钮名称。
- 保留既有键盘、Escape、焦点返回、禁用和关闭 Drawer 行为。
- 保留 canonical route 导航，不增加本地 selection state，也不让视觉状态先于 route 更新。

## Owner 与数据边界

route target 继续是当前页面的唯一权威来源：

- current-task route 派生“当前任务”的圆点与 `aria-current`；
- history list 和 history detail route 派生“历史记录”的圆点与 `aria-current`；
- active thread id 只决定“当前任务”是否可用，不成为另一份选中状态。

组件不得保存视觉选中值，不得在按压时乐观切换圆点，也不得添加 route 与 selection 的同步
effect。导航成功后由既有路由状态自然重渲染当前项。

## 后续验收边界

后续计划应覆盖：

- Level 1：Browser Mode 验证标题、说明、`aria-current`、禁用态、导航与 Drawer 关闭/焦点
  恢复；增加稳定的结构或状态断言，避免对无产品意义的像素细节做脆弱锁定。
- Level 2：在真实 Codex runtime 上以 headless 方式验证 Drawer 中两行菜单项的宽度、换行、
  hover、focus、当前圆点和窄视口布局。
- Level 3：本设计不依赖系统窗口、桌面焦点、IME 或 DevTools，不适用可见桌面验收。

实现与验证开始前，必须先单独形成并确认实施计划。代码修改必须在独立 worktree 中执行；
若后续计划落盘，则相关设计与计划文档还必须在实施前形成独立本地 Git 提交。
