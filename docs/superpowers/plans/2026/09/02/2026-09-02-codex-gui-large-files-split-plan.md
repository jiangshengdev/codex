# Codex GUI 大文件拆分实施计划

## 状态与权威输入

- 计划状态：已确认
- 确认日期：2026-09-02
- 日期：2026-09-02
- 当前分支：`dev`
- 计划基线：`901746c28fea89eba071489da51de5173bec47be`
- 已确认设计：
  `docs/superpowers/specs/2026/09/02/2026-09-02-codex-gui-large-files-split-design.md`
- 候选报告：`codex-gui/.reports/large-files.md`

本计划只实施已确认设计中的结构拆分与测试行为族整理。它不以 LoC、Top 10、近期 churn 或
“退出报告”作为完成标准，不改变产品行为、外部 Interface、状态语义、生成合同、渲染性能和测试覆盖。

计划确认前不创建 worktree、不修改 production/test、不运行格式化、生成或测试、不暂存、不提交。
计划确认后，必须先把设计与本计划作为一个独立本地文档提交；该提交成功前不得开始任何实现节点。

## 授权与硬约束

计划确认仅授权本计划列出的本地文档提交、worktree 创建、文件编辑、项目固化格式化/生成/验证入口、
精确暂存、独立本地提交和本地集成。始终禁止安装、Git remote、force、amend、squash、headed Browser、
后端/原生构建、协议生成、snapshot accept、测试基线修改和范围外 cleanup。

- 所有 implementation task 独立提交；已有提交的修正使用新提交。
- 行为变化与纯位置/顺序变化不得混在同一提交。本计划预期只有非行为结构变更；若发现必须改变行为，
  触发重新计划，不得把行为修正塞入结构提交。
- 不增加兼容 facade、双入口、双读/双写、fallback、adapter、test-only production API 或第二状态 owner。
- 所有测试保留原完整 test name、断言、fixture、纵向 mount 层级和真实 collection；Browser 继续由 parallel
  config 在 Chromium、Firefox、WebKit 三实例 headless 执行。
- `composerSteerQueueState.ts`、`composerPendingInputSession.ts`、`transcriptStateImplementation.ts`、
  `activeThreadSession.ts` 和 `scripts/protocolValidators/typescriptArtifacts.ts` 不修改。
- repository-level `just fmt` 不适用；只使用 `codex-gui/package.json` 的 frontend 固化入口。

## 纵向影响面证据闭包

### 权威入口

- Queue 行为由 `composerInputQueue.ts` 的 `ComposerInputQueue`/`createComposerInputQueue` 和
  `composerInputQueueCoordinator.ts` 的 `ComposerInputQueueCoordinator`/factory 定义；唯一 production
  创建点位于 `activeThreadSession/liveActiveThreadSession.ts`。本次保持这些 Interface 与创建点不变。
- Transcript UI 的真实入口是 `CommittedTranscriptSurface.tsx` 经
  `CommittedTranscriptSurfaceRenderer.tsx` 的 live/read-only surface；selector、chunk 与 fragment 仍从
  `TranscriptReadContext` 和 transcript state owner 读取。
- Pending Drawer 的真实入口是 `ComposerTurnControl.tsx` 挂载 `ComposerPendingInputDrawer.tsx`；queue session
  与 `ActiveThreadComposerRole` 不改。
- History 的真实入口是 `ThreadHistoryDetailPage.tsx`；read owner 仍为 `threadHistoryDetailOwner.ts`，
  continuation 仍调用 `ActiveThreadSession.activate`。
- Test discovery 由 `vitest.config.ts` 与 `vitest.browser.parallel.config.ts` 控制；后者明确排除 sequential
  目录并声明 Chromium、Firefox、WebKit 三实例。Browser provider 在
  `vitest.browser.shared.config.ts` 中固定为 headless Playwright。
- Lingui 权威输入为 `lingui.config.ts` 的 `src` include；权威入口为 `pnpm run messages:extract`；完整生成物
  边界是 `src/locales/en.po` 与 `src/locales/zh-CN.po`。

### 已追踪链路

- Queue：ordinary slots/acquisition/reservation、display-key/cursor/revision、跨 lane resolution、start/steer
  settlement、recovery/effect order；coordinator 的 live-management acquisition/mutation/replay、accepted-event
  mailbox、generation/dispose、RPC/recovery/publication。
- Transcript：activity grouping/presentation、entry exhaustive dispatch、turn fragment 的 leading/middle/final/error、
  `MiddleTranscriptChunk` memo、细粒度 selectors、折叠后的隐藏内容不挂载。
- Drawer：HeroUI Drawer 与 DOM/focus adapter、Lexical attach/capture/restore、两 lane 列表与详情操作、preview 的
  Drawer/region 两个现有消费者。
- History：params/capability/read 状态、document title/back/read-only transcript；continuation token、in-flight、
  activation outcome、toast、QR 与 navigation。
- Tests：10 个报告候选分别映射为设计确认的行为族；module-level revision/cache、hoisted mock、history、timer/RAF、
  DOM globals、Toast、`IntersectionObserver` 和 navigator override 已纳入文件级隔离边界。
- Catalog：移动含 `Trans`/`t` 的 production 代码会改变 `#:` source references；`msgid`、`msgstr`、`#.`、
  fuzzy/obsolete 不属于可自动接受的定位元数据。

### 修改范围

修改范围仅为下文 17 个 task boundary 的精确 `writeSet`：5 个 queue owner/test 任务、3 个 queue-adjacent
UI/test 任务、4 个 transcript source/test 任务、2 个 thread-history source/test 任务、ComposerEditor tests、
AppProjection tests，以及 fan-in 后的 Lingui source-reference 生成提交。每个范围项均对应上述现有 owner
或测试行为族。

### 验证映射

- Queue/Coordinator：拆分前后 targeted unit collection 与运行；active-thread unit；相关 App/Composer Browser。
- UI/History/Transcript/Editor/AppProjection：各自新 sibling 的 targeted parallel Browser，核对三个实例和完整
  test name；最终运行完整 `test:browser`，同时覆盖 parallel 与既有 sequential suites。
- 全局静态闭环：`format:oxfmt`、`lint`、`type-check`、完整 `test:unit`。
- Catalog：首次 `messages:extract` 后按 PO 字段审查完整 diff，再运行同一入口证明稳定。
- 结构结果：运行 `analyze:large-files` 记录新报告，只作为结果报告，不作为通过阈值。

### 排除项

- Protocol/schema/generated validator 不变，因此不运行 protocol generator；authoritative TypeScript contract 与
  failure propagation 不变。
- 没有预期 DOM、样式、焦点、布局或真实 runtime 行为变化；Level 2 real-runtime 与 Level 3 visible-desktop
  验收不适用。若 implementation diff 改变上述任一结果，该结论失效并触发重新计划。
- `messages:extract:clean` 会扩大 obsolete 清理范围，禁止使用。
- 不拆暂缓 Source，不修改报告脚本、limit 或 CI gate。

### 剩余未知

- 拆分前 `test.each` 展开后的真实 collection 尚未运行；这是非关键的执行期前置输入：当前 discovery
  config、文件范围和验证入口已闭合，具体展开数不改变计划范围。对应 `T-B` 在编辑前必须记录它；任何
  `0 collected` 会使当前验证入口证据失效并阻断对应编辑，前后不一致会阻断对应任务提交。
- private Module 实际提取时若需要传入 raw mutable arrays/Maps、generation/recovery/snapshot setters 或多组
  可变 callbacks，说明 seam 未闭合；该 Source 节点必须失败并触发局部重编，不能降级为薄 facade。
- 其余未知均为非关键实现细节；一旦要求改变外部 Interface、owner、用户结果、catalog 语义或验证入口，
  升级为关键未知并回到计划门禁。

## 执行环境与 worktree 预配

所有 worktree 使用已提交的 `dev` 文档基线、默认 sparse control plane，`--include` 为空。预检已确认以下
默认路径存在于基线：`.codex/skills`、`.agents/skills`、`docs/superpowers`、`codex-gui`、两个 app-server
protocol schema 目录和两个 gui-host schema 目录。

现有 `/Users/jiangsheng/cnb/codex/.worktrees/vitest` 直接指向 `/Users/jiangsheng/cnb/vitest`，其物理目标为
`/Users/jiangsheng/GitHub/vitest`；所有命令显式传入兼容的 direct target
`--vitest-root /Users/jiangsheng/cnb/vitest`。下列 branch 与 worktree path 已预检为不存在：

| name | branch | target path |
| --- | --- | --- |
| `gui-large-files-queue-tests` | `codex/gui-large-files-queue-tests` | `.worktrees/gui-large-files-queue-tests` |
| `gui-large-files-queue-state` | `codex/gui-large-files-queue-state` | `.worktrees/gui-large-files-queue-state` |
| `gui-large-files-queue-live` | `codex/gui-large-files-queue-live` | `.worktrees/gui-large-files-queue-live` |
| `gui-large-files-composer-ui` | `codex/gui-large-files-composer-ui` | `.worktrees/gui-large-files-composer-ui` |
| `gui-large-files-transcript-renderer` | `codex/gui-large-files-transcript-renderer` | `.worktrees/gui-large-files-transcript-renderer` |
| `gui-large-files-transcript-tests` | `codex/gui-large-files-transcript-tests` | `.worktrees/gui-large-files-transcript-tests` |
| `gui-large-files-history` | `codex/gui-large-files-history` | `.worktrees/gui-large-files-history` |
| `gui-large-files-editor-tests` | `codex/gui-large-files-editor-tests` | `.worktrees/gui-large-files-editor-tests` |
| `gui-large-files-app-projection-tests` | `codex/gui-large-files-app-projection-tests` | `.worktrees/gui-large-files-app-projection-tests` |

实现前由唯一 worktree owner 从 repo root 逐一运行以下精确固化入口；9 个命令均不增加 `--include`：

```bash
bash .codex/skills/codex-gui-worktree/scripts/create-codex-gui-worktree.sh \
  --name gui-large-files-queue-tests \
  --branch codex/gui-large-files-queue-tests \
  --base dev \
  --vitest-root /Users/jiangsheng/cnb/vitest

bash .codex/skills/codex-gui-worktree/scripts/create-codex-gui-worktree.sh \
  --name gui-large-files-queue-state \
  --branch codex/gui-large-files-queue-state \
  --base dev \
  --vitest-root /Users/jiangsheng/cnb/vitest

bash .codex/skills/codex-gui-worktree/scripts/create-codex-gui-worktree.sh \
  --name gui-large-files-queue-live \
  --branch codex/gui-large-files-queue-live \
  --base dev \
  --vitest-root /Users/jiangsheng/cnb/vitest

bash .codex/skills/codex-gui-worktree/scripts/create-codex-gui-worktree.sh \
  --name gui-large-files-composer-ui \
  --branch codex/gui-large-files-composer-ui \
  --base dev \
  --vitest-root /Users/jiangsheng/cnb/vitest

bash .codex/skills/codex-gui-worktree/scripts/create-codex-gui-worktree.sh \
  --name gui-large-files-transcript-renderer \
  --branch codex/gui-large-files-transcript-renderer \
  --base dev \
  --vitest-root /Users/jiangsheng/cnb/vitest

bash .codex/skills/codex-gui-worktree/scripts/create-codex-gui-worktree.sh \
  --name gui-large-files-transcript-tests \
  --branch codex/gui-large-files-transcript-tests \
  --base dev \
  --vitest-root /Users/jiangsheng/cnb/vitest

bash .codex/skills/codex-gui-worktree/scripts/create-codex-gui-worktree.sh \
  --name gui-large-files-history \
  --branch codex/gui-large-files-history \
  --base dev \
  --vitest-root /Users/jiangsheng/cnb/vitest

bash .codex/skills/codex-gui-worktree/scripts/create-codex-gui-worktree.sh \
  --name gui-large-files-editor-tests \
  --branch codex/gui-large-files-editor-tests \
  --base dev \
  --vitest-root /Users/jiangsheng/cnb/vitest

bash .codex/skills/codex-gui-worktree/scripts/create-codex-gui-worktree.sh \
  --name gui-large-files-app-projection-tests \
  --branch codex/gui-large-files-app-projection-tests \
  --base dev \
  --vitest-root /Users/jiangsheng/cnb/vitest
```

每次必须核对 target path、branch、sparse list、control plane 可读性、linked resources 与
`git status --short --branch`。任一创建失败只阻断依赖该 worktree 的任务；每个 task 只在自己的 worktree
预配完成后启动，不设置“全部 9 个 worktree 均成功”的全局屏障。

## 精确 task boundaries

以下路径均相对 `codex-gui/`。ReadSet 除精确 owner、消费者、fixtures/support、测试和配置外，不授予修改。

### Q1：Queue 测试行为族

- `writeSet`：删除/重命名 `src/features/composerInputQueue/__tests__/composerInputQueue.test.ts`；新增
  `composerInputQueueStart.test.ts`、`composerInputQueueSteer.test.ts`、
  `composerInputQueuePendingProjection.test.ts`、`composerInputQueueManagement.test.ts`。
- 使用 `git mv` 把原文件变为第一个 sibling，再从中提取其余文件；保持 46 个源码注册点、完整 test name、
  断言和 fixture 使用。执行时记录 `test.each` 展开后的真实 collection。
- 只读 `composerInputQueueTestFixtures.ts`；其 module-level `messageCaptures` cache 不移动、不扩展。
- 提交：`test(gui): split composer input queue behavior suites`。

### Q2：Coordinator 测试行为族

- `writeSet`：删除/重命名 `composerInputQueueCoordinator.test.ts`；新增
  `composerInputQueueCoordinatorRelease.test.ts`、`composerInputQueueCoordinatorDelivery.test.ts`、
  `composerInputQueueCoordinatorManagement.test.ts`、`composerInputQueueCoordinatorMove.test.ts`。
- 使用 `git mv`；保持 43 个源码注册点、完整 test name、断言、deferred/listener/replay harness 语义，并记录
  真实 collection。
- 提交：`test(gui): split composer queue coordinator behavior suites`。

### Q3：Ordinary queue private owner

- `writeSet`：新建 `src/features/composerInputQueue/composerOrdinaryQueueState.ts`；修改
  `composerInputQueue.ts`。
- 新 Module 独占 ordinary slots、acquisition/reservation、FIFO/head issue、restore/drain、edit/save/cancel/delete/move
  与 identity/order/reservation invalidation；返回 typed outcomes。
- Root 保留跨 lane resolution、active turn、start/steer/recovery、known ids 和 effect order。
- 提交：`refactor(gui): extract ordinary composer queue state`。

### Q4：Pending identity private owner

- `hardPredecessor`：Q3 commit；原因是共享 `composerInputQueue.ts` 写集合，Q4 读取 Q3 的稳定 root 状态。
- `writeSet`：新建 `composerPendingInputIdentity.ts`；修改 `composerInputQueue.ts`。
- 新 Module 独占 display key 双向索引、owner-scoped cursor、lane/offset/revision 绑定、detail revision、
  stale/foreign 判断和 identity lifecycle；root 仍决定何时真实 mutation 推进 revision。
- 外部 max-page constant、factory 与 Interface 继续由 root 导出，不 re-export private types。
- 提交：`refactor(gui): extract pending input identity`。

### Q5：Live-management private owner

- `writeSet`：新建 `composerPendingInputLiveManagement.ts`；修改
  `composerInputQueueCoordinator.ts`。
- 新 Module 独占 acquisition/mutation/replay 互斥、session/edit wrapper、accepted-event mailbox/replay、
  management result normalization 与 deferred drain facts；直接使用同一 queue 引用，不复制状态。
- Coordinator 保留 generation/dispose、RPC effects、recovery/release/interrupt、snapshot/listener/publication。
- 提交：`refactor(gui): extract live pending input management`。

### U1：Pending Drawer production seam

- `writeSet`：修改 `src/features/composerTurnControl/ComposerPendingInputDrawer.tsx`、
  `ComposerPendingInputRegion.tsx`；新增
  `ComposerPendingInputEditorAdapter.tsx`、`ComposerPendingInputList.tsx`、
  `ComposerInputPreviewContent.tsx`。
- `ComposerInputPreviewContent` 只服务 Drawer 与 Region 两个消费者；保留 HeroUI Drawer、Lexical controller、
  session projection、DOM/focus effect owner。若复用要求改变 Region 行为，停止提取 preview，不扩大写集合。
- 提交：`refactor(gui): split pending input drawer modules`。

### U2：ComposerTurnControl Browser 行为族

- `writeSet`：删除/重命名 `src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx`；
  新增 Session/Input/PendingInput/Delivery 四个 sibling。
- `createQueueControllerHarness` 留在 PendingInput 行为族；不新增万能 support，不把两个顶层 spy mock 复制到
  不消费它们的文件。
- 提交：`test(gui): split composer turn control browser suites`。

### U3：AppComposerQueue Browser 行为族

- `writeSet`：删除/重命名 `src/__tests__/AppComposerQueue.browser.test.tsx`；新增 Ordinary/Steer/Interrupt
  三个 sibling。
- 每个 sibling 自己拥有 hoisted mock、history seed、`resetAppBrowserTestSupport` 与 restore，不依赖文件顺序。
- 提交：`test(gui): split app composer queue browser suites`。

### R1：Committed transcript renderer production seam

- `writeSet`：修改 `src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx`；新增
  `TranscriptActivityEntries.tsx`、`TranscriptEntryRenderer.tsx`、
  `CommittedTranscriptTurnFragment.tsx`。
- 依赖方向固定为 surface entrypoint、turn fragment、entry renderer、activity renderer/presentation；禁止反向 import。
- 保持 module-level memo component identity、细粒度 selector、final reference comparison、chunk boundary 和折叠时
  不挂载 hidden middle content。
- 提交：`refactor(gui): split committed transcript rendering`。

### R2：CommittedTranscriptSurface Browser 行为族

- `writeSet`：拆分 `CommittedTranscriptSurface.browser.test.tsx` 为 Messages/Activity/Disclosure 三个 sibling。
- 不复制 `ReasoningTranscriptSurface` 与 `TranscriptContextPagination` 的既有覆盖；每个新文件局部拥有 revision。
- 提交：`test(gui): split committed transcript surface suites`。

### R3：Committed transcript state tests

- `writeSet`：拆分 `transcriptStateCommittedProjection.test.ts` 为 Activity/Messages/Terminal 三个 sibling。
- 每个文件拥有独立 revision/store factory；不共享 mutable counter，不复制 live lifecycle 已有覆盖。
- 提交：`test(gui): split committed transcript state suites`。

### R4：Streaming transcript state tests

- `writeSet`：拆分 `transcriptStateLiveStreaming.test.ts` 为 ReasoningStreaming/AgentMessageStreaming 两个 sibling。
- 每个文件独立 revision/store；不复制 reconnect/lifecycle tests。
- 提交：`test(gui): split streaming transcript state suites`。

### H1：Thread history detail production seam

- `writeSet`：修改 `src/features/threadHistory/ThreadHistoryDetailPage.tsx`；新增
  `ThreadHistoryDetailContent.tsx`、`ContinueTaskAction.tsx`。
- `ThreadHistoryDetailOwner` 与 `ActiveThreadSession.activate` 保持唯一 owner。
- 提交：`refactor(gui): split thread history detail page`。

### H2：Thread history detail Browser 行为族

- `writeSet`：拆分 `ThreadHistoryDetailPage.browser.test.tsx` 为
  `ThreadHistoryDetailRead.browser.test.tsx`、`ThreadHistoryDetailContinuation.browser.test.tsx`；新增窄的
  `threadHistoryDetailBrowserHarness.tsx`，仅创建 per-call router/capability/session harness。
- Toast cleanup 只在 continuation 文件；两组仍完整挂载 route/page。
- 提交：`test(gui): split thread history detail browser suites`。

### E1：ComposerEditor tests

- `writeSet`：拆分 `ComposerEditor.browser.test.tsx` 为 Typeahead/SkillTokens/Lifecycle 三个 sibling；只允许共享
  候选 builder 与 per-call render factory，geometry/selection helpers 留在消费行为族。
- 提交：`test(gui): split composer editor browser suites`。

### A1：AppProjection tests

- `writeSet`：拆分 `AppProjectionTranscript.browser.test.tsx` 为 Ingress/Scroll/Availability 三个 sibling。
- Scroll 独占 document scroll、fake RAF/timer 和临时 `IntersectionObserver` 并本文件恢复；各 sibling 重复最小
  hoisted mock/reset，不依赖文件顺序。
- 提交：`test(gui): split app projection browser suites`。

### G1：Lingui generated metadata closure

- `hardPredecessor`：全部结构提交已集成到 `dev`。
- `readSet`：完整 `codex-gui/src/**`、`lingui.config.ts`、`package.json`。
- `writeSet`：仅 `src/locales/en.po`、`src/locales/zh-CN.po`。
- 首次与第二次均运行 `/opt/homebrew/bin/fnm exec --using-file pnpm run messages:extract`；禁止 clean。
- 完整 diff 按 `#:`, `#.`, `msgid`, `msgstr`, fuzzy/obsolete 分类。预期只有正确且稳定的 `#:` source references；
  任一计划外语义或翻译变化阻断后继。
- 若有 diff，独立提交 `chore(gui): refresh split-file message references`；若无 diff，记录稳定证据且不制造提交。

## 描述式执行 DAG

### 节点公共能力与字段

以下 task 记录与节点阶段表共同构成完整节点记录。所有 implementation 节点：

- `authorizationGate`：当前 `pending`；用户明确确认本计划后为 `active`，能力仅限所属 task 的 read/write、命令、
  state effects 和本地提交；节点结束即到期。
- `subdelegation=false`；每个节点 owner 是收到该单一微阶段能力信封的 child agent。每个 worktree 另指定一个
  唯一 Git owner，只有它可以执行该 worktree 的 format、stage 与 commit；编辑 owner 不操作 Git index。
- `negativeConstraints`：本计划“授权与硬约束”全部适用。
- `replanTriggers`：需要写集合外文件、行为/Interface/owner/catalog 语义变化、目标未收集、兼容路径、工具或
  权威入口漂移时暂停受影响节点。
- `deferralEvidence` 默认为无。Ready 节点只因并发容量或下述 canonical resource lock 冲突等待，不增加伪依赖。

| taskBoundary | executionContext | readSet | writeSet | resourceLocks | failureDomain |
| --- | --- | --- | --- | --- | --- |
| Q1/Q2 | queue-tests worktree/branch/index | 两个原测试、fixtures、queue/coordinator public Interface、Vitest config | Q1/Q2 各自精确测试文件 | 各自文件写；共享 Git index 独占仅限 stage/commit | 对应测试 split 与消费其 collection 的 Q3/Q4/Q5 |
| Q3/Q4 | queue-state worktree/branch/index | queue root、contracts/start/steer/move/payload、Q1 tests | 对应 root 与新增 private Module | `composerInputQueue.ts` 写锁；Git index | 对应 source commit 与 queue fan-in |
| Q5 | queue-live worktree/branch/index | coordinator、queue Interface、active-session consumers、原 coordinator tests | coordinator 与 live-management Module | 对应文件写；Git index | Q5 与 queue fan-in |
| U1/U2/U3 | composer-ui worktree/branch/index | Drawer/Region/Editor/session/TurnControl、App support、相关 tests/config | 各 task 精确文件 | task files；共享 Git index；Browser runner | 对应 task、catalog(U1) 与最终 fan-in |
| R1/R2 | transcript-renderer worktree/branch/index | surface/renderer/read context/presentation/state selectors/tests | 各 task 精确文件 | task files；共享 Git index；Browser runner | 对应 task、catalog(R1) 与最终 fan-in |
| R3/R4 | transcript-tests worktree/branch/index | transcript state public Interface、fixtures、已有 lifecycle/reconnect tests | 各 task 精确 tests | task files；共享 Git index；unit runner | 对应 task 与最终 fan-in |
| H1/H2 | history worktree/branch/index | page/owners/session contracts/router/tests | 各 task 精确文件 | task files；共享 Git index；Browser runner | 对应 task、catalog(H1) 与最终 fan-in |
| E1 | editor-tests worktree/branch/index | ComposerEditor plugins/components/test helpers | E1 精确 tests | task files；Git index；Browser runner | E1 与最终 fan-in |
| A1 | app-projection-tests worktree/branch/index | App support/projection/session/transcript Interface | A1 精确 tests | task files；Git index；Browser runner | A1 与最终 fan-in |
| G1 | integrated `dev`/main index | 完整 src、Lingui config、catalogs | 两份 catalogs | src tree read；catalog write；Lingui generator；Git index | catalog 与最终验证 |

每个 task `T` 实例化以下节点；`estimatedCost` 为 Q3/Q4/Q5/U1/R1/H1=`M`，其余=`S`：

| nodeId | taskBoundary | operationKind / owner | hardPredecessors | consumes / produces | completionEvidence | stateEffects / commandScope | verification |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `T-B` | T | 验证 / task verification owner | 对应 `W-PREP[name]` | 原文件与配置 / baseline collection | 目标非零收集；记录完整 names、源码注册点与真实展开数 | 仅 test 运行状态；fnm-backed targeted script | 原目标 targeted unit/parallel Browser |
| `T-E` | T | 编辑 / task edit owner | `T-B`；Q4 另依赖 Q3 commit | baseline 与 owner contract / task diff | 精确 writeSet，旧文件按 `git mv`，无兼容层或范围外 diff | 工作树修改；`git mv` + `apply_patch` | 只读 diff/Interface/owner 审查 |
| `T-F` | T | 格式化 / worktree Git owner | `T-E` | task diff / formatter-stable diff | `format:oxfmt:fix` 后范围外无 diff，`format:oxfmt` 通过 | formatter 状态；fnm-backed package scripts | 完整 formatter diff 审查 |
| `T-V` | T | 验证 / task verification owner | `T-F` | formatted diff / target evidence | targeted tests 非零收集并通过；三 Browser instances 适用时齐全；type-check 通过 | test/typecheck 状态；fnm-backed scripts | task 精确命令与前后 collection 对照 |
| `T-S` | T | stage / worktree Git owner | `T-V` | verified diff / staged snapshot | 只 stage 精确 writeSet；`git diff --cached --check` 与 staged review 通过 | task Git index | exact `git add -- <allowlist>` |
| `T-C` | T | commit / worktree Git owner | `T-S` | staged snapshot / local commit id | 预定 message 的单一 task commit；status 与 commit paths 核对 | local commit | `git commit`，禁止 amend/remote |

`format:oxfmt:fix` 会扫描整个 `codex-gui`；因此每个 task 必须在隔离 worktree 执行并审查完整 diff，任何 task
writeSet 外变化都视为节点失败。所有 worktree 的 `node_modules` 都链接到主 checkout；`type-check` 与 Vitest
会共同写 canonical `/Users/jiangsheng/cnb/codex/codex-gui/node_modules/.tmp/tsconfig*.tsbuildinfo`，Browser 还会
使用同一 `node_modules/.vite`、attachments/test-results 与 Playwright browser capacity。因此所有 task 的
`type-check`、unit 与 Browser verification 共用一个 frontend-verification exclusive lock，禁止跨 worktree
并发；不能通过删除缓存或绕过固化入口解决争用。资源释放后 Ready 验证节点立即运行，不添加硬依赖。

### 初始 ready set、fan-out 与关键路径

- `D-COMMIT`：在 `dev` 精确暂存设计与本计划，运行 cached diff check，提交
  `docs(gui): plan large-file ownership splits`。这是唯一初始 ready 节点，精确命令为：

  ```bash
  git add -- docs/superpowers/specs/2026/09/02/2026-09-02-codex-gui-large-files-split-design.md docs/superpowers/plans/2026/09/02/2026-09-02-codex-gui-large-files-split-plan.md
  git diff --cached --check
  git commit -m "docs(gui): plan large-file ownership splits"
  ```

- 9 个 `W-PREP[name]` 都只依赖 `D-COMMIT` commit id，彼此无硬依赖；每个节点创建并核验一个精确
  worktree，产生该 worktree 的稳定 identity。它们共享 canonical repo `.git/worktrees` 与 `refs/heads`
  metadata exclusive lock，因而 Ready 后按锁串行创建，但不互相建立硬依赖。局部失败只阻断映射到该
  name 的 task。
- 每个 `W-PREP[name]` 完成后，在同一调度循环释放对应 Q1/Q2、Q3、Q5、U1/U2/U3、R1/R2、R3/R4、
  H1/H2、E1 或 A1 的 `T-B`；不等待其他 worktree。Q4 继续等待 Q3 commit。
- Fan-out 中的编辑可在 writeSet 不相交时并行；Browser/unit runner 与各 Git index 的独占节点按资源锁排队。
- 粗粒度关键路径预计为 `D-COMMIT`、`W-PREP`、Q3、Q4、integration、G1、final verification；这是调度优先级，
  不是额外依赖。若实际成本改变，按完成事件重算。

### 本地 integration fan-in

`I1` 在全部 task commits 完成后进入 Ready：

- `operationKind=集成`；`executionContext=dev main worktree/index`；`owner=唯一 integration owner`。
- `readSet` 为 9 个 task branches 的稳定 commit；`writeSet` 为 `dev` worktree/index/HEAD；资源锁为 main index/HEAD。
- 按依赖拓扑逐个 `git cherry-pick <commit>`，保留每个 task 的独立提交身份，不 squash、不 amend、不 remote。
  Q3 在 Q4 前；其余无硬顺序。发生冲突时只暂停冲突 commit 及消费者，不自动解决计划外冲突。
- `completionEvidence`：全部 task commits 在 `dev` 可追溯，工作树无未解释变更，`git diff --check` 通过。
- `failureDomain`：冲突 task、catalog 和 final verification；无关尚未集成 commit 仍可核验。

`G1-EXTRACT` 依赖 I1，首次提取并审查；`G1-STABLE` 依赖首次字段审查，再次提取并要求无新结构 diff；
`G1-S`/`G1-C` 仅在两份 catalog 有机械 diff 时精确暂存并形成独立提交。两次提取均读完整 src，不能与任何
source 写节点并发。

### 最终验证 fan-in

最终验证只读取全部集成提交与稳定 catalogs，按共享 runner 资源串行：

1. `V-FORMAT`：`/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt`。
2. `V-LINT`：`/opt/homebrew/bin/fnm exec --using-file pnpm run lint`。
3. `V-TYPE`：`/opt/homebrew/bin/fnm exec --using-file pnpm run type-check`。
4. `V-UNIT`：`/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit`；核对全部 unit targets 非零收集。
5. `V-BROWSER`：`/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser`；分别记录 parallel/sequential，
   核对受影响 sibling 在 Chromium、Firefox、WebKit 三实例执行。不得用 smoke 或 direct Vitest 兜底。
6. `V-REPORT`：`/opt/homebrew/bin/fnm exec --using-file pnpm run analyze:large-files`；只记录新 Source/Test 报告、
   结构收益与仍保留候选，不设置 LoC 阈值，不暂存 ignored `.reports`。
7. `V-GIT`：核对 task/catalog commits、最终 `git status --short --branch`、`git diff --check` 和无 remote/force。

每个验证节点 `operationKind=验证`，`hardPredecessor` 为上一项的稳定证据，`readSet` 为 integrated
`codex-gui/**` 与对应配置，`writeSet=[]`（程序内部缓存/报告副作用按能力信封处理），`owner=唯一 final
verification owner`，并获取与 task verification 相同的 frontend-verification exclusive lock；
`authorizationGate=计划确认且 I1/G1 完成后 active`。失败只使其证据和后继失效；按
执行图在现有目标/授权内插入诊断或修正节点。对已有提交的修正使用新独立提交，禁止 amend。

## 精确 targeted 验证范围

- Q1：四个新 queue unit files。Q3/Q4 所在独立 branch 使用原 `composerInputQueue.test.ts`；最终 fan-in 再由
  四个新 sibling 验证组合状态。
- Q2：四个新 coordinator unit files。Q5 所在独立 branch 使用原
  `composerInputQueueCoordinator.test.ts`，另含
  `src/features/activeThreadSession/__tests__/liveActiveThreadSession.test.ts` 与
  `activeThreadSession.test.ts`；最终 fan-in 再由四个新 coordinator sibling 验证组合状态。
- U1：原 ComposerTurnControl Browser 与 AppComposerQueue Browser 作为 production 相邻回归；U2 为四个新
  ComposerTurnControl Browser；U3 为三个新 AppComposerQueue Browser。
- R1：原 CommittedTranscriptSurface Browser；R2 为三个新 sibling，保留的 Reasoning 与 ContextPagination
  Browser 作为相邻
  回归入口。
- R3：三个 committed-state unit；R4：两个 streaming unit；保留 live lifecycle/reconnect tests 作为相邻回归。
- H1：原 ThreadHistoryDetail Browser 与 `threadHistoryDetailOwner.test.ts`；H2：两个新 Browser sibling。
- E1：三个新 ComposerEditor Browser；保留 AtomicNode/ContentModel Browser 作为相邻回归。
- A1：三个新 AppProjection Browser。

命令统一在各 worktree 的 `codex-gui` cwd，以 fnm-backed pnpm 执行：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit -- <unit paths>
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:parallel -- <browser paths>
```

上面的占位符只能由下表对应行的完整 target list 原样替换，不得换 config、缩小 browser matrix 或添加
`--passWithNoTests`。每个 task 的 `T-B` 使用 baseline targets，`T-V` 使用 post targets；每个 `T-V` 还运行
无参数 `type-check`。

| task | script | baseline targets | post targets |
| --- | --- | --- | --- |
| Q1 | `test:unit` | `src/features/composerInputQueue/__tests__/composerInputQueue.test.ts` | `src/features/composerInputQueue/__tests__/composerInputQueueStart.test.ts src/features/composerInputQueue/__tests__/composerInputQueueSteer.test.ts src/features/composerInputQueue/__tests__/composerInputQueuePendingProjection.test.ts src/features/composerInputQueue/__tests__/composerInputQueueManagement.test.ts` |
| Q2 | `test:unit` | `src/features/composerInputQueue/__tests__/composerInputQueueCoordinator.test.ts` | `src/features/composerInputQueue/__tests__/composerInputQueueCoordinatorRelease.test.ts src/features/composerInputQueue/__tests__/composerInputQueueCoordinatorDelivery.test.ts src/features/composerInputQueue/__tests__/composerInputQueueCoordinatorManagement.test.ts src/features/composerInputQueue/__tests__/composerInputQueueCoordinatorMove.test.ts` |
| Q3/Q4 | `test:unit` | `src/features/composerInputQueue/__tests__/composerInputQueue.test.ts` | `src/features/composerInputQueue/__tests__/composerInputQueue.test.ts` |
| Q5 | `test:unit` | `src/features/composerInputQueue/__tests__/composerInputQueueCoordinator.test.ts src/features/activeThreadSession/__tests__/liveActiveThreadSession.test.ts src/features/activeThreadSession/__tests__/activeThreadSession.test.ts` | 同 baseline targets |
| U1 | `test:browser:parallel` | `src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx src/__tests__/AppComposerQueue.browser.test.tsx` | 同 baseline targets |
| U2 | `test:browser:parallel` | `src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx` | `src/features/composerTurnControl/__tests__/ComposerTurnControlSession.browser.test.tsx src/features/composerTurnControl/__tests__/ComposerTurnControlInput.browser.test.tsx src/features/composerTurnControl/__tests__/ComposerTurnControlPendingInput.browser.test.tsx src/features/composerTurnControl/__tests__/ComposerTurnControlDelivery.browser.test.tsx` |
| U3 | `test:browser:parallel` | `src/__tests__/AppComposerQueue.browser.test.tsx` | `src/__tests__/AppComposerQueueOrdinary.browser.test.tsx src/__tests__/AppComposerQueueSteer.browser.test.tsx src/__tests__/AppComposerQueueInterrupt.browser.test.tsx` |
| R1 | `test:browser:parallel` | `src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx` | 同 baseline targets |
| R2 | `test:browser:parallel` | `src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx` | `src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurfaceMessages.browser.test.tsx src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurfaceActivity.browser.test.tsx src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurfaceDisclosure.browser.test.tsx src/features/committedTranscriptSurface/__tests__/ReasoningTranscriptSurface.browser.test.tsx src/features/committedTranscriptSurface/__tests__/TranscriptContextPagination.browser.test.tsx` |
| R3 | `test:unit` | `src/features/transcriptState/__tests__/transcriptStateCommittedProjection.test.ts` | `src/features/transcriptState/__tests__/transcriptStateCommittedActivity.test.ts src/features/transcriptState/__tests__/transcriptStateCommittedMessages.test.ts src/features/transcriptState/__tests__/transcriptStateCommittedTerminal.test.ts src/features/transcriptState/__tests__/transcriptStateLiveItemLifecycle.test.ts` |
| R4 | `test:unit` | `src/features/transcriptState/__tests__/transcriptStateLiveStreaming.test.ts` | `src/features/transcriptState/__tests__/transcriptStateReasoningStreaming.test.ts src/features/transcriptState/__tests__/transcriptStateAgentMessageStreaming.test.ts src/features/transcriptState/__tests__/transcriptStateReconnect.test.ts` |
| H1 | `test:browser:parallel` | `src/features/threadHistory/__tests__/ThreadHistoryDetailPage.browser.test.tsx` | 同 baseline targets |
| H1 | `test:unit` | `src/features/threadHistory/__tests__/threadHistoryDetailOwner.test.ts` | 同 baseline targets |
| H2 | `test:browser:parallel` | `src/features/threadHistory/__tests__/ThreadHistoryDetailPage.browser.test.tsx` | `src/features/threadHistory/__tests__/ThreadHistoryDetailRead.browser.test.tsx src/features/threadHistory/__tests__/ThreadHistoryDetailContinuation.browser.test.tsx` |
| E1 | `test:browser:parallel` | `src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx` | `src/features/composerEditor/__tests__/ComposerEditorTypeahead.browser.test.tsx src/features/composerEditor/__tests__/ComposerEditorSkillTokens.browser.test.tsx src/features/composerEditor/__tests__/ComposerEditorLifecycle.browser.test.tsx src/features/composerEditor/__tests__/ComposerAtomicNodePlugin.browser.test.tsx src/features/composerEditor/__tests__/ComposerContentModelPlugin.browser.test.tsx` |
| A1 | `test:browser:parallel` | `src/__tests__/AppProjectionTranscript.browser.test.tsx` | `src/__tests__/AppProjectionIngress.browser.test.tsx src/__tests__/AppProjectionScroll.browser.test.tsx src/__tests__/AppProjectionAvailability.browser.test.tsx` |

每次执行前重新核对 cwd、branch、fnm/pnpm 来源、脚本存在、目标路径和 config discovery。exit 0 不能替代
target collection；任何 `0 collected`、错误 config、缺浏览器实例或目标文件不存在均为预检/验证失败。

## 完成条件

- 17 个 implementation/generation task boundary 全部形成各自稳定提交或有证据的 no-diff generation 结果，
  并在 `dev` 保留独立提交；不存在 squash/amend/remote。
- Queue 三个 private Module 形成闭合 state/transaction owner，外部 queue/coordinator/active-session Interface
  不变；ordinary/steer FIFO、reservation、revision/CAS、identity、delivery/recovery、mailbox replay 断言不变。
- Source UI 拆分保持 owner、DOM/ARIA/焦点、chunk/memo/selector、history read/activate 生命周期和 HeroUI 语义。
- 10 个 Test 候选的原 test names、源码注册点、真实 collection 与 Browser 三实例完整保留；mock/reset/global
  隔离不依赖文件执行顺序。
- Catalog 二次 extraction 稳定，只有可解释的 source-reference metadata；翻译与 message identity 无漂移。
- 全部最终验证通过；Level 2/3 保持不适用，除非实际 diff 触发升级条件。
- 最终报告分别说明结构收益、行为验证、collection、catalog/生成合同适用性和剩余候选；不以行数下降
  代替正确性。

## 计划确认门禁

用户明确确认本计划后，下一轮才允许执行。确认将激活本计划精确列出的文档提交、9 个 worktree 创建、
implementation/generation/verification、本地 task commits 与本地 integration；不授权任何 remote、force、
安装、headed GUI、范围外修复或未列出的产品行为变化。
