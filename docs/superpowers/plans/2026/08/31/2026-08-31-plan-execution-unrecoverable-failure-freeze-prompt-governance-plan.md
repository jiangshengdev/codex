# 计划执行不可恢复失败冻结提示词治理实施计划

日期：2026-08-31

状态：已确认

确认日期：2026-08-31

确认原文：确认。开始进行

设计依据：

- `docs/superpowers/specs/2026/08/31/2026-08-31-plan-execution-unrecoverable-failure-freeze-prompt-governance-design.md`

计划分支：`dev`

计划时 Codex HEAD：`6cd5f82502ee18f250c5706882080d6e840143f8`

计划时 codex-config HEAD：`11207995735544338b702ea8e28402b179699cc6`

## 目标与执行期先行熔断

在用户维护的全局提示词与现有 owning skills 中实施已确认设计：普通可恢复小错误仍可在原计划边界内闭环；不可恢复失败立即冻结整个计划、所有后续工具调用和旧授权，原样保护现场，直到用户对新的动作和范围作出精确授权。

本计划一经确认并进入执行，即先行适用以下熔断，不等待目标提示词文件修改完成：任一节点或命令未达到预先声明的完成证据时，协调 owner 只能使用当时已有信息判断五项可恢复条件。若任一条件不能成立，立即冻结本计划；不得再调用工具、读取现场、发送子代理消息、修复、重试、清理、恢复、回滚、stage 或 commit。已经运行的操作只在明确安全时取消，否则自然返回。失败报告只使用已经取得的信息。

该先行熔断显式覆盖当前全局提示词和执行图中“连续闭环”“局部失败继续”“耗尽失败域外 ready 节点”等旧语义。

## 当前事实闭包

- `/Users/jiangsheng/.codex/AGENTS.md` 的 canonical target 是 `/Users/jiangsheng/cnb/codex-config/AGENTS.md`。
- `/Users/jiangsheng/.codex/skills/managing-work-stages` 与 `/Users/jiangsheng/.codex/skills/delegating-micro-stages` 分别解析到 `codex-config/skills/**` 下的用户维护目录；不是本次禁止修改的官方 skill。
- `delegating-micro-stages/references/execution-graph.md` 已由主 `SKILL.md` 明确指定为已落盘计划执行期节点状态、动态调度、失败域和终态行为 owner。
- 全局 `AGENTS.md` 当前第 38、41、46 行分别推动连续闭环、局部失败继续和计划内失败直接修正；执行图当前要求失败后重算 ready set、继续失败域外节点并在终态前耗尽相关工作。
- `managing-work-stages/references/read-only-and-exceptions.md` 已有调查期诊断测试持续保留规则；本次只需使计划内失败闭环语义服从新的不可恢复失败熔断，不得弱化该生命周期。
- `codex-gui/AGENTS.md` 仅拥有前端工具链、GUI 验收和前端工程约束；没有通用计划执行失败 owner，因此不进入修改范围。
- `codex-config` 当前分支为 `main`，计划时工作树和 index 均 clean。
- `/opt/homebrew/bin/uv` 当前为 `uv 0.12.5`；结构验证脚本存在于 `/Users/jiangsheng/.codex/skills/.system/skill-creator/scripts/quick_validate.py`。
- Codex 工作树现有两个用户恢复的 Composer 源码改动；它们不属于本计划，文档提交只允许 stage 本设计与本计划。

## 精确修改范围

预期写入 6 个 `codex-config` 文件：

- `/Users/jiangsheng/cnb/codex-config/AGENTS.md`
- `/Users/jiangsheng/cnb/codex-config/skills/delegating-micro-stages/references/execution-graph.md`
- `/Users/jiangsheng/cnb/codex-config/skills/delegating-micro-stages/references/delegation-contract.md`
- `/Users/jiangsheng/cnb/codex-config/skills/managing-work-stages/references/stage-gates.md`
- `/Users/jiangsheng/cnb/codex-config/skills/managing-work-stages/references/read-only-and-exceptions.md`
- `/Users/jiangsheng/cnb/codex-config/skills/managing-work-stages/references/execution-environment-preflight.md`

候选文件经实施前现场核验若无需改动，应从实际 write set 删除，不为覆盖清单制造修改。需要增加第七个文件时，本计划失效并冻结，不得自行扩大范围。

## 全局 `AGENTS.md` 拟写入的精确结果级规则

执行前必须向用户展示并对以下精确文本取得 `/Users/jiangsheng/.codex/AGENTS.md` canonical target 的独立 special approval：

> 已确认计划执行中出现不可恢复失败时，立即冻结整个计划和全部后续操作并保护现场；禁止继续检查、修复、重试、清理、恢复、回滚、生成、格式化、stage、commit 或调度任何节点。只有用户在失败报告后明确指定新的动作和范围，才可局部解除冻结；详细判定与在途操作语义由 `$delegating-micro-stages` 负责。

若实施时需要改变该文本的对象、触发条件、禁止动作、解除冻结条件或 owner，原 special approval 不再有效，必须返回设计或计划门禁。仅为融入现有段落而调整不改变语义的标点或连接词，也应重新展示最终精确文本后再取得 special approval，避免受保护目标的拟写内容漂移。

## 授权门禁

计划确认只授权创建并提交本次工作文档，不替代以下两个执行前确认：

1. `PROTECTED-AGENTS-AUTH`：展示上述全局规则的最终精确文本，取得面向 `/Users/jiangsheng/.codex/AGENTS.md` canonical target 的独立明确写入确认。
2. `EXTERNAL-WRITE-AUTH`：说明将修改 `codex-config` 的精确 6 文件候选集合、canonical targets、产生未暂存 diff、运行两个 skill 结构验证并创建一个本地 commit 的副作用，取得项目外主动改动的单独明确确认。

两个确认均成立前，任何 `codex-config` 编辑节点保持等待。普通“继续”、计划确认、设计确认或其中一个门禁的确认不能替代另一个门禁。

## 执行图节点

### 节点 `DOC-STAGE`

- `taskBoundary`：工作文档提交。
- `operationKind`：stage。
- `outcome`：Codex Git index 精确只包含已确认设计与本计划。
- `estimatedCost`：低。
- `deferralEvidence`：无。
- `hardPredecessors`：用户确认本计划；等待执行授权。
- `consumes`：设计文件、计划文件、Codex 工作树与 index 状态。
- `produces`：docs-only staged snapshot。
- `completionEvidence`：staged 文件集合精确为两份文档；`git diff --cached --check` 通过；两个 Composer 文件保持未暂存且内容 identity 不变。
- `readSet`：两份文档、Codex Git status/diff/index、两个 Composer 文件 identity。
- `writeSet`：`/Users/jiangsheng/cnb/codex/.git/index`。
- `stateEffects`：只 stage 两份工作文档。
- `commandScope`：精确 `git add -- <design> <plan>`、staged diff/check 与只读 identity 核验。
- `subdelegation`：禁止。
- `executionContext`：Codex `dev` 当前 worktree，共享主 index 独占写锁。
- `resourceLocks`：Codex `.git/index` write；两份文档 read。
- `owner`：Codex docs Git owner。
- `verification`：ignored research、Composer 改动和其他文件不得进入 index。
- `failureDomain`：任一不符合完成证据的结果按本计划先行熔断分类；不可恢复时冻结全图并保护现场。
- `replanTriggers`：index 原有 staged 内容、目标文档漂移、Composer identity 漂移。
- `authorizationGate`：计划确认后 active；不授权 commit。

### 节点 `DOC-COMMIT`

- `taskBoundary`：工作文档提交。
- `operationKind`：commit。
- `outcome`：创建仅包含设计与计划的独立本地 commit。
- `estimatedCost`：低。
- `deferralEvidence`：无。
- `hardPredecessors`：`DOC-STAGE`；等待经审查 staged snapshot。
- `consumes`：docs-only staged snapshot。
- `produces`：本地 commit `docs: plan unrecoverable failure prompt freeze`。
- `completionEvidence`：commit 文件集合精确为两份文档，index 为空，Composer 改动仍未暂存且 identity 不变。
- `readSet`：Codex staged snapshot、Git history/status。
- `writeSet`：Codex 本地 Git history。
- `stateEffects`：创建一个本地 docs commit。
- `commandScope`：精确 `git commit -m 'docs: plan unrecoverable failure prompt freeze'` 与只读提交核验。
- `subdelegation`：禁止。
- `executionContext`：Codex `dev` 当前 worktree，共享主 index/history 独占写锁。
- `resourceLocks`：Codex `.git/index` write、local history write。
- `owner`：Codex docs Git owner。
- `verification`：禁止 amend、squash、remote 或额外 stage。
- `failureDomain`：不可恢复失败冻结全图；不得清理 index 或恢复文档。
- `replanTriggers`：hook 产生范围外变化、staged snapshot 漂移。
- `authorizationGate`：计划确认后 active。

### 节点 `CONFIG-PREFLIGHT`

- `taskBoundary`：无提交的执行前调查。
- `operationKind`：调查。
- `outcome`：重新证明 codex-config canonical targets、branch/HEAD、clean baseline、适用规则、`uv`、`quick_validate.py` 和精确候选文件可用。
- `estimatedCost`：低。
- `deferralEvidence`：无。
- `hardPredecessors`：`DOC-COMMIT`；工作文档门禁已满足。
- `consumes`：live codex-config、symlink identity、工具来源和候选文件。
- `produces`：6 文件 baseline SHA-256、codex-config HEAD、clean index/worktree 证据和验证入口 identity。
- `completionEvidence`：branch 为 `main`；HEAD 仍为计划基线或经只读审查证明仅含不影响本计划的新增提交；worktree/index clean；所有工具与文件存在；canonical targets 与计划一致。
- `readSet`：codex-config Git 状态/history、6 文件、symlinks、`uv` 与 quick validator path。
- `writeSet`：无。
- `stateEffects`：只读进程状态。
- `commandScope`：只读 Git、`realpath`、`shasum -a 256`、`command -v uv`、`uv --version`、文件存在性与规则检查；不运行验证。
- `subdelegation`：禁止。
- `executionContext`：codex-config `main` 当前 worktree，无 index 写入。
- `resourceLocks`：6 文件 read；codex-config status/history read。
- `owner`：prompt-governance preflight owner。
- `verification`：任一基线、owner、工具来源或 canonical identity 不成立即未达到完成证据。
- `failureDomain`：预检失败若推翻入口、基线或证据可信度，按五项标准判为不可恢复并冻结全图；不得继续授权或编辑节点。
- `replanTriggers`：branch、HEAD、dirty state、symlink、validator 或文件范围变化。
- `authorizationGate`：计划确认后 active；只读。

### 节点 `PROTECTED-AGENTS-AUTH`

- `taskBoundary`：无提交的用户授权门禁。
- `operationKind`：授权。
- `outcome`：取得全局 `AGENTS.md` 最终精确拟写文本的 special approval。
- `estimatedCost`：用户交互。
- `deferralEvidence`：无。
- `hardPredecessors`：`DOC-COMMIT`；等待工作文档提交 identity。
- `consumes`：本计划中的精确拟写文本与 canonical target。
- `produces`：绑定文本、目标和本轮生命周期的 special approval id。
- `completionEvidence`：用户针对唯一展示的精确文本单独明确回复“确认”“确认写入”“确认允许写入”或等价直接授权。
- `readSet`：计划与授权记录。
- `writeSet`：无文件写入。
- `stateEffects`：更新对话内授权状态。
- `commandScope`：只展示确认点；禁止工具调用。
- `subdelegation`：禁止。
- `executionContext`：当前对话。
- `resourceLocks`：受保护授权 record write。
- `owner`：主协调 owner。
- `verification`：疑问、讨论、催促、一般继续或另一个确认均不成立。
- `failureDomain`：未确认保持等待，不是执行失败；文本变化使节点失效并返回计划门禁。
- `replanTriggers`：精确文本或 canonical target 变化。
- `authorizationGate`：用户完成本节点前 pending。

### 节点 `EXTERNAL-WRITE-AUTH`

- `taskBoundary`：无提交的用户授权门禁。
- `operationKind`：授权。
- `outcome`：取得项目外 codex-config 精确写入、验证与本地提交授权。
- `estimatedCost`：用户交互。
- `deferralEvidence`：无。
- `hardPredecessors`：`DOC-COMMIT`；等待工作文档提交 identity。
- `consumes`：6 文件候选范围、canonical targets、验证和 commit 副作用说明。
- `produces`：项目外修改授权 record。
- `completionEvidence`：用户对精确动作、目标和副作用作出单独明确确认。
- `readSet`：计划与授权记录。
- `writeSet`：无文件写入。
- `stateEffects`：更新对话内授权状态。
- `commandScope`：只展示确认点；禁止工具调用。
- `subdelegation`：禁止。
- `executionContext`：当前对话。
- `resourceLocks`：项目外授权 record write。
- `owner`：主协调 owner。
- `verification`：计划确认、protected target 确认或一般继续不能替代。
- `failureDomain`：未确认保持等待，不是执行失败；范围变化使节点失效并返回计划门禁。
- `replanTriggers`：候选文件、验证或 commit 副作用变化。
- `authorizationGate`：用户完成本节点前 pending。

### 节点 `GLOBAL-RULE-EDIT`

- `taskBoundary`：prompt-governance 单一提交。
- `operationKind`：编辑。
- `outcome`：在全局 `AGENTS.md` 写入已获 special approval 的简洁结果级熔断，并使现有连续闭环规则明确服从它。
- `estimatedCost`：中。
- `deferralEvidence`：无；与两个 skill 编辑节点写集合不相交，可并行。
- `hardPredecessors`：`CONFIG-PREFLIGHT`、`PROTECTED-AGENTS-AUTH`、`EXTERNAL-WRITE-AUTH`；等待 clean baseline 与两个授权 record。
- `consumes`：精确获批文本、现有工作阶段规则。
- `produces`：全局结果级不变量 diff。
- `completionEvidence`：精确获批文本存在；全局文件不复制五项算法；连续闭环、局部失败与计划内修正均不再能覆盖不可恢复失败冻结。
- `readSet`：`codex-config/AGENTS.md` 与必要相邻段落。
- `writeSet`：仅 `codex-config/AGENTS.md`。
- `stateEffects`：一个未暂存提示词 diff。
- `commandScope`：`apply_patch` 与只读精确 diff/check。
- `subdelegation`：禁止。
- `executionContext`：codex-config `main` 当前 worktree；不操作 index。
- `resourceLocks`：全局 AGENTS canonical file write。
- `owner`：全局规则 edit owner。
- `verification`：不得改写详细算法、其他全局规则或目标文本。
- `failureDomain`：不满足完成证据时按五项标准分类；不可恢复则全图冻结，不得 restore。
- `replanTriggers`：必须改变获批文本、需要修改额外全局段落或发现 owner 冲突。
- `authorizationGate`：两个授权节点完成后 active。

### 节点 `EXECUTION-GRAPH-EDIT`

- `taskBoundary`：prompt-governance 单一提交。
- `operationKind`：编辑。
- `outcome`：让执行图成为可恢复判定、不可恢复全图冻结、在途停止和精确解冻的唯一详细 owner，并使普通委派契约在计划执行分支服从它。
- `estimatedCost`：高。
- `deferralEvidence`：无；与其他编辑节点写集合不相交，可并行。
- `hardPredecessors`：`CONFIG-PREFLIGHT`、`PROTECTED-AGENTS-AUTH`、`EXTERNAL-WRITE-AUTH`。
- `consumes`：已确认设计、现有 execution graph 与 delegation contract。
- `produces`：两个 delegating-micro-stages reference diff。
- `completionEvidence`：五项条件使用全部满足语义；不可恢复失败在 ready-set 重算、修正插图、局部失败继续和终态耗尽之前短路；旧计划冻结；笼统继续不能解冻；普通非计划委派语义保持不变。
- `readSet`：`execution-graph.md`、`delegation-contract.md`、直接路由的主 `SKILL.md`。
- `writeSet`：仅两个 delegating-micro-stages references。
- `stateEffects`：两个未暂存 skill reference diff。
- `commandScope`：`apply_patch` 与只读精确 diff/check。
- `subdelegation`：禁止。
- `executionContext`：codex-config `main` 当前 worktree；不操作 index。
- `resourceLocks`：两个 reference files write。
- `owner`：execution-graph edit owner。
- `verification`：不得修改主 `SKILL.md` 或普通调研委派的局部失败语义。
- `failureDomain`：不可恢复失败冻结全图，保留当前 diff。
- `replanTriggers`：需要新增 reference、改变 skill 路由或无法在现有状态机表达冻结。
- `authorizationGate`：两个授权节点完成后 active。

### 节点 `STAGE-RULES-EDIT`

- `taskBoundary`：prompt-governance 单一提交。
- `operationKind`：编辑。
- `outcome`：消除 managing-work-stages 三个 references 与不可恢复失败熔断的冲突，不复制 execution graph 详细算法。
- `estimatedCost`：中。
- `deferralEvidence`：无；与其他编辑节点写集合不相交，可并行。
- `hardPredecessors`：`CONFIG-PREFLIGHT`、`PROTECTED-AGENTS-AUTH`、`EXTERNAL-WRITE-AUTH`。
- `consumes`：已确认设计、stage gates、read-only exception 与 execution preflight。
- `produces`：三个 managing-work-stages reference diff。
- `completionEvidence`：连续闭环、计划内直接修正和预检局部继续只适用于可恢复失败；不可恢复失败路由到执行图；诊断测试保留生命周期不弱化。
- `readSet`：三个 references 与直接路由的主 `SKILL.md`。
- `writeSet`：仅三个 managing-work-stages references。
- `stateEffects`：三个未暂存 skill reference diff。
- `commandScope`：`apply_patch` 与只读精确 diff/check。
- `subdelegation`：禁止。
- `executionContext`：codex-config `main` 当前 worktree；不操作 index。
- `resourceLocks`：三个 reference files write。
- `owner`：work-stage rules edit owner。
- `verification`：不得修改主 `SKILL.md`、删除诊断测试保留规则或复制完整冻结状态机。
- `failureDomain`：不可恢复失败冻结全图，保留当前 diff。
- `replanTriggers`：需要修改主 skill、增加文件或现有阶段规则无法路由。
- `authorizationGate`：两个授权节点完成后 active。

### 节点 `DELEGATING-SKILL-VALIDATE`

- `taskBoundary`：prompt-governance 单一提交。
- `operationKind`：验证。
- `outcome`：验证 delegating-micro-stages skill 结构有效。
- `estimatedCost`：低。
- `deferralEvidence`：无；与 managing 验证可以同时进入 ready set，但二者声明同一 canonical uv cache write lock，同一时刻只能有一个节点获得锁并启动，不构造 hard predecessor。
- `hardPredecessors`：`EXECUTION-GRAPH-EDIT`；等待两个 reference 稳定 diff。
- `consumes`：delegating-micro-stages skill directory 与官方 quick validator。
- `produces`：结构验证结果。
- `completionEvidence`：精确命令 exit 0 且目标 skill identity 正确。
- `readSet`：delegating-micro-stages skill、quick validator、uv runtime。
- `writeSet`：无项目文件；程序内部 uv cache 按工具正常副作用处理。
- `stateEffects`：验证进程与临时 uv cache 状态。
- `commandScope`：`uv run --no-project --with pyyaml python /Users/jiangsheng/.codex/skills/.system/skill-creator/scripts/quick_validate.py /Users/jiangsheng/cnb/codex-config/skills/delegating-micro-stages`。
- `subdelegation`：禁止。
- `executionContext`：codex-config 当前 worktree；不操作 index。
- `resourceLocks`：delegating skill read；uv cache write。
- `owner`：delegating validation owner。
- `verification`：禁止直接 Python、安装持久依赖或替代命令。
- `failureDomain`：验证失败先按五项条件分类；不可恢复则冻结并保留 diff。
- `replanTriggers`：uv/validator 缺失、命令入口变化、结构错误不能在原范围修复。
- `authorizationGate`：外部写入授权覆盖验证副作用后 active。

### 节点 `MANAGING-SKILL-VALIDATE`

- `taskBoundary`：prompt-governance 单一提交。
- `operationKind`：验证。
- `outcome`：验证 managing-work-stages skill 结构有效。
- `estimatedCost`：低。
- `deferralEvidence`：无；与 delegating 验证可以同时进入 ready set，但共享 canonical uv cache write lock，由调度器串行授予锁，不制造 DAG 依赖。
- `hardPredecessors`：`STAGE-RULES-EDIT`；等待三个 reference 稳定 diff。
- `consumes`：managing-work-stages skill directory 与官方 quick validator。
- `produces`：结构验证结果。
- `completionEvidence`：精确命令 exit 0 且目标 skill identity 正确。
- `readSet`：managing-work-stages skill、quick validator、uv runtime。
- `writeSet`：无项目文件；程序内部 uv cache 按工具正常副作用处理。
- `stateEffects`：验证进程与临时 uv cache 状态。
- `commandScope`：`uv run --no-project --with pyyaml python /Users/jiangsheng/.codex/skills/.system/skill-creator/scripts/quick_validate.py /Users/jiangsheng/cnb/codex-config/skills/managing-work-stages`。
- `subdelegation`：禁止。
- `executionContext`：codex-config 当前 worktree；不操作 index。
- `resourceLocks`：managing skill read；uv cache write。
- `owner`：managing validation owner。
- `verification`：禁止直接 Python、安装持久依赖或替代命令。
- `failureDomain`：验证失败先按五项条件分类；不可恢复则冻结并保留 diff。
- `replanTriggers`：uv/validator 缺失、命令入口变化、结构错误不能在原范围修复。
- `authorizationGate`：外部写入授权覆盖验证副作用后 active。

### 节点 `COMBINED-SEMANTIC-AUDIT`

- `taskBoundary`：prompt-governance 单一提交。
- `operationKind`：审查。
- `outcome`：独立反向审计 6 文件组合状态，证明 owner 唯一、冲突闭合、普通小错误和非计划委派没有被误冻结。
- `estimatedCost`：中。
- `deferralEvidence`：无。
- `hardPredecessors`：三个编辑节点；等待组合稳定 diff。与两个结构验证可并行读取稳定 diff。
- `consumes`：已确认设计、6 文件完整 diff、未修改主 skills 与前端 AGENTS 的排除证据。
- `produces`：结构化审计结论与精确问题清单。
- `completionEvidence`：无阻断发现；逐项覆盖五项判定、全图冻结、在途操作、禁止现场读取、禁止 `wait`、轮询和发送消息、仅安全取消可作为冻结后的新工具例外、精确解冻、诊断测试保留和普通委派排除。
- `readSet`：6 文件、两个主 `SKILL.md`、设计与组合 diff。
- `writeSet`：无。
- `stateEffects`：只读审查结果。
- `commandScope`：只读文件、`rg`、Git diff；禁止测试和编辑。
- `subdelegation`：禁止。
- `executionContext`：codex-config 当前 worktree；不操作 index。
- `resourceLocks`：6 文件 read。
- `owner`：独立审计 owner；不得由任一编辑 owner兼任。
- `verification`：只复述设计不构成审计；必须从拟定结论反向寻找遗漏继续路径和过度冻结。
- `failureDomain`：发现阻断问题后按五项条件分类；不可恢复则冻结并保留现场。
- `replanTriggers`：发现遗漏 owner、第七文件需求、全局文案变化或普通工作被过度冻结。
- `authorizationGate`：外部只读审计在计划确认后 active；读取修改后 diff 依赖编辑完成。

### 节点 `COMBINED-DIFF-VERIFY`

- `taskBoundary`：prompt-governance 单一提交。
- `operationKind`：验证。
- `outcome`：验证 codex-config 完整 diff 只含获授权 6 文件、无 whitespace 错误且全局精确文本一致。
- `estimatedCost`：低。
- `deferralEvidence`：无；与结构验证和语义审计并行。
- `hardPredecessors`：三个编辑节点；等待组合稳定 diff。
- `consumes`：6 文件组合 diff、baseline SHA 与授权文本。
- `produces`：allowlist、`git diff --check`、精确文本和排除文件 identity 证据。
- `completionEvidence`：modified 文件集合是候选集合的必要子集且覆盖全部实际语义 owner；`git diff --check` 通过；全局获批文本逐字一致；主 skills、frontend AGENTS 和 Composer 文件未受影响。
- `readSet`：codex-config status/diff、6 文件、排除文件 identity；Codex Composer status 只使用 `DOC-COMMIT` 已发布 identity，不重新读取跨 repo mutable state。
- `writeSet`：无。
- `stateEffects`：只读验证结果。
- `commandScope`：只读 Git diff/status/check、`rg -F` 精确文本检查、SHA identity 比较。
- `subdelegation`：禁止。
- `executionContext`：codex-config 当前 worktree；不操作 index。
- `resourceLocks`：6 文件 read；codex-config status read。
- `owner`：combined verification owner。
- `verification`：不得用预计 hunk、行数或正则替代完整 diff 审查。
- `failureDomain`：不可恢复失败冻结全图并保留 diff。
- `replanTriggers`：范围外 diff、授权文本不一致、排除文件变化。
- `authorizationGate`：外部写入授权后 active。

### 节点 `CONFIG-STAGE`

- `taskBoundary`：prompt-governance 单一提交。
- `operationKind`：stage。
- `outcome`：codex-config index 精确包含验证通过的实际修改文件。
- `estimatedCost`：低。
- `deferralEvidence`：无。
- `hardPredecessors`：两个结构验证、`COMBINED-SEMANTIC-AUDIT`、`COMBINED-DIFF-VERIFY`；等待全部 fan-in 证据。
- `consumes`：经验证的 6 文件候选子集 diff。
- `produces`：prompt-governance-only staged snapshot。
- `completionEvidence`：staged 文件集合精确等于实际已验证 diff；`git diff --cached --check` 通过；worktree 无额外本计划 diff。
- `readSet`：codex-config validated diff/status。
- `writeSet`：codex-config `.git/index`。
- `stateEffects`：只 stage 实际修改文件。
- `commandScope`：精确 `git add -- <actual validated files>`、staged diff/check；禁止开放路径或 `git add -A`。
- `subdelegation`：禁止。
- `executionContext`：codex-config `main` 当前 worktree，共享 index 独占写锁。
- `resourceLocks`：codex-config `.git/index` write；实际文件 read。
- `owner`：codex-config Git owner。
- `verification`：不得 stage 计划外文件、缓存或未验证变化。
- `failureDomain`：不可恢复失败冻结全图；不得 unstage、restore 或清理 index。
- `replanTriggers`：index 污染、staged snapshot 与 verified diff 不同。
- `authorizationGate`：项目外写入与 local commit 授权完成后 active。

### 节点 `CONFIG-COMMIT`

- `taskBoundary`：prompt-governance 单一提交。
- `operationKind`：commit。
- `outcome`：创建一个原子本地提示词治理 commit。
- `estimatedCost`：低。
- `deferralEvidence`：无。
- `hardPredecessors`：`CONFIG-STAGE`；等待稳定 staged snapshot。
- `consumes`：prompt-governance-only staged snapshot。
- `produces`：本地 commit `fix: freeze unrecoverable plan failures`。
- `completionEvidence`：commit 文件集合精确匹配 staged snapshot；index 为空；commit message 精确。
- `readSet`：codex-config index/history/status。
- `writeSet`：codex-config local history。
- `stateEffects`：创建一个本地 commit。
- `commandScope`：精确 `git commit -m 'fix: freeze unrecoverable plan failures'` 与只读 commit 核验。
- `subdelegation`：禁止。
- `executionContext`：codex-config `main` 当前 worktree，共享 index/history 独占写锁。
- `resourceLocks`：codex-config `.git/index` write、local history write。
- `owner`：codex-config Git owner。
- `verification`：禁止 amend、squash、remote 或额外 stage。
- `failureDomain`：不可恢复失败冻结全图；不得重做、恢复或清理。
- `replanTriggers`：hook 产生范围外变化、commit identity 与 staged snapshot 不匹配。
- `authorizationGate`：项目外写入与 local commit 授权完成后 active。

### 节点 `FINAL-READOUT`

- `taskBoundary`：无提交的 fan-in。
- `operationKind`：fan-in。
- `outcome`：向用户报告两个 commit ids、实际修改范围、静态验证与未验证边界。
- `estimatedCost`：低。
- `deferralEvidence`：无。
- `hardPredecessors`：`CONFIG-COMMIT`；等待稳定本地 commit。
- `consumes`：docs commit、codex-config commit、已发布验证结果。
- `produces`：终态用户摘要。
- `completionEvidence`：报告只使用前置节点已发布证据；明确“实际提示词遵循行为未运行验证”。
- `readSet`：前置节点的稳定对话结果；不再调用文件或 Git 工具。
- `writeSet`：无。
- `stateEffects`：无。
- `commandScope`：禁止新工具调用；只形成用户回复。
- `subdelegation`：禁止。
- `executionContext`：当前对话。
- `resourceLocks`：无。
- `owner`：主协调 owner。
- `verification`：不得继续实施、清理或追加验证。
- `failureDomain`：无后继。
- `replanTriggers`：前置证据不完整时按已确认失败规则报告，不补读现场。
- `authorizationGate`：前置完成后 active。

## 调度与拓扑摘要

- 初始 ready set：用户确认计划后只有 `DOC-STAGE`。
- 文档门禁：`DOC-STAGE → DOC-COMMIT`；docs commit 成功前禁止任何 codex-config 编辑。
- docs commit 后 fan-out：`CONFIG-PREFLIGHT`、`PROTECTED-AGENTS-AUTH`、`EXTERNAL-WRITE-AUTH` 均可进入各自状态；由于对话一次只展开一个确认点，两个授权节点由主协调 owner 逐一展示，但不制造产物依赖。
- 编辑 fan-out：三个编辑节点同时等待 preflight 与两个授权；写集合互不相交，可以并行。
- 验证 fan-out：两个 skill 结构验证分别消费对应 skill diff，并可同时进入 ready set；由于共享同一 canonical uv cache write lock，同一时刻只启动一个，锁释放后立即启动另一个，不形成硬依赖。组合语义审计和完整 diff 验证消费三个编辑节点的稳定组合状态，可与已获得 uv lock 的结构验证真实并行。
- 提交 fan-in：全部结构、语义与 diff 证据汇合到 `CONFIG-STAGE → CONFIG-COMMIT`。
- 粗粒度关键路径：docs commit → 两个用户授权与 preflight → execution graph 编辑 → 组合语义审计 → config stage/commit → final readout。
- worktree：不创建 branch 或 worktree；Codex 与 codex-config 使用各自当前 worktree、branch 和 Git index。
- 提交拓扑：Codex docs-only commit 与 codex-config prompt-governance-only commit 两个独立本地提交；不 squash、不 amend、不 remote。
- 最终验证拓扑：两个 quick validator 受共享 uv cache write lock 串行约束；独立组合语义审计与 allowlist/diff 检查可并行读取稳定组合状态；全部 fan-in 后才允许 stage。

## 六字段证据摘要

- `权威入口`：全局结果级规则由 `codex-config/AGENTS.md` 定义；已落盘计划执行期详细状态与失败调度由 `delegating-micro-stages/references/execution-graph.md` 定义。
- `已追踪链路`：全局连续闭环 → execution graph ready-set/失败域/修正插图/终态耗尽；managing stage gates、调查例外与 preflight 继续语义；普通 delegation 在计划执行分支的共享契约；诊断测试保留生命周期。
- `修改范围`：1 个全局规则文件、2 个 delegating references、3 个 managing references；每项均对应当前冲突或唯一 owner。主 skills 路由已正确，不修改。
- `验证映射`：两个 skill 各自 quick_validate；完整 diff/whitespace/精确文本检查；独立反向语义审计覆盖不可恢复短路、普通可恢复错误、预期红灯、在途操作、禁止补读与精确解冻。
- `排除项`：frontend AGENTS、项目根 AGENTS、两个主 `SKILL.md`、第三方 `.agents/skills/**`、官方 skills、产品代码和当前 Composer diff 均有 owner 或范围证据排除。
- `剩余未知`：无关键未知。非关键未知是 6 个候选文件中是否可通过删除冗余而减少实际修改数；实施允许缩小为必要子集，但不得增加第七文件。

## 失败、冻结与返回条件

以下任一情况直接命中不可恢复条件并冻结，不执行任何清理或现场检查：

- codex-config 不是 clean baseline，或 branch/canonical target/HEAD 变化使计划证据失效；
- 受保护全局文本或项目外写入未取得独立确认；未确认只保持等待，不视为失败；
- 需要修改第七个文件、主 `SKILL.md`、frontend AGENTS、官方或第三方 skill；
- 实施需要改变已确认五项条件、冻结范围、在途处理或精确解冻语义；
- quick validator、owner 路由或现有 skill 结构不可用，且不能在原 write set 内无损闭环；
- 组合审计发现不可消除的 owner 重复、规则冲突、过度冻结或失败后继续路径；
- Git index 污染、hook 范围外写入、commit snapshot 漂移或任何恢复/覆盖需求。

普通拼写、Markdown 格式、reference 措辞、静态检查或结构错误只有在五项可恢复条件全部成立时，才能插入最小修正节点；修正不得删除、restore、rollback、修改基线或扩大范围。不能证明全部成立时立即冻结。

## 本计划不声称的内容

- 不声称自然语言提示词能够提供工具级强制隔离。
- 不声称实际模型遵循行为已经通过运行测试。
- 不声称所有命令非零退出都属于不可恢复失败。
- 不修改现有 Composer 诊断代码，也不恢复或清理用户当前工作树。
- 不修改 frontend AGENTS，仅因它被用户列为候选不构成修改理由。
- 不授权 remote、force、amend、squash、安装、worktree 或可见桌面操作。
