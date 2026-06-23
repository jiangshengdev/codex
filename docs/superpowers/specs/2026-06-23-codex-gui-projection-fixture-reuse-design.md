# codex-gui projection fixture 复用收敛设计

## 目标

收敛 `codex-gui/e2e` 和 `codex-gui/src` 前端测试中仍在手写的合法 projection/turn 测试数据，让这些数据优先从 `codex-gui/src/features/projection/__fixtures__` 的 typed 入口和 `projectionTestBuilders.ts` 派生。

本设计只覆盖测试数据构造方式。不修改生产逻辑、不改变测试断言语义、不移动或重新生成 Rust-generated JSON fixtures。

## 背景

当前测试已经通过以下测试专用入口复用 projection fixtures：

- `codex-gui/src/features/projection/__tests__/projectionFixtures.ts`
- `codex-gui/src/features/projection/__tests__/projectionTestBuilders.ts`

多数 projection 相关测试已经使用 `attachBaseline`、`eventTurnStarted`、`eventItemStarted`、`eventItemCompleted`、`eventTurnCompleted`、`closedBackpressure` 以及 `attachWithTurns`、`baseTurn`、`userMessage`、`agentMessage` 等 builder。

剩余问题不是缺少整体 fixture 入口，而是少量合法 payload 仍手写完整协议形状，尤其是：

- `codex-gui/e2e/app.spec.ts` 中手写 `turnStarted` projection event。
- 多个测试中重复手写 in-progress `Turn` 或 `TurnStartResponse`。

这些对象属于合法协议 payload，适合继续收敛到现有 fixture/builder 层，减少协议字段漂移风险。

## 设计原则

- 合法 projection payload 优先从 Rust-generated fixture 的 typed 入口派生。
- 测试专用 builder 只抽测试数据构造，不抽断言对象。
- 保留 e2e 和协议测试中用户可见或 wire-level contract 的显式断言。
- 保留 malformed payload 的手写形状，因为这些测试的目的就是验证非法输入被拒绝。
- 不扩大生产 API，不从生产 barrel 导出测试 fixture 或 builder。

## 设计

### 1. e2e projection event 派生

`codex-gui/e2e/app.spec.ts` 中的 active turn projection event 不再完整手写。

目标形态：

- 从 `@/features/projection/__tests__/projectionFixtures` 导入 `eventTurnStarted`。
- 基于 `eventTurnStarted` 派生 e2e 专用 event。
- 只覆盖 e2e 必需字段，例如 `subscriptionId`，以及测试明确依赖的 turn id。

这样 `threadId`、`commitId`、`parentCommitId`、`event.notification` 等合法 projection envelope 字段保持跟 Rust-generated fixture 同源。

### 2. in-progress turn builder

扩展 `codex-gui/src/features/projection/__tests__/projectionTestBuilders.ts`，新增一个窄 helper，用于生成测试中常见的 in-progress `Turn`。

建议形态：

```ts
export const inProgressTurn = (id: string): Turn => ({
  ...baseTurn(id, []),
  status: "inProgress",
  completedAt: null,
  durationMs: null,
});
```

如果调用点经常需要直接模拟 `turn/start` 返回值，可以在实现时比较两种选择：

- 只新增 `inProgressTurn(...)`，由调用点显式包装成 `{ turn: ... }`。
- 新增 `turnStartResponse(...)`，直接返回 `TurnStartResponse`。

默认优先 `inProgressTurn(...)`。它更小、更通用，也避免把 builder 绑定到 GUI host command response。

### 3. 调用点收敛范围

优先替换以下重复的合法 turn payload：

- `codex-gui/e2e/app.spec.ts` 中 `turn/start` mock response。
- `codex-gui/src/__tests__/appBrowserTestSupport.ts` 中 `createGuiHostCommands().startTurn` 默认 response。
- `codex-gui/src/features/guiHost/__tests__/guiHostClient.test.ts` 中 `TurnStartResponse`。
- `codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx` 中 pending send resolve response。

可选替换低风险局部手写：

- `codex-gui/src/features/snapshotReplay/__tests__/snapshotReplay.test.ts` 中手写 `Turn` 可用 `baseTurn` / `planItem` 表达时，可以顺手收敛。
- `codex-gui/src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts` 中不同 turn id 的 completed event，可在不降低可读性的前提下用现有 `turnCompleted(...)` builder 派生。

可选项不应扩大实现范围。如果替换让测试意图变得更隐晦，应保留现状。

## 明确不做

- 不抽象 `turn/start`、`turn/interrupt` 的出站 params 断言。
- 不抽象 `gui/authenticate`、`initialize`、`thread/projection/attach` 等 JSON-RPC envelope。
- 不把 malformed projection payload 改成合法 fixture 派生。
- 不移动 `codex-gui/src/features/projection/__fixtures__` 下的 JSON 文件。
- 不修改 Rust fixture 生成逻辑。
- 不新增生产导出入口。
- 不安装或引入新依赖。

## 保留显式手写的测试数据

以下数据应保持显式：

- e2e 中 `turn/start` 和 `turn/interrupt` outbound params 断言。
- GUI host client 测试中的 malformed attach/event/closed payload。
- JSON-RPC result/error envelope helper。
- UI/material/transcript 的完整期望对象。
- 布局压力测试中的长文本内容。

这些对象的测试价值来自可读的 wire contract、非法输入或具体 UI 结果；抽象成 fixture 会降低测试表达力。

## 风险

主要风险是过度抽象导致测试读者看不出当前场景正在模拟什么。实现时应保持 helper 粒度小，调用点仍保留关键字段，如 turn id、subscription id、输入文本和出站 params。

另一个风险是 e2e 模块解析边界。`e2e/app.spec.ts` 已经能导入 `@/features/projection/__tests__/projectionFixtures` 和 `projectionTestBuilders`，本设计不引入新的路径模式。

## 验证

实现后在 `codex-gui` 下运行：

```sh
pnpm run type-check
pnpm run test:unit
pnpm exec tsc -p e2e/tsconfig.json --noEmit
```

如果实际修改了 e2e 行为相关 helper，再运行：

```sh
pnpm run test:e2e
```

本工作不需要安装依赖。
