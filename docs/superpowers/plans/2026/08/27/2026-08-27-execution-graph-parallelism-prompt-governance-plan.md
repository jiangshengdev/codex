# 执行图有效并行提示词治理实施计划

日期：2026-08-27

状态：计划已落盘，待确认

设计依据：`docs/superpowers/specs/2026/08/27/2026-08-27-execution-graph-parallelism-prompt-governance-design.md`

设计确认原文：`确认设计，计划落盘`

关联 issue：`docs/superpowers/issues/2026/08/24/2026-08-24-02-codex-execution-process-problems/2026-08-24-08-execution-graph-parallelism.md`

## 目标与保证边界

实施已确认设计：只有执行已落盘计划文件时才强制使用执行图；全局 `AGENTS.md` 只保留简洁触发规则、动态调度不变量和最终证据要求；`managing-work-stages` 与 `delegating-micro-stages` 统一触发边界；`execution-graph.md` 继续作为唯一详细调度 owner，并补足“有实际价值”的可核验条件和最终三项并行证据。

本计划只修改提示词层 Markdown。它不能提供工具级 DAG enforcement、真实资源锁或不可伪造的运行时审计，也不自动关闭或更新关联 issue。

## 当前基线与授权边界

- 主仓库：`/var/folders/x7/7d55d2z55012f5_h3jbfdjj40000gn/T/tmp.xHZfTk2RTH`，`dev@01df60d6b5c0c9eb7e92590e83669689332e6182`；设计与本计划两份文档当前均已存在且未跟踪，没有其他已知变更。
- 配置仓库：`/var/folders/x7/7d55d2z55012f5_h3jbfdjj40000gn/T/tmp.xHZfTk2RTH-config`，`main@90875016160bfb69cc5d1cb48c37f19bb134fcaf`；工作树干净。
- `~/.codex/AGENTS.md` 直接链接到 `/var/folders/x7/7d55d2z55012f5_h3jbfdjj40000gn/T/tmp.xHZfTk2RTH-config/AGENTS.md`；两个 changed skill 目录也分别直接链接到 codex-config 源目录。修改规范 checkout 后会直接改变 live 规则，不需要同步或安装。
- `/var/folders/x7/7d55d2z55012f5_h3jbfdjj40000gn/T/tmp.xHZfTk2RTH-config/install.zsh` 会遍历全部 managed targets，且在不匹配时执行 backup-and-relink；本计划禁止运行它。
- 本轮计划前已完整读取 `$skill-creator`：窄更新必须保留现有 metadata 与 reference 路由，避免无关 scaffold；每个 changed skill 使用规定的隔离 `uv` 命令运行 `quick_validate.py`，并以独立合成场景补充行为审查。实施中的 `SKILL-PREFLIGHT` 只做防漂移复核，不把适用 owner 留为未知。
- 计划确认将授权本文精确列出的文档提交、一个本地 worktree/branch、两个 skill 入口文件与一个 reference 的编辑和验证、一个配置提交、本地 fast-forward 集成、合成行为验收和非 force 清理；不授权 Git 远程、force、amend、squash、安装程序、issue 更新或计划外修复。
- 计划确认不授权修改 canonical protected target `~/.codex/AGENTS.md` 或任何准备写入该目标的 `AGENTS.md` 分支副本。`GLOBAL-APPROVAL` 必须重新展示本文精确替换文本，并取得用户明确回复“确认写入”“确认允许写入”或等价直接授权。
- 计划确认后的第一项有状态操作只能是工作文档 stage。文档提交成功前，禁止创建 worktree 或执行任何实施编辑。

## 精确修改范围与提交边界

### DOC：工作文档提交

提交消息：`docs: add execution graph prompt governance plan`

只包含：

- `docs/superpowers/specs/2026/08/27/2026-08-27-execution-graph-parallelism-prompt-governance-design.md`
- `docs/superpowers/plans/2026/08/27/2026-08-27-execution-graph-parallelism-prompt-governance-plan.md`

不更新设计文档状态，不修改 issue。

### CONFIG：执行图提示词治理

提交消息：`instructions: scope execution graph governance`

只修改：

- `AGENTS.md`
- `skills/managing-work-stages/SKILL.md`
- `skills/delegating-micro-stages/SKILL.md`
- `skills/delegating-micro-stages/references/execution-graph.md`

这是一个语义一致的 task boundary：三个互不重叠的 skill 编辑节点和受保护的全局规则编辑节点先 fan-out，随后统一进行组合审查、验证、stage 和单一提交。不得夹带代码顺序调整、其他规则精简、metadata、installer、`project-doc-workflow` 或前端提示词修改。

## 全局提示词精确替换文本

在 `AGENTS.md` 的工作阶段部分，用下列四条替换当前执行图、动态调度、并行 worktree/fan-in 和失败传播四条规则；相邻的文档提交门禁、已有提交修正规则、禁止 amend、最终完成条件及其他规则保持原位：

```markdown
- 只有执行已落盘计划文件时，才强制使用 `$delegating-micro-stages` 的执行图契约；聊天中的计划讨论、调研、设计、计划文件编写和普通多代理委派不因本规则强制建图。详细节点、调度、资源锁和 fan-in 语义由对应 skill 负责，不得复制回全局指令。
- 执行落盘计划时，首次调度及节点完成、失败、资源释放或图变化后必须重新计算 ready set；在授权、依赖、最小资源冲突和并发容量允许时优先保护关键路径。串行等待必须有仍有效的明确证据，执行结束必须简短报告实际并行分支、关键路径以及未启动 ready 节点及原因。
- 计划精确列出的 worktree 创建动作随计划确认获得授权。用户当前明确要求新建、创建、准备或修复 worktree（工作树）时，该请求本身同样构成操作授权；即使旧计划未列出该动作或写明“不创建 worktree”，也不得阻止执行或要求重复确认计划。能从当前任务、项目惯例和一手证据安全推导的技术参数由助手确定，执行前披露是知情告知，不是二次确认。只有请求含糊、参数无法安全推断、存在冲突或覆盖风险，或者涉及 force、远程、破坏性或不可逆操作时，才停止并请求确认。
- 每个计划任务保持独立提交，禁止 squash、合并任务提交或等待无依赖任务。节点失败、修正插图、失败范围和重新调度按 `$delegating-micro-stages` 的执行图契约处理；只有共享前提、共享状态、安全或授权边界受到影响时，才扩大暂停范围。
```

`GLOBAL-APPROVAL` 必须在实施回合中把以上文本原样展示给用户，并说明最终 fast-forward 会更新 `/var/folders/x7/7d55d2z55012f5_h3jbfdjj40000gn/T/tmp.xHZfTk2RTH-config/AGENTS.md`，从而立即改变 `~/.codex/AGENTS.md`。未获得专门确认时，`GLOBAL-EDIT`、CONFIG stage、commit 与 merge 均保持未授权；skill 编辑和只读验证可以继续。

## Skill 修改契约

### `managing-work-stages`

- 保留设计、计划、实现门禁、事实闭包、连续闭环、文档提交前置、直接 worktree 请求和授权路由。
- 把“所有计划”“已确认计划”在执行阶段强制使用执行图的表达收窄为“执行已落盘计划文件”。
- 计划文档自身是否必须包含执行图继续由现有项目文档规则决定；本设计不把计划文件编写升级为新的执行期调度触发条件。
- 执行阶段的漏并行审计和动态调度只在执行已落盘计划文件时强制生效；普通调研、设计、聊天计划或计划文件编写不因此建图。
- 完成检查同步采用相同触发边界，不保留“复杂计划”“所有已确认计划”等第二套入口。

### `delegating-micro-stages`

- 保留普通委派的单一结果微阶段、最小能力信封、范围扩大停止、越界审计、固定调研返回格式和主代理最终判断。
- 只有执行已落盘计划文件时，才强制读取并遵循 execution-graph reference。
- 普通调研、设计和未落盘计划中的委派可以按真实独立性并行，但不强制维护完整节点 schema、动态 `ready set` 或最终三项并行证据。
- 把范围变化、失败和完成检查中的“更新执行图”改为条件语义；未命中落盘计划边界时仍需重新拆分与核验，但不凭空建立执行图。
- 主文件只保留触发、职责和 reference 路由；删除与 reference 重复的字段级状态机、锁和 fan-in 完成检查。

### `execution-graph.md`

- 将强制执行入口统一为“执行已落盘计划文件”；计划编写方只有在其他现行项目文档规则要求时才读取本 reference，不由本设计新增强制触发。
- 保留完整节点字段、能力信封、计划编译、初始和动态 `ready set`、关键路径、canonical 资源锁、task-boundary fan-in、唯一 Git owner、失败域和运行记录。
- 明确“有实际价值”的最低条件：节点具有独立且必要、或能够解锁后继的稳定产出；并行收益没有被当前可核验的冲突或协调成本抵消。暂缓必须形成完整 `deferralEvidence`，不能仅用该词主观搁置 ready 节点。
- 在运行记录、成功完成和失败、拒绝、受阻等所有执行终态中，增加最终用户可见的固定最小证据：`实际并行`、`关键路径`、`未启动 ready 节点`。没有内容时明确写“无”，不能用代理数量、任务标签或 `parallelizable` 代替。
- 计划文件保持权威结构；动态运行状态由唯一协调 owner 管理，不要求执行期间回写计划正文。

## 明确排除范围

- `codex-gui/AGENTS.md`：通用调度不属于前端专属 owner。
- `skills/project-doc-workflow/SKILL.md`：其“长计划必须以 execution graph 为权威结构”是独立的现有计划文档要求；本设计不扩大或收窄它，无需修改。
- `skills/action-authorization/**`、`skills/instruction-fidelity/**`、`skills/grilling/**` 和其他 skills。
- `.agents/skills/**`、`install.zsh`、`config.toml`、skill metadata、产品代码、协议、schema、运行时调度器和工具级 enforcement。
- 既有设计、计划、research、报告和关联 issue 的内容或状态。
- Git 远程、程序或依赖安装、force、amend、squash 和计划外清理。

## Worktree 精确动作

文档提交完成后，在配置仓库创建一个隔离实施 worktree：

```bash
git -C /var/folders/x7/7d55d2z55012f5_h3jbfdjj40000gn/T/tmp.xHZfTk2RTH-config worktree add -b codex/execution-graph-parallelism-prompt-governance /var/folders/x7/7d55d2z55012f5_h3jbfdjj40000gn/T/tmp.xHZfTk2RTH-config-execution-graph-parallelism 90875016160bfb69cc5d1cb48c37f19bb134fcaf
```

计划编写时分支和路径均不存在，配置仓库规范 checkout 干净。执行时先重新核验：分支不存在；路径同时不存在且不是 symlink；`main` 仍为上述 HEAD 且工作树干净。任何漂移、同名资源或覆盖风险都触发重编图，不覆盖现有资源。

所有 CONFIG 编辑、验证、stage 和 commit 在该 worktree/branch/index 内进行。完成提交后，规范 checkout 只有在 `main` 仍为声明基线且干净时执行：

```bash
git -C /var/folders/x7/7d55d2z55012f5_h3jbfdjj40000gn/T/tmp.xHZfTk2RTH-config merge --ff-only codex/execution-graph-parallelism-prompt-governance
```

行为验收通过且提交已成为 `main` 祖先后，执行非 force 清理：

```bash
git -C /var/folders/x7/7d55d2z55012f5_h3jbfdjj40000gn/T/tmp.xHZfTk2RTH-config worktree remove /var/folders/x7/7d55d2z55012f5_h3jbfdjj40000gn/T/tmp.xHZfTk2RTH-config-execution-graph-parallelism
git -C /var/folders/x7/7d55d2z55012f5_h3jbfdjj40000gn/T/tmp.xHZfTk2RTH-config branch -d codex/execution-graph-parallelism-prompt-governance
```

不运行 `install.zsh`；live 链接只读核验。

## 执行图总览

```text
PLAN-CONFIRM
  ├─→ DOC-STAGE → DOC-COMMIT
  │                ├─→ WT-CONFIG
  │                └─→ SKILL-PREFLIGHT
  └─→ GLOBAL-APPROVAL

WT-CONFIG + SKILL-PREFLIGHT
  ├─→ EDIT-MANAGING → VALIDATE-MANAGING
  ├─→ EDIT-DELEGATING ─┐
  └─→ EDIT-GRAPH ──────┴─→ VALIDATE-DELEGATING

WT-CONFIG + approved → EDIT-GLOBAL

VALIDATE-MANAGING + VALIDATE-DELEGATING + EDIT-GLOBAL
  → COMBINED-REVIEW → CONFIG-STAGE → CONFIG-COMMIT
  → fan-out: blind behavior cases → CASE-ORACLE-REVIEW

CONFIG-COMMIT + CASE-ORACLE-REVIEW
  → CONFIG-MERGE → LIVE-STRUCTURE → FINAL-AUDIT → CLEANUP → SUCCESS-REPORT

任一不可恢复失败、明确拒绝或 cleanup 失败 ─→ 终态处理器：耗尽失败域外有价值节点并释放锁 → FAILURE-REPORT
```

初始 ready set：计划确认后，`DOC-STAGE` 与只产生对话确认状态的 `GLOBAL-APPROVAL` 同时就绪；文档 stage 是第一项有状态操作。`DOC-COMMIT` 完成后，`WT-CONFIG` 与只读的 `SKILL-PREFLIGHT` 同时就绪。两者完成后，三个 skill 编辑节点立即 fan-out；它们不等待 `GLOBAL-APPROVAL`。`WT-CONFIG` 完成且 approval 已为 `approved` 时，`EDIT-GLOBAL` 立即就绪，不等待 `SKILL-PREFLIGHT` 或任何 skill wave。CONFIG 的 stage、commit、merge 等消费受保护内容的后继继续等待专门确认。

三个 skill 编辑节点只读取 `90875016160bfb69cc5d1cb48c37f19bb134fcaf` commit tree 中各自目标文件的不可变 baseline、已确认设计和本文修改契约，不读取兄弟节点正在修改的 mutable 文件；因此可在同一 task boundary 和 worktree 中并行。跨文件一致性只在 `VALIDATE-DELEGATING` 与 `COMBINED-REVIEW` fan-in 后检查。两个 validator 共享 canonical `/Users/jiangsheng/.cache/uv` write 资源，运行时以动态锁短时串行，不形成 DAG 边。

关键路径通常为 `DOC → max(max(WT-CONFIG, SKILL-PREFLIGHT) → 最慢 skill 编辑/验证, max(WT-CONFIG, GLOBAL-APPROVAL) → EDIT-GLOBAL) → COMBINED-REVIEW → CONFIG-COMMIT → 最慢盲测案例 → CASE-ORACLE-REVIEW → CONFIG-MERGE → LIVE-STRUCTURE → FINAL-AUDIT`。如果受保护文件确认迟到，global 分支动态成为关键路径；skill 分支不等待它。盲测案例消费 CONFIG commit tree，在 live merge 之前并行完成，再由独立 oracle owner 对照验收矩阵，避免先发布后发现语义失败。

## 授权信封模板

所有节点共同遵守：`owner` 不产生授权；`subdelegation=false`；失败只暂停本节点和传递后继；节点完成、失败、撤销、替换或前提失效时能力到期；writeSet、命令、目标 identity、触发边界、用户可见证据或验证入口改变时触发重编图。

- `AUTH-DOC`：`grantSource=计划确认`；`grantedOperation=两份精确文档的 stage 与单一 commit`；`parameterBounds=DOC-STAGE 与 DOC-COMMIT 的 cwd、allowlist 和 commit message`；`status=pending`；`requiredApprovalIds=[]`。无编辑、其他 stage、远程或 force。
- `AUTH-WT`：`grantSource=计划确认`；`grantedOperation=本文精确 worktree add、identity 核验和非 force cleanup`；`parameterBounds=声明 branch、base、path 与两条 cleanup 命令`；`status=pending`；`requiredApprovalIds=[]`。禁止覆盖、其他 branch/worktree、远程或 force。
- `AUTH-SKILL-WRITE`：`grantSource=计划确认`；`grantedOperation=使用 apply_patch 编辑两个 skill 入口文件与一个 reference`；`parameterBounds=三个 EDIT 节点的绝对 writeSet`；`status=pending`；`requiredApprovalIds=[]`。不允许 AGENTS 编辑、验证、stage、commit 或 installer。
- `AUTH-ASK-GLOBAL`：`grantSource=计划确认`；`grantedOperation=原样展示本文四条文本并等待专门确认`；`parameterBounds=本文精确 Markdown 与 canonical target 说明`；`status=pending`；`requiredApprovalIds=[]`。不写文件。
- `AUTH-GLOBAL-WRITE`：`grantSource=面向本文四条精确文本与 canonical protected target 的专门确认`；`grantedOperation=编辑实施 worktree 的 AGENTS.md，并允许后继 stage/commit/fast-forward 落到 canonical target`；`parameterBounds=EDIT-GLOBAL、CONFIG-STAGE、CONFIG-COMMIT、CONFIG-MERGE 的精确文本、路径与命令`；`status=unauthorized`；`requiredApprovalIds=[global-execution-graph-write-2026-08-27]`。
- `AUTH-VERIFY`：`grantSource=计划确认`；`grantedOperation=skill-creator preflight、本文 uv 结构验证、只读 diff/链接/盲测行为与 oracle 审查`；`parameterBounds=SKILL-PREFLIGHT、VALIDATE、CASE、CASE-ORACLE-REVIEW、FINAL-AUDIT 的 readSet 与命令`；`status=pending`；`requiredApprovalIds=[]`。不安装、不自动修复、不接受基线。
- `AUTH-CONFIG-GIT`：`grantSource=计划确认与 AUTH-GLOBAL-WRITE 的交集`；`grantedOperation=精确 allowlist stage、单一配置提交和 --ff-only 本地集成`；`parameterBounds=CONFIG-STAGE、CONFIG-COMMIT、CONFIG-MERGE 的 index、message、branch 与 main base`；`status=partiallyBlocked`；`requiredApprovalIds=[global-execution-graph-write-2026-08-27]`。禁止 amend、squash、冲突解决、远程或额外 stage。

## 节点契约

除非节点另有说明：`deferralEvidence=无`；`failureDomain=本节点及传递后继，但永不包含 FAILURE-REPORT`；`replanTriggers=基线、writeSet、命令、canonical target、触发边界或验证入口变化`；`subdelegation=false`。任何不可恢复失败、明确拒绝或受阻终态都产生稳定 terminal evidence，解锁 FAILURE-REPORT；报告节点不消费失败产物作为实施输入，也不借报告修复问题。

### DOC-STAGE

- `taskBoundary / operationKind / outcome / estimatedCost`：DOC / stage / 主 index 中只有设计与计划 / 低。
- `hardPredecessors`：计划明确确认；`consumes / produces`：两份文档 → staged snapshot；`completionEvidence`：cached allowlist 与 `git diff --cached --check` 通过。
- `readSet / writeSet / stateEffects`：两份文档、主仓库状态 / codex 主 index / 仅 stage 两份文档。
- `commandScope`：在 `/var/folders/x7/7d55d2z55012f5_h3jbfdjj40000gn/T/tmp.xHZfTk2RTH` 执行 `git add -- docs/superpowers/specs/2026/08/27/2026-08-27-execution-graph-parallelism-prompt-governance-design.md docs/superpowers/plans/2026/08/27/2026-08-27-execution-graph-parallelism-prompt-governance-plan.md`，随后执行 scoped cached name-only、完整 cached diff 与 `git diff --cached --check`。
- `executionContext / resourceLocks / owner`：codex dev 主 checkout / 主 index write / DOC 唯一 Git owner。
- `verification`：staged 文件与 allowlist 完全一致；`authorizationGate`：`AUTH-DOC`。

### DOC-COMMIT

- `taskBoundary / operationKind / outcome / estimatedCost`：DOC / commit / 一个纯文档本地提交 / 低。
- `hardPredecessors`：DOC-STAGE；`consumes / produces`：staged snapshot → commit id；`completionEvidence`：commit tree 与 snapshot 一致。
- `readSet / writeSet / stateEffects`：staged snapshot / dev ref 与 index / 创建一个本地提交。
- `commandScope`：`git -C /var/folders/x7/7d55d2z55012f5_h3jbfdjj40000gn/T/tmp.xHZfTk2RTH commit -m 'docs: add execution graph prompt governance plan'`，随后 scoped `git show` 和 status 核验。
- `executionContext / resourceLocks / owner`：codex dev 主 checkout / dev ref + 主 index write / DOC Git owner。
- `verification`：提交只含两份文档；`authorizationGate`：`AUTH-DOC`。

### GLOBAL-APPROVAL

- `taskBoundary / operationKind / outcome / estimatedCost`：CONFIG / authorization / 获得或拒绝 `global-execution-graph-write-2026-08-27` / 低。
- `hardPredecessors`：计划明确确认；`consumes / produces`：本文四条精确文本与 canonical target 说明 → `approved` 或 `denied` 稳定授权结果；`completionEvidence`：用户明确确认形成 `approved`，明确拒绝形成 `denied`，继续等待不构成终态。
- `readSet / writeSet / stateEffects`：本文 / 无 / 仅对话授权状态。
- `commandScope`：不调用 shell；原样展示四条文本并说明 fast-forward 会立即改变 live 全局提示词。
- `executionContext / resourceLocks / owner`：主线程 / 无 / 主协调代理。
- `verification`：确认唯一指向本文文本与目标；`authorizationGate`：`AUTH-ASK-GLOBAL`。`approved` 解锁 EDIT-GLOBAL；`denied` 只暂停 EDIT-GLOBAL、COMBINED-REVIEW 及 CONFIG Git 后继，skill 编辑与只读验证继续，并最终产生受阻终态交给 FAILURE-REPORT。

### WT-CONFIG

- `taskBoundary / operationKind / outcome / estimatedCost`：CONFIG / integration / 创建隔离 branch、worktree 与 index / 低。
- `hardPredecessors`：DOC-COMMIT；`consumes / produces`：config 基线 → worktree identity；`completionEvidence`：branch、HEAD、status、worktree list 精确匹配。
- `readSet / writeSet / stateEffects`：config main ref、目标路径 / config worktree metadata、branch ref、目标路径与 index / 一个本地 branch 与 worktree。
- `commandScope`：先只读复核 main HEAD/status、branch 不存在、目标路径同时不存在且不是 symlink；随后只执行本文 `git worktree add` 及 identity/status 核验。
- `executionContext / resourceLocks / owner`：config 规范 checkout / `.git` worktree metadata + branch/path/index write / CONFIG Git owner。
- `verification`：新 worktree 干净且 HEAD 为 `90875016160bfb69cc5d1cb48c37f19bb134fcaf`；`authorizationGate`：`AUTH-WT`。

### SKILL-PREFLIGHT

- `taskBoundary / operationKind / outcome / estimatedCost`：CONFIG / investigation / 计划前已闭合的 skill-creator 与验证约束未发生漂移 / 低。
- `hardPredecessors`：DOC-COMMIT；`consumes / produces`：计划前已读的 `skill-creator/SKILL.md` 约束、当前 owner 文件、全局 quick_validate 规则、工具与 validator 路径 → 防漂移实施约束；`completionEvidence`：重新完整读取 skill-creator，确认内容仍支持 focused update、现有 metadata/reference 保留、规定 `uv` validator 与独立行为审查，且工具路径会命中两个 changed skill。
- `readSet / writeSet / stateEffects`：`/Users/jiangsheng/.codex/skills/.system/skill-creator/SKILL.md`、quick validator、工具路径 / 无 / 只读预检结果。
- `commandScope`：重新完整读取 skill-creator；只读执行 `command -v uv` 和路径存在性核验；不运行 validator、initializer 或 installer。
- `executionContext / resourceLocks / owner`：主机只读上下文 / skill-creator 与工具路径 read / preflight owner。
- `verification`：保留现有 skill metadata 和 references，不新建 scaffold；`authorizationGate`：`AUTH-VERIFY`。

### EDIT-MANAGING

- `taskBoundary / operationKind / outcome / estimatedCost`：CONFIG / edit / 阶段 skill 只在落盘计划边界强制建图 / 中。
- `hardPredecessors`：WT-CONFIG、SKILL-PREFLIGHT；`consumes / produces`：设计、本文修改契约、baseline commit 中的目标文件 → 修改后的 `managing-work-stages/SKILL.md`；`completionEvidence`：执行触发与完成检查使用同一边界，计划文档规则保持独立。
- `readSet / writeSet / stateEffects`：设计、本文、`90875016160bfb69cc5d1cb48c37f19bb134fcaf:skills/managing-work-stages/SKILL.md` immutable blob / worktree `skills/managing-work-stages/SKILL.md` / 未暂存 Markdown diff。
- `commandScope`：先只读执行 `git -C /var/folders/x7/7d55d2z55012f5_h3jbfdjj40000gn/T/tmp.xHZfTk2RTH-config show 90875016160bfb69cc5d1cb48c37f19bb134fcaf:skills/managing-work-stages/SKILL.md` 取得 immutable baseline，再只用 `apply_patch` 编辑 `/var/folders/x7/7d55d2z55012f5_h3jbfdjj40000gn/T/tmp.xHZfTk2RTH-config-execution-graph-parallelism/skills/managing-work-stages/SKILL.md`。
- `executionContext / resourceLocks / owner`：CONFIG worktree / managing file write / 独立编辑 owner。
- `verification`：保留事实闭包、授权、文档提交和 worktree 直接请求语义；`authorizationGate`：`AUTH-SKILL-WRITE`。

### EDIT-DELEGATING

- `taskBoundary / operationKind / outcome / estimatedCost`：CONFIG / edit / 委派 skill 区分普通委派与落盘计划执行 / 中。
- `hardPredecessors`：WT-CONFIG、SKILL-PREFLIGHT；`consumes / produces`：设计、本文接口契约、baseline commit 中的目标文件 → 修改后的主 `SKILL.md`；`completionEvidence`：普通委派约束保留，完整图只在执行已落盘计划时强制。
- `readSet / writeSet / stateEffects`：设计、本文、`90875016160bfb69cc5d1cb48c37f19bb134fcaf:skills/delegating-micro-stages/SKILL.md` immutable blob / worktree `skills/delegating-micro-stages/SKILL.md` / 未暂存 Markdown diff。
- `commandScope`：先只读执行 `git -C /var/folders/x7/7d55d2z55012f5_h3jbfdjj40000gn/T/tmp.xHZfTk2RTH-config show 90875016160bfb69cc5d1cb48c37f19bb134fcaf:skills/delegating-micro-stages/SKILL.md` 取得 immutable baseline，再只用 `apply_patch` 编辑 `/var/folders/x7/7d55d2z55012f5_h3jbfdjj40000gn/T/tmp.xHZfTk2RTH-config-execution-graph-parallelism/skills/delegating-micro-stages/SKILL.md`。
- `executionContext / resourceLocks / owner`：CONFIG worktree / delegating main file write / 独立编辑 owner。
- `verification`：能力信封、越界、返回格式、主代理判断等通用约束未丢失；`authorizationGate`：`AUTH-SKILL-WRITE`。

### EDIT-GRAPH

- `taskBoundary / operationKind / outcome / estimatedCost`：CONFIG / edit / reference 成为完整且可审计的唯一调度 owner / 中。
- `hardPredecessors`：WT-CONFIG、SKILL-PREFLIGHT；`consumes / produces`：设计、本文接口契约、baseline commit 中的目标 reference → 修改后的 execution graph reference；`completionEvidence`：执行触发、价值判定和最终三项证据完整。
- `readSet / writeSet / stateEffects`：设计、本文、`90875016160bfb69cc5d1cb48c37f19bb134fcaf:skills/delegating-micro-stages/references/execution-graph.md` immutable blob / worktree `skills/delegating-micro-stages/references/execution-graph.md` / 未暂存 Markdown diff。
- `commandScope`：先只读执行 `git -C /var/folders/x7/7d55d2z55012f5_h3jbfdjj40000gn/T/tmp.xHZfTk2RTH-config show 90875016160bfb69cc5d1cb48c37f19bb134fcaf:skills/delegating-micro-stages/references/execution-graph.md` 取得 immutable baseline，再只用 `apply_patch` 编辑 `/var/folders/x7/7d55d2z55012f5_h3jbfdjj40000gn/T/tmp.xHZfTk2RTH-config-execution-graph-parallelism/skills/delegating-micro-stages/references/execution-graph.md`。
- `executionContext / resourceLocks / owner`：CONFIG worktree / execution-graph reference write / 独立编辑 owner。
- `verification`：现有节点字段、锁、fan-in、失败域和运行记录不削弱；`authorizationGate`：`AUTH-SKILL-WRITE`。

### EDIT-GLOBAL

- `taskBoundary / operationKind / outcome / estimatedCost`：CONFIG / edit / 全局只保留本文四条精确规则 / 低。
- `hardPredecessors`：WT-CONFIG、GLOBAL-APPROVAL；`consumes / produces`：本文精确文本、当前 AGENTS → 修改后的 branch `AGENTS.md`；`completionEvidence`：只替换目标四条，独立门禁与其他规则未移动。
- `readSet / writeSet / stateEffects`：本文、当前 AGENTS / branch `AGENTS.md` / 未暂存 Markdown diff。
- `commandScope`：只用 `apply_patch` 编辑 `/var/folders/x7/7d55d2z55012f5_h3jbfdjj40000gn/T/tmp.xHZfTk2RTH-config-execution-graph-parallelism/AGENTS.md`。
- `executionContext / resourceLocks / owner`：CONFIG worktree / branch AGENTS write / GLOBAL edit owner。
- `verification`：精确文本与审批内容逐字一致；`authorizationGate`：`AUTH-GLOBAL-WRITE`。

### VALIDATE-MANAGING

- `taskBoundary / operationKind / outcome / estimatedCost`：CONFIG / verification / managing skill 结构有效 / 低。
- `hardPredecessors`：EDIT-MANAGING；`consumes / produces`：修改后 skill → validator 证据；`completionEvidence`：命令成功并真实命中该目录。
- `readSet / writeSet / stateEffects`：managing skill 目录、validator / uv 临时 cache / 验证输出与隔离临时依赖状态。
- `commandScope`：在 CONFIG worktree 执行 `uv run --no-project --with pyyaml python /Users/jiangsheng/.codex/skills/.system/skill-creator/scripts/quick_validate.py /var/folders/x7/7d55d2z55012f5_h3jbfdjj40000gn/T/tmp.xHZfTk2RTH-config-execution-graph-parallelism/skills/managing-work-stages`。
- `executionContext / resourceLocks / owner`：CONFIG worktree / canonical `/Users/jiangsheng/.cache/uv` write + managing directory read / 验证 owner。
- `verification`：退出成功且输出目标正确；`authorizationGate`：`AUTH-VERIFY`。

### VALIDATE-DELEGATING

- `taskBoundary / operationKind / outcome / estimatedCost`：CONFIG / verification / delegating skill 与 reference 结构有效 / 低。
- `hardPredecessors`：EDIT-DELEGATING、EDIT-GRAPH；`consumes / produces`：修改后 skill 目录 → validator 证据；`completionEvidence`：命令成功、reference 链接可解析。
- `readSet / writeSet / stateEffects`：delegating skill 目录、validator / uv 临时 cache / 验证输出与隔离临时依赖状态。
- `commandScope`：在 CONFIG worktree 执行 `uv run --no-project --with pyyaml python /Users/jiangsheng/.codex/skills/.system/skill-creator/scripts/quick_validate.py /var/folders/x7/7d55d2z55012f5_h3jbfdjj40000gn/T/tmp.xHZfTk2RTH-config-execution-graph-parallelism/skills/delegating-micro-stages`，并只读核验 `references/execution-graph.md` 存在且被主文件路由。
- `executionContext / resourceLocks / owner`：CONFIG worktree / canonical `/Users/jiangsheng/.cache/uv` write + delegating directory read / 验证 owner。该 write 锁只动态串行两个 validator，释放后立即重算 ready set，不形成 DAG 边。
- `verification`：退出成功且输出目标正确；`authorizationGate`：`AUTH-VERIFY`。

### COMBINED-REVIEW

- `taskBoundary / operationKind / outcome / estimatedCost`：CONFIG / review / 完整 diff 满足设计且无遗漏或范围外修改 / 中。
- `hardPredecessors`：EDIT-GLOBAL、VALIDATE-MANAGING、VALIDATE-DELEGATING；`consumes / produces`：四文件 diff 与验证证据 → 可 stage 的稳定 snapshot；`completionEvidence`：触发矩阵、全局精简、保留语义、最终证据和 allowlist 全通过。
- `readSet / writeSet / stateEffects`：四文件、设计、计划、Git diff / 无 / 只读审查结果。
- `commandScope`：`git -C /var/folders/x7/7d55d2z55012f5_h3jbfdjj40000gn/T/tmp.xHZfTk2RTH-config-execution-graph-parallelism diff --check -- AGENTS.md skills/managing-work-stages skills/delegating-micro-stages`；`git diff --name-only`；搜索残留的 `复杂计划`、`长计划`、对所有委派强制执行图等旧触发表达；完整阅读四文件 diff。
- `executionContext / resourceLocks / owner`：CONFIG worktree / diff read / 独立 review owner。
- `verification`：只修改 allowlist，`project-doc-workflow`、普通能力信封、直接 worktree 授权和提交门禁未削弱；`authorizationGate`：`AUTH-VERIFY`。

### CONFIG-STAGE

- `taskBoundary / operationKind / outcome / estimatedCost`：CONFIG / stage / CONFIG index 中只有四个 allowlist 文件 / 低。
- `hardPredecessors`：COMBINED-REVIEW；`consumes / produces`：稳定 snapshot → staged snapshot；`completionEvidence`：cached allowlist、完整 cached diff 与 `git diff --cached --check` 通过。
- `readSet / writeSet / stateEffects`：四文件 diff / CONFIG worktree index / 只 stage 四文件。
- `commandScope`：`git add -- AGENTS.md skills/managing-work-stages/SKILL.md skills/delegating-micro-stages/SKILL.md skills/delegating-micro-stages/references/execution-graph.md`，随后 cached name-only、完整 diff 与 diff-check。
- `executionContext / resourceLocks / owner`：CONFIG worktree / CONFIG index write / CONFIG 唯一 Git owner。
- `verification`：staged snapshot 与 allowlist 一致；`authorizationGate`：`AUTH-CONFIG-GIT`。

### CONFIG-COMMIT

- `taskBoundary / operationKind / outcome / estimatedCost`：CONFIG / commit / 一个语义一致的配置治理提交 / 低。
- `hardPredecessors`：CONFIG-STAGE；`consumes / produces`：staged snapshot → CONFIG commit id；`completionEvidence`：commit tree 与 snapshot 一致。
- `readSet / writeSet / stateEffects`：CONFIG index / branch ref 与 index / 一个本地提交。
- `commandScope`：`git -C /var/folders/x7/7d55d2z55012f5_h3jbfdjj40000gn/T/tmp.xHZfTk2RTH-config-execution-graph-parallelism commit -m 'instructions: scope execution graph governance'`，随后 scoped `git show` 与 status 核验。
- `executionContext / resourceLocks / owner`：CONFIG worktree / CONFIG index + branch ref write / CONFIG Git owner。
- `verification`：提交只含四个 allowlist 文件；`authorizationGate`：`AUTH-CONFIG-GIT`。

### CONFIG-MERGE

- `taskBoundary / operationKind / outcome / estimatedCost`：CONFIG / integration / config `main` fast-forward 到 CONFIG commit / 低。
- `hardPredecessors`：CONFIG-COMMIT、CASE-ORACLE-REVIEW；`consumes / produces`：已通过独立 oracle 行为审查的 CONFIG commit、干净未漂移 main → 更新后的 main；`completionEvidence`：`main` HEAD 等于 CONFIG commit 且工作树干净。
- `readSet / writeSet / stateEffects`：规范 checkout、main ref、CONFIG commit / main ref 与规范工作树 / 本地 fast-forward，立即更新 live AGENTS 与 skills。
- `commandScope`：先核验 config main 仍为 `90875016160bfb69cc5d1cb48c37f19bb134fcaf` 且干净，随后只执行本文 `git merge --ff-only` 与 scoped status/show。
- `executionContext / resourceLocks / owner`：config 规范 checkout / main ref + worktree write / CONFIG integration owner。
- `verification`：无 merge commit、无冲突、无额外文件；`authorizationGate`：`AUTH-CONFIG-GIT`。

### LIVE-STRUCTURE

- `taskBoundary / operationKind / outcome / estimatedCost`：CONFIG / verification / live links 与两个 changed skill 结构有效 / 低。
- `hardPredecessors`：CONFIG-MERGE；`consumes / produces`：更新后 main 与 links → live 结构证据；`completionEvidence`：links 指向预期源，两个 quick validators 成功。
- `readSet / writeSet / stateEffects`：live links、main skill 目录、validator / uv 临时 cache / 只读结果与隔离临时依赖状态。
- `commandScope`：只读 `readlink` 核验 `~/.codex/AGENTS.md`、两个 skill links；在 `/var/folders/x7/7d55d2z55012f5_h3jbfdjj40000gn/T/tmp.xHZfTk2RTH-config` 对两个 changed skill 运行与前述相同的 `uv run --no-project --with pyyaml python ... quick_validate.py` 命令；不运行 installer。
- `executionContext / resourceLocks / owner`：config 规范 checkout / canonical `/Users/jiangsheng/.cache/uv` write + live files read / final structure owner。
- `verification`：目标命中且命令成功；`authorizationGate`：`AUTH-VERIFY`。

### 六个独立盲测行为案例

六个案例节点共同字段：

- `taskBoundary / operationKind / estimatedCost`：CONFIG / review / 中。
- `hardPredecessors`：CONFIG-COMMIT；`readSet`：CONFIG commit tree 中四个 changed files、本案例原始输入和最低必要的当前 governing rules；`writeSet=[]`；`stateEffects`：仅独立上下文的实际结构化响应。
- `commandScope`：只允许用只读 `git show <CONFIG-COMMIT>:<path>` 取得四个 immutable blobs；评估者必须完整读取 changed skills，并按主文件路由读取 execution-graph reference。不得向评估者提供设计、计划、预期答案、suspected bug、proposed fix 或 prior conclusions，也不得执行案例中的计划。
- `executionContext / resourceLocks / owner`：互相隔离的只读上下文 / CONFIG commit tree read / 每案例唯一 blind-test owner。
- `verification`：只要求返回实际触发判断、会加载的 owner、允许/禁止行为和依据行号，不在案例节点内判断是否符合预期；`authorizationGate`：`AUTH-VERIFY`。

各案例只向 blind-test owner 提供下列原始输入：

- `CASE-LANDED-PLAN`：“执行 `/tmp/example-plan.md` 中已经落盘且已确认的计划”。
- `CASE-CHAT-PLAN`：“只在对话中讨论并确认一份不落盘计划”。
- `CASE-PLAN-WRITING`：“新建一份短计划文件但不执行，且不存在其他项目规则要求完整执行图”。
- `CASE-ORDINARY-DELEGATION`：“对三个独立本地文件做只读摘要，不创建计划文件”。
- `CASE-NO-PARALLEL`：“执行一个落盘计划，所有实施节点形成单一真实依赖链”。
- `CASE-NON-SUCCESS-END`：“执行一个已落盘且已确认的计划；其中一个节点失败，同时失败域外仍有一个独立 ready 节点”。

六个案例的 `produces` 是各自未经 oracle 提示的实际结构化响应；`completionEvidence` 是响应和引用完整返回给协调者并成为 oracle 可消费的稳定只读输入，而不是“答中预期”；`failureDomain` 只包含该案例、CASE-ORACLE-REVIEW、CONFIG-MERGE 和后继成功链，互不阻塞其他案例，并始终保留 FAILURE-REPORT。

### CASE-ORACLE-REVIEW

- `taskBoundary / operationKind / outcome / estimatedCost`：CONFIG / review / 在 blind outputs 稳定后独立判断修改后的提示词是否满足验收矩阵 / 中。
- `hardPredecessors`：六个盲测案例；`consumes / produces`：六个实际响应、设计验收边界和本文 oracle matrix → 通过或失败的行为审查证据；`completionEvidence`：逐案例给出实际行为、预期不变量、证据行号和判定。
- `readSet / writeSet / stateEffects`：稳定 blind outputs、CONFIG commit tree、设计与本文验收矩阵 / 无 / 只读 oracle 结论。
- `commandScope`：不重新运行或提示案例，不编辑文件；只对照以下矩阵审查实际响应。
- `executionContext / resourceLocks / owner`：独立只读上下文 / stable blind outputs read / 未参与六个 blind case 的唯一 oracle owner。
- `verification`：LANDED 必须强制完整执行图、初始及动态 `ready set` 和最终三项证据；CHAT 不得因本设计强制建图或误判实施授权；PLAN-WRITING 不得触发执行期契约但须服从适用的项目文档规则；ORDINARY-DELEGATION 保留普通能力信封和越界约束但不强制完整图或三项证据；NO-PARALLEL 必须建图并如实给出 `实际并行：无`、关键路径和 `未启动 ready 节点：无`；NON-SUCCESS-END 必须先耗尽失败域外仍有价值的节点，再在失败终态报告三项证据。
- `failureDomain`：CASE-ORACLE-REVIEW、CONFIG-MERGE 和后继成功链；`authorizationGate`：`AUTH-VERIFY`。

### FINAL-AUDIT

- `taskBoundary / operationKind / outcome / estimatedCost`：CONFIG / fan-in / 结构、语义、行为和 Git 证据全部满足计划 / 中。
- `hardPredecessors`：LIVE-STRUCTURE、CASE-ORACLE-REVIEW；`consumes / produces`：所有验证结果、commit id、live diff → 最终审计结论；`completionEvidence`：全部必须节点成功且无计划外修改。
- `readSet / writeSet / stateEffects`：两个仓库状态、CONFIG commit、验证结果 / 无 / 只读汇总结论。
- `commandScope`：两个仓库 scoped status/log/diff；核验 config main commit、codex 文档 commit、changed file allowlist 与 live links；不修改 issue。
- `executionContext / resourceLocks / owner`：主协调上下文 / 两仓库 read / final audit owner。
- `verification`：全部设计验收项映射到证据；`authorizationGate`：`AUTH-VERIFY`。

### CLEANUP

- `taskBoundary / operationKind / outcome / estimatedCost`：CONFIG / integration / 仅移除已合并且干净的本计划 worktree 与 branch / 低。
- `hardPredecessors`：FINAL-AUDIT；`consumes / produces`：干净 worktree、已成为 main 祖先的 commit → 清理证据；`completionEvidence`：路径、登记和 branch 均不存在，main commit 保留。
- `readSet / writeSet / stateEffects`：worktree status、branch ancestor、worktree list / config worktree metadata、目标路径与 branch ref / 非 force 删除一个 worktree 和一个已合并 branch。
- `commandScope`：先证明 worktree 干净且 branch 是 main 祖先，再只执行本文两条 cleanup 命令及只读核验。
- `executionContext / resourceLocks / owner`：config 规范 checkout / worktree metadata + branch/path write / cleanup owner。
- `verification`：未触碰其他 worktree、branch 或文件；`authorizationGate`：`AUTH-WT`。cleanup 失败不撤销已经完成的 CONFIG 结果，产生 cleanup-failure terminal evidence 并解锁 FAILURE-REPORT。

### SUCCESS-REPORT

- `taskBoundary / operationKind / outcome / estimatedCost`：无提交 / fan-in / 向用户交付实施结果与真实并行证据 / 低。
- `hardPredecessors`：CLEANUP；`consumes / produces`：执行记录、关键路径、ready 延迟原因、提交和验证 → 最终回复；`completionEvidence`：回复包含文件、提交、验证、实际并行、关键路径、未启动 ready 节点和排除项。
- `readSet / writeSet / stateEffects`：已完成执行记录 / 无 / 仅对话输出。
- `commandScope`：不调用 shell；`executionContext / resourceLocks / owner`：主线程 / 无 / 主协调代理。
- `verification`：不得把 agent 数量当作并行证据；`authorizationGate`：`AUTH-VERIFY`。

### FAILURE-REPORT 终态不变量

`FAILURE-REPORT` 不是普通 DAG 节点，不使用未定义的 OR `hardPredecessors`。它是调度器在失败、拒绝、受阻或 cleanup 失败后必须执行的终态处理器：

- 首先记录稳定 terminal evidence，并停止其失败域与传递后继；
- 继续运行失败域外所有仍有实际价值、已获授权且无冲突的 ready/running 节点；无价值或不再授权的节点必须记录精确取消原因；
- 等待相关资源锁全部释放，完成可用执行记录的 failure fan-in；
- 然后输出精确阻塞点、已完成与未完成范围、实际并行、关键路径、未启动 ready 节点及原因、遗留 worktree/branch/commit 状态。

终态处理器只允许当前仍获授权的 scoped 状态读取，不恢复、删除、修复、stage、commit 或扩大验证。它不属于任何失败域，不能因上游或 cleanup 失败而静默终止。

## 提交与验证拓扑

```text
codex/dev:
  DOC-STAGE → DOC-COMMIT

codex-config/codex/execution-graph-parallelism-prompt-governance:
  fan-out edits → validators + combined review → CONFIG-STAGE → CONFIG-COMMIT → six blind cases → oracle review

codex-config/main:
  CONFIG-COMMIT + oracle review → --ff-only → live structure → final audit → cleanup
```

所有 CONFIG 编辑属于同一行为提交，不含代码顺序移动。任何对已有提交的计划内修正必须新建独立修正提交，禁止 amend；修正只插入受影响链路并重新运行失效验证。

## 计划前证据摘要

- **权威入口**：全局入口是 `codex-config/AGENTS.md`；阶段触发 owner 是 `managing-work-stages`；委派入口是 `delegating-micro-stages`；完整协议 owner 是 `references/execution-graph.md`；计划文档结构由 `project-doc-workflow` 消费。
- **已追踪链路**：全局规则 → “执行已落盘计划”触发 → 委派入口 → 详细节点/调度/运行记录 → 最终用户证据；计划文档自身结构继续由独立的项目文档规则决定，live 文件通过符号链接直接消费规范 checkout。
- **修改范围**：只改四个 CONFIG 文件；每个文件分别对应简洁触发、阶段边界、委派边界和详细协议。设计与计划仅在 codex 文档提交中落盘。
- **验证映射**：两个 changed skill 分别运行规定的 `uv` quick validator；组合 diff/链接检查覆盖结构与范围；六个不携带预期答案的独立盲测案例覆盖执行落盘计划、聊天计划、计划文件编写、普通委派、无并行空间和非成功终态；独立 oracle review 对照验收矩阵，最终 Git 审计覆盖提交与 live 状态。
- **排除项**：前端提示词、`project-doc-workflow`、授权 skill、installer、产品代码、issue 与远程 Git 均有 owner 或无直接缺口，不进入修改范围。
- **剩余未知**：当前无关键未知。非关键未知是模型行为验证只能证明合成上下文中的提示词表现，不能形成工具级 enforcement；该限制不改变修改或验证范围。

## 计划确认与实施门禁

计划落盘不等于计划确认。用户明确回复“确认计划”后，`AUTH-DOC`、`AUTH-WT`、`AUTH-SKILL-WRITE` 和 `AUTH-VERIFY` 才从 pending 变为 active；`AUTH-GLOBAL-WRITE` 与 `AUTH-CONFIG-GIT` 仍等待 `global-execution-graph-write-2026-08-27`。

实施开始后先并行推进 `DOC-STAGE` 与 `GLOBAL-APPROVAL`，但 DOC-STAGE 必须是第一项有状态操作。文档提交成功后才能创建 worktree 和实施 skill 编辑。未获得全局专门确认时，skill 编辑与只读验证继续，受保护文件编辑及 CONFIG stage、commit、merge 停止。

若计划确认后发现基线、路径、branch、live links、writeSet、验证入口或精确全局文本发生变化，停止受影响节点并回到计划或 special approval 门禁；不得覆盖、自动安装、使用 `install.zsh`、扩大修改或以兼容路径掩盖冲突。
