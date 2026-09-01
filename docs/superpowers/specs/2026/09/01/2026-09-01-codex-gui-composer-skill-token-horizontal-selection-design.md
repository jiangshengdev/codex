# Codex GUI Composer Skill token 水平选择闭环设计

## 状态

- 设计状态：已确认
- 日期：2026-09-01
- 设计范围：Skill token 的无修饰键水平进入与退出
- Lexical 基线：`0.49.0`
- 当前代码基线：`40add5ed6`

本文只确认设计，不是实施计划，也不授权修改代码、补测试、运行浏览器、
执行 GUI 验收、stage、commit 或 remote 操作。

## 与既有设计的关系

本文是
[Codex GUI Composer 回归 Lexical 0.49 官方能力设计](./2026-09-01-codex-gui-composer-official-lexical-capability-cleanup-design.md)
之后的窄增量设计。

既有设计接受了 Lexical 0.49 无法保证方向键退出 chip 的取舍。本文只替代其中以下边界：

- “不保证左右方向键退出 chip”；
- “项目不得为水平退出注册任何方向键 owner”；
- 与上述两点直接对应的测试非目标。

既有设计的其余结论继续有效，尤其是：普通字符导航继续由 Lexical 拥有；不恢复自研四方向
DOM geometry；不接管垂直视觉行；不增加 DOM selection、focus、scroll、双 RAF 或浏览器特判
修正层。

本文依据：

- [Composer 输入框光标控制任务拆分调研](../../../../research/2026/09/01/2026-09-01-composer-caret-control-task-splitting.md)

## 当前事实

当前两个方向并不对称：

- 水平进入已有 Lexical 0.49 的生产 owner。相邻 collapsed `RangeSelection` 经
  `PlainTextPlugin` 的 decorator-aware character move，可以转换成只含目标
  `SkillNode` 的 `NodeSelection`。
- 水平退出没有生产 owner。selection 已经是 `NodeSelection` 时，Lexical 0.49 的
  PlainText 左右 handler 不接管；当前 Composer 也没有对应 handler。
- `selectPrevious()` 与 `selectNext(0, 0)` 提供模型级逻辑边界 primitive，但不提供
  视觉行或 DOM geometry 算法。

因此本设计不是建立一套对称的自研进入/退出引擎：进入继续由 Lexical 拥有；Composer 只为
Lexical 0.49 缺失的单 Skill `NodeSelection` 水平退出增加窄 adapter。

## 目标

1. 形成 `RangeSelection → NodeSelection → token 外部 collapsed RangeSelection` 的
   完整水平选择闭环。
2. 保留 Lexical 对普通文本、decorator-aware character move、RTL 与 selection reconcile
   的权威所有权。
3. 让水平退出依赖 Lexical editor state、公开 selection primitive，以及父元素最终生效的
   computed writing direction；不读取 DOM selection、caret rect 或布局 geometry。
4. 对相邻文本、连续 token、only-token 和 LTR/RTL 使用同一状态转换合同。
5. 不改变 Composer 内容、structured payload、snapshot 或 history；只在 token Trigger
   持有 DOM focus 且水平退出成功时，把 focus 交还 editor root。

## 非目标

- 不设计或实现 `Shift+Arrow` 的扩选、收缩或 anchor/focus 语义。
- 不接管带 `Shift`、`Alt`、`Meta` 或 `Ctrl` 的水平按键。
- 不处理 ArrowUp/ArrowDown、显式换行、soft-wrap 或视觉列保持。
- 不恢复 `486e069ee` 删除的自研四方向 DOM geometry 层。
- 不修改点击、Enter、Space、Backspace、Delete、输入替换、clipboard、Undo/Redo、IME、
  typeahead 或 draft restore 产品合同。
- 不把 WebKit 自动化结果视为真实 Safari 可见桌面验收。
- 不迁移 `PlainTextPlugin`，不回移新版 Lexical 补丁，也不复制 Equation/DateTime 实现。

## 统一行为合同

### 水平进入

当 editor 可编辑、selection 是紧邻 `SkillNode` 的 collapsed `RangeSelection`，且用户按下
无修饰键的视觉 `ArrowLeft` 或 `ArrowRight` 朝向该 token 时：

- 继续使用 Lexical 0.49 的 PlainText character-selection 路径；
- selection 变为只包含目标 `SkillNode` 的 `NodeSelection`；
- token 显示既有选中状态，DOM 插入 caret 不再作为当前 selection 显示；
- editor focus、文档内容、Composer snapshot 与 structured payload 保持不变。

Composer 不为进入路径增加第二个方向键算法。若当前行为基线与上述合同不符，必须回到设计，
不能自动改为自研进入实现或恢复旧 geometry 层。

### 水平退出

当 editor 可编辑、selection 恰好是只含一个 `SkillNode` 的 `NodeSelection`，且用户按下
无修饰键的视觉 `ArrowLeft` 或 `ArrowRight` 时：

- Composer 的窄 adapter 接管该次按键；
- selection 转换为该视觉方向对应的 token 外部 collapsed `RangeSelection`；
- token 取消既有选中状态，DOM 插入 caret 随 Lexical reconcile 恢复；
- editor root 已持有 focus 时保持不变；token Trigger 持有 focus 时，在 selection 转换成功后
  把 DOM focus 交还 editor root；
- 文档内容、Composer snapshot 与 structured payload 保持不变；
- handler 只在完成上述转换时消费事件并阻止浏览器默认处理。

如果 selection 不是单个 `SkillNode` 的 `NodeSelection`、editor 不可编辑，或按键带任一修饰键，
该 adapter 不接管，继续服从既有 Lexical/浏览器路径。

退出语义与 NodeSelection 的来源无关。方向键进入、点击、Enter 或 Space 激活后得到的同一种
单 Skill `NodeSelection` 使用同一退出合同；不得新增“进入来源”状态或第二份 selection owner。
其中 Enter/Space 激活会让 token Trigger 继续持有 DOM focus；水平退出 adapter 必须在完成
Lexical selection 转换后执行一次窄 focus handoff，使后续输入回到 editor root。

## 方向与边界语义

用户合同使用视觉方向：`ArrowLeft` 向视觉左侧退出，`ArrowRight` 向视觉右侧退出。
LTR/RTL 到逻辑 previous/next 的映射必须与 Lexical 0.49 的水平 character move 语义一致，
允许只读父元素最终生效的 computed `direction`；不得用文本内容、`ElementNode.getDirection()`、
DOMRect 或坐标猜测浏览器方向。

模型级落点如下：

- token 外侧是 TextNode 时，落到该文本紧邻 token 的 start/end offset；
- token 位于段落开头或末尾且该侧没有文本 sibling 时，落到 parent 对应 element offset；
- only-token 段落分别落到 token 前后的 parent element point；
- 相邻两个 token 之间先落到两者之间的 element point，不在同一次退出中直接选择另一个 token；
- 用户继续沿同一视觉方向按键时，再由 Lexical 的进入路径选择相邻 token，保持每个原子 token
  都有可观察的“选中一步”。

这些落点只描述 Lexical tree 中的逻辑边界，不承诺跨视觉行列保持，也不以 caret rect 作为
生产算法输入。

## Owner 边界

### Lexical 0.49 继续拥有

- DOM keydown 到 Lexical command 的分发；
- 普通文本中的水平 character navigation；
- collapsed `RangeSelection` 遇到 keyboard-selectable inline `DecoratorNode` 时的进入；
- `RangeSelection`、`NodeSelection`、逻辑 point 与 DOM selection reconcile；
- LTR/RTL 的通用水平 character direction 语义。

### Composer 新增的窄 owner

- 识别“单个 `SkillNode` 的 `NodeSelection` + 无修饰键水平 Arrow”；
- 将视觉方向映射到 Lexical 的逻辑前/后边界 primitive；
- 成功退出时，如果当前 active element 是所选 token 内的 Trigger，把 focus 交还 editor root；
- 仅在转换成功时消费该次 command。

该 owner 不保存 selection，不读取 DOM selection 或 layout geometry，不恢复 scroll，
只允许为 LTR/RTL 映射读取父元素的 computed `direction`；不异步修正 Lexical reconcile，
也不扩张到其他 `DecoratorNode`。focus handoff 只服务 token Trigger 发起的这一次成功水平退出，
不得扩张成 mount、selectionchange、RAF、浏览器特判或通用 reconcile 后修正层。

## 切片边界

### 切片 1：水平进入合同

本切片只确认并锁定 Lexical 0.49 已有的进入行为，不新增 Composer 进入算法。

完成标准：当前运行基线证明，从 token 两侧朝向 token 的无修饰键水平移动会得到单 Skill
`NodeSelection`，并同时保持 focus、文档内容、snapshot 与 structured payload。

若基线失败，本切片停止并返回设计，不自动进入切片 2 的实现。

### 切片 2：水平退出合同

本切片只增加单 Skill `NodeSelection` 的无修饰键水平退出 adapter，复用 Lexical 的逻辑
selection primitive。

完成标准：从来源无关的单 Skill `NodeSelection` 沿视觉左右方向退出到确定的 collapsed
`RangeSelection` 边界，且未引入第二份 selection 状态、DOM geometry 或其他方向键 owner。

切片 2 依赖切片 1 已证明进入合同成立；两个切片不得合并成通用四方向实现。

## 验收边界

后续计划应分别验证 Lexical selection 与用户可见结果，不能用其中一个替代另一个：

- 直接区分 collapsed `RangeSelection`、单 Skill `NodeSelection` 及其 node key/offset；
- 观察 token 选中状态、DOM caret 显隐、editor focus 与内容不变；
- 分别覆盖 editor root、pointer click、Trigger Enter 与 Trigger Space 来源；Trigger 来源退出后
  editor root 必须重新持有 DOM focus，并能继续输入；
- 覆盖 LTR/RTL、token 两侧、邻接文本、连续 token 与 only-token；
- 证明带修饰键、非 Skill NodeSelection、多节点 NodeSelection、不可编辑 editor 不被新增路径接管；
- Level 1 使用当前 Browser Mode 的 Chromium、Firefox、WebKit 实例；
- Level 2 对真实 Codex Composer 的 headless 键盘与 focus 流程单独验收；
- 真实 Safari 与辅助技术属于后续独立切片，本设计不触发 Level 3 可见桌面验收。

测试不得恢复旧 geometry helper、用 DOM caret 断言冒充 Lexical selection 类型，或把 headless
WebKit 写成 Safari 已通过。

## 已确认取舍

- 本轮只处理无修饰键的 `ArrowLeft` / `ArrowRight`。
- `Shift+Arrow` 属于后续独立 selection-range 设计，不以 fallback 形式混入。
- 水平进入继续由 Lexical 独占，水平退出由 Composer 增加一个能力边界明确的窄 adapter。
- 连续 token 保持逐 token 两步体验：进入选中，退出到边界，再进入下一个 token。
- only-token 使用 Lexical parent element point，不增加隐藏 TextNode、占位字符或 DOM hack。
- Trigger Enter/Space 来源在成功退出后执行一次窄 focus handoff；其他来源不新增 focus 操作。

## 阶段边界

本文落盘后仍未进入计划或实现阶段。下一阶段必须单独编写并确认计划；执行已落盘设计与计划前，
相关工作文档必须先形成独立本地 Git 提交。
