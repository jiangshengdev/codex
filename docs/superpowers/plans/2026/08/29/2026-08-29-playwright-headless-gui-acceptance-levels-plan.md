# Playwright 无头执行与 GUI 验收分级实施计划

日期：2026-08-29

状态：待确认，未执行

计划分支：`dev`

计划时 HEAD：`f9ce3876b1dec809754b59a7dd341a8e98d6ffa8`

## 目标与设计来源

本计划只实现已确认设计：

- `docs/superpowers/specs/2026/08/29/2026-08-29-playwright-headless-gui-acceptance-levels-design.md`

交付目标是在执行已确认计划时建立三级 GUI 验收模型：一级自动化回归和二级真实应用验收默认无头，不占用用户桌面；只有结果本身依赖可见桌面状态时才进入三级，并在启动任何可见窗口前取得针对该次影响的单独明确授权。

本计划不执行当前 skill typeahead 的二级验收。它只落地治理规则；治理规则完成后，skill typeahead 任务可在其原计划边界内按二级无头方式继续验收。实施本计划前、或仅凭本文档，不能提前把原任务标记为已验收。

## 计划前纵向影响面证据摘要

### 权威入口

- 跨项目默认与受保护资源门禁：`/Users/jiangsheng/cnb/codex-config/AGENTS.md`。`/Users/jiangsheng/.codex/AGENTS.md` 是指向它的符号链接，二者是同一 canonical 资源。
- Codex GUI 分级触发与完成语义：`/Users/jiangsheng/cnb/codex/codex-gui/AGENTS.md` 的 `Real GUI Acceptance` 段。
- 前端命令规划与验证入口：`/Users/jiangsheng/cnb/codex/.codex/skills/codex-gui-toolchain/SKILL.md`。
- 当前可见桌面入口：`/Users/jiangsheng/cnb/codex/.codex/skills/debug-responsive-gui/SKILL.md` 及其既有脚本；脚本明确启动 `--headed` 的 `Google Chrome for Testing` 和 DevTools。

### 已追踪链路

- `codex-gui/playwright.config.ts` 已设置 `headless: true`，但使用 `reporter: "html"`；计划执行 E2E 时还必须设置 `PLAYWRIGHT_HTML_OPEN=never`，防止 HTML report 弹窗。
- `codex-gui/vitest.browser.shared.config.ts` 已设置 `headless: true`；`codex-gui/package.json` 已把 `test:e2e` 与人工 `test:e2e:headed` 分开。
- 当前 `playwright-cli open --help` 显示 `--headed` 为显式 opt-in；裸 `open` 是计划采用的无头模式。`playwright-cli list --json` 是会话状态入口，二级验收必须在打开后核验 session 为非 headed，并核验 URL、路由、状态和交互。
- `codex-gui/AGENTS.md` 当前把广泛的布局、滚动、交互、焦点和组件状态统一路由到可见真实 GUI；该 consumer 必须改为三级路由，否则全局无头默认会被前端规则抵消。
- `$codex-gui-toolchain` 已拥有前端命令规划、执行预检、目标收集和 verification entrypoint 选择，适合成为一级、二级详细 owner；`$debug-responsive-gui` 已拥有有头窗口、DevTools、IME 和桌面状态，适合收窄为三级 owner。

### 修改范围

- `/Users/jiangsheng/cnb/codex-config/AGENTS.md`：替换现有过宽的真实 GUI 完成门禁，保留简洁跨项目默认、三级例外与可见窗口单独授权边界。
- `/Users/jiangsheng/cnb/codex/codex-gui/AGENTS.md`：定义 Codex GUI 的三级触发和完成语义，不复制命令细节。
- `/Users/jiangsheng/cnb/codex/.codex/skills/codex-gui-toolchain/SKILL.md`：扩展 description 与正文，成为一级、二级无头命令、session、runtime、URL、目标命中和结果报告的详细 owner。
- `/Users/jiangsheng/cnb/codex/.codex/skills/debug-responsive-gui/SKILL.md`：扩展 description 与正文，将既有 headed 工作流收窄为三级，并在调用入口前增加单独授权门禁。

### 验证映射

- 两个 skill 的结构有效性：分别使用官方 `quick_validate.py` 固化入口，要求退出码 0 且输出 `Skill is valid!`。
- 四文件格式与范围：两个仓库分别运行精确路径 `git diff --check`、allowlist diff 和 staged diff 审查。
- 分级语义：独立审查一级 E2E、二级真实 runtime、三级 macOS IME、用户拒绝可见窗口、用户直接要求可见调试、HTML reporter 六类场景，验证 owner、模式、授权与完成声明一致。
- 实际提示词触发：本次静态修改与审查只能证明文件语义。必须在后续新任务重新加载提示词后，才能把真实路由行为视为运行时生效证据；本计划不得用当前任务中已加载的旧提示词冒充该验证。

### 排除项

- 不修改 OpenAI 官方全局 `/Users/jiangsheng/.codex/skills/playwright/**`；其 `--headed` 示例由新的全局默认和项目 owner 在计划执行场景中收窄。
- 不手工修改自动安装的 `/Users/jiangsheng/cnb/codex/.agents/skills/playwright-cli/**`；`PLAYWRIGHT_HTML_OPEN=never` 只作为已验证的命令环境约束使用。
- 不修改 `playwright.config.ts`、Vitest 配置、`package.json`、浏览器脚本或产品代码；现有无头配置和命令环境足以覆盖一级，二级使用现有 `playwright-cli` 直接入口。
- 不修改 `$managing-work-stages`、`$action-authorization`、`$delegating-micro-stages`、execution graph schema、upstream prompt、Default collaboration prompt 或 Git 远程。
- 不更新两份既有 skill typeahead 设计或计划，也不暂存其四个工作树文件。

### 剩余未知

- 当前没有仓库固化的二级真实 runtime 无头脚本。该未知不扩大首轮文件范围：`$codex-gui-toolchain` 将定义现有 `playwright-cli` 的直接入口、预检和完成证据。若实施发现必须新增或修改脚本才能可靠进入二级，触发重新计划，禁止在本轮新增脚本。
- `playwright-cli list --json` 在无会话时只返回空 `browsers`；实施后的真实二级任务必须在会话创建后核验实际字段。该运行时证据属于后续二级验收，不阻断提示词实施。
- 当前任务无法证明新全局提示词已经重新加载。该限制只影响运行时生效声明，不影响四文件静态实现与本地提交；最终必须明确报告。

不存在会推翻四文件范围、提交边界或静态验证方式的关键未知。

## 预计修改范围与实现约束

### 全局提示词

`/Users/jiangsheng/cnb/codex-config/AGENTS.md`：

- 替换现有“所有可见或交互结果都必须经过真实 GUI 验收”的过宽规则，不能在保留旧规则的同时另加冲突段落。
- 只保留跨项目稳定原则：计划执行时默认无头；一级、二级不占用桌面；三级只在结果依赖可见桌面时触发；三级启动窗口前需要单独授权；未授权只阻塞三级和依赖完成声明。
- 不写 Playwright 参数、仓库脚本、三级详细案例、`.playwright-cli/`、reporter、trace、能力信封字段或执行图 schema。

### Codex GUI 前端提示词

`/Users/jiangsheng/cnb/codex/codex-gui/AGENTS.md`：

- 把现有 `Real GUI Acceptance` 改为三级路由。
- 一级覆盖隔离自动化；二级覆盖真实 Codex runtime、真实路由、状态和普通布局/滚动/交互/焦点；三级仅覆盖 OS 窗口、桌面焦点、DevTools、系统 IME 等无头不可证明的行为。
- 一级、二级通过且三级不适用时可以完整完成；三级适用但未执行时必须标记“可见桌面验收未执行”。
- 不复制前端命令、浏览器生命周期或窗口控制流程。

### 一级、二级详细 skill

`/Users/jiangsheng/cnb/codex/.codex/skills/codex-gui-toolchain/SKILL.md`：

- 更新 description，使计划中的 Codex GUI 浏览器验证和无头真实应用验收能够稳定触发。
- 一级使用仓库已有无头入口；Playwright Test 命令必须带 `PLAYWRIGHT_HTML_OPEN=never`，不得自动打开 HTML report 或 trace viewer。
- 二级使用当次完整 GUI URL 和无 `--headed` 的 `playwright-cli open`；随后通过 `playwright-cli list --json` 核验无头 session，并核验 runtime、URL、路由、状态、交互和场景结果。
- 无头入口缺失或证据不完整时，将受影响验收标为 `unexecuted`；禁止静默切换 `test:e2e:headed`、`--headed` 或 `$debug-responsive-gui`。
- 只有经证据判断属于三级时才路由 `$debug-responsive-gui`。

### 三级详细 skill

`/Users/jiangsheng/cnb/codex/.codex/skills/debug-responsive-gui/SKILL.md`：

- 更新 description，明确只服务三级可见桌面验收、可见调试及其现有窄用途能力。
- 保留现有 `Google Chrome for Testing`、`--headed`、DevTools、窗口布局、响应式、IME 与场景验收流程，不修改脚本。
- 在启动或复用任何可见浏览器、DevTools 或相关桌面窗口前，检查用户针对本次可见影响的明确授权；用户当前直接要求有头调试可以成为该次授权来源。
- 未授权时不调用入口，返回“可见桌面验收未执行”和被阻断场景；不得用环境就绪、截图或 DOM 断言替代三级结果。

## 权威工具与精确验证命令

### Skill 结构验证

```bash
/opt/homebrew/bin/uv run --no-project --with pyyaml python /Users/jiangsheng/.codex/skills/.system/skill-creator/scripts/quick_validate.py /Users/jiangsheng/cnb/codex/.codex/skills/codex-gui-toolchain
/opt/homebrew/bin/uv run --no-project --with pyyaml python /Users/jiangsheng/.codex/skills/.system/skill-creator/scripts/quick_validate.py /Users/jiangsheng/cnb/codex/.codex/skills/debug-responsive-gui
```

该 validator 只证明 skill 结构有效，不证明三级语义或运行时路由正确。

### 实施期模式预检

```bash
playwright-cli open --help
playwright-cli list --json
```

只有 `open --help` 仍显示 `--headed` 为显式选项，且 `list --json` 可读取会话状态时，才能把裸 `playwright-cli open '<当次完整 GUI URL>'` 写入详细 skill。若 CLI 语义漂移，停止受影响编辑并重新计划。

### 一级 Playwright Test 入口示例

```bash
PLAYWRIGHT_HTML_OPEN=never /opt/homebrew/bin/fnm exec --using-file pnpm run test:e2e
```

该命令是 skill 中的模式约束示例，不是本提示词治理任务必须运行的测试。本计划不运行 E2E、Vitest Browser Mode 或浏览器验收，因为四个目标都是提示词/skill Markdown，产品运行代码与测试配置未修改。

### Git 与范围验证

两个仓库分别使用精确目标路径运行：

- `git diff --check -- <allowlist>`；
- `git diff -- <allowlist>`；
- `git status --short --untracked-files=all`；
- stage 后运行 `git diff --cached --check`、`git diff --cached --name-status` 和完整 cached diff 审查。

不存在项目固化的 AGENTS/Markdown formatter 或 link checker；不得编造入口，也不得运行会扫描并可能改写当前 typeahead 脏文件的全目录 fix/formatter。

## Task boundary 与本地提交拓扑

### DOCS — 工作文档提交

仓库：`/Users/jiangsheng/cnb/codex`

只包含：

- `docs/superpowers/specs/2026/08/29/2026-08-29-playwright-headless-gui-acceptance-levels-design.md`
- `docs/superpowers/plans/2026/08/29/2026-08-29-playwright-headless-gui-acceptance-levels-plan.md`

建议提交信息：

```text
docs: design headless GUI acceptance levels
```

### GLOBAL — 全局默认与受保护资源门禁

仓库：`/Users/jiangsheng/cnb/codex-config`

只包含：

- `AGENTS.md`

建议提交信息：

```text
feat: default planned browser validation to headless
```

GLOBAL 必须在展示精确拟写文本、canonical target、工作树修改、Git index 和本地提交副作用后，取得同时覆盖受保护全局提示词与项目外主动修改的单独明确确认。计划确认不能替代该 special approval。

### GUI-RULES — Codex GUI 三级路由与两个 skill owner

仓库：`/Users/jiangsheng/cnb/codex`

只包含：

- `codex-gui/AGENTS.md`
- `.codex/skills/codex-gui-toolchain/SKILL.md`
- `.codex/skills/debug-responsive-gui/SKILL.md`

建议提交信息：

```text
feat(gui): tier browser acceptance by visibility
```

GUI-RULES 不包含 DOCS、当前四个 skill typeahead 工作树文件、脚本、配置或其他 skill。三个文件都是同一提示词行为变更，不包含独立 order-only 调整。

三个 task boundary 保留三个独立提交，禁止 squash、amend 或合并提交。提交后发现计划内问题时创建独立修正提交。

## 执行上下文与隔离

- 不创建 worktree。GLOBAL 位于独立 `codex-config` 仓库和独立 Git index；DOCS 与 GUI-RULES 位于 `codex` 的同一 task flow，DOCS 先提交，GUI-RULES 后编辑和提交。
- `codex` 当前已有四个 skill typeahead 工作树修改。所有 stage、cached review 和 commit 必须使用精确 allowlist；禁止 `git add .`、禁止格式化这些文件、禁止恢复或提交它们。
- GUI-RULES 的三个编辑节点写集合互不相交，可以在同一 worktree 并行，但不得操作 Git index；唯一 Git owner 在 fan-in 后执行组合审查、stage 和 commit。
- GLOBAL 与 GUI-RULES 分属不同仓库、不同 index，在 DOCS 门禁满足且各自授权有效后可以并行形成提交。

## 待确认能力信封

本节只是计划期授权草案，不产生当前执行授权。共享字段：

- `phase`: `plan-execution`
- `objective`: 每个节点以自身 `outcome` 作为服务已确认主目标的唯一节点目标；不得替换或扩大为相邻任务。
- `grantSource`: `pending`；只有用户后续明确确认本计划，才能覆盖 DOCS、GUI-RULES、验证与三个计划内本地提交。GLOBAL 仍需独立 special approval。
- `grantedOperation`: 仅限节点声明的单一 `operationKind`。
- `allowedOperations`: 仅限节点 `commandScope` 及完成该单一动作不可缺少的只读检查；不得调用等价但未列出的 fallback。
- `parameterBounds`: 以节点声明的 cwd、仓库、模式、次数、输入输出和 allowlist 为上限；未声明的参数、模式和重试不授权。
- `canonicalTargets`: 节点 `readSet`、`writeSet` 和 `resourceLocks` 中解析后的底层资源；canonical identity 只用于收窄和加锁，不扩大逻辑路径授权。
- `negativeConstraints`: 禁止 remote、force、amend、squash、安装、修改官方或自动安装 skill、改脚本/配置/产品代码、运行浏览器、执行 E2E、修改或暂存 typeahead 四文件、格式化范围外文件、弱化验证、修改计划正文作为运行记录。
- `specialApprovals`: 默认 `[]`；`G1`、`VG`、`RG`、`SG`、`CG` 覆盖为 `[GLOBAL-AGENTS-EXTERNAL-WRITE]`。
- `requiredApprovalIds`: 默认 `[]`；`G1`、`VG`、`RG`、`SG`、`CG` 覆盖为 `[GLOBAL-AGENTS-EXTERNAL-WRITE]`。
- `subdelegation`: `false`
- `lifecycle`: 节点进入 ready 并分配唯一 owner 时激活；完成、失败、前提失效、计划撤销或触发重新计划时到期。
- `replanTriggers`: 需要计划外文件、CLI 语义漂移、必须新增二级脚本、旧规则无法无冲突替换、validator 或范围验证入口失效、Git branch/index/dirty allowlist 漂移。
- `status`: `pending`

各节点的 `authorizationGate` 引用本共享信封，并按节点 `operationKind`、目标、命令、读写集合和 state effects 取最小交集。GLOBAL 节点还要求 `GLOBAL-AGENTS-EXTERNAL-WRITE` special approval。

## 描述式执行 DAG

以下 `deferralEvidence` 均为 `null`；没有基于编号或习惯制造的暂缓。所有节点 `subdelegation: false`。除非节点另述，owner 均为边界明确的子代理；主代理只协调、审查、维护运行状态和作最终判断。

### D0 — DOCS 最小提交预检

- `nodeId`: `D0`
- `taskBoundary`: `DOCS`
- `operationKind`: 调查
- `outcome`: 只闭合工作文档提交所需的 `codex` branch、HEAD、index、ignore 与两文件 allowlist。
- `estimatedCost`: 低
- `hardPredecessors`: 无；计划确认后唯一进入初始 ready set。
- `consumes`: 已确认计划、两份工作文档和当前 Git 状态。
- `produces`: DOCS stage/commit 可消费的最小 preflight 记录。
- `completionEvidence`: branch、HEAD、index、status、check-ignore 与两文档 diff 范围可信；不读取或预检实施目标。
- `readSet`: 两份 DOCS、`.gitignore`、`codex` Git metadata。
- `writeSet`: `[]`
- `stateEffects`: 只读 Git 进程和结构化证据。
- `commandScope`: `git status`、`git branch --show-current`、`git rev-parse HEAD`、`git diff --check -- <两份 DOCS>`、`git check-ignore`；不得读取或预检 GLOBAL/GUI-RULES 工具入口。
- `executionContext`: `codex` 当前 checkout 与 index 只读。
- `resourceLocks`: `codex` 两份 DOCS和 index read。
- `owner`: DOCS Git owner 的最小 preflight 子代理。
- `verification`: 两份文档可被精确暂存，index 没有预存 staged 内容。
- `failureDomain`: `D1`、`D2` 及全部实施节点。
- `replanTriggers`: 文档 ignored、index 非空、branch/HEAD/allowlist 漂移。
- `authorizationGate`: 计划确认后 active；只读能力仅覆盖 DOCS 提交固有预检。

### P0 — 两仓库实施前预检

- `nodeId`: `P0`
- `taskBoundary`: 无提交的共享前提
- `operationKind`: 调查
- `outcome`: 当前分支、HEAD、index、dirty allowlist、canonical target、适用规则、`uv`、validator 和 `playwright-cli` 入口均与计划一致。
- `estimatedCost`: 低
- `hardPredecessors`: `D2`；等待工作文档独立提交成功。
- `consumes`: 已确认计划、两个仓库当前状态。
- `produces`: 可供 GLOBAL、GUI-RULES 消费的稳定实施 preflight 记录。
- `completionEvidence`: 精确 status、branch、HEAD、readlink/realpath、工具路径和 help 输出；无状态变更。
- `readSet`: 两仓库 AGENTS 链、四个实施目标、Git 元数据、package/config、validator、`uv` 与 CLI help。
- `writeSet`: `[]`
- `stateEffects`: 只读进程和结构化证据。
- `commandScope`: `git` 只读命令、`readlink`、`realpath`、`command -v`、`test -e`、`playwright-cli open --help`、`playwright-cli list --json`；禁止打开浏览器。
- `executionContext`: 两个现有 checkout，两个 index 只读。
- `resourceLocks`: 两仓库工作树与 index read；CLI session registry read。
- `owner`: preflight 子代理。
- `verification`: 所有实际入口和目标身份命中；不要求 fnm/pnpm，因为本治理任务不运行前端包命令；缺失项只阻塞依赖分支。
- `failureDomain`: GLOBAL、GUI-RULES 中依赖失效前提的节点。
- `replanTriggers`: 共享信封中的任一条件。
- `authorizationGate`: 计划确认后 active；只读能力信封。

### D1 — 精确暂存工作文档

- `nodeId`: `D1`
- `taskBoundary`: `DOCS`
- `operationKind`: stage
- `outcome`: `codex` index 只包含本设计和本计划。
- `estimatedCost`: 低
- `hardPredecessors`: `D0`；等待 DOCS 最小 Git/index/allowlist 证据。
- `consumes`: 两份已落盘工作文档、D0 Git 状态。
- `produces`: DOCS staged snapshot。
- `completionEvidence`: cached name-status 仅两文件，cached diff 完整，`git diff --cached --check` 通过。
- `readSet`: 两份文档、`.gitignore`、index。
- `writeSet`: `codex/.git/index` 中两份 DOCS entries。
- `stateEffects`: 精确 index 变化，不改工作树正文。
- `commandScope`: 精确 `git add -- <两份 DOCS>` 与 cached 只读检查；禁止 `git add .`。
- `executionContext`: `codex` 当前 branch 与独占 DOCS index 写。
- `resourceLocks`: `/Users/jiangsheng/cnb/codex/.git/index` write。
- `owner`: DOCS 唯一 Git owner。
- `verification`: index 无 typeahead 或其他文件。
- `failureDomain`: `D2` 及所有实施编辑节点。
- `replanTriggers`: index 非空或 allowlist 漂移。
- `authorizationGate`: 计划确认后 active；stage 能力只覆盖两份 DOCS。

### D2 — 提交工作文档

- `nodeId`: `D2`
- `taskBoundary`: `DOCS`
- `operationKind`: commit
- `outcome`: 形成独立 DOCS 本地提交。
- `estimatedCost`: 低
- `hardPredecessors`: `D1`；等待精确 staged snapshot。
- `consumes`: D1 staged snapshot。
- `produces`: `docs: design headless GUI acceptance levels` commit id。
- `completionEvidence`: commit parent、message、name-status 和两文件内容正确，index 恢复为空。
- `readSet`: DOCS snapshot、index、current branch ref。
- `writeSet`: `codex` object database、branch ref、index。
- `stateEffects`: 一个本地 commit；无 remote。
- `commandScope`: 单次 `git commit -m 'docs: design headless GUI acceptance levels'` 与只读 commit 审查；禁止 amend。
- `executionContext`: `codex` 当前 branch，独占 index/ref 写。
- `resourceLocks`: `codex/.git/index`、object database、当前 branch ref write。
- `owner`: DOCS 唯一 Git owner。
- `verification`: commit 只含两份 DOCS。
- `failureDomain`: 所有实施编辑节点。
- `replanTriggers`: hook 改范围、parent/branch 漂移、提交集合错误。
- `authorizationGate`: 计划确认后 active；本地 commit 能力只覆盖 DOCS。

### A0 — 获取 GLOBAL special approval

- `nodeId`: `A0`
- `taskBoundary`: 无提交的授权门禁
- `operationKind`: 授权
- `outcome`: 向用户展示 `/Users/jiangsheng/cnb/codex-config/AGENTS.md` 的精确拟写文本、canonical 映射、工作树修改、stage 与本地提交副作用，并取得或拒绝 `GLOBAL-AGENTS-EXTERNAL-WRITE`。
- `estimatedCost`: 用户响应决定
- `hardPredecessors`: `P0`；等待工作文档提交后的 current canonical content 与身份。
- `consumes`: confirmed design、P0 canonical/规则证据。
- `produces`: active 或 denied special approval record。
- `completionEvidence`: 用户针对唯一明确确认点的直接回复；一般“继续”和计划确认无效。
- `readSet`: global AGENTS 当前内容、拟写文本、authorization record。
- `writeSet`: `[]`
- `stateEffects`: 对话中的授权记录，不修改文件。
- `commandScope`: 只读准备精确 diff；不得 apply patch。
- `executionContext`: 对话状态。
- `resourceLocks`: global AGENTS read。
- `owner`: 主代理只负责展示和记录确认；不委派用户确认判断。
- `verification`: `$action-authorization` 判断确认是否同时覆盖受保护资源与项目外修改副作用。
- `failureDomain`: 只暂停 GLOBAL 的 `G1`、`VG`、`SG`、`CG`；GUI-RULES 可继续。
- `replanTriggers`: 用户修改文本、范围、提交副作用或拒绝。
- `authorizationGate`: 计划确认只允许展示；GLOBAL 写能力保持 pending，直到本节点 active。

### G1 — 编辑全局简洁规则

- `nodeId`: `G1`
- `taskBoundary`: `GLOBAL`
- `operationKind`: 编辑
- `outcome`: 旧的过宽真实 GUI 规则被无冲突替换为已确认的简洁无头默认、三级例外和单独授权边界。
- `estimatedCost`: 中
- `hardPredecessors`: `A0(active)`；A0 已消费 D2 后的 P0，等待 special approval。
- `consumes`: 设计、计划、精确获批文本、current AGENTS。
- `produces`: 单文件 GLOBAL working diff。
- `completionEvidence`: diff 只含 `AGENTS.md`，旧冲突语义不残留，全局不复制详细命令/分级手册。
- `readSet`: AGENTS、设计、计划、授权记录。
- `writeSet`: `/Users/jiangsheng/cnb/codex-config/AGENTS.md`。
- `stateEffects`: codex-config 单文件工作树修改；不写 index。
- `commandScope`: `apply_patch` 精确编辑与只读 diff/rg。
- `executionContext`: `codex-config` 当前 branch，共享工作树，index 不写。
- `resourceLocks`: canonical global AGENTS write。
- `owner`: GLOBAL 编辑子代理。
- `verification`: 与获批精确文本逐字一致。
- `failureDomain`: `VG`、`RG`、`SG`、`CG`、`Z1` 的 GLOBAL 分支。
- `replanTriggers`: 无法替换旧语义、需其他文件或获批文本变化。
- `authorizationGate`: 仅 `GLOBAL-AGENTS-EXTERNAL-WRITE` active 后 active。

### F1 — 编辑 Codex GUI 分级路由

- `nodeId`: `F1`
- `taskBoundary`: `GUI-RULES`
- `operationKind`: 编辑
- `outcome`: 前端 AGENTS 用三级模型替换现有过宽真实 GUI 路由。
- `estimatedCost`: 中
- `hardPredecessors`: `P0`；等待工作文档 commit 后的实施前提。
- `consumes`: 设计、计划、current frontend AGENTS。
- `produces`: `codex-gui/AGENTS.md` working diff。
- `completionEvidence`: 一级/二级/三级触发、完成与 `unexecuted` 语义完整且不含命令细节。
- `readSet`: frontend/root AGENTS、设计、计划。
- `writeSet`: `codex-gui/AGENTS.md`。
- `stateEffects`: 单文件工作树修改；不写 index。
- `commandScope`: `apply_patch` 与只读 diff/rg。
- `executionContext`: `codex` 当前 worktree，GUI-RULES task boundary。
- `resourceLocks`: frontend AGENTS write。
- `owner`: F1 编辑子代理。
- `verification`: 不弱化真正三级场景的完成门禁。
- `failureDomain`: `RGUI`、`SGUI`、`CGUI`、`Z1` 的 GUI-RULES 分支。
- `replanTriggers`: 需要命令细节、脚本或计划外文件。
- `authorizationGate`: 计划确认且 D2 完成后 active。

### F2 — 编辑一级、二级详细 owner

- `nodeId`: `F2`
- `taskBoundary`: `GUI-RULES`
- `operationKind`: 编辑
- `outcome`: `$codex-gui-toolchain` 能稳定路由并约束一级、二级无头验收。
- `estimatedCost`: 中
- `hardPredecessors`: `P0`；等待工作文档 commit 后的实施前提。
- `consumes`: 设计、计划、current skill、Playwright/Vitest/package/CLI 证据。
- `produces`: `codex-gui-toolchain/SKILL.md` working diff。
- `completionEvidence`: description 和正文包含 headless default、`PLAYWRIGHT_HTML_OPEN=never`、二级 session/runtime/URL/route/state/interaction 证据、无 headed fallback。
- `readSet`: skill、package/config、CLI help、设计、计划。
- `writeSet`: `.codex/skills/codex-gui-toolchain/SKILL.md`。
- `stateEffects`: 单文件工作树修改；不写 index。
- `commandScope`: `apply_patch` 与只读 diff/rg；不运行浏览器或测试。
- `executionContext`: `codex` 当前 worktree，GUI-RULES task boundary。
- `resourceLocks`: toolchain SKILL.md write。
- `owner`: F2 编辑子代理。
- `verification`: 直接入口仅在无固化入口且 preflight 成立时使用；缺口报告 `unexecuted`。
- `failureDomain`: `V2`、`RGUI`、`SGUI`、`CGUI`、`Z1`。
- `replanTriggers`: 必须新增脚本、CLI 语义漂移、需修改 package/config。
- `authorizationGate`: 计划确认且 D2 完成后 active。

### F3 — 收窄三级可见桌面 owner

- `nodeId`: `F3`
- `taskBoundary`: `GUI-RULES`
- `operationKind`: 编辑
- `outcome`: `$debug-responsive-gui` 只在三级或用户明确有头调试时触发，并在可见窗口前检查本次授权。
- `estimatedCost`: 中
- `hardPredecessors`: `P0`；等待工作文档 commit 后的实施前提。
- `consumes`: 设计、计划、current skill 与既有 headed scripts。
- `produces`: `debug-responsive-gui/SKILL.md` working diff。
- `completionEvidence`: description、Core Rules、acceptance/reporting 明确三级边界；现有脚本入口与窄用途流程保持。
- `readSet`: skill、直接引用 scripts、设计、计划。
- `writeSet`: `.codex/skills/debug-responsive-gui/SKILL.md`。
- `stateEffects`: 单文件工作树修改；不写 index。
- `commandScope`: `apply_patch` 与只读 diff/rg；不改脚本、不启动窗口。
- `executionContext`: `codex` 当前 worktree，GUI-RULES task boundary。
- `resourceLocks`: debug-responsive-gui SKILL.md write。
- `owner`: F3 编辑子代理。
- `verification`: 无授权时不调用现有入口；有头流程本身不被误删。
- `failureDomain`: `V3`、`RGUI`、`SGUI`、`CGUI`、`Z1`。
- `replanTriggers`: 必须修改脚本、IME 或窗口控制实现。
- `authorizationGate`: 计划确认且 D2 完成后 active。

### VG — 验证 GLOBAL 单文件语义与范围

- `nodeId`: `VG`
- `taskBoundary`: `GLOBAL`
- `operationKind`: 验证
- `outcome`: GLOBAL diff 格式、范围、精确文本和 canonical 资源均正确。
- `estimatedCost`: 低
- `hardPredecessors`: `G1`；等待稳定 working diff。
- `consumes`: G1 diff、获批文本、canonical mapping。
- `produces`: GLOBAL validation evidence。
- `completionEvidence`: `git diff --check` 通过，diff 与获批文本一致，status 仅目标文件，symlink mapping 未变。
- `readSet`: AGENTS、Git diff/status、symlink。
- `writeSet`: `[]`
- `stateEffects`: 验证进程输出。
- `commandScope`: 精确 Git/readlink/realpath/rg 只读命令。
- `executionContext`: `codex-config` checkout/index 只读。
- `resourceLocks`: global AGENTS read；不得与 G1 写并发。
- `owner`: GLOBAL 验证子代理。
- `verification`: 全局保持简洁且旧冲突规则消失。
- `failureDomain`: `RG`、`SG`、`CG`、`Z1` 的 GLOBAL 分支。
- `replanTriggers`: diff/identity/范围不一致。
- `authorizationGate`: GLOBAL special approval 与计划确认均 active 后 active。

### V2 — 验证 `$codex-gui-toolchain`

- `nodeId`: `V2`
- `taskBoundary`: `GUI-RULES`
- `operationKind`: 验证
- `outcome`: 一级、二级 owner 的 skill 结构有效。
- `estimatedCost`: 低
- `hardPredecessors`: `F2`；等待稳定 SKILL.md。
- `consumes`: F2 diff、validator。
- `produces`: toolchain validator evidence。
- `completionEvidence`: 指定 uv 命令退出 0 且输出 `Skill is valid!`。
- `readSet`: skill 目录、validator、uv 临时环境输入。
- `writeSet`: `[]`
- `stateEffects`: uv 临时隔离缓存/进程输出；程序内部自动副作用不进入后续主动操作范围。
- `commandScope`: 本计划列出的单条 toolchain validator 命令。
- `executionContext`: `codex` checkout，index 不写。
- `resourceLocks`: uv runner read/execute、toolchain skill read。
- `owner`: V2 验证子代理。
- `verification`: validator 命中正确 skill 目录。
- `failureDomain`: `RGUI`、`SGUI`、`CGUI`、`Z1`。
- `replanTriggers`: validator 缺失、安装请求、结构错误需计划外文件。
- `authorizationGate`: 计划确认且 F2 完成后 active。

### V3 — 验证 `$debug-responsive-gui`

- `nodeId`: `V3`
- `taskBoundary`: `GUI-RULES`
- `operationKind`: 验证
- `outcome`: 三级 owner 的 skill 结构有效。
- `estimatedCost`: 低
- `hardPredecessors`: `F3`；等待稳定 SKILL.md。
- `consumes`: F3 diff、validator。
- `produces`: debug skill validator evidence。
- `completionEvidence`: 指定 uv 命令退出 0 且输出 `Skill is valid!`。
- `readSet`: skill 目录、validator、uv 临时环境输入。
- `writeSet`: `[]`
- `stateEffects`: uv 临时隔离缓存/进程输出；不主动操作产物。
- `commandScope`: 本计划列出的单条 debug skill validator 命令。
- `executionContext`: `codex` checkout，index 不写。
- `resourceLocks`: uv runner read/execute、debug skill read。
- `owner`: V3 验证子代理。
- `verification`: validator 命中正确 skill 目录。
- `failureDomain`: `RGUI`、`SGUI`、`CGUI`、`Z1`。
- `replanTriggers`: validator 缺失、安装请求、结构错误需计划外文件。
- `authorizationGate`: 计划确认且 F3 完成后 active。

### RG — GLOBAL 独立语义审查

- `nodeId`: `RG`
- `taskBoundary`: `GLOBAL`
- `operationKind`: 审查
- `outcome`: 全局单文件 diff 与获批文本一致，旧冲突规则消失，且只保留跨项目稳定原则。
- `estimatedCost`: 低
- `hardPredecessors`: `VG`；等待 GLOBAL 稳定 validation evidence。
- `consumes`: GLOBAL diff、获批精确文本、设计、计划、VG evidence。
- `produces`: GLOBAL semantic PASS 或精确失败清单。
- `completionEvidence`: 简洁性、旧规则替换、默认无头、三级例外、单独授权和局部失败域逐项通过。
- `readSet`: GLOBAL AGENTS、设计、计划、授权记录和 codex-config diff/status。
- `writeSet`: `[]`
- `stateEffects`: 结构化审查结果。
- `commandScope`: 只读 Git/rg/sed/readlink/realpath。
- `executionContext`: `codex-config` 稳定 working diff，index 只读。
- `resourceLocks`: global AGENTS read；等待 G1 释放 write。
- `owner`: 未参与 G1 的 GLOBAL 审查子代理。
- `verification`: diff 逐字匹配获批文本，不复制详细三级手册。
- `failureDomain`: `SG`、`CG`、`Z1` 的 GLOBAL 分支。
- `replanTriggers`: 获批文本、范围、完成语义或 canonical identity 改变。
- `authorizationGate`: 计划确认与 `GLOBAL-AGENTS-EXTERNAL-WRITE` 均 active。

### RGUI — GUI-RULES 独立 fan-in 与语义审查

- `nodeId`: `RGUI`
- `taskBoundary`: `GUI-RULES`
- `operationKind`: 审查
- `outcome`: 三个 GUI-RULES 文件组合实现三级模型，无重复 owner、矛盾、遗漏或 headed fallback。
- `estimatedCost`: 中
- `hardPredecessors`: `F1`、`V2`、`V3`；等待三个稳定 diff 和两个 validator 证据。
- `consumes`: 三文件完整 diff、设计、计划、验证证据、package/config/CLI 与排除证据。
- `produces`: GUI-RULES semantic PASS 或精确失败清单。
- `completionEvidence`: 六个行为用例逐项给出 mode、owner、authorization、completion result；codex allowlist 与 `git diff --check` 通过。
- `readSet`: 三目标、设计、计划、相关 package/config/skills、codex diff/status。
- `writeSet`: `[]`
- `stateEffects`: 结构化审查结果。
- `commandScope`: 只读 Git/rg/sed；不运行浏览器、测试或 formatter。
- `executionContext`: codex 三文件 working diff 的稳定快照，index 只读。
- `resourceLocks`: 三目标 read；等待 F1/F2/F3 释放 write。
- `owner`: 未参与 F1/F2/F3 的独立审查子代理。
- `verification`: 覆盖一级 E2E+HTML reporter、二级 typeahead、三级 IME、拒绝窗口、明确有头调试、无头入口缺失。
- `failureDomain`: `SGUI`、`CGUI`、`Z1` 的 GUI-RULES 分支。
- `replanTriggers`: 新 owner、计划外文件、完成语义改变、排除项失效。
- `authorizationGate`: 计划确认后 active；`specialApprovals: []`、`requiredApprovalIds: []`。

### SG — GLOBAL 精确 stage

- `nodeId`: `SG`
- `taskBoundary`: `GLOBAL`
- `operationKind`: stage
- `outcome`: codex-config index 只包含 `AGENTS.md`。
- `estimatedCost`: 低
- `hardPredecessors`: `RG`；等待 GLOBAL semantic PASS。
- `consumes`: RG PASS、GLOBAL working diff。
- `produces`: GLOBAL staged snapshot。
- `completionEvidence`: cached name-status 单文件，cached check 和完整 cached diff 通过。
- `readSet`: AGENTS、index、Git metadata。
- `writeSet`: codex-config index 的 AGENTS entry。
- `stateEffects`: 精确 stage，不改工作树正文。
- `commandScope`: 精确 `git add -- AGENTS.md` 与 cached 只读检查；禁止 `git add .`。
- `executionContext`: `codex-config` 当前 branch，GLOBAL Git owner 独占 index。
- `resourceLocks`: codex-config index write。
- `owner`: GLOBAL 唯一 Git owner。
- `verification`: 不含其他 codex-config 文件。
- `failureDomain`: `CG`、`Z1` 的 GLOBAL 分支。
- `replanTriggers`: stage 范围外、index/branch 漂移。
- `authorizationGate`: 计划确认与 `GLOBAL-AGENTS-EXTERNAL-WRITE` 均 active。

### CG — GLOBAL 独立 commit

- `nodeId`: `CG`
- `taskBoundary`: `GLOBAL`
- `operationKind`: commit
- `outcome`: 形成 `feat: default planned browser validation to headless` 本地提交。
- `estimatedCost`: 低
- `hardPredecessors`: `SG`；等待精确 GLOBAL staged snapshot。
- `consumes`: SG snapshot。
- `produces`: GLOBAL commit id。
- `completionEvidence`: commit 仅一文件，message/parent 正确，index 空。
- `readSet`: staged AGENTS、index、Git metadata。
- `writeSet`: codex-config object database、branch ref、index。
- `stateEffects`: 一个本地 commit，无 remote。
- `commandScope`: 单次 `git commit -m 'feat: default planned browser validation to headless'` 与只读 commit 审查；禁止 amend。
- `executionContext`: codex-config 当前 branch，GLOBAL Git owner 独占 index/ref。
- `resourceLocks`: codex-config index、object database、branch ref write。
- `owner`: GLOBAL 唯一 Git owner。
- `verification`: commit name-status 与 SG snapshot 一致。
- `failureDomain`: `Z1` 的 GLOBAL 分支。
- `replanTriggers`: hook 改范围、branch/parent 漂移、commit 集合错误。
- `authorizationGate`: 计划确认与 `GLOBAL-AGENTS-EXTERNAL-WRITE` 均 active。

### SGUI — GUI-RULES 精确 stage

- `nodeId`: `SGUI`
- `taskBoundary`: `GUI-RULES`
- `operationKind`: stage
- `outcome`: codex index 只新增三个 GUI-RULES entries。
- `estimatedCost`: 低
- `hardPredecessors`: `RGUI`；等待 GUI-RULES semantic PASS。
- `consumes`: RGUI PASS、三文件 working diff。
- `produces`: GUI-RULES staged snapshot。
- `completionEvidence`: cached name-status 仅三文件，cached check 和完整 cached diff 通过。
- `readSet`: 三目标、index、Git metadata；status 可见但不得操作 typeahead 四文件。
- `writeSet`: codex index 的三个 GUI-RULES entries。
- `stateEffects`: 精确 stage；typeahead working diff 保持未暂存。
- `commandScope`: 精确 `git add -- <三文件>` 与 cached 只读检查；禁止 `git add .`。
- `executionContext`: codex 当前 branch，GUI-RULES Git owner 独占 index。
- `resourceLocks`: codex index write。
- `owner`: GUI-RULES 唯一 Git owner。
- `verification`: 不含 DOCS、typeahead 或范围外文件。
- `failureDomain`: `CGUI`、`Z1` 的 GUI-RULES 分支。
- `replanTriggers`: stage 范围外、index/branch 漂移。
- `authorizationGate`: 计划确认后 active；`specialApprovals: []`、`requiredApprovalIds: []`。

### CGUI — GUI-RULES 独立 commit

- `nodeId`: `CGUI`
- `taskBoundary`: `GUI-RULES`
- `operationKind`: commit
- `outcome`: 形成 `feat(gui): tier browser acceptance by visibility` 本地提交。
- `estimatedCost`: 低
- `hardPredecessors`: `SGUI`；等待精确 GUI-RULES staged snapshot。
- `consumes`: SGUI snapshot。
- `produces`: GUI-RULES commit id。
- `completionEvidence`: commit 仅三文件，message/parent 正确，index 空，typeahead diff 未暂存。
- `readSet`: staged 三文件、index、Git metadata。
- `writeSet`: codex object database、branch ref、index。
- `stateEffects`: 一个本地 commit；typeahead working diff 保留，无 remote。
- `commandScope`: 单次 `git commit -m 'feat(gui): tier browser acceptance by visibility'` 与只读 commit 审查；禁止 amend。
- `executionContext`: codex 当前 branch，GUI-RULES Git owner 独占 index/ref。
- `resourceLocks`: codex index、object database、branch ref write。
- `owner`: GUI-RULES 唯一 Git owner。
- `verification`: commit name-status 与 SGUI snapshot 一致。
- `failureDomain`: `Z1` 的 GUI-RULES 分支。
- `replanTriggers`: hook 改范围、branch/parent 漂移、commit 集合错误。
- `authorizationGate`: 计划确认后 active；`specialApprovals: []`、`requiredApprovalIds: []`。

### Z1 — 两仓库终态审计

- `nodeId`: `Z1`
- `taskBoundary`: 无提交的最终 fan-in
- `operationKind`: fan-in
- `outcome`: 三个计划 commit 存在、范围正确，两个仓库 index 为空，typeahead 四文件仍未暂存且内容未被本计划改变。
- `estimatedCost`: 低
- `hardPredecessors`: `CG`、`CGUI`；等待两个实现 commit，DOCS commit 已由 D2 提供。
- `consumes`: 三个 commit id、RG PASS、RGUI PASS、两个仓库 status。
- `produces`: 最终完成或精确受阻报告。
- `completionEvidence`: commit name-status、branch/head、index/status、设计/计划/四实现文件 identity 全部吻合；无 remote。
- `readSet`: 两仓库 Git metadata、三 commits、目标文件与 typeahead dirty allowlist。
- `writeSet`: `[]`
- `stateEffects`: 结构化终态证据。
- `commandScope`: 两仓库只读 Git/readlink/rg 命令。
- `executionContext`: 两个已提交稳定状态，index 只读。
- `resourceLocks`: 两仓库 refs/index read。
- `owner`: 最终审计子代理，主代理作最终判断。
- `verification`: 明确区分“静态治理已实现”与“新任务已重新加载并实际路由”；后者本计划标记未验证。
- `failureDomain`: 终态报告；若是已有提交问题，插入独立修正 commit，禁止 amend。
- `replanTriggers`: commit 范围错误、typeahead 文件被改变、提示词未满足设计或需运行时新任务验证。
- `authorizationGate`: 所有前置能力完成后 active；只读。

## Ready set、关键路径与 fan-out/fan-in

- 初始 ready set：计划确认后只有 DOCS 最小提交预检 `D0`。
- `D0 -> D1 -> D2` 只处理两份工作文档及其独立本地提交；提交成功前不启动任何实施 preflight、授权或编辑节点。
- `D2` 完成后：完整实施 preflight `P0` ready。
- `P0` 完成后：`A0`、`F1`、`F2`、`F3` 同时 ready。GLOBAL 分支只有在 `A0` 获得 special approval 后 `G1` ready；GUI-RULES 不因 GLOBAL 等待用户授权而暂停。
- `F2 -> V2` 与 `F3 -> V3` 分别形成局部验证链；`F1` 不需要结构 validator。
- `VG -> RG -> SG -> CG` 是 GLOBAL 的独立审查与提交链；`F1`、`V2`、`V3` 汇合到 `RGUI -> SGUI -> CGUI`。
- GLOBAL 与 GUI-RULES 分属两个仓库和两个 index；各自审查通过后可以独立 stage/commit，不互相设置伪门禁。
- `CG` 与 `CGUI` 汇合到 `Z1`。

粗粒度关键路径取决于用户对 A0 的响应：通常为 `D0 -> D1 -> D2 -> P0 -> A0 -> G1 -> VG -> RG -> SG -> CG -> Z1`。若 A0 很快确认，则 `D2 -> P0 -> F2/F3 -> V2/V3 -> RGUI -> SGUI -> CGUI -> Z1` 可能成为关键路径。执行时必须依据真实事件重算，不得把本预测当成固定顺序。

## 漏并行与伪依赖审计

- `F1`、`F2`、`F3` 写集合不相交，且不操作 index；无硬依赖，必须并行启动。
- `V2` 只读取 F2 稳定文件，`V3` 只读取 F3 稳定文件；二者无共享写，可以并行。
- GLOBAL 和 GUI-RULES 位于不同仓库、不同 index；只有 DOCS 门禁和最终语义 fan-in 是共同前提，不能因同一主题串行等待。
- `SG -> CG` 与 `SGUI -> CGUI` 分别由各仓库唯一 Git owner 执行，两条链可以并行；同一仓库 stage 与 commit 因消费同一 index snapshot保持串行。
- `RG` 只依赖 GLOBAL 稳定 diff，`RGUI` 只依赖三个 GUI-RULES 稳定 diff；各自不可与本分支编辑并发，但不阻塞另一仓库。
- 不创建 worktree，因为跨 task 的并行写位于不同仓库；`codex` 内只有一个实现 task boundary，三个编辑共享当前 worktree但写集合不相交。若执行时出现第二个独立 codex 写任务或 index owner 冲突，必须重新计划。

## 失败域与停止条件

- GLOBAL special approval 被拒绝或未返回时，只暂停 GLOBAL 分支；DOCS 和 GUI-RULES 可继续，最终如实报告 GLOBAL 未实施，不能宣称完整完成。
- 任一 skill validator 失败，只暂停该 skill、`RGUI` 和 GUI-RULES commit；不得安装依赖或改用直接 `python`/`python3`。
- CLI help、session schema 或二级直接入口与计划不符时，暂停 F2 及依赖后继；不得新增脚本、修改配置或回退到有头模式。
- formatter、validator、hook 或命令产生范围外修改时，停止受影响节点并只读审计；本计划不授权恢复、删除、暂存或提交范围外产物。
- `RG` 或 `RGUI` 发现计划内、未提交的语义问题时，在对应 task boundary 插入精确修正节点并重新运行受影响验证；若问题改变四文件范围、三级行为、授权边界或完成声明，回到计划确认。
- 任一已有提交需要修正时，创建新的独立修正提交，禁止 amend。
- 新任务重新加载后的实际路由验证不属于本计划，不得为了取得“已生效”证据继续扩大任务。

## 完成标准

- DOCS、GLOBAL、GUI-RULES 三个独立本地提交均存在且范围精确；无 remote、force、amend、squash。
- 全局提示词保持简洁，旧的过宽真实 GUI 规则不残留。
- 前端 AGENTS、toolchain skill 和 debug skill 对三级 owner、默认模式、授权、失败和完成声明无冲突。
- 两个 skill validator、两个仓库 diff/cached checks、RG 单文件审查和 RGUI 六用例独立审查通过。
- `codex` 的四个 typeahead 工作树文件保持未暂存且不被本计划修改。
- 最终报告分别说明静态治理实现状态、GLOBAL special approval、未执行的运行时新任务验证，以及执行图要求的 `实际并行`、`关键路径`、`未启动 ready 节点`。

## 实施前门禁

本计划落盘不等于计划确认，也不授权提交工作文档或开始实施。只有用户后续明确“确认计划”或等价表达后，才能先执行 DOCS 最小链 `D0 -> D1 -> D2`；`P0` 和任何实施授权、编辑、验证节点都必须等待 `D2` 成功。

即使计划已确认，修改 `/Users/jiangsheng/cnb/codex-config/AGENTS.md` 前仍必须由 A0 展示精确拟写文本、canonical target 与工作树/stage/local commit 副作用，并取得面向受保护全局提示词和项目外主动修改的单独明确确认。该确认只覆盖展示的 GLOBAL 动作，不扩大 GUI-RULES 或其他文件范围。
