# Codex GUI Skill 输入补全设计

状态：已确认

日期：2026-08-19

## 唯一主目标

为 Codex GUI Composer 增加 skill 输入补全：用户输入 `$` 后可以从当前工作目录可用的 skill 中筛选并选择；选中结果在编辑器中以简洁、可移动的原子 token 展示，同时可靠保存 canonical skill `name + path`，最终通过 app-server 的结构化 `UserInput::Skill` 提交。

## 背景与当前代码证据

### Composer 仍是纯字符串 TextArea

`codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx` 当前：

- 以 React `draft: string` 持有整段草稿。
- 使用 HeroUI v3 `TextArea` 作为唯一编辑控件。
- 键盘行为只覆盖 Enter、Shift+Enter 与 IME composition 防误发。
- 不存在 slash command、mention、autocomplete、caret popup、候选 selection 或结构化 inline node。

这个模型无法在可编辑内容内部把“友好显示名称”和 canonical path 绑定为同一个可移动实体。为满足本设计，Composer 编辑内核必须从 `textarea + string` 迁移到结构化 editor state；不能继续把 skill identity 放进外置字符区间表，也不能把 path 编码进用户可见 Markdown。

### 队列只保存普通文本

`codex-gui/src/features/composerInputQueue/composerInputQueue.ts` 的 `ComposerQueueMessage` 当前只有：

```ts
type ComposerQueueMessage = Readonly<{
  id: string;
  text: string;
}>;
```

`composerInputQueueCoordinator.ts` 在 `performStart` 中固定生成单个 text input：

```ts
input: [{ type: "text", text: claim.message.text, text_elements: [] }]
```

因此，即使界面能够选择 skill，现有 queue/recovery 路径仍会丢失 path。消息进入队列前必须编译成 canonical `UserInput[]`，队列与 recovery 必须原样拥有该结构化载荷，重试时不得重新扫描文本或按名称猜测目标。

### app-server 已有权威 skill 协议

app-server v2 已提供所需权威契约：

- `skills/list` 接受 `cwds` 与 `forceReload`，按 cwd 返回 `SkillMetadata`。
- `SkillMetadata` 已包含 `name`、`description`、`interface`、`path`、`scope` 与 `enabled`。
- `skills/changed` 是 invalidation notification；客户端收到后应以当前参数重新调用 `skills/list`。
- `turn/start.input` 的生成 `UserInput` union 已包含 `{ type: "skill", name, path }`。

GUI 不应自行扫描 `.codex/skills`、`.agents/skills`、插件缓存或解析 `SKILL.md`。这样会复制 app-server 已拥有的 roots、scope、插件、禁用、缓存、远端 filesystem 与错误语义。

### GUI Host 尚未接通 skill RPC

当前链路存在四个明确缺口：

- `codex-rs/gui-host/src/filter.rs` 不允许 `skills/list`，也不转发 `skills/changed`。
- `codex-gui/src/features/guiHost/appServerProtocol.ts` 的 GUI 请求/通知子集不含这两个方法。
- 生成的 app-server schema 知道完整协议，但 GUI runtime descriptors 尚未为该子集生成消费入口。
- `GuiHostCommands` 没有 list skills 命令，notification 路由将 `skills/changed` 视为 `knownUnconsumed`。

只修改 Composer 会在 GUI Host ingress 被 `-32601 Method not found` 拒绝，不构成可达功能。

## 已确认产品决策

设计期间预计并完成了 4 项实质决策：

1. token 通常只显示名称；只有发现重名时才追加简短来源。
2. token 显示 `$` 加友好展示名；没有展示名时回退 canonical name。复制为普通文本时输出 `$canonical-name`。
3. `$查询词` 只匹配 canonical name 与友好展示名；description 只作为候选说明，不参与过滤。
4. skill 列表部分或全部加载失败时，在候选框内显示非阻塞状态；部分失败继续展示有效 skill，全部失败提供重试，普通编辑和普通发送不受加载状态影响。

## 范围

本设计包含：

- GUI Host 与 GUI frontend 对 `skills/list`、`skills/changed` 的权威协议接入。
- 当前 thread cwd 的 enabled skill catalog owner。
- 基于 Lexical 的 Composer 编辑内核。
- 原子 `SkillNode`、`$` typeahead、候选过滤与选择。
- editor state 到 canonical `UserInput[]` 的编译边界。
- queue、recovery 与 `turn/start` 对结构化输入的端到端所有权。
- 中文输入法、键盘、剪贴板、可访问性、移动端与浏览器验证。

## 非目标

- apps、plugins、connectors、`@` mention 或 slash commands 补全。
- 粗体、斜体、标题、列表、链接、Markdown AST 或通用富文本工具栏。
- 用户自行输入或编辑任意 path。
- skill 安装、启用、禁用、配置、管理或 marketplace UI。
- 修改 app-server `skills/list`、`skills/changed` 或 `UserInput::Skill` 的 wire shape。
- 把 path 写进 DOM attribute、HTML clipboard、可见文本、日志或 transcript。
- 队列持久化、页面刷新恢复或跨 thread 转移。

## 编辑器框架选择

### 采用 Lexical

采用精确版本：

- `lexical@0.49.0`
- `@lexical/react@0.49.0`
- `@lexical/clipboard@0.49.0`

三个依赖均已由用户安装到当前工作树的 `codex-gui/package.json` 与
`pnpm-lock.yaml`，当前尚未暂存或提交。`@lexical/clipboard` 用于沿用 Lexical 的
namespace、selection slicing 与节点 JSON clipboard 协议，以便同一受信编辑器内保留
`SkillNode` identity，不自行复制这套 clipboard 协议。

采用 Lexical 的原因：

- 自定义 `TextNode` 可以在 editor tree 内持有 canonical identity，并以 token mode 表达不可拆分节点。
- `LexicalTypeaheadMenuPlugin` 提供 caret query、popup anchor 与键盘 menu primitive。
- `EditorState` 原生支持结构化 JSON round-trip。
- Lexical 暴露 composition 状态，可以在插件层显式保护 IME 行为。
- React binding 支持当前 React 19，框架本身为 MIT。
- Lexical 是 headless editor；HeroUI 仍可负责 Composer surface、候选行、错误状态和按钮的产品外观。

首版只启用 plain-text 编辑能力、自定义 `SkillNode`、typeahead、history 与必要 clipboard 行为。不得因为已引入 Lexical 就开放其他富文本语义。

### 不采用的候选

Tiptap/ProseMirror 能通过 `inline: true`、`atom: true` 与 suggestion extension 实现同类功能，但对当前单一 token 需求引入更大的 schema、NodeView 与依赖表面。Slate 同样可实现 inline void node，但其 Firefox CJK composition 风险与当前 Composer 的 IME 约束直接冲突。原生 `textarea + sidecar ranges` 被明确否决：重复名称、移动、撤销、粘贴与顺序调整会把字符映射维护变成本功能自己的编辑器实现。

## Lexical 文档模型

### 单一权威 EditorState

Composer draft 的唯一编辑权威改为 Lexical `EditorState`。React 不再同步保存第二份可独立变化的 `draft: string`；普通文本、skill 节点、selection、history 和 composition 都由同一个 editor owner 管理。

示意结构：

```text
Root
└── Paragraph
    ├── TextNode("请使用 ")
    ├── SkillNode(name, path, displayName, sourceLabel)
    └── TextNode(" 检查这个方案")
```

现有发送可用性、草稿非空判定和提交清空必须读取 editor owner 的稳定投影或命令结果，不能通过 DOM `textContent` 或另一份 React string 猜测状态。

### SkillNode

`SkillNode` 使用自定义 token `TextNode`，而不是 `DecoratorNode`：

- token node 已足以提供不可拆分选择、移动、删除与文本式渲染。
- 避免为一个短标签引入嵌套 React subtree、额外 focus target 与更复杂的 selection/a11y 边界。
- 视觉上可用 Lexical theme class 和项目语义 token 呈现轻量 token，不要求真实 HeroUI `Chip` DOM。

节点至少保存：

```ts
type SkillNodeState = Readonly<{
  name: SkillMetadata["name"];
  path: SkillMetadata["path"];
  displayName: string;
  sourceLabel: string;
}>;
```

其中：

- `name + path` 是提交身份。
- `displayName` 是选择时的展示快照，优先使用 `interface.displayName`，否则使用 canonical `name`。
- `sourceLabel` 机械派生自权威 metadata 的 `scope`，不从 path 猜测产品分类。
- Lexical node key 只用于当前 editor identity，不作为持久业务身份或协议字段。

节点 JSON 必须有明确 version，并实现向前可判定的 import/export。遇到未知或不支持的节点版本必须明确拒绝恢复或降级为不含 path 的 canonical plain text，禁止把不理解的数据断言为有效 skill。

### 展示与重名

普通 token 显示 `$友好展示名`。候选 catalog 或当前 draft 中出现相同展示名但不同 path 时：

- 候选行追加简短来源。
- token 追加相同来源，用于在正文中直接区分。
- 重名判断按不同 canonical path 去重；同一路径重复出现不构成两个来源。

来源是否显示可以由当前 catalog 与 draft 机械派生，但不得改变节点的 `name + path`。catalog 刷新只能改变候选与派生展示，不能把现有节点重定向到另一个同名 skill。

### 可见文本与 canonical 文本

编辑器中的友好展示文本不是提交文本的权威来源。提交编译器遍历 editor tree：

- 普通 `TextNode` 输出原文本。
- `SkillNode` 在 text input 中输出 `$canonical-name`。
- 每个首次出现的不同 path 额外输出一个结构化 `{ type: "skill", name, path }`。

同一 skill token 可以重复出现在 text 中，但结构化 Skill item 按 path 去重。Skill items 的顺序遵循节点在文档中的首次出现顺序；整体载荷沿用现有 TUI 约定，先发送可见逻辑 text，再发送结构化 skill items。

只有 skill token、没有普通文字的 draft 仍然是有效非空输入，其 canonical text 为对应 `$canonical-name`。

## Skill catalog owner

### 生命周期与 cwd

catalog owner 绑定当前有效 thread snapshot 的 `thread.cwd` 与当前可用 `GuiHostCommands`：

- commands 与 cwd 都可用时调用 `skills/list({ cwds: [cwd], forceReload: false })`。
- 只消费 response 中 cwd 精确匹配的 entry。
- 候选只包含 `enabled === true` 的 skills。
- cwd、connection generation 或 owner identity 改变时，立即移除旧 catalog 的可见候选；旧请求 settlement 不得写入新 owner。
- owner dispose 后的 response 与 notification refresh 必须失效。

该 owner 可以提供小型只读 snapshot，但不能把 app-server DTO 复制成手写的 frontend mirror。候选模型必须通过 `Pick`、索引访问或输入为生成 `SkillMetadata` 的机械转换，保留权威契约的编译失败传播。

### 刷新

`skills/changed` 只作为 invalidation signal：

- 合并同一 generation 内并发 refresh，避免 notification burst 产生无限并行请求。
- 使用当前 cwd 重新调用 `skills/list`；不根据 notification 自行修改单项。
- refresh 期间保留最近一次成功 catalog，候选框显示刷新状态但不闪空。
- refresh 成功后原子替换 catalog。
- refresh 失败保留最近一次成功结果并在候选框显示错误与重试，不静默清空。

已有 `SkillNode` 始终保留选择时的 canonical identity。只有一次成功刷新明确证明其 path 已不存在或已 disabled 时，节点才显示 invalid 状态并阻止提交；用户必须删除并重新选择。不得按同名项自动改绑。catalog 本身无法加载时，不得把已有节点误判为 invalid。

### 加载错误

`skills/list` 同时可能产生请求级失败和 entry 内的 skill errors：

- 部分错误：继续显示有效 enabled skills，在候选框内显示失败数量与非阻塞说明。
- 全部请求失败且没有旧 catalog：候选框显示失败状态与重试按钮。
- refresh 失败且有旧 catalog：继续显示旧候选，同时标记结果可能过期并提供重试。
- 错误状态不得 disable 普通编辑；没有 invalid token 时也不得阻止普通文本发送。

错误信息不得暴露不必要的完整本地路径。详细 path 只存在于内部错误事实；用户文案以数量、简短原因和重试操作为主。

## 补全交互

### 触发与 target

- 只有不处于 composition 时输入 `$` 才能开始 skill query。
- query target 是 caret 左侧当前未绑定的 `$token`，可以位于段落中间，不要求位于整段末尾。
- 已完成的 `SkillNode` 不会被自身内部的 `$` 再次识别为 query。
- `$` 后的 query 只匹配 canonical name 与友好展示名，使用稳定的大小写不敏感 fuzzy match；description 不参与匹配。
- 空 query 显示有界的首批候选；候选数和渲染数必须有硬上限，避免 unbounded menu。

排序优先使用匹配分数，再使用稳定 canonical name 与 path tie-break，避免刷新后无理由跳动。具体 fuzzy helper 与上限数值属于计划阶段的实现判断，但必须有显式硬上限。

### 选择

- `ArrowUp` / `ArrowDown` 移动 active option。
- Enter 与 Tab 接受 active option，并替换当前 `$query`；接受候选不得同时发送消息。
- Escape 关闭候选但保留当前文本与 editor focus。
- 鼠标或触摸选择执行与键盘相同的 replacement command。
- 没有 active option 时 Enter 回到普通 Composer 发送语义；Shift+Enter 保持换行。
- 选择完成后 caret 落在 token 之后，用户可以继续输入。

typeahead menu 由 Lexical 的 caret anchor primitive 定位；候选内容和交互元素使用 HeroUI v3 `ListBox`、`Button`、`Surface` 或等价 compound component。若 HeroUI `ListBox` 与 Lexical menu focus ownership 无法组合，必须保留 Lexical 的 editor-focus 模型并实现等价的 ARIA listbox/option 语义，不能为了外观让候选抢走 editor focus。

## 剪贴板、移动与恢复

### 编辑器内部

Lexical transaction 以节点为单位处理移动、撤销、删除和内部复制粘贴，`name + path` 随 `SkillNode` 一起变化。重复展示名不依赖字符串位置匹配，也不使用外置 range table。

### 编辑器外部

- `text/plain` 将 `SkillNode` 序列化为 `$canonical-name`。
- `text/html` 可以保留安全的视觉 span，但不得包含 path、内部 JSON 或可恢复 identity。
- 只有同一受信 Lexical editor namespace 的内部 clipboard payload 可以保留结构化 node JSON。
- 从外部粘贴 `$name` 只产生普通文本并重新触发 query；不得凭名称静默构造 path。

### 排队与 recovery

消息一旦被 queue 接受就不再可编辑，因此 queue 保存已经编译好的 immutable canonical input：

```ts
type ComposerQueueMessage = Readonly<{
  id: string;
  input: readonly TurnStartParams["input"][number][];
}>;
```

实际类型表达应直接机械派生自生成 `TurnStartParams`，不得手写 `UserInput` union。queue、claim、recovery batch 与 coordinator 传递同一个结构化 message owner；`performStart` 直接使用 `claim.message.input`。

若 queue 拒绝当前 submit，editor state 保持不变。只有 queue 明确接受与本次 editor snapshot 完全相同的 message 后才清空 editor；用户在异步期间继续产生的新编辑不得被旧 settlement 清除。

## IME 与输入安全

替换 `TextArea` 不等于可以删除现有 IME 约束。Lexical 集成必须保持：

- `editor.isComposing()` 为 true 时，`$` 不打开或更新候选，Enter 不接受候选也不发送。
- compositionend 后用于确认候选的紧邻 Enter 仍必须被抑制一次；不得使用时间窗口猜测。
- composition 完成后才基于最终 editor state 更新 query。
- Shift+Enter、普通 Enter、空 draft 与 disabled/read-only 状态保持现有产品语义。

现有 `useRevealComposerOnViewportResize` 通过查询 `textarea` 工作，迁移后必须改为针对 Lexical contenteditable root 的同一 focus/visualViewport 契约。不得通过同时保留隐藏 textarea 维持旧测试或旧 hook；最终只能有一个编辑内核。

## 可访问性与 HeroUI

- Composer 外层继续使用 HeroUI `Surface` 与既有语义 token。
- contenteditable root 保持 `aria-label="Message composer"` 对应的可访问名称、placeholder、disabled/read-only 与 focus-visible 反馈。
- typeahead 建立 combobox/listbox/option 关系，active option 通过 `aria-activedescendant` 或 Lexical/HeroUI 支持的等价机制公布。
- `SkillNode` 的可访问名称包含“Skill”与友好展示名；来源只在重名时加入。
- invalid token 不能只用颜色表达，必须有可读状态。
- 候选加载、刷新、部分错误和全部错误使用有界 live status，避免每次按键重复朗读整张列表。
- menu 打开、刷新和选择都不得把 focus 从 editor 移到不可预测的 portal；Escape 与选择后 focus 留在 editor。

不硬编码白色、品牌色或错误色。token、候选、错误与 active option 使用 HeroUI surface、field、separator、accent 和 danger 语义 token。

## 协议与权威契约

完整派生链必须保持为：

```text
app-server protocol Rust types
  → generated TypeScript + JSON schema validators
  → GUI request/notification descriptor subset
  → GuiHostCommandGateway / notification routing
  → skill catalog owner
  → Lexical SkillNode selection
  → generated TurnStartParams input
```

禁止：

- 手写 `SkillMetadata`、`SkillsListResponse`、`SkillsChangedNotification` 或 `UserInput` DTO mirror。
- 把 protocol payload 擦除为 `unknown` 后在 Composer 重建 union。
- 只添加 TypeScript type 而不生成 runtime response validator。
- 只开放 GUI frontend method 而不更新 GUI Host allowlist。
- 吞掉 payload validation、RPC、catalog 或 node import failure。

新增的 GUI Host allowlist 仍应保持最小，只增加本功能实际消费的 `skills/list` request 与 `skills/changed` server notification，不开放 skill 写入、安装或管理 RPC。

## 状态与 owner 边界

建议保持以下深模块边界：

- skill catalog owner：拥有 cwd、request generation、refresh、错误和只读 snapshot。
- Composer editor owner：拥有 Lexical EditorState、SkillNode、query 与 editor commands。
- submission compiler：纯转换，接受 editor snapshot 与有效 nodes，返回 canonical structured input 或明确错误。
- composer queue：继续拥有 FIFO、claims、recovery 与 delivery classification，只把 message payload 从 text 加深为生成 input。

React component 只组合这些 owner 的稳定视图和命令，不复制 catalog、editor tree、queue message 或 recovery batch。

## 设计级文件影响边界

预期实现会触及以下类别；精确任务拆分属于后续计划：

- `codex-rs/gui-host/src/filter.rs` 及其 allowlist 测试。
- `codex-gui/src/features/guiHost/appServerProtocol.ts`、gateway、notification routing、生成 validators/descriptors 与对应测试。
- 新的 skill catalog owner 及定向测试。
- Composer editor/SkillNode/typeahead/submission compiler 新模块。
- `ComposerTurnControl`、viewport reveal hook 与 Browser tests。
- `composerInputQueue`、coordinator、test support 与纵向测试。
- Lingui 源消息与现有 catalogs 的机械 extraction/compile 产物。
- 用户已经修改的 `codex-gui/package.json` 与 `pnpm-lock.yaml`。

若计划确认后发现实现必须修改上述类别之外的生产文件，必须说明具体依赖和行为风险并更新计划，不能增加兼容 shim 绕过 owner 切换。

## 测试与验收设计

### 纯逻辑

至少证明：

- SkillNode JSON round-trip 保留 `name + path + displayName + sourceLabel`。
- submission compiler 把友好展示机械转换为 canonical text 与结构化 Skill items。
- 重复 path 去重、同名不同 path 保持独立。
- 过滤只使用 canonical/display name，排序稳定且有硬上限。
- catalog refresh generation、dispose、partial error、total error 和 retry 状态收敛。
- queue、claim 与 recovery 原样保留 structured input。

### Browser Mode

通过真实 Browser Mode 交互验证：

- `$` 打开候选；中间 caret target 只替换当前 query。
- Arrow、Enter、Tab、Escape、鼠标与触摸选择语义。
- 选择候选不发送，普通 Enter 发送。
- 友好展示、canonical clipboard、重名来源与 invalid token。
- 两个显示名相同但 path 不同的 token 可以移动、删除、撤销和重新排序，identity 不串位。
- 内部复制粘贴保留 identity，外部 plain/html clipboard 不泄露 path。
- `skills/changed` refresh 保留旧结果直到成功，旧 settlement 不覆盖新 cwd。
- 部分失败、全部失败、重试与普通输入互不阻塞。
- structured input 沿 `Composer → queue → command` 到达真实 gateway request。
- queue/recovery 后再次 start 仍使用原始 path，不重新解析名称。
- contenteditable focus 与 visualViewport resize 不回退。

普通行为测试运行在 Chromium、Firefox、WebKit 并行矩阵。只有经证据确认涉及共享 focus、visualViewport 或 rAF 时序的用例进入 sequential suite，不能预防性串行化所有补全测试。

### IME

自动化覆盖：

- composition 中 `$`、方向键、Enter、Tab 不触发候选动作或发送。
- compositionend 后第一次确认 Enter 被抑制，下一次普通 Enter 才发送最终文本。
- 中文文本位于 token 左右时，Backspace、Delete、方向键和 undo/redo 不破坏字符或 node boundary。

手动界面验证至少覆盖 macOS 中文输入法，并对 Chrome/Firefox/WebKit 可获得环境执行。自动事件模拟不应被描述成真实系统 IME 已验证。

### Rust 与协议 ingress

GUI Host allowlist 改动只需要定向 Rust test/lint；本设计不修改 app-server API shape，因此不应无理由重新生成或改写 Rust schema fixtures。若 frontend validator 子集生成必须读取现有 schema，只运行项目已有机械生成命令并检查 diff。

### 完成标准

只有以下纵向路径被证明可达，功能才算完成：

```text
skills/list
  → current-cwd enabled catalog
  → $ query
  → exact SkillNode(name + path)
  → canonical structured queue message
  → turn/start UserInput::Skill
  → queue/recovery 后仍保持同一 path
```

同时必须满足：

- 重名 skill 不串位、不按名称猜测。
- catalog 变化不静默重定向既有 token。
- path 不进入可见文本、DOM attribute 或外部 clipboard。
- IME 候选确认不误触发选择或发送。
- 普通纯文本 Composer、排队、停止和恢复行为不回退。

## 风险与控制

### contenteditable 与 IME

这是本设计最大风险。采用 Lexical 只降低自建 editor 的风险，不代表跨浏览器 composition、selection、clipboard 和移动端行为自动正确。必须以真实 Browser Mode 和手动 IME 证据闭环，不得用禁用测试、放宽断言或事件时间窗隐藏失败。

### 迁移范围

现有 Composer、viewport hook、queue 和大量测试均建立在 `textarea + string` 上。实现不是局部增加 popup，而是编辑状态到发送载荷的纵向迁移。最终状态只能保留 Lexical 一个编辑内核；不得保留隐藏 textarea、双写 string/editor state 或 fallback submit 路径。

### 依赖体积

`@lexical/react` 会带入多个 Lexical 子包。实施阶段需要通过现有前端 build 的
Vite production chunk 输出验证实际影响；`analyze:large-files` 只统计 tracked 源码，
不能代替 bundle 检查，只根据 lockfile 条目数判断体积也不充分。若影响超出项目
既有阈值，应先缩小 imports 和插件集合，不能通过提高阈值或关闭检查解决。

### 安全与隐私

skill path 属于内部执行身份。它可以存在于 editor state、queue message 和 app-server RPC，但不能进入 HTML、外部 clipboard、toast、无必要日志或 transcript 展示。测试必须使用示例 path，项目文档不得记录用户真实私有路径。

## 被否决方案

- `textarea + 外置 range binding`：把移动、撤销、粘贴、重名与 offset remap 责任转移给业务代码。
- 只插入 `$name` 并依赖后端解析：同名 skill 或 connector 冲突时不能保证选择目标。
- 把 path 编码成 Markdown link：输入框暴露实现载体，编辑和复制语义错误。
- 自行扫描 filesystem：复制 app-server 权威发现与配置逻辑。
- 只接 `skills/list` 不接 `skills/changed`：候选在运行期变陈旧。
- 为兼容旧 Composer 保留 TextArea 与 Lexical 双路径：产生两个草稿 owner 和不可证明的发送语义。

## 后续阶段门禁

本设计已于 2026-08-19 获得用户确认，当前只允许编写并落盘实施计划。用户明确确认计划前：

- 不得修改生产代码、测试、生成物或 catalogs。
- 不得暂存或提交用户安装的依赖变更。
- 计划确认后，必须按计划中的逐任务提交边界实施和验证。

设计确认后，下一轮只能编写并落盘实施计划；计划再次获得明确确认后，才能进入实现。
