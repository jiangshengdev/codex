# Codex GUI 子代理活动 Tag 渲染设计

状态：已确认

日期：2026-08-14

设计分支：`dev`

设计时 HEAD：`79f5e8988d99d1a8c7405d9760d7d3547a48c133`

关联文档：

- 历史设计：`docs/superpowers/specs/2026/08/02/2026-08-02-codex-gui-parent-subagent-activity-tui-parity-design.md`
- 更早版本：`docs/superpowers/specs/2026/07/26/2026-07-26-codex-gui-parent-subagent-activity-display-design.md`

## 唯一主目标

只重新设计 Codex GUI 中 `SubAgentActivity` 的 `started`、`interacted`、`interrupted`
活动行：移除其终端式视觉符号，并把原先由反引号包裹的完整 `agentPath` 在原句位置改用只读
HeroUI v3 `Tag` 呈现。

本设计不改变活动信息本身，不把子代理对象或整条活动变成 Tag，也不修改协议、projection、
transcript state 或活动生命周期语义。

## 与历史设计的关系

2026-08-02 设计建立了当前子代理活动的权威数据边界、identity、顺序、placement、chunk、折叠和
stable view 约束。这些约束继续有效。

本设计只修订其中的 GUI renderer 契约：旧设计把 TUI 的可见反引号、行首项目符号和详情树形连接符
带入了 GUI；本设计将这些终端表达替换为现代 GUI 组件和排版层级。旧文档作为历史保留，不覆盖、
删除或改写。

## 当前 GUI 问题与代码证据

问题位于 `CommittedTranscriptSurface` 的 GUI 视觉表达选择，不位于协议或 projection：

- `ActivityEntryRow` 硬编码了 `U+2022 BULLET` 作为每条活动的行首符号；
- 详情首行硬编码了 `U+2514 BOX DRAWINGS LIGHT UP AND RIGHT`，其余详情保留同宽空前缀，形成
  终端树形布局；
- `agentStarted`、`agentInteracted`、`agentInterrupted` 把 `agentPath` 与业务文案拼成单一字符串，
  并在路径两侧加入可见反引号；
- renderer 随后把这个字符串整体交给 `ActivityEntryRow`，因此路径当前没有独立的 GUI 组件表达。

对应代码位于：

- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx` 的
  `ActivityEntryRow`；
- 同文件 `ActivityEntryRenderer.copyText` 的三个 `agentPath` 分支。

现有 `TranscriptEntryView` 已经提供结构化 `agentPath` 和活动类型。GUI 可以直接使用这些 stable view
字段完成渲染，不需要改变数据产生、存储、projection 或协议契约。

## 已确认的产品决策

### 逐条保留时间线

每次子代理活动继续形成一条独立记录，并严格保持现有时间顺序。重复的 `interacted` 或其他活动不
合并、不计数、不按代理聚合，也不建立代理面板。

### Tag 保留原句位置

Tag 只替代原来反引号包裹路径所承担的视觉职责。完整 `agentPath` 保持不变，并继续位于原本的句法
位置：

```text
Started [Tag: /root/example]
Interacted with [Tag: /root/example]
Interrupted [Tag: /root/example]
```

中文继续保留翻译自身的语序，例如“已与”位于 Tag 前，“交互”位于 Tag 后。不得为了统一视觉顺序
把所有 Tag 强制移动到句首或句尾。

### 详情使用纯 GUI 层级

移除树形连接符后，详情仍位于所属活动标题下方。其从属关系只通过缩进、间距和 HeroUI 语义样式表达，
不添加替代字符、图标、可见描述标签或新的状态文案。

不得删除、折叠或改写已有 prompt、model、reasoning effort、完成摘要、错误详情或其他活动详情。

### 保留 TagGroup 原生键盘焦点

HeroUI v3 `TagGroup` 即使使用 `selectionMode="none"`，Tag 仍保留原生键盘焦点和列表导航语义。本设计
接受这一组件语义：Tag 可以通过键盘获得焦点，但不能选择、删除、点击、触发动作或导航。

不得把 TagGroup 或 Tag 标记为 disabled 来移除焦点。disabled 会引入错误的“功能不可用”语义和
弱化样式，也不得通过 CSS、`tabIndex` 覆盖或自定义 DOM render 绕过 HeroUI 的焦点契约。

## 展示契约

### SubAgentActivity 标题

| `kind` | GUI 标题结构 | 详情 |
| --- | --- | --- |
| `started` | 本地化的 started 文案加原句位置的 `Tag(agentPath)` | 空 |
| `interacted` | 本地化文案按当前 locale 包围或前置于 `Tag(agentPath)` | 空 |
| `interrupted` | 本地化的 interrupted 文案加原句位置的 `Tag(agentPath)` | 空 |

`agentPath` 显示完整原值，不截短为叶子名称，不转换为链接，不查询 nickname、role、状态或跨线程
metadata。

### 其他活动

`collabAgentToolCall` 的 spawn、send、resume、wait、close 文案和详情不属于本次 Tag 替换范围。
没有被反引号包裹的 receiver、model、reasoning effort、thread ID 和状态摘要不会顺带变成 Tag。

外层 intermediate-updates disclosure 的标题、计数、折叠交互和视觉文案不属于本次范围。

### 逐条渲染和分组

相邻活动继续使用现有 activity group，普通 message 或 status 继续切断分组。每个活动 identity 仍对应
一个 `article`，不得因为相同 `agentPath` 而共享或合并 DOM identity。

## HeroUI 组件与视觉层级

路径使用 HeroUI v3 compound API：

```tsx
<TagGroup aria-label={accessibleGroupName} selectionMode="none">
  <TagGroup.List>
    <Tag id={agentPath} textValue={agentPath}>
      {agentPath}
    </Tag>
  </TagGroup.List>
</TagGroup>
```

约束如下：

- `TagGroup` 显式使用 `selectionMode="none"`；
- `Tag` 使用完整路径作为可见内容，并提供稳定 `id` 与等值 `textValue`；
- 不提供 selection、remove、press、navigation 或其他交互；
- 保留 HeroUI 原生键盘焦点和 TagGroup 列表导航语义；
- 不设置 `isDisabled`，不覆盖 `tabIndex`，不隐藏焦点样式；
- 不增加 remove button、图标、emoji、avatar、spinner、tooltip 或 popover；
- 不增加可见 `TagGroup.Label`，无障碍名称通过非可见属性提供；
- 继续使用现有 transparent activity surface，以及 HeroUI 的 surface、foreground 和次级文字语义
  token；不新增硬编码颜色；
- Tag 的具体紧凑尺寸、换行类名和间距数值属于实现细节，不在测试中固化。

活动标题需要支持由本地化文本片段和 Tag 组成的结构化 React 内容，不能继续把完整标题压成一个含
终端标记的字符串。无障碍名称应保留完整业务文案和路径，但不包含被移除的终端符号。

## 国际化边界

- 现有 started、interacted、interrupted 的业务含义和各 locale 语序保持不变；
- 路径作为原始机器值传入 Tag，不翻译、不改写；
- 使用 Lingui 的 React 组件插值能力保留不同语言中路径所在的位置；
- 不新增“子代理”“路径”“状态”等可见中文描述标签；
- 旧的含反引号 message ID 若因结构化插值变化而失效，必须通过项目 Lingui 命令更新 catalog，
  不手工伪造生成结果。

## 权威数据与边界

authoritative protocol contract 继续来自 `@codex-protocol/v2` 的生成类型。现有 derivation path 保持：

```text
generated protocol types
  -> transcript projection and item policy
  -> transcript state stored entry
  -> stable TranscriptEntryView
  -> CommittedTranscriptSurface
```

本设计只修改最后一个 GUI renderer 边界。renderer 继续消费 stable `TranscriptEntryView`，不读取 raw
`ThreadItem`、projection envelope 或跨线程 metadata，不创建 consumer-owned DTO、validator、fallback
或兼容分支。

## 保持不变的行为

- 同一活动的 identity、revision 和原位收敛；
- 活动按 projection 已确定的顺序进入 middle；
- 连续活动分组，以及 message/status 对分组的切断；
- chunk 级 selector、memoization 和 bounded rendering；
- final answer 前强制展开，final answer 后默认折叠；
- 折叠时不选择、不渲染、不挂载隐藏活动；
- prompt、model、reasoning effort、完成摘要和错误详情；
- scroll、replay、dedup、snapshot 和 reconnect 语义；
- activity 不提供选择、删除、点击、动作或导航；Tag 仅保留 HeroUI 原生键盘焦点。

## 非目标

- 不修改 Rust、app-server、generated TypeScript、runtime validator 或 schema；
- 不修改 projection、transcript state、threadRuntime 或任何状态 owner；
- 不重新设计 collab tool activity 的业务文案；
- 不修改外层 disclosure；
- 不按代理聚合、去重或统计活动；
- 不增加选择、删除、导航、详情展开或其他交互；
- 不增加图标、emoji、自创状态徽章或可见描述标签；
- 不清洗 raw detail 中的业务字符。

## 预计影响边界

后续计划应先根据实际代码再次收敛，预计仅涉及：

- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx`；
- `codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx`；
- 仅当 Lingui 提取结果变化时，由项目命令更新对应 locale catalog。

不得把 catalog 变化解释为协议或 projection 修改。不得修改 transcript state 测试来掩盖 renderer 问题。

## 测试设计

Browser Mode 测试应验证稳定的用户可见行为：

- 三种 `SubAgentActivity` 的完整路径分别由 HeroUI Tag 呈现；
- Tag 在本地化句子中的位置正确，业务文案与完整路径均可由辅助技术读取；
- 活动区域不再渲染行首项目符号、树形连接符或路径两侧反引号；
- 重复活动继续逐条存在并保持原顺序；
- 详情仍位于所属标题之后，且内容不变；
- activity group、message/status 分界、折叠恢复顺序和 chunk 边界不回归；
- Tag 可通过键盘获得焦点，但没有 selection、remove、press、navigation 或焦点之外的动作；
- final answer 前后既有 disclosure 行为保持不变。

测试不得固化 padding、gap、颜色、Tag 内部 DOM、HeroUI 私有 class 或其他易变样式实现细节。

## 验收标准

概念上的前后对比如下：

```text
之前：终端项目符号 + 已与 + 反引号包裹的 /root/test_boundary + 交互
之后：已与 + Tag(/root/test_boundary) + 交互

之前：终端项目符号 + 已中断 + 反引号包裹的 /root/test_boundary
之后：已中断 + Tag(/root/test_boundary)
```

完成状态必须同时满足：

- 只改变 GUI renderer 的视觉表达；
- 终端符号被真正移除，而不是通过 CSS 隐藏；
- Tag 只替代路径的旧强调包装；
- 所有已确认的时间线、语序和详情层级决策成立；
- Tag 保留 HeroUI 原生焦点行为，但不提供选择、删除、点击、动作或导航；
- 没有协议、projection 或 transcript state 改动；
- 相关 lint、type-check 和 Browser Mode 测试通过。

## 设计否决条件

出现以下任一情况时，后续实现必须停止并回到设计：

- 需要修改协议、projection、transcript state 或 authoritative contract；
- 需要按代理聚合、合并重复活动或改变全局时间顺序；
- 需要把 Tag 移出当前 locale 的原句位置；
- 需要删除或改写现有活动详情；
- HeroUI TagGroup 需要引入选择、删除、点击、动作或导航才能呈现；
- 需要通过隐藏字符、全局字符串清洗或放宽测试来让终端符号不可见；
- 需要修改本设计未覆盖的外层 disclosure 或其他 transcript entry。

## 后续门禁

本文档只落盘设计，不授权创建计划或修改实现。设计获得明确确认后，下一轮才能编写实施计划；实施
计划再次获得明确确认后，才允许修改代码、测试和项目命令生成物。
