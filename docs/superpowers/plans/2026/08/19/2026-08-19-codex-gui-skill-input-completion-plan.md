# Codex GUI Skill 输入补全实施计划

状态：已确认

日期：2026-08-19

对应设计：`docs/superpowers/specs/2026/08/19/2026-08-19-codex-gui-skill-input-completion-design.md`

## 目标

在不引入通用富文本能力的前提下，将 Codex GUI Composer 的编辑内核替换为
Lexical plain-text editor，提供基于当前 thread cwd 的 `$skill` 补全，使选中项以原子
`SkillNode` 保存 canonical `name + path`，并经过 queue/recovery 原样提交为
`turn/start.input` 中的结构化 skill item。

## 当前代码证据

- `codex-rs/app-server-protocol/src/protocol/common.rs` 已声明 `skills/list` 与
  `skills/changed`；`protocol/v2/plugin.rs` 已提供 `SkillsList*`、`SkillMetadata` 和
  `SkillsChangedNotification`。本计划不改 app-server wire shape，也不重生 Rust schema。
- `codex-rs/gui-host/src/filter.rs` 未放行 `skills/list` 和 `skills/changed`，它们分别会被
  GUI Host 拒绝或丢弃。
- `codex-gui/src/features/guiHost/appServerProtocol.ts` 未把两个 method 选入 GUI validator/
  descriptor 子集；`GuiHostCommandGateway` 也没有 `listSkills`。
- `ComposerTurnControl.tsx` 仍以 `draft: string + TextArea` 为唯一编辑路径，
  `useRevealComposerOnViewportResize.ts` 仍硬编码查找 `textarea`。
- `composerInputQueue.ts` 的 message 只有 `{ id, text }`；coordinator 在发送时才重新组装
  单个 text input，因此现有 queue/recovery 无法保留 skill path。

## 实施前置条件

- 用户已于 2026-08-19 在 `codex-gui` 目录自行执行：

  ```bash
  /opt/homebrew/bin/fnm exec --using-file pnpm add @lexical/clipboard@0.49.0
  ```

- 原因：`@lexical/react` 的 `PlainTextPlugin` 默认只复制 HTML 和
  `selection.getTextContent()`，不写入 Lexical 内部 JSON MIME。同一 editor namespace 内复制
  粘贴保留 `SkillNode` identity 需要 `@lexical/clipboard` 的权威序列化路径。
- `package.json` 与 `pnpm-lock.yaml` 已只读核验为直接依赖 `@lexical/clipboard@0.49.0`，
  该前置条件已满足。助手不重新安装依赖，也不改为手写 clipboard 协议。

## 执行规则

- 用户明确确认本计划前不得开始实施。
- 实施使用 `$managing-work-stages`、`$project-doc-workflow` 和
  `$delegating-micro-stages`；编辑、验证、stage 与 commit 分为依赖有序的微阶段。
- 每个任务完成后只暂存该任务的文件，检查 staged diff，并创建一个独立本地提交。
- 对已有提交的修正使用新提交，禁止 amend。
- 不做与行为无关的 import、声明、函数或组件重排；如确需纯重排，必须单独任务和提交。
- 生成文件只由项目命令产生，不手工修改。
- 所有 pnpm 命令均在 `codex-gui` 目录通过
  `/opt/homebrew/bin/fnm exec --using-file pnpm ...` 执行。
- Rust 只运行本计划列出的单测试 filter，不运行 crate-wide 或 workspace-wide test/lint。
- 不运行后端或原生构建命令，不安装任何程序或依赖，不操作 Git 远程。
- 不保留隐藏 `textarea`、string/editor 双写、旧新 submit 双路径、fallback 或 adapter。

## 计划提交序列

1. `build(gui): add Lexical composer dependencies`
2. `feat(gui-host): allow skill catalog traffic`
3. `feat(gui): select skill catalog protocol`
4. `feat(gui): route skill catalog protocol`
5. `feat(gui): own the current cwd skill catalog`
6. `feat(gui): preserve structured composer queue input`
7. `feat(gui): model canonical skill editor content`
8. `feat(gui): add the Lexical skill editor`
9. `feat(gui): connect skill completion to turn start`

## 任务 1：固定 Lexical 直接依赖

**文件**

- 修改：`codex-gui/package.json`
- 生成：`codex-gui/pnpm-lock.yaml`

**实施**

- 确认用户安装结果只增加精确版本 `lexical@0.49.0`、
  `@lexical/react@0.49.0` 和 `@lexical/clipboard@0.49.0`。
- 不重新执行 install，不接受其他无关依赖或版本漂移。

**验证**

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm --version
/opt/homebrew/bin/fnm exec --using-file pnpm list lexical @lexical/react @lexical/clipboard --depth 0
git diff --check -- package.json pnpm-lock.yaml
```

**提交**

```text
build(gui): add Lexical composer dependencies
```

## 任务 2：放行 GUI Host skill catalog 流量

**文件**

- 修改：`codex-rs/gui-host/src/filter.rs`
- 修改测试：`codex-rs/gui-host/src/ws.rs`
- 修改测试：`codex-rs/gui-host/src/host.rs`

**实施**

- 先增加会失败的定向测试，证明浏览器端 `skills/list` 请求可到达 backend，
  backend 的 `skills/changed` 可到达浏览器。
- 只在 client request allowlist 增加 `skills/list`，只在 server notification allowlist 增加
  `skills/changed`；不开放 skill 安装、写入或管理 RPC。
- 不修改 app-server protocol 定义、schema fixture 或 README。

**验证**

```bash
just test -p codex-gui-host client_allowlist_contains_current_gui_frontend_requests
just test -p codex-gui-host server_notification_allowlist_contains_current_gui_frontend_notifications
just test -p codex-gui-host allows_backend_skills_changed_notification
just test -p codex-gui-host browser_skill_catalog_request_reaches_backend
just fmt
```

最后两个 filter 名以实施时新增的精确测试名为准。必须先运行对应失败用例，再修改
allowlist；`just fmt` 后不重跑测试。

**提交**

```text
feat(gui-host): allow skill catalog traffic
```

## 任务 3：从权威 schema 生成 GUI skill 协议子集

**手写文件**

- 修改：`codex-gui/src/features/guiHost/appServerProtocol.ts`
- 修改测试：`codex-gui/src/features/guiHost/__tests__/generatedAppServerProtocol.test.ts`
- 修改测试：`codex-gui/src/features/guiHost/__tests__/guiHostGeneratedProtocol.test.ts`

**机械生成文件**

- `codex-gui/src/generated/appServerProtocol/appServerPayloadValidators.raw.js`
- `codex-gui/src/generated/appServerProtocol/appServerPayloadValidators.js`
- `codex-gui/src/generated/appServerProtocol/appServerPayloadValidators.d.ts`
- `codex-gui/src/generated/appServerProtocol/requestDescriptors.ts`
- `codex-gui/src/generated/appServerProtocol/notificationDescriptors.ts`
- `codex-gui/src/generated/appServerProtocol/index.ts`（仅在生成器产生实际 diff 时）

**实施**

- 在 GUI request/notification 选择清单中加入 `skills/list` 与 `skills/changed`。
- 使用现有 generator 从 Rust 生成的 TypeScript/JSON schema 机械生成 response/notification
  validators 和 descriptors，禁止手写 `SkillMetadata`、`SkillsListResponse` 或 notification DTO。
- 测试合法与畸形 `SkillsListResponse`、合法与畸形 `skills/changed`，以及生成类型的
  request/response 关联。

**验证**

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run protocol:generate-validators
/opt/homebrew/bin/fnm exec --using-file pnpm run protocol:check-validators
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run \
  src/features/guiHost/__tests__/generatedAppServerProtocol.test.ts \
  src/features/guiHost/__tests__/guiHostGeneratedProtocol.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

**提交**

```text
feat(gui): select skill catalog protocol
```

## 任务 4：在 GUI gateway 暴露 skill request 与 notification

**文件**

- 修改：`codex-gui/src/features/guiHost/guiHostCommandGateway.ts`
- 修改：`codex-gui/src/features/guiHost/guiHostClient.ts`
- 修改测试：`codex-gui/src/features/guiHost/__tests__/guiHostCommands.test.ts`
- 修改测试：`codex-gui/src/features/guiHost/__tests__/guiHostHandshake.test.ts`
- 按实际用例修改：`codex-gui/src/features/guiHost/__tests__/guiHostProtocolErrors.test.ts`

**实施**

- 从生成 `RequestParams<"skills/list">` 和 `RequestResponse<"skills/list">` 机械派生
  `GuiHostCommands.listSkills`。
- 增加强类型 `onSkillsChanged` callback，在 selected notification exhaustive switch 中分发
  `skills/changed`。
- 保持现有 RPC 失败与 transport delivery 分类；skill request 不获得特殊重试或静默降级。
- 测试 request envelope、响应验证、RPC error、notification callback 和畸形 payload 的 terminal
  protocol error。

**验证**

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run \
  src/features/guiHost/__tests__/guiHostCommands.test.ts \
  src/features/guiHost/__tests__/guiHostHandshake.test.ts \
  src/features/guiHost/__tests__/guiHostProtocolErrors.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run protocol:check-validators
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

**提交**

```text
feat(gui): route skill catalog protocol
```

## 任务 5：建立当前 cwd 的 skill catalog owner

**新建文件**

- `codex-gui/src/features/skillCatalog/skillCatalogOwner.ts`
- `codex-gui/src/features/skillCatalog/__tests__/skillCatalogOwner.test.ts`

**修改文件**

- `codex-gui/src/features/projectionCoordination/activeThreadOwner.ts`
- `codex-gui/src/features/projectionCoordination/__tests__/activeThreadOwner.test.ts`（如当前没有则作为 sibling 新建）
- `codex-gui/src/features/projectionCoordination/threadSwitchCoordinator.ts`
- `codex-gui/src/features/projectionCoordination/__tests__/threadSwitchCoordinator.test.ts`
- `codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx`
- `codex-gui/src/features/appShell/routeConnectionStartupCoordinator.ts`
- `codex-gui/src/features/appShell/__tests__/AppShellTopBar.browser.test.tsx`
- `codex-gui/src/features/threadHistory/__tests__/ThreadHistoryDetailPage.browser.test.tsx`
- `codex-gui/src/features/threadHistory/__tests__/ThreadHistoryListPage.browser.test.tsx`
- `codex-gui/src/__tests__/App.browser.test.tsx`
- 按 test support 实际需要修改：`codex-gui/src/__tests__/appBrowserTestSupport.ts`

**实施**

- catalog owner 直接接受生成 `SkillsListResponse` 并导出小型只读 snapshot；候选模型使用
  `Pick`/索引访问机械绑定 `SkillMetadata`，不创建 DTO mirror。
- owner 绑定 `attachResponse.snapshot.thread.cwd`、commands 和 generation；调用
  `listSkills({ cwds: [cwd], forceReload: false })`，只消费 cwd 精确匹配 entry 中 `enabled === true`
  的 skills。
- `skills/changed` 只作为 invalidation；合并同 generation 并发 refresh，刷新时保留最近成功值，
  成功后原子替换。cwd、connection 或 owner 改变后旧 settlement 不得回写。
- snapshot 区分 initial loading、refreshing、partial errors、total request failure 和 stale result；对外错误文案不暴露
  详细 path。
- `ActiveThreadOwnerHandle` 同时拥有 queue 与 catalog；dispose/thread switch/commands unavailable 必须一起
  失效。Bridge 只把 `skills/changed` 转给当前 active owner。
- `routeConnectionStartupCoordinator` 与 `threadSwitchCoordinator` 只补齐 `listSkills` command 传递，
  `threadSwitchCoordinator.test.ts` 只机械补齐 `skillCatalog` fixture。
- 三个页面 Browser 测试替身只机械补齐 `ActiveThreadOwnerHandle.skillCatalog`，不改变页面行为。

**验证**

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run \
  src/features/skillCatalog/__tests__/skillCatalogOwner.test.ts \
  src/features/projectionCoordination/__tests__/activeThreadOwner.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:parallel -- \
  src/__tests__/App.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

**提交**

```text
feat(gui): own the current cwd skill catalog
```

## 任务 6：将 Composer queue 迁移为 canonical structured input

**文件**

- 修改：`codex-gui/src/features/composerInputQueue/composerInputQueue.ts`
- 修改：`codex-gui/src/features/composerInputQueue/composerInputQueueCoordinator.ts`
- 修改测试：`codex-gui/src/features/composerInputQueue/__tests__/composerInputQueue.test.ts`
- 修改测试：`codex-gui/src/features/composerInputQueue/__tests__/composerInputQueueCoordinator.test.ts`
- 修改调用测试：`codex-gui/src/features/appShell/__tests__/routeConnectionStartupCoordinator.test.ts`
- 修改调用测试：`codex-gui/src/features/projectionCoordination/__tests__/activeThreadOwner.test.ts`
- 修改调用测试：`codex-gui/src/features/projectionCoordination/__tests__/threadSwitchCoordinator.test.ts`

**实施**

- `ComposerQueueMessage` 改为持有由生成 `TurnStartParams` 机械派生的 readonly input 数组，
  禁止手写 `UserInput` union。submit 边界复制外层数组以确立所有权，不使用
  `Object.freeze` 或递归深拷贝。
- 结构化非空语义为：拒绝空数组或只含空白 text 的输入；skill-only 以及 canonical
  text + skill 均合法。
- claim、ordinary FIFO、recovery batch 与 deferred effects 传递同一 structured message owner。
  `performStart` 直接使用 message input，不重新扫描文本、不按名称重建 path。
- 保持现有交付分类：`accepted` 仍只是本地 queue 接受；`deliveryUnknown` 仍阻塞并
  等待 runtime 证据；只有 `definitelyNotAccepted` 产生显式 recovery。
- 用深等值测试证明 text + skill 在 claim、FIFO、interrupt recovery 与 definite-rejection
  recovery 中的 name/path/order 不变。
- `activeThreadOwner.test.ts` 只把 queue submit 的 string fixture 机械迁移为生成
  `TurnStartParams["input"]` 的合法结构，不改变测试语义。

**验证**

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run \
  src/features/composerInputQueue/__tests__/composerInputQueue.test.ts \
  src/features/composerInputQueue/__tests__/composerInputQueueCoordinator.test.ts \
  src/features/appShell/__tests__/routeConnectionStartupCoordinator.test.ts \
  src/features/projectionCoordination/__tests__/threadSwitchCoordinator.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

**提交**

```text
feat(gui): preserve structured composer queue input
```

## 任务 7：建模 canonical skill editor content

**新建文件**

- `codex-gui/src/features/composerEditor/SkillNode.ts`
- `codex-gui/src/features/composerEditor/compileComposerDraft.ts`
- `codex-gui/src/features/composerEditor/skillQuery.ts`
- `codex-gui/src/features/composerEditor/__tests__/SkillNode.test.ts`
- `codex-gui/src/features/composerEditor/__tests__/compileComposerDraft.test.ts`
- `codex-gui/src/features/composerEditor/__tests__/skillQuery.test.ts`

**实施**

- `SkillNode extends TextNode` 持有 canonical `name + path` 与选择时的 `displayName + sourceLabel`，
  使用 token mode 和明确 JSON version/import/export。节点的 Lexical text 必须与可见文本长度
  一致，禁止用 `getTextContent()` 偷换为 canonical name。
- 未知 node version 必须显式拒绝，或机械降级为不含 path 的 canonical plain text；不得断言
  为有效 skill。
- compiler 遍历 editor tree：普通 text 保留原文，`SkillNode` 输出 `$canonical-name`；
  结构化 skill item 按 path 去重且保持首次出现顺序，最终返回生成
  `TurnStartParams["input"]` 的合法形状。
- query helper 只匹配 canonical/display name，description 不参与；实现大小写不敏感 fuzzy
  score、canonical name/path 稳定 tie-break 和硬上限 `20`。
- 重名仅按不同 path 计算；`sourceLabel` 只从权威 `scope` 机械映射，不从 path 猜测。

**验证**

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run \
  src/features/composerEditor/__tests__/SkillNode.test.ts \
  src/features/composerEditor/__tests__/compileComposerDraft.test.ts \
  src/features/composerEditor/__tests__/skillQuery.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

**提交**

```text
feat(gui): model canonical skill editor content
```

## 任务 8：实现 Lexical plain-text editor 与 skill typeahead

**新建文件**

- `codex-gui/src/features/composerEditor/ComposerEditor.tsx`
- `codex-gui/src/features/composerEditor/SkillTypeaheadPlugin.tsx`
- `codex-gui/src/features/composerEditor/ComposerClipboardPlugin.tsx`
- `codex-gui/src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx`
- `codex-gui/src/__tests__/sequential/composerClipboard.browser.test.tsx`

**实施**

- 只注册 `LexicalComposer`、`PlainTextPlugin`、`ContentEditable`、`HistoryPlugin`、
  `LexicalTypeaheadMenuPlugin` 和自定义 `SkillNode`，不开启 heading、list、link、markdown 或其他
  富文本节点。EditorState 是唯一草稿权威，React 只消费稳定 snapshot/commands。
- typeahead 只识别 caret 左侧未绑定的 `$query`；Enter/Tab 接受，Escape 关闭，
  ArrowUp/ArrowDown 移动 active option，鼠标与触摸执行同一 replacement command。选择后
  caret 位于 token 之后。
- composition 期间关闭/停止 query，方向键、Enter、Tab 不得选择或发送；保留
  `guardCompositionEndEnter` 的一次性紧邻 Enter 抑制，不使用时间窗口。
- clipboard 使用 `@lexical/clipboard` 的 namespace 与 selection JSON：同 namespace 内保留
  `SkillNode`；对外 `text/plain` 使用 `$canonical-name`，HTML 只保留安全视觉 span，禁止
  path、node JSON 或内部 identity 进入 HTML/DOM attribute。外部 `$name` 粘贴只生成普通文本。
- 候选容器使用 HeroUI `Surface variant="secondary"`，重试使用
  `Button size="sm" variant="secondary"`；option 保留 Lexical 的 editor-focus 模型，使用语义
  `listbox/option` 标记与 HeroUI surface/field/separator/accent/danger tokens。不使用会创建第二个
  focus/selection owner 的 HeroUI `ListBox` 或 trigger-driven `Popover`。
- 设置 combobox/listbox/option 关联、active descendant、有界 live status、invalid token 文字状态与
  focus-visible；不以颜色作唯一错误信号。

**Browser Mode 验证**

- parallel 三浏览器覆盖：`$` 打开、中间 caret 替换、硬上限、过滤排序、键盘/鼠标/触摸选择、
  选择不发送、Escape/Shift+Enter、重名来源、原子删除/移动/undo/redo、invalid token、ARIA 与 focus。
- sequential 覆盖全局 clipboard 修改：内部复制粘贴保留 name/path，对外 plain/HTML 不泄露 path。
- 合成 composition 事件只证明程序门禁，不声称完成真实系统 IME 验证。

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:parallel -- \
  src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:sequential -- \
  src/__tests__/sequential/composerClipboard.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

**提交**

```text
feat(gui): add the Lexical skill editor
```

## 任务 9：替换 Composer 并接通端到端提交

**修改文件**

- `codex-gui/src/features/composerEditor/ComposerEditor.tsx`
- `codex-gui/src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx`
- `codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx`
- `codex-gui/src/features/composerTurnControl/composerTurnControlModel.ts`
- `codex-gui/src/features/composerTurnControl/useRevealComposerOnViewportResize.ts`
- `codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx`
- `codex-gui/src/features/composerTurnControl/__tests__/composerTurnControlModel.test.ts`
- `codex-gui/src/features/currentTask/CurrentTaskPage.tsx`
- `codex-gui/src/__tests__/App.browser.test.tsx`
- `codex-gui/src/__tests__/AppRouting.browser.test.tsx`
- `codex-gui/src/__tests__/appBrowserTestSupport.ts`
- `codex-gui/src/__tests__/sequential/composer-viewport.browser.test.tsx`
- `codex-gui/src/locales/en.po`
- `codex-gui/src/locales/zh-CN.po`

**实施**

- 用 `ComposerEditor` 替换 HeroUI `TextArea`，不保留隐藏 textarea 或 `draft: string`。
  Composer 外壳继续使用 HeroUI `Surface variant="default"`；发送、停止和 recovery 按钮保持
  现有 `outline`、`danger-soft`、`secondary` 产品语义。
- 将 active owner 的 catalog snapshot 传给 editor。加载/刷新/部分错误/全部错误只在候选面板显示，
  重试调用 catalog owner；普通文本编辑不被阻断。
- submit 固定当前 EditorState snapshot，先用 compiler 产生 canonical structured input，再同步提交
  queue。只有 queue 返回本地 `accepted` 且 editor 仍是同一 snapshot 时才清空；拒绝或已继续编辑时
  保留新状态。
- 仅 `ready` 且 `partialErrorCount = 0` 的完整成功 catalog 证据证明已选 path 不存在或 disabled
  时，才将 token 标为 invalid 并阻止该 draft 提交；catalog 未加载、正在 refresh、存在部分错误或
  refresh 失败时不得误判已有 token。invalid 状态仅为编辑器 DOM 派生状态，不写入 EditorState、
  SkillNode JSON 或 clipboard，且不得泄露 path。
- viewport hook 改为使用 Lexical contenteditable root/ref 与 `HTMLElement` focus 判定，保持现有
  visualViewport/rAF/滚动契约。
- 通过 Lingui macro 增加候选、刷新、错误、invalid 和重试文案；使用
  `messages:extract` 机械更新现有 catalogs，不手写生成条目。

**纵向验收**

- `skills/list → current-cwd enabled catalog → $query → SkillNode(name + path) →
  canonical queue input → turn/start UserInput::Skill` 可达。
- 同展示名、不同 path 的 token 在移动、删除、撤销、重排和多次发送中不串位。
- active turn 时输入进入 FIFO；interrupt 后显式 `Continue sending` 仍使用最初 name/path。
- `deliveryUnknown` 不产生第二次 start；`definitelyNotAccepted` 只产生现有显式 recovery。
- 中文文本位于 token 左右时，composition、Backspace/Delete、方向键和 undo/redo 不破坏
  文字或 node boundary。
- contenteditable focus 和移动端 visualViewport resize 不回退，候选面板无横向溢出且不
  意外抢焦点。

**验证**

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run messages:extract
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run \
  src/features/composerTurnControl/__tests__/composerTurnControlModel.test.ts \
  src/features/composerInputQueue/__tests__/composerInputQueueCoordinator.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:parallel -- \
  src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx \
  src/__tests__/App.browser.test.tsx \
  src/__tests__/AppRouting.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:sequential -- \
  src/__tests__/sequential/composerClipboard.browser.test.tsx \
  src/__tests__/sequential/composer-viewport.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

**手工 IME 验收**

- 由用户在 macOS 中文输入法下验证 Chrome 与 Safari；如 Firefox 可用则同时验证。
- 输入中的 `$`、方向键、Enter 和 Tab 不打开/选择候选或发送；composition 结束后
  第一次紧邻 Enter 只抑制，下一次普通 Enter 才发送最终文本。

**提交**

```text
feat(gui): connect skill completion to turn start
```

## 最终验证

全部任务提交合并后，按以下顺序执行。如失败由本计划变更引入，在计划边界内直接
修正并以新的独立提交记录；无关或预存失败只汇报。

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run protocol:check-validators
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
/opt/homebrew/bin/fnm exec --using-file pnpm run lint
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser
/opt/homebrew/bin/fnm exec --using-file pnpm run build
```

检查 Vite build 的实际 production chunk 输出，确认只引入 plain text/history/typeahead/clipboard 所需
Lexical 模块。`analyze:large-files` 只统计 tracked 源码，不能代替 bundle 检查。禁止通过提高
阈值、禁用检查或放宽断言处理回归。

最后在仓库根目录执行：

```bash
just fmt
git diff --check
git status --short
```

`just fmt` 只在所有测试、lint 和 build 完成后执行，之后不重跑测试。检查最终工作树只剩
设计、计划或用户明确保留的范围，不应有遗漏生成物或未记录代码变更。

## 完成标准

- GUI Host 只新开放 `skills/list` 与 `skills/changed`，前端使用 Rust 权威生成类型与 validator。
- catalog 只展示当前 cwd 的 enabled skills，刷新、错误、dispose 和 thread switch 状态收敛。
- Composer 只有 Lexical EditorState 一个草稿权威，不存在隐藏 textarea 或 string 双写。
- `SkillNode` 在重名、移动、删除、撤销、内部复制粘贴与 catalog 变化中始终保持
  canonical `name + path`。
- 对外 plain text 只包含 `$canonical-name`，HTML、DOM、toast、日志和 transcript 不泄露 path。
- structured input 经 queue、claim、FIFO、recovery 与 `turn/start` 保持 path/order，不按名称重解析。
- Chromium、Firefox、WebKit Browser Mode 通过；用户完成 macOS 中文输入法手工验收。
- 所有 9 个计划任务各自对应独立本地提交；本次不包含 Git 远程操作。
