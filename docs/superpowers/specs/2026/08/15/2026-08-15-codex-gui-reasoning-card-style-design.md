# Codex GUI 思考信息 Card 样式设计

状态：已确认

日期：2026-08-15

设计分支：`dev`

设计时 HEAD：`506e53ca55f49909ddaee6d89d25f63e00fe9c16`

关联文档：

- 原始 reasoning 显示设计：`docs/superpowers/specs/2026/08/14/2026-08-14-codex-gui-reasoning-display-design.md`
- 子代理活动 GUI 渲染参考：`docs/superpowers/specs/2026/08/14/2026-08-14-codex-gui-subagent-activity-tag-rendering-design.md`

设计确认：用户于 2026-08-15 明确回复“确认设计。计划落盘”，确认本文设计并授权进入计划阶段。

## 唯一主目标

只更新 Codex GUI 中 reasoning 思考信息的视觉表达：流式态和完成态都改用具有可见表面的
HeroUI v3 `Card`，删除完成态硬编码的 TUI 项目符号，并以现代 GUI 层级展示原有内容。

本设计不改变 reasoning 的内容来源、生命周期、时间线、折叠、chunk、projection 或状态语义。

## 与历史设计的关系

2026-08-14 的 reasoning 显示设计建立了当前权威数据链路、流式标题、完成态 Markdown、顺序、
中间信息折叠和 chunk 性能边界。这些约束继续有效。

本文只修订旧设计中的渲染契约：旧设计要求完成态使用 `•` 和弱化斜体 Markdown，并明确不使用
Card；本文用现代 GUI Card 表面替代该终端式表达。旧文档作为历史保留，不覆盖或删除。

## 当前问题与代码证据

问题位于 `CommittedTranscriptSurface` 的显示层，而不是协议或状态层：

- `ReasoningEntryRenderer` 统一处理 `streaming` 与 `completed` 两种生命周期；
- 流式态当前直接使用 `Typography` 显示 `entry.title`，并带有实时播报 ARIA 属性；
- 完成态当前使用普通 `article`，在 Markdown 前硬编码 `U+2022 BULLET`；
- reasoning 继续在 `groupTranscriptEntries` 中切断相邻活动组；
- 现有 Browser Test 明确断言完成态不在 Card 内且包含 `•`，因此实现时必须更新该旧契约。

对应代码位于：

- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx` 的
  `ReasoningEntryRenderer`；
- `codex-gui/src/features/committedTranscriptSurface/__tests__/ReasoningTranscriptSurface.browser.test.tsx`。

当前 `TranscriptEntryView` 已提供渲染所需的流式 `title` 和完成态 Markdown `source`。显示层无需读取
raw reasoning，也无需新增 DTO、selector、projection 字段或协议兼容路径。

## 已确认的产品决策

### 使用可见的默认 Card 表面

流式态与完成态都使用 HeroUI v3 `Card variant="default"`。本设计需要用户能够直接辨认卡片表面，
因此不沿用子代理活动当前的 `transparent` variant。

`default` 使用 HeroUI 的 surface、圆角和阴影语义建立层级；不新增硬编码颜色、边框、阴影值或另一套
自定义 Card 样式。

### 不新增固定标题

Card 不增加固定的“思考”或 `Thinking` 标题：

- 流式态继续直接显示模型提供的当前动态标题；
- 完成态继续直接显示权威 summary 组合后的 Markdown；
- 不把动态标题复制为 Card 标题，也不从完成态 Markdown 中推导新标题。

这样只改变视觉容器，不增加重复文案或新的本地化消息。

## 渲染设计

### HeroUI 组件与语义 token

使用现有 HeroUI v3 compound API：

```tsx
<Card variant="default">
  <Card.Content>{/* 当前 reasoning 内容 */}</Card.Content>
</Card>
```

组件和 token 边界如下：

- 外层使用 `Card variant="default"`；
- 内容使用 `Card.Content`；
- 层级来自 HeroUI `bg-surface`、默认 foreground、muted foreground、`radius-3xl` 与
  `shadow-surface` 等语义样式；
- 不使用 `Card.Title` 或 `Card.Description` 伪造固定内容层级；
- 不增加图标、emoji、Tag、Badge、Spinner、Tooltip、Disclosure 或交互控制；
- 具体 padding、gap、字体数值和换行 utility 属于实现细节，不在测试中固化。

### 流式态

流式 reasoning 在 Card 内容区继续渲染当前 `entry.title`，并保留：

- `role="status"`；
- `aria-live="polite"`；
- `aria-atomic="true"`；
- 同一 reasoning identity 的原位更新。

Card 化不得让每个 delta 新建卡片、追加历史标题或产生新的 transcript entry。

### 完成态

完成态在 Card 内容区继续使用现有 `MarkdownText` 渲染 `entry.source`。实现必须直接删除硬编码的
`•` 节点，而不是通过 CSS、`aria-hidden` 或空字符串隐藏。

Markdown 的段落、强调、代码、链接、换行和安全策略保持不变。Markdown 源内容自身的反引号或其他
业务字符属于语义内容，不得作为 TUI 装饰清洗。

## 权威数据与性能边界

权威 derivation path 保持不变：

```text
generated protocol types
  -> transcript projection and item policy
  -> transcript state stored entry
  -> stable TranscriptEntryView
  -> ReasoningEntryRenderer
```

本设计只修改最后一个 GUI renderer 边界。不得修改 authoritative protocol contract，或在消费者侧复制、
擦除再重建该契约。

reasoning 继续作为 singleton entry 留在所属 transcript chunk 中。Card 化不得跨 chunk 合并 reasoning，
不得展开完整 turn 数组，也不得改变 chunk selector 的引用稳定性或隐藏内容的挂载边界。

## 保持不变的行为

- 流式 summary title 的提取、更新和可见条件；
- completed summary 作为权威内容并原位替换流式态；
- raw `content` 与 `reasoningText` 始终不显示；
- reasoning 与 commentary、活动及消息的原始事件顺序；
- reasoning 对相邻 activity group 的切断；
- final answer 前后的 `Intermediate updates` 展开、计数与默认折叠行为；
- 中断、失败、snapshot、replay、dedup 与 reconnect 语义；
- transcript chunk、selector cache 和 bounded rendering 边界；
- Markdown 的语义、可访问性和安全策略。

## 非目标

- 不修改 Rust、app-server、generated TypeScript、validator 或 schema；
- 不修改 projection、transcript state、selector 或 thread runtime；
- 不改变 reasoning 内容、摘要拼接、生命周期、排序或恢复行为；
- 不把多条 reasoning 合并为一个 Card，也不与子代理活动共享同一个 Card；
- 不修改子代理活动现有的 transparent Card、Tag 或活动文案；
- 不增加 reasoning 专用 disclosure、固定标题、状态标签或交互；
- 不重新设计外层 `Intermediate updates`；
- 不通过忽略测试、隐藏字符或放宽断言掩盖旧 TUI 输出。

## 预计影响边界

后续实施计划应把修改限制在：

- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx`；
- `codex-gui/src/features/committedTranscriptSurface/__tests__/ReasoningTranscriptSurface.browser.test.tsx`。

除非后续代码证据证明当前事实不成立，否则不得修改协议、projection、state、selector、catalog 或其他
transcript renderer。

## 测试设计

Browser Mode 测试应覆盖稳定、用户可感知的约束：

- 流式 reasoning 位于 HeroUI Card 内，并继续以单一 live status 原位更新；
- completed 到达后，同一位置改为包含权威 Markdown 的 HeroUI Card；
- Card 使用可见的 `default` variant，而不是 transparent surface；
- 完成态不再渲染硬编码的 `•`；
- raw reasoning 仍不可见；
- Markdown 的强调、代码和链接语义保持；
- reasoning 继续切断活动组并保持 DOM 顺序；
- final answer 前后的既有 disclosure 行为不回归。

测试不得固化 HeroUI 私有 DOM、padding、gap、颜色值、阴影值、圆角数值或易变的内部 class。实现后的
合理验证包括项目现有格式检查、lint、type-check、针对性 Browser Mode 测试，以及与 transcript 渲染
相关的既有回归测试。

## 验收标准

完成状态必须同时满足：

- 流式态与完成态都由可见的 HeroUI v3 default Card 承载；
- 不新增固定“思考”标题；
- 完成态 TUI 项目符号被从 JSX 中真正删除；
- 原有动态标题、Markdown、ARIA live、顺序、折叠和 chunk 语义不变；
- 不修改显示层以外的数据与状态链路；
- 相关格式、lint、type-check 和 Browser Mode 测试通过。

## 设计否决条件

出现以下任一情况时，后续实现必须停止并回到设计：

- 需要修改协议、projection、state、selector 或 authoritative contract；
- 需要增加固定标题、图标、状态标签、交互或新的本地化文案；
- 需要改变 reasoning 的内容来源、时间线、分组、折叠或恢复语义；
- 需要跨 chunk 合并或重新收集 transcript entry；
- 需要通过 CSS 隐藏、字符串清洗、忽略测试或放宽断言移除 TUI 字符；
- 需要修改子代理活动或其他 transcript entry 的渲染。

## 后续门禁

本文档只落盘设计，不授权创建计划或修改实现。设计获得明确确认后，下一轮才能编写实施计划；实施
计划再次获得明确确认后，才允许修改代码、测试或运行会产生工作区变更的项目命令。
