# Codex GUI leading 消息位置实施计划

日期：2026-07-29

状态：已确认

对应设计：[Codex GUI 消息位置与 middle 稳定顺序设计](../../../../specs/2026/07/29/2026-07-29-codex-gui-message-placement-and-middle-order-design.md)

## 目标

仅修复 `leading`：由 `originalFirstItemId` 保留并识别原始首项；不可渲染 item 也占据首项事实，后续状态变化不得错误改变 leading prompt 的归属。

## 范围

生产代码仅允许修改：

- `codex-gui/src/features/transcriptState/transcriptStateModel.ts`
- `codex-gui/src/features/transcriptState/transcriptCommittedProjection.ts`
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts`

测试仅允许修改：

- `codex-gui/src/features/transcriptState/__tests__/transcriptStateSnapshot.test.ts`
- `codex-gui/src/features/transcriptState/__tests__/transcriptStateCommittedProjection.test.ts`

明确不修改 middle order、`liveProjection`、selectors、renderer、CSS 或协议；不新增 message-order 模块或兼容层。

预计总变更量为 70–110 changed lines，硬上限为 150 changed lines；超过上限立即停止并重新审查方案与范围。

## Task 1：以 originalFirstItemId 推导 leading prompt

1. 在 transcript state model 与 slice 中记录并保持 `originalFirstItemId`，确保其表达原始首条 item，而非当前投影中的首条 item。
2. 在 committed projection 中仅依据 `originalFirstItemId` 推导 leading prompt，不改变 middle 的排序与其他投影边界。
3. 复用两份既有测试，不新增测试文件，并覆盖以下最小正反例：
   - snapshot 首项是可渲染 user 时，该 user 为 leading；首项不可渲染或不是 user 时，后续 user 只能进入 middle。
   - realtime 首个 `itemStarted` 不是 user，以及首个 completed-without-started 不是 user 时，都阻止后续 user 补位；首个 completed item 是 user 时，该 user 仍为 leading。
4. 使用现有 fnm 管理的 Node/pnpm 入口执行以下验证：

   ```bash
   cd codex-gui
   /opt/homebrew/bin/fnm exec --using-file pnpm --version
   /opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt --write src/features/transcriptState/transcriptStateModel.ts src/features/transcriptState/transcriptCommittedProjection.ts src/features/transcriptState/transcriptStateSlice.ts src/features/transcriptState/__tests__/transcriptStateSnapshot.test.ts src/features/transcriptState/__tests__/transcriptStateCommittedProjection.test.ts
   /opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/transcriptState/__tests__/transcriptStateSnapshot.test.ts src/features/transcriptState/__tests__/transcriptStateCommittedProjection.test.ts
   /opt/homebrew/bin/fnm exec --using-file pnpm run type-check
   /opt/homebrew/bin/fnm exec --using-file pnpm run lint
   /opt/homebrew/bin/fnm exec --using-file pnpm run ci
   /opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
   git diff --check
   ```

5. 只暂存本 Task 的范围文件，检查 staged diff 后创建一个本地提交：

   ```text
   fix(gui): derive leading prompt from original first item
   ```

计划确认前不实施代码修改、验证、暂存或提交。
