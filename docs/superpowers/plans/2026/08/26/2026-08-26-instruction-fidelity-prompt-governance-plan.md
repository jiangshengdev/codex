# 用户指令保真提示词治理实施计划

日期：2026-08-26

状态：已确认

确认日期：2026-08-26

确认原文：`确认计划`

设计依据：`docs/superpowers/specs/2026/08/26/2026-08-26-instruction-fidelity-prompt-governance-design.md`

关联 issue：`docs/superpowers/issues/2026/08/24/2026-08-24-02-codex-execution-process-problems/2026-08-24-03-semantic-and-literal-drift.md`

## 目标与保证边界

在不修改 `codex-gui`、现有动作授权模型、realtime override 语义、协议、schema 或工具执行器的前提下，实施三层提示词治理：全局 `AGENTS.md` 只增加简洁保真不变量与 skill 路由；新建详细的 `instruction-fidelity` skill；默认 realtime 对话前端提示词只负责忠实转交原始请求、纠正、持续约束和机器字面量。

本计划只降低模型产生语义与字面量漂移的概率，不形成工具级 enforcement。实施及验证完成后不自动关闭或降级关联 issue。

## 当前基线与授权边界

- 主仓库：`/Users/jiangsheng/cnb/codex`，当前 `dev@e4c3c03c5c63ff47c54fd192ec1d7023d6dade19`；工作树除已确认设计外无其他变更。
- 配置仓库：`/Users/jiangsheng/cnb/codex-config`，当前 `main@c865990645ba4ae31ac87781a875649abbd422d4`；工作树干净。现有 action-authorization worktrees 与本计划无关，禁止修改或清理。
- 计划确认将授权本文精确列出的文档提交、三个本地 worktree/branch、三个任务提交、本地集成、规范 checkout installer、新 root 只读行为验收和非 force 清理；不授权远程 Git、force、amend、squash、安装程序或计划外修复。
- 计划确认不授权写 canonical protected target `/Users/jiangsheng/.codex/AGENTS.md`，其实际目标是 `/Users/jiangsheng/cnb/codex-config/AGENTS.md`。`GLOBAL-APPROVAL` 必须再次展示本文精确文本，并取得用户回复“确认写入”或“确认允许写入”。
- 计划确认后的第一项有状态操作必须只暂存设计与本计划并创建文档提交。文档提交成功前，禁止创建 worktree 或实施任何任务。

## 精确文件与提交边界

### DOC：工作文档提交

提交消息：`docs: add instruction fidelity prompt governance plan`

仅包含：

- `docs/superpowers/specs/2026/08/26/2026-08-26-instruction-fidelity-prompt-governance-design.md`
- `docs/superpowers/plans/2026/08/26/2026-08-26-instruction-fidelity-prompt-governance-plan.md`

### SKILL：详细保真 owner

提交消息：`skills: add instruction fidelity owner`

仅新增：

- `skills/instruction-fidelity/SKILL.md`
- `skills/instruction-fidelity/agents/openai.yaml`
- `skills/instruction-fidelity/references/semantic-anchors.md`
- `skills/instruction-fidelity/references/acceptance-cases.md`

initializer 创建 `SKILL.md`、`agents/openai.yaml` 和 `references/`；不创建 `scripts/`、`assets/`、README 或 changelog。implicit invocation 保持默认开启。

### GLOBAL：全局短不变量

提交消息：`instructions: preserve user instruction fidelity`

仅修改：

- `AGENTS.md`

在最高性格与规则部分之后、`## 工作阶段` 之前插入以下精确内容；现有授权、Shell、语言和其他规则不改写、不移动：

```markdown
## 用户指令保真

- 概括、确认、设计、计划、委派或执行用户请求时，必须保持决定结果的语义等价；不得无依据地改变对象、动作、预期结果、范围、否定条件、阈值、关系或用户术语。
- 面向机器的字面量必须逐字保留。无法确认转换等价时，保留原文；仅在差异会改变结果且无法由当前证据确认时询问用户。
- 需要识别、记录或跨边界转交用户指令时，必须使用 `$instruction-fidelity`。它只判断用户说了什么及转换是否等价；动作授权仍由 `$action-authorization` 判断。
```

### REALTIME：默认前端转交契约

提交消息：`prompts: preserve realtime delegation fidelity`

仅修改：

- `codex-rs/prompts/templates/realtime/backend_prompt.md`

在 `## Backend use and steering` 现有纠正转交规则后新增以下一条，不修改 request/config override 选择逻辑：

```markdown
* When passing a user request to the backend, faithfully preserve the current request, later corrections, active constraints, and machine-facing literals. Do not replace them with a new product goal or a semantic summary; the original user input and conversation transcript remain authoritative.
```

## Worktree 精确动作

三个创建节点没有产物依赖。`WT-SKILL` 与 `WT-GLOBAL` 共享配置仓库 worktree metadata 写锁，调度时由资源锁短暂串行；`WT-REALTIME` 属于另一仓库，可同时执行。

```bash
git -C /Users/jiangsheng/cnb/codex-config worktree add -b codex/instruction-fidelity-skill /Users/jiangsheng/cnb/codex-config-instruction-fidelity-skill main
git -C /Users/jiangsheng/cnb/codex-config worktree add -b codex/instruction-fidelity-global /Users/jiangsheng/cnb/codex-config-instruction-fidelity-global main
git -C /Users/jiangsheng/cnb/codex worktree add -b codex/instruction-fidelity-realtime /Users/jiangsheng/cnb/codex-instruction-fidelity-realtime dev
```

计划编写时三条 branch 与三个路径均不存在。执行时先按节点命令复核，任何同名 branch、目录、worktree、dirty base 或 HEAD 漂移都触发重编图，不覆盖现有资源。

## 执行图总览

```text
GLOBAL-APPROVAL ───────────────────────────────────────────────────→ GLOBAL-EDIT
        └──────────────────────────────────────────────────────────→ INSTALL-SKILL
DOC-STAGE → DOC-COMMIT
                 ├─────────────────────────────────────────────────→ GLOBAL-EDIT
                 ├─ WT-SKILL → SKILL-INIT → SKILL-EDIT ─┬─ SKILL-STRUCTURE
                 │                                       └─ SKILL-FORWARD
                 │                                            ↓ fan-in
                 │                      SKILL-STAGE → SKILL-COMMIT → MERGE-SKILL → INSTALL-SKILL
                 ├─ WT-GLOBAL ────────────────────────────────────────────────→ GLOBAL-EDIT
                 │                     GLOBAL-EDIT → GLOBAL-VERIFY → GLOBAL-STAGE → GLOBAL-COMMIT
                 │                     INSTALL-SKILL + GLOBAL-COMMIT → MERGE-GLOBAL
                 └─ WT-REALTIME → REALTIME-EDIT ─┬─ REALTIME-UNIT
                                                 └─ REALTIME-INTEGRATION
                                                      ↓ fan-in
                                             REALTIME-FMT → REALTIME-VERIFY
                                                 → REALTIME-STAGE → REALTIME-COMMIT → MERGE-REALTIME

MERGE-GLOBAL → LIVE-PREFLIGHT → LIVE-CASE-1 → LIVE-CASE-1-CLEAN
                                      ↓
                                 LIVE-CASE-2 → LIVE-CASE-2-CLEAN
                                      ↓
                                 LIVE-CASE-3 → LIVE-CASE-3-CLEAN
MERGE-GLOBAL + LIVE-CASE-3-CLEAN → CLEANUP-SKILL-WT + CLEANUP-GLOBAL-WT
MERGE-REALTIME → CLEANUP-REALTIME

LIVE-CASE-3-CLEAN + CLEANUP-SKILL-WT + CLEANUP-GLOBAL-WT + CLEANUP-REALTIME → FINAL-VERIFY
```

初始 ready set：计划确认后 `DOC-STAGE` 与不改变 workspace 状态的 `GLOBAL-APPROVAL` 同时就绪；文档提交仍是第一项有状态操作。`DOC-COMMIT` 完成后三个 worktree 创建节点同时就绪。special approval 只阻塞 GLOBAL 编辑及可能扫描受保护目标的 installer，不阻塞 SKILL 或 REALTIME 编辑验证。`SKILL-STRUCTURE` 与 `SKILL-FORWARD` 可并行；两个 realtime 测试没有产物依赖，但共享同一 worktree 的绝对 Cargo target/runner 写锁，由资源锁串行而不是伪造依赖。配置任务和 realtime 任务使用不同仓库、worktree、branch 和 index，可并行推进。三个 live 场景不存在产物依赖，但共享 canonical Codex runtime state 写锁，按场景串行并各自立即清理临时目录。

关键路径是 `DOC → 最慢实施分支 → 对应本地集成 → live/最终验收`。若 protected target 确认迟到，GLOBAL 成为动态关键路径；其他分支继续。

## 授权信封模板

各节点的 `authorizationGate` 引用以下模板，并把本节点 `readSet`、`writeSet`、`commandScope`、canonical resources 和 `stateEffects` 收紧进模板。模板状态在计划确认前均为 `pending`。

- `AUTH-READ`：`grantSource=计划确认`；`grantedOperation=节点列出的只读调查/验证`；`parameterBounds=节点 commandScope`；`status=pending`；`requiredApprovalIds=[]`；无编辑、stage、commit、remote、安装或计划外测试。
- `AUTH-WRITE`：`grantSource=计划确认`；`grantedOperation=节点 allowlist 文件的生成或编辑`；`parameterBounds=apply_patch/initializer 与精确 writeSet`；`status=pending`；`requiredApprovalIds=[]`；只产生未暂存 workspace diff。
- `AUTH-STAGE`：`grantSource=计划确认`；`grantedOperation=精确 allowlist stage`；`parameterBounds=节点 git add 与 index`；`status=pending`；`requiredApprovalIds=[]`；无编辑、commit、remote。
- `AUTH-COMMIT`：`grantSource=计划确认`；`grantedOperation=把已审查 staged snapshot 创建为一个本地提交`；`parameterBounds=精确 commit message/branch`；`status=pending`；`requiredApprovalIds=[]`；禁止额外 stage、amend、remote。
- `AUTH-INTEGRATE`：`grantSource=计划确认`；`grantedOperation=本文精确 worktree、merge、installer、只读新 root 验收或非 force cleanup`；`parameterBounds=节点 commandScope`；`status=pending`；`requiredApprovalIds=[]`；禁止冲突解决、force、remote、计划外清理。
- `AUTH-ASK-GLOBAL`：`grantSource=计划确认`；`grantedOperation=展示 GLOBAL 精确文本并等待专门确认`；`parameterBounds=本文三条 Markdown`；`status=pending`；`requiredApprovalIds=[]`；不调用写工具。
- `AUTH-GLOBAL`：`grantSource=用户对本文三条精确文本及 canonical installer 受保护目标副作用的专门确认`；`grantedOperation=GLOBAL edit/stage/commit/integration，以及从规范 checkout 运行 installer 时对其完整 managed-target 集合执行脚本固有的 skip/link/backup-and-relink`；`parameterBounds=GLOBAL 与 INSTALL-SKILL 节点`；`status=unauthorized`；`requiredApprovalIds=[global-instruction-fidelity-write-2026-08-26]`；canonical target 同时记录 live alias `/Users/jiangsheng/.codex/AGENTS.md`、实际目标 `/Users/jiangsheng/cnb/codex-config/AGENTS.md`、候选 worktree 文件及 installer 枚举出的全部规范 source/target。专门确认时必须明确说明：正常预期只有新增 skill link；若预检后出现状态漂移，installer 可能按其固有流程先备份再重建任一 managed target，不能把事后发现 `backup:` 当作前置保护。

所有模板共同规定：`owner` 不是授权来源；能力在节点完成、失败、撤销、替换或前提失效时到期；子代理默认不可继续委派；失败只暂停节点及传递后继；写集合、行为、接口、override 语义、验证入口或 canonical target 变化时停止并重编图。

## 节点契约

下列每个节点均继承：`deferralEvidence=无`，除非节点明确写出；`subdelegation=禁止`，除非节点明确允许；`failureDomain=本节点及传递后继`；`replanTriggers=writeSet/命令/基线/canonical identity/设计边界变化`。

### 文档与授权节点

#### DOC-STAGE

- `taskBoundary/kind/outcome/cost`：DOC / stage / index 中仅有设计与计划 / 低。
- `hardPredecessors`：计划明确确认；`consumes/produces`：两份文档 → staged snapshot；`completionEvidence`：cached allowlist、完整审查与 `git diff --cached --check` 通过。
- `readSet/writeSet/stateEffects`：两份文档与主仓库状态 / 主 index / 只 stage 两份文档。
- `commandScope`：在 `/Users/jiangsheng/cnb/codex` 执行 `git add -- <设计> <计划>`、`git diff --cached --check`、`git diff --cached --name-only`、两路径 cached diff。
- `executionContext/locks/owner`：dev 主 worktree / 主 index write / DOC 唯一 Git owner。
- `verification`：staged 内容与 allowlist；`authorizationGate`：`AUTH-STAGE`。

#### DOC-COMMIT

- `taskBoundary/kind/outcome/cost`：DOC / commit / 创建文档独立提交 / 低。
- `hardPredecessors`：DOC-STAGE；`consumes/produces`：staged snapshot → commit id；`completionEvidence`：commit tree 与 snapshot 一致。
- `readSet/writeSet/stateEffects`：staged snapshot / dev ref 与 index / 一个本地提交。
- `commandScope`：`git commit -m 'docs: add instruction fidelity prompt governance plan'`、`git show --stat --oneline HEAD`。
- `executionContext/locks/owner`：dev 主 worktree / 主 index+dev ref write / DOC-STAGE 同一 Git owner。
- `verification`：提交 allowlist；`authorizationGate`：`AUTH-COMMIT`。

#### GLOBAL-APPROVAL

- `taskBoundary/kind/outcome/cost`：GLOBAL / authorization / 获得或拒绝专门 approval id / 低。
- `hardPredecessors`：计划明确确认；`consumes/produces`：GLOBAL 三条精确文本、受保护目标与 installer 完整潜在副作用说明 → `global-instruction-fidelity-write-2026-08-26` 或拒绝证据；`completionEvidence`：用户明确回复“确认写入”“确认允许写入”或等价直接授权。
- `readSet/writeSet/stateEffects`：计划与设计 / 无 / 仅对话确认状态。
- `commandScope`：不调用 shell；逐字展示本文 GLOBAL Markdown，并说明 installer 正常只新增 skill link、但其固有 backup-and-relink 行为覆盖全部 managed targets。
- `executionContext/locks/owner`：主线程 / 无 / 主协调代理；`verification`：回复必须唯一指向该文本和受保护目标。
- `authorizationGate`：`AUTH-ASK-GLOBAL`；拒绝只暂停 GLOBAL 与依赖其完成的 FINAL，不暂停 SKILL/REALTIME。

### Worktree 节点

#### WT-SKILL

- `taskBoundary/kind/outcome/cost`：SKILL / integration / 创建干净的 SKILL branch、worktree 与 index / 低。
- `hardPredecessors`：DOC-COMMIT；`consumes/produces`：config `main@c865990645ba4ae31ac87781a875649abbd422d4` → SKILL worktree identity；`completionEvidence`：branch、HEAD、status、worktree list 精确匹配。
- `readSet/writeSet/stateEffects`：config base ref 与目标路径 / `codex/instruction-fidelity-skill` ref、common worktree metadata、目标 path/index / 一个本地 branch 与 worktree。
- `commandScope`：先核对 branch 不存在、目标同时 `! -e` 与 `! -L`、base HEAD/status；随后只执行本文 SKILL `git worktree add` 及 identity/status 核验。
- `executionContext/locks/owner`：config 规范 checkout / `/Users/jiangsheng/cnb/codex-config/.git` worktree metadata write 与 SKILL branch/path/index / SKILL Git owner；`verification`：干净且 HEAD 等于声明 base；`authorizationGate`：`AUTH-INTEGRATE`。

#### WT-GLOBAL

- `taskBoundary/kind/outcome/cost`：GLOBAL / integration / 创建干净的 GLOBAL branch、worktree 与 index / 低。
- `hardPredecessors`：DOC-COMMIT；`consumes/produces`：config `main@c865990645ba4ae31ac87781a875649abbd422d4` → GLOBAL worktree identity；`completionEvidence`：branch、HEAD、status、worktree list 精确匹配。
- `readSet/writeSet/stateEffects`：config base ref 与目标路径 / `codex/instruction-fidelity-global` ref、common worktree metadata、目标 path/index / 一个本地 branch 与 worktree。
- `commandScope`：先核对 branch 不存在、目标同时 `! -e` 与 `! -L`、base HEAD/status；随后只执行本文 GLOBAL `git worktree add` 及 identity/status 核验。
- `executionContext/locks/owner`：config 规范 checkout / 与 WT-SKILL 共享 `/Users/jiangsheng/cnb/codex-config/.git` worktree metadata write 锁，另有 GLOBAL branch/path/index / GLOBAL Git owner；`verification`：干净且 HEAD 等于声明 base；`authorizationGate`：`AUTH-INTEGRATE`。

#### WT-REALTIME

- `taskBoundary/kind/outcome/cost`：REALTIME / integration / 创建干净的 REALTIME branch、worktree 与 index / 低。
- `hardPredecessors`：DOC-COMMIT；`consumes/produces`：DOC commit 后的 codex `dev` → REALTIME worktree identity；`completionEvidence`：branch、HEAD、status、worktree list 精确匹配。
- `readSet/writeSet/stateEffects`：codex base ref 与目标路径 / `codex/instruction-fidelity-realtime` ref、common worktree metadata、目标 path/index / 一个本地 branch 与 worktree。
- `commandScope`：先核对 branch 不存在、目标同时 `! -e` 与 `! -L`、base HEAD/status；随后只执行本文 REALTIME `git worktree add` 及 identity/status 核验。
- `executionContext/locks/owner`：codex 规范 checkout / `/Users/jiangsheng/cnb/codex/.git` worktree metadata write 与 REALTIME branch/path/index / REALTIME Git owner；`verification`：干净且 HEAD 等于 DOC commit 后的 dev；`authorizationGate`：`AUTH-INTEGRATE`。

### SKILL 任务

#### SKILL-INIT

- `taskBoundary/kind/outcome/cost`：SKILL / generate / initializer 创建准确 scaffold / 低。
- `hardPredecessors`：WT-SKILL；`consumes/produces`：skill-creator initializer 与 metadata 规则 → `SKILL.md`、`agents/openai.yaml`、`references/`；`completionEvidence`：文件清单准确，无 scripts/assets。
- `readSet/writeSet/stateEffects`：initializer / SKILL 四文件目录 / 未暂存 scaffold。
- `commandScope`：`/usr/bin/python3 /Users/jiangsheng/.codex/skills/.system/skill-creator/scripts/init_skill.py instruction-fidelity --path /Users/jiangsheng/cnb/codex-config-instruction-fidelity-skill/skills --resources references --interface 'display_name=Instruction Fidelity' --interface 'short_description=Preserve user intent and machine literals.' --interface 'default_prompt=Use $instruction-fidelity to preserve semantic constraints and machine literals while transforming this request.'`。
- `executionContext/locks/owner`：SKILL worktree / skill directory write / SKILL 编辑 owner；`verification`：生成清单；`authorizationGate`：`AUTH-WRITE`。

#### SKILL-EDIT

- `taskBoundary/kind/outcome/cost`：SKILL / edit / 四文件完整实现设计且无 scaffold 占位 / 高。
- `hardPredecessors`：SKILL-INIT；`consumes/produces`：设计、skill-creator 规则、scaffold → 最终 skill；`completionEvidence`：description 精确、主入口路由两 references、没有授权第二 owner 或真实隐私案例。
- `readSet/writeSet/stateEffects`：设计与 scaffold / SKILL 四文件 / 未暂存 diff。
- `commandScope`：只用 `apply_patch` 编辑四个绝对 allowlist 文件；`executionContext/locks/owner`：SKILL worktree / 四文件 write / SKILL 编辑 owner。
- `verification`：内容自审覆盖语义锚点、机器字面量、纠正合并、失败行为和正负验收；`authorizationGate`：`AUTH-WRITE`。

#### SKILL-STRUCTURE

- `taskBoundary/kind/outcome/cost`：SKILL / verification / 结构、YAML 与 diff 范围通过 / 中。
- `hardPredecessors`：SKILL-EDIT；`consumes/produces`：SKILL diff → validator 证据；`completionEvidence`：quick_validate、openai.yaml parse、`git diff --check`、allowlist 全通过。
- `readSet/writeSet/stateEffects`：四文件 / 仅 uv 临时 cache / 验证输出与临时隔离依赖状态。
- `commandScope`：在 SKILL worktree 执行 `/opt/homebrew/bin/uv run --no-project --with pyyaml python /Users/jiangsheng/.codex/skills/.system/skill-creator/scripts/quick_validate.py /Users/jiangsheng/cnb/codex-config-instruction-fidelity-skill/skills/instruction-fidelity`；`/usr/bin/ruby -e 'require "yaml"; YAML.load_file(ARGV.fetch(0)); puts "valid"' skills/instruction-fidelity/agents/openai.yaml`；`git diff --check`、`git diff --name-only`。
- `executionContext/locks/owner`：SKILL worktree / uv cache write+diff read / SKILL 验证 owner；`verification`：命令成功；`authorizationGate`：`AUTH-READ`。

#### SKILL-FORWARD

- `taskBoundary/kind/outcome/cost`：SKILL / review / 独立上下文证明分级保真且不过度逐字化 / 中。
- `hardPredecessors`：SKILL-EDIT；`consumes/produces`：skill 四文件与合成场景 → 结构化行为审查；`completionEvidence`：对象/范围/否定/阈值/机器字面量全部保持，普通自然语言仍可简洁概括。
- `readSet/writeSet/stateEffects`：skill 目录与合成 prompt / 无 / 仅审查结果。
- `commandScope`：无 shell；每个独立评估上下文必须收到绝对入口 `/Users/jiangsheng/cnb/codex-config-instruction-fidelity-skill/skills/instruction-fidelity/SKILL.md`，完整读取该文件并按其路由读取所需 references，再处理“评估未重构测试重复且排除覆盖率”“9 分以上包含 10 且排除 credits”“原样保持 `j c` 两 token”；不得声称通过尚未安装的 skill 名称自动发现，不得执行请求。
- `executionContext/locks/owner`：独立只读代理 / skill read / SKILL forward-review owner；`subdelegation`：允许最多三个只读评估子节点，不允许写入。
- `verification`：主协调代理比对原始锚点与输出；`authorizationGate`：`AUTH-READ`。

#### SKILL-STAGE

- `taskBoundary/kind/outcome/cost`：SKILL / stage / index 中只有四个 skill 文件 / 低。
- `hardPredecessors`：SKILL-STRUCTURE+SKILL-FORWARD；`consumes/produces`：已验证 diff → staged snapshot；`completionEvidence`：cached allowlist、完整 cached diff 与 `git diff --cached --check` 通过。
- `readSet/writeSet/stateEffects`：四文件 diff / SKILL index / 只 stage 四文件。
- `commandScope`：`git add --` 四个精确路径，再执行 cached name-only/diff/check；`executionContext/locks/owner`：SKILL worktree / SKILL index write / SKILL Git owner。
- `verification`：staged allowlist；`authorizationGate`：`AUTH-STAGE`。

#### SKILL-COMMIT

- `taskBoundary/kind/outcome/cost`：SKILL / commit / 创建一个独立 SKILL 提交 / 低。
- `hardPredecessors`：SKILL-STAGE；`consumes/produces`：staged snapshot → SKILL commit id；`completionEvidence`：commit tree 与 snapshot 精确一致。
- `readSet/writeSet/stateEffects`：SKILL index / SKILL branch ref 与 index / 一个本地提交。
- `commandScope`：`git commit -m 'skills: add instruction fidelity owner'`、`git show --stat --oneline HEAD`；`executionContext/locks/owner`：SKILL worktree / index+branch ref write / SKILL Git owner。
- `verification`：commit allowlist；`authorizationGate`：`AUTH-COMMIT`。

### GLOBAL 任务

#### GLOBAL-EDIT

- `taskBoundary/kind/outcome/cost`：GLOBAL / edit / 只插入本文三条精确规则 / 低。
- `hardPredecessors`：WT-GLOBAL+GLOBAL-APPROVAL；`consumes/produces`：当前 AGENTS、approval id、精确文本 → GLOBAL diff；`completionEvidence`：插入位置、文本和其余文件内容准确。
- `readSet/writeSet/stateEffects`：候选 AGENTS / 候选 AGENTS / 未暂存 diff；不得改 live inode 或其他文件。
- `commandScope`：只用 `apply_patch` 在 `/Users/jiangsheng/cnb/codex-config-instruction-fidelity-global/AGENTS.md` 插入本文精确 Markdown。
- `executionContext/locks/owner`：GLOBAL worktree / candidate AGENTS write / GLOBAL 编辑 owner；`verification`：与 base 做逐行 diff；`authorizationGate`：`AUTH-GLOBAL`。

#### GLOBAL-VERIFY

- `taskBoundary/kind/outcome/cost`：GLOBAL / verification / 规则简洁且不重复既有 owner / 中。
- `hardPredecessors`：GLOBAL-EDIT；`consumes/produces`：GLOBAL diff → 重复与范围审查；`completionEvidence`：仅 AGENTS 变化、`git diff --check` 通过、三条精确文本一致、相邻规则未动。
- `readSet/writeSet/stateEffects`：候选 AGENTS、action-authorization、Shell/语言相邻规则 / 无 / 只读结果。
- `commandScope`：GLOBAL worktree `git diff --check`、`git diff --name-only`、`git diff -- AGENTS.md`、精确 `rg`；无 fix。
- `executionContext/locks/owner`：GLOBAL worktree / diff read / 独立规则审查 owner；`verification`：主协调抽查；`authorizationGate`：`AUTH-READ` 加 required approval id。

#### GLOBAL-STAGE

- `taskBoundary/kind/outcome/cost`：GLOBAL / stage / index 中只有 AGENTS / 低。
- `hardPredecessors`：GLOBAL-VERIFY；`consumes/produces`：已验证 AGENTS diff → staged snapshot；`completionEvidence`：cached allowlist/diff/check 通过。
- `readSet/writeSet/stateEffects`：AGENTS diff / GLOBAL index / 只 stage AGENTS。
- `commandScope`：`git add -- AGENTS.md`、cached check/name/diff；`executionContext/locks/owner`：GLOBAL worktree / GLOBAL index write / GLOBAL Git owner。
- `verification`：staged allowlist；`authorizationGate`：`AUTH-GLOBAL` 收紧为 stage。

#### GLOBAL-COMMIT

- `taskBoundary/kind/outcome/cost`：GLOBAL / commit / 创建一个独立 GLOBAL 提交 / 低。
- `hardPredecessors`：GLOBAL-STAGE；`consumes/produces`：staged snapshot → GLOBAL commit id；`completionEvidence`：commit tree 与 snapshot 精确一致。
- `readSet/writeSet/stateEffects`：GLOBAL index / GLOBAL branch ref 与 index / 一个本地提交。
- `commandScope`：`git commit -m 'instructions: preserve user instruction fidelity'`、`git show --stat --oneline HEAD`；`executionContext/locks/owner`：GLOBAL worktree / index+branch ref write / GLOBAL Git owner。
- `verification`：commit allowlist；`authorizationGate`：`AUTH-GLOBAL` 收紧为 commit。

### REALTIME 任务

#### REALTIME-EDIT

- `taskBoundary/kind/outcome/cost`：REALTIME / edit / 只新增一条默认 handoff 契约 / 低。
- `hardPredecessors`：WT-REALTIME；`consumes/produces`：当前模板与精确英文文本 → 单文件 diff；`completionEvidence`：位置和文本准确，override 代码未变。
- `readSet/writeSet/stateEffects`：backend_prompt.md / 同文件 / 未暂存 diff。
- `commandScope`：只用 `apply_patch` 修改 worktree 中该文件；`executionContext/locks/owner`：REALTIME worktree / prompt write / REALTIME 编辑 owner。
- `verification`：单文件 diff；`authorizationGate`：`AUTH-WRITE`。

#### REALTIME-UNIT

- `taskBoundary/kind/outcome/cost`：REALTIME / verification / 默认模板渲染精确过滤测试通过 / 中。
- `hardPredecessors`：REALTIME-EDIT；`consumes/produces`：prompt diff 与现有 test → 单份测试证据；`completionEvidence`：命令退出 0。
- `readSet/writeSet/stateEffects`：realtime prompt/source/test、Cargo inputs / `/Users/jiangsheng/cnb/codex-instruction-fidelity-realtime/codex-rs/target` 增量测试状态 / 测试输出；不改源码、snapshot、lockfile。
- `commandScope`：从 REALTIME worktree 根运行 `/opt/homebrew/bin/just test -p codex-core prepare_realtime_backend_prompt_renders_default`；禁止无过滤 `just test`、crate-wide lint 或 build/run。
- `executionContext/locks/owner`：REALTIME worktree / 与 REALTIME-INTEGRATION 共享上述绝对 target+runner write 锁 / UNIT 验证 owner；`verification`：nextest 精确 filter；`authorizationGate`：`AUTH-READ`。

#### REALTIME-INTEGRATION

- `taskBoundary/kind/outcome/cost`：REALTIME / verification / 会话消费默认模板的精确过滤测试通过 / 高。
- `hardPredecessors`：REALTIME-EDIT；`consumes/produces`：prompt diff 与现有 test → 单份测试证据；`completionEvidence`：命令退出 0。
- `readSet/writeSet/stateEffects`：realtime prompt/source/test、Cargo inputs / `/Users/jiangsheng/cnb/codex-instruction-fidelity-realtime/codex-rs/target` 增量测试状态 / 测试输出；不改源码、snapshot、lockfile。
- `commandScope`：从 REALTIME worktree 根运行 `/opt/homebrew/bin/just test -p codex-core conversation_uses_default_realtime_backend_prompt`；禁止无过滤 `just test`、crate-wide lint 或 build/run。
- `executionContext/locks/owner`：REALTIME worktree / 与 REALTIME-UNIT 共享上述绝对 target+runner write 锁 / INTEGRATION 验证 owner；`verification`：nextest 精确 filter；`authorizationGate`：`AUTH-READ`。

#### REALTIME-FMT

- `taskBoundary/kind/outcome/cost`：REALTIME / formatting / 项目固化格式化入口完成 / 中。
- `hardPredecessors`：REALTIME-UNIT+REALTIME-INTEGRATION；原因是项目要求 fmt 后不重跑测试。
- `consumes/produces`：已通过测试的 worktree → 格式化状态；`completionEvidence`：`just fmt` 退出 0。
- `readSet/writeSet/stateEffects`：format.py 管理范围 / formatter 可能管理的仓库文件 / 格式化副作用；预期本 Markdown 不被修改。
- `commandScope`：在 REALTIME worktree 的 `codex-rs` 目录运行 `/opt/homebrew/bin/just fmt`，不得改用底层格式化命令。
- `executionContext/locks/owner`：REALTIME worktree / formatter 与其管理文件 write / REALTIME 格式化 owner。
- `verification`：下一节点核对实际 diff；`authorizationGate`：`AUTH-WRITE`，仅允许固化 formatter 的固有范围。

#### REALTIME-VERIFY

- `taskBoundary/kind/outcome/cost`：REALTIME / verification / fmt 后最终 diff 仍只有 prompt / 低。
- `hardPredecessors`：REALTIME-FMT；`consumes/produces`：格式化后 worktree → 最终 allowlist 证据；`completionEvidence`：`git diff --check` 通过且 name-only 仅 prompt。
- `readSet/writeSet/stateEffects`：worktree diff / 无 / 只读结果。
- `commandScope`：`git diff --check`、`git diff --name-only`、prompt diff；禁止 fix。若 formatter 产生范围外 diff，停止并重编图，不自行恢复或顺手提交。
- `executionContext/locks/owner`：REALTIME worktree / diff read / REALTIME 验证 owner；`verification`：allowlist；`authorizationGate`：`AUTH-READ`。

#### REALTIME-STAGE

- `taskBoundary/kind/outcome/cost`：REALTIME / stage / index 中只有 prompt 文件 / 低。
- `hardPredecessors`：REALTIME-VERIFY；`consumes/produces`：已验证 diff → staged snapshot；`completionEvidence`：cached allowlist/check/diff 通过。
- `readSet/writeSet/stateEffects`：prompt diff / REALTIME index / 只 stage prompt。
- `commandScope`：`git add -- codex-rs/prompts/templates/realtime/backend_prompt.md`、cached check/name/diff；`executionContext/locks/owner`：REALTIME worktree / REALTIME index write / REALTIME Git owner。
- `verification`：staged allowlist；`authorizationGate`：`AUTH-STAGE`。

#### REALTIME-COMMIT

- `taskBoundary/kind/outcome/cost`：REALTIME / commit / 创建一个独立 REALTIME 提交 / 低。
- `hardPredecessors`：REALTIME-STAGE；`consumes/produces`：staged snapshot → REALTIME commit id；`completionEvidence`：commit tree 与 snapshot 精确一致。
- `readSet/writeSet/stateEffects`：REALTIME index / REALTIME branch ref 与 index / 一个本地提交。
- `commandScope`：`git commit -m 'prompts: preserve realtime delegation fidelity'`、`git show --stat --oneline HEAD`；`executionContext/locks/owner`：REALTIME worktree / index+branch ref write / REALTIME Git owner。
- `verification`：commit allowlist；`authorizationGate`：`AUTH-COMMIT`。

### 集成、安装、live 验收与清理

#### MERGE-SKILL

- `taskBoundary/kind/outcome/cost`：SKILL integration / integration / config `main` fast-forward 到 SKILL commit / 低。
- `hardPredecessors`：SKILL-COMMIT；`consumes/produces`：SKILL commit+干净 main → main 含 SKILL；`completionEvidence`：`git merge-base --is-ancestor main <branch>` 后 `--ff-only` 成功。
- `readSet/writeSet/stateEffects`：main/skill refs、规范 index / main ref+working tree / 本地 fast-forward。
- `commandScope`：规范 config checkout status/diff-check/ancestry；`git merge --ff-only codex/instruction-fidelity-skill`；show/status。
- `executionContext/locks/owner`：config 规范 checkout / main index+ref write / config integration owner；`verification`：commit ancestry 与 clean status；`authorizationGate`：`AUTH-INTEGRATE`。

#### INSTALL-SKILL

- `taskBoundary/kind/outcome/cost`：SKILL installation / integration / live 新 skill symlink 指向规范 checkout / 低。
- `hardPredecessors`：MERGE-SKILL+GLOBAL-APPROVAL；`consumes/produces`：规范 config main、installer 与覆盖其完整 managed-target 集合的 approval id → `~/.codex/skills/instruction-fidelity` link；`completionEvidence`：正常路径下既有 managed targets 不变，新 link `-ef` 规范 skill；若发生已授权的 backup-and-relink，则逐目标记录、核对 backup 与新 link，不继续 GLOBAL 集成，先重编图。
- `readSet/writeSet/stateEffects`：规范 `install.zsh`、脚本枚举出的全部 managed sources/targets / 完整 managed-target 集合 / 正常预期为 `mkdir -p` 与新增 skill symlink；脚本固有最坏副作用是先把不匹配 target 重命名为时间戳 backup，再建立指向规范 source 的 symlink。
- `commandScope`：紧邻执行前重新枚举 installer 的全部 source/target；证明 `AGENTS.md`、`config.toml`、`.agents` 与每个既有 skill target 都是 symlink 且分别 `-ef` 规范 source，并证明新 target 同时 `! -e` 与 `! -L`；保存逐项证据后，只从 `/Users/jiangsheng/cnb/codex-config` 运行 `/Users/jiangsheng/cnb/codex-config/install.zsh`；随后逐项 readlink/`test -ef`。禁止从 worktree 运行。外部预检只降低漂移概率，不宣称原子阻止脚本 backup。
- `executionContext/locks/owner`：config 规范 checkout / `~/.codex` managed links write / installer owner。
- `verification`：正常输出只有既有 skip 与一个新 link；任何 backup 行为都在脚本完成当前 target 后停止后续图、保留恢复证据并重编，不描述为执行前保护；`authorizationGate`：`AUTH-GLOBAL` 与 `AUTH-INTEGRATE` 的交集。

#### MERGE-GLOBAL

- `taskBoundary/kind/outcome/cost`：GLOBAL integration / integration / GLOBAL commit 合并入已含 SKILL 的 config main / 低。
- `hardPredecessors`：GLOBAL-COMMIT+INSTALL-SKILL；后者保证 live route 生效前 skill 已安装。
- `consumes/produces`：GLOBAL commit、已安装 skill、干净 main → main 含 GLOBAL 的本地 merge；`completionEvidence`：merge 成功、AGENTS 精确、main 干净、live alias 内容更新。
- `readSet/writeSet/stateEffects`：main/global refs、规范 index、live AGENTS inode / main ref+working tree并通过 symlink改变 live内容 / 一个本地非 ff merge commit。
- `commandScope`：status/diff-check、确认 GLOBAL branch 只含 AGENTS task commit；`git merge --no-edit codex/instruction-fidelity-global`；show/status、live alias `test -ef` 与内容核对；冲突时停止，不解决。
- `executionContext/locks/owner`：config 规范 checkout / main index+ref+protected live inode write / config integration owner。
- `verification`：GLOBAL task commit 保留、merge tree 精确；`authorizationGate`：`AUTH-GLOBAL` 收紧为 integration。

#### MERGE-REALTIME

- `taskBoundary/kind/outcome/cost`：REALTIME integration / integration / dev fast-forward 到 REALTIME commit / 低。
- `hardPredecessors`：REALTIME-COMMIT；`consumes/produces`：REALTIME commit+干净 dev → dev 含 prompt；`completionEvidence`：dev 是 branch ancestor，`--ff-only` 成功。
- `readSet/writeSet/stateEffects`：dev/realtime refs、主 index / dev ref+working tree / 本地 fast-forward。
- `commandScope`：规范 codex status/diff-check/ancestry；`git merge --ff-only codex/instruction-fidelity-realtime`；show/status。
- `executionContext/locks/owner`：codex 规范 checkout / dev index+ref write / codex integration owner；`verification`：commit ancestry 与 clean status；`authorizationGate`：`AUTH-INTEGRATE`。

#### LIVE-PREFLIGHT

- `taskBoundary/kind/outcome/cost`：live 验收 / verification / 固定本次唯一 CLI identity 与 runtime 写集合 / 低。
- `hardPredecessors`：MERGE-GLOBAL；`consumes/produces`：live AGENTS/skill 与固定 App bundled CLI → executable identity/version、runtime roots 与三条场景输入；`completionEvidence`：绝对 executable 存在且版本仍为 `codex-cli 0.150.0-alpha.8`，live links 正确，状态目录可精确解析。
- `readSet/writeSet/stateEffects`：`/Applications/ChatGPT.app/Contents/Resources/codex`、live config/skills、环境与配置 / 无 / 只读证据。
- `commandScope`：只读核对上述绝对 executable、`--version`、live links 及实际 Codex home/state/log/cache 路径；若 executable identity、版本或 runtime roots 漂移则停止并重编，不回退到裸 `codex`、fnm multishell 临时路径或其他候选。
- `executionContext/locks/owner`：主协调 / live config 与 runtime metadata read / live preflight owner；`verification`：证据完整；`authorizationGate`：`AUTH-READ`。

三个 case 共同把 LIVE-PREFLIGHT 解析出的 SQLite runtime DB、日志、telemetry、cache 等可变状态纳入 `writeSet/stateEffects`，共享同一 canonical runtime-state write 锁。`--ephemeral` 只表示不保留 thread，不表示无本地写入。每个 case 只进行一次外部推理；每个 cleanup 只删除该 case 返回的单一空目录，不删除 runtime 状态。

#### LIVE-CASE-1

- `taskBoundary/kind/outcome/cost`：live case 1 / verification / 保持“未重构范围”与“排除覆盖率” / 高。
- `hardPredecessors`：LIVE-PREFLIGHT；`consumes/produces`：live prompt/skill+场景 1 → 行为证据与精确 temp path；`completionEvidence`：对象、范围和否定保持且未执行动作。
- `readSet/writeSet/stateEffects`：live prompt/skill、场景 1 / temp path+canonical runtime state / 临时目录、runtime DB/log/cache、模型 token 与网络请求。
- `commandScope`：`mktemp` 后用固定 CLI 执行一次只读 ephemeral exec；prompt 精确为 `不要执行任何操作。把下面要求压缩成一句话，然后列出不能改变的限制：评估未重构测试代码中的重复；不要评估重构后的覆盖率。`。
- `executionContext/locks/owner`：case 1 temp root / canonical runtime-state write / case 1 owner；`verification`：主协调比对锚点；`authorizationGate`：`AUTH-INTEGRATE`。

#### LIVE-CASE-1-CLEAN

- `taskBoundary/kind/outcome/cost`：live case 1 / cleanup / 删除 case 1 空 temp path / 低。
- `hardPredecessors`：LIVE-CASE-1，验收失败也执行资源回收；`consumes/produces`：case 1 canonical temp path → 路径不存在证据；`completionEvidence`：目录为空、非 symlink、`rmdir` 成功。
- `readSet/writeSet/stateEffects`：单一 temp path / 同一路径 / 删除空目录。
- `commandScope`：核对前缀、目录、非 symlink、为空后执行 `/bin/rmdir -- <exact-case-1-dir>`；禁止递归删除、变量泛化或 glob。
- `executionContext/locks/owner`：主协调 / case 1 temp path write / case 1 cleanup owner；`verification`：`! -e` 且 `! -L`；`authorizationGate`：`AUTH-INTEGRATE`。

#### LIVE-CASE-2

- `taskBoundary/kind/outcome/cost`：live case 2 / verification / 逐字保持 `j c` 两个 shell token / 高。
- `hardPredecessors`：LIVE-CASE-1-CLEAN，仅为共享锁与临时资源回收顺序；`consumes/produces`：live prompt/skill+场景 2 → 行为证据与精确 temp path；`completionEvidence`：字面量及 token 数量保持且未执行动作。
- `readSet/writeSet/stateEffects`：live prompt/skill、场景 2 / temp path+canonical runtime state / 临时目录、runtime DB/log/cache、模型 token 与网络请求。
- `commandScope`：`mktemp` 后用固定 CLI 执行一次只读 ephemeral exec；prompt 精确为 `不要执行。原样复述这条命令，并说明 shell token 数量：j c`。
- `executionContext/locks/owner`：case 2 temp root / canonical runtime-state write / case 2 owner；`verification`：主协调比对锚点；`authorizationGate`：`AUTH-INTEGRATE`。

#### LIVE-CASE-2-CLEAN

- `taskBoundary/kind/outcome/cost`：live case 2 / cleanup / 删除 case 2 空 temp path / 低。
- `hardPredecessors`：LIVE-CASE-2，验收失败也执行资源回收；`consumes/produces`：case 2 canonical temp path → 路径不存在证据；`completionEvidence`：目录为空、非 symlink、`rmdir` 成功。
- `readSet/writeSet/stateEffects`：单一 temp path / 同一路径 / 删除空目录。
- `commandScope`：核对前缀、目录、非 symlink、为空后执行 `/bin/rmdir -- <exact-case-2-dir>`；禁止递归删除、变量泛化或 glob。
- `executionContext/locks/owner`：主协调 / case 2 temp path write / case 2 cleanup owner；`verification`：`! -e` 且 `! -L`；`authorizationGate`：`AUTH-INTEGRATE`。

#### LIVE-CASE-3

- `taskBoundary/kind/outcome/cost`：live case 3 / verification / 保持美元价格、阈值包含关系和 credits 排除项 / 高。
- `hardPredecessors`：LIVE-CASE-2-CLEAN，仅为共享锁与临时资源回收顺序；`consumes/produces`：live prompt/skill+场景 3 → 行为证据与精确 temp path；`completionEvidence`：全部锚点保持且未执行动作。
- `readSet/writeSet/stateEffects`：live prompt/skill、场景 3 / temp path+canonical runtime state / 临时目录、runtime DB/log/cache、模型 token 与网络请求。
- `commandScope`：`mktemp` 后用固定 CLI 执行一次只读 ephemeral exec；prompt 精确为 `不要执行。使用 $instruction-fidelity 简洁转述：只看非折扣美元价格，评分 9 分以上，10 分必须保留；不要使用 credits。`。
- `executionContext/locks/owner`：case 3 temp root / canonical runtime-state write / case 3 owner；`verification`：主协调比对锚点；`authorizationGate`：`AUTH-INTEGRATE`。

#### LIVE-CASE-3-CLEAN

- `taskBoundary/kind/outcome/cost`：live case 3 / cleanup / 删除 case 3 空 temp path / 低。
- `hardPredecessors`：LIVE-CASE-3，验收失败也执行资源回收；`consumes/produces`：case 3 canonical temp path → 路径不存在证据；`completionEvidence`：目录为空、非 symlink、`rmdir` 成功。
- `readSet/writeSet/stateEffects`：单一 temp path / 同一路径 / 删除空目录。
- `commandScope`：核对前缀、目录、非 symlink、为空后执行 `/bin/rmdir -- <exact-case-3-dir>`；禁止递归删除、变量泛化或 glob。
- `executionContext/locks/owner`：主协调 / case 3 temp path write / case 3 cleanup owner；`verification`：`! -e` 且 `! -L`；`authorizationGate`：`AUTH-INTEGRATE`。

#### CLEANUP-SKILL-WT

- `taskBoundary/kind/outcome/cost`：SKILL 资源回收 / integration / 非 force 删除已合并 SKILL worktree 与 branch / 低。
- `hardPredecessors`：MERGE-GLOBAL+LIVE-CASE-3-CLEAN；等待 live 验收结束以保留计划内修正现场。
- `consumes/produces`：已合并、干净、未占用 SKILL worktree → 删除其 metadata/path/ref；`completionEvidence`：ancestry、status、lsof 安全，worktree/branch 不再存在。
- `readSet/writeSet/stateEffects`：SKILL worktree/branch / config common git-dir metadata、SKILL path/ref / 删除可由 Git commit 恢复的单一 worktree 与已合并 branch。
- `commandScope`：仅对 SKILL 目标执行 status、diff-check、ancestry、lsof；安全后执行 `git worktree remove /Users/jiangsheng/cnb/codex-config-instruction-fidelity-skill` 与 `git branch -d codex/instruction-fidelity-skill`；禁止 force、递归删除或其他 cleanup。
- `executionContext/locks/owner`：config 规范 checkout / config common git-dir metadata+SKILL ref/path write / SKILL cleanup owner；`verification`：worktree list、show-ref、main status；`authorizationGate`：`AUTH-INTEGRATE`。

#### CLEANUP-GLOBAL-WT

- `taskBoundary/kind/outcome/cost`：GLOBAL 资源回收 / integration / 非 force 删除已合并 GLOBAL worktree 与 branch / 低。
- `hardPredecessors`：MERGE-GLOBAL+LIVE-CASE-3-CLEAN；等待 live 验收结束以保留计划内修正现场。
- `consumes/produces`：已合并、干净、未占用 GLOBAL worktree → 删除其 metadata/path/ref；`completionEvidence`：ancestry、status、lsof 安全，worktree/branch 不再存在。
- `readSet/writeSet/stateEffects`：GLOBAL worktree/branch / config common git-dir metadata、GLOBAL path/ref / 删除可由 Git commit 恢复的单一 worktree 与已合并 branch。
- `commandScope`：仅对 GLOBAL 目标执行 status、diff-check、ancestry、lsof；安全后执行 `git worktree remove /Users/jiangsheng/cnb/codex-config-instruction-fidelity-global` 与 `git branch -d codex/instruction-fidelity-global`；禁止 force、递归删除或其他 cleanup。
- `executionContext/locks/owner`：config 规范 checkout / 与 CLEANUP-SKILL-WT 共享 config common git-dir metadata write 锁，另有 GLOBAL ref/path / GLOBAL cleanup owner；`verification`：worktree list、show-ref、main status；`authorizationGate`：`AUTH-GLOBAL` 与 `AUTH-INTEGRATE` 的交集。

#### CLEANUP-REALTIME

- `taskBoundary/kind/outcome/cost`：REALTIME 资源回收 / integration / 非 force 删除已合并 REALTIME worktree 与 branch / 低。
- `hardPredecessors`：MERGE-REALTIME；`consumes/produces`：已合并、干净、未占用 REALTIME worktree → 删除其 metadata/path/ref；`completionEvidence`：ancestry、status、lsof 安全，worktree/branch 不再存在。
- `readSet/writeSet/stateEffects`：REALTIME worktree/branch / codex common git-dir metadata、REALTIME path/ref / 删除可由 Git commit 恢复的单一 worktree 与已合并 branch。
- `commandScope`：仅对 REALTIME 目标执行 status、diff-check、ancestry、lsof；安全后执行 `git worktree remove /Users/jiangsheng/cnb/codex-instruction-fidelity-realtime` 与 `git branch -d codex/instruction-fidelity-realtime`；禁止 force、递归删除或其他 cleanup。
- `executionContext/locks/owner`：codex 规范 checkout / codex common git-dir metadata+REALTIME ref/path write / REALTIME cleanup owner；`verification`：worktree list、show-ref、dev status；`authorizationGate`：`AUTH-INTEGRATE`。

#### FINAL-VERIFY

- `taskBoundary/kind/outcome/cost`：全图 fan-in / verification / 两仓库与 live 映射满足设计且工作区干净 / 中。
- `hardPredecessors`：LIVE-CASE-3-CLEAN+CLEANUP-SKILL-WT+CLEANUP-GLOBAL-WT+CLEANUP-REALTIME；`consumes/produces`：所有 task commits、merge/install/验收/cleanup 证据 → 最终完成证据。
- `readSet/writeSet/stateEffects`：两规范 checkout、live AGENTS/skill links、提交图 / 无 / 只读汇总。
- `commandScope`：两仓库 status、`git diff --check`、log/show/ancestry；readlink/test -ef；精确读取 GLOBAL、SKILL、REALTIME 最终文件；禁止测试重跑、编辑、stage、commit、remote。
- `executionContext/locks/owner`：主协调只读 / 两仓库与 live links read / final owner。
- `verification`：三任务 commit 均存在且文件范围精确；配置 main 含 skill 与 global，dev 含 docs 与 realtime；live symlink 正确；issue 未改；关联现有 worktrees未动。
- `authorizationGate`：`AUTH-READ`。

## 任务提交与集成拓扑

```text
codex/dev:
  DOC commit ── REALTIME task commit（独立 branch）──ff-only──> dev

codex-config/main:
  base ──ff-only SKILL task commit── installer 新增 live skill link
       └─ GLOBAL task commit（独立 sibling branch）
                └─ non-ff local merge into skill-updated main
```

GLOBAL 的 merge commit 是本地集成边界，不替代或压缩 GLOBAL task commit。禁止 rebase、cherry-pick、squash 或 amend 来美化拓扑。

## 漏并行反向审计

- DOC 提交是所有实施的真实硬前置，因为全局规则要求相关工作文档先独立提交。
- GLOBAL approval 只阻塞 protected target 分支；SKILL 与 REALTIME 不消费该 approval，可继续。
- SKILL、GLOBAL、REALTIME 不互相消费实现产物，必须在独立 worktree 中并行编辑和验证。
- 两个 realtime 测试无产物依赖；串行只来自同一 Cargo target/runner 的动态资源锁。锁释放后另一个立即运行。
- GLOBAL 集成等待 INSTALL-SKILL 是真实可用性依赖：避免 live AGENTS 路由到尚未安装的 skill。
- installer 等待 MERGE-SKILL 是真实路径依赖：脚本必须从规范 checkout 枚举已合并 skill，禁止从临时 worktree运行。
- 最终验收只等待其真实输入。REALTIME cleanup 在其本地集成后可独立运行；两个 config cleanup 必须等 live 三场景及各自临时目录清理完成，再以共享 metadata 锁动态串行。

## 失败与重编图边界

- worktree/branch/path/base 冲突：只暂停对应分支及后继，不覆盖或清理冲突目标。
- GLOBAL 专门确认被拒绝：GLOBAL 与 FINAL 暂停；SKILL、REALTIME 可完成各自任务，但不得把总体计划标为完成。
- skill validator/forward review 失败：在 SKILL 原 writeSet 内插入独立修正节点并重新运行失效验证；不修改其他 skills。
- realtime 精确测试失败：只修正本次 prompt 变更直接引入且仍在计划范围内的问题；预存或无关失败只汇报。
- formatter 产生 prompt 之外的 diff：停止 REALTIME 后继并重编图，不顺手提交、恢复或修复范围外文件。
- installer 预检发现任何既有 target 不是指向规范 source 的 symlink，或新 target 已存在（包括失效 symlink）：停止 INSTALL 及 GLOBAL 集成，不执行 installer。若预检后状态漂移导致脚本实际执行已专门授权的 backup-and-relink，则脚本完成当前 target 后停止后续图、保留 backup 与新 link，不自动恢复，重新核验并请求方向。
- merge 发生冲突、base 漂移或不能 ff-only：停止对应集成，不自动 rebase、cherry-pick 或解决冲突。
- live forward 场景失败：记录精确输入与漂移，不把提示词概率性失败扩成工具修改；若修正需要改变设计边界，回到设计确认。

## 明确排除范围

- 不修改 `codex-gui/**`、realtime prompt 选择逻辑、request/config override、协议、schema、生成物或 Bazel 配置；
- 不修改 `action-authorization`、`managing-work-stages`、`grilling`、`enhanced-message-context` 或其他现有 skills；
- 不新增 runtime validator、shell token enforcement、capability enforcement、兼容层、adapter、双写或 fallback；
- 不新增只匹配静态提示词文案的 Rust 测试，不运行 crate/workspace 全量测试或 lint；
- 不更新关联 issue，不修改其他 docs，不操作 Git 远程；
- 不清理、移动或修改既有 action-authorization worktrees/branches；
- 不安装任何程序、依赖、运行时或浏览器；`uv run --no-project --with pyyaml` 仅使用规则允许的临时隔离依赖环境。

## 计划确认门禁

计划落盘不等于计划确认。只有用户明确确认本计划后，才能从 `DOC-STAGE` 开始执行；不改变 workspace 的 `GLOBAL-APPROVAL` 可同时发起。计划确认不替代 `GLOBAL-APPROVAL`；在用户再次针对本文三条精确全局文本和 canonical installer 完整 managed-target 副作用明确回复“确认写入”之前，任何代理都不得编辑、暂存、提交或集成会改变 `~/.codex/AGENTS.md` 实际内容的变更，也不得运行 installer。
