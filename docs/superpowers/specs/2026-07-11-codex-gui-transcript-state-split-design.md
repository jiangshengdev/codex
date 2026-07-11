# Codex GUI Transcript State 大文件拆分设计

## 背景

`codex-gui/.reports/large-files.md` 在 2026-07-11 的报告中显示：

- `src/features/transcriptState/transcriptStateSlice.ts` 为最大的 production 源码文件，共 666 行。
- `src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts` 为最大的测试文件，共 1594 行。

这两个文件围绕同一个 transcript state 领域，但都已经混合多类职责。上一批测试拆分把 live event 行为集中到一个文件后，虽然改善了旧文件的主题划分，却形成了新的单文件膨胀。本批应同时拆 production 边界和对应测试边界，避免只移动测试而继续保留实现侧的职责耦合。

## 目标

- 将 `transcriptStateSlice.ts` 收敛为 Redux slice 装配、action 路由、公开 selector 与兼容导出的入口。
- 将 transcript state 的领域模型、事件去重、live projection、committed projection 和 selector 缓存拆成职责明确的同目录模块。
- 将 `transcriptStateLiveEvents.test.ts` 按行为域拆成可独立定位失败原因的 sibling test files。
- 保持现有 production 行为、Redux state shape、action 输入、selector 输出和公开 import 入口不变。
- 保持 transcript chunk 级渲染性能边界，不引入 full-turn flatten、无界缓存或隐藏内容的全量物化。

## 非目标

- 不改变 transcript UI、文案、HeroUI 组件或 CSS。
- 不修改 `threadRuntimeSlice`、projection protocol 或 projection ingress 行为。
- 不重新设计 transcript state shape。
- 不改变 chunk 大小、event-id 去重窗口或滚动信号语义。
- 不顺带拆分报告中其他 source/test Top 10 文件。
- 不新增通用测试框架，也不把现有 projection fixtures 复制到 transcriptState 目录。
- 不建立新的 test-only production API。

## 已确认方案

采用“实现与测试同步按领域职责拆分”的方案。

未采用的替代方案：

- 只拆测试：改动最小，但无法降低 production 文件的职责密度，也会让测试边界继续与实现边界错位。
- 一次拆全部 Top 10：范围过大，多个 feature 之间没有共同的实现依赖，不适合作为单个可审查批次。

## Production 模块边界

### `transcriptStateModel.ts`

负责稳定的领域模型和状态初始化：

- `TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT`。
- `MAX_APPLIED_EVENT_ID_WINDOW_LENGTH`。
- `TranscriptTurn`、`TranscriptChunk`、`TranscriptEntry`、`TranscriptState` 等 transcript 领域类型。
- `initialTranscriptState`、`createEmptyTranscriptState` 和整体 state reset。

`transcriptEntryMaterialization.ts` 应从该模块导入 `TranscriptEntry`，消除它对 slice 装配文件的反向类型依赖。`transcriptStateSlice.ts` 继续 re-export 现有公开类型和常量，保持调用方 import 兼容。

### `transcriptEventDedup.ts`

负责有界 event-id 去重窗口：

- 查询 commit id 是否已经应用。
- 记录新 commit id。
- 超过 `MAX_APPLIED_EVENT_ID_WINDOW_LENGTH` 后按原顺序淘汰。

该模块只操作传入的 `TranscriptState`，不持有独立的全局状态。

### `transcriptLiveProjection.ts`

负责 live item 生命周期和 streaming delta：

- live item key 与索引维护。
- `itemStarted` slot 创建和重复 slot no-op。
- 单条 agent message delta 追加。
- 同 batch、同 item delta 合并，并保持 notification 顺序。
- completed item 的 slot 移除和后续索引修正。
- `liveScrollPulse` 的可见变化推进。
- live item 查询和稳定的空数组返回值。

`liveScrollPulse` 与 live item 变化保持在同一模块，避免把显示变化信号与实际状态更新拆开。

### `transcriptCommittedProjection.ts`

负责 committed transcript 投影：

- turn 创建与状态更新。
- leading prompt、middle entry、final assistant entry 分类。
- middle chunk 创建、容量限制和 revision 更新。
- completed item 的新增或更新。
- attach snapshot 重建。
- committed scroll commit key 更新所需的投影结果。

该模块继续调用已存在的 `materializeTranscriptItem`，不重复实现协议 item 到 transcript entry 的转换。

### `transcriptStateSelectors.ts`

负责依赖对象身份的 selector helper：

- transcript chunk view 的模块级 `WeakMap` 缓存。
- chunk revision 未变化时返回稳定 view。
- live item 和其他需要复用的查询 helper。

缓存仍以 `TranscriptChunk` 对象身份和 revision 为失效边界，不改成按 turn 汇总或全量重建。

### `transcriptStateSlice.ts`

拆分后只保留：

- `createAppSlice` 装配。
- `threadRuntimeAttached`、event、delta、reconnect action 的路由。
- slice selectors 的声明和公开导出。
- 对旧 import 路径所需类型、常量的 re-export。

`threadRuntimeEventBuffered` 的顺序语义必须保持：

1. 先忽略 `snapshotDuplicate`。
2. 再检查 thread id。
3. 再检查已应用 commit id。
4. 对重复 live `itemStarted` 在记录 commit id 之前返回。
5. 只有接受该事件后才记录 commit id 并执行事件投影。

这一顺序保证重复 `itemStarted` 是完整 state identity 不变的 no-op，同时不会占用 event-id 去重窗口。

## 测试文件边界

删除原 `transcriptStateLiveEvents.test.ts`，把原有 30 个测试完整迁移到以下 sibling files；迁移以保留现有断言为主，不借拆分机会弱化覆盖。

### `transcriptStateLiveStreaming.test.ts`

- slot 创建。
- 单条 delta 追加。
- batch delta 按 item 合并与隔离。
- 缺失 slot no-op。
- wrong-thread 和不支持 delta 过滤。

### `transcriptStateLiveItemLifecycle.test.ts`

- slot 顺序。
- 重复 `itemStarted` no-op。
- completed item 移除 slot。
- 移除后维护后续 item 索引。
- 未收到 start 的 completion。
- 空 completed assistant item 的清理行为。

### `transcriptStateLiveItemIndex.test.ts`

- stale live item index 查询。
- store-owned live item array 的引用语义。
- stale removal 不影响其他 live item。

该文件明确承载白盒不变量测试。允许直接构造 `TranscriptState` 并调用 `transcriptStateSlice.reducer`，但不为此增加新的 production helper。

### `transcriptStateScrollSignals.test.ts`

- attach 后的 committed scroll commit key。
- committed DOM 变化时推进 committed key。
- live assistant 可见变化时推进 live pulse。
- 非可见 item 不推进 pulse。

这些测试保留 started、delta、completed 的端到端序列，不拆成孤立 action 测试。

### `transcriptStateReplayDedup.test.ts`

- `snapshotDuplicate` replay 不修改 committed transcript 或 live slots。
- commit id 去重。

重复 live `itemStarted` 仍放在 lifecycle 文件，因为它验证的是 slot identity 和“记录 commit 前返回”的组合语义，不与普通 commit-id 去重合并成一个泛化测试。

### `transcriptStateCommittedProjection.test.ts`

- completed item 的物化和 committed 写入。
- turn terminal status。
- 空内容与非 chat item 过滤。
- existing entry、phase 和 chunk revision 更新。
- final assistant entry 更新。
- middle chunk 容量限制。

## 数据流

```text
threadRuntime action
  -> transcriptStateSlice.ts 路由与接受顺序
  -> transcriptEventDedup.ts 判断/记录 commit
  -> transcriptLiveProjection.ts 更新 live slots、delta、live pulse
  -> transcriptCommittedProjection.ts 更新 turn/chunk/entry、committed key
  -> transcriptStateSelectors.ts 按 chunk identity/revision 生成稳定 view
  -> 现有公开 selectors 返回给 UI
```

attach snapshot 直接进入 committed projection 重建状态；live event 按接受顺序进入去重和相应 projection；delta 不进入 commit-id 去重窗口，继续只更新已存在的 live item。

## 兼容性与性能约束

- Redux `TranscriptState` 字段名和嵌套 shape 不变。
- `transcriptStateSlice.ts` 的现有默认导出、selector 导出、常量导出和类型导入路径保持可用。
- `materializeTranscriptItem` 的输出语义不变。
- live delta batch 继续按同一 live item 合并一次，不能退化为每个 delta 逐次产生 revision 和 pulse。
- chunk selector 继续以 chunk 为缓存单位；禁止 flatten 全 turn entries。
- event-id 记录继续有 500 项硬上限，不引入无界集合。
- 不引入 React 组件变化，因此不需要新增 UI snapshot；现有 reducer/selector 单测是本批主要回归锁。

## 验证策略

执行计划必须先在 `codex-gui` 使用 fnm 管理的 Node/pnpm，并确认 `pnpm` 不来自 Codex runtime cache。命令以当前 `package.json` 已存在的 scripts 为准。

优先验证：

- 新拆分的 transcriptState 单测目录。
- `transcriptStateSnapshot.test.ts` 和 `transcriptStateSelectorCache.test.ts`，确认 snapshot 与 selector cache 未受模块移动影响。
- `pnpm run type-check`，确认 re-export 和循环依赖边界。
- `pnpm run format:oxfmt` 与 `pnpm run lint`。
- `pnpm run analyze:large-files`，只用于确认拆分结果；生成的 `.reports/` 保持为本地忽略文件，不纳入提交。

## 风险与控制

- **循环依赖：** 领域类型先移动到 `transcriptStateModel.ts`，materialization 与 projection 都只依赖 model；model 不依赖 slice 或 projection。
- **事件顺序变化：** slice 保留事件接受顺序，projection helper 不自行记录 commit id。
- **live/committed 边界模糊：** `itemCompleted` 由 slice 先调用 live slot 清理，再调用 committed projection；两个模块不互相调用。
- **缓存失效变化：** `WeakMap` 与 chunk view 构造整体移动，不改变 key、revision 比较或 view shape。
- **测试机械拆分遗漏：** 以原 30 个 test name 建立迁移清单，原文件删除前核对数量和断言覆盖。
- **文件再次膨胀：** production 新模块均应保持在 500 行以内；拆分后的单个测试文件目标不超过 600 行。

## 接受标准

- `transcriptStateSlice.ts` 只承担 Redux 装配、路由和兼容导出，不再内联 live/committed/dedup 实现。
- 所有新 production 模块少于 500 行，职责与依赖方向符合本设计。
- 原 `transcriptStateLiveEvents.test.ts` 被删除，30 个测试全部迁移且无重复、无遗漏。
- 拆分后的单个测试文件不超过 600 行。
- 现有 state shape、公开 selector、常量、类型和默认导出兼容。
- transcriptState 相关单测、type-check、format 和 lint 通过。
- 大文件报告中不再出现 666 行的原 slice 或 1594 行的原测试文件。

## 实施边界

本设计适合作为一个 implementation plan，但计划应按可独立验证的阶段执行：先建立 model 与兼容导出，再移动纯 projection helper，随后收敛 slice，最后按行为域迁移测试。任何需要修改 `threadRuntimeSlice`、协议 payload、UI 组件或 Redux state shape 的发现都视为扩大范围，必须停止并重新确认设计。
