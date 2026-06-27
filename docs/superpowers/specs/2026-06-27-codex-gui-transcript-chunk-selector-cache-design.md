# codex-gui transcript chunk selector 缓存设计

## 背景

`CommittedTranscriptChunk` 目前按 chunk 独立订阅 Redux:

- 组件传入 `chunkId`。
- selector 调用 `selectTranscriptChunk(state, chunkId)`。
- equality function 比较 chunk metadata 和 entries 的 `id` / `revision`。

这个结构能阻止未变化 chunk 的 React 子树重渲染, 但不能阻止 store 更新时 selector 自身执行。当前 `selectTranscriptChunk` 每次调用都会创建新的 `TranscriptChunkView`, 并通过 `chunk.entryIds.flatMap(...)` 重新物化 `entries`。长会话中已挂载 chunk 数量增长后, 无关 store 更新也会反复扫描历史 chunk entries。

本设计只解决 selector view 重建热路径。不处理长 transcript 窗口化或渲染裁剪。

## 目标

- 当某个 transcript chunk 没有变化时, `selectTranscriptChunk` 返回稳定的 `TranscriptChunkView` 引用。
- 避免无关 store 更新导致该 chunk 重建 `entries`。
- 保持现有 `CommittedTranscriptChunk` 独立订阅结构。
- 不把派生 view 写入 Redux state。
- snapshot reattach 后不能复用旧 snapshot 的 chunk view。
- 用确定性的 selector/reducer 测试锁住引用稳定合同。

## 非目标

- 不做长 transcript 窗口化、渲染裁剪或 DOM 数量控制。
- 不改 transcript materialization 语义。
- 不改 projection event buffering、duplicate window 或 attach snapshot 语义。
- 不把 chunk 拆成 entry 级订阅。
- 不把 `TranscriptChunkView` 上提到 parent component 统一传参。
- 不引入新依赖。
- 不写性能计时测试或 benchmark。

## 已确认决策

主题: 缓存位置

A. 在 `transcriptStateSlice.ts` 的 selector 派生层维护私有缓存。

不采用组件实例级 selector 作为第一步。组件级缓存生命周期清楚, 但会把 `TranscriptChunkView` 派生策略放到 UI 层, 而公共 selector 直接调用时仍不稳定。

主题: 缓存 key

A. 使用 `TranscriptChunk` 对象身份作为 key, 并用 `chunk.revision` 作为失效条件。

不使用 `chunkId + revision`。snapshot rebuild 后可能出现相同 `chunkId` 和 `revision: 0`, 但内容来自新的 attach snapshot。对象身份能自然区分旧 snapshot 与新 snapshot。

主题: React 组件边界

A. 保留 `CommittedTranscriptChunk` 当前按 chunk 独立订阅的结构。

当前 equality function 可以先保留。缓存命中后 selector 返回相同引用, equality 会走快速引用相等路径。后续如果要移除 entries 扫描型 equality, 应作为单独小变更评估。

## 架构

在 `transcriptStateSlice.ts` 中新增模块私有缓存, 概念上形如:

```ts
WeakMap<TranscriptChunk, { revision: number; view: TranscriptChunkView }>
```

`selectTranscriptChunk` 的读取流程:

1. 根据 `chunkId` 从 `transcriptState.chunksById` 读取 chunk。
2. chunk 不存在时返回 `null`。
3. 查询缓存:
   - 如果存在缓存项, 且缓存项 `revision` 等于当前 `chunk.revision`, 返回缓存的 view。
   - 否则重新物化 `entries`, 创建新的 `TranscriptChunkView`, 写入缓存并返回。

缓存是派生数据, 不进入 Redux state。它不参与序列化、DevTools action history 或 reducer 更新逻辑。

## 失效语义

chunk view 只在对应 chunk 变化时失效。

会导致该 chunk view 失效的写路径:

- live committed entry append 到该 chunk, `chunk.revision` 递增。
- existing committed entry 被更新, entry revision 递增, 所属 chunk revision 递增。
- snapshot attach rebuild 创建新的 chunk 对象, 旧 WeakMap key 不会命中新对象。

不会导致该 chunk view 失效的写路径:

- 其他 turn/chunk 新增 committed entry。
- `itemStarted` 这类不产生 committed transcript entry 的事件。
- manual reconnect status 更新, 只要该 chunk 对象和 revision 不变。
- turn status 更新, 只要不修改该 chunk。

## 数据一致性

`TranscriptChunkView.entries` 来自 `chunk.entryIds` 和 `entriesById`。当前写路径在更新现有 entry 时会递增 entry revision, 并递增所属 chunk revision。因此以 chunk revision 作为 view 失效条件可以覆盖 entries 内容变化。

如果未来新增写路径能修改 `entriesById` 中某个 chunk entry, 必须同时递增所属 chunk revision。这个要求应视为 `TranscriptChunk` 的内部不变量。

## 内存行为

缓存使用 `WeakMap`。当 snapshot rebuild 或 thread 切换后, 旧 chunk 对象不再由 Redux state 持有时, 对应缓存项可被垃圾回收。

不使用普通 `Map` 的原因:

- 需要显式清理历史 chunk key。
- 同一个 `chunkId` 在不同 attach snapshot 中可重复出现。
- 只按 id/revision 命中存在陈旧 view 风险。

## 错误处理

selector 是纯读路径, 不引入用户可见错误状态。

防御行为保持简单:

- chunk 不存在时返回 `null`。
- entry id 在 `entriesById` 中缺失时继续按当前行为过滤掉缺失 entry。
- 不在 selector 中抛错或记录无界诊断信息。

## 测试设计

测试放在 `codex-gui/src/features/transcriptState/__tests__/transcriptStateSlice.test.ts`。

需要覆盖:

- 同一个 state 上重复调用 `selectTranscriptChunk(state, chunkId)` 返回同一引用。
- 不影响该 chunk 的 store 更新后, 再选择原 chunk 仍返回同一引用。
- 该 chunk 自身新增或更新 committed entry 后, selector 返回新引用, 且 revision / entries 内容正确。
- snapshot reattach 后, 即使 chunk id 和 revision 与旧 snapshot 相同, 也不复用旧 view。

不新增 browser test。这里要锁住的是 selector 引用和派生缓存合同, browser test 会更慢且更难稳定定位问题。

不新增 equality function 测试。现有 equality 测试覆盖的是 React render 判定, 不能证明 selector 不再重建 view。

## 验证

实现阶段应至少运行:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run test -- src/features/transcriptState/__tests__/transcriptStateSlice.test.ts
pnpm run type-check
```

如果实现触及 `CommittedTranscriptSurface` 或 equality 逻辑, 再运行相关 committed transcript surface 测试。

## 风险和取舍

### 模块私有缓存是隐藏状态

缓存不在 Redux state 中, 因此需要用引用稳定性测试覆盖其合同。这个取舍换来的是不复制派生数据、不污染 reducer state, 并避免 snapshot rebuild 后手动清理缓存。

### 仍会执行 selector 的 O(1) 查询

每次 store 更新仍会触发 mounted chunk 的 selector 入口, 但未变化 chunk 只做 chunk lookup、WeakMap lookup 和 revision 比较, 不再重建 entries 或扫描 entries。

### 不解决 DOM 规模问题

该设计不减少已渲染 DOM 节点数量。长 transcript 窗口化仍是独立问题, 但当前用户已明确先不做。

## 后续可选工作

- 评估是否可以移除或简化 `areTranscriptChunkViewsEqual` 中的 entries 扫描。
- 单独评估 `itemStarted` 是否应避免写入 `transcriptState` duplicate window。
- 单独设计长 transcript 窗口化或渲染裁剪。
