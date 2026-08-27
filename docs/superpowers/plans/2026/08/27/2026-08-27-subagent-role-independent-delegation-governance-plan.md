# 角色无关的子代理委派提示词治理实施计划

日期：2026-08-27

状态：待确认

设计确认原文：`确认修正设计并落盘`

设计依据：`docs/superpowers/specs/2026/08/27/2026-08-27-subagent-role-independent-delegation-governance-design.md`

关联 issue：

- `docs/superpowers/issues/2026/08/24/2026-08-24-02-codex-execution-process-problems/2026-08-24-07-subagent-capability-boundaries.md`

## 目标与保证边界

在不修改产品代码、不依赖 `agent_type`、不新增兼容角色路径的前提下，更新本机实际生效的全局用户指令与两个 owning skill 资源：全局规则只保留简洁不变量和 owner 路由，详细委派行为与能力信封的非强制语义分别下沉到现有 owner。

本计划只改善提示词层的任务表达、授权推理、返回后审计和越界停止行为。它不提供工具调用前的 capability enforcement，不能证明子代理受到工具级隔离，也不更新或关闭关联 P0 issue。

## 计划前事实闭包六字段

### 权威入口

- 全局委派与授权入口：`/Users/jiangsheng/cnb/codex-config/AGENTS.md`。
- 委派行为 owner：`/Users/jiangsheng/cnb/codex-config/skills/delegating-micro-stages/SKILL.md`。
- 能力信封语义 owner：`/Users/jiangsheng/cnb/codex-config/skills/action-authorization/references/capability-envelope.md`。
- 结构验证入口：`/Users/jiangsheng/.codex/skills/.system/skill-creator/scripts/quick_validate.py`，必须通过 `uv run --no-project --with pyyaml python` 运行。
- 行为验收入口：独立新上下文的五场景只读审计；`quick_validate.py` 只证明 skill 结构合法。

### 已追踪链路

- v1、v2 都可能暴露 `agent_type`，但本设计确认治理路径无论字段是否暴露都不读取、选择、传入或伪造它。
- 历史真实调用曾高频填写角色标签，但当时内置 `explorer` 配置为空，`worker` 与 `default` 没有配置文件；没有利用角色缩减工具的证据。2026 年 8 月 1615 次真实分配中 `agent_type` 使用次数为 0。
- 产品机制仍允许自定义角色改变模型或关闭有限 feature；这类实际运行时限制属于 `governing constraints`，不能被误写成“角色永远没有效果”。
- 当前 `AGENTS.md` 已声明角色和工具不产生授权，但仍把节点能力交集写成实际“有效能力”；委派 skill 与能力信封 reference 也尚未明确区分行为契约和工具级能力。
- `action-authorization/SKILL.md` 已明确不提供 capability enforcement；`delegating-micro-stages/references/execution-graph.md` 是只读消费者，不是本次修改 owner。
- `.agents/skills/**` 中存在第三方旧式角色写法，但该目录只用于自动安装的第三方 skills，不进入手工修改范围。因此验收只声明手工治理主路径角色无关，不声称所有第三方 skill 已清理。
- `~/.codex/AGENTS.md` 的 direct link target 与 fully resolved physical target 都是 `/Users/jiangsheng/cnb/codex-config/AGENTS.md`，属于同一受保护 canonical 资源。

### 修改范围

实施只允许修改：

- `/Users/jiangsheng/cnb/codex-config/AGENTS.md`
- `/Users/jiangsheng/cnb/codex-config/skills/delegating-micro-stages/SKILL.md`
- `/Users/jiangsheng/cnb/codex-config/skills/action-authorization/references/capability-envelope.md`

### 验证映射

- 对 `delegating-micro-stages` 与 `action-authorization` 分别运行规定形式的 `quick_validate.py`。
- 对三个 owner 文件运行 `git diff --check`，stage 后核对完整 staged name set、`git diff --cached --check` 与完整 staged diff。
- 只读复核 `action-authorization/SKILL.md`、`delegating-micro-stages/references/execution-graph.md` 与第三方旧角色调用，确认 owner 边界和验收声明没有扩大。
- 在独立新上下文中执行一个当前接口真实只读委派场景，以及四个反事实语义审计；真实场景只检查创建参数、返回结果和前后可观察工作区状态，反事实场景只证明规则在给定条件下的表达与推理。两者都不作为完整内部工具 trace、其他接口状态或工具级强制控制证明。

### 排除项

- 不修改 `/Users/jiangsheng/cnb/codex/codex-gui/AGENTS.md`、`/Users/jiangsheng/cnb/codex/AGENTS.md`、产品 Rust、接口 schema 或内置角色配置。
- 不修改 `action-authorization/SKILL.md`、`delegating-micro-stages/references/execution-graph.md`、`managing-work-stages/**`、`.agents/skills/**` 或关联 issue。
- 不新增角色兼容层、伪字段、skill、reference、脚本、测试、schema、fixture、快照或锁文件。
- 不创建 worktree，不安装持久依赖，不运行 Rust/GUI 构建或测试，不操作 Git remote，不使用 force、amend、squash、清理或恢复用户状态。规定的 `uv run --no-project --with pyyaml` 可以使用 `/Users/jiangsheng/.cache/uv`，cache miss 时可能只读访问包索引并写入 uv 临时 cache。

### 剩余未知

不存在会改变根因、三文件范围或验证拓扑的关键未知。受保护全局目标的专门写入确认尚未取得；它只阻塞全局文件编辑及其 CONFIG fan-in 后继，不阻塞文档提交，也不阻塞两个 skill 候选编辑。

执行前仍须只读确认两个仓库的 branch、HEAD、index、worktree、canonical symlink、`uv`、`/Users/jiangsheng/.cache/uv` 和 validator 未漂移。漂移只暂停受影响节点并触发重编图，不能借此执行 restore、stash、force 或清理。

## 当前基线与授权边界

- Codex 仓库：`/Users/jiangsheng/cnb/codex`，计划编写时为 `dev@782c3ad5af31eb59a3e95566106f92732691d44b`；本任务只有设计文档与本计划未跟踪。
- 配置仓库：`/Users/jiangsheng/cnb/codex-config`，计划编写时为 `main@0234fed83755c98cb0368dbb645af453042c0997`；worktree 与 index 干净。
- 当前请求只授权修正设计并创建本计划。用户明确确认本计划后，才授权本文精确列出的两个本地 taskBoundary、三文件实施、验证、stage、commit 和最终审计。
- 计划确认不授权受保护全局目标写入。必须再次展示本文的精确拟写文本、逻辑路径、canonical target 和影响，并取得独立明确确认。
- 未列出的编辑、生成、格式化、测试、提交、远程、安装、force、amend、squash、worktree 和清理均不授权。

## 精确修改设计

### 全局简洁规则

实施时只允许一处文本变更，不移动或重排其他规则。

把“工作阶段”中当前以“工具能力、角色、skill”开头的整条规则替换为：

```markdown
- 工具能力、角色名称、任务名称、skill、项目惯例、历史计划、能力信封或“通常需要”都不产生额外授权。角色名称与能力信封本身不构成工具级权限隔离；能力信封只是行为契约和审计边界，详细授权语义由 `$action-authorization` 负责。
```

现有“子代理”段已经把详细行为路由到 `$delegating-micro-stages`，保持不变，避免在全局文件复制角色禁令。

`GLOBAL-APPROVAL` 必须逐字展示上述一条文本、逻辑路径 `~/.codex/AGENTS.md`、canonical target `/Users/jiangsheng/cnb/codex-config/AGENTS.md` 和“单条原位替换”的影响。只有用户随后针对该展示单独明确回复“确认”“确认写入”“确认允许写入”或等价直接授权，才能激活写入；计划确认不能替代。

### 委派行为 owner

`skills/delegating-micro-stages/SKILL.md` 采用最小语义修改：

- 把节点能力信封明确称为提示词层行为契约和审计边界，不是工具集合或执行前拦截器。
- 不再用“子代理有效能力”暗示真实工具被交集强制缩减；保留授权交集作为规范性许可模型。
- 明确无论 schema 是否暴露 `agent_type`，委派都不读取、选择、传入或在任务名称中伪造 `explorer`、`worker` 等角色。
- 节点仍必须声明任务目标、动作、目标集合、副作用、禁止事项和结束条件；真实 tool schema 与 sandbox 等 `governing constraints` 仍须服从。
- 子代理返回后按风险核对报告、文件状态、Git index、命令副作用或其他可观察证据；发现越过信封时，停止该节点及消费其产物的后继，报告越界字段并重新评估受影响状态。
- 保留现有微阶段、并行调度、执行图、返回格式和 Git owner 职责，不复制授权 reference 的完整字段定义。

### 能力信封语义 owner

`skills/action-authorization/references/capability-envelope.md` 保留现有字段、构造流程和示例，同时校准：

- `effectiveCapability = parentAuthorization ∩ nodeEnvelope ∩ governingConstraints` 是提示词层规范性许可边界，不是子代理真实工具集合。
- “未声明能力默认不授予”表示按行为契约不应执行，不表示工具技术上不可调用。
- 角色、任务名称、`owner`、tool availability 与任务重要性都不能产生授权；产品已实际移除的工具属于独立 `governing constraint`。
- 信封用于委派前说明、委派后审计、越界识别、失败域隔离和生命周期管理；不提供 filesystem、Git index、网络、进程或下层子代理的强制隔离。
- 实际越界必须停止、核验和报告，不得表述为“越界不可能发生”。

## taskBoundary 与提交拓扑

### DOCS

提交消息：`docs: add role-independent delegation governance`

只包含：

- `docs/superpowers/specs/2026/08/27/2026-08-27-subagent-role-independent-delegation-governance-design.md`
- `docs/superpowers/plans/2026/08/27/2026-08-27-subagent-role-independent-delegation-governance-plan.md`

### CONFIG

提交消息：`instructions: remove agent roles from delegation governance`

只包含：

- `AGENTS.md`
- `skills/delegating-micro-stages/SKILL.md`
- `skills/action-authorization/references/capability-envelope.md`

两个 taskBoundary 各自形成独立本地提交，禁止 squash 或 amend。DOCS commit 是全部实施节点的硬前置，因为全局规则要求工作文档先形成独立本地提交。若实现后验证发现计划内问题，插入独立修正节点；已有提交的修正必须形成新的独立提交。

## 不创建 worktree 的依据

- DOCS 位于 Codex `dev`，CONFIG 位于独立的 `codex-config/main` 仓库；它们已有不同 worktree、branch 和 Git index。
- CONFIG 三文件属于一个协调一致的提示词治理任务，最终必须组合验证并由唯一 Git owner stage、commit。
- 两个 skill 文件写集合不相交，可在共享 config worktree 并发编辑；全局文件编辑受专门确认阻塞。三支在 CONFIG fan-in 前不操作共享 index。
- 新 worktree 不会消除额外写冲突，只会增加 branch、worktree metadata、集成与清理成本。

## 执行图总览

```text
DOCS-STAGE → DOCS-VERIFY → DOCS-COMMIT ─┬→ GLOBAL-APPROVAL → GLOBAL-EDIT ───────────────┐
                                        ├→ DELEGATION-EDIT → DELEGATION-VALIDATE ──────┤
                                        └→ ENVELOPE-EDIT → AUTHORIZATION-VALIDATE ─────┤
                                                                                       ↓
                                      CONFIG-FAN-IN → CONFIG-STAGE → CONFIG-VERIFY → CONFIG-COMMIT
                                                                                       ↓
                  ┌→ LIVE-ROLELESS-AUDIT ──────────────────────────────────────────────┐
                  ├→ EXPOSED-FIELD-AUDIT ──────────────────────────────────────────────┤
                  ├→ RUNTIME-CONSTRAINT-AUDIT ─────────────────────────────────────────┤
                  ├→ READONLY-CONTRACT-AUDIT ──────────────────────────────────────────┤
                  └→ WRITE-AUTHORIZATION-AUDIT ─────────────────────────────────────────┤
                                                                                       ↓
                                                               AUDIT-FAN-IN → FINAL-REVIEW
```

计划确认后的初始 ready set 只有 `DOCS-STAGE`。`DOCS-COMMIT` 后，`GLOBAL-APPROVAL`、`DELEGATION-EDIT` 与 `ENVELOPE-EDIT` 同时就绪；special approval 未取得时只暂停 `GLOBAL-EDIT` 及 CONFIG fan-in 后继，两个 skill 分支继续。

关键路径是 `DOCS → 较慢的 CONFIG 编辑/授权分支 → CONFIG fan-in/commit → 最慢的独立审计分支 → AUDIT-FAN-IN → 最终审查`。fan-out 位于 `DOCS-COMMIT` 和 `CONFIG-COMMIT`，fan-in 位于 `CONFIG-FAN-IN` 和 `AUDIT-FAN-IN`；最终审计只读取稳定 CONFIG commit，不读取可变工作区 diff。

## 节点契约

以下每个节点的 `authorizationGate.status` 在用户确认本计划前均为 `pending`；`GLOBAL-EDIT` 还必须等待专门 approval id。

### DOCS-STAGE

- `nodeId`：`DOCS-STAGE`；`taskBoundary`：`DOCS`；`operationKind`：stage；`estimatedCost`：低；`deferralEvidence`：无。
- `outcome`：Codex index 只包含已确认设计与本计划；`hardPredecessors`：用户确认本计划，等待激活的计划授权。
- `consumes` / `produces`：两份未跟踪文档与当前 index / DOCS staged snapshot；`completionEvidence`：两文件成功进入 index。
- `readSet` / `writeSet`：两份文档、Codex status/index / `/Users/jiangsheng/cnb/codex/.git/index`。
- `stateEffects`：只暂存两份文档；不编辑文件；`commandScope`：只执行两路径精确 `git add --`。
- `subdelegation`：false；`executionContext`：Codex `dev` 主工作区与 index；`resourceLocks`：Codex index write；`owner`：DOCS Git owner。
- `verification`：由 `DOCS-VERIFY` 独立完成；`failureDomain`：本节点及全图后继；`replanTriggers`：branch、HEAD、index、路径或 allowlist 漂移。
- `authorizationGate`：`grantSource=用户确认本计划`；`grantedOperation=仅暂存 DOCS 两文件`；`parameterBounds=两条精确路径`；`status=pending`；`requiredApprovalIds=[]`。

### DOCS-VERIFY

- `nodeId`：`DOCS-VERIFY`；`taskBoundary`：`DOCS`；`operationKind`：验证；`estimatedCost`：低；`deferralEvidence`：无。
- `outcome`：证明 staged name set、空白和内容正确；`hardPredecessors`：`DOCS-STAGE`，等待 staged snapshot。
- `consumes` / `produces`：DOCS staged snapshot与 allowlist / staged verification 证据；`completionEvidence`：完整 name set 精确相等、`git diff --cached --check` 通过、完整 cached diff 已审阅。
- `readSet` / `writeSet`：Codex index 与两份 staged 文档 / 无。
- `stateEffects`：只产生验证输出；`commandScope`：只读 `git diff --cached --name-only`、两路径 `git diff --cached --check` 与完整 cached diff。
- `subdelegation`：false；`executionContext`：Codex `dev` 主工作区与 index；`resourceLocks`：Codex index read；`owner`：DOCS 验证 owner。
- `verification`：三项证据全部成立；`failureDomain`：本节点及全部后继；`replanTriggers`：index、allowlist 或文档内容漂移。
- `authorizationGate`：`grantSource=用户确认本计划`；`grantedOperation=只读验证 DOCS snapshot`；`parameterBounds=上述只读命令`；`status=pending`；`requiredApprovalIds=[]`。

### DOCS-COMMIT

- `nodeId`：`DOCS-COMMIT`；`taskBoundary`：`DOCS`；`operationKind`：commit；`estimatedCost`：低；`deferralEvidence`：无。
- `outcome`：形成独立 DOCS 本地提交；`hardPredecessors`：`DOCS-VERIFY`，等待 staged verification。
- `consumes` / `produces`：DOCS staged snapshot / DOCS commit id；`completionEvidence`：commit tree 只含两份文档。
- `readSet` / `writeSet`：Codex index与 staged 文档 / Codex `dev` ref 与 index。
- `stateEffects`：创建一个本地提交；`commandScope`：精确提交消息的 `git commit` 及只读 commit 文件集合检查。
- `subdelegation`：false；`executionContext`：Codex `dev` 主工作区与 index；`resourceLocks`：Codex index 与 `dev` ref write；`owner`：DOCS Git owner。
- `verification`：最新提交文件集合等于 allowlist；`failureDomain`：本节点及全部实施后继；`replanTriggers`：snapshot、HEAD、branch 或消息边界漂移。
- `authorizationGate`：`grantSource=用户确认本计划`；`grantedOperation=创建 DOCS 本地提交`；`parameterBounds=精确提交消息、禁止额外 stage`；`status=pending`；`requiredApprovalIds=[]`。

### GLOBAL-APPROVAL

- `nodeId`：`GLOBAL-APPROVAL`；`taskBoundary`：无提交的 CONFIG 授权节点；`operationKind`：授权；`estimatedCost`：低；`deferralEvidence`：无。
- `outcome`：取得或拒绝受保护全局文件专门确认；`hardPredecessors`：`DOCS-COMMIT`，等待稳定文档提交。
- `consumes` / `produces`：本文一条精确文本、canonical 映射与保护门禁 / `global-role-independent-delegation-write-2026-08-27` approval id、明确拒绝状态或继续等待状态；`completionEvidence`：只有用户明确确认已展示文本与范围时，才产生解锁 `GLOBAL-EDIT` 的稳定 approval id。明确拒绝会使 `GLOBAL-EDIT` 与 CONFIG fan-in 后继保持暂停，继续等待不完成本节点。
- `readSet` / `writeSet`：计划、当前单条原文、symlink identity / 无文件写入。
- `stateEffects`：只产生对话授权状态；`commandScope`：只读核验后逐字展示文本、路径和影响，不调用写工具。
- `subdelegation`：false；`executionContext`：主线程；`resourceLocks`：受保护目标 read、对话授权通道 write；`owner`：主协调代理。
- `verification`：回复满足专门门禁；`failureDomain`：只暂停 `GLOBAL-EDIT` 与 CONFIG fan-in 后继；`replanTriggers`：原文、canonical identity 或拟写文本变化。
- `authorizationGate`：`grantSource=用户确认本计划`；`grantedOperation=展示精确文本并等待专门确认`；`parameterBounds=本文单条替换`；`status=pending`；`requiredApprovalIds=[]`。

### DELEGATION-EDIT

- `nodeId`：`DELEGATION-EDIT`；`taskBoundary`：`CONFIG`；`operationKind`：编辑；`estimatedCost`：中；`deferralEvidence`：无。
- `outcome`：委派 skill 完整实现无角色路径、行为契约与返回后审计；`hardPredecessors`：`DOCS-COMMIT`，等待稳定设计与计划。
- `consumes` / `produces`：设计、当前委派 skill与只读消费者 / 单文件 candidate diff；`completionEvidence`：逐项满足“委派行为 owner”且不复制能力信封字段表。
- `readSet` / `writeSet`：设计、计划、委派 skill、execution graph、授权 owner / `skills/delegating-micro-stages/SKILL.md`。
- `stateEffects`：只产生单文件未暂存 diff；`commandScope`：只用 `apply_patch` 编辑精确路径。
- `subdelegation`：false；`executionContext`：config `main` 主工作区；`resourceLocks`：委派 skill canonical file write；`owner`：委派 skill 编辑 owner。
- `verification`：内容回指设计并保持既有职责；`failureDomain`：本节点、其 validation 与 CONFIG 后继；`replanTriggers`：writeSet、owner 边界或现有结构变化。
- `authorizationGate`：`grantSource=用户确认本计划`；`grantedOperation=只编辑委派 skill`；`parameterBounds=单文件 apply_patch`；`status=pending`；`requiredApprovalIds=[]`。

### ENVELOPE-EDIT

- `nodeId`：`ENVELOPE-EDIT`；`taskBoundary`：`CONFIG`；`operationKind`：编辑；`estimatedCost`：中；`deferralEvidence`：无。
- `outcome`：能力信封 reference 明确规范性许可与真实工具能力的区别；`hardPredecessors`：`DOCS-COMMIT`，等待稳定设计与计划。
- `consumes` / `produces`：设计、当前 reference与 action owner / 单文件 candidate diff；`completionEvidence`：字段、流程与示例保留，非强制语义和越界响应完整。
- `readSet` / `writeSet`：设计、计划、action skill、reference、execution graph / `skills/action-authorization/references/capability-envelope.md`。
- `stateEffects`：只产生单文件未暂存 diff；`commandScope`：只用 `apply_patch` 编辑精确路径。
- `subdelegation`：false；`executionContext`：config `main` 主工作区；`resourceLocks`：capability reference canonical file write；`owner`：能力信封编辑 owner。
- `verification`：内容回指设计且不转移授权 owner；`failureDomain`：本节点、其 validation 与 CONFIG 后继；`replanTriggers`：writeSet、公式语义或 owner 边界变化。
- `authorizationGate`：`grantSource=用户确认本计划`；`grantedOperation=只编辑能力信封 reference`；`parameterBounds=单文件 apply_patch`；`status=pending`；`requiredApprovalIds=[]`。

### GLOBAL-EDIT

- `nodeId`：`GLOBAL-EDIT`；`taskBoundary`：`CONFIG`；`operationKind`：编辑；`estimatedCost`：低；`deferralEvidence`：无。
- `outcome`：全局文件单条规则逐字匹配专门确认；`hardPredecessors`：`DOCS-COMMIT`、`GLOBAL-APPROVAL` 成功，等待稳定计划与 approval id。
- `consumes` / `produces`：approval id、当前原文、本文精确文本 / `AGENTS.md` candidate diff；`completionEvidence`：diff 只有一条原位替换。
- `readSet` / `writeSet`：全局文件、symlink identity、approval record / `/Users/jiangsheng/cnb/codex-config/AGENTS.md`。
- `stateEffects`：只产生一条规则替换的未暂存 diff；`commandScope`：只用 `apply_patch` 执行一处精确替换。
- `subdelegation`：false；`executionContext`：config `main` 主工作区；`resourceLocks`：canonical `AGENTS.md` write；`owner`：全局规则编辑 owner。
- `verification`：diff 与 approval 逐字一致；`failureDomain`：本节点及 CONFIG 后继；`replanTriggers`：原文、canonical identity、approval text 或 writeSet 变化。
- `authorizationGate`：`grantSource=用户对已展示文本和 canonical 目标的专门确认`；`grantedOperation=只替换一条规则`；`parameterBounds=本文精确 Markdown`；`status=pending`；`requiredApprovalIds=[global-role-independent-delegation-write-2026-08-27]`。

### DELEGATION-VALIDATE

- `nodeId`：`DELEGATION-VALIDATE`；`taskBoundary`：`CONFIG`；`operationKind`：验证；`estimatedCost`：中；`deferralEvidence`：无。
- `outcome`：委派 skill entrypoint 结构合法，reference 路由、空白与候选范围分别通过只读检查；`hardPredecessors`：`DELEGATION-EDIT`，等待 candidate diff。
- `consumes` / `produces`：委派 skill、validator、`uv` / 结构验证证据；`completionEvidence`：规定命令成功，单文件 diff check 通过，候选路径正确。
- `readSet` / `writeSet`：skill目录、validator、Git diff、必要时包索引 / `/Users/jiangsheng/.cache/uv`，workspace 无写入。
- `stateEffects`：验证输出与 uv 临时 cache；不持久安装；cache miss 时允许只读访问包索引；`commandScope`：`uv run --no-project --with pyyaml python /Users/jiangsheng/.codex/skills/.system/skill-creator/scripts/quick_validate.py /Users/jiangsheng/cnb/codex-config/skills/delegating-micro-stages`、路径限定 `git diff --check`、reference 路由、status/diff 读取。
- `subdelegation`：false；`executionContext`：config `main`；`resourceLocks`：skill directory read、canonical `/Users/jiangsheng/.cache/uv` write；`owner`：委派 skill 验证 owner。
- `verification`：结构、路径与空白全部通过；`failureDomain`：本节点及 CONFIG 后继；`replanTriggers`：validator、uv、candidate 或路径漂移。
- `authorizationGate`：`grantSource=用户确认本计划`；`grantedOperation=运行精确结构验证`；`parameterBounds=上述命令`；`status=pending`；`requiredApprovalIds=[]`。

### AUTHORIZATION-VALIDATE

- `nodeId`：`AUTHORIZATION-VALIDATE`；`taskBoundary`：`CONFIG`；`operationKind`：验证；`estimatedCost`：中；`deferralEvidence`：无。
- `outcome`：action-authorization skill entrypoint 结构仍合法；被修改 reference 的路径、空白和语义由 diff 与 fan-in 检查证明；`hardPredecessors`：`ENVELOPE-EDIT`，等待 candidate diff。
- `consumes` / `produces`：action skill目录、validator、`uv` / 结构验证证据；`completionEvidence`：规定命令成功，reference diff check 通过，候选路径正确。
- `readSet` / `writeSet`：skill目录、validator、Git diff、必要时包索引 / `/Users/jiangsheng/.cache/uv`，workspace 无写入。
- `stateEffects`：验证输出与 uv 临时 cache；不持久安装；cache miss 时允许只读访问包索引；`commandScope`：`uv run --no-project --with pyyaml python /Users/jiangsheng/.codex/skills/.system/skill-creator/scripts/quick_validate.py /Users/jiangsheng/cnb/codex-config/skills/action-authorization`、reference 路径限定 `git diff --check`、路由与 status/diff 读取。
- `subdelegation`：false；`executionContext`：config `main`；`resourceLocks`：skill directory read、canonical `/Users/jiangsheng/.cache/uv` write；`owner`：授权 skill 验证 owner。
- `verification`：结构、路径与空白全部通过；`failureDomain`：本节点及 CONFIG 后继；`replanTriggers`：validator、uv、candidate 或路径漂移。
- `authorizationGate`：`grantSource=用户确认本计划`；`grantedOperation=运行精确结构验证`；`parameterBounds=上述命令`；`status=pending`；`requiredApprovalIds=[]`。

### CONFIG-FAN-IN

- `nodeId`：`CONFIG-FAN-IN`；`taskBoundary`：`CONFIG`；`operationKind`：fan-in 审查；`estimatedCost`：中；`deferralEvidence`：无。
- `outcome`：三文件组合 diff 语义一致且范围精确；`hardPredecessors`：`GLOBAL-EDIT`、`DELEGATION-VALIDATE`、`AUTHORIZATION-VALIDATE`，等待三支稳定 candidate 与验证证据。
- `consumes` / `produces`：三文件 diff、设计、只读消费者与两项验证 / 可 stage 的组合审查证据；`completionEvidence`：手工 owning 治理主路径不读取、选择、传入或伪造角色，runtime constraint 表述准确，能力信封非强制，排除项无变化。
- `readSet` / `writeSet`：三目标文件、设计、`action-authorization/SKILL.md`、execution graph、第三方旧角色 skill、Git status/diff / 无。
- `stateEffects`：只读审查输出；`commandScope`：只读完整 diff、定向 `rg`、路径存在性与 status 检查。
- `subdelegation`：false；`executionContext`：config `main`；`resourceLocks`：三目标 canonical files read；`owner`：CONFIG fan-in owner。
- `verification`：设计不变量、owner 边界、范围和已知事实全部一致；`failureDomain`：本节点及 CONFIG stage/commit 后继；`replanTriggers`：新增路径、消费者冲突、事实表述或 writeSet 变化。
- `authorizationGate`：`grantSource=用户确认本计划`；`grantedOperation=只读组合审查`；`parameterBounds=三目标与只读消费者`；`status=pending`；`requiredApprovalIds=[]`。

### CONFIG-STAGE

- `nodeId`：`CONFIG-STAGE`；`taskBoundary`：`CONFIG`；`operationKind`：stage；`estimatedCost`：低；`deferralEvidence`：无。
- `outcome`：config index 只包含三目标文件；`hardPredecessors`：`CONFIG-FAN-IN`，等待可 stage 证据。
- `consumes` / `produces`：三文件 candidate diff / CONFIG staged snapshot；`completionEvidence`：精确 `git add --` 成功。
- `readSet` / `writeSet`：三目标文件、status 与 `/Users/jiangsheng/cnb/codex-config/.git/index` / `/Users/jiangsheng/cnb/codex-config/.git/index`。
- `stateEffects`：只暂存三文件，不编辑；`commandScope`：三路径精确 `git add --`。
- `subdelegation`：false；`executionContext`：config `main` 主工作区与 index；`resourceLocks`：canonical `/Users/jiangsheng/cnb/codex-config/.git/index` write；`owner`：CONFIG Git owner。
- `verification`：由 `CONFIG-VERIFY` 独立完成；`failureDomain`：本节点及 CONFIG 后继；`replanTriggers`：index、allowlist 或 candidate 漂移。
- `authorizationGate`：`grantSource=用户确认本计划`；`grantedOperation=仅暂存三目标文件`；`parameterBounds=三路径`；`status=pending`；`requiredApprovalIds=[]`。

### CONFIG-VERIFY

- `nodeId`：`CONFIG-VERIFY`；`taskBoundary`：`CONFIG`；`operationKind`：验证；`estimatedCost`：低；`deferralEvidence`：无。
- `outcome`：独立证明 staged name set、空白和完整内容正确；`hardPredecessors`：`CONFIG-STAGE`，等待 staged snapshot。
- `consumes` / `produces`：CONFIG staged snapshot与 allowlist / staged verification 证据；`completionEvidence`：完整 name set 精确相等、cached check 通过、完整 cached diff 已审阅。
- `readSet` / `writeSet`：`/Users/jiangsheng/cnb/codex-config/.git/index` 与三份 staged 文件 / 无。
- `stateEffects`：只产生验证输出；`commandScope`：只读完整 name set、三路径 `git diff --cached --check` 与完整 cached diff。
- `subdelegation`：false；`executionContext`：config `main` 主工作区与 index；`resourceLocks`：canonical `/Users/jiangsheng/cnb/codex-config/.git/index` read；`owner`：CONFIG staged verification owner。
- `verification`：三项证据全部成立；`failureDomain`：本节点及 CONFIG commit 后继；`replanTriggers`：index、allowlist 或 staged content 漂移。
- `authorizationGate`：`grantSource=用户确认本计划`；`grantedOperation=只读验证 CONFIG snapshot`；`parameterBounds=上述只读命令`；`status=pending`；`requiredApprovalIds=[]`。

### CONFIG-COMMIT

- `nodeId`：`CONFIG-COMMIT`；`taskBoundary`：`CONFIG`；`operationKind`：commit；`estimatedCost`：低；`deferralEvidence`：无。
- `outcome`：形成独立 CONFIG 本地提交；`hardPredecessors`：`CONFIG-VERIFY`，等待 staged verification。
- `consumes` / `produces`：CONFIG staged snapshot / CONFIG commit id；`completionEvidence`：commit tree 只含三目标文件。
- `readSet` / `writeSet`：`/Users/jiangsheng/cnb/codex-config/.git/index` 与 staged 文件 / config `main` ref 与 `/Users/jiangsheng/cnb/codex-config/.git/index`。
- `stateEffects`：创建一个本地提交；`commandScope`：精确提交消息的 `git commit` 及只读 commit 文件集合检查。
- `subdelegation`：false；`executionContext`：config `main` 主工作区与 index；`resourceLocks`：canonical `/Users/jiangsheng/cnb/codex-config/.git/index` 与 `main` ref write；`owner`：CONFIG Git owner。
- `verification`：最新提交文件集合等于 allowlist；`failureDomain`：本节点及最终行为审计；`replanTriggers`：snapshot、HEAD、branch 或消息边界漂移。
- `authorizationGate`：`grantSource=用户确认本计划`；`grantedOperation=创建 CONFIG 本地提交`；`parameterBounds=精确提交消息、禁止额外 stage`；`status=pending`；`requiredApprovalIds=[]`。

### LIVE-ROLELESS-AUDIT

- `nodeId`：`LIVE-ROLELESS-AUDIT`；`taskBoundary`：无提交的最终验证；`operationKind`：验证；`estimatedCost`：中；`deferralEvidence`：无。
- `outcome`：在当前未暴露 `agent_type` 的真实接口中完成一次角色无关只读委派；`hardPredecessors`：`CONFIG-COMMIT`，等待稳定 commit。
- `consumes` / `produces`：稳定 CONFIG commit、当前真实 spawn schema、固定只读任务 / 独立子代理结果与 pre/post 状态证据；`completionEvidence`：创建参数不含角色字段，返回结果准确引用指定设计文档，config pre/post status 无变化。
- `readSet` / `writeSet`：三目标文件、设计文档与 config Git status / 无 workspace 写入。
- `stateEffects`：只产生一个子代理会话与审计结果；`commandScope`：主协调代理创建一个任务名明确、无 `agent_type` 的子代理；被创建节点仅核对设计文档状态和两项决策；协调者只读比较创建参数、返回结果与 config pre/post status。
- `subdelegation`：false，明确约束被创建的审计子代理不得继续委派；`executionContext`：主协调线程负责 dispatch 与 pre/post 核对，被创建节点在一个全新独立子代理上下文执行固定任务；`resourceLocks`：稳定 CONFIG commit、设计文档与 config status read；`owner`：主协调代理是唯一节点 owner，独立审计子代理只执行 owner 下发的固定只读微阶段。
- `verification`：只证明当前真实接口下创建参数无角色、返回结果成立且没有可观察 workspace 变化；因无完整内部 trace 入口，不证明禁止工具从未启动，也不外推字段暴露或工具级 enforcement；`failureDomain`：本节点与 `AUDIT-FAN-IN` 后继；`replanTriggers`：spawn schema、返回结果、指定 readSet 或 config 状态变化。
- `authorizationGate`：`grantSource=用户确认本计划`；`grantedOperation=创建一次固定只读审计子任务，并只读核对创建参数、返回结果与 config pre/post status`；`parameterBounds=一个新上下文、固定设计文档、无写入`；`status=pending`；`requiredApprovalIds=[]`。

### EXPOSED-FIELD-AUDIT

- `nodeId`：`EXPOSED-FIELD-AUDIT`；`taskBoundary`：无提交的最终验证；`operationKind`：审查；`estimatedCost`：低；`deferralEvidence`：无。
- `outcome`：反事实审查确认当 schema 暴露可选 `agent_type` 时，规则仍要求省略该字段；`hardPredecessors`：`CONFIG-COMMIT`，等待稳定 commit。
- `consumes` / `produces`：稳定 CONFIG commit、明确标注为假设的 exposed-field schema / 独立语义审查结果；`completionEvidence`：结果引用 owning skill，并把结论限定为反事实规则推理。
- `readSet` / `writeSet`：三目标文件与假设 schema / 无。
- `stateEffects`：只产生对话审查结果；`commandScope`：只读目标文件并分析给定假设，不调用 spawn、write、stage、commit 或 remote。
- `subdelegation`：false；`executionContext`：与其他场景隔离的全新子代理上下文；`resourceLocks`：稳定 CONFIG commit read；`owner`：exposed-field 审查 owner。
- `verification`：只证明规则表达在该假设下不选择或传入角色，不声称真实 schema 已切换；`failureDomain`：本节点与 `AUDIT-FAN-IN` 后继；`replanTriggers`：规则无法推出唯一行为或需要真实 schema fixture。
- `authorizationGate`：`grantSource=用户确认本计划`；`grantedOperation=独立只读反事实审查`；`parameterBounds=exposed-field 单场景`；`status=pending`；`requiredApprovalIds=[]`。

### RUNTIME-CONSTRAINT-AUDIT

- `nodeId`：`RUNTIME-CONSTRAINT-AUDIT`；`taskBoundary`：无提交的最终验证；`operationKind`：审查；`estimatedCost`：低；`deferralEvidence`：无。
- `outcome`：反事实审查确认工具已被独立运行时约束移除时，规则服从真实 tool schema 但不建立角色治理；`hardPredecessors`：`CONFIG-COMMIT`。
- `consumes` / `produces`：稳定 CONFIG commit、明确标注为假设的缩减 tool schema / 独立语义审查结果；`completionEvidence`：区分 runtime constraint、授权与能力信封。
- `readSet` / `writeSet`：三目标文件与假设 tool schema / 无。
- `stateEffects`：只产生对话审查结果；`commandScope`：只读目标文件并分析给定假设，不调用被假设移除的工具或任何写操作。
- `subdelegation`：false；`executionContext`：与其他场景隔离的全新子代理上下文；`resourceLocks`：稳定 CONFIG commit read；`owner`：runtime constraint 审查 owner。
- `verification`：只证明规则能正确解释该假设，不证明本机已配置角色缩减；`failureDomain`：本节点与 `AUDIT-FAN-IN` 后继；`replanTriggers`：把 runtime constraint 写成授权或角色治理路径。
- `authorizationGate`：`grantSource=用户确认本计划`；`grantedOperation=独立只读反事实审查`；`parameterBounds=runtime-constraint 单场景`；`status=pending`；`requiredApprovalIds=[]`。

### READONLY-CONTRACT-AUDIT

- `nodeId`：`READONLY-CONTRACT-AUDIT`；`taskBoundary`：无提交的最终验证；`operationKind`：审查；`estimatedCost`：低；`deferralEvidence`：无。
- `outcome`：独立审查确认只读信封被描述为行为契约、返回后审计依据和越界停止条件，而非工具隔离；`hardPredecessors`：`CONFIG-COMMIT`。
- `consumes` / `produces`：稳定 CONFIG commit、固定只读节点案例 / 独立语义审查结果；`completionEvidence`：结果同时给出允许行为、实际状态核对与越界响应。
- `readSet` / `writeSet`：三目标文件与只读案例 / 无。
- `stateEffects`：只产生对话审查结果；`commandScope`：只读目标文件并分析案例，不执行案例中的写操作。
- `subdelegation`：false；`executionContext`：与其他场景隔离的全新子代理上下文；`resourceLocks`：稳定 CONFIG commit read；`owner`：readonly contract 审查 owner。
- `verification`：只证明规则表达和决策，不证明任意未来子代理一定遵守；`failureDomain`：本节点与 `AUDIT-FAN-IN` 后继；`replanTriggers`：出现“技术上不能调用”或“越界不可能”等表述。
- `authorizationGate`：`grantSource=用户确认本计划`；`grantedOperation=独立只读案例审查`；`parameterBounds=readonly-contract 单场景`；`status=pending`；`requiredApprovalIds=[]`。

### WRITE-AUTHORIZATION-AUDIT

- `nodeId`：`WRITE-AUTHORIZATION-AUDIT`；`taskBoundary`：无提交的最终验证；`operationKind`：审查；`estimatedCost`：低；`deferralEvidence`：无。
- `outcome`：反事实审查确认父任务与节点均明确授予写入时，规则不会仅因缺少角色或硬隔离而一律拒绝；`hardPredecessors`：`CONFIG-COMMIT`。
- `consumes` / `produces`：稳定 CONFIG commit、明确写授权但不要求实际执行的案例 / 独立语义审查结果；`completionEvidence`：结果允许在其余门禁满足时继续，同时保留审计要求。
- `readSet` / `writeSet`：三目标文件与写授权案例 / 无；本节点不执行 positive-control 写入。
- `stateEffects`：只产生对话审查结果；`commandScope`：只读目标文件并进行授权判断，不调用 write、stage、commit 或 remote。
- `subdelegation`：false；`executionContext`：与其他场景隔离的全新子代理上下文；`resourceLocks`：稳定 CONFIG commit read；`owner`：write authorization 审查 owner。
- `verification`：只证明授权推理没有过度设门，不证明实际写入行为；`failureDomain`：本节点与 `AUDIT-FAN-IN` 后继；`replanTriggers`：规则退化为无工具隔离即禁止全部写入。
- `authorizationGate`：`grantSource=用户确认本计划`；`grantedOperation=独立只读反事实审查`；`parameterBounds=write-authorization 单场景、零 workspace 写入`；`status=pending`；`requiredApprovalIds=[]`。

### AUDIT-FAN-IN

- `nodeId`：`AUDIT-FAN-IN`；`taskBoundary`：无提交的最终验证；`operationKind`：fan-in 审查；`estimatedCost`：低；`deferralEvidence`：无。
- `outcome`：汇总一个真实场景与四个反事实场景，严格标注各自证明边界；`hardPredecessors`：五个独立审计节点，等待全部结果。
- `consumes` / `produces`：五份独立结果、稳定 CONFIG commit / 汇总审计结论；`completionEvidence`：逐场景给出通过/失败、证据和不可外推项。
- `readSet` / `writeSet`：五份对话结果、必要 trace 与稳定 commit / 无。
- `stateEffects`：只产生汇总结论；`commandScope`：只读比较五份结果，不重跑、重试或修改。
- `subdelegation`：false；`executionContext`：主协调线程；`resourceLocks`：五份稳定结果 read；`owner`：审计 fan-in owner。
- `verification`：不得把反事实审查改称真实运行证明；`failureDomain`：本节点与最终完成；`replanTriggers`：任一场景失败、证据缺失或证明范围被夸大。
- `authorizationGate`：`grantSource=用户确认本计划`；`grantedOperation=只读汇总五场景`；`parameterBounds=已完成结果、不重试`；`status=pending`；`requiredApprovalIds=[]`。

### FINAL-REVIEW

- `nodeId`：`FINAL-REVIEW`；`taskBoundary`：无提交的最终汇合；`operationKind`：审查；`estimatedCost`：低；`deferralEvidence`：无。
- `outcome`：确认基础两个提交、所有计划内修正提交、三文件范围、验证证据和 issue 保留边界完整；`hardPredecessors`：`AUDIT-FAN-IN`，等待汇总审计结果及可能插入的修正链完成。
- `consumes` / `produces`：DOCS commit、CONFIG commit、所有计划内修正 commit id、验证证据与仓库状态 / 最终完成报告；`completionEvidence`：全部提交文件集合、工作区状态、排除项和非强制声明均符合计划。
- `readSet` / `writeSet`：两个仓库的 commit/status、三目标与两文档 / 无。
- `stateEffects`：只产生最终报告；`commandScope`：只读 `git status`、`git show`、文件集合和差异检查。
- `subdelegation`：false；`executionContext`：主协调线程；`resourceLocks`：两个稳定仓库状态 read；`owner`：主协调代理。
- `verification`：不关闭 issue，不声称工具级控制，不存在范围外修改、remote、force、amend 或 squash；`failureDomain`：只影响最终完成声明；`replanTriggers`：提交或工作区状态与计划不符。
- `authorizationGate`：`grantSource=用户确认本计划`；`grantedOperation=最终只读审查与汇报`；`parameterBounds=基础两个提交、所有计划内修正提交及计划范围`；`status=pending`；`requiredApprovalIds=[]`。

## 调度与失败规则

- 每个节点完成、失败、释放资源或触发重编图后，先重新计算 ready set，再处理等待或汇报。
- 同一 config worktree 中两个 skill 编辑可并行，因为 writeSet 不相交；对应 validation 只等待自己的 candidate。两个 validation 共用 canonical `/Users/jiangsheng/.cache/uv` write lock，可以同时进入 ready set，但同一时刻只有一个节点取得锁；另一节点保持 ready 并等待资源，不制造 DAG 依赖。
- `GLOBAL-APPROVAL` 等待用户时，两个 skill 分支继续；没有 special approval 时不得以任何路径表示、脚本或格式化绕过全局文件门禁。
- 任一节点越过 writeSet、动作族、命令、副作用或 special approval，立即停止其失败域并返回精确缺口；无依赖分支继续。
- 计划内验证发现的问题只在原目标、三文件、语义和授权范围内插入 `CONFIG-FIX-EDIT → CONFIG-FIX-VALIDATE → CONFIG-FIX-STAGE → CONFIG-FIX-VERIFY → CONFIG-FIX-COMMIT` 修正链，并重新运行受影响的独立审计节点与 `AUDIT-FAN-IN`。修正已有 CONFIG commit 时必须创建新的独立 commit，全部修正 commit id 进入 `FINAL-REVIEW`；需要扩大文件、改变角色政策、修改产品或增加工具级 enforcement 时，停止并重新确认。

## 计划完成标准

- DOCS 与 CONFIG 两个基础本地提交均形成并保持独立；如产生计划内修正，所有修正提交也保持独立，均未 squash、未 amend。
- CONFIG commit 只含三个 owner 文件，最终文本完全不使用 `agent_type` 作为治理路径，同时准确承认独立运行时约束可能真实缩减工具。
- 两个 skill entrypoint 的 `quick_validate.py`、reference/diff/staged 检查、一个当前接口真实审计、四个独立反事实语义审计和最终范围审查全部通过。
- `/Users/jiangsheng/cnb/codex/codex-gui/AGENTS.md`、产品源码、第三方 skills 和关联 issue 未修改。
- 最终报告明确：结构、当前接口的一次真实只读委派和四类提示词层推理已验证；字段暴露、角色 runtime constraint、写入 positive control 与工具级强制隔离均未被真实运行证明。
