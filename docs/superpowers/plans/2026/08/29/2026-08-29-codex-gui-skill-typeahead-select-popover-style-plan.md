# Codex GUI Skill Typeahead 的 HeroUI Select Popover 与来源分类修订实施计划

日期：2026-08-29

状态：待确认，未执行

## 目标与设计来源

本计划只实现已确认设计：

- `docs/superpowers/specs/2026/08/29/2026-08-29-codex-gui-skill-typeahead-select-popover-style-design.md`

本计划以 `494d5efb3`（`feat(gui): align skill typeahead with Select popover`）为实现基线，只交付来源分类增量。在不改变该提交已落地的 HeroUI popover、单一滚动 owner、无 mask、density、active/hover、无动画，以及 Lexical focus/selection owner、canonical `name + path` 身份、碰撞算法、skill catalog、query、IME、队列和提交语义的前提下：

- 每条候选永久在主行右侧显示随当前 locale 变化的来源分类；
- 普通候选不显示 path，只有 canonical name 碰撞候选才在下一行显示最短唯一父 path；
- 保留既有 ARIA、pointer/touch、drawer、响应式与 Select popover 视觉契约。

## 当前事实闭包

- `494d5efb3` 已在 `SkillTypeaheadPlugin.tsx` 落地 `selectVariants().popover()`、单一 `overflow-y-auto` owner、无 `mask-image`、Select listbox/item density、中性 active/hover、focus ring 与即时开合；对应 Browser Mode 回归已存在。本轮只把这些结果作为必须保持的稳定基线，不重复实现。
- `SkillMetadata.scope` 已通过生成协议类型向前端提供 `user`、`repo`、`system`、`admin` 四种稳定分类；不需要修改 Rust、protocol、schema 或 generated TypeScript。
- `querySkills` 已为每个结果生成稳定英文 `sourceLabel`，并由 selection 路径写入 `SkillNode`。菜单当前却只在 `disambiguatingParentPath` 非空时显示 `{sourceLabel} · {disambiguatingParentPath}`，使非碰撞候选完全不显示来源，且把来源与 path 错误绑定为同一个可见条件。
- 本地化标签必须在 `SkillTypeaheadPlugin.tsx` 的渲染边界由 `candidate.scope` 穷尽映射，不得覆盖 `SkillQueryResult.sourceLabel`、写入 `SkillNode`、参与 key、排序、query、collision 或提交身份。
- `lingui.config.ts` 的权威 locale 为 `en` 与 `zh-CN`，catalog 路径为 `src/locales/{locale}.po`；`loadCatalog` 会按当前 locale 动态加载这些 PO。四个来源标签当前尚未存在于两份 catalog。
- 四个短标签具有产品域含义，必须使用可提取的 Lingui macro object form 并附 translator comment；中文翻译固定为“用户”“仓库”“系统”“管理员”。
- `ComposerEditor.browser.test.tsx` 已覆盖 editor focus/ARIA、HeroUI popover、drawer、collision path、overflow、active/hover、滚动、pointer/touch 和 skill catalog 状态；新断言在同一文件增量扩展。
- `ComposerEditor.browser.test.tsx` 被 `vitest.browser.parallel.config.ts` 收集，并在 Chromium、Firefox、WebKit 三个 instance 中执行。
- 本计划不修改 Rust、app-server、protocol、schema、generated TypeScript、query、unit tests、package scripts、依赖、lockfile 或测试配置。

## 预计修改范围

### 生产代码

- `codex-gui/src/features/composerEditor/SkillTypeaheadPlugin.tsx`
  - 使用 `useLingui` 的 macro object form，按 `candidate.scope` 穷尽生成 `User`、`Repository`、`System`、`Admin` 四个带 translator comment 的当前 locale 标签。
  - 主行改为“可收缩的名称/canonical name 区域 + 右侧不可挤出的来源分类”；来源分类每条候选始终显示。
  - 将 `disambiguatingParentPath` 保持为独立下一行：仅非空时显示最短唯一父 path，不再与来源分类拼接。
  - selection 继续把现有稳定 `sourceLabel` 写入 `SkillNode`；本地化标签只用于当前菜单渲染和 accessible name。
  - 不改现有 popover、scroll、active/hover 或 menu lifecycle 实现。

### Lingui catalog

- `codex-gui/src/locales/en.po`
- `codex-gui/src/locales/zh-CN.po`
  - 通过现有 `messages:extract` 权威入口提取四个来源标签及 translator comments。
  - `en` 保持源语言文案；`zh-CN` 填入已确认的“用户”“仓库”“系统”“管理员”。
  - 不手工伪造 source reference 或 message identity，不修改现有无关翻译。

### Browser Mode 测试

- `codex-gui/src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx`
  - 在 `en` 与 `zh-CN` 中证明四种 scope 始终显示对应来源标签，且来源标签进入 option accessible name。
  - 证明普通候选显示分类但不显示 path；canonical name 碰撞候选同时显示分类和现有最短唯一父 path，且 path 不与分类拼成同一文本。
  - 在两个 locale 下复用既有真实选择路径，证明 Enter 仍选择预期候选；option key、排序、`SkillNode.sourceLabel` 与机器 path 不变由“不修改 query/SkillNode”边界和独立 diff 审查闭合，不新增仅供测试的内部 seam。
  - 增加长 display/canonical name 与窄宽度断言，证明右侧分类保持可见、主行不横向溢出，碰撞 path 仍在独立下一行。
  - 保留并复用现有 popover、scroll、active/hover、drawer、pointer/touch、loading/error/retry/empty 回归，不复制已有断言。

## 明确不修改

- `codex-rs/**`、app-server、protocol、schema、generated TypeScript；
- `skillQuery.ts`、`skillQuery.test.ts`、skill catalog、collision、排序、20 项上限；
- `SkillNode`、clipboard、IME、queue、recovery、`turn/start`；
- Composer 外壳、菜单 placement、viewport owner 和 drawer 拓扑；
- 全局 CSS、`codex-gui/package.json`、`lingui.config.ts`、Vitest config、依赖或 lockfile；
- research 文档；
- Git remote。

## 权威实现约束

- HeroUI 与本地 source 的精确版本均为 3.2.4。
- `494d5efb3` 的 popover slot、原生 `ul/li`、单一 scroll owner、无 mask、density、active/hover 和无动画实现保持不变；本轮不得重构或重排这些代码。
- 继续复用既有 `selectVariants().popover()`、`listboxVariants({ variant: "default" })` 与 `listboxItemVariants({ variant: "default" })`；来源分类只是 option 内的非交互文本，不引入新的 HeroUI 交互组件。
- 来源分类使用 HeroUI 语义文本层级 `text-xs text-muted`，并以 `shrink-0` 保持右侧可见；名称区域使用 `min-w-0` 消化剩余宽度。继续使用原生 `span` 是因为它承载 option 内文本语义，Lexical/ARIA 仍是唯一交互 owner。
- `aria-selected="true"`、`data-active` 与 `aria-activedescendant` 继续指向同一个 Lexical active option。
- active ring 从 Lexical active 状态派生，不设置 `data-focus-visible="true"`，不把 DOM focus 移到 option。
- pointer hover 不写 React hover owner、不改变 active、不触发 active 回滚。
- `SkillMetadata.scope` 是来源分类身份的唯一权威；Lingui 标签只在渲染边界解析，稳定 `sourceLabel` 与 `SkillNode` 数据不本地化。
- 四种 scope 映射必须穷尽，不能新增 consumer-owned scope union、fallback 或 default label。
- 来源分类与 `disambiguatingParentPath` 使用独立渲染条件：分类永久显示，path 只在碰撞算法已有输出非空时显示。
- 机器 path 不翻译，不显示完整 `SKILL.md` path，不修改最短唯一父 path 算法。
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

权威 Lingui 提取入口：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run messages:extract
```

提取后只允许两份 locale PO 出现四个新消息及对应 source reference/comment；中文 `msgstr` 写入后再次运行同一入口，证明 catalog 稳定且没有无关清理。禁止使用 `messages:extract:clean`，避免把本次范围外的历史消息清理混入提交。

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
docs: revise skill typeahead source classification
```

### STYLE — 前端行为与直接回归

生产代码、Lingui catalog 与直接 Browser Mode 测试形成一个用户可见行为提交：

- `codex-gui/src/features/composerEditor/SkillTypeaheadPlugin.tsx`
- `codex-gui/src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx`
- `codex-gui/src/locales/en.po`
- `codex-gui/src/locales/zh-CN.po`

建议提交信息：

```text
feat(gui): show localized skill source labels
```

该提交不包含文档、order-only 调整、全局 CSS、依赖、协议生成物或范围外文件。两份 PO 是本次可见多语言行为的权威 source catalog，必须与源码同一 task boundary 提交。提交前必须完成计划内自动验证、真实 GUI 可达场景验收和独立审查。提交后发现的问题必须创建新的独立修正提交，禁止 amend。

## 待确认能力信封

以下能力信封只是增量计划期的最小授权草案，不产生当前执行授权。共享字段如下：

- `phase`: `plan-execution`
- `grantSource`: `pending`；只有用户后续明确确认本增量计划，运行时授权记录才可把该确认作为 grant source。
- `negativeConstraints`: 禁止代理主动修改未列入节点 `writeSet` 的文件，或把未列资源作为命令参数显式输出；禁止 remote、force、amend、squash、安装、依赖更新、baseline 更新、测试弱化、范围外修复、修改 `~/.codex/AGENTS.md`。已授权程序正常运行的内部自动文件副作用无需预判或枚举，也不授权代理随后主动操作这些产物。
- `specialApprovals`: `[]`
- `requiredApprovalIds`: `[]`
- `subdelegation`: `false`
- `lifecycle`: 增量计划确认前保持 pending；确认后仍须先满足工作文档提交门禁，节点仅在进入 ready、分配给唯一 owner 时激活；节点返回完成/失败、计划撤销、前提失效或触发重新计划时立即到期。
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
- `canonicalTargets`: 当前 checkout、Git index、两份 DOCS、四个 STYLE 文件、package/Lingui/Vitest/HeroUI 输入。
- `stateEffects`: 仅结构化证据。
- `commandScope`: P0 节点的只读命令集合。
- `replanTriggers`: checkout、规则、文件、工具、版本、dirty scope 或目标收集不一致。

### ENV-D1

- `objective`: 形成精确 DOCS staged snapshot。
- `operationKind`: stage
- `outcome`: index 仅包含两份 DOCS 且 staged check 通过。
- `grantedOperation`: 精确暂存工作文档。
- `allowedOperations`: 精确 `git add -- docs/superpowers/specs/2026/08/29/2026-08-29-codex-gui-skill-typeahead-select-popover-style-design.md docs/superpowers/plans/2026/08/29/2026-08-29-codex-gui-skill-typeahead-select-popover-style-plan.md`；读取 cached diff/check/name-status。
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

- `objective`: 在 `494d5efb3` 基线上实现本地化来源分类、path 分层及直接回归。
- `operationKind`: 编辑
- `outcome`: 生产组件与 Browser 测试形成完整源码 working diff。
- `grantedOperation`: 编辑精确两文件。
- `allowedOperations`: `apply_patch` 编辑；只读搜索与 diff 审查。
- `parameterBounds`: 当前 checkout；只实现常驻本地化分类和碰撞 path 分层；壳层、scroll、density、active/hover 与无动画均为禁止重构的既有基线。
- `readSet`: E1 节点所列设计、源码、测试、i18n 与 HeroUI 证据。
- `writeSet`: 两个源码文件。
- `canonicalTargets`: 两个源码文件的物理路径。
- `stateEffects`: 两文件工作树修改；不写 index。
- `commandScope`: E1 节点所列编辑/只读工具。
- `replanTriggers`: 需要新 CSS、第二 owner、query/SkillNode/protocol/package/config 或计划外文件。

### ENV-G1

- `objective`: 从已编辑源码机械提取四个来源标签。
- `operationKind`: 生成
- `outcome`: `en.po` 与 `zh-CN.po` 包含四个新消息、source reference 和 translator comments，且无范围外 catalog 清理。
- `grantedOperation`: 运行一次权威 Lingui 非 clean 提取并审查 catalog diff。
- `allowedOperations`: `messages:extract`；只读 Git diff/搜索审查。
- `parameterBounds`: cwd `codex-gui`；禁止 `messages:extract:clean`；只允许两份 locale PO 作为显式生成输出。
- `readSet`: `lingui.config.ts`、`src/**` macro 输入、两份现有 PO。
- `writeSet`: `codex-gui/src/locales/en.po`、`codex-gui/src/locales/zh-CN.po`。
- `canonicalTargets`: 两份 locale PO 的物理路径。
- `stateEffects`: 两份 source catalog 更新；不写 index。
- `commandScope`: G1 节点所列 fnm-backed `pnpm run messages:extract` 与只读审查。
- `replanTriggers`: 提取清理历史消息、修改计划外文件、缺失四个消息/comment 或 catalog 配置漂移。

### ENV-E2

- `objective`: 完成四个来源标签的简体中文翻译。
- `operationKind`: 编辑
- `outcome`: `zh-CN.po` 四个新条目分别为“用户”“仓库”“系统”“管理员”，`en.po` 保持源文案。
- `grantedOperation`: 只编辑四个新消息的 `zh-CN` `msgstr`。
- `allowedOperations`: `apply_patch` 精确编辑；只读 catalog diff/搜索。
- `parameterBounds`: 不修改 message id、comment、source reference 或既有翻译。
- `readSet`: G1 生成的两份 PO、确认设计。
- `writeSet`: `codex-gui/src/locales/zh-CN.po`。
- `canonicalTargets`: `zh-CN.po` 的物理路径。
- `stateEffects`: 四个新翻译写入；不写 index。
- `commandScope`: E2 节点所列编辑/只读工具。
- `replanTriggers`: 消息身份不唯一、提取结果缺失或需要改动既有翻译。

### ENV-G2

- `objective`: 证明完成翻译后的 source catalogs 与源码提取结果一致。
- `operationKind`: 生成
- `outcome`: 第二次非 clean 提取退出 0，四个翻译保留，且命令前后 catalog diff 不新增变化。
- `grantedOperation`: 再运行一次权威 Lingui 非 clean 提取并比较前后 diff。
- `allowedOperations`: `messages:extract`；只读 Git diff/搜索审查。
- `parameterBounds`: cwd `codex-gui`；禁止 clean、compile、依赖或配置修改。
- `readSet`: `lingui.config.ts`、`src/**` macro 输入、两份已翻译 PO。
- `writeSet`: `codex-gui/src/locales/en.po`、`codex-gui/src/locales/zh-CN.po`。
- `canonicalTargets`: 两份 locale PO 的物理路径。
- `stateEffects`: 权威提取器可能重写两份 PO；最终内容必须与命令前一致。
- `commandScope`: G2 节点所列 fnm-backed `pnpm run messages:extract` 与只读前后 diff 审查。
- `replanTriggers`: 翻译丢失、catalog 继续漂移、出现计划外输出或需要 clean/compile/config 修改。

### ENV-F1

- `objective`: 用权威 formatter 规范化 STYLE diff。
- `operationKind`: 格式化
- `outcome`: 四文件 STYLE allowlist 格式化且无范围外保留修改。
- `grantedOperation`: 运行一次 live oxfmt fix 并审查结果。
- `allowedOperations`: `format:oxfmt:fix`；只读 Git diff allowlist 审查。
- `parameterBounds`: cwd `codex-gui`；仅允许保留四个 STYLE 文件变化。
- `readSet`: formatter inputs 与四个 STYLE 文件。
- `writeSet`: 四个 STYLE 文件；formatter 正常运行的内部自动文件副作用无需预判或枚举，范围外变化不得作为后续主动操作目标。
- `canonicalTargets`: `codex-gui` formatter inputs 与四个 STYLE 文件。
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
- `readSet`: 四个 STYLE 文件、Browser config、两份 locale PO 与依赖。
- `writeSet`: `[]`
- `canonicalTargets`: 目标 Browser file、parallel config 与 Playwright provider。
- `stateEffects`: headless browser processes 与验证输出；程序内部自动文件副作用无需预判或枚举。
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
- `writeSet`: `[]`
- `canonicalTargets`: lint inputs/config 与 lint runner。
- `stateEffects`: lint 进程与验证输出；程序内部自动文件副作用无需预判或枚举。
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
- `writeSet`: `[]`
- `canonicalTargets`: TS graph、generated types 与 TypeScript runner。
- `stateEffects`: TypeScript 进程与验证输出；程序内部自动文件副作用无需预判或枚举。
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
- `writeSet`: `[]`
- `canonicalTargets`: 当次 GUI task 与 Chrome for Testing session。
- `stateEffects`: 用户可见 browser 交互与验收输出；程序内部自动文件副作用无需预判或枚举。
- `commandScope`: V5 节点所列固化入口与 playwright-cli。
- `replanTriggers`: runtime/URL 不可用则暂停等待外部状态；真实结构推翻计划、需 fixture/代码写入或 geometry 扩大则重新计划。

### ENV-V6

- `objective`: 独立审查设计忠实度、范围与测试强度。
- `operationKind`: 审查
- `outcome`: PASS 或精确阻塞项。
- `grantedOperation`: 只读稳定 diff 审查。
- `allowedOperations`: 读取设计/代码/tests/i18n catalogs/config/HeroUI source；运行只读 diff/search。
- `parameterBounds`: 只读取 F1 稳定状态；不得修改或运行测试。
- `readSet`: V6 节点所列四文件稳定 diff 与权威证据。
- `writeSet`: `[]`
- `canonicalTargets`: 四个 STYLE 文件与确认设计。
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
- `readSet`: 四个 STYLE 文件、V1–V6 输出。
- `writeSet`: `[]`
- `canonicalTargets`: STYLE diff 与验证记录。
- `stateEffects`: 结构化 fan-in 结论。
- `commandScope`: R1 节点所列只读 Git 命令。
- `replanTriggers`: 写集合、接口、geometry、语义、reorder 或证据冲突。

### ENV-C1

- `objective`: 形成精确 STYLE staged snapshot。
- `operationKind`: stage
- `outcome`: index 仅包含四个 STYLE 文件且 staged check 通过。
- `grantedOperation`: 精确暂存已验证 STYLE diff。
- `allowedOperations`: 精确 `git add -- <four files>`；读取 cached diff/check/name-status。
- `parameterBounds`: 当前 checkout；禁止 `git add .`；只消费 R1 已验证 diff。
- `readSet`: 四个 STYLE 文件、Git index。
- `writeSet`: Git index 的四个 STYLE entries。
- `canonicalTargets`: `/Users/jiangsheng/cnb/codex/.git/index` 与四个 STYLE 文件。
- `stateEffects`: index 精确变化。
- `commandScope`: C1 节点所列 Git 命令。
- `replanTriggers`: index 含其他文件或 staged snapshot 与验证输入不一致。

### ENV-C2

- `objective`: 创建独立 STYLE 行为提交。
- `operationKind`: commit
- `outcome`: 一个只含四个 STYLE 文件的本地 commit。
- `grantedOperation`: 提交已审查 STYLE snapshot。
- `allowedOperations`: 指定 message 的一次本地 commit；只读检查 commit。
- `parameterBounds`: 只消费 C1 snapshot；一个 commit；无 amend/squash。
- `readSet`: Git index、四个 STYLE 文件。
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

以下节点是待确认增量计划的权威执行结构。当前所有节点的 `authorizationGate.status` 均为 `pending`；用户明确确认计划后仍须满足硬前置、稳定产物和资源锁才能进入 ready set。

### P0 — 执行环境与范围预检

- `nodeId`: `P0`
- `taskBoundary`: 无提交的调查节点
- `operationKind`: 调查
- `outcome`: checkout、适用规则、fnm/pnpm、两份 DOCS、四个 STYLE 文件、Lingui/HeroUI/Vitest 本地证据、目标测试收集与 `494d5efb3` Git baseline 等共享前提可信；Browser provider 状态按分支记录，不把 GUI runtime/URL 设为全图前提。
- `estimatedCost`: S
- `deferralEvidence`: 无
- `hardPredecessors`: 无
- `consumes`: 已确认计划、当前 checkout、live package scripts、目标文件
- `produces`: 共享 preflight 证据、canonical resource lock 表与 V2/V5 分支资源状态
- `completionEvidence`: cwd/root、branch、status、`494d5efb3` 为当前增量基线、工具来源、目标文件、`messages:extract`/format/lint/type-check scripts、两 locale 配置、HeroUI 3.2.4、Vitest target collection 与共享资源路径核验成功；Browser provider 缺口只标记 V2 分支状态，GUI runtime/URL 留给 V5 当次获取
- `readSet`: AGENTS/skills、两份 DOCS、四个 STYLE 文件、`skillQuery.ts`、`SkillNode.ts`、package.json、Lingui/Vitest configs、HeroUI local source/docs、Git status/index/log
- `writeSet`: 空
- `stateEffects`: 只读输出；无工作树、index、commit、remote 变化
- `commandScope`: `git status/rev-parse/check-ignore`、`rg`、`sed`、fnm/pnpm version、目标收集配置只读检查
- `subdelegation`: false
- `executionContext`: 当前 `/Users/jiangsheng/cnb/codex` checkout；不创建 worktree、branch 或额外 index
- `resourceLocks`: repository worktree read；Git index read
- `owner`: 主协调者
- `verification`: 空搜索或命令退出 0 不能替代目标命中；必须证明 parallel Browser config 声明收集目标文件及三个 browser instance；binary 可用性由 V2 执行分支判定
- `failureDomain`: 共享 checkout、`494d5efb3` 基线、规则、文件、工具来源、Lingui/HeroUI 版本或 target config 失败时阻塞 `D1` 及全部实现后继；Browser provider/binary 缺口只暂停 V2 与其 fan-in 后继，不阻塞 DOCS/E1；GUI runtime/URL 不属于 P0 失败域
- `replanTriggers`: branch、baseline、规则、文件、工具链、dirty scope、Lingui/HeroUI 版本或 runner 输入与计划不一致
- `authorizationGate`: `pending`；能力信封 `ENV-P0`

### D1 — 暂存并审查工作文档

- `nodeId`: `D1`
- `taskBoundary`: `DOCS`
- `operationKind`: stage
- `outcome`: Git index 只包含两份本轮更新的设计/计划文档，staged diff 无 whitespace 错误。
- `estimatedCost`: S
- `deferralEvidence`: 无
- `hardPredecessors`: `P0`；等待可信 checkout 与 allowlist
- `consumes`: 两份已落盘 DOCS、P0 证据
- `produces`: 已审查 DOCS staged diff
- `completionEvidence`: cached name-status 精确匹配 allowlist，`git diff --cached --check` 通过
- `readSet`: 两份 DOCS、Git index、`.gitignore`
- `writeSet`: 当前 checkout Git index 的两份 DOCS entries
- `stateEffects`: 精确暂存；不修改文档正文
- `commandScope`: 精确 `git add -- docs/superpowers/specs/2026/08/29/2026-08-29-codex-gui-skill-typeahead-select-popover-style-design.md docs/superpowers/plans/2026/08/29/2026-08-29-codex-gui-skill-typeahead-select-popover-style-plan.md`、cached diff/check/name-status
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
- `commandScope`: `git commit -m 'docs: revise skill typeahead source classification'` 与只读 commit 检查
- `subdelegation`: false
- `executionContext`: 当前 checkout；branch/index 独占
- `resourceLocks`: `.git/index` write；当前 branch ref write；Git object database write
- `owner`: DOCS Git owner
- `verification`: commit message、parent 和文件集合正确
- `failureDomain`: 阻塞 `E1` 及全部实现节点；提交失败不得绕过工作文档门禁
- `replanTriggers`: hook 修改范围、commit 集合或 branch 漂移
- `authorizationGate`: `pending`；能力信封 `ENV-D2`

### E1 — 实现本地化来源分类与 path 分层

- `nodeId`: `E1`
- `taskBoundary`: `STYLE`
- `operationKind`: 编辑
- `outcome`: 两个源码文件在保持 `494d5efb3` 视觉与交互基线的同时，实现常驻来源分类和碰撞 path 分层契约。
- `estimatedCost`: M
- `deferralEvidence`: 无
- `hardPredecessors`: `D2`；实现只能消费已提交工作文档
- `consumes`: DOCS commit、HeroUI 3.2.4 slots/styles、生成协议中的 `SkillMetadata.scope`、现有组件、i18n 入口与 Browser tests
- `produces`: 两文件源码 working diff 与四个待提取 Lingui 消息
- `completionEvidence`: diff 仅触及两个源码文件；四种 scope 在渲染边界穷尽本地化；分类永久位于主行右侧；path 只消费既有 `disambiguatingParentPath`；直接回归断言覆盖 en/zh-CN、accessible name、长名称/窄宽度、collision 与 identity 不变；既有 popover/scroll/active 实现无重排
- `readSet`: 两个源码文件、已确认设计、HeroUI local source/docs、`skillQuery.ts`、`SkillNode.ts`、i18n/catalog/config、Browser config
- `writeSet`: 两个源码文件
- `stateEffects`: 前端源码与直接 Browser test 修改；不操作 Git index
- `commandScope`: `apply_patch` 与只读 `rg`/`sed`/`git diff`
- `subdelegation`: false
- `executionContext`: 当前 checkout；STYLE working tree
- `resourceLocks`: 两个源码文件 write
- `owner`: STYLE 编辑节点执行者
- `verification`: 局部 diff、来源/path 条件拆分、稳定 `sourceLabel` 数据流与设计验收映射；正式验证由 V 节点执行
- `failureDomain`: 阻塞 `G1` 及全部 STYLE 后继
- `replanTriggers`: 需要新 CSS、第二 focus/scroll owner、query/SkillNode/protocol/package/config 或计划外文件
- `authorizationGate`: `pending`；能力信封 `ENV-E1`

### G1 — 提取 Lingui 来源标签

- `nodeId`: `G1`
- `taskBoundary`: `STYLE`
- `operationKind`: 生成
- `outcome`: 权威 Lingui 提取器把四个来源标签与 translator comments 写入两份 locale PO，且没有清理或改写无关消息。
- `estimatedCost`: S
- `deferralEvidence`: 无
- `hardPredecessors`: `E1`；等待可提取的稳定源码消息
- `consumes`: 两个源码文件、`lingui.config.ts`、现有 PO
- `produces`: 两份 PO 的机械提取 diff
- `completionEvidence`: 四个 msgid 在 `en.po`/`zh-CN.po` 各唯一出现；source reference 指向 `SkillTypeaheadPlugin.tsx`；每项有 translator comment；无无关删除或计划外输出
- `readSet`: `codex-gui/src/**`、`lingui.config.ts`、两份 PO
- `writeSet`: `codex-gui/src/locales/en.po`、`codex-gui/src/locales/zh-CN.po`
- `stateEffects`: 两份 source catalog 生成更新；不操作 index
- `commandScope`: `/opt/homebrew/bin/fnm exec --using-file pnpm run messages:extract` 与只读 catalog diff/search；禁止 clean
- `subdelegation`: false
- `executionContext`: 当前 checkout；`codex-gui` cwd
- `resourceLocks`: 两份 PO write；Lingui extractor exclusive
- `owner`: STYLE catalog generation owner
- `verification`: 逐项核对 msgid、comment、reference 与范围；命令退出 0 不替代消息命中
- `failureDomain`: 阻塞 `E2` 及全部 STYLE 后继
- `replanTriggers`: 历史消息被清理、计划外文件变化、四项不完整或 config 漂移
- `authorizationGate`: `pending`；能力信封 `ENV-G1`

### E2 — 写入简体中文来源翻译

- `nodeId`: `E2`
- `taskBoundary`: `STYLE`
- `operationKind`: 编辑
- `outcome`: `zh-CN.po` 的四个新条目分别写入“用户”“仓库”“系统”“管理员”。
- `estimatedCost`: S
- `deferralEvidence`: 无
- `hardPredecessors`: `G1`；等待稳定 message identity 与 source reference
- `consumes`: G1 两份 PO diff、确认设计
- `produces`: 已翻译的 `zh-CN.po`
- `completionEvidence`: 只改四个新条目的 `msgstr`；`en.po` 源文案、msgid、comment、reference 与既有翻译均不变
- `readSet`: 两份 PO、确认设计
- `writeSet`: `codex-gui/src/locales/zh-CN.po`
- `stateEffects`: 四个新 `zh-CN` 翻译；不操作 index
- `commandScope`: `apply_patch` 与只读 `rg`/`sed`/`git diff`
- `subdelegation`: false
- `executionContext`: 当前 checkout
- `resourceLocks`: `zh-CN.po` write
- `owner`: STYLE translation owner
- `verification`: 精确 msgid/msgstr/comment 对照
- `failureDomain`: 阻塞 `G2` 及全部 STYLE 后继
- `replanTriggers`: 消息身份不唯一、需改既有翻译或设计文案冲突
- `authorizationGate`: `pending`；能力信封 `ENV-E2`

### G2 — 复验 Lingui 提取稳定性

- `nodeId`: `G2`
- `taskBoundary`: `STYLE`
- `operationKind`: 生成
- `outcome`: 第二次非 clean 提取不产生新增 diff，且保留四个中文翻译。
- `estimatedCost`: S
- `deferralEvidence`: 无
- `hardPredecessors`: `E2`；等待完整 catalog 翻译
- `consumes`: 两个源码文件、两份已翻译 PO、`lingui.config.ts`
- `produces`: catalog 与源码一致的稳定证据
- `completionEvidence`: 命令退出 0；命令前后四文件 diff 相同；四个 `zh-CN` `msgstr` 保留
- `readSet`: `codex-gui/src/**`、`lingui.config.ts`、两份 PO
- `writeSet`: `codex-gui/src/locales/en.po`、`codex-gui/src/locales/zh-CN.po`
- `stateEffects`: extractor 可能重写 PO；最终必须无新增变化
- `commandScope`: `/opt/homebrew/bin/fnm exec --using-file pnpm run messages:extract` 与只读前后 diff；禁止 clean/compile
- `subdelegation`: false
- `executionContext`: 当前 checkout；`codex-gui` cwd
- `resourceLocks`: 两份 PO write；Lingui extractor exclusive
- `owner`: STYLE catalog generation owner
- `verification`: 以命令前后 diff identity 和翻译保留为完成证据
- `failureDomain`: 阻塞 `F1` 及全部 STYLE 后继
- `replanTriggers`: catalog 继续漂移、翻译丢失或出现计划外输出
- `authorizationGate`: `pending`；能力信封 `ENV-G2`

### F1 — 权威前端格式化

- `nodeId`: `F1`
- `taskBoundary`: `STYLE`
- `operationKind`: 格式化
- `outcome`: 四个 STYLE 文件符合 live oxfmt，且 formatter 未留下范围外修改或独立 order-only 调整。
- `estimatedCost`: S
- `deferralEvidence`: 无
- `hardPredecessors`: `G2`；等待完整、提取稳定的 STYLE working diff
- `consumes`: 四个 STYLE 文件、live formatter script/config
- `produces`: 格式化后的稳定 STYLE working tree
- `completionEvidence`: formatter 成功；实际 diff 仍精确匹配 STYLE allowlist；无独立 reorder
- `readSet`: `codex-gui/**` formatter inputs、四个 STYLE 文件
- `writeSet`: 四个 STYLE 文件；formatter 正常运行的内部自动文件副作用无需预判或枚举，范围外变化不得作为后续主动操作目标
- `stateEffects`: 格式化工作树；不操作 index
- `commandScope`: `/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt:fix`，随后只读 diff allowlist 审查
- `subdelegation`: false
- `executionContext`: 当前 checkout；`codex-gui` cwd
- `resourceLocks`: `codex-gui` formatter write；四个 STYLE 文件 write
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
- `outcome`: `ComposerEditor.browser.test.tsx` 在 Chromium、Firefox、WebKit 中通过并命中来源分类增量及既有视觉、滚动、ARIA 与交互契约。
- `estimatedCost`: M
- `deferralEvidence`: 无
- `hardPredecessors`: `F1`
- `consumes`: STYLE diff、parallel Browser config、Playwright provider
- `produces`: 三 browser instance 的组件级回归证据
- `completionEvidence`: 目标文件在三个实例均被收集，非零测试数且全部通过；en/zh-CN 四 scope、非碰撞/碰撞分层、accessible name、长名称/窄宽度和既有 Enter 选择路径均命中；既有 computed style/scroll/interaction 回归继续通过
- `readSet`: 四个 STYLE 文件、Browser config、两份 locale PO、组件依赖
- `writeSet`: 空
- `stateEffects`: headless browser processes 与验证输出；程序内部自动文件副作用无需预判或枚举
- `commandScope`: `/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run --config=vitest.browser.parallel.config.ts src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx`
- `subdelegation`: false
- `executionContext`: 当前 checkout；`codex-gui` cwd
- `resourceLocks`: Vitest Browser Mode runner exclusive；Playwright provider processes execute；shared TypeScript browser-project incremental state write
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
- `writeSet`: 空
- `stateEffects`: lint 进程与验证输出；程序内部自动文件副作用无需预判或枚举
- `commandScope`: `/opt/homebrew/bin/fnm exec --using-file pnpm run lint`
- `subdelegation`: false
- `executionContext`: 当前 checkout；`codex-gui` cwd
- `resourceLocks`: source/config read；lint runner exclusive
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
- `writeSet`: 空
- `stateEffects`: TypeScript 进程与验证输出；程序内部自动文件副作用无需预判或枚举
- `commandScope`: `/opt/homebrew/bin/fnm exec --using-file pnpm run type-check`
- `subdelegation`: false
- `executionContext`: 当前 checkout；`codex-gui` cwd
- `resourceLocks`: TS graph read；TypeScript runner exclusive；shared TypeScript browser-project incremental state write
- `owner`: V4 验证执行者
- `verification`: 退出状态与 noEmit
- `failureDomain`: 阻塞 `R1`；其他验证继续
- `replanTriggers`: 类型修正需要 protocol、generated file 或范围外修改
- `authorizationGate`: `pending`；能力信封 `ENV-V4`

### V5 — 真实 GUI 验收

- `nodeId`: `V5`
- `taskBoundary`: `STYLE`
- `operationKind`: 验证
- `outcome`: 在 visible Google Chrome for Testing 中分别记录本次来源分类直接受影响场景的 passed 证据及不可达状态的 `UNEXECUTED` 证据。
- `estimatedCost`: M
- `deferralEvidence`: 无
- `hardPredecessors`: `F1`
- `consumes`: STYLE working tree、当次 GUI URL、真实 catalog、visible Chrome for Testing
- `produces`: 真实 GUI passed/failed/`UNEXECUTED` 分离记录
- `completionEvidence`: 可达的 en/zh-CN 来源分类、普通候选常驻分类无 path、真实 collision 分类与最短唯一父 path 分行、accessible name、长名称/窄屏分类可见、active/hover/scroll 后分类持续可见、Enter 目标与无横向 overflow 均有记录；条件不可达项列明生产入口与原因。旧 light/dark、above/below、开合和 placement 视觉由既有自动回归守护，不作为本轮真实 GUI gate
- `readSet`: 运行中的真实 GUI、DOM/AX/geometry/computed styles
- `writeSet`: 空
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
- `outcome`: 独立审查四文件稳定 diff 是否忠实实现增量设计，没有范围外行为、本地化数据渗入 identity、碰撞算法变化或测试弱化。
- `estimatedCost`: S
- `deferralEvidence`: 无
- `hardPredecessors`: `F1`
- `consumes`: 稳定 STYLE diff、确认设计、现有行为契约
- `produces`: PASS 或带精确路径/行号的阻塞项
- `completionEvidence`: 对四 scope 映射、translator comments、PO 翻译、常驻分类、path 条件、accessible name、长名称、identity/collision/ARIA/IME 保留、`494d5efb3` 基线和测试强度逐项审查
- `readSet`: 四个 STYLE 文件、设计、`skillQuery.ts`、`SkillNode.ts`、i18n 配置与相关 tests
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
- `outcome`: 四文件 diff、四项自动/静态验证、真实 GUI 与独立审查共同形成可提交结论。
- `estimatedCost`: S
- `deferralEvidence`: 无
- `hardPredecessors`: `V1`、`V2`、`V3`、`V4`、`V5`、`V6`；分别等待 format、Browser、lint、type-check、真实 GUI 与独立审查稳定证据
- `consumes`: STYLE diff、V1–V6 证据
- `produces`: 可提交 STYLE 审查结论
- `completionEvidence`: V1–V4 passed，V6 PASS，所有可达真实 GUI 场景 passed；V5 的 `UNEXECUTED` 明确列出且不被自动测试替代；diff allowlist 与设计映射完整
- `readSet`: 四个 STYLE 文件、完整 diff、验证记录
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
- `outcome`: Git index 只包含四个 STYLE 文件，staged diff 与已验证 working diff 一致且无 whitespace 错误。
- `estimatedCost`: S
- `deferralEvidence`: 无
- `hardPredecessors`: `R1`；等待可提交审查结论
- `consumes`: 已验证 STYLE working diff
- `produces`: 已审查 STYLE staged diff
- `completionEvidence`: cached name-status 精确匹配四个文件，cached check 通过
- `readSet`: 四个 STYLE 文件、Git index
- `writeSet`: Git index 的四个 STYLE entries
- `stateEffects`: 精确暂存；不暂存 docs、research、cache 或其他文件
- `commandScope`: 精确 `git add -- codex-gui/src/features/composerEditor/SkillTypeaheadPlugin.tsx codex-gui/src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx codex-gui/src/locales/en.po codex-gui/src/locales/zh-CN.po`、cached diff/check/name-status；禁止 `git add .`
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
- `outcome`: 形成只包含四个 STYLE 文件的独立本地行为提交。
- `estimatedCost`: S
- `deferralEvidence`: 无
- `hardPredecessors`: `C1`；等待已审查 staged diff
- `consumes`: STYLE staged diff
- `produces`: STYLE commit id
- `completionEvidence`: commit 成功且文件集合精确匹配 allowlist
- `readSet`: Git index、四个 STYLE 文件
- `writeSet`: Git object database、当前 branch ref、Git index
- `stateEffects`: 一个本地行为 commit；无 amend、squash、force 或 remote
- `commandScope`: `git commit -m 'feat(gui): show localized skill source labels'` 与只读 commit 检查
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
- 增量实现链：`D2 → E1 → G1 → E2 → G2 → F1`；`G1/G2` 是权威 catalog 提取，`E2` 只写四个新 `zh-CN` 翻译。
- 验证 fan-out：`F1` 完成后，`V1`、`V2`、`V3`、`V4`、`V5`、`V6` 同时进入 ready set。
- `V1`–`V6` 没有语义硬依赖；程序内部自动 cache 不进入 `writeSet`。V2 与 V4 都会消费同一个 TypeScript browser project 的增量状态，因此同时 ready 但由 shared TypeScript browser-project resource lock 互斥，不增加 hard predecessor；V3 使用独立 lint runner，V5 独占 visible Chrome for Testing session，V6 只读稳定 diff，其余无真实资源冲突时同时调度。
- 验证 fan-in：`R1` 等待 V1–V6。自动验证不得把真实 GUI `UNEXECUTED` 提升为 passed。
- 提交链：`R1 → C1 → C2 → Z1`。
- 粗粒度关键路径：DOCS commit → 两文件源码 edit → catalog 提取 → zh-CN 翻译 → catalog 稳定复验 → format → 最慢验证分支（通常真实 GUI 或三浏览器 Browser Mode）→ fan-in → 四文件 STYLE commit → 终态审查。

## 资源与并行审计

- 不创建 worktree、branch 或额外 Git index：只有一个 STYLE task boundary，且 DOCS commit 是硬门禁；额外 worktree 不产生独立稳定产物，反而增加集成成本。
- E1 同时修改生产代码与直接 Browser 回归，二者共享来源/path DOM shape、accessible name 和 identity 断言；拆成并行编辑会读取彼此的可变 shape，不产生可靠关键路径收益。
- G1 必须等待 E1 的稳定 macro 输入，E2 必须等待 G1 生成的 message identity，G2 必须等待 E2 的译文；这些边分别消费源码、提取产物和翻译稳定状态，不是文档顺序制造的串行。
- V1–V6 只读取 F1 后的稳定 diff。资源锁只对实际相交的 cache、index、browser session 生效，不以节点编号制造串行。
- V5 使用 visible Chrome for Testing；V2 使用 Vitest provider 的 headless browser processes，当前证据未显示共享同一 canonical session。P0 若发现共享资源，两个节点保持 ready 并按实际锁互斥，不增加伪硬依赖。
- 当前没有有效 `deferralEvidence`。运行时若暂缓 ready 节点，必须记录预计并行收益、具体争用成本、复查触发点和失效条件。

## 失败与修正边界

- 任一验证失败只阻塞 `R1` 及其提交后继；其他无依赖验证继续完成。
- 计划内失败且不改变目标、文件范围、行为、接口、数据、安全或授权时，插入最小修正节点，更新受影响依赖并只重跑失效验证。
- 发现需要修改 Rust、protocol、query、skill catalog、collision、`SkillNode`、全局 CSS、Composer geometry、package、依赖、测试配置或四文件外资源时，停止受影响节点并重新计划。
- `messages:extract` 若清理历史消息、改写无关翻译或产生四文件外输出，停止 G1/G2 及其后继；不得改用手工伪造 PO identity、跳过提取或使用 clean 模式。
- formatter 写范围外文件时停止；不得自动恢复、覆盖或提交用户变更。
- 工具或 browser binary 缺失时停止对应节点并告知用户自行安装；助手不得安装。
- runtime 缺失时只暂停 V5 与其 fan-in 后继，要求用户运行精确 `j c`；其他验证继续。
- `zh-CN` locale、四种真实 scope、真实 collision、长名称/窄宽或 active/hover/scroll 后分类持续可见场景若因当次环境不可达，只能记录 `UNEXECUTED`。所有可达受影响场景通过且无失败证据时允许进入提交，但最终必须明确写“真实 GUI 未完整验收”；不得用 Browser Mode、fixture、截图或脚本环境就绪替代。
- 禁止通过放宽断言、删除覆盖、提高阈值、关闭检查、隐藏 overflow、增加 fallback 或修改基线解决失败。

## 完成标准

- 两份工作文档先形成独立 DOCS commit，之后才开始实现。
- 四个 STYLE 文件形成独立行为 commit；无文档、order-only、依赖、协议生成物或范围外文件混入。
- 每条候选在 `en` 与 `zh-CN` 下永久显示正确来源分类；四个短消息均有 translator comment，catalog 再提取稳定。
- 普通候选不显示 path；canonical name 碰撞候选保留分类并在独立下一行显示现有最短唯一父 path；不显示完整 `SKILL.md` path。
- 来源分类进入 option accessible name；长名称和窄宽度下右侧分类保持可见且无横向 overflow。
- locale 切换只改变当前菜单标签；Browser 回归保持既有 Enter 选择路径，独立 diff 审查证明 query、option identity、排序、稳定 `sourceLabel`、`SkillNode` 和机器 path 未被修改。
- `494d5efb3` 已落地的 HeroUI popover、单一滚动 owner、无 mask、density、active/hover、无动画，以及 ARIA、IME、pointer/touch、drawer、响应式、skill catalog 状态和提交身份均不回退。
- format、lint、type-check 与目标文件三浏览器 Browser Mode 通过；真实 GUI 所有可达场景通过，不可达项如实记录。
- 若真实 GUI 条件状态未全部执行，最终明确写“真实 GUI 未完整验收”。
- 最终报告分别列出：`实际并行`、`关键路径`、`未启动 ready 节点`；无 remote 操作。

本计划只完成增量计划落盘；等待用户明确确认后，才允许提交本轮工作文档，且 DOCS commit 成功后才能进入 `E1` 实现节点。
