# Lingui Catalog 生成元数据闭包提示词治理实施计划

日期：2026-08-30

状态：待确认

## 目标与设计来源

本计划只实施已确认设计：

- [Lingui Catalog 生成元数据闭包提示词治理设计](../../../../specs/2026/08/30/2026-08-30-lingui-catalog-generated-metadata-closure-prompt-governance-design.md)

目标是把通用 generated metadata closure 判断、计划表达约束和 Codex GUI 的 Lingui catalog 字段分类分别落到现有 owner 中，使权威 extraction 产生的确定性 `#:` 归一化不再被预计 hunk 或旧行号误判为范围扩大，同时继续阻断语义漂移、边界扩大和不稳定生成。

本计划不修改 `/Users/jiangsheng/cnb/codex-config/AGENTS.md`，不修改第三方 `.agents/skills/**` 或 OpenAI 官方 skills，不修改 Lingui 配置、catalog、package scripts、当前 selected-skill feature 的 production/tests/catalog，也不继续该 feature 的验证或提交。

## 当前事实闭包

- Codex 仓库为 `dev`；设计文档已落盘但尚未提交。本计划与设计文档必须先形成独立 DOCS 提交，才可开始任何实现节点。
- `codex-config` 为独立仓库，分支为 `main`；两个全局 canonical targets 是：
  - `/Users/jiangsheng/cnb/codex-config/skills/managing-work-stages/references/stage-gates.md`
  - `/Users/jiangsheng/cnb/codex-config/skills/project-doc-workflow/references/plan-document-contract.md`
- `/Users/jiangsheng/.codex/skills/managing-work-stages` 当前 symlink 到 `/Users/jiangsheng/cnb/codex-config/skills/managing-work-stages`，`/Users/jiangsheng/.codex/skills/project-doc-workflow` 当前 symlink 到 `/Users/jiangsheng/cnb/codex-config/skills/project-doc-workflow`。修改上述两个 canonical references 后，这两个 live skill 路径会立即看到新规则；这是 GLOBAL 编辑的项目外即时副作用。
- `/Users/jiangsheng/.codex/AGENTS.md` 当前解析到 `/Users/jiangsheng/cnb/codex-config/AGENTS.md`，但本计划不编辑该 symlink 或其 canonical target；它只是明确未修改项，不能替代对两个 live skill symlink 副作用的授权说明。
- 项目手工 skill 根 `/Users/jiangsheng/cnb/codex/.codex/skills` 已存在，`lingui-catalog-workflow` 尚不存在。官方 initializer 与 `quick_validate.py` 存在，`uv` 可用。
- `codex-gui/AGENTS.md` 已有 `Skill Routing`，项目改动只增加一行 `$lingui-catalog-workflow` 路由，不展开字段协议。
- Codex 工作树已有 selected-skill dirty set。它必须原样隔离；所有 stage 都使用精确 allowlist，禁止 `git add .`。计划落盘时的既有 feature dirty set 为：
  - `codex-gui/src/__tests__/sequential/composerClipboard.browser.test.tsx`
  - `codex-gui/src/features/composerEditor/ComposerClipboardPlugin.tsx`
  - `codex-gui/src/features/composerEditor/ComposerEditor.tsx`
  - `codex-gui/src/features/composerEditor/SkillNode.ts`
  - `codex-gui/src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx`
  - `codex-gui/src/features/composerEditor/__tests__/SkillNode.test.ts`
  - `codex-gui/src/features/composerEditor/__tests__/composerDraft.test.ts`
  - `codex-gui/src/features/composerEditor/__tests__/skillQuery.test.ts`
  - `codex-gui/src/features/composerEditor/composerDraft.ts`
  - `codex-gui/src/features/composerEditor/skillQuery.ts`
  - `codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx`
  - `codex-gui/src/locales/en.po`
  - `codex-gui/src/locales/zh-CN.po`
  - `codex-gui/src/features/composerEditor/SelectedSkillToken.tsx`
  - `codex-gui/src/features/composerEditor/SkillEditingPlugin.tsx`
  - `codex-gui/src/features/composerEditor/__tests__/selectedSkillPresentation.test.ts`
  - `codex-gui/src/features/composerEditor/selectedSkillPresentation.ts`

## 实施边界与固定命令

### Task boundaries 与提交

- `TB-DOCS`：只提交本设计与本计划；commit message 为 `docs: plan Lingui catalog metadata closure governance`。
- `TB-PROJECT`：只提交项目 skill 与 `codex-gui/AGENTS.md` 路由；commit message 为 `feat(skills): add Lingui catalog workflow`。
- `TB-GLOBAL`：只提交两个 `codex-config` reference；commit message 为 `fix(skills): govern generated metadata closure`。
- 三个边界各自独立本地提交，禁止 squash、amend 或把任务合并。发现已提交问题时只能插入新的独立 fix commit；不得改写原提交。

### PROJECT 固定生成入口

只允许用下列官方 initializer 创建新 skill；不得手工创建目录或 scaffold，不传 `--resources`，因此 initializer 只产生 `SKILL.md` 与 `agents/openai.yaml`：

```text
/usr/bin/python3 /Users/jiangsheng/.codex/skills/.system/skill-creator/scripts/init_skill.py lingui-catalog-workflow --path /Users/jiangsheng/cnb/codex/.codex/skills
```

初始化后只编辑 `SKILL.md`；保留 initializer 生成的 `agents/openai.yaml`。不得新增 `references/`、`scripts/`、`assets/`、README 或其他文件。

### Skill 结构验证

PROJECT 必须运行：

```text
uv run --no-project --with pyyaml python /Users/jiangsheng/.codex/skills/.system/skill-creator/scripts/quick_validate.py /Users/jiangsheng/cnb/codex/.codex/skills/lingui-catalog-workflow
```

GLOBAL 必须对两个完整 skill 目录分别运行：

```text
uv run --no-project --with pyyaml python /Users/jiangsheng/.codex/skills/.system/skill-creator/scripts/quick_validate.py /Users/jiangsheng/cnb/codex-config/skills/managing-work-stages
uv run --no-project --with pyyaml python /Users/jiangsheng/.codex/skills/.system/skill-creator/scripts/quick_validate.py /Users/jiangsheng/cnb/codex-config/skills/project-doc-workflow
```

`quick_validate.py` 只证明 skill 结构；语义验收由各 task 自己的组合审查与正负案例完成。

### 全局禁止项

整个计划禁止运行 `messages:extract`、任何 `pnpm`、GUI/浏览器、Rust 命令、formatter、依赖安装、remote 或 force 操作；禁止使用 worktree；禁止触碰 selected-skill dirty set；禁止 `git add .`。验证只允许文中列明的 `quick_validate.py`、只读文本/差异审查、`git diff --check`、`git diff --cached --check` 和精确 Git 状态/提交核验。

## 授权与能力信封表示

每个节点的 `authorizationGate` 都消费 `$action-authorization` 的中央结论。为避免重复但不省略字段，本文用下列确定性展开规则记录完整能力信封：

- `objective` 固定为“实施 Lingui catalog generated metadata closure 提示词治理”；`phase=confirmed-plan execution`。
- `operationKind`、`outcome`、`readSet`、`writeSet`、`stateEffects`、`commandScope`、`subdelegation`、`replanTriggers` 逐字取本节点同名字段。
- `canonicalTargets` 是本节点 `writeSet` 中每个写目标的 canonical absolute path；无写节点则是其完成证据所核验的 canonical resources。
- `parameterBounds` 是本节点声明的 `executionContext`、命令参数、文件 allowlist 和一次性动作边界。
- `negativeConstraints` 固定包含本计划“全局禁止项”，再叠加本节点明确禁止的其他动作。
- `specialApprovals` 与 `requiredApprovalIds` 由节点 `authorizationGate` 明列；未明列即为空。
- `lifecycle` 固定为“节点进入运行时生效，完成、失败、撤销或前提失效时到期”；`status` 取 `authorizationGate.status`。
- 每个节点的 `authorizationGate` 还明列 `grantSource`、`grantedOperation` 与 `allowedOperations`；这些字段与上述投影共同构成该节点的完整能力信封，不能从别的节点继承授权。

## 权威执行图

### D1 — DOCS 组合验证

- `nodeId`: `D1`
- `taskBoundary`: `TB-DOCS`
- `operationKind`: 验证
- `outcome`: 设计与计划路径、已确认选择 A、三任务提交边界、授权门禁、固定命令和排除范围一致，且文档 diff 无空白错误。
- `estimatedCost`: S
- `deferralEvidence`: 无
- `hardPredecessors`: 无；用户已授权计划落盘，且设计已确认。
- `consumes`: 已确认设计、本计划、当前 Codex dirty baseline。
- `produces`: DOCS 组合审查记录与 `git diff --check` 成功证据。
- `completionEvidence`: 正向案例“边界内稳定 `#:` 归一化继续”和负向案例“计划外 `msgid`/`msgstr`/locale 或不稳定生成暂停”均能从设计和计划得到唯一结论；`git diff --check -- <设计> <计划>` 退出 0；仅两个工作文档属于 DOCS allowlist。
- `readSet`: 两个工作文档、`git status`、文档 diff。
- `writeSet`: 无。
- `stateEffects`: 只读验证输出。
- `commandScope`: `sed`/`rg`、`git status --short`、限定两个文档的 `git diff` 与 `git diff --check`。
- `subdelegation`: false
- `executionContext`: Codex `dev` 当前工作树、当前 branch、共享 index 只读。
- `resourceLocks`: 两个工作文档 read；Codex Git index read。
- `owner`: DOCS verification owner；唯一负责本节点验证。
- `verification`: 文档语义组合审查、独立正负案例、限定 diff check 全部通过。
- `failureDomain`: 失败只暂停 `D2`、`D3` 及所有实现分支。
- `replanTriggers`: 设计/计划冲突、出现第三个文档、需要改变 task boundary 或命令。
- `authorizationGate`: `status=active`; `grantSource=用户“确认设计，落盘计划”及后续计划确认中的 DOCS 前置`; `grantedOperation=只读组合验证`; `allowedOperations=本节点 commandScope`; `specialApprovals=[]`; `requiredApprovalIds=[]`。

### D2 — DOCS 精确暂存

- `nodeId`: `D2`
- `taskBoundary`: `TB-DOCS`
- `operationKind`: stage
- `outcome`: Git index 只包含本设计和本计划。
- `estimatedCost`: S
- `deferralEvidence`: 无
- `hardPredecessors`: `D1`；等待 DOCS 组合验证稳定证据。
- `consumes`: 两个核验通过的工作文档。
- `produces`: DOCS-only staged diff。
- `completionEvidence`: `git diff --cached --name-only` 精确等于两个文档；`git diff --cached --check` 退出 0；selected-skill dirty set 仍未暂存。
- `readSet`: 两个工作文档、Codex Git index、dirty baseline。
- `writeSet`: Codex Git index中两个文档条目。
- `stateEffects`: 精确暂存两个工作文档。
- `commandScope`: `git add -- <设计绝对路径> <计划绝对路径>` 及只读 cached/status 核验；禁止任何宽泛 add。
- `subdelegation`: false
- `executionContext`: Codex `dev` 当前工作树、共享 Git index 独占写。
- `resourceLocks`: `/Users/jiangsheng/cnb/codex/.git/index` write。
- `owner`: TB-DOCS Git owner；唯一允许操作 DOCS index。
- `verification`: cached allowlist、cached diff check、dirty isolation。
- `failureDomain`: 失败暂停 `D3` 及所有实现分支。
- `replanTriggers`: index 已含其他文件、两个文档外出现 staged entry、dirty baseline 被改写。
- `authorizationGate`: `status=pending-plan-confirmation`; `grantSource=用户后续明确确认本计划`; `grantedOperation=精确暂存 DOCS`; `allowedOperations=本节点 commandScope`; `specialApprovals=[]`; `requiredApprovalIds=[]`。

### D3 — DOCS 独立提交

- `nodeId`: `D3`
- `taskBoundary`: `TB-DOCS`
- `operationKind`: commit
- `outcome`: 创建仅含两个工作文档的本地提交。
- `estimatedCost`: S
- `deferralEvidence`: 无
- `hardPredecessors`: `D2`；等待精确 staged diff。
- `consumes`: DOCS-only staged diff。
- `produces`: commit `docs: plan Lingui catalog metadata closure governance`。
- `completionEvidence`: commit 成功；`git show --name-only --format=` 只列两个文档；selected-skill dirty set 仍在工作树且未进入提交。
- `readSet`: staged diff、Codex HEAD、dirty baseline。
- `writeSet`: Codex local Git object database、`dev` 本地 ref、Git index。
- `stateEffects`: 一个本地 DOCS commit；不 push。
- `commandScope`: `git commit -m 'docs: plan Lingui catalog metadata closure governance'` 与只读 `git show/status`。
- `subdelegation`: false
- `executionContext`: Codex `dev` 当前工作树、共享 Git index 独占写。
- `resourceLocks`: Codex Git index/ref/object database write。
- `owner`: TB-DOCS Git owner；唯一允许创建 DOCS commit。
- `verification`: 提交身份、message、文件集合和 dirty isolation。
- `failureDomain`: 失败暂停所有实现节点；不得绕过文档提交门禁。
- `replanTriggers`: commit 包含范围外文件、HEAD/branch 漂移、提交失败。
- `authorizationGate`: `status=pending-plan-confirmation`; `grantSource=用户后续明确确认本计划`; `grantedOperation=创建 DOCS 本地提交`; `allowedOperations=本节点 commandScope`; `specialApprovals=[]`; `requiredApprovalIds=[]`。

### X1 — EXTERNAL-AUTH 独立授权

- `nodeId`: `X1`
- `taskBoundary`: 无提交；外部项目动作授权门禁
- `operationKind`: 授权
- `outcome`: 在任何 `codex-config` 编辑、验证后主动处理、stage 或 commit 前，取得一次独立明确授权，并生成稳定 approval id `EXTERNAL-AUTH`。
- `estimatedCost`: user-dependent
- `deferralEvidence`: 无；授权等待不是 ready 节点暂缓。
- `hardPredecessors`: `D3`；只有 DOCS commit 成功后才请求实现授权。
- `consumes`: DOCS commit、精确外部动作说明。
- `produces`: `EXTERNAL-AUTH` approval id 或明确拒绝。
- `completionEvidence`: 用户单独明确确认以下完整影响：编辑两个 `codex-config` canonical references 后，`/Users/jiangsheng/.codex/skills/managing-work-stages` 与 `/Users/jiangsheng/.codex/skills/project-doc-workflow` 两个 live skill symlink 会立即看到新规则；对两个 skill 目录运行指定 `quick_validate.py`；在 `codex-config/main` 精确 stage 两文件并创建一个本地 commit；`/Users/jiangsheng/.codex/AGENTS.md` 及其 canonical target 保持不变；不 remote、不 force、不改其他文件。
- `readSet`: DOCS commit、两个 global targets、两个 live skill symlink、`/Users/jiangsheng/.codex/AGENTS.md` symlink、`codex-config` status。
- `writeSet`: 无。
- `stateEffects`: 用户授权记录；不修改 filesystem/Git。
- `commandScope`: 只读核验与向用户请求独立确认。
- `subdelegation`: false
- `executionContext`: 协调线程；Codex 与 `codex-config` 资源只读。
- `resourceLocks`: 两个 global targets read；两个 live skill symlink read；`/Users/jiangsheng/.codex/AGENTS.md` symlink read；`codex-config` index read。
- `owner`: 主协调 owner；不得委派用户授权判断。
- `verification`: 确认文字必须覆盖两个精确 canonical targets、两个 live skill symlink 的即时生效副作用、quick_validate、stage、main 本地 commit，以及 AGENTS symlink/canonical target 不修改；计划确认不能替代。
- `failureDomain`: 未授权只暂停 `G1`–`G5` 及其后继 `C1/F1`；PROJECT 分支继续。
- `replanTriggers`: target、symlink identity、branch、写集合或提交副作用变化。
- `authorizationGate`: `status=active`; `grantSource=全局“项目外主动改动二次确认”规则`; `grantedOperation=请求外部动作授权`; `allowedOperations=本节点 commandScope`; `specialApprovals=[]`; `requiredApprovalIds=[]`。

### P1 — 初始化项目 skill

- `nodeId`: `P1`
- `taskBoundary`: `TB-PROJECT`
- `operationKind`: 生成
- `outcome`: 官方 initializer 创建仅含 `SKILL.md` 与 `agents/openai.yaml` 的 `lingui-catalog-workflow` scaffold。
- `estimatedCost`: S
- `deferralEvidence`: 无
- `hardPredecessors`: `D3`；等待 DOCS commit。
- `consumes`: 官方 initializer、项目 skill 根不存在目标目录的 preflight。
- `produces`: 新 skill scaffold。
- `completionEvidence`: 目标目录新增，文件集合精确为 `SKILL.md`、`agents/openai.yaml`；`agents/openai.yaml` 是 initializer 默认生成结果，只含 generator 默认的 `display_name` 与 `short_description` quoted strings，不含未经请求的 optional interface、policy 或 dependency 字段。
- `readSet`: initializer、skill-creator instructions、项目 skill 根。
- `writeSet`: `/Users/jiangsheng/cnb/codex/.codex/skills/lingui-catalog-workflow/SKILL.md`; `/Users/jiangsheng/cnb/codex/.codex/skills/lingui-catalog-workflow/agents/openai.yaml`。
- `stateEffects`: 新建 skill 目录与两个文件。
- `commandScope`: 本计划“PROJECT 固定生成入口”中的命令，恰好运行一次。
- `subdelegation`: false
- `executionContext`: Codex `dev` 当前工作树；不操作 Git index。
- `resourceLocks`: project skill target directory write；official initializer read。
- `owner`: PROJECT generator owner；唯一运行 initializer。
- `verification`: 文件集合、generator 默认 UI metadata quoted strings，以及不存在未经请求 optional interface/policy/dependency 的只读核对。
- `failureDomain`: 失败暂停 `P2`、`P4`–`P6`；不暂停 `P3` 或 GLOBAL。
- `replanTriggers`: 目标已存在、initializer 产生额外资源、命令参数不再受支持。
- `authorizationGate`: `status=pending-plan-confirmation`; `grantSource=用户后续明确确认本计划`; `grantedOperation=按固定命令初始化项目 skill`; `allowedOperations=运行固定 initializer 一次并只读核对`; `specialApprovals=[]`; `requiredApprovalIds=[]`。

### P2 — 编写项目 skill 语义

- `nodeId`: `P2`
- `taskBoundary`: `TB-PROJECT`
- `operationKind`: 编辑
- `outcome`: `SKILL.md` 成为自包含的 Lingui catalog 分类与 stability owner，不新增 reference。
- `estimatedCost`: M
- `deferralEvidence`: 无
- `hardPredecessors`: `P1`；等待 scaffold 稳定存在。
- `consumes`: 已确认设计、scaffold `SKILL.md`、现有 `$lingui-best-practices`/`$enhanced-message-context` 的职责边界。
- `produces`: 最终项目 `SKILL.md`。
- `completionEvidence`: skill 说明何时触发；分别分类 `#:`、`#.`、`msgid`、`msgstr`、fuzzy/obsolete、catalog 边界与二次 extraction stability；消费通用阶段和计划 owner 而不复制状态机/授权/执行图；没有新增文件。
- `readSet`: 设计、scaffold `SKILL.md`、相关只读 Lingui skill owner 说明。
- `writeSet`: `/Users/jiangsheng/cnb/codex/.codex/skills/lingui-catalog-workflow/SKILL.md`。
- `stateEffects`: 编辑一个项目 skill 文件。
- `commandScope`: `apply_patch` 仅目标 `SKILL.md`；只读 `sed/rg`。
- `subdelegation`: false
- `executionContext`: Codex `dev` 当前工作树；不操作 Git index。
- `resourceLocks`: project `SKILL.md` write。
- `owner`: PROJECT skill author；唯一编辑 `SKILL.md`。
- `verification`: 字段所有权、继续/暂停条件与设计逐项对照。
- `failureDomain`: 失败暂停 `P4`–`P6`；不暂停 `P3` 或 GLOBAL。
- `replanTriggers`: 需要 reference/script/额外文件、需要修改第三方 skill、领域范围超出 Lingui catalog。
- `authorizationGate`: `status=pending-plan-confirmation`; `grantSource=用户后续明确确认本计划`; `grantedOperation=编辑项目 SKILL.md`; `allowedOperations=本节点 commandScope`; `specialApprovals=[]`; `requiredApprovalIds=[]`。

### P3 — 增加前端一行路由

- `nodeId`: `P3`
- `taskBoundary`: `TB-PROJECT`
- `operationKind`: 编辑
- `outcome`: `codex-gui/AGENTS.md` 的 `Skill Routing` 只增加一行 Lingui catalog 路由。
- `estimatedCost`: S
- `deferralEvidence`: 无
- `hardPredecessors`: `D3`；不依赖 `P1/P2` 的 mutable diff，可与其真实并行。
- `consumes`: 已确认设计、现有 `codex-gui/AGENTS.md` routing section、约定 skill name。
- `produces`: 一行项目路由。
- `completionEvidence`: 路由在 extraction、catalog diff、翻译或 stability 时使用 `$lingui-catalog-workflow`；没有 PO 字段、命令、locale 清单或算法复制。
- `readSet`: 设计、`codex-gui/AGENTS.md`。
- `writeSet`: `/Users/jiangsheng/cnb/codex/codex-gui/AGENTS.md`。
- `stateEffects`: 编辑一个项目提示词文件。
- `commandScope`: `apply_patch` 仅 `codex-gui/AGENTS.md`；只读 `sed/rg`。
- `subdelegation`: false
- `executionContext`: Codex `dev` 当前工作树；不操作 Git index。
- `resourceLocks`: `codex-gui/AGENTS.md` write。
- `owner`: PROJECT route author；唯一编辑该文件。
- `verification`: 一行路由与详细协议缺失的负向检查。
- `failureDomain`: 失败暂停 `P4`–`P6`；不暂停 `P1/P2` 或 GLOBAL。
- `replanTriggers`: 需要修改 root/global AGENTS、需要多行专项协议或其他前端文件。
- `authorizationGate`: `status=pending-plan-confirmation`; `grantSource=用户后续明确确认本计划`; `grantedOperation=编辑前端一行路由`; `allowedOperations=本节点 commandScope`; `specialApprovals=[]`; `requiredApprovalIds=[]`。

### P4 — PROJECT 组合验证与语义 oracle

- `nodeId`: `P4`
- `taskBoundary`: `TB-PROJECT`
- `operationKind`: 验证
- `outcome`: 新 skill、initializer 默认 UI metadata 与路由组合满足设计、结构和独立正负案例。
- `estimatedCost`: M
- `deferralEvidence`: 无
- `hardPredecessors`: `P2`、`P3`；等待完整 PROJECT mutable diff fan-in。
- `consumes`: 两个 skill 文件、一行路由、设计、PROJECT diff、selected-skill dirty baseline。
- `produces`: quick_validate 成功、组合 diff check、正负语义 oracle 与隔离证据。
- `completionEvidence`: 指定 PROJECT `quick_validate.py` 退出 0；`agents/openai.yaml` 仅保留 initializer 默认生成的 `display_name` 与 `short_description` quoted strings，没有未经请求的 optional interface/policy/dependency；正向案例“既有 `#:` 行号归一化且语义/边界稳定则继续”得到继续；负向案例“`msgstr`/fuzzy/obsolete/locale 或二次 extraction 漂移”得到暂停；router 不复制协议；PROJECT allowlist 外无本任务新 diff；selected-skill dirty set 内容未被改写。
- `readSet`: PROJECT 三文件、设计、Git diff/status、dirty baseline、validator。
- `writeSet`: 无；`uv` 的内部临时缓存属于获授权程序内部副作用，不成为后续直接目标。
- `stateEffects`: quick_validate 进程及内部临时状态、只读审查输出。
- `commandScope`: 指定 PROJECT quick_validate 命令；`sed/rg`；限定 PROJECT allowlist 的 `git diff --check`、diff/status。
- `subdelegation`: false
- `executionContext`: Codex `dev` 当前工作树、Git index 只读。
- `resourceLocks`: PROJECT files read；uv cache write；Codex index read。
- `owner`: TB-PROJECT verification owner；唯一运行组合验证。
- `verification`: 结构、owner 分层、正向案例、负向案例、diff check、dirty isolation 全部通过。
- `failureDomain`: 失败暂停 `P5/P6`；GLOBAL 继续。
- `replanTriggers`: validator 需要安装、语义案例无唯一结论、出现 allowlist 外本任务 diff、dirty set 被改写。
- `authorizationGate`: `status=pending-plan-confirmation`; `grantSource=用户后续明确确认本计划`; `grantedOperation=运行 PROJECT 组合验证`; `allowedOperations=本节点 commandScope`; `specialApprovals=[]`; `requiredApprovalIds=[]`。

### P5 — PROJECT 精确暂存

- `nodeId`: `P5`
- `taskBoundary`: `TB-PROJECT`
- `operationKind`: stage
- `outcome`: Codex index 只包含 PROJECT 三文件。
- `estimatedCost`: S
- `deferralEvidence`: 无
- `hardPredecessors`: `P4`；等待组合验证证据。
- `consumes`: 核验通过的 PROJECT diff。
- `produces`: PROJECT-only staged diff。
- `completionEvidence`: cached name-only 精确等于 `SKILL.md`、`agents/openai.yaml`、`codex-gui/AGENTS.md`；cached diff check 通过；selected-skill dirty set 未暂存。
- `readSet`: PROJECT 三文件、Codex index、dirty baseline。
- `writeSet`: Codex index 中 PROJECT 三文件条目。
- `stateEffects`: 精确暂存 PROJECT 三文件。
- `commandScope`: `git add -- .codex/skills/lingui-catalog-workflow/SKILL.md .codex/skills/lingui-catalog-workflow/agents/openai.yaml codex-gui/AGENTS.md` 与只读 cached/status 核验。
- `subdelegation`: false
- `executionContext`: Codex `dev` 当前工作树、共享 index 独占写。
- `resourceLocks`: Codex Git index write。
- `owner`: TB-PROJECT Git owner；唯一 stage owner。
- `verification`: cached allowlist、cached diff check、dirty isolation。
- `failureDomain`: 失败暂停 `P6`；GLOBAL 继续。
- `replanTriggers`: index 已含范围外条目、PROJECT 文件集合扩大、dirty isolation 失效。
- `authorizationGate`: `status=pending-plan-confirmation`; `grantSource=用户后续明确确认本计划`; `grantedOperation=精确暂存 PROJECT`; `allowedOperations=本节点 commandScope`; `specialApprovals=[]`; `requiredApprovalIds=[]`。

### P6 — PROJECT 独立提交

- `nodeId`: `P6`
- `taskBoundary`: `TB-PROJECT`
- `operationKind`: commit
- `outcome`: 创建仅含 PROJECT 三文件的本地提交。
- `estimatedCost`: S
- `deferralEvidence`: 无
- `hardPredecessors`: `P5`；等待 PROJECT-only staged diff。
- `consumes`: PROJECT-only staged diff。
- `produces`: commit `feat(skills): add Lingui catalog workflow`。
- `completionEvidence`: commit 成功；commit 文件集合精确；selected-skill dirty set 仍留在工作树。
- `readSet`: staged diff、Codex HEAD、dirty baseline。
- `writeSet`: Codex local Git object database、`dev` local ref、index。
- `stateEffects`: 一个本地 PROJECT commit；不 push。
- `commandScope`: `git commit -m 'feat(skills): add Lingui catalog workflow'` 与只读 `git show/status`。
- `subdelegation`: false
- `executionContext`: Codex `dev` 当前工作树、共享 index 独占写。
- `resourceLocks`: Codex Git index/ref/object database write。
- `owner`: TB-PROJECT Git owner；唯一 commit owner。
- `verification`: commit identity、message、文件集合、dirty isolation。
- `failureDomain`: 失败暂停 `C1/F1`；GLOBAL 继续。
- `replanTriggers`: commit 范围扩大、HEAD/branch 漂移、提交失败。
- `authorizationGate`: `status=pending-plan-confirmation`; `grantSource=用户后续明确确认本计划`; `grantedOperation=创建 PROJECT 本地提交`; `allowedOperations=本节点 commandScope`; `specialApprovals=[]`; `requiredApprovalIds=[]`。

### G1 — 补充通用阶段契约

- `nodeId`: `G1`
- `taskBoundary`: `TB-GLOBAL`
- `operationKind`: 编辑
- `outcome`: `stage-gates.md` 定义领域无关的 generated metadata closure 继续/暂停条件。
- `estimatedCost`: M
- `deferralEvidence`: 无
- `hardPredecessors`: `D3`、`X1`；等待 DOCS commit 与 `EXTERNAL-AUTH`。
- `consumes`: 已确认设计、现有 stage gates、外部授权记录。
- `produces`: 通用阶段 reference diff。
- `completionEvidence`: 规则要求权威入口、完整生成物边界、确定性元数据分类、语义保持、完整 diff 审查与重复生成稳定；边界外输出、语义/状态漂移、owner 不明或不稳定必须暂停；不出现 Lingui 字段或项目命令。
- `readSet`: 设计、`stage-gates.md`、相关 workflow routing。
- `writeSet`: `/Users/jiangsheng/cnb/codex-config/skills/managing-work-stages/references/stage-gates.md`。
- `stateEffects`: 编辑一个外部仓库 reference。
- `commandScope`: `apply_patch` 仅目标 reference；只读 `sed/rg`。
- `subdelegation`: false
- `executionContext`: `codex-config/main` 当前工作树；独立仓库，index 不操作。
- `resourceLocks`: stage-gates canonical file write。
- `owner`: GLOBAL stage owner；唯一编辑该文件。
- `verification`: 与设计通用条件逐项对照，无领域泄漏。
- `failureDomain`: 失败暂停 `G3`–`G5` 与 `C1/F1`；`G2`、PROJECT 继续。
- `replanTriggers`: 需要改全局 AGENTS、需要 Lingui 字段、需要第三个 global 文件。
- `authorizationGate`: `status=pending-EXTERNAL-AUTH`; `grantSource=用户在 X1 给出的独立明确授权`; `grantedOperation=编辑 stage-gates reference`; `allowedOperations=本节点 commandScope`; `specialApprovals=[EXTERNAL-AUTH]`; `requiredApprovalIds=[EXTERNAL-AUTH]`。

### G2 — 补充计划表达契约

- `nodeId`: `G2`
- `taskBoundary`: `TB-GLOBAL`
- `operationKind`: 编辑
- `outcome`: `plan-document-contract.md` 禁止用预计 hunk/旧行号限制权威生成器边界内闭包，并要求生成物边界与语义验收。
- `estimatedCost`: M
- `deferralEvidence`: 无
- `hardPredecessors`: `D3`、`X1`；与 `G1` 写集合不相交，授权后真实并行。
- `consumes`: 已确认设计、现有 plan contract、外部授权记录。
- `produces`: 计划表达 reference diff。
- `completionEvidence`: 要求声明权威入口、输入 owner、完整生成物边界、人工补充边界、首次结构 diff 审查和二次 stability；禁止预计 hunk、旧源码行号、旧 source-reference 集合、“只含本功能 refs”和 generated 全量接受；不判断 Lingui 字段。
- `readSet`: 设计、`plan-document-contract.md`、执行图 contract。
- `writeSet`: `/Users/jiangsheng/cnb/codex-config/skills/project-doc-workflow/references/plan-document-contract.md`。
- `stateEffects`: 编辑一个外部仓库 reference。
- `commandScope`: `apply_patch` 仅目标 reference；只读 `sed/rg`。
- `subdelegation`: false
- `executionContext`: `codex-config/main` 当前工作树；独立仓库，index 不操作。
- `resourceLocks`: plan-document-contract canonical file write。
- `owner`: GLOBAL plan owner；唯一编辑该文件。
- `verification`: 与设计计划写作约束逐项对照，无领域判断复制。
- `failureDomain`: 失败暂停 `G3`–`G5` 与 `C1/F1`；`G1`、PROJECT 继续。
- `replanTriggers`: 需要改全局 AGENTS、需要字段级 Lingui 判断、需要第三个 global 文件。
- `authorizationGate`: `status=pending-EXTERNAL-AUTH`; `grantSource=用户在 X1 给出的独立明确授权`; `grantedOperation=编辑 plan contract reference`; `allowedOperations=本节点 commandScope`; `specialApprovals=[EXTERNAL-AUTH]`; `requiredApprovalIds=[EXTERNAL-AUTH]`。

### G3 — GLOBAL 组合验证与语义 oracle

- `nodeId`: `G3`
- `taskBoundary`: `TB-GLOBAL`
- `operationKind`: 验证
- `outcome`: 两个 global references 组合满足 owner 分层、结构验证和独立正负案例。
- `estimatedCost`: M
- `deferralEvidence`: 无
- `hardPredecessors`: `G1`、`G2`；等待 GLOBAL mutable diff fan-in。
- `consumes`: 两个 global references、设计、global diff、两个 skill 目录。
- `produces`: 两次 quick_validate 成功、组合 diff check 与正负 oracle。
- `completionEvidence`: 两条指定 GLOBAL quick_validate 命令分别退出 0；正向案例“完整生成物边界内确定性 metadata closure 且语义保持、重复稳定”得到继续；负向案例“预计 hunk 通过但语义字段变化或输出越界/不稳定”得到暂停；通用 stage owner 与 plan-expression owner 无职责重复；global allowlist 外无本任务 diff。
- `readSet`: 两个 global skill 目录、设计、`codex-config` diff/status、validator。
- `writeSet`: 无；`uv` 内部临时缓存不成为后续直接目标。
- `stateEffects`: 两次 quick_validate 进程及内部临时状态、只读审查输出。
- `commandScope`: 两条指定 GLOBAL quick_validate 命令；`sed/rg`；限定两个 targets 的 `git diff --check`、diff/status。
- `subdelegation`: false
- `executionContext`: `codex-config/main` 当前工作树、index 只读。
- `resourceLocks`: 两个 global skill directories read；uv cache write；`codex-config` index read。
- `owner`: TB-GLOBAL verification owner；唯一运行组合验证。
- `verification`: 结构、owner 边界、正负案例、diff check、外部 allowlist 全部通过。
- `failureDomain`: 失败暂停 `G4/G5` 与 `C1/F1`；PROJECT 继续。
- `replanTriggers`: validator 需要安装、语义案例无唯一结论、出现外部 allowlist 外 diff。
- `authorizationGate`: `status=pending-EXTERNAL-AUTH`; `grantSource=用户在 X1 给出的独立明确授权`; `grantedOperation=运行 GLOBAL 组合验证`; `allowedOperations=本节点 commandScope`; `specialApprovals=[EXTERNAL-AUTH]`; `requiredApprovalIds=[EXTERNAL-AUTH]`。

### G4 — GLOBAL 精确暂存

- `nodeId`: `G4`
- `taskBoundary`: `TB-GLOBAL`
- `operationKind`: stage
- `outcome`: `codex-config` index 只包含两个 global references。
- `estimatedCost`: S
- `deferralEvidence`: 无
- `hardPredecessors`: `G3`；等待 GLOBAL 组合验证证据。
- `consumes`: 核验通过的 GLOBAL diff。
- `produces`: GLOBAL-only staged diff。
- `completionEvidence`: cached name-only 精确等于两个 references；cached diff check 通过；`codex-config` 其他路径未暂存。
- `readSet`: 两个 global references、`codex-config` index/status。
- `writeSet`: `codex-config` index 中两个 reference 条目。
- `stateEffects`: 精确暂存两个外部 reference。
- `commandScope`: 在 `/Users/jiangsheng/cnb/codex-config` 运行 `git add -- skills/managing-work-stages/references/stage-gates.md skills/project-doc-workflow/references/plan-document-contract.md` 与只读 cached/status 核验。
- `subdelegation`: false
- `executionContext`: `codex-config/main` 当前工作树、该仓库 index 独占写。
- `resourceLocks`: `/Users/jiangsheng/cnb/codex-config/.git/index` write。
- `owner`: TB-GLOBAL Git owner；唯一 stage owner。
- `verification`: cached allowlist 与 cached diff check。
- `failureDomain`: 失败暂停 `G5` 与 `C1/F1`；PROJECT 继续。
- `replanTriggers`: index 已含范围外条目、target identity/branch 漂移。
- `authorizationGate`: `status=pending-EXTERNAL-AUTH`; `grantSource=用户在 X1 给出的独立明确授权`; `grantedOperation=精确暂存两个 global references`; `allowedOperations=本节点 commandScope`; `specialApprovals=[EXTERNAL-AUTH]`; `requiredApprovalIds=[EXTERNAL-AUTH]`。

### G5 — GLOBAL 独立提交

- `nodeId`: `G5`
- `taskBoundary`: `TB-GLOBAL`
- `operationKind`: commit
- `outcome`: 在 `codex-config/main` 创建仅含两个 references 的本地提交。
- `estimatedCost`: S
- `deferralEvidence`: 无
- `hardPredecessors`: `G4`；等待 GLOBAL-only staged diff。
- `consumes`: GLOBAL-only staged diff。
- `produces`: commit `fix(skills): govern generated metadata closure`。
- `completionEvidence`: commit 成功；branch 是 `main`；commit 文件集合精确；live symlink 与 global AGENTS 未修改。
- `readSet`: staged diff、`codex-config` HEAD/branch、live symlink。
- `writeSet`: `codex-config` local Git object database、`main` local ref、index。
- `stateEffects`: 一个外部仓库本地 GLOBAL commit；不 push。
- `commandScope`: `git commit -m 'fix(skills): govern generated metadata closure'` 与只读 `git show/status/readlink`。
- `subdelegation`: false
- `executionContext`: `codex-config/main` 当前工作树、该仓库 index 独占写。
- `resourceLocks`: `codex-config` Git index/ref/object database write。
- `owner`: TB-GLOBAL Git owner；唯一 commit owner。
- `verification`: commit identity、message、文件集合、branch、symlink/AGENTS 不变。
- `failureDomain`: 失败暂停 `C1/F1`；PROJECT 已完成提交不回滚。
- `replanTriggers`: commit 范围扩大、branch 漂移、提交失败、symlink/AGENTS 变化。
- `authorizationGate`: `status=pending-EXTERNAL-AUTH`; `grantSource=用户在 X1 给出的独立明确授权`; `grantedOperation=在 main 创建 GLOBAL 本地提交`; `allowedOperations=本节点 commandScope`; `specialApprovals=[EXTERNAL-AUTH]`; `requiredApprovalIds=[EXTERNAL-AUTH]`。

### C1 — CROSS-OWNER-ORACLE

- `nodeId`: `C1`
- `taskBoundary`: 无提交；跨 owner fan-in
- `operationKind`: 审查
- `outcome`: 在两个实现提交稳定后，证明 global stage owner、global plan owner、project Lingui owner 与前端 router 形成单向分层且同一案例结论一致。
- `estimatedCost`: M
- `deferralEvidence`: 无
- `hardPredecessors`: `P6`、`G5`；等待两个独立 implementation commits，不等待分支编号。
- `consumes`: DOCS/PROJECT/GLOBAL 三个 commit、四个 live owner、设计验收案例。
- `produces`: cross-owner oracle 记录。
- `completionEvidence`: 正向案例沿 router→project field classification→global stage conclusion 得到继续，且 plan contract 不用旧行号阻断；负向案例沿同一路径对计划外语义/状态/边界/stability drift 得到暂停；无 owner 复制另一 owner 的详细协议；两个 commit identity 保持独立。
- `readSet`: 三个 commits、两个 Codex project files、两个 global references、设计。
- `writeSet`: 无。
- `stateEffects`: 只读审查输出。
- `commandScope`: `sed/rg`、限定 `git show/diff/status`；不运行 generator/validator。
- `subdelegation`: false
- `executionContext`: Codex `dev` 与 `codex-config/main` 两个仓库只读。
- `resourceLocks`: 两仓库 refs/files read。
- `owner`: cross-owner oracle reviewer；不得编辑或 stage。
- `verification`: 独立正负案例、owner 唯一性、提交拓扑审查。
- `failureDomain`: 失败暂停 `F1`；若问题位于已提交内容，只能插入对应 taskBoundary 的新 fix edit→verify→stage→commit 链，再重新运行 `C1`。
- `replanTriggers`: 发现新 owner/文件、设计语义无法由四层唯一表达、需改变接口或范围。
- `authorizationGate`: `status=pending-plan-confirmation-and-EXTERNAL-AUTH`; `grantSource=用户后续计划确认与 X1 外部授权`; `grantedOperation=跨仓库只读审查`; `allowedOperations=本节点 commandScope`; `specialApprovals=[EXTERNAL-AUTH]`; `requiredApprovalIds=[EXTERNAL-AUTH]`。

### F1 — FINAL-AUDIT

- `nodeId`: `F1`
- `taskBoundary`: 无提交；最终 fan-in
- `operationKind`: fan-in
- `outcome`: 确认所有必须节点、提交、验证、隔离和禁止项满足后结束计划。
- `estimatedCost`: S
- `deferralEvidence`: 无
- `hardPredecessors`: `C1`；若插入 fix 链，则等待修正后的新 `C1`。
- `consumes`: 完整执行记录、三类 taskBoundary commits、cross-owner oracle、两仓库终态 status。
- `produces`: 最终审计结论与终态用户证据。
- `completionEvidence`: DOCS/PROJECT/GLOBAL 各有独立 commit；无 amend/squash；PROJECT 与 GLOBAL 在 DOCS 后实际并行调度且未互相等待；quick_validate 和各 task 正负 oracle 有证据；selected-skill dirty set 原样隔离；两个仓库无范围外 staged change；未运行禁止命令；终态报告包含实际并行、关键路径、未启动 ready 节点。
- `readSet`: 执行记录、三类 commits、两仓库 status/diff、验证证据。
- `writeSet`: 无。
- `stateEffects`: 最终对话报告。
- `commandScope`: 只读 `git log/show/status/diff`、`sed/rg`；不修改 workspace。
- `subdelegation`: false
- `executionContext`: 两仓库只读；所有 index 只读。
- `resourceLocks`: 两仓库 refs/index/files read。
- `owner`: 主协调 owner；唯一形成最终判断。
- `verification`: 节点完成检查、提交拓扑、禁止项、dirty isolation、实际调度记录。
- `failureDomain`: 失败只保持未满足项及其终态声明为未完成；不得追加未经授权工作。
- `replanTriggers`: 终态证据缺失、出现范围外状态、任何 commit identity 或 branch 不符。
- `authorizationGate`: `status=pending-plan-confirmation-and-EXTERNAL-AUTH`; `grantSource=用户后续计划确认与 X1 外部授权`; `grantedOperation=最终只读审计与汇报`; `allowedOperations=本节点 commandScope`; `specialApprovals=[EXTERNAL-AUTH]`; `requiredApprovalIds=[EXTERNAL-AUTH]`。

## 调度、fan-out/fan-in 与拓扑

### 初始 ready set

计划确认并编译执行图后，初始 ready set 只有 `D1`。`D2/D3` 等待 DOCS 证据与精确 index；所有实现节点等待 `D3`，GLOBAL 节点还等待 `EXTERNAL-AUTH`。

### DOCS 后 fan-out

`D3` 完成后，在同一调度循环中：

- `P1` 与 `P3` 进入 PROJECT ready set；写集合不相交，应立即真实并行。`P2` 在 `P1` 完成时立即启动，不等待 `P3`。
- `X1` 进入授权 ready set并立即请求独立确认。
- `X1` 产生 `EXTERNAL-AUTH` 后，`G1` 与 `G2` 同时进入 GLOBAL ready set；两个 canonical target 不相交，应立即真实并行。
- PROJECT 不等待 `X1` 或 GLOBAL；GLOBAL 不等待 PROJECT。某一 task 进入自己的组合验证、stage、commit 时，不因另一 task 尚未完成而延后。

### Task fan-in

- `TB-PROJECT`: `P2 + P3 → P4 → P5 → P6`。`P4` 是唯一组合验证 owner，`P5/P6` 是唯一 Git owner。
- `TB-GLOBAL`: `G1 + G2 → G3 → G4 → G5`。`G3` 是唯一组合验证 owner，`G4/G5` 是唯一 Git owner。
- `P6 + G5 → C1 → F1`。最终验证读取两个实现提交后的稳定状态，不读取任一共享工作树的中间 diff。

### 关键路径（预计）

粗粒度关键路径为：`D1 → D2 → D3 → X1（用户响应）→ max(G1,G2) → G3 → G4 → G5 → C1 → F1`。如果用户外部授权立即给出且 PROJECT skill 编写更慢，则动态关键路径切换为 `D1 → D2 → D3 → P1 → P2 → P4 → P5 → P6 → C1 → F1`。关键路径只影响容量优先级，不让另一 ready 分支等待。

### 资源锁

- Codex 与 `codex-config` 是两个独立 Git repositories、refs 和 indices；PROJECT 与 GLOBAL 不共享 Git 锁。
- `P1/P2` 共享 project skill target write，存在硬产物依赖；`P3` 写独立 `codex-gui/AGENTS.md`，无锁冲突。
- `G1/G2` 写两个不同 canonical references，无锁冲突。
- 同一 task 的验证读取完整 mutable diff，因此必须等待编辑 fan-in；stage/commit 独占该仓库 index/ref。
- PROJECT quick_validate 与 GLOBAL quick_validate 都写同一 canonical uv cache 时属于动态资源冲突：它们保持 ready，不建立 hard edge；一个释放 uv cache write lock 后立即运行另一个。其等待不得阻塞对应 task 的其他无冲突节点。

### 提交拓扑

- Codex：`既有 HEAD → TB-DOCS commit → TB-PROJECT commit`；保留两个提交身份。
- `codex-config`：`既有 main HEAD → TB-GLOBAL commit`。
- 两仓库不做 merge、cherry-pick、remote 或 branch 操作。跨仓库只通过 `C1` 的只读语义 oracle 汇合。
- 任何已提交问题都插入新的同 taskBoundary fix chain；新提交 message 应准确描述修正，禁止 amend、squash 或把修正塞进另一 task commit。修正后只重跑受影响 task 的组合验证、精确 stage/commit、`C1` 与 `F1`。

### 最终验证拓扑

各 task 的组合验证和正负 oracle 在其提交前完成；`C1` 只消费两个 implementation commits，检查跨 owner 组合语义；`F1` 再消费 `C1` 与完整提交/调度记录。`C1/F1` 不能替代 task-local quick_validate、diff check 或正负案例。

## 伪依赖反审计

- `P3` 不依赖 `P1/P2`：skill name、路由语义和目标文件已由设计稳定确定；已删除按文档顺序等待 skill 完成的伪边。
- `G1` 与 `G2` 不互相依赖：两者消费同一已确认设计，写不同 canonical reference；已删除因同属 GLOBAL 而串行的伪边。
- PROJECT 与 GLOBAL 只共同依赖 DOCS commit；GLOBAL 另有 `EXTERNAL-AUTH`。没有代码、接口、mutable diff 或 Git index 依赖，因此禁止互相等待。
- task-local `edit → verify → stage → commit` 的边分别等待完整 mutable diff、验证证据与精确 staged diff，是稳定产物依赖，不是惯例串行。
- `P6/G5 → C1` 等待两个稳定 commits，`C1 → F1` 等待跨 owner oracle，均有明确消费物。
- uv cache write/write 只产生动态资源锁，不添加 `P4 ↔ G3` hard edge；锁释放后立即重算 ready set。
- agent 复用、节点编号、文档顺序、同一方向或“最终都要完成”均不产生依赖。

## 完成条件与终态报告

只有以下条件全部成立才算完成：

- 三个 taskBoundary 各自形成规定 message 的独立本地 commit，未 amend、squash、合并任务提交或操作 remote。
- 全局 `AGENTS.md`、`/Users/jiangsheng/.codex/AGENTS.md` symlink、第三方/官方 skills、catalog、Lingui 配置、selected-skill dirty set 均未被修改或提交。
- PROJECT 新 skill 只有 `SKILL.md` 与 initializer 默认的 `agents/openai.yaml`；后者只含 generator 默认的 `display_name` 与 `short_description` quoted strings，不含未经请求的 optional interface/policy/dependency；`codex-gui/AGENTS.md` 只有一行专项路由。
- 两个 global canonical references 提交后，两个对应 live skill symlink 会立即看到新规则；`/Users/jiangsheng/.codex/AGENTS.md` 及其 canonical target 保持未修改。
- 两个 global references 只承担各自 owner；PROJECT skill 承担完整 Lingui 字段分类；cross-owner 正负案例结论一致。
- 三次 `quick_validate.py`、task-local diff checks、cached diff checks 和最终 audits 全部通过。
- 执行记录能报告：`实际并行`、`关键路径`、`未启动 ready 节点`。未实际重叠不得声称并行；ready 节点若未立即启动，必须记录当时有效的容量、授权、canonical 资源冲突或完整 `deferralEvidence`。

计划确认本身只授权 DOCS 与 PROJECT 的计划内实现、验证、stage 和本地 commit；它不替代 `X1` 所要求的项目外独立明确授权。没有 `EXTERNAL-AUTH` 时，GLOBAL 分支保持等待，但 PROJECT 分支必须继续完成自己的提交。
