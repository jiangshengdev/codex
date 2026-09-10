# Codex GUI interrupt 权威契约校验实施计划

日期：2026-09-10

状态：设计已确认；用户已授权计划落盘。本计划及任务拆分待确认，尚未实施、暂存或提交。

设计依据：[interrupt 权威契约校验设计](../../../../specs/2026/09/10/2026-09-10-codex-gui-interrupt-validator-design.md)。关联问题：QR-B09-003。

## 任务拆分草案

### 01：中断恢复使用自身权威校验器

**交付行为：** 合法持久化中断记录按 interrupt 自身协议恢复，非法记录被拒绝，不再受 steer 校验规则影响；保持现有恢复状态及额外字段处理。

**Blocked by：** None；无其他 ticket 阻塞。执行仍须通过本计划确认与文档独立提交门禁。

**Status：** 待用户确认拆分，未发布。

- [ ] 权威协议机械生成专属校验器及类型声明，解码器直接消费。
- [ ] 三处中断参数均被校验；缺字段、错误类型和领域约束冲突仍被拒绝。
- [ ] 额外字段仍被接受并丢弃，失败不覆盖已有状态。
- [ ] `issuing → unknown`、恢复暂停、无自动发送与无重复中断保持不变。
- [ ] 生成稳定性、相关回归、格式、lint 与类型检查通过。
- [ ] 实施内容形成独立本地提交，文档位于此前的独立提交。

一个任务贯穿生成清单、生成产物、恢复消费者和验证，范围足够小，无需预重构。拆为生成器和消费者两个 ticket 会制造不能独立交付用户结果的水平切片。此次不采用兼容层或 expand–contract。

## 精确修改范围

以下路径均相对于项目根；本节是执行 allowlist，区别于上面的 ticket 摘要。

- 文档提交：本计划及其链接的设计文档。
- 人工产品修改：`codex-gui/src/features/guiHost/appServerProtocol.ts`、`codex-gui/src/features/composerInputQueue/composerInterruptState.ts`。
- 人工测试修改：`codex-gui/src/features/composerInputQueue/__tests__/composerLanePersistence.test.ts`。在已有持久化测试入口补充参数、领域约束和失败原子性断言，不新增生产测试接口。
- 生成器完整输出边界：`codex-gui/src/generated/appServerProtocol/**` 与 `codex-gui/src/generated/guiHostContract/**`。只暂存实际发生且审查通过的变化，不强制暂存 ignored 文件。
- 既有恢复测试和生成器测试仅运行，不预先授权无关修改。
- 不修改 Rust、协议源、锁文件、package scripts、UI 或其他质量问题；不创建 worktree，不操作远程，不安装组件。

## 生成合同

输入 owner 为已有 Rust 协议及其 JSON schema、TypeScript 产物；GUI 辅助 schema 清单选择 `v2/TurnInterruptParams`。现有 CLI 从 app-server 和 GUI-host 权威 schema 读取输入，生成运行时校验器及配套类型与协议产物。

唯一生成入口为 GUI 的 `protocol:generate-validators`。不得手改生成物。人工补充仅限上述产品和测试文件。首次生成审查两组完整 diff；人工修改结束后再生成一次，验证输出稳定，并运行 `protocol:check-validators`。不能因文件属于 generated 就接受全部变化，也不能以预计 hunk 或行数限制机械生成结果。

输出超出边界、出现无关协议语义变化、生成不稳定或输入 owner 不明时，暂停受影响节点，先查明原因；需扩大范围时再请求授权。

## 验证入口与执行预检

已只读核对 package scripts、生成 CLI、Node 模式 Vitest 配置和 CI 入口。fnm 下 pnpm 可执行，当前返回 `10.34.5`；实施前必须重新检查 Node/pnpm 来源、依赖和 schema 是否完整，不能仅依赖这次版本输出。缺失工具由用户安装。

以下命令在 `/Users/jiangsheng/cnb/codex/codex-gui` 执行，统一前缀为 `/opt/homebrew/bin/fnm exec --using-file pnpm run`：

- 生成：`protocol:generate-validators`。
- 一致性：`protocol:check-validators`。
- 定向回归：`test:unit src/features/composerInputQueue/__tests__/composerLanePersistence.test.ts src/features/composerInputQueue/__tests__/composerCoordinatorRecordCodec.test.ts src/features/composerInputQueue/__tests__/composerInterruptSnapshotPersistence.test.ts src/features/composerInputQueue/__tests__/composerInputQueueCoordinatorInterruptDelivery.test.ts scripts/protocolValidators`。
- 最终静态检查：`format:oxfmt`、`lint`、`type-check`。必须实际收集预期测试，不能以零测试成功替代验证。

若格式检查报错，先核对项目 formatter 的定向参数，以现有 oxfmt 入口限定修改文件修复，再运行非 fix 检查；禁止为格式化全项目而带入无关 diff。纯前端与文档不触发仓库 `just fmt`。

测试验证外部持久化恢复行为；保留原有断言和错误传播，不为通过检查放宽规则。当前合法行为测试可能在旧实现上也通过，这是契约依赖问题的性质；不捏造功能红灯。依赖替换通过生成链、类型检查和代码审查验证。

Level 1 适用，以上为待执行范围。Level 2、Level 3 不适用，本次没有可见 UI 或系统桌面变化。禁止以自动化结果声称已经执行真实 GUI 验收。

## 描述式执行 DAG

节点继承以下公共字段，并由下表覆盖差异：

- `owner`：主代理；该任务小且共享生成与消费者状态，由一个实现 owner 完成。
- `executionContext`：`/Users/jiangsheng/cnb/codex` 当前 `dev` 工作树及其实际 Git index；执行前核验分支与现有改动。无 worktree/branch 创建及集成动作。
- `authorizationGate`：目前全部 implementation 节点为 pending，等待用户确认计划。确认后由 action-authorization 按节点动作与精确范围建立最小能力信封；禁止将本次落盘授权视为实现授权。
- `readSet`：相关设计、计划、适用规则、上述 allowlist、生成权威输入及相关测试与配置。
- `writeSet` / `stateEffects`：只取下表声明的文件或状态；测试和检查自身产生的常规缓存允许，无外部通信。
- `resourceLocks`：文件读写锁按上述根目录下实际 canonical 文件身份取交集；生成节点独占两个输出目录，验证时读取稳定文件；stage/commit 独占实际 Git index。执行前解析真实路径，不以逻辑别名绕过冲突。
- `subdelegation`：false。当前无需子代理编辑或新增独立审查任务。
- `deferralEvidence`：无。只有一个完整交付任务，不为增加并行而制造节点。
- `failureDomain`：失败节点及其真实依赖后继；计划内问题修正后只重跑失效验证，不无依据扩大失败域。
- `replanTriggers`：目标、产品行为、写集合、生成输入或授权边界发生实质变化时重新判断；已授权范围内失败按执行图契约吸收并闭环。
- `verification`：消费本计划验证入口；节点完成条件以下表证据为准。

| nodeId | taskBoundary / operationKind | hardPredecessors 与原因 | consumes / produces；outcome 与 completionEvidence | writeSet / stateEffects；commandScope | estimatedCost |
| --- | --- | --- | --- | --- | --- |
| D1 | 文档 / stage | 无；等待计划确认 | 已确认设计与计划 → 精确暂存文档；staged diff 无越界且检查通过 | 仅文档对应 index 条目；定向 git add、staged diff/check | 小 |
| D2 | 文档 / commit | D1；消费审查后的 index | 文档 index → 独立本地文档提交；记录 commit id | index 与本地提交；git commit，禁止 amend | 小 |
| E1 | 01 / 编辑 | D2；实施前文档提交门禁 | 权威类型与设计 → 清单、decoder、持久化测试修改；完整 diff 符合范围 | 三个人工文件；普通内容编辑，禁止附带顺序整理 | 小 |
| G1 | 01 / 生成 | E1；消费新增 schema 选择 | 输入与清单 → 完整生成产物；两次生成稳定且 diff 审查通过 | 两组输出目录；既有生成入口，重复生成比较 | 小 |
| F1 | 01 / 格式化 | G1；生成与人工源码已稳定 | 待验证变更 → 格式合规产物；非 fix 检查通过 | 仅 allowlist 内需修正文件；项目定向 formatter | 小 |
| V1 | 01 / 验证 | F1；消费最终稳定源码与产物 | 合并状态 → 生成一致性、定向回归、lint、类型检查证据；所有适用检查通过 | 常规工具缓存；上述验证入口 | 中 |
| S1 | 01 / stage | V1；提交须消费通过验证的状态 | 完整已验证 diff → 精确暂存 task 01；staged diff/check 通过 | 仅实际修改 allowlist 条目的 index；定向 git add | 小 |
| C1 | 01 / commit | S1；消费审查后的 index | task 01 index → 独立本地实现提交；记录 commit id 与提交内容 | index 与本地提交；git commit，禁止 amend | 小 |

初始 ready set：计划确认后为 D1。关键路径为文档提交、人工修改、生成、格式、最终验证、任务提交。无 fan-out 分支；V1 为本任务源码、产物与测试证据的汇合点。最终状态只有一个实现路径，无需保持中间未生成状态可编译。

本计划的并行判断基于一个有界小改动及共享产物，未使用文件数量、行数或历史并发阈值作为停止依据。若执行中出现独立且有价值的新节点，按执行图契约和最小能力信封重新调度。

## 提交与完成边界

计划确认后先执行文档独立提交，再实施。实现提交只包含本任务生成、调用替换及必要测试，不夹带无行为顺序调整。后续对已提交内容的修正必须另建提交，不 amend。

全部必要节点、最终验证和计划内修正完成后结束本轮，不在完成后自行追加新一轮审查或修复。最终汇报提交、验证结果、实际并行、关键路径和未启动 ready 节点。运行状态在对话执行上下文维护，不回写本计划正文。

## Tracker 状态

本文件是已授权落盘的实施计划及 ticket 拆分草案，不是已发布 ticket 集合。未配置 tracker，未创建 `.scratch` 文件、远程 issue 或标签；若后续需要发布，按 `to-tickets` 提示先运行 `/setup-matt-pocock-skills`。发布仍须遵守项目目录和远程操作限制。
