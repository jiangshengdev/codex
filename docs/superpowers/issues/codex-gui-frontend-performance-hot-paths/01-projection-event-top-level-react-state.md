# Projection event 顶层 React state 热路径

日期:2026-06-23
状态:已修复
范围:`codex-gui/src/features/guiHost`, `codex-gui/src/features/appShell`, `codex-gui/src/App.tsx`

## 问题摘要

旧实现中, 每个 `thread/projection/event` 都会让 `guiHostClient` 递增 `eventCount` 并发出
`received event` 状态。`GuiHostConnectionBridge` 又把 `onStatus` 直接接到 `App` 顶层
`setStatus`, 导致每条 projection event 除了 Redux 更新外, 还额外触发顶层 React state 更新。

用户正在 composer 输入时, 后台持续收到 `itemStarted` / `itemCompleted` / `turnCompleted`
会带动 composer 反复重渲染。

## 原始证据

- `codex-gui/src/features/guiHost/guiHostClient.ts:343`
- `codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx:55`
- `codex-gui/src/App.tsx:7`
- `codex-gui/src/features/appShell/AppShell.tsx:18`
- `codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx:24`

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
