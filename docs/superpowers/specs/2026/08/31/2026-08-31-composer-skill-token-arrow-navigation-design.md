# Composer skill token 左右方向键导航设计

日期：2026-08-31

状态：已确认（2026-08-31）

设计分支：`dev`

设计时 HEAD：`9965e509b304e518707a3b71ba9289ad10b51c10`

关联 research：

- `docs/superpowers/research/2026/08/31/2026-08-31-composer-skill-token-caret-tooltip-focus.md`

关联既有设计：

- `docs/superpowers/specs/2026/08/30/2026-08-30-codex-gui-composer-selected-skill-display-design.md`

## 唯一主目标

设计输入框中 skill token 的左右方向键交互，解决编辑器键盘光标进入 token 的 Lexical `NodeSelection` 后无法移出的问题；`Tab` 的 DOM focus 与左右方向键的编辑器 selection 保持为两条独立交互链，解决方式不限于禁用任何焦点。

## 文档关系与覆盖边界

本文是对 2026-08-30 已选择 Skill 显示设计的定向补充，只增加该设计遗漏的 `NodeSelection → RangeSelection` 左右方向键退场契约。既有设计中以下结论继续有效：

- Lexical `EditorState` 是编辑内容、selection、history 与 composition 的唯一权威来源；
- `SkillNode` 是 inline、keyboard-selectable 的原子 `DecoratorNode`；
- `NodeSelection` 不强制打开 Tooltip；
- hover 与 `Tab` DOM focus 继续按 HeroUI Tooltip 生命周期显示详情；
- Trigger 的 Enter、Space、Backspace、Delete 与 focus handoff 行为不变；
- canonical identity、draft、clipboard、invalid 状态和结构化提交语义不变。

本文不是 implementation plan，不定义任务调度、提交拓扑或执行命令，也不授权修改实现或测试。

## 当前事实与根因

当前 Composer 使用 Lexical `PlainTextPlugin`。锁定的 Lexical 0.49.0 对 inline、keyboard-selectable `DecoratorNode` 的进入与退出处理不对称：

1. 相邻的 collapsed `RangeSelection` 通过字符级左右移动遇到 `SkillNode` 时，Lexical core 会创建只包含该节点的 `NodeSelection`（`codex-gui/node_modules/lexical/src/LexicalSelection.ts:4325-4403`）。
2. `@lexical/plain-text` 的左右方向命令只处理 `RangeSelection`；当前 selection 是 `NodeSelection` 时直接返回 `false`（`codex-gui/node_modules/.pnpm/@lexical+plain-text@0.49.0_typescript@6.0.3/node_modules/@lexical/plain-text/src/index.ts:251-293`）。
3. 项目 `SkillEditingPlugin` 已拥有 Skill `NodeSelection` 的输入替换与整体删除，但没有注册 `KEY_ARROW_LEFT_COMMAND` 或 `KEY_ARROW_RIGHT_COMMAND`（`codex-gui/src/features/composerEditor/SkillEditingPlugin.tsx:37-70`）。
4. 非 `RangeSelection` 同步到 DOM 时，Lexical 会移除编辑器内的 DOM ranges；命令返回 `false` 后没有原生 caret range 继续完成退场（`codex-gui/node_modules/lexical/src/LexicalSelection.ts:3796-3812`）。

`@lexical/rich-text` 0.49.0 已提供同类节点的标准退场行为：LTR 下 Left 选择节点前位置，Right 选择节点后位置；RTL 交换逻辑方向。其包内 helper 不是公共 Interface，不能直接导入，但 `LexicalNode.selectPrevious()` 与 `selectNext()` 是可使用的公共原语（`codex-gui/node_modules/.pnpm/@lexical+rich-text@0.49.0_typescript@6.0.3/node_modules/@lexical/rich-text/src/index.ts:1050-1065`、`:1426-1493`；`codex-gui/node_modules/lexical/src/LexicalNode.ts:1942-1997`）。

因此根因不是 `Chip` 或 Tooltip Trigger 抢走 DOM focus，而是 PlainText 编辑路径只完成了 `RangeSelection → NodeSelection`，没有补齐对应的 `NodeSelection → RangeSelection`。

## 已确认产品决策

### `NodeSelection` 不显示 Tooltip

用户选择：方向键进入 skill token 并形成 `NodeSelection` 时，不显示详情。详情继续只由既有 hover 或 `Tab` DOM focus 路径显示。

该决策意味着：

- 不为 HeroUI `Tooltip` 增加由 `isSelected` 驱动的受控 `isOpen` 状态；
- 不把 Lexical selection 转换成 Tooltip Trigger DOM focus；
- 不新增 NodeSelection 下的 Escape、dismissed-open 或辅助打开状态；
- selected 视觉继续只表达原子 token 已被 Lexical 选择，不表达详情已经打开。

## 目标交互契约

### 两段式原子导航

Skill token 保留一个可感知的原子选择停靠点：

| 初始状态 | 按键 | 结果 |
|---|---|---|
| caret 在 token 左侧，LTR | `ArrowRight` | 进入 token 的单节点 `NodeSelection`；Tooltip 不打开 |
| caret 在 token 右侧，LTR | `ArrowLeft` | 进入 token 的单节点 `NodeSelection`；Tooltip 不打开 |
| Skill 单节点 `NodeSelection`，LTR | `ArrowLeft` | 转为 token 前的 collapsed `RangeSelection` |
| Skill 单节点 `NodeSelection`，LTR | `ArrowRight` | 转为 token 后的 collapsed `RangeSelection` |
| 上述任一状态，RTL | 对应视觉方向键 | 按父级书写方向交换逻辑 previous/next，视觉结果保持一致 |

第一次方向键进入 token，第二次方向键离开 token。不得把两次移动合并成直接跳过 token，也不得允许 caret 落入 token 内部。

### 退场后的编辑语义

- DOM focus 始终留在当前 mounted editor root；退场不得把 focus 移到 Tooltip Trigger。
- 退场生成的 selection 必须是 collapsed `RangeSelection`。
- 从左侧退场后的普通文本输入插入在 token 前，不替换 Skill。
- 从右侧退场后的普通文本输入插入在 token 后，不替换 Skill。
- token 退出 selected 状态，不再具有 `data-selected` / selected 视觉。
- Tooltip 继续保持关闭；方向键退场不得制造 hover、focus 或受控 open 状态。
- 浏览器默认方向移动必须被已处理命令阻止，避免 Lexical selection 与 DOM selection 分叉。

### 保持不变的原子操作

当 Skill 仍是 `NodeSelection` 时，既有操作不变：

- 普通文本输入整体替换选中的 Skill；
- `Backspace` 与 `Delete` 整体删除 Skill；
- copy、cut、paste 继续使用既有 `NodeSelection` clipboard 语义；
- undo/redo 继续穿过原有 history owner；
- Trigger 的 pointer、Enter 或 Space 激活仍建立单节点 `NodeSelection` 并把 DOM focus 交还 editor root。

方向键退场只改变 selection，不修改节点、draft 内容、history、catalog 或提交 payload。

## 状态 owner 与 Module seam

左右方向键退场属于既有 editor-private Skill editing Module。该 Module 已通过 Lexical command registration 统一拥有 Skill `NodeSelection` 的输入替换与删除，方向键转换应加入同一 Interface，以保持 selection 行为的 Locality。

Presentation Module 继续只投影 `useLexicalNodeSelection(nodeKey)` 的视觉结果，不拥有方向键，不创建第二套 selected key，也不控制 Tooltip open state。`SkillNode` 继续只提供原子节点 Interface；不为退场行为增加 React 回调、DOM 查询或 Tooltip 依赖。

实现应只认领当前 selection 确实是可退场的 Skill 单节点 `NodeSelection` 的按键；其他 selection 类型或其他 decorator 的 NodeSelection 交还 Lexical 既有命令链，避免把项目补丁扩张成通用 rich-text 导航实现。

## 可访问性与焦点边界

- `Tab` DOM focus 与左右方向键 selection 继续独立；修复一条路径不得删除或模拟另一条路径。
- Tooltip Trigger 继续位于启用 token 的 Tab 顺序中，focus 时显示详情。
- Skill `NodeSelection` 不宣称详情已显示，也不新增 `aria-describedby` 连接。
- 左右退场不触发 Composer 提交，不合成 Enter/Space，也不改变 Trigger 的 `role="button"` 语义。
- selected 与 DOM focus-visible 继续使用既有不同视觉状态；不得通过统一 class 掩盖两者语义差异。

## 范围

本文覆盖：

- 单个 Skill `NodeSelection` 的 `ArrowLeft` / `ArrowRight` 退场；
- LTR 与 RTL 下的视觉方向一致性；
- 退场后的 caret 落点、后续输入侧和 selected 视觉；
- 与 Tooltip、Tab focus、原子替换和删除的状态隔离；
- 对应的自动回归与真实 GUI 无头验收边界。

本文不覆盖：

- NodeSelection 自动显示 Tooltip；
- 删除 Tooltip Trigger 的 Tab stop 或改变 hover/focus 详情入口；
- 修改 Enter、Space、Escape、Backspace、Delete、copy、cut、paste、IME 或提交快捷键；
- 通用 DecoratorNode、非 Skill NodeSelection 或跨多个节点的选择导航；
- 新增 Popover、Dialog、点击固定、触摸详情或第二个 overlay owner；
- 修改 Skill identity、draft、catalog、queue、协议、Rust、TUI 或 app-server；
- 运行时修复、测试实现、stage、commit 或 remote 操作。

## 验证设计

### Level 1：自动回归

Browser Mode 应逐步观察而不是只断言文本不变：

- caret 在 token 左侧时，`ArrowRight` 形成该 Skill 的 `NodeSelection`，editor root 保持 DOM focus，Chip selected，Tooltip 不可见；
- caret 在 token 右侧时，`ArrowLeft` 形成对称状态；
- Skill selected 后，`ArrowLeft` 落在 token 前，`ArrowRight` 落在 token 后；
- 两侧退场后继续输入，文本分别插入 token 前后且 Skill identity 不变；
- 退场后 Chip 不再 selected，Tooltip 保持不可见，提交回调未触发；
- LTR 与 RTL 的视觉方向结果一致；
- Trigger 的 Tab/focus/Space/Enter、Backspace/Delete、普通输入替换、undo/redo、clipboard 与 IME 既有回归继续通过。

现有 `ComposerEditor.browser.test.tsx:1086-1103` 只发送 `{ArrowLeft}{ArrowRight}` 并断言 token 文本未变化，不能证明中间 selection 类型、退场落点或后续输入侧，必须由上述状态断言替代其覆盖缺口，但不得删除仍有价值的原子内容断言。

### Level 2：真实 GUI 无头验收

Level 2 适用。真实 Codex runtime 应验证：

- 真实 catalog Skill 在普通 Composer 与 pending-input editor 中均可两段式进入和退出；
- 方向键路径不会打开 Tooltip，`Tab` focus 与 hover 仍能显示详情；
- 连续经过多个相邻 Skill、行首、行尾、换行和 Composer 内部滚动位置时，caret 不被困住且页面不滚动跳变；
- 退场后的输入、删除和提交保持原有语义。

### Level 3：可见桌面验收

当前设计不依赖系统窗口、跨应用 focus、DevTools 或真实系统 IME UI，因此 Level 3 不适用。若实施证据显示浏览器或系统级 caret 行为无法由 Level 1 和 Level 2 证明，必须重新判定并在启动可见窗口前取得单独授权。

## 风险与控制

| 风险 | 控制 |
|---|---|
| 把方向键 BUG 误修到 Chip/Tooltip | editing Module 作为唯一 selection 退场 owner；Presentation 不控制方向键或 Tooltip open |
| 修复只处理 LTR | 按父级书写方向映射 logical previous/next，并验证 RTL 视觉结果 |
| 退场后输入仍替换 Skill | 断言 collapsed `RangeSelection` 落点及后续输入侧 |
| 误处理其他 DecoratorNode 或多节点选择 | 命令只认领可退场的 Skill 单节点 `NodeSelection`，其余 selection 交还既有命令链 |
| 浏览器默认移动与 Lexical 状态分叉 | 仅在转换成功时 `preventDefault` 并返回已处理 |
| 把 selected 视觉误当 Tooltip focus | 分别断言 DOM focus、Lexical selection、Chip selected 与 Tooltip 可见性 |
| 现有测试继续产生假阳性 | 对每个方向逐步观察进入、退出、落点和后续输入，不以最终文本未变化代替状态断言 |

## 设计完成标准

实现后的最终状态必须同时满足：

1. 方向键可以从 token 两侧进入单节点 `NodeSelection`，也可以按视觉方向退出到 token 前后。
2. 退出后的 caret 是 collapsed `RangeSelection`，后续输入位于正确一侧且不替换 Skill。
3. 方向键路径始终由 editor root 持有 DOM focus，不打开 Tooltip，也不触发提交。
4. `Tab` focus、hover 详情和 Trigger 激活语义保持不变。
5. 原子替换、删除、clipboard、draft、identity 与结构化提交行为无回退。
6. 全部适用 Level 1 与 Level 2 场景通过；Level 3 保持不适用。

## 阶段边界

本文已于 2026-08-31 获用户明确确认。后续 implementation plan 仍须独立确认，且相关工作文档形成独立本地 Git 提交前不得开始实现。
