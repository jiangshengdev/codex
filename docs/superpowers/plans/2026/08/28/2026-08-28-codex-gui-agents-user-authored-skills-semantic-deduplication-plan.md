# Codex GUI AGENTS 与本人 Skill 语义去重实施计划

日期：2026-08-28

状态：已确认

确认日期：2026-08-28

确认原文：`确认计划。开始进行`

设计依据：`docs/superpowers/specs/2026/08/28/2026-08-28-codex-gui-agents-user-authored-skills-semantic-deduplication-design.md`

设计确认原文：`确认，计划落盘`

## 目标与保证边界

实施已确认设计：只整理 `codex-gui/AGENTS.md` 与 9 个本人 `SKILL.md`，让项目硬边界、触发路由和详细流程各有单一 owner，同时保持触发范围、机器字面量和有效行为。

禁止修改 11 个上游 skill、项目根 `AGENTS.md`、scripts、references、metadata、产品代码、测试、schema、生成物、配置或远程状态；禁止安装、force、amend、squash、fallback、跳过或放宽检查。

## 计划前事实闭包

- 权威入口：`codex-gui/AGENTS.md` 管理前端文件级 delta；9 个 `SKILL.md` 各自管理领域流程；`$skill-creator` 的 `quick_validate.py` 只验证 skill 结构。
- 已追踪链路：AGENTS → toolchain / GUI 双入口 / HeroUI 与 Redux 路由；各 workflow skill → 通用授权、阶段或冲突 owner；共享 `local-frontend-dependency-docs.md` 已正确分层，无需修改。
- 修改范围：设计列出的 10 个规则文件，精确拆为 6 个实现提交。
- 验证映射：逐 skill 结构验证、allowlist、字面量、frontmatter、owner 与机器字面量审计，最终独立合成场景审查。
- 排除项：11 个上游 skill 与所有非规则实现文件保持零 diff。
- 剩余未知：无阻断未知。结构验证和合成审查不能证明真实运行时行为，最终报告必须明确该边界。

## 当前基线与授权

- 仓库：`/Users/jiangsheng/cnb/codex`
- 分支与 HEAD：`dev@a17aecaac3467790520e553fe968165b21d7ba8a`
- 当前工作树：只有本次设计文档和计划文档未跟踪；Git index 为空。
- 工具：`/opt/homebrew/bin/uv`、`/Users/jiangsheng/.cargo/bin/rg`、`/usr/bin/git`、`/usr/sbin/lsof` 与 validator 均已存在。
- validator：`/Users/jiangsheng/.codex/skills/.system/skill-creator/scripts/quick_validate.py`
- uv cache：`/Users/jiangsheng/.cache/uv`
- 计划确认只授权本文精确列出的文档状态更新、文档提交、worktree、10 文件编辑、验证、6 个任务提交、本地集成与非 force 清理。
- 第一项实施写操作只能是两份工作文档的确认状态更新；文档提交成功前禁止创建 worktree 或编辑规则文件。

## Task boundary 与提交

### TB-DOC：工作文档

提交消息：`docs: design codex gui rule ownership cleanup`

只包含本设计与本计划。计划确认后，提交前把两份文档状态更新为已确认，并记录确认日期与确认原文。

### TB-1：AGENTS 与 toolchain

提交消息：`docs(codex-gui): route frontend rule owners`

- `codex-gui/AGENTS.md`
- `.codex/skills/codex-gui-toolchain/SKILL.md`

### TB-2：GUI 双入口

提交消息：`docs(codex-gui): deduplicate GUI launch and acceptance rules`

- `.codex/skills/debug-responsive-gui/SKILL.md`
- `.codex/skills/gui-launch/SKILL.md`

### TB-3：前端依赖文档 skill

提交消息：`docs(skills): streamline frontend dependency guidance`

- `.codex/skills/heroui-react/SKILL.md`
- `.codex/skills/redux-toolkit/SKILL.md`
- `.codex/skills/vitest-react-browser-docs/SKILL.md`

### TB-4：GUI worktree

提交消息：`docs(skills): deduplicate codex GUI worktree rules`

- `.codex/skills/codex-gui-worktree/SKILL.md`

### TB-5：Rust 验证

提交消息：`docs(skills): streamline Rust verification rules`

- `.codex/skills/codex-rust-verification/SKILL.md`

### TB-6：release promotion

提交消息：`docs(skills): deduplicate release promotion rules`

- `.codex/skills/release-promotion/SKILL.md`

6 个实现 task 均从 TB-DOC commit 建立独立 branch、worktree 和 Git index；不同 task 之间不互相等待，同一 task 内严格执行 `edit → verify → stage → commit`。最终本地 octopus merge 保留 6 个任务提交，不 squash。

## 逐 task 修改契约

- TB-1：AGENTS 保留 `just fmt` 前端硬覆盖、工程/契约/证据闭包、HeroUI 产品约束、性能与 fixture 不变量；命令细节转 `$codex-gui-toolchain`，补 `$gui-launch` 与 `$redux-toolkit` 短路由，删除英文 GUI 状态字面量。toolchain 独占 live entrypoint、cwd、fnm Node、`pnpm` 与目标命中。
- TB-2：`$debug-responsive-gui` 独占场景、runtime handoff、浏览器、URL、证据和唯一状态 `真实 GUI 未验收`，删除内部重复但不删行为；`$gui-launch` 保持 launch-only、URL 顺序、精确输出和错误格式。
- TB-3：三份 skill 统一为“触发 → 资料根 → 最短查证 → 领域规则 → 转交”；HeroUI 保留 v3 API，Redux 区分普通离线查证与明确缓存刷新，Vitest 只负责文档查证。
- TB-4：保留 canonical path、披露、固化脚本、sparse paths、symlink 和结果核验；通用授权、阶段和安装规则改为短路由。
- TB-5：原样保留 Rust Hard Limits、allowed/forbidden command shapes 与 narrow filter 语义，只压缩用途复述和通用预检重复。
- TB-6：保留 local-only、clean worktree、冲突停留、禁止副作用与精确 `--continue`；通用授权和冲突流程改为短路由。

## Worktree 精确预配

计划编写时已核验：`/Users/jiangsheng/cnb/codex/.worktrees/vitest` 是直接指向 `/Users/jiangsheng/cnb/vitest` 的 symlink，其物理目标是 `/Users/jiangsheng/GitHub/vitest`。以下命令显式传入 `/Users/jiangsheng/cnb/vitest`，与固化脚本的 direct-mapping 判定兼容。

TB-DOC commit 成功后，从更新后的 `dev` 依次运行：

```bash
bash .codex/skills/codex-gui-worktree/scripts/create-codex-gui-worktree.sh --name gui-rules-agents-toolchain --branch codex/gui-rules-agents-toolchain --base dev --repo-root /Users/jiangsheng/cnb/codex --worktree-root /Users/jiangsheng/cnb/codex/.worktrees --vitest-root /Users/jiangsheng/cnb/vitest
bash .codex/skills/codex-gui-worktree/scripts/create-codex-gui-worktree.sh --name gui-rules-acceptance-launch --branch codex/gui-rules-acceptance-launch --base dev --repo-root /Users/jiangsheng/cnb/codex --worktree-root /Users/jiangsheng/cnb/codex/.worktrees --vitest-root /Users/jiangsheng/cnb/vitest
bash .codex/skills/codex-gui-worktree/scripts/create-codex-gui-worktree.sh --name gui-rules-dependency-docs --branch codex/gui-rules-dependency-docs --base dev --repo-root /Users/jiangsheng/cnb/codex --worktree-root /Users/jiangsheng/cnb/codex/.worktrees --vitest-root /Users/jiangsheng/cnb/vitest
bash .codex/skills/codex-gui-worktree/scripts/create-codex-gui-worktree.sh --name gui-rules-worktree --branch codex/gui-rules-worktree --base dev --repo-root /Users/jiangsheng/cnb/codex --worktree-root /Users/jiangsheng/cnb/codex/.worktrees --vitest-root /Users/jiangsheng/cnb/vitest
bash .codex/skills/codex-gui-worktree/scripts/create-codex-gui-worktree.sh --name gui-rules-rust-verification --branch codex/gui-rules-rust-verification --base dev --repo-root /Users/jiangsheng/cnb/codex --worktree-root /Users/jiangsheng/cnb/codex/.worktrees --vitest-root /Users/jiangsheng/cnb/vitest
bash .codex/skills/codex-gui-worktree/scripts/create-codex-gui-worktree.sh --name gui-rules-release-promotion --branch codex/gui-rules-release-promotion --base dev --repo-root /Users/jiangsheng/cnb/codex --worktree-root /Users/jiangsheng/cnb/codex/.worktrees --vitest-root /Users/jiangsheng/cnb/vitest
```

创建动作因共享 `.git/worktrees` metadata 串行；创建完成后 6 个实现分支立即 fan-out。每次脚本执行前必须依次运行并核对：

```bash
test -L /Users/jiangsheng/cnb/codex/.worktrees/vitest
readlink /Users/jiangsheng/cnb/codex/.worktrees/vitest
realpath /Users/jiangsheng/cnb/codex/.worktrees/vitest
```

后两条必须分别输出 `/Users/jiangsheng/cnb/vitest` 与 `/Users/jiangsheng/GitHub/vitest`；缺失或不一致即停止，不运行可能创建或改写该 link 的脚本。

每个 `<name>` 的 canonical worktree 为 `/Users/jiangsheng/cnb/codex/.worktrees/<name>`，并创建以下四类新映射：

```text
/Users/jiangsheng/cnb/codex/.worktrees/<name>/codex-gui/node_modules -> /Users/jiangsheng/cnb/codex/codex-gui/node_modules
/Users/jiangsheng/cnb/codex/.worktrees/<name>/codex-gui/.heroui-docs/react -> /Users/jiangsheng/cnb/codex/codex-gui/.heroui-docs/react
/Users/jiangsheng/cnb/codex/.worktrees/<name>/codex-gui/.redux-toolkit-docs/redux -> /Users/jiangsheng/cnb/codex/codex-gui/.redux-toolkit-docs/redux
/Users/jiangsheng/cnb/codex/.worktrees/<name>/codex-gui/.redux-toolkit-docs/toolkit -> /Users/jiangsheng/cnb/codex/codex-gui/.redux-toolkit-docs/toolkit
```

这里的 `<name>` 只可分别取：`gui-rules-agents-toolchain`、`gui-rules-acceptance-launch`、`gui-rules-dependency-docs`、`gui-rules-worktree`、`gui-rules-rust-verification`、`gui-rules-release-promotion`。每次脚本调用只读核验既有 `/Users/jiangsheng/cnb/codex/.worktrees/vitest -> /Users/jiangsheng/cnb/vitest`，禁止修改它。执行前仍须按 `$codex-gui-worktree` 为每个 worktree 单独打印完整命令、canonical 路径和展开后的四类新映射及 Vitest 只读映射；任一 branch、路径或 symlink 冲突即停止，不覆盖。

## 固定验证

每个实现分支只验证本 task；最终集成状态再验证全部 9 个 skill。不得改用直接 `python`、`python3` 或持久安装。Task-local 命令为：

```bash
/opt/homebrew/bin/uv run --no-project --with pyyaml python /Users/jiangsheng/.codex/skills/.system/skill-creator/scripts/quick_validate.py /Users/jiangsheng/cnb/codex/.worktrees/gui-rules-agents-toolchain/.codex/skills/codex-gui-toolchain
/opt/homebrew/bin/uv run --no-project --with pyyaml python /Users/jiangsheng/.codex/skills/.system/skill-creator/scripts/quick_validate.py /Users/jiangsheng/cnb/codex/.worktrees/gui-rules-acceptance-launch/.codex/skills/debug-responsive-gui
/opt/homebrew/bin/uv run --no-project --with pyyaml python /Users/jiangsheng/.codex/skills/.system/skill-creator/scripts/quick_validate.py /Users/jiangsheng/cnb/codex/.worktrees/gui-rules-acceptance-launch/.codex/skills/gui-launch
/opt/homebrew/bin/uv run --no-project --with pyyaml python /Users/jiangsheng/.codex/skills/.system/skill-creator/scripts/quick_validate.py /Users/jiangsheng/cnb/codex/.worktrees/gui-rules-dependency-docs/.codex/skills/heroui-react
/opt/homebrew/bin/uv run --no-project --with pyyaml python /Users/jiangsheng/.codex/skills/.system/skill-creator/scripts/quick_validate.py /Users/jiangsheng/cnb/codex/.worktrees/gui-rules-dependency-docs/.codex/skills/redux-toolkit
/opt/homebrew/bin/uv run --no-project --with pyyaml python /Users/jiangsheng/.codex/skills/.system/skill-creator/scripts/quick_validate.py /Users/jiangsheng/cnb/codex/.worktrees/gui-rules-dependency-docs/.codex/skills/vitest-react-browser-docs
/opt/homebrew/bin/uv run --no-project --with pyyaml python /Users/jiangsheng/.codex/skills/.system/skill-creator/scripts/quick_validate.py /Users/jiangsheng/cnb/codex/.worktrees/gui-rules-worktree/.codex/skills/codex-gui-worktree
/opt/homebrew/bin/uv run --no-project --with pyyaml python /Users/jiangsheng/.codex/skills/.system/skill-creator/scripts/quick_validate.py /Users/jiangsheng/cnb/codex/.worktrees/gui-rules-rust-verification/.codex/skills/codex-rust-verification
/opt/homebrew/bin/uv run --no-project --with pyyaml python /Users/jiangsheng/.codex/skills/.system/skill-creator/scripts/quick_validate.py /Users/jiangsheng/cnb/codex/.worktrees/gui-rules-release-promotion/.codex/skills/release-promotion
```

最终在 `/Users/jiangsheng/cnb/codex` 运行：

```bash
/opt/homebrew/bin/uv run --no-project --with pyyaml python /Users/jiangsheng/.codex/skills/.system/skill-creator/scripts/quick_validate.py /Users/jiangsheng/cnb/codex/.codex/skills/codex-gui-toolchain
/opt/homebrew/bin/uv run --no-project --with pyyaml python /Users/jiangsheng/.codex/skills/.system/skill-creator/scripts/quick_validate.py /Users/jiangsheng/cnb/codex/.codex/skills/codex-gui-worktree
/opt/homebrew/bin/uv run --no-project --with pyyaml python /Users/jiangsheng/.codex/skills/.system/skill-creator/scripts/quick_validate.py /Users/jiangsheng/cnb/codex/.codex/skills/codex-rust-verification
/opt/homebrew/bin/uv run --no-project --with pyyaml python /Users/jiangsheng/.codex/skills/.system/skill-creator/scripts/quick_validate.py /Users/jiangsheng/cnb/codex/.codex/skills/debug-responsive-gui
/opt/homebrew/bin/uv run --no-project --with pyyaml python /Users/jiangsheng/.codex/skills/.system/skill-creator/scripts/quick_validate.py /Users/jiangsheng/cnb/codex/.codex/skills/gui-launch
/opt/homebrew/bin/uv run --no-project --with pyyaml python /Users/jiangsheng/.codex/skills/.system/skill-creator/scripts/quick_validate.py /Users/jiangsheng/cnb/codex/.codex/skills/heroui-react
/opt/homebrew/bin/uv run --no-project --with pyyaml python /Users/jiangsheng/.codex/skills/.system/skill-creator/scripts/quick_validate.py /Users/jiangsheng/cnb/codex/.codex/skills/redux-toolkit
/opt/homebrew/bin/uv run --no-project --with pyyaml python /Users/jiangsheng/.codex/skills/.system/skill-creator/scripts/quick_validate.py /Users/jiangsheng/cnb/codex/.codex/skills/release-promotion
/opt/homebrew/bin/uv run --no-project --with pyyaml python /Users/jiangsheng/.codex/skills/.system/skill-creator/scripts/quick_validate.py /Users/jiangsheng/cnb/codex/.codex/skills/vitest-react-browser-docs
```

每条成功条件是退出 `0` 且输出 `Skill is valid!`。

共同静态检查：

```bash
/usr/bin/git diff --check -- codex-gui/AGENTS.md .codex/skills/codex-gui-toolchain/SKILL.md .codex/skills/codex-gui-worktree/SKILL.md .codex/skills/codex-rust-verification/SKILL.md .codex/skills/debug-responsive-gui/SKILL.md .codex/skills/gui-launch/SKILL.md .codex/skills/heroui-react/SKILL.md .codex/skills/redux-toolkit/SKILL.md .codex/skills/release-promotion/SKILL.md .codex/skills/vitest-react-browser-docs/SKILL.md
/Users/jiangsheng/.cargo/bin/rg -n -e 'Real GUI not validated' -e '真实 GUI 未验收' codex-gui/AGENTS.md .codex/skills/debug-responsive-gui/SKILL.md
```

最终 committed-range 检查使用 `DOC-COMMIT` 节点产出的真实 SHA 替换 `<DOC-COMMIT>`：

```bash
/usr/bin/git diff --check <DOC-COMMIT>..HEAD -- codex-gui/AGENTS.md .codex/skills/codex-gui-toolchain/SKILL.md .codex/skills/codex-gui-worktree/SKILL.md .codex/skills/codex-rust-verification/SKILL.md .codex/skills/debug-responsive-gui/SKILL.md .codex/skills/gui-launch/SKILL.md .codex/skills/heroui-react/SKILL.md .codex/skills/redux-toolkit/SKILL.md .codex/skills/release-promotion/SKILL.md .codex/skills/vitest-react-browser-docs/SKILL.md
/usr/bin/git diff --name-only <DOC-COMMIT>..HEAD
```

第二条输出必须精确等于 10 文件 allowlist；其补集，尤其 11 个上游 skill、scripts、references、metadata、根 `AGENTS.md` 与产品文件，必须为零 diff。

状态探针预期只命中 `$debug-responsive-gui` 中的 `真实 GUI 未验收`。另需人工逐项完成：

- 修改前后 `name`、description 触发对象和否定范围对照。
- 命令、路径、参数顺序、环境变量、URL、输出和错误格式对照；只允许删除重复实例，不改写幸存字面量。
- 10 文件 allowlist 与所有排除文件零 diff。
- 单一 owner 反向审计，不以行数下降或搜索命中次数作为通过条件。

不运行 `just fmt`、`pnpm`、Rust、GUI、worktree/release/debug 脚本或测试：目标均为 Markdown 规则文件，这些入口不能证明语义去重。quick_validate、静态探针与合成场景均不得表述为真实运行时行为证明。

## Stage、commit、集成与清理

TB-DOC：

```bash
git -C /Users/jiangsheng/cnb/codex add -- docs/superpowers/specs/2026/08/28/2026-08-28-codex-gui-agents-user-authored-skills-semantic-deduplication-design.md docs/superpowers/plans/2026/08/28/2026-08-28-codex-gui-agents-user-authored-skills-semantic-deduplication-plan.md
git -C /Users/jiangsheng/cnb/codex commit -m 'docs: design codex gui rule ownership cleanup'
```

TB-1 至 TB-6 使用以下精确命令；每次 stage 后必须检查 `git diff --cached --name-only`、完整 cached diff 与 `git diff --cached --check`，确认对应 allowlist 后才 commit：

```bash
git -C /Users/jiangsheng/cnb/codex/.worktrees/gui-rules-agents-toolchain add -- codex-gui/AGENTS.md .codex/skills/codex-gui-toolchain/SKILL.md
git -C /Users/jiangsheng/cnb/codex/.worktrees/gui-rules-agents-toolchain commit -m 'docs(codex-gui): route frontend rule owners'
git -C /Users/jiangsheng/cnb/codex/.worktrees/gui-rules-acceptance-launch add -- .codex/skills/debug-responsive-gui/SKILL.md .codex/skills/gui-launch/SKILL.md
git -C /Users/jiangsheng/cnb/codex/.worktrees/gui-rules-acceptance-launch commit -m 'docs(codex-gui): deduplicate GUI launch and acceptance rules'
git -C /Users/jiangsheng/cnb/codex/.worktrees/gui-rules-dependency-docs add -- .codex/skills/heroui-react/SKILL.md .codex/skills/redux-toolkit/SKILL.md .codex/skills/vitest-react-browser-docs/SKILL.md
git -C /Users/jiangsheng/cnb/codex/.worktrees/gui-rules-dependency-docs commit -m 'docs(skills): streamline frontend dependency guidance'
git -C /Users/jiangsheng/cnb/codex/.worktrees/gui-rules-worktree add -- .codex/skills/codex-gui-worktree/SKILL.md
git -C /Users/jiangsheng/cnb/codex/.worktrees/gui-rules-worktree commit -m 'docs(skills): deduplicate codex GUI worktree rules'
git -C /Users/jiangsheng/cnb/codex/.worktrees/gui-rules-rust-verification add -- .codex/skills/codex-rust-verification/SKILL.md
git -C /Users/jiangsheng/cnb/codex/.worktrees/gui-rules-rust-verification commit -m 'docs(skills): streamline Rust verification rules'
git -C /Users/jiangsheng/cnb/codex/.worktrees/gui-rules-release-promotion add -- .codex/skills/release-promotion/SKILL.md
git -C /Users/jiangsheng/cnb/codex/.worktrees/gui-rules-release-promotion commit -m 'docs(skills): deduplicate release promotion rules'
```

禁止 amend。

6 个 task commit 和所有 task-local 验证完成后，在干净的 `dev` 主 checkout 执行：

```bash
git -C /Users/jiangsheng/cnb/codex merge --no-ff --no-edit codex/gui-rules-agents-toolchain codex/gui-rules-acceptance-launch codex/gui-rules-dependency-docs codex/gui-rules-worktree codex/gui-rules-rust-verification codex/gui-rules-release-promotion
```

任一冲突即停止，不自动解决、rebase、cherry-pick 或改变提交边界。

最终验证通过且 6 个 branch 均为 `dev` 祖先后，先用 `/usr/sbin/lsof -a -d cwd +D <canonical-worktree>` 逐个确认没有进程 cwd 位于目标 worktree；任一命中即停止对应清理。随后逐一使用非 force 命令清理：

```bash
git -C /Users/jiangsheng/cnb/codex worktree remove /Users/jiangsheng/cnb/codex/.worktrees/gui-rules-agents-toolchain
git -C /Users/jiangsheng/cnb/codex branch -d codex/gui-rules-agents-toolchain
git -C /Users/jiangsheng/cnb/codex worktree remove /Users/jiangsheng/cnb/codex/.worktrees/gui-rules-acceptance-launch
git -C /Users/jiangsheng/cnb/codex branch -d codex/gui-rules-acceptance-launch
git -C /Users/jiangsheng/cnb/codex worktree remove /Users/jiangsheng/cnb/codex/.worktrees/gui-rules-dependency-docs
git -C /Users/jiangsheng/cnb/codex branch -d codex/gui-rules-dependency-docs
git -C /Users/jiangsheng/cnb/codex worktree remove /Users/jiangsheng/cnb/codex/.worktrees/gui-rules-worktree
git -C /Users/jiangsheng/cnb/codex branch -d codex/gui-rules-worktree
git -C /Users/jiangsheng/cnb/codex worktree remove /Users/jiangsheng/cnb/codex/.worktrees/gui-rules-rust-verification
git -C /Users/jiangsheng/cnb/codex branch -d codex/gui-rules-rust-verification
git -C /Users/jiangsheng/cnb/codex worktree remove /Users/jiangsheng/cnb/codex/.worktrees/gui-rules-release-promotion
git -C /Users/jiangsheng/cnb/codex branch -d codex/gui-rules-release-promotion
```

## 描述式执行图

### 共享字段

所有节点：`deferralEvidence=无`；`subdelegation=false`；`failureDomain` 为本节点及传递后继，只有共享作者、授权、安全或基线前提失效才扩大；`replanTriggers` 为 writeSet、作者、HEAD、命令、owner、行为、机器字面量或验证入口变化；未声明 state effect 一律禁止。

每个节点的 `authorizationGate` 同时携带以下最小能力信封，并由该节点记录补齐差异字段：

- `objective`：实施本设计的 10 文件语义去重。
- `phase`：implementation。
- `grantSource`：用户未来对本计划的明确确认；当前尚未满足。
- `grantedOperation`：仅该节点的 `operationKind`。
- `allowedOperations`：仅该节点 `commandScope` 与其列明的有界固有步骤。
- `parameterBounds`：仅该节点 `executionContext`、精确路径、命令、次数和输入输出。
- `readSet`、`writeSet`、`canonicalTargets`、`stateEffects`：取该节点同名字段；逻辑路径与底层 Git ref/index/worktree 锁共同组成 canonical target。
- `negativeConstraints`：禁止安装、远程、force、amend、squash、范围外写入、修改上游、修改未列出的 scripts/references/metadata，以及把结构或合成验证称为运行时证明。
- `specialApprovals=[]`；`requiredApprovalIds=[]`；`subdelegation=false`。
- `lifecycle`：计划确认后在节点开始时激活，节点完成、失败、撤销或前提漂移时到期。
- `status`：计划确认前为 `pending`；确认后仍须由 `$action-authorization` 核对父授权与节点信封交集，只有交集完整才为 `active`。

### 固定节点

- `DOC-META`：`taskBoundary=TB-DOC`；`operationKind=edit`；`outcome=两份文档记录确认状态`；`estimatedCost=低`；`hardPredecessors=计划确认`；`consumes=确认原文+两份文档`；`produces=确认后的文档 diff`；`completionEvidence=状态、日期、原文精确`；`readSet/writeSet=/Users/jiangsheng/cnb/codex/docs/superpowers/specs/2026/08/28/2026-08-28-codex-gui-agents-user-authored-skills-semantic-deduplication-design.md 和 /Users/jiangsheng/cnb/codex/docs/superpowers/plans/2026/08/28/2026-08-28-codex-gui-agents-user-authored-skills-semantic-deduplication-plan.md / 同两文件`；`stateEffects=文档工作树修改`；`commandScope=apply_patch`；`executionContext=dev 主 checkout`；`resourceLocks=上述两文件 write`；`owner=文档编辑子代理`；`verification=仅元数据变化符合确认事实`。
- `DOC-STAGE`：`taskBoundary=TB-DOC`；`operationKind=stage`；`outcome=index 只含两份文档`；`estimatedCost=低`；`hardPredecessors=DOC-META`；`consumes=确认后的文档 diff`；`produces=staged snapshot`；`completionEvidence=cached allowlist+cached diff check`；`readSet=上述两份文档`；`writeSet=/Users/jiangsheng/cnb/codex/.git/index`；`stateEffects=index 修改`；`commandScope=TB-DOC add 与 cached 审查`；`executionContext=dev 主 checkout`；`resourceLocks=/Users/jiangsheng/cnb/codex/.git/index write`；`owner=DOC Git 子代理`；`verification=无第三文件`。
- `DOC-COMMIT`：`taskBoundary=TB-DOC`；`operationKind=commit`；`outcome=独立工作文档 commit`；`estimatedCost=低`；`hardPredecessors=DOC-STAGE`；`consumes=staged snapshot`；`produces=DOC commit id`；`completionEvidence=commit tree 只含两文档`；`readSet=/Users/jiangsheng/cnb/codex/.git/index`；`writeSet=refs/heads/dev+/Users/jiangsheng/cnb/codex/.git/index+对应 reflog`；`stateEffects=本地 commit`；`commandScope=TB-DOC commit`；`executionContext=dev 主 checkout`；`resourceLocks=refs/heads/dev、主 index 与 reflog write`；`owner=DOC Git 子代理`；`verification=commit show+clean index`。

### Task 参数矩阵

| Task | Branch | Canonical worktree / linked index | Canonical file writeSet | Validator skill |
|---|---|---|---|---|
| TB-1 | `refs/heads/codex/gui-rules-agents-toolchain` | `/Users/jiangsheng/cnb/codex/.worktrees/gui-rules-agents-toolchain` / `/Users/jiangsheng/cnb/codex/.git/worktrees/gui-rules-agents-toolchain/index` | `/Users/jiangsheng/cnb/codex/.worktrees/gui-rules-agents-toolchain/codex-gui/AGENTS.md`；`/Users/jiangsheng/cnb/codex/.worktrees/gui-rules-agents-toolchain/.codex/skills/codex-gui-toolchain/SKILL.md` | toolchain |
| TB-2 | `refs/heads/codex/gui-rules-acceptance-launch` | `/Users/jiangsheng/cnb/codex/.worktrees/gui-rules-acceptance-launch` / `/Users/jiangsheng/cnb/codex/.git/worktrees/gui-rules-acceptance-launch/index` | `/Users/jiangsheng/cnb/codex/.worktrees/gui-rules-acceptance-launch/.codex/skills/debug-responsive-gui/SKILL.md`；`/Users/jiangsheng/cnb/codex/.worktrees/gui-rules-acceptance-launch/.codex/skills/gui-launch/SKILL.md` | debug、gui-launch |
| TB-3 | `refs/heads/codex/gui-rules-dependency-docs` | `/Users/jiangsheng/cnb/codex/.worktrees/gui-rules-dependency-docs` / `/Users/jiangsheng/cnb/codex/.git/worktrees/gui-rules-dependency-docs/index` | `/Users/jiangsheng/cnb/codex/.worktrees/gui-rules-dependency-docs/.codex/skills/heroui-react/SKILL.md`；`/Users/jiangsheng/cnb/codex/.worktrees/gui-rules-dependency-docs/.codex/skills/redux-toolkit/SKILL.md`；`/Users/jiangsheng/cnb/codex/.worktrees/gui-rules-dependency-docs/.codex/skills/vitest-react-browser-docs/SKILL.md` | HeroUI、Redux、Vitest |
| TB-4 | `refs/heads/codex/gui-rules-worktree` | `/Users/jiangsheng/cnb/codex/.worktrees/gui-rules-worktree` / `/Users/jiangsheng/cnb/codex/.git/worktrees/gui-rules-worktree/index` | `/Users/jiangsheng/cnb/codex/.worktrees/gui-rules-worktree/.codex/skills/codex-gui-worktree/SKILL.md` | worktree |
| TB-5 | `refs/heads/codex/gui-rules-rust-verification` | `/Users/jiangsheng/cnb/codex/.worktrees/gui-rules-rust-verification` / `/Users/jiangsheng/cnb/codex/.git/worktrees/gui-rules-rust-verification/index` | `/Users/jiangsheng/cnb/codex/.worktrees/gui-rules-rust-verification/.codex/skills/codex-rust-verification/SKILL.md` | Rust verification |
| TB-6 | `refs/heads/codex/gui-rules-release-promotion` | `/Users/jiangsheng/cnb/codex/.worktrees/gui-rules-release-promotion` / `/Users/jiangsheng/cnb/codex/.git/worktrees/gui-rules-release-promotion/index` | `/Users/jiangsheng/cnb/codex/.worktrees/gui-rules-release-promotion/.codex/skills/release-promotion/SKILL.md` | release promotion |

表中简称严格展开为 Task boundary 节列出的绝对仓库相对路径，不产生额外路径。

### 每个 Task 实例化节点

以下模板分别以 `T=TB-1..TB-6` 和参数矩阵实例化，共 36 个稳定节点：

- `WT-PREP-T`：`taskBoundary=无提交`；`operationKind=integration`；`outcome=T 独立 worktree/branch/index`；`estimatedCost=低`；`hardPredecessors=DOC-COMMIT`；`consumes=DOC commit+T 路径预检`；`produces=T worktree identity`；`completionEvidence=Vitest 三条前检+固化脚本验证输出+clean status`；`readSet=refs/heads/dev、脚本、固定 sparse 输入、/Users/jiangsheng/cnb/codex/codex-gui/node_modules、.heroui-docs/react、.redux-toolkit-docs/redux、.redux-toolkit-docs/toolkit、既有 Vitest symlink`；`writeSet=/Users/jiangsheng/cnb/codex/.git/worktrees、T branch ref/reflog、T canonical worktree、T linked index、T worktree 内四类新 symlink`；`stateEffects=本地 branch/worktree/四类新 symlink`；`commandScope=Vitest 三条只读前检+T 对应的单条固化脚本命令`；`executionContext=dev 主 checkout`；`resourceLocks=/Users/jiangsheng/cnb/codex/.git/worktrees write、T branch ref/reflog write、T worktree/index write、四个 canonical source targets read、/Users/jiangsheng/cnb/codex/.worktrees/vitest read`；`owner=T worktree Git 子代理`；`verification=base 为 DOC commit、control plane 可读、Vitest mapping 未改`。

- `PREFLIGHT-T`：`taskBoundary=T`；`operationKind=investigation`；`outcome=作者、baseline、writeSet 与工具未漂移`；`estimatedCost=低`；`hardPredecessors=WT-PREP-T`；`consumes=DOC commit+T worktree`；`produces=T preflight evidence`；`completionEvidence=当前 Git 身份、log/blame、HEAD/status、路径和工具一致`；`readSet=T canonical files+T linked index+T branch ref+refs/heads/dev+/Users/jiangsheng/cnb/codex/.git/worktrees/<T-name> metadata+/Users/jiangsheng/cnb/codex/.git/config+/Users/jiangsheng/.gitconfig（存在时）`；`writeSet=无`；`stateEffects=只读证据`；`commandScope=只读 git/rg/path checks`；`executionContext=T worktree`；`resourceLocks=上述 readSet 全部 read`；`owner=T preflight 子代理`；`verification=仅本人规则且无第 11 文件需求`。
- `EDIT-T`：`taskBoundary=T`；`operationKind=edit`；`outcome=T 修改契约落入精确 writeSet`；`estimatedCost=中`；`hardPredecessors=PREFLIGHT-T`；`consumes=设计+baseline+preflight evidence`；`produces=T unstaged diff`；`completionEvidence=scoped diff 满足逐 task 契约`；`readSet=T canonical files+必要 owner 引用`；`writeSet=T canonical files`；`stateEffects=规则工作树修改`；`commandScope=apply_patch`；`executionContext=T canonical worktree/branch/index`；`resourceLocks=T canonical files write`；`owner=T 编辑子代理`；`verification=不改 scripts/references/metadata/上游`。
- `VERIFY-T`：`taskBoundary=T`；`operationKind=verification`；`outcome=T 结构、字面量、owner 与 allowlist 证据`；`estimatedCost=中`；`hardPredecessors=EDIT-T`；`consumes=T unstaged diff`；`produces=T verification evidence`；`completionEvidence=对应 quick_validate 全部成功+diff check+人工对照通过`；`readSet=T canonical files+validator+baseline`；`writeSet=/Users/jiangsheng/.cache/uv（无仓库文件写入）`；`stateEffects=/Users/jiangsheng/.cache/uv 临时 cache 写入`；`commandScope=对应 uv validator、git diff、rg`；`executionContext=T worktree`；`resourceLocks=T canonical files read+/Users/jiangsheng/.cache/uv write`；`owner=T 验证子代理`；`verification=不运行 formatter/tests/产品或 workflow 脚本`。
- `STAGE-T`：`taskBoundary=T`；`operationKind=stage`；`outcome=T index 只含 writeSet`；`estimatedCost=低`；`hardPredecessors=VERIFY-T`；`consumes=已验证 T diff`；`produces=T staged snapshot`；`completionEvidence=cached name-only/diff/check`；`readSet=T canonical files`；`writeSet=T canonical linked index`；`stateEffects=index 修改`；`commandScope=精确 git add 与 cached 审查`；`executionContext=T worktree`；`resourceLocks=T canonical linked index write`；`owner=T Git 子代理`；`verification=无范围外 staged path`。
- `COMMIT-T`：`taskBoundary=T`；`operationKind=commit`；`outcome=T 独立 commit`；`estimatedCost=低`；`hardPredecessors=STAGE-T`；`consumes=T staged snapshot`；`produces=T commit id`；`completionEvidence=commit tree 等于 T allowlist`；`readSet=T canonical linked index`；`writeSet=T branch ref+linked index`；`stateEffects=本地 commit`；`commandScope=T 提交消息`；`executionContext=T worktree`；`resourceLocks=T branch ref+linked index write`；`owner=T Git 子代理`；`verification=clean index、无 amend`。

### 汇合节点

- `MERGE-ALL`：`taskBoundary=TB-INTEGRATION`；`operationKind=integration`；`outcome=6 个 task commit 通过单次 octopus merge 进入 dev`；`estimatedCost=低`；`hardPredecessors=COMMIT-TB-1..6`；`consumes=6 commit ids+clean dev`；`produces=本地 integration merge commit id`；`completionEvidence=merge commit tree 正确且 6 task commits 均为 dev 祖先`；`readSet=6 refs+refs/heads/dev`；`writeSet=dev 主 checkout 的 10 个目标文件、/Users/jiangsheng/cnb/codex/.git/index、refs/heads/dev、/Users/jiangsheng/cnb/codex/.git/HEAD、ORIG_HEAD、MERGE_HEAD、MERGE_MSG、MERGE_MODE、logs/HEAD、logs/refs/heads/dev`；`stateEffects=本地 merge commit+主工作树更新`；`commandScope=本计划 merge 命令`；`executionContext=dev 主 checkout`；`resourceLocks=上述 10 文件和 Git integration-state write`；`owner=集成 Git 子代理`；`verification=冲突即停、不改任务 commits`。
- `FINAL-STRUCTURE`：`taskBoundary=无提交`；`operationKind=verification`；`outcome=集成后的 9 项结构与 committed-range 范围证据`；`estimatedCost=中`；`hardPredecessors=MERGE-ALL`；`consumes=稳定 dev tree+DOC commit id`；`produces=final 9 条 validator+allowlist/字面量/排除项证据`；`completionEvidence=9 项成功、DOC-COMMIT..HEAD 精确等于 10 文件、排除项零 diff`；`readSet=dev 主 checkout 的 10 文件+validator+DOC commit tree`；`writeSet=/Users/jiangsheng/.cache/uv（无仓库文件写入）`；`stateEffects=/Users/jiangsheng/.cache/uv 临时 cache 写入`；`commandScope=final 9 条 validator、committed-range diff check/name-only、状态探针`；`executionContext=dev 主 checkout`；`resourceLocks=10 文件 read+/Users/jiangsheng/.cache/uv write`；`owner=最终结构验证子代理`；`verification=不声称运行时行为通过`。
- `FINAL-SEMANTIC`：`taskBoundary=无提交`；`operationKind=review`；`outcome=独立合成场景语义审计`；`estimatedCost=中`；`hardPredecessors=MERGE-ALL`；`consumes=稳定 dev tree+不含预期答案的 GUI 启动、GUI 调试、toolchain、Redux 普通查证/明确刷新、worktree、Rust、release 请求`；`produces=逐例触发、动作、停止条件与副作用报告`；`completionEvidence=全部设计不变量可追溯且无第二 owner`；`readSet=dev 主 checkout 的 10 文件+必要 unchanged references`；`writeSet=无`；`stateEffects=只读报告`；`commandScope=独立子代理只读评估`；`executionContext=稳定 dev tree`；`resourceLocks=10 文件+unchanged references read`；`owner=独立 oracle 子代理`；`verification=不得执行真实状态操作，不把合成结果称为运行时证明`。
- `FINAL-AUDIT`：`taskBoundary=无提交`；`operationKind=fan-in`；`outcome=最终验收结论`；`estimatedCost=低`；`hardPredecessors=FINAL-STRUCTURE, FINAL-SEMANTIC`；`consumes=两类最终证据`；`produces=pass 或精确失败域`；`completionEvidence=设计验收逐项有证据`；`readSet=证据+dev 主 checkout 的 10 文件`；`writeSet=无`；`stateEffects=只读结论`；`commandScope=只读审计`；`executionContext=dev 主 checkout`；`resourceLocks=10 文件 read`；`owner=主协调代理`；`verification=审计节点自身只读；计划内问题只按修正插图处理`。

每个 `T=TB-1..TB-6` 还实例化两个清理节点：

- `REMOVE-WT-T`：`taskBoundary=无提交`；`operationKind=integration`；`outcome=T worktree 非 force 删除`；`estimatedCost=低`；`hardPredecessors=FINAL-AUDIT pass`；`consumes=T clean worktree+merged ancestor+无进程 cwd 证据`；`produces=T worktree removed`；`completionEvidence=目标路径不再注册且 commit 保留`；`readSet=T worktree/status/process cwd`；`writeSet=/Users/jiangsheng/cnb/codex/.git/worktrees+T worktree`；`stateEffects=删除临时 worktree`；`commandScope=T 对应 worktree remove`；`executionContext=dev 主 checkout`；`resourceLocks=/Users/jiangsheng/cnb/codex/.git/worktrees write+T worktree write`；`owner=T cleanup Git 子代理`；`verification=clean、已合并、无进程 cwd、非 force`。
- `DELETE-BRANCH-T`：`taskBoundary=无提交`；`operationKind=integration`；`outcome=T 已合并 branch 非 force 删除`；`estimatedCost=低`；`hardPredecessors=REMOVE-WT-T`；`consumes=T merged branch`；`produces=T branch removed`；`completionEvidence=branch 不存在且 commit 仍为 dev 祖先`；`readSet=T branch/dev ancestry`；`writeSet=T branch ref`；`stateEffects=删除已合并本地 branch`；`commandScope=T 对应 branch -d`；`executionContext=dev 主 checkout`；`resourceLocks=T branch ref write`；`owner=T cleanup Git 子代理`；`verification=非 force、提交可恢复`。

- `SUCCESS-REPORT`：`taskBoundary=无提交`；`operationKind=review`；`outcome=成功终态报告`；`estimatedCost=低`；`hardPredecessors=DELETE-BRANCH-TB-1..6`；`consumes=调度、commit、验证与清理证据`；`produces=用户报告`；`completionEvidence=实际并行、关键路径、未启动 ready 节点三项齐全`；`readSet=执行记录`；`writeSet=无`；`stateEffects=对话结果`；`commandScope=无有状态命令`；`executionContext=主线程`；`resourceLocks=无`；`owner=主协调代理`；`verification=明确运行时未证明边界`。
- `FAILURE-EVENT-<source-nodeId>`：失败、拒绝或受阻发生时动态实例化；`taskBoundary=无提交`；`operationKind=review`；`outcome=稳定记录 source 节点、失败域、当时 ready/running 集合与锁`；`estimatedCost=低`；`hardPredecessors=<source-nodeId> 的非成功终态`；`consumes=source 节点结果+调度状态`；`produces=failure-event evidence`；`completionEvidence=source、原因、失败域、域外节点与锁快照齐全`；`readSet=执行记录`；`writeSet=无`；`stateEffects=只读事件记录`；`commandScope=调度状态审计`；`executionContext=主线程`；`resourceLocks=执行记录 read`；`owner=主协调代理`；`verification=不扩大 source 失败域`。
- `NON-SUCCESS-FANIN-<source-nodeId>`：`taskBoundary=无提交`；`operationKind=fan-in`；`outcome=失败域外工作达到 quiescence 的证据`；`estimatedCost=低`；`hardPredecessors=FAILURE-EVENT-<source-nodeId> 及失败域外全部实际 nodeId`；`consumes=failure-event evidence、节点状态、锁记录`；`produces=terminal-failure evidence`；`completionEvidence=失败域外不再有可运行或可由其完成新解锁的有价值节点，且相关锁已释放`；`readSet=执行记录`；`writeSet=无`；`stateEffects=只读终态证据`；`commandScope=调度状态审计`；`executionContext=主线程`；`resourceLocks=执行记录 read`；`owner=主协调代理`；`verification=实例化时展开真实 nodeId；此后每次节点完成、失败、锁释放或新节点 ready 都重算并追加新解锁的域外 nodeId，直至 quiescence`。
- `NON-SUCCESS-REPORT-<source-nodeId>`：`taskBoundary=无提交`；`operationKind=review`；`outcome=失败、拒绝或受阻终态报告`；`estimatedCost=低`；`hardPredecessors=NON-SUCCESS-FANIN-<source-nodeId>`；`consumes=terminal-failure evidence`；`produces=用户报告`；`completionEvidence=实际并行、关键路径、未启动 ready 节点与停止域齐全`；`readSet=执行记录`；`writeSet=无`；`stateEffects=对话结果`；`commandScope=无有状态命令`；`executionContext=主线程`；`resourceLocks=无`；`owner=主协调代理`；`verification=不得把未完成描述成成功`。

## 调度、关键路径与失败域

计划确认后的 initial ready set 只有 `DOC-META`。`DOC-COMMIT` 后，`WT-PREP-TB-1..6` 全部 ready；它们因共享 `/Users/jiangsheng/cnb/codex/.git/worktrees` write lock 动态串行，但任一 worktree 创建完成就立即解锁自己的 `PREFLIGHT-T`，不等待其他创建。6 个分支随后在独立 worktree 中并行执行 edit → verify → stage → commit。共享 uv cache 只形成动态资源锁，不形成硬依赖。

计划期成功路径为：`DOC → 对应 WT-PREP-T → 执行时实测最长 task 分支 → MERGE-ALL → FINAL-STRUCTURE/FINAL-SEMANTIC 中实测较慢者 → FINAL-AUDIT → 最后完成的 REMOVE/DELETE 分支 → SUCCESS-REPORT`。执行时每次节点完成、失败、锁释放或图变化后重新计算 ready set；计划期无证据指定某个 task 必然最长。

节点失败只暂停自身及传递后继。`COMMIT-T` 前发现的计划内问题，在同一 taskBoundary 插入修正编辑节点并重新验证，仍形成原定单一 T commit；`COMMIT-T` 后发现的问题建立新的修正 taskBoundary 和独立 commit，禁止 amend。作者、范围、接口、机器字面量、验证入口或安全边界变化则回到计划确认。任何非成功事件都实例化 `FAILURE-EVENT-<source-nodeId> → NON-SUCCESS-FANIN-<source-nodeId> → NON-SUCCESS-REPORT-<source-nodeId>`，先耗尽失败域外仍有价值且获授权的 ready/running 节点，再报告。

## 完成条件

- TB-DOC 与 6 个实现 task 各有独立本地 commit；6 个实现 commits 经本地 octopus merge 进入 `dev`，未 squash、未 amend。
- 18 次 quick_validate（task-local 9 次、final 9 次）成功。
- 10 文件 allowlist、唯一 GUI 状态字面量、frontmatter、机器字面量和 owner 审计通过。
- 11 个上游 skill 与所有排除文件零 diff。
- 6 个临时 worktree 与已合并 branch 已非 force 清理。
- 最终报告实际并行、关键路径和未启动 ready 节点，并明确没有真实运行时行为证明。

## 计划确认门禁

计划落盘不等于计划确认。只有用户明确确认本计划后，才能更新工作文档状态、提交工作文档、创建 worktree、修改规则、验证、stage、commit、集成或清理。
