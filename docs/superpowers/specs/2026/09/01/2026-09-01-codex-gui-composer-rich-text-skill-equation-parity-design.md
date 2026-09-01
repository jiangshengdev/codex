# Codex GUI Composer RichText 宿主与 Skill/Equation 行为等价设计

## 状态

- 设计状态：已确认
- 日期：2026-09-01
- 设计范围：Composer 编辑宿主迁移，以及 Skill chip 的节点级外部编辑行为
- Codex 调查基线：`49edc94a2ad77f99945f9d93de57920e49674809`
- Lexical 基线：`v0.49.0`（参考 checkout：`/Users/jiangsheng/GitHub/lexical`，
  commit `ffe90924bd55b5d450c88de0f9f1c8b228c4a221`）

本文只确认设计，不是实施计划，也不授权修改 production、test 或配置，不授权运行浏览器、
stage、commit 或 remote 操作。

## 与旧设计和计划的关系

本文以新的源码事实闭包整体取代以下两份设计：

- [Codex GUI Composer 回归 Lexical 0.49 官方能力设计](./2026-09-01-codex-gui-composer-official-lexical-capability-cleanup-design.md)
- [Codex GUI Composer Skill token 水平选择闭环设计](./2026-09-01-codex-gui-composer-skill-token-horizontal-selection-design.md)

旧设计保留为失效历史，不增量修补。它们依赖的关键前提——“Composer 应继续使用
`PlainTextPlugin`，Lexical 0.49 没有公式所需的完整方向键 owner”——已被源码证据推翻。

以下对应计划也随其设计前提失效，不得继续执行或作为新计划的增量起点：

- `docs/superpowers/plans/2026/09/01/2026-09-01-codex-gui-composer-official-lexical-capability-cleanup-plan.md`
- `docs/superpowers/plans/2026/09/01/2026-09-01-codex-gui-composer-skill-token-horizontal-selection-plan.md`

新计划必须从本文重新推导修改范围、依赖关系和验证边界。

## 事实基线与根因

本设计依据：

- [Composer 从 PlainTextPlugin 迁移到 RichTextPlugin 的方案评估](../../../../research/2026/09/01/2026-09-01-composer-rich-text-migration-assessment.md)
- Lexical Playground `App.tsx:210-255,332-344`：公式只注册在 rich-text mode；
- Lexical `packages/lexical-rich-text/src/index.ts:825-924,1048-1065,1342-1520`：
  RichText 拥有 decorator-aware 视觉行探测、四方向 `NodeSelection` 退出、RTL 映射和
  `RangeSelection` 转换；
- 同文件 `:1523-1633,1760-1803`：RichText 还拥有 NodeSelection 删除、Enter 和通用
  clipboard command；
- Lexical `packages/lexical-plain-text/src/index.ts:252-360`：PlainText 只覆盖 collapsed
  RangeSelection 的相邻 decorator 水平移动，删除和 Enter 也要求 RangeSelection；
- Playground `EquationComponent.tsx:57-202`：Equation 另有 click、lone-node Enter、
  空内部编辑器 Backspace 和 selected class adapter；
- Composer 当前 `ComposerEditor.tsx:108-164` 挂载 `PlainTextPlugin`，
  `SelectedSkillToken.tsx:106-223` 又建立了与 Equation 不同的单选、Tab focus 和键盘入口。

此前实现只复制了公式的节点外形和点击选择 API，没有追踪公式实际依赖的 RichText 行为宿主、
Equation adapter、DOM/CSS 与焦点模型。随后又把目标缩小成水平 selection，导致项目在
Composer 内重复实现 Lexical RichText 已拥有的方向键、DOM selection 和视觉几何 owner。

根因不是某一个 Arrow handler 写错，而是参考栈不完整和 owner 选择错误。

## 唯一主目标

将 Composer 从 PlainText 行为宿主迁移到 RichText 行为宿主，使 Skill chip 在同一个
Composer 宿主中的节点级外部编辑行为与 Lexical Playground inline EquationNode 等价，
只保留 Skill 业务数据和展示内容所必需的差异。

“等价”不比较 Playground 与 Composer 的应用级快捷键。判断方法是：假设 inline
EquationNode 被放入同一个 Composer，Composer 的全局命令对 Equation 和 Skill 一视同仁；
在此前提下，两种节点的 selection、caret、方向键、删除、复制粘贴、pointer 和 focus 行为
应一致。

## 产品合同

RichText 是编辑行为宿主，不是新的产品输出格式。迁移后 Composer 对外仍只有：

- 用户可见的纯文本与原子 Skill chip；
- 提交给后端的 plain text item；
- 按 canonical identity 去重的结构化 Skill items；
- 现有 draft、queue 和 pending restore 所需的结构化编辑器状态。

迁移不得开放标题、列表、引用、加粗、斜体或其他用户可见富文本功能，不得把 HTML、
TextNode format、Element format 或任意 RichText 节点泄露到后端 payload。

## 已确认的行为边界

### Composer 全局行为优先

在同一 Composer 中，以下全局合同对普通文本、Equation 和 Skill 使用相同 owner：

- 普通 Enter 提交；
- Shift+Enter 插入换行；
- typeahead 打开时拥有其导航、Enter 和 Escape；
- 普通输入替换当前 `NodeSelection` 中的 inline atomic nodes；
- disabled/read-only 状态禁止编辑；
- IME composition 不被节点 adapter 抢占；
- draft capture/restore、history、clipboard 和 structured payload 保持 Composer 业务语义。

因此，Playground 中 lone Equation NodeSelection 的 Enter 插 paragraph 不是 Composer
必须复制的应用级结果。若 Equation 位于 Composer，它也会先服从 Composer 的提交 owner。

### 节点选择与多选

- 普通 click 清除现有 selection，并把命中的 Skill 加入 `NodeSelection`；
- Shift+click 与 Equation 一致：切换命中 Skill 的选中状态，不清除其他已选节点；
- 多个已选 Skill 继续作为一个 Lexical `NodeSelection` 参与复制、剪切、删除和输入替换；
- 不保存第二份 selection 状态，不根据点击或键盘来源维护额外模式。

当前“Shift+click 仍强制单选”的行为和测试不再是保留合同。

### 普通输入替换原子节点

Lexical 0.49 的 `NodeSelection.insertText()` 是 no-op，Equation adapter 也没有输入替换路径；
因此当前 Skill 的输入替换不是 RichText 默认行为。本设计把该能力从 Skill 专属差异提升为
Composer 全局宿主合同：

- selection 是一个或多个 inline atomic nodes 的 `NodeSelection` 时，普通文本输入原子地删除
  全部已选节点，并在该位置插入输入文本；
- 该规则按节点能力而不是 `SkillNode` 类型判断；若 inline EquationNode 位于同一 Composer，
  它必须得到相同结果；
- composition、disabled/read-only、不可替换节点和非 NodeSelection 继续服从各自既有 owner；
- 不通过 Skill 类型特判、第二份 selection 状态或 PlainText fallback 实现。

这保留了 Composer 当前“选中原子节点后直接打字即可替换”的友好体验，同时不构成 Skill 与
Equation 的节点级外部行为差异。

### 方向键与 caret

RichText 的 `registerRichText` 行为栈是以下行为的唯一通用 owner：

- collapsed RangeSelection 朝 inline decorator 移动时进入 NodeSelection；
- NodeSelection 使用 ArrowLeft、ArrowRight、ArrowUp、ArrowDown 退出到 RangeSelection；
- LTR/RTL 映射；
- soft-wrap 与视觉行边界上的 decorator-aware 探测；
- 触发 Lexical selection 转换所需的键盘 command 编排。

Composer 不再为 Skill 保留水平、垂直或四方向光标控制器，不读取 caret rect、DOM Range 或
`Selection.modify()` 来修正 RichText 结果，也不增加浏览器特判、延迟恢复、focus/scroll
快照或 fallback。Lexical selection 数据结构、DOM 映射与 reconcile 的算法 owner 是 Lexical
core/selection；RichText 只拥有调用这些能力的通用编辑 command，不得把两层合并为一个 owner。

这里要求采用的是 `registerRichText` 所代表的行为 owner。React `RichTextPlugin` 和
Playground `RichTextExtension` 都可以注册该 owner，但二者的外围扩展栈并不相同；新计划必须
根据 Composer 实际集成入口选择最小接入方式，不能把“替换一个 JSX Plugin”误写成完整迁移。

### DOM focus、Tab 与 Tooltip

- Skill chip 不再是独立 Tab stop；不得在 chip 或内部 Tooltip trigger 上保留 `tabIndex=0`；
- Tab 不逐个进入 Skill，editor root 不因遍历 chip 把 DOM focus 交给业务展示组件；
- click 或方向键产生 Lexical NodeSelection 时，DOM focus 仍由 editor root 持有；
- Tooltip 可以继续作为 Skill 展示差异保留，但不能再依赖独立键盘 focus 入口；
- Skill 的可访问名称和必要业务信息必须由适合其语义的 host/内容表达，Tooltip 不得成为唯一
  可访问来源；
- 不复制 Equation 的 `role="math"`，因为该角色属于公式语义，不属于行为等价要求。

必须分别验证 DOM focus、DOM Selection、Lexical selection、视觉 caret 和 Tooltip 可见状态，
不得把其中任意两项当作同一个状态。

### 双击与内部编辑

Equation 双击编辑自身公式字符串属于 Equation 数据模型专属能力。Skill 保存 canonical
identity，没有可直接文本编辑的内部值。因此：

- 双击 Skill 不进入内部编辑器，也不新增 Skill 更换器；
- 双击只产生与普通 pointer selection 相容的节点选择结果；
- 更换 Skill 继续通过现有 `$query` typeahead 创建流程完成；
- “没有 EquationEditor 同款内部编辑器”是已批准的业务差异，不是待补缺口。

## Owner 设计

### RichText 通用 owner

RichText 负责不含 Composer 业务数据的通用编辑 command 编排：

- 四方向键和视觉行导航；
- 通用 decorator 进入/退出；
- 通用删除、paragraph、line break、Escape、drag/drop command，以及可由 Composer 高优先级
  业务 owner 覆盖的默认 clipboard handlers。

Composer 不复制 RichText 私有 helper。若官方行为不能满足本文合同，应先确认接入层和命令
优先级是否正确；不得直接恢复旧的自研 geometry 层。

### Lexical core/selection owner

Lexical core/selection 负责：

- RangeSelection、NodeSelection 的数据结构和 mutation primitive；
- Lexical point 与 DOM point 的映射；
- editor update 后的 DOM Selection、视觉 caret 与 selected state reconcile；
- RichText command 和 Composer 业务 command 最终调用的底层 selection 操作。

Composer 和 RichText 都不得建立第二份 reconcile 或在 core commit 后异步修正结果。

### Skill 节点 adapter

Skill adapter 只负责 Equation 通用范式之外的 Skill 数据职责：

- 使用 Lexical NodeSelection API 实现普通 click 与 Shift+click；
- 把选中状态投影到 keyed host 的样式和可访问属性；
- 保存 canonical `name + path` 与 `displayName`、`sourceLabel` 等展示字段；
- 在结构化 clipboard 和 draft compiler 需要时桥接 Skill 业务数据；
- disabled/read-only 下拒绝业务 mutation。

adapter 不拥有方向键、DOM caret、视觉几何、滚动恢复或通用 selection reconcile。

### Composer 业务 owner

Composer 继续拥有：

- 普通 Enter 提交和 Shift+Enter 换行合同；
- 所有 inline atomic NodeSelection 的普通输入替换合同；
- `$query` typeahead 的数据、排序、渲染、选择和多编辑器隔离；
- canonical Skill clipboard payload；
- EditorState 到 plain text + structured Skill payload 的 compiler；
- draft capture/restore、queue/pending restore 与 history 生命周期；
- IME、disabled/read-only 和 Composer 级无障碍合同。

当 Composer 的高优先级业务 command 与 RichText 通用 command 重叠时，只保留维持上述业务
结果所需的窄 owner。当前 Composer clipboard handler 在 high priority 完整消费 copy、cut、
paste，并调用官方 clipboard primitive；这些路径的有效 command owner 是 Composer，RichText
注册的 editor-priority handler 不会再次消费。已经由 RichText 完整提供的 NodeSelection 导航
或删除路径不得继续双重注册。

## RichText 能力收窄

迁移不能被解释为接受 RichText 注册的全部产品行为。Composer 必须维护一个受控内容模型：

- 允许表达普通文本、paragraph/line break 边界和 SkillNode；
- 不允许持久化或呈现用户可见 TextNode/Element format；
- HTML paste 必须保留纯文本结果，并只通过 Composer 自有格式恢复 canonical Skill；
- restore、programmatic insertion 和 clipboard 输入必须归一化到同一受控模型；
- RichText 自动注册的 drag/drop 不得隐式成为新产品能力；在没有单独产品设计前，Composer 应在
  自身边界禁用会移动、复制或降级 Skill payload 的 rich-text drag/drop；
- RichText 的 Escape blur 不得绕过 typeahead Escape owner，也不得相对迁移前静默引入新的
  Composer 失焦行为。

具体使用 command interception、node transform 还是输入归一化属于计划和实现细节，但最终状态
只能保留一个 canonical 内容模型和一条输入归一化路径，不得以双写、双读或 fallback 维持
PlainText 与 RichText 两套行为宿主。

## 数据与序列化不变量

迁移前后必须保持：

- 相同用户可见文本产生相同 plain text payload；
- 相同 canonical Skill 集合产生相同、去重后的 structured Skill payload；
- displayName、Tooltip 文本和 DOM 内容不能替代 canonical identity；
- paragraph 与 line break 在 snapshot、submit compiler 和 restore 中有明确且一致的投影；
- RichText format、DOM 标签和 presentation-only state 不进入后端协议；
- copy/cut/paste 不泄露内部 path 到纯文本 clipboard，也不丢失受信 structured Skill 数据；
- history Undo/Redo 能恢复完整文本、Skill identity、selection 与允许的内容树，不恢复已禁止的
  隐藏 format 状态。

当前没有证据要求修改后端协议。只有验证证明现有 compiler 无法表达上述不变量时，才能回到
设计重新评估；不得在计划中预先扩大 app-server 或 protocol 范围。

## 迁移后的行为矩阵

| 行为 | 通用 owner | Skill 结果 | 与 Equation 的关系 |
| --- | --- | --- | --- |
| 普通 click | 节点 adapter + NodeSelection API | 清除后单选命中 Skill | 等价 |
| Shift+click | 节点 adapter + NodeSelection API | toggle 命中 Skill并保留其他已选节点 | 等价 |
| 四方向键 | RichText | Range/NodeSelection 按官方行为转换 | 等价 |
| 普通输入 | Composer 原子节点替换 owner + Lexical core | 替换全部已选 inline atomic nodes | 同一宿主下等价 |
| Backspace/Delete | RichText + 必要 Skill 数据桥接 | 原子删除所选 Skill | 等价的原子节点结果 |
| copy/cut/paste | Composer clipboard command owner + 官方 clipboard primitive | 保持 plain text 与 canonical Skill payload | 业务数据差异 |
| 普通 Enter | Composer 提交 owner | 提交 Composer | 同一宿主下等价 |
| Shift+Enter | Composer/RichText line-break 路径 | 插入换行 | 同一宿主下等价 |
| Tab | editor/浏览器 | 不逐个聚焦 Skill | 等价 |
| Tooltip | Skill 展示层 | hover 等非独立 Tab-focus 方式展示 | 业务展示差异 |
| 双击 | Skill click adapter | 不进入内部编辑器 | 已批准业务差异 |
| DOM/CSS selected 状态 | keyed host 投影 | 与 Lexical NodeSelection 同步且可辨识 | 等价；业务展示内容和样式可不同 |

## 验收边界

后续计划必须先建立可执行的 Equation 对照矩阵，再分别验证 RichText 宿主迁移、Skill adapter
对齐和 Composer 合同保持。至少覆盖：

### Selection 与键盘

- RangeSelection 从 Skill 两侧及视觉上下方向进入/越过 inline Skill；
- 单节点和多节点 NodeSelection 的四方向退出；
- LTR/RTL、邻接文本、连续 Skill、only-Skill、显式换行和 soft-wrap；
- 普通 click、Shift+click toggle，以及点击空白返回 RangeSelection；
- Backspace、Delete、任意 inline atomic NodeSelection 的普通输入替换、copy、cut、paste；
- DOM focus、DOM Selection、Lexical selection、视觉 caret 与 selected 样式分别断言。

### Composer 合同

- Enter 提交、Shift+Enter 换行、typeahead Enter/Escape 和菜单键盘导航；
- plain text + structured Skill payload，包括 canonical 去重和纯文本 clipboard 隐私；
- paragraph/line break 的 snapshot、submit、restore 一致性；
- HTML/plain/structured paste 的格式剥离和 Skill 恢复；
- history transaction、Undo/Redo、clear、draft restore、queue/pending restore；
- IME composition、disabled/read-only、多 Composer 隔离；
- RichText format 快捷键、drag/drop 和菜单关闭后的 Escape 不引入未批准行为。

### Focus、Tooltip 与无障碍

- Skill 不进入 Tab 序列，Tab 不被 chip 吞掉；
- pointer 和方向键选中 Skill 后 editor root 保持 focus；
- Tooltip 不再通过独立 Tab focus 打开；
- Skill host 具有符合 Skill 语义的可访问名称，不复制 `role="math"`；
- disabled/read-only 状态的名称、选择和操作边界保持一致。

Browser Mode 的 Chromium、Firefox、WebKit 只能证明对应引擎的自动化结果；真实 Safari 或辅助
技术验收若进入计划，必须作为独立验收层，不得由 headless WebKit 替代。任何可见桌面验收仍需
针对该次窗口单独授权。

## 失败与停止条件

- 若 `registerRichText` 在 Composer 实际插件组合中不能提供 Equation 同款 NodeSelection 行为，
  先核验接入入口、节点形状、command priority 和 DOM/CSS；不得自动恢复自研光标算法。
- 若保持 plain/structured payload 必须修改后端协议，停止受影响范围并回到设计。
- 若移除 Tab stop 后无法提供符合现有无障碍要求的 Skill 名称，先重新设计 host 语义；不得用
  隐藏 focus trap 或恢复独立 Tooltip trigger 掩盖问题。
- 若 RichText 引入无法收窄的 format、drag/drop、Escape 或 history 副作用，停止迁移集成，保留
  失败证据并回到设计，不得并存 PlainText/RichText 双 owner 或增加 fallback。

## 非目标

- 不启用面向用户的富文本格式工具栏或富文本后端 payload；
- 不升级 Lexical，不回移 `v0.49.0` 之后的实现；
- 不复制 RichText 私有 helper 到 Composer；
- 不恢复水平、垂直或四方向 Skill 光标控制器；
- 不新增双击 Skill 更换器或内部 Skill 编辑器；
- 不把 Equation 的公式语义、KaTeX renderer、`role="math"` 或内部输入框复制给 Skill；
- 不修改 app-server、protocol 或 Rust 后端；
- 不把真实 Safari 或辅助技术可见验收包含在未经单独授权的实现动作中。

## 已确认取舍

- 行为等价按“同一 Composer 宿主”比较，不按 Playground 的应用级最终结果比较；
- Composer 的 Enter 提交等全局合同优先；
- Shift+click 采用 Equation 多选语义；
- Skill 不再作为独立 Tab stop，Tooltip keyboard focus 行为不保留；
- Equation 内部编辑器被认定为数据模型专属能力，Skill 双击不新增更换动作；
- 普通输入替换被提升为 Composer 全局 inline atomic node 合同，不作为 Skill 专属差异；
- RichText 只成为行为宿主，Composer 产品合同仍是纯文本加结构化 Skill。

## 阶段边界

本文落盘后仍未进入计划或实现阶段。下一阶段必须单独编写并确认计划；设计文档在进入计划前还需
由用户确认。执行已经落盘的设计与计划前，相关工作文档必须先形成独立本地 Git 提交。
