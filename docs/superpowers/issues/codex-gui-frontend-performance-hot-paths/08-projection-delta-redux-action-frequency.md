# Projection delta Redux action 频率热路径

日期:2026-07-06
状态:未修复
范围:`codex-gui/src/features/transcriptState`

## 问题摘要

`thread/projection/delta` 已接入 GUI 后, 每个 transient agent message delta 都会作为一次
Redux action 进入 `transcriptState`:

```ts
.addCase(threadRuntimeDeltaAccepted, (state, action) => {
  const { notification } = action.payload;
  if (state.threadId !== notification.threadId) {
    return;
  }

  switch (notification.delta.type) {
    case "agentMessage": {
      const { turnId, itemId, delta } = notification.delta.notification;
      appendAgentMessageDeltaToLiveSlot(state, turnId, itemId, delta);
      return;
    }
  }
})
```

如果后端按 token 或小 chunk 高频发送 delta, 前端会对每个 delta 执行一次 Redux dispatch、
一次 Immer reducer 写入和一次 store subscription 通知。即使实际 UI 只需要按帧刷新, 当前链路也会把
渲染数据更新频率绑定到网络 delta 频率。

## 原始证据

- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:590`
- `codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx:62`
- `codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts:123`

## 当前判断

`threadRuntimeSlice.ts` 的 `threadRuntimeDeltaAccepted` 自身不改 runtime buffer, 只是跨 slice
信号。真正的高频状态写入发生在 `transcriptStateSlice.ts`。

## 建议方向

1. 不要把每个 delta 都直接落进 Redux 状态并触发 React 订阅链路。
2. 评估在 Redux 外做 live text buffer, 再按帧或节流批量提交可渲染状态。
3. 保持 `itemStarted -> delta -> itemCompleted` 的语义边界: event 建 slot, delta 更新临时文本,
   completed item 仍是最终权威内容。
