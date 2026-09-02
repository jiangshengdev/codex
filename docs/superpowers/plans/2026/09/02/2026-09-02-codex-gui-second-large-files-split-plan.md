# Codex GUI 第二轮大文件拆分实施计划

## 状态与权威输入

- 计划状态：待确认
- 日期：2026-09-02
- 当前分支：`dev`
- 计划基线：`d8b78558256b1263036b9bc6a5d3f640d5b0921f`
- 已确认设计：
  `docs/superpowers/specs/2026/09/02/2026-09-02-codex-gui-second-large-files-split-design.md`
- 候选报告：`codex-gui/.reports/large-files.md`
- 报告生成时间：`2026-09-02T09:39:09.382Z`

本计划只实施已确认设计中的一个 protocol-validator Source deep Module 和十个 Test 行为族拆分。
它不以 LoC、Top 10 排名或退出报告作为完成标准，不改变产品行为、外部 Interface、状态语义、
生成合同、渲染性能、完整 test name、参数矩阵、断言或真实 collection。

本计划确认前不提交文档、不创建 worktree、不修改 production/test、不运行格式化、生成或测试、
不暂存、不提交。计划确认后，必须先把本次设计与本计划形成一个独立本地文档提交；该提交成功前，
任何 implementation node 均不得启动。

## 授权与硬约束

计划确认仅授权本计划精确列出的：本地文档提交、十一个 worktree 创建、task 文件编辑、frontend 固化
格式化/验证入口、精确暂存、每 task 独立本地提交、本地集成和最终验证。始终禁止安装、Git remote、
force、amend、squash、headed Browser、GUI/runtime/DevTools、后端或原生构建、snapshot accept、测试基线
修改、范围外 cleanup 和未列出的产品行为变化。

- 每个 implementation task 是独立提交；已有提交的修正必须形成新的独立提交。
- 本轮均为不改变行为的结构整理。若实现需要行为修改，必须暂停受影响节点并回到计划门禁；不得把行为
  修改混入结构提交。
- 不新增兼容 facade、旧新双入口、adapter、fallback、test-only production export、第二状态 owner 或
  consumer-owned authoritative contract。
- Test 只移动完整 `test`/`it`/参数化注册块及其专属 imports/helpers；不得改写、合并、重新参数化、
  删除或补充测试。
- Browser siblings 继续由 parallel config 以 headless Playwright 在 Chromium、Firefox、WebKit 执行；
  不迁入 sequential/smoke config。
- support Module 不匹配测试 glob，不注册 hooks/tests/`vi.mock`，不缓存生成结果，不持有跨文件共享可变状态。
- 不修改已确认设计列为“暂不拆”或“延后”的 Source 候选。
- repository-level `just fmt` 不适用；只使用 `codex-gui/package.json` 的 frontend 固化入口。

## 纵向影响面证据闭包

### 权威入口

- Protocol validator 的生产入口为 `scripts/protocolValidators/cli.ts` 对 `core.ts` 的四个现有 export；
  app-server 与 GUI Host 的 schema/TypeScript/generated artifacts 仍是单一权威输入链。
- Standalone runtime artifacts 由 `core.ts` 当前的 selected closure、duplicate `$id` 检查、Ajv compile、
  export naming、standalone source 和 esbuild browser bundle 共同生成。
- Unit discovery 由 `vitest.config.ts` 控制；它排除 Browser tests，普通 `*.test.ts` 由 `test:unit` 收集。
- Browser discovery 由 `vitest.browser.parallel.config.ts` 控制，include 为 `src/**/*.browser.test.ts(x)`，
  instances 为 Chromium、Firefox、WebKit；`vitest.browser.shared.config.ts` 固定 `headless: true` 与 Playwright。
- frontend 权威脚本已在当前 `package.json` 核对：`format:oxfmt(:fix)`、`lint`、`type-check`、
  `test:unit`、`test:browser:parallel`、`test:browser`、`protocol:check-validators`、`analyze:large-files`。

### 已追踪链路

- Source：input parsing/selection 保留在 `core.ts`；schema closure 与 standalone validator artifact family
  下沉；`generateProtocolArtifacts`、`generateGuiHostContractArtifacts` 和 CLI consumers 不变。
- 生成链：Rust JSON schema、Rust 生成 TypeScript、selected request/notification/auxiliary metadata 输入不变；
  `src/generated/appServerProtocol/**` 与 `src/generated/guiHostContract/**` 是完整 tracked output boundary。
- 失败链：missing schema、unresolved selected ref、duplicate `$id`、duplicate validator export、Ajv compile、
  formatter error 继续直接失败；现有 public core tests 保持这些纵向断言。
- Test：十个候选已逐一映射到设计确认的行为族；现有 module-level cache/revision、listener/deferred、DOM、
  pointer、navigator、observer、Toast 和 mock lifecycle 均进入 file-local 或 fresh per-call 边界。
- Collection：每个旧 target 在编辑前记录 verbose baseline；每个 sibling 独立定向运行；最终比较完整
  test-name multiset、参数展开和 collected count，而不是只看 exit code。

### 修改范围

修改范围仅为下文 11 个 task boundary 的精确 `writeSet`：一个 Source task、三个 Browser-test task 和七个
Node-test task。Standalone selected closure、JSON pointer traversal、root validation 与 duplicate `$id` 始终由
同一个 `standaloneValidatorArtifacts.ts` 完整隐藏；`core.ts` 只保留 input-family selection 所需的直接
`definitions` lookup，不复制 closure traversal，也不新增第二个 Source Module。

### 验证映射

- Source：旧/新 protocol-validator unit target、`cli.test.ts`、`protocol:check-validators`、tracked generated
  trees 零 diff、format/lint/type-check。
- Node tests：每 task 的旧 target baseline、新 sibling post collection、完整 name multiset 和参数矩阵；最终
  运行全部受影响 targets与完整 `test:unit`。
- Browser tests：每 task 的旧 target baseline、新 sibling post collection；分别记录 Chromium、Firefox、
  WebKit；最终运行全部受影响 targets与完整 `test:browser`。
- 静态闭环：`format:oxfmt`、`lint`、`type-check`。
- 结构结果：`analyze:large-files` 只记录新报告与剩余候选，不设置通过阈值，不暂存 ignored `.reports`。

### 排除项

- 不修改 schema、selected method 列表、`typescriptArtifacts.ts`、CLI public Interface、generated files、
  Vitest config 或 package scripts。
- 不运行 `protocol:generate-validators`，不接受任何 generated baseline 变化；`protocol:check-validators`
  必须证明当前 generator 输出仍与 tracked artifacts byte-for-byte 一致。
- 不修改 production GUI、DOM/ARIA、焦点、布局、scroll、overlay 或真实 runtime integration。因此 Level 2
  和 Level 3 不适用；若实际 diff 出现这些变化，该排除结论立即失效并触发重新计划。
- 不运行 Lingui extraction；本轮不移动含用户文案的 production UI code。
- 不修复预存或自行发现的无关失败。

### 剩余未知

- 本轮尚未运行 baseline，因此下文 count 是当前源码静态展开的预期值，不是已观测 collection。该未知是
  非关键执行前置：每个 `T-B` 必须先记录真实非零 count 和完整 names；与静态预期不一致时暂停对应 edit。
- Source 提取若不能在不暴露 Ajv、mutable closure Map、callback collection 或 duplicated closure traversal 的前提下
  形成 typed Interface，说明 seam 未闭合；只暂停 Source task，不影响 Test-only 分支。
- 任一实现若要求 writeSet 外文件、改变外部 Interface/生成合同/失败传播/Browser matrix 或修改 test body，
  升级为关键未知并回到计划门禁。

## 执行环境与 worktree 预配

当前只读预检确认：`dev` 的默认 sparse control plane 八个路径均存在；
`/Users/jiangsheng/cnb/codex/.worktrees/vitest` 是指向 `/Users/jiangsheng/cnb/vitest` 的直接 symlink，物理目标为
`/Users/jiangsheng/GitHub/vitest`。计划必须使用 direct target
`--vitest-root /Users/jiangsheng/cnb/vitest`，不得迁移现有链接。

下列 branch 与 target path 已核对为不存在。所有 worktree 使用已提交的 `dev` 文档基线、默认 sparse paths，
`--include` 为空：

| name | branch | target path | task boundaries |
| --- | --- | --- | --- |
| `gui-second-large-files-protocol-source` | `codex/gui-second-large-files-protocol-source` | `.worktrees/gui-second-large-files-protocol-source` | S1 |
| `gui-second-large-files-protocol-tests` | `codex/gui-second-large-files-protocol-tests` | `.worktrees/gui-second-large-files-protocol-tests` | T6 |
| `gui-second-large-files-pending-browser` | `codex/gui-second-large-files-pending-browser` | `.worktrees/gui-second-large-files-pending-browser` | T1 |
| `gui-second-large-files-typeahead-browser` | `codex/gui-second-large-files-typeahead-browser` | `.worktrees/gui-second-large-files-typeahead-browser` | T2 |
| `gui-second-large-files-queue-start-tests` | `codex/gui-second-large-files-queue-start-tests` | `.worktrees/gui-second-large-files-queue-start-tests` | T3 |
| `gui-second-large-files-skill-token-browser` | `codex/gui-second-large-files-skill-token-browser` | `.worktrees/gui-second-large-files-skill-token-browser` | T4 |
| `gui-second-large-files-coordinator-management-tests` | `codex/gui-second-large-files-coordinator-management-tests` | `.worktrees/gui-second-large-files-coordinator-management-tests` | T5 |
| `gui-second-large-files-transcript-live-tests` | `codex/gui-second-large-files-transcript-live-tests` | `.worktrees/gui-second-large-files-transcript-live-tests` | T7 |
| `gui-second-large-files-pending-reordering-tests` | `codex/gui-second-large-files-pending-reordering-tests` | `.worktrees/gui-second-large-files-pending-reordering-tests` | T8 |
| `gui-second-large-files-coordinator-delivery-tests` | `codex/gui-second-large-files-coordinator-delivery-tests` | `.worktrees/gui-second-large-files-coordinator-delivery-tests` | T9 |
| `gui-second-large-files-transcript-policy-tests` | `codex/gui-second-large-files-transcript-policy-tests` | `.worktrees/gui-second-large-files-transcript-policy-tests` | T10 |

每个 `W-PREP[name]` 由唯一 worktree owner 从 repo root 运行下列精确固化入口；十一个命令均不增加
`--include`：

```bash
bash .codex/skills/codex-gui-worktree/scripts/create-codex-gui-worktree.sh \
  --name gui-second-large-files-protocol-source \
  --branch codex/gui-second-large-files-protocol-source \
  --base dev \
  --vitest-root /Users/jiangsheng/cnb/vitest

bash .codex/skills/codex-gui-worktree/scripts/create-codex-gui-worktree.sh \
  --name gui-second-large-files-protocol-tests \
  --branch codex/gui-second-large-files-protocol-tests \
  --base dev \
  --vitest-root /Users/jiangsheng/cnb/vitest

bash .codex/skills/codex-gui-worktree/scripts/create-codex-gui-worktree.sh \
  --name gui-second-large-files-pending-browser \
  --branch codex/gui-second-large-files-pending-browser \
  --base dev \
  --vitest-root /Users/jiangsheng/cnb/vitest

bash .codex/skills/codex-gui-worktree/scripts/create-codex-gui-worktree.sh \
  --name gui-second-large-files-typeahead-browser \
  --branch codex/gui-second-large-files-typeahead-browser \
  --base dev \
  --vitest-root /Users/jiangsheng/cnb/vitest

bash .codex/skills/codex-gui-worktree/scripts/create-codex-gui-worktree.sh \
  --name gui-second-large-files-queue-start-tests \
  --branch codex/gui-second-large-files-queue-start-tests \
  --base dev \
  --vitest-root /Users/jiangsheng/cnb/vitest

bash .codex/skills/codex-gui-worktree/scripts/create-codex-gui-worktree.sh \
  --name gui-second-large-files-skill-token-browser \
  --branch codex/gui-second-large-files-skill-token-browser \
  --base dev \
  --vitest-root /Users/jiangsheng/cnb/vitest

bash .codex/skills/codex-gui-worktree/scripts/create-codex-gui-worktree.sh \
  --name gui-second-large-files-coordinator-management-tests \
  --branch codex/gui-second-large-files-coordinator-management-tests \
  --base dev \
  --vitest-root /Users/jiangsheng/cnb/vitest

bash .codex/skills/codex-gui-worktree/scripts/create-codex-gui-worktree.sh \
  --name gui-second-large-files-transcript-live-tests \
  --branch codex/gui-second-large-files-transcript-live-tests \
  --base dev \
  --vitest-root /Users/jiangsheng/cnb/vitest

bash .codex/skills/codex-gui-worktree/scripts/create-codex-gui-worktree.sh \
  --name gui-second-large-files-pending-reordering-tests \
  --branch codex/gui-second-large-files-pending-reordering-tests \
  --base dev \
  --vitest-root /Users/jiangsheng/cnb/vitest

bash .codex/skills/codex-gui-worktree/scripts/create-codex-gui-worktree.sh \
  --name gui-second-large-files-coordinator-delivery-tests \
  --branch codex/gui-second-large-files-coordinator-delivery-tests \
  --base dev \
  --vitest-root /Users/jiangsheng/cnb/vitest

bash .codex/skills/codex-gui-worktree/scripts/create-codex-gui-worktree.sh \
  --name gui-second-large-files-transcript-policy-tests \
  --branch codex/gui-second-large-files-transcript-policy-tests \
  --base dev \
  --vitest-root /Users/jiangsheng/cnb/vitest
```

执行时核对 worktree path、branch、sparse list、control plane、linked resources 与
`git status --short --branch`。十一个创建节点共享 canonical repo
`.git/worktrees` 与 `refs/heads` write lock，按锁串行，但不互相建立 hard predecessor；任一失败只阻断映射 task。

## 精确 task boundaries

下列路径均相对 `codex-gui/`。每个 task 只允许修改自己的 `writeSet`；列出的 production、fixtures、support、
config、schema 与 generated trees均只读，除非明确出现在该 task 的 `writeSet`。

### S1：Standalone validator artifacts deep Module

- `writeSet`：修改 `scripts/protocolValidators/core.ts`；新增
  `scripts/protocolValidators/standaloneValidatorArtifacts.ts`。
- `standaloneValidatorArtifacts.ts` 私有拥有 JSON pointer/path traversal、selected closure clone、root existence、
  duplicate `$id` rejection、validator export naming、Ajv compile、opaque standalone source、generated header 与
  esbuild browser ESM bundle；artifact Interface 只返回 artifacts 与 readonly validator export mapping。
- `core.ts` 对 request/notification/auxiliary input selection 只通过 schema bundle 的直接 `definitions` member
  查找 schema，不持有或调用 selected-closure traversal。
- `core.ts` 保留 input loading/parsing、request/notification/auxiliary selection、app-server 与 GUI Host artifact
  family orchestration、TypeScript artifact builder 和顶层 artifact map。
- 现有四个 `core.ts` export、artifact filenames/header/imports/exports/sort/options/error messages 和完整 artifact
  set 不变；generated trees 必须零 diff。
- 提交：`refactor(gui): extract standalone validator artifacts`。

### T1：Pending-input Browser reordering

- `writeSet`：修改
  `src/features/composerTurnControl/__tests__/ComposerTurnControlPendingInput.browser.test.tsx`；新增
  `ComposerTurnControlPendingInputReordering.browser.test.tsx`、
  `composerTurnControlPendingInputBrowserTestSupport.tsx`。
- 原文件保留综合 Drawer/session 的 22 cases；新 sibling 迁移完整 reordering 8 cases。
- support 只提供 fresh `queueSnapshot`、`pendingInputItem`、`createQueueControllerHarness`、`renderAttached` 及其
  私有 adapters。两个 collected files 各自保留 pointer reset 与 mock restore hooks。
- 综合简体中文、edit/delete、projection availability、closing/presence 场景留在原文件。
- 提交：`test(gui): split pending input browser reordering`。

### T2：Composer Editor typeahead Browser

- `writeSet`：删除/重命名 `src/features/composerEditor/__tests__/ComposerEditorTypeahead.browser.test.tsx`；新增
  `ComposerEditorTypeaheadMenu.browser.test.tsx`、`ComposerEditorTypeaheadSelection.browser.test.tsx`、
  `composerEditorTypeaheadBrowserTestSupport.tsx`。
- 使用 `git mv` 将旧文件变为 Selection sibling，再迁出 Menu/presentation 族。预期 Menu 14、Selection 10
  cases/browser，完整保留 catalog-state、locale 与 ArrowUp/ArrowDown 参数矩阵。
- support 只提供 per-call render、基础 fixture、纯 skill/catalog builder 与 controller getter；Drawer geometry、
  CSS probes 留在 Menu，multi-editor/caret/navigator/shortcut helper 留在 Selection。两文件各自 pointer reset。
- 提交：`test(gui): split composer editor typeahead suites`。

### T3：Composer queue start unit

- `writeSet`：修改
  `src/features/composerInputQueue/__tests__/composerInputQueueStart.test.ts`；新增
  `composerInputQueueStartObservation.test.ts`、`composerInputQueueInterruptionRecovery.test.ts`。
- 原文件保留 8 个 claim/settlement cases；Observation 迁移 8 个 runtime-evidence cases；Interruption/Recovery
  迁移 4 个完整 cases。三个文件都保留原 `describe("composer input queue")`。
- `composerInputQueueTestFixtures.ts` 只读；不移动或扩展 module-level `messageCaptures`。helpers 按使用保持
  file-local，所有断言继续穿过 `ComposerInputQueue` Interface。
- 提交：`test(gui): split composer queue start behavior suites`。

### T4：Composer Editor skill-token Browser

- `writeSet`：删除/重命名
  `src/features/composerEditor/__tests__/ComposerEditorSkillTokens.browser.test.tsx`；新增
  `ComposerEditorSkillTokenEditing.browser.test.tsx`、
  `ComposerEditorSkillTokenPresentation.browser.test.tsx`、
  `composerEditorSkillTokenBrowserTestSupport.tsx`。
- 使用 `git mv` 将旧文件变为 Editing sibling；Editing 保留 8 cases/browser，Presentation 迁移 5
  cases/browser，touch/pen 矩阵逐字保留。
- support 只提供 fresh render/fixture/catalog/controller 与两边真实使用的 Lexical DOM helpers；selection-only、
  geometry-only helpers 与 pointer-reset hooks留在各自文件。
- 提交：`test(gui): split composer editor skill token suites`。

### T5：Coordinator management unit

- `writeSet`：删除/重命名
  `src/features/composerInputQueue/__tests__/composerInputQueueCoordinatorManagement.test.ts`；新增
  `composerInputQueueCoordinatorManagementReplay.test.ts`、
  `composerInputQueueCoordinatorManagementLifecycle.test.ts`、
  `composerInputQueueCoordinatorManagementRecovery.test.ts`。
- 使用 `git mv` 变为 Replay sibling；预期 Replay 7、Lifecycle 5、Recovery 6 cases。accepted-event FIFO、
  reentrant mutation、publication failure、owner replacement 与 recovery disposal 场景整体迁移。
- 不新增共享 harness；deferred/listener/coordinator 等 mutable state 保持 file-local。
- 提交：`test(gui): split coordinator management suites`。

### T6：Protocol validator unit

- `writeSet`：删除/重命名 `scripts/protocolValidators/core.test.ts`；新增
  `coreInputSelection.test.ts`、`coreAppServerArtifacts.test.ts`、`coreGuiHostArtifacts.test.ts`、
  `coreTestSupport.ts`。
- 使用 `git mv` 变为 InputSelection sibling；预期三个 suite 分别 14、13、4 cases，合计 31。
- support 只共享 fresh immutable fixture builders、per-call generation wrapper 与纯 artifact/AST inspectors；
  artifact-family 常量与 determinism scenarios留在各自 collected file，support 不缓存生成结果。
- 提交：`test(gui): split protocol validator behavior suites`。

### T7：Transcript live-item lifecycle unit

- `writeSet`：删除/重命名
  `src/features/transcriptState/__tests__/transcriptStateLiveItemLifecycle.test.ts`；新增
  `transcriptStateLiveItemSettlement.test.ts`、`transcriptStateLiveItemPlacement.test.ts`。
- 使用 `git mv` 变为 Settlement sibling；预期 Settlement 7、Placement 5 cases。两个文件都保留原 suite name，
  各自拥有 session revision 和 action adapters；delta helpers 只进入 Settlement。
- 提交：`test(gui): split transcript live item lifecycle suites`。

### T8：Pending-input reordering unit

- `writeSet`：删除/重命名
  `src/features/composerInputQueue/__tests__/composerPendingInputReordering.test.ts`；新增
  `composerPendingInputMovement.test.ts`、`composerPendingInputScheduling.test.ts`。
- 使用 `git mv` 变为 Movement sibling；预期 Movement 19、Scheduling 10 cases。两个文件均保留 ordinary/steer
  对照，不按 lane 拆；edit/recovery blocker 与 promotion/recovery ordering 场景整体迁移。
- `composerInputQueueTestFixtures.ts` 只读，不新增共享 harness。
- 提交：`test(gui): split pending input reordering suites`。

### T9：Coordinator delivery unit

- `writeSet`：删除/重命名
  `src/features/composerInputQueue/__tests__/composerInputQueueCoordinatorDelivery.test.ts`；新增
  `composerInputQueueCoordinatorStartDelivery.test.ts`、
  `composerInputQueueCoordinatorInterruptDelivery.test.ts`、
  `composerInputQueueCoordinatorSteerDelivery.test.ts`。
- 使用 `git mv` 变为 StartDelivery sibling；预期 Start 2、Interrupt 9、Steer 6 cases。interruption、late
  settlement、structured payload 与 rejected merge 的跨阶段场景整体迁移。
- 不新增共享 harness；mock settlement order、deferred、listener 与 disposal 保持 file-local。
- 提交：`test(gui): split coordinator delivery suites`。

### T10：Transcript item policy unit

- `writeSet`：修改 `src/features/transcriptState/__tests__/transcriptItemPolicy.test.ts`；新增
  `transcriptCollabAgentItemPolicy.test.ts`。
- 原文件保留 non-collab 8 cases；新 sibling 迁移 collab-agent 51 cases 及其 `rawDetail`、`copyDetail`、
  `completedCollabView`、`startedCollabPresentation` helpers。两文件保留原 suite name。
- collab 场景继续贯通 started/completed projection 与 `transcriptEntryView`，不按实现层继续拆。
- 提交：`test(gui): split transcript item policy suites`。

## Baseline / post collection 与精确 targets

所有命令在对应 worktree 的 `codex-gui` cwd 运行，使用 fnm-backed pnpm。每个 baseline/post test 命令追加
`--reporter=verbose`，记录完整 test names 与真实 collected count；Browser 还必须分别记录三个 instances。
下表 count 为当前源码静态展开预期，执行证据必须来自真实 collection。

| task | script | baseline target | post targets | 静态预期守恒 |
| --- | --- | --- | --- | --- |
| S1 | `test:unit` | `scripts/protocolValidators/core.test.ts` | 同 baseline；最终 fan-in 使用 T6 三 sibling | 31 |
| T1 | `test:browser:parallel` | `src/features/composerTurnControl/__tests__/ComposerTurnControlPendingInput.browser.test.tsx` | `src/features/composerTurnControl/__tests__/ComposerTurnControlPendingInput.browser.test.tsx src/features/composerTurnControl/__tests__/ComposerTurnControlPendingInputReordering.browser.test.tsx` | 30/browser，90 total |
| T2 | `test:browser:parallel` | `src/features/composerEditor/__tests__/ComposerEditorTypeahead.browser.test.tsx` | `src/features/composerEditor/__tests__/ComposerEditorTypeaheadMenu.browser.test.tsx src/features/composerEditor/__tests__/ComposerEditorTypeaheadSelection.browser.test.tsx` | 24/browser，72 total |
| T3 | `test:unit` | `src/features/composerInputQueue/__tests__/composerInputQueueStart.test.ts` | `src/features/composerInputQueue/__tests__/composerInputQueueStart.test.ts src/features/composerInputQueue/__tests__/composerInputQueueStartObservation.test.ts src/features/composerInputQueue/__tests__/composerInputQueueInterruptionRecovery.test.ts` | 20 |
| T4 | `test:browser:parallel` | `src/features/composerEditor/__tests__/ComposerEditorSkillTokens.browser.test.tsx` | `src/features/composerEditor/__tests__/ComposerEditorSkillTokenEditing.browser.test.tsx src/features/composerEditor/__tests__/ComposerEditorSkillTokenPresentation.browser.test.tsx` | 13/browser，39 total |
| T5 | `test:unit` | `src/features/composerInputQueue/__tests__/composerInputQueueCoordinatorManagement.test.ts` | `src/features/composerInputQueue/__tests__/composerInputQueueCoordinatorManagementReplay.test.ts src/features/composerInputQueue/__tests__/composerInputQueueCoordinatorManagementLifecycle.test.ts src/features/composerInputQueue/__tests__/composerInputQueueCoordinatorManagementRecovery.test.ts` | 18 |
| T6 | `test:unit` | `scripts/protocolValidators/core.test.ts` | `scripts/protocolValidators/coreInputSelection.test.ts scripts/protocolValidators/coreAppServerArtifacts.test.ts scripts/protocolValidators/coreGuiHostArtifacts.test.ts` | 31 |
| T7 | `test:unit` | `src/features/transcriptState/__tests__/transcriptStateLiveItemLifecycle.test.ts` | `src/features/transcriptState/__tests__/transcriptStateLiveItemSettlement.test.ts src/features/transcriptState/__tests__/transcriptStateLiveItemPlacement.test.ts` | 12 |
| T8 | `test:unit` | `src/features/composerInputQueue/__tests__/composerPendingInputReordering.test.ts` | `src/features/composerInputQueue/__tests__/composerPendingInputMovement.test.ts src/features/composerInputQueue/__tests__/composerPendingInputScheduling.test.ts` | 29 |
| T9 | `test:unit` | `src/features/composerInputQueue/__tests__/composerInputQueueCoordinatorDelivery.test.ts` | `src/features/composerInputQueue/__tests__/composerInputQueueCoordinatorStartDelivery.test.ts src/features/composerInputQueue/__tests__/composerInputQueueCoordinatorInterruptDelivery.test.ts src/features/composerInputQueue/__tests__/composerInputQueueCoordinatorSteerDelivery.test.ts` | 17 |
| T10 | `test:unit` | `src/features/transcriptState/__tests__/transcriptItemPolicy.test.ts` | `src/features/transcriptState/__tests__/transcriptItemPolicy.test.ts src/features/transcriptState/__tests__/transcriptCollabAgentItemPolicy.test.ts` | 59 |

命令形状：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit -- <完整 unit target list> --reporter=verbose
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:parallel -- <完整 browser target list> --reporter=verbose
```

`<完整 ... target list>` 只能由表中同一 task 的完整 target list 替换；不得缩小 matrix、换 config、添加
`--passWithNoTests` 或用 smoke 替代。执行前重新核对 cwd、branch、fnm/pnpm 来源、live scripts、目标路径和
config discovery。任何 `0 collected`、错误 config、缺 browser instance 或 target 不存在均为预检/验证失败。

## 描述式执行 DAG

### Task 公共记录

以下表与节点模板共同构成每个执行节点的完整记录：

| taskBoundary | executionContext | readSet | writeSet | canonical resourceLocks | failureDomain |
| --- | --- | --- | --- | --- | --- |
| S1 | protocol-source worktree/branch/index | core/CLI/tests/typescript artifacts/schema/generated trees/config | S1 两路径 | task files W；generated trees R；protocol checker state W；Git index W | S1、protocol fan-in、final verification |
| T6 | protocol-tests worktree/branch/index | core test/source/schema/generated/config | T6 五路径 | task files W；shared `.vite`/Vitest tsbuildinfo W；Git index W | T6、protocol fan-in、final verification |
| T1 | pending-browser worktree/branch/index | pending Browser test/session/queue/config | T1 三路径 | task files W；shared `.vite`/Browser tsbuildinfo W；Git index W | T1、Browser fan-in、final verification |
| T2 | typeahead-browser worktree/branch/index | original test/editor typeahead/plugins/config | T2 精确路径 | task files W；shared `.vite`/Browser tsbuildinfo W；Git index W | T2、Browser fan-in、final verification |
| T3 | queue-start-tests worktree/branch/index | original test/fixtures/queue public Interface/config | T3 精确路径 | task files W；shared `.vite`/unit tsbuildinfo W；Git index W | T3、queue fan-in、final verification |
| T4 | skill-token-browser worktree/branch/index | original test/editor skill node/components/config | T4 精确路径 | task files W；shared `.vite`/Browser tsbuildinfo W；Git index W | T4、Browser fan-in、final verification |
| T5 | coordinator-management-tests worktree/branch/index | original test/fixtures/coordinator public Interface/config | T5 精确路径 | task files W；shared `.vite`/unit tsbuildinfo W；Git index W | T5、coordinator fan-in、final verification |
| T7 | transcript-live-tests worktree/branch/index | original test/projection fixtures/transcript public Interface/config | T7 精确路径 | task files W；shared `.vite`/unit tsbuildinfo W；Git index W | T7、transcript fan-in、final verification |
| T8 | pending-reordering-tests worktree/branch/index | original test/fixtures/queue public Interface/config | T8 精确路径 | task files W；shared `.vite`/unit tsbuildinfo W；Git index W | T8、queue fan-in、final verification |
| T9 | coordinator-delivery-tests worktree/branch/index | original test/fixtures/coordinator public Interface/config | T9 精确路径 | task files W；shared `.vite`/unit tsbuildinfo W；Git index W | T9、coordinator fan-in、final verification |
| T10 | transcript-policy-tests worktree/branch/index | original test/projection fixtures/transcript public Interface/config | T10 精确路径 | task files W；shared `.vite`/unit tsbuildinfo W；Git index W | T10、transcript fan-in、final verification |

所有 task 节点公共字段：

- `estimatedCost`：S1=`M`，其余=`S`。
- `deferralEvidence`：默认无；ready 节点只因并发容量或上述当前 canonical lock 冲突等待。
- `authorizationGate`：当前 `pending`；用户明确确认本计划并且 `D-COMMIT` 成功后，在所属 task 的最小能力
  信封内变为 `active`；节点完成、失败或撤销时到期。
- `subdelegation=false`。
- `negativeConstraints`：本计划“授权与硬约束”全部适用。
- `replanTriggers`：需要 writeSet 外文件、行为/Interface/生成合同/测试语义/Browser matrix 改变、目标未收集、
  兼容路径、工具/owner/输入漂移时暂停受影响节点。
- `owner`：每个 operationKind 由一个收到单一微阶段能力信封的 child agent 唯一负责；format/stage/commit
  只能由该 worktree 的唯一 Git owner 执行，edit owner 不操作 Git index。

每个 task `T` 实例化以下节点：

| nodeId | operationKind | hardPredecessors 与原因 | consumes / produces | completionEvidence | stateEffects / commandScope | verification |
| --- | --- | --- | --- | --- | --- | --- |
| `T-B` | 验证 | 对应 `W-PREP[name]`；等待稳定 baseline worktree | 原 target/config / baseline names+count+static inventory | 非零真实收集；保存完整 names、源码注册块、参数矩阵与 assertion inventory；count 与静态预期核对；S1 另含 validator check 与 generated clean | test/checker 缓存；仅 fnm-backed targeted script，S1 可运行 `protocol:check-validators` | Baseline 表精确 target + 只读源码 inventory |
| `T-E` | 编辑 | `T-B`；必须先保存 baseline | baseline inventory 与 owner contract / 精确 task diff | 只改 writeSet；完整注册块与 test body byte-for-byte 迁移；Source typed seam；无兼容层 | worktree修改；`git mv` + `apply_patch` | 只读 diff、Interface、helper/hook、registration/parameter/assertion 审查 |
| `T-F` | 格式化 | `T-E`；消费完整 task diff | task diff / formatter-stable diff | `format:oxfmt:fix` 后 writeSet 外无 diff，`format:oxfmt` 通过 | formatter cache与文件写；fnm-backed package scripts | 完整 formatter diff 审查 |
| `T-V` | 验证 | `T-F`；只验证稳定 formatted state | formatted diff+baseline inventory / targeted evidence | post 非零收集；完整 names、源码注册块、参数矩阵、assertion inventory 与 count 守恒；type-check 通过；Browser 三实例齐全；S1 checker 通过且 generated 零 diff | test/typecheck/checker cache；fnm-backed scripts | Post 表精确 targets + 静态 inventory compare + `type-check`；S1 加 `cli.test.ts` 与 checker |
| `T-S` | stage | `T-V`；只消费已验证 diff | verified diff / staged snapshot | 只 stage task allowlist；cached diff check 与 staged review 通过 | task Git index | `git add -- <精确 task allowlist>` |
| `T-C` | commit | `T-S`；只消费稳定 staged snapshot | staged snapshot / local commit id | 单一 task commit、预定 message、commit paths/status 核对 | local commit | `git commit`，禁止 amend/remote |

对应 `outcome` 分别为：`T-B` 产生可比较 baseline；`T-E` 产生精确结构 diff；`T-F` 产生 formatter-stable
diff；`T-V` 产生 task 完成证据；`T-S` 产生精确 staged snapshot；`T-C` 产生唯一 task commit id。每个节点
执行前由 `$action-authorization` 按上文 task read/write/command/state/negative/special-approval/lifecycle 字段形成
最小能力信封；任一字段不足时该节点的 `authorizationGate` 保持 `pending`。

`format:oxfmt:fix` 扫描整个 `codex-gui`，因此只能在隔离 worktree 内由 Git owner 运行并审查完整 diff；
writeSet 外 formatter 变化使节点失败。所有 worktree 的 `node_modules` 链接回主 checkout；当前 tsconfig
明确把 build info 写入 canonical
`/Users/jiangsheng/cnb/codex/codex-gui/node_modules/.tmp/tsconfig*.tsbuildinfo`，Vite 默认 cache 位于 canonical
`/Users/jiangsheng/cnb/codex/codex-gui/node_modules/.vite`。访问同一 tsbuildinfo 或 `.vite` 的 verification nodes
按实际 read/write lock 串行；不共享这些 canonical 输出的 nodes 不因“都是 frontend verification”建立全局锁。
不得通过删除缓存或绕过固化入口解决争用。

### Control nodes、初始 ready set、fan-out 与关键路径

非 task control nodes 的公共 `authorizationGate` 也在计划确认前为 `pending`，确认后只在下列精确能力内
变为 `active`；`subdelegation=false`，`deferralEvidence` 默认为无：

| node | taskBoundary / operationKind / owner | hardPredecessors | consumes / produces / completionEvidence | readSet / writeSet / stateEffects / commandScope | executionContext / resourceLocks / failureDomain / replanTriggers |
| --- | --- | --- | --- | --- | --- |
| `D-COMMIT` | docs / commit / 唯一 docs Git owner | 计划确认 | 两份文档 / local commit / commit paths 与 status 精确 | 两份文档与 staged snapshot / main index+HEAD / local commit / 下述精确 `git add`、check、commit | dev main / main index+HEAD W / 全图 / 文档身份或 staged scope 漂移 |
| `W-PREP[name]` | worktree / integration / 唯一 worktree owner | `D-COMMIT` commit id | committed dev / stable worktree identity / path、branch、sparse、links、status 全部核对 | base/control plane / 精确 branch+target path / worktree+branch+links / 上述精确固化脚本 | main repo / `.git/worktrees`+`refs/heads` W / 映射 task / path、branch、link 冲突或输入缺失 |
| `I-T` | integration / integration / 唯一 integration owner | 对应 `T-C` commit id | task commit / integrated task on dev / commit 可追溯、status clean、diff check | task commit / dev index+HEAD / cherry-pick commit / `git cherry-pick <commit>` | dev main / index+HEAD W / 冲突 task 与消费者 / 冲突、commit identity 或 ancestry 漂移 |
| `F-*` | domain / verification / 唯一 verification owner | 对应 domain 的全部 `I-T` | integrated domain / domain evidence / targeted names、counts、checks 成立 | integrated files/config / 无主动文件写 / test/checker caches / fnm-backed targeted scripts | dev main / 精确 shared cache W / 对应 domain+final / target、owner、collection、generated 漂移 |
| `V-*` | final / verification / 唯一 final owner | 11 个 `I-T` 与全部 `F-*` | integrated repo / 单项 final evidence / 对应成功条件成立 | integrated repo/config / 无主动写；`V-REPORT` 参数指定 `.reports` 输出 / caches、ignored report / 下文精确 scripts | dev main / 精确 shared cache或report W / 当前证据与 `V-GIT` / 入口、输入、目标命中或授权漂移 |

- 计划确认后，`D-COMMIT` 是唯一 initial ready 节点：在 `dev` 精确暂存本次设计与本计划，检查 staged diff，提交
  `docs(gui): plan second large-file splits`：

  ```bash
  git add -- docs/superpowers/specs/2026/09/02/2026-09-02-codex-gui-second-large-files-split-design.md docs/superpowers/plans/2026/09/02/2026-09-02-codex-gui-second-large-files-split-plan.md
  git diff --cached --check
  git commit -m "docs(gui): plan second large-file splits"
  ```

- 十一个 `W-PREP[name]` 只依赖 `D-COMMIT` 的 commit id；它们共享 Git worktree metadata lock，依次获得锁，
  但没有彼此 hard predecessor。每个完成后立即释放映射 task 的 `T-B`，不等待其他 worktree。
- 初始 task fan-out 为 S1、T1、T2、T3、T4、T5、T6、T7、T8、T9、T10 的 baseline nodes；同一
  worktree task 遇当前 worktree-state lock时保持 ready 等待，不改为 hard dependency。
- 粗粒度关键路径预计为 `D-COMMIT → W-PREP → S1/T6 → I-S1/I-T6 → protocol fan-in → final verification`；
  这是容量不足时的优先级估计，不增加依赖。每个完成/失败/锁释放事件后按真实成本重算。

### Domain fan-in 与本地 integration

各 domain fan-in 只消费稳定 task commits，不回写计划：

- `F-PROTOCOL` 等待 S1、T6 commits；最终在集成态运行三个 protocol siblings、`cli.test.ts`、
  `protocol:check-validators`，核对 generated trees零 diff。
- `F-BROWSER` 等待 T1、T2、T4 commits 完成各自 `I-T`；联合运行六个 post Browser files，静态预期
  67 cases/browser、三实例 201 cases，support files 未被收集。
- `F-QUEUE` 等待 T3、T8 commits；联合运行五个 post unit files，静态预期 49 cases。
- `F-COORDINATOR` 等待 T5、T9 commits；联合运行六个 post unit files，静态预期 35 cases。
- `F-TRANSCRIPT` 等待 T7、T10 commits；联合运行四个 post unit files，静态预期 71 cases。

每个 `T-C` 完成后立即释放对应增量 integration node `I-T`：

- `operationKind=集成`；`executionContext=dev main worktree/index`；`owner=唯一 integration owner`。
- `readSet` 为该 task 的稳定 commit；`writeSet` 为 `dev` worktree/index/HEAD；资源锁为 main index/HEAD write。
- 运行 `git cherry-pick <commit>`，保留 task 提交边界，不 squash、不 amend、不 remote。同一 branch 的 commit
  按 ancestry 顺序获得 integration lock；这条 ancestry 是 stable commit 依赖，不扩大为其他 branch 栅栏。
- 冲突只暂停该 commit 及实际消费者；不自动处理计划外冲突。其他 ready integration 与 task nodes 继续。
- `completionEvidence`：该 task commit 在 `dev` 可追溯，工作树无未解释变化，`git diff --check` 通过。

每个 domain fan-in 只等待本 domain 对应的全部 `I-T`，不等待其余 task。不同 fan-in 没有 hard dependency；
只按当前 canonical `.vite`/tsbuildinfo/checker resource lock调度。

## 最终验证拓扑

11 个 `I-T` 与全部 domain fan-in 完成后，下列九个结果验证同时进入 ready set；它们彼此不消费结果，
只按实际 canonical cache/report resource lock 调度。`V-GIT` 是唯一 final fan-in，等待前九项稳定证据。
任一失败只使其证据和 `V-GIT` 失效，并按执行图在现有目标/授权内插入诊断、修正和重新验证节点：

1. `V-FORMAT`：`/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt`。
2. `V-LINT`：`/opt/homebrew/bin/fnm exec --using-file pnpm run lint`。
3. `V-TYPE`：`/opt/homebrew/bin/fnm exec --using-file pnpm run type-check`。
4. `V-PROTOCOL`：`/opt/homebrew/bin/fnm exec --using-file pnpm run protocol:check-validators`；tracked generated
   trees 必须零 diff。
5. `V-UNIT-TARGETS`：fnm-backed `test:unit` + 全部 18 个受影响 post unit files + `--reporter=verbose`；静态预期
   合计 186 cases，完整 name multiset 与七个 baseline 相同。
6. `V-UNIT`：`/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit`；核对受影响 targets 均被真实收集。
7. `V-BROWSER-TARGETS`：fnm-backed `test:browser:parallel` + 六个 post Browser files +
   `--reporter=verbose`；静态预期 67 cases/browser、201 total，三个 instances 均齐全。
8. `V-BROWSER`：`/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser`；分别记录 parallel 与既有
   sequential suites，禁止用 smoke 替代。
9. `V-REPORT`：`/opt/homebrew/bin/fnm exec --using-file pnpm run analyze:large-files`；只记录新 Source/Test
   报告和仍保留候选，不以行数判定正确性，不 stage ignored `.reports`。
10. `V-GIT`：等待 `V-FORMAT` 至 `V-REPORT` 的全部稳定证据，核对文档/task commits、最终
    `git status --short --branch`、`git diff --check`，并确认无
    remote/force/amend/squash。

若 final validation 对已有 task commit 发现本轮直接引入的问题，在相同 task boundary 内创建独立修正提交，
禁止 amend；只重跑受失效证据影响的 domain 与 final 后继。不得为中间提交完整新增兼容层。

## 完成条件

- 本次设计/计划先形成独立文档提交，11 个 implementation task 各自形成独立本地提交并集成到 `dev`；
  不存在 squash、amend、remote 或范围外提交。
- `core.ts` 外部 Interface、schema inputs、failure propagation、artifact family 与完整 generated tree 保持；
  standalone Module 不暴露 Ajv、mutable closure state 或 callback collection。
- 十个 Test 候选的完整 test names、注册块、参数矩阵、断言和真实 collection 守恒；support 未被收集且无
  mutable singleton；Browser 三实例完整。
- 全部 targeted、domain fan-in 与 final verification 通过；Level 1 完成，Level 2/3 保持不适用，除非实际
  diff 触发升级条件。
- 最终报告分别说明 Source seam、Test behavior locality、collection、生成合同和仍保留 Source 候选；
  不用行数下降代替正确性证据。

## 计划确认门禁

用户明确确认本计划后，下一轮才允许执行。确认将激活本计划精确列出的文档提交、十一个 worktree 创建、
11 个 implementation task、格式化/验证、本地 task commits、本地 integration 与计划内失败闭环；不授权
任何 remote、force、安装、headed GUI、范围外修复、未列出的文件或产品行为变化。
