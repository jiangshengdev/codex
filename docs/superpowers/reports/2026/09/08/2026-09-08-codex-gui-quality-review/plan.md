# Codex GUI 分批代码质量评审执行计划

日期：2026-09-08

状态：待用户确认，尚未执行。

依据：[已确认设计](./design.md)。用户已于本轮确认整体设计并授权新建计划；设计文件中的“待整体设计确认”为落盘时的历史状态。本计划的创建不表示正式评审或提交已经获准执行。

## 目标与边界

按固定基线分批评审 `codex-gui` 的缺陷与可维护性，运行有必要的现有定向测试，完成跨模块复核和全局汇总。连续推进并保留可续接记录，不逐批请求确认。

不修改源码、测试、配置、生成物或历史报告，不执行修复。仅允许为理解前端直接依赖而只读追踪外部实现。不得操作 Git 远程、安装依赖、运行后端构建或启动真实 Codex 验收。Level 2 与 Level 3 均不在本计划默认授权内。

## 当前核验与执行前条件

- 已核对 `codex-gui/package.json`、Vitest 的 unit/parallel/sequential/smoke 配置、Playwright 配置及 `.github/workflows/codex-gui.yml`。CI 使用 `ci` 和 `test:browser`；本计划按具体疑点选择其下已有的定向测试入口，不默认运行整套 CI。
- Browser Mode 的共享配置使用无头 Playwright；parallel 与 sequential 的文件集合由现有配置划分，不改配置、不改变浏览器实例集合。
- Playwright E2E 有独立测试服务器，属于隔离测试证据；其已有服务器复用行为须在执行前核实，不能误连用户运行中的 GUI。
- 类型别名直接引用 `codex-rs/app-server-protocol/schema/typescript/**` 和 `codex-rs/gui-host/schema/typescript/browserContract.ts`。生成契约检查必须沿这些权威来源追踪，不能手写替代契约。
- 当前 `fnm` 和项目 Vitest 入口存在，fnm 管理的 pnpm 返回 `10.34.5`。未运行任何测试，未验证浏览器二进制；执行前重新核实环境和输入。
- 计划编写时工作区只有本主题目录的未跟踪文档；正式代码基线在前置文档提交后建立，不能使用本段代替执行时核验。

仓库根记为 `W=/Users/jiangsheng/cnb/codex`，报告根记为 `R=docs/superpowers/reports/2026/09/08/2026-09-08-codex-gui-quality-review`。下文路径均相对 W，除非明确标注。这些符号用于文档表达，不作为 shell 环境变量设置。

## 基线、清单与续接

正式执行先独立本地提交 `R/design.md` 与 `R/plan.md`，再记录当前提交号、分支、Git index 的实际路径、工作区状态和评审源文件身份。只暂存精确文档白名单；被 ignore 的文件不得强制暂存，不能 amend。

用 `git ls-files -- codex-gui` 和 `git ls-files --others --exclude-standard -- codex-gui` 建立范围清单，并检查隐藏配置、符号链接和 ignore 边界。自动缓存、依赖目录、构建输出和测试运行产物作为排除类别记录；跟踪的生成物、锁文件、配置与测试不静默排除。

预期评审代码无未提交变更。若出现用户未提交的源码内容，不替用户恢复或提交，暂停基线建立并确认快照范围；文档更新与测试自动缓存不视为源码漂移。记录纳入文件的内容身份，批次开始、测试前后和最终汇总前核对；出现漂移时使受影响证据失效，不混合基线。

`coverage-and-progress.md` 保存基线、文件主归属、覆盖状态、排除理由、节点状态、问题交接、实际并行记录和下一步位置。长清单允许分段表格，不以目录勾选替代逐文件记录。

续接时先读取设计、计划、覆盖进度及相关批报告，再核对源码基线、已发布报告身份和未完成节点。不得仅凭上一次助手的完成声明跳过节点。运行期重编节点和失败证据写入进度记录，不回写已确认计划正文。

## 批次主覆盖归属

表中 feature 路径均位于 `codex-gui/src/features/`；目录包含其内部测试。精确文件主归属在基线清单中展开。关联读取允许重叠，主覆盖归属必须唯一。

| 批次 | 主覆盖范围 | 核心问题 | 报告文件 |
| --- | --- | --- | --- |
| B01 | `appShell/**`、`currentTask/**`、`documentTitle/**`；`src/main.tsx`、`src/App.tsx`、`src/router.tsx`、`src/routerComponents.tsx`、`src/NotFoundPage.tsx`、`src/app/**` | 入口、装配、路由与连接生命周期桥接是否正确协作 | `batch-01-app-shell.md` |
| B02 | `guiHost/**`、`browserLaunch/**` | 认证、连接、命令与通知的契约及失败传播 | `batch-02-connection.md` |
| B03 | `activeThreadSession/**`、`sessionCollection/**`、`browserPersistence/**` | 会话隔离、查看与激活、清理、持久化和恢复 | `batch-03-sessions.md` |
| B04 | `newSession/**`、`threadHistory/**` | 新建、历史加载与继续任务的状态和导航边界 | `batch-04-new-and-history.md` |
| B05 | `projectionIngress/**`、`threadRuntime/**` | 快照、订阅、事件连续性与运行状态 | `batch-05-runtime-ingress.md` |
| B06 | `transcriptState/**` | 对话状态、去重、分块与上下文页的一致性 | `batch-06-transcript-state.md` |
| B07 | `committedTranscriptSurface/**` | 消息和活动渲染、Markdown、分页与热路径 | `batch-07-transcript-display.md` |
| B08 | `composerEditor/**`、`composerInput/**`、`skillCatalog/**` | 草稿、剪贴板、技能选择和输入语义 | `batch-08-editor.md` |
| B09 | `composerInputQueue/**` | 队列状态、交付未知、重试、追加指令与中断协调 | `batch-09-input-queue.md` |
| B10 | `composerTurnControl/**` | 输入操作与会话状态集成、待发送编辑、持久化和界面控制 | `batch-10-turn-controls.md` |
| B11 | `qrAccess/**`；`src/feedback/**`、`src/identity/**`、`src/subscriptions/**`、`src/text/**`、`src/i18n.ts`、`src/locales/**`、`src/index.css`、`public/**` | 公共反馈、身份工具、国际化和共享样式的行为与维护成本 | `batch-11-shared-platform.md` |
| B12 | `src/generated/**`、`scripts/protocolValidators/**`、`src/features/projection/**` | 权威契约到生成校验器与共享 fixture 的对应关系 | `batch-12-contracts-fixtures.md` |
| B13 | `src/__tests__/**`、`src/utils/**`、`e2e/**`、其余 `scripts/**`；`codex-gui` 顶层配置、manifest、锁文件、README、AGENTS、`index.html` | 测试装配与断言有效性、工具链、依赖和工程规则 | `batch-13-engineering-tests.md` |

同一测试可被业务批作为验证证据使用，但顶层集成测试的主覆盖仍归 B13。B01 中的连接桥接与 B03 的会话 owner 通过跨模块复核闭合，不重复声明主归属。

I00 清单核对及 E00 登记必须证明上述规则对每个范围内文件恰好匹配一个 owner。新增路径或重叠不能静默塞入杂项：先按职责分配并记录；目标范围未变化的映射修正不新增用户审批。

批次是报告单元，不是一次代理调用必须读完的内容。B03、B09、B10 等可按生命周期、状态转移、持久化、界面消费和测试形成更小的只读问题节点。每次委派只检查一条明确链路或一个假设，返回后汇入相应报告，不按行数设停止条件。

## 检查与证据产物

每批执行设计中的七个检查维度，详细发现使用 `QR-Bxx-nnn`，跨模块发现使用 `QR-Xnn-nnn`。编号一经引用不重排；归并保留旧编号指向和原证据。

每条详细发现记录分类、位置与基线、证据、影响或维护成本、根因或缺口、验证状态、优先级依据及整改交接说明。未发现问题的职责也写检查结论和关键依据，不能把“读过文件”当作行为证明。

优先级按影响、触发条件和波及范围判断：P0 为阻断使用或严重数据/安全影响且需立即处置；P1 为关键行为明显失效；P2 为有明确影响的局部缺陷或维护成本；P3 为较低影响的改进。待验证项单独标记证据状态，不因潜在严重程度伪装成已确认缺陷，不用文件大小或测试数量定级。

测试不是各批必跑清单。静态证据不足且现有测试能回答具体疑点时，建立独立 V 节点，记录疑点、预期观察及目标测试。没有相关测试时保留缺口，不新增测试或改变断言。

## 定向验证入口

以下是执行时允许选择的命令模板，`<测试文件>` 必须在 V 节点中替换为已核实存在且被相应配置收集的明确路径，不能按目录一次启动无关全套测试。cwd 固定为 `W/codex-gui`。

```text
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit <测试文件>
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:parallel <测试文件>
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:sequential <测试文件>
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:smoke <测试文件>
PLAYWRIGHT_HTML_OPEN=never /opt/homebrew/bin/fnm exec --using-file pnpm run test:e2e <测试文件>
```

执行前核实 fnm 管理的 Node/pnpm 路径、依赖、浏览器和生成输入。缺工具时暂停相应验证，说明用户需要自行安装的组件，不自行下载。Browser Mode 适用 `codex-gui-toolchain` 和 `vitest-react-browser-docs`；领域 API 判断按对应 HeroUI、Redux、Lingui 等 skill 核验本地权威资料。

E2E 必须先检查配置指定端口和既有服务器身份；不能证明是本基线隔离测试服务器时不复用、不关闭用户服务，将该验证记录为缺口。正常启动的测试服务与浏览器在验证结束后按其生命周期退出，不打开 HTML 报告或可见窗口。

不默认执行协议生成、消息提取、格式化、lint fix、构建或清理命令。协议来源可静态核实；若需要检查型入口，必须先建立精确 V 节点并确认其不改写评审代码。

测试非零退出不是评审失败的自动终点，也不是缺陷根因证明。继续在只读与定向验证范围内区分产品失败、工具缺失和测试环境问题，记录实际命中数和输出；不能修复源码或测试。无法完成的验证作为明确缺口进入报告。

## 描述式执行图

以下模板与实例表共同构成节点定义；字段由模板继承，再由实例替换。正式执行按 `delegating-micro-stages/references/execution-graph.md` 建立运行记录和最小能力信封，不使用图形表达。

### 共享字段与能力边界

- `executionContext`：现有 W 工作区及执行时核实的当前分支，不创建 worktree 或分支。只读调查共享固定源码；全部报告属于同一报告任务 T-REPORT，写集合不相交的报告可并行编辑。Git index 仅由主代理操作。
- `authorizationGate`：目前全部执行节点为 `pending`，等待用户确认本计划。确认后由 action-authorization 逐节点激活。`grantSource` 为该计划确认；`phase` 为评审执行；`objective` 为本计划目标；`grantedOperation`、`allowedOperations`、`parameterBounds`、`canonicalTargets`、`stateEffects`、`commandScope` 取节点声明与用户授权交集。`specialApprovals` 和 `requiredApprovalIds` 为空；新增外部运行或可见窗口不在信封内。
- `negativeConstraints`：禁止源码/测试/配置修改、安装、后端构建、远程操作、amend、强制 Git、历史报告修改及真实环境验收。
- `lifecycle`：节点发布稳定结果、返回失败或前提失效时能力到期；续派须新建信封。`subdelegation=false`，子代理不得再委派。
- `estimatedCost`：普通局部节点中，状态/队列/跨模块节点高，文档登记与 Git 节点低；仅供槽位选择，不作预算或停止阈值。`deferralEvidence=null`，存在实际争用时另记完整证据。
- `resourceLocks`：源码及权威输入为 canonical 路径 read；报告文件按节点 write；`R/coverage-and-progress.md` 只有主代理 write。Git 节点独占执行时解析的 `W/.git/index` 实际目标。测试节点独占 `W/codex-gui/node_modules/.vite`、项目测试 runner 及相关浏览器/服务器资源，避免共享缓存和端口争用；不阻塞只读调查。
- `replanTriggers`：源码基线漂移、覆盖映射失真、产物缺失、验证入口与实际配置不符。先局部重编；只有目标、授权或风险边界变化才请求新确认。
- `failureDomain`：默认仅本节点、消费其结果的节点和同任务提交节点；共享源码基线失效才扩大到受该基线影响的全部评审。不得因单次测试失败暂停无依赖批次。

### 节点模板

| 模板 | operationKind / owner | readSet / writeSet / stateEffects / commandScope | consumes / produces / completionEvidence / verification |
| --- | --- | --- | --- |
| G | stage 或 commit，拆为独立节点；主代理 | 只读精确文档清单；stage 写 index，commit 写本地提交；仅 `git status`、`git diff`、`git check-ignore`、`git add -- <精确白名单>`、`git commit` 及本地身份核验 | 消费已核验文档；stage 产出匹配白名单的 staged diff；commit 产出新提交号。检查 staged diff 与 `git diff --cached --check`；已有无关暂存项时不得混入提交 |
| I | 调查；主代理或单职责子代理 | 本批源文件、直接调用方/测试、必要外部权威实现、适用规则 read；无文件 write；只读搜索、读取及本地 Git 查询 | 消费基线与精确问题；产出带路径、行号的结论、已排除项和建议；主代理核对关键证据后成为稳定节点记录 |
| V | 验证；主代理 | 指定现有测试与依赖 read；无主动源码 write；副作用为已授权测试进程的正常缓存/报告；仅上文选定的精确测试入口 | 消费疑点和环境预检；产出命令、目标、结果及缺口证据；成功命中预期目标才算测试通过，失败继续诊断或形成明确缺口 |
| E | 编辑；主代理或指定单文件写 owner | 消费稳定调查/验证记录；只写实例声明报告；使用文档编辑工具，不改源码 | 产出报告内容身份；按设计字段逐项核验，无假通过声明、链接和编号可追溯 |
| A | 审查；非该报告编辑者的独立子代理 | 只读稳定报告、覆盖清单和必要源证据；无文件 write；只读搜索/读取 | 产出缺项、矛盾、重复与引用核验结果；修改者不得作为独立审查者 |

所有实例 `outcome` 为下表的唯一产出，`taskBoundary` 按该表声明。调查或审查的对话结果由主代理在独立登记 E 节点写入覆盖进度；登记只消费该节点，不等待无关批次。节点记录必须保留完整信封与资源身份，不能只保存模板名称。

### 实例、依赖及提交拓扑

| nodeId | 模板 / taskBoundary | 唯一产出 | hardPredecessors 及实际原因 |
| --- | --- | --- | --- |
| D-STAGE | G-stage / T-DOC | 仅 design.md 与 plan.md 的暂存快照 | 用户确认本计划，文档可读且无 ignore/暂存冲突 |
| D-COMMIT | G-commit / T-DOC | 独立设计与计划提交 | D-STAGE：消费已检查暂存快照 |
| I00 | I / 无提交 | 固定源码基线与逐文件归属数据 | D-COMMIT：满足执行前文档提交门禁 |
| E00 | E / T-REPORT | 初始 `coverage-and-progress.md` | I00：消费实际清单与基线 |
| I-Bxx-k | I / 无提交 | 某批一个明确问题的证据结论 | E00：消费该批精确主范围；只有确需其他节点稳定证据时增加带原因的依赖 |
| V-Bxx-k | V / 无提交 | 一项定向验证证据或已闭合的验证缺口 | 对应 I-Bxx-k：消费具体疑点及目标；环境预检另作实例记录 |
| E-Bxx | E / T-REPORT | 对应批报告 | 本批 I 节点和实际需要的 V 节点：完成本批证据收敛；不依赖其他批报告提交 |
| A-Bxx | A / 无提交 | 本批报告独立核验结果 | E-Bxx：消费该报告稳定内容；有问题则增加修正文档 E 节点及必要复核 |
| I-X01 | I / 无提交 | 发送到展示链路证据 | B02、B05、B06、B07、B08、B09、B10 的有效批报告及复核：比较两侧语义 |
| I-X02 | I / 无提交 | 会话切换、新建、历史与恢复链路证据 | B01、B03、B04、B09、B10 的有效批报告及复核 |
| I-X03 | I / 无提交 | 断线、协议错误与公共反馈链路证据 | B01、B02、B03、B05、B11、B12、B13 的有效批报告及复核 |
| E-X | E / T-REPORT | `cross-module-review.md` | I-X01/02/03：合并链路结论与跨模块发现；必要 V 节点须先收敛 |
| E-SUM | E / T-REPORT | `00-summary.md` | 全部 A-Bxx 的有效结果与 E-X：全量分类、去重、排序及链接索引 |
| A-FINAL | A / 无提交 | 最终覆盖、基线、问题引用与证据一致性审查 | E-SUM、E-X、各批稳定报告和已更新覆盖记录；不要求无关全套测试 |
| E-CLOSE | E / T-REPORT | 完成状态的覆盖进度与终态证据 | A-FINAL 已通过，或其计划内文档修正及复核已完成 |
| R-STAGE | G-stage / T-REPORT | 本次报告精确白名单暂存快照 | E-CLOSE：全部报告组合检查和新文件内容检查完成 |
| R-COMMIT | G-commit / T-REPORT | 独立报告提交 | R-STAGE：消费仅包含本次报告的 staged diff |

E-Bxx 的 writeSet 为表中 `R/batch-*.md` 单个文件，E-X 和 E-SUM 各一个文件，E00/E-CLOSE/登记节点只写覆盖进度。修正节点只写其失败报告。D 与 R 两个任务各形成独立提交，不把设计/计划与评审结果混为一个提交。

计划确认后的初始 ready set 为 D-STAGE；D-COMMIT 后解锁 I00，I00 完成后解锁 E00；E00 后各批的有界调查节点 fan-out。批内调查没有天然串行依赖；可用槽位按关键路径和具体问题安排。跨模块节点只等待其实际相关批次，不等待全部批次的全局栅栏。最终 fan-in 为 E-SUM/A-FINAL/E-CLOSE/R 提交。

预计关键路径为文档提交、基线清单、会话或队列等最长实际调查分支、对应跨模块复核、汇总与最终审查、报告提交。批次编号不代表顺序，Git index 共享只约束 Git 节点，测试锁只约束竞争同一 runner 的验证。

不创建 worktree：源码只读，报告共属 T-REPORT 且单文件 owner 可隔离，主代理独占公共记录和 index。独立审查只消费已发布稳定报告，在该审查结束前不修改被审查文件；其他批报告仍可继续编辑。

## 失败、修正与完成

覆盖遗漏、报告矛盾、编号或证据错误属于计划内报告修正，增加 E/A 节点处理，不能通过删除检查维度或把未审文件改成已审来完成。产品代码缺陷是本次评审产物，记录后交接，不转为源码修复任务。

基线漂移先定位受影响输入；缺工具、端口身份不明或真实运行权限缺失只阻塞相关验证。若静态证据仍可形成有边界的结论，继续评审并显式保留验证缺口；不能假装测试通过。

最终检查逐文件覆盖归属、跨批闭合、发现正文唯一、整改说明、测试结果与基线对应、链接和优先级一致，以及 Git 精确范围。对未跟踪文档须实际读取检查，不能只凭 `git diff --check` 空输出认定已验证。

所有报告任务完成、最终独立审查与计划内修正完成、报告本地提交形成后终止。本轮不再追加新的评审轮次或修复任务。终态汇报报告路径、提交号、验证缺口，并给出实际并行、实际关键路径及未启动 ready 节点的具体原因。

## 计划独立复核记录

2026-09-08，由未参与本文件编写的子代理只读核对设计、计划、当前跟踪文件清单及测试配置，未发现阻止执行的覆盖遗漏、循环或伪依赖、并发写冲突。已根据复核统一 I00/E00 的命名与解锁顺序。此记录仅为计划核验，不是产品代码评审或测试通过证据；未跟踪文件与 ignore 边界仍由执行时 I00 核实。
