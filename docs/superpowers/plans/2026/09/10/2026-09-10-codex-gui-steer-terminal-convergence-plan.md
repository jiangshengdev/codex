# QR-B09-004：steer 响应与终态乱序收敛实施计划

日期：2026-09-10。工作目录：`/Users/jiangsheng/cnb/codex`。当前分支：`dev`。

设计：[steer 响应与终态乱序收敛设计](../../../../specs/2026/09/10/2026-09-10-codex-gui-steer-terminal-convergence-design.md)。

状态：用户已回复“确认，开始实现”并指定 implement，确认历史数据规则及本计划的两项交付，授权在当前分支实施、验证、独立审查和本地提交。Tracker 发布不属于本轮。

## 目标和已确认边界

- accepted 与 terminal 顺序不再使无 commit 的 steer 长期滞留。
- 保留本地停止的手动恢复、非本地终态的既有调度规则及消息优先级。
- 用户选择 A：一次“继续发送”只覆盖操作时恢复区内的消息；晚到确认的本地停止消息需再次手动恢复。
- unknown 不凭裸 terminal 自动重发；已 commit 不重复消费；精确匹配 thread、turn、client ID、claim 与 generation。
- 复用 coordinator 的公开操作、projection 事件和持久化入口验证，不新增测试专用生产接口。
- 不修改 Rust、TUI、协议生成链、依赖或 UI 文案，不新增按钮，不混入代码重排；不操作 Git 远程，不安装工具或构建后端。

## 计划前证据摘要

| 字段 | 当前证据及影响 |
| --- | --- |
| 权威入口 | Rust 生成的 TurnSteerResponse 和 projection 通知由现有 GUI command/event 入口进入 coordinator；本次只改变 GUI 领域状态。 |
| 已追踪链路 | coordinator performSteer → settleSteer → queue → steer lane；terminal → interrupt 分类 → queue 处置；queue prepare/adopt → 序列化校验 → 存储提交 → 发布与发送效果；恢复 UI 消费 coordinator snapshot。 |
| 修改范围 | steer lane 保存 closedTargets，但不保存中断归属；queue 消费 local/nonLocal 后清空 preparedInterruptedTurnId；coordinator 拒绝第二个 recovery batch，因此需统一目标处置和恢复 owner 汇合。 |
| 验证映射 | 现有 coordinator steer delivery、interruption recovery、record codec、persistence 测试；AppPendingInputRecovery 浏览器入口覆盖真实应用组件连接到队列的可见结果。 |
| 排除项 | 后端输入接收契约不变；TUI 的中断恢复实现不改；现有 Browser Mode 配置、共享协议生成器及通用 storage envelope 不因本次自动升级。 |
| 剩余未知 | 历史处置缺失的手动恢复规则已确认，owner 闭包已完成。非关键：真实运行时完整竞态尚未复现，不能以合成序列替代，按场景单独记录。 |

证据锚点：steer lane 的 settleAccepted、terminal、exportState、rehydrateState、adopt；queue 的 applyInterruptedDisposition、settleSteer、prepare；coordinator 的 persistTransaction、runEffects、recoverImpl；browserPersistenceStore 的 commit。调查基线为 4368fba1b；执行前重新核验当前 HEAD 与工作区，禁止覆盖其他任务变更。

## 历史数据门禁

当前通用 envelope、coordinator record、queue payload 各自为 version 1；steer lane 没有独立版本。历史 closedTargets 只有 reason/rejectionBatch。已消费 interrupt 的 recentTerminals、当前 snapshot 和 recovery 是否为空均不能无损补出停止归属。

直接拒绝旧 queue payload 会进入现有 persistenceError/restoring 屏障，且 storage commit 先读取旧记录，单纯重试不能解决不支持版本。因此不能把版本升级加严格拒绝写成无用户影响的技术调整。

**已确认规则：** 允许一次性迁移。可匹配 commit 的 pending 消息按事实清理；交付未知继续保留，不自动发送；已确认接收但终态归属缺失的历史消息，进入手动恢复流程。迁移不伪造 local/nonLocal，不删除旧消息，不默认允许自动发送。校验并成功提交后只输出新格式，运行态只保留一个状态模型；失败保留原始存储。

关联 owner 闭包已核验：queue 的 ownership 校验完整覆盖 queued/pending/rejected、start 的 rejectedSteerMerge transfer、steer recovery transfer 和 userStopped rejected transfer。全部目标记录保留；已转移消息维持既有 owner 和用户恢复路径。queue payload 升至 version 2；仅在解码边界补入旧终态的手动恢复处置，不在 codec 中提前移动 accepted 或改变 issuing。恢复 snapshot 先匹配 pending 的精确 commit，再收敛无 commit 的 accepted；不能扩大为对历史已转移消息的推断清理。非法记录保留原数据并显式报错；临时写入失败可通过既有入口重试。通用 envelope 与 coordinator 外层版本不变。

## 已确认交付拆分

以下是已确认的本地实施拆分，不是已发布 tickets。每项都交付用户可观察的完整场景，内部包括状态、持久化和测试；不按“类型／状态机／UI／测试”横向拆票。

### 01：终态乱序下正确处理当前消息

**Blocked by：** 无其他 ticket；先独立提交工作文档。

**交付：** 新记录及当前会话在两种响应顺序下正确收敛；本地停止进入或扩充单一恢复区，原恢复区消费后的晚到消息再次等待手动恢复；非本地终态按既有排序推进；新记录跨重连和刷新仍保留同一规则。

验收：

- 两种顺序对同一有效 claim 产生相同的最终归属规则，无永久 pending。
- 三种本地恢复状态均覆盖：已有恢复区、从未形成恢复区、原恢复区已消费。
- 无重复 owner、无未知交付自动重发；普通消息与 rejected 消息顺序和发送屏障保持。
- 新目标处置语义能 round-trip；事务失败不提前发布或发送，重试不重复消费。
- 应用层可见恢复计数与“继续发送”操作反映同一 coordinator 状态。

本票替换目标处置记录和消费者时直接切换，不新增临时双写或 fallback。旧记录的最终可恢复性由 02 完成；01 不作为整个计划已完成或可发布的声明。

### 02：安全恢复升级前保存的消息

**Blocked by：** 01，消费其稳定的新目标处置模型、恢复 owner 汇合能力和序列化格式。

**交付：** 用户升级后仍能处理可迁移的已有待发送内容，历史停止归属缺失不会被猜成自动发送许可；临时存储失败保留数据并按既有入口重试。不可迁移记录保留原数据并显式阻塞，不能承诺单纯重试即可解决；不在本轮新增破损数据修复工具。

验收：

- 已 commit、交付未知、已确认但终态归属缺失的消息分别按事实处理。
- 历史消息和新消息可在同一恢复流程下保持内容、附件、次序和唯一归属。
- 旧格式在解码边界转换为唯一新模型，新写入仅采用新格式，不保留两套运行态实现。
- 迁移、存储失败和重试均不删除原始记录、不重复发送、不绕过 restoredPaused。
- 有旧数据的应用启动和恢复交互通过公开入口及浏览器回归。

不额外拆纯 prefactor 票：当前证据没有要求独立重构；普通源码变更直接服务两个完整用户场景。

## 实施文件范围

以下路径相对 `codex-gui/`，只用于实施计划，不进入 tracker ticket 正文。

生产修改候选白名单：

- `src/features/composerInputQueue/composerSteerQueueState.ts`：扩展现有 closedTargets 为唯一处置来源，合法 accepted 复用目标收敛规则；覆盖 export/rehydrate/adopt。
- `src/features/composerInputQueue/composerInputQueue.ts`：传递已确认处置语义，汇合恢复 owner，按目标而非当前 turn 调度；管理 queue payload 版本及对应恢复语义。
- `src/features/composerInputQueue/composerInputQueueCoordinator.ts`：在已有持久化事务中消费恢复汇合结果，保持单一 recovery batch、发送屏障和失败传播。
- `src/features/composerInputQueue/composerInputQueueContracts.ts`：仅必要的 GUI 领域结果或恢复契约，不镜像服务端协议。
- `src/features/composerInputQueue/composerCoordinatorPersistence.ts`：在确有需要时连接获确认的 queue 迁移路径，保持完整校验后采用候选状态。

定向测试白名单：

- `src/features/composerInputQueue/__tests__/composerInputQueueCoordinatorSteerDelivery.test.ts`
- `src/features/composerInputQueue/__tests__/composerInputQueueInterruptionRecovery.test.ts`
- `src/features/composerInputQueue/__tests__/composerSteerQueueState.test.ts`
- `src/features/composerInputQueue/__tests__/composerLanePersistence.test.ts`
- `src/features/composerInputQueue/__tests__/composerInputQueuePersistence.test.ts`
- `src/features/composerInputQueue/__tests__/composerCoordinatorRecordCodec.test.ts`
- `src/features/composerInputQueue/__tests__/composerCoordinatorPersistence.test.ts`
- `src/__tests__/AppPendingInputRecovery.browser.test.tsx`

共用 fixture 只读复用；若实施必须扩展 shared projection builders，先明确新增写入范围再确认，不在各测试中复制权威协议对象。既有恢复 UI、browserPersistenceStore、liveActiveThreadSession、协议产物为只读消费者证据；实际发现必须修改时重新核对范围。

文档写范围：本设计、本计划，以及后续执行报告 `docs/superpowers/reports/2026/09/10/2026-09-10-codex-gui-steer-terminal-convergence-execution.md`。tracker 未配置，不创建 `.scratch` tickets、不修改或关闭原问题记录。

## 描述式 DAG 与资源契约

本节是执行结构；ticket 编号只代表产品任务与提交边界，不代替节点依赖。用户已授权实施；节点仅在稳定产物前置满足后进入 ready。

公共节点字段（每行节点继承，列出的差异覆盖）：

- executionContext：现有 `/Users/jiangsheng/cnb/codex`、`dev`、当前 Git index；不创建 worktree 或分支。全部 Git 写入由主代理独占。
- owner：主代理负责编辑、验证、stage、commit；独立审查由只读子代理负责，禁止其写文件或 Git index。
- readSet：本设计、计划、生产白名单、对应测试及直接只读消费者、适用 AGENTS/skills；writeSet 按节点行收窄。
- resourceLocks：生产或测试路径写入时锁其 canonical 文件；测试 runner 锁 `/Users/jiangsheng/cnb/codex/codex-gui` 的测试运行状态；Git 写入锁当前 `git rev-parse --git-path index` 解析出的 canonical index。只读审查消费稳定快照。
- commandScope：调查使用 rg/cat/sed 与本地只读 Git；编辑使用普通源码 patch 或安全限定目标的项目自动工具；验证只使用下节入口；stage/commit 仅对应任务白名单，不 force、不 amend、不操作远程。
- stateEffects：编辑仅作用于指定文件；测试仅产生获授权程序的常规运行产物；Git 写仅对应阶段的 index 和本地新提交。
- subdelegation：false。estimatedCost：编辑为中，定向验证与审查为小至中，最终 ci 为中；不以成本作完成门禁。
- deferralEvidence：无；硬前置或资源冲突足以说明当前调度，不添加“同一方向”等伪依赖。
- authorizationGate：active；grantSource 为用户“确认，开始实现”与 implement 的本地提交要求。每个实际节点继承本节边界并按其 operationKind 收窄，返回后能力到期。
- failureDomain：本节点产物及消费它的后继；不影响不相交且仍有授权的节点。replanTriggers：新用户语义、写范围扩大、必要工具缺失或已证实的协议/存储前提变化；计划内失败按执行图契约修正，不能放宽检查。
- verification/completionEvidence：编辑以稳定 diff 和范围核对作为完成证据；测试以明确目标收集与预期结果作为证据；审查返回问题及来源；提交提供 commit id 和 staged allowlist 核对记录。

| nodeId | taskBoundary / operationKind | outcome；consumes → produces | hardPredecessors（原因） | writeSet / verification |
| --- | --- | --- | --- | --- |
| D0 | 文档 / stage | 已确认设计和计划 → 仅这两份文档的 index 差异 | 整体计划与历史规则确认 | 两份文档的 index；检查 staged diff |
| D1 | 文档 / commit | D0 index → 独立文档提交 | D0，消费审核过的 index | 本地 Git；记录 commit id |
| R1 | 01 / 编辑 | 设计验收 → 01 正式回归用例 | D1，实施前文档提交门禁 | 01 对应测试文件 |
| V1 | 01 / 验证 | 新回归用例 → 精确命中原缺陷的失败证据 | R1，用例已存在 | runner；非零只有预先规定的缺陷断言失败才符合本节点预期 |
| E1 | 01 / 编辑 | 原因与失败证据 → 当前消息完整收敛实现 | V1，消费正式回归失败 | 生产白名单及必要同票测试；不写 02 专属旧格式迁移 |
| T1 | 01 / 验证 | E1 稳定 diff → 定向测试通过 | E1 | runner；定向 unit、应用 browser 回归及类型检查 |
| S1 | 01 / stage | 通过的 01 产物 → allowlist index | T1 | index；禁止夹带未完成 02 变更 |
| C1 | 01 / commit | S1 index → 01 独立提交 | S1 | 本地 Git；不得 amend |
| R2 | 02 / 编辑 | C1 新格式与已确认迁移规则 → 旧数据验收用例 | C1，消费稳定格式及共享文件写入结果 | 02 persistence/codec/browser 测试 |
| V2 | 02 / 验证 | R2 → 旧数据恢复缺口失败证据 | R2 | runner；不能用配置错误代替目标失败 |
| E2 | 02 / 编辑 | 失败证据与迁移规则 → 旧数据恢复完整路径 | V2 | 生产白名单中的 codec/queue 及必要测试 |
| T2 | 02 / 验证 | E2 → 旧数据与新消息组合通过 | E2 | runner；定向 unit/browser 回归 |
| S2 | 02 / stage | T2 产物 → allowlist index | T2 | index |
| C2 | 02 / commit | S2 index → 02 独立提交 | S2 | 本地 Git |
| F1 | 无提交 / 审查 | C1+C2 → 独立的设计、所有权及范围审查 | C2，消费最终稳定实现 | 无；只读子代理 |
| F2 | 无提交 / 验证 | C1+C2 → 最终 ci 和定向 browser 证据 | C2，消费最终稳定实现；与 F1 无依赖 | runner；下节最终入口 |
| F3 | 无提交 / 验证 | 最终实现与合法真实状态 → 分场景 Level 2 证据或精确未执行原因 | C2；当前完整 URL 与实际运行态另作前置 | 无头运行状态；不制造后端拒绝或修改用户数据来凑竞态 |
| J1 | 无提交 / fan-in | F1/F2/F3 → 完成或证据缺口汇总 | F1、F2、F3，汇合独立结果 | 无；有计划内问题则派生修正与复验节点 |
| L1 | 执行记录 / 编辑 | J1 → 结果、修正、验证与提交记录 | J1 | 上述执行报告 |
| L2 | 执行记录 / stage | L1 → 报告 index | L1 | index |
| L3 | 执行记录 / commit | L2 → 独立执行记录提交 | L2 | 本地 Git |

初始 ready set 为 D0。关键路径是文档提交、01、02、最终汇合。F1 与 F2 在稳定代码上并行；F3 的可用运行态准备不依赖审查结果，其实际浏览器运行与其他 browser runner 按资源冲突调度，不人为添加产品依赖。

01 与 02 串行的依据是 02 消费 01 的新格式及恢复 owner，并写入相同 queue/codec；不是按编号串行。没有 worktree 预配、cherry-pick、merge 或远程动作。独立审查若发现遗漏须在最终完成前修正；已有提交的修正均另建提交，不能 amend 或追加兼容旧新并行实现。

计划期只读独立审计已核对 01/02 的产物依赖、单一实现约束及迁移门禁：未发现伪依赖；已修正“所有迁移失败均可重试恢复”的过度承诺。用户已确认迁移语义，实施前只读审计已完成关联 owner 闭包。

## 验证入口与预检

计划编写时已只读核验：fnm 的 Node v24.17.0、pnpm 10.34.5 位于用户 fnm 安装目录；node_modules 与 vitest/oxfmt/tsc/playwright 入口存在；三种浏览器缓存目录存在。未执行测试，也未据缓存存在宣称浏览器可运行。package.json 是脚本权威入口，unit 配置排除 browser 用例，parallel browser 配置可收集 AppPendingInputRecovery，shared 配置明确 headless: true。

下列命令 cwd 均为 `/Users/jiangsheng/cnb/codex/codex-gui`；实施前复核必要输入和实际收集，不安装缺失组件。

定向 unit：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit src/features/composerInputQueue/__tests__/composerInputQueueCoordinatorSteerDelivery.test.ts src/features/composerInputQueue/__tests__/composerInputQueueInterruptionRecovery.test.ts src/features/composerInputQueue/__tests__/composerSteerQueueState.test.ts src/features/composerInputQueue/__tests__/composerLanePersistence.test.ts src/features/composerInputQueue/__tests__/composerInputQueuePersistence.test.ts src/features/composerInputQueue/__tests__/composerCoordinatorRecordCodec.test.ts src/features/composerInputQueue/__tests__/composerCoordinatorPersistence.test.ts
```

应用集成 Browser Mode：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:parallel src/__tests__/AppPendingInputRecovery.browser.test.tsx
```

定向类型检查和最终门禁：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
/opt/homebrew/bin/fnm exec --using-file pnpm run ci
```

每票按对应测试子集验证；最终 ci 已含全量 unit、类型、格式、lint、validator check 与 browser smoke，不重复无变化的全量检查。应用 browser 回归不属于 smoke，需明确单独执行。formatter/lint 修正优先用项目原生工具并限定本票文件，修正后用非 fix 检查；不得直接运行会修改范围外文件的全目录 fix。

本次无协议生成、Lingui 提取、后端构建或 Rust 验证任务。Level 2 使用当前真实 URL 和无头浏览器，仅在合法状态和授权具备时进行；缺真实竞态不得诱发 Guardian 拒绝、篡改生产存储或伪造真实通知。分别记录“真实恢复交互”和“完整竞态”的结果，未执行不等于通过。Level 3 不适用。

## 提交与完成条件

计划确认后先独立提交设计和计划；随后每票一个本地行为提交，最终修正另立提交，执行报告独立提交。主代理唯一持有 index 写权限，逐次只暂存已核验的任务文件；被 ignore 的文件不 force 暂存。

全部任务和计划内修正完成、最终结果满足设计且验证边界已如实记录后才汇报实现结果。适用验收缺失时不能宣称完整验证；不把单个中间提交是否完整满足全计划作为停止条件。实现目标闭环后终止本轮，不自动扩大到新一轮复审任务。

## Tracker 发布边界

按 to-tickets，须先由用户审阅粒度和阻塞边，再发布每票。当前 tracker 未配置，需运行 `/setup-matt-pocock-skills`；不自动将本计划当作合并 ticket，也不擅自选择本地 `.scratch` 或外部 tracker。

本地 tracker 若后续获明确配置，按每票一文件及其模板发布；真实 tracker 则使用原生阻塞关系及 ready-for-agent 标签。发布仍须核对目标和适用授权。本计划不修改、关闭任何 parent issue。
