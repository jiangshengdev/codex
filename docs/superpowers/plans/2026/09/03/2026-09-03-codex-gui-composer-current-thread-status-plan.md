# Codex GUI Composer 当前 Thread 全局状态实施计划

计划状态：待确认

计划日期：2026-09-03

计划基线：`dd7dfc56179b0f7e4cf6d42c8f0a7cdf7a956cf0`

设计输入：

- `docs/superpowers/specs/2026/09/03/2026-09-03-codex-gui-composer-current-thread-status-design.md`
- `docs/superpowers/research/2026/09/03/2026-09-03-codex-gui-agent-status-color-ux.md`

## 阶段与授权边界

本文只把已确认设计编译为可执行计划，不改变产品决策。计划确认前，所有实现、生成、格式化、
测试、Git index 和 commit 节点均保持 `pending-plan-confirmation`。用户明确确认本文后，才可按
本计划执行；执行前必须先把本次设计与计划文档创建为一个独立本地 Git 提交。

本轮计划落盘不授权 implementation、generator、Lingui extraction、测试、stage 或 commit。
执行期不得操作 Git remote，不得 amend、squash、force、强制暂存 ignored 文件，也不得把共享
工作树中的无关修改纳入 formatter、生成物审查或提交 allowlist。

## 唯一交付目标

在 Composer 底部工具栏二维码右侧始终显示当前 `thread` 的全局 `ThreadStatus`：只用静态
HeroUI 语义色圆点和中性短文字；状态由 `LiveActiveThreadSession` 拥有的单一
`ActiveThreadStatus` module 从 attach baseline 与 `thread/read` 权威刷新结果维护；不聚合其他
thread，不与内部 `turn` 状态合并，也不改变 Composer 边框、背景、焦点环、发送控制或 turn
局部状态。

## 当前事实闭包

### 权威入口

- 协议权威类型已存在：
  `codex-rs/app-server-protocol/schema/typescript/v2/ThreadStatus.ts`、
  `ThreadActiveFlag.ts` 和 `ThreadStatusChangedNotification.ts`。
- attach baseline 已在
  `ThreadProjectionAttachResponse.snapshot.thread.status`；当前
  `liveActiveThreadSession.ts` 只保存 identity、cwd 与 `activeTurnId`。
- `thread/read` 已在 `APP_SERVER_REQUEST_METHODS` 和 `GuiHostCommandGateway.readThread` 中；无需
  新 transport 或 Rust API。
- `thread/status/changed` 已在 Rust notification metadata 中，但不在
  `APP_SERVER_NOTIFICATION_METHODS`，所以当前由 generated classifier 归为 `knownUnconsumed`。
- Composer 生产入口直接消费 `ActiveThreadSessionSnapshot`；`CurrentTaskPage` 与 `AppCapabilities`
  不需要第二份状态。当前 `threadRuntime` 的 `Omit<Thread, "turns">` 仍意外保留 attach 时的
  `status`，虽然没有 consumer，却已构成静态副本；P2 必须把 read model metadata 收窄为
  `Omit<Thread, "turns" | "status">`，不能继续保留或更新该副本。

### 已追踪链路

- notification selection：`appServerProtocol.ts` → protocol validator generator → generated
  payload validators/descriptors → `guiHostClient.ts` typed callback →
  `GuiHostConnectionBridge.tsx` → `ActiveThreadSessionController`。
- status lifecycle：attach baseline → `LiveActiveThreadSession` → 新 `ActiveThreadStatus` →
  `LiveActiveThreadSessionSnapshot.threadStatus` → `ComposerTurnControl`。
- read-model lifecycle：同一 attach baseline 仍进入 Redux derived metadata，但必须在
  `threadRuntimeSlice` ingestion boundary 明确剔除 `turns` 与 `status`；Redux 不参与后续 status
  invalidation、read 或 presentation。
- invalidation lifecycle：当前/candidate `threadId` 路由 → 单飞 dirty-loop →
  `thread/read({ threadId, includeTurns: false })` → identity/lifetime 校验 → 结构去重发布。
- connection epoch 不新增全局数字 owner；它由每次 `onCommandsReady` 新建 controller、连接失效时
  dispose controller，以及 status owner 自身 generation 共同表达。旧 controller/owner 的迟到
  read result 必须被 dispose/generation 拒绝。
- candidate 在 attach 期间只记录 status dirty，不保存 notification payload；建立 live owner 后，
  发布前循环清空 dirty、触发 invalidation 并 await clean。最后一次同步稳定性检查到发布之间不得
  插入 await，因此新 invalidation 不能穿过 publication cut。
- presentation：generated `ThreadStatus | null` → 纯穷尽映射 → Lingui 文案与 accessible name →
  `CurrentThreadStatus` 静态 markup → Composer 左侧 cluster。

### 修改范围与依据

| 范围 | 计划修改 | 依据 |
|---|---|---|
| notification selection | `appServerProtocol.ts`、generated app-server artifacts、`guiHostClient.ts` 及其 tests | 目标通知当前被丢弃 |
| status owner | 新 `activeThreadStatus.ts` 与 unit test | 通知无 revision，必须 invalidation + 权威 read |
| live/controller lifecycle | `activeThreadSessionContracts.ts`、`liveActiveThreadSession.ts`、`activeThreadSession.ts`、`GuiHostConnectionBridge.tsx` 及 tests/harness | snapshot、current/candidate routing、dispose/generation 都由该链路拥有 |
| Redux duplicate cleanup | `threadRuntimeSlice.ts` 与 reducer test | 当前 metadata shape 意外包含未消费的 attach-time `status`，与单一 owner 约束冲突 |
| presentation | 新 presentation model、组件及 tests；`ComposerTurnControl.tsx` 与相关 Browser tests | Composer 已直接消费 live snapshot，二维码位置由 footer 拥有 |
| i18n | `src/locales/en.po`、`src/locales/zh-CN.po` | 新短标签与完整 accessible name 必须走现有 Lingui 流程 |
| fixture E2E | `e2e/app.spec.ts` | 375px layout 与 WebSocket fixture 可覆盖 Level 1 应用集成，不冒充真实 runtime |

### 验证映射

- generated selection、合法/非法 payload 与 typed callback：protocol generator tests、
  `generatedAppServerProtocol.test.ts`、`guiHostGeneratedProtocol.test.ts`、
  `guiHostHandshake.test.ts`。
- baseline、结构相等、single-flight、dirty-loop、失败 `null`、foreign thread、candidate cut、
  reconnect/dispose 与迟到 result：新 owner unit test、`liveActiveThreadSession.test.ts`、
  `activeThreadSession.test.ts`、`AppActiveThreadSession.browser.test.tsx`。
- Redux owner 边界：`threadRuntimeSlice.test.ts` 以整个对象相等证明 derived metadata 不含
  `turns` 或 `status`，且 token usage/turn read model 行为不变。
- presentation 全状态、集合语义、ARIA、静态 token、焦点不移动、二维码相邻、右侧顺序、panel
  token 不变：新 presentation unit/Browser tests 与现有 Composer Browser tests。
- 窄 viewport：sequential `composer-viewport.browser.test.tsx` 与 fixture `e2e/app.spec.ts`。
- 生成与 catalog：`protocol:check-validators`；两次相同 `messages:extract` 后完整 PO diff 稳定。
- 全局闭环：`format:oxfmt`、`lint`、`type-check`、`test:unit`、`test:browser`、headless
  `test:e2e`。

### 已证据化排除

- 不修改 Rust protocol/schema/app-server：目标 request、notification 与 generated TypeScript 已存在。
- 不修改 `GuiHostCommandGateway`：`readThread` 已经是 typed command。
- 不新增 Redux status state、action、selector 或更新链路；必须窄范围删除当前 derived metadata
  中未消费的 attach-time `status`。除此之外不修改 thread history、transcript 或
  `CurrentTaskPage` props。
- 不修改 `QrAccessPopover` 内部实现：父 footer 创建左侧 cluster 即可。
- 不修改 HeroUI theme 或 Composer panel token；本地 HeroUI source 与 GUI 安装版本均为 `3.2.4`，
  custom semantic span 是组件库没有覆盖该被动状态行时的有界例外。
- 不使用 `activeTurnId`、notification payload、polling、timer、last-write-wins、fallback、双 owner、
  Spinner、动画、Chip、Badge 或整块填色。
- Level 3 不适用；结果不依赖可见桌面、系统 IME、DevTools 或跨应用焦点。

### 剩余未知

- 无会改变实现 owner、文件范围或 Level 1 验证入口的关键未知。
- 真实 runtime 是否能安全、确定地制造 approval、user-input 与 `systemError` 状态是非关键环境
  未知。Level 1 必须完整覆盖所有状态；Level 2 只对当次真实 runtime 中可安全构造并观察的场景
  给出通过结论，其余逐项标记“未执行”，不得用 fixture 结果代替，也不得因此启动 headed 浏览器。
- 计划基线从设计核验时的 `09cc5d32d` 前进到 `dd7dfc561`；新增提交只修改
  `codex-rs/gui-host/src/filter.rs` 的 compaction request allowlist，与本文 owner、消费者和验证链
  不相交。执行前仍须重新核对 HEAD 与 dirty work。

## 实现约束

### `ActiveThreadStatus` 深模块

- 输入只接受 generated `ThreadStatus`、固定 `threadId` 和 typed `readThread` command。
- 初值直接引用 attach baseline；不得从 turn、Redux 或 notification payload 派生。
- `invalidate()` 在无 read 时启动刷新，在 read 期间只置 dirty；任一窗口内最多一个 read。
- read 成功必须校验 `response.thread.id === threadId`；失败或 identity mismatch 发布 `null`，不把
  transport/read failure 映射为 `systemError`。
- active flags 按集合比较；相同结构不发布。不得以对象 identity 判断相等。
- 提供 candidate publication 所需的 clean await 契约；refresh 完成且 dirty=false 时才 resolve。
- generation/dispose 使旧 connection、旧 candidate 和旧 owner 的迟到 result 失效；dispose 后不
  发布、不重试。
- 现有 `SkillCatalogOwner` 只作为 single-flight/generation 结构参考，不复用它的 stale/failed
  产品语义。

### Session 集成

- `LiveActiveThreadSessionSnapshot` 的 active 与 projection-unavailable 共用 contents 增加
  `threadStatus: ThreadStatus | null`；不把字段加入 Redux。
- `ThreadRuntimeRecord.thread` 收窄为 `Omit<Thread, "turns" | "status">`，baseline ingestion 同时
  剔除两个字段；不得新增替代 status 字段、selector 或同步 action。
- Live owner 订阅 status module，并复用 session 的统一 snapshot/revision publication；状态变化
  可发布空 read-model facts，但 Redux 不保存 status。
- Controller 新增 typed `handleThreadStatusChanged`。当前 owner 只接收相同 `threadId`；candidate
  只记 dirty，并在 live owner 已建立时同步 invalidation；其他 thread 直接忽略。
- candidate clean closure 失败仍允许成功 attach，以 `threadStatus: null` 发布；projection failure
  与 status freshness failure 保持独立。
- bridge 只把 generated callback 转给当前 controller；connection unavailable/unmount 继续 dispose
  controller，不能新增并行 connection-status store。

### Presentation 与 HeroUI

- `currentThreadStatusPresentation.ts` 返回 frontend-owned presentation key 与唯一 semantic
  background class；输入仍为 generated `ThreadStatus | null`，switch 必须穷尽。
- `CurrentThreadStatus.tsx` 用 Lingui 把 presentation key 转成已确认的英文 source message、中文
  翻译和完整 accessible name。所有 1–2 词短标签都提供准确 translator comment。
- status 容器是非交互 semantic inline element，`role="status"` / polite；圆点
  `aria-hidden="true"`；可见文字始终存在；无 `tabIndex`、background、border、shadow、focus ring、
  transition、animation 或 Spinner。
- 圆点只用 `bg-default`、`bg-accent`、`bg-warning`、`bg-danger`；文字只用中性
  `text-muted`/foreground token。
- footer 把 QR 与 status 包进不可拆的左侧 cluster；外层允许只在左右 cluster 之间换行。右侧
  `ContextUsagePopover`、Stop、Guide、Send DOM 顺序不变，`.composer-panel` class 不改。
- 新 `role="status"` 会使部分现有 whole-screen locator 变为多匹配；只把受影响断言收窄到
  accessible name 或所属 dialog/失败消息，不改变原产品断言含义或删除覆盖。

## 生成物与国际化边界

### Protocol generator

权威入口：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run protocol:generate-validators
/opt/homebrew/bin/fnm exec --using-file pnpm run protocol:check-validators
```

工作目录固定为 `/Users/jiangsheng/cnb/codex/codex-gui`。输入 owner 是：

- `src/features/guiHost/appServerProtocol.ts`
- `../codex-rs/app-server-protocol/schema/json/client-request-definitions.json`
- `../codex-rs/app-server-protocol/schema/json/server-notification-definitions.json`
- `../codex-rs/app-server-protocol/schema/json/codex_app_server_protocol.schemas.json`
- `../codex-rs/gui-host/schema/json/GuiAuthenticateParams.json`
- `../codex-rs/gui-host/schema/json/GuiAuthenticateResult.json`

完整输出边界是 `src/generated/appServerProtocol/**` 的 9 个文件和
`src/generated/guiHostContract/**` 的 5 个文件。generator 会原子处理两个 group；必须审查完整
目录 diff。只接受能由新增 selected notification 确定推导的 app-server payload validator、
declaration 与 notification descriptor 变化；GUI Host group 或其他 descriptor 的语义漂移立即
暂停。generated 文件禁止手改。

### Lingui

权威入口：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run messages:extract
```

工作目录同上。配置 `lingui.config.ts` 的完整 catalog 集合只有 `src/locales/en.po` 与
`src/locales/zh-CN.po`。禁止使用 `messages:extract:clean`。首次 extraction 后按 `#:`, `#.`,
`msgid`, `msgstr`, fuzzy/obsolete 完整审查；只人工补充本次新增 `zh-CN` 翻译，`en.po` 保持 source
message；再次运行同一入口必须稳定。计划外 `msgid`/`msgstr`/fuzzy/obsolete、existing non-empty
translation 丢失、边界外 catalog 或二次 drift 均暂停后继。

## 执行上下文、提交边界与依赖

- 执行上下文固定为当前 `/Users/jiangsheng/cnb/codex` checkout 的 `dev` branch 和共享 Git index；
  本计划不创建 worktree 或 branch。
- 不创建 worktree 的原因不是惯例，而是 P1 → P2 → P3 存在真实 typed contract 依赖，且三个
  task boundary 依次修改 selected notification、session snapshot、Composer consumer；额外 worktree
  会增加集成冲突而不能缩短关键路径。
- 每个 task boundary 一个独立本地提交：
  - DOCS：`docs: plan current thread composer status`
  - P1：`feat(gui): consume thread status notifications`
  - P2：`feat(gui): own active thread status`
  - P3：`feat(gui): show current thread status in composer`
- 禁止把 P1/P2/P3 squash、amend 或合并。已提交任务的后续修正必须形成新的独立修正提交。
- 任何任务开始前，若 HEAD、branch、Git index、相关文件或生成输入漂移，先重新核验；无关 dirty
  work 保留且排除。若 full frontend formatter 改动 task allowlist 外文件，停止并报告，不自动
  restore 或把它吸收到提交。

## 描述式执行 DAG

以下 DAG 是执行期权威结构。计划确认前所有执行节点的 `authorizationGate` 均为
`pending-plan-confirmation`；确认后由 `$action-authorization` 按节点重新激活。未列出的能力默认
不授权，所有节点 `subdelegation: false`。

### D0：DOCS 审查

- `nodeId`: D0
- `taskBoundary`: DOCS
- `operationKind`: 审查
- `outcome`: 确认设计为“已确认”、计划为“待确认”，两文档与当前 HEAD/工作树边界一致。
- `estimatedCost`: 低；`deferralEvidence`: 无
- `hardPredecessors`: 无
- `consumes`: 用户计划确认、design/plan、Git status/index
- `produces`: 精确 DOCS allowlist 审查结论
- `completionEvidence`: 两文档存在；index 无范围外内容；`git diff --check` 通过
- `readSet`: 两文档、Git metadata；`writeSet`: 无
- `stateEffects`: 只读审查
- `commandScope`: 精确文件读取、`git status --short`、`git diff --check`
- `executionContext`: 当前 checkout/dev，共享 index read
- `resourceLocks`: Git index read
- `owner`: DOCS review owner
- `verification`: 状态、目标、隐私与 whitespace 通过
- `failureDomain`: D0、D1、D2 与全部实施后继
- `replanTriggers`: 文档/branch/HEAD/dirty/index 漂移改变范围
- `authorizationGate`: `pending-plan-confirmation`，只读能力信封

### D1：DOCS 精确暂存

- `nodeId`: D1；`taskBoundary`: DOCS；`operationKind`: stage
- `outcome`: index 只包含本次 design 与 plan。
- `estimatedCost`: 低；`deferralEvidence`: 无
- `hardPredecessors`: D0，等待稳定 DOCS allowlist
- `consumes`: D0 审查；`produces`: DOCS staged snapshot
- `completionEvidence`: cached name list 精确等于两文档且 cached diff/check 通过
- `readSet`: 两文档、index
- `writeSet`: `/Users/jiangsheng/cnb/codex/.git/index`
- `stateEffects`: 精确 stage
- `commandScope`: `git add -- docs/superpowers/specs/2026/09/03/2026-09-03-codex-gui-composer-current-thread-status-design.md docs/superpowers/plans/2026/09/03/2026-09-03-codex-gui-composer-current-thread-status-plan.md`
- `executionContext`: 当前 checkout/dev，共享 index write
- `resourceLocks`: Git index write
- `owner`: DOCS Git owner
- `verification`: cached allowlist/content/whitespace
- `failureDomain`: D1、D2 与全部实施后继
- `replanTriggers`: ignored match、额外 staged 文件或 cached 漂移
- `authorizationGate`: `pending-plan-confirmation`，精确 stage 能力信封

### D2：DOCS 独立提交

- `nodeId`: D2；`taskBoundary`: DOCS；`operationKind`: commit
- `outcome`: 创建只包含两份工作文档的本地提交。
- `estimatedCost`: 低；`deferralEvidence`: 无
- `hardPredecessors`: D1，等待 DOCS staged snapshot
- `consumes`: DOCS staged snapshot；`produces`: DOCS commit
- `completionEvidence`: commit id、parent、message、文件列表正确，index 无范围外内容
- `readSet`: index、HEAD metadata
- `writeSet`: Git object database、`refs/heads/dev`、index
- `stateEffects`: 一个本地 commit
- `commandScope`: `git commit -m 'docs: plan current thread composer status'` 与只读 `git show/status`
- `executionContext`: 当前 checkout/dev
- `resourceLocks`: Git index、object database、`refs/heads/dev` write
- `owner`: DOCS Git owner
- `verification`: 无 amend/remote，提交仅含 design/plan
- `failureDomain`: D2 与全部实施后继
- `replanTriggers`: parent/branch/message/scope 漂移
- `authorizationGate`: `pending-plan-confirmation`，本地 commit 能力信封

### P1E：选择并转发 status notification

- `nodeId`: P1E；`taskBoundary`: P1；`operationKind`: 编辑
- `outcome`: 目标 notification 成为 generated selected notification，`guiHostClient` 暴露并转发 typed callback，tests 覆盖合法、非法与 exhaustiveness。
- `estimatedCost`: 中；`deferralEvidence`: 无
- `hardPredecessors`: D2，实施必须等待 DOCS commit
- `consumes`: generated protocol source、selection input、现有 handshake/classifier tests
- `produces`: P1 source/test diff
- `completionEvidence`: 只修改 P1 allowlist；没有 Rust、transport 或 bridge/session 改动
- `readSet`: `appServerProtocol.ts`、`guiHostClient.ts`、三个 guiHost tests、generator inputs
- `writeSet`: `appServerProtocol.ts`、`guiHostClient.ts`、`generatedAppServerProtocol.test.ts`、`guiHostGeneratedProtocol.test.ts`、`guiHostHandshake.test.ts`
- `stateEffects`: 工作树编辑
- `commandScope`: `apply_patch` 与精确只读 diff
- `executionContext`: 当前 checkout/dev，禁止 index
- `resourceLocks`: P1 source/test files write
- `owner`: P1 edit owner
- `verification`: callback 类型和 invalid payload failure path 保持穷尽
- `failureDomain`: P1E、P1G、P1F、P1V、P1S、P1C 及全部 P2/P3/Z 后继
- `replanTriggers`: 需要 Rust/schema/transport 新 API 或手写 validator
- `authorizationGate`: `pending-plan-confirmation`，P1 精确编辑能力信封

### P1G：权威 protocol 生成

- `nodeId`: P1G；`taskBoundary`: P1；`operationKind`: 生成
- `outcome`: 两个 generated group 经权威入口原子同步，目标 notification 获得 runtime validator 和 selected descriptor。
- `estimatedCost`: 中；`deferralEvidence`: 无
- `hardPredecessors`: P1E，等待稳定 selection input
- `consumes`: P1 selection diff、Rust JSON schemas、generator
- `produces`: generated group snapshot
- `completionEvidence`: 14 文件完整边界已审查；只有可解释的 app-server artifacts 改变；check 通过
- `readSet`: generator inputs、两个 generated directories
- `writeSet`: 两个 generated directories（程序显式输出边界）
- `stateEffects`: 权威 generator 文件更新
- `commandScope`: `protocol:generate-validators`、`protocol:check-validators`
- `executionContext`: `codex-gui` cwd，fnm Node/pnpm
- `resourceLocks`: 两个 generated directories write、protocol generator process
- `owner`: P1 generation owner
- `verification`: 完整 diff、artifact set、determinism/check
- `failureDomain`: P1G 及全部 P1/P2/P3/Z 后继
- `replanTriggers`: GUI Host group drift、边界外输出、schema mismatch、二次 check 不稳
- `authorizationGate`: `pending-plan-confirmation`，权威生成能力信封

### P1F：P1 格式化

- `nodeId`: P1F；`taskBoundary`: P1；`operationKind`: 格式化
- `outcome`: repository-owned frontend formatter 格式化 P1 snapshot，check 通过。
- `estimatedCost`: 低；`deferralEvidence`: 无
- `hardPredecessors`: P1G
- `consumes`: P1 source/generated/test snapshot；`produces`: formatted P1 snapshot
- `completionEvidence`: formatter/check 成功；diff 未扩出 P1 allowlist
- `readSet`: `codex-gui/**` 与 formatter config
- `writeSet`: formatter 正常输出；后续只允许主动操作 P1 allowlist
- `stateEffects`: formatter 自动文件副作用
- `commandScope`: `format:oxfmt:fix` 后 `format:oxfmt`
- `executionContext`: `codex-gui` cwd，fnm Node/pnpm
- `resourceLocks`: frontend source tree write、oxfmt process
- `owner`: P1 format owner
- `verification`: task allowlist 外无 diff
- `failureDomain`: P1F 及全部 P1/P2/P3/Z 后继
- `replanTriggers`: formatter 改动 allowlist 外 tracked file
- `authorizationGate`: `pending-plan-confirmation`，frontend formatter 能力信封

### P1V：P1 focused 验证

- `nodeId`: P1V；`taskBoundary`: P1；`operationKind`: 验证
- `outcome`: generator core、real generated classifier/type narrowing 与 client forwarding tests 被实际收集并通过。
- `estimatedCost`: 中；`deferralEvidence`: 无
- `hardPredecessors`: P1F
- `consumes`: formatted P1 snapshot；`produces`: P1 green evidence
- `completionEvidence`: focused files 非零收集全绿；`protocol:check-validators` 通过
- `readSet`: P1 files、Vitest config、node_modules、Rust JSON inputs
- `writeSet`: 无代理显式输出
- `stateEffects`: Vitest/Vite 内部 cache/results
- `commandScope`: focused `pnpm exec vitest --run` 覆盖四个 generator tests 与三个 guiHost tests；`protocol:check-validators`
- `executionContext`: `codex-gui` cwd，fnm Node/pnpm
- `resourceLocks`: Vitest/Vite cache write、protocol inputs read
- `owner`: P1 verification owner
- `verification`: 目标 file/count/exit 结果记录
- `failureDomain`: P1V、P1S、P1C 与全部后继
- `replanTriggers`: 零收集、generated contract drift、范围外 fixture 需求
- `authorizationGate`: `pending-plan-confirmation`，focused 验证能力信封

### P1S / P1C：P1 暂存与提交

- `nodeId`: P1S；`taskBoundary`: P1；`operationKind`: stage
- `outcome`: 只有经审查的 P1 source/tests 与实际 changed generated artifacts 进入 index。
- `estimatedCost`: 低；`deferralEvidence`: 无
- `hardPredecessors`: P1V；`consumes`: P1 green snapshot；`produces`: P1 staged snapshot
- `completionEvidence`: cached allowlist/content/check 精确；`readSet`: P1 diff/index
- `writeSet`: Git index；`stateEffects`: 精确 stage
- `commandScope`: `git add --` 后列出精确 P1 changed files，禁止目录级或 `git add .`
- `executionContext`: 当前 checkout/dev；`resourceLocks`: Git index write
- `owner`: P1 Git owner；`verification`: cached diff 全审查
- `failureDomain`: P1S、P1C 与全部后继；`replanTriggers`: 额外 staged/ignored/生成漂移
- `authorizationGate`: `pending-plan-confirmation`，P1 stage 能力信封

- `nodeId`: P1C；`taskBoundary`: P1；`operationKind`: commit
- `outcome`: 创建本地提交 `feat(gui): consume thread status notifications`。
- `estimatedCost`: 低；`deferralEvidence`: 无
- `hardPredecessors`: P1S；`consumes`: P1 staged snapshot；`produces`: P1 commit
- `completionEvidence`: commit identity/message/files 正确，index clean
- `readSet`: index/HEAD；`writeSet`: object database、`refs/heads/dev`、index
- `stateEffects`: 一个本地 commit
- `commandScope`: `git commit -m 'feat(gui): consume thread status notifications'` 与只读核验
- `executionContext`: 当前 checkout/dev；`resourceLocks`: Git refs/index/object database write
- `owner`: P1 Git owner；`verification`: no amend/remote
- `failureDomain`: P1C 与全部 P2/P3/Z 后继；`replanTriggers`: commit scope/parent 漂移
- `authorizationGate`: `pending-plan-confirmation`，P1 commit 能力信封

### P2E：建立并集成唯一 status owner

- `nodeId`: P2E；`taskBoundary`: P2；`operationKind`: 编辑
- `outcome`: 新 `ActiveThreadStatus` 与 Live/controller/bridge 完成 baseline、single-flight、candidate cut、failure-null 和 lifetime 隔离，同时删除 Redux 中未消费的 attach-time status 副本，tests 锁定行为。
- `estimatedCost`: 高；`deferralEvidence`: 无
- `hardPredecessors`: P1C，消费 typed notification callback commit
- `consumes`: P1 commit、设计状态语义、现有 candidate/session lifecycle
- `produces`: P2 source/test diff
- `completionEvidence`: 只有 P2 allowlist 改动；Redux 变化仅限删除 duplicate status 与对应 test；无 Rust/presentation/i18n 变化
- `readSet`: activeThreadSession feature、bridge、App Browser support/tests、generated ThreadStatus/read types
- `writeSet`: 新 `activeThreadStatus.ts`/test、`activeThreadSessionContracts.ts`、`liveActiveThreadSession.ts`/test、`activeThreadSession.ts`/test、`activeThreadSessionHarness.ts`、`GuiHostConnectionBridge.tsx`、`threadRuntimeSlice.ts`/test、`AppActiveThreadSession.browser.test.tsx`、`AppRouting.browser.test.tsx`、`smoke/AppRouting.smoke.browser.test.tsx`、`appBrowserTestSupport.ts`（仅 status notification emit helper）
- `stateEffects`: 工作树编辑
- `commandScope`: `apply_patch` 与精确只读 diff
- `executionContext`: 当前 checkout/dev，禁止 index
- `resourceLocks`: P2 files write
- `owner`: P2 edit owner
- `verification`: whole-object/state-machine assertions；不接受 payload LWW 或 stale baseline fallback
- `failureDomain`: P2E、P2F、P2V、P2S、P2C 与全部 P3/Z 后继
- `replanTriggers`: 需要新增 Redux status 链路、Rust、polling、第二 owner 或改变 projection failure 语义
- `authorizationGate`: `pending-plan-confirmation`，P2 精确编辑能力信封

### P2F / P2V：P2 格式化与验证

- `nodeId`: P2F；`taskBoundary`: P2；`operationKind`: 格式化
- `outcome`: frontend formatter 格式化 P2 snapshot，check 通过且无范围外 diff。
- `estimatedCost`: 低；`deferralEvidence`: 无
- `hardPredecessors`: P2E；`consumes`: P2 diff；`produces`: formatted P2 snapshot
- `completionEvidence`: format write/check 成功、P2 allowlist 外无 diff
- `readSet`: `codex-gui/**`/formatter config；`writeSet`: formatter 正常输出
- `stateEffects`: formatter 自动文件副作用；`commandScope`: `format:oxfmt:fix`、`format:oxfmt`
- `executionContext`: `codex-gui` cwd；`resourceLocks`: frontend tree write/oxfmt
- `owner`: P2 format owner；`verification`: 完整 diff 审查
- `failureDomain`: P2F 与全部 P2/P3/Z 后继；`replanTriggers`: 范围外格式变化
- `authorizationGate`: `pending-plan-confirmation`，formatter 能力信封

- `nodeId`: P2V；`taskBoundary`: P2；`operationKind`: 验证
- `outcome`: owner/session unit 与应用级 Browser 生命周期 tests 实际收集并全绿。
- `estimatedCost`: 高；`deferralEvidence`: 无
- `hardPredecessors`: P2F；`consumes`: formatted P2 snapshot；`produces`: P2 green evidence
- `completionEvidence`: 新 owner、live/controller unit 非零全绿；App lifecycle Browser 三引擎非零全绿
- `readSet`: P2 files、configs、node_modules；`writeSet`: 无代理显式输出
- `stateEffects`: test runner cache/results
- `commandScope`: focused unit；focused `test:browser:parallel`；`type-check`
- `executionContext`: `codex-gui` cwd，fnm Node/pnpm，headless
- `resourceLocks`: Vitest/Vite cache write、browser sessions
- `owner`: P2 verification owner
- `verification`: baseline/foreign/current/candidate/failure/dispose/reconnect/late result 场景；Redux metadata 整体对象不含 status
- `failureDomain`: P2V、P2S、P2C 与全部后继
- `replanTriggers`: 零收集、需要外部 state store 或计划外生命周期 owner
- `authorizationGate`: `pending-plan-confirmation`，P2 验证能力信封

### P2S / P2C：P2 暂存与提交

- `nodeId`: P2S；`taskBoundary`: P2；`operationKind`: stage
- `outcome`: 只有 P2 allowlist 进入 index。
- `estimatedCost`: 低；`deferralEvidence`: 无
- `hardPredecessors`: P2V；`consumes`: P2 green snapshot；`produces`: P2 staged snapshot
- `completionEvidence`: cached files/content/check 精确
- `readSet`: P2 diff/index；`writeSet`: Git index；`stateEffects`: 精确 stage
- `commandScope`: 精确 `git add -- <P2 changed files>`，不得目录级 stage
- `executionContext`: 当前 checkout/dev；`resourceLocks`: Git index write
- `owner`: P2 Git owner；`verification`: staged diff 全审查
- `failureDomain`: P2S、P2C 与全部后继；`replanTriggers`: 范围外 staged 内容
- `authorizationGate`: `pending-plan-confirmation`，P2 stage 能力信封

- `nodeId`: P2C；`taskBoundary`: P2；`operationKind`: commit
- `outcome`: 创建本地提交 `feat(gui): own active thread status`。
- `estimatedCost`: 低；`deferralEvidence`: 无
- `hardPredecessors`: P2S；`consumes`: P2 staged snapshot；`produces`: P2 commit
- `completionEvidence`: identity/message/files 正确，index clean
- `readSet`: index/HEAD；`writeSet`: object database、`refs/heads/dev`、index
- `stateEffects`: 一个本地 commit
- `commandScope`: `git commit -m 'feat(gui): own active thread status'` 与只读核验
- `executionContext`: 当前 checkout/dev；`resourceLocks`: Git refs/index/object database write
- `owner`: P2 Git owner；`verification`: no amend/remote
- `failureDomain`: P2C 与全部 P3/Z 后继；`replanTriggers`: commit scope/parent 漂移
- `authorizationGate`: `pending-plan-confirmation`，P2 commit 能力信封

### P3E：实现 presentation 与 Composer 集成

- `nodeId`: P3E；`taskBoundary`: P3；`operationKind`: 编辑
- `outcome`: 全状态 presentation、静态语义 markup、QR 右侧布局、窄屏和既有 status locator 兼容断言完成。
- `estimatedCost`: 高；`deferralEvidence`: 无
- `hardPredecessors`: P2C，消费稳定 `threadStatus` snapshot contract
- `consumes`: P2 commit、已确认 mapping、HeroUI 3.2.4 tokens、现有 Composer tests
- `produces`: P3 source/test diff（尚未含 catalog extraction）
- `completionEvidence`: P3 source/test allowlist 完整；panel/QR internals/right controls 未改
- `readSet`: Composer feature/tests、active session harness、E2E fixture、local HeroUI docs/source
- `writeSet`: 新 `currentThreadStatusPresentation.ts`/test、`CurrentThreadStatus.tsx`/Browser test、`ComposerTurnControl.tsx`、`ComposerTurnControlInput.browser.test.tsx`、`ComposerTurnControlSession.browser.test.tsx`、`ComposerTurnControlPendingInputReordering.browser.test.tsx`、`ComposerTurnControlDelivery.browser.test.tsx`、`sequential/composer-viewport.browser.test.tsx`、`e2e/app.spec.ts`
- `stateEffects`: 工作树编辑
- `commandScope`: `apply_patch` 与精确只读 diff
- `executionContext`: 当前 checkout/dev，禁止 index
- `resourceLocks`: P3 files write
- `owner`: P3 edit owner
- `verification`: 状态/ARIA/token/DOM/焦点/overflow 与 selector 语义
- `failureDomain`: P3E、P3L1、P3L2、P3F、P3V、P3S、P3C 与 Z 后继
- `replanTriggers`: 需要 HeroUI theme、QR internals、panel token、turn 状态或可见桌面
- `authorizationGate`: `pending-plan-confirmation`，P3 精确编辑能力信封

### P3L1 / P3L2：Lingui extraction、翻译与稳定性

- `nodeId`: P3L1；`taskBoundary`: P3；`operationKind`: 生成
- `outcome`: 首次权威 extraction 投影本次 source messages/comments 到两份 PO。
- `estimatedCost`: 中；`deferralEvidence`: 无
- `hardPredecessors`: P3E；`consumes`: P3 messages、Lingui config；`produces`: first catalog diff
- `completionEvidence`: 输出只在 en/zh-CN PO；完整字段分类完成，无计划外语义 drift
- `readSet`: `src/**`、Lingui config、两份 PO；`writeSet`: 两份 PO
- `stateEffects`: catalog generator 更新
- `commandScope`: `messages:extract`，禁止 clean
- `executionContext`: `codex-gui` cwd；`resourceLocks`: 两份 PO write/Lingui process
- `owner`: P3 catalog owner；`verification`: `#:`, `#.`, `msgid`, `msgstr`, fuzzy/obsolete 全审查
- `failureDomain`: P3L1 及全部 P3/Z 后继；`replanTriggers`: 边界外 catalog、既有翻译变化、fuzzy/obsolete
- `authorizationGate`: `pending-plan-confirmation`，Lingui 生成能力信封

- `nodeId`: P3L2；`taskBoundary`: P3；`operationKind`: 编辑
- `outcome`: 只补本次新增 `zh-CN` translations，并以第二次相同 extraction 证明稳定。
- `estimatedCost`: 中；`deferralEvidence`: 无
- `hardPredecessors`: P3L1；`consumes`: first catalog diff；`produces`: stable translated catalogs
- `completionEvidence`: 新译文与设计一致；repeat extraction 无新结构 diff
- `readSet`: 两份 PO/source comments；`writeSet`: `zh-CN.po` 人工翻译，随后 generator 正常输出两份 PO
- `stateEffects`: translation edit 与 repeat extraction
- `commandScope`: `apply_patch` 只改新增 msgstr；再次 `messages:extract`
- `executionContext`: `codex-gui` cwd；`resourceLocks`: 两份 PO write/Lingui process
- `owner`: P3 catalog owner；`verification`: placeholders/comments/translations/stability
- `failureDomain`: P3L2 及全部 P3/Z 后继；`replanTriggers`: repeat drift 或计划外 existing translation change
- `authorizationGate`: `pending-plan-confirmation`，P3 translation/stability 能力信封

### P3F / P3V：P3 格式化与 Level 1 验证

- `nodeId`: P3F；`taskBoundary`: P3；`operationKind`: 格式化
- `outcome`: frontend formatter 格式化 P3 snapshot，check 通过且不改 catalog 语义或范围外文件。
- `estimatedCost`: 低；`deferralEvidence`: 无
- `hardPredecessors`: P3L2；`consumes`: P3 source/tests/catalog；`produces`: formatted P3 snapshot
- `completionEvidence`: write/check 成功，P3 allowlist 外无 diff
- `readSet`: frontend tree/config；`writeSet`: formatter 正常输出
- `stateEffects`: formatter 自动副作用；`commandScope`: `format:oxfmt:fix`、`format:oxfmt`
- `executionContext`: `codex-gui` cwd；`resourceLocks`: frontend tree write/oxfmt
- `owner`: P3 format owner；`verification`: 完整 diff 与 PO 语义复查
- `failureDomain`: P3F 及全部 P3/Z 后继；`replanTriggers`: 范围外格式变化
- `authorizationGate`: `pending-plan-confirmation`，formatter 能力信封

- `nodeId`: P3V；`taskBoundary`: P3；`operationKind`: 验证
- `outcome`: presentation unit、parallel/sequential Browser 与 fixture E2E 的 Level 1 场景实际收集并全绿。
- `estimatedCost`: 高；`deferralEvidence`: 无；共享 Vite/browser resources 时按锁顺序运行，不添加伪依赖
- `hardPredecessors`: P3F；`consumes`: formatted P3 snapshot；`produces`: P3 Level 1 green evidence
- `completionEvidence`: unit 非零；parallel/sequential 三引擎非零；headless E2E 目标实际执行；无水平 overflow
- `readSet`: P3 files、configs、node_modules/browser binaries；`writeSet`: 无代理显式输出
- `stateEffects`: test/browser cache、results 与临时状态
- `commandScope`: focused unit；focused `test:browser:parallel`；focused `test:browser:sequential`；`PLAYWRIGHT_HTML_OPEN=never ... pnpm run test:e2e -- e2e/app.spec.ts`
- `executionContext`: `codex-gui` cwd，fnm Node/pnpm，headless
- `resourceLocks`: Vite cache/browser sessions/Playwright results write
- `owner`: P3 verification owner
- `verification`: 全状态 mapping、ARIA、颜色、静态约束、QR adjacency、right controls、panel invariants、375px layout
- `failureDomain`: P3V、P3S、P3C 与 Z 后继
- `replanTriggers`: 零收集、需要 headed、fixture 被误当 Level 2、计划外 visual owner
- `authorizationGate`: `pending-plan-confirmation`，P3 Level 1 验证能力信封

### P3S / P3C：P3 暂存与提交

- `nodeId`: P3S；`taskBoundary`: P3；`operationKind`: stage
- `outcome`: 只有 P3 source/tests 与两份 catalog 进入 index。
- `estimatedCost`: 低；`deferralEvidence`: 无
- `hardPredecessors`: P3V；`consumes`: P3 green snapshot；`produces`: P3 staged snapshot
- `completionEvidence`: cached allowlist/content/check 精确
- `readSet`: P3 diff/index；`writeSet`: Git index；`stateEffects`: 精确 stage
- `commandScope`: 精确 `git add -- <P3 changed files>`，禁止目录级 stage
- `executionContext`: 当前 checkout/dev；`resourceLocks`: Git index write
- `owner`: P3 Git owner；`verification`: full cached diff/catalog field review
- `failureDomain`: P3S、P3C 与 Z 后继；`replanTriggers`: 范围外 staged/unstable catalog
- `authorizationGate`: `pending-plan-confirmation`，P3 stage 能力信封

- `nodeId`: P3C；`taskBoundary`: P3；`operationKind`: commit
- `outcome`: 创建本地提交 `feat(gui): show current thread status in composer`。
- `estimatedCost`: 低；`deferralEvidence`: 无
- `hardPredecessors`: P3S；`consumes`: P3 staged snapshot；`produces`: P3 commit
- `completionEvidence`: identity/message/files 正确，index clean
- `readSet`: index/HEAD；`writeSet`: object database、`refs/heads/dev`、index
- `stateEffects`: 一个本地 commit
- `commandScope`: `git commit -m 'feat(gui): show current thread status in composer'` 与只读核验
- `executionContext`: 当前 checkout/dev；`resourceLocks`: Git refs/index/object database write
- `owner`: P3 Git owner；`verification`: no amend/remote
- `failureDomain`: P3C 与全部 Z 后继；`replanTriggers`: commit scope/parent 漂移
- `authorizationGate`: `pending-plan-confirmation`，P3 commit 能力信封

### Z1：集成后完整 frontend 验证

- `nodeId`: Z1；`taskBoundary`: 无提交，最终验证；`operationKind`: 验证
- `outcome`: 集成后的稳定 HEAD 通过全部权威静态、unit、Browser 与 fixture E2E 入口。
- `estimatedCost`: 高；`deferralEvidence`: 无
- `hardPredecessors`: P3C，等待三个行为 commit 集成
- `consumes`: P1/P2/P3 commits；`produces`: final Level 1 verification evidence
- `completionEvidence`: protocol check、format check、lint、type-check、test:unit、test:browser、headless test:e2e 全部实际命中并通过
- `readSet`: 完整 `codex-gui`、generated inputs、configs/node_modules/browser binaries
- `writeSet`: 无代理显式输出
- `stateEffects`: lint/test/browser 内部 cache/results/temp state
- `commandScope`: package.json 的七个非-fix固化入口；E2E 设置 `PLAYWRIGHT_HTML_OPEN=never`
- `executionContext`: `codex-gui` cwd，fnm Node/pnpm，headless
- `resourceLocks`: formatter/lint/Vite/Vitest/browser/Playwright runners；有 write 冲突的入口串行，无冲突入口保持 ready
- `owner`: final verification coordinator
- `verification`: 每个入口 exit、收集文件与测试数量；零收集不算成功
- `failureDomain`: Z1、Z2；验证失败按执行图插入诊断/修正/复验节点，修正已有 commit 必须新 commit
- `replanTriggers`: 工具/输入缺失、需改基线/ignore/skip、需计划外文件或 visible browser
- `authorizationGate`: `pending-plan-confirmation`，完整 frontend 验证能力信封

### Z2：Level 2 真实 runtime 无头验收

- `nodeId`: Z2；`taskBoundary`: 无提交，最终验收；`operationKind`: 验证
- `outcome`: 用当次完整 GUI URL 和明确 non-headed session 验收真实 current thread 状态与布局。
- `estimatedCost`: 中；`deferralEvidence`: 无
- `hardPredecessors`: Z1，避免用未通过 Level 1 的 build 进入真实 runtime
- `consumes`: current GUI URL、真实 runtime、P3 UI；`produces`: per-scenario Level 2 evidence
- `completionEvidence`: URL/route/session non-headed 已证；安全可构造的 idle/active/waiting/error 场景逐项记录；375/390px 不隐藏/裁掉状态
- `readSet`: 当次真实 GUI 页面与 runtime state；`writeSet`: 无文件显式输出
- `stateEffects`: headless browser session、对当前验收 thread 的正常交互；不得触发范围外外部写入
- `commandScope`: `$gui-launch`/outer `launch_gui` 获取当次 URL；`playwright-cli open '<complete current GUI URL>'`、`list --json`、fresh refs 的 snapshot/interaction、close
- `executionContext`: 明确 headless browser；禁止复用旧 URL、`--headed`、DevTools、trace viewer、HTML report
- `resourceLocks`: real runtime thread read/interaction、headless browser session
- `owner`: Level 2 acceptance owner
- `verification`: fixture 不得作为 Level 2；不可安全构造的状态标记未执行且不伪造通过
- `failureDomain`: Z2；不推翻已经通过的 Level 1，但阻止“完整验收”声明
- `replanTriggers`: 结果依赖 visible desktop、缺 current URL/runtime/non-headed evidence、需外部高风险动作
- `authorizationGate`: `pending-plan-confirmation`，有界 headless Level 2 能力信封

### Z3：最终审查与终态

- `nodeId`: Z3；`taskBoundary`: 无提交，fan-in；`operationKind`: fan-in
- `outcome`: 证明最终 HEAD 满足设计、提交拓扑和验证边界，工作树中的无关状态被保留。
- `estimatedCost`: 低；`deferralEvidence`: 无
- `hardPredecessors`: Z1、Z2，等待两级稳定证据
- `consumes`: commits、final diff/status、Level 1/2 evidence；`produces`: 完成或部分验收结论
- `completionEvidence`: 必须节点完成；无 scope drift；index clean；无 remote/force/amend；Level 2 未执行项精确披露
- `readSet`: Git metadata、计划、设计、验证结果；`writeSet`: 无
- `stateEffects`: 只读最终审查
- `commandScope`: 精确 `git status`、`git log/show/diff` 与结果汇总
- `executionContext`: 当前 checkout/dev，共享 index read
- `resourceLocks`: Git metadata read
- `owner`: plan coordinator
- `verification`: 提交边界、最终状态、排除项、失败域与验证真实性
- `failureDomain`: Z3
- `replanTriggers`: 目标/授权/安全边界变化；否则计划内失败继续动态闭环，不回写本文
- `authorizationGate`: `pending-plan-confirmation`，最终审查能力信封

## Ready set、关键路径与 fan-in

- 初始 ready set 只有 D0；D0 → D1 → D2 是实施前硬门禁。
- 行为关键路径是 D2 → P1E → P1G → P1F → P1V → P1S → P1C → P2E → P2F →
  P2V → P2S → P2C → P3E → P3L1 → P3L2 → P3F → P3V → P3S → P3C → Z1 → Z2 → Z3。
- 串行边均等待真实稳定产物：selected callback commit、session snapshot commit、Composer consumer
  commit 或验证证据；没有按编号或 agent 复用制造依赖。
- 每个 task boundary 的 edit/generate/format 必须 fan-in 到本 task verification，再由唯一 Git owner
  stage/commit。P1/P2/P3 commit identity 必须保留。
- Z1 内部的独立 non-fix checks 可在 resourceLocks 不冲突时并发；Vitest/Vite/browser/formatter 等
 共享 write resource 冲突时节点保持 ready 等锁，不伪造 hard predecessor。

## 失败处理与停止条件

- 节点未达到 `completionEvidence` 时，先按 `$delegating-micro-stages` 把失败作为新证据，局部
  插入诊断、修正和复验节点；不回写本文，不扩大产品目标，不修改基线或删除覆盖。
- generator/catalog 输出超边界、重复生成不稳、计划外语义变化、formatter 修改 allowlist 外文件、
  测试零收集、需要 headed browser、需要 Rust/Redux/新协议或需要任何未授权 external action 时，
  暂停受影响 failure domain 并重新判断授权/计划门禁。
- 本次修改直接引入的问题在原范围内持续闭环；预存或无关失败只证据化隔离，不修复。
- 已有 commit 的修正使用新的独立 commit，禁止 amend；不得增加最终状态不需要的兼容层、双写、
  fallback 或 adapter 来让中间节点通过。

## 计划确认门禁

本文当前为待确认计划。用户明确确认本文后，下一轮先执行 DOCS 独立本地提交，再按 DAG 连续
完成 P1、P2、P3、最终验证与计划内问题闭环。确认前不得开始实现、生成、格式化、测试、stage
或 commit。
