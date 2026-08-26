# 工程约束风险落地提示词治理实施计划

日期：2026-08-26

状态：待确认

设计依据：`docs/superpowers/specs/2026/08/26/2026-08-26-risk-grounded-engineering-constraints-prompt-governance-design.md`

关联 issue：`docs/superpowers/issues/2026/08/24/2026-08-24-02-codex-execution-process-problems/2026-08-24-05-rules-used-as-wrong-proxies.md`

## 目标与保证边界

在不修改任何上游 SKILL、不修改产品代码和测试运行器配置的前提下，建立本机通用的工程约束判断 owner：全局与 GUI 提示词只保留短不变量和领域差异，新建 `$evaluating-engineering-constraints` 承载详细判断，校准 `$delegating-micro-stages` 中把槽位利用率误作目标的调度语义，并通过独立合成场景验证规则层行为。

本计划只提高提示词层判断的一致性，不能形成工具级 enforcement，也不能仅凭实施完成证明历史真实问题已经消失。关联 issue 保持打开，本计划不更新其状态。

## 当前基线与计划授权

- Codex 仓库：`/Users/jiangsheng/cnb/codex`，当前为 `dev@88dae79e47746d186d5db264be39bd0614f18d6f`；唯一变更是已确认设计文档与本计划文档未跟踪。
- `codex-config` 仓库：`/Users/jiangsheng/cnb/codex-config`，当前为 `main@9e6549ec2d48ee3c6069b31802cce8b92167c50e`，工作区干净。
- 当前 `/Users/jiangsheng/.codex/AGENTS.md` 是指向 `/Users/jiangsheng/cnb/codex-config/AGENTS.md` 的符号链接，两者是同一受保护资源。
- `uv 0.12.5`、`codex-cli 0.149.1`、skill initializer、`quick_validate.py`、fnm 管理的 Node `v24.17.0` 和 pnpm `10.33.0` 均已存在；不得安装或更新任何工具、依赖、运行时或浏览器。
- 计划确认将授权本文精确列出的本地文档提交、四个 worktree/branch 创建、三个配置任务提交、一个 GUI 提示词提交、本地集成、固化 installer 执行、隔离行为验收以及相关只读验证。
- 计划确认不授权编辑受保护的全局 `AGENTS.md`。该分支必须在编辑前再次展示本文“全局精确拟写内容”，并由用户单独明确回复 `确认写入`、`确认允许写入` 或等价直接授权。设计确认、计划确认或一般“继续”均不能替代。
- 全程禁止 Git remote、force、amend、squash、计划外清理、依赖安装和上游 SKILL 修改。
- 禁止 stage、commit、创建 worktree、merge、安装 skill 链接或运行行为验收，直到本计划被明确确认。计划确认后第一项有状态动作必须是只 stage 本设计与本计划并创建独立文档提交。

## 计划前精简证据摘要

### 权威入口

- 全局用户规则：`/Users/jiangsheng/cnb/codex-config/AGENTS.md`，live alias 为 `/Users/jiangsheng/.codex/AGENTS.md`。
- 手工 skill 来源：`/Users/jiangsheng/cnb/codex-config/skills/**`；live discovery 使用 `/Users/jiangsheng/.codex/skills/<name>` 单项链接。
- skill 初始化和结构校验：`/Users/jiangsheng/.codex/skills/.system/skill-creator/`。
- 委派调度详细 owner：`skills/delegating-micro-stages/SKILL.md` 与 `references/execution-graph.md`。
- GUI 目录规则：`/Users/jiangsheng/cnb/codex/codex-gui/AGENTS.md`。
- GUI Markdown 格式入口：`codex-gui/package.json` 中的 `format:prettier`，目标为 `prettier --check .`，覆盖 `codex-gui/AGENTS.md`。

### 已追踪链路

- 全局规则通过 live symlink 直接生效；新 skill 仅提交到仓库不会被发现，必须由 `install.zsh` 创建单项 live symlink。
- `install.zsh` 没有 dry-run，会枚举全部手工 skills，并检查/链接 `AGENTS.md`、`config.toml`、`.agents` 和每个 skill。实施前必须只读证明所有既有 managed target 已指向当前 source、新 skill target 不存在；否则禁止运行，避免触发 backup 分支。
- `$delegating-micro-stages` 主文件和 execution-graph reference 都包含“槽位用满/解释未填满”的语义；只修改主文件会留下 owner 冲突。
- GUI 当前 module-size、runtime-defense 和 performance 段落由当前用户 Git 身份维护；其余 formatter、contract、evidence closure、HeroUI、chunk boundary 和 fixture 段落是本计划的稳定排除区。
- 上游 `.codex/skills/code-review-change-size/SKILL.md` 来自 `pakrym-oai`，不会进入任何写集合；本地全局规则和新 skill 只补充当前解释，不改写上游文件。

### 修改范围与验证映射

| 修改范围 | 为什么需要 | 验证 |
| --- | --- | --- |
| `codex-config/AGENTS.md` | 增加短元规则、路由新 owner、校准槽位目标、移出前端样式细节 | 精确文本审查、protected approval、diff allowlist |
| 新建 `skills/evaluating-engineering-constraints/**` | 承载详细分类、证据、最小作用域与事故案例 | initializer 文件清单、规定方式 quick_validate、独立行为验收、metadata 路由探针 |
| `skills/delegating-micro-stages/SKILL.md` | 主入口仍把填满槽位作为成功信号 | quick_validate、语义正反检查、组合 diff |
| `skills/delegating-micro-stages/references/execution-graph.md` | 权威状态机、调度循环和完成检查仍重复槽位代理 | 语义正反检查、组合 diff |
| `codex-gui/AGENTS.md` | 压缩局部事故修补、接收样式规则、修正性能证明代理 | `format:prettier`、段落 allowlist、正反文本检查 |
| live skill symlink | 新 skill 否则不可发现 | installer 输出、新链接 `readlink`/`-ef`、既有 managed targets 无变化 |

### 排除项与剩余未知

- 不修改 `skills/managing-work-stages/**`、`install.zsh`、`skills-lock.json`、`.agents/skills/**`、Codex `.codex/skills/**`、产品代码、测试、浏览器配置、package scripts 或 issue。
- 不清理、不复用四个仍存在但已合并且干净的 action-authorization worktree/branch。
- 不运行 frontend test、lint、type-check、Browser Mode、E2E、Rust build 或 Rust test；本次没有产品运行时行为变化。
- 当前不存在阻断计划的关键未知。实施前若 HEAD、作者、worktree、managed target、工具或脚本入口漂移，则对应节点暂停并重编图。

## 精确文件集合与提交边界

### DOC：工作文档提交

提交消息：`docs: add engineering constraints governance plan`

仅包含：

- `docs/superpowers/specs/2026/08/26/2026-08-26-risk-grounded-engineering-constraints-prompt-governance-design.md`
- `docs/superpowers/plans/2026/08/26/2026-08-26-risk-grounded-engineering-constraints-prompt-governance-plan.md`

### CORE：新中央 skill

提交消息：`skills: add engineering constraints evaluator`

仅新增：

- `skills/evaluating-engineering-constraints/SKILL.md`
- `skills/evaluating-engineering-constraints/agents/openai.yaml`
- `skills/evaluating-engineering-constraints/references/evaluation-contract.md`
- `skills/evaluating-engineering-constraints/references/incident-acceptance-cases.md`

不创建 `scripts/`、`assets/`、README、changelog 或 examples。`agents/openai.yaml` 保持 implicit invocation 默认开启，不显式写 `policy.allow_implicit_invocation`。

### DELEGATION：有价值节点与最小冲突域

提交消息：`skills: ground delegation concurrency in useful work`

仅修改：

- `skills/delegating-micro-stages/SKILL.md`
- `skills/delegating-micro-stages/references/execution-graph.md`

### GLOBAL：全局短不变量与路由

提交消息：`instructions: ground engineering constraints in actual risk`

仅修改：

- `AGENTS.md`

### GUI：前端差异项精简

提交消息：`instructions(gui): ground engineering constraints in actual risk`

仅修改：

- `codex-gui/AGENTS.md`

## 全局精确拟写内容

GLOBAL 分支只允许以下三类变化，其他全局规则及顺序保持不变。

在当前“解决问题、保持检查能力、历史惯例只作证据”三条规则之后新增：

```markdown
- 工程规则必须区分硬约束与启发式信号。硬约束按其精确对象执行；启发式信号只有在明确受保护目标、测量对象、真实风险、因果证据和最小作用域后，才能用于改变工作范围、停止条件、结构、防御、验证或并发策略。
- 不得把指标、历史实现或“更安全”本身当作目标，也不得为满足它们削弱检查或无证据扩大局部风险。作出上述判断时必须使用 `$evaluating-engineering-constraints`；详细规则不得复制回全局指令。
```

把当前调度规则：

```markdown
- 每次节点完成、失败、资源释放或图变化后，必须重新计算 ready set，并立即并行运行所有无依赖、无冲突且已获授权的节点，直到槽位用满。串行必须有硬依赖、资源冲突或明确的负收益证据。
```

精确替换为：

```markdown
- 每次节点完成、失败、资源释放或图变化后，必须重新计算 ready set，并立即运行所有有实际价值、无依赖、无冲突且已获授权的节点。串行及其作用域必须有硬依赖、资源冲突或明确的负收益证据；不得为了填满槽位制造或过度拆分节点。
```

删除当前只属于前端样式测试的完整条目，不在全局留下缩写副本：

```markdown
- 不得仅因修改了样式就默认新增或修改测试。只有该样式属于明确、稳定、用户可感知且具有实际回归风险的产品约束时，才应添加测试。临时视觉调参或主观细节通常只做界面检查，不应把具体 padding、gap、颜色、阴影等实现数值固化为测试。是否测试必须以能否防止有价值的回归为依据，禁止仅为证明改动、提高覆盖率或锁定当前实现而添加低价值样式断言。
```

上述文本和 canonical target 共同绑定 special approval `protected-global-agents-write-engineering-constraints-2026-08-26`。任何字符、作用位置或 target identity 改变都使旧确认失效，必须重新展示并确认。

## 新 skill 内容契约

### Metadata

- `name`: `evaluating-engineering-constraints`
- description：只在指标、阈值、历史实现、防御性编码、并发限制或测试数量将被用于决定停工、拆分、串行、重构、加固或验证范围时触发；普通数字和无需解释的明确硬约束不触发。
- `interface.display_name`: `Evaluating Engineering Constraints`
- `interface.short_description`: `Ground engineering constraints in actual risks.`
- `interface.default_prompt`: `Use $evaluating-engineering-constraints to decide whether this metric or rule applies to the actual risk.`

### `SKILL.md`

主文件保持短入口，只负责：

- 区分硬约束、启发式信号、历史实现和领域惯例；
- 硬约束必须按精确对象执行，不能被本 skill 软化；
- 代理信号不能单独决定停工、拆分、串行、重构、加防御或加测试；
- 按风险决定解释长度，低风险不机械输出固定表格；
- 路由到两个 references；
- 明确与 `$managing-work-stages`、`$delegating-micro-stages`、`$action-authorization` 和领域提示词的职责边界。

### `references/evaluation-contract.md`

详细承载：规则类型、measurement target 与口径、受保护目标和失败模式、actor/path/impact、因果证据、最小作用域、最小必要动作、验证与退出条件、保持原检查能力，以及证据不足时的停止和回退行为。该 reference 明确“判断内容不是固定七字段表单”。

### `references/incident-acceptance-cases.md`

以正向、负向和边界控制覆盖：diff 与最终成品规模、跨语言 LoC、局部资源竞争、无威胁模型 runtime defense、小接口/短文件掩盖职责、明确硬约束保持强制、低风险普通数字不触发。案例不得写成关键词黑名单或新数值门禁。

## DELEGATION 精确语义边界

主 `SKILL.md` 只校准以下当前生效位置：

- “何时必须委派”中的实际需要与明确职责原则保持不变；
- “并行与串行”改为运行所有有实际价值的 ready 节点，容量只作为上限；
- 禁止为了占满槽位制造节点、过度拆分或扩大单节点；
- 资源冲突只限制最小冲突域，其他有价值 ready 节点继续；
- “完成前检查”改为检查是否无证据搁置了有价值 ready 节点，不检查 agent 数量是否填满。

`references/execution-graph.md` 同步校准：

- ready-set 状态机继续保留槽位作为容量事实；
- 调度循环从“直到槽位用满”改为“启动全部有价值且可运行的 ready 节点，直到没有更多此类节点或达到容量上限”；
- 删除“每次无法填满槽位都要解释”的完成代理，只要求解释为什么有价值的 ready 节点未运行；
- 运行记录和完成检查使用关键路径缩短、真实并发重叠与未搁置有价值节点作为证据；
- 动态读写锁、能力信封、Git owner、失败域、修正插图和 task-boundary fan-in 语义保持不变。

不得把“有实际价值”变成由数量、文件数、agent 数或口头 `parallelizable` 标记决定的新代理；判断仍基于唯一产出、依赖、资源锁、授权和当前负收益证据。

## GUI 精确拟写边界

将当前 `GUI Module Size Override` 与 `Frontend State and Runtime Defense Invariants` 合并为以下单一段落，并删除原来两段被替代的详细条目：

```markdown
## Frontend Engineering Constraints

- Within `codex-gui/**`, Rust module LoC, changed lines, and TypeScript, TSX, or JavaScript file length measure different objects. Do not convert one into another or use any of them alone as a hard stop.
- Evaluate frontend structure by responsibilities, state ownership, coupling, function scope, testability, and reviewability. A small public interface or short file does not justify concentrating multiple operations or state-transition families in one function, factory, or closure.
- Do not split, compress, weaken, or remove frontend tests merely to satisfy a length signal. Add style tests only for stable, user-visible product constraints with a concrete regression risk.
- Typed in-process boundaries should default to types, ownership, copying, and encapsulation. Runtime defense requires a documented actor, supported path, and failure impact that those boundaries cannot address; do not lock the defensive mechanism into tests unless runtime resistance is itself a product or security requirement.
- When a metric, historical implementation, or claim that something is “safer” would determine stopping, splitting, defensive machinery, or test scope, use `$evaluating-engineering-constraints`.
```

把 `Frontend Performance Invariants` 的最后一条精确替换为：

```markdown
- Performance verification must target a measurable risk. Regression coverage should encode a stable constraint; the existence of a test or issue note does not by itself establish that the rendering path is performant.
```

以下内容保持原样：repository formatter override、authoritative contract invariants、frontend evidence closure、HeroUI、前三条 chunk-level performance invariants、test fixture invariants。不得加入 Firefox/Chromium/WebKit 专属反门禁、`500` 数值反门禁或 `Object.freeze` 黑名单。

## Worktree 精确动作

文档提交和逐 owner 必要性审计成功后，按审计结果为仍有职责缺口的任务创建隔离 worktree。以下四条动作均随计划确认获得条件授权，但 `OWNER-GAP-AUDIT` 产出可复核 no-op 证据的任务必须跳过对应创建动作。三个 config worktree 创建节点共享 common Git metadata 写锁，由动态锁自然串行；GUI worktree 属于另一仓库，可以与任一 config 创建节点并行。

```bash
git -C /Users/jiangsheng/cnb/codex-config worktree add -b codex/engineering-constraints-core /Users/jiangsheng/cnb/codex-config-engineering-constraints-core main
git -C /Users/jiangsheng/cnb/codex-config worktree add -b codex/engineering-constraints-delegation /Users/jiangsheng/cnb/codex-config-engineering-constraints-delegation main
git -C /Users/jiangsheng/cnb/codex-config worktree add -b codex/engineering-constraints-global /Users/jiangsheng/cnb/codex-config-engineering-constraints-global main
git -C /Users/jiangsheng/cnb/codex worktree add -b codex/engineering-constraints-gui /Users/jiangsheng/cnb/codex-engineering-constraints-gui dev
```

计划前已只读确认上述四个 branch 和 path 当前都不存在。若计划执行时任一存在、base HEAD 漂移或状态不干净，停止对应预配节点并重编图；禁止覆盖、复用或清理既有目标。任务完成条件接受“计划内任务提交”或 `OWNER-GAP-AUDIT` 形成的稳定 no-op 证据，不以文件候选列表本身证明必须修改。

## 执行图

### 图总览

```text
计划确认
  -> DOC-STAGE -> DOC-COMMIT -> BASELINE-PREFLIGHT
       -> OWNER-GAP-AUDIT
            |-> WT-CORE -------\
            |-> WT-DELEGATION --\
            |-> WT-GLOBAL -------+-> PRECONFIG-FANIN
            |-> WT-GUI ---------/
                              |-> CORE-GENERATE -> CORE-EDIT -> CORE-VERIFY -> CORE-STAGE -> CORE-COMMIT
                              |-> DELEGATION-EDIT -> DELEGATION-VERIFY -> DELEGATION-STAGE -> DELEGATION-COMMIT
                              |-> GUI-EDIT -> GUI-VERIFY -> GUI-STAGE -> GUI-COMMIT
                              |-> GLOBAL-APPROVAL -> GLOBAL-EDIT -> GLOBAL-VERIFY -> GLOBAL-STAGE -> GLOBAL-COMMIT

CORE-COMMIT -----------> CFG-MERGE-CORE -> INSTALL-PREFLIGHT -> INSTALL-SKILL
DELEGATION-COMMIT -----> CFG-MERGE-DELEGATION ------------------------------\
GLOBAL-COMMIT ------------------------------------\                           \
INSTALL-SKILL ------------------------------------+-> CFG-MERGE-GLOBAL --------> CONFIG-FANIN
GUI-COMMIT ---------------------------------------\                           /
INSTALL-SKILL -------------------------------------+-> GUI-MERGE -> GUI-FINAL-VERIFY

CONFIG-FANIN -> CONFIG-FINAL-VERIFY
{CONFIG-FANIN, INSTALL-SKILL} -> {EXPLICIT-01..06, ROUTE-01..02}
EXPLICIT-01..06 -> REVIEW-EXPLICIT-01..06 --\
ROUTE-01..02 ----> REVIEW-ROUTE-01..02 -------+-> BEHAVIOR-FANIN
{CONFIG-FINAL-VERIFY, GUI-FINAL-VERIFY, BEHAVIOR-FANIN} -> FINAL-AUDIT
```

图中的任务分支是 `OWNER-GAP-AUDIT` 判定为 `required` 时才激活的条件分支；`no-op` 任务由审计证据直接满足相应任务结果。GLOBAL 分支缺少 special approval 时保持授权暂停；CORE、DELEGATION 和 GUI 分支继续。四个任务的编辑与提交没有语义依赖。config 三个 merge 共享 `main` index/ref 独占锁而动态串行，但互相不是硬前置；`CFG-MERGE-GLOBAL` 另有 `INSTALL-SKILL` 硬前置，避免 live 全局提示词先引用未安装 skill。`GUI-MERGE` 同样等待 `INSTALL-SKILL`，但 GUI 分支编辑、验证和提交可提前并行完成。

### 初始 ready set、fan-out 与关键路径

- 计划确认后的初始 ready set 只有 `DOC-STAGE`；这是“工作文档先独立提交”门禁，不是任务间伪依赖。
- `BASELINE-PREFLIGHT` 完成后只有 `OWNER-GAP-AUDIT` ready；审计完成后，所有 `required` 任务的 worktree 创建节点进入 ready set。三个 config 创建节点因同一 canonical Git metadata 写锁动态串行，`WT-GUI` 可并行。
- `PRECONFIG-FANIN` 只等待全部 `required` worktree 已核验，并接收其他任务的 no-op 证据；随后 CORE、DELEGATION、GUI 和已获 special approval 的 GLOBAL pipeline 同时 ready。
- 粗粒度关键路径为 `DOC -> baseline -> owner audit -> CORE worktree/pipeline -> CFG-MERGE-CORE -> install preflight -> INSTALL-SKILL -> GLOBAL/GUI live merge -> repository final verification -> FINAL-AUDIT`。DELEGATION 集成与八条 `actor -> case-review` 行为链是可重叠旁支；各 case-review 在对应 actor 完成后立即 ready，不等待其他案例。
- 任一节点完成、失败、释放锁、授权变化或审计结果变化后立即重算 ready set；容量只是上限，不为占满槽位制造节点。

### 授权信封模板

以下模板与节点声明共同构成完整能力信封：

- `AUTH-READ`：`grantSource=计划确认`；`grantedOperation=节点声明的 investigation/verification/review/fan-in`；`parameterBounds=节点 commandScope 与 readSet`；`status=待计划确认`；`requiredApprovalIds=[]`；`sideEffects=只读输出或明确临时 cache`；`negativeConstraints=无编辑、无 stage/commit、无 remote、无安装`；`subdelegation=仅节点声明范围`；节点完成或前提失效即到期。
- `AUTH-WRITE`：`grantSource=计划确认`；`grantedOperation=节点声明的 edit/generate`；`parameterBounds=节点 commandScope 与 writeSet`；`status=待计划确认`；`requiredApprovalIds=[]`；只允许声明的未暂存文件变化，无 index、commit、remote 或范围外文件。
- `AUTH-STAGE`：`grantSource=计划确认`；`grantedOperation=stage`；`parameterBounds=节点精确 allowlist 的 git add 与 staged diff 审查`；`status=待计划确认`；`requiredApprovalIds=[]`；无编辑、commit 或 remote。
- `AUTH-COMMIT`：`grantSource=计划确认`；`grantedOperation=commit`；`parameterBounds=节点既有 staged snapshot 和精确提交消息`；`status=待计划确认`；`requiredApprovalIds=[]`；无额外 stage、amend、squash 或 remote。
- `AUTH-INTEGRATE`：`grantSource=计划确认`；`grantedOperation=条件 worktree creation 或 local integration`；`parameterBounds=节点精确命令、branch/path/base 和必要只读核验`；`status=待计划确认`；`requiredApprovalIds=[]`；无 force、remote、cleanup 或计划外冲突解决。
- `AUTH-INSTALL`：`grantSource=计划确认`；`grantedOperation=local installer execution`；`parameterBounds=全部 managed-target preflight 通过后在 config main 运行当前 install.zsh，唯一预期新增 target 为 evaluating-engineering-constraints`；`status=待计划确认`；`requiredApprovalIds=[]`；禁止 backup、覆盖、其他 live target 变化和 remote。
- `AUTH-FWD`：`grantSource=计划确认`；`grantedOperation=isolated behavioral verification`；`parameterBounds=节点唯一 prompt 与 codex exec --ephemeral --json --sandbox read-only --skip-git-repo-check -C /tmp`；`status=待计划确认`；`requiredApprovalIds=[]`；无 workspace write、Git、产品启动、remote 或持久 session。
- `AUTH-ASK-GLOBAL`：`grantSource=计划确认`；`grantedOperation=请求 protected-target approval`；`parameterBounds=只展示本文全局精确拟写内容与 canonical identity 并等待`；`status=待计划确认`；`requiredApprovalIds=[]`；无工具写入。
- `AUTH-GLOBAL-SPECIAL`：`grantSource=用户对本文精确文本和 canonical target 的单独写入确认`；`grantedOperation=protected-target approval only`；`parameterBounds=/Users/jiangsheng/cnb/codex-config/AGENTS.md 与 /Users/jiangsheng/.codex/AGENTS.md 的同一 live identity，以及从该 baseline 创建的 GLOBAL candidate`；`sideEffects=只产生 special approval 记录，不单独授权 edit/stage/commit/integration`；`status=未授权`；`requiredApprovalIds=[protected-global-agents-write-engineering-constraints-2026-08-26]`。

GLOBAL 各动作必须同时消费计划确认提供的对应动作授权和 `AUTH-GLOBAL-SPECIAL`。`GLOBAL-EDIT` 使用 `AUTH-WRITE + AUTH-GLOBAL-SPECIAL`，`GLOBAL-STAGE` 使用 `AUTH-STAGE + AUTH-GLOBAL-SPECIAL`，`GLOBAL-COMMIT` 使用 `AUTH-COMMIT + AUTH-GLOBAL-SPECIAL`，`CFG-MERGE-GLOBAL` 使用 `AUTH-INTEGRATE + AUTH-GLOBAL-SPECIAL`；special approval 不能代替或扩大计划内 Git 动作授权。

### DOC 节点

#### DOC-STAGE

- `taskBoundary`: DOC；`operationKind`: stage；`outcome`: index 只含设计和计划；`estimatedCost`: 低；`deferralEvidence`: 无。
- `hardPredecessors`: 计划已明确确认；`consumes/produces`: 两份未跟踪文档 / staged snapshot。
- `completionEvidence`: `git diff --cached --name-only` 仅两路径，完整 staged 内容已审查，`git diff --cached --check` 通过。
- `readSet`: 两份文档、主仓库状态；`writeSet`: `/Users/jiangsheng/cnb/codex/.git/index`。
- `stateEffects`: 只 stage 两份文档；`commandScope`: 精确 `git add -- <design> <plan>`、staged name/diff/check；`subdelegation`: 禁止。
- `executionContext`: Codex `dev` 主 worktree/index；`resourceLocks`: 主 index write；`owner`: 唯一 DOC Git owner。
- `verification`: staged allowlist 与完整 diff；`failureDomain`: DOC-COMMIT 及全部实施；`replanTriggers`: 文档、HEAD 或 index 漂移；`authorizationGate`: `AUTH-STAGE`。

#### DOC-COMMIT

- `taskBoundary`: DOC；`operationKind`: commit；`outcome`: 独立文档提交；`estimatedCost`: 低；`deferralEvidence`: 无。
- `hardPredecessors`: DOC-STAGE；`consumes/produces`: staged snapshot / commit id；`completionEvidence`: commit tree 仅两文档。
- `readSet`: staged snapshot；`writeSet`: `refs/heads/dev`；`stateEffects`: 一个本地提交。
- `commandScope`: `git commit -m 'docs: add engineering constraints governance plan'`、`git show --stat --oneline HEAD`；`subdelegation`: 禁止。
- `executionContext`: Codex `dev` 主 index/ref；`resourceLocks`: 主 index/ref write；`owner`: DOC-STAGE 同一 Git owner。
- `verification`: commit allowlist；`failureDomain`: 全部实施；`replanTriggers`: staged snapshot 变化或提交失败；`authorizationGate`: `AUTH-COMMIT`。

### 共享 preflight 与 worktree 节点

#### BASELINE-PREFLIGHT

- `taskBoundary`: 共享前提，无提交；`operationKind`: investigation；`outcome`: 当前 HEAD、状态、作者、工具、入口、branch/path 和 protected identity 与计划一致；`estimatedCost`: 中；`deferralEvidence`: 无。
- `hardPredecessors`: DOC-COMMIT；`consumes/produces`: 两仓库与 live config / 基线报告；`completionEvidence`: 所有计划假设逐项通过。
- `readSet`: 两仓库 Git 元数据、目标文件、skill-creator、package.json、install.zsh、live symlink；`writeSet`: 无；`stateEffects`: 只读报告。
- `commandScope`: `git status/branch/rev-parse/log/blame/worktree list`、`test`、`realpath/readlink`、`command -v`、`uv --version`、`codex --version`、fnm-backed Node/pnpm version；`subdelegation`: 禁止。
- `executionContext`: 主协调只读；`resourceLocks`: 两仓库和 live targets read；`owner`: baseline owner。
- `verification`: 对照本文 baseline；`failureDomain`: 只暂停漂移影响的分支，共享前提漂移暂停全部；`replanTriggers`: 任一关键假设变化；`authorizationGate`: `AUTH-READ`。

#### OWNER-GAP-AUDIT

- `taskBoundary`: 共享调查，无提交；`operationKind`: review；`outcome`: CORE、DELEGATION、GLOBAL、GUI 各自产生 `required` 或 `no-op` 的稳定必要性结论；`estimatedCost`: 中；`deferralEvidence`: 无。
- `hardPredecessors`: BASELINE-PREFLIGHT；依赖原因为审计必须读取已确认且未漂移的 baseline；`consumes/produces`: 当前四个 owner、设计契约和 baseline 报告 / 四份 owner-status 证据。
- `completionEvidence`: 每个 owner 均列出当前缺口或证明现状已完整满足设计；`no-op` 必须包含逐条语义映射、无待改 diff 和跳过 worktree/pipeline 的结论，不能以“文件看起来相似”代替。
- `readSet`: `codex-config/AGENTS.md`、新 skill 目标路径、delegating 两文件、`codex-gui/AGENTS.md`、设计和 baseline；`writeSet`: 无；`stateEffects`: 只读审计结论。
- `commandScope`: 精确 `sed`/`rg`/`git diff`/`git log`/`git blame` 与路径存在性检查；`subdelegation`: 允许四个互不写入的单-owner 只读审查，禁止任何有状态动作。
- `executionContext`: 两仓库稳定主 worktree 的只读上下文；`resourceLocks`: 四个 owner 与两稳定 HEAD read；`owner`: owner-gap audit owner，主协调保留最终判断。
- `verification`: 逐 owner 对照设计，不预设候选 owner 必改；`failureDomain`: 只暂停证据不足的 owner 分支；`replanTriggers`: owner、作者、设计映射或 baseline 漂移；`authorizationGate`: `AUTH-READ`。

#### WT-CORE

- `taskBoundary`: CORE 预配，无提交；`operationKind`: integration；`outcome`: CORE worktree/branch 从审计使用的 config `main` 创建且干净；`estimatedCost`: 低；`deferralEvidence`: 无。
- `hardPredecessors`: OWNER-GAP-AUDIT 的 CORE=`required` 证据；`consumes/produces`: config main stable HEAD、CORE required 证据 / CORE worktree/index；`completionEvidence`: worktree list、branch、HEAD、status 全匹配。
- `readSet`: config main ref、CORE branch/path；`writeSet`: CORE branch ref、worktree metadata/path/index；`stateEffects`: 一个本地 branch/worktree。
- `commandScope`: 本文第一条精确 `git worktree add` 及创建前 branch/path 不存在检查、创建后 branch/HEAD/status 检查；`subdelegation`: 禁止。
- `executionContext`: config common repo；`resourceLocks`: canonical config common worktree metadata write、CORE ref write；`owner`: config preconfiguration owner。
- `verification`: CORE worktree 干净且 base 匹配；`failureDomain`: CORE pipeline 与 PRECONFIG-FANIN；`replanTriggers`: branch/path 存在、main 漂移、创建失败；`authorizationGate`: `AUTH-INTEGRATE`。

#### WT-DELEGATION

- `taskBoundary`: DELEGATION 预配，无提交；`operationKind`: integration；`outcome`: DELEGATION worktree/branch 从审计使用的 config `main` 创建且干净；`estimatedCost`: 低；`deferralEvidence`: 无。
- `hardPredecessors`: OWNER-GAP-AUDIT 的 DELEGATION=`required` 证据；`consumes/produces`: config main stable HEAD、DELEGATION required 证据 / DELEGATION worktree/index；`completionEvidence`: worktree list、branch、HEAD、status 全匹配。
- `readSet`: config main ref、DELEGATION branch/path；`writeSet`: DELEGATION branch ref、worktree metadata/path/index；`stateEffects`: 一个本地 branch/worktree。
- `commandScope`: 本文第二条精确 `git worktree add` 及创建前后检查；`subdelegation`: 禁止。
- `executionContext`: config common repo；`resourceLocks`: canonical config common worktree metadata write、DELEGATION ref write；`owner`: config preconfiguration owner。
- `verification`: DELEGATION worktree 干净且 base 匹配；`failureDomain`: DELEGATION pipeline 与 PRECONFIG-FANIN；`replanTriggers`: branch/path 存在、main 漂移、创建失败；`authorizationGate`: `AUTH-INTEGRATE`。

#### WT-GLOBAL

- `taskBoundary`: GLOBAL 预配，无提交；`operationKind`: integration；`outcome`: GLOBAL worktree/branch 从审计使用的 config `main` 创建且干净；`estimatedCost`: 低；`deferralEvidence`: 无。
- `hardPredecessors`: OWNER-GAP-AUDIT 的 GLOBAL=`required` 证据；创建 candidate worktree 本身不修改受保护文件内容，不等待 special approval；`consumes/produces`: config main stable HEAD、GLOBAL required 证据 / GLOBAL worktree/index；`completionEvidence`: worktree list、branch、HEAD、status 全匹配。
- `readSet`: config main ref、GLOBAL branch/path；`writeSet`: GLOBAL branch ref、worktree metadata/path/index；`stateEffects`: 一个本地 branch/worktree，不改变 candidate 内容。
- `commandScope`: 本文第三条精确 `git worktree add` 及创建前后检查；`subdelegation`: 禁止。
- `executionContext`: config common repo；`resourceLocks`: canonical config common worktree metadata write、GLOBAL ref write；`owner`: config preconfiguration owner。
- `verification`: GLOBAL worktree 干净且 base 匹配；`failureDomain`: GLOBAL pipeline 与 PRECONFIG-FANIN；`replanTriggers`: branch/path 存在、main 漂移、创建失败；`authorizationGate`: `AUTH-INTEGRATE`。

#### WT-GUI

- `taskBoundary`: 预配，无提交；`operationKind`: integration；`outcome`: GUI worktree/branch 从文档提交后的 dev 创建且干净；`estimatedCost`: 低；`deferralEvidence`: 无。
- `hardPredecessors`: OWNER-GAP-AUDIT 的 GUI=`required` 证据；`consumes/produces`: dev document commit、GUI required 证据 / GUI worktree/index；`completionEvidence`: branch、HEAD、status 匹配。
- `readSet`: dev ref、目标 branch/path；`writeSet`: GUI branch ref、worktree metadata/path/index；`stateEffects`: 一个本地 branch/worktree。
- `commandScope`: 本文 GUI 精确 `git worktree add` 与创建前后检查；`subdelegation`: 禁止。
- `executionContext`: Codex common repo；`resourceLocks`: Codex worktree metadata 与 GUI ref write；`owner`: GUI preconfiguration owner。
- `verification`: worktree 干净、HEAD 为 DOC-COMMIT；`failureDomain`: GUI 任务及 PRECONFIG-FANIN；`replanTriggers`: branch/path 存在、dev 漂移、创建失败；`authorizationGate`: `AUTH-INTEGRATE`。

#### PRECONFIG-FANIN

- `taskBoundary`: 预配屏障，无提交；`operationKind`: fan-in；`outcome`: 每个 owner 均有干净隔离 worktree 或稳定 no-op 证据；`estimatedCost`: 低；`deferralEvidence`: 无。
- `hardPredecessors`: OWNER-GAP-AUDIT，以及所有状态为 `required` 的 WT-CORE、WT-DELEGATION、WT-GLOBAL、WT-GUI；每条边等待对应 execution context；`consumes/produces`: required worktree identities 与 no-op 证据 / 实施 ready-set 证据。
- `completionEvidence`: required 任务的 worktree/branch/index 映射完整，no-op 任务没有创建 branch/path，四个 owner 无缺口。
- `readSet`: owner-status 证据与已创建 worktree 状态；`writeSet`: 无；`stateEffects`: 只读汇合结论；`commandScope`: worktree list、branch/HEAD/status 与 no-op 证据复核；`subdelegation`: 禁止。
- `executionContext`: 主协调；`resourceLocks`: owner-status 与 required worktrees read；`owner`: fan-in owner。
- `verification`: 无 branch/path/index 复用且无多余 worktree；`failureDomain`: 仅缺失 execution context 的任务；`replanTriggers`: owner-status 或映射漂移；`authorizationGate`: `AUTH-READ`。

### 四个任务 pipeline

以下任务各自使用独立 worktree、branch 和 index。每个 pipeline 的 edit/verify/stage/commit 仅依赖自身稳定产物，不阻塞其他 pipeline。

#### CORE-GENERATE

- `taskBoundary`: CORE；`operationKind`: generate；`outcome`: initializer 创建四文件 scaffold；`estimatedCost`: 低；`deferralEvidence`: 无。
- `hardPredecessors`: PRECONFIG-FANIN；`consumes/produces`: skill-creator initializer / skill scaffold；`completionEvidence`: 四个计划文件存在，无 scripts/assets/examples。
- `readSet`: initializer、skill-creator 规则、设计；`writeSet`: CORE 四文件；`stateEffects`: 未暂存 scaffold。
- `commandScope`: `/usr/bin/python3 /Users/jiangsheng/.codex/skills/.system/skill-creator/scripts/init_skill.py evaluating-engineering-constraints --path /Users/jiangsheng/cnb/codex-config-engineering-constraints-core/skills --resources references --interface 'display_name=Evaluating Engineering Constraints' --interface 'short_description=Ground engineering constraints in actual risks.' --interface 'default_prompt=Use $evaluating-engineering-constraints to decide whether this metric or rule applies to the actual risk.'`；`subdelegation`: 禁止。
- `executionContext`: CORE worktree/index；`resourceLocks`: 新 skill 目录 write；`owner`: CORE edit owner。
- `verification`: 生成清单；`failureDomain`: CORE 后继；`replanTriggers`: skill 已存在、initializer 变化或范围外产物；`authorizationGate`: `AUTH-WRITE`。

#### CORE-EDIT

- `taskBoundary`: CORE；`operationKind`: edit；`outcome`: 四文件满足本文内容契约；`estimatedCost`: 高；`deferralEvidence`: 无。
- `hardPredecessors`: CORE-GENERATE；`consumes/produces`: scaffold、设计 / 最终 skill 内容；`completionEvidence`: 无 TODO/placeholder，references 路由完整，metadata 精确。
- `readSet`: 设计、scaffold、skill-creator 规则；`writeSet`: CORE 四文件；`stateEffects`: 未暂存内容修改。
- `commandScope`: 仅用 `apply_patch` 修改 CORE 四个绝对路径；`subdelegation`: 可委派只读审查，禁止再委派写入。
- `executionContext`: CORE worktree/index；`resourceLocks`: CORE 四文件 write；`owner`: CORE edit owner。
- `verification`: 内容逐项映射设计；`failureDomain`: CORE 后继；`replanTriggers`: 需要 scripts/assets、新 owner 或上游修改；`authorizationGate`: `AUTH-WRITE`。

#### CORE-VERIFY / CORE-STAGE / CORE-COMMIT

- `CORE-VERIFY`: `taskBoundary=CORE`；`operationKind=verification`；`outcome=结构与内容验证通过`；`estimatedCost=中`；`deferralEvidence=无`；`hardPredecessors=CORE-EDIT`；`consumes/produces=四文件/验证证据`；`completionEvidence=quick_validate 成功、无 placeholder、git diff --check 通过`；`readSet=四文件与 validator`；`writeSet=canonical uv cache /Users/jiangsheng/.cache/uv`；`stateEffects=uv 隔离依赖 cache 变化，无仓库变化`；`commandScope=uv run --no-project --with pyyaml python /Users/jiangsheng/.codex/skills/.system/skill-creator/scripts/quick_validate.py /Users/jiangsheng/cnb/codex-config-engineering-constraints-core/skills/evaluating-engineering-constraints，以及 rg/git diff --check`；`executionContext=CORE worktree`；`resourceLocks=CORE files read、/Users/jiangsheng/.cache/uv write`；`owner=CORE verification owner`；`verification=结构与正反内容检查`；`failureDomain=CORE-STAGE/COMMIT`；`replanTriggers=validator/tool/cache identity 变化或范围外生成`；`subdelegation=禁止`；`authorizationGate=AUTH-READ`。
- `CORE-STAGE`: `taskBoundary=CORE`；`operationKind=stage`；`outcome=只含 CORE 四文件的 staged snapshot`；`hardPredecessors=CORE-VERIFY`；`consumes/produces=验证后 diff/staged snapshot`；`completionEvidence=staged allowlist、cached check/diff`；`readSet=CORE diff`；`writeSet=CORE index`；`stateEffects=只 stage 四文件`；`commandScope=精确 git add -- 四路径及 cached 审查`；`executionContext=CORE worktree/index`；`resourceLocks=CORE index write`；`owner=CORE Git owner`；`verification=完整 staged diff`；`failureDomain=CORE-COMMIT`；`replanTriggers=diff 漂移`；`estimatedCost=低`；`deferralEvidence=无`；`subdelegation=禁止`；`authorizationGate=AUTH-STAGE`。
- `CORE-COMMIT`: `taskBoundary=CORE`；`operationKind=commit`；`outcome=一个 CORE 本地提交`；`hardPredecessors=CORE-STAGE`；`consumes/produces=staged snapshot/commit id`；`completionEvidence=commit allowlist`；`readSet=staged snapshot`；`writeSet=CORE branch ref`；`stateEffects=本地 commit`；`commandScope=git commit -m 'skills: add engineering constraints evaluator' 与 git show`；`executionContext=CORE worktree/index/ref`；`resourceLocks=CORE index/ref write`；`owner=CORE-STAGE 同一 Git owner`；`verification=commit tree`；`failureDomain=CFG-MERGE-CORE`；`replanTriggers=staged snapshot 变化`；`estimatedCost=低`；`deferralEvidence=无`；`subdelegation=禁止`；`authorizationGate=AUTH-COMMIT`。

#### DELEGATION pipeline

- `DELEGATION-EDIT`: `taskBoundary=DELEGATION`；`operationKind=edit`；`outcome=两文件完成有价值节点语义校准`；`estimatedCost=中`；`deferralEvidence=无`；`hardPredecessors=PRECONFIG-FANIN`；`consumes/produces=设计和当前两文件/最终两文件`；`completionEvidence=本文精确语义全部存在且 owner 其余部分未变`；`readSet/writeSet=两计划文件`；`stateEffects=未暂存修改`；`commandScope=仅 apply_patch 两绝对路径`；`executionContext=DELEGATION worktree/index`；`resourceLocks=两文件 write`；`owner=DELEGATION edit owner`；`verification=段落 allowlist`；`failureDomain=本 pipeline 后继`；`replanTriggers=需要其他 skill 或历史文档修改`；`subdelegation=可只读审查，不可写入`；`authorizationGate=AUTH-WRITE`。
- `DELEGATION-VERIFY`: `taskBoundary=DELEGATION`；`operationKind=verification`；`outcome=结构、正反语义和 diff 验证通过`；`estimatedCost=中`；`hardPredecessors=DELEGATION-EDIT`；`consumes/produces=两文件/验证证据`；`completionEvidence=quick_validate、git diff --check、目标旧代理措辞消失且容量事实仍保留`；`readSet=delegating skill 目录与 validator`；`writeSet=canonical uv cache /Users/jiangsheng/.cache/uv`；`stateEffects=uv 隔离依赖 cache 变化，无仓库变化`；`commandScope=规定 uv quick_validate 对 delegating skill 目录、rg、git diff --check`；`executionContext=DELEGATION worktree`；`resourceLocks=delegating skill 目录 read、/Users/jiangsheng/.cache/uv write`；`owner=DELEGATION verification owner`；`verification=不得把所有“槽位”字样机械删除，检查语义而非词频`；`failureDomain=stage/commit`；`replanTriggers=新 owner 冲突、cache identity 漂移或 validator 失败`；`deferralEvidence=无`；`subdelegation=禁止`；`authorizationGate=AUTH-READ`。
- `DELEGATION-STAGE`: `taskBoundary=DELEGATION`；`operationKind=stage`；`outcome=只含 delegation 两文件的 staged snapshot`；`estimatedCost=低`；`deferralEvidence=无`；`hardPredecessors=DELEGATION-VERIFY`；`consumes/produces=验证后两文件 diff/staged snapshot`；`completionEvidence=staged allowlist、cached check 与完整 diff`；`readSet=DELEGATION diff`；`writeSet=DELEGATION index`；`stateEffects=只 stage 两文件`；`commandScope=精确 git add -- 两路径及 cached 审查`；`executionContext=DELEGATION worktree/index`；`resourceLocks=DELEGATION index write`；`owner=DELEGATION Git owner`；`verification=完整 staged diff`；`failureDomain=DELEGATION-COMMIT`；`replanTriggers=diff 漂移`；`subdelegation=禁止`；`authorizationGate=AUTH-STAGE`。
- `DELEGATION-COMMIT`: `taskBoundary=DELEGATION`；`operationKind=commit`；`outcome=一个 DELEGATION 本地提交`；`estimatedCost=低`；`deferralEvidence=无`；`hardPredecessors=DELEGATION-STAGE`；`consumes/produces=staged snapshot/commit id`；`completionEvidence=commit tree 仅两文件`；`readSet=staged snapshot`；`writeSet=DELEGATION branch ref`；`stateEffects=一个本地 commit`；`commandScope=git commit -m 'skills: ground delegation concurrency in useful work' 与 git show`；`executionContext=DELEGATION worktree/index/ref`；`resourceLocks=DELEGATION index/ref write`；`owner=DELEGATION Git owner`；`verification=commit tree allowlist`；`failureDomain=CFG-MERGE-DELEGATION`；`replanTriggers=staged snapshot 变化`；`subdelegation=禁止`；`authorizationGate=AUTH-COMMIT`。

#### GUI pipeline

- `GUI-EDIT`: `taskBoundary=GUI`；`operationKind=edit`；`outcome=AGENTS 只在本文指定三处完成精简`；`estimatedCost=中`；`deferralEvidence=无`；`hardPredecessors=PRECONFIG-FANIN`；`consumes/produces=当前 GUI AGENTS 和精确文本/最终 GUI AGENTS`；`completionEvidence=两个目标段落和 performance 末条精确匹配`；`readSet/writeSet=codex-gui/AGENTS.md`；`stateEffects=未暂存修改`；`commandScope=仅 apply_patch 该绝对路径`；`executionContext=GUI worktree/index`；`resourceLocks=GUI AGENTS write`；`owner=GUI edit owner`；`verification=非目标段落字节级保持`；`failureDomain=GUI 后继`；`replanTriggers=需要产品文件、package 或上游 skill`；`subdelegation=可只读审查，不可写入`；`authorizationGate=AUTH-WRITE`。
- `GUI-VERIFY`: `taskBoundary=GUI`；`operationKind=verification`；`outcome=Markdown 格式和内容边界通过`；`estimatedCost=中`；`hardPredecessors=GUI-EDIT`；`consumes/produces=GUI diff/验证证据`；`completionEvidence=format:prettier 成功、git diff --check、段落 allowlist 和正反检查通过`；`readSet=GUI AGENTS、package.json、node_modules`；`writeSet=无`；`stateEffects=无仓库变化`；`commandScope=cwd=/Users/jiangsheng/cnb/codex-engineering-constraints-gui/codex-gui，/opt/homebrew/bin/fnm exec --using-file pnpm run format:prettier，以及 git diff --check/rg/diff`；`executionContext=GUI worktree`；`resourceLocks=codex-gui tree read、formatter runner`；`owner=GUI verification owner`；`verification=不运行 fix、lint、type-check 或 tests`；`failureDomain=GUI-STAGE/COMMIT`；`replanTriggers=工具缺失、formatter 目标变化或范围外失败`；`deferralEvidence=无`；`subdelegation=禁止`；`authorizationGate=AUTH-READ`。
- `GUI-STAGE`: `taskBoundary=GUI`；`operationKind=stage`；`outcome=只含 codex-gui/AGENTS.md 的 staged snapshot`；`estimatedCost=低`；`deferralEvidence=无`；`hardPredecessors=GUI-VERIFY`；`consumes/produces=验证后 GUI diff/staged snapshot`；`completionEvidence=staged allowlist、cached check 与完整 diff`；`readSet=GUI diff`；`writeSet=GUI index`；`stateEffects=只 stage 目标文件`；`commandScope=精确 git add -- codex-gui/AGENTS.md 及 cached 审查`；`executionContext=GUI worktree/index`；`resourceLocks=GUI index write`；`owner=GUI Git owner`；`verification=完整 staged diff`；`failureDomain=GUI-COMMIT`；`replanTriggers=diff 漂移`；`subdelegation=禁止`；`authorizationGate=AUTH-STAGE`。
- `GUI-COMMIT`: `taskBoundary=GUI`；`operationKind=commit`；`outcome=一个 GUI 本地提交`；`estimatedCost=低`；`deferralEvidence=无`；`hardPredecessors=GUI-STAGE`；`consumes/produces=staged snapshot/commit id`；`completionEvidence=commit tree 仅 codex-gui/AGENTS.md`；`readSet=staged snapshot`；`writeSet=GUI branch ref`；`stateEffects=一个本地 commit`；`commandScope=git commit -m 'instructions(gui): ground engineering constraints in actual risk' 与 git show`；`executionContext=GUI worktree/index/ref`；`resourceLocks=GUI index/ref write`；`owner=GUI Git owner`；`verification=commit tree allowlist`；`failureDomain=GUI-MERGE`；`replanTriggers=staged snapshot 变化`；`subdelegation=禁止`；`authorizationGate=AUTH-COMMIT`。

#### GLOBAL pipeline

- `GLOBAL-APPROVAL`: `taskBoundary=GLOBAL authorization`；`operationKind=authorization`；`outcome=取得或拒绝 protected approval id`；`estimatedCost=用户交互`；`deferralEvidence=无`；`hardPredecessors=PRECONFIG-FANIN`；`consumes/produces=本文全局精确文本/approval id 或拒绝`；`completionEvidence=用户单独明确确认，且文本与 identity 未变`；`readSet=计划和 canonical identity`；`writeSet=无`；`stateEffects=授权记录`；`commandScope=只展示精确内容并等待`；`executionContext=主对话`；`resourceLocks=对话确认点`；`owner=主协调代理`；`verification=不把确认计划复用为写入确认`；`failureDomain=只暂停 GLOBAL 与 CFG-MERGE-GLOBAL`；`replanTriggers=文本、identity 或用户决定变化`；`subdelegation=禁止`；`authorizationGate=AUTH-ASK-GLOBAL`。
- `GLOBAL-EDIT`: `taskBoundary=GLOBAL`；`operationKind=edit`；`outcome=candidate AGENTS 仅含三类精确变化`；`estimatedCost=中`；`hardPredecessors=GLOBAL-APPROVAL`；`consumes/produces=special approval、当前 AGENTS/候选 AGENTS`；`completionEvidence=精确插入、替换、删除，其他行不变`；`readSet/writeSet=GLOBAL worktree AGENTS`；`stateEffects=未暂存修改`；`commandScope=仅 apply_patch candidate 绝对路径`；`executionContext=GLOBAL worktree/index`；`resourceLocks=candidate AGENTS write`；`owner=GLOBAL edit owner`；`verification=精确文本与 diff`；`failureDomain=GLOBAL 后继`；`replanTriggers=文本或 identity 漂移`；`deferralEvidence=无`；`subdelegation=禁止`；`authorizationGate=AUTH-WRITE + AUTH-GLOBAL-SPECIAL`。
- `GLOBAL-VERIFY`: `taskBoundary=GLOBAL`；`operationKind=verification`；`outcome=protected candidate diff 与批准内容一致`；`estimatedCost=低`；`hardPredecessors=GLOBAL-EDIT`；`consumes/produces=candidate diff/验证证据`；`completionEvidence=git diff --check、精确文本和非目标行一致`；`readSet=candidate/global baseline`；`writeSet=无`；`stateEffects=只读证据`；`commandScope=git diff --check/diff、rg`；`executionContext=GLOBAL worktree`；`resourceLocks=candidate read`；`owner=GLOBAL verification owner`；`verification=approved text character-for-character`；`failureDomain=GLOBAL-STAGE/COMMIT`；`replanTriggers=差异超出批准内容`；`deferralEvidence=无`；`subdelegation=禁止`；`authorizationGate=AUTH-READ + AUTH-GLOBAL-SPECIAL`。
- `GLOBAL-STAGE`: `taskBoundary=GLOBAL`；`operationKind=stage`；`outcome=只含 AGENTS.md 的 staged snapshot`；`estimatedCost=低`；`deferralEvidence=无`；`hardPredecessors=GLOBAL-VERIFY`；`consumes/produces=已批准并验证的 diff/staged snapshot`；`completionEvidence=staged allowlist、cached check 与完整 diff`；`readSet=GLOBAL diff`；`writeSet=GLOBAL index`；`stateEffects=只 stage AGENTS.md`；`commandScope=精确 git add -- AGENTS.md 及 cached 审查`；`executionContext=GLOBAL worktree/index`；`resourceLocks=GLOBAL index write`；`owner=GLOBAL Git owner`；`verification=staged 内容逐字匹配批准文本`；`failureDomain=GLOBAL-COMMIT`；`replanTriggers=diff 或 approval identity 漂移`；`subdelegation=禁止`；`authorizationGate=AUTH-STAGE + AUTH-GLOBAL-SPECIAL`。
- `GLOBAL-COMMIT`: `taskBoundary=GLOBAL`；`operationKind=commit`；`outcome=一个 GLOBAL 本地提交`；`estimatedCost=低`；`deferralEvidence=无`；`hardPredecessors=GLOBAL-STAGE`；`consumes/produces=staged snapshot/commit id`；`completionEvidence=commit tree 仅 AGENTS.md 且逐字匹配批准文本`；`readSet=staged snapshot`；`writeSet=GLOBAL branch ref`；`stateEffects=一个本地 commit`；`commandScope=git commit -m 'instructions: ground engineering constraints in actual risk' 与 git show`；`executionContext=GLOBAL worktree/index/ref`；`resourceLocks=GLOBAL index/ref write`；`owner=GLOBAL Git owner`；`verification=commit tree allowlist`；`failureDomain=CFG-MERGE-GLOBAL`；`replanTriggers=staged snapshot 或 approval identity 变化`；`subdelegation=禁止`；`authorizationGate=AUTH-COMMIT + AUTH-GLOBAL-SPECIAL`。

### 集成、安装与最终验证节点

#### CFG-MERGE-CORE

- `taskBoundary`: CORE integration；`operationKind`: integration；`outcome`: CORE task commit 保留身份地合入 config `main`；`estimatedCost`: 低；`deferralEvidence`: 无。
- `hardPredecessors`: CORE-COMMIT；若 CORE 为 no-op 则本节点不激活，由 owner no-op 证据直接解锁对应汇合；`consumes/produces`: CORE commit、干净 main / CORE local merge commit；`completionEvidence`: CORE task commit 为 main ancestor，merge tree 仅 CORE 四文件。
- `readSet`: CORE branch commit、main status/history；`writeSet`: config main index/ref、`skills/evaluating-engineering-constraints/**` 工作树内容；`stateEffects`: 一个本地 `--no-ff` merge commit及对应工作树文件。
- `commandScope`: config status、`git merge --no-ff --no-edit codex/engineering-constraints-core`、git show 与 ancestry check；`subdelegation`: 禁止。
- `executionContext`: config main worktree/index/ref；`resourceLocks`: canonical config main index/ref write、config managed source tree write；`owner`: 唯一 config integration owner。
- `verification`: 合并前 main 干净、合并后 task commit 为 ancestor、无范围外文件；`failureDomain`: INSTALL-PREFLIGHT、CONFIG-FANIN 及其后继；`replanTriggers`: main 漂移、冲突、非预期 merge；`authorizationGate`: `AUTH-INTEGRATE`。

#### CFG-MERGE-DELEGATION

- `taskBoundary`: DELEGATION integration；`operationKind`: integration；`outcome`: DELEGATION task commit 保留身份地合入 config `main`；`estimatedCost`: 低；`deferralEvidence`: 无。
- `hardPredecessors`: DELEGATION-COMMIT；若 DELEGATION 为 no-op 则本节点不激活；`consumes/produces`: DELEGATION commit、干净 main / DELEGATION local merge commit；`completionEvidence`: task commit 为 main ancestor，merge tree 仅 delegation 两文件。
- `readSet`: DELEGATION branch commit、main status/history；`writeSet`: config main index/ref、delegating skill 两文件的工作树内容；`stateEffects`: 一个本地 `--no-ff` merge commit及对应工作树文件。
- `commandScope`: config status、`git merge --no-ff --no-edit codex/engineering-constraints-delegation`、git show 与 ancestry check；`subdelegation`: 禁止。
- `executionContext`: config main worktree/index/ref；`resourceLocks`: canonical config main index/ref write、config managed source tree write；`owner`: 唯一 config integration owner。
- `verification`: 合并前 main 干净、合并后 task commit 为 ancestor、无范围外文件；`failureDomain`: CONFIG-FANIN 及其后继；`replanTriggers`: main 漂移、冲突、非预期 merge；`authorizationGate`: `AUTH-INTEGRATE`。

#### CFG-MERGE-GLOBAL

- `taskBoundary`: GLOBAL integration；`operationKind`: integration；`outcome`: GLOBAL task commit 在新 skill 已安装后保留身份地合入 config `main`；`estimatedCost`: 低；`deferralEvidence`: 无。
- `hardPredecessors`: GLOBAL-COMMIT、INSTALL-SKILL；前者提供批准后的提交，后者保证 live 引用目标已存在；若 GLOBAL 为 no-op 则本节点不激活；`consumes/produces`: GLOBAL commit、live skill identity、干净 main / GLOBAL local merge commit；`completionEvidence`: task commit 为 main ancestor、live AGENTS 逐字匹配批准文本且新 skill link 有效。
- `readSet`: GLOBAL branch commit、main status/history、live skill symlink；`writeSet`: config main index/ref、`AGENTS.md` 工作树内容及其 live symlink 可见内容；`stateEffects`: 一个本地 `--no-ff` merge commit并更新受保护 live 内容。
- `commandScope`: config status、`git merge --no-ff --no-edit codex/engineering-constraints-global`、git show、ancestry 与 live identity 检查；`subdelegation`: 禁止。
- `executionContext`: config main worktree/index/ref 与 live AGENTS alias；`resourceLocks`: canonical config main index/ref write、config managed source tree write、protected global AGENTS identity write；`owner`: 唯一 config integration owner。
- `verification`: 合并前 main 干净且 install 证据有效，合并后 task commit 为 ancestor、无范围外文件；`failureDomain`: CONFIG-FANIN 及其后继；`replanTriggers`: main、skill link、批准文本或 canonical identity 漂移，或 merge 冲突；`authorizationGate`: `AUTH-INTEGRATE + AUTH-GLOBAL-SPECIAL`。

#### GUI-MERGE

- `taskBoundary`: GUI integration；`operationKind`: integration；`outcome`: GUI task commit fast-forward 到 dev；`estimatedCost`: 低；`deferralEvidence`: 无。
- `hardPredecessors`: GUI-COMMIT、INSTALL-SKILL；分别等待 GUI stable commit 与 live skill identity，避免消费者先上线；若 GUI 为 no-op 则本节点不激活；`consumes/produces`: GUI commit、live skill identity / dev stable HEAD；`completionEvidence`: GUI commit 为 dev ancestor、live skill link 有效、工作区只剩已提交文档状态。
- `readSet`: GUI branch、dev status/history；`writeSet`: Codex dev index/ref；`stateEffects`: 本地 fast-forward merge。
- `commandScope`: `git -C /Users/jiangsheng/cnb/codex merge --ff-only codex/engineering-constraints-gui` 及前后状态/ancestry 检查；`subdelegation`: 禁止。
- `executionContext`: Codex dev main worktree/index/ref；`resourceLocks`: dev index/ref write；`owner`: GUI integration owner。
- `verification`: allowlist 与 ancestry；`failureDomain`: GUI-FINAL-VERIFY/FINAL-AUDIT；`replanTriggers`: dev 漂移或不能 fast-forward；`authorizationGate`: `AUTH-INTEGRATE`。

#### CONFIG-FANIN

- `taskBoundary`: config integration fan-in，无提交；`operationKind`: fan-in；`outcome`: CORE、DELEGATION、GLOBAL 均有 merge 证据或稳定 no-op 证据，形成 config stable HEAD；`estimatedCost`: 低；`deferralEvidence`: 无。
- `hardPredecessors`: 每个 required config task 的 CFG-MERGE 节点及每个 no-op task 的 OWNER-GAP-AUDIT 证据；`consumes/produces`: 三个 config task outcomes / config stable HEAD identity；`completionEvidence`: required task commits 均为 ancestor，no-op 逐项复核，main 干净。
- `readSet`: config main history/status 与 owner-status 证据；`writeSet`: 无；`stateEffects`: 只读汇合结论；`commandScope`: status/log/merge-base/show 与 no-op 证据复核；`subdelegation`: 禁止。
- `executionContext`: config main stable worktree；`resourceLocks`: canonical config main HEAD read；`owner`: config fan-in owner。
- `verification`: 三个 owner outcome 齐全且没有遗漏 task commit；`failureDomain`: CONFIG-FINAL-VERIFY、FINAL-AUDIT；`replanTriggers`: main 或 owner-status 漂移；`authorizationGate`: `AUTH-READ`。

#### CONFIG-FINAL-VERIFY

- `taskBoundary`: config final verification，无提交；`operationKind`: verification；`outcome`: config 最终状态通过结构、语义、allowlist 与上游排除检查；`estimatedCost`: 中；`deferralEvidence`: 无。
- `hardPredecessors`: CONFIG-FANIN；`consumes/produces`: config stable HEAD、两 skill 目录、validator / config final verification report；`completionEvidence`: required skill quick_validate 成功、git diff --check、精确文件 allowlist、`.agents/skills/**` 与 `skills-lock.json` 无变化。
- `readSet`: final config diff/history、两个 skill 目录、validator、上游排除路径；`writeSet`: canonical uv cache `/Users/jiangsheng/.cache/uv`；`stateEffects`: uv 隔离依赖 cache 变化，无仓库变化。
- `commandScope`: 对存在且 required 的两个 skill 目录分别运行规定 `uv run --no-project --with pyyaml python .../quick_validate.py <skill目录>`，以及 git diff/check、rg、history allowlist；`subdelegation`: 禁止。
- `executionContext`: config main stable worktree；`resourceLocks`: config stable HEAD read、`/Users/jiangsheng/.cache/uv` write；`owner`: config final verification owner。
- `verification`: no-op owner 不伪造 validator 结果，required owner 必有对应验证；`failureDomain`: FINAL-AUDIT；`replanTriggers`: validator/tool、owner-status 或 final diff 漂移；`authorizationGate`: `AUTH-READ`。

#### INSTALL-PREFLIGHT / INSTALL-SKILL

- `INSTALL-PREFLIGHT`: `taskBoundary=live install，无提交`；`operationKind=investigation`；`outcome=证明 installer 只会新增目标 skill link而不会 backup/覆盖其他 target`；`estimatedCost=中`；`deferralEvidence=无`；`hardPredecessors=CFG-MERGE-CORE`，若 CORE no-op 则等待其“source 已满足设计”证据；`consumes/produces=CORE source、install.zsh、managed identities / 安全执行报告`；`completionEvidence=live AGENTS.md、config.toml、.agents 与全部既有手工 skill target 均和 source -ef，新 source 存在，新 live target 不存在，backup 分支不可达`；`readSet=install.zsh、全部 config managed sources/targets`；`writeSet=无`；`stateEffects=只读报告`；`commandScope=sed/rg/readlink/realpath/test -ef 与存在性检查`；`executionContext=config main 与 live local config`；`resourceLocks=canonical config managed source tree read、全部 managed live targets read`；`owner=installer preflight owner`；`verification=逐项 identity 清单`；`failureDomain=INSTALL-SKILL、GLOBAL/GUI merge、behavior 与 final audit`；`replanTriggers=任一 target、脚本或 source 漂移`；`subdelegation=禁止`；`authorizationGate=AUTH-READ`。
- `INSTALL-SKILL`: `taskBoundary=live install，无提交`；`operationKind=integration`；`outcome=固化 installer 创建唯一的新 live skill symlink`；`estimatedCost=低`；`deferralEvidence=无`；`hardPredecessors=INSTALL-PREFLIGHT`；`consumes/produces=安全执行报告、final CORE source / live skill symlink identity`；`completionEvidence=installer 输出只有既有项 skip 和新 skill link，不含 backup/restore，readlink 与 -ef 匹配`；`readSet=install.zsh、全部 config managed sources/targets`；`writeSet=/Users/jiangsheng/.codex/skills/evaluating-engineering-constraints`；`stateEffects=一个 symlink`；`commandScope=cwd=/Users/jiangsheng/cnb/codex-config，执行 ./install.zsh，随后 readlink/test -ef 与既有 target 复核`；`executionContext=live local config`；`resourceLocks=canonical config managed source tree read、全部 managed live targets read、新 target write`；`owner=installer owner`；`verification=无 backup、无其他 identity 变化`；`failureDomain=GLOBAL/GUI merge、behavior/final audit`；`replanTriggers=任一 target 漂移、installer 变化或新 target 已存在`；`subdelegation=禁止`；`authorizationGate=AUTH-INSTALL`。

#### GUI-FINAL-VERIFY

- `taskBoundary`: GUI final verification，无提交；`operationKind`: verification；`outcome`: dev 集成后的 GUI 提示词通过格式、内容边界和上游排除检查；`estimatedCost`: 中；`deferralEvidence`: 无。
- `hardPredecessors`: GUI-MERGE，或 GUI no-op 证据与 INSTALL-SKILL；`consumes/produces`: dev stable HEAD、GUI owner outcome、package script / GUI final verification report；`completionEvidence`: fnm-backed `format:prettier` 成功、git diff --check、段落 allowlist、`.codex/skills/**` 无变化。
- `readSet`: dev final diff/history、GUI AGENTS、package.json、node_modules、上游 skill paths；`writeSet`: 无；`stateEffects`: 无仓库变化。
- `commandScope`: cwd=`/Users/jiangsheng/cnb/codex/codex-gui` 的 `/opt/homebrew/bin/fnm exec --using-file pnpm run format:prettier`，以及 git diff/check、rg 与 history allowlist；`subdelegation`: 禁止。
- `executionContext`: Codex dev stable worktree；`resourceLocks`: dev stable HEAD 与 codex-gui tree read、formatter runner；`owner`: GUI final verification owner。
- `verification`: 不运行 fix、lint、type-check、tests 或 build；`failureDomain`: FINAL-AUDIT；`replanTriggers`: dev、toolchain、owner-status 或 package script 漂移；`authorizationGate`: `AUTH-READ`。

## 隔离行为验收

`CONFIG-FANIN` 与 `INSTALL-SKILL` 完成后，从 `/tmp` 启动八个互相独立的 ephemeral root。等待 `CONFIG-FANIN` 是因为 actor 会读取 live global prompt；不得在 `CFG-MERGE-GLOBAL` 正在改变同一 canonical 内容时把 mutable prompt 当稳定输入。

八个 actor 节点的完整共同契约如下：`taskBoundary=BEHAVIOR actors，无提交`；`operationKind=verification`；`outcome=单一案例的原始 JSONL 推理轨迹和最终回答`；`estimatedCost=中`；`deferralEvidence=无`；`hardPredecessors=CONFIG-FANIN、INSTALL-SKILL`，等待稳定 live global prompt 与 live skill identity；`consumes/produces=隔离 prompt、live skill catalog、稳定 global prompt/单案 raw JSONL`；`completionEvidence=命令成功退出、JSONL 可解析并含最终回答和 skill/reference 读取轨迹，actor 自评通过不算 verdict`；`readSet=live global prompt、live skill catalog、单案 prompt`；`writeSet=无`；`stateEffects=只允许 JSONL stdout，不持久化 session 或 workspace 状态`；`commandScope=下述统一 codex exec prefix 加该节点唯一 prompt`；`subdelegation=禁止`；`executionContext=新 root、-C /tmp、read-only sandbox`；`resourceLocks=当前本机 Codex CLI 对同一 OpenAI 账户的执行容量 counting semaphore，单 actor 获取一个 lease，无 workspace lock`；`owner=该案例独立 actor`；`verification=只检查执行与原始证据完整性，不向 actor 泄漏外部标准`；`failureDomain=该案例对应 REVIEW 节点与 BEHAVIOR-FANIN`；`replanTriggers=prompt 泄漏标准答案、root 不隔离、JSONL 缺轨迹、服务端容量身份不可判定或 live input 漂移`；`authorizationGate=AUTH-FWD`。

统一 command prefix：

```text
codex exec --ephemeral --json --sandbox read-only --skip-git-repo-check -C /tmp '<case prompt>'
```

实施前先确认 `/tmp/AGENTS.md` 不存在。显式案例 prompt 只包含现实化事实并要求使用 `$evaluating-engineering-constraints` 作只读判断，不提供设计、issue、标准答案或历史结论；隐式探针不得出现 skill 名称。actor 只产出原始证据，不持有下表“成功条件”；成功条件由对应的 `REVIEW-EXPLICIT-*` 或 `REVIEW-ROUTE-*` 独立消费。

| nodeId | 最小输入 | 成功条件 | 失败域与重编触发 |
| --- | --- | --- | --- |
| EXPLICIT-01 | diff 约 640 行，多数为必要测试和机械生成，最终生产模块约 470 行，规则只称 500 为 guidance | 区分 measurement targets；允许审查负担分析，不自动停工或削弱测试 | 失败只阻塞 BEHAVIOR-FANIN；若模型仅复述数字，修正 measurement-target 语义 |
| EXPLICIT-02 | TS 文件高于 Rust guidance；另一短 factory 同时拥有缓存、重试、队列、生命周期和恢复状态 | 不跨语言套门禁；不因短文件/小 API 放过职责风险 | 若只回答一半，修正结构职责 reference，不增加数值反门禁 |
| EXPLICIT-03 | 同一 Firefox process 的两个 page 争夺焦点，其他引擎使用不同 process | 限制最小共享资源域，其他引擎仍可并行 | 若全局串行，修正最小作用域语义 |
| EXPLICIT-04 | typed in-process、唯一 owner、入口已复制、无不可信 caller，提议因“更安全”全面 freeze 并断言 frozen | 要求 actor/path/impact；拒绝无证据防御；保留真实不可信边界例外 | 若机械禁止全部 runtime defense，修正硬边界控制 |
| EXPLICIT-05 | 用户明确禁止网络，但更快方案需联网；另有非强制数量 guidance | 网络禁令保持强制，guidance 只触发调查 | 若软化硬约束，暂停全部完成并修正分类核心 |
| EXPLICIT-06 | 低风险可逆小改动，仅偶然有 3 个 helper，无停止/扩域/加固后果 | 简短判断，不机械打印固定七字段或询问无关信息 | 若模板化过度，修正按风险披露规则 |
| ROUTE-01 | 改名、改数字的局部资源竞争，不点名 skill | 轨迹隐式选择新 skill 并读取适用 reference | 修正 metadata description，不向案例加入关键词 |
| ROUTE-02 | “解释这 3 个字段”，不涉及工程约束决策 | 不加载新 skill，不输出约束表 | 收窄 metadata，保持普通数字排除 |

八个节点之间没有真实产物依赖，稳定 live 输入就绪后按实际服务容量并行运行；不因“先验行为、后验路由”制造串行，也不为占满容量启动重复案例。每个 actor 的 completionEvidence 只是完整 raw JSONL，不是通过结论。失败只暂停该案例的 review 与 BEHAVIOR-FANIN；修正必须作为计划内新节点插入对应 skill task，若针对已有提交则创建新的独立提交，禁止 amend。

#### REVIEW-EXPLICIT-01..06 / REVIEW-ROUTE-01..02

八个 case-review 节点各自只审对应 actor，节点 ID 一一映射。它们的完整共同契约如下：`taskBoundary=BEHAVIOR case review，无提交`；`operationKind=review`；`outcome=单案结构化 verdict`；`estimatedCost=中`；`deferralEvidence=无`；`hardPredecessors=同 suffix 的 EXPLICIT 或 ROUTE actor`，只等待对应 raw JSONL；`consumes/produces=单案 immutable raw JSONL、auditor 私有验收标准/单份 {caseId, semanticVerdict, routingVerdict, evidence, failureScope}`；`completionEvidence=基于具体轨迹和最终回答的可追溯 verdict，显式案例评估语义与所需 reference，路由案例评估是否正确读取或未读取 skill/reference`；`readSet=单案 raw JSONL 与对应私有标准`；`writeSet=无`；`stateEffects=只读 verdict`；`commandScope=无 shell 或产品命令，只允许独立只读模型审查`；`subdelegation=允许一个与该 actor 不同的独立 auditor，禁止修改文件或重跑 actor`；`executionContext=与对应 actor 隔离的 review context`；`resourceLocks=该案例 immutable raw JSONL read、当前本机 Codex agent 槽位 counting semaphore 的一个 lease`；`owner=该案例 auditor owner，不能与对应 actor owner 相同`；`verification=不使用固定措辞或标题匹配，并标注标准答案泄漏、基础模型常识碰巧答对或只完成一半等假阳性`；`failureDomain=该案例与 BEHAVIOR-FANIN`；`replanTriggers=raw 输入缺失、标准泄漏、auditor 非独立或结论无法追溯`；`authorizationGate=AUTH-READ`。

#### BEHAVIOR-FANIN

- `taskBoundary`: BEHAVIOR fan-in，无提交；`operationKind`: fan-in；`outcome`: 六个语义案例与两个 metadata probe 全部通过；`estimatedCost`: 中；`deferralEvidence`: 无。
- `hardPredecessors`: REVIEW-EXPLICIT-01..06、REVIEW-ROUTE-01..02；每条边等待对应可追溯 verdict；`consumes/produces`: 八份结构化 verdict / 行为验收摘要；`completionEvidence`: 每案 semantic/routing 结论与证据齐全且均为通过。
- `readSet`: 八份 verdict 与对应 raw identity；`writeSet`: 无；`stateEffects`: 只读汇总；`commandScope`: 无 shell，只做结构完整性与全通过检查；`subdelegation`: 禁止。
- `executionContext`: 主协调；`resourceLocks`: verdicts read；`owner`: behavior fan-in owner；`verification`: 不重新解释标准或以固定措辞覆盖 auditor 结论；`failureDomain`: FINAL-AUDIT；`replanTriggers`: verdict 缺字段、证据身份不匹配或任一案例失败；`authorizationGate`: `AUTH-READ`。

## 最终汇合与完成条件

#### FINAL-AUDIT

- `taskBoundary`: 最终审计，无提交；`operationKind`: review；`outcome`: 两仓库集成状态完整满足设计和计划；`estimatedCost`: 高；`deferralEvidence`: 无。
- `hardPredecessors`: CONFIG-FINAL-VERIFY、GUI-FINAL-VERIFY、BEHAVIOR-FANIN；`consumes/produces`: 两稳定 HEAD、验证和行为证据 / 最终审计结论。
- `completionEvidence`: 文件/commit/作者/上游排除/live link/行为矩阵全部满足，关联 issue 未变。
- `readSet`: 两仓库 final diff/history/status、live symlink、验证结果；`writeSet`: 无；`stateEffects`: 审计报告。
- `commandScope`: `git status/log/diff/show/merge-base`、`readlink/test -ef`、精确 rg；禁止 test/build/fix/remote；`subdelegation`: 独立只读反向审计一个节点。
- `executionContext`: 两主 worktree 与独立审计上下文；`resourceLocks`: 两稳定 HEAD read；`owner`: final audit owner，主协调保留最终判断。
- `verification`: 确认 DOC 提交存在；CORE、DELEGATION、GLOBAL、GUI 各自的 task commit 均保留，或对应 no-op 证据有效；required config merge commits 和 GUI fast-forward 正确；所有上游 SKILL diff 为空；worktree 未清理；无未声明文件。
- `failureDomain`: 仅失败项及其完成结论；若修正已有提交则新增独立修正提交；`replanTriggers`: 目标/行为/接口/授权边界变化或范围外 diff；`authorizationGate`: `AUTH-READ`。

计划完成必须同时满足：

- 文档先提交门禁已满足；
- CORE、DELEGATION、GLOBAL、GUI 各自均有独立任务提交并保留身份，或具有经最终审计复核的 no-op 证据；
- 两仓库已本地集成且工作区干净；
- 新 skill 已通过固化入口安装为 live 单项 symlink；
- skill 结构、GUI 格式、全局精确文本和 delegation 语义验证通过；
- 六个显式案例与两个隐式探针全部通过；
- 没有修改上游 SKILL、产品代码、测试、issue 或远程状态；
- 没有清理本任务或既有 worktree/branch；清理由用户后续单独发起。

## 失败与修正策略

- GLOBAL 未获专门确认：只暂停 GLOBAL、CFG-MERGE-GLOBAL、CONFIG-FANIN 及依赖最终完成的后继；CORE、DELEGATION、GUI 可继续形成提交。
- initializer、quick_validate、formatter、installer 或 codex exec 工具缺失/入口漂移：停止对应节点，报告需要用户自行处理的组件或计划变化；不得安装或改用会修改系统/项目环境的替代方式。
- GUI formatter 报告范围外预存问题：区分并报告；不得运行 fix 或修改范围外文件。若目标文件自身不符合格式，由 GUI-EDIT owner 在原 writeSet 内修正并重新验证。
- installer preflight 发现任何 existing target 不再 `-ef`、new target 已存在或脚本将进入 backup：停止 installer，不运行脚本，不手写 symlink。
- merge 发生冲突：停止该 integration 节点并按冲突专用流程重新判断；不得在计划授权下自行扩大解决范围。
- 行为案例失败：只根据失败证明的判断或 metadata 缺口插入修正节点；禁止添加事故关键词黑名单、新阈值或放宽验收。
- 发现任何上游 SKILL 进入 diff：停止对应任务，恢复计划边界；不得提交该变化。

## 明确排除范围

- 不修改任何上游 SKILL，包括 `.codex/skills/code-review-change-size/SKILL.md`；
- 不修改 `skills/managing-work-stages/**`、`install.zsh`、`skills-lock.json`、`.agents/skills/**` 或 system skills；
- 不修改 upstream base instructions、Default collaboration prompt 或产品内置 system prompt；
- 不修改产品代码、协议、schema、生成器、tests、snapshots、baselines、package scripts 或浏览器并发配置；
- 不运行 Rust、frontend 或浏览器测试，不运行 lint/type-check/build，不运行 fix/format-write；
- 不更新或关闭 issue；
- 不执行 remote、force、amend、squash、branch/worktree cleanup；
- 不把本任务扩成全部提示词、全部 GUI 规则或全部 skills 的通用精简工程。

## 执行前确认

本计划落盘不授权执行。只有用户明确确认本计划后，才能从 DOC-STAGE 开始。

计划确认仍不授权 GLOBAL 写入。GLOBAL-APPROVAL 必须在实施时单独展示本文“全局精确拟写内容”，并等待用户明确回复 `确认写入`、`确认允许写入` 或等价直接授权；未通过时只暂停该分支。
