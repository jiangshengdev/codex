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

- 当前 `HEAD` 为 `1b87ed961`。任务 1–10 已完成：任务 8 为 `665aa0720`，任务 9 为
  `8cf929d6c`，任务 10 为 `1b87ed961`。
- 原任务 11 的首次实现尝试未完成，当前工作树恰有 16 个 dirty 源码文件，均属于该失败尝试；
  本次只修改本计划文档，不修改、格式化、验证、暂存或提交这些源码。
- 当前失败 diff 共 1257 changed lines：核心行为 565、机械同步 17、测试 675。该规模同时超过
  复杂逻辑 500 行与整体 800 行的审查边界，不能继续作为一个任务实施，也不能以现有 dirty
  diff 直接进入修正或提交。
- 已确认设计保持不变。本次重新确认只把原任务 11 拆成 state capabilities、queue
  arbitration、coordinator + wiring 三个独立源码任务，并顺延后续任务；不改变产品语义、wire、
  数据或安全边界。失败尝试保持未修复，用户重新确认计划前禁止源码修正。
- 任务 12、13、14 的修改清单恰好覆盖现有 16 个 dirty 源码且互不重叠：任务 12 为 2 个文件、
  约 126 changed lines；任务 13 为 4 个文件、约 641 changed lines，其中生产代码约 336 行；
  任务 14 为剩余 10 个 wiring/测试文件、约 490 changed lines。只读 regression 文件不计入修改
  清单或 handwritten 文件数组。
- 预执行反向审计已核对排除项、文件清单、提交边界、权威契约、生命周期、UI 语义、
  generator 链和验证命令。审计发现的 `TurnError` schema/type 差异、command owner 间接消费者、
  中间提交 type-check、generated formatting、response identity、same-target rejection、最终验证
  命令等未知均已在任务 4–18 中闭合；实施中出现新的范围或语义变化时仍须停止并重新确认。

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
  `ActiveTurnNotSteerable`。任务 4（`bcc0b149d`）已经从 authoritative schema 机械生成
  `validateV2TurnError` 及其真实 declaration；本计划不修改 Rust schema 或 wire shape，GUI
  generated artifacts 继续只能由现有 protocol validator generator 生成。
- 任务 2（`83fc4fe62`）已让 `guiHostTransportSession.ts` 在 transport result 中保留完整
  `rpcError`；任务 5（`b8e7762c8`）已经让 `GuiHostCommandError` 暴露 optional readonly
  `rpcError` 与经过 generated validator 证明的 readonly `activeTurnNotSteerable` frontend fact。
  后续 coordinator 可直接消费该结构化事实，禁止重复解析或重建 error contract。
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
- 任务 6 和任务 10 是纯结构提取，禁止混入行为变化；其余行为提交禁止顺手进行 import、声明、函数、
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
3. `docs(gui): revise steer error validation plan`（已完成：`ad8b59b72`）
4. `feat(gui): generate turn error validation`（已完成：`bcc0b149d`）
5. `feat(gui): expose structured command rpc errors`（已完成：`b8e7762c8`）
6. `refactor(gui): extract composer queue contracts`（已完成：`ceffc3f38`）
7. `feat(gui): model isolated composer steer state`（已完成：`b3fd2b4de`）
8. `docs(gui): revise steer integration module plan`（已完成：`665aa0720`）
9. `feat(gui): add bounded composer input previews`（已完成：`8cf929d6c`）
10. `refactor(gui): extract composer start queue state`（已完成：`1b87ed961`）
11. `docs(gui): revise steer change-size plan`
12. `feat(gui): add composer steer state capabilities`
13. `feat(gui): arbitrate composer steer queues`
14. `feat(gui): coordinate composer steer delivery`
15. `feat(gui): coordinate composer interrupt ownership`
16. `feat(gui): distinguish composer guide shortcuts`
17. `feat(gui): add composer guide controls`
18. `test(gui): verify composer guide integration`

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

**状态**

- 已完成：`ad8b59b72`

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

**状态**

- 已完成：`bcc0b149d`

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

**状态**

- 已完成：`b8e7762c8`

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

**状态**

- 已完成：`ceffc3f38`

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

**状态**

- 已完成：`b3fd2b4de`

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
  package type-check 必须独立通过，不依赖后续任务 12–14 的临时兼容路径。

**验证**

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/composerInputQueue/__tests__/composerSteerQueueState.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

## 任务 8：确认 steer integration 模块边界修订

**状态**

- 已完成：`665aa0720`

**文件**

- 修改：`docs/superpowers/plans/2026/08/19/2026-08-19-codex-gui-composer-steer-input-plan.md`

**实施**

- 用户确认本次技术模块边界修订后，把本计划状态从“待重新确认”改为“已确认”。
- 只提交本计划文档；设计文档保持不变，不重复提交任务 1–7，不夹带两个 preview 文件、源码
  或其他工作树变更。

**验证**

```bash
git diff --check -- docs/superpowers/plans/2026/08/19/2026-08-19-codex-gui-composer-steer-input-plan.md
```

## 任务 9：新增 bounded composer input preview

**状态**

- 已完成：`8cf929d6c`

**文件**

- 新建：`codex-gui/src/features/composerInputQueue/composerInputPreview.ts`
- 新建测试：`codex-gui/src/features/composerInputQueue/__tests__/composerInputPreview.test.ts`

**实施**

- 完成暂停时已经创建的两个 preview 文件，不修改 queue、contracts、coordinator 或任何 consumer。
- helper 以 `Intl.Segmenter` 按 grapheme 截断到 160；超限取前 157 加 `...`。对 generated
  `UserInput` exhaustive 处理，仅输出安全用户内容，不暴露 skill path、URL、client identity
  或 transport data。
- 测试覆盖边界 grapheme、组合字符、emoji、structured input 顺序、空输入和所有 `UserInput`
  variant；本任务必须独立通过 unit 与 package type-check。

**验证**

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/composerInputQueue/__tests__/composerInputPreview.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

## 任务 10：行为不变地提取 composer start queue state

**状态**

- 已完成：`1b87ed961`

**文件**

- 新建：`codex-gui/src/features/composerInputQueue/composerStartQueueState.ts`
- 修改：`codex-gui/src/features/composerInputQueue/composerInputQueue.ts`

**实施**

- 纯提取现有 `turn/start` claim 子状态机。新 module 只拥有 start claim capability/identity、
  `StartClaim`、`StartSettlement`、`pendingStart`、`pendingFacts`、`latestSettlement`，以及围绕
  active-turn/runtime facts 的 reconciliation、replay 和 stale/ownership classification 逻辑。
- 新 module 接受 facade 提供的 active-turn/runtime facts，并以内部 exhaustive outcome 返回
  claim 状态变化、classification 与 next active-turn fact；它不拥有 active turn 本身，outcome
  也不成为新的公开产品 contract。
- 新 module 明确不得拥有 ordinary FIFO、known message IDs、recovery/effects、steer/rejected
  FIFO 或 terminal 跨队列仲裁，也不得自行 drain、发 start 或构造 recovery batch。
- `composerInputQueue.ts` 保持唯一公开 facade，并继续拥有 ordinary FIFO、known message IDs、
  recovery/effects、active turn、terminal 顺序与最终跨队列仲裁；facade 机械调用 start state，
  并从原路径 re-export 完全相同的 14 个公开类型。
- 不得修改 `composerInputQueueContracts.ts`、coordinator 或测试；禁止新增兼容层、双写、第二
  owner、公开 brand/factory 或测试 helper。
- 行为、effect 顺序、claim identity、runtime reconciliation、recovery 和 release blockers 必须
  与 `b3fd2b4de` 完全一致。任务完成后 `composerStartQueueState.ts` 小于 400 LoC，
  `composerInputQueue.ts` 小于 300 LoC，为任务 13 的唯一仲裁层留出边界。
- 只读运行现有 queue 与 coordinator 两个 test files 的 25 项测试；若需要修改测试或 contract，
  即证明提取改变行为，必须停止。

**验证**

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/composerInputQueue/__tests__/composerInputQueue.test.ts src/features/composerInputQueue/__tests__/composerInputQueueCoordinator.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

## 任务 11：确认 steer change-size 计划修订

**文件**

- 修改：`docs/superpowers/plans/2026/08/19/2026-08-19-codex-gui-composer-steer-input-plan.md`

**实施**

- 记录原任务 11 失败尝试的 1257 changed lines、16 个 dirty 源码文件和未修复边界，并将其拆成
  任务 12–14；旧任务 12–15 顺延为任务 15–18。
- 用户确认本次修订后，把本计划状态从“待重新确认”改为“已确认”。
- 只提交本计划文档；设计文档保持不变，不重复提交任务 1–10，不夹带 16 个 dirty 源码文件。

**验证**

```bash
git diff --check -- docs/superpowers/plans/2026/08/19/2026-08-19-codex-gui-composer-steer-input-plan.md
```

## 任务 12：补齐 steer state capabilities

**文件**

- 修改：`codex-gui/src/features/composerInputQueue/composerSteerQueueState.ts`
- 修改测试：`codex-gui/src/features/composerInputQueue/__tests__/composerSteerQueueState.test.ts`

**实施**

- 在隔离 steer state 内补齐 rejected take/restore/release 与 generic recovery restore capability；
  capability 只能由拥有对应 FIFO 的 state 构造和消费，禁止向 facade、coordinator 或 React 暴露
  可伪造的 payload owner。
- 所有 recovery/restore payload 类型从权威输入类型机械派生 `DeepReadonly`，保持数组、item 和
  嵌套字段递归 readonly；禁止手写浅 readonly mirror、类型断言或 mutable 中间 owner。
- 测试直接证明 rejected 与 generic recovery 的 take/restore/release、capability 一次性所有权、
  原序恢复和 structured skill payload 的递归 readonly 形状。
- 本任务不修改 start state、queue contracts/facade、coordinator、wiring 或 UI，不发 effect，
  也不建立跨队列仲裁。规模约 126 changed lines。
- 普通 Vitest 只转译执行 TypeScript，不验证类型；因此定向 Vitest 后必须运行 package
  type-check，由 TypeScript 同时核验恢复类型的递归 readonly 和测试中的 `@ts-expect-error` 确实
  命中类型错误。禁止为通过 type-check 添加临时兼容层、双写、adapter 或 fallback。

**验证**

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/composerInputQueue/__tests__/composerSteerQueueState.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

## 任务 13：实现 queue arbitration

**文件**

- 修改：`codex-gui/src/features/composerInputQueue/composerInputQueueContracts.ts`
- 修改：`codex-gui/src/features/composerInputQueue/composerInputQueue.ts`
- 修改：`codex-gui/src/features/composerInputQueue/composerStartQueueState.ts`
- 修改测试：`codex-gui/src/features/composerInputQueue/__tests__/composerInputQueue.test.ts`

**实施**

- 在唯一 queue facade 接入 direct steer 与空草稿 ordinary 队首 promotion。ordinary/steer 各自
  尾入头出；promotion 只把 ordinary front 原子移动到 steer back，禁止移动队尾、pending start
  或 recovery item，也禁止把任何 FIFO 变成栈。
- 实现 rejected-first start：normal terminal 先应用 commit，再把 unresolved pending/unsent 按序
  迁入 rejected，然后由 rejected merge 取得唯一 start claim，最后才允许 ordinary drain。
- 在 start state 的私有 `StartClaim` 中增加 `ordinary | rejectedSteerMerge` provenance/capability，
  由 queue facade 穷尽消费；provenance 只记录唯一 start claim 的来源，不建立第二个 start owner。
- rejected merge start definite failure 必须借任务 12 capability 按原序恢复 rejected；generic
  steer definite reject 进入独立 recovery，不能冒充 non-steerable fallback、降格到 ordinary 或
  追加到 ordinary 尾部。相应测试旧预期 `1028` 改为 `recoveryProduced`。
- 主 queue 穷尽生成 start/steer/recovery effects，维护 bounded view 与 release blockers；直接消费
  已提交 preview helper，不在 facade 重建截断或脱敏逻辑。
- 覆盖 direct steer、promotion、rejected-first start、start failure 原序 restore、generic recovery、
  `StartClaim` provenance、bounded view、release blockers 和 effect 顺序。任务规模约 641 changed
  lines，其中生产代码约 336 行；只运行 queue 定向 unit，中间提交不要求 package type-check，
  禁止为提前通过 type-check 新增临时兼容路径。
- 本任务不修改 coordinator、active owner、thread switch、route startup、React 或 Browser tests；
  不发送真实 RPC，不实现 interrupt/local stop。

**验证**

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/composerInputQueue/__tests__/composerInputQueue.test.ts
```

## 任务 14：接通 coordinator 与 wiring

**文件**

- 修改：`codex-gui/src/features/composerInputQueue/composerInputQueueCoordinator.ts`
- 修改测试：`codex-gui/src/features/composerInputQueue/__tests__/composerInputQueueCoordinator.test.ts`
- 修改：`codex-gui/src/features/projectionCoordination/activeThreadOwner.ts`
- 修改测试：`codex-gui/src/features/projectionCoordination/__tests__/activeThreadOwner.test.ts`
- 修改：`codex-gui/src/features/projectionCoordination/threadSwitchCoordinator.ts`
- 修改测试：`codex-gui/src/features/projectionCoordination/__tests__/threadSwitchCoordinator.test.ts`
- 修改：`codex-gui/src/features/appShell/routeConnectionStartupCoordinator.ts`
- 按 interface/snapshot 机械同步：`codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx`
- 按 interface/snapshot 机械同步测试：`codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx`
- 按 interface/snapshot 机械同步测试：`codex-gui/src/__tests__/App.browser.test.tsx`

**实施**

- coordinator 穷尽执行任务 13 产生的 steer/start/recovery effects；`performSteer` 机械发送 captured
  `expectedTurnId`、immutable input 与稳定 `clientUserMessageId`。response identity mismatch 与
  delivery unknown 保持 unknown blocker，禁止静默改绑、重试或 fallback。
- 结构化 `ActiveTurnNotSteerable` 触发同 target pending 再 unsent 的批量 rejected 迁移；generic
  definite reject 恢复到独立 recovery。snapshot 只暴露 bounded readonly projection，不暴露
  capability、原 payload 或 RPC error envelope。
- `activeThreadOwner` 注入 `steerTurn`；thread switch 与 route startup 的窄 command contract 同步
  扩展，维持 generation、dispose、release reservation 和 accepted projection 的现有 owner 语义。
- `ComposerTurnControl`、其 Browser test 与 `App.browser.test.tsx` 只机械适配新增 queue
  interface/snapshot；补齐 App `steerTurn` 的机械 mock 预期，不加入按钮、快捷键或新交互。
- `projectionApplicationCoordinator.test.ts` 只读运行，证明 accepted-event 顺序不变，禁止修改或
  纳入 handwritten 文件数组；若它需要修改，说明 projection owner 契约发生范围变化，必须停止。
- `routeConnectionStartupCoordinator.test.ts` 同样只读运行，证明窄 command contract 的既有启动
  路径仍成立；禁止修改或纳入 handwritten 文件数组。任务 14 的修改清单因此是剩余 10 个 dirty
  wiring/测试文件，不新增第 17 个源码 diff。
- 本任务完成原任务 11 的完整 unit、Browser 与 package type-check 验证；不实现 interrupt/local
  stop。`composerStartQueueState.ts`、`composerInputQueue.ts`、`composerSteerQueueState.ts` 必须各自
  小于 500 LoC。

**验证**

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/composerInputQueue/__tests__/composerInputPreview.test.ts src/features/composerInputQueue/__tests__/composerInputQueue.test.ts src/features/composerInputQueue/__tests__/composerSteerQueueState.test.ts src/features/composerInputQueue/__tests__/composerInputQueueCoordinator.test.ts src/features/projectionCoordination/__tests__/activeThreadOwner.test.ts src/features/projectionCoordination/__tests__/projectionApplicationCoordinator.test.ts src/features/projectionCoordination/__tests__/threadSwitchCoordinator.test.ts src/features/appShell/__tests__/routeConnectionStartupCoordinator.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/composerInputQueue/__tests__/composerInputQueueRuntimeObservation.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run --config=vitest.browser.parallel.config.ts src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx src/__tests__/App.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
wc -l src/features/composerInputQueue/composerStartQueueState.ts src/features/composerInputQueue/composerInputQueue.ts src/features/composerInputQueue/composerSteerQueueState.ts
```

## 任务 15：协调 interrupt ownership 与恢复

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
- 修改：`codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx`
- 修改：`codex-gui/src/features/composerTurnControl/composerTurnControlModel.ts`
- 修改测试：`codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx`
- 修改测试：`codex-gui/src/features/composerTurnControl/__tests__/composerTurnControlModel.test.ts`
- 按 interface 机械同步测试：`codex-gui/src/__tests__/App.browser.test.tsx`

**实施**

- 新增 `performInterrupt` effect；active owner 注入 `interruptTurn`，route startup/thread switch
  command contracts 同步扩展。coordinator 在调用 RPC 前同步建立绑定 thread、turn、generation
  与本地 request capability 的一次性 stop claim。
- interrupt owner、local-stop claim、分类 recovery 与 terminal 跨队列仲裁只属于
  `composerInputQueue.ts` facade 和 coordinator；禁止把这些状态或 transition 放入
  `composerStartQueueState.ts`，该 start module 保持任务 10 的窄边界。
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
- `routeConnectionStartupCoordinator.test.ts` 保持只读 regression；验证命令继续运行该文件，
  但不得为 interrupt wiring 修改它或将它加入 handwritten 文件数组。
- 任务完成时 `composerStartQueueState.ts`、`composerInputQueue.ts` 与
  `composerSteerQueueState.ts` 仍必须各自小于 500 LoC；interrupt 集成不得重新膨胀任一模块。

**验证**

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/composerInputQueue/__tests__/composerInputQueue.test.ts src/features/composerInputQueue/__tests__/composerSteerQueueState.test.ts src/features/composerInputQueue/__tests__/composerInputQueueCoordinator.test.ts src/features/projectionCoordination/__tests__/activeThreadOwner.test.ts src/features/projectionCoordination/__tests__/threadSwitchCoordinator.test.ts src/features/appShell/__tests__/routeConnectionStartupCoordinator.test.ts src/features/composerTurnControl/__tests__/composerTurnControlModel.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run --config=vitest.browser.parallel.config.ts src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx src/__tests__/App.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

## 任务 16：区分普通提交与平台引导快捷键

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

## 任务 17：实现引导按钮、待处理区域与本地化

**文件**

- 修改：`codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx`
- 修改：`codex-gui/src/features/composerTurnControl/composerTurnControlModel.ts`
- 新建：`codex-gui/src/features/composerTurnControl/ComposerPendingInputRegion.tsx`
- 修改测试：`codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx`
- 修改测试：`codex-gui/src/features/composerTurnControl/__tests__/composerTurnControlModel.test.ts`
- 机械生成并补译：`codex-gui/src/locales/en.po`
- 机械生成并补译：`codex-gui/src/locales/zh-CN.po`

**实施**

- 从任务 14 的 bounded coordinator projection 渲染，不在 React 保存第二份 queue/payload。
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
- Stop ownership 已在任务 15 完成，本任务不得再修改 Stop command 路径。
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

## 任务 18：验证完整 Composer 到 projection 纵向路径

**文件**

- 修改测试：`codex-gui/src/__tests__/App.browser.test.tsx`
- 修改测试：`codex-gui/src/__tests__/appBrowserTestSupport.ts`
- 修改共享测试 builder：`codex-gui/src/features/projection/__tests__/projectionTestBuilders.ts`
- 修改测试：`codex-gui/src/__tests__/sequential/composer-viewport.browser.test.tsx`
- 只读验证：`codex-gui/src/features/appShell/__tests__/AppShellTopBar.browser.test.tsx`
- 只读验证：`codex-gui/src/features/threadHistory/__tests__/ThreadHistoryDetailPage.browser.test.tsx`
- 只读验证：`codex-gui/src/features/threadHistory/__tests__/ThreadHistoryListPage.browser.test.tsx`

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
- 对 `AppShellTopBar` 与两个 thread history Browser tests 进行显式只读 regression，确认 command
  interface 同步没有改变 top bar 或只读历史页行为；三者不得修改、不得进入 handwritten 文件
  数组，也不给只读历史页新增 steer owner。测试通过才构成证据，不能预先表述为“已证明”。

**验证**

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run --config=vitest.browser.parallel.config.ts src/__tests__/App.browser.test.tsx src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx src/features/appShell/__tests__/AppShellTopBar.browser.test.tsx src/features/threadHistory/__tests__/ThreadHistoryDetailPage.browser.test.tsx src/features/threadHistory/__tests__/ThreadHistoryListPage.browser.test.tsx
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
  src/features/composerInputQueue/composerStartQueueState.ts
  src/features/composerInputQueue/composerSteerQueueState.ts
  src/features/composerInputQueue/composerInputPreview.ts
  src/features/composerInputQueue/composerInputQueueCoordinator.ts
  src/features/composerInputQueue/__tests__/composerInputQueue.test.ts
  src/features/composerInputQueue/__tests__/composerSteerQueueState.test.ts
  src/features/composerInputQueue/__tests__/composerInputPreview.test.ts
  src/features/composerInputQueue/__tests__/composerInputQueueCoordinator.test.ts
  src/features/projectionCoordination/activeThreadOwner.ts
  src/features/projectionCoordination/__tests__/activeThreadOwner.test.ts
  src/features/projectionCoordination/threadSwitchCoordinator.ts
  src/features/projectionCoordination/__tests__/threadSwitchCoordinator.test.ts
  src/features/appShell/routeConnectionStartupCoordinator.ts
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
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run --config=vitest.browser.parallel.config.ts src/__tests__/App.browser.test.tsx src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx src/features/appShell/__tests__/AppShellTopBar.browser.test.tsx src/features/threadHistory/__tests__/ThreadHistoryDetailPage.browser.test.tsx src/features/threadHistory/__tests__/ThreadHistoryListPage.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run --config=vitest.browser.sequential.config.ts src/__tests__/sequential/composer-viewport.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run protocol:check-validators
/opt/homebrew/bin/fnm exec --using-file pnpm run messages:extract
git diff --exit-code -- src/locales/en.po src/locales/zh-CN.po
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
wc -l src/features/composerInputQueue/composerStartQueueState.ts src/features/composerInputQueue/composerInputQueue.ts src/features/composerInputQueue/composerSteerQueueState.ts
```

完成必须同时证明：ordinary 与 steer 双 FIFO 不变；pending 只由权威 commit 释放；明确拒绝
按序优先转成唯一新 turn；unknown 不重发；本地 stop 不自动重启；从 GUI 按钮/快捷键到
权威 transcript 的完整路径可达。计划外文件、app-server API、Rust schema/wire、generator
范围、权威 validator 类型、数据语义或安全边界如需变化，必须停止实施、更新计划并等待重新确认。
最终 `wc -l` 中上述三个生产模块任一达到或超过 500 行，都不满足完成门禁，必须继续按已确认
模块边界收敛，不能以测试通过代替行数约束。
