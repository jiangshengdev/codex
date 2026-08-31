# Codex GUI Composer Skill Chip 四方向原子导航设计

日期：2026-08-31

状态：已确认

## 唯一主目标

设计 Composer 输入框中 skill chip 的统一四方向键盘导航，使其在显式换行和 CSS soft-wrap 的多行布局中表现为原子“超长字符”停靠点，并解决现有左右键跳过 chip、落点错误的问题，同时保留 plain-text 编辑模型和 chip 之外的浏览器原生 textarea 式行为。

## 设计依据与证据边界

本设计消费已有调查：[Composer skill token 四方向与跨视觉行导航调查](../../../research/2026/08/31/2026-08-31-composer-skill-token-up-down-navigation.md)。

已由源码确认：

- Composer 挂载 `PlainTextPlugin`，不是原生 `<textarea>`，但仍使用 Lexical `contenteditable` 并支持 inline `DecoratorNode`；
- `SkillNode` 是 inline、keyboard-selectable 的原子 `DecoratorNode`；
- `SkillEditingPlugin` 只为已选中 skill 注册左右退场，没有上下 handler；
- plain-text 的左右进入依赖 Lexical 通用 character movement，rich-text 的 decorator line navigation 排除 inline decorator；
- `NodeSelection` 不保存 caret x、进入方向或历史列，并会清空原生 DOM ranges；
- 现有左右 Browser 测试只覆盖同一行紧邻 Text node，没有覆盖显式换行、soft-wrap、窄容器或 caret/chip 几何。

用户已经报告多行下左右键可能直接跳过 chip 或落点错误。本轮没有运行浏览器复现，因此本文把它作为必须通过诊断闭合的运行时事实，不虚构具体浏览器分支或已验证 DOM 算法。

本文是设计，不是 implementation plan，不包含逐文件任务、命令、提交拓扑，也不授权修改 production 代码、测试、Git index 或提交。

## 已确认产品决策

本次设计共完成 3 项实质决策：

1. chip 之外完全保持浏览器原生 textarea 式行为。普通 caret 的原生目标命中 chip 时才激活整个 chip；目标落在普通字符、空白、行首、行尾或其他非 chip 位置时，skill 导航不得吸附、改写或强制移动到 chip 边界。
2. chip 已成为 `NodeSelection` 时采用两步原子停靠：`ArrowLeft` 与 `ArrowUp` 退到视觉左边界，`ArrowRight` 与 `ArrowDown` 退到视觉右边界，并在该边界结束本次按键；下一次按键再由普通 textarea 式行为继续移动。
3. 本设计只保证无修饰的 `ArrowLeft`、`ArrowRight`、`ArrowUp`、`ArrowDown`。`Shift`、`Option/Alt`、`Command/Ctrl` 与方向键的组合保持现状，明确排除在本次行为和验收范围之外。

## 行为模型

### “超长字符”的准确含义

chip 是文本流中的一个原子视觉区间和一个 selection stop，而不是包含多个可编辑字符的文本节点：

- caret 不能进入 Chip label 内部；
- 原生目标落在 chip 的视觉占位内时，整个 chip 成为唯一 `NodeSelection`；
- 一次无修饰方向键最多完成一个 stop；
- chip 外的位置继续由浏览器决定，不由项目建立另一套文本行、字形或空白布局模型；
- chip 的原子选择、整体删除、输入替换、clipboard、draft 和结构化提交语义保持不变。

“超长字符”不表示整行吸附。chip 只拥有自身视觉占位，不拥有同一视觉行中的其他文本、空白或超出 chip rect 的水平区域。

### 从普通 caret 出发

当当前 selection 是 collapsed `RangeSelection` 且用户按下无修饰方向键时：

1. 取得浏览器在没有 skill 专属拦截时原本会选择的目标；左右使用 character movement，使用上下使用 line movement。
2. 若原生目标命中一个可用、已挂载的 `SkillNode` 视觉占位，则建立仅包含该节点的 `NodeSelection`，保持 editor focus，调用 `preventDefault()` 并结束本次按键。
3. 若原生目标没有命中 skill，则返回未处理，不调用 `preventDefault()`，不写 Lexical selection，也不修正目标位置；浏览器继续执行原生移动。

这里的“命中”是原生目标与 chip 视觉占位的关系，不是以下替代定义：

- 文档顺序中下一个节点是 skill；
- 目标视觉行包含 skill；
- skill 是该行最近或唯一内容；
- caret x 距离 skill 小于某个人工阈值；
- 目标落在 chip 外时把 caret 吸附到左边界或右边界。

### 从已选中 chip 出发

当当前 selection 是只包含一个 `SkillNode` 的 `NodeSelection` 时：

| 按键 | 本次按键结果 |
|---|---|
| `ArrowLeft` | 折叠到 chip 的视觉左边界并停止 |
| `ArrowUp` | 折叠到 chip 的视觉左边界并停止 |
| `ArrowRight` | 折叠到 chip 的视觉右边界并停止 |
| `ArrowDown` | 折叠到 chip 的视觉右边界并停止 |

边界是视觉 left/right，不是固定的 logical previous/next。LTR 中视觉左通常对应 previous、视觉右通常对应 next；RTL 中 Implementation 必须依据实际 writing direction 做反向映射，不能让 logical document order 静默改变上述可见结果。

退出后必须形成有效的 collapsed `RangeSelection` 和对应 DOM caret，并保持 editor focus。不得在同一个 keydown 中继续跨到上一行或下一行，也不得保存或恢复 chip 内部的历史列。

### 不接管的 selection

以下情况不属于 skill 四方向导航的处理对象：

- 非 collapsed `RangeSelection`；
- 包含多个节点或非 SkillNode 的 `NodeSelection`；
- 任意修饰键组合；
- editor、root 或目标 skill 已卸载、替换或不可用；
- typeahead 菜单自己的 option 导航。

这些情况不得为了复用 handler 而被转换成新的 selection 语义。

## Plain-text 与 rich-text 边界

Composer 继续使用 `PlainTextPlugin`。

`RichTextPlugin` 不是本问题的完整方案：

- rich-text 的 `NodeSelection` 上下退场只提供 logical previous/next；
- rich-text 的 decorator line navigation 只识别非 inline block decorator，明确排除当前 inline `SkillNode`；
- 切换插件仍然需要 skill 专属视觉命中，同时会引入段落、格式、缩进和其他无关编辑命令。

因此本设计不通过改变编辑器内容模型来解决导航问题，也不引入 rich-text/plain-text 双路径或兼容 Adapter。

## Module、Seam 与 Interface

### Skill editing Module

现有 `SkillEditingPlugin` 继续是 skill selection 编辑行为的 owner。四方向导航与现有删除、输入替换共同位于这一 Module，避免把 selection 规则散落到 `SkillNode`、React Chip、typeahead 或 `ComposerEditor`。

该 Module 的外部 Interface 仍是 Lexical command registration。调用方只需知道命令是否被处理，不需要知道 DOM probing、writing direction、caret rect、node key 或 selection 转换细节。

Implementation 内部只允许形成三类导航结果：

- 激活一个 skill；
- 把已选中 skill 折叠到一个视觉边界；
- 交还浏览器原生处理。

不新增通用 decorator-navigation Module。当前只有 `SkillNode` 具备这组产品语义；抽取面向所有 decorator 的公开 Interface 会让调用方学习尚不存在的通用约束，形成浅 Module 和假想 seam。

### `SkillNode` Module

`SkillNode` 继续拥有 canonical identity、序列化、文本投影和 React decorator host。导航 Implementation 可以通过稳定的 `$isSkillNode()`、node key 和 editor DOM mapping 识别目标，但不得把 caret rect、历史 x、进入方向或浏览器状态写入节点、JSON、draft 或提交 payload。

### React presentation

`SelectedSkillToken` 只投影 Lexical `NodeSelection` 的选中视觉并提供既有 pointer/Tab 详情交互。它不注册 Composer 方向键，不维护第二套 selected key，也不负责把 DOM focus 转回 editor。

## 原生目标探测

### 设计要求

原生目标探测必须回答一个窄问题：如果项目不接管这次方向键，浏览器会把 caret 移到哪里；该目标是否命中 inline skill 的视觉占位。

探测必须满足：

- 对未命中 skill 的路径无可观察副作用；
- 探测后恢复原始 DOM selection，再由最终导航结果决定是否更新 Lexical selection；
- 支持显式 `LineBreakNode` 与 CSS soft-wrap；
- 使用实际 editor root、caret rect、chip rect 与 writing direction，不根据字符串长度或固定像素推导；
- 不把 `contenteditable=false` 导致的 native caret 跳过误判成“目标一定不在 chip”；
- 不使用整行吸附、最近节点、距离阈值、逻辑 sibling scan 或中心点作为静默 fallback。

Lexical rich-text 已有“保存 DOM selection → `Selection.modify(..., 'line')` 探测 → 检查目标 → 恢复”的 block decorator 参考，但它没有 inline chip 命中规则。本文只采用这一探测形状作为候选证据，不把 `Selection.modify()` 或某个 rect 算法冻结为已验证 Implementation。

### 关键验证门禁

在写 production 修复前，必须先通过诊断性 Browser 用例闭合以下事实：

1. 三种浏览器能否在不提交原生移动的情况下稳定取得 character/line 目标；
2. 目标落在普通文本、空白或 chip 占位时，DOM point、Lexical point 与视觉 rect 分别是什么；
3. `contenteditable=false` host、显式 `<br>` 和 soft-wrap 是否导致目标跳过或零高 caret rect；
4. 探测并恢复 DOM selection 是否会产生异步 `selectionchange`、focus 或 scroll 副作用；
5. RTL 中视觉边界与 logical previous/next 的实际映射。

如果诊断不能稳定区分“命中 chip”和“chip 外原生目标”，必须停止进入 implementation plan 并回到设计。不得用逻辑扫描、吸附、阈值、只支持 Chromium、放宽断言或保留现有错误作为 fallback。

## 多行与布局约束

设计同时覆盖：

- 显式 `LineBreakNode` 形成的多行；
- 窄容器和长文本形成的 CSS soft-wrap；
- chip 单独占据一行；
- chip 与普通文本位于同一视觉行；
- chip 因宽度变化跨到新行；
- 连续多个 chip；
- LTR 与 RTL。

响应式宽度、字体加载、缩放或 chip label 长度改变视觉布局后，下一次按键必须基于当前 DOM 几何重新判断。不得缓存 line index、rect 或由旧布局计算的目标。

## 验证设计

### 诊断性 Browser 红色复现

诊断阶段先证明现有实现的实际失败路径，不直接修改 production handler。每一步记录：

- Lexical selection 类型和 anchor/focus key、offset、type；
- 原生 `Selection` 的 anchor/focus、offset 和 `rangeCount`；
- 当前 caret rect、原生探测目标 rect、chip rect；
- chip 的 `data-selected`；
- `document.activeElement`；
- 是否发生 editor 或外层滚动。

诊断矩阵至少包含：

- 截图结构：上一行普通文本、中间独占一行的 chip、下一行普通文本；
- 同行 `text + chip + text`；
- only-chip；
- 显式换行与 soft-wrap；
- 窄容器长 chip；
- 连续两个 chip；
- 从四个方向分别进入和退出；
- Chromium、Firefox、WebKit。

诊断结果若支持本设计，再删除诊断载体并按项目流程重新建立正式回归测试；不得直接把诊断用例改名为正式测试。

### 正式行为覆盖

正式 Browser 回归必须证明：

- 原生目标命中 chip 时，四个无修饰方向键都能把它变成唯一 `NodeSelection`；
- 原生目标落在 chip 外的普通字符、空白、行首或行尾时，最终 caret 与无 skill 专属接管的原生结果一致；
- 已选中 chip 的 Left/Up 与 Right/Down 分别落到当前视觉左/右边界，且一次按键只完成一个 stop；
- 下一次方向键从边界继续使用原生行为；
- 多行、soft-wrap、LTR/RTL 和响应式几何不跳过 chip、不落入 Chip label；
- editor focus、`data-selected`、删除、输入替换、clipboard、undo/redo 和 typeahead 行为不回退；
- 修饰键组合没有因新增 command handler 产生计划外变化。

无头 Browser Mode 足以验证本设计；除非新证据表明结果依赖真实可见桌面状态，否则不进入有头 GUI 验收。

## 范围

本设计包含：

- Composer 中已插入 skill chip 的无修饰四方向原子导航；
- 普通 caret 到 skill `NodeSelection` 的视觉命中；
- skill `NodeSelection` 到视觉左/右边界的退场；
- 显式换行、soft-wrap、响应式宽度、LTR/RTL；
- 直接受影响的 skill editing Module 与 Browser 回归边界。

## 非目标

- 切换到 `RichTextPlugin` 或改变 Composer plain-text 内容模型；
- 设计 `Shift`、`Option/Alt`、`Command/Ctrl` 与方向键的混合 selection 语义；
- 改变 typeahead 菜单的上下导航；
- 改变 Chip、Tooltip、pointer、Tab、删除、输入替换、clipboard、draft、queue 或提交协议；
- 建立通用 inline-token 或 decorator-navigation framework；
- 用整行吸附、最近距离、阈值或 logical sibling scan 替代原生目标；
- 为无法验证的浏览器增加跳过、降级或静默 fallback；
- 在本设计中编写 implementation plan、修改代码、运行测试、stage 或 commit。

## 风险与约束

- 浏览器不会把 caret 放入 `contenteditable=false` host；原生探测可能把目标表示为 chip 前后 DOM point，而不是 chip 内部 node。Implementation 必须用诊断证据定义视觉命中，不能只比较 `movedNode`。
- `NodeSelection` 没有 DOM range。已选中 chip 的退出必须先建立可靠的 Lexical boundary point，再验证 DOM caret 实际位于视觉边界。
- 软换行不是 Lexical 文档节点。任何只遍历 `LineBreakNode` 的实现都会遗漏真实视觉行。
- RTL 的 visual left/right 与 logical previous/next 相反。复用现有 logical helper 前必须显式映射。
- 临时修改 DOM selection 可能触发 selection、focus 或 scroll 生命周期。探测必须同步恢复且由 Browser 测试证明没有可观察副作用。
- 现有左右测试只断言 logical before/after。若只补上下而不重写测试模型，现有多行左右 BUG 会继续存在。

## 验收标准

- chip 在四方向上都表现为一个原子 selection stop，caret 永不进入 Chip label；
- 只有浏览器原生目标命中 chip 时才激活 chip；chip 外所有位置保持普通 textarea 式结果，无吸附或边界修正；
- 已选中 chip 的 Left/Up 与 Right/Down 分别停在视觉左/右边界，下一次按键再继续原生移动；
- 显式换行、soft-wrap、窄容器、连续 chip、LTR/RTL 在 Chromium、Firefox、WebKit 中满足同一行为契约；
- plain-text、typeahead、focus、删除、替换、clipboard、draft、queue 和协议语义不回退；
- 修饰键组合未被纳入新语义，也没有发生计划外变化；
- 诊断先闭合原生目标探测；若闭合失败，返回设计阶段而不是实施 fallback。

## 阶段边界

本文仅为已确认设计。下一轮只有在本文经用户确认后才能编写或落盘 implementation plan；本文不授权 production/test 修改、验证、stage、commit 或实现。
