# Codex GUI Composer 已选择 Skill 显示与详情实施计划

日期：2026-08-30

状态：已确认，待执行

## 目标与设计来源

本计划只实施已确认设计：

- [Codex GUI Composer 已选择 Skill 显示与详情设计](../../../../specs/2026/08/30/2026-08-30-codex-gui-composer-selected-skill-display-design.md)

目标是在不改变 Skill canonical identity、Composer draft、clipboard、invalid 判断与 `{type: "skill", name, path}` 提交语义的前提下，把正文原位置的已选择 Skill token 迁移为真实 HeroUI `Chip`，并以整个 `Chip` 作为 HeroUI `Tooltip` 的 hover/focus trigger 显示 catalog 只读详情。

本计划不恢复 `TagGroup`、`Popover`、`Dialog`、关闭按钮、点击固定或可靠触摸展开，不读取完整 `SKILL.md`，不新增 Rust、RPC、schema、generated protocol、依赖或第二套 selection/open-state owner。

## 当前事实闭包

### 六字段证据摘要

- **权威入口：** generated `SkillMetadata` 经 `skillCatalogOwner.ts` 形成 `SkillCatalogState.candidates`；`ComposerEditor.tsx` 是普通 Composer 与 `ComposerPendingInputEditor.tsx` 共用的真实编辑器入口；`SkillNode.ts` 保存 canonical `name + path` 与显示快照；`composerDraft.ts` 编译 `UserInput.Skill`。
- **已追踪链路：** `SkillTypeaheadPlugin.tsx` 插入节点；`ComposerEditor.tsx` 提供 catalog、invalid、disabled 与单一 editor-local collision-index 生命周期；`composerDraft.ts` 负责 capture/restore/compile；`ComposerClipboardPlugin.tsx` 负责 plain/HTML/Lexical clipboard；`ComposerTurnControl` 与 pending-input editor 复用同一编辑器；queue、`turn/start` 与 `turn/steer` 只消费既有 capture output。
- **修改范围：** 仅修改 `composerEditor` 的节点、presentation、editing、draft、clipboard、path/detail projection 与对应 tests，并机械更新 `src/locales/en.po`、`zh-CN.po`；pending editor 不新增 production 分支，只用 Browser 回归证明共享入口。
- **验证映射：** `SkillNode.test.ts`、`composerDraft.test.ts` 与 presentation unit test 覆盖 wire/data；`ComposerEditor.browser.test.tsx` 覆盖真实 Chip/Tooltip、NodeSelection、keyboard、catalog 与几何；顺序 clipboard test 覆盖系统 clipboard；`ComposerTurnControl.browser.test.tsx` 覆盖普通与 pending editor；三浏览器 Browser Mode、lint、type-check、format、Lingui stability 与 Level 2 real-runtime acceptance 完成 fan-in。
- **排除项：** protocol/generated/Rust/TUI、queue/recovery/delivery、typeahead query/sort/menu geometry、完整 `SKILL.md`、触摸承诺与可见桌面均不受影响；没有 Rust build、`just fmt`、TUI snapshot 或 Level 3。
- **剩余未知：** 无会改变根因、文件范围或验证入口的关键未知。实施期只有真实 catalog 文本导致 Tooltip 无法在目标 viewport 闭合、HeroUI/Lexical live API 与已核验 3.2.4/0.49.0 不符、或 Level 2 暴露不同 scroll/focus owner 时才升级并回到计划门禁。

### 当前工具与依赖证据

- 当前 checkout 为 `/Users/jiangsheng/cnb/codex` 的 `dev`；计划落盘前只有本设计文件为 untracked，research 位于 ignored `docs/superpowers/research/**`，禁止强制暂存。
- `codex-gui/package.json` 与 lockfile解析 `@heroui/react`、`@heroui/styles` `3.2.4`、Lexical `0.49.0`、Vitest `4.1.10`；canonical sibling HeroUI checkout `/Users/jiangsheng/cnb/heroui` 解析到 `/Users/jiangsheng/GitHub/heroui`，source version 同为 `3.2.4`。
- 本地 HeroUI source 证明 `Chip` 默认是 `span`，`Tooltip.Trigger` 默认泛型是 `div` 且注入 focusable `role="button"`；本地 docs 证明 `Tooltip` compound API、`isDisabled`、hover/focus lifecycle 与 `Chip size="sm" variant="secondary"`、invalid `color="danger" variant="soft"` 可用。
- live frontend scripts 包含 `format:oxfmt:fix`、`format:oxfmt`、`lint`、`type-check`、`test:unit`、`test:browser:parallel`、`test:browser:sequential` 与 `messages:extract`。执行时只能使用 fnm-backed pnpm，不安装任何工具或依赖。

## 精确修改范围

### FEATURE production

- `codex-gui/src/features/composerEditor/SkillNode.ts`
- `codex-gui/src/features/composerEditor/selectedSkillPresentation.ts`（新增）
- `codex-gui/src/features/composerEditor/SelectedSkillToken.tsx`（新增）
- `codex-gui/src/features/composerEditor/SkillEditingPlugin.tsx`（新增）
- `codex-gui/src/features/composerEditor/ComposerEditor.tsx`
- `codex-gui/src/features/composerEditor/composerDraft.ts`
- `codex-gui/src/features/composerEditor/ComposerClipboardPlugin.tsx`
- `codex-gui/src/features/composerEditor/skillQuery.ts`

### FEATURE tests

- `codex-gui/src/features/composerEditor/__tests__/SkillNode.test.ts`
- `codex-gui/src/features/composerEditor/__tests__/composerDraft.test.ts`
- `codex-gui/src/features/composerEditor/__tests__/skillQuery.test.ts`
- `codex-gui/src/features/composerEditor/__tests__/selectedSkillPresentation.test.ts`（新增）
- `codex-gui/src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx`
- `codex-gui/src/__tests__/sequential/composerClipboard.browser.test.tsx`
- `codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx`

### FEATURE generated/localized output

- `codex-gui/src/locales/en.po`
- `codex-gui/src/locales/zh-CN.po`

`messages:extract` 机械更新两个 catalog 的 msgid、translator comments 与 source references，随后只补本功能新增简体中文翻译；不运行 `messages:extract:clean`，不手写未被提取的 catalog 结构。

## HeroUI、Lexical 与 i18n 实现契约

- `SkillNode` 迁移为 inline `DecoratorNode<JSX.Element>`，`createDOM()` 只返回 inline `span` host；显式保持 version 1 的四字段和 `detail/format/mode/style/text` shape、`$displayName` text/HTML projection、未知 version 拒绝，不双写 v1/v2。
- `SelectedSkillToken` 直接使用 `Tooltip > Tooltip.Trigger<"span"> > Chip + Tooltip.Content`；typed `render` 必须把 props/ref 转发到同一 inline `span`，禁止默认 `div`、仿制 Chip 或自建 overlay owner。
- 正常 Chip 固定 `size="sm" variant="secondary"` 与默认语义色；invalid 固定 `color="danger" variant="soft"`；NodeSelection、focus-visible、正文与 muted detail 使用现有 HeroUI/项目语义 token，不新增硬编码颜色。
- presentation environment 只消费现有 `skillCatalog`、`skillValidity`、`disabled`。精确 path 命中才使用当前 description/scope；`invalidPaths` 是唯一 invalid owner；React 不维护 `selectedSkillKey` 或 `isOpen`。
- presentation environment 只建立一个 editor-level Lexical update subscription，按当前文档的全部 `SkillNode` 维护 `canonical name -> paths` collision index，再与 catalog collision index共同驱动最短路径 projection；每个 decorator 不得各自监听 editor。插入、删除、clear、restore 与 undo/redo 必须使 surviving token 重新投影，且该 index 不进入 draft、协议或 React 业务 selection state。
- `SkillEditingPlugin` 统一 `activateSkillNode(nodeKey): "activated" | "unavailable"`、NodeSelection 删除/替换与显式 root focus handoff。Trigger focus 本身不改 selection；click、Enter、Space 激活 token 后返回 Composer，不能提交或固定 Tooltip。
- `projectComposerDraft()` 遍历完整 Lexical tree；clipboard 同时支持 `RangeSelection` 与 `NodeSelection`。Tooltip DOM、description、scope、path 与 hidden canonical name 不进入正文、HTML 或协议；plain text 仍输出 canonical `$name`，Lexical MIME 保留完整 identity。
- detail 的短标签、trigger accessible name 与状态文本使用 Lingui macro；1–2 词标签及含占位内容使用 object form translator comments。复用现有 `User`、`Repository`、`System`、`Admin` 与 `Invalid skill` message，禁止生成平行英文常量。
- disabled 时 Trigger 退出 Tab 顺序且 Tooltip disabled；节点删除、clear、restore、unmount、pending editor 关闭与 catalog replacement 后不得遗留 portal、旧 nodeKey 或旧 focus。

## 测试与验收契约

### Unit

- `SkillNode.test.ts` 精确比较完整 version 1 JSON、四字段、text/HTML projection、inline/keyboard-selectable decorator 与未知 version 拒绝。
- `composerDraft.test.ts` 覆盖完整 tree traversal、正文顺序、重复 path、同名不同 path、capture/restore 与 canonical payload 不变。
- `skillQuery.test.ts` 与 `selectedSkillPresentation.test.ts` 覆盖精确 path lookup、description 优先级、scope/source、catalog 与当前文档 canonical-name collision、invalid 最短诊断 suffix、普通 path 隐藏及失效/暂不可用边界。

### Browser Mode

- `ComposerEditor.browser.test.tsx` 使用真实 HeroUI DOM，覆盖 inline `span` trigger、Chip variants、hover/focus/Escape lifecycle、无 click pin、accessible name、disabled、invalid、catalog refresh/stale/failed/partial error、两个 token 详情不串位与 portal 清理。
- 同一文件覆盖 Tab/Shift+Tab、左右方向键、click/Enter/Space 激活、Backspace/Delete、普通文本替换、undo/redo、IME、提交 payload、窄宽度、长 label/detail、滚动与 document geometry。
- 同一文件覆盖 invalid 同名 sibling 插入、删除、undo/redo 与 draft restore 后，surviving token 的诊断 suffix 逐级扩展或收缩，证明 collision index 只有一个 editor-level owner且不会陈旧。
- `composerClipboard.browser.test.tsx` 覆盖 RangeSelection/NodeSelection 的 plain text、HTML、Lexical MIME、copy/cut/paste 与 path/Tooltip 泄漏边界。
- `ComposerTurnControl.browser.test.tsx` 证明普通 Composer 与 pending-input editor 共用 presentation/editing 语义，invalid 保存门禁与 overlay cleanup 不回退。
- Browser tests 使用 Vitest locator 与可重试 `expect.element`；每个依赖 neutral hover 的 case 显式 reset pointer，不锁定 Tooltip delay 数值、临时 class 顺序、像素颜色或 React 内部结构。

### GUI 验收级别

- **Level 1：必需。** focused unit、完整 unit、parallel Browser target 与 sequential clipboard target 均使用现有配置；parallel 与 sequential target 都在 Chromium、Firefox、WebKit 收集并通过。
- **Level 2：必需。** 取得当次完整 GUI URL，用无头 `playwright-cli` 证明 session 非 headed；在真实 catalog 下验证选择、hover/focus 详情、重名/invalid 披露、删除/提交/恢复、普通 Composer/pending drawer/transcript 滚动、窄 viewport placement/overflow 与 overlay 清理。缺少 runtime、完整 URL、真实候选或 headless evidence 时标记未执行并阻塞“完全验证”声明，不能用 fixture 替代。
- **Level 3：不适用。** 不启动可见浏览器、DevTools 或桌面窗口；不得把真实 macOS IME UI 或触摸行为扩入本计划。

Level 2 命令骨架仅在取得当次完整 URL 后使用：

```bash
playwright-cli open '<complete current GUI URL>'
playwright-cli list --json
```

## 工具链与精确命令

执行所有 frontend 命令前，在 `/Users/jiangsheng/cnb/codex/codex-gui` 重新核验 fnm 环境与 live scripts：

```bash
/opt/homebrew/bin/fnm env --shell zsh
/opt/homebrew/bin/fnm exec --using-file pnpm --version
```

计划使用的项目入口：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/composerEditor/__tests__/SkillNode.test.ts src/features/composerEditor/__tests__/composerDraft.test.ts src/features/composerEditor/__tests__/skillQuery.test.ts src/features/composerEditor/__tests__/selectedSkillPresentation.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run --config=vitest.browser.parallel.config.ts src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run --config=vitest.browser.sequential.config.ts src/__tests__/sequential/composerClipboard.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run messages:extract
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt:fix
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
/opt/homebrew/bin/fnm exec --using-file pnpm run lint
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

focused red/green 只在实现时用最终测试名追加 `-t '<exact test name>'`；执行前必须证明目标被非零收集。禁止安装、`messages:extract:clean`、repository-level `just fmt`、headed Browser、remote 或任何 force Git 操作。

## Task boundary 与本地提交拓扑

### DOCS — 工作文档提交

文件只包含：

- `docs/superpowers/specs/2026/08/30/2026-08-30-codex-gui-composer-selected-skill-display-design.md`
- `docs/superpowers/plans/2026/08/30/2026-08-30-codex-gui-composer-selected-skill-display-plan.md`

计划确认后先把本计划状态改为“已确认，待执行”，精确 stage 并创建：

```text
docs(gui): plan selected skill chip details
```

ignored research 不 force-add。DOCS commit 成功前，FEATURE 的任何编辑、生成、验证、stage 或 commit 都不得开始。

### FEATURE — 行为、回归与 catalog

FEATURE 包含上文精确 production、tests 与 catalog allowlist，创建：

```text
feat(gui): show selected skills as tooltip chips
```

这是单一用户可见行为提交；不包含 DOCS、research、依赖、配置、协议、order-only 调整或范围外文件。若 formatter 产生不改变行为的 import/声明/函数/组件顺序调整，必须从 FEATURE diff 中撤出；若确有必要保留，另建独立 task boundary 与新提交并重新确认计划。

已有提交后的任何计划内修正必须形成新的独立修正提交，禁止 amend、squash 或并入旧提交。

## 待确认执行能力信封

- `objective`：实现本计划唯一目标。
- `phase`：用户确认计划后进入实现。
- `grantSource`：未来用户对本计划的明确确认；当前尚未激活实现能力。
- `allowedOperations`：计划内调查、编辑、生成、格式化、验证、headless Level 2、精确 stage 与本地 commit。
- `parameterBounds`：当前 `/Users/jiangsheng/cnb/codex` checkout 与 `dev`；frontend cwd 固定 `/Users/jiangsheng/cnb/codex/codex-gui`；不创建 worktree。
- `writeSet`：DOCS 两文件；FEATURE 精确 allowlist；对应 Git index entries、本地 object database 与当前 `dev` ref。
- `stateEffects`：工作树修改、Lingui catalog 生成、formatter/test/cache/headless browser 状态、两个本地提交。
- `negativeConstraints`：不读取完整 `SKILL.md`，不安装、不 headed、不 remote、不 force、不修改 ignored research、不修改 Rust/protocol/schema/config/依赖、不新增排除方案或双 owner。
- `subdelegation`：只按执行图向每个节点下发最小信封；子节点默认不可继续委派。
- `replanTriggers`：需要计划外文件/接口/状态 owner、wire shape 漂移、HeroUI/Lexical API 不匹配、formatter 范围外 retained diff、Level 2 暴露不同 owner、或授权/安全边界变化。

## 描述式执行 DAG

### P0 — 执行环境与范围预检

- `nodeId`: `P0`; `taskBoundary`: 无提交；`operationKind`: 调查；`outcome`: 当前 branch、dirty scope、规则、HeroUI/Lexical versions、目标文件、fnm/pnpm、scripts、Vitest configs、local docs/source 与 browser 前提可信。
- `estimatedCost`: S；`deferralEvidence`: 无；`hardPredecessors`: 无；初始 ready set 仅含 `P0`。
- `consumes`: 本设计/计划与 live checkout；`produces`: preflight evidence；`completionEvidence`: canonical root=`/Users/jiangsheng/cnb/codex`、branch=`dev`、dirty/index 可与 DOCS allowlist隔离，版本与入口一致。
- `readSet`: 根及 `codex-gui` 规则、DOCS、精确 FEATURE allowlist、package/lock/config、HeroUI/Vitest local资料、Git worktree/index；`writeSet`: `[]`; `stateEffects`: 只读证据。
- `commandScope`: `pwd`、`git rev-parse --show-toplevel`、`git branch --show-current`、`git status --short`、`git diff`、`git check-ignore`、`test`、`command -v`、fnm-backed `pnpm --version`; `executionContext`: 当前 checkout/index；`resourceLocks`: worktree/index read；`owner`: 预检代理。
- `verification`: 任何缺失工具停止依赖节点，不安装；`failureDomain`: 阻塞全部后继；`replanTriggers`: root/branch/owner/version/entrypoint/dirty scope 漂移；`authorizationGate`: 计划确认后 active。

### D0 / D1 / D2 — DOCS status、stage、commit

- `D0`: `taskBoundary=DOCS`; `operationKind=编辑`; 将本计划状态机械更新为“已确认，待执行”；`hardPredecessors=P0`; `writeSet=本计划`; `completionEvidence=只一行状态 diff`; `owner=DOCS 编辑代理`。
- `D1`: `taskBoundary=DOCS`; `operationKind=stage`; `hardPredecessors=D0`; 精确 `git add --` 两份 DOCS；`writeSet=Git index 两个 entries`; `completionEvidence=cached diff/name-status 只含两份 DOCS`; `owner=DOCS Git owner`。
- `D2`: `taskBoundary=DOCS`; `operationKind=commit`; `hardPredecessors=D1`; 产生 `docs(gui): plan selected skill chip details`; `writeSet=object database/current dev ref/index`; `completionEvidence=commit id、parent、message、文件列表匹配`; `owner=DOCS Git owner`。
- 三节点 `estimatedCost=S`、`deferralEvidence=无`、`subdelegation=false`；`commandScope` 分别为 `apply_patch`、精确 `git add --`/cached checks、精确 `git commit -m 'docs(gui): plan selected skill chip details'`/只读 commit checks；`resourceLocks` 依次为计划文件 write、index write、object/ref/index write；任一失败只阻塞后继；`authorizationGate` 仅在计划确认后 active。

### V0 — Frontend formatter baseline

- `nodeId`: `V0`; `taskBoundary`: 无提交；`operationKind`: 验证；`outcome`: FEATURE 编辑前 live `format:oxfmt` baseline 通过。
- `estimatedCost`: S；`deferralEvidence`: 无；`hardPredecessors`: `D2`，等待工作文档提交门禁。
- `consumes`: live formatter/config；`produces`: clean baseline evidence；`completionEvidence`: fnm-backed `pnpm run format:oxfmt` 退出 0。
- `readSet`: `codex-gui/**`; `writeSet`: `[]`; `stateEffects`: 验证输出；`commandScope`: 计划中的 format check；`executionContext`: `codex-gui` cwd；`resourceLocks`: frontend tree read；`owner`: baseline 验证代理。
- `verification`: baseline failure 不用 fix 掩盖；`failureDomain`: 阻塞 FEATURE；`replanTriggers`: baseline/入口/config 漂移；`authorizationGate`: DOCS commit 后 active。

### T1 — Data contract red tests

- `nodeId`: `T1`; `taskBoundary`: `FEATURE`; `operationKind`: 编辑；`outcome`: unit tests 表达 DecoratorNode v1 wire、完整 tree draft 与共享 detail/path projection 契约。
- `estimatedCost`: M；`deferralEvidence`: 无；`hardPredecessors`: `V0`。
- `consumes`: 设计与现有 unit seams；`produces`: 四个 unit test 文件 diff；`completionEvidence`: 断言 observable data/wire，不断言 private React structure。
- `readSet`: DOCS、现有 production/unit；`writeSet`: `SkillNode.test.ts`、`composerDraft.test.ts`、`skillQuery.test.ts`、新增 `selectedSkillPresentation.test.ts`; `stateEffects`: working diff；`commandScope`: `apply_patch` 与只读 diff；`executionContext`: 当前 checkout；`resourceLocks`: 四个 test files write；`owner`: unit test 编辑代理。
- `verification`: 不新增 v2/fallback；`failureDomain`: 阻塞 `VR1` 与 data implementation；`replanTriggers`: 需要计划外 contract/fixture；`authorizationGate`: 计划确认且 D2/V0 完成后 active。

### T2 — Browser behavior red tests

- `nodeId`: `T2`; `taskBoundary`: `FEATURE`; `operationKind`: 编辑；`outcome`: Browser tests 表达 Chip/Tooltip、focus/selection/editing、catalog、clipboard、pending 与 geometry 契约。
- `estimatedCost`: L；`deferralEvidence`: 无；`hardPredecessors`: `V0`；与 `T1` 写集合不相交，二者同时 ready。
- `consumes`: 设计、现有 fixtures与三浏览器 seams；`produces`: 三个 Browser test files diff；`completionEvidence`: stable DOM/ARIA/selection/payload/geometry assertions，neutral hover reset 完整。
- `readSet`: DOCS、Composer/pending production/tests、Vitest docs/config；`writeSet`: `ComposerEditor.browser.test.tsx`、`composerClipboard.browser.test.tsx`、`ComposerTurnControl.browser.test.tsx`; `stateEffects`: working diff；`commandScope`: `apply_patch` 与只读 diff；`executionContext`: 当前 checkout；`resourceLocks`: 三个 Browser test files write；`owner`: Browser test 编辑代理。
- `verification`: 不锁 delay/class order/color/internal React；`failureDomain`: 阻塞 `VR2` 与 presentation implementation；`replanTriggers`: 需要 private seam、E2E/config/计划外 fixture；`authorizationGate`: 计划确认且 D2/V0 完成后 active。

### VR1 / VR2 — Focused expected red

- `VR1`: `taskBoundary=FEATURE`; `operationKind=验证`; `hardPredecessors=T1`; 运行 focused unit 命令；必须非零收集并因缺失 Decorator/data projection 失败。
- `VR2`: `taskBoundary=FEATURE`; `operationKind=验证`; `hardPredecessors=T2`; 分别运行 parallel/sequential focused Browser tests；必须在三 instances 非零收集并因缺失 Chip/Tooltip/NodeSelection/clipboard 行为失败。
- 两节点 `estimatedCost=M/L`、`deferralEvidence=无`; `readSet=对应 tests/production/config`; `writeSet=[]`; `stateEffects=headless runner/cache`; `commandScope=计划中的 focused Vitest 命令加精确 test name`; `executionContext=codex-gui cwd`; `resourceLocks=Vitest runner/Playwright/Vite cache/browser tsbuildinfo write`; `owner=对应验证代理`; `completionEvidence=expected-red 原因不是 config/type/fixture/browser 启动错误`; `failureDomain` 只阻塞各自 implementation 分支；`replanTriggers=根因被推翻或 target 未收集`; `authorizationGate=前置 test diff 后 active`。

### E1 — Skill node、draft、clipboard 与 editing

- `nodeId`: `E1`; `taskBoundary`: `FEATURE`; `operationKind`: 编辑；`outcome`: DecoratorNode、完整 tree projection、Range/Node clipboard 与单一 Skill editing owner 实现设计契约。
- `estimatedCost`: L；`deferralEvidence`: 无；`hardPredecessors`: `VR1`。
- `consumes`: expected-red data evidence与设计；`produces`: core production diff；`completionEvidence`: version 1 wire唯一、`activateSkillNode`/delete/replace/root focus owner 单一、无 presentation state mirror。
- `readSet`: DOCS、core files/tests与 Lexical 0.49 source/types；`writeSet`: `SkillNode.ts`、新增 `SkillEditingPlugin.tsx`、`composerDraft.ts`、`ComposerClipboardPlugin.tsx`; `stateEffects`: working diff；`commandScope`: `apply_patch` 与只读 diff；`executionContext`: 当前 checkout；`resourceLocks`: 四个 production files write；`owner`: core 编辑代理。
- `verification`: 不加兼容双读/双写；`failureDomain`: 阻塞 feature fan-in；`replanTriggers`: wire shape、protocol或额外 owner变化；`authorizationGate`: expected red 后 active。

### E2 — Selected Skill presentation 与 environment

- `nodeId`: `E2`; `taskBoundary`: `FEATURE`; `operationKind`: 编辑；`outcome`: 真实 HeroUI inline Chip/Tooltip、catalog detail projection、invalid/disabled/ARIA 与 Composer wiring 实现设计契约。
- `estimatedCost`: L；`deferralEvidence`: 无；`hardPredecessors`: `VR2`；与 `E1` 写集合不相交，可同时运行。
- `consumes`: expected-red Browser evidence、本地 HeroUI source/docs、设计；`produces`: presentation production diff；`completionEvidence`: typed inline Trigger、无 React selection/open owner、普通/pending 共用 environment，且单一 editor-level collision index随插入/删除/restore更新。
- `readSet`: DOCS、HeroUI source/docs、catalog/Composer/typeahead production/tests；`writeSet`: 新增 `selectedSkillPresentation.ts`、新增 `SelectedSkillToken.tsx`、`ComposerEditor.tsx`、`skillQuery.ts`; `stateEffects`: working diff；`commandScope`: `apply_patch` 与只读 diff；`executionContext`: 当前 checkout；`resourceLocks`: 四个 production files write；`owner`: presentation 编辑代理。
- `verification`: 只用 `Chip`/`Tooltip` compound API、既定 variants/tokens；每个 decorator 不注册独立 editor listener；`failureDomain`: 阻塞 feature fan-in；`replanTriggers`: typed inline render 不成立、需第二 owner/额外 component/RPC；`authorizationGate`: expected red 后 active。

### G1 / L1 — Catalog extraction 与补译

- `G1`: `taskBoundary=FEATURE`; `operationKind=生成`; `hardPredecessors=E1,E2,T1,T2`; 运行 `messages:extract`；`readSet=codex-gui/src/**, lingui config`; `writeSet=en.po,zh-CN.po`; `completionEvidence=catalog diff 只含本功能 messages/comments/refs`; `resourceLocks=src tree read + catalogs write`; `owner=Lingui generator`。
- `L1`: `taskBoundary=FEATURE`; `operationKind=编辑`; `hardPredecessors=G1`; 只补新 msgid 的简体中文翻译；`readSet=source context与 catalogs`; `writeSet=zh-CN.po`; `completionEvidence=目标新增项无 missing/fuzzy 且 comments 保留`; `resourceLocks=zh catalog write`; `owner=翻译编辑代理`。
- 两节点 `estimatedCost=S`、`deferralEvidence=无`; `stateEffects=catalog diff`; `commandScope` 分别为 fnm-backed `pnpm run messages:extract` 与 `apply_patch`; `executionContext=codex-gui cwd`; `failureDomain` 阻塞 formatter/验证；`replanTriggers=unrelated catalog churn或新增 message 超出目标`; `authorizationGate=计划确认且 source fan-in 后 active`。

### F1 — 权威 frontend 格式化

- `nodeId`: `F1`; `taskBoundary`: `FEATURE`; `operationKind`: 格式化；`outcome`: FEATURE allowlist符合 live oxfmt，且无范围外 retained diff。
- `estimatedCost`: S；`deferralEvidence`: 无；`hardPredecessors`: `E1`、`E2`、`L1`。
- `consumes`: 完整 feature diff与 formatter config；`produces`: formatted diff；`completionEvidence`: `format:oxfmt:fix` 退出 0，allowlist外无新 diff，FEATURE 内无 order-only 调整。
- `readSet/writeSet`: `codex-gui/**`（权威命令显式作用于 `.`）；`stateEffects`: project-wide formatter写入；`commandScope`: 计划中的 format fix 与只读 allowlist diff；`executionContext`: `codex-gui` cwd；`resourceLocks`: frontend tree write；`owner`: formatter owner。
- `verification`: baseline 后范围外 diff 或 order-only churn 触发重新计划，不擅自恢复；`failureDomain`: 阻塞 post-format fan-out；`replanTriggers`: formatter/config/dirty scope漂移；`authorizationGate`: source/catalog fan-in 后 active。

### V1–V7 — Post-format 验证 fan-out

所有节点以 `F1` 为唯一硬前置；编号不构成相互依赖。资源锁允许时立即并行启动：

- `V1`: `operationKind=验证`; 完整 `test:unit`; `completionEvidence=非零 unit 全绿`; `resourceLocks=Vitest unit runner/cache write`。
- `V2`: `operationKind=验证`; parallel config 精确收集 `ComposerEditor.browser.test.tsx` 与 `ComposerTurnControl.browser.test.tsx`，Chromium/Firefox/WebKit 全绿；`resourceLocks=Browser runner/Playwright/Vite cache/browser tsbuildinfo write`。
- `V3`: `operationKind=验证`; sequential config 精确收集 `composerClipboard.browser.test.tsx`，三浏览器全绿；与 `V2` 共享 runner/cache 写锁，不能同时占用但没有 hard edge。
- `V4`: `operationKind=验证`; `format:oxfmt` 退出 0；`resourceLocks=frontend tree read`。
- `V5`: `operationKind=验证`; `lint` 的 oxlint+eslint 退出 0；`resourceLocks=source read/eslint cache write`。
- `V6`: `operationKind=验证`; `type-check` 退出 0并覆盖 Browser TS；与 V2/V3 共享 browser tsbuildinfo write lock，不并发占用；没有 hard edge。
- `V7`: `operationKind=生成`; 再运行同一 `messages:extract`，catalog 不产生新的结构 diff且目标 zh翻译保留；`resourceLocks=src read/catalogs write`。

七节点均 `taskBoundary=FEATURE`、`estimatedCost=S/M/L`、`deferralEvidence=无`; `consumes=formatted feature diff`; `produces=各自稳定证据`; `readSet=对应源码/config/test/catalog`; `writeSet=[]`，但 V7 的显式生成输出为两个 catalogs；`stateEffects=runner/cache/检查输出，V7可能机械触碰 catalog`; `commandScope=上文精确 fnm-backed入口`; `executionContext=codex-gui cwd`; `owner=各验证 owner`; `verification=目标真实非零收集且禁止 fix/skip/baseline修改`; `failureDomain` 仅阻塞 `A1/R1/S1/C1`，其他无资源冲突节点继续；`replanTriggers=计划外 failure、新 owner或入口/收集漂移`; `authorizationGate=F1 后 active`。

### A1 — Level 2 headless real-runtime acceptance

- `nodeId`: `A1`; `taskBoundary`: `FEATURE`; `operationKind`: 验证；`outcome`: 真实 catalog、Composer、pending drawer 与 transcript 组合满足设计。
- `estimatedCost`: L；`deferralEvidence`: 无；`hardPredecessors`: `V2`、`V3`，等待稳定 Level 1 交互/clipboard证据。
- `consumes`: 当次完整 GUI URL、真实 runtime与 feature source state；`produces`: Level 2 acceptance evidence或精确 unexecuted原因；`completionEvidence`: 非 headed session、route/state、真实 metadata、pointer/keyboard/focus/delete/submit/restore、scroll/overflow/placement/cleanup均有记录。
- `readSet`: 当次 GUI runtime/DOM；`writeSet`: `[]`; `stateEffects`: headless browser session与页面交互状态；`commandScope`: `playwright-cli open '<complete current GUI URL>'`、`playwright-cli list --json`及同 session交互；`executionContext`: 当前真实 GUI runtime；`resourceLocks`: headless browser session write；`owner`: Level 2 验收代理。
- `verification`: fixture不替代真实状态；缺前提则标记未执行并阻塞完整验证，不切换 headed；`failureDomain`: 阻塞 `R1/S1/C1`; `replanTriggers`: 真实 owner/geometry/metadata不符合设计；`authorizationGate`: 计划确认且 Level 1 相关节点通过后 active。

### R1 — FEATURE fan-in 与反向审查

- `nodeId`: `R1`; `taskBoundary`: `FEATURE`; `operationKind`: fan-in；`outcome`: 完整 allowlist diff、全部静态/Level 1/Level 2证据与设计逐项一致，可暂存。
- `estimatedCost`: M；`deferralEvidence`: 无；`hardPredecessors`: `V1`–`V7`、`A1`。
- `consumes`: formatted diff、验证与 acceptance evidence；`produces`: approved FEATURE snapshot；`completionEvidence`: `git diff --check` 通过、文件只在 allowlist、无 excluded方案/双owner/path泄漏/order-only调整。
- `readSet`: DOCS、FEATURE allowlist、Git diff/status与证据；`writeSet`: `[]`; `stateEffects`: 审查结果；`commandScope`: 精确 `git diff --check -- <allowlist>`、`git diff -- <allowlist>`、`git status --short`; `executionContext`: 当前 checkout；`resourceLocks`: worktree read；`owner`: 主协调代理。
- `verification`: 独立反向检查 owner、wire、clipboard、lifecycle、i18n与验证命中；`failureDomain`: 阻塞 stage/commit；`replanTriggers`: 遗漏 consumer/owner/范围；`authorizationGate`: 全部前置稳定后 active。

### S1 / C1 — FEATURE stage 与 commit

- `S1`: `taskBoundary=FEATURE`; `operationKind=stage`; `hardPredecessors=R1`; 精确 `git add --` FEATURE allowlist；`writeSet=对应 index entries`; `completionEvidence=cached diff/name-status/content只含 allowlist`; `owner=FEATURE Git owner`。
- `C1`: `taskBoundary=FEATURE`; `operationKind=commit`; `hardPredecessors=S1`; 产生 `feat(gui): show selected skills as tooltip chips`; `writeSet=object database/current dev ref/index`; `completionEvidence=commit id、parent、message、文件列表匹配且 index状态核对`; `owner=FEATURE Git owner`。
- 两节点 `estimatedCost=S`、`deferralEvidence=无`; `commandScope` 分别为精确 `git add -- <allowlist>`/cached checks 与 `git commit -m 'feat(gui): show selected skills as tooltip chips'`/只读 commit checks；`resourceLocks` 为 index write及 object/ref/index write；`failureDomain` 仅阻塞终态成功报告；`replanTriggers=staged snapshot不匹配或提交前 branch/index漂移`; `authorizationGate=计划确认且 R1/S1前置完成后 active`。

### Z0 — 终态审计

- `nodeId`: `Z0`; `taskBoundary`: 无提交；`operationKind`: 审查；`outcome`: DOCS/FEATURE commits、worktree/index、验证结果与计划终态一致。
- `estimatedCost`: S；`deferralEvidence`: 无；`hardPredecessors`: `C1`。
- `consumes`: 两个 commit与全部证据；`produces`: final report evidence；`completionEvidence`: commit topology正确、无 remote/force/ignored research、无未处理计划内问题，Level 1/2/3分别如实报告。
- `readSet`: Git log/show/status与验证记录；`writeSet`: `[]`; `stateEffects`: 终态报告；`commandScope`: 只读 Git检查；`executionContext`: 当前 checkout；`resourceLocks`: repo read；`owner`: 主协调代理。
- `verification`: 报告实际并行、关键路径、未启动 ready节点与任何 unexecuted验收；`failureDomain`: 阻塞完整成功声明；`authorizationGate`: C1 后 active。

### FX1–FX4 — 已提交 FEATURE 的条件修正分支

该分支默认不进入 ready set。只有 `C1` 后、`Z0` 完成前的新证据证明 FEATURE commit 直接引入计划内问题，且修正不改变目标、文件 allowlist、用户可见行为、接口、数据、安全、验证方式或授权边界时才激活：

- `FX1`: `taskBoundary=FEATURE-FIX`; `operationKind=编辑`; `hardPredecessors=C1`; 只修改 FEATURE allowlist 内直接致因文件；`completionEvidence=最小修正 diff且无新 owner/fallback/order-only调整`。
- `FX2`: `taskBoundary=FEATURE-FIX`; `operationKind=验证`; `hardPredecessors=FX1`; 重跑所有受修正影响的 focused、static、三浏览器与必要 Level 2 节点；`completionEvidence=受影响证据重新成立`。
- `FX3`: `taskBoundary=FEATURE-FIX`; `operationKind=stage`; `hardPredecessors=FX2`; 精确 stage 修正文件；`completionEvidence=cached snapshot只含修正`。
- `FX4`: `taskBoundary=FEATURE-FIX`; `operationKind=commit`; `hardPredecessors=FX3`; 创建新的独立 `fix(gui): correct selected skill chip details` commit；禁止 amend 或并入 `C1`；`completionEvidence=新 commit id、parent=C1或其后已有计划内修正、message与文件列表匹配`。

四节点 `estimatedCost=按实际 S/M/L`、`deferralEvidence=无`; `readSet/writeSet/stateEffects/commandScope/resourceLocks/owner/verification/failureDomain` 必须按实际致因从原节点能力信封取最小交集；`subdelegation=false`; `replanTriggers=任何 allowlist、行为、接口、owner或验证方式变化`; `authorizationGate` 仅在上述条件全部成立时 active。若激活，`Z0` 改为等待 `FX4` 及重跑证据；若未激活，`Z0` 直接消费 `C1`。发现计划外或实质变化时不使用该分支，必须回到计划确认门禁。

## 并行、关键路径与失败域审计

- 初始 ready set 仅 `P0`。DOCS 必须先提交是明确阶段门禁；FEATURE 不能与 DOCS 并行。
- `T1` 与 `T2`、后续 `E1` 与 `E2` 写集合不相交并产生独立稳定产物，容量允许时并行；`G1` 必须等待所有 source/test edits，因为它读取整个 `src/**`。
- 粗粒度关键路径预计为 `P0 → D0 → D1 → D2 → V0 → T2 → VR2 → E2 → G1 → L1 → F1 → V2/V3 → A1 → R1 → S1 → C1 → Z0`；data branch `T1 → VR1 → E1` 在 `G1` fan-in。
- V1、V4、V5、V7 可与任一 Browser/TypeScript节点在无锁冲突时并行。V2、V3、V6 对 runner/cache/tsbuildinfo 的实际 write lock 采用串行获取，不增加伪 hard edge。
- 同一 checkout 与 Git index 只有一个 stage/commit owner；不创建 worktree，不并行两个 task boundary 的 Git写入。
- 任一节点失败只暂停该节点及传递后继。`C1` 前的计划内问题在 FEATURE working diff 中闭环；`C1` 后仅符合 FX 条件的问题进入独立 FEATURE-FIX commit，禁止 amend。
- 若 expected red 推翻根因、需要计划外文件/owner、wire shape变化、formatter/catalog扩大 retained diff、Level 2 暴露不同 owner，暂停受影响后继并重新确认计划；不得以 fallback、双路径、skip、容差、删除覆盖或放宽断言伪装成功。

## 最终验收与终态报告

- 正文原位置显示真实 `Chip size="sm" variant="secondary"`；invalid 使用 `color="danger" variant="soft"`，无 close slot。
- 整个 Chip 是合法 inline `Tooltip.Trigger<"span">`；hover/focus详情、Tab、激活、删除、替换、undo/redo、IME、disabled、Escape与生命周期符合设计，无 click pin或 scroll lock。
- Tooltip只使用精确 path对应的 catalog metadata；普通 path隐藏，重名/invalid只披露最短必要路径；详情不进入 draft、clipboard HTML或协议。
- version 1 JSON、canonical `$name` plain text、Lexical MIME identity、重复 path/order、`{type: "skill", name, path}` 与 invalid提交门禁保持不变。
- 普通 Composer与 pending-input editor均通过；unit、三浏览器 parallel/sequential、format、lint、type-check、Lingui stability与Level 2分别如实报告；Level 3明确不适用。
- DOCS与FEATURE各形成一个独立本地commit；无 ignored research、order-only调整、amend、squash、force或remote。
- 终态必须报告 `实际并行`、`关键路径`、`未启动 ready 节点`；计划确认前上述均为预计拓扑，不得冒充执行事实。

## 阶段边界

本文仅为 implementation plan。用户明确回复“确认计划”前，不执行任何 DAG 节点，不修改 production/test/catalog，不运行 pnpm/浏览器验证，不 stage 或 commit。
