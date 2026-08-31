# 计划外有状态诊断授权提示词治理实施计划

日期：2026-08-31

状态：已确认

确认日期：2026-08-31

确认原文：确认，开始进行

对应设计：`docs/superpowers/specs/2026/08/31/2026-08-31-diagnostic-stateful-operation-authorization-prompt-governance-design.md`

关联 research：`docs/superpowers/research/2026/08/31/2026-08-31-diagnostic-stateful-operation-authorization.md`

计划分支：`dev`

计划时 HEAD：`1b6b3dc6a68a1c2844f9d02baafd6efc4aef8315`

## 目标

按已确认设计修正全局提示词与两个 canonical skills，使计划外调查需要有状态诊断动作时先请求用户授权，授权前不得换载体绕行，授权后只按实际授权执行，已确认计划覆盖时不重复请求；同时允许已明确授权的调查期诊断测试跨等待、设计和计划保留，并在正式进入已授权修复阶段时删除、依据根因重写正式回归测试、先红后修复再转绿。

本计划只修改提示词治理文件，不处理 Chip 焦点 BUG，不建设提示词行为测试 harness。最终只能声明结构与静态语义验证通过，并明确报告“实际提示词遵循行为未验证”。

## 已确认约束

- 全局提示词保持简洁，详细语义由 owning skills 承载。
- 禁止绕行只适用于取得授权前；取得授权后按实际授权内容判断，不永久禁止 worktree、临时目录、项目快照或其他载体。
- 已确认计划精确覆盖的动作、目标、载体和副作用不重复请求授权。
- 调查期诊断测试不得因当前回合停止、等待、设计或计划而删除。
- 正式进入已授权修复阶段时删除诊断测试，依据已确认根因重写正式回归测试，并在修改产品代码前验证失败。
- 不修改第三方 `.agents/skills/diagnosing-bugs/**`、`codex-gui/AGENTS.md` 或项目根 `AGENTS.md`。
- 不创建临时项目、临时快照、临时测试、throwaway harness 或临时 worktree。
- 不运行提示词 negative/positive 行为验收；静态案例不能冒充实际行为证明。
- 每个计划任务形成独立本地提交；禁止 amend、squash、force 和 Git remote。

## 计划前证据摘要

### 权威入口

- 常驻全局入口是 `codex-config/AGENTS.md`；`~/.codex/AGENTS.md` 是指向它的符号链接，两者是同一受保护 canonical target。
- 动作授权入口是 `codex-config/skills/action-authorization/SKILL.md`，详细动作族与事故案例分别由 `references/action-families.md` 和 `references/incident-acceptance-cases.md` 拥有。
- 调查阶段例外入口是 `codex-config/skills/managing-work-stages/references/read-only-and-exceptions.md`。

### 已追踪链路

- 全局“系统临时目录不受项目外主动改动二次确认门禁”的豁免可能被误读为有状态诊断授权。
- `action-families.md` 当前把调研和诊断限定为只读，但没有专门说明计划外有状态诊断如何请求授权、如何处理载体变化和计划覆盖。
- `action-authorization/SKILL.md` 当前没有计划外有状态诊断的按需路由；只改 reference 会产生可达性缺口。
- `read-only-and-exceptions.md` 当前绝对禁止调查期 workspace 变更，与“用户明确授权调查期添加诊断测试”的目标冲突。
- 第三方 `diagnosing-bugs` 强制先建立反馈环并列出 failing test、headless script 与 throwaway harness，证明冲突压力真实存在，但不改变第三方 skill 的只读边界。

### 修改范围

`codex-config` 中只修改以下 5 个文件：

```text
AGENTS.md
skills/action-authorization/SKILL.md
skills/action-authorization/references/action-families.md
skills/action-authorization/references/incident-acceptance-cases.md
skills/managing-work-stages/references/read-only-and-exceptions.md
```

`codex` 中只创建并提交本设计与本计划两个工作文档。

### 验证映射

- `action-authorization`：规定的 `quick_validate.py`、reference 路由可达性、动作族语义、事故案例正反覆盖、精确 diff 与 whitespace。
- `managing-work-stages`：规定的 `quick_validate.py`、调查期窄例外、跨阶段保留、修复期删除/重写/先红后绿顺序、精确 diff 与 whitespace。
- 全局 `AGENTS.md`：受保护 canonical identity、精确拟写内容、简洁性、与 skill owner 不重复、精确 diff 与 whitespace。
- 最终组合状态：独立只读静态反向审计和提交拓扑核验。

### 排除项

- `codex/AGENTS.md`、`codex/codex-gui/AGENTS.md`、产品代码、GUI tests 和 Chip 焦点 BUG。
- `codex-config/.agents/**`、两个 skills 的 `agents/openai.yaml`。
- `authorization-record.md`、`capability-envelope.md`、`stage-gates.md`。
- 提示词行为测试基础设施、临时载体与真实 behavior acceptance。
- Git remote、force、amend、squash、安装依赖和持久运行状态。

### 剩余未知

- 无会改变 owner、写集合或静态验证方式的关键事实未知。
- 全局受保护文件和全部 `codex-config` 项目外修改尚未取得实施授权；这只阻塞实现节点，不阻塞工作文档落盘与提交。
- 实施开始时若 branch、工作树、符号链接、工具来源或目标文件状态漂移，P0 节点触发重新预检。

## 精确拟写边界

### 全局 `AGENTS.md`

在现有“项目外主动改动二次确认”规则中只补入以下句子，不改写该规则的其他语义：

> 该豁免、载体的临时性质或工具可用性均不产生有状态诊断动作授权；计划外调查需要此类动作时，必须先向用户请求授权。

实施前必须把这段精确文字、canonical target、全部项目外修改和副作用再次展示给用户，并取得当前唯一确认点上的独立明确“确认”“确认写入”“确认允许写入”或等价授权。计划确认不能替代该 special approval。

### `action-authorization`

- `SKILL.md`：在按需路由中增加“计划外有状态诊断或载体变化”读取 `action-families.md` 与 `incident-acceptance-cases.md` 的明确入口。
- `action-families.md`：定义有状态诊断不属于只读诊断的固有步骤；缺少授权时请求精确动作、目标、载体、副作用和生命周期；授权前禁止换载体绕行；授权后只按实际授权；计划已覆盖时不重复请求。
- `incident-acceptance-cases.md`：增加 negative control、明确授权后的 positive control 和计划覆盖不重复请求案例；只记录静态验收契约，不声称已运行行为测试。

### `managing-work-stages`

`read-only-and-exceptions.md` 增加已明确授权的调查期诊断测试窄例外，并保持以下顺序与边界：调查、等待、设计和计划期间保留；正式进入已授权修复阶段时删除；依据已确认根因重写正式回归测试；修改产品代码前验证失败；修复后验证转绿。该例外不授权产品修复、重构、stage、commit 或其他动作族。

## 执行环境与命令预检

- 工作文档仓库：`/Users/jiangsheng/cnb/codex`，branch `dev`，共享工作树与该仓库 Git index。
- 提示词仓库：`/Users/jiangsheng/cnb/codex-config`，branch `main`，共享工作树与该仓库 Git index。
- 不创建 worktree。三个治理任务的编辑写集合互不相交，可并行编辑；stage、commit 和 branch 更新通过同一 canonical Git index 与 branch 锁串行。
- 已只读核验 `/opt/homebrew/bin/uv` 与 `/Users/jiangsheng/.codex/skills/.system/skill-creator/scripts/quick_validate.py` 存在。
- 两个 skill 分别运行：

  ```text
  uv run --no-project --with pyyaml python /Users/jiangsheng/.codex/skills/.system/skill-creator/scripts/quick_validate.py /Users/jiangsheng/cnb/codex-config/skills/action-authorization
  uv run --no-project --with pyyaml python /Users/jiangsheng/.codex/skills/.system/skill-creator/scripts/quick_validate.py /Users/jiangsheng/cnb/codex-config/skills/managing-work-stages
  ```

- `quick_validate.py` 只证明结构有效。不得安装替代依赖、改用其他 Python 入口或把成功退出解释为行为验收。

## 任务与提交拓扑

### DOCS

写集合：本设计与本计划。

提交说明：

```text
docs: design stateful diagnostic authorization
```

### AUTHORIZATION

写集合：`action-authorization/SKILL.md`、`action-families.md`、`incident-acceptance-cases.md`。

提交说明：

```text
instructions: govern stateful diagnostic authorization
```

### STAGES

写集合：`managing-work-stages/references/read-only-and-exceptions.md`。

提交说明：

```text
instructions: govern diagnostic test lifecycle
```

### GLOBAL

写集合：`codex-config/AGENTS.md`。

提交说明：

```text
instructions: disambiguate temporary carrier authorization
```

三个治理提交相互独立，最终状态同时需要三者。共享 Git index 与 `main` branch 只形成动态资源冲突，不伪造语义依赖；提交节点取得锁后按实际就绪顺序形成三个独立提交。

## 描述式执行 DAG

### 通用节点契约

除节点另行覆盖外，所有节点使用以下能力与调度边界：

```yaml
estimatedCost: 低；编辑与独立审查节点为中
deferralEvidence: 无；资源冲突只使 ready 节点等待 canonical lock
subdelegation: false
owner: 由执行协调者分配的单一节点 owner；owner 不产生授权
replanTriggers: 写集合扩大、目标 canonical identity 漂移、branch 或 baseline 漂移、owner 冲突、验证入口失真、需要行为 harness 或需要修改排除文件
authorizationGate:
  objective: 实施已确认的计划外有状态诊断授权提示词治理
  grantSource: 用户对本计划的明确确认；项目外与受保护目标节点还必须消费 A0 的独立确认
  negativeConstraints: [不修改声明 writeSet 外文件, 不创建临时载体或 worktree, 不运行提示词行为验收, 不安装依赖, 不操作 Git remote, 不使用 force/amend/squash, 不恢复或提交范围外变更]
  specialApprovals: []
  requiredApprovalIds: []
  subdelegation: false
  lifecycle: 节点完成、失败、撤销或前提漂移时到期
  status: pending-plan-confirmation
```

每个执行节点在启动前还必须由 `$action-authorization` 补齐对应的 `phase`、`operationKind`、`outcome`、`grantedOperation`、`allowedOperations`、`parameterBounds`、`readSet`、`writeSet`、`canonicalTargets`、`stateEffects`、`commandScope`、`requiredApprovalIds` 和当前 `status`；缺失字段不得由计划文本临场猜测。

### 工作文档屏障

#### D1：验证工作文档

```yaml
nodeId: D1
taskBoundary: DOCS
operationKind: 验证
outcome: 两个工作文档存在、语义一致且通过 whitespace 与隐私边界检查
hardPredecessors: []
consumes: 已确认设计、待确认后激活的本计划、项目文档规则
produces: DOCS 验证证据
completionEvidence: 两个文件存在；git diff --check 成功；文档内容与确认结果一致
readSet: [设计文档, 计划文档, codex/AGENTS.md]
writeSet: []
stateEffects: 仅验证输出
commandScope: [test, sed, rg, git diff --check]
executionContext: codex/dev，共享工作树
resourceLocks: [两个工作文档 read, codex Git index read]
verification: 文档范围、语义、路径、隐私和 whitespace
failureDomain: D1 及全部后继
authorizationGate.status: pending-plan-confirmation
```

#### D2：暂存工作文档

```yaml
nodeId: D2
taskBoundary: DOCS
operationKind: stage
outcome: codex Git index 只加入本设计与本计划
hardPredecessors: [D1：等待已验证工作文档]
consumes: DOCS 验证证据
produces: DOCS staged snapshot
completionEvidence: git diff --cached --name-only 精确列出两个工作文档
readSet: [两个工作文档]
writeSet: [codex/.git/index]
stateEffects: 精确暂存两个工作文档
commandScope: [git add -- 两个精确路径, git diff --cached --name-only]
executionContext: codex/dev，共享 Git index
resourceLocks: [codex/.git/index write]
verification: staged 路径集合精确匹配
failureDomain: D2 及全部后继
authorizationGate.status: pending-plan-confirmation
```

#### D3：审查 staged 工作文档

```yaml
nodeId: D3
taskBoundary: DOCS
operationKind: 审查
outcome: staged 工作文档无范围外内容或格式错误
hardPredecessors: [D2：等待精确 staged snapshot]
consumes: DOCS staged snapshot
produces: staged 工作文档审查证据
completionEvidence: git diff --cached --check 成功；完整 staged diff 已审查且与 D1 一致
readSet: [codex/.git/index]
writeSet: []
stateEffects: 仅审查输出
commandScope: [git diff --cached --check, git diff --cached]
executionContext: codex/dev
resourceLocks: [codex/.git/index read]
verification: staged 内容、路径和 whitespace
failureDomain: D3 及全部后继
authorizationGate.status: pending-plan-confirmation
```

#### D4：提交工作文档

```yaml
nodeId: D4
taskBoundary: DOCS
operationKind: commit
outcome: 创建只包含设计与计划的本地提交
hardPredecessors: [D3：等待 staged 审查证据]
consumes: staged 工作文档审查证据
produces: DOCS commit id
completionEvidence: git commit 使用精确消息成功并返回 commit id
readSet: [codex/.git/index]
writeSet: [codex/.git/index, codex refs/heads/dev, codex Git object database]
stateEffects: 创建本地提交 docs: design stateful diagnostic authorization
commandScope: [git commit -m 'docs: design stateful diagnostic authorization']
executionContext: codex/dev，共享 Git index
resourceLocks: [codex/.git/index write, codex refs/heads/dev write, codex Git object database write]
verification: commit 创建成功并记录身份
failureDomain: D4 及全部治理后继
authorizationGate.status: pending-plan-confirmation
```

#### D5：核验工作文档提交

```yaml
nodeId: D5
taskBoundary: DOCS 后置验证；无提交
operationKind: 验证
outcome: DOCS commit 只包含两个工作文档且内容与 D3 一致
hardPredecessors: [D4：等待 DOCS commit id]
consumes: DOCS commit id、staged 工作文档审查证据
produces: 实施前文档屏障证据
completionEvidence: git show 的路径、消息和 diff 与 D3 一致
readSet: [DOCS commit, codex refs/heads/dev]
writeSet: []
stateEffects: 仅验证输出
commandScope: [git show]
executionContext: codex/dev
resourceLocks: [codex refs/heads/dev read, codex Git object database read]
verification: 提交身份、parent、路径、消息和内容
failureDomain: D5 及全部治理后继
authorizationGate.status: pending-plan-confirmation
```

### 治理实施前置节点

#### P0：核验 `codex-config` 执行环境

```yaml
nodeId: P0
taskBoundary: GOVERNANCE 前置调查；无提交
operationKind: 调查
outcome: 记录 branch、baseline、canonical targets、工具来源和精确 writeSet
hardPredecessors: [D5：工作文档提交已核验]
consumes: DOCS commit、当前 codex-config 状态、设计写集合
produces: 实施 baseline 与 canonical target 表
completionEvidence: branch 为 main；目标文件与工具存在；记录全部范围外状态且不修改
readSet: [codex-config 工作树与 Git metadata, 五个目标文件, 受保护 symlink, uv, quick_validate.py]
writeSet: []
stateEffects: 仅预检输出
commandScope: [pwd, command -v, test, readlink, git status/config/blame/log/show, uv --version]
executionContext: codex-config/main，共享工作树
resourceLocks: [codex-config 工作树 read, Git index read, refs/heads/main read]
verification: cwd、root、branch、Git 身份、路径身份、工具来源和 baseline
failureDomain: P0 及全部治理后继
authorizationGate.status: pending-plan-confirmation
```

#### A0：取得项目外与受保护目标独立确认

```yaml
nodeId: A0
taskBoundary: GOVERNANCE 授权；无提交
operationKind: 授权
outcome: 用户确认五个 codex-config 写目标、三个本地提交、验证副作用及全局 AGENTS 精确文字
hardPredecessors: [P0：等待当前 canonical identity 与 baseline]
consumes: P0 canonical target 表、精确拟写边界、项目外副作用说明
produces: codex-config-external-write-2026-08-31 与 global-agents-write-2026-08-31 approvals
completionEvidence: 当前唯一确认点收到“确认”“确认写入”“确认允许写入”或等价直接授权
readSet: [五个目标文件, ~/.codex/AGENTS.md symlink identity]
writeSet: []
stateEffects: 仅更新授权记录
commandScope: [向用户展示精确内容与副作用并等待]
executionContext: 当前对话
resourceLocks: [五个 canonical targets read]
verification: 动作、目标、文字、验证、提交和副作用与确认绑定一致
failureDomain: A0 及全部治理编辑、验证与提交后继；DOCS 不受影响
authorizationGate.status: pending-plan-confirmation
```

### 治理编辑 fan-out

以下三个节点在 A0 完成后同时进入初始治理 ready set，写集合互不相交。

#### E-AUTH：编辑动作授权 owner

```yaml
nodeId: E-AUTH
taskBoundary: AUTHORIZATION
operationKind: 编辑
outcome: 三个 action-authorization 文件完整承载路由、动作族和事故案例
hardPredecessors: [A0：等待项目外修改授权]
consumes: 已确认设计、当前三个 owner 文件、P0 baseline
produces: AUTHORIZATION 工作树 diff
completionEvidence: 只修改声明的三个文件；逐项覆盖授权前、授权后和计划覆盖语义
readSet: [action-authorization/SKILL.md, action-families.md, incident-acceptance-cases.md, authorization-record.md, capability-envelope.md]
writeSet: [action-authorization/SKILL.md, action-families.md, incident-acceptance-cases.md]
stateEffects: 只产生声明 writeSet 的工作树修改
commandScope: [apply_patch]
executionContext: codex-config/main，共享工作树；不操作 Git index
resourceLocks: [三个 writeSet 文件 write, 两个排除 references read]
verification: 逐项反向对照设计语义与 owner 边界
failureDomain: E-AUTH、V-AUTH、AUTHORIZATION stage/commit 与 FINAL
authorizationGate.status: pending-A0
```

#### E-STAGES：编辑调查阶段 owner

```yaml
nodeId: E-STAGES
taskBoundary: STAGES
operationKind: 编辑
outcome: read-only-and-exceptions.md 完整承载诊断测试窄例外与生命周期
hardPredecessors: [A0：等待项目外修改授权]
consumes: 已确认设计、当前阶段 reference、P0 baseline
produces: STAGES 工作树 diff
completionEvidence: 只修改声明文件；保留、删除、重写与红绿顺序完整
readSet: [read-only-and-exceptions.md, stage-gates.md]
writeSet: [read-only-and-exceptions.md]
stateEffects: 只产生声明 writeSet 的工作树修改
commandScope: [apply_patch]
executionContext: codex-config/main，共享工作树；不操作 Git index
resourceLocks: [read-only-and-exceptions.md write, stage-gates.md read]
verification: 窄例外不扩大为修复授权，生命周期边界完整
failureDomain: E-STAGES、V-STAGES、STAGES stage/commit 与 FINAL
authorizationGate.status: pending-A0
```

#### E-GLOBAL：编辑全局消歧不变量

```yaml
nodeId: E-GLOBAL
taskBoundary: GLOBAL
operationKind: 编辑
outcome: AGENTS.md 精确加入已展示的一句消歧，不复制 skill 细节
hardPredecessors: [A0：等待项目外与受保护目标确认]
consumes: global-agents-write-2026-08-31 approval、当前 AGENTS.md、P0 baseline
produces: GLOBAL 工作树 diff
completionEvidence: 精确句子存在；其他规则无变化
readSet: [codex-config/AGENTS.md, ~/.codex/AGENTS.md symlink identity]
writeSet: [codex-config/AGENTS.md canonical target]
stateEffects: 修改受保护全局用户指令实际目标
commandScope: [apply_patch]
executionContext: codex-config/main，共享工作树；不操作 Git index
resourceLocks: [codex-config/AGENTS.md canonical target write]
verification: 精确文字、简洁性、symlink identity 和零额外 diff
failureDomain: E-GLOBAL、V-GLOBAL、GLOBAL stage/commit 与 FINAL
authorizationGate.requiredApprovalIds: [global-agents-write-2026-08-31, codex-config-external-write-2026-08-31]
authorizationGate.status: pending-A0
```

### 任务验证与独立提交

#### V-AUTH

```yaml
nodeId: V-AUTH
taskBoundary: AUTHORIZATION
operationKind: 验证
outcome: action-authorization 结构、路由、静态语义与 diff 通过
hardPredecessors: [E-AUTH：等待稳定 AUTHORIZATION diff]
consumes: AUTHORIZATION 工作树 diff
produces: AUTHORIZATION 验证证据
completionEvidence: quick_validate.py 成功；git diff --check 成功；静态案例与 owner 检索通过
readSet: [action-authorization skill 目录, AUTHORIZATION diff]
writeSet: []
stateEffects: uv 运行的内部临时 cache/日志副作用；不主动操作其产物
commandScope: [规定的 action-authorization quick_validate.py 命令, git diff --check -- 三个精确文件, rg, git diff -- 三个精确文件]
executionContext: codex-config/main
resourceLocks: [action-authorization skill read, uv cache canonical path write]
verification: 结构、reference 可达性、授权前/后/计划覆盖语义、static controls
failureDomain: V-AUTH、AUTHORIZATION stage/commit 与 FINAL
authorizationGate.status: pending-A0
```

#### V-STAGES

```yaml
nodeId: V-STAGES
taskBoundary: STAGES
operationKind: 验证
outcome: managing-work-stages 结构、生命周期静态语义与 diff 通过
hardPredecessors: [E-STAGES：等待稳定 STAGES diff]
consumes: STAGES 工作树 diff
produces: STAGES 验证证据
completionEvidence: quick_validate.py 成功；git diff --check 成功；生命周期与排除 owner 检索通过
readSet: [managing-work-stages skill 目录, STAGES diff]
writeSet: []
stateEffects: uv 运行的内部临时 cache/日志副作用；不主动操作其产物
commandScope: [规定的 managing-work-stages quick_validate.py 命令, git diff --check -- 精确文件, rg, git diff -- 精确文件]
executionContext: codex-config/main
resourceLocks: [managing-work-stages skill read, uv cache canonical path write]
verification: 结构、窄例外、跨阶段保留、修复期删除/重写/先红后绿
failureDomain: V-STAGES、STAGES stage/commit 与 FINAL
authorizationGate.status: pending-A0
```

#### V-GLOBAL

```yaml
nodeId: V-GLOBAL
taskBoundary: GLOBAL
operationKind: 验证
outcome: 全局精确文字、canonical identity、简洁性和 diff 通过
hardPredecessors: [E-GLOBAL：等待稳定 GLOBAL diff]
consumes: GLOBAL 工作树 diff、A0 approvals
produces: GLOBAL 验证证据
completionEvidence: git diff --check 成功；完整 diff 只含精确一句；symlink identity 未变
readSet: [codex-config/AGENTS.md, GLOBAL diff, ~/.codex/AGENTS.md symlink]
writeSet: []
stateEffects: 仅验证输出
commandScope: [readlink, rg, git diff --check -- AGENTS.md, git diff -- AGENTS.md]
executionContext: codex-config/main
resourceLocks: [AGENTS.md canonical target read, codex-config Git index read]
verification: 特殊确认文字、简洁性、owner 不重复和零额外变化
failureDomain: V-GLOBAL、GLOBAL stage/commit 与 FINAL
authorizationGate.status: pending-A0
```

每个任务的验证成功后，由唯一 Git owner 依次执行下列四节点模板。三个任务共享 `codex-config/.git/index`、`refs/heads/main` 和 Git object database，节点通过 canonical write locks 动态串行，不添加虚假硬依赖。

```yaml
nodePattern: S-<TASK>
taskBoundary: <TASK>
operationKind: stage
outcome: Git index 只加入该任务精确 writeSet
hardPredecessors: [V-<TASK>：等待该任务验证证据]
consumes: 该任务验证证据与稳定 diff
produces: 该任务 staged snapshot
completionEvidence: git diff --cached --name-only 精确匹配该任务 writeSet
readSet: [该任务 writeSet]
writeSet: [codex-config/.git/index]
stateEffects: 精确暂存该任务文件
commandScope: [git add -- 该任务精确文件, git diff --cached --name-only]
executionContext: codex-config/main，共享 Git index
resourceLocks: [codex-config/.git/index write]
verification: staged 路径集合精确匹配
failureDomain: 本任务后继与 FINAL
authorizationGate.status: pending-A0
---
nodePattern: R-<TASK>
taskBoundary: <TASK>
operationKind: 审查
outcome: staged snapshot 与已验证任务 diff 一致
hardPredecessors: [S-<TASK>：等待 staged snapshot]
consumes: 该任务 staged snapshot
produces: staged 审查证据
completionEvidence: git diff --cached --check 成功；完整 staged diff 已审查
readSet: [codex-config/.git/index]
writeSet: []
stateEffects: 仅审查输出
commandScope: [git diff --cached --check, git diff --cached]
executionContext: codex-config/main
resourceLocks: [codex-config/.git/index read]
verification: whitespace、路径、语义和范围
failureDomain: 本任务 commit 后继与 FINAL
authorizationGate.status: pending-A0
---
nodePattern: C-<TASK>
taskBoundary: <TASK>
operationKind: commit
outcome: 创建该任务独立本地提交
hardPredecessors: [R-<TASK>：等待 staged 审查证据]
consumes: 已审查 staged snapshot
produces: 该任务 commit id
completionEvidence: git commit 使用该任务精确消息成功
readSet: [codex-config/.git/index]
writeSet: [codex-config/.git/index, codex-config refs/heads/main, codex-config Git object database]
stateEffects: 创建一个本地提交；无 remote 副作用
commandScope: [git commit -m 该任务精确提交说明]
executionContext: codex-config/main
resourceLocks: [codex-config/.git/index write, refs/heads/main write, Git object database write]
verification: 提交成功并记录 commit id
failureDomain: 本任务 post-commit 后继与 FINAL
authorizationGate.status: pending-A0
---
nodePattern: P-<TASK>
taskBoundary: <TASK> 后置验证；无提交
operationKind: 验证
outcome: 该任务 commit 只包含精确 writeSet 且与 staged 审查一致
hardPredecessors: [C-<TASK>：等待 commit id]
consumes: 该任务 commit id 与 staged 审查证据
produces: 稳定任务提交证据
completionEvidence: git show 的路径、消息和 diff 与任务定义一致
readSet: [该任务 commit, refs/heads/main]
writeSet: []
stateEffects: 仅验证输出
commandScope: [git show]
executionContext: codex-config/main
resourceLocks: [refs/heads/main read, Git object database read]
verification: commit identity、parent、路径、消息和内容
failureDomain: 本任务与 FINAL
authorizationGate.status: pending-A0
```

模板实例为 `AUTHORIZATION`、`STAGES`、`GLOBAL`，分别使用任务与提交拓扑中声明的 writeSet 和提交说明。

### 最终静态 fan-in

#### FINAL：组合静态反向审计

```yaml
nodeId: FINAL
taskBoundary: 最终验证；无提交
operationKind: 审查
outcome: 三个治理提交的组合状态满足已确认设计且无额外变化
hardPredecessors: [P-AUTHORIZATION, P-STAGES, P-GLOBAL：等待三个稳定提交证据]
consumes: 三个 commit ids、已确认设计、静态验证证据、P0 baseline
produces: 最终静态审计报告与完成判断
completionEvidence: 独立审计未发现 owner 遗漏、语义冲突、错误排除或生命周期断点；两个仓库状态已核对
readSet: [三个治理 commits, 五个最终目标文件, 两个工作文档 commits, 两个仓库 Git 状态]
writeSet: []
stateEffects: 仅审计报告
commandScope: [git status/log/show/diff, rg, sed, 只读独立子代理审查]
executionContext: codex-config/main 与 codex/dev 的已提交稳定状态
resourceLocks: [两个仓库 refs read, Git object databases read, 五个目标文件 read]
verification: owner 分层、授权前/后、计划覆盖、跨阶段生命周期、排除范围和提交拓扑
failureDomain: FINAL；若发现计划内问题，按执行图插入独立修正节点和新提交，禁止 amend
authorizationGate.status: pending-plan-confirmation
```

## Ready set、关键路径与 fan-in

- 计划确认后的初始 ready set 只有 D1。
- D5 完成后 P0 就绪；A0 等待 P0 的当前 canonical identity 与 baseline。
- A0 完成后 `E-AUTH`、`E-STAGES`、`E-GLOBAL` 同时进入 ready set；三者写集合不相交，应实际并行。
- 三个验证分别只依赖对应编辑；两个 `quick_validate.py` 节点共享 uv cache write lock，冲突时一个保持 ready 等待锁，不形成硬依赖。
- 每个任务的 stage/review/commit/post-commit 链只消费本任务稳定产物。三条 commit 链共享 Git index、branch 和 object database，按动态锁串行。
- FINAL 是唯一最终 fan-in，只等待三个独立治理提交证据。
- 粗粒度关键路径：DOCS 验证与提交 → P0 → A0 → 最慢的编辑/验证/提交分支 → FINAL。

## 失败与重新计划边界

- DOCS 验证或提交失败：停止全部治理后继，不绕过“工作文档先提交”门禁。
- P0 发现 branch、baseline、symlink、工具或目标漂移：只暂停依赖该事实的治理节点，重新闭合事实；不得按旧快照写入。
- A0 未获确认：所有 `codex-config` 写入与后继保持等待，DOCS 已提交状态不回退。
- 单一治理任务编辑或验证失败：只暂停该任务及 FINAL；其他已授权且无共享前提问题的任务继续。
- 计划内修正尚未提交时，在同一任务插入修正节点并重新运行受影响验证；若针对已有提交，创建新的独立修正提交，禁止 amend。
- 需要扩大五文件 writeSet、修改排除 owner、建设行为 harness、创建临时载体或改变授权/生命周期语义时，停止受影响节点并回到设计或计划确认。
- 发现无关预存问题只报告并证据化排除，不修复、不恢复、不提交。

## 完成条件

- DOCS、AUTHORIZATION、STAGES、GLOBAL 四个 task boundaries 均形成并核验独立本地提交。
- 全局精确文字与 A0 special approval 一致，symlink canonical identity 未变化。
- 两个 skills 的规定 `quick_validate.py` 成功，且没有把结构验证冒充行为证明。
- 静态语义同时覆盖授权前禁止绕行、授权后精确执行、计划覆盖不重复请求，以及诊断测试跨阶段保留与修复期删除/重写/先红后绿。
- FINAL 没有发现 owner 重复、遗漏、错误排除或范围外变更。
- 最终报告固定包含实际并行、关键路径和未启动 ready 节点，并明确写出“实际提示词遵循行为未验证”。
