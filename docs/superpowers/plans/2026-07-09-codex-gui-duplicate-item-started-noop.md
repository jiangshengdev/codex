# Duplicate itemStarted No-op Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make duplicate live `itemStarted` events for an existing `turnId + item.id` a true no-op in `transcriptState`.

**Architecture:** Keep `ProjectionIngressAdapter` and `threadRuntime` unchanged. Add a narrow `transcriptState` guard before `recordAppliedEvent` so duplicate live `itemStarted` does not mutate the applied-event window or any renderable transcript state. After implementation and verification, update the linked issue status as the final step.

**Tech Stack:** Codex GUI, Redux Toolkit slice reducers, Vitest unit tests, fnm-backed `pnpm`.

---

## File Structure

- Modify: `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts`
  - Strengthen the existing duplicate started test so it proves duplicate live `itemStarted` preserves the exact `transcriptState` object identity.
- Modify: `codex-gui/src/features/transcriptState/transcriptStateSlice.ts`
  - Add a small live-slot existence helper and short-circuit duplicate live `itemStarted` before `recordAppliedEvent`.
- Modify last: `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/03-item-started-dirties-transcript-state.md`
  - Update status and fix record only after the code change is implemented and verified.

No new files are needed.

## Tooling Notes

Before running any `pnpm` command in `codex-gui`, use the user's fnm-managed toolchain:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
/opt/homebrew/bin/fnm exec --using-file pnpm --version
```

Expected: prints a pnpm version and does not resolve through `/Users/jiangsheng/.cache/codex-runtimes/`.

The relevant script exists in `codex-gui/package.json`:

```json
"test:unit": "vitest --run"
```

Use targeted Vitest commands for this narrow reducer change:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts
```

## Task 1: Add Failing Reducer Coverage

**Files:**
- Modify: `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts`

- [ ] **Step 1: Update the duplicate started test**

In `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts`, replace the body of the existing test named `"keeps itemStarted slot order stable and ignores duplicate live slot insertion"` with this body:

```ts
const store = makeStore();

store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
const firstItem = agentMessage("agent-slot-first", "First");
const secondItem = agentMessage("agent-slot-second", "Second");

store.dispatch(
  threadRuntimeEventBuffered({
    notification: itemStarted(
      eventItemStarted,
      "commit-slot-first",
      "turn-slot-order",
      firstItem,
    ),
    replay: "live",
  }),
);
const beforeDuplicateState = store.getState().transcriptState;

store.dispatch(
  threadRuntimeEventBuffered({
    notification: itemStarted(
      eventItemStarted,
      "commit-slot-first-duplicate-id",
      "turn-slot-order",
      agentMessage("agent-slot-first", "Updated initial"),
    ),
    replay: "live",
  }),
);

expect(store.getState().transcriptState).toBe(beforeDuplicateState);

store.dispatch(
  threadRuntimeEventBuffered({
    notification: itemStarted(
      eventItemStarted,
      "commit-slot-second",
      "turn-slot-order",
      secondItem,
    ),
    replay: "live",
  }),
);

expect(
  selectTranscriptLiveItemsForTurn(store.getState(), "turn-slot-order").map(
    (item) => item.itemId,
  ),
).toStrictEqual(["agent-slot-first", "agent-slot-second"]);
expect(
  selectTranscriptLiveItem(store.getState(), "turn-slot-order", "agent-slot-first"),
).toStrictEqual({
  key: "turn-slot-order:agent-slot-first",
  turnId: "turn-slot-order",
  itemId: "agent-slot-first",
  status: "started",
  initialItem: firstItem,
  transientText: "",
  revision: 0,
});
```

- [ ] **Step 2: Run the targeted test and confirm it fails**

Run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts
```

Expected: the test `"keeps itemStarted slot order stable and ignores duplicate live slot insertion"` fails at:

```ts
expect(store.getState().transcriptState).toBe(beforeDuplicateState);
```

The failure proves duplicate live `itemStarted` still mutates `transcriptState`.

## Task 2: Implement Duplicate live itemStarted No-op

**Files:**
- Modify: `codex-gui/src/features/transcriptState/transcriptStateSlice.ts`
- Test: `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts`

- [ ] **Step 1: Add a live-slot existence helper**

In `codex-gui/src/features/transcriptState/transcriptStateSlice.ts`, add this helper immediately after `ensureLiveItemsForTurn` and before `appendStartedLiveItem`:

```ts
const hasLiveItem = (state: TranscriptState, turnId: string, itemId: string): boolean =>
  state.liveItemIndexByKey[liveItemKey(turnId, itemId)] != null;
```

- [ ] **Step 2: Short-circuit duplicate live itemStarted before recording the event**

In the `threadRuntimeEventBuffered` reducer, keep the existing checks for `snapshotDuplicate`, `threadId`, and duplicate `commitId`. Then insert this block immediately before `recordAppliedEvent(state, notification.commitId);`:

```ts
if (notification.event.type === "itemStarted") {
  const { item, turnId } = notification.event.notification;
  if (hasLiveItem(state, turnId, item.id)) {
    return;
  }
}
```

The reducer should keep this order:

```ts
if (replay === "snapshotDuplicate") {
  return;
}

if (state.threadId !== notification.threadId) {
  return;
}

if (hasAppliedEvent(state, notification.commitId)) {
  return;
}

if (notification.event.type === "itemStarted") {
  const { item, turnId } = notification.event.notification;
  if (hasLiveItem(state, turnId, item.id)) {
    return;
  }
}

recordAppliedEvent(state, notification.commitId);
```

- [ ] **Step 3: Run the targeted transcriptState test**

Run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts
```

Expected: all tests in `transcriptStateLiveEvents.test.ts` pass.

- [ ] **Step 4: Run focused formatting and type checks**

Run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

Expected:

- `format:oxfmt` passes.
- `type-check` passes.

If `format:oxfmt` fails only because of formatting in touched files, run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt:fix
```

Then rerun:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts
```

Do not update the issue yet if verification is still failing.

## Task 3: Update Issue Status After Verification

**Files:**
- Modify: `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/03-item-started-dirties-transcript-state.md`

- [ ] **Step 1: Confirm Task 2 verification passed**

Before editing the issue, confirm these commands have passed in the same implementation run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

- [ ] **Step 2: Update the issue metadata and summary**

In `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/03-item-started-dirties-transcript-state.md`, update:

```markdown
状态: 🟡 部分过期，仍有窄边界
```

to:

```markdown
状态: ✅ 已修复
```

Update the summary to:

```markdown
首次 `itemStarted` 会创建 renderable live slot；重复 live slot 的 `itemStarted` 已收敛为真正 no-op。
```

- [ ] **Step 3: Add a fix record**

After the `## 判断` section and before `## 影响`, add:

```markdown
## 修复记录

2026-07-09: 重复 live `itemStarted` 在 `transcriptState` 内改为真正 no-op。若同一
`turnId + item.id` 已存在 live slot，reducer 会在写入 `appliedEventIdsById` /
`appliedEventOrder` 之前直接返回，不更新 live item，也不 dirty `transcriptState`。

验证:

- `/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts`
- `/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt`
- `/opt/homebrew/bin/fnm exec --using-file pnpm run type-check`
```

- [ ] **Step 4: Update judgment, impact, and follow-up text**

Replace the unresolved residual-boundary sentence in `## 判断` with:

```markdown
重复 live slot 的不同 `commitId` `itemStarted` 已按设计收敛为幂等 no-op。该 no-op
发生在写入 applied event window 之前，因此不会新增可渲染状态变化，也不会仅因内部去重窗口写入而
dirty `transcriptState`。
```

Replace the residual-impact sentence in `## 影响` with:

```markdown
重复 live slot 的不同 `commitId` `itemStarted` 不再改变 live slot、committed transcript 输出或
applied event window。
```

Replace `## 后续处理` with:

```markdown
## 后续处理

无当前前端后续处理。

如果未来真实观测到重复 `ServerNotification::ItemStarted` 且 payload 差异具有业务含义，应单独创建
上游生产链路 issue；本 issue 只覆盖 `transcriptState` 的前端幂等边界。
```

- [ ] **Step 5: Inspect the final diff**

Run:

```bash
cd /Users/jiangsheng/cnb/codex
git diff -- codex-gui/src/features/transcriptState/transcriptStateSlice.ts codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/03-item-started-dirties-transcript-state.md
```

Expected:

- Code diff only adds the duplicate live slot guard.
- Test diff proves duplicate live `itemStarted` preserves `transcriptState` identity.
- Issue diff is the final status update and includes the verification commands.

Do not stage or commit unless the user asks for that in the implementation round.

## Self-Review Notes

- Spec coverage: Task 1 covers the failing behavior; Task 2 implements the no-op boundary inside `transcriptState`; Task 3 updates the issue only after verification.
- No placeholder steps remain.
- The plan intentionally does not modify `ProjectionIngressAdapter`, `threadRuntime`, app-server, or core.
