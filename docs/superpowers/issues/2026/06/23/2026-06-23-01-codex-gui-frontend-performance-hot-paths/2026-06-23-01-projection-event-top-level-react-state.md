# Projection event 顶层 React state 热路径

日期: 2026-06-23
状态: ✅ 已修复
范围: `codex-gui/src/features/guiHost`, `codex-gui/src/features/appShell`, `codex-gui/src/App.tsx`
优先级: 未定

## 摘要

该顶层 React state 热路径已在 2026-06-28 修复，projection event 不再通过 lifecycle status 触发 `App` 顶层更新。

## 问题

旧实现中, 每个 `thread/projection/event` 都会让 `guiHostClient` 递增 `eventCount` 并发出
`received event` 状态。`GuiHostConnectionBridge` 又把 `onStatus` 直接接到 `App` 顶层
`setStatus`, 导致每条 projection event 除了 Redux 更新外, 还额外触发顶层 React state 更新。

用户正在 composer 输入时, 后台持续收到 `itemStarted` / `itemCompleted` / `turnCompleted`
会带动 composer 反复重渲染。

## 证据

2026-07-09 当前代码复核:

- `codex-gui/src/features/guiHost/guiHostClient.ts:340`: `thread/projection/event` 只调用 `onProjectionEvent?.(notification)`。
- `codex-gui/src/features/guiHost/guiHostClient.ts:366`: `thread/projection/closed` 只调用 `onProjectionClosed?.(notification)`。
- `codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx:131`: `onStatus` 仍只接入 lifecycle status。
- `codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx:156`: projection event 通过 `ProjectionIngressAdapter.handleEvent` 后进入 Redux outcome 路径。
- `codex-gui/src/App.tsx:11`: `App` 顶层仍保留 lifecycle `status` state，但当前 projection event 不再写入该 state。

历史修复前证据:

- `codex-gui/src/features/guiHost/guiHostClient.ts:343`
- `codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx:55`
- `codex-gui/src/App.tsx:7`
- `codex-gui/src/features/appShell/AppShell.tsx:18`
- `codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx:24`

## 判断

已修复。2026-07-09 复核确认 projection payload 继续通过 `onProjectionEvent` / `onProjectionClosed` 进入 Redux 路径，但不再额外推动顶层 lifecycle status。

## 修复记录

2026-06-28 已修复:

- `GuiHostStatus` 收窄为 lifecycle-only 状态。
- `thread/projection/event` 和 `thread/projection/closed` 不再通过 `onStatus` 推动 `App`
  顶层 React state 更新。
- projection payload 继续通过 `onProjectionEvent` / `onProjectionClosed` 进入
  `ProjectionIngressAdapter` 和 Redux 路径。

## 验证记录

当时验证通过:

- `pnpm run type-check`
- focused unit tests
- focused browser tests
- `pnpm run test:e2e -- e2e/app.spec.ts`
- `pnpm run format:prettier`
- `pnpm run lint`

## 影响

修复前会把高频 projection event 扩散到 `App` 顶层 React state，影响 composer 输入路径和 shell 子树渲染稳定性。修复后该风险已消除。

## 后续处理

无需继续处理该 issue。若未来恢复 projection event 到 lifecycle status，应重新进入复核。
