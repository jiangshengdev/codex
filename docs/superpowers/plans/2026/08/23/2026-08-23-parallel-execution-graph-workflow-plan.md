# 并行执行图工作流实施计划

计划日期：2026-08-23

计划状态：已确认

确认日期：2026-08-23

确认原文：确认计划

对应已确认设计：
`docs/superpowers/specs/2026/08/23/2026-08-23-parallel-execution-graph-workflow-design.md`

关联决策记录：
`docs/superpowers/research/2026/08/23/2026-08-23-parallel-execution-decisions.md`

## 目标

修改当前实际生效的全局提示词和相关 skills，使复杂计划必须产出可调度执行图，并由调度器
持续运行所有依赖满足、授权满足且资源不冲突的 ready 节点；同时保留设计/计划/实现门禁、
逐任务提交、安全授权、验证顺序和失败范围边界。

## 当前事实与修改必要性

计划编写时的只读基线如下，实施前必须重新核验，不能把提交值当作未来固定事实：

- `/Users/jiangsheng/cnb/codex`：`dev`，HEAD
  `08c2dc6995f08a6d15e7ea76257b6322f75fffd1`。本任务设计与另一份无关设计均为 untracked；
  文档提交只能包含本任务 design/plan。
- `/Users/jiangsheng/cnb/codex-config`：`main`，HEAD
  `9c3f683a33048433231471499af690f440356f85`，工作树干净。该提交已在本计划外完成
  `AGENTS.md` bootstrap。
- 两仓库 Git 身份均为 `Jiang Sheng <jiangshengdev@outlook.com>`。
- `/Users/jiangsheng/.codex/AGENTS.md` 是指向
  `/Users/jiangsheng/cnb/codex-config/AGENTS.md` 的 symlink。
- 三个全局 skill 目录同样链接到 `codex-config/skills/**`；修改 symlink 的 shadow path 或复制
  副本不会产生新的权威来源。
- `/Users/jiangsheng/cnb/codex/.codex/skills/codex-gui-worktree` 是 Codex 仓库内的真实路径。

`codex-config/AGENTS.md` 的无条件串行规则已由外部提交 `9c3f683` 消除。剩余根因是三个流程
skills 没有执行图契约，`codex-gui-worktree` 又会对已在计划中精确确认的创建动作重复请求授权；
仅增加子代理数量不会改变这些剩余约束。

## 已核验的权威路径

```text
/Users/jiangsheng/.codex/AGENTS.md
  -> /Users/jiangsheng/cnb/codex-config/AGENTS.md

/Users/jiangsheng/.codex/skills/managing-work-stages
  -> /Users/jiangsheng/cnb/codex-config/skills/managing-work-stages

/Users/jiangsheng/.codex/skills/delegating-micro-stages
  -> /Users/jiangsheng/cnb/codex-config/skills/delegating-micro-stages

/Users/jiangsheng/.codex/skills/project-doc-workflow
  -> /Users/jiangsheng/cnb/codex-config/skills/project-doc-workflow

/Users/jiangsheng/cnb/codex/.codex/skills/codex-gui-worktree
  -> 当前 Codex 仓库 tracked skill
```

`codex-gui-worktree` 的现有脚本只适合创建带 frontend dependency/docs links 的 sparse GUI
worktree。本次修改的是提示词与 skill 本身，不是 `codex-gui/**`，因此预配实施 worktree 使用
Git 原生命令，不调用该脚本。

## 计划确认与已外部完成的 bootstrap

本计划只保留一个尚未完成的用户门禁：

1. `P0`：用户确认本计划。该确认授权 Task 0 文档提交和本计划逐项列出的两个精确 worktree
   创建动作。

用户已在本计划外明确授权并完成 `AGENTS.md` 写入，随后由外部提交
`9c3f683a33048433231471499af690f440356f85` 提交到 `codex-config/main`。该历史事实不再作为
本计划的待执行节点，也不得在执行本计划时重复编辑、提交、合并或重建。

P0 后必须先提交 design 与 plan。docs commit 成功后才进入剩余 worktree 预配；两个 worktree
全部创建并核验成功后才允许实现编辑节点启动。任一 branch、base、目标路径、include 范围或
命令变化都会使对应 worktree 授权失效，必须先重新确认。

## `AGENTS.md` 外部完成记录

外部提交 `9c3f683` 已把旧第 36 行替换为以下四条简版规则；详细执行协议继续由 Task 2 下沉到
skills 与 `references/execution-graph.md`：

```markdown
- 已确认计划必须提供可调度执行图。节点应声明依赖及证据、输入输出、读写集合、执行上下文、资源锁、验证、提交边界、汇合点和失败范围。任务编号、文档顺序、同一仓库或最终汇合均不构成依赖。
- 每次节点完成、失败、资源释放或图变化后，必须重新计算 ready set，并立即并行运行所有无依赖、无冲突且已获授权的节点，直到槽位用满。串行必须有硬依赖、资源冲突或明确的负收益证据。
- 不同任务的并行写入使用独立 worktree、branch 和 Git index。同一任务内写集合不相交时可共享 worktree 并发，但生成、格式化、stage 和 commit 必须由唯一 owner 在 fan-in 和组合验证后执行。计划精确列出的 worktree 创建动作随计划确认获得授权；参数变化或计划外创建必须重新确认。
- 每个计划任务保持独立提交，禁止 squash、合并任务提交或等待无依赖任务。节点失败只暂停其后继；计划内修正作为新节点插入并重新调度。只有共享前提、共享状态、安全或授权边界受到影响时，才扩大暂停范围。
```

提交只修改 `AGENTS.md`；其父提交为 `d1a15a8c62d3556256a8287d188d47b4fbef273e`。本计划最终
验证仍检查四条规则、相邻规则和提交范围，但不再生成任何 AGENTS diff。

## 目标文件与排除项

### Codex-config 仓库

修改：

- `/Users/jiangsheng/cnb/codex-config/skills/managing-work-stages/SKILL.md`
- `/Users/jiangsheng/cnb/codex-config/skills/delegating-micro-stages/SKILL.md`
- `/Users/jiangsheng/cnb/codex-config/skills/delegating-micro-stages/references/execution-graph.md`（新建）
- `/Users/jiangsheng/cnb/codex-config/skills/project-doc-workflow/SKILL.md`

明确不修改：`AGENTS.md`、三个 symlink、三个 `agents/openai.yaml`、其他 skills、插件缓存、
memory、远程引用。

### Codex 仓库

修改：

- `docs/superpowers/specs/2026/08/23/2026-08-23-parallel-execution-graph-workflow-design.md`
  （仅确认元数据，随 docs commit）
- `docs/superpowers/plans/2026/08/23/2026-08-23-parallel-execution-graph-workflow-plan.md`
- `.codex/skills/codex-gui-worktree/SKILL.md`

明确不修改：`.codex/skills/codex-gui-worktree/scripts/create-codex-gui-worktree.sh`、
`agents/openai.yaml`、`codex-gui/**`、Rust、schema、生成物、测试基线，以及用户已有的
`2026-08-23-codex-gui-composer-pending-input-reordering-design.md`。

ignored research
`docs/superpowers/research/2026/08/23/2026-08-23-parallel-execution-decisions.md` 保持未暂存、
未提交，禁止强制暂存。

## Worktree 预配授权清单

计划确认将精确授权以下两个创建动作；实施前仍先只读检查 branch/path 不存在、base 与设计
一致、工作树干净。不得替换 branch、base、路径或命令。

### W2：Config skills worktree

- 名称：`parallel-execution-skills`
- branch：`codex/parallel-execution-skills`
- base：`codex-config/main`
- 目标路径：`/Users/jiangsheng/cnb/codex-config-parallel-execution-skills`
- include 范围：完整 `codex-config` 仓库；不启用 sparse checkout。

```bash
git -C /Users/jiangsheng/cnb/codex-config worktree add -b codex/parallel-execution-skills /Users/jiangsheng/cnb/codex-config-parallel-execution-skills main
```

### W3：Codex worktree authorization skill worktree

- 名称：`parallel-execution-graph-codex-skill`
- branch：`codex/parallel-execution-codex-skill`
- base：`codex/dev`（Task 0 docs commit 后的 `dev`）。
- 目标路径：`/Users/jiangsheng/cnb/codex/.worktrees/parallel-execution-graph-codex-skill`
- include 范围：完整 Codex 仓库；不启用 sparse checkout。

```bash
git -C /Users/jiangsheng/cnb/codex worktree add -b codex/parallel-execution-codex-skill /Users/jiangsheng/cnb/codex/.worktrees/parallel-execution-graph-codex-skill dev
```

W2 与 W3 都只依赖 D0，并同时进入 ready set；它们属于不同仓库，可以并行创建。两个创建动作
都完成各自 `git status --short --branch`、branch、HEAD 和目标文件存在性检查后，在 `WP`
fan-in 形成预配屏障。

本计划不授权删除或移除 worktree/branch。完成后保留上述两个本地 worktree 和分支并报告；
如需清理，由用户后续单独发起。

## 权威执行图

### 图

```text
P0 计划确认
  -> D0 docs commit
       -> fan-out
            W2 --\
            W3 ---> WP 工作树预配屏障
                   -> fan-out
                        B1 managing-work-stages 编辑 ---------\
                        B2 delegating + execution reference 编辑 -> B4 config skills 组合验证/stage/commit
                        B3 project-doc-workflow 编辑 ---------/
                        C1 codex-gui-worktree 编辑 -> C2 验证/stage/commit
       B4 -> I1 codex-config/main fast-forward config skills
               -> FG execution-graph fixture -> EG blind runner -> AG 独立审计 --\
               -> V0 结构验证（同时等待 I2） ------------------------------> V2 汇总
       C2 -> I2 codex/dev fast-forward codex skill                           |
               -> FW GUI-worktree fixture -> EW blind runner -> AW 独立审计 --/
  -> 完成
```

### 关键路径与初始 ready set

关键路径为 `P0 -> D0 -> max(W2,W3) -> WP`，之后取 config skills 分支和 Codex skill 分支中
较慢者。验证关键路径直接比较 `config implementation -> I1 -> FG -> EG -> AG`、
`Codex implementation -> I2 -> FW -> EW -> AW` 和 `max(I1,I2) -> V0`，三路最后只在 V2
汇合。

P0 完成后 D0 ready。D0 后，`{W2, W3}` 同时 ready并行预配；WP 等待二者。WP 完成后，
ready set 立即包含 `{B1, B2, B3, C1}`。B1/B2/B3 共享 W2 但写集合不重叠，C1 位于 W3。
B4 必须等待 B1/B2/B3 fan-in；C2 只等待 C1，不得等待 B4。I1 与 I2 分属不同仓库，可并行
集成；V0 等待二者。

### 完整节点契约

`cost` 使用 short/medium/long 粗粒度估算。下表所有节点的 `deferralEvidence` 初始均为“无”；
只有执行时出现设计允许的可核验负收益，才可动态填写并按 reference 复查。表中“范围变化”均
包括未声明文件、branch、worktree、接口、数据、安全或授权变化。

| ID | `taskBoundary` / `operationKind` / `outcome` / `cost` | `hardPredecessors` / `authorizationGate` | `consumes -> produces` / `completionEvidence` | `readSet` / `writeSet` | `executionContext` / `resourceLocks` / `owner` | `verification` | `failureDomain` / `replanTriggers` |
|---|---|---|---|---|---|---|---|
| P0 | 无提交 / authorization / 确认计划 / short | 无 / 用户明确“确认计划” | design+plan -> worktree 与 docs 授权 / 用户原文 | design、plan / 无 | 对话 / 用户门禁 / root | 确认语义精确 | 阻塞 D0；计划变化重确认 |
| D0 | docs commit / commit / 独立提交 design+plan / short | P0 / docs 提交已由计划确认授权 | confirmed design+plan -> docs commit / staged name-only+commit id | 两个本任务文档 / 同两文件、codex index/HEAD | codex/dev / Git index / docs owner agent | cached diff check、name-only、full diff | 阻塞 W2/W3；无关文件或基线变化重编图 |
| W2 | 无提交 / worktree-setup / 创建 config skills worktree / short | D0 / P0 精确命令授权 | 含 `9c3f683` 的 config main -> W2 branch/worktree / status+branch+HEAD | config refs/path / W2 path+branch、metadata | config 主仓库 / config worktree metadata / 独立 setup agent | 路径/branch 不存在、创建后 status/HEAD | 阻塞 WP；参数或冲突变化重确认 |
| W3 | 无提交 / worktree-setup / 创建 Codex skill worktree / short | D0 / P0 精确命令授权 | codex dev docs commit -> W3 branch/worktree / status+branch+HEAD | codex refs/path / W3 path+branch、metadata | Codex 主仓库 / Codex worktree metadata / 独立 setup agent | 路径/branch 不存在、创建后 status/HEAD | 阻塞 WP/C1；参数或冲突变化重确认 |
| WP | 无提交 / fan-in / 证明全部 worktree 已预配 / short | W2,W3 / 无新增授权 | W2/W3 evidence -> implementation contexts ready / 两份核验 | 两 worktree 状态 / 无 | root / 无 / root | 两路径、branch、HEAD、目标文件齐全 | 阻塞 B1/B2/B3/C1；任一 worktree 失效重跑对应分支 |
| B1 | config skills commit / edit / managing 增加阶段级 DAG 门禁 / medium | WP / 计划写入授权 | design+current skill -> scoped managing diff / editor result | managing skill、execution reference routing / managing SKILL.md | W2 / managing 文件写锁 / B1 agent | scoped diff、自查门禁 | 阻塞 B4；越界或 reference 契约变化重编图 |
| B2 | config skills commit / edit / delegating 成为调度入口并新增 reference / long | WP / 计划写入授权 | design+current skill -> delegating diff+reference / editor result | delegating skill、design / delegating SKILL.md+reference | W2 / 两目标文件写锁 / B2 agent | reference 字段/状态机完整、自查路由 | 阻塞 B4；协议或文件范围变化重编图 |
| B3 | config skills commit / edit / project-doc 记录图与并行提交语义 / medium | WP / 计划写入授权 | design+current skill -> scoped project-doc diff / editor result | project-doc skill、execution reference routing / project-doc SKILL.md | W2 / project-doc 文件写锁 / B3 agent | scoped diff、自查提交门禁 | 阻塞 B4；越界或提交语义变化重编图 |
| B4 | config skills commit / fan-in+verify+stage+commit / 形成组合 skill 提交 / medium | B1,B2,B3 / 计划提交授权 | 三份 editor diff -> verified commit / validators+cached checks+commit id | 四目标组合 diff、metadata / W2 index+HEAD | W2 / validator、Git index / 唯一 B4 owner | 三 quick_validate、reference 路由、cached check/name-only/full diff | 阻塞 I1；失败插入对应 B-fix，其他仓库继续 |
| C1 | Codex skill commit / edit / worktree skill 复用计划授权 / medium | WP / 计划写入授权 | design+current skill -> scoped skill diff / editor result | codex-gui-worktree skill、脚本接口 / 该 SKILL.md | W3 / 文件写锁 / C1 agent | scoped diff、脚本/metadata 不变 | 阻塞 C2；越界或脚本需求变化重编图 |
| C2 | Codex skill commit / verify+stage+commit / 形成授权 skill 提交 / medium | C1 / 计划提交授权 | C1 diff -> verified commit / validator+cached checks+commit id | skill diff、metadata / W3 index+HEAD | W3 / validator、Git index / 唯一 C2 owner | quick_validate、cached check/name-only/full diff | 阻塞 I2；失败插入 C-fix，B 域继续 |
| I1 | 无新提交 / integration / fast-forward config skills 到 main / short | B4 / 计划本地集成授权 | B4 commit -> config main 完整规则 / `--ff-only`+HEAD | config refs/status / main ref+HEAD | config 主 worktree / HEAD / config integration owner | clean status、fast-forward ancestry | 阻塞 V0/FG；分叉停止该域并重确认策略 |
| I2 | 无新提交 / integration / fast-forward Codex skill 到 dev / short | C2 / 计划本地集成授权 | C2 commit -> codex dev worktree skill / `--ff-only`+HEAD | codex refs/status / dev ref+HEAD | codex 主 worktree / HEAD / codex integration owner | 只允许已知无关 untracked；fast-forward ancestry | 阻塞 V0/FW；分叉停止该域并重确认策略 |
| V0 | 无提交 / verify / 验证最终结构、范围和提交拓扑 / medium | I1,I2 / 计划验证授权 | 两仓库集成状态 -> structure report / 四 validators+Git evidence | 所有目标文件、metadata、logs/status / 无 | 两主 worktree / validator/read locks / verification agent | 四 quick_validate、symlink、diff/status/log 审计 | 阻塞 V2；发现范围内问题插入仓库修正节点 |
| FG | 无提交 / fixture-setup / 构建 execution-graph fixture / medium | I1 / 计划临时 fixture 授权 | config skills+测试目标 -> graph temp repo / fixture path+clean baseline | 已集成 config skills / graph temp repo | 独立 `mktemp -d` / temp Git metadata / FG owner | 内容/路径最小且不触碰真实仓库 | 阻塞 EG；fixture 失真只重建本域 |
| FW | 无提交 / fixture-setup / 构建 GUI-worktree fixture / medium | I2 / 计划临时 fixture 授权 | GUI skill+脚本+测试目标 -> GUI temp repo / hash-equal skill copy+baseline | 已集成 GUI skill/script / GUI temp repo | 另一 `mktemp -d` / temp Git metadata / FW owner | hash/内容相等、所需目录本地化 | 阻塞 EW；fixture 失真只重建本域 |
| EG | 无提交 / blind-execution / 无历史 agent 实际执行 DAG 场景 / long | FG / 计划测试授权 | graph fixture+实际 skills -> event/state/commit evidence / runner artifacts | graph fixture / 仅 graph temp repo | `fork_turns="none"` agent / graph temp locks / graph blind runner | 实际事件偏序、Git/worktree 产物 | 阻塞 AG；污染真实仓库立即停止 |
| EW | 无提交 / blind-execution / 无历史 agent 实际执行 GUI worktree 探针 / medium | FW / 计划测试授权 | GUI fixture+skill -> command/auth/worktree evidence / runner artifacts | GUI fixture / 仅 GUI temp repo | 另一 `fork_turns="none"` agent / GUI temp locks / GUI blind runner | 精确命令、授权复用、漂移停止、无 setup commit | 阻塞 AW；污染真实仓库立即停止 |
| AG | 无提交 / independent-audit / 审计 DAG 行为 / medium | EG / 计划审计授权 | graph goal+raw artifacts -> graph verdict / evidence report | graph events/Git state/skills / 无 | 新 `fork_turns="none"` agent / read-only / graph audit agent | 不提供预期答案，按目标推导 | 阻塞 V2；范围内失败插入 config 修正节点 |
| AW | 无提交 / independent-audit / 审计 GUI worktree 行为 / medium | EW / 计划审计授权 | GUI goal+raw artifacts -> GUI verdict / evidence report | GUI events/worktree state/skill / 无 | 新 `fork_turns="none"` agent / read-only / GUI audit agent | 不提供预期答案，按目标推导 | 阻塞 V2；范围内失败插入 Codex 修正节点 |
| V2 | 无提交 / fan-in-audit / 汇总三路独立证据 / short | V0,AG,AW / 计划审计授权 | structure+两份行为报告 -> final verdict / 全部完成判据 | 三份报告及关键原始证据 / 无 | root / read-only / root | 冲突抽查、完成判据逐项核验 | 阻塞完成；只失效受修正影响的验证域 |

W2 内任一 writer 的 `writeSet` 与其他节点的 `readSet ∪ writeSet` 相交时，该节点暂时保持
ready 但等待资源释放，不补写伪硬依赖。共享 W2 的生成、格式化、stage、commit 只有 B4 owner
执行。

## Task 0：提交已确认设计与计划

### 精确文件

- `docs/superpowers/specs/2026/08/23/2026-08-23-parallel-execution-graph-workflow-design.md`
- `docs/superpowers/plans/2026/08/23/2026-08-23-parallel-execution-graph-workflow-plan.md`

### 命令与检查

```bash
git status --short --branch
git add -- docs/superpowers/specs/2026/08/23/2026-08-23-parallel-execution-graph-workflow-design.md docs/superpowers/plans/2026/08/23/2026-08-23-parallel-execution-graph-workflow-plan.md
git diff --cached --check
git diff --cached --name-only
git diff --cached
git commit -m 'docs: plan parallel execution graph workflow'
```

`git diff --cached --name-only` 必须恰好只有上述两个路径。无关 untracked design 和 ignored
research 不得出现。提交失败立即停止，禁止绕过工作文档门禁。

## Task 1：全局 `AGENTS.md` bootstrap（已在计划外完成）

该任务已经由提交 `9c3f683a33048433231471499af690f440356f85` 外部完成：父提交为
`d1a15a8c62d3556256a8287d188d47b4fbef273e`，提交范围只有 `AGENTS.md`，实际结果是本计划记录的
四条简版规则。它保留 Task 1 的独立提交身份，但不是本计划确认后需要再次执行的节点。

执行剩余计划时只允许在最终 V0 只读核验该提交、四条规则和相邻边界；不得再次修改、stage、
commit、merge、revert、cherry-pick 或为它创建 worktree。工作文档先提交门禁从 D0 开始约束
尚未执行的 Task 2/3，不把已经发生的 `9c3f683` 伪装成 D0 的后继。

## Task 2：Config 执行图 skills

Task 2 是一个提交边界，内部 B1/B2/B3 同时编辑不相交文件，B4 为唯一组合验证、stage、commit
owner。

### B1 `managing-work-stages`

修改“三轮门禁”“设计和计划落盘/计划授权”“范围扩大与重新确认”“完成前检查”：

- 计划必须产出执行图、初始 ready set、关键路径、fan-out/fan-in、read/write/resource 冲突、
  worktree/branch/index、任务提交与最终验证拓扑。
- 复杂计划确认前除影响面审计外，再做独立漏并行反向审计；无法举证的串行边必须删除。
- 计划确认后的“连续执行”改为持续调度 ready set，但不得跨越阶段、授权或范围门禁。
- 工作树精确授权、全部预配屏障和参数漂移重新确认属于计划门禁；不在该 skill 复制详细节点
  schema。

### B2 `delegating-micro-stages` 与执行图 reference

更新 `SKILL.md` 的“微阶段定义”“并行与串行”“同方向复用”“范围扩大”“计划执行职责”“完成
前检查”，并新建 `references/execution-graph.md`：

- `SKILL.md` 成为调度入口；计划编写或复杂计划执行时必须读取 reference。
- reference 定义设计确认的节点字段：`nodeId`、`taskBoundary`、`operationKind`、`outcome`、
  `estimatedCost`、`deferralEvidence`、`hardPredecessors`、`consumes/produces`、
  `completionEvidence`、`readSet/writeSet`、`executionContext`、`resourceLocks`、`owner`、
  `verification`、`failureDomain`、`replanTriggers`、`authorizationGate`。
- reference 定义 ready-set 状态机、关键路径优先、槽位填充、动态读写锁、暂缓证据失效、
  task-boundary fan-in、单 Git owner、失败域隔离与修正节点插图。
- 明确 `edit -> verify -> stage -> commit` 是相关节点内部依赖，不是无关任务的全局栅栏；同方向
  复用 agent 也不能替代依赖证据。
- 不用 `parallelizable: true/false`、任务编号或存活 agent 数作为权威。

该 reference 是确认设计明确要求的渐进披露载体；不新增脚本、模板或 assets。

### B3 `project-doc-workflow`

修改“设计与计划”“Research 记录”“已确认计划中的本地提交”：

- 长计划正文必须记录权威执行图、任务提交拓扑、worktree 精确授权、汇合与最终验证。
- 一个计划任务仍对应一个提交，但该边界不是其他无依赖任务的启动栅栏。
- 不同任务在独立 worktree/branch/index 并行形成提交，汇合保留提交身份，禁止 squash/合并任务。
- 同任务内不相交编辑可并行，唯一 owner 在 fan-in 组合验证后 stage/commit。
- 共享 `execution-log.md`/`current-findings.md` 由协调者单写；子代理返回结构化结果，避免共享日志
  成为并发写热点。

### B4 组合验证与提交

使用现有系统 Python，不安装 PyYAML：

```bash
/usr/bin/python3 /Users/jiangsheng/.codex/skills/.system/skill-creator/scripts/quick_validate.py /Users/jiangsheng/cnb/codex-config-parallel-execution-skills/skills/managing-work-stages
/usr/bin/python3 /Users/jiangsheng/.codex/skills/.system/skill-creator/scripts/quick_validate.py /Users/jiangsheng/cnb/codex-config-parallel-execution-skills/skills/delegating-micro-stages
/usr/bin/python3 /Users/jiangsheng/.codex/skills/.system/skill-creator/scripts/quick_validate.py /Users/jiangsheng/cnb/codex-config-parallel-execution-skills/skills/project-doc-workflow
```

人工核验 reference 可从 `SKILL.md` 发现，三个 skills 没有复制成相互冲突的完整调度协议，且
阶段/授权/提交门禁均保留。随后：

```bash
git -C /Users/jiangsheng/cnb/codex-config-parallel-execution-skills add -- skills/managing-work-stages/SKILL.md skills/delegating-micro-stages/SKILL.md skills/delegating-micro-stages/references/execution-graph.md skills/project-doc-workflow/SKILL.md
git -C /Users/jiangsheng/cnb/codex-config-parallel-execution-skills diff --cached --check
git -C /Users/jiangsheng/cnb/codex-config-parallel-execution-skills diff --cached --name-only
git -C /Users/jiangsheng/cnb/codex-config-parallel-execution-skills diff --cached
git -C /Users/jiangsheng/cnb/codex-config-parallel-execution-skills commit -m 'feat: define parallel execution graph workflow'
```

name-only 必须恰好为四个目标路径。

## Task 3：Codex GUI worktree 计划授权

### C1 编辑

只修改 `.codex/skills/codex-gui-worktree/SKILL.md`：

- 创建前继续打印精确命令和目标路径。
- 若已确认计划逐项包含完全一致的 name、branch、base、目标路径、include 和命令，不重复等待
  确认；用户明确要求直接执行的现有例外保留。
- 任一参数漂移或计划外创建仍必须重新确认。
- 计划声明多个 worktree 时，协调者必须在任何实现编辑、生成、产物验证或任务提交节点前完成
  全部创建与核验。
- 本 setup skill 本身不 stage/commit；后续节点只有在另有已确认的提交授权时才可操作该
  worktree。
- 保留禁止安装、下载、覆盖、冲突停止、committed-base 和验证输出规则。

不修改脚本、metadata 或默认 sparse layout。

### C2 验证与提交

```bash
/usr/bin/python3 /Users/jiangsheng/.codex/skills/.system/skill-creator/scripts/quick_validate.py /Users/jiangsheng/cnb/codex/.worktrees/parallel-execution-graph-codex-skill/.codex/skills/codex-gui-worktree
git -C /Users/jiangsheng/cnb/codex/.worktrees/parallel-execution-graph-codex-skill add -- .codex/skills/codex-gui-worktree/SKILL.md
git -C /Users/jiangsheng/cnb/codex/.worktrees/parallel-execution-graph-codex-skill diff --cached --check
git -C /Users/jiangsheng/cnb/codex/.worktrees/parallel-execution-graph-codex-skill diff --cached --name-only
git -C /Users/jiangsheng/cnb/codex/.worktrees/parallel-execution-graph-codex-skill diff --cached -- .codex/skills/codex-gui-worktree/SKILL.md
git -C /Users/jiangsheng/cnb/codex/.worktrees/parallel-execution-graph-codex-skill commit -m 'fix: honor planned worktree authorization'
```

name-only 必须只有 `.codex/skills/codex-gui-worktree/SKILL.md`。

## 集成节点

B4 与 C2 完成后分别在两个主 worktree 执行，二者可并行：

```bash
git -C /Users/jiangsheng/cnb/codex-config merge --ff-only codex/parallel-execution-skills
```

```bash
git -C /Users/jiangsheng/cnb/codex merge --ff-only codex/parallel-execution-codex-skill
```

两次集成都必须是 fast-forward；不得改用 squash、cherry-pick、普通 merge、rebase 或 force。
若主分支在执行期间发生非计划提交而不能 fast-forward，停止对应集成域并回到计划变更确认，
不擅自选择新的集成策略。

## 最终验证

### V0 结构与范围

- 重新对两个主 worktree 运行四个 `quick_validate.py`。
- 通过 `readlink`/`realpath` 确认全局入口仍指向刚集成的 config 文件。
- 逐一读取四个 `agents/openai.yaml`，确认 discovery metadata 未被修改且仍准确。
- `git diff --check`、`git status --short --branch`、本地 `git log` 确认外部 AGENTS 提交与两个
  剩余实现任务各自保持独立提交，ignored research 与无关 design 未进入提交。
- 检查 `AGENTS.md` 第 34–40 行，确认旧“提交，再开始下一个任务”已消失，四条简版规则与
  `9c3f683` 精确一致，周围规则未变。

### FG 与 FW：并行准备两个隔离 fixture

I1 完成后，FG 在一个 `mktemp -d` 中建立 execution-graph fixture，提供最小文件、两个提交
任务和实际生效的 `managing-work-stages`、`delegating-micro-stages`、
`project-doc-workflow` 入口。

I2 完成后，FW 在另一个 `mktemp -d` 中建立 Codex GUI worktree fixture：创建最小 Codex-like
Git 仓库和脚本所需的本地目录，把刚集成的 `.codex/skills/codex-gui-worktree` 与脚本机械复制
到 fixture，并用 hash/内容比较确认副本与实际版本一致。fixture 计划精确列出两个 GUI sparse
worktree 创建动作及 include 范围。

FG/FW 没有文件、Git index、目录或 runner 依赖，必须并行。两者都不复用真实仓库的 branch、
worktree root、Git index 或 dependency symlink 目标；所有可变状态限制在各自临时目录。

### EG：无历史 execution-graph blind runner

使用 `fork_turns="none"` 创建不继承本轮对话、设计、计划、审计结论或预期答案的独立执行
agent。只向它提供实际 config skill 路径、FG fixture、最小用户请求和 fixture 内已确认计划：

- 两个精确声明、不同提交边界的 worktree A/B；全部预配前不得有实现事件。
- A1/A2 写集合不相交；A3 读取 A1 正在写的文件；A-verify 等待三者组合状态。
- B 与 A 独立，但 B 验证故意失败，需要插入 B-fix。
- D 无依赖但有可核验的冷启动负收益；warm agent 出现后证据失效。
- A/B 使用计划精确参数；另一次请求故意改变 B 的 base/path/include。

runner 必须实际产生节点状态/事件、打印的精确创建命令、worktree 状态和本地提交历史；不得
只解释规则。

### EW：无历史 GUI-worktree blind runner

与 EG 同时使用另一个 `fork_turns="none"` agent。只提供 FW fixture 中的实际 skill 副本、
最小用户请求和已确认的两个精确 GUI worktree 动作；另一个探针改变其中一个
name/branch/base/path/include。漂移探针只观察它进入需确认状态且未执行，不实际等待用户往返。

EW 必须记录打印的精确命令、worktree 创建/核验事件、setup skill 自身是否 stage/commit，
以及第一个实现事件是否发生在全部已声明 GUI worktree 核验之后。

### AG 与 AW：并行独立行为审计

EG/EW 完成后，分别使用新的 `fork_turns="none"` 审计 agent。两者都不继承本计划的预期判定：
AG 只读取 graph fixture 原始请求、实际 config skills、EG 原始事件与 Git 状态；AW 只读取
GUI fixture 原始请求、实际 GUI skill、EW 原始事件与 worktree 状态。它们自行推导是否满足
请求，并行返回证据。root 在 V2 再对照以下设计判据汇总：

- 两个 worktree 全部核验前没有实现编辑；精确参数不重复询问，漂移参数未执行。
- 首次 ready set 同时启动 A1/A2/B，而非按编号串行。
- A3 保持 ready 但因动态读写冲突暂缓；A1 释放写锁后立即启动，不等待整个 wave。
- A-verify 在 A1/A2/A3 fan-in 后验证组合 diff，且共享 index 只有一个 owner。
- B 失败只暂停 B 后继，A 继续；B-fix 插图后只恢复 B 域。
- D 的 `deferralEvidence` 含收益、成本、复查触发点和失效条件；warm-agent 事实出现后重新 ready。
- GUI skill 在完全匹配计划参数时打印精确命令、不重复询问并完成全部预配；参数漂移时没有
  执行；setup 节点没有 stage/commit，且预配屏障前无实现事件。
- 通过事件偏序、暂停范围、worktree 状态和提交边界判定，不匹配固定措辞或正则。

fixture 只存在于临时目录，不 stage/commit 到任一真实仓库。验证不得安装程序、访问 Git 远程、
使用 force 或修改基线。若 forward test 暴露本计划范围内的 skill 问题，按失败域插入修正节点，
在对应现有 worktree 创建新的独立修正提交并再次 fast-forward；禁止 amend。超出已确认设计或
授权时停止并回到计划确认。

## 失败传播与动态重编图

- P0 缺失时所有剩余节点等待。
- D0 或预配失败：实现图尚未启动，只暂停其后继并报告；不得绕过。
- B1/B2/B3 之一失败：只暂停 B4/I1/V0/FG/EG/AG/V2；其他 B 编辑节点与 C 分支继续。
- C1/C2 失败：只暂停 I2/V0/FW/EW/AW/V2；B 分支继续。
- I1 或 I2 fast-forward 失败：只暂停对应集成域及最终 fan-in；另一仓库已运行节点不回滚。
- V0、EG/AG、EW/AW 或 V2 发现范围内问题：插入对应仓库修正节点和新提交，只失效受影响的
  验证分支后重跑。
- 任何节点需要计划外文件、worktree、branch、接口、数据、安全或授权：只暂停其依赖域，更新
  计划并等待确认；不得用 adapter、fallback、force 或临时兼容层绕过。

## 独立反向审计结论

计划确认前的独立反向审计已完成，结论如下：

- `AGENTS.md` bootstrap 已由外部提交 `9c3f683` 完成；再次创建 W1 或重做 A0-A3/I0/S0 没有
  产物收益，反而会重复修改既有提交，因此从剩余执行图删除。
- W2/W3 位于不同仓库、没有产物或资源依赖，必须并行预配，再在 WP 汇合。
- B1/B2/B3 写集合不重叠，可共享一个 worktree 并行编辑；分成三个 worktree 没有关键路径收益，
  反而增加预配与集成成本。
- C 与 B 位于不同仓库，在 WP 后没有产物或资源依赖，必须并行。
- B4 的组合验证与单 index owner 是真实 fan-in；不能让三个 editor 分别 stage/commit。
- `codex-gui-worktree` 创建脚本不适合本任务的 prompt/skill worktree，使用它会引入 GUI sparse
  checkout 和链接副作用；Git 原生命令是本任务可表达语义的入口。
- 新 reference 虽然当前目录不存在，但由已确认设计明确要求，用于渐进披露详细执行图协议；
  不采用“全部塞回 SKILL.md”的替代方案。
- `agents/openai.yaml`、worktree 脚本、代码、schema、生成物和测试基线没有行为必要性证据，
  全部排除。
- 默认 Python 缺 PyYAML，但 `/usr/bin/python3` 已能运行 `quick_validate.py`；禁止安装依赖。
- 计划没有授权 worktree/branch 清理，避免把创建授权扩张成删除授权。

## 完成判据

- 外部 AGENTS 提交与两个剩余实现任务保持三个独立本地提交，docs 另有一个独立提交；没有
  amend、squash 或远程操作。
- 两个主分支 fast-forward 集成完成，当前生效 symlink 指向新规则。
- 四个 skills 通过结构验证，blind forward test 与独立行为审计通过。
- ignored research、无关 design 和其他用户变更未被暂存或提交。
- 两个计划创建的 worktree/branch 保留并准确报告。
