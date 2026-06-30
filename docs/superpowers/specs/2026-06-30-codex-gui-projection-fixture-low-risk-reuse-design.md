# codex-gui projection fixture 低风险复用设计

## 目标

第一批收敛 `codex-gui` 前端测试中仍手写的合法 projection payload，把低风险重复构造改为复用 `src/features/projection/__tests__/projectionFixtures.ts` 和 `src/features/projection/__tests__/projectionTestBuilders.ts`。

本设计只覆盖已经确认低风险的测试输入构造。不修改生产代码、不改变测试断言语义、不处理 e2e、不处理 attach metadata / thread id mismatch / `headCommitId` 等需要新增更宽 builder 的场景。

## 背景

`codex-gui/AGENTS.md` 已经新增测试固定装置规则：前端测试需要合法 projection 协议 payload 时，应优先使用共享 fixtures 和 builders，而不是手写协议对象。

当前代码里已有可复用入口：

- `projectionFixtures.ts` 提供 `attachBaseline`、`eventTurnStarted`、`eventTurnCompleted` 等 Rust-generated typed fixtures。
- `projectionTestBuilders.ts` 提供 `baseTurn`、`inProgressTurn`、`turnStarted`、`turnCompleted`、`itemStarted`、`itemCompleted` 等 builder。

本轮只处理这些已有 builder 能表达的重复：

- 手写 `ThreadProjectionEventNotification` 派生。
- 手写 `eventTurnStarted` 派生对象。
- `baseTurn(...)` 后手写 `status: "inProgress"` / `completedAt: null` / `durationMs: null`。

## 决策

采用“小步扩展 builder，再分批替换”的整体方向，但第一批不新增通用 deep override builder。当前已有 `inProgressTurn`、`turnStarted`、`turnCompleted` 足够覆盖本批范围。

第一批范围选择低风险直接替换：

- `codex-gui/src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts`
- `codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx`
- `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts`

## 设计

### 1. 复用 event builder

`threadRuntimeSlice.test.ts` 中的合法 projection event 派生应改为通过 `turnCompleted(...)` 和 `turnStarted(...)` builder 表达。

目标效果：

- 不在测试文件里展开 `ThreadProjectionEventNotification` 的完整 `event.notification.turn` 结构。
- 保留测试关心的字段，例如 `commitId`、`parentCommitId`、不同的 `turn.id`。
- 继续保留完整 expected state / buffer 断言，让 reducer 行为保持可读。

### 2. 复用 in-progress turn builder

`CommittedTranscriptSurface.browser.test.tsx` 和 `transcriptStateLiveEvents.test.ts` 中的 in-progress turn 构造应统一使用 `inProgressTurn(...)`。

目标效果：

- 不再在调用点写 `...baseTurn(...), status: "inProgress", completedAt: null, durationMs: null`。
- 当测试只关心 active turn / in-progress turn 时，调用点只暴露 turn id。
- 已有 completed turn 仍继续使用 `baseTurn(...)`，因为这类对象不属于本批问题。

### 3. 保持显式的内容

以下内容不纳入本批改造：

- malformed projection payload。
- JSON-RPC envelope。
- 出站 request 断言。
- UI / selector expected state。
- e2e fixture 派生。
- attach metadata、mismatched thread id、`headCommitId` 等更宽派生场景。

这些内容要么不是合法 projection 输入 payload，要么需要第二批单独设计 builder API。

## 风险

主要风险是把测试场景抽象得过度隐晦。第一批通过只使用已有 builder 控制风险：调用点仍显式传入 turn id、commit id 和 parent commit id。

另一个风险是 import 清理导致格式或 lint 变化。实现后应只格式化受影响文件，并通过 focused tests 验证。

## 验证

实现前必须在 `codex-gui` 下按项目规则初始化 fnm 环境，并确认 `pnpm` 没有命中 `/Users/jiangsheng/.cache/codex-runtimes/`。

本设计涉及的 `package.json` scripts 已确认存在：

- `test:unit`
- `test:browser`
- `type-check`

本批验证命令：

```sh
pnpm run test:unit -- src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts
pnpm run test:browser -- src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx
pnpm run type-check
```

