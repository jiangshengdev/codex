# Codex GUI 错误面板重试行为统一实施计划

日期：2026-09-09

状态：用户已确认设计并授权计划落盘；本计划待确认执行。当前不授权实施、运行验收或创建 Git 提交。

设计依据：[错误面板重试行为统一设计](../../../../specs/2026/09/09/2026-09-09-codex-gui-retry-action-behavior-design.md)。

计划核查基线：`dev`，`6cfe20968c060ec38e8e2708b6108e93c25c9e91`。工作树仅有本次未提交工作文档；执行前重新核验。

## 1. 结果、范围和授权边界

实施结果必须同时满足：保留具体动作名称；仅 loading 使用进行中文案及 Spinner；同一重试禁止重复触发；执行中保留上次错误和诊断；失败更新错误并恢复原动作文案；对应故障实际解除后移除面板或完成既定跳转。

不增加自动重试、投影重连能力、后端协议、依赖或运行时。QR-X03-002 的恢复实现仍是后续独立任务，不混入本计划。普通首次加载、首次操作和纯导航保持原行为；同一入口兼任重试时，协调其稳定动作名称。同步保存不制造 loading。

本计划确认执行后，授权在当前仓库内完成声明范围的编辑、必要格式化、翻译生成、自动化验证、独立审查及独立本地提交。不得操作 Git 远程，不 amend、squash、强制操作或强制暂存 ignore 文件。不得安装组件，不运行后端或原生构建。

执行目录为 `/Users/jiangsheng/cnb/codex`，前端命令 cwd 为其 `codex-gui`。本计划不创建 worktree 或分支；全部节点使用现有 `dev` 工作树。相互独立的编辑按文件集合隔离，Git index 始终只有主代理可写。不主动修改项目根目录之外的状态；已授权工具自行产生的正常缓存及测试运行状态按现行规则处理。

## 2. 计划前证据闭包

| 字段 | 当前证据与计划含义 |
| --- | --- |
| 权威入口 | `main.tsx` 的 StrictMode/RouterProvider → `router.tsx` → `AppRouteBoundary`/`App` → 当前任务、历史和新建页面。技能与队列入口由 `ComposerTurnControl`/`ComposerEditor` 挂载。不是只修改测试组件。 |
| 已追踪链路 | 列表/详情 owner 定义状态并在重试时转 loading；继续任务及当前任务页面持有导航请求；集合/lifecycle 持有成员初始化及移除状态；技能 owner、newSession owner、compaction owner 持有各自执行结果。公开快照和消费者必须同步更新，旧请求继续受身份及生命周期保护。 |
| 修改范围 | 第 4 节按 owner 与消费者分组。共享按钮只负责展示；保留错误由原 owner 表达。当前任务状态、压缩视图和技能快照的间接 fixture 纳入集成节点。 |
| 验证映射 | 第 5 节现有 owner 单测、App/功能 Browser 测试及三个 E2E spec 覆盖状态转换和真实挂载；CI、Browser 与 E2E 分别使用当前 package scripts。 |
| 排除项 | `AppShell` 无重试的全局错误、正文历史错误、纯导航不新增动作；`activeThreadStatus` 的未知状态业务语义保持；同步 `retryPersistence()` 保持同步。后端协议及生成 validator 仅由既有 CI 检查，不修改 schema 或生成产物。 |
| 剩余未知 | 无影响设计与源码范围的关键未知。执行时的最新完整 GUI URL、真实失败状态、可安全操作目标为 Level 2 运行前置，当前未建立；缺失时只阻止该验收及完整验证声明。运行时发现新的范围或产品语义问题须回到对应门禁。 |

### 特别容易误判的结果

- 当前任务 `retry()` 的 ready 状态刷新分支只等待 `settleThreadStatusInvalidations()`。读取失败仍可 resolve，`removalBlockers` 仍可能有 `statusUnknown`，不能仅凭 `ready` 清除故障。
- 移除只有 `removed` 表示成功；blocked、unavailable、failed、empty 不等于故障解除。移除成功后的导航失败属于导航，不能再次执行移除。
- 技能整体失败仅公开 failed/stale 类别，不公开原始 Error；已有测试禁止私有路径进入快照。保留错误不新增诊断数据。部分失败沿用 `partialErrorCount`，不得复制另一份数量或把部分结果视为完全成功。
- 压缩 `claimRequest()` 会进入 requestPending，现有 `compactionView()` 将非 idle 的 `startFailure` 置空；按钮文案虽已符合，错误保留链仍需修改。request accepted 与实际完成继续按已有事件语义区分。
- 新建会话失败保留锁定输入，页面因此从 Send 变为 Retry。文案统一不能解除 `handoffUnknown`、`deliveryUnknown`、输入归属及发送屏障。

## 3. 统一实现合同

新增 `src/feedback/RetryActionButton.tsx`，作为纯展示组合，接受原按钮可用性、variant、size、onPress、固定动作内容、进行中内容及 pending。原生按钮属性从 HeroUI 类型派生；不维护请求、次数或业务错误，不包装所有动作的异步策略。使用 HeroUI Button 的 isPending 和显式 Spinner，保持键盘与可访问名称语义。

各 owner 同时表达执行与上次失败；pending 的旧错误是上次尝试结果，不能作为本次失败。每个动作只保留一个权威状态来源，不在组件中缓存整份旧 snapshot。新增前端展示状态必须由权威 owner 类型导出或机械派生，不镜像后端合同。

同一入口只有一组非执行/执行标签。计划内语义对照如下，具体英文由 Lingui source macro 维护并补充必要 translator comment：

| 动作 | 非执行语义 | 执行中语义 |
| --- | --- | --- |
| 加载当前任务/历史 | 加载任务、加载历史 | 正在加载任务…、正在加载历史… |
| 追加历史 | 加载更多 | 正在加载更多… |
| 激活历史任务 | 继续此任务 | 正在继续此任务… |
| 刷新任务状态 | 刷新状态 | 正在刷新状态… |
| 重试移除/失败清理 | 沿用实际移除或清理动作名称 | 正在移除…或正在清理… |
| 失败导航重试 | 打开任务 | 正在打开任务… |
| 技能目录 | 加载技能或刷新技能，按原动作固定 | 对应正在加载/刷新技能… |
| 同一新建提交入口 | 发送 | 正在发送…；不因失败改名为重试 |
| 待发恢复 | 继续发送 | 正在继续发送… |
| 上下文压缩 | 压缩上下文 | 正在压缩… |
| 本地同步保存 | 重新保存 | 不设人为 loading |

同一次恢复不能因中间 phase 变化而更换动作名称。保留既有 primary/secondary/tertiary/danger 意图；危险移除继续使用 danger。沿用 `FailureLayout` 和既有载体；不重排诊断与操作，不增加新的强色样式。首次正常加载继续使用原 Skeleton/加载文本。

## 4. 编辑任务、精确责任及提交边界

下列路径除工作文档外均相对 `codex-gui/`。各任务的实现与本任务单测/Browser 用例同属一个行为提交；不加入纯 import、函数或声明重排。必要非行为重排必须另立节点及独立提交，不能夹带，也不为中间提交新增临时兼容路径。

### T0：共享重试展示

- 写入：`src/feedback/RetryActionButton.tsx`、`src/feedback/__tests__/RetryActionButton.browser.test.tsx`。
- 产物：稳定的纯展示接口；覆盖动作/进行中名称、pending 可操作性、键盘和 Spinner 语义。保留 `FailureLayout` 原职责及布局。
- 提交：`feat(gui): unify retry action button presentation`。

### T1：历史读取和继续任务

- 写入：`src/features/threadHistory/{threadHistoryListOwner.ts,threadHistoryDetailOwner.ts,ThreadHistoryListPage.tsx,ThreadHistoryDetailContent.tsx,ContinueTaskAction.tsx,ContinueTaskFailureAlert.tsx}`。
- 测试写入：同目录 `__tests__/{threadHistoryListOwner.test.ts,threadHistoryDetailOwner.test.ts,ThreadHistoryListPage.browser.test.tsx,ThreadHistoryDetailRead.browser.test.tsx,ThreadHistoryDetailContinuation.browser.test.tsx,threadHistoryListPageBrowserTestSupport.tsx,threadHistoryDetailBrowserHarness.tsx}`。
- 区分首次加载和失败后重试；追加重试保留已有卡片、cursor、错误及原位按钮；继续任务保留旧失败和能力 token/请求身份隔离。成功按既定结果展示或导航。
- 提交：`fix(gui): retain history failures during retry`。

### T2：当前任务操作与生命周期

- 写入：`src/features/currentTask/CurrentTaskPage.tsx`、`src/features/activeThreadSession/{activeThreadMemberLifecycle.ts,activeThreadSession.ts,activeThreadSessionCollectionContracts.ts}`。
- 测试写入：`src/features/activeThreadSession/__tests__/activeThreadSession.test.ts`、`src/__tests__/{AppErrorPresentation.browser.test.tsx,AppMultiSessionIsolation.browser.test.tsx}`。
- 初始化成功才解除对应旧错误；公开必要执行状态，已有 member.pending/removal 去重不能被绕开；ready 状态刷新补齐同动作执行状态。页面导航请求继续由页面负责，绑定任务/能力/请求身份。
- statusUnknown 不因 Promise resolve 消失；独立操作错误不互相清除；移除及导航分开判定。后台任务重试不改变前台选择意图。
- 提交：`fix(gui): preserve task retry state and failure feedback`。

### T3：技能目录重试

- 写入：`src/features/skillCatalog/skillCatalogOwner.ts`、`src/features/composerEditor/SkillTypeaheadPlugin.tsx`。
- 测试写入：`src/features/skillCatalog/__tests__/skillCatalogOwner.test.ts`、`src/features/composerEditor/__tests__/ComposerEditorTypeaheadMenu.browser.test.tsx`。
- pending 保留上一失败类别，类别从 owner 已完成状态机械派生；部分错误数和候选项沿用原字段。不得暴露原始异常或把完整旧快照搬到页面。
- 主编辑器和待发编辑器均消费相同 owner；requestInFlight、queued invalidation、generation 规则保留。
- 提交：`fix(gui): retain skill errors while retrying`。

### T4：新建会话与待发恢复入口

- 写入：`src/features/newSession/{newSessionOwner.ts,NewSessionPage.tsx}`、`src/features/composerTurnControl/ComposerPendingInputRegion.tsx`。
- 测试写入：`src/features/newSession/__tests__/newSessionOwner.test.ts`、`src/__tests__/AppNewSession.browser.test.tsx`、`src/features/composerTurnControl/__tests__/ComposerTurnControlPendingInput.browser.test.tsx`。
- 新建会话保留此前 failure 到本次确定结果；同一 Send 入口不按失败改成 Retry，pending 显示进行中文案。未知交付仍阻断，不因保留错误显示而用旧 failure 错判本次 phase。
- 待发恢复只补齐展示状态，不改队列重发、unknown 清理、恢复确认或持久化逻辑。
- 提交：`fix(gui): stabilize creation and pending recovery actions`。

### T5：压缩重试错误保留

- 写入：`src/features/activeThreadSession/{activeThreadCompaction.ts,activeThreadSessionContracts.ts,liveActiveThreadSession.ts}`、`src/features/composerTurnControl/ContextUsagePopover.tsx`。
- 测试写入：`src/features/activeThreadSession/__tests__/{activeThreadCompaction.test.ts,liveActiveThreadSession.test.ts}`、`src/features/composerTurnControl/__tests__/{ContextUsagePopover.browser.test.tsx,ComposerTurnControlCompaction.browser.test.tsx}`、`src/__tests__/AppSessionCompaction.browser.test.tsx`。
- 从 claim 到公开视图保留旧启动失败，仅在确切的新结果下替换或解除；不放宽 canRequest、活动轮次、reservation、deliveryUnknown 或事件匹配。
- 旧错误与当前执行身份区分，进行中不能再发起请求。成功启动后按原压缩状态机推进，不新增完成判据。
- 提交：`fix(gui): retain compaction failure during retry`。

### T6：跨入口集成回归与 fixture

- 写入：`src/features/activeThreadSession/__tests__/activeThreadSessionHarness.ts`、`src/features/composerEditor/__tests__/{composerEditorBrowserTestSupport.ts,ComposerEditorLifecycle.browser.test.tsx,ComposerEditorSkillTokenPresentation.browser.test.tsx}`、`src/features/composerTurnControl/__tests__/{composerTurnControlModel.test.ts,composerTurnApplication.test.ts,composerTurnControlBrowserTestSupport.tsx,ComposerTurnControlInput.browser.test.tsx,ComposerTurnControlPersistence.browser.test.tsx,ComposerPendingInputEditorAdapter.browser.test.tsx}`、`src/features/appShell/__tests__/{activeThreadCollectionPresentation.test.ts,ActiveThreadCollectionMenu.browser.test.tsx}`、`src/__tests__/sequential/{composerClipboard.browser.test.tsx,composer-viewport.browser.test.tsx}`。
- 写入 E2E：`e2e/{newSession.spec.ts,newSessionHarness.ts,persistence.spec.ts,persistenceHarness.ts,multiSession.spec.ts,multiSessionHarness.ts}`。
- 仅在权威前端类型变化需要时更新这些 fixture；不复制合同。扩充生产挂载场景的反复失败、pending 点击、窄屏诊断、能力替换隔离与 unknown 屏障。
- `ComposerPersistenceStatus.tsx` 及同步 `retryPersistence()` 只读核对，已有名称与同步执行符合，回归确认成功解除本次保存错误。
- 提交：`test(gui): cover retry behavior across entrypoints`。

### T7：翻译生成

- 写入完整集合：`src/locales/en.po`、`src/locales/zh-CN.po`。
- 源 owner 为 T0–T5 的 Lingui macro；sourceLocale=en，include=src，配置排除截图与 traces。Vite/i18n 原有 catalog 加载保持，不增加 locale、配置或手工编译产物。
- 提交：`chore(gui): update retry action translations`。

### T8：执行记录

- 唯一记录文件：`docs/superpowers/reports/2026/09/09/2026-09-09-codex-gui-retry-action-behavior-execution.md`，仅主代理写。
- 记录节点开始/完成、读写锁、稳定产物、错误与动态节点、提交身份、验证及未执行范围。执行中不回写已确认设计/计划。
- 提交：`docs: record GUI retry behavior verification`。

## 5. 验证入口、生成与工具预检

当前检查到 fnm Node `v24.17.0`、pnpm `10.34.5`，均来自 `/Users/jiangsheng/.local/share/fnm/node-versions/v24.17.0/installation/bin`，不是 Codex runtime shim。Vitest、oxfmt、Lingui、TypeScript、ESLint、oxlint 可用；Playwright Chromium、Firefox、WebKit executable 均存在。执行前再检查；缺失则由用户安装，不自动安装。

本地 HeroUI 源码和 GUI 已解析版本均为 `3.2.4`。本地 Button loading 示例明确组合 `isPending`、Spinner 和条件文案；不把 isPending 当成自动修改文字。Vitest 本地文档版本为 `4.1.11`，Browser 断言使用可重试 DOM 断言，避免定时 sleep 代替状态观察。

下列命令均在 `codex-gui` cwd 执行，仅在计划确认执行后运行：

```bash
/opt/homebrew/bin/fnm env --shell zsh
/opt/homebrew/bin/fnm exec --using-file pnpm --version
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt:fix
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
/opt/homebrew/bin/fnm exec --using-file pnpm run messages:extract
/opt/homebrew/bin/fnm exec --using-file pnpm run ci
```

格式化以 `.github/workflows/codex-gui.yml` → `pnpm run ci` → `format:oxfmt` 为权威；不并用 Prettier。当前 fix script 对整个 `.` 扫描，因此只在所有编辑冻结、工作树无范围外改动且写锁独占时运行；检查实际 diff，禁止接受范围外变化。计划内文件可自动修正，不能先手工模拟格式化。若存在无关待保护改动或固化命令会越界，暂停该命令并按工具链 owner 核定安全的文件级入口，不擅自覆盖。

所有前端源码格式稳定后才做 extraction；首次生成 → 完整字段级 diff 审查 → 仅补充本计划消息的 en/zh-CN 翻译 → 再次执行同一 `messages:extract` → 确认内容和译文稳定。`#:` 允许由当前源确定的全量定位元数据变化；`#.`, msgid, msgstr, fuzzy/obsolete 需逐项归因。禁止 clean extraction、手写旧引用或把 generated 当成免审。

协议 validator 的输入为 `codex-rs/app-server-protocol/schema/json` 与 `codex-rs/gui-host/schema/json`；已核对请求定义、通知定义、schema bundle、鉴权 params/result schema、两组生成目录及共享 projection fixture/builder 均存在。CI 的 `protocol:check-validators` 为只读检查，不运行生成/后端构建。新 TS/TSX 不触发根级 `just fmt`。

### Level 1

`pnpm run ci` 覆盖 validator、oxfmt、lint、类型、所有 unit 及 Chromium smoke。此次 owner 修改由该 unit 集合真实收集；必须检查目标测试名称和结果，零收集不算通过。

完整组合源码固定后，额外运行以下有界 Browser 集合，三个浏览器均使用项目 config 的 headless；目标存在性已核验，新共享按钮测试由 T0 产生：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:parallel src/feedback src/features/threadHistory src/features/composerEditor src/features/composerTurnControl src/features/appShell/__tests__/ActiveThreadCollectionMenu.browser.test.tsx src/__tests__/AppErrorPresentation.browser.test.tsx src/__tests__/AppMultiSessionIsolation.browser.test.tsx src/__tests__/AppNewSession.browser.test.tsx src/__tests__/AppSessionCompaction.browser.test.tsx src/__tests__/AppProjectionAvailability.browser.test.tsx src/__tests__/AppPendingInputRecovery.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:sequential src/__tests__/sequential/composerClipboard.browser.test.tsx src/__tests__/sequential/composer-viewport.browser.test.tsx src/__tests__/sequential/history-focus.browser.test.tsx
PLAYWRIGHT_HTML_OPEN=never /opt/homebrew/bin/fnm exec --using-file pnpm run test:e2e e2e/newSession.spec.ts e2e/persistence.spec.ts e2e/multiSession.spec.ts
```

E2E 由当前 `playwright.config.ts` 启动前端 Vite；已有 harness 提供测试协议服务，不启动 Rust/原生构建。重用端口前核对服务确为目标项目和当前源；不得接管或停止用户的未知进程。报告不自动打开，所有测试浏览器无头运行。

逐行为验收：失败→pending→再失败→pending→成功；旧错误和诊断保留；按钮名称固定；连续点击/键盘只一次有效动作；业务拒绝与 unknown 不误报成功；异步过期结果不污染新任务；第一次正常加载不出现错误；同步保存无伪 loading。测试不以关闭检查、放宽断言、替换基线或删除覆盖换取通过。

### Level 2 与 Level 3

Level 2 适用：执行时通过当前 `/gui` 或外层 launch_gui 取得完整 URL，保留 route/thread/token，使用专用技能的无头入口并核验 session 的非 headed 状态。先证明真实页面加载的是本次最终前端产物；若仍使用旧资源，不得用其结果验收本次修改。运行目标、URL 和结果写入受保护的执行记录，不能复用旧 URL。

优先验证真实可安全复现的历史读取、技能刷新、诊断打开关闭、宽窄屏及键盘场景。新建、继续发送、移除、压缩等有业务副作用的真实点击，只能针对执行时明确授权的测试对象；缺少此授权或真实失败状态时保留对应未执行记录，继续无依赖验证。不得为了制造错误破坏用户任务或断开用户连接，也不得把网络 mock 的 E2E 冒充 Level 2。

没有当前 runtime/URL/授权测试状态时，不启动后端，不猜测入口；记录该场景未执行，并阻止“全部验证完成”的声明。Level 3 不适用，本计划不授权可见窗口。

## 6. 可执行 DAG 与能力信封

本节为执行结构，采用节点记录而非流程图。节点继承公共字段后再应用局部覆盖，展开后每个节点具有执行图契约的全部字段。当前仅文档编写已授权，所有实施节点的 `authorizationGate.status=pending`；用户明确确认执行本计划后，由 action-authorization 建立相应最小信封再激活。

### 公共字段

- `executionContext`：当前工作树 `/Users/jiangsheng/cnb/codex`，branch=dev，index 通过执行前 `git rev-parse --git-path index` 解析 canonical identity。无 worktree 创建节点。
- `readSet`：已确认设计/计划、适用规则、当前 GUI 源码/测试/配置、上述本地依赖文档及 CI 所需协议只读输入；`writeSet` 默认为空，编辑/生成节点仅按 T0–T8 allowlist。
- `subdelegation=false`。主代理为协调、格式化、生成、验证、记录及唯一 Git owner；E1–E5 可分别委派不同代理，E0/E6 由主代理负责，独立审查者不得是相应产物修改者。
- `commandScope`：只读节点仅 rg/cat/sed、只读 Git；编辑节点另可普通源码 patch，移动/删除须原生 Git 且在声明集合内；格式/生成/验证节点仅第 5 节相应入口；Git 节点只 stage allowlist 和普通 commit，不远程、不强制。
- `resourceLocks`：编辑对本节点文件 canonical path 写锁，依赖产物读锁；格式化对整个 codex-gui 写锁；extraction 对 src 读锁和两个 catalog 写锁；测试对源码读锁，对实际 Vite cache/tsbuildinfo/报告/端口写锁；Git 节点独占解析后的 index 与当前 HEAD。
- `stateEffects`：仅局部节点声明的文件、提交或授权测试运行状态；不推导外部操作许可。
- `deferralEvidence=none`：无凭据的串行不成立；canonical 资源冲突由锁直接决定，锁释放即重新调度。
- `verification`：编辑产物由 V1/V2/V3/V4 按第 5 节验证，不要求未集成的中间任务独立满足整个计划。
- `failureDomain`：默认本节点产物与传递消费者；只有共享接口/生成物确实失效才扩到相关分支。
- `replanTriggers`：新 owner/消费者超出写集合、产品行为或授权改变、工具不可用、合同/生成边界失真。计划内失败先诊断修正并重编节点，不以首次失败或调用次数停止。
- `authorizationGate`：grantSource=未来本计划执行确认；negativeConstraints=第 1 节及当前用户规则；仅节点 operationKind 能力，参数限当前目录和声明输入/输出；specialApprovals=无项目外主动改动及可见窗口授权；生命周期至节点产物交付/撤销即到期。真实有副作用 Level 2 的对象授权独立核对。

### 节点表

| nodeId / taskBoundary | operationKind / owner / estimatedCost | hardPredecessors、consumes → produces | writeSet / stateEffects / completionEvidence |
| --- | --- | --- | --- |
| P0s / 文档前置 | stage / 主代理 / 小 | 用户确认执行＋重新预检 → 已暂存设计和计划 | 仅上述两个文档的 index；staged diff 与 ignore 检查通过 |
| P0c / 文档前置 | commit / 主代理 / 小 | P0s 的文档暂存快照 → 独立文档 commit | index/HEAD；记录 commit id。此提交前不开始实现 |
| E0 / T0 | 编辑 / 主代理 / 小 | P0c → 共享按钮稳定接口和用例 | T0 集合；具体接口及 diff 摘要交付，消费者可开始接线 |
| E1 / T1 | 编辑 / 历史实现代理 / 中 | P0c、E0 展示接口 → 历史实现和用例 | T1 集合；对应失败序列的源码及测试完成 |
| E2 / T2 | 编辑 / 当前任务实现代理 / 大 | P0c、E0 → 当前任务实现和用例 | T2 集合；按真实结果分类、生命周期保护及测试完成 |
| E3 / T3 | 编辑 / 技能实现代理 / 中 | P0c、E0 → 技能实现和用例 | T3 集合；无私有异常泄漏且双编辑器语义保持 |
| E4 / T4 | 编辑 / 新建及待发实现代理 / 中 | P0c、E0 → 新建/待发实现和用例 | T4 集合；不解除 unknown 和发送屏障 |
| E5 / T5 | 编辑 / 压缩实现代理 / 中 | P0c、E0 → 压缩实现和用例 | T5 集合；启动失败保留及事件成功判据保持 |
| E6 / T6 | 编辑 / 主代理 / 中 | E1–E5 的最终 owner 合同 → 跨入口 fixture/E2E | T6 集合；所有直接消费者接通，无双路径临时兼容 |
| F / T0–T6 | 格式化 / 主代理 / 小 | E0–E6 冻结源码 → 格式稳定源码 | 仅 T0–T6 范围内格式变化；项目脚本实际 diff 审查及非 fix 通过 |
| G1 / T7 | 生成 / 主代理 / 小 | F 稳定源 → 两个 catalog 首次生成 | T7；完整字段 diff 分类 |
| G2 / T7 | 编辑 / 主代理 / 小 | G1 → 本计划消息的完整中英文翻译 | 仅 T7 的允许人工 msgstr；原有翻译保持 |
| G3 / T7 | 生成 / 主代理 / 小 | G2 → 稳定 catalog | 同一 extract 二次不再产生结构/译文差异；若格式检查需修正，仍由原生入口完成后再稳定提取 |
| R / 无独立提交 | 审查 / 独立审查代理 / 中 | F 稳定源码 → 反向行为及范围审查结论 | 无写入；检查业务成功、旧错误保留、防重复、隔离与排除项；可与 G1–G3 并行，后补核 catalog |
| Rc / 无独立提交 | 审查 / 独立审查代理 / 小 | R、G3 → catalog 与源码语义一致的结论 | 无写入；完整检查允许字段、翻译、二次提取及 source 对应 |
| V1 / 组合验证 | 验证 / 主代理 / 中 | G3 → CI 结果 | 工具正常缓存；ci 全部 gate 通过及目标 unit/smoke 收集证据 |
| V2 / 组合验证 | 验证 / 主代理 / 大 | G3；与 V1 冲突由共享 cache/tsbuildinfo/runner 锁处理 → Browser 结果 | 测试产物；第 5 节 parallel 和 sequential 命令目标均实际通过 |
| V3 / 组合验证 | 验证 / 主代理 / 中 | G3；与其他 runner 的端口/cache 锁处理 → E2E 结果 | 测试产物/前端 dev server；三 spec 在真实测试入口通过 |
| V4 / 真实验收 | 验证 / 主代理 / 中 | G3＋当前 URL/runtime/目标授权 → Level 2 场景证据 | 仅授权浏览器和测试对象；明确通过与未执行，不虚构完成 |
| A / 汇合 | fan-in / 主代理 / 小 | R、Rc、V1–V4 → 最终源码身份与验收分类 | 无产品写入；全部计划内发现闭环。V4 未执行仅允许标注实现/自动验证完成，不允许完整验证声明 |
| S0…S7 / T0…T7 | stage / 主代理 / 小 | A 的稳定源码及本任务验证证据；共享 index 互斥 → 各任务 staged snapshot | 每次仅对应 T 集合；diff --cached --check、allowlist、ignore 检查 |
| C0…C7 / T0…T7 | commit / 主代理 / 小 | 对应 S 节点 → 对应行为 commit | 普通独立提交；T0 在依赖消费者前，T6 在业务合同后，T7 在全部 source 后 |
| D8 / T8 | 编辑 / 主代理 / 小 | 执行事件＋C0…C7 → 完整执行记录 | T8；记录最终源码身份、所有提交、真实并行、关键路径、未启动 ready 节点与验证限制 |
| S8 / T8 | stage / 主代理 / 小 | D8 → 记录 staged snapshot | 仅 T8 的 index；检查通过 |
| C8 / T8 | commit / 主代理 / 小 | S8 → 执行记录 commit | index/HEAD；终态 status/diff 与源码验证身份一致 |

D8 的记录内容可在执行期间由主代理增量维护，最终提交在汇合后；其他代理只能返回结构化事件，不能共同追加记录。

### 调度及提交拓扑

执行确认后的初始 ready set 是 P0s；P0c 后 E0 ready；共享展示接口稳定后 E1–E5 同时 ready，按不相交写集合并行。各分支不等待其他分支提交；T2 和 T5 虽同属 activeThreadSession，但其声明文件不同，不构成串行理由。公共 fixture 由 E6 独占，防止多人竞争。

E6 等待实际变更的合同，是数据依赖。F 等待全部源编辑，是当前固定格式化命令读取/写入整个项目的资源约束；G 等待源行号稳定，是确定性提取依赖。R 与 G 独立并行。V1–V3 使用共享项目 cache、报告和可能重叠的服务端口，未隔离这些资源前轮流获得锁，不能在未完成编辑上收集验证证据；这不是任务编号依赖。V4 在真实 app 使用相同前端服务时也参与服务锁。

预计关键路径：文档提交 → 共享按钮 → 当前任务生命周期分支 → 集成 fixture → 格式/翻译 → 组合验证 → 本地任务提交。提交顺序采用 C0、C1、C2、C3、C4、C5、C6、C7，序号仅选择一个合法线性扩展，不阻止 E1–E5 并行编辑。每个 S/C 对从 stage 至 commit 全程持有同一 index/HEAD 锁；后续 S 节点等待前一 C 交付 commit，不得交叉暂存其他任务。所有提交来自 A 验证过的最终源码快照；stage/commit 不改源码时无需为每个中间提交重跑整套验证。

中间提交允许消费者尚未集成；禁止为使其单独通过增加 adapter、fallback、双读或临时兼容。计划完成以全部提交合并后的最终状态判断。已有提交需修正时创建新独立提交，修正归属原任务并补必要验证，禁止 amend。

## 7. 失败处理与完成条件

计划前独立反向审查已完成：补入 collection presentation/menu 与 pending editor adapter 的三处按需 fixture，并将菜单 Browser 用例加入验证命令；其余 owner、成功判据、生成边界及 DAG 未发现阻断项。该审查只证明计划覆盖，不替代实施后的 R/Rc 和运行验证。

按执行图契约把测试失败、审查发现和新证据加入运行记录，声明诊断/修正/重新验证节点及最小能力；仅使实际依赖该产物的后继失效。不得停止无依赖分支，也不得越过新权限或产品决策门禁。

目录/类型/文案变化引起的计划内 fixture 和断言更新必须保持原验证能力，并增加新状态序列；发现原检查确实错误时给出证据，否则不得通过扩大 ignore、跳过浏览器、降低断言或改基线规避。

终态需满足：T0–T8 全部必要产物及独立提交已形成；R 发现已闭环；最终合并源码通过适用自动化；Level 2 逐项分类，未执行时明确限制；工作树无本计划遗留且用户无关改动保留。完成后不自行开启新一轮复审或追加新任务。

最终汇报给出文档/提交及验证结果，并按执行图契约报告“实际并行”“关键路径”“未启动 ready 节点”。本轮计划落盘不构成这些执行证据。
