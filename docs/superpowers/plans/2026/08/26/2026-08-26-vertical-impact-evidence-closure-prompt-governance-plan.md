# 计划前纵向影响面证据闭包提示词治理实施计划

日期：2026-08-26

状态：已确认

确认日期：2026-08-26

确认原文：`确认计划`

设计依据：`docs/superpowers/specs/2026/08/26/2026-08-26-vertical-impact-evidence-closure-prompt-governance-design.md`

关联 issue：

- `docs/superpowers/issues/2026/08/24/2026-08-24-02-codex-execution-process-problems/2026-08-24-04-incomplete-vertical-impact-analysis.md`
- `docs/superpowers/issues/2026/08/24/2026-08-24-02-codex-execution-process-problems/2026-08-24-01-evidence-closure-before-action.md`

## 目标与保证边界

在不新建平行 skill、不修改产品代码和不扩大其他 owner 职责的前提下，完成三层治理：压缩全局事实闭包规则并路由到 `$managing-work-stages`；让该 skill 通过详细 reference 统一拥有计划前纵向影响面检查及用户可见证据摘要；把 `codex-gui/AGENTS.md` 收敛为 GUI 特有差异项。

本计划只降低模型漏查纵向影响面的概率，不形成工具级 enforcement。实施和机械验证完成后不更新或关闭关联 issue；真实高风险任务行为仍需后续复核。

## 计划前精简证据摘要

### 权威入口

- 通用阶段 owner：`/Users/jiangsheng/cnb/codex-config/skills/managing-work-stages/SKILL.md:22-47`。
- 全局触发入口：`/Users/jiangsheng/cnb/codex-config/AGENTS.md:35-39`。
- GUI 项目入口：`/Users/jiangsheng/cnb/codex/codex-gui/AGENTS.md:18-35`。
- skill 结构验证入口：`/Users/jiangsheng/.codex/skills/.system/skill-creator/scripts/quick_validate.py`。
- GUI Markdown 格式验证入口：`codex-gui/package.json` 中的 `format:oxfmt`。

### 已追踪链路

- `~/.codex/AGENTS.md` 指向 `/Users/jiangsheng/cnb/codex-config/AGENTS.md`，两者是同一 canonical 受保护目标。
- `~/.codex/skills/managing-work-stages` 指向 `/Users/jiangsheng/cnb/codex-config/skills/managing-work-stages`，无需 installer 或复制部署。
- `$managing-work-stages` 已拥有风险、三道闭包、关键未知和阶段回退；缺少的是详细 reference 路由和六字段可见摘要。
- `codex-gui/AGENTS.md` 已覆盖 GUI 影响面原则；缺少的是明确差异项，且当前包含通用未知阻断语义。
- `$codex-gui-toolchain`、`$delegating-micro-stages`、`$skill-creator`、`$action-authorization`、`$instruction-fidelity` 与 `$project-doc-workflow` 的当前职责均已核验，不需要修改。

### 修改范围

只允许四个实施文件：

- `/Users/jiangsheng/cnb/codex-config/AGENTS.md`
- `/Users/jiangsheng/cnb/codex-config/skills/managing-work-stages/SKILL.md`
- `/Users/jiangsheng/cnb/codex-config/skills/managing-work-stages/references/vertical-impact-closure.md`（新增）
- `/Users/jiangsheng/cnb/codex/codex-gui/AGENTS.md`

### 验证映射

- skill 结构：规定的隔离 `uv` 形式运行 `quick_validate.py`。
- GUI Markdown：fnm-backed `pnpm run format:oxfmt`。
- 范围与空白：两个仓库分别运行 allowlist `git diff --check`、`git diff --name-only` 和 staged diff 审查。
- 职责与行为：独立只读上下文执行跨 owner 去重审查、高风险合成场景和低风险反例。

### 排除项

- 不修改 `skills/managing-work-stages/agents/openai.yaml`：现有名称、description 和默认提示仍准确。
- 不修改 installer：当前两个符号链接均正确，源文件变化直接成为后续新上下文的 live 输入。
- 不修改 `$codex-gui-toolchain`、execution graph、其他全局 skills、产品代码、schema、生成器、测试和 issue。
- 不运行 `just fmt`、Rust 命令、GUI lint/type-check/test/build；它们不验证本次 Markdown 与提示词语义。
- 不运行 `format:oxfmt:fix` 作为默认步骤：固化 fixer 覆盖整个 GUI 树，不能安全限定到本次单文件 writeSet。先运行非 fix 检查；若仅本次文件失败，插入只修改该文件的计划内修正节点。

### 剩余未知

没有会改变根因、文件范围或验证方式的关键未知。唯一待授权事实是受保护全局目标的专门写入确认；它在执行图中只阻塞 `CONFIG-GLOBAL-EDIT` 及其后继，不阻塞 skill 或 GUI 分支。

## 当前基线与授权边界

- Codex 仓库：`/Users/jiangsheng/cnb/codex`，计划编写时为 `dev@9300f6a2b446d86cb00f179ab5324ac6ac4ecdec`；只有已确认设计和本计划属于本任务未提交文档。
- 配置仓库：`/Users/jiangsheng/cnb/codex-config`，计划编写时为 `main@7d2ff2a4d90eb624045c1ecd6b01d389093a3df1`；工作树与 index 干净。
- 另有四个 `codex/action-authorization-*` 配置 worktree，均属于其他任务；禁止读取其可变 diff、复用、修改或清理。
- 当前请求只授权确认设计和落盘计划。计划确认后才授权本文精确列出的本地文档提交、四文件编辑、验证、两个实施提交及最终只读汇合。
- 计划确认不授权受保护全局目标写入。`GLOBAL-APPROVAL` 必须展示本文的精确替换文本，并取得用户针对 `/Users/jiangsheng/.codex/AGENTS.md` canonical 资源的独立明确确认。
- 所有 remote、force、amend、squash、安装、worktree 创建/清理和计划外修复均不授权。

## 精确文件与提交边界

### DOC：工作文档提交

提交消息：`docs: add vertical impact evidence closure governance`

仅包含：

- `docs/superpowers/specs/2026/08/26/2026-08-26-vertical-impact-evidence-closure-prompt-governance-design.md`
- `docs/superpowers/plans/2026/08/26/2026-08-26-vertical-impact-evidence-closure-prompt-governance-plan.md`

### CONFIG：全局门禁与详细 owner

提交消息：`instructions: require auditable vertical impact closure`

仅包含：

- `AGENTS.md`
- `skills/managing-work-stages/SKILL.md`
- `skills/managing-work-stages/references/vertical-impact-closure.md`

该提交只改变事实闭包治理行为，不包含纯代码顺序调整。

### GUI：前端差异入口

提交消息：`docs(gui): scope frontend evidence closure`

仅包含：

- `codex-gui/AGENTS.md`

## 受保护全局文件精确替换文本

实施时只允许把 `/Users/jiangsheng/cnb/codex-config/AGENTS.md` 当前第 35—39 行替换为以下四条；其他全局规则不改写、不移动：

```markdown
- 调查深度按风险决定：范围明确、可逆、低影响的任务轻量核验；涉及跨层、公共接口或数据与安全语义、生成链、持久状态、生命周期、失败恢复、不可逆或高影响操作，或影响面未知时，必须完整核验。风险只能依据当前证据下调，发现未知影响面时立即升级。
- 进入下一阶段前必须按 `$managing-work-stages` 完成适用的事实闭包；高风险任务请求计划确认前，必须展示可复核的精简证据摘要。详细纵向链路、证据格式、排除规则和失败回退由该 skill 统一管理。
- 关键事实未知时禁止进入下一阶段；不影响当前结论的未知可以保留，但必须明确边界。凡是能由代码、测试、配置、schema、生成器或工具廉价确认的关键事实，不得留到实施阶段。
- 复杂跨层任务在请求计划确认前，必须独立反向审计遗漏影响面、未验证假设和约束冲突。
```

`GLOBAL-APPROVAL` 必须逐字展示上述文本、逻辑路径 `/Users/jiangsheng/.codex/AGENTS.md`、实际目标 `/Users/jiangsheng/cnb/codex-config/AGENTS.md` 及“仅替换第 35—39 行”的影响，并等待用户回复“确认写入”“确认允许写入”或等价直接授权。计划确认、一般“确认”或“继续”均不能替代。

## 不创建 Worktree 的依据

本计划不创建新 worktree：

- DOC 与 GUI 位于同一 Codex `dev` 工作区和 index，但 GUI 硬依赖 DOC 提交完成，因此不会并发写同一 index。
- CONFIG 位于另一个 Git 仓库的 `main` 工作区和独立 index，可与 GUI 真正并行。
- 新 worktree 不消除额外冲突，只增加 branch、merge、worktree metadata 和清理成本。

执行上下文固定为：

- `/Users/jiangsheng/cnb/codex`：`dev`，先由 DOC Git owner 独占 index，DOC 提交后由 GUI Git owner使用。
- `/Users/jiangsheng/cnb/codex-config`：`main`，由 CONFIG Git owner在 fan-in 后独占 index。

若执行前任一仓库分支、HEAD、工作树、index 或 canonical symlink 发生漂移，停止受影响节点并重编图；不得用 force、restore、stash 或清理覆盖未知状态。

## 执行图总览

```text
GLOBAL-APPROVAL ─────────────────────────────────────────────────────────────→ CONFIG-GLOBAL-EDIT

SKILL-CREATOR-PREFLIGHT ─→ CONFIG-REFERENCE-DIR ─→ CONFIG-SKILL-EDIT → SKILL-STRUCTURE ─┬→ CONFIG-STATIC
                                            ↑                                           └──────────────────┐
DOC-STAGE → DOC-COMMIT ─────────────────────┼────────────────────────→ CONFIG-GLOBAL-EDIT → CONFIG-STATIC  │
                                            └────────────────────────→ GUI-EDIT → GUI-FORMAT ───────────────┤
                                                                                                           └→ CROSS-OWNER-REVIEW

CROSS-OWNER-REVIEW ─┬→ FORWARD-HIGH-RISK ─┐
                    └→ FORWARD-LOW-RISK ───┴→ FORWARD-FAN-IN

CONFIG-STATIC + FORWARD-FAN-IN → CONFIG-STAGE → CONFIG-COMMIT
GUI-FORMAT + CROSS-OWNER-REVIEW + FORWARD-FAN-IN → GUI-STAGE → GUI-COMMIT

CONFIG-COMMIT + GUI-COMMIT → FINAL-SCOPE
```

计划确认后的初始 ready set 是 `DOC-STAGE`、只读的 `SKILL-CREATOR-PREFLIGHT` 与只产生对话授权状态的 `GLOBAL-APPROVAL`。第一项 workspace 状态变化必须是 `DOC-STAGE`；`DOC-COMMIT` 和 skill-creator preflight 完成后，`CONFIG-REFERENCE-DIR` 与 `GUI-EDIT` 立即按资源条件运行；已取得专门确认时，`CONFIG-GLOBAL-EDIT` 同时运行。若专门确认尚未取得，skill 与 GUI 分支仍可完成编辑、审查、行为验收和 GUI 提交，不把 `GLOBAL-APPROVAL` 变成全图栅栏。

关键路径是 `DOC → 最晚完成的候选编辑/验证 → CROSS-OWNER-REVIEW → forward tests → 两仓库提交 → FINAL-SCOPE`。CONFIG 与 GUI 的提交没有互相产物依赖，在共享行为审查完成后并行形成。

## 授权信封模板

每个节点的 `authorizationGate` 引用下列模板，并把本节点的路径、命令、状态变化和副作用进一步收窄。计划确认前所有模板均为 `pending`。

- `AUTH-READ`：`grantSource=确认本计划`；`grantedOperation=节点列出的只读审查或验证`；`parameterBounds=节点 commandScope`；`status=pending`；`requiredApprovalIds=[]`；禁止编辑、stage、commit、remote、安装和计划外测试。
- `AUTH-VERIFY`：`grantSource=确认本计划`；`grantedOperation=节点列出的精确验证命令`；`parameterBounds=节点 commandScope`；`status=pending`；`requiredApprovalIds=[]`；允许命令固有的 uv 临时 cache 或 runner 状态，不允许 workspace diff、stage、commit、remote、安装持久依赖和计划外测试。
- `AUTH-WRITE`：`grantSource=确认本计划`；`grantedOperation=只编辑节点 allowlist`；`parameterBounds=apply_patch 与精确 writeSet`；`status=pending`；`requiredApprovalIds=[]`；只产生未暂存工作树 diff。
- `AUTH-DIR`：`grantSource=确认本计划`；`grantedOperation=只创建节点声明的空父目录`；`parameterBounds=/bin/mkdir 与精确 canonical path`；`status=pending`；`requiredApprovalIds=[]`；禁止 `-p`、其他目录、文件编辑、stage、commit 和 remote。
- `AUTH-STAGE`：`grantSource=确认本计划`；`grantedOperation=只暂存节点 allowlist`；`parameterBounds=精确 git add 与 index`；`status=pending`；`requiredApprovalIds=[]`；禁止编辑、commit 和 remote。
- `AUTH-COMMIT`：`grantSource=确认本计划`；`grantedOperation=将已审查 staged snapshot 创建为一个本地提交`；`parameterBounds=精确提交消息与当前分支`；`status=pending`；`requiredApprovalIds=[]`；禁止额外 stage、amend 和 remote。
- `AUTH-ASK-GLOBAL`：`grantSource=确认本计划`；`grantedOperation=展示全局精确文本并等待专门确认`；`parameterBounds=本文四条 Markdown 和 canonical 映射`；`status=pending`；`requiredApprovalIds=[]`；不调用写工具。
- `AUTH-GLOBAL`：`grantSource=用户对本文四条精确文本和 canonical 目标的专门明确确认`；`grantedOperation=只替换 CONFIG AGENTS 第 35—39 行`；`parameterBounds=本文精确文本`；`status=unauthorized`；`requiredApprovalIds=[global-vertical-impact-closure-write-2026-08-26]`；禁止 installer、其他行编辑、格式化、stage、commit 和 remote。
- `AUTH-CONFIG-STAGE`：`grantSource=确认本计划 + global-vertical-impact-closure-write-2026-08-26`；`grantedOperation=只暂存 CONFIG 三文件`；`parameterBounds=本文 CONFIG allowlist 与 config index`；`status=pending-global-approval`；`requiredApprovalIds=[global-vertical-impact-closure-write-2026-08-26]`；禁止编辑、commit 和 remote。
- `AUTH-CONFIG-COMMIT`：`grantSource=确认本计划 + global-vertical-impact-closure-write-2026-08-26`；`grantedOperation=把 CONFIG staged snapshot 创建为一个本地提交`；`parameterBounds=本文 CONFIG 提交消息与 config main`；`status=pending-global-approval`；`requiredApprovalIds=[global-vertical-impact-closure-write-2026-08-26]`；禁止额外 stage、amend 和 remote。

所有模板共同规定：`owner` 不是授权来源；节点完成、失败、被替换或前提失效时能力到期；默认禁止 subdelegation；写集合、canonical identity、设计行为、验证入口或基线变化时停止并返回重编图。

## 节点契约

除明确覆盖外，所有节点统一继承：`deferralEvidence=无`；`subdelegation=禁止`；`failureDomain=本节点及传递后继`；`replanTriggers=分支/HEAD/index/canonical target/writeSet/命令/设计验收边界变化`。下列条目与统一继承项共同构成完整节点字段。

### DOC-STAGE

- `nodeId/taskBoundary/operationKind/estimatedCost`：DOC-STAGE / DOC / stage / 低。
- `outcome`：Codex 主 index 只包含已确认设计和本计划；`hardPredecessors`：用户明确确认本计划。
- `consumes/produces/completionEvidence`：两份未提交文档 → staged snapshot；cached allowlist、完整 staged diff 和 `git diff --cached --check` 通过。
- `readSet/writeSet/stateEffects`：两份文档与 Git 状态 / Codex 主 index / 只暂存两份文档。
- `commandScope`：在 `/Users/jiangsheng/cnb/codex` 执行 `git add -- docs/superpowers/specs/2026/08/26/2026-08-26-vertical-impact-evidence-closure-prompt-governance-design.md docs/superpowers/plans/2026/08/26/2026-08-26-vertical-impact-evidence-closure-prompt-governance-plan.md`、`git diff --cached --check`、`git diff --cached --name-only` 和两路径 cached diff。
- `executionContext/resourceLocks/owner`：Codex `dev` 主工作区 / Codex 主 index write / DOC 唯一 Git owner。
- `verification/authorizationGate`：staged 内容等于 allowlist / `AUTH-STAGE`。

### DOC-COMMIT

- `nodeId/taskBoundary/operationKind/estimatedCost`：DOC-COMMIT / DOC / commit / 低。
- `outcome`：创建工作文档独立提交；`hardPredecessors`：DOC-STAGE。
- `consumes/produces/completionEvidence`：staged snapshot → commit id；commit tree 与 staged snapshot 一致。
- `readSet/writeSet/stateEffects`：staged snapshot / Codex `dev` ref 与 index / 一个本地提交。
- `commandScope`：`git commit -m 'docs: add vertical impact evidence closure governance'`、`git show --stat --oneline HEAD`。
- `executionContext/resourceLocks/owner`：Codex `dev` 主工作区 / Codex 主 index 与 `dev` ref write / DOC Git owner。
- `verification/authorizationGate`：提交只含两份文档 / `AUTH-COMMIT`。

### GLOBAL-APPROVAL

- `nodeId/taskBoundary/operationKind/estimatedCost`：GLOBAL-APPROVAL / CONFIG / authorization / 低。
- `outcome`：取得或拒绝受保护资源专门确认；`hardPredecessors`：用户明确确认本计划。
- `consumes/produces/completionEvidence`：本文精确文本与 canonical 映射 → approval id 或拒绝证据；用户回复唯一指向该文本和资源。
- `readSet/writeSet/stateEffects`：本计划与设计 / 无 / 仅对话授权状态。
- `commandScope`：不调用 shell；逐字展示本文四条文本、逻辑路径、实际目标和替换范围。
- `executionContext/resourceLocks/owner`：主线程 / 无 / 主协调代理。
- `verification/authorizationGate`：回复满足受保护文件明确门禁 / `AUTH-ASK-GLOBAL`。

### SKILL-CREATOR-PREFLIGHT

- `nodeId/taskBoundary/operationKind/estimatedCost`：SKILL-CREATOR-PREFLIGHT / 无提交 / investigation / 低。
- `outcome`：形成更新现有 skill 所需的渐进披露、验证入口和目录状态稳定证据；`hardPredecessors`：用户明确确认本计划。
- `consumes/produces/completionEvidence`：`$skill-creator`、quick validator、当前 skill 目录 → preflight 证据；完整读取 skill-creator，确认 validator 路径、`/opt/homebrew/bin/uv` 与 `/bin/mkdir` 存在，并确认 `references/` 仍不存在。
- `readSet/writeSet/stateEffects`：skill-creator、validator、当前 skill 目录与工具路径 / 无 / 只读调查结果。
- `commandScope`：只读 `SKILL.md` 与 validator；执行 `/usr/bin/test -x /opt/homebrew/bin/uv`、`/usr/bin/test -x /bin/mkdir`、`/usr/bin/test ! -e /Users/jiangsheng/cnb/codex-config/skills/managing-work-stages/references` 和 `/usr/bin/test ! -L /Users/jiangsheng/cnb/codex-config/skills/managing-work-stages/references`；不得运行 validator 或创建目录。
- `executionContext/resourceLocks/owner`：config `main` 主工作区与系统 skill 目录只读 / source paths read / 主协调代理。
- `verification/authorizationGate`：证据与计划声明一致 / `AUTH-READ`。

### CONFIG-REFERENCE-DIR

- `nodeId/taskBoundary/operationKind/estimatedCost`：CONFIG-REFERENCE-DIR / CONFIG / generate / 低。
- `outcome`：只创建新 reference 的父目录；`hardPredecessors`：DOC-COMMIT、SKILL-CREATOR-PREFLIGHT。
- `consumes/produces/completionEvidence`：目录不存在证据、已确认设计 → 空的 `skills/managing-work-stages/references/`；目录身份正确且其他路径无变化。
- `readSet/writeSet/stateEffects`：skill 目录状态 / `skills/managing-work-stages/references/` / 创建一个空目录，尚无 Git tracked diff。
- `commandScope`：只执行 `/bin/mkdir /Users/jiangsheng/cnb/codex-config/skills/managing-work-stages/references`，随后只读核验目录；若目录已存在则停止并重编图，不使用 `-p` 覆盖状态。
- `executionContext/resourceLocks/owner`：config `main` 主工作区 / canonical reference directory write / CONFIG skill 编辑 owner。
- `verification/authorizationGate`：只新增精确目录 / `AUTH-DIR`。

### CONFIG-SKILL-EDIT

- `nodeId/taskBoundary/operationKind/estimatedCost`：CONFIG-SKILL-EDIT / CONFIG / edit / 高。
- `outcome`：主 skill 保留门禁并路由到完整纵向闭包 reference；`hardPredecessors`：CONFIG-REFERENCE-DIR。
- `consumes/produces/completionEvidence`：已确认设计、当前 skill、SKILL-CREATOR-PREFLIGHT 稳定证据与新目录 → 两文件未暂存 diff；主入口只保留触发、完成条件和 reference 路由，新 reference 覆盖六字段证据、计划映射、排除、审计与回退。
- `readSet/writeSet/stateEffects`：设计、当前 `SKILL.md`、相关 owner / `skills/managing-work-stages/SKILL.md` 与 `references/vertical-impact-closure.md` / 仅两文件未暂存 diff。
- `commandScope`：只使用 `apply_patch` 编辑上述两个绝对路径；不修改 metadata。
- `executionContext/resourceLocks/owner`：config `main` 主工作区 / 两文件 write / CONFIG skill 编辑 owner。
- `verification/authorizationGate`：内容逐项满足设计第 70—93、119—162 行 / `AUTH-WRITE`。

### CONFIG-GLOBAL-EDIT

- `nodeId/taskBoundary/operationKind/estimatedCost`：CONFIG-GLOBAL-EDIT / CONFIG / edit / 中。
- `outcome`：全局第 35—39 行被本文四条精确文本替换；`hardPredecessors`：DOC-COMMIT、GLOBAL-APPROVAL 成功。
- `consumes/produces/completionEvidence`：approval id、当前全局文件、精确文本 → 单文件未暂存 diff；diff 只替换声明行且逐字匹配。
- `readSet/writeSet/stateEffects`：`AGENTS.md`、symlink identity、approval / `AGENTS.md` / 仅单文件未暂存 diff。
- `commandScope`：只使用 `apply_patch` 将当前五条替换为本文四条；不触及其他行。
- `executionContext/resourceLocks/owner`：config `main` 主工作区 / canonical `/Users/jiangsheng/cnb/codex-config/AGENTS.md` write / CONFIG global 编辑 owner。
- `verification/authorizationGate`：精确 diff 与 approval 一致 / `AUTH-GLOBAL`。

### GUI-EDIT

- `nodeId/taskBoundary/operationKind/estimatedCost`：GUI-EDIT / GUI / edit / 中。
- `outcome`：`Frontend Evidence Closure` 只保留两条 GUI 差异规则；`hardPredecessors`：DOC-COMMIT。
- `consumes/produces/completionEvidence`：设计、当前 GUI rules 与 authoritative-contract invariants → 单文件未暂存 diff；保留 production/mount、export/barrel/alias/dynamic registration、contract/validator/schema/generated fixture、DOM/ARIA、生命周期/恢复及 Browser Mode/E2E，删除通用未知阻断的第二 owner。
- `readSet/writeSet/stateEffects`：设计、`codex-gui/AGENTS.md`、GUI toolchain 与格式配置 / `codex-gui/AGENTS.md` / 仅单文件未暂存 diff。
- `commandScope`：只使用 `apply_patch` 编辑 `Frontend Evidence Closure` 三条现有 bullet；不修改其他 section。
- `executionContext/resourceLocks/owner`：Codex `dev` 主工作区 / `codex-gui/AGENTS.md` write / GUI 编辑 owner。
- `verification/authorizationGate`：两条差异规则满足设计第 95—107 行 / `AUTH-WRITE`。

### SKILL-STRUCTURE

- `nodeId/taskBoundary/operationKind/estimatedCost`：SKILL-STRUCTURE / CONFIG / verification / 中。
- `outcome`：skill 结构、reference 路由和 allowlist 通过；`hardPredecessors`：CONFIG-SKILL-EDIT。
- `consumes/produces/completionEvidence`：两文件候选 diff → 结构验证证据；quick_validate、引用存在、`git diff --check` 和 name-only allowlist 通过。
- `readSet/writeSet/stateEffects`：两文件、validator / 仅 uv 临时 cache / 命令输出和隔离临时依赖状态。
- `commandScope`：在 `/Users/jiangsheng/cnb/codex-config` 执行 `/opt/homebrew/bin/uv run --no-project --with pyyaml python /Users/jiangsheng/.codex/skills/.system/skill-creator/scripts/quick_validate.py /Users/jiangsheng/cnb/codex-config/skills/managing-work-stages`、`git diff --check -- skills/managing-work-stages/SKILL.md skills/managing-work-stages/references/vertical-impact-closure.md`、`git diff --name-only -- skills/managing-work-stages/SKILL.md skills/managing-work-stages/references/vertical-impact-closure.md`，并只读确认 `SKILL.md` 引用的 reference 存在。
- `executionContext/resourceLocks/owner`：config `main` 主工作区 / uv cache write、skill files read / CONFIG 验证 owner。
- `verification/authorizationGate`：所有命令成功且 name-only 精确 / `AUTH-VERIFY`。

### GUI-FORMAT

- `nodeId/taskBoundary/operationKind/estimatedCost`：GUI-FORMAT / GUI / verification / 中。
- `outcome`：GUI Markdown 满足当前 Oxfmt；`hardPredecessors`：GUI-EDIT。
- `consumes/produces/completionEvidence`：GUI 候选 diff、package scripts、format config → 格式证据；fnm-backed pnpm 来源正确、`format:oxfmt` 和单文件 diff check 通过。
- `readSet/writeSet/stateEffects`：`codex-gui/AGENTS.md`、package、Oxfmt config、node_modules / 无 / 只产生验证输出。
- `commandScope`：在 `/Users/jiangsheng/cnb/codex/codex-gui` 执行 `/opt/homebrew/bin/fnm exec --using-file pnpm --version`、`/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt`；随后在仓库根执行 `git diff --check -- codex-gui/AGENTS.md`、`git diff --name-only -- codex-gui/AGENTS.md`。
- `executionContext/resourceLocks/owner`：Codex `dev` 主工作区 / GUI tree read、Node/pnpm runner read / GUI 验证 owner。
- `verification/authorizationGate`：命令成功且 diff allowlist 精确 / `AUTH-VERIFY`。

### CONFIG-STATIC

- `nodeId/taskBoundary/operationKind/estimatedCost`：CONFIG-STATIC / CONFIG / review / 中。
- `outcome`：config 三文件只有一个详细 owner且职责无重复；`hardPredecessors`：CONFIG-GLOBAL-EDIT、SKILL-STRUCTURE。
- `consumes/produces/completionEvidence`：三文件候选、设计与排除 owner → 静态审查结果；全局只保留短门禁，skill 路由 reference，reference 独占详细语义，其他 owner 未修改。
- `readSet/writeSet/stateEffects`：config 三文件及排除 owner / 无 / 只读审查结果。
- `commandScope`：只读 diff 与精确 `rg -n -e 'vertical-impact-closure' -e '精简证据摘要' -e '纵向影响面' AGENTS.md skills/managing-work-stages`；禁止用字符串存在代替人工职责审查。
- `executionContext/resourceLocks/owner`：config `main` 主工作区 / config candidate read / 独立静态审查 owner。
- `verification/authorizationGate`：按设计职责表逐项通过 / `AUTH-READ`。

### CROSS-OWNER-REVIEW

- `nodeId/taskBoundary/operationKind/estimatedCost`：CROSS-OWNER-REVIEW / 无提交 / review / 高。
- `outcome`：三层候选没有遗漏、双 owner 或错误路由；`hardPredecessors`：SKILL-STRUCTURE、GUI-FORMAT。
- `consumes/produces/completionEvidence`：本文受保护文件精确替换文本、skill/reference 候选、GUI 候选、设计与排除 owner → 独立反向审查；返回结论、路径行号、排除项和建议，且没有需扩大 writeSet 的问题。
- `readSet/writeSet/stateEffects`：本计划中的全局精确文本、skill/reference 与 GUI 候选、当前排除 owner / 无 / 只读审查结果。
- `commandScope`：无 shell 必需；独立上下文只读取候选文件和设计，不接收主代理预期结论。
- `executionContext/resourceLocks/owner`：跨两个现有工作区与本计划只读 / planned global text 与 candidate files read / 独立审查 owner。
- `verification/authorizationGate`：主协调代理抽查关键证据并确认无范围遗漏 / `AUTH-READ`。

### FORWARD-HIGH-RISK

- `nodeId/taskBoundary/operationKind/estimatedCost`：FORWARD-HIGH-RISK / 无提交 / review / 高。
- `outcome`：高风险合成场景均先形成六字段证据并正确阻断关键未知；`hardPredecessors`：CROSS-OWNER-REVIEW。
- `consumes/produces/completionEvidence`：本文全局精确文本、skill/reference 与 GUI 候选及六类高风险请求 → 独立行为结果；contract、selector、模块删除、状态 owner、未命中验证、不适用层证据六类均满足设计，不执行请求。
- `readSet/writeSet/stateEffects`：本计划中的全局精确文本、skill/reference 与 GUI 候选、合成 prompt / 无 / 只读行为审查结果。
- `commandScope`：无 shell；评估上下文只得到候选规则、现实任务和“只读分析，不修改文件”，不得得到预期答案。
- `subdelegation`：允许最多四个深度为 1 的只读评估节点；禁止写入和再次委派。
- `executionContext/resourceLocks/owner`：独立只读代理上下文 / candidate files read / forward-test owner。
- `verification/authorizationGate`：主协调代理逐项比对设计第 168—175 行 / `AUTH-READ`。

### FORWARD-LOW-RISK

- `nodeId/taskBoundary/operationKind/estimatedCost`：FORWARD-LOW-RISK / 无提交 / review / 中。
- `outcome`：低风险局部改动不被升级为完整摘要流程；`hardPredecessors`：CROSS-OWNER-REVIEW。
- `consumes/produces/completionEvidence`：本文全局精确文本、skill/reference 与 GUI 候选及低风险现实请求 → 独立行为结果；能基于明确、可逆、影响有限的一手证据执行轻量核验，不虚构纵向层。
- `readSet/writeSet/stateEffects`：本计划中的全局精确文本、skill/reference 与 GUI 候选、合成 prompt / 无 / 只读行为审查结果。
- `commandScope`：无 shell；独立上下文只收到候选规则、请求和只读边界，不提供预期答案。
- `executionContext/resourceLocks/owner`：独立只读代理上下文 / candidate files read / low-risk review owner。
- `verification/authorizationGate`：结果满足设计第 176 行 / `AUTH-READ`。

### FORWARD-FAN-IN

- `nodeId/taskBoundary/operationKind/estimatedCost`：FORWARD-FAN-IN / 无提交 / fan-in / 中。
- `outcome`：形成高低风险合成验收的稳定结论；`hardPredecessors`：FORWARD-HIGH-RISK、FORWARD-LOW-RISK。
- `consumes/produces/completionEvidence`：两组独立结果 → 验收矩阵；七类场景均通过且没有以固定措辞匹配代替行为判断。
- `readSet/writeSet/stateEffects`：两组审查结果与设计 / 无 / 对话内稳定验收矩阵。
- `commandScope`：无 shell；主协调代理逐项核对行为与原始请求。
- `executionContext/resourceLocks/owner`：主线程 / 审查结果 read / 主协调代理。
- `verification/authorizationGate`：验收矩阵完整 / `AUTH-READ`。

### CONFIG-STAGE

- `nodeId/taskBoundary/operationKind/estimatedCost`：CONFIG-STAGE / CONFIG / stage / 低。
- `outcome`：config index 只包含三个实施文件；`hardPredecessors`：CONFIG-STATIC、FORWARD-FAN-IN。
- `consumes/produces/completionEvidence`：三文件候选 diff → staged snapshot；cached allowlist、完整 cached diff 与 `git diff --cached --check` 通过。
- `readSet/writeSet/stateEffects`：三文件 diff与状态 / config index / 只暂存三文件。
- `commandScope`：在 `/Users/jiangsheng/cnb/codex-config` 执行 `git add -- AGENTS.md skills/managing-work-stages/SKILL.md skills/managing-work-stages/references/vertical-impact-closure.md`、`git diff --cached --check`、`git diff --cached --name-only` 和三路径 cached diff。
- `executionContext/resourceLocks/owner`：config `main` 主工作区 / config index write / CONFIG 唯一 Git owner。
- `verification/authorizationGate`：staged snapshot 等于 allowlist且专门 approval 对 stage 仍有效 / `AUTH-CONFIG-STAGE`。

### CONFIG-COMMIT

- `nodeId/taskBoundary/operationKind/estimatedCost`：CONFIG-COMMIT / CONFIG / commit / 低。
- `outcome`：创建 config 独立提交；`hardPredecessors`：CONFIG-STAGE。
- `consumes/produces/completionEvidence`：config staged snapshot → commit id；commit tree 与 snapshot 一致。
- `readSet/writeSet/stateEffects`：staged snapshot / config `main` ref 与 index / 一个本地提交。
- `commandScope`：`git commit -m 'instructions: require auditable vertical impact closure'`、`git show --stat --oneline HEAD`。
- `executionContext/resourceLocks/owner`：config `main` 主工作区 / config index 与 `main` ref write / CONFIG Git owner。
- `verification/authorizationGate`：提交只含三个 config 文件且专门 approval 对 commit 仍有效 / `AUTH-CONFIG-COMMIT`。

### GUI-STAGE

- `nodeId/taskBoundary/operationKind/estimatedCost`：GUI-STAGE / GUI / stage / 低。
- `outcome`：Codex index 只包含 GUI prompt；`hardPredecessors`：FORWARD-FAN-IN。
- `consumes/produces/completionEvidence`：GUI 候选 diff → staged snapshot；cached allowlist、完整 cached diff 与 `git diff --cached --check` 通过。
- `readSet/writeSet/stateEffects`：GUI diff与状态 / Codex 主 index / 只暂存 `codex-gui/AGENTS.md`。
- `commandScope`：在 `/Users/jiangsheng/cnb/codex` 执行 `git add -- codex-gui/AGENTS.md`、`git diff --cached --check`、`git diff --cached --name-only` 和单路径 cached diff。
- `executionContext/resourceLocks/owner`：Codex `dev` 主工作区 / Codex 主 index write / GUI 唯一 Git owner。
- `verification/authorizationGate`：staged snapshot 等于 allowlist / `AUTH-STAGE`。

### GUI-COMMIT

- `nodeId/taskBoundary/operationKind/estimatedCost`：GUI-COMMIT / GUI / commit / 低。
- `outcome`：创建 GUI 独立提交；`hardPredecessors`：GUI-STAGE。
- `consumes/produces/completionEvidence`：GUI staged snapshot → commit id；commit tree 与 snapshot 一致。
- `readSet/writeSet/stateEffects`：staged snapshot / Codex `dev` ref 与 index / 一个本地提交。
- `commandScope`：`git commit -m 'docs(gui): scope frontend evidence closure'`、`git show --stat --oneline HEAD`。
- `executionContext/resourceLocks/owner`：Codex `dev` 主工作区 / Codex 主 index 与 `dev` ref write / GUI Git owner。
- `verification/authorizationGate`：提交只含 `codex-gui/AGENTS.md` / `AUTH-COMMIT`。

### FINAL-SCOPE

- `nodeId/taskBoundary/operationKind/estimatedCost`：FINAL-SCOPE / 无提交 / verification / 中。
- `outcome`：两个仓库的最终状态、提交拓扑与验证证据满足设计；`hardPredecessors`：CONFIG-COMMIT、GUI-COMMIT。
- `consumes/produces/completionEvidence`：三个 commit id、结构/格式/行为证据 → 最终验收；两仓库工作树干净、提交文件 allowlist 精确、无 remote/force/issue 更新。
- `readSet/writeSet/stateEffects`：两个仓库状态、三个提交及验证输出 / 无 / 只读最终报告。
- `commandScope`：两个仓库分别执行 `git status --short`、`git show --stat --oneline HEAD`、精确提交 diff；不运行测试、构建、installer 或 remote。
- `executionContext/resourceLocks/owner`：两个现有工作区只读 / refs 与 worktree read / 主协调代理。
- `verification/authorizationGate`：最终提交、文件、行为和排除范围全部通过 / `AUTH-READ`。

## 任务提交与最终汇合拓扑

```text
Codex dev:        DOC commit → GUI commit
codex-config main:             CONFIG commit

FINAL-SCOPE = DOC commit id + GUI commit id + CONFIG commit id
              + skill structure evidence
              + GUI format evidence
              + cross-owner review
              + high/low-risk forward-test matrix
```

两个仓库没有共同 Git 历史，不执行跨仓库 merge。三个提交保持独立，不 squash、不 amend。

## 漏并行反向审计

- DOC 是所有实施写入的真实前置，因为全局规则要求工作文档先形成独立提交。
- `GLOBAL-APPROVAL` 没有 workspace 副作用，可与 DOC 并行；它只阻塞受保护全局编辑。
- CONFIG skill/reference 与 GUI 文件位于不同仓库、不同 index，可在 DOC 后并行编辑。
- CONFIG global 与 skill/reference 属同一 task boundary 且 writeSet 不相交，可在专门确认到位后并行编辑；它们在组合验证和提交前 fan-in。
- `SKILL-STRUCTURE` 与 `GUI-FORMAT` 读取不同仓库，可并行。
- 高风险与低风险 forward test 消费同一稳定候选，但只读且上下文独立，可并行。
- CONFIG 与 GUI stage/commit 消费共同行为验收，但彼此没有 Git 依赖，可并行形成提交。
- 未发现需要新 worktree、全局串行栅栏或修改 execution graph 的证据。

## 失败与重编图边界

- 编辑越过四文件 allowlist、canonical symlink 漂移、HEAD/index 变化或验证入口不存在：停止受影响分支并重编图。
- `quick_validate.py` 失败：只暂停 CONFIG 验证与提交；在两文件 writeSet 内插入独立修正节点，禁止改用直接 `python`、安装 PyYAML 或修改 validator。
- GUI Oxfmt 失败：确认失败只由 `codex-gui/AGENTS.md` 引起后，在该单文件 writeSet 内插入修正节点并重新运行非 fix 检查；禁止让全树 fixer产生范围外修改。
- cross-owner 或 forward test 发现遗漏：若修正仍落在四文件与已确认行为内，插入对应编辑和失效验证节点；若需要新 owner、产品代码、工具 enforcement、issue 更新或改变设计验收边界，停止并回到设计确认。
- 已形成提交后的任何修正必须创建新的独立提交，禁止 amend。
- 任一失败只暂停该节点及传递后继；无依赖的另一仓库分支继续。

## 明确排除范围

- 不新建 skill、worktree、branch、协议字段、工具或运行时状态；
- 不修改 `agents/openai.yaml`、installer、execution graph、`codex-gui-toolchain` 或其他 owner；
- 不修改产品代码、schema、生成器、fixture、测试或 GUI 行为；
- 不运行 `just fmt`、Rust build/test/fix、GUI lint/type-check/unit/Browser Mode/E2E/build；
- 不更新 issue 状态或正文；
- 不执行 remote、force、amend、squash、stash、restore 或计划外清理；
- 不把机械验证或合成行为审查描述为真实任务效果证明。

## 计划确认门禁

本计划落盘不授权实施。只有用户明确回复“确认计划”或等价直接确认后，`AUTH-*` 模板才按各自范围激活，且第一项 workspace 状态变化必须是 DOC-STAGE。

即使计划已确认，`AUTH-GLOBAL` 仍保持未授权；主协调代理必须再次展示本文“受保护全局文件精确替换文本”及 canonical 目标，并取得面向该资源的专门明确确认后，才能执行 `CONFIG-GLOBAL-EDIT`。其他已获授权且不依赖该确认的节点继续调度。
