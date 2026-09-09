# QR-B06-001 实施计划

日期：2026-09-09。状态：计划已落盘，待用户确认任务切分与执行；未开始实现。

设计依据：[已确认设计](../../../../../specs/2026/09/09/2026-09-09-codex-gui-qr-b06-001-design.md)。

## 任务切分

只有一个行为任务：[01：中途订阅协作活动完整恢复](./01-collab-activity-recovery.md)。它贯穿快照恢复、重放分类、完成更新与回归测试。`wait` 和 `resumeAgent` 共用机制，不拆为两个重复改动的任务；本次无必要的前置重构，不引入临时兼容路径。

任务没有其他功能 ticket 阻塞。执行前仍需用户确认本计划，并将相关设计、计划及 ticket 建立为独立本地文档提交。任务内部验证与审查节点不是额外功能 ticket。

## 证据与修改范围

| 字段 | 当前核验结论 |
| --- | --- |
| 权威入口 | `@codex-protocol/v2` 从 app-server-protocol 的生成 TypeScript 契约解析；ActiveThreadMemberLifecycle 在 attach 和恢复路径创建 ActiveThreadProjection。 |
| 已追踪链路 | ProjectionIngressAdapter 保持 thread/subscription/commit 连续性；ActiveThreadProjection 分类 replay，经 read-model 进入 transcriptProjection 与 snapshot builder；相同条目由既有 upsert 更新。 |
| 修改范围 | activeThreadProjectionReplay 的生命周期覆盖判断；transcriptItemPolicy 与 transcriptStateImplementation 的进行中快照展示；对应跨模块回归与共享合法 fixture builder。 |
| 验证映射 | 从 createActiveThreadProjection 的真实分类输出经 read-model 到 transcript selectors；沿用现有 unit 测试入口，并执行项目 ci 与真实无头验收。 |
| 排除项 | queue observation 对 itemCompleted 返回 null；live session owner 对 itemCompleted 不更改 activeTurnId；compaction 仅处理自己的条目类型。保留这些消费者，禁止泛化修改全部事件的 replay。协议、生成物、后台执行和界面组件不需改动。 |
| 剩余未知 | 执行时当前 GUI URL、可用 runtime 及可控 wait/resumeAgent 实际状态需现场核验。它们不改变静态修复范围，但会阻塞缺少条件的 Level 2 验收和完整验证声明。 |

本计划中源码路径均相对 `codex-gui/`。允许行为编辑范围：

- `src/features/activeThreadSession/activeThreadProjectionReplay.ts`
- `src/features/transcriptState/transcriptItemPolicy.ts`
- `src/features/transcriptState/transcriptStateImplementation.ts`
- `src/features/activeThreadSession/__tests__/activeThreadProjection.test.ts`
- `src/features/transcriptState/__tests__/transcriptStateReplayDedup.test.ts`
- `src/features/transcriptState/__tests__/transcriptCollabAgentItemPolicy.test.ts`
- `src/features/transcriptState/__tests__/transcriptStateCommittedActivity.test.ts`
- 可新增该 transcriptState 测试目录内的 `transcriptStateCollabAttach.test.ts`，承载生产分类到 selector 的完整场景。
- 只有现有共享 builder 无法表达合法场景时，扩展 `src/features/projection/__tests__/projectionTestBuilders.ts`。

不修改 Rust、生成类型、锁文件、翻译、组件样式或其他问题。协议类型必须直接消费或机械派生，不能复制状态枚举。只修复生命周期去重，不取消真正重复事件的幂等处理。不夹带代码顺序调整；确有独立非行为重排需求时另设提交并说明依据。

## 验证入口

已读取 live package.json、Vitest 配置和 GUI CI workflow：CI 运行 `pnpm run ci`；unit 配置收集普通 `.test.ts`，排除 browser 与 E2E 测试。fnm 环境已核验 Node v24.17.0、pnpm 10.34.5，pnpm 位于用户 fnm runtime，不是 Codex shim。执行前重新核验工具、输入、当前分支与实际测试收集。

工作目录固定为 `/Users/jiangsheng/cnb/codex/codex-gui`：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit src/features/activeThreadSession/__tests__/activeThreadProjection.test.ts src/features/transcriptState/__tests__/transcriptStateReplayDedup.test.ts src/features/transcriptState/__tests__/transcriptCollabAgentItemPolicy.test.ts src/features/transcriptState/__tests__/transcriptStateCommittedActivity.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run ci
```

新增集成测试时将其实际路径加入定向 unit 命令，必须确认收集到目标场景。格式化使用项目 oxfmt owner，仅对实际变更文件运行限定范围的原生格式化，随后以非 fix 检查验证；不得用全目录自动修复带入无关修改。纯前端及 Markdown 不运行仓库 `just fmt`。

Level 1 必须覆盖两个工具的进行中 attach、成功/失败完成、重复完成、已完成快照重复通知，与持续订阅最终结果一致；检查条目原位更新、分页与隔离、不影响旧 chunk。跨模块场景不能手工指定 replay 结论。

Level 2 通过工具链规定的当前完整 GUI URL 与真实 runtime 无头执行，使用隔离的验收会话和无仓库写入的受控协作任务，不向现有业务会话发送消息。执行前确认可用入口、非 headed 状态及真实协作状态；记录 attach 前后和完成后的可见活动。没有真实可控状态时，不得用手造协议事件或 unit 测试代替；仅暂停相关验收，告知所缺条件。不得启动后端构建或安装任何组件，必要时由用户提供运行环境。

Level 3 不适用；不得启动可见浏览器。自动化与 Level 2 均通过才声明完整验证。

## 描述式执行 DAG

下表与公共字段共同构成节点记录，字段从公共声明继承；执行时按 delegating-micro-stages 的 execution-graph 契约编译，不将本计划改写为运行日志。

公共字段：

- `executionContext`：现有 `/Users/jiangsheng/cnb/codex` checkout，当前 `dev`，共享 `/Users/jiangsheng/cnb/codex/.git/index`；执行前重新确认。无新 worktree、无新 branch、无远程操作。
- `authorizationGate`：当前全部执行节点为 pending；用户确认计划后，由 action-authorization 分节点建立能力信封。授权仅覆盖本计划列明的编辑、验证、隔离验收会话、本地 stage/commit 和记录；无进一步委派权限。
- `subdelegation`：false。主代理可按本表创建一个只读独立审查子代理，子代理不得继续委派。
- `estimatedCost`：编辑与真实验收为中，其他为小。`deferralEvidence`：无；不得按任务编号额外串行。
- `readSet`：本设计、计划、适用 AGENTS/skills，以及节点所消费的源码、配置和验证输入；审查与测试读取同一稳定变更。
- `resourceLocks`：编辑/格式化对上述源码写集合持 write 锁；测试、审查对稳定源码持 read 锁；Git 节点独占上述 index；ci 独占当前 codex-gui runner；Level 2 独占本次隔离浏览器会话及其验收线程；文档写入仅由主代理拥有。
- `verification`：每个节点以表中 completionEvidence 为准，测试必须命中目标，不能以退出码代替场景证据。
- `failureDomain`：本节点及消费其无效产物的后继；测试或审查失败时保留另一独立分支的有效证据。
- `replanTriggers`：新增范围、产品行为、授权或运行环境风险；计划内失败先诊断、修正并仅重跑失效验证，不降低检查标准。工具缺失停止依赖动作，禁止自行安装。
- `owner`：除 R 为独立只读子代理外，均为主代理；主代理是唯一 Git index 和执行记录写 owner。

| nodeId | taskBoundary / operationKind | hardPredecessors 与原因 | consumes / produces；outcome 与 completionEvidence | writeSet / stateEffects / commandScope |
| --- | --- | --- | --- | --- |
| D-S | 文档提交 / stage | 无；仅在执行确认后 ready | 已确认设计、计划、ticket → 精确 staged diff；仅相关文档入 index | Git index；限定 git add 与 staged diff 检查，不含其他文件 |
| D-C | 文档提交 / commit | D-S：消费已审查 staged 内容 | staged 文档 → 独立文档 commit ID | Git 本地历史；普通 git commit，不 amend |
| E | T01 / 编辑 | D-C：文档须先独立提交 | 已确认设计与当前源码 → 功能和跨模块回归的完整 diff | 上述行为编辑范围；普通源码 patch，不生成或操作 Git |
| F | T01 / 格式化 | E：消费最终编辑集 | 完整 diff → 格式稳定的审查与验证输入 | 仅实际变更文件；项目原生 oxfmt 限定格式化；非 fix 检查 |
| V | T01 / 验证 | F：消费稳定源码 | 稳定实现 → 定向 unit 与 ci 成功、目标场景记录 | runner 正常产物；执行上述命令，禁止绕过失败 |
| R | T01 / 审查 | F：消费同一稳定源码 | 稳定实现及设计 → 独立审查结论，确认无未解决的范围内缺陷 | 空写集合；只读源码与 diff；不测试、不 stage、不提交 |
| L | T01 / 验证 | V、R：已满足自动化和审查后操作真实会话 | 通过检查的实现 → 两种协作活动的真实无头观察证据 | 本次隔离浏览器与验收会话运行状态；按 codex-gui-toolchain 和浏览器 skill 操作 |
| G | T01 / fan-in | V、R、L：汇合集成状态与全部适用验证 | 全部证据 → 满足设计的完成判定与执行记录 | 本主题目录下 execution-log.md；只记录当前证据，不改计划正文 |
| S | T01 / stage | G：全部验收与计划内修正完成 | 完整组合 diff → 精确 staged 内容 | index；只 git add 本任务实际变更与执行记录，检查 staged diff |
| C | T01 / commit | S：消费审查后的 index | staged 内容 → 独立功能 commit ID | 本地 Git 历史；普通 git commit；禁止 amend、远程和强制操作 |

执行确认后的初始 ready set 为 D-S；实际执行从文档提交到 E、F，再 fan-out 为 V 与 R，fan-in 后进入 L、G、S、C。关键路径为文档提交、实现、格式化、V/R 较慢分支、真实验收和功能提交。V 与 R 的源码只读可并行；源码修正会使对应证据失效，必须先结束读取再修改。仅一个行为任务，无需增加 worktree 的创建与集成成本。

## 提交、失败与完成边界

文档提交和行为提交必须分开；已有提交的修正形成新的独立提交。提交仅用精确文件 allowlist，禁止强制暂存 ignored 文件。当前 `dev` 上的 workspace version 必须保持 `0.0.0`，本计划不修改版本。

全部计划内问题和适用验证通过后结束本轮，不因之后的新复审自行追加一轮任务。Level 2 缺条件时可完成独立自动化与审查，但本任务仍不得宣称完整验证或整体完成。

执行记录维护节点实际开始/完成、锁、失败证据、修正与提交身份；结束报告包含实际并行、关键路径、未启动 ready 节点。缺少新证据时不盲目重复测试。

本轮只保存本地计划和一个待确认 ticket，不发布 tracker issue、不应用远程 triage 标签、不修改父问题。用户确认计划切分后才能执行；本次落盘不等于开始实现。
