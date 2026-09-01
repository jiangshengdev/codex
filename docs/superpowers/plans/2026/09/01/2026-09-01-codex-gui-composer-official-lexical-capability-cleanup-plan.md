# Codex GUI Composer 回归 Lexical 0.49 官方能力实施计划

## 状态

- 计划状态：已确认
- 日期：2026-09-01
- 当前分支：`dev`
- tracked 基线：`8adf24f5caffa3a9c1b0bf8b3626b50996af3ec8`
- 设计依据：[Codex GUI Composer 回归 Lexical 0.49 官方能力设计](../../../specs/2026/09/01/2026-09-01-codex-gui-composer-official-lexical-capability-cleanup-design.md)
- 调研依据：[Composer 官方能力清理机械汇总](../../../research/2026/09/01/2026-09-01-composer-editor-official-capability-cleanup.md)
- Lexical 基线：`/Users/jiangsheng/GitHub/lexical` 的 `0.49.0__release@ffe90924bd55b5d450c88de0f9f1c8b228c4a221`（tag `v0.49.0`）

## 目标与边界

本计划清理整个 Composer 输入框中没有独立业务必要性的自研编辑层，让 Lexical 0.49 重新拥有普通文本光标、selection、四方向键、默认 history 粒度和 typeahead 菜单键盘/滚动行为；Composer 只保留 skill、structured payload、draft、clipboard、IME、无障碍、canonical identity、queue / pending restore 等业务合同。

硬边界：

- 保留 `PlainTextPlugin`，不迁移到 `RichTextPlugin`。
- 不回移 Lexical 0.49 之后的补丁，不补齐 textarea 完整选择语义，不新增 fallback、兼容层、DOM range、坐标或浏览器特判。
- chip 保持单选；`Shift+click` 不引入多选。
- 删除 history continuation / `HISTORY_MERGE_TAG`，接受 Lexical 0.49 默认 Undo 粒度。
- 保留最小 per-editor ID `MutationObserver`，只同步 typeahead menu/option ID 与 `aria-controls` / `aria-activedescendant`；不得扩张为通用 DOM、selection、焦点或光标修正层。
- 保留 `COMPOSITION_START_COMMAND` cleanup，删除重复的原生 `compositionstart` listener。
- 不修改 queue、pending、协议、payload、catalog owner、clipboard、draft、presentation projection 或 query 算法。
- 不进行纯 import、声明、字段、分支、函数或组件顺序整理；若自动格式化产生计划外顺序变化，暂停对应提交。
- 不创建 worktree，不安装依赖，不打开可见浏览器或 DevTools，不操作 remote，不 force，不 amend，不 squash。

HeroUI 边界：继续使用现有 `Chip`、`Tooltip`、`Button` 以及 `@heroui/styles` 的 `select` / `listbox` semantic variants；保留现有 `primary`、`secondary`、`soft`、`danger`、`accent`、`default`、`muted`、`separator` 等语义，不改变样式、布局或组件层级。自定义 `span`、`ul`、`li` 继续承担 Lexical decorator、listbox ARIA 与 portal 结构，原因是这些是编辑器协议和语义节点，不是要替换的通用控件。

## 计划前证据闭包

| 字段 | 当前证据与计划映射 |
| --- | --- |
| 权威入口 | `ComposerEditor.tsx` 挂载 `PlainTextPlugin`、`HistoryPlugin`、`SkillEditingPlugin`、`SkillTypeaheadPlugin` 与 `EnterCommandPlugin`；`SkillNode` 是 structured skill decorator；Lexical 0.49 的 `LexicalTypeaheadMenuPlugin`、`NodeSelection`、`CLICK_COMMAND` 和 composition command 是官方接入点。 |
| 已追踪链路 | 已追踪主 Composer、pending Composer、controller capture/restore、draft compile、clipboard、queue/pending restore、IME、typeahead ARIA、两 editor 同时打开菜单、mount/unmount cleanup 和三浏览器 Browser Mode。公共 controller、draft、payload 与 queue 合同不因本计划改变。 |
| 修改范围 | 生产源码只涉及 `SkillEditingPlugin.tsx`、`SkillNode.ts`、`SelectedSkillToken.tsx`、`ComposerEditor.tsx`、`SkillTypeaheadPlugin.tsx`；测试只修改 `ComposerEditor.browser.test.tsx` 与 `SkillNode.test.ts`。每个文件都对应重复 owner、过度自研层或被删除实现的测试 owner。 |
| 验证映射 | `SkillNode.test.ts` 验证序列化与 identity；四个 Composer unit 文件保护 draft/query/presentation；`ComposerEditor.browser.test.tsx` 在 Chromium/Firefox/WebKit 中验证激活、替换、删除、Enter、IME、typeahead、ARIA 与多 editor；sequential clipboard Browser test 保护 structured clipboard；format/lint/type-check 保护静态合同。 |
| 排除项 | `ComposerClipboardPlugin.tsx`、`composerDraft.ts`、`selectedSkillPresentation.ts`、`skillQuery.ts`、queue/pending/协议/payload 均有独立业务 owner且公共接口不变；`HistoryPlugin`、`PlainTextPlugin`、`LexicalTypeaheadMenuPlugin` 已挂载，无需新增官方 plugin。 |
| 剩余未知 | 无关键未知。非关键未知是删除定制 history 与导航后 Lexical 0.49 在具体浏览器中的体验粒度；这是设计明确接受的结果，若实施发现必须恢复自研算法才能维持被列为“必须保持”的业务合同，则停止受影响节点并回到设计。 |

## 精确读写集合

生产源码 `writeSet`：

- `codex-gui/src/features/composerEditor/SkillEditingPlugin.tsx`
- `codex-gui/src/features/composerEditor/SkillNode.ts`
- `codex-gui/src/features/composerEditor/SelectedSkillToken.tsx`
- `codex-gui/src/features/composerEditor/ComposerEditor.tsx`
- `codex-gui/src/features/composerEditor/SkillTypeaheadPlugin.tsx`

测试 `writeSet`：

- `codex-gui/src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx`
- `codex-gui/src/features/composerEditor/__tests__/SkillNode.test.ts`

只读回归 `readSet` 还包括：

- `codex-gui/src/features/composerEditor/ComposerClipboardPlugin.tsx`
- `codex-gui/src/features/composerEditor/composerDraft.ts`
- `codex-gui/src/features/composerEditor/selectedSkillPresentation.ts`
- `codex-gui/src/features/composerEditor/skillQuery.ts`
- `codex-gui/src/features/composerEditor/__tests__/composerDraft.test.ts`
- `codex-gui/src/features/composerEditor/__tests__/selectedSkillPresentation.test.ts`
- `codex-gui/src/features/composerEditor/__tests__/skillQuery.test.ts`
- `codex-gui/src/__tests__/sequential/composerClipboard.browser.test.tsx`
- `codex-gui/package.json`、Vitest Browser 配置、TypeScript / lint / formatter 配置
- Lexical 0.49 参考源码中 selection、plain-text、menu、typeahead、events、Equation 与 DateTime 相关实现

## 任务与独立提交边界

### TASK-1：删除 Composer 自研导航与 history continuation

修改 `SkillEditingPlugin.tsx` 与 `ComposerEditor.browser.test.tsx`：

- 删除四方向 command 注册以及 `Selection.modify()`、DOMRect/caret 几何、RTL 推断、scroll/focus/DOM selection 恢复和双 RAF 清理。
- 删除 history continuation、`HISTORY_MERGE_TAG` 与只服务该策略的 before-input continuation 状态。
- 删除无项目调用路径的 `CONTROLLED_TEXT_INSERTION_COMMAND`、`DELETE_CHARACTER_COMMAND` 注册和重复删除 helper。
- 保留 `BEFORE_INPUT_COMMAND`、`KEY_BACKSPACE_COMMAND`、`KEY_DELETE_COMMAND` 的最薄 NodeSelection adapter，分别只调用官方 `NodeSelection.insertNodes()` / `deleteNodes()`；删除这些 adapter 内的主动 editor focus 修正，不引入任何 focus、DOM selection 或恢复算法。
- 删除只验证自研四方向、DOM 几何、RTL 命中、selection 恢复和 history continuation 的测试与专用 fixture/helper；保留并收敛 replacement、atomic delete、default Undo/Redo、typeahead ownership 等业务测试。

提交边界：`refactor(gui): remove custom composer navigation`

### TASK-2：使用官方 node-selection 接入并收敛 SkillNode 序列化

修改 `SkillNode.ts`、`SelectedSkillToken.tsx`、`SkillNode.test.ts` 与必要的 `ComposerEditor.browser.test.tsx` 断言：

- `SerializedSkillNode` 基于 `SerializedLexicalNode`，`exportJSON()` 展开 `super.exportJSON()` 后追加 skill canonical / presentation 字段、`type` 与 `version`；删除 TextNode 风格字段断言。
- 删除无调用的 `canInsertTextBefore()` / `canInsertTextAfter()` override。
- 参照 Lexical 0.49 官方 Equation 模式，使用 `CLICK_COMMAND + useLexicalNodeSelection` 接入 decorator selection；项目仅保留“先清空、再单选当前 chip”的产品规则。
- Enter、Space、Backspace、Delete 复用同一个单选 primitive；`Shift+click` 仍只选当前 chip；删除 `activateSkillNode` 与其返回类型。
- Tooltip 仍只由 hover/Tab DOM focus 驱动，Chip `data-selected` / semantic variant、canonical identity 与 structured payload 不变；只验证官方 command 与单选接入产生的实际 focus 结果，不新增或恢复通用 DOM focus、selection 或异步恢复 helper。

提交边界：`refactor(gui): use lexical skill node selection`

### TASK-3：收敛 Composer Enter owner

修改 `ComposerEditor.tsx` 与必要的 `ComposerEditor.browser.test.tsx` 断言：

- 删除 ContentEditable root DOM `onKeyDown` Enter owner及其只服务该路径的 React event import/callback。
- 只保留 `EnterCommandPlugin` 的 `KEY_ENTER_COMMAND` owner，继续维持 typeahead 优先级、Shift+Enter 换行、guide shortcut、IME guard、disabled/read-only 与 submit snapshot 合同。
- 不改变 `ComposerEditorProps`、controller、submit payload 或外部调用方。

提交边界：`refactor(gui): use lexical composer enter command`

### TASK-4：收敛 Typeahead 的 composition 与滚动 owner

修改 `SkillTypeaheadPlugin.tsx`、`ComposerEditor.tsx` 与 `ComposerEditor.browser.test.tsx`：

- 保留 `editor.registerRootListener` 以及 previous/current root 的 `configureComboboxRoot(..., false/true)` mount、replacement 与 unmount lifecycle；只从该 effect 删除 `addEventListener` / `removeEventListener("compositionstart", ...)` 和仅服务原生 listener 的 `currentRoot` bookkeeping。composition cleanup 只保留 `COMPOSITION_START_COMMAND`；`ComposerEditor` 的 `isComposingRef` 继续服务 Enter guard，但不再作为 Typeahead prop。
- Typeahead 内使用 `editor.isComposing()` 与官方 command 生命周期，不再维护重复 React composition ref 分支。
- 删除项目 `useLayoutEffect(...scrollIntoView...)`，让 `LexicalTypeaheadMenuPlugin` 成为 option keyboard navigation 和滚动的唯一 owner。
- 保留 `$` trigger、catalog query/order、SkillNode 插入、HeroUI renderer、placement、pointer selection、combobox role/expanded 与 retry 状态。
- 保留且仅保留当前 per-editor menu/option ID 同步所需的 `MutationObserver`；其 observer target、attribute filter、cleanup 和 helper 必须限制在 ID 与 ARIA 引用，禁止增加其他 DOM 或 selection 行为。
- 保持 compositionstart 立即关闭已打开菜单、多 editor ID 唯一且各自 ARIA 引用正确、Escape/Tab/Enter/typeahead scroll 与 mount/unmount cleanup 合同。

提交边界：`refactor(gui): defer composer typeahead behavior to lexical`

## 权威验证入口

所有 frontend 命令的 cwd 均为 `/Users/jiangsheng/cnb/codex/codex-gui`，统一使用 `/opt/homebrew/bin/fnm exec --using-file pnpm ...`。执行前先运行：

```bash
/opt/homebrew/bin/fnm env --shell zsh
/opt/homebrew/bin/fnm exec --using-file pnpm --version
```

若 fnm、pnpm、现有 Browser runtime 或项目入口缺失，停止依赖分支；禁止安装或改用 Codex runtime shim。

每个 TASK 在提交前运行与该任务直接相关的 unit / Browser 文件级验证；Browser 命令必须确认 Chromium、Firefox、WebKit 均实际非零收集目标文件：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:parallel --run src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx
```

TASK-2 还运行：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit -- src/features/composerEditor/__tests__/SkillNode.test.ts src/features/composerEditor/__tests__/composerDraft.test.ts
```

每个 TASK 在验证前通过权威 formatter 入口格式化，并检查 retained diff 仍限于该任务 allowlist：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt:fix
```

四个 TASK 提交完成后形成最终 fan-out：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit -- src/features/composerEditor/__tests__/SkillNode.test.ts src/features/composerEditor/__tests__/composerDraft.test.ts src/features/composerEditor/__tests__/selectedSkillPresentation.test.ts src/features/composerEditor/__tests__/skillQuery.test.ts
```

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:parallel --run src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx
```

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:sequential --run src/__tests__/sequential/composerClipboard.browser.test.tsx
```

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
/opt/homebrew/bin/fnm exec --using-file pnpm run lint
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

`pnpm run ci` 只收集 Browser smoke，不能替代目标 Composer Browser 文件。任何零收集、错误配置、fixture 失败或工具错误都不算产品验证。

Level 1 为上述 Vitest Browser Mode。Level 2 在全部自动验证通过后，通过项目规定的 `$gui-launch` / `/gui` 入口取得当次完整 GUI URL，禁止拼接或复用旧 URL；随后使用无头 Browser 控制入口执行 `playwright-cli open '<complete current GUI URL>'` 与 `playwright-cli list --json`，先证明 session 明确为 non-headed，再进行真实 Codex runtime 验收。主 Composer 中检查普通文本输入、skill 插入、单选激活、替换、原子删除、Enter/Shift+Enter、typeahead 键盘/滚动与 ARIA；当真实 pending Composer 状态可通过正常产品路径建立时，同时检查两个 Composer 的 typeahead ID 与 ARIA 归属。必须记录实际 route/state、非 headed session 与每个场景结果；旧 URL、fixture 或仅打开页面不构成证据。URL、runtime 或必要真实状态不可得时，标记对应 Level 2 场景未执行，不声明完全验证，也不切换 visible mode。

Level 3 不适用：本计划不改变依赖可见桌面、DevTools、跨应用 focus 或系统 IME UI 的产品结果；IME command 链由三浏览器 Browser Mode 的 composition 事件与真实无头 Composer 交互验证。不得为本计划打开可见窗口。

## 描述式执行 DAG

下列节点字段按 `$delegating-micro-stages` 执行图契约解释；完整能力信封在计划确认后、节点进入 ready set 前由 `$action-authorization` 逐节点收紧。所有节点 `subdelegation: false`。

### D0 — 工作文档门禁预检

- `nodeId`: `D0`; `taskBoundary`: `DOCS`; `operationKind`: 审查。
- `outcome`: 证明设计与本计划是唯一待提交工作文档，状态分别为已确认与已确认后可提交，research 因 ignore 不进入提交。
- `estimatedCost`: S; `deferralEvidence`: 无。
- `hardPredecessors`: 计划确认；等待用户明确确认本计划。
- `consumes`: 设计、计划、Git identity/status/index、tracked baseline；`produces`: 精确 DOCS allowlist。
- `completionEvidence`: branch/HEAD 未漂移，index 无范围外内容，allowlist 仅设计与计划。
- `readSet`: 两份 DOCS 文件与 Git metadata；`writeSet`: `[]`; `stateEffects`: 无。
- `commandScope`: Git/文件只读检查；`executionContext`: 当前 `dev` checkout/index。
- `resourceLocks`: 当前 Git index/ref read；`owner`: DOCS 审查 owner。
- `verification`: 设计与计划内容、状态、diff 和 ignore 规则逐项核对。
- `failureDomain`: 阻塞 D1 及全部实现；`replanTriggers`: branch、HEAD、文档路径、内容或 index 漂移。
- `authorizationGate`: 计划确认后 active。

### D1 — 精确暂存 DOCS

- `nodeId`: `D1`; `taskBoundary`: `DOCS`; `operationKind`: stage。
- `outcome`: 精确暂存设计与计划，形成已审查 DOCS staged snapshot。
- `estimatedCost`: S; `deferralEvidence`: 无。
- `hardPredecessors`: D0；等待已审查 DOCS allowlist。
- `consumes`: DOCS allowlist；`produces`: DOCS staged snapshot。
- `completionEvidence`: staged diff/check 只含两份 DOCS，不含 research、源码或测试。
- `readSet`: 两份 DOCS、Git status/diff/index；`writeSet`: 当前 Git index。
- `stateEffects`: 精确 index 更新。
- `commandScope`: 精确 `git add -- <design> <plan>`、cached diff/check 与只读核验。
- `executionContext`: 当前 `dev` checkout/index；`resourceLocks`: 当前 Git index write；`owner`: DOCS stage owner。
- `verification`: staged snapshot 与 allowlist 逐字一致。
- `failureDomain`: 阻塞 D2 及所有 TASK 节点；`replanTriggers`: staged snapshot、index 或 HEAD 漂移。
- `authorizationGate`: 计划确认且 D0 完成后 active。

### D2 — 创建独立 DOCS 提交

- `nodeId`: `D2`; `taskBoundary`: `DOCS`; `operationKind`: commit。
- `outcome`: 从已审查 staged snapshot 创建一个独立本地 DOCS commit。
- `estimatedCost`: S; `deferralEvidence`: 无；`hardPredecessors`: D1。
- `consumes`: DOCS staged snapshot；`produces`: `docs: plan composer lexical capability cleanup` commit。
- `completionEvidence`: 新 commit id；commit stat 只含设计与计划；cached diff 为空。
- `readSet`: staged diff、Git identity/index；`writeSet`: 本地 Git object/ref。
- `stateEffects`: 一个本地 commit；禁止 amend、squash、remote。
- `commandScope`: Git identity只读核验、`git commit -m 'docs: plan composer lexical capability cleanup'` 与 commit 只读核验。
- `executionContext`: 当前 `dev` checkout/index；`resourceLocks`: 当前 Git index/ref write；`owner`: DOCS commit owner。
- `verification`: 提交后 working tree 只保留计划外或 ignored 既有状态。
- `failureDomain`: 阻塞所有 TASK 节点；`replanTriggers`: identity、hook、staged snapshot 或 HEAD 漂移。
- `authorizationGate`: D1 完成后 active。

### B0 — Frontend 执行环境与 formatter baseline

- `nodeId`: `B0`; `taskBoundary`: 无提交；`operationKind`: 验证。
- `outcome`: 证明 fnm/pnpm、Browser runtime、live scripts 与编辑前 formatter baseline 可用，且计划文件之外无 `codex-gui/**` dirty diff。
- `estimatedCost`: S; `deferralEvidence`: 无。
- `hardPredecessors`: D2；等待工作文档提交门禁完成。
- `consumes`: live package scripts/config/toolchain；`produces`: 可信 frontend baseline evidence。
- `completionEvidence`: fnm-backed pnpm 来源正确，`format:oxfmt` 通过，目标 tests 的 discovery 配置命中，Git status 无计划外 frontend diff。
- `readSet`: `codex-gui/**` formatter/test inputs 与 Git status；`writeSet`: `[]`。
- `stateEffects`: check/test discovery 的正常缓存，不主动操作缓存。
- `commandScope`: fnm/pnpm 预检、非 fix formatter、只读 config/Git 检查。
- `executionContext`: `codex-gui` cwd，共享 checkout；`resourceLocks`: frontend tree read、formatter runner read。
- `owner`: baseline 验证 owner；`verification`: 入口与目标命中均来自 live package/config。
- `failureDomain`: 阻塞 E1 及全部实现；`replanTriggers`: 缺工具、入口、目标收集或 baseline 失败。
- `authorizationGate`: 计划确认且 D2 完成后 active。

### TASK 执行节点模板

下列四个任务按 `TASK-1 -> TASK-2 -> TASK-3 -> TASK-4` 串行，不是编号惯例，而是它们共享 `ComposerEditor.browser.test.tsx`、当前 checkout/index 和前一任务 commit 形成的稳定源码基线；未授权独立 worktree 时并行会产生 write/write 与 Git index/ref 冲突。

每个 `TASK-N` 展开为五个节点：

- `EN`（编辑）：`operationKind: 编辑`；`outcome`: 完成该任务章节声明的唯一 behavior/refactor diff；`readSet`: 该任务源码、测试、设计、Lexical 0.49 对应 owner；`writeSet`: 该任务章节列出的文件；`stateEffects`: working-tree 修改；`commandScope`: `apply_patch` 与只读搜索/diff；`resourceLocks`: task writeSet write；`owner`: 唯一编辑 owner；`verification`: 不越出任务边界；`replanTriggers`: 需要新增 owner、文件、fallback、兼容层或用户可见产品结果。
- `FN`（格式化）：`operationKind: 格式化`；`outcome`: `format:oxfmt:fix` 后 retained diff 仍只含任务 allowlist；`hardPredecessors`: EN；`readSet/writeSet`: formatter 的 project-wide 固有范围，最终 retained writeSet 仅任务 allowlist；`stateEffects`: formatter 写入；`commandScope`: fnm-backed `pnpm run format:oxfmt:fix` 与只读 diff；`resourceLocks`: `codex-gui/**` write；`owner`: 该任务唯一 formatter owner；`replanTriggers`: allowlist 外 diff或 order-only churn。
- `VN`（验证）：`operationKind: 验证`；`outcome`: 该任务章节映射的 unit/Browser 文件级验证通过；`hardPredecessors`: FN；`readSet`: 当前 task diff、测试和 configs；`writeSet`: `[]`；`stateEffects`: headless test/browser 进程与 runner 自动缓存；`commandScope`: 上述 fnm-backed权威入口；`resourceLocks`: Vitest/Playwright runner、Vite cache、Browser tsbuildinfo write；`owner`: 该任务验证 owner；`completionEvidence`: 退出 0 且目标非零收集；`replanTriggers`: 失败指向计划外 owner、需降低检查或恢复自研算法。
- `SN`（stage）：`operationKind: stage`；`outcome`: 只暂存该任务 allowlist并形成已审查 staged snapshot；`hardPredecessors`: VN；`readSet`: task diff与 Git index；`writeSet`: 当前 Git index；`stateEffects`: 精确 index 更新；`commandScope`: 精确 `git add -- <task allowlist>`、cached diff/check与只读核验；`resourceLocks`: 当前 Git index write；`owner`: 该任务唯一 stage owner；`completionEvidence`: staged snapshot 只含任务 allowlist；`replanTriggers`: index、allowlist 或 HEAD 漂移。
- `CN`（commit）：`operationKind: commit`；`outcome`: 从已审查 staged snapshot 创建章节声明的独立本地 commit；`hardPredecessors`: SN；`readSet`: staged diff、Git identity/index；`writeSet`: 本地 Git object/ref；`stateEffects`: 一个本地 commit；`commandScope`: Git identity只读核验、章节声明的精确 commit message 与 commit 只读核验；`resourceLocks`: 当前 Git index/ref write；`owner`: 该任务唯一 commit owner；`completionEvidence`: commit id、stat、clean cached diff；`replanTriggers`: identity、hook、staged snapshot 或 HEAD 漂移。

所有模板节点 `estimatedCost`: E/F/S/C 为 S-M、V 为 M-L；`deferralEvidence`: 无；`executionContext`: 当前 `dev` checkout/index；`subdelegation`: false。每个节点的 `failureDomain` 只覆盖同任务后继与消费该 commit 的后续任务；已完成且不依赖失败产物的证据不自动失效。`authorizationGate` 在计划确认、D2/B0 完成及对应硬前置满足后 active。

稳定产物与硬前置：

- `E1` predecessor `B0`，产生 TASK-1 working diff；`F1 -> V1 -> S1 -> C1`，`C1` 产生 TASK-1 commit。
- `E2` predecessor `C1`，消费 TASK-1 commit 并产生 TASK-2 working diff；`F2 -> V2 -> S2 -> C2`。
- `E3` predecessor `C2`，消费 TASK-2 commit 并产生 TASK-3 working diff；`F3 -> V3 -> S3 -> C3`。
- `E4` predecessor `C3`，消费 TASK-3 commit 并产生 TASK-4 working diff；`F4 -> V4 -> S4 -> C4`。

### FINAL-* — 最终验证 fan-out / fan-in

`C4` 后以下节点同时进入 ready set；共享 runner/cache write lock 冲突时保持 ready 并等待锁，不制造依赖边：

- `FINAL-U`: `operationKind: 验证`; 运行四个 unit 文件；`completionEvidence`: 四文件均非零收集且全部通过；`resourceLocks`: canonical `codex-gui` Vitest/Vite/TypeScript cache lock write。
- `FINAL-B`: `operationKind: 验证`; 运行完整 `ComposerEditor.browser.test.tsx`；`completionEvidence`: Chromium/Firefox/WebKit 均非零收集且通过；`resourceLocks`: canonical `codex-gui` Vitest/Vite/TypeScript cache lock write。
- `FINAL-C`: `operationKind: 验证`; 运行 sequential clipboard Browser 文件；`completionEvidence`: 三浏览器均非零收集且通过；`resourceLocks`: canonical `codex-gui` Vitest/Vite/TypeScript cache lock write。
- `FINAL-F`: `operationKind: 验证`; 运行 `format:oxfmt`；`completionEvidence`: 退出 0；`resourceLocks`: frontend tree read。
- `FINAL-L`: `operationKind: 验证`; 运行 `lint`；`completionEvidence`: oxlint 与 eslint 均退出 0；`resourceLocks`: source read、`.eslintcache` write。
- `FINAL-T`: `operationKind: 验证`; 运行 `type-check`；`completionEvidence`: `tsc -b --noEmit` 退出 0；`resourceLocks`: canonical `codex-gui` Vitest/Vite/TypeScript cache lock write。

这些节点共同字段：`taskBoundary: 无提交`；`estimatedCost: M-L`；`deferralEvidence: 无`；`hardPredecessors: C4`；`consumes`: 四个 TASK commit 的组合状态；`produces`: 各自稳定验证证据；`readSet`: 对应源码/测试/config；`writeSet: []`；`stateEffects`: 对应 check/test 进程与自动缓存；`commandScope`: 本文“权威验证入口”的精确 fnm-backed 命令；`executionContext`: 当前 checkout 的 `codex-gui` cwd；`owner`: 各验证唯一 owner；`verification`: 禁止 fix、skip、基线/断言放宽或豁免；`failureDomain`: 阻塞 FINAL-R 与完全验证声明；`replanTriggers`: 失败揭示计划内问题则插入新的独立修正 task/commit，计划外预存问题只报告；`authorizationGate`: C4 完成后 active；`subdelegation: false`。

`FINAL-U/B/C/T` 共享同一个 canonical `codex-gui` Vitest/Vite/TypeScript cache 写锁：live 配置未声明独立 `cacheDir`，Browser 还启用 typecheck，因此四者可同时 ready，但必须按该锁串行执行；这不是人为硬依赖。`FINAL-F/L` 只读源码且写入资源不相交，可在资源与容量允许时并发。

`FINAL-A`（Level 2）：`operationKind: 验证`；`hardPredecessors: FINAL-B`；通过 `$gui-launch` / `/gui` 取得当次完整 GUI URL，消费真实 runtime/catalog 与稳定 Level 1 证据；使用 `playwright-cli open '<complete current GUI URL>'`、`playwright-cli list --json` 和同一 non-headed session 执行本文 Level 2 场景；`completionEvidence` 为 non-headed session、实际 route/state 与每个适用场景结果；`writeSet: []`；`stateEffects` 为 headless browser session 和页面输入/selection状态；`resourceLocks` 为该 headless session write；URL/runtime或必要真实状态不可得时标记未执行并阻塞完全验证声明，不切换 visible mode。

`FINAL-R`（fan-in 审查）：等待 `FINAL-U/B/C/F/L/T/A` 全部稳定证据；审查组合 diff、四个代码 commit、DOCS commit 与设计逐项一致，确认无计划外 retained diff、无 order-only commit、无 fallback/第二 owner/公共接口或数据变化。它只读 Git/status/diff/commit 与验证输出，成功后产生最终 completion snapshot，不再 stage 或 commit。

## Ready set、关键路径与提交拓扑

- 初始 ready set：计划确认后只有 `D0`；`D2` 成功前所有实现节点被工作文档提交门禁阻塞。
- 关键路径：`D0 -> D1 -> D2 -> B0 -> E1 -> F1 -> V1 -> S1 -> C1 -> E2 -> F2 -> V2 -> S2 -> C2 -> E3 -> F3 -> V3 -> S3 -> C3 -> E4 -> F4 -> V4 -> S4 -> C4 -> FINAL-B -> FINAL-A -> FINAL-R`。
- 最终 fan-out：`C4` 后 unit、Composer Browser、clipboard Browser、format、lint、type-check 同时 ready；按 canonical runner/cache 锁调度，不因文档顺序串行。
- 最终 fan-in：`FINAL-R` 等待所有适用 Level 1、Level 2 和静态证据。
- 提交拓扑：`DOCS -> TASK-1 -> TASK-2 -> TASK-3 -> TASK-4`，均落在当前 `dev` branch 的同一 checkout/index；不创建 worktree，不合并任务提交，不 amend/squash，不 remote。
- 若任一已提交 TASK 需要计划内修正，新增独立修正 task/commit；禁止改写原提交。行为修正与纯顺序整理必须分开，且本计划不主动创建顺序整理提交。

## 停止与重新计划触发条件

以下事实会使受影响节点返回事实、设计、计划或授权门禁；无依赖分支继续：

- 必须修改既定 `writeSet` 之外的 queue、pending、clipboard、draft、catalog、query、presentation、protocol、payload、Rust 或公共 controller/interface。
- Lexical 0.49 公共 API 无法维持列入“必须保持”的业务合同，必须恢复方向键/DOM selection/坐标算法、回移新版补丁或新增 fallback/兼容层。
- 最小 ID observer 无法在现有边界内维持多 editor 唯一 ARIA 引用，或必须观察 ID/ARIA 之外的属性和 selection 状态。
- 为取得 green 需要 skip、放宽断言、删除业务覆盖、修改基线、关闭检查、新增豁免或静默降级。
- formatter 产生任务 allowlist 外 retained diff、order-only churn，或工具/Browser runtime需要安装更新。
- 分支、HEAD、Git index、文档状态、canonical target、Lexical 版本或工具链入口发生实质漂移。
- Level 2 显示真实 owner、mount/unmount、focus、ARIA 或 pending lifecycle 与计划证据不一致，或只有可见桌面才能证明结果。

计划内验证失败先作为新证据，按执行图插入有界诊断、修正和重新验证节点；只有缺授权/用户决策、安全边界、必需外部条件无替代、约束矛盾或所有有效路径均被正面排除时，才形成受影响范围的硬阻塞。

## 完成标准

1. 设计与本计划先形成独立 DOCS 本地提交；四个 TASK 各自形成独立本地代码提交。
2. Composer 不再注册项目四方向 handler，不再存在 DOM 几何、selection/scroll/focus 恢复或双 RAF 导航层；普通光标和方向键服从 Lexical 0.49。
3. NodeSelection 替换/删除仅由薄业务 adapter 调用官方 primitive；chip 单选通过官方 node-selection 接入，canonical identity、payload、draft、clipboard 与 queue/pending restore 保持。
4. 默认 history、Enter、typeahead composition、键盘导航和滚动分别只有一个权威 owner；多 editor 唯一 ARIA 同步 observer 仍严格限于 ID/ARIA 缺口。
5. 所有计划内 unit、三浏览器 Browser、clipboard、format、lint、type-check 与适用 Level 2 场景产生可信证据；Level 3 明确不适用且无可见窗口。
6. 最终 diff、index 与 commit 历史不包含 ignored research、计划外文件、order-only 混入、fallback、安装、force、amend、squash 或 remote 操作。

## 阶段边界

本文计划已确认。下一步先创建独立 DOCS 本地提交；该提交成功前不得开始任何 Composer 源码、测试、格式化或验证任务。
