# Codex GUI 03 Performance Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute the Codex GUI 03 assistant text streaming static time-complexity audit and produce the two report files defined by the design.

**Architecture:** The controller creates the report skeleton, delegates each issue-mapped audit slice to a read-only subagent, reviews the returned evidence, and writes only report files under `docs/superpowers/reports/2026-07-09-codex-gui-03-performance-check/`. Each slice starts from an existing issue, recalibrates it against current 03 implementation code, and reports time complexity, 03 attribution, and an issue-compatible status without proposing fixes.

**Tech Stack:** Markdown reports, `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/**`, Codex GUI TypeScript/React source inspection, read-only shell commands such as `rg`, `sed`, `nl`, and `git status`.

---

## File Structure

- Read: `docs/superpowers/specs/2026-07-03-codex-gui-streaming-support/05-frontend-performance-check-design.md`
- Read: `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/03-item-started-dirties-transcript-state.md`
- Read: `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/08-projection-delta-redux-action-frequency.md`
- Read: `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/09-projection-delta-transient-text-concat.md`
- Read: `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/10-live-slot-selector-cache-invalidation.md`
- Read as boundary references only: `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/02-transcript-chunk-selector-view-rebuild.md`
- Read as boundary references only: `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/06-temporary-grouping-full-turn-scan.md`
- Read as boundary references only: `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/07-transcript-revision-invariant.md`
- Read as default exclusions only: `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/04-long-transcript-no-windowing.md`
- Read as default exclusions only: `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/05-heroui-full-css-import.md`
- Read current code evidence as needed:
  - `codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx`
  - `codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts`
  - `codex-gui/src/features/transcriptState/transcriptStateSlice.ts`
  - `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx`
  - `codex-gui/src/features/committedTranscriptSurface/LiveMarkdownText.tsx`
  - `codex-gui/src/features/appShell/useCommittedTranscriptStickyBottom.ts`
- Create: `docs/superpowers/reports/2026-07-09-codex-gui-03-performance-check/00-summary.md`
- Create: `docs/superpowers/reports/2026-07-09-codex-gui-03-performance-check/01-03-hot-paths.md`

Execution must not modify `codex-gui/**`, issue files, design files, or plan files. If an audit slice finds a risk, record it in the report and do not propose a fix.

## Global Execution Rules

- Every audit slice must be delegated to a subagent.
- The controller may read the design, the reports, and short targeted evidence snippets only for coordination and spot checks.
- Do not run tests, benchmarks, profiling, browser automation, formatting, package scripts, schema generation, snapshot commands, dependency installs, or git remote commands.
- Use read-only commands only: `git status --short --branch`, `test -f`, `mkdir -p` when creating the report directory, `rg`, `sed`, `nl`, and `wc`.
- Do not edit code.
- Do not update issue files.
- Do not create or update research logs unless the user explicitly asks for research artifacts.
- Do not propose concrete repair patches, function rewrites, component rewrites, data structure replacements, throttling, buffering, caching, virtualization, or markdown-rendering redesigns.
- Treat this as a time-complexity audit, not a constant-factor review.
- Report only risks attributable to 03 introducing, amplifying, or exposing a hot-path cost.
- Mark global frontend issues outside 03 as `非 03 归因`.
- Mark stale issue assumptions as `已修复` or `部分过期` after checking current code.
- If current code evidence is insufficient, mark the slice `证据不足` and state what evidence is missing.

## Subagent Output Contract

Every slice subagent must return exactly these sections:

```md
## 结论

## 审计字段

- 关联 issue:
- 触发源:
- 触发频率:
- 单次同步工作:
- 规模变量:
- 累计时间复杂度:
- 03 归因:
- 当前状态:

## 关键证据路径/行号

## 排除项

## 报告建议
```

Allowed `当前状态` values:

- `仍成立`
- `已修复`
- `部分过期`
- `非 03 归因`
- `证据不足`

`报告建议` must be phrased as report content only. It must not contain a repair plan or patch direction.

## Task 1: Preflight And Report Skeleton

**Files:**
- Read: `docs/superpowers/specs/2026-07-03-codex-gui-streaming-support/05-frontend-performance-check-design.md`
- Create: `docs/superpowers/reports/2026-07-09-codex-gui-03-performance-check/00-summary.md`
- Create: `docs/superpowers/reports/2026-07-09-codex-gui-03-performance-check/01-03-hot-paths.md`

- [ ] **Step 1: Confirm branch and design input**

Run:

```bash
git status --short --branch
test -f docs/superpowers/specs/2026-07-03-codex-gui-streaming-support/05-frontend-performance-check-design.md
```

Expected:

- Branch is `dev`.
- The design file exists.
- No command contacts git remote.

- [ ] **Step 2: Create report directory and skeleton files**

Create:

```text
docs/superpowers/reports/2026-07-09-codex-gui-03-performance-check/
  00-summary.md
  01-03-hot-paths.md
```

Initial `00-summary.md` content:

```md
# Codex GUI 03 performance check summary

## 总体结论

本报告尚未完成。后续任务将填入 03 assistant text streaming 直接热路径的静态时间复杂度审计结论。

## 切片索引

- `08-projection-delta-redux-action-frequency`: 待审计。
- `09-projection-delta-transient-text-concat`: 待审计。
- `10-live-slot-selector-cache-invalidation`: 待审计。
- `03-item-started-dirties-transcript-state`: 待审计。

## 当前 03 归因风险

尚未审计。

## 非 03 归因或排除项

尚未审计。

## 需要后续单独设计或计划的问题

尚未审计。
```

Initial `01-03-hot-paths.md` content:

```md
# Codex GUI 03 hot path audit

## 审计口径

每个切片按 `触发频率 * 单次同步工作 * 规模变量` 判断时间复杂度风险，并用当前代码证据校准已有 issue 状态。

Allowed status values:

- `仍成立`
- `已修复`
- `部分过期`
- `非 03 归因`
- `证据不足`

## 08 projection delta Redux action frequency

待审计。

## 09 projection delta transientText concat

待审计。

## 10 live slot selector cache invalidation

待审计。

## 03 itemStarted dirtying boundary

待审计。
```

## Task 2: Audit `08` Projection Delta Redux Action Frequency

**Files:**
- Read: `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/08-projection-delta-redux-action-frequency.md`
- Read: `codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx`
- Read: `codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts`
- Read: `codex-gui/src/features/transcriptState/transcriptStateSlice.ts`
- Modify: `docs/superpowers/reports/2026-07-09-codex-gui-03-performance-check/01-03-hot-paths.md`

- [ ] **Step 1: Dispatch subagent**

Prompt:

```text
只读审计切片：检查 `08-projection-delta-redux-action-frequency` 在当前 03 实现中是否仍成立。

范围只包括：
- docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/08-projection-delta-redux-action-frequency.md
- codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx
- codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts
- codex-gui/src/features/transcriptState/transcriptStateSlice.ts

目标：
- 引用 issue 的复杂度假设。
- 用当前代码确认 projection delta 是否仍以 delta 频率触发 dispatch、Immer reducer 写入和 store subscription。
- 按固定字段输出：关联 issue、触发源、触发频率、单次同步工作、规模变量、累计时间复杂度、03 归因、当前状态、证据路径/行号、排除项。

禁止：
- 不修复。
- 不运行测试、benchmark、profiling、browser automation、格式化或 package scripts。
- 不读无关文件。
- 不提出 batching、throttle、buffer、cache 或任何具体修复方向。
- 不把非 03 问题报告为 03 finding。

状态只能用：仍成立、已修复、部分过期、非 03 归因、证据不足。
按 Subagent Output Contract 返回。
```

- [ ] **Step 2: Review the result**

Check that the subagent result:

- Includes all fixed audit fields.
- Uses one allowed status value.
- Cites current code paths and line numbers.
- Does not include a repair plan.
- Distinguishes RAF/batched dispatch evidence from per-delta reducer write evidence if both appear.

- [ ] **Step 3: Update hot-path report**

Replace the `## 08 projection delta Redux action frequency` placeholder in `01-03-hot-paths.md` with the reviewed result.

Do not update `00-summary.md` yet. Summary is written after all slices complete.

## Task 3: Audit `09` Projection Delta `transientText` Concat

**Files:**
- Read: `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/09-projection-delta-transient-text-concat.md`
- Read: `codex-gui/src/features/transcriptState/transcriptStateSlice.ts`
- Read if needed for the consumption boundary: `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx`
- Read if needed for the consumption boundary: `codex-gui/src/features/committedTranscriptSurface/LiveMarkdownText.tsx`
- Modify: `docs/superpowers/reports/2026-07-09-codex-gui-03-performance-check/01-03-hot-paths.md`

- [ ] **Step 1: Dispatch subagent**

Prompt:

```text
只读审计切片：检查 `09-projection-delta-transient-text-concat` 在当前 03 实现中是否仍成立。

范围只包括：
- docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/09-projection-delta-transient-text-concat.md
- codex-gui/src/features/transcriptState/transcriptStateSlice.ts
- codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx
- codex-gui/src/features/committedTranscriptSurface/LiveMarkdownText.tsx

目标：
- 引用 issue 的复杂度假设。
- 用当前代码确认 live agent message delta 是否仍通过字符串追加累积可渲染文本。
- 只在需要确认消费边界时读取 `CommittedTranscriptSurface.tsx` 和 `LiveMarkdownText.tsx`。
- 按固定字段输出：关联 issue、触发源、触发频率、单次同步工作、规模变量、累计时间复杂度、03 归因、当前状态、证据路径/行号、排除项。

禁止：
- 不修复。
- 不运行测试、benchmark、profiling、browser automation、格式化或 package scripts。
- 不读无关文件。
- 不提出数组、rope、buffer、join、Streamdown 改造或任何具体修复方向。
- 不把 markdown renderer 常数成本扩展成未证实的 finding。

状态只能用：仍成立、已修复、部分过期、非 03 归因、证据不足。
按 Subagent Output Contract 返回。
```

- [ ] **Step 2: Review the result**

Check that the subagent result:

- Explains whether the scale variable is accumulated live text length, delta count, or both.
- Separates text accumulation cost from Markdown rendering cost.
- Uses one allowed status value.
- Does not include a repair plan.

- [ ] **Step 3: Update hot-path report**

Replace the `## 09 projection delta transientText concat` placeholder in `01-03-hot-paths.md` with the reviewed result.

## Task 4: Audit `10` Live Slot Selector Cache Invalidation

**Files:**
- Read: `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/10-live-slot-selector-cache-invalidation.md`
- Read: `codex-gui/src/features/transcriptState/transcriptStateSlice.ts`
- Read: `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx`
- Modify: `docs/superpowers/reports/2026-07-09-codex-gui-03-performance-check/01-03-hot-paths.md`

- [ ] **Step 1: Dispatch subagent**

Prompt:

```text
只读审计切片：检查 `10-live-slot-selector-cache-invalidation` 在当前 02e/03 实现中是否仍成立、已修复或部分过期。

范围只包括：
- docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/10-live-slot-selector-cache-invalidation.md
- codex-gui/src/features/transcriptState/transcriptStateSlice.ts
- codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx

目标：
- 引用 issue 的旧复杂度假设。
- 用当前代码确认是否仍存在 read-time live item materialization、slot revision comparison、slot key scan 或 equivalent selector cache invalidation 成本。
- 明确当前 `selectTranscriptLiveItemsForTurn` 与 `CommittedTranscriptSurface` live consumption 的时间复杂度和 03 归因。
- 按固定字段输出：关联 issue、触发源、触发频率、单次同步工作、规模变量、累计时间复杂度、03 归因、当前状态、证据路径/行号、排除项。

禁止：
- 不修复。
- 不运行测试、benchmark、profiling、browser automation、格式化或 package scripts。
- 不读无关文件。
- 不扩展到全局 selector 架构优化。
- 不提出 memo、selector、cache、state shape 或 component rewrite 方案。

状态只能用：仍成立、已修复、部分过期、非 03 归因、证据不足。
按 Subagent Output Contract 返回。
```

- [ ] **Step 2: Review the result**

Check that the subagent result:

- Explicitly compares the old issue assumption with current reducer-owned renderable live list behavior.
- Accounts for current turn live item filtering or `hasSurfaceContent` only if the code evidence shows it is in the audited 03 hot path.
- Uses one allowed status value.
- Does not include a repair plan.

- [ ] **Step 3: Update hot-path report**

Replace the `## 10 live slot selector cache invalidation` placeholder in `01-03-hot-paths.md` with the reviewed result.

## Task 5: Audit `03` `itemStarted` Dirtying Boundary

**Files:**
- Read: `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/03-item-started-dirties-transcript-state.md`
- Read: `codex-gui/src/features/transcriptState/transcriptStateSlice.ts`
- Modify: `docs/superpowers/reports/2026-07-09-codex-gui-03-performance-check/01-03-hot-paths.md`

- [ ] **Step 1: Dispatch subagent**

Prompt:

```text
只读审计切片：复核 `03-item-started-dirties-transcript-state` 的重复 itemStarted 窄边界。

范围只包括：
- docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/03-item-started-dirties-transcript-state.md
- codex-gui/src/features/transcriptState/transcriptStateSlice.ts

目标：
- 引用 issue 对首次 `itemStarted` 与重复 `itemStarted` 的区分。
- 用当前代码确认首次 `itemStarted(agentMessage)` 创建可见 live render state 是否属于 03 预期行为。
- 只复核已有 live item + 不同 commitId 重复 `itemStarted` 是否仍存在时间复杂度或 dirty state 边界。
- 按固定字段输出：关联 issue、触发源、触发频率、单次同步工作、规模变量、累计时间复杂度、03 归因、当前状态、证据路径/行号、排除项。

禁止：
- 不修复。
- 不运行测试、benchmark、profiling、browser automation、格式化或 package scripts。
- 不读无关文件。
- 不把首次 live slot 创建列为 finding。
- 不提出 reducer split、duplicate filtering、state shape 或 commit-window 改造方案。

状态只能用：仍成立、已修复、部分过期、非 03 归因、证据不足。
按 Subagent Output Contract 返回。
```

- [ ] **Step 2: Review the result**

Check that the subagent result:

- Does not classify first live item creation as a performance bug.
- Identifies the scale variable for any remaining dirty-state cost.
- Uses one allowed status value.
- Does not include a repair plan.

- [ ] **Step 3: Update hot-path report**

Replace the `## 03 itemStarted dirtying boundary` placeholder in `01-03-hot-paths.md` with the reviewed result.

## Task 6: Summary And Final Report Review

**Files:**
- Read: `docs/superpowers/reports/2026-07-09-codex-gui-03-performance-check/01-03-hot-paths.md`
- Modify: `docs/superpowers/reports/2026-07-09-codex-gui-03-performance-check/00-summary.md`

- [ ] **Step 1: Summarize statuses**

Read `01-03-hot-paths.md` and create a four-row status table with these columns:

- `Slice`: one of the four audited issue-mapped slice ids.
- `Status`: the exact allowed status value from that slice result.
- `03 attribution`: `confirmed`, `not 03`, or `evidence gap`.
- `Complexity summary`: one concise sentence derived from that slice's time-complexity fields.

Use only the status values present in the reviewed slice results.

- [ ] **Step 2: Update `00-summary.md`**

Replace the skeleton sections with final content:

- Keep the H1 `# Codex GUI 03 performance check summary`.
- Under `## 总体结论`, write one or two short paragraphs summarizing whether the four audited 03 direct hot paths have confirmed time-complexity risks.
- Under `## 切片索引`, paste the status table from Step 1.
- Under `## 当前 03 归因风险`, list only slices whose current status is `仍成立` and whose 03 attribution is confirmed; write `无` if there are none.
- Under `## 非 03 归因或排除项`, include these fixed exclusions:
  - `04-long-transcript-no-windowing.md`: excluded by design as global long-history DOM/windowing, not 03-specific.
  - `05-heroui-full-css-import.md`: excluded by design as CSS/bundle/loading, not this time-complexity hot path.
  - Rust projection, app-server v2 protocol, 04 thinking/tool/exec/MCP streaming, global virtualization, and generic React performance tuning are outside this report.
- Under `## 需要后续单独设计或计划的问题`, list confirmed risks or evidence gaps that require follow-up; write `无` if there are none.

The summary may say a follow-up needs separate design or planning. It must not describe concrete repair steps.

- [ ] **Step 3: Final report self-review**

Run read-only checks:

```bash
rg -n -e 'TO[D]O|TB[D]|FIX[M]E|待[定]|待[补]|pa[t]ch|改[成]|替换[为]|thro[t]tle|buf[f]er|ro[p]e|jo[i]n|virtuali[z]ation|修复[方]案|具体[修]复' docs/superpowers/reports/2026-07-09-codex-gui-03-performance-check
rg -n -e '仍成立|已修复|部分过期|非 03 归因|证据不足' docs/superpowers/reports/2026-07-09-codex-gui-03-performance-check
```

Expected:

- First command has no matches for placeholders or concrete repair language. If it flags harmless quoted issue text, remove or rephrase that report text.
- Second command shows only allowed status labels.

- [ ] **Step 4: Inspect final diff**

Run:

```bash
git diff -- docs/superpowers/reports/2026-07-09-codex-gui-03-performance-check
```

Expected:

- Only `00-summary.md` and `01-03-hot-paths.md` are created or modified.
- Reports contain audit conclusions and evidence only.
- Reports do not contain code fixes, test execution output, benchmark output, profiling output, or implementation plans.
