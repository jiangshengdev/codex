# Codex GUI Composer Skill 可逆草稿与恢复编辑基础实施计划

计划日期：2026-08-22

计划状态：已确认

确认日期：2026-08-22

确认原文：确认计划。开始实现

对应已确认设计：
`docs/superpowers/specs/2026/08/22/2026-08-22-codex-gui-composer-skill-restorable-draft-design.md`

计划分支：`dev`

调查基线：`50af127eed29b83a1a6b18f477b18144b83f28ce`

## 唯一目标

按已确认设计，把 GUI Composer 的文本与 Skill 输入从“提交后只剩协议 input”的单向模型，原子切换为“同一编辑器快照产生并入队保存 owned draft + generated-contract-derived input”的双表示模型：draft 负责无损恢复为新的编辑会话，input 负责稳定发送和既有交付恢复。

本计划只建立 ComposerDraft、队列贯穿和现有提交消费者的一次性切换。它不实现 `Pending details` 抽屉 mutation，不新增任何用户可见的 queued-item 编辑入口。

## 当前代码为什么必须修改

- `composerEditor/SkillNode.ts` 已保存 `name`、`path`、`displayName`、`sourceLabel`，并支持 versioned JSON round-trip，但该能力只停留在 Lexical node 内。
- `composerEditor/compileComposerDraft.ts` 只输出协议 input：把 SkillNode 压成 canonical `$name`，按 path 去重结构化 Skill，并丢失节点位置、重复次数和显示字段。
- `ComposerEditorController` 只暴露 `getSnapshot()`、`clearIfSame(EditorState)` 和焦点操作，没有 capture/restore interface；外层调用方被迫了解 `EditorState` 和节点遍历。
- `ComposerTurnControl.tsx` 在 React 层直接调用 `compileComposerDraft()`，直接遍历 Lexical root 提取 Skill paths，并用裸 `EditorState` identity 清空 Composer。
- `composerInputQueueContracts.ts` 的 `ComposerQueueMessage` 只有 `{ id, input }`；ordinary、start claim、steer intent、recovery batch 和 coordinator 均无法携带可逆 draft。
- `composerInputQueue.ts` 会为 rejected steers 合成 delivery-only merged start。该 aggregate 没有一个对应的原始 Lexical 文档，不能用 optional/null draft 假装可恢复。
- 现有单元、parallel Browser Mode、sequential Browser Mode、App 和 owner/coordinator 测试直接构造 input 或调用旧 compiler；接口切换必须覆盖完整消费者，而不是保留 input-only overload。

因此不能只给队列旁挂一份 JSON，也不能从 `UserInput[]` 反编译。必须先建立 ComposerDraft 深 module，再让 queue domain 区分“可恢复的 prepared local message”和“只用于交付的 synthetic aggregate”，最后一次性切换所有消费者。

## 完整纵向路径

```text
skills/list generated response
  -> SkillCatalogOwner（保持不变）
  -> SkillTypeaheadPlugin
  -> SkillNode(name, path, displayName, sourceLabel)
  -> ComposerEditorController.capture()
      -> opaque owned versioned Lexical serialization
      -> generated protocol input compilation
      -> textContent / selectedSkillPaths projection
  -> PreparedComposerDraft { draft, input, projections, capture identity }
  -> ComposerTurnControl
  -> ComposerInputQueueCoordinator.submit / submitSteer
  -> recoverable local queue message
      -> ordinary FIFO / ordinary promotion / unsent steer
      -> StartClaim / SteerIntent
      -> turn/start or turn/steer
      -> settlement / runtime observation / recovery
  -> future controlled queue edit result
  -> ComposerEditorController.restore(draft)
      -> restored: new editor session, cursor at end
      -> invalidDraft: Composer and queue unchanged
  -> normal capture and submit again
```

Rejected-steer merge 走独立 delivery-only 分支：

```text
rejected steer intents
  -> synthetic delivery-only aggregate { input, rejected transfer capability }
  -> StartClaim
  -> turn/start
  -> accepted/rejected settlement
```

该分支没有 draft，也不进入可恢复本地消息的 interface。

## 权威来源与 derivation

### 编辑阶段

- 当前 Lexical `EditorState` 是编辑中的权威来源。
- `ComposerDraft` 使用 Lexical `SerializedEditorState` 的 owned、versioned 封装；不是 GUI 自建 AST，也不手写 TextNode/ParagraphNode/SkillNode 镜像树。
- `SkillNode` 自身的 versioned JSON 继续保存 GUI Skill identity 和显示字段。

### 捕获与排队阶段

- 一次 `capture()` 必须从同一个 committed EditorState 原子产生 draft、input、textContent 和 selectedSkillPaths。
- recoverable local queue message 同时拥有 draft 与 input；禁止 optional draft、`draft: null` 或 input-only 兼容构造。

### 发送阶段

- `ReadonlyComposerInputPayload` 继续机械派生自生成的 `TurnStartParams["input"]` 与 `TurnSteerParams["input"]`。
- coordinator 构造 `turn/start`、`turn/steer` 时使用 capture 时保存的 input；禁止在 issuing、promotion、recovery 或 catalog 刷新后重新 compile。
- Rust app-server protocol、生成 TypeScript contract 和 validator 是 wire shape 的唯一权威来源。本计划不修改协议，也不手写 consumer DTO、runtime validator 或兼容 parser。

### 恢复阶段

- 保存的 draft 是恢复编辑的唯一权威来源。
- 不从 input 反编译，不按 Skill name 猜 path，不从当前 catalog 重新构造历史 SkillNode。
- catalog 只沿用当前 Composer validity 行为：只有完整可信 ready catalog 才确认 path 失效；失效节点保持 identity 并阻止提交。

## 全局 invariants

1. 每个 recoverable local message 的 draft 与 input 来自同一个 capture。
2. 可恢复消息类型必须始终含 draft；delivery-only aggregate 类型必须在类型层明确禁止 draft。
3. message id、client user message id、thread id、expected turn id、claim/transfer capability 和 settlement ownership 不因 draft 引入而改变。
4. ordinary FIFO、ordinary-to-steer promotion 和 steer FIFO 顺序不变。
5. `definitelyNotAccepted` 与 `userStopped` recovery 保留原 recoverable message 的完整 draft + input。
6. `deliveryUnknown` 继续持有原 claim、阻塞不安全后继，不产生可编辑恢复结果，不重编译或自动重试。
7. rejected-steer synthetic aggregate 只负责 delivery，不伪造 draft，不进入普通队列编辑范围。
8. restore 完整 parse/validate 成功后才原子替换 Composer；`invalidDraft` 保持 Composer 与 queue 不变。
9. restore 创建新编辑会话，光标位于文档末尾，不延续 selection、undo/redo、IME composition 或 typeahead popup。
10. 最终状态只有 capture submit 路径；不得保留旧 compiler wrapper、input-only overload、adapter、双编译或 fallback。

## 实施前硬门禁

只有用户明确确认本计划并另行请求实施后，才开始以下动作。实施第一步必须仅提交本次已确认 design 与已确认 plan，形成独立 docs commit；该提交成功前禁止修改任何代码或测试。

计划确认后，先把本计划状态从“待确认”更新为“已确认”，记录确认日期和确认原文，然后只暂存：

- `docs/superpowers/specs/2026/08/22/2026-08-22-codex-gui-composer-skill-restorable-draft-design.md`
- `docs/superpowers/plans/2026/08/22/2026-08-22-codex-gui-composer-skill-restorable-draft-plan.md`

明确禁止纳入：

- `docs/superpowers/research/**`；
- 旧 pending drawer design/plan；
- 任意代码、测试、生成物或其他文档。

提交前执行：

```bash
git status --short --branch
git add -- docs/superpowers/specs/2026/08/22/2026-08-22-codex-gui-composer-skill-restorable-draft-design.md docs/superpowers/plans/2026/08/22/2026-08-22-codex-gui-composer-skill-restorable-draft-plan.md
git diff --cached --check
git diff --cached --name-only
git diff --cached
git commit -m 'docs(gui): plan restorable composer skill drafts'
```

`git diff --cached --name-only` 必须恰好只有上述两个路径。提交失败时立即停止，不得绕过门禁开始 Task 1。

## Preflight（docs commit 后、代码修改前）

```bash
git status --short --branch
git rev-parse --abbrev-ref HEAD
git rev-parse HEAD
test -x /opt/homebrew/bin/fnm
test -d codex-gui/node_modules
test -d ../../vitest/docs
/opt/homebrew/bin/fnm exec --using-file pnpm --version
```

要求：

- 分支仍为 `dev`；若 HEAD 或调用面相对调查基线漂移，先只读重跑本计划列出的 `rg` 并更新实际消费者，不机械套用旧行号。
- 除已提交 docs 外若存在其他用户变更，逐文件避让；无法安全避让时停止。
- fnm、pnpm、node_modules、本地 Vitest 文档或既有浏览器二进制缺失时停止并请用户自行安装；助手不得安装。
- 所有 pnpm 命令从 `codex-gui` 执行，并使用 `/opt/homebrew/bin/fnm exec --using-file pnpm ...`。
- 不运行 Git 远程命令，不创建或更新远程引用。

## Task 1：建立 ComposerDraft 深 module 与 Editor capture/restore

本任务是一个独立行为提交。允许下游 queue/React 消费者在该中间提交后暂时类型不完整；不得为使中间提交独立构建而保留 wrapper、adapter、旧 compiler 或双路径。

### 精确文件

生产代码：

- 新建 `codex-gui/src/features/composerEditor/composerDraft.ts`。
- 修改 `codex-gui/src/features/composerEditor/ComposerEditor.tsx`。
- 仅在 version/serialization invariant 必须收口时修改 `codex-gui/src/features/composerEditor/SkillNode.ts`。
- 使用 `git rm -- codex-gui/src/features/composerEditor/compileComposerDraft.ts`。

测试：

- 使用 `git mv codex-gui/src/features/composerEditor/__tests__/compileComposerDraft.test.ts codex-gui/src/features/composerEditor/__tests__/composerDraft.test.ts`。
- 修改 `codex-gui/src/features/composerEditor/__tests__/composerDraft.test.ts`。
- 修改 `codex-gui/src/features/composerEditor/__tests__/SkillNode.test.ts`（仅当 SkillNode serialization invariant 变化）。
- 修改 `codex-gui/src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx`。

不得修改 queue、ComposerTurnControl 或其他下游消费者。

### 行为与 interface

- `ComposerDraft` 是 opaque owned value，外部不能构造或读取 Lexical JSON；内部带明确 draft version，并保存 `EditorState.toJSON()` 产生的 Lexical serialization。
- owned capture 必须复制/拥有 serialization，不能暴露可变 alias；typed in-process seam 使用 `Readonly`，不加 freeze/proxy。
- `ComposerDraftCapture` 同时包含 opaque draft、generated-contract-derived input、textContent、selectedSkillPaths，以及仅供 `clearIfCurrent(capture)` 判断的 capture identity。
- `ComposerEditorController.capture()` 取代外层 `getSnapshot() + compileComposerDraft()` 提交知识；订阅 snapshot 可以保留用于 React 可用性投影，但不再向外暴露裸 EditorState。
- `clearIfCurrent()` 接受 capture，而不是裸 EditorState；用户在 capture 后继续输入时不得清空新状态。
- `restore(draft)` 返回 discriminated `ComposerDraftRestoreResult`：`restored | invalidDraft`。
- restore 先用当前 Composer node registry 完整 parse/validate，再原子 set 新 EditorState；成功后创建新 history、把 collapsed caret 放到文档末尾，失败时不修改现有 Composer。
- capture compiler 保持当前 canonical text、paragraph break 和按 path 去重结构化 Skill input 语义；draft 同时保留节点位置与重复。
- 不导出兼容 `compileComposerDraft()`，不保留旧文件 re-export。

### 测试不变量

- 文本、段落、SkillNode 位置、重复次数、四个 Skill 字段和字面 `$name` round-trip。
- 同名不同 path 保持 distinct identity；相同 path 的重复节点在 draft 中保留、input 中继续按既有语义去重。
- unknown draft version/invalid Lexical serialization 返回 `invalidDraft`，Composer 内容和 history 不变。
- restore 成功后光标位于末尾；undo 不能回到恢复前编辑会话。
- capture 后继续输入时 `clearIfCurrent` 返回 false 且不清空。
- Browser 断言使用 role/name locator、`expect.element`/`expect.poll` 和 `userEvent`，不使用 contenteditable value/placeholder API。

### 定向验证

从 `codex-gui` 执行：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit -- src/features/composerEditor/__tests__/composerDraft.test.ts src/features/composerEditor/__tests__/SkillNode.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:parallel -- src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx
```

本任务不要求 type-check，因为下游旧接口尚未切换；测试命令自身若因本任务文件内部错误失败，必须在本任务闭环。纯下游类型断裂留给 Task 2/3，不添加兼容层。

### 提交边界

只暂存上述 Task 1 文件；检查 `git diff --cached --check`、name-only 和完整 staged diff 后提交。

建议提交标题：

```text
feat(gui): add restorable composer drafts
```

## Task 2：让 queue domain 贯穿 prepared draft + input

本任务是一个独立行为提交。允许下游 React 与测试 harness 在该中间提交后暂时类型不完整；不得增加 input-only overload、默认 draft、nullable draft 或临时 adapter。

### 精确文件

生产代码：

- `codex-gui/src/features/composerInputQueue/composerInputQueueContracts.ts`
- `codex-gui/src/features/composerInputQueue/composerInputPayload.ts`
- `codex-gui/src/features/composerInputQueue/composerInputQueue.ts`
- `codex-gui/src/features/composerInputQueue/composerStartQueueState.ts`
- `codex-gui/src/features/composerInputQueue/composerSteerQueueState.ts`
- `codex-gui/src/features/composerInputQueue/composerInputQueueCoordinator.ts`
- `codex-gui/src/features/composerInputQueue/composerInputQueueProjection.ts`（仅对 discriminated message 投影所需修改）
- `codex-gui/src/features/composerInputQueue/composerInputPreview.ts`（仅当 input accessor 下沉所需）

测试与 shared fixture：

- 新建 `codex-gui/src/features/composerInputQueue/__tests__/composerInputQueueTestFixtures.ts`，集中构造合法 prepared message/draft capture 和 delivery-only aggregate 所需输入；不得伪造 opaque draft 内部 shape。
- `codex-gui/src/features/composerInputQueue/__tests__/composerInputQueue.test.ts`
- `codex-gui/src/features/composerInputQueue/__tests__/composerSteerQueueState.test.ts`
- `codex-gui/src/features/composerInputQueue/__tests__/composerInputQueueCoordinator.test.ts`
- `codex-gui/src/features/composerInputQueue/__tests__/composerInputPreview.test.ts`（仅当 production preview interface 变化）
- `codex-gui/src/features/composerInputQueue/__tests__/composerInputQueueRuntimeObservation.test.ts`（仅当类型消费者实际命中）

### Domain shape

用 discriminated types 明确区分：

- recoverable prepared local message：必须含 message id、opaque draft 和 input；可进入 ordinary、unsent steer、promotion、definitely-not-accepted/user-stopped recovery。
- rejected-steer synthetic delivery-only aggregate：必须含 synthetic message id、合并 input 和现有 rejected transfer capability/provenance；类型上禁止 draft，只能进入对应 StartClaim 发送/settlement 分支。

禁止：

- `draft?: ComposerDraft`；
- `draft: ComposerDraft | null`；
- 一个宽 message type 再靠运行时猜是否可恢复；
- coordinator 的 input-only `submit(input)` / `submitSteer(input)` overload；
- 为旧测试提供 fake draft assertion 或 type cast。

### 生命周期改动

- coordinator submit/submitSteer 接受 Task 1 产生的 prepared capture，而不是裸 input；生成 message id 后 queue 取得 owned prepared message。
- ordinary enqueue/drain、StartClaim、SteerIntent 和 state copy 同时保留 draft 与 input；wire effect 只读取 input。
- ordinary promotion 把同一 prepared message 转进 steer tail，不重新 capture、不更换 message id、不丢 draft。
- steer intent 继续生成并保持同一 clientUserMessageId、threadId、expectedTurnId、source 和 capability identity。
- `definitelyNotAccepted` recovery 与 `userStopped` recovery 保留原 prepared messages；恢复 FIFO 和 owner capability 规则不变。
- `deliveryUnknown` 继续绑定原 claim；存在 draft 不赋予本地编辑或删除权限。
- rejected steer merge 只产生 delivery-only aggregate，维持 rejected transfer 的 restore/release capability；不能从多个原 draft 合成伪 draft。
- preview/detail 继续只从 input 投影，不读取或暴露 draft。
- ownership copy 复制 prepared container 与 input，opaque draft 按 owned readonly value 传递；不得解析 Lexical serialization。

### 测试不变量

- equality 断言覆盖整个 prepared message/claim/intent/recovery batch，而不是只检查新 draft 字段。
- ordinary FIFO、promotion、steer FIFO、accepted awaiting commit、terminal/rejected merge 的顺序与 identity 不变。
- start/steer wire request 精确等于 capture input，catalog 或 draft 不参与发送。
- `definitelyNotAccepted` 和 `userStopped` round-trip 后仍是同一 draft value 与相同 input 内容。
- `deliveryUnknown` 继续阻塞且不产生 recoverable local mutation。
- synthetic aggregate 在类型和行为上都不可恢复，definite rejection 继续恢复 rejected transfer 而不是普通 message。
- shared fixture 只能通过 composerDraft 合法 test factory/capture interface 获得 opaque draft；不导出 production test-only helper。

### 定向验证

从 `codex-gui` 执行：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit -- src/features/composerInputQueue/__tests__/composerInputQueue.test.ts src/features/composerInputQueue/__tests__/composerSteerQueueState.test.ts src/features/composerInputQueue/__tests__/composerInputQueueCoordinator.test.ts src/features/composerInputQueue/__tests__/composerInputPreview.test.ts src/features/composerInputQueue/__tests__/composerInputQueueRuntimeObservation.test.ts
```

只运行实际修改或直接依赖新 discriminated types 的列出文件；若 optional 文件未修改且无类型命中，可从命令中删除并在执行记录说明当前证据。

本任务仍不要求全仓 type-check，因为 Task 3 尚未切换 React/owner 消费者；不得用 overload 消除预期下游断裂。

### 提交边界

只暂存 Task 2 的 queue production、测试和合法 shared fixture；检查 staged diff 后提交。

建议提交标题：

```text
feat(gui): carry prepared drafts through composer queue
```

## Task 3：一次性切换 ComposerTurnControl 与全部消费者

本任务是一个独立行为提交，负责把最终仓库收敛为唯一 capture submit 路径，并恢复完整 type-check。不得留下 Task 1/2 的临时类型断裂或旧入口。

### 当前生产消费者

- `codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx`

修改要求：

- submit 使用 `ComposerEditorController.capture()`，ordinary/guide 均把同一 prepared capture 交给 coordinator。
- 接受后调用 `clearIfCurrent(capture)`；拒绝时保留当前 Composer。
- 可用性投影读取 capture/snapshot 暴露的 textContent 与 selectedSkillPaths；删除外层 `$getRoot()`、`$isSkillNode` 和裸 EditorState 遍历。
- 删除 `compileComposerDraft` import、`selectedSkillPaths(snapshot)` helper、旧 snapshot submit identity 和所有临时旧路径。
- empty guide promotion 继续只在无草稿时触发；不改变 IME、guide shortcut、invalid Skill 发送门禁或 queue recovery UI。

### 当前直接与间接测试消费者

根据实施前 `rg`，至少覆盖：

- `codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx`
- `codex-gui/src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx`（只处理 Task 1 后仍存在的最终 interface 调用）
- `codex-gui/src/__tests__/App.browser.test.tsx`
- `codex-gui/src/__tests__/sequential/composerClipboard.browser.test.tsx`
- `codex-gui/src/__tests__/sequential/composer-viewport.browser.test.tsx`
- `codex-gui/src/features/appShell/__tests__/routeConnectionStartupCoordinator.test.ts`
- `codex-gui/src/features/projectionCoordination/__tests__/activeThreadOwner.test.ts`
- `codex-gui/src/features/projectionCoordination/__tests__/liveThreadReplacement.test.ts`
- `codex-gui/src/features/projectionCoordination/__tests__/projectionApplicationCoordinator.test.ts`
- `codex-gui/src/features/projectionCoordination/__tests__/threadSwitchCoordinator.test.ts`
- 上述测试实际共享的 `codex-gui/src/__tests__/appBrowserTestSupport.ts` 或同目录现有 support/fixture（仅当 `rg` 证明需要修改）。

测试不得继续直接调用旧 compiler 或用裸 input 调 coordinator。统一复用 Task 2 的合法 prepared test fixture，或通过真实 Composer capture 产生值。

实施前和 Task 3 完成前分别运行：

```bash
rg -n -e 'compileComposerDraft' -e 'clearIfSame' -e 'ComposerEditorSnapshot' -e 'queueCoordinator\.submit\(' -e 'queueCoordinator\.submitSteer\(' codex-gui/src codex-gui/e2e
```

最终只允许新 domain 中仍有意义的 snapshot 类型；旧 compiler、旧 clear identity 和 input-only submit 调用必须为零。

### Browser 与交互覆盖

- ComposerTurnControl Browser test 断言 ordinary/guide 收到完整 prepared capture，并验证 queue 接受后才清空、拒绝时保留。
- ComposerEditor Browser test 保持 Skill token、IME、catalog invalid，并增加 restore 后新编辑会话、光标末尾和再次 submit capture。
- clipboard sequential test 改用 controller capture/input 投影验证 rich clipboard，不导入已删除 compiler。
- viewport sequential test 通过合法 prepared fixture 建立 long pending inputs，不用裸 input submit。
- App Browser 与 owner/coordinator tests 只迁移输入构造和整对象断言，不扩大到 drawer mutation。
- 所有 Browser Mode DOM 断言使用 role/name locator、`expect.element`/`expect.poll` 和 `userEvent`；不得对 Lexical contenteditable 使用 value 或 placeholder locator。

### 定向验证

从 `codex-gui` 执行 unit tests：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit -- src/features/appShell/__tests__/routeConnectionStartupCoordinator.test.ts src/features/projectionCoordination/__tests__/activeThreadOwner.test.ts src/features/projectionCoordination/__tests__/liveThreadReplacement.test.ts src/features/projectionCoordination/__tests__/projectionApplicationCoordinator.test.ts src/features/projectionCoordination/__tests__/threadSwitchCoordinator.test.ts
```

执行 parallel Browser Mode：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:parallel -- src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx src/__tests__/App.browser.test.tsx
```

执行 sequential Browser Mode：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:sequential -- src/__tests__/sequential/composerClipboard.browser.test.tsx src/__tests__/sequential/composer-viewport.browser.test.tsx
```

执行完整类型检查：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

若某个列出测试未被实际改动但直接消费已变 interface，仍运行；若 `rg` 发现新的直接/间接消费者，先加入 Task 3 范围和定向验证，不能用 cast/fallback 绕开。

### 提交边界

只暂存 Task 3 的 production consumer、测试 consumer 和必要 shared test support；检查 staged diff 后提交。

建议提交标题：

```text
feat(gui): submit captured composer drafts
```

## 格式化纪律与独立 pure format commit

三个行为任务的提交不得夹带不改变行为的 import、声明、字段、分支、函数、组件或其他代码顺序调整。完成 Task 3 后才运行项目固化格式化入口：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt:fix
```

随后检查：

```bash
git status --short
git diff --check
git diff
```

- 若格式化只对本计划文件产生 import/声明/代码顺序、换行或其他纯格式差异，创建独立提交，禁止 amend。
- 若格式化产生行为差异，先定位为本次变更问题并以独立修正提交处理，不能混入 pure format commit。
- 若格式化修改范围外文件，停止并报告，不暂存范围外差异。
- 若无 diff，不创建空提交。

建议 pure format 提交标题：

```text
style(gui): format restorable composer drafts
```

## 最终验证

完成三项行为提交与可能的 pure format commit 后，从 `codex-gui` 运行：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run ci
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser
```

当前 `ci` 固化执行：

- `protocol:check-validators`；
- `format:oxfmt`；
- `lint`；
- `type-check`；
- 全部 Node Vitest unit tests。

当前 `test:browser` 固化执行 parallel 与 sequential Browser Mode，两个 config 都在 Chromium、Firefox、WebKit 上运行。不得用单浏览器通过替代最终三浏览器结果。

最终 Browser 失败应使用 role/name locator、`expect.element`/`expect.poll` 和真实 `userEvent` 修正；不得加入 sleep、弱化断言、跳过浏览器或改测试 config。

不运行 App browser 手工验收或 Playwright E2E：本计划没有新增可见 UI 入口，真实 Lexical DOM 已由 Browser Mode 覆盖；`App.browser.test.tsx` 是 Vitest Browser Mode consumer，不是额外人工验收。未来 drawer mutation 实现再安排可见交互验收。

## 仓库级最终格式化

上述 GUI 最终测试全部通过后，按根规则在 `codex-rs` 运行：

```bash
just fmt
```

随后回到仓库根只检查 diff：

```bash
git status --short
git diff --check
git diff
```

- 不再重跑 GUI 或 Rust 测试。
- 若 `just fmt` 只在本计划已修改范围产生纯格式差异，创建新的独立格式提交，禁止 amend。
- 若产生范围外差异，停止并报告，不暂存、不恢复用户文件。
- 正常预期是没有 Rust diff；本计划不修改 Rust。

## 最终发现问题的处理

- 最终验证发现由本次变更引入的问题时，只能创建新的独立修正提交，禁止 amend Task 1/2/3、docs 或 format commit。
- 修正后只重跑与修正直接相关的定向验证；若修正发生在 GUI 最终验证完成前，再继续尚未完成的最终命令。
- 已完成全部最终验证并进入 `just fmt` 后，不因纯格式提交重跑测试。
- 预存或无关失败只报告证据，不修改、不放宽检查、不新增忽略或 fallback。

建议修正提交标题按实际根因命名，不使用泛化 `fix tests`。

## 明确排除项与当前代码证据

### 不修改 drawer mutation

当前 `ComposerPendingInputDrawer.tsx` 只读分页与详情；本计划只让底层 local message 拥有 draft，不增加 edit/delete/reorder/lane mutation interface。抽屉所有权转移、Composer 草稿冲突和取消行为仍需后续独立设计。

### 不修改 catalog owner

`skillCatalogOwner.ts` 已通过 generated `SkillsListResponse` 按 cwd 获取 enabled skills，并区分 ready/refreshing/stale/failed。本计划沿用现有 validity projection，不改变 catalog 请求、缓存、refresh 或错误语义。

### 不修改 app-server/protocol

`composerInputPayload.ts` 当前已机械证明 `TurnStartParams["input"]` 与 `TurnSteerParams["input"]` 等价，并 exhaustively copy generated variants。本计划只改变 frontend-owned queue message，不改变 wire contract、schema、validator、GUI Host allowlist 或 RPC method。

因此不运行：

- `protocol:generate-validators`；
- app-server schema 生成；
- Rust protocol/app-server tests；
- Cargo/just build 或 run。

最终 `pnpm run ci` 中现有 `protocol:check-validators` 仅做 drift check，不授权生成。

### 不修改 Rust/TUI

TUI 只提供“排队期间保存可恢复草稿、已发送 pending 不编辑”的状态模型证据。GUI 使用 Lexical SkillNode，不复制 TUI sidecar bindings、快捷键、LIFO 操作或 Rust数据结构。本计划不修改任何 Rust/TUI 文件或 snapshot。

### 不扩展其他结构化输入恢复

generated input 仍可能包含 image、localImage、audio、localAudio、mention 等 variants，但 ComposerDraft 恢复只承诺普通文本与 SkillNode。queue 必须继续透明携带所有 generated input variants，不能宣称 image/audio/mention 可恢复为 Composer 编辑状态。

### 不改变 delivery/recovery

当前 `composerInputQueue.ts`、`composerStartQueueState.ts`、`composerSteerQueueState.ts` 和 coordinator 已区分 issuing、accepted、deliveryUnknown、definitelyNotAccepted、terminal、userStopped 和 capability ownership。本计划只让合法 local message 多携带 draft，并将 rejected merge 标为 delivery-only；不得修改分类条件、重试、阻塞、对账或释放时机。

### 不引入兼容与依赖

- 不保留 `compileComposerDraft.ts` wrapper/re-export。
- 不新增 input-only submit overload、nullable draft、adapter、双写、双读、fallback 或旧新路径并存。
- 不安装或更新依赖、Node、pnpm、浏览器或可执行组件。
- 不执行 `git fetch`、`git pull`、`git push`、`git remote` 或其他远程 Git 操作。
- 不使用 force、amend 或绕过 ignore/protection 的 Git 操作。

## 完成标准

- design 与 plan 已先形成独立 docs commit，且没有 research、旧 drawer docs 或代码混入。
- Task 1/2/3 各自形成一个独立行为提交；任何 pure format 和最终修正均为新的独立提交，没有 amend。
- `compileComposerDraft.ts` 已用 `git rm` 删除，对应测试已用 `git mv` 成为 `composerDraft.test.ts`，最终无兼容 re-export。
- ComposerDraft 是 opaque owned versioned Lexical serialization，不是自建 AST；capture/restore/clearIfCurrent 的 interface 和失败原子性符合已确认设计。
- queue domain 用 discriminated types 区分 recoverable prepared local message 与 rejected-steer synthetic delivery-only aggregate；draft 不 optional、不 nullable。
- ordinary、promotion、steer、StartClaim、definitelyNotAccepted、userStopped 和 wire request 保留 prepared draft + input；deliveryUnknown 和 capability identity 语义不变。
- ComposerTurnControl 和所有 `rg` 命中的直接/间接消费者已一次性切换到 capture submit；没有外层 Lexical 遍历、裸 EditorState clear identity或 input-only coordinator submit。
- catalog owner、drawer mutation、app-server/protocol、Rust/TUI 和 image/audio/mention restore 均未修改。
- Task 定向 unit/browser、Task 3 type-check、最终 `pnpm run ci` 与最终 `pnpm run test:browser` 全部通过。
- 最后已在 `codex-rs` 运行 `just fmt` 并只读检查 diff；无范围外差异被暂存或修改处理。
