# Codex GUI Skill Typeahead 的 HeroUI Select Popover 视觉修订实施计划

日期：2026-08-29

状态：待确认，未执行

## 目标与设计来源

本计划只实现已确认设计：

- `docs/superpowers/specs/2026/08/29/2026-08-29-codex-gui-skill-typeahead-select-popover-style-design.md`

目标是在不改变 Lexical focus/selection owner、canonical `name + path` 身份、碰撞 path 消歧、catalog、query、IME、队列和提交语义的前提下：

- 让 skill typeahead 壳层直接复用 HeroUI 3.2.4 `selectVariants().popover()` 的视觉；
- 移除 `ScrollShadow` fade mask，同时保留单一内部滚动 owner、细滚动条和 active 自动滚入视口；
- 让 Select popover 的 listbox/item density 真实命中现有原生 `ul/li`；
- 把 keyboard active 改为中性背景加 HeroUI focus ring，pointer hover 只使用中性背景；
- 保持菜单即时出现、即时关闭，不引入 enter/exit animation；
- 保留既有碰撞 path、ARIA、pointer/touch、drawer 和响应式契约。

## 当前事实闭包

- 当前 `SkillTypeaheadPlugin.tsx` 已复用 `listboxVariants` 与 `listboxItemVariants`，但外层仍是 `Surface variant="secondary"`，滚动区仍是默认 `ScrollShadow` fade mask。
- `ScrollShadow` 默认 `variant="fade"`、`size=40`。中间滚动状态会在同一容器上下各应用 40px `mask-image`，截图中的上下洗白由此产生。
- HeroUI 3.2.4 `Select.Popover` 使用 `bg-overlay`、`shadow-overlay`、`radius-3xl`、`overflow-y-auto`、`overscroll-contain` 和滚动条，不使用 fade mask。
- `selectVariants().popover()` 是公开样式 slot；继续手写一组近似 token 会偏离已确认设计。
- Select 的局部 density 通过 `[data-slot="list-box"]` 与 `[data-slot="list-box-item"]` descendant rule 应用 `p-1.5` 与 `px-2.5`。现有原生 `ul/li` 需要补充这两个纯样式 slot，不能引入 React Aria owner。
- 保留 `Surface variant="secondary"` 会让 surface background 与 popover slot 竞争；保留内层 `ScrollShadow` 则会形成两个 `overflow-y-auto` owner。最小最终结构是：Lexical portal 根容器应用 popover slot 并成为唯一滚动 owner，删除 `Surface` 与 `ScrollShadow` wrapper，只保留错误态所需的 HeroUI `Button`。
- 当前 active 通过 `data-active` 与 `aria-selected` 表达。新的 focus ring 应从 `data-active` 派生并使用 HeroUI `status-focused` 等价样式，不得伪造 `data-focus-visible` 或移动 DOM focus。
- `ComposerEditor.browser.test.tsx` 已覆盖 editor focus/ARIA、drawer、collision path、overflow、active/hover、滚动、pointer/touch 和 catalog 状态；新断言可以在同一文件扩展。
- `ComposerEditor.browser.test.tsx` 被 `vitest.browser.parallel.config.ts` 收集，并在 Chromium、Firefox、WebKit 三个 instance 中执行。
- 本计划不修改 Rust、app-server、protocol、schema、generated TypeScript、query、unit tests、package scripts、依赖、lockfile 或测试配置。

## 预计修改范围

### 生产代码

- `codex-gui/src/features/composerEditor/SkillTypeaheadPlugin.tsx`
  - 导入并复用 `selectVariants().popover()`。
  - 删除 `Surface`、`ScrollShadow` import 和 wrapper。
  - 把 portal 根容器设为唯一滚动 owner，保留最大高度、细滚动条、`overflow-y-auto`、`overscroll-contain`、无横向 overflow 和 `data-skill-menu-scroll-region`。
  - 给原生 `ul/li` 增加纯样式 `data-slot="list-box"` / `data-slot="list-box-item"`，让 Select popover density 生效。
  - 删除 `accent-soft` active 填充，改用中性背景与 HeroUI focus ring；active + hover 保留 ring。
  - 不添加 enter/exit state、动画 class 或延迟关闭生命周期。

### Browser Mode 测试

- `codex-gui/src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx`
  - 证明只有一个 scroll owner，且 top/middle/bottom 均无 `mask-image`。
  - 通过 computed style 证明 overlay background、overlay shadow、Select popover radius、无外边框、listbox/item density。
  - 证明 active 与 hover 都使用中性背景，但只有 active 有 focus ring；active + hover 不丢 ring。
  - 保留并扩展 pointer hover 不改变 active、Enter 目标或 scroll position 的证据。
  - 证明 menu 没有 enter/exit state 或 animation。
  - 保留 drawer、collision path、无横向 overflow、pointer/touch、loading/error/retry/empty 的既有覆盖。

## 明确不修改

- `codex-rs/**`、app-server、protocol、schema、generated TypeScript；
- `skillQuery.ts`、`skillQuery.test.ts`、catalog、collision、排序、20 项上限；
- `SkillNode`、clipboard、IME、queue、recovery、`turn/start`；
- Composer 外壳、菜单 placement、viewport owner 和 drawer 拓扑；
- 全局 CSS、`codex-gui/package.json`、Vitest config、依赖或 lockfile；
- research 文档；
- Git remote。

## 权威实现约束

- HeroUI 与本地 source 的精确版本均为 3.2.4。
- popover 壳层通过公开 `selectVariants().popover()` 获取，不手写平行的 overlay/radius/shadow 定义。
- 原生 `ul/li` 只消费 HeroUI styles；Lexical 继续拥有 active、keyboard、pointer selection 和 editor focus。
- 最终只能保留一个 `overflow-y-auto` owner；任何滚动位置都不得存在 `mask-image` 或 fade overlay。
- `aria-selected="true"`、`data-active` 与 `aria-activedescendant` 继续指向同一个 Lexical active option。
- active ring 从 Lexical active 状态派生，不设置 `data-focus-visible="true"`，不把 DOM focus 移到 option。
- pointer hover 不写 React hover owner、不改变 active、不触发 active 回滚。
- 不移动、重命名或重排现有代码。若 formatter 产生独立 order-only 调整，必须停止提交并重新计划，不能混入行为提交。

## 工具链与精确命令

所有前端命令从 `/Users/jiangsheng/cnb/codex/codex-gui` 执行，并使用 fnm-backed pnpm：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm --version
```

权威格式入口：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt:fix
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
```

聚焦三浏览器 Browser Mode：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run --config=vitest.browser.parallel.config.ts src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx
```

静态检查：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run lint
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

不运行 unit test：本次不修改 query 或其他 unit-owned 逻辑；`test:browser:smoke` 不收集目标文件，不能替代聚焦 Browser Mode。除非执行时发现目标收集或共享回归证据不足，否则不运行完整 `test:browser`；扩大验证必须先由事实证明必要性。

不运行 repository-level `just fmt`：本次目标文件不属于 live `scripts/format.py` 管理范围。

真实 GUI 验收使用：

```bash
node .codex/skills/debug-responsive-gui/scripts/debug-responsive-gui.mjs --gui-url '<当次 launch_gui 返回的完整 VPN/LAN URL>'
```

GUI URL 必须来自当次 `/gui` 或 `launch_gui`，不能复用旧 URL。若没有可用 Codex runtime，必须要求用户亲自运行精确命令 `j c`；助手不得执行。

## Task boundary 与本地提交拓扑

### DOCS — 工作文档提交

实现前先创建一个只包含本次设计与计划的本地提交：

- `docs/superpowers/specs/2026/08/29/2026-08-29-codex-gui-skill-typeahead-select-popover-style-design.md`
- `docs/superpowers/plans/2026/08/29/2026-08-29-codex-gui-skill-typeahead-select-popover-style-plan.md`

建议提交信息：

```text
docs: design skill typeahead Select popover styling
```

### STYLE — 前端行为与直接回归

生产代码与直接 Browser Mode 测试形成一个用户可见行为提交：

- `codex-gui/src/features/composerEditor/SkillTypeaheadPlugin.tsx`
- `codex-gui/src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx`

建议提交信息：

```text
feat(gui): align skill typeahead with Select popover
```

该提交不包含文档、order-only 调整、全局 CSS、依赖、生成物或范围外文件。提交前必须完成计划内自动验证、真实 GUI 可达场景验收和独立审查。提交后发现的问题必须创建新的独立修正提交，禁止 amend。

## 待确认能力信封

以下能力信封只是计划期的最小授权草案，不产生当前执行授权。共享字段如下：

- `phase`: `plan-execution`
- `grantSource`: `pending`；只有用户后续明确确认本计划，运行时授权记录才可把该确认作为 grant source。
- `negativeConstraints`: 禁止修改未列入节点 `writeSet` 的文件；禁止 remote、force、amend、squash、安装、依赖更新、baseline 更新、测试弱化、范围外修复、修改 `~/.codex/AGENTS.md`；未列出的副作用默认禁止。
- `specialApprovals`: `[]`
- `requiredApprovalIds`: `[]`
- `subdelegation`: `false`
- `lifecycle`: 计划确认前保持 pending；确认后仅在节点进入 ready、分配给唯一 owner 时激活；节点返回完成/失败、计划撤销、前提失效或触发重新计划时立即到期。
- `status`: `pending`

每个节点通过下述唯一 envelope ID 消费共享字段与节点专属 delta；两部分合并后可完整还原能力信封。

### ENV-P0

- `objective`: 闭合实现与验证共享前提。
- `operationKind`: 调查
- `outcome`: checkout、规则、文件、工具、HeroUI 版本和测试收集证据可信。
- `grantedOperation`: 只读 preflight。
- `allowedOperations`: 读取规则/文件/Git 状态；查询 fnm/pnpm 版本与测试配置。
- `parameterBounds`: cwd `/Users/jiangsheng/cnb/codex`；只读一次当前执行基线；不得启动 runner 或 GUI。
- `readSet`: P0 节点所列全部资源。
- `writeSet`: `[]`
- `canonicalTargets`: 当前 checkout、Git index、两份 DOCS、两份 STYLE、package/Vitest/HeroUI 输入。
- `stateEffects`: 仅结构化证据。
- `commandScope`: P0 节点的只读命令集合。
- `replanTriggers`: checkout、规则、文件、工具、版本、dirty scope 或目标收集不一致。

### ENV-D1

- `objective`: 形成精确 DOCS staged snapshot。
- `operationKind`: stage
- `outcome`: index 仅包含两份 DOCS 且 staged check 通过。
- `grantedOperation`: 精确暂存工作文档。
- `allowedOperations`: 精确 `git add -- <design> <plan>`；读取 cached diff/check/name-status。
- `parameterBounds`: 当前 checkout；单次 DOCS allowlist stage；禁止 `git add .` 和 ignored 文件。
- `readSet`: 两份 DOCS、Git index、`.gitignore`。
- `writeSet`: Git index 的两份 DOCS entries。
- `canonicalTargets`: `/Users/jiangsheng/cnb/codex/.git/index` 与两份 DOCS。
- `stateEffects`: index 精确变化；不改工作树正文。
- `commandScope`: D1 节点所列 Git 命令。
- `replanTriggers`: index 范围外内容、文档 ignored/漂移或需要 force。

### ENV-D2

- `objective`: 满足实现前工作文档提交门禁。
- `operationKind`: commit
- `outcome`: 生成精确 DOCS 本地 commit。
- `grantedOperation`: 提交已审查 DOCS staged snapshot。
- `allowedOperations`: 指定 message 的一次本地 commit；只读检查 commit。
- `parameterBounds`: 只消费 D1 snapshot；一个 commit；当前 branch；无 amend。
- `readSet`: Git index、两份 DOCS。
- `writeSet`: Git object database、当前 branch ref、Git index。
- `canonicalTargets`: 当前 repository 的 object database、branch ref、index。
- `stateEffects`: 一个本地 DOCS commit。
- `commandScope`: D2 节点所列 commit/check 命令。
- `replanTriggers`: hook 改范围、commit 集合错误、branch 或 parent 漂移。

### ENV-E1

- `objective`: 实现已确认的 Select popover 视觉修订及直接回归。
- `operationKind`: 编辑
- `outcome`: 两个 STYLE 文件形成完整 working diff。
- `grantedOperation`: 编辑精确两文件。
- `allowedOperations`: `apply_patch` 编辑；只读搜索与 diff 审查。
- `parameterBounds`: 当前 checkout；只能实现设计中的壳层、scroll、density、active/hover 和无动画结果。
- `readSet`: E1 节点所列设计、源码、测试与 HeroUI 证据。
- `writeSet`: 两个 STYLE 文件。
- `canonicalTargets`: 两个 STYLE 文件的物理路径。
- `stateEffects`: 两文件工作树修改；不写 index。
- `commandScope`: E1 节点所列编辑/只读工具。
- `replanTriggers`: 需要新 CSS、第二 owner、query/protocol/package/config 或第三个文件。

### ENV-F1

- `objective`: 用权威 formatter 规范化 STYLE diff。
- `operationKind`: 格式化
- `outcome`: STYLE allowlist 格式化且无范围外保留修改。
- `grantedOperation`: 运行一次 live oxfmt fix 并审查结果。
- `allowedOperations`: `format:oxfmt:fix`；只读 Git diff allowlist 审查。
- `parameterBounds`: cwd `codex-gui`；仅允许保留两个 STYLE 文件变化。
- `readSet`: formatter inputs 与两个 STYLE 文件。
- `writeSet`: formatter 技术上可触及 `codex-gui/**`；授权保留目标仅两个 STYLE 文件。
- `canonicalTargets`: `codex-gui` formatter inputs 与两个 STYLE 文件。
- `stateEffects`: formatter 工作树写；不写 index。
- `commandScope`: F1 节点所列 fnm-backed formatter 命令。
- `replanTriggers`: 范围外写、order-only 调整、formatter/配置漂移。

### ENV-V1

- `objective`: 证明格式检查通过。
- `operationKind`: 验证
- `outcome`: live oxfmt check 命中项目并退出 0。
- `grantedOperation`: 只读格式验证。
- `allowedOperations`: 运行 `format:oxfmt`；读取输出。
- `parameterBounds`: cwd `codex-gui`；一次非 fix 检查。
- `readSet`: `codex-gui/**` formatter inputs。
- `writeSet`: `[]`
- `canonicalTargets`: live oxfmt project input。
- `stateEffects`: 进程与验证输出。
- `commandScope`: V1 节点所列命令。
- `replanTriggers`: 入口、scope 或配置漂移。

### ENV-V2

- `objective`: 证明目标 Browser 测试在三浏览器通过。
- `operationKind`: 验证
- `outcome`: 目标文件被三个 instance 收集且全部 passed。
- `grantedOperation`: 聚焦 Browser Mode 验证。
- `allowedOperations`: 运行精确 Vitest Browser 命令；读取结果。
- `parameterBounds`: cwd `codex-gui`；仅目标 Browser 文件；Chromium/Firefox/WebKit；不得安装 browser。
- `readSet`: 两个 STYLE 文件、Browser config 与依赖。
- `writeSet`: Vitest cache、`/Users/jiangsheng/cnb/codex/codex-gui/node_modules/.tmp/tsconfig.vitest.browser.tsbuildinfo`、临时 runner state。
- `canonicalTargets`: 目标 Browser file、parallel config、上述 cache/tsbuildinfo。
- `stateEffects`: headless browser processes 与临时 cache。
- `commandScope`: V2 节点所列聚焦命令。
- `replanTriggers`: browser 缺失、零收集、错误 config、跨浏览器失败或越界修正。

### ENV-V3

- `objective`: 证明 live lint 通过。
- `operationKind`: 验证
- `outcome`: oxlint 与 eslint 均退出 0。
- `grantedOperation`: 非 fix lint 验证。
- `allowedOperations`: 运行 `pnpm run lint`；读取输出。
- `parameterBounds`: cwd `codex-gui`；不得运行 lint fix。
- `readSet`: `codex-gui/**` lint inputs。
- `writeSet`: `codex-gui/.eslintcache`。
- `canonicalTargets`: lint inputs/config 与 `.eslintcache`。
- `stateEffects`: lint cache 与输出；不写 source。
- `commandScope`: V3 节点所列命令。
- `replanTriggers`: lint 失败需越界、fix 或 order-only 调整。

### ENV-V4

- `objective`: 证明 TypeScript graph 在 noEmit 下通过。
- `operationKind`: 验证
- `outcome`: `type-check` 退出 0 且无 emit。
- `grantedOperation`: TypeScript 非修复验证。
- `allowedOperations`: 运行 `pnpm run type-check`；读取输出。
- `parameterBounds`: cwd `codex-gui`；一次 noEmit project check。
- `readSet`: `codex-gui` TS graph 与 generated types。
- `writeSet`: `node_modules/.tmp/tsconfig*.tsbuildinfo`，明确包含 `/Users/jiangsheng/cnb/codex/codex-gui/node_modules/.tmp/tsconfig.vitest.browser.tsbuildinfo`。
- `canonicalTargets`: TS graph、所有 tsbuildinfo，特别是与 V2 共享的上述绝对路径。
- `stateEffects`: incremental cache 与输出；不写 source/generated files。
- `commandScope`: V4 节点所列命令。
- `replanTriggers`: generated input 缺失或修正需 protocol/范围外写。

### ENV-V5

- `objective`: 对所有可达受影响状态进行真实 GUI 验收。
- `operationKind`: 验证
- `outcome`: 形成 passed/failed/`UNEXECUTED` 分离记录。
- `grantedOperation`: visible Chrome for Testing 中的真实 GUI 验收。
- `allowedOperations`: 获取当次 GUI URL；运行固化 debug 入口；使用 semantic locators；截图作辅助。
- `parameterBounds`: 当前 checkout 对应 runtime；VPN→LAN→Local URL 顺序；不得执行 `j c`、坐标点击或系统 Chrome。
- `readSet`: 真实 GUI、DOM/AX/geometry/computed styles、当次 catalog。
- `writeSet`: `/tmp/codex-debug-responsive-gui/**` 与 visible browser session state。
- `canonicalTargets`: 当次 GUI task、Chrome for Testing session、debug state。
- `stateEffects`: 用户可见 browser 交互与临时 debug state；不写 repo。
- `commandScope`: V5 节点所列固化入口与 playwright-cli。
- `replanTriggers`: runtime/URL 不可用则暂停等待外部状态；真实结构推翻计划、需 fixture/代码写入或 geometry 扩大则重新计划。

### ENV-V6

- `objective`: 独立审查设计忠实度、范围与测试强度。
- `operationKind`: 审查
- `outcome`: PASS 或精确阻塞项。
- `grantedOperation`: 只读稳定 diff 审查。
- `allowedOperations`: 读取设计/代码/tests/HeroUI source；运行只读 diff/search。
- `parameterBounds`: 只读取 F1 稳定状态；不得修改或运行测试。
- `readSet`: V6 节点所列稳定 diff 与权威证据。
- `writeSet`: `[]`
- `canonicalTargets`: 两个 STYLE 文件与确认设计。
- `stateEffects`: 结构化审查结果。
- `commandScope`: V6 节点所列只读命令。
- `replanTriggers`: 需要新文件、接口/行为扩大或测试删除。

### ENV-R1

- `objective`: 汇合并判定 STYLE 是否可提交。
- `operationKind`: fan-in
- `outcome`: 形成设计映射、验证与 GUI 证据一致的可提交结论。
- `grantedOperation`: 只读 fan-in 审查。
- `allowedOperations`: 读取 V1–V6 证据与完整 diff；运行只读 diff check。
- `parameterBounds`: 只消费稳定 STYLE diff 和已完成节点证据。
- `readSet`: 两个 STYLE 文件、V1–V6 输出。
- `writeSet`: `[]`
- `canonicalTargets`: STYLE diff 与验证记录。
- `stateEffects`: 结构化 fan-in 结论。
- `commandScope`: R1 节点所列只读 Git 命令。
- `replanTriggers`: 写集合、接口、geometry、语义、reorder 或证据冲突。

### ENV-C1

- `objective`: 形成精确 STYLE staged snapshot。
- `operationKind`: stage
- `outcome`: index 仅包含两个 STYLE 文件且 staged check 通过。
- `grantedOperation`: 精确暂存已验证 STYLE diff。
- `allowedOperations`: 精确 `git add -- <two files>`；读取 cached diff/check/name-status。
- `parameterBounds`: 当前 checkout；禁止 `git add .`；只消费 R1 已验证 diff。
- `readSet`: 两个 STYLE 文件、Git index。
- `writeSet`: Git index 的两个 STYLE entries。
- `canonicalTargets`: `/Users/jiangsheng/cnb/codex/.git/index` 与两个 STYLE 文件。
- `stateEffects`: index 精确变化。
- `commandScope`: C1 节点所列 Git 命令。
- `replanTriggers`: index 含其他文件或 staged snapshot 与验证输入不一致。

### ENV-C2

- `objective`: 创建独立 STYLE 行为提交。
- `operationKind`: commit
- `outcome`: 一个只含两个 STYLE 文件的本地 commit。
- `grantedOperation`: 提交已审查 STYLE snapshot。
- `allowedOperations`: 指定 message 的一次本地 commit；只读检查 commit。
- `parameterBounds`: 只消费 C1 snapshot；一个 commit；无 amend/squash。
- `readSet`: Git index、两个 STYLE 文件。
- `writeSet`: Git object database、当前 branch ref、Git index。
- `canonicalTargets`: 当前 repository object database、branch ref、index。
- `stateEffects`: 一个本地 STYLE commit。
- `commandScope`: C2 节点所列 commit/check 命令。
- `replanTriggers`: hook 改范围、commit/parent/branch 漂移。

### ENV-Z1

- `objective`: 审计最终 commits、验证与工作树状态。
- `operationKind`: 审查
- `outcome`: 形成准确终态报告。
- `grantedOperation`: 只读最终审查。
- `allowedOperations`: 读取本地 Git status/log/show 与验证记录。
- `parameterBounds`: 当前 checkout；不得修改、清理或 remote。
- `readSet`: Git metadata、commits、验证记录。
- `writeSet`: `[]`
- `canonicalTargets`: DOCS/STYLE commits、index、worktree。
- `stateEffects`: 用户终态报告。
- `commandScope`: Z1 节点所列本地只读 Git 命令。
- `replanTriggers`: task、commit、diff、验证或状态证据不一致。

## 描述式执行 DAG

以下节点是计划确认后的权威执行结构。当前计划尚未确认，所有节点的 `authorizationGate.status` 均为 `pending`。

### P0 — 执行环境与范围预检

- `nodeId`: `P0`
- `taskBoundary`: 无提交的调查节点
- `operationKind`: 调查
- `outcome`: checkout、适用规则、fnm/pnpm、两份 DOCS、两份 STYLE 文件、HeroUI/Vitest 本地证据、目标测试收集与 Git baseline 等共享前提可信；Browser provider 状态按分支记录，不把 GUI runtime/URL 设为全图前提。
- `estimatedCost`: S
- `deferralEvidence`: 无
- `hardPredecessors`: 无
- `consumes`: 已确认计划、当前 checkout、live package scripts、目标文件
- `produces`: 共享 preflight 证据、canonical resource lock 表与 V2/V5 分支资源状态
- `completionEvidence`: cwd/root、branch、status、工具来源、目标文件、package scripts、HeroUI 3.2.4、Vitest target collection 与共享资源路径核验成功；Browser provider 缺口只标记 V2 分支状态，GUI runtime/URL 留给 V5 当次获取
- `readSet`: AGENTS/skills、两份 DOCS、两份 STYLE 文件、package.json、Vitest configs、HeroUI local source/docs、Git status/index
- `writeSet`: 空
- `stateEffects`: 只读输出；无工作树、index、commit、remote 变化
- `commandScope`: `git status/rev-parse/check-ignore`、`rg`、`sed`、fnm/pnpm version、目标收集配置只读检查
- `subdelegation`: false
- `executionContext`: 当前 `/Users/jiangsheng/cnb/codex` checkout；不创建 worktree、branch 或额外 index
- `resourceLocks`: repository worktree read；Git index read；frontend cache paths read for canonical resolution
- `owner`: 主协调者
- `verification`: 空搜索或命令退出 0 不能替代目标命中；必须证明 parallel Browser config 声明收集目标文件及三个 browser instance；binary 可用性由 V2 执行分支判定
- `failureDomain`: 共享 checkout、规则、文件、工具来源、HeroUI 版本或 target config 失败时阻塞 `D1` 及全部实现后继；Browser provider/binary 缺口只暂停 V2 与其 fan-in 后继，不阻塞 DOCS/E1；GUI runtime/URL 不属于 P0 失败域
- `replanTriggers`: branch、规则、文件、工具链、dirty scope、HeroUI 版本或 runner 输入与计划不一致
- `authorizationGate`: `pending`；能力信封 `ENV-P0`

### D1 — 暂存并审查工作文档

- `nodeId`: `D1`
- `taskBoundary`: `DOCS`
- `operationKind`: stage
- `outcome`: Git index 只包含两份新设计/计划文档，staged diff 无 whitespace 错误。
- `estimatedCost`: S
- `deferralEvidence`: 无
- `hardPredecessors`: `P0`；等待可信 checkout 与 allowlist
- `consumes`: 两份已落盘 DOCS、P0 证据
- `produces`: 已审查 DOCS staged diff
- `completionEvidence`: cached name-status 精确匹配 allowlist，`git diff --cached --check` 通过
- `readSet`: 两份 DOCS、Git index、`.gitignore`
- `writeSet`: 当前 checkout Git index 的两份 DOCS entries
- `stateEffects`: 精确暂存；不修改文档正文
- `commandScope`: 精确 `git add -- <design> <plan>`、cached diff/check/name-status
- `subdelegation`: false
- `executionContext`: 当前 checkout；共享 Git index 独占
- `resourceLocks`: `/Users/jiangsheng/cnb/codex/.git/index` write
- `owner`: DOCS Git owner
- `verification`: staged allowlist、文件状态和文档内容正确
- `failureDomain`: 阻塞 `D2` 及全部实现节点
- `replanTriggers`: index 含范围外文件、文档被 ignore、正文漂移或需要强制暂存
- `authorizationGate`: `pending`；能力信封 `ENV-D1`

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
- `completionEvidence`: commit 成功且 `git show --name-status` 仅含两份 DOCS
- `readSet`: Git index、两份 DOCS
- `writeSet`: Git object database、当前 branch ref、Git index
- `stateEffects`: 一个本地 commit；无 amend、无 remote
- `commandScope`: `git commit -m 'docs: design skill typeahead Select popover styling'` 与只读 commit 检查
- `subdelegation`: false
- `executionContext`: 当前 checkout；branch/index 独占
- `resourceLocks`: `.git/index` write；当前 branch ref write；Git object database write
- `owner`: DOCS Git owner
- `verification`: commit message、parent 和文件集合正确
- `failureDomain`: 阻塞 `E1` 及全部实现节点；提交失败不得绕过工作文档门禁
- `replanTriggers`: hook 修改范围、commit 集合或 branch 漂移
- `authorizationGate`: `pending`；能力信封 `ENV-D2`

### E1 — 实现 Select popover 壳层、单一滚动 owner 与状态视觉

- `nodeId`: `E1`
- `taskBoundary`: `STYLE`
- `operationKind`: 编辑
- `outcome`: 两个 STYLE 文件共同实现并固化已确认的壳层、无 mask、density、active/hover 和无动画契约。
- `estimatedCost`: M
- `deferralEvidence`: 无
- `hardPredecessors`: `D2`；实现只能消费已提交工作文档
- `consumes`: DOCS commit、HeroUI 3.2.4 slots/styles、现有组件与 Browser tests
- `produces`: 两文件 STYLE working diff
- `completionEvidence`: diff 仅触及两个 STYLE 文件；`Surface`/`ScrollShadow` wrapper 消失；popover slot、单一滚动 owner、data slots、active ring 和直接回归断言完整
- `readSet`: 两个 STYLE 文件、已确认设计、HeroUI local source/docs、Browser config
- `writeSet`: 两个 STYLE 文件
- `stateEffects`: 前端源码与直接 Browser test 修改；不操作 Git index
- `commandScope`: `apply_patch` 与只读 `rg`/`sed`/`git diff`
- `subdelegation`: false
- `executionContext`: 当前 checkout；STYLE working tree
- `resourceLocks`: 两个 STYLE 文件 write
- `owner`: STYLE 编辑节点执行者
- `verification`: 局部 diff、移除引用搜索与设计验收映射；正式验证由 V 节点执行
- `failureDomain`: 阻塞 `F1` 及全部 STYLE 后继
- `replanTriggers`: 需要新 CSS、第二 focus/scroll owner、query/protocol/package/config 或范围外文件
- `authorizationGate`: `pending`；能力信封 `ENV-E1`

### F1 — 权威前端格式化

- `nodeId`: `F1`
- `taskBoundary`: `STYLE`
- `operationKind`: 格式化
- `outcome`: 两个 STYLE 文件符合 live oxfmt，且 formatter 未留下范围外修改或独立 order-only 调整。
- `estimatedCost`: S
- `deferralEvidence`: 无
- `hardPredecessors`: `E1`；等待完整 STYLE working diff
- `consumes`: 两个 STYLE 文件、live formatter script/config
- `produces`: 格式化后的稳定 STYLE working tree
- `completionEvidence`: formatter 成功；实际 diff 仍精确匹配 STYLE allowlist；无独立 reorder
- `readSet`: `codex-gui/**` formatter inputs、两个 STYLE 文件
- `writeSet`: formatter 可触及 `codex-gui/**`；实际允许保留的 write 仅两个 STYLE 文件
- `stateEffects`: 格式化工作树；不操作 index
- `commandScope`: `/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt:fix`，随后只读 diff allowlist 审查
- `subdelegation`: false
- `executionContext`: 当前 checkout；`codex-gui` cwd
- `resourceLocks`: `codex-gui` formatter write；两个 STYLE 文件 write
- `owner`: STYLE format owner
- `verification`: 范围外 formatter 修改立即停止，不得自动恢复或静默保留
- `failureDomain`: 阻塞全部验证节点
- `replanTriggers`: formatter 写范围外文件或产生必须独立提交的代码顺序调整
- `authorizationGate`: `pending`；能力信封 `ENV-F1`

### V1 — 格式检查

- `nodeId`: `V1`
- `taskBoundary`: `STYLE`
- `operationKind`: 验证
- `outcome`: live oxfmt check 通过。
- `estimatedCost`: S
- `deferralEvidence`: 无
- `hardPredecessors`: `F1`
- `consumes`: 稳定 STYLE working tree、oxfmt config
- `produces`: format check 证据
- `completionEvidence`: `format:oxfmt` 退出 0 且命中项目
- `readSet`: `codex-gui/**`
- `writeSet`: 空
- `stateEffects`: 只读验证输出
- `commandScope`: `/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt`
- `subdelegation`: false
- `executionContext`: 当前 checkout；`codex-gui` cwd
- `resourceLocks`: formatter inputs read
- `owner`: V1 验证执行者
- `verification`: 退出状态与输出
- `failureDomain`: 阻塞 `R1`；其他验证继续
- `replanTriggers`: formatter 入口或 scope 漂移
- `authorizationGate`: `pending`；能力信封 `ENV-V1`

### V2 — 聚焦三浏览器 Browser Mode

- `nodeId`: `V2`
- `taskBoundary`: `STYLE`
- `operationKind`: 验证
- `outcome`: `ComposerEditor.browser.test.tsx` 在 Chromium、Firefox、WebKit 中通过并命中新视觉、滚动、ARIA 与交互契约。
- `estimatedCost`: M
- `deferralEvidence`: 无
- `hardPredecessors`: `F1`
- `consumes`: STYLE diff、parallel Browser config、Playwright provider
- `produces`: 三 browser instance 的组件级回归证据
- `completionEvidence`: 目标文件在三个实例均被收集，非零测试数且全部通过；computed style 证明 overlay、无 mask、density、active ring、hover、无 animation
- `readSet`: 两个 STYLE 文件、Browser config、组件依赖
- `writeSet`: Vitest/TypeScript 临时 cache；不写 source
- `stateEffects`: headless browser processes 与临时 runner 输出
- `commandScope`: `/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run --config=vitest.browser.parallel.config.ts src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx`
- `subdelegation`: false
- `executionContext`: 当前 checkout；`codex-gui` cwd
- `resourceLocks`: `/Users/jiangsheng/cnb/codex/codex-gui/node_modules/.vite/vitest/**` write；`/Users/jiangsheng/cnb/codex/codex-gui/node_modules/.tmp/tsconfig.vitest.browser.tsbuildinfo` write；Playwright provider processes execute
- `owner`: V2 验证执行者
- `verification`: target/instance collection、test count、computed state 与退出状态
- `failureDomain`: 阻塞 `R1`；其他验证继续
- `replanTriggers`: browser binary 缺失、零收集、错误 config、跨浏览器差异或修正需越界
- `authorizationGate`: `pending`；能力信封 `ENV-V2`

### V3 — lint

- `nodeId`: `V3`
- `taskBoundary`: `STYLE`
- `operationKind`: 验证
- `outcome`: live oxlint 与 eslint 全部通过。
- `estimatedCost`: M
- `deferralEvidence`: 无
- `hardPredecessors`: `F1`
- `consumes`: STYLE working tree、lint configs
- `produces`: lint 证据
- `completionEvidence`: `pnpm run lint` 退出 0
- `readSet`: `codex-gui/**` lint inputs
- `writeSet`: `.eslintcache` 等工具 cache；不写 source
- `stateEffects`: lint cache/输出；无 source/index/commit 变化
- `commandScope`: `/opt/homebrew/bin/fnm exec --using-file pnpm run lint`
- `subdelegation`: false
- `executionContext`: 当前 checkout；`codex-gui` cwd
- `resourceLocks`: source/config read；`.eslintcache` write
- `owner`: V3 验证执行者
- `verification`: 两个 lint 子入口与退出状态
- `failureDomain`: 阻塞 `R1`；其他验证继续
- `replanTriggers`: lint fix 需要范围外文件或独立 reorder
- `authorizationGate`: `pending`；能力信封 `ENV-V3`

### V4 — TypeScript type-check

- `nodeId`: `V4`
- `taskBoundary`: `STYLE`
- `operationKind`: 验证
- `outcome`: TypeScript build graph 在 `--noEmit` 下通过。
- `estimatedCost`: M
- `deferralEvidence`: 无
- `hardPredecessors`: `F1`
- `consumes`: STYLE working tree、tsconfig graph、generated protocol types
- `produces`: type-check 证据
- `completionEvidence`: `pnpm run type-check` 退出 0 且无 emit
- `readSet`: `codex-gui` TypeScript graph
- `writeSet`: TypeScript incremental cache；不写 source/generated protocol
- `stateEffects`: type-check cache/输出
- `commandScope`: `/opt/homebrew/bin/fnm exec --using-file pnpm run type-check`
- `subdelegation`: false
- `executionContext`: 当前 checkout；`codex-gui` cwd
- `resourceLocks`: TS graph read；`/Users/jiangsheng/cnb/codex/codex-gui/node_modules/.tmp/tsconfig.app.tsbuildinfo` write；`/Users/jiangsheng/cnb/codex/codex-gui/node_modules/.tmp/tsconfig.node.tsbuildinfo` write；`/Users/jiangsheng/cnb/codex/codex-gui/node_modules/.tmp/tsconfig.vitest.tsbuildinfo` write；`/Users/jiangsheng/cnb/codex/codex-gui/node_modules/.tmp/tsconfig.vitest.browser.tsbuildinfo` write；`/Users/jiangsheng/cnb/codex/codex-gui/node_modules/.tmp/tsconfig.e2e.tsbuildinfo` write
- `owner`: V4 验证执行者
- `verification`: 退出状态与 noEmit
- `failureDomain`: 阻塞 `R1`；其他验证继续
- `replanTriggers`: 类型修正需要 protocol、generated file 或范围外修改
- `authorizationGate`: `pending`；能力信封 `ENV-V4`

### V5 — 真实 GUI 验收

- `nodeId`: `V5`
- `taskBoundary`: `STYLE`
- `operationKind`: 验证
- `outcome`: 在 visible Google Chrome for Testing 中分别记录所有可达受影响状态的 passed 证据与不可达状态的 `UNEXECUTED` 证据。
- `estimatedCost`: M
- `deferralEvidence`: 无
- `hardPredecessors`: `F1`
- `consumes`: STYLE working tree、当次 GUI URL、真实 catalog、visible Chrome for Testing
- `produces`: 真实 GUI passed/failed/`UNEXECUTED` 分离记录
- `completionEvidence`: 可达的 desktop/narrow、light/dark、above/below、default/hover/active/active+hover/pressed、top/middle/bottom scroll、细滚动条、无 mask、即时开合、editor focus、Enter 目标、无 overflow、真实 collision 场景均有记录；条件不可达项列明生产入口与原因
- `readSet`: 运行中的真实 GUI、DOM/AX/geometry/computed styles
- `writeSet`: `/tmp/codex-debug-responsive-gui/**` 临时状态与 browser session
- `stateEffects`: headed Chrome for Testing 与用户可见浏览器交互；不写 repository source
- `commandScope`: 当次 `launch_gui` URL、固化 debug-responsive-gui 入口、playwright-cli semantic locators；不得执行 `j c`
- `subdelegation`: false
- `executionContext`: 当前 checkout 对应 runtime；visible Google Chrome for Testing
- `resourceLocks`: visible Chrome for Testing session exclusive；debug state write
- `owner`: V5 GUI 验收执行者
- `verification`: 截图只作辅助；环境就绪、自动测试、真实 GUI 各场景保持独立证据
- `failureDomain`: runtime 或当次 URL 缺失时暂停 V5、R1、C1、C2、Z1，要求用户完成外部 `j c` 前提，V1–V4/V6 继续；可达受影响场景失败时阻塞 `R1`；条件不可达场景不伪装为 passed，并传递到最终“不完整验收”结论
- `replanTriggers`: runtime/URL 缺失只触发 V5 暂停和外部状态等待，不触发重编图；当前真实结构推翻计划、需要 fixture/代码写入或 geometry 范围扩大时重新计划；单纯条件状态不可达只记录 `UNEXECUTED`
- `authorizationGate`: `pending`；能力信封 `ENV-V5`

### V6 — 独立设计与范围审查

- `nodeId`: `V6`
- `taskBoundary`: `STYLE`
- `operationKind`: 审查
- `outcome`: 独立审查两文件稳定 diff 是否忠实实现设计、没有范围外行为、第二 owner、双滚动或测试弱化。
- `estimatedCost`: S
- `deferralEvidence`: 无
- `hardPredecessors`: `F1`
- `consumes`: 稳定 STYLE diff、确认设计、现有行为契约
- `produces`: PASS 或带精确路径/行号的阻塞项
- `completionEvidence`: 对 overlay slot、mask、scroll owner、density、active/hover、无动画、collision/ARIA/IME 保留和测试强度逐项审查
- `readSet`: 两个 STYLE 文件、设计、相关 HeroUI source/tests
- `writeSet`: 空
- `stateEffects`: 只读审查输出
- `commandScope`: `git diff/check`、`rg`、`sed` 等只读命令
- `subdelegation`: false
- `executionContext`: 当前 checkout；读取 F1 后稳定 working diff
- `resourceLocks`: STYLE working tree read
- `owner`: 独立审查执行者
- `verification`: 阻塞项必须有代码证据，不把偏好当缺陷
- `failureDomain`: 阻塞 `R1`；其他验证继续
- `replanTriggers`: 需要新文件、接口变化、行为范围扩大或测试删除
- `authorizationGate`: `pending`；能力信封 `ENV-V6`

### R1 — STYLE fan-in 审查

- `nodeId`: `R1`
- `taskBoundary`: `STYLE`
- `operationKind`: fan-in
- `outcome`: 两文件 diff、四项自动/静态验证、真实 GUI 与独立审查共同形成可提交结论。
- `estimatedCost`: S
- `deferralEvidence`: 无
- `hardPredecessors`: `V1`、`V2`、`V3`、`V4`、`V5`、`V6`；分别等待 format、Browser、lint、type-check、真实 GUI 与独立审查稳定证据
- `consumes`: STYLE diff、V1–V6 证据
- `produces`: 可提交 STYLE 审查结论
- `completionEvidence`: V1–V4 passed，V6 PASS，所有可达真实 GUI 场景 passed；V5 的 `UNEXECUTED` 明确列出且不被自动测试替代；diff allowlist 与设计映射完整
- `readSet`: 两个 STYLE 文件、完整 diff、验证记录
- `writeSet`: 空
- `stateEffects`: 只读 fan-in 结论
- `commandScope`: `git diff --check/name-status/<allowlist>` 与证据核对
- `subdelegation`: false
- `executionContext`: 当前 checkout
- `resourceLocks`: STYLE working tree read
- `owner`: 主协调者
- `verification`: 不允许通过删除覆盖、放宽断言、隐藏 overflow、增加 fallback 或修改基线解决失败
- `failureDomain`: 阻塞 `C1`；计划内失败插入最小修正节点并只重跑失效验证
- `replanTriggers`: 写集合扩大、接口/geometry/数据语义变化、独立 reorder 或证据冲突
- `authorizationGate`: `pending`；能力信封 `ENV-R1`

### C1 — 暂存并审查 STYLE diff

- `nodeId`: `C1`
- `taskBoundary`: `STYLE`
- `operationKind`: stage
- `outcome`: Git index 只包含两个 STYLE 文件，staged diff 与已验证 working diff 一致且无 whitespace 错误。
- `estimatedCost`: S
- `deferralEvidence`: 无
- `hardPredecessors`: `R1`；等待可提交审查结论
- `consumes`: 已验证 STYLE working diff
- `produces`: 已审查 STYLE staged diff
- `completionEvidence`: cached name-status 精确匹配两个文件，cached check 通过
- `readSet`: 两个 STYLE 文件、Git index
- `writeSet`: Git index 的两个 STYLE entries
- `stateEffects`: 精确暂存；不暂存 docs、research、cache 或其他文件
- `commandScope`: 精确 `git add -- <two files>`、cached diff/check/name-status；禁止 `git add .`
- `subdelegation`: false
- `executionContext`: 当前 checkout；Git index 独占
- `resourceLocks`: `.git/index` write
- `owner`: STYLE Git owner
- `verification`: staged allowlist 与已验证 working diff 一致
- `failureDomain`: 阻塞 `C2`
- `replanTriggers`: index 已含其他文件或 staged diff 与验证输入不一致
- `authorizationGate`: `pending`；能力信封 `ENV-C1`

### C2 — 提交 STYLE 行为修改

- `nodeId`: `C2`
- `taskBoundary`: `STYLE`
- `operationKind`: commit
- `outcome`: 形成只包含两个 STYLE 文件的独立本地行为提交。
- `estimatedCost`: S
- `deferralEvidence`: 无
- `hardPredecessors`: `C1`；等待已审查 staged diff
- `consumes`: STYLE staged diff
- `produces`: STYLE commit id
- `completionEvidence`: commit 成功且文件集合精确匹配 allowlist
- `readSet`: Git index、两个 STYLE 文件
- `writeSet`: Git object database、当前 branch ref、Git index
- `stateEffects`: 一个本地行为 commit；无 amend、squash、force 或 remote
- `commandScope`: `git commit -m 'feat(gui): align skill typeahead with Select popover'` 与只读 commit 检查
- `subdelegation`: false
- `executionContext`: 当前 checkout；branch/index 独占
- `resourceLocks`: `.git/index` write；当前 branch ref write；Git object database write
- `owner`: STYLE Git owner
- `verification`: commit message、parent、文件集合正确
- `failureDomain`: 阻塞 `Z1`；commit 后问题必须创建独立修正提交
- `replanTriggers`: hook 修改范围、commit 失败或 branch 漂移
- `authorizationGate`: `pending`；能力信封 `ENV-C2`

### Z1 — 最终状态与完成检查

- `nodeId`: `Z1`
- `taskBoundary`: 无提交的最终审查节点
- `operationKind`: 审查
- `outcome`: DOCS/STYLE commits、验证证据、Git 状态和真实 GUI 结论满足已确认计划。
- `estimatedCost`: S
- `deferralEvidence`: 无
- `hardPredecessors`: `C2`；等待 STYLE commit id
- `consumes`: 两个 commit ids、V1–V6 证据、最终 worktree/index
- `produces`: 终态用户报告
- `completionEvidence`: commits 可审计；index 无任务残留；范围外用户改动保持原状；无 remote；真实 GUI 条件状态未全执行时明确写“真实 GUI 未完整验收”
- `readSet`: Git status/log/show、验证记录
- `writeSet`: 空
- `stateEffects`: 只读终态报告
- `commandScope`: `git status --short --branch`、`git show --check --stat`、本地 `git log`
- `subdelegation`: false
- `executionContext`: 当前 checkout
- `resourceLocks`: Git metadata read
- `owner`: 主协调者
- `verification`: 完成标准、自动证据、真实 GUI passed/`UNEXECUTED` 和固定三项并行证据逐项核对
- `failureDomain`: 终止位置；已提交问题以独立修正节点/提交处理，禁止 amend
- `replanTriggers`: task 未完成、commit/diff/验证证据不一致
- `authorizationGate`: `pending`；能力信封 `ENV-Z1`

## Ready set、关键路径与 fan-out/fan-in

- 初始 ready set：仅 `P0`。
- 文档门禁：`P0 → D1 → D2`；`D2` 的 DOCS commit 是实现硬前置。
- 实现链：`D2 → E1 → F1`。
- 验证 fan-out：`F1` 完成后，`V1`、`V2`、`V3`、`V4`、`V5`、`V6` 同时进入 ready set。
- `V2` 与 `V4` 会写相交的 Vitest/TypeScript tsbuildinfo cache，因此由动态资源锁互斥；二者没有语义硬依赖，未持锁节点保持 ready。
- `V1` 只读 formatter input，`V3` 只写独立 eslint cache，`V5` 只写独立 visible-browser/debug state，`V6` 只读稳定 diff；无其他动态冲突时与当前 cache 持锁节点并行。
- 验证 fan-in：`R1` 等待 V1–V6。自动验证不得把真实 GUI `UNEXECUTED` 提升为 passed。
- 提交链：`R1 → C1 → C2 → Z1`。
- 粗粒度关键路径：DOCS commit → 两文件 STYLE edit → format → 最慢验证分支（通常真实 GUI 或三浏览器 Browser Mode）→ fan-in → STYLE commit → 终态审查。

## 资源与并行审计

- 不创建 worktree、branch 或额外 Git index：只有一个 STYLE task boundary，且 DOCS commit 是硬门禁；额外 worktree 不产生独立稳定产物，反而增加集成成本。
- E1 同时修改生产代码与直接 Browser 回归，二者共享同一个行为结果和选择器契约；拆成并行编辑会读取彼此的可变 shape，不产生可靠关键路径收益。
- V1–V6 只读取 F1 后的稳定 diff。资源锁只对实际相交的 cache、index、browser session 生效，不以节点编号制造串行。
- V5 使用 visible Chrome for Testing；V2 使用 Vitest provider 的 headless browser processes，当前证据未显示共享同一 canonical session。P0 若发现共享资源，两个节点保持 ready 并按实际锁互斥，不增加伪硬依赖。
- 当前没有有效 `deferralEvidence`。运行时若暂缓 ready 节点，必须记录预计并行收益、具体争用成本、复查触发点和失效条件。

## 失败与修正边界

- 任一验证失败只阻塞 `R1` 及其提交后继；其他无依赖验证继续完成。
- 计划内失败且不改变目标、文件范围、行为、接口、数据、安全或授权时，插入最小修正节点，更新受影响依赖并只重跑失效验证。
- 发现需要修改 Rust、protocol、query、catalog、全局 CSS、Composer geometry、package、依赖、测试配置或范围外文件时，停止受影响节点并重新计划。
- formatter 写范围外文件时停止；不得自动恢复、覆盖或提交用户变更。
- 工具或 browser binary 缺失时停止对应节点并告知用户自行安装；助手不得安装。
- runtime 缺失时只暂停 V5 与其 fan-in 后继，要求用户运行精确 `j c`；其他验证继续。
- 真实 collision、pending-input drawer/below placement、真实 catalog failure 或触控板状态若因当次环境不可达，只能记录 `UNEXECUTED`。所有可达受影响场景通过且无失败证据时允许进入提交，但最终必须明确写“真实 GUI 未完整验收”；不得用 Browser Mode、fixture、截图或脚本环境就绪替代。
- 禁止通过放宽断言、删除覆盖、提高阈值、关闭检查、隐藏 overflow、增加 fallback 或修改基线解决失败。

## 完成标准

- 两份工作文档先形成独立 DOCS commit，之后才开始实现。
- 两个 STYLE 文件形成独立行为 commit；无文档、order-only、依赖、生成物或范围外文件混入。
- 壳层 computed style 来自 HeroUI `selectVariants().popover()`，使用 overlay background、overlay shadow、大圆角、无外边框和 Select density。
- `Surface` 与 `ScrollShadow` wrapper 删除；只保留一个内部滚动 owner，所有滚动位置无 mask，细滚动条和 active 自动滚入保持有效。
- active 使用中性背景与 focus ring；hover 只使用中性背景；active + hover 不丢 ring；option 不获得真实 DOM focus。
- 菜单即时开合，无 enter/exit animation 或残留关闭生命周期。
- collision path、ARIA、IME、pointer/touch、drawer、响应式、catalog 状态和提交身份不回退。
- format、lint、type-check 与目标文件三浏览器 Browser Mode 通过；真实 GUI 所有可达场景通过，不可达项如实记录。
- 若真实 GUI 条件状态未全部执行，最终明确写“真实 GUI 未完整验收”。
- 最终报告分别列出：`实际并行`、`关键路径`、`未启动 ready 节点`；无 remote 操作。

本计划只完成计划落盘；等待用户明确确认后，才允许提交工作文档并进入实现。
