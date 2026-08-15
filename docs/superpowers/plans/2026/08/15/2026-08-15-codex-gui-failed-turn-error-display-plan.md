# Codex GUI 失败 turn 错误信息展示实施计划

状态：已确认

日期：2026-08-15

确认日期：2026-08-15

用户确认原文：`开始进行`

Task 1 测试 builder 范围补充：用户于 2026-08-15 明确确认。

对应设计：[Codex GUI 失败 turn 错误信息展示设计](../../../../specs/2026/08/15/2026-08-15-codex-gui-failed-turn-error-display-design.md)

设计确认：用户已明确确认目标，设计文档已于 2026-08-15 落盘。

本计划落盘不授权立即实现。用户明确确认本计划后，才进入实施阶段。

## 目标

只修改 Codex GUI 的 transcript 状态投影和 committed transcript 渲染，使失败 turn 的完整
`turn.error.message` 在对应 turn 尾部独立显示；顶部继续保留现有 `Failed` 状态。TUI、协议、
错误原文、turn 排序和其他 transcript 语义保持不变。

## 根因与最小实现 seam

当前协议 `Turn` 已携带 `error`，但 GUI 的 `TranscriptTurn` 只保存 `status`，且
`upsertTranscriptTurn` 没有复制 `turn.error`。渲染层只从 turn 状态生成顶部 `Chip`，没有错误
区域。因此实现边界为：

- `transcriptStateModel.ts`：为 `TranscriptTurn` / 对应 view 保存可选 turn 级错误；
- `transcriptStateImplementation.ts`：在 snapshot、turn started/completed 更新中维护 error；
- `transcriptStateSelectors.ts`：把 error 投影到 turn view，不把它伪装成 transcript entry；
- `CommittedTranscriptSurface.tsx`：顶部 `Chip` 保持不变，在 turn 内容末尾渲染 HeroUI v3
  `Alert status="danger"`；
- 现有 transcript state / surface 测试：覆盖恢复、失败、空错误、状态与错误分离及原文完整性。

不新增协议字段、不新增 transcript entry 类型、不把错误放入 middle chunk 或 final message 列表。

## 精确文件范围

允许修改：

- `docs/superpowers/specs/2026/08/15/2026-08-15-codex-gui-failed-turn-error-display-design.md`
- `docs/superpowers/plans/2026/08/15/2026-08-15-codex-gui-failed-turn-error-display-plan.md`
- `codex-gui/src/features/transcriptState/transcriptStateModel.ts`
- `codex-gui/src/features/transcriptState/transcriptStateImplementation.ts`
- `codex-gui/src/features/transcriptState/transcriptStateSelectors.ts`
- `codex-gui/src/features/projection/__tests__/projectionTestBuilders.ts`
- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx`
- 与上述状态或 surface 直接对应的现有测试文件。

若实现证明必须修改列表外文件，停止并回到计划确认；不得扩大到 Rust、协议生成、locale、全局 CSS
或其他 transcript renderer。

## 非目标与禁止范围

- 不修改 TUI 或 app-server 协议、schema、generated TypeScript 和 validator；
- 不解析、截断、脱敏、重写供应商错误字符串；
- 不把错误创建为新的 turn、assistant message 或普通 transcript entry；
- 不把错误合并进顶部 `Failed` Chip；
- 不新增重试、复制、折叠、菜单或其他错误操作；
- 不改变 turn 排序、middle chunk 计数、activity grouping、final answer 或 disclosure；
- 不通过 skip、ignore、放宽断言、删除覆盖或 CSS 隐藏来通过验证；
- 不安装依赖，不运行 Rust build/run，不操作 Git 远程。

## Task 0：确认并提交设计与计划文档

### 修改

- 计划获确认后，将本计划状态改为“已确认”，记录用户确认日期和原文；
- 将已确认设计文档补充“设计状态：已确认”（仅补充状态，不重写设计正文）；
- 不改变设计决策和计划任务范围。

### 验证与提交

```bash
git diff --check -- docs/superpowers/specs/2026/08/15/2026-08-15-codex-gui-failed-turn-error-display-design.md docs/superpowers/plans/2026/08/15/2026-08-15-codex-gui-failed-turn-error-display-plan.md
git add -- docs/superpowers/specs/2026/08/15/2026-08-15-codex-gui-failed-turn-error-display-design.md docs/superpowers/plans/2026/08/15/2026-08-15-codex-gui-failed-turn-error-display-plan.md
git diff --cached --check
git diff --cached
git commit -m 'docs(gui): design failed turn error display'
```

暂存文件必须仅为上述两份设计/计划文档。

## Task 1：保存 turn 级错误并投影到 GUI turn view

### 修改

- 在 `TranscriptTurn` 及对应 view 增加可选错误字段，优先复用协议错误类型的稳定消息字段；
- `upsertTranscriptTurn` 同步写入 `turn.error`，错误为空时清除旧值；
- snapshot 重建、实时 turn completed、重复事件和重连恢复共用同一 turn owner；
- 保持错误不进入 `entriesById`、chunk、final assistant entry 或 activity group；
- 只增加失败/空错误/正常完成/中断的必要状态测试，不添加被移除逻辑的负向测试。

### 验证与提交

在 `codex-gui` 使用项目规定的 fnm-backed pnpm 命令运行受影响的 lint、type-check 和 transcript
测试；必要时先运行对应的 scoped 测试，再运行 Browser surface 测试。

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run lint
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

只暂存状态模型、实现、selector 及其对应测试文件，检查 staged diff 后提交：

```bash
git add -- codex-gui/src/features/transcriptState/transcriptStateModel.ts codex-gui/src/features/transcriptState/transcriptStateImplementation.ts codex-gui/src/features/transcriptState/transcriptStateSelectors.ts codex-gui/src/features/transcriptState/__tests__
git diff --cached --check
git diff --cached
git commit -m 'feat(gui): retain failed turn errors'
```

实际暂存时必须收窄到本任务确实修改的文件，不得把整个测试目录无条件加入。

## Task 2：在 turn 尾部渲染独立错误 Alert

### 修改

- `CommittedTranscriptTurn` 顶部继续使用现有 `Chip` 渲染 `Failed`；
- 在现有 turn 内容之后追加独立错误 renderer；
- 使用 HeroUI v3 `Alert status="danger"`、`Alert.Indicator`、`Alert.Content`、
  `Alert.Title` 和 `Alert.Description`；
- `Alert.Description` 以保留换行、可断词的纯文本显示完整原始错误；
- 空 error 不渲染 Alert，错误不变成 assistant 消息或独立 turn；
- 添加/更新 Browser 或 snapshot 覆盖：顶部状态、尾部 Alert、长 403 原文、URL/request id、
  顺序和重复事件不重复显示；不锁定 padding、gap、颜色、阴影等主观样式数值。

### 验证与提交

在 `codex-gui` 运行格式化、lint、类型检查和受影响的 Browser 测试；使用现有 Browser Mode
分区与精确 accessible-name/文本断言，不放宽既有检查。

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt --write <实际修改的 TS/TSX 文件>
/opt/homebrew/bin/fnm exec --using-file pnpm run lint
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:parallel -- <实际受影响的 Browser 测试文件>
```

只暂存 renderer 和对应测试文件，检查 staged diff 后提交：

```bash
git add -- codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx <实际受影响的测试文件>
git diff --cached --check
git diff --cached
git commit -m 'feat(gui): display failed turn errors'
```

## 最终完成条件

- Task 0、Task 1、Task 2 各自形成独立本地提交；
- GUI 从历史 snapshot 和实时完成事件都能恢复同一 turn 的完整错误；
- `Failed` 仍在 turn 顶部，错误 Alert 独立位于该 turn 内容末尾；
- 错误原文中的 403、额度、request id、URL 和换行均保留；
- TUI、协议、turn 排序、chunk/disclosure/activity 语义没有变化；
- 计划内格式、lint、type-check 和受影响 Browser 测试通过；
- 最终 workspace 不包含本任务遗留的未暂存或未提交变更，且没有执行 Git 远程操作。
