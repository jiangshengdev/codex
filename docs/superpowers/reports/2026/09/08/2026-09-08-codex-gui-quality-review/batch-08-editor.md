# B08 编辑器、输入载荷与技能目录

基线：`63762612e56d332f474a5ba3861b22be761f0479`。状态：静态主审、独立复核与跨模块收敛完成。

## 范围与覆盖

逐一读取 `codex-gui/src/features/composerEditor/**`、`composerInput/**`、`skillCatalog/**` 的全部 29 个主文件。主归属与逐文件进度以 [覆盖清单](./coverage-and-progress.md) 为准；关联读取不转移主归属。三个目录相对上述基线的 `git diff --name-only` 无输出。

`composerEditor/` 实现文件：`ComposerAtomicNodePlugin.tsx`、`ComposerClipboardPlugin.tsx`、`ComposerContentModelPlugin.tsx`、`ComposerEditor.tsx`、`SelectedSkillToken.tsx`、`SkillNode.ts`、`SkillTypeaheadPlugin.tsx`、`composerDraft.ts`、`composerEditorContracts.ts`、`composerShortcuts.ts`、`selectedSkillPresentation.ts`、`skillQuery.ts`。

`composerEditor/__tests__/` 文件：`ComposerAtomicNodePlugin.browser.test.tsx`、`ComposerContentModelPlugin.browser.test.tsx`、`ComposerEditorLifecycle.browser.test.tsx`、`ComposerEditorSkillTokenEditing.browser.test.tsx`、`ComposerEditorSkillTokenPresentation.browser.test.tsx`、`ComposerEditorTypeaheadMenu.browser.test.tsx`、`ComposerEditorTypeaheadSelection.browser.test.tsx`、`SkillNode.test.ts`、`composerDraft.test.ts`、`composerEditorBrowserTestFixture.tsx`、`composerEditorBrowserTestSupport.ts`、`composerEditorCompositionBrowserTestSupport.ts`、`selectedSkillPresentation.test.ts`、`skillQuery.test.ts`。

其他主文件：`composerInput/composerInputPayload.ts`、`skillCatalog/skillCatalogOwner.ts`、`skillCatalog/__tests__/skillCatalogOwner.test.ts`。

关联读取：B13 主归属的 `src/__tests__/sequential/composerClipboard.browser.test.tsx` 全文，以及 B10 `composerTurnControl/composerTurnControlModel.ts` 的技能有效性消费契约。HeroUI Tooltip 的本地文档及源码、Vitest Browser React 与断言文档用于核对组件和测试语义。

## 七维检查结论

| 维度 | 结论与关键依据 |
| --- | --- |
| 行为正确性 | 未确认缺陷。文本、技能节点到 Capture 的编译保留 canonical name 与 path 身份；typeahead 替换光标处查询文本，Enter/Tab 由菜单优先处理。外部普通文本不隐式升级为技能节点。 |
| 状态与生命周期 | 未确认缺陷。每个 LexicalComposer 独立 controller/history/composition/menu；capture 绑定 EditorState 身份，clearIfCurrent 避免清除后续编辑；更新监听器和 controller ref 有卸载清理。目录 generation/disposed 隔离迟到结果。 |
| 异常恢复 | 未确认缺陷。无效或无法解析的 draft 不覆盖现有内容，成功恢复重新建立历史；技能目录首次失败与刷新失败分开，刷新失败保留 candidates 并标记 stale，inflight invalidation 合并后续刷新。 |
| 契约与安全 | 未确认缺陷。start/steer input 从权威协议类型派生并要求双向相容；copy 分支穷尽，text_elements 深复制。剪贴板 HTML 对显示文本转义，结构身份留在 Lexical MIME；技能有效性只由完整 ready catalog 判定。 |
| 性能 | 未确认有证据支持的风险。路径收集在编辑更新时扫描文档，EditorState 对象身份未变时跳过重新投影；本次没有实际输入规模或性能测量，不能由扫描存在或文件大小推出性能缺陷。 |
| 职责与耦合 | 未确认需要登记的结构建议。draft 管理输入语义和快照，plugins 管理编辑交互，catalog owner 管理目录请求，payload 管理协议载荷复制。展示名与 canonical identity 分开，目录展示元数据没有取代已保存身份。 |
| 测试有效性 | 静态阅读覆盖多编辑器隔离、capture/clear、restore/history、技能原子编辑、菜单键盘与指针行为、禁用状态、目录失败/迟到请求及剪贴板 MIME。测试未执行；synthetic composition 不证明真实操作系统 IME 验收。 |

## 关键链路依据

### 文本与技能到 Capture

`composerDraft.ts` 用私有 WeakMap 保存 opaque Draft/Capture 对应的序列化内容和 EditorState 身份。导入先验证格式并在注册 SkillNode 的独立 editor 中解析，成功后才能恢复；解析失败不改变当前编辑内容。

编译时，技能显示名转为 `$canonicalName` 文本，structured skills 按 path 去重，同名不同路径仍保持独立身份。selectedSkillPaths 保留文档顺序及重复项，不能把展示文本或同名视为同一个技能。`composerDraft.test.ts` 静态覆盖 literal/skill、路径去重、同名不同路径、JSON roundtrip、坏版本和节点以及失败时内容保留。

`ComposerEditor.tsx:342-345` 捕获当前 EditorState，并在 clearIfCurrent 时核对是否仍为该状态。因此捕获后的新编辑不会被旧提交回调清空。生命周期测试检查两个 editor 的内容、caret/history 隔离、提交 capture 不修改内容，以及 restore 后新历史。此处仅讨论编辑器状态身份，发送接受与 pending input reservation 由 B09/B10 及相关会话批次负责。

### 剪贴板与输入交互

`ComposerClipboardPlugin.tsx` 同时构造 canonical plain text、转义后的展示 HTML 和保留技能身份的 Lexical MIME。同 namespace 的结构化粘贴保留技能节点，外部 canonical-looking plain text 保持普通文本；ContentModel plugin 清理外部富文本格式。cut 只在复制成功且选区仍匹配时删除。

`ComposerAtomicNodePlugin.tsx` 仅在可编辑、非 composing 且 node selection 中节点均符合 inline keyboard-selectable 条件时执行替换。`SkillTypeaheadPlugin.tsx` 的菜单命令优先于提交；composition 开始时关闭查询，pointerdown 选择时保留 editor focus，hover 不抢夺键盘选项。`ComposerEditor.tsx` 的提交路径另有 composition guard。

B13 的 `composerClipboard.browser.test.tsx` 已覆盖同 namespace copy/paste 技能身份、多节点 cut/paste 的 MIME、换行 plain text、外部普通文本以及外部 HTML 格式清理。不能因这些测试位于 B08 目录外而报告“剪贴板无测试”。本批只关联读取，不把其主覆盖计入 29 文件。

### 技能目录与载荷边界

`skillCatalogOwner.ts:114-167` 用 generation 和 disposed 判断异步请求是否还能结算；刷新失败保留旧 candidates，队列化 invalidation 在当前请求结束后继续刷新。`composerTurnControlModel.ts:47-64` 只在 `ready` 且 `partialErrorCount === 0` 时判断选中 path 是否缺失，避免目录失败或不完整时误判技能无效。

`SelectedSkillToken.tsx` 使用已保存身份展示技能；description/source 只匹配同 path 的目录数据。presentation 测试静态覆盖完整目录才判 invalid、失败或 partial 不误判、删除/undo/restore 更新冲突路径，以及 disabled 状态不接受交互。

`composerInputPayload.ts:9-15` 从 TurnStartParams 与 TurnSteerParams 的 input 建立双向类型相容约束；`:17-43` 复制各 payload variant，保持穷尽检查并对 text_elements 的嵌套内容使用 structuredClone。没有另建手写协议副本。

## 发现与已排除项

本批新增确定缺陷、待验证风险和可维护性建议均为零。这一结论只适用于上述静态证据，不表示不存在缺陷或产品已经全面验证通过。

没有把异步 cut 的理论竞态、catalog 的 `forceReload: false` 或缺失 cwd 响应直接登记成问题：本次未建立这些假设导致错误结果的可触发契约链。没有将扫描、Map 重建或实现文件规模本身作为重构依据。

菜单、选择和组合输入测试中部分事件由合成事件触发；其证据范围是生产 handler 对该事件序列的行为。真实 macOS IME、真实系统剪贴板差异及长期输入性能不由这些静态检查替代。

## 验证与后续交接

本批未执行测试，未修改源码或测试。Level 1 自动化回归未执行；Level 2 无头真实运行验收未执行；Level 3 可见桌面验收未执行。

没有需要新增定向验证节点才能闭合的具体发现，不建议为形式覆盖运行整批测试。若后续跨模块疑点需要，可选择现有 `composerDraft.test.ts`、`skillCatalogOwner.test.ts` 或 `ComposerEditorLifecycle.browser.test.tsx`；涉及剪贴板则使用 B13 的 sequential 测试并遵守对应配置。实际命令、命中用例与结果应由执行该验证的节点记录，不能把本报告的静态阅读记作通过。

跨模块复核已检查 Capture 转交发送后的清理、pending edit 的生命周期，以及 B10 对 catalog 有效性的发送门禁，见 [跨模块报告](./cross-module-review.md)；本报告不延伸为这些消费者整体正确性的结论。
