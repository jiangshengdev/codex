# 04 Timeline Materials 与领域模型

状态：完成

## 审计范围

状态：完成。

计划范围：snapshot replay、live event handling、timeline selector/material 与 Turn/item 领域转换。

## 范围交界

状态：完成。

- 允许交界：projection accepted event、transcript projection input。
- 禁止扩张：Redux state 内部、React rendering。

## 审计进度

| 微阶段 | 状态 | 压缩结论 | Finding ID / 覆盖状态 | 关键证据 |
| --- | --- | --- | --- | --- |
| 报告审计 | 完成 | snapshot/live materials、组合 selector、production action path 与 UI selector path 均已核对。 | RA-04-001 | 本报告 Findings、已排除项与风险 |
| R04-SNAPSHOT（依赖 `SCAFFOLD-COMMITTED`） | `stop-split-required` | snapshot 构造器与本地类型职责集中，但完整 `Turn.items` 与逐项 `itemReplayed` 形成重复表示。 | 被 RA-04-001 覆盖 | `snapshotReplay.ts:8-29,54-97`；`snapshotReplay.test.ts:57-212` |
| R04-LIVE（依赖 `SCAFFOLD-COMMITTED`） | `insufficient-evidence` | snapshot/live 仅在 union 与数组拼接层汇合，item 生命周期未统一，组合 selector 无 production 引用。 | 被 RA-04-001 覆盖 | `liveEventHandling.ts:16-55,77-125,152-156`；`liveEventHandling.test.ts:74-234` |
| R04-TIMELINE-OWNER（依赖 `R04-SNAPSHOT,R04-LIVE`） | `complete` | production bridge 直接投递 runtime actions，transcript state 投影后由 UI selector 消费，完全绕过 timeline-material 管道。 | RA-04-001；确认重构点，P2 | `GuiHostConnectionBridge.tsx:17-25,61-70,91-106`；`transcriptStateSlice.ts:2-8,82-98,137-143`；`CommittedTranscriptSurface.tsx:3-13,265-276` |

## Findings

状态：完成。

### RA-04-001 未接入 production 的 timeline-material 并行管道

- **Finding ID：** `RA-04-001`。
- **主报告：** `04-timeline-materials-and-domain-models.md`。
- **Evidence owner：** `04-timeline-materials-and-domain-models.md`。
- **状态：** 确认重构点。
- **重构优先级：** P2。
- **结论摘要：** `snapshotReplay` 与 `liveEventHandling` 定义了 snapshot/live materials、selector、组合 union 与测试，但 production bridge → thread runtime actions → transcript state → UI 路径完全绕过该管道。两类 materials 只在类型 union 和数组拼接层汇合，item 生命周期并未统一；这是未接入 production 的并行抽象，不是已复现功能 bug。
- **当前 owner 与当前职责：** `snapshotReplay.ts` 从 runtime snapshot turns 构造 snapshot materials；`liveEventHandling.ts` 从 runtime event buffer 构造 live/subscription materials，并拥有跨来源 `TimelineMaterial` 与 `selectThreadTimelineMaterials`。实际 production 投影由 `transcriptState` 直接消费 thread runtime actions，UI 直接读取 transcript selectors。
- **问题类型：** 无 production 消费者的并行领域管道、来源特定模块拥有跨来源组合类型、测试维持未接入抽象；不是 transcript projection、rendering 或 runtime action 行为错误。
- **影响文件、定义侧、构造方、调用方和消费方：**
  - 定义与构造侧：`codex-gui/src/features/snapshotReplay/snapshotReplay.ts:8-29,54-97`；`codex-gui/src/features/liveEventHandling/liveEventHandling.ts:16-55,77-156`。
  - 测试消费方：`snapshotReplay/__tests__/snapshotReplay.test.ts:57-212` 与 `liveEventHandling/__tests__/liveEventHandling.test.ts:74-234` 直接消费材料 builder/selector；`App.browser.test.tsx:38-41,288-289,444-447,771,793-794` 仅包含 snapshot/live selector 测试断言。
  - production 调用方核对：`codex-gui/src` 对 `TimelineMaterial`、`selectThreadTimelineMaterials` 及相关 selector 的引用搜索未发现 production consumer。
  - 实际 production 路径：`GuiHostConnectionBridge.tsx:17-25,61-70,91-106` 投递 runtime actions；`transcriptStateSlice.ts:2-8,82-98,137-143` 直接消费这些 actions；`CommittedTranscriptSurface.tsx:3-13,265-276` 与 `useCommittedTranscriptStickyBottom.ts:2-6` 直接消费 transcript selectors。
- **共同语义或变化原因：** snapshot/live materials 都试图表达 Turn/item 时间线输入，但 snapshot 使用 `itemReplayed`，live 保留 `itemStarted`/`itemCompleted`，且 snapshot `turnStarted` 同时携带完整 `Turn.items`；当前共同语义不足以支持稳定 production 契约。实际 transcript projection 与这些 materials 有相似输入，却由独立 action 路径驱动。
- **推荐边界、建议 owner 和允许的依赖方向：** 保持现有 `transcriptState` 作为实际 transcript 投影 owner，删除或收缩未接入的 snapshot/live material 类型、selector 与组合管道。不要为当前 union 新建中立 timeline 模块；若未来要把 production 迁移到统一 materials，必须另行设计并验证 snapshot、event、delta 与 subscription 语义。
- **预期收益：** 移除无 production 消费者的并行抽象和误导性 owner，减少重复领域表示、测试维护与后续重构入口歧义，使实际投影事实来源继续集中在 transcript state。
- **建议变更范围、最小可审查批次和明确排除范围：** 最小批次只涉及 `snapshotReplay/**`、`liveEventHandling/**` 及 `App.browser.test.tsx` 中专属于这些 selector 的测试断言；删除或收缩未接入的类型、builder、selector 与专属测试。明确排除 `threadRuntime` action/state、`transcriptState` 投影行为、Committed Transcript rendering、Markdown、scroll 与 UI 行为修改。
- **风险：** 删除时可能遗漏测试或未来迁移意图对导出符号的依赖；若误把当前 union 当成稳定语义迁移 production，可能固化完整 `Turn.items` 与 `itemReplayed` 的重复表示，并丢失 live item/delta 生命周期信息。
- **后续实施时建议的验证范围：** 核对 production 引用仍为零，移除或更新 snapshot/live 专属测试与 App browser 断言，并运行受影响的针对性 GUI 测试；确认 thread runtime、transcript state 与 committed transcript 行为无变更。本轮未运行测试。
- **关键证据：** `snapshotReplay.ts:8-29,54-97`；`liveEventHandling.ts:16-55,77-156`；两者专属测试；`GuiHostConnectionBridge.tsx:17-25,61-70,91-106`；`transcriptStateSlice.ts:2-8,82-98,137-143`；`CommittedTranscriptSurface.tsx:3-13,265-276`；`codex-gui/src` production 引用核对。
- **关联的既有报告、issue 或专项设计：** [RA-03-001](./03-projection-ingress-and-thread-runtime.md#ra-03-001) 拥有 Bridge → runtime actions 的 application coordination；本 finding 仅使用 production 路径绕过 timeline materials 的交界事实，不复制 Bridge 或 transcript reducer 证据。无关联 issue 或专项设计。
- **已排除项：** 不把 `transcriptState` 直接投影判为错误 owner；不声称当前 materials 已造成用户可见重复渲染；不进入 transcript reducer、delta 算法、Markdown 或 rendering 重设计；不建议在本 finding 内统一迁移 production。
- **报告建议：** 保留为 `RA-04-001`、状态“确认重构点”、优先级 P2；后续最小批次优先删除或收缩未接入管道，而不是新建中立 timeline 抽象。

## 已排除项

状态：完成。

- 已排除 production transcript/UI 消费 timeline materials：全局引用核对只发现定义与测试消费。
- 已排除 snapshot 构造顺序不稳定：专属测试覆盖多 Turn、多 item、in-progress Turn 与 live event buffer 隔离。
- 已排除当前存在用户可见重复消费：production UI 直接读取 transcript selectors，没有经过 `selectThreadTimelineMaterials`。
- 明确排除 thread runtime、transcript projection、Markdown、rendering 与 scroll 行为调整。

## 风险

状态：完成。

- 收缩未接入管道时需避免误改 production runtime/transcript 路径或扩大为统一 timeline 迁移。
- 当前 union 不能作为未来迁移设计的既定契约；snapshot 完整 `Turn.items`、`itemReplayed` 与 live item/delta 生命周期必须重新设计和验证。
