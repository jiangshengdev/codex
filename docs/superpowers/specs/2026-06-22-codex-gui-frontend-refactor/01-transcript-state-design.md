# Transcript State Refactor Design

日期: 2026-06-22
状态: 设计已确认
范围: `codex-gui/src/features/transcriptState/transcriptStateSlice.ts`

## 目标

本阶段只设计 `transcriptStateSlice.ts` 的源码拆分, 不拆测试 helper, 不改变 transcript 行为。

目标是把协议 item 到 committed transcript entry 的 materialization 逻辑从 Redux slice 中拆出,
让 slice 更专注于状态写入、chunk 管理、selectors 和 runtime action handling。

本阶段不做:

- 不改变 `TranscriptState` 状态形状。
- 不移动 `TranscriptEntry`、`TranscriptTurn`、`TranscriptChunk` 等类型。
- 不抽 chunking helper。
- 不拆 `transcriptStateSlice.test.ts` helper。
- 不新增独立 materialization 测试。
- 不改变 snapshot rebuild、live `itemCompleted`、commit 去重或 manual reconnect 行为。

## 当前边界

`transcriptStateSlice.ts` 当前同时负责:

- transcript state 类型定义。
- 初始状态和 reset。
- applied event id 窗口。
- turn upsert。
- `ThreadItem` / `UserInput` 到 `TranscriptEntry` 的 materialization。
- chunk 创建、append、live upsert。
- snapshot rebuild。
- Redux slice、selectors 和 extra reducers。

本阶段只拆 materialization 边界:

```text
textFromUserInput(input: UserInput): string
materializeItem(item: ThreadItem, turnId: string): TranscriptEntry | null
```

## 目标模块

新增同 feature 目录模块:

```text
codex-gui/src/features/transcriptState/transcriptEntryMaterialization.ts
```

该模块导出一个生产函数:

```ts
export const materializeTranscriptItem: (
  item: ThreadItem,
  turnId: string,
) => TranscriptEntry | null;
```

`textFromUserInput` 留作该模块私有 helper, 不导出。

`transcriptStateSlice.ts` 改为 import:

```ts
import { materializeTranscriptItem } from "./transcriptEntryMaterialization";
```

并把原本调用 `materializeItem(...)` 的位置改为调用 `materializeTranscriptItem(...)`。

## 类型放置

`TranscriptEntry` 暂时继续定义在 `transcriptStateSlice.ts`。

`transcriptEntryMaterialization.ts` 使用 type-only import:

```ts
import type { TranscriptEntry } from "./transcriptStateSlice";
```

理由:

- 本阶段目标是小步拆分 materialization, 不扩大 diff。
- `TranscriptEntry` 仍是 transcript state 的公开 selector 返回类型, 暂留 slice 最小扰动。
- 如果后续 chunking 或更多 transcript helper 也拆出, 再重新评估是否建立 `transcriptTypes.ts`。

## 行为契约

拆分后必须保持现有 materialization 语义:

- `userMessage` 只拼接 `text` input。
- `image`、`localImage`、`skill`、`mention` input 继续贡献空字符串。
- 空 user message 返回 `null`。
- 空 agent message 返回 `null`。
- agent message 继续产生 `role: "assistant"`、`sourceKind: "plainText"`、`revision: 0`。
- user message 继续产生 `role: "user"`、`sourceKind: "plainText"`、`revision: 0`。
- 非聊天 `ThreadItem` 继续返回 `null`。
- `ThreadItem` 和 `UserInput` switch 继续保持 exhaustive check。

本阶段不收紧或放宽协议 item 过滤规则。

## 测试策略

不新增 `transcriptEntryMaterialization.test.ts`。

理由:

- 本阶段是行为保持型搬迁。
- 现有 `transcriptStateSlice.test.ts` 已覆盖 snapshot rebuild 和 live `itemCompleted` 两条调用路径。
- 现有测试已覆盖文本拼接、非文本 input 过滤、空消息过滤、非聊天 item 过滤和 `sleep` item 过滤。
- 新增独立测试会要求扩大纯函数测试 API 面, 与本阶段小步目标不匹配。

如果实现中发现需要导出更多 helper 才能保持清晰, 必须回到设计决策, 不在实现中顺手扩大测试 API。

## 验证

实现阶段的最小验证命令:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm exec vitest --run src/features/transcriptState/__tests__/transcriptStateSlice.test.ts
pnpm run type-check
```

目标 reducer 测试用于锁定行为, `type-check` 用于锁定新模块 import/export 和协议 union exhaustive check。

本阶段不默认运行 browser 或 e2e, 因为不会触碰 UI shell、用户行为边界或真实 WebSocket payload。

## 后续关系

`02-test-support-design.md` 将单独决定是否拆 `transcriptStateSlice.test.ts` 中的 builders 和 fixture helper。

`03-gui-host-protocol-design.md` 不依赖本阶段实现。

`04-app-shell-design.md` 暂为候选阶段, 不受本阶段直接影响。

## 决策记录

- 决策 1: 选择只做 `transcriptStateSlice.ts` 源码拆分设计。
- 决策 2: 选择先抽 materialization。
- 决策 3: 选择 `TranscriptEntry` 暂留 slice, 新模块 type import。
- 决策 4: 选择不新增独立测试, 复用现有 reducer 测试。
- 决策 5: 选择目标 reducer 测试加 `type-check`。
- 决策 6: 选择写入并提交。
