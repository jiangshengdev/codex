# 执行环境预检提示词治理实施计划

日期：2026-08-27

状态：待确认

设计确认原文：`确认设计，落盘计划`

设计依据：`docs/superpowers/specs/2026/08/27/2026-08-27-execution-environment-preflight-prompt-governance-design.md`

关联 issue：

- `docs/superpowers/issues/2026/08/24/2026-08-24-02-codex-execution-process-problems/2026-08-24-06-execution-environment-preflight.md`

说明：设计文档当前状态字段仍为“待确认”，但用户已在对话中明确确认设计。本计划记录该事实，不修改设计文档。

## 目标与保证边界

在不新增平行 skill、不修改产品代码、不安装工具且不扩大既有 owner 的前提下，建立分层、按风险缩放的执行环境预检规则：全局 `AGENTS.md` 只保留短门禁；`$managing-work-stages` 通过单一 reference 统一拥有详细通用契约；`$codex-gui-toolchain` 只保留前端特有输入与权威入口。

预检通过时只是不逐项汇报检查结果、不新增确认点；正常的工具进度更新仍按更高层沟通要求执行。预检失败时只阻断依赖该环境输入的动作及其后继，无依赖且仍获授权的工作继续。

本计划只能证明提示词与 skill 规则层落地，不能证明真实任务中的问题已经消失，也不更新或关闭关联 issue。

## 计划前事实闭包六字段

### 权威入口

- 全局触发入口：`/Users/jiangsheng/cnb/codex-config/AGENTS.md:35-38`。
- 通用详细 owner：`/Users/jiangsheng/cnb/codex-config/skills/managing-work-stages/SKILL.md:22-47`。
- GUI 项目差异 owner：`/Users/jiangsheng/cnb/codex/.codex/skills/codex-gui-toolchain/SKILL.md:11-75`。
- 结构验证入口：`/Users/jiangsheng/.codex/skills/.system/skill-creator/scripts/quick_validate.py`，按全局规则使用隔离的 `uv run --no-project --with pyyaml python` 形状。
- 行为验收入口：本计划定义的独立十场景只读审计；`quick_validate.py` 只验证 skill 结构，不是行为验收。

### 已追踪链路

- `~/.codex/AGENTS.md` 的 direct link target 与 fully resolved target 均为 `/Users/jiangsheng/cnb/codex-config/AGENTS.md`，是同一受保护 canonical 资源。
- `$managing-work-stages` 已拥有风险分级、三道事实闭包、关键未知和阶段回退；缺少的是证据命令触发、统一详细 reference、成功静默、失败报告和局部阻断契约。
- `$codex-gui-toolchain` 已拥有 live `package.json`、fixed entrypoint、cwd、fnm/Node/pnpm、工具、生成输入、sparse 输入和目标命中检查；只需要明确继承通用契约并保留前端差异。
- GUI skill 当前允许在不存在 script、repository-owned fixed entrypoint 或 recipe 时使用项目 owner 明确规定的 direct entry。通用 reference 只能在“预期或已命名的固化入口缺失或不可用”时阻断，不能取消该项目专属 fallback。
- `codex-gui/AGENTS.md` 负责 GUI 生产链、contract、生命周期和验证层纵向影响面；`$codex-gui-worktree` 负责 worktree 创建、修复和固定 sparse control plane，二者均不是所有命令的运行时环境预检 owner。
- 两个 skill 的 `agents/openai.yaml` 名称、description 和默认提示仍准确；新增 reference 是普通 skill 资源，不需要生成 manifest、schema、fixture 或锁文件。

### 修改范围

实施仅允许修改以下四个文件：

- `/Users/jiangsheng/cnb/codex-config/AGENTS.md`：只替换一条全局短规则。
- `/Users/jiangsheng/cnb/codex-config/skills/managing-work-stages/SKILL.md`：补充触发、风险路由、成功/失败边界和 reference 链接。
- `/Users/jiangsheng/cnb/codex-config/skills/managing-work-stages/references/execution-environment-preflight.md`：新增通用详细契约。
- `/Users/jiangsheng/cnb/codex/.codex/skills/codex-gui-toolchain/SKILL.md`：只补充通用契约继承与前端差异边界。

### 验证映射

- 两个 skill 分别运行本计划列出的精确 `quick_validate.py` 命令，验证结构和 reference 可读性。
- 两仓库分别执行 path-scoped `git diff --check`；stage 后执行 path-scoped `git diff --cached --check`，并核对 staged name set 与 taskBoundary allowlist 完全一致。
- CONFIG 与 GUI 两个实施提交形成后，由独立只读上下文执行十场景行为审计；机械校验不能替代该审计。
- 最终审查确认三个 taskBoundary 保持独立提交，未 squash、未 amend、未触及排除项，issue 状态不变。

### 排除项

- 不修改 `/Users/jiangsheng/cnb/codex/codex-gui/AGENTS.md`。
- 不修改 `/Users/jiangsheng/cnb/codex/.codex/skills/codex-gui-worktree/`。
- 不修改 `/Users/jiangsheng/cnb/codex/AGENTS.md`。
- 不修改两个 skill 的 `agents/openai.yaml`。
- 不修改关联 issue、其他全局 skills、产品代码、协议、schema、生成器、测试、快照或锁文件。
- 不创建 worktree，不安装依赖，不运行 Rust、GUI lint、type-check、test 或 build；这些入口不验证本次提示词语义。
- 不操作 Git remote，不使用 force，不 squash，不 amend，不清理或恢复用户状态。

### 剩余未知

不存在会改变根因、文件范围或验证方式的关键未知。受保护全局目标的专门写入确认尚未取得；它只阻塞 `CONFIG-GLOBAL-EDIT`、CONFIG fan-in、stage 和 commit，不阻塞 `$managing-work-stages` 候选编辑或 GUI 分支。

执行前仍须只读确认两个仓库的分支、HEAD、worktree、index、canonical symlink 和 `uv`/validator 入口未漂移。漂移只暂停受影响节点并重编图，不能用 restore、stash、force 或清理覆盖未知状态。

## 当前基线与授权边界

- Codex 仓库：`/Users/jiangsheng/cnb/codex`，计划编写时为 `dev@0587754e2495a8149957aecf9692a4167078e12f`；只有已确认设计和本计划是本任务未跟踪文档。
- 配置仓库：`/Users/jiangsheng/cnb/codex-config`，计划编写时为 `main@77584f1a0da7530e0a67e6342a34f0789bcfeb84`；worktree 与 index 干净。
- 当前请求只授权创建本计划。用户明确确认本计划后，才授权本文精确列出的三个本地 taskBoundary、四个实施文件、验证、stage、commit 和最终审计。
- 计划确认不授权受保护全局目标写入。必须先展示本文的精确拟写文本、逻辑路径、实际目标和影响，再取得针对该资源的独立明确确认。
- 所有未明确列出的编辑、生成、格式化、测试、提交、远程、安装、force、amend、squash 和 worktree 操作均不授权。

## 精确修改设计

### 全局短规则

实施时只允许把 `/Users/jiangsheng/cnb/codex-config/AGENTS.md` 当前第 36 行整条替换为以下一条；其他全局规则不得改写、移动或重排：

```markdown
- 进入下一阶段或开始实际执行前，必须按 `$managing-work-stages` 完成适用的事实闭包；项目专属预检由对应 skill 或固化入口负责。高风险任务请求计划确认前，必须展示可复核的精简证据摘要；详细规则不得复制回全局指令。
```

`GLOBAL-APPROVAL` 必须逐字展示上述文本、逻辑路径 `~/.codex/AGENTS.md`、实际目标 `/Users/jiangsheng/cnb/codex-config/AGENTS.md` 和“仅替换当前第 36 行”的影响。只有用户随后单独明确回复“确认”“确认写入”“确认允许写入”或等价直接授权，才激活该写入；计划确认、一般性的“继续”或对其他文件的授权均不能替代。

### 通用详细 owner

`skills/managing-work-stages/SKILL.md` 只增加足以稳定路由的主契约：

- 有状态命令，以及输出将成为事实、设计、计划、排除或验证证据的只读命令，都触发适用 preflight；纯展示型低影响读取不加载完整清单。
- 低风险只核验真实命中目标所需输入，高风险闭合全部适用输入；关键环境未知只阻断受影响动作及后继。
- 成功不逐项汇报、不新增确认点，但不取消正常工具进度更新；失败报告预期/实际、受阻范围、仍可继续范围和用户所需操作。
- 路由到唯一 `references/execution-environment-preflight.md`，不把详细检查表保留在主文件。

新 reference 负责命令身份与权威入口、cwd/root/manifest、执行身份与工具来源、适用规则与配置、ignore/hidden/search 边界、schema/skills/generated/sparse 输入、目标命中与预期输出、失败报告和局部调度。它必须引用而不是接管 `$instruction-fidelity`、`$action-authorization`、shell 安全、项目专属 skill、固化 recipe 与禁止安装规则。

通用规则只在预期或已命名的固化入口缺失、不可用或与当前目标不一致时停止。若不存在 repository-owned 固化入口，而项目专属 skill 明确定义 direct entry，该 direct entry 仍是权威入口。

### GUI 差异 owner

`$codex-gui-toolchain` 只做最小调整：显式继承 `$managing-work-stages` 的通用 reference，并把现有 Execution Preflight 解释为 frontend delta。保留 live script、cwd、fnm/Node/pnpm、前端生成输入、Browser Mode/Playwright 目标命中和 sparse 输入；保留当前“无 script、fixed entrypoint 或 recipe 时使用项目 owner 规定 direct command”的行为。不得复制通用 ignore、执行身份、失败报告、风险缩放或调度算法。

## taskBoundary 与提交拓扑

### DOCS

提交消息：`docs: add execution environment preflight governance`

只包含：

- `docs/superpowers/specs/2026/08/27/2026-08-27-execution-environment-preflight-prompt-governance-design.md`
- `docs/superpowers/plans/2026/08/27/2026-08-27-execution-environment-preflight-prompt-governance-plan.md`

### CONFIG

提交消息：`instructions: define execution environment preflight`

只包含：

- `AGENTS.md`
- `skills/managing-work-stages/SKILL.md`
- `skills/managing-work-stages/references/execution-environment-preflight.md`

### GUI

提交消息：`docs(gui): inherit execution environment preflight`

只包含：

- `.codex/skills/codex-gui-toolchain/SKILL.md`

三个 taskBoundary 各自形成独立本地提交，禁止 squash 或 amend。若行为审计发现计划内问题，按失败域新增修正节点和新的独立修正提交，不修改既有提交。

## 不创建 worktree 的依据

- DOCS 与 GUI 位于 Codex `dev` 的同一工作区和 index，但 GUI 的全部实施节点硬依赖 DOCS commit，因此不会并发写同一 index。
- CONFIG 位于另一个 Git 仓库的 `main` 工作区，拥有独立 `.git`、branch、ref 和 index；DOCS commit 后可以与 GUI 真正并行。
- CONFIG 内 `$managing-work-stages`/reference 与全局 `AGENTS.md` 的 writeSet 不相交，可以共享 config worktree 并发编辑；它们在 CONFIG 组合验证前 fan-in，由唯一 Git owner stage 和 commit。
- 新 worktree 不消除额外写冲突，只会增加 branch、worktree metadata、集成和清理成本。

## 执行图总览

```text
DOCS-STAGE → DOCS-STAGED-VERIFY → DOCS-COMMIT ─┬→ GLOBAL-APPROVAL → CONFIG-GLOBAL-EDIT ─┐
                           ├→ CONFIG-MANAGING-EDIT → CONFIG-QUICK-VALIDATE ─┤
                           │                                                └→ CONFIG-FAN-IN → CONFIG-STAGE → CONFIG-STAGED-VERIFY → CONFIG-COMMIT ─┐
                           └→ GUI-EDIT → GUI-QUICK-VALIDATE → GUI-STAGE → GUI-STAGED-VERIFY → GUI-COMMIT ─────────────────────┤
                                                                                                                            └→ TEN-SCENARIO-AUDIT → FINAL-REVIEW
```

计划确认后的初始 ready set 只有 `DOCS-STAGE`；随后依次执行 `DOCS-STAGED-VERIFY` 与 `DOCS-COMMIT`。`DOCS-COMMIT` 是所有实施和授权节点的统一前置屏障。它完成后，`GLOBAL-APPROVAL`、`CONFIG-MANAGING-EDIT` 和 `GUI-EDIT` 同时进入 ready set；全局专门确认未取得时，只暂停 `CONFIG-GLOBAL-EDIT` 及其 CONFIG 后继，其他分支继续。

关键路径是 `DOCS → CONFIG/GUI 中较慢分支 → 两个实施提交 → TEN-SCENARIO-AUDIT → FINAL-REVIEW`。CONFIG 与 GUI 没有互相提交依赖；最终审计必须读取两个稳定 commit，不能读取尚在变化的组合 diff。

固定执行图共 18 个节点。fan-out：`DOCS-COMMIT` 后分为全局授权、CONFIG managing/reference 和 GUI 三支。fan-in：CONFIG 两个编辑分支在 `CONFIG-FAN-IN` 汇合；两个实施提交在 `TEN-SCENARIO-AUDIT` 汇合。提交拓扑为 `DOCS` 先于 `GUI`，而 `CONFIG` 位于另一仓库；最终验证拓扑为两次 quick validation、三次独立 staged verification、两个实施提交后的十场景审计和最终范围审查。

## 节点契约

### DOCS-STAGE

- `nodeId`：`DOCS-STAGE`。
- `taskBoundary`：`DOCS`。
- `operationKind`：stage。
- `outcome`：Codex index 只包含已确认设计与本计划的 staged snapshot。
- `estimatedCost`：低。
- `deferralEvidence`：无；计划确认后立即执行。
- `hardPredecessors`：用户明确确认本计划；稳定产物是激活的计划授权。
- `consumes`：两份未跟踪工作文档、当前 Codex status。
- `produces`：DOCS staged snapshot。
- `completionEvidence`：`git add` 成功并在 index 中形成待独立验证的 DOCS staged snapshot。
- `readSet`：两份文档、Codex status 与 index。
- `writeSet`：Codex 主 index。
- `stateEffects`：只暂存两份文档，不编辑文件。
- `commandScope`：只在 `/Users/jiangsheng/cnb/codex` 执行 `git add -- docs/superpowers/specs/2026/08/27/2026-08-27-execution-environment-preflight-prompt-governance-design.md docs/superpowers/plans/2026/08/27/2026-08-27-execution-environment-preflight-prompt-governance-plan.md`。
- `subdelegation`：false。
- `executionContext`：Codex `dev` 主工作区、主 index。
- `resourceLocks`：`/Users/jiangsheng/cnb/codex/.git/index` write。
- `owner`：DOCS 唯一 Git owner。
- `verification`：本节点不运行验证命令；由 `DOCS-STAGED-VERIFY` 独立验证 staged snapshot。
- `failureDomain`：`DOCS-STAGE` 及全图后继；失败不授权清理 index。
- `replanTriggers`：分支、HEAD、index、文档路径或 allowlist 漂移。
- `authorizationGate`：`grantSource=用户确认本计划`；`grantedOperation=仅暂存 DOCS 两文件`；`parameterBounds=上述唯一 git add`；`status=pending`；`requiredApprovalIds=[]`。

### DOCS-STAGED-VERIFY

- `nodeId`：`DOCS-STAGED-VERIFY`。
- `taskBoundary`：`DOCS`。
- `operationKind`：verification。
- `outcome`：独立证明 DOCS staged snapshot 的完整 name set、空白和内容均正确。
- `estimatedCost`：低。
- `deferralEvidence`：无。
- `hardPredecessors`：`DOCS-STAGE`；等待 index 中的 staged snapshot。
- `consumes`：DOCS staged snapshot、DOCS allowlist。
- `produces`：可供 commit 消费的 staged verification 证据。
- `completionEvidence`：完整 staged name set 精确等于 DOCS allowlist；path-scoped cached check 通过；完整 cached diff 已审阅。
- `readSet`：Codex index 与两份 staged 文档。
- `writeSet`：无。
- `stateEffects`：只产生验证输出，不改变 index 或工作树。
- `commandScope`：在 `/Users/jiangsheng/cnb/codex` 执行不带路径过滤的 `git diff --cached --name-only`、`git diff --cached --check -- docs/superpowers/specs/2026/08/27/2026-08-27-execution-environment-preflight-prompt-governance-design.md docs/superpowers/plans/2026/08/27/2026-08-27-execution-environment-preflight-prompt-governance-plan.md` 和两路径完整 cached diff。
- `subdelegation`：false。
- `executionContext`：Codex `dev` 主工作区、主 index。
- `resourceLocks`：`/Users/jiangsheng/cnb/codex/.git/index` read。
- `owner`：DOCS staged verification owner。
- `verification`：name set、空白和完整内容三项均通过。
- `failureDomain`：本节点及 `DOCS-COMMIT` 和全部实施后继。
- `replanTriggers`：index、allowlist、文档内容或分支漂移。
- `authorizationGate`：`grantSource=用户确认本计划`；`grantedOperation=只读验证 DOCS staged snapshot`；`parameterBounds=上述三类 cached 读取命令`；`status=pending`；`requiredApprovalIds=[]`。

### DOCS-COMMIT

- `nodeId`：`DOCS-COMMIT`。
- `taskBoundary`：`DOCS`。
- `operationKind`：commit。
- `outcome`：创建独立 DOCS 本地提交。
- `estimatedCost`：低。
- `deferralEvidence`：无。
- `hardPredecessors`：`DOCS-STAGED-VERIFY`；等待 staged verification 证据。
- `consumes`：DOCS staged snapshot。
- `produces`：DOCS commit id。
- `completionEvidence`：commit tree 只含两份文档且与 staged snapshot 一致。
- `readSet`：Codex index、两份 staged 文档。
- `writeSet`：Codex `dev` ref 与 index。
- `stateEffects`：创建一个本地提交并清空对应 staged entries。
- `commandScope`：`git commit -m 'docs: add execution environment preflight governance'`、`git diff-tree --no-commit-id --name-only -r HEAD`、`git show --stat --oneline HEAD`。
- `subdelegation`：false。
- `executionContext`：Codex `dev` 主工作区、主 index。
- `resourceLocks`：`/Users/jiangsheng/cnb/codex/.git/index` write；Codex `dev` ref write。
- `owner`：DOCS 唯一 Git owner。
- `verification`：最新提交文件集合精确等于 DOCS allowlist。
- `failureDomain`：本节点及全部实施后继。
- `replanTriggers`：staged snapshot、HEAD、branch 或提交消息边界漂移。
- `authorizationGate`：`grantSource=用户确认本计划`；`grantedOperation=把 DOCS staged snapshot 创建为一个本地提交`；`parameterBounds=精确提交消息、Codex dev、禁止额外 stage`；`status=pending`；`requiredApprovalIds=[]`。

### GLOBAL-APPROVAL

- `nodeId`：`GLOBAL-APPROVAL`。
- `taskBoundary`：`CONFIG` 授权节点，无提交。
- `operationKind`：authorization。
- `outcome`：取得或拒绝受保护全局文件的专门确认。
- `estimatedCost`：低，等待时间由用户决定。
- `deferralEvidence`：无；`DOCS-COMMIT` 后立即展示，不因 CONFIG skill 或 GUI 分支等待。
- `hardPredecessors`：`DOCS-COMMIT`；确保计划已成为稳定提交。
- `consumes`：本文精确全局规则、canonical 映射和保护门禁。
- `produces`：`global-execution-preflight-write-2026-08-27` approval id 或拒绝证据。
- `completionEvidence`：用户回复明确指向已展示文本、逻辑路径、实际目标和单行替换范围。
- `readSet`：本计划、当前全局第 36 行和 symlink identity。
- `writeSet`：无。
- `stateEffects`：仅产生对话授权状态。
- `commandScope`：不调用 shell；逐字展示本文“全局短规则”文本及影响。
- `subdelegation`：false。
- `executionContext`：主线程。
- `resourceLocks`：受保护 canonical 目标只读；对话授权通道 write。
- `owner`：主协调代理。
- `verification`：回复满足全局文件明确门禁；模糊表达不激活写入。
- `failureDomain`：只暂停 `CONFIG-GLOBAL-EDIT`、CONFIG fan-in、stage 和 commit。
- `replanTriggers`：当前第 36 行、symlink identity 或拟写文本变化。
- `authorizationGate`：`grantSource=用户确认本计划`；`grantedOperation=展示精确文本并等待专门确认`；`parameterBounds=本文单条 Markdown、逻辑路径、实际目标、单行替换`；`status=pending`；`requiredApprovalIds=[]`。

### CONFIG-MANAGING-EDIT

- `nodeId`：`CONFIG-MANAGING-EDIT`。
- `taskBoundary`：`CONFIG`。
- `operationKind`：edit。
- `outcome`：主 skill 路由到唯一通用 preflight reference，reference 完整实现设计契约。
- `estimatedCost`：高。
- `deferralEvidence`：无；与 `GLOBAL-APPROVAL`、GUI 分支并行有实际价值。
- `hardPredecessors`：`DOCS-COMMIT`；等待稳定计划与设计提交。
- `consumes`：已确认设计、当前 `SKILL.md`、现有 vertical-impact reference、项目 owner 边界。
- `produces`：两个 CONFIG skill 文件的未暂存 candidate diff。
- `completionEvidence`：主文件只保留触发与路由；新 reference 覆盖详细字段、direct fallback 兼容、成功静默窄定义和局部调度。
- `readSet`：设计、计划、`skills/managing-work-stages/SKILL.md`、相关现有 reference 和排除 owner。
- `writeSet`：`skills/managing-work-stages/SKILL.md`、`skills/managing-work-stages/references/execution-environment-preflight.md`。
- `stateEffects`：只产生上述两文件未暂存 diff。
- `commandScope`：只使用 `apply_patch` 修改两个精确路径；不得编辑 metadata、其他 references 或全局文件。
- `subdelegation`：false。
- `executionContext`：config `main` 主工作区。
- `resourceLocks`：两个 canonical skill 文件 write；config index 不锁定。
- `owner`：CONFIG managing/reference 编辑 owner。
- `verification`：候选内容逐项回指设计的触发、详细契约、owner 边界和失败行为。
- `failureDomain`：本节点、`CONFIG-QUICK-VALIDATE`、CONFIG fan-in、stage 和 commit。
- `replanTriggers`：writeSet、reference 路径、现有 skill 结构或 owner 边界变化。
- `authorizationGate`：`grantSource=用户确认本计划`；`grantedOperation=只编辑两个 CONFIG skill 文件`；`parameterBounds=apply_patch 与精确 writeSet`；`status=pending`；`requiredApprovalIds=[]`。

### CONFIG-GLOBAL-EDIT

- `nodeId`：`CONFIG-GLOBAL-EDIT`。
- `taskBoundary`：`CONFIG`。
- `operationKind`：edit。
- `outcome`：当前全局第 36 行被本文精确短规则替换。
- `estimatedCost`：中。
- `deferralEvidence`：无；取得 special approval 后立即执行。
- `hardPredecessors`：`DOCS-COMMIT`、`GLOBAL-APPROVAL` 成功；分别等待稳定计划和专门 approval id。
- `consumes`：approval id、当前第 36 行、本文精确文本。
- `produces`：`AGENTS.md` 单文件未暂存 candidate diff。
- `completionEvidence`：diff 只替换一条，内容逐字匹配已确认文本。
- `readSet`：全局文件、symlink identity、approval record、本计划。
- `writeSet`：`/Users/jiangsheng/cnb/codex-config/AGENTS.md`。
- `stateEffects`：只产生一条规则替换的未暂存 diff。
- `commandScope`：只使用 `apply_patch` 替换当前第 36 行；不得改写其他行。
- `subdelegation`：false。
- `executionContext`：config `main` 主工作区。
- `resourceLocks`：canonical `/Users/jiangsheng/cnb/codex-config/AGENTS.md` write；config index 不锁定。
- `owner`：CONFIG global 编辑 owner。
- `verification`：精确 diff 与 approval 内容一致。
- `failureDomain`：本节点、CONFIG fan-in、stage 和 commit；不影响 managing/reference 或 GUI 分支。
- `replanTriggers`：当前第 36 行、canonical identity、approval 文本或 writeSet 变化。
- `authorizationGate`：`grantSource=用户对本文精确文本和 canonical 目标的专门明确确认`；`grantedOperation=只替换全局当前第 36 行`；`parameterBounds=本文精确单条 Markdown`；`status=unauthorized`；`requiredApprovalIds=[global-execution-preflight-write-2026-08-27]`。

### GUI-EDIT

- `nodeId`：`GUI-EDIT`。
- `taskBoundary`：`GUI`。
- `operationKind`：edit。
- `outcome`：GUI toolchain 明确继承通用契约，只保留 frontend delta 和现有 direct entry 兼容。
- `estimatedCost`：中。
- `deferralEvidence`：无；DOCS 提交后与 CONFIG 并行缩短关键路径。
- `hardPredecessors`：`DOCS-COMMIT`；等待稳定计划与设计提交。
- `consumes`：已确认设计、当前 GUI toolchain、通用 reference 设计边界。
- `produces`：GUI skill 单文件未暂存 candidate diff。
- `completionEvidence`：继承关系明确；fnm、live script、cwd、生成/sparse 输入、目标命中和 direct entry 保留；未复制通用算法。
- `readSet`：设计、计划、`.codex/skills/codex-gui-toolchain/SKILL.md`、相关排除 owner。
- `writeSet`：`.codex/skills/codex-gui-toolchain/SKILL.md`。
- `stateEffects`：只产生单文件未暂存 diff。
- `commandScope`：只使用 `apply_patch` 编辑该精确文件；不得修改 `agents/openai.yaml`、GUI AGENTS 或 worktree skill。
- `subdelegation`：false。
- `executionContext`：Codex `dev` 主工作区；DOCS commit 后使用该工作区。
- `resourceLocks`：canonical GUI skill file write；Codex index 不锁定。
- `owner`：GUI 编辑 owner。
- `verification`：候选 diff 满足最小继承、frontend delta 和 fallback 兼容边界。
- `failureDomain`：本节点、GUI validation、stage、commit 与最终审计。
- `replanTriggers`：writeSet、现有 direct fallback、frontend toolchain 入口或通用契约变化。
- `authorizationGate`：`grantSource=用户确认本计划`；`grantedOperation=只编辑 GUI toolchain skill`；`parameterBounds=apply_patch 与单文件 writeSet`；`status=pending`；`requiredApprovalIds=[]`。

### CONFIG-QUICK-VALIDATE

- `nodeId`：`CONFIG-QUICK-VALIDATE`。
- `taskBoundary`：`CONFIG`。
- `operationKind`：verification。
- `outcome`：CONFIG skill 结构、reference 路由、空白和 name set 通过。
- `estimatedCost`：中。
- `deferralEvidence`：无。
- `hardPredecessors`：`CONFIG-MANAGING-EDIT`；等待稳定 candidate diff。
- `consumes`：CONFIG skill candidate、validator、`uv` 临时隔离环境。
- `produces`：结构验证证据。
- `completionEvidence`：精确 quick validation 成功；reference 存在；tracked diff check 通过；`git status` 显示的候选路径集合精确等于两个 CONFIG skill 路径。新 reference 的空白检查由 stage 后的 `CONFIG-STAGED-VERIFY` 覆盖。
- `readSet`：CONFIG skill 两文件、validator、Git diff。
- `writeSet`：仅 `uv` 管理的临时 cache；workspace writeSet 为空。
- `stateEffects`：命令输出与可回收临时隔离依赖状态；不安装持久依赖。
- `commandScope`：在 `/Users/jiangsheng/cnb/codex-config` 执行 `uv run --no-project --with pyyaml python /Users/jiangsheng/.codex/skills/.system/skill-creator/scripts/quick_validate.py /Users/jiangsheng/cnb/codex-config/skills/managing-work-stages`、`git diff --check -- skills/managing-work-stages/SKILL.md`、`git status --short --untracked-files=all -- skills/managing-work-stages/SKILL.md skills/managing-work-stages/references/execution-environment-preflight.md`，并只读确认 reference 路径存在。普通 working-tree diff 不得被描述为已覆盖未跟踪 reference。
- `subdelegation`：false。
- `executionContext`：config `main` 主工作区与隔离 `uv` runner。
- `resourceLocks`：CONFIG skill files read；`uv` cache write。
- `owner`：CONFIG 验证 owner。
- `verification`：quick validation 与 tracked diff check 成功，status 候选路径集合精确；不把 quick validation 当行为验收，也不提前宣称未跟踪 reference 已通过空白检查。
- `failureDomain`：本节点、CONFIG fan-in、stage 和 commit。
- `replanTriggers`：validator 路径、`uv`、skill schema、candidate files 或命令范围变化。
- `authorizationGate`：`grantSource=用户确认本计划`；`grantedOperation=运行精确 CONFIG 结构验证`；`parameterBounds=上述三条命令与临时 uv 状态`；`status=pending`；`requiredApprovalIds=[]`。

### GUI-QUICK-VALIDATE

- `nodeId`：`GUI-QUICK-VALIDATE`。
- `taskBoundary`：`GUI`。
- `operationKind`：verification。
- `outcome`：GUI skill 结构、空白和单文件 name set 通过。
- `estimatedCost`：中。
- `deferralEvidence`：无。
- `hardPredecessors`：`GUI-EDIT`；等待稳定 candidate diff。
- `consumes`：GUI skill candidate、validator、`uv` 临时隔离环境。
- `produces`：结构验证证据。
- `completionEvidence`：精确 quick validation、path-scoped diff check 和单文件 name-only allowlist 通过。
- `readSet`：GUI skill、validator、Git diff。
- `writeSet`：仅 `uv` 管理的临时 cache；workspace writeSet 为空。
- `stateEffects`：命令输出与可回收临时隔离依赖状态；不安装持久依赖。
- `commandScope`：在 `/Users/jiangsheng/cnb/codex` 执行 `uv run --no-project --with pyyaml python /Users/jiangsheng/.codex/skills/.system/skill-creator/scripts/quick_validate.py /Users/jiangsheng/cnb/codex/.codex/skills/codex-gui-toolchain`、`git diff --check -- .codex/skills/codex-gui-toolchain/SKILL.md`、`git diff --name-only -- .codex/skills/codex-gui-toolchain/SKILL.md`。
- `subdelegation`：false。
- `executionContext`：Codex `dev` 主工作区与隔离 `uv` runner。
- `resourceLocks`：GUI skill file read；`uv` cache write。
- `owner`：GUI 验证 owner。
- `verification`：所有命令成功且 name set 精确；不把 quick validation 当行为验收。
- `failureDomain`：本节点、GUI stage、commit 与最终审计。
- `replanTriggers`：validator 路径、`uv`、skill schema、candidate file 或命令范围变化。
- `authorizationGate`：`grantSource=用户确认本计划`；`grantedOperation=运行精确 GUI 结构验证`；`parameterBounds=上述三条命令与临时 uv 状态`；`status=pending`；`requiredApprovalIds=[]`。

### CONFIG-FAN-IN

- `nodeId`：`CONFIG-FAN-IN`。
- `taskBoundary`：`CONFIG`。
- `operationKind`：fan-in。
- `outcome`：CONFIG 三文件形成职责一致、可 stage 的稳定 candidate。
- `estimatedCost`：中。
- `deferralEvidence`：无。
- `hardPredecessors`：`CONFIG-GLOBAL-EDIT`、`CONFIG-QUICK-VALIDATE`；分别等待受保护规则候选与结构验证证据。
- `consumes`：三个候选文件、设计、专门 approval、结构验证结果。
- `produces`：CONFIG 组合审查证据。
- `completionEvidence`：全局只有短门禁；skill 只有触发/路由；reference 独占详细通用契约；approval 仍有效；无计划外 diff。
- `readSet`：CONFIG 三文件、设计、计划、排除 owner、Git diff。
- `writeSet`：无。
- `stateEffects`：只读组合审查结果。
- `commandScope`：只读三个文件与完整 path-scoped diff；可使用单引号 pattern 的 `rg -n` 检查 reference 路由和重复术语，但不得以字符串存在替代人工职责审查。
- `subdelegation`：false。
- `executionContext`：config `main` 主工作区。
- `resourceLocks`：CONFIG 三候选文件 read；approval record read。
- `owner`：CONFIG fan-in 审查 owner。
- `verification`：职责、direct fallback、静默边界、局部失败范围和 allowlist 均满足设计。
- `failureDomain`：本节点、CONFIG stage 和 commit。
- `replanTriggers`：组合 diff、approval、owner 边界、writeSet 或验证结果变化。
- `authorizationGate`：`grantSource=用户确认本计划 + global-execution-preflight-write-2026-08-27`；`grantedOperation=只读 CONFIG 组合审查`；`parameterBounds=三文件与排除 owner`；`status=pending-global-approval`；`requiredApprovalIds=[global-execution-preflight-write-2026-08-27]`。

### CONFIG-STAGE

- `nodeId`：`CONFIG-STAGE`。
- `taskBoundary`：`CONFIG`。
- `operationKind`：stage。
- `outcome`：config index 只包含 CONFIG 三文件。
- `estimatedCost`：低。
- `deferralEvidence`：无。
- `hardPredecessors`：`CONFIG-FAN-IN`；等待稳定组合 candidate 与审查证据。
- `consumes`：CONFIG 三文件 candidate、approval、组合审查结果。
- `produces`：CONFIG staged snapshot。
- `completionEvidence`：`git add` 成功并在 index 中形成待独立验证的 CONFIG staged snapshot。
- `readSet`：CONFIG 三文件 diff、config status 与 index。
- `writeSet`：config index。
- `stateEffects`：只暂存 CONFIG 三文件。
- `commandScope`：只在 `/Users/jiangsheng/cnb/codex-config` 执行 `git add -- AGENTS.md skills/managing-work-stages/SKILL.md skills/managing-work-stages/references/execution-environment-preflight.md`。
- `subdelegation`：false。
- `executionContext`：config `main` 主工作区、独立 config index。
- `resourceLocks`：`/Users/jiangsheng/cnb/codex-config/.git/index` write。
- `owner`：CONFIG 唯一 Git owner。
- `verification`：本节点不运行验证命令；由 `CONFIG-STAGED-VERIFY` 独立验证 staged snapshot 和 approval。
- `failureDomain`：本节点、`CONFIG-STAGED-VERIFY`、CONFIG commit 和最终审计。
- `replanTriggers`：index、allowlist、approval 或 candidate diff 漂移。
- `authorizationGate`：`grantSource=用户确认本计划 + global-execution-preflight-write-2026-08-27`；`grantedOperation=只暂存 CONFIG 三文件`；`parameterBounds=上述唯一 git add`；`status=pending-global-approval`；`requiredApprovalIds=[global-execution-preflight-write-2026-08-27]`。

### CONFIG-STAGED-VERIFY

- `nodeId`：`CONFIG-STAGED-VERIFY`。
- `taskBoundary`：`CONFIG`。
- `operationKind`：verification。
- `outcome`：独立证明 CONFIG staged snapshot 的完整 name set、空白、内容和 special approval 均正确。
- `estimatedCost`：中。
- `deferralEvidence`：无。
- `hardPredecessors`：`CONFIG-STAGE`；等待 index 中的 CONFIG staged snapshot。
- `consumes`：CONFIG staged snapshot、CONFIG allowlist、`global-execution-preflight-write-2026-08-27` approval id。
- `produces`：可供 CONFIG commit 消费的 staged verification 证据。
- `completionEvidence`：完整 staged name set 精确等于 CONFIG allowlist；path-scoped cached check 通过；完整 cached diff 已审阅；全局单行 diff 与 approval 文本逐字一致。
- `readSet`：config index、CONFIG 三个 staged 文件、approval record。
- `writeSet`：无。
- `stateEffects`：只产生验证输出，不改变 index 或工作树。
- `commandScope`：在 `/Users/jiangsheng/cnb/codex-config` 执行不带路径过滤的 `git diff --cached --name-only`、`git diff --cached --check -- AGENTS.md skills/managing-work-stages/SKILL.md skills/managing-work-stages/references/execution-environment-preflight.md` 和三路径完整 cached diff；只读复核 approval。
- `subdelegation`：false。
- `executionContext`：config `main` 主工作区、独立 config index。
- `resourceLocks`：`/Users/jiangsheng/cnb/codex-config/.git/index` read；approval record read。
- `owner`：CONFIG staged verification owner。
- `verification`：name set、空白、完整内容和 special approval 四项均通过。
- `failureDomain`：本节点、CONFIG commit 和最终审计。
- `replanTriggers`：index、allowlist、approval、candidate diff 或分支漂移。
- `authorizationGate`：`grantSource=用户确认本计划 + global-execution-preflight-write-2026-08-27`；`grantedOperation=只读验证 CONFIG staged snapshot`；`parameterBounds=上述 cached 读取与 approval 复核`；`status=pending-global-approval`；`requiredApprovalIds=[global-execution-preflight-write-2026-08-27]`。

### CONFIG-COMMIT

- `nodeId`：`CONFIG-COMMIT`。
- `taskBoundary`：`CONFIG`。
- `operationKind`：commit。
- `outcome`：创建独立 CONFIG 本地提交。
- `estimatedCost`：低。
- `deferralEvidence`：无。
- `hardPredecessors`：`CONFIG-STAGED-VERIFY`；等待 staged verification 证据。
- `consumes`：CONFIG staged snapshot。
- `produces`：CONFIG commit id。
- `completionEvidence`：commit tree 只含 CONFIG 三文件且与 snapshot 一致。
- `readSet`：config index、CONFIG staged files。
- `writeSet`：config `main` ref 与 index。
- `stateEffects`：创建一个本地提交。
- `commandScope`：`git commit -m 'instructions: define execution environment preflight'`、`git diff-tree --no-commit-id --name-only -r HEAD`、`git show --stat --oneline HEAD`。
- `subdelegation`：false。
- `executionContext`：config `main` 主工作区、独立 config index。
- `resourceLocks`：config index write；config `main` ref write。
- `owner`：CONFIG 唯一 Git owner。
- `verification`：最新提交文件集合精确等于 CONFIG allowlist，approval 对 commit 仍有效。
- `failureDomain`：本节点和最终审计的 CONFIG 前置。
- `replanTriggers`：staged snapshot、HEAD、branch、approval 或提交消息边界漂移。
- `authorizationGate`：`grantSource=用户确认本计划 + global-execution-preflight-write-2026-08-27`；`grantedOperation=把 CONFIG staged snapshot 创建为一个本地提交`；`parameterBounds=精确提交消息、config main、禁止额外 stage`；`status=pending-global-approval`；`requiredApprovalIds=[global-execution-preflight-write-2026-08-27]`。

### GUI-STAGE

- `nodeId`：`GUI-STAGE`。
- `taskBoundary`：`GUI`。
- `operationKind`：stage。
- `outcome`：Codex index 只包含 GUI skill 文件。
- `estimatedCost`：低。
- `deferralEvidence`：无。
- `hardPredecessors`：`GUI-QUICK-VALIDATE`；等待稳定 GUI candidate 与结构验证证据。
- `consumes`：GUI candidate diff、验证结果。
- `produces`：GUI staged snapshot。
- `completionEvidence`：`git add` 成功并在 index 中形成待独立验证的 GUI staged snapshot。
- `readSet`：GUI diff、Codex status 与 index。
- `writeSet`：Codex 主 index。
- `stateEffects`：只暂存 GUI skill 文件。
- `commandScope`：只在 `/Users/jiangsheng/cnb/codex` 执行 `git add -- .codex/skills/codex-gui-toolchain/SKILL.md`。
- `subdelegation`：false。
- `executionContext`：Codex `dev` 主工作区、主 index；DOCS commit 已释放 index。
- `resourceLocks`：`/Users/jiangsheng/cnb/codex/.git/index` write。
- `owner`：GUI 唯一 Git owner。
- `verification`：本节点不运行验证命令；由 `GUI-STAGED-VERIFY` 独立验证 staged snapshot。
- `failureDomain`：本节点、`GUI-STAGED-VERIFY`、GUI commit 和最终审计。
- `replanTriggers`：index、allowlist 或 GUI candidate diff 漂移。
- `authorizationGate`：`grantSource=用户确认本计划`；`grantedOperation=只暂存 GUI skill 文件`；`parameterBounds=上述唯一 git add`；`status=pending`；`requiredApprovalIds=[]`。

### GUI-STAGED-VERIFY

- `nodeId`：`GUI-STAGED-VERIFY`。
- `taskBoundary`：`GUI`。
- `operationKind`：verification。
- `outcome`：独立证明 GUI staged snapshot 的完整 name set、空白和内容均正确。
- `estimatedCost`：低。
- `deferralEvidence`：无。
- `hardPredecessors`：`GUI-STAGE`；等待 index 中的 GUI staged snapshot。
- `consumes`：GUI staged snapshot、GUI allowlist。
- `produces`：可供 GUI commit 消费的 staged verification 证据。
- `completionEvidence`：完整 staged name set 精确等于 GUI allowlist；path-scoped cached check 通过；完整 cached diff 已审阅。
- `readSet`：Codex index、GUI staged file。
- `writeSet`：无。
- `stateEffects`：只产生验证输出，不改变 index 或工作树。
- `commandScope`：在 `/Users/jiangsheng/cnb/codex` 执行不带路径过滤的 `git diff --cached --name-only`、`git diff --cached --check -- .codex/skills/codex-gui-toolchain/SKILL.md` 和单路径完整 cached diff。
- `subdelegation`：false。
- `executionContext`：Codex `dev` 主工作区、主 index。
- `resourceLocks`：`/Users/jiangsheng/cnb/codex/.git/index` read。
- `owner`：GUI staged verification owner。
- `verification`：name set、空白和完整内容三项均通过。
- `failureDomain`：本节点、GUI commit 和最终审计。
- `replanTriggers`：index、allowlist、candidate diff 或分支漂移。
- `authorizationGate`：`grantSource=用户确认本计划`；`grantedOperation=只读验证 GUI staged snapshot`；`parameterBounds=上述 cached 读取命令`；`status=pending`；`requiredApprovalIds=[]`。

### GUI-COMMIT

- `nodeId`：`GUI-COMMIT`。
- `taskBoundary`：`GUI`。
- `operationKind`：commit。
- `outcome`：创建独立 GUI 本地提交。
- `estimatedCost`：低。
- `deferralEvidence`：无。
- `hardPredecessors`：`GUI-STAGED-VERIFY`；等待 staged verification 证据。
- `consumes`：GUI staged snapshot。
- `produces`：GUI commit id。
- `completionEvidence`：commit tree 只含 GUI skill 文件且与 snapshot 一致。
- `readSet`：Codex index、GUI staged file。
- `writeSet`：Codex `dev` ref 与 index。
- `stateEffects`：创建一个本地提交。
- `commandScope`：`git commit -m 'docs(gui): inherit execution environment preflight'`、`git diff-tree --no-commit-id --name-only -r HEAD`、`git show --stat --oneline HEAD`。
- `subdelegation`：false。
- `executionContext`：Codex `dev` 主工作区、主 index。
- `resourceLocks`：Codex index write；Codex `dev` ref write。
- `owner`：GUI 唯一 Git owner。
- `verification`：最新提交文件集合精确等于 GUI allowlist；DOCS commit 身份仍保留。
- `failureDomain`：本节点和最终审计的 GUI 前置。
- `replanTriggers`：staged snapshot、HEAD、branch 或提交消息边界漂移。
- `authorizationGate`：`grantSource=用户确认本计划`；`grantedOperation=把 GUI staged snapshot 创建为一个本地提交`；`parameterBounds=精确提交消息、Codex dev、禁止额外 stage`；`status=pending`；`requiredApprovalIds=[]`。

### TEN-SCENARIO-AUDIT

- `nodeId`：`TEN-SCENARIO-AUDIT`。
- `taskBoundary`：无提交；跨 CONFIG/GUI 最终验证。
- `operationKind`：review。
- `outcome`：独立上下文完成十场景行为审计，证明候选规则产生设计要求的判断，而非只匹配字符串。
- `estimatedCost`：高。
- `deferralEvidence`：无；两个实施 commit 都稳定后立即执行。
- `hardPredecessors`：`CONFIG-COMMIT`、`GUI-COMMIT`；等待两个稳定 commit，避免审查 mutable diff。
- `consumes`：两个实施 commit、设计、计划、十个合成场景和排除 owner。
- `produces`：逐场景 pass/fail、证据路径行号、遗漏 owner、失败域和修正建议。
- `completionEvidence`：十项均有行为理由和证据；quick validation 结果未被当作行为结论；独立审查未得到预设答案。
- `readSet`：两个 commit 中四个实施文件、设计、计划、排除 owner。
- `writeSet`：无。
- `stateEffects`：只产生结构化对话审计结果。
- `commandScope`：只读 `git show`、`git diff`、`rg`、`sed`、`nl`；不得执行场景中的命令，不得修改文件。
- `subdelegation`：false。
- `executionContext`：独立只读上下文，跨 Codex `dev` 与 config `main` 两个稳定 commit。
- `resourceLocks`：四个实施文件与两个 commit tree read。
- `owner`：独立行为审计 owner；主协调代理抽查关键证据并作最终判断。
- `verification`：逐项检查以下十个场景：
  1. 用户真实 alias 或固化入口会激活正确环境；直接底层命令会进入错误环境。预期或已命名固化入口缺失时阻断，而项目 skill 明定的 direct entry 在没有固化入口时仍权威。
  2. 同一命令在错误 cwd、root 或 manifest 下能启动但不能命中真实目标。
  3. 当前执行身份与应执行该命令的身份不同。
  4. 必要工具缺失，在依赖批处理开始前报告，且助手不安装。
  5. 默认搜索受 ignore 或 hidden 规则过滤，目标文件实际存在。
  6. sparse worktree 缺少 schema、skill、fixture 或 generated input。
  7. 测试或生成命令成功退出，但零目标、命中错误 package 或写入错误位置。
  8. 低风险局部读取只做直接相关检查，不被迫加载完整高风险清单。
  9. 全部通过时不逐项汇报但保留正常进度更新；失败报告包含预期/实际、受阻与可继续范围。
  10. 局部环境缺口只阻断依赖节点；共享前提失败时暂停所有真实消费者，无依赖工作继续。
- `failureDomain`：失败场景对应的 owner 与消费者；不得无证据暂停另一仓库或全部十项。
- `replanTriggers`：发现遗漏 owner、direct fallback 冲突、成功静默覆盖正常进度、范围外消费者或验证无法命中行为。
- `authorizationGate`：`grantSource=用户确认本计划`；`grantedOperation=两个实施提交后的独立十场景只读审计`；`parameterBounds=十个场景、四文件和排除 owner`；`status=pending`；`requiredApprovalIds=[]`。

### FINAL-REVIEW

- `nodeId`：`FINAL-REVIEW`。
- `taskBoundary`：无提交；最终 fan-in。
- `operationKind`：fan-in。
- `outcome`：确认规则层工作完成、提交拓扑和范围正确，并明确 issue 仍待真实复核。
- `estimatedCost`：中。
- `deferralEvidence`：无。
- `hardPredecessors`：`TEN-SCENARIO-AUDIT` 全部通过；等待稳定行为审计结果。
- `consumes`：DOCS、CONFIG、GUI commit ids，十场景结果，两仓库 status。
- `produces`：最终范围、验证、提交与剩余真实复核报告。
- `completionEvidence`：三个 taskBoundary 提交身份保留；无 amend/squash；四文件之外无实施变更；issue 未修改；两个 index 状态已核对。
- `readSet`：三个 commit、两仓库 status、十场景结果、关联 issue 状态。
- `writeSet`：无。
- `stateEffects`：只产生最终对话报告。
- `commandScope`：只读 `git status --short --branch`、`git log --oneline`、path-scoped `git show` 和 issue 状态读取；禁止任何清理或远程操作。
- `subdelegation`：false。
- `executionContext`：主协调上下文，读取两个仓库稳定状态。
- `resourceLocks`：两个 commit graph、两个 index、issue read。
- `owner`：主协调代理。
- `verification`：规则层结构、行为、范围和提交拓扑全部满足本计划；不声称 issue 已修复。
- `failureDomain`：最终报告；若发现计划内问题，按下节插入修正节点，不改写已有提交。
- `replanTriggers`：commit identity、status、issue、范围或审计证据漂移。
- `authorizationGate`：`grantSource=用户确认本计划`；`grantedOperation=最终只读汇合与报告`；`parameterBounds=三个 taskBoundary、两个仓库、issue 只读`；`status=pending`；`requiredApprovalIds=[]`。

## 审计失败与修正插图

十场景审计或最终审查失败时，只暂停失败场景对应 owner 及其最终后继。主协调代理必须根据证据新增以下最小节点，重新计算 ready set，不能 amend 或重写已有提交：

1. `CONFIG-CORRECTION-EDIT` 或 `GUI-CORRECTION-EDIT`：只修正原 taskBoundary 已授权文件；若需扩大 writeSet、改变设计行为或新增 owner，停止并回到计划确认。
2. 对应 `CORRECTION-QUICK-VALIDATE`：重新运行该 skill 的精确 quick validation 和 path-scoped diff check。
3. 对应 `CORRECTION-STAGE`：只 stage 修正文件，核对 staged name set，运行 path-scoped `git diff --cached --check`。
4. 对应 `CORRECTION-COMMIT`：创建新的独立修正提交，提交消息按实际根因命名；禁止 amend、squash 或并入原提交。
5. `TEN-SCENARIO-REAUDIT`：只重新审计受修正影响及因共享契约失效的场景；不无依据重跑无关场景。

CONFIG 修正仍受 `global-execution-preflight-write-2026-08-27` 的精确目标与文本边界约束；若修正需要改变已确认全局文本，原 approval 不再覆盖，必须展示新的精确文本并取得新的专门确认。失败域之外的 ready 节点继续运行。

## 完成条件

- DOCS、CONFIG、GUI 三个 taskBoundary 各自形成独立本地提交，DOCS 严格先于任何实施编辑。
- CONFIG 与 GUI skill 的精确 quick validation 均通过，但没有把结构验证宣称为行为验收。
- 三次 stage 后均由独立 staged verification 节点完成完整 name set 核对、完整 staged diff 审阅和 path-scoped `git diff --cached --check`。
- 受保护全局文件只在独立 special approval 后按精确单行文本修改。
- 十场景独立行为审计全部通过，或计划内失败已经以新节点和独立修正提交闭环。
- direct fallback 兼容、成功静默窄定义、局部失败隔离和高低风险缩放均有行为证据。
- GUI AGENTS、worktree skill、项目根 AGENTS、`agents/openai.yaml`、issue 和产品代码保持不变。
- 没有安装、remote、force、amend、squash、worktree 创建或计划外修复。
- 最终只报告规则层完成，关联 issue 保持“🔴 仍需处理”，等待后续真实任务复核。

## 实施门禁

本计划落盘不表示计划已确认，也不授权实施、验证、stage、commit 或受保护全局文件写入。

只有用户后续明确确认本计划，才能先执行 DOCS taskBoundary。DOCS commit 完成后，按执行图启动已授权且无冲突的 ready 节点；受保护全局文件仍需独立 special approval。
