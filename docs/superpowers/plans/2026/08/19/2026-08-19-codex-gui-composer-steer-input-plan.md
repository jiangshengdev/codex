# Codex GUI Composer 信息引导实施计划

状态：已确认

日期：2026-08-19

对应设计：`docs/superpowers/specs/2026/08/19/2026-08-19-codex-gui-composer-steer-input-design.md`

## 目标

在 Codex GUI 当前 thread owner 内接通 same-turn `turn/steer`：普通输入继续严格 FIFO
排队，显式`引导`进入独立 FIFO，并以权威 projection commit 收敛；明确不可 steer 的
输入按原序优先转成新 turn，delivery unknown 不重试，本 GUI 主动停止只在用户明确继续
后恢复。

## 当前代码证据

- `composerInputQueue.ts` 已拥有 structured `TurnStartParams["input"]`、ordinary FIFO、
  start claim、recovery 与 terminal drain，但没有 steer、pending 或 rejected 容器；当前
  normal terminal 会直接 drain ordinary，不能外挂一个独立 steer observer。
- `composerInputQueueCoordinator.ts` 已统一拥有 async generation、effect 执行、runtime
  observation、release reservation 与 snapshot，但只注入 `startTurn`。
- `composerInputQueueRuntimeObservation.ts` 已把 live `turnStarted`、带 `clientId` 的 user
  message commit 和 `turnCompleted` 转为顺序 observation；不需要新增 projection 事件。
- `guiHostCommandGateway.ts`、GUI Host allowlist 与生成 descriptor 已支持 `turn/steer`；
  Rust app-server 也已在 JSON-RPC `error.data` 中提供 `TurnError`/
  `ActiveTurnNotSteerable`。本计划不修改 wire shape、Rust 或生成协议。
- `guiHostTransportSession.ts` 当前把完整 JSON-RPC error 压成普通 `Error`，gateway 的
  `GuiHostCommandError` 也没有暴露结构化 RPC error；coordinator 因此无法可靠分类
  `ActiveTurnNotSteerable`。
- `activeThreadOwner.ts` 只向 queue coordinator 注入 `startTurn`；
  `ComposerTurnControl.tsx` 仍直接调用 `commands.interruptTurn`，请求前没有本地 stop
  owner。
- `ComposerEditor.tsx` 的两条 Enter 路径共享单一 `onSubmit`，尚不能区分普通 Enter 与
  平台主修饰键 Enter，也不能在空草稿时发出“提升 ordinary 队首”的 intent。
- Skill 输入补全已经落地：queue payload 是 canonical structured input，
  `compileComposerDraft` 会保留 skill `name + path`。本计划直接依赖该基线，不重复进行
  text-to-structured 迁移，也不保留 string/structured 双路径。

## 跨任务硬约束

- `ComposerInputQueueCoordinator` 是 ordinary、steer、pending、rejected、start/recovery
  与 local user-stop claim 的唯一 owner；React、Redux、active owner 不复制可重发 payload。
- ordinary 与 steer 各自只允许尾入头出。空草稿提升必须原子移动 ordinary 队首到 steer
  队尾；禁止提升队尾、pending start 或 recovery item。
- ordinary 与 steer 复用同一个 immutable structured payload owner。rejected 合并通过按序
  串接 `UserInput[]` 完成，保留 text、skill name/path 和 item 顺序，禁止转成字符串重解析。
- `accepted` 只进入 awaiting-commit；只有匹配 thread、turn、`clientUserMessageId` 的 live
  commit 才释放 pending。`deliveryUnknown` 保持 owner、阻塞后继且不重试、不 fallback。
- normal terminal 内必须先应用此前 commit，再按 `pendingSteers → steerQueue` 转 rejected，
  再让 rejected 合并输入取得唯一 start claim，最后才允许 ordinary drain。
- 只有结构化 `ActiveTurnNotSteerable` 进入 rejected fallback。generic
  `definitelyNotAccepted` 进入显式 recovery，禁止解析错误字符串或伪装成已确认 fallback。
- 本地 stop claim 必须在发出 interrupt 前建立，并绑定 thread、turn、generation 与请求
  identity；只有匹配的 `interrupted` terminal 可消费一次。无匹配 claim 的 interrupted
  terminal 按非本地异常中断恢复。
- 不修改 app-server、TUI、Rust schema、生成协议或 committed transcript；pending preview
  始终位于 transcript 外。

## 执行规则

- 用户明确确认本计划前不得开始实施。
- 实施使用 `$managing-work-stages`、`$project-doc-workflow` 与
  `$delegating-micro-stages`；编辑、验证、stage、staged diff 审查和 commit 按依赖顺序
  分成微阶段。
- 每个任务只暂存本任务文件，检查 staged diff，并创建一个独立本地提交；对已有提交的
  修正另建提交，禁止 amend。
- 任务 4 是纯结构提取，禁止混入行为变化；其余行为提交禁止顺手进行 import、声明、函数、
  组件或分支重排。工具产生的无关重排应撤出；确有必要时另立纯重排任务并重新确认计划。
- 普通源码无更高层原生工具可表达时才使用 patch。Lingui catalog 只通过现有
  `messages:extract` 生成后补译，不运行 `messages:extract:clean`，不手改生成协议。
- 每个源码任务修改完成后，先对该任务文件运行 scoped
  `/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt --write <task-files>`，检查实际
  diff，再用非 fix 命令验证；不得让 formatter 或 fixer 改写任务外文件。
- 所有 pnpm 命令在 `codex-gui` 目录通过
  `/opt/homebrew/bin/fnm exec --using-file pnpm ...` 执行；不安装依赖或浏览器。
- 不运行 Rust、后端、原生程序构建，不操作 Git 远程。

## 计划提交序列

1. `docs(gui): record composer steer design and plan`
2. `fix(gui): preserve transport rpc error details`
3. `feat(gui): expose structured command rpc errors`
4. `refactor(gui): extract composer queue contracts`
5. `feat(gui): own composer steer queue state`
6. `feat(gui): coordinate steer and interrupt lifecycles`
7. `feat(gui): distinguish composer guide shortcuts`
8. `feat(gui): add composer guide controls`
9. `test(gui): verify composer guide integration`

## 任务 1：记录已确认设计与实施计划

**文件**

- `docs/superpowers/specs/2026/08/19/2026-08-19-codex-gui-composer-steer-input-design.md`
- `docs/superpowers/plans/2026/08/19/2026-08-19-codex-gui-composer-steer-input-plan.md`

**实施**

- 保持设计状态为“已确认”。
- 用户确认计划后，把本计划状态改为“已确认”。
- 只提交这两份文档，不夹带源码或其他工作树变更。

**验证**

```bash
git diff --check -- docs/superpowers/specs/2026/08/19/2026-08-19-codex-gui-composer-steer-input-design.md docs/superpowers/plans/2026/08/19/2026-08-19-codex-gui-composer-steer-input-plan.md
```

## 任务 2：在 transport 保留完整 JSON-RPC error

**文件**

- 修改：`codex-gui/src/features/guiHost/guiHostTransportSession.ts`
- 修改测试：`codex-gui/src/features/guiHost/__tests__/guiHostTransportSession.test.ts`

**实施**

- 从已生成 `JSONRPCMessage` 派生并原样保存 `JSONRPCErrorError` envelope，而不是只把
  code/message 格式化进普通 `Error`。
- 保持现有 `TransportRequestDelivery` 分类不变；RPC error 仍是
  `definitelyNotAccepted`，连接关闭、畸形或缺失 post-send result 的 unknown 语义不变。
- 测试 code、message、data 的完整保真和现有连接生命周期。

**验证**

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit -- src/features/guiHost/__tests__/guiHostTransportSession.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

## 任务 3：在 command error 暴露结构化 RPC error

**文件**

- 修改：`codex-gui/src/features/guiHost/guiHostCommandGateway.ts`
- 修改测试：`codex-gui/src/features/guiHost/__tests__/guiHostCommandGateway.test.ts`
- 修改测试：`codex-gui/src/features/guiHost/__tests__/guiHostCommands.test.ts`

**实施**

- 让 `GuiHostCommandError` 在保留 `source`、`delivery` 的同时暴露 transport 原始
  `JSONRPCErrorError`；不新增手写 DTO。
- 通过生成的 `TurnError`、`CodexErrorInfo`、`NonSteerableTurnKind` 编写窄 type guard，
  只按 `error.data` discriminant 识别 `ActiveTurnNotSteerable`。
- 用 WebSocket facade 测试证明 `turn/steer` error data 从 transport 到 command caller
  保真，且 RPC error 不会错误关闭连接。

**验证**

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit -- src/features/guiHost/__tests__/guiHostCommandGateway.test.ts src/features/guiHost/__tests__/guiHostCommands.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

## 任务 4：行为不变地提取 queue contracts

**文件**

- 新建：`codex-gui/src/features/composerInputQueue/composerInputQueueContracts.ts`
- 修改：`codex-gui/src/features/composerInputQueue/composerInputQueue.ts`
- 修改：`codex-gui/src/features/composerInputQueue/composerInputQueueCoordinator.ts`
- 修改测试：`codex-gui/src/features/composerInputQueue/__tests__/composerInputQueue.test.ts`
- 修改测试：`codex-gui/src/features/composerInputQueue/__tests__/composerInputQueueCoordinator.test.ts`

**实施**

- 把 message、claim、settlement、effect、transition、view、release blocker、runtime
  observation 与公开 Interface 移到 contracts module。
- `composerInputQueue.ts` 继续作为唯一外部入口并 re-export 既有公开类型；不改变公开方法、
  transition、snapshot 或测试预期。
- 该结构提交为 steer 深 module 腾出边界，避免继续扩张已超过 500 行的主 module。

**验证**

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit -- src/features/composerInputQueue/__tests__/composerInputQueue.test.ts src/features/composerInputQueue/__tests__/composerInputQueueCoordinator.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

## 任务 5：建立独立 steer/pending/rejected 状态 module

**文件**

- 新建：`codex-gui/src/features/composerInputQueue/composerSteerQueueState.ts`
- 修改：`codex-gui/src/features/composerInputQueue/composerInputQueueContracts.ts`
- 修改：`codex-gui/src/features/composerInputQueue/composerInputQueue.ts`
- 新建测试：`codex-gui/src/features/composerInputQueue/__tests__/composerInputQueueSteer.test.ts`
- 修改测试：`codex-gui/src/features/composerInputQueue/__tests__/composerInputQueue.test.ts`

**实施**

- 在内部深 module 中唯一拥有 `steerQueue`、`pendingSteers`、
  `rejectedSteersQueue`、steer phase/identity 和 terminal 迁移；它不执行 RPC、不订阅 React、
  不持有 ordinary queue。
- 扩展 queue interface，表达 direct steer、ordinary 队首提升、steer settlement、interrupt
  request/settlement 与显式 recovery；所有 transition 返回 effect，由 coordinator 执行。
- 复用现有唯一 `StartClaim` 发送 rejected 合并 input，不新增第二套 start owner。
- 测试四容器唯一所有权、双 FIFO、队首提升、连续 accepted/pending、identity commit、
  delivery unknown 阻塞、结构化拒绝、generic recovery、normal/interrupted terminal 顺序、
  local stop 与 non-local interruption 差异，以及 structured skill payload 全程不变。

**验证**

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit -- src/features/composerInputQueue/__tests__/composerInputQueue.test.ts src/features/composerInputQueue/__tests__/composerInputQueueSteer.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

## 任务 6：协调 steer、interrupt 与 owner 生命周期

**文件**

- 修改：`codex-gui/src/features/composerInputQueue/composerInputQueueCoordinator.ts`
- 修改：`codex-gui/src/features/composerInputQueue/composerInputQueueRuntimeObservation.ts`
- 修改测试：`codex-gui/src/features/composerInputQueue/__tests__/composerInputQueueCoordinator.test.ts`
- 修改测试：`codex-gui/src/features/composerInputQueue/__tests__/composerInputQueueRuntimeObservation.test.ts`
- 修改：`codex-gui/src/features/projectionCoordination/activeThreadOwner.ts`
- 修改测试：`codex-gui/src/features/projectionCoordination/__tests__/activeThreadOwner.test.ts`
- 修改测试：`codex-gui/src/features/projectionCoordination/__tests__/projectionApplicationCoordinator.test.ts`
- 修改测试：`codex-gui/src/features/projectionCoordination/__tests__/threadSwitchCoordinator.test.ts`
- 修改测试：`codex-gui/src/features/appShell/__tests__/routeConnectionStartupCoordinator.test.ts`

**实施**

- coordinator 注入并执行 `startTurn`、`steerTurn`、`interruptTurn`；发送 steer 时机械使用
  captured `expectedTurnId`、immutable input 与稳定 `clientUserMessageId`。
- 将 RPC success、结构化 non-steerable、generic definite reject 与 delivery unknown 映射为
  不同 settlement；generation/dispose 使旧 settlement 失效。
- 在发 interrupt 前同步建立一次性 local stop claim；accepted/unknown 保留，definite reject
  只清除同一 claim，匹配 terminal 才决定 user-stop recovery。
- snapshot 只暴露 readonly UI projection：ordinary count、steer/rejected preview phase、
  unknown 与 recovery 状态；不暴露 claim capability、transport error 或 mutable payload。
- 扩展 release blocker，使 thread switch 不会丢弃、改绑 unresolved steer/rejected/stop
  recovery；保持 queue-first dispose 和 accepted projection 的同步顺序。

**验证**

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit -- src/features/composerInputQueue/__tests__/composerInputQueueCoordinator.test.ts src/features/composerInputQueue/__tests__/composerInputQueueRuntimeObservation.test.ts src/features/projectionCoordination/__tests__/activeThreadOwner.test.ts src/features/projectionCoordination/__tests__/projectionApplicationCoordinator.test.ts src/features/projectionCoordination/__tests__/threadSwitchCoordinator.test.ts src/features/appShell/__tests__/routeConnectionStartupCoordinator.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

## 任务 7：区分普通提交与平台引导快捷键

**文件**

- 修改：`codex-gui/src/features/composerEditor/ComposerEditor.tsx`
- 修改测试：`codex-gui/src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx`
- 修改：`codex-gui/src/features/composerTurnControl/composerTurnControlModel.ts`
- 修改测试：`codex-gui/src/features/composerTurnControl/__tests__/composerTurnControlModel.test.ts`

**实施**

- 让 editor intent 明确区分普通 Enter 与平台主修饰键 Enter；macOS 产生 Meta+Enter，
  Windows/Linux 产生 Control+Enter，并设置一致的 `aria-keyshortcuts`。
- 主修饰键 Enter 即使草稿为空也上报，以便 owner 决定是否提升 ordinary 队首；普通 Enter
  仍沿用 ordinary submit。
- 保留 Shift+Enter、IME composition/composition-end guard 和 typeahead 对 Enter 的既有优先级。
- 在纯 model 中机械计算 guide 可见性、非空按钮可用性与空草稿提升可用性；不复用只理解
  ordinary 的 `canSend`，也不复用仅服务 Apple WebKit IME 的平台判断。

**验证**

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit -- src/features/composerTurnControl/__tests__/composerTurnControlModel.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:parallel -- src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

## 任务 8：实现引导按钮、待处理区域与本地化

**文件**

- 修改：`codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx`
- 新建：`codex-gui/src/features/composerTurnControl/ComposerPendingInputRegion.tsx`
- 修改测试：`codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx`
- 机械生成并补译：`codex-gui/src/locales/en.po`
- 机械生成并补译：`codex-gui/src/locales/zh-CN.po`

**实施**

- active turn 中加入 HeroUI v3 `Button variant="secondary"` 的可见文字`引导`；使用
  `onPress`、`isDisabled`、必要时 `isPending`。idle 时隐藏，空草稿时禁用；tooltip 只补充
  快捷键，不承载唯一禁用原因。
- 普通 submit 与 guide submit 都只编译一次同一个 EditorState snapshot，再选择唯一 queue
  入口；owner 接受后只清除对应旧草稿，不能清除异步期间的新编辑。
- Stop 改走 coordinator 的 local-stop API，不再从 React 直接绕过 owner 调
  `commands.interruptTurn`。
- 新组件使用可命名 section、`Surface variant="secondary"`、必要的
  `Separator variant="tertiary"`、`Chip` semantic variants/tokens，依次显示`引导中`、
  `将优先发送`、`已排队 N 条`；preview 使用有界行数、`min-w-0` 和
  `overflow-wrap:anywhere`，状态不能只靠颜色。
- known fallback 使用`当前无法引导，已加入队列`，unknown 显示`引导状态未知`且不提供
  重试；user-stop recovery 提供明确继续操作。
- JSX 使用 Lingui `Trans`/`Plural`，ARIA、tooltip、toast 使用 `useLingui`。先运行
  `messages:extract`，再补 `zh-CN` 翻译；不运行 clean extraction。

**验证**

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run messages:extract
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:parallel -- src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

## 任务 9：验证完整 Composer 到 projection 纵向路径

**文件**

- 修改测试：`codex-gui/src/__tests__/App.browser.test.tsx`
- 修改测试：`codex-gui/src/__tests__/appBrowserTestSupport.ts`
- 修改测试：`codex-gui/src/__tests__/sequential/composer-viewport.browser.test.tsx`
- 按接口机械更新测试替身：
  `codex-gui/src/features/appShell/__tests__/AppShellTopBar.browser.test.tsx`
- 按接口机械更新测试替身：
  `codex-gui/src/features/threadHistory/__tests__/ThreadHistoryDetailPage.browser.test.tsx`
- 按接口机械更新测试替身：
  `codex-gui/src/features/threadHistory/__tests__/ThreadHistoryListPage.browser.test.tsx`

**实施**

- 在 App Browser harness 覆盖真实
  `Composer → active owner → turn/steer → live commit → transcript`，断言
  `expectedTurnId`、`clientUserMessageId`、structured input 与 preview/正式记录边界。
- 覆盖 Enter ordinary、平台快捷键 steer、空草稿只提升 ordinary 队首、explicit steer 越过
  ordinary、rejected 合并优先 start、delivery unknown 不重发、本地 Stop 不自动恢复、
  non-local interrupted 自动恢复。
- viewport 测试覆盖待处理区域增高、窄视口、长不可断 token 的 scroll-width closure；只断言
  稳定几何和可访问行为，不锁定 padding、gap、颜色、阴影。
- 只机械更新被 coordinator/owner interface 扩展影响的其他 Browser harness，不给只读历史页
  新增交互式 steer owner。

**验证**

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:parallel -- src/__tests__/App.browser.test.tsx src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx src/features/appShell/__tests__/AppShellTopBar.browser.test.tsx src/features/threadHistory/__tests__/ThreadHistoryDetailPage.browser.test.tsx src/features/threadHistory/__tests__/ThreadHistoryListPage.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:sequential -- src/__tests__/sequential/composer-viewport.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

## 最终验证与完成门禁

全部任务提交完成后，仅对本计划触及的文件执行 scoped format/lint，再运行所有定向 unit、
Browser parallel/sequential 与 package type-check。若 `oxfmt` 产生行为无关重排，不得混入
既有行为提交；应按执行规则建立独立纯重排任务并重新确认计划。最终纵向测试发现的行为
修正也必须形成新的独立提交，禁止 amend 或并入原行为提交。

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt --check <changed-files>
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxlint <changed-files>
/opt/homebrew/bin/fnm exec --using-file pnpm exec eslint --cache <changed-files>
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

完成必须同时证明：ordinary 与 steer 双 FIFO 不变；pending 只由权威 commit 释放；明确拒绝
按序优先转成唯一新 turn；unknown 不重发；本地 stop 不自动重启；从 GUI 按钮/快捷键到
权威 transcript 的完整路径可达。计划外文件、app-server API、生成协议、数据语义或安全边界
如需变化，必须停止实施、更新计划并等待重新确认。
