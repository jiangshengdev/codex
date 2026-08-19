# Codex GUI Composer 信息引导实施计划

状态：已确认

日期：2026-08-19

对应设计：`docs/superpowers/specs/2026/08/19/2026-08-19-codex-gui-composer-steer-input-design.md`

## 目标

在 Codex GUI 当前 thread owner 内接通 same-turn `turn/steer`：普通输入继续严格 FIFO
排队，显式`引导`进入独立 FIFO，并以权威 projection commit 收敛；明确不可 steer 的
输入按原序优先转成新 turn，delivery unknown 不重试，本 GUI 主动停止只在用户明确继续
后恢复。

## 预执行审计结论与当前基线

- 当前 `HEAD` 为 `f3065f314`；该提交只新增与本任务无关的 skill-interface 设计/计划文档，
  未改变已按 `83fc4fe62` 审计的源码基线。任务 1 `edb8e7e7a` 与任务 2 `83fc4fe62` 已完成。
- 当前本任务只有本计划文档存在未提交修改；本任务设计文档和源码均无 dirty 变更。
- 预执行反向审计已核对排除项、文件清单、提交边界、权威契约、生命周期、UI 语义、
  generator 链和验证命令。审计发现的 `TurnError` schema/type 差异、command owner 间接消费者、
  中间提交 type-check、generated formatting、response identity、same-target rejection、最终验证
  命令等未知均已在任务 4–12 中闭合；实施中出现新的范围或语义变化时仍须停止并重新确认。

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
  `ActiveTurnNotSteerable`。当前 GUI 生成产物没有机械生成的 `validateV2TurnError`，不能
  安全消费这段 data；本计划不修改 Rust schema 或 wire shape，GUI generated artifacts
  只能由现有 protocol validator generator 生成，禁止手写 validator 或 type assertion。
- 任务 2（`83fc4fe62`）已让 `guiHostTransportSession.ts` 在 transport result 中保留完整
  `rpcError`；gateway 的 `GuiHostCommandError` 尚未暴露结构化 RPC error，coordinator 因此
  仍无法可靠分类 `ActiveTurnNotSteerable`。
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
- JSON-RPC `error.data` 必须先经过 generator 从 auxiliary root `v2/TurnError` 机械生成的
  `validateV2TurnError` 校验。由于权威 JSON Schema 只要求 `message`，生成 declaration 必须真实
  表达为 `ProtocolValidator<Partial<TurnError> & Required<Pick<TurnError, "message">>>`；禁止
  手写 schema、validator、DTO、discriminant assertion 或 `as TurnError` 绕过运行时验证。
- steer RPC response 只有 `turnId === claim.expectedTurnId` 才能 accepted；identity mismatch
  进入 unknown blocker，禁止静默改绑、重试或 fallback。
- 第一个结构化 non-steerable 是同一 `expectedTurnId` 的权威负面事实：按原提交顺序把同目标
  pending 再 unsent steers 批量迁入 rejected，禁止继续为这些消息发 RPC。
- `StartClaim` 必须保存 `ordinary | rejectedSteerMerge` provenance；synthetic rejected merge 的
  definite start failure 按原顺序恢复 rejected，不能降格或追加到 ordinary 尾部。
- pending/rejected/unknown 是持久状态投影，不用一次性 toast 代替；preview 最多 160 个
  grapheme，超限显示前 157 个加 `...`，使用 `Intl.Segmenter` 且穷尽处理 `UserInput`，不得暴露
  path、URL、client ID 或 transport identity。
- 本地 stop claim 必须在发出 interrupt 前建立，并绑定 thread、turn、generation 与请求
  identity；只有匹配的 `interrupted` terminal 可消费一次。无匹配 claim 的 interrupted
  terminal 按非本地异常中断恢复。
- 不修改 app-server、TUI、Rust schema、wire shape 或 committed transcript；GUI generated
  artifacts 只允许由现有 generator 更新，pending preview 始终位于 transcript 外。

## 执行规则

- 用户明确确认本计划前不得开始实施。
- 实施使用 `$managing-work-stages`、`$project-doc-workflow` 与
  `$delegating-micro-stages`；编辑、验证、stage、staged diff 审查和 commit 按依赖顺序
  分成微阶段。
- 每个任务只暂存本任务文件，检查 staged diff，并创建一个独立本地提交；对已有提交的
  修正另建提交，禁止 amend。
- 任务 6 是纯结构提取，禁止混入行为变化；其余行为提交禁止顺手进行 import、声明、函数、
  组件或分支重排。工具产生的无关重排应撤出；确有必要时另立纯重排任务并重新确认计划。
- 普通源码无更高层原生工具可表达时才使用 patch。Lingui catalog 只通过现有
  `messages:extract` 生成后补译，不运行 `messages:extract:clean`；GUI protocol validator
  产物只通过 `protocol:generate-validators` 更新，禁止手改。
- 每个源码任务修改完成后，先对该任务的 handwritten TypeScript/TSX 文件运行 scoped
  `/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt --write <task-files>`，检查实际
  diff，再用非 fix 命令验证；generated artifacts 与 `.po` 不进入 format/lint 写入或检查目标，
  不得让 formatter 或 fixer 改写任务外文件。
- 所有 pnpm 命令在 `codex-gui` 目录通过
  `/opt/homebrew/bin/fnm exec --using-file pnpm ...` 执行；不安装依赖或浏览器。
- 不运行 Rust、后端、原生程序构建，不操作 Git 远程。

## 计划提交序列

1. `docs(gui): record composer steer design and plan`（已完成：`edb8e7e7a`）
2. `feat(gui): preserve transport RPC errors`（已完成：`83fc4fe62`）
3. `docs(gui): revise steer error validation plan`
4. `feat(gui): generate turn error validation`
5. `feat(gui): expose structured command rpc errors`
6. `refactor(gui): extract composer queue contracts`
7. `feat(gui): model isolated composer steer state`
8. `feat(gui): integrate composer steer delivery`
9. `feat(gui): coordinate composer interrupt ownership`
10. `feat(gui): distinguish composer guide shortcuts`
11. `feat(gui): add composer guide controls`
12. `test(gui): verify composer guide integration`

## 任务 1：记录已确认设计与实施计划

**状态**

- 已完成：`edb8e7e7a`

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

**状态**

- 已完成：`83fc4fe62`

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
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/guiHost/__tests__/guiHostTransportSession.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

## 任务 3：确认 steer error validation 计划修订

**文件**

- 修改：`docs/superpowers/plans/2026/08/19/2026-08-19-codex-gui-composer-steer-input-plan.md`

**实施**

- 用户确认本次修订后，把本计划状态从“待确认”改为“已确认”。
- 只提交本计划文档，不修改或重复提交设计文档，不夹带源码与其他工作树变更。

**验证**

```bash
git diff --check -- docs/superpowers/plans/2026/08/19/2026-08-19-codex-gui-composer-steer-input-plan.md
```

## 任务 4：机械生成 TurnError runtime validator

**文件**

- 修改：`codex-gui/src/features/guiHost/appServerProtocol.ts`
- 修改：`codex-gui/scripts/protocolValidators/cli.ts`
- 修改：`codex-gui/scripts/protocolValidators/core.ts`
- 修改：`codex-gui/scripts/protocolValidators/typescriptArtifacts.ts`
- 修改测试：`codex-gui/scripts/protocolValidators/cli.test.ts`
- 修改测试：`codex-gui/scripts/protocolValidators/core.test.ts`
- 机械生成：`codex-gui/src/generated/appServerProtocol/appServerPayloadValidators.raw.js`
- 机械生成：`codex-gui/src/generated/appServerProtocol/appServerPayloadValidators.js`
- 机械生成：`codex-gui/src/generated/appServerProtocol/appServerPayloadValidators.d.ts`

**实施**

- 在 `appServerProtocol.ts` 只声明 auxiliary schema selector `v2/TurnError`；CLI 机械读取该
  selector，core 将它与已选择 response/notification roots 一起加入
  `appServerPayloadValidators` closure 并导出 `validateV2TurnError`。
- TypeScript artifact generator 依据同一 JSON Schema 的 `required` 机械生成 declaration。
  `v2/TurnError` 当前只要求 `message`，因此精确类型必须是
  `ProtocolValidator<Partial<TurnError> & Required<Pick<TurnError, "message">>>`，禁止谎称
  `ProtocolValidator<TurnError>`，也禁止手写 mirror、schema、validator 或 assertion。
- generator tests 覆盖 auxiliary selector 读取、缺失 schema、export name、declaration 类型、
  selected closure 与 runtime：接受仅含 `message` 和完整合法 TurnError；拒绝缺少 `message`、
  malformed 字段或非对象输入。
- `protocol:generate-validators` 会原子重写 app-server 与 GUI Host 两个完整输出目录；预期 Git
  内容 diff 只能是三个 `appServerPayloadValidators.*`。出现其他 generated diff 时立即停止，
  不得把漂移夹带进任务 4。
- `oxfmt --write` 只运行于六个 handwritten generator 源码/测试文件；三个 generated artifacts
  只能由 generator 写入，并仅用 `protocol:check-validators` 与 Git diff 核验。
- 不修改 Rust schema、wire shape、request/notification definitions 或其他生成文件。

**验证**

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run scripts/protocolValidators/cli.test.ts scripts/protocolValidators/core.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run protocol:generate-validators
/opt/homebrew/bin/fnm exec --using-file pnpm run protocol:check-validators
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

## 任务 5：在 command error 暴露结构化 RPC error

**文件**

- 修改：`codex-gui/src/features/guiHost/guiHostCommandGateway.ts`
- 修改测试：`codex-gui/src/features/guiHost/__tests__/guiHostCommandGateway.test.ts`
- 修改测试：`codex-gui/src/features/guiHost/__tests__/guiHostCommands.test.ts`
- 修改测试支持：`codex-gui/src/features/guiHost/__tests__/guiHostClientTestSupport.ts`

**实施**

- `GuiHostCommandError` 保留 `source`、`delivery`，新增 optional readonly `rpcError` 和 readonly
  boolean `activeTurnNotSteerable`。boolean 是经过权威 validator 后形成的 frontend fact，不是
  app-server DTO mirror；没有 RPC error 或验证失败时必须为 `false`。
- 直接从 generated `appServerPayloadValidators` 导入 `validateV2TurnError`。validator 通过后，
  对 generated union 使用正常的 `typeof`/`in` narrowing 检查
  `codexErrorInfo.activeTurnNotSteerable`；禁止 assertion、错误字符串解析或 consumer-owned
  validator。
- `guiHostClientTestSupport.ts` 的 RPC error 参数类型从 generated `JSONRPCErrorError` 机械派生，
  不手写 envelope shape；`guiHostClient.ts` 不需要修改或重复导出新符号。
- 测试覆盖完整 active-turn error、generic TurnError、仅 `message`、`codexErrorInfo: null`、
  string、其他 object、malformed object 与 no-data；同时证明 RPC error 不关闭连接且原 envelope
  保真。任务 2 transport test 纳入最终 regression。

**验证**

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/guiHost/__tests__/guiHostTransportSession.test.ts src/features/guiHost/__tests__/guiHostCommandGateway.test.ts src/features/guiHost/__tests__/guiHostCommands.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

## 任务 6：行为不变地提取 queue contracts

**文件**

- 新建：`codex-gui/src/features/composerInputQueue/composerInputQueueContracts.ts`
- 修改：`codex-gui/src/features/composerInputQueue/composerInputQueue.ts`
- 修改：`codex-gui/src/features/composerInputQueue/composerInputQueueCoordinator.ts`

**实施**

- 只提取不携带私有 capability 的 9 个公开 contract：`ComposerQueueMessage`、`RecoveryBatch`、
  `ComposerInputQueueResult`、`ComposerInputQueuePendingStartPhase`、
  `ComposerInputQueueReleaseBlocker`、`ComposerInputQueueReleaseState`、
  `ComposerInputQueueView`、`RuntimeObservation`、`CreateComposerInputQueueInput`。
- `StartClaim`、`ComposerInputQueueEffect`、`ComposerInputQueueTransition`、`StartSettlement` 与
  `ComposerInputQueue` 继续由 `composerInputQueue.ts` 定义；这样 `startClaimCapability` 及唯一构造
  路径仍留在同一实现模块，禁止导出 brand/factory、使用 assertion、扩大构造权限或新增测试
  helper。
- `composerInputQueue.ts` 保持 facade，并 re-export 被提取的 9 个类型，因此原有 14 个公开类型
  的 import path 与形状完全不变。`composerInputQueueCoordinator.ts` 只把可直接消费的无 capability
  contract 切换到新模块，claim-bearing 类型仍从 facade 导入；公开方法、transition、snapshot、
  测试预期和 runtime behavior 均不改变。
- 两个既有 queue unit test 只读运行验证；本任务不得为迁就提取而修改测试文件。若测试需要
  内容改动，视为行为或 contract 漂移并停止。
- 该结构提交为 steer 深 module 腾出边界，避免继续扩张已超过 500 行的主 module。

**验证**

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/composerInputQueue/__tests__/composerInputQueue.test.ts src/features/composerInputQueue/__tests__/composerInputQueueCoordinator.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

## 任务 7：建立隔离的 steer/pending/rejected 状态 model

**文件**

- 新建：`codex-gui/src/features/composerInputQueue/composerSteerQueueState.ts`
- 新建测试：`codex-gui/src/features/composerInputQueue/__tests__/composerSteerQueueState.test.ts`

**实施**

- model 独立拥有 `steerQueue`、`pendingSteers`、`rejectedSteersQueue`、phase、identity、captured
  `expectedTurnId` 与 immutable structured input；不导入 shared queue contracts，不持有 ordinary、
  不执行 RPC、不订阅 React，也不包含 interrupt/local-stop 语义。
- transition 纯表达 direct enqueue、issue、accepted-awaiting-commit、identity commit、delivery
  unknown、response turn mismatch、结构化 non-steerable、generic definite reject 与 terminal。
- response turn mismatch 进入 unknown blocker；delivery unknown 阻止后继 issue。第一个
  non-steerable 按原序把同 target 的 pending 再 unsent entries 批量迁入 rejected，不再产生
  同 target issue。
- 测试独立证明 steer/pending/rejected 三 FIFO 的唯一所有权、commit identity、terminal 顺序、
  same-target non-steerable 批量迁移、response mismatch、unknown 阻塞以及 structured skill
  payload 全程不变。
- 本任务不修改 `composerInputQueueContracts.ts`、`composerInputQueue.ts` 或 coordinator，因此
  package type-check 必须独立通过，不依赖任务 8 的临时兼容路径。

**验证**

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/composerInputQueue/__tests__/composerSteerQueueState.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

## 任务 8：集成 steer delivery 与 queue 生命周期

**文件**

- 修改：`codex-gui/src/features/composerInputQueue/composerInputQueueContracts.ts`
- 修改：`codex-gui/src/features/composerInputQueue/composerInputQueue.ts`
- 修改：`codex-gui/src/features/composerInputQueue/composerSteerQueueState.ts`
- 修改：`codex-gui/src/features/composerInputQueue/composerInputQueueCoordinator.ts`
- 新建：`codex-gui/src/features/composerInputQueue/composerInputPreview.ts`
- 新建测试：`codex-gui/src/features/composerInputQueue/__tests__/composerInputPreview.test.ts`
- 修改测试：`codex-gui/src/features/composerInputQueue/__tests__/composerInputQueue.test.ts`
- 修改测试：`codex-gui/src/features/composerInputQueue/__tests__/composerSteerQueueState.test.ts`
- 修改测试：`codex-gui/src/features/composerInputQueue/__tests__/composerInputQueueCoordinator.test.ts`
- 修改：`codex-gui/src/features/projectionCoordination/activeThreadOwner.ts`
- 修改测试：`codex-gui/src/features/projectionCoordination/__tests__/activeThreadOwner.test.ts`
- 修改：`codex-gui/src/features/projectionCoordination/threadSwitchCoordinator.ts`
- 修改测试：`codex-gui/src/features/projectionCoordination/__tests__/threadSwitchCoordinator.test.ts`
- 修改：`codex-gui/src/features/appShell/routeConnectionStartupCoordinator.ts`
- 修改测试：`codex-gui/src/features/appShell/__tests__/routeConnectionStartupCoordinator.test.ts`
- 按 interface/snapshot 机械同步：`codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx`
- 按 interface/snapshot 机械同步测试：`codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx`
- 按 interface/snapshot 机械同步测试：`codex-gui/src/__tests__/App.browser.test.tsx`
- 必要时修改测试：`codex-gui/src/features/projectionCoordination/__tests__/projectionApplicationCoordinator.test.ts`

**实施**

- 将隔离 steer model 接入主 queue 与 coordinator；新增 `performSteer` effect 并在 coordinator
  穷尽处理所有 effect。`activeThreadOwner` 注入 `steerTurn`，route startup/thread switch 的
  command `Pick` 同步扩展，禁止依赖宽对象偶然通过。
- direct steer 和 ordinary 队首提升由主 queue 唯一仲裁。ordinary/steer 各自 FIFO；提升是从
  ordinary front 原子转移到 steer back；同一 payload 不得同时存在于两个 owner。
- `StartClaim` 增加 `ordinary | rejectedSteerMerge` provenance。rejected merge 通过唯一 start
  claim 抢在 ordinary 前发送；synthetic start definitely-not-accepted 时按原序恢复 rejected，
  不得进入 ordinary recovery 或 ordinary 尾部。主 queue 是 rejected start 与 ordinary drain
  的唯一仲裁者。
- `performSteer` 机械发送 captured `expectedTurnId`、immutable input 与稳定
  `clientUserMessageId`。response `turnId` 必须匹配 expected；mismatch 与 delivery unknown
  保持 blocker。generic definite reject 进入显式 recovery，不冒充 rejected fallback。
- `GuiHostCommandError.activeTurnNotSteerable` 为 true 时，将同 target pending 再 unsent entries
  批量迁入 rejected 并停止同 target RPC；normal terminal 先收敛 commit，再迁 unresolved
  pending/unsent，再发 rejected merge，最后才 drain ordinary。
- 新 preview helper 以 `Intl.Segmenter` 按 grapheme 截断到 160；超限取前 157 加 `...`。
  对 generated `UserInput` exhaustive 处理，仅输出安全用户内容，不暴露 skill path、URL、
  client identity 或 transport data。
- coordinator snapshot 只输出 bounded readonly projection：ordinary count、pending/unsent/rejected
  preview、phase、unknown 与 recovery fact；不暴露 claim capability、原 payload 或 error envelope。
- unresolved steer/rejected/recovery 纳入 release blockers；thread switch、generation、dispose 和
  accepted projection 顺序不得丢失或改绑 owner。`composerInputQueue.ts` 与
  `composerSteerQueueState.ts` 最终各不超过 500 LoC。
- 本任务不实现 interrupt/local stop。`ComposerTurnControl` 与 Browser/App mocks 只机械适配新增
  queue interface/snapshot，不加入按钮、快捷键或新交互。

**验证**

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/composerInputQueue/__tests__/composerInputPreview.test.ts src/features/composerInputQueue/__tests__/composerInputQueue.test.ts src/features/composerInputQueue/__tests__/composerSteerQueueState.test.ts src/features/composerInputQueue/__tests__/composerInputQueueCoordinator.test.ts src/features/projectionCoordination/__tests__/activeThreadOwner.test.ts src/features/projectionCoordination/__tests__/projectionApplicationCoordinator.test.ts src/features/projectionCoordination/__tests__/threadSwitchCoordinator.test.ts src/features/appShell/__tests__/routeConnectionStartupCoordinator.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/composerInputQueue/__tests__/composerInputQueueRuntimeObservation.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run --config=vitest.browser.parallel.config.ts src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx src/__tests__/App.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

## 任务 9：协调 interrupt ownership 与恢复

**文件**

- 修改：`codex-gui/src/features/composerInputQueue/composerInputQueueContracts.ts`
- 修改：`codex-gui/src/features/composerInputQueue/composerInputQueue.ts`
- 修改：`codex-gui/src/features/composerInputQueue/composerSteerQueueState.ts`
- 修改：`codex-gui/src/features/composerInputQueue/composerInputQueueCoordinator.ts`
- 修改测试：`codex-gui/src/features/composerInputQueue/__tests__/composerInputQueue.test.ts`
- 修改测试：`codex-gui/src/features/composerInputQueue/__tests__/composerSteerQueueState.test.ts`
- 修改测试：`codex-gui/src/features/composerInputQueue/__tests__/composerInputQueueCoordinator.test.ts`
- 修改：`codex-gui/src/features/projectionCoordination/activeThreadOwner.ts`
- 修改测试：`codex-gui/src/features/projectionCoordination/__tests__/activeThreadOwner.test.ts`
- 修改：`codex-gui/src/features/projectionCoordination/threadSwitchCoordinator.ts`
- 修改测试：`codex-gui/src/features/projectionCoordination/__tests__/threadSwitchCoordinator.test.ts`
- 修改：`codex-gui/src/features/appShell/routeConnectionStartupCoordinator.ts`
- 修改测试：`codex-gui/src/features/appShell/__tests__/routeConnectionStartupCoordinator.test.ts`
- 修改：`codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx`
- 修改：`codex-gui/src/features/composerTurnControl/composerTurnControlModel.ts`
- 修改测试：`codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx`
- 修改测试：`codex-gui/src/features/composerTurnControl/__tests__/composerTurnControlModel.test.ts`
- 按 interface 机械同步测试：`codex-gui/src/__tests__/App.browser.test.tsx`

**实施**

- 新增 `performInterrupt` effect；active owner 注入 `interruptTurn`，route startup/thread switch
  command contracts 同步扩展。coordinator 在调用 RPC 前同步建立绑定 thread、turn、generation
  与本地 request capability 的一次性 stop claim。
- accepted 与 delivery unknown 保留同一 claim；definitely-not-accepted 只清除匹配 claim。
  terminal observation 必须先完成请求 settlement/claim 分类，再迁移消息；只有匹配
  `interrupted` terminal 可消费 claim 一次。其他 terminal 清理过期 claim但不能冒充 user stop。
- 本地 Stop 后 pending/unsent/rejected/ordinary 进入显式分类恢复且不自动 start；用户明确继续后
  rejected/steer intent 优先于 ordinary。没有匹配 local claim 的 interrupted terminal 按
  non-local interruption 自动走 rejected-first 恢复。
- `ComposerTurnControl` Stop 改为 queue coordinator API，禁止直接调用
  `commands.interruptTurn`。调用前必须同时通过 current thread/controller identity 匹配和
  `canStop` gate；请求失败只显示真实 failure，不清除消息 owner。
- snapshot/release blocker 加入 stop claim 与分类 recovery；generation、dispose、thread switch
  使旧 settlement 失效但不把旧消息改绑到新 thread。

**验证**

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/composerInputQueue/__tests__/composerInputQueue.test.ts src/features/composerInputQueue/__tests__/composerSteerQueueState.test.ts src/features/composerInputQueue/__tests__/composerInputQueueCoordinator.test.ts src/features/projectionCoordination/__tests__/activeThreadOwner.test.ts src/features/projectionCoordination/__tests__/threadSwitchCoordinator.test.ts src/features/appShell/__tests__/routeConnectionStartupCoordinator.test.ts src/features/composerTurnControl/__tests__/composerTurnControlModel.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run --config=vitest.browser.parallel.config.ts src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx src/__tests__/App.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

## 任务 10：区分普通提交与平台引导快捷键

**文件**

- 修改：`codex-gui/src/features/composerEditor/ComposerEditor.tsx`
- 修改测试：`codex-gui/src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx`

**实施**

- 保持 `onSubmit(snapshot, intent)` 的 snapshot 第一参数，使既有 consumer 可以忽略第二参数；
  intent 明确区分 ordinary 与 guide。
- editor 内部根据运行平台选择 exact chord：macOS 仅 Meta+Enter，Windows/Linux 仅
  Control+Enter；不得让 Ctrl+Enter 与 Meta+Enter 同时在同一平台生效，也不得复用只服务
  Apple WebKit IME 的平台判断。
- DOM `onKeyDown` 与 Lexical `KEY_ENTER_COMMAND` 调用同一个 intent helper，防止两条路径语义
  漂移。主修饰键 Enter 即使 snapshot 为空也上报 guide intent；ordinary Enter 保持原行为。
- `ContentEditable` 设置与实际平台一致的 `aria-keyshortcuts`。保留 Shift+Enter、composition、
  composition-end suppression 与 typeahead 的既有优先级和单次提交语义。
- 只读核对 `ComposerClipboardPlugin` 对 Enter 没有独立 owner；无依赖时不得制造该文件 diff。

**验证**

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run --config=vitest.browser.parallel.config.ts src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

## 任务 11：实现引导按钮、待处理区域与本地化

**文件**

- 修改：`codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx`
- 修改：`codex-gui/src/features/composerTurnControl/composerTurnControlModel.ts`
- 新建：`codex-gui/src/features/composerTurnControl/ComposerPendingInputRegion.tsx`
- 修改测试：`codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx`
- 修改测试：`codex-gui/src/features/composerTurnControl/__tests__/composerTurnControlModel.test.ts`
- 机械生成并补译：`codex-gui/src/locales/en.po`
- 机械生成并补译：`codex-gui/src/locales/zh-CN.po`

**实施**

- 从任务 8 的 bounded coordinator projection 渲染，不在 React 保存第二份 queue/payload。
  active turn 中加入 HeroUI v3 `Button variant="secondary"` 的可见文字`引导`，使用 `onPress`、
  `isDisabled`、必要时 `isPending`；idle 时隐藏，空草稿时禁用。
- 快捷键提示使用 HeroUI `Tooltip` 直接包裹 `Button` child，不使用不存在的
  `Tooltip.Trigger`；tooltip 只补充快捷键，不能承载唯一禁用原因或状态。
- 新组件使用可命名 section、`Surface variant="secondary"`、必要的
  `Separator variant="tertiary"`、`Chip` semantic variants/tokens，依次显示`引导中`、
  `将优先发送`、`已排队 N 条`。preview 使用 `line-clamp-3`、`min-w-0` 和
  `overflow-wrap:anywhere`；160-grapheme 安全文本来自 owner，组件不得重建或扩展内容。
- rejected fallback 与 delivery unknown 使用持久可读状态，不使用一次性 toast 代替：分别显示
  `当前无法引导，已加入队列` 与 `引导状态未知`；unknown 不提供重试，user-stop recovery
  提供明确继续操作，状态不能只靠颜色。
- 普通/guide submit 对同一个 EditorState snapshot 只编译一次 canonical structured input；
  非空 guide 直接 steer，空 snapshot 的 guide intent 只提升 ordinary 队首。owner 接受后只
  `clearIfSame` 对应旧草稿，不清除异步期间的新编辑。
- Stop ownership 已在任务 9 完成，本任务不得再修改 Stop command 路径。
- JSX 使用英文 source 的 Lingui `Trans`/`Plural`，ARIA、tooltip 与非 JSX 状态使用
  `useLingui`；先运行
  `messages:extract`，再补 `zh-CN` 翻译；不运行 clean extraction。
- extraction 后审查 source-reference churn；只允许本任务新/移动消息的必要引用变化，若出现
  无关 catalog 漂移则停止，不得夹带。

**验证**

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run messages:extract
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/composerTurnControl/__tests__/composerTurnControlModel.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run --config=vitest.browser.parallel.config.ts src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

## 任务 12：验证完整 Composer 到 projection 纵向路径

**文件**

- 修改测试：`codex-gui/src/__tests__/App.browser.test.tsx`
- 修改测试：`codex-gui/src/__tests__/appBrowserTestSupport.ts`
- 修改共享测试 builder：`codex-gui/src/features/projection/__tests__/projectionTestBuilders.ts`
- 修改测试：`codex-gui/src/__tests__/sequential/composer-viewport.browser.test.tsx`

**实施**

- 在 App Browser harness 覆盖真实
  `Composer → active owner → turn/steer → live commit → transcript`，断言
  `expectedTurnId`、`clientUserMessageId`、structured input 与 preview/正式记录边界。
- 共享 `projectionTestBuilders.ts` 为合法 user-message projection 增加可选 `clientId` 构造能力；
  App 测试必须使用共享 builder，禁止手写完整 projection DTO。
- 覆盖 Enter ordinary、平台快捷键 steer、空草稿只提升 ordinary 队首、explicit steer 越过
  ordinary、多个 accepted pending 按 identity commit、same-target non-steerable 批量 rejected 且
  不再 RPC、rejected merge 优先 start、synthetic start failure 原序恢复、response mismatch 与
  delivery unknown 不重发、本地 Stop 不自动恢复、明确继续按类别恢复、non-local interrupted
  自动 rejected-first、thread/generation/dispose 不改绑。
- viewport 测试覆盖待处理区域增高、窄视口、长不可断 token 的 scroll-width closure；只断言
  稳定几何、`line-clamp-3`、可访问行为和 scroll closure，不锁定 padding、gap、颜色、阴影。
- `AppShellTopBar` 与 thread history Browser tests 已在任务 8/9 的 interface 同步中证明无需产品
  行为变化；本任务只读验证，不制造这些排除文件的假 diff，也不给只读历史页新增 steer owner。

**验证**

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run --config=vitest.browser.parallel.config.ts src/__tests__/App.browser.test.tsx src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run --config=vitest.browser.sequential.config.ts src/__tests__/sequential/composer-viewport.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

## 最终验证与完成门禁

全部任务提交完成后，仅对 handwritten TypeScript/TSX 运行 scoped format/lint；generated
artifacts 与 `.po` 明确排除。随后实际重跑完整定向 unit、Browser parallel/sequential、protocol
check、messages extraction drift check 与 package type-check。若 formatter 产生行为无关重排，
不得混入既有行为提交；应按执行规则建立独立纯重排任务并重新确认计划。最终纵向测试发现的
行为修正也必须形成新的独立提交，禁止 amend 或并入原行为提交。

```bash
steer_handwritten_files=(
  scripts/protocolValidators/cli.ts
  scripts/protocolValidators/core.ts
  scripts/protocolValidators/typescriptArtifacts.ts
  scripts/protocolValidators/cli.test.ts
  scripts/protocolValidators/core.test.ts
  src/features/guiHost/appServerProtocol.ts
  src/features/guiHost/guiHostTransportSession.ts
  src/features/guiHost/guiHostCommandGateway.ts
  src/features/guiHost/__tests__/guiHostTransportSession.test.ts
  src/features/guiHost/__tests__/guiHostCommandGateway.test.ts
  src/features/guiHost/__tests__/guiHostCommands.test.ts
  src/features/guiHost/__tests__/guiHostClientTestSupport.ts
  src/features/composerInputQueue/composerInputQueueContracts.ts
  src/features/composerInputQueue/composerInputQueue.ts
  src/features/composerInputQueue/composerSteerQueueState.ts
  src/features/composerInputQueue/composerInputPreview.ts
  src/features/composerInputQueue/composerInputQueueCoordinator.ts
  src/features/composerInputQueue/__tests__/composerInputQueue.test.ts
  src/features/composerInputQueue/__tests__/composerSteerQueueState.test.ts
  src/features/composerInputQueue/__tests__/composerInputPreview.test.ts
  src/features/composerInputQueue/__tests__/composerInputQueueCoordinator.test.ts
  src/features/projectionCoordination/activeThreadOwner.ts
  src/features/projectionCoordination/__tests__/activeThreadOwner.test.ts
  src/features/projectionCoordination/__tests__/projectionApplicationCoordinator.test.ts
  src/features/projectionCoordination/threadSwitchCoordinator.ts
  src/features/projectionCoordination/__tests__/threadSwitchCoordinator.test.ts
  src/features/appShell/routeConnectionStartupCoordinator.ts
  src/features/appShell/__tests__/routeConnectionStartupCoordinator.test.ts
  src/features/composerEditor/ComposerEditor.tsx
  src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx
  src/features/composerTurnControl/ComposerTurnControl.tsx
  src/features/composerTurnControl/composerTurnControlModel.ts
  src/features/composerTurnControl/ComposerPendingInputRegion.tsx
  src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx
  src/features/composerTurnControl/__tests__/composerTurnControlModel.test.ts
  src/features/projection/__tests__/projectionTestBuilders.ts
  src/__tests__/App.browser.test.tsx
  src/__tests__/appBrowserTestSupport.ts
  src/__tests__/sequential/composer-viewport.browser.test.tsx
)
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt --check "${steer_handwritten_files[@]}"
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxlint "${steer_handwritten_files[@]}"
/opt/homebrew/bin/fnm exec --using-file pnpm exec eslint --cache "${steer_handwritten_files[@]}"
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run scripts/protocolValidators/cli.test.ts scripts/protocolValidators/core.test.ts src/features/guiHost/__tests__/guiHostTransportSession.test.ts src/features/guiHost/__tests__/guiHostCommandGateway.test.ts src/features/guiHost/__tests__/guiHostCommands.test.ts src/features/composerInputQueue/__tests__/composerInputPreview.test.ts src/features/composerInputQueue/__tests__/composerInputQueue.test.ts src/features/composerInputQueue/__tests__/composerSteerQueueState.test.ts src/features/composerInputQueue/__tests__/composerInputQueueCoordinator.test.ts src/features/composerInputQueue/__tests__/composerInputQueueRuntimeObservation.test.ts src/features/projectionCoordination/__tests__/activeThreadOwner.test.ts src/features/projectionCoordination/__tests__/projectionApplicationCoordinator.test.ts src/features/projectionCoordination/__tests__/threadSwitchCoordinator.test.ts src/features/appShell/__tests__/routeConnectionStartupCoordinator.test.ts src/features/composerTurnControl/__tests__/composerTurnControlModel.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run --config=vitest.browser.parallel.config.ts src/__tests__/App.browser.test.tsx src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run --config=vitest.browser.sequential.config.ts src/__tests__/sequential/composer-viewport.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run protocol:check-validators
/opt/homebrew/bin/fnm exec --using-file pnpm run messages:extract
git diff --exit-code -- src/locales/en.po src/locales/zh-CN.po
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

完成必须同时证明：ordinary 与 steer 双 FIFO 不变；pending 只由权威 commit 释放；明确拒绝
按序优先转成唯一新 turn；unknown 不重发；本地 stop 不自动重启；从 GUI 按钮/快捷键到
权威 transcript 的完整路径可达。计划外文件、app-server API、Rust schema/wire、generator
范围、权威 validator 类型、数据语义或安全边界如需变化，必须停止实施、更新计划并等待重新确认。
