# Codex GUI Skill Typeahead HeroUI 样式优化实施计划

日期：2026-08-29

状态：已确认并执行；用户选择 B 的验收边界修订已确认生效

## 目标与设计来源

本计划只实现已确认设计：

- `docs/superpowers/specs/2026/08/29/2026-08-29-codex-gui-skill-typeahead-heroui-style-design.md`

目标是在不改变 Lexical focus/selection owner、skill catalog、查询匹配、排序和 canonical `name + path` 提交身份的前提下：

- 让原生 `ul/li` 复用 HeroUI v3 listbox 基础样式；
- 让友好名称、canonical name、description 和碰撞 path 渐进披露；
- 仅在相同 canonical name 对应多个不同 canonical path 时显示 scope 与最短唯一父路径；
- 删除底部 path 详情区、`Separator`、隐藏 path description 和 hover preview；
- 保持 active/hover、键盘、pointer/touch、滚动、ARIA、drawer 与错误状态契约。

## 当前事实闭包

- `SkillTypeaheadPlugin.tsx` 使用 HeroUI `Surface`、`ScrollShadow`、`Separator`、`Button`，候选行仍是 Lexical 管理的原生 `ul/li`。
- HeroUI 3.2.4 的 `listboxVariants` 与 `listboxItemVariants` 可以用于原生元素；默认 selected 规则没有可见样式，Lexical active 仍需语义 token 覆盖。
- `skillQuery.ts` 当前只按 case-insensitive display name 计算父路径，因此同 display name、不同 canonical name 的候选也会显示 path；新设计改为按 canonical name 分组，只对相同 canonical name、不同 canonical path 的候选显示 path，主标签是否相同不参与判断。
- 底部详情区、`aria-describedby` 和 pointer preview 只为 path 预览服务；删除后 pointer hover 可以回到 HeroUI CSS 状态，不再需要 React hover 文本 owner。
- 生产聚合允许同 name/scope、不同 path 的 skill 共存，不能在 GUI 按 name 或 scope 去重。
- 当前真实 catalog 已有可复核的 canonical name 碰撞场景：项目 `.codex/skills/code-review/SKILL.md` 的主标签回退为 `code-review`，用户配置中的 `code-review/SKILL.md` 主标签为 `Code Review`；两者 canonical name 均为 `code-review`，但 canonical path 不同。P0 必须重新核验两个 canonical source，V6 必须重新核验它们仍同时进入当次真实 GUI catalog；若外部 catalog 已变化，V6 保持阻塞并返回重新计划，不得临时写入 skill fixture。
- `ComposerEditor.browser.test.tsx` 由 `vitest.browser.parallel.config.ts` 收集，并在 Chromium、Firefox、WebKit 三个 Browser Mode instance 中运行。
- 当前权威前端检查脚本为 `format:oxfmt`、`lint`、`type-check`；聚焦 Vitest 使用 fnm-backed 直接入口。
- 本计划不修改 Rust、app-server wire、schema、生成协议、依赖、锁文件或 package scripts。

## 预计修改范围

### 生产代码

- `codex-gui/src/features/composerEditor/skillQuery.ts`
  - 把父路径消歧分组从“相同 display name”改为“相同 canonical name 且 canonical path 不同”。
  - 保留现有 shortest unique parent path 算法和 path 排序 tie-break。
  - 不改变候选集合、匹配分数、20 项上限或内部 candidate path。
- `codex-gui/src/features/composerEditor/SkillTypeaheadPlugin.tsx`
  - 从 `@heroui/styles` 使用 `listboxVariants` 与 `listboxItemVariants`。
  - 删除 `Separator`、详情区、active hidden details、pointer preview 和对应 hover state。
  - 只在需要时显示 canonical name、scope 与最短唯一父路径；description 改为最多一行。
  - 用 HeroUI semantic tokens 表达 Lexical active，确保 active 优先于 hover。

### 测试

- `codex-gui/src/features/composerEditor/__tests__/skillQuery.test.ts`
  - 覆盖同 display name 但 canonical name 不同时不显示 path。
  - 覆盖主标签相同或不同、canonical name 相同且 canonical path 不同时均显示最短唯一父路径。
  - 保留相同 canonical path 不构成碰撞、跨平台 path separator 和排序行为证据。
- `codex-gui/src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx`
  - 替换常驻 source/path、两行 description 和底部详情区断言。
  - 增加渐进披露、碰撞 path、无完整 `SKILL.md` path、无 `aria-describedby` path 和无 footer 断言。
  - 用 computed visual state 与 geometry 证明 default、hover、active、active+hover、pressed/selection path、单行 description 和无横向 overflow。
  - 保留键盘、pointer/touch、滚动、drawer、loading/error/empty 的既有行为覆盖。

## 明确不修改

- `codex-rs/**`、app-server protocol/schema/generated TypeScript；
- `SkillCatalogOwner`、skill discovery/merge、query score、排序和结果上限；
- `SkillNode`、clipboard、queue、recovery、`turn/start`；
- Composer 外壳、菜单 placement、viewport 几何和 drawer 拓扑；
- `codex-gui/package.json`、lockfile、依赖或测试配置；
- 被 ignore 的 research 文档；
- Git remote。

## 权威实现约束

- HeroUI 组件版本与本地源码证据均为 3.2.4。
- `@heroui/react` 继续拥有 `Surface`、`ScrollShadow` 和错误态 `Button`；`@heroui/styles` 只提供 listbox 视觉，不接管交互。
- `aria-selected="true"` 与 `data-active` 继续表示 Lexical active；不得伪造 `data-focus-visible`。
- pointer hover 只产生 HeroUI hover 视觉，不写入选择状态、不改变 active、不滚动 active 回视口。
- active + hover 必须保持 active 视觉优先级。
- `SkillQueryCandidate` 继续机械依赖生成的 `SkillMetadata`，不得新增 consumer-owned protocol mirror。
- 不计划移动、重命名或重排现有代码。若 formatter 产生独立的 import、声明、字段、分支、函数或组件顺序变化，立即停止提交节点并触发重新计划；不得与行为修改放入同一提交。

## 工具链与精确命令

所有前端命令从 `/Users/jiangsheng/cnb/codex/codex-gui` 执行，使用：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm <command>
```

已核验工具：fnm 1.39.0、pnpm 10.34.5、Node v24.17.0、Vitest 4.1.10。不得安装或更新任何依赖、runtime 或 browser binary。

计划使用的前端命令：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt:fix
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/composerEditor/__tests__/skillQuery.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run --config=vitest.browser.parallel.config.ts src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run lint
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

不使用 `pnpm run test:unit -- <path>`，因为该 script 可能收集完整 unit suite；聚焦测试采用项目 skill 定义的直接 Vitest 入口。不运行 repository-level `just fmt`，因为本次文件不属于 live `scripts/format.py` 管理范围。

真实 GUI 验收使用 `.codex/skills/debug-responsive-gui/scripts/debug-responsive-gui.mjs` 和可审查 locator。若没有可用 Codex runtime，必须要求用户亲自运行精确命令 `j c`；助手不得运行。GUI URL 必须从当次 `/gui` 或 `launch_gui` 获取，不猜测、不复用旧 URL。

## Task boundary 与本地提交拓扑

### DOCS：工作文档提交

实现前先创建一个只包含本次设计与计划文档的本地提交：

- `docs/superpowers/specs/2026/08/29/2026-08-29-codex-gui-skill-typeahead-heroui-style-design.md`
- `docs/superpowers/plans/2026/08/29/2026-08-29-codex-gui-skill-typeahead-heroui-style-plan.md`

建议提交信息：

```text
docs: design skill typeahead HeroUI styling
```

不得强制暂存或提交被 ignore 的 research 文档。

### STYLE：前端行为与验证提交

所有生产代码和直接测试形成一个用户可见行为提交。它不包含代码顺序调整、文档、生成物、依赖或范围外文件。

建议提交信息：

```text
feat(gui): refine skill typeahead styling
```

若验证在提交前发现计划内问题，先在 STYLE task boundary 内修正并重跑受影响验证。若问题在 STYLE 已提交后发现，必须创建新的独立修正提交，禁止 amend。

## 描述式执行 DAG

以下节点是权威执行结构，不以文档顺序制造额外依赖。所有节点在用户明确确认本计划前，`authorizationGate.status` 均为 `pending`。

### P0 — 执行环境与范围预检

- `nodeId`: `P0`
- `taskBoundary`: 无提交的调查节点
- `operationKind`: 调查
- `outcome`: 当前 checkout、适用规则、fnm/pnpm、目标文件、文档 allowlist、`code-review` canonical name 碰撞的两个不同 canonical source、验证 cache/session canonical locks 与工作树基线全部可用，且不存在会污染任务范围的未知状态。
- `estimatedCost`: S
- `deferralEvidence`: 无
- `hardPredecessors`: 无
- `consumes`: 已确认计划、当前 checkout、live package scripts、目标文件
- `produces`: 可执行 preflight 证据；V1–V6 canonical resource lock 表；当前碰撞场景的两个 distinct source 证据
- `completionEvidence`: root/cwd、branch、status、工具来源、目标文件、package scripts 与两个不同 canonical `code-review` skill 均核验成功；cache/session lock 表解析到实际绝对路径和访问模式；GUI 中的实际可见性留给 V6 当次复核
- `readSet`: repository rules、`codex-gui/package.json`、Vitest configs、tsconfigs、eslint cache 配置、四个目标源码/测试文件、两个 `code-review` skill、Git status
- `writeSet`: 空
- `stateEffects`: 只读输出；无文件、index、commit、remote 变化
- `commandScope`: `git status`、`git rev-parse`、`git check-ignore`、`rg`、`sed`、fnm/pnpm/version 只读命令
- `subdelegation`: false
- `executionContext`: 当前 `/Users/jiangsheng/cnb/codex` checkout；共享 branch `dev`；不创建 worktree
- `resourceLocks`: repository worktree read；Git index read；cache/session paths read for canonical resolution
- `owner`: 主协调者
- `verification`: 所有预检结论必须命中实际目标；空搜索不能作为不存在证据；碰撞 source 必须证明 canonical path 不同，V6 再证明它们仍同时进入真实 GUI catalog
- `failureDomain`: 阻塞 `D1` 及全部实现后继
- `replanTriggers`: branch、规则、目标文件、工具链、dirty scope、两个 `code-review` canonical source 或 cache/session paths 与计划不一致
- `authorizationGate`: `pending`；计划确认后仅激活只读预检能力信封

### D1 — 暂存并审查工作文档

- `nodeId`: `D1`
- `taskBoundary`: `DOCS`
- `operationKind`: stage
- `outcome`: Git index 只包含两份本次设计/计划文档，且 staged diff 无 whitespace 错误。
- `estimatedCost`: S
- `deferralEvidence`: 无
- `hardPredecessors`: `P0`；依赖可信 checkout 与 allowlist
- `consumes`: 两份已落盘文档、preflight 证据
- `produces`: 已审查的 DOCS staged diff
- `completionEvidence`: `git diff --cached --name-status` 精确匹配 allowlist，`git diff --cached --check` 成功
- `readSet`: 两份文档、Git index、`.gitignore`
- `writeSet`: 当前 checkout 的 Git index，仅两份文档条目
- `stateEffects`: 暂存两份非 ignored 文档；不修改工作树正文
- `commandScope`: 精确 `git add -- <design> <plan>`、`git diff --cached --check`、`git diff --cached --name-status`
- `subdelegation`: false
- `executionContext`: 当前 checkout；共享 Git index 独占
- `resourceLocks`: `/Users/jiangsheng/cnb/codex/.git/index` write
- `owner`: DOCS Git owner
- `verification`: staged allowlist 与文档状态/路径正确
- `failureDomain`: 阻塞 `D2` 及全部实现节点；不恢复或覆盖用户文件
- `replanTriggers`: index 含范围外文件、任一文档被 ignore、文档内容漂移
- `authorizationGate`: `pending`；计划确认后激活精确 DOCS stage 能力信封

### D2 — 提交工作文档

- `nodeId`: `D2`
- `taskBoundary`: `DOCS`
- `operationKind`: commit
- `outcome`: 形成只包含两份工作文档的独立本地提交。
- `estimatedCost`: S
- `deferralEvidence`: 无
- `hardPredecessors`: `D1`；等待已审查 staged diff
- `consumes`: DOCS staged diff
- `produces`: DOCS commit id
- `completionEvidence`: commit 成功且 `git show --name-status --format=fuller HEAD` 仅含 allowlist
- `readSet`: Git index、两份文档
- `writeSet`: 本地 Git object database、当前 branch ref、Git index
- `stateEffects`: 一个本地 commit；无 remote 操作
- `commandScope`: `git commit -m 'docs: design skill typeahead HeroUI styling'` 与只读 commit 检查
- `subdelegation`: false
- `executionContext`: 当前 checkout；共享 branch/index 独占
- `resourceLocks`: `.git/index` write；`refs/heads/dev` write；Git object database write
- `owner`: DOCS Git owner
- `verification`: commit 文件集合和 message 正确
- `failureDomain`: 阻塞所有实现节点；提交失败不得绕过文档门禁
- `replanTriggers`: commit hook 修改范围、commit 未包含精确文档、branch 变化
- `authorizationGate`: `pending`；计划确认后激活精确 DOCS commit 能力信封

### E1 — 收紧碰撞 path 计算并更新 unit tests

- `nodeId`: `E1`
- `taskBoundary`: `STYLE`
- `operationKind`: 编辑
- `outcome`: `skillQuery` 只对 canonical name 相同、canonical path 不同的组计算最短唯一父路径，unit tests 固化该语义。
- `estimatedCost`: M
- `deferralEvidence`: 无
- `hardPredecessors`: `D2`；实现只能消费已提交工作文档
- `consumes`: 已确认设计、DOCS commit、现有 query contract/tests
- `produces`: 更新后的 query result 语义和 unit test source
- `completionEvidence`: diff 只触及 `skillQuery.ts` 与 `skillQuery.test.ts`，测试样例覆盖不同 canonical name、同 canonical name 且不同 path、同 path、主标签差异与跨平台 path
- `readSet`: `skillQuery.ts`、`skillQuery.test.ts`、生成 `SkillMetadata` type
- `writeSet`: `skillQuery.ts`、`skillQuery.test.ts`
- `stateEffects`: 两个前端文件修改；不操作 index
- `commandScope`: `apply_patch`、只读 `rg`/`sed`/`git diff`
- `subdelegation`: false
- `executionContext`: 当前 checkout；STYLE working tree
- `resourceLocks`: 两个目标文件 write
- `owner`: E1 节点执行者
- `verification`: 局部 diff 审查；正式测试由 `V2` 执行
- `failureDomain`: 阻塞 `E2`、`F1` 与 STYLE 后继
- `replanTriggers`: 需要修改 protocol、catalog、排序、结果 shape 或范围外文件
- `authorizationGate`: `pending`；计划确认后激活精确两文件编辑能力信封

### E2 — 应用 HeroUI 样式并删除 path footer

- `nodeId`: `E2`
- `taskBoundary`: `STYLE`
- `operationKind`: 编辑
- `outcome`: 候选列表使用 HeroUI styles、渐进披露并删除 footer/preview，同时 Browser tests 表达新视觉与交互契约。
- `estimatedCost`: M
- `deferralEvidence`: 无
- `hardPredecessors`: `E1`；等待稳定的 query result 展示语义供组件和 Browser fixtures 消费
- `consumes`: E1 工作树产物、HeroUI 3.2.4 styles API、现有 Browser tests
- `produces`: 更新后的组件与 Browser test source
- `completionEvidence`: diff 只触及 `SkillTypeaheadPlugin.tsx` 与 `ComposerEditor.browser.test.tsx`，footer/hover preview 相关生产引用和断言均消失
- `readSet`: 组件、Browser tests、E1 产物、HeroUI local styles source
- `writeSet`: `SkillTypeaheadPlugin.tsx`、`ComposerEditor.browser.test.tsx`
- `stateEffects`: 两个前端文件修改；不操作 index
- `commandScope`: `apply_patch`、只读 `rg`/`sed`/`git diff`
- `subdelegation`: false
- `executionContext`: 当前 checkout；STYLE working tree
- `resourceLocks`: 两个目标文件 write；E1 产物 read
- `owner`: E2 节点执行者
- `verification`: 删除引用搜索与局部 diff 审查；正式测试由验证 fan-out 执行
- `failureDomain`: 阻塞 `F1` 与 STYLE 后继
- `replanTriggers`: 需要第二 focus owner、新 CSS 文件、package 变更、geometry 或 Composer 外壳修改
- `authorizationGate`: `pending`；计划确认后激活精确两文件编辑能力信封

### F1 — 权威前端格式化

- `nodeId`: `F1`
- `taskBoundary`: `STYLE`
- `operationKind`: 格式化
- `outcome`: 四个 STYLE 文件符合 live oxfmt，且 formatter 未改动范围外文件或产生独立代码顺序调整。
- `estimatedCost`: S
- `deferralEvidence`: 无
- `hardPredecessors`: `E2`；等待完整 STYLE working tree
- `consumes`: 四个修改文件、live oxfmt config/script
- `produces`: 格式化后的稳定 STYLE working tree
- `completionEvidence`: formatter 成功；`git diff --name-only` 仍只含两份已提交文档之外的四个 STYLE 文件；diff 无独立 reorder
- `readSet`: `codex-gui/**` formatter inputs、四个 STYLE 文件
- `writeSet`: oxfmt 可能写入的 `codex-gui/**`；实际允许保留的 write 仅四个 STYLE 文件
- `stateEffects`: 格式化工作树；不操作 index
- `commandScope`: `/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt:fix`，随后只读 diff 审查
- `subdelegation`: false
- `executionContext`: 当前 checkout；STYLE working tree
- `resourceLocks`: `codex-gui` formatter write；四个 STYLE 文件 write
- `owner`: STYLE format owner
- `verification`: 实际 diff allowlist 与无 reorder 审查
- `failureDomain`: 阻塞全部验证节点；范围外修改不得静默保留
- `replanTriggers`: formatter 写范围外文件或产生必须单独提交的顺序变化
- `authorizationGate`: `pending`；计划确认后激活权威 formatter 与精确保留范围能力信封

### V1 — 格式检查

- `nodeId`: `V1`
- `taskBoundary`: `STYLE`
- `operationKind`: 验证
- `outcome`: live oxfmt check 通过。
- `estimatedCost`: S
- `deferralEvidence`: 无
- `hardPredecessors`: `F1`；消费格式化稳定状态
- `consumes`: STYLE working tree、oxfmt config
- `produces`: format check 证据
- `completionEvidence`: 命令退出 0 且命中项目
- `readSet`: `codex-gui/**`
- `writeSet`: 空
- `stateEffects`: 只读验证输出
- `commandScope`: `/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt`
- `subdelegation`: false
- `executionContext`: 当前 checkout；`codex-gui` cwd
- `resourceLocks`: formatter inputs read
- `owner`: V1 验证执行者
- `verification`: 退出状态与输出
- `failureDomain`: 阻塞 `R1`；其他 V 节点继续
- `replanTriggers`: 命令入口或 formatter scope 漂移
- `authorizationGate`: `pending`；计划确认后激活只读 format check

### V2 — 聚焦 unit test

- `nodeId`: `V2`
- `taskBoundary`: `STYLE`
- `operationKind`: 验证
- `outcome`: `skillQuery.test.ts` 全部通过且目标被实际收集。
- `estimatedCost`: S
- `deferralEvidence`: 无
- `hardPredecessors`: `F1`
- `consumes`: E1 产物、Vitest unit config
- `produces`: query 语义测试证据
- `completionEvidence`: Vitest 报告目标文件与非零测试数，退出 0
- `readSet`: unit source、query source、Vitest config
- `writeSet`: 临时 runner artifacts，不写 repository source
- `stateEffects`: 测试进程与临时输出
- `commandScope`: `/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/composerEditor/__tests__/skillQuery.test.ts`
- `subdelegation`: false
- `executionContext`: 当前 checkout；`codex-gui` cwd
- `resourceLocks`: `/Users/jiangsheng/cnb/codex/codex-gui/node_modules/.vite/vitest/**` write；`/Users/jiangsheng/cnb/codex/codex-gui/node_modules/.tmp/tsconfig.vitest.tsbuildinfo` write；Vitest unit runner execute
- `owner`: V2 验证执行者
- `verification`: target collection、test count、exit status
- `failureDomain`: 阻塞 `R1`；其他验证继续
- `replanTriggers`: 零测试、错误 config、计划外失败推翻 query 语义
- `authorizationGate`: `pending`；计划确认后激活聚焦 unit test

### V3 — 聚焦 Browser Mode test

- `nodeId`: `V3`
- `taskBoundary`: `STYLE`
- `operationKind`: 验证
- `outcome`: `ComposerEditor.browser.test.tsx` 在 Chromium、Firefox、WebKit 中通过并证明新 DOM/ARIA/geometry/state 契约。
- `estimatedCost`: M
- `deferralEvidence`: 无
- `hardPredecessors`: `F1`
- `consumes`: E2 产物、parallel Browser config、Playwright provider
- `produces`: 三 browser instance 的组件级回归证据
- `completionEvidence`: 目标文件在三个实例被收集，非零测试数且全部退出 0；computed visual state 覆盖 default、hover、active、active+hover，且候选使用 HeroUI listbox item class、未覆盖其 reduced-motion 规则
- `readSet`: Browser test、组件/query source、Vitest Browser configs
- `writeSet`: 临时 Browser/Vitest artifacts，不写 repository source
- `stateEffects`: headless browser processes 与临时输出
- `commandScope`: `/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run --config=vitest.browser.parallel.config.ts src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx`
- `subdelegation`: false
- `executionContext`: 当前 checkout；`codex-gui` cwd
- `resourceLocks`: `/Users/jiangsheng/cnb/codex/codex-gui/node_modules/.vite/vitest/**` write；`/Users/jiangsheng/cnb/codex/codex-gui/node_modules/.tmp/tsconfig.vitest.browser.tsbuildinfo` write；Playwright provider processes execute
- `owner`: V3 验证执行者
- `verification`: target/instance collection、test count、exit status
- `failureDomain`: 阻塞 `R1`；其他验证继续
- `replanTriggers`: browser binary 缺失、零收集、provider/config 不命中或跨浏览器差异推翻样式方案
- `authorizationGate`: `pending`；计划确认后激活聚焦 Browser Mode test；禁止安装 browser

### V4 — lint

- `nodeId`: `V4`
- `taskBoundary`: `STYLE`
- `operationKind`: 验证
- `outcome`: live oxlint 与 eslint 入口全部通过。
- `estimatedCost`: M
- `deferralEvidence`: 无
- `hardPredecessors`: `F1`
- `consumes`: STYLE working tree、live lint configs
- `produces`: lint 证据
- `completionEvidence`: `pnpm run lint` 退出 0
- `readSet`: `codex-gui/**` lint inputs
- `writeSet`: eslint cache 等工具缓存；不得写 source
- `stateEffects`: lint cache/输出；无 source、index、commit 变化
- `commandScope`: `/opt/homebrew/bin/fnm exec --using-file pnpm run lint`
- `subdelegation`: false
- `executionContext`: 当前 checkout；`codex-gui` cwd
- `resourceLocks`: lint configs/source read；`/Users/jiangsheng/cnb/codex/codex-gui/.eslintcache` write
- `owner`: V4 验证执行者
- `verification`: 两个 lint 子入口与退出状态
- `failureDomain`: 阻塞 `R1`；其他验证继续
- `replanTriggers`: lint fix 需要范围外文件或独立 reorder
- `authorizationGate`: `pending`；计划确认后激活 lint 验证，不自动 fix

### V5 — TypeScript type-check

- `nodeId`: `V5`
- `taskBoundary`: `STYLE`
- `operationKind`: 验证
- `outcome`: project TypeScript build graph 在 `--noEmit` 下通过。
- `estimatedCost`: M
- `deferralEvidence`: 无
- `hardPredecessors`: `F1`
- `consumes`: STYLE working tree、tsconfig build graph、生成协议 types
- `produces`: type-check 证据
- `completionEvidence`: `pnpm run type-check` 退出 0 且无 emit
- `readSet`: `codex-gui` TypeScript graph 与 generated protocol inputs
- `writeSet`: TypeScript incremental cache（若工具生成）；不得写 source/generated protocol
- `stateEffects`: type-check cache/输出
- `commandScope`: `/opt/homebrew/bin/fnm exec --using-file pnpm run type-check`
- `subdelegation`: false
- `executionContext`: 当前 checkout；`codex-gui` cwd
- `resourceLocks`: TS graph read；`/Users/jiangsheng/cnb/codex/codex-gui/node_modules/.tmp/tsconfig.app.tsbuildinfo`、`/Users/jiangsheng/cnb/codex/codex-gui/node_modules/.tmp/tsconfig.node.tsbuildinfo`、`/Users/jiangsheng/cnb/codex/codex-gui/node_modules/.tmp/tsconfig.vitest.tsbuildinfo`、`/Users/jiangsheng/cnb/codex/codex-gui/node_modules/.tmp/tsconfig.vitest.browser.tsbuildinfo`、`/Users/jiangsheng/cnb/codex/codex-gui/node_modules/.tmp/tsconfig.e2e.tsbuildinfo` write
- `owner`: V5 验证执行者
- `verification`: 退出状态与 noEmit
- `failureDomain`: 阻塞 `R1`；其他验证继续
- `replanTriggers`: generated contract 缺失、类型修正需要协议或范围外修改
- `authorizationGate`: `pending`；计划确认后激活 type-check

### V6 — 真实 GUI 验收

- `nodeId`: `V6`
- `taskBoundary`: `STYLE`
- `operationKind`: 验证
- `outcome`: 分别记录真实 Codex GUI 中可达场景的 passed 证据与不可达场景的 `UNEXECUTED` 证据，不用自动测试替代真实 GUI 验收。
- `estimatedCost`: M
- `deferralEvidence`: 无；若 runtime 未启动则 authorization/prerequisite gate 保持等待，不伪造硬依赖
- `hardPredecessors`: `F1`
- `consumes`: STYLE working tree、当次 GUI URL、真实 skill catalog、visible Chrome for Testing
- `produces`: desktop/narrow/dark/drawer/interaction 的真实 GUI 验收记录，其中 passed 与 `UNEXECUTED` 分开记录
- `completionEvidence`: 当次真实 GUI 中所有可达的候选信息层级、当前真实 `code-review` canonical name 碰撞、keyboard active、pointer hover、active+hover、选择、滚动、窄屏、dark mode、keyboard `focus-visible`、reduced-motion、无底部 footer 与行内 path 不闪烁场景均有 passed 记录；另有且仅有两项 `UNEXECUTED`：（a）82 个真实 candidates 中没有“同主标签、不同 canonical name”样本；（b）当前任务无 active turn，pending-input drawer 不可达。两项必须保留原因为不可达，不得改写为 passed
- `readSet`: 运行中的 GUI、DOM/AX/geometry/computed styles
- `writeSet`: `/tmp/codex-debug-responsive-gui/current.json` 等临时调试状态；browser session state
- `stateEffects`: headed Chrome for Testing、临时 debug state、用户可见浏览器交互；不写 repository source
- `commandScope`: 当次 `launch_gui` URL、`.codex/skills/debug-responsive-gui/scripts/debug-responsive-gui.mjs`、playwright-cli semantic locators；不得执行 `j c`
- `subdelegation`: false
- `executionContext`: 当前 checkout 对应 runtime；visible Google Chrome for Testing
- `resourceLocks`: visible Google Chrome for Testing app/session exclusive；`/tmp/codex-debug-responsive-gui/current.json` write
- `owner`: V6 GUI 验收执行者
- `verification`: 自动环境就绪、自动测试、真实 GUI passed 与 `UNEXECUTED` 分开记录；截图不单独构成通过，自动测试不得补写或替代两项 `UNEXECUTED` 的真实 GUI 结论
- `failureDomain`: 可达真实场景失败、证据冲突或出现两项之外的 `UNEXECUTED` 时阻塞 `R1`；上述两项已记录原因的 `UNEXECUTED` 不阻塞 `R1` 或 STYLE 提交，自动验证分支不因此停止
- `replanTriggers`: 无当前 GUI URL、当前真实 `code-review` canonical name 碰撞不再存在、visual state 与设计不符、需要写入 fixture、修改 geometry 或 runtime；82 个真实 candidates 缺少“同主标签、不同 canonical name”样本以及当前任务无 active turn 导致 pending-input drawer 不可达，按用户选择 B 记录为 `UNEXECUTED`，不单独触发重新计划
- `authorizationGate`: `pending`；计划确认后激活真实 GUI 操作；若缺 runtime，等待用户运行精确 `j c`

### R1 — STYLE fan-in 审查

- `nodeId`: `R1`
- `taskBoundary`: `STYLE`
- `operationKind`: fan-in
- `outcome`: 四文件组合 diff、全部自动验证与真实 GUI 的 passed/`UNEXECUTED` 分离证据共同证明设计已实现且无范围外改动，并形成带“真实 GUI 未完整验收”限定的可提交结论。
- `estimatedCost`: S
- `deferralEvidence`: 无
- `hardPredecessors`: `V1`、`V2`、`V3`、`V4`、`V5`、`V6`；分别等待 format、unit、Browser、lint、type-check，以及包含可达场景 passed 与两项允许 `UNEXECUTED` 的真实 GUI 稳定记录
- `consumes`: STYLE diff、五个自动验证节点的 passed 证据、V6 的真实 GUI passed/`UNEXECUTED` 分离记录
- `produces`: 可提交 STYLE 审查结论
- `completionEvidence`: diff allowlist、设计验收映射、无 reorder、五个自动验证节点 passed、V6 所有可达场景 passed，且 V6 仅保留已确认的两项 `UNEXECUTED`；审查结论明确写“真实 GUI 未完整验收”，不得把自动测试作为这两项的替代证据
- `readSet`: 四个 STYLE 文件、完整 working diff、验证输出
- `writeSet`: 空
- `stateEffects`: 只读审查结果
- `commandScope`: `git diff --check`、`git diff --name-status`、`git diff -- <allowlist>`、只读搜索
- `subdelegation`: false
- `executionContext`: 当前 checkout
- `resourceLocks`: STYLE working tree read
- `owner`: 主协调者
- `verification`: 每项设计完成标准分别映射到代码、自动测试、真实 GUI passed 或允许的 `UNEXECUTED`；自动测试证据与真实 GUI 证据保持不同类别，本次计划文档修订不要求重跑自动测试
- `failureDomain`: 阻塞 `C1`；失败插入最小修正节点并仅重跑受影响验证
- `replanTriggers`: 写集合扩大、接口/geometry/数据语义变化、独立 reorder、验证证据冲突
- `authorizationGate`: `pending`；计划确认后激活只读 fan-in 审查

### C1 — 暂存并审查 STYLE diff

- `nodeId`: `C1`
- `taskBoundary`: `STYLE`
- `operationKind`: stage
- `outcome`: Git index 只包含四个 STYLE 文件，staged diff 与已验证 working diff 一致且无 whitespace 错误。
- `estimatedCost`: S
- `deferralEvidence`: 无
- `hardPredecessors`: `R1`；等待可提交审查结论
- `consumes`: 已验证 STYLE working diff
- `produces`: 已审查 STYLE staged diff
- `completionEvidence`: cached name-status 精确匹配四文件 allowlist，cached check 成功
- `readSet`: 四个 STYLE 文件、Git index
- `writeSet`: Git index 的四个 STYLE entries
- `stateEffects`: 精确暂存；不暂存文档、cache、research 或其他文件
- `commandScope`: 精确 `git add -- <four files>`、`git diff --cached --check`、`git diff --cached --name-status`
- `subdelegation`: false
- `executionContext`: 当前 checkout；共享 index 独占
- `resourceLocks`: `.git/index` write
- `owner`: STYLE Git owner
- `verification`: staged allowlist 与 working/staged diff 一致
- `failureDomain`: 阻塞 `C2`；不得用 `git add .`
- `replanTriggers`: index 已含其他文件、staged diff 与验证输入不一致
- `authorizationGate`: `pending`；计划确认后激活精确 STYLE stage 能力信封

### C2 — 提交 STYLE 行为修改

- `nodeId`: `C2`
- `taskBoundary`: `STYLE`
- `operationKind`: commit
- `outcome`: 形成只包含四个 STYLE 文件的独立本地行为提交。
- `estimatedCost`: S
- `deferralEvidence`: 无
- `hardPredecessors`: `C1`；等待已审查 staged diff
- `consumes`: STYLE staged diff
- `produces`: STYLE commit id
- `completionEvidence`: commit 成功且 commit 文件集合精确匹配 allowlist
- `readSet`: Git index、四个 STYLE 文件
- `writeSet`: local Git object database、`refs/heads/dev`、Git index
- `stateEffects`: 一个本地行为 commit；无 amend、无 remote
- `commandScope`: `git commit -m 'feat(gui): refine skill typeahead styling'` 与只读 commit 检查
- `subdelegation`: false
- `executionContext`: 当前 checkout；branch/index 独占
- `resourceLocks`: `.git/index` write；`refs/heads/dev` write；Git object database write
- `owner`: STYLE Git owner
- `verification`: commit message、文件集合与 parent 为 DOCS 后续状态
- `failureDomain`: 阻塞 `Z1`；commit 后问题必须新建独立修正提交
- `replanTriggers`: hook 修改范围、commit 失败、branch 漂移
- `authorizationGate`: `pending`；计划确认后激活精确 STYLE commit 能力信封

### Z1 — 最终状态与完成检查

- `nodeId`: `Z1`
- `taskBoundary`: 无提交的最终审查节点
- `operationKind`: 审查
- `outcome`: DOCS 与 STYLE commits、验证证据和工作树状态满足允许两项真实 GUI `UNEXECUTED` 的计划终态，并如实报告验收不完整。
- `estimatedCost`: S
- `deferralEvidence`: 无
- `hardPredecessors`: `C2`；等待 STYLE commit id
- `consumes`: DOCS/STYLE commit ids、自动验证 passed 证据、V6 passed/`UNEXECUTED` 分离记录、最终 worktree/index
- `produces`: 终态报告
- `completionEvidence`: 两个 commit 可审计；index 无任务残留；范围外用户改动保持原状；无 remote 操作；终态报告固定写“真实 GUI 未完整验收”，并逐项列出（a）82 个真实 candidates 中没有“同主标签、不同 canonical name”样本、（b）当前任务无 active turn，pending-input drawer 不可达
- `readSet`: Git log/show/status、验证记录
- `writeSet`: 空
- `stateEffects`: 只读终态报告
- `commandScope`: `git status --short --branch`、`git show --check --stat`、`git log` 的本地只读形式
- `subdelegation`: false
- `executionContext`: 当前 checkout
- `resourceLocks`: Git metadata read
- `owner`: 主协调者
- `verification`: 计划完成标准、自动验证 passed、真实 GUI passed/`UNEXECUTED` 分离记录与固定终态措辞逐项核对；不得用自动测试把 `UNEXECUTED` 提升为 passed
- `failureDomain`: 终止位置；发现已提交问题时创建独立修正节点/提交，不 amend
- `replanTriggers`: 任务未完成、commit/diff/验证证据不一致
- `authorizationGate`: `pending`；计划确认后激活只读终态审查

## Ready set、关键路径与 fan-out/fan-in

- 初始 ready set：仅 `P0`。
- 文档门禁链：`P0 → D1 → D2`。`D2` 的 DOCS commit 是所有实现节点的稳定前提。
- 实现链：`D2 → E1 → E2 → F1`。`E2` 等待 E1 的 query 展示语义；`F1` 等待完整四文件 working tree。
- 验证 fan-out：`F1` 完成后，`V1`、`V2`、`V3`、`V4`、`V5`、`V6` 同时进入 ready set；`V2`、`V3`、`V5` 因写入 Vitest/tsbuildinfo cache 形成最小动态互斥域，只能由其中一个持锁运行，另两个保持 ready 等待锁；V1、V4、V6 无该冲突时继续并行，不制造硬依赖。
- 验证 fan-in：`R1` 等待六个验证分支的稳定证据；V1–V5 必须 passed，V6 必须提交可达场景 passed 与两项允许 `UNEXECUTED` 的分离记录。两项允许的 `UNEXECUTED` 不阻塞 fan-in，单一自动测试或截图不能把它们提升为真实 GUI passed。
- 提交链：`R1 → C1 → C2 → Z1`。
- 粗粒度关键路径：文档 commit → query 语义 → 组件/Browser tests → format → 最慢验证分支（通常为真实 GUI 或三浏览器 Browser Mode）→ fan-in（接受 V6 精确两项 `UNEXECUTED`）→ STYLE commit → 带“真实 GUI 未完整验收”结论的终态审查。

## 资源与并行审计

- 不创建 worktree、branch 或额外 Git index；所有 Git 写节点使用当前 checkout 的同一 index，并严格串行。
- E1 与 E2 不并行：E2 真实消费 E1 产生的 query 展示语义，不是按编号制造依赖。
- 六个验证节点读取同一稳定 working tree。V2 与 V3 都写 `node_modules/.vite/vitest/**`，V5 又会写与两者相交的 `node_modules/.tmp/tsconfig.vitest*.tsbuildinfo`，因此只把 `V2/V3/V5` 放入最小互斥域；V1 只读、V4 只写独立 `.eslintcache`、V6 只写独立 debug/browser session，可与该互斥域中的当前持锁节点并行。
- V6 使用 visible Chrome for Testing；V3 使用 Vitest Playwright provider 的独立 headless processes，当前证据未显示共享 canonical browser session，因此不串行；若 P0 解析出相同底层 session，按实际 lock 表等待，不添加硬依赖。
- 不存在为了复用同一 agent、文档顺序或“先跑便宜检查”而添加的串行边。
- 当前没有有效 `deferralEvidence`。运行时若需要暂缓 ready 节点，必须记录预计并行收益、具体争用成本、复查触发点与失效条件。

## 失败与修正边界

- 任一验证失败只阻塞 `R1` 及其提交后继；其他无依赖验证继续完成。
- 计划内失败且不改变目标、文件范围、行为、接口、数据、安全或授权时，插入最小修正节点，更新受影响依赖并只重跑失效验证。
- 发现需要修改 Rust、protocol、catalog、geometry、Composer 外壳、package、依赖、测试配置或范围外文件时，停止受影响节点并重新计划。
- 工具或 browser binary 缺失时停止相应节点，告知用户需要自行安装的组件与建议命令；助手不得安装。
- 真实 GUI runtime 缺失时只暂停 V6 及其 fan-in 后继，要求用户运行精确 `j c`；自动验证继续。
- 用户选择 B 只豁免 V6 已记录的两项不可达场景：82 个真实 candidates 中没有“同主标签、不同 canonical name”样本，以及当前任务无 active turn 导致 pending-input drawer 不可达。它们不阻塞 R1、C1、C2，但必须传递到 Z1 并固定报告“真实 GUI 未完整验收”；其他真实 GUI 失败或不可达仍按原失败域处理。
- 禁止通过放宽断言、删除覆盖、提高阈值、关闭检查、隐藏 overflow、增加 fallback 或修改基线解决失败。

## 完成标准

- 两份工作文档先形成独立 DOCS commit，之后才开始实现。
- 四个 STYLE 文件形成独立行为 commit；无文档、order-only、依赖、生成物或范围外文件混入。
- 普通候选不常驻显示 source/path，canonical name 仅在需要时显示，description 最多一行。
- canonical name 相同且 canonical path 不同时显示 scope 与最短唯一父路径，不显示完整 `SKILL.md` path，不折叠合法候选。
- footer、Separator、hidden path description、hover preview 与 React hover owner 完整删除。
- HeroUI listbox base、hover、pressed 生效；Lexical active 清晰且覆盖 hover。
- unit、三浏览器 Browser Mode、format、lint 与 type-check 通过；真实 GUI 所有可达场景通过，且仅允许（a）82 个真实 candidates 中没有“同主标签、不同 canonical name”样本、（b）当前任务无 active turn，pending-input drawer 不可达这两项保持 `UNEXECUTED`。
- STYLE 可以在上述两项 `UNEXECUTED` 下提交，但最终报告必须明确写“真实 GUI 未完整验收”；自动测试不得替代、覆盖或提升这两项真实 GUI 状态。
- 最终报告分别列出实际并行、关键路径和未启动 ready 节点；无 Git remote 操作。

原计划已确认并进入执行；用户选择 B 的验收边界修订已确认生效，可按本文条件继续 R1 与 STYLE 提交，但不得引入选择 B 之外的新范围。
