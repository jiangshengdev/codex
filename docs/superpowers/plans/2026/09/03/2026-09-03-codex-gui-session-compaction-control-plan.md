# Codex GUI 会话压缩控制实施计划

> 日期：2026-09-03
> 状态：待确认
> 设计：[Codex GUI 会话压缩控制与状态反馈设计](../../../specs/2026/09/03/2026-09-03-codex-gui-session-compaction-control-design.md)

## 目标与硬边界

按已确认设计把 app-server 已有 `thread/compact/start({ threadId }) -> {}` 接入
`codex-gui`：空闲且本地 Composer queue 可安全释放时，用户可从现有
`ContextUsagePopover` 发起当前会话压缩；当前连接观察到的手动或自动 canonical
`contextCompaction` lifecycle 驱动 GUI 原生 `Spinner + Compressing` 反馈；成功继续使用既有
`Context compressed` 分页，已启动后的失败继续使用既有 `Request failed`，明确未启动的请求
失败只显示当前 session 的通用错误。

“不要支持 TUI 都不支持的功能”按用户选择 A 约束协议、行为、恢复和调度能力，不要求 GUI
复制终端外观。必须同时满足：

- 不修改 Rust、TUI、app-server protocol/schema、core compact 算法或 projection wire shape；
- 不新增服务端原子 idle-only compact、request/turn identity、压缩专用重连快照或跨线程持久状态；
- 不消费 deprecated `thread/compacted`，不新增 notification 旁路；
- 不自动重试，不增加 Retry 专用动作，不中断后压缩，不建立预约、调度或 queued compact；
- TUI 已支持 queued `/compact`，GUI 首版不实现该能力，属于功能子集；
- 不按 token 使用率或 context window 是否已知决定压缩可用性；
- 不把 RPC `{}` 当作压缩成功，不把 `deliveryUnknown` 当作失败，也不自动重发；
- 只保证当前 GUI 内 queue reservation 与 `activeTurnId` 交接无发送空窗，不承诺跨客户端
  TOCTOU 原子安全；
- 不改变现有 transcript context page、失败/中断呈现、Composer 草稿、pending input、steer、
  interrupt、recovery 或 delivery 语义。

实现不得通过 fallback、双写/双读、第二状态 owner、手写协议 DTO/validator、token 启发式、
放宽断言、删除覆盖、修改基线或兼容旁路完成目标。

## 计划前纵向证据闭包

### 权威入口

- RPC 权威定义：`codex-rs/app-server-protocol/src/protocol/common.rs:773-776` 与
  `codex-rs/app-server-protocol/src/protocol/v2/thread.rs:1164-1174`；response 为空对象，结果经标准
  turn/item projection 到达。
- GUI 生成入口：`codex-gui/src/features/guiHost/appServerProtocol.ts:17-28` 的
  `APP_SERVER_REQUEST_METHODS`，由 `codex-gui/scripts/protocolValidators/cli.ts:313-378` 和
  `protocol:generate-validators` 机械生成 descriptors/validators。
- 当前会话 owner：`codex-gui/src/features/activeThreadSession/liveActiveThreadSession.ts:410-476`
  同时消费 accepted projection facts、维护 `activeTurnId` 并发布同一次 session transition。
- 本地互斥 owner：`codex-gui/src/features/composerInputQueue/composerInputQueueCoordinator.ts:376-410`
  的 `reserveRelease()`；reservation 会阻止 Send、recovery、interrupt、management 与第二次 release。
- UI 入口：`codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx:57-65,195-199` 与
  `ContextUsagePopover.tsx`；当前 `tokenUsage == null` 会使入口消失。

### 已追踪链路

- authoritative schema → GUI allowlist → generated request descriptor/response validator →
  `GuiHostCommandGateway` → active session command role → `ComposerTurnControl` →
  `ContextUsagePopover`。
- accepted `turnStarted` / `itemStarted(contextCompaction)` /
  `itemCompleted(contextCompaction)` / `turnCompleted` → active session 瞬时 operation；successful
  completed item 仍并行进入既有 transcript projection/context pagination。
- `definitelyNotAccepted` 只收束本地 claim 并显示一次通用未启动错误；`deliveryUnknown` 进入现有
  connection/projection unavailable 边界，不宣称结果。
- session replacement、revision 变化、subscription 失效与 dispose 会使旧 promise/event callback
  失效；attach snapshot 不恢复压缩专用运行态。
- HeroUI 3.2.4 本地 source/docs 确认 `Button` 支持 `isDisabled`、`isPending`、`onPress` 及
  `ghost`/`secondary` variants，Popover 使用 compound API，Spinner 支持 `color="current"` 与
  `size="sm"`。
- Lingui 配置的完整 catalog 集合为 `src/locales/en.po` 与 `src/locales/zh-CN.po`；新增短动作和
  状态文案必须按 translator-context 规则在 source 中提供 comment，再由 `messages:extract` 投影。

### 修改范围

- command/generated 层：选择已有 RPC、生成 validator，并为 `GuiHostCommands` 增加窄方法。
- active session 层：新增私有 compaction operation，扩展只读 snapshot 与 compaction role，持有
  queue reservation 并消费 canonical lifecycle。
- UI/model 层：让 usage 可空但入口仍存在，接入 compaction role/view，并使用 HeroUI 与 Lingui
  呈现 idle、pending/running、unknown usage 和请求未启动错误。
- 测试/fixture 层：更新 `GuiHostCommands` 共享 mock，覆盖 generated contract、operation 竞态、
  session lifecycle、queue 互斥、真实 production wiring、ARIA 与分页复用。

### 验证映射

- generated contract 与 gateway：protocol generator check、guiHost unit tests、type-check。
- operation/session lifecycle：新 operation unit tests、`liveActiveThreadSession.test.ts`、
  `AppActiveThreadSession.browser.test.tsx`。
- UI/unknown usage/accessibility：`contextUsageModel.test.ts`、
  `ContextUsagePopover.browser.test.tsx`、`ComposerTurnControlSession.browser.test.tsx`。
- durable success/failure/page behavior：既有
  `TranscriptContextPagination.browser.test.tsx` 加最终完整 Browser suite；只在生产接线需要新增断言，
  不修改 transcript owner。
- localization：两次 `messages:extract`、完整 PO 字段级 diff 审查与稳定性检查。
- Level 2：使用当次真实 GUI URL 无头验证手动请求、canonical lifecycle、运行反馈与成功分页；
  Level 3 不适用。

### 排除项

- Rust/TUI/app-server/schema/core、deprecated notification、Redux `threadRuntimeSlice`、transcript
  policy/context-page 算法、跨线程缓存和持久化均有正面 owner 证据，不进入 writeSet。
- TUI 的 queued `/compact` 是已有但未被本 GUI 首版采用的相邻能力；不因 parity 调查加入范围。
- 自动压缩、执行失败和断线若不能由真实 runtime 安全、确定地产生，只保留可控 Level 1 覆盖，
  不通过重启后端、断网或伪造生产状态制造 Level 2 场景。

### 剩余未知

无关键未知。非关键未知是生成器在当前 HEAD 上最终产生的纯格式/引用位置，以及真实 runtime
中压缩阶段持续时间；前者由完整生成物审查与重复生成稳定性闭环，后者不改变状态机、范围或
Level 1 验证。若实现发现必须修改 wire contract、TUI、Rust、transcript owner、Redux、连接
恢复或 queued compact，立即触发重新计划。

## 执行环境、生成边界与提交拓扑

- repository cwd：`/Users/jiangsheng/cnb/codex`；frontend cwd：
  `/Users/jiangsheng/cnb/codex/codex-gui`。
- 基线：当前 `dev` 与默认 Git index；不创建 worktree 或 branch。各任务真实消费上一任务的
  stable commit/interface，且共享生成物、session contracts、共享 command fixture 或 UI test
  harness，独立 worktree 不会形成可独立集成的 fan-out。
- 实现前门禁：计划确认后先把本设计和计划作为 DOC 独立本地 commit，建议 message
  `docs(gui): plan session compaction control`；该 commit 成功前禁止任何实现节点。
- 任务提交：每个 taskBoundary 形成独立本地 commit，禁止 amend、squash、force、remote；已有
  提交的修正另建独立 commit。行为修改与纯代码顺序调整不得混在同一提交，本计划不包含纯
  顺序调整。
- frontend 命令必须通过 `/opt/homebrew/bin/fnm exec --using-file pnpm ...` 调用当前
  `codex-gui/package.json` 固化入口；执行前核验 fnm/pnpm 来源，缺失时停止且不得安装。
- repository-level `just fmt` 不适用：计划只修改 `codex-gui/**` 与 Markdown，均不在当前
  `scripts/format.py` 管理范围。frontend 格式化只使用 `format:oxfmt:fix`/`format:oxfmt`。

协议生成器一次同步两个完整 output group：

- `codex-gui/src/generated/appServerProtocol/**`
- `codex-gui/src/generated/guiHostContract/**`

本次允许的语义变化只来自向 allowlist 加入已有 `thread/compact/start`，预期落在
`requestDescriptors.ts` 与 `appServerPayloadValidators.{d.ts,js,raw.js}`。仍须审查两个完整 group；
`guiHostContract/**`、notification descriptors、JSON-RPC envelope validators 或其他 schema 语义
若发生变化，暂停生成后继，不得因 generated 身份直接接受。

Lingui 完整生成物边界为：

- `codex-gui/src/locales/en.po`
- `codex-gui/src/locales/zh-CN.po`

首次 extraction 后按 `#:`, `#.`, `msgid`, `msgstr`, fuzzy/obsolete 逐类审查；只在计划内补充
`zh-CN` 翻译，然后再次运行同一入口。任何范围外 catalog、计划外 message 语义、既有翻译
漂移或重复 extraction 不稳定都暂停 catalog 后继。

## 固化命令与成功条件

以下命令只在计划明确确认后执行，全部从 frontend cwd 运行：

```bash
/opt/homebrew/bin/fnm env --shell zsh
/opt/homebrew/bin/fnm exec --using-file pnpm --version
/opt/homebrew/bin/fnm exec --using-file pnpm run protocol:generate-validators
/opt/homebrew/bin/fnm exec --using-file pnpm run protocol:check-validators
/opt/homebrew/bin/fnm exec --using-file pnpm run messages:extract
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt:fix
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
/opt/homebrew/bin/fnm exec --using-file pnpm run lint
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:parallel --run
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:sequential --run
```

focused unit/Browser 节点在上述固化 script 后追加 package-relative test paths。Browser 输出必须
确认 Chromium、Firefox、WebKit 均实际收集非零目标；exit 0 但目标零收集不算通过。formatter
fix 后必须审查完整 diff，并以非 fix `format:oxfmt` 证明稳定。不得直接调用底层 oxfmt、Lingui、
validator generator 或 Vitest 替代现有 scripts。

focused target manifest：

- T1 unit 恰好包含三个现有 guiHost 文件：
  `src/features/guiHost/__tests__/generatedAppServerProtocol.test.ts`、
  `src/features/guiHost/__tests__/guiHostCommandGateway.test.ts`、
  `src/features/guiHost/__tests__/guiHostCommands.test.ts`。
- T2 unit 只包含新建
  `src/features/activeThreadSession/__tests__/activeThreadCompaction.test.ts`。
- T3 unit 恰好包含
  `src/features/activeThreadSession/__tests__/activeThreadCompaction.test.ts`、
  `src/features/activeThreadSession/__tests__/liveActiveThreadSession.test.ts` 与
  `src/features/activeThreadSession/__tests__/activeThreadSession.test.ts`；T3 Browser 只包含
  `src/__tests__/AppActiveThreadSession.browser.test.tsx`。
- T4 unit 只包含 `src/features/composerTurnControl/__tests__/contextUsageModel.test.ts`；T4 Browser
  恰好包含五个文件：`ContextUsagePopover.browser.test.tsx`、
  `ComposerTurnControlSession.browser.test.tsx`、新建
  `ComposerTurnControlCompaction.browser.test.tsx`、新建
  `src/__tests__/AppSessionCompaction.browser.test.tsx`，以及既有
  `src/features/committedTranscriptSurface/__tests__/TranscriptContextPagination.browser.test.tsx`。
  前三个相对路径均位于 `src/features/composerTurnControl/__tests__/`。

节点记录中的 package-relative path 全部 canonicalize 到
`/Users/jiangsheng/cnb/codex/codex-gui/` 下的同名资源。生成目录锁分别指向
`/Users/jiangsheng/cnb/codex/codex-gui/src/generated/appServerProtocol/` 与
`/Users/jiangsheng/cnb/codex/codex-gui/src/generated/guiHostContract/`；catalog 锁指向两份 PO 的
物理文件；Git 锁指向当前 worktree 的 `.git/index` 与 local `refs/heads/dev`；unit/browser runner
锁指向本次 frontend cwd 启动的对应 Vitest process/provider runtime。表中的 read/write 模式继续
决定并发冲突，显示名称不得把同一 canonical 资源拆成多个锁。

## 权威 DAG 总览

以下 `taskBoundary` 段落只汇总提交边界、allowlist 和验收条件，不是可调度执行节点，也不因其中
列出多个 `operations` 而进入 ready set。实际执行节点仅为后文带唯一 `nodeId` 且只有一个
`operationKind` 的记录。

当前所有执行节点的 `authorizationGate` 均为 `waiting`。用户确认本计划后，唯一初始 ready
节点是 `DOC-COMMIT`。稳定 DOC commit 解锁 `ENV-PREFLIGHT`；随后严格按稳定接口依赖形成：

`T1-COMMIT -> T2-COMMIT -> T3-COMMIT -> T4-COMMIT -> FINAL fan-out`。

这些串行边分别等待 generated command API、operation API、published session role/view 和完整
production UI wiring，不按任务编号人为串行。最终 fan-out 同时运行静态检查与不冲突的验证；
两个完整 Browser runner 共享 browser runtime 写资源，按实际锁串行而不伪造 DAG 依赖。
`FINAL-FAN-IN` 等待全部适用证据。

粗粒度关键路径：`DOC-COMMIT -> ENV-PREFLIGHT -> T1 -> T2 -> T3 -> T4 -> 最慢最终验证 -> FINAL-FAN-IN`。
没有 `deferralEvidence`；若执行期出现当前可证明的资源争用，按执行图契约记录完整证据后再暂缓。

## 通用能力信封

### 文档提交信封

- `objective`：形成实现前稳定工作文档 commit；`phase`：plan landing；`operationKind`：commit。
- `grantSource`：仅在用户确认本计划后生效；当前 `status=waiting`。
- `allowedOperations`：只读审查两份文档与 Git 状态；仅 stage 两份文档；检查 staged diff；创建
  一个非 amend 本地 commit；只读核验 identity。
- `parameterBounds`：repo cwd、当前 `dev`、默认 index、建议 message 精确为
  `docs(gui): plan session compaction control`。
- `readSet`：两份文档与本地 Git metadata；`writeSet/canonicalTargets`：默认 index、当前本地
  `dev` ref、一个 DOC commit；`stateEffects`：两份文档被暂存并提交。
- `commandScope`：只读 Git、精确 `git add -- <两份文档>`、`git diff --cached --check`、非 amend
  `git commit`、只读核验。
- `negativeConstraints`：无源码编辑、额外 stage、测试、生成、格式化、安装、cleanup、amend、
  squash、force、remote；`specialApprovals/requiredApprovalIds`：空；`subdelegation=false`。
- `lifecycle`：commit 核验后到期；`replanTriggers`：index 污染、路径/content 漂移或 commit 无法
  保持精确边界。

### 编辑信封

- `objective`：形成节点唯一源码/测试产物；`phase`：implementation；`operationKind`：edit；
  `grantSource`：确认后的本计划；当前 `status=waiting`。
- `allowedOperations`：只读目标 owner/消费者并用 `apply_patch` 编辑节点精确 writeSet；
  `parameterBounds`：repo cwd，仅节点语义和文件。
- `readSet`：节点 writeSet、直接 imports/consumers、设计与计划；`writeSet/canonicalTargets`：节点
  精确文件；`stateEffects`：未暂存源码变化；`commandScope`：只读 `rg`/`sed`/Git 与 `apply_patch`。
- `negativeConstraints`：无范围外写入、生成、格式化、验证、stage、commit、worktree、安装、
  remote、force；无 Rust/TUI/schema/Redux/transcript 算法/queued compact；`subdelegation=false`。
- `lifecycle`：节点返回即到期；`replanTriggers`：需要范围外 owner、wire/产品语义变化或当前接口
  证据失真。

### 生成/格式化信封

- `objective`：通过权威入口生成或格式化节点 allowlist 并证明稳定；`phase`：implementation；
  `operationKind`：generate 或 format；`grantSource`：确认后的本计划；当前 `status=waiting`。
- `allowedOperations`：预检后运行节点精确 package script、审查完整 diff、重复运行 check/stability。
- `readSet`：声明的生成输入、配置和 frontend source；`writeSet/canonicalTargets`：协议完整 output
  groups、两份 catalog 或 formatter 的节点 allowlist；程序内部自动副作用按能力信封契约。
- `stateEffects`：声明的 generated/format diff；`commandScope`：本计划列出的精确 scripts。
- `negativeConstraints`：无底层 fallback、范围外主动编辑、基线修改、stage、commit、安装、remote、
  force；`subdelegation=false`。
- `lifecycle`：diff 审查及重复运行稳定后到期；`replanTriggers`：工具/入口漂移、边界外产物、
  计划外语义或不稳定生成。

### 验证信封

- `objective`：产生节点声明的静态、Level 1 或 Level 2 证据；`phase`：verification；
  `operationKind`：verification；`grantSource`：确认后的本计划；当前 `status=waiting`。
- `allowedOperations`：预检后运行节点精确命令，读取输出并核验目标收集、真实状态与结果。
- `readSet`：稳定 commits、测试/config/dependency/runtime inputs；`writeSet`：无代理主动文件写入；
  `stateEffects`：headless runner/cache/report 或真实 GUI session 操作状态。
- `commandScope`：精确 fnm-backed scripts；Level 2 只使用当次 `launch_gui` 完整 URL 和明确
  non-headed browser session。
- `negativeConstraints`：无 fix/update/accept/rewrite、安装、可见窗口、后端重启/断网、stage、
  commit、remote、force；不以 Level 1 替代 Level 2，也不把未自然发生的自动/失败/断线事件
  声称为 Level 2 通过；`subdelegation=false`。
- `lifecycle`：证据返回即到期；`replanTriggers`：入口/工具/runtime 漂移、目标零收集、需要可见
  桌面或范围外状态操作。

### 审查信封

- `objective`：对节点稳定输入形成只读语义审查结论；`phase`：implementation review；
  `operationKind`：review；`grantSource`：确认后的本计划；当前 `status=waiting`。
- `allowedOperations`：只读目标文件及其稳定 diff，按节点列出的字段分类记录允许项与异常项；
  `parameterBounds`：repo/frontend cwd 与节点精确 readSet。
- `readSet/canonicalTargets`：节点声明的稳定产物与直接 owner；`writeSet`：空；`stateEffects`：审查结论；
  `commandScope`：只读 `rg`/`sed`/Git diff。
- `negativeConstraints`：无编辑、生成、格式化、验证命令、stage、commit、安装、remote、force；
  `specialApprovals/requiredApprovalIds`：空；`subdelegation=false`。
- `lifecycle`：审查结论返回即到期；`replanTriggers`：输入不稳定、需要范围外读取或发现计划外语义。

### 任务提交信封

- `objective`：把单个 taskBoundary 的已验证变化形成稳定本地 commit；`phase`：implementation
  landing；`operationKind`：commit；`grantSource`：确认后的本计划；当前 `status=waiting`。
- `allowedOperations`：审查 task diff；仅 stage task allowlist；检查 staged path/diff 与
  `git diff --cached --check`；创建非 amend commit；只读核验 identity。
- `readSet`：task allowlist 与 Git metadata；`writeSet/canonicalTargets`：默认 index、当前本地
  `dev` ref、一个 task commit；`stateEffects`：task allowlist 被暂存并提交。
- `commandScope`：只读 Git、精确 `git add --`、cached checks、非 amend commit、只读核验。
- `negativeConstraints`：无编辑、额外 stage、cleanup/restore、amend、squash、force、remote；
  `subdelegation=false`。
- `lifecycle`：commit 核验后到期；`replanTriggers`：index 污染、allowlist 外 diff、验证失效或
  commit 失败。

## 任务边界与节点记录

### `DOC-COMMIT`

- `taskBoundary`：DOC；`operationKind`：commit；`outcome`：设计与计划形成一个独立本地 commit。
- `estimatedCost`：低；`deferralEvidence`：无；`hardPredecessors`：无，计划确认后为唯一初始 ready。
- `consumes`：已确认设计、待确认计划；`produces`：DOC commit id；`completionEvidence`：commit
  只含两份文档，message/path 精确，源码仍未修改。
- `readSet/writeSet/stateEffects/commandScope`：文档提交信封；`subdelegation=false`。
- `executionContext`：默认 worktree、`dev`、默认 index；`resourceLocks`：`.git/index` write、当前
  local `dev` ref write；`owner`：DOC 唯一 Git owner。
- `verification`：staged allowlist、cached diff check、commit identity；`failureDomain`：全部实现和
  最终验证；`replanTriggers`：见信封；`authorizationGate`：waiting，计划确认后 active。

### `ENV-PREFLIGHT`

- `taskBoundary`：无提交；`operationKind`：investigation；`outcome`：证明 frontend scripts、fnm、
  pnpm、schema inputs、HeroUI/Vitest docs、Browser providers 与 Level 2 入口当前可用。
- `estimatedCost`：低；`deferralEvidence`：无；`hardPredecessors`：`DOC-COMMIT`，等待文档门禁。
- `consumes`：DOC commit、package/config/AGENTS；`produces`：环境证据；`completionEvidence`：cwd、
  binary 来源、script/inputs/非零收集规则均核验，未安装任何组件。
- `readSet`：package/config/schema/docs/tool paths；`writeSet`：空；`stateEffects`：只读命令输出；
  `commandScope`：只读路径/版本/配置核验，不运行项目测试或生成。
- `subdelegation=false`；`executionContext`：默认 worktree；`resourceLocks`：相关 inputs read；
  `owner`：preflight owner；`verification`：执行环境预检。
- `failureDomain`：依赖缺失输入的节点；`replanTriggers`：工具缺失或入口漂移；
  `authorizationGate`：waiting，计划确认后 active。

### `T1` command/generated taskBoundary

- `taskBoundary`：T1 command/generated，commit `feat(gui): expose thread compaction command`；
  `operations`：edit、generate、verification、format、commit；`outcome`：generated descriptor、
  validator 与 `GuiHostCommands.compactThread` 能发送并校验现有 RPC。
- `estimatedCost`：中；`deferralEvidence`：无；`hardPredecessors`：`ENV-PREFLIGHT`，等待可信生成入口。
- `consumes`：authoritative schema 与 generator；`produces`：T1 commit；`completionEvidence`：generator
  两次稳定、protocol check、focused unit/type-check 通过，commit allowlist 精确。
- `readSet`：协议 schema、generator、guiHost direct consumers/tests；`writeSet`：
  `appServerProtocol.ts`、`guiHostCommandGateway.ts`、`appBrowserTestSupport.ts`、
  `generatedAppServerProtocol.test.ts`、`guiHostCommandGateway.test.ts`、`guiHostCommands.test.ts`，
  以及完整 generated groups 中由当前输入确定改变的文件。
- `stateEffects/commandScope`：编辑、`protocol:generate-validators`、`protocol:check-validators`、
  focused unit、formatter、T1 commit；`subdelegation=false`；`executionContext`：默认 worktree/index。
- `resourceLocks`：T1 files write、两个 generated output groups write、frontend runner read/write、
  `.git/index`/local ref commit write；`owner`：T1 唯一 task/Git owner。
- `verification`：空 response 接受、非空/错误 shape 拒绝、method/params 路由、failure metadata 保留；
  `failureDomain`：T1 后继；`replanTriggers`：schema 或生成边界漂移；
  `authorizationGate`：waiting，计划确认后按对应信封 active。

### `T2` operation taskBoundary

- `taskBoundary`：T2 operation，commit `feat(gui): model active thread compaction`；
  `operations`：edit、verification、format、commit；`outcome`：私有 operation 完整表达
  `idle/requestPending/deliveryUnknown/running`、candidate turn、claim、reservation 与 stale settlement。
- `estimatedCost`：中；`deferralEvidence`：无；`hardPredecessors`：`T1-COMMIT`，消费稳定
  `compactThread` command/error interface。
- `consumes`：T1 command API、queue reservation contract、canonical event types；`produces`：T2 commit；
  `completionEvidence`：unit tests 覆盖 ack/event 顺序、重复点击、匹配 completed/terminal、
  candidate turn 在 compaction item 前终止、明确拒绝、unknown、dispose/stale callback，且无持久或
  transcript state。
- `readSet`：command error、queue coordinator、projection types、设计；`writeSet`：新建
  `activeThreadCompaction.ts` 与 `__tests__/activeThreadCompaction.test.ts`。
- `stateEffects/commandScope`：编辑、focused unit、formatter、T2 commit；`subdelegation=false`；
  `executionContext`：默认 worktree/index；`resourceLocks`：T2 files、runner、index/local ref。
- `owner`：T2 唯一 task/Git owner；`verification`：deep-equality state/output tests，不测试静态常量；
  `failureDomain`：T2 后继；`replanTriggers`：需要 request identity/snapshot/retry/scheduling；
  `authorizationGate`：waiting，计划确认后 active。

### `T3` session integration taskBoundary

- `taskBoundary`：T3 session integration，commit `feat(gui): integrate session compaction lifecycle`；
  `operations`：edit、verification、format、commit；`outcome`：active session 发布 compaction
  view/role，在同一 transition 交接 reservation 与 `activeTurnId`，并消费 canonical lifecycle。
- `estimatedCost`：高；`deferralEvidence`：无；`hardPredecessors`：`T2-COMMIT`，消费稳定 operation。
- `consumes`：T2 operation、existing session/projection/queue owners；`produces`：T3 commit；
  `completionEvidence`：unit 与 production Browser wiring 覆盖 idle/active/queue blockers、手动/自动、
  event-before-ack、failed/interrupted、unknown、replacement/dispose/reconnect snapshot 边界。
- `readSet`：active session/projection/queue/connection direct consumers；`writeSet`：
  `activeThreadSessionContracts.ts`、`activeThreadSession.ts`、`liveActiveThreadSession.ts`、
  `__tests__/activeThreadSessionHarness.ts`、`__tests__/liveActiveThreadSession.test.ts`、
  `__tests__/activeThreadSession.test.ts`、`src/__tests__/AppActiveThreadSession.browser.test.tsx`。
- `stateEffects/commandScope`：编辑、focused unit/Browser、formatter、T3 commit；`subdelegation=false`；
  `executionContext`：默认 worktree/index；`resourceLocks`：T3 files、browser runner、index/local ref。
- `owner`：T3 唯一 task/Git owner；`verification`：compaction 直接持有 child queue reservation，
  禁止调用会冻结 snapshot 的 public thread-switch handoff；reservation 必须持有到 accepted
  `turnStarted` 与 published `activeTurnId` 同 transition；匹配 candidate turn 在 itemStarted 前终止
  时 best-effort 清理 claim，但不得声称 protocol request identity；只有 definitely-not-accepted、
  connection/projection loss、replacement/dispose 允许在 turnStarted 前释放；`failureDomain`：T3
  后继；`replanTriggers`：需要可靠 request identity、跨客户端保证或新 snapshot；
  `authorizationGate`：waiting，计划确认后 active。

### `T4` UI/i18n taskBoundary

- `taskBoundary`：T4 UI/i18n，commit `feat(gui): add context compaction control`；
  `operations`：edit、generate、review、verification、format、commit；`outcome`：Popover 在 usage
  已知/未知时均存在，压缩动作、运行反馈、disabled/pending/error/ARIA 与 session role 一致。
- `estimatedCost`：高；`deferralEvidence`：无；`hardPredecessors`：`T3-COMMIT`，消费 published
  compaction role/view。
- `consumes`：T3 session API、HeroUI 3.2.4、Lingui config；`produces`：T4 commit；
  `completionEvidence`：focused unit/Browser 三浏览器通过，两个 catalog 字段审查及重复 extraction
  稳定，UI 不直调 command、不建立第二状态 owner。
- `readSet`：ComposerTurnControl、ContextUsagePopover、usage model、session harness、HeroUI docs、
  Lingui config/catalog 与既有 transcript pagination Browser test；`writeSet`：
  `ComposerTurnControl.tsx`、`ContextUsagePopover.tsx`、
  `contextUsageModel.ts`、`contextUsageModel.test.ts`、`ContextUsagePopover.browser.test.tsx`、
  `ComposerTurnControlSession.browser.test.tsx`、新建
  `ComposerTurnControlCompaction.browser.test.tsx`、新建
  `src/__tests__/AppSessionCompaction.browser.test.tsx`、`src/locales/en.po`、`src/locales/zh-CN.po`。
- `stateEffects/commandScope`：编辑、两次 `messages:extract` 与计划内 zh-CN 翻译、focused unit/Browser、
  formatter、T4 commit；`subdelegation=false`；`executionContext`：默认 worktree/index。
- `resourceLocks`：T4 files、两个 catalogs write、Lingui extractor write、browser runner、index/local ref；
  `owner`：T4 唯一 task/Git owner。
- `verification`：HeroUI `Button size="sm" variant="secondary"`、trigger `variant="ghost"`、
  `ProgressCircle` unknown usage、`Spinner color="current" size="sm"`、onPress/disabled/pending/focus/
  keyboard/ARIA；short action/status messages 带准确 translator comment。
- `failureDomain`：最终验证；`replanTriggers`：custom control、catalog drift、需要 queued compact 或
  持久 error；`authorizationGate`：waiting，计划确认后 active。

### T1-T4 可调度操作节点

下表把 taskBoundary 拆成单一 `operationKind`。除单元格另有声明外，每个节点均为：
`estimatedCost=中`、`deferralEvidence=无`、`subdelegation=false`、当前
`authorizationGate.status=waiting`（计划确认且 hard predecessors 完成后 active）；
`executionContext` 为默认 worktree/`dev`，编辑/生成/格式化/验证节点不写 Git index，commit
节点由该 taskBoundary 唯一 Git owner 独占 `.git/index` 与 local `dev` ref。每个节点的
`readSet/writeSet/stateEffects/commandScope` 是对应 taskBoundary 上述精确范围与相应通用能力信封
的交集；不得把 task 全量 writeSet 当成单个节点的写权限。共同 `replanTriggers` 是 owner、接口、
生成边界、授权或硬约束被新证据推翻。

| `nodeId` | `taskBoundary` / `operationKind` / owner | `hardPredecessors` 与 `consumes` | `outcome`、`produces` 与 `completionEvidence` | 精确 scope、resource lock 与 command | `verification` 与 `failureDomain` |
| --- | --- | --- | --- | --- | --- |
| `T1-EDIT` | T1 / edit / T1 edit owner | `ENV-PREFLIGHT`；schema、allowlist、gateway、共享 mocks | hand-written command/test snapshot；所有新增类型仍机械依赖 authoritative protocol | 编辑信封；只写 T1 hand-written files；文件 write locks | 结构审查；失败使全部 T1 后继失效 |
| `T1-GENERATE` | T1 / generate / T1 generator owner | `T1-EDIT`；更新后的 allowlist | generated protocol snapshot；两次 generator 输出稳定且仅允许的 4 个 app-server files 有语义变化 | 生成信封；`protocol:generate-validators`；两个完整 output groups write lock | 完整 group diff/稳定性；失败使 T1 verify/commit 失效 |
| `T1-FORMAT` | T1 / format / T1 format owner | `T1-GENERATE`；T1 source/generated snapshot | formatter-stable T1 snapshot；fix 后 check exit 0 且无 allowlist 外吸收 | 格式化信封；`format:oxfmt:fix` 后 `format:oxfmt`；frontend formatter write lock | 完整 diff；失败使 T1 verify/commit 失效 |
| `T1-PROTOCOL-VERIFY` | T1 / verification / protocol verify owner | `T1-FORMAT`；稳定 generated snapshot | protocol check 证据；descriptor/validator 与 schema 同步 | 验证信封；`protocol:check-validators`；generated groups read lock | exit 0；失败只使 T1 commit 及后继失效 |
| `T1-UNIT-VERIFY` | T1 / verification / unit verify owner | `T1-FORMAT`；稳定 T1 tests | focused unit 证据；三个 guiHost tests 通过 | 验证信封；`test:unit --` 加三个精确 guiHost paths；unit runner read lock | 非零收集、exit 0；失败只使 T1 commit 及后继失效 |
| `T1-TYPE-VERIFY` | T1 / verification / type verify owner | `T1-FORMAT`；稳定 command/generated types | T1 type-check 证据；exit 0 | 验证信封；`type-check`；frontend tree read lock | 失败只使 T1 commit 及后继失效；contract drift 触发受影响范围重编 |
| `T1-COMMIT` | T1 / commit / T1 Git owner | `T1-PROTOCOL-VERIFY`、`T1-UNIT-VERIFY`、`T1-TYPE-VERIFY`；稳定 T1 snapshot/证据 | T1 commit；精确 allowlist、cached check、message 与 identity 成立 | 任务提交信封；T1 actual diff、index/local ref write locks | staged review；失败使 T2-T4 与 FINAL 失效 |
| `T2-EDIT` | T2 / edit / T2 edit owner | `T1-COMMIT`；稳定 compact command/error API | private operation 与 unit test snapshot | 编辑信封；只写两个 T2 files；文件 write locks | 状态/接口审查；失败使全部 T2 后继失效 |
| `T2-FORMAT` | T2 / format / T2 format owner | `T2-EDIT`；T2 snapshot | formatter-stable T2 snapshot | 格式化信封；frontend formatter write lock | 无 allowlist 外吸收；失败使 T2 verify/commit 失效 |
| `T2-UNIT-VERIFY` | T2 / verification / unit verify owner | `T2-FORMAT`；稳定 operation/tests | operation focused unit 证据 | 验证信封；精确 T2 unit path；unit runner read lock | candidate/ack/event/error/stale cases 全通过；失败使 T2 commit 及后继失效 |
| `T2-COMMIT` | T2 / commit / T2 Git owner | `T2-UNIT-VERIFY`；稳定 T2 snapshot/证据 | T2 commit identity | 任务提交信封；T2 diff、index/local ref write locks | staged review；失败使 T3-T4 与 FINAL 失效 |
| `T3-EDIT` | T3 / edit / T3 edit owner | `T2-COMMIT`；stable operation API | session role/view/lifecycle 与 test snapshot | 编辑信封；只写 T3 files；文件 write locks | child reservation 与 candidate lifecycle 审查；失败使全部 T3 后继失效 |
| `T3-FORMAT` | T3 / format / T3 format owner | `T3-EDIT`；T3 snapshot | formatter-stable T3 snapshot | 格式化信封；frontend formatter write lock | 无 allowlist 外吸收；失败使 T3 verify/commit 失效 |
| `T3-UNIT-VERIFY` | T3 / verification / unit verify owner | `T3-FORMAT`；stable session tests | three active-session focused unit files 通过 | 验证信封；三个精确 active session unit paths；unit runner read lock | 非零收集、exit 0；失败使 T3 commit 及后继失效 |
| `T3-BROWSER-VERIFY` | T3 / verification / Browser verify owner | `T3-FORMAT`；stable App session wiring | `AppActiveThreadSession.browser.test.tsx` 三浏览器证据 | 验证信封；focused parallel Browser；browser runtime write lock | Chromium/Firefox/WebKit 非零收集并通过；失败使 T3 commit 及后继失效 |
| `T3-COMMIT` | T3 / commit / T3 Git owner | `T3-UNIT-VERIFY`、`T3-BROWSER-VERIFY`；稳定 T3 snapshot/证据 | T3 commit identity | 任务提交信封；T3 diff、index/local ref write locks | staged review；失败使 T4 与 FINAL 失效 |
| `T4-EDIT` | T4 / edit / T4 edit owner | `T3-COMMIT`；published compaction role/view | UI/model/tests 与 source messages snapshot | 编辑信封；只写 T4 source/test files，不直接编辑 PO；文件 write locks | HeroUI/Lingui/owner 审查；失败使全部 T4 后继失效 |
| `T4-I18N-EXTRACT` | T4 / generate / Lingui extraction owner | `T4-EDIT`；source messages/config | 首次 extraction catalog snapshot | 生成信封；运行一次 `messages:extract`；两个 catalog write locks | 命令成功且只改变完整 catalog 边界；失败使全部 T4 i18n/format/verify/commit 后继失效 |
| `T4-I18N-REVIEW` | T4 / review / catalog review owner | `T4-I18N-EXTRACT`；首次 catalog snapshot | 字段级审查结论与允许的 zh-CN 翻译清单 | 只读审查两个 catalog；catalog read locks | `#:`, `#.`, `msgid`, `msgstr`, fuzzy/obsolete 全审查；计划外语义使后继失效并触发重编 |
| `T4-I18N-CATALOG-EDIT` | T4 / edit / catalog edit owner | `T4-I18N-REVIEW`；允许的翻译清单 | 仅计划内新增消息的 zh-CN 翻译 snapshot | 编辑信封；只写 `src/locales/zh-CN.po`；该 catalog write lock | 不改 en.po、既有翻译、references 或生成 metadata；失败使 stability/format/verify/commit 后继失效 |
| `T4-I18N-STABILITY` | T4 / generate / Lingui stability owner | `T4-I18N-CATALOG-EDIT`；source 与人工补充后的 catalog | repeated extraction stability 证据；再次运行后两个 catalog 无 diff | 生成信封；运行一次 `messages:extract`；两个 catalog write locks | 任何 drift 为失败并使 T4 format/verify/commit 后继失效 |
| `T4-FORMAT` | T4 / format / T4 format owner | `T4-I18N-STABILITY`；T4 source/catalog snapshot | formatter-stable T4 snapshot | 格式化信封；frontend formatter write lock | 无 allowlist 外吸收；失败使 T4 verify/commit 失效 |
| `T4-UNIT-VERIFY` | T4 / verification / unit verify owner | `T4-FORMAT`；stable usage model/tests | context usage model focused unit 证据 | 验证信封；精确 model unit path；unit runner read lock | unknown usage 不伪造 0 且入口模型有效；失败使 T4 commit/FINAL 失效 |
| `T4-BROWSER-VERIFY` | T4 / verification / Browser verify owner | `T4-FORMAT`；stable UI/session tests | target manifest 中五个 focused Browser files 的三浏览器证据 | 验证信封；`test:browser:parallel --run` 加 manifest 的五个精确路径；browser runtime write lock | command/state/ARIA/transcript production wiring 非零收集并通过；失败使 T4 commit/FINAL 失效 |
| `T4-COMMIT` | T4 / commit / T4 Git owner | `T4-UNIT-VERIFY`、`T4-BROWSER-VERIFY`；稳定 T4 snapshot/证据 | T4 commit identity | 任务提交信封；T4 actual diff、index/local ref write locks | staged review；失败使全部 FINAL 节点失效 |

### `FINAL` static/Level 1 task group

- `taskBoundary`：FINAL，无提交；`operations`：多个独立 verification 节点；`outcome`：最终 commits 上所有静态、
  unit 与 Browser Level 1 证据通过。
- `estimatedCost`：高；`deferralEvidence`：无；`hardPredecessors`：`T4-COMMIT`。
- `consumes`：T1-T4 commits；`produces`：protocol/catalog/format/lint/type/unit/browser 证据；
  `completionEvidence`：protocol check、重复 extraction 无 diff、format check、lint、type-check、full
  unit、parallel Browser、sequential Browser 全部通过且三浏览器非零收集。
- `readSet`：最终 frontend tree 与 configs；`writeSet`：除 final Lingui stability 节点显式以两份
  catalog 为输出外为空（程序内部自动产物按信封）；
  `stateEffects/commandScope`：验证信封中的精确 scripts；`subdelegation=false`。
- `executionContext`：默认 worktree；`resourceLocks`：静态 runners read，两个 Browser 节点对同一
  browser runtime write，运行时串行；`owner`：各验证节点 owner，fan-in 只读汇总。
- `verification`：Level 1；`failureDomain`：对应失败证据与 FINAL fan-in，不自动扩大无关分支；
  `replanTriggers`：验证揭示 plan assumption/range 失真；`authorizationGate`：waiting，确认后 active。

下列 FINAL 节点均消费 `T4-COMMIT`，默认 `estimatedCost=中`、`deferralEvidence=无`、
`subdelegation=false`、默认 worktree、当前 `authorizationGate.status=waiting`；计划确认且前置完成
后 active。除 Lingui stability 节点外不主动写文件；两个 Browser 节点共享同一 canonical browser
runtime write lock，因此只能有一个同时运行，其他静态节点与 Level 2 分支按资源实际可并发。

| `nodeId` | `operationKind` / owner | `hardPredecessors`、`consumes` | `outcome`、`produces`、`completionEvidence` | `readSet/writeSet/stateEffects/commandScope` 与 locks | `verification`、`failureDomain`、`replanTriggers` |
| --- | --- | --- | --- | --- | --- |
| `FINAL-PROTOCOL` | verification / protocol owner | `T4-COMMIT`；final generated tree | protocol drift check 证据；exit 0 | 验证信封；`protocol:check-validators`；generated groups read | 失败使 FINAL fan-in 失效；schema/generator drift 触发重编 |
| `FINAL-I18N-STABILITY` | generate / Lingui owner | `T4-COMMIT`；final source/catalog | repeated extraction stability 证据；命令后 catalog 无 diff | 生成信封；两份 catalog 为显式 writeSet；`messages:extract`；catalog write locks | 完整字段 diff；任何新变化为失败并使 fan-in 失效 |
| `FINAL-FORMAT` | verification / format-check owner | `T4-COMMIT`；final frontend tree | formatter check 证据；exit 0 | 验证信封；`format:oxfmt`；frontend tree read | 失败使 fan-in 失效；不得在该节点运行 fix |
| `FINAL-LINT` | verification / lint owner | `T4-COMMIT`；final frontend tree/config | lint 证据；exit 0 | 验证信封；`lint`；lint cache 为程序内部副作用 | 失败使 fan-in 失效；计划内问题插入独立修正提交 |
| `FINAL-TYPE` | verification / type owner | `T4-COMMIT`；final types/generated contracts | type-check 证据；exit 0 | 验证信封；`type-check`；tree read | 失败使 fan-in 失效；contract drift 触发受影响范围重编 |
| `FINAL-UNIT` | verification / unit owner | `T4-COMMIT`；final unit suite | full unit 证据；非零收集、exit 0 | 验证信封；`test:unit`；unit runner read/write runtime lock | 失败使 fan-in 失效；仅闭环本计划直接引入问题 |
| `FINAL-BROWSER-PARALLEL` | verification / parallel Browser owner | `T4-COMMIT`；parallel config/final tree | full parallel Level 1 证据 | 验证信封；`test:browser:parallel --run`；browser runtime write lock | 三浏览器非零收集、exit 0；失败使 fan-in 失效 |
| `FINAL-BROWSER-SEQUENTIAL` | verification / sequential Browser owner | `T4-COMMIT`；sequential config/final tree | full sequential Level 1 证据 | 验证信封；`test:browser:sequential --run`；同一 browser runtime write lock | 三浏览器非零收集、exit 0；失败使 fan-in 失效 |
| `FINAL-LEVEL2-PREFLIGHT` | investigation / Level 2 preflight owner | `T4-COMMIT`；final GUI/runtime | 当次完整 GUI URL 与明确 non-headed session evidence | 只读/验证信封；`launch_gui`、headless browser open/list；真实 runtime session write lock | URL/session/state 缺失只阻断 Level 2 与 fan-in，不启动可见窗口 |

### `FINAL-LEVEL2`

- `taskBoundary`：FINAL，无提交；`operationKind`：verification；`outcome`：当前真实 Codex runtime
  中完成无头手动压缩验收。
- `estimatedCost`：中；`deferralEvidence`：无；`hardPredecessors`：`FINAL-LEVEL2-PREFLIGHT`，必须
  读取稳定最终 UI、当次 URL 与明确 non-headed session evidence。
- `consumes`：当次 `launch_gui` 完整 URL、真实 thread 与最终 commits；`produces`：Level 2 证据；
  `completionEvidence`：non-headed session 证明、空闲入口可用、一次真实 RPC、pending/running 反馈、
  successful canonical completion 与新 `Context compressed` page；活动任务时直接入口禁用。
- `readSet`：真实 GUI/runtime 状态；`writeSet`：无文件写入；`stateEffects`：当前真实会话内用户明确
  触发一次压缩及必要普通 turn；`commandScope`：`launch_gui` 与现有 headless browser control。
- `subdelegation=false`；`executionContext`：当前真实 GUI session；`resourceLocks`：该 thread/runtime
  session write；`owner`：唯一 Level 2 owner。
- `verification`：自动/失败/断线仅在自然且安全可观察时附加记录，否则明确不执行且不影响其
  Level 1 结果；Level 3 不适用，不打开可见窗口。
- `failureDomain`：Level 2 与 FINAL fan-in；`replanTriggers`：无当前 URL、无法证明 non-headed、需要
  修改后端/断网/可见桌面；`authorizationGate`：waiting，计划确认后 active。

### `FINAL-FAN-IN`

- `taskBoundary`：FINAL，无提交；`operationKind`：fan-in；`outcome`：形成最终完成判定、commit
  清单、TUI 边界复审和 Level 1/2/3 分层报告。
- `estimatedCost`：低；`deferralEvidence`：无；`hardPredecessors`：`FINAL-PROTOCOL`、
  `FINAL-I18N-STABILITY`、`FINAL-FORMAT`、`FINAL-LINT`、`FINAL-TYPE`、`FINAL-UNIT`、
  `FINAL-BROWSER-PARALLEL`、`FINAL-BROWSER-SEQUENTIAL` 与 `FINAL-LEVEL2`。
- `consumes`：所有稳定 commits 与验证证据；`produces`：终态报告；`completionEvidence`：全部必要
  节点完成，Git status/index/commit 边界核验，TUI 不支持能力未进入最终 diff。
- `readSet`：最终 diff、commits、证据；`writeSet`：空；`stateEffects`：只读汇总；
  `commandScope`：只读 Git/结果核验；`subdelegation=false`。
- `executionContext`：默认 worktree；`resourceLocks`：最终 tree read；`owner`：协调 owner；
  `verification`：报告实际并行、关键路径、未启动 ready 节点，并分别报告 Level 1、Level 2 与
  Level 3 不适用。
- `failureDomain`：终态；`replanTriggers`：最终证据不完整或 diff 越过硬边界；
  `authorizationGate`：waiting，计划确认后 active。

## 任务 allowlist 与停止条件

每个 taskBoundary 只 stage 本节点列出的实际变化；生成器完整输出边界用于审查，不是全量提交
许可。当前 T1 唯一需要修改的共享 command fixture 是
`codex-gui/src/__tests__/appBrowserTestSupport.ts`；其他显式 `GuiHostCommands` 对象均展开该 helper。
若 type-check 仍发现任何计划外 fixture 或文件必须修改，先触发受影响范围重新计划，不得在实施期
直接补入 allowlist 或批量重写无关测试。

以下情况触发受影响节点重新计划，而不是静默扩大范围：

- 需要任何 Rust/TUI/app-server/schema、Redux、transcript 算法、connection owner 或计划外文件；
- 需要 queued compact、自动重试、持久失败、跨连接运行态、request identity 或原子 idle；
- generator/extractor/formatter 产生边界外或计划外语义变化，重复运行不稳定；
- Browser target 零收集、Level 2 URL/非 headed 状态无法证明，或验收需要可见桌面；
- 为通过检查需要 fallback、豁免、断言降级、基线修改、删除覆盖或兼容双路径。

计划只有在 DOC、T1-T4 独立 commits、全部最终 Level 1、适用 Level 2 与 FINAL fan-in 均完成后
才完成。计划确认前不执行任何节点；确认后先执行 DOC commit 门禁，不得直接从源码实现开始。
