# Codex GUI Composer 已选择 Skill 显示与详情设计

日期：2026-08-30

状态：已确认

## 唯一主目标

在不改变 Skill canonical identity、Composer 草稿与提交语义的前提下，把用户已经选择并留在正文原位置的 Skill token 直接渲染为 HeroUI `Chip`，并以整个 `Chip` 作为 HeroUI `Tooltip` 的 hover/focus trigger，提供只读详情，同时保留原子选择、整体删除、复制粘贴、草稿恢复、失效判断和结构化提交行为。

## 文档关系与覆盖边界

本设计以以下决策记录为唯一产品决策输入：

- `docs/superpowers/research/2026/08/30/2026-08-30-composer-selected-skill-display-decisions.md`

本文是对以下既有设计的定向修订：

- `docs/superpowers/specs/2026/08/19/2026-08-19-codex-gui-skill-input-completion-design.md`
- `docs/superpowers/specs/2026/08/22/2026-08-22-codex-gui-composer-skill-restorable-draft-design.md`
- `docs/superpowers/specs/2026/08/29/2026-08-29-codex-gui-skill-typeahead-heroui-style-design.md`

发生冲突时，本文只替代 2026-08-19 设计中“`SkillNode` 必须使用 token `TextNode`、不使用 `DecoratorNode`、不要求真实 HeroUI `Chip` DOM”的判断。以下既有边界继续有效：

- Lexical `EditorState` 是 Composer 编辑内容、selection、history 和 composition 的唯一权威来源；
- `SkillNode` 内的 canonical `name + path` 是选择和提交 identity；
- typeahead 的候选集合、匹配、排序、插入和菜单几何不属于本设计；
- draft 与协议 input 的分阶段权威语义不变；
- queue、`turn/start`、`turn/steer`、delivery、recovery 和 app-server 协议不变。

本文不是 implementation plan，不包含逐文件任务、命令、提交拓扑或实现授权。

## 已确认产品决策

1. 详情只使用现有 skill catalog 元数据，不读取或展示完整 `SKILL.md` 正文。
2. 已选择 Skill 保留在正文中的原位置，作为内联 token 显示；不建立独立 `TagGroup`。
3. token 直接使用 HeroUI React `Chip`，不仿造 Chip 外观。
4. 详情坚持使用 HeroUI `Tooltip`；整个 `Chip` 是 trigger，按 hover/focus 语义显示只读内容，不支持点击固定，也不承诺可靠触摸展开。
5. `Chip` 不显示关闭按钮；用户选择整个 token 后，通过 `Backspace` 或 `Delete` 删除。
6. Tooltip 可以展示显示名、必要时的 canonical `$name`、来源、状态和说明。普通路径不常驻；只有重名消歧或 token 失效时显示必要路径。
7. canonical identity、复制粘贴、草稿保存与恢复、失效判断及 `{type: "skill", name, path}` 提交语义保持不变。

采用 HeroUI `Tooltip.Trigger` 的直接后果是：每个启用状态的 token 会成为可通过 Tab 到达的 focusable `role="button"`。这是“整个 Chip 是 trigger”与 focus 详情语义的组成部分，不得在实现时静默删除。该按钮的唯一激活动作是“在 Lexical 中选择这个原子 token 并把编辑焦点交还 Composer”；它不能成为第二套 selection owner，也不能固定 Tooltip 或提交 Composer。

## 当前事实与根因

当前 `SkillNode` 继承 Lexical `TextNode`，保存 `name`、`path`、`displayName` 和 `sourceLabel`，显示 `$displayName` 并使用 token mode（`codex-gui/src/features/composerEditor/SkillNode.ts:10-49`、`:71-112`）。它没有 React 渲染 seam，因此不能直接返回 HeroUI `Chip` 或 `Tooltip`。

`ComposerEditor` 已经接收完整 `SkillCatalogState`、`skillValidity.invalidPaths`、失效状态文本和 `disabled` 状态（`codex-gui/src/features/composerEditor/ComposerEditor.tsx:38-68`）。catalog candidate 机械派生自 generated `SkillMetadata`，已有 `name`、`description`、`shortDescription`、`interface`、`path` 和 `scope`（`codex-gui/src/features/skillCatalog/skillCatalogOwner.ts:1-18`、`:184-204`）。详情不需要新增协议字段或读取文件。

当前失效视觉由 `SkillValidityPlugin` 对 Skill DOM 命令式写入 class、`aria-invalid`、`aria-label` 和状态文本（`codex-gui/src/features/composerEditor/ComposerEditor.tsx:329-398`）。迁移为 React decorator 后，继续修改外层 DOM 会与 React presentation 形成两个状态 owner。

当前草稿投影通过 `getAllTextNodes()` 收集 Skill path（`codex-gui/src/features/composerEditor/composerDraft.ts:68-80`）。`DecoratorNode` 不属于 TextNode，若只替换渲染基类而不修改投影，已选 Skill 会从发送可用性和失效判断输入中静默消失。

当前 clipboard 只接受 `RangeSelection`（`codex-gui/src/features/composerEditor/ComposerClipboardPlugin.tsx:33-79`）。`DecoratorNode` 的整体选择是 `NodeSelection`，若不闭合该分支，新的 Chip 将无法保持现有 copy、cut、paste 和整体替换行为。

HeroUI 3.2.4 的 `Chip` 默认渲染 `span`，只承担标签、状态和类别展示；`Tooltip.Trigger` 默认渲染 focusable `div[role="button"]`（`/Users/jiangsheng/cnb/heroui/packages/react/src/components/chip/chip.tsx:25-66`；`/Users/jiangsheng/cnb/heroui/packages/react/src/components/tooltip/tooltip.tsx:172-206`）。内联 Lexical paragraph 不能直接接受默认 block trigger DOM，必须通过 HeroUI 提供的 `render` seam 保持合法的 inline DOM。

## 范围

本设计覆盖：

- 已选择 Skill 在 Composer 正文中的 React/HeroUI 内联呈现；
- Tooltip 的详情数据、披露层级、focus、hover 和生命周期；
- Skill token 的 NodeSelection、整体删除、文本替换、undo/redo；
- JSON、纯文本、HTML 和 Lexical clipboard 序列化；
- draft capture、projection、restore 和结构化提交；
- catalog refresh、partial error、失效和 disabled 状态；
- 普通 Composer 与 pending-input 编辑器中的相同行为；
- 自动回归和真实 GUI 无头验收所需的稳定行为边界。

## 非目标

- 不改变 typeahead 候选菜单、查询、排序或选择流程。
- 不引入 `TagGroup`、`Popover`、`Dialog`、Modal、Drawer 或第二个详情入口。
- 不添加 Chip 关闭按钮、点击固定、press-to-open 或触摸详情承诺。
- 不读取完整 `SKILL.md`，不新增文件读取、app-server RPC、Rust 字段、schema 或 generated contract。
- 不把 description、scope、当前 catalog snapshot 或 Tooltip open state 写入 `SkillNode`、draft、queue 或 `UserInput.Skill`。
- 不按 name 重新绑定 Skill，不因 catalog 刷新静默改变已选择 identity。
- 不改变 Composer 提交快捷键、IME、queue、recovery 或 delivery 行为。
- 不引入第二套 portal owner、React root、Redux slice 或通用 inline-token framework。

## 权威数据与状态 owner

### Skill identity

`SkillNodeState` 中的 `name + path` 继续是已选择 Skill 的 canonical identity。`displayName + sourceLabel` 继续是选择时保存的显示快照，用于可逆草稿、失效回退和 catalog 暂时不可用时的稳定显示。

Tooltip 不得用当前 catalog 的同名候选替换该 identity，也不得把 path 从节点中移除。

### 当前详情

当前 `SkillCatalogState.candidates` 是 description、short description、interface 和 scope 的权威来源。详情只按节点的精确 `path` 查找 candidate：

- 精确命中时，description 和当前 scope 信息来自该 candidate；
- 未命中时，不按 name、display name 或 scope 猜测替代 candidate；
- 节点的 `displayName`、canonical `name` 和 `sourceLabel` 仍可作为已保存身份快照显示；
- Tooltip presentation 不拥有 catalog refresh、retry 或错误恢复。

### 失效状态

`skillValidity.invalidPaths` 继续是“当前已经确认失效”的唯一前端投影。它只在完整可信的 `ready` catalog 且无 partial errors 时判定 path 缺失（`codex-gui/src/features/composerTurnControl/composerTurnControlModel.ts:47-62`）。

React token 只消费该结果，不重新根据 catalog type 或候选缺失计算失效。`initialLoading`、`refreshing`、`stale`、`failed` 或 partial error 状态下的暂时未命中不得显示为 invalid。

### 路径披露

路径披露使用一个共享的 presentation owner，复用 typeahead 已有的 canonical-name collision 与最短唯一父路径语义；不得在 Tooltip 内再维护另一套 name/path 推导规则。

- 普通、有效且不重名的 token 不显示路径。
- 当前 catalog 中相同 canonical name 对应多个不同 path 时，显示该 token 的最短唯一父路径。
- token 已确认失效时，从末级父目录开始显示最短诊断后缀；只有当前文档或 catalog 中相同 canonical name 的其他 path 仍与其冲突时才逐级扩展，直到唯一。不得默认显示绝对根、用户目录前缀或末尾 `SKILL.md` 文件名。
- path 只进入 Tooltip 的条件性只读详情，不进入 Chip label、普通 HTML copy 或可见正文文本。

## Module、Seam 与 Interface

### `SkillNode` Module

`SkillNode` 迁移为内联 `DecoratorNode<JSX.Element>`。它仍是结构化 Skill identity、Lexical node type、plain-text projection 和 JSON serialization 的 owner；父类变化不得扩大其 Interface。

稳定 Interface 继续包括：

```ts
type SkillNodeState = Readonly<{
  name: string;
  path: string;
  displayName: string;
  sourceLabel: string;
}>;

$createSkillNode(state): SkillNode
$isSkillNode(node): node is SkillNode
skillNode.getSkill(): SkillNodeState
```

Implementation 必须满足：

- `createDOM()` 只建立一个 inline `span` host；
- `decorate()` 只桥接到已选择 Skill 的 React presentation；
- `getTextContent()` 明确返回 `$displayName`；
- `exportDOM()` 明确只导出 `$displayName`，不得导出 Tooltip DOM、path 或 canonical name；
- `isInline()` 和 keyboard-selectable decorator 语义保持原子节点行为；
- 不再使用 `TextNode.setMode("token")` 或命令式 React mount。

### Selected Skill presentation Module

React presentation 是一个窄 Interface 的深 Module。调用方只提供 `nodeKey + SkillNodeState`；该 Module 隐藏 HeroUI composition、详情解析、invalid/disabled presentation 和 Tooltip 生命周期。

它不拥有提交 identity、catalog 请求、draft、queue 或协议转换。删除该 Module 会使 Chip/Tooltip、focus、ARIA、invalid 和详情披露逻辑重新散落到 Lexical node、Composer 和 catalog 调用方，因此该 seam 具有足够 Depth 与 Locality。

### Presentation environment

`ComposerEditor` 在现有 `LexicalComposer` React 树内提供一个 presentation environment，输入只来自已经存在的：

- `skillCatalog`；
- `skillValidity`；
- `disabled`。

Decorator portal 通过 React context 消费该 environment。context 可以在内部建立 path index 和 presentation projection，但不得形成新的 catalog store、复制 generated contract，或持久化 candidate snapshot。

### Skill editing Module

一个 editor-private editing Module 统一处理 Skill `NodeSelection` 的删除、文本替换和 focus 归还。它的 Interface 是 Lexical command registration，不暴露 Tooltip 内容，也不向 React presentation 复制 selection 状态。

Lexical `NodeSelection` 是唯一 token selection owner。React 只通过 Lexical 提供的 node-selection hook 投影选中态；不得维护独立 `selectedSkillKey`。

该 Module 还提供一个 editor-private 的原子激活 Interface，语义为“若 node 与 editor root 仍有效，则建立唯一 Skill `NodeSelection`，再显式把 DOM focus 放回 root；否则不激活”：

```ts
activateSkillNode(nodeKey): "activated" | "unavailable"
```

Lexical `editor.focus()` 在当前 selection 是 `NodeSelection` 时不会自行执行 root DOM focus，因此该 Interface 不能把 focus handoff 假定为 Lexical 默认行为。Implementation 必须在一次受控动作中验证 node、root 与 mounted 状态，完成 selection update 后对同一 root 显式 focus；node 已删除、root 已替换或 Composer 已卸载时返回 `unavailable`，不得把 focus 交给旧 DOM 或留下新的业务状态。

### Draft 与 clipboard Adapter

`composerDraft` 和 `ComposerClipboardPlugin` 是现有数据 seam 的 Adapter，不归 presentation Module 所有：

- draft Adapter 按文档顺序遍历完整 Lexical tree，而不是只遍历 TextNode；
- clipboard Adapter 接受 `RangeSelection` 与 `NodeSelection`，继续为不同输出格式提供既有语义；
- 二者都只识别 `SkillNode` 的稳定 Interface，不读取 React Chip 或 Tooltip DOM。

## 内联 DOM 与 HeroUI 组合

目标 DOM 语义为：

```text
inline Lexical decorator host: span[contenteditable="false"]
└── HeroUI Tooltip
    ├── Tooltip.Trigger rendered as inline span[role="button"][tabindex="0"]
    │   └── Chip
    │       └── Chip.Label("$Display Name")
    └── Tooltip.Content[role="tooltip"]
        └── read-only detail content
```

硬约束：

- 必须直接使用 HeroUI `Chip`、`Tooltip`、`Tooltip.Trigger` 和 `Tooltip.Content` compound API。
- `Tooltip.Trigger` 必须把 HeroUI 泛型元素显式绑定为 `span`（`Tooltip.Trigger<"span">`，或经类型检查证明等价的 typed wrapper），再通过其 `render` Interface 输出并转发 props/ref 到同一个 inline `span`。不得在默认泛型仍是 `div` 时只让 render callback 返回 `span`，不得把默认 `div` 放入 inline Lexical paragraph，也不得仅用 CSS `inline-block` 掩盖非法 DOM nesting。
- 整个可见 Chip 位于 Trigger 内，不能只让图标、文字片段或不可见元素触发详情。
- Chip 使用 `size="sm"`、默认语义色和 `variant="secondary"` 表达普通已选标签。
- invalid token 使用 HeroUI `color="danger"` 与 `variant="soft"`，并在实际 focus owner 上保留 `aria-invalid`、可访问名称和现有本地化状态文本；危险色不能替代 ARIA。
- NodeSelection 与 focus-visible 使用项目现有 focus/accent 语义 token，不新增硬编码颜色。
- Chip 不渲染关闭图标、close slot 或尾部操作。

## Tooltip 内容与披露层级

Tooltip 是只读信息层，不包含按钮、链接、复制、重试、滚动控制或其他可交互后代。

内容顺序固定为：

1. 显示名，使用节点保存的原始 `displayName` 作为标题；Chip label 中保留的 `$` 前缀不进入比较。
2. canonical `$name`，仅在原始 `name !== displayName` 时显示；判断完成后再为 canonical name 添加 `$` 前缀。
3. 来源，精确 catalog candidate 可用时由当前 `scope` 机械派生；否则使用节点保存的 `sourceLabel`。
4. 状态，仅在有信息价值时显示；已确认失效使用现有本地化 invalid 状态，不为正常 token 重复显示“可用”。
5. 说明，沿用现有 `interface.shortDescription`、`shortDescription`、`description` 优先顺序；没有说明时不创建空行。
6. 路径，只在 canonical-name collision 或已确认失效时按前述披露规则显示。

布局使用 HeroUI Tooltip 默认 overlay surface、`max-w-xs` 与自然换行。说明和路径必须在该宽度内断行；Tooltip 内不建立交互式滚动区，也不通过扩大 document 尺寸容纳内容。实现验收若证明真实 catalog 内容无法在目标 viewport 内闭合，必须回到设计边界处理，不得静默裁掉说明、恢复 Popover 或添加 scroll lock。

Tooltip 使用 HeroUI 自有打开、关闭、延迟、placement 和 overlay lifecycle，不另建 React `isOpen` owner。它只按 hover/focus 打开：

- 不因 NodeSelection 本身强制打开；
- 不在 click/press 后保持固定；
- pointer 离开、focus 离开、Escape 或节点卸载后按 HeroUI 生命周期关闭；
- 不承诺触摸设备能够可靠展开。

## 编辑、选择、删除与焦点语义

### Lexical 编辑焦点

普通输入、方向键、IME、undo/redo 和提交快捷键继续由 Lexical editor 拥有。pointer 或键盘激活 Chip 时建立单节点 `NodeSelection` 并把编辑焦点交还 Composer，但不把 Composer selection 复制到 React state，也不创建独立业务选择模型。

### Tooltip focus

启用状态的 Tooltip Trigger 进入 Tab 顺序。获得 focus 时：

- Tooltip 按 HeroUI focus 语义打开；
- 只提供详情查看，不因 focus 本身改变当前 Lexical selection；
- focus owner 仍只是详情 trigger，不接管 Composer draft 或提交状态。

pointer click、Enter 或 Space 激活 Trigger 时：

- editing Module 的原子激活 Interface 使对应 Skill 成为唯一 `NodeSelection`，并对当前 mounted editor root 执行显式 DOM focus；
- 激活返回 `unavailable` 时不访问旧 node/root，也不伪造成功的选中视觉；
- 激活成功后，后续编辑、删除和提交快捷键仍由 Lexical owner 处理；
- Tooltip 随 focus 离开关闭，不进入固定打开状态。

Tab/Shift+Tab 可以离开 token 并进入下一个可聚焦目标。Composer disabled 时，decorator trigger 必须同步退出 Tab 顺序并禁用 Tooltip；不能只调用 `editor.setEditable(false)` 后留下可操作 token。

### 删除与替换

- Lexical focus 下选择整个 token 后，`Backspace` 或 `Delete` 在一个 history step 中删除该节点。
- Trigger focus 下按 `Backspace` 或 `Delete` 可以直接把当前 token 作为目标执行同一 Lexical 删除语义，随后把 focus 与折叠 caret 放回原 token 位置。
- 删除可以 undo/redo，不产生关闭按钮专用路径。
- 选中 token 后输入普通文本时，token 作为一个整体被替换；不能让输入落入 Chip 内部。
- 左右方向键跨越 token 时保持 inline decorator 的原子导航，不进入 Chip label 内部。
- Trigger focus 下的 Enter 或 Space 只执行“选择 token 并返回 Composer”动作，不提交 Composer、不固定 Tooltip，也不删除 token。

### 生命周期清理

节点删除、clear、draft restore、Composer unmount、pending editor 关闭或 catalog replacement 后，不得残留 Tooltip portal、旧 nodeKey、旧 focus 或旧详情内容。

## JSON、草稿、剪贴板与提交 invariants

### JSON 与文本投影

- `SkillNode` 继续导出 `type: "skill"`、`version: 1`、现有四个状态字段，以及当前 `SerializedTextNode` shape 中的 `detail`、`format`、`mode`、`style`、`text` 字段。
- version 1 的 `text` 必须由 `$displayName` 机械生成，`mode` 保持 `"token"`；其余 TextNode 兼容字段保留既有类型和默认语义，但不成为新的产品状态或 Tooltip 输入。
- 父类迁移不得让同一 version 的 JSON wire shape 漂移；现有 version 1 payload 仍由唯一 import path 恢复，不新增 v1/v2 双写或运行时 fallback。
- 未知 version 继续明确拒绝，不能断言为有效 Skill。
- `getTextContent()` 和 HTML export 只产生 `$displayName`。
- React presentation、Tooltip 内容、catalog description、scope、invalid 与 disabled 状态不进入 JSON。

### Draft

- `projectComposerDraft()` 必须按文档顺序识别全部 Skill decorator，保留重复 path 和节点顺序。
- capture 与 restore 保留四个节点字段、正文位置和重复节点。
- catalog refresh 不重写已保存 draft；restore 后只重新投影当前 validity 和详情。
- current draft 的 `textContent` 继续包含 `$displayName`，不包含 Tooltip 文本。

### Clipboard

- `text/plain` 继续把选中的 Skill 编译为 canonical `$name`。
- `text/html` 只包含可见 `$displayName`，不包含 path、canonical hidden identity、Tooltip DOM 或详情。
- 同 namespace Lexical MIME 继续保留完整 Skill identity，粘贴后恢复同一个结构化 SkillNode。
- 外部 HTML 或 canonical-looking 纯文本不自动绑定为 Skill。
- `NodeSelection` copy/cut/paste 与 `RangeSelection` 使用同一序列化规则；cut 和 paste 整体替换节点并进入 history。

### 提交

`compileNode()` 继续直接读取 `SkillNode.getSkill()`：

- 正文位置编译为 canonical `$name`；
- 结构化 item 继续是 `{type: "skill", name, path}`；
- 同 path 的结构化 Skill item 继续去重；
- 不新增 description、scope、displayName、Tooltip 或 presentation 字段；
- queue 和 `turn/start` / `turn/steer` 消费者无需知道节点渲染父类已改变。

## Catalog 生命周期与失效呈现

| Catalog 状态 | 精确 path 命中 | Token/Tooltip 行为 |
| --- | --- | --- |
| `ready` 且无 partial errors | 是 | 普通 Chip；使用当前 candidate 说明与 scope。 |
| `ready` 且无 partial errors | 否 | 保留节点 identity；显示 invalid Chip、状态和诊断 parent path；既有提交门禁继续阻止发送。 |
| `initialLoading` / `refreshing` / `stale` / `failed` / partial error | 是 | 使用当前保留 candidate 详情，但不自行宣布 invalid。 |
| `initialLoading` / `refreshing` / `stale` / `failed` / partial error | 否 | 使用节点显示快照；说明可以缺席；不得降级为普通文本或猜测重绑。 |

若相同 path 的 catalog metadata 变化，Tooltip 可以反映当前 description 与 scope；Chip label、canonical name/path 和已捕获 input 不静默变化。

## 响应式、滚动与可访问性

- Chip 与前后普通文本保持同一 inline flow，可以随正文自然换行，不产生独立 Tag 区域。
- Chip 不扩大 Composer 的水平 scroll width；长显示名必须在既有编辑宽度内闭合。
- Tooltip overlay 不得修改 `body`/document overflow，不得阻止 Composer、pending drawer 或 transcript 的既有滚动。
- 打开、关闭或切换 Tooltip 不得增加 document scroll width/height，不得推动 Composer 布局。
- Composer 内部滚动时 Tooltip 必须跟随或关闭，不能停留在旧坐标。
- Trigger 的 accessible name 必须包含 Skill 显示名和“详情”意图；invalid 时同时表达失效状态。
- Tooltip 内容通过 `role="tooltip"` 与当前 trigger 关联，不能只靠颜色、hover 或视觉位置表达。
- pointer 用户可 hover 查看；键盘用户可 Tab focus 查看。可靠触摸展开不在支持范围内。
- reduced-motion、dark theme、high contrast 和 focus-visible 沿用 HeroUI 与项目语义 token。

## 验证设计

### Level 1：自动回归

Unit 与三浏览器 Browser Mode 必须覆盖稳定 observable outcomes：

- `SkillNode` 四字段、version 1 JSON、`$displayName` text/HTML export 和未知 version 拒绝；
- DecoratorNode 迁移后 draft projection、capture、restore、重复 path、同名不同 path、canonical 编译与结构化 payload 不变；
- 真实 HeroUI Chip/Tooltip DOM、inline span trigger、普通/selected/invalid/disabled 状态；
- hover 打开、focus 打开、移开/移焦/Escape/删除/unmount 后关闭，不产生 click pin；
- Tab/Shift+Tab、左右方向键、Enter、Space、Backspace、Delete、普通文本替换、undo/redo 和 IME 不回退；
- catalog `ready`、refreshing、stale、failed、partial error 与 invalid 状态迁移不产生错误重绑；
- plain text、HTML 和同 namespace Lexical clipboard 的 identity 与 path 披露边界；
- 普通 Composer 与 pending-input editor 使用同一 presentation 和 editing 语义；
- 窄宽度、长显示名、长说明、重名 path 和 Composer 内部滚动不产生横向 overflow、布局推动或旧 Tooltip portal。

测试应断言真实 DOM、可访问名称、selection、payload 和几何结果，不锁定 Tooltip delay 数值、临时 class 顺序、像素颜色或内部 React 结构。

### Level 2：真实 GUI 无头验收

Level 2 适用且必需。真实 Codex runtime 必须覆盖：

- 从真实 catalog 选择 Skill 后，正文原位置显示 Chip；
- hover/focus 详情、重名消歧和 invalid 详情与真实 metadata 一致；
- pointer、keyboard、删除、提交和恢复后的 focus flow；
- Composer、transcript 与 pending drawer 滚动不被 Tooltip 阻止；
- 桌面和窄 viewport 下 Tooltip placement、遮挡、裁切、换行与 document 几何闭合；
- 删除或提交后没有残留 overlay。

Level 1 fixture 不能替代这部分真实 catalog、overlay host 和滚动组合验证。

### Level 3：可见桌面验收

当前设计不依赖系统窗口、跨应用 focus、DevTools、真实系统 IME UI 或其他只能在可见桌面证明的行为，因此 Level 3 当前不适用。若后续把真实系统触摸或 macOS IME UI 纳入目标，必须重新判定并取得可见窗口专门授权。

本设计不修改 Rust、TUI 或协议，不需要 Rust 构建、TUI `insta` snapshot、app-server schema 生成或后端测试。

## 主要风险与控制

| 风险 | 控制 |
| --- | --- |
| `Tooltip.Trigger` 新增 focusable button，抢走 Composer 键盘行为 | Lexical 保持唯一 selection owner；focus 只查看详情；press 通过原子激活 Interface 建立 NodeSelection 并显式 focus 当前 root；显式隔离提交与删除并验证完整 focus flow。 |
| 默认 Trigger `div` 破坏 inline paragraph DOM | 必须显式绑定 `Tooltip.Trigger<"span">`，再通过 HeroUI `render` seam 输出同类型 inline `span` 并传递 props/ref。 |
| Decorator 默认 text/export 为空 | `SkillNode` 显式实现 `$displayName` text 与 display-only HTML export。 |
| `getAllTextNodes()` 漏掉 Skill | draft Adapter 改为完整文档顺序遍历，提交递归继续先识别 SkillNode。 |
| NodeSelection 不能 copy/cut/paste 或整体替换 | editing Module 与 clipboard Adapter 明确支持 NodeSelection，并穿过现有 history。 |
| invalid 同时由 DOM mutation 与 React 管理 | 移除 Skill DOM mutation presentation；保留上游 invalidPaths owner，由 React 单向渲染。 |
| catalog refresh 改写已选择 identity | catalog 只提供当前详情；节点 identity 与 capture input 不变。 |
| Tooltip 影响滚动或溢出 viewport | 不引入 modal/scroll lock；Level 1 几何与 Level 2 真实滚动验收作为完成条件。 |
| Tooltip 详情泄漏到正文、草稿、clipboard 或协议 | 所有数据 seam 只读取 SkillNode Interface；presentation context 不进入任何序列化输出。 |

## 设计完成标准

实现后的最终状态必须同时满足：

1. 用户选择 Skill 后，正文原位置显示真实 HeroUI `Chip`。
2. 整个 Chip 通过真实 HeroUI `Tooltip` 提供 hover/focus 只读详情。
3. token 仍是一个 Lexical 原子节点，可选中并用 `Backspace` / `Delete` 整体删除。
4. Tooltip focus 不导致误提交、点击固定、第二套选择状态或滚动锁。
5. catalog 详情与失效状态各自只有一个权威 owner。
6. canonical identity、草稿、clipboard 和 `{type: "skill", name, path}` 提交语义无回退。
7. path 只在重名或失效时按条件披露，不进入普通正文或 HTML copy。
8. 全部适用 Level 1 与 Level 2 场景通过；Level 3 保持不适用。

## 阶段边界

本文状态为“待确认”。在用户明确确认设计前，不得创建或落盘 implementation plan；在设计与后续计划分别确认、且相关工作文档形成独立本地提交前，不得开始实现。
