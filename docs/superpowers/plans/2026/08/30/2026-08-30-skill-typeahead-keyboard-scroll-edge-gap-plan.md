# Skill typeahead 键盘滚动首尾边界修复实施计划

日期：2026-08-30
状态：已确认，待执行

## 目标与设计来源

本计划只实施已确认设计：

- [Skill typeahead 键盘滚动首尾边界修复设计](../../../../specs/2026/08/30/2026-08-30-skill-typeahead-keyboard-scroll-edge-gap-design.md)

目标是让 `ready`、`refreshing`、`stale` 与 partial-error 中仍有候选项的 skill typeahead，通过真实键盘导航到首项和末项时严格到达候选滚动区域自己的 `0/max`。实现保留 HeroUI v3 listbox/item 视觉语义、完整 focus ring、Lexical active-index owner 与 `scrollIntoView({ block: "nearest" })`，不增加首尾 index 特判。

## 当前事实闭包

- production seam 仅位于 `codex-gui/src/features/composerEditor/SkillTypeaheadPlugin.tsx`。当前 `data-skill-menu-scroll-region` 同时包住 `SkillCatalogStatus`、无结果提示和 listbox，并同时拥有 max-height、`scroll-py-1` 与 `overflow-y-auto`。
- 当前 active option 的 layout effect 独立调用 `scrollIntoView({ block: "nearest" })`，不依赖 scroll-region ref；拆分容器不需要新增 ref、state 或跨模块 owner。
- `skillMenuSurfaceMaxHeightClassName(placement)` 已集中表达上下 placement 的高度上限，只需把该高度责任从内层 scroll region 移到 popover surface，函数本身无需修改。
- 当前 HeroUI Select 派生 listbox computed padding 为 6px；候选 scroll padding 为 4px。6px/4px 差值仍是待 focused Browser red loop 确认的高置信根因，不是已测量的最终根因。
- `codex-gui/src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx` 已提供真实 `combobox`/`listbox`/`option` seam、Arrow 键交互、catalog fixture、单一 scroll owner 和手工 `scrollTop` 几何覆盖；无需新增测试文件或测试专用 production interface。
- `catalog(...)` 已能构造 `ready`、`refreshing`、`stale`、`failed` 与 `partialErrorCount`。partial-error 使用 `catalog("ready", candidates, 1)`；`failed` 使用空 candidates。
- `vitest.browser.parallel.config.ts` 收集目标文件，并在 Chromium、Firefox、WebKit 三个 headless instance 中执行；`test:browser:smoke` 不收集目标文件。
- 本地 Vitest 文档确认 `userEvent.keyboard` 支持 `{ArrowUp}`、`{ArrowDown}`、`{Tab}` 和 `{Enter}`；异步 DOM 使用 `expect.element`，滚动几何使用 `expect.poll`。
- 测试 fixture 的 portal parent 位于 editor 之前；`failed` 状态从 editor 到 `Retry` 的普通 DOM 焦点路径是 `{Shift>}{Tab}{/Shift}`，不是向前 `{Tab}`。计划只验证该既有顺序，不为测试改变 production DOM 顺序。

## 预计修改范围

### Production

- `codex-gui/src/features/composerEditor/SkillTypeaheadPlugin.tsx`
  - popover surface 改为纵向布局，并接管现有 placement-aware max-height。
  - `SkillCatalogStatus` 提升为 surface 的直接子节点，位于候选 scroll region 之前，并以 `shrink-0` 保持完整高度；状态横幅不再属于候选滚动内容。
  - candidate scroll region 只包住无结果提示与 listbox，使用 `min-h-0`、`overflow-y-auto`，不再单独拥有 max-height。
  - 将候选 scroll padding 从 `scroll-py-1` 调整为与 listbox 对齐的 `scroll-py-1.5`（6px）。
  - 保留现有 `scrollIntoView({ block: "nearest" })`、Lexical option/active owner、HeroUI class variants、focus ring、pointer 与选择逻辑。

### Browser Mode 回归

- `codex-gui/src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx`
  - 新增公开 UI seam 上的一项参数化真实键盘 tracer test，覆盖 `ready`、`refreshing`、`stale` 与 partial-error；四个 case 共享同一个用户行为、滚动 owner 和几何不变量，不拆成批量 imagined tests。
  - 每个 case 使用足够多的候选项形成真实 overflow；从初始首项按 `{ArrowUp}` 循环到末项，断言末项 active 且 `scrollTop === scrollHeight - clientHeight`；再按 `{ArrowDown}` 循环回首项，断言首项 active 且 `scrollTop === 0`。
  - 对有横幅的三个 case 断言横幅位于 candidate scroll region 外，并在两次导航后保持可见。
  - 记录并断言 candidate scroll region 的 computed `scrollPaddingTop/Bottom` 与 listbox 的 `paddingTop/Bottom` 均为 6px；严格边界不得使用 `<= 1px` 容差。
  - 在首项与末项分别记录 active option/scroll region 的 `getBoundingClientRect()`；断言 option border box 与对应 scrollport 边缘保持 6px clearance，并继续匹配既有 `status-focused` box-shadow，从数值上证明完整 ring 未被 overflow 裁切。
  - 在 focused green 成立后，再在现有 catalog 语义测试中增加 `failed` 保留性断言：无 option，从 editor 通过 `{Shift>}{Tab}{/Shift}` 聚焦 `Retry`，再以 `{Enter}` 触发 retry。该断言不进入 scroll red loop，也不改变 DOM 顺序。
  - 保留既有单一 scroll owner、手工可达 `0/max`、editor focus、ARIA、focus ring 和 pointer-hover 回归，不用新测试替换旧覆盖。

## HeroUI v3 组件与语义 token

- popover surface 继续使用 `selectVariants().popover()`；不替换为 HeroUI v2 API，也不新增 `HeroUIProvider`。
- listbox 继续使用 `listboxVariants({ variant: "default" })`，option 继续使用 `listboxItemVariants({ variant: "default" })`；原生 `ul/li` 保留 Lexical/ARIA owner，只借用 HeroUI v3 style variants。
- `Retry` 继续使用现有 HeroUI `Button`，`size="sm"`、`variant="secondary"`；不创建自定义交互控件。
- 保留现有语义层级：popover 的 overlay surface、状态区的 `border-separator`、辅助文字的 `text-muted`、active option 的 `bg-default` 与 `status-focused`、scroll owner 的 `scrollbar-thin`。
- 新增或调整的 `flex`、`flex-col`、`shrink-0`、`min-h-0`、overflow 与 scroll-padding utilities 只表达布局和滚动几何，不取代 HeroUI 组件、variant 或语义颜色 token。

## 明确不修改

- 不修改 `SkillCatalogStatus` 的状态判定、catalog owner、Lexical package、HeroUI package 或 React Aria。
- 不新增 scroll-region ref、active-index 分支、`scrollTop = 0/max` 写入、二次滚动 effect 或浏览器特判。
- 不删除 listbox padding、focus ring、ring offset、popover overflow 裁切或 overscroll 行为。
- 不修改 `codex-gui/package.json`、Vitest 配置、依赖、lockfile、全局 CSS、Lingui catalog、协议或 Rust。
- 不创建 worktree，不安装程序、依赖、运行时或浏览器 binary，不运行 repository-level `just fmt`，不操作 Git remote。
- 不暂存或提交被 `.gitignore` 命中的 research 文档。
- 不混入 import、声明、函数、组件或分支的纯顺序调整；如 formatter 产生 order-only 改动，停止并重新计划，不能混入行为提交。

## TDD 顺序与测试 seam

已确认的测试 seam 是用户可观察的 Composer Browser UI：真实 editor focus、Arrow 键、ARIA active option、candidate scroll region 的实际滚动坐标，以及状态横幅与该 region 的 DOM/可见关系。测试不调用 private helper，不 mock Lexical 滚动，不直接设置 `scrollTop` 模拟键盘结果。

执行顺序：

1. 先只写一项参数化键盘边界 tracer test。四个 catalog case 消费同一个公开 seam 和几何不变量；`failed` Retry 不混入该 red slice。
2. 用精确 test name 运行目标文件，证明目标被实际收集，且严格边界测试因当前 6px/4px 几何或横幅位于 scroll region 内而失败；配置、类型、fixture 或浏览器启动失败不算 red。
3. 失败输出必须记录实际 `scrollTop/max`、scroll padding、listbox padding 与横幅归属。若结果推翻 6px/4px 根因或显示新的 scroll owner，停止 production 编辑并回到设计事实闭包。
4. 只修改 production DOM/class 几何，立即用同一精确命令取得 focused green；不在测试或代码中增加容差、fallback 或首尾特判。
5. focused green 后再增加 `failed` Retry 普通焦点保留性断言，并单独证明该既有语义通过；若它失败，停止并回到范围判断，不把无关焦点问题塞进滚动实现。
6. 完成格式化、整个目标 Browser 文件、静态检查与真实 headless GUI 验收。

## 工具链与精确命令

所有 pnpm 命令从 `/Users/jiangsheng/cnb/codex/codex-gui` 执行，先核验 fnm-backed pnpm，且不得解析到 `/Users/<user>/.cache/codex-runtimes/`：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm --version
```

focused red/green 使用 Vitest direct target，避免再次误收集整套 Browser suite。计划中的精确测试名为 `keeps keyboard navigation at the candidate scroll boundaries across catalog states`：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run --config=vitest.browser.parallel.config.ts src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx -t 'keeps keyboard navigation at the candidate scroll boundaries across catalog states'
```

`failed` Retry 保留性验证使用现有 catalog test 的精确名称：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run --config=vitest.browser.parallel.config.ts src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx -t 'preserves catalog loading, refresh, partial error, total error, retry, empty, and disabled semantics'
```

目标文件 closure：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run --config=vitest.browser.parallel.config.ts src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx
```

权威 formatter 与静态检查：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt:fix
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
/opt/homebrew/bin/fnm exec --using-file pnpm run lint
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

`format:oxfmt:fix` 是 repository-owned 入口，命令本身显式作用于整个 `codex-gui`，不能伪装成两文件 write scope。计划确认将授权该入口的一次 project-wide formatter 写入，但只允许两份 FIX 文件成为最终保留、审查、暂存和提交对象。DOCS 提交完成后的 V0 必须先运行非 fix `format:oxfmt`，证明现有 frontend baseline 无格式漂移；F1 前再次确认没有计划外 dirty frontend 文件。若 F1 仍产生范围外改动，停止，不得擅自恢复、继续操作或并入提交。

不使用 `pnpm run test:browser -- <path>`、`test:browser:smoke`、`pnpm run ci` 或 unit config 代替 focused target；执行结果必须显示只收集目标 Browser 文件，并分别报告 Chromium、Firefox、WebKit。

## GUI 验收级别

- Level 1：必需。focused test red/green 与整个 `ComposerEditor.browser.test.tsx` 都使用 headless Vitest Browser Mode，三浏览器必须实际收集目标并通过。
- Level 2：必需。实现稳定后取得当次完整 GUI URL，以无头 `playwright-cli` 打开真实 Codex runtime；先用 `list --json` 证明 session 非 headed，再在真实 `ready` 候选列表中制造 overflow，验证 editor focus、末项 `max`、首项 `0`、完整 focus ring 和菜单关闭。URL、route、thread id 与 token 必须来自当次 `/gui` 或 `launch_gui`，不得猜测、拼接或复用旧 URL。若缺少可用 runtime、完整 URL 或足够候选项，只把 Level 2 标记为未执行并阻塞“完全验证”声明；fixture 不能替代真实状态。
- Level 3：不适用。本结果不依赖 OS 窗口、跨应用焦点、DevTools 或系统 IME；禁止因此启动可见浏览器。

Level 2 的命令形状如下，执行时把占位符替换为当次完整 URL，并原样保留其所有组成部分：

```bash
playwright-cli open '<complete current GUI URL>'
playwright-cli list --json
```

## Task boundary 与本地提交拓扑

### DOCS — 工作文档提交

实现前创建一个只包含本次已确认设计与待执行计划的本地提交：

- `docs/superpowers/specs/2026/08/30/2026-08-30-skill-typeahead-keyboard-scroll-edge-gap-design.md`
- `docs/superpowers/plans/2026/08/30/2026-08-30-skill-typeahead-keyboard-scroll-edge-gap-plan.md`

建议提交信息：

```text
docs: design skill typeahead scroll boundaries
```

### FIX — 行为修复与直接回归

production 与 Browser regression 形成一个行为提交：

- `codex-gui/src/features/composerEditor/SkillTypeaheadPlugin.tsx`
- `codex-gui/src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx`

建议提交信息：

```text
fix(gui): align skill typeahead keyboard scrolling
```

FIX 不包含 DOCS、research、order-only 调整、配置、依赖或范围外文件。提交前必须完成计划内 fan-in、diff 审查和适用 Level 1/Level 2 验收。已有提交后的修正使用新的独立提交，禁止 amend。

## 待确认执行能力信封

以下节点当前全部为 `pending`，本计划的落盘不产生执行授权。只有用户明确确认本计划后，确认才作为各节点与其精确目标相交的 `grantSource`；实现仍须先完成 DOCS 本地提交门禁。

共享边界：

- `objective`：按已确认设计修复 skill typeahead 键盘首尾滚动边界。
- `phase`：`plan-execution`。
- `parameterBounds`：当前 `/Users/jiangsheng/cnb/codex` checkout 与 `dev` branch；frontend 命令 cwd 固定为 `/Users/jiangsheng/cnb/codex/codex-gui`；不创建 worktree。
- `negativeConstraints`：禁止 remote、force、amend、squash、安装、依赖更新、baseline 更新、测试弱化、容差扩大、范围外修复、ignored research 暂存/提交、修改 `~/.codex/AGENTS.md` 和可见浏览器。除 F1 明确披露的一次 project-wide formatter 写入外，禁止计划外文件主动写入；F1 产生的范围外 diff 也不得主动恢复、继续操作、暂存或提交。
- `specialApprovals`：`[]`。
- `requiredApprovalIds`：`[]`。
- `subdelegation`：`false`；主协调代理按执行图把单一节点交给唯一 owner。
- `lifecycle`：计划确认前 pending；确认后仅在节点进入 ready 并分配 owner 时 active；节点完成、失败、撤销、前提失效或触发重新计划时立即到期。
- `replanTriggers`：根因被 red loop 推翻、修改范围扩大、需要新接口/状态/owner、命令入口或收集范围漂移、baseline format check 失败、formatter 产生范围外 diff、Level 2 暴露不同 owner、授权或安全边界变化。

## 描述式执行 DAG

### P0 — 执行环境与范围预检

- `nodeId`: `P0`; `taskBoundary`: 无提交；`operationKind`: 调查；`outcome`: 当前 checkout、规则、dirty scope、目标文件、fnm/pnpm、Vitest config、浏览器 binary 与命令收集前提可信。
- `estimatedCost`: S；`deferralEvidence`: 无；`hardPredecessors`: 无；初始 ready set 仅含 `P0`。
- `consumes`: 已确认设计、待执行计划、当前 Git/工具状态；`produces`: 可执行 preflight evidence；`completionEvidence`: 精确 root/branch/文件/工具来源/target discovery 均核验，未发现计划外 dirty frontend scope。
- `readSet`: 根与 `codex-gui` 规则、两份 DOCS、两份 FIX 文件、package/Vitest config、Git worktree/index；`writeSet`: `[]`；`stateEffects`: 只读证据。
- `commandScope`: `pwd`、`git rev-parse --show-toplevel`、`git branch --show-current`、`git status --short`、`git diff`、`git check-ignore`、`test`、`command -v`、fnm-backed `pnpm --version`；`executionContext`: 当前 checkout/index；`resourceLocks`: worktree/index read；`owner`: 预检代理。
- `verification`: 命令真实命中当前 checkout 和目标文件；`failureDomain`: 阻塞全部后继；`authorizationGate`: 计划确认后激活只读 preflight。

### D0 — 记录计划确认状态

- `nodeId`: `D0`; `taskBoundary`: `DOCS`; `operationKind`: 编辑；`outcome`: 本计划状态从“待确认，未执行”机械更新为“已确认，待执行”。
- `estimatedCost`: S；`deferralEvidence`: 无；`hardPredecessors`: `P0`，等待可信 scope evidence。
- `consumes`: 用户对本计划的明确确认与当前 plan；`produces`: 单行 metadata diff；`completionEvidence`: 只修改 plan 状态行，设计与计划正文不变。
- `readSet`: 本计划与确认消息；`writeSet`: `docs/superpowers/plans/2026/08/30/2026-08-30-skill-typeahead-keyboard-scroll-edge-gap-plan.md`；`stateEffects`: 单文件工作树 metadata 更新。
- `commandScope`: `apply_patch` 与只读 diff；`executionContext`: 当前 checkout，不写 index；`resourceLocks`: plan file write；`owner`: DOCS metadata owner。
- `verification`: 不把确认扩张为正文重写；`failureDomain`: 阻塞 D1 及全部实现节点；`replanTriggers`: 确认文本不明确或计划正文在确认后漂移；`authorizationGate`: 只有用户明确确认本计划后激活。

### D1 — 精确暂存工作文档

- `nodeId`: `D1`; `taskBoundary`: `DOCS`; `operationKind`: stage；`outcome`: index 只包含两份 DOCS。
- `estimatedCost`: S；`deferralEvidence`: 无；`hardPredecessors`: `D0`，等待已确认状态 metadata。
- `consumes`: 两份 DOCS 与干净 index；`produces`: DOCS staged snapshot；`completionEvidence`: `git diff --cached --check`、`--name-status` 与内容审查只显示两份 DOCS。
- `readSet`: 两份 DOCS、`.gitignore`、Git index；`writeSet`: Git index 中两份 DOCS entries；`stateEffects`: 精确 index 更新。
- `commandScope`: `git add -- docs/superpowers/specs/2026/08/30/2026-08-30-skill-typeahead-keyboard-scroll-edge-gap-design.md docs/superpowers/plans/2026/08/30/2026-08-30-skill-typeahead-keyboard-scroll-edge-gap-plan.md` 与 cached diff 只读检查；`executionContext`: 当前 checkout/index；`resourceLocks`: `/Users/jiangsheng/cnb/codex/.git/index` write；`owner`: DOCS Git owner。
- `verification`: 禁止 `git add .`，禁止 ignored research；`failureDomain`: 阻塞 `D2` 及全部实现节点；`authorizationGate`: 计划确认后激活精确 DOCS stage。

### D2 — 提交工作文档

- `nodeId`: `D2`; `taskBoundary`: `DOCS`; `operationKind`: commit；`outcome`: 创建一个精确 DOCS 本地提交。
- `estimatedCost`: S；`deferralEvidence`: 无；`hardPredecessors`: `D1`，等待已审查 staged snapshot。
- `consumes`: DOCS staged snapshot；`produces`: `docs: design skill typeahead scroll boundaries` commit；`completionEvidence`: commit id、parent 与文件列表精确匹配。
- `readSet`: Git index、两份 DOCS；`writeSet`: Git object database、当前 `dev` ref、index；`stateEffects`: 一个本地 commit。
- `commandScope`: `git commit -m 'docs: design skill typeahead scroll boundaries'` 与 `git show --stat --oneline --decorate=short HEAD`；`executionContext`: 当前 checkout/index；`resourceLocks`: object database/current branch/index write；`owner`: DOCS Git owner。
- `verification`: 无 amend、无 remote；`failureDomain`: 阻塞全部实现节点；`authorizationGate`: 计划确认后激活一次 DOCS commit。

### V0 — Formatter baseline 检查

- `nodeId`: `V0`; `taskBoundary`: 无提交；`operationKind`: 验证；`outcome`: production/test 编辑前的整个 `codex-gui` 已通过 live oxfmt check。
- `estimatedCost`: S；`deferralEvidence`: 无；`hardPredecessors`: `D2`，等待工作文档独立提交门禁完成。
- `consumes`: 当前 frontend baseline 与 live formatter config；`produces`: clean formatter baseline evidence；`completionEvidence`: `/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt` 命中 live project 并退出 0。
- `readSet`: `codex-gui/**` formatter inputs；`writeSet`: `[]`；`stateEffects`: formatter check 进程与输出。
- `commandScope`: `/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt`；`executionContext`: `codex-gui` cwd；`resourceLocks`: `codex-gui/**` read；`owner`: baseline formatter 验证代理。
- `verification`: 任何 baseline drift 都在 formatter fix 前阻塞，不用 F1 清理历史问题；`failureDomain`: 阻塞 T1 及全部后继；`replanTriggers`: baseline 非 clean、入口或 config 漂移；`authorizationGate`: D2 完成后激活只读 format check。

### T1 — 写入单一 Browser tracer red loop

- `nodeId`: `T1`; `taskBoundary`: `FIX`; `operationKind`: 编辑；`outcome`: 一项参数化 Browser tracer test 表达四种有候选状态共享的严格键盘 `0/max`、banner ownership 与边缘 ring geometry 契约。
- `estimatedCost`: M；`deferralEvidence`: 无；`hardPredecessors`: `V0`，等待工作文档提交门禁与 clean formatter baseline。
- `consumes`: 已确认设计、现有 Browser seam/catalog fixture；`produces`: 单文件 test working diff；`completionEvidence`: diff 只增加同一行为 seam 的参数化 tracer，使用真实 userEvent/ARIA/scrollTop/rect/box-shadow，无直接 scrollTop 模拟或容差。
- `readSet`: 两份 DOCS、Composer Browser test、Composer/skill catalog 直接类型；`writeSet`: `codex-gui/src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx`；`stateEffects`: 单文件工作树修改。
- `commandScope`: `apply_patch` 与只读 `rg/sed/git diff`；`executionContext`: 当前 checkout，不写 index；`resourceLocks`: 目标测试文件 write；`owner`: FIX 编辑代理。
- `verification`: 测试名与计划精确一致，`failed` Retry 不混入本 slice；`failureDomain`: 阻塞 `VR` 及其后继；`replanTriggers`: test 需要 private seam 或计划外 fixture；`authorizationGate`: 计划确认且 D2 完成后激活精确测试编辑。

### VR — 证明预期 red 并确认根因

- `nodeId`: `VR`; `taskBoundary`: `FIX`; `operationKind`: 验证；`outcome`: focused target 被三浏览器收集，并因预期边界/结构差异失败，产生实际几何证据。
- `estimatedCost`: M；`deferralEvidence`: 无；`hardPredecessors`: `T1`，等待稳定 test diff。
- `consumes`: red test、parallel Browser config、Playwright provider；`produces`: expected-red geometry evidence；`completionEvidence`: 目标 test name 被实际收集，失败来自 `scrollTop/max`、6px/4px、banner ownership 或对应 edge clearance，不是 config/type/fixture/browser 启动错误。
- `readSet`: Browser test、production component、Vitest/Vite/TS config；`writeSet`: `[]`；`stateEffects`: headless browser/test 进程与 runner cache。
- `commandScope`: 本计划 focused red/green 命令；`executionContext`: `codex-gui` cwd；`resourceLocks`: Vitest Browser runner、Playwright processes、`node_modules/.vite/vitest/**` write、browser tsbuildinfo write；`owner`: Browser 验证代理。
- `verification`: 记录每个目标 case 的实际 scrollTop/max、scroll/list padding、active/scroll rect、edge clearance、box-shadow 与 banner ownership；`failureDomain`: 预期 red 解锁 `E1`，非预期失败暂停 `E1` 并回到事实闭包；`replanTriggers`: 失败不来自设计根因、target 未收集或 browser/provider 异常；`authorizationGate`: 计划确认后激活一次 focused red。

### E1 — 修正滚动容器结构与几何

- `nodeId`: `E1`; `taskBoundary`: `FIX`; `operationKind`: 编辑；`outcome`: production DOM 形成固定状态区与唯一候选滚动区，scroll/list padding 对齐为 6px。
- `estimatedCost`: M；`deferralEvidence`: 无；`hardPredecessors`: `VR` 的 expected-red evidence。
- `consumes`: red geometry evidence、已确认设计、现有 component；`produces`: 单文件 production working diff；`completionEvidence`: 仅重组 surface/status/scroll-region DOM 与 class responsibility，`scrollIntoView(nearest)` 和 owners 不变。
- `readSet`: 两份 DOCS、production component、red evidence；`writeSet`: `codex-gui/src/features/composerEditor/SkillTypeaheadPlugin.tsx`；`stateEffects`: 单文件工作树修改。
- `commandScope`: `apply_patch` 与只读 `rg/sed/git diff`；`executionContext`: 当前 checkout，不写 index；`resourceLocks`: production component write；`owner`: FIX 编辑代理。
- `verification`: surface 拥有 max-height/纵向布局，status 为非滚动 `shrink-0`，candidate region 为 `min-h-0 scroll-py-1.5 overflow-y-auto`；无 index 特判、ref、第二 effect 或计划外 owner；`failureDomain`: 阻塞 focused green 与后继；`replanTriggers`: 最小实现需要计划外文件/owner 或改变 Lexical/HeroUI 语义；`authorizationGate`: expected red 后激活精确 production 编辑。

### VG — 证明同一 tracer focused green

- `nodeId`: `VG`; `taskBoundary`: `FIX`; `operationKind`: 验证；`outcome`: 与 VR 完全相同的参数化 tracer 在 Chromium、Firefox、WebKit 中通过。
- `estimatedCost`: M；`deferralEvidence`: 无；`hardPredecessors`: `E1`，等待最小 production diff。
- `consumes`: T1 tracer、E1 production diff 与 parallel Browser config；`produces`: focused green behavior evidence；`completionEvidence`: 精确 test name 在三实例被实际收集且全绿，严格 0/max、6px edge clearance、box-shadow 与 banner ownership 全部成立。
- `readSet`: 两份 FIX 文件、Browser configs；`writeSet`: `[]`；`stateEffects`: headless browser/test 进程与 runner cache。
- `commandScope`: 本计划 focused red/green 命令；`executionContext`: `codex-gui` cwd；`resourceLocks`: Vitest Browser runner、Playwright processes、`node_modules/.vite/vitest/**` write、browser tsbuildinfo write；`owner`: Browser 验证代理。
- `verification`: 不修改 test/production 取得 green；`failureDomain`: 阻塞 T2/F1 及后继；`replanTriggers`: green 需要容差、fallback、index 特判或跨浏览器分支；`authorizationGate`: E1 完成后激活一次 focused green。

### T2 — 增加 `failed` Retry 普通焦点保留性断言

- `nodeId`: `T2`; `taskBoundary`: `FIX`; `operationKind`: 编辑；`outcome`: 现有 catalog 语义 test 证明 `failed` 无 option，且从 editor 以 `{Shift>}{Tab}{/Shift}` 聚焦 `Retry`、`{Enter}` 触发 retry。
- `estimatedCost`: S；`deferralEvidence`: 无；`hardPredecessors`: `VG`，等待 scroll tracer 完成 red→green。
- `consumes`: 已确认 failed/Retry 边界、现有 catalog test 与 DOM 顺序证据；`produces`: 同一测试文件的保留性断言 diff；`completionEvidence`: 只增强现有 catalog test，不改测试名、不增加 production seam。
- `readSet`: design、plan、目标 Browser test 与 fixture DOM；`writeSet`: `codex-gui/src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx`；`stateEffects`: 单文件工作树修改。
- `commandScope`: `apply_patch` 与只读 diff；`executionContext`: 当前 checkout，不写 index；`resourceLocks`: 目标测试文件 write；`owner`: FIX test 编辑代理。
- `verification`: 使用普通 DOM 反向焦点顺序，不把 Retry 纳入 option；`failureDomain`: 阻塞 VP/F1 及后继；`replanTriggers`: 普通焦点基线失败或需要 production 行为变化；`authorizationGate`: focused green 后激活保留性测试编辑。

### VP — 证明 `failed` Retry 保留性语义

- `nodeId`: `VP`; `taskBoundary`: `FIX`; `operationKind`: 验证；`outcome`: 现有 catalog 语义 test 在三 Browser instance 中通过新增普通焦点断言。
- `estimatedCost`: M；`deferralEvidence`: 无；`hardPredecessors`: `T2`，等待稳定 preservation diff。
- `consumes`: 增强后的 catalog test、现有 production 与 Browser config；`produces`: failed/Retry preservation evidence；`completionEvidence`: 精确 catalog test name 被三实例收集且全绿。
- `readSet`: 目标 Browser test、production component、Browser configs；`writeSet`: `[]`；`stateEffects`: headless browser/test 进程与 runner cache。
- `commandScope`: 本计划 `failed` Retry 保留性验证命令；`executionContext`: `codex-gui` cwd；`resourceLocks`: Vitest Browser runner、Playwright processes、`node_modules/.vite/vitest/**` write、browser tsbuildinfo write；`owner`: Browser 验证代理。
- `verification`: 失败时不修改 production 迁就测试，先回到范围判断；`failureDomain`: 阻塞 F1 及后继；`replanTriggers`: 现有普通焦点语义并不成立或 target 未收集；`authorizationGate`: T2 完成后激活一次 preservation test。

### F1 — 权威 frontend 格式化

- `nodeId`: `F1`; `taskBoundary`: `FIX`; `operationKind`: 格式化；`outcome`: 两份 FIX 文件符合 live oxfmt，且没有计划外 retained diff。
- `estimatedCost`: S；`deferralEvidence`: 无；`hardPredecessors`: `VP`，等待 scroll red→green 与 Retry preservation evidence。
- `consumes`: 两份 FIX 文件与 live formatter config；`produces`: formatted FIX diff；`completionEvidence`: formatter 退出 0，Git diff 只保留两份 FIX 文件且无 order-only 调整。
- `readSet`: `codex-gui/**` formatter inputs；`writeSet`: `codex-gui/**`（权威命令显式作用于 `.`）；`stateEffects`: project-wide formatter 写入，不写 index。
- `commandScope`: `/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt:fix` 与只读 allowlist diff；`executionContext`: `codex-gui` cwd；`resourceLocks`: `codex-gui/**` write；`owner`: FIX formatter owner。
- `verification`: 范围外 diff 或顺序调整触发重新计划，不擅自恢复；`failureDomain`: 阻塞所有 post-format validation；`replanTriggers`: baseline 之后出现计划外 dirty frontend scope、formatter 产生范围外 diff 或 formatter/config 漂移；`authorizationGate`: 计划确认后明确激活一次作用于整个 `codex-gui` 的 live formatter 写入。

### V1 / V2 / V3 / V4 — Post-format 验证 fan-out

四个节点均以 `F1` 为唯一硬前置；编号不构成相互依赖。资源锁允许时立即并行启动有价值的 ready 节点：

- `V1`: `taskBoundary=FIX`; `operationKind=验证`; `outcome=整个目标 Browser 文件在 Chromium/Firefox/WebKit 通过`; `estimatedCost=M`; `consumes=formatted FIX diff`; `produces=Level 1 behavior evidence`; `completionEvidence=只收集目标文件、三实例非零测试且全绿`; `readSet=target Browser test、production 与 Browser configs`; `writeSet=[]`; `stateEffects=headless runner/cache`; `commandScope=目标文件 closure 命令`; `executionContext=codex-gui cwd`; `resourceLocks=Vitest Browser runner/Playwright/node_modules/.vite/vitest/browser tsbuildinfo write`; `owner=Browser 验证代理`; `verification=严格 0/max、6px edge clearance、status-focused box-shadow、banner ownership、Retry focus 与既有回归`; `failureDomain=阻塞 A1/R1/S1/C1`; `replanTriggers=跨浏览器差异或新 owner`; `authorizationGate=计划确认后激活`。
- `V2`: `taskBoundary=FIX`; `operationKind=验证`; `outcome=live oxfmt check 通过`; `estimatedCost=S`; `consumes=formatted diff`; `produces=format evidence`; `completionEvidence=退出 0`; `readSet=codex-gui formatter inputs`; `writeSet=[]`; `stateEffects=验证输出`; `commandScope=fnm-backed pnpm run format:oxfmt`; `executionContext=codex-gui cwd`; `resourceLocks=codex-gui/** read`; `owner=format 验证代理`; `verification=命中 live project`; `failureDomain=阻塞 R1/S1/C1`; `replanTriggers=formatter/config 漂移`; `authorizationGate=计划确认后激活`。
- `V3`: `taskBoundary=FIX`; `operationKind=验证`; `outcome=live lint 通过`; `estimatedCost=M`; `consumes=formatted diff`; `produces=oxlint+eslint evidence`; `completionEvidence=两段 lint 均退出 0`; `readSet=codex-gui lint inputs`; `writeSet=[]`; `stateEffects=eslint cache 与验证输出`; `commandScope=fnm-backed pnpm run lint`; `executionContext=codex-gui cwd`; `resourceLocks=codex-gui source read、eslint cache write`; `owner=lint 验证代理`; `verification=无 fix 模式`; `failureDomain=阻塞 R1/S1/C1`; `replanTriggers=计划外 failure 改变范围`; `authorizationGate=计划确认后激活`。
- `V4`: `taskBoundary=FIX`; `operationKind=验证`; `outcome=live TypeScript build check 通过`; `estimatedCost=M`; `consumes=formatted diff`; `produces=type evidence`; `completionEvidence=退出 0且 browser TS included`; `readSet=codex-gui TS/project configs`; `writeSet=[]`; `stateEffects=tsbuildinfo/cache 与验证输出`; `commandScope=fnm-backed pnpm run type-check`; `executionContext=codex-gui cwd`; `resourceLocks=browser tsbuildinfo write`; `owner=type 验证代理`; `verification=不得以 Browser runner typecheck 替代`; `failureDomain=阻塞 R1/S1/C1`; `replanTriggers=权威 contract 或计划外类型问题`; `authorizationGate=计划确认后激活`。

`V1` 与 `V4` 共享 browser tsbuildinfo write lock，不得并发；这是资源冲突，不是硬依赖。`V2`、`V3` 可与其中任一节点并行。不存在有效 `deferralEvidence`，不得等待无关 wave。

### A1 — Level 2 headless 真实 GUI 验收

- `nodeId`: `A1`; `taskBoundary`: `FIX`; `operationKind`: 验证；`outcome`: 真实 `ready` skill 列表的键盘首尾滚动、focus ring 与关闭行为通过。
- `estimatedCost`: M；`deferralEvidence`: 无；`hardPredecessors`: `V1`，等待稳定 Level 1 behavior evidence。
- `consumes`: 当次完整 GUI URL、真实 runtime 与 V1 source state；`produces`: Level 2 acceptance evidence；`completionEvidence`: 非 headed session 证据、目标 route/state、真实 overflow、末项 max、首项 0、editor focus/focus ring/关闭观察均记录。
- `readSet`: 当次 GUI runtime/DOM；`writeSet`: `[]`；`stateEffects`: headless browser session 与页面交互状态。
- `commandScope`: `playwright-cli open '<complete current GUI URL>'`、`playwright-cli list --json` 及该 session 内的只读 DOM/keyboard interaction；`executionContext`: 当前真实 GUI runtime；`resourceLocks`: headless browser session write；`owner`: Level 2 验收代理。
- `verification`: fixture 不替代真实状态；缺少 URL/runtime/overflow 时标记未执行并阻塞完全验证，不切换 headed；`failureDomain`: 阻塞 R1/S1/C1；`replanTriggers`: 真实 runtime owner 与设计不同；`authorizationGate`: 计划确认后激活 headless acceptance。

### R1 — FIX fan-in 与完整 diff 审查

- `nodeId`: `R1`; `taskBoundary`: `FIX`; `operationKind`: fan-in；`outcome`: 两文件组合 diff 与全部验证证据满足设计且可暂存。
- `estimatedCost`: S；`deferralEvidence`: 无；`hardPredecessors`: `V1`、`V2`、`V3`、`V4`、`A1`，等待全部稳定验证产物。
- `consumes`: formatted diff、Level 1/Level 2/static evidence；`produces`: approved FIX snapshot evidence；`completionEvidence`: diff 仅两文件、无特判/容差/顺序调整、`git diff --check` 通过。
- `readSet`: 两份 FIX 文件、Git diff、验证结果；`writeSet`: `[]`；`stateEffects`: 审查结果。
- `commandScope`: `git diff --check -- codex-gui/src/features/composerEditor/SkillTypeaheadPlugin.tsx codex-gui/src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx`、`git diff -- codex-gui/src/features/composerEditor/SkillTypeaheadPlugin.tsx codex-gui/src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx`、`git status --short`；`executionContext`: 当前 checkout；`resourceLocks`: worktree read；`owner`: 主协调代理。
- `verification`: 设计目标、测试 seam、HeroUI/Lexical owner 与范围逐项核对；`failureDomain`: 阻塞 S1/C1；`authorizationGate`: 计划确认后激活 fan-in review。

### S1 — 精确暂存 FIX

- `nodeId`: `S1`; `taskBoundary`: `FIX`; `operationKind`: stage；`outcome`: index 只包含两份 FIX 文件。
- `estimatedCost`: S；`deferralEvidence`: 无；`hardPredecessors`: `R1`，等待 approved snapshot。
- `consumes`: approved FIX working diff 与空 index；`produces`: FIX staged snapshot；`completionEvidence`: cached check/name-status/content 只显示两份 FIX。
- `readSet`: 两份 FIX、Git index；`writeSet`: index 中两份 FIX entries；`stateEffects`: 精确 index 更新。
- `commandScope`: `git add -- codex-gui/src/features/composerEditor/SkillTypeaheadPlugin.tsx codex-gui/src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx` 与 cached diff 检查；`executionContext`: 当前 checkout/index；`resourceLocks`: Git index write；`owner`: FIX Git owner。
- `verification`: 无 DOCS/research/范围外文件；`failureDomain`: 阻塞 C1；`authorizationGate`: 计划确认后激活精确 FIX stage。

### C1 — 提交 FIX

- `nodeId`: `C1`; `taskBoundary`: `FIX`; `operationKind`: commit；`outcome`: 创建一个精确行为修复本地提交。
- `estimatedCost`: S；`deferralEvidence`: 无；`hardPredecessors`: `S1`，等待已审查 staged snapshot。
- `consumes`: FIX staged snapshot；`produces`: `fix(gui): align skill typeahead keyboard scrolling` commit；`completionEvidence`: commit id、parent、文件列表与 message 精确匹配，worktree/index 状态已核对。
- `readSet`: Git index、两份 FIX；`writeSet`: Git object database、当前 `dev` ref、index；`stateEffects`: 一个本地 FIX commit。
- `commandScope`: `git commit -m 'fix(gui): align skill typeahead keyboard scrolling'` 与只读 commit/status 检查；`executionContext`: 当前 checkout/index；`resourceLocks`: object database/current branch/index write；`owner`: FIX Git owner。
- `verification`: 无 amend、squash、remote；`failureDomain`: 仅阻塞终态成功报告；`authorizationGate`: 计划确认后激活一次 FIX commit。

## 并行与失败域审计

- 关键路径预计为 `P0 → D0 → D1 → D2 → V0 → T1 → VR → E1 → VG → T2 → VP → F1 → V1 → A1 → R1 → S1 → C1`。
- `V2`、`V3`、`V4` 不等待 `V1`；F1 完成后即进入 ready set。`V1` 与 `V4` 只因共享 tsbuildinfo write lock 串行获取资源，不增加伪依赖。
- DOCS 与 FIX 不能并行：实现节点必须消费已提交工作文档，这是明确阶段门禁，不是编号依赖。
- T1、VR、E1、VG 必须串行：production 实现只能消费预期 red 的稳定几何证据，随后必须由同一 tracer 命令形成 focused green。T2/VP 是完成该 slice 后的独立保留性检查，不混入 red 根因。
- 同一 checkout 与同一 Git index 只有一个 stage/commit owner；没有独立 worktree，因此不并行修改两个 task boundary。
- 任一节点失败只暂停该节点及其传递后继。计划内且不改变目标、文件、行为、接口、安全或授权边界的问题通过新修正节点闭环；已有 commit 后的修正形成独立提交，禁止 amend。
- 若 red loop 推翻根因、需要计划外文件/owner、formatter 扩大 diff、Level 2 暴露不同滚动 owner，暂停受影响后继并重新确认计划；不得以 fallback、容差、特判或缩小验证伪装成功。

## 最终验收与终态报告

- 四种有候选 catalog 状态在三 Browser instance 中通过真实 Arrow 键严格到达 candidate scroll region 的 `0/max`。
- 状态横幅位于 candidate scroll region 外且始终可见；`failed` 没有 option，`Retry` 使用普通焦点导航。
- scroll/list padding computed 值均为 6px；HeroUI focus ring 完整，Lexical/ARIA/pointer 语义不回退。
- 只存在一个候选纵向 scroll owner；production 不包含 index 特判、第二滚动 effect、browser branch 或容差补丁。
- formatter、lint、type-check、Level 1 与 Level 2 均按各自证据边界报告；Level 3 明确不适用。
- DOCS 与 FIX 各自形成一个独立本地 commit；无 ignored research、order-only 调整、amend、squash 或 remote。
- 终态必须报告：`实际并行`、`关键路径`、`未启动 ready 节点`。计划确认前这些都是预计拓扑，不得冒充执行事实。

## 阶段边界

本文仅为 implementation plan。用户明确确认本计划前，不执行任何节点，不修改 production/test，不运行 pnpm/浏览器验证，不 stage 或 commit。
