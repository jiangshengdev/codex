# Codex GUI Refactoring Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 只读审核 codex-gui 当前代码，按设计产出 01-09 分报告和最后生成的 00 总报告，为后续独立重构设计提供有证据、已去重的建议。

**Architecture:** 先建立 00-09 报告骨架，再按报告边界顺序执行微切片。每个报告由一个负责子代理持续接受 follow-up，分阶段读取、返回压缩结论并落盘阶段状态；主代理只协调、抽查和验收，不写文件、不 stage、不 commit。01-08 完成后由 09 统一确定 evidence ownership、覆盖矩阵和跨报告去重，最后才允许生成 00-summary。

**Tech Stack:** Markdown 报告、只读 rg/rg --files/sed/nl/wc、本地 git status/diff/log/show、Codex 子代理、现有 TypeScript/React 源码和测试。

---

## Global Rules

- 执行前必须阅读 docs/superpowers/specs/2026-07-11-codex-gui-refactoring-audit-design.md。
- 不修改 codex-gui/**、docs/superpowers/specs/**、docs/superpowers/plans/** 或 docs/superpowers/issues/**。
- 本计划只允许创建和修改 docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/ 下的 00-09 报告。
- 禁止运行测试套件、build、type-check、lint、format、profiling、benchmark、browser automation、package scripts、schema/snapshot 命令。
- 禁止安装程序、依赖、运行时或浏览器；禁止任何 git remote、fetch、pull 或 push。
- 允许的只读检查仅包括 test、rg、rg --files、sed、nl、wc、文件读取，以及本地 git status、diff、log、show；test 只用于文件或目录存在性断言。
- 允许使用 mkdir -p 创建 docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit 报告目录，不得用于其他路径。
- 报告写入允许使用 apply_patch；任务边界允许负责子代理执行路径限定的 git add 和本地 git commit。
- 主代理不得写文件、stage 或 commit。所有报告写入、路径限定验证后的修正、stage 和本地 commit 都交给当前任务的负责子代理。
- 每个报告任务只使用一个负责子代理。同一方向的后续微阶段必须通过 follow-up 复用该子代理，不得为相邻阶段重新派发开放式任务。
- 主代理收到每个微阶段结果后，必须先审核并要求负责子代理落盘阶段状态和压缩结论；落盘完成并经主代理抽查后，才允许发送下一阶段 follow-up。
- 子代理不得自行跨入未授权文件或新假设。若阶段需要多个独立调用链，返回停止原因和拆分建议。
- 每个 finding 必须有唯一 evidence owner。其他报告只能使用规定的跨报告引用格式。
- 现有 docs/superpowers/specs/2026-07-11-codex-gui-transcript-state-split-design.md 已拥有 Transcript State 内部拆分。本计划只将其标记为 已有专项设计，不重审、不改写、不换标题重复报告。
- 00-summary 不得产生新 finding；09 必须在 01-08 全部完成后执行；00 必须在 09 完成后执行。
- 不创建或更新 issue。报告可以指出后续需单独进入设计或补证据，但本计划不实施重构。

## File Structure

### 只读设计和既有成果

- Read: docs/superpowers/specs/2026-07-11-codex-gui-refactoring-audit-design.md
- Read: docs/superpowers/specs/2026-07-11-codex-gui-transcript-state-split-design.md
- Read as attribution input: docs/superpowers/reports/2026-07-09-codex-gui-system-performance-check/**
- Read as needed: docs/superpowers/issues/** 中被当前代码或既有报告明确关联的条目

### 创建的报告

- Create: docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/00-summary.md
- Create: docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/01-app-entry-shell-and-platform.md
- Create: docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/02-gui-host-transport-and-protocol.md
- Create: docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/03-projection-ingress-and-thread-runtime.md
- Create: docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/04-timeline-materials-and-domain-models.md
- Create: docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/05-transcript-state-and-materialization.md
- Create: docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/06-transcript-rendering-streaming-and-scroll.md
- Create: docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/07-composer-access-and-localization.md
- Create: docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/08-test-infrastructure-fixtures-and-support.md
- Create: docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/09-cross-cutting-boundaries-and-exclusions.md

### 文件职责

- 01-08 各自拥有对应 feature 或机制的完整 finding 证据。
- 09 拥有无法自然归属单一 feature 的跨域 finding、全量文件覆盖矩阵、evidence ownership 表和排除项。
- 00 只汇总 01-09 已成立的结论、状态、优先级、建议批次和依赖顺序。

## Finding 与引用契约

### Finding ID

- 01-08 的 ID 使用 RA-<两位报告号>-<三位序号>，例如 RA-04-001。
- 09 自有的跨域 finding 使用 RA-09-<三位序号>。
- 序号在各主报告内从 001 连续递增，不因状态变化重编号。
- 已有专项设计、已由现有抽象覆盖和不建议重构也使用 ID，保证覆盖矩阵可引用。

### 状态

状态只能使用：

- 确认重构点
- 候选待补证据
- 证据不足
- 不建议重构
- 已由现有抽象覆盖
- 已有专项设计

### 优先级

优先级只能使用：

- P0
- P1
- P2
- P3
- 非 finding

优先级表达重构紧迫性，不表达性能复杂度。只有确认重构点或证据充分的候选待补证据可以进入 00 的建议批次。

### Evidence Owner

主报告中的 finding 必须包含：

~~~md
- Finding ID: RA-04-001
- Evidence owner: 04-timeline-materials-and-domain-models
- 状态: 确认重构点
- 重构优先级: P2
~~~

同一 Finding ID 只能有一个 Evidence owner。09 发现冲突时，按定义侧优先、领域 owner 优先、单 feature 优先于跨域汇总的顺序确定主报告。

### 跨报告引用格式

非 owner 报告只能写：

~~~md
- 交界引用: [RA-04-001](./04-timeline-materials-and-domain-models.md#ra-04-001)
- 本报告仅使用的交界事实: <一条不超过两句的事实>
- Evidence owner: 04-timeline-materials-and-domain-models
~~~

禁止复制 owner 报告的完整证据、推荐边界、风险或验证建议。

## 统一子代理阶段输出

每个只读微阶段必须返回：

~~~md
## 结论

## 阶段状态

- 微阶段:
- 状态: 已完成 / 停止-需拆分 / 证据不足
- 建议 Finding ID:
- 建议主报告:

## 关键证据路径/行号

## 定义方、构造方、调用方与测试

## 已排除项

## 风险

## 与既有成果关系

## 下一阶段建议
~~~

子代理不得在首次返回中自行写报告。主代理先检查范围、证据、owner 和是否重复既有设计，再发送 follow-up 要求落盘。

## 统一阶段落盘格式

每个分报告必须包含 审计进度 表。负责子代理收到落盘 follow-up 后，用 apply_patch 写入：

~~~md
## 审计进度

| 微阶段 | 状态 | 压缩结论 | Finding ID / 覆盖状态 | 关键证据 |
| --- | --- | --- | --- | --- |
| <阶段名> | 已完成 | <一至三句> | RA-XX-XXX | path:line |
~~~

确认 finding 使用设计规定的完整固定字段。非 finding 也必须记录状态、反证和排除理由。每次落盘后负责子代理运行：

~~~bash
git diff --check -- docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/<当前报告>
git diff -- docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/<当前报告>
~~~

负责子代理返回 diff 摘要；主代理抽查关键源码行号和报告 diff 后，才发送下一阶段 follow-up。

## 审计切片—主报告—允许交界矩阵

| 切片 | 主报告 | 允许的直接交界 | 禁止扩张 |
| --- | --- | --- | --- |
| app bootstrap/provider/store/shell/platform | 01 | 02 的 host client；03 的 bridge；07 的 i18n | host transport、projection reducer、transcript UI 内部 |
| GUI host launch/transport/handshake/protocol | 02 | 03 的 connection bridge | Redux lifecycle、timeline、transcript |
| projection ingress/runtime/identity/reconnect | 03 | 02 的 wire event；04 的 material producer；05 的 action consumer | 协议重设计、timeline owner、transcript 内部拆分 |
| snapshot/live timeline materials/domain conversion | 04 | 03 的 accepted event；05 的 projection input | Redux state 内部、React rendering |
| transcript state/materialization cross-feature boundary | 05 | 03 action source；04 timeline；06 selector consumer | 既有 Transcript State 内部拆分设计 |
| committed/live rendering/markdown/scroll | 06 | 05 selector output；01 AppShell composition | state shape、projection ingress、协议 |
| composer/QR/access/i18n/examples | 07 | 01 shell/platform | host transport、transcript state |
| test support/builders/fixtures | 08 | 各 production 报告的行为边界 | 替 production 报告拥有 finding |
| cross-feature owner/dependency/coverage/exclusions | 09 | 01-08 的 Finding ID 和交界事实 | 重复单 feature 完整论证 |

## Task 1: Preflight And Scaffold 00-09 Reports

**Files:**
- Read: docs/superpowers/specs/2026-07-11-codex-gui-refactoring-audit-design.md
- Create: docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/00-summary.md
- Create: docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/01-app-entry-shell-and-platform.md
- Create: docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/02-gui-host-transport-and-protocol.md
- Create: docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/03-projection-ingress-and-thread-runtime.md
- Create: docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/04-timeline-materials-and-domain-models.md
- Create: docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/05-transcript-state-and-materialization.md
- Create: docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/06-transcript-rendering-streaming-and-scroll.md
- Create: docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/07-composer-access-and-localization.md
- Create: docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/08-test-infrastructure-fixtures-and-support.md
- Create: docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/09-cross-cutting-boundaries-and-exclusions.md

- [ ] **Step 1: 主代理派发骨架子代理**

要求子代理只核对分支、设计存在性、目标目录不存在或为空，不写其他路径。

- [ ] **Step 2: 骨架子代理执行只读 preflight**

Run:

~~~bash
git status --short --branch
test -f docs/superpowers/specs/2026-07-11-codex-gui-refactoring-audit-design.md
test ! -e docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit
~~~

Expected: branch 为 dev；设计存在；没有访问 remote。若目录已存在，停止并让主代理检查是否为同一任务的未完成工作。

- [ ] **Step 3: 骨架子代理创建 00-09**

先运行：

~~~bash
mkdir -p docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit
~~~

Expected: 只创建本计划的报告目录。

然后使用 apply_patch 创建十个文件。01-08 必须含 审计范围、范围交界、审计进度、Findings、已排除项、风险；09 必须额外含 Evidence Ownership、覆盖矩阵、跨报告去重；00 必须含总体结论、分报告索引、状态汇总、优先级汇总、建议批次、依赖顺序、证据不足与排除项。

所有骨架状态使用 未开始，不写任何源码结论或 Finding ID。

- [ ] **Step 4: 主代理抽查骨架职责**

确认文件名为 00-09 设计清单；00 无 finding 内容；09 有覆盖矩阵；05 明示 Transcript State 内部拆分属于 已有专项设计。

- [ ] **Step 5: 骨架子代理验证并本地提交**

Run:

~~~bash
git diff --check -- docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit
git diff --stat -- docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit
git add docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit
git commit -m "docs: scaffold GUI refactoring audit reports"
~~~

Expected: 只包含十个报告文件；一个本地 commit；无 remote。

## Task 2: Complete 01 App Entry, Shell, And Platform

**Files:**
- Read: codex-gui/src/main.tsx
- Read: codex-gui/src/App.tsx
- Read: codex-gui/src/router.tsx
- Read: codex-gui/src/index.css
- Read: codex-gui/src/app/ThemeProvider.tsx
- Read: codex-gui/src/app/createAppSlice.ts
- Read: codex-gui/src/app/hooks.ts
- Read: codex-gui/src/app/store.ts
- Read: codex-gui/src/features/appShell/AppShell.tsx
- Read: codex-gui/src/__tests__/App.browser.test.tsx
- Modify: docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/01-app-entry-shell-and-platform.md

- [ ] **Step 1: 派发负责子代理，微阶段一只回答 bootstrap/provider/store owner**

检查 main.tsx、App.tsx、router.tsx、ThemeProvider.tsx、createAppSlice.ts、hooks.ts、store.ts 的装配职责、类型 owner 和是否存在稳定公共语义。不得进入 host transport 或 feature reducer。

- [ ] **Step 2: 审核并要求同一子代理落盘微阶段一**

主代理核对定义、构造方、调用方和 App browser test 证据；同一子代理按统一阶段落盘格式更新 01。

- [ ] **Step 3: Follow-up 微阶段二只回答 AppShell 与 platform/environment 交界**

检查 App.tsx、AppShell.tsx、router.tsx、index.css 中 shell composition、platform/environment 检测和顶层状态归属。只允许命名 02/03/07 的交界，不追入实现。

- [ ] **Step 4: 审核并要求同一子代理落盘微阶段二**

确认没有把单次 provider 包装或 CSS 组织当成 finding；抽查当前行号。

- [ ] **Step 5: Follow-up 微阶段三只回答 01 的否定结论和报告完整性**

检查是否已有 store hooks、slice creator 或 provider 抽象覆盖重复；给出 不建议重构 或 已由现有抽象覆盖 的反证。

- [ ] **Step 6: 报告完成门禁**

01 的每个 finding 有固定字段；所有列出的主文件有覆盖状态；跨到 02/03/07 的内容仅用引用候选说明，不提前分配其他报告 Finding ID。

- [ ] **Step 7: 同一子代理验证并本地提交**

Run:

~~~bash
git diff --check -- docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/01-app-entry-shell-and-platform.md
git diff -- docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/01-app-entry-shell-and-platform.md
git add docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/01-app-entry-shell-and-platform.md
git commit -m "docs: audit GUI app shell refactoring boundaries"
~~~

Expected: 只提交 01。

## Task 3: Complete 02 GUI Host Transport And Protocol

**Files:**
- Read: codex-gui/src/features/guiHost/guiHostClient.ts
- Read: codex-gui/src/features/guiHost/guiHostProtocol.ts
- Read: codex-gui/src/features/guiHost/__tests__/guiHostClientTestSupport.ts
- Read: codex-gui/src/features/guiHost/__tests__/guiHostLaunchParams.test.ts
- Read: codex-gui/src/features/guiHost/__tests__/guiHostHandshake.test.ts
- Read: codex-gui/src/features/guiHost/__tests__/guiHostCommands.test.ts
- Read: codex-gui/src/features/guiHost/__tests__/guiHostProtocolErrors.test.ts
- Modify: docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/02-gui-host-transport-and-protocol.md

- [ ] **Step 1: 派发负责子代理，微阶段一只回答 launch params/token/URL owner**

核对定义、解析、存储和全部生产调用方；判断启动参数是否是独立领域边界，而不是仅因测试文件命名提取。

- [ ] **Step 2: 审核并要求同一子代理落盘微阶段一**

必须引用 guiHostLaunchParams.test.ts 的行为边界，不能提出代码 patch。

- [ ] **Step 3: Follow-up 微阶段二只回答 transport/request/handshake 状态职责**

检查 WebSocket 建连、请求关联、握手状态和连接关闭职责是否混合；只允许把 Redux bridge 命名为 03 交界。

- [ ] **Step 4: 审核并要求同一子代理落盘微阶段二**

抽查 guiHostClientTestSupport.ts 和 handshake test；表面 helper 重复不得直接公共化。

- [ ] **Step 5: Follow-up 微阶段三只回答 protocol parsing、commands、errors 与公共类型 owner**

检查 guiHostProtocol.ts、commands test、protocol errors test；区分 wire contract 与 transport 实现。

- [ ] **Step 6: 审核并要求同一子代理落盘微阶段三**

确认没有重设计协议或进入 thread runtime。

- [ ] **Step 7: 报告完成门禁**

02 明确 launch、transport、handshake、protocol 四类职责；与 03 的交界只有 connection/notification handoff；所有测试文件有覆盖状态。

- [ ] **Step 8: 同一子代理验证并本地提交**

Run:

~~~bash
git diff --check -- docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/02-gui-host-transport-and-protocol.md
git diff -- docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/02-gui-host-transport-and-protocol.md
git add docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/02-gui-host-transport-and-protocol.md
git commit -m "docs: audit GUI host transport boundaries"
~~~

Expected: 只提交 02。

## Task 4: Complete 03 Projection Ingress And Thread Runtime

**Files:**
- Read: codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx
- Read: codex-gui/src/features/projectionIngress/projectionIngressAdapter.ts
- Read: codex-gui/src/features/projectionIngress/__tests__/projectionIngressAdapter.test.ts
- Read: codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts
- Read: codex-gui/src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts
- Read: codex-gui/src/features/threadIdentity/threadIdentitySlice.ts
- Read: codex-gui/src/features/threadIdentity/__tests__/threadIdentitySlice.test.ts
- Modify: docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/03-projection-ingress-and-thread-runtime.md

- [ ] **Step 1: 派发负责子代理，微阶段一只回答 Bridge 到 ingress adapter 的 handoff**

核对 connection callbacks、event/close handoff、adapter 构造和依赖方向。02 的 wire event 只作为输入交界。

- [ ] **Step 2: 审核并要求同一子代理落盘微阶段一**

抽查 Bridge 和 adapter 的定义、构造与测试；不得进入 timeline material。

- [ ] **Step 3: Follow-up 微阶段二只回答 adapter filtering/batching/reconnect 契约 owner**

检查 ProjectionManualReconnectReason 等公共契约是否挂在具体实现文件，核对全部生产 import 和相关测试。

- [ ] **Step 4: 审核并要求同一子代理落盘微阶段二**

确认 finding 基于类型 owner 和调用关系，而不是文件命名。

- [ ] **Step 5: Follow-up 微阶段三只回答 thread runtime 与 identity state 边界**

检查 attach/event/delta/reconnect action、snapshot index、thread identity 生命周期和两个 slice 的职责交界。05 只作为 action consumer。

- [ ] **Step 6: 审核并要求同一子代理落盘微阶段三**

确认没有重审 transcript reducer 或 projection protocol。

- [ ] **Step 7: 报告完成门禁**

03 覆盖 bridge、adapter、runtime、identity；明确 02/04/05 交界；类型 owner finding 有全部生产消费者。

- [ ] **Step 8: 同一子代理验证并本地提交**

Run:

~~~bash
git diff --check -- docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/03-projection-ingress-and-thread-runtime.md
git diff -- docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/03-projection-ingress-and-thread-runtime.md
git add docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/03-projection-ingress-and-thread-runtime.md
git commit -m "docs: audit projection runtime boundaries"
~~~

Expected: 只提交 03。

## Task 5: Complete 04 Timeline Materials And Domain Models

**Files:**
- Read: codex-gui/src/features/snapshotReplay/snapshotReplay.ts
- Read: codex-gui/src/features/snapshotReplay/__tests__/snapshotReplay.test.ts
- Read: codex-gui/src/features/liveEventHandling/liveEventHandling.ts
- Read: codex-gui/src/features/liveEventHandling/__tests__/liveEventHandling.test.ts
- Read as direct call sites: codex-gui/src/features/appShell/AppShell.tsx
- Read as direct input boundary: codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts
- Modify: docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/04-timeline-materials-and-domain-models.md

- [ ] **Step 1: 派发负责子代理，微阶段一只回答 snapshot Turn/domain conversion**

核对 snapshot replay 中 Turn 去 items、材料构造、类型定义和测试；只追踪直接生产调用方。

- [ ] **Step 2: 审核并要求同一子代理落盘微阶段一**

确认转换具有领域语义，不因少量重复直接建立 utils。

- [ ] **Step 3: Follow-up 微阶段二只回答 live materials 与 selector/aggregation owner**

核对 liveEventHandling 的材料类型、selector、snapshot/live 聚合和消费者；不得进入 transcript state 内部。

- [ ] **Step 4: 审核并要求同一子代理落盘微阶段二**

抽查 AppShell 的消费关系与 liveEventHandling test。

- [ ] **Step 5: Follow-up 微阶段三只回答共同 timeline owner 和单向依赖**

比较 snapshot/live 两个生产者的共同语义、类型 owner 和组合职责；明确最小可审查批次与排除范围。

- [ ] **Step 6: 审核并要求同一子代理落盘微阶段三**

确认 03 只拥有 accepted event，05 只拥有 transcript projection input。

- [ ] **Step 7: 报告完成门禁**

04 对重复转换、TimelineMaterial owner、组合 selector 分别下结论；不建立无领域名称的 common/utils；所有 finding 有消费者和测试证据。

- [ ] **Step 8: 同一子代理验证并本地提交**

Run:

~~~bash
git diff --check -- docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/04-timeline-materials-and-domain-models.md
git diff -- docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/04-timeline-materials-and-domain-models.md
git add docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/04-timeline-materials-and-domain-models.md
git commit -m "docs: audit timeline domain boundaries"
~~~

Expected: 只提交 04。

## Task 6: Complete 05 Transcript State And Materialization

**Files:**
- Read: docs/superpowers/specs/2026-07-11-codex-gui-transcript-state-split-design.md
- Read: codex-gui/src/features/transcriptState/transcriptStateModel.ts
- Read: codex-gui/src/features/transcriptState/transcriptEventDedup.ts
- Read: codex-gui/src/features/transcriptState/transcriptLiveProjection.ts
- Read: codex-gui/src/features/transcriptState/transcriptCommittedProjection.ts
- Read: codex-gui/src/features/transcriptState/transcriptStateSelectors.ts
- Read: codex-gui/src/features/transcriptState/transcriptEntryMaterialization.ts
- Read: codex-gui/src/features/transcriptState/transcriptStateSlice.ts
- Read: codex-gui/src/features/transcriptState/__tests__/**
- Read only as boundary evidence: codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts
- Read only as boundary evidence: codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx
- Modify: docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/05-transcript-state-and-materialization.md

- [ ] **Step 1: 派发负责子代理，微阶段一只映射既有专项设计**

逐项核对现有模块与设计的 production/test 边界，将内部拆分统一记录为 已有专项设计。不得评价是否应再次拆分，不得创建内部重构 finding。

- [ ] **Step 2: 审核并要求同一子代理落盘微阶段一**

主代理确认报告只记录覆盖关系、当前文件证据和设计引用；没有重报大文件或测试拆分。

- [ ] **Step 3: Follow-up 微阶段二只回答 materialization/model 的外部依赖与残余反向依赖**

核对 TranscriptEntry 等类型 owner、materializeTranscriptItem 调用方和公开 re-export。若属于现有设计已处理内容，状态仍为 已有专项设计。

- [ ] **Step 4: 审核并要求同一子代理落盘微阶段二**

抽查全部生产 import；没有新证据时不得改写为确认重构点。

- [ ] **Step 5: Follow-up 微阶段三只回答 03/04/06 跨 feature 边界**

检查 thread runtime action 输入、timeline 交界、selector output 到 React consumer 的边界。只记录现有专项设计未覆盖的残余点。

- [ ] **Step 6: 审核并要求同一子代理落盘微阶段三**

若发现需修改 threadRuntimeSlice、协议、UI 或 Redux state shape，只标记新的跨域候选并指向后续独立设计。

- [ ] **Step 7: 报告完成门禁**

05 明确列出 已有专项设计 的覆盖；没有以职责混合、大文件或测试拆分重报内部方案；所有新条目都是跨 feature 或未覆盖残余点。

- [ ] **Step 8: 同一子代理验证并本地提交**

Run:

~~~bash
git diff --check -- docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/05-transcript-state-and-materialization.md
git diff -- docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/05-transcript-state-and-materialization.md
git add docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/05-transcript-state-and-materialization.md
git commit -m "docs: map transcript state refactoring boundaries"
~~~

Expected: 只提交 05。

## Task 7: Complete 06 Transcript Rendering, Streaming, And Scroll

**Files:**
- Read: codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx
- Read: codex-gui/src/features/committedTranscriptSurface/LiveMarkdownText.tsx
- Read: codex-gui/src/features/committedTranscriptSurface/MarkdownText.tsx
- Read: codex-gui/src/features/committedTranscriptSurface/markdownRendering.tsx
- Read: codex-gui/src/features/committedTranscriptSurface/committedTranscriptChunkEquality.ts
- Read: codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx
- Read: codex-gui/src/features/committedTranscriptSurface/__tests__/committedTranscriptChunkEquality.test.ts
- Read: codex-gui/src/features/appShell/useCommittedTranscriptStickyBottom.ts
- Read as composition boundary: codex-gui/src/features/appShell/AppShell.tsx
- Read as selector boundary: codex-gui/src/features/transcriptState/transcriptStateSelectors.ts
- Modify: docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/06-transcript-rendering-streaming-and-scroll.md

- [ ] **Step 1: 派发负责子代理，微阶段一只回答 committed surface 与 chunk equality**

核对 committed/live component composition、chunk view 输入、equality owner 和 browser test；05 的 selector 只作为输入。

- [ ] **Step 2: 审核并要求同一子代理落盘微阶段一**

确认没有把 selector cache 实现移入 06。

- [ ] **Step 3: Follow-up 微阶段二只回答 Markdown/Streamdown 静态与 live 渲染职责**

比较 LiveMarkdownText、MarkdownText、markdownRendering 的共同配置、差异语义和调用方；避免为少量 JSX 建立公共层。

- [ ] **Step 4: 审核并要求同一子代理落盘微阶段二**

抽查生产消费和 browser test，不作 browser 性能结论。

- [ ] **Step 5: Follow-up 微阶段三只回答 sticky-bottom、scroll signal 与副作用 owner**

核对 useCommittedTranscriptStickyBottom、AppShell、surface 输入和 05 的 scroll signal 输出；判断 hook 是否混合 DOM effect、状态订阅或 surface detection。

- [ ] **Step 6: 审核并要求同一子代理落盘微阶段三**

确认 UI 消费归 06，state signal 定义归 05，shell composition 归 01。

- [ ] **Step 7: 报告完成门禁**

06 覆盖 committed rendering、live/static markdown、chunk equality、scroll side effect；不重审 state shape 或 projection。

- [ ] **Step 8: 同一子代理验证并本地提交**

Run:

~~~bash
git diff --check -- docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/06-transcript-rendering-streaming-and-scroll.md
git diff -- docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/06-transcript-rendering-streaming-and-scroll.md
git add docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/06-transcript-rendering-streaming-and-scroll.md
git commit -m "docs: audit transcript rendering boundaries"
~~~

Expected: 只提交 06。

## Task 8: Complete 07 Composer, Access, And Localization

**Files:**
- Read: codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx
- Read: codex-gui/src/features/composerTurnControl/composerTurnControlModel.ts
- Read: codex-gui/src/features/composerTurnControl/useRevealComposerOnViewportResize.ts
- Read: codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx
- Read: codex-gui/src/features/composerTurnControl/__tests__/composerTurnControlModel.test.ts
- Read: codex-gui/src/features/qrAccess/QrAccessPopover.tsx
- Read: codex-gui/src/features/qrAccess/qrAccessUrl.ts
- Read: codex-gui/src/features/qrAccess/__tests__/QrAccessPopover.browser.test.tsx
- Read: codex-gui/src/features/qrAccess/__tests__/qrAccessUrl.test.ts
- Read: codex-gui/src/i18n.ts
- Read: codex-gui/src/LanguageSwitcher.tsx
- Read: codex-gui/src/MsgExample.tsx
- Read: codex-gui/src/PluralExample.tsx
- Read: codex-gui/src/NotFoundPage.tsx
- Read: codex-gui/src/locales/en.po
- Read: codex-gui/src/locales/zh-CN.po
- Modify: docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/07-composer-access-and-localization.md

- [ ] **Step 1: 派发负责子代理，微阶段一只回答 composer component/model 边界**

核对 UI control、model、turn actions、错误展示和测试；判断业务 model 与组件状态是否有稳定拆分或已有抽象覆盖。

- [ ] **Step 2: 审核并要求同一子代理落盘微阶段一**

确认没有进入 transcript state 或 host transport。

- [ ] **Step 3: Follow-up 微阶段二只回答 viewport hook 与 QR/access URL owner**

检查 resize effect、环境检测、URL 构造、popover 组件和对应测试；区分跨 feature platform helper 与 feature 私有逻辑。

- [ ] **Step 4: 审核并要求同一子代理落盘微阶段二**

抽查 URL 构造全部调用方；避免预防性 common helper。

- [ ] **Step 5: Follow-up 微阶段三只回答 i18n、LanguageSwitcher、示例页和 NotFoundPage**

核对 i18n 初始化、本地化入口、示例页是否仍有 production owner、locale catalogs 的消费关系；目录内容不是自动 finding。

- [ ] **Step 6: 审核并要求同一子代理落盘微阶段三**

确认 locale 生成内容只记录覆盖，不提出手工重构 catalog。

- [ ] **Step 7: 报告完成门禁**

07 覆盖 composer、viewport、QR/access、i18n、examples/not-found；与 01 的 shell/platform 交界明确。

- [ ] **Step 8: 同一子代理验证并本地提交**

Run:

~~~bash
git diff --check -- docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/07-composer-access-and-localization.md
git diff -- docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/07-composer-access-and-localization.md
git add docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/07-composer-access-and-localization.md
git commit -m "docs: audit composer access localization boundaries"
~~~

Expected: 只提交 07。

## Task 9: Complete 08 Test Infrastructure, Fixtures, And Support

**Files:**
- Read: codex-gui/src/__tests__/appBrowserTestSupport.ts
- Read: codex-gui/src/__tests__/App.browser.test.tsx
- Read: codex-gui/src/utils/TestProvider.tsx
- Read: codex-gui/src/utils/test-utils.tsx
- Read: codex-gui/src/features/guiHost/__tests__/guiHostClientTestSupport.ts
- Read: codex-gui/src/features/projection/__tests__/projectionFixtures.ts
- Read: codex-gui/src/features/projection/__tests__/projectionFixtures.test.ts
- Read: codex-gui/src/features/projection/__tests__/projectionTestBuilders.ts
- Read: codex-gui/src/features/projection/__fixtures__/**
- Read: codex-gui/src/features/**/__tests__/**
- Modify: docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/08-test-infrastructure-fixtures-and-support.md

- [ ] **Step 1: 派发负责子代理，微阶段一只回答全局 render/provider/browser support**

核对 TestProvider、test-utils、appBrowserTestSupport 和 App browser test 的职责、重复装配和消费者。expected value 不因文本相似被提取。

- [ ] **Step 2: 审核并要求同一子代理落盘微阶段一**

抽查全部 import；确认 helper 是测试 owner，不要求 production API。

- [ ] **Step 3: Follow-up 微阶段二只回答 GUI host test support**

核对 guiHostClientTestSupport 的 setup、mock transport、handshake/commands/protocol tests 消费关系；production finding 只引用 02。

- [ ] **Step 4: 审核并要求同一子代理落盘微阶段二**

确认 malformed payload 保持显式，不泛化进 builder。

- [ ] **Step 5: Follow-up 微阶段三只回答 projection fixtures/builders**

核对 JSON fixtures、projectionFixtures.ts、projectionTestBuilders.ts、fixture tests 和所有 feature 测试消费者；区分合法协议 builder、fixture loader 与场景 DSL。

- [ ] **Step 6: 审核并要求同一子代理落盘微阶段三**

抽查至少 snapshotReplay、liveEventHandling、projectionIngress、threadRuntime、transcriptState 测试中的消费路径。

- [ ] **Step 7: Follow-up 微阶段四只回答 UI/interaction tests 的支持代码重复**

范围只包括 appShell 通过 App.browser.test.tsx 暴露的交互、committedTranscriptSurface、composerTurnControl 和 qrAccess 的 browser/unit tests。检查 render setup、交互装配、locator 前置条件和局部 helper 是否有两个以上合法消费者与稳定语义；不得重审 production 行为。

- [ ] **Step 8: 审核并要求同一子代理落盘微阶段四**

要求区分全局 browser support、feature 私有交互 helper 和应保留显式的 expected value；没有 appShell 专属测试文件时，明确记录其由 App.browser.test.tsx 覆盖的交界。

- [ ] **Step 9: Follow-up 微阶段五只回答 state/projection tests 的支持代码重复**

范围只包括 projectionIngress、threadRuntime、threadIdentity、snapshotReplay、liveEventHandling 和 transcriptState 的测试。检查 action/setup、state 构造、reducer harness 和断言辅助逻辑是否存在稳定复用边界；不得重复微阶段三已经完成的 projection fixtures/builders 结论。

- [ ] **Step 10: 审核并要求同一子代理落盘微阶段五**

要求明确列出应保留显式的 malformed payload、expected value 和 transcriptState 白盒 state 构造；对 projection builder 只允许引用微阶段三，不复制论证。

- [ ] **Step 11: 报告完成门禁**

08 覆盖全部测试和 fixture 文件；每个候选有消费者；production 边界只用跨报告引用；没有新增 test-only production API 建议。

- [ ] **Step 12: 同一子代理验证并本地提交**

Run:

~~~bash
git diff --check -- docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/08-test-infrastructure-fixtures-and-support.md
git diff -- docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/08-test-infrastructure-fixtures-and-support.md
git add docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/08-test-infrastructure-fixtures-and-support.md
git commit -m "docs: audit GUI test support boundaries"
~~~

Expected: 只提交 08。

## Task 10: Complete 09 Evidence Ownership, Coverage, And Deduplication

**Files:**
- Read: docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/01-app-entry-shell-and-platform.md
- Read: docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/02-gui-host-transport-and-protocol.md
- Read: docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/03-projection-ingress-and-thread-runtime.md
- Read: docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/04-timeline-materials-and-domain-models.md
- Read: docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/05-transcript-state-and-materialization.md
- Read: docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/06-transcript-rendering-streaming-and-scroll.md
- Read: docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/07-composer-access-and-localization.md
- Read: docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/08-test-infrastructure-fixtures-and-support.md
- Read: every path returned by rg --files codex-gui/src
- Modify: docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/09-cross-cutting-boundaries-and-exclusions.md

- [ ] **Step 1: 派发 09 负责子代理，微阶段一只建立 Finding/Evidence owner 表**

提取 01-08 的每个 Finding ID、状态、优先级、owner 和跨报告引用；报告 ID 冲突、缺字段或重复论证。

- [ ] **Step 2: 审核并要求同一子代理落盘 owner 表**

主代理抽查冲突条目；需要调整 01-08 时，让对应原负责子代理先修正并提交，再继续 09。

- [ ] **Step 3: Follow-up 微阶段二只判断真正跨 feature 的边界**

只对无法自然归属定义侧的类型 owner、依赖方向、循环风险或重复领域语义建立 RA-09 finding。单 feature 问题只引用。

- [ ] **Step 4: 审核并要求同一子代理落盘跨域结论**

确认 09 没有复制 01-08 的完整证据。

- [ ] **Step 5: Follow-up 微阶段三只建立全量覆盖矩阵**

Run:

~~~bash
rg --files codex-gui/src | sort
~~~

对每个路径记录主报告、次级交界、已审核机制、Finding ID/覆盖状态或排除理由。目录 glob 或“同类文件”不能替代逐文件条目。

- [ ] **Step 6: 审核并要求同一子代理落盘覆盖矩阵**

主代理独立运行同一 rg --files 命令，比较数量和路径；任何遗漏退回对应 01-08 原负责子代理审核并落盘。

- [ ] **Step 7: Follow-up 微阶段四只做跨报告去重和排除抽象表**

列出被合并的重复候选、保留 owner、引用位置，以及不建议建立的 shared/common/utils 抽象。Transcript State 内部拆分必须只显示 已有专项设计。

- [ ] **Step 8: 报告完成门禁**

01-08 全部已完成；Finding ID 唯一；每个 codex-gui/src 文件有主报告或排除理由；09 自有 finding 确实跨域；无 Transcript State 内部重报。

- [ ] **Step 9: 同一子代理验证并本地提交**

Run:

~~~bash
git diff --check -- docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/09-cross-cutting-boundaries-and-exclusions.md
git diff -- docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/09-cross-cutting-boundaries-and-exclusions.md
git add docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/09-cross-cutting-boundaries-and-exclusions.md
git commit -m "docs: reconcile GUI refactoring audit coverage"
~~~

Expected: 只提交 09。

## Task 11: Write 00 Summary Last

**Files:**
- Read: docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/01-app-entry-shell-and-platform.md
- Read: docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/02-gui-host-transport-and-protocol.md
- Read: docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/03-projection-ingress-and-thread-runtime.md
- Read: docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/04-timeline-materials-and-domain-models.md
- Read: docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/05-transcript-state-and-materialization.md
- Read: docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/06-transcript-rendering-streaming-and-scroll.md
- Read: docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/07-composer-access-and-localization.md
- Read: docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/08-test-infrastructure-fixtures-and-support.md
- Read: docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/09-cross-cutting-boundaries-and-exclusions.md
- Modify: docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/00-summary.md

- [ ] **Step 1: 派发 00 负责子代理，先验证汇总门禁**

确认 01-09 均无 未开始、待审计 或阶段未落盘；09 覆盖矩阵完整；所有 Finding ID owner 唯一。门禁失败时停止，不写 00。

- [ ] **Step 2: Follow-up 只提取分报告已有索引**

按状态和优先级汇总 Finding ID、标题、owner，不复制源码证据。已有专项设计单列，不能进入新重构批次。

- [ ] **Step 3: 主代理审核索引并要求同一子代理落盘**

若出现 01-09 不存在的新 finding、新行号或新推荐边界，拒绝写入并退回主报告。

- [ ] **Step 4: Follow-up 只生成建议批次和依赖顺序**

建议批次只能引用 确认重构点 或证据充分的 候选待补证据；每批写 Finding ID、依赖、建议后续设计入口和不包含范围。

- [ ] **Step 5: 主代理审核并要求同一子代理落盘最终总结**

确认 00 包含分报告索引、覆盖状态、优先级/状态计数、建议批次、依赖顺序、证据不足和排除项。

- [ ] **Step 6: 00 完成门禁**

00 不含独有 Finding ID，不含新的源码 evidence，不改变 owner/status/priority，不重复分报告完整论证。

- [ ] **Step 7: 同一子代理验证并本地提交**

Run:

~~~bash
git diff --check -- docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/00-summary.md
git diff -- docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/00-summary.md
git add docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/00-summary.md
git commit -m "docs: summarize GUI refactoring audit"
~~~

Expected: 只提交 00。

## Task 12: Final Review

**Files:**
- Read: docs/superpowers/specs/2026-07-11-codex-gui-refactoring-audit-design.md
- Read: docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/00-summary.md
- Read: docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/01-app-entry-shell-and-platform.md
- Read: docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/02-gui-host-transport-and-protocol.md
- Read: docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/03-projection-ingress-and-thread-runtime.md
- Read: docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/04-timeline-materials-and-domain-models.md
- Read: docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/05-transcript-state-and-materialization.md
- Read: docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/06-transcript-rendering-streaming-and-scroll.md
- Read: docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/07-composer-access-and-localization.md
- Read: docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/08-test-infrastructure-fixtures-and-support.md
- Read: docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/09-cross-cutting-boundaries-and-exclusions.md

- [ ] **Step 1: 派发 final-review 子代理扫描未完成状态**

Run:

~~~bash
rg -n -e '未开始|待审计|尚未审计|PLACEHOLDER' docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit
~~~

Expected: 无匹配。若有匹配，交回对应原负责子代理修正，不由主代理编辑。

- [ ] **Step 2: 扫描 Finding ID、状态、优先级和 owner**

Run:

~~~bash
rg -n -e 'Finding ID:|Evidence owner:|状态:|重构优先级:' docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit
~~~

Expected: 每个 finding 字段齐全；枚举只使用本计划允许值；ID 符合 RA-XX-XXX。

- [ ] **Step 3: 核对所有 codex-gui/src 文件有主报告或排除理由**

Run:

~~~bash
rg --files codex-gui/src | sort
rg -n -e 'codex-gui/src/' docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/09-cross-cutting-boundaries-and-exclusions.md
~~~

Expected: 第一条命令的每个路径都能在 09 覆盖矩阵找到唯一主报告或明确排除理由。final-review 子代理逐路径比较，不能只比较数量。

- [ ] **Step 4: 核对 Transcript State 与总报告边界**

确认 05/09/00 对内部拆分只使用 已有专项设计；00 没有独有 finding 或源码证据；09 没有复制单 feature 完整论证。

- [ ] **Step 5: 核对禁止文件没有被本计划修改**

Run:

~~~bash
git status --short -- codex-gui docs/superpowers/specs docs/superpowers/plans docs/superpowers/issues
~~~

Expected: 没有本计划产生的修改。执行前已有用户变更必须保持不动并单独说明。

- [ ] **Step 6: 验证整个报告集**

Run:

~~~bash
git diff --check -- docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit
git status --short -- docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit
git log --oneline -- docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit
~~~

Expected: diff check 无输出；报告目录无未提交修改；本地历史包含骨架、01-09 和 00 的任务边界提交。

- [ ] **Step 7: 仅在 final review 发现文档问题时修正并提交**

修正必须交给原报告负责子代理。修正后 final-review 子代理重复相关只读检查。若产生报告修改，由对应负责子代理路径限定 stage 并提交：

~~~bash
git add docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit
git commit -m "docs: finalize GUI refactoring audit"
~~~

Expected: 只有确有报告修正时创建本地 commit；禁止空提交。

## 执行完成条件

- 00-09 十个报告均完成并已按任务边界本地提交。
- 01-08 的微阶段均由同一负责子代理 follow-up 复用，并在进入下一阶段前落盘状态和压缩结论。
- 09 在 01-08 后完成唯一 evidence ownership、跨报告去重和逐文件覆盖矩阵。
- 00 在 09 后完成，且没有新 finding 或新源码证据。
- Transcript State 内部拆分只标记为 已有专项设计。
- 所有 codex-gui/src 文件有主报告或排除理由。
- codex-gui/**、设计、计划和 issue 没有被本计划修改。
- 未运行禁止命令，未安装依赖，未访问 git remote。
