# Codex GUI 导航菜单 HeroUI 对齐实施计划

## 状态与边界

- 计划状态：待确认
- 日期：2026-09-04
- 设计依据：[Codex GUI 导航菜单 HeroUI 对齐设计](../../../../specs/2026/09/04/2026-09-04-codex-gui-navigation-menu-heroui-design.md)
- 计划编写基线：`dev` / `1374e6a8851403a86d9fa2fd12c809d151370f90`
- 实现分支：`codex/gui-navigation-menu-heroui`
- 实现 worktree：`/Users/jiangsheng/cnb/codex/.worktrees/gui-navigation-menu-heroui`

本文是待确认的实施计划，不授权执行任何节点。用户明确确认本计划后，才允许按本文执行文档
提交、worktree 创建、代码与测试编辑、Lingui 生成和翻译、格式化、验证、stage 与本地提交。

本计划不授权 Git remote、merge、rebase、cherry-pick、amend、squash、force、worktree cleanup、
依赖安装、可见浏览器或计划外文件修改。代码修改只能发生在上述独立 worktree 中。

## 已核验事实

- 当前生产入口是 `AppShellTopBar.tsx` 中的 HeroUI `Drawer`、语义 `nav` 和两个 `Button`；
  route target 是当前页面的唯一 owner，active thread id 只控制“当前任务”的 disabled 状态。
- HeroUI `Button` 3.2.4 的 `ghost` variant 默认透明、hover/pressed 使用 `default` token，
  `fullWidth` 提供整行宽度，并保留标准 focus、pressed 与 disabled 状态。
- HeroUI `Description` 脱离受支持的 Text slot context 会返回 `null`；当前 Button 不提供该
  context。因此说明使用普通文本节点和 `aria-describedby`，不在 Drawer 外误用
  `Dropdown.Item`、`Dropdown.ItemIndicator` 或 `Description`。
- Lingui 权威入口是 `codex-gui/package.json` 的 `messages:extract`，配置只生成
  `src/locales/en.po` 与 `src/locales/zh-CN.po`。新增 source messages 为
  `Open current task` 和 `Browse task history`。
- `test:browser:parallel` 的 live config 会收集
  `src/features/appShell/__tests__/AppShellTopBar.browser.test.tsx`，并在 headless Chromium、
  Firefox、WebKit 中运行；`ci` 只运行 Browser smoke，不能替代目标测试。
- worktree 候选路径和 branch 当前不存在。`dev` 包含全部默认 sparse control-plane 输入。
  `/Users/jiangsheng/cnb/codex/.worktrees/vitest` 的直接目标是
  `/Users/jiangsheng/cnb/vitest`，最终物理目标是 `/Users/jiangsheng/GitHub/vitest`，与
  worktree 脚本的 direct mapping 判定兼容。
- `/opt/homebrew/bin/fnm` 与 `playwright-cli` 当前存在；实施前仍须在实际 worktree 中重做
  工具、cwd、输入与目标收集预检，禁止安装缺失组件。
- 计划编写时 TCP `5173` 已无监听进程。执行时仍须重新核验；本计划只授权从 feature
  worktree 启动并停止本计划自己的 Vite session，不授权终止、替换或恢复其他 checkout 或
  用户拥有的进程。

## 修改范围

### 文档提交边界

- `docs/superpowers/specs/2026/09/04/2026-09-04-codex-gui-navigation-menu-heroui-design.md`
- `docs/superpowers/plans/2026/09/04/2026-09-04-codex-gui-navigation-menu-heroui-plan.md`

### 行为提交边界

- `codex-gui/src/features/appShell/AppShellTopBar.tsx`
- `codex-gui/src/features/appShell/__tests__/AppShellTopBar.browser.test.tsx`
- `codex-gui/src/locales/en.po`
- `codex-gui/src/locales/zh-CN.po`

不得新增组件、CSS、route、state owner、catalog、locale、快照或兼容路径。权威生成入口若产生
上述两份 catalog 之外的变化，或代码实现需要计划外文件，暂停受影响节点并回到计划门禁。

## 计划任务与提交拓扑

### `TASK-DOC`：工作文档提交

唯一提交包含上述两份工作文档，建议提交信息：
`docs: plan HeroUI navigation menu`。

该提交必须在当前 `dev` checkout 中形成，并且必须先于 worktree 创建。只允许 stage 两个文档
路径；其他已有或后来出现的工作树变化属于用户工作，不进入 index。

### `TASK-IMPL`：导航菜单行为提交

唯一提交包含上述四个行为文件，建议提交信息：
`feat(codex-gui): align navigation menu styling`。

该提交在 `codex/gui-navigation-menu-heroui` worktree 中形成。源代码、直接 Browser 测试、
catalog 生成与人工中文翻译共同组成一个用户可见行为边界；不把 import 或声明顺序调整扩张成
独立重排任务，也不顺手调整范围外代码。

若提交后的最终验证发现本提交引入的问题，修正必须形成新的独立提交，禁止 amend 或把修正
重写进原提交。最终状态只保留一条 Drawer 导航实现路径。

## 描述式执行 DAG

下列节点记录是权威依赖结构；节点编号和文档顺序本身不构成依赖。

### `N00-doc-review`

- `taskBoundary`: `TASK-DOC`
- `operationKind`: 审查
- `outcome`: 两份工作文档内容、路径和 scoped diff 与已确认设计及本计划一致。
- `estimatedCost`: 小
- `deferralEvidence`: 无；计划确认后属于初始 ready set。
- `hardPredecessors`: 无。
- `consumes`: 已确认计划、当前 `dev` 工作树与两份文档。
- `produces`: 两文件精确 allowlist 和可 stage 的审查证据。
- `completionEvidence`: `git diff --check` 通过，`git status --short` 与文件 diff 证明没有把其他
  路径纳入 allowlist。
- `readSet`: 两份工作文档、`dev` status/diff、当前 HEAD。
- `writeSet`: 空。
- `stateEffects`: 仅审查结果。
- `commandScope`: `git status`、`git diff`、`git diff --check`、只读文件检查。
- `subdelegation`: 禁止。
- `executionContext`: 当前 `/Users/jiangsheng/cnb/codex`，branch `dev`，共享主 checkout/index
  但本节点只读。
- `resourceLocks`: `dev` 工作树与 index，read。
- `owner`: 主代理协调；可委派单一只读审查节点。
- `verification`: 两个文档存在，设计状态已确认，计划状态待确认或执行时已确认。
- `failureDomain`: `N01-doc-stage` 及其全部后继。
- `replanTriggers`: 文档外已有变化与目标路径重叠、HEAD 不再包含设计所核验的入口、计划内容
  被用户修改。
- `authorizationGate`: `pending`；仅在用户明确确认本计划后由 `$action-authorization` 下发
  只读审查能力信封。

### `N01-doc-stage`

- `taskBoundary`: `TASK-DOC`
- `operationKind`: stage
- `outcome`: `dev` index 只包含两份工作文档。
- `estimatedCost`: 小
- `deferralEvidence`: 无。
- `hardPredecessors`: `N00-doc-review`，等待精确 allowlist 与 clean diff 证据。
- `consumes`: `N00` allowlist。
- `produces`: 两文档 staged snapshot。
- `completionEvidence`: `git diff --cached --name-only` 精确等于两文档路径，且
  `git diff --cached --check` 通过。
- `readSet`: 两文档、`dev` index/status。
- `writeSet`: `dev` Git index 中的两个文档条目。
- `stateEffects`: 更新 `dev` index；不修改工作树文件。
- `commandScope`: 仅 `git add -- <design-doc> <plan-doc>` 及只读 staged 检查。
- `subdelegation`: 禁止。
- `executionContext`: 当前 checkout / `dev` / 独占主 index。
- `resourceLocks`: `/Users/jiangsheng/cnb/codex/.git/index`，write。
- `owner`: `TASK-DOC` 唯一 Git owner 子代理。
- `verification`: staged name/status/diff/check 精确审查。
- `failureDomain`: `N02-doc-commit` 及全部实现后继。
- `replanTriggers`: index 已含 allowlist 外路径、目标文件变更与审查快照不一致。
- `authorizationGate`: `pending`；计划确认后只授予精确两路径 stage。

### `N02-doc-commit`

- `taskBoundary`: `TASK-DOC`
- `operationKind`: commit
- `outcome`: 创建独立 docs-only 本地提交。
- `estimatedCost`: 小
- `deferralEvidence`: 无。
- `hardPredecessors`: `N01-doc-stage`，等待已审查 staged snapshot。
- `consumes`: 两文档 staged snapshot。
- `produces`: docs commit id 和更新后的 `dev` HEAD。
- `completionEvidence`: 新提交仅含两文档，提交信息为
  `docs: plan HeroUI navigation menu`，提交后 index 不含遗留项。
- `readSet`: staged snapshot、Git identity、HEAD。
- `writeSet`: `dev` ref、Git object database、主 index。
- `stateEffects`: 一个本地提交；无 remote。
- `commandScope`: `git commit -m 'docs: plan HeroUI navigation menu'` 与只读提交核验。
- `subdelegation`: 禁止。
- `executionContext`: 当前 checkout / `dev` / 独占主 index。
- `resourceLocks`: `dev` ref、Git object database、主 index，write。
- `owner`: `TASK-DOC` 唯一 Git owner 子代理。
- `verification`: `git show --stat --oneline HEAD` 与 `git diff-tree` 核对边界。
- `failureDomain`: `N03-worktree-create` 及所有代码实现节点。
- `replanTriggers`: commit hook 产生计划外文件或提交边界不精确。
- `authorizationGate`: `pending`；计划确认后授权 docs-only 本地提交，不含 amend/remote。

### `N03-worktree-create`

- `taskBoundary`: 无提交；实现前统一预配屏障
- `operationKind`: worktree
- `outcome`: 从 docs commit 后的 `dev` 创建并完整验收独立 sparse worktree。
- `estimatedCost`: 中
- `deferralEvidence`: 无。
- `hardPredecessors`: `N02-doc-commit`，worktree 必须包含已提交工作文档。
- `consumes`: docs commit 后的 `dev`、worktree 专用脚本、固定 control-plane 输入与现有 Vitest
  direct mapping。
- `produces`: worktree path、branch、独立 index、sparse list、资源链接和 clean branch status。
- `completionEvidence`: 脚本成功；报告 worktree path/branch/sparse list、关键规则与 schema
  可读性、linked resources、`git status --short --branch`。
- `readSet`: repo/worktree/vitest path metadata、`dev` tree、worktree script及默认 sparse 输入。
- `writeSet`: `/Users/jiangsheng/cnb/codex/.worktrees/gui-navigation-menu-heroui`、branch
  `codex/gui-navigation-menu-heroui` 及其独立 Git index；脚本管理的 worktree 内链接。
- `stateEffects`: 创建本地 branch、sparse worktree、目录与脚本规定的本地资源链接。
- `commandScope`: 执行前重检 branch/path/base/sparse/Vitest direct mapping；随后仅运行：

  ```bash
  bash .codex/skills/codex-gui-worktree/scripts/create-codex-gui-worktree.sh \
    --name gui-navigation-menu-heroui \
    --branch codex/gui-navigation-menu-heroui \
    --base dev \
    --repo-root /Users/jiangsheng/cnb/codex \
    --worktree-root /Users/jiangsheng/cnb/codex/.worktrees \
    --vitest-root /Users/jiangsheng/cnb/vitest
  ```

- `subdelegation`: 禁止。
- `executionContext`: 主 repo 调用脚本；产出独立 worktree/branch/index。
- `resourceLocks`: worktree 目标路径、branch ref、worktree registry，write；现有 Vitest physical
  target只读，兼容 direct link 不迁移。
- `owner`: worktree 准备子代理。
- `verification`: 使用 `$codex-gui-worktree` 的完整验收清单。
- `failureDomain`: 所有 `TASK-IMPL` 节点。
- `replanTriggers`: branch/path/symlink 冲突、base 漂移导致设计事实失效、默认 sparse 输入缺失、
  脚本要求覆盖或迁移现有资源。
- `authorizationGate`: `pending`；计划确认后授权上述精确 worktree 动作，禁止 force/remote/
  overwrite/cleanup。

### `N10-source-edit`

- `taskBoundary`: `TASK-IMPL`
- `operationKind`: 编辑
- `outcome`: 导航 Button 实现已按设计改为 full-width、两行说明和 route 派生圆点。
- `estimatedCost`: 中
- `deferralEvidence`: 无；与 `N11-test-edit` 写集合不相交，预配完成后共同进入 ready set。
- `hardPredecessors`: `N03-worktree-create`，等待可用独立 worktree。
- `consumes`: 已确认设计、现有 `AppShellTopBar`、HeroUI 3.2.4 Button/menu-item/description
  证据与现有 route handlers。
- `produces`: 未格式化的单文件 source diff。
- `completionEvidence`: 仅目标 TSX 变化；保留 Drawer、nav、route、disabled、close/focus 合同；
  删除 House/History 图标；不存在 Dropdown selection state。
- `readSet`: `AppShellTopBar.tsx`、直接 import/API definitions、设计文档。
- `writeSet`: `codex-gui/src/features/appShell/AppShellTopBar.tsx`。
- `stateEffects`: 修改一个 source 文件；不操作 index。
- `commandScope`: `apply_patch` 普通源码编辑与只读 diff。
- `subdelegation`: 禁止。
- `executionContext`: 独立实现 worktree/branch，共享工作树但写集合独占。
- `resourceLocks`: 目标 TSX，write；worktree index 不访问。
- `owner`: `edit_navigation_rows` 子代理。
- `verification`: source diff 人工核对；不把局部检查冒充任务完成。
- `failureDomain`: source 消费者 `N12-edit-fan-in` 及后继；不影响仍独立运行的 `N11`。
- `replanTriggers`: HeroUI API 与核验版本不一致、需要 route/state/CSS/新组件文件。
- `authorizationGate`: `pending`；计划确认后授予精确单文件编辑。

### `N11-test-edit`

- `taskBoundary`: `TASK-IMPL`
- `operationKind`: 编辑
- `outcome`: 直接 Browser test 覆盖两行说明、accessible description、当前圆点和既有合同。
- `estimatedCost`: 中
- `deferralEvidence`: 无；与 `N10-source-edit` 可真实并行。
- `hardPredecessors`: `N03-worktree-create`。
- `consumes`: 设计合同、现有 AppShellTopBar Browser tests、本地 Vitest locator/assertion docs。
- `produces`: 未格式化的单文件 test diff。
- `completionEvidence`: 测试通过稳定 DOM seam 验证当前项才有 `aria-hidden` 圆点，Button 的
  accessible name 仍是标题、说明由 accessible description 提供；分别注册并覆盖 current-task、
  history-list、history-detail route，后两者都必须让“历史记录”持有 `aria-current` 与圆点；
  保留导航、disabled、Escape 与焦点恢复覆盖。
- `readSet`: 直接 Browser test、测试 helpers、Vitest Browser assertions/locators docs。
- `writeSet`: `codex-gui/src/features/appShell/__tests__/AppShellTopBar.browser.test.tsx`。
- `stateEffects`: 修改一个 test 文件；不运行测试、不操作 index。
- `commandScope`: `apply_patch` 普通测试源码编辑与只读 diff。
- `subdelegation`: 禁止。
- `executionContext`: 独立实现 worktree/branch，共享工作树但写集合独占。
- `resourceLocks`: 目标 test 文件，write；worktree index 不访问。
- `owner`: `edit_navigation_tests` 子代理。
- `verification`: test diff 与真实 Browser API 对照；不声称运行结果。
- `failureDomain`: test 消费者 `N12-edit-fan-in` 及后继；不影响仍独立运行的 `N10`。
- `replanTriggers`: 需要新测试文件、截图基线、e2e 或非导航 fixture。
- `authorizationGate`: `pending`；计划确认后授予精确单文件编辑。

### `N12-edit-fan-in`

- `taskBoundary`: `TASK-IMPL`
- `operationKind`: fan-in
- `outcome`: source 与 test diff 组合后语义一致，写集合仍在两文件内。
- `estimatedCost`: 小
- `deferralEvidence`: 无。
- `hardPredecessors`: `N10-source-edit` 与 `N11-test-edit`，等待两个稳定 diff。
- `consumes`: source/test diffs。
- `produces`: 可供唯一任务 owner 格式化和生成的组合快照。
- `completionEvidence`: 主代理核对结构、ARIA、文案、route owner 与测试预期一致；无写冲突。
- `readSet`: 两个改动文件及组合 diff。
- `writeSet`: 空。
- `stateEffects`: 仅审查结果。
- `commandScope`: 只读 diff/status/source 检查。
- `subdelegation`: 禁止。
- `executionContext`: 实现 worktree，只读共享快照。
- `resourceLocks`: 两改动文件，read。
- `owner`: 主代理协调。
- `verification`: 组合 diff 与设计逐条映射。
- `failureDomain`: `N13-format` 及全部任务后继；单分支不成立时只回到相应编辑节点。
- `replanTriggers`: 两分支在同一代码 seam 产生冲突或设计语义不一致。
- `authorizationGate`: `pending`；计划确认后只读 fan-in。

### `N13-format`

- `taskBoundary`: `TASK-IMPL`
- `operationKind`: 格式化
- `outcome`: 权威 oxfmt fix 入口完成，且没有范围外语义修改。
- `estimatedCost`: 小
- `deferralEvidence`: 无；该入口扫描整个 `codex-gui`，与其他 worktree 写节点串行。
- `hardPredecessors`: `N12-edit-fan-in`。
- `consumes`: 组合 source/test diff、live package script、fnm-backed pnpm。
- `produces`: 格式化后的 source/test 快照。
- `completionEvidence`: `format:oxfmt:fix` 成功；完整 diff 审查只显示允许的格式化和既定行为
  变化，未产生计划外文件。
- `readSet`: `codex-gui` formatter 输入与组合工作树。
- `writeSet`: formatter 显式作用域 `codex-gui`；实际允许保留的目标仅行为提交四文件。
- `stateEffects`: oxfmt 对 live script 作用域的自动格式化副作用。
- `commandScope`: cwd 为实现 worktree 的 `codex-gui`；先运行
  `/opt/homebrew/bin/fnm exec --using-file pnpm --version`，再运行
  `/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt:fix`。
- `subdelegation`: 禁止。
- `executionContext`: 实现 worktree/branch；唯一任务 owner。
- `resourceLocks`: 整个 worktree `codex-gui` formatter scope，write。
- `owner`: `TASK-IMPL` 唯一 Git owner 子代理。
- `verification`: formatter 退出成功并审查完整 diff；范围外输出触发暂停，不接受为顺手格式化。
- `failureDomain`: 所有 catalog、验证和提交后继。
- `replanTriggers`: formatter 修改行为边界外文件或工具不来自 fnm。
- `authorizationGate`: `pending`；计划确认后授权项目权威 formatter 及其正常自动副作用。

### `N14-catalog-extract-1`

- `taskBoundary`: `TASK-IMPL`
- `operationKind`: 生成
- `outcome`: 第一次权威 extraction 将两个新 msgid 投影到完整 catalog 边界。
- `estimatedCost`: 中
- `deferralEvidence`: 无。
- `hardPredecessors`: `N13-format`，等待稳定 source refs。
- `consumes`: 格式化后的 source、Lingui config、现有 catalogs、`messages:extract` script。
- `produces`: 首次生成后的 `en.po` 与 `zh-CN.po`。
- `completionEvidence`: 入口成功且只触及核验的两份 catalog；新 msgid 可回指目标 source。
- `readSet`: `codex-gui/src`、Lingui config、package script、两份 catalogs。
- `writeSet`: `codex-gui/src/locales/en.po`、`codex-gui/src/locales/zh-CN.po`。
- `stateEffects`: Lingui generator 正常更新两份 catalogs。
- `commandScope`: cwd 为 worktree `codex-gui`；
  `/opt/homebrew/bin/fnm exec --using-file pnpm run messages:extract`。
- `subdelegation`: 禁止。
- `executionContext`: 实现 worktree；唯一任务 owner。
- `resourceLocks`: Lingui generator 与两份 catalog，write。
- `owner`: `TASK-IMPL` 唯一 Git owner子代理。
- `verification`: 输出边界与两个 msgid 存在性检查。
- `failureDomain`: `N15-catalog-review-1` 及 catalog/任务后继。
- `replanTriggers`: 新 locale/catalog、范围外 msgid、fuzzy/obsolete 或不可解释状态变化。
- `authorizationGate`: `pending`；计划确认后授权权威 extraction 与完整两 catalog 边界。

### `N15-catalog-review-1`

- `taskBoundary`: `TASK-IMPL`
- `operationKind`: 审查
- `outcome`: 首次 catalog diff 已按字段分类且没有未解释漂移。
- `estimatedCost`: 中
- `deferralEvidence`: 无。
- `hardPredecessors`: `N14-catalog-extract-1`。
- `consumes`: 两份 catalog 完整 diff、source messages 与 Lingui 配置。
- `produces`: `#:`, `#.`, `msgid`, `msgstr`, fuzzy/obsolete 的字段级审查记录。
- `completionEvidence`: source refs 正确；translator comments 与 source 一致；既有非空翻译未改；
  只有两个计划内新 msgid 需要补充中文翻译。
- `readSet`: 两 catalog 完整 diff、目标 source、Lingui config。
- `writeSet`: 空。
- `stateEffects`: 仅审查记录。
- `commandScope`: 只读 diff/rg/sed。
- `subdelegation`: 禁止。
- `executionContext`: 实现 worktree，只读生成快照。
- `resourceLocks`: 两 catalogs，read。
- `owner`: 主代理协调或独立只读 catalog 审查子代理。
- `verification`: 使用 `$lingui-catalog-workflow` 字段分类。
- `failureDomain`: `N16-catalog-translate` 及全部后继。
- `replanTriggers`: 既有 msgstr 丢失、unexpected fuzzy/obsolete、comment 或 msgid 语义漂移。
- `authorizationGate`: `pending`；计划确认后只读审查。

### `N16-catalog-translate`

- `taskBoundary`: `TASK-IMPL`
- `operationKind`: 编辑
- `outcome`: 仅为两个新 msgid 写入确认的 `zh-CN` 翻译，英文 source catalog 保持权威形态。
- `estimatedCost`: 小
- `deferralEvidence`: 无。
- `hardPredecessors`: `N15-catalog-review-1`，等待精确新增 entry 身份。
- `consumes`: 两个新 catalog entries 与已确认中文文案。
- `produces`: `Open current task → 打开当前任务`、
  `Browse task history → 浏览历史任务` 的人工翻译。
- `completionEvidence`: 只修改对应 `zh-CN.po` 新 entry 的 `msgstr`；placeholder/状态均不涉及。
- `readSet`: 两 catalog 对应 entries、目标 source。
- `writeSet`: `codex-gui/src/locales/zh-CN.po` 的两个新 `msgstr`。
- `stateEffects`: 人工翻译编辑；不操作 index。
- `commandScope`: `apply_patch` 精确修改两个 msgstr 与只读 diff。
- `subdelegation`: 禁止。
- `executionContext`: 实现 worktree；唯一任务 owner。
- `resourceLocks`: `zh-CN.po`，write。
- `owner`: `TASK-IMPL` 唯一 Git owner 子代理。
- `verification`: entry 上下文与 source ref 核对。
- `failureDomain`: `N17-catalog-extract-2` 及全部后继。
- `replanTriggers`: generator 输出结构无法安全定位新 entry，或需改变已确认文案。
- `authorizationGate`: `pending`；计划确认后授权两条精确中文翻译。

### `N17-catalog-extract-2`

- `taskBoundary`: `TASK-IMPL`
- `operationKind`: 生成
- `outcome`: 相同权威入口重复 extraction 后 catalog 结构稳定且人工翻译保留。
- `estimatedCost`: 中
- `deferralEvidence`: 无。
- `hardPredecessors`: `N16-catalog-translate`。
- `consumes`: 已翻译 catalogs、同一 source/config/script。
- `produces`: 二次 extraction 后的稳定 catalog 快照。
- `completionEvidence`: 命令成功；不丢失两条中文 msgstr，不新增结构 diff 或状态 drift。
- `readSet`: 与 `N14` 相同。
- `writeSet`: 两份 catalogs。
- `stateEffects`: Lingui generator 正常更新两份 catalogs。
- `commandScope`: 与 `N14` 完全相同的 `messages:extract` 命令。
- `subdelegation`: 禁止。
- `executionContext`: 实现 worktree；唯一任务 owner。
- `resourceLocks`: Lingui generator 与两 catalogs，write。
- `owner`: `TASK-IMPL` 唯一 Git owner 子代理。
- `verification`: 第二次输出与第一次人工补充后的预期结构对照。
- `failureDomain`: `N18-catalog-review-2` 及全部后继。
- `replanTriggers`: 二次 extraction 仍漂移、覆盖翻译或扩大输出边界。
- `authorizationGate`: `pending`；与 `N14` 相同。

### `N18-catalog-review-2`

- `taskBoundary`: `TASK-IMPL`
- `operationKind`: 审查
- `outcome`: 完整 catalog diff 通过 stability 与字段级验收。
- `estimatedCost`: 中
- `deferralEvidence`: 无。
- `hardPredecessors`: `N17-catalog-extract-2`。
- `consumes`: 二次 extraction 后完整两 catalog diff。
- `produces`: stable catalog completion evidence。
- `completionEvidence`: 两 catalog 仅含可解释的计划内 `#:`, `#.`, `msgid`, `msgstr` 变化；
  无 fuzzy/obsolete 或计划外翻译变化；再无未保存 generator drift。
- `readSet`: 两 catalog、source、config 与完整 diff。
- `writeSet`: 空。
- `stateEffects`: 仅审查证据。
- `commandScope`: 只读 diff/rg/sed。
- `subdelegation`: 禁止。
- `executionContext`: 实现 worktree，只读稳定快照。
- `resourceLocks`: 两 catalogs，read。
- `owner`: 主代理协调或独立只读 catalog 审查子代理。
- `verification`: `$lingui-catalog-workflow` 完成检查。
- `failureDomain`: `N20` 至 `N23` 以及提交后继。
- `replanTriggers`: 任一字段或文件边界不能由 source/config/人工翻译解释。
- `authorizationGate`: `pending`；计划确认后只读审查。

### `N20-format-check`

- `taskBoundary`: `TASK-IMPL`
- `operationKind`: 验证
- `outcome`: 权威 non-fix formatter 检查通过。
- `estimatedCost`: 小
- `deferralEvidence`: 无；与 `N21`、`N22`、`N23` 在稳定快照上可并行。
- `hardPredecessors`: `N18-catalog-review-2`。
- `consumes`: 完整稳定工作树与 fnm-backed pnpm。
- `produces`: format pass 证据。
- `completionEvidence`: `/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt` exit 0。
- `readSet`: `codex-gui` formatter scope。
- `writeSet`: 空；程序内部只允许正常临时/cache 副作用。
- `stateEffects`: 验证输出与工具正常 cache/临时状态。
- `commandScope`: cwd 为 worktree `codex-gui`；精确上述命令。
- `subdelegation`: 禁止。
- `executionContext`: 实现 worktree，稳定快照。
- `resourceLocks`: source tree read、formatter runner read/exclusive-run。
- `owner`: 验证子代理。
- `verification`: exit 0 且目标命中。
- `failureDomain`: `N24-validation-fan-in` 及提交后继。
- `replanTriggers`: 工具来源错误或检查修改 tracked 文件。
- `authorizationGate`: `pending`；计划确认后授权 non-fix format check。

### `N21-lint`

- `taskBoundary`: `TASK-IMPL`
- `operationKind`: 验证
- `outcome`: live lint 入口通过且不启用 fix。
- `estimatedCost`: 中
- `deferralEvidence`: 无。
- `hardPredecessors`: `N18-catalog-review-2`。
- `consumes`: 稳定代码/test/catalog、live package scripts。
- `produces`: lint pass 证据。
- `completionEvidence`: `/opt/homebrew/bin/fnm exec --using-file pnpm run lint` exit 0。
- `readSet`: `codex-gui` lint scope。
- `writeSet`: 空；允许 linter 正常 cache/临时状态，不允许 fix tracked 文件。
- `stateEffects`: 验证输出与正常 cache。
- `commandScope`: cwd 为 worktree `codex-gui`；精确上述命令。
- `subdelegation`: 禁止。
- `executionContext`: 实现 worktree，稳定快照。
- `resourceLocks`: source tree read、ESLint cache write、lint runner exclusive-run。
- `owner`: 验证子代理。
- `verification`: lint 两个子入口都成功。
- `failureDomain`: `N24` 及提交后继。
- `replanTriggers`: lint 入口或配置与 live package script 不一致。
- `authorizationGate`: `pending`；计划确认后授权 non-fix lint。

### `N22-type-check`

- `taskBoundary`: `TASK-IMPL`
- `operationKind`: 验证
- `outcome`: TypeScript project build type-check 通过。
- `estimatedCost`: 中
- `deferralEvidence`: 无。
- `hardPredecessors`: `N18-catalog-review-2`。
- `consumes`: 稳定源码、generated protocol schemas、tsconfig chain。
- `produces`: type-check pass 证据。
- `completionEvidence`: `/opt/homebrew/bin/fnm exec --using-file pnpm run type-check` exit 0。
- `readSet`: TypeScript project、schemas 与配置。
- `writeSet`: 空；允许工具正常 cache/增量状态，不允许 tracked file 修改。
- `stateEffects`: 验证输出与正常 cache/临时状态。
- `commandScope`: cwd 为 worktree `codex-gui`；精确上述命令。
- `subdelegation`: 禁止。
- `executionContext`: 实现 worktree，稳定快照。
- `resourceLocks`: source/schema read、TypeScript runner exclusive-run。
- `owner`: 验证子代理。
- `verification`: exit 0，schemas 可读且 project 命中。
- `failureDomain`: `N24` 及提交后继。
- `replanTriggers`: sparse 输入缺失或命令未命中 codex-gui project。
- `authorizationGate`: `pending`；计划确认后授权 type-check。

### `N23-focused-browser-test`

- `taskBoundary`: `TASK-IMPL`
- `operationKind`: 验证
- `outcome`: 直接 AppShellTopBar Browser test 在三个 headless browser 实例中通过。
- `estimatedCost`: 中
- `deferralEvidence`: 无。
- `hardPredecessors`: `N18-catalog-review-2`。
- `consumes`: 稳定源码/test/catalog、parallel Browser config、linked node_modules/browser binaries。
- `produces`: 目标文件的 Level 1 focused regression evidence。
- `completionEvidence`: 下述命令 exit 0，且输出明确收集目标文件和预期测试数，并分别在
  Chromium、Firefox、WebKit 运行；零收集不算成功。
- `readSet`: Browser test dependency graph、config、fixtures、linked browser runtime。
- `writeSet`: 空；允许 runner 正常 cache/test 临时状态。
- `stateEffects`: headless browser processes、测试输出和正常临时产物；不打开可见窗口。
- `commandScope`: cwd 为 worktree `codex-gui`；
  `/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:parallel -- src/features/appShell/__tests__/AppShellTopBar.browser.test.tsx`。
- `subdelegation`: 禁止。
- `executionContext`: 实现 worktree，稳定快照；headless Browser runner。
- `resourceLocks`: Browser runner、三个 browser 实例与测试临时目录，write/exclusive-run。
- `owner`: Browser 验证子代理。
- `verification`: 实际 collection/file/browser/count 与退出状态共同验收。
- `failureDomain`: `N24` 及提交后继。
- `replanTriggers`: filter 未命中目标、配置实际 headed、browser binary 缺失且不能安装。
- `authorizationGate`: `pending`；计划确认后授权 Level 1 headless focused test。

### `N24-validation-fan-in`

- `taskBoundary`: `TASK-IMPL`
- `operationKind`: fan-in
- `outcome`: 四条验证证据与最终四文件 diff 共同满足提交门禁。
- `estimatedCost`: 小
- `deferralEvidence`: 无。
- `hardPredecessors`: `N20`、`N21`、`N22`、`N23`，等待所有独立验证稳定结果。
- `consumes`: format/lint/type/focused Browser evidence 与完整工作树 diff。
- `produces`: 精确 implementation allowlist 和可 stage 组合快照。
- `completionEvidence`: 所有检查通过；status 仅含四个行为文件；source/test/catalog 语义审查通过；
  无计划外变化。
- `readSet`: 四文件 diff/status 与验证输出。
- `writeSet`: 空。
- `stateEffects`: 仅 fan-in 证据。
- `commandScope`: 只读 status/diff/check 与验证结果审查。
- `subdelegation`: 禁止。
- `executionContext`: 实现 worktree，共享稳定快照。
- `resourceLocks`: 四行为文件和验证证据，read。
- `owner`: 主代理协调。
- `verification`: 完整 diff、catalog 字段、测试目标收集与静态检查映射。
- `failureDomain`: `N25-impl-stage` 及提交和最终验证后继。
- `replanTriggers`: 任一验证证据过期、tracked diff 超出 allowlist、设计合同不完整。
- `authorizationGate`: `pending`；计划确认后只读 fan-in。

### `N25-impl-stage`

- `taskBoundary`: `TASK-IMPL`
- `operationKind`: stage
- `outcome`: 实现 worktree index 精确包含四个行为文件。
- `estimatedCost`: 小
- `deferralEvidence`: 无。
- `hardPredecessors`: `N24-validation-fan-in`。
- `consumes`: 四文件 allowlist 与已验证组合快照。
- `produces`: implementation staged snapshot。
- `completionEvidence`: cached name list 精确等于四文件，`git diff --cached --check` 通过。
- `readSet`: 四行为文件、worktree status/index。
- `writeSet`: 实现 worktree 独立 Git index 的四路径。
- `stateEffects`: 更新实现 worktree index。
- `commandScope`: 仅 `git add --` 四个精确路径及只读 staged 审查。
- `subdelegation`: 禁止。
- `executionContext`: 实现 worktree/branch/独占 index。
- `resourceLocks`: 实现 worktree index，write。
- `owner`: `TASK-IMPL` 唯一 Git owner 子代理。
- `verification`: staged diff/status/name/check 精确核对。
- `failureDomain`: `N26-impl-commit` 及最终验证。
- `replanTriggers`: index 存在其他文件或工作树快照改变。
- `authorizationGate`: `pending`；计划确认后授权四路径 stage。

### `N26-impl-commit`

- `taskBoundary`: `TASK-IMPL`
- `operationKind`: commit
- `outcome`: 创建一个精确行为本地提交。
- `estimatedCost`: 小
- `deferralEvidence`: 无。
- `hardPredecessors`: `N25-impl-stage`。
- `consumes`: implementation staged snapshot。
- `produces`: implementation commit id。
- `completionEvidence`: 提交信息为 `feat(codex-gui): align navigation menu styling`；提交仅含四文件；
  index clean；worktree 没有未解释 tracked diff。
- `readSet`: staged snapshot、Git identity、branch HEAD。
- `writeSet`: implementation branch ref、Git object database、独立 index。
- `stateEffects`: 一个本地提交；无 merge/remote。
- `commandScope`: `git commit -m 'feat(codex-gui): align navigation menu styling'` 与只读提交核验。
- `subdelegation`: 禁止。
- `executionContext`: 实现 worktree/branch/独占 index。
- `resourceLocks`: implementation branch ref、Git object database、独立 index，write。
- `owner`: `TASK-IMPL` 唯一 Git owner 子代理。
- `verification`: commit tree 与 allowlist、parent、message 精确核对。
- `failureDomain`: `N30-full-browser`、`N31-level2`、`N32-final-fan-in`。
- `replanTriggers`: commit hook 产生计划外变化、提交范围不精确。
- `authorizationGate`: `pending`；计划确认后授权本地提交，禁止 amend/remote。

### `N27-feature-vite-start`

- `taskBoundary`: 无新提交；Level 2 资产绑定
- `operationKind`: 运行
- `outcome`: feature worktree 在 TCP `127.0.0.1:5173` 启动唯一 Vite session，并正面证明本次
  GUI Host URL 代理该 feature asset origin。
- `estimatedCost`: 小
- `deferralEvidence`: 无；只有本次完整 GUI URL 与真实 runtime 输入可用时才进入 ready set，
  避免在等待外部输入时长期占用端口。
- `hardPredecessors`: `N26-impl-commit`；另需执行时取得本次完整 GUI URL、可用 GUI Host runtime，
  并确认 TCP `5173` 无其他监听者。
- `consumes`: implementation commit、feature worktree `codex-gui`、fnm-backed pnpm、空闲端口
  `127.0.0.1:5173`。
- `produces`: Vite exec session id、listener PID、process cwd/command，以及 GUI Host 与 direct
  Vite 同源正文的 asset-binding 证据。
- `completionEvidence`: dev server 报告 ready；`lsof` 证明唯一 listener；该 PID 的 cwd 精确为
  `/Users/jiangsheng/cnb/codex/.worktrees/gui-navigation-menu-heroui/codex-gui`；命令来自
  fnm-backed pnpm；对本次 GUI URL 的 pathname/query 分别请求 GUI Host URL 和
  `http://127.0.0.1:5173` direct Vite URL，两边均成功、HTML 均包含 Vite dev client 标记且
  response body 字节一致。只证明 direct Vite listener 或只观察最终样式均不算完成。
- `readSet`: implementation commit、worktree package/vite config、端口/process metadata、
  本次完整 GUI URL 的 host/path/query 与两端 HTML response body。
- `writeSet`: TCP `127.0.0.1:5173` listener 与本计划创建的 exec session；不主动写 tracked 文件。
- `stateEffects`: 启动一个长期运行的 frontend Vite process；允许其正常 cache/临时状态。
- `commandScope`: cwd 为 feature worktree 的 `codex-gui`；先重检端口、fnm/pnpm 与 cwd，再运行
  `/opt/homebrew/bin/fnm exec --using-file pnpm run dev -- --host 127.0.0.1 --port 5173 --strictPort`
  并保留返回的 session id；随后用 `/usr/bin/curl --fail --silent --show-error` 分别读取记录下来的
  完整 GUI Host URL（fragment 不参与 HTTP 请求）和保持同一 pathname/query 的 direct Vite URL，
  在不写临时文件的前提下核对 dev marker 与正文哈希。禁止后台遗失 session、改用其他端口、
  猜测或复用旧 URL、停止现有监听者。
- `subdelegation`: 禁止。
- `executionContext`: 已提交 feature worktree；独占 frontend dev-server session。
- `resourceLocks`: TCP `127.0.0.1:5173`、Vite session 与 feature worktree Vite cache，write。
- `owner`: feature Vite 生命周期子代理。
- `verification`: process cwd/command/listener 先证明 direct origin 来自 feature worktree；同一路径
  的 GUI Host/direct Vite HTML dev marker 与 body equality 再证明该 GUI Host 正在代理这个
  origin。仅有 launch URL、端口监听或页面外观不算绑定证据。
- `failureDomain`: `N31-level2`；无论 `N31` 成功或失败，本节点产出的 session 都必须进入
  `N33-feature-vite-stop` 生命周期清理。
- `replanTriggers`: 端口被其他进程占用、listener cwd 不是 feature worktree、server 无法 ready、
  GUI Host/direct Vite body 不一致或缺少 dev marker、需要终止或替换非本计划进程。
- `authorizationGate`: `pending`；计划确认后只授权启动并持有上述 feature Vite session，不授权
  操作其他进程。

### `N30-full-browser`

- `taskBoundary`: 无新提交；最终验证
- `operationKind`: 验证
- `outcome`: 已提交状态通过 codex-gui 完整 Browser Mode suite。
- `estimatedCost`: 大
- `deferralEvidence`: 无；与 `N31-level2` 输入和 runner 独立时可并行。
- `hardPredecessors`: `N26-impl-commit`，读取稳定 commit 而非可变 diff。
- `consumes`: implementation commit、parallel/sequential Browser configs 与全部 Browser tests。
- `produces`: Level 1 full-suite evidence。
- `completionEvidence`: `/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser` exit 0；输出证明
  parallel 与 sequential 两套目标均真实收集且通过，记录总文件/测试/browser counts。
- `readSet`: committed codex-gui Browser test graph/configs/fixtures。
- `writeSet`: 空；允许 runner 正常 cache/test 临时状态。
- `stateEffects`: headless browser processes、测试输出和正常临时产物。
- `commandScope`: cwd 为实现 worktree `codex-gui`；精确上述命令。
- `subdelegation`: 禁止。
- `executionContext`: 已提交实现 worktree；headless Browser runners。
- `resourceLocks`: Browser runner、browser 实例和测试临时目录，write/exclusive-run。
- `owner`: full Browser 验证子代理。
- `verification`: 两套 script 的 collection/count/browser/exit 共同验收；零收集失败。
- `failureDomain`: `N32-final-fan-in`；若失败归因于本提交，插入独立修正提交节点并使受影响
  验证失效。
- `replanTriggers`: suite 未命中、配置 headed、缺少不可安装 browser binary、出现确认的预存无关
  失败需重新划分证据边界。
- `authorizationGate`: `pending`；计划确认后授权 Level 1 完整 headless Browser suite。

### `N31-level2`

- `taskBoundary`: 无新提交；最终验证
- `operationKind`: 验证
- `outcome`: 当前真实 Codex runtime 的 Drawer 导航在 headless Level 2 场景中通过。
- `estimatedCost`: 中
- `deferralEvidence`: 无；在当前完整 GUI URL 与 non-headed session 证据可用时，与 `N30` 可并行。
- `hardPredecessors`: `N27-feature-vite-start`，等待 feature asset origin 的进程身份与 readiness
  证据。
- `consumes`: implementation commit、已绑定 feature worktree 的 Vite session、本次完整 GUI URL、
  真实 current-task/history state。
- `produces`: Level 2 geometry、状态与交互证据。
- `completionEvidence`: 保留完整 URL 的 route/thread/token；`playwright-cli list --json` 明确 session
  非 headed；验证 Drawer 两项全宽、两行不截断、前导列稳定、当前 route 仅一个圆点、无持续蓝色
  背景、hover/focus/disabled、窄视口无横向溢出、导航与关闭行为正确，且 Composer 保持干净。
- `readSet`: 已提交 GUI 资源、真实 runtime 页面与可访问/DOM/layout 状态。
- `writeSet`: 空；页面内只执行导航与焦点交互，不提交消息或改变任务数据。
- `stateEffects`: 创建 headless browser session、页面内临时 Drawer/route/focus 状态；关闭 session。
- `commandScope`: 先核验 `playwright-cli` 来源；使用
  `playwright-cli open '<本次完整 GUI URL>'` 与实际 `list --json` 返回的 session；禁止猜测、拼接、
  复用旧 URL、使用 `--headed` 或打开报告/trace viewer。
- `subdelegation`: 禁止。
- `executionContext`: GUI Host dev proxy 指向已核验的 feature worktree Vite origin；headless
  in-app/browser session。
- `resourceLocks`: 当前 GUI runtime/session 与 feature Vite session，read/write；用户桌面不占用。
- `owner`: Level 2 验证子代理。
- `verification`: 每个场景记录 route/state/尺寸/交互结果与 console error；截图不是单独完成证据。
- `failureDomain`: `N32-final-fan-in`；确认由本提交引入时插入新修正提交，不 amend。
- `replanTriggers`: 本次完整 URL/runtime/non-headed 证据不可得，或结果依赖可见桌面状态。
- `authorizationGate`: `pending`；计划确认后授权 headless Level 2 页面交互，不授权可见窗口或消息
  提交。缺少 URL 是输入等待，不得用旧 URL 绕过。

### `N33-feature-vite-stop`

- `taskBoundary`: 无新提交；Level 2 进程生命周期清理
- `operationKind`: 运行
- `outcome`: 只停止 `N27` 创建并持有的 Vite session，释放 TCP `5173`。
- `estimatedCost`: 小
- `deferralEvidence`: 无；`N31` 产生成功或失败的终端事件后立即运行。
- `hardPredecessors`: `N27-feature-vite-start` 已产生 session id，以及 `N31-level2` 已返回成功或
  失败终端事件；不要求把失败伪装成成功。
- `consumes`: `N27` session id/PID/cwd identity 与 `N31` 终端事件。
- `produces`: feature Vite session 已终止、端口已释放的证据。
- `completionEvidence`: 通过原 exec session 发送中断并等待自然退出；`lsof` 证明该 listener 消失；
  没有终止其他 PID，也没有启动或恢复主 checkout Vite。
- `readSet`: exec session/process/listener metadata。
- `writeSet`: 仅 `N27` 创建的 exec session/process 生命周期。
- `stateEffects`: 终止计划内 frontend Vite process，释放 TCP `5173`。
- `commandScope`: 仅向 `N27` 返回的 session id 发送 Ctrl-C 并等待退出，随后只读核验端口；
  禁止按模糊进程名 kill、操作其他 PID、启动恢复进程或 cleanup worktree。
- `subdelegation`: 禁止。
- `executionContext`: 与 `N27` 相同的受控 exec session。
- `resourceLocks`: feature Vite session 与 TCP `127.0.0.1:5173`，write。
- `owner`: 与 `N27` 相同的 feature Vite 生命周期子代理。
- `verification`: session exit 与 listener disappearance。
- `failureDomain`: `N32-final-fan-in` 的进程生命周期完成项；不掩盖 `N31` 的原始验收结果。
- `replanTriggers`: session identity 丢失、PID/cwd 与 `N27` 证据不一致、停止会触及其他进程。
- `authorizationGate`: `pending`；计划确认后只授权停止本计划创建的 session。

### `N32-final-fan-in`

- `taskBoundary`: 无新提交；最终汇合
- `operationKind`: fan-in
- `outcome`: 所有任务提交和适用验证在同一最终 implementation commit 上成立。
- `estimatedCost`: 小
- `deferralEvidence`: 无。
- `hardPredecessors`: `N30-full-browser`、成功的 `N31-level2`、`N33-feature-vite-stop`，等待
  Level 1/2 稳定证据与计划内进程生命周期闭合。
- `consumes`: docs commit、implementation commit、完整 Browser evidence、Level 2 evidence、最终
  status/diff/log。
- `produces`: 计划终态报告。
- `completionEvidence`: 所有必须节点完成；worktree branch 含两个顺序提交；实现 worktree没有未解释
  tracked 变化；feature Vite 已停止且端口已释放；未执行 merge/cleanup/remote；报告实际并行、
  关键路径、未启动 ready 节点。
- `readSet`: commits、status、verification outputs、execution record。
- `writeSet`: 空。
- `stateEffects`: 仅最终报告。
- `commandScope`: 只读 Git/status/log/diff 与证据汇总。
- `subdelegation`: 禁止。
- `executionContext`: 主 checkout 与实现 worktree只读汇总。
- `resourceLocks`: commits/status/evidence read。
- `owner`: 主代理协调。
- `verification`: 对照设计、计划、四文件 allowlist 和两级验收逐项闭合。
- `failureDomain`: 无后继；未满足项按执行图动态重编或形成有证据的局部硬阻塞。
- `replanTriggers`: 最终 commit 不是验证读取对象、分支被外部改写、需要 merge/cleanup/remote。
- `authorizationGate`: `pending`；计划确认后只读汇总。

## Ready set、关键路径与资源调度

- 初始 ready set：计划确认后只有 `N00-doc-review`。
- 实现前预配屏障：`N00 → N01 → N02 → N03`。工作文档提交成功并完成 worktree 验收前，
  `TASK-IMPL` 没有 ready 节点。
- 首个 fan-out：`N03` 完成后，`N10-source-edit` 与 `N11-test-edit` 同时 ready，写集合不相交，
  应真实并行。
- 实现关键路径：`N03 → max(N10,N11) → N12 → N13 → N14 → N15 → N16 → N17 → N18
  → max(N20,N21,N22,N23) → N24 → N25 → N26`。
- 最终 fan-out/fan-in：`N26` 后 `N30` 立即 ready；取得本次 URL/runtime 且端口仍空闲时，
  `N27` 也 ready。`N27 → N31`，`N31` 出现任一终端结果后必须运行 `N33` 停止计划内 Vite；
  `N30`、成功的 `N31` 与 `N33` 都完成后进入 `N32`。
- `N13` 扫描并可能写整个 formatter scope，与任何实现 worktree 写节点互斥。
- `N14`/`N17` 读取 `src` 并写共享 catalogs，和 source/test 编辑、formatter、catalog 翻译互斥。
- `N20`/`N21`/`N22`/`N23` 只读同一稳定源码树；各自 runner/cache 使用独立锁时并行。若执行
  预检发现 canonical cache 或 runner 冲突，只等待实际资源锁，不新增伪依赖。
- `N30` 与 `N27 → N31` 分支使用不同 browser session/runner 时并行；若只能解析到同一
  canonical browser 资源，则保持 ready 并等待锁，不把资源争用写成依赖。

## 生成物边界与 Lingui 稳定性

- 权威入口：`/opt/homebrew/bin/fnm exec --using-file pnpm run messages:extract`，cwd 为实现
  worktree 的 `codex-gui`。
- 输入 owner：`lingui.config.ts`、`src` 中的 Lingui macros、现有 `en.po`/`zh-CN.po`。
- 完整生成物边界：`codex-gui/src/locales/en.po` 与 `codex-gui/src/locales/zh-CN.po`。
- 人工补充边界：只允许两个新 msgid 在 `zh-CN.po` 中的 `msgstr`。
- 两条说明在 source 中使用 `<Trans>`；因其位于主导航且是相邻标题的说明，添加简短英文
  translator comment，明确 UI 位置与用途。comment 经 extraction 投影为 `#.` 并接受字段级审查。
- 首次 extraction 后审查完整两 catalog diff；不得只看新 message hunk，也不得手工恢复旧 source
  references。人工翻译后运行相同入口第二次，确认翻译保留且结构稳定。
- 新 locale/catalog、计划外 msgid/msgstr/comment、既有翻译丢失、fuzzy/obsolete 变化或二次漂移
  都暂停 catalog 后继；不得通过 `--clean`、手改 references 或忽略 diff 绕过。

## 验收映射

| 设计合同 | Level 1 | Level 2 |
| --- | --- | --- |
| 标题与两行说明 | accessible name/description 断言 | 真实 Drawer 可见、无截断/异常换行 |
| 当前圆点来自 route | current-task、history-list、history-detail 测试，`aria-current` 与稳定 indicator seam | current/history 实际导航后仅当前项显示圆点 |
| 无 selection owner | source/diff 审查，无 `selectedKeys`/`aria-selected`/`aria-checked` | 不出现独立于 route 的视觉状态 |
| HeroUI ghost/full-width | DOM 属性与稳定 class/slot边界，不锁无意义像素 | 宽度、hover、pressed、focus、窄视口布局 |
| disabled 当前任务 | 既有 disabled test 保留并扩展说明 | 无 active thread 时真实 disabled 状态 |
| Drawer/route/focus 合同 | Escape、focus return、canonical URLs | pointer/keyboard 导航与关闭行为 |
| 本地化 | 两 catalog 字段级 diff 与二次 extraction | 中文 UI 文案正确 |

Level 3 不适用。本计划不打开可见浏览器、DevTools 或桌面窗口。若证据证明结果依赖可见桌面，
暂停该验收分支并回到授权门禁，不以 headless 结果替代。

## 串行边反向审计

- 文档提交先于 worktree：worktree 必须从包含已确认工作文档的 `dev` commit 创建，是明确的稳定
  产物依赖。
- source/test fan-in 先于 formatter：formatter 扫描共享 worktree，不能读取仍变化的编辑快照。
- catalog 首次 extraction 先于字段审查，审查先于人工翻译：翻译必须定位 generator 实际创建的
  entry，不能预造 catalog 结构。
- 二次 extraction 先于验证：稳定 catalogs 是 lint/type/browser 与提交共同消费的最终快照。
- stage/commit 先于完整 Browser 与 Level 2：最终验收必须读取稳定 commit；提交前 focused test 已
  提供快速回归闭环。Level 2 还必须等待 feature Vite 的 cwd/listener/readiness 绑定证据。
- `N20` 至 `N23` 之间没有硬依赖；`N30` 与 `N31` 之间没有硬依赖。未添加由编号、同一 branch、
  agent 复用或“习惯顺序”产生的串行边。

## 失败、修正与停止条件

- 任一验证失败先作为执行证据，按 `$delegating-micro-stages` 在原目标和四文件范围内插入诊断、
  修正与重验节点；不自动停止、不修改计划正文、不扩大豁免、不删除覆盖。
- 提交前修正仍属于 `TASK-IMPL` 组合快照；提交后修正必须形成新的独立 commit，禁止 amend。
- 预存、无关或计划范围外失败只调查到足以证明边界并报告，不吸收到本任务行为提交。
- 只有缺少必要授权/当前完整 GUI URL/不可安装的必需工具、继续会破坏状态、目标在约束下不可能，
  或所有安全有效路径均被正面证据排除时，受影响分支才能形成硬阻塞。
- `N27` 启动的 Vite 无论 Level 2 成功或失败都必须由 `N33` 通过原 session 停止；端口若被其他
  进程占用，只暂停资产绑定分支，不终止、替换或恢复该进程。
- 不操作 Git remote；不 merge 回 `dev`；不 cleanup worktree。后续集成和清理必须由用户另行授权。

## 完成报告

最终报告必须包括：

- docs commit 与 implementation/fix commit IDs、branch、worktree path；
- 四文件最终边界、catalog 字段分类与二次 extraction stability；
- format、lint、type-check、focused Browser、完整 Browser 和 Level 2 的实际 target/count/result；
- Level 3 不适用，未打开可见桌面窗口；
- feature Vite 的 asset-binding 证据、session identity、停止结果与 TCP `5173` 释放状态；
- 主 checkout 与实现 worktree 的最终 status；
- `实际并行`、`关键路径`、`未启动 ready 节点`；
- 未执行 merge、cleanup 或 remote，下一步如需集成须单独授权。
