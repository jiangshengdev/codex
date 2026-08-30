# Skill typeahead 全量候选与来源排序分区实施计划

日期：2026-08-30

状态：待补充确认

## 设计依据

- [Skill typeahead 全量候选与来源排序分区设计](../../../../specs/2026/08/30/2026-08-30-skill-typeahead-sorted-complete-results-design.md)

设计已由用户明确确认。本文只把已确认设计编译为可执行 DAG，不增加产品行为。

## 唯一目标

修改 Codex GUI skill typeahead 的候选查询，使仅输入 `$` 时按 `repo → user → admin → system` 形成无视觉变化的排序分区，并在分区内按 `displayName → canonical name → path` 排序；输入非空搜索词时继续跨 scope 按全局匹配分数排序；两种状态都返回当前 catalog snapshot 中的全部匹配候选，不再受前端 20 项限制。

## 计划前事实闭包

### 生产链路

- `skills/list` 没有 `limit` 或 cursor。`SkillCatalogOwner` 只消费当前 cwd 的 entry，过滤 `enabled` 后把全部候选交给 Composer。
- `SkillTypeaheadPlugin` 已把 `querySkills(skillCatalog.candidates, query)` 的全部返回值映射成同一个扁平 options 数组，并在现有唯一候选滚动区域中渲染；它没有第二次数量截断或排序。
- `skillQuery.ts` 是唯一需要修改的 production 文件：空查询和非空查询共用当前 score/name/path comparator，末尾唯一执行 `slice(0, MAX_SKILL_QUERY_RESULTS)`。
- `SkillQueryResult` 已持有通过 `skillDisplayName()` 得到的 `displayName`；空查询 comparator 不需要新增 DTO、catalog 字段或渲染模型。
- generated `SkillScope` 精确为 `user | repo | system | admin`。scope rank 必须使用 exhaustive switch，并在未知值上复用 `assertNever`；不得依赖 union 声明顺序、localized label 或 catalog 返回顺序。

### 测试链路

- `skillQuery.test.ts` 当前锁定空查询 canonical name/path 排序和 20 项硬上限；需要替换为两种 query mode 的新行为契约。
- `ComposerEditor.browser.test.tsx` 当前第一项测试明确断言 25 个候选只渲染 20 个；需要改为 25 个全部进入同一 listbox，同时保留现有 HeroUI、ARIA 与 editor focus 断言。
- 同一 Browser 文件已有单一滚动 owner、首尾键盘循环、严格 `0/max`、focus ring、多语言来源标签和无普通 path 展示覆盖。把键盘边界 fixture 从 20 增至 25，即可证明旧上限之外的末项仍可达，无需新增视觉结构。
- 多语言来源测试当前输入 admin/repo/system/user，并预期 Enter 选择 admin；新空查询排序下首项应为 repo，必须同步更新 option 顺序和提交断言。
- hover/active 测试当前混用 user Alpha 与 repo Beta。它只负责视觉状态，应把两者设为同一 scope，避免来源排序改变其既有 Enter 目标。
- `ComposerEditor.browser.test.tsx` 被 `vitest.browser.parallel.config.ts` 收集，并在 Chromium、Firefox、WebKit 三个 headless instance 中运行；`test:browser:smoke` 不收集该文件，不能替代 focused parallel Browser 验证。

### 风险判级与排除范围

本任务为低风险、前端内聚的候选排序与数量语义修改：不改变 Rust、app-server、protocol、schema、catalog owner、Composer submission、Lexical node identity、HeroUI 样式、ARIA 结构或持久数据。关键事实已由 production 入口、生成类型和直接测试消费者闭合。

排除：

- `SkillTypeaheadPlugin.tsx` production 修改；
- `skillCatalogOwner.ts`、GUI Host、Rust、protocol、schema 或 generated TypeScript 修改；
- 可见组标题、separator、group role、布局、样式、本地化消息或碰撞 path 修改；
- E2E、sequential Browser、smoke Browser、snapshot、基线或依赖更新；
- worktree、branch 创建、安装、remote、force、amend 或 squash。

若实施证据要求进入任一排除范围，停止受影响节点并重新计划，不得自行扩大。

## 实施文件

Production：

- `codex-gui/src/features/composerEditor/skillQuery.ts`

Tests：

- `codex-gui/src/features/composerEditor/__tests__/skillQuery.test.ts`
- `codex-gui/src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx`

Work documents：

- `docs/superpowers/specs/2026/08/30/2026-08-30-skill-typeahead-sorted-complete-results-design.md`
- `docs/superpowers/plans/2026/08/30/2026-08-30-skill-typeahead-sorted-complete-results-plan.md`

## 实现约束

### `skillQuery.ts`

- 删除 `MAX_SKILL_QUERY_RESULTS` 及末尾 `slice`，不以更大的固定上限替代。
- 继续一次构造完整 `SkillQueryResult[]`，保留现有 match、score、source label 与 collision path 计算。
- `normalizedQuery.length === 0` 时使用浏览 comparator：scope rank、`displayName`、canonical `name`、canonical `path`。
- scope rank 使用 exhaustiveness-preserving switch：`repo = 0`、`user = 1`、`admin = 2`、`system = 3`；未知 scope 进入 `assertNever`。
- 非空 query 继续按 score 降序，再按 canonical `name`、`path`；不得插入 scope rank 或改变 fuzzy scoring。
- 复用现有 `compareText` 与 `skillDisplayName` 语义；不引入 locale-sensitive 排序、description 排序、natural sort 或 fallback。
- 不做与行为无关的 import、声明、函数或分支重排。若 formatter 产生必要位置变化，只保留 formatter 对计划文件的直接结果；不得创建 order-only churn。

### Unit tests

- 移除 `MAX_SKILL_QUERY_RESULTS` import 和 cap 断言。
- 用故意打乱输入顺序、scope 和 display/canonical 名称顺序的 fixture 精确断言 `repo → user → admin → system`。
- 在同一 scope 内覆盖 `displayName → canonical name → path`，包括 displayName 缺失/空白时回退 canonical name。
- 使用超过 20 个候选分别证明空查询和非空查询都返回全部匹配项。
- 增加跨 scope 的非空查询 fixture，证明 score 高的匹配优先于 scope rank；保留 canonical name/path tie-break 和 description 不参与匹配的覆盖。
- 优先对完整结果数组做深相等，不逐字段拼接松散断言。

### Browser tests

- 把“capped accessible skill list”测试改为 full list，25 个候选必须全部成为 option；保留 listbox slot、active option、ARIA 和 editor focus 断言。
- 把四 catalog 状态的键盘滚动 fixture 改为 25 项，继续证明 ArrowUp/ArrowDown 可达旧上限之外的末项、严格 `0/max`、banner owner 与 focus ring 不回退。
- 多语言来源测试断言实际扁平 option 顺序为 repo/user/admin/system；行内来源标签和无普通 path 展示保持不变；Enter/capture 改为 repo 候选。
- hover/active 视觉测试中的 Alpha/Beta 使用同一 scope，隔离该测试原有职责并保留原 Enter 目标。
- 不新增标题、separator 或 group role 断言实现；通过单一 listbox、连续 options、现有来源标签与 DOM 结构无新增节点来证明“只排序，不改视觉”。
- DOM/ARIA 断言继续使用本地 Vitest 4.1.10 文档要求的 locator、`expect.element` 和 `expect.poll`。

## 执行环境与命令预检

执行时在每个命令前重新核验 cwd、目标文件、live scripts、fnm Node/pnpm 来源和目标收集规则。当前已核验：

- repository root：`/Users/jiangsheng/cnb/codex`
- frontend cwd：`/Users/jiangsheng/cnb/codex/codex-gui`
- fnm：`/opt/homebrew/bin/fnm`
- pnpm：fnm 环境中的 `10.34.5`
- Node：fnm 环境中的 `v24.17.0`
- Vitest：`4.1.10`
- global `playwright-cli`：当前 fnm multishell 中可解析；执行 Level 2 前重新核验，不允许用会下载 package/browser 的 fallback。

版本和 PATH 是易漂移事实；执行时必须重复核验。若 fnm、pnpm、Node、Vitest、现有 Playwright browser 或 `playwright-cli` 缺失，停止依赖节点并要求用户自行安装；禁止助手安装、运行 `pnpm install`、`npx --package`、`playwright-cli install` 或 `playwright-cli install-browser`。

### 格式化

`package.json` 的 `format:oxfmt:fix` 固定包含 `.`，不能表达精确三文件 writeSet。计划使用同一项目原生 formatter 的 scoped CLI，而不是运行全仓 fix：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt --write src/features/composerEditor/skillQuery.ts src/features/composerEditor/__tests__/skillQuery.test.ts src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt --check src/features/composerEditor/skillQuery.ts src/features/composerEditor/__tests__/skillQuery.test.ts src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx
```

本任务只修改 `codex-gui/**` 和 `docs/**`，不触发 repository-level `just fmt`。

### Focused Level 1

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit -- src/features/composerEditor/__tests__/skillQuery.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:parallel -- src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx
```

`test:unit` 的 live script 已包含 `vitest --run`；传入的路径是唯一 file filter。`test:browser:parallel` 的 live config 已固定 `watch: false`、`headless: true`，目标文件由 parallel include 收集并在 Chromium、Firefox、WebKit 中执行。成功必须报告目标文件及实际测试数量；零收集、只运行 smoke、config/type/browser 启动错误均不算命中。

### Frontend static checks

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run lint
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

不得用 fix、ignore、baseline、skip、降级断言或删除覆盖来处理失败。计划内修改直接引入的问题按执行图插入修正节点；预存或无关失败只记录并隔离。

### Level 2 headless acceptance

Level 2 适用：最终用户行为依赖真实 catalog 内容与真实 Composer typeahead 集成，但不依赖可见桌面。实施 commit 后，通过 outer `launch_gui` 获取当次完整 GUI URL；不得猜测、拼接或复用旧 URL。没有当次 URL、可用 runtime、已安装 browser 或明确 headless session evidence 时，标记 Level 2 未执行，不得用 Level 1 替代或声称完整验收。

命令骨架中的 URL 和元素 ref 必须由当次工具结果解析：

```bash
playwright-cli open '<complete-current-GUI-URL>'
playwright-cli list --json
playwright-cli snapshot
playwright-cli fill <fresh-combobox-ref> '$'
playwright-cli snapshot
playwright-cli press ArrowUp
playwright-cli snapshot
playwright-cli press Escape
playwright-cli close
```

验收记录必须证明：

- session 明确为非 headed；
- 当前 route 与真实 Codex runtime 可用；
- 实际 skill options 保持单一扁平 listbox，无组标题或 separator；
- 当前真实候选按 repo/user/admin/system 形成连续排序分区，每行来源标签保留；
- 若真实 catalog 超过 20 项，所有项均进入列表；无论数量多少，ArrowUp 从首项循环到实际末项并保持 editor focus；
- Escape 正常关闭菜单。

Level 3 不适用：本结果不依赖系统窗口、DevTools、跨应用桌面焦点或系统 IME UI。禁止启动 `--headed`、可见浏览器、DevTools、trace viewer 或 HTML report。

## Worktree、branch 与 Git index

- 执行上下文固定为当前 `/Users/jiangsheng/cnb/codex` checkout 的 `dev` branch 和共享 Git index。
- 不创建 worktree 或 branch：DOCS task 是实施前硬门禁，FIX task 只有一个提交边界；额外 checkout 不产生独立任务并行收益。
- FIX task 内的 production/unit 编辑与 Browser test 编辑写集合不相交，可以在共享 checkout 并行；二者都禁止操作 Git index。
- 格式化、组合验证、stage 与 commit 由各 task 的唯一 owner 执行。
- 所有 `git add` 使用精确 allowlist；禁止 `git add .`、ignored file、force、amend、squash 和 remote。

## 描述式执行 DAG

以下节点字段和状态语义直接消费 `$delegating-micro-stages` 的执行图契约与 `$action-authorization` 能力信封。计划编写阶段只授权文档落盘，因此所有执行节点的 `authorizationGate.status` 初始为 `pending-plan-confirmation`；用户明确确认计划后，执行前由中央授权 owner 逐节点激活或报告缺口。

### D0：DOCS 组合审查

- `nodeId`: D0
- `taskBoundary`: DOCS（`docs: plan skill typeahead complete results`）
- `operationKind`: 审查
- `outcome`: 设计状态为已确认，设计与计划正文语义一致，工作树中本任务文档 allowlist 精确且无其他 staged 文件。
- `estimatedCost`: 低
- `deferralEvidence`: 无
- `hardPredecessors`: 无
- `consumes`: 用户确认；设计与计划文件；当前 Git status/index
- `produces`: DOCS 可暂存快照的只读审查结论
- `completionEvidence`: 两份文件存在；设计为“已确认”、计划为“待确认/已确认计划执行时不回写”；index 为空；无隐私越界
- `readSet`: 两份工作文档、Git worktree/index metadata
- `writeSet`: 无
- `stateEffects`: 仅审查结果
- `commandScope`: `git status --short`、`git diff --check`、精确文件读取
- `subdelegation`: false
- `executionContext`: 当前 checkout/dev，共享 index read
- `resourceLocks`: `/Users/jiangsheng/cnb/codex/.git/index` read
- `owner`: DOCS review owner
- `verification`: 文档范围、状态和 whitespace 审查通过
- `failureDomain`: D0、D1、D2 及所有实施后继
- `replanTriggers`: 文档丢失、范围漂移、已有 staged 文件、目标分支变化
- `authorizationGate`: `pending-plan-confirmation`；只读审查能力信封

### D1：DOCS 精确暂存

- `nodeId`: D1
- `taskBoundary`: DOCS
- `operationKind`: stage
- `outcome`: 只有本次 design 与 plan 两文件进入 Git index。
- `estimatedCost`: 低
- `deferralEvidence`: 无
- `hardPredecessors`: D0；等待 DOCS 审查稳定结论
- `consumes`: DOCS allowlist
- `produces`: DOCS staged snapshot
- `completionEvidence`: `git diff --cached --name-only` 精确等于两份工作文档，`git diff --cached --check` 通过
- `readSet`: 两份工作文档、Git index
- `writeSet`: `/Users/jiangsheng/cnb/codex/.git/index`
- `stateEffects`: 精确 stage
- `commandScope`: `git add -- docs/superpowers/specs/2026/08/30/2026-08-30-skill-typeahead-sorted-complete-results-design.md docs/superpowers/plans/2026/08/30/2026-08-30-skill-typeahead-sorted-complete-results-plan.md`；cached diff 检查
- `subdelegation`: false
- `executionContext`: 当前 checkout/dev，共享 index write
- `resourceLocks`: `/Users/jiangsheng/cnb/codex/.git/index` write
- `owner`: DOCS Git owner
- `verification`: staged allowlist、cached diff 内容与 whitespace 正确
- `failureDomain`: D1、D2 及所有实施后继
- `replanTriggers`: ignored match、index 含额外文件、cached 内容漂移
- `authorizationGate`: `pending-plan-confirmation`；精确 stage 能力信封

### D2：DOCS 独立提交

- `nodeId`: D2
- `taskBoundary`: DOCS
- `operationKind`: commit
- `outcome`: 创建只包含设计与计划的本地提交 `docs: plan skill typeahead complete results`。
- `estimatedCost`: 低
- `deferralEvidence`: 无
- `hardPredecessors`: D1；等待 DOCS staged snapshot
- `consumes`: DOCS staged snapshot
- `produces`: DOCS commit
- `completionEvidence`: commit id、parent、message 与文件列表精确；index 为空
- `readSet`: Git index、HEAD metadata
- `writeSet`: Git object database、`refs/heads/dev`、Git index
- `stateEffects`: 一个本地 commit
- `commandScope`: `git commit -m 'docs: plan skill typeahead complete results'`；`git show --stat --oneline --decorate=short HEAD`；status/index 核对
- `subdelegation`: false
- `executionContext`: 当前 checkout/dev，共享 branch/index write
- `resourceLocks`: `/Users/jiangsheng/cnb/codex/.git/index` write；Git object database/`refs/heads/dev` write
- `owner`: DOCS Git owner
- `verification`: 提交只含两份工作文档，无 amend/remote
- `failureDomain`: D2 及所有实施后继
- `replanTriggers`: commit 范围、parent、message 错误，branch 漂移
- `authorizationGate`: `pending-plan-confirmation`；本地 commit 能力信封

### E1：Production 与 unit 编辑

- `nodeId`: E1
- `taskBoundary`: FIX（`fix(gui): show all sorted skills`）
- `operationKind`: 编辑
- `outcome`: `skillQuery.ts` 实现两种 query mode 和无上限结果，unit tests 精确锁定全部排序语义。
- `estimatedCost`: 中
- `deferralEvidence`: 无
- `hardPredecessors`: D2；实施必须等待工作文档 commit
- `consumes`: DOCS commit、generated SkillScope、已确认 comparator/结果契约
- `produces`: production + unit 工作树 diff
- `completionEvidence`: diff 只落在 E1 两文件且语义覆盖实现约束；无 formatter/stage 副作用
- `readSet`: `skillQuery.ts`、`skillQuery.test.ts`、生成 SkillScope 类型、设计与计划
- `writeSet`: `skillQuery.ts`、`skillQuery.test.ts`
- `stateEffects`: 两文件工作树修改
- `commandScope`: `apply_patch`；只读 `rg/sed/git diff`
- `subdelegation`: false
- `executionContext`: 当前 checkout/dev，共享 worktree，禁止 index
- `resourceLocks`: E1 两文件 write
- `owner`: production/unit edit owner
- `verification`: 局部静态审查；不运行组合验证
- `failureDomain`: E1、F0、F1、V0、V1、V2、V3、R0、S0、C0、A0、Z0
- `replanTriggers`: 需要修改 renderer/catalog/protocol、改变 fuzzy score、引入固定上限或非 exhaustive scope
- `authorizationGate`: `pending-plan-confirmation`；两文件编辑能力信封

### E2：Browser test 编辑

- `nodeId`: E2
- `taskBoundary`: FIX
- `operationKind`: 编辑
- `outcome`: Browser tests 覆盖 25 项全量列表、旧上限外末项键盘可达、来源排序及受影响 Enter 断言，同时保持现有视觉职责隔离。
- `estimatedCost`: 中
- `deferralEvidence`: 无
- `hardPredecessors`: D2；实施必须等待工作文档 commit
- `consumes`: DOCS commit、已确认扁平排序/视觉不变契约、现有 Browser fixtures
- `produces`: Browser test 工作树 diff
- `completionEvidence`: diff 只落在 Browser test 文件；没有 production/CSS/snapshot 改动
- `readSet`: `ComposerEditor.browser.test.tsx`、设计与计划、parallel Browser config、本地 Vitest assertions/locator docs
- `writeSet`: `ComposerEditor.browser.test.tsx`
- `stateEffects`: 单测试文件工作树修改
- `commandScope`: `apply_patch`；只读 `rg/sed/git diff`
- `subdelegation`: false
- `executionContext`: 当前 checkout/dev，共享 worktree，禁止 index
- `resourceLocks`: Browser test 文件 write
- `owner`: Browser test edit owner
- `verification`: 局部 fixture/断言审查；不运行组合验证
- `failureDomain`: E2、F0、F1、V0、V1、V2、V3、R0、S0、C0、A0、Z0
- `replanTriggers`: 需要新增 E2E/sequential/smoke、修改 production renderer、snapshot 或可见桌面
- `authorizationGate`: `pending-plan-confirmation`；单文件编辑能力信封

### F0：FIX fan-in 审查

- `nodeId`: F0
- `taskBoundary`: FIX
- `operationKind`: fan-in
- `outcome`: E1/E2 组合 diff 完整、无交叉覆盖、无第四个 implementation 文件。
- `estimatedCost`: 低
- `deferralEvidence`: 无
- `hardPredecessors`: E1、E2；等待两个不相交工作树 diff
- `consumes`: production/unit diff、Browser test diff
- `produces`: FIX 组合快照
- `completionEvidence`: 三文件 allowlist 精确；source/test 语义一致；无可见分组或固定上限
- `readSet`: 三个 implementation 文件与组合 diff
- `writeSet`: 无
- `stateEffects`: 组合审查结果
- `commandScope`: `git diff --` 精确三文件、`git status --short`
- `subdelegation`: false
- `executionContext`: 当前 checkout/dev，共享 worktree read
- `resourceLocks`: 三个 implementation 文件 read
- `owner`: FIX fan-in owner
- `verification`: 组合 diff 范围和设计映射通过
- `failureDomain`: F0 及全部 FIX 后继
- `replanTriggers`: writeSet 扩大、冲突覆盖、设计行为缺失
- `authorizationGate`: `pending-plan-confirmation`；组合审查能力信封

### F1：Scoped oxfmt

- `nodeId`: F1
- `taskBoundary`: FIX
- `operationKind`: 格式化
- `outcome`: 精确三文件由 live oxfmt 格式化，且 scoped check 通过。
- `estimatedCost`: 低
- `deferralEvidence`: 无
- `hardPredecessors`: F0；formatter 必须消费稳定组合快照
- `consumes`: FIX 组合快照、live oxfmt
- `produces`: formatted FIX snapshot
- `completionEvidence`: write/check 命令成功；实际 diff 仍仅三文件；无 order-only 范围扩大
- `readSet`: 三文件、oxfmt config/node_modules
- `writeSet`: 三个 implementation 文件
- `stateEffects`: scoped formatter 工作树修改
- `commandScope`: 本文“格式化”两条精确 fnm-backed 命令
- `subdelegation`: false
- `executionContext`: 当前 checkout/dev，共享 worktree
- `resourceLocks`: 三文件 write；oxfmt process
- `owner`: FIX format owner
- `verification`: scoped oxfmt check 通过
- `failureDomain`: F1 及全部 FIX 后继
- `replanTriggers`: formatter 修改第四文件、工具来源漂移或格式失败需范围外改动
- `authorizationGate`: `pending-plan-confirmation`；精确三文件格式化能力信封

### V0：Focused unit verification

- `nodeId`: V0
- `taskBoundary`: FIX
- `operationKind`: 验证
- `outcome`: `skillQuery.test.ts` 被实际收集并通过，证明空/非空 query 排序与全量结果。
- `estimatedCost`: 中
- `deferralEvidence`: 无；若与 V1 同时 ready，只因共享 `.vite` write lock 等待，不新增硬依赖
- `hardPredecessors`: F1；验证读取 formatted snapshot
- `consumes`: formatted FIX snapshot、unit config
- `produces`: focused unit green evidence
- `completionEvidence`: 目标文件非零收集并全绿；失败不是 config/runner/零收集
- `readSet`: production/unit 文件、Vitest unit config、node_modules
- `writeSet`: 无代理显式输出
- `stateEffects`: Vitest 内部 cache/results 状态
- `commandScope`: 本文 focused unit 命令
- `subdelegation`: false
- `executionContext`: `codex-gui` cwd，fnm Node/pnpm
- `resourceLocks`: `/Users/jiangsheng/cnb/codex/codex-gui/node_modules/.vite` write
- `owner`: unit verification owner
- `verification`: 全部目标 tests pass
- `failureDomain`: V0、R0、S0、C0、A0、Z0；不暂停独立 V1/V2/V3
- `replanTriggers`: 目标零收集、测试暴露计划外语义、需改范围外 fixture
- `authorizationGate`: `pending-plan-confirmation`；focused unit 验证能力信封

### V1：Focused parallel Browser verification

- `nodeId`: V1
- `taskBoundary`: FIX
- `operationKind`: 验证
- `outcome`: `ComposerEditor.browser.test.tsx` 在 Chromium、Firefox、WebKit headless instances 被实际收集并全绿。
- `estimatedCost`: 高
- `deferralEvidence`: 无；与 V0 共享 `.vite` write lock，调度时优先保护本关键路径节点
- `hardPredecessors`: F1；验证读取 formatted snapshot
- `consumes`: formatted FIX snapshot、parallel Browser config、installed Playwright browsers
- `produces`: 三浏览器 Level 1 green evidence
- `completionEvidence`: 三 instance 均非零收集且目标文件全绿；25 项、来源顺序、ARIA、键盘末项和视觉不变量成立
- `readSet`: production/Browser test 文件、Vite/Vitest configs、node_modules、browser binaries
- `writeSet`: 无代理显式输出
- `stateEffects`: Vitest/Vite/browser 内部 cache、results 与临时状态
- `commandScope`: 本文 focused Browser 命令；禁止 headed、update、trace viewer
- `subdelegation`: false
- `executionContext`: `codex-gui` cwd，fnm Node/pnpm，headless browser
- `resourceLocks`: `/Users/jiangsheng/cnb/codex/codex-gui/node_modules/.vite` write；Chromium/Firefox/WebKit runner sessions
- `owner`: Browser verification owner
- `verification`: 三浏览器 focused file pass
- `failureDomain`: V1、R0、S0、C0、A0、Z0；不暂停独立 V0/V2/V3
- `replanTriggers`: Browser target未收集、需要 optimizer/config patch、browser 缺失或真实视觉结构与设计冲突
- `authorizationGate`: `pending-plan-confirmation`；focused headless Browser 验证能力信封

### V2：Frontend lint

- `nodeId`: V2
- `taskBoundary`: FIX
- `operationKind`: 验证
- `outcome`: live frontend lint 固化入口通过。
- `estimatedCost`: 中
- `deferralEvidence`: 无
- `hardPredecessors`: F1；读取 formatted snapshot
- `consumes`: formatted FIX snapshot、live lint scripts/config
- `produces`: lint green evidence
- `completionEvidence`: `pnpm run lint` exit 0；无 fix/baseline/ignore
- `readSet`: codex-gui source/config/node_modules
- `writeSet`: 无代理显式输出
- `stateEffects`: ESLint 内部 cache
- `commandScope`: 本文 lint 命令
- `subdelegation`: false
- `executionContext`: `codex-gui` cwd，fnm Node/pnpm
- `resourceLocks`: `/Users/jiangsheng/cnb/codex/codex-gui/.eslintcache` write（若 live script 使用）
- `owner`: lint verification owner
- `verification`: lint exit 0
- `failureDomain`: V2、R0、S0、C0、A0、Z0；不暂停独立 V0/V1/V3
- `replanTriggers`: lint 要求范围外修改或检查配置漂移
- `authorizationGate`: `pending-plan-confirmation`；frontend lint 验证能力信封

### V3：Frontend type-check

- `nodeId`: V3
- `taskBoundary`: FIX
- `operationKind`: 验证
- `outcome`: live `tsc -b --noEmit` 固化入口通过，并覆盖 unit 与 Browser TypeScript project references。
- `estimatedCost`: 中
- `deferralEvidence`: 无
- `hardPredecessors`: F1；读取 formatted snapshot
- `consumes`: formatted FIX snapshot、tsconfig project graph、generated protocol types
- `produces`: type-check green evidence
- `completionEvidence`: `pnpm run type-check` exit 0；错误不得通过 ignore 或降级消除
- `readSet`: codex-gui source、tests、tsconfigs、generated TypeScript、node_modules
- `writeSet`: 无代理显式输出
- `stateEffects`: TypeScript 内部 incremental/cache 状态（若产生）
- `commandScope`: 本文 type-check 命令
- `subdelegation`: false
- `executionContext`: `codex-gui` cwd，fnm Node/pnpm
- `resourceLocks`: TypeScript project graph read；内部 cache write（若产生）
- `owner`: type-check verification owner
- `verification`: type-check exit 0
- `failureDomain`: V3、R0、S0、C0、A0、Z0；不暂停独立 V0/V1/V2
- `replanTriggers`: generated contract drift、需要 schema/generator 修改或范围外类型修复
- `authorizationGate`: `pending-plan-confirmation`；frontend type-check 验证能力信封

### R0：FIX 最终组合审查

- `nodeId`: R0
- `taskBoundary`: FIX
- `operationKind`: 审查
- `outcome`: 所有验证消费同一 formatted snapshot 并通过，最终 diff 只含三文件且完整满足设计。
- `estimatedCost`: 低
- `deferralEvidence`: 无
- `hardPredecessors`: V0、V1、V2、V3；等待四类稳定验证证据
- `consumes`: unit/Browser/lint/type green evidence、最终 diff
- `produces`: FIX 可暂存快照
- `completionEvidence`: 三文件 allowlist；`git diff --check` 通过；无视觉/protocol/order-only/范围外变更
- `readSet`: 三文件、组合 diff、验证结果、Git status/index
- `writeSet`: 无
- `stateEffects`: 最终审查结论
- `commandScope`: 精确 `git diff --check --`、`git diff --`、`git status --short`
- `subdelegation`: false
- `executionContext`: 当前 checkout/dev，共享 worktree/index read
- `resourceLocks`: 三文件 read；Git index read
- `owner`: FIX review owner
- `verification`: 设计映射、范围、验证证据和 whitespace 全部闭合
- `failureDomain`: R0、S0、C0、A0、Z0
- `replanTriggers`: 最终 diff 漂移、验证读取不同 snapshot、发现额外行为
- `authorizationGate`: `pending-plan-confirmation`；最终审查能力信封

### S0：FIX 精确暂存

- `nodeId`: S0
- `taskBoundary`: FIX
- `operationKind`: stage
- `outcome`: 只有 production 与两个测试文件进入 index。
- `estimatedCost`: 低
- `deferralEvidence`: 无
- `hardPredecessors`: R0；等待 FIX 可暂存快照
- `consumes`: 三文件 allowlist
- `produces`: FIX staged snapshot
- `completionEvidence`: cached name list 精确等于三文件；cached diff/check 通过；不含 DOCS
- `readSet`: 三文件、Git index
- `writeSet`: Git index
- `stateEffects`: 精确 stage
- `commandScope`: `git add -- codex-gui/src/features/composerEditor/skillQuery.ts codex-gui/src/features/composerEditor/__tests__/skillQuery.test.ts codex-gui/src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx`；cached review
- `subdelegation`: false
- `executionContext`: 当前 checkout/dev，共享 index write
- `resourceLocks`: `/Users/jiangsheng/cnb/codex/.git/index` write
- `owner`: FIX Git owner
- `verification`: staged allowlist、cached diff 内容与 whitespace 正确
- `failureDomain`: S0、C0、A0、Z0
- `replanTriggers`: index 含额外文件、忽略规则命中、cached diff 漂移
- `authorizationGate`: `pending-plan-confirmation`；精确 stage 能力信封

### C0：FIX 独立提交

- `nodeId`: C0
- `taskBoundary`: FIX
- `operationKind`: commit
- `outcome`: 创建只包含 production 与测试的本地提交 `fix(gui): show all sorted skills`。
- `estimatedCost`: 低
- `deferralEvidence`: 无
- `hardPredecessors`: S0；等待 FIX staged snapshot
- `consumes`: FIX staged snapshot
- `produces`: FIX commit
- `completionEvidence`: commit id、parent、message 与三文件列表精确；index 为空；DOCS commit 保持独立 parent
- `readSet`: Git index、HEAD/DOCS commit metadata
- `writeSet`: Git object database、`refs/heads/dev`、Git index
- `stateEffects`: 一个本地 behavior commit
- `commandScope`: `git commit -m 'fix(gui): show all sorted skills'`；`git show --stat --oneline --decorate=short HEAD`；status/index 核对
- `subdelegation`: false
- `executionContext`: 当前 checkout/dev，共享 branch/index write
- `resourceLocks`: Git index write；Git object database/`refs/heads/dev` write
- `owner`: FIX Git owner
- `verification`: 提交只含三文件，不 amend/squash/remote
- `failureDomain`: C0、A0、Z0
- `replanTriggers`: commit 范围、parent、message 错误或 branch 漂移
- `authorizationGate`: `pending-plan-confirmation`；本地 commit 能力信封

### A0：Level 2 headless real-runtime acceptance

- `nodeId`: A0
- `taskBoundary`: FINAL（无提交）
- `operationKind`: 验证
- `outcome`: 在当次真实 Codex runtime 中无头验证真实 catalog 的扁平来源排序、全量列表和末项键盘可达。
- `estimatedCost`: 中
- `deferralEvidence`: 无
- `hardPredecessors`: C0；只验收稳定 FIX commit
- `consumes`: FIX commit、当次 outer `launch_gui` 完整 URL、installed headless browser
- `produces`: Level 2 acceptance evidence 或精确 unexecuted 原因
- `completionEvidence`: headless session evidence、route/runtime、候选顺序/标签、无视觉分组、末项导航与 Escape 结果完整记录
- `readSet`: 真实 GUI runtime、当前 page DOM/accessibility snapshot、browser session metadata
- `writeSet`: 无 workspace 文件
- `stateEffects`: 临时 headless browser session，完成后正常 close
- `commandScope`: outer `launch_gui`；本文 Level 2 `playwright-cli` 命令骨架；禁止 headed/install/trace/report
- `subdelegation`: false
- `executionContext`: 当前 host 的临时 headless browser session
- `resourceLocks`: 当前 thread GUI runtime read；临时 Playwright session write
- `owner`: Level 2 acceptance owner
- `verification`: 所列真实场景通过；若前置缺失则标记未执行且不声称完整验收
- `failureDomain`: A0、Z0 的完整验收声明；不回滚已通过的 FIX commit
- `replanTriggers`: 真实行为与 Level 1 冲突、需要可见桌面、URL/runtime 不可用或发现 catalog/renderer 范围问题
- `authorizationGate`: `pending-plan-confirmation`；临时 headless browser 验收能力信封

### Z0：最终提交与状态审计

- `nodeId`: Z0
- `taskBoundary`: FINAL（无提交）
- `operationKind`: fan-in
- `outcome`: DOCS 与 FIX 两个独立 commit、验证结果和最终工作树状态形成终态证据。
- `estimatedCost`: 低
- `deferralEvidence`: 无
- `hardPredecessors`: C0、A0；等待两个 commits 与 Level 2 结果/未执行记录
- `consumes`: DOCS commit、FIX commit、Level 1/2 evidence、Git status
- `produces`: 最终结果摘要
- `completionEvidence`: 两 commit 身份/顺序/文件范围正确；index 空；无计划内未提交 diff；Level 1/2/3 分别报告
- `readSet`: Git log/show/status、验证结果
- `writeSet`: 无
- `stateEffects`: 最终审计结果
- `commandScope`: `git log -2 --oneline --decorate=short`、精确 `git show --stat`、`git status --short`
- `subdelegation`: false
- `executionContext`: 当前 checkout/dev，只读
- `resourceLocks`: Git metadata read
- `owner`: root coordinator
- `verification`: 最终状态满足设计与计划；无 remote
- `failureDomain`: Z0
- `replanTriggers`: commit 身份/范围错误、index 非空、计划内 diff 残留、验证证据失效
- `authorizationGate`: `pending-plan-confirmation`；最终只读审计能力信封

## Ready set、关键路径与 fan-out/fan-in

计划确认并由中央授权激活后：

- 初始 ready set：`D0`。
- DOCS 硬门禁：`D0 → D1 → D2`。这条链是实施开始的真实稳定产物依赖，不是文档顺序。
- `D2` 完成后 fan-out：`E1` 与 `E2` 同时 ready，写集合不相交，应并行执行。
- FIX fan-in：`E1 + E2 → F0 → F1`。
- `F1` 完成后 fan-out：`V0`、`V1`、`V2`、`V3` 同时 ready。`V0` 与 `V1` 都写 canonical `codex-gui/node_modules/.vite`，因此只通过资源锁互斥，不建立硬前置；`V1` 成本最高并位于关键路径，锁可用时优先启动。`V2`、`V3` 与当前占锁测试可以并行。
- 验证 fan-in：`V0 + V1 + V2 + V3 → R0 → S0 → C0`。
- 最终链：`C0 → A0 → Z0`。

粗粒度关键路径预计为：DOCS review/stage/commit → 较慢的 E1/E2 分支 → fan-in/format → 三浏览器 V1 → review/stage/FIX commit → Level 2 → final audit。

## 串行边与漏并行反向审计

- D0/D1/D2 串行：分别等待审查快照、staged snapshot 和 DOCS commit；且共享 Git index/branch write。
- D2 到 E1/E2：全局规则要求工作文档 commit 成功后才能实现。
- E1/E2 不串行：文件 writeSet 不相交，两个结果都能独立产生有价值的 task 内 diff。
- F0/F1 串行：formatter 必须消费完整组合 diff，不能在两个编辑节点仍写文件时运行。
- V0/V1/V2/V3 不建立相互硬依赖：它们都读取同一 formatted snapshot。仅 V0/V1 因共享 `.vite` write lock 不能同时运行；这是最小互斥域，不扩大为全验证串行。
- R0 等待四个验证证据，S0/C0 等待可暂存/已暂存快照；这些是 commit fan-in 的真实稳定产物。
- A0 等待 FIX commit，使 Level 2 验收读取稳定提交而非可变 diff；Z0 等待 acceptance 结果以形成完整终态。
- 未创建 worktree：只有一个 implementation task boundary，E1/E2 可在同一 checkout 的不相交文件上并行；新增 worktree 会引入 branch/index 集成成本而不缩短跨 task 关键路径。

`deferralEvidence` 当前全部为空。资源冲突只让 ready 节点等待对应 canonical lock；锁释放后必须立即重算 ready set，不得附加冷却期、agent 复用或编号顺序。

## Task commit 拓扑

1. DOCS：`docs: plan skill typeahead complete results`
   - 只包含本次 design 与 plan。
   - 是所有 implementation 节点的硬前置。
2. FIX：`fix(gui): show all sorted skills`
   - 只包含 `skillQuery.ts`、unit test、Browser test。
   - 同时包含行为实现及直接回归测试；没有独立 order-only 调整。

禁止 squash、amend、把 DOCS 与 FIX 合并、把后续修正并入已有 commit。若已提交内容需要修正，在原任务边界内创建新的独立修正 commit，并按失败插图重新验证受影响后继。

## 最终验证拓扑与完成条件

Level 1：

- focused unit：适用且必须通过；
- focused parallel Browser：适用且必须在 Chromium/Firefox/WebKit 通过；
- frontend lint：适用且必须通过；
- frontend type-check：适用且必须通过；
- E2E、smoke、sequential、snapshot：不适用，原因见事实闭包。

Level 2：

- 适用且默认无头；验证真实 catalog、扁平来源排序、全量结果和末项键盘路径。
- 若当次 URL/runtime/headless evidence 不可用，明确标记“Level 2 未执行”，不得宣称完整验收。

Level 3：

- 不适用；不得打开可见浏览器或桌面窗口。

完成必须同时满足：

- 两个 task commits 独立存在且范围精确；
- 所有 Level 1 验证通过；
- Level 2 通过，或明确报告其未执行导致验收不完整；
- production 最终只有一个查询排序路径，不保留固定上限、fallback、双路径或兼容层；
- 工作树/index 无本计划残留；无 remote、force、install、amend、squash；
- 终态回复按执行图契约报告“实际并行”“关键路径”“未启动 ready 节点”。

## 阶段边界

本文仅完成计划落盘。用户明确确认本计划前，所有 DAG 执行节点保持未授权，不得 stage/commit 工作文档、修改 production/tests、运行验证或启动 browser。确认后仍必须先完成 DOCS 独立提交，才能进入 implementation。

## 2026-08-30 执行中补充计划

本节保留上述原计划及其已完成历史，只在直接相交字段上取代原计划：实施文件由三文件扩大为四文件；focused unit/Browser 命令、剩余 DAG、任务提交拓扑、完成条件和阶段边界以本节为准。已确认产品行为、设计边界、Level 2/Level 3 边界及其他未相交约束继续有效。

### 稳定执行证据与新增范围

- 原 DOCS task 已形成独立提交 `075dfc7c659b944f4977746bf8df4c4d7d32da50`，message 为 `docs: plan skill typeahead complete results`，只包含设计与原计划；禁止 amend、squash 或重写该提交。
- E1、E2、F1 已完成，当前未提交 implementation diff 仍精确位于原三个文件；Git index 为空。
- V0 已改用 direct Vitest 文件过滤命令 `/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/composerEditor/__tests__/skillQuery.test.ts`，唯一收集 `skillQuery.test.ts`，22/22 通过。E3 不读写 production/unit 输入，因此该证据保持有效，不重跑 V0。
- V2 与 V3 在原三文件快照上通过；E3 将新增 TSX 修改，因此这两项证据失效，必须在 E3/F2 后以 V2R、V3R 重跑。
- 原 V1 命令 exit 1；它实际收集 24 个源文件在 3 个 Browser instances 中运行，共 846 tests，843 passed、3 failed，不能作为 focused 命中证据。目标 `ComposerEditor.browser.test.tsx` 在三个 instances 中各 31/31 通过；唯一失败是 `AppShell.browser.test.tsx` 的同一旧断言在三个 instances 中各失败一次，actual 25、expected 20。
- `AppShell.browser.test.tsx` 的 responsive fixture 构造 25 个 candidates，但仍硬编码断言 20 项。它是全量结果行为的直接 Browser 消费者，必须纳入本次实施；未发现需要第五个实施文件的证据。

在原三个 implementation 文件之外，只新增 `codex-gui/src/__tests__/AppShell.browser.test.tsx`。E3 只把 responsive fixture 的 option 数断言从硬编码 `20` 改为 `candidates.length` 或语义等价的精确 `25`。既有 responsive viewport、菜单几何、滚动、焦点、视觉和 DOM/ARIA 断言全部保留；不修改 production、CSS、fixture 数量或布局语义。

### 覆盖后的 focused 与格式化命令

Focused unit 只使用：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/composerEditor/__tests__/skillQuery.test.ts
```

Focused Browser 只使用：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run --config=vitest.browser.parallel.config.ts src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx src/__tests__/AppShell.browser.test.tsx
```

禁止使用 `pnpm run ... -- <path>` 作为 focused 验证。Browser 命令必须唯一收集上述两个源文件，并在 Chromium、Firefox、WebKit 三个 instances 中运行；`ComposerEditor.browser.test.tsx` 与 `AppShell.browser.test.tsx` 必须全部通过。

F2 只对新增文件执行原生 scoped formatter：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt --write src/__tests__/AppShell.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt --check src/__tests__/AppShell.browser.test.tsx
```

### 补充描述式执行 DAG

下列 DAG 不改写 D0-D2、E1、E2、F1、V0、V2、V3 的已完成历史。P1 属于本次补充计划落盘后的只读审查；D3 及所有后继在用户明确确认补充计划前保持 `pending-supplemental-plan-confirmation`。

#### P1：补充计划落盘审查

- `nodeId`: P1
- `taskBoundary`: PLAN-AMEND（无提交）
- `operationKind`: 审查
- `outcome`: 补充计划只修改当前计划文档，完整记录稳定证据、四文件范围、direct Vitest 命令与剩余 DAG。
- `estimatedCost`: 低；`deferralEvidence`: 无
- `hardPredecessors`: 无；消费用户对补充计划落盘的明确授权
- `consumes`: 当前计划、原 DOCS commit、三文件未提交 diff、AppShell 旧断言与验证证据
- `produces`: 可供用户确认的补充计划工作树快照
- `completionEvidence`: `git diff --check` 通过；writeSet 精确为单一计划文件；Git index 为空
- `readSet`: 设计、计划、四个 implementation 文件、package/Vitest configs、Git status/diff/commit metadata
- `writeSet`: `docs/superpowers/plans/2026/08/30/2026-08-30-skill-typeahead-sorted-complete-results-plan.md`
- `stateEffects`: 单一计划文档工作树修改
- `commandScope`: `apply_patch` 仅编辑计划；只读 `rg`、`sed`、`git diff --check`、`git diff --`、`git status --short`
- `subdelegation`: false
- `executionContext`: 当前 checkout/dev，共享 worktree，Git index read-only
- `resourceLocks`: 计划文件 write；`/Users/jiangsheng/cnb/codex/.git/index` read
- `owner`: supplemental plan edit/review owner
- `verification`: 补充正文与当前一手证据一致，未触碰 implementation/design/index
- `failureDomain`: P1 及全部后继
- `replanTriggers`: 需要第五个实施文件、改变已确认产品行为、无法用 direct Vitest 文件过滤闭合
- `authorizationGate`: `active-supplemental-plan-landing`；只消费用户 `确认补充计划落盘`，P1 完成即到期

#### D3：补充计划精确暂存

- `nodeId`: D3
- `taskBoundary`: DOCS-AMEND（`docs: amend skill typeahead complete results plan`）
- `operationKind`: stage
- `outcome`: Git index 只包含当前计划文档的补充 diff。
- `estimatedCost`: 低；`deferralEvidence`: 无
- `hardPredecessors`: P1；等待补充计划审查快照与用户确认
- `consumes`: 补充计划工作树快照、用户补充计划确认
- `produces`: DOCS-AMEND staged snapshot
- `completionEvidence`: cached name list 精确等于单一计划文件；cached diff/check 通过
- `readSet`: 当前计划文档、Git index
- `writeSet`: `/Users/jiangsheng/cnb/codex/.git/index`
- `stateEffects`: 精确 stage 单一计划文件
- `commandScope`: `git add -- docs/superpowers/plans/2026/08/30/2026-08-30-skill-typeahead-sorted-complete-results-plan.md`；cached diff/name/check 只读审查
- `subdelegation`: false
- `executionContext`: 当前 checkout/dev，共享 index write
- `resourceLocks`: `/Users/jiangsheng/cnb/codex/.git/index` write
- `owner`: DOCS-AMEND Git owner
- `verification`: index 不含 implementation/design/其他文件
- `failureDomain`: D3、D4 及全部后继
- `replanTriggers`: index 含额外文件、ignored match、补充 diff 漂移
- `authorizationGate`: `pending-supplemental-plan-confirmation`

#### D4：补充计划独立提交

- `nodeId`: D4
- `taskBoundary`: DOCS-AMEND
- `operationKind`: commit
- `outcome`: 创建只包含计划补充的本地提交 `docs: amend skill typeahead complete results plan`。
- `estimatedCost`: 低；`deferralEvidence`: 无
- `hardPredecessors`: D3；等待 DOCS-AMEND staged snapshot
- `consumes`: DOCS-AMEND staged snapshot、原 DOCS commit identity
- `produces`: DOCS-AMEND commit
- `completionEvidence`: commit id、parent、message 与单文件列表精确；index 为空；原 DOCS commit 未改变
- `readSet`: Git index、HEAD 与原 DOCS commit metadata
- `writeSet`: Git object database、`refs/heads/dev`、Git index
- `stateEffects`: 一个独立本地文档提交
- `commandScope`: `git commit -m 'docs: amend skill typeahead complete results plan'`；精确 `git show`、status/index 核对
- `subdelegation`: false
- `executionContext`: 当前 checkout/dev，共享 branch/index write
- `resourceLocks`: Git index、Git object database、`refs/heads/dev` write
- `owner`: DOCS-AMEND Git owner
- `verification`: parent 为原 DOCS commit；无 amend/squash/remote/force
- `failureDomain`: D4 及全部 implementation 后继
- `replanTriggers`: commit parent、message、文件范围或 branch 漂移
- `authorizationGate`: `pending-supplemental-plan-confirmation`

#### E3：AppShell Browser 断言编辑

- `nodeId`: E3
- `taskBoundary`: FIX（`fix(gui): show all sorted skills`）
- `operationKind`: 编辑
- `outcome`: responsive fixture 对 25 个 candidates 精确断言全部 options，同时保持原几何与视觉契约。
- `estimatedCost`: 低；`deferralEvidence`: 无
- `hardPredecessors`: D4；补充计划提交是恢复 implementation 的硬门禁
- `consumes`: DOCS-AMEND commit、AppShell responsive fixture、已完成三文件 diff
- `produces`: AppShell 单文件工作树 diff
- `completionEvidence`: 只把 option count 从硬编码 20 改为 `candidates.length` 或等价精确 25；无其他断言或 fixture 变化
- `readSet`: AppShell test、设计、计划、当前三文件 diff
- `writeSet`: `codex-gui/src/__tests__/AppShell.browser.test.tsx`
- `stateEffects`: 单测试文件工作树修改
- `commandScope`: `apply_patch`；只读 `rg`、`sed`、`git diff --`
- `subdelegation`: false
- `executionContext`: 当前 checkout/dev，共享 worktree，禁止 index
- `resourceLocks`: AppShell test file write
- `owner`: AppShell test edit owner
- `verification`: 局部断言审查；不运行测试或 formatter
- `failureDomain`: E3 及全部 FIX 后继
- `replanTriggers`: 需要第五个文件、改变 fixture/几何/视觉、无法用精确 option count 闭合
- `authorizationGate`: `pending-supplemental-plan-confirmation`

#### F2：AppShell scoped format

- `nodeId`: F2
- `taskBoundary`: FIX
- `operationKind`: 格式化
- `outcome`: 只对 AppShell 文件运行 scoped oxfmt write/check，形成四文件最终格式化快照。
- `estimatedCost`: 低；`deferralEvidence`: 无
- `hardPredecessors`: E3；formatter 消费稳定 AppShell diff
- `consumes`: E3 diff、已完成 F1 的三文件 formatted snapshot
- `produces`: 四文件 formatted FIX snapshot
- `completionEvidence`: scoped write 后 scoped check exit 0；diff 仍精确为四文件
- `readSet`: AppShell 文件、oxfmt config/binary、当前三文件 diff
- `writeSet`: `codex-gui/src/__tests__/AppShell.browser.test.tsx`
- `stateEffects`: scoped formatter 对 AppShell 文件的必要修改
- `commandScope`: 本节两条 AppShell scoped oxfmt 命令
- `subdelegation`: false
- `executionContext`: `codex-gui` cwd，fnm Node/pnpm，共享 worktree
- `resourceLocks`: AppShell file write；oxfmt runner
- `owner`: FIX formatter owner
- `verification`: write/check 均成功且未产生范围外 diff
- `failureDomain`: F2 及全部 FIX 后继
- `replanTriggers`: formatter 修改范围外文件、工具来源漂移或要求额外写集合
- `authorizationGate`: `pending-supplemental-plan-confirmation`

#### V1R：修正后的 focused Browser verification

- `nodeId`: V1R
- `taskBoundary`: FIX
- `operationKind`: 验证
- `outcome`: direct Vitest Browser 命令只收集两个目标源文件，并在三浏览器 instances 中全部通过。
- `estimatedCost`: 高；`deferralEvidence`: 无；与任何同时使用 `.vite` write lock 的节点仅资源互斥
- `hardPredecessors`: F2；读取四文件 formatted snapshot
- `consumes`: formatted FIX snapshot、parallel Browser config、installed Playwright browsers
- `produces`: corrected focused Browser green evidence
- `completionEvidence`: 只收集两个目标源文件 × 3 instances；ComposerEditor 与 AppShell 均全绿，非零收集
- `readSet`: 四个 implementation 文件、Vite/Vitest configs、node_modules、browser binaries
- `writeSet`: 无代理显式输出
- `stateEffects`: Vitest/Vite/browser 内部 cache、results 与临时状态
- `commandScope`: 本节 exact focused Browser 命令；禁止 `pnpm run ... -- <path>`、headed、update、trace viewer
- `subdelegation`: false
- `executionContext`: `codex-gui` cwd，fnm Node/pnpm，headless Browser instances
- `resourceLocks`: `/Users/jiangsheng/cnb/codex/codex-gui/node_modules/.vite` write；三 browser runner sessions
- `owner`: corrected Browser verification owner
- `verification`: 两文件在三 instances 中全部 tests pass
- `failureDomain`: V1R、R1、S1、C1、A1、Z1；不暂停独立 V2R/V3R
- `replanTriggers`: 收集范围不精确、需要 config/optimizer patch、browser 缺失或发现计划外行为
- `authorizationGate`: `pending-supplemental-plan-confirmation`

#### V2R：Frontend lint rerun

- `nodeId`: V2R
- `taskBoundary`: FIX
- `operationKind`: 验证
- `outcome`: 四文件最终快照通过 live frontend lint。
- `estimatedCost`: 中；`deferralEvidence`: 无
- `hardPredecessors`: F2；E3 使原 V2 证据失效
- `consumes`: formatted FIX snapshot、live lint scripts/config
- `produces`: refreshed lint green evidence
- `completionEvidence`: `/opt/homebrew/bin/fnm exec --using-file pnpm run lint` exit 0；无 fix/baseline/ignore
- `readSet`: codex-gui source/config/node_modules
- `writeSet`: 无代理显式输出
- `stateEffects`: ESLint 内部 cache
- `commandScope`: `/opt/homebrew/bin/fnm exec --using-file pnpm run lint`
- `subdelegation`: false
- `executionContext`: `codex-gui` cwd，fnm Node/pnpm
- `resourceLocks`: `.eslintcache` write（若 live script 使用）
- `owner`: lint rerun owner
- `verification`: lint exit 0
- `failureDomain`: V2R、R1、S1、C1、A1、Z1；不暂停独立 V1R/V3R
- `replanTriggers`: lint 要求范围外修改或检查配置漂移
- `authorizationGate`: `pending-supplemental-plan-confirmation`

#### V3R：Frontend type-check rerun

- `nodeId`: V3R
- `taskBoundary`: FIX
- `operationKind`: 验证
- `outcome`: 四文件最终快照通过 live frontend type-check。
- `estimatedCost`: 中；`deferralEvidence`: 无
- `hardPredecessors`: F2；E3 使原 V3 证据失效
- `consumes`: formatted FIX snapshot、tsconfig project graph、generated protocol types
- `produces`: refreshed type-check green evidence
- `completionEvidence`: `/opt/homebrew/bin/fnm exec --using-file pnpm run type-check` exit 0；无 ignore/skip/降级
- `readSet`: codex-gui source、tests、tsconfigs、generated TypeScript、node_modules
- `writeSet`: 无代理显式输出
- `stateEffects`: TypeScript incremental/cache 状态（若产生）
- `commandScope`: `/opt/homebrew/bin/fnm exec --using-file pnpm run type-check`
- `subdelegation`: false
- `executionContext`: `codex-gui` cwd，fnm Node/pnpm
- `resourceLocks`: TypeScript project graph read；内部 cache write（若产生）
- `owner`: type-check rerun owner
- `verification`: type-check exit 0
- `failureDomain`: V3R、R1、S1、C1、A1、Z1；不暂停独立 V1R/V2R
- `replanTriggers`: generated contract drift、需要 schema/generator 修改或范围外类型修复
- `authorizationGate`: `pending-supplemental-plan-confirmation`

#### R1：FIX 最终 fan-in 审查

- `nodeId`: R1
- `taskBoundary`: FIX
- `operationKind`: fan-in
- `outcome`: V0 保留证据与 V1R/V2R/V3R 新证据共同覆盖同一四文件最终快照，diff 完整满足设计。
- `estimatedCost`: 低；`deferralEvidence`: 无
- `hardPredecessors`: V1R、V2R、V3R；V0 已完成且输入未变
- `consumes`: V0 unit evidence、V1R Browser evidence、V2R lint evidence、V3R type evidence、四文件 diff
- `produces`: 四文件 FIX 可暂存快照
- `completionEvidence`: 四文件 allowlist；`git diff --check` 通过；无视觉/protocol/order-only/范围外变更
- `readSet`: 四个 implementation 文件、组合 diff、验证结果、Git status/index
- `writeSet`: 无
- `stateEffects`: 最终审查结论
- `commandScope`: 精确 `git diff --check --`、`git diff --`、`git status --short`
- `subdelegation`: false
- `executionContext`: 当前 checkout/dev，共享 worktree/index read
- `resourceLocks`: 四文件 read；Git index read
- `owner`: FIX final review owner
- `verification`: 设计映射、四文件范围、V0 稳定性与新验证证据全部闭合
- `failureDomain`: R1、S1、C1、A1、Z1
- `replanTriggers`: 最终 diff 漂移、V0 输入变化、验证读取不同快照或发现额外行为
- `authorizationGate`: `pending-supplemental-plan-confirmation`

#### S1：FIX 四文件精确暂存

- `nodeId`: S1
- `taskBoundary`: FIX
- `operationKind`: stage
- `outcome`: 只有四个 implementation 文件进入 Git index。
- `estimatedCost`: 低；`deferralEvidence`: 无
- `hardPredecessors`: R1；等待四文件可暂存快照
- `consumes`: 四文件 allowlist
- `produces`: FIX staged snapshot
- `completionEvidence`: cached name list 精确等于四文件；cached diff/check 通过；不含 docs
- `readSet`: 四个 implementation 文件、Git index
- `writeSet`: `/Users/jiangsheng/cnb/codex/.git/index`
- `stateEffects`: 精确 stage 四个 implementation 文件
- `commandScope`: `git add -- codex-gui/src/features/composerEditor/skillQuery.ts codex-gui/src/features/composerEditor/__tests__/skillQuery.test.ts codex-gui/src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx codex-gui/src/__tests__/AppShell.browser.test.tsx`；cached review
- `subdelegation`: false
- `executionContext`: 当前 checkout/dev，共享 index write
- `resourceLocks`: `/Users/jiangsheng/cnb/codex/.git/index` write
- `owner`: FIX Git owner
- `verification`: staged allowlist、cached diff 内容与 whitespace 正确
- `failureDomain`: S1、C1、A1、Z1
- `replanTriggers`: index 含额外文件、ignored match 或 cached diff 漂移
- `authorizationGate`: `pending-supplemental-plan-confirmation`

#### C1：FIX 独立提交

- `nodeId`: C1
- `taskBoundary`: FIX
- `operationKind`: commit
- `outcome`: 创建只包含四个 implementation 文件的本地提交 `fix(gui): show all sorted skills`。
- `estimatedCost`: 低；`deferralEvidence`: 无
- `hardPredecessors`: S1；等待 FIX staged snapshot
- `consumes`: FIX staged snapshot、DOCS-AMEND commit metadata
- `produces`: FIX commit
- `completionEvidence`: commit id、parent、message 与四文件列表精确；index 为空；parent 为 DOCS-AMEND commit
- `readSet`: Git index、HEAD/DOCS-AMEND metadata
- `writeSet`: Git object database、`refs/heads/dev`、Git index
- `stateEffects`: 一个本地 behavior commit
- `commandScope`: `git commit -m 'fix(gui): show all sorted skills'`；精确 `git show`、status/index 核对
- `subdelegation`: false
- `executionContext`: 当前 checkout/dev，共享 branch/index write
- `resourceLocks`: Git index、Git object database、`refs/heads/dev` write
- `owner`: FIX Git owner
- `verification`: 提交只含四文件；不 amend/squash/remote/force
- `failureDomain`: C1、A1、Z1
- `replanTriggers`: commit parent、message、范围错误或 branch 漂移
- `authorizationGate`: `pending-supplemental-plan-confirmation`

#### A1：Level 2 headless real-runtime acceptance

- `nodeId`: A1
- `taskBoundary`: FINAL（无提交）
- `operationKind`: 验证
- `outcome`: 在稳定 FIX commit 上按原 A0 边界完成真实 runtime 无头验收，或形成精确未执行证据。
- `estimatedCost`: 中；`deferralEvidence`: 无
- `hardPredecessors`: C1；只验收稳定 FIX commit
- `consumes`: FIX commit、当次完整 GUI URL、installed headless browser
- `produces`: Level 2 acceptance evidence 或精确 unexecuted 原因
- `completionEvidence`: 与原 A0 相同；不得用 Level 1 替代
- `readSet`: 真实 GUI runtime、page DOM/accessibility snapshot、browser session metadata
- `writeSet`: 无 workspace 文件
- `stateEffects`: 临时 headless browser session，完成后正常 close
- `commandScope`: 原 Level 2 `playwright-cli` 命令骨架；禁止 headed/install/trace/report
- `subdelegation`: false
- `executionContext`: 当前 host 的临时 headless browser session
- `resourceLocks`: 当前 thread GUI runtime read；临时 Playwright session write
- `owner`: Level 2 acceptance owner
- `verification`: 原 Level 2 场景通过，或前置缺失时明确标记未执行
- `failureDomain`: A1、Z1 的完整验收声明；不回滚已通过 FIX commit
- `replanTriggers`: 真实行为与 Level 1 冲突、需要可见桌面、URL/runtime 不可用或发现范围问题
- `authorizationGate`: `pending-supplemental-plan-confirmation`

#### Z1：补充后的终态审计

- `nodeId`: Z1
- `taskBoundary`: FINAL（无提交）
- `operationKind`: fan-in
- `outcome`: 三提交拓扑、Level 1/2 证据与最终工作树状态形成终态证据。
- `estimatedCost`: 低；`deferralEvidence`: 无
- `hardPredecessors`: C1、A1；等待 FIX commit 与 Level 2 结果/未执行记录
- `consumes`: 原 DOCS commit、DOCS-AMEND commit、FIX commit、Level 1/2 evidence、Git status
- `produces`: 最终结果摘要
- `completionEvidence`: 三 commit 身份/顺序/文件范围正确；index 空；无计划内未提交 diff；Level 1/2/3 分别报告
- `readSet`: Git log/show/status、验证结果
- `writeSet`: 无
- `stateEffects`: 最终审计结果
- `commandScope`: `git log -3 --oneline --decorate=short`、精确 `git show --stat`、`git status --short`
- `subdelegation`: false
- `executionContext`: 当前 checkout/dev，只读
- `resourceLocks`: Git metadata read
- `owner`: root coordinator
- `verification`: 最终状态满足设计与补充计划；无 remote/force/install/amend/squash
- `failureDomain`: Z1
- `replanTriggers`: commit 身份/范围错误、index 非空、计划内 diff 残留或验证证据失效
- `authorizationGate`: `pending-supplemental-plan-confirmation`

### 补充后的 ready set、提交拓扑与阶段边界

- P1 完成后，D3 及后继仍因补充计划未确认而等待；用户确认后初始 ready set 为 D3。
- `D3 → D4 → E3 → F2` 是补充计划提交、第四文件编辑与格式化的稳定产物链。D4 必须在 E3 前形成；不得 amend 原 DOCS commit。
- F2 后 `V1R`、`V2R`、`V3R` 同时 ready。三者没有硬依赖；V1R 与任何也写 `/Users/jiangsheng/cnb/codex/codex-gui/node_modules/.vite` 的验证只通过 canonical resource lock 互斥。V0 不重跑。
- 验证 fan-in 为 `V0(existing) + V1R + V2R + V3R → R1 → S1 → C1`；最终链为 `C1 → A1 → Z1`。
- 粗粒度关键路径预计为：补充计划 stage/commit → AppShell edit/format → V1R 三浏览器 → review/stage/FIX commit → Level 2 → final audit。
- 最终任务提交拓扑精确为原 DOCS commit `075dfc7c659b944f4977746bf8df4c4d7d32da50` → DOCS-AMEND commit `docs: amend skill typeahead complete results plan` → FIX commit `fix(gui): show all sorted skills`。禁止 squash、amend、remote、force。
- FIX commit 必须只包含 `skillQuery.ts`、`skillQuery.test.ts`、`ComposerEditor.browser.test.tsx`、`AppShell.browser.test.tsx` 四文件。
- Level 1 必须具有 V0 的 22/22 focused unit 稳定证据，以及 V1R 三 instances 两源文件全绿、V2R lint 全绿、V3R type-check 全绿证据。
- Level 2/Level 3 边界不变：Level 2 仍是无头真实 runtime 验收；Level 3 不适用，禁止可见窗口。
- 用户明确确认补充计划前，D3 及全部后继未授权；不得 stage/commit 补充计划、继续编辑 implementation、格式化、验证或启动 browser。确认后先完成 D3/D4，再从 E3 恢复实现。
