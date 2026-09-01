# Codex GUI Composer 回归 Lexical 0.49 官方能力设计

## 状态

- 设计状态：已确认
- 日期：2026-09-01
- 范围：整个 Composer 输入框
- Lexical 基线：`v0.49.0`（参考 checkout：`/Users/jiangsheng/GitHub/lexical` 的 `0.49.0__release`）

## 背景

Composer 为把 skill chip 模拟成 textarea 中的超长原子字符，自行接管了多行方向键、DOM 光标几何、selection 恢复、focus、scroll 和浏览器差异。该实现规模较大，但仍无法稳定复现原生 textarea 的光标与选择语义。

本设计不再继续补齐这套模拟层。Composer 保留 `PlainTextPlugin`，优先采用 Lexical 0.49 已有的 node、selection、command、history 和 typeahead 能力；0.49 缺失的行为直接接受，不回移新版补丁，也不在项目中复刻、补偿或增加 fallback。

本设计依据：

- [Composer 官方能力清理机械汇总](../../../research/2026/09/01/2026-09-01-composer-editor-official-capability-cleanup.md)
- [Composer skill token 导航历史调研](../../../research/2026/08/31/2026-08-31-composer-skill-token-up-down-navigation.md)

## 目标

1. 让 Lexical 0.49 重新成为 Composer 普通文本光标、选择、方向键和 history 粒度的唯一 owner。
2. 删除没有独立产品或数据职责的项目自研编辑层，尤其是光标、选择和 DOM 几何代码。
3. 继续保留 Composer 对 skill、structured payload、draft、clipboard、IME、无障碍和队列恢复的独立业务合同。
4. 收敛重复 owner，使一个交互只存在一条权威执行路径。

## 非目标

- 不迁移到 `RichTextPlugin` 或其他富文本编辑器。
- 不要求实现完整 textarea 选择语义。
- 不保证方向键能够进入或退出 chip，也不保证上下键、左右键在多行内容中的结果与 textarea 一致。
- 不回移 Lexical 0.49 之后的提交或补丁。
- 不为 Lexical 0.49 缺失能力新增 DOM 几何补偿、浏览器特判、兼容层或 fallback。
- 不新增多个 chip 的批量选择、复制、替换或删除能力。

## Owner 边界

### Lexical 0.49 拥有

- 普通文本的光标移动和 selection 修改。
- 四个方向键的默认处理。
- `RangeSelection`、`NodeSelection` 及其官方 primitive。
- 默认 history 分组与 Undo/Redo 粒度。
- `LexicalTypeaheadMenuPlugin` 的菜单状态、键盘导航、滚动和官方静态 DOM/ARIA 基线。

项目不得在这些职责之前增加高优先级 command 接管，也不得在之后通过 DOM selection、坐标命中或异步恢复修正 Lexical 的结果。

### Composer 拥有

- skill 的目录数据、插入、显示、激活、替换和原子删除语义。
- canonical `name + path` 与可见 `displayName` / `sourceLabel` 的区分。
- clipboard 文本和 structured payload。
- draft capture / restore、queue / pending restore。
- IME 与无障碍业务合同。
- typeahead 的业务数据、候选排序、结果渲染和选中后的 skill 插入。
- Lexical 0.49 不支持的多编辑器唯一 typeahead ID 与 ARIA 引用同步。

这些职责只能通过 Lexical 0.49 的公开能力接入，不得重新取得普通光标或 selection 算法的所有权。

## SkillNode 选择与编辑

### 单选语义

chip 继续保持单选。点击、`Shift+click`、Enter 或 Space 激活 chip 时，先清除其他 Lexical selection，再只选中当前 `SkillNode`。`Shift+click` 不采用官方 Equation 示例的多选产品语义。

选择接入使用 Lexical 官方 `CLICK_COMMAND` 和 `useLexicalNodeSelection`。项目只保留“单选”这一产品规则，不自行构造或恢复 DOM selection。

### 替换与删除

`PlainTextPlugin` 不处理 `NodeSelection` 下的文字替换和删除，因此保留最薄的业务 adapter：

- 输入替换选中的 chip 时调用官方 `NodeSelection.insertNodes()`。
- 删除选中的 chip 时调用官方 `NodeSelection.deleteNodes()`。

adapter 只把 Composer 的业务意图桥接到官方 primitive；它不得处理方向键、DOM range、坐标、焦点、滚动、selection 恢复或浏览器兼容。

### 序列化

`SkillNode` 继续保存 structured payload 所需的 canonical 与展示字段，但序列化形态回归官方 decorator node 模式：基于 `SerializedLexicalNode` 与 `super.exportJSON()`，删除 TextNode 风格且没有业务消费者的字段和插入边界方法。

## 导航与 History

### 导航

删除项目自研的四方向 command、`Selection.modify()`、DOMRect/caret 几何、RTL 几何推断、focus/scroll 恢复、DOM selection 恢复和双 RAF 清理。

删除后，普通文本和 chip 周边的方向键结果完全由 Lexical 0.49 与浏览器决定。即使现有两步左右导航、上下进入相邻行或 only-chip 边界行为退化，也不在本版本内补齐。

### Undo/Redo

删除 history continuation 与项目使用的 `HISTORY_MERGE_TAG` 合并策略。选中 chip 后输入文字时，“替换 chip”和“后续连续输入”允许成为多个 Undo 步骤；实际粒度服从 Lexical 0.49 默认行为。

## Composer 其他收敛

- Enter 只保留 Lexical command owner，删除与其重复的 root DOM `onKeyDown` owner。
- 删除无调用的 `CONTROLLED_TEXT_INSERTION_COMMAND`、`DELETE_CHARACTER_COMMAND` 高优先级注册和重复删除 helper。
- typeahead 继续使用 `LexicalTypeaheadMenuPlugin`。由于 Lexical 0.49 固定使用全局 `typeahead-menu` / `typeahead-item-${index}` 且没有 per-editor ID 配置，保留最小 `MutationObserver` ID 同步层，维持多个 Composer 同时打开菜单时的唯一 ARIA 引用；这是本设计明确保留的官方能力缺口适配。
- composition 开始时保留一个 `COMPOSITION_START_COMMAND` cleanup，删除重复的原生 `compositionstart` listener；官方 Typeahead 在 composing 时只跳过 update，不会关闭已经打开的菜单。
- 删除项目重复实现的 typeahead 选项滚动，让官方菜单 command 成为唯一滚动 owner。
- 业务 UI 可以继续渲染 HeroUI chip、tooltip 和候选菜单，但展示组件不得接管编辑器 selection 或键盘导航算法。

## 必须保持的合同

清理后仍须保持：

- skill 插入、单选激活、文字替换和原子删除。
- canonical identity 与 structured `UserInput.Skill` 生成。
- 纯文本 clipboard 输出不泄露内部 path。
- draft capture / restore 与 queue / pending restore 不丢失 skill 信息。
- IME 不产生重复提交、重复删除或 composition 中途替换。
- chip 与 typeahead 的既有无障碍名称、角色和可操作性。
- 多个 Composer 同时打开 typeahead 时，menu/option ID 保持唯一，且每个 editor 的 `aria-controls` / `aria-activedescendant` 指向自身实际节点。
- typeahead 的业务候选、排序、渲染和选择结果。

这些合同若需要项目代码，应保留最小业务 adapter；“代码是自研的”本身不是删除理由，“模仿 Lexical 编辑算法”才是本次清理边界。

## 测试边界

- 删除仅用于验证自研四方向、DOM 几何、RTL 命中、selection 恢复和 history continuation 的测试。
- 保留并收敛 skill 插入、单选激活、替换、原子删除、clipboard、structured payload、draft、canonical identity、IME、无障碍、queue / pending restore 和 typeahead 业务合同测试。
- 不新增要求 Lexical 0.49 具备 textarea 完整导航或选择语义的测试。
- 不以修改断言、fallback 或浏览器特判掩盖业务合同回归；若保留合同无法通过官方 primitive 实现，应停止并回到设计，而不是恢复自研编辑算法。

## 接受的取舍

- 选择较少的项目代码与更清晰的 owner，接受当前版本的方向键和 Undo 体验可能不如现有定制行为。
- 保留必要的 Composer 业务 adapter，避免把“使用官方能力”错误解释为删除 structured payload、draft、clipboard 或原子 skill 编辑。
- 对 Lexical 0.49 已确认缺失、但用户明确要求保持的多编辑器唯一 ARIA 合同，保留边界清楚的最小 ID 同步适配；不得由此扩张为通用 DOM 或 selection 修正层。
- 后续 Lexical 正常升级时重新评估官方新增能力；本设计不预先实现未来版本行为。

## 阶段边界

本文只确认设计，不构成实施计划或实现授权。下一阶段需单独编写并确认计划；在设计与计划工作文档形成独立本地提交之前，不得开始实现。
