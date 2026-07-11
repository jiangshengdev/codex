# Codex GUI Refactoring Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to execute this plan. Dispatch only dependency-ready nodes; task numbering is not a serial queue.

**Goal:** 只读审核 `codex-gui` 当前代码，完成 `01-09` 分报告和最后生成的 `00-summary.md`，形成有源码证据、唯一 evidence owner、已跨报告去重的重构建议。

**Architecture:** `R01-R08` 是可并行推进的独立 workstream；每个 workstream 内按显式 DAG 拆成单一问题微阶段。只读调查代理及其子子代理承载证据阅读，每份报告由唯一写入者串行整合，不同报告可并行写入；所有 stage/commit 通过全局 Git 集成锁串行执行。`R09` 在八份草稿汇聚后执行 owner/coverage fixed-point，`R00` 仅在 `R09` 完成后汇总，Final Review 还必须等待所有报告最新内容已提交。

**Tech Stack:** Markdown、`rg`、`rg --files`、`sed`、`nl`、`wc`、文件读取、本地 `git status/diff/log/show`、Codex 子代理、现有 TypeScript/React 源码与测试。

---

## 当前状态

- `SCAFFOLD-COMMITTED` 已完成：commit `0be5bc4d5`，message `docs: scaffold GUI refactoring audit reports`，不重建报告骨架。
- `R01-DRAFT`、`R01-COMMITTED` 已完成：commit `79a98845c`，不重执行首次审计。
- `R02-DRAFT`、`R02-COMMITTED` 已完成：commit `e3811c146`，不重执行首次审计。
- `R03-DRAFT`、`R03-COMMITTED` 已完成：commit `8a1a56009`，不重执行首次审计。
- 已确认的并行调度设计由 commit `687fe4418` 记录。
- R04 上次停止时没有报告修改；从 `R04-SNAPSHOT` 与 `R04-LIVE` 重新开始。
- R05-R09、R00 和 Final Review 尚未执行。
- 本计划文件当前只处于待确认修改状态；报告执行不得把设计或计划文件混入报告提交。

## Global Rules

- 执行前阅读 `docs/superpowers/specs/2026-07-11-codex-gui-refactoring-audit-design.md`。
- 只允许修改 `docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/00-summary.md` 至 `09-cross-cutting-boundaries-and-exclusions.md`。
- 禁止修改 `codex-gui/**`、`docs/superpowers/specs/**`、`docs/superpowers/plans/**`、`docs/superpowers/issues/**`。
- 禁止运行 test suite、build、type-check、lint、format、profiling、benchmark、browser automation、package scripts、schema 或 snapshot 命令。
- 禁止安装程序、依赖、运行时或浏览器；禁止任何 git remote、fetch、pull 或 push。
- 允许的只读命令：`test`（仅文件/目录存在性）、`rg`、`rg --files`、`sed`、`nl`、`wc`、文件读取、本地 `git status`、`git diff`、`git log`、`git show`。
- 调研不得生成代码 patch；报告唯一写入者只能使用 `apply_patch` 修改其独占报告。
- 每个微阶段只回答一个问题、一条调用链、一个明确文件/函数范围或一个具体假设；范围扩大时停止并重新拆分。
- 不因文件大、文本相似或少量 helper 重复直接建立 finding；必须确认定义方、构造方、调用方、消费者、共同语义和变化原因。
- Transcript State 内部拆分只引用 `docs/superpowers/specs/2026-07-11-codex-gui-transcript-state-split-design.md` 并标记 `已有专项设计`，不得重报。
- 允许把 `docs/superpowers/reports/2026-07-09-codex-gui-system-performance-check/**` 作为归属引用输入；只在当前代码或既有报告明确关联时读取 `docs/superpowers/issues/**`，不得扩大为 issue 审计。
- 本地报告提交政策不变：`SCAFFOLD-COMMITTED`、每份报告首次完成、必要 reconciliation、必要 final 修订分别形成任务边界 commit；不访问 remote。
- 不创建或更新 issue，不实施任何重构。

## 角色与共享资源

- **主代理：** 拆分和调度节点，审核压缩结果，抽查关键源码证据，裁决 owner，维护 DAG 与 commit gate；禁止写文件、stage 或 commit。
- **只读调查代理/子子代理：** 一次只执行一个授权节点；可继续把互不依赖的单一问题拆给子子代理；禁止写报告、stage、commit 或扩大范围。
- **每报告唯一写入者：** 只修改一份被分配的报告，按主代理已审核结论串行整合；同一报告不得有第二写入者。
- **不同报告写入者：** 若目标文件不同且节点 dependency-ready，可以并行写入。
- **全局 Git 集成锁：** Git index 与 HEAD 是共享资源；任何 stage/commit 都必须先获得锁，多个报告禁止并行 stage/commit。

## `dependency-ready` 定义

一个节点只有同时满足以下条件才是 `dependency-ready`：

- `depends_on` 中每个正式节点都已释放，或该节点无前置依赖。
- 读取范围、目标报告和单一问题已经明确。
- 没有同一报告的并发写入，也没有 Git index/HEAD 冲突。
- 所需上游结论已被主代理审核；若节点依赖落盘结果，该结果已由唯一写入者整合。
- 独立且 dependency-ready 的节点优先并行；报告编号、同一方向或复用同一代理都不是串行理由。
- 并发数量由实际独立工作、协调成本和共享状态风险决定，不追求接近或填满任何上限。

## 统一 Git 集成协议

每次提交必须声明一个精确报告路径和一个固定 message；`SCAFFOLD-COMMITTED` 是唯一允许一次列出十个精确路径的例外。

1. 报告唯一写入者获得全局 Git 集成锁；未获锁不得 stage/commit。
2. 运行 `git diff --cached --quiet`。退出码为 `0` 才能继续；非零时立即停止并报告已有 staged diff，不得 reset、restore、unstage 或清理现场。
3. 运行 `git add <exact-report-path>`；禁止目录级 `git add`、命令替换和任何额外路径。
4. 运行 `git diff --cached --name-only`；输出必须只含本次声明的精确路径，否则停止且不清理。
5. 运行 `git diff --cached --check`；预期无输出且退出码为 `0`。
6. 运行 `git diff --cached` 阅读完整 staged diff，不使用 path filter。
7. 运行 `git commit -m '<fixed-message>'`；禁止并行提交或访问 remote。
8. 提交后运行 `git show --stat --oneline --name-only HEAD`，不得使用 path filter；确认完整 HEAD 文件列表/统计没有夹带文件。
9. 运行 `git status --short`，确认目标报告已干净并记录其他既有修改；释放全局 Git 集成锁。

## 正式 DAG

所有依赖只使用以下正式节点 ID；自然语言步骤名不构成依赖。

```text
SCAFFOLD-COMMITTED
  -> {R01-DRAFT, R02-DRAFT, R03-DRAFT, R04-DRAFT,
      R05-DRAFT, R06-DRAFT, R07-DRAFT, R08-DRAFT}

{R01-DRAFT, R02-DRAFT, R03-DRAFT, R04-DRAFT,
 R05-DRAFT, R06-DRAFT, R07-DRAFT, R08-DRAFT}
  -> {R09-OWNER-TABLE, R09-COVERAGE-SCAN}
{R09-OWNER-TABLE, R09-COVERAGE-SCAN}
  -> R09-REPAIR-FIXED-POINT
R09-REPAIR-FIXED-POINT
  -> R09-REPAIR-CONVERGED
{R09-OWNER-TABLE, R09-COVERAGE-SCAN, R09-REPAIR-CONVERGED}
  -> R09-STABLE-OWNER-COVERAGE
R09-STABLE-OWNER-COVERAGE
  -> {R09-CROSS-DOMAIN, R09-DEDUP}
{R09-CROSS-DOMAIN, R09-DEDUP, R09-STABLE-OWNER-COVERAGE}
  -> R09-COMPLETE
R09-COMPLETE
  -> {R00-INDEX, R00-BATCHES}
{R00-INDEX, R00-BATCHES}
  -> R00-COMPLETE

{SCAFFOLD-COMMITTED, R01-COMMITTED, R02-COMMITTED, R03-COMMITTED,
 R04-COMMITTED, R05-COMMITTED, R06-COMMITTED, R07-COMMITTED,
 R08-COMMITTED, R09-COMMITTED, R00-COMMITTED}
  -> ALL-REPORT-COMMITS-COMPLETE
{R00-COMPLETE, ALL-REPORT-COMMITS-COMPLETE}
  -> FINAL-REVIEW-COMPLETE
```

- `R01-R08` 的内部 DAG 见各 Workstream；它们从 `SCAFFOLD-COMMITTED` 并行分叉。
- `R01-DRAFT`、`R02-DRAFT`、`R03-DRAFT`、`R04-DRAFT`、`R05-DRAFT`、`R06-DRAFT`、`R07-DRAFT`、`R08-DRAFT` 只表示内容稳定、必需节点已审核整合、暂定 owner 已记录且路径 diff 已验证；不等待 Git commit。
- `R09-OWNER-TABLE` 与 `R09-COVERAGE-SCAN` 可并行，且只依赖八份 draft，不依赖对应 commits。
- 任一 R01-R08 修订请求产生时，立即使对应 `Rxx-DRAFT` 失效；若内容已提交，也使对应 `Rxx-COMMITTED` 失效。同时使所有基于旧 draft 的 `R09-OWNER-TABLE`、`R09-COVERAGE-SCAN`、`R09-REPAIR-FIXED-POINT`、`R09-REPAIR-CONVERGED`、`R09-STABLE-OWNER-COVERAGE`、`R09-CROSS-DOMAIN`、`R09-DEDUP`、`R09-COMPLETE` 失效，并传递使 `R00-INDEX`、`R00-BATCHES`、`R00-COMPLETE`、`ALL-REPORT-COMMITS-COMPLETE`、`FINAL-REVIEW-COMPLETE` 失效。对应报告由唯一写入者完成修订、主代理重新审核并通过路径 diff 验证后，才重新释放 `Rxx-DRAFT`；随后必须从 OWNER-TABLE/COVERAGE-SCAN 完整刷新并重新执行 fixed-point。
- `R09-CROSS-DOMAIN` 与 `R09-DEDUP` 只能在 stable 后并行调查，由 R09 唯一写入者串行整合。
- `R00` 严格等待 `R09-COMPLETE`；Final Review 严格等待 `R00-COMPLETE` 与 `ALL-REPORT-COMMITS-COMPLETE`。

## 通用节点输出模板

每个只读调查节点必须返回以下字段；首次返回不得写报告：

```md
- node_id: R04-SNAPSHOT
- depends_on: SCAFFOLD-COMMITTED
- target_report: 04-timeline-materials-and-domain-models.md
- allowed_scope: <精确路径、函数或调用链>
- status: complete | stop-split-required | insufficient-evidence
- conclusion: <压缩结论>
- evidence: <关键路径:行号，含定义方、构造方、调用方、消费者和测试>
- excluded: <已排除项及反证>
- risk: <行为、契约、状态、性能或测试风险>
- next: <下一正式节点或重新拆分建议>
```

主代理先审核范围、证据、owner、重复项和设计边界，再把通过的结论交给报告唯一写入者。只有同一依赖链和同一报告写入队列等待整合；其他 dependency-ready 节点继续执行。

## 通用报告整合与完成规则

- 每份 R01-R09 报告维护审计进度，记录 node ID、depends_on、调研状态、整合状态、压缩结论、Finding ID/覆盖状态和关键证据。
- 调研始终只读；主代理只审查；唯一写入者使用 `apply_patch` 串行整合。
- 同一报告的多个已审核结果按到达顺序整合，不允许并发写；不同报告可以并行写。
- 每次写入后运行 `git diff --check -- <exact-report-path>` 和 `git diff -- <exact-report-path>`。
- 落盘只阻塞依赖该结果的后继节点，不阻塞其他报告或独立链路。
- 完成门禁通过后释放 `Rxx-DRAFT` 或 `R09-COMPLETE`/`R00-COMPLETE`；提交状态由独立 commit gate 管理。

## Finding、Owner 与跨报告引用契约

### ID、状态与优先级

- R01-R09 使用 `RA-<两位报告号>-<三位序号>`，例如 `RA-04-001`；各主报告从 `001` 连续递增，不因状态变化重编号。
- `已有专项设计`、`已由现有抽象覆盖`、`不建议重构` 也分配 ID，供覆盖矩阵引用。
- 状态只能是：`确认重构点`、`候选待补证据`、`证据不足`、`不建议重构`、`已由现有抽象覆盖`、`已有专项设计`。
- 优先级只能是：`P0`、`P1`、`P2`、`P3`、`非 finding`。
- 只有 `确认重构点` 和证据充分的 `候选待补证据` 可以进入 R00 建议批次。

### Finding 固定字段

每个 finding 必须包含：ID/标题、主报告/evidence owner、状态、优先级、结论摘要、当前 owner/职责、问题类型、影响文件、定义方、构造方、调用方、消费者、共同语义或不抽象理由、推荐边界/建议 owner/允许依赖方向、预期收益、最小可审查批次、明确排除范围、行为/契约/状态/性能/测试风险、后续建议验证范围、关键证据路径/行号、关联报告/issue/专项设计、已排除项、后续建议。

### Evidence owner

- 每个 Finding ID 只有一个主报告和一个 evidence owner；同一文件可被多个报告读取，但完整论证只能存在于 owner 报告。
- owner 裁决顺序：定义侧优先、稳定领域 owner 优先、单 feature 优先于跨域汇总。
- R09 只拥有无法自然归属单一 feature 的跨域 finding；R00 不拥有 finding。
- 任何 owner 变化必须先修订原报告，再使 R09 下游节点失效并重新扫描。

### 跨报告引用

非 owner 报告只能保留以下三项，禁止复制完整证据、推荐边界、风险或验证建议：

```md
- 交界引用: [RA-04-001](./04-timeline-materials-and-domain-models.md#ra-04-001)
- 本报告仅使用的交界事实: <不超过两句>
- Evidence owner: 04-timeline-materials-and-domain-models
```

## Workstream R01 — App Entry, Shell, And Platform（已完成）

**Files:**

- `codex-gui/src/main.tsx`, `codex-gui/src/App.tsx`, `codex-gui/src/router.tsx`, `codex-gui/src/index.css`
- `codex-gui/src/app/ThemeProvider.tsx`, `codex-gui/src/app/createAppSlice.ts`, `codex-gui/src/app/hooks.ts`, `codex-gui/src/app/store.ts`
- `codex-gui/src/features/appShell/AppShell.tsx`, `codex-gui/src/__tests__/App.browser.test.tsx`
- Report: `docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/01-app-entry-shell-and-platform.md`

| node ID | depends_on | 单一问题 | 并行关系 |
| --- | --- | --- | --- |
| R01-BOOTSTRAP | SCAFFOLD-COMMITTED | bootstrap/provider/store 装配、类型 owner、稳定公共语义 | 与 R01-SHELL 并行 |
| R01-SHELL | SCAFFOLD-COMMITTED | shell composition、platform/environment、顶层状态归属 | 与 R01-BOOTSTRAP 并行 |
| R01-NEGATIVE | R01-BOOTSTRAP, R01-SHELL | 现有 hooks/slice/provider 抽象覆盖与否定结论 | 汇聚节点 |

完成门禁：所有主文件有覆盖状态；finding 字段齐全；02/03/07 只保留交界引用。`R01-DRAFT` 与 `R01-COMMITTED` 已释放，不重执行。

Validation: `git diff --check -- docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/01-app-entry-shell-and-platform.md`

First commit: `docs: audit GUI app shell refactoring boundaries`

## Workstream R02 — GUI Host Transport And Protocol（已完成）

**Files:**

- `codex-gui/src/features/guiHost/guiHostClient.ts`, `codex-gui/src/features/guiHost/guiHostProtocol.ts`
- `codex-gui/src/features/guiHost/__tests__/guiHostClientTestSupport.ts`
- `codex-gui/src/features/guiHost/__tests__/guiHostLaunchParams.test.ts`, `codex-gui/src/features/guiHost/__tests__/guiHostHandshake.test.ts`
- `codex-gui/src/features/guiHost/__tests__/guiHostCommands.test.ts`, `codex-gui/src/features/guiHost/__tests__/guiHostProtocolErrors.test.ts`
- Report: `docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/02-gui-host-transport-and-protocol.md`

| node ID | depends_on | 单一问题 | 并行关系 |
| --- | --- | --- | --- |
| R02-LAUNCH | SCAFFOLD-COMMITTED | launch params/token/URL 定义、解析、存储和生产调用方 | wave 1 并行 |
| R02-TRANSPORT | SCAFFOLD-COMMITTED | WebSocket、请求关联、握手、关闭职责 | wave 1 并行 |
| R02-PROTOCOL | SCAFFOLD-COMMITTED | protocol parsing、commands、errors、公共类型 owner | wave 1 并行 |
| R02-OWNER | R02-LAUNCH, R02-TRANSPORT, R02-PROTOCOL | wire/transport/launch owner 与 03 handoff | 汇聚节点 |

完成门禁：launch、transport、handshake、protocol 均有结论；与 03 的交界仅为 connection/notification handoff。`R02-DRAFT` 与 `R02-COMMITTED` 已释放，不重执行。

Validation: `git diff --check -- docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/02-gui-host-transport-and-protocol.md`

First commit: `docs: audit GUI host transport boundaries`

## Workstream R03 — Projection Ingress And Thread Runtime（已完成）

**Files:**

- `codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx`
- `codex-gui/src/features/projectionIngress/projectionIngressAdapter.ts`, `codex-gui/src/features/projectionIngress/__tests__/projectionIngressAdapter.test.ts`
- `codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts`, `codex-gui/src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts`
- `codex-gui/src/features/threadIdentity/threadIdentitySlice.ts`, `codex-gui/src/features/threadIdentity/__tests__/threadIdentitySlice.test.ts`
- Report: `docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/03-projection-ingress-and-thread-runtime.md`

| node ID | depends_on | 单一问题 | 并行关系 |
| --- | --- | --- | --- |
| R03-BRIDGE | SCAFFOLD-COMMITTED | connection callbacks、event/close handoff、依赖方向 | wave 1 并行 |
| R03-ADAPTER | SCAFFOLD-COMMITTED | adapter 构造、filtering/batching/reconnect 契约 owner | wave 1 并行 |
| R03-RUNTIME | SCAFFOLD-COMMITTED | runtime 与 identity state 边界 | wave 1 并行 |
| R03-BOUNDARY | R03-BRIDGE, R03-ADAPTER, R03-RUNTIME | 02/04/05 交界与全部生产消费者 | 汇聚节点 |

完成门禁：bridge、adapter、runtime、identity 全覆盖；不重审 protocol、timeline 或 transcript reducer。`R03-DRAFT` 与 `R03-COMMITTED` 已释放，不重执行。

Validation: `git diff --check -- docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/03-projection-ingress-and-thread-runtime.md`

First commit: `docs: audit projection runtime boundaries`

## Workstream R04 — Timeline Materials And Domain Models

**Files:**

- `codex-gui/src/features/snapshotReplay/snapshotReplay.ts`, `codex-gui/src/features/snapshotReplay/__tests__/snapshotReplay.test.ts`
- `codex-gui/src/features/liveEventHandling/liveEventHandling.ts`, `codex-gui/src/features/liveEventHandling/__tests__/liveEventHandling.test.ts`
- Direct boundaries: `codex-gui/src/features/appShell/AppShell.tsx`, `codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts`
- Report: `docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/04-timeline-materials-and-domain-models.md`

| node ID | depends_on | 单一问题 | 并行关系 |
| --- | --- | --- | --- |
| R04-SNAPSHOT | SCAFFOLD-COMMITTED | snapshot Turn/items 转换、材料构造、类型、测试、生产调用方 | 与 R04-LIVE 并行 |
| R04-LIVE | SCAFFOLD-COMMITTED | live materials、selector、snapshot/live 聚合、测试、消费者 | 与 R04-SNAPSHOT 并行 |
| R04-TIMELINE-OWNER | R04-SNAPSHOT, R04-LIVE | 共同 timeline 语义、类型 owner、组合职责、依赖方向 | 汇聚节点 |

完成门禁：重复转换、`TimelineMaterial` owner、组合 selector 分别有结论；不建立无领域名称的 common/utils；03 只拥有 accepted event，05 只拥有 transcript projection input。主代理审核并由 R04 写入者整合全部节点后释放 `R04-DRAFT`。

Validation: `git diff --check -- docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/04-timeline-materials-and-domain-models.md`

First commit: `docs: audit timeline domain boundaries`；成功后释放 `R04-COMMITTED`。

## Workstream R05 — Transcript State And Materialization

**Files:**

- Design: `docs/superpowers/specs/2026-07-11-codex-gui-transcript-state-split-design.md`
- `codex-gui/src/features/transcriptState/transcriptStateModel.ts`, `codex-gui/src/features/transcriptState/transcriptEventDedup.ts`
- `codex-gui/src/features/transcriptState/transcriptLiveProjection.ts`, `codex-gui/src/features/transcriptState/transcriptCommittedProjection.ts`
- `codex-gui/src/features/transcriptState/transcriptStateSelectors.ts`, `codex-gui/src/features/transcriptState/transcriptEntryMaterialization.ts`
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts`, `codex-gui/src/features/transcriptState/__tests__/**`
- Boundaries: `codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts`, `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx`
- Report: `docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/05-transcript-state-and-materialization.md`

| node ID | depends_on | 单一问题 | 并行关系 |
| --- | --- | --- | --- |
| R05-DESIGN-MAP | SCAFFOLD-COMMITTED | 专项设计与当前 production/test 文件逐项映射 | 前置节点 |
| R05-MATERIALIZATION | R05-DESIGN-MAP | `TranscriptEntry`/materialization owner、调用方、re-export、残余反向依赖 | wave 2 并行 |
| R05-BOUNDARIES | R05-DESIGN-MAP | 03 action、04 timeline、06 selector-to-React 交界 | wave 2 并行 |
| R05-DEDUP | R05-MATERIALIZATION, R05-BOUNDARIES | 专项设计覆盖、残余点、重复候选最终去重 | 汇聚节点 |

完成门禁：专项设计覆盖均标记 `已有专项设计`；不以大文件、职责混合或测试拆分重报内部方案；新增条目只能是跨 feature 或未覆盖残余点。全部整合后释放 `R05-DRAFT`。

Validation: `git diff --check -- docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/05-transcript-state-and-materialization.md`

First commit: `docs: audit transcript state boundaries`；成功后释放 `R05-COMMITTED`。

## Workstream R06 — Transcript Rendering, Streaming, And Scroll

**Files:**

- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx`, `codex-gui/src/features/committedTranscriptSurface/LiveMarkdownText.tsx`
- `codex-gui/src/features/committedTranscriptSurface/MarkdownText.tsx`, `codex-gui/src/features/committedTranscriptSurface/markdownRendering.tsx`
- `codex-gui/src/features/committedTranscriptSurface/committedTranscriptChunkEquality.ts`
- `codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx`
- `codex-gui/src/features/committedTranscriptSurface/__tests__/committedTranscriptChunkEquality.test.ts`
- `codex-gui/src/features/appShell/useCommittedTranscriptStickyBottom.ts`, `codex-gui/src/features/appShell/AppShell.tsx`
- Selector boundary: `codex-gui/src/features/transcriptState/transcriptStateSelectors.ts`
- Report: `docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/06-transcript-rendering-streaming-and-scroll.md`

| node ID | depends_on | 单一问题 | 并行关系 |
| --- | --- | --- | --- |
| R06-SURFACE | SCAFFOLD-COMMITTED | committed/live composition、chunk 输入、equality owner、browser test | wave 1 并行 |
| R06-MARKDOWN | SCAFFOLD-COMMITTED | live/static Markdown 共同配置、差异语义、调用方 | wave 1 并行 |
| R06-STICKY | SCAFFOLD-COMMITTED | sticky-bottom、scroll signal、AppShell composition、副作用 owner | wave 1 并行 |
| R06-BOUNDARY | R06-SURFACE, R06-MARKDOWN, R06-STICKY | UI/state/shell 最终边界 | 汇聚节点 |

完成门禁：committed rendering、live/static Markdown、chunk equality、scroll side effect 全覆盖；UI 消费归 06，state signal 定义归 05，shell composition 归 01；不重审 state shape 或 projection。全部整合后释放 `R06-DRAFT`。

Validation: `git diff --check -- docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/06-transcript-rendering-streaming-and-scroll.md`

First commit: `docs: audit transcript rendering boundaries`；成功后释放 `R06-COMMITTED`。

## Workstream R07 — Composer, Access, And Localization

**Files:**

- `codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx`, `codex-gui/src/features/composerTurnControl/composerTurnControlModel.ts`
- `codex-gui/src/features/composerTurnControl/useRevealComposerOnViewportResize.ts`
- `codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx`, `codex-gui/src/features/composerTurnControl/__tests__/composerTurnControlModel.test.ts`
- `codex-gui/src/features/qrAccess/QrAccessPopover.tsx`, `codex-gui/src/features/qrAccess/qrAccessUrl.ts`
- `codex-gui/src/features/qrAccess/__tests__/QrAccessPopover.browser.test.tsx`, `codex-gui/src/features/qrAccess/__tests__/qrAccessUrl.test.ts`
- `codex-gui/src/i18n.ts`, `codex-gui/src/LanguageSwitcher.tsx`, `codex-gui/src/MsgExample.tsx`, `codex-gui/src/PluralExample.tsx`, `codex-gui/src/NotFoundPage.tsx`
- `codex-gui/src/locales/en.po`, `codex-gui/src/locales/zh-CN.po`
- Report: `docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/07-composer-access-and-localization.md`

| node ID | depends_on | 单一问题 | 并行关系 |
| --- | --- | --- | --- |
| R07-COMPOSER | SCAFFOLD-COMMITTED | UI control、model、turn actions、错误展示、测试 | wave 1 并行 |
| R07-ACCESS | SCAFFOLD-COMMITTED | viewport resize、环境检测、QR/access URL、popover、测试 | wave 1 并行 |
| R07-I18N | SCAFFOLD-COMMITTED | i18n 初始化、LanguageSwitcher、examples/not-found、catalog 消费 | wave 1 并行 |
| R07-BOUNDARY | R07-COMPOSER, R07-ACCESS, R07-I18N | shell/platform 交界与完整覆盖 | 汇聚节点 |

完成门禁：composer、viewport、QR/access、i18n、examples/not-found 全覆盖；与 01 的 shell/platform 交界明确；生成 catalog 只记录覆盖，不提出手工重构。全部整合后释放 `R07-DRAFT`。

Validation: `git diff --check -- docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/07-composer-access-and-localization.md`

First commit: `docs: audit composer access and localization`；成功后释放 `R07-COMMITTED`。

## Workstream R08 — Test Infrastructure, Fixtures, And Support

**Files:**

- `codex-gui/src/__tests__/appBrowserTestSupport.ts`, `codex-gui/src/__tests__/App.browser.test.tsx`
- `codex-gui/src/utils/TestProvider.tsx`, `codex-gui/src/utils/test-utils.tsx`
- `codex-gui/src/features/guiHost/__tests__/guiHostClientTestSupport.ts`
- `codex-gui/src/features/projection/__tests__/projectionFixtures.ts`, `codex-gui/src/features/projection/__tests__/projectionFixtures.test.ts`
- `codex-gui/src/features/projection/__tests__/projectionTestBuilders.ts`, `codex-gui/src/features/projection/__fixtures__/**`
- All feature tests: `codex-gui/src/features/**/__tests__/**`
- Report: `docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/08-test-infrastructure-fixtures-and-support.md`

| node ID | depends_on | 单一问题 | 并行关系 |
| --- | --- | --- | --- |
| R08-GLOBAL | SCAFFOLD-COMMITTED | TestProvider/test-utils/app browser support 的装配和消费者 | wave 1 并行 |
| R08-HOST | SCAFFOLD-COMMITTED | GUI host test support 与 handshake/commands/protocol tests | wave 1 并行 |
| R08-PROJECTION | SCAFFOLD-COMMITTED | projection fixtures/builders/fixture tests/消费者 | wave 1 并行 |
| R08-UI-SUPPORT | R08-GLOBAL | UI tests 的 render setup、交互装配、locator 前置和局部 helper | wave 2 并行 |
| R08-STATE-SUPPORT | R08-PROJECTION | state/projection tests 的 action/setup、state、reducer harness、断言 helper | wave 2 并行 |
| R08-COVERAGE | R08-GLOBAL, R08-HOST, R08-PROJECTION, R08-UI-SUPPORT, R08-STATE-SUPPORT | 测试/fixture 全覆盖和边界门禁 | 汇聚节点 |

`R08-UI-SUPPORT` 只依赖 global support；GUI host support 的结论可作为同 wave 独立交界输入，不得把它变成不必要的串行门禁。`R08-STATE-SUPPORT` 只依赖 projection fixtures；两者 dependency-ready 后并行。

完成门禁：全部测试/fixture 文件有覆盖状态；每个候选有消费者；malformed payload 和必要 expected value 保持显式；production finding 只跨报告引用；不建议新增 test-only production API。全部整合后释放 `R08-DRAFT`。

Validation: `git diff --check -- docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/08-test-infrastructure-fixtures-and-support.md`

First commit: `docs: audit GUI test infrastructure`；成功后释放 `R08-COMMITTED`。

## Workstream R09 — Evidence Ownership, Coverage, And Deduplication

**Files:**

- Read: `docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/01-app-entry-shell-and-platform.md`
- Read: `docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/02-gui-host-transport-and-protocol.md`
- Read: `docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/03-projection-ingress-and-thread-runtime.md`
- Read: `docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/04-timeline-materials-and-domain-models.md`
- Read: `docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/05-transcript-state-and-materialization.md`
- Read: `docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/06-transcript-rendering-streaming-and-scroll.md`
- Read: `docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/07-composer-access-and-localization.md`
- Read: `docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/08-test-infrastructure-fixtures-and-support.md`
- Read: every path returned by `rg --files codex-gui/src`
- Modify: `docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/09-cross-cutting-boundaries-and-exclusions.md`

| node ID | depends_on | 单一问题 | 并行关系 |
| --- | --- | --- | --- |
| R09-OWNER-TABLE | R01-DRAFT, R02-DRAFT, R03-DRAFT, R04-DRAFT, R05-DRAFT, R06-DRAFT, R07-DRAFT, R08-DRAFT | 提取 ID/status/priority/owner/reference，报告冲突与缺字段 | 与 COVERAGE 并行 |
| R09-COVERAGE-SCAN | R01-DRAFT, R02-DRAFT, R03-DRAFT, R04-DRAFT, R05-DRAFT, R06-DRAFT, R07-DRAFT, R08-DRAFT | 将每个 `codex-gui/src` 路径映射到主报告/交界/结果/排除理由 | 与 OWNER 并行 |
| R09-REPAIR-FIXED-POINT | R09-OWNER-TABLE, R09-COVERAGE-SCAN | 把遗漏/冲突退回 owner 报告并刷新扫描，直到无新修订 | 循环节点 |
| R09-REPAIR-CONVERGED | R09-REPAIR-FIXED-POINT | 证明无待处理修订、无新增 owner/coverage 差异 | 收敛输出 |
| R09-STABLE-OWNER-COVERAGE | R09-OWNER-TABLE, R09-COVERAGE-SCAN, R09-REPAIR-CONVERGED | 释放稳定 owner/coverage 快照 | 硬门禁 |
| R09-CROSS-DOMAIN | R09-STABLE-OWNER-COVERAGE | 真正跨 feature 的类型 owner、依赖方向、循环风险、重复领域语义 | 与 DEDUP 并行 |
| R09-DEDUP | R09-STABLE-OWNER-COVERAGE | 重复候选合并、保留 owner、排除 shared/common/utils 抽象 | 与 CROSS 并行 |

### Fixed-point 规则

1. OWNER-TABLE 与 COVERAGE-SCAN 使用同一版 R01-R08 draft，可并行执行并由 R09 写入者串行整合。
2. 任何遗漏、缺字段、owner 冲突或重复论证都形成 R01-R08 修订请求并退回对应报告唯一写入者；无论请求由 R09、R00 还是 Final Review 发现，都使用同一失效传播规则。不同报告可并行修订，同一报告串行。
3. 修订请求产生时，立即使对应 `Rxx-DRAFT` 及已存在的 `Rxx-COMMITTED` 失效；同时使 `R09-OWNER-TABLE`、`R09-COVERAGE-SCAN`、`R09-REPAIR-FIXED-POINT`、`R09-REPAIR-CONVERGED`、`R09-STABLE-OWNER-COVERAGE`、`R09-CROSS-DOMAIN`、`R09-DEDUP`、`R09-COMPLETE` 失效，并传递使 `R00-INDEX`、`R00-BATCHES`、`R00-COMPLETE`、`ALL-REPORT-COMMITS-COMPLETE`、`FINAL-REVIEW-COMPLETE` 失效；不得继续使用旧 snapshot。
4. 对应报告唯一写入者完成修订、主代理重新审核且路径 diff 验证通过后，重新释放 `Rxx-DRAFT`；随后重新运行 OWNER-TABLE 与 COVERAGE-SCAN 并从头执行 fixed-point。若仍产生修订，继续循环。
5. 只有一次完整刷新没有产生新修订，才释放 `R09-REPAIR-CONVERGED` 和 `R09-STABLE-OWNER-COVERAGE`。
6. CROSS-DOMAIN 与 DEDUP 在 stable 后并行调查；R09 写入者串行整合。若它们发现 owner/coverage 问题，回到 fixed-point，旧结果失效。

### 修订提交

- 尚未首次提交的报告把修订并入首次 commit，不创建 reconciliation commit。
- 已首次提交的报告每次只提交一个精确报告路径，并使用对应 message：
  - R01: `docs: reconcile GUI app shell audit`
  - R02: `docs: reconcile GUI host audit`
  - R03: `docs: reconcile projection runtime audit`
  - R04: `docs: reconcile timeline domain audit`
  - R05: `docs: reconcile transcript state audit`
  - R06: `docs: reconcile transcript rendering audit`
  - R07: `docs: reconcile composer access audit`
  - R08: `docs: reconcile GUI test infrastructure audit`
- 每次修订都会使对应 `Rxx-COMMITTED` 失效；按统一 Git 协议提交最新整合后恢复。

完成门禁：Finding ID 唯一；每个 `codex-gui/src` 文件有主报告或排除理由；所有 owner 冲突已裁决；09 自有 finding 确实跨域；09 不复制 01-R08 完整论证；Transcript State 内部拆分只标记 `已有专项设计`。满足后释放 `R09-COMPLETE`。

Validation: `git diff --check -- docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/09-cross-cutting-boundaries-and-exclusions.md`

First commit: `docs: audit cross-cutting GUI boundaries`；成功后释放 `R09-COMMITTED`。

## Workstream R00 — Summary Last

**Files:**

- Read: `docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/01-app-entry-shell-and-platform.md`
- Read: `docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/02-gui-host-transport-and-protocol.md`
- Read: `docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/03-projection-ingress-and-thread-runtime.md`
- Read: `docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/04-timeline-materials-and-domain-models.md`
- Read: `docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/05-transcript-state-and-materialization.md`
- Read: `docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/06-transcript-rendering-streaming-and-scroll.md`
- Read: `docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/07-composer-access-and-localization.md`
- Read: `docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/08-test-infrastructure-fixtures-and-support.md`
- Read: `docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/09-cross-cutting-boundaries-and-exclusions.md`
- Modify: `docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/00-summary.md`

| node ID | depends_on | 单一问题 | 并行关系 |
| --- | --- | --- | --- |
| R00-INDEX | R09-COMPLETE | 按状态/优先级汇总 ID、标题、owner 与分报告覆盖 | 与 BATCHES 并行 |
| R00-BATCHES | R09-COMPLETE | 只依据已成立 finding 生成批次、依赖、设计入口、排除范围 | 与 INDEX 并行 |

R00 不产生新 Finding ID、新源码 evidence、新 owner/status/priority 或新推荐边界。若 R00 发现 R01-R08 遗漏，立即创建修订请求并按统一规则使对应 draft/commit、全部 R09 节点、R00 节点、commit gate 和 Final Review 失效；原报告重新释放 `Rxx-DRAFT` 后，必须从 OWNER-TABLE/COVERAGE-SCAN 完整刷新并重新 fixed-point，不得直接在 R00 补证据。

完成门禁：分报告索引、覆盖状态、状态/优先级计数、建议批次、依赖顺序、证据不足和排除项齐全；不复制分报告完整论证。主代理审核并由 R00 写入者串行整合后释放 `R00-COMPLETE`。

Validation: `git diff --check -- docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/00-summary.md`

Commit: `docs: summarize GUI refactoring audit`；成功后释放 `R00-COMMITTED`。

## Commit Gate

- `Rxx-COMMITTED` 表示对应报告当前最新整合内容已按统一 Git 协议提交，不只是曾经存在某个首次 commit。
- 任一报告修订立即使其 `Rxx-COMMITTED` 失效；最新整合重新提交并完成无 path filter 的 HEAD 检查后恢复。
- Git 队列等待不阻塞 `Rxx-DRAFT` 或只读 dependency-ready 节点，但 R09/00 修订仍按内容 DAG 使下游失效。
- `ALL-REPORT-COMMITS-COMPLETE` 只有在以下条件全部满足时释放：
  - `SCAFFOLD-COMMITTED`、`R01-COMMITTED`、`R02-COMMITTED`、`R03-COMMITTED`、`R04-COMMITTED`、`R05-COMMITTED`、`R06-COMMITTED`、`R07-COMMITTED`、`R08-COMMITTED`、`R09-COMMITTED`、`R00-COMMITTED` 均有效。
  - 全局 Git 集成队列为空，没有等待 stage/commit 的报告修订。
  - `git diff --cached --quiet` 成功。
  - `git status --short -- docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit` 无输出。
  - 每次最新报告提交都已用 `git show --stat --oneline --name-only HEAD`（无 path filter）确认没有夹带文件。

## Final Review

Final Review 的 `depends_on` 是 `R00-COMPLETE` 和 `ALL-REPORT-COMMITS-COMPLETE`；任何一个未释放都禁止启动。

以下只读节点可并行执行：

| node ID | 单一检查 | 命令/证据 |
| --- | --- | --- |
| FR-STATUS | 未完成状态或占位内容 | `rg -n -e '未开始|待审计|尚未审计|PLACEHOLDER' docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit` |
| FR-FINDINGS | ID、固定字段、状态、优先级、owner | `rg -n -e 'Finding ID:|Evidence owner:|状态:|重构优先级:' docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit` |
| FR-COVERAGE | 每个源码/测试路径的主报告或排除理由 | 比较 `rg --files codex-gui/src` 与 R09 覆盖矩阵，必须逐路径核对 |
| FR-BOUNDARIES | Transcript State、R09、R00 边界 | 读取 05/09/00，确认无内部重报、无单 feature 复制、无 R00 新 finding |
| FR-GIT | 禁止文件、index、报告历史与目录状态 | `git status --short -- codex-gui docs/superpowers/specs docs/superpowers/plans docs/superpowers/issues`；`git diff --cached --quiet`；本地 `git log` |

- 主代理等待全部检查返回后统一裁决；只读代理不得修文档。
- 文档问题退回对应报告唯一写入者；不同报告可并行修订，同一报告串行。
- Final Review 发现 R01-R08 问题时，立即创建修订请求并按统一规则使对应 `Rxx-DRAFT`/`Rxx-COMMITTED`、全部 R09 节点、R00 节点、`ALL-REPORT-COMMITS-COMPLETE`、`FINAL-REVIEW-COMPLETE` 失效；原报告重新审核并释放 `Rxx-DRAFT` 后，必须从 OWNER-TABLE/COVERAGE-SCAN 完整刷新并重新 fixed-point、重新提交、重新执行受影响的 final 节点。
- Final 修订每次仍只提交一个精确报告路径，message 为 `docs: finalize GUI refactoring audit`；禁止目录级 `git add` 和空提交。
- 全部 final 节点通过、报告目录/index 干净、相关 commit gate 重新有效后释放 `FINAL-REVIEW-COMPLETE`。

## 执行完成条件

- `R01-R08` 的 dependency-ready 微阶段依据真实依赖跨报告并行，没有按编号机械串行。
- 调研代理/子子代理一次只执行一个只读节点；每份报告只有一个写入者；不同报告允许并行写入。
- 全局 Git 集成锁保证所有 stage/commit 串行，精确 path add，无目录级 add，无命令替换，无夹带文件。
- 并发数量由实际独立工作和协调收益决定，不追求填满上限。
- R09 owner/coverage fixed-point 已稳定；R00 与 Final Review 的硬门禁均被遵守。
- Finding 字段完整、ID 唯一、evidence owner 唯一、跨报告引用不复制完整证据。
- 所有 `codex-gui/src` 文件有主报告或明确排除理由；Transcript State 内部拆分没有被重报。
- 00-09 最新内容均已本地提交，Git 队列、index 和报告目录干净。
- 未修改禁止路径，未运行禁止命令，未安装依赖，未访问 git remote。
