# Storybook 待发送队列实施计划

日期：2026-09-14

阶段：四项 ticket 的粒度与依赖已确认；计划落盘，实施节点尚未授权执行。

## 依据与交付

设计依据：[待发送队列业务场景设计](../../../../../specs/2026/09/14/2026-09-14-codex-gui-storybook-pending-input-design.md)。

交付完整队列的状态展示与可操作流程。编辑、删除和排序即时反馈；发送、引导及恢复的外部结果由模拟控件手动推进。全部使用虚构数据、独立内存存储与本地模拟，不连接真实业务服务、不发送真实消息、不改产品策略。

用户已确认四个业务纵切，每项同时交付可演示场景和对应测试。02、03、04 仅依赖 01 的稳定预览装配，不互相阻塞；最终跨流程检查属于汇合节点，不增加横向测试 ticket。

## 任务与范围

| Ticket | Blocked by | 可观察交付 | 源码和测试边界 |
| --- | --- | --- | --- |
| [01 队列查看与普通发送](issues/01-queue-browsing-and-sending.md) | 无 | 双通道查看、分页、长内容、空态，普通发送手动推进、重置及隔离 | 新增 `codex-gui/src/storybook/pendingInput/` 下共享装配、模拟控制与查看场景；`codex-gui/src/storybook/PendingInputBrowsing.stories.tsx`；`codex-gui/e2e/storybookPendingInputBrowsing.spec.ts` |
| [02 编辑、删除与内容保护](issues/02-edit-delete-and-preserve.md) | 01 | 保存、取消、删除确认，编辑失效后的保留、复制与放弃 | `codex-gui/src/storybook/pendingInput/editing/`；`codex-gui/src/storybook/PendingInputEditing.stories.tsx`；`codex-gui/e2e/storybookPendingInputEditing.spec.ts` |
| [03 排序与异常反馈](issues/03-reordering-and-failures.md) | 01 | 四种移动及边界限制，未移动与移动后刷新失败的不同结果 | `codex-gui/src/storybook/pendingInput/reordering/`；`codex-gui/src/storybook/PendingInputReordering.stories.tsx`；`codex-gui/e2e/storybookPendingInputReordering.spec.ts` |
| [04 引导与未发送恢复](issues/04-guiding-and-recovery.md) | 01 | 引导成功、优先发送、未知结果、恢复等待与结果，合法完整状态组合 | `codex-gui/src/storybook/pendingInput/recovery/`；`codex-gui/src/storybook/PendingInputRecovery.stories.tsx`；`codex-gui/e2e/storybookPendingInputRecovery.spec.ts` |

上表共享装配范围不包含三个子目录。文件名称为实施目标，不宣称文件已经存在。01 的共享模块按装配、模拟外部请求和场景输入职责组织，不预先实现后三项完整业务。

共享生成边界是 `codex-gui/src/locales/en.po` 与 `codex-gui/src/locales/zh-CN.po`；最终跨流程测试归 `codex-gui/e2e/storybookPendingInputIntegration.spec.ts`。它们由汇合 owner 独占处理。产品组件、协议、生成验证器、现有 Storybook 环境、依赖及配置不在修改范围。

如实现发现必须调整 01 共享装配，由主代理对具体文件建立独占修正节点，以稳定产物重新解锁消费者；不得让三个任务自行并发修改共享模块。等价实现调整在现有目标内处理，新增产品行为或公共接口修改须重新确认。

## 技术实施约束

- 复用真实队列 Region、Provider、Drawer、List、编辑器及所需 ComposerTurnControl，不复制产品 UI。通过已有 host/session 绑定保持焦点、编辑与确认语义。
- 正常业务动作由真实 `ComposerInputQueueCoordinator` 负责。既有 `startTurn`、`steerTurn`、`interruptTurn` 回调和存储注入边界提供本地控制；不能另写队列状态机维持一套平行真相。
- 通过既有会话角色契约绑定协调器；Story 局部装配是预览输入边界，不成为产品兼容层。直接引用或机械派生权威类型，禁止镜像协议契约或用宽泛断言消除类型错误。
- 普通成功响应与运行时事件分别推进。引导未知不转成明确失败，也不自动重发。使用现有合法投影构造设施，不手工拼一套协议对象定义。
- 现有测试 harness 作为行为先例；不把依赖 Vitest `vi` 的模块导入 Storybook 运行时。难触发错误允许有界接口替身，必须标明这是注入反馈，并保留真实业务组件处理路径。
- 每次重置销毁旧场景的订阅、队列和待处理操作，再创建独立初态；旧请求完成不能污染新场景。所有存储注入内存实现，不使用真实持久会话。
- 独立状态 Story 和交互 Story 属于同一业务票据，可以分组导出；固定起点必须符合产品可达条件，空队列不新增产品入口。
- 04 的完整组合只负责合法状态组合展示，不暗含对 02、03 新增 Story 的依赖；最终汇合再操作各能力的共存场景。

### HeroUI 与文案

保留真实产品 Drawer、Surface、Chip、Separator、编辑器和现有按钮变体。模拟控件采用 HeroUI Button；推进、结果注入和重置作为预览辅助操作，默认使用 `secondary`，必要的选择控件沿用 HeroUI 语义。保持 `surface`、`background`、`separator` 和字段 token，不新增产品色彩约定或覆盖产品 CSS。

真实业务文案直接复用。新增模拟控件文案使用 Lingui 并提供用途明确的 translator comment；Story 名称与说明沿用现有英文约定。实施时应用相应 HeroUI、Lingui 与消息语境 skills。

## 验证入口与预检

已核对当前 `package.json`：`test:e2e` 调用 Playwright，`type-check` 使用 TypeScript build check，`lint` 同时覆盖 oxlint 与 ESLint，`format:oxfmt` 为检查模式且属于 GUI CI 链。Playwright 从 `e2e` 收集测试，默认无头运行 Chromium、Firefox、WebKit；通过现有 webServer 启动前端与 Storybook。未运行测试，工具存在不代表验证通过。

以下命令 cwd 为 `/Users/jiangsheng/cnb/codex/codex-gui`。执行前重新核对 fnm 管理的 Node/pnpm、依赖及已安装浏览器、配置输入、服务端口和目标测试收集。目标测试必须先存在；零收集不是通过。缺失组件由用户安装，不自行安装或下载。

- 01：`PLAYWRIGHT_HTML_OPEN=never /opt/homebrew/bin/fnm exec --using-file pnpm run test:e2e e2e/storybookPendingInputBrowsing.spec.ts`。
- 02：`PLAYWRIGHT_HTML_OPEN=never /opt/homebrew/bin/fnm exec --using-file pnpm run test:e2e e2e/storybookPendingInputEditing.spec.ts`。
- 03：`PLAYWRIGHT_HTML_OPEN=never /opt/homebrew/bin/fnm exec --using-file pnpm run test:e2e e2e/storybookPendingInputReordering.spec.ts`。
- 04：`PLAYWRIGHT_HTML_OPEN=never /opt/homebrew/bin/fnm exec --using-file pnpm run test:e2e e2e/storybookPendingInputRecovery.spec.ts`。
- 最终聚焦回归：`PLAYWRIGHT_HTML_OPEN=never /opt/homebrew/bin/fnm exec --using-file pnpm run test:e2e e2e/storybookPendingInputBrowsing.spec.ts e2e/storybookPendingInputEditing.spec.ts e2e/storybookPendingInputReordering.spec.ts e2e/storybookPendingInputRecovery.spec.ts e2e/storybookPendingInputIntegration.spec.ts`。
- 最终静态检查：`/opt/homebrew/bin/fnm exec --using-file pnpm run type-check`、`/opt/homebrew/bin/fnm exec --using-file pnpm run lint`、`/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt`。
- 最终前端构建：`/opt/homebrew/bin/fnm exec --using-file pnpm run build-storybook --disable-telemetry`。

Oxfmt 是当前 CI 格式入口。格式修复优先使用项目工具且限定本次文件；现有全目录 fix 会触及范围外内容时，按工具链核验精确文件能力后再执行，不手工模拟格式化。检查失败不得通过扩大忽略、跳过测试或改断言来消除。

任务级测试验证本票行为；最终五文件调用消费语言生成与集成后的稳定状态。若同一稳定内容已有有效测试证据，可复用对应文件结果，只运行尚未覆盖或证据失效的范围，记录理由。共享装配变化使哪些任务证据失效，就重跑哪些任务；不自动运行全套 GUI 测试。

最终集成测试明确覆盖合法队列中的编辑、排序与恢复共存，以及代表性中英文、浅深色、窄容器、长内容滚动、键盘与焦点路径；不机械枚举全部组合。验证无真实业务连接、无产品持久记录读写，并在等待期间重置与切换后检查旧结果失效。复制路径既检查保留文本，也检查实际剪贴板边界及失败反馈，不用回调记录代替行为证据。

Level 1 适用：所有票据的外部行为及最终组合通过无头测试验证。Level 2、Level 3 对仅新增隔离 Story 不适用，不声称验证真实消息发送或系统桌面行为。若必须修改产品交互，重新评估范围和真实应用验收。

## 语言生成闭环

权威入口为 `/opt/homebrew/bin/fnm exec --using-file pnpm run messages:extract`。输入 owner 是现有 Lingui 配置与其包含的 `src`，排除截图和 trace 目录；source locale 为 `en`，locale 集合为 `en`、`zh-CN`。完整输出只有两个既有 `.po` catalog。

四项源码稳定后，由主代理独占提取、审查完整 diff、补齐新增消息翻译，再用相同入口重复提取验证稳定。允许人工修改本次新增消息的 `msgstr`，不手写生成的引用元数据；其他语义、状态或输出范围漂移必须先诊断。无需生成时以当前输入核验给出无新增消息证据。

共享语言闭环归独立集成提交，不把其他票据的文案混入任一业务票据提交。中间提交尚未完成语言集成不等于整项计划完成，也不得为中间提交新增临时 fallback 或双路径。

## 执行图契约

本节是描述式 DAG，节点默认字段与节点表合并解释。不是线性任务清单，编号不产生未声明的依赖。实施前按 `action-authorization` 为每个实际节点收紧最小能力信封，再使用 `delegating-micro-stages` 的执行图契约调度。

### 公共节点字段

- `executionContext`：当前工作树 `/Users/jiangsheng/cnb/codex`、分支 `dev`、共享 Git index `/Users/jiangsheng/cnb/codex/.git/index`，实施前重新核验。本计划不创建独立分支或 worktree，也不操作远程。
- `authorizationGate`：当前仅文档创建已授权；实现、生成、测试、stage、commit 全部 pending，后续明确实施授权后逐节点激活，不以 `ready-for-agent` 标签代替授权。
- `owner`：主代理协调共享装配与全局资源，独占 Git index、catalog 和最终集成。编辑可按四项业务边界交给子代理；独立审查由未编辑相应产物的代理承担。不得给子代理全局写或 Git 能力。
- `subdelegation`：false。主代理每次仅下发一个动作明确的节点。
- `estimatedCost`：调查与 Git 操作小；各编辑和 E2E 节点中；01 装配与 04 结果链较长。成本仅用于调度，不作停止条件。
- `deferralEvidence`：无预设暂缓；资源冲突按真实路径和锁排队，不伪造业务依赖。
- `readSet`：设计、计划、该票据、适用规则、当前任务范围、已稳定的共享装配、生产队列及会话角色权威定义、相关现有测试、Storybook/语言/验证配置。
- `writeSet`：编辑仅所属票据范围；共享修正仅明确指定的共享文件；语言节点仅两个 catalog；最终集成编辑仅集成测试；格式仅对应变更；验证为正常测试与构建产物；stage/commit 仅对应 allowlist 和本地 Git 状态；调查、审查与 fan-in 不写文件。
- `stateEffects`：只允许节点声明的单一动作及已授权程序正常内部产物；不包含安装、真实业务连接、持久会话变更或可见窗口。
- `commandScope`：只读 rg/cat/sed 和 Git 状态/diff；普通源码编辑；本节核验的项目测试、检查、生成与格式入口；精确路径 `git add --` 和新本地 commit。禁止 remote、force、amend、忽略文件暂存、安装及后端构建。
- `resourceLocks`：每项票据范围的 canonical 文件独占写；01 共享装配对消费者只读，修正期间暂停实际读者；生成期间独占两个 catalog 并冻结 `codex-gui/src` 输入；测试独占 localhost:5173/6006、`codex-gui/test-results`、`codex-gui/playwright-report`；构建独占 `codex-gui/storybook-static`；检查期间冻结实际消费源码；Git index 与 `dev` 引用由主代理独占写。
- `verification`：对应票据勾选项和上述固化入口；记录实际收集、通过与未执行范围。提交前核对普通/staged diff、精确 allowlist、`git diff --check` 与 staged 检查。
- `failureDomain`：当前节点及消费其产物的后继；共享前提失效只扩展到实际消费者。02 的局部失败不阻塞 03/04 的无关编辑。
- `replanTriggers`：共享接口、基线、生成输入、必要工具或实际锁身份变化时局部重编；新产品行为、外部副作用或新增授权要求只暂停相关路径。计划内失败先诊断、修正、复验，不能弱化约束。

### 节点与稳定产物

T 在下表分别实例化为 01、02、03、04；每个实例有独立 ID。表中 outcome 即该节点的唯一产出，produces 为稳定形式；consumes 与 completionEvidence 指明解锁证据。

| nodeId | taskBoundary | operationKind | hardPredecessors 与原因 | outcome / produces | consumes / completionEvidence |
| --- | --- | --- | --- | --- | --- |
| P | 无 | 调查 | 无 | 当前环境、路径与授权证据 | 当前配置、文件与授权；边界核验完成 |
| D-stage | 文档 | stage | P；实施前文档门禁 | 设计、计划、四票的 staged 快照 | 六份文件；精确 allowlist 和 diff 检查 |
| D-commit | 文档 | commit | D-stage；消费 index | 独立文档提交 | staged 快照；commit id |
| 01-edit | 01 | 编辑 | D-commit；文档先提交 | 查看与普通发送 Story、装配和测试 | 现有接口；稳定源码 diff |
| T-edit（02/03/04） | T | 编辑 | 01-commit；消费已验证装配 | 对应业务 Story 与测试 | 01 稳定接口；各自独立 diff |
| T-format | T | 格式化 | T-edit；输入稳定 | 本票规范化源码 | 精确文件集合；格式结果 |
| T-verify | T | 验证 | T-format；消费本票源码 | 本票外部行为证据 | 对应 E2E；目标实际通过 |
| T-review | T | 审查 | T-verify；消费稳定 diff 与证据 | 独立审查结论 | 无未闭合的本票问题 |
| T-stage | T | stage | T-review；消费通过产物 | 本票 staged 快照 | allowlist 和 staged diff |
| T-commit | T | commit | T-stage；消费 index | 本票独立提交 | commit id 与文件清单 |
| F-edit | 集成 | 编辑 | 02-commit、03-commit、04-commit；消费完整业务集合 | 跨流程集成测试 | 四票稳定产物；组合测试 diff |
| L-extract | 集成 | 生成 | 四个 T-commit；冻结全部消息输入 | 初次 catalog 提取结果 | 当前 src；完整 catalog diff |
| L-translate | 集成 | 编辑 | L-extract；消费新消息 | 新消息中英文翻译 | 仅允许 msgstr 补充；语义审查 |
| L-stability | 集成 | 生成 | L-translate；验证生成稳定 | 重复提取稳定证据 | 同一生成入口；无新结构漂移 |
| F-format | 集成 | 格式化 | F-edit、L-stability；输入齐备 | 集成产物规范化 | 集成测试及 catalog；限定格式检查 |
| F-verify | 集成 | 验证 | F-format；消费最终状态 | 静态、构建和五文件聚焦验收证据 | 已列入口；有效通过结果及层级记录 |
| F-review | 集成 | 审查 | F-verify；消费最终 diff 与证据 | 最终独立审查结论 | 设计范围完整，无未闭合问题 |
| F-stage | 集成 | stage | F-review；消费最终产物 | 集成 staged 快照 | catalog、集成测试 allowlist |
| F-commit | 集成 | commit | F-stage；消费 index | 独立集成提交 | commit id 与最终文件集合 |
| Z | 无 | fan-in | F-commit；全部产物稳定 | 完成汇总 | 所有票据、修正提交和最终验证齐备 |

没有新消息时 L 节点以明确的无生成必要证据完成，不运行无意义写入。修正按问题归属新增独立节点；已经提交的修正另建提交，禁止 amend。

### 调度与共享工作树

实施授权后的初始 ready set 为 P。文档提交后仅 01-edit 就绪；01 稳定提交后 02-edit、03-edit、04-edit 同时就绪，分别写不相交目录与测试文件，且只读稳定共享装配。它们使用同一工作树，不创建独立写分支；Git index 由主代理统一管理。

共享工作树的全源检查、构建、语言提取会读取其他任务源码，必须取得相应读锁并等待在途写入稳定，不能拿正在变化的工作树当验证证据。三个编辑任务没有互相的硬依赖；相交资源只影响当次调度，释放后立即重算 ready set。若当前共享目录冲突抵消并行收益，记录具体路径、影响和复查条件，不写成永久串行边。

F-edit 与 L-extract 都等待完整任务提交集合，之后二者的写集合不同：前者写 e2e 测试，后者读取 src 并写 catalog，可以并行；F-format 汇合两者。最终测试与构建按端口和输出资源锁运行。

预计关键路径为文档门禁、01、后三项中的最长业务分支、共享语言闭环与最终验证；01 后 fan-out，最终 F-format fan-in。成本估计不改变完成标准。

## 提交与终止条件

实施前先独立提交设计、总计划和四份票据。每项业务票据各一个独立本地提交，最后语言与跨流程验证产物作为独立集成提交。任务 02/03/04 的物理提交顺序由就绪状态和 index 锁决定，不强加编号顺序；不 squash、不远程操作。

所有提交禁止混入不改变行为的代码重排，禁止 force 暂存忽略文件。文档若在实施时被 ignore 匹配，报告精确阻塞，不绕过保护。

计划以全部提交集成后的最终状态判定完成；中间提交不要求单独满足整份设计，不允许为中间状态添加临时兼容层或 fallback。所有必需任务、修正、语言稳定性和最终验证完成后结束本轮，不自行追加其他 Story。

完成报告应包含本地提交身份、实际验证范围、验收层级、实际并行及资源冲突处理。当前仅落盘计划，未执行上述节点。
