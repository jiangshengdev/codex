# Codex GUI 集合内部成员生命周期实施计划

日期：2026-09-08。

状态：按“确认，落盘计划”编写；等待用户确认执行。尚未实现、运行验证、暂存或提交。

设计依据：[成员生命周期设计](../../../../specs/2026/09/08/2026-09-08-codex-gui-member-lifecycle-design.md)。源码基线：`dev` / `f62af19ae`。执行前核验基线与工作树，不覆盖并行改动。

## 目标与约束

在保持现有行为和对外 interface 不变的前提下，集中单个成员的生命周期规则，改善 locality。

只修改下述 `codex-gui/**` 白名单及本次工作文档。页面连接生命周期沿用已完成的 `guiHostConnectionLifecycle`。不改变 UI、路由、协议、持久化格式、队列或 reservation 语义；不新增自动重连、自动重试、自动重发、兼容层、双读双写或 fallback。`deliveryUnknown` 保持人工处理，后台会话保持活动，`view` 不隐式重试失败成员。

本计划确认执行后，先独立本地提交本次设计与计划，再开始实现；实现与必要回归组成一个独立重构任务提交。所有 Git 写操作由主代理独占真实 index，精确暂存实际变更白名单。禁止远程操作、amend、强制操作、安装依赖及主动后端构建。不创建 worktree，不改分支。

## 证据闭包

| 字段 | 当前证据及计划判断 |
| --- | --- |
| 权威入口 | `activeThreadSessionCollectionContracts.ts` 定义对外状态、结果和 controller；`activeThreadSessionContracts.ts` 定义 live 与 reservation。生产 `guiHostConnectionLifecycle.ts` 创建 collection，并转交投影、状态、技能、恢复与连接终止事件。 |
| 已追踪链路 | collection 的 activate/view/retry/remove → 成员初始化、通知与清理 → `liveActiveThreadSession`、投影与 read model；选择由 browser authorization 持久化，membership 由 `SessionCollectionPersistenceStore` 持久化。controller 的公开类型和调用方式保持不变。Host commands 消费现有生成协议，成员不新增输入解析。 |
| 修改范围 | `activeThreadSession.ts` 当前 Member 同时持有集合操作错误/removal promise 与 attached/frame/live/slot 等生命周期字段；拆开其权威归属。读模型仅可能调整 ownership 注释，action、identity、revision 均保持。 |
| 验证映射 | 集合既有测试覆盖选择和清理交接、重入与 revision；live 测试覆盖 reservation；新增成员 interface 测试覆盖提取出的完整周期；`multiSession.spec.ts`、`persistence.spec.ts` 保护生产 UI 调用链及恢复行为。CI 入口另外覆盖类型、lint、生成一致性与 Browser smoke。 |
| 排除项 | `guiHostConnectionLifecycle` 已通过 controller interface 接线，无需修改；live 已有 `reserveRelease`，不重造其协议；read model 已按 threadId/instanceId 定位 slot。Host 请求集合、协议输入与生成产物不变，仅检查，不生成；不修改 UI/DOM/ARIA、路由、sessionStorage 格式和队列实现。 |
| 剩余未知 | 当次真实 runtime URL、可用空闲任务及本次前端产物身份尚未取得，是执行期 Level 2 输入门禁，不能据此声称验收完成。可控故障由 Level 1 验证；真实异常状态缺失则分别记未执行。当前没有影响设计或源码范围的关键未知。 |

高风险来自异步生命周期、同步重入、部分清理及持久化交接。证据细节与现有测试位置见设计；行号仅是基线定位，不作为输出范围或发布次数要求。

## 文件集合

以下路径除 D 外均相对 `codex-gui/`。R 是只读证据范围，不扩大写入授权。

- D：本计划与上述设计文档。
- M：`src/features/activeThreadSession/activeThreadSession.ts`；新增 `src/features/activeThreadSession/activeThreadMemberLifecycle.ts`；新增 `src/features/activeThreadSession/__tests__/activeThreadMemberLifecycle.test.ts`；`src/features/activeThreadSession/activeThreadSessionReadModel.ts` 仅 ownership 注释。
- C：`src/features/activeThreadSession/__tests__/activeThreadSession.test.ts`，仅补充确有缺口的集合交接断言，保留原覆盖。
- R：D、适用规则与 skills、GUI 源码/测试/配置/现有依赖，以及 CI 检查依赖的现有协议 schema 与生成产物。后端资源仅作为现有校验输入只读使用。

不预设修改 live 测试、E2E 文件、公共 contracts 或共享 projection builders；现有 fixtures 足以表达本次既有行为。若证据表明确需白名单外编辑，先更新范围并取得对应确认，不通过本地协议 DTO 绕开权威 fixture。

## 内部 interface 与实施内容

新增 `createActiveThreadMemberLifecycle`。输入为 threadId、现有 commands、dispatch、scheduler、persistence；commands 从 `GuiHostCommands` 引用或机械派生，scheduler 和 persistence 从现有权威类型引用。不得从 collection implementation 反向导入运行时代码形成环依赖。

| 操作 | 完整职责与结果 |
| --- | --- |
| `getState` / `subscribe` | 提供只读 phase、cwd、snapshot、error、removalBlockers 及重试方向；公共字段从权威 contracts 派生。snapshot 的 roles 与 revision 缓存由成员维护。集合负责操作错误、canRemove 与所选成员的对外组合发布。 |
| `initialize` | 拥有初始化 pending 去重及 loaded/resume/attach/live 构造；返回既有 activation outcome，不提交选择。成员先登记到集合再调用，构造本身不得抢跑 attach。 |
| `retry` | 处理初始化失败清理后重挂、失败重试或 ready 状态刷新；主动移除未完成时通过只读恢复方向交还集合 remove。该恢复方向是前端内部语义，不镜像一套协议 DTO。 |
| `handleProjectionEvent` / `handleProjectionDelta` / `handleProjectionClosed` | 成员匹配 subscription，缓冲并排空初始化通知，管理 delta frame 与非 delta 同步顺序。集合只按 threadId 定位。通知参数直接引用现有协议类型。 |
| `invalidateSkills` / `invalidateThreadStatus` / `suspendRestored` | 在初始化前保留失效与暂停意图，live 可用后按原顺序应用；不由集合访问 live 或其 revision。 |
| `prepareRemoval` | 刷新状态并检查 blockers，返回拒绝结果或一次释放交接；交接封装现有 live reservation。未挂载且已进入移除重试时允许沿当前状态继续。 |
| 交接的 `cancel` / `release` | 清除选择失败时 cancel 撤销原 reservation；release 提交原 reservation，拒绝陈旧状态，再释放 live 与 detach，保留 slot。返回既有 removal outcome 的适用失败/阻塞分支或内部“资源已释放”结果，不能提前返回 removed。 |
| `finalizeRemoval` | 仅在集合 membership 删除持久化成功后删除保留 slot 并终结。集合继续迁移操作错误、删除成员、处理 viewedThreadId 并返回 removed。 |
| `dispose` | 本地终止、取消 frame/订阅与清理读模型；保持现有异常传播。已在途初始化在异步返回后按现有路径补偿，不能将 dispose 一概改成发送 detach。 |

以上名称明确计划的操作粒度；实现时可作保持同一语义的内部命名与类型推导调整。释放交接只隐藏对已有 reservation 的调用，不新增第二套冻结/版本协议，也不把整个 `removeMember` 下沉。

集合 Member 只保留成员句柄、集合拥有的 operationErrors、整个 removal promise 以及订阅解除句柄等集合协调数据。初始化 pending、attached、subscriptionId、frame、live、roles、slotIdentity、通知缓冲、失败清理方向均进入成员。删除集合中的旧资源 implementation，不保留两条路径；普通源码提取用 apply_patch，没有可表达此职责迁移的现有生成或迁移命令。

实现必须保持：

1. membership 新增持久化失败时不 resume/attach。ready 不等于选择提交；集合保留 `selectionIntent` 和 retry 开始/完成时的 viewed 检查。选择提交失败仅产生 warning。
2. slot identity 在 dispatch 前登记；dispatch 和 live 构造后检查终止。安装 live subscription 后排空通知并确认状态，才暴露 ready。保留 Redux/session revision 一致性，不发明“恰好一次 publication”要求。
3. 初始化失败 detach 未决时保留初始化主错误与清理错误，显式 retry 先清理再重挂。主动移除 detach 成功但 membership 删除失败时保留 removalPending 与 slot，重试不重复 detach。
4. 先准备 reservation，再由集合清除选择，再 commit 与释放资源，最后持久化 membership 并终结。选择失败撤销后健康成员仍可用；不发布冻结中间态，陈旧 commit 拒绝，cancel 不恢复陈旧状态。
5. 操作错误不被 lifecycle retry 清除；成员退出时仍由集合迁移。后台通知、晚到 attach 的暂停、空队列暂停规则和原异常传播保持不变。

Deletion test：集合能仅通过上述 interface 完成选择与成员资格协调，无法触碰成员内部资源；测试能通过 commands/scheduler adapter 与公开输出驱动完整生命周期。这是 depth、locality 与 leverage 的验收，不按文件长度判定。

## 验证入口与成功条件

执行 cwd 固定为 `/Users/jiangsheng/cnb/codex/codex-gui`。已读取当前 package scripts、Vitest/Playwright 配置和 `.github/workflows/codex-gui.yml`：CI 使用 `pnpm run ci`，其中 oxfmt 是格式门禁，Prettier 不叠加为另一门禁。本轮只核验入口，没有运行测试。

当前 fnm 来源核验为 Node `v24.17.0`、pnpm `10.34.5`，pnpm 位于 fnm 的 Node 安装目录；所需本地 runner 文件存在。执行前重复 `$codex-gui-toolchain` 预检，核验 schema、生成物、浏览器二进制、CI 环境及测试发现范围；任何缺失不安装、不跳过。仓库 `just fmt` 不适用于本次文件。

Level 1 必需命令：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit src/features/activeThreadSession/__tests__/activeThreadMemberLifecycle.test.ts src/features/activeThreadSession/__tests__/activeThreadSession.test.ts src/features/activeThreadSession/__tests__/liveActiveThreadSession.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run ci
PLAYWRIGHT_HTML_OPEN=never /opt/homebrew/bin/fnm exec --using-file pnpm run test:e2e e2e/multiSession.spec.ts e2e/persistence.spec.ts
```

定向单测用于快速定位，最终 ci 检查整个组合状态并包含 Chromium Browser smoke；E2E 按现有配置运行 Chromium、Firefox、WebKit。记录实际收集文件、测试数和退出结果，不能以零测试成功代替覆盖。无需额外重复全套 Browser tests，因为本次没有组件 interface 或 DOM 修改，集成风险由上述 E2E 和 smoke 承担。

格式化仅针对 M∪C 的实际变更文件：package fix script 固定全目录，不能用于本次受限写集合；因此使用项目同一 oxfmt binary 的 `pnpm exec oxfmt --write`，参数逐一列出实际文件，随后对同一文件集合运行 `pnpm exec oxfmt --check`。均通过相同 fnm wrapper。若 lint 失败，优先用对应 owner 的受限 fix 入口，检查 diff 并非 fix 复验，不全目录修复。

新增成员测试从 interface 驱动：初始化 pending 去重、订阅匹配/同步重入、delta 调度与取消、状态/技能失效、终止后晚到结果、初始化失败清理与重挂、移除保留 slot 与最终删除、暂停及错误传播。集合测试继续覆盖选择失败撤销、后台 retry、membership 删除失败后重试与操作错误迁移；live 原有 reservation 测试全部保留。不直接断言私有字段，不删原集成覆盖，不增加手写协议 validator。

E2E 服务默认 5173 dev，CI 为 4173 preview。先核验已有服务属于本 checkout 与正确产物，不能停止用户服务。需要 CI preview 或 runtime 消费 dist 时，启用 P-build 节点，在上述 cwd 运行 `/opt/homebrew/bin/fnm exec --using-file pnpm run build`，生成本次前端产物并记录源状态与 `dist` 身份。若使用可核验的本次 dev 源码或已有同状态产物，不重复 build；运行记录必须给出身份匹配证据。HTML 报告不自动打开。

### Level 2：真实集成

必须先取得当次 `/gui` 或 outer `launch_gui` 完整 URL，确认真实 runtime、路由、本次前端产物及显式 headless session 证据；不猜 URL、不复用历史 token。使用当时适用浏览器 skill 的无头入口，结束后关闭本次受控会话。

| 场景 | 状态准备及成功证据 |
| --- | --- |
| 恢复与后台切换 | 使用用户允许验收的真实任务；准备至少两个可查看的线程，激活并切换，核对各自内容、当前选择及后台成员保持；刷新后核对成员列表恢复。动作会更新本次浏览器 sessionStorage/选择及投影订阅，不提交提示词。 |
| 空闲成员移除 | 使用明确允许从本次浏览器活动列表移除的空闲成员；核对 UI 允许移除，移除后列表与当前选择符合契约，刷新后不再恢复该 membership。只移除 GUI 成员，不删除真实任务或历史。缺少该安全目标时等待用户提供，不任意选择工作中的任务。 |
| 错误恢复与未知投递 | Level 1 用受控故障证明选择失败、detach/membership 部分失败和 deliveryUnknown。Level 2 只在已有合法且明确允许操作的对应真实状态下观察或显式恢复；不为制造错误发送提示词、断开宿主或丢弃真实响应。缺少真实状态则逐项记未执行，不能用 mock 冒充。 |

前两项是本次真实集成必需场景；真实故障场景按可用状态执行。需要额外真实发送、故障注入或影响用户任务的控制时只暂停该动作并请求精确授权。URL/状态缺失不阻断源码与 Level 1，但阻断完整验收结论。Level 3 不适用，不启动可见窗口。

## 描述式 DAG

节点字段采用 `$delegating-micro-stages/references/execution-graph.md` 契约，下述默认字段与每行合并构成完整节点。计划编写不启动执行图；确认后在执行上下文维护动态状态，不回写本文作运行日志。

- `executionContext`：当前 `dev` 共享 worktree；执行前用 Git 解析实际 git-dir/index，唯一 Git 写 owner 为主代理；不创建 worktree/branch。
- `authorizationGate`：所有执行节点当前 pending。后续计划确认作为 `grantSource`；objective 为唯一目标，phase 为各节点对应阶段，grantedOperation/allowedOperations 仅限该行单一动作及有界步骤；parameterBounds 为本文 cwd、白名单和无头入口。canonicalTargets 为下表读写集合对应仓库绝对路径。特殊真实动作须另有精确授权，`specialApprovals`/`requiredApprovalIds` 未满足时不得推定存在。
- `commandScope`：读取用 rg/cat/sed/Git 只读命令；源码编辑用 apply_patch；格式与验证用上述入口；stage 只精确 `git add -- <实际白名单>`；commit 前核对 ignore/status/staged diff，执行 `git diff --cached --check`，再新建本地 commit。没有行内许可时不能跨动作族。
- `negativeConstraints`：本文全部范围及禁止项；`subdelegation=false`，主代理可分派所列节点，子代理不能继续委派。`lifecycle`：节点前置与授权满足时激活，返回或前提失效即到期。
- `resourceLocks`：编辑/格式独占实际文件；审查与测试读取冻结组合状态。Git 写独占解析后的 index；Vitest/tsc 共享 `codex-gui/node_modules/.vite` 及类型输出时互斥；P-build 独占 `codex-gui/dist` 和 tsconfig 定义的 tsbuildinfo 输出，与读取 dist 的 preview/runtime 及相交的类型检查互斥；E2E 独占实际 5173/4173 服务和 `codex-gui/test-results`、`codex-gui/playwright-report`；runtime 验收独占本次浏览器 session。资源冲突等待锁，不伪造硬依赖。
- `failureDomain`：本节点及消费失效产物的后继；共享环境缺失仅传播实际消费者。`replanTriggers`：授权/范围/产品语义变化回门禁；计划内失败插入诊断、修正和受影响复验，不降低断言。`deferralEvidence` 初始为空。
- `stateEffects`：编辑/格式产生白名单 diff；验证仅产生已授权程序正常运行产物；stage/commit 修改本地 Git；调查/审查只返回对话证据。不得主动清理无关产物。

| nodeId / taskBoundary / operationKind / owner | hardPredecessors；consumes | outcome / produces / completionEvidence / verification | readSet / writeSet | estimatedCost |
| --- | --- | --- | --- | --- |
| D-stage / 文档 / stage / 主代理 | 计划执行确认；D 审阅版本 | 仅 D 暂存，ignore 与 staged diff 检查通过 | D、Git / index | 短 |
| D-commit / 文档 / commit / 主代理 | D-stage；准确 index | 独立文档 commit id 和父提交，status 核验 | D、index / 本地 Git | 短 |
| I / 重构 / 编辑 / 主代理 | D-commit；已提交设计计划和基线 | M 完成成员提取、集合切换及 interface 测试；单一权威实现的可审阅 diff | R / M | 中 |
| C-regression / 重构 / 编辑 / 子代理 | D-commit；既有 collection interface 与测试 | C 的覆盖核查及必要交接断言；无缺口可返回有证据的空 diff | R 的稳定基线 / C | 中 |
| U / 无提交 / 调查 / 主代理 | 执行确认；当次只读 runtime 输入 | 真实 URL/产物/安全线程的可用性证据或精确缺口 | R、当前工具只读结果 / 无 | 短 |
| F / 重构 / 格式化 / 主代理 | I、C-regression；组合 diff | 实际变更文件格式化及非 fix 检查通过，冻结组合状态 | R、M∪C / 实际变更文件 | 短 |
| V-unit / 无提交 / 验证 / 主代理 | F；冻结状态 | 定向三个单测文件全部收集并通过 | R、M∪C / 无主动源码输出 | 短 |
| V-ci / 无提交 / 验证 / 主代理 | F；冻结状态 | 当前 ci 全部门禁通过 | R、M∪C / 无主动源码输出 | 中 |
| P-build / 无提交 / 生成 / 主代理 | F；仅在 preview/runtime 需要且没有匹配产物时激活 | 项目 build 成功；本次 dist、类型构建输出及源状态身份，禁止生成后端 | R、M∪C / 项目 build 定义的前端输出 | 中 |
| V-e2e / 无提交 / 验证 / 子代理 | F；冻结状态与正确服务输入，CI preview 缺少匹配产物时另依赖 P-build | 两个 E2E 文件按三引擎通过，记录服务身份 | R、M∪C、服务 / 无主动源码输出 | 中 |
| Review / 无提交 / 审查 / 未参与编辑的子代理 | F；冻结组合状态 | 反向核查时序、错误、权威类型、删除旧路径与测试；具体发现或边界清单 | R、M∪C / 无 | 中 |
| V-runtime / 无提交 / 验证 / 主代理 | F、U；本次产物和合法真实输入，消费 dist 且缺少匹配产物时另依赖 P-build | Level 2 必需场景实测证据，条件场景逐项状态 | 本次产物/合法任务 / 本次受控浏览器 session | 中，依赖输入 |
| J / 无提交 / fan-in / 主代理 | Review、全部 V 节点；同一最终状态证据 | 计划内发现闭环、证据有效、必需场景通过 | 全部结果与最终 diff / 无 | 短 |
| T-stage / 重构 / stage / 主代理 | J；最终组合 diff | 仅实际 M∪C 暂存，staged diff/check 通过 | M∪C、Git / index | 短 |
| T-commit / 重构 / commit / 主代理 | T-stage；准确 index | 独立重构提交及最终 status 核验 | index / 本地 Git | 短 |

确认后的初始 ready set：D-stage、U。D-commit 后 I 与 C-regression 并行，写集合不相交；双方只从基线读对方文件，避免读取在途编辑。二者同属一个重构提交边界，无需隔离 Git 写分支。F 消费两者的稳定结果。

F 后验证与独立审查 fan-out；V-unit/V-ci 等待共享 runner 锁，不因编号形成硬依赖。V-e2e、Review 和具备输入的 V-runtime 可与无冲突节点重叠。J 汇合有效最终证据；失败只使受影响分支失效，不扩大成全局栅栏。

预计关键路径：文档提交 → 较慢的编辑分支 → F → 最慢的验证/修正分支 → J → 重构提交。任务提交拓扑：文档提交 → 重构提交。实际执行记录初始/动态 ready set、锁、失败和提交身份，最终报告实际并行、关键路径与未启动 ready 节点原因。

## 失败与完成

发现计划内问题，记录失败证据、owner 和失效验证，继续无冲突节点；修正前释放受影响的读锁，再执行修正、受限格式化及必要复验。原编辑者修正、未参与修正者独立核验，不因首个失败停止，也不无依据重复所有测试。

不为中间提交增加临时兼容或双路径。若不得不改变可观察行为，回到设计/计划确认，行为变更与纯代码顺序调整必须独立提交。已有提交的修正新建独立提交，禁止 amend。

完成以最终组合状态为准：集合不再拥有成员资源协议；行为与公共 interface 保持；既有检查能力没有削弱；计划内任务与修正已完成本地提交；最终 Level 1 及必需 Level 2 成立，条件场景缺口明确，Level 3 不适用。工具、授权或真实状态缺失时只暂停依赖分支，不能宣称完整验收。完成后结束本轮，不主动开启下一轮工作。
