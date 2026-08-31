# Codex GUI Composer Skill Chip 原生目标探测诊断计划

日期：2026-08-31

状态：待确认

计划类型：实施计划前的诊断闭包；不实施 production 修复

依据设计：[Codex GUI Composer Skill Chip 四方向原子导航设计](../../../specs/2026/08/31/2026-08-31-codex-gui-composer-skill-chip-four-direction-navigation-design.md)

## 目标

用三浏览器无头 Vitest Browser Mode 诊断闭合一个关键未知：浏览器原生 character/line movement 是否能在不提交移动的前提下，被稳定探测并区分“目标命中 inline skill chip”与“目标位于 chip 外”。

本计划完成后只产生诊断报告与其有界原始 evidence，不保留诊断 hook、测试代码或 production 修改。只有报告证明设计门禁成立，后续新一轮才能编写 production implementation plan；若门禁不成立，则返回设计阶段，禁止以逻辑扫描、吸附、阈值、单浏览器分支或静默 fallback 继续。

## 当前事实闭包

- `SkillNode` 是 inline、keyboard-selectable 的 `DecoratorNode`；`SkillEditingPlugin` 当前只为已选中 skill 处理左右退场。
- `PlainTextPlugin` 的左右进入依赖 Lexical 通用 character movement；上下没有等价的 inline decorator stop。
- `NodeSelection` 不保留 caret x 或 DOM range，因此进入 chip 前的原生目标只能在 collapsed `RangeSelection` 尚存在时探测。
- 现有 `ComposerEditor.browser.test.tsx` 只验证同行逻辑前后边界，不能证明显式换行、soft-wrap 或多浏览器视觉落点。
- 当前 `codex-gui/vitest.browser.parallel.config.ts` 通过 Playwright provider 配置 Chromium、Firefox、WebKit 三个 instance；`vitest.browser.shared.config.ts` 固定 `headless: true`。
- 当前 fnm 环境可解析 Node `v24.17.0`、pnpm `10.34.5` 和 Vitest `4.1.10`。计划命令必须在 `/Users/jiangsheng/cnb/codex/codex-gui` 运行，并通过 live `package.json` 的 `test:browser:parallel` script；仓库根目录不能作为该入口的 cwd。

## 范围与禁止项

允许的最终写入：

- 本计划文档；
- 已确认设计文档；
- 诊断完成后新建的 topic 目录 `docs/superpowers/reports/2026/08/31/2026-08-31-codex-gui-composer-skill-chip-native-target-diagnostic/`；
- topic 目录中的 `report.md` 与 `vitest-evidence.json`。

Vitest JSON reporter 的原始结构化证据直接写入上述 `vitest-evidence.json`，以样本计数和 SHA-256 作为稳定交接身份，并与 `report.md` 一起提交。Evidence 必须有硬上限，不得包含真实用户输入或项目外隐私。

允许的临时写入：

- `codex-gui/src/features/composerEditor/ComposerEditor.tsx` 中只为诊断读取 Lexical selection/editor 状态的临时 test hook；
- `codex-gui/src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx` 中只为本计划运行的临时诊断用例与采样辅助函数。

执行结束前必须把两个临时文件精确恢复到执行前的已验证 clean 基线；若任一文件执行前已有修改，或执行中出现非本节点写入，停止，不得覆盖。

禁止：

- 修改或保留 `SkillEditingPlugin.tsx`、`SkillNode.ts`、`SelectedSkillToken.tsx` 或其他 production 行为；
- 把临时诊断用例直接改名为正式回归测试；
- 切换 `RichTextPlugin`，新增通用 decorator-navigation Module，或决定 production DOM 命中算法；
- 启动可见浏览器、DevTools 或桌面 GUI；
- 安装、更新或下载依赖、运行时或浏览器二进制；
- stage 或 commit Git ignore 匹配的 research 文件；
- amend、squash、force 或任何 Git remote 操作。

## 诊断矩阵与证据格式

每个浏览器至少覆盖：

- 截图结构：上一行普通文本、中间独占一行 chip、下一行普通文本；
- 同行 `text + chip + text`、only-chip、连续两个 chip；
- 显式 `LineBreakNode` 与 CSS soft-wrap；
- 窄容器长 chip，以及 chip 因宽度变化换行；
- LTR 与 RTL；
- 从 collapsed caret 对四个无修饰方向键探测原生目标，分别覆盖目标落入 chip、普通字符、普通空白、行首和行尾；
- 从唯一 skill `NodeSelection` 实际按下四个无修饰方向键，采样本次退出后的 DOM/Lexical caret、visual left/right 与 logical previous/next 映射；
- 从 chip 边界再按一次同方向键，确认下一步的原生目标可被单独观察；
- 修饰键组合只采当前行为基线，不能被临时 hook 接管。

每个样本记录：

- 浏览器、场景、writing direction、按键、起点；
- 探测前和探测后的 Lexical selection 类型、key、offset、point type；
- 原生 `Selection` 的 anchor/focus node、offset、`rangeCount`、collapsed 状态；
- 来源 caret rect、探测目标 rect、chip rect；
- 探测目标与 chip host 的 DOM 关系；
- `data-selected`、`document.activeElement`；
- editor 与外层容器的探测前后 scroll offsets；
- 从探测开始到同步阶段、microtask、下一 animation frame 和下一 macrotask内发生的 `selectionchange`、`focus`、`blur`、`focusin`、`focusout`、`scroll` 事件顺序、target 与状态快照；
- 恢复后 selection、focus、scroll 是否与探测前一致，以及探测期间是否仍产生了可观察的瞬时事件或滚动；
- 是否能无阈值地区分 `hit-chip` 与 `native-outside-chip`。

每个诊断 case 把一个有界样本写入 `TestContext.task.meta.skillChipNavigationSample`。该值只能由 JSON scalar、array 与 plain record 组成；DOM node、`Event`、`Selection`、`Range`、`DOMRect` 和 element reference 必须先投影成稳定描述符或有限数值字段，禁止把 live object、循环结构、函数、symbol 或无界字符串写入 meta。DOM rect 固定投影为 `{ x, y, width, height, top, right, bottom, left }`；DOM/事件 target 固定投影为有限的 node type/name、synthetic fixture identifier、offset 与 containment relation，不序列化完整 DOM 或用户文本。

Vitest JSON reporter 必须把所有样本写入 topic 目录中的单一 `vitest-evidence.json`；完成证据包括预期/实际 case 数、三浏览器 project identity、文件 SHA-256 和每个样本唯一键。报告必须逐浏览器列出原始现象、共同规律、差异和不能解释的样本，并引用有界原始 evidence；不得依赖可能截断的标准输出，也不得只写“通过”或只保留截图。

## 描述式执行 DAG

### 节点 `DOC-STAGE`

- `taskBoundary`：工作文档提交；独立本地提交。
- `operationKind`：stage。
- `outcome`：Git index 只包含已确认设计和本诊断计划的 staged snapshot。
- `estimatedCost`：低。
- `deferralEvidence`：无。
- `hardPredecessors`：用户明确确认本计划；等待稳定产物为计划授权。
- `consumes`：设计文档、本计划、计划确认。
- `produces`：经审查的 docs-only staged snapshot。
- `completionEvidence`：staged 文件集合精确等于两份文档；`git diff --cached --check` 通过。
- `readSet`：两份文档、Git status、Git diff、Git index。
- `writeSet`：当前 worktree 的 Git index。
- `stateEffects`：暂存两份文档；不 commit。
- `commandScope`：`git status --short`、精确 `git diff`、`git add -- <design> <plan>`、`git diff --cached --check`、精确 staged diff。
- `subdelegation`：禁止。
- `executionContext`：当前 `/Users/jiangsheng/cnb/codex` worktree、当前 branch、共享主 Git index；独占 index 写锁。
- `resourceLocks`：`/Users/jiangsheng/cnb/codex/.git/index` write；两份 docs read。
- `owner`：唯一 Git owner；负责 stage 与 staged snapshot 审查。
- `verification`：ignored research 不得进入 index；staged 文件集合精确等于两份文档。
- `failureDomain`：失败只暂停所有诊断后继；不得绕过文档提交门禁。
- `replanTriggers`：文档路径漂移、设计不再是 `已确认`、index 含范围外内容。
- `authorizationGate`：计划确认前 `pending`；确认后由 `$action-authorization` 为精确 docs stage 激活。

### 节点 `DOC-COMMIT`

- `taskBoundary`：工作文档提交；独立本地提交。
- `operationKind`：commit。
- `outcome`：把 `DOC-STAGE` 的稳定 snapshot 创建为 docs-only local commit。
- `estimatedCost`：低。
- `deferralEvidence`：无。
- `hardPredecessors`：`DOC-STAGE`；等待经审查的 staged snapshot。
- `consumes`：docs-only staged snapshot。
- `produces`：docs-only commit id。
- `completionEvidence`：`git commit -m 'docs: plan skill chip navigation diagnostics'` 成功；commit 文件集合精确等于两份文档；提交后两份文档无 diff。
- `readSet`：Git index 与 staged snapshot。
- `writeSet`：本地 Git history。
- `stateEffects`：创建一个本地 commit；不新增 stage。
- `commandScope`：`git commit -m 'docs: plan skill chip navigation diagnostics'` 与只读提交核验。
- `subdelegation`：禁止。
- `executionContext`：当前 worktree、当前 branch、共享主 Git index；独占 index/history 写锁。
- `resourceLocks`：`/Users/jiangsheng/cnb/codex/.git/index` write、local Git history write。
- `owner`：唯一 Git owner。
- `verification`：commit identity 与文件集合匹配 `DOC-STAGE` snapshot。
- `failureDomain`：失败暂停所有诊断后继；不得绕过文档提交门禁。
- `replanTriggers`：staged snapshot 漂移、commit hook 产生计划外变化。
- `authorizationGate`：计划确认前 `pending`；确认后对该精确 local commit 为 `active`。

### 节点 `ENV-PREFLIGHT`

- `taskBoundary`：诊断任务；无提交。
- `operationKind`：调查。
- `outcome`：证明 cwd、Node/pnpm/Vitest、三浏览器 config、目标测试文件和临时写入基线可用。
- `estimatedCost`：低。
- `deferralEvidence`：无。
- `hardPredecessors`：`DOC-COMMIT`；等待 docs commit id。
- `consumes`：live `package.json`、Vitest configs、fnm 环境、两个临时目标文件。
- `produces`：执行环境预检记录与两个目标文件的 clean baseline SHA-256。
- `completionEvidence`：cwd 为 `codex-gui`；pnpm 不来自 Codex runtime shim；Vitest 版本可解析；parallel config 仍含三浏览器且 headless；两个目标文件相对 HEAD 无 diff。
- `readSet`：`codex-gui/package.json`、Vitest configs、两个临时目标文件、Git status/diff。
- `writeSet`：无主动文件写入。
- `stateEffects`：只读进程状态；不运行测试。
- `commandScope`：`pwd`、`git status --short`、精确 `git diff --quiet -- <files>`、`shasum -a 256 <two files>`、`/opt/homebrew/bin/fnm env --shell zsh`、`/opt/homebrew/bin/fnm exec --using-file which pnpm`、版本查询、只读 config/package script 检查。
- `subdelegation`：禁止。
- `executionContext`：当前 worktree；无 index 写入。
- `resourceLocks`：两个临时目标文件 read；package/config read。
- `owner`：诊断 owner。
- `verification`：任一工具、浏览器配置或 clean baseline 不成立即失败。
- `failureDomain`：暂停 `INSTRUMENT` 及全部后继；其他无独立节点。
- `replanTriggers`：工具版本、测试入口、浏览器 instance 或文件路径变化。
- `authorizationGate`：计划确认后，纯只读预检为 `active`。

### 节点 `INSTRUMENT`

- `taskBoundary`：诊断任务；临时写入，不形成代码提交。
- `operationKind`：编辑。
- `outcome`：加入最小 test-only selection 观测 seam 与诊断矩阵，且不改变导航行为。
- `estimatedCost`：中。
- `deferralEvidence`：无。
- `hardPredecessors`：`ENV-PREFLIGHT`；等待 clean baseline identity。
- `consumes`：现有 Composer fixture/helpers、Lexical selection API、已确认诊断字段。
- `produces`：可由当前 parallel Browser config 收集的临时诊断测试，以及两个 post-edit 文件 SHA-256 和精确 diff snapshot。
- `completionEvidence`：TypeScript 结构检查无新增 production 行为分支；测试名称有唯一诊断前缀；采样字段完整；post-edit identities 已记录。
- `readSet`：`ComposerEditor.tsx`、`ComposerEditor.browser.test.tsx`、直接相关 Lexical API。
- `writeSet`：仅上述两个临时目标文件。
- `stateEffects`：工作树临时 diff；不 stage、不 commit。
- `commandScope`：`apply_patch` 编辑；只读 `git diff --check`、精确 diff 审查、`shasum -a 256 <two files>`。
- `subdelegation`：禁止。
- `executionContext`：当前 worktree；两个文件独占写锁；不操作 index。
- `resourceLocks`：两个临时目标文件 write。
- `owner`：诊断 owner。
- `verification`：观测 seam 只暴露测试所需的 editor/selection 快照；无按键处理、selection 改写或 product fallback；事件监听在每个 case 后移除且样本有硬上限。
- `failureDomain`：暂停 Browser 运行；进入 `RESTORE` 清理已产生的临时 diff。
- `replanTriggers`：必须修改第三个 production 文件、必须改变真实导航行为、现有组件无法无行为变化地暴露观测。
- `authorizationGate`：计划确认后，对两个精确文件的临时写入为 `active`；不包含其他文件。

### 节点 `BROWSER-DIAGNOSE`

- `taskBoundary`：诊断任务；无代码提交。
- `operationKind`：验证。
- `outcome`：Chromium、Firefox、WebKit 各自完成全部诊断场景并输出结构化样本。
- `estimatedCost`：高。
- `deferralEvidence`：不拆成三个并行 shell 节点；当前 config 的三个 instances 共享一个 Vite server，单一权威命令能同时证明收集与运行，拆分命令会争用同一 Browser runner 和临时源码且降低输出可关联性。若 live config 改为隔离 runner，此证据失效并需重审。
- `hardPredecessors`：`INSTRUMENT` 与 `EVIDENCE-PREP`；等待可收集的诊断测试、post-edit identities 与已创建的 report topic 目录。
- `consumes`：临时诊断 test、`test:browser:parallel` script、parallel Browser config、三浏览器 Playwright provider、`EVIDENCE-PREP` 发布的 topic 目录。
- `produces`：Vitest JSON evidence 文件、逐浏览器 project identity、收集数量、样本 metadata 与文件 SHA-256。
- `completionEvidence`：JSON 文件显示目标诊断前缀在 Chromium、Firefox、WebKit 均被收集和执行；预期 case 数等于实际样本唯一键数；每个样本字段完整；evidence SHA-256 已记录。现有产品行为可以不符合设计，但测试基础设施、采样和 metadata 完整性不得失败。
- `readSet`：临时两个文件、Vite/Vitest config、node_modules、浏览器 binaries。
- `writeSet`：精确 `docs/superpowers/reports/2026/08/31/2026-08-31-codex-gui-composer-skill-chip-native-target-diagnostic/vitest-evidence.json`。
- `stateEffects`：写入一个 bounded JSON evidence；启动无头 Browser 进程、Vite server 并允许测试缓存；不得打开 UI/report/trace viewer。
- `commandScope`：在 `/Users/jiangsheng/cnb/codex/codex-gui` 运行 `/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:parallel -- --run src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx --reporter=json --outputFile=/Users/jiangsheng/cnb/codex/docs/superpowers/reports/2026/08/31/2026-08-31-codex-gui-composer-skill-chip-native-target-diagnostic/vitest-evidence.json -t 'diagnoses skill chip native direction targets'`；最后只读校验 JSON、计数与 `shasum -a 256 /Users/jiangsheng/cnb/codex/docs/superpowers/reports/2026/08/31/2026-08-31-codex-gui-composer-skill-chip-native-target-diagnostic/vitest-evidence.json`。
- `subdelegation`：禁止。
- `executionContext`：当前 worktree；共享 Browser runner 独占锁；不操作 index。
- `resourceLocks`：Vitest/Vite Browser runner write；两个临时源码 read；`vitest-evidence.json` write。
- `owner`：诊断 owner。
- `verification`：核对实际收集浏览器、场景数、`task.meta.skillChipNavigationSample` 数量与唯一键；不能把零收集、跳过某浏览器、stdout 或 reporter 成功当作诊断成功。
- `failureDomain`：基础设施或采样失败暂停 `REPORT` 及其后继，但必须先等待 Browser 进程终止、发布失败证据，再把 `RESTORE` 作为清理节点置为 ready；产品现状不符合设计是有效诊断数据，不构成基础设施失败。
- `replanTriggers`：某浏览器缺失、可见窗口被要求、必须安装 binary、目标测试未实际收集、采样改变 focus/scroll/selection 且无法恢复。
- `authorizationGate`：计划确认后，对该单一无头验证命令为 `active`；有头与安装保持禁止。

### 节点 `EVIDENCE-PREP`

- `taskBoundary`：诊断任务；无提交。
- `operationKind`：编辑。
- `outcome`：创建精确 dated report topic 目录，供 Vitest JSON reporter 和最终报告使用。
- `estimatedCost`：低。
- `deferralEvidence`：无。
- `hardPredecessors`：`ENV-PREFLIGHT`；等待可信环境记录。
- `consumes`：项目文档布局规则与本计划固定绝对路径。
- `produces`：空的 report topic 目录及其 canonical identity。
- `completionEvidence`：精确目录新建成功且为空；不存在同名文件或旧 evidence。
- `readSet`：`docs/superpowers/reports/2026/08/31` 父目录 metadata。
- `writeSet`：仅 `docs/superpowers/reports/2026/08/31/2026-08-31-codex-gui-composer-skill-chip-native-target-diagnostic/`。
- `stateEffects`：创建一个项目内 dated report topic 目录。
- `commandScope`：`mkdir -p docs/superpowers/reports/2026/08/31/2026-08-31-codex-gui-composer-skill-chip-native-target-diagnostic`，随后只读核对 canonical path 与空目录状态。
- `subdelegation`：禁止。
- `executionContext`：当前 worktree；不操作 Git index。
- `resourceLocks`：精确 report topic 目录 write。
- `owner`：诊断 evidence owner。
- `verification`：目录非空时失败；不得覆盖或复用旧 evidence。
- `failureDomain`：只暂停 `BROWSER-DIAGNOSE` 及后继；`INSTRUMENT` 若已运行仍进入安全恢复。
- `replanTriggers`：目标已存在且非空、canonical identity 异常或目录路径约定变化。
- `authorizationGate`：计划确认后，对精确 report topic 目录创建为 `active`。

### 节点 `RESTORE`

- `taskBoundary`：诊断任务；无代码提交。
- `operationKind`：编辑。
- `outcome`：两个临时目标文件恢复到 `ENV-PREFLIGHT` 记录的 HEAD baseline，且没有残留代码 diff。
- `estimatedCost`：低。
- `deferralEvidence`：无；无论 Browser 节点成功或失败都必须运行。
- `hardPredecessors`：正常路径等待 `BROWSER-DIAGNOSE` 完成并发布 evidence identity；失败路径等待 Browser 未启动或进程已终止的稳定失败证据。只有 `INSTRUMENT` 已产生临时 diff 时该节点才需要执行。
- `consumes`：clean baseline SHA-256、post-edit SHA-256、精确 diff snapshot、两个临时文件。
- `produces`：clean code baseline。
- `completionEvidence`：`git diff --quiet -- <two files>` 成功，文件 identity 与预检一致。
- `readSet`：两个临时文件、HEAD baseline。
- `writeSet`：仅两个临时目标文件。
- `stateEffects`：丢弃本计划自身的临时诊断 diff；不触碰其他文件或 index。
- `commandScope`：先用 `shasum -a 256 <two files>` 和精确 `git diff -- <two files>` 证明当前内容逐字匹配 `INSTRUMENT` 发布的 post-edit identities；匹配后才用 `git restore --source=HEAD -- <two exact files>`；随后用 baseline SHA-256 与只读 diff/status 核验。
- `subdelegation`：禁止。
- `executionContext`：当前 worktree；两个文件独占写锁；不操作 index。
- `resourceLocks`：两个临时目标文件 write。
- `owner`：诊断 owner。
- `verification`：当前文件 SHA-256 或 diff snapshot 任一不匹配 post-edit identity，即视为可能混入非本节点写入，停止并保留证据，不执行覆盖式恢复。
- `failureDomain`：恢复失败暂停报告提交和所有后继；不得留下临时 hook 后继续。
- `replanTriggers`：文件 baseline 漂移、并发写入、HEAD 变化。
- `authorizationGate`：计划确认后，对两个精确文件恢复本计划临时 diff 为 `active`。

### 节点 `REPORT`

- `taskBoundary`：诊断任务；独立本地提交。
- `operationKind`：编辑。
- `outcome`：创建稳定诊断报告，给出 `supported`、`unsupported` 或 `inconclusive` 门禁结论及逐浏览器证据。
- `estimatedCost`：中。
- `deferralEvidence`：无。
- `hardPredecessors`：`BROWSER-DIAGNOSE` 与 `RESTORE`；等待完整 evidence identity 与 clean code baseline。
- `consumes`：topic 目录中的 `vitest-evidence.json`、样本计数与 SHA-256、clean code baseline、设计门禁。
- `produces`：诊断报告文件。
- `completionEvidence`：报告区分事实、用户报告和推论；包含浏览器矩阵、selection/focus/scroll 事件时序与最终状态、RTL 映射、无法解释样本、evidence SHA-256、有界原始样本附录与下一阶段结论。
- `readSet`：`vitest-evidence.json`、设计、计划、两个已恢复源码文件。
- `writeSet`：仅 topic 目录中的 `report.md`。
- `stateEffects`：创建一个 Markdown 报告；不修改 research。
- `commandScope`：`apply_patch` 创建 topic 目录中的 `report.md`、`git diff --check` 与精确 diff 审查。
- `subdelegation`：禁止。
- `executionContext`：当前 worktree；报告文件独占写锁；不操作 index。
- `resourceLocks`：报告 write；Browser 输出 read。
- `owner`：诊断 owner。
- `verification`：`supported` 只在三浏览器均能无阈值区分、全部反例存在、同步和异步事件日志均证明探测恢复无可观察副作用时成立；否则只能为 `unsupported` 或 `inconclusive`。
- `failureDomain`：暂停报告提交；code baseline 已恢复，不扩大到 docs commit。
- `replanTriggers`：证据不足以得出三值结论、报告需要新增未授权实验。
- `authorizationGate`：计划确认后，对精确报告文件写入为 `active`。

### 节点 `ARTIFACTS-STAGE`

- `taskBoundary`：诊断任务；独立本地提交。
- `operationKind`：stage。
- `outcome`：Git index 只包含 `report.md` 与 `vitest-evidence.json` 的 staged snapshot，且 code tree 无 diff。
- `estimatedCost`：低。
- `deferralEvidence`：无。
- `hardPredecessors`：`REPORT`；等待报告 diff 与 clean code baseline。
- `consumes`：诊断报告、报告验证、clean code status。
- `produces`：经审查的 diagnostic-artifacts-only staged snapshot。
- `completionEvidence`：staged 文件集合精确等于 `report.md` 与 `vitest-evidence.json`；两个临时源码相对 HEAD 无 diff；`git diff --cached --check` 通过。
- `readSet`：`report.md`、`vitest-evidence.json`、Git status/diff/index。
- `writeSet`：Git index。
- `stateEffects`：stage 报告；不 commit。
- `commandScope`：精确 `git add -- <report.md> <vitest-evidence.json>`、`git diff --cached --check`、精确 staged diff。
- `subdelegation`：禁止。
- `executionContext`：当前 worktree、当前 branch、共享主 Git index；独占 index 写锁。
- `resourceLocks`：`/Users/jiangsheng/cnb/codex/.git/index` write；`report.md` 与 `vitest-evidence.json` read。
- `owner`：唯一 Git owner；负责 stage 与 staged snapshot 审查。
- `verification`：不 stage ignored research、测试缓存、临时源码或其他用户变更。
- `failureDomain`：暂停 artifacts commit 与终态审查；不得重做或 amend 已有 docs commit。
- `replanTriggers`：index 污染、报告之外存在计划引入的残留 diff。
- `authorizationGate`：计划确认后，对精确 artifacts stage 为 `active`。

### 节点 `ARTIFACTS-COMMIT`

- `taskBoundary`：诊断任务；独立本地提交。
- `operationKind`：commit。
- `outcome`：把 `ARTIFACTS-STAGE` 的稳定 snapshot 创建为 diagnostic-artifacts-only local commit。
- `estimatedCost`：低。
- `deferralEvidence`：无。
- `hardPredecessors`：`ARTIFACTS-STAGE`；等待经审查的 diagnostic-artifacts-only staged snapshot。
- `consumes`：diagnostic-artifacts-only staged snapshot。
- `produces`：diagnostic-artifacts-only commit id。
- `completionEvidence`：`git commit -m 'docs: record skill chip navigation diagnostics'` 成功；commit 文件集合精确等于 `report.md` 与 `vitest-evidence.json`。
- `readSet`：Git index 与 staged report snapshot。
- `writeSet`：本地 Git history。
- `stateEffects`：创建一个本地 commit；不新增 stage。
- `commandScope`：`git commit -m 'docs: record skill chip navigation diagnostics'` 与只读提交核验。
- `subdelegation`：禁止。
- `executionContext`：当前 worktree、当前 branch、共享主 Git index；独占 index/history 写锁。
- `resourceLocks`：`/Users/jiangsheng/cnb/codex/.git/index` write、local Git history write。
- `owner`：唯一 Git owner。
- `verification`：commit identity 与文件集合匹配 `ARTIFACTS-STAGE` snapshot；ignored research 不入 commit。
- `failureDomain`：只暂停终态审查；不得 amend 已有 commits。
- `replanTriggers`：staged snapshot 漂移、commit hook 产生计划外变化。
- `authorizationGate`：计划确认后，对该精确 local commit 为 `active`。

### 节点 `GATE-RESULT`

- `taskBoundary`：无提交的 fan-in / 审查节点。
- `operationKind`：审查。
- `outcome`：根据报告给出唯一下一阶段路由，不继续实施。
- `estimatedCost`：低。
- `deferralEvidence`：无。
- `hardPredecessors`：`ARTIFACTS-COMMIT`；等待 diagnostic-artifacts-only commit id。
- `consumes`：诊断报告、raw evidence 与两个 commit id。
- `produces`：`supported → 可新建 production implementation plan`，或 `unsupported/inconclusive → 返回设计`。
- `completionEvidence`：向用户报告结论、实际并行、关键路径与未启动 ready 节点。
- `readSet`：两个 commits、报告、最终 Git status。
- `writeSet`：无。
- `stateEffects`：无。
- `commandScope`：只读 Git/status 检查；不编辑、不 stage、不 commit。
- `subdelegation`：禁止。
- `executionContext`：当前 worktree；无 index 写入。
- `resourceLocks`：最终状态 read。
- `owner`：主协调 owner。
- `verification`：不得在本节点继续写 production plan 或代码。
- `failureDomain`：无后继；按证据报告受阻或完成。
- `replanTriggers`：报告结论与设计门禁不一致。
- `authorizationGate`：计划确认后只读审查为 `active`。

## 调度与拓扑摘要

- 初始 ready set：计划确认后仅 `DOC-STAGE`。
- 关键路径：`DOC-STAGE → DOC-COMMIT → ENV-PREFLIGHT → INSTRUMENT → BROWSER-DIAGNOSE → RESTORE → REPORT → ARTIFACTS-STAGE → ARTIFACTS-COMMIT → GATE-RESULT`。
- fan-out：`ENV-PREFLIGHT` 后，`INSTRUMENT` 与 `EVIDENCE-PREP` 读写集合不相交，可并行形成临时测试和 report topic 目录；三浏览器仍由一个已核验的 Vitest Browser command 通过三个 instances 运行。
- fan-in：`REPORT` 同时消费带 SHA-256 的 Browser JSON evidence 与 `RESTORE` 的 clean baseline；`GATE-RESULT` 消费 diagnostic-artifacts-only commit。
- worktree：不创建新 worktree 或 branch；临时源码、Browser runner 与 Git index 均在当前 worktree 串行持锁。
- 提交拓扑：docs-only commit 与 diagnostic-artifacts-only commit 两个独立本地提交；不 squash、不 amend。
- 最终验证拓扑：先证明无残留 code diff，再允许提交报告；最终只读核对两个提交、ignored research 未入 index、无计划引入的残留变更。

## 暂停与返回条件

出现以下任一情况，停止受影响后继并返回相应门禁：

- 三浏览器不能全部运行，或目标诊断测试未实际收集；
- 需要安装或下载浏览器/依赖；
- 需要打开可见浏览器或桌面窗口；
- 必须修改当前两个临时目标以外的源码；
- 探测不能无阈值区分 chip 命中与 chip 外目标；
- 探测/恢复产生不可消除的 selection、focus 或 scroll 副作用；
- RTL 映射、soft-wrap 或 `contenteditable=false` host 的行为不能形成三浏览器一致契约；
- 临时文件 baseline 漂移或无法安全恢复；
- Git index 出现范围外内容。

## 本计划不声称的内容

- 不声称已复现用户报告的具体多行左右分支；
- 不声称 `Selection.modify()`、caret rect 或任一 DOM point 算法已经可用；
- 不声称三浏览器结果相同；
- 不承诺诊断一定能解锁 production implementation plan；
- 不授权 production 修复、正式回归测试、Level 2 real-runtime acceptance 或可见桌面验收。
