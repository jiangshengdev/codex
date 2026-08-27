# 项目与全局 Skill 语义去重实施计划

日期：2026-08-27

状态：计划已落盘，待确认

设计依据：`docs/superpowers/specs/2026/08/27/2026-08-27-project-global-skill-semantic-deduplication-design.md`

设计确认原文：`确认，计划落盘`

## 目标与保证边界

实施已确认设计：只处理两个已确认邮箱提交的项目与全局 skill 内容，保持现有 skill 名称、入口、metadata 触发范围和有效行为，以唯一 canonical owner 承载详细规则，消费者只保留触发路由、领域增量与停止条件。

本计划只修改 Markdown skill 指令和一个新的非触发型 reference。它不修改 `AGENTS.md`、产品代码、协议、schema、脚本行为、skill metadata、Redux 在线刷新模式、非本人 skill 或 Git 远程状态，也不安装任何程序或依赖。

## 当前基线与授权边界

- Codex 仓库：`/Users/jiangsheng/cnb/codex`，`dev@7ae48eb24bf1e0e4d88a67b49110af8aa63e49cf`；当前只有设计与计划两份工作文档未跟踪。
- codex-config 仓库：`/Users/jiangsheng/cnb/codex-config`，`main@722ccef6b5dd0e96a111a8dfe2ded32bc616c44c`；工作树干净。
- 全局手工 skills 的逻辑入口 `/Users/jiangsheng/.codex/skills/<name>` 是指向 `/Users/jiangsheng/cnb/codex-config/skills/<name>` 的直接符号链接；不运行 `install.zsh` 或其他安装入口。
- `/opt/homebrew/bin/uv` 与 `/Users/jiangsheng/.codex/skills/.system/skill-creator/scripts/quick_validate.py` 已只读核验存在。
- 计划确认将授权本文精确列出的纯文档提交、两个 worktree、两个实现提交、固定验证、两个本地 fast-forward 集成与非 force 清理；不授权 force、amend、squash、远程、安装或范围外修复。
- 计划确认后的第一项有状态操作只能是工作文档 stage。文档提交成功前，禁止创建 worktree 或实施任何 skill 修改。

## Task boundary 与提交拓扑

### TB-DOC：设计与计划文档

提交消息：`docs: design project and global skill deduplication`

只包含：

- `docs/superpowers/specs/2026/08/27/2026-08-27-project-global-skill-semantic-deduplication-design.md`
- `docs/superpowers/plans/2026/08/27/2026-08-27-project-global-skill-semantic-deduplication-plan.md`

### TB-PROJECT：项目 skill owner 收敛

提交消息：`skills: centralize project skill ownership`

只修改：

- `.codex/skills/codex-gui-toolchain/SKILL.md`
- `.codex/skills/codex-gui-toolchain/references/local-frontend-dependency-docs.md`（新建非触发型 reference）
- `.codex/skills/codex-gui-worktree/SKILL.md`
- `.codex/skills/codex-rust-verification/SKILL.md`
- `.codex/skills/debug-responsive-gui/SKILL.md`
- `.codex/skills/heroui-react/SKILL.md`
- `.codex/skills/redux-toolkit/SKILL.md`
- `.codex/skills/vitest-react-browser-docs/SKILL.md`

`gui-launch` 与 `release-promotion` 只作为行为不变参照，不修改。所有 `agents/openai.yaml`、scripts、tests 与本地文档缓存保持不变。

### TB-GLOBAL：全局 skill owner 收敛

提交消息：`skills: centralize global skill ownership`

只修改：

- `skills/action-authorization/SKILL.md`
- `skills/action-authorization/references/action-families.md`
- `skills/action-authorization/references/authorization-record.md`
- `skills/managing-work-stages/SKILL.md`
- `skills/delegating-micro-stages/SKILL.md`
- `skills/delegating-micro-stages/references/execution-graph.md`
- `skills/project-doc-workflow/SKILL.md`
- `skills/codex-issue-doc-workflow/SKILL.md`
- `skills/reverting-git-commits/SKILL.md`

`capability-envelope.md` 已是能力信封详细 owner，本轮只由消费者收缩到引用，不修改该 owner。`instruction-fidelity`、`evaluating-engineering-constraints`、`node-imagegen` 与 `resolve-idea-simple-conflicts` 保持不变。

## 修改契约

### 项目 skill

- `codex-gui-toolchain` 继续唯一拥有 fnm/Node/pnpm、live `package.json`、脚本存在性与前端目标命中；新增共享 reference 承载离线依赖文档的通用导航流程。
- `codex-gui-worktree` 保留脚本参数、canonical path、symlink、披露、冲突、sparse layout 与验证；授权来源和旧计划更新改为消费 `action-authorization`。
- `codex-rust-verification` 保留 Rust Hard Limits 与领域命令；实时入口等通用预检改为路由到 execution-environment-preflight owner。
- `debug-responsive-gui` 保留 502/监听器判断、前台 Vite 会话和真实 GUI 验收；当前前端启动命令路由到 toolchain。
- HeroUI、Redux 与 Vitest 保留各自 docs root、搜索词和领域规则；共享离线导航改读新 reference，裸写的通用前端命令改为消费 toolchain。
- Redux 的 offline/`gh api` 更新冲突保持原状；不删除、改写或运行更新脚本。

### 全局 skill

- `action-authorization` 唯一拥有委派与 worktree 授权来源、动作族、目标、副作用和旧状态更新；明确区分用户直接要求、用户自有规则中的显式 standing authorization 与普通 skill trigger。
- `managing-work-stages` 只保留阶段、落盘、准备模式、worktree 阶段例外和计划结构，不复制动作族、能力信封、worktree 算法或文档路径规则。
- `delegating-micro-stages` 只保留何时委派、微阶段、调度入口、返回审计与中央能力信封路由；execution-graph reference 只保留 `authorizationGate` 的调度映射，不重建授权字段 owner。
- `execution-graph.md` 继续唯一拥有 DAG 节点、ready set、锁、fan-in、失败域和终态证据；消费者只保留必要触发契约。
- `project-doc-workflow` 唯一拥有通用日期目录与历史保留；只消费阶段授权。`codex-issue-doc-workflow` 保留 issue 专属名称、split index、状态和布局。
- “提交已有变更”的动作边界归 `action-families.md`；`managing-work-stages` 只保留免于重新设计/计划的阶段例外。
- `reverting-git-commits` 内部把默认策略、反向顺序、明确合并例外、冲突停止和远程边界各保留一个规范段；流程与完成检查不再全文复写。

## Worktree 精确动作

TB-DOC 提交成功后，同时创建两个 worktree。

项目 worktree：

```bash
git -C /Users/jiangsheng/cnb/codex worktree add -b codex/project-skill-dedup /Users/jiangsheng/cnb/codex-project-skill-dedup dev
```

执行前重新核验：`dev` 正好指向 TB-DOC commit，规范 checkout 干净；branch 不存在；目标路径同时不存在且不是 symlink。任一条件漂移即停止，不覆盖现有资源。

全局 worktree：

```bash
git -C /Users/jiangsheng/cnb/codex-config worktree add -b codex/global-skill-dedup /Users/jiangsheng/cnb/codex-config-skill-dedup 722ccef6b5dd0e96a111a8dfe2ded32bc616c44c
```

执行前重新核验：`main` 仍为该 commit 且规范 checkout 干净；branch 不存在；目标路径同时不存在且不是 symlink。任一条件漂移即停止。

两个 worktree、branch 和 Git index 相互独立；TB-PROJECT 与 TB-GLOBAL 不互相等待。

## 固定结构验证命令

所有命令使用临时隔离的 PyYAML，不改用 `python`、`python3`、`pip` 或安装命令。项目 worktree 中逐一运行：

```bash
uv run --no-project --with pyyaml python /Users/jiangsheng/.codex/skills/.system/skill-creator/scripts/quick_validate.py /Users/jiangsheng/cnb/codex-project-skill-dedup/.codex/skills/codex-gui-toolchain
uv run --no-project --with pyyaml python /Users/jiangsheng/.codex/skills/.system/skill-creator/scripts/quick_validate.py /Users/jiangsheng/cnb/codex-project-skill-dedup/.codex/skills/codex-gui-worktree
uv run --no-project --with pyyaml python /Users/jiangsheng/.codex/skills/.system/skill-creator/scripts/quick_validate.py /Users/jiangsheng/cnb/codex-project-skill-dedup/.codex/skills/codex-rust-verification
uv run --no-project --with pyyaml python /Users/jiangsheng/.codex/skills/.system/skill-creator/scripts/quick_validate.py /Users/jiangsheng/cnb/codex-project-skill-dedup/.codex/skills/debug-responsive-gui
uv run --no-project --with pyyaml python /Users/jiangsheng/.codex/skills/.system/skill-creator/scripts/quick_validate.py /Users/jiangsheng/cnb/codex-project-skill-dedup/.codex/skills/heroui-react
uv run --no-project --with pyyaml python /Users/jiangsheng/.codex/skills/.system/skill-creator/scripts/quick_validate.py /Users/jiangsheng/cnb/codex-project-skill-dedup/.codex/skills/redux-toolkit
uv run --no-project --with pyyaml python /Users/jiangsheng/.codex/skills/.system/skill-creator/scripts/quick_validate.py /Users/jiangsheng/cnb/codex-project-skill-dedup/.codex/skills/vitest-react-browser-docs
```

全局 worktree 中逐一运行：

```bash
uv run --no-project --with pyyaml python /Users/jiangsheng/.codex/skills/.system/skill-creator/scripts/quick_validate.py /Users/jiangsheng/cnb/codex-config-skill-dedup/skills/action-authorization
uv run --no-project --with pyyaml python /Users/jiangsheng/.codex/skills/.system/skill-creator/scripts/quick_validate.py /Users/jiangsheng/cnb/codex-config-skill-dedup/skills/managing-work-stages
uv run --no-project --with pyyaml python /Users/jiangsheng/.codex/skills/.system/skill-creator/scripts/quick_validate.py /Users/jiangsheng/cnb/codex-config-skill-dedup/skills/delegating-micro-stages
uv run --no-project --with pyyaml python /Users/jiangsheng/.codex/skills/.system/skill-creator/scripts/quick_validate.py /Users/jiangsheng/cnb/codex-config-skill-dedup/skills/project-doc-workflow
uv run --no-project --with pyyaml python /Users/jiangsheng/.codex/skills/.system/skill-creator/scripts/quick_validate.py /Users/jiangsheng/cnb/codex-config-skill-dedup/skills/codex-issue-doc-workflow
uv run --no-project --with pyyaml python /Users/jiangsheng/.codex/skills/.system/skill-creator/scripts/quick_validate.py /Users/jiangsheng/cnb/codex-config-skill-dedup/skills/reverting-git-commits
```

任一命令失败即停止对应 task 及后继，不改用会修改系统或项目环境的替代方案。

## 静态与行为验收

### 引用与 owner 静态审计

- 逐一确认所有新增或保留的 relative reference、脚本和本地 docs root 可达。
- 搜索授权、能力信封、执行图、环境预检、文档命名、提交已有变更、pnpm 与 revert 关键词；详细判断只能存在于设计指定 owner，消费者只能保留短路由和领域增量。
- 两个 worktree 分别执行 scoped `git diff --check` 与 name-only allowlist；新 reference 使用 `git diff --no-index --check /dev/null <file>` 检查。
- 静态搜索只用于定位和 owner 审计，不能用字数或匹配次数作为行为等价证明。

### 独立合成案例

项目案例：HeroUI、Redux、Vitest Browser Mode、可见 GUI 调试、直接准备 codex-gui worktree、Rust 窄验证。验证领域 skill 与 toolchain 组合、离线 docs、真实入口、披露次数、禁止裸 pnpm、禁止宽 Rust 命令和真实 GUI 验收边界保持不变。

全局案例：复杂只读审计必须委派、简单单问题不强制委派、执行落盘计划与普通设计的执行图区分、设计落盘、Codex issue 更新、提交已有变更、两个提交的本地回退。验证授权来源、只读能力信封、阶段、文档路径、确认次数、反向回退顺序和无远程边界保持不变。

每个案例节点只获得合成请求、修改后 skill 路径和“不得产生真实写入/外部副作用”的限制，不提供预期答案。独立 oracle 节点在两个实现提交形成后对照设计验收向量审查结果。

成功条件：13 个 quick_validate 全部成功；引用全部可达；owner 无循环或第二详细定义；所有合成案例的入口、否定条件、确认次数、停止条件和副作用边界与设计一致；两个仓库 diff 只含 allowlist。

## Stage、commit、集成与清理命令

### TB-DOC

```bash
git -C /Users/jiangsheng/cnb/codex add -- docs/superpowers/specs/2026/08/27/2026-08-27-project-global-skill-semantic-deduplication-design.md docs/superpowers/plans/2026/08/27/2026-08-27-project-global-skill-semantic-deduplication-plan.md
git -C /Users/jiangsheng/cnb/codex commit -m 'docs: design project and global skill deduplication'
```

### TB-PROJECT

```bash
git -C /Users/jiangsheng/cnb/codex-project-skill-dedup add -- .codex/skills/codex-gui-toolchain/SKILL.md .codex/skills/codex-gui-toolchain/references/local-frontend-dependency-docs.md .codex/skills/codex-gui-worktree/SKILL.md .codex/skills/codex-rust-verification/SKILL.md .codex/skills/debug-responsive-gui/SKILL.md .codex/skills/heroui-react/SKILL.md .codex/skills/redux-toolkit/SKILL.md .codex/skills/vitest-react-browser-docs/SKILL.md
git -C /Users/jiangsheng/cnb/codex-project-skill-dedup commit -m 'skills: centralize project skill ownership'
```

### TB-GLOBAL

```bash
git -C /Users/jiangsheng/cnb/codex-config-skill-dedup add -- skills/action-authorization/SKILL.md skills/action-authorization/references/action-families.md skills/action-authorization/references/authorization-record.md skills/managing-work-stages/SKILL.md skills/delegating-micro-stages/SKILL.md skills/delegating-micro-stages/references/execution-graph.md skills/project-doc-workflow/SKILL.md skills/codex-issue-doc-workflow/SKILL.md skills/reverting-git-commits/SKILL.md
git -C /Users/jiangsheng/cnb/codex-config-skill-dedup commit -m 'skills: centralize global skill ownership'
```

每个 stage 后必须检查 cached name-only、完整 cached diff 与 `git diff --cached --check`，确认精确 allowlist 后才 commit。禁止 amend 或把两个 task 合并。

跨仓库 oracle 通过后，两个集成节点并行执行：

```bash
git -C /Users/jiangsheng/cnb/codex merge --ff-only codex/project-skill-dedup
git -C /Users/jiangsheng/cnb/codex-config merge --ff-only codex/global-skill-dedup
```

仅当规范 checkout 仍分别指向 TB-DOC commit 与 `722ccef6b5dd0e96a111a8dfe2ded32bc616c44c`、工作树干净且不存在冲突时执行。任何漂移都停止，不自动 rebase、cherry-pick 或解决冲突。

最终 live symlink、提交祖先、工作树和 owner 审计通过后，并行非 force 清理：

```bash
git -C /Users/jiangsheng/cnb/codex worktree remove /Users/jiangsheng/cnb/codex-project-skill-dedup
git -C /Users/jiangsheng/cnb/codex branch -d codex/project-skill-dedup
git -C /Users/jiangsheng/cnb/codex-config worktree remove /Users/jiangsheng/cnb/codex-config-skill-dedup
git -C /Users/jiangsheng/cnb/codex-config branch -d codex/global-skill-dedup
```

## 描述式执行图

### Task boundary

- `TB-DOC`：`DOC-STAGE → DOC-COMMIT`，产生实施门禁 commit。
- `TB-PROJECT`：项目编辑节点 fan-out，组合验证 fan-in，随后独立 stage 与 commit。
- `TB-GLOBAL`：全局编辑节点 fan-out，组合验证 fan-in，随后独立 stage 与 commit。
- 合成案例、跨仓库 oracle、集成、live audit 与清理不创建新的实现提交。

### Initial ready set、fan-out/fan-in 与关键路径

计划确认后的 initial ready set 只有 `DOC-STAGE`。`DOC-COMMIT` 完成后，`WT-PROJECT` 与 `WT-GLOBAL` 同时 ready；两个 worktree 的作者/preflight 完成后，各自编辑分支立即 fan-out。项目与全局 task 不互相等待。

项目和全局实现提交同时完成后，项目行为案例与全局行为案例并行；跨仓库 oracle 等待二者。oracle 通过后两个本地 fast-forward 集成并行，最终 live audit fan-in，再并行清理两个 worktree。

计划期粗粒度关键路径预计为 `DOC → WT-GLOBAL → GLOBAL-EDIT → GLOBAL-VERIFY → GLOBAL-COMMIT → GLOBAL-CASES → ORACLE → GLOBAL-MERGE → LIVE-AUDIT`，因为全局 owner/消费者关系更多。该估计不构成项目分支等待理由；执行时按实际事件重新计算。

### 共享节点契约

下列字段适用于所有节点，并与每个节点记录共同构成完整节点声明：

- `deferralEvidence`：初始均为无；只有出现可核验并发负收益时才能按 execution-graph 契约形成。
- `subdelegation`：`false`。每个编辑、验证与行为案例节点由边界明确的子代理执行，不再下委派。
- `failureDomain`：本节点及传递后继；只有作者前提、共享状态、授权或安全边界失效时才扩大。
- `replanTriggers`：HEAD/status、作者归属、symlink identity、writeSet、引用路径、命令、行为或验证入口变化。
- `authorizationGate`：计划确认前均为 `pending`；确认后，DOC、worktree、edit、verify、stage、commit、merge、cleanup 分别只获得本文精确动作、目标、参数与副作用。`requiredApprovalIds=[]`；`owner` 不产生授权。
- `stateEffects`：只允许节点记录列出的工作树、index、branch、commit、merge 或 cleanup 影响；禁止安装、远程、force、amend、squash 和范围外写入。

### 节点记录

以下每项依次声明 `nodeId / taskBoundary / operationKind / outcome / estimatedCost / hardPredecessors / consumes / produces / completionEvidence / readSet / writeSet / commandScope / executionContext / resourceLocks / owner / verification`；未重复的控制字段由共享节点契约提供。

- `DOC-STAGE / TB-DOC / stage / index 只含两份工作文档 / 低 / 计划确认 / 两份未跟踪文档 / staged snapshot / cached allowlist 与 cached diff check / 两份文档、status / Codex 主 index / 本文 TB-DOC add 与 scoped cached 检查 / Codex dev 主 checkout / 主 index write / DOC Git owner / cached 内容完整且仅含 allowlist`。
- `DOC-COMMIT / TB-DOC / commit / 纯文档 commit / 低 / DOC-STAGE / staged snapshot / commit id / commit tree 与 snapshot 一致 / 主 index / dev ref、index / 本文 TB-DOC commit 与 scoped show/status / Codex dev 主 checkout / dev ref 与 index write / DOC Git owner / commit 仅含两份文档`。
- `WT-PROJECT / 无提交 / integration / 项目 branch、worktree、index / 低 / DOC-COMMIT / TB-DOC commit、路径预检 / worktree identity / HEAD、branch、status 精确 / dev ref、worktree metadata / 项目 branch/path/index / 本文项目 worktree add / Codex 规范 checkout / `.git` worktree metadata 与目标路径 write / 项目 Git owner / worktree 干净且 base 为 TB-DOC commit`。
- `WT-GLOBAL / 无提交 / integration / 全局 branch、worktree、index / 低 / DOC-COMMIT / config baseline、路径预检 / worktree identity / HEAD、branch、status 精确 / config main 与 worktree metadata / 全局 branch/path/index / 本文全局 worktree add / codex-config 规范 checkout / config `.git` metadata 与目标路径 write / 全局 Git owner / worktree 干净且 HEAD 为固定 base`。
- `PREFLIGHT-PROJECT / TB-PROJECT / investigation / 作者与 writeSet 再确认 / 低 / WT-PROJECT / 设计、Git config/log/blame、skill-creator / 稳定作者与范围证据 / 仅两个邮箱且无漂移 / 项目 allowlist 与历史 / 无 / 只读 Git、文件与工具存在性检查 / 项目 worktree / allowlist read / 项目 preflight owner / 9 个本人目录仍满足设计边界`。
- `PREFLIGHT-GLOBAL / TB-GLOBAL / investigation / 作者、symlink 与 writeSet 再确认 / 低 / WT-GLOBAL / 设计、Git config/log/blame、live symlink / 稳定 canonical 证据 / 10 个目录仅两个邮箱且链接未漂移 / 全局 allowlist、历史与 live links / 无 / 只读 Git、路径与工具检查 / 全局 worktree及 live links / allowlist read / 全局 preflight owner / canonical target 仍是规范 config repo`。
- `EDIT-PROJECT-OWNERS / TB-PROJECT / edit / 项目 owner 与消费者按设计收敛 / 中 / PREFLIGHT-PROJECT / 设计、项目 baseline / toolchain、worktree、rust、debug 修改 / scoped diff / 四个入口保持领域 delta / 四个 SKILL.md / 对应四文件 / apply_patch / 项目 worktree / 四文件 write / 项目 owner 编辑代理 / 不改 metadata、scripts 或领域行为`。
- `EDIT-PROJECT-DOCS / TB-PROJECT / edit / 共享 docs reference 与三消费者路由 / 中 / PREFLIGHT-PROJECT / 设计、项目 baseline / 新 reference、HeroUI、Redux、Vitest 修改 / scoped diff 与引用目标 / roots、offline 和领域规则保留 / 新 reference 与三 SKILL.md / 对应四文件 / apply_patch / 项目 worktree / 四文件 write / 项目 docs 编辑代理 / Redux 在线刷新段逐字保持`。
- `VERIFY-PROJECT / TB-PROJECT / verification / 7 个 skill 结构、引用与静态 owner 有效 / 中 / 两个项目 EDIT 节点 / 项目组合 diff / 验证证据 / 7 条 quick_validate 成功且 allowlist 正确 / 项目变更、validator、refs / uv 临时 cache / 本文 7 条命令、引用检查、diff check / 项目 worktree / 项目文件 read、`/Users/jiangsheng/.cache/uv` write / 项目验证代理 / 不运行 pnpm、Rust、GUI 或网络`。
- `STAGE-PROJECT / TB-PROJECT / stage / 项目 index 仅含 allowlist / 低 / VERIFY-PROJECT / 已验证 diff / staged snapshot / cached allowlist 与 check / 项目变更 / 项目 index / 本文 TB-PROJECT add 与 cached 审查 / 项目 worktree / 项目 index write / 项目 Git owner / staged diff 与工作树目标一致`。
- `COMMIT-PROJECT / TB-PROJECT / commit / 项目独立实现 commit / 低 / STAGE-PROJECT / staged snapshot / commit id / scoped show 与 status / 项目 index / branch ref、index / 本文 TB-PROJECT commit / 项目 worktree / branch ref 与 index write / 项目 Git owner / commit 只含项目 allowlist`。
- `EDIT-GLOBAL-AUTH / TB-GLOBAL / edit / 授权、能力与 worktree owner 收敛 / 中 / PREFLIGHT-GLOBAL / 设计、global baseline / action authorization 文件修改 / scoped diff / standing authorization 与动作族边界唯一 / action SKILL 与两个 references / 对应三文件 / apply_patch / 全局 worktree / 三文件 write / 授权编辑代理 / capability owner 不修改`。
- `EDIT-GLOBAL-ORCHESTRATION / TB-GLOBAL / edit / 阶段、委派与执行图职责收敛 / 中 / PREFLIGHT-GLOBAL / 设计、global baseline / managing、delegating、graph 修改 / scoped diff 与引用 / 阶段触发、调度、能力映射均保留 / 三目标文件 / 对应三文件 / apply_patch / 全局 worktree / 三文件 write / 编排编辑代理 / 不改执行图产品语义`。
- `EDIT-GLOBAL-DOCS / TB-GLOBAL / edit / 文档通用 owner 与 issue delta 收敛 / 中 / PREFLIGHT-GLOBAL / 设计、global baseline / project-doc、issue-doc 修改 / scoped diff / 日期、历史与 issue schema 各归其 owner / 两目标文件 / 对应两文件 / apply_patch / 全局 worktree / 两文件 write / 文档编辑代理 / 不迁移任何现有文档`。
- `EDIT-GLOBAL-REVERT / TB-GLOBAL / edit / revert 不变量内部单一来源 / 低 / PREFLIGHT-GLOBAL / 设计、global baseline / reverting SKILL 修改 / scoped diff / 六项回退行为全部保留 / reverting SKILL / 该文件 / apply_patch / 全局 worktree / reverting file write / revert 编辑代理 / 不运行 Git revert`。
- `VERIFY-GLOBAL / TB-GLOBAL / verification / 6 个 skill 结构、引用与静态 owner 有效 / 中 / 四个 GLOBAL EDIT 节点 / 全局组合 diff / 验证证据 / 6 条 quick_validate 成功且 allowlist 正确 / 全局变更、validator、refs / uv 临时 cache / 本文 6 条命令、引用检查、diff check / 全局 worktree / global 文件 read、uv cache write / 全局验证代理 / 不运行 installer、remote 或真实回退`。
- `STAGE-GLOBAL / TB-GLOBAL / stage / 全局 index 仅含 allowlist / 低 / VERIFY-GLOBAL / 已验证 diff / staged snapshot / cached allowlist 与 check / 全局变更 / 全局 index / 本文 TB-GLOBAL add 与 cached 审查 / 全局 worktree / 全局 index write / 全局 Git owner / staged diff 与目标一致`。
- `COMMIT-GLOBAL / TB-GLOBAL / commit / 全局独立实现 commit / 低 / STAGE-GLOBAL / staged snapshot / commit id / scoped show 与 status / 全局 index / branch ref、index / 本文 TB-GLOBAL commit / 全局 worktree / branch ref 与 index write / 全局 Git owner / commit 只含全局 allowlist`。
- `CASES-PROJECT / 无提交 / verification / 6 个盲测项目案例结果 / 中 / COMMIT-PROJECT / 项目 commit tree、合成请求 / 结构化案例结果 / 每例给触发、动作、停止与副作用 / 项目 commit tree / 无 / 子代理只读评估 / 隔离只读上下文 / commit tree read / 项目案例代理 / 不提供 oracle、不产生真实副作用`。
- `CASES-GLOBAL / 无提交 / verification / 7 个盲测全局案例结果 / 中 / COMMIT-GLOBAL / 全局 commit tree、合成请求 / 结构化案例结果 / 每例给授权、阶段、动作与副作用 / 全局 commit tree / 无 / 子代理只读评估 / 隔离只读上下文 / commit tree read / 全局案例代理 / 不提供 oracle、不执行真实 Git 动作`。
- `CROSS-ORACLE / 无提交 / review / 跨仓库行为与 owner 验收 / 中 / 两个 CASES 节点 / 两个 commits、案例结果、设计向量 / pass 或精确失败 / 13 案例全部等价且 owner 无环 / 两个稳定 commit trees / 无 / 只读 diff、owner、引用与案例审查 / 独立审查上下文 / 两个 commit tree read / oracle 代理 / 失败只阻止集成并返回精确缺口`。
- `MERGE-PROJECT / 无提交 / integration / 项目 branch fast-forward 到 dev / 低 / CROSS-ORACLE / 项目 commit、规范 checkout 预检 / dev 更新 / commit 成为 dev 祖先 / dev/status/branch / dev ref / 本文项目 merge / Codex 规范 checkout / dev ref write / 项目 Git owner / --ff-only 且无额外提交`。
- `MERGE-GLOBAL / 无提交 / integration / 全局 branch fast-forward 到 main / 低 / CROSS-ORACLE / 全局 commit、规范 checkout 预检 / main 更新与 live symlink 生效 / commit 成为 main 祖先 / main/status/branch/live links / main ref / 本文全局 merge / config 规范 checkout / main ref write / 全局 Git owner / --ff-only 且链接目标未变`。
- `LIVE-AUDIT / 无提交 / review / 两仓库最终状态与 live owner 证据 / 低 / 两个 MERGE 节点 / 两个 refs、live links、commits / audit pass / clean、ancestor、allowlist、13 结构结果可追溯 / 两仓库与 live links / 无 / 只读 status/show/ancestor/owner 检查 / 规范 checkouts / refs 与 links read / 最终审查代理 / 不追加修复`。
- `CLEANUP-PROJECT / 无提交 / integration / 删除项目 worktree 与已合并 branch / 低 / LIVE-AUDIT / merged ancestor、clean worktree / 资源释放 / worktree/branch 不存在且 commit 保留 / 项目 worktree metadata / worktree metadata、branch ref / 本文两条项目 cleanup 命令 / Codex 规范 checkout / worktree metadata 与 branch write / 项目 Git owner / 非 force 删除成功`。
- `CLEANUP-GLOBAL / 无提交 / integration / 删除全局 worktree 与已合并 branch / 低 / LIVE-AUDIT / merged ancestor、clean worktree / 资源释放 / worktree/branch 不存在且 commit 保留 / config worktree metadata / worktree metadata、branch ref / 本文两条全局 cleanup 命令 / config 规范 checkout / metadata 与 branch write / 全局 Git owner / 非 force 删除成功`。
- `SUCCESS-REPORT / 无提交 / review / 终态三项并行证据与提交摘要 / 低 / 两个 CLEANUP 节点 / 调度记录、commit ids、验证证据 / 用户报告 / 实际并行、关键路径、未启动 ready 节点齐全 / 执行记录 / 无 / 不调用有状态命令 / 主线程 / 无 / 主协调代理 / 不把结构校验描述成行为强制证明`。

## 失败与修正

任一节点失败只暂停该节点及传递后继；另一仓库不依赖分支继续。若失败是计划内改动直接引入且不改变目标、writeSet、行为、接口、安全或授权边界，插入独立修正 taskBoundary，并为修正创建新的独立 commit，禁止 amend。预存或范围外问题只报告。

若失败推翻作者边界、要求修改 `AGENTS.md`、metadata、scripts、Redux 刷新模式、非本人 skill、产品代码或验证入口，停止相关后继并回到设计/计划确认，不得自行扩大。

## 完成条件

- TB-DOC、TB-PROJECT、TB-GLOBAL 三个独立 commits 均存在，未 squash、未 amend。
- 13 个 quick_validate、引用检查、静态 owner 审计和 13 个独立合成案例全部通过。
- 两个实现 commits 已分别 fast-forward 到 `dev` 与 `main`，规范 checkout 干净。
- 全局 live symlink 仍指向相同 canonical 目录并立即看到已提交内容。
- 两个 worktree 和已合并 branches 已用非 force 命令清理；提交历史可恢复。
- 最终回复报告实际并行、关键路径、未启动 ready 节点及原因。

## 计划确认门禁

计划落盘不等于计划确认。只有用户明确确认本计划后，才能执行 TB-DOC stage/commit、创建 worktree、修改 skill、验证、stage、commit、集成或清理。
