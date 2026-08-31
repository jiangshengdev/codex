# Composer skill token 左右方向键导航实施计划

日期：2026-08-31

状态：已确认（2026-08-31）

计划分支：`dev`

计划时 HEAD：`9965e509b304e518707a3b71ba9289ad10b51c10`

关联已确认设计：

- `docs/superpowers/specs/2026/08/31/2026-08-31-composer-skill-token-arrow-navigation-design.md`

关联 research（Git ignore，只读证据，不进入提交）：

- `docs/superpowers/research/2026/08/31/2026-08-31-composer-skill-token-caret-tooltip-focus.md`

## 唯一实施目标

在 Composer 的 Skill editing owner 中补齐单个 Skill `NodeSelection → RangeSelection` 的左右方向键退场，使 token 继续作为两段式原子 caret stop：第一次方向键进入单节点 `NodeSelection`，第二次按视觉方向退出到 token 前或后；方向键路径保持 editor root 的 DOM focus，不显示 Tooltip，不改变 `Tab` focus、Trigger 激活、删除、替换、clipboard、draft、catalog、queue 或提交语义。

## 已确认边界

- `Tab` DOM focus 与左右方向键的 Lexical selection 是两条独立交互链。
- Skill `NodeSelection` 不驱动 Tooltip open；Tooltip 继续只由 hover 或 Trigger DOM focus 显示。
- LTR 下 `ArrowLeft` 退到 token 前、`ArrowRight` 退到 token 后；RTL 按父级书写方向交换 logical previous/next，使视觉结果一致。
- 只认领单个 Skill 的 `NodeSelection`。其他 selection、多个节点和其他 decorator 交还既有命令链。
- 只在成功转换 selection 时 `preventDefault()` 并返回已处理；不得制造 Lexical/DOM selection 分叉。
- 不新增 Tooltip 状态、React callback、通用 decorator navigation、fallback、adapter、第二条 owner 或兼容路径。
- 不创建 worktree、项目副本、临时目录或临时快照；直接在当前 `dev` checkout 实施。
- 不安装依赖，不运行 repository-level `just fmt`，不启动可见浏览器，不操作 Git remote，不使用 force Git 命令。

## 计划前事实闭包

- **权威生产入口：** `ComposerEditor` 挂载 Lexical `PlainTextPlugin` 与 `SkillEditingPlugin`；`SkillEditingPlugin` 已拥有 Skill `NodeSelection` 的文本替换、Backspace/Delete 与 focus handoff。
- **根因：** Lexical 0.49.0 core 会将相邻 collapsed `RangeSelection` 转为 keyboard-selectable `DecoratorNode` 的 `NodeSelection`，但 `@lexical/plain-text` 的左右命令不处理 `NodeSelection`，项目插件也未补齐退场。
- **标准行为证据：** 同版本 `@lexical/rich-text` 对 `NodeSelection` 使用父级方向映射，并通过节点的公共 `selectPrevious()` / `selectNext()` 落到 collapsed `RangeSelection`；包内 `$exitNodeSelectionToward` 是私有 helper，只作行为参考，不导入。
- **Presentation 边界：** `SelectedSkillToken` 通过 `useLexicalNodeSelection(nodeKey)` 投影 selected 视觉；Tooltip open 不受 selection 控制。本计划不修改 presentation 文件或 HeroUI 组件、variant、semantic token。
- **协议与数据：** 本变更只改变 editor selection，不修改节点、draft、catalog、clipboard 或结构化 payload，因此不进入 Rust、app-server、schema、生成物或 Lingui catalog。
- **测试缺口：** 现有 `keeps a skill token atomic across caret navigation, deletion, undo, and redo` 只断言最终文本，不能证明进入/退出状态、caret 落点、后续输入侧、Tooltip 隔离或 RTL。
- **验证入口：** live `codex-gui/package.json` 提供 `format:oxfmt:fix`、`format:oxfmt`、`lint` 与 `type-check`；parallel Browser config 收集 `src/**/*.browser.test.tsx` 并在 Chromium、Firefox、WebKit 运行。
- **工具环境：** `/opt/homebrew/bin/fnm`、fnm-backed Node 24.17.0、pnpm 10.34.5、`playwright-cli` 0.1.18 与 `npx` 当前存在。实施前必须重新预检，不能把本次只读结果当成永久状态。
- **风险判断：** 中等、局部 GUI selection 修复。它不改公共接口或数据，但跨 Lexical selection、DOM focus、Browser Mode 和真实 runtime；关键事实、owner、文件范围与验证入口已闭合，没有阻断计划的关键未知。

本计划使用稳定的文件路径、符号、测试名和行为断言定位目标；旧源码行号、预计 hunk、diff 行数和 catalog source-reference 行号都不作为执行或验收白名单。

## 修改与提交边界

### DOCS — 工作文档提交

计划确认后、任何实现编辑或验证前，创建一个仅包含以下文件的独立本地提交：

- `docs/superpowers/specs/2026/08/31/2026-08-31-composer-skill-token-arrow-navigation-design.md`
- `docs/superpowers/plans/2026/08/31/2026-08-31-composer-skill-token-arrow-navigation-plan.md`

建议提交信息：

```text
docs: plan skill token arrow navigation
```

research 由 `.gitignore` 排除，禁止 force stage；其他 dirty 或 untracked 文件不得进入 DOCS 提交。

### FIX — selection 行为与回归测试提交

最终只允许保留、暂存和提交以下实现文件：

- `codex-gui/src/features/composerEditor/SkillEditingPlugin.tsx`
- `codex-gui/src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx`

建议提交信息：

```text
fix(gui): let caret exit selected skill tokens
```

行为修改与必要回归测试属于同一 `FIX` task boundary。不得在该提交中进行 import、声明、函数、组件或测试的纯顺序整理；若 live formatter 只做必要格式化可保留，任何与行为无关的手工重排必须排除。

## 实现契约

### `SkillEditingPlugin`

1. 注册 `KEY_ARROW_LEFT_COMMAND` 与 `KEY_ARROW_RIGHT_COMMAND`，使用 editor 级优先级参与既有命令链。
2. handler 读取当前 selection，仅当它是恰好包含一个 `$isSkillNode` 节点的 `NodeSelection` 时继续。
3. 读取该 Skill 父级的书写方向，将视觉 Left/Right 映射为 logical previous/next：LTR Left→previous、Right→next；RTL Left→next、Right→previous。
4. previous 使用节点公共 `selectPrevious()`；next 使用 `selectNext(0, 0)`，生成 collapsed `RangeSelection`，不直接构造 DOM Range，不导入 `@lexical/rich-text` 私有实现。
5. 成功转换后调用 `event.preventDefault()` 并返回 `true`；不匹配时返回 `false`，不得影响 PlainText 的普通 caret navigation。
6. 不修改节点、不写 history tag、不调用 Tooltip/React presentation、不转移 DOM focus、不触发提交。

### Browser 回归

在现有 `ComposerEditor.browser.test.tsx` 中保留原子删除与 undo/redo 价值，并增加一个精确命名的参数化测试：

```text
moves through skill tokens as two-step visual-direction caret stops
```

该测试逐步证明：

- LTR 从 token 左侧 `ArrowRight`、从右侧 `ArrowLeft` 都先进入单节点选择；editor root 保持 DOM focus，Chip 有 `data-selected`，Tooltip 不存在，submit spy 未调用。
- selected 后按视觉 `ArrowLeft` / `ArrowRight` 分别退出到 token 前/后；DOM selection collapsed，Chip 取消 selected，Tooltip 仍不存在。
- 两侧退出后继续输入，文本落在正确一侧且 Skill identity 与结构化 capture 不变，不发生整体替换。
- RTL 使用包含强 RTL 字符的真实编辑内容建立父级方向，按视觉方向验证相同结果；不新增测试专用 production prop 或 controller API。
- 其他既有 Trigger `Tab`/focus/Space/Enter、Backspace/Delete、普通输入替换、undo/redo、clipboard 与 IME 回归不改写、不放宽。

DOM 断言使用本地 Vitest Browser Mode 文档规定的 `userEvent.keyboard`、locator 与 retriable `expect.element` / `expect.poll`；不能以最终文本未变化替代中间 selection 与 caret 落点证据。

## 工具链与精确命令

所有 pnpm 命令从 `/Users/jiangsheng/cnb/codex/codex-gui` 执行。每次执行前重新核验 fnm-backed pnpm，若解析到 `/Users/<user>/.cache/codex-runtimes/` 或工具缺失则停止，不安装替代组件：

```bash
/opt/homebrew/bin/fnm env --shell zsh
/opt/homebrew/bin/fnm exec --using-file pnpm --version
```

focused red/green 必须实际收集精确测试，并分别报告 Chromium、Firefox、WebKit：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run --config=vitest.browser.parallel.config.ts src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx -t 'moves through skill tokens as two-step visual-direction caret stops'
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

`format:oxfmt:fix` 是 repository-owned project-wide 写入口，不能伪装成两文件 write scope。DOCS 提交完成后必须先运行非 fix `format:oxfmt` 证明现有 frontend baseline；fix formatter 前再次确认没有计划外 dirty frontend 文件。若 formatter 产生两份 FIX allowlist 之外的新 diff，立即停止，不得擅自恢复、继续、暂存或并入提交。

不使用 `pnpm run ci`、smoke config、unit config 或 `pnpm run test:browser -- <path>` 代替上述 direct Browser target。实现不触发 `messages:extract`、schema 生成、snapshot accept 或 repository-level `just fmt`。

## GUI 验收级别

- **Level 1：必需。** focused test 先红后绿，并完成整个 `ComposerEditor.browser.test.tsx` 的三浏览器 Browser Mode closure；必须记录目标文件与精确测试的非零收集。
- **Level 2：必需。** 实现稳定后取得当次 `/gui` 或 `launch_gui` 返回的完整 URL，使用无 `--headed` 的 `playwright-cli open '<complete current GUI URL>'`，随后用 `playwright-cli list --json` 证明 session 非 headed。在真实 catalog 下分别验证普通 Composer 与 pending-input editor：从两侧两段式进入/退出、Tooltip 不因方向键打开、`Tab` focus 与 hover 仍显示详情、连续相邻 Skill/行首/行尾/换行/内部滚动位置不困住 caret 且页面不跳动、退出后输入/删除/提交保持语义。URL、route、thread id 与 token 必须来自当次结果，禁止猜测、拼接或复用旧 URL。缺少 runtime、完整 URL、真实 Skill 或非 headed session 证据时，Level 2 标记未执行并阻塞“完全验证”声明；fixture 不能替代。
- **Level 3：不适用。** 结果不依赖 OS 窗口、跨应用 focus、DevTools 或系统 IME；不得启动可见浏览器。若实施证据推翻该判断，先回到授权与计划门禁，取得该次可见窗口的单独明确授权。

Level 2 仅在取得当次完整 URL 后使用：

```bash
playwright-cli open '<complete current GUI URL>'
playwright-cli list --json
```

## 描述式执行 DAG

计划确认前所有有状态节点的 `authorizationGate` 均为 `pending`。计划确认只激活计划内动作；每个执行节点仍须由 `$action-authorization` 生成最小能力信封，并按 `$delegating-micro-stages` 执行图契约调度。所有 `subdelegation` 均为禁止。

### D0 — 记录计划确认状态

- `nodeId`: `D0`；`taskBoundary`: `DOCS`；`operationKind`: 编辑；`outcome`: 本计划状态更新为“已确认（2026-08-31）”，阶段边界同步记录用户确认。
- `estimatedCost`: S；`deferralEvidence`: 无；`hardPredecessors`: `[]`。
- `consumes`: 用户对本计划的明确确认；`produces`: confirmed plan document；`completionEvidence`: 只修改本计划的状态与阶段边界，不改变已确认正文范围。
- `readSet`: 本计划与用户确认；`writeSet`: 本计划文件；`stateEffects`: 单文档工作树修改。
- `commandScope`: `apply_patch` 与只读 diff；`executionContext`: 当前 `dev` checkout，不写 index；`resourceLocks`: plan document write；`owner`: DOCS 文档代理。
- `verification`: 状态和阶段边界一致；`failureDomain`: 阻塞 D1 与全部后继；`replanTriggers`: 用户确认附带范围变化或计划正文需要实质修改；`authorizationGate`: 用户明确确认本计划后 active。

### D1 — 精确暂存工作文档

- `nodeId`: `D1`；`taskBoundary`: `DOCS`；`operationKind`: stage；`outcome`: Git index 只包含已确认设计与本计划。
- `estimatedCost`: S；`deferralEvidence`: 无；`hardPredecessors`: D0，等待 confirmed plan document。
- `consumes`: 两份工作文档与计划确认；`produces`: DOCS staged snapshot；`completionEvidence`: staged name-status 与 staged diff 只含 DOCS allowlist，`git diff --cached --check` 通过。
- `readSet`: Git status、两份文档、index；`writeSet`: 当前 checkout 的 Git index，仅 DOCS allowlist；`stateEffects`: 精确 index 更新。
- `commandScope`: Git 只读检查、`git add -- <两份 DOCS 文件>`、`git diff --cached --check`；`executionContext`: 当前 `dev` checkout、共享当前 index；`resourceLocks`: 当前 checkout Git index write；`owner`: DOCS Git 代理。
- `verification`: research 和其他 dirty/untracked 文件不在 staged snapshot；`failureDomain`: 阻塞 D2 与全部实现节点；`replanTriggers`: 分支/HEAD/文档路径漂移或 index 含范围外内容；`authorizationGate`: 计划确认后 active。

### D2 — 创建 DOCS 提交

- `nodeId`: `D2`；`taskBoundary`: `DOCS`；`operationKind`: commit；`outcome`: 创建独立本地工作文档提交。
- `estimatedCost`: S；`deferralEvidence`: 无；`hardPredecessors`: D1，等待已审查 staged snapshot。
- `consumes`: DOCS staged snapshot；`produces`: `docs: plan skill token arrow navigation` commit；`completionEvidence`: 新 commit id 与 `git show --stat --oneline HEAD` 只含两份 DOCS 文件。
- `readSet`: index、Git identity、staged diff；`writeSet`: 本地 Git object/ref；`stateEffects`: 一个本地 commit，禁止 amend/remote。
- `commandScope`: Git identity只读检查、`git commit -m 'docs: plan skill token arrow navigation'`、commit 只读核验；`executionContext`: 当前 `dev` checkout/index；`resourceLocks`: 当前 Git index/ref write；`owner`: DOCS Git 代理。
- `verification`: 设计状态为已确认、计划状态为已确认后再提交；`failureDomain`: 阻塞全部 FIX 节点；`replanTriggers`: 提交身份、hook 或 staged snapshot 漂移；`authorizationGate`: D1 完成且计划确认后 active。

### V0 — frontend formatter baseline

- `nodeId`: `V0`；`taskBoundary`: 无提交；`operationKind`: 验证；`outcome`: 编辑前 live oxfmt baseline 通过且 frontend 无计划外 dirty 文件。
- `estimatedCost`: S；`deferralEvidence`: 无；`hardPredecessors`: D2，等待文档提交门禁完成。
- `consumes`: 当前 frontend tree、live formatter/config；`produces`: clean baseline evidence；`completionEvidence`: `pnpm run format:oxfmt` 退出 0，Git status 无计划外 `codex-gui/**` 变化。
- `readSet`: `codex-gui/**` formatter inputs 与 Git status；`writeSet`: `[]`；`stateEffects`: formatter check 进程与普通缓存输出。
- `commandScope`: fnm/pnpm 预检、非 fix formatter、Git 只读检查；`executionContext`: `codex-gui` cwd；`resourceLocks`: frontend tree read；`owner`: baseline 验证代理。
- `verification`: 命中 live project；`failureDomain`: 阻塞 T1 及后继；`replanTriggers`: baseline 已失败或存在计划外 frontend dirty；`authorizationGate`: 计划确认且 D2 完成后 active。

### T1 — 增加两段式导航 Browser 回归

- `nodeId`: `T1`；`taskBoundary`: `FIX`；`operationKind`: 编辑；`outcome`: 参数化 Browser test 逐步覆盖 LTR/RTL 进入、退出、focus、Tooltip、selected、输入侧与 payload 保持。
- `estimatedCost`: M；`deferralEvidence`: 无；`hardPredecessors`: V0，等待可信 clean baseline。
- `consumes`: 已确认设计、现有 atomic/Tooltip/keyboard tests、本地 Vitest docs；`produces`: 单测试文件 regression diff；`completionEvidence`: 精确测试名存在，未新增 production test seam，既有原子删除/undo/redo 断言保留。
- `readSet`: design、research、目标 Browser test、Composer test helpers；`writeSet`: `codex-gui/src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx`；`stateEffects`: 单文件工作树修改。
- `commandScope`: `apply_patch` 与只读 diff/search；`executionContext`: 当前 checkout，不写 index；`resourceLocks`: Browser test file write；`owner`: FIX test 编辑代理。
- `verification`: 断言中间状态而非只看最终文本；`failureDomain`: 阻塞 VR 及后继；`replanTriggers`: 需要修改 controller/public prop、presentation 或计划外 fixture；`authorizationGate`: 计划确认且 V0 完成后 active。

### VR — 证明当前实现 expected red

- `nodeId`: `VR`；`taskBoundary`: `FIX`；`operationKind`: 验证；`outcome`: 精确 focused test 在当前 production 上因第二步无法退出而失败。
- `estimatedCost`: M；`deferralEvidence`: 无；`hardPredecessors`: T1，等待稳定 regression diff。
- `consumes`: T1 test 与 unchanged production；`produces`: root-cause-aligned red evidence；`completionEvidence`: 三实例实际收集目标，至少在预期退出/caret/input 断言失败，不是配置、编译、fixture 或工具错误。
- `readSet`: 目标 test、production、Browser configs；`writeSet`: `[]`；`stateEffects`: headless browser/test 进程、Vitest/Vite cache 与 Browser tsbuildinfo。
- `commandScope`: focused Vitest 命令；`executionContext`: `codex-gui` cwd；`resourceLocks`: Vitest Browser runner、Playwright processes、`node_modules/.vite/vitest/**` write、`node_modules/.tmp/tsconfig.vitest.browser.tsbuildinfo` write；`owner`: Browser red 验证代理。
- `verification`: 非零收集且失败与根因一致；`failureDomain`: 阻塞 E1 及后继；`replanTriggers`: 测试意外通过或失败暴露不同 owner；`authorizationGate`: T1 完成后 active。

### E1 — 补齐 Skill NodeSelection 退场

- `nodeId`: `E1`；`taskBoundary`: `FIX`；`operationKind`: 编辑；`outcome`: `SkillEditingPlugin` 只对单个 Skill NodeSelection 实现方向感知的 previous/next 退场。
- `estimatedCost`: S；`deferralEvidence`: 无；`hardPredecessors`: VR，等待可信 expected red。
- `consumes`: red evidence、Lexical 0.49.0 public APIs、已确认实现契约；`produces`: 单 production file behavior diff；`completionEvidence`: 两个 command 注册与一个局部转换 helper 完成，其他 selection 返回 false，无 Tooltip/DOM query/history/wire 修改。
- `readSet`: `SkillEditingPlugin.tsx`、`SkillNode` guard、Lexical public type/source；`writeSet`: `codex-gui/src/features/composerEditor/SkillEditingPlugin.tsx`；`stateEffects`: 单文件工作树修改。
- `commandScope`: `apply_patch` 与只读 diff/search；`executionContext`: 当前 checkout，不写 index；`resourceLocks`: Skill editing production file write；`owner`: FIX production 编辑代理。
- `verification`: 只使用公共 `selectPrevious()` / `selectNext()`，成功后才 prevent default；`failureDomain`: 阻塞 VG 及后继；`replanTriggers`: 公共 API 不足、需要通用 decorator owner、presentation 或计划外文件；`authorizationGate`: VR expected red 后 active。

### VG — focused green

- `nodeId`: `VG`；`taskBoundary`: `FIX`；`operationKind`: 验证；`outcome`: 精确两段式导航测试在三 Browser instance 全绿。
- `estimatedCost`: M；`deferralEvidence`: 无；`hardPredecessors`: E1，等待 production behavior diff。
- `consumes`: T1 regression 与 E1 implementation；`produces`: focused green evidence；`completionEvidence`: Chromium、Firefox、WebKit 非零收集且全部通过。
- `readSet`: 两份 FIX 文件与 Browser configs；`writeSet`: `[]`；`stateEffects`: headless browser/test 进程与 runner cache。
- `commandScope`: focused Vitest 命令；`executionContext`: `codex-gui` cwd；`resourceLocks`: 与 VR 相同的 Browser runner/cache writes；`owner`: Browser green 验证代理。
- `verification`: 不修改 test 或 production 取得 green；`failureDomain`: 阻塞 F1 及后继；`replanTriggers`: 需要 fallback、容差、skip、删除覆盖或额外 owner；`authorizationGate`: E1 完成后 active。

### F1 — 权威 frontend 格式化

- `nodeId`: `F1`；`taskBoundary`: `FIX`；`operationKind`: 格式化；`outcome`: live oxfmt 对项目执行后只保留两份 FIX 文件的必要格式化。
- `estimatedCost`: S；`deferralEvidence`: 无；`hardPredecessors`: VG，等待行为 focused green。
- `consumes`: 两份 FIX diff 与 clean V0 baseline；`produces`: formatted FIX diff；`completionEvidence`: `format:oxfmt:fix` 退出 0，allowlist 外无新 diff，FIX 内无纯顺序重排。
- `readSet`: `codex-gui/**` formatter inputs；`writeSet`: `codex-gui/**`（命令固有 project-wide 写边界，最终 retained allowlist 仅两份 FIX 文件）；`stateEffects`: formatter 写入。
- `commandScope`: fnm-backed `pnpm run format:oxfmt:fix` 与 Git 只读 diff；`executionContext`: `codex-gui` cwd；`resourceLocks`: `codex-gui/**` write；`owner`: FIX formatter 代理。
- `verification`: 范围外 diff 立即停止，不主动恢复；`failureDomain`: 阻塞 V1/V2/V3/V4/A1/R1/S1/C1；`replanTriggers`: formatter 扩大 retained diff 或改变行为；`authorizationGate`: VG 后 active。

### V1 — formatter check

- `nodeId`: `V1`；`taskBoundary`: `FIX`；`operationKind`: 验证；`outcome`: live oxfmt check 通过。
- `estimatedCost`: S；`deferralEvidence`: 无；`hardPredecessors`: F1，等待 formatted diff。
- `consumes`: formatted FIX diff；`produces`: format evidence；`completionEvidence`: `pnpm run format:oxfmt` 退出 0。
- `readSet`: frontend formatter inputs；`writeSet`: `[]`；`stateEffects`: check 进程；`commandScope`: fnm-backed format check；`executionContext`: `codex-gui` cwd；`resourceLocks`: frontend tree read；`owner`: format 验证代理。
- `verification`: 命中 live project；`failureDomain`: 阻塞 R1/S1/C1；`replanTriggers`: formatter/config 漂移；`authorizationGate`: F1 后 active。

### V2 — lint

- `nodeId`: `V2`；`taskBoundary`: `FIX`；`operationKind`: 验证；`outcome`: live frontend lint 通过。
- `estimatedCost`: M；`deferralEvidence`: 无；`hardPredecessors`: F1，等待 formatted diff。
- `consumes`: formatted FIX diff 与 lint config；`produces`: lint evidence；`completionEvidence`: `pnpm run lint` 退出 0。
- `readSet`: `codex-gui/**` lint inputs；`writeSet`: `[]`；`stateEffects`: lint 进程与 `.eslintcache` 自动缓存。
- `commandScope`: fnm-backed `pnpm run lint`；`executionContext`: `codex-gui` cwd；`resourceLocks`: source tree read、`.eslintcache` write；`owner`: lint 验证代理。
- `verification`: 禁止 fix 模式或新增豁免；`failureDomain`: 阻塞 R1/S1/C1；`replanTriggers`: 本次修改引入 lint 问题则插入局部 FIX 修正，预存问题只报告；`authorizationGate`: F1 后 active。

### V3 — type-check

- `nodeId`: `V3`；`taskBoundary`: `FIX`；`operationKind`: 验证；`outcome`: live frontend type-check 通过。
- `estimatedCost`: M；`deferralEvidence`: 无；`hardPredecessors`: F1，等待 formatted diff。
- `consumes`: formatted FIX diff、TypeScript configs 与 generated contracts；`produces`: type evidence；`completionEvidence`: `pnpm run type-check` 退出 0。
- `readSet`: frontend TypeScript/config/generated inputs；`writeSet`: `[]`；`stateEffects`: type-check 进程与 `node_modules/.tmp/*.tsbuildinfo` 自动缓存。
- `commandScope`: fnm-backed `pnpm run type-check`；`executionContext`: `codex-gui` cwd；`resourceLocks`: TypeScript build-info files write；`owner`: type-check 验证代理。
- `verification`: 禁止修改 tsconfig、contract 或降低检查；`failureDomain`: 阻塞 R1/S1/C1；`replanTriggers`: generated input 缺失或本次改动暴露计划外 contract change；`authorizationGate`: F1 后 active。

### V4 — 目标 Browser 文件 closure

- `nodeId`: `V4`；`taskBoundary`: `FIX`；`operationKind`: 验证；`outcome`: 整个 `ComposerEditor.browser.test.tsx` 在三 Browser instance 全绿。
- `estimatedCost`: L；`deferralEvidence`: 无；`hardPredecessors`: F1，等待 formatted diff。
- `consumes`: 完整 FIX diff、目标 Browser file/config；`produces`: Level 1 closure evidence；`completionEvidence`: Chromium、Firefox、WebKit 非零收集目标文件且全部通过。
- `readSet`: ComposerEditor production/test dependencies 与 Browser configs；`writeSet`: `[]`；`stateEffects`: headless browser/test 进程、Vitest/Vite cache 与 Browser tsbuildinfo。
- `commandScope`: 目标文件 Vitest 命令；`executionContext`: `codex-gui` cwd；`resourceLocks`: Browser runner、Playwright processes、`node_modules/.vite/vitest/**` write、Browser tsbuildinfo write；`owner`: Level 1 验证代理。
- `verification`: 不以 smoke 或零收集代替；`failureDomain`: 阻塞 A1/R1/S1/C1；`replanTriggers`: 失败指向计划外接口/owner 或既有行为冲突；`authorizationGate`: F1 后 active。

V1、V2、V3、V4 在 F1 后形成 fan-out ready set。共享源码只读不构成依赖；V3 与 V4 对 Browser tsbuildinfo 的重叠写锁必须串行，其他节点可在锁与容量允许时并发。不能用任务编号或 agent 复用制造额外串行边。

### A1 — Level 2 无头真实 runtime 验收

- `nodeId`: `A1`；`taskBoundary`: `FIX`；`operationKind`: 验证；`outcome`: 真实普通/pending Composer 满足计划中的两段式导航、Tooltip/Tab 隔离与连续边界场景。
- `estimatedCost`: L；`deferralEvidence`: 无；`hardPredecessors`: V4，等待 Level 1 稳定行为证据。
- `consumes`: 当次完整 GUI URL、真实 runtime/catalog、Level 1 stable diff；`produces`: Level 2 acceptance evidence；`completionEvidence`: 非 headed session、实际 route/state 与全部适用场景结果有记录。
- `readSet`: 当次 GUI runtime/DOM；`writeSet`: `[]`；`stateEffects`: headless browser session与页面输入/selection状态。
- `commandScope`: 仅当次 `playwright-cli open '<complete current GUI URL>'`、`playwright-cli list --json` 与同 session snapshot/keyboard 交互；`executionContext`: 当前真实 GUI runtime；`resourceLocks`: headless browser session write；`owner`: Level 2 验收代理。
- `verification`: 旧 URL、fixture、截图或仅打开页面不算证据；`failureDomain`: 阻塞 R1/S1/C1 与完全验证声明；`replanTriggers`: runtime 显示不同 selection/scroll/focus owner，或只有可见桌面才能证明；`authorizationGate`: V4 后 active，禁止 headed。

### R1 — FIX fan-in 审查

- `nodeId`: `R1`；`taskBoundary`: `FIX`；`operationKind`: fan-in；`outcome`: 两文件 diff、Level 1、Level 2、format、lint、type-check 与设计逐项一致，可进入精确暂存。
- `estimatedCost`: M；`deferralEvidence`: 无；`hardPredecessors`: V1、V2、V3、V4、A1，等待全部稳定证据。
- `consumes`: 完整 FIX diff 与所有验证证据；`produces`: reviewed FIX snapshot；`completionEvidence`: allowlist 外无 retained diff，无纯顺序整理、fallback、第二 owner、接口或数据变化。
- `readSet`: 两份 FIX 文件、Git diff/status、验证输出；`writeSet`: `[]`；`stateEffects`: 无。
- `commandScope`: Git/rg/sed 只读审查；`executionContext`: 当前 checkout；`resourceLocks`: FIX files read；`owner`: 主协调审查 owner。
- `verification`: 对照设计完成标准逐项核验；`failureDomain`: 阻塞 S1/C1；`replanTriggers`: diff 或证据越出计划边界；`authorizationGate`: 全部前置成功后 active。

### S1 — 精确暂存 FIX

- `nodeId`: `S1`；`taskBoundary`: `FIX`；`operationKind`: stage；`outcome`: index 只包含两份 FIX 文件。
- `estimatedCost`: S；`deferralEvidence`: 无；`hardPredecessors`: R1，等待 reviewed snapshot。
- `consumes`: reviewed FIX snapshot；`produces`: FIX staged snapshot；`completionEvidence`: staged name-status/diff 只含 allowlist，`git diff --cached --check` 通过。
- `readSet`: Git status/diff、FIX files、index；`writeSet`: 当前 Git index，仅 FIX allowlist；`stateEffects`: 精确 index 更新。
- `commandScope`: Git 只读检查、`git add -- <两份 FIX 文件>`、cached check；`executionContext`: 当前 checkout/index；`resourceLocks`: Git index write；`owner`: FIX Git 代理。
- `verification`: DOCS 已独立提交，其他状态不进入 index；`failureDomain`: 阻塞 C1；`replanTriggers`: index 污染或 allowlist 漂移；`authorizationGate`: R1 后 active。

### C1 — 创建 FIX 提交

- `nodeId`: `C1`；`taskBoundary`: `FIX`；`operationKind`: commit；`outcome`: 创建独立本地行为修复提交。
- `estimatedCost`: S；`deferralEvidence`: 无；`hardPredecessors`: S1，等待已审查 staged snapshot。
- `consumes`: FIX staged snapshot；`produces`: `fix(gui): let caret exit selected skill tokens` commit；`completionEvidence`: 新 commit id、两文件 stat 与 clean cached diff。
- `readSet`: index、Git identity、staged diff；`writeSet`: 本地 Git object/ref；`stateEffects`: 一个本地 commit，禁止 amend/squash/remote。
- `commandScope`: Git identity只读检查、精确 `git commit -m 'fix(gui): let caret exit selected skill tokens'`、commit 只读核验；`executionContext`: 当前 checkout/index；`resourceLocks`: Git index/ref write；`owner`: FIX Git 代理。
- `verification`: commit 只含行为与回归测试，不含 order-only 改动；`failureDomain`: 阻塞完成声明；`replanTriggers`: hook、身份或 staged snapshot 漂移；`authorizationGate`: S1 后 active。

## Ready set、关键路径与提交拓扑

- 初始可执行节点：计划确认后只有 D0；D2 完成前所有实现与 frontend 验证都被工作文档提交门禁阻塞。
- 预计关键路径：D0 → D1 → D2 → V0 → T1 → VR → E1 → VG → F1 → V4 → A1 → R1 → S1 → C1。
- fan-out：F1 后 V1/V2/V3/V4 同时 ready；V3/V4 因同一 Browser tsbuildinfo write lock 串行，其他无冲突验证应及时调度。A1 在 V4 完成后可与尚未完成的 V1/V2/V3 并发。
- fan-in：R1 等待 V1/V2/V3/V4/A1 的稳定证据；任务编号、文档顺序或 agent 复用不产生额外依赖。
- 提交拓扑：`DOCS` commit → `FIX` commit；两者都直接落在当前 `dev` branch，使用同一 checkout/index，无 worktree/branch 合并、无 squash、无 amend、无 remote。
- 失败域：节点失败只暂停其声明后继；F1 后彼此无依赖的验证继续耗尽。任何修正已有提交的工作必须形成新的独立提交，不得 amend。

## 重新计划与停止条件

出现以下任一情况，停止受影响节点及其依赖后继并回到事实、设计、计划或授权门禁：

- expected red 意外通过，或失败来自测试配置、浏览器、fixture、工具链而非 NodeSelection 退场；
- 需要修改 `SelectedSkillToken`、`SkillNode` public interface、Composer controller、通用 DecoratorNode、catalog/draft/clipboard/queue/protocol/Rust 或新增文件；
- Lexical public API/方向语义与计划证据不一致，必须导入 rich-text 私有 helper、构造 DOM Range 或增加兼容路径；
- formatter 产生 FIX allowlist 外 diff，或任何工具需要安装/更新依赖；
- Level 2 显示 Tooltip、focus、caret 或 scroll 的真实 owner 与设计不同，或需要可见桌面才能证明；
- 为取得 green 需要 skip、fallback、容差、放宽断言、删除覆盖、修改基线、关闭检查或新增豁免；
- 分支、HEAD、Git index、文件路径、计划状态或授权边界发生实质漂移。

本次实现直接引入的 lint/type/test/format 问题在原两文件边界内创建局部修正节点并重新运行受影响证据；预存、无关或自行发现的其他问题只报告，不修复。

## 完成标准

1. 设计与计划先形成独立 DOCS 本地提交，FIX 再形成独立行为提交。
2. 单个 Skill `NodeSelection` 在 LTR/RTL 下都能按视觉 Left/Right 退出到 collapsed `RangeSelection` 的正确一侧。
3. 进入与退出均保持 editor root DOM focus；方向键不显示 Tooltip、不提交、不修改 Skill identity 或结构化 payload。
4. 其他 selection、多个节点与其他 decorator 不被项目 handler 认领；Trigger `Tab`/focus/Space/Enter、替换、删除、undo/redo、clipboard、draft 与 IME 语义保持。
5. focused red/green、目标 Browser 文件三浏览器 closure、format、lint、type-check 与 Level 2 均分别产生可信证据；Level 3 明确不适用。
6. 最终 retained/staged/committed diff 只含两份 DOCS 文件和两份 FIX 文件，没有 research、临时载体、计划外文件、order-only 提交、remote 或 force 操作。

## 阶段边界

本文状态为“已确认（2026-08-31）”。用户已明确确认本计划；下一步必须先完成 DOCS 独立本地提交门禁。该提交成功前，不得修改实现或测试、运行 formatter、测试、浏览器或 Level 2 验收。
