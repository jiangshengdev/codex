# Live streaming, input, and scroll audit

## 审计范围

- live text accumulation。
- live markdown consumption。
- composer/input 更新扩散。
- sticky-bottom、scroll pulse 和 surface content detection。

## Live streaming text

### 审计条目：projection delta transient text accumulation

## 结论

`09-projection-delta-transient-text-concat.md` 在 live streaming text 边界下仍成立。文本累积成本来自 reducer 写入侧，当前仍有 batch 内 `bucket.delta += delta` 和每 bucket 一次 `item.transientText += delta`。本条与 markdown consumption 成本分开判断。

## 审计字段

- 关联 issue: `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/09-projection-delta-transient-text-concat.md`
- 触发源: accepted projection delta batch 进入 `threadRuntimeDeltasAccepted` 后更新 live `agentMessage`
- 触发频率: batch flush 次数 `F`；batch 内 raw delta 数 `D_f`；受影响 live item bucket 数 `K_f`
- 单次同步工作: 遍历 batch notifications；按 `liveItemKey` 聚合 bucket；bucket 内字符串追加；每 bucket 查找 live item、追加 `transientText`、递增 `revision`、bump `liveScrollPulse`
- 规模变量: delta count、batch size、accumulated live text length、bucket delta length、live item buckets、live render frequency
- 累计复杂度: reducer batch 聚合为 `O(D_f)`；text accumulation 额外受 bucket 字符串长度和既有 `transientText` 长度影响
- 复杂度优先级: P1
- 当前状态: 已有 issue 仍成立

## 关键证据路径/行号

- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:74`: live item 结构包含 `transientText` 与 `revision`。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:94`: state 直接保存 `liveItemsByTurnId`。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:271`: `item.transientText += delta`。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:273`: 每次 append 递增 `revision`。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:274`: 每次 append 调用 `bumpLiveScrollPulse`。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:315`: batch reducer 遍历 `notifications`。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:323`: delta 按 live item key 聚合。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:330`: bucket 内仍执行字符串累加。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:336`: 每 bucket 才进入 live item 查找与 append。
- `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/09-projection-delta-transient-text-concat.md:26`: issue 明确 text accumulation 与 markdown rendering 分开。

## 已排除项

- 不把 `LiveMarkdownText` / `Streamdown` 的 markdown consumption 计入 `09` 的 text accumulation 成本。
- 不作 browser layout、paint、FPS 或视觉流畅度 claim。

## 风险

静态证据能确认 reducer 写入侧复杂度边界，但不能确认实际 batch 分布、真实 render 次数或 runtime cost。

## 报告建议

`09` 保留为 P1，状态为 `已有 issue 仍成立`，并明确只覆盖 text accumulation。

### 审计条目：live markdown source consumption and live item scans

## 结论

`08` 的旧“每个 delta 一次 Redux action/subscription”不在本条重复归因；当前 live-streaming-text 边界保留 batch reducer `O(D_f)` 聚合事实。`10` 的旧 selector cache / read-time materialization 已修复；当前只记录 live consumption `.some()` / `.filter()` 扫描和 full `source` markdown consumption 边界。

## 审计字段

- 关联 issue: `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/08-projection-delta-redux-action-frequency.md`; `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/10-live-slot-selector-cache-invalidation.md`
- 触发源: related live item state update 后 React 消费 `item.transientText` 并交给 `LiveMarkdownText`
- 触发频率: live markdown render frequency；current turn live item scans；surface content detection render frequency
- 单次同步工作: live consumption scan 为 `O(N_t)`；surface 判空最坏随 `T` 与各 turn live items 增长；markdown consumption 按每次 render 的完整 `source` 消费
- 规模变量: current turn live items、turn count、markdown source length、live render frequency
- 累计复杂度: markdown consumption 按每次 render 的完整 `M_i` source 消费，独立于 text accumulation；live consumption scan 为 current render path 的线性扫描边界
- 复杂度优先级: P2
- 当前状态: 已有 issue 仍成立

## 关键证据路径/行号

- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:565`: selector 直接返回 live item array 或空数组。
- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx:195`: live entry 把 `item.transientText` 传给 `LiveMarkdownText`。
- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx:205`: live assistant items 使用 `.filter`。
- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx:228`: turn 判空使用 `.some`。
- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx:268`: surface 判空扫描 turns。
- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx:276`: surface 判空中再次扫描 live items。
- `codex-gui/src/features/committedTranscriptSurface/LiveMarkdownText.tsx:21`: live markdown 使用 `mode="streaming"`。
- `codex-gui/src/features/committedTranscriptSurface/LiveMarkdownText.tsx:26`: `source` 作为 `Streamdown` children 消费。
- `codex-gui/src/features/committedTranscriptSurface/MarkdownText.tsx:19`: committed markdown 使用 `mode="static"`，与 live streaming render 边界不同。
- `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/10-live-slot-selector-cache-invalidation.md:54`: 旧 read-time materialization 已消除。

## 已排除项

- 不把旧 `selectCachedLiveItemsForTurn` / `liveTurn.revision` / `slotKeys` / `slotRevisions` 形态继续作为当前 `10` finding。
- 不复用 projection-ingest 的 action/subscription 频率结论。

## 风险

该条只记录源码消费边界；没有实际 markdown parser cost、paint 或 frame timing 量化。

## 报告建议

`08` 在本文件中只作为 batch reducer/live text 前置边界引用；`10` 拆成旧 selector cache 已修复、当前 live consumption scan 仍有 P2 边界。

## Composer/input

## 结论

`composer-input` 本轮未发现新的可归因 hot path。`01-projection-event-top-level-react-state.md` 作为历史输入 fanout 证据仍有效，但当前已修复：允许文件内没有证据表明 background projection/transcript 更新会继续通过 `App` 顶层 state dirty 整个 mounted shell subtree，composer 本地 `draft/isSending` 也只由输入、发送流程和 composition 事件更新。

## 审计字段

- 关联 issue: `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/01-projection-event-top-level-react-state.md`
- 触发源: 历史上为 `thread/projection/event` 推动顶层 lifecycle status；当前 composer 侧为输入事件、composition 事件、发送/停止操作，以及少量 thread runtime/identity selector 值变化
- 触发频率: 历史为 `O(projection events)`；当前 composer 本地状态为 `O(input events)` / `O(send attempts)`；selector 驱动为 `O(selected runtime/identity value changes)`
- 单次同步工作: composer render 重新计算 `connectionUsable`、`sendEnabled`、`stopEnabled`，并重建事件 handler 闭包；未见 transcript payload 进入 composer model
- 规模变量: projection events、store updates、composer state changes、mounted shell subtree、input events、selected runtime/identity values
- 累计复杂度: 历史 issue 为 `O(projection events * mounted shell subtree)`；当前允许证据下为 `O(input events + selected runtime/identity value changes)`
- 复杂度优先级: 非 finding
- 当前状态: 已修复

## 关键证据路径/行号

- `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/01-projection-event-top-level-react-state.md:14`-`19`: 记录历史 fanout。
- `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/01-projection-event-top-level-react-state.md:23`-`29`: 记录 projection event 不再写入顶层 lifecycle status。
- `codex-gui/src/App.tsx:10`-`24`: 顶层只持有 `status`、`commands`、`launchParams` 并传给 `AppShell`。
- `codex-gui/src/features/appShell/AppShell.tsx:50`-`83`: shell 挂载 transcript sibling 与 `ComposerTurnControl`；composer 只接收 `status/commands/launchParams` 派生 props。
- `codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx:38`-`47`: composer 本地 state 是 `draft/isSending`，store 订阅仅限 thread identity/runtime selector。
- `codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx:69`-`90`: submit/composition/keydown/change 路径更新本地 draft/input state。
- `codex-gui/src/features/composerTurnControl/composerTurnControlModel.ts:16`-`45`: composer model 只依赖 connection、active turn、draft、isSending；未见 transcript 内容规模进入模型计算。

## 已排除项

- 未检查 live text accumulation、scroll/sticky-bottom 路径。
- 未把 `01` 当作当前待修 issue，只作为历史 fanout 证据重新校准。
- 未发现 transcript sibling 的更新通过 props 直接 dirty composer state 或 input handlers。

## 风险

本切片未读取 `GuiHostConnectionBridge`、Redux slices 或 selector 实现；因此无法逐类证明每个 projection event 是否会改变 `activeTurnId/subscriptionState/threadId/canAdvanceThreadIdentity`。当前结论只覆盖允许文件内可见的 composer coupling 和 `01` 已记录的历史修复状态。

## 报告建议

保留 `01` 的“已修复”状态。把它作为历史输入 fanout 的已修复基线，不新增 `composer-input` finding。

## Scroll/sticky-bottom/layout

## 结论

已有 issue 仍成立。源码显示 sticky-bottom 已通过 `liveScrollPulse` / `committedScrollCommitKey` 触发，但在 pinned 状态下每次触发都会在 `useLayoutEffect` 内读取 `scrollHeight` 并调用 `scrollTo`。这是源代码层面的高频布局相关同步操作；本轮没有做 browser layout/paint/FPS 测量，因此不能声明实际帧率或重排耗时。

## 审计字段

- 关联 issue: scroll-sticky-bottom-layout
- 触发源: agent message started、agent message delta / delta batch bucket、agent message removed、snapshot attach、itemCompleted committed entry
- 触发频率: `liveScrollPulse` 随 live 更新递增；单 delta 路径每次 accepted delta 触发一次，batch 路径按同一 batch 内的 live item bucket 触发；commit key 在 attach 和 committed item 完成时触发
- 单次同步工作: sticky-bottom 路径为 `O(1)` JS，但包含 `document.scrollingElement.scrollHeight` 读取和 `scrollTo`；surface content detection 最坏扫描 turns 和各 turn live items；渲染路径会 map mounted turn/status/chunk/entry/live-item lists
- 规模变量: live updates、turns、chunks、entries、surface live items、mounted DOM-facing lists、scroll events
- 累计复杂度: sticky-bottom 累计为 `O(live updates + committed scroll commits)` 次布局相关触发；surface content detection 最坏 `O(turns + scanned live items)` / render；mounted list render 最坏 `O(status + turns + visible chunks + visible entries + live items)`
- 复杂度优先级: P2
- 当前状态: 已有 issue 仍成立

## 关键证据路径/行号

- `codex-gui/src/features/appShell/useCommittedTranscriptStickyBottom.ts:13`: 定义 `scrollDocumentToBottom`，读取 scroller 并调用 `scrollTo({ top: scroller.scrollHeight })`。
- `codex-gui/src/features/appShell/useCommittedTranscriptStickyBottom.ts:21`-`22`: 订阅 `selectCommittedTranscriptScrollCommitKey` 和 `selectTranscriptLiveScrollPulse`。
- `codex-gui/src/features/appShell/useCommittedTranscriptStickyBottom.ts:43`-`47`: 在 `useLayoutEffect` 中按 `[liveScrollPulse, scrollCommitKey]` 触发 auto-scroll。
- `codex-gui/src/features/appShell/AppShell.tsx:51`-`76`: 将 sticky-bottom sentinel 放在 transcript surface 后、composer 前。
- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx:205`-`215`: 对 live items 先 `filter` 再 `map`。
- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx:228`-`233`: 每个 mounted turn 用 `liveItems.some` 参与 content detection。
- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx:268`-`279`: surface-level `hasSurfaceContent` 对 `turnIds` 做 `some`，并可能检查每个 turn 的 live items。
- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx:286`-`316`: status list 和 turn list 直接 map 到 mounted DOM-facing lists。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:183`-`185`: 定义 `bumpLiveScrollPulse`。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:240`-`242`: agent message started 触发 live scroll pulse。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:266`-`275`: accepted delta 更新触发 live scroll pulse。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:336`-`340`: batch delta 按 bucket 应用并触发 pulse。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:365`-`367`: 移除 agent live item 时触发 pulse。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:501`: 设置 committed scroll commit key。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:619`: 设置 committed scroll commit key。

## 已排除项

- 未检查 live text accumulation 的具体实现链路；只把 accepted delta 作为 scroll pulse 触发源命名。
- 未检查 composer/input 路径；只确认 `AppShell` 中 sentinel 位于 transcript surface 和 `ComposerTurnControl` 之间。
- 未做 browser automation、profiling、FPS、paint 或 layout measurement，因此没有实际渲染耗时结论。

## 风险

- pinned 状态下，高频 live updates 会持续触发 `useLayoutEffect` 中的 document scroll 操作，源码层面存在布局相关同步工作的累积风险。
- `hasSurfaceContent` 与 per-turn live assistant detection 都依赖 list scans；turns 或 surface live items 增长时，render 期同步工作会随规模增长。
- 当前证据只能证明源码路径和复杂度形态，不能证明用户可见卡顿、paint 抖动或 FPS 下降。

## 报告建议

记录为 P2、当前状态为“已有 issue 仍成立”。报告中应明确区分：本轮发现的是源代码层面的 `O(live updates + commits)` auto-scroll 触发和 `O(turns/live items/mounted lists)` 同步扫描，不包含浏览器布局、绘制或 FPS 实测结论。
