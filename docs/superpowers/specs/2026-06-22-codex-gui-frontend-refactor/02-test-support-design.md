# Test Support Refactor Design

日期: 2026-06-22
状态: 设计已确认
范围: `codex-gui` 前端大测试文件的测试 helper 拆分

## 目标

本阶段只做测试 helper 拆分。不改生产源码, 不改测试语义, 不新增覆盖, 不拆分测试文件。

目标是降低后续行为保持型源码重构时的测试噪声, 让大测试文件保留断言和测试流程, 把重复
builders、mock 对象和 test harness 放到就近测试 helper 文件中。

本阶段不做:

- 不改生产代码。
- 不改 fixture JSON 内容或 fixture 语义。
- 不新增测试场景。
- 不调整现有断言语义。
- 不按 `describe` 或主题拆分测试文件。
- 不创建全局 `src/testSupport`。
- 不把测试 helper 放入 feature 根目录。

## 切片顺序

本阶段分两个实现切片, 每个切片独立验证:

1. `transcriptStateSlice.test.ts` builders 拆分。
2. `guiHostClient.test.ts` test support 拆分。

该顺序与总设计保持一致: 先处理与 `01-transcript-state-design.md` 最相关且风险最低的测试
builders, 再处理更复杂的 WebSocket / JSON-RPC test support。

## Transcript state test builders

第一切片目标文件:

```text
codex-gui/src/features/transcriptState/__tests__/transcriptStateSlice.test.ts
```

新增测试 helper 文件:

```text
codex-gui/src/features/transcriptState/__tests__/transcriptStateTestBuilders.ts
```

该 helper 只负责构造测试 payload, 不拥有 fixture JSON。

### 抽出范围

从 `transcriptStateSlice.test.ts` 抽出 builders:

- `textInput`
- `imageInput`
- `userMessage`
- `agentMessage`
- `planItem`
- `sleepItem`
- `baseTurn`
- `attachWithTurns`
- `itemCompleted`
- `itemStarted`
- `turnStarted`
- `turnCompleted`

测试文件继续保留:

- `describe` / `it` 测试结构。
- fixture JSON imports。
- typed fixture constants, 例如 `attachBaseline`、`eventTurnStarted`、`eventItemCompleted`。
- 所有断言。

### Fixture 依赖方式

event builders 不在 helper 内 import fixture JSON。fixture 作为参数从测试文件传入。

目标调用形状:

```ts
itemCompleted(eventItemCompleted, "commit-id", "turn-id", item)
turnStarted(eventTurnStarted, "commit-id", turn)
```

理由:

- fixture owner 仍是测试文件。
- helper 只表达构造逻辑。
- 后续 fixture 替换或新增变体时, 不需要修改 helper 的 import 边界。

## Gui host client test support

第二切片目标文件:

```text
codex-gui/src/features/guiHost/guiHostClient.test.ts
```

新增测试 helper 文件:

```text
codex-gui/src/features/guiHost/__tests__/guiHostClientTestSupport.ts
```

该 helper 只负责测试支撑对象和连接驱动工具, 不拥有测试用例和 fixture imports。

### 抽出范围

从 `guiHostClient.test.ts` 抽出测试支撑对象:

- `MemoryStorage`
- `ThrowingSetItemStorage`
- `RecordingWebSocket`
- `readRpcRequest`
- `startConnectionUntilCommandsReady`

如果实现需要, 可同时抽出这些 helper 的局部类型:

- `SocketCloseEvent`
- `ParsedRpcRequest`

测试文件继续保留:

- `describe` / `it` 测试结构。
- fixture JSON imports。
- 测试断言。
- 每个测试显式表达的 handshake、command、error flow。

不拆 `guiHostClient.test.ts` 为多个测试文件。该阶段只降低 helper 噪声, 不改变测试组织边界。

## 文件放置

测试 helper 坚持测试目录内就近放置:

```text
codex-gui/src/features/transcriptState/__tests__/transcriptStateTestBuilders.ts
codex-gui/src/features/guiHost/__tests__/guiHostClientTestSupport.ts
```

这些 helper 属于测试边界, 不能从生产源码 import。

本阶段不创建:

```text
codex-gui/src/testSupport/
codex-gui/src/features/*/*TestSupport.ts
```

如果后续出现多个测试目录之间的真实共享需求, 必须重新做设计决策。

## 行为契约

拆分前后必须保持:

- 测试数量不变。
- 测试名称不变。
- fixture JSON import 语义不变。
- assertion payload 不变。
- reducer / client 行为不变。
- helper 抽出不改变 JSON-RPC id、request method、projection event payload 或 transcript test object shape。

本阶段的输出应表现为测试文件顶部 helper 代码减少, 测试主体更聚焦于行为流程和断言。

## 验证

第一切片最小验证:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm exec vitest --run src/features/transcriptState/__tests__/transcriptStateSlice.test.ts
```

第二切片最小验证:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm exec vitest --run src/features/guiHost/guiHostClient.test.ts
```

`02` 阶段完成后运行:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run type-check
```

本阶段不默认运行 browser 或 e2e, 因为不会触碰 App shell、用户行为边界或真实浏览器流程。

## 后续关系

`01-transcript-state-design.md` 的源码拆分不依赖本阶段先完成, 但本阶段的 transcript builders
拆分可以降低后续 reducer 测试维护噪声。

`03-gui-host-protocol-design.md` 会受益于 guiHost test support 拆分, 但不能把 protocol helper
源码拆分混入本阶段。

`04-app-shell-design.md` 仍是候选阶段, 不由本阶段触发。

## 决策记录

- 决策 1: 选择只做测试 helper 拆分。
- 决策 2: 选择先拆 `transcriptStateSlice.test.ts`。
- 决策 3: 选择 `__tests__/transcriptStateTestBuilders.ts`。
- 决策 4: 选择只抽 builders, 不抽 fixture 常量。
- 决策 5: 选择 fixture 作为参数传入 event builders。
- 决策 6: 选择将 `guiHostClient.test.ts` 纳入本阶段, 但作为第二切片。
- 决策 7: 选择 `__tests__/guiHostClientTestSupport.ts`, 只抽测试支撑对象。
- 决策 8: 选择按切片验证, 本设计文档单独提交。
