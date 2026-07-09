# Codex GUI System Performance Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute the Codex GUI system-wide frontend static complexity audit and produce the six report files defined by the design.

**Architecture:** The controller creates report skeletons, delegates each GUI-wide audit slice to a read-only subagent, reviews evidence, and writes only Markdown reports under `docs/superpowers/reports/2026-07-09-codex-gui-system-performance-check/`. The audit is current-state-first, with issue attribution labels and complexity priorities, and it does not modify `codex-gui/**` or `docs/superpowers/issues/**`.

**Tech Stack:** Markdown reports, `rg`/`sed`/`nl`/`wc` for read-only inspection, Codex subagents for slice audits, existing `codex-gui` TypeScript/React source, existing `docs/superpowers/issues/**` issue documents.

---

## Global Rules

- Do not modify `codex-gui/**`.
- Do not create, split, normalize, or update `docs/superpowers/issues/**` during this plan.
- Do not run tests, browser automation, profiling, benchmark, trace, build, lint, format, package scripts, schema generation, snapshot commands, dependency installs, or git remote commands.
- Allowed commands are read-only except report file creation and git local staging/commit at task boundaries: `git status --short --branch`, `test -f`, `test -d`, `mkdir -p`, `rg`, `sed`, `nl`, `wc`, `git diff --check`, `git diff --stat`, `git diff --`, `git add`, `git commit`.
- Use `codex-issue-doc-workflow` only as a format constraint when report findings point to future issue work. If an issue needs creation or update, record it in the report as a follow-up and stop; do not edit issue files in this plan.
- All eight audit slices from the design must be delegated to subagents. The controller may read only the design, issue index, report drafts, and short evidence snippets needed for spot checks.
- Findings must separate `复杂度优先级` from `当前状态`.
- Complexity priority values are only `P0`, `P1`, `P2`, `P3`, or `非 finding`.
- Status values are only `已有 issue 仍成立`, `已修复`, `新发现`, `非本轮可归因`, or `证据不足`.
- Reports must not propose concrete fixes, replacement data structures, throttling, caching, virtualization, or code edits. They may say a finding needs a separate design/plan, issue follow-up, or measurement follow-up.

## File Structure

- Read: `docs/superpowers/specs/2026-07-09-codex-gui-system-performance-check-design.md`
- Read: `docs/superpowers/specs/2026-07-03-codex-gui-streaming-support/05-frontend-performance-check-design.md`
- Read: `docs/superpowers/issues/2026-06-23-01-codex-gui-frontend-performance-hot-paths.md`
- Read: `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/01-projection-event-top-level-react-state.md`
- Read: `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/02-transcript-chunk-selector-view-rebuild.md`
- Read: `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/03-item-started-dirties-transcript-state.md`
- Read: `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/04-long-transcript-no-windowing.md`
- Read: `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/05-heroui-full-css-import.md`
- Read: `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/06-temporary-grouping-full-turn-scan.md`
- Read: `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/07-transcript-revision-invariant.md`
- Read: `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/08-projection-delta-redux-action-frequency.md`
- Read: `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/09-projection-delta-transient-text-concat.md`
- Read: `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/10-live-slot-selector-cache-invalidation.md`
- Read as needed for source evidence:
  - `codex-gui/src/main.tsx`
  - `codex-gui/src/App.tsx`
  - `codex-gui/src/router.tsx`
  - `codex-gui/src/index.css`
  - `codex-gui/src/app/store.ts`
  - `codex-gui/src/app/hooks.ts`
  - `codex-gui/src/app/ThemeProvider.tsx`
  - `codex-gui/src/features/appShell/AppShell.tsx`
  - `codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx`
  - `codex-gui/src/features/appShell/useCommittedTranscriptStickyBottom.ts`
  - `codex-gui/src/features/guiHost/guiHostClient.ts`
  - `codex-gui/src/features/projectionIngress/projectionIngressAdapter.ts`
  - `codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts`
  - `codex-gui/src/features/threadIdentity/threadIdentitySlice.ts`
  - `codex-gui/src/features/transcriptState/transcriptStateSlice.ts`
  - `codex-gui/src/features/transcriptState/transcriptEntryMaterialization.ts`
  - `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx`
  - `codex-gui/src/features/committedTranscriptSurface/LiveMarkdownText.tsx`
  - `codex-gui/src/features/committedTranscriptSurface/MarkdownText.tsx`
  - `codex-gui/src/features/committedTranscriptSurface/markdownRendering.tsx`
  - `codex-gui/src/features/committedTranscriptSurface/committedTranscriptChunkEquality.ts`
  - `codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx`
  - `codex-gui/src/features/composerTurnControl/composerTurnControlModel.ts`
  - `codex-gui/src/features/composerTurnControl/useRevealComposerOnViewportResize.ts`
  - `codex-gui/src/features/liveEventHandling/liveEventHandling.ts`
  - `codex-gui/src/features/snapshotReplay/snapshotReplay.ts`
- Create: `docs/superpowers/reports/2026-07-09-codex-gui-system-performance-check/00-summary.md`
- Create: `docs/superpowers/reports/2026-07-09-codex-gui-system-performance-check/01-startup-resources.md`
- Create: `docs/superpowers/reports/2026-07-09-codex-gui-system-performance-check/02-state-projection-ingest.md`
- Create: `docs/superpowers/reports/2026-07-09-codex-gui-system-performance-check/03-transcript-rendering.md`
- Create: `docs/superpowers/reports/2026-07-09-codex-gui-system-performance-check/04-live-streaming-input-scroll.md`
- Create: `docs/superpowers/reports/2026-07-09-codex-gui-system-performance-check/05-retained-state.md`

## Audit Slice Mapping

The design has eight audit slices and five slice report files. Execute the eight slices independently, then write each result into the mapped report:

- `startup-resources` -> `01-startup-resources.md`
- `projection-ingest` -> `02-state-projection-ingest.md`
- `redux-store-selectors` -> `02-state-projection-ingest.md`
- `transcript-rendering` -> `03-transcript-rendering.md`
- `live-streaming-text` -> `04-live-streaming-input-scroll.md`
- `composer-input` -> `04-live-streaming-input-scroll.md`
- `scroll-sticky-bottom-layout` -> `04-live-streaming-input-scroll.md`
- `retained-state-memory` -> `05-retained-state.md`

## Shared Subagent Output Contract

Every audit subagent must return exactly these sections:

```md
## 结论

## 审计字段

- 关联 issue:
- 触发源:
- 触发频率:
- 单次同步工作:
- 规模变量:
- 累计复杂度:
- 复杂度优先级:
- 当前状态:

## 关键证据路径/行号

## 已排除项

## 风险

## 报告建议
```

`报告建议` must be phrased as report content only. It must not contain repair plans or code changes.

## Task 1: Preflight And Report Skeleton

**Files:**
- Read: `docs/superpowers/specs/2026-07-09-codex-gui-system-performance-check-design.md`
- Create: `docs/superpowers/reports/2026-07-09-codex-gui-system-performance-check/00-summary.md`
- Create: `docs/superpowers/reports/2026-07-09-codex-gui-system-performance-check/01-startup-resources.md`
- Create: `docs/superpowers/reports/2026-07-09-codex-gui-system-performance-check/02-state-projection-ingest.md`
- Create: `docs/superpowers/reports/2026-07-09-codex-gui-system-performance-check/03-transcript-rendering.md`
- Create: `docs/superpowers/reports/2026-07-09-codex-gui-system-performance-check/04-live-streaming-input-scroll.md`
- Create: `docs/superpowers/reports/2026-07-09-codex-gui-system-performance-check/05-retained-state.md`

- [ ] **Step 1: Confirm branch and design input**

Run:

```bash
git status --short --branch
test -f docs/superpowers/specs/2026-07-09-codex-gui-system-performance-check-design.md
```

Expected:

- Branch is `dev`.
- The design file exists.
- No command contacts git remote.

- [ ] **Step 2: Create the report directory**

Run:

```bash
mkdir -p docs/superpowers/reports/2026-07-09-codex-gui-system-performance-check
```

Expected:

- Directory exists at `docs/superpowers/reports/2026-07-09-codex-gui-system-performance-check/`.

- [ ] **Step 3: Create `00-summary.md` skeleton**

Create `docs/superpowers/reports/2026-07-09-codex-gui-system-performance-check/00-summary.md` with:

```md
# Codex GUI system performance check summary

## 总体结论

本报告尚未完成。后续任务将填入 `codex-gui/**` 的系统性前端静态复杂度审计结论。

## 切片索引

- `01-startup-resources`: 待审计。
- `02-state-projection-ingest`: 待审计。
- `03-transcript-rendering`: 待审计。
- `04-live-streaming-input-scroll`: 待审计。
- `05-retained-state`: 待审计。

## P0 findings

尚未审计。

## P1 findings

尚未审计。

## P2 findings

尚未审计。

## P3 / 非 finding

尚未审计。

## 已有 issue 状态汇总

尚未审计。

## 新发现问题索引

尚未审计。

## 非本轮可归因或证据不足

尚未审计。

## 后续 issue 或专项入口

尚未审计。若后续需要创建或更新 issue，必须按 `codex-issue-doc-workflow` 单独进入对应设计/计划或复核入口；本轮不修改 `docs/superpowers/issues/**`。
```

- [ ] **Step 4: Create five slice report skeletons**

Create `01-startup-resources.md` with:

```md
# Startup and resources audit

## 审计范围

- 首屏入口。
- 全局 provider。
- 同步 CSS/JS 入口。
- 初始化 state wiring。

## 审计条目

待审计。
```

Create `02-state-projection-ingest.md` with:

```md
# State and projection ingest audit

## 审计范围

- GUI host event 投递、过滤、合批和 fanout。
- Redux/store update。
- selector materialization 和 cache invalidation。
- 无关更新扩散。

## Projection ingest

待审计。

## Redux/store update and selectors

待审计。
```

Create `03-transcript-rendering.md` with:

```md
# Transcript rendering audit

## 审计范围

- turn/chunk/entry render boundary。
- 长 transcript DOM。
- collapsed hidden content。
- full-turn flatten/grouping。
- chunk-level memo boundary。

## 审计条目

待审计。
```

Create `04-live-streaming-input-scroll.md` with:

```md
# Live streaming, input, and scroll audit

## 审计范围

- live text accumulation。
- live markdown consumption。
- composer/input 更新扩散。
- sticky-bottom、scroll pulse 和 surface content detection。

## Live streaming text

待审计。

## Composer/input

待审计。

## Scroll/sticky-bottom/layout

待审计。
```

Create `05-retained-state.md` with:

```md
# Retained state audit

## 审计范围

- map/cache/event window/pending queue。
- live state/thread state/projection state。
- owner、key、增长路径和 cleanup lifecycle。

## 审计条目

待审计。
```

- [ ] **Step 5: Validate skeleton formatting**

Run:

```bash
git diff --check -- docs/superpowers/reports/2026-07-09-codex-gui-system-performance-check
git diff --stat -- docs/superpowers/reports/2026-07-09-codex-gui-system-performance-check
```

Expected:

- `git diff --check` prints no output.
- `git diff --stat` shows six new report files.

- [ ] **Step 6: Commit skeleton**

Run:

```bash
git add docs/superpowers/reports/2026-07-09-codex-gui-system-performance-check
git commit -m "docs: scaffold GUI system performance report"
```

Expected:

- One local commit is created.
- No git remote command is run.

## Task 2: Audit Startup And Resource Entry Points

**Files:**
- Read: `docs/superpowers/specs/2026-07-09-codex-gui-system-performance-check-design.md`
- Read: `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/05-heroui-full-css-import.md`
- Read: `codex-gui/src/main.tsx`
- Read: `codex-gui/src/App.tsx`
- Read: `codex-gui/src/router.tsx`
- Read: `codex-gui/src/index.css`
- Read: `codex-gui/src/app/ThemeProvider.tsx`
- Modify: `docs/superpowers/reports/2026-07-09-codex-gui-system-performance-check/01-startup-resources.md`

- [ ] **Step 1: Dispatch subagent**

Prompt:

```text
只读审计切片：检查 Codex GUI startup/resources 静态复杂度风险。

范围只包括：
- docs/superpowers/specs/2026-07-09-codex-gui-system-performance-check-design.md
- docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/05-heroui-full-css-import.md
- codex-gui/src/main.tsx
- codex-gui/src/App.tsx
- codex-gui/src/router.tsx
- codex-gui/src/index.css
- codex-gui/src/app/ThemeProvider.tsx

目标：
- 判断入口、provider、router、CSS import、initial render wiring 中是否存在随 thread/history/route/provider/retained state 数增长的静态复杂度风险。
- CSS/JS 体积本身不能作为本轮复杂度 finding；如相关，只能标记为 `非本轮可归因` 或后续量化入口。
- 每个条目必须给出复杂度优先级和当前状态。

禁止：
- 不修复。
- 不运行测试、build、profiling、browser automation、format、lint、package scripts。
- 不读取无关文件。
- 不提出具体修复方案。
- 不创建或更新 issue。

状态只能用：已有 issue 仍成立、已修复、新发现、非本轮可归因、证据不足。
复杂度优先级只能用：P0、P1、P2、P3、非 finding。
按 Shared Subagent Output Contract 返回。
```

- [ ] **Step 2: Review result**

Check:

- The result contains all required output sections.
- Any `05-heroui-full-css-import.md` conclusion is treated as measurement/background unless the subagent found a distinct static complexity risk.
- Every finding has source paths and line numbers.
- No repair plan or issue edit is proposed.

- [ ] **Step 3: Update report file**

Replace `待审计。` in `01-startup-resources.md` with the reviewed subagent result.

- [ ] **Step 4: Validate and commit**

Run:

```bash
git diff --check -- docs/superpowers/reports/2026-07-09-codex-gui-system-performance-check/01-startup-resources.md
git diff -- docs/superpowers/reports/2026-07-09-codex-gui-system-performance-check/01-startup-resources.md
git add docs/superpowers/reports/2026-07-09-codex-gui-system-performance-check/01-startup-resources.md
git commit -m "docs: audit GUI startup resource complexity"
```

Expected:

- Diff contains only report content.
- One local commit is created.

## Task 3: Audit Projection Ingest And Redux Store/Selectors

**Files:**
- Read: `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/01-projection-event-top-level-react-state.md`
- Read: `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/02-transcript-chunk-selector-view-rebuild.md`
- Read: `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/03-item-started-dirties-transcript-state.md`
- Read: `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/07-transcript-revision-invariant.md`
- Read: `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/08-projection-delta-redux-action-frequency.md`
- Read: `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/10-live-slot-selector-cache-invalidation.md`
- Read: `codex-gui/src/app/store.ts`
- Read: `codex-gui/src/app/hooks.ts`
- Read: `codex-gui/src/features/guiHost/guiHostClient.ts`
- Read: `codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx`
- Read: `codex-gui/src/features/projectionIngress/projectionIngressAdapter.ts`
- Read: `codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts`
- Read: `codex-gui/src/features/threadIdentity/threadIdentitySlice.ts`
- Read: `codex-gui/src/features/transcriptState/transcriptStateSlice.ts`
- Modify: `docs/superpowers/reports/2026-07-09-codex-gui-system-performance-check/02-state-projection-ingest.md`

- [ ] **Step 1: Dispatch `projection-ingest` subagent**

Prompt:

```text
只读审计切片：检查 Codex GUI projection ingest 静态复杂度风险。

范围只包括：
- docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/01-projection-event-top-level-react-state.md
- docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/08-projection-delta-redux-action-frequency.md
- codex-gui/src/features/guiHost/guiHostClient.ts
- codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx
- codex-gui/src/features/projectionIngress/projectionIngressAdapter.ts
- codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts

目标：
- Check host event ingress, projection event callbacks, projection close handling, batching, accepted delta action boundaries, and fanout into Redux-facing code.
- Declare scale variables such as projection events, delta notifications, batch size, threads, pending queues, and fanout targets.
- Recalibrate `01` and `08` against current code instead of copying old issue status.
- Separate Redux action/subscription frequency from batch-internal reducer work.

禁止：
- 不修复。
- 不运行测试、build、profiling、browser automation、format、lint、package scripts。
- 不读取无关文件。
- 不提出具体修复方案。
- 不创建或更新 issue。

状态只能用：已有 issue 仍成立、已修复、新发现、非本轮可归因、证据不足。
复杂度优先级只能用：P0、P1、P2、P3、非 finding。
按 Shared Subagent Output Contract 返回。
```

- [ ] **Step 2: Review `projection-ingest` result**

Check:

- The result distinguishes already-fixed event-to-top-level-state risk from any current ingest risk.
- `01` and `08` issue relationships are explicitly mentioned or excluded.
- It does not broaden into selector/cache/transcript rendering work.
- Every finding has a priority and status.
- Evidence line numbers are current-code line numbers.

- [ ] **Step 3: Dispatch `redux-store-selectors` subagent**

Prompt:

```text
只读审计切片：检查 Codex GUI Redux/store update 与 selector 静态复杂度风险。

范围只包括：
- docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/02-transcript-chunk-selector-view-rebuild.md
- docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/03-item-started-dirties-transcript-state.md
- docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/07-transcript-revision-invariant.md
- docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/10-live-slot-selector-cache-invalidation.md
- codex-gui/src/app/store.ts
- codex-gui/src/app/hooks.ts
- codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts
- codex-gui/src/features/threadIdentity/threadIdentitySlice.ts
- codex-gui/src/features/transcriptState/transcriptStateSlice.ts

目标：
- Check slice writes, selector materialization, cache invalidation, store subscription exposure, and unrelated update fanout.
- Declare scale variables such as store updates, mounted selectors, turns, chunks, entries, live items, cache entries, threads, and retained selector views.
- Recalibrate `02`, `03`, `07`, and `10` against current code instead of copying old issue status.
- Keep batch ingress and projection event wiring out of scope unless needed as a named trigger source.

禁止：
- 不修复。
- 不运行测试、build、profiling、browser automation、format、lint、package scripts。
- 不读取无关文件。
- 不提出具体修复方案。
- 不创建或更新 issue。

状态只能用：已有 issue 仍成立、已修复、新发现、非本轮可归因、证据不足。
复杂度优先级只能用：P0、P1、P2、P3、非 finding。
按 Shared Subagent Output Contract 返回。
```

- [ ] **Step 4: Review `redux-store-selectors` result**

Check:

- `02`, `03`, `07`, and `10` issue relationships are explicitly mentioned or excluded.
- Selector materialization and reducer write costs are separated.
- Any cache or revision claim cites current code paths and line numbers.
- Every finding has a priority and status.

- [ ] **Step 5: Update report file**

Replace the `## Projection ingest` placeholder in `02-state-projection-ingest.md` with the reviewed `projection-ingest` result.

Replace the `## Redux/store update and selectors` placeholder in `02-state-projection-ingest.md` with the reviewed `redux-store-selectors` result.

- [ ] **Step 6: Validate and commit**

Run:

```bash
git diff --check -- docs/superpowers/reports/2026-07-09-codex-gui-system-performance-check/02-state-projection-ingest.md
git diff -- docs/superpowers/reports/2026-07-09-codex-gui-system-performance-check/02-state-projection-ingest.md
git add docs/superpowers/reports/2026-07-09-codex-gui-system-performance-check/02-state-projection-ingest.md
git commit -m "docs: audit GUI state projection complexity"
```

Expected:

- Diff contains only report content.
- One local commit is created.

## Task 4: Audit Transcript Rendering

**Files:**
- Read: `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/04-long-transcript-no-windowing.md`
- Read: `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/06-temporary-grouping-full-turn-scan.md`
- Read: `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/02-transcript-chunk-selector-view-rebuild.md`
- Read: `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx`
- Read: `codex-gui/src/features/committedTranscriptSurface/committedTranscriptChunkEquality.ts`
- Read: `codex-gui/src/features/transcriptState/transcriptStateSlice.ts`
- Read: `codex-gui/src/features/transcriptState/transcriptEntryMaterialization.ts`
- Modify: `docs/superpowers/reports/2026-07-09-codex-gui-system-performance-check/03-transcript-rendering.md`

- [ ] **Step 1: Dispatch subagent**

Prompt:

```text
只读审计切片：检查 Codex GUI transcript rendering 静态复杂度风险。

范围只包括：
- docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/04-long-transcript-no-windowing.md
- docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/06-temporary-grouping-full-turn-scan.md
- docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/02-transcript-chunk-selector-view-rebuild.md
- codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx
- codex-gui/src/features/committedTranscriptSurface/committedTranscriptChunkEquality.ts
- codex-gui/src/features/transcriptState/transcriptStateSlice.ts
- codex-gui/src/features/transcriptState/transcriptEntryMaterialization.ts

目标：
- Check turn/chunk/entry render boundaries, long transcript DOM, collapsed hidden content, full-turn flatten/grouping, and chunk memo/equality behavior.
- Declare scale variables such as turns, chunks, entries, mounted DOM nodes, expanded modules, and hidden entries.
- Recalibrate `04`, `06`, and `02` against current source.
- Mark browser layout/paint/FPS claims as outside this static audit unless there is a source-level complexity path.

禁止：
- 不修复。
- 不运行测试、build、profiling、browser automation、format、lint、package scripts。
- 不读取无关文件。
- 不提出具体修复方案。
- 不创建或更新 issue。

状态只能用：已有 issue 仍成立、已修复、新发现、非本轮可归因、证据不足。
复杂度优先级只能用：P0、P1、P2、P3、非 finding。
按 Shared Subagent Output Contract 返回。
```

- [ ] **Step 2: Review result**

Check:

- `04-long-transcript-no-windowing` is classified by static complexity, not visual smoothness.
- Collapsed hidden content is explicitly checked.
- Full-turn flatten/grouping is not reported as still present unless current source evidence confirms it.
- Any DOM-size risk explains whether it is retained space, render traversal, or browser-measurement-only background.

- [ ] **Step 3: Update report file**

Replace `待审计。` in `03-transcript-rendering.md` with the reviewed subagent result.

- [ ] **Step 4: Validate and commit**

Run:

```bash
git diff --check -- docs/superpowers/reports/2026-07-09-codex-gui-system-performance-check/03-transcript-rendering.md
git diff -- docs/superpowers/reports/2026-07-09-codex-gui-system-performance-check/03-transcript-rendering.md
git add docs/superpowers/reports/2026-07-09-codex-gui-system-performance-check/03-transcript-rendering.md
git commit -m "docs: audit GUI transcript rendering complexity"
```

Expected:

- Diff contains only report content.
- One local commit is created.

## Task 5: Audit Live Streaming, Input, And Scroll

**Files:**
- Read: `docs/superpowers/specs/2026-07-03-codex-gui-streaming-support/05-frontend-performance-check-design.md`
- Read: `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/01-projection-event-top-level-react-state.md`
- Read: `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/08-projection-delta-redux-action-frequency.md`
- Read: `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/09-projection-delta-transient-text-concat.md`
- Read: `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/10-live-slot-selector-cache-invalidation.md`
- Read: `codex-gui/src/features/transcriptState/transcriptStateSlice.ts`
- Read: `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx`
- Read: `codex-gui/src/features/committedTranscriptSurface/LiveMarkdownText.tsx`
- Read: `codex-gui/src/features/committedTranscriptSurface/MarkdownText.tsx`
- Read: `codex-gui/src/features/committedTranscriptSurface/markdownRendering.tsx`
- Read: `codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx`
- Read: `codex-gui/src/features/composerTurnControl/composerTurnControlModel.ts`
- Read: `codex-gui/src/features/composerTurnControl/useRevealComposerOnViewportResize.ts`
- Read: `codex-gui/src/features/appShell/useCommittedTranscriptStickyBottom.ts`
- Read: `codex-gui/src/features/appShell/AppShell.tsx`
- Modify: `docs/superpowers/reports/2026-07-09-codex-gui-system-performance-check/04-live-streaming-input-scroll.md`

- [ ] **Step 1: Dispatch `live-streaming-text` subagent**

Prompt:

```text
只读审计切片：检查 Codex GUI live streaming text 静态复杂度风险。

范围只包括：
- docs/superpowers/specs/2026-07-03-codex-gui-streaming-support/05-frontend-performance-check-design.md
- docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/08-projection-delta-redux-action-frequency.md
- docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/09-projection-delta-transient-text-concat.md
- docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/10-live-slot-selector-cache-invalidation.md
- codex-gui/src/features/transcriptState/transcriptStateSlice.ts
- codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx
- codex-gui/src/features/committedTranscriptSurface/LiveMarkdownText.tsx
- codex-gui/src/features/committedTranscriptSurface/MarkdownText.tsx
- codex-gui/src/features/committedTranscriptSurface/markdownRendering.tsx

目标：
- Check projection delta to live item text accumulation, live item revision/pulse update boundaries, live markdown source consumption, and streaming render boundaries.
- Declare scale variables such as delta count, batch size, accumulated live text length, live item buckets, markdown source length, and live render frequency.
- Keep text accumulation separate from markdown consumption.
- Recalibrate `08`, `09`, and `10` only for live streaming text boundaries.

禁止：
- 不修复。
- 不运行测试、build、profiling、browser automation、format、lint、package scripts。
- 不读取无关文件。
- 不提出具体修复方案。
- 不创建或更新 issue。

状态只能用：已有 issue 仍成立、已修复、新发现、非本轮可归因、证据不足。
复杂度优先级只能用：P0、P1、P2、P3、非 finding。
按 Shared Subagent Output Contract 返回。
```

- [ ] **Step 2: Review `live-streaming-text` result**

Check:

- `09` text accumulation is not merged with markdown render cost.
- `08` and `10` are mentioned only where they affect live streaming text boundaries.
- Each finding has priority and status.
- No browser layout/paint/FPS claim is reported as a static finding.

- [ ] **Step 3: Dispatch `composer-input` subagent**

Prompt:

```text
只读审计切片：检查 Codex GUI composer/input 静态复杂度风险。

范围只包括：
- docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/01-projection-event-top-level-react-state.md
- codex-gui/src/App.tsx
- codex-gui/src/features/appShell/AppShell.tsx
- codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx
- codex-gui/src/features/composerTurnControl/composerTurnControlModel.ts
- codex-gui/src/features/composerTurnControl/useRevealComposerOnViewportResize.ts

目标：
- Check whether background projection/store/transcript changes dirty composer state, composer model, input handlers, or mounted shell subtree.
- Declare scale variables such as projection events, store updates, composer state changes, mounted shell subtree, and input events.
- Recalibrate `01` only as historical input fanout evidence.
- Do not inspect live text accumulation or scroll/sticky-bottom paths.

禁止：
- 不修复。
- 不运行测试、build、profiling、browser automation、format、lint、package scripts。
- 不读取无关文件。
- 不提出具体修复方案。
- 不创建或更新 issue。

状态只能用：已有 issue 仍成立、已修复、新发现、非本轮可归因、证据不足。
复杂度优先级只能用：P0、P1、P2、P3、非 finding。
按 Shared Subagent Output Contract 返回。
```

- [ ] **Step 4: Review `composer-input` result**

Check:

- Composer/input findings show whether background events actually dirty composer state or just render nearby components.
- `01` is not re-reported if the current top-level state fanout is fixed.
- Every finding has current source evidence.
- Each finding has priority and status.

- [ ] **Step 5: Dispatch `scroll-sticky-bottom-layout` subagent**

Prompt:

```text
只读审计切片：检查 Codex GUI scroll/sticky-bottom/layout 静态复杂度风险。

范围只包括：
- codex-gui/src/features/appShell/useCommittedTranscriptStickyBottom.ts
- codex-gui/src/features/appShell/AppShell.tsx
- codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx
- codex-gui/src/features/transcriptState/transcriptStateSlice.ts

目标：
- Check sticky-bottom, scroll pulse, auto-scroll triggers, surface content detection, and layout-facing list scans.
- Declare scale variables such as live updates, turns, chunks, entries, surface live items, mounted DOM-facing lists, and scroll events.
- Distinguish source-level scans from browser layout/paint/FPS measurement claims.
- Do not inspect live text accumulation or composer/input paths unless naming them as trigger sources.

禁止：
- 不修复。
- 不运行测试、build、profiling、browser automation、format、lint、package scripts。
- 不读取无关文件。
- 不提出具体修复方案。
- 不创建或更新 issue。

状态只能用：已有 issue 仍成立、已修复、新发现、非本轮可归因、证据不足。
复杂度优先级只能用：P0、P1、P2、P3、非 finding。
按 Shared Subagent Output Contract 返回。
```

- [ ] **Step 6: Review `scroll-sticky-bottom-layout` result**

Check:

- Scroll/sticky-bottom findings distinguish source-level scans from browser-layout measurement claims.
- Surface-content scans name their scale variables.
- Every finding has current source evidence.
- Each finding has priority and status.

- [ ] **Step 7: Update report file**

Replace the `## Live streaming text` placeholder in `04-live-streaming-input-scroll.md` with the reviewed `live-streaming-text` result.

Replace the `## Composer/input` placeholder in `04-live-streaming-input-scroll.md` with the reviewed `composer-input` result.

Replace the `## Scroll/sticky-bottom/layout` placeholder in `04-live-streaming-input-scroll.md` with the reviewed `scroll-sticky-bottom-layout` result.

- [ ] **Step 8: Validate and commit**

Run:

```bash
git diff --check -- docs/superpowers/reports/2026-07-09-codex-gui-system-performance-check/04-live-streaming-input-scroll.md
git diff -- docs/superpowers/reports/2026-07-09-codex-gui-system-performance-check/04-live-streaming-input-scroll.md
git add docs/superpowers/reports/2026-07-09-codex-gui-system-performance-check/04-live-streaming-input-scroll.md
git commit -m "docs: audit GUI live input scroll complexity"
```

Expected:

- Diff contains only report content.
- One local commit is created.

## Task 6: Audit Retained State And Cleanup Lifecycle

**Files:**
- Read: `docs/superpowers/specs/2026-07-09-codex-gui-system-performance-check-design.md`
- Read: `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/03-item-started-dirties-transcript-state.md`
- Read: `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/07-transcript-revision-invariant.md`
- Read: `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/10-live-slot-selector-cache-invalidation.md`
- Read: `codex-gui/src/features/guiHost/guiHostClient.ts`
- Read: `codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx`
- Read: `codex-gui/src/features/projectionIngress/projectionIngressAdapter.ts`
- Read: `codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts`
- Read: `codex-gui/src/features/threadIdentity/threadIdentitySlice.ts`
- Read: `codex-gui/src/features/transcriptState/transcriptStateSlice.ts`
- Read: `codex-gui/src/features/liveEventHandling/liveEventHandling.ts`
- Read: `codex-gui/src/features/snapshotReplay/snapshotReplay.ts`
- Modify: `docs/superpowers/reports/2026-07-09-codex-gui-system-performance-check/05-retained-state.md`

- [ ] **Step 1: Dispatch subagent**

Prompt:

```text
只读审计切片：检查 Codex GUI retained state / memory 静态复杂度风险。

范围只包括：
- docs/superpowers/specs/2026-07-09-codex-gui-system-performance-check-design.md
- docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/03-item-started-dirties-transcript-state.md
- docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/07-transcript-revision-invariant.md
- docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/10-live-slot-selector-cache-invalidation.md
- codex-gui/src/features/guiHost/guiHostClient.ts
- codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx
- codex-gui/src/features/projectionIngress/projectionIngressAdapter.ts
- codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts
- codex-gui/src/features/threadIdentity/threadIdentitySlice.ts
- codex-gui/src/features/transcriptState/transcriptStateSlice.ts
- codex-gui/src/features/liveEventHandling/liveEventHandling.ts
- codex-gui/src/features/snapshotReplay/snapshotReplay.ts

目标：
- Identify maps, caches, event windows, pending queues, live state, thread state, projection state, and cleanup lifecycle.
- For each retained structure, state owner, key, growth path, cleanup path, scale variable, and whether cleanup evidence is sufficient.
- Classify unknown lifecycle as `证据不足`; do not convert uncertainty into a confirmed finding.

禁止：
- 不修复。
- 不运行测试、build、profiling、browser automation、format、lint、package scripts。
- 不读取无关文件。
- 不提出具体修复方案。
- 不创建或更新 issue。

状态只能用：已有 issue 仍成立、已修复、新发现、非本轮可归因、证据不足。
复杂度优先级只能用：P0、P1、P2、P3、非 finding。
按 Shared Subagent Output Contract 返回。
```

- [ ] **Step 2: Review result**

Check:

- Every retained-state claim names owner, key, growth path, and cleanup path.
- Unknown cleanup is marked `证据不足`.
- Findings are not duplicated from the state/projection or live/scroll reports unless the retained lifecycle angle is distinct.

- [ ] **Step 3: Update report file**

Replace `待审计。` in `05-retained-state.md` with the reviewed subagent result.

- [ ] **Step 4: Validate and commit**

Run:

```bash
git diff --check -- docs/superpowers/reports/2026-07-09-codex-gui-system-performance-check/05-retained-state.md
git diff -- docs/superpowers/reports/2026-07-09-codex-gui-system-performance-check/05-retained-state.md
git add docs/superpowers/reports/2026-07-09-codex-gui-system-performance-check/05-retained-state.md
git commit -m "docs: audit GUI retained state complexity"
```

Expected:

- Diff contains only report content.
- One local commit is created.

## Task 7: Write Summary And Cross-Check Issue Workflow Boundaries

**Files:**
- Read: `docs/superpowers/reports/2026-07-09-codex-gui-system-performance-check/01-startup-resources.md`
- Read: `docs/superpowers/reports/2026-07-09-codex-gui-system-performance-check/02-state-projection-ingest.md`
- Read: `docs/superpowers/reports/2026-07-09-codex-gui-system-performance-check/03-transcript-rendering.md`
- Read: `docs/superpowers/reports/2026-07-09-codex-gui-system-performance-check/04-live-streaming-input-scroll.md`
- Read: `docs/superpowers/reports/2026-07-09-codex-gui-system-performance-check/05-retained-state.md`
- Read: `/Users/jiangsheng/cnb/codex-config/skills/codex-issue-doc-workflow/SKILL.md`
- Modify: `docs/superpowers/reports/2026-07-09-codex-gui-system-performance-check/00-summary.md`

- [ ] **Step 1: Extract cross-report findings**

Read each slice report and all eight mapped audit sections from `Audit Slice Mapping`, then build these summary groups:

- `P0 findings`
- `P1 findings`
- `P2 findings`
- `P3 / 非 finding`
- `已有 issue 状态汇总`
- `新发现问题索引`
- `非本轮可归因或证据不足`
- `后续 issue 或专项入口`

Do not create or update issue files.

- [ ] **Step 2: Update `00-summary.md`**

Replace every `尚未审计。` placeholder with the final summary content.

For any follow-up issue entry, use this wording pattern:

```md
- `<short title>`: 需要后续按 `codex-issue-doc-workflow` 创建或更新 issue；本轮只记录入口，不修改 `docs/superpowers/issues/**`。
```

For any follow-up design/plan entry, use this wording pattern:

```md
- `<short title>`: 需要单独进入设计/计划阶段；本轮不提出修复方案。
```

- [ ] **Step 3: Verify issue workflow boundary**

Run:

```bash
git status --short -- docs/superpowers/issues
```

Expected:

- No issue files are modified by this plan.

- [ ] **Step 4: Validate summary and commit**

Run:

```bash
git diff --check -- docs/superpowers/reports/2026-07-09-codex-gui-system-performance-check/00-summary.md
git diff -- docs/superpowers/reports/2026-07-09-codex-gui-system-performance-check/00-summary.md
git add docs/superpowers/reports/2026-07-09-codex-gui-system-performance-check/00-summary.md
git commit -m "docs: summarize GUI system performance audit"
```

Expected:

- Summary references every slice report.
- Summary groups findings by complexity priority and status.
- One local commit is created.

## Task 8: Final Review

**Files:**
- Read: `docs/superpowers/specs/2026-07-09-codex-gui-system-performance-check-design.md`
- Read: `docs/superpowers/reports/2026-07-09-codex-gui-system-performance-check/00-summary.md`
- Read: `docs/superpowers/reports/2026-07-09-codex-gui-system-performance-check/01-startup-resources.md`
- Read: `docs/superpowers/reports/2026-07-09-codex-gui-system-performance-check/02-state-projection-ingest.md`
- Read: `docs/superpowers/reports/2026-07-09-codex-gui-system-performance-check/03-transcript-rendering.md`
- Read: `docs/superpowers/reports/2026-07-09-codex-gui-system-performance-check/04-live-streaming-input-scroll.md`
- Read: `docs/superpowers/reports/2026-07-09-codex-gui-system-performance-check/05-retained-state.md`

- [ ] **Step 1: Run placeholder scan**

Run:

```bash
rg -n -e '待审计|尚未审计|TBD|TODO|PLACEHOLDER|implement later|修复方案|具体修复' docs/superpowers/reports/2026-07-09-codex-gui-system-performance-check
```

Expected:

- No unfinished placeholders remain.
- If `修复方案` or `具体修复` appears, inspect the context and remove repair-plan content unless it is a prohibition statement.

- [ ] **Step 2: Run status and priority scan**

Run:

```bash
rg -n -e '复杂度优先级:|当前状态:' docs/superpowers/reports/2026-07-09-codex-gui-system-performance-check
```

Expected:

- Every audit entry has both `复杂度优先级:` and `当前状态:`.
- Priority values are only `P0`, `P1`, `P2`, `P3`, or `非 finding`.
- Status values are only `已有 issue 仍成立`, `已修复`, `新发现`, `非本轮可归因`, or `证据不足`.

- [ ] **Step 3: Verify no forbidden files changed**

Run:

```bash
git status --short -- codex-gui docs/superpowers/issues
```

Expected:

- No `codex-gui/**` files are modified.
- No `docs/superpowers/issues/**` files are modified.

- [ ] **Step 4: Review final diff**

Run:

```bash
git diff --stat -- docs/superpowers/reports/2026-07-09-codex-gui-system-performance-check
git diff --check -- docs/superpowers/reports/2026-07-09-codex-gui-system-performance-check
```

Expected:

- `git diff --check` prints no output.
- Diff stat only includes report files, unless previous task commits left a clean worktree.

- [ ] **Step 5: Commit final review notes if needed**

If Task 8 edits any report file, run:

```bash
git add docs/superpowers/reports/2026-07-09-codex-gui-system-performance-check
git commit -m "docs: finalize GUI system performance audit"
```

Expected:

- A local commit is created only if Task 8 changed report content.

If Task 8 finds no changes needed, do not create an empty commit.
