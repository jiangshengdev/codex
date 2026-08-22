# Codex GUI Composer Skill 可逆草稿与恢复编辑基础设计

日期：2026-08-22
状态：已确认

## 唯一主目标

增强 GUI Composer 的 Skill 输入模型：在用户提交时同时捕获可逆的结构化草稿与不可漂移的协议输入，使纯本地排队条目将来能够安全恢复为包含原始 `SkillNode` 的新编辑会话，并在重新编辑后通过普通提交路径再次入队。

本设计只建立文本与 Skill 的可逆草稿、入队保存、恢复和再次提交基础。它不继续设计 `Pending details` 抽屉的管理交互，也不实现队列条目的删除、重排、lane 变更或批量操作。

## 背景与根因

当前 GUI Composer 使用 Lexical 文档保存编辑中的结构化信息。用户从 Skill typeahead 选择候选项后，编辑器创建 `SkillNode`，节点内部保存：

- canonical `name`；
- canonical `path`；
- `displayName`；
- `sourceLabel`。

`SkillNode` 已支持带显式版本的 JSON 序列化与恢复，因此编辑器文档本身具备保存 Skill identity、显示信息和节点结构的能力。

问题发生在提交 seam。当前 `compileComposerDraft()` 在入队前把 Lexical `EditorState` 单向编译为协议 `UserInput[]`：

- SkillNode 在正文中的位置只剩 canonical `$name` 文本；
- 同一路径的多个 SkillNode 会在结构化 Skill items 中去重；
- `displayName` 与 `sourceLabel` 被丢弃；
- 普通字面 `$name` 与原 SkillNode 无法再区分；
- 队列最终只保存已编译的协议 input。

因此，协议 input 足以执行一次 `turn/start` 或 `turn/steer`，却不是 Composer 草稿的可逆表示。从 `UserInput[]` 反向猜测编辑器节点会在重复 Skill、重名 Skill、catalog 变化和普通 `$name` 文本场景中产生错误绑定。这是输入队列编辑能力必须先解决的根因。

## 已确认决策

### 入队时原子捕获 draft 与 input

一次 Composer 提交必须从同一个已提交编辑器快照原子地产生并保存两份表示：

- `draft`：无损、可恢复的 Lexical 草稿表示；
- `input`：从该快照编译出的权威协议输入。

队列条目同时拥有 `draft + input`。后续发送、交付分类和既有 recovery 继续使用捕获时的 `input`；恢复编辑只使用同一条目保存的 `draft`。两者不能在稍后的 catalog 状态下重新拼装为彼此。

### 恢复为新的编辑会话，光标位于末尾

恢复 queued draft 时，不恢复原编辑器实例、selection、undo/redo history 或旧会话的瞬时状态。系统从保存的 draft 创建一个新的 Composer 编辑会话：

- 文本、段落结构和 SkillNode 按捕获内容恢复；
- SkillNode 的原始结构化字段保持不变；
- 新会话的光标统一放在恢复内容末尾；
- 后续修改进入新的编辑历史；
- 再次提交按当前恢复后的文档生成一组新的 `draft + input`。

这一决定把“内容可逆”与“编辑器会话回放”明确分开，避免为了恢复不可持久化的 Lexical history 扩大状态面。

## TUI 对照：可借鉴与不可复制

TUI 的 queued message 编辑证明了一个可行状态模型：消息在纯本地排队期间保存可恢复的草稿结构，用户编辑时把草稿恢复到 Composer，真正发送时才生成最终 `UserInput`。TUI 同时保留正文、`text_elements` 与 `mention_bindings`，而不是从最终 `UserInput::Skill` 反序列化。

GUI 可借鉴：

- 只恢复仍纯本地、尚未进入发送链的草稿；
- 队列期间保留可恢复表示，而不是只有执行表示；
- 恢复后走普通编辑和普通提交路径；
- 已进入发送链的 pending steer 保持只读。

GUI 不可复制：

- 不复制 TUI 的快捷键或 LIFO 编辑入口；
- 不复制普通文本加 sidecar byte ranges/bindings 的数据模型；
- 不按 TUI 的终端交互决定 GUI 抽屉的焦点、确认或所有权行为；
- 不把 TUI 对 queued item 的弹出行为直接当成 GUI 已确认产品语义。

GUI 已使用 Lexical `SkillNode`，identity 必须继续内聚在节点中。TUI 只提供状态模型证据，不提供 GUI interaction 设计。

## Module、seam 与 interface

### `composerDraft` module

新增或收敛一个由 `composerEditor` 拥有的深 module，外部 seam 位于 Composer 编辑器与提交调用方之间。该 module 隐藏 Lexical 序列化、SkillNode 解析、协议编译和恢复细节，为调用方提供小而稳定的 interface。

概念 interface：

```ts
type ComposerDraft;

type ComposerDraftCapture = Readonly<{
  draft: ComposerDraft;
  input: ReadonlyComposerInputPayload;
  textContent: string;
  selectedSkillPaths: readonly string[];
}>;

type ComposerDraftRestoreResult =
  | Readonly<{ type: "restored" }>
  | Readonly<{ type: "invalidDraft" }>;

type ComposerEditorController = Readonly<{
  capture(): ComposerDraftCapture;
  clearIfCurrent(capture: ComposerDraftCapture): boolean;
  restore(draft: ComposerDraft): ComposerDraftRestoreResult;
  focus(): void;
  getRootElement(): HTMLElement | null;
  subscribe(listener: () => void): () => void;
}>;
```

具体类型名、文件拆分和 class/function 选择属于实现细节；计划阶段可以在不改变上述语义的前提下调整。

### seam 后隐藏的行为

`composerDraft` implementation 负责：

- 从一个确定的 `EditorState` 同时生成无损 draft 和协议 input；
- 保存 Lexical 根文档与 versioned SkillNode JSON；
- 提取 `textContent` 和已选 Skill paths，供现有发送控制使用；
- 使用同一 Composer node registry 完整解析并校验 draft，再决定是否替换当前状态；
- 解析成功后原子地创建新的 EditorState，重置旧 selection/history，把光标放在末尾，并返回 `restored`；
- 解析或版本校验失败时返回 `invalidDraft`，不修改当前 Composer；
- 保持可信 in-process TypeScript 数据的只读与所有权隔离。

调用方不需要知道 SerializedEditorState、SkillNode JSON 字段或 Lexical parse/set 顺序。删除该 module 会使这些知识重新散落到提交控制、队列、恢复入口和测试中，因此该 module 具有足够 depth，并为调用方提供 leverage、为维护者提供 locality。

### Queue interface

队列消息的概念 shape 从仅含 input 扩展为同时携带 draft：

```ts
type ComposerQueueMessage = Readonly<{
  id: string;
  draft: ComposerDraft;
  input: ReadonlyComposerInputPayload;
}>;
```

队列的状态机继续拥有消息 identity、ordinary/steer lane、claim、settlement、交付未知和 recovery。`composerDraft` 不接管这些职责。未来抽屉编辑操作只通过队列提供的受控结果取得 draft，再交给 `ComposerEditorController.restore()`；不得越过队列状态机直接读取或删除内部条目。

## 核心 invariants

1. 每个可编辑本地队列条目的 `draft` 与 `input` 必须来自同一个 Composer capture。
2. `draft` 是恢复编辑阶段的权威表示；`input` 是发送与交付恢复阶段的权威表示。
3. 捕获后不得因 catalog 刷新、Skill 重名或显示信息变化而改写已保存 `input`。
4. 恢复时不得从 `input` 反编译 draft，也不得按 Skill name 猜 path。
5. 恢复必须保留 SkillNode 的位置、重复次数、canonical name/path、displayName/sourceLabel，以及普通 `$name` 与 SkillNode 的区别。
6. 再次提交必须捕获恢复后当前文档的新 `draft + input`；不得复用编辑前 input 冒充新提交。
7. 队列发送、`deliveryUnknown`、settlement 和 recovery 的现有执行语义不得改变。
8. 已进入发送链的条目不因拥有 draft 而变得可编辑或可撤回。
9. 恢复创建新编辑会话，旧 selection 和 undo/redo history 不跨会话延续。
10. Typed in-process seam 使用 `Readonly` 与必要复制表达所有权；不新增 freeze、proxy 或运行时不可变包装。

## draft 与 input 的分阶段权威语义

`draft` 与 `input` 不是两个竞争的全局权威来源。它们分别在不同生命周期阶段拥有权威性：

| 阶段 | 权威表示 | 说明 |
| --- | --- | --- |
| Composer 编辑中 | 当前 Lexical EditorState | 用户正在编辑的实时文档 |
| 提交捕获 | 同一 capture 生成的 `draft + input` | 建立不可拆分的对应关系 |
| 纯本地排队 | `draft` 用于未来恢复；`input` 用于未来发送 | 两份表示都保存，不互相重建 |
| start/steer issuing 及 settlement | 捕获时的 `input` | 保持 client identity 和发送内容稳定 |
| `deliveryUnknown` | 捕获时的 `input` 与原 claim | 禁止重编译、重试猜测或隐藏未决交付 |
| 恢复编辑 | 保存的 `draft` | 创建新的 EditorState 和编辑会话 |
| 恢复后再次提交 | 新 EditorState 的新 capture | 新 `draft + input` 替代旧编辑结果进入后续队列流程 |

该分阶段语义避免把 draft 当作网络协议，也避免把协议 input 当作编辑器存档。

## 数据流

### 捕获与入队

```text
Lexical EditorState
  -> ComposerEditorController.capture()
  -> composerDraft module
       -> lossless draft serialization
       -> compile canonical protocol input
       -> textContent / selectedSkillPaths projection
  -> ComposerDraftCapture
  -> ComposerInputQueueCoordinator.submit / submitSteer
  -> ComposerQueueMessage { id, draft, input }
```

队列确认接受 capture 后，Composer 仅在 `clearIfCurrent(capture)` 仍匹配当前编辑状态时清空，避免异步期间清除用户新输入。

### 发送

```text
ComposerQueueMessage.input
  -> ordinary StartClaim 或 SteerIntent
  -> turn/start 或 turn/steer generated params
  -> 既有 settlement / runtime observation 对账
```

发送链不访问 draft，也不在发送前重新查询 catalog 或重新编译。

### 恢复

```text
未来受控队列编辑结果
  -> ComposerQueueMessage.draft
  -> ComposerEditorController.restore(draft)
       -> restored
            -> new EditorState
            -> cursor at document end
            -> current validity projection applied
       -> invalidDraft
            -> current Composer unchanged
            -> queue item unchanged
```

当前 Composer 已有草稿时的冲突处理，以及队列条目在恢复前后是转移所有权还是原位锁定，不在本设计中决定。未来抽屉设计必须先解决这些产品语义，再调用本设计提供的恢复基础。

### 再次提交

```text
restored new EditorState
  -> user edits text / SkillNode
  -> normal capture()
  -> new draft + newly compiled input
  -> normal submit / submitSteer
```

不存在 Skill 专用 resubmit 路径。

## Skill catalog 变化与失效行为

恢复不依赖 catalog 重建 SkillNode。保存的 canonical `name + path` 和显示信息先按 draft 原样恢复；catalog 只对恢复后的节点执行与当前 Composer 相同的可用性判断。

- catalog 为 `initialLoading`、`refreshing`、`stale`、`failed`，或存在 partial errors 时，未命中不能被解释为 Skill 确定不存在；不得降级为普通文本或猜测替代 path。
- catalog 为完整可信的 `ready` 且无 partial errors 时，若保存 path 不再可用，节点继续保留结构化 identity，但按现有无效 Skill 样式和可访问状态呈现，并阻止提交。
- 用户可以删除无效节点，或通过当前 typeahead 重新选择有效 Skill。
- 若 path 仍可用，恢复节点保持捕获时保存的 displayName/sourceLabel；本阶段不静默刷新显示字段，也不改变捕获时的 input。
- catalog 中出现同名 Skill 时始终按 path 区分；不得只按 name 重绑。

如未来产品希望自动迁移已失效 Skill，必须作为独立设计处理，因为它会改变用户选择的执行 identity。

## 生命周期与失败恢复

### 本地排队

ordinary 队列和尚未发出的 `steerQueue` 可以携带 draft，为未来抽屉编辑提供基础。普通消息一旦形成 StartClaim，或 steer 一旦进入 pendingSteers，就进入既有发送链；拥有 draft 不改变其可管理权限。

### `definitelyNotAccepted`

既有 recovery batch 必须携带完整 `ComposerQueueMessage`，因此恢复重新入队时自然保留原 `draft + input`。发送侧仍使用原 input，不从 draft 重编译。本文不改变 recovery 的触发条件、顺序或用户操作。

### `deliveryUnknown`

`deliveryUnknown` 继续持有原 claim 并阻塞不安全的后继发送。不得因为存在 draft 而把条目退回可编辑状态，不得隐藏未决交付，也不得以恢复编辑为理由生成重复发送。

### active-turn-not-steerable、terminal 与 rejected merge

现有 rejected steer 与终止处理保持不变。多个 rejected steer 被合并为一次 start 时，协议 input 可能来自多个原消息，不存在一个可安全恢复的单一 Lexical 文档；本设计不为其伪造 draft，也不扩大其可编辑范围。

### draft 解析失败

内存生命周期内，draft 由同一版本 GUI 捕获并由同一 Composer node registry 恢复，正常路径应可解析。若解析仍失败：

- `restore()` 返回 `invalidDraft`；
- Composer 保持恢复前状态；
- 队列条目及其 input 保持不变；
- 不退化为纯文本，不按协议 input 猜回节点；
- 调用方依据该受控结果呈现失败，且只有收到 `restored` 后才能提交后续队列 membership 变更。

## 权威协议 derivation

本设计不新增或修改 app-server 协议。发送 input 继续直接派生自生成的 v2 contract：

- `TurnStartParams["input"]`；
- `TurnSteerParams["input"]`。

`ReadonlyComposerInputPayload` 继续通过 TypeScript 条件类型和深只读变换机械依赖生成类型，不能手写 `UserInput` DTO、literal union、runtime validator 或兼容解析器。协议新增或修改已使用的 variant 时，应继续由生成、type-check 或 build 暴露不兼容，而不是由 GUI 静默兜底。

`ComposerDraft` 是独立的前端编辑语义，不是协议 contract 的镜像。它保存 Lexical 文档和 GUI SkillNode 信息，因此可以作为 frontend-owned domain model；它的 compile seam 接受当前编辑器状态并输出生成协议类型。

## Dependency strategy 与 adapter

所有相关依赖均为 in-process：Lexical、Composer controller、input queue 和 skill catalog 位于同一前端进程。本设计不引入 port 或 adapter：

- Lexical serialization 是 `composerDraft` implementation 的内部依赖；
- skill catalog 通过现有状态输入参与可用性判断，不成为恢复 resolver；
- queue 直接保存 opaque draft 和 generated-contract-derived input；
- 测试直接穿过相同 interface，不创建 codec mock 或 in-memory adapter。

只有一个实现时新增 `DraftCodec`、`SkillResolver` 或 queue adapter 只会形成浅层转发，降低 locality，并不能提供真实替换能力。

## 范围

本设计覆盖：

- Composer 普通文本与段落结构；
- `SkillNode` 的完整结构化字段、位置与重复节点；
- capture、queue ownership copy、发送、恢复和再次提交所需的数据表示；
- ordinary、纯本地未发送 steer 和既有 recovery batch 对 `draft + input` 的携带；
- 恢复后的 catalog validity 与现有发送门禁；
- 新编辑会话与光标末尾语义。

## 非目标

- 不覆盖图片、音频、mention 或其他非 Skill 结构化输入。
- 不从 `UserInput[]` 反编译 Lexical draft。
- 不按 Skill name 猜 path，不根据 catalog 静默换绑。
- 不修改 `deliveryUnknown`、claim、settlement、runtime observation 或 recovery 语义。
- 不让 pending start、pendingSteers、deliveryUnknown 或已发出条目变为可编辑。
- 不设计抽屉中的编辑入口、所有权转移/锁定、草稿冲突、取消、保存、重排、lane 变更或批量操作。
- 不恢复旧 selection、undo/redo history、IME composition 或 typeahead popup 瞬时状态。
- 不提供跨进程、跨版本或跨会话持久化。
- 不新增协议、app-server 方法、GUI Host command 或 generated contract。
- 不新增 adapter、兼容层、双写双读或旧新路径并存的最终状态。

## 测试与验证边界

完整测试面应穿过 `composerDraft` 与队列公开 interface，验证 observable outcomes，而不是测试私有序列化 helper。

### Draft round-trip

- 普通文本、多个段落和空段落恢复一致；
- SkillNode 的位置、重复次数和四个结构化字段恢复一致；
- 同名不同 path 的 Skill 保持不同 identity；
- 普通字面 `$name` 不变成 SkillNode；
- draft 恢复后创建新编辑会话，光标位于文档末尾；
- 恢复前后的 undo/redo history 不连通。

### Capture consistency

- 单次 capture 的 draft 与 input 来自同一个 EditorState；
- capture 后用户继续输入时，`clearIfCurrent` 不清除新状态；
- draft 可保留重复 SkillNode，而 input 继续遵守既有按 path 去重和 canonical text 编译语义；
- 恢复后修改并再次 capture 时，生成新的 draft 与反映修改的新 input。

### Queue lifecycle

- ordinary 和未发送 steer 保存并传递 `draft + input`；
- start/steer command 始终使用保存的 input；
- ordinary promotion 不重编译 input，也不丢失 draft；
- `definitelyNotAccepted` recovery 保留原 draft 与 input；
- `deliveryUnknown` 不产生可编辑恢复结果、不重试、不改变阻塞；
- pending steer 继续只读。

### Catalog validity

- catalog 未具备完整可信状态时不把未命中 Skill 降级为文本；
- 完整 ready catalog 确认 path 失效后，恢复节点保留 identity、显示无效状态并阻止提交；
- 同名不同 path 不发生重绑。

### 验证方式边界

计划阶段应根据当前 `codex-gui/package.json` 固化入口，使用 fnm 管理的 Node/pnpm：

- 相关 Vitest 单元测试覆盖 draft、compile、queue state 与 coordinator；
- Vitest Browser Mode 覆盖真实 Lexical 恢复、焦点/光标和无效 Skill 可访问状态；
- type-check 验证 generated protocol derivation 与所有消费者；
- format 与 lint 使用项目现有脚本入口；
- 只有稳定、用户可感知的恢复行为才写 Browser Mode 断言，不锁定临时 padding、颜色或其他视觉数值。

本设计不要求 Rust 构建、协议 schema 生成、app-server 测试或 TUI snapshot 更新，因为不修改 Rust、协议或 TUI。

## 风险与控制

- **draft/input 漂移：** 只允许从同一 snapshot 原子 capture，并让队列同时取得两者所有权。
- **错误 Skill 重绑：** 恢复以保存 path 为 identity；catalog 仅验证，不负责重建。
- **发送内容漂移：** claim 始终持有捕获时 input，发送前不重新 compile。
- **恢复半更新：** 先完整 parse 新 EditorState，成功后再替换 Composer；失败保持原状态和队列条目。
- **恢复扩大可编辑范围：** draft 的存在不改变 queue lifecycle 分类；pending 与 unknown 保持只读。
- **浅 module 扩散：** Lexical JSON、SkillNode 遍历、compile 和 restore 集中在 `composerDraft` seam 后，调用方只学习 capture/restore interface。
- **未来结构化输入误承诺：** 类型与测试明确本阶段只有文本和 Skill，图片、音频、mention 需独立扩展设计。

## 后续抽屉设计边界

本设计完成后，`Pending details` 抽屉可以依赖“纯本地队列条目拥有可恢复 draft”这一事实继续设计，但仍必须独立确认以下产品语义：

- 编辑时条目从 queue 转移所有权，还是原位锁定；
- 当前 Composer 已有草稿时如何处理；
- 编辑取消后恢复原位置、保留修改或丢弃修改；
- ordinary 与未发送 steer 的编辑入口、排序和 lane 行为；
- stale revision、并发 drain 和条目刚进入发送链时的 UI 结果。

后续抽屉设计不得推翻本文 invariants：只管理纯本地未发送条目，不编辑 pending steer，不隐藏 `deliveryUnknown`，不从 input 反编译 draft，不按 name 猜 path。

## 接受标准

- 每次提交从同一个 EditorState 捕获并入队保存 `draft + input`。
- 文本与 SkillNode 能从 draft 无损恢复；Skill 位置、重复、identity 和显示字段保持一致。
- 恢复创建新的编辑会话，光标位于末尾，不延续旧 selection 或 undo/redo history。
- 发送、ordinary promotion 和 recovery 使用捕获时 input，不因 catalog 变化重编译。
- catalog 失效沿用当前 Composer 的无效 Skill 呈现与提交阻止语义。
- `deliveryUnknown`、pending steer 与既有 recovery 生命周期没有行为变化。
- 没有新增协议、手写协议镜像、adapter、input 反编译或 name-to-path 猜测。
- 实现只覆盖文本与 Skill，不声称支持图片、音频或 mention 恢复。
- 后续抽屉交互和所有权语义仍由独立设计确认。
