# Codex GUI 未知交付记录移除实施计划

日期：2026-09-08。

状态：计划已落盘，等待明确确认执行。当前授权仅覆盖计划编写，不授权实施或 Git 提交。

设计：[已确认设计](../../../../specs/2026/09/08/2026-09-08-codex-gui-unknown-record-removal-design.md)。

评审：[B09 输入队列评审](../../../../reports/2026/09/08/2026-09-08-codex-gui-quality-review/batch-09-input-queue.md)。

核对基线：`b1d8bda92f00f86008c3b42af32c8e2f1738c2a1`，工作目录 `/Users/jiangsheng/cnb/codex`，分支 `dev`。计划前仅设计文档未跟踪，无产品源码改动。

## 目标与授权边界

同时修复 QR-B09-001/002：未知合并记录及原消息归属完整释放，原子保存，界面使用最新列表与 revision，允许时按原有顺序继续队列。

保持现有合并表示、队列顺序、恢复暂停、recovery、sendingBarrier、其他未知交付和 pending/active turn 的既有约束；移除不撤回服务端消息、不自动重发未知或已移除消息、不放宽严格身份校验。

确认执行本计划后，授权下述范围内的编辑、必要格式化、验证、独立审查，以及 D0/T1/T2 的独立本地提交。禁止 amend、squash、Git 远程、安装依赖、后端构建、可见浏览器；不包含 UI 改版、协议/schema/生成物/锁文件修改或无关重排。

当前工作树执行，不创建 worktree 或新分支，不修改仓库外持久状态。相关命令自身产生的正常测试、缓存和运行产物按既有规则处理，不主动清理范围外产物。

## 纵向影响面与证据闭包

| 字段 | 结论与一手证据 |
| --- | --- |
| 权威入口 | `CurrentTaskPage.tsx` 挂载 `ComposerTurnControl`，后者挂载 `ComposerPersistenceStatus`；按钮通过 `ActiveThreadComposerRole.discardUnknown` 进入 `liveActiveThreadSession` 和 coordinator。queue/start/steer owner 决定消息归属，coordinator 决定持久化、快照与 effects。 |
| 已追踪链路 | UI/session revision → coordinator persistence revision → 候选 queue → start claim/rejected transfer → 导出 → store JSON decode → `decodeComposerCoordinatorRecord` 重新导入精确校验 → 保存 → 提交候选 → effects/订阅。刷新时 issuing 转 unknown；保存失败回滚并发布错误。 |
| 修改范围 | start 返回实际释放 claim，queue 复用完整释放；coordinator 仅在移除成功时消费 drain transition。直接 start 消费测试 `composerLanePersistence.test.ts` 必须随内部接口更新。公开 queue/coordinator/session boolean 接口不变。 |
| 验证映射 | queue 身份与持久化测试；真实 coordinator + store 的原子性/屏障测试；真实 live session 转发回归；真实 coordinator 驱动的 Browser 交互测试。测试路径由现有 unit 与 browser parallel 配置收集。 |
| 排除项 | 不改协议字段、持久化记录版本或输入 payload，因此不生成 schema、validator、catalog 或锁文件。普通 steer 的 boolean discard 已自行释放其 owner，保留实现并回归。TUI、QR-B09-003/004 不在范围。UI 仍使用现有 Alert 和 danger Button，不改组件、样式或文案。 |
| 剩余未知 | 无阻碍编写自动化实施范围的关键未知。真实运行的完整 GUI URL、安全测试线程及未知交付状态尚未取得，Level 2 不能预先宣称可执行或通过；它只阻塞对应真实验收及完整验证声明。 |

独立反向审计已完成：发现并纳入 start lane 测试消费者、发送回调时检查已保存 claim、无匹配移除不得 drain，以及 Browser fixture 不等同生产 live session 的证据边界。T1/T2 编辑不依赖彼此产物，最终组合验证依赖两者汇合。

## 精确写集合与任务提交边界

下列源码路径相对 `codex-gui/`；各组同时定义 stage allowlist，不允许 `git add .`。

### D0：实施前文档独立提交

- `docs/superpowers/specs/2026/09/08/2026-09-08-codex-gui-unknown-record-removal-design.md`
- `docs/superpowers/plans/2026/09/08/2026-09-08-codex-gui-unknown-record-removal-plan.md`

执行计划前确认两份文档未被 ignore、状态和内容对应本次确认；仅暂存这两份文档，检查 staged diff，创建独立本地提交。失败则暂停依赖实施，不绕过文档门禁。

### T1：完整释放未知 start 的消息归属

- `src/features/composerInputQueue/composerStartQueueState.ts`
- `src/features/composerInputQueue/composerInputQueue.ts`
- `src/features/composerInputQueue/__tests__/composerLanePersistence.test.ts`
- `src/features/composerInputQueue/__tests__/composerQueueRecordIdentityPersistence.test.ts`
- `src/features/composerInputQueue/__tests__/composerInputQueuePersistence.test.ts`

start 的 discard 校验 phase/ID 后返回被释放 claim 或明确未移除结果；queue 复用 `releaseStartClaim`，正确区分 start 与 steer，并保留其公开 boolean 返回。不得先丢失 claim，再从序列化数据推导归属。

补充实时 unknown、issuing 刷新恢复、原消息 ID 清理、其他项保留、重新导入，以及不匹配 ID/phase 的回归。直接 start 测试断言释放 claim 的消息身份和 pending 清空，不用 truthy 断言替代契约验证。

### T2：移除事务、快照与受约束续发闭环

- `src/features/composerInputQueue/composerInputQueueCoordinator.ts`
- `src/features/composerInputQueue/__tests__/composerInputQueueCoordinatorUnknownDiscard.test.ts`（新增）
- `src/features/composerTurnControl/__tests__/ComposerTurnControlPersistence.browser.test.tsx`
- `src/features/activeThreadSession/__tests__/liveActiveThreadSession.test.ts`

coordinator 在事务中移除成功后，复用 `consumeTransition(queue.drain())` 的既有机制；事务将移除及下一项 claim 一起保存，提交后运行 effects 和发布最新快照。无移除时不 drain；不为本修复改变通用事务对其他操作的发布策略。

测试复用现有 queue/coordinator fixtures、projection builders 和 Browser render support，不改共享 fixture API。新增测试文件可定义本场景专属 deferred/storage 控制，协议合法数据仍从权威类型和现有 builders 构造。

Browser 测试传入真实 coordinator，通过其订阅驱动页面更新，禁止手动发布“移除成功”快照伪造闭环。现有 Browser support 的 session role 是测试转发，因此另在真实 `liveActiveThreadSession` 测试中覆盖移除转发与快照更新，不能将 Browser fixture 宣称为真实运行证据。

## 验证矩阵

| 场景 | 必须观察的结果 | 验证归属 |
| --- | --- | --- |
| 实时未知 merge、issuing 刷新恢复 merge | 移除成功、容器与全部原 ID 消失，保存记录重新导入成功，其他消息保留 | T1 + T2 unit |
| 普通未知 start/steer、多个未知条目 | 最新快照和 revision 发布；连续移除使用新版本 | T2 unit + Browser |
| restoredPaused 下移除后 Continue sending | 移除不解除暂停；显式继续使用新 revision，其他屏障继续有效 | T2 unit + Browser |
| 允许发送且已有待发消息 | 按原顺序推进；在 RPC 回调开始时，store 已包含下一项 claim 且不含已删除项/原 ID | T2 unit |
| sendingBarrier、recovery、restoredPaused、其他 unknown | 各自按原规则阻塞；快照仍正确更新，不绕过限制 | T2 unit |
| 保存抛错 | 删除与候选推进一起回滚；无新 RPC；旧记录和归属可恢复；保存错误可见 | T2 unit + 既有 Browser 错误覆盖 |
| 旧 revision、错误 ID、已 disposed、已有保存错误 | 操作拒绝或未移除，无续发副作用 | T2 unit |
| 严格身份检查 | orphan/missing/duplicate owner 仍拒绝，普通 start/steer 归属不回归 | T1 unit |
| 真实 live session | 实际 session 转发接收正确 revision，coordinator 快照更新传播给订阅者 | T2 session unit |

### Level 1

unit、类型/lint/格式检查和三浏览器无头 Browser 回归必须执行。unit 至少包含整个 `composerInputQueue/__tests__` 目录、`liveActiveThreadSession.test.ts`；Browser 包含完整 `ComposerTurnControlPersistence.browser.test.tsx`。记录实际收集的文件、用例和各浏览器结果，不能以零目标或只有转发断言视为通过。

### Level 2

适用于真实应用中的条目消失、连续移除、恢复继续和受约束续发。在实施时通过适用工具链核对当前完整 GUI URL、真实 runtime、安全线程和可操作状态；已有真实状态可用且动作获授权时，以无头方式执行。未知交付状态不能通过真实 runtime 安全获得时，明确记录对应场景未执行，不主动中断用户任务、篡改其持久化记录或制造连接故障。

当前未取得这些条件，不编造 launch 命令或 URL。缺少条件时仅暂停该验收及其完成声明，继续无依赖的自动化、审查和本地提交；最终可以报告代码与自动化完成，但不得报告完全验证或全部计划节点完成。需要用户提供状态或授权时，列明精确缺口。

### Level 3

不适用：本改动不涉及操作系统窗口、桌面焦点或 IME 行为。不打开任何可见浏览器、DevTools、报告或 trace viewer。

## 已核验的工具与命令

计划前确认 fnm 可用，fnm 环境解析为 Node `v24.17.0`、pnpm `10.34.5`，pnpm 不来自 Codex runtime shim；vitest、tsc、oxfmt、eslint、oxlint 已存在，Playwright 的 chromium/firefox/webkit 可执行路径存在。仅做版本、帮助和文件存在性核对，没有运行测试。执行前仍须重新预检。

`package.json` 的 `ci` 与 `.github/workflows/codex-gui.yml` 指向 oxfmt、lint、type-check、unit 和 Browser。`vitest.config.ts` 排除 browser 测试；Browser parallel 收集本计划 TSX 路径，shared config 固定 `headless: true`，包含三个浏览器。无需改配置或串行测试组。

以下命令 cwd 均为 `/Users/jiangsheng/cnb/codex/codex-gui`：

```bash
/opt/homebrew/bin/fnm env --shell zsh
/opt/homebrew/bin/fnm exec --using-file which pnpm
/opt/homebrew/bin/fnm exec --using-file node --version
/opt/homebrew/bin/fnm exec --using-file pnpm --version
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit src/features/composerInputQueue/__tests__ src/features/activeThreadSession/__tests__/liveActiveThreadSession.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:parallel src/features/composerTurnControl/__tests__/ComposerTurnControlPersistence.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
/opt/homebrew/bin/fnm exec --using-file pnpm run lint
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
```

上面的命令列表定义入口，不要求它们按书写顺序串行。格式化先于最终验证。项目 `format:oxfmt:fix` 固定含 `.`，无法表达仅修改本任务文件；为避免范围外写入，用已核对参数的同一 formatter `pnpm exec oxfmt --write` 加 T1/T2 实际修改文件的精确列表，随后用上述非 fix 格式检查验证。不使用 Prettier 作为第二格式 owner，不运行全仓 `just fmt`。

lint 若发现本任务可自动修复问题，优先调用相应已安装 lint 工具对精确文件执行 fix，检查 diff 后重新运行非 fix；不修无关既存问题。缺少工具/浏览器时停止依赖步骤并告知用户自行安装，不代安装。正常测试所需缓存可由命令自行产生。

## 描述式执行 DAG

以下默认字段与节点表合并后构成各节点的完整声明；节点表覆盖默认值。运行图在执行上下文维护，不回写本计划；主代理是唯一调度与状态记录 owner。

### 共同字段

- `executionContext`：同一 `/Users/jiangsheng/cnb/codex` 工作树、`dev` 分支、由 `git rev-parse --git-path index` 在执行前解析的 canonical index；无 worktree/branch 创建节点，无跨分支集成。
- `readSet`：已确认设计/计划、适用规则、T1/T2 文件及其直接依赖、上述生产链、测试 fixtures、工具链配置和本地 Vitest 文档。调查读权限不扩展写权限。
- `writeSet`：以节点表指定集合为准；验证和审查没有产品源码写权限。
- `stateEffects`：编辑仅写 allowlist；格式化仅该列表；验证仅命令正常缓存/产物/进程；stage/commit 仅规定 allowlist/index/本地历史；审查仅返回结果。
- `commandScope`：只读 `rg`/`cat`/`sed`/本地 Git 状态与 diff；节点操作限其类型及上节核验入口。普通源码编辑使用 patch。Git 写入仅 S/C 节点执行，禁止 force 和远程。
- `resourceLocks`：编辑/格式化独占各自 canonical 文件；验证共享只读最终源码，unit 与 Browser 可并行；所有写入 `codex-gui/tsconfig*.tsbuildinfo` 的类型检查共用独占锁，执行时按实际配置核对，冲突即调度串行而非并发写同一产物；lint 的 `.eslintcache` 独占；index 写入由主代理独占。审查共享只读，不占验证 runner。
- `subdelegation`：false。子代理不得转委派。
- `deferralEvidence`：默认无。T1/T2 文件不交叉，不以编号制造依赖。若验证缓存实际冲突，记录路径、暂缓节点、并行收益与冲突成本；持锁命令结束立即复查并释放暂缓。
- `authorizationGate`：当前全部实施节点 pending。计划获明确执行确认后，按 action-authorization 为各节点下发最小能力信封；读写、格式化、验证、stage、commit 分别收紧，节点返回即到期。
- `failureDomain`：本节点及消费其产物的后继；共享工具缺口仅阻塞实际依赖它的节点。
- `replanTriggers`：计划内问题创建有界诊断/修正/重验节点；影响写集合、产品结果、授权或风险边界时暂停相关后继并回到对应门禁。禁止放宽检查、隐藏失败或以兼容层让中间提交完整。

### 节点记录

| nodeId | taskBoundary / operationKind / owner | hardPredecessors 与稳定输入（consumes） | outcome / produces / completionEvidence | writeSet / verification | estimatedCost |
| --- | --- | --- | --- | --- | --- |
| P0 | 无提交 / 调查 / 主代理 | 明确计划执行确认；消费确认后的文档 | 核对基线、状态、规则、工具、完整测试输入、index canonical 路径；输出预检记录 | 无；只读状态与存在性检查 | 短 |
| D0-S | D0 / stage / 主代理 | P0 的环境与文档身份 | 只暂存 D0 两文档；staged diff 与 ignore 检查通过 | D0 allowlist 和 index；`git diff --cached --check` | 短 |
| D0-C | D0 / commit / 主代理 | D0-S 的暂存快照 | 独立文档 commit ID，解锁实施 | 本地 index/历史；核对提交路径 | 短 |
| E1 | T1 / 编辑 / 主代理 | D0-C；已确认释放设计 | 完整归属释放实现与 T1 测试稳定 diff | T1；交接无未完成编辑 | 中 |
| E2 | T2 / 编辑 / 子代理 | D0-C；已确认事务设计及公开 queue boolean 契约 | coordinator、unit、Browser、session 回归稳定 diff | T2；交接无未完成编辑 | 中至长 |
| F | T1+T2 / 格式化 / 主代理 | E1、E2 的冻结产物；消费实际修改列表 | 精确文件 oxfmt，输出冻结组合 diff 身份 | T1+T2 实际变更文件；检查无范围外改动 | 短 |
| V1 | 无提交 / 验证 / 主代理 | F 的组合源码 | queue/session unit、type-check、lint、格式检查结果及收集目标 | 无产品源码写；上节非 fix 命令 | 中 |
| V2 | 无提交 / 验证 / 验证子代理 | F 的组合源码 | 三浏览器 persistence 文件结果、目标计数 | 无产品源码写；上节 Browser 命令 | 中 |
| R | 无提交 / 审查 / 独立审查子代理 | F 的冻结组合 diff、设计与矩阵 | 独立检查 owner、事务时序、revision、屏障与覆盖；返回证据及发现 | 无；只读反向审计，不得由 E1/E2 修改者承担 | 中 |
| L2 | 无提交 / 验证 / 主代理 | F；另需当前完整 URL、真实运行载入该源码及获授权安全状态 | 真实场景证据，或精确未执行/待输入状态 | 无源码写；动态节点核验适用无头入口后才启动 | 取决于真实状态 |
| J | 无提交 / fan-in / 主代理 | V1、V2、R；消费自动化和审查结果 | 所有计划内发现已修正并完成必要重验，组合产物可提交 | 无；核对测试证据绑定当前 diff | 短 |
| T1-S | T1 / stage / 主代理 | J；消费 T1 实际 diff | 仅 T1 暂存快照、staged diff check 通过 | T1 allowlist/index | 短 |
| T1-C | T1 / commit / 主代理 | T1-S | T1 独立本地 commit ID | index/本地历史；核对路径与内容 | 短 |
| T2-S | T2 / stage / 主代理 | J、T1-C；后者仅因共享 index 和提交快照边界 | 仅 T2 暂存快照、staged diff check 通过 | T2 allowlist/index | 短 |
| T2-C | T2 / commit / 主代理 | T2-S | T2 独立本地 commit ID | index/本地历史；核对路径与内容 | 短 |
| Z | 无提交 / fan-in / 主代理 | T1-C、T2-C、J；完整验收还依赖 L2 实际结果 | 核对最终提交树与被验证源码相同、无遗漏变更；分别报告代码、自动化、真实验收状态 | 无；本地 status/diff/log，不无故重跑已通过检查 | 短 |

初始 ready set 在执行授权后为 P0。文档提交门禁结束后 E1/E2 fan-out；F 汇合两份稳定 diff 后，V1/V2/R 可独立调度，L2 另受真实条件门禁约束。关键路径预计为 P0、D0、较长编辑分支、F、较长验证/审查分支、J、本地任务提交、Z；真实验收可能单独成为完整验证的关键路径。

T1/T2 都在组合验证后提交，允许中间提交尚未完成整项集成；不为通过中间状态添加 adapter、fallback 或旧新双路径。每个提交只含行为修复及其验证，不混入无关 import/声明/函数重排。修正已有提交必须产生新的独立提交。

## 失败处理与停止条件

验证失败先按执行图契约记录证据、失效产物与影响域，再在已授权范围内诊断、修正、重验；修改后失效的审查/测试重新调度。不得将首次失败视为整项终止，也不重复无新输入的相同失败命令。

独立无依赖节点继续执行。必需工具缺失、真实状态或授权缺失只暂停相应节点。无关既存问题单独记录，不借机修复、不关闭检查。

所有修改、最终验证及计划内修正完成后核对组合提交树；仅在全部必需节点的证据满足时声明整个计划完成。Level 2 未执行时明确保留该缺口。达到完成条件后本轮终止，不自动追加新一轮复审修复。
